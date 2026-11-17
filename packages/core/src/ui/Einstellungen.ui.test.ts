// @vitest-environment happy-dom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Zentraler Einstellungsdialog: Seiten als senkrechte Registerleiste, Entwurf mit „Übernehmen“, Prüfung, Vorgabe, Übernahme alter Werte */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
const roh = (bereich: string) => JSON.parse(localStorage.getItem(`arch-tools:konfig:${bereich}`) ?? 'null') as Record<string, unknown> | null;
const setze = (bereich: string, wert: unknown) => localStorage.setItem(`arch-tools:konfig:${bereich}`, JSON.stringify(wert));
const warten = () => act(() => new Promise((r) => setTimeout(r, 20)));
const knopf = (text: string, in_: ParentNode = document.body) => [...in_.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
const klick = async (b: HTMLElement | undefined | null) => {
  expect(b).toBeTruthy();
  await act(async () => b!.click());
  await warten();
};
const taste = (el: Element, key: string, mehr: KeyboardEventInit = {}) => act(async () => void el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mehr })));
const tippen = (feld: HTMLInputElement | HTMLTextAreaElement, text: string) =>
  act(async () => {
    const proto = feld instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(feld, text);
    feld.dispatchEvent(new Event('input', { bubbles: true }));
  });
const dialog = () => document.querySelector<HTMLElement>('.modal.einst');
const eintrag = (id: string) => document.getElementById(`einst-${id}`)!;
const feldVon = (id: string) => eintrag(id).querySelector<HTMLInputElement>('input.einst-feld, textarea.einst-feld')!;

