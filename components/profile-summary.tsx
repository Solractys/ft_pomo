"use client"

import { useEffect, useState } from "react"
import { getProfile } from "@/lib/pomodoro/api"
import { Card } from "@/components/ui/card"

type Summary = { totalFocusedMs: number; completedSessions: number; error?: string }

export function ProfileSummary() {
  const [summary, setSummary] = useState<Summary | null>(null)
  useEffect(() => { getProfile().then(setSummary).catch((error: unknown) => setSummary({ totalFocusedMs: 0, completedSessions: 0, error: error instanceof Error ? error.message : "Falha ao carregar" })) }, [])
  const minutes = Math.floor((summary?.totalFocusedMs ?? 0) / 60_000)
  return <Card className="space-y-3 p-7 shadow-none">
    <p className="text-sm text-muted-foreground">Tempo total em sessões de foco concluídas</p>
    {summary ? <><p className="font-mono text-5xl font-bold">{Math.floor(minutes / 60)}h {minutes % 60}m</p><p className="text-sm">{summary.completedSessions} sessões concluídas</p>{summary.error && <p role="alert" className="text-sm text-red-700">{summary.error}</p>}</> : <p>Carregando…</p>}
  </Card>
}
