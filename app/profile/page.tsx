import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/auth"
import { ProfileSummary } from "@/components/profile-summary"
import { SignOutButton } from "@/components/sign-out-button"

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const session = await auth()
  if (!session?.user) redirect("/")
  const { session: roomKey } = await searchParams
  const returnHref = roomKey && /^[A-Z0-9]{6}$/i.test(roomKey)
    ? `/?session=${roomKey.toUpperCase()}&return=room`
    : "/"
  return <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
    <section className="w-full max-w-lg space-y-7">
      <header className="flex items-center justify-between"><Link href={returnHref} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="size-4" />Voltar ao timer</Link><SignOutButton /></header>
      <div className="space-y-2 text-center"><h1 className="text-4xl font-bold">Meu perfil</h1><p className="text-sm text-muted-foreground">{session.user.name} · {session.user.email}</p></div>
      <ProfileSummary />
    </section>
  </main>
}
