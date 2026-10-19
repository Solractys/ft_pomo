"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { MonitorCog, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

const palettes = [
  { id: "default", name: "Clássico", light: ["#ffffff", "#171717", "#262626"], dark: ["#171717", "#fafafa", "#e5e5e5"] },
  { id: "tokyo", name: "Tokyo Night", light: ["#f2f4fa", "#343b58", "#34548a"], dark: ["#1a1b26", "#c0caf5", "#7aa2f7"] },
  { id: "gruvbox", name: "Gruvbox", light: ["#fbf1c7", "#3c3836", "#af3a03"], dark: ["#282828", "#ebdbb2", "#fabd2f"] },
  { id: "solarized", name: "Solarized", light: ["#fdf6e3", "#586e75", "#176b87"], dark: ["#002b36", "#839496", "#2aa198"] },
  { id: "catppuccin", name: "Catppuccin", light: ["#eff1f5", "#4c4f69", "#8839ef"], dark: ["#1e1e2e", "#cdd6f4", "#cba6f7"] },
] as const

const paletteStorageKey = "ft-pomo-palette"

export function ThemeControls() {
  const { setTheme, theme } = useTheme()
  const menuRef = useRef<HTMLDetailsElement>(null)
  const [palette, setPalette] = useState("default")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        if (menuRef.current) menuRef.current.open = false
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menuRef.current?.open) return
      menuRef.current.open = false
      menuRef.current.querySelector("summary")?.focus()
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = localStorage.getItem(paletteStorageKey)
      if (palettes.some((item) => item.id === stored)) setPalette(stored!)
      setReady(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!ready) return
    document.documentElement.dataset.palette = palette
    localStorage.setItem(paletteStorageKey, palette)
  }, [palette, ready])

  return (
    <details ref={menuRef} className="theme-menu fixed left-4 top-4 z-40">
      <summary aria-label="Personalizar aparência" title="Personalizar aparência">
        <MonitorCog className="size-4" />
        <span className="hidden sm:inline">Aparência</span>
      </summary>
      <div className="theme-panel">
        <div>
          <p className="text-sm font-semibold">Aparência</p>
          <p className="text-xs text-muted-foreground">Modo e paleta independentes</p>
        </div>
        <div className="grid grid-cols-2 gap-2" aria-label="Modo de cores">
          <Button type="button" variant={ready && theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")} aria-pressed={ready && theme === "light"}>
            <Sun /> Claro
          </Button>
          <Button type="button" variant={ready && theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")} aria-pressed={ready && theme === "dark"}>
            <Moon /> Escuro
          </Button>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Tema</legend>
          <div className="grid grid-cols-2 gap-2">
            {palettes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPalette(item.id)}
                aria-pressed={palette === item.id}
                className="palette-option"
              >
                <span className="palette-preview" aria-hidden="true">
                  {(ready && theme === "dark" ? item.dark : item.light).map((color) => <i key={color} style={{ "--swatch-color": color } as CSSProperties} />)}
                </span>
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </details>
  )
}
