"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { Minus, Plus } from "lucide-react"

type TimerKind = "focus" | "break"

const MINUTES_PER_LAP = 60
const CENTER = 160
const FOCUS_RADIUS = 132
const BREAK_RADIUS = 106
const RING_STROKE_WIDTH = 26
const TWO_PI = Math.PI * 2

function clampMinutes(value: number, maxMinutes: number) {
  return Math.min(maxMinutes, Math.max(1, Math.round(value)))
}

function pointerPosition(event: PointerEvent<SVGSVGElement>) {
  const bounds = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - bounds.left) / bounds.width) * 320 - CENTER
  const y = ((event.clientY - bounds.top) / bounds.height) * 320 - CENTER
  return { angle: Math.atan2(y, x), radius: Math.hypot(x, y) }
}

function valueAtAngle(angle: number, currentValue: number, maxMinutes: number) {
  const minuteOnCircle = ((angle + Math.PI / 2 + TWO_PI) % TWO_PI) / TWO_PI * MINUTES_PER_LAP
  const candidates = [clampMinutes(minuteOnCircle, MINUTES_PER_LAP)]
  if (maxMinutes > MINUTES_PER_LAP) candidates.push(clampMinutes(minuteOnCircle + MINUTES_PER_LAP, maxMinutes))

  // At 12 o'clock, both ends of a lap share the same point. Choose the one closest to the current value.
  if (minuteOnCircle < 0.5 || minuteOnCircle > MINUTES_PER_LAP - 0.5) {
    candidates.push(1, MINUTES_PER_LAP)
    if (maxMinutes > MINUTES_PER_LAP) candidates.push(MINUTES_PER_LAP + 1, maxMinutes)
  }

  return candidates.reduce((nearest, candidate) =>
    Math.abs(candidate - currentValue) < Math.abs(nearest - currentValue) ? candidate : nearest,
  )
}

function MinuteField({ label, value, maxMinutes, onChange }: {
  label: string
  value: number
  maxMinutes: number
  onChange: (minutes: number) => void
}) {
  const inputId = useId()
  const [draft, setDraft] = useState(String(value))
  const inputEditing = useRef(false)

  useEffect(() => {
    if (!inputEditing.current) setDraft(String(value))
  }, [value])

  const finishInput = () => {
    inputEditing.current = false
    const parsed = Number(draft)
    const next = clampMinutes(Number.isFinite(parsed) && draft.trim() ? parsed : value, maxMinutes)
    setDraft(String(next))
    onChange(next)
  }

  const changeBy = (amount: number) => {
    const next = clampMinutes(value + amount, maxMinutes)
    setDraft(String(next))
    onChange(next)
  }

  return <div className="flex min-w-0 flex-col items-center gap-1">
    <label htmlFor={inputId} className="cursor-text text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
    <span className="flex items-center gap-0.5">
      <input
        id={inputId}
        type="number"
        min={1}
        max={maxMinutes}
        step={1}
        inputMode="numeric"
        value={draft}
        aria-label={`${label} em minutos`}
        onFocus={() => { inputEditing.current = true }}
        onChange={(event) => {
          const nextDraft = event.target.value
          if (!/^\d*$/.test(nextDraft)) return
          setDraft(nextDraft)
          if (nextDraft) onChange(clampMinutes(Number(nextDraft), maxMinutes))
        }}
        onBlur={finishInput}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }}
        className="pomodoro-minute-input w-10 cursor-text border-0 bg-transparent p-0 text-center text-xl font-bold tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span className="text-[10px] text-muted-foreground">min</span>
      <span className="ml-0.5 flex flex-col">
        <button type="button" aria-label={`Aumentar ${label.toLowerCase()}`} disabled={value >= maxMinutes} onClick={() => changeBy(1)} className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-25"><Plus className="size-3" /></button>
        <button type="button" aria-label={`Diminuir ${label.toLowerCase()}`} disabled={value <= 1} onClick={() => changeBy(-1)} className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-25"><Minus className="size-3" /></button>
      </span>
    </span>
  </div>
}

