import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const FIXED_AUDIO_FILE = "congratulations-treasure-tf-family.mp3";
const EXPECTED_AUDIO_SHA256 =
  "448bddb1c19d0da0fe5911a28babbdbe6ce73477c1bcc0eaffea64c49e8874b5";

async function exists(relativePath) {
  try {
    await access(new URL(relativePath, ROOT));
    return true;
  } catch {
    return false;
  }
}

test("builds a portable static site without leaderboard services", async () => {
  const [nextConfig, packageSource, viteConfig, worker, hosting] =
    await Promise.all([
      readFile(new URL("next.config.ts", ROOT), "utf8"),
      readFile(new URL("package.json", ROOT), "utf8"),
      readFile(new URL("vite.config.ts", ROOT), "utf8"),
      readFile(new URL("worker/index.ts", ROOT), "utf8"),
      readFile(new URL(".openai/hosting.json", ROOT), "utf8"),
    ]);
  const packageFile = JSON.parse(packageSource);
  const hostingConfig = JSON.parse(hosting);

  assert.match(nextConfig, /output: "export"/);
  assert.match(nextConfig, /trailingSlash: true/);
  assert.match(packageFile.scripts.build, /build:static.*build:sites/);
  assert.equal(packageFile.scripts["build:static"], "next build");
  assert.doesNotMatch(packageSource, /vinext|plugin-rsc|react-server-dom-webpack/);
  assert.match(viteConfig, /publicDir: "out"/);
  assert.match(viteConfig, /static-adapter\.ts/);
  assert.match(worker, /env\.ASSETS\.fetch\(request\)/);
  assert.doesNotMatch(worker, /D1|DB|app-router|image-optimization/);
  assert.deepEqual(Object.keys(hostingConfig), ["project_id"]);

  assert.equal(await exists("app/api/"), false);
  assert.equal(await exists("db/"), false);
  assert.equal(await exists("drizzle/"), false);
  assert.equal(await exists("out/index.html"), true);
  assert.equal(await exists("dist/client/index.html"), true);
  assert.equal(await exists("dist/server/index.js"), true);
  assert.equal(await exists("dist/.openai/drizzle"), false);
});

test("uses one fixed audio file and preserves the versioned timing data", async () => {
  const [page, chartSource, audio, publicAudioFiles] = await Promise.all([
    readFile(new URL("app/page.tsx", ROOT), "utf8"),
    readFile(
      new URL("app/data/congratulations-treasure.chart.json", ROOT),
      "utf8",
    ),
    readFile(new URL(`public/audio/${FIXED_AUDIO_FILE}`, ROOT)),
    readdir(new URL("public/audio/", ROOT)),
  ]);
  const chart = JSON.parse(chartSource);
  const audioFiles = publicAudioFiles.filter((fileName) =>
    /\.(?:mp3|m4a|wav|aac|ogg|flac)$/i.test(fileName),
  );

  assert.deepEqual(audioFiles, [FIXED_AUDIO_FILE]);
  assert.equal(
    createHash("sha256").update(audio).digest("hex"),
    EXPECTED_AUDIO_SHA256,
  );
  assert.equal(chart.audio.sha256, EXPECTED_AUDIO_SHA256);
  assert.equal(chart.timing.beatTimesMs.length, 173);
  assert.equal(chart.gameplay.lanePattern.length, 173);
  assert.equal(chart.gameplay.notePattern.length, 173);
  assert.equal(chart.gameplay.intensityPattern.length, 173);
  assert.match(page, /PRECOMPUTED_CHART\.timing\.beatTimesMs/);
  assert.match(page, /songRef\.current\.currentTime \* 1000/);
  assert.match(page, /song\.playbackRate = 1/);
  assert.doesNotMatch(page, /decodeAudioData|type="file"|handleSongUpload/);
});

