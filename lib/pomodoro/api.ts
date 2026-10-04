import type { RoomSnapshot } from "./types"

const apiUrl = () => {
  const value = process.env.NEXT_PUBLIC_REALTIME_API_URL?.replace(/\/$/, "")
  if (!value) throw new Error("NEXT_PUBLIC_REALTIME_API_URL is not configured")
  return value
}

async function request(path: string, init?: RequestInit): Promise<RoomSnapshot> {
  const response = await fetch(`${apiUrl()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  })

  const body = (await response.json()) as RoomSnapshot | { error: string }
  if (!response.ok) throw new Error("error" in body ? body.error : "Request failed")
  return body as RoomSnapshot
}

export const createRoom = () => request("/rooms", { method: "POST", body: "{}" })

export const getRoom = (key: string) => request(`/rooms/${encodeURIComponent(key.toUpperCase())}`)

export function roomSocketUrl(key: string, participantId: string, name: string) {
  const url = new URL(`${apiUrl()}/rooms/${encodeURIComponent(key.toUpperCase())}/ws`)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.searchParams.set("participantId", participantId)
  url.searchParams.set("name", name)
  return url.toString()
}
