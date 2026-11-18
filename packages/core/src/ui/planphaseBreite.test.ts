import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
const regel = (sel: string) => {
  const i = css.indexOf(`\n${sel} {`);
  expect(i, sel).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

// In Chromium nachgemessen: in einer 272px breiten Karte mit align-items: flex-start wuchs die kompakte Planungsphase
// vorher auf 397px (Breite des längsten Eintrags), jetzt 270px.
describe('Planungsphase kompakt in schmalen Behältern', () => {
  it('Stammdaten-Knopf nie breiter als der Behälter', () => {
    expect(regel('.sd-knopf')).toMatch(/max-width:\s*100%/);
  });

  it('die Auswahl darf schmaler werden als ihr längster Eintrag', () => {
    const r = regel('.sd-phase-kopf select');
    expect(r).toMatch(/min-width:\s*0/);
    expect(r).toMatch(/max-width:\s*100%/);
  });
});
