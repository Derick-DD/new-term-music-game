import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "out");
const MANIFEST_NAME = "static-build-manifest.json";
const AUDIO_PATTERN = /\.(?:aac|flac|m4a|mp3|ogg|wav)$/i;
const IMAGE_PATTERN = /\.(?:gif|jpe?g|png|svg|webp)$/i;
const SOURCE_ROOTS = ["app", "public", "static", "build"];
const SOURCE_FILES = [
  "package.json",
  "package-lock.json",
  "postcss.config.mjs",
  "tsconfig.json",
  "vite.static.config.ts",
];

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

async function existingSourceFiles() {
  const files = [];
  for (const root of SOURCE_ROOTS) files.push(...(await walk(path.join(ROOT, root))));
  for (const relativePath of SOURCE_FILES) {
    const fullPath = path.join(ROOT, relativePath);
    if ((await stat(fullPath)).isFile()) files.push(fullPath);
  }
  return files.sort();
}

async function describeTree(files, base) {
  const described = [];
  for (const fullPath of files) {
    const relativePath = path.relative(base, fullPath).split(path.sep).join("/");
    const buffer = await readFile(fullPath);
    described.push({ path: relativePath, bytes: buffer.byteLength, sha256: sha256(buffer) });
  }
  return described;
}

function treeSha256(files) {
  return sha256(Buffer.from(files.map((file) => `${file.path}\0${file.sha256}\n`).join("")));
}

function assert(condition, message) {
  if (!condition) throw new Error(`[static-export] ${message}`);
}

async function assertExactPublicCopy(relativePath) {
  const [source, output] = await Promise.all([
    readFile(path.join(ROOT, "public", relativePath)),
    readFile(path.join(OUT, relativePath)),
  ]);
  assert(source.equals(output), `${relativePath} 与当前 public/ 源文件不一致`);
}

const sourcePaths = await existingSourceFiles();
const sourceFiles = await describeTree(sourcePaths, ROOT);
assert(sourceFiles.every((file) => !AUDIO_PATTERN.test(file.path)), "当前源码中仍存在音频文件");
assert(sourceFiles.every((file) => !file.path.endsWith("/.DS_Store") && file.path !== ".DS_Store"), "当前源码中仍存在 .DS_Store");

const configuredImages = JSON.parse(
  await readFile(path.join(ROOT, "app", "data", "static-image-assets.json"), "utf8"),
);
const publicImages = (await walk(path.join(ROOT, "public")))
  .filter((file) => IMAGE_PATTERN.test(file))
  .map((file) => `/${path.relative(path.join(ROOT, "public"), file).split(path.sep).join("/")}`)
  .sort();
assert(Array.isArray(configuredImages), "图片预加载清单必须是数组");
assert(new Set(configuredImages).size === configuredImages.length, "图片预加载清单存在重复路径");
assert(
  JSON.stringify([...configuredImages].sort()) === JSON.stringify(publicImages),
  "图片预加载清单必须与 public/ 下全部图片完全一致",
);

const sourceGitCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).trim();
const sourceGitStatus = execFileSync(
  "git",
  ["status", "--porcelain", "--", ...SOURCE_ROOTS, ...SOURCE_FILES],
  { cwd: ROOT, encoding: "utf8" },
).trim();

const allOutputPaths = await walk(OUT);
const artifactPaths = allOutputPaths.filter((file) => path.basename(file) !== MANIFEST_NAME);
const artifacts = await describeTree(artifactPaths, OUT);
assert(artifacts.some((file) => file.path === "index.html"), "缺少静态入口 out/index.html");
assert(artifacts.some((file) => file.path.startsWith("assets/") && file.path.endsWith(".js")), "缺少浏览器静态 JavaScript");
assert(artifacts.some((file) => file.path.startsWith("assets/") && file.path.endsWith(".css")), "缺少浏览器静态 CSS");
assert(artifacts.every((file) => !file.path.startsWith("_next/")), "静态产物仍包含 Next 运行时目录");
assert(artifacts.every((file) => !AUDIO_PATTERN.test(file.path)), "静态产物中存在音频文件");
assert(artifacts.every((file) => !file.path.endsWith("/.DS_Store") && file.path !== ".DS_Store"), "静态产物中存在 .DS_Store");

await Promise.all([
  assertExactPublicCopy("activity.config.js"),
  assertExactPublicCopy("activity-bridge.js"),
  assertExactPublicCopy("assets/campus-season/campus-share-qr.svg"),
  assertExactPublicCopy("og.png"),
]);

