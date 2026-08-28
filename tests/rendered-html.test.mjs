import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "out");
const AUDIO_PATTERN = /\.(?:aac|flac|m4a|mp3|ogg|wav)$/i;
const IMAGE_PATTERN = /\.(?:gif|jpe?g|png|svg|webp)$/i;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function treeEntries(directory, excluded = new Set()) {
  const files = await walk(directory);
  const entries = [];
  for (const fullPath of files) {
    const relativePath = path.relative(directory, fullPath).split(path.sep).join("/");
    if (excluded.has(relativePath)) continue;
    const buffer = await readFile(fullPath);
    entries.push({ path: relativePath, bytes: buffer.byteLength, sha256: sha256(buffer) });
  }
  return entries;
}

function treeSha256(files) {
  return sha256(Buffer.from(files.map((file) => `${file.path}\0${file.sha256}\n`).join("")));
}

test("builds the current application as a production static export without Next runtime", async () => {
  const [packageSource, staticIndex, staticViteConfig] = await Promise.all([
    readFile(path.join(ROOT, "package.json"), "utf8"),
    readFile(path.join(ROOT, "static", "index.html"), "utf8"),
    readFile(path.join(ROOT, "vite.static.config.ts"), "utf8"),
  ]);
  const packageFile = JSON.parse(packageSource);

  assert.equal(packageFile.scripts.build, "npm run build:static");
  assert.equal(packageFile.scripts["build:sites"], undefined);
  assert.equal(
    packageFile.scripts["build:static"],
    "node build/clean-static-input.mjs && vite build --config vite.static.config.ts && node build/verify-static-export.mjs",
  );
  assert.match(staticViteConfig, /root:\s*resolve\(ROOT, "static"\)/);
  assert.match(staticViteConfig, /base:\s*"\.\/"/);
  assert.match(staticIndex, /lib\/h5\/preact\.js\?max_age=2592000/);
  assert.match(staticIndex, /lib\/h5\/music\.js\?max_age=604800/);
  assert.match(staticIndex, /window\.Music = window\.Music \|\| window\.M/);
  assert.match(staticIndex, /qmfe-unity-report\/iife\/index\.js/);
  assert.match(staticIndex, /qmfe-unity-ad\/iife\/index\.js/);
  assert.match(staticIndex, /qmplayer\.music\.js/);
  assert.match(staticIndex, /activity\.config\.js\?v=__ACTIVITY_CONFIG_VERSION__/);
  assert.match(staticIndex, /activity-bridge\.js\?v=__ACTIVITY_RUNTIME_VERSION__/);
  assert.doesNotMatch(staticIndex, /(?:src|href)="\/(?!\/)/);
  assert.doesNotMatch(staticIndex, /music-2\.4\.0|activity-sdk-loader|crossorigin/i);
});

test("uses Activity.music for song 380208811 without membership checks or local audio", async () => {
  const [page, bridge, config, chartSource] = await Promise.all([
    readFile(path.join(ROOT, "app", "page.tsx"), "utf8"),
    readFile(path.join(ROOT, "public", "activity-bridge.js"), "utf8"),
    readFile(path.join(ROOT, "public", "activity.config.js"), "utf8"),
    readFile(path.join(ROOT, "app", "data", "congratulations-treasure.chart.json"), "utf8"),
  ]);
  const chart = JSON.parse(chartSource);
  const sourceFiles = await walk(path.join(ROOT, "public"));

  assert.match(config, /id:\s*380208811/);
  assert.match(config, /outsideLaunch\s*:\s*\{\s*enabled\s*:\s*true/);
  assert.match(config, /pagename:\s*"campus_gogogo"/);
  assert.match(config, /type:\s*44/);
  assert.match(config, /showBannerIfEmpty:\s*true/);
  assert.match(page, /const SONG_ID = 380208811/);
  assert.match(page, /music\.play\(/);
  assert.match(page, /music\.resume\(\)/);
  assert.match(page, /requireActivityMusic\(\)\.pause\(\)/);
  assert.match(page, /music\.on\("play"/);
  assert.match(page, /music\.on\("error"/);
  assert.match(bridge, /Activity\.registerCapability\("music"/);
  assert.match(bridge, /new window\.QMPlayer/);
  assert.match(page, /typeof window\.QMPlayer !== "function"/);
  assert.match(bridge, /new window\.QMPlugin/);
  assert.doesNotMatch(`${page}\n${config}\n${bridge}`, /Activity\.user|queryProfile|requiredMembership|vipStatus|svipStatus/);
  assert.doesNotMatch(page, /new\s+Audio\s*\(|AudioContext|webkitAudioContext|localSrc/);
  assert.equal(chart.audio.songId, 380208811);
  assert.equal(chart.audio.localSrc, undefined);
  assert.equal(sourceFiles.some((file) => AUDIO_PATTERN.test(file)), false);
});

test("registers Activity.music locally and forwards the configured song id to QMPlayer", async () => {
  const bridge = await readFile(path.join(ROOT, "public", "activity-bridge.js"), "utf8");
  const played = [];
  const launches = [];
  const sandbox = {
    console,
    Promise,
    setTimeout,
    clearTimeout,
    document: {
      readyState: "complete",
      addEventListener() {},
      querySelector() { return null; },
      body: { classList: { add() {} } },
    },
    location: {
      hostname: "localhost",
      pathname: "/",
      search: "",
      href: "http://localhost/",
      origin: "http://localhost",
    },
    ACTIVITY_CONFIG: {
      webview: {
        topBar: { enabled: false },
        outsideLaunch: { enabled: false },
      },
      music: { player: {} },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(bridge, sandbox);
  assert.ok(sandbox.Activity?.music, "Activity.music should not depend on a client injection");
  sandbox.QMPlugin = function QMPlugin(options) {
    launches.push(options);
  };
  const outsideLaunch = await sandbox.Activity.webview.initOutsideLaunch({
    enabled: true,
    pagename: "campus_gogogo",
    type: 44,
    showBannerIfEmpty: true,
    disableOnLocalhost: false,
    disableInDebug: false,
  });
  assert.equal(outsideLaunch.initialized, true);
  assert.deepEqual(JSON.parse(JSON.stringify(launches)), [{
    pagename: "campus_gogogo",
    type: 44,
    showBannerIfEmpty: true,
  }]);

  sandbox.QMPlayer = function QMPlayer() {};
  sandbox.QMPlayer.prototype.play = function play(song) {
    played.push(song);
    return Promise.resolve();
  };
  sandbox.QMPlayer.prototype.pause = function pause() {
    return Promise.resolve();
  };
  sandbox.QMPlayer.prototype.on = function on() {};
  sandbox.QMPlayer.prototype.off = function off() {};
  sandbox.Activity.configure(sandbox.ACTIVITY_CONFIG);

  await sandbox.Activity.music.play({ id: 380208811 }, 0);
  assert.deepEqual(played, [380208811]);
});

test("retains the current gameplay, tutorial, control, lane, share, and preload changes", async () => {
  const [page, css, config, imageManifestSource, shareQr] = await Promise.all([
    readFile(path.join(ROOT, "app", "page.tsx"), "utf8"),
    readFile(path.join(ROOT, "app", "globals.css"), "utf8"),
    readFile(path.join(ROOT, "public", "activity.config.js"), "utf8"),
    readFile(path.join(ROOT, "app", "data", "static-image-assets.json"), "utf8"),
    readFile(path.join(ROOT, "public", "assets", "campus-season", "campus-share-qr.svg"), "utf8"),
  ]);
  const configuredImages = JSON.parse(imageManifestSource).sort();
  const publicImages = (await walk(path.join(ROOT, "public")))
    .filter((file) => IMAGE_PATTERN.test(file))
    .map((file) => `/${path.relative(path.join(ROOT, "public"), file).split(path.sep).join("/")}`)
    .sort();

  assert.match(page, /drag\.startOffset \+ \(clientX - drag\.startClientX\)/);
  assert.match(page, /const normalizedOffset = nextOffset \/ drag\.maxTravel/);
  assert.match(page, /syncJoystickVisual\(nextX, drag\.maxTravel\)/);
  assert.match(page, /getCoalescedEvents/);
  assert.match(page, /className="tutorial-game-callouts"/);
  assert.match(page, /按住底部摇杆左右拖动/);
  assert.match(page, /className="secondary-button rules-home-button"/);
  assert.match(page, /for \(let marker = 0; marker < 5; marker \+= 1\)/);
  assert.match(page, /phase \+ 0\.09 \+ phase \* 0\.12/);
  assert.ok(page.indexOf("这次开学，我的隐藏人设被发现了") < page.indexOf('className="share-card-topline"'));
  assert.match(css, /\.joystick-control\s*\{[\s\S]*?background:\s*#45c8ed/);
  assert.match(css, /\.cabinet-top\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.share-card-tagline/);
  assert.match(config, /https:\/\/y\.qq\.com\/viber_pub\/campus_gogogo\/index\.html\?_hidehd=1&_miniplayer=1/);
  assert.match(page, /const SHARE_TARGET_URL =\s*\n\s*"https:\/\/y\.qq\.com\/viber_pub\/campus_gogogo\/index\.html\?_hidehd=1&_miniplayer=1"/);
  assert.match(shareQr, /https:\/\/y\.qq\.com\/viber_pub\/campus_gogogo\/index\.html\?_hidehd=1&amp;_miniplayer=1/);
  assert.doesNotMatch(page, /className="brand-title"|保存图片|saveShareCard|mobileSavePreview/);
  assert.match(page, /status !== "finished" && status !== "failed"/);
  assert.match(page, /Promise\.all\(\s*REQUIRED_IMAGE_URLS\.map/);
  assert.deepEqual(configuredImages, publicImages);
  assert.doesNotMatch(`${page}\n${css}\n${imageManifestSource}`, /earth-tour|lueluelue/);
});

test("records and verifies the exact current source and pure-static artifact trees", async () => {
  const manifest = JSON.parse(await readFile(path.join(OUT, "static-build-manifest.json"), "utf8"));
  assert.equal(manifest.buildType, "vite-static-export-no-next");
  assert.equal(manifest.guarantees.currentApplicationSource, true);
  assert.equal(manifest.guarantees.staticOnly, true);
  assert.equal(manifest.guarantees.bundledAudio, false);
  assert.equal(manifest.guarantees.membershipDetection, false);
  assert.equal(manifest.guarantees.outsideLaunch, true);
  assert.deepEqual(manifest.guarantees.pvUvScripts, ["preact.js", "music.js"]);
  assert.equal(manifest.guarantees.songId, 380208811);

  for (const source of manifest.sourceFiles) {
    const buffer = await readFile(path.join(ROOT, source.path));
    assert.equal(buffer.byteLength, source.bytes, `source byte count changed: ${source.path}`);
    assert.equal(sha256(buffer), source.sha256, `source hash changed: ${source.path}`);
  }
  assert.equal(treeSha256(manifest.sourceFiles), manifest.sourceTreeSha256);

  const artifacts = await treeEntries(OUT, new Set(["static-build-manifest.json"]));
  assert.equal(artifacts.length, manifest.artifactCount);
  assert.equal(treeSha256(artifacts), manifest.artifactTreeSha256);
  assert.equal(artifacts.some((file) => AUDIO_PATTERN.test(file.path)), false);
  assert.equal(artifacts.some((file) => file.path.endsWith(".DS_Store")), false);
  assert.equal(artifacts.some((file) => file.path.startsWith("_next/")), false);
});
