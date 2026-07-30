import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const leaderboardScores = sqliteTable(
  "leaderboard_scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    playerId: text("player_id").notNull(),
    playerName: text("player_name").notNull(),
    fans: integer("fans").notNull(),
    maxCombo: integer("max_combo").notNull(),
    score: integer("score").notNull(),
    concert: text("concert").notNull(),
    song: text("song").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("leaderboard_scores_player_id_unique").on(table.playerId),
    index("leaderboard_scores_rank_idx").on(
      table.score,
      table.fans,
      table.maxCombo,
    ),
  ],
);
