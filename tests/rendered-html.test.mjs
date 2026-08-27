import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = path.join(
  ROOT,
  "releases",
  "fan-bus-rhythm-rush-h5-20260827",
);
const REQUIRED_ROOT_FILES = [
  "index.html",
  "reset.css",
  "rem.780.css",
  "style.css",
  "activity.config.js",
  "activity.project.json",
  "runtime.js",
  "app.js",
  "README.md",
];
const AUDIO_PATTERN = /\.(?:aac|flac|m4a|mp3|ogg|wav)$/i;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else files.push(fullPath);
  }
  return files;
}

test("ships the Activity H5 Builder output contract without bundled audio", async () => {
  const files = await walk(PACKAGE);
  const relativeFiles = files.map((file) => path.relative(PACKAGE, file));

  for (const requiredFile of REQUIRED_ROOT_FILES) {
    assert.ok(relativeFiles.includes(requiredFile), `missing ${requiredFile}`);
  }
  assert.equal(relativeFiles.some((file) => AUDIO_PATTERN.test(file)), false);
  assert.equal(relativeFiles.some((file) => /(?:^|\/)package\.json$/.test(file)), false);
  assert.equal(relativeFiles.some((file) => /\.(?:jsx?|tsx?)$/i.test(file) && !/\.js$/i.test(file)), false);

  const project = JSON.parse(
    await readFile(path.join(PACKAGE, "activity.project.json"), "utf8"),
  );
  assert.equal(project.schemaVersion, 1);
  assert.equal(project.target, "h5");
  assert.equal(project.entryFile, "index.html");
});

test("uses the reviewed Activity.music and QMPlayer playback contract", async () => {
  const [index, config, app, runtime, chartSource] = await Promise.all([
    readFile(path.join(PACKAGE, "index.html"), "utf8"),
    readFile(path.join(PACKAGE, "activity.config.js"), "utf8"),
    readFile(path.join(PACKAGE, "app.js"), "utf8"),
    readFile(path.join(PACKAGE, "runtime.js"), "utf8"),
    readFile(path.join(PACKAGE, "assets", "game-chart.json"), "utf8"),
  ]);
  const chart = JSON.parse(chartSource);

  assert.match(config, /id:\s*380208811/);
  assert.match(config, /requiredMembership:\s*"vip"/);
  assert.match(app, /Activity\.music\.play\(songToPlay, 0\)/);
  assert.match(app, /Activity\.music\.pause\(\)/);
  assert.match(app, /Activity\.music\.resume\(\)/);
  assert.match(app, /Activity\.music\.on\("play"/);
  assert.match(app, /Activity\.music\.on\("error"/);
  assert.match(app, /Activity\.user\.queryProfile\(\)/);
  assert.match(app, /Promise\.resolve\(\)[\s\S]*Activity\.user\.requireLogin/);
  assert.match(app, /QQ 音乐用户态不可用或会员状态查询失败，将交由 QMPlayer 校验实际播放权限/);
  assert.match(app, /Login was not completed\|Login is required/);
  assert.doesNotMatch(app, /new\s+Audio\s*\(|AudioContext|new\s+QMPlayer|Music\.client/);
  assert.match(runtime, /Activity\.registerCapability\("music"/);
  assert.match(runtime, /new window\.QMPlayer/);
  assert.match(index, /music-2\.4\.0\.min\.js/);
  assert.match(index, /qmplayer\.music\.js/);
  assert.doesNotMatch(index, /lib\/h5\/(?:preact|music)\.js/);
  assert.equal(chart.audio.localSrc, undefined);
  assert.equal(chart.audio.url, undefined);
});

test("loads canonical styles and preloads every current gameplay asset", async () => {
  const [index, app] = await Promise.all([
    readFile(path.join(PACKAGE, "index.html"), "utf8"),
    readFile(path.join(PACKAGE, "app.js"), "utf8"),
  ]);
  const resetIndex = index.indexOf("./reset.css");
  const remIndex = index.indexOf("./rem.780.css");
  const styleIndex = index.indexOf("./style.css");
  assert.ok(resetIndex >= 0 && resetIndex < remIndex && remIndex < styleIndex);
  assert.match(app, /function loadImages\(\)/);
  assert.match(app, /Promise\.all\(urls\.map/);
  assert.match(app, /fetch\("\.\/assets\/game-chart\.json"/);

  const references = new Set();
  for (const source of [index, app]) {
    for (const match of source.matchAll(/["'](\.\/assets\/[^"']+)["']/g)) {
      references.add(match[1]);
    }
  }
  for (const reference of references) {
    const target = path.resolve(PACKAGE, reference);
    assert.ok(target.startsWith(PACKAGE + path.sep));
    await readFile(target);
  }
});

test("publishes the same Skill package through Sites", async () => {
  const [packageSource, prepareSource, sourceIndex, outIndex, deployedIndex] =
    await Promise.all([
      readFile(path.join(ROOT, "package.json"), "utf8"),
      readFile(path.join(ROOT, "build", "prepare-activity-static.mjs"), "utf8"),
      readFile(path.join(PACKAGE, "index.html")),
      readFile(path.join(ROOT, "out", "index.html")),
      readFile(path.join(ROOT, "dist", "client", "index.html")),
    ]);
  const packageFile = JSON.parse(packageSource);
  const outFiles = await walk(path.join(ROOT, "out"));
  const deployedFiles = await walk(path.join(ROOT, "dist", "client"));

  assert.equal(
    packageFile.scripts["build:static"],
    "node build/prepare-activity-static.mjs",
  );
  assert.match(prepareSource, /forbiddenMediaExtensions/);
  assert.deepEqual(outIndex, sourceIndex);
  assert.deepEqual(deployedIndex, sourceIndex);
  assert.equal(outFiles.some((file) => AUDIO_PATTERN.test(file)), false);
  assert.equal(deployedFiles.some((file) => AUDIO_PATTERN.test(file)), false);
  await readFile(path.join(ROOT, "dist", "server", "index.js"));
});