async function zeigen() {
  const e = await import('./Einstellungen');
  const { RueckfrageHost } = await import('./Rueckfrage');
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(createElement(Fragment, null, createElement(e.EinstellungenHost), createElement(RueckfrageHost)));
  });
  return e;
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('Einstellungen', () => {
  it('Strg+, öffnet „Allgemein“; Seiten als senkrechte Registerleiste (↑/↓, Pos1/Ende, nur die gewählte in der Tab-Folge); Titel im Navigationskopf', async () => {
    await zeigen();
    expect(dialog()).toBeNull();
    await taste(document.body, ',', { ctrlKey: true });
    await warten();
    const d = dialog()!;
    expect(d.getAttribute('aria-label')).toBe('Einstellungen');
    expect(d.classList.contains('modal-tabelle')).toBe(true);
    expect(d.querySelector('nav h3')?.textContent).toBe('Einstellungen');
    const liste = d.querySelector('[role="tablist"]')!;
    expect(liste.getAttribute('aria-orientation')).toBe('vertical');
    const tabs = () => [...d.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs().map((t) => t.querySelector('.einst-nav-titel')?.textContent)).toEqual(['Allgemein', 'Pfade und Benennung']);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1]);
    const panel = d.querySelector('[role="tabpanel"]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs()[0].id);
    expect(panel.querySelector('h3')?.textContent).toBe('Allgemein');
    // Farbschema steht nicht hier (Menü der Titelleiste), Speicherort und Büro schon
    expect(panel.textContent).not.toContain('Farbschema');
    expect(panel.textContent).toContain('Speicherort der Einstellungen');
    expect(panel.querySelectorAll('h4').length).toBe(2);
    await taste(tabs()[0], 'ArrowDown');
    await warten();
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(d.querySelector('[role="tabpanel"] h3')?.textContent).toBe('Pfade und Benennung');
    await taste(tabs()[1], 'Home');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    await taste(tabs()[0], 'End');
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
  });

  it('Pfade und Benennung: nach Thema gegliedert, App gekennzeichnet, Platzhalter-Chips, Vorschau; Änderung gilt erst mit „Übernehmen“', async () => {
    setze('allgemein', { buero: 'Muster' });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade', 'export.excel.flaechenrechner'));
    await warten();
    const d = dialog()!;
    expect([...d.querySelectorAll('.einst-gruppe > h4')].map((h) => h.textContent)).toEqual(['Projekt', 'Ablage', 'Pläne und Dokumente', 'Export', 'Vorlagen']);
    const ex = eintrag('export.excel.flaechenrechner');
    expect(ex.querySelector('.einst-app')?.textContent).toBe('QUADRIO');
    expect(ex.querySelector('[role="group"][aria-label="Platzhalter: Dateiname Excel-Export"]')).not.toBeNull();
    expect(ex.querySelector('.einst-vorschau')?.textContent).toMatch(/^Vorschau: BS9 \d{6} Flächenaufstellung\.xlsx$/);
    // Fokus aus dem Aufruf: das Feld des Eintrags
    expect(document.activeElement).toBe(feldVon('export.excel.flaechenrechner'));
    const uebernehmen = knopf('Übernehmen', d)!;
    expect(uebernehmen.type).toBe('submit');

    await tippen(feldVon('export.excel.flaechenrechner'), '{PROJEKT_KUERZEL} Flächen');
    expect(ex.classList.contains('geaendert')).toBe(true);
    expect(d.querySelector('[role="tab"][aria-selected="true"] .einst-geaendert')).not.toBeNull();
    // noch nichts gespeichert
    expect(roh('allgemein')).toEqual({ buero: 'Muster' });
    // Chip an der Schreibmarke (hier am Ende)
    await tippen(feldVon('export.excel.flaechenrechner'), '{PROJEKT_KUERZEL} Flächen ');
    await klick(ex.querySelector<HTMLButtonElement>('button[aria-label^="{DATUM} einfügen"]'));
    expect(feldVon('export.excel.flaechenrechner').value).toBe('{PROJEKT_KUERZEL} Flächen {DATUM}');
    await klick(uebernehmen);
    expect(dialog()).toBeNull();
    expect(roh('allgemein')).toEqual({ buero: 'Muster', pfade: { 'export.excel.flaechenrechner': '{PROJEKT_KUERZEL} Flächen {DATUM}' } });
  });

  it('Prüfung: ungültige Zeichen und leere Pflichtfelder am Feld, „Übernehmen“ gesperrt mit Grund; „Vorgabe wiederherstellen“', async () => {
    setze('allgemein', { fotoordner: '10 Fotos' });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    const d = dialog()!;
    // Erstfokus ohne Angabe eines Eintrags: das erste Feld der Seite (Filter „App“)
    expect(document.activeElement?.tagName).toBe('SELECT');
    const foto = eintrag('ablage.fotoordner');
    expect(feldVon('ablage.fotoordner').value).toBe('10 Fotos');
    expect(foto.textContent).toContain('Eigener Wert');
    await tippen(feldVon('ablage.fotoordner'), 'Fotos|alt');
    expect(foto.querySelector('.feld-meldung')?.textContent).toBe('Nicht erlaubt in Ordner- und Dateinamen: |');
    expect(feldVon('ablage.fotoordner').getAttribute('aria-invalid')).toBe('true');
    expect(knopf('Übernehmen', d)!.disabled).toBe(true);
    expect(knopf('Übernehmen', d)!.title).toContain('Fotoordner');
    // der Grund steht sichtbar neben den Knöpfen, „Zum Feld“ springt hin
    const grund = d.querySelector<HTMLElement>('.einst-sperrgrund')!;
    expect(grund.textContent).toContain('„Fotoordner“ berichtigen');
    (document.activeElement as HTMLElement | null)?.blur();
    await klick(knopf('Zum Feld', grund));
    await warten();
    expect(document.activeElement).toBe(feldVon('ablage.fotoordner'));
    await tippen(feldVon('ablage.fotoordner'), '');
    expect(foto.querySelector('.feld-meldung')?.textContent).toMatch(/^Angabe fehlt/);
    await klick(knopf('Vorgabe wiederherstellen', foto));
    expect(feldVon('ablage.fotoordner').value).toBe('09 Fotos');
    expect(knopf('Übernehmen', d)!.disabled).toBe(false);
    await klick(knopf('Übernehmen', d));
    // bisheriger Schlüssel, die Vorgabe ausdrücklich geschrieben
    expect(roh('allgemein')).toEqual({ fotoordner: '09 Fotos' });
  });

  it('Abbrechen bzw. Esc mit Änderungen: Rückfrage „Änderungen an ‚Einstellungen‘ verwerfen?“; ohne Änderungen schließt es gleich', async () => {
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    await klick(knopf('Abbrechen', dialog()!));
    expect(dialog()).toBeNull();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    await tippen(feldVon('export.pdf.kosten'), 'Kosten');
    await klick(knopf('Abbrechen', dialog()!));
    const rf = document.querySelector<HTMLElement>('.modal.rf')!;
    expect(rf.textContent).toContain('Änderungen an ‚Einstellungen‘ verwerfen?');
    expect(rf.textContent).toContain('Die Änderungen an den Einstellungen gehen verloren.');
    await klick(knopf('Abbrechen', rf));
    expect(dialog()).not.toBeNull();
    expect(feldVon('export.pdf.kosten').value).toBe('Kosten');
    await klick(knopf('Abbrechen', dialog()!));
    await klick(knopf('Verwerfen und schließen'));
    expect(dialog()).toBeNull();
    expect(roh('allgemein')).toBeNull();
    // beim nächsten Öffnen beginnt der Entwurf frisch
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    expect(feldVon('export.pdf.kosten').value).toBe('{PROJEKT_KUERZEL} {DATUM} {Inhalt}');
  });

  it('Allgemein: Büro und Mitarbeiter gelten erst mit „Übernehmen“', async () => {
    setze('allgemein', { buero: 'Alt', fotoordner: 'F' });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen());
    await warten();
    const felder = [...dialog()!.querySelectorAll<HTMLInputElement>('[role="tabpanel"] input')];
    // Erstfokus: das erste Feld der Seite
    expect(document.activeElement).toBe(felder[0]);
    await tippen(felder[0], 'Architekturbüro Beispiel');
    await tippen(felder[1], 'TP; AK, TP');
    expect(roh('allgemein')!.buero).toBe('Alt');
    await klick(knopf('Übernehmen', dialog()!));
    expect(roh('allgemein')).toEqual({ buero: 'Architekturbüro Beispiel', fotoordner: 'F', mitarbeiter: ['TP', 'AK'] });
  });

  it('Listen je Zeile; Liste der Rechnungsmuster bleibt im Schlüssel von FABRIO, übrige Einstellungen dort unverändert', async () => {
    setze('ava', { ablage: { gewerke: 'Gewerke', archive: ['Archiv'] }, rechnungen: { arten: [{ kuerzel: 'AB', name: 'Abschlag' }] } });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    const archive = feldVon('ablage.fabrio.archive');
    expect(archive.tagName).toBe('TEXTAREA');
    await tippen(archive, 'Archiv\n_alt\n');
    // Enter in der Liste beginnt eine neue Zeile, übernimmt nichts
    await taste(archive, 'Enter');
    expect(dialog()).not.toBeNull();
    await klick(knopf('Übernehmen', dialog()!));
    expect(roh('ava')).toEqual({ ablage: { gewerke: 'Gewerke', archive: ['Archiv', '_alt'] }, rechnungen: { arten: [{ kuerzel: 'AB', name: 'Abschlag' }] } });
  });

  it('alter Wert dieses Rechners weicht vom gemeinsamen ab: Hinweis mit Wahl; ohne gemeinsamen Wert still übernommen', async () => {
    localStorage.setItem('formulare:export', JSON.stringify({ antragsordner: 'Anträge', zielpfad: 'Ausgang/{Antrag}' }));
    setze('allgemein', { pfade: { 'ablage.permio.antragsordner': 'TÖB-Ablage' } });
    const e = await zeigen();
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    // der Zielordner stand gemeinsam noch nicht: übernommen
    expect((roh('allgemein')!.pfade as Record<string, unknown>)['plaene.permio.zielpfad']).toBe('Ausgang/{Antrag}');
    const hinweis = document.querySelector<HTMLElement>('.einst-abweichung')!;
    expect(hinweis.textContent).toContain('Antragsordner');
    expect(hinweis.textContent).toContain('Anträge');
    expect(hinweis.textContent).toContain('TÖB-Ablage');
    await klick(knopf('Wert dieses Rechners', hinweis));
    expect(document.querySelector('.einst-abweichung')).toBeNull();
    expect(feldVon('ablage.permio.antragsordner').value).toBe('Anträge');
    await klick(knopf('Übernehmen', dialog()!));
    expect((roh('allgemein')!.pfade as Record<string, unknown>)['ablage.permio.antragsordner']).toBe('Anträge');
    // entschieden: kein Hinweis mehr (der alte Eintrag bleibt unverändert stehen)
    await act(async () => e.einstellungenOeffnen('pfade'));
    await warten();
    expect(document.querySelector('.einst-abweichung')).toBeNull();
    expect(JSON.parse(localStorage.getItem('formulare:export')!)).toEqual({ antragsordner: 'Anträge', zielpfad: 'Ausgang/{Antrag}' });
  });

  it('Erweiterungspunkt: Seiten der Apps hinter den gemeinsamen, nach App-Namen; ihr Entwurf zählt für „Übernehmen“', async () => {
    const e = await zeigen();
    let geaendert = false;
    const uebernommen = vi.fn(async () => undefined);
    e.einstellungsSeiteAnmelden({ id: 'ordner', app: 'ordner', titel: 'ATLAS', text: 'Struktur', symbol: 'ordner', inhalt: () => createElement('p', null, 'Seite von ATLAS') });
    e.einstellungsSeiteAnmelden({
      id: 'ava',
      app: 'ava',
      titel: 'FABRIO',
      text: 'Prüfung',
      symbol: 'zahnrad',
      inhalt: () => createElement('p', null, 'Seite von FABRIO'),
      entwurf: { geaendert: () => geaendert, uebernehmen: uebernommen, verwerfen: () => (geaendert = false) },
    });
    e.einstellungenStartseite('ava');
    await act(async () => e.einstellungenOeffnen());
    await warten();
    const d = dialog()!;
    expect([...d.querySelectorAll('[role="tab"] .einst-nav-titel')].map((t) => t.textContent)).toEqual(['Allgemein', 'Pfade und Benennung', 'ATLAS', 'FABRIO']);
    // die Seite heißt wie die App: der Name steht nicht noch einmal in der Zeile darunter
    expect([...d.querySelectorAll('[role="tab"] .einst-nav-text')].slice(2).map((t) => t.textContent)).toEqual(['Struktur', 'Prüfung']);
    expect(d.querySelector('[role="tabpanel"]')!.textContent).toContain('Seite von FABRIO');
    geaendert = true;
    act(() => e.einstellungenEntwurfMelden());
    await klick(knopf('Übernehmen', d));
    expect(uebernommen).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it('Stammordner der Projekte: bestehende Liste unverändert gelesen, Reihenfolge per Tastatur (Fokus bleibt), Entfernen, Eintragen nur vollständiger Ordner', async () => {
    setze('allgemein', { projekte: ['Z:\\Projekte', '\\\\server\\Akquise', 'Y:\\Archiv'], oapPfad: 'x.oap' });
    const e = await zeigen();
    act(() => e.einstellungenOeffnen('pfade', 'projekt.stammordner'));
    await warten();
    const liste = () => [...eintrag('projekt.stammordner').querySelectorAll('.einst-ordnerliste code')].map((c) => c.textContent);
    expect(liste()).toEqual(['Z:\\Projekte', '\\\\server\\Akquise', 'Y:\\Archiv']);
    expect(eintrag('projekt.stammordner').querySelector('.einst-ordnerliste li')!.textContent).toContain('neue Projekte');
    const knopfMit = (label: string) => [...eintrag('projekt.stammordner').querySelectorAll<HTMLButtonElement>('button')].find((x) => x.getAttribute('aria-label') === label)!;
    expect(knopfMit('Z:\\Projekte nach oben').disabled).toBe(true);
    // Akquise nach oben: gilt dann für neue Projekte; der Fokus bleibt an ihrem Knopf
    await klick(knopfMit('\\\\server\\Akquise nach oben'));
    expect(liste()).toEqual(['\\\\server\\Akquise', 'Z:\\Projekte', 'Y:\\Archiv']);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('\\\\server\\Akquise nach unten');
    await klick(knopfMit('Y:\\Archiv entfernen'));
    expect(liste()).toEqual(['\\\\server\\Akquise', 'Z:\\Projekte']);
    // eintragen: relativ geht nicht (Fehler am Feld), vollständig schon – Enter trägt ein statt zu übernehmen
    const feld = eintrag('projekt.stammordner').querySelector<HTMLInputElement>('input.einst-feld')!;
    await tippen(feld, 'Projekte');
    await taste(feld, 'Enter');
    expect(eintrag('projekt.stammordner').querySelector('.feld-meldung')!.textContent).toContain('Vollständigen Ordner');
    await tippen(feld, 'z:\\projekte\\');
    await taste(feld, 'Enter');
    expect(eintrag('projekt.stammordner').querySelector('.feld-meldung')!.textContent).toContain('schon in der Liste');
    await tippen(feld, 'W:\\Neu');
    await taste(feld, 'Enter');
    expect(liste()).toEqual(['\\\\server\\Akquise', 'Z:\\Projekte', 'W:\\Neu']);
    expect(dialog()).not.toBeNull();
    // gespeichert erst mit „Übernehmen“, unter dem bisherigen Schlüssel
    expect(roh('allgemein')!.projekte).toEqual(['Z:\\Projekte', '\\\\server\\Akquise', 'Y:\\Archiv']);
    await klick(knopf('Übernehmen', dialog()!));
    expect(roh('allgemein')).toMatchObject({ projekte: ['\\\\server\\Akquise', 'Z:\\Projekte', 'W:\\Neu'], oapPfad: 'x.oap' });
  });

  it('Stammordner: ein ungültiger Eintrag aus älteren Daten ist gekennzeichnet und lässt sich entfernen', async () => {
    setze('allgemein', { projekte: ['Z:\\Projekte', 'Projekte'] });
    const e = await zeigen();
    act(() => e.einstellungenOeffnen('pfade', 'projekt.stammordner'));
    await warten();
    const falsch = eintrag('projekt.stammordner').querySelector('.einst-ordner-falsch')!;
    expect(falsch.textContent).toContain('nicht vollständig');
    await klick([...falsch.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Projekte entfernen'));
    expect(eintrag('projekt.stammordner').querySelector('.einst-ordner-falsch')).toBeNull();
    await klick(knopf('Übernehmen', dialog()!));
    expect(roh('allgemein')!.projekte).toEqual(['Z:\\Projekte']);
  });

  it('Menüpunkt und Verweis: „Einstellungen …“ mit Strg+, bzw. „Pfade und Benennung …“ öffnen den Dialog', async () => {
    const e = await zeigen();
    expect(e.einstellungenPunkt()).toMatchObject({ text: 'Einstellungen …', symbol: 'zahnrad', tasten: 'Strg+,' });
    act(() => {
      (e.einstellungenPunkt('pfade') as { aktion: () => void }).aktion();
    });
    await warten();
    expect(e.useEinstellungen.getState()).toMatchObject({ offen: true, seite: 'pfade' });
  });
});
