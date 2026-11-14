// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MenueHost } from '@core/ui/Menue';
import { demoLaden } from './demo';
import { useAva } from './store';
import { GewerkAnsicht } from './components/GewerkAnsicht';
import { RechnungenAnsicht } from './components/abrechnung/RechnungenAnsicht';
import { Uebersicht } from './components/Uebersicht';
import { Maengel } from './components/bauleitung/Maengel';
import { Beteiligte } from './components/bauleitung/Beteiligte';
import type { RechnungsDatensatz } from './avaDaten';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
let host: HTMLDivElement;

const warte = async (bis: () => unknown, n = 40) => {
  for (let i = 0; i < n && !bis(); i++) await act(async () => new Promise((r) => setTimeout(r, 5)));
};

const zeige = (el: React.ReactElement) =>
  act(() => {
    root = createRoot(host);
    root.render(createElement('div', null, el, createElement(MenueHost)));
  });

beforeEach(async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  await demoLaden();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

/** Werkzeugleiste mit Namen */
const leiste = (name: string) => host.querySelector<HTMLElement>(`.toolbar.leiste[aria-label="${name}"]`)!;
/** sichtbare Knöpfe einer Leiste (Text bzw. aria-label) */
const knoepfe = (l: HTMLElement) => [...l.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.closest('[hidden]')).map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim());

