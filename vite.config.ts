import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { readFileSync } from "node:fs";

const SERVER_PORT = 4317;
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"));

/**
 * The analytics snippet in web/index.html carries data-track-localhost="true" so it counts the
 * desktop app (which runs on tauri://localhost). During dev — `vite`/`npm run dev` and `tauri dev`,
 * both localhost too — we strip that attribute so local sessions aren't tracked; track.js then falls
 * back to its default localhost skip. `transformIndexHtml` runs in both serve and build; `ctx.server`
 * is only set while the dev server is running, so this fires only in dev, never in the shipped build.
 */
const stripTrackLocalhostInDev = {
  name: "strip-track-localhost-in-dev",
  transformIndexHtml(html: string, ctx: { server?: unknown }) {
    return ctx.server ? html.replace(/\s*data-track-localhost="true"/, "") : html;
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), stripTrackLocalhostInDev],
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
});
