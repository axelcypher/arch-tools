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

describe('Berechnete Felder', () => {
  it('Grund der Fläche, gestrichelter Rahmen, Schrift in Textfarbe', () => {
    const r = regel(':is(input, textarea).berechnet');
    expect(r).toMatch(/background:\s*var\(--bg\)/);
    expect(r).toMatch(/border-style:\s*dashed/);
    expect(r).toMatch(/color:\s*var\(--text\)/);
    expect(r).not.toMatch(/opacity|pointer-events/);
  });

  it('Herkunft als Zeile unter dem Feld, im Feldraster in der Spur der Hinweise', () => {
    expect(regel('.feld-herkunft')).toMatch(/display:\s*flex/);
    expect(regel('.feldraster > :is(label, .field, :has(> .field-label)) > .feld-herkunft')).toMatch(/grid-row:\s*3/);
  });
});
