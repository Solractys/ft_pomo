"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Copy, Play, Pause, RotateCcw, Plus, Settings } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type SessionState = "idle" | "running" | "paused"
type SessionType = "work" | "break" | "long_break"

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

const WORK_TIME = 25 * 60 // 25 minutes
const BREAK_TIME = 5 * 60 // 5 minutes
const LONG_BREAK_TIME = 15 * 60 // 15 minutes

export function PomodoroTimer() {
  const [sessionKey, setSessionKey] = useState("")
  const [userName, setUserName] = useState("")
  const [currentSession, setCurrentSession] = useState<PomodoroSession | null>(null)
  const [participants, setParticipants] = useState<SessionParticipant[]>([])
  const [isJoined, setIsJoined] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [workMinutes, setWorkMinutes] = useState(25)
  const [breakMinutes, setBreakMinutes] = useState(5)
  const { toast } = useToast()
  const supabase = createClient()
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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

    const shareUrl = `${window.location.origin}?session=${newKey}`
    await navigator.clipboard.writeText(shareUrl)

    toast({
      title: "Session Created",
      description: "Link copied to clipboard!",
    })

    setSessionKey(newKey)
  }

  const joinSession = async () => {
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
      toast({
        title: "Session Not Found",
        description: "Please check the session key and try again",
        variant: "destructive",
      })
      return
    }

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

    setCurrentSession(session)
    setIsJoined(true)
    setWorkMinutes(Math.floor(session.work_duration / 60))
    setBreakMinutes(Math.floor(session.break_duration / 60))

    toast({
      title: "Joined Session",
      description: `Welcome, ${userName}!`,
    })
  }

  const startTimer = async () => {
    if (!currentSession) return

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

    await supabase.from("pomodoro_sessions").update({ state: "paused" }).eq("id", currentSession.id)
  }

  const resetTimer = async () => {
    if (!currentSession) return

    const resetTime =
      currentSession.session_type === "work" ? currentSession.work_duration : currentSession.break_duration

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

  useEffect(() => {
    if (!currentSession || currentSession.state !== "running") {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    timerRef.current = setInterval(async () => {
      if (currentSession.time_remaining <= 1) {
        clearInterval(timerRef.current!)

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
          })
          .eq("id", currentSession.id)

        toast({
          title: "Time's Up!",
          description: currentSession.session_type === "work" ? "Time for a break!" : "Back to work!",
        })
      } else {
        await supabase
          .from("pomodoro_sessions")
          .update({
            time_remaining: currentSession.time_remaining - 1,
          })
          .eq("id", currentSession.id)
      }
    }, 1000)

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
          console.log("[v0] Session update:", payload)
          if (payload.new) {
            setCurrentSession(payload.new as PomodoroSession)
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
    if (urlSessionKey) {
      setSessionKey(urlSessionKey)
    }
  }, [])

  if (!isJoined) {
    return (
      <div className="w-full max-w-md space-y-8">
        <div className="absolute top-6 right-6">
          <Button
            onClick={createNewSession}
            variant="outline"
            className="gap-2 border-black hover:bg-black hover:text-white bg-transparent"
          >
            <Plus className="h-4 w-4" />
            Create Session
          </Button>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-black">POMODORO</h1>
          <p className="text-sm text-black/60">Synchronized timer sessions</p>
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
              placeholder="Enter your name"
              className="border-black rounded-none text-black placeholder:text-black/40"
            />
          </div>

          <Button
            onClick={joinSession}
            className="w-full bg-black text-white hover:bg-black/90 rounded-none h-12 font-medium"
          >
            Join Session
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl space-y-8">
      <div className="absolute top-6 right-6 flex items-center gap-4">
        <div className="text-right">
          <p className="text-xs text-black/60">Session Key</p>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono font-bold text-black">{currentSession?.session_key}</code>
            <Button
              onClick={async () => {
                const shareUrl = `${window.location.origin}?session=${currentSession?.session_key}`
                await navigator.clipboard.writeText(shareUrl)
                toast({ title: "Copied!", description: "Link copied to clipboard" })
              }}
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-black/10"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      <div className="text-center space-y-12">
        <div className="space-y-4">
          <h1 className="text-9xl font-bold font-mono tracking-tighter text-black tabular-nums">
            {formatTime(currentSession?.time_remaining || 0)}
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
            onClick={() => setShowSettings(!showSettings)}
            size="lg"
            variant="outline"
            className="h-16 w-16 rounded-full border-2 border-black hover:bg-black hover:text-white p-0 bg-transparent"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>

        <Button
          onClick={switchSessionType}
          variant="outline"
          className="border-black hover:bg-black hover:text-white bg-transparent px-8 h-10"
        >
          Switch to {currentSession?.session_type === "work" ? "Break" : "Work"}
        </Button>

        {showSettings && (
          <Card className="p-6 border-2 border-black shadow-none rounded-none">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-black">Timer Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="work-minutes-update" className="text-xs text-black/60">
                    Work Duration (minutes)
                  </label>
                  <Input
                    id="work-minutes-update"
                    type="number"
                    min="1"
                    max="60"
                    value={workMinutes}
                    onChange={(e) => setWorkMinutes(Number.parseInt(e.target.value) || 25)}
                    className="border-black rounded-none text-black"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="break-minutes-update" className="text-xs text-black/60">
                    Break Duration (minutes)
                  </label>
                  <Input
                    id="break-minutes-update"
                    type="number"
                    min="1"
                    max="30"
                    value={breakMinutes}
                    onChange={(e) => setBreakMinutes(Number.parseInt(e.target.value) || 5)}
                    className="border-black rounded-none text-black"
                  />
                </div>
              </div>
              <Button
                onClick={updateDurations}
                className="w-full bg-black text-white hover:bg-black/90 rounded-none h-10 font-medium"
              >
                Update Durations
              </Button>
            </div>
          </Card>
        )}

        {participants.length > 0 && (
          <div className="pt-8 border-t-2 border-black/10">
            <p className="text-xs uppercase tracking-widest text-black/40 mb-3 font-medium">
              Active Participants ({participants.length})
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {participants.map((p, i) => (
                <span key={i} className="px-3 py-1 bg-black text-white text-sm font-medium">
                  {p.user_name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
