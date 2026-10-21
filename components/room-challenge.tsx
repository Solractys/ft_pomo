"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Check, LoaderCircle, RefreshCw, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createRoomChallenge, getRoomChallenge, type RoomChallenge as RoomChallengeData } from "@/lib/pomodoro/api"

function formatFocusTime(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60_000)
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return hours ? `${hours}h ${remainingMinutes}min` : `${remainingMinutes} min`
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).format(timestamp)
}

export function RoomChallenge({ initialRoomKey = "" }: { initialRoomKey?: string }) {
  const normalizedInitial = /^[A-Z0-9]{6}$/i.test(initialRoomKey) ? initialRoomKey.toUpperCase() : ""
  const [roomKey, setRoomKey] = useState(normalizedInitial)
  const [loadedRoomKey, setLoadedRoomKey] = useState("")
  const [challenge, setChallenge] = useState<RoomChallengeData | null>(null)
  const [targetHours, setTargetHours] = useState(10)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadChallenge = useCallback(async (key: string) => {
    if (!/^[A-Z0-9]{6}$/i.test(key)) {
      setError("Informe a chave de 6 caracteres da sala.")
      return
    }
    const normalizedKey = key.toUpperCase()
    setLoading(true)
    setError(null)
    try {
      const result = await getRoomChallenge(normalizedKey)
      setChallenge(result.challenge)
      setLoadedRoomKey(normalizedKey)
      setRoomKey(normalizedKey)
    } catch (reason) {
      setChallenge(null)
      setLoadedRoomKey("")
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o desafio.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!normalizedInitial) return
    const timer = window.setTimeout(() => void loadChallenge(normalizedInitial), 0)
    return () => window.clearTimeout(timer)
  }, [loadChallenge, normalizedInitial])

  const submitRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void loadChallenge(roomKey)
  }

  const createChallenge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!loadedRoomKey || saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await createRoomChallenge(loadedRoomKey, targetHours)
      setChallenge(result.challenge)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar a meta.")
    } finally {
      setSaving(false)
    }
  }

  const progress = challenge ? Math.min(100, challenge.progressMs / challenge.targetMs * 100) : 0

  return <div className="space-y-5">
    <Card className="space-y-4 p-5 shadow-none">
      <div className="space-y-1"><h2 className="font-semibold">Escolha uma sala</h2><p className="text-sm text-muted-foreground">Use a chave compartilhada da sala. Se veio do timer pelo menu, ela já estará preenchida.</p></div>
      <form onSubmit={submitRoom} className="flex flex-col gap-3 sm:flex-row">
        <Input aria-label="Chave da sala" autoCapitalize="characters" autoComplete="off" maxLength={6} placeholder="ABC123" value={roomKey} onChange={(event) => setRoomKey(event.target.value.toUpperCase())} className="font-mono tracking-widest sm:max-w-48" />
        <Button type="submit" variant="outline" disabled={loading || roomKey.length !== 6} className="min-h-11">{loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Ver desafio</Button>
      </form>
    </Card>

    {loadedRoomKey && challenge && <Card className="space-y-5 p-5 shadow-none sm:p-7">
      <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><UsersRound className="size-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium text-primary">Sala {loadedRoomKey}</p><h2 className="text-xl font-bold">Meta coletiva da semana</h2><p className="text-sm text-muted-foreground">{formatDate(challenge.weekStart)} – {formatDate(challenge.weekEnd - 1)} · UTC</p></div><Button type="button" variant="ghost" size="icon" aria-label="Atualizar progresso" disabled={loading} onClick={() => void loadChallenge(loadedRoomKey)}>{loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}</Button></div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-mono text-2xl font-bold tabular-nums">{formatFocusTime(challenge.progressMs)} <span className="text-base font-normal text-muted-foreground">de {formatFocusTime(challenge.targetMs)}</span></p><p className="text-sm font-semibold text-muted-foreground">{Math.floor(progress)}%</p></div>
        <div role="progressbar" aria-label="Progresso do desafio coletivo" aria-valuemin={0} aria-valuemax={challenge.targetMs} aria-valuenow={Math.min(challenge.progressMs, challenge.targetMs)} className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
      </div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">{progress >= 100 && <Check className="size-4 text-primary" />}O grupo soma o tempo de cada sessão de foco concluída nesta sala.</p>
    </Card>}

    {loadedRoomKey && !challenge && !loading && <Card className="space-y-4 p-5 shadow-none sm:p-7">
      <div className="space-y-1"><p className="font-semibold">Definir meta semanal</p><p className="text-sm leading-relaxed text-muted-foreground">Escolham um objetivo de foco para a sala. O progresso soma sessões concluídas por todos os participantes.</p></div>
      <form onSubmit={createChallenge} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid gap-2 text-sm font-medium">Meta do grupo (horas)<Input type="number" min={1} max={500} step={1} value={targetHours} onChange={(event) => setTargetHours(Number(event.target.value))} className="min-h-11 sm:w-40" /></label>
        <Button type="submit" disabled={saving || targetHours < 1 || targetHours > 500} className="min-h-11">{saving ? <LoaderCircle className="animate-spin" /> : <UsersRound />}Criar desafio</Button>
      </form>
      <p className="text-xs text-muted-foreground">Uma sala pode ter um desafio por semana. O período começa na segunda-feira à 00:00 UTC.</p>
    </Card>}

    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
