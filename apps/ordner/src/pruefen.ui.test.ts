// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@core/model';
import { VORGABE_ALLGEMEIN } from '@core/platform/konfig';
import { projektdateiAnlegen } from '@core/platform/projektordner';
import type { CsvAusgabe } from './components/PruefView';
import { PruefView } from './components/PruefView';
import { SpeicherDateisystem } from './dateisystem';
import { leereStammdaten } from './stammdaten';
import { useOrdner } from './store';
import type { Struktur } from './struktur';
import { STANDARD } from './struktur';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const gespeichert = vi.hoisted(() => [] as { defaultName: string; contents: string }[]);
vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  saveTextFile: async (o: { defaultName: string; contents: string }) => {
    gespeichert.push(o);
    return true;
  },
}));

/** Struktur mit dem Jahr in einem Ordner und sieben weiteren Ordnern */
const STRUKTUR: Struktur = {
  ...STANDARD,
  name: 'Test',
  ordnername: '{PROJEKT_KUERZEL} {PROJEKT_KURZNAME}',
  ordner: [{ pfad: '00 Projekt' }, { pfad: 'Archiv {JAHR}' }, ...['A', 'B', 'C', 'D', 'E', 'F'].map((x) => ({ pfad: `0${x} Ordner` }))],
};

let root: ReturnType<typeof createRoot> | null = null;
beforeEach(() => {
  localStorage.clear();
  gespeichert.length = 0;
  useOrdner.setState({ stamm: leereStammdaten(), struktur: STRUKTUR, allgemein: { ...VORGABE_ALLGEMEIN, projekte: ['P:/Projekte'] }, konfigLaden: async () => {} });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});
const warten = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  });
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;

/** Dateisystem, dessen Anlegen ab dem n-ten Ordner scheitert (Netzlaufwerk weg) */
class WackligesDateisystem extends SpeicherDateisystem {
  bisFehler = Infinity;
  override async ordnerAnlegen(basis: string, pfad: string) {
    if (this.bisFehler-- <= 0) throw new Error('Netzlaufwerk nicht erreichbar');
    return super.ordnerAnlegen(basis, pfad);
  }
}

async function projekt(angelegt?: string) {
  const fs = new WackligesDateisystem();
  const p = createProject('Haus');
  p.meta.projektcode = 'MUS';
  p.meta.kurzname = 'Haus';
  if (angelegt) p.meta.angelegt = angelegt;
  await fs.ordnerAnlegen('P:/Projekte', 'MUS Haus/00 Projekt');
  await projektdateiAnlegen(fs, 'P:/Projekte/MUS Haus', '00 Projekt/MUS.oap', p, 'Test');
  return fs;
}

async function pruefen(fs: SpeicherDateisystem) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(PruefView, { fs, onErgaenzen: () => {}, start: 'P:/Projekte/MUS Haus' })));
  await warten();
  await warten();
  return host;
}

