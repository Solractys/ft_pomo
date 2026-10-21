import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { AppNavigation } from "@/components/app-navigation"
import { WeeklyLeaderboard } from "@/components/weekly-leaderboard"

export default async function LeaderboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/")
  return <AppNavigation userName={session.user.name ?? "Participante"}>
    <section className="mx-auto w-full max-w-3xl space-y-7">
      <header className="space-y-2"><p className="text-sm font-medium text-primary">Foco da comunidade</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Ranking semanal</h1><p className="text-muted-foreground">Veja quem concluiu mais tempo de foco nesta semana. Você participa somente se quiser.</p></header>
      <WeeklyLeaderboard />
    </section>
  </AppNavigation>
}
