// vite.config.ts
import { createLogger, defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
// The version people actually install is the wrapper's, not this workspace package's, which
// still carries the number inherited from upstream.
import releasePkg from "../npx-cli/package.json";

function createFilteredLogger() {
  const logger = createLogger();
  const originalError = logger.error.bind(logger);

  let lastRestartLog = 0;
  const DEBOUNCE_MS = 2000;

  logger.error = (msg, options) => {
    const isProxyError =
      msg.includes("ws proxy socket error") ||
      msg.includes("ws proxy error:") ||
      msg.includes("http proxy error:");

    if (isProxyError) {
      const now = Date.now();
      if (now - lastRestartLog > DEBOUNCE_MS) {
        logger.warn("Proxy connection closed, auto-reconnecting...");
        lastRestartLog = now;
      }
      return;
    }
    originalError(msg, options);
  };

  return logger;
}

function executorSchemasPlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:executor-schemas';
  const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

  return {
    name: 'executor-schemas-plugin',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID; // keep it virtual
      return null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;

      const schemasDir = path.resolve(__dirname, '../shared/schemas');
      const files = fs.existsSync(schemasDir)
        ? fs.readdirSync(schemasDir).filter((f) => f.endsWith('.json'))
        : [];

      const imports: string[] = [];
      const entries: string[] = [];

      files.forEach((file, i) => {
        const varName = `__schema_${i}`;
        const importPath = `shared/schemas/${file}`; // uses your alias
        const key = file.replace(/\.json$/, '').toUpperCase(); // claude_code -> CLAUDE_CODE
        imports.push(`import ${varName} from "${importPath}";`);
        entries.push(`  "${key}": ${varName}`);
      });

      // IMPORTANT: pure JS (no TS types), and quote keys.
      const code = `
${imports.join('\n')}

export const schemas = {
${entries.join(',\n')}
};

export default schemas;
`;
      return code;
    },
  };
}

export default defineConfig({
  customLogger: createFilteredLogger(),
  define: {
    __APP_VERSION__: JSON.stringify(releasePkg.version),
  },
  plugins: [
    react({
      babel: {
        plugins: [
          [
            'babel-plugin-react-compiler',
            {
              target: '18',
              sources: [path.resolve(__dirname, 'src')],
              environment: {
                enableResetCacheOnSourceFileChanges: true,
              },
            },
          ],
        ],
      },
    }),
    executorSchemasPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      shared: path.resolve(__dirname, '../shared'),
      // Kablan fork: analytics/crash-reporting are removed. Aliasing the packages themselves
      // (rather than editing each call site) guarantees nothing is sent, including from code
      // added later that imports them.
      'posthog-js/react': path.resolve(__dirname, './src/lib/noop/posthog.ts'),
      'posthog-js': path.resolve(__dirname, './src/lib/noop/posthog.ts'),
      '@sentry/react': path.resolve(__dirname, './src/lib/noop/sentry.ts'),
    },
  },
  server: {
    port: parseInt(process.env.FRONTEND_PORT || '5310'),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.BACKEND_PORT || '5311'}`,
        changeOrigin: true,
        ws: true,
      },
    },
    fs: {
      allow: [path.resolve(__dirname, '.'), path.resolve(__dirname, '..')],
    },
    open: process.env.VITE_OPEN === 'true',
    allowedHosts: [
      '.trycloudflare.com', // allow all cloudflared tunnels
    ],
  },
  optimizeDeps: {
    exclude: ['wa-sqlite'],
  },
  build: {
    // Off by default. The map is ~17MB against a ~5MB bundle: it went into every installer, and
    // building it blew Node's default 2GB heap on CI. Nothing consumes it — this fork ships no
    // crash reporting unless KABLAN_SENTRY_DSN is set. Set VITE_SOURCEMAP=true to get it back
    // when actually debugging a production bundle.
    sourcemap: process.env.VITE_SOURCEMAP === 'true',
  },
});
