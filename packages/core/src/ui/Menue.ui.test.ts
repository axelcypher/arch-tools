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

  it('Menü hat einen Namen; gesperrte Punkte bleiben erreichbar (Grund im Hinweis), führen aber nichts aus; Untermenü heißt wie sein Punkt', () => {
    const aktion = vi.fn();
    const host = render(
      createElement(
        Fragment,
        null,
        createElement(
          'button',
          {
            key: 'z',
            onContextMenu: (e: React.MouseEvent) =>
              zeigeMenue(
                e,
                [{ text: 'Öffnen' }, { text: 'Einreichen', deaktiviert: true, hinweis: 'Antrag eingereicht', aktion }, { text: 'Exportieren', unter: [{ text: 'Excel' }] }],
                'Projekt 2019-003',
              ),
          },
          'Karte',
        ),
        createElement(MenueHost, { key: 'h' }),
      ),
    );
    act(() => host.querySelector('button')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 })));
    expect(host.querySelector('.menue')!.getAttribute('aria-label')).toBe('Projekt 2019-003');
    taste('ArrowDown');
    const gesperrt = document.activeElement as HTMLButtonElement;
    expect(gesperrt.textContent).toContain('Antrag eingereicht');
    expect(gesperrt.getAttribute('aria-disabled')).toBe('true');
    act(() => gesperrt.click());
    expect(aktion).not.toHaveBeenCalled();
    expect(host.querySelector('.menue')).not.toBeNull();
    taste('ArrowDown');
    taste('ArrowRight');
    const menues = host.querySelectorAll('.menue');
    expect(menues[1]?.getAttribute('aria-label')).toBe('Exportieren');
  });

  it('Untermenü: → öffnet und fokussiert, ← und Esc führen zurück, ohne Hauptmenü oder Dialog zu schließen; Tab schließt mit Fokus zurück', () => {
    const zu = vi.fn();
    const host = render(
      createElement(
        Fragment,
        null,
        createElement(
          Modal,
          { key: 'm', titel: 'Dialog', onClose: zu, children: null },
          createElement(MenueKnopf, { punkte: () => [{ text: 'Eins', unter: [{ text: 'A' }, { text: 'B' }] }, { text: 'Zwei' }], children: 'Mehr' }),
        ),
        createElement(MenueHost, { key: 'h' }),
      ),
    );
    const knopf = host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    act(() => knopf.click());
    taste('ArrowRight');
    expect(document.activeElement?.textContent).toBe('A');
    taste('ArrowLeft');
    expect(document.activeElement?.textContent).toContain('Eins');
    expect(host.querySelectorAll('.menue')).toHaveLength(1);
    taste('ArrowRight');
    taste('Escape');
    expect(document.activeElement?.textContent).toContain('Eins');
    expect(host.querySelectorAll('.menue')).toHaveLength(1);
    expect(zu).not.toHaveBeenCalled();
    taste('Tab');
    expect(host.querySelector('.menue')).toBeNull();
    expect(document.activeElement).toBe(knopf);
    expect(zu).not.toHaveBeenCalled();
  });

  it('Klick daneben schließt ohne Fokusrückgabe; Kontextmenütaste ohne Mausposition zeigt das Menü am Auslöser', () => {
    const host = render(
      createElement(
        Fragment,
        null,
        createElement('button', { key: 'z', onContextMenu: (e: React.MouseEvent) => zeigeMenue(e, [{ text: 'Öffnen' }]) }, 'Karte'),
        createElement('input', { key: 'i', 'aria-label': 'anderes Feld' }),
        createElement(MenueHost, { key: 'h' }),
      ),
    );
    const karte = host.querySelector('button')!;
    karte.getBoundingClientRect = () => ({ left: 100, top: 50, width: 80, height: 30, right: 180, bottom: 80, x: 100, y: 50, toJSON: () => ({}) }) as DOMRect;
    act(() => karte.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 0, clientY: 0 })));
    const menue = host.querySelector<HTMLElement>('.menue')!;
    expect(menue.style.left).toBe('108px');
    const feld = host.querySelector('input')!;
    act(() => {
      feld.focus();
      feld.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(host.querySelector('.menue')).toBeNull();
    expect(document.activeElement).toBe(feld);
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
