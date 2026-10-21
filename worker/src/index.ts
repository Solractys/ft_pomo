import { DurableObject } from "cloudflare:workers"
import { captureAttendeeIds, shouldCompleteFocusSession } from "./focus-credit"
import { verifyRealtimeToken, type RealtimeClaims } from "./auth-token"
import { startOfUtcWeek } from "./utc-week"

type Status = "idle" | "running" | "paused"
type Phase = "work" | "break"

interface Env {
  DB: D1Database
  ROOMS: DurableObjectNamespace<PomodoroRoom>
  APP_ORIGIN: string
  REALTIME_JWT_SECRET: string
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
  active_focus_session_id: string | null
}

interface Attachment {
  participantId: string
  userId: string
  name: string
  image?: string
}

const DAY_MS = 86_400_000
const WEEK_MS = DAY_MS * 7

const json = (body: unknown, status = 200, origin = "*") =>
  Response.json(body, {
    status,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
      vary: "origin",
    },
  })

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("origin")
  if (!origin) return env.APP_ORIGIN
  const allowed = env.APP_ORIGIN.split(",").map((item) => item.trim())
  return allowed.includes(origin) ? origin : null
}

async function authenticate(request: Request, env: Env): Promise<RealtimeClaims | null> {
  const offeredProtocols = request.headers.get("sec-websocket-protocol")?.split(",").map((value) => value.trim()) ?? []
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    offeredProtocols.find((value) => value.split(".").length === 3)
  return verifyRealtimeToken(token, env.REALTIME_JWT_SECRET)
}

async function saveUser(db: D1Database, user: RealtimeClaims) {
  const now = Date.now()
  await db.prepare(`INSERT INTO users (id, email, display_name, avatar_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
    email = excluded.email, display_name = excluded.display_name,
    avatar_url = excluded.avatar_url, updated_at = excluded.updated_at`)
    .bind(user.sub, user.email ?? null, user.name ?? "Participante", user.image ?? null, now, now)
    .run()
}

function rowToSnapshot(row: RoomRow, participants: Attachment[] = []) {
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
    participants: participants.map(({ participantId, name, image }) => ({ id: participantId, name, image })),
  }
}

async function findRoom(db: D1Database, key: string) {
  return db.prepare("SELECT * FROM rooms WHERE room_key = ? AND expires_at > ?")
    .bind(key, Date.now())
    .first<RoomRow>()
}

async function roomExpiresAt(db: D1Database, roomId: string, now: number) {
  const weekStart = startOfUtcWeek(now)
  const challenge = await db.prepare(`SELECT week_start + ? AS week_end FROM room_challenges
    WHERE room_id = ? AND week_start = ?`)
    .bind(WEEK_MS, roomId, weekStart)
    .first<{ week_end: number }>()
  return Math.max(now + DAY_MS, challenge?.week_end ?? 0)
}

