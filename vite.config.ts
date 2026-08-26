import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const staticAssetWorker = {
  main: "./worker/index.ts",
  compatibility_date: "2026-08-26",
  compatibility_flags: ["nodejs_compat"],
  assets: {
    binding: "ASSETS",
    not_found_handling: "single-page-application" as const,
    run_worker_first: true,
  },
};

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    publicDir: "out",
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    build: {
      rollupOptions: {
        input: "./build/static-adapter.ts",
      },
    },
    plugins: [
      sites(),
      cloudflare({
        viteEnvironment: { name: "server" },
        config: staticAssetWorker,
      }),
    ],
  };
});
