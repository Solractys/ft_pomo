"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, Check, Copy, LogOut, Pause, Play, RotateCcw, Settings, Wifi, WifiOff } from "lucide-react"
import { createRoom, getRoom, roomSocketUrl } from "@/lib/pomodoro/api"
import { getRealtimeToken } from "@/lib/auth/token"
import type { RoomCommand, RoomSnapshot, ServerMessage } from "@/lib/pomodoro/types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"

type Screen = "choice" | "join" | "created" | "loading" | "room"
type Connection = "connecting" | "connected" | "offline"

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`
}

export function PomodoroTimer({ userName }: { userName: string }) {
  const [screen, setScreen] = useState<Screen>("choice")
  const [key, setKey] = useState("")
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [displayMs, setDisplayMs] = useState(0)
  const [clockOffset, setClockOffset] = useState(0)
  const [connection, setConnection] = useState<Connection>("offline")
  const [showSettings, setShowSettings] = useState(false)
  const [workMinutes, setWorkMinutes] = useState(25)
  const [breakMinutes, setBreakMinutes] = useState(5)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const connectRef = useRef<(roomKey: string, userName: string) => void>(() => undefined)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempt = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const previousRoomRef = useRef<RoomSnapshot | null>(null)
  const intentionalClose = useRef(false)
  const { toast } = useToast()

  useEffect(() => {
    audioRef.current = new Audio("/notification.mp3")
    return () => {
      intentionalClose.current = true
      audioRef.current?.pause()
      socketRef.current?.close()
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
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
      const message = snapshot.phase === "break" ? "Hora da pausa." : "De volta ao foco."
      toast({ title: "Tempo encerrado!", description: message })
      if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification("FT_POMODORO", { body: message })
    }
    previousRoomRef.current = snapshot
  }, [toast])

  const connect = useCallback(async (roomKey: string, userName: string) => {
    intentionalClose.current = false
    socketRef.current?.close()
    setConnection("connecting")
    let socket: WebSocket
    try {
      const token = await getRealtimeToken()
      const socketOptions = roomSocketUrl(roomKey, token)
      socket = new WebSocket(socketOptions.url, socketOptions.protocols)
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
      reconnectRef.current = setTimeout(() => connectRef.current(roomKey, userName), delay)
    }
  }, [applySnapshot, toast])

  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const queryKey = params.get("session")?.toUpperCase()
    if (!queryKey || !/^[A-Z0-9]{6}$/.test(queryKey)) return

    let cancelled = false
    const timeout = window.setTimeout(() => {
      setKey(queryKey)
      if (params.get("return") !== "room") {
        setScreen("join")
        return
      }

      setScreen("loading")
      getRoom(queryKey).then((snapshot) => {
        if (cancelled) return
        applySnapshot(snapshot)
        setScreen("room")
        connect(queryKey, userName)
      }).catch((error: unknown) => {
        if (cancelled) return
        setScreen("join")
        toast({ title: "Não foi possível voltar à sala", description: error instanceof Error ? error.message : "Confira se a sala ainda está ativa.", variant: "destructive" })
      })
    }, 0)
    return () => { cancelled = true; window.clearTimeout(timeout) }
  }, [applySnapshot, connect, toast, userName])

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
    if (normalizedKey.length !== 6) {
      toast({ title: "Chave inválida", description: "Informe a chave de 6 caracteres.", variant: "destructive" })
      return
    }
    try {
      const snapshot = await getRoom(normalizedKey)
      applySnapshot(snapshot)
      setKey(normalizedKey)
      history.replaceState(null, "", `/?session=${normalizedKey}`)
      setScreen("room")
      connect(normalizedKey, userName)
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

  const enableNotifications = async () => {
    if (!("Notification" in window)) {
      toast({ title: "Notificações indisponíveis", description: "Este navegador não oferece notificações de desktop." })
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationsEnabled(permission === "granted")
    toast({ title: permission === "granted" ? "Notificações ativadas" : "Permissão não concedida" })
  }

  if (screen === "choice") return (
    <Shell title="FT_POMODORO" subtitle="Timer sincronizado para focar junto.">
      <Link href="/profile" className="block text-center text-sm text-muted-foreground underline underline-offset-4">Meu perfil</Link>
      <Button onClick={() => setScreen("join")} className="h-14 w-full text-lg">Entrar em uma sala</Button>
      <Button onClick={handleCreate} variant="outline" className="h-14 w-full text-lg">Criar nova sala</Button>
    </Shell>
  )

  if (screen === "join") return (
    <Shell title="ENTRAR NA SALA" subtitle="Informe a chave compartilhada.">
      <Field label="Chave da sala"><Input value={key} onChange={(event) => setKey(event.target.value.toUpperCase())} maxLength={6} className="font-mono text-center text-xl tracking-widest" autoFocus /></Field>
      <p className="text-xs text-muted-foreground">Entrando como {userName}</p>
      <div className="flex gap-3"><Button onClick={() => setScreen("choice")} variant="outline" className="min-h-11 flex-1"><ArrowLeft />Voltar</Button><Button onClick={handleJoin} className="min-h-11 flex-1">Entrar</Button></div>
    </Shell>
  )

  if (screen === "created") return (
    <Shell title="SALA CRIADA" subtitle="Compartilhe a chave com seus amigos.">
      <Button onClick={copyLink} variant="outline" className="h-auto w-full justify-center py-4 font-mono text-3xl font-bold tracking-widest">{key}<Copy className="h-4 w-4" /><span className="sr-only">Copiar link da sala</span></Button>
      <p className="text-center text-xs text-muted-foreground">Entrando como {userName}</p>
      <Button onClick={() => setScreen("choice")} variant="ghost" className="w-full"><ArrowLeft />Voltar</Button>
      <Button onClick={handleJoin} className="h-12 w-full">Iniciar sessão</Button>
    </Shell>
  )

  if (screen === "loading") return (
    <Shell title="VOLTANDO À SALA" subtitle="Reconectando sua sessão…">
      <p role="status" className="text-center text-sm text-muted-foreground">Aguarde um instante.</p>
    </Shell>
  )

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-10 bg-background p-4 pt-20 text-foreground sm:pt-24">
      <div className="absolute right-5 top-5 flex items-center gap-4">
        <Link href={`/profile?session=${key}`} className="hidden text-sm underline underline-offset-4 sm:inline">Meu perfil</Link>
        <div className="text-right"><p className="text-xs text-muted-foreground">Sala</p><button onClick={copyLink} aria-label={`Copiar link da sala ${key}`} className="flex min-h-11 items-center gap-2 font-mono font-bold">{key}<Copy className="h-3 w-3" /></button></div>
        <span title={connection === "connected" ? "Conectado" : connection === "connecting" ? "Conectando" : "Sem conexão"} aria-label={connection === "connected" ? "Conectado" : connection === "connecting" ? "Conectando" : "Sem conexão"} className={connection === "connected" ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}>{connection === "connected" ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}</span>
      </div>
      <section className="space-y-10 text-center">
        <div><h1 className="font-mono text-7xl font-bold tabular-nums tracking-tighter sm:text-9xl">{formatTime(displayMs)}</h1><p className="mt-3 text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">{room?.phase === "work" ? "foco" : "pausa"}</p></div>
        <div className="flex justify-center gap-4">
          <Button aria-label={room?.status === "running" ? "Pausar timer" : "Iniciar timer"} onClick={() => send({ type: room?.status === "running" ? "pause" : "start" })} className="h-16 w-16 rounded-full p-0">{room?.status === "running" ? <Pause /> : <Play className="ml-1" />}</Button>
          <Button aria-label="Reiniciar timer" onClick={() => send({ type: "reset" })} variant="outline" className="h-16 w-16 rounded-full p-0"><RotateCcw /></Button>
          <Button aria-label="Alternar entre foco e pausa" onClick={() => send({ type: "switch" })} variant="outline" className="h-16 w-16 rounded-full p-0"><Check /></Button>
        </div>
      </section>
      <div className="flex flex-wrap justify-center gap-2"><Button onClick={() => setShowSettings(true)} variant="outline" className="min-h-11"><Settings className="h-4 w-4" />Configurações</Button><Button onClick={leave} variant="outline" className="min-h-11"><LogOut className="h-4 w-4" />Sair da sala</Button><Link href={`/profile?session=${key}`} className="inline-flex min-h-11 items-center rounded-md px-3 text-sm underline underline-offset-4 sm:hidden">Meu perfil</Link></div>
      {!!room?.participants.length && <section aria-label="Participantes" className="space-y-3"><p className="text-center text-xs text-muted-foreground">Participantes ({room.participants.length})</p><div className="flex flex-wrap justify-center gap-4">{room.participants.map((participant) => <ParticipantAvatar key={participant.id} name={participant.name} image={participant.image} animate={room.status === "running" && room.phase === "work"} />)}</div></section>}
      {showSettings && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSettings(false) }}><Card role="dialog" aria-modal="true" aria-labelledby="settings-title" className="w-full max-w-md space-y-5 p-6"><h2 id="settings-title" className="text-lg font-bold">Configurações</h2><Field label="Foco (minutos)"><Input type="number" min={1} max={120} value={workMinutes} onChange={(event) => setWorkMinutes(Math.max(1, Number(event.target.value)))} /></Field><Field label="Pausa (minutos)"><Input type="number" min={1} max={60} value={breakMinutes} onChange={(event) => setBreakMinutes(Math.max(1, Number(event.target.value)))} /></Field><Button onClick={enableNotifications} variant="outline" className="w-full">{notificationsEnabled ? "Notificações ativadas" : "Ativar notificações de desktop"}</Button><div className="flex gap-3"><Button onClick={() => setShowSettings(false)} variant="outline" className="min-h-11 flex-1">Fechar</Button><Button onClick={() => { send({ type: "settings", workDurationMs: workMinutes * 60_000, breakDurationMs: breakMinutes * 60_000 }); setShowSettings(false) }} className="min-h-11 flex-1">Salvar</Button></div></Card></div>}
    </main>
  )
}

function ParticipantAvatar({ name, image, animate }: { name: string; image?: string; animate: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase()
  const [imageFailed, setImageFailed] = useState(false)

  return <div className="flex min-w-20 flex-col items-center gap-2" title={name}>
    <div className={`participant-avatar-frame ${animate ? "participant-avatar-focus" : ""}`}>
      <div className="participant-avatar">
        {image && !imageFailed
          // Google avatar hosts vary by account, so render their URL directly instead of requiring a fixed image-host allowlist.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={image} alt={name} className="size-full rounded-full object-cover" onError={() => setImageFailed(true)} />
          : <span role="img" aria-label={`Avatar de ${name}`} className="flex size-full items-center justify-center rounded-full text-sm font-semibold text-foreground">{initials || "?"}</span>}
      </div>
    </div>
    <span className="max-w-24 truncate text-xs text-muted-foreground">{name}</span>
  </div>
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="w-full max-w-md space-y-7 text-foreground"><header className="space-y-2 text-center"><h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1><p className="text-sm text-muted-foreground">{subtitle}</p></header><Card className="space-y-5 p-7 shadow-none">{children}</Card></div>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-2"><span className="text-sm font-medium">{label}</span>{children}</label>
}
