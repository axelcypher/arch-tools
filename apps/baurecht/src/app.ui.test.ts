// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readProjectFile } from '@core/archive';
import { baurechtAusRoh } from '@core/baurecht/projekt';
import { projektdateiRoh } from '@core/projektdatei';
import { farbschemaWechseln } from '@core/ui/rauchtest';

// Speichern (Web): die Datei, die heruntergeladen würde, wird hier aufgefangen und danach gelesen
let geschrieben: Uint8Array | null = null;
vi.mock('@core/platform/files', async (original) => ({
  ...(await original<typeof import('@core/platform/files')>()),
  saveBinaryFile: vi.fn(async (o: { data: Uint8Array }) => {
    geschrieben = o.data;
    return true;
  }),
}));

const { App, speichern } = await import('./App');
const { beispielOap } = await import('./beispiel.test');
const { useBaurecht } = await import('./store');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
function render(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(App));
  });
  return host;
}
const knopf = (host: ParentNode, text: string | RegExp) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => (typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? '')));
const tippen = (el: HTMLTextAreaElement | HTMLInputElement, wert: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, wert);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

/** die Prüfung des Antrags, wie sie in der zuletzt geschriebenen Datei steht */
const inDatei = () => baurechtAusRoh(projektdateiRoh(geschrieben!)).pruefungen['BAUA 1'];

/** ersten Paragrafen wählen und von Hand festlegen */
function festlegen(host: HTMLElement, grund: string, ampel?: 'rot' | 'gelb' | 'gruen'): string {
  act(() => host.querySelector<HTMLButtonElement>('.br-paragraf')!.click());
  act(() => knopf(host, /^(Von Hand festlegen|Festlegung ändern) …$/)!.click());
  const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('von Hand festlegen'))!;
  if (ampel) {
    const i = ['rot', 'gelb', 'gruen'].indexOf(ampel);
    act(() => dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')[i].click());
  }
  tippen(dialog.querySelector('textarea')!, grund);
  act(() => knopf(dialog, 'Festlegen')!.click());
  return useBaurecht.getState().auswahl!;
}

