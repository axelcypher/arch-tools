import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Tauri erwartet einen festen Port und setzt TAURI_ENV_* Variablen beim Build.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // gemeinsamer Unterbau (packages/core) und Regelpaket (packages/baurecht-regeln) als Quelltext
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('../../packages/core/src', import.meta.url)),
      '@regeln': fileURLToPath(new URL('../../packages/baurecht-regeln', import.meta.url)),
    },
  },
  base: './',
  clearScreen: false,
  server: {
    port: 1490,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1491 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
    fs: { allow: ['../..'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  define: {
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    name: 'baurecht',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
