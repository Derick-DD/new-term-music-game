import { env } from "cloudflare:workers";
import {
  CREATE_LEADERBOARD_RANK_INDEX_SQL,
  CREATE_LEADERBOARD_TABLE_SQL,
  CREATE_LEADERBOARD_UNIQUE_INDEX_SQL,
} from "./schema";

let schemaReady: Promise<void> | null = null;

async function ensureDbSchema(database: D1Database) {
  schemaReady ??= database
    .batch([
      database.prepare(CREATE_LEADERBOARD_TABLE_SQL),
      database.prepare(CREATE_LEADERBOARD_UNIQUE_INDEX_SQL),
      database.prepare(CREATE_LEADERBOARD_RANK_INDEX_SQL),
    ])
    .then(() => undefined)
    .catch((error) => {
      schemaReady = null;
      throw error;
    });
  await schemaReady;
}

export async function getDb() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  await ensureDbSchema(env.DB);
  return env.DB;
}
