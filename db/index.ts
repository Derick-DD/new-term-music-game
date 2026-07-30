import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

type DatabaseState = {
  connection: DatabaseSync | null;
  initialized: boolean;
};

const globalDatabase = globalThis as typeof globalThis & {
  fanBusDatabase?: DatabaseState;
};

const databaseState =
  globalDatabase.fanBusDatabase ??
  (globalDatabase.fanBusDatabase = {
    connection: null,
    initialized: false,
  });

function resolveDatabasePath() {
  const configuredPath = process.env.DATABASE_PATH?.trim();
  if (!configuredPath) {
    return join(
      /* turbopackIgnore: true */ process.cwd(),
      "data",
      "fan-bus.sqlite",
    );
  }
  if (configuredPath === ":memory:" || isAbsolute(configuredPath)) {
    return configuredPath;
  }
  return join(/* turbopackIgnore: true */ process.cwd(), configuredPath);
}

export function getDb() {
  if (!databaseState.connection) {
    const databasePath = resolveDatabasePath();
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }
    databaseState.connection = new DatabaseSync(databasePath);
    databaseState.connection.exec("PRAGMA journal_mode = WAL");
    databaseState.connection.exec("PRAGMA busy_timeout = 5000");
    databaseState.connection.exec("PRAGMA foreign_keys = ON");
  }

  if (!databaseState.initialized) {
    ensureDbSchema(databaseState.connection);
    databaseState.initialized = true;
  }
  return databaseState.connection;
}

export function ensureDbSchema(database = databaseState.connection) {
  if (!database) {
    getDb();
    return;
  }

  database
    .prepare(
      `CREATE TABLE IF NOT EXISTS leaderboard_scores (
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
      )`,
    )
    .run();

  const columns = database
    .prepare("PRAGMA table_info(leaderboard_scores)")
    .all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "song_key")) {
    database
      .prepare(
        "ALTER TABLE leaderboard_scores ADD COLUMN song_key TEXT NOT NULL DEFAULT 'legacy'",
      )
      .run();
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare("DROP INDEX IF EXISTS leaderboard_scores_player_id_unique")
      .run();
    database
      .prepare("DROP INDEX IF EXISTS leaderboard_scores_rank_idx")
      .run();
    database
      .prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_scores_player_song_unique
         ON leaderboard_scores (player_id, song_key)`,
      )
      .run();
    database
      .prepare(
        `CREATE INDEX IF NOT EXISTS leaderboard_scores_rank_idx
         ON leaderboard_scores (
           song_key,
           score DESC,
           fans DESC,
           max_combo DESC,
           updated_at DESC
         )`,
      )
      .run();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
