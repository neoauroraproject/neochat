import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The build output is embedded into the Go binary (server/web/dist).
export default defineConfig({
  plugins: [react()],
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
