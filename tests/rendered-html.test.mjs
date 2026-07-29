import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the uploadable rhythm game", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>应援巴士 · Rhythm Rush<\/title>/i);
  assert.match(html, /SONG SELECT/);
  assert.match(html, />选歌</);
  assert.match(html, /每首歌都有独立卡点、换道路线与道路主题/);
  assert.match(html, /怪火/);
  assert.match(html, /略略略略略/);
  assert.match(html, /昨晚我环游了地球/);
  assert.match(html, /幻火夜城/);
  assert.match(html, /糖果街区/);
  assert.match(html, /星球环线/);
  assert.match(html, /id="custom-song-upload"/);
  assert.match(html, /type="file"/);
  assert.doesNotMatch(html, /class="side-panel/);
  assert.match(html, /class="hit-button"/);
  assert.match(html, /SPACE 击打/);
  assert.match(html, /Ⅱ PAUSE/);
  assert.match(html, /<small>BUS<\/small>/);
  assert.match(html, /星芽小巴/);
  assert.match(html, /载客上限/);
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
  assert.match(page, /if \(noteLevel === 0\) return/);
  assert.match(page, /mapTheme: "illusion-city"/);
  assert.match(page, /mapTheme: "candy-blocks"/);
  assert.match(page, /mapTheme: "earth-orbit"/);
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
  assert.match(page, /const HIT_INPUT_GUARD_MS = 90/);
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
  assert.match(page, /createMediaElementSource/);
  assert.match(page, /createBiquadFilter/);
  assert.match(page, /songRef\.current\.playbackRate = 1/);
  assert.doesNotMatch(page, /playbackRate\s*=\s*(?:0\.|1\.[1-9])/);
  assert.match(page, /音频只保留在当前浏览器/);
  assert.doesNotMatch(page, /仁义茶楼|GAI · REN YI TEAHOUSE/);
  assert.doesNotMatch(page, /https?:\/\/.*\.(mp3|m4a|wav|aac|ogg)/i);
});
