import { PomodoroTimer } from "@/components/pomodoro-timer"
import { auth } from "@/auth"
import { SignInButton } from "@/components/sign-in-button"
import { AppNavigation } from "@/components/app-navigation"
import { Check, Clock3, UsersRound } from "lucide-react"

export default async function Home() {
  const session = await auth()
  if (!session?.user) return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-20 text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--primary)_15%,transparent),transparent_48%),radial-gradient(ellipse_at_bottom_right,color-mix(in_srgb,var(--accent)_85%,transparent),transparent_45%)]" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-card shadow-xl md:grid-cols-[1.1fr_.9fr]">
        <section className="flex flex-col justify-between gap-12 bg-primary p-8 text-primary-foreground sm:p-12">
          <div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-xl bg-primary-foreground/15"><Clock3 className="size-5" /></span><span className="font-bold tracking-wide">FT_POMODORO</span></div>
          <div className="space-y-5"><p className="text-sm font-medium uppercase tracking-[.2em] opacity-75">Seu tempo, com propósito</p><h1 className="max-w-lg text-4xl font-bold leading-tight sm:text-5xl">Um pouco de foco muda o seu dia.</h1><p className="max-w-md text-base leading-relaxed opacity-80">Organize sessões de trabalho, convide pessoas para focar junto e acompanhe seu progresso.</p></div>
          <div className="grid gap-3 text-sm sm:grid-cols-2"><p className="flex items-center gap-2"><Check className="size-4" />Timer compartilhado</p><p className="flex items-center gap-2"><UsersRound className="size-4" />Foco em comunidade</p></div>
        </section>
        <section className="flex flex-col justify-center gap-7 p-8 sm:p-12">
          <div className="space-y-2"><h2 className="text-2xl font-bold">Entre para começar</h2><p className="text-sm leading-relaxed text-muted-foreground">Acesse seu espaço de foco e encontre outras pessoas construindo bons hábitos.</p></div>
          <SignInButton />
          <p className="text-center text-xs text-muted-foreground">Ao entrar, você poderá criar uma sala ou participar de uma sessão.</p>
        </section>
      </div>
    </main>
  )
  return (
    <AppNavigation userName={session.user.name ?? "Participante"}>
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center"><PomodoroTimer userName={session.user.name ?? "Participante"} /></div>
    </AppNavigation>
  )
}
