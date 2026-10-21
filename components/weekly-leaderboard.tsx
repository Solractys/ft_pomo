"use client"

import { useEffect, useState } from "react"
import { Check, LoaderCircle, Trophy } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getWeeklyLeaderboard, setLeaderboardOptIn, type WeeklyLeaderboard as WeeklyLeaderboardData } from "@/lib/pomodoro/api"

function formatFocusTime(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60_000)
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return hours ? `${hours}h ${remainingMinutes}min` : `${remainingMinutes} min`
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).format(timestamp)
}

export function WeeklyLeaderboard() {
  const [data, setData] = useState<WeeklyLeaderboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getWeeklyLeaderboard()
      .then(setData)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar o ranking."))
  }, [])

  const toggleParticipation = async () => {
    if (!data || saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await setLeaderboardOptIn(!data.optedIn)
      setData(await getWeeklyLeaderboard())
      if (!result.optedIn) setError("Você saiu do ranking. Seu tempo continua no perfil, mas seu nome não aparece mais na lista.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar sua participação.")
    } finally {
      setSaving(false)
    }
  }

  return <div className="space-y-5" aria-busy={!data}>
    <Card className="flex flex-col gap-4 p-5 shadow-none sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="font-semibold">Sua participação</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{data?.optedIn ? "Seu nome e tempo semanal aparecem para usuários conectados." : "Você pode consultar o ranking sem aparecer nele."}</p>
      </div>
      <Button type="button" variant={data?.optedIn ? "outline" : "default"} disabled={!data || saving} aria-pressed={data?.optedIn ?? false} onClick={toggleParticipation} className="min-h-11 shrink-0">
        {saving ? <LoaderCircle className="animate-spin" /> : data?.optedIn ? "Sair do ranking" : <><Check />Participar do ranking</>}
      </Button>
    </Card>

    {data && <Card className="overflow-hidden shadow-none">
      <div className="flex flex-col gap-1 border-b border-border p-5 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="font-semibold">Classificação da semana</h2><p className="text-sm text-muted-foreground">{formatDate(data.weekStart)} – {formatDate(data.weekEnd - 1)} · UTC</p></div>
        <p className="text-sm text-muted-foreground">Seu foco: <span className="font-semibold text-foreground">{formatFocusTime(data.ownFocusedMs)}</span>{data.ownRank ? ` · ${data.ownRank}º lugar` : ""}</p>
      </div>
      {data.entries.length ? <ol className="divide-y divide-border">
        {data.entries.map((entry) => <li key={entry.userId} className="flex min-h-16 items-center gap-4 px-5 py-3">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${entry.rank <= 3 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{entry.rank <= 3 ? <Trophy className="size-4" /> : entry.rank}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
          <span className="shrink-0 font-mono text-sm tabular-nums">{formatFocusTime(entry.focusedMs)}</span>
        </li>)}
      </ol> : <p className="p-8 text-center text-sm text-muted-foreground">Ainda não há sessões de foco concluídas nesta semana.</p>}
      <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">A contagem começa na segunda-feira à 00:00 UTC e inclui sessões concluídas.</p>
    </Card>}

    {!data && !error && <p role="status" className="py-8 text-center text-sm text-muted-foreground">Carregando ranking…</p>}
    {error && <p role="alert" className={`text-sm ${data?.optedIn === false ? "text-muted-foreground" : "text-destructive"}`}>{error}</p>}
  </div>
}
