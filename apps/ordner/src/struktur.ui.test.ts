// @vitest-environment happy-dom
import type { ReactElement } from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { VORGABE_ALLGEMEIN } from '@core/platform/konfig';
import { App } from './App';
import { leereStammdaten } from './stammdaten';
import { useOrdner } from './store';
import { istReserviert, ordnerAusTextMitMeldungen, sichererName, STANDARD } from './struktur';

/**
 * Struktur und Vorlagen (Gesamt-Review ATLAS): Kontextmenü per Tastatur, Meldungen, Werkzeugleiste, Ziehen, Textansicht
 * mit einem Übernahme-Modell, Vorlagen und Kürzel – sowie der Store: unlesbare Struktur nicht still überschreiben,
 * unbekannte Felder erhalten; reservierte Windows-Namen.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const echtesKonfigLaden = useOrdner.getState().konfigLaden;
const SCHLUESSEL = 'arch-tools:konfig:projektordner';
const gespeichert = () => JSON.parse(localStorage.getItem(SCHLUESSEL)!) as Record<string, unknown> & { struktur: Record<string, unknown> };
const allgemein = () => JSON.parse(localStorage.getItem('arch-tools:konfig:allgemein') ?? '{}') as { ordnerSchema?: string };

let root: ReturnType<typeof createRoot> | null = null;
function render(element: ReactElement = createElement(App)): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(element);
  });
  return host;
}
beforeEach(() => {
  localStorage.clear();
  useOrdner.setState({
    stamm: leereStammdaten(),
    struktur: STANDARD,
    stammordner: '',
    vorlagenordner: '',
    vorlagen: [],
    vorlagenName: '',
    allgemein: VORGABE_ALLGEMEIN,
    konfigLaden: async () => {},
    konfigStandEigen: null,
    konflikt: null,
    strukturFehler: null,
    rohEigen: {},
    rueckgaengig: null,
    geladen: false,
  });
});
afterEach(async () => {
  await act(() => useOrdner.getState().speichernJetzt());
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const warten = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const eingabe = (el: HTMLInputElement | HTMLTextAreaElement, value: string, verlassen = true) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    el.focus();
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  if (verlassen) act(() => el.blur());
};
/** Struktur-Ansicht mit einer kleinen Ordnerliste */
const strukturAnsicht = (ordner = [{ pfad: '05 Protokolle' }, { pfad: '07 Ausschreibung', lph: [6, 7] }, { pfad: '07 Ausschreibung/Dach' }, { pfad: '09 Fotos' }]) => {
  useOrdner.setState({ struktur: { ...STANDARD, ordner } });
  const host = render();
  act(() => knopf(host, 'Struktur').click());
  const baum = host.querySelector<HTMLElement>('[role="tree"]')!;
  const z = (pfad: string) => host.querySelector<HTMLElement>(`[role="treeitem"][aria-label="${pfad}"]`)!;
  const klick = (pfad: string) => act(() => z(pfad).dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const taste = (ziel: Element, key: string, mod: KeyboardEventInit = {}) => act(() => ziel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mod })));
  return { host, baum, z, klick, taste };
};
const menue = (host: Element) => host.querySelector<HTMLElement>('.po-menue');
const eintraege = (host: Element) => [...menue(host)!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];

