// Ecken kommen aus der Skala (design.md „Skalen“): Token für Felder, Kästen und Flächen, `999px` für Marken mit runden
// Enden, `50%` für Kreise. Feste Werte bleiben nur für `0` und Kleinstteile (2px).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ERLAUBT = /^(0|2px|50%|999px|var\(--radius(-xs|-s)?\))$/;

describe('Radien in styles.css', () => {
  it('nehmen nur Token oder die festen Ausnahmen', () => {
    const css = readFileSync(path.resolve(__dirname, 'styles.css'), 'utf8');
    const fremd: string[] = [];
    for (const m of css.matchAll(/border(?:-[a-z]+)*-radius:\s*([^;]+);/g)) {
      for (const teil of m[1].trim().split(/\s+/)) if (!ERLAUBT.test(teil)) fremd.push(m[0]);
    }
    expect(fremd).toEqual([]);
  });
});
