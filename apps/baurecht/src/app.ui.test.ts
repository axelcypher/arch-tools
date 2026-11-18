// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readProjectFile } from '@core/archive';
import { baurechtAusRoh } from '@core/baurecht/projekt';
import { projektdateiRoh } from '@core/projektdatei';
import { farbschemaWechseln } from '@core/ui/rauchtest';
import { hinweiseLeeren, zeigeHinweis } from '@core/ui/Hinweis';

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
const { dialogeZuruecksetzen } = await import('./components/Dialoge');
const { beispielOap } = await import('./beispiel.test');
const { useBaurecht } = await import('./store');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// mehrere volle Auswertungen je Speichern (Folgen je Punkt) – bei paralleler Last mehr als die 5 s der Vorgabe
vi.setConfig({ testTimeout: 20000 });

// Ausblendungen nach echter Zeit anhalten – „Gespeichert“ im Kopf nach 4 s (components/Kopf.tsx, GespeichertMeldung) und
// die Ansage nach 1,5 s (components/Angaben.tsx): Auf langsamen Runnern (Windows im Release-Lauf) war die Meldung beim
// Prüfen sonst schon weg. Kürzere Fristen (Entprellen, Fokus) laufen echt weiter – außer im Test der entprellten
// Vorschriften-Ansage (450 ms), der wie die beiden Ausblend-Tests (4 s, 1,5 s) vi.useFakeTimers() nutzt; das ersetzt den
// Spion. Wer die Fristen in Kopf.tsx oder Angaben.tsx ändert, zieht AUSBLENDEN_MS mit – die Ausblend-Tests schlagen sonst an.
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
  // Dialoge mit eigenem Store blieben sonst für den nächsten Test offen
  dialogeZuruecksetzen();
  // Hinweise stehen in einem Store auf Modulebene und überleben das Unmount
  hinweiseLeeren();
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
/**
 * Grenze für das Warten auf einen Zustand nach einer Auswertung (Ansage, Fokus): die Auswertung läuft in happy-dom
 * synchron und braucht schon lokal gut 1,5 s bis zur entprellten Ansage – auf den Windows-Runnern des Release-Laufs
 * reichten 3 s nicht. Zwei Wartezeiten (16 s) lassen unter dem testTimeout von 20 s Raum für die übrigen Schritte.
 */
const LANGSAME_RUNNER = { timeout: 8000, interval: 50 };
const tippen = (el: HTMLTextAreaElement | HTMLInputElement, wert: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, wert);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

/** die Prüfung des Antrags, wie sie in der zuletzt geschriebenen Datei steht */
const inDatei = () => baurechtAusRoh(projektdateiRoh(geschrieben!)).pruefungen['BAUA 1'];

/** ersten Paragrafen wählen und von Hand festlegen – ein Klick, ohne Begründungstext */
function festlegen(host: HTMLElement, ampel?: 'rot' | 'gelb' | 'gruen', id?: string): string {
  // ohne Kennung der erste Paragraf; mit Kennung genau dieser (die Liste ordnet nach Ampel um)
  act(() => host.querySelector<HTMLButtonElement>(id ? `[data-roving="p:${CSS.escape(id)}"]` : '.br-paragraf')!.click());
  act(() => knopf(host, /^(Von Hand festlegen|Festlegung ändern) …$/)!.click());
  const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('von Hand festlegen'))!;
  if (ampel) {
    const i = ['rot', 'gelb', 'gruen'].indexOf(ampel);
    act(() => dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')[i].click());
  }
  act(() => knopf(dialog, 'Festlegen')!.click());
  return useBaurecht.getState().auswahl!;
}

