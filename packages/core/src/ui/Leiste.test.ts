// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { BreitenLeiste } from './Leiste';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Leisten: Breite an den verfügbaren Platz gebunden', () => {
  it('mit der Tastatur nie breiter als Arbeitsbereich minus andere Leiste minus Mindestbreite der Mitte', () => {
    try {
      localStorage.clear();
    } catch {
      // ohne Speicher
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        createElement(
          'div',
          { className: 'arbeit' },
          createElement(BreitenLeiste, { schluessel: 't:links', vorgabe: 300, min: 240, max: 520, titel: 'Breite der Angaben', mitteMin: 420, children: createElement('div') }),
          createElement('main'),
          createElement(BreitenLeiste, { schluessel: 't:rechts', vorgabe: 360, min: 280, max: 680, griffLinks: true, titel: 'Breite der Einzelheiten', mitteMin: 420, children: createElement('div') }),
        ),
      ),
    );
    const arbeit = host.querySelector<HTMLElement>('.arbeit')!;
    const [links, rechts] = [...arbeit.querySelectorAll<HTMLElement>('.leiste')];
    // Arbeitsbereich 1000 px; die gezeichnete Breite folgt der gesetzten (kein Layout in happy-dom)
    Object.defineProperty(arbeit, 'clientWidth', { value: 1000, configurable: true });
    for (const l of [links, rechts]) l.getBoundingClientRect = () => ({ width: parseFloat(l.style.width) }) as DOMRect;
    const griff = links.querySelector<HTMLElement>('[role="separator"]')!;
    expect(griff.getAttribute('aria-label')).toBe('Breite der Angaben');
    expect(rechts.querySelector('[role="separator"]')!.getAttribute('aria-label')).toBe('Breite der Einzelheiten');
    const taste = (key: string) => act(() => void griff.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    // 1000 − 360 (rechts) − 420 (Mitte) = 220: kein Platz zum Wachsen – die Leiste wächst nicht (und schrumpft durch
    // „wachsen“ auch nicht)
    for (let i = 0; i < 30; i++) taste('ArrowRight');
    expect(parseFloat(links.style.width)).toBe(300);
    taste('End');
    expect(parseFloat(links.style.width)).toBe(300);
    // mit Platz: wächst bis Arbeitsbereich − andere Leiste − Mitte (1400 − 360 − 420 = 620), höchstens bis max 520
    Object.defineProperty(arbeit, 'clientWidth', { value: 1400 });
    for (let i = 0; i < 30; i++) taste('ArrowRight');
    expect(parseFloat(links.style.width)).toBe(520);
    // Schrumpfen geht frei bis zur Mindestbreite
    taste('Home');
    expect(parseFloat(links.style.width)).toBe(240);
    act(() => root.unmount());
  });

  it('geschrumpfte Leiste (gezeichnet schmaler als gesetzt): Ende und Wachsen ändern nichts, Schrumpfen geht von der gezeichneten Breite aus', () => {
    try {
      localStorage.clear();
    } catch {
      // ohne Speicher
    }
    const beobachter: (() => void)[] = [];
    const vorher = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(cb: () => void) {
        beobachter.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);
      act(() => root.render(createElement('div', { className: 'arbeit' }, createElement(BreitenLeiste, { schluessel: 't:schmal', vorgabe: 300, min: 240, max: 520, mitteMin: 420, children: createElement('div') }), createElement('main'))));
      const arbeit = host.querySelector<HTMLElement>('.arbeit')!;
      const leiste = arbeit.querySelector<HTMLElement>('.leiste')!;
      Object.defineProperty(arbeit, 'clientWidth', { value: 1400, configurable: true });
      // gesetzt 300, gezeichnet 243 (flex-shrink bei schmalem Fenster)
      leiste.getBoundingClientRect = () => ({ width: 243 }) as DOMRect;
      act(() => beobachter.forEach((b) => b()));
      const griff = leiste.querySelector<HTMLElement>('[role="separator"]')!;
      expect(griff.getAttribute('aria-valuenow')).toBe('243');
      const taste = (key: string) => act(() => void griff.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
      taste('End');
      taste('ArrowRight');
      expect(parseFloat(leiste.style.width)).toBe(300);
      taste('ArrowLeft');
      expect(parseFloat(leiste.style.width)).toBe(240);
      act(() => root.unmount());
    } finally {
      globalThis.ResizeObserver = vorher;
    }
  });
});
