import { access, cp, mkdir, readdir, rm } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = process.cwd();
const source = resolve(
  root,
  "releases",
  "fan-bus-rhythm-rush-h5-20260827",
);
const output = resolve(root, "out");

const requiredFiles = [
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
const forbiddenMediaExtensions = new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".wav",
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

await Promise.all(requiredFiles.map((file) => access(resolve(source, file))));
const sourceFiles = await walk(source);
const bundledAudio = sourceFiles.filter((file) =>
  forbiddenMediaExtensions.has(extname(file).toLowerCase()),
);
if (bundledAudio.length) {
  throw new Error(
    `Activity H5 must use Activity.music/QMPlayer and cannot bundle audio: ${bundledAudio.join(", ")}`,
  );
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });

console.log(`Prepared Skill-compliant static H5: ${output}`);
