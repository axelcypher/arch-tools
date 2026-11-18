import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ordner = dirname(fileURLToPath(import.meta.url));
const dateien = ['base.css', 'ansicht.css', 'projektuebersicht.css', 'projektwahl.css'];

describe('Radien aus der Skala', () => {
  it('drei Stufen in base.css: --radius-xs 4px, --radius-s 6px, --radius 8px', () => {
    const css = readFileSync(join(ordner, 'base.css'), 'utf8');
    expect(css).toMatch(/--radius-xs:\s*4px;/);
    expect(css).toMatch(/--radius-s:\s*6px;/);
    expect(css).toMatch(/--radius:\s*8px;/);
  });

  it('core nutzt für Rundungen der Skala die Token statt fester Werte (unter 4px nur Kleinstteile, Pillen 999px)', () => {
    for (const datei of dateien) {
      const css = readFileSync(join(ordner, datei), 'utf8');
      const fest = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1]).filter((w) => /(^|\s)([4-9]|\d{2})px/.test(w) && !/999px/.test(w));
      expect(fest, datei).toEqual([]);
    }
  });
});
