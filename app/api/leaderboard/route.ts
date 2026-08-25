import { getDb } from "../../../db";
import treasureChart from "../../data/congratulations-treasure.chart.json";

const TOP_LIMIT = 8;
const ACTIVITY_SONG_KEY = `track:${treasureChart.audio.id}:${treasureChart.chartVersion}`;
const ACTIVITY_SONG_TITLE = treasureChart.audio.title;

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

function resultTierForScore(score: number) {
  if (score >= 6_500) return "天才学神";
  if (score >= 4_500) return "隐形学霸";
  if (score >= 2_800) return "卷王本王";
  if (score >= 1_400) return "知识分子";
  return "佛系咸鱼";
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
    // Recompute the label so scores saved by an earlier campaign never leak
    // obsolete venue names into the campus-season leaderboard.
    concert: resultTierForScore(row.score),
    song: row.song,
    createdAt: row.updated_at,
    rank: row.rank,
  };
}

async function getLeaderboard(songKey: string, currentPlayerId?: string) {
  const database = await getDb();
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
  const { results } = await database
    .prepare(`${rankedQuery} ORDER BY rank ASC LIMIT ?`)
    .bind(songKey, TOP_LIMIT)
    .all<RankedLeaderboardRow>();
  const rows = [...results];

  if (
    currentPlayerId &&
    !rows.some((row) => row.player_id === currentPlayerId)
  ) {
    const currentRow = await database
      .prepare(
        `SELECT * FROM (${rankedQuery}) ranked
         WHERE player_id = ?
         LIMIT 1`,
      )
      .bind(songKey, currentPlayerId)
      .first<RankedLeaderboardRow>();
    if (currentRow) rows.push(currentRow);
  }

  return rows.map(mapLeaderboardRow);
}

export async function GET(request: Request) {
  try {
    const songKey =
      new URL(request.url).searchParams.get("songKey")?.trim() ?? "";
    if (songKey !== ACTIVITY_SONG_KEY) {
      return Response.json({ error: "活动排行榜标识无效" }, { status: 400 });
    }
    return Response.json({ leaderboard: await getLeaderboard(songKey) });
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
      songKey?: string;
    };
    const playerId = payload.playerId?.trim() ?? "";
    const name = (payload.name?.trim() || "校园新生").slice(0, 10);
    const fans = Math.round(Number(payload.fans));
    const maxCombo = Math.round(Number(payload.maxCombo));
    const song = ACTIVITY_SONG_TITLE;
    const songKey = payload.songKey?.trim().slice(0, 100) ?? "";

    if (
      playerId.length < 8 ||
      playerId.length > 80 ||
      songKey !== ACTIVITY_SONG_KEY ||
      !Number.isInteger(fans) ||
      fans < 0 ||
      fans > 120 ||
      !Number.isInteger(maxCombo) ||
      maxCombo < 0 ||
      maxCombo > 10_000
    ) {
      return Response.json({ error: "排行榜成绩无效" }, { status: 400 });
    }

    const database = await getDb();
    const score = fans * maxCombo;
    const concert = resultTierForScore(score);
    const submittedAt = Date.now();
    await database
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(player_id, song_key) DO UPDATE SET
          player_name = excluded.player_name,
          fans = CASE
            WHEN excluded.score > leaderboard_scores.score
              OR (excluded.score = leaderboard_scores.score AND excluded.fans > leaderboard_scores.fans)
              OR (excluded.score = leaderboard_scores.score AND excluded.fans = leaderboard_scores.fans AND excluded.max_combo > leaderboard_scores.max_combo)
            THEN excluded.fans ELSE leaderboard_scores.fans END,
          max_combo = CASE
            WHEN excluded.score > leaderboard_scores.score
              OR (excluded.score = leaderboard_scores.score AND excluded.fans > leaderboard_scores.fans)
              OR (excluded.score = leaderboard_scores.score AND excluded.fans = leaderboard_scores.fans AND excluded.max_combo > leaderboard_scores.max_combo)
            THEN excluded.max_combo ELSE leaderboard_scores.max_combo END,
          score = MAX(leaderboard_scores.score, excluded.score),
          concert = CASE
            WHEN excluded.score > leaderboard_scores.score
              OR (excluded.score = leaderboard_scores.score AND excluded.fans > leaderboard_scores.fans)
              OR (excluded.score = leaderboard_scores.score AND excluded.fans = leaderboard_scores.fans AND excluded.max_combo > leaderboard_scores.max_combo)
            THEN excluded.concert ELSE leaderboard_scores.concert END,
          song = excluded.song,
          updated_at = CASE
            WHEN excluded.player_name <> leaderboard_scores.player_name
              OR excluded.score > leaderboard_scores.score
              OR (excluded.score = leaderboard_scores.score AND excluded.fans > leaderboard_scores.fans)
              OR (excluded.score = leaderboard_scores.score AND excluded.fans = leaderboard_scores.fans AND excluded.max_combo > leaderboard_scores.max_combo)
            THEN excluded.updated_at ELSE leaderboard_scores.updated_at END`,
      )
      .bind(
        playerId,
        name,
        songKey,
        fans,
        maxCombo,
        score,
        concert,
        song,
        submittedAt,
      )
      .run();

    return Response.json(
      {
        leaderboard: await getLeaderboard(songKey, playerId),
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
