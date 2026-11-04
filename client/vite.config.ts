import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Stamps the service worker with this build: its id (so each release is a new worker the app can
 * offer to load) and every emitted chunk (so lazily loaded screens also open offline).
 */
function serviceWorkerManifest(): Plugin {
  let outDir = "";
  let files: string[] = [];
  return {
    name: "neochat-sw-manifest",
    apply: "build",
    configResolved(c) {
      outDir =
        c.build.outDir.startsWith("/") || /^[A-Za-z]:/.test(c.build.outDir)
          ? c.build.outDir
          : join(c.root, c.build.outDir);
    },
    generateBundle(_, bundle) {
      files = Object.keys(bundle)
        .filter((f) => f.startsWith("assets/") && !f.endsWith(".map"))
        .map((f) => "/" + f);
    },
    writeBundle() {
      const p = join(outDir, "sw.js");
      const build = Date.now().toString(36);
      const src = readFileSync(p, "utf8")
        .replace('"__BUILD__"', JSON.stringify(build))
        .replace("[] /*__PRECACHE__*/", JSON.stringify(files));
      writeFileSync(p, src);
    },
  };
}

// The build output is embedded into the Go binary (server/web/dist).
export default defineConfig({
  plugins: [react(), serviceWorkerManifest()],
  build: {
    outDir: "../server/web/dist",
    emptyOutDir: true,
    target: "es2020",
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5180,
    proxy: {
      "/api": { target: "https://127.0.0.1:8443", secure: false, ws: true },
      "/media": { target: "https://127.0.0.1:8443", secure: false },
      "/go": { target: "https://127.0.0.1:8443", secure: false },
      "/manifest.webmanifest": { target: "https://127.0.0.1:8443", secure: false },
    },
  },
});
