import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const FIXED_AUDIO_FILE = "congratulations-treasure-tf-family.mp3";
const CHART_FILE = "congratulations-treasure.chart.json";
const EXPECTED_AUDIO_SHA256 =
  "448bddb1c19d0da0fe5911a28babbdbe6ce73477c1bcc0eaffea64c49e8874b5";
const CAMPUS_ICON_FILES = [
  "campus-magnet.png",
  "close.png",
  "crossing-warning.png",
  "energy-lightning.png",
  "grandma-crossing.png",
  "knowledge-star.png",
  "mystery-schoolbag.png",
  "obstacle-barrier.png",
  "obstacle-cone.png",
  "obstacle-pothole.png",
  "outcome-genius.png",
  "outcome-grind-king.png",
  "outcome-hidden-achiever.png",
  "outcome-scholar.png",
  "outcome-slacker-fish.png",
  "pause.png",
  "pencil-mark.png",
  "play.png",
  "restart.png",
  "steer.png",
];

const escapeRegExp = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("opens on the campus-season home page before the rhythm game", async () => {
  const [page, layout, playIcon, campusHero, socialCard] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../public/assets/campus-season/icons/play.png",
        import.meta.url,
      ),
    ),
    readFile(
      new URL(
        "../public/assets/campus-season/campus-hero.png",
        import.meta.url,
      ),
    ),
    readFile(new URL("../public/og-sites.png", import.meta.url)),
  ]);

  assert.match(layout, /const title = "开学冲冲冲！"/);
  assert.match(layout, /校园节拍/);
  assert.match(layout, /\/og-sites\.png/);
  assert.match(layout, /width: 1734/);
  assert.match(layout, /height: 907/);
  assert.match(layout, /开学冲冲冲校园节奏游戏/);
  assert.ok(playIcon.byteLength > 1_000);
  assert.ok(campusHero.byteLength > 1_000);
  assert.ok(socialCard.byteLength > 1_000);

  assert.match(page, /type ReadyPage = "home" \| "rules" \| "start"/);
  assert.match(page, /useState<ReadyPage>\("home"\)/);
  assert.match(page, /className="home-screen"/);
  assert.match(page, /开学/);
  assert.match(page, /冲冲冲/);
  assert.match(page, />走进校园</);
  assert.match(page, /onClick=\{\(\) => setReadyPage\("start"\)\}/);
  assert.match(page, /查看玩法/);
  assert.match(page, /play: "\/assets\/campus-season\/icons\/play\.png"/);
  assert.match(page, /src=\{UI_ICONS\.play\}/);
  assert.match(page, /className="song-player-name-field"/);
  assert.match(page, /排行榜昵称/);
  assert.match(page, /请输入校园昵称/);
  assert.match(page, /请先填写排行榜昵称/);
  assert.doesNotMatch(page, /className="side-panel/);
  assert.match(page, /className="hit-button"/);
  assert.match(page, /className={`joystick-control/);
  assert.doesNotMatch(page, /setReadyPage\("songs"\)/);
});

test("uses one fixed audio file and a versioned precomputed chart", async () => {
  const [page, chartSource, audio, publicAudioFiles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL(`../app/data/${CHART_FILE}`, import.meta.url), "utf8"),
    readFile(
      new URL(`../public/audio/${FIXED_AUDIO_FILE}`, import.meta.url),
    ),
    readdir(new URL("../public/audio/", import.meta.url)),
  ]);
  const chart = JSON.parse(chartSource);
  const audioFiles = publicAudioFiles
    .filter((fileName) => /\.(?:mp3|m4a|wav|aac|ogg|flac)$/i.test(fileName))
    .sort();
  const audioHash = createHash("sha256").update(audio).digest("hex");
  const { beatTimesMs } = chart.timing;
  const { lanePattern, notePattern, intensityPattern } = chart.gameplay;

  assert.deepEqual(audioFiles, [FIXED_AUDIO_FILE]);
  assert.ok(audio.byteLength > 1_000_000);
  assert.equal(audioHash, EXPECTED_AUDIO_SHA256);
  assert.equal(chart.schemaVersion, 1);
  assert.equal(chart.chartVersion, "treasure-120bpm-v1");
  assert.equal(chart.generatorVersion, "fixed-grid-energy-v1");
  assert.equal(chart.audio.id, "congratulations-treasure-tf-family");
  assert.equal(chart.audio.title, "恭喜你发现了宝藏");
  assert.equal(chart.audio.artist, "TF家族");
  assert.equal(chart.audio.durationMs, 86_000);
  assert.equal(chart.audio.sha256, EXPECTED_AUDIO_SHA256);
  assert.equal(chart.audio.localSrc, `/audio/${FIXED_AUDIO_FILE}`);
  assert.equal(chart.timing.bpm, 120);
  assert.equal(chart.timing.offsetMs, 0);
  assert.equal(chart.timing.intervalMs, 500);
  assert.equal(chart.timing.beatsPerBar, 4);
  assert.equal(chart.gameplay.travelBeats, 4);
  assert.deepEqual(chart.gameplay.grannyBeats, [62, 124]);

  assert.equal(beatTimesMs.length, 173);
  assert.equal(lanePattern.length, beatTimesMs.length);
  assert.equal(notePattern.length, beatTimesMs.length);
  assert.equal(intensityPattern.length, beatTimesMs.length);
  assert.equal(beatTimesMs[0], chart.timing.offsetMs);
  assert.equal(beatTimesMs.at(-1), chart.audio.durationMs);
  assert.ok(
    beatTimesMs.every(
      (time, index) =>
        Number.isInteger(time) &&
        (index === 0 ||
          time - beatTimesMs[index - 1] === chart.timing.intervalMs),
    ),
  );
  assert.ok(
    lanePattern.every(
      (lane) => Number.isInteger(lane) && lane >= 0 && lane <= 4,
    ),
  );
  assert.ok(
    notePattern.every((note) => note === 0 || note === 1 || note === 2),
  );
  assert.ok(intensityPattern.every((value) => value >= 0 && value <= 1));
  assert.deepEqual(notePattern.slice(0, chart.gameplay.travelBeats), [
    0, 0, 0, 0,
  ]);
  assert.ok(
    chart.gameplay.grannyBeats.every(
      (beat) =>
        Number.isInteger(beat) && beat > 0 && beat < beatTimesMs.length,
    ),
  );
  assert.equal(
    notePattern.filter((note) => note === 0).length,
    chart.stats.emptyNotes,
  );
  assert.equal(
    notePattern.filter((note) => note === 1).length,
    chart.stats.normalNotes,
  );
  assert.equal(
    notePattern.filter((note) => note === 2).length,
    chart.stats.strongNotes,
  );
  assert.equal(
    Math.round(
      (intensityPattern.reduce((sum, value) => sum + value, 0) /
        intensityPattern.length) *
        10_000,
    ) / 10_000,
    chart.stats.averageIntensity,
  );

  assert.match(
    page,
    /import treasureChart from "\.\/data\/congratulations-treasure\.chart\.json"/,
  );
  assert.match(page, /const PRECOMPUTED_CHART = treasureChart/);
  assert.match(page, /id: "congratulations-treasure"/);
  assert.match(page, /audioSrc: PRECOMPUTED_CHART\.audio\.localSrc/);
  assert.match(
    page,
    /beatTimesRef\.current = \[\.\.\.PRECOMPUTED_CHART\.timing\.beatTimesMs\]/,
  );
  assert.match(page, /NEXT_PUBLIC_TREASURE_AUDIO_API/);
  assert.match(page, /NEXT_PUBLIC_TREASURE_AUDIO_URL/);
  assert.match(page, /payload\.audioId !== PRECOMPUTED_CHART\.audio\.id/);
  assert.match(page, /payload\.chartVersion !== PRECOMPUTED_CHART\.chartVersion/);
  assert.match(
    page,
    /Math\.abs\(durationMs - PRECOMPUTED_CHART\.audio\.durationMs\) > 750/,
  );
  assert.doesNotMatch(page, /function analyzeAudioBuffer/);
  assert.doesNotMatch(page, /decodeAudioData/);
  assert.doesNotMatch(page, /handleSongUpload/);
  assert.doesNotMatch(page, /custom-song-upload/);
  assert.doesNotMatch(page, /custom-upload/);
  assert.doesNotMatch(page, /BUILT_IN_TRACK_ORDER/);
  assert.doesNotMatch(page, /loadBuiltInTrack/);
  assert.doesNotMatch(page, /className="track-picker"/);
  assert.doesNotMatch(page, /SONG SELECT/);
  assert.doesNotMatch(page, /进入选歌/);
  assert.doesNotMatch(page, /type="file"/);
});

test("keeps hit judgement and gameplay safeguards", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /if \(noteLevel !== 2\) return/);
  assert.match(page, /id: "congratulations-treasure"/);
  assert.match(page, /mapTheme: "campus-season"/);
  assert.match(page, /notePattern: PRECOMPUTED_CHART\.gameplay\.notePattern/);
  assert.match(page, /lanePattern: PRECOMPUTED_CHART\.gameplay\.lanePattern/);
  assert.match(
    page,
    /intensityPattern: PRECOMPUTED_CHART\.gameplay\.intensityPattern/,
  );
  assert.match(page, /const hitNote = useCallback/);
  assert.match(page, /const playPerfectHit = useCallback/);
  assert.match(page, /if \(quality === "PERFECT"\) \{\s*playPerfectHit\(\);/);
  assert.match(page, /frequency: 1665/);
  assert.match(page, /function triggerHaptic/);
  assert.match(page, /steer: "\/assets\/campus-season\/icons\/steer\.png"/);
  assert.match(page, /src=\{UI_ICONS\.steer\}/);
  assert.doesNotMatch(page, />\s*↔\s*</);
  assert.match(page, /grannyBeats: \[number, number\]/);
  assert.match(page, /grannyBeats: PRECOMPUTED_CHART\.gameplay\.grannyBeats/);
  assert.match(page, /"PERFECT" \| "GREAT" \| "GOOD" \| "MISS"/);
  assert.match(page, /const VEHICLE_LEVELS/);
  assert.match(page, /const pauseGame = useCallback/);
  assert.match(page, /const resumeGame = useCallback/);
  assert.match(page, /const openLuckyBag = useCallback/);
  assert.match(page, /const continueLuckyGame = useCallback/);
  assert.match(page, /是否开启锦囊？/);
  assert.match(page, /知识星减半并中断连击/);
  assert.match(page, /Math\.random\(\) < 0\.55/);
  assert.match(page, /const POWERUP_DURATION_MS = 5_000/);
  assert.match(page, /const HIT_INPUT_GUARD_MS = 70/);
  assert.match(page, /const STARTING_FANS = 0/);
  assert.match(page, /const MIN_OBSTACLE_BEAT_GAP = 3/);
  assert.match(page, /const POWERUP_TRAIL_DELAY_MS = 220/);
  assert.match(page, /const OBSTACLE_COLLISION_BEFORE = 36/);
  assert.match(page, /const OBSTACLE_COLLISION_AFTER = 40/);
  assert.match(page, /const MAGNET_RADIUS = 185/);
  assert.doesNotMatch(page, /预制|卡点|浏览器解析|PREBUILT/i);
  assert.match(page, /type: "fan"/);
  assert.match(page, /type: bonusType/);
  assert.match(page, /spawnAt: spawnAt \+ POWERUP_TRAIL_DELAY_MS/);
  assert.match(page, /targetBeat - lastObstacleTargetBeatRef\.current/);
  assert.match(page, /lastHitInputAtRef\.current < HIT_INPUT_GUARD_MS/);
  assert.match(page, /elapsed < invincibleUntilRef\.current/);
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
  assert.match(page, /fans \* maxCombo/);
  assert.match(page, /fetch\("\/api\/leaderboard"/);
  assert.match(page, /SONG TOP 8/);
  assert.match(page, /createShareCardBlob/);
  assert.match(page, /className="share-result-card"/);
  assert.match(page, /CAMPUS RANK/);
  assert.match(page, /navigator\.share/);
  assert.match(page, /downloadShareCard/);
  assert.match(page, /const LEADERBOARD_SONG_KEY/);
  assert.match(page, /songKey: LEADERBOARD_SONG_KEY/);
  assert.match(page, /if \(!upgraded\)/);
  assert.match(page, /createMediaElementSource/);
  assert.match(page, /createBiquadFilter/);
  assert.match(page, /songRef\.current\.playbackRate = 1/);
  assert.match(page, /type FailureSummary = \{/);
  assert.match(page, /const failGame = useCallback/);
  assert.match(page, /statusRef\.current = "failed"/);
  assert.match(page, /setFailureSummary\(\{/);
  assert.match(page, /failGame\(\);\s*return;/);
  assert.match(page, /status === "failed"/);
  assert.match(page, /安全挑战未完成/);
  assert.match(page, /重新挑战/);
  assert.doesNotMatch(page, /playbackRate\s*=\s*(?:0\.|1\.[1-9])/);
  assert.doesNotMatch(page, /https?:\/\/.*\.(mp3|m4a|wav|aac|ogg)/i);
});

test("uses a compact high-contrast run dashboard and a perspective road", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /className="vehicle-run-card"/);
  assert.doesNotMatch(page, /className="road-legend"/);
  assert.doesNotMatch(page, /className="powerup-legend"/);
  assert.doesNotMatch(page, /className="vehicle-upgrade-strip"/);
  assert.match(page, /const ROAD_HORIZON_Y = 302/);
  assert.match(page, /const ENTITY_RENDER_SIZE = 68/);
  assert.match(page, /function roadYFromProgress/);
  assert.match(page, /function laneXAtDepth/);
  assert.match(page, /const visibleEntities = \[\.\.\.entitiesRef\.current\]\.sort/);
  assert.match(page, /const drawRoadSprite = \(image: HTMLImageElement\)/);
  assert.match(page, /y: roadYFromProgress\(travelProgress\)/);
  assert.match(page, /const pedestrianY = PLAYER_Y - 4/);
  assert.match(page, /obstacle === "pothole"/);
  assert.match(page, /obstacle-pothole\.png/);
  assert.doesNotMatch(page, /obstacle-books\.png/);
  assert.match(
    styles,
    /\/\* Campus run redesign:[\s\S]*?\.hud\s*\{[\s\S]*?grid-template-columns:\s*18%\s+16%\s+minmax\(0,\s*1\.35fr\)\s+minmax\(90px,\s*0\.85fr\)/,
  );
  assert.match(
    styles,
    /\.vehicle-run-card\s*\{[\s\S]*?grid-template-columns:\s*52px\s+minmax\(0,\s*1fr\)/,
  );
  assert.match(
    styles,
    /\.music-state,[\s\S]*?background:\s*#fff9d9;[\s\S]*?color:\s*var\(--ink\)/,
  );
  assert.match(
    styles,
    /\.game-toast\s*\{[\s\S]*?background:\s*rgba\(255,\s*250,\s*241,\s*0\.96\);[\s\S]*?color:\s*var\(--ink\)/,
  );
  assert.match(page, /className="single-song-card"/);
  assert.match(page, /className="chart-ready-note"/);
  assert.match(
    styles,
    /\.home-mark\s*>\s*img\s*\{[\s\S]*?width:\s*42px;[\s\S]*?height:\s*42px;/,
  );
  assert.match(
    styles,
    /\.home-start-button \.home-play-icon\s*\{[\s\S]*?width:\s*42px;[\s\S]*?height:\s*42px;/,
  );
  assert.match(
    styles,
    /\.single-song-card\s*\{[\s\S]*?grid-template-columns:\s*76px\s+minmax\(0,\s*1fr\)\s+auto;[\s\S]*?width:\s*min\(92%,\s*430px\);/,
  );
  assert.match(
    styles,
    /@media \(max-width:\s*780px\)[\s\S]*?\.single-song-card\s*\{[\s\S]*?grid-template-columns:\s*58px\s+minmax\(0,\s*1fr\);[\s\S]*?width:\s*96%;/,
  );
});

test("uses the campus road, four school vehicles, and fixed activity audio", async () => {
  const [page, styles, route, readme] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/leaderboard/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  const assetNames = [
    "campus-road.png",
    "campus-hero.png",
    "vehicle-bicycle.png",
    "vehicle-motorcycle.png",
    "vehicle-car.png",
    "vehicle-school-bus.png",
  ];
  const assets = await Promise.all(
    assetNames.map((assetName) =>
      readFile(
        new URL(
          `../public/assets/campus-season/${assetName}`,
          import.meta.url,
        ),
      ),
    ),
  );
  const fixedAudio = await readFile(
    new URL(`../public/audio/${FIXED_AUDIO_FILE}`, import.meta.url),
  );

  assert.ok(assets.every((asset) => asset.byteLength > 1_000));
  assert.ok(fixedAudio.byteLength > 1_000_000);
  assert.match(page, /const CAMPUS_ASSETS/);
  for (const assetName of assetNames.slice(0, 1).concat(assetNames.slice(2))) {
    assert.match(page, new RegExp(assetName.replaceAll(".", "\\.")));
  }
  assert.match(page, /Object\.entries\(CAMPUS_ASSETS\)/);
  assert.match(page, /const GAME_TRACK: Track/);
  assert.match(page, /mapTheme: "campus-season"/);
  assert.match(page, /is-campus-season/);
  assert.match(styles, /\.is-campus-season/);

  for (const vehicleName of ["自行车", "摩托车", "小轿车", "校车大巴"]) {
    assert.match(page, new RegExp(vehicleName));
  }
  for (const itemName of ["磁铁", "闪电", "老奶奶", "路障"]) {
    assert.match(page, new RegExp(itemName));
  }
  for (const tierName of [
    "佛系咸鱼",
    "知识分子",
    "卷王本王",
    "隐形学霸",
    "天才学神",
  ]) {
    assert.match(page, new RegExp(tierName));
    assert.match(route, new RegExp(tierName));
  }

  assert.match(readme, /《恭喜你发现了宝藏》/);
  assert.match(readme, /congratulations-treasure-tf-family\.mp3/);
  assert.match(readme, /congratulations-treasure\.chart\.json/);
  assert.match(readme, /treasure-120bpm-v1/);
  assert.match(readme, new RegExp(EXPECTED_AUDIO_SHA256));
  assert.match(readme, /不提供选歌或本地上传入口/);
  assert.match(readme, /decodeAudioData/);
  assert.match(readme, /NEXT_PUBLIC_TREASURE_AUDIO_API/);
  assert.match(readme, /NEXT_PUBLIC_TREASURE_AUDIO_URL/);
  assert.match(readme, /自行车 → 摩托车 → 小轿车 → 校车大巴/);
  assert.match(readme, /npm run lint/);
  assert.match(readme, /npm test/);
  assert.match(readme, /npm run build/);
});

test("ships and references all 20 ImageGen campus icons", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const iconBuffers = await Promise.all(
    CAMPUS_ICON_FILES.map((fileName) =>
      readFile(
        new URL(
          `../public/assets/campus-season/icons/${fileName}`,
          import.meta.url,
        ),
      ),
    ),
  );
  const referencedIconFiles = [
    ...page.matchAll(/\/assets\/campus-season\/icons\/([^"}]+\.png)/g),
  ].map((match) => match[1]);

  assert.equal(CAMPUS_ICON_FILES.length, 20);
  assert.equal(new Set(CAMPUS_ICON_FILES).size, 20);
  assert.ok(iconBuffers.every((asset) => asset.byteLength > 1_000));
  assert.ok(
    iconBuffers.every((asset) =>
      asset.subarray(0, 8).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      ),
    ),
  );
  assert.deepEqual(
    [...new Set(referencedIconFiles)].sort(),
    [...CAMPUS_ICON_FILES].sort(),
  );
  assert.match(page, /const CAMPUS_ASSETS/);
  assert.match(page, /const UI_ICONS/);
  assert.match(page, /const OUTCOME_ICONS/);
  for (const fileName of CAMPUS_ICON_FILES) {
    assert.match(page, new RegExp(escapeRegExp(fileName)));
  }
});

test("keeps Sites-compatible per-song leaderboard persistence", async () => {
  const [route, database, schema, packageFile, hosting, viteConfig, migration] =
    await Promise.all([
      readFile(
        new URL("../app/api/leaderboard/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
      readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../drizzle/0000_leaderboard_scores.sql", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export const runtime = "nodejs"/);
  assert.match(
    route,
    /import treasureChart from "\.\.\/\.\.\/data\/congratulations-treasure\.chart\.json"/,
  );
  assert.match(
    route,
    /const ACTIVITY_SONG_KEY = `track:\$\{treasureChart\.audio\.id\}:\$\{treasureChart\.chartVersion\}`/,
  );
  assert.match(route, /if \(songKey !== ACTIVITY_SONG_KEY\)/);
  assert.match(route, /const song = ACTIVITY_SONG_TITLE/);
  assert.match(route, /const score = fans \* maxCombo/);
  assert.match(route, /function resultTierForScore/);
  assert.match(route, /if \(score >= 6_500\) return "天才学神"/);
  assert.match(route, /if \(score >= 4_500\) return "隐形学霸"/);
  assert.match(route, /if \(score >= 2_800\) return "卷王本王"/);
  assert.match(route, /if \(score >= 1_400\) return "知识分子"/);
  assert.match(route, /return "佛系咸鱼"/);
  assert.match(route, /concert: resultTierForScore\(row\.score\)/);
  assert.match(route, /payload\.name\?\.trim\(\) \|\| "校园新生"/);
  assert.match(route, /const TOP_LIMIT = 8/);
  assert.match(route, /ROW_NUMBER\(\) OVER/);
  assert.match(route, /ON CONFLICT\(player_id, song_key\) DO UPDATE SET/);
  assert.match(route, /\.bind\(/);
  assert.match(route, /submittedScore: score/);
  assert.match(database, /from "cloudflare:workers"/);
  assert.match(database, /database\s*\.batch/);
  assert.match(database, /Cloudflare D1 binding `DB` is unavailable/);
  assert.doesNotMatch(database, /node:sqlite|DatabaseSync|DATABASE_PATH/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS leaderboard_scores/);
  assert.match(schema, /leaderboard_scores_player_song_unique/);
  assert.match(schema, /leaderboard_scores_rank_idx/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS leaderboard_scores/);
  assert.doesNotMatch(packageFile, /better-sqlite3/);
  assert.match(packageFile, /"vinext": "0\.0\.50"/);
  assert.match(packageFile, /"@cloudflare\/vite-plugin": "1\.37\.1"/);
  assert.match(viteConfig, /sites\(\)/);
  assert.match(viteConfig, /cloudflare\(/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": null/);
});
