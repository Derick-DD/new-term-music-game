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
  assert.match(html, /上传歌曲后自动分析节拍/);
  assert.match(html, /id="custom-song-upload"/);
  assert.match(html, /type="file"/);
  assert.match(html, /class="hit-button"/);
  assert.match(html, /SPACE 击打/);
  assert.match(html, /BUS LV\./);
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
  assert.match(page, /const hitNote = useCallback/);
  assert.match(page, /"PERFECT" \| "GREAT" \| "GOOD" \| "MISS"/);
  assert.match(page, /const VEHICLE_LEVELS/);
  assert.match(page, /fan-bus-vehicle-level/);
  assert.match(page, /createMediaElementSource/);
  assert.match(page, /createBiquadFilter/);
  assert.match(page, /songRef\.current\.playbackRate = 1/);
  assert.doesNotMatch(page, /playbackRate\s*=\s*(?:0\.|1\.[1-9])/);
  assert.match(page, /音频只保留在当前浏览器/);
  assert.doesNotMatch(page, /仁义茶楼|GAI · REN YI TEAHOUSE/);
  assert.doesNotMatch(page, /https?:\/\/.*\.(mp3|m4a|wav|aac|ogg)/i);
});
