import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let schemaReady: Promise<void> | null = null;

export function getD1() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database.",
    );
  }
  return env.DB;
}

export async function ensureDbSchema() {
  const d1 = getD1();
  schemaReady ??= (async () => {
    await d1
      .prepare(`
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
        )
      `)
      .run();

    const columns = await d1
      .prepare("PRAGMA table_info(leaderboard_scores)")
      .all<{ name: string }>();
    if (!columns.results.some((column) => column.name === "song_key")) {
      await d1
        .prepare(
          "ALTER TABLE leaderboard_scores ADD COLUMN song_key TEXT NOT NULL DEFAULT 'legacy'",
        )
        .run();
    }

    await d1.batch([
      d1.prepare(`
        DROP INDEX IF EXISTS leaderboard_scores_player_id_unique
      `),
      d1.prepare(`
        DROP INDEX IF EXISTS leaderboard_scores_rank_idx
      `),
      d1.prepare(`
        CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_scores_player_song_unique
        ON leaderboard_scores (player_id, song_key)
      `),
      d1.prepare(`
        CREATE INDEX IF NOT EXISTS leaderboard_scores_rank_idx
        ON leaderboard_scores (
          song_key,
          score DESC,
          fans DESC,
          max_combo DESC,
          updated_at DESC
        )
      `),
    ]);
  })();
  await schemaReady;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}
