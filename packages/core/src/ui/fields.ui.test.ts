// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { NumberField, TextField } from './fields';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const tippen = (el: HTMLInputElement, value: string) =>
  act(() => {
    el.focus();
    el.dispatchEvent(new FocusEvent('focus'));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

describe('Eingabefelder', () => {
  it('Auswahlwechsel per Klick vor Enter: die Eingabe landet beim bisherigen Ziel', () => {
    const werte: Record<string, string> = { a: 'Wohnen', b: 'Bad' };
    let wechseln: (id: string) => void = () => {};
    // wie das Eigenschaftenfeld: dasselbe Feld zeigt nach dem Wechsel das neue Ziel
    function Eigenschaften() {
      const [ziel, setZiel] = useState('a');
      wechseln = setZiel;
      return createElement(TextField, { value: werte[ziel], onChange: (v: string) => (werte[ziel] = v) });
    }
    const host = render(createElement(Eigenschaften));
    const input = host.querySelector('input')!;
    tippen(input, 'Wohnen/Essen');
    // Klick auf die Zeichenfläche: wählt eine andere Fläche (Handler der App im Bubbling)
    const flaeche = document.createElement('div');
    document.body.appendChild(flaeche);
    flaeche.addEventListener('pointerdown', () => act(() => wechseln('b')));
    act(() => {
      flaeche.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(werte).toEqual({ a: 'Wohnen/Essen', b: 'Bad' });
    expect(host.querySelector('input')!.value).toBe('Bad');
  });

  it('wird das Feld entfernt, geht die offene Eingabe an das bisherige Ziel', () => {
    const werte: Record<string, string> = { a: 'Wohnen' };
    let zeigen: (v: boolean) => void = () => {};
    function Huelle() {
      const [da, setDa] = useState(true);
      zeigen = setDa;
      return da ? createElement(TextField, { value: werte.a, onChange: (v: string) => (werte.a = v) }) : null;
    }
    const host = render(createElement(Huelle));
    tippen(host.querySelector('input')!, 'Küche');
    act(() => zeigen(false));
    expect(werte.a).toBe('Küche');
  });

  it('Zahlenfeld: Hinein- und Herausklicken rundet nichts, Esc verwirft, Enter übernimmt', () => {
    const aufrufe: (number | undefined)[] = [];
    const host = render(createElement(NumberField, { value: 2.875, digits: 2, onChange: (v: number | undefined) => aufrufe.push(v) }));
    const input = host.querySelector('input')!;
    act(() => {
      input.focus();
      input.blur();
    });
    expect(aufrufe).toEqual([]);
    tippen(input, '3,1');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(aufrufe).toEqual([]);
    tippen(input, '3,1');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(aufrufe).toEqual([3.1]);
  });
});
