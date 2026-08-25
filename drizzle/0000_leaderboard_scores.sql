CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  song_key TEXT NOT NULL DEFAULT 'legacy',
  fans INTEGER NOT NULL,
  max_combo INTEGER NOT NULL,
  score INTEGER NOT NULL,
  concert TEXT NOT NULL,
  song TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_scores_player_song_unique
ON leaderboard_scores (player_id, song_key);

CREATE INDEX IF NOT EXISTS leaderboard_scores_rank_idx
ON leaderboard_scores (
  song_key,
  score DESC,
  fans DESC,
  max_combo DESC,
  updated_at DESC
);
