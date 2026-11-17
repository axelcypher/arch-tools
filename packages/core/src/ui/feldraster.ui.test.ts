// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Field } from './fields';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');
/** Rumpf der ersten Regel mit genau diesem Selektor */
function regel(selektor: string): string {
  const i = css.indexOf(`\n${selektor} {`);
  expect(i, selektor).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
}

let root: ReturnType<typeof createRoot> | null = null;
function render(el: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(el);
  });
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('Feldraster', () => {
  it('Spalten nach Platz, Mindestbreite über --feld-min, Felder fluchten unten', () => {
    const r = regel('.feldraster');
    expect(r).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(var\(--feld-min,\s*200px\),\s*100%\),\s*1fr\)\)/);
    expect(r).toMatch(/gap:\s*var\(--s2\)\s+var\(--s3\)/);
    expect(r).toMatch(/align-items:\s*end/);
    expect(r).toMatch(/container:\s*feldraster\s*\/\s*inline-size/);
  });

  it('Beschriftung über dem Feld, ohne den Außenabstand von .field; Kästchen mit Text bleibt in einer Zeile', () => {
    const r = regel('.feldraster > :where(label, .field):not(.toggle)');
    expect(r).toMatch(/flex-direction:\s*column/);
    expect(r).toMatch(/margin:\s*0/);
    expect(r).toMatch(/min-width:\s*0/);
    expect(regel('.feldraster > .toggle')).toMatch(/min-height:\s*var\(--ctl-h\)/);
  });

  it('Felder füllen ihre Spalte, Kästchen und Regler nicht', () => {
    const r = regel(".feldraster > * > :where(input:not([type='checkbox'], [type='radio'], [type='range']), select, textarea)");
    expect(r).toMatch(/width:\s*100%/);
  });

  it('ganze Zeile und zwei Spalten; zwei Spalten wird schmal zur ganzen Zeile', () => {
    expect(regel('.feldraster > .feldraster-breit')).toMatch(/grid-column:\s*1\s*\/\s*-1/);
    expect(regel('.feldraster > .feldraster-zwei')).toMatch(/grid-column:\s*span 2/);
    // Grenze = zwei Spalten in der Vorgabebreite plus Spalt (--s3)
    const m = css.match(/@container feldraster \(width < (\d+)px\) \{\s*\.feldraster > \.feldraster-zwei \{\s*grid-column:\s*1\s*\/\s*-1;/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(2 * 200 + 12);
  });

  it('Field setzt die Breite im Raster über breite', () => {
    const host = render(
      h('div', { className: 'feldraster' }, [
        h(Field, { key: 'a', label: 'Maßstab', children: h('input') }),
        h(Field, { key: 'b', label: 'Stil', breite: 'zwei', children: h('select') }),
        h(Field, { key: 'c', label: 'Beschriftung', breite: 'zeile', children: h('textarea') }),
      ]),
    );
    const labels = [...host.querySelectorAll('label')];
    expect(labels.map((l) => l.className)).toEqual(['field', 'field feldraster-zwei', 'field feldraster-breit']);
    expect(labels[1].querySelector('.field-label')?.textContent).toBe('Stil');
  });
});
