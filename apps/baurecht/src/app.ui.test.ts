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

const { App, speichern, speichernVollstaendig } = await import('./App');
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
    const ids = Object.entries(auswertungMit({}).faktDefs).filter(([id, d]) => d.gruppe === 'schutz' && id.startsWith('schutz.')).map(([id]) => id);
    const geo = Object.fromEntries(ids.map((id) => [id, { wert: false, herkunft: 'geodienst' as const, sicherheit: 'hinweis' as const, quelle: 'LINFOS', grund: 'kein Treffer', lage }]));
    act(() => useBaurecht.setState({ pruefung: { ...useBaurecht.getState().pruefung, fakten: Object.fromEntries(Object.entries(geo).map(([id, f]) => [id, id === 'schutz.nsg' ? f : { ...f, bestaetigt: { von: 'TP', am: '2026-11-12', grund: 'Auskunft UNB', lage } }])) } }));
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
    const gruppe = host.querySelector<HTMLElement>('[data-merkmal="Planungsrecht"] .br-segment')!;
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
    act(() => knopf(host, 'Prüfprotokoll')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    expect(d.getAttribute('aria-label')).toMatch(/^Baurechtliche Prüfung vor dem Einreichen – BAUA 1/);
    const h2 = [...d.querySelectorAll('h2')].map((h) => h.textContent ?? '');
    const i = (t: string) => h2.findIndex((x) => x.startsWith(t));
    expect(i('Grundlagen')).toBeLessThan(i('Festlegungen von Hand'));
    expect(i('Festlegungen von Hand')).toBeLessThan(i('Gesicherte Angaben'));
    expect(i('Gesicherte Angaben')).toBeLessThan(i('Offene Punkte'));
    expect(d.querySelector('.br-protokoll-offen thead')?.textContent).toMatch(/Was fehlt.*Paragrafen.*Paragrafen/);
    expect(d.textContent).toMatch(/Angaben von Hand ohne Beleg/);
    // Entwurf: Abschließen gesperrt, der Grund steht sichtbar daneben
    expect(knopf(d, 'Prüfung abschließen')!.disabled).toBe(true);
    expect(d.querySelector('.br-sperre')?.textContent).toMatch(/Erst speichern/);
    // keine doppelten Kurzformen in den Überschriften der Normen
    for (const h3 of d.querySelectorAll('.br-protokoll-norm h3')) expect(h3.textContent).not.toMatch(/\(([^()]+)\) \(\1\)/);
    act(() => knopf(d, 'Schließen')!.click());
  });

  it('Fokusfalle im Protokoll: Tab bleibt drin; liegt ein Dialog darüber, führt der den Fokus', () => {
    const host = render();
    act(() => knopf(host, 'Prüfprotokoll')!.click());
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
    const knopfSchema = host.querySelector<HTMLButtonElement>('.titlebar-schema')!;
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

  it('Merkmal ändern wirkt sofort auf die Ampeln und gilt als ungespeicherte Änderung', () => {
    const host = render();
    const vorher = host.querySelector('.br-bilanz')!.textContent;
    // alle Merkmale festgelegt: die Gruppe ist eingeklappt – aufklappen
    if (!host.querySelector('[data-merkmal="Planungsrecht"]')) act(() => knopf(host, /Antragsmerkmale/)!.click());
    act(() => knopf(host.querySelector('[data-merkmal="Planungsrecht"]')!, 'Außenbereich')!.click());
    expect(host.querySelector('.br-bilanz')!.textContent).not.toBe(vorher);
    expect(host.querySelector('.titlebar-dirty')).not.toBeNull();
  });
});
