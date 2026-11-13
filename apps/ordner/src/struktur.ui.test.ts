// @vitest-environment happy-dom
import type { ReactElement } from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';
import { VORGABE_ALLGEMEIN } from '@core/platform/konfig';
import { App } from './App';
import { leereStammdaten } from './stammdaten';
import { useOrdner } from './store';
import { getEntries } from '@core/platform/log';
import { istReserviert, ordnerAusTextMitMeldungen, sichererName, STANDARD } from './struktur';
import { SPERRGRUND, SPERRGRUND_KURZ } from './components/StrukturSperre';
import { schliessenVorbereiten } from '@core/platform/rahmen';

/**
 * Struktur und Vorlagen (Gesamt-Review ATLAS): Kontextmenü per Tastatur, Meldungen, Werkzeugleiste, Ziehen, Textansicht
 * mit einem Übernahme-Modell, Vorlagen und Kürzel – sowie der Store: unlesbare Struktur nicht still überschreiben,
 * unbekannte Felder erhalten; reservierte Windows-Namen.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Eingriff in das Schreiben der Sicherungen (sonst unverändert): warten lassen bzw. scheitern lassen */
const sicherungen_ = vi.hoisted(() => ({ vorher: null as null | (() => Promise<void>), schreiben: 0, scheitern: false }));
vi.mock('@core/platform/konfig', async (original) => {
  const echt = await original<typeof import('@core/platform/konfig')>();
  return {
    ...echt,
    konfigSchreibenWennUnveraendert: async (...a: Parameters<typeof echt.konfigSchreibenWennUnveraendert>) => {
      if (a[0] === 'projektordner') {
        sicherungen_.schreiben++;
        if (sicherungen_.scheitern) throw new Error('Netzlaufwerk getrennt');
      }
      return echt.konfigSchreibenWennUnveraendert(...a);
    },
    konfigAendern: async (...a: Parameters<typeof echt.konfigAendern>) => {
      if (a[0] === 'projektordner-sicherungen' && sicherungen_.vorher) await sicherungen_.vorher();
      return echt.konfigAendern(...a);
    },
  };
});

