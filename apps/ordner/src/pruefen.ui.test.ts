// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '@core/model';
import { VORGABE_ALLGEMEIN } from '@core/platform/konfig';
import { projektdateiAnlegen } from '@core/platform/projektordner';
import { PruefView } from './components/PruefView';
import { EinstellungenView } from './components/StrukturView';
import { SpeicherDateisystem } from './dateisystem';
import { leereStammdaten } from './stammdaten';
import { useOrdner } from './store';
import type { Struktur } from './struktur';
import { STANDARD } from './struktur';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    expect(befund.querySelector('details summary')?.textContent).toBe('7 Ordner anzeigen');
    expect(befund.querySelector('details')?.hasAttribute('open')).toBe(false);
    expect(knopf(befund, '7 fehlende Ordner anlegen')).toBeTruthy();
    // unten nur noch CSV und Ergänzen, mit derselben Bezeichnung wie in der Übersicht
    const unten = [...host.querySelectorAll('.button-row')].pop()!;
    expect([...unten.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Als CSV speichern …', 'Projekt ergänzen …']);
    // Rückkehr steht oben am Bericht (es gibt eine Projektliste)
    expect(knopf(host.querySelector('.po-bericht-kopf')!, '← Zur Projektliste')).toBeTruthy();
  });

  it('Teilstand nach Fehler beim Anlegen: Bericht neu geprüft und Fehler mit Zahl genannt', async () => {
    const fs = await projekt('2026-03-01');
    const host = await pruefen(fs);
    fs.bisFehler = 2;
    await act(async () => knopf(host, '7 fehlende Ordner anlegen').click());
    await warten();
    expect(host.querySelector('.warning')?.textContent).toBe('2 von 7 Ordnern angelegt, dann Fehler: Netzlaufwerk nicht erreichbar');
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

describe('Einstellungen: Stammordner', () => {
  it('Abschnittsüberschrift, Icon-Knöpfe mit Namen, „Neue Projekte hier“, Leerzustand', async () => {
    useOrdner.setState({ allgemein: { ...VORGABE_ALLGEMEIN, projekte: ['P:/Projekte', 'P:/Archiv'] } });
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(createElement(EinstellungenView)));
    expect([...host.querySelectorAll('h3')].map((h) => h.textContent)).toContain('Stammordner der Projekte');
    const liste = host.querySelector('.po-stammordner')!;
    expect(liste.querySelector('button.icon[aria-label="P:/Archiv entfernen"] .symbol, button.icon[aria-label="P:/Archiv entfernen"] svg')).toBeTruthy();
    expect(liste.querySelector('button.icon[aria-label="P:/Archiv nach oben"]')).toBeTruthy();
    act(() => knopf(liste, 'Neue Projekte hier').click());
    expect(useOrdner.getState().allgemein.projekte).toEqual(['P:/Archiv', 'P:/Projekte']);
    act(() => (liste.querySelector('button[aria-label="P:/Archiv entfernen"]') as HTMLButtonElement).click());
    act(() => (liste.querySelector('button[aria-label="P:/Projekte entfernen"]') as HTMLButtonElement).click());
    expect(host.querySelector('.po-stammordner')!.textContent).toBe('Noch kein Stammordner – hinzufügen lässt er sich nur in der Desktop-App.');
  });
});
