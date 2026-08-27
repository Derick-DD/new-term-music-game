import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const ROOT = dirname(fileURLToPath(import.meta.url));

async function fileVersion(relativePath: string) {
  const source = await readFile(resolve(ROOT, relativePath));
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

function activityRuntimeVersions(): Plugin {
  let loaderVersion = "";
  let configVersion = "";
  let runtimeVersion = "";

  return {
    name: "activity-runtime-versions",
    async buildStart() {
      [loaderVersion, configVersion, runtimeVersion] = await Promise.all([
        fileVersion("public/activity-sdk-loader.js"),
        fileVersion("public/activity-sites.config.js"),
        fileVersion("public/activity-bridge.js"),
      ]);
    },
    transformIndexHtml(html) {
      return html
        .replaceAll("__ACTIVITY_SDK_LOADER_VERSION__", loaderVersion)
        .replaceAll("__ACTIVITY_CONFIG_VERSION__", configVersion)
        .replaceAll("__ACTIVITY_RUNTIME_VERSION__", runtimeVersion);
    },
  };
}

export default defineConfig({
  root: resolve(ROOT, "static"),
  publicDir: resolve(ROOT, "public"),
  base: "/",
  build: {
    outDir: resolve(ROOT, "out"),
    emptyOutDir: true,
    target: "es2017",
    assetsInlineLimit: 0,
  },
  plugins: [activityRuntimeVersions()],
});
