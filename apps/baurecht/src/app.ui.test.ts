// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { MockInstance } from 'vitest';
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

const { App, speichern, speichernVollstaendig } = await import('./App');
const { werteSenkrecht } = await import('./components/Angaben');
const { beispielOap } = await import('./beispiel.test');
const { useBaurecht } = await import('./store');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// mehrere volle Auswertungen je Speichern (Folgen je Punkt) – bei paralleler Last mehr als die 5 s der Vorgabe
vi.setConfig({ testTimeout: 20000 });

// Ausblendungen nach echter Zeit anhalten – „Gespeichert“ im Kopf nach 4 s (components/Kopf.tsx, GespeichertMeldung) und
// die Ansage nach 1,5 s (components/Angaben.tsx): Auf langsamen Runnern (Windows im Release-Lauf) war die Meldung beim
// Prüfen sonst schon weg. Kürzere Fristen (Entprellen, Fokus) laufen echt weiter; vi.useFakeTimers() ersetzt den Spion
// und prüft die Ausblendung selbst (je ein Test für 4 s und 1,5 s). Wer die Fristen in Kopf.tsx oder Angaben.tsx ändert,
// zieht AUSBLENDEN_MS mit – die beiden Tests mit falschen Uhren schlagen sonst an.
const AUSBLENDEN_MS = new Set([1500, 4000]);
const echtesSetTimeout = globalThis.setTimeout;
let ausblendenAngehalten: MockInstance<typeof setTimeout> | null = null;
beforeEach(() => {
  ausblendenAngehalten = vi
    .spyOn(globalThis, 'setTimeout')
    .mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) =>
      AUSBLENDEN_MS.has(ms ?? 0) ? (0 as unknown as ReturnType<typeof setTimeout>) : echtesSetTimeout(fn, ms, ...args)) as typeof setTimeout);
});
afterEach(() => {
  ausblendenAngehalten?.mockRestore();
  ausblendenAngehalten = null;
});

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
const knopf = (host: ParentNode, text: string | RegExp) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => (typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? '')));
/**
 * warten, bis „Prüfung abschließen“ bedienbar ist (die Texte der Web-Version sind geladen) – nach Zustand statt fester
 * Zeit, mit einer Grenze unter dem testTimeout und klarer Meldung, falls es nicht so weit kommt (langsame Runner)
 */
async function bisAbschliessbar(d: ParentNode): Promise<void> {
  await vi.waitFor(
    async () => {
      await act(async () => void (await new Promise((r) => echtesSetTimeout(r, 20))));
      expect(knopf(d, 'Prüfung abschließen')!.disabled, '„Prüfung abschließen“ ist noch gesperrt (Texte werden geholt)').toBe(false);
    },
    { timeout: 15000, interval: 50 },
  );
}
const tippen = (el: HTMLTextAreaElement | HTMLInputElement, wert: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, wert);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

/** die Prüfung des Antrags, wie sie in der zuletzt geschriebenen Datei steht */
const inDatei = () => baurechtAusRoh(projektdateiRoh(geschrieben!)).pruefungen['BAUA 1'];

