import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.VITE_BASE_PATH ?? "/admin/";

  return {
    base,
    plugins: [react(), tailwindcss()],
    server: {
      port: 5174,
      proxy: {
        "/api/v1": {
          target: "http://localhost:3000",
          changeOrigin: true,
        },
      },
    },
  };
});
