import { getDb } from "../../../db";

export const runtime = "nodejs";

const TOP_LIMIT = 8;

type RankedLeaderboardRow = {
  id: number;
  player_id: string;
  player_name: string;
  song_key: string;
  fans: number;
  max_combo: number;
  score: number;
  concert: string;
  song: string;
  updated_at: number;
  rank: number;
};

type StoredLeaderboardRow = Omit<RankedLeaderboardRow, "rank">;

function concertForScore(score: number) {
  if (score >= 6_500) return "星河体育场";
  if (score >= 4_500) return "霓虹体育馆";
  if (score >= 2_800) return "城市剧场";
  if (score >= 1_400) return "星光 Livehouse";
  return "街角快闪";
}

function mapLeaderboardRow(row: RankedLeaderboardRow) {
  return {
    id: row.id,
    playerId: row.player_id,
    name: row.player_name,
    songKey: row.song_key,
    fans: row.fans,
    maxCombo: row.max_combo,
    score: row.score,
    concert: row.concert,
    song: row.song,
    createdAt: row.updated_at,
    rank: row.rank,
  };
}

function getLeaderboard(songKey: string, currentPlayerId?: string) {
  const database = getDb();
  const rankedQuery = `
    SELECT
      id,
      player_id,
      player_name,
      song_key,
      fans,
      max_combo,
      score,
      concert,
      song,
      updated_at,
      ROW_NUMBER() OVER (
        ORDER BY
          score DESC,
          fans DESC,
          max_combo DESC,
          updated_at DESC
      ) AS rank
    FROM leaderboard_scores
    WHERE song_key = ?
  `;
  const rows = database
    .prepare(`${rankedQuery} ORDER BY rank ASC LIMIT ?`)
    .all(songKey, TOP_LIMIT) as RankedLeaderboardRow[];

  if (
    currentPlayerId &&
    !rows.some((row) => row.player_id === currentPlayerId)
  ) {
    const currentRow = database
      .prepare(
        `SELECT * FROM (${rankedQuery}) ranked
         WHERE player_id = ?
         LIMIT 1`,
      )
      .get(songKey, currentPlayerId) as RankedLeaderboardRow | undefined;
    if (currentRow) rows.push(currentRow);
  }

  return rows.map(mapLeaderboardRow);
}

export async function GET(request: Request) {
  try {
    const songKey =
      new URL(request.url).searchParams.get("songKey")?.trim() ?? "";
    if (!songKey || songKey.length > 100) {
      return Response.json({ error: "请选择歌曲后查看排行榜" }, { status: 400 });
    }
    return Response.json({ leaderboard: getLeaderboard(songKey) });
  } catch (error) {
    console.error("[leaderboard] load failed", error);
    return Response.json(
      { error: "歌曲排行榜暂时不可用" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      playerId?: string;
      name?: string;
      fans?: number;
      maxCombo?: number;
      song?: string;
      songKey?: string;
    };
    const playerId = payload.playerId?.trim() ?? "";
    const name = (payload.name?.trim() || "巡演玩家").slice(0, 10);
    const fans = Math.round(Number(payload.fans));
    const maxCombo = Math.round(Number(payload.maxCombo));
    const song = (payload.song?.trim() || "未知歌曲").slice(0, 80);
    const songKey = payload.songKey?.trim().slice(0, 100) ?? "";

    if (
      playerId.length < 8 ||
      playerId.length > 80 ||
      !songKey ||
      !Number.isInteger(fans) ||
      fans < 0 ||
      fans > 120 ||
      !Number.isInteger(maxCombo) ||
      maxCombo < 0 ||
      maxCombo > 10_000
    ) {
      return Response.json({ error: "排行榜成绩无效" }, { status: 400 });
    }

    const database = getDb();
    const score = fans * maxCombo;
    const concert = concertForScore(score);
    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = database
        .prepare(
          `SELECT
            id,
            player_id,
            player_name,
            song_key,
            fans,
            max_combo,
            score,
            concert,
            song,
            updated_at
           FROM leaderboard_scores
           WHERE player_id = ? AND song_key = ?
           LIMIT 1`,
        )
        .get(playerId, songKey) as StoredLeaderboardRow | undefined;

      if (!existing) {
        database
          .prepare(
            `INSERT INTO leaderboard_scores (
              player_id,
              player_name,
              song_key,
              fans,
              max_combo,
              score,
              concert,
              song,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            playerId,
            name,
            songKey,
            fans,
            maxCombo,
            score,
            concert,
            song,
            Date.now(),
          );
      } else {
        const isBetterScore =
          score > existing.score ||
          (score === existing.score && fans > existing.fans) ||
          (score === existing.score &&
            fans === existing.fans &&
            maxCombo > existing.max_combo);
        if (isBetterScore) {
          database
            .prepare(
              `UPDATE leaderboard_scores
               SET
                 player_name = ?,
                 fans = ?,
                 max_combo = ?,
                 score = ?,
                 concert = ?,
                 song = ?,
                 updated_at = ?
               WHERE player_id = ? AND song_key = ?`,
            )
            .run(
              name,
              fans,
              maxCombo,
              score,
              concert,
              song,
              Date.now(),
              playerId,
              songKey,
            );
        } else if (name !== existing.player_name) {
          database
            .prepare(
              `UPDATE leaderboard_scores
               SET player_name = ?, updated_at = ?
               WHERE player_id = ? AND song_key = ?`,
            )
            .run(name, Date.now(), playerId, songKey);
        }
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    return Response.json(
      {
        leaderboard: getLeaderboard(songKey, playerId),
        submittedScore: score,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[leaderboard] submit failed", error);
    return Response.json(
      { error: "歌曲排行榜成绩提交失败" },
      { status: 500 },
    );
  }
}
