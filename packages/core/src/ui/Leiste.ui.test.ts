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
});
