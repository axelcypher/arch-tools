// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { leistenMessung } from '@core/ui/Werkzeugleiste';
import { zeilenVon } from './components/lv/LvEditor';
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
const leiste = (name: string) => host.querySelector<HTMLElement>(`.toolbar.werkzeugleiste[aria-label="${name}"]`)!;
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

/** Menü öffnen und den Punkt mit dem Text wählen; liefert, ob er gesperrt war (dann bleibt das Menü zu schließen) */
async function waehle(knopf: HTMLButtonElement, text: string): Promise<{ gesperrt: boolean; hinweis: string | null }> {
  await act(async () => knopf.click());
  await warte(() => document.querySelector('[role="menu"]'));
  const punkt = [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] [role^="menuitem"]')].find((p) => p.querySelector('.menue-text')?.textContent?.trim() === text)!;
  const gesperrt = punkt.getAttribute('aria-disabled') === 'true';
  const hinweis = punkt.querySelector('.menue-hinweis:not(.menue-tasten)')?.textContent?.trim() ?? null;
  if (gesperrt) {
    await act(async () => void document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  } else await act(async () => punkt.click());
  await warte(() => !document.querySelector('[role="menu"]'));
  return { gesperrt, hinweis };
}

/** Elemente des offenen LV (alle Ebenen) */
const elementzahl = () => zeilenVon(useAva.getState().lv!.lv).length;
/** erste Position im Abschnitt 02 wählen */
const positionWaehlen = () => {
  const z = zeilenVon(useAva.getState().lv!.lv).find((x) => x.el.art === 'position')!;
  act(() => useAva.getState().setAuswahl(z.el.id));
  return z;
};

const mehr = (l: HTMLElement) => l.querySelector<HTMLButtonElement>('.werkzeugleiste-mehr button[aria-label="Mehr"]')!;

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
    await warte(() => host.querySelector('.toolbar.werkzeugleiste[aria-label="Angebote"]'));
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
    await warte(() => host.querySelector('.toolbar.werkzeugleiste[aria-label="Rechnungen"]'));
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

  it('„Mehr“ im LV-Editor wirkt: ohne Auswahl gesperrt mit Grund, mit Auswahl dupliziert bzw. entfernt', async () => {
    await zeige(createElement(GewerkAnsicht, { gewerk: 'G8', tab: 'lv' }));
    await warte(() => useAva.getState().lv && host.querySelector('.ava-lv-zeilen'));
    act(() => useAva.getState().setAuswahl(null));
    const l = leiste('LV bearbeiten');
    const vorher = elementzahl();
    expect(await waehle(mehr(l), 'Duplizieren')).toEqual({ gesperrt: true, hinweis: 'Erst wählen' });
    expect(await waehle(mehr(l), 'Entfernen')).toEqual({ gesperrt: true, hinweis: 'Erst wählen' });
    expect(elementzahl()).toBe(vorher);
    positionWaehlen();
    expect((await waehle(mehr(l), 'Duplizieren')).gesperrt).toBe(false);
    expect(elementzahl()).toBe(vorher + 1);
    expect((await waehle(mehr(l), 'Entfernen')).gesperrt).toBe(false);
    expect(elementzahl()).toBe(vorher);
  });

  it('Tastenkürzel im LV unverändert: Strg+D dupliziert, Entf entfernt, Einfg fügt eine Position hinzu', async () => {
    await zeige(createElement(GewerkAnsicht, { gewerk: 'G8', tab: 'lv' }));
    await warte(() => useAva.getState().lv && host.querySelector('.ava-lv-zeilen'));
    const tabelle = host.querySelector<HTMLElement>('.ava-lv-tabelle')!;
    const taste = (key: string, ctrlKey = false) => act(() => void tabelle.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true, cancelable: true })));
    const vorher = elementzahl();
    positionWaehlen();
    await taste('d', true);
    expect(elementzahl()).toBe(vorher + 1);
    await taste('Delete');
    await warte(() => elementzahl() === vorher);
    expect(elementzahl()).toBe(vorher);
    positionWaehlen();
    await taste('Insert');
    expect(elementzahl()).toBe(vorher + 1);
  });

  it('Überlauf der LV-Leiste: erst „Hinzufügen“, dann die Gliederung, zuletzt Rückgängig/Wiederholen – mit ihren Punkten in „Mehr“', async () => {
    const breiten: Record<string, number> = { position: 90, hinzufuegen: 120, gliederung: 130, verlauf: 60, suche: 240 };
    let verfuegbar = 1000;
    const alt = leistenMessung.breite;
    leistenMessung.breite = (el: Element) => {
      if (el.classList.contains('werkzeugleiste')) return verfuegbar;
      if (el.classList.contains('werkzeugleiste-mehr')) return 30;
      return breiten[(el as HTMLElement).dataset.eintrag ?? ''] ?? 0;
    };
    try {
      await zeige(createElement(GewerkAnsicht, { gewerk: 'G8', tab: 'lv' }));
      await warte(() => useAva.getState().lv && host.querySelector('.ava-lv-zeilen'));
      const l = leiste('LV bearbeiten');
      const weg = () => [...l.querySelectorAll<HTMLElement>(':scope > [data-eintrag][hidden]')].map((x) => x.dataset.eintrag);
      const breite = async (b: number) => {
        verfuegbar = b;
        await act(async () => void window.dispatchEvent(new Event('resize')));
      };
      await breite(1000);
      expect(weg()).toEqual([]);
      await breite(600);
      expect(weg()).toEqual(['hinzufuegen']);
      await breite(480);
      expect(weg()).toEqual(['hinzufuegen', 'gliederung']);
      expect((await menue(mehr(l))).slice(0, 6)).toEqual(['Hinzufügen', '—', 'Position nach oben', 'Position nach unten', 'Position ausrücken', 'Position einrücken']);
      await breite(380);
      expect(weg()).toEqual(['hinzufuegen', 'gliederung', 'verlauf']);
      // Gegenprobe: wieder breit → alles zurück in der Leiste
      await breite(1000);
      expect(weg()).toEqual([]);
    } finally {
      leistenMessung.breite = alt;
    }
  });

  it('Zeilenknopf „Aktionen“: „Mail an den Zahler“ ohne abgelegte Datei gesperrt mit Grund; ohne Nummer neutral benannt', async () => {
    const p = useAva.getState().projekt!;
    const d: RechnungsDatensatz = { id: 'r-ohne', gewerk: p.ava.rechnungen[0]?.gewerk ?? 'G8', nr: '', art: 'AR', lfd: 1, firma: 'Ohne GmbH', betrag: 100, status: 'erfasst', erfasst: '2025-01-01' };
    useAva.setState({ projekt: { ...p, ava: { ...p.ava, rechnungen: [...p.ava.rechnungen, d] } } });
    await zeige(createElement(RechnungenAnsicht));
    await warte(() => host.querySelector('button[aria-label="Aktionen"]'));
    const aktionen = [...host.querySelectorAll<HTMLButtonElement>('button[aria-label="Aktionen"]')].find((b) => b.title.startsWith('Aktionen für die Rechnung'))!;
    expect(aktionen).toBeTruthy();
    expect(aktionen.title).not.toContain('Nr.');
    expect(await waehle(aktionen, 'Mail an den Zahler …')).toEqual({ gesperrt: true, hinweis: 'Erst ablegen' });
  });
});
