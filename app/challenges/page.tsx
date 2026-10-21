import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { AppNavigation } from "@/components/app-navigation"
import { RoomChallenge } from "@/components/room-challenge"

export default async function ChallengesPage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const session = await auth()
  if (!session?.user) redirect("/")
  const { room } = await searchParams
  return <AppNavigation userName={session.user.name ?? "Participante"}>
    <section className="mx-auto w-full max-w-3xl space-y-7">
      <header className="space-y-2"><p className="text-sm font-medium text-primary">Metas compartilhadas</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Desafios</h1><p className="text-muted-foreground">Definam uma meta semanal de foco e acompanhem o progresso coletivo da sala.</p></header>
      <RoomChallenge initialRoomKey={room} />
    </section>
  </AppNavigation>
}