/** ersten Paragrafen wählen und von Hand festlegen */
function festlegen(host: HTMLElement, grund: string, ampel?: 'rot' | 'gelb' | 'gruen', id?: string): string {
  // ohne Kennung der erste Paragraf; mit Kennung genau dieser (die Liste ordnet nach Ampel um)
  act(() => host.querySelector<HTMLButtonElement>(id ? `[data-roving="p:${CSS.escape(id)}"]` : '.br-paragraf')!.click());
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
async function speichernMit(antwort: 'Bestätigen und speichern' | 'Speichern, diese als Entwurf behalten' | 'Abbrechen'): Promise<HTMLElement> {
  let fertig: Promise<boolean> | null = null;
  await act(async () => {
    fertig = speichern();
  });
  const best = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Vor dem Speichern bestätigen'))!;
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

/** speichern, wenn nichts zu bestätigen ist */
async function speichernOhneDialog(): Promise<void> {
  await act(async () => {
    await speichern();
  });
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
    // Designsystem: Statuspunkt und Umschalter aus den Grund-Styles, keine eigenen Varianten
    for (const a of ampeln) expect(a.querySelector('.statuspunkt.ok, .statuspunkt.warnung, .statuspunkt.fehler')).not.toBeNull();
    const filter = [...host.querySelectorAll('.br-bilanz > button')];
    expect(filter.map((b) => b.querySelector('.statuspunkt')?.className)).toEqual(['statuspunkt fehler', 'statuspunkt warnung', 'statuspunkt ok']);
    expect(host.querySelector('.br-bilanz')!.classList.contains('segment')).toBe(true);
    expect(host.querySelector('.br-segment, .br-segment-senkrecht, .br-ampel-punkt')).toBeNull();
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
    expect(dialog.querySelector('.meldung.warnung')).toBeNull();
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

  it('„Speichern, diese als Entwurf behalten“: Entwurf bleibt in der App, nicht in der Datei', async () => {
    const host = render();
    festlegen(host, 'Sonderfall laut Vorbescheid vom 01.10.2026');
    const id = Object.keys(useBaurecht.getState().pruefung.festlegungen)[0];
    await speichernMit('Speichern, diese als Entwurf behalten');
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
    festlegen(host, 'Zweite Festlegung, noch nicht abgestimmt', 'gruen', id);
    expect(useBaurecht.getState().pruefung.festlegungen[id]).toMatchObject({ ampel: 'gruen' });
    await speichernMit('Speichern, diese als Entwurf behalten');
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
    const dialog = await speichernMit('Speichern, diese als Entwurf behalten');
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
    const inhalt = await speichernMit('Speichern, diese als Entwurf behalten');
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
    // Dialog schließen (getippte Begründung: erst nachfragen, dann verwerfen)
    act(() => knopf(dialog, 'Abbrechen')!.click());
    act(() => knopf(dialog, 'Verwerfen')!.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('Tastatur: die Liste ist ein Tabstopp, ↑/↓, Pos1/Ende wählen; F6 springt zwischen den Bereichen', () => {
    const host = render();
    const stopps = host.querySelectorAll('.br-vorschriften-liste [data-roving][tabindex="0"]');
    expect(stopps.length).toBe(1);
    const liste = host.querySelector<HTMLElement>('.br-vorschriften-liste')!;
    act(() => (stopps[0] as HTMLElement).focus());
    const taste = (key: string, ziel: EventTarget = document.activeElement ?? liste) => act(() => void ziel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    taste('ArrowDown');
    taste('ArrowDown');
    const erste = useBaurecht.getState().auswahl;
    expect(erste).toBeTruthy();
    taste('ArrowDown');
    expect(useBaurecht.getState().auswahl).not.toBe(erste);
    taste('End');
    const letzte = [...liste.querySelectorAll<HTMLElement>('[data-roving]')].at(-1)!;
    expect(document.activeElement).toBe(letzte);
    // F6: weiter in die Einzelheiten
    taste('F6', window);
    expect(host.querySelector('.br-detail')!.contains(document.activeElement)).toBe(true);
  });

  it('Folgen-Vorschau: der Bestätigen-Dialog nennt die Zahl der Herabstufungen, und sie stimmt', async () => {
    const { lageKennung } = await import('@core/baurecht/geodienste');
    const k = useBaurecht.getState().project!.meta.koordinaten!;
    const lage = lageKennung(k.ost, k.nord);
    // Schutzgebiete: alle anderen bestätigt „nein“, das Naturschutzgebiet nur als Hinweis eines Geodienstes
    const { auswertungMit, herabstufungen } = await import('./pruefung');
    const ids = Object.entries(auswertungMit({}).faktDefs)
      .filter(([id, d]) => d.gruppe === 'schutz' && id.startsWith('schutz.'))
      .map(([id]) => id);
    const geo = Object.fromEntries(ids.map((id) => [id, { wert: false, herkunft: 'geodienst' as const, sicherheit: 'hinweis' as const, quelle: 'LINFOS', grund: 'kein Treffer', lage }]));
    act(() =>
      useBaurecht.setState({
        pruefung: {
          ...useBaurecht.getState().pruefung,
          fakten: Object.fromEntries(Object.entries(geo).map(([id, f]) => [id, id === 'schutz.nsg' ? f : { ...f, bestaetigt: { von: 'TP', am: '2026-11-12', grund: 'Auskunft UNB', lage } }])),
        },
      }),
    );
    const host = render();
    act(() => knopf(host, 'alle Angaben')?.click());
    const zeile = [...host.querySelectorAll<HTMLElement>('.br-fakt')].find((z) => /Naturschutzgebiet/.test(z.textContent ?? '') && !!knopf(z, 'Bestätigen …'))!;
    act(() => knopf(zeile, 'Bestätigen …')!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Worauf gestützt'))!;
    const m = /Stuft (\d+) Vorschrift/.exec(dialog.textContent ?? '');
    expect(m, 'Vorschau mit Zahl').toBeTruthy();
    const s = useBaurecht.getState();
    const jetzt = auswertungMit(s.pruefung.fakten);
    const mit = auswertungMit({ ...s.pruefung.fakten, 'schutz.nsg': { ...s.pruefung.fakten['schutz.nsg'], bestaetigt: { von: '', am: '', lage } } });
    expect(Number(m![1])).toBeGreaterThan(0);
    expect(Number(m![1])).toBe(herabstufungen(jetzt, mit).length);
    act(() => knopf(dialog, 'Abbrechen')!.click());
  });

  it('ohne Koordinaten: eine Angabe mit Lagebezug lässt sich nicht bestätigen (bliebe wirkungslos), die Zeile sagt warum', () => {
    act(() => useBaurecht.getState().geoFakten({ 'schutz.lsg': { wert: false, herkunft: 'geodienst', sicherheit: 'hinweis', quelle: 'LINFOS', grund: 'kein Treffer' } }));
    const p = useBaurecht.getState().project!;
    act(() => useBaurecht.setState({ project: { ...p, meta: { ...p.meta, koordinaten: undefined } } }));
    const host = render();
    act(() => knopf(host, 'alle Angaben')?.click());
    const zeile = host.querySelector<HTMLElement>('[data-fakt="schutz.lsg"]')!;
    expect(zeile.textContent).toMatch(/ohne gültige Koordinaten nicht bestätigbar/);
    expect(knopf(zeile, 'Bestätigen …')).toBeUndefined();
    // der Kopf sagt, dass die Koordinaten fehlen
    expect(host.querySelector('.br-kopf')!.textContent).toMatch(/Keine Koordinaten/);
  });

  it('Pfeiltasten in Auswahlgruppen: →/← wandern (mit Umlauf), Pos1/Ende springen', () => {
    const host = render();
    if (!host.querySelector('[data-merkmal="Planungsrecht"]')) act(() => knopf(host, /Antragsmerkmale/)!.click());
    const gruppe = host.querySelector<HTMLElement>('[data-merkmal="Planungsrecht"] .segment')!;
    const knoepfe = [...gruppe.querySelectorAll<HTMLButtonElement>(':scope > button')];
    expect(knoepfe.length).toBeGreaterThan(2);
    const taste = (key: string) => act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    act(() => knoepfe[0].focus());
    taste('ArrowRight');
    expect(document.activeElement).toBe(knoepfe[1]);
    taste('End');
    expect(document.activeElement).toBe(knoepfe.at(-1));
    taste('ArrowRight');
    expect(document.activeElement).toBe(knoepfe[0]);
    taste('ArrowLeft');
    expect(document.activeElement).toBe(knoepfe.at(-1));
    taste('Home');
    expect(document.activeElement).toBe(knoepfe[0]);
  });

  it('F6 ohne gewählten Paragrafen: die Einzelheiten bekommen selbst den Fokus, nichts hängt', () => {
    act(() => useBaurecht.getState().waehlen(null));
    const host = render();
    const liste = host.querySelector<HTMLElement>('.br-vorschriften-liste [data-roving][tabindex="0"]')!;
    act(() => liste.focus());
    const f6 = (shift = false) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', shiftKey: shift, bubbles: true })));
    f6();
    expect(document.activeElement).toBe(host.querySelector('.br-detail'));
    f6();
    expect(host.querySelector('.br-kopf')!.contains(document.activeElement)).toBe(true);
    f6(true);
    expect(document.activeElement).toBe(host.querySelector('.br-detail'));
    f6(true);
    expect(host.querySelector('.br-vorschriften-liste')!.contains(document.activeElement)).toBe(true);
  });

  it('Festlegung aufheben: Fokus auf „Von Hand festlegen …“, Rückgängig stellt sie wieder her', () => {
    const host = render();
    const id = festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'rot');
    const vorher = structuredClone(useBaurecht.getState().pruefung.festlegungen[id]);
    act(() => knopf(host, 'Festlegung aufheben')!.click());
    expect(useBaurecht.getState().pruefung.festlegungen[id]).toBeUndefined();
    expect(document.activeElement?.textContent).toBe('Von Hand festlegen …');
    expect(host.querySelector('.br-aufgehoben')?.textContent).toMatch(/Festlegung aufgehoben/);
    act(() => knopf(host, 'Rückgängig')!.click());
    expect(useBaurecht.getState().pruefung.festlegungen[id]).toEqual(vorher);
    expect(host.querySelector('.br-aufgehoben')).toBeNull();
  });

  it('Prüfprotokoll: Name des Dialogs, Festlegungen und gesicherte Angaben vor den offenen Punkten, Sperrgrund sichtbar', () => {
    const host = render();
    festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'rot');
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    expect(d.getAttribute('aria-label')).toMatch(/^Baurechtliche Prüfung vor dem Einreichen – BAUA 1/);
    const h2 = [...d.querySelectorAll('h2')].map((h) => h.textContent ?? '');
    const i = (t: string) => h2.findIndex((x) => x.startsWith(t));
    expect(i('Grundlagen')).toBeLessThan(i('Festlegungen von Hand'));
    expect(i('Festlegungen von Hand')).toBeLessThan(i('Gesicherte Angaben'));
    expect(i('Gesicherte Angaben')).toBeLessThan(i('Offene Punkte'));
    expect(d.querySelector('.br-protokoll-offen thead')?.textContent).toMatch(/Was fehlt.*Anzahl.*Paragrafen/);
    expect(d.textContent).toMatch(/Angaben von Hand ohne Beleg/);
    // Entwurf: Abschließen gesperrt, der Grund steht sichtbar daneben
    expect(knopf(d, 'Prüfung abschließen')!.disabled).toBe(true);
    expect(d.querySelector('.br-sperre')?.textContent).toMatch(/Erst speichern/);
    // keine doppelten Kurzformen in den Überschriften der Normen
    for (const h3 of d.querySelectorAll('.br-protokoll-norm h3')) expect(h3.textContent).not.toMatch(/\(([^()]+)\) \(\1\)/);
    act(() => knopf(d, 'Schließen')!.click());
  });

  it('Protokoll: Startfokus auf der Aktionsleiste, nach Esc bzw. „Schließen“ zurück auf „Prüfprotokoll“', async () => {
    const host = render();
    const pause = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
    for (const zu of ['Esc', 'Schließen']) {
      const oeffnen = knopf(host, 'Prüfprotokoll …')!;
      // wie ein Mausklick im Browser: der Knopf hat den Fokus, dann öffnet er das Protokoll
      act(() => oeffnen.focus());
      act(() => oeffnen.click());
      await pause();
      const d = document.querySelector<HTMLElement>('.br-protokoll')!;
      expect(document.activeElement?.closest('.br-protokoll-aktionen'), 'Startfokus in der Aktionsleiste').toBeTruthy();
      if (zu === 'Esc') act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
      else act(() => knopf(d, 'Schließen')!.click());
      await pause();
      expect(document.querySelector('.br-protokoll')).toBeNull();
      expect(document.activeElement, `Fokus nach ${zu}`).toBe(knopf(host, 'Prüfprotokoll …'));
    }
  });

  it('Fokusfalle im Protokoll: Tab bleibt drin; liegt ein Dialog darüber, führt der den Fokus', () => {
    const host = render();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    const ziele = [...d.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')];
    const tab = (shift = false) => act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true })));
    act(() => ziele.at(-1)!.focus());
    tab();
    expect(document.activeElement).toBe(ziele[0]);
    tab(true);
    expect(document.activeElement).toBe(ziele.at(-1));
    // ein Dialog über dem Protokoll: die Falle greift nicht ein
    const modal = document.createElement('div');
    modal.className = 'modal';
    const b = document.createElement('button');
    modal.appendChild(b);
    document.body.appendChild(modal);
    act(() => b.focus());
    tab();
    expect(document.activeElement).toBe(b);
    modal.remove();
    act(() => knopf(d, 'Schließen')!.click());
  });

  it('Kopf: „Gemeinde unbestätigt“ ist ein Knopf und führt zum Gemeindeschlüssel', () => {
    const host = render();
    const k = knopf(host.querySelector('.br-kopf')!, 'Gemeinde unbestätigt');
    expect(k, 'Marke als Knopf').toBeTruthy();
    act(() => k!.click());
    // die Angaben-Leiste übernimmt den Fokuswunsch: der Fokus steht in der Zeile des Gemeindeschlüssels
    expect(document.activeElement?.closest('.br-fakt')?.textContent).toMatch(/Gemeinde/);
  });

  it('Verlassen mit Entwürfen: „als Entwurf behalten“ meldet nicht „gespeichert“, die Entwürfe bleiben', async () => {
    const host = render();
    const id = festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'rot');
    let ergebnis: Promise<boolean> | null = null;
    await act(async () => {
      ergebnis = speichernVollstaendig();
    });
    const best = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Vor dem Speichern bestätigen'))!;
    await act(async () => knopf(best, 'Speichern, diese als Entwurf behalten')!.click());
    // Meldung: die Entwürfe bleiben offen – erst nach „OK“ kommt das Ergebnis
    const meldung = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')].find((d) => d.textContent?.includes('Entwürfe bleiben offen'));
    expect(meldung, 'Meldung „Entwürfe bleiben offen“').toBeTruthy();
    await act(async () => knopf(meldung!, /OK/)!.click());
    expect(await ergebnis!).toBe(false);
    expect(useBaurecht.getState().pruefung.festlegungen[id]).toBeTruthy();
    expect(useBaurecht.getState().pruefung.festlegungen[id].bestaetigt).toBeUndefined();
  });

  it('Vorschau mit Widerspruch: der Bestätigen-Dialog sagt, dass der Widerspruch bleibt', async () => {
    const { angabeVonHand } = await import('@core/baurecht/angaben');
    const ags = angabeVonHand({ wert: '05974036', herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'ALKIS' }, 'lage.ags', '05974040', { von: 'TP', heute: '2026-11-12' });
    act(() => useBaurecht.setState({ pruefung: { ...useBaurecht.getState().pruefung, fakten: { 'lage.ags': ags } } }));
    const host = render();
    act(() => knopf(host, 'alle Angaben')?.click());
    const zeile = [...host.querySelectorAll<HTMLElement>('.br-fakt')].find((z) => /Gemeindeschlüssel/.test(z.textContent ?? '') && !!knopf(z, 'Bestätigen …'))!;
    act(() => knopf(zeile, 'Bestätigen …')!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Worauf gestützt'))!;
    expect(dialog.textContent).toMatch(/Widerspruch bleibt: ALKIS meldet „05974036“/);
    act(() => knopf(dialog, 'Abbrechen')!.click());
  });

  it('Filter-Menü: Esc im Menü schließt und gibt den Fokus zurück; Esc in einem Dialog lässt es in Ruhe; Tab hinaus schließt', () => {
    const host = render();
    const menue = host.querySelector<HTMLDetailsElement>('.br-filter-menue')!;
    const summary = menue.querySelector('summary')!;
    act(() => {
      menue.open = true;
    });
    const kasten = menue.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    act(() => kasten.focus());
    act(() => void kasten.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(menue.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    // Esc außerhalb (z. B. in einem Dialog) schließt das Menü nicht
    act(() => {
      menue.open = true;
    });
    const fremd = document.createElement('button');
    document.body.appendChild(fremd);
    act(() => void fremd.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(menue.open).toBe(true);
    // Fokus verlässt das Menü: schließen
    act(() => kasten.focus());
    act(() => {
      kasten.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: fremd }));
    });
    expect(menue.open).toBe(false);
    fremd.remove();
  });

  it('Farbschema-Menü: Fokus hinein, ↑/↓ bewegen, Esc schließt und gibt den Fokus zurück', () => {
    const host = render();
    const knopfSchema = host.querySelector<HTMLButtonElement>('.titlebar-menu > button[aria-haspopup="menu"]')!;
    act(() => knopfSchema.focus());
    act(() => knopfSchema.click());
    const optionen = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(optionen.length).toBe(3);
    expect(optionen).toContain(document.activeElement);
    const vorher = document.activeElement;
    act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement).not.toBe(vorher);
    act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[role="menuitemradio"]')).toBeNull();
    expect(document.activeElement).toBe(knopfSchema);
  });

  it('zweite Bestätigung: eine überholte Festlegung wird angesagt und lässt sich so nicht bestätigen', async () => {
    const host = render();
    const id = festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'gelb');
    const fl = useBaurecht.getState().pruefung.festlegungen[id];
    // eine beteiligte Angabe hat sich seit dem Festlegen geändert (damals „Beseitigung“): die Festlegung ist überholt
    act(() => useBaurecht.setState({ pruefung: { ...useBaurecht.getState().pruefung, festlegungen: { [id]: { ...fl, fakten: { ...fl.fakten, 'merkmal:Vorhaben': 'Beseitigung' } } } } }));
    let fertig: Promise<boolean> | null = null;
    await act(async () => {
      fertig = speichern();
    });
    const best = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Vor dem Speichern bestätigen'))!;
    expect(best.textContent).toMatch(/Überholt:/);
    expect(best.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true);
    expect(knopf(best, 'Bestätigen und speichern')!.disabled).toBe(true);
    await act(async () => knopf(best, 'Abbrechen')!.click());
    expect(await fertig!).toBe(false);
  });

  it('nach „Bestätigen“ einer Angabe bleibt der Fokus in ihrer Zeile', () => {
    const host = render();
    act(() => knopf(host, 'alle Angaben')?.click());
    const b = [...host.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === 'Bestätigen …' && !x.closest('.br-fakt')?.textContent?.includes('Gemeindeschlüssel'))!;
    expect(b, 'ein Hinweis zum Bestätigen').toBeTruthy();
    const id = b.closest<HTMLElement>('[data-fakt]')!.dataset.fakt!;
    expect(b.getAttribute('aria-label')).toMatch(/ bestätigen …$/);
    act(() => b.focus());
    act(() => b.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Worauf gestützt'))!;
    tippen(dialog.querySelector('textarea')!, 'Modell vollständig geprüft am 12.11.2026');
    vi.useFakeTimers();
    act(() => knopf(dialog, 'Bestätigen')!.click());
    act(() => void vi.runAllTimers());
    vi.useRealTimers();
    expect(document.activeElement?.closest('[data-fakt]')?.getAttribute('data-fakt')).toBe(id);
  });

  it('Angaben: Suche findet den kurzen Namen; Merkmale tragen denselben kurzen Namen wie im Regelbaum', () => {
    const host = render();
    act(() => knopf(host, 'alle Angaben')?.click());
    const suche = host.querySelector<HTMLInputElement>('input[aria-label="Angaben durchsuchen"]')!;
    tippen(suche, 'unsicherer Untergrund');
    expect(host.querySelector('[data-fakt="lage.bergbau"]'), 'über den kurzen Namen gefunden').not.toBeNull();
    tippen(suche, '');
    if (!host.querySelector('[data-merkmal="Gebäudeart"]')) act(() => knopf(host, /Antragsmerkmale/)!.click());
    const titel = host.querySelector('[data-merkmal="Gebäudeart"] .br-fakt-titel')!;
    expect(titel.firstChild?.textContent).toBe('Gebäudeart');
    expect(titel.querySelector('.br-fakt-frage')?.textContent).toMatch(/Art des Gebäudes/);
  });

  it('Anzahlen (Stellplätze) werden ganzzahlig übernommen – angezeigt und gespeichert gleich', () => {
    const host = render();
    act(() => knopf(host, 'alle Angaben')?.click());
    const feld = host.querySelector<HTMLInputElement>('[data-fakt="gebaeude.stellplaetze"] input')!;
    expect(feld, 'Eingabe Stellplätze').toBeTruthy();
    act(() => feld.focus());
    tippen(feld, '5,5');
    act(() => {
      feld.dispatchEvent(new FocusEvent('blur'));
      feld.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      feld.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    const w = useBaurecht.getState().pruefung.fakten['gebaeude.stellplaetze']?.wert;
    expect(w).toBe(6);
  });

  it('Plausibilität: Einfamilienhaus (Errichtung) auf „verfahrensfrei“ gestellt → Warnung über den Angaben und im Protokoll', () => {
    const host = render();
    const satz = /Verfahren „verfahrensfrei“ festgelegt, die Errichtung eines Wohngebäudes \(Einfamilienhaus\) ist aber nicht verfahrensfrei \(§ 62 Abs\. 1 BauO NRW\)/;
    expect(host.querySelector('.br-angaben-liste')!.textContent).not.toMatch(satz);
    if (!host.querySelector('[data-merkmal="Verfahren"]')) act(() => knopf(host, /Antragsmerkmale/)!.click());
    act(() => knopf(host.querySelector('[data-merkmal="Verfahren"]')!, 'verfahrensfrei')!.click());
    const warnung = [...host.querySelectorAll('.br-angaben-liste .meldung.warnung')].find((w) => satz.test(w.textContent ?? ''));
    expect(warnung, 'Warnung über den Angaben').toBeTruthy();
    act(() => knopf(host, /Prüfprotokoll/)!.click());
    expect(document.querySelector('.br-protokoll')!.textContent).toMatch(satz);
  });

  it('Merkmal ändern wirkt sofort auf die Ampeln und gilt als ungespeicherte Änderung', () => {
    const host = render();
    const vorher = host.querySelector('.br-bilanz')!.textContent;
    // alle Merkmale festgelegt: die Gruppe ist eingeklappt – aufklappen
    if (!host.querySelector('[data-merkmal="Planungsrecht"]')) act(() => knopf(host, /Antragsmerkmale/)!.click());
    act(() => knopf(host.querySelector('[data-merkmal="Planungsrecht"]')!, 'Außenbereich')!.click());
    expect(host.querySelector('.br-bilanz')!.textContent).not.toBe(vorher);
    expect(host.querySelector('.titlebar-dirty')).not.toBeNull();
  });

  it('Rückfrage beim Verlassen nennt, was ungespeichert ist: die Baurechtsprüfung, nicht das ganze Projekt', async () => {
    const host = render();
    if (!host.querySelector('[data-merkmal="Planungsrecht"]')) act(() => knopf(host, /Antragsmerkmale/)!.click());
    act(() => knopf(host.querySelector('[data-merkmal="Planungsrecht"]')!, 'Außenbereich')!.click());
    act(() => host.querySelector<HTMLButtonElement>('.titlebar-projekte')!.click());
    await act(async () => void (await new Promise((r) => echtesSetTimeout(r, 0))));
    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"], [role="dialog"]')!;
    expect(dialog.textContent).toContain('Die Baurechtsprüfung hat ungespeicherte Änderungen.');
    expect(dialog.textContent).not.toContain('Das Projekt hat ungespeicherte Änderungen.');
    await act(async () => knopf(dialog, 'Abbrechen')!.click());
    // abgebrochen: die Projektübersicht öffnet nicht, die Änderung bleibt
    expect(document.querySelector('[role="alertdialog"], [role="dialog"]')).toBeNull();
    expect(host.querySelector('.titlebar-dirty')).not.toBeNull();
  });
});

describe('Designsystem: Rahmen-App und Umschalter', () => {
  let gesendet: Record<string, unknown>[] = [];
  const rahmen = { postMessage: (d: Record<string, unknown>) => gesendet.push(d) } as unknown as Window;
  const setUrl = (u: string) => (window as unknown as { happyDOM: { setURL: (u: string) => void } }).happyDOM.setURL(u);
  beforeEach(() => {
    gesendet = [];
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
    Object.defineProperty(window, 'parent', { value: rahmen, configurable: true });
    setUrl('http://localhost:3000/?rahmen=tab&app=baurecht');
  });
  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = '';
    Object.defineProperty(window, 'parent', { value: window, configurable: true });
    setUrl('http://localhost:3000/');
  });

  it('meldet Arkly mit den ungespeicherten Änderungen den Satz „Die Baurechtsprüfung hat …“', () => {
    const host = render();
    const status = () => gesendet.filter((d) => d.typ === 'arch-tools:status').at(-1);
    expect(status()?.dirty).toBe(false);
    if (!host.querySelector('[data-merkmal="Planungsrecht"]')) act(() => knopf(host, /Antragsmerkmale/)!.click());
    act(() => knopf(host.querySelector('[data-merkmal="Planungsrecht"]')!, 'Außenbereich')!.click());
    expect(status()?.dirty).toBe(true);
    expect(status()?.ungespeichert).toBe('Die Baurechtsprüfung hat ungespeicherte Änderungen.');
  });

  it('Merkmalwerte senkrecht bei langen oder vielen Werten – die gemeinsamen Segmente brechen nicht um', () => {
    expect(werteSenkrecht(['ja', 'nein'])).toBe(false);
    expect(werteSenkrecht(['Innenbereich', 'Außenbereich', 'B-Plan'])).toBe(false);
    expect(werteSenkrecht(['Innenbereich', 'Außenbereich', 'qualifizierter B-Plan'])).toBe(true);
    expect(werteSenkrecht(['1', '2', '3', '4', '5'])).toBe(false);
    // viele kurze Werte (eigene Werte aus PERMIO): die Reihe wäre zu lang
    expect(werteSenkrecht(['Wohnen', 'Gewerbe', 'Handel', 'Büro', 'Praxis', 'Lager', 'Garage', 'Sonstig'])).toBe(true);
    // viele einbuchstabige Werte (der Innenabstand je Knopf zählt mit) und zwei sehr lange Werte
    expect(werteSenkrecht('ABCDEFGHIJKL'.split(''))).toBe(true);
    expect(werteSenkrecht(['Bebauungsplan der Innenentwicklung', 'vorhabenbezogener Bebauungsplan'])).toBe(true);
  });
});

