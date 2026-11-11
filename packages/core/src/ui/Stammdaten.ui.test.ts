// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectMeta } from '../model';
import { leereMeta } from '../model';
import { StammdatenDialog, StammdatenFelder } from './Stammdaten';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
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
const feld = (host: Element, label: string) =>
  [...host.querySelectorAll('label.field')].find((l) => l.querySelector('.field-label')?.textContent?.replace(/\s*\*$/, '') === label)!.querySelector('input') as HTMLInputElement;
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;

describe('Stammdaten-Dialog', () => {
  it('frisch geöffnet keine Fehler; ohne Projektnummer erscheint die Meldung am Feld; legt mit den Stammdaten an', async () => {
    const gespeichert = vi.fn<(m: ProjectMeta) => void>();
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(StammdatenDialog, { titel: 'Projektdatei anlegen', text: 'Im Ordner liegt noch keine Projektdatei.', meta: leereMeta(), onSpeichern: gespeichert, onAbbrechen: () => {} }));
    });
    expect(host.textContent).toContain('Im Ordner liegt noch keine Projektdatei.');
    // frisch geöffnet: keine Fehlerkästen, Pflichtfeld markiert
    expect(host.querySelector('.feld-meldung')).toBeNull();
    expect(feld(host, 'Projektnummer').required).toBe(true);
    await act(async () => knopf(host, 'Projektdatei anlegen').click());
    expect(gespeichert).not.toHaveBeenCalled();
    expect(feld(host, 'Projektnummer').closest('label')!.querySelector('.feld-meldung')!.textContent).toBe('Angabe fehlt.');
    // weiche Prüfungen: Hinweise, kein Blocker
    eingabe(feld(host, 'PLZ'), '4814');
    expect(feld(host, 'PLZ').closest('label')!.querySelector('.feld-meldung')!.textContent).toContain('fünf Ziffern');
    eingabe(feld(host, 'PLZ'), '48143');
    eingabe(feld(host, 'E-Mail'), 'anna@mueller, kein-mail');
    expect(feld(host, 'E-Mail').closest('label')!.querySelector('.feld-meldung')!.textContent).toBe('Keine gültige E-Mail-Adresse: anna@mueller, kein-mail');
    eingabe(feld(host, 'Projektnummer'), ' BS5 ');
    eingabe(feld(host, 'Kurzname'), 'Birkenstraße');
    eingabe(feld(host, 'Name bzw. Firma'), 'Mustermann');
    eingabe(feld(host, 'E-Mail'), 'a@example.org, b@example.org');
    act(() => ([...host.querySelectorAll('.sd-lph input')][3] as HTMLInputElement).click());
    act(() => knopf(host, '+ Beteiligter').click());
    eingabe(host.querySelector('.sd-beteiligte input') as HTMLInputElement, 'Tragwerk');
    await act(async () => knopf(host, 'Projektdatei anlegen').click());
    expect(gespeichert).toHaveBeenCalledTimes(1);
    expect(gespeichert.mock.calls[0][0]).toMatchObject({
      projektcode: 'BS5',
      kurzname: 'Birkenstraße',
      leistungsphasen: [4],
      beteiligte: [{ rolle: 'Tragwerk', name: '', kontakt: '' }],
      bauherr: { name: 'Mustermann', kontakte: [{ art: 'email', wert: 'a@example.org' }, { art: 'email', wert: 'b@example.org' }] },
    });
  });

  it('Leistungsphasen mit Namen und Schnellwahl; Beteiligte mit Rollen-Vorschlägen, Übernahme aus früheren Projekten, beschriftete Felder (P-07, P-12, P-14)', () => {
    let meta: ProjectMeta = { ...leereMeta(), beteiligte: [{ rolle: '', name: '', kontakt: '' }] };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const zeichne = () =>
      act(() =>
        root!.render(
          createElement(StammdatenFelder, {
            meta,
            bereiche: ['umfang'],
            onChange: (m: ProjectMeta) => {
              meta = m;
              zeichne();
            },
            bearbeiterVorschlaege: ['TP', 'AK'],
            beteiligtVorschlaege: [{ rolle: 'Tragwerksplanung', name: 'Büro Statik', kontakt: '0251 1234' }],
          }),
        ),
      );
    act(() => {
      root = createRoot(host);
    });
    zeichne();
    // Namen sichtbar, Schnellwahl
    const lph = host.querySelector('.sd-lph')!.textContent!;
    expect(lph).toContain('4 Genehmigungsplanung');
    expect(lph).toContain('8 Objektüberwachung');
    act(() => knopf(host, '1–4 bis Bauantrag').click());
    expect(meta.leistungsphasen).toEqual([1, 2, 3, 4]);
    act(() => knopf(host, '5–8').click());
    expect(meta.leistungsphasen).toEqual([5, 6, 7, 8]);
    act(() => knopf(host, '1–9 alle').click());
    expect(meta.leistungsphasen).toHaveLength(9);
    act(() => knopf(host, 'keine').click());
    expect(meta.leistungsphasen).toBeUndefined();
    // Bearbeitung: Hinweis und Vorschläge der Mitarbeiter
    expect(feld(host, 'Bearbeitung').closest('label')!.textContent).toContain('Kürzel, z. B. TP');
    const liste = (el: HTMLInputElement) => [...host.querySelectorAll(`datalist[id="${el.getAttribute('list')}"] option`)].map((o) => o.getAttribute('value'));
    expect(liste(feld(host, 'Bearbeitung'))).toEqual(['TP', 'AK']);
    // beschriftete Felder je Zeile, Rollen-Vorschläge plus Freitext
    const rolle = host.querySelector<HTMLInputElement>('input[aria-label="Rolle 1"]')!;
    expect(liste(rolle)).toContain('Prüfingenieur/-in für Standsicherheit');
    expect(liste(rolle)).toContain('Vermessung (ÖbVI)');
    expect(host.querySelector('button[aria-label="Beteiligten 1 entfernen"]')).not.toBeNull();
    eingabe(rolle, 'Lichtplanung');
    expect(meta.beteiligte![0].rolle).toBe('Lichtplanung');
    // Name aus einem früheren Projekt: Kontakt wird ergänzt, die eigene Rolle bleibt
    const name = host.querySelector<HTMLInputElement>('input[aria-label="Name 1"]')!;
    expect(liste(name)).toEqual(['Büro Statik']);
    eingabe(name, 'Büro Statik');
    expect(meta.beteiligte![0]).toEqual({ rolle: 'Lichtplanung', name: 'Büro Statik', kontakt: '0251 1234' });
  });

  it('ein Fehler beim Anlegen erscheint im Dialog', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(StammdatenDialog, { titel: 'X', meta: { ...leereMeta(), projektcode: 'BS5' }, onSpeichern: () => Promise.reject(new Error('Ordner schreibgeschützt')), onAbbrechen: () => {} }));
    });
    await act(async () => knopf(host, 'Projektdatei anlegen').click());
    expect(host.textContent).toContain('Ordner schreibgeschützt');
  });
});