/** bei vorDemSchliessen angemeldete Funktionen mitschreiben (sonst unverändert), um ihr Ergebnis prüfen zu können */
const vorbereitungen_ = vi.hoisted(() => ({ liste: [] as (() => Promise<void> | void)[] }));
vi.mock('@core/platform/rahmen', async (original) => {
  const echt = await original<typeof import('@core/platform/rahmen')>();
  return {
    ...echt,
    vorDemSchliessen: (f: () => Promise<void> | void) => {
      vorbereitungen_.liste.push(f);
      return echt.vorDemSchliessen(f);
    },
  };
});
const vorbereitungenAusfuehren = async () => {
  await Promise.all(vorbereitungen_.liste.map((f) => f()));
};

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
  sicherungen_.vorher = null;
  sicherungen_.scheitern = false;
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
    strukturRoh: null,
    rueckgaengig: null,
    ordnerAnsicht: 'baum',
    ordnerEntwurf: null,
    geladen: false,
  });
});
afterEach(async () => {
  await act(() => useOrdner.getState().speichernJetzt());
  // ein offenes gemeinsames Menü (globaler Zustand) nicht in den nächsten Test tragen
  if (document.querySelector('.menue')) act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const warten = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
/** Knopf „+ …“: gezeichnetes Plus-Symbol und genau dieser Text */
const plusKnopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text && b.querySelector('svg.symbol')) as HTMLButtonElement;
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
/** das gemeinsame Menü (`@core/ui/Menue`, in der Titelleiste eingehängt) */
const menue = (host: Element) => host.querySelector<HTMLElement>('.menue[role="menu"]');
const eintraege = (host: Element) => [...menue(host)!.querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"]')];
/** Text eines Menüpunkts ohne sein Kürzel */
const name = (b: Element) => b.querySelector('.menue-text')?.textContent;

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
    const meldung = host.querySelector('.po-struktur-kopf .meldung.fehler');
    expect(meldung?.textContent).toContain('lässt sich nicht lesen');
    expect(meldung?.getAttribute('role')).toBe('alert');
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
    expect(name(liste[0])).toBe('Unterordner anlegen');
    // Kürzel stehen sichtbar rechts im Eintrag und werden als aria-keyshortcuts vorgelesen
    const dupl = liste.find((b) => name(b) === 'Duplizieren')!;
    expect(dupl.querySelector('.menue-tasten')?.textContent).toBe('Strg+D');
    expect(dupl.getAttribute('aria-keyshortcuts')).toBe('Control+D');
    const kuerzel = (n: string) => liste.find((b) => name(b) === n)?.getAttribute('aria-keyshortcuts');
    expect(kuerzel('Nach oben')).toBe('Alt+ArrowUp');
    expect(kuerzel('Nach unten')).toBe('Alt+ArrowDown');
    expect(kuerzel('Umbenennen')).toBe('F2');
    expect(kuerzel('Ordner daneben anlegen')).toBe('Control+Shift+N');
    expect(kuerzel('Löschen …')).toBe('Delete');
    // Gegenprobe: ein Eintrag ohne Kürzel hat auch kein aria-keyshortcuts
    expect(liste.find((b) => name(b) === 'Mehrere Unterordner anlegen …')?.hasAttribute('aria-keyshortcuts')).toBe(false);
    // Gefahr-Punkt am Ende, durch einen Trenner abgesetzt
    const kinder = [...menue(host)!.children];
    expect(kinder.at(-1)?.className).toContain('gefahr');
    expect(kinder.at(-2)?.getAttribute('role')).toBe('separator');
    expect(kinder.slice(0, -1).some((k) => k.className.includes('gefahr'))).toBe(false);
    // Pfeil ab/auf (umlaufend), Ende, Pos1 – der Baum dahinter bleibt, wo er war
    taste(document.activeElement!, 'ArrowDown');
    expect(document.activeElement).toBe(liste[1]);
    taste(document.activeElement!, 'ArrowUp');
    taste(document.activeElement!, 'ArrowUp');
    expect(document.activeElement).toBe(liste[liste.length - 1]);
    expect(name(liste[liste.length - 1])).toBe('Löschen …');
    // Löschen als Gefahr-Eintrag; „ …“, weil der Ordner Unterordner hat und deshalb erst eine Rückfrage kommt
    expect(liste[liste.length - 1].className).toContain('gefahr');
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
    const umbenennen = eintraege(host).find((b) => name(b) === 'Umbenennen')!;
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
    expect(eintraege(host).map(name)).toEqual(['Ordner anlegen', 'Mehrere Ordner anlegen …']);
  });

  it('Trenner nur zwischen Gruppen – nie am Anfang, am Ende oder doppelt', () => {
    const { host, z, klick } = strukturAnsicht();
    klick('05 Protokolle');
    act(() => z('05 Protokolle').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 5, clientY: 5 })));
    const kinder = [...menue(host)!.children];
    const trenner = (c: Element | undefined) => c?.getAttribute('role') === 'separator';
    expect(kinder[0].tagName).toBe('BUTTON');
    expect(kinder[kinder.length - 1].tagName).toBe('BUTTON');
    expect(kinder.some((c, i) => trenner(c) && trenner(kinder[i + 1]))).toBe(false);
    expect(kinder.filter((c) => trenner(c)).length).toBeGreaterThan(0);
    // ohne Unterordner sofort gelöscht: „Löschen“ ohne „ …“
    expect(name(kinder[kinder.length - 1])).toBe('Löschen');
  });

  it('Meldungen: Fehler als .meldung.fehler (role=alert), Erfolg als .meldung.ok – über dem Baum, ohne ihn zu verschieben', () => {
    const { host, z, klick, taste, baum } = strukturAnsicht();
    // Fehler: in sich selbst verschieben
    act(() => z('07 Ausschreibung').dispatchEvent(new Event('dragstart', { bubbles: true })));
    act(() => z('07 Ausschreibung/Dach').dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })));
    const fehler = host.querySelector('.po-editor-meldung')!;
    expect(fehler.classList.contains('meldung')).toBe(true);
    expect(fehler.classList.contains('fehler')).toBe(true);
    expect(fehler.getAttribute('role')).toBe('alert');
    expect(fehler.textContent).toContain('nicht in sich selbst');
    // die Meldung liegt im Rahmen des Baums (absolut), nicht davor im Fluss
    expect(fehler.parentElement?.className).toBe('po-k-rahmen');
    expect(fehler.previousElementSibling).toBe(baum);
    const zu = fehler.querySelector<HTMLButtonElement>('button[aria-label="Meldung schließen"]')!;
    expect(zu.querySelector('svg.symbol')).not.toBeNull();
    act(() => zu.click());
    expect(host.querySelector('.po-editor-meldung')).toBeNull();
    // Erfolg
    klick('09 Fotos');
    taste(baum, 'c', { ctrlKey: true });
    const ok = host.querySelector('.po-editor-meldung')!;
    expect(ok.classList.contains('meldung')).toBe(true);
    expect(ok.classList.contains('ok')).toBe(true);
    expect(ok.classList.contains('fehler')).toBe(false);
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
    expect([...leiste.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())).toEqual([
      'Ordner',
      'Unterordner',
      'Mehrere anlegen …',
      'Rückgängig',
      'Wiederholen',
      'LPh-Vorschau',
      'Weitere',
    ]);
    // Symbole statt Schriftzeichen (↶ ↷ ▾ +): gezeichnet, der Name steht im aria-label bzw. im Text
    for (const n of ['Ordner', 'Unterordner']) expect(plusKnopf(leiste, n)).toBeTruthy();
    expect(leiste.textContent).not.toContain('+');
    for (const n of ['Rückgängig', 'Wiederholen']) expect(leiste.querySelector(`button[aria-label="${n}"] svg.symbol`)).not.toBeNull();
    expect(knopf(leiste, 'Weitere').querySelector('svg.symbol')).not.toBeNull();
    expect(leiste.textContent).not.toMatch(/[↶↷▾]/);
    expect(leiste.querySelector('.po-werkzeuge-trenner')).toBeNull();
    klick('09 Fotos');
    act(() => z('05 Protokolle').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })));
    taste(baum, 'c', { ctrlKey: true });
    const weitere = knopf(leiste, 'Weitere');
    expect(weitere.getAttribute('aria-haspopup')).toBe('menu');
    act(() => weitere.click());
    expect(weitere.getAttribute('aria-expanded')).toBe('true');
    expect(menue(host)?.getAttribute('aria-label')).toBe('Weitere Aktionen');
    const einfuegen = eintraege(host).find((b) => name(b) === 'Einfügen')!;
    expect(einfuegen.querySelector('.menue-tasten')?.textContent).toBe('Strg+V');
    expect(einfuegen.getAttribute('aria-keyshortcuts')).toBe('Control+V');
    // „Weitere“ hat keinen Gefahr-Punkt
    expect(menue(host)!.querySelector('.gefahr')).toBeNull();
    expect(einfuegen.title).toContain('2 kopierte Ordner');
    expect(document.activeElement).toBe(eintraege(host)[0]);
    // Esc schließt, der Fokus kehrt zum Knopf zurück
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(menue(host)).toBeNull();
    expect(document.activeElement).toBe(weitere);
    // Seitenleiste: nur Name, LPh, Dateischema, Löschen
    klick('07 Ausschreibung');
    const seite = host.querySelector('.po-auswahl-panel')!;
    expect(['Unterordner', 'Mehrere', 'Duplizieren', 'Als Baustein'].map((t) => knopf(seite, t))).toEqual([undefined, undefined, undefined, undefined]);
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
    act(() => plusKnopf(antragsarten, 'Kürzel').click());
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