test("implements the requested campus gameplay safeguards", async () => {
  const [page, chartSource] = await Promise.all([
    readFile(new URL("app/page.tsx", ROOT), "utf8"),
    readFile(
      new URL("app/data/congratulations-treasure.chart.json", ROOT),
      "utf8",
    ),
  ]);
  const chart = JSON.parse(chartSource);
  let strongNotes = 0;
  let weakOrdinal = 0;
  let addedWeakNotes = 0;
  for (let targetBeat = 4; targetBeat < chart.timing.beatTimesMs.length - 1; targetBeat += 1) {
    const level = chart.gameplay.notePattern[targetBeat];
    if (level === 2) strongNotes += 1;
    if (level === 1) {
      weakOrdinal += 1;
      if (weakOrdinal % 3 === 0) addedWeakNotes += 1;
    }
  }

  assert.equal(strongNotes, 84);
  assert.equal(addedWeakNotes, 17);
  assert.equal(strongNotes + addedWeakNotes, 101);
  assert.ok((strongNotes + addedWeakNotes) / strongNotes > 1.2);
  assert.match(page, /weakNoteOrdinal % 3 === 0/);
  assert.match(page, /\[19, 57\]\.includes\(activeNoteOrdinal\)/);
  assert.match(page, /const PERFECT_WINDOW = 65/);
  assert.match(page, /const GREAT_WINDOW = 155/);
  assert.match(page, /const MISS_WINDOW = 240/);
  assert.match(page, /elapsed <= entity\.hitAt \+ ENTITY_DESPAWN_AFTER_MS/g);
  assert.match(page, /const PEDESTRIAN_WARNING_BEATS = 8/);
  assert.match(page, /const PEDESTRIAN_CROSSING_BEATS = 16/);
  assert.match(page, /PEDESTRIAN_DANGER_WINDOW_MS/);
  assert.match(page, /前方斑马线有行人，请提前换道/);
  assert.match(page, /Math\.abs\(pedestrianX - busXRef\.current\) < 30/);
  assert.match(page, /for \(let boundary = 0; boundary <= 5/);
  assert.doesNotMatch(page, /x \+ wobble|busBounce|fillRect\(-27, 45/);
  assert.match(page, /const bounds = \{ x: -50, y: -96, width: 100, height: 100 \}/);
});

test("ships the direct-start mobile copy and QR placeholder", async () => {
  const [page, styles, exportedHtml] = await Promise.all([
    readFile(new URL("app/page.tsx", ROOT), "utf8"),
    readFile(new URL("app/globals.css", ROOT), "utf8"),
    readFile(new URL("out/index.html", ROOT), "utf8"),
  ]);

  assert.match(page, /type ReadyPage = "home" \| "rules"/);
  assert.match(page, /踩准节拍，有用的知识\+1\+1\+1/);
  assert.match(page, /跟着歌曲节拍收集知识，解锁你的新学期隐藏人设/);
  assert.match(page, /升级开学载具/);
  assert.match(page, /从0开始收集知识，自行车也可以升级成校车/);
  assert.match(page, /疯狂汲取知识/);
  assert.match(page, /知识数量x最高连击次数=你的新学期人设/);
  assert.match(page, /游戏BGM《恭喜你发现了宝藏》——TF家族/);
  assert.match(page, /share-card-qr-placeholder/);
  assert.match(page, /二维码占位/);
  assert.doesNotMatch(page, /准备出发|首校园主题曲|级载具进化/);
  assert.doesNotMatch(page, /排行榜|leaderboard|知识星|BPM|01:26|完整版/);
  assert.doesNotMatch(exportedHtml, /排行榜|知识星|BPM|01:26|完整版/);

  assert.match(styles, /-apple-system, BlinkMacSystemFont/);
  assert.match(styles, /min-height: 100svh/);
  assert.match(styles, /height: 100dvh/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /\.story-title::before,[\s\S]*?display: none/);
  assert.match(styles, /\.share-card-qr-placeholder/);
  assert.doesNotMatch(styles, /leaderboard|share-card-rank/);
});

test("uses ImageGen vehicle sprites with visible occupants", async () => {
  const vehicleFiles = [
    "vehicle-bicycle.png",
    "vehicle-motorcycle.png",
    "vehicle-car.png",
    "vehicle-school-bus.png",
  ];
  const images = await Promise.all(
    vehicleFiles.map((fileName) =>
      readFile(new URL(`public/assets/campus-season/${fileName}`, ROOT)),
    ),
  );
  for (const image of images) {
    assert.ok(image.byteLength > 100_000);
    assert.equal(image.readUInt32BE(16), 640);
    assert.equal(image.readUInt32BE(20), 640);
    assert.equal(image[25], 6);
  }

  const page = await readFile(new URL("app/page.tsx", ROOT), "utf8");
  for (const fileName of vehicleFiles) assert.match(page, new RegExp(fileName));
  assert.match(page, /entity\.type === "lucky"/);
  assert.match(page, /const haloColor/);
  assert.match(page, /ENTITY_RENDER_SIZE \*/);
});
