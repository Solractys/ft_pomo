"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { CircleUserRound, Clock3, Menu, Trophy, UsersRound, X } from "lucide-react"
import { SignOutButton } from "@/components/sign-out-button"
import { ThemeControls } from "@/components/theme-controls"

const navigation = [
  { href: "/", label: "Timer", icon: Clock3 },
  { href: "/leaderboard", label: "Ranking", icon: Trophy },
  { href: "/challenges", label: "Desafios", icon: UsersRound },
  { href: "/profile", label: "Perfil", icon: CircleUserRound },
]

export function AppNavigation({ userName, children }: { userName: string; children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sessionKey = searchParams.get("session")
  const roomKey = sessionKey ?? searchParams.get("room")
  const joiningRoom = searchParams.get("flow") === "join"
  const joinDraft = searchParams.get("join")?.slice(0, 6).toUpperCase() ?? ""
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <button
        ref={triggerRef}
        type="button"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        aria-controls="app-navigation-panel"
        onClick={() => setOpen((value) => !value)}
        className="fixed left-4 top-4 z-50 inline-flex size-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {open && <button type="button" aria-label="Fechar menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default bg-black/35" />}

      <aside
        id="app-navigation-panel"
        ref={panelRef}
        aria-label="Navegação principal"
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(19rem,calc(100vw-2rem))] flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar p-5 text-sidebar-foreground shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="mb-8 flex items-center gap-3 px-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Clock3 className="size-5" /></div>
          <div><p className="font-bold tracking-tight">FT_POMODORO</p><p className="text-xs text-muted-foreground">Foco junto, melhor.</p></div>
        </div>

        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Menu</p>
        <nav className="grid gap-1" aria-label="Seções">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`))
            const validRoomKey = roomKey && /^[A-Z0-9]{6}$/i.test(roomKey) ? roomKey.toUpperCase() : null
            const encodedRoomKey = validRoomKey ? encodeURIComponent(validRoomKey) : null
            const joinQuery = joiningRoom ? `flow=join${joinDraft ? `&join=${encodeURIComponent(joinDraft)}` : ""}` : null
            const destination = encodedRoomKey
              ? href === "/challenges"
                ? `/challenges?room=${encodedRoomKey}`
                : href === "/" && pathname !== "/"
                  ? `/?session=${encodedRoomKey}&return=room`
                  : href !== "/"
                    ? `${href}?session=${encodedRoomKey}`
                    : href
              : joinQuery && href === "/" && pathname !== "/"
                ? `/?${joinQuery}`
                : joinQuery && href !== "/"
                  ? `${href}?${joinQuery}`
                  : href
            return <Link key={href} href={destination} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}><Icon className="size-4" />{label}</Link>
          })}
        </nav>

        <div className="mt-auto border-t border-sidebar-border pt-4">
          <div className="mb-4"><ThemeControls /></div>
          <p className="mb-3 truncate px-3 text-sm text-muted-foreground" title={userName}>Logado como <span className="font-medium text-sidebar-foreground">{userName}</span></p>
          <SignOutButton />
        </div>
      </aside>

      <main className="min-h-screen px-4 pb-10 pt-24 sm:px-8">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