describe('Runde 3: Entwurf, Rückfrage, Sicherung, Ziehen, Menüs', () => {
  it('ungespeicherter Text der Textansicht übersteht den Wechsel der App-Ansicht („Vorlagen“ und zurück)', () => {
    const { host } = strukturAnsicht();
    act(() => knopf(host, 'Text (Experte)').click());
    const text = () => host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ordnerliste"]');
    eingabe(text()!, 'Mein Entwurf\nNoch einer');
    act(() => knopf(host, 'Vorlagen').click());
    expect(text()).toBeNull();
    act(() => knopf(host, 'Struktur').click());
    // Textansicht und Entwurf sind noch da, weiterhin nicht übernommen
    expect(text()?.value).toBe('Mein Entwurf\nNoch einer');
    expect(host.textContent).toContain('noch nicht übernommen');
    expect(useOrdner.getState().struktur.ordner).toHaveLength(4);
    // Gegenprobe: verworfen – nach dem Wechsel steht wieder der gespeicherte Stand
    act(() => knopf(host, 'Verwerfen').click());
    act(() => knopf(host, 'Vorlagen').click());
    act(() => knopf(host, 'Struktur').click());
    expect(text()?.value).toBe('05 Protokolle\n07 Ausschreibung | LPh 6-7\n07 Ausschreibung/Dach\n09 Fotos');
    expect(host.textContent).not.toContain('noch nicht übernommen');
  });

  it('Rückfrage beim Wechsel zum Baum: Vorgabe (Fokus, Enter) ist „Übernehmen“, „Verwerfen“ nicht hervorgehoben', async () => {
    const { host } = strukturAnsicht();
    act(() => knopf(host, 'Text (Experte)').click());
    eingabe(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ordnerliste"]')!, 'A');
    act(() => knopf(host, 'Baum').click());
    await warten();
    const frage = host.querySelector('.modal.rf')!;
    expect(document.activeElement?.textContent).toBe('Übernehmen');
    expect(knopf(frage, 'Übernehmen').type).toBe('submit');
    // Gegenprobe: „Verwerfen“ ist weder Vorgabe noch rot
    expect(knopf(frage, 'Verwerfen').type).toBe('button');
    expect(knopf(frage, 'Verwerfen').className).not.toContain('danger');
    act(() => knopf(frage, 'Abbrechen').click());
    await warten();
  });

  it('projektordner.json ist kein JSON-Objekt (Liste): vor dem Ersetzen wird der ganze Inhalt gesichert', async () => {
    const liste = [{ name: 'Fremd' }, 'x'];
    localStorage.setItem(SCHLUESSEL, JSON.stringify(liste));
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    await act(() => useOrdner.getState().konfigLaden());
    expect(useOrdner.getState().strukturFehler).toContain('kein JSON-Objekt');
    await act(() => useOrdner.getState().strukturErsetzen(STANDARD, 'Vorgabe wiederhergestellt.'));
    await act(() => useOrdner.getState().speichernJetzt());
    const sicherungen = JSON.parse(localStorage.getItem('arch-tools:konfig:projektordner-sicherungen')!).sicherungen;
    expect(sicherungen).toHaveLength(1);
    expect(sicherungen[0].inhalt.struktur).toEqual(liste);
    expect(gespeichert().struktur.ordner).toEqual(STANDARD.ordner);
    // Gegenprobe: ein Objekt mit unlesbarer Struktur sichert nur die Struktur, nicht den ganzen Inhalt
    localStorage.clear();
    const kaputt = { name: 'Neuere Fassung', ordner: [{ weg: 'A' }] };
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ struktur: kaputt, vorlagenordner: '/v' }));
    await act(() => useOrdner.getState().konfigLaden());
    expect(useOrdner.getState().strukturFehler).not.toBeNull();
    await act(() => useOrdner.getState().strukturErsetzen(STANDARD, 'Vorgabe wiederhergestellt.'));
    const zweite = JSON.parse(localStorage.getItem('arch-tools:konfig:projektordner-sicherungen')!).sicherungen;
    expect(zweite[0].inhalt).toEqual({ struktur: kaputt, vorlagenordner: '/v' });
  });

  it('Ziehen blendet eine Meldung aus – sie läge über der Ablagefläche „in den Stamm“', () => {
    const { host, z, klick, taste, baum } = strukturAnsicht();
    klick('09 Fotos');
    taste(baum, 'c', { ctrlKey: true });
    expect(host.querySelector('.po-editor-meldung')).not.toBeNull();
    act(() => z('05 Protokolle').dispatchEvent(new Event('dragstart', { bubbles: true })));
    expect(host.querySelector('.po-k-stamm')).not.toBeNull();
    expect(host.querySelector('.po-editor-meldung')).toBeNull();
  });

  it('Aktionen-Knopf an der Zeile ist als Menüknopf ausgezeichnet; „Mehrere Ordner anlegen …“ ohne Auswahl; Strg+Enter sichtbar', () => {
    const { host, z, klick, baum, taste } = strukturAnsicht();
    const punkte = () => z('09 Fotos').querySelector<HTMLButtonElement>('.po-k-aktionen button')!;
    expect(punkte().getAttribute('aria-haspopup')).toBe('menu');
    expect(punkte().getAttribute('aria-label')).toBe('Aktionen für 09 Fotos');
    expect(punkte().querySelector('svg.symbol')).not.toBeNull();
    act(() => punkte().click());
    expect(menue(host)?.getAttribute('aria-label')).toBe('Aktionen für 09 Fotos');
    expect(document.activeElement).toBe(eintraege(host)[0]);
    // Esc schließt nur das Menü; der Fokus kehrt in den Baum zurück
    taste(menue(host)!, 'Escape');
    expect(menue(host)).toBeNull();
    expect(document.activeElement).toBe(baum);
    // ohne Auswahl: „Mehrere Ordner anlegen …“ (im Stamm)
    act(() => baum.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => baum.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 5, clientY: 5 })));
    const labels = eintraege(host).map((b) => b.textContent);
    expect(labels.some((l) => l?.startsWith('Mehrere Ordner anlegen …'))).toBe(true);
    expect(labels.some((l) => l?.startsWith('Mehrere Unterordner'))).toBe(false);
    act(() =>
      eintraege(host)
        .find((b) => b.textContent?.startsWith('Mehrere Ordner anlegen'))!
        .click(),
    );
    expect(host.querySelector('.modal')?.textContent).toContain('Strg+Enter legt an');
    act(() => knopf(host.querySelector('.modal')!, 'Abbrechen').click());
    // Gegenprobe: mit Auswahl heißt es „Mehrere Unterordner anlegen …“
    klick('09 Fotos');
    act(() => z('09 Fotos').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })));
    expect(eintraege(host).some((b) => b.textContent?.startsWith('Mehrere Unterordner anlegen …'))).toBe(true);
  });

  it('Rechtsklick auf eine nicht markierte Zeile gilt nur ihr: „Aktionen für B“, „Löschen“ entfernt nur B; Gegenprobe: Rechtsklick in die Mehrfachauswahl gilt allen', async () => {
    const { host, z, klick } = strukturAnsicht();
    const pfade = () => useOrdner.getState().struktur.ordner.map((o) => o.pfad);
    const rechtsklick = (pfad: string) => act(() => z(pfad).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 5, clientY: 5 })));
    // A markieren, auf B rechtsklicken
    klick('05 Protokolle');
    rechtsklick('09 Fotos');
    expect(menue(host)?.getAttribute('aria-label')).toBe('Aktionen für 09 Fotos');
    expect(z('09 Fotos').getAttribute('aria-selected')).toBe('true');
    expect(z('05 Protokolle').getAttribute('aria-selected')).toBe('false');
    act(() =>
      eintraege(host)
        .find((b) => name(b) === 'Löschen')!
        .click(),
    );
    await warten();
    expect(host.querySelector('.modal.rf')).toBeNull();
    expect(pfade()).toEqual(['05 Protokolle', '07 Ausschreibung', '07 Ausschreibung/Dach']);
    // Gegenprobe: zwei markiert, Rechtsklick auf eine markierte Zeile – das Menü gilt beiden
    klick('05 Protokolle');
    act(() => z('07 Ausschreibung/Dach').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })));
    rechtsklick('07 Ausschreibung/Dach');
    expect(menue(host)?.getAttribute('aria-label')).toBe('Aktionen für 2 Ordner');
    act(() =>
      eintraege(host)
        .find((b) => name(b) === '2 Ordner löschen …')!
        .click(),
    );
    await warten();
    expect(host.querySelector('.modal.rf')?.textContent).toContain('2 Ordner löschen?');
    act(() => knopf(host.querySelector('.modal.rf')!, 'Löschen').click());
    await warten();
    expect(pfade()).toEqual(['07 Ausschreibung']);
  });

  it('Zeilenknopf „Aktionen“: Symbol „mehr“ (nicht der Aufklapp-Pfeil), aria-haspopup, aria-expanded folgt dem Menü – auch bei Esc und einem anderen Menü', async () => {
    const { host, z, baum, taste } = strukturAnsicht();
    const aktionen = (pfad: string) => z(pfad).querySelector<HTMLButtonElement>('.po-k-aktionen button')!;
    const pfad = (b: Element) => b.querySelector('svg.symbol path')?.getAttribute('d');
    // nicht dasselbe Symbol wie der Pfeil zum Auf-/Zuklappen
    const pfeil = z('07 Ausschreibung').querySelector('.po-k-pfeil')!;
    expect(pfad(aktionen('07 Ausschreibung'))).not.toBe(pfad(pfeil));
    expect(pfad(aktionen('07 Ausschreibung'))).toMatch(/^M5 13a1/);
    expect(aktionen('07 Ausschreibung').getAttribute('aria-haspopup')).toBe('menu');
    const nachlaufen = () => act(async () => {});
    expect(aktionen('09 Fotos').getAttribute('aria-expanded')).toBe('false');
    act(() => aktionen('09 Fotos').click());
    await nachlaufen();
    expect(menue(host)?.getAttribute('aria-label')).toBe('Aktionen für 09 Fotos');
    expect(aktionen('09 Fotos').getAttribute('aria-expanded')).toBe('true');
    expect(aktionen('05 Protokolle').getAttribute('aria-expanded')).toBe('false');
    // Esc schließt: wieder zu
    taste(menue(host)!, 'Escape');
    await nachlaufen();
    expect(menue(host)).toBeNull();
    expect(aktionen('09 Fotos').getAttribute('aria-expanded')).toBe('false');
    // der Fokus landet über den Knopf wieder im Baum (dort wirken die Pfeiltasten)
    expect(document.activeElement).toBe(baum);
    // ein anderes Menü (Rechtsklick auf eine andere Zeile) löst das Zeilenmenü ab
    act(() => aktionen('09 Fotos').click());
    await nachlaufen();
    expect(aktionen('09 Fotos').getAttribute('aria-expanded')).toBe('true');
    act(() => z('05 Protokolle').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 5, clientY: 5 })));
    await nachlaufen();
    expect(menue(host)?.getAttribute('aria-label')).toBe('Aktionen für 05 Protokolle');
    expect(aktionen('09 Fotos').getAttribute('aria-expanded')).toBe('false');
    // Auswahl eines Punkts schließt ebenfalls
    act(() => aktionen('09 Fotos').click());
    await nachlaufen();
    act(() =>
      eintraege(host)
        .find((b) => name(b) === 'Kopieren')!
        .click(),
    );
    await nachlaufen();
    expect(menue(host)).toBeNull();
    expect(aktionen('09 Fotos').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(baum);
  });

  it('reservierte Namen auch mit Leerzeichen vor der Endung („AUX .txt“)', () => {
    expect(istReserviert('AUX .txt')).toBe(true);
    expect(sichererName('AUX .txt')).toBe('AUX_.txt');
    expect(sichererName('con  .docx')).toBe('con_.docx');
    // Gegenprobe: ein Wort nach dem Leerzeichen macht den Namen frei
    expect(istReserviert('AUX Plan.txt')).toBe(false);
    expect(sichererName('AUX Plan.txt')).toBe('AUX Plan.txt');
  });
});

