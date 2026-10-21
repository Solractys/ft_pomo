import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/auth"
import { ProfileSummary } from "@/components/profile-summary"
import { AppNavigation } from "@/components/app-navigation"

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const session = await auth()
  if (!session?.user) redirect("/")
  const { session: roomKey } = await searchParams
  const returnHref = roomKey && /^[A-Z0-9]{6}$/i.test(roomKey)
    ? `/?session=${roomKey.toUpperCase()}&return=room`
    : "/"
  return <AppNavigation userName={session.user.name ?? "Participante"}>
    <section className="mx-auto w-full max-w-lg space-y-7">
      <header className="flex items-start justify-between gap-4"><div className="space-y-2"><p className="text-sm font-medium text-primary">Sua jornada</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Meu perfil</h1><p className="text-sm text-muted-foreground">{session.user.name} · {session.user.email}</p></div><Link href={returnHref} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="size-4" /><span className="hidden sm:inline">Voltar ao timer</span></Link></header>
      <ProfileSummary />
    </section>
  </AppNavigation>
}
