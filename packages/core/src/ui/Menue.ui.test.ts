// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Dialog';
import { MenueHost, MenueKnopf, zeigeMenue } from './Menue';
import { Symbol, SYMBOLE } from './Symbol';

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

const taste = (key: string, ziel: Element = document.activeElement ?? document.body) => act(() => ziel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
const punkte = (host: Element) => [...host.querySelectorAll('.menue [role="menuitem"]')].map((b) => b.textContent);

describe('gemeinsames Menü', () => {
  it('Kontextmenü: erster Punkt fokussiert, ↑/↓ und Pos1/Ende wandern, Klick führt aus und schließt', () => {
    const aktion = vi.fn();
    const host = render(
      createElement(
        Fragment,
        null,
        createElement(
          'button',
          {
            key: 'z',
            onContextMenu: (e: React.MouseEvent) => zeigeMenue(e, [{ text: 'Öffnen', aktion }, { trenner: true }, { text: 'Anheften' }, { text: 'Löschen', gefahr: true }]),
          },
          'Karte',
        ),
        createElement(MenueHost, { key: 'h' }),
      ),
    );
    act(() => host.querySelector('button')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 })));
    expect(punkte(host)).toEqual(['Öffnen', 'Anheften', 'Löschen']);
    expect(host.querySelector('.menue')!.getAttribute('role')).toBe('menu');
    expect(document.activeElement?.textContent).toBe('Öffnen');
    taste('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Anheften');
    taste('End');
    expect(document.activeElement?.textContent).toBe('Löschen');
    expect(document.activeElement?.classList.contains('gefahr')).toBe(true);
    taste('Home');
    act(() => (document.activeElement as HTMLButtonElement).click());
    expect(aktion).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.menue')).toBeNull();
  });

  it('Esc schließt nur das Menü, nicht den Dialog darunter, und gibt den Fokus an den Knopf zurück', () => {
    const zu = vi.fn();
    const host = render(
      createElement(
        Fragment,
        null,
        createElement(Modal, { key: 'm', titel: 'Dialog', onClose: zu, children: null }, createElement(MenueKnopf, { punkte: () => [{ text: 'Eins' }, { text: 'Zwei' }], children: 'Mehr' })),
        createElement(MenueHost, { key: 'h' }),
      ),
    );
    const knopf = host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    act(() => knopf.click());
    expect(knopf.getAttribute('aria-expanded')).toBe('true');
    taste('Escape');
    expect(host.querySelector('.menue')).toBeNull();
    expect(zu).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(knopf);
    taste('Escape');
    expect(zu).toHaveBeenCalledTimes(1);
  });

  it('Symbole: dekorativ ohne Titel, mit Titel als Bild benannt; jeder Name hat einen Pfad', () => {
    const host = render(createElement(Fragment, null, createElement(Symbol, { key: 'a', name: 'auswahl' }), createElement(Symbol, { key: 'b', name: 'lineal', titel: 'Messen' })));
    const [a, b] = [...host.querySelectorAll('svg.symbol')];
    expect(a.getAttribute('aria-hidden')).toBe('true');
    expect(b.getAttribute('role')).toBe('img');
    expect(b.querySelector('title')?.textContent).toBe('Messen');
    expect(SYMBOLE.length).toBeGreaterThan(30);
    expect(new Set(SYMBOLE).size).toBe(SYMBOLE.length);
  });
});
