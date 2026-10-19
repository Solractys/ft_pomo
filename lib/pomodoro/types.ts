export type TimerStatus = "idle" | "running" | "paused"
export type TimerPhase = "work" | "break"

export interface RoomParticipant {
  id: string
  name?: string
  image?: string
}

export interface RoomSnapshot {
  id: string
  key: string
  status: TimerStatus
  phase: TimerPhase
  workDurationMs: number
  breakDurationMs: number
  remainingMs: number
  startedAt: number | null
  endsAt: number | null
  version: number
  serverNow: number
  participants: RoomParticipant[]
}

export type RoomCommand =
  | { type: "start" }
  | { type: "pause" }
  | { type: "reset" }
  | { type: "switch" }
  | { type: "settings"; workDurationMs: number; breakDurationMs: number }

export type ServerMessage =
  | { type: "snapshot"; room: RoomSnapshot }
  | { type: "error"; message: string }