describe('Prüfbericht', () => {
  it('Kopfzeile zählt getrennt, Aktion am Befund, lange Pfadliste eingeklappt, Rückkehr oben', async () => {
    const host = await pruefen(await projekt('2026-03-01'));
    expect(host.querySelector('.po-bericht-kopf h3')?.textContent).toContain('1 Abweichung');
    const befund = [...host.querySelectorAll('.po-befunde > li')].find((li) => li.textContent?.includes('Ordner der Struktur fehlen'))!;
    // Art als Marke aus core, Abweichung in der Variante .warnung
    expect(befund.querySelector('.po-befund-art')?.className).toBe('marke warnung po-befund-art');
    expect(befund.querySelector('.po-befund-art')?.textContent).toBe('Abweichung');
    // die Zeile trägt keine Klasse der Art (.hinweis wäre die schwebende Hinweis-Meldung aus core)
    expect(befund.className).toBe('');
    expect(befund.querySelector('details summary')?.textContent).toBe('7 Ordner anzeigen');
    expect(befund.querySelector('details')?.hasAttribute('open')).toBe(false);
    expect(knopf(befund, '7 fehlende Ordner anlegen')).toBeTruthy();
    // unten nur noch CSV und Ergänzen, mit derselben Bezeichnung wie in der Übersicht
    const unten = [...host.querySelectorAll('.button-row')].pop()!;
    expect([...unten.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Als CSV speichern …', 'Projekt ergänzen …']);
    // Rückkehr steht oben am Bericht (es gibt eine Projektliste)
    expect(knopf(host.querySelector('.po-bericht-kopf')!, 'Zur Projektliste')).toBeTruthy();
  });

  it('meldet den Bericht für „Datei → Exportieren → CSV …“, speichert ihn und meldet beim Verlassen wieder ab', async () => {
    const fs = await projekt('2026-03-01');
    const meldungen: (CsvAusgabe | null)[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(createElement(PruefView, { fs, onErgaenzen: () => {}, onCsv: (c) => meldungen.push(c), start: 'P:/Projekte/MUS Haus' })));
    await warten();
    await warten();
    const bericht = meldungen.at(-1)!;
    expect(bericht.titel).toBe('Prüfbericht „MUS Haus“ als CSV-Datei speichern');
    // dieselbe Datei wie der Knopf „Als CSV speichern …“
    await act(async () => bericht.aktion());
    await act(async () => knopf(host, 'Als CSV speichern').click());
    expect(gespeichert.map((g) => g.defaultName)).toEqual(['Prüfbericht MUS Haus.csv', 'Prüfbericht MUS Haus.csv']);
    expect(gespeichert[0].contents).toBe(gespeichert[1].contents);
    expect(gespeichert[0].contents).toContain('Ordner der Struktur fehlen');
    // Ansicht direkt aus dem Bericht verlassen: abgemeldet
    const vorher = meldungen.length;
    act(() => root!.render(createElement('div')));
    expect(meldungen.length).toBe(vorher + 1);
    expect(meldungen.at(-1)).toBeNull();
  });

  it('meldet die Übersicht aller Projekte und nach „Zur Projektliste“ nichts mehr', async () => {
    const fs = await projekt('2026-03-01');
    const meldungen: (CsvAusgabe | null)[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(createElement(PruefView, { fs, onErgaenzen: () => {}, onCsv: (c) => meldungen.push(c) })));
    await warten();
    expect(meldungen.at(-1)).toBeNull();
    await act(async () => knopf(host, 'Alle Projekte prüfen').click());
    await warten();
    const uebersicht = meldungen.at(-1)!;
    expect(uebersicht.titel).toBe('Übersicht aller Projekte als CSV-Datei speichern');
    await act(async () => uebersicht.aktion());
    expect(gespeichert).toHaveLength(1);
    expect(gespeichert[0].defaultName).toMatch(/^Prüfung aller Projekte \d{4}-\d{2}-\d{2}\.csv$/);
    expect(gespeichert[0].contents).toContain('MUS Haus');
    act(() => knopf(host, 'Zur Projektliste').click());
    expect(meldungen.at(-1)).toBeNull();
  });

  it('Marken der Art: Projektdatei vorhanden als .ok, nicht lesbare Projektdatei als .fehler', async () => {
    const fs = await projekt('2026-03-01');
    const marke = (host: Element, titel: string) => [...host.querySelectorAll('.po-befunde > li')].find((li) => li.textContent?.includes(titel))!.querySelector('.po-befund-art')!;
    let host = await pruefen(fs);
    expect(marke(host, 'Projektdatei vorhanden').className).toBe('marke ok po-befund-art');
    expect(marke(host, 'Projektdatei vorhanden').textContent).toBe('in Ordnung');
    act(() => root!.unmount());
    // Projektdatei durch unlesbaren Inhalt ersetzen
    fs.eintraege.set('P:/Projekte/MUS Haus/00 Projekt/MUS.oap', new TextEncoder().encode('kaputt'));
    host = await pruefen(fs);
    expect(marke(host, 'Projektdatei (.oap) ist nicht lesbar').className).toBe('marke fehler po-befund-art');
    expect(marke(host, 'Projektdatei (.oap) ist nicht lesbar').textContent).toBe('Fehler');
  });

  it('Teilstand nach Fehler beim Anlegen: Bericht neu geprüft und Fehler mit Zahl genannt', async () => {
    const fs = await projekt('2026-03-01');
    const host = await pruefen(fs);
    fs.bisFehler = 2;
    await act(async () => knopf(host, '7 fehlende Ordner anlegen').click());
    await warten();
    expect(host.querySelector('.meldung.fehler[role="alert"]')?.textContent).toBe('2 von 7 Ordnern angelegt, dann Fehler: Netzlaufwerk nicht erreichbar');
    expect(knopf(host, '5 fehlende Ordner anlegen')).toBeTruthy();
  });

  it('ohne Anlagedatum: Jahresordner nicht beurteilbar und nicht angelegt', async () => {
    const fs = await projekt();
    const host = await pruefen(fs);
    expect(host.textContent).toContain('1 Ordner der Struktur ist nicht beurteilbar');
    await act(async () => knopf(host, '6 fehlende Ordner anlegen').click());
    await warten();
    // angelegt wurden nur die beurteilbaren Ordner – kein „Archiv “ oder „Archiv {JAHR}“
    const ordner = [...fs.eintraege.keys()].filter((k) => k.startsWith('P:/Projekte/MUS Haus/Archiv'));
    expect(ordner).toEqual([]);
    expect(host.textContent).toContain('Alle 7 Ordner der Struktur sind vorhanden');
  });
});
