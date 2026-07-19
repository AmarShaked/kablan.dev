import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const SERVER_PORT = 4317;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "web",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./web", import.meta.url)),
    },
  },
  server: {
    port: 5317,
    proxy: {
      // Anchor to "/api/" so it doesn't swallow the frontend's own /api.ts module.
      "^/api/": { target: `http://localhost:${SERVER_PORT}`, changeOrigin: true },
      "/ws": { target: `ws://localhost:${SERVER_PORT}`, ws: true },
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
