import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let schemaReady: Promise<void> | null = null;

function getD1() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database.",
    );
  }
  return env.DB;
}

export async function ensureDbSchema() {
  const d1 = getD1();
  schemaReady ??= d1
    .batch([
      d1.prepare(`
        CREATE TABLE IF NOT EXISTS leaderboard_scores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          player_id TEXT NOT NULL,
          player_name TEXT NOT NULL,
          fans INTEGER NOT NULL,
          max_combo INTEGER NOT NULL,
          score INTEGER NOT NULL,
          concert TEXT NOT NULL,
          song TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        )
      `),
      d1.prepare(`
        CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_scores_player_id_unique
        ON leaderboard_scores (player_id)
      `),
      d1.prepare(`
        CREATE INDEX IF NOT EXISTS leaderboard_scores_rank_idx
        ON leaderboard_scores (score DESC, fans DESC, max_combo DESC)
      `),
    ])
    .then(() => undefined);
  await schemaReady;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}