describe('Folgerunde: unlesbare Struktur sperrt die Bearbeitung', () => {
  const kaputt = { name: 'Neuere Fassung', ordner: [{ weg: 'A', regeln: { lph: 5 } }] };
  const unlesbarLaden = async () => {
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ struktur: kaputt, vorlagenordner: '/v' }));
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    await act(() => useOrdner.getState().konfigLaden());
    expect(useOrdner.getState().strukturFehler).not.toBeNull();
  };
  const sicherungen = () => JSON.parse(localStorage.getItem('arch-tools:konfig:projektordner-sicherungen') ?? '{"sicherungen":[]}').sicherungen;

  /** echt gesperrt: selbst `disabled` oder in einem gesperrten `<fieldset>` */
  const istGesperrt = (el: Element) => (el as HTMLButtonElement).disabled === true || !!el.closest('fieldset[disabled]');

  it('Struktur: nur lesen – Felder und Knöpfe echt gesperrt (kein inert), Baum bleibt bedienbar; „Angezeigte Struktur übernehmen …“ sichert und hebt die Sperre auf', async () => {
    await unlesbarLaden();
    const host = render();
    act(() => knopf(host, 'Struktur').click());
    await warten();
    const sperre = host.querySelector('.po-struktur-fehler')!;
    expect(sperre.getAttribute('role')).toBe('alert');
    expect(sperre.textContent).toContain('Bearbeiten ist gesperrt');
    // nichts verborgen oder abgeschwächt: kein inert, keine Hülle mit Deckkraft
    expect(host.querySelector('[inert]')).toBeNull();
    // Name und Namensschemata: in einem gesperrten fieldset, der Grund im Tooltip
    const nameFeld = host.querySelector('.po-struktur-titel .field input')!;
    expect(istGesperrt(nameFeld)).toBe(true);
    expect(nameFeld.closest('fieldset')!.title).toBe(SPERRGRUND);
    for (const f of host.querySelectorAll('.po-schemata input')) expect(istGesperrt(f)).toBe(true);
    // Werkzeugleiste: Ändern gesperrt mit Grund; LPh-Vorschau und „Weitere“ bleiben
    const leiste = host.querySelector('.po-werkzeuge')!;
    for (const k of [plusKnopf(leiste, 'Ordner'), plusKnopf(leiste, 'Unterordner'), knopf(leiste, 'Mehrere anlegen'), leiste.querySelector<HTMLButtonElement>('[aria-label="Rückgängig"]')!]) {
      expect(k.disabled).toBe(true);
      expect(k.title).toBe(SPERRGRUND);
    }
    expect(knopf(leiste, 'LPh-Vorschau').disabled).toBe(false);
    expect(knopf(leiste, 'Weitere').disabled).toBe(false);
    // Baum: fokussierbar, Pfeiltasten und Auswahl wie gewohnt; nicht ziehbar
    const baum = host.querySelector<HTMLElement>('[role="tree"]')!;
    expect(baum.tabIndex).toBe(0);
    const taste = (key: string, mod: KeyboardEventInit = {}) => act(() => baum.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mod })));
    taste('ArrowDown');
    taste('ArrowDown');
    const zweite = host.querySelectorAll<HTMLElement>('[role="treeitem"]')[1];
    expect(baum.getAttribute('aria-activedescendant')).toBe(zweite.id);
    expect(zweite.getAttribute('aria-selected')).toBe('true');
    expect(zweite.getAttribute('draggable')).toBe('false');
    // Seitenleiste zur Auswahl: Name, LPh, Dateischema, Löschen gesperrt
    const seite = host.querySelector('.po-auswahl-panel')!;
    expect(seite.querySelector('h3')?.textContent).toBe(zweite.querySelector('.po-k-name')?.textContent);
    for (const el of seite.querySelectorAll('input, button')) expect(istGesperrt(el)).toBe(true);
    for (const el of host.querySelectorAll('.po-bausteine button')) expect(istGesperrt(el)).toBe(true);
    // F2, Entf und Doppelklick ändern nichts, sondern nennen den Grund
    const vorher = JSON.stringify(useOrdner.getState().struktur.ordner);
    taste('F2');
    expect(host.querySelector('.po-k-eingabe')).toBeNull();
    expect(host.querySelector('.po-editor-meldung.fehler')?.textContent).toContain(SPERRGRUND);
    taste('Delete');
    taste('n', { ctrlKey: true });
    act(() => zweite.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(host.querySelector('.po-k-eingabe')).toBeNull();
    expect(host.querySelector('.modal.rf')).toBeNull();
    expect(JSON.stringify(useOrdner.getState().struktur.ordner)).toBe(vorher);
    // Kontextmenü: Punkte sichtbar, aber gesperrt mit Grund im Hinweis – nur Kopieren bleibt
    act(() => zweite.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 5, clientY: 5 })));
    const punkte = eintraege(host);
    const kopieren = punkte.find((b) => name(b) === 'Kopieren')!;
    expect(kopieren.getAttribute('aria-disabled')).toBeNull();
    const loeschen = punkte.find((b) => name(b)?.startsWith('Löschen'))!;
    expect(loeschen.getAttribute('aria-disabled')).toBe('true');
    expect(loeschen.querySelector('.menue-hinweis')?.textContent).toBe(SPERRGRUND_KURZ);
    expect(punkte.filter((b) => b !== kopieren).every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
    act(() => loeschen.click());
    expect(menue(host)).not.toBeNull();
    expect(JSON.stringify(useOrdner.getState().struktur.ordner)).toBe(vorher);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    // Textansicht: lesbar, aber schreibgeschützt; „Ordnerliste übernehmen“ gesperrt
    act(() => knopf(host, 'Text (Experte)').click());
    const text = host.querySelector<HTMLTextAreaElement>('textarea.po-ordnertext')!;
    expect(text.readOnly).toBe(true);
    expect(text.value).toContain('00 Projekt');
    expect(knopf(host, 'Ordnerliste übernehmen').disabled).toBe(true);
    act(() => knopf(host, 'Baum').click());
    await warten();
    // auch der Store nimmt keine Bearbeitung an
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Versehentlich' }));
    expect(useOrdner.getState().struktur.name).toBe(STANDARD.name);
    // Laden, Sicherungen und Vorgabe bleiben bedienbar
    expect(istGesperrt(knopf(host, 'Struktur laden'))).toBe(false);
    expect(istGesperrt(knopf(host, 'Vorgabe wiederherstellen'))).toBe(false);
    // übernehmen: Rückfrage – Abbrechen lässt alles, wie es ist
    act(() => knopf(sperre, 'Angezeigte Struktur übernehmen').click());
    await warten();
    expect(host.querySelector('.modal.rf')!.textContent).toContain('ersetzt die nicht lesbare Struktur');
    act(() => knopf(host.querySelector('.modal.rf')!, 'Abbrechen').click());
    await warten();
    expect(useOrdner.getState().strukturFehler).not.toBeNull();
    expect(sicherungen()).toHaveLength(0);
    act(() => knopf(host.querySelector('.po-struktur-fehler')!, 'Angezeigte Struktur übernehmen').click());
    await warten();
    act(() => knopf(host.querySelector('.modal.rf')!, 'Übernehmen').click());
    await warten();
    await act(() => useOrdner.getState().speichernJetzt());
    expect(useOrdner.getState().strukturFehler).toBeNull();
    expect(sicherungen()[0].inhalt).toEqual({ struktur: kaputt, vorlagenordner: '/v' });
    expect(gespeichert().struktur.ordner).toEqual(STANDARD.ordner);
    // Gegenprobe: ohne Fehler keine Sperre, kein Angebot, alles bedienbar
    expect(host.querySelector('.po-struktur-fehler')).toBeNull();
    expect(host.querySelector('fieldset[disabled]')).toBeNull();
    expect(plusKnopf(host.querySelector('.po-werkzeuge')!, 'Ordner').disabled).toBe(false);
    expect(plusKnopf(host.querySelector('.po-werkzeuge')!, 'Ordner').title).toBe('Ordner im Stamm anlegen');
    expect(host.querySelector('[role="treeitem"]')!.getAttribute('draggable')).toBe('true');
  });

  it('„Angezeigte Struktur übernehmen“ scheitert: Fehler als .meldung.fehler (role=alert) neben dem Hinweis; Gegenprobe ohne Fehler', async () => {
    await unlesbarLaden();
    const echt = useOrdner.getState().strukturErsetzen;
    useOrdner.setState({ strukturErsetzen: async () => Promise.reject(new Error('Kein Schreibrecht im Konfigurationsordner')) });
    const host = render();
    act(() => knopf(host, 'Struktur').click());
    await warten();
    act(() => knopf(host.querySelector('.po-struktur-fehler')!, 'Angezeigte Struktur übernehmen').click());
    await warten();
    act(() => knopf(host.querySelector('.modal.rf')!, 'Übernehmen').click());
    await warten();
    const fehler = host.querySelector('.po-struktur-kopf p.meldung.fehler')!;
    expect(fehler.getAttribute('role')).toBe('alert');
    expect(fehler.textContent).toBe('Kein Schreibrecht im Konfigurationsordner');
    // nicht in der Live-Region des Hinweises verschachtelt
    expect(fehler.closest('.po-struktur-fehler')).toBeNull();
    // Gegenprobe: gelingt es, verschwinden Hinweis und Fehler
    useOrdner.setState({ strukturErsetzen: echt });
    act(() => knopf(host.querySelector('.po-struktur-fehler')!, 'Angezeigte Struktur übernehmen').click());
    await warten();
    act(() => knopf(host.querySelector('.modal.rf')!, 'Übernehmen').click());
    await warten();
    expect(host.querySelector('.po-struktur-fehler')).toBeNull();
    expect(host.querySelector('.meldung.fehler')).toBeNull();
  });

  it('Vorlagen: nur lesen – „Preset“, Dateinamen und das gewählte Preset echt gesperrt (kein inert), das Preset bleibt sichtbar; Gegenprobe ohne Fehler', async () => {
    await unlesbarLaden();
    const host = render();
    act(() => knopf(host, 'Vorlagen').click());
    await warten();
    expect(host.querySelector('.po-struktur-fehler')?.textContent).toContain('Angezeigte Struktur übernehmen');
    expect(host.querySelector('[inert]')).toBeNull();
    expect(plusKnopf(host, 'Preset').disabled).toBe(true);
    expect(plusKnopf(host, 'Preset').title).toBe(SPERRGRUND);
    expect(knopf(host, 'Duplizieren').disabled).toBe(true);
    // Dateinamen links
    expect(istGesperrt(host.querySelector('input[aria-label="Dateinamen im Projekt"]')!)).toBe(true);
    // rechts das gewählte Preset: sichtbar, Felder gesperrt
    const preset = host.querySelector('section.po-preset')!;
    expect(preset.querySelector('h2')?.textContent).toContain('Preset');
    const felder = [...preset.querySelectorAll('input:not([type="search"])')];
    expect(felder.length).toBeGreaterThan(2);
    for (const f of felder) expect(istGesperrt(f)).toBe(true);
    for (const b of preset.querySelectorAll('.po-zuordnungen .po-z-kopf button')) expect(istGesperrt(b)).toBe(true);
    // Presets links bleiben wählbar (lesen)
    expect(knopf(host.querySelector('.po-presets')!, STANDARD.presets[0].name).disabled).toBe(false);
    act(() => useOrdner.setState({ strukturFehler: null }));
    expect(plusKnopf(host, 'Preset').disabled).toBe(false);
    expect(host.querySelector('fieldset[disabled]')).toBeNull();
    expect(istGesperrt(host.querySelector('input[aria-label="Dateinamen im Projekt"]')!)).toBe(false);
  });

  it('„Rückgängig“ nach „Neu laden“ einer unlesbaren fremden Fassung: läuft über strukturErsetzen – sichert sie und hebt die Sperre auf', async () => {
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    await act(() => useOrdner.getState().konfigLaden());
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Meine' }));
    await act(() => useOrdner.getState().speichernJetzt());
    // ein anderer Rechner schreibt eine Struktur, die diese Fassung nicht lesen kann
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ struktur: kaputt, vorlagenordner: '' }));
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Meine 2' }));
    await act(() => useOrdner.getState().speichernJetzt());
    expect(useOrdner.getState().konflikt).not.toBeNull();
    await act(() => useOrdner.getState().konfliktLoesen('neu-laden'));
    expect(useOrdner.getState().strukturFehler).not.toBeNull();
    expect(useOrdner.getState().rueckgaengig).not.toBeNull();
    await act(() => useOrdner.getState().strukturRueckgaengig());
    await act(() => useOrdner.getState().speichernJetzt());
    expect(useOrdner.getState().strukturFehler).toBeNull();
    expect(useOrdner.getState().struktur.name).toBe('Meine 2');
    expect(gespeichert().struktur.name).toBe('Meine 2');
    expect(sicherungen()[0].inhalt.struktur).toEqual(kaputt);
    expect(sicherungen()[0].grund).toContain('Rückgängig');
  });

  it('„Meine Fassung trotzdem speichern“ sichert auch eine unlesbare fremde Fassung; ist die Datei kein JSON-Objekt, den ganzen Inhalt', async () => {
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    await act(() => useOrdner.getState().konfigLaden());
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ struktur: kaputt, vorlagenordner: '/fremd' }));
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Meine' }));
    await act(() => useOrdner.getState().speichernJetzt());
    await act(() => useOrdner.getState().konfliktLoesen('meine'));
    expect(sicherungen()[0].inhalt).toEqual({ struktur: kaputt, vorlagenordner: '/fremd' });
    expect(gespeichert().struktur.name).toBe('Meine');
    // kein JSON-Objekt: der ganze Inhalt
    localStorage.setItem(SCHLUESSEL, JSON.stringify(['x']));
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Meine 2' }));
    await act(() => useOrdner.getState().speichernJetzt());
    await act(() => useOrdner.getState().konfliktLoesen('meine'));
    expect(sicherungen()[0].inhalt.struktur).toEqual({ inhalt: ['x'] });
    expect(gespeichert().struktur.name).toBe('Meine 2');
  });
});

