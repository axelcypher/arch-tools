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
      const fest = [...css.matchAll(/border(?:-[a-z]+)*-radius:\s*([^;]+);/g)].map((m) => m[1]).filter((w) => /\dpx/.test(w) && !/999px/.test(w));
      // unter 4px nur die Kleinstteile (Farbfeld, Einfügemarke)
      expect(
        fest.every((w) => w === '2px'),
        `${datei}: ${fest.join(', ')}`,
      ).toBe(true);
      expect(fest.length, datei).toBeLessThanOrEqual(datei === 'base.css' || datei === 'ansicht.css' ? 1 : 0);
    }
  });
});

describe('verschachtelte Kästen im Editor der Ansichten', () => {
  it('Katalog, Abschnitt und Verknüpfungsliste im Dialog --radius-s, Felder darin --radius-xs', () => {
    const css = readFileSync(join(ordner, 'ansicht.css'), 'utf8');
    const radius = (sel: string) => {
      const i = css.indexOf(`\n${sel} {`);
      expect(i, sel).toBeGreaterThan(-1);
      return css.slice(i, css.indexOf('}', i)).match(/border-radius:\s*([^;]+);/)?.[1];
    };
    for (const sel of ['.av-ed-katalog', '.av-ed-abschnitt', '.av-verknuepfen-liste']) expect(radius(sel), sel).toBe('var(--radius-s)');
    for (const sel of ['.av-ed-feld', '.av-ed-leer', '.av-ed-kat-feld']) expect(radius(sel), sel).toBe('var(--radius-xs)');
  });
});
