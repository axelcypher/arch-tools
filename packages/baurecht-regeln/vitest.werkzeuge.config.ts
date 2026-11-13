import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Werkzeuge zum Pflegen des Regelpakets (Prüfsummen, neue Fassung, Texterkennung, Index) – laufen über vitest, damit
 * sie dieselbe Auswertung und dieselben Adapter wie die App benutzen. Aufruf: npm run <werkzeug> -w @akh/baurecht-regeln
 */
export default defineConfig({
  resolve: { alias: { '@core': fileURLToPath(new URL('../core/src', import.meta.url)) } },
  define: { __APP_VERSION__: JSON.stringify('werkzeug') },
  test: {
    name: 'regeln-werkzeuge',
    environment: 'node',
    include: ['werkzeuge/**/*.werkzeug.ts'],
    testTimeout: 30 * 60 * 1000,
    hookTimeout: 60000,
  },
});
