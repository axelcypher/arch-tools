// Ecken kommen aus der Skala (design.md „Skalen“): Token für Felder, Kästen und Flächen, `999px` für Pillen (Zähler,
// Balken, Marken), `50%` für Kreise, `0` für gerade Kanten. 2px nur für die benannten Kleinstteile.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ERLAUBT = /^(0|50%|999px|var\(--radius(-xs|-s)?\))$/;
const KLEINSTTEILE = ['.pdf-vormerk', '.wd-blatt.bearbeiten .wd-lauf', '.fo-seiten.einrichten .fo-ein-feld'];

const css = readFileSync(path.resolve(__dirname, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Alle Radien mit dem Selektor ihrer Regel (ohne verschachtelte @-Regeln aufzulösen: der innerste Selektor zählt). */
function radien(): { sel: string; wert: string }[] {
  const aus: { sel: string; wert: string }[] = [];
  for (const regel of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = regel[1].trim().replace(/\s+/g, ' ');
    for (const m of regel[2].matchAll(/border(?:-[a-z]+)*-radius:\s*([^;]+);/g)) aus.push({ sel, wert: m[1].trim() });
  }
  return aus;
}

describe('Radien in styles.css', () => {
  it('nehmen nur Token oder die festen Ausnahmen', () => {
    const fremd = radien().filter(({ sel, wert }) => wert.split(/\s+/).some((teil) => !ERLAUBT.test(teil) && !(teil === '2px' && KLEINSTTEILE.includes(sel))));
    expect(fremd).toEqual([]);
  });

  it('2px nur bei den Kleinstteilen, und dort auch wirklich', () => {
    const mit2px = radien()
      .filter(({ wert }) => wert.split(/\s+/).includes('2px'))
      .map(({ sel }) => sel);
    expect(mit2px.sort()).toEqual([...KLEINSTTEILE].sort());
  });
});
