"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Copy, Play, Pause, RotateCcw, Plus } from "lucide-react"
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
  const { toast } = useToast()
  const supabase = createClient()
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Format time for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  // Generate random session key
  const generateSessionKey = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  // Create new session
  const createNewSession = async () => {
    const newKey = generateSessionKey()

    const { data, error } = await supabase
      .from("pomodoro_sessions")
      .insert({
        session_key: newKey,
        state: "idle",
        time_remaining: WORK_TIME,
        session_type: "work",
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

  // Join session
  const joinSession = async () => {
    if (!sessionKey.trim() || !userName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter both session key and your name",
        variant: "destructive",
      })
      return
    }

    // Check if session exists
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

    // Add participant
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

    toast({
      title: "Joined Session",
      description: `Welcome, ${userName}!`,
    })
  }

  // Control timer
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

    const resetTime = currentSession.session_type === "work" ? WORK_TIME : BREAK_TIME

    await supabase
      .from("pomodoro_sessions")
      .update({
        state: "idle",
        time_remaining: resetTime,
        started_at: null,
      })
      .eq("id", currentSession.id)
  }

  // Local timer countdown
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

        // Timer completed
        await supabase
          .from("pomodoro_sessions")
          .update({
            state: "idle",
            time_remaining: 0,
          })
          .eq("id", currentSession.id)

        toast({
          title: "Time's Up!",
          description: currentSession.session_type === "work" ? "Take a break!" : "Back to work!",
        })
      } else {
        // Update time remaining
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

  // Subscribe to session changes
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
          // Refresh participants list
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

    // Load initial participants
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

  // Check for session key in URL
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
        </div>

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