const [activityConfigSource, activityBridgeSource] = await Promise.all([
  readFile(path.join(ROOT, "public", "activity.config.js"), "utf8"),
  readFile(path.join(ROOT, "public", "activity-bridge.js"), "utf8"),
]);
assert(
  /outsideLaunch\s*:\s*\{\s*enabled\s*:\s*false\s*\}/.test(activityConfigSource),
  "上线版本必须禁用 outsideLaunch",
);
assert(!activityBridgeSource.includes("QMPlugin"), "上线版本不得保留 QMPlugin 端外拉起实现");

const searchableExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".txt"]);
const searchable = (
  await Promise.all(
    artifactPaths
      .filter((file) => searchableExtensions.has(path.extname(file)))
      .map((file) => readFile(file, "utf8")),
  )
).join("\n");

for (const marker of [
  "lib/h5/preact.js?max_age=2592000",
  "lib/h5/music.js?max_age=604800",
  "window.Music = window.Music || window.M",
  "qmfe-unity-report/iife/index.js",
  "fixTopBar.js",
  "qmplayer.music.js",
  "Activity.registerCapability(\"music\"",
  "380208811",
  "按住底部摇杆左右拖动",
  "这次开学，我的隐藏人设被发现了",
  "DRAG TO STEER",
  "share-card-tagline",
  "https://y.qq.com/viber_pub/campus_gogogo/index.html?_hidehd=1&_miniplayer=1",
]) {
  assert(searchable.includes(marker), `静态产物缺少当前代码标记：${marker}`);
}

const html = await readFile(path.join(OUT, "index.html"), "utf8");
const orderedScripts = [
  "polyfill.min.js",
  "/lib/h5/preact.js",
  "/lib/h5/music.js",
  "window.Music = window.Music || window.M",
  "qmfe-unity-report/iife/index.js",
  "fixTopBar.js",
  "qmplayer.music.js",
  "activity.config.js?v=",
  "activity-bridge.js?v=",
];
let previousIndex = -1;
for (const script of orderedScripts) {
  const index = html.indexOf(script);
  assert(index > previousIndex, `Activity 脚本顺序错误或缺少：${script}`);
  previousIndex = index;
}
assert(!html.includes("__ACTIVITY_CONFIG_VERSION__"), "Activity 配置缓存版本未生成");
assert(!html.includes("__ACTIVITY_RUNTIME_VERSION__"), "Activity 运行时缓存版本未生成");
assert(!/<script[^>]+y\.qq\.com[^>]+crossorigin/i.test(html), "QQ 音乐经典脚本不应启用 CORS 模式");
for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
  const reference = match[1];
  if (!/^(?:https?:)?\/\//i.test(reference)) {
    assert(!reference.startsWith("/"), `本地入口引用必须使用可部署的相对路径：${reference}`);
  }
}
const outputCss = (
  await Promise.all(
    artifactPaths.filter((file) => file.endsWith(".css")).map((file) => readFile(file, "utf8")),
  )
).join("\n");
assert(!/url\(\s*["']?\//i.test(outputCss), "CSS 资源仍使用域名根路径，无法部署到活动子目录");

for (const forbidden of [
  "/_next/",
  "__next_s",
  "__next_f",
  "Music user CDN is unavailable",
  "Activity.user",
  "congratulations-treasure-tf-family.mp3",
  "music-2.4.0.min.js",
  "QMPlugin",
  "qmfe-unity-ad",
  "activity-sdk-loader",
  "activity-sites.config",
  ["chat", "gpt"].join(""),
  ["derick", "dcr"].join("-"),
  "earth-tour",
  "lueluelue",
  "og-sites.png",
]) {
  assert(!searchable.toLowerCase().includes(forbidden.toLowerCase()), `静态产物仍包含已禁用内容：${forbidden}`);
}

const manifest = {
  schemaVersion: 1,
  buildType: "vite-static-export-no-next",
  generatedAt: new Date().toISOString(),
  sourceGitCommit,
  sourceInputsClean: sourceGitStatus === "",
  sourceDirectories: SOURCE_ROOTS,
  sourceFiles,
  sourceTreeSha256: treeSha256(sourceFiles),
  artifactCount: artifacts.length,
  artifactTreeSha256: treeSha256(artifacts),
  guarantees: {
    currentApplicationSource: true,
    staticOnly: true,
    bundledAudio: false,
    membershipDetection: false,
    outsideLaunch: false,
    pvUvScripts: ["preact.js", "music.js"],
    songId: 380208811,
  },
};

await writeFile(path.join(OUT, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[static-export] verified ${sourceFiles.length} source files -> ${artifacts.length} static artifacts`);
console.log(`[static-export] source ${manifest.sourceTreeSha256}`);
console.log(`[static-export] output ${manifest.artifactTreeSha256}`);
