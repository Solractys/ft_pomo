import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"

test("profile totals include only completed focus sessions for their captured attendees", () => {
  const db = new DatabaseSync(":memory:")
  db.exec("PRAGMA foreign_keys = ON")
  db.exec(readFileSync(new URL("../worker/migrations/0001_initial.sql", import.meta.url), "utf8"))
  db.exec(readFileSync(new URL("../worker/migrations/0002_users_and_focus_sessions.sql", import.meta.url), "utf8"))

  db.prepare(`INSERT INTO rooms (id, room_key, created_at, updated_at, expires_at)
    VALUES ('room-1', 'ABC123', 1, 1, 9999999999999)`).run()
  const addUser = db.prepare(`INSERT INTO users (id, created_at, updated_at) VALUES (?, 1, 1)`)
  addUser.run("present-at-start")
  addUser.run("late-joiner")

  const addSession = db.prepare(`INSERT INTO focus_sessions (id, room_id, started_at, completed_at, duration_ms)
    VALUES (?, 'room-1', 10, ?, 1500000)`)
  addSession.run("completed", 20)
  addSession.run("reset-before-complete", null)
  const addAttendee = db.prepare(`INSERT INTO focus_session_attendees (session_id, user_id) VALUES (?, ?)`)
  addAttendee.run("completed", "present-at-start")
  addAttendee.run("reset-before-complete", "present-at-start")

  const profile = db.prepare(`SELECT COALESCE(SUM(fs.duration_ms), 0) AS total_focused_ms,
    COUNT(fs.id) AS completed_sessions FROM focus_session_attendees fsa
    JOIN focus_sessions fs ON fs.id = fsa.session_id
    WHERE fsa.user_id = ? AND fs.completed_at IS NOT NULL`).get("present-at-start")
  const lateJoinerProfile = db.prepare(`SELECT COUNT(fs.id) AS completed_sessions
    FROM focus_session_attendees fsa JOIN focus_sessions fs ON fs.id = fsa.session_id
    WHERE fsa.user_id = ? AND fs.completed_at IS NOT NULL`).get("late-joiner")

  assert.deepEqual({ ...profile }, { total_focused_ms: 1500000, completed_sessions: 1 })
  assert.equal(lateJoinerProfile.completed_sessions, 0)
  db.close()
})