describe('Runde 14: Planungsrecht als Entwurf, eingeklappte Rückfragen', () => {
  beforeEach(() => {
    geschrieben = null;
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  });
  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = '';
  });
  const warten = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

  it('der Hinweis nennt vorher, was die Bestätigung klärt – die Zahl stimmt; danach „Entwurf“ mit „zurücknehmen“', async () => {
    const { auswertungMit } = await import('./pruefung');
    const host = render();
    // die Zahl kommt gedrosselt (zweite Auswertung höchstens alle 250 ms)
    await warten(400);
    await warten();
    const hinweis = host.querySelector<HTMLElement>('.br-planungsrecht-hinweis')!;
    const n = Number(/klärt (\d+)/.exec(hinweis.textContent ?? '')?.[1]);
    expect(n).toBeGreaterThan(0);
    const vorher = new Map(auswertungMit(useBaurecht.getState().pruefung.fakten).paragrafen.map((p) => [p.id, p.ampel]));
    act(() => knopf(hinweis, 'Für diesen Ort bestätigen')!.click());
    const nachher = auswertungMit(useBaurecht.getState().pruefung.fakten).paragrafen.filter((p) => vorher.get(p.id) !== p.ampel);
    expect(nachher.length).toBe(n);
    // am Merkmal: Entwurf (zählt schon, zweite Bestätigung beim Speichern), zurücknehmbar
    const merkmal = host.querySelector<HTMLElement>('[data-merkmal="Planungsrecht"]')!;
    expect(merkmal.querySelector('.br-merkmal-marken')?.textContent).toMatch(/Entwurf – beim Speichern bestätigen/);
    // im Protokoll als Entwurf, mit der Zahl der Paragrafen, die nur daran hängen
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    expect(d.textContent).toMatch(/Planungsrecht: .+ \(Entwurf – für diesen Ort bestätigt: /);
    expect(d.textContent).toContain(`${n} Paragrafen hängen an der noch nicht gespeicherten Bestätigung des Planungsrechts`);
    expect(d.textContent).toMatch(/Die Bestätigung des Planungsrechts ist noch nicht gespeichert/);
    act(() => knopf(d, 'Schließen')!.click());
    act(() => knopf(host.querySelector('[data-merkmal="Planungsrecht"]')!, 'zurücknehmen')!.click());
    expect(useBaurecht.getState().pruefung.planungsrechtOrt).toBeUndefined();
    expect(host.querySelector('[data-merkmal="Planungsrecht"] .br-info-marke')?.textContent).toMatch(/nicht für diesen Ort bestätigt/);
  });

  it('Einzelheiten: „Nicht gesichert: Planungsrecht“ führt zum Bestätigen am Merkmal', async () => {
    const { auswertungMit } = await import('./pruefung');
    const host = render();
    const p = auswertungMit(useBaurecht.getState().pruefung.fakten).paragrafen.find((x) => x.gruende.some((g) => g.startsWith('Nicht gesichert: Planungsrecht')))!;
    expect(p).toBeTruthy();
    act(() => useBaurecht.getState().waehlen(p.id));
    act(() => knopf(host.querySelector('.br-detail')!, 'Zum Bestätigen')!.click());
    await warten(150);
    expect(document.activeElement?.textContent).toBe('Für diesen Ort bestätigen');
  });

  it('eingeklappt: die beantwortete Rückfrage bleibt kompakt stehen, Fokus auf die nächste, zuletzt auf den Gruppenknopf', async () => {
    act(() => useBaurecht.getState().merkmalSetzen('Vorhaben', 'Beseitigung'));
    act(() => useBaurecht.setState({ merkmaleAuf: false }));
    const host = render();
    const gruppe = () => host.querySelector<HTMLElement>('#br-merkmale')!.closest('section')!;
    const rf = () => gruppe().querySelector<HTMLElement>('.br-rueckfrage')!;
    expect(rf().textContent).toMatch(/Umfang der Beseitigung/);
    act(() => knopf(rf(), 'Abbruch mit Ersatzbau')!.click());
    await warten();
    // die Antwort bleibt zu sehen, der Anlass steht über den Fragen zum Altbau
    expect(rf().querySelector('.br-rueckfrage-erledigt')?.textContent).toMatch(/Umfang der Beseitigung: Abbruch mit Ersatzbau/);
    expect(rf().contains(document.activeElement) && document.activeElement !== document.body).toBe(true);
    // alle weiteren beantworten (nein: verfahrenspflichtiger Abbruch – keine weitere Rückfrage)
    for (let i = 0; i < 3 && rf().querySelector('.br-fakt.br-offen'); i++) {
      act(() => knopf(rf().querySelector('.br-fakt.br-offen')!, 'nein')!.click());
      await warten();
    }
    expect(rf().querySelector('.br-fakt.br-offen')).toBeNull();
    expect(document.activeElement?.classList.contains('br-gruppe-knopf')).toBe(true);
    // „ändern“ klappt auf und führt zur Rückfrage
    act(() => knopf(rf(), /^ändern/)!.click());
    await warten();
    expect(gruppe().querySelector('.br-gruppe-knopf')!.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.closest('[data-fakt="vorhaben.beseitigung_umfang"]')).not.toBeNull();
  });

  it('auf- bzw. zugeklappt bleibt nach einer Suche, die die Merkmale ausblendet', () => {
    act(() => useBaurecht.setState({ merkmaleAuf: true }));
    const host = render();
    const suchfeld = host.querySelector<HTMLInputElement>('input[aria-label="Angaben durchsuchen"]')!;
    tippen(suchfeld, 'Kampfmittel');
    tippen(suchfeld, '');
    expect(host.querySelector('#br-merkmale .br-gruppe-knopf')!.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Runde 15: Fokusziele, Hinweis-Rückfragen, Protokoll, Speichern', () => {
  beforeEach(() => {
    geschrieben = null;
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  });
  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = '';
  });
  const warten = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

  it('ein Fokusziel ohne Zeile schaltet „alle Angaben“ ein und verfällt, wenn es die Angabe nicht gibt', async () => {
    const host = render();
    act(() => useBaurecht.getState().fokusSetzen('gibt.es.nicht:bestaetigen'));
    // erst „alle Angaben“, dann (auch dort keine Zeile) verfällt das Ziel
    await warten(150);
    await warten(150);
    expect(useBaurecht.getState().fokus).toBeNull();
    expect(host.querySelector<HTMLInputElement>('.br-angaben .br-leiste-kopf input[type="checkbox"]')!.checked).toBe(true);
  });

  it('eingeklappt: eine Rückfrage, die nur Hinweis ist, bleibt offen (mit „Bestätigen …“) und zählt im Kopf', async () => {
    const s = useBaurecht.getState();
    act(() => {
      s.merkmalSetzen('Vorhaben', 'Beseitigung');
      // aus einer älteren Angabe („vollständiger Abbruch: ja“) – nur Hinweis
      s.faktSetzen('vorhaben.beseitigung_vollstaendig', true, 'TP');
      useBaurecht.setState({ merkmaleAuf: false });
    });
    const host = render();
    const gruppe = host.querySelector<HTMLElement>('#br-merkmale')!.closest('section')!;
    expect(gruppe.querySelector('.br-gruppe-knopf')!.textContent).toMatch(/eine Rückfrage offen/);
    const zeile = gruppe.querySelector<HTMLElement>('.br-rueckfrage [data-fakt="vorhaben.beseitigung_umfang"]')!;
    expect(zeile).toBeTruthy();
    expect(zeile.querySelector('button[data-bestaetigen]')).not.toBeNull();
    act(() => useBaurecht.getState().fokusSetzen('vorhaben.beseitigung_umfang:bestaetigen'));
    await warten(50);
    expect(document.activeElement?.hasAttribute('data-bestaetigen')).toBe(true);
  });

  it('Protokoll: nur gestellte Rückfragen; fremder Merkmalwert gekennzeichnet und nicht für den Ort bestätigbar', async () => {
    const { planungsrechtVerschoben } = await import('./pruefung');
    const s = useBaurecht.getState();
    act(() => {
      s.merkmalSetzen('Vorhaben', 'Beseitigung');
      s.faktSetzen('vorhaben.beseitigung_umfang', 'Teilabbruch', 'TP');
      s.merkmalSetzen('Vorhaben', 'Errichtung');
      useBaurecht.setState({ merkmale: { ...useBaurecht.getState().merkmale, Planungsrecht: 'Gemengelage' }, pruefung: { ...useBaurecht.getState().pruefung, planungsrechtOrt: undefined } });
    });
    act(() => useBaurecht.getState().planungsrechtBestaetigen());
    expect(useBaurecht.getState().pruefung.planungsrechtOrt).toBeUndefined();
    const st = useBaurecht.getState();
    expect(planungsrechtVerschoben(st.project, st.merkmale, st.pruefung.planungsrechtOrt)).toBeUndefined();
    const host = render();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    const merkmalZeile = [...d.querySelectorAll('tr')].find((tr) => tr.textContent?.startsWith('Antragsmerkmale'))!.textContent!;
    expect(merkmalZeile).not.toMatch(/Teilabbruch/);
    expect(merkmalZeile).toContain('Planungsrecht: „Gemengelage“ – passt nicht zur Liste, nicht gewertet');
  });

  it('Speichern mit zwei Bestätigungen, die dieselben Vorschriften entscheiden: je Punkt allein, Überschneidung, zusammen', async () => {
    const { auswertungMit, folgenBeimSpeichern } = await import('./pruefung');
    const { offeneBestaetigungen, PLANUNGSRECHT } = await import('./store');
    const s = useBaurecht.getState();
    const ags = auswertungMit(s.pruefung.fakten).fakten['lage.ags'];
    expect(ags?.sicherheit).toBe('hinweis');
    act(() => {
      s.faktBestaetigen('lage.ags', ags, 'TP', 'Auskunft der Gemeinde vom 12.11.2026');
      useBaurecht.getState().planungsrechtBestaetigen();
    });
    const ids = offeneBestaetigungen(useBaurecht.getState());
    expect(ids).toEqual(expect.arrayContaining(['lage.ags', PLANUNGSRECHT]));
    const jetzt = auswertungMit(useBaurecht.getState().pruefung.fakten);
    const fb = folgenBeimSpeichern(ids, jetzt);
    const zusammen = new Set(fb.zusammen.map((h) => h.id));
    // nichts geht verloren: was ein Punkt allein bewirkt, steht auch unter „zusammen“ (hier wirken beide in dieselbe
    // Richtung – gegenläufige Bestätigungen könnten sich aufheben) …
    for (const id of ids) for (const h of fb.je[id].herab) expect(zusammen.has(h.id)).toBe(true);
    // … und Überschneidungen sind vermerkt
    expect(ids.some((id) => (fb.je[id].auch?.anzahl ?? 0) > 0)).toBe(true);
    expect(fb.zusammen.length).toBeGreaterThanOrEqual(Math.max(...ids.map((id) => fb.je[id].herab.length)));
    // das Protokoll zählt dieselben Paragrafen (gegenüber dem Stand ohne diese Bestätigungen)
    const { anUngespeichertem } = await import('./pruefung');
    const n = anUngespeichertem(ids, jetzt);
    expect(n).toBe(fb.zusammen.length);
    // der Dialog zeigt die Zeile „Zusammen“
    const host = render();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    expect(document.querySelector('.br-protokoll')!.textContent).toContain(`${n} Paragrafen hängen an noch nicht gespeicherten Bestätigungen`);
    act(() => knopf(document.querySelector('.br-protokoll')!, 'Schließen')!.click());
    let fertig: Promise<boolean> | null = null;
    await act(async () => {
      fertig = speichern();
    });
    const best = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Vor dem Speichern bestätigen'))!;
    expect(best.querySelector('.br-folgen-zusammen')?.textContent).toMatch(new RegExp(`Stuft ${fb.zusammen.length} Vorschriften( auf „entfällt“)? herab`));
    expect(best.getAttribute('aria-describedby')).toBe('br-bestaetigen-einleitung');
    // Startfokus: das Häkchen, nicht die Aufklappzeile
    await warten(50);
    expect((document.activeElement as HTMLInputElement | null)?.type).toBe('checkbox');
    await act(async () => {
      knopf(best, 'Abbrechen')!.click();
      await fertig;
    });
  });

  it('Sammelaktion „ohne Ortsangabe“: die Meldung gilt nur für den Filterstand, den sie gesetzt hat', async () => {
    const host = render();
    const id = festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'rot');
    // wie aus einer älteren Datei: ohne Ort, bestätigt
    act(() => {
      const p = structuredClone(useBaurecht.getState().pruefung);
      delete p.festlegungen[id].ort;
      p.festlegungen[id].bestaetigt = '2026-11-12T10:00:00Z';
      useBaurecht.setState({ pruefung: p, pruefungDatei: structuredClone(p) });
    });
    act(() => knopf(host, 'Für diesen Ort übernehmen')!.click());
    const zeile = () => host.querySelector('.br-treffer > span')!.textContent ?? '';
    expect(zeile()).toMatch(/dem jetzigen Ort zugeordnet/);
    // ein anderer Filter (Ampel aus) – die Meldung verschwindet
    act(() => host.querySelector<HTMLButtonElement>('.br-bilanz button')!.click());
    await warten();
    expect(zeile()).not.toMatch(/dem jetzigen Ort zugeordnet/);
    // Filter zurück (die Ansicht wird gemerkt)
    act(() => host.querySelector<HTMLButtonElement>('.br-bilanz button')!.click());
  });

  it('StrictMode: „klärt N“ erscheint trotzdem (gedrosselte zweite Auswertung)', async () => {
    const { StrictMode } = await import('react');
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(StrictMode, null, createElement(App)));
    });
    await warten(400);
    await warten();
    expect(host.querySelector('.br-planungsrecht-hinweis')?.textContent).toMatch(/klärt \d+/);
  });

  it('Sprungziel während einer Suche: die Suche wird geleert (angesagt), der Fokus landet am Ziel', async () => {
    const { auswertungMit } = await import('./pruefung');
    const host = render();
    const suchfeld = host.querySelector<HTMLInputElement>('input[aria-label="Angaben durchsuchen"]')!;
    tippen(suchfeld, 'Kampfmittel');
    const p = auswertungMit(useBaurecht.getState().pruefung.fakten).paragrafen.find((x) => x.gruende.some((g) => g.startsWith('Nicht gesichert: Planungsrecht')))!;
    act(() => useBaurecht.getState().waehlen(p.id));
    act(() => knopf(host.querySelector('.br-detail')!, 'Zum Bestätigen')!.click());
    await warten(150);
    expect(suchfeld.value).toBe('');
    expect(document.activeElement?.textContent).toBe('Für diesen Ort bestätigen');
    expect(useBaurecht.getState().fokus).toBeNull();
  });

  it('Protokoll: eine Rückfrage, die nur Hinweis ist, steht mit Vermerk da (wie in der App offen)', () => {
    const s = useBaurecht.getState();
    act(() => {
      s.merkmalSetzen('Vorhaben', 'Beseitigung');
      s.faktSetzen('vorhaben.beseitigung_vollstaendig', true, 'TP');
    });
    const host = render();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const zeile = [...document.querySelectorAll('.br-protokoll tr')].find((tr) => tr.textContent?.startsWith('Antragsmerkmale'))!.textContent!;
    expect(zeile).toMatch(/Art des Vorhabens: Beseitigung \(vollständiger Abbruch ohne Ersatzbau – nur Hinweis, nicht bestätigt\)/);
  });

  it('Prüfung abschließen: Meldung (Live-Region) mit „Jetzt speichern“, der Fokus geht dorthin; Sperrtext neutral', async () => {
    const host = render();
    await speichernOhneDialog();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    // warten, bis die (Web-)Texte durch sind
    await bisAbschliessbar(d);
    act(() => knopf(d, 'Prüfung abschließen')!.click());
    await warten();
    const m = d.querySelector<HTMLElement>('.br-abgelegt')!;
    expect(m.querySelector('[role="status"]')).not.toBeNull();
    expect(m.textContent).toMatch(/Prüfung vom \d\d\.\d\d\.\d{4} abgelegt \(\d+ gilt · \d+ prüfen · \d+ entfällt\)/);
    expect(document.activeElement?.textContent).toBe('Jetzt speichern');
    // der Grund steht in der Meldung – kein doppelter Sperrtext
    expect(d.querySelector('.br-sperre')).toBeNull();
  });

  it('nach dem Speichern: „Gespeichert“ im Kopf (Live-Region)', async () => {
    const host = render();
    await speichernOhneDialog();
    expect(host.querySelector('.br-gespeichert')?.getAttribute('role')).toBe('status');
    expect(host.querySelector('.br-gespeichert')?.textContent).toMatch(/^Gespeichert/);
  });

  it('die Ansage wird nach 1,5 s geleert (Zeit kontrolliert, unabhängig vom Runner)', () => {
    render();
    vi.useFakeTimers();
    try {
      act(() => useBaurecht.getState().ansagen('Probeansage'));
      act(() => void vi.advanceTimersByTime(1400));
      expect(useBaurecht.getState().ansage).toBe('Probeansage');
      act(() => void vi.advanceTimersByTime(200));
      expect(useBaurecht.getState().ansage).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('„Gespeichert“ im Kopf blendet nach 4 s aus (Zeit kontrolliert, unabhängig vom Runner)', async () => {
    const host = render();
    await speichernOhneDialog();
    expect(host.querySelector('.br-gespeichert')?.textContent).toMatch(/^Gespeichert/);
    // die Meldung erscheint neu, damit ihre Frist unter den falschen Uhren läuft
    vi.useFakeTimers();
    try {
      act(() => useBaurecht.setState({ gespeichertMeldung: { text: 'Gespeichert', am: Date.now() } }));
      expect(host.querySelector('.br-gespeichert')?.textContent).toBe('Gespeichert');
      act(() => void vi.advanceTimersByTime(3900));
      expect(host.querySelector('.br-gespeichert')?.textContent).toBe('Gespeichert');
      act(() => void vi.advanceTimersByTime(200));
      expect(host.querySelector('.br-gespeichert')?.textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Speichern-Dialog: eine geänderte Festlegung nennt den bisherigen Stand mit Datum; der Pfeil ist Text für Screenreader', async () => {
    const host = render();
    festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'rot');
    const id = Object.keys(useBaurecht.getState().pruefung.festlegungen)[0];
    await speichernMit('Bestätigen und speichern');
    festlegen(host, 'Neue Unterlagen vom 10.11.2026', 'gruen', id);
    const inhalt = await speichernMit('Speichern, diese als Entwurf behalten');
    expect(inhalt.textContent).toMatch(/bisher: gilt \(TP|bisher: gilt \([^,]+, \d\d\.\d\d\.\d{4}: Begehung/);
    expect(inhalt.querySelector('[aria-label="wird zu"]')).toBeNull();
  });

  it('Angaben-Suche: Ansage entprellt in der stehenden Region, auch „Keine Angabe“', async () => {
    const host = render();
    const suchfeld = host.querySelector<HTMLInputElement>('input[aria-label="Angaben durchsuchen"]')!;
    tippen(suchfeld, 'zzzz');
    const region = () => [...host.querySelectorAll('.br-angaben > [role="status"]')].map((e) => e.textContent).join('|');
    expect(region()).not.toMatch(/zzzz/);
    await warten(400);
    expect(region()).toMatch(/Keine Angabe zu „zzzz“/);
  });

  it('Rückmeldung nach dem Speichern: Entwürfe zuerst, sonst „keine Änderungen“ bzw. „Gespeichert“', async () => {
    const host = render();
    const text = () => host.querySelector('.br-gespeichert')?.textContent;
    await speichernOhneDialog();
    expect(text()).toBe('Gespeichert – keine Änderungen');
    act(() => useBaurecht.getState().merkmalSetzen('Gebäudeart', 'Doppelhaushälfte'));
    await speichernOhneDialog();
    expect(text()).toBe('Gespeichert');
    festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'rot');
    await speichernMit('Speichern, diese als Entwurf behalten');
    expect(text()).toBe('Gespeichert – ein Entwurf bleibt offen');
  });

  it('Sprungziel zu einem Merkmal während einer Suche, die ein anderes Merkmal trifft: Fokus am Ziel', async () => {
    const { auswertungMit } = await import('./pruefung');
    const host = render();
    const suchfeld = host.querySelector<HTMLInputElement>('input[aria-label="Angaben durchsuchen"]')!;
    tippen(suchfeld, 'Gebäudeart');
    expect(host.querySelector('[data-merkmal="Gebäudeart"]')).not.toBeNull();
    expect(host.querySelector('[data-merkmal="Planungsrecht"]')).toBeNull();
    const p = auswertungMit(useBaurecht.getState().pruefung.fakten).paragrafen.find((x) => x.gruende.some((g) => g.startsWith('Nicht gesichert: Planungsrecht')))!;
    act(() => useBaurecht.getState().waehlen(p.id));
    act(() => knopf(host.querySelector('.br-detail')!, 'Zum Bestätigen')!.click());
    await warten(150);
    expect(suchfeld.value).toBe('');
    expect(document.activeElement?.textContent).toBe('Für diesen Ort bestätigen');
  });

  it('Hinweis-Knopf während einer Suche: die Suche bleibt, Fokus ins Suchfeld, die Wirkung wird angesagt', async () => {
    const host = render();
    await warten(400);
    await warten();
    const suchfeld = host.querySelector<HTMLInputElement>('input[aria-label="Angaben durchsuchen"]')!;
    tippen(suchfeld, 'Kampfmittel');
    act(() => knopf(host.querySelector('.br-planungsrecht-hinweis')!, 'Für diesen Ort bestätigen')!.click());
    expect(useBaurecht.getState().ansage).toMatch(/Vorschriften? entf/);
    await warten(50);
    expect(suchfeld.value).toBe('Kampfmittel');
    expect(document.activeElement).toBe(suchfeld);
    expect(useBaurecht.getState().ansage).toMatch(/Vorschriften? entf/);
  });

  it('Protokoll „Jetzt speichern“: die Meldung sagt das Ergebnis, der Fokus bleibt im Dialog', async () => {
    const host = render();
    await speichernOhneDialog();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    await bisAbschliessbar(d);
    act(() => knopf(d, 'Prüfung abschließen')!.click());
    await warten();
    await act(async () => {
      knopf(d, 'Jetzt speichern')!.click();
      await new Promise((r) => setTimeout(r, 100));
    });
    await warten();
    const m = d.querySelector<HTMLElement>('.br-abgelegt')!;
    expect(m.textContent).toMatch(/^Gespeichert – die abgeschlossene Prüfung steht in der Projektdatei/);
    expect(d.contains(document.activeElement)).toBe(true);
    expect(knopf(d, 'Jetzt speichern')).toBeUndefined();
  });

  it('Protokoll: stehende Live-Region für „abgelegt“, kein doppelter Sperrtext, gleicher Stand nicht zweimal; Druckvermerk beim Filter', async () => {
    const host = render();
    await speichernOhneDialog();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    // die Region steht schon vor der Meldung da
    const region = d.querySelector<HTMLElement>('#br-abgelegt-text')!;
    expect(region).not.toBeNull();
    expect(region.textContent).toBe('');
    await bisAbschliessbar(d);
    act(() => knopf(d, 'Prüfung abschließen')!.click());
    await warten();
    expect(region.textContent).toMatch(/abgelegt/);
    // der Knopf steht neben der Live-Region (nicht mitgelesen)
    expect(region.contains(knopf(d, 'Jetzt speichern')!)).toBe(false);
    expect(d.querySelector('.br-sperre')).toBeNull();
    await act(async () => {
      knopf(d, 'Jetzt speichern')!.click();
      await new Promise((r) => setTimeout(r, 100));
    });
    await warten();
    // derselbe Stand: kein zweites Abschließen
    expect(knopf(d, 'Prüfung abschließen')!.disabled).toBe(true);
    expect(d.querySelector('.br-sperre')?.textContent).toBe('Dieser Stand ist schon abgeschlossen');
    expect(d.textContent).toMatch(/\d\d\.\d\d\.\d{4}, \d\d:\d\d \(/);
  });

  it('Vorschriften-Suche: Ansage entprellt, die sichtbare Zeile sofort', async () => {
    const host = render();
    const feld = host.querySelector<HTMLInputElement>('.br-vorschriften input[type="search"], main input[type="search"]')!;
    tippen(feld, 'Stellplatz');
    const sichtbar = host.querySelector('.br-treffer > span')!.textContent ?? '';
    const live = () => host.querySelector('.br-treffer [aria-live]')!.textContent ?? '';
    expect(sichtbar).toMatch(/von \d+ Paragrafen/);
    expect(live()).toBe('');
    await warten(400);
    expect(live()).toBe(sichtbar);
  });

  it('Druck mit „ohne „entfällt““: das Ergebnis vermerkt, wie viele Vorschriften fehlen', async () => {
    // mit bestätigtem Planungsrecht entfallen im Beispiel Vorschriften
    act(() => useBaurecht.getState().planungsrechtBestaetigen());
    const host = render();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    const gruen = Number(/(\d+) entfällt/.exec(d.textContent ?? '')?.[1]);
    expect(gruen).toBeGreaterThan(0);
    expect(d.textContent).not.toContain('in diesem Ausdruck nicht aufgeführt');
    act(() => d.querySelector<HTMLInputElement>('.br-protokoll-aktionen input[type="checkbox"]')!.click());
    expect(d.textContent).toContain(`Vorschriften mit „entfällt“ (${gruen}) sind in diesem Ausdruck nicht aufgeführt`);
  });

  it('gleicher Stand mit anderen Fassungen lässt sich wieder abschließen', async () => {
    const host = render();
    await speichernOhneDialog();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    await bisAbschliessbar(d);
    act(() => knopf(d, 'Prüfung abschließen')!.click());
    await speichernOhneDialog();
    await warten();
    expect(knopf(d, 'Prüfung abschließen')!.disabled).toBe(true);
    // die letzte Ablage hatte eine andere Fassung – jetzt ist es ein neuer Stand
    act(() => {
      const p = structuredClone(useBaurecht.getState().pruefung);
      p.protokolle[p.protokolle.length - 1].fassungen = { 'nw/bauo-nrw': '2024-01-01' };
      useBaurecht.setState({ pruefung: p, pruefungDatei: structuredClone(p) });
    });
    expect(knopf(d, 'Prüfung abschließen')!.disabled).toBe(false);
  });

  it('Protokoll: eine Antwort auf eine nicht gestellte Frage steht gesondert, ohne Wirkung', () => {
    const s = useBaurecht.getState();
    // Umfang der Beseitigung bei „Errichtung“: nicht gestellt
    act(() => {
      s.merkmalSetzen('Vorhaben', 'Errichtung');
      s.faktSetzen('vorhaben.beseitigung_umfang', 'Teilabbruch', 'TP');
    });
    const host = render();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    const tabelle = [...d.querySelectorAll('h2')].find((h) => h.textContent?.startsWith('Angaben von Hand ohne Beleg'))!.nextElementSibling!;
    expect(tabelle.textContent).not.toMatch(/Umfang der Beseitigung/);
    expect(d.textContent).toMatch(/Antworten auf derzeit nicht gestellte Fragen \(ohne Wirkung\): [^·]*Umfang der Beseitigung: Teilabbruch/);
  });

  it('Doppelklick auf Speichern: ein Lauf, beide bekommen sein Ergebnis', async () => {
    render();
    let a: Promise<boolean> | null = null;
    let b: Promise<boolean> | null = null;
    await act(async () => {
      a = speichern();
      b = speichern();
      expect(b).toBe(a);
      await a;
    });
    expect(await b).toBe(true);
  });

  it('Protokoll: Tab von der Meldung bleibt im Dialog, der Hintergrund ist inert; nach dem Wiederöffnen erkennbar abgelegt', async () => {
    const host = render();
    await speichernOhneDialog();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    let d = document.querySelector<HTMLElement>('.br-protokoll')!;
    expect(host.querySelector<HTMLElement>('.br-sprung')!.inert).toBe(true);
    await bisAbschliessbar(d);
    act(() => knopf(d, 'Prüfung abschließen')!.click());
    await warten();
    // Fokus auf die Meldung (außerhalb der Tab-Folge), dann Tab: bleibt im Dialog
    const meldung = d.querySelector<HTMLElement>('.br-abgelegt')!;
    act(() => meldung.focus());
    const tabTaste = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => void document.dispatchEvent(tabTaste));
    // weiter zum nächsten Ziel der Tab-Folge im Protokoll (nicht hinaus, nicht stehen bleiben)
    expect(tabTaste.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(meldung);
    expect(d.contains(document.activeElement)).toBe(true);
    expect(document.activeElement!.matches('button, input, [tabindex="0"]')).toBe(true);
    // schließen und wieder öffnen: der Eintrag ist als nicht gespeichert gekennzeichnet, die Sperre sagt warum
    act(() => knopf(d, 'Schließen')!.click());
    expect(host.querySelector<HTMLElement>('.br-sprung')!.inert).toBe(false);
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    d = document.querySelector<HTMLElement>('.br-protokoll')!;
    expect(d.textContent).toMatch(/noch nicht in der Datei gespeichert/);
    // wie direkt nach dem Abschließen: Meldung mit „Jetzt speichern“ (der Sperrtext nicht doppelt)
    expect(d.querySelector('#br-abgelegt-text')?.textContent).toMatch(/noch nicht in der Datei gespeichert/);
    expect(knopf(d, 'Jetzt speichern')).toBeTruthy();
    expect(d.querySelector('.br-sperre')).toBeNull();
  });

  it('Strg+S bei offenem Protokoll: das Ergebnis steht in der Live-Region des Dialogs, der Fokus bleibt', async () => {
    const host = render();
    act(() => useBaurecht.getState().merkmalSetzen('Gebäudeart', 'Doppelhaushälfte'));
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    const druck = knopf(d, 'Drucken / PDF …')!;
    act(() => druck.focus());
    await speichernOhneDialog();
    await warten();
    expect(d.querySelector('#br-abgelegt-text')?.textContent).toBe('Gespeichert.');
    expect(document.activeElement).toBe(druck);
  });

  it('„gestellt“ urteilt in Kern, Leiste und Protokoll gleich – auch mit nicht bestätigtem Planungsrecht (Vorbehalt)', async () => {
    const { frageGestellt } = await import('@core/baurecht/fragen');
    const { auswertungMit } = await import('./pruefung');
    act(() => useBaurecht.getState().faktSetzen('planung.innen', true, 'TP'));
    const a = auswertungMit(useBaurecht.getState().pruefung.fakten);
    // das Planungsrecht ist im Beispiel nicht für den Ort bestätigt (Vorbehalt = Widerspruch am Merkmal)
    expect(a.kontext.widersprueche?.has('Planungsrecht')).toBe(true);
    const gestellt = frageGestellt('planung.innen', a.faktDefs['planung.innen'], a.kontext);
    // Kern: die Antwort zählt genau dann
    expect('planung.innen' in a.fakten).toBe(gestellt);
    const host = render();
    act(() => knopf(host, 'alle')?.click());
    expect(!!host.querySelector('.br-angaben [data-fakt="planung.innen"]')).toBe(gestellt);
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    const tabelle = [...d.querySelectorAll('h2')].find((h) => h.textContent?.startsWith('Angaben von Hand ohne Beleg'))!.nextElementSibling!.textContent ?? '';
    const ohneWirkung = /Antworten auf derzeit nicht gestellte Fragen \(ohne Wirkung\):[^\n]*Im Zusammenhang bebauter Ortsteil/.test(d.textContent ?? '');
    // die Antwort steht im Protokoll – je nachdem in der Tabelle oder unter „ohne Wirkung“, nie gar nicht
    expect(/Im Zusammenhang bebauter Ortsteil/.test(tabelle) || ohneWirkung).toBe(true);
    expect(ohneWirkung).toBe(!gestellt);
  });

  it('Protokoll: „Jetzt speichern“ neben „Erst speichern …“, Rückmeldung in der Live-Region; Festlegung wird angesagt', async () => {
    const host = render();
    festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'rot');
    expect(useBaurecht.getState().ansage).toMatch(/von Hand „gilt“ festgelegt – Entwurf/);
    await speichernMit('Bestätigen und speichern');
    act(() => useBaurecht.getState().merkmalSetzen('Gebäudeart', 'Doppelhaushälfte'));
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    expect(d.querySelector('.br-sperre')?.textContent).toMatch(/Erst speichern/);
    await act(async () => {
      knopf(d, 'Jetzt speichern')!.click();
      await new Promise((r) => setTimeout(r, 100));
    });
    await warten();
    // nichts sperrt mehr: die Meldung sagt, dass jetzt abgeschlossen werden kann
    expect(d.querySelector('.br-sperre')).toBeNull();
    expect(d.querySelector('#br-abgelegt-text')?.textContent).toBe('Gespeichert – die Prüfung lässt sich jetzt abschließen.');
    expect(d.contains(document.activeElement)).toBe(true);
  });

  it('Speichern-Dialog: Häkchen und Knöpfe im festen Fuß, Inhalt in einem Scrollbereich', async () => {
    const host = render();
    festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'rot');
    let fertig: Promise<boolean> | null = null;
    await act(async () => {
      fertig = speichern();
    });
    const best = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Vor dem Speichern bestätigen'))!;
    expect(best.querySelector('.br-bestaetigen-fuss input[type="checkbox"]')).not.toBeNull();
    expect(best.querySelector('.br-bestaetigen-fuss .dialog-buttons')).not.toBeNull();
    expect(best.querySelector('.br-bestaetigen-inhalt .br-bestaetigen-liste')).not.toBeNull();
    await act(async () => {
      knopf(best, 'Abbrechen')!.click();
      await fertig;
    });
  });

  it('Speichern-Dialog: der Scrollbereich ist ein benannter Tabstopp; Startfokus bleibt am Häkchen', async () => {
    const host = render();
    festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'rot');
    let fertig: Promise<boolean> | null = null;
    await act(async () => {
      fertig = speichern();
    });
    const best = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Vor dem Speichern bestätigen'))!;
    const bereich = best.querySelector<HTMLElement>('.br-bestaetigen-inhalt')!;
    expect(bereich.getAttribute('tabindex')).toBe('0');
    expect(bereich.getAttribute('role')).toBe('region');
    expect(bereich.getAttribute('aria-label')).toBe('Änderungen seit dem letzten Speichern');
    await warten(50);
    expect((document.activeElement as HTMLInputElement | null)?.type).toBe('checkbox');
    await act(async () => {
      knopf(best, 'Abbrechen')!.click();
      await fertig;
    });
  });

  it('Protokoll: nach Abschließen und Strg+S bleibt die genaue Meldung, der Fokus im Dialog', async () => {
    const host = render();
    await speichernOhneDialog();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    await bisAbschliessbar(d);
    act(() => knopf(d, 'Prüfung abschließen')!.click());
    await warten();
    expect(document.activeElement?.textContent).toBe('Jetzt speichern');
    await speichernOhneDialog();
    await warten(50);
    expect(d.querySelector('#br-abgelegt-text')?.textContent).toBe('Gespeichert – die abgeschlossene Prüfung steht in der Projektdatei.');
    expect(d.contains(document.activeElement)).toBe(true);
  });

  it('Festlegen ohne geprüften Text und Aufheben werden angesagt', () => {
    const host = render();
    festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'gruen');
    expect(useBaurecht.getState().ansage).toMatch(/festgelegt – noch nicht wirksam \(Text der Norm nicht verfügbar\), es bleibt bei/);
    act(() => knopf(host.querySelector('.br-detail')!, /Festlegung aufheben/)!.click());
    expect(useBaurecht.getState().ansage).toMatch(/^Festlegung aufgehoben – automatisch: „/);
  });

  it('Protokoll: „Jetzt speichern“ abgebrochen – Knopf wieder bereit, ein späteres Strg+S verschiebt den Fokus nicht', async () => {
    const host = render();
    festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'rot');
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    const jetzt = () => knopf(d, 'Jetzt speichern')!;
    await act(async () => {
      jetzt().click();
      await warten(20);
    });
    expect(jetzt().getAttribute('aria-disabled')).toBe('true');
    const best = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((x) => x.textContent?.includes('Vor dem Speichern bestätigen'))!;
    await act(async () => {
      knopf(best, 'Abbrechen')!.click();
      await warten(50);
    });
    expect(jetzt().getAttribute('aria-disabled')).toBeNull();
    // der Fokus woanders im Protokoll – ein Speichern von anderswo (Strg+S) lässt ihn dort
    const haken = d.querySelector<HTMLInputElement>('.br-protokoll-aktionen input[type="checkbox"]')!;
    act(() => haken.focus());
    await speichernMit('Speichern, diese als Entwurf behalten');
    await warten(50);
    expect(document.activeElement).toBe(haken);
  });

  it('Festlegen: der Text trifft ein, während der Dialog offen ist – Warnung und Ansage folgen dem aktuellen Stand', () => {
    const host = render();
    act(() => host.querySelector<HTMLButtonElement>('.br-paragraf')!.click());
    const id = useBaurecht.getState().auswahl!;
    const [modul, norm, nr] = id.split('/');
    const regel = useBaurecht.getState().paket.regeln.get(`${modul}/${norm}`)!.at(-1)!.regel;
    const stand = regel.paragrafen[nr].stand ?? {};
    expect(Object.keys(stand).length).toBeGreaterThan(0);
    act(() => knopf(host, /^(Von Hand festlegen|Festlegung ändern) …$/)!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('von Hand festlegen'))!;
    act(() => dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')[2].click());
    const warnung = () => dialog.querySelector('.meldung.warnung[role="note"]')?.textContent ?? '';
    expect(warnung()).toMatch(/Ohne geprüften Gesetzestext greift „entfällt“ nicht/);
    const text = (geprueft: string) =>
      act(() =>
        useBaurecht.getState().textSetzen(`${modul}/${norm}`, {
          fassung: {
            id: norm,
            kurz: norm,
            titel: '',
            fassung: '',
            url: '',
            paragrafen: { [nr]: { titel: 'T', url: '', text: ['(1) …'] } },
            gueltigAb: regel.fassung,
            abgerufen: '',
            quelle: { art: 'gii', pfad: 'x' },
            summen: { ...stand },
            kennung: 'x',
          } as never,
          geprueft,
        }),
      );
    // veralteter Rechtsstand: „greift noch nicht“ mit Grund
    text('2025-01-01T08:00:00Z');
    expect(warnung()).toMatch(/„Entfällt“ greift noch nicht \(Rechtsstand nicht aktuell an der Quelle bestätigt\)/);
    // aktuell geprüft: keine Warnung, die Ansage ohne „noch nicht wirksam“
    text(new Date().toISOString());
    expect(warnung()).toBe('');
    tippen(dialog.querySelector('textarea')!, 'Begehung am 03.11.2026 ohne Befund');
    act(() => knopf(dialog, 'Festlegen')!.click());
    expect(useBaurecht.getState().ansage).toMatch(/von Hand „entfällt“ festgelegt – Entwurf, beim Speichern noch einmal bestätigen$/);
  });

  it('Festlegen bei veraltetem Text: die Ansage nennt den Grund', () => {
    const host = render();
    act(() => host.querySelector<HTMLButtonElement>('.br-paragraf')!.click());
    const id = useBaurecht.getState().auswahl!;
    const [modul, norm, nr] = id.split('/');
    const regel = useBaurecht.getState().paket.regeln.get(`${modul}/${norm}`)!.at(-1)!.regel;
    act(() =>
      useBaurecht.getState().textSetzen(`${modul}/${norm}`, {
        fassung: {
          id: norm,
          kurz: norm,
          titel: '',
          fassung: '',
          url: '',
          paragrafen: { [nr]: { titel: 'T', url: '', text: ['(1) …'] } },
          gueltigAb: regel.fassung,
          abgerufen: '',
          quelle: { art: 'gii', pfad: 'x' },
          summen: { ...(regel.paragrafen[nr].stand ?? {}) },
          kennung: 'x',
        } as never,
        geprueft: '2025-01-01T08:00:00Z',
      }),
    );
    festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'gruen', id);
    expect(useBaurecht.getState().ansage).toMatch(/festgelegt – noch nicht wirksam \(Rechtsstand nicht aktuell an der Quelle bestätigt\), es bleibt bei/);
  });

  it('„Rückgängig“ nach Aufheben: angesagt, mit dem Stand nach dem Wiederherstellen (Entwurf, wenn nicht gespeichert)', () => {
    const host = render();
    const id = festlegen(host, 'Begehung am 03.11.2026 ohne Befund', 'rot');
    // bestätigt, aber nicht gespeichert (z. B. Speichern abgebrochen): beim Wiederherstellen wieder Entwurf
    act(() => {
      const p = structuredClone(useBaurecht.getState().pruefung);
      p.festlegungen[id].bestaetigt = '2026-11-12T10:00:00Z';
      useBaurecht.setState({ pruefung: p });
    });
    act(() => knopf(host.querySelector('.br-detail')!, /Festlegung aufheben/)!.click());
    act(() => knopf(host.querySelector('.br-detail')!, 'Rückgängig')!.click());
    expect(useBaurecht.getState().pruefung.festlegungen[id]?.bestaetigt).toBeUndefined();
    expect(useBaurecht.getState().ansage).toBe('Festlegung wiederhergestellt – „gilt“ (Entwurf)');
  });

  it('Angaben-Suche: interne Kennungen treffen nicht', () => {
    const host = render();
    act(() => knopf(host, 'alle Angaben')?.click());
    const suche = host.querySelector<HTMLInputElement>('input[aria-label="Angaben durchsuchen"]')!;
    tippen(suche, 'kampfmittel');
    expect(host.querySelector('[data-fakt="lage.kampfmittel"]')).not.toBeNull();
    // „lage.“ steht nur in der Kennung
    tippen(suche, 'lage.kampf');
    expect(host.querySelector('[data-fakt="lage.kampfmittel"]')).toBeNull();
  });

  it('Neue App-Namen: Startseite und Herkunft der Angaben nennen PERMIO, TERRIO und QUADRIO mit Erklärung', () => {
    const host = render();
    // Herkunfts-Chip kurz mit Namen, die Erklärung im Tooltip
    act(() => knopf(host, 'alle Angaben')?.click());
    const chip = host.querySelector<HTMLElement>('.br-herkunft-flaechen')!;
    expect(chip.textContent).toBe('QUADRIO');
    expect(chip.title).toBe('QUADRIO (Flächenrechner)');
    // Startseite ohne Projekt
    act(() => useBaurecht.setState({ project: null }));
    const start = host.querySelector<HTMLElement>('.br-start-karte')!;
    expect(start.querySelector('h1')?.textContent).toBe('LEXIO');
    expect(start.querySelector('.br-start-was')?.textContent).toBe('Baurecht');
    expect(start.textContent).toMatch(/aus PERMIO \(Formulare\), Festsetzungen aus TERRIO \(GRZ-Nachweis\), Geschosse aus QUADRIO \(Flächenrechner\)/);
  });

  it('Verweis ohne abrufbaren Text: „entfällt“ wirkt sofort – keine Warnung im Dialog, keine „noch nicht wirksam“-Ansage', () => {
    const host = render();
    const id = 'nw-05974/nsg/andere';
    const vorher = useBaurecht.getState();
    expect(vorher.paket.regeln.get('nw-05974/nsg')?.at(-1)?.regel.paragrafen.andere?.stand ?? {}).toEqual({});
    act(() => host.querySelector<HTMLButtonElement>(`[data-roving="p:${CSS.escape(id)}"]`)!.click());
    act(() => knopf(host, /^(Von Hand festlegen|Festlegung ändern) …$/)!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('von Hand festlegen'))!;
    act(() => dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')[2].click());
    expect(dialog.textContent).not.toMatch(/greift „entfällt“ nicht|greift noch nicht/);
    tippen(dialog.querySelector('textarea')!, 'Abstimmung mit der UNB ohne Befund');
    act(() => knopf(dialog, 'Festlegen')!.click());
    expect(useBaurecht.getState().ansage).toMatch(/von Hand „entfällt“ festgelegt – Entwurf, beim Speichern noch einmal bestätigen$/);
  });
});