async function roomChallengeSnapshot(db: D1Database, roomId: string, weekStart: number) {
  return db.prepare(`SELECT rc.id, rc.week_start, rc.target_ms,
    COALESCE(SUM(fs.duration_ms), 0) AS progress_ms
    FROM room_challenges rc
    LEFT JOIN focus_sessions fs ON fs.room_id = rc.room_id
      AND fs.completed_at >= rc.week_start AND fs.completed_at < rc.week_start + ?
    WHERE rc.room_id = ? AND rc.week_start = ?
    GROUP BY rc.id`)
    .bind(WEEK_MS, roomId, weekStart)
    .first<{ id: string; week_start: number; target_ms: number; progress_ms: number }>()
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
        "access-control-allow-headers": "content-type,authorization",
      },
    })

    const url = new URL(request.url)
    const match = url.pathname.match(/^\/rooms\/([A-Z0-9]{6})(\/ws|\/challenge)?$/i)

    if (request.method === "GET" && url.pathname === "/profile") {
      const user = await authenticate(request, env)
      if (!user) return json({ error: "Autenticação necessária" }, 401, origin)
      await saveUser(env.DB, user)
      const totals = await env.DB.prepare(`SELECT COALESCE(SUM(fs.duration_ms), 0) AS total_focused_ms,
        COUNT(fs.id) AS completed_sessions FROM focus_session_attendees fsa
        JOIN focus_sessions fs ON fs.id = fsa.session_id
        WHERE fsa.user_id = ? AND fs.completed_at IS NOT NULL`)
        .bind(user.sub).first<{ total_focused_ms: number; completed_sessions: number }>()
      return json({ user: { name: user.name, email: user.email, image: user.image },
        totalFocusedMs: totals?.total_focused_ms ?? 0, completedSessions: totals?.completed_sessions ?? 0 }, 200, origin)
    }

    const user = await authenticate(request, env)
    if (!user) return json({ error: "Faça login com Google para usar as salas" }, 401, origin)
    await saveUser(env.DB, user)

    if (request.method === "GET" && url.pathname === "/leaderboard") {
      const weekStart = startOfUtcWeek(Date.now())
      const weekEnd = weekStart + WEEK_MS
      const ranking = await env.DB.prepare(`WITH weekly AS (
        SELECT u.id AS user_id, COALESCE(u.display_name, 'Participante') AS display_name,
          SUM(fs.duration_ms) AS focused_ms
        FROM users u
        JOIN focus_session_attendees fsa ON fsa.user_id = u.id
        JOIN focus_sessions fs ON fs.id = fsa.session_id
        WHERE u.leaderboard_opt_in = 1 AND fs.completed_at >= ? AND fs.completed_at < ?
        GROUP BY u.id
      ), ranked AS (
        SELECT user_id, display_name, focused_ms,
          RANK() OVER (ORDER BY focused_ms DESC) AS rank
        FROM weekly
      )
      SELECT user_id, display_name, focused_ms, rank
      FROM ranked
      ORDER BY focused_ms DESC, display_name COLLATE NOCASE ASC, user_id ASC
      LIMIT 100`)
        .bind(weekStart, weekEnd)
        .all<{ user_id: string; display_name: string; focused_ms: number; rank: number }>()
      const own = await env.DB.prepare(`SELECT u.leaderboard_opt_in,
        COALESCE(SUM(fs.duration_ms), 0) AS focused_ms
        FROM users u
        LEFT JOIN focus_session_attendees fsa ON fsa.user_id = u.id
        LEFT JOIN focus_sessions fs ON fs.id = fsa.session_id
          AND fs.completed_at >= ? AND fs.completed_at < ?
        WHERE u.id = ?
        GROUP BY u.id`)
        .bind(weekStart, weekEnd, user.sub)
        .first<{ leaderboard_opt_in: number; focused_ms: number }>()
      const ownRank = own?.leaderboard_opt_in
        ? await env.DB.prepare(`WITH weekly AS (
            SELECT u.id AS user_id, SUM(fs.duration_ms) AS focused_ms
            FROM users u
            JOIN focus_session_attendees fsa ON fsa.user_id = u.id
            JOIN focus_sessions fs ON fs.id = fsa.session_id
            WHERE u.leaderboard_opt_in = 1 AND fs.completed_at >= ? AND fs.completed_at < ?
            GROUP BY u.id
          ), ranked AS (
            SELECT user_id, RANK() OVER (ORDER BY focused_ms DESC) AS rank FROM weekly
          )
          SELECT rank FROM ranked WHERE user_id = ?`)
            .bind(weekStart, weekEnd, user.sub)
            .first<{ rank: number }>()
        : null
      return json({
        weekStart,
        weekEnd,
        optedIn: own?.leaderboard_opt_in === 1,
        ownFocusedMs: own?.focused_ms ?? 0,
        ownRank: ownRank?.rank ?? null,
        entries: ranking.results.map((entry) => ({
          userId: entry.user_id,
          name: entry.display_name,
          focusedMs: entry.focused_ms,
          rank: entry.rank,
        })),
      }, 200, origin)
    }

    if (request.method === "POST" && url.pathname === "/leaderboard/opt-in") {
      let body: { enabled?: unknown }
      try {
        body = await request.json() as { enabled?: unknown }
      } catch {
        return json({ error: "Corpo JSON inválido" }, 400, origin)
      }
      if (typeof body.enabled !== "boolean") return json({ error: "Informe se deseja participar" }, 400, origin)
      await env.DB.prepare("UPDATE users SET leaderboard_opt_in = ?, updated_at = ? WHERE id = ?")
        .bind(body.enabled ? 1 : 0, Date.now(), user.sub)
        .run()
      return json({ optedIn: body.enabled }, 200, origin)
    }

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
        const protocols = request.headers.get("sec-websocket-protocol")?.split(",").map((value) => value.trim()) ?? []
        if (!protocols.includes("ft-pomo")) return json({ error: "WebSocket protocol inválido" }, 400, origin)
        const headers = new Headers(request.headers)
        headers.set("x-auth-user-id", user.sub)
        headers.set("x-auth-user-name", user.name ?? "Participante")
        if (user.image) headers.set("x-auth-user-image", user.image)
        headers.set("sec-websocket-protocol", "ft-pomo")
        const id = env.ROOMS.idFromName(key)
        return env.ROOMS.get(id).fetch(new Request(request, { headers }))
      }

      if (match[2] === "/challenge") {
        if (request.method === "GET") {
          const challenge = await roomChallengeSnapshot(env.DB, room.id, startOfUtcWeek(Date.now()))
          return json({ challenge: challenge ? {
            id: challenge.id,
            weekStart: challenge.week_start,
            weekEnd: challenge.week_start + WEEK_MS,
            targetMs: challenge.target_ms,
            progressMs: challenge.progress_ms,
          } : null }, 200, origin)
        }
        if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin)
        let body: { targetHours?: unknown }
        try {
          body = await request.json() as { targetHours?: unknown }
        } catch {
          return json({ error: "Corpo JSON inválido" }, 400, origin)
        }
        if (typeof body.targetHours !== "number" || !Number.isInteger(body.targetHours) || body.targetHours < 1 || body.targetHours > 500) {
          return json({ error: "A meta deve ter entre 1 e 500 horas" }, 400, origin)
        }
        const now = Date.now()
        const weekStart = startOfUtcWeek(now)
        await env.DB.prepare(`INSERT INTO room_challenges (id, room_id, week_start, target_ms, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(room_id, week_start) DO NOTHING`)
          .bind(crypto.randomUUID(), room.id, weekStart, body.targetHours * 3_600_000, user.sub, now)
          .run()
        await env.DB.prepare("UPDATE rooms SET expires_at = MAX(expires_at, ?) WHERE id = ?")
          .bind(weekStart + WEEK_MS, room.id)
          .run()
        const challenge = await roomChallengeSnapshot(env.DB, room.id, weekStart)
        if (!challenge) return json({ error: "Não foi possível criar o desafio" }, 500, origin)
        return json({ challenge: {
          id: challenge.id,
          weekStart: challenge.week_start,
          weekEnd: challenge.week_start + WEEK_MS,
          targetMs: challenge.target_ms,
          progressMs: challenge.progress_ms,
        } }, 201, origin)
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
    const participants = new Map<string, Attachment>()
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as Attachment | null
      if (!attachment?.userId || !attachment.name) continue
      const participantId = attachment.participantId ?? crypto.randomUUID()
      if (!attachment.participantId) socket.serializeAttachment({ ...attachment, participantId } satisfies Attachment)
      participants.set(attachment.userId, { ...attachment, participantId })
    }
    return [...participants.values()].sort((a, b) => a.name.localeCompare(b.name))
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
    const userId = request.headers.get("x-auth-user-id")
    const name = request.headers.get("x-auth-user-name")?.trim().slice(0, 40)
    const image = request.headers.get("x-auth-user-image") ?? undefined
    if (!userId || !name) return json({ error: "Autenticação necessária" }, 401)

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ participantId: crypto.randomUUID(), userId, name, image } satisfies Attachment)
    await this.sendSnapshot()
    return new Response(null, { status: 101, webSocket: client, headers: { "sec-websocket-protocol": "ft-pomo" } })
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
      let activeFocusSessionId = room.active_focus_session_id

      if (command.type === "start" && status !== "running") {
        if (status === "idle" && phase === "work") {
          activeFocusSessionId = crypto.randomUUID()
          await this.env.DB.prepare("INSERT INTO focus_sessions (id, room_id, started_at, duration_ms) VALUES (?, ?, ?, ?)")
            .bind(activeFocusSessionId, room.id, now, remaining).run()
          const attendeeIds = this.ctx.getWebSockets().map((connection) => {
            const attachment = connection.deserializeAttachment() as Attachment | null
            return attachment?.userId
          })
          for (const attendee of captureAttendeeIds(attendeeIds)) {
            await this.env.DB.prepare("INSERT OR IGNORE INTO focus_session_attendees (session_id, user_id) VALUES (?, ?)")
              .bind(activeFocusSessionId, attendee).run()
          }
        }
        status = "running"
        startedAt = now
        endsAt = now + remaining
      } else if (command.type === "pause" && status === "running") {
        remaining = Math.max(0, (endsAt ?? now) - now)
        status = "paused"
        startedAt = null
        endsAt = null
      } else if (command.type === "reset") {
        activeFocusSessionId = null
        remaining = phase === "work" ? workDuration : breakDuration
        status = "idle"
        startedAt = null
        endsAt = null
      } else if (command.type === "switch") {
        activeFocusSessionId = null
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

      const expiresAt = await roomExpiresAt(this.env.DB, room.id, now)
      await this.env.DB.prepare(`UPDATE rooms SET status = ?, phase = ?, work_duration_ms = ?,
        break_duration_ms = ?, remaining_ms = ?, started_at = ?, ends_at = ?, active_focus_session_id = ?, version = version + 1,
        updated_at = ?, expires_at = ? WHERE id = ?`)
        .bind(status, phase, workDuration, breakDuration, remaining, startedAt, endsAt, activeFocusSessionId, now, expiresAt, room.id)
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
    if (shouldCompleteFocusSession(room.phase, room.active_focus_session_id)) {
      await this.env.DB.prepare("UPDATE focus_sessions SET completed_at = ? WHERE id = ? AND completed_at IS NULL")
        .bind(now, room.active_focus_session_id).run()
    }
    await this.env.DB.prepare(`UPDATE rooms SET status = 'idle', phase = ?, remaining_ms = ?,
      started_at = NULL, ends_at = NULL, active_focus_session_id = NULL, version = version + 1,
      updated_at = ?, expires_at = ? WHERE id = ?`)
      .bind(nextPhase, nextRemaining, now, now + DAY_MS, room.id)
      .run()
    await this.sendSnapshot()
  }
}
