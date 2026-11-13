// @vitest-environment happy-dom
import type { ReactElement } from 'react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'fflate';
import { VORGABE_ALLGEMEIN } from '@core/platform/konfig';
import { App } from './App';
import { AssistentView } from './components/AssistentView';
import { SchemaFeld } from './components/SchemaFeld';
import { SpeicherDateisystem } from './dateisystem';
import { PLATZHALTER_PROJEKT } from './nummer';
import { ausfuehren, planen } from './plan';
import { leereStammdaten } from './stammdaten';
import { NICHT_GESPEICHERT, useOrdner } from './store';
import { ordnerAlsText, STANDARD } from './struktur';

/**
 * Assistent (Runde 1 des Gesamt-Reviews): Ansichtswechsel, Fokusführung, Schrittleiste, Anlegen in der Navigation,
 * nicht lesbare Projektdatei, Gleichzeitigkeit. Für den Desktop ersetzt ein Dateisystem im Speicher das von Tauri.
 */

const mock = vi.hoisted(() => ({ desktop: false, fs: null as unknown as SpeicherDateisystem }));
vi.mock('./dateisystem', async (original) => {
  const echt = await original<typeof import('./dateisystem')>();
  // jede Methode geht an das Dateisystem des jeweiligen Tests
  const tauriDateisystem = new Proxy({} as typeof echt.tauriDateisystem, { get: (_, k) => (mock.fs as unknown as Record<string | symbol, (...a: unknown[]) => unknown>)[k].bind(mock.fs) });
  return { ...echt, hatDateisystem: () => mock.desktop, tauriDateisystem };
});