describe('Stammdaten: Koordinaten der Adresse', () => {
  it('werden nach dem Eintragen der Adresse abgefragt, angezeigt, kopierbar und mit gespeichert', async () => {
    const { geokodiererSetzen } = await import('../platform/geokodierung');
    const abruf = vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ lat: '51.96236', lon: '7.62571', place_rank: 30 }] }));
    geokodiererSetzen(abruf);
    const gespeichert = vi.fn<(m: ProjectMeta) => void>();
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(StammdatenDialog, { titel: 'Stammdaten', meta: leereMeta(), projektnummerPflicht: false, speichernText: 'Übernehmen', onSpeichern: gespeichert, onAbbrechen: () => {} }));
    });
    eingabe(feld(host, 'Bauvorhaben – Straße und Hausnummer'), 'Prinzipalmarkt 10');
    eingabe(feld(host, 'Ort'), 'Münster');
    await act(async () => new Promise((r) => setTimeout(r, 900)));
    expect(abruf).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.sd-koordinaten-wert')!.textContent).toBe('O 405.577,31 · N 5.757.743,76');
    const schreiben = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: schreiben }, configurable: true });
    act(() => knopf(host, 'Kopieren').click());
    expect(schreiben).toHaveBeenCalledWith('405577.31, 5757743.76');
    await act(async () => knopf(host, 'Übernehmen').click());
    expect(gespeichert.mock.calls[0][0].koordinaten).toMatchObject({ epsg: 25832, ost: 405577.31, adresse: 'Prinzipalmarkt 10, Münster' });
    geokodiererSetzen(null);
  });
});