describe('Folgerunde: Kleinkram', () => {
  it('„Einstellungen nicht gespeichert“ entfällt nach dem nächsten gelungenen Speichern; andere Meldungen bleiben', async () => {
    useOrdner.setState({ konfigFehler: 'Einstellungen nicht gespeichert: Netzlaufwerk weg' });
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Neu' }));
    await act(() => useOrdner.getState().speichernJetzt());
    expect(useOrdner.getState().konfigFehler).toBeNull();
    // Gegenprobe: eine Lesemeldung bleibt stehen
    useOrdner.setState({ konfigFehler: 'Einstellungen nicht lesbar: kaputt' });
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Neu 2' }));
    await act(() => useOrdner.getState().speichernJetzt());
    expect(useOrdner.getState().konfigFehler).toBe('Einstellungen nicht lesbar: kaputt');
  });

  it('Textansicht: ein Entwurf, der inzwischen der Struktur entspricht, ist erledigt (kein Phantom-Entwurf); Gegenprobe', () => {
    const ordner = [{ pfad: 'A' }, { pfad: 'B' }];
    useOrdner.setState({ struktur: { ...STANDARD, ordner }, ordnerEntwurf: { text: 'A\nB\nC', basis: 'A\nB' } });
    // die Struktur ändert sich anderswo, aber nicht zum Entwurf: er bleibt
    act(() => useOrdner.setState({ struktur: { ...STANDARD, ordner: [{ pfad: 'A' }] } }));
    expect(useOrdner.getState().ordnerEntwurf?.text).toBe('A\nB\nC');
    // die Struktur wird (z. B. über einen anderen Rechner) genau zum Entwurf: kein Entwurf mehr
    act(() => useOrdner.setState({ struktur: { ...STANDARD, ordner: [...ordner, { pfad: 'C' }] } }));
    expect(useOrdner.getState().ordnerEntwurf).toBeNull();
  });

  it('Textansicht: leere Liste wird nicht übernommen – die Meldung nennt den Unterschied zum Baum', async () => {
    const { host } = strukturAnsicht();
    act(() => knopf(host, 'Text (Experte)').click());
    eingabe(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ordnerliste"]')!, '   ');
    await act(async () => knopf(host, 'Ordnerliste übernehmen').click());
    expect(host.textContent).toContain('Eine leere Liste übernimmt die Textansicht nicht; alle Ordner löschen geht im Baum.');
    expect(useOrdner.getState().struktur.ordner).toHaveLength(4);
  });

  it('Vorlagen: „Rückgängig“ einer entfernten Zuordnung findet das Preset über seine Stelle, nicht den (doppelten) Namen', () => {
    const doppelt = [
      { name: 'Bauantrag', eintraege: [{ quelle: 'Erstes.txt', ziel: '' }] },
      {
        name: 'Bauantrag',
        eintraege: [
          { quelle: 'Zweites.txt', ziel: '' },
          { quelle: 'Drittes.txt', ziel: '' },
        ],
      },
    ];
    useOrdner.setState({ struktur: { ...STANDARD, presets: doppelt } });
    const host = render();
    act(() => knopf(host, 'Vorlagen').click());
    act(() => host.querySelectorAll<HTMLButtonElement>('.po-presets li button')[1].click());
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Zuordnung 1 entfernen"]')!.click());
    expect(host.querySelector('.po-rueckgaengig')).not.toBeNull();
    // das zweite Preset verschwindet von außen (anderer Rechner): die Auswahl rückt auf das erste gleichnamige
    act(() => useOrdner.setState({ struktur: { ...STANDARD, presets: [doppelt[0]] } }));
    expect(host.querySelector('.po-rueckgaengig')).toBeNull();
    expect(useOrdner.getState().struktur.presets[0].eintraege.map((e) => e.quelle)).toEqual(['Erstes.txt']);
  });
});

describe('Nachbesserung: Konflikt lösen ohne Rennen', () => {
  const sicherungenListe = () => JSON.parse(localStorage.getItem('arch-tools:konfig:projektordner-sicherungen') ?? '{"sicherungen":[]}').sicherungen as unknown[];
  /** eigene Änderung, während ein anderer Rechner geschrieben hat: Konflikt */
  const konfliktHerstellen = async () => {
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    await act(() => useOrdner.getState().konfigLaden());
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ struktur: { ...STANDARD, name: 'Fremd' }, vorlagenordner: '' }));
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Meine' }));
    await act(() => useOrdner.getState().speichernJetzt());
    expect(useOrdner.getState().konflikt).not.toBeNull();
  };
  const tor = () => {
    let auf!: () => void;
    const p = new Promise<void>((r) => (auf = r));
    sicherungen_.vorher = () => p;
    return auf;
  };

  it('Doppelklick auf „Meine Fassung trotzdem speichern“: eine Sicherung, Knöpfe gesperrt, solange es läuft', async () => {
    // erst die App (sie lädt beim Start die Einstellungen), dann der Konflikt
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    const host = render();
    await warten();
    await konfliktHerstellen();
    await warten();
    const auf = tor();
    const meine = () => knopf(host.querySelector('.po-konflikt')!, 'Meine Fassung');
    // Gegenprobe vorher: kein „Speichert …“
    expect(host.querySelector('.po-konflikt')!.textContent).not.toContain('Speichert …');
    act(() => meine().click());
    await warten();
    expect(meine().disabled).toBe(true);
    expect(knopf(host.querySelector('.po-konflikt')!, 'Neu laden').disabled).toBe(true);
    expect(host.querySelector('.po-konflikt')!.textContent).toContain('Speichert …');
    // zweiter Aufruf (wie ein Doppelklick an der Sperre vorbei) tut nichts
    await act(() => useOrdner.getState().konfliktLoesen('meine'));
    auf();
    await warten();
    await warten();
    expect(sicherungenListe()).toHaveLength(1);
    expect(gespeichert().struktur.name).toBe('Meine');
    expect(host.querySelector('.po-konflikt')).toBeNull();
    expect(useOrdner.getState().konfliktLaeuft).toBe(false);
  });

  it('„Neu laden“ während des Sicherns: die eigene Fassung überschreibt danach nichts; Gegenprobe ohne Dazwischenkommen', async () => {
    await konfliktHerstellen();
    const start = Date.now();
    const auf = tor();
    let fertig!: Promise<void>;
    act(() => {
      fertig = useOrdner.getState().konfliktLoesen('meine');
    });
    await act(() => useOrdner.getState().konfliktLoesen('neu-laden'));
    auf();
    await act(() => fertig);
    await act(() => useOrdner.getState().speichernJetzt());
    expect(useOrdner.getState().struktur.name).toBe('Fremd');
    expect(gespeichert().struktur.name).toBe('Fremd');
    expect(getEntries().some((e) => e.message.startsWith('Konflikt in projektordner.json: eigene Fassung gespeichert') && e.time.getTime() >= start)).toBe(false);
    // Gegenprobe: ohne „Neu laden“ wird die eigene Fassung gespeichert und protokolliert
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Meine 2' }));
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ struktur: { ...STANDARD, name: 'Wieder fremd' }, vorlagenordner: '' }));
    await act(() => useOrdner.getState().speichernJetzt());
    await act(() => useOrdner.getState().konfliktLoesen('meine'));
    expect(gespeichert().struktur.name).toBe('Meine 2');
    expect(getEntries().some((e) => e.message.startsWith('Konflikt in projektordner.json: eigene Fassung gespeichert') && e.time.getTime() >= start)).toBe(true);
  });

  it('Sicherung scheitert: Datei unverändert, Konflikt bleibt, Meldung erscheint', async () => {
    // erst die App (sie lädt beim Start die Einstellungen), dann der Konflikt
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    const host = render();
    await warten();
    await konfliktHerstellen();
    await warten();
    sicherungen_.vorher = async () => {
      throw new Error('Netzlaufwerk weg');
    };
    act(() => knopf(host.querySelector('.po-konflikt')!, 'Meine Fassung').click());
    await warten();
    await warten();
    expect(gespeichert().struktur.name).toBe('Fremd');
    expect(useOrdner.getState().konflikt).not.toBeNull();
    expect(host.querySelector('.po-konflikt')).not.toBeNull();
    const frage = host.querySelector('.modal.rf')!;
    expect(frage.textContent).toContain('Nicht gespeichert');
    expect(frage.textContent).toContain('Die Fassung des anderen Rechners ließ sich nicht sichern – nichts wurde gespeichert.');
    // die Knöpfe sind wieder frei
    expect(knopf(host.querySelector('.po-konflikt')!, 'Meine Fassung').disabled).toBe(false);
    act(() => knopf(frage, 'OK').click());
    await warten();
  });
});

