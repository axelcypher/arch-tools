// @vitest-environment happy-dom
import { act, createElement, Fragment, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Dialog';
import { MenueHost, MenueKnopf, tastenAria, useMenueOffen, zeigeMenue, zeigeMenueAn } from './Menue';
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

  it('Tastenkürzel: rechts angezeigt, als aria-keyshortcuts vorgelesen und nicht Teil des Namens', () => {
    const host = render(
      createElement(
        Fragment,
        null,
        createElement(
          'button',
          {
            key: 'z',
            onContextMenu: (e: React.MouseEvent) =>
              zeigeMenue(e, [
                { text: 'Kopieren', tasten: 'Strg+C' },
                { text: 'Löschen', tasten: 'Entf' },
              ]),
          },
          'Karte',
        ),
        createElement(MenueHost, { key: 'h' }),
      ),
    );
    act(() => host.querySelector('button')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 })));
    const [kopieren, loeschen] = [...host.querySelectorAll('.menue [role="menuitem"]')];
    expect(kopieren.getAttribute('aria-keyshortcuts')).toBe('Control+C');
    expect(loeschen.getAttribute('aria-keyshortcuts')).toBe('Delete');
    const anzeige = kopieren.querySelector('.menue-tasten')!;
    expect(anzeige.textContent).toBe('Strg+C');
    expect(anzeige.getAttribute('aria-hidden')).toBe('true');
  });

  it('tastenAria übersetzt die deutschen Tastennamen, auch Alternativen und die Plustaste', () => {
    expect(tastenAria('Strg+Umschalt+Z')).toBe('Control+Shift+Z');
    expect(tastenAria('Entf / Rücktaste')).toBe('Delete Backspace');
    expect(tastenAria('Strg++')).toBe('Control+Plus');
    expect(tastenAria('Alt+↑')).toBe('Alt+ArrowUp');
    expect(tastenAria('F2')).toBe('F2');
    expect(tastenAria('Pos1, Ende')).toBe('Home End');
    expect(tastenAria('Strg+/')).toBe('Control+/');
    expect(tastenAria('Entf/Rücktaste')).toBe('Delete Backspace');
    expect(tastenAria('Strg + /')).toBe('Control+/');
    expect(tastenAria('Strg+/ / Esc')).toBe('Control+/ Escape');
    expect(tastenAria('Strg+,')).toBe('Control+,');
    expect(tastenAria('Strg + Bild ab')).toBe('Control+PageDown');
    expect(tastenAria('Umschalt+Leer')).toBe('Shift+Space');
    expect(tastenAria('Strg+Druck Taste')).toBe('Control+DruckTaste');
  });

  it('Umschalter mit Haken: menuitemcheckbox mit aria-checked, Haken nur wenn an', () => {
    const host = render(
      createElement(
        Fragment,
        null,
        createElement(
          'button',
          {
            key: 'z',
            onContextMenu: (e: React.MouseEvent) =>
              zeigeMenue(e, [
                { text: 'Raster', haken: true },
                { text: 'Maße', haken: false },
                { text: 'Öffnen', bild: 'app.png' },
              ]),
          },
          'Karte',
        ),
        createElement(MenueHost, { key: 'h' }),
      ),
    );
    act(() => host.querySelector('button')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 })));
    const [raster, masse] = [...host.querySelectorAll('.menue [role="menuitemcheckbox"]')];
    expect(raster.getAttribute('aria-checked')).toBe('true');
    expect(raster.querySelector('.menue-symbol svg')).not.toBeNull();
    expect(masse.getAttribute('aria-checked')).toBe('false');
    expect(masse.querySelector('.menue-symbol svg')).toBeNull();
    expect(host.querySelectorAll('.menue [role="menuitem"]').length).toBe(1);
    // Bild (z. B. App-Symbol) bei einem normalen Punkt
    expect(host.querySelector('.menue [role="menuitem"] .menue-symbol img')?.getAttribute('src')).toBe('app.png');
  });

  it('eigener Öffner mit aria-haspopup (Zeilenknopf „⋯“) bekommt aria-expanded; useMenueOffen meldet den Zustand', () => {
    let offenGemeldet = false;
    function Zeile() {
      const ref = useRef<HTMLButtonElement>(null);
      offenGemeldet = useMenueOffen(ref);
      return createElement(
        'button',
        { ref, tabIndex: -1, 'aria-haspopup': 'menu', 'aria-label': 'Weitere Aktionen', onClick: (e: React.MouseEvent<HTMLButtonElement>) => zeigeMenueAn(e.currentTarget, [{ text: 'Umbenennen' }]) },
        '⋯',
      );
    }
    const host = render(createElement(Fragment, null, createElement(Zeile, { key: 'z' }), createElement(MenueHost, { key: 'h' })));
    const knopf = host.querySelector('button')!;
    act(() => knopf.click());
    expect(knopf.getAttribute('aria-expanded')).toBe('true');
    expect(offenGemeldet).toBe(true);
    expect(host.querySelector('.menue')!.getAttribute('aria-label')).toBe('Weitere Aktionen');
    taste('Escape');
    expect(knopf.getAttribute('aria-expanded')).toBe('false');
    expect(offenGemeldet).toBe(false);
    expect(document.activeElement).toBe(knopf);
  });

  it('Knopf nur mit Symbol (leerer Text, kein aria-label): Menü ohne leeren Namen', () => {
    const host = render(
      createElement(
        Fragment,
        null,
        createElement('button', { key: 'z', onClick: (e: React.MouseEvent<HTMLButtonElement>) => zeigeMenueAn(e.currentTarget, [{ text: 'A' }]) }),
        createElement(MenueHost, { key: 'h' }),
      ),
    );
    act(() => host.querySelector('button')!.click());
    expect(host.querySelector('.menue')!.hasAttribute('aria-label')).toBe(false);
  });

  it('zweiter Klick auf den offenen MenueKnopf schließt das Menü, ein dritter öffnet es wieder', () => {
    const host = render(createElement(Fragment, null, createElement(MenueKnopf, { key: 'k', punkte: () => [{ text: 'A' }], children: 'Datei' }), createElement(MenueHost, { key: 'h' })));
    const knopf = host.querySelector('button')!;
    const klick = () =>
      act(() => {
        knopf.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        knopf.click();
      });
    klick();
    expect(host.querySelector('.menue')).not.toBeNull();
    expect(knopf.getAttribute('aria-expanded')).toBe('true');
    klick();
    expect(host.querySelector('.menue')).toBeNull();
    expect(knopf.getAttribute('aria-expanded')).toBe('false');
    klick();
    expect(host.querySelector('.menue')).not.toBeNull();
  });

  it('Kontextmenü, dessen Fokusziel ein fremder Öffner ist: der Öffner bleibt zu und öffnet beim nächsten Klick sein Menü', () => {
    const host = render(
      createElement(
        Fragment,
        null,
        createElement(
          'div',
          { key: 'f', className: 'flaeche', onContextMenu: (e: React.MouseEvent) => zeigeMenue(e, [{ text: 'Kontext' }]) },
          createElement(MenueKnopf, { punkte: () => [{ text: 'Eigen' }], children: 'Datei' }),
        ),
        createElement(MenueHost, { key: 'h' }),
      ),
    );
    const knopf = host.querySelector('button')!;
    act(() => knopf.focus());
    // Kontextmenütaste auf der Fläche (ohne Mausposition): Fokusziel ist der Knopf
    act(() => host.querySelector('.flaeche')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 0, clientY: 0 })));
    expect(punkte(host)).toEqual(['Kontext']);
    expect(knopf.getAttribute('aria-expanded')).toBe('false');
    act(() => {
      knopf.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      knopf.click();
    });
    expect(punkte(host)).toEqual(['Eigen']);
    expect(knopf.getAttribute('aria-expanded')).toBe('true');
  });

  it('Druck auf den offenen Öffner ohne Klick (Zeiger weggezogen): der nächste Klick bzw. Enter öffnet wieder', () => {
    const host = render(createElement(Fragment, null, createElement(MenueKnopf, { key: 'k', punkte: () => [{ text: 'A' }], children: 'Datei' }), createElement(MenueHost, { key: 'h' })));
    const knopf = host.querySelector('button')!;
    act(() => knopf.click());
    act(() => knopf.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(host.querySelector('.menue')).toBeNull();
    // Tastatur: Enter auf dem Knopf löst einen Klick aus
    act(() => {
      knopf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      knopf.click();
    });
    expect(host.querySelector('.menue')).not.toBeNull();
    act(() => knopf.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(host.querySelector('.menue')).toBeNull();
    act(() => {
      knopf.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      knopf.click();
    });
    expect(host.querySelector('.menue')).not.toBeNull();
  });

  it('eigene Öffner: zweiter Klick schließt, Wechsel von A zu B setzt A zurück, ein entfernter Öffner stört nicht', () => {
    let zeigeB: (an: boolean) => void = () => {};
    let bOffen = false;
    function Zeilen() {
      const [mitB, setMitB] = useState(true);
      zeigeB = setMitB;
      const refB = useRef<HTMLButtonElement>(null);
      bOffen = useMenueOffen(refB);
      const oeffner = (name: string, ref?: React.RefObject<HTMLButtonElement | null>) =>
        createElement(
          'button',
          { key: name, ref, 'aria-haspopup': 'menu', 'aria-label': name, onClick: (e: React.MouseEvent<HTMLButtonElement>) => zeigeMenueAn(e.currentTarget, [{ text: `Menü ${name}` }]) },
          '⋯',
        );
      return createElement(Fragment, null, oeffner('A'), mitB ? oeffner('B', refB) : null);
    }
    const host = render(createElement(Fragment, null, createElement(Zeilen, { key: 'z' }), createElement(MenueHost, { key: 'h' })));
    const [a, b] = [...host.querySelectorAll('button')];
    const klick = (el: Element) =>
      act(() => {
        el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        (el as HTMLButtonElement).click();
      });
    klick(a);
    expect(a.getAttribute('aria-expanded')).toBe('true');
    klick(a);
    expect(host.querySelector('.menue')).toBeNull();
    expect(a.getAttribute('aria-expanded')).toBe('false');
    // A offen, dann B per Tastatur (ohne Druck): A wird zurückgesetzt
    klick(a);
    act(() => b.click());
    expect(punkte(host)).toEqual(['Menü B']);
    expect(a.getAttribute('aria-expanded')).toBe('false');
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(bOffen).toBe(true);
    // B verschwindet bei offenem Menü: kein Fehler, useMenueOffen meldet nicht mehr offen
    act(() => zeigeB(false));
    expect(bOffen).toBe(false);
    taste('Escape');
    expect(host.querySelector('.menue')).toBeNull();
  });

  it('Erstfokus nie auf einem Gefahr-Punkt: Rechtsklick plus Enter löscht nichts', () => {
    const loeschen = vi.fn();
    const umbenennen = vi.fn();
    const host = render(
      createElement(
        Fragment,
        null,
        createElement(
          'button',
          {
            key: 'z',
            onContextMenu: (e: React.MouseEvent) =>
              zeigeMenue(e, [
                { text: 'Löschen', gefahr: true, aktion: loeschen },
                { text: 'Öffnen', deaktiviert: true },
                { text: 'Umbenennen', aktion: umbenennen },
              ]),
          },
          'Karte',
        ),
        createElement(MenueHost, { key: 'h' }),
      ),
    );
    act(() => host.querySelector('button')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 })));
    expect(document.activeElement?.textContent).toBe('Umbenennen');
    act(() => (document.activeElement as HTMLButtonElement).click());
    expect(loeschen).not.toHaveBeenCalled();
    expect(umbenennen).toHaveBeenCalledTimes(1);
  });

  it('nur Gefahr-Punkte: Fokus auf dem Menü selbst, Enter löscht nichts; ↓ bzw. ↑ erreichen die Punkte', () => {
    const loeschen = vi.fn();
    const host = render(
      createElement(
        Fragment,
        null,
        createElement(
          'button',
          {
            key: 'z',
            onContextMenu: (e: React.MouseEvent) =>
              zeigeMenue(e, [
                { text: 'Löschen', gefahr: true, aktion: loeschen },
                { text: 'Alle löschen', gefahr: true },
              ]),
          },
          'Karte',
        ),
        createElement(MenueHost, { key: 'h' }),
      ),
    );
    act(() => host.querySelector('button')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 })));
    const menue = host.querySelector('.menue')!;
    expect(document.activeElement).toBe(menue);
    taste('Enter');
    expect(loeschen).not.toHaveBeenCalled();
    expect(host.querySelector('.menue')).not.toBeNull();
    taste('ArrowUp');
    expect(document.activeElement?.textContent).toBe('Alle löschen');
    act(() => (menue as HTMLElement).focus());
    taste('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Löschen');
    taste('Escape');
    expect(host.querySelector('.menue')).toBeNull();
  });

  it('nur Gefahr-Punkte (bzw. sonst nur gesperrte): Fokus trotzdem im Menü, gesperrter ungefährlicher Punkt geht vor', () => {
    const host = render(
      createElement(
        Fragment,
        null,
        createElement(
          'button',
          {
            key: 'z',
            onContextMenu: (e: React.MouseEvent) =>
              zeigeMenue(e, [
                { text: 'Löschen', gefahr: true },
                { text: 'Öffnen', deaktiviert: true },
              ]),
          },
          'Karte',
        ),
        createElement(MenueHost, { key: 'h' }),
      ),
    );
    act(() => host.querySelector('button')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 })));
    // gesperrter, ungefährlicher Punkt geht vor (führt nichts aus)
    expect(document.activeElement?.textContent).toBe('Öffnen');
  });

  it('Einfachauswahl: menuitemradio mit aria-checked, Punkt nur beim gewählten Eintrag', () => {
    const host = render(
      createElement(
        Fragment,
        null,
        createElement(
          'button',
          {
            key: 'z',
            onContextMenu: (e: React.MouseEvent) =>
              zeigeMenue(e, [
                { text: 'Fassung 1', gewaehlt: false },
                { text: 'Fassung 2', gewaehlt: true },
                { text: 'Fassung 3', gewaehlt: false, haken: true },
                { trenner: true },
                { text: 'Umbenennen' },
              ]),
          },
          'Karte',
        ),
        createElement(MenueHost, { key: 'h' }),
      ),
    );
    act(() => host.querySelector('button')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 })));
    const [eins, zwei, drei] = [...host.querySelectorAll('.menue [role="menuitemradio"]')];
    // beide gesetzt: gewaehlt gilt (Rolle, aria-checked, kein Haken)
    expect(drei.getAttribute('aria-checked')).toBe('false');
    expect(drei.querySelector('.menue-symbol svg')).toBeNull();
    expect(eins.getAttribute('aria-checked')).toBe('false');
    expect(eins.querySelector('.menue-symbol svg')).toBeNull();
    expect(zwei.getAttribute('aria-checked')).toBe('true');
    expect(zwei.querySelector('.menue-symbol svg')).not.toBeNull();
    expect(host.querySelectorAll('.menue [role="menuitemcheckbox"]').length).toBe(0);
    expect(host.querySelectorAll('.menue [role="menuitem"]').length).toBe(1);
    taste('Escape');
  });

  it('Symbole: dekorativ ohne Titel, mit Titel als Bild benannt; jeder Name hat einen Pfad', () => {
    const host = render(createElement(Fragment, null, createElement(Symbol, { key: 'a', name: 'auswahl' }), createElement(Symbol, { key: 'b', name: 'lineal', titel: 'Messen' })));
    const [a, b] = [...host.querySelectorAll('svg.symbol')];
    expect(a.getAttribute('aria-hidden')).toBe('true');
    expect(b.getAttribute('role')).toBe('img');
    expect(b.querySelector('title')?.textContent).toBe('Messen');
    expect(SYMBOLE.length).toBeGreaterThan(30);
    expect(new Set(SYMBOLE).size).toBe(SYMBOLE.length);
    expect(SYMBOLE).toEqual(expect.arrayContaining(['nachOben', 'nachUnten', 'mehr', 'grenze', 'ausrichten', 'einruecken', 'ausruecken', 'frage', 'punkt']));
  });
});
