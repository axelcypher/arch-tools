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

describe('Kennzahl-Kacheln', () => {
  it('Einheit am Wert kleiner, normal und gedämpft', () => {
    const r = regel('.metric > strong small');
    expect(r).toMatch(/font-size:\s*var\(--fs-s\)/);
    expect(r).toMatch(/font-weight:\s*normal/);
    expect(r).toMatch(/color:\s*var\(--muted\)/);
  });

  it('Kennzahl mit Prüfergebnis: Kopf als Zeile, Wert oben statt unten bündig, breiter', () => {
    expect(regel('.metric > .metric-kopf')).toMatch(/justify-content:\s*space-between/);
    expect(regel('.metric.pruefung > strong')).toMatch(/margin-top:\s*0/);
    expect(regel('.metric.pruefung')).toMatch(/flex-basis:\s*12em/);
    // die Grundregel bleibt unten bündig
    expect(regel('.metric > strong')).toMatch(/margin-top:\s*auto/);
  });

  it('Kopf so hoch wie eine Marke und umbrechend', () => {
    const r = regel('.metric > .metric-kopf');
    expect(r).toMatch(/min-height:\s*18px/);
    expect(r).toMatch(/flex-wrap:\s*wrap/);
  });

  it('Warnung und Fehler als Innenrand in den Textfarben des Zustands, ohne Rahmen', () => {
    const w = regel('.metric.warnung');
    const f = regel('.metric.fehler');
    expect(w).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--warn-text\)/);
    expect(f).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--fehler-text\)/);
    // Punktfarbe (zu wenig Kontrast auf hellem Grund) und --danger (nur für zerstörende Aktionen) nicht
    expect(w + f).not.toMatch(/--warn-punkt|--danger|border/);
    expect(css).not.toMatch(/\n\.metric\.alarm \{/);
  });
});
