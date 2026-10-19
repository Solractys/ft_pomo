import { PomodoroTimer } from "@/components/pomodoro-timer"
import { auth } from "@/auth"
import { SignInButton } from "@/components/sign-in-button"

export default async function Home() {
  const session = await auth()
  if (!session?.user) return (
    <main className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-7"><header className="space-y-2 text-center"><h1 className="text-4xl font-bold">FT_POMODORO</h1><p className="text-sm text-black/55">Entre com Google para criar ou acessar uma sala.</p></header><SignInButton /></div>
    </main>
  )
  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-4">
      <PomodoroTimer userName={session.user.name ?? "Participante"} />
    </main>
  )
}