/** speichern – ohne Rückfrage: es gibt keine zweite Bestätigung mehr, kein neuer Dialog erscheint */
async function speichernOhneDialog(): Promise<void> {
  const vorher = document.querySelectorAll('[role="dialog"]').length;
  await act(async () => {
    expect(await speichern()).toBe(true);
  });
  expect(document.querySelectorAll('[role="dialog"]').length, 'kein neuer Dialog beim Speichern').toBe(vorher);
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

  it('§ 246e: gefragt werden Tatsachen; die frühere Rechtsfrage steht nur mit einer Antwort aus einer älteren Datei da und geht mit „zurücksetzen“', async () => {
    const { aktuelleLage } = await import('./pruefung');
    const host = render();
    const angaben = () => host.querySelector('.br-angaben')!;
    const frage = () => [...angaben().querySelectorAll<HTMLElement>('.br-fakt')].find((z) => /Frühere Angabe/.test(z.textContent ?? ''));
    // neues Projekt: die Tatsachenfrage zur Umgebung, keine Rechtsfrage
    expect(angaben().textContent).toMatch(/Fehlt für das Vorhaben ein Vorbild in der näheren Umgebung/);
    expect(frage()).toBeUndefined();
    // Antwort aus einer älteren Datei: die Frage steht mit ihr da (sie gilt weiter); „zurücksetzen“ nimmt sie zurück
    act(() => useBaurecht.getState().faktSetzen('planung.wohnungsbau_246e', true, 'TP'));
    expect(frage()).toBeTruthy();
    act(() => knopf(frage()!, 'zurücksetzen')!.click());
    expect(frage()).toBeUndefined();
    expect(useBaurecht.getState().pruefung.fakten['planung.wohnungsbau_246e']).toBeUndefined();
    // ergibt sich der Wert aus den Tatsachen (Planungsrecht für den Ort bestätigt, Vorbild in der Umgebung vorhanden, keine Sperre
    // oder Satzung): er steht unter „Ergibt sich …“ – ohne „Überstimmen …“, geändert werden die Tatsachen
    act(() => useBaurecht.getState().planungsrechtBestaetigen());
    act(() => {
      // Angaben zum Ort zählen nur mit Lagebezug als gesichert
      const lage = aktuelleLage(useBaurecht.getState().project).lage;
      for (const id of ['planung.abweichung_umgebung', 'planung.veraenderungssperre', 'planung.erhaltungssatzung', 'planung.erhaltungssatzung_aufstellung', 'planung.sanierungsgebiet', 'planung.planaufstellung']) useBaurecht.getState().faktSetzen(id, false, 'TP', undefined, lage);
    });
    const zeile = angaben().querySelector<HTMLElement>('.br-ergibt li[data-fakt="planung.wohnungsbau_246e"]');
    expect(zeile?.textContent).toMatch(/Sonderregelung Wohnungsbau \(§ 246e\): nein – das Vorhaben hat Vorbilder in der näheren Umgebung/);
    expect(knopf(zeile!, 'Überstimmen …')).toBeUndefined();
    // andere abgeleitete Werte behalten „Überstimmen …“
    expect(knopf(angaben().querySelector<HTMLElement>('.br-ergibt li[data-fakt="gebaeude.wohnungen"]')!, 'Überstimmen …')).toBeTruthy();
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

  it('Paragraf wählen → Einzelheiten; von Hand festlegen mit einem Klick (ohne Begründungsfeld); Speichern ohne Rückfrage', async () => {
    const host = render();
    const zeile = host.querySelector<HTMLButtonElement>('.br-paragraf')!;
    act(() => zeile.click());
    expect(host.querySelector('.br-detail h3')?.textContent).toBe('Begründung');
    act(() => knopf(host, 'Von Hand festlegen …')!.click());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain('von Hand festlegen');
    // Vorgabe ist die automatische Ampel (keine voreingestellte Herabstufung)
    expect(dialog.querySelector('.meldung.warnung')).toBeNull();
    // kein Begründungsfeld, kein Pflichtfeld: „Festlegen“ übernimmt sofort
    expect(dialog.querySelector('textarea')).toBeNull();
    expect(dialog.querySelector('[required], [aria-required="true"]')).toBeNull();
    act(() => knopf(dialog, 'Festlegen')!.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const ids = Object.keys(useBaurecht.getState().pruefung.festlegungen);
    expect(ids).toHaveLength(1);
    const f = useBaurecht.getState().pruefung.festlegungen[ids[0]];
    expect(f.von).toBeTruthy();
    expect(f.am).toMatch(/^\d{4}-/);
    expect(f.grund).toBeUndefined();
    // bis zum Speichern als Entwurf erkennbar – und als „von Hand“
    expect(host.querySelector('.br-marke-entwurf')?.textContent).toMatch(/von Hand/);

    await speichernOhneDialog();
    // in der geschriebenen Datei: mit Zeitpunkt des Speicherns, Wert, Namen und Datum
    expect(inDatei().festlegungen[ids[0]]).toMatchObject({ ampel: f.ampel, von: f.von, am: f.am });
    expect(inDatei().festlegungen[ids[0]].bestaetigt).toMatch(/^\d{4}-/);
    expect(useBaurecht.getState().pruefung.festlegungen[ids[0]].bestaetigt).toMatch(/^\d{4}-/);
    expect(host.querySelector('.br-marke-entwurf')).toBeNull();
  });

  it('eine geänderte Festlegung übernimmt das Speichern ohne Rückfrage', async () => {
    const host = render();
    festlegen(host, 'rot');
    const id = Object.keys(useBaurecht.getState().pruefung.festlegungen)[0];
    await speichernOhneDialog();
    expect(inDatei().festlegungen[id]).toMatchObject({ ampel: 'rot' });
    // ändern (Herabstufung auf grün) und speichern
    festlegen(host, 'gruen', id);
    expect(useBaurecht.getState().pruefung.festlegungen[id]).toMatchObject({ ampel: 'gruen' });
    expect(useBaurecht.getState().pruefung.festlegungen[id].bestaetigt).toBeUndefined();
    await speichernOhneDialog();
    expect(inDatei().festlegungen[id]).toMatchObject({ ampel: 'gruen' });
    expect(inDatei().festlegungen[id].bestaetigt).toMatch(/^\d{4}-/);
  });

  it('Aufheben einer gespeicherten Festlegung übernimmt das Speichern ohne Rückfrage', async () => {
    const host = render();
    festlegen(host, 'rot');
    const id = Object.keys(useBaurecht.getState().pruefung.festlegungen)[0];
    await speichernOhneDialog();
    act(() => knopf(host, /Festlegung aufheben/)!.click());
    expect(useBaurecht.getState().pruefung.festlegungen[id]).toBeUndefined();
    await speichernOhneDialog();
    expect(inDatei().festlegungen[id]).toBeUndefined();
  });

  it('Hinweis bestätigen mit einem Klick (ohne Begründungsfeld); im Protokoll mit Namen und Datum', async () => {
    const host = render();
    act(() => knopf(host, 'alle')?.click());
    const b = knopf(host, 'Bestätigen …');
    expect(b, 'mindestens eine Angabe ist nur Hinweis').toBeTruthy();
    act(() => b!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('bestätigen'))!;
    expect(dialog.querySelector('textarea')).toBeNull();
    // Startfokus auf „Bestätigen“ – ein Enter genügt
    await vi.waitFor(() => expect(document.activeElement).toBe(knopf(dialog, 'Bestätigen')));
    act(() => knopf(dialog, 'Bestätigen')!.click());
    const [id, f] = Object.entries(useBaurecht.getState().pruefung.fakten).find(([, x]) => x.bestaetigt)!;
    expect(f.bestaetigt).toMatchObject({ von: expect.any(String), am: expect.stringMatching(/^\d{4}-/) });
    expect(f.bestaetigt!.grund).toBeUndefined();
    await speichernOhneDialog();
    expect(inDatei().fakten[id].bestaetigt).toMatchObject({ von: f.bestaetigt!.von, am: f.bestaetigt!.am });
    // im Protokoll: gesichert von, am – ohne Spalte für einen Beleg
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    const tabelle = [...d.querySelectorAll('h2')].find((h) => h.textContent?.startsWith('Gesicherte Angaben'))!.nextElementSibling!;
    expect(tabelle.textContent).toContain(f.bestaetigt!.von);
    expect(tabelle.textContent).not.toMatch(/gestützt auf/);
  });

  it('Vorfragen: oben in ihrer Gruppe, Einzelfragen eingeklappt; „unklar“ klappt sie auf; „Keine davon …“ mit einem Klick (ohne Belegfelder); Protokoll nennt, was entfällt', async () => {
    const host = render();
    const gruppe = host.querySelector('#br-g-schutz')!.closest('section')!;
    // oben in der Gruppe: „Keine davon …“, dann die Vorfragen
    expect(gruppe.firstElementChild!.nextElementSibling!.classList.contains('br-vorfragen-sammel')).toBe(true);
    const bloecke = [...gruppe.children].filter((e) => e.matches('.br-vorfrage, .br-fakt'));
    expect(bloecke[0].matches('.br-vorfrage')).toBe(true);
    const vf = gruppe.querySelector<HTMLElement>('[data-vorfrage="vorfrage.natura2000"]')!;
    // eingeklappt: „Einzelfragen zeigen“ klappt nur die Ansicht auf – „unklar“ bleibt ungewählt
    expect(vf.querySelector('[data-fakt="schutz.ffh"]')).toBeNull();
    const zeigen = knopf(vf, /Einzelfragen zeigen/)!;
    expect(zeigen.getAttribute('aria-expanded')).toBe('false');
    act(() => zeigen.click());
    expect(vf.querySelector('[data-fakt="schutz.ffh"]')).toBeTruthy();
    expect(knopf(vf, 'unklar')!.getAttribute('aria-pressed')).toBe('false');
    expect(knopf(vf, /Einzelfragen ausblenden/)!.getAttribute('aria-controls')).toBe('br-ez-vorfrage.natura2000');
    act(() => knopf(vf, /Einzelfragen ausblenden/)!.click());
    expect(vf.querySelector('[data-fakt="schutz.ffh"]')).toBeNull();
    // „unklar“: eine Antwort ohne Wert – die Einzelfragen stehen offen da, ohne Knopf zum Ausblenden
    act(() => knopf(vf, 'unklar')!.click());
    expect(vf.querySelector('[data-fakt="schutz.ffh"]')).toBeTruthy();
    expect(knopf(vf, 'unklar')!.getAttribute('aria-pressed')).toBe('true');
    expect(knopf(vf, /Einzelfragen ausblenden/)).toBeUndefined();
    expect(useBaurecht.getState().pruefung.fakten['vorfrage.natura2000']).toBeUndefined();
    // ein zweiter Klick nimmt „unklar“ zurück
    act(() => knopf(vf, 'unklar')!.click());
    expect(knopf(vf, 'unklar')!.getAttribute('aria-pressed')).toBe('false');
    expect(vf.querySelector('[data-fakt="schutz.ffh"]')).toBeNull();
    // alle offenen Vorfragen der Gruppe auf einmal mit „nein“ – der Dialog nennt jede, ohne Texteingabe
    const offen = [...gruppe.querySelectorAll<HTMLElement>('[data-vorfrage^="vorfrage."]')].filter((b) => b.querySelector('.br-fakt.br-offen[data-fakt^="vorfrage."]')).map((b) => b.dataset.vorfrage!);
    expect(offen.length).toBeGreaterThanOrEqual(2);
    act(() => knopf(gruppe, 'Keine davon …')!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('Vorfragen mit „nein“ beantworten'))!;
    expect(dialog.textContent).toMatch(/^Schutzgebiete und Denkmal: \d+ Vorfragen/);
    expect(dialog.querySelector('textarea')).toBeNull();
    expect(dialog.querySelectorAll('.br-vorfragen-liste li').length).toBe(offen.length);
    // Startfokus auf „Übernehmen“ – ein Klick bzw. Enter genügt
    await vi.waitFor(() => expect(document.activeElement).toBe(knopf(dialog, 'Übernehmen')));
    act(() => knopf(dialog, 'Übernehmen')!.click());
    offen.forEach((v) => expect(useBaurecht.getState().pruefung.fakten[v], v).toMatchObject({ wert: false, bestaetigt: { von: expect.any(String) } }));
    offen.forEach((v) => expect(useBaurecht.getState().pruefung.fakten[v].bestaetigt!.grund, v).toBeUndefined());
    // Fokus auf die erste Vorfrage (der Knopf ist weg), eine Ansage für alle
    expect(host.querySelector(`[data-fakt="${offen[0]}"]`)!.contains(document.activeElement)).toBe(true);
    expect(useBaurecht.getState().ansage).toMatch(/Vorfragen mit „nein“ beantwortet/);
    const nachher = host.querySelector<HTMLElement>('[data-vorfrage="vorfrage.natura2000"]')!;
    expect(nachher.querySelector('[data-fakt="schutz.ffh"]')).toBeNull();
    expect(nachher.textContent).toMatch(/Entfallen wegen „nein“: .*FFH-Gebiet/);
    expect(knopf(host, 'Keine davon …')).toBeUndefined();
    // im Protokoll: je Vorfrage die entfallenen Einzelfragen, die Vorfrage mit wer und wann als Grund
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    const h = [...d.querySelectorAll('h2')].find((x) => x.textContent?.startsWith('Wegen „nein“ in der Vorfrage entfallen'))!;
    expect(h).toBeTruthy();
    const tabelle = h.nextElementSibling as HTMLElement;
    const zeile = [...tabelle.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.startsWith('Natura 2000'))!;
    expect(zeile.textContent).toMatch(/von Hand \(.+\), \d\d\.\d\d\.\d{4}/);
    expect(zeile.textContent).not.toMatch(/Beleg/);
    expect(zeile.textContent).toMatch(/FFH-Gebiet.*Vogelschutzgebiet.*Natura-2000-Gebiet in der Nähe/);
    act(() => knopf(d, 'Schließen')!.click());
  });

  it('Werte, die sich aus anderen ergeben: keine Frage, am Ende der Gruppe mit Grund; Überstimmen über den Bestätigungsdialog; Protokoll nennt sie', () => {
    const host = render();
    const gruppe = host.querySelector('#br-g-gebaeude')!.closest('section')!;
    // Einfamilienhaus: keine Frage nach Besuchern, sondern „ergibt sich“
    expect(gruppe.querySelector('.br-fakt[data-fakt="gebaeude.besucher"]')).toBeNull();
    const liste = gruppe.querySelector<HTMLDetailsElement>('.br-ergibt')!;
    expect(liste.querySelector('summary')!.textContent).toMatch(/^Ergibt sich aus anderen Angaben \(\d+\)$/);
    const zeile = liste.querySelector<HTMLElement>('li[data-fakt="gebaeude.besucher"]')!;
    expect(zeile.textContent).toMatch(/Besucher.*: 0 – reines Wohngebäude – keine Versammlungsstätte/);
    // überstimmen: die Frage steht da, eine Antwort über den Bestätigungsdialog
    act(() => knopf(zeile, 'Überstimmen …')!.click());
    const frage = host.querySelector<HTMLElement>('.br-fakt[data-fakt="gebaeude.besucher"]')!;
    expect(frage).toBeTruthy();
    expect(host.querySelector('.br-ergibt li[data-fakt="gebaeude.besucher"]')).toBeNull();
    // Rückweg: „nicht überstimmen“ – die Frage verschwindet wieder
    act(() => knopf(frage, 'nicht überstimmen')!.click());
    expect(host.querySelector('.br-fakt[data-fakt="gebaeude.besucher"]')).toBeNull();
    expect(host.querySelector('.br-ergibt li[data-fakt="gebaeude.besucher"]')).toBeTruthy();
    // überstimmen (Sonderfall): „Aufenthaltsräume: nein“ im Einfamilienhaus – Dialog mit eigenem Text, danach gilt die
    // Antwort ohne Widerspruch
    act(() => knopf(host.querySelector<HTMLElement>('.br-ergibt li[data-fakt="gebaeude.aufenthaltsraeume"]')!, 'Überstimmen …')!.click());
    const ar = host.querySelector<HTMLElement>('.br-fakt[data-fakt="gebaeude.aufenthaltsraeume"]')!;
    act(() => knopf(ar, 'nein')!.click());
    const dlg = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((x) => x.textContent?.includes('von Hand setzen'))!;
    expect(dlg.textContent).toMatch(/ergibt sich sonst aus anderen Angaben/);
    act(() => knopf(dlg, 'Übernehmen')!.click());
    expect(useBaurecht.getState().pruefung.fakten['gebaeude.aufenthaltsraeume']).toMatchObject({ wert: false, bestaetigt: { von: expect.any(String) } });
    const arNach = host.querySelector<HTMLElement>('.br-fakt[data-fakt="gebaeude.aufenthaltsraeume"]')!;
    expect(arNach.querySelector('.br-widerspruch')).toBeNull();
    // eine abweichende ältere Antwort ohne Bestätigung: Widerspruch, „Als Sonderfall übernehmen …“
    act(() => useBaurecht.getState().faktSetzen('gebaeude.besucher', 300, 'TP'));
    const alt = host.querySelector<HTMLElement>('.br-fakt[data-fakt="gebaeude.besucher"]')!;
    expect(alt.querySelector('.br-widerspruch')).toBeTruthy();
    expect(knopf(alt, 'Als Sonderfall übernehmen …')).toBeTruthy();
    // im Protokoll: „Ergibt sich aus anderen Angaben“ mit Grund
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    const h = [...d.querySelectorAll('h2')].find((x) => x.textContent?.startsWith('Ergibt sich aus anderen Angaben'))!;
    expect(h).toBeTruthy();
    expect((h.nextElementSibling as HTMLElement).textContent).toMatch(/Wohnungen.*1.*Einfamilienhaus – eine Wohnung/);
    act(() => knopf(d, 'Schließen')!.click());
  });

  it('Schutzgebiet von Hand setzen über den Bestätigungsdialog (ohne Texteingabe); ändert sich die Angabe währenddessen, wird abgebrochen', async () => {
    // die Einzelfrage steht unter ihrer Vorfrage – aufgeklappt („Einzelfragen zeigen“)
    act(() => useBaurecht.setState({ vorfragenAuf: { 'vorfrage.naturschutz': true } }));
    const host = render();
    act(() => knopf(host, 'alle')?.click());
    const zeile = host.querySelector<HTMLElement>('[data-fakt="schutz.lsg"]')!;
    expect(zeile, 'Zeile Landschaftsschutzgebiet').toBeTruthy();
    act(() => knopf(zeile, 'nein')!.click());
    // noch nichts gesetzt – erst der Dialog mit den Folgen
    expect(useBaurecht.getState().pruefung.fakten['schutz.lsg']).toBeUndefined();
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('von Hand setzen'))!;
    expect(dialog.textContent).toMatch(/Vorschrift|ändert dadurch/);
    expect(dialog.querySelector('textarea')).toBeNull();
    // währenddessen liefert „Lage abfragen“ einen Treffer
    act(() => useBaurecht.getState().geoFakten({ 'schutz.lsg': { wert: true, herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'LINFOS' } }));
    act(() => knopf(dialog, 'Übernehmen')!.click());
    expect(dialog.textContent).toMatch(/inzwischen geändert/);
    expect(useBaurecht.getState().pruefung.fakten['schutz.lsg']).toMatchObject({ wert: true, herkunft: 'geodienst' });
    // Dialog schließen: ohne Rückfrage (nichts getippt, nichts zu verwerfen)
    act(() => knopf(dialog, 'Abbrechen')!.click());
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
    act(() => useBaurecht.setState({ vorfragenAuf: { 'vorfrage.naturschutz': true } }));
    const host = render();
    act(() => knopf(host, 'alle Angaben')?.click());
    const zeile = host.querySelector<HTMLElement>('[data-fakt="schutz.nsg"]')!;
    act(() => knopf(zeile, 'Bestätigen …')!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('bestätigen'))!;
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
    act(() => useBaurecht.setState({ project: { ...p, meta: { ...p.meta, koordinaten: undefined } }, vorfragenAuf: { 'vorfrage.naturschutz': true } }));
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

  it('Kartenlayout: Angaben, Ergebnis, Vorschriften und Einzelheiten als benannte Karten auf der Fläche; F6 und Sprungmarken erreichen jede', () => {
    const host = render();
    const flaeche = host.querySelector('.flaeche')!;
    expect(flaeche).toBeTruthy();
    // jede Karte ist ein Bereich, benannt über die Überschrift im Kartenkopf (h2)
    const titel = [...flaeche.querySelectorAll<HTMLElement>('.karte')].map((k) => document.getElementById(k.getAttribute('aria-labelledby') ?? '')?.textContent);
    expect(titel.slice(0, 3)).toEqual(['Angaben', 'Ergebnis', 'Vorschriften']);
    // Angaben und Einzelheiten sind Nebenbereiche (aside, benannt über die Überschrift), die Mitte der Hauptbereich – genau ein main
    expect(host.querySelector('.br-angaben')!.matches('aside.karte[aria-labelledby]')).toBe(true);
    expect(host.querySelector('.br-detail')!.matches('aside.karte[aria-labelledby]')).toBe(true);
    const name = (sel: string) => document.getElementById(host.querySelector(sel)!.getAttribute('aria-labelledby')!)!.textContent;
    // ohne Auswahl „Einzelheiten“, mit Auswahl „Einzelheiten: § … – …“ (der Vorsatz steht unsichtbar im h2)
    act(() => useBaurecht.getState().waehlen(null));
    expect(name('.br-detail')).toBe('Einzelheiten');
    act(() => host.querySelector<HTMLButtonElement>('.br-paragraf')!.click());
    expect(host.querySelector('.br-detail')!.matches('aside.karte[aria-labelledby]')).toBe(true);
    expect(name('.br-detail')).toMatch(/^Einzelheiten: §\s\d+.* – \S/);
    expect(host.querySelectorAll('main')).toHaveLength(1);
    expect(host.querySelector('main')!.getAttribute('aria-label')).toBe('Prüfung');
    expect(host.querySelector('main')!.contains(host.querySelector('.br-ergebnis'))).toBe(true);
    expect(host.querySelector('main')!.contains(host.querySelector('.br-vorschriften-karte'))).toBe(true);
    // F6 läuft durch Werkzeugleiste und alle Karten
    const f6 = () => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', bubbles: true })));
    const stationen: string[] = [];
    for (let i = 0; i < 5; i++) {
      f6();
      stationen.push(['.br-kopf', '.br-angaben', '.br-ergebnis', '.br-vorschriften-karte', '.br-detail'].find((sel) => host.querySelector(sel)!.contains(document.activeElement)) ?? '');
    }
    expect(stationen).toEqual(['.br-kopf', '.br-angaben', '.br-ergebnis', '.br-vorschriften-karte', '.br-detail']);
    expect([...host.querySelectorAll('.br-sprung button')].map((b) => b.textContent)).toEqual(['Zu den Angaben', 'Zum Ergebnis', 'Zu den Vorschriften', 'Zu den Einzelheiten']);
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.br-sprung button')].find((b) => b.textContent === 'Zum Ergebnis')!.click());
    expect(host.querySelector('.br-ergebnis')!.contains(document.activeElement)).toBe(true);
  });

  it('F6 ohne gewählten Paragrafen: die Überschrift der leeren Einzelheiten bekommt den Fokus, nichts hängt', () => {
    act(() => useBaurecht.getState().waehlen(null));
    const host = render();
    const liste = host.querySelector<HTMLElement>('.br-vorschriften-liste [data-roving][tabindex="0"]')!;
    act(() => liste.focus());
    const f6 = (shift = false) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', shiftKey: shift, bubbles: true })));
    f6();
    expect(document.activeElement).toBe(host.querySelector('.br-detail h2 [data-f6-ziel]'));
    f6();
    expect(host.querySelector('.br-kopf')!.contains(document.activeElement)).toBe(true);
    f6(true);
    expect(document.activeElement).toBe(host.querySelector('.br-detail h2 [data-f6-ziel]'));
    f6(true);
    expect(host.querySelector('.br-vorschriften-liste')!.contains(document.activeElement)).toBe(true);
  });

  it('F6: der Hinweis nach einer Aktion ist die letzte Station – ohne Hinweis übersprungen, aus dem Hinweis weiter zum Kopf', () => {
    const host = render();
    const f6 = (shift = false) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', shiftKey: shift, bubbles: true, cancelable: true })));
    const inDetail = () => host.querySelector('.br-detail')!.contains(document.activeElement);
    const imKopf = () => host.querySelector('.br-kopf')!.contains(document.activeElement);
    const imHinweis = () => !!document.querySelector('.hinweise')?.contains(document.activeElement);
    // ohne Hinweis: von den Einzelheiten direkt zum Kopf
    act(() => host.querySelector<HTMLButtonElement>('.br-paragraf')!.click());
    for (let i = 0; i < 6 && !inDetail(); i++) f6();
    expect(inDetail()).toBe(true);
    f6();
    expect(imKopf()).toBe(true);
    // mit Hinweis: Einzelheiten → Hinweis → Kopf, genau ein Schritt je F6 (core führt F6 nicht zusätzlich)
    act(() => void zeigeHinweis({ id: 'test-f6', text: 'Gespeichert', aktionen: [{ text: 'Ordner öffnen', aktion: () => undefined }] }));
    f6(true);
    expect(imHinweis()).toBe(true);
    expect(document.activeElement?.textContent).toBe('Ordner öffnen');
    f6();
    expect(imKopf()).toBe(true);
    f6(true);
    expect(imHinweis()).toBe(true);
    f6(true);
    expect(inDetail()).toBe(true);
  });

  it('Festlegung aufheben: Fokus auf „Von Hand festlegen …“, Rückgängig stellt sie wieder her', () => {
    const host = render();
    const id = festlegen(host, 'rot');
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
    festlegen(host, 'rot');
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    expect(d.getAttribute('aria-label')).toMatch(/^Baurechtliche Prüfung vor dem Einreichen – BAUA 1/);
    const h2 = [...d.querySelectorAll('h2')].map((h) => h.textContent ?? '');
    const i = (t: string) => h2.findIndex((x) => x.startsWith(t));
    expect(i('Grundlagen')).toBeLessThan(i('Festlegungen von Hand'));
    expect(i('Festlegungen von Hand')).toBeLessThan(i('Gesicherte Angaben'));
    expect(i('Gesicherte Angaben')).toBeLessThan(i('Offene Punkte'));
    expect(d.querySelector('.br-protokoll-offen thead')?.textContent).toMatch(/Was fehlt.*Anzahl.*Paragrafen/);
    expect(d.textContent).toMatch(/Angaben von Hand ohne eigene Bestätigung/);
    // die Festlegung mit Ampel, Namen und Datum – ohne Spalte „Begründung“ (es gibt keine)
    const fl = [...d.querySelectorAll('h2')].find((h) => h.textContent?.startsWith('Festlegungen von Hand'))!.nextElementSibling!;
    expect(fl.querySelector('thead')!.textContent).not.toMatch(/Begründung/);
    expect(fl.querySelector('tbody')!.textContent).toMatch(/gilt.*\d\d\.\d\d\.\d{4}.*Entwurf – noch nicht gespeichert/);
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
    // erst, wenn die Texte geladen sind: trifft ein Text ein, während das Protokoll offen ist, baut es sich neu auf und der
    // Startfokus ginge mit dem alten Knopf verloren (je nach Reihenfolge der Tests)
    await vi.waitFor(
      async () => {
        await pause();
        expect(useBaurecht.getState().laedt).toEqual([]);
      },
      { timeout: 15000, interval: 50 },
    );
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

  it('Verlassen mit Entwürfen: speichert ohne Rückfrage, danach bleibt nichts offen', async () => {
    const host = render();
    const id = festlegen(host, 'rot');
    let ergebnis = false;
    await act(async () => {
      ergebnis = await speichernVollstaendig();
    });
    expect(ergebnis).toBe(true);
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull();
    expect(inDatei().festlegungen[id].bestaetigt).toMatch(/^\d{4}-/);
  });

  it('Vorschau mit Widerspruch: der Bestätigen-Dialog sagt, dass der Widerspruch bleibt', async () => {
    const { angabeVonHand } = await import('@core/baurecht/angaben');
    const ags = angabeVonHand({ wert: '05974036', herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'ALKIS' }, 'lage.ags', '05974040', { von: 'TP', heute: '2026-11-12' });
    act(() => useBaurecht.setState({ pruefung: { ...useBaurecht.getState().pruefung, fakten: { 'lage.ags': ags } } }));
    const host = render();
    act(() => knopf(host, 'alle Angaben')?.click());
    const zeile = [...host.querySelectorAll<HTMLElement>('.br-fakt')].find((z) => /Gemeindeschlüssel/.test(z.textContent ?? '') && !!knopf(z, 'Bestätigen …'))!;
    act(() => knopf(zeile, 'Bestätigen …')!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('bestätigen'))!;
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

  it('Filter-Menü: liegt fest positioniert unter „Filter“ über der Fläche (die Karte „Ergebnis“ schnitte es ab); Größenänderung schließt es', () => {
    const host = render();
    const menue = host.querySelector<HTMLDetailsElement>('.br-filter-menue')!;
    expect(menue.closest('.br-ergebnis')).toBeTruthy();
    menue.querySelector('summary')!.getBoundingClientRect = () => ({ top: 200, bottom: 224, left: 310, right: 380, width: 70, height: 24, x: 310, y: 200, toJSON: () => ({}) }) as DOMRect;
    act(() => {
      menue.open = true;
      menue.dispatchEvent(new Event('toggle'));
    });
    const inhalt = menue.querySelector<HTMLElement>('.br-filter-menue-inhalt')!;
    expect(inhalt.style.top).toBe('228px');
    // rechtsbündig zum Knopf (in happy-dom ohne Layout ist das Menü 0 px breit)
    expect(inhalt.style.left).toBe('380px');
    expect(document.activeElement).toBe(inhalt.querySelector('input'));
    act(() => void window.dispatchEvent(new Event('resize')));
    expect(menue.open).toBe(false);
  });

  it('Farbschema im Menü der Titelleiste („Darstellung und Hilfe“): Fokus hinein, → öffnet das Untermenü, ↑/↓ bewegen, Esc schließt stufenweise und gibt den Fokus zurück', () => {
    const host = render();
    const mehr = host.querySelector<HTMLButtonElement>('.titlebar .titlebar-menue')!;
    act(() => mehr.focus());
    act(() => mehr.click());
    expect(document.activeElement?.querySelector('.menue-text')?.textContent).toBe('Farbschema');
    const taste = (key: string) => act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    taste('ArrowRight');
    const optionen = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    expect(optionen.map((o) => o.textContent)).toEqual(['Auto (wie System)', 'Hell', 'Dunkel']);
    expect(optionen).toContain(document.activeElement);
    const vorher = document.activeElement;
    taste('ArrowDown');
    expect(document.activeElement).not.toBe(vorher);
    taste('Escape');
    expect(document.querySelector('[role="menuitemradio"]')).toBeNull();
    expect(document.activeElement?.querySelector('.menue-text')?.textContent).toBe('Farbschema');
    taste('Escape');
    expect(document.querySelector('.menue')).toBeNull();
    expect(document.activeElement).toBe(mehr);
  });

  it('eine überholte Festlegung bleibt auch nach dem Speichern als überholt gekennzeichnet (kein falsches Grün)', async () => {
    const host = render();
    const id = festlegen(host, 'gelb');
    const fl = useBaurecht.getState().pruefung.festlegungen[id];
    // eine beteiligte Angabe hat sich seit dem Festlegen geändert (damals „Beseitigung“): die Festlegung ist überholt
    act(() => useBaurecht.setState({ pruefung: { ...useBaurecht.getState().pruefung, festlegungen: { [id]: { ...fl, fakten: { ...fl.fakten, 'merkmal:Vorhaben': 'Beseitigung' } } } } }));
    await speichernOhneDialog();
    expect(inDatei().festlegungen[id]).toMatchObject({ ampel: 'gelb' });
    await vi.waitFor(() => expect(host.querySelector('.br-detail-festlegung')?.textContent).toMatch(/Festlegung „prüfen“ überholt/), LANGSAME_RUNNER);
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
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('bestätigen'))!;
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

  it('Plausibilität: Einfamilienhaus (Errichtung) auf „verfahrensfrei“ gestellt → Warnung über den Angaben und im Protokoll', async () => {
    const host = render();
    // angezeigt mit geschützten Leerzeichen nach „§“ und „Abs.“ (nb)
    const satz = /Verfahren „verfahrensfrei“ festgelegt, ein neues Wohngebäude \(Einfamilienhaus\) ist aber nicht verfahrensfrei \(§\u00a062 Abs\.\u00a01 BauO NRW\) – mindestens vereinfachtes Baugenehmigungsverfahren \(§\u00a064\)/;
    expect(host.querySelector('.br-angaben-liste')!.textContent).not.toMatch(satz);
    const regionen = () => [...host.querySelectorAll('.br-angaben > .karte-rumpf > .br-widerspruch-ansage')].map((r) => r.textContent ?? '').join(' ');
    if (!host.querySelector('[data-merkmal="Verfahren"]')) act(() => knopf(host, /Antragsmerkmale/)!.click());
    act(() => knopf(host.querySelector('[data-merkmal="Verfahren"]')!, 'verfahrensfrei')!.click());
    const warnung = [...host.querySelectorAll('.br-angaben-liste .meldung.warnung')].find((w) => satz.test(w.textContent ?? ''));
    expect(warnung, 'Warnung über den Angaben').toBeTruthy();
    // stehende Live-Region: sagt den neuen Satz an (die Meldung selbst hat keine eigene Rolle)
    expect(warnung!.getAttribute('role')).toBeNull();
    await vi.waitFor(
      async () => {
        await act(async () => void (await new Promise((r) => echtesSetTimeout(r, 50))));
        expect([...host.querySelectorAll('.br-angaben > .karte-rumpf > .br-widerspruch-ansage')].some((r) => satz.test(r.textContent ?? ''))).toBe(true);
      },
      LANGSAME_RUNNER,
    );
    // „Zum Merkmal“ führt auf den gewählten Wert des Merkmals „Verfahren“
    const zum = [...warnung!.querySelectorAll('button')].find((b) => b.textContent === 'Zum Merkmal')!;
    expect(zum.getAttribute('aria-label')).toBe('Zum Merkmal „Verfahren“');
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    act(() => zum.click());
    await vi.waitFor(
      async () => {
        await act(async () => void (await new Promise((r) => echtesSetTimeout(r, 20))));
        expect(document.activeElement?.closest('[data-merkmal="Verfahren"]'), 'Fokus am Merkmal').toBeTruthy();
      },
      LANGSAME_RUNNER,
    );
    expect(document.activeElement?.textContent).toBe('verfahrensfrei');
    act(() => knopf(host, /Prüfprotokoll/)!.click());
    expect(document.querySelector('.br-protokoll')!.textContent).toMatch(satz);
    act(() => knopf(document.querySelector('.br-protokoll')!, 'Schließen')!.click());
    // zurück auf ein Verfahren mit Prüfung (Rückweg): die Warnung verschwindet, auch aus der Live-Region
    act(() => knopf(host.querySelector('[data-merkmal="Verfahren"]')!, 'vereinfachtes Verfahren')!.click());
    expect(host.querySelector('.br-angaben-liste')!.textContent).not.toMatch(satz);
    expect(regionen()).not.toMatch(satz);
  });

  it('Zwei Widersprüche zum selben Merkmal: „Zum Merkmal“ nur einmal (am ersten Satz)', () => {
    const host = render();
    const geo = { herkunft: 'geodienst' as const, sicherheit: 'sicher' as const, quelle: 'Test' };
    act(() =>
      useBaurecht.setState((st) => ({
        merkmale: { ...st.merkmale, Planungsrecht: 'Innenbereich' },
        pruefung: { ...st.pruefung, fakten: { ...st.pruefung.fakten, 'planung.bplan_nr': { ...geo, wert: '12' }, 'schutz.lsg': { ...geo, wert: true } } },
      })),
    );
    const warnungen = [...host.querySelectorAll('.br-angaben-liste .meldung.warnung')].filter((w) => /^Planungsrecht „Innenbereich“ festgelegt/.test(w.textContent ?? ''));
    expect(warnungen).toHaveLength(2);
    const knoepfe = warnungen.flatMap((w) => [...w.querySelectorAll('button')].filter((b) => b.textContent === 'Zum Merkmal'));
    expect(knoepfe).toHaveLength(1);
    expect(warnungen[0].contains(knoepfe[0])).toBe(true);
  });

  it('Live-Region der Widersprüche: beim ersten Zeichnen mit schon vorhandener Warnung keine Ansage', async () => {
    act(() => useBaurecht.getState().merkmalSetzen('Verfahren', 'verfahrensfrei'));
    const host = render();
    const satz = /Verfahren „verfahrensfrei“ festgelegt/;
    expect([...host.querySelectorAll('.br-angaben-liste .meldung.warnung')].some((w) => satz.test(w.textContent ?? '')), 'Warnung steht').toBe(true);
    await act(async () => void (await new Promise((r) => echtesSetTimeout(r, 400))));
    expect([...host.querySelectorAll('.br-angaben > .karte-rumpf > .br-widerspruch-ansage')].map((r) => r.textContent ?? '').join(' ')).not.toMatch(satz);
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
    // am Merkmal: Entwurf (zählt schon, noch nicht gespeichert), zurücknehmbar
    const merkmal = host.querySelector<HTMLElement>('[data-merkmal="Planungsrecht"]')!;
    expect(merkmal.querySelector('.br-merkmal-marken')?.textContent).toMatch(/für diesen Ort bestätigt · Entwurf/);
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
    expect(host.querySelector<HTMLInputElement>('.br-angaben .karte-kopf input[type="checkbox"]')!.checked).toBe(true);
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

  it('zwei Bestätigungen, die dieselben Vorschriften entscheiden: das Protokoll zählt sie einmal; Speichern ohne Rückfrage', async () => {
    const { auswertungMit, herabstufungen, anUngespeichertem } = await import('./pruefung');
    const { offeneBestaetigungen, PLANUNGSRECHT } = await import('./store');
    const s = useBaurecht.getState();
    const vorher = auswertungMit(s.pruefung.fakten);
    const ags = vorher.fakten['lage.ags'];
    expect(ags?.sicherheit).toBe('hinweis');
    act(() => {
      s.faktBestaetigen('lage.ags', ags, 'TP');
      useBaurecht.getState().planungsrechtBestaetigen();
    });
    const ids = offeneBestaetigungen(useBaurecht.getState());
    expect(ids).toEqual(expect.arrayContaining(['lage.ags', PLANUNGSRECHT]));
    const jetzt = auswertungMit(useBaurecht.getState().pruefung.fakten, { planungsrechtOrt: useBaurecht.getState().pruefung.planungsrechtOrt });
    // das Protokoll zählt die Paragrafen gegenüber dem Stand ohne diese Bestätigungen – jeden einmal
    const n = anUngespeichertem(ids, jetzt);
    expect(n).toBeGreaterThan(0);
    expect(n).toBe(herabstufungen(auswertungMit(s.pruefung.fakten, { planungsrechtOrt: s.pruefung.planungsrechtOrt }), jetzt).length);
    const host = render();
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    expect(document.querySelector('.br-protokoll')!.textContent).toContain(`${n} Paragrafen hängen an noch nicht gespeicherten Bestätigungen`);
    act(() => knopf(document.querySelector('.br-protokoll')!, 'Schließen')!.click());
    await speichernOhneDialog();
    expect(inDatei().fakten['lage.ags'].bestaetigt).toMatchObject({ von: 'TP' });
    expect(inDatei().planungsrechtOrt?.von).toBeTruthy();
    expect(offeneBestaetigungen(useBaurecht.getState())).toEqual([]);
  });

  it('Sammelaktion „ohne Ortsangabe“: die Meldung gilt nur für den Filterstand, den sie gesetzt hat', async () => {
    const host = render();
    const id = festlegen(host, 'rot');
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

  it('Begründung aus einer älteren Datei: in Einzelheiten, Liste, Dialog und Protokoll weiter zu lesen', async () => {
    const host = render();
    const id = festlegen(host, 'rot');
    const fl = useBaurecht.getState().pruefung.festlegungen[id];
    // wie aus einer Datei, als die Begründung noch Pflicht war
    act(() => useBaurecht.setState({ pruefung: { ...useBaurecht.getState().pruefung, festlegungen: { [id]: { ...fl, grund: 'Begehung am 03.11.2026 ohne Befund', bestaetigt: '2026-11-03T10:00:00Z' } } } }));
    await speichernOhneDialog();
    expect(inDatei().festlegungen[id].grund).toBe('Begehung am 03.11.2026 ohne Befund');
    expect(host.querySelector('.br-festlegung-text')?.textContent).toMatch(/Von Hand „gilt“ \(.+\): Begehung am 03\.11\.2026 ohne Befund/);
    expect(host.querySelector(`[data-roving="p:${CSS.escape(id)}"]`)?.textContent).toMatch(/Von Hand: Begehung am 03\.11\.2026/);
    // „Festlegung ändern …“ nennt sie, bevor eine neue Festlegung sie ersetzt
    act(() => knopf(host, 'Festlegung ändern …')!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('von Hand festlegen'))!;
    expect(dialog.textContent).toMatch(/Bisherige Begründung \(.+\): Begehung am 03\.11\.2026 ohne Befund – eine neue Festlegung ersetzt sie/);
    act(() => knopf(dialog, 'Abbrechen')!.click());
    // im Protokoll: Spalte „Begründung“, weil es eine gibt
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    const tabelle = [...d.querySelectorAll('h2')].find((h) => h.textContent?.startsWith('Festlegungen von Hand'))!.nextElementSibling!;
    expect(tabelle.querySelector('thead')!.textContent).toMatch(/Begründung/);
    expect(tabelle.querySelector('tbody')!.textContent).toMatch(/Begehung am 03\.11\.2026 ohne Befund/);
    act(() => knopf(d, 'Schließen')!.click());
  });

  it('Angaben-Suche: Ansage entprellt in der stehenden Region, auch „Keine Angabe“', async () => {
    const host = render();
    const suchfeld = host.querySelector<HTMLInputElement>('input[aria-label="Angaben durchsuchen"]')!;
    tippen(suchfeld, 'zzzz');
    const region = () => [...host.querySelectorAll('.br-angaben > .karte-rumpf > [role="status"]')].map((e) => e.textContent).join('|');
    expect(region()).not.toMatch(/zzzz/);
    await warten(400);
    expect(region()).toMatch(/Keine Angabe zu „zzzz“/);
  });

  it('Rückmeldung nach dem Speichern: „keine Änderungen“ bzw. „Gespeichert“ – auch mit einer neuen Festlegung', async () => {
    const host = render();
    const text = () => host.querySelector('.br-gespeichert')?.textContent;
    await speichernOhneDialog();
    expect(text()).toBe('Gespeichert – keine Änderungen');
    act(() => useBaurecht.getState().merkmalSetzen('Gebäudeart', 'Doppelhaushälfte'));
    await speichernOhneDialog();
    expect(text()).toBe('Gespeichert');
    festlegen(host, 'rot');
    await speichernOhneDialog();
    expect(text()).toBe('Gespeichert');
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

  it('Vorschriften-Suche: Ansage entprellt, die sichtbare Zeile sofort', () => {
    const host = render();
    const feld = host.querySelector<HTMLInputElement>('.br-vorschriften input[type="search"], main input[type="search"]')!;
    const live = () => host.querySelector('.br-treffer [aria-live]')!.textContent ?? '';
    // falsche Uhren erst nach dem Zeichnen: die Frist der Ansage (450 ms in Vorschriften.tsx) läuft dann nur, wenn der Test
    // sie vorstellt – unter Last (echte Zeit) lief sie früher manchmal ab, bevor „noch still“ geprüft war
    vi.useFakeTimers();
    try {
      tippen(feld, 'Stellplatz');
      const sichtbar = host.querySelector('.br-treffer > span')!.textContent ?? '';
      expect(sichtbar).toMatch(/von \d+ Paragrafen/);
      expect(live()).toBe('');
      act(() => void vi.advanceTimersByTime(440));
      expect(live()).toBe('');
      // weiteres Tippen innerhalb der Frist startet sie neu (entprellt, nicht nur verzögert)
      tippen(feld, 'Stellplatz ');
      act(() => void vi.advanceTimersByTime(440));
      expect(live()).toBe('');
      act(() => void vi.advanceTimersByTime(20));
      expect(live()).toBe(host.querySelector('.br-treffer > span')!.textContent);
      expect(live()).toMatch(/von \d+ Paragrafen/);
    } finally {
      vi.useRealTimers();
    }
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
    const tabelle = [...d.querySelectorAll('h2')].find((h) => h.textContent?.startsWith('Angaben von Hand ohne eigene Bestätigung'))!.nextElementSibling!;
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
    const tabelle = [...d.querySelectorAll('h2')].find((h) => h.textContent?.startsWith('Angaben von Hand ohne eigene Bestätigung'))!.nextElementSibling!.textContent ?? '';
    const ohneWirkung = /Antworten auf derzeit nicht gestellte Fragen \(ohne Wirkung\):[^\n]*Lage in der zusammenhängenden Bebauung/.test(d.textContent ?? '');
    // die Antwort steht im Protokoll – je nachdem in der Tabelle oder unter „ohne Wirkung“, nie gar nicht
    expect(/Lage in der zusammenhängenden Bebauung/.test(tabelle) || ohneWirkung).toBe(true);
    expect(ohneWirkung).toBe(!gestellt);
  });

  it('Protokoll: „Jetzt speichern“ neben „Erst speichern …“, Rückmeldung in der Live-Region; Festlegung wird angesagt', async () => {
    const host = render();
    festlegen(host, 'rot');
    expect(useBaurecht.getState().ansage).toMatch(/von Hand „gilt“ festgelegt$/);
    await speichernOhneDialog();
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
    festlegen(host, 'gruen');
    expect(useBaurecht.getState().ansage).toMatch(/festgelegt – noch nicht wirksam \(Text der Norm nicht verfügbar\), es bleibt bei/);
    act(() => knopf(host.querySelector('.br-detail')!, /Festlegung aufheben/)!.click());
    expect(useBaurecht.getState().ansage).toMatch(/^Festlegung aufgehoben – automatisch: „/);
  });

  it('Protokoll: „Jetzt speichern“ speichert ohne Rückfrage; ein späteres Strg+S verschiebt den Fokus nicht', async () => {
    const host = render();
    festlegen(host, 'rot');
    act(() => knopf(host, 'Prüfprotokoll …')!.click());
    const d = document.querySelector<HTMLElement>('.br-protokoll')!;
    const jetzt = () => knopf(d, 'Jetzt speichern');
    await act(async () => {
      jetzt()!.click();
      await warten(50);
    });
    // kein Dialog über dem Protokoll; die Festlegung ist gespeichert
    expect([...document.querySelectorAll('[role="dialog"]')].filter((x) => !x.closest('.report-backdrop'))).toHaveLength(0);
    expect(inDatei().festlegungen[useBaurecht.getState().auswahl!].bestaetigt).toMatch(/^\d{4}-/);
    // der Fokus woanders im Protokoll – ein Speichern von anderswo (Strg+S) lässt ihn dort
    act(() => useBaurecht.getState().merkmalSetzen('Gebäudeart', 'Doppelhaushälfte'));
    const haken = d.querySelector<HTMLInputElement>('.br-protokoll-aktionen input[type="checkbox"]')!;
    act(() => haken.focus());
    await speichernOhneDialog();
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
    act(() => knopf(dialog, 'Festlegen')!.click());
    expect(useBaurecht.getState().ansage).toMatch(/von Hand „entfällt“ festgelegt$/);
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
    festlegen(host, 'gruen', id);
    expect(useBaurecht.getState().ansage).toMatch(/festgelegt – noch nicht wirksam \(Rechtsstand nicht aktuell an der Quelle bestätigt\), es bleibt bei/);
  });

  it('„Rückgängig“ nach Aufheben: angesagt, mit dem Stand nach dem Wiederherstellen (Entwurf, wenn nicht gespeichert)', () => {
    const host = render();
    const id = festlegen(host, 'rot');
    // mit Vermerk, aber nicht gespeichert (weicht vom Stand der Datei ab): beim Wiederherstellen wieder Entwurf
    act(() => {
      const p = structuredClone(useBaurecht.getState().pruefung);
      p.festlegungen[id].bestaetigt = '2026-11-12T10:00:00Z';
      useBaurecht.setState({ pruefung: p });
    });
    act(() => knopf(host.querySelector('.br-detail')!, /Festlegung aufheben/)!.click());
    act(() => knopf(host.querySelector('.br-detail')!, 'Rückgängig')!.click());
    expect(useBaurecht.getState().pruefung.festlegungen[id]?.bestaetigt).toBeUndefined();
    expect(useBaurecht.getState().ansage).toBe('Festlegung wiederhergestellt – „gilt“ (Entwurf, noch nicht gespeichert)');
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
    // gemeinsamer Einstieg aus core: Name als Kartenüberschrift, darunter wofür die App da ist
    const start = host.querySelector<HTMLElement>('.pw-einstieg')!;
    expect(start.querySelector('h2')?.textContent).toBe('LEXIO');
    expect(start.querySelector('.pw-einstieg-was')?.textContent).toBe('Baurecht');
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
    act(() => knopf(dialog, 'Festlegen')!.click());
    expect(useBaurecht.getState().ansage).toMatch(/von Hand „entfällt“ festgelegt$/);
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

  it('„Von Hand festlegen“: Titel im Kopf (benennt den Dialog), Enter sendet über das Formular – auch mit leerem Namen', () => {
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
    // „Festgelegt von“ ist kein Pflichtfeld: leer gilt der gemerkte Name bzw. der aus den Stammdaten
    tippen(dialog.querySelector<HTMLInputElement>('#br-festlegen-von')!, '');
    absenden();
    expect(dialog.isConnected).toBe(false);
    const f = useBaurecht.getState().pruefung.festlegungen[useBaurecht.getState().auswahl!];
    expect(f.von.trim()).not.toBe('');
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

  it('„Angabe bestätigen“: Titel im Kopf, Absenden übernimmt sofort (kein Pflichtfeld)', () => {
    const host = render();
    act(() => knopf(host, 'alle')?.click());
    act(() => knopf(host, 'Bestätigen …')!.click());
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes('bestätigen'))!;
    const kopf = dialog.querySelector<HTMLElement>('.modal-kopf')!;
    expect(kopf.textContent).toMatch(/bestätigen$/);
    expect(dialog.getAttribute('aria-labelledby')).toBe(kopf.id);
    expect(knopf(dialog, 'Bestätigen')!.type).toBe('submit');
    expect(dialog.querySelector('textarea, [aria-required="true"], [required]')).toBeNull();
    act(() => void dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
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

  it('Umfang nur Hinweis, „Altbau verfahrensfrei“ beantwortet: die Antwort gilt als beantwortet, „Bestätigen …“ steht am Umfang', async () => {
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
    // angezeigt nicht als gesichert: Marke „über „Umfang der Beseitigung“ (nur Hinweis)“, sie führt zu „Bestätigen …“ am Umfang
    const marke = [...host.querySelectorAll<HTMLButtonElement>('.br-angaben .br-ausloeser-marke')].find((b) => /Umfang der Beseitigung/.test(b.getAttribute('aria-label') ?? ''));
    expect(marke, 'Marke an der Antwort').toBeTruthy();
    // sichtbar kurz wie an den Angaben selbst, Auslöser und Sprungziel im Namen (der sichtbare Text steht wörtlich darin)
    expect(marke!.textContent).toBe('nur Hinweis');
    expect(marke!.getAttribute('aria-label')).toBe('Altbau niedrig, freistehend oder klein: nur Hinweis über „Umfang der Beseitigung“ – zu „Umfang der Beseitigung“ bestätigen');
    // erst, wenn die Oberfläche nach der Antwort zur Ruhe gekommen ist (die nächste offene Rückfrage bekommt den Fokus)
    await act(async () => void (await new Promise((r) => echtesSetTimeout(r, 300))));
    act(() => marke!.focus());
    act(() => marke!.click());
    await vi.waitFor(
      async () => {
        await act(async () => void (await new Promise((r) => echtesSetTimeout(r, 20))));
        expect(document.activeElement?.closest('[data-fakt="vorhaben.beseitigung_umfang"]'), 'Fokus am Umfang').toBeTruthy();
      },
      LANGSAME_RUNNER,
    );
    expect(document.activeElement?.hasAttribute('data-bestaetigen')).toBe(true);
    // ist der Umfang bestätigt, verschwindet die Marke
    act(() => useBaurecht.getState().faktBestaetigen('vorhaben.beseitigung_umfang', useBaurecht.getState().pruefung.fakten['vorhaben.beseitigung_umfang'], 'TP'));
    expect(host.querySelector('.br-angaben .br-ausloeser-marke')).toBeNull();
  });
});