describe('Nachbesserung: Vorlagenordner bei unlesbarer Struktur gesperrt', () => {
  it('VorlagenordnerZeile (in „Vorlagen“, dieselbe im Assistenten): „Wählen …“ gesperrt mit Hinweis, der Store weist ab; Gegenprobe ohne Fehler', async () => {
    useOrdner.setState({ vorlagenordner: '/v', strukturFehler: 'Die Struktur lässt sich nicht lesen.' });
    act(() => useOrdner.getState().setVorlagenordner('/anders'));
    expect(useOrdner.getState().vorlagenordner).toBe('/v');
    const host = render();
    act(() => knopf(host, 'Vorlagen').click());
    const zeile = () => host.querySelector('.po-ort')!.parentElement!;
    expect(knopf(zeile(), 'Wählen').disabled).toBe(true);
    expect(host.querySelector('.po-vorlagenordner-gesperrt')?.textContent).toContain('erst wieder ändern, wenn die Bürostruktur lesbar ist');
    // Gegenprobe
    act(() => useOrdner.setState({ strukturFehler: null }));
    expect(knopf(zeile(), 'Wählen').disabled).toBe(false);
    expect(host.querySelector('.po-vorlagenordner-gesperrt')).toBeNull();
    act(() => useOrdner.getState().setVorlagenordner('/anders'));
    expect(useOrdner.getState().vorlagenordner).toBe('/anders');
  });
});

