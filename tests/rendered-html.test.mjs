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

test("server-renders the Ren Yi Teahouse rhythm game", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>应援巴士 · Rhythm Rush<\/title>/i);
  assert.match(html, /仁义茶楼/);
  assert.match(html, /GAI · 本地音频节拍分析/);
  assert.match(html, /id="renyi-song-upload"/);
  assert.match(html, /type="file"/);
  assert.match(html, /class="hit-button"/);
  assert.match(html, /SPACE 击打/);
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
  assert.match(page, /songRef\.current\.playbackRate/);
  assert.match(page, /音频只保留在当前浏览器/);
  assert.doesNotMatch(page, /https?:\/\/.*\.(mp3|m4a|wav|aac|ogg)/i);
});
