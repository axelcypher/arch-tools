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
    Object.defineProperty(arbeit, 'clientWidth', { value: 1000 });
    for (const l of [links, rechts]) l.getBoundingClientRect = () => ({ width: parseFloat(l.style.width) }) as DOMRect;
    const griff = links.querySelector<HTMLElement>('[role="separator"]')!;
    expect(griff.getAttribute('aria-label')).toBe('Breite der Angaben');
    expect(rechts.querySelector('[role="separator"]')!.getAttribute('aria-label')).toBe('Breite der Einzelheiten');
    for (let i = 0; i < 30; i++) act(() => void griff.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    // 1000 − 360 (rechts) − 420 (Mitte) = 220 < Mindestbreite 240 → bleibt bei der Mindestbreite
    expect(parseFloat(links.style.width)).toBeLessThanOrEqual(Math.max(240, 1000 - 360 - 420));
    act(() => root.unmount());
  });
});
