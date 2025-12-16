"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Copy, Play, Pause, RotateCcw, Settings, Check } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type SessionState = "idle" | "running" | "paused"
type SessionType = "work" | "break" | "long_break"
type FlowStep = "choice" | "join" | "create"

interface PomodoroSession {
  id: string
  session_key: string
  state: SessionState
  time_remaining: number
  session_type: SessionType
  started_at: string | null
  updated_at: string
  work_duration: number
  break_duration: number
}

interface SessionParticipant {
  user_name: string
}

const STORAGE_KEY = "pomodoro_session_data"

const saveSessionData = (sessionId: string, sessionKey: string, userName: string) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, sessionKey, userName }))
}

const getSessionData = () => {
  const data = localStorage.getItem(STORAGE_KEY)
  return data ? JSON.parse(data) : null
}

const clearSessionData = () => {
  localStorage.removeItem(STORAGE_KEY)
}

export function PomodoroTimer() {
  const [flowStep, setFlowStep] = useState<FlowStep>("choice")
  const [sessionKey, setSessionKey] = useState("")
  const [userName, setUserName] = useState("")
  const [currentSession, setCurrentSession] = useState<PomodoroSession | null>(null)
  const [displayTime, setDisplayTime] = useState<number>(0)
  const [participants, setParticipants] = useState<SessionParticipant[]>([])
  const [isJoined, setIsJoined] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [workMinutes, setWorkMinutes] = useState(25)
  const [breakMinutes, setBreakMinutes] = useState(5)
  const { toast } = useToast()
  const supabase = createClient()
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const isTimerController = useRef(false)

  useEffect(() => {
    audioRef.current = new Audio("/notification.mp3")
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const generateSessionKey = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  const createNewSession = async () => {
    const newKey = generateSessionKey()

    const { data, error } = await supabase
      .from("pomodoro_sessions")
      .insert({
        session_key: newKey,
        state: "idle",
        time_remaining: 25 * 60,
        session_type: "work",
        work_duration: 25 * 60,
        break_duration: 5 * 60,
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error creating session:", error)
      toast({
        title: "Error",
        description: "Failed to create session",
        variant: "destructive",
      })
      return
    }

    setSessionKey(newKey)
    setCurrentSession(data)
    setDisplayTime(data.time_remaining)
    setFlowStep("create")

    const shareUrl = `${window.location.origin}?session=${newKey}`
    await navigator.clipboard.writeText(shareUrl)

    toast({
      title: "Session Created",
      description: "Link copied to clipboard!",
    })
  }

  const joinSession = async (reconnecting = false) => {
    if (!sessionKey.trim() || !userName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter both session key and your name",
        variant: "destructive",
      })
      return
    }

    const { data: session, error: sessionError } = await supabase
      .from("pomodoro_sessions")
      .select("*")
      .eq("session_key", sessionKey.toUpperCase())
      .single()

    if (sessionError || !session) {
      if (reconnecting) {
        clearSessionData()
        toast({
          title: "Session Ended",
          description: "The session is no longer available",
          variant: "destructive",
        })
        return
      }
      toast({
        title: "Session Not Found",
        description: "Please check the session key and try again",
        variant: "destructive",
      })
      return
    }

    const { data: existingParticipants } = await supabase
      .from("session_participants")
      .select("user_name")
      .eq("session_id", session.id)
      .eq("user_name", userName.trim())

    if (!existingParticipants || existingParticipants.length === 0) {
      const { error: participantError } = await supabase.from("session_participants").insert({
        session_id: session.id,
        user_name: userName.trim(),
      })

      if (participantError) {
        console.error("[v0] Error joining session:", participantError)
        toast({
          title: "Error",
          description: "Failed to join session",
          variant: "destructive",
        })
        return
      }
    }

    saveSessionData(session.id, session.session_key, userName.trim())

    setCurrentSession(session)
    setDisplayTime(session.time_remaining)
    setIsJoined(true)
    setWorkMinutes(Math.floor(session.work_duration / 60))
    setBreakMinutes(Math.floor(session.break_duration / 60))

    if (!reconnecting) {
      toast({
        title: "Joined Session",
        description: `Welcome, ${userName}!`,
      })
    } else {
      toast({
        title: "Reconnected",
        description: "You've been reconnected to your session",
      })
    }
  }

  const startTimer = async () => {
    if (!currentSession) return

    isTimerController.current = true

    await supabase
      .from("pomodoro_sessions")
      .update({
        state: "running",
        started_at: new Date().toISOString(),
      })
      .eq("id", currentSession.id)
  }

  const pauseTimer = async () => {
    if (!currentSession) return

    const elapsed = currentSession.started_at
      ? Math.floor((Date.now() - new Date(currentSession.started_at).getTime()) / 1000)
      : 0
    const timeRemaining = Math.max(0, currentSession.time_remaining - elapsed)

    isTimerController.current = false

    await supabase
      .from("pomodoro_sessions")
      .update({
        state: "paused",
        time_remaining: timeRemaining,
      })
      .eq("id", currentSession.id)
  }

  const resetTimer = async () => {
    if (!currentSession) return

    const resetTime =
      currentSession.session_type === "work" ? currentSession.work_duration : currentSession.break_duration

    isTimerController.current = false

    await supabase
      .from("pomodoro_sessions")
      .update({
        state: "idle",
        time_remaining: resetTime,
        started_at: null,
      })
      .eq("id", currentSession.id)
  }

  const switchSessionType = async () => {
    if (!currentSession) return

    const newType: SessionType = currentSession.session_type === "work" ? "break" : "work"
    const newTime = newType === "work" ? currentSession.work_duration : currentSession.break_duration

    isTimerController.current = false

    await supabase
      .from("pomodoro_sessions")
      .update({
        session_type: newType,
        time_remaining: newTime,
        state: "idle",
        started_at: null,
      })
      .eq("id", currentSession.id)

    toast({
      title: "Session Switched",
      description: `Now in ${newType} mode`,
    })
  }

  const updateDurations = async () => {
    if (!currentSession) return

    const newWorkDuration = workMinutes * 60
    const newBreakDuration = breakMinutes * 60

    await supabase
      .from("pomodoro_sessions")
      .update({
        work_duration: newWorkDuration,
        break_duration: newBreakDuration,
        time_remaining:
          currentSession.state === "idle"
            ? currentSession.session_type === "work"
              ? newWorkDuration
              : newBreakDuration
            : currentSession.time_remaining,
      })
      .eq("id", currentSession.id)

    setShowSettings(false)
    toast({
      title: "Durations Updated",
      description: "Timer settings synced across all participants",
    })
  }

  const leaveSession = async () => {
    if (!currentSession || !userName) return

    const { error: participantError } = await supabase
      .from("session_participants")
      .delete()
      .eq("session_id", currentSession.id)
      .eq("user_name", userName)

    if (participantError) {
      console.error("[v0] Error leaving session:", participantError)
      toast({
        title: "Error",
        description: "Failed to leave session",
        variant: "destructive",
      })
      return
    }

    clearSessionData()
    setCurrentSession(null)
    setIsJoined(false)
    setFlowStep("choice")
    setSessionKey("")
    setUserName("")
    setParticipants([])

    toast({
      title: "Left Session",
      description: "You have left the Pomodoro session",
    })
  }

  useEffect(() => {
    if (!currentSession || currentSession.state !== "running") {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setDisplayTime(currentSession?.time_remaining || 0)
      return
    }

    const updateInterval = isTimerController.current ? 1000 : null

    timerRef.current = setInterval(async () => {
      if (!currentSession.started_at) return

      const elapsed = Math.floor((Date.now() - new Date(currentSession.started_at).getTime()) / 1000)
      const timeRemaining = Math.max(0, currentSession.time_remaining - elapsed)

      setDisplayTime(timeRemaining)

      if (timeRemaining <= 0 && isTimerController.current) {
        clearInterval(timerRef.current!)
        isTimerController.current = false

        if (audioRef.current) {
          try {
            audioRef.current.currentTime = 0
            await audioRef.current.play()
          } catch (err) {
            console.error("[v0] Audio play failed:", err)
          }
        }

        const nextType: SessionType = currentSession.session_type === "work" ? "break" : "work"
        const nextTime = nextType === "work" ? currentSession.work_duration : currentSession.break_duration

        await supabase
          .from("pomodoro_sessions")
          .update({
            state: "idle",
            time_remaining: nextTime,
            session_type: nextType,
            started_at: null,
          })
          .eq("id", currentSession.id)

        toast({
          title: "Time's Up!",
          description: currentSession.session_type === "work" ? "Time for a break!" : "Back to work!",
        })
      }
    }, 100)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [currentSession, supabase, toast])

  useEffect(() => {
    if (!currentSession) return

    const channel = supabase
      .channel(`session-${currentSession.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pomodoro_sessions",
          filter: `id=eq.${currentSession.id}`,
        },
        (payload) => {
          if (payload.new) {
            const newSession = payload.new as PomodoroSession
            setCurrentSession(newSession)

            if (newSession.state !== "running") {
              setDisplayTime(newSession.time_remaining)
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_participants",
          filter: `session_id=eq.${currentSession.id}`,
        },
        async () => {
          const { data } = await supabase
            .from("session_participants")
            .select("user_name")
            .eq("session_id", currentSession.id)

          if (data) {
            setParticipants(data)
          }
        },
      )
      .subscribe()

    supabase
      .from("session_participants")
      .select("user_name")
      .eq("session_id", currentSession.id)
      .then(({ data }) => {
        if (data) setParticipants(data)
      })

    return () => {
      channel.unsubscribe()
    }
  }, [currentSession, supabase])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlSessionKey = params.get("session")

    const savedData = getSessionData()

    if (savedData) {
      setSessionKey(savedData.sessionKey)
      setUserName(savedData.userName)
      joinSession(true)
    } else if (urlSessionKey) {
      setSessionKey(urlSessionKey)
      setFlowStep("join")
    }
  }, [])

  if (!isJoined && flowStep === "choice") {
    return (
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-6xl font-bold tracking-tight text-black">FT_POMODORO</h1>
          <p className="text-sm text-black/60">Synchronized timer sessions. Work together :D.</p>
          <i>by csilva-s</i>
        </div>

        <Card className="p-8 space-y-4 border-2 border-black shadow-none rounded-none">
          <Button
            onClick={() => setFlowStep("join")}
            className="w-full bg-black text-white hover:bg-black/90 rounded-none h-14 font-medium text-lg"
          >
            Join Session
          </Button>

          <Button
            onClick={createNewSession}
            variant="outline"
            className="w-full border-2 border-black hover:bg-black hover:text-white bg-transparent rounded-none h-14 font-medium text-lg"
          >
            Create New Session
          </Button>
        </Card>
      </div>
    )
  }

  if (!isJoined && flowStep === "join") {
    return (
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-black">JOIN SESSION</h1>
          <p className="text-sm text-black/60">Enter your details to join</p>
        </div>

        <Card className="p-8 space-y-6 border-2 border-black shadow-none rounded-none">
          <div className="space-y-2">
            <label htmlFor="session-key" className="text-sm font-medium text-black">
              Session Key
            </label>
            <Input
              id="session-key"
              value={sessionKey}
              onChange={(e) => setSessionKey(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  joinSession(false)
                }
              }}
              placeholder="Enter session key"
              className="border-black rounded-none text-black placeholder:text-black/40"
              maxLength={6}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="user-name" className="text-sm font-medium text-black">
              Your Name
            </label>
            <Input
              id="user-name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  joinSession(false)
                }
              }}
              placeholder="Enter your name"
              className="border-black rounded-none text-black placeholder:text-black/40"
            />
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => setFlowStep("choice")}
              variant="outline"
              className="flex-1 border-black hover:bg-black/10 bg-transparent rounded-none h-12 font-medium"
            >
              Back
            </Button>
            <Button
              onClick={() => joinSession(false)}
              className="flex-1 bg-black text-white hover:bg-black/90 rounded-none h-12 font-medium"
            >
              Join
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (!isJoined && flowStep === "create") {
    return (
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-black">SESSION CREATED</h1>
          <p className="text-sm text-black/60">Share this key with participants</p>
        </div>

        <Card className="p-8 space-y-6 border-2 border-black shadow-none rounded-none">
          <div className="space-y-2">
            <label className="text-sm font-medium text-black">Session Key</label>
            <div className="flex items-center gap-2 p-4 border-2 border-black bg-black/5">
              <code className="text-2xl font-mono font-bold text-black tracking-wider flex-1 text-center">
                {sessionKey}
              </code>
              <Button
                onClick={async () => {
                  const shareUrl = `${window.location.origin}?session=${sessionKey}`
                  await navigator.clipboard.writeText(shareUrl)
                  toast({ title: "Copied!", description: "Link copied to clipboard" })
                }}
                variant="ghost"
                size="icon"
                className="hover:bg-black/10"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="creator-name" className="text-sm font-medium text-black">
              Your Name
            </label>
            <Input
              id="creator-name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  joinSession(false)
                }
              }}
              placeholder="Enter your name"
              className="border-black rounded-none text-black placeholder:text-black/40"
            />
          </div>

          <Button
            onClick={() => joinSession(false)}
            className="w-full bg-black text-white hover:bg-black/90 rounded-none h-12 font-medium"
          >
            Start Session
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-4">
      <div className="fixed top-4 right-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowSettings(!showSettings)}
          className="border-2 border-black hover:bg-black hover:text-white transition-colors"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      <div className="text-center space-y-12">
        <div className="space-y-4">
          <h1 className="text-9xl font-bold font-mono tracking-tighter text-black tabular-nums">
            {formatTime(displayTime)}
          </h1>

          <p className="text-sm uppercase tracking-widest text-black/60 font-medium">
            {currentSession?.session_type.replace("_", " ")}
          </p>
        </div>

        <div className="flex items-center justify-center gap-4">
          {currentSession?.state === "running" ? (
            <Button onClick={pauseTimer} size="lg" className="h-16 w-16 rounded-full bg-black hover:bg-black/90 p-0">
              <Pause className="h-6 w-6" fill="white" />
            </Button>
          ) : (
            <Button onClick={startTimer} size="lg" className="h-16 w-16 rounded-full bg-black hover:bg-black/90 p-0">
              <Play className="h-6 w-6 ml-1" fill="white" />
            </Button>
          )}

          <Button
            onClick={resetTimer}
            size="lg"
            variant="outline"
            className="h-16 w-16 rounded-full border-2 border-black hover:bg-black hover:text-white p-0 bg-transparent"
          >
            <RotateCcw className="h-5 w-5" />
          </Button>

          <Button
            onClick={switchSessionType}
            variant="outline"
            className="h-16 w-16 rounded-full border-2 border-black hover:bg-black hover:text-white p-0 bg-transparent"
          >
            <Check className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button
            onClick={switchSessionType}
            variant="outline"
            className="border-black hover:bg-black hover:text-white bg-transparent rounded-none font-medium"
          >
            Switch to {currentSession?.session_type === "work" ? "Break" : "Work"}
          </Button>
          <Button
            onClick={leaveSession}
            variant="outline"
            className="border-black hover:bg-black hover:text-white bg-transparent rounded-none font-medium"
          >
            Leave Session
          </Button>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <Card className="w-full max-w-md mx-4 p-6 space-y-6 border-2 border-black shadow-none rounded-none">
            <h3 className="text-lg font-bold text-black">Timer Settings</h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="work-duration" className="text-sm font-medium text-black">
                  Work Duration (minutes)
                </label>
                <Input
                  id="work-duration"
                  type="number"
                  min="1"
                  max="120"
                  value={workMinutes}
                  onChange={(e) => setWorkMinutes(Math.max(1, Number.parseInt(e.target.value) || 1))}
                  className="border-black rounded-none"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="break-duration" className="text-sm font-medium text-black">
                  Break Duration (minutes)
                </label>
                <Input
                  id="break-duration"
                  type="number"
                  min="1"
                  max="60"
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(Math.max(1, Number.parseInt(e.target.value) || 1))}
                  className="border-black rounded-none"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowSettings(false)}
                variant="outline"
                className="flex-1 border-black hover:bg-black/10 bg-transparent rounded-none"
              >
                Cancel
              </Button>
              <Button onClick={updateDurations} className="flex-1 bg-black text-white hover:bg-black/90 rounded-none">
                Save Changes
              </Button>
            </div>
          </Card>
        </div>
      )}

      {participants.length > 0 && (
        <Card className="p-6 shadow-none border-none m-8">
          <h3 className="text-sm font-medium text-black/60 mb-3">Participants ({participants.length})</h3>
          <div className="flex flex-wrap gap-2">
            {participants.map((p, i) => (
              <div key={i} className="px-3 py-1 bg-black/5 text-sm text-black">
                {p.user_name}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
