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

describe('Marken', () => {
  it('.marke.pille: runde Enden und mehr Innenabstand, Farben aus den Varianten', () => {
    const r = regel('.marke.pille');
    expect(r).toMatch(/border-radius:\s*999px/);
    expect(r).toMatch(/padding:\s*0 var\(--s2\)/);
    expect(r).not.toMatch(/background|color/);
  });

  it('.marke.fehler in den Fehlerfarben', () => {
    const r = regel('.marke.fehler');
    expect(r).toMatch(/background:\s*var\(--fehler-bg\)/);
    expect(r).toMatch(/color:\s*var\(--fehler-text\)/);
  });

  it('keine eigene Marken-Klasse mehr für die Apps in den Einstellungen', () => {
    expect(css).not.toMatch(/\n\.einst-app \{/);
  });
});

describe('Radien von Meldungen', () => {
  it('Meldung im Inhalt und .warning --radius-s, schwebender Hinweis und Meldung auf der Zeichenfläche --radius', () => {
    const r = (sel: string) => regel(sel).match(/border-radius:\s*([^;]+);/)?.[1];
    expect(r('.meldung')).toBe('var(--radius-s)');
    expect(r('.warning')).toBe('var(--radius-s)');
    expect(r('.hinweise > .hinweis')).toBe('var(--radius)');
    // nur im Stapel: .hinweis allein rundet nicht (Elemente der Apps mit einer Art „hinweis“)
    expect(regel('.hinweis')).not.toMatch(/border-radius/);
    // schwebende Meldung über der Zeichenfläche ist eine schwebende Ebene
    expect(r('.canvas-message')).toBe('var(--radius)');
  });
});
