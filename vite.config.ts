import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";

const SERVER_PORT = 4317;
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "web",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GH_REPO__: JSON.stringify("AmarShaked/kablan.dev"),
  },
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
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./web/test/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
  },
} as any);
