import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Test config, separate from vite.config.ts.
 *
 * The dev config carries a dev-server proxy, a virtual-module plugin for executor schemas and
 * the React compiler babel pass — none of which a test run needs, and the last of which makes
 * every file slower to transform. Only the aliases are shared, because imports must resolve the
 * same way they do in the app.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      shared: path.resolve(__dirname, '../shared'),
      'posthog-js/react': path.resolve(__dirname, './src/lib/noop/posthog.ts'),
      'posthog-js': path.resolve(__dirname, './src/lib/noop/posthog.ts'),
      '@sentry/react': path.resolve(__dirname, './src/lib/noop/sentry.ts'),
      'virtual:executor-schemas': path.resolve(
        __dirname,
        './src/lib/noop/executorSchemas.ts'
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