/** speichern und im Bestätigungsdialog antworten */
async function speichernMit(antwort: 'Bestätigen und speichern' | 'Ohne diese Angaben speichern' | 'Abbrechen'): Promise<HTMLElement> {
  let fertig: Promise<boolean> | null = null;
  await act(async () => {
    fertig = speichern();
  });
  const best = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Angaben von Hand bestätigen'))!;
  expect(best).toBeTruthy();
  const inhalt = best.cloneNode(true) as HTMLElement;
  if (antwort === 'Bestätigen und speichern') {
    expect(knopf(best, antwort)!.disabled).toBe(true);
    act(() => best.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  }
  await act(async () => {
    knopf(best, antwort)!.click();
    await fertig;
  });
  return inhalt;
}

describe('Baurecht – Oberfläche', () => {
  beforeEach(() => {
    geschrieben = null;
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  });
  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = '';
  });

  it('zeigt Kopf, Bilanz, Angaben, Vorschriften; Ampel immer mit Wort; Farbschema wechselt', () => {
    const host = render();
    expect(host.textContent).toContain('Antragsmerkmale');
    expect(host.querySelector('.br-bilanz')?.textContent).toMatch(/gilt.*prüfen.*entfällt/);
    const ampeln = [...host.querySelectorAll('.br-paragraf .br-ampel')];
    expect(ampeln.length).toBeGreaterThan(10);
    for (const a of ampeln) expect(a.textContent).toMatch(/gilt|prüfen|entfällt/);
    expect(farbschemaWechseln(host, 'Dunkel')).toBe('dunkel');
    expect(farbschemaWechseln(host, 'Hell')).toBe('hell');
  });

  it('Paragraf wählen → Einzelheiten; von Hand festlegen nur mit Begründung; beim Speichern zweite Bestätigung', async () => {
    const host = render();
    const zeile = host.querySelector<HTMLButtonElement>('.br-paragraf')!;
    act(() => zeile.click());
    expect(host.querySelector('.br-detail h3')?.textContent).toBe('Begründung');
    act(() => knopf(host, 'Von Hand festlegen …')!.click());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain('von Hand festlegen');
    // Vorgabe ist die automatische Ampel (keine voreingestellte Herabstufung)
    expect(dialog.querySelector('.br-meldung-warn')).toBeNull();
    // ohne Begründung: Meldung, keine Festlegung
    act(() => knopf(dialog, 'Festlegen')!.click());
    expect(dialog.textContent).toMatch(/Bitte begründen/);
    expect(Object.keys(useBaurecht.getState().pruefung.festlegungen)).toHaveLength(0);
    tippen(dialog.querySelector('textarea')!, 'Abstimmung mit der Bauaufsicht am 05.11.2026');
    act(() => knopf(dialog, 'Festlegen')!.click());
    const ids = Object.keys(useBaurecht.getState().pruefung.festlegungen);
    expect(ids).toHaveLength(1);
    expect(host.querySelector('.br-marke-entwurf')).not.toBeNull();

    await speichernMit('Bestätigen und speichern');
    // in der geschriebenen Datei: bestätigt
    expect(inDatei().festlegungen[ids[0]].bestaetigt).toMatch(/^\d{4}-/);
    expect(useBaurecht.getState().pruefung.festlegungen[ids[0]].bestaetigt).toMatch(/^\d{4}-/);
  });

  it('„Ohne diese Angaben speichern“: Entwurf bleibt in der App, nicht in der Datei', async () => {
    const host = render();
    festlegen(host, 'Sonderfall laut Vorbescheid vom 01.10.2026');
    const id = Object.keys(useBaurecht.getState().pruefung.festlegungen)[0];
    await speichernMit('Ohne diese Angaben speichern');
    expect(inDatei()?.festlegungen[id]).toBeUndefined();
    const f = useBaurecht.getState().pruefung.festlegungen[id];
    expect(f).toBeTruthy();
    expect(f.bestaetigt).toBeUndefined();
  });

  it('geänderte bestätigte Festlegung „ohne“ gespeichert: in der Datei bleibt die bestätigte', async () => {
    const host = render();
    festlegen(host, 'Erste Festlegung, mit Bauaufsicht abgestimmt', 'rot');
    const id = Object.keys(useBaurecht.getState().pruefung.festlegungen)[0];
    await speichernMit('Bestätigen und speichern');
    expect(inDatei().festlegungen[id]).toMatchObject({ ampel: 'rot' });
    // ändern (Herabstufung auf grün) und ohne Bestätigung speichern
    festlegen(host, 'Zweite Festlegung, noch nicht abgestimmt', 'gruen');
    expect(useBaurecht.getState().pruefung.festlegungen[id]).toMatchObject({ ampel: 'gruen' });
    await speichernMit('Ohne diese Angaben speichern');
    expect(inDatei().festlegungen[id]).toMatchObject({ ampel: 'rot', grund: 'Erste Festlegung, mit Bauaufsicht abgestimmt' });
    expect(inDatei().festlegungen[id].bestaetigt).toMatch(/^\d{4}-/);
    // in der App bleibt der Entwurf
    expect(useBaurecht.getState().pruefung.festlegungen[id]).toMatchObject({ ampel: 'gruen' });
    expect(useBaurecht.getState().pruefung.festlegungen[id].bestaetigt).toBeUndefined();
  });

  it('Aufheben einer bestätigten Festlegung braucht die zweite Bestätigung', async () => {
    const host = render();
    festlegen(host, 'Festlegung mit Begründung aus der Abstimmung', 'rot');
    const id = Object.keys(useBaurecht.getState().pruefung.festlegungen)[0];
    await speichernMit('Bestätigen und speichern');
    act(() => knopf(host, /Festlegung aufheben/)!.click());
    expect(useBaurecht.getState().pruefung.festlegungen[id]).toBeUndefined();
    const dialog = await speichernMit('Ohne diese Angaben speichern');
    expect(dialog.textContent).toMatch(/Festlegung aufgehoben/);
    expect(inDatei().festlegungen[id]).toMatchObject({ ampel: 'rot' });
    expect(useBaurecht.getState().pruefung.festlegungen[id]).toBeUndefined();
    await speichernMit('Bestätigen und speichern');
    expect(inDatei().festlegungen[id]).toBeUndefined();
  });

  it('Hinweis bestätigen nur mit Begründung; die Bestätigung wird beim Speichern noch einmal abgefragt', async () => {
    const host = render();
    act(() => knopf(host, 'alle')?.click());
    const b = knopf(host, 'Bestätigen …');
    expect(b, 'mindestens eine Angabe ist nur Hinweis').toBeTruthy();
    act(() => b!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Worauf gestützt'))!;
    act(() => knopf(dialog, 'Bestätigen')!.click());
    expect(dialog.textContent).toMatch(/Bitte angeben, worauf/);
    expect(Object.values(useBaurecht.getState().pruefung.fakten).some((f) => f.bestaetigt)).toBe(false);
    tippen(dialog.querySelector('textarea')!, 'Flächen im Modell vollständig, geprüft am 12.11.2026');
    act(() => knopf(dialog, 'Bestätigen')!.click());
    const [id] = Object.entries(useBaurecht.getState().pruefung.fakten).find(([, f]) => f.bestaetigt)!;
    const inhalt = await speichernMit('Ohne diese Angaben speichern');
    expect(inhalt.textContent).toMatch(/Hinweis bestätigt/);
    expect(inDatei()?.fakten[id]?.bestaetigt).toBeUndefined();
    expect(useBaurecht.getState().pruefung.fakten[id].bestaetigt?.grund).toMatch(/vollständig/);
    await speichernMit('Bestätigen und speichern');
    expect(inDatei().fakten[id].bestaetigt).toMatchObject({ grund: 'Flächen im Modell vollständig, geprüft am 12.11.2026' });
  });

  it('Schutzgebiet von Hand setzen nur mit Beleg; ändert sich die Angabe währenddessen, wird abgebrochen', async () => {
    const host = render();
    act(() => knopf(host, 'alle')?.click());
    const zeile = [...host.querySelectorAll<HTMLElement>('.br-fakt')].find((z) => /Landschaftsschutzgebiet/.test(z.textContent ?? ''))!;
    expect(zeile, 'Zeile Landschaftsschutzgebiet').toBeTruthy();
    act(() => knopf(zeile, 'nein')!.click());
    // noch nichts gesetzt – erst der Dialog mit Begründung
    expect(useBaurecht.getState().pruefung.fakten['schutz.lsg']).toBeUndefined();
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('von Hand setzen'))!;
    expect(dialog.textContent).toMatch(/Vorschrift|ändert dadurch/);
    tippen(dialog.querySelector('textarea')!, 'Auskunft UNB vom 03.11.2026, Az. 61-123');
    // währenddessen liefert „Lage abfragen“ einen Treffer
    act(() => useBaurecht.getState().geoFakten({ 'schutz.lsg': { wert: true, herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'LINFOS' } }));
    act(() => knopf(dialog, 'Übernehmen')!.click());
    expect(dialog.textContent).toMatch(/inzwischen geändert/);
    expect(useBaurecht.getState().pruefung.fakten['schutz.lsg']).toMatchObject({ wert: true, herkunft: 'geodienst' });
  });

  it('Merkmal ändern wirkt sofort auf die Ampeln und gilt als ungespeicherte Änderung', () => {
    const host = render();
    const vorher = host.querySelector('.br-bilanz')!.textContent;
    act(() => knopf(host.querySelector('[data-merkmal="Planungsrecht"]')!, 'Außenbereich')!.click());
    expect(host.querySelector('.br-bilanz')!.textContent).not.toBe(vorher);
    expect(host.querySelector('.titlebar-dirty')).not.toBeNull();
  });
});
