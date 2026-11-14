// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { aktuell, mitEbene, useEntz } from './store';
import { oeffnen } from './projekt';
import { klick } from './aktionen';
import { flaechenMenue } from './aktionen';
import type { MenuePunkt } from '@core/ui/Menue';
import { farbschemaWechseln } from '@core/ui/rauchtest';

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

describe('RECTIO (Entzerrung)', () => {
  it('defekte Projektdatei: Meldung mit Dateiname, die geöffnete Entzerrung bleibt (Q-6)', async () => {
    const host = render();
    const vorher = useEntz.getState().doc;
    await act(async () => void oeffnen(new File(['kein zip'], 'Fassade.entz')));
    for (let i = 0; i < 10 && !host.querySelector('.modal.rf'); i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(host.querySelector('.modal.rf')!.textContent).toContain('Die Datei „Fassade.entz“ ließ sich nicht lesen');
    expect(host.querySelector('.modal.rf')!.textContent).toContain('Die geöffnete Entzerrung bleibt unverändert.');
    expect(useEntz.getState().doc).toBe(vorher);
    // Meldung schließen, sonst bleibt sie für die folgenden Tests offen
    act(() => host.querySelector<HTMLButtonElement>('.modal.rf button')!.click());
    for (let i = 0; i < 5 && host.querySelector('.modal.rf'); i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(host.querySelector('.modal.rf')).toBeNull();
  });

  it('Farbschema wechselt sofort (Menü ◐)', () => {
    const host = render();
    expect(farbschemaWechseln(host, 'Dunkel')).toBe('dunkel');
    expect(farbschemaWechseln(host, 'Hell')).toBe('hell');
  });

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
    expect(host.querySelector('.sidebar-right .ef-fehlt')?.textContent).toContain('Noch 4 Ecken');

    const s = useEntz.getState();
    const { foto, ebene } = aktuell(s);
    act(() => s.aendern(mitEbene(foto!.id, ebene!.id, (e) => ({ ...e, rechteck: { ...e.rechteck, ecken: ECKEN } }))));
    expect(host.querySelector('.sidebar-right .ef-fehlt')?.textContent).toContain('Breite und Höhe');
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
    expect(host.querySelector('.ef-messungen')?.textContent).toContain('1,26 m');
    expect(host.textContent).toContain('Exportieren');

    // Tab bleibt der Fokus-Navigation, E wechselt zurück zur Fotoansicht
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })));
    expect(useEntz.getState().ansicht).toBe('entzerrt');
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })));
    expect(useEntz.getState().ansicht).toBe('foto');
    expect(host.textContent).toContain('Referenz · Ebene 1');
  });

  it('zweite Ebene und Methodenwechsel', () => {
    const host = render();
    act(() => useEntz.getState().fotoHinzufuegen('f1', 'Fassade', 'image/jpeg', 3000, 2000, new Uint8Array(4)));
    act(() => knopf(host, 'Ebene')!.click());
    expect([...host.querySelectorAll('.sidebar-left .list')[1].querySelectorAll('li')].map((l) => l.textContent)).toEqual(['Ebene 1', 'Ebene 2']);
    act(() => knopf(host, 'Fluchtlinien')!.click());
    expect(aktuell(useEntz.getState()).ebene!.methode).toBe('fluchtlinien');
    expect(host.querySelector('.sidebar-right .ef-fehlt')?.textContent).toContain('2 waagerechte Kanten, 2 senkrechte Kanten');
    expect(knopf(host, 'Waagerechte (0)')).toBeDefined();
    act(() => knopf(host, 'Passpunkte')!.click());
    expect(knopf(host, 'Passpunkt setzen (0)')).toBeDefined();
  });

  it('Tastenkürzel greifen nicht auf Bedienelementen und nicht hinter Dialogen (Gegenproben)', () => {
    const host = render();
    act(() => useEntz.getState().fotoHinzufuegen('f1', 'Fassade', 'image/jpeg', 3000, 2000, new Uint8Array(4)));
    const s = useEntz.getState();
    const { foto, ebene } = aktuell(s);
    act(() => s.aendern(mitEbene(foto!.id, ebene!.id, (e) => ({ ...e, messungen: [{ id: 'm1', art: 'strecke', name: 'A', punkte: [ECKEN[0], ECKEN[1]] }] }))));
    act(() => useEntz.getState().setze({ auswahl: { art: 'messung', id: 'm1' } }));
    const taste = (ziel: EventTarget, key: string) => act(() => void ziel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    // Entf auf einem Knopf bzw. in einem Feld: nichts gelöscht
    taste(knopf(host, 'Foto …')!, 'Delete');
    taste(feld(host, 'Breite (m)'), 'Delete');
    expect(aktuell(useEntz.getState()).ebene!.messungen).toHaveLength(1);
    // offener Dialog: nichts gelöscht
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    taste(window, 'Delete');
    expect(aktuell(useEntz.getState()).ebene!.messungen).toHaveLength(1);
    dialog.remove();
    // Gegenprobe: ohne Fokus auf einem Element und ohne Dialog wirkt Entf
    taste(window, 'Delete');
    expect(aktuell(useEntz.getState()).ebene!.messungen).toHaveLength(0);
  });

  it('nach einem Passpunkt bekommt sein x-Feld den Fokus; fehlende Werte sind markiert', () => {
    const host = render();
    act(() => useEntz.getState().fotoHinzufuegen('f1', 'Fassade', 'image/jpeg', 3000, 2000, new Uint8Array(4)));
    act(() => knopf(host, 'Passpunkte')!.click());
    act(() => useEntz.getState().setze({ werkzeug: 'passpunkt' }));
    act(() => klick({ x: 100, y: 100 }));
    const zeile = host.querySelector('.ef-tabelle tbody tr')!;
    expect(zeile.classList.contains('fehlt')).toBe(true);
    expect(document.activeElement).toBe(zeile.querySelector('td[data-fokus] input'));
    expect(useEntz.getState().fokus).toBeNull();
  });

  it('ohne Foto: Schrittfolge rechts und Knopf in der Fläche; Messung hinter dem Horizont ist „nicht messbar“', () => {
    const host = render();
    expect(host.querySelector('.ef-schritte')?.textContent).toContain('Referenz');
    expect(host.querySelector('.ef-leer button')?.textContent).toContain('Foto hinzufügen');
    act(() => useEntz.getState().fotoHinzufuegen('f1', 'Fassade', 'image/jpeg', 3000, 2000, new Uint8Array(4)));
    expect(host.querySelector('.ef-leer')).toBeNull();
    const s = useEntz.getState();
    const { foto, ebene } = aktuell(s);
    // Fenster als Referenz; der zweite Messpunkt liegt weit jenseits der Fluchtlinie des Fensters
    act(() =>
      s.aendern(
        mitEbene(foto!.id, ebene!.id, (e) => ({
          ...e,
          rechteck: { ecken: ECKEN, breite: 1.26, hoehe: 1.51 },
          messungen: [
            { id: 'm1', art: 'strecke', name: 'gut', punkte: [ECKEN[0], ECKEN[1]] },
            { id: 'm2', art: 'strecke', name: 'weg', punkte: [ECKEN[0], { x: 1500, y: -60000 }] },
          ],
        })),
      ),
    );
    act(() => useEntz.getState().setze({ ansicht: 'entzerrt' }));
    const zeilen = [...host.querySelectorAll('.ef-messungen li')].map((l) => l.textContent);
    expect(zeilen[0]).toContain('1,26 m');
    expect(zeilen[1]).toContain('nicht messbar');
  });

  it('Fotoansicht mit entzerrbarer Ebene, Messung und Ausschnitt: kein Absturz, Messungen nur entzerrt', () => {
    // echte Flächengröße, sonst zeichnet die Arbeitsfläche kein Overlay
    const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
    try {
      const host = render();
      act(() => useEntz.getState().fotoHinzufuegen('f1', 'Fassade', 'image/jpeg', 3000, 2000, new Uint8Array(4)));
      const s = useEntz.getState();
      const { foto, ebene } = aktuell(s);
      act(() =>
        s.aendern(
          mitEbene(foto!.id, ebene!.id, (e) => ({
            ...e,
            rechteck: { ecken: ECKEN, breite: 1.26, hoehe: 1.51 },
            ausschnitt: { x0: 0, y0: 0, x1: 1.26, y1: 1.51 },
            messungen: [{ id: 'm1', art: 'strecke', name: 'A', punkte: [ECKEN[0], ECKEN[1]] }],
          })),
        ),
      );
      expect(host.querySelectorAll('.ef-griff').length).toBeGreaterThan(0); // Ecken in der Fotoansicht
      expect(host.querySelector('.ef-messung')).toBeNull();
      // Ecken-Werkzeug zeigt weiterhin nur die Fotoebene
      act(() => useEntz.getState().setze({ werkzeug: 'ecken' }));
      expect(host.querySelector('.ef-messung')).toBeNull();
      // Gegenprobe: entzerrt erscheinen Messung und Ausschnitt
      act(() => useEntz.getState().setze({ ansicht: 'entzerrt', werkzeug: 'auswahl' }));
      expect(host.querySelector('.ef-messung')).not.toBeNull();
      expect(host.querySelector('.ef-ausschnitt')).not.toBeNull();
      act(() => useEntz.getState().setze({ ansicht: 'foto' }));
      expect(host.querySelector('.ef-messung')).toBeNull();
    } finally {
      if (w) Object.defineProperty(HTMLElement.prototype, 'clientWidth', w);
      if (h) Object.defineProperty(HTMLElement.prototype, 'clientHeight', h);
    }
  });

  it('Strg+Z wirkt auch mit Fokus auf einem Knopf, nicht im Textfeld; Esc auf einem Knopf bricht ab', () => {
    const host = render();
    act(() => useEntz.getState().fotoHinzufuegen('f1', 'Fassade', 'image/jpeg', 3000, 2000, new Uint8Array(4)));
    const taste = (ziel: EventTarget, key: string, ctrlKey = false) => act(() => void ziel.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true })));
    eingabe(feld(host, 'Breite (m)'), '2');
    expect(aktuell(useEntz.getState()).ebene!.rechteck.breite).toBe(2);
    // im Textfeld: Rückgängig des Felds, nicht der App
    taste(feld(host, 'Höhe (m)'), 'z', true);
    expect(aktuell(useEntz.getState()).ebene!.rechteck.breite).toBe(2);
    // auf einem Knopf: Rückgängig der App
    taste(knopf(host, 'Foto …')!, 'z', true);
    expect(aktuell(useEntz.getState()).ebene!.rechteck.breite).toBeUndefined();
    act(() => useEntz.getState().setze({ werkzeug: 'ecken' }));
    taste(knopf(host, 'Foto …')!, 'Escape');
    expect(useEntz.getState().werkzeug).toBe('auswahl');
  });

  it('Kontextmenü der Fläche: Befehle mit Kürzeln, gesperrt mit Grund; beim Zeichnen schließt Rechtsklick ab', () => {
    render();
    act(() => useEntz.getState().fotoHinzufuegen('f1', 'Fassade', 'image/jpeg', 3000, 2000, new Uint8Array(4)));
    const punkt = (text: string) => flaechenMenue().find((p) => !p.trenner && p.text === text) as Exclude<MenuePunkt, { trenner: true }>;
    expect(punkt('Löschen')).toMatchObject({ deaktiviert: true, hinweis: 'nichts ausgewählt' });
    expect(punkt('Entzerrt zeigen')).toMatchObject({ deaktiviert: true, hinweis: 'erst die Referenz vervollständigen' });
    expect(punkt('Alles zeigen')).toMatchObject({ deaktiviert: false, tasten: 'Pos1' });
    // Kürzel stehen in tasten, nicht im Hinweis (der nennt nur Sperrgründe)
    expect(flaechenMenue().filter((p) => !p.trenner && /^(Pos1|E|Entf|Strg)/.test((p as { hinweis?: string }).hinweis ?? ''))).toEqual([]);
    // Ecke gewählt: nicht einzeln löschbar, Grund steht dabei
    act(() => useEntz.getState().setze({ auswahl: { art: 'ecke', id: 'x', index: 0 } }));
    expect(punkt('Ecke LU löschen')).toMatchObject({ deaktiviert: true, hinweis: 'Ecken über „Ecken neu setzen“' });
    // Gegenprobe: Messung gewählt → aktiv und wirksam
    const s = useEntz.getState();
    const { foto, ebene } = aktuell(s);
    act(() => s.aendern(mitEbene(foto!.id, ebene!.id, (e) => ({ ...e, rechteck: { ecken: ECKEN, breite: 1.26, hoehe: 1.51 }, messungen: [{ id: 'm1', art: 'strecke', name: 'A', punkte: [ECKEN[0], ECKEN[1]] }] }))));
    act(() => useEntz.getState().setze({ auswahl: { art: 'messung', id: 'm1' } }));
    expect(punkt('„A“ löschen')).toMatchObject({ deaktiviert: false, hinweis: undefined, tasten: 'Entf / Rücktaste' });
    expect(punkt('Entzerrt zeigen').deaktiviert).toBe(false);
    act(() => punkt('„A“ löschen').aktion!());
    expect(aktuell(useEntz.getState()).ebene!.messungen).toHaveLength(0);
  });

  it('Rechtsklick auf ein Element wählt es aus, das Kontextmenü löscht dann dieses (nicht die vorige Auswahl)', () => {
    const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
    try {
      const host = render();
      act(() => useEntz.getState().fotoHinzufuegen('f1', 'Fassade', 'image/jpeg', 3000, 2000, new Uint8Array(4)));
      const s = useEntz.getState();
      const { foto, ebene } = aktuell(s);
      act(() =>
        s.aendern(
          mitEbene(foto!.id, ebene!.id, (e) => ({
            ...e,
            rechteck: { ecken: ECKEN, breite: 1.26, hoehe: 1.51 },
            messungen: [
              { id: 'm1', art: 'strecke', name: 'Strecke 1', punkte: [ECKEN[0], ECKEN[1]] },
              { id: 'm2', art: 'strecke', name: 'Strecke 2', punkte: [ECKEN[1], ECKEN[2]] },
            ],
          })),
        ),
      );
      act(() => useEntz.getState().setze({ ansicht: 'entzerrt', auswahl: { art: 'messung', id: 'm1' } }));
      // Rechtsklick (Taste 2) auf die Linie von Strecke 2
      const linie = [...host.querySelectorAll('path.ef-messung')][1]!;
      act(() => void linie.dispatchEvent(new PointerEvent('pointerdown', { button: 2, bubbles: true })));
      expect(useEntz.getState().auswahl).toEqual({ art: 'messung', id: 'm2' });
      const loeschen = flaechenMenue().at(-1) as Exclude<MenuePunkt, { trenner: true }>;
      expect((flaechenMenue()[0] as { text: string }).text).toBe('Alles zeigen');
      expect(loeschen.text).toBe('„Strecke 2“ löschen');
      act(() => loeschen.aktion!());
      expect(aktuell(useEntz.getState()).ebene!.messungen.map((m) => m.id)).toEqual(['m1']);
      // Gegenprobe: beim Zeichnen ändert der Rechtsklick die Auswahl nicht
      act(() => useEntz.getState().setze({ werkzeug: 'linienzug', entwurf: [ECKEN[0]], auswahl: null }));
      act(() => void host.querySelector('path.ef-messung')!.dispatchEvent(new PointerEvent('pointerdown', { button: 2, bubbles: true })));
      expect(useEntz.getState().auswahl).toBeNull();
    } finally {
      if (w) Object.defineProperty(HTMLElement.prototype, 'clientWidth', w);
      if (h) Object.defineProperty(HTMLElement.prototype, 'clientHeight', h);
    }
  });

  it('Werkzeugleiste nach der Leisten-Regel: Datei, Speichern mit Punkt, Foto | Entzerrt, Rückgängig/Wiederholen, Menü „Ansicht“', () => {
    const host = render();
    const leiste = host.querySelector('[role="group"][aria-label="Werkzeugleiste"]')!;
    expect(leiste).not.toBeNull();
    // seltene Befehle stehen nicht mehr einzeln in der Leiste
    for (const t of ['Neu', 'Öffnen …', 'Einpassen', 'Fotos']) expect(knopf(leiste, t)).toBeUndefined();
    const menueKnopf = (name: string) => [...leiste.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')].find((b) => b.textContent?.trim() === name)!;
    const punkte = () => [...document.querySelectorAll<HTMLElement>('[role="menu"] [role^="menuitem"]')];
    // „Datei“: Dateibefehle, dann Fotos hinzufügen; ohne Foto ist „Speichern unter …“ gesperrt mit Grund
    act(() => menueKnopf('Datei').click());
    expect(punkte().map((p) => p.textContent?.trim().replace(/\s+/g, ' '))).toEqual(['Neu', 'Öffnen …Strg+O', expect.stringMatching(/^Speichern unter …/), 'Fotos hinzufügen …']);
    expect(punkte()[2].getAttribute('aria-disabled')).toBe('true');
    act(() => void document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    // „Ansicht“: die linke Leiste als Haken-Schalter
    expect(host.querySelector('.sidebar-left')).not.toBeNull();
    act(() => menueKnopf('Ansicht').click());
    const leisteSchalter = punkte().find((p) => p.textContent?.includes('Leiste mit Fotos und Ebenen'))!;
    expect(leisteSchalter.getAttribute('role')).toBe('menuitemcheckbox');
    expect(leisteSchalter.getAttribute('aria-checked')).toBe('true');
    act(() => leisteSchalter.click());
    expect(host.querySelector('.sidebar-left')).toBeNull();
    // Speichern zeigt ungespeicherte Änderungen als Punkt und im Namen; Gegenprobe ohne Änderungen
    const speichernKnopf = () => knopf(leiste, 'Speichern')!;
    expect(speichernKnopf().classList.contains('ungespeichert')).toBe(false);
    act(() => useEntz.getState().fotoHinzufuegen('f1', 'Süd', 'image/png', 10, 8, new Uint8Array(4)));
    expect(speichernKnopf().classList.contains('ungespeichert')).toBe(true);
    expect(speichernKnopf().getAttribute('aria-label')).toBe('Speichern – ungespeicherte Änderungen');
    expect(speichernKnopf().title).toContain('ungespeicherte Änderungen');
    expect(knopf(leiste, 'Foto')).toBeDefined();
    expect(leiste.querySelector('[aria-label="Rückgängig"]')).not.toBeNull();
  });
});
