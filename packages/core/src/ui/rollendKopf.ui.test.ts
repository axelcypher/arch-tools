// @vitest-environment happy-dom
import { act, createElement as h, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlaechenSpalte, useRollendKopf } from './Karte';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function Kopf() {
  const ref = useRef<HTMLDivElement>(null);
  useRollendKopf(ref);
  return h('div', { ref, className: 'rollend-kopf' }, 'Suche');
}

function zeigen(mitKopf = true) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(h(FlaechenSpalte, { wachsend: true, rollend: true, children: mitKopf ? h('div', { className: 'huelle' }, h(Kopf)) : null }));
  });
  return host.querySelector<HTMLElement>('.flaechen-spalte')!;
}

describe('useRollendKopf', () => {
  it('setzt --rollend-kopf-h an der rollenden Spalte (Höhe + --s1), folgt Größenänderungen und räumt beim Aushängen auf', () => {
    let rueckruf: (() => void) | null = null;
    const beobachtet: Element[] = [];
    const getrennt = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          rueckruf = cb;
        }
        observe(el: Element) {
          beobachtet.push(el);
        }
        disconnect() {
          getrennt();
        }
      },
    );
    let hoehe = 42;
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => hoehe);
    const spalte = zeigen();
    expect(beobachtet[0]?.className).toBe('rollend-kopf');
    expect(spalte.style.getPropertyValue('--rollend-kopf-h')).toBe('calc(42px + var(--s1))');
    // Kopf bricht um
    hoehe = 74;
    act(() => rueckruf?.());
    expect(spalte.style.getPropertyValue('--rollend-kopf-h')).toBe('calc(74px + var(--s1))');
    act(() => root?.unmount());
    root = null;
    expect(getrennt).toHaveBeenCalled();
    expect(spalte.style.getPropertyValue('--rollend-kopf-h')).toBe('');
  });

  it('ohne ResizeObserver bleibt die Vorgabe aus base.css', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const spalte = zeigen();
    expect(spalte.style.getPropertyValue('--rollend-kopf-h')).toBe('');
  });
});
