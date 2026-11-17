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

  it('auf einer Fläche (.flaeche) zählt die Wunschbreite der Mitte, wenn sie größer als mitteMin ist', () => {
    const host = document.createElement('div');
    host.className = 'flaeche';
    host.style.cssText = 'display:flex; --karte-mitte-wunsch: 480px';
    Object.defineProperty(host, 'clientWidth', { value: 1000 });
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render([createElement(BreitenLeiste, { key: 'l', schluessel: 'test:wunsch', vorgabe: 300, max: 900, mitteMin: 300, children: 'Inhalt' }), createElement('main', { key: 'm' })]);
    });
    pfeil(host.querySelector('.leiste-griff')!, 'End');
    // 1000 − 480 (Wunschbreite statt mitteMin 300) = 520
    expect((host.querySelector('.leiste') as HTMLElement).style.width).toBe('520px');
    // ohne .flaeche zählt die Wunschbreite nicht: 1000 − 300 = 700
    act(() => root?.unmount());
    host.className = '';
    localStorage.removeItem('test:wunsch');
    act(() => {
      root = createRoot(host);
      root.render([createElement(BreitenLeiste, { key: 'l', schluessel: 'test:wunsch', vorgabe: 300, max: 900, mitteMin: 300, children: 'Inhalt' }), createElement('main', { key: 'm' })]);
    });
    pfeil(host.querySelector('.leiste-griff')!, 'End');
    expect((host.querySelector('.leiste') as HTMLElement).style.width).toBe('700px');
  });

  it('eigenes min ist zugleich die Untergrenze beim Nachgeben (--leiste-min an der Leiste), ohne min die Vorgabe', () => {
    const host = document.createElement('div');
    host.className = 'flaeche';
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render([
        createElement(BreitenLeiste, { key: 'a', schluessel: 'test:min-a', vorgabe: 380, min: 320, children: 'A' }),
        createElement(BreitenLeiste, { key: 'b', schluessel: 'test:min-b', vorgabe: 300, children: 'B' }),
      ]);
    });
    const [mitMin, ohneMin] = host.querySelectorAll<HTMLElement>('.leiste');
    expect(mitMin.style.getPropertyValue('--leiste-min')).toBe('320px');
    expect(ohneMin.style.getPropertyValue('--leiste-min')).toBe('');
  });

  it('feste Seitenspalte zählt zu den anderen Leisten, eine wachsende nicht', () => {
    const messen = (wachsend: boolean) => {
      const host = document.createElement('div');
      host.style.cssText = 'display:flex';
      Object.defineProperty(host, 'clientWidth', { value: 1000 });
      document.body.appendChild(host);
      act(() => {
        root = createRoot(host);
        root.render([
          createElement(BreitenLeiste, { key: 'l', schluessel: `test:spalte-${wachsend}`, vorgabe: 300, max: 900, mitteMin: 300, children: 'Inhalt' }),
          createElement('div', { key: 's', className: wachsend ? 'flaechen-spalte wachsend' : 'flaechen-spalte', style: { width: '200px' } }),
        ]);
      });
      pfeil(host.querySelector('.leiste-griff')!, 'End');
      const w = (host.querySelector('.leiste') as HTMLElement).style.width;
      act(() => root?.unmount());
      root = null;
      host.remove();
      return w;
    };
    // 1000 − 200 (feste Spalte) − 300 (Mitte) = 500; die wachsende Spalte ist die Mitte selbst: 1000 − 300 = 700
    expect(messen(false)).toBe('500px');
    expect(messen(true)).toBe('700px');
  });
});
