import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@core': fileURLToPath(new URL('../core/src', import.meta.url)) } },
  define: { __APP_VERSION__: JSON.stringify('test') },
  test: {
    name: 'regeln',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