describe('Reservierte Windows-Namen', () => {
  it('sichererName hängt „_“ an CON, PRN, AUX, NUL, COM1–9, LPT1–9 an – auch mit Endung, ohne Unterschied der Schreibung', () => {
    expect(['CON', 'prn', 'Aux', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9'].map(sichererName)).toEqual(['CON_', 'prn_', 'Aux_', 'NUL_', 'COM1_', 'com9_', 'LPT1_', 'lpt9_']);
    expect(sichererName('CON.txt')).toBe('CON_.txt');
    expect(sichererName('nul.tar.gz')).toBe('nul_.tar.gz');
    expect(sichererName('CON. ')).toBe('CON_');
    // Gegenprobe: nur der ganze Name (vor der Endung) zählt
    expect(['CONTRACT', 'Console', 'COM10', 'COM0', 'LPT', 'AUX-Plan', 'Protokoll CON'].map(sichererName)).toEqual(['CONTRACT', 'Console', 'COM10', 'COM0', 'LPT', 'AUX-Plan', 'Protokoll CON']);
    expect(istReserviert('aux.docx')).toBe(true);
    expect(istReserviert('Auxiliar')).toBe(false);
    // unverändert, wenn schon sicher (zweimal angewandt)
    expect(sichererName(sichererName('CON'))).toBe('CON_');
  });

  it('die Ordnerliste meldet reservierte Namen mit Zeilennummer und benennt sie um', () => {
    const { ordner, meldungen } = ordnerAusTextMitMeldungen('Bestand\nBestand/CON\nAUX.txt/Pläne | LPh 5\nConsole');
    expect(ordner.map((o) => o.pfad)).toEqual(['Bestand', 'Bestand/CON_', 'AUX_.txt/Pläne', 'Console']);
    expect(meldungen.map((m) => m.text)).toEqual(['Zeile 2: „CON“ ist unter Windows reserviert – wird zu „CON_“.', 'Zeile 3: „AUX.txt“ ist unter Windows reserviert – wird zu „AUX_.txt“.']);
    // Gegenprobe: ohne reservierte Namen keine Meldung
    expect(ordnerAusTextMitMeldungen('Bestand\nConsole\nCOM10').meldungen).toEqual([]);
  });
});

describe('Store: projektordner.json', () => {
  it('unlesbare Struktur: nicht still die Vorgabe speichern, nichts schreiben (auch kein Ordnerschema) – erst nach bewusstem Ersetzen, vorher gesichert', async () => {
    const kaputt = { name: 'Neuere Fassung', ordner: [{ weg: 'A', regeln: { lph: 5 } }], zukunft: true };
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ struktur: kaputt, vorlagenordner: '/srv/Vorlagen' }));
    localStorage.setItem('arch-tools:konfig:allgemein', JSON.stringify({ projekte: [], ordnerSchema: '{ALT}' }));
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    await act(() => useOrdner.getState().konfigLaden());
    expect(useOrdner.getState().strukturFehler).toContain('lässt sich nicht lesen (Die Konfiguration enthält keinen gültigen Ordner.)');
    // angezeigt wird die Vorgabe, aber nichts geschrieben – auch nach Änderungen nicht
    expect(useOrdner.getState().struktur.ordner).toEqual(STANDARD.ordner);
    const host = render();
    act(() => knopf(host, 'Struktur').click());
    expect(host.querySelector('.po-struktur-fehler')?.textContent).toContain('gespeichert wird nichts');
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Versehentlich' }));
    act(() => useOrdner.getState().setVorlagenordner('/anders'));
    await act(() => useOrdner.getState().speichernJetzt());
    expect(gespeichert()).toEqual({ struktur: kaputt, vorlagenordner: '/srv/Vorlagen' });
    expect(allgemein().ordnerSchema).toBe('{ALT}');
    // bewusst ersetzen: „Vorgabe wiederherstellen …“ – der unlesbare Inhalt kommt vorher in die Sicherungen
    act(() => knopf(host, 'Vorgabe wiederherstellen').click());
    await warten();
    expect(host.querySelector('.modal.rf')?.textContent).toContain('nicht lesbare Struktur wird ersetzt');
    act(() => knopf(host.querySelector('.modal.rf')!, 'Ersetzen').click());
    await warten();
    await act(() => useOrdner.getState().speichernJetzt());
    const sicherungen = JSON.parse(localStorage.getItem('arch-tools:konfig:projektordner-sicherungen')!).sicherungen;
    expect(sicherungen[0].inhalt.struktur).toEqual(kaputt);
    expect(useOrdner.getState().strukturFehler).toBeNull();
    expect(host.querySelector('.po-struktur-fehler')).toBeNull();
    expect(gespeichert().struktur.ordner).toEqual(STANDARD.ordner);
    // Felder, die dieses Tool nicht kennt, bleiben auch dabei erhalten
    expect(gespeichert().struktur.zukunft).toBe(true);
    expect(allgemein().ordnerSchema).toBe(STANDARD.ordnername);
    // die unlesbare Sicherung lässt sich nicht wiederherstellen – Meldung statt kaputter Struktur
    act(() => knopf(host, 'Sicherungen').click());
    await warten();
    expect(host.querySelector('.po-sicherungen')?.textContent).toContain('„Neuere Fassung“');
    act(() => knopf(host, 'Wiederherstellen').click());
    expect(host.querySelector('.po-struktur-kopf .warning')?.textContent).toContain('lässt sich nicht lesen');
    expect(useOrdner.getState().struktur.ordner).toEqual(STANDARD.ordner);
  });

  it('Gegenprobe: lesbare Struktur – das Ordnerschema für alle Apps wird nachgeführt, Änderungen werden gespeichert', async () => {
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ struktur: { ...STANDARD, ordnername: '{PROJEKT_KUERZEL}_{PROJEKT_KURZNAME}' }, vorlagenordner: '' }));
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    await act(() => useOrdner.getState().konfigLaden());
    expect(useOrdner.getState().strukturFehler).toBeNull();
    await act(() => useOrdner.getState().speichernJetzt());
    expect(allgemein().ordnerSchema).toBe('{PROJEKT_KUERZEL}_{PROJEKT_KURZNAME}');
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Büro' }));
    await act(() => useOrdner.getState().speichernJetzt());
    expect(gespeichert().struktur.name).toBe('Büro');
  });

  it('unbekannte Felder (neuere Fassungen) bleiben beim Schreiben erhalten – im Bereich und in der Struktur', async () => {
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ struktur: { ...STANDARD, farben: { a: 1 } }, vorlagenordner: '', ablage: { mails: '04 Schriftverkehr' } }));
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    await act(() => useOrdner.getState().konfigLaden());
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Geändert', bausteine: [{ name: 'Gewerk', ordner: [{ pfad: 'Angebote' }] }] }));
    await act(() => useOrdner.getState().speichernJetzt());
    expect(gespeichert().ablage).toEqual({ mails: '04 Schriftverkehr' });
    expect(gespeichert().struktur.farben).toEqual({ a: 1 });
    expect(gespeichert().struktur.name).toBe('Geändert');
    // bekannte Felder, die die Struktur nicht mehr hat, entfallen dagegen wirklich (Bausteine gelöscht)
    const { bausteine: _b, ...ohne } = useOrdner.getState().struktur;
    act(() => useOrdner.getState().setStruktur(ohne));
    await act(() => useOrdner.getState().speichernJetzt());
    expect(gespeichert().struktur.bausteine).toBeUndefined();
    expect(gespeichert().struktur.farben).toEqual({ a: 1 });
  });
});

