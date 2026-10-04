CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  room_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'paused')),
  phase TEXT NOT NULL DEFAULT 'work' CHECK (phase IN ('work', 'break')),
  work_duration_ms INTEGER NOT NULL DEFAULT 1500000,
  break_duration_ms INTEGER NOT NULL DEFAULT 300000,
  remaining_ms INTEGER NOT NULL DEFAULT 1500000,
  started_at INTEGER,
  ends_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS rooms_expires_at_idx ON rooms (expires_at);
