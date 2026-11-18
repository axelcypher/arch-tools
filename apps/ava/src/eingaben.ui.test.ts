// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Angabe, TextEingabe, ZahlEingabe } from './components/eingaben';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

function zeigeIn(el: ReturnType<typeof createElement>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(el);
  });
  return host;
}

const zeige = (el: ReturnType<typeof createElement>) => zeigeIn(el).querySelector('input')!;

function tippen(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function esc(input: HTMLInputElement) {
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  act(() => void input.dispatchEvent(e));
  return e.defaultPrevented;
}

describe('Esc in Eingabefeldern', () => {
  it('ZahlEingabe: geändertes Feld fängt Esc ab (Dialog bleibt offen), unverändertes nicht', () => {
    const onChange = vi.fn();
    const input = zeige(createElement(ZahlEingabe, { wert: 5, onChange }));
    act(() => input.focus());
    tippen(input, '7');
    expect(esc(input)).toBe(true);
    expect(input.value).toBe('5');
    expect(onChange).not.toHaveBeenCalled(); // Esc verwirft, statt beim Verlassen doch zu übernehmen
    // Gegenprobe: jetzt unverändert – Esc geht an den Dialog weiter
    act(() => input.focus());
    expect(esc(input)).toBe(false);
  });

  it('TextEingabe: geändertes Feld fängt Esc ab, unverändertes nicht', () => {
    const onChange = vi.fn();
    const input = zeige(createElement(TextEingabe, { wert: 'alt', onChange }));
    act(() => input.focus());
    tippen(input, 'neu');
    expect(esc(input)).toBe(true);
    expect(input.value).toBe('alt');
    expect(onChange).not.toHaveBeenCalled();
    expect(esc(input)).toBe(false);
  });
});

describe('Angabe', () => {
  const zeigeAngabe = (zahl?: boolean) => zeigeIn(createElement(Angabe, { label: 'brutto', zahl, children: '1.234,56 €' }));

  it('steht als div.field mit Beschriftung und Wert, nicht als label (schreibgeschützt, kein Feld)', () => {
    const host = zeigeAngabe();
    expect(host.querySelector('label')).toBeNull();
    const feld = host.querySelector('div.field')!;
    expect(feld.querySelector('.field-label')?.textContent).toBe('brutto');
    const wert = feld.querySelector('span.ava-angabe')!;
    expect(wert.textContent).toBe('1.234,56 €');
    expect(wert.classList.contains('num')).toBe(false);
  });

  it('richtet Beträge mit zahl wie Zahlenfelder aus (.num)', () => {
    const host = zeigeAngabe(true);
    expect(host.querySelector('span.ava-angabe')!.classList.contains('num')).toBe(true);
  });
});
