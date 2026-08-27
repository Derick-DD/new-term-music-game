import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOTS = ["app", "public", "static", "build", "worker"];

async function removeFinderMetadata(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await removeFinderMetadata(fullPath);
    else if (entry.isFile() && entry.name === ".DS_Store") await rm(fullPath);
  }
}

await Promise.all(
  SOURCE_ROOTS.map((directory) => removeFinderMetadata(path.join(ROOT, directory))),
);
