"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Check, Copy, LogOut, Pause, Play, RotateCcw, Settings, Wifi, WifiOff } from "lucide-react"
import { createRoom, getRoom, roomSocketUrl } from "@/lib/pomodoro/api"
import type { RoomCommand, RoomSnapshot, ServerMessage } from "@/lib/pomodoro/types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"

type Screen = "choice" | "join" | "created" | "room"
type Connection = "connecting" | "connected" | "offline"
const STORAGE_KEY = "ft-pomo-participant"

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`
}

function participantId() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) return saved
  const value = crypto.randomUUID()
  localStorage.setItem(STORAGE_KEY, value)
  return value
}

export function PomodoroTimer() {
  const [screen, setScreen] = useState<Screen>("choice")
  const [key, setKey] = useState("")
  const [name, setName] = useState("")
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [displayMs, setDisplayMs] = useState(0)
  const [clockOffset, setClockOffset] = useState(0)
  const [connection, setConnection] = useState<Connection>("offline")
  const [showSettings, setShowSettings] = useState(false)
  const [workMinutes, setWorkMinutes] = useState(25)
  const [breakMinutes, setBreakMinutes] = useState(5)
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempt = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const previousRoomRef = useRef<RoomSnapshot | null>(null)
  const intentionalClose = useRef(false)
  const { toast } = useToast()

  useEffect(() => {
    audioRef.current = new Audio("/notification.mp3")
    return () => {
      audioRef.current?.pause()
      socketRef.current?.close()
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
    }
  }, [])

  useEffect(() => {
    const queryKey = new URLSearchParams(window.location.search).get("session")
    if (queryKey) {
      setKey(queryKey.toUpperCase())
      setScreen("join")
    }
  }, [])

  useEffect(() => {
    if (!room) return
    const update = () => {
      const now = Date.now() + clockOffset
      setDisplayMs(room.status === "running" && room.endsAt ? Math.max(0, room.endsAt - now) : room.remainingMs)
    }
    update()
    if (room.status !== "running") return
    const interval = setInterval(update, 250)
    return () => clearInterval(interval)
  }, [room, clockOffset])

  const applySnapshot = useCallback((snapshot: RoomSnapshot) => {
    const previous = previousRoomRef.current
    setClockOffset(snapshot.serverNow - Date.now())
    setRoom(snapshot)
    setWorkMinutes(snapshot.workDurationMs / 60_000)
    setBreakMinutes(snapshot.breakDurationMs / 60_000)
    if (previous?.status === "running" && snapshot.status === "idle" && previous.version !== snapshot.version) {
      audioRef.current?.play().catch(() => undefined)
      toast({ title: "Tempo encerrado!", description: snapshot.phase === "break" ? "Hora da pausa." : "De volta ao foco." })
    }
    previousRoomRef.current = snapshot
  }, [toast])

  const connect = useCallback((roomKey: string, userName: string) => {
    intentionalClose.current = false
    socketRef.current?.close()
    setConnection("connecting")
    let socket: WebSocket
    try {
      socket = new WebSocket(roomSocketUrl(roomKey, participantId(), userName))
    } catch (error) {
      setConnection("offline")
      toast({ title: "Configuração incompleta", description: error instanceof Error ? error.message : "Não foi possível conectar", variant: "destructive" })
      return
    }
    socketRef.current = socket
    socket.onopen = () => {
      reconnectAttempt.current = 0
      setConnection("connected")
    }
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage
      if (message.type === "snapshot") applySnapshot(message.room)
      else toast({ title: "Não foi possível executar", description: message.message, variant: "destructive" })
    }
    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null
      setConnection("offline")
      if (intentionalClose.current) return
      const delay = Math.min(10_000, 500 * 2 ** reconnectAttempt.current) + Math.random() * 300
      reconnectAttempt.current += 1
      reconnectRef.current = setTimeout(() => connect(roomKey, userName), delay)
    }
  }, [applySnapshot, toast])

  const send = (command: RoomCommand) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      toast({ title: "Sem conexão", description: "Aguarde a reconexão antes de alterar o timer.", variant: "destructive" })
      return
    }
    socketRef.current.send(JSON.stringify(command))
  }

  const handleCreate = async () => {
    try {
      const created = await createRoom()
      setKey(created.key)
      setRoom(created)
      setScreen("created")
      await navigator.clipboard.writeText(`${window.location.origin}?session=${created.key}`).catch(() => undefined)
      toast({ title: "Sala criada", description: "Link copiado para a área de transferência." })
    } catch (error) {
      toast({ title: "Não foi possível criar a sala", description: error instanceof Error ? error.message : "Erro inesperado", variant: "destructive" })
    }
  }

  const handleJoin = async () => {
    const normalizedKey = key.trim().toUpperCase()
    const normalizedName = name.trim()
    if (normalizedKey.length !== 6 || !normalizedName) {
      toast({ title: "Dados incompletos", description: "Informe a chave de 6 caracteres e seu nome.", variant: "destructive" })
      return
    }
    try {
      const snapshot = await getRoom(normalizedKey)
      applySnapshot(snapshot)
      setKey(normalizedKey)
      setName(normalizedName)
      setScreen("room")
      connect(normalizedKey, normalizedName)
    } catch (error) {
      toast({ title: "Sala não encontrada", description: error instanceof Error ? error.message : "Confira a chave.", variant: "destructive" })
    }
  }

  const leave = () => {
    intentionalClose.current = true
    if (reconnectRef.current) clearTimeout(reconnectRef.current)
    socketRef.current?.close()
    socketRef.current = null
    setRoom(null)
    setScreen("choice")
    setConnection("offline")
    history.replaceState(null, "", window.location.pathname)
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}?session=${key}`)
    toast({ title: "Link copiado" })
  }

  if (screen === "choice") return (
    <Shell title="FT_POMODORO" subtitle="Timer sincronizado para focar junto.">
      <Button onClick={() => setScreen("join")} className="h-14 w-full rounded-none bg-black text-lg">Entrar em uma sala</Button>
      <Button onClick={handleCreate} variant="outline" className="h-14 w-full rounded-none border-2 border-black text-lg">Criar nova sala</Button>
    </Shell>
  )

  if (screen === "join") return (
    <Shell title="ENTRAR NA SALA" subtitle="Informe a chave compartilhada.">
      <Field label="Chave da sala"><Input value={key} onChange={(event) => setKey(event.target.value.toUpperCase())} maxLength={6} className="rounded-none border-black" autoFocus /></Field>
      <Field label="Seu nome"><Input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && handleJoin()} maxLength={40} className="rounded-none border-black" /></Field>
      <div className="flex gap-3"><Button onClick={() => setScreen("choice")} variant="outline" className="flex-1 rounded-none border-black">Voltar</Button><Button onClick={handleJoin} className="flex-1 rounded-none bg-black">Entrar</Button></div>
    </Shell>
  )

  if (screen === "created") return (
    <Shell title="SALA CRIADA" subtitle="Compartilhe a chave com seus amigos.">
      <button onClick={copyLink} className="flex w-full items-center justify-center gap-3 border-2 border-black bg-black/5 p-4 font-mono text-3xl font-bold tracking-widest">{key}<Copy className="h-4 w-4" /></button>
      <Field label="Seu nome"><Input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && handleJoin()} maxLength={40} className="rounded-none border-black" autoFocus /></Field>
      <Button onClick={handleJoin} className="h-12 w-full rounded-none bg-black">Iniciar sessão</Button>
    </Shell>
  )

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-10 bg-white p-4 text-black">
      <div className="absolute right-5 top-5 flex items-center gap-4">
        <div className="text-right"><p className="text-xs text-black/50">Sala</p><button onClick={copyLink} className="flex items-center gap-2 font-mono font-bold">{key}<Copy className="h-3 w-3" /></button></div>
        <span title={connection} className={connection === "connected" ? "text-green-700" : "text-amber-600"}>{connection === "connected" ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}</span>
      </div>
      <section className="space-y-10 text-center">
        <div><h1 className="font-mono text-7xl font-bold tabular-nums tracking-tighter sm:text-9xl">{formatTime(displayMs)}</h1><p className="mt-3 text-sm font-medium uppercase tracking-[0.3em] text-black/55">{room?.phase === "work" ? "foco" : "pausa"}</p></div>
        <div className="flex justify-center gap-4">
          <Button onClick={() => send({ type: room?.status === "running" ? "pause" : "start" })} className="h-16 w-16 rounded-full bg-black p-0">{room?.status === "running" ? <Pause fill="white" /> : <Play className="ml-1" fill="white" />}</Button>
          <Button onClick={() => send({ type: "reset" })} variant="outline" className="h-16 w-16 rounded-full border-2 border-black p-0"><RotateCcw /></Button>
          <Button onClick={() => send({ type: "switch" })} variant="outline" className="h-16 w-16 rounded-full border-2 border-black p-0"><Check /></Button>
        </div>
      </section>
      <div className="flex gap-2"><Button onClick={() => setShowSettings(true)} variant="outline" size="icon" className="border-2 border-black"><Settings className="h-4 w-4" /></Button><Button onClick={leave} variant="outline" size="icon" className="border-2 border-black"><LogOut className="h-4 w-4" /></Button></div>
      {!!room?.participants.length && <Card className="border-0 p-5 shadow-none"><p className="mb-3 text-center text-xs text-black/50">Participantes ({room.participants.length})</p><div className="flex flex-wrap justify-center gap-2">{room.participants.map((participant) => <span key={participant} className="bg-black/5 px-3 py-1 text-sm">{participant}</span>)}</div></Card>}
      {showSettings && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><Card className="w-full max-w-md space-y-5 rounded-none p-6"><h2 className="text-lg font-bold">Duração do timer</h2><Field label="Foco (minutos)"><Input type="number" min={1} max={120} value={workMinutes} onChange={(event) => setWorkMinutes(Math.max(1, Number(event.target.value)))} className="rounded-none border-black" /></Field><Field label="Pausa (minutos)"><Input type="number" min={1} max={60} value={breakMinutes} onChange={(event) => setBreakMinutes(Math.max(1, Number(event.target.value)))} className="rounded-none border-black" /></Field><div className="flex gap-3"><Button onClick={() => setShowSettings(false)} variant="outline" className="flex-1 rounded-none border-black">Cancelar</Button><Button onClick={() => { send({ type: "settings", workDurationMs: workMinutes * 60_000, breakDurationMs: breakMinutes * 60_000 }); setShowSettings(false) }} className="flex-1 rounded-none bg-black">Salvar</Button></div></Card></div>}
    </main>
  )
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="w-full max-w-md space-y-7"><header className="space-y-2 text-center"><h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1><p className="text-sm text-black/55">{subtitle}</p></header><Card className="space-y-5 rounded-none border-2 border-black p-7 shadow-none">{children}</Card></div>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-2"><span className="text-sm font-medium">{label}</span>{children}</label>
}
