// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Field } from './fields';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom rechnet kein Grid: die Tests prüfen die Regeln als Text; die Ausrichtung (Flucht mit Hinweis, Meldung,
// umbrechender Beschriftung, Kästchen mittig) ist in Chromium nachgemessen.
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
  it('Spalten nach Platz, Mindestbreite über --feld-min, Abstände aus der Skala', () => {
    const r = regel('.feldraster');
    expect(r).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(var\(--feld-min,\s*200px\),\s*100%\),\s*1fr\)\)/);
    expect(r).toMatch(/column-gap:\s*var\(--s3\)/);
    expect(r).toMatch(/row-gap:\s*0/);
    // Container nur mit Zwei-Spalten-Feld (Container sind Bezug für position: fixed)
    expect(r).not.toMatch(/container/);
    expect(regel('.feldraster:has(> .feldraster-zwei)')).toMatch(/container:\s*feldraster\s*\/\s*inline-size/);
  });

  it('jedes Feld belegt vier Spuren (Beschriftung, Feld, Hinweis, Meldung), damit die Felder einer Zeile fluchten', () => {
    expect(regel('.feldraster > *')).toMatch(/grid-row:\s*span 4/);
    expect(regel('.feldraster > *')).toMatch(/margin:\s*0 0 var\(--s2\)/);
    expect(regel('.feldraster > :is(label, .field, :has(> .field-label))')).toMatch(/grid-template-rows:\s*subgrid/);
    expect(regel('.feldraster > :is(label, .field, :has(> .field-label)) > *')).toMatch(/grid-row:\s*2/);
    // Felder werden nicht gestreckt, wenn eine Angabe daneben die Spur höher macht
    expect(regel('.feldraster > :is(label, .field, :has(> .field-label)) > *')).toMatch(/align-self:\s*start/);
    const beschriftung = regel('.feldraster > :is(label, .field, :has(> .field-label)) > .field-label');
    expect(beschriftung).toMatch(/grid-row:\s*1/);
    expect(beschriftung).toMatch(/align-self:\s*end/);
    expect(regel('.feldraster > :is(label, .field, :has(> .field-label)) > .field-hint')).toMatch(/grid-row:\s*3/);
    expect(regel('.feldraster > :is(label, .field, :has(> .field-label)) > .feld-meldung')).toMatch(/grid-row:\s*4/);
  });

  it('Kästchen mit Text steht in der Spur der Felder, auch mit bloßem Text', () => {
    expect(regel('.feldraster > label.toggle')).toMatch(/grid-template-columns:\s*auto 1fr/);
    expect(regel('.feldraster > label.toggle > *')).toMatch(/align-self:\s*center/);
    const vor = regel('.feldraster > label.toggle::before');
    expect(vor).toMatch(/grid-row:\s*1/);
    expect(vor).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });

  it('Felder im Raster sind so hoch wie die anderen Bedienelemente', () => {
    expect(css).toMatch(/:where\(\.toolbar, \.field, \.feldraster\) :where\(select, input:not\([^)]*\)\) \{\s*min-height:\s*var\(--ctl-h\)/);
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
        h(Field, { key: 'c', label: 'Beschriftung', breite: 'breit', children: h('textarea') }),
      ]),
    );
    const labels = [...host.querySelectorAll('label')];
    expect(labels.map((l) => l.className)).toEqual(['field', 'field feldraster-zwei', 'field feldraster-breit']);
    expect(labels[1].querySelector('.field-label')?.textContent).toBe('Stil');
  });
});