describe('Designsystem: Dialogkopf, Enter, Druckvorschau, Symbole', () => {
  beforeEach(() => {
    geschrieben = null;
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  });
  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = '';
  });

  it('„Von Hand festlegen“: Titel im Kopf (benennt den Dialog), Enter sendet über das Formular; zu kurze Begründung hält den Dialog offen', () => {
    const host = render();
    act(() => host.querySelector<HTMLButtonElement>('.br-paragraf')!.click());
    act(() => knopf(host, /^(Von Hand festlegen|Festlegung ändern) …$/)!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('von Hand festlegen'))!;
    const kopf = dialog.querySelector<HTMLElement>('.modal-kopf')!;
    expect(kopf.textContent).toMatch(/– von Hand festlegen$/);
    expect(dialog.getAttribute('aria-labelledby')).toBe(kopf.id);
    // keine zweite Überschrift mit dem Titel im Inhalt
    expect(dialog.querySelectorAll('h2, h3').length).toBe(1);
    const form = dialog.querySelector('form')!;
    expect(form.lastElementChild?.classList.contains('dialog-buttons')).toBe(true);
    expect(knopf(dialog, 'Festlegen')!.type).toBe('submit');
    const absenden = () => act(() => void form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    tippen(dialog.querySelector('textarea')!, 'kurz');
    absenden();
    expect(dialog.isConnected).toBe(true);
    expect(dialog.textContent).toContain('mindestens 10 Zeichen');
    tippen(dialog.querySelector('textarea')!, 'Begehung am 03.11.2026 ohne Befund');
    absenden();
    expect(dialog.isConnected).toBe(false);
    expect(Object.keys(useBaurecht.getState().pruefung.festlegungen ?? {})).toContain(useBaurecht.getState().auswahl);
  });

  it('Prüfprotokoll: „Drucken / PDF …“ ist der Hauptknopf rechts außen, „Schließen“ steht links davon', () => {
    const host = render();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const knoepfe = [...document.querySelectorAll<HTMLButtonElement>('.br-protokoll .report-actions > button')];
    expect(knoepfe.at(-1)!.textContent?.trim()).toBe('Drucken / PDF …');
    expect(knoepfe.at(-1)!.classList.contains('primary')).toBe(true);
    expect(knoepfe.at(-2)!.textContent?.trim()).toBe('Schließen');
    expect(knoepfe.filter((k) => k.classList.contains('primary')).length).toBe(1);
  });

  it('Aufklapp- und Statuszeichen kommen aus dem Symbolsatz, nicht als Schriftzeichen', () => {
    const host = render();
    act(() => host.querySelector<HTMLButtonElement>('.br-paragraf')!.click());
    expect(host.textContent).not.toMatch(/[▾▸✓✗↗→]/);
    expect(document.body.textContent).not.toMatch(/[▾▸✓✗↗→]/);
    expect(host.querySelector('.br-norm-pfeil svg.symbol')).not.toBeNull();
  });

  it('Verwerfen-Abfrage: Absenden (Enter) legt nichts fest, der Dialog bleibt offen', () => {
    const host = render();
    act(() => host.querySelector<HTMLButtonElement>('.br-paragraf')!.click());
    act(() => knopf(host, /^(Von Hand festlegen|Festlegung ändern) …$/)!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('von Hand festlegen'))!;
    tippen(dialog.querySelector('textarea')!, 'Begehung am 03.11.2026 ohne Befund');
    act(() => knopf(dialog, 'Abbrechen')!.click());
    const abfrage = dialog.querySelector<HTMLElement>('.br-verwerfen .meldung.warnung[role="alert"]')!;
    expect(abfrage.textContent).toContain('Verwerfen?');
    act(() => void dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(dialog.isConnected).toBe(true);
    expect(Object.keys(useBaurecht.getState().pruefung.festlegungen)).not.toContain(useBaurecht.getState().auswahl);
  });

  it('„Angabe bestätigen“: Titel im Kopf, Absenden prüft die Begründung und übernimmt', () => {
    const host = render();
    act(() => knopf(host, 'alle')?.click());
    act(() => knopf(host, 'Bestätigen …')!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Worauf gestützt'))!;
    const kopf = dialog.querySelector<HTMLElement>('.modal-kopf')!;
    expect(kopf.textContent).toMatch(/bestätigen$/);
    expect(dialog.getAttribute('aria-labelledby')).toBe(kopf.id);
    expect(knopf(dialog, 'Bestätigen')!.type).toBe('submit');
    const absenden = () => act(() => void dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    absenden();
    expect(dialog.isConnected).toBe(true);
    expect(dialog.textContent).toMatch(/Bitte angeben, worauf/);
    tippen(dialog.querySelector('textarea')!, 'Flächen im Modell vollständig, geprüft am 12.11.2026');
    absenden();
    expect(dialog.isConnected).toBe(false);
    expect(Object.values(useBaurecht.getState().pruefung.fakten).some((f) => f.bestaetigt)).toBe(true);
  });
});

describe('Rückfrage, die nur über einen Hinweis gestellt wird', () => {
  beforeEach(() => {
    geschrieben = null;
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  });
  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = '';
  });

  it('Umfang nur Hinweis, „Altbau verfahrensfrei“ beantwortet: die Antwort gilt als beantwortet, „Bestätigen …“ steht am Umfang', () => {
    const host = render();
    act(() => useBaurecht.getState().merkmalSetzen('Vorhaben', 'Beseitigung'));
    act(() =>
      useBaurecht.setState((s) => ({
        pruefung: { ...s.pruefung, fakten: { ...s.pruefung.fakten, 'vorhaben.beseitigung_umfang': { wert: 'Abbruch mit Ersatzbau', herkunft: 'manuell', sicherheit: 'hinweis', grund: 'aus dem Formular' } } },
      })),
    );
    act(() => useBaurecht.getState().faktSetzen('nw.altbau_verfahrensfrei', true, 'TP'));
    const umfang = host.querySelector('[data-fakt="vorhaben.beseitigung_umfang"]');
    expect(umfang, 'der Umfang steht als offene Rückfrage da (nur Hinweis)').not.toBeNull();
    expect(umfang!.querySelector('button[data-bestaetigen]')).not.toBeNull();
    // die Antwort selbst ist beantwortet: keine offene Zeile mit „Bestätigen …“
    expect(host.querySelector('[data-fakt="nw.altbau_verfahrensfrei"] button[data-bestaetigen]')).toBeNull();
    expect(useBaurecht.getState().pruefung.fakten['nw.altbau_verfahrensfrei']).toMatchObject({ wert: true, sicherheit: 'sicher' });
    expect(useBaurecht.getState().pruefung.fakten['nw.altbau_verfahrensfrei'].ueberHinweis).toBeUndefined();
  });
});
