import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { startOfUtcWeek } from "../worker/src/utc-week.ts"

const migrationFiles = [
  "0001_initial.sql",
  "0002_users_and_focus_sessions.sql",
  "0003_leaderboard_opt_in.sql",
  "0004_room_weekly_challenges.sql",
]

function createDatabase() {
  const db = new DatabaseSync(":memory:")
  db.exec("PRAGMA foreign_keys = ON")
  for (const file of migrationFiles) {
    db.exec(readFileSync(new URL(`../worker/migrations/${file}`, import.meta.url), "utf8"))
  }
  return db
}

function seedRoom(db, id = "room-1") {
  db.prepare(`INSERT INTO rooms (id, room_key, created_at, updated_at, expires_at)
    VALUES (?, ?, 1, 1, 9999999999999)`).run(id, id === "room-1" ? "ABC123" : "DEF456")
}

test("UTC week starts Monday at midnight, including the Sunday-to-Monday boundary", () => {
  const monday = Date.parse("2026-10-19T00:00:00.000Z")
  assert.equal(startOfUtcWeek(monday), monday)
  assert.equal(startOfUtcWeek(Date.parse("2026-10-25T23:59:59.999Z")), monday)
  assert.equal(startOfUtcWeek(Date.parse("2026-10-26T00:00:00.000Z")), Date.parse("2026-10-26T00:00:00.000Z"))
})

test("leaderboard participation is off by default and only opted-in users rank for the current week", () => {
  const db = createDatabase()
  seedRoom(db)
  const addUser = db.prepare(`INSERT INTO users (id, display_name, created_at, updated_at)
    VALUES (?, ?, 1, 1)`)
  addUser.run("opted-in", "Ana")
  addUser.run("opted-out", "Bia")
  assert.equal(db.prepare("SELECT leaderboard_opt_in FROM users WHERE id = ?").get("opted-in").leaderboard_opt_in, 0)
  db.prepare("UPDATE users SET leaderboard_opt_in = 1 WHERE id = ?").run("opted-in")

  const weekStart = Date.parse("2026-10-19T00:00:00.000Z")
  const addSession = db.prepare(`INSERT INTO focus_sessions (id, room_id, started_at, completed_at, duration_ms)
    VALUES (?, 'room-1', ?, ?, ?)`)
  addSession.run("in-week", weekStart, weekStart + 10_000, 1_800_000)
  addSession.run("at-next-week", weekStart + 604_800_000, weekStart + 604_800_000, 7_200_000)
  addSession.run("incomplete", weekStart, null, 3_600_000)
  const addAttendee = db.prepare("INSERT INTO focus_session_attendees (session_id, user_id) VALUES (?, ?)")
  addAttendee.run("in-week", "opted-in")
  addAttendee.run("at-next-week", "opted-in")
  addAttendee.run("incomplete", "opted-in")
  addAttendee.run("in-week", "opted-out")

  const entries = db.prepare(`SELECT u.id, SUM(fs.duration_ms) AS focused_ms
    FROM users u JOIN focus_session_attendees fsa ON fsa.user_id = u.id
    JOIN focus_sessions fs ON fs.id = fsa.session_id
    WHERE u.leaderboard_opt_in = 1 AND fs.completed_at >= ? AND fs.completed_at < ?
    GROUP BY u.id ORDER BY focused_ms DESC`).all(weekStart, weekStart + 604_800_000)
  assert.deepEqual(entries.map(({ id, focused_ms }) => ({ id, focused_ms })), [
    { id: "opted-in", focused_ms: 1_800_000 },
  ])
  db.close()
})

test("room challenge progress sums completed focus sessions in its week and enforces one challenge per room/week", () => {
  const db = createDatabase()
  seedRoom(db)
  db.prepare("INSERT INTO users (id, created_at, updated_at) VALUES ('owner', 1, 1)").run()
  const weekStart = Date.parse("2026-10-19T00:00:00.000Z")
  db.prepare(`INSERT INTO room_challenges (id, room_id, week_start, target_ms, created_by, created_at)
    VALUES ('challenge-1', 'room-1', ?, 7_200_000, 'owner', 1)`).run(weekStart)
  const addSession = db.prepare(`INSERT INTO focus_sessions (id, room_id, started_at, completed_at, duration_ms)
    VALUES (?, 'room-1', ?, ?, ?)`)
  addSession.run("challenge-session", weekStart, weekStart + 10_000, 1_800_000)
  addSession.run("outside-week", weekStart + 604_800_000, weekStart + 604_800_000, 3_600_000)
  addSession.run("incomplete", weekStart, null, 3_600_000)

  const progress = db.prepare(`SELECT rc.target_ms,
    COALESCE(SUM(fs.duration_ms), 0) AS progress_ms
    FROM room_challenges rc
    LEFT JOIN focus_sessions fs ON fs.room_id = rc.room_id
      AND fs.completed_at >= rc.week_start AND fs.completed_at < rc.week_start + ?
    WHERE rc.room_id = ? AND rc.week_start = ? GROUP BY rc.id`)
    .get(604_800_000, "room-1", weekStart)
  assert.deepEqual({ ...progress }, { target_ms: 7_200_000, progress_ms: 1_800_000 })
  assert.throws(() => db.prepare(`INSERT INTO room_challenges
    (id, room_id, week_start, target_ms, created_by, created_at)
    VALUES ('duplicate', 'room-1', ?, 7_200_000, 'owner', 1)`).run(weekStart))
  db.close()
})
