// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { BreitenLeiste } from './Leiste';

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
  localStorage.clear();
});

const pfeil = (el: Element, key: string) => act(() => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));

describe('BreitenLeiste', () => {
  it('linke Leiste: Griff rechts, → macht sie breiter', () => {
    const host = render(createElement(BreitenLeiste, { schluessel: 'test:links', vorgabe: 300, children: 'Inhalt' }));
    const griff = host.querySelector('.leiste-griff')!;
    expect(griff.classList.contains('leiste-griff-links')).toBe(false);
    pfeil(griff, 'ArrowRight');
    expect((host.querySelector('.leiste') as HTMLElement).style.width).toBe('316px');
  });

  it('rechte Leiste (seite="rechts"): Griff links, ← macht sie breiter; Breite wird gemerkt', () => {
    const host = render(createElement(BreitenLeiste, { schluessel: 'test:rechts', vorgabe: 300, seite: 'rechts', children: 'Inhalt' }));
    const griff = host.querySelector('.leiste-griff')!;
    expect(griff.classList.contains('leiste-griff-links')).toBe(true);
    pfeil(griff, 'ArrowLeft');
    expect((host.querySelector('.leiste') as HTMLElement).style.width).toBe('316px');
    pfeil(griff, 'ArrowRight');
    pfeil(griff, 'ArrowRight');
    expect((host.querySelector('.leiste') as HTMLElement).style.width).toBe('284px');
    expect(localStorage.getItem('test:rechts')).toBe('284');
  });

  it('auf einer Fläche: Innenabstand und Spalt zählen bei der Höchstbreite mit (Ende = Platz bis zur Mindestbreite der Mitte)', () => {
    const host = document.createElement('div');
    host.style.cssText = 'display:flex; padding: 0 8px; column-gap: 8px';
    Object.defineProperty(host, 'clientWidth', { value: 1000 });
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render([
        createElement(BreitenLeiste, { key: 'l', schluessel: 'test:flaeche', vorgabe: 300, max: 900, mitteMin: 400, children: 'Inhalt' }),
        createElement('main', { key: 'm' }),
        createElement('div', { key: 'aus', style: { display: 'none' } }),
        createElement('div', { key: 'frei', style: { position: 'absolute' } }),
      ]);
    });
    const griff = host.querySelector('.leiste-griff')!;
    pfeil(griff, 'End');
    // 1000 − 2 × 8 (Innenabstand) − 1 × 8 (Spalt; ausgeblendete und frei liegende Kinder zählen nicht) − 400 (Mitte) = 576
    expect((host.querySelector('.leiste') as HTMLElement).style.width).toBe('576px');
  });
});
