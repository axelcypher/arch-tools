// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { aktuell, mitEbene, useEntz } from './store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(App));
  });
  return host;
}
beforeEach(() => useEntz.getState().laden({ fotos: [] }, {}, null));
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const eingabe = (el: HTMLInputElement, value: string) => {
  act(() => {
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => el.blur());
};
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const feld = (host: Element, label: string) => [...host.querySelectorAll('label.field')].find((l) => l.querySelector('.field-label')?.textContent === label)!.querySelector('input') as HTMLInputElement;

// Fenster eines schräg fotografierten Hauses (Fotopixel)
const ECKEN = [
  { x: 1482.1, y: 1610 },
  { x: 1671.7, y: 1604.4 },
  { x: 1668.9, y: 1350.1 },
  { x: 1482.4, y: 1344.6 },
];

describe('Entzerrung', () => {
  it('ohne Foto: Hinweis, Entzerrt gesperrt', () => {
    const host = render();
    expect(host.textContent).toContain('Foto hinzufügen');
    expect(knopf(host, 'Entzerrt')!.disabled).toBe(true);
    expect(knopf(host, 'Speichern')!.disabled).toBe(true);
  });

  it('Rechteck: Maße eingeben, entzerrt ansehen, Messung in der Liste', () => {
    const host = render();
    act(() => useEntz.getState().fotoHinzufuegen('f1', 'Fassade', 'image/jpeg', 3000, 2000, new Uint8Array(4)));
    expect(host.querySelector('.ef-fotos')?.textContent).toContain('Fassade');
    expect(host.querySelector('.sidebar-right .warning')?.textContent).toContain('Noch 4 Ecken');

    const s = useEntz.getState();
    const { foto, ebene } = aktuell(s);
    act(() => s.aendern(mitEbene(foto!.id, ebene!.id, (e) => ({ ...e, rechteck: { ...e.rechteck, ecken: ECKEN } }))));
    expect(host.querySelector('.sidebar-right .warning')?.textContent).toContain('Breite und Höhe');
    eingabe(feld(host, 'Breite (m)'), '1,26');
    eingabe(feld(host, 'Höhe (m)'), '1,51');
    expect(aktuell(useEntz.getState()).ebene!.rechteck).toMatchObject({ breite: 1.26, hoehe: 1.51 });
    expect(host.querySelector('.ef-ok')?.textContent).toContain('entzerrbar');
    expect(host.querySelector('.ef-status-punkt.ok')).not.toBeNull();

    act(() => knopf(host, 'Entzerrt ansehen')!.click());
    expect(useEntz.getState().ansicht).toBe('entzerrt');
    expect(host.textContent).toContain('Messen · Ebene 1');
    expect(knopf(host, 'Strecke')).toBeDefined();

    // Strecke über die Fensterbreite: Unterkante links → rechts
    act(() =>
      useEntz.getState().aendern(
        mitEbene(foto!.id, ebene!.id, (e) => ({ ...e, messungen: [{ id: 'm1', art: 'strecke', name: 'Fenster', punkte: [ECKEN[0], ECKEN[1]] }] })),
      ),
    );
    expect(host.querySelector('.ef-messungen')?.textContent).toContain('1,260 m');
    expect(host.textContent).toContain('Exportieren');

    // Tab wechselt zurück zur Fotoansicht
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })));
    expect(useEntz.getState().ansicht).toBe('foto');
    expect(host.textContent).toContain('Referenz · Ebene 1');
  });

  it('zweite Ebene und Methodenwechsel', () => {
    const host = render();
    act(() => useEntz.getState().fotoHinzufuegen('f1', 'Fassade', 'image/jpeg', 3000, 2000, new Uint8Array(4)));
    act(() => knopf(host, '+ Ebene')!.click());
    expect([...host.querySelectorAll('.sidebar-left .list')[1].querySelectorAll('li')].map((l) => l.textContent)).toEqual(['Ebene 1×', 'Ebene 2×']);
    act(() => knopf(host, 'Fluchtlinien')!.click());
    expect(aktuell(useEntz.getState()).ebene!.methode).toBe('fluchtlinien');
    expect(host.querySelector('.sidebar-right .warning')?.textContent).toContain('waagerechte und senkrechte Kanten');
    expect(knopf(host, 'Waagerechte Kante')).toBeDefined();
    act(() => knopf(host, 'Passpunkte')!.click());
    expect(knopf(host, 'Passpunkt setzen')).toBeDefined();
  });
});
