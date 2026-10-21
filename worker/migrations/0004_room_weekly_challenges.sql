CREATE TABLE IF NOT EXISTS room_challenges (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  week_start INTEGER NOT NULL,
  target_ms INTEGER NOT NULL CHECK (target_ms >= 60000),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  UNIQUE (room_id, week_start)
);

CREATE INDEX IF NOT EXISTS room_challenges_week_start_idx ON room_challenges (week_start);
CREATE INDEX IF NOT EXISTS focus_sessions_room_completed_idx ON focus_sessions (room_id, completed_at);
