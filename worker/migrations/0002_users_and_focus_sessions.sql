CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  duration_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS focus_session_attendees (
  session_id TEXT NOT NULL REFERENCES focus_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS focus_sessions_completed_at_idx ON focus_sessions(completed_at);
CREATE INDEX IF NOT EXISTS focus_session_attendees_user_id_idx ON focus_session_attendees(user_id);

ALTER TABLE rooms ADD COLUMN active_focus_session_id TEXT;
