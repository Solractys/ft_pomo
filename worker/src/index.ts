import { DurableObject } from "cloudflare:workers"

type Status = "idle" | "running" | "paused"
type Phase = "work" | "break"

interface Env {
  DB: D1Database
  ROOMS: DurableObjectNamespace<PomodoroRoom>
  APP_ORIGIN: string
}

interface RoomRow {
  id: string
  room_key: string
  status: Status
  phase: Phase
  work_duration_ms: number
  break_duration_ms: number
  remaining_ms: number
  started_at: number | null
  ends_at: number | null
  version: number
  expires_at: number
}

interface Attachment {
  participantId: string
  name: string
}

const DAY_MS = 86_400_000

const json = (body: unknown, status = 200, origin = "*") =>
  Response.json(body, {
    status,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      vary: "origin",
    },
  })

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("origin")
  if (!origin) return env.APP_ORIGIN
  const allowed = env.APP_ORIGIN.split(",").map((item) => item.trim())
  return allowed.includes(origin) ? origin : null
}

function rowToSnapshot(row: RoomRow, participants: string[] = []) {
  return {
    id: row.id,
    key: row.room_key,
    status: row.status,
    phase: row.phase,
    workDurationMs: row.work_duration_ms,
    breakDurationMs: row.break_duration_ms,
    remainingMs: row.remaining_ms,
    startedAt: row.started_at,
    endsAt: row.ends_at,
    version: row.version,
    serverNow: Date.now(),
    participants,
  }
}

async function findRoom(db: D1Database, key: string) {
  return db.prepare("SELECT * FROM rooms WHERE room_key = ? AND expires_at > ?")
    .bind(key, Date.now())
    .first<RoomRow>()
}

function newRoomKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env)
    if (!origin) return json({ error: "Origin not allowed" }, 403, "null")
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    })

    const url = new URL(request.url)
    const match = url.pathname.match(/^\/rooms\/([A-Z0-9]{6})(\/ws)?$/i)

    if (request.method === "POST" && url.pathname === "/rooms") {
      const now = Date.now()
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const id = crypto.randomUUID()
        const key = newRoomKey()
        try {
          await env.DB.prepare(`INSERT INTO rooms
            (id, room_key, created_at, updated_at, expires_at)
            VALUES (?, ?, ?, ?, ?)`)
            .bind(id, key, now, now, now + DAY_MS)
            .run()
          const room = await findRoom(env.DB, key)
          return json(rowToSnapshot(room!), 201, origin)
        } catch (error) {
          if (attempt === 4) throw error
        }
      }
    }

    if (match) {
      const key = match[1].toUpperCase()
      const room = await findRoom(env.DB, key)
      if (!room) return json({ error: "Sala não encontrada ou expirada" }, 404, origin)

      if (match[2] === "/ws") {
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
          return json({ error: "WebSocket upgrade required" }, 426, origin)
        }
        const id = env.ROOMS.idFromName(key)
        return env.ROOMS.get(id).fetch(request)
      }

      if (request.method === "GET") return json(rowToSnapshot(room), 200, origin)
    }

    return json({ error: "Not found" }, 404, origin)
  },

  async scheduled(_controller: ScheduledController, env: Env) {
    await env.DB.prepare("DELETE FROM rooms WHERE expires_at <= ?").bind(Date.now()).run()
  },
} satisfies ExportedHandler<Env>

export class PomodoroRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  private async room() {
    const key = this.ctx.id.name
    if (!key) return null
    return findRoom(this.env.DB, key)
  }

  private participants() {
    const names = new Set<string>()
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as Attachment | null
      if (attachment?.name) names.add(attachment.name)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }

  private async sendSnapshot(target?: WebSocket) {
    const room = await this.room()
    if (!room) return
    const message = JSON.stringify({ type: "snapshot", room: rowToSnapshot(room, this.participants()) })
    if (target) {
      target.send(message)
      return
    }
    for (const socket of this.ctx.getWebSockets()) socket.send(message)
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    const participantId = url.searchParams.get("participantId")?.slice(0, 64)
    const name = url.searchParams.get("name")?.trim().slice(0, 40)
    if (!participantId || !name) return json({ error: "Nome e participante são obrigatórios" }, 400)

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ participantId, name } satisfies Attachment)
    await this.sendSnapshot()
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    try {
      const command = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as Record<string, unknown>
      const room = await this.room()
      if (!room) throw new Error("Sala expirada")

      const now = Date.now()
      let status = room.status
      let phase = room.phase
      let workDuration = room.work_duration_ms
      let breakDuration = room.break_duration_ms
      let remaining = room.remaining_ms
      let startedAt = room.started_at
      let endsAt = room.ends_at

      if (command.type === "start" && status !== "running") {
        status = "running"
        startedAt = now
        endsAt = now + remaining
      } else if (command.type === "pause" && status === "running") {
        remaining = Math.max(0, (endsAt ?? now) - now)
        status = "paused"
        startedAt = null
        endsAt = null
      } else if (command.type === "reset") {
        remaining = phase === "work" ? workDuration : breakDuration
        status = "idle"
        startedAt = null
        endsAt = null
      } else if (command.type === "switch") {
        phase = phase === "work" ? "break" : "work"
        remaining = phase === "work" ? workDuration : breakDuration
        status = "idle"
        startedAt = null
        endsAt = null
      } else if (command.type === "settings") {
        const nextWork = Number(command.workDurationMs)
        const nextBreak = Number(command.breakDurationMs)
        if (!Number.isFinite(nextWork) || nextWork < 60_000 || nextWork > 7_200_000 ||
            !Number.isFinite(nextBreak) || nextBreak < 60_000 || nextBreak > 3_600_000) {
          throw new Error("Durações inválidas")
        }
        workDuration = nextWork
        breakDuration = nextBreak
        if (status === "idle") remaining = phase === "work" ? nextWork : nextBreak
      } else {
        throw new Error("Comando inválido")
      }

      await this.env.DB.prepare(`UPDATE rooms SET status = ?, phase = ?, work_duration_ms = ?,
        break_duration_ms = ?, remaining_ms = ?, started_at = ?, ends_at = ?, version = version + 1,
        updated_at = ?, expires_at = ? WHERE id = ?`)
        .bind(status, phase, workDuration, breakDuration, remaining, startedAt, endsAt, now, now + DAY_MS, room.id)
        .run()

      if (endsAt) await this.ctx.storage.setAlarm(endsAt)
      else await this.ctx.storage.deleteAlarm()
      await this.sendSnapshot()
    } catch (error) {
      socket.send(JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Erro inesperado" }))
    }
  }

  async webSocketClose() {
    await this.sendSnapshot()
  }

  async webSocketError() {
    await this.sendSnapshot()
  }

  async alarm() {
    const room = await this.room()
    if (!room || room.status !== "running" || !room.ends_at) return
    const now = Date.now()
    if (room.ends_at > now) {
      await this.ctx.storage.setAlarm(room.ends_at)
      return
    }
    const nextPhase: Phase = room.phase === "work" ? "break" : "work"
    const nextRemaining = nextPhase === "work" ? room.work_duration_ms : room.break_duration_ms
    await this.env.DB.prepare(`UPDATE rooms SET status = 'idle', phase = ?, remaining_ms = ?,
      started_at = NULL, ends_at = NULL, version = version + 1, updated_at = ?, expires_at = ? WHERE id = ?`)
      .bind(nextPhase, nextRemaining, now, now + DAY_MS, room.id)
      .run()
    await this.sendSnapshot()
  }
}
