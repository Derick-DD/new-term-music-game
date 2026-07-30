import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the rules-first rhythm game interface", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /应援大巴冲冲冲！/);
  assert.match(page, /TONIGHT&apos;S STORY/);
  assert.match(page, /应援大巴/);
  assert.match(page, /冲冲冲！/);
  assert.match(page, /巡演故事/);
  assert.match(page, /把一路加入的粉丝/);
  assert.match(page, /空车出发/);
  assert.match(page, /收集应援棒/);
  assert.match(page, /应援棒到达黄色判定线时按 <em>HIT<\/em> 吸粉/);
  assert.match(page, /粉丝 \+1/);
  assert.match(page, /点亮更大舞台/);
  assert.match(page, /让每一位粉丝准时抵达现场/);
  assert.match(page, /PLAYER NAME/);
  assert.match(page, /className="song-player-name-field"/);
  assert.match(page, /排行榜昵称/);
  assert.match(page, /请输入昵称后发车/);
  assert.match(page, /成绩将以此昵称进入全局排行榜/);
  assert.match(page, /请先填写排行榜昵称/);
  assert.match(page, /开始巡演 · 进入选歌/);
  assert.doesNotMatch(page, /className="side-panel/);
  assert.match(page, /className="hit-button"/);
  assert.match(page, /className={`joystick-control/);
  assert.match(page, /<small>BUS<\/small>/);
  assert.match(page, /星芽小巴/);
  assert.match(page, /载客上限/);
});

test("keeps beat analysis and active hit judgement in the client game", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /function analyzeAudioBuffer/);
  assert.match(page, /decodeAudioData/);
  assert.match(page, /const notePattern = intensityPattern\.map/);
  assert.match(page, /detectedNotePatternRef/);
  assert.match(page, /if \(noteLevel !== 2\) return/);
  assert.match(page, /mapTheme: "illusion-city"/);
  assert.match(page, /mapTheme: "candy-blocks"/);
  assert.match(page, /mapTheme: "earth-orbit"/);
  assert.match(page, /怪火/);
  assert.match(page, /略略略略略/);
  assert.match(page, /昨晚我环游了地球/);
  assert.match(page, /id="custom-song-upload"/);
  assert.match(page, /const hitNote = useCallback/);
  assert.match(page, /const playPerfectHit = useCallback/);
  assert.match(page, /if \(quality === "PERFECT"\) \{\s*playPerfectHit\(\);/);
  assert.match(page, /frequency: 1665/);
  assert.match(page, /function triggerHaptic/);
  assert.match(page, /className="steer-glyph"/);
  assert.doesNotMatch(page, />\s*↔\s*</);
  assert.match(
    page,
    /const BUILT_IN_TRACK_ORDER[\s\S]*"earth-tour",\s*"lueluelue",\s*"guaihuo"/,
  );
  assert.match(page, /grannyBeats: \[number, number\]/);
  assert.match(page, /function getPedestrianBeats/);
  assert.match(page, /firstBeat \+ 20/);
  assert.match(page, /第二位行人从另一侧通过/);
  assert.match(page, /"PERFECT" \| "GREAT" \| "GOOD" \| "MISS"/);
  assert.match(page, /const VEHICLE_LEVELS/);
  assert.match(page, /const pauseGame = useCallback/);
  assert.match(page, /const resumeGame = useCallback/);
  assert.match(page, /const openLuckyBag = useCallback/);
  assert.match(page, /const continueLuckyGame = useCallback/);
  assert.match(page, /是否开启锦囊？/);
  assert.match(page, /GOOD LUCK/);
  assert.match(page, /粉丝减半并中断连击/);
  assert.match(page, /确认并继续/);
  assert.match(page, /Math\.random\(\) < 0\.55/);
  assert.match(page, /const POWERUP_DURATION_MS = 5_000/);
  assert.match(page, /const HIT_INPUT_GUARD_MS = 70/);
  assert.match(page, /const STARTING_FANS = 0/);
  assert.match(page, /const MIN_PLAYABLE_STRONG_BEATS = 90/);
  assert.match(page, /const MIN_STRONG_BEAT_GAP = 2/);
  assert.match(page, /const MAX_STRONG_BEAT_GAP = 4/);
  assert.match(page, /const MIN_OBSTACLE_BEAT_GAP = 3/);
  assert.match(page, /const POWERUP_TRAIL_DELAY_MS = 220/);
  assert.match(page, /const OBSTACLE_COLLISION_BEFORE = 36/);
  assert.match(page, /const OBSTACLE_COLLISION_AFTER = 40/);
  assert.match(page, /const MAGNET_RADIUS = 185/);
  assert.match(page, /type: "fan"/);
  assert.match(page, /type: bonusType/);
  assert.match(page, /spawnAt: spawnAt \+ POWERUP_TRAIL_DELAY_MS/);
  assert.match(page, /targetBeat - lastObstacleTargetBeatRef\.current/);
  assert.match(page, /const busScale = 1 \+ \(vehicle\.level - 1\) \* 0\.015/);
  assert.match(page, /ctx\.fillRect\(-26, -52, 52, 105\)/);
  assert.match(page, /MAGNET PERFECT · \+1 FAN/);
  assert.doesNotMatch(page, /MAGNET ACTIVE · AUTO PERFECT/);
  assert.match(page, /lastHitInputAtRef\.current < HIT_INPUT_GUARD_MS/);
  assert.match(page, /附近应援棒自动 PERFECT/);
  assert.match(page, /十万伏特！5 秒内电光无敌/);
  assert.match(page, /水晶吸铁石/);
  assert.match(page, /romance-magnet\.png/);
  assert.match(page, /hundred-thousand-volts\.png/);
  assert.match(page, /lucky-bag\.png/);
  assert.match(page, /crystal-obstacle\.png/);
  assert.match(page, /key=\{`toast-\$\{toast\.key\}`\}/);
  assert.match(page, /key=\{`judgement-\$\{noteJudgement\.key\}`\}/);
  assert.match(page, /elapsed < invincibleUntilRef\.current/);
  assert.match(page, /entity\.obstacle === "barrier"\s*\? \[85, 35, 120\]/);
  assert.match(page, /audioRef\.current\?\.suspend/);
  assert.match(page, /vehicleLevelRef\.current = 1/);
  assert.doesNotMatch(page, /localStorage\.setItem\("fan-bus-vehicle-level"/);
  assert.match(page, /requirement: \{ hits: 4, perfect: 1 \}/);
  assert.match(page, /requirement: \{ hits: 12, maxCombo: 6 \}/);
  assert.match(page, /requirement: \{ hits: 22, perfect: 7, maxCombo: 10 \}/);
  assert.match(page, /const stopJoystick = useCallback/);
  assert.match(page, /const steerWithJoystick = useCallback/);
  assert.match(page, /const JOYSTICK_FIRST_REPEAT_MS = 280/);
  assert.match(page, /const JOYSTICK_REPEAT_MS = 220/);
  assert.match(page, /const deadZone = Math\.max\(20, maxTravel \* 0\.38\)/);
  assert.match(page, /演唱会积分/);
  assert.match(page, /fans \* maxCombo/);
  assert.match(page, /fetch\("\/api\/leaderboard"/);
  assert.match(page, /SONG TOP 8/);
  assert.match(page, /分享巡演成绩/);
  assert.match(page, /createShareCardBlob/);
  assert.match(page, /className="share-result-card"/);
  assert.match(page, /SONG RANK/);
  assert.match(page, /navigator\.share/);
  assert.match(page, /downloadShareCard/);
  assert.match(page, /getLeaderboardSongKey/);
  assert.match(page, /songKey: getLeaderboardSongKey/);
  assert.match(page, /if \(!upgraded\)/);
  assert.doesNotMatch(page, /map-balance-note|intro-copy/);
  assert.match(page, /createMediaElementSource/);
  assert.match(page, /createBiquadFilter/);
  assert.match(page, /songRef\.current\.playbackRate = 1/);
  assert.doesNotMatch(page, /playbackRate\s*=\s*(?:0\.|1\.[1-9])/);
  assert.doesNotMatch(page, /仁义茶楼|GAI · REN YI TEAHOUSE/);
  assert.doesNotMatch(page, /https?:\/\/.*\.(mp3|m4a|wav|aac|ogg)/i);
});

test("keeps the road and power-up rows aligned without an obstacle placeholder", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.equal((page.match(/: "障碍物"/g) ?? []).length, 2);
  assert.match(page, /"电流路障"/);
  assert.match(page, /"故障音箱"/);
  assert.doesNotMatch(page, /obstacle-group-label/);
  assert.match(
    styles,
    /\.hud\s*\{[\s\S]*?grid-template-columns:\s*19%\s+19%\s+44%\s+18%/,
  );
  assert.match(
    styles,
    /\.vehicle-upgrade-strip\s*\{[\s\S]*?grid-template-columns:\s*19%\s+19%\s+44%\s+18%/,
  );
  assert.match(
    styles,
    /\.road-legend\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styles,
    /\.powerup-legend\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
});

test("isolates the lueluelue hand-drawn theme and keeps all supplied assets", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const assetNames = [
    "concert-road.png",
    "support-light-stick.png",
    "electric-barrier.png",
    "broken-speakers.png",
    "chained-mine.png",
    "level-2-scooter.png",
    "level-3-car.png",
    "level-4-stage-truck.png",
    "magnet.png",
    "lucky-bag.png",
    "invincible.png",
  ];
  const assets = await Promise.all(
    assetNames.map((assetName) =>
      readFile(
        new URL(`../public/assets/lueluelue/${assetName}`, import.meta.url),
      ),
    ),
  );

  assert.ok(assets.every((asset) => asset.byteLength > 1_000));
  assert.match(page, /const LUELUELUE_ASSETS/);
  assert.match(page, /const isLueLueLue = activeTrack\.id === "lueluelue"/);
  assert.match(page, /selectedTrackId === "lueluelue"\s*\? "is-lueluelue"/);
  assert.match(page, /lueLueLueImages\.levelTwoScooter/);
  assert.match(page, /lueLueLueImages\.levelThreeCar/);
  assert.match(page, /lueLueLueImages\.levelFourStageTruck/);
  assert.match(page, /entity\.obstacle === "cone"[\s\S]*chainedMine/);
  assert.match(page, /entity\.obstacle === "speaker"[\s\S]*brokenSpeakers/);
  assert.match(page, /entity\.obstacle === "barrier"[\s\S]*electricBarrier/);
  assert.match(styles, /:not\(\.is-earth-tour\):not\(\.is-lueluelue\)/);
  assert.match(styles, /\.road-icon\.is-light-stick\.is-lueluelue/);
  assert.match(styles, /\.legend-icon\.is-invincible\.is-lueluelue/);
});

test("keeps Alibaba Cloud compatible per-song leaderboard persistence", async () => {
  const [route, database, packageFile, nextConfig, dockerfile, compose] =
    await Promise.all([
      readFile(
        new URL("../app/api/leaderboard/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
      readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
      readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"),
    ]);

  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /const score = fans \* maxCombo/);
  assert.match(route, /if \(score >= 6_500\)/);
  assert.match(route, /const TOP_LIMIT = 8/);
  assert.match(route, /ROW_NUMBER\(\) OVER/);
  assert.match(route, /WHERE player_id = \? AND song_key = \?/);
  assert.match(route, /submittedScore: score/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS leaderboard_scores/);
  assert.match(database, /leaderboard_scores_player_song_unique/);
  assert.match(database, /ALTER TABLE leaderboard_scores ADD COLUMN song_key/);
  assert.match(database, /new DatabaseSync\(databasePath\)/);
  assert.match(database, /from "node:sqlite"/);
  assert.match(database, /process\.env\.DATABASE_PATH/);
  assert.match(database, /journal_mode = WAL/);
  assert.doesNotMatch(packageFile, /better-sqlite3/);
  assert.doesNotMatch(packageFile, /vinext|wrangler|@cloudflare\/vite-plugin/);
  assert.match(nextConfig, /output: "standalone"/);
  assert.match(dockerfile, /DATABASE_PATH=\/app\/data\/fan-bus\.sqlite/);
  assert.match(compose, /fan_bus_data:\/app\/data/);
});
