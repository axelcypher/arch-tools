import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test') },
  test: {
    name: 'core',
    // Windows-Runner im Release sind langsam: rechenintensive Tests (Archiv, Dach, IFC) brauchen dort mehr als 5 s
    testTimeout: 30_000,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
