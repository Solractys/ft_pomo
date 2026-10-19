import type { RoomSnapshot } from "./types"
import { getRealtimeToken } from "@/lib/auth/token"

const apiUrl = () => {
  const value = process.env.NEXT_PUBLIC_REALTIME_API_URL?.replace(/\/$/, "")
  if (!value) throw new Error("NEXT_PUBLIC_REALTIME_API_URL is not configured")
  return value
}

async function request<T extends object = RoomSnapshot>(path: string, init?: RequestInit): Promise<T> {
  const send = async (token: string) => fetch(`${apiUrl()}${path}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...init?.headers },
    })
  let response = await send(await getRealtimeToken())
  if (response.status === 401) response = await send(await getRealtimeToken(true))

  const body = (await response.json()) as T | { error: string }
  if (!response.ok) throw new Error("error" in body ? body.error : "Request failed")
  return body as T
}

export const createRoom = () => request("/rooms", { method: "POST", body: "{}" })

export const getRoom = (key: string) => request(`/rooms/${encodeURIComponent(key.toUpperCase())}`)

export const getProfile = () => request<{ user: { name?: string; email?: string; image?: string }; totalFocusedMs: number; completedSessions: number }>("/profile")

export function roomSocketUrl(key: string, token: string) {
  const url = new URL(`${apiUrl()}/rooms/${encodeURIComponent(key.toUpperCase())}/ws`)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  return { url: url.toString(), protocols: ["ft-pomo", token] }
}
