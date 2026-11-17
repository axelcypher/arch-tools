// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectMeta } from '../model';
import { leereMeta } from '../model';
import { PlanphaseWahl, StammdatenDialog, StammdatenFelder, StammdatenKnopf } from './Stammdaten';

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
    eingabe(feld(host, 'Kurzname'), 'Buchenstraße');
    eingabe(feld(host, 'Name bzw. Firma'), 'Mustermann');
    eingabe(feld(host, 'E-Mail'), 'a@example.org, b@example.org');
    act(() => ([...host.querySelectorAll('.sd-lph input')][3] as HTMLInputElement).click());
    const hinzu = knopf(host, 'Beteiligten hinzufügen');
    expect(hinzu.querySelector('svg.symbol')).not.toBeNull();
    expect(hinzu.textContent).not.toContain('+');
    act(() => hinzu.click());
    eingabe(host.querySelector('.sd-beteiligte input') as HTMLInputElement, 'Tragwerk');
    await act(async () => knopf(host, 'Projektdatei anlegen').click());
    expect(gespeichert).toHaveBeenCalledTimes(1);
    expect(gespeichert.mock.calls[0][0]).toMatchObject({
      projektcode: 'BS5',
      kurzname: 'Buchenstraße',
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
            rollenSchnell: true,
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
    act(() => knopf(host, 'ohne Einschränkung').click());
    expect(meta.leistungsphasen).toBeUndefined();
    // Bearbeitung: Hinweis und Vorschläge der Mitarbeiter
    expect(feld(host, 'Bearbeitung').closest('label')!.textContent).toContain('Kürzel, z. B. TP');
    const liste = (el: HTMLInputElement) => [...host.querySelectorAll(`datalist[id="${el.getAttribute('list')}"] option`)].map((o) => o.getAttribute('value'));
    expect(liste(feld(host, 'Bearbeitung'))).toEqual(['TP', 'AK']);
    // beschriftete Felder je Zeile, Rollen-Vorschläge plus Freitext
    const rolle = host.querySelector<HTMLInputElement>('input[aria-label="Rolle 1"]')!;
    expect(liste(rolle)).toContain('Prüfingenieur/-in für Standsicherheit');
    expect(liste(rolle)).toContain('Vermessung (ÖbVI)');
    // NRW: Prüfsachverständige für Brandschutz (§ 68 Abs. 2) und Standsicherheit (§ 68 Abs. 3), Schall- und Wärmeschutz (§ 68 Abs. 4), SiGeKo – nur als Vorschlag
    expect(liste(rolle)).toEqual(
      expect.arrayContaining(['Prüfsachverständige/-r für Brandschutz', 'Prüfsachverständige/-r für Standsicherheit', 'Staatlich anerkannte/-r Sachverständige/-r für Schall- und Wärmeschutz', 'SiGeKo (BaustellV)']),
    );
    // Gegenprobe: die Schnellwahl-Knöpfe bleiben die bisherigen acht – Bodengutachten ja, die neuen Rollen nicht
    const schnell = [...host.querySelectorAll('[aria-label="Beteiligte nach Rolle hinzufügen"] button')].map((b) => b.textContent?.trim() ?? '');
    expect(schnell).toContain('Bodengutachten');
    // Schnellknöpfe nach der Regel „Listen“: Symbol plus statt „+“, title mit „hinzufügen“
    const rollenKnoepfe = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Beteiligte nach Rolle hinzufügen"] button')];
    const boden = rollenKnoepfe.find((b) => b.textContent?.includes('Bodengutachten'))!;
    expect(boden.querySelector('svg.symbol')).not.toBeNull();
    expect(boden.textContent).not.toContain('+');
    expect(boden.title).toBe('Bodengutachten hinzufügen');
    expect(schnell.some((t) => t.includes('Prüfsachverständige') || t.includes('SiGeKo') || t.includes('Schall'))).toBe(false);
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

describe('Planungsphase', () => {
  const zeichneWahl = (start: ProjectMeta, props: Record<string, unknown> = {}) => {
    let meta = start;
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
    });
    const zeichne = () =>
      act(() =>
        root!.render(
          createElement(PlanphaseWahl, {
            meta,
            onChange: (m: ProjectMeta) => {
              meta = m;
              zeichne();
            },
            ...props,
          }),
        ),
      );
    zeichne();
    return { host, meta: () => meta };
  };
  const waehle = (el: HTMLSelectElement, wert: string) =>
    act(() => {
      el.value = wert;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

  it('ohne Festlegung sichtbar leer; Vorschlag wird erst auf Klick gesetzt; Wechsel und Zurücksetzen', () => {
    const { host, meta } = zeichneWahl({ ...leereMeta(), leistungsphasen: [1, 2, 3, 4] });
    const sel = host.querySelector('select.sd-phase') as HTMLSelectElement;
    expect(sel.value).toBe('');
    expect(sel.classList.contains('leer')).toBe(true);
    expect(sel.closest('label')!.textContent).toContain('Planungsphase');
    expect(host.textContent).toContain('Nicht festgelegt – {PHASE} bleibt in Datei- und Ordnernamen leer.');
    // Planphasen des Namensschemas (Vorgabe) mit LPh, AB ohne
    expect([...sel.options].map((o) => o.value)).toEqual(['', 'BP', 'EP', 'GP', 'AP', 'AB']);
    expect(sel.options[3].textContent).toBe('GP – Genehmigungsplanung · LPh 4');
    expect(sel.options[5].textContent).toContain('ohne LPh');
    // Vorschlag aus der ersten beauftragten Leistungsphase – nicht still gesetzt
    expect(meta().planphase).toBeUndefined();
    act(() => knopf(host, 'Vorschlag BP übernehmen').click());
    expect(meta().planphase).toBe('BP');
    expect(knopf(host, 'Vorschlag')).toBeUndefined();
    waehle(host.querySelector('select.sd-phase') as HTMLSelectElement, 'GP');
    expect(meta().planphase).toBe('GP');
    expect(host.textContent).toContain('Aktuelle Phase (LPh 4)');
    waehle(host.querySelector('select.sd-phase') as HTMLSelectElement, '');
    expect('planphase' in meta()).toBe(false);
  });

  it('Phase aus einem anderen Namensschema bleibt sichtbar; eigenes Namensschema des Projekts gilt', () => {
    const { host } = zeichneWahl({ ...leereMeta(), planphase: 'XY' });
    const sel = host.querySelector('select.sd-phase') as HTMLSelectElement;
    expect(sel.value).toBe('XY');
    expect(sel.selectedOptions[0].textContent).toBe('XY (nicht im Namensschema)');
    act(() => root?.unmount());
    root = null;
    const eigen = zeichneWahl({ ...leereMeta(), planphase: 'XY' }, { namensschema: { phasen: [{ kuerzel: 'XY', name: 'Sonderphase' }] } });
    expect([...(eigen.host.querySelector('select.sd-phase') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['', 'XY']);
  });

  it('im Projektkopf (Stammdaten-Knopf): Phase direkt wechseln, beschriftet', () => {
    const geaendert = vi.fn<(m: ProjectMeta, name: string) => void>();
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(StammdatenKnopf, { project: { name: 'Test', meta: { ...leereMeta(), projektcode: 'BS9' } }, onAendern: geaendert }));
    });
    const sel = host.querySelector('.sd-phase-kopf select') as HTMLSelectElement;
    expect(host.querySelector(`label[for="${sel.id}"]`)!.textContent).toBe('Phase');
    waehle(sel, 'AP');
    expect(geaendert).toHaveBeenCalledWith(expect.objectContaining({ planphase: 'AP', projektcode: 'BS9' }), 'Test');
  });
});