/** Menü über seinen Knopf öffnen; liefert die Punkte (Trenner als „—“) */
async function menue(knopf: HTMLButtonElement): Promise<string[]> {
  await act(async () => knopf.click());
  await warte(() => document.querySelector('[role="menu"]'));
  const m = document.querySelector('[role="menu"]')!;
  const punkte = [...m.querySelectorAll('[role^="menuitem"], [role="separator"]')].map((p) =>
    p.getAttribute('role') === 'separator' ? '—' : (p.querySelector('.menue-text')?.textContent ?? p.textContent ?? '').trim(),
  );
  await act(async () => void document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  await warte(() => !document.querySelector('[role="menu"]'));
  return punkte;
}

const mehr = (l: HTMLElement) => l.querySelector<HTMLButtonElement>('.leiste-mehr button[aria-label="Mehr"]')!;

describe('Werkzeugleisten nach design.md „Kopf- und Werkzeugleisten“', () => {
  it('LV-Editor: sichtbar Position, Hinzufügen, Gliederung, Rückgängig, Suche; Abschnitt im Menü „Hinzufügen“, Duplizieren und Entfernen in „Mehr“', async () => {
    await zeige(createElement(GewerkAnsicht, { gewerk: 'G8', tab: 'lv' }));
    await warte(() => useAva.getState().lv && host.querySelector('.ava-lv-zeilen'));
    const l = leiste('LV bearbeiten');
    const sichtbar = knoepfe(l);
    expect(sichtbar).toEqual(expect.arrayContaining(['Position', 'Hinzufügen', 'Rückgängig', 'Wiederholen', 'Mehr']));
    // Gegenprobe: was ins Menü gewandert ist, steht nicht mehr als Knopf in der Leiste
    expect(sichtbar).not.toContain('Duplizieren');
    expect(sichtbar).not.toContain('Entfernen');
    expect(sichtbar).not.toContain('Abschnitt');
    expect(l.querySelector('input[aria-label="LV durchsuchen"]')).not.toBeNull();
    const hinzufuegen = [...l.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')].find((b) => b.textContent?.trim() === 'Hinzufügen')!;
    expect(await menue(hinzufuegen)).toEqual(['Abschnitt', 'Hinweis', 'Vorbemerkung', 'Aus Vorlage …']);
    // Gefahr-Punkt am Ende hinter einem Trenner
    expect(await menue(mehr(l))).toEqual(['Duplizieren', '—', 'Entfernen']);
  });

  it('Gewerk-Kopf: ein Menü „LV“ statt „Neues LV“ und „LV“', async () => {
    await zeige(createElement(GewerkAnsicht, { gewerk: 'G8', tab: 'lv' }));
    await warte(() => useAva.getState().lv && host.querySelector('.ava-lv-zeilen'));
    const menues = [...host.querySelectorAll<HTMLButtonElement>('.ava-lv-wahl button[aria-haspopup="menu"]')].map((b) => b.textContent?.trim());
    expect(menues).toEqual(['LV']);
  });

  it('Angebote: Umschalter, Bieter und Hauptknopf sichtbar; GAEB-Import in „Mehr“', async () => {
    await zeige(createElement(GewerkAnsicht, { gewerk: 'G8', tab: 'angebote' }));
    await warte(() => host.querySelector('.toolbar.leiste[aria-label="Angebote"]'));
    const l = leiste('Angebote');
    expect(knoepfe(l)).toEqual(['Preisspiegel', 'Preise erfassen', 'Bieter …', 'Preisspiegel drucken …', 'Mehr']);
    expect(l.querySelector('button.primary')?.textContent?.trim()).toBe('Preisspiegel drucken …');
    expect(await menue(mehr(l))).toEqual(['Angebot aus GAEB (X84) …']);
  });

  it('Rechnungen: Hauptknopf rechts, „Kostenkontrolle öffnen“ in „Mehr“; Deckblatt und Mail im Zeilenknopf „Aktionen“', async () => {
    const p = useAva.getState().projekt!;
    const d: RechnungsDatensatz = {
      id: 'r-test',
      gewerk: p.ava.rechnungen[0]?.gewerk ?? 'G8',
      nr: 77,
      art: 'AR',
      lfd: 1,
      firma: 'Test GmbH',
      betrag: 100,
      status: 'abgelegt',
      erfasst: '2025-01-01',
      datei: 'X/Test.pdf',
    };
    useAva.setState({ projekt: { ...p, ava: { ...p.ava, rechnungen: [...p.ava.rechnungen, d] } } });
    await zeige(createElement(RechnungenAnsicht));
    await warte(() => host.querySelector('.toolbar.leiste[aria-label="Rechnungen"]'));
    const l = leiste('Rechnungen');
    expect(knoepfe(l)).toEqual(['Neue Rechnung prüfen …', 'Mehr']);
    expect(await menue(mehr(l))).toEqual(['Kostenkontrolle öffnen']);
    // kein Programmname mehr in der Bedienung
    expect(host.textContent).not.toContain('in Excel');
    const aktionen = host.querySelector<HTMLButtonElement>('button[aria-label="Aktionen"]')!;
    expect(aktionen).not.toBeNull();
    expect(aktionen.title).toContain('Nr. 77');
    expect(await menue(aktionen)).toEqual(['Deckblatt öffnen', 'Mail an den Zahler …']);
    // Gegenprobe: in der Zeile stehen Deckblatt und Mail nicht mehr als Knöpfe
    const zeilenKnoepfe = [...host.querySelectorAll('.ava-aktionen button')].map((b) => b.textContent?.trim());
    expect(zeilenKnoepfe).not.toContain('Deckblatt');
    expect(zeilenKnoepfe).not.toContain('Mail');
  });

  it('Kostenübersicht: „Kostenkontrolle öffnen“ statt „In Excel öffnen“, Excel nur im Tooltip als Dateiformat', async () => {
    await zeige(createElement(Uebersicht));
    const knopf = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Kostenkontrolle öffnen')!;
    expect(knopf).toBeTruthy();
    expect(knopf.title).toBe('Öffnet die Excel-Datei der Kostenkontrolle mit dem Standardprogramm');
    expect([...host.querySelectorAll('button')].some((b) => /In Excel/.test(b.textContent ?? ''))).toBe(false);
  });

  it('Mängel und Beteiligte: Hinzufügen sichtbar, PDF bzw. Übernahme in „Mehr“', async () => {
    await zeige(createElement(Maengel));
    const m = leiste('Mängel');
    expect(knoepfe(m)).toEqual(['Mangel', 'Mängelanzeige mailen …', 'Mehr']);
    expect(await menue(mehr(m))).toEqual(['PDF ansehen / drucken', 'PDF im Projekt ablegen']);
    act(() => root?.unmount());
    await zeige(createElement(Beteiligte));
    const b = leiste('Beteiligte');
    expect(knoepfe(b)).toEqual(['Beteiligter', 'Mehr']);
    expect(await menue(mehr(b))).toEqual(['Aus Stammdaten und Gewerken übernehmen']);
  });
});