describe('Vor dem Schließen (Rahmen): verzögertes Schreiben nicht verlieren', () => {
  it('schliessenVorbereiten schreibt eine noch wartende Strukturänderung sofort – auch zweimal hintereinander nur einmal', async () => {
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    await act(() => useOrdner.getState().konfigLaden());
    sicherungen_.schreiben = 0;
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Vor dem Schließen' }));
    // noch entprellt: nichts geschrieben
    expect(gespeichert().struktur.name).not.toBe('Vor dem Schließen');
    // zweimal (etwa nach „Weiter warten“), ohne die Wartezeit abzuwarten
    const [a, b] = await Promise.all([schliessenVorbereiten(), schliessenVorbereiten()]);
    expect([a, b]).toEqual([true, true]);
    expect(gespeichert().struktur.name).toBe('Vor dem Schließen');
    expect(sicherungen_.schreiben).toBe(1);
  });

  it('Gegenprobe: bei einem Konflikt mit einem anderen Rechner schreibt auch das Schließen nichts (ATLAS fragt vorher)', async () => {
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    await act(() => useOrdner.getState().konfigLaden());
    act(() => useOrdner.setState({ konflikt: { roh: { struktur: { name: 'Fremd', ordner: [] } } } }));
    sicherungen_.schreiben = 0;
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Trotz Konflikt' }));
    expect(await schliessenVorbereiten()).toBe(true);
    expect(sicherungen_.schreiben).toBe(0);
    expect(gespeichert().struktur.name).not.toBe('Trotz Konflikt');
  });

  it('scheitert das letzte Schreiben, meldet die Vorbereitung den Fehler an den Rahmen weiter (statt ihn zu schlucken)', async () => {
    useOrdner.setState({ konfigLaden: echtesKonfigLaden });
    await act(() => useOrdner.getState().konfigLaden());
    sicherungen_.scheitern = true;
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Laufwerk weg' }));
    await expect(vorbereitungenAusfuehren()).rejects.toThrow('Struktur nicht gespeichert');
    // Gegenprobe: Laufwerk wieder da → kein Fehler, gespeichert
    sicherungen_.scheitern = false;
    act(() => useOrdner.getState().setStruktur({ ...useOrdner.getState().struktur, name: 'Laufwerk da' }));
    await expect(vorbereitungenAusfuehren()).resolves.toBeUndefined();
    expect(gespeichert().struktur.name).toBe('Laufwerk da');
  });
});