describe('Struktur-Editor', () => {
  it('Kontextmenü per Tastatur: Umschalt+F10 für die Zeile mit der Schreibmarke, Fokus im Menü, Pfeile, Pos1/Ende, Tab schließt, Fokus zurück', () => {
    const { host, baum, klick, taste } = strukturAnsicht();
    klick('05 Protokolle');
    taste(baum, 'ArrowDown');
    expect(useOrdner.getState().struktur.ordner).toHaveLength(4);
    taste(baum, 'F10', { shiftKey: true });
    expect(menue(host)?.getAttribute('aria-label')).toBe('Aktionen für 07 Ausschreibung');
    const liste = eintraege(host);
    expect(document.activeElement).toBe(liste[0]);
    expect(liste[0].getAttribute('aria-label')).toBe('Unterordner anlegen');
    // Kürzel stehen sichtbar im Eintrag (und für Hilfsmittel in aria-keyshortcuts)
    const dupl = liste.find((b) => b.getAttribute('aria-label') === 'Duplizieren')!;
    expect(dupl.querySelector('.po-menue-kuerzel')?.textContent).toBe('Strg+D');
    expect(dupl.getAttribute('aria-keyshortcuts')).toBe('Control+D');
    expect(liste.find((b) => b.getAttribute('aria-label') === 'Nach oben')?.textContent).toContain('Alt+↑');
    // Pfeil ab/auf (umlaufend), Ende, Pos1 – der Baum dahinter bleibt, wo er war
    taste(document.activeElement!, 'ArrowDown');
    expect(document.activeElement).toBe(liste[1]);
    taste(document.activeElement!, 'ArrowUp');
    taste(document.activeElement!, 'ArrowUp');
    expect(document.activeElement).toBe(liste[liste.length - 1]);
    expect(liste[liste.length - 1].getAttribute('aria-label')).toBe('Löschen');
    taste(document.activeElement!, 'Home');
    expect(document.activeElement).toBe(liste[0]);
    taste(document.activeElement!, 'End');
    expect(document.activeElement).toBe(liste[liste.length - 1]);
    expect(host.querySelector('.po-k-zeile.cursor')?.getAttribute('aria-label')).toBe('07 Ausschreibung');
    // Tab schließt, der Fokus kehrt in den Baum zurück
    taste(document.activeElement!, 'Tab');
    expect(menue(host)).toBeNull();
    expect(document.activeElement).toBe(baum);
    // die Menütaste wirkt ebenso; Enter führt den Eintrag aus
    taste(baum, 'ContextMenu');
    expect(menue(host)?.getAttribute('aria-label')).toBe('Aktionen für 07 Ausschreibung');
    const umbenennen = eintraege(host).find((b) => b.getAttribute('aria-label') === 'Umbenennen')!;
    act(() => umbenennen.click());
    expect(menue(host)).toBeNull();
    expect(host.querySelector('input[aria-label="Neuer Name"]')).not.toBeNull();
  });

  it('contextmenu-Ereignis von der Tastatur (ohne Mausposition) auf dem Baum: Menü der Cursorzeile statt „ins Leere“', () => {
    const { host, baum, klick } = strukturAnsicht();
    klick('09 Fotos');
    act(() => baum.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 0 })));
    expect(menue(host)?.getAttribute('aria-label')).toBe('Aktionen für 09 Fotos');
    expect(useOrdner.getState().struktur.ordner).toHaveLength(4);
    expect(host.querySelector('[role="treeitem"][aria-selected="true"]')?.getAttribute('aria-label')).toBe('09 Fotos');
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(menue(host)).toBeNull();
    // Gegenprobe: Rechtsklick mit der Maus ins Leere – Auswahl weg, nur „Ordner anlegen“ und kein loser Trennstrich
    act(() => baum.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 40, clientY: 300 })));
    expect(menue(host)?.getAttribute('aria-label')).toBe('Aktionen');
    expect([...menue(host)!.children].map((c) => c.tagName)).toEqual(['BUTTON', 'BUTTON']);
    expect(eintraege(host).map((b) => b.getAttribute('aria-label'))).toEqual(['Ordner anlegen', 'Mehrere Unterordner anlegen …']);
  });

  it('Trenner nur zwischen Gruppen – nie am Anfang, am Ende oder doppelt', () => {
    const { host, z, klick } = strukturAnsicht();
    klick('05 Protokolle');
    act(() => z('05 Protokolle').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 5, clientY: 5 })));
    const kinder = [...menue(host)!.children];
    expect(kinder[0].tagName).toBe('BUTTON');
    expect(kinder[kinder.length - 1].tagName).toBe('BUTTON');
    expect(kinder.some((c, i) => c.tagName === 'HR' && kinder[i + 1]?.tagName === 'HR')).toBe(false);
    expect(kinder.filter((c) => c.tagName === 'HR').length).toBeGreaterThan(0);
  });

  it('Meldungen: Fehler als Warnung (role=alert), Erfolg als Meldung – über dem Baum, ohne ihn zu verschieben', () => {
    const { host, z, klick, taste, baum } = strukturAnsicht();
    // Fehler: in sich selbst verschieben
    act(() => z('07 Ausschreibung').dispatchEvent(new Event('dragstart', { bubbles: true })));
    act(() => z('07 Ausschreibung/Dach').dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })));
    const fehler = host.querySelector('.po-editor-meldung')!;
    expect(fehler.className).toContain('warning');
    expect(fehler.getAttribute('role')).toBe('alert');
    expect(fehler.textContent).toContain('nicht in sich selbst');
    // die Meldung liegt im Rahmen des Baums (absolut), nicht davor im Fluss
    expect(fehler.parentElement?.className).toBe('po-k-rahmen');
    expect(fehler.previousElementSibling).toBe(baum);
    act(() => knopf(fehler, '×').click());
    expect(host.querySelector('.po-editor-meldung')).toBeNull();
    // Erfolg
    klick('09 Fotos');
    taste(baum, 'c', { ctrlKey: true });
    const ok = host.querySelector('.po-editor-meldung')!;
    expect(ok.className).toContain('po-meldung');
    expect(ok.className).not.toContain('warning');
    expect(ok.getAttribute('role')).toBe('status');
  });

  it('Ziehen: verbotene Ziele werden nicht hervorgehoben und bieten kein Ablegen an; die Stammfläche zeigt die Anzahl', () => {
    const { host, z, klick } = strukturAnsicht();
    klick('07 Ausschreibung');
    act(() => z('09 Fotos').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })));
    act(() => z('07 Ausschreibung').dispatchEvent(new Event('dragstart', { bubbles: true })));
    expect(host.querySelector('.po-k-stamm')?.textContent).toBe('Hierher ziehen: 2 Ordner in den Stamm des Projektordners');
    // in den eigenen Unterordner: verboten
    const verboten = new Event('dragover', { bubbles: true, cancelable: true });
    act(() => z('07 Ausschreibung/Dach').dispatchEvent(verboten));
    expect(verboten.defaultPrevented).toBe(false);
    expect(z('07 Ausschreibung/Dach').className).not.toMatch(/drop-/);
    // Gegenprobe: in einen anderen Ordner erlaubt
    const erlaubt = new Event('dragover', { bubbles: true, cancelable: true });
    act(() => z('05 Protokolle').dispatchEvent(erlaubt));
    expect(erlaubt.defaultPrevented).toBe(true);
    expect(z('05 Protokolle').className).toContain('drop-in');
  });

  it('Werkzeugleiste kurz, „Weitere“ als Menü mit fester Beschriftung „Einfügen“; Seitenleiste ohne doppelte Knopfreihen; kein Kursiv', () => {
    const { host, klick, taste, baum, z } = strukturAnsicht();
    const leiste = host.querySelector('.po-werkzeuge')!;
    expect([...leiste.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      '+ Ordner',
      '+ Unterordner',
      'Mehrere anlegen …',
      'Rückgängig',
      'Wiederholen',
      'LPh-Vorschau',
      'Weitere ▾',
    ]);
    expect(leiste.querySelector('.po-werkzeuge-trenner')).toBeNull();
    klick('09 Fotos');
    act(() => z('05 Protokolle').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })));
    taste(baum, 'c', { ctrlKey: true });
    const weitere = knopf(leiste, 'Weitere');
    expect(weitere.getAttribute('aria-haspopup')).toBe('menu');
    act(() => weitere.click());
    expect(weitere.getAttribute('aria-expanded')).toBe('true');
    const einfuegen = eintraege(host).find((b) => b.getAttribute('aria-label') === 'Einfügen')!;
    expect(einfuegen.querySelector('.po-menue-label')?.textContent).toBe('Einfügen');
    expect(einfuegen.title).toContain('2 kopierte Ordner');
    expect(document.activeElement).toBe(eintraege(host)[0]);
    // Esc schließt, der Fokus kehrt zum Knopf zurück
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(menue(host)).toBeNull();
    expect(document.activeElement).toBe(weitere);
    // Seitenleiste: nur Name, LPh, Dateischema, Löschen
    klick('07 Ausschreibung');
    const seite = host.querySelector('.po-auswahl-panel')!;
    expect(['+ Unterordner', 'Mehrere', 'Duplizieren', 'Als Baustein'].map((t) => knopf(seite, t))).toEqual([undefined, undefined, undefined, undefined]);
    expect(knopf(seite, 'Löschen')).toBeTruthy();
    // oberste Ebene: keine Pfadzeile, die nur die Überschrift wiederholt
    expect(seite.querySelector('.po-k-pfad')).toBeNull();
    klick('07 Ausschreibung/Dach');
    expect(seite.querySelector('.po-k-pfad')?.textContent).toBe('07 Ausschreibung › Dach');
    // Ordner ohne eigene Regel: kein Kursiv mehr, sondern Erklärung im Tooltip
    act(() => useOrdner.setState({ struktur: { ...STANDARD, ordner: [{ pfad: 'A/B' }] } }));
    expect(z('A').className).not.toContain('implizit');
    expect(z('A').title).toContain('ohne eigene Regel');
    // Hilfe unter dem Baum: ein Satz statt Kürzel-Block
    expect(host.querySelector('.po-k-hilfe')?.textContent).toContain('Rechtsklick oder Umschalt+F10');
    expect(host.querySelector('.po-k-hilfe')?.textContent).not.toContain('Strg+C');
  });

  it('LPh-Vorschau als eigener Modus mit „Vorschau beenden“', () => {
    const { host, z } = strukturAnsicht();
    expect(host.querySelector('.po-vorschau-lph')).toBeNull();
    act(() => knopf(host, 'LPh-Vorschau').click());
    const leiste = host.querySelector('.po-vorschau-lph')!;
    expect(leiste.textContent).toContain('Vorschau: Welche Ordner entstehen bei LPh');
    expect(leiste.querySelectorAll('.po-chip.umriss')).toHaveLength(9);
    act(() => leiste.querySelector<HTMLButtonElement>('button[aria-label="Vorschau LPh 4"]')!.click());
    expect(z('07 Ausschreibung').className).toContain('entfaellt');
    expect(leiste.textContent).toContain('2 von 4 Ordnern entstehen');
    act(() => knopf(leiste, 'Vorschau beenden').click());
    expect(host.querySelector('.po-vorschau-lph')).toBeNull();
    expect(z('07 Ausschreibung').className).not.toContain('entfaellt');
  });

  it('Namen im Kopf der Struktur, Platzhalter-Chips nur im Fokus (kompakt); „Vorgabe wiederherstellen …“', () => {
    const { host } = strukturAnsicht();
    const kopf = host.querySelector('.po-struktur-kopf')!;
    expect(kopf.querySelector('.po-schemata')?.textContent).toContain('Namen');
    expect(kopf.querySelectorAll('.po-schemata .po-schemafeld-block.kompakt')).toHaveLength(3);
    expect(host.querySelector('.po-editor-seite .po-schemata')).toBeNull();
    expect(knopf(kopf, 'Vorgabe wiederherstellen').textContent).toBe('Vorgabe wiederherstellen …');
    expect(knopf(kopf, 'Standard')).toBeUndefined();
  });
});

