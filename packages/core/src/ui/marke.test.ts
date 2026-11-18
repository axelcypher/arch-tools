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

  it('keine eigene Marken-Klasse mehr für die Apps in den Einstellungen', () => {
    expect(css).not.toMatch(/\n\.einst-app \{/);
  });
});