export function PomodoroTimePicker({ workMinutes, breakMinutes, onWorkChange, onBreakChange }: {
  workMinutes: number
  breakMinutes: number
  onWorkChange: (minutes: number) => void
  onBreakChange: (minutes: number) => void
}) {
  const [dragKind, setDragKind] = useState<TimerKind | null>(null)
  const drag = useRef<{ pointerId: number; kind: TimerKind; angle: number; value: number } | null>(null)
  const focusProgress = workMinutes > MINUTES_PER_LAP ? (workMinutes - MINUTES_PER_LAP) / MINUTES_PER_LAP : workMinutes / MINUTES_PER_LAP
  const breakProgress = breakMinutes / MINUTES_PER_LAP
  const focusAngle = focusProgress * TWO_PI - Math.PI / 2
  const breakAngle = breakProgress * TWO_PI - Math.PI / 2
  const focusHandle = { x: CENTER + FOCUS_RADIUS * Math.cos(focusAngle), y: CENTER + FOCUS_RADIUS * Math.sin(focusAngle) }
  const breakHandle = { x: CENTER + BREAK_RADIUS * Math.cos(breakAngle), y: CENTER + BREAK_RADIUS * Math.sin(breakAngle) }
  const circumference = TWO_PI * FOCUS_RADIUS
  const focusColor = "var(--primary)"
  const breakColor = "var(--accent-foreground)"

  const onValueChange = (kind: TimerKind, value: number) => {
    if (kind === "focus") onWorkChange(value)
    else onBreakChange(value)
  }

  const startDrag = (event: PointerEvent<SVGSVGElement>) => {
    event.preventDefault()
    const { angle, radius } = pointerPosition(event)
    const kind: TimerKind = Math.abs(radius - FOCUS_RADIUS) <= Math.abs(radius - BREAK_RADIUS) ? "focus" : "break"
    const currentValue = kind === "focus" ? workMinutes : breakMinutes
    const maxMinutes = kind === "focus" ? 120 : 60
    const next = valueAtAngle(angle, currentValue, maxMinutes)
    drag.current = { pointerId: event.pointerId, kind, angle, value: next }
    setDragKind(kind)
    event.currentTarget.setPointerCapture(event.pointerId)
    onValueChange(kind, next)
  }

  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    const { angle } = pointerPosition(event)
    let delta = angle - drag.current.angle
    if (delta > Math.PI) delta -= TWO_PI
    if (delta < -Math.PI) delta += TWO_PI
    drag.current.angle = angle
    const maxMinutes = drag.current.kind === "focus" ? 120 : 60
    drag.current.value = Math.min(maxMinutes, Math.max(1, drag.current.value + delta / TWO_PI * MINUTES_PER_LAP))
    onValueChange(drag.current.kind, clampMinutes(drag.current.value, maxMinutes))
  }

  const stopDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    setDragKind(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>, kind: TimerKind) => {
    const current = kind === "focus" ? workMinutes : breakMinutes
    const max = kind === "focus" ? 120 : 60
    const step = event.key === "PageUp" || event.key === "PageDown" ? 5 : 1
    let next: number | null = null
    if (event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "PageUp") next = current + step
    if (event.key === "ArrowLeft" || event.key === "ArrowDown" || event.key === "PageDown") next = current - step
    if (event.key === "Home") next = 1
    if (event.key === "End") next = max
    if (next === null) return
    event.preventDefault()
    onValueChange(kind, clampMinutes(next, max))
  }

  return <section aria-label="Duração da sessão" className="flex w-full flex-col items-center">
    <div className="relative aspect-square w-full max-w-[30rem] touch-none select-none">
      <svg
        viewBox="0 0 320 320"
        role="group"
        aria-label="Controles circulares de foco e pausa"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        className={`size-full overflow-visible rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 ${dragKind ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <g role="slider" tabIndex={0} aria-label="Foco em minutos, use as setas para ajustar" aria-valuemin={1} aria-valuemax={120} aria-valuenow={workMinutes} aria-valuetext={`${workMinutes} minutos de foco`} onKeyDown={(event) => handleKeyDown(event, "focus")}>
          <circle cx={CENTER} cy={CENTER} r={FOCUS_RADIUS} fill="none" stroke="var(--muted)" strokeWidth={RING_STROKE_WIDTH} />
          {workMinutes > MINUTES_PER_LAP && <circle cx={CENTER} cy={CENTER} r={FOCUS_RADIUS} fill="none" stroke={focusColor} strokeWidth={RING_STROKE_WIDTH} strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} transform={`rotate(-90 ${CENTER} ${CENTER})`} opacity=".3" />}
          <circle cx={CENTER} cy={CENTER} r={FOCUS_RADIUS} fill="none" stroke={focusColor} strokeWidth={RING_STROKE_WIDTH} strokeLinecap="round" strokeDasharray={`${circumference * focusProgress} ${circumference}`} transform={`rotate(-90 ${CENTER} ${CENTER})`} className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-100" />
          <circle cx={focusHandle.x} cy={focusHandle.y} r="14" fill="var(--card)" stroke={focusColor} strokeWidth="5" />
        </g>
        <g role="slider" tabIndex={0} aria-label="Pausa em minutos, use as setas para ajustar" aria-valuemin={1} aria-valuemax={60} aria-valuenow={breakMinutes} aria-valuetext={`${breakMinutes} minutos de pausa`} onKeyDown={(event) => handleKeyDown(event, "break")}>
          <circle cx={CENTER} cy={CENTER} r={BREAK_RADIUS} fill="none" stroke="var(--muted)" strokeWidth={RING_STROKE_WIDTH} />
          <circle cx={CENTER} cy={CENTER} r={BREAK_RADIUS} fill="none" stroke={breakColor} strokeWidth={RING_STROKE_WIDTH} strokeLinecap="round" strokeDasharray={`${TWO_PI * BREAK_RADIUS * breakProgress} ${TWO_PI * BREAK_RADIUS}`} transform={`rotate(-90 ${CENTER} ${CENTER})`} className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-100" />
          <circle cx={breakHandle.x} cy={breakHandle.y} r="14" fill="var(--card)" stroke={breakColor} strokeWidth="5" />
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="pointer-events-auto flex max-w-[calc(100%-6rem)] items-center justify-center gap-2" onPointerDown={(event) => event.stopPropagation()}>
          <MinuteField label="Foco" value={workMinutes} maxMinutes={120} onChange={onWorkChange} />
          <span className="h-12 w-px bg-border" aria-hidden="true" />
          <MinuteField label="Pausa" value={breakMinutes} maxMinutes={60} onChange={onBreakChange} />
        </div>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-full bg-primary" />Foco · 1–120 min</span>
      <span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-full bg-[var(--accent-foreground)]" />Pausa · 1–60 min</span>
    </div>
  </section>
}
