ALTER TABLE users ADD COLUMN leaderboard_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (leaderboard_opt_in IN (0, 1));

CREATE INDEX IF NOT EXISTS focus_sessions_weekly_leaderboard_idx
  ON focus_sessions (completed_at, id);