describe('Textansicht der Ordnerliste', () => {
  it('ein Übernahme-Modell: nur über den Knopf, Rückfrage beim Wechsel zum Baum (Abbrechen, Verwerfen, Übernehmen)', async () => {
    const { host } = strukturAnsicht();
    act(() => knopf(host, 'Text (Experte)').click());
    const text = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ordnerliste"]')!;
    eingabe(text, 'A\nB');
    // Verlassen übernimmt nicht
    expect(useOrdner.getState().struktur.ordner).toHaveLength(4);
    expect(host.textContent).toContain('noch nicht übernommen');
    // Baum: Rückfrage – Abbrechen bleibt im Text
    act(() => knopf(host, 'Baum').click());
    await warten();
    const frage = () => host.querySelector('.modal.rf')!;
    expect(frage().textContent).toContain('Geänderte Ordnerliste übernehmen?');
    act(() => knopf(frage(), 'Abbrechen').click());
    await warten();
    expect(host.querySelector('textarea[aria-label="Ordnerliste"]')).not.toBeNull();
    // Verwerfen: zurück zum Baum, Struktur unverändert
    act(() => knopf(host, 'Baum').click());
    await warten();
    act(() => knopf(frage(), 'Verwerfen').click());
    await warten();
    expect(host.querySelector('[role="tree"]')).not.toBeNull();
    expect(useOrdner.getState().struktur.ordner).toHaveLength(4);
    // Übernehmen: ersetzt (mit Sicherung) und wechselt
    act(() => knopf(host, 'Text (Experte)').click());
    eingabe(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ordnerliste"]')!, 'A\nB');
    act(() => knopf(host, 'Baum').click());
    await warten();
    act(() => knopf(frage(), 'Übernehmen').click());
    await warten();
    expect(useOrdner.getState().struktur.ordner.map((o) => o.pfad)).toEqual(['A', 'B']);
    expect(host.querySelector('[role="tree"]')).not.toBeNull();
    const sicherungen = JSON.parse(localStorage.getItem('arch-tools:konfig:projektordner-sicherungen')!).sicherungen;
    expect(sicherungen[0].grund).toBe('vor: Ordnerliste übernommen.');
    expect(sicherungen[0].inhalt.struktur.ordner).toHaveLength(4);
    // Gegenprobe: ohne Änderung wechselt „Baum“ ohne Rückfrage
    act(() => knopf(host, 'Text (Experte)').click());
    act(() => knopf(host, 'Baum').click());
    await warten();
    expect(host.querySelector('.modal.rf')).toBeNull();
    expect(host.querySelector('[role="tree"]')).not.toBeNull();
  });

  it('kommt die Struktur neu herein (neu lesen), bleibt ungespeicherter Text stehen – unveränderter Text folgt', () => {
    const { host } = strukturAnsicht();
    act(() => knopf(host, 'Text (Experte)').click());
    const text = () => host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ordnerliste"]')!;
    // unverändert: folgt dem neuen Stand
    act(() => useOrdner.setState({ struktur: { ...STANDARD, ordner: [{ pfad: 'Vom Server' }] } }));
    expect(text().value).toBe('Vom Server');
    // geändert: bleibt stehen, mit Hinweis
    eingabe(text(), 'Meine Liste');
    act(() => useOrdner.setState({ struktur: { ...STANDARD, ordner: [{ pfad: 'Wieder vom Server' }] } }));
    expect(text().value).toBe('Meine Liste');
    expect(host.querySelector('.po-text-veraltet')?.textContent).toContain('inzwischen geändert');
    // Verwerfen zeigt den neuen Stand
    act(() => knopf(host, 'Verwerfen').click());
    expect(text().value).toBe('Wieder vom Server');
    expect(host.querySelector('.po-text-veraltet')).toBeNull();
  });
});

describe('Vorlagen', () => {
  const vorlagenAnsicht = () => {
    useOrdner.setState({
      struktur: {
        ...STANDARD,
        presets: [
          ...STANDARD.presets,
          {
            name: 'Bauantrag',
            eintraege: [
              { quelle: 'Word/Brief.txt', ziel: '04 Schriftverkehr' },
              { quelle: 'Excel', ziel: '' },
            ],
          },
        ],
      },
      vorlagenName: 'Vorlagen',
      vorlagen: ['Word/Brief.txt', 'Excel/Kosten.csv'].map((pfad) => ({ pfad, lies: async () => strToU8('x') })),
    });
    const host = render();
    act(() => knopf(host, 'Vorlagen').click());
    return host;
  };

  it('Preset-Liste per Tastatur (Knöpfe), zugängliche Namen, „immer“, Platzhalter eingeklappt, Presets oben', () => {
    const host = vorlagenAnsicht();
    const knoepfe = [...host.querySelectorAll<HTMLButtonElement>('.po-presets li button.po-preset-knopf')];
    expect(knoepfe.map((b) => b.querySelector('span')!.textContent)).toEqual(['Alle Vorlagen', 'Bauantrag']);
    expect(knoepfe[0].getAttribute('aria-current')).toBe('true');
    act(() => knoepfe[1].click());
    expect(host.querySelector('.po-presets li button[aria-current="true"]')?.textContent).toContain('Bauantrag');
    expect(host.querySelector('input[aria-label="Pfad im Vorlagenordner (Zuordnung 1)"]')).not.toBeNull();
    const lph = host.querySelector<HTMLInputElement>('input[aria-label="Leistungsphasen (Zuordnung 1) – leer = immer"]')!;
    expect(lph.placeholder).toBe('immer');
    expect(host.querySelector('input[aria-label="Vorlagen durchsuchen"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="„Excel/Kosten.csv“ zuordnen"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="Zuordnung 1 entfernen"]')).not.toBeNull();
    // linke Spalte: Presets vor Vorlagenordner und Platzhaltern; Platzhalter eingeklappt, Schema kompakt
    const links = host.querySelector('.po-vorlagen-links')!;
    expect([...links.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Presets', 'Vorlagenordner und Dateinamen', 'Muster und Platzhalter']);
    const klapp = links.querySelector('details.po-platzhalter-klapp')!;
    expect(klapp.hasAttribute('open')).toBe(false);
    expect(klapp.querySelector('summary')?.textContent).toBe('Platzhalter in Vorlagen anzeigen');
    expect(links.querySelector('.po-schemafeld-block.kompakt')).not.toBeNull();
  });

  it('Zuordnung entfernen mit „Rückgängig“; Preset löschen mit derselben Rückfrage wie Bausteine', async () => {
    const host = vorlagenAnsicht();
    act(() => host.querySelectorAll<HTMLButtonElement>('.po-presets li button')[1].click());
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Zuordnung 1 entfernen"]')!.click());
    const bauantrag = () => useOrdner.getState().struktur.presets.find((p) => p.name === 'Bauantrag')!;
    expect(bauantrag().eintraege.map((e) => e.quelle)).toEqual(['Excel']);
    expect(host.querySelector('.po-rueckgaengig')?.textContent).toContain('Zuordnung „Word/Brief.txt“ entfernt.');
    act(() => knopf(host.querySelector('.po-rueckgaengig')!, 'Rückgängig').click());
    expect(bauantrag().eintraege.map((e) => e.quelle)).toEqual(['Word/Brief.txt', 'Excel']);
    expect(host.querySelector('.po-rueckgaengig')).toBeNull();
    // Preset löschen: Rückfrage, Abbrechen lässt es stehen
    act(() => knopf(host, 'Löschen').click());
    await warten();
    expect(host.querySelector('.modal.rf')?.textContent).toContain('Preset „Bauantrag“ löschen?');
    expect(host.querySelector('.modal.rf')?.textContent).toContain('Seine 2 Zuordnungen entfallen.');
    act(() => knopf(host.querySelector('.modal.rf')!, 'Abbrechen').click());
    await warten();
    expect(useOrdner.getState().struktur.presets).toHaveLength(2);
    act(() => knopf(host, 'Löschen').click());
    await warten();
    act(() => knopf(host.querySelector('.modal.rf')!, 'Löschen').click());
    await warten();
    expect(useOrdner.getState().struktur.presets.map((p) => p.name)).toEqual(['Alle Vorlagen']);
  });
});

describe('Kürzel (Einstellungen)', () => {
  it('ungültiges neues Kürzel bleibt zum Korrigieren stehen – mit Fehlermarke; „LPh“ in der Spalte', () => {
    const host = render();
    act(() => knopf(host, 'Einstellungen').click());
    const bereich = host.querySelector<HTMLElement>('.po-namensschema')!;
    expect([...bereich.querySelectorAll('th')].map((t) => t.textContent)).toContain('LPh');
    expect(bereich.textContent).not.toContain('LPH');
    expect(knopf(bereich, 'Vorgabe wiederherstellen').textContent).toBe('Vorgabe wiederherstellen …');
    const antragsarten = [...bereich.querySelectorAll('.po-kuerzel')].find((k) => k.querySelector('h3')?.textContent === 'Antrags- und Verfahrensarten')!;
    act(() => knopf(antragsarten, '+ Kürzel').click());
    const feld = () => bereich.querySelector<HTMLInputElement>('input[aria-label="Antrags- und Verfahrensarten: Kürzel neues Kürzel"]')!;
    eingabe(feld(), 'baua');
    expect(feld().value).toBe('baua');
    expect(feld().getAttribute('aria-invalid')).toBe('true');
    expect(feld().className).toContain('feld-fehler');
    // Gegenprobe: korrigiert – gespeichert, ohne Fehlermarke
    eingabe(feld(), 'weg');
    const gespeichertes = bereich.querySelector<HTMLInputElement>('input[aria-label="Antrags- und Verfahrensarten: Kürzel WEG"]')!;
    expect(gespeichertes.value).toBe('WEG');
    expect(gespeichertes.getAttribute('aria-invalid')).toBeNull();
    expect(gespeichertes.className).not.toContain('feld-fehler');
    expect(useOrdner.getState().allgemein.namensschema!.antragsarten.map((k) => k.kuerzel)).toContain('WEG');
  });
});
