import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/auth"
import { ProfileSummary } from "@/components/profile-summary"
import { SignOutButton } from "@/components/sign-out-button"

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user) redirect("/")
  return <main className="flex min-h-screen items-center justify-center bg-white p-4 text-black">
    <section className="w-full max-w-lg space-y-7">
      <header className="flex items-center justify-between"><Link href="/" className="text-sm underline">Voltar ao timer</Link><SignOutButton /></header>
      <div className="space-y-2 text-center"><h1 className="text-4xl font-bold">Meu perfil</h1><p className="text-sm text-black/55">{session.user.name} · {session.user.email}</p></div>
      <ProfileSummary />
    </section>
  </main>
}
