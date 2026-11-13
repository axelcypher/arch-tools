import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@core': fileURLToPath(new URL('../core/src', import.meta.url)) } },
  define: { __APP_VERSION__: JSON.stringify('test') },
  test: {
    // große Matrizen nur mit CI=true bzw. VOLL=1 voll, sonst Stichprobe (test/paket.test.ts, docs/baurecht.md)
    name: 'regeln',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