/** Sicherungen der Struktur scheitern lassen (sonst unverändert) */
const konfigMock = vi.hoisted(() => ({ sicherungScheitert: false }));
vi.mock('@core/platform/konfig', async (original) => {
  const echt = await original<typeof import('@core/platform/konfig')>();
  return {
    ...echt,
    konfigAendern: async (...a: Parameters<typeof echt.konfigAendern>) => {
      if (a[0] === 'projektordner-sicherungen' && konfigMock.sicherungScheitert) throw new Error('Laufwerk nicht erreichbar');
      return echt.konfigAendern(...a);
    },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  mock.desktop = false;
  mock.fs = new SpeicherDateisystem();
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
    rueckgaengig: null,
  });
});
afterEach(async () => {
  await act(() => useOrdner.getState().speichernJetzt());
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
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const feld = (host: Element, label: string) =>
  [...host.querySelectorAll('label.field')].find((l) => l.querySelector('.field-label')?.textContent?.replace(/\s*\*$/, '') === label)!.querySelector('input') as HTMLInputElement;
const warten = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
/** Nummer des Schritts bzw. „✓“ für das gezeichnete Häkchen (Symbol statt Schriftzeichen) */
const schrittNr = (host: Element) => [...host.querySelectorAll('.po-schritte .po-schritt-nr')].map((s) => (s.querySelector('svg.symbol') ? '✓' : s.textContent));
const assistent = (host: Element) => host.querySelector('.po-assistent-huelle') as HTMLElement;

/** Desktop mit Stammordner (ohne gemeinsame Projektübersicht, also mit der Projektliste des Assistenten) */
async function desktopMitProjekt() {
  mock.desktop = true;
  await ausfuehren(mock.fs, 'P:/Projekte', planen({ ...leereStammdaten(), nummer: '2025-007', kurzname: 'Kita', leistungsphasen: [1, 2] }, STANDARD, [], [], new Date(2025, 4, 1)));
  await mock.fs.ordnerAnlegen('P:/Projekte', '2024-001 Altbau');
  useOrdner.setState({ stammordner: 'P:/Projekte' });
}

describe('Assistent: Ansichtswechsel', () => {
  it('neues Projekt: nach „Struktur“ und zurück stehen Schritt und Eingaben noch da (Pflicht 1)', async () => {
    const host = render();
    act(() => knopf(host, 'Neues Projekt').click());
    eingabe(feld(host, 'Projektnummer'), '2026-014');
    eingabe(feld(host, 'Kurzname'), 'EFH Musterweg');
    act(() => knopf(host, 'Weiter:').click());
    act(() => knopf(host, 'Weiter:').click());
    expect(host.querySelector('.po-assistent h2')?.textContent).toBe('Bauherr');
    act(() => knopf(host, 'Struktur').click());
    // ausgeblendet, nicht abgebaut
    expect(assistent(host).hidden).toBe(true);
    act(() => knopf(host, 'Assistent').click());
    expect(assistent(host).hidden).toBe(false);
    expect(host.querySelector('.po-assistent h2')?.textContent).toBe('Bauherr');
    expect(host.querySelector('.po-kontext')?.textContent).toContain('2026-014 EFH Musterweg');
  });

  it('Ergänzen: Eingaben bleiben beim Wechsel zu „Vorlagen“ erhalten, nichts wird doppelt gelesen oder fokussiert', async () => {
    await desktopMitProjekt();
    const liste = vi.spyOn(mock.fs, 'liste');
    const host = render();
    await warten();
    // Projektliste per Tastatur: Einträge sind Knöpfe, das Suchfeld hat einen Namen, Enter öffnet den ersten Treffer (Pflicht 6)
    expect([...host.querySelectorAll('.po-projektliste li button')].map((b) => b.textContent)).toEqual(['2025-007 Kita', '2024-001 Altbau']);
    const suche = host.querySelector<HTMLInputElement>('input[aria-label="Projekt suchen"]')!;
    eingabe(suche, 'kita');
    await act(async () => void suche.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await warten();
    expect(host.querySelector('.po-kontext')?.textContent).toContain('Ergänzen: 2025-007 Kita');
    eingabe(feld(host, 'Bezeichnung des Vorhabens'), 'Neubau Kita am Park');
    const aufrufe = liste.mock.calls.length;

    act(() => knopf(host, 'Vorlagen').click());
    await warten();
    // ausgeblendet: der Fokus geht nicht in den versteckten Assistenten
    expect(assistent(host).contains(document.activeElement)).toBe(false);
    act(() => knopf(host, 'Assistent').click());
    await warten();
    expect(feld(host, 'Bezeichnung des Vorhabens').value).toBe('Neubau Kita am Park');
    expect(host.querySelector('.po-kontext')?.textContent).toContain('Ergänzen: 2025-007 Kita');
    // weder der Stammordner noch der Projektordner wurden beim Wechsel neu gelesen
    expect(liste.mock.calls.slice(aufrufe).filter(([p]) => String(p).startsWith('P:/Projekte'))).toEqual([]);
  });
});

describe('Assistent: Fokus, Schrittleiste, Meldungen', () => {
  it('Fokus nach jedem Schrittwechsel; „Weiter“ trotz Fehler führt zum ersten offenen Feld (Pflicht 4, 8)', () => {
    const host = render();
    act(() => knopf(host, 'Neues Projekt').click());
    expect(document.activeElement).toBe(feld(host, 'Projektnummer'));
    act(() => knopf(host, 'Weiter:').click());
    // eine Fehlerfarbe, kurze Namen, ein Klick führt zum Feld
    expect(host.querySelector('.po-weiter-grund')?.textContent).toBe('Noch offen: Projektnummer, Kurzname');
    expect(document.activeElement).toBe(feld(host, 'Projektnummer'));
    eingabe(feld(host, 'Projektnummer'), '2026-014');
    act(() => knopf(host, 'Weiter:').click());
    expect(document.activeElement).toBe(feld(host, 'Kurzname'));
    act(() => knopf(host.querySelector('.po-weiter-grund')!, 'Kurzname').click());
    expect(document.activeElement).toBe(feld(host, 'Kurzname'));
    eingabe(feld(host, 'Kurzname'), 'EFH');
    // der Bereich für „Noch offen“ bleibt im DOM (leer), damit Hilfsmittel die Meldung ansagen
    expect(host.querySelector('.po-weiter-grund[role="status"]')?.textContent).toBe('');
    act(() => knopf(host, 'Weiter:').click());
    expect(document.activeElement).toBe(host.querySelector('.po-assistent h2'));
    expect(document.activeElement?.textContent).toBe('Grundstück');
    // Strg+Enter steht auch für Hilfsmittel am Knopf
    expect(knopf(host, 'Weiter:').getAttribute('aria-keyshortcuts')).toBe('Control+Enter');
  });

  it('Schrittleiste: erledigt nur, was besucht und vollständig ist – mit Häkchen; gesperrte Schritte nennen den Grund (Pflicht 9)', () => {
    const host = render();
    act(() => knopf(host, 'Neues Projekt').click());
    const li = (label: string) => [...host.querySelectorAll('.po-schritte li')].find((l) => l.textContent?.endsWith(label)) as HTMLElement;
    expect(li('Grundstück').title).toBe('Erst Projektnummer und Kurzname eintragen');
    expect(li('Grundstück').querySelector('button')!.disabled).toBe(true);
    eingabe(feld(host, 'Projektnummer'), '2026-014');
    eingabe(feld(host, 'Kurzname'), 'EFH');
    // direkt zum letzten Schritt: die übersprungenen Schritte gelten nicht als erledigt
    act(() => knopf(host, '8Anlegen').click());
    expect(schrittNr(host)).toEqual(['✓', '✓', '3', '4', '5', '6', '7', '8']);
    expect(li('Stammdaten').querySelector('button')!.getAttribute('aria-label')).toBe('Stammdaten (erledigt)');
    expect(li('Grundstück').title).toBe('');
  });

  it('Vorlagen: Gruppe mit Legende, keine Liste der Zuordnungen; ohne Vorlagenordner kein Pfad in Code-Schrift (Pflicht 13)', () => {
    useOrdner.setState({ stamm: { ...leereStammdaten(), nummer: '2026-014', kurzname: 'EFH' } });
    const host = render();
    act(() => knopf(host, 'Weiter mit').click());
    act(() => knopf(host, '7Vorlagen').click());
    expect(host.querySelector('fieldset.po-vorlagenwahl legend')?.textContent).toBe('Welche Vorlagen?');
    expect(host.querySelector('fieldset.po-vorlagenwahl .po-presetwahl')).not.toBeNull();
    expect(host.textContent).not.toContain('Zuordnung');
    expect(host.textContent).not.toContain('Vorlagen-Presets');
    const ort = host.querySelector('.po-ort')!;
    expect(ort.querySelector('code')).toBeNull();
    expect(ort.querySelector('span.muted')?.textContent).toContain('keiner – es entstehen nur Ordner');
  });
});

describe('Assistent: Anlegen', () => {
  it('Hauptknopf rechts in der Navigation mit Grund für die Sperre; Trockenlauf ohne „neu“-Rauschen, Abwählen benannt (Pflicht 2, 3, 11, 12)', async () => {
    mock.desktop = true;
    useOrdner.setState({ stamm: { ...leereStammdaten(), nummer: '2026-014', kurzname: 'EFH' } });
    const host = render(createElement(AssistentView, { auftrag: { von: null } }));
    act(() => knopf(host, '8Anlegen').click());
    const anlegen = knopf(host, 'Projektordner anlegen');
    expect(anlegen.closest('.po-navigation')).not.toBeNull();
    // ohne Stammordner gesperrt – der Grund steht daneben und im Tooltip
    expect(anlegen.disabled).toBe(true);
    expect(host.querySelector('.po-navigation .po-sperr-grund')?.textContent).toBe('Erst den Stammordner für Projekte wählen.');
    expect(anlegen.title).toBe('Erst den Stammordner für Projekte wählen.');
    // ein Hinweis, kein Fehler: grau
    expect(host.querySelector('.po-sperr-grund')!.classList.contains('fehler')).toBe(false);
    act(() => useOrdner.setState({ stammordner: 'P:/Projekte' }));
    expect(knopf(host, 'Projektordner anlegen').disabled).toBe(false);
    expect(host.querySelector('.po-sperr-grund')).toBeNull();
    // offene Fehler (hier: Nummer fehlt) stehen in Fehlerfarbe – wie „Noch offen“ der anderen Schritte
    act(() => useOrdner.setState({ stamm: { ...useOrdner.getState().stamm, nummer: '' } }));
    expect(host.querySelector('.po-sperr-grund')!.textContent).toMatch(/^Noch offen: /);
    expect(host.querySelector('.po-sperr-grund')!.classList.contains('fehler')).toBe(true);
    act(() => useOrdner.setState({ stamm: { ...useOrdner.getState().stamm, nummer: '2026-014' } }));
    expect(host.querySelector('.po-sperr-grund')).toBeNull();
    // neues Projekt: kein „alles abwählen“, keine Spalte voller „neu“; Kontrollkästchen mit dem Namen des Eintrags
    expect(knopf(host, 'Alle neuen Einträge abwählen')).toBeUndefined();
    expect([...host.querySelectorAll('.po-plan .po-status')].every((s) => s.textContent === '')).toBe(true);
    const grundlagen = host.querySelector<HTMLInputElement>('.po-plan input[aria-label="01 Grundlagen anlegen"]')!;
    act(() => grundlagen.click());
    expect(grundlagen.closest('tr')!.querySelector('.po-status')?.textContent).toBe('abgewählt');
    expect(knopf(host, 'Alle wieder wählen')).toBeTruthy();
  });

  it('Gleichzeitigkeit: legt ein Kollege den Ordner inzwischen an, bricht „Anlegen“ ab – nichts landet in seinem Ordner', async () => {
    mock.desktop = true;
    useOrdner.setState({ stammordner: 'P:/Projekte', stamm: { ...leereStammdaten(), nummer: '2026-014', kurzname: 'EFH' } });
    await mock.fs.ordnerAnlegen('P:/Projekte', '2025-001 Anderes');
    const host = render(createElement(AssistentView, { auftrag: { von: null } }));
    await warten();
    act(() => knopf(host, '8Anlegen').click());
    // der Kollege ist schneller – mit anders benannter Projektdatei
    await mock.fs.ordnerAnlegen('P:/Projekte', '2026-014 EFH');
    mock.fs.setze('P:/Projekte/2026-014 EFH/Projekt Kollege.oap', strToU8('x'));
    const vorher = [...mock.fs.eintraege.keys()].sort();
    await act(async () => knopf(host, 'Projektordner anlegen').click());
    await warten();
    const fehler = host.querySelector('.meldung.fehler');
    expect(fehler?.textContent).toContain('Den Ordner „2026-014 EFH“ gibt es inzwischen im Stammordner');
    expect(fehler?.getAttribute('role')).toBe('alert');
    expect([...mock.fs.eintraege.keys()].sort()).toEqual(vorher);
    // gesperrt mit Grund, Weg zum Ergänzen
    expect(knopf(host, 'Projektordner anlegen').disabled).toBe(true);
    expect(host.querySelector('.po-sperr-grund')?.textContent).toContain('Den Projektordner gibt es schon');
    expect(knopf(host, 'Dieses Projekt ergänzen')).toBeTruthy();
  });

  it('Gegenprobe: ohne Kollegen wird angelegt; Abschlussseite ohne Navigation, Fokus auf der Überschrift (Pflicht 7)', async () => {
    mock.desktop = true;
    useOrdner.setState({ stammordner: 'P:/Projekte', stamm: { ...leereStammdaten(), nummer: '2026-014', kurzname: 'EFH' } });
    const host = render(createElement(AssistentView, { auftrag: { von: null } }));
    await warten();
    act(() => knopf(host, '8Anlegen').click());
    await act(async () => knopf(host, 'Projektordner anlegen').click());
    await warten();
    expect(mock.fs.eintraege.has('P:/Projekte/2026-014 EFH/03 Berechnungen/Flächen/2026-014 EFH.oap')).toBe(true);
    expect(host.querySelector('.po-abschluss h2')?.textContent).toBe('Projekt angelegt');
    expect(document.activeElement).toBe(host.querySelector('.po-abschluss h2'));
    expect(host.querySelector('.po-navigation')).toBeNull();
    expect(host.querySelector('.po-kontext')).toBeNull();
    expect([...host.querySelectorAll<HTMLButtonElement>('.po-schritte button')].every((b) => b.disabled)).toBe(true);
    expect(host.querySelector('.po-ergebnis strong')?.textContent).toMatch(/^\d+ Ordner und Dateien angelegt$/);
  });
});

describe('Hinweis bei nicht lesbarer Bürostruktur', () => {
  it('nennt die Standardstruktur von ATLAS, nach der neue Projekte entstehen; ohne Fehler kein Hinweis', () => {
    useOrdner.setState({ strukturFehler: 'Die Struktur lässt sich nicht lesen.' });
    const host = render();
    expect(host.querySelector('.po-konflikt[role="alert"]')!.textContent).toContain(
      'Die Bürostruktur ist nicht lesbar – bis zur Klärung gilt die Standardstruktur von ATLAS; neue Projekte entstehen nach ihr.',
    );
    // Gegenprobe
    act(() => useOrdner.setState({ strukturFehler: null }));
    expect(host.textContent).not.toContain('Bürostruktur ist nicht lesbar');
    // die Ansichten in der Werkzeugleiste sind Umschalter: genau einer ist gedrückt
    const ansichten = [...host.querySelectorAll('.toolbar .tb-group button')];
    expect(ansichten.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(ansichten.every((b) => b.hasAttribute('aria-pressed'))).toBe(true);
  });
});

describe('Assistent: nicht lesbare Projektdatei beim Ergänzen', () => {
  it('sagt ehrlich, dass sie unverändert bleibt und die Stammdaten nicht gespeichert werden', async () => {
    mock.desktop = true;
    await mock.fs.ordnerAnlegen('P:/Projekte', '2019-003 Altbau/Pläne');
    mock.fs.setze('P:/Projekte/2019-003 Altbau/03 Berechnungen/Flächen/2019-003 Altbau.oap', strToU8('kaputt'));
    const basis = 'P:/Projekte/2019-003 Altbau';
    const ordner = { pfad: basis, name: '2019-003 Altbau', eintraege: await mock.fs.liste(basis, 12), lies: (p: string) => mock.fs.lies(basis, p) };
    const host = render(createElement(AssistentView, { start: ordner }));
    await warten();
    expect(host.querySelector('.po-kontext')?.textContent).toContain('Projektdatei nicht lesbar – sie bleibt unverändert');
    expect(host.textContent).not.toContain('noch ohne Projektdatei');
    expect(host.textContent).not.toContain('In diesem Ordner liegt noch keine Projektdatei');
    expect(host.querySelector('.warning')?.textContent).toContain('wird nicht gespeichert');
    act(() => knopf(host, '8Ergänzen').click());
    expect(host.querySelector('.po-steckbrief summary')?.textContent).toBe('Zusammenfassung – wird nicht gespeichert (die Projektdatei ist nicht lesbar)');
    expect(host.textContent).toContain('Die Projektdatei ist nicht lesbar und bleibt unverändert – die Stammdaten werden nicht gespeichert.');
    expect(host.textContent).not.toContain('gezielt ergänzt');
    expect(host.querySelector('.po-warnungen')?.textContent).toContain('bleibt unverändert – Stammdaten und Presets werden darin nicht gespeichert');
  });

  it('Gegenprobe: lesbare Projektdatei – „vorhanden“, gezielt ergänzt', async () => {
    mock.desktop = true;
    await ausfuehren(mock.fs, 'P:/Projekte', planen({ ...leereStammdaten(), nummer: '2019-003', kurzname: 'Altbau' }, STANDARD, [], [], new Date(2019, 4, 1)));
    const basis = 'P:/Projekte/2019-003 Altbau';
    const ordner = { pfad: basis, name: '2019-003 Altbau', eintraege: await mock.fs.liste(basis, 12), lies: (p: string) => mock.fs.lies(basis, p) };
    const host = render(createElement(AssistentView, { start: ordner }));
    await warten();
    expect(host.querySelector('.po-kontext')?.textContent).toContain('Projektdatei vorhanden');
    eingabe(feld(host, 'Bezeichnung des Vorhabens'), 'Umbau');
    act(() => knopf(host, '8Ergänzen').click());
    expect(host.textContent).toContain('Die Projektdatei wird gezielt ergänzt');
    expect(host.querySelector('.po-steckbrief summary')?.textContent).toBe('Zusammenfassung – so steht es in der Projektdatei');
  });
});

describe('Namensschema-Feld', () => {
  it('Enter übernimmt den Wert, der Fokus bleibt im Feld (Pflicht 5)', () => {
    const werte: string[] = [];
    const host = render(createElement(SchemaFeld, { value: '{PROJEKT_KUERZEL}', onChange: (v: string) => werte.push(v), platzhalter: PLATZHALTER_PROJEKT, label: 'Ordnername' }));
    const el = host.querySelector<HTMLInputElement>('input[aria-label="Ordnername"]')!;
    act(() => {
      el.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '{PROJEKT_KUERZEL} x');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(werte).toEqual(['{PROJEKT_KUERZEL} x']);
    expect(document.activeElement).toBe(el);
  });
});

describe('Folgerunde: Neubeginn des Assistenten fragt bei offenen Eingaben', () => {
  it('„Projekte“ in der Titelleiste: geänderte Stammdaten beim Ergänzen – erst Rückfrage (Abbrechen behält sie, Verwerfen beginnt neu)', async () => {
    await desktopMitProjekt();
    const host = render();
    await warten();
    act(() => knopf(host, '2025-007 Kita').click());
    await warten();
    await warten();
    expect(host.querySelector('.po-kontext')?.textContent).toContain('Ergänzen: 2025-007 Kita');
    const projekte = () => host.querySelector<HTMLButtonElement>('.titlebar-projekte')!;
    // Gegenprobe zuerst: ohne Änderung keine Rückfrage – wieder öffnen
    act(() => projekte().click());
    await warten();
    expect(document.querySelector('.modal.rf')).toBeNull();
    expect(host.querySelector('.po-kontext')).toBeNull();
    act(() => knopf(host, '2025-007 Kita').click());
    await warten();
    await warten();
    eingabe(feld(host, 'Bezeichnung des Vorhabens'), 'Neubau Kita am Park');
    act(() => projekte().click());
    await warten();
    const frage = () => document.querySelector('.modal.rf')!;
    expect(frage().querySelector('h3')?.textContent).toBe('Eingaben im Assistenten verwerfen?');
    expect(frage().textContent).toContain('Noch nicht angelegt: die geänderten Stammdaten von „2025-007 Kita“');
    act(() => knopf(frage(), 'Abbrechen').click());
    await warten();
    expect(feld(host, 'Bezeichnung des Vorhabens').value).toBe('Neubau Kita am Park');
    act(() => projekte().click());
    await warten();
    act(() => knopf(frage(), 'Verwerfen').click());
    await warten();
    expect(host.querySelector('.po-kontext')).toBeNull();
    expect(host.textContent).toContain('Bestehendes Projekt ergänzen');
  });

  it('neues Projekt: der Entwurf übersteht den Neubeginn (liegt im Store) – keine Rückfrage', () => {
    const host = render();
    act(() => knopf(host, 'Neues Projekt').click());
    eingabe(feld(host, 'Projektnummer'), '2026-014');
    act(() => host.querySelector<HTMLButtonElement>('.titlebar-projekte')!.click());
    expect(document.querySelector('.modal.rf')).toBeNull();
    expect(knopf(host, 'Weiter mit 2026-014')).toBeTruthy();
  });
});

describe('Folgerunde: Vorlagenordner einlesen', () => {
  it('„wird gelesen“ endet erst mit dem letzten Ladevorgang, nicht mit einem früheren', async () => {
    mock.desktop = true;
    await mock.fs.dateiAnlegen('V:/Vorlagen', 'Brief.txt', strToU8('x'));
    const tore: (() => void)[] = [];
    const echt = mock.fs.liste.bind(mock.fs);
    mock.fs.liste = async (wurzel, tiefe) => {
      await new Promise<void>((r) => tore.push(r));
      return echt(wurzel, tiefe);
    };
    useOrdner.setState({ vorlagenordner: 'V:/Vorlagen' });
    const erster = useOrdner.getState().ladeVorlagen();
    const zweiter = useOrdner.getState().ladeVorlagen();
    expect(useOrdner.getState().vorlagenLaden).toBe(true);
    tore[0]();
    await erster;
    expect(useOrdner.getState().vorlagenLaden).toBe(true);
    tore[1]();
    await zweiter;
    expect(useOrdner.getState().vorlagenLaden).toBe(false);
    expect(useOrdner.getState().vorlagen.map((v) => v.pfad)).toEqual(['Brief.txt']);
  });
});

describe('Rahmen-App Arkly: ungespeicherte Änderungen melden und auf Anfrage speichern', () => {
  let gesendet: Record<string, unknown>[] = [];
  const rahmen = { postMessage: (d: Record<string, unknown>) => gesendet.push(d) } as unknown as Window;
  const setUrl = (u: string) => (window as unknown as { happyDOM: { setURL: (u: string) => void } }).happyDOM.setURL(u);
  beforeEach(() => {
    gesendet = [];
    konfigMock.sicherungScheitert = false;
    useOrdner.setState({ ordnerEntwurf: null, strukturFehler: null, strukturRoh: null, konfigFehler: null });
    Object.defineProperty(window, 'parent', { value: rahmen, configurable: true });
    setUrl('http://localhost:3000/?rahmen=tab&app=ordner');
  });
  afterEach(() => {
    Object.defineProperty(window, 'parent', { value: window, configurable: true });
    setUrl('http://localhost:3000/');
  });
  /** zuletzt an den Rahmen gemeldet: ungespeicherte Änderungen? */
  const dirty = () => gesendet.filter((d) => d.typ === 'arch-tools:status').at(-1)?.dirty;
  let nr = 0;
  /** Speichern-Anfrage des Rahmens; liefert die Antwort „gespeichert“ (ok) */
  const speichernAnfragen = async () => {
    const anfrage = `a${++nr}`;
    act(() => window.dispatchEvent(new MessageEvent('message', { data: { typ: 'arch-tools:speichern', anfrage }, origin: window.location.origin, source: rahmen })));
    for (let i = 0; i < 20 && !gesendet.some((d) => d.typ === 'arch-tools:gespeichert' && d.anfrage === anfrage); i++) await warten();
    return gesendet.find((d) => d.typ === 'arch-tools:gespeichert' && d.anfrage === anfrage)?.ok;
  };
  const stand = ordnerAlsText(STANDARD.ordner);
  const meldungText = () => document.querySelector('.modal.rf')?.textContent ?? '';

  it('Text der Ordnerliste: meldet „ungespeichert“; Speichern übernimmt ihn mit Sicherung – Gegenprobe ohne Entwurf', async () => {
    render();
    await warten();
    expect(dirty()).toBe(false);
    // ohne offene Änderungen: gespeichert, nichts geändert
    expect(await speichernAnfragen()).toBe(true);
    expect(useOrdner.getState().struktur).toBe(STANDARD);
    act(() => useOrdner.setState({ ordnerEntwurf: { text: `${stand}\n99_Neu aus dem Text`, basis: stand } }));
    expect(dirty()).toBe(true);
    expect(await speichernAnfragen()).toBe(true);
    expect(useOrdner.getState().ordnerEntwurf).toBeNull();
    expect(useOrdner.getState().struktur.ordner.map((o) => o.pfad)).toContain('99_Neu aus dem Text');
    // wie beim Knopf „Übernehmen“: vorher gesichert, „Rückgängig“ angeboten
    expect(localStorage.getItem('arch-tools:konfig:projektordner-sicherungen')).toContain('Ordnerliste übernommen.');
    expect(useOrdner.getState().rueckgaengig?.struktur).toBe(STANDARD);
    expect(dirty()).toBe(false);
    expect(document.querySelector('.modal.rf')).toBeNull();
  });

  it('Text der Ordnerliste von einem älteren Stand bzw. leer: nicht still übernommen – „nicht gespeichert“ mit Meldung', async () => {
    render();
    await warten();
    act(() => useOrdner.setState({ ordnerEntwurf: { text: `${stand}\n99_Neu`, basis: 'A\nB' } }));
    expect(dirty()).toBe(true);
    expect(await speichernAnfragen()).toBe(false);
    expect(useOrdner.getState().struktur).toBe(STANDARD);
    expect(useOrdner.getState().ordnerEntwurf?.text).toBe(`${stand}\n99_Neu`);
    expect(meldungText()).toContain('älteren Stand');
    act(() => knopf(document.querySelector('.modal.rf')!, 'OK').click());
    await warten();
    act(() => useOrdner.setState({ ordnerEntwurf: { text: '', basis: stand } }));
    expect(await speichernAnfragen()).toBe(false);
    expect(useOrdner.getState().struktur).toBe(STANDARD);
    expect(meldungText()).toContain('keinen Ordner');
  });

  const SICHERUNGEN_KEY = 'arch-tools:konfig:projektordner-sicherungen';
  const KONFIG_KEY = 'arch-tools:konfig:projektordner';

  it('Speichern auf Anfrage schreibt die übernommene Struktur sofort – nicht erst nach der Wartezeit', async () => {
    render();
    await warten();
    act(() => useOrdner.setState({ ordnerEntwurf: { text: `${stand}\n99_Sofort`, basis: stand } }));
    expect(localStorage.getItem(KONFIG_KEY) ?? '').not.toContain('99_Sofort');
    expect(await speichernAnfragen()).toBe(true);
    // ohne auf SPEICHERN_NACH_MS zu warten: schon geschrieben, der Stand nachgeführt
    expect(localStorage.getItem(KONFIG_KEY)).toContain('99_Sofort');
    expect(useOrdner.getState().konfigStandEigen).toContain('99_Sofort');
  });

  it('unlesbare Struktur: der Text der Ordnerliste wird nicht still übernommen (die Sperre bleibt)', async () => {
    render();
    await warten();
    act(() => useOrdner.setState({ strukturFehler: 'kaputt', strukturRoh: { x: 1 }, ordnerEntwurf: { text: `${stand}\n99_Neu`, basis: stand } }));
    expect(await speichernAnfragen()).toBe(false);
    expect(useOrdner.getState().struktur).toBe(STANDARD);
    expect(useOrdner.getState().strukturFehler).toBe('kaputt');
    expect(useOrdner.getState().ordnerEntwurf).not.toBeNull();
    expect(localStorage.getItem(SICHERUNGEN_KEY) ?? '').not.toContain('Ordnerliste übernommen.');
    expect(meldungText()).toContain('nicht lesbar und deshalb gesperrt');
  });

  it('Konflikt mit Text der Ordnerliste: nicht still übernommen, eine Meldung nennt beides', async () => {
    render();
    await warten();
    act(() => useOrdner.setState({ konflikt: { roh: { struktur: STANDARD } }, ordnerEntwurf: { text: `${stand}\n99_Neu`, basis: stand } }));
    expect(await speichernAnfragen()).toBe(false);
    expect(useOrdner.getState().struktur).toBe(STANDARD);
    expect(useOrdner.getState().konflikt).not.toBeNull();
    expect(useOrdner.getState().ordnerEntwurf).not.toBeNull();
    expect(localStorage.getItem(SICHERUNGEN_KEY) ?? '').not.toContain('Ordnerliste übernommen.');
    expect(meldungText()).toContain('samt dem Text der Ordnerliste');
    expect(meldungText().match(/Text der Ordnerliste/g)).toHaveLength(1);
  });

  it('Sicherung scheitert: nicht übernommen, Entwurf und Struktur bleiben, die Meldung nennt den Grund', async () => {
    konfigMock.sicherungScheitert = true;
    render();
    await warten();
    act(() => useOrdner.setState({ ordnerEntwurf: { text: `${stand}\n99_Neu`, basis: stand } }));
    expect(await speichernAnfragen()).toBe(false);
    expect(useOrdner.getState().struktur).toBe(STANDARD);
    expect(useOrdner.getState().ordnerEntwurf?.text).toBe(`${stand}\n99_Neu`);
    expect(meldungText()).toContain('Laufwerk nicht erreichbar');
    expect(dirty()).toBe(true);
  });

  it('Schreiben gescheitert: meldet „ungespeichert“ (Beenden fragt), Speichern sagt „nicht gespeichert“ – Gegenprobe', async () => {
    render();
    await warten();
    act(() => useOrdner.setState({ konfigFehler: 'Einstellungen nicht lesbar: x' }));
    expect(dirty()).toBe(false);
    act(() => useOrdner.setState({ konfigFehler: `${NICHT_GESPEICHERT}: Zugriff verweigert` }));
    expect(dirty()).toBe(true);
    expect(await speichernAnfragen()).toBe(false);
    expect(meldungText()).toContain('Zugriff verweigert');
    act(() => useOrdner.setState({ konfigFehler: null }));
    expect(dirty()).toBe(false);
  });

  it('Konflikt mit einem anderen Rechner: meldet „ungespeichert“, Speichern entscheidet ihn nicht still', async () => {
    render();
    await warten();
    act(() => useOrdner.setState({ konflikt: { roh: { struktur: STANDARD } } }));
    expect(dirty()).toBe(true);
    expect(await speichernAnfragen()).toBe(false);
    expect(useOrdner.getState().konflikt).not.toBeNull();
    expect(meldungText()).toContain('Meine Fassung trotzdem speichern');
    act(() => useOrdner.setState({ konflikt: null }));
    expect(dirty()).toBe(false);
  });

  it('Assistent: geänderte Stammdaten beim Ergänzen melden „ungespeichert“, Speichern legt nichts an – der Entwurf eines neuen Projekts nicht', async () => {
    await desktopMitProjekt();
    const host = render();
    await warten();
    // neues Projekt: der Entwurf liegt im lokalen Speicher (übersteht auch ein Beenden) – keine Meldung
    act(() => knopf(host, 'Neues Projekt').click());
    eingabe(feld(host, 'Projektnummer'), '2026-014');
    expect(JSON.parse(localStorage.getItem('projektordner:zustand')!).stamm.nummer).toBe('2026-014');
    expect(dirty()).toBe(false);
    act(() => host.querySelector<HTMLButtonElement>('.titlebar-projekte')!.click());
    await warten();
    act(() => knopf(host, '2025-007 Kita').click());
    await warten();
    await warten();
    expect(dirty()).toBe(false);
    const inhalt = () => JSON.stringify([...mock.fs.eintraege].map(([k, v]) => [k, v ? [...v] : null]));
    const vorher = inhalt();
    eingabe(feld(host, 'Bezeichnung des Vorhabens'), 'Neubau Kita am Park');
    expect(dirty()).toBe(true);
    expect(await speichernAnfragen()).toBe(false);
    // nichts angelegt bzw. geschrieben, die Eingabe steht noch da
    expect(inhalt()).toBe(vorher);
    expect(feld(host, 'Bezeichnung des Vorhabens').value).toBe('Neubau Kita am Park');
    expect(meldungText()).toContain('die geänderten Stammdaten von „2025-007 Kita“');
    expect(meldungText()).toContain('Projektordner anzulegen');
  });
});
