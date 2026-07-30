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
  assert.match(page, /收集 1 个应援棒，粉丝 \+1/);
  assert.match(page, /点亮更大舞台/);
  assert.match(page, /让每一位粉丝准时抵达现场/);
  assert.match(page, /PLAYER NAME/);
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
  assert.match(page, /const MAGNET_RADIUS = 185/);
  assert.match(page, /type: pickupType/);
  assert.match(page, /MAGNET PERFECT · \+1 FAN/);
  assert.doesNotMatch(page, /MAGNET ACTIVE · AUTO PERFECT/);
  assert.match(page, /lastHitInputAtRef\.current < HIT_INPUT_GUARD_MS/);
  assert.match(page, /附近应援棒自动 PERFECT/);
  assert.match(page, /5 秒内无视所有障碍/);
  assert.match(page, /elapsed < invincibleUntilRef\.current/);
  assert.match(page, /audioRef\.current\?\.suspend/);
  assert.match(page, /vehicleLevelRef\.current = 1/);
  assert.doesNotMatch(page, /localStorage\.setItem\("fan-bus-vehicle-level"/);
  assert.match(page, /requirement: \{ hits: 4, perfect: 1 \}/);
  assert.match(page, /requirement: \{ hits: 12, maxCombo: 6 \}/);
  assert.match(page, /requirement: \{ hits: 22, perfect: 7, maxCombo: 10 \}/);
  assert.match(page, /const stopJoystick = useCallback/);
  assert.match(page, /const steerWithJoystick = useCallback/);
  assert.match(page, /window\.setInterval\(\(\) => \{/);
  assert.match(page, /\}, 135\)/);
  assert.match(page, /演唱会积分/);
  assert.match(page, /fans \* maxCombo/);
  assert.match(page, /fetch\("\/api\/leaderboard"/);
  assert.match(page, /GLOBAL TOP 5/);
  assert.match(page, /if \(!upgraded\)/);
  assert.match(page, /createMediaElementSource/);
  assert.match(page, /createBiquadFilter/);
  assert.match(page, /songRef\.current\.playbackRate = 1/);
  assert.doesNotMatch(page, /playbackRate\s*=\s*(?:0\.|1\.[1-9])/);
  assert.match(page, /音频只保留在当前浏览器/);
  assert.doesNotMatch(page, /仁义茶楼|GAI · REN YI TEAHOUSE/);
  assert.doesNotMatch(page, /https?:\/\/.*\.(mp3|m4a|wav|aac|ogg)/i);
});

test("keeps global leaderboard persistence and server-side score rules", async () => {
  const [route, schema, hosting] = await Promise.all([
    readFile(
      new URL("../app/api/leaderboard/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /const score = fans \* maxCombo/);
  assert.match(route, /if \(score >= 6_500\)/);
  assert.match(route, /\.limit\(TOP_LIMIT\)/);
  assert.match(route, /leaderboardScores\.playerId/);
  assert.match(schema, /leaderboard_scores/);
  assert.equal(JSON.parse(hosting).d1, "DB");
});
