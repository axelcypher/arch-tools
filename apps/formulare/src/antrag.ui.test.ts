// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { VORGABE_EXPORT, einstellungenAus, jjmmtt, tagVon } from './antrag';
import { VORGABE_MERKMALE } from './bedingung';
import { aktiveFassung, exportVorschlag, istArchiv, useAntrag, wechselLaeuft, type SchreibInfo } from './antragStore';
import { SpeicherDateisystem } from './dateisystem';
import { cp1252Schreiben } from './forma/cp1252';
import { felderDerSeite } from './forma/felder';
import { parseFormular } from './forma/formular';
import { formularPdf } from './forma/pdf';
import { pdfjs } from './dokumente/pdf';
import { useAufgeklappt } from './components/ProjektUebersicht';
import { entwurfVon, formularLokalVerschieben, formularOrdner, hatEntwurf, useFormulare } from './store';
import { verknuepfen as dateiVerknuepfen } from './dateiAktionen';
import { formularePunkte } from './components/Antrag';
import { dateiMenue } from './components/AblageBaum';
import { VORGABE_NAMENSSCHEMA } from '@core/namensschema';
import { readProjectFile, writeArchive } from '@core/archive';
import { createProject, leereMeta } from '@core/model';
import { zeitKurz } from './zeit';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MUSTER = new Uint8Array(readFileSync(path.resolve(__dirname, '__fixtures__/muster.frmsjf')));
const PROJEKT = 'Z:/Projekte/BS9 Musterstraße 9';
/** die Projektdatei im Projektordner – dort steht der Abschnitt „formulare“ */
const OAP = `${PROJEKT}/Planung/Berechnungen/BS9.oap`;
const neueOap = () => {
  const p = createProject('Musterstraße 9');
  p.meta = { ...leereMeta(), projektcode: 'BS9' };
  return writeArchive(p);
};
/** Abschnitt „formulare“ der Projektdatei */
const abschnitt = () => readProjectFile(ds.dateien.get(OAP)!).formulare as Record<string, unknown> | undefined;
/** Ein Antrag im Abschnitt „formulare“ (ohne Namen: der aktive) */
const antragIn = (name?: string) => {
  const a = abschnitt() as { antraege?: Record<string, Record<string, unknown>> } | undefined;
  return a?.antraege?.[name ?? useAntrag.getState().projektdatei!.ansicht!];
};
const KATALOG = [
  { id: 'muster', titel: 'Musterformular', art: 'intern' as const, formular: 'Muster', vorgewaehlt: true },
  { id: 'bauantrag', titel: 'Bauantrag', art: 'intern' as const, formular: 'Bauantrag', vorgewaehlt: true },
  { id: 'lageplan', titel: 'Lageplan', art: 'extern' as const, quelle: 'Planung', muster: '*Lageplan*', vorgewaehlt: true },
];

/** Bauantrag: Muster, Bauantrag, Lageplan; Voranfrage: nur der Lageplan */
const VORLAGEN = [
  { id: 'baua', name: 'Bauantrag', art: 'BAUA', dokumente: ['muster', 'bauantrag', 'lageplan'] },
  { id: 'bauva', name: 'Bauvoranfrage', art: 'BAUVA', dokumente: ['lageplan'] },
];

let ds: SpeicherDateisystem;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  localStorage.clear();
  ds = new SpeicherDateisystem({ benutzer: 't.test', computer: 'HELEN', prozess: 4242 });
  ds.dateien.set('C:/FORMA/BS9/001-Muster.frmsjf', MUSTER);
  ds.dateien.set('C:/FORMA/BS9/sj_office.ini', cp1252Schreiben('[Allgemeines]\r\nText=Musterstraße 9\r\n\r\n'));
  // ein anderes Projekt hat das Formular „Bauantrag“ (Vorlage für das Anlegen)
  ds.dateien.set('C:/FORMA/H24/003-Bauantrag (2026).frmsjf', MUSTER);
  ds.dateien.set('C:/FORMA/H24/sj_office.ini', cp1252Schreiben('[Allgemeines]\r\nText=Hofstraße\r\n\r\n'));
  ds.dateien.set(`${PROJEKT}/TÖB/BAUA/BS9 GP 260101 Bauantrag.pdf`, new Uint8Array([1]));
  ds.ordner.add(`${PROJEKT}/TÖB/BAUA 2`);
  ds.dateien.set(`${PROJEKT}/Planung/BS9 Lageplan.pdf`, new Uint8Array([1]));
  ds.dateien.set(`${PROJEKT}/Planung/Notiz.txt`, new Uint8Array([1]));
  ds.dateien.set(OAP, neueOap());
  useFormulare.setState({
    ds,
    projektordner: ['C:/FORMA'],
    ablageordner: ['Z:/Projekte'],
    projekte: [],
    projekt: null,
    formulare: [],
    sammel: null,
    offen: null,
    karte: null,
    haupt: 'formular',
    ablage: [],
    vorgabeAuswahl: ['*'],
    auswahl: {},
    verlaufOffen: false,
    gliederungOffen: true,
    profile: {},
    projektdaten: null,
    datei: null,
    dateiEntwuerfe: {},
    meldung: null,
    ansicht: 'seite',
    zuletzt: [],
    ordnerWahl: {},
    oapVorlage: 'Planung/Berechnungen/{nummer}.oap',
    stammdatenDialog: null,
    ordnerDialog: null,
    // keine offenen Einstellungen aus einem früheren Test (sonst läge ein weiterer Dialog über der App)
    einstellungenOffen: false,
  });
  useAntrag.setState({ einstellungen: { ...VORGABE_EXPORT }, katalog: KATALOG, vorlagen: VORLAGEN, merkmalDefinitionen: VORGABE_MERKMALE, ueberschreibungen: {}, projektdatei: null, fassungen: [], dateien: [], quellen: {}, formularInfo: {}, dokumente: [], dokumenteFuer: null, projektStatus: {} });
  useAufgeklappt.setState({ offen: [] });
});
afterEach(() => {
  // ein offenes Menü (gemeinsamer Store in core) schließen – sonst stünde es im nächsten Test wieder da
  act(() => void window.dispatchEvent(new Event('blur')));
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

/** Dialog nach seinem zugänglichen Namen (aria-label bzw. sichtbarer Kopf über aria-labelledby) */
const dialogMit = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => (d.getAttribute('aria-label') ?? document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent) === name) ?? null;
const warte = async () => {
  for (let i = 0; i < 4; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const knopfGenau = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
/** Navigation: rechte Hälfte des Knopfs „Projektdaten | Antragsdaten“ */
const antragsdaten = (host: Element) => host.querySelectorAll<HTMLButtonElement>('.fo-daten .fo-eintrag-karte')[1];
const klick = async (el: HTMLElement) => {
  act(() => el.click());
  await warte();
};
const menuePunkt = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.menue-punkt')].find((b) => b.textContent?.includes(text))!;
/** gesperrter Menüpunkt (gemeinsames Menü: aria-disabled, bleibt per Tastatur erreichbar) */
const gesperrt = (b: Element) => b.getAttribute('aria-disabled') === 'true';
const rechtsklick = async (el: Element) => {
  act(() => void el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
  await warte();
};
const eingabe = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
/** Feld verlassen (übernimmt die Eingabe in Feldern, die erst dann speichern) */
const verlassen = (el: HTMLElement) => act(() => void el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
/** echte Zeit vergehen lassen (z. B. für verzögerte Hinweise) */
const zeitVergeht = (ms: number) => act(async () => new Promise<void>((r) => setTimeout(r, ms)));

async function render(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(createElement(App));
  });
  await warte();
  return host;
}

async function projektBS9(): Promise<HTMLElement> {
  const host = await render();
  await projektOeffnen(host, 'BS9');
  await warte();
  return host;
}

/** Projekt in der Projektübersicht öffnen – eingeklappte Quellen vorher aufklappen */
async function projektOeffnen(host: HTMLElement, kuerzel: string) {
  const karte = () => host.querySelector<HTMLButtonElement>(`.pa-karte[data-projekt="${kuerzel}"]`);
  if (!karte()) for (const g of host.querySelectorAll<HTMLButtonElement>('.pa-gruppe-kopf[aria-expanded="false"]')) await klick(g);
  await klick(karte()!);
}

describe('Antragsfassung und Export', () => {
  it('die neueste BAUA ist aktiv; der Export legt die PDF dort ab – Name nach der Vorlage', async () => {
    const host = await projektBS9();
    expect(host.querySelector('.an-fassung')?.textContent).toContain('BAUA 2');
    await klick(knopf(host, '001-Muster'));
    await klick(knopf(host, 'PDF'));
    // Tastenkürzel rechts, vorgelesen als aria-keyshortcuts – nicht Teil des Namens
    expect(menuePunkt('Als PDF exportieren').getAttribute('aria-keyshortcuts')).toBe('Control+E');
    expect(menuePunkt('Als PDF exportieren').querySelector('.menue-tasten')!.textContent).toBe('Strg+E');
    await klick(menuePunkt('Als PDF exportieren'));
    const dialog = dialogMit('Als PDF exportieren')!;
    const name = `BS9 BAUA ${jjmmtt(new Date())} Muster.pdf`;
    expect(dialog.querySelector<HTMLInputElement>('input[aria-label="Dateiname"]')!.value).toBe(name);
    expect(dialog.textContent).toContain('TÖB/BAUA 2');
    await klick(knopf(dialog, 'Exportieren'));
    const pdf = ds.dateien.get(`${PROJEKT}/TÖB/BAUA 2/${name}`)!;
    expect(new TextDecoder().decode(pdf.subarray(0, 8))).toBe('%PDF-1.4');
    expect(dialogMit('Als PDF exportieren')).toBeNull();

    // gibt es die Datei schon, muss Ersetzen bestätigt werden
    await klick(knopf(host, 'PDF'));
    await klick(menuePunkt('Als PDF exportieren'));
    const zweiter = dialogMit('Als PDF exportieren')!;
    expect(zweiter.textContent).toContain('gibt es dort schon');
    expect(knopf(zweiter, 'Exportieren').disabled).toBe(true);
  });

  it('Ordner im Projektordner-Baum: Reihenfolge per Ziehen und Alt+↑/↓ – gemerkt je Ebene, ein Klick bleibt ein Klick', async () => {
    ds.ordner.add(`${PROJEKT}/Fachplanung`);
    const host = await projektBS9();
    await klick(knopfGenau(host, 'Ordner'));
    const oben = () => [...host.querySelectorAll('.fo-baum[role="tree"] > li[data-ordner]')].map((li) => li.getAttribute('data-ordner'));
    const zeile = (name: string) => host.querySelector<HTMLButtonElement>(`.fo-baum[role="tree"] > li[data-ordner="${name}"] .fo-baum-zeile`)!;
    expect(oben()).toEqual(['Fachplanung', 'Planung', 'TÖB']);
    // Tastatur
    act(() => void zeile('TÖB').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true })));
    await warte();
    expect(oben()).toEqual(['Fachplanung', 'TÖB', 'Planung']);
    expect(useFormulare.getState().ordnerReihenfolge['']).toEqual(['fachplanung', 'töb', 'planung']);
    // Ziehen: „Fachplanung“ nach unten ans Ende
    act(() => void zeile('Fachplanung').dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0, bubbles: true })));
    act(() => void window.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 40 })));
    expect(host.querySelector('li[data-ordner="Fachplanung"]')!.getAttribute('data-ziehen')).toBe('quelle');
    act(() => void window.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: 40 })));
    await warte();
    expect(oben()).toEqual(['TÖB', 'Planung', 'Fachplanung']);
    expect(JSON.parse(localStorage.getItem('formulare:einstellungen')!).ordnerReihenfolge['']).toEqual(['töb', 'planung', 'fachplanung']);
    // ein Klick ohne Bewegung klappt weiter auf
    act(() => void zeile('TÖB').dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0, bubbles: true })));
    act(() => void window.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: 0 })));
    await klick(zeile('TÖB'));
    expect(host.querySelector('li[data-ordner="TÖB"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('die Seitenleiste zeigt neue Dateien: nach dem Export sofort, von außen beim Zurückkommen ins Fenster', async () => {
    const host = await projektBS9();
    const baum = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('.fo-baum-zeile')].find((b) => b.querySelector('.fo-baum-name')?.textContent === name);
    // der Ordner der aktiven Fassung ist im Projektordner-Baum aufgeklappt
    await klick(baum('TÖB')!);
    await klick(baum('BAUA 2')!);
    await klick(knopf(host, '001-Muster'));
    await klick(knopf(host, 'PDF'));
    await klick(menuePunkt('Als PDF exportieren'));
    await klick(knopf(dialogMit('Als PDF exportieren')!, 'Exportieren'));
    await warte();
    expect(baum(`BS9 BAUA ${jjmmtt(new Date())} Muster.pdf`)).toBeDefined();

    // von außen: ein Dokument im Projektordner und ein neues Formular in FORMA
    await klick(baum('Planung')!);
    expect(baum('Neu.pdf')).toBeUndefined();
    ds.dateien.set(`${PROJEKT}/Planung/Neu.pdf`, new Uint8Array([1]));
    ds.dateien.set('C:/FORMA/BS9/004-Neues Formular.frmsjf', MUSTER);
    act(() => void window.dispatchEvent(new Event('focus')));
    await warte();
    await warte();
    expect(baum('Neu.pdf')).toBeDefined();
    expect(knopf(host, '004-Neues Formular')).toBeDefined();
  });

  it('anderer Ordner im Projekt', async () => {
    const host = await projektBS9();
    await klick(knopf(host, '001-Muster'));
    await klick(knopf(host, 'PDF'));
    await klick(menuePunkt('Als PDF exportieren'));
    const dialog = dialogMit('Als PDF exportieren')!;
    act(() => dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click());
    await warte();
    await klick(knopf(dialog, 'Planung'));
    await klick(knopf(dialog, 'Exportieren'));
    expect([...ds.dateien.keys()].some((k) => k.startsWith(`${PROJEKT}/Planung/BS9 BAUA`) && k.endsWith('Muster.pdf'))).toBe(true);
  });

  it('neue Antragsfassung anlegen: Ordner entsteht, sie wird aktiv und in der Projektdatei vermerkt', async () => {
    const host = await projektBS9();
    await klick(host.querySelector<HTMLButtonElement>('.an-fassung-knopf')!);
    await klick(menuePunkt('Neue Fassung „BAUA 3“'));
    expect(ds.ordner.has(`${PROJEKT}/TÖB/BAUA 3`)).toBe(true);
    expect(abschnitt()).toMatchObject({ aktiveFassung: 'BAUA 3' });
    // ein eigener Antrag – angelegt heute, ohne Werte aus den anderen Anträgen
    expect(antragIn('BAUA 3')).toEqual({ angelegt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.antrag).toMatchObject({ name: 'BAUA 3' });
    expect(ds.dateien.has('C:/FORMA/BS9/formulare.json')).toBe(false);
    expect(host.querySelector('.an-fassung')?.textContent).toContain('BAUA 3');
  });

  it('alte Abweichungen je Projekt nur mit „Phase“ entfallen beim Lesen – auch im Speicher', async () => {
    localStorage.setItem('formulare:export-projekte', JSON.stringify({ BS9: { phase: 'EP' }, HVO: { phase: 'EP', zielpfad: 'TÖB/Formulare' } }));
    act(() => useAntrag.getState().einstellungenNeuLesen());
    await warte();
    expect(useAntrag.getState().ueberschreibungen).toEqual({ HVO: { zielpfad: 'TÖB/Formulare' } });
    expect(JSON.parse(localStorage.getItem('formulare:export-projekte')!)).toEqual({ HVO: { zielpfad: 'TÖB/Formulare' } });
  });
});

describe('Antragsumfang und Vollständigkeit', () => {
  it('festlegen, Farbpunkte an den Formularen, fehlendes Formular per Klick anlegen', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await warte();
    await klick(knopf(host, 'Antragsumfang festlegen'));
    const datei = antragIn() as { umfang: { id: string }[] };
    expect(datei.umfang.map((u: { id: string }) => u.id)).toEqual(['muster', 'bauantrag', 'lageplan']);

    // Muster: 3 von 5 Angaben – rot; Bauantrag fehlt – grau; Lageplan: Quelle da, nicht im Antragsordner – gelb
    const zeilen = () => [...host.querySelectorAll('.pu-zeile')].map((z) => [z.querySelector('strong')!.textContent, z.className.split(' ')[1]]);
    expect(zeilen()).toEqual([
      ['Musterformular', 'unvollstaendig'],
      ['Bauantrag', 'fehlt'],
      ['Lageplan', 'offen'],
    ]);
    const punkt = host.querySelector('.nav-eintrag:not(.fehlt) .nav-symbol .st-punkt')!;
    expect(punkt.className).toContain('unvollstaendig');
    const fehlt = host.querySelector<HTMLButtonElement>('.nav-eintrag.fehlt')!;
    expect(fehlt.textContent).toContain('Bauantrag');

    // Klick legt das Formular aus der Vorlage im anderen Projekt an – mit geleerten Eingaben – und öffnet es
    await klick(fehlt);
    await warte();
    const neu = ds.dateien.get('C:/FORMA/BS9/002-Bauantrag (2026).frmsjf')!;
    expect(neu).toBeDefined();
    const felder = felderDerSeite(parseFormular(neu).seiten[0], 0);
    expect(felder.every((f) => f.original === '' || f.original === false)).toBe(true);
    expect(useFormulare.getState().offen?.name).toBe('002-Bauantrag (2026)');
    expect(host.querySelector('.nav-eintrag.fehlt')).toBeNull();
    expect(useAntrag.getState().projektdatei?.umfang?.find((u) => u.id === 'bauantrag')?.formularDatei).toBe('002-Bauantrag (2026).frmsjf');
  });

  it('doppelter Eintrag (Baustatistik neben Statistischem Erhebungsbogen): kein stilles Anlegen – zuordnen oder entfernen', async () => {
    ds.dateien.set('C:/FORMA/BS9/003-Baustatistik.frmsjf', MUSTER);
    const host = await projektBS9();
    await act(() =>
      useAntrag.getState().umfangSetzen([
        { id: 'statistik', titel: 'Statistischer Erhebungsbogen', art: 'intern', formular: 'Statisti' },
        { id: 'baustatistik', titel: 'Baustatistik', art: 'intern', formular: 'Erhebung nach HBauStatG' },
      ]),
    );
    await warte();
    const fehlt = () => host.querySelector<HTMLButtonElement>('.nav-eintrag.fehlt');
    expect(fehlt()!.textContent).toContain('Baustatistik');
    expect(fehlt()!.textContent).toContain('doppelt?');
    expect(fehlt()!.title).toContain('ist schon „Statistischer Erhebungsbogen“ zugeordnet');
    // Klick öffnet das Menü statt ein zweites Formular anzulegen
    await klick(fehlt()!);
    expect([...ds.dateien.keys()].filter((k) => /BS9\/\d+-Baustatistik/.test(k))).toEqual(['C:/FORMA/BS9/003-Baustatistik.frmsjf']);
    await klick(menuePunkt('Aus dem Antragsumfang nehmen'));
    await warte();
    expect(useAntrag.getState().projektdatei?.umfang?.map((u) => u.id)).toEqual(['statistik']);
    expect(fehlt()).toBeNull();
  });

  it('doppelter Eintrag im eingereichten Antrag: Klick öffnet kein Menü, nur die Sperrmeldung', async () => {
    ds.dateien.set('C:/FORMA/BS9/003-Baustatistik.frmsjf', MUSTER);
    const host = await projektBS9();
    await act(() =>
      useAntrag.getState().umfangSetzen([
        { id: 'statistik', titel: 'Statistischer Erhebungsbogen', art: 'intern', formular: 'Statisti' },
        { id: 'baustatistik', titel: 'Baustatistik', art: 'intern', formular: 'Erhebung nach HBauStatG' },
      ]),
    );
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-03' }));
    await warte();
    const fehlt = host.querySelector<HTMLButtonElement>('.nav-eintrag.fehlt')!;
    expect(fehlt.className).toContain('gesperrt');
    expect(fehlt.hasAttribute('aria-haspopup')).toBe(false);
    await klick(fehlt);
    await warte();
    expect(document.querySelector('.menue-punkt')).toBeNull();
    expect(useFormulare.getState().meldung?.text).toContain('ist eingereicht (03.11.2026, von Hand gesetzt) und gesperrt');
    // das Kontextmenü bleibt (mit gesperrten Punkten)
    await rechtsklick(fehlt);
    expect(menuePunkt('Antragsumfang zeigen')).toBeDefined();
  });

  it('Formular anlegen: Meldung schon während der Suche; ein zweiter Aufruf legt kein zweites Formular an', async () => {
    const host = await projektBS9();
    await act(() => useAntrag.getState().umfangSetzen([{ id: 'bauantrag', titel: 'Bauantrag', art: 'intern', formular: 'Bauantrag' }]));
    await warte();
    // die Suche hält an, bis wir sie freigeben – so lässt sich prüfen, was währenddessen zu sehen ist
    const liste = ds.liste.bind(ds);
    let frei!: () => void;
    const halt = new Promise<void>((r) => (frei = r));
    ds.liste = async (pfad: string, tiefe: number) => {
      if (pfad.includes('H24')) await halt;
      return liste(pfad, tiefe);
    };
    let erster!: Promise<string | null>;
    let zweiter!: Promise<string | null>;
    act(() => {
      erster = useAntrag.getState().formularAnlegen('bauantrag');
      zweiter = useAntrag.getState().formularAnlegen('bauantrag');
    });
    expect(useFormulare.getState().meldung?.text).toBe('Suche eine Vorlage für „Bauantrag“ …');
    frei();
    const [a, b] = await act(async () => Promise.all([erster, zweiter]));
    expect(a).toBe('BS9/002-Bauantrag (2026).frmsjf');
    expect(b).toBeNull();
    // genau ein neues Formular (die .frmtmp daneben ist die Sperre des geöffneten Formulars)
    expect([...ds.dateien.keys()].filter((k) => /BS9\/\d+-Bauantrag.*\.frmsjf$/.test(k))).toEqual(['C:/FORMA/BS9/002-Bauantrag (2026).frmsjf']);
    expect(host).toBeTruthy();
  });

  it('Formular anlegen: sofort eine Rückmeldung; ohne Vorlage eine Meldung statt Stillstand; Vorhandenes zuordnen', async () => {
    ds.dateien.set('C:/FORMA/BS9/004-Erhebung.frmsjf', MUSTER);
    const host = await projektBS9();
    await act(() => useAntrag.getState().umfangSetzen([{ id: 'stat', titel: 'Statistischer Erhebungsbogen', art: 'intern', formular: 'Statistischer Erhebungsbogen' }]));
    await warte();
    await klick(antragsdaten(host));
    // keine Vorlage (weder Vorlagenordner noch ein Projekt mit diesem Namen): Meldung mit Hinweis
    await klick(knopf(host, 'Formular anlegen'));
    await warte();
    expect(useFormulare.getState().meldung?.text).toContain('Keine Vorlage für „Statistischer Erhebungsbogen“ gefunden');
    // das Formular liegt schon im Projekt, nur anders benannt: zuordnen
    await klick(knopf(host, 'Zuordnen'));
    expect(menuePunkt('004-Erhebung')).toBeDefined();
    await klick(menuePunkt('004-Erhebung'));
    await warte();
    expect(useAntrag.getState().projektdatei?.umfang?.[0].formularDatei).toBe('004-Erhebung.frmsjf');
    expect(useAntrag.getState().dokumente[0].formular?.name).toBe('004-Erhebung');
  });

  it('Lageplan in die Fassung kopieren und verknüpfen (Kontextmenü im Projektordner) – dann aktuell', async () => {
    useAntrag.setState({ katalog: [KATALOG[2]] });
    const host = await projektBS9();
    await useAntrag.getState().umfangSetzen([{ id: 'lageplan', titel: 'Lageplan', art: 'extern', quelle: 'Planung', muster: '*Lageplan*' }]);
    await warte();
    expect(useAntrag.getState().dokumente[0].status).toBe('offen');
    await klick(knopf(host, 'Planung'));
    await rechtsklick(knopf(host, 'BS9 Lageplan.pdf'));
    act(() => menuePunkt('In BAUA 2 kopieren und verknüpfen').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    await warte();
    await klick(menuePunkt('Lageplan'));
    await warte();
    expect(ds.dateien.has(`${PROJEKT}/TÖB/BAUA 2/BS9 Lageplan.pdf`)).toBe(true);
    const d = useAntrag.getState().dokumente[0];
    expect(d.eintrag.dateien).toEqual({ 'BAUA 2': 'BS9 Lageplan.pdf' });
    expect(d.status).toBe('aktuell');
  });

  it('vollständig ausgefüllt: gelb, nach dem Export grün', async () => {
    useAntrag.setState({ katalog: [KATALOG[0]] });
    const host = await projektBS9();
    await useAntrag.getState().umfangSetzen([{ id: 'muster', titel: 'Musterformular', art: 'intern', formular: 'Muster' }]);
    await klick(knopf(host, '001-Muster'));
    // fehlende Angaben eintragen: zweites Textfeld und ein Kästchen der zweiten Zeile
    const s = useFormulare.getState();
    const felder = s.offen!.felder[0];
    act(() => {
      s.wertSetzen(felder.find((f) => f.name === 'Memo2')!, 'Erika');
      s.wertSetzen(felder.find((f) => f.name === 'CheckBox2')!, true);
    });
    act(() => useAntrag.getState().neuBerechnen());
    expect(useAntrag.getState().dokumente[0].status).toBe('offen');
    await klick(knopf(host, 'PDF'));
    await klick(menuePunkt('Als PDF exportieren'));
    await klick(knopf(dialogMit('Als PDF exportieren')!, 'Exportieren'));
    await warte();
    const d = useAntrag.getState().dokumente[0];
    expect(d.status).toBe('aktuell');
    expect(d.datei?.pfad).toMatch(/^BS9 BAUA \d{6} Musterformular\.pdf$/);
    expect(host.querySelector('.nav-symbol .st-punkt')!.className).toContain('aktuell');
  });
});

describe('Dateibefehle im Projektordner', () => {
  it('duplizieren, umbenennen und löschen (mit Sicherung)', async () => {
    const host = await projektBS9();
    await klick(knopf(host, 'Planung'));
    await rechtsklick(knopf(host, 'Notiz.txt'));
    await klick(menuePunkt('Duplizieren'));
    expect(ds.dateien.has(`${PROJEKT}/Planung/Notiz (Kopie).txt`)).toBe(true);
    expect(knopf(host, 'Notiz (Kopie).txt')).toBeDefined();

    await rechtsklick(knopf(host, 'Notiz (Kopie).txt'));
    await klick(menuePunkt('Umbenennen'));
    const feld = document.querySelector<HTMLInputElement>('.rf input')!;
    eingabe(feld, 'Protokoll.txt');
    await klick(knopf(document.querySelector('.rf')!, 'Umbenennen'));
    expect(ds.dateien.has(`${PROJEKT}/Planung/Protokoll.txt`)).toBe(true);
    expect(ds.dateien.has(`${PROJEKT}/Planung/Notiz (Kopie).txt`)).toBe(false);

    await rechtsklick(knopf(host, 'Protokoll.txt'));
    await klick(menuePunkt('Löschen'));
    await klick(knopf(document.querySelector('.rf')!, 'Löschen'));
    expect(ds.dateien.has(`${PROJEKT}/Planung/Protokoll.txt`)).toBe(false);
    expect(ds.papierkorb.has(`${PROJEKT}/Planung/Protokoll.txt`)).toBe(true);
  });

  it('Formulare löschen: mit Rückfrage und Sicherung, ein hier geöffnetes wird vorher geschlossen – in FORMA geöffnete nicht', async () => {
    ds.dateien.set('C:/FORMA/BS9/002-Zweites.frmsjf', MUSTER);
    ds.dateien.set('C:/FORMA/BS9/003-In FORMA.frmsjf', MUSTER);
    ds.dateien.set('C:/FORMA/BS9/003-In FORMA.frmtmp', new Uint8Array([1]));
    const host = await projektBS9();
    // in FORMA geöffnet: abgelehnt, ohne zu fragen
    await rechtsklick(knopf(host, '003-In FORMA'));
    await klick(menuePunkt('Löschen'));
    expect(document.querySelector('.rf')).toBeNull();
    expect(host.textContent).toContain('ist gerade in einem anderen Programm oder auf einem anderen Rechner geöffnet');
    expect(ds.dateien.has('C:/FORMA/BS9/003-In FORMA.frmsjf')).toBe(true);

    // hier geöffnet und geändert: nach Rückfrage geschlossen (Sperre weg) und gelöscht
    await klick(knopf(host, '002-Zweites'));
    expect(ds.dateien.has('C:/FORMA/BS9/002-Zweites.frmtmp')).toBe(true);
    const feld = useFormulare.getState().offen!.felder[0].find((f) => f.art === 'text')!;
    act(() => useFormulare.getState().wertSetzen(feld, 'geändert'));
    await rechtsklick(knopf(host, '002-Zweites'));
    await klick(menuePunkt('Löschen'));
    expect(document.querySelector('.rf')!.textContent).toContain('Nicht gespeicherte Eingaben gehen verloren');
    await klick(knopf(document.querySelector('.rf')!, 'Löschen'));
    await warte();
    expect(ds.dateien.has('C:/FORMA/BS9/002-Zweites.frmsjf')).toBe(false);
    expect(ds.dateien.has('C:/FORMA/BS9/002-Zweites.frmtmp')).toBe(false);
    expect(ds.papierkorb.has('C:/FORMA/BS9/002-Zweites.frmsjf')).toBe(true);
    expect(useFormulare.getState().offen).toBeNull();
    expect(useFormulare.getState().formulare.map((f) => f.name)).toEqual(['001-Muster', '003-In FORMA']);
  });

  it('kopieren und in einen anderen Ordner einfügen', async () => {
    const host = await projektBS9();
    await klick(knopf(host, 'Planung'));
    await rechtsklick(knopf(host, 'Notiz.txt'));
    await klick(menuePunkt('Kopieren'));
    await rechtsklick(knopf(host, 'TÖB'));
    await klick(menuePunkt('einfügen'));
    expect(ds.dateien.has(`${PROJEKT}/TÖB/Notiz.txt`)).toBe(true);
  });
});

describe('PDF: Text und Kreuze', { timeout: 30_000 }, () => {
  // pdf.js vorab laden – auf langsamen Rechnern (CI unter Windows) dauert das mehrere Sekunden
  beforeAll(async () => {
    await pdfjs();
  }, 60_000);

  it('Text vormerken und speichern – als Nachtrag in der Datei', async () => {
    const f = parseFormular(MUSTER);
    const flach = formularPdf(
      f,
      f.seiten.map((s, i) => felderDerSeite(s, i)),
      () => '',
    );
    ds.dateien.set(`${PROJEKT}/Planung/Formular.pdf`, flach);
    const host = await projektBS9();
    await klick(knopf(host, 'Planung'));
    await klick(knopf(host, 'Formular.pdf'));
    await warte();
    expect(knopf(host, 'Text').disabled).toBe(false);
    expect(knopf(host, 'Kreuz').getAttribute('aria-pressed')).toBe('false');
    await klick(knopf(host, 'Kreuz'));
    expect(knopf(host, 'Kreuz').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Bedingungen: Antragsmerkmale und Felder', () => {
  const GK345 = { art: 'gruppe' as const, op: 'und' as const, teile: [{ art: 'merkmal' as const, merkmal: 'Gebäudeklasse', werte: ['3', '4', '5'] }] };
  const gl = (host: Element) => host.querySelector('nav[aria-label="Inhalt des Formulars"]')!;

  it('ein Abschnitt nur bei Gebäudeklasse 3–5: offen, solange die Gebäudeklasse fehlt; entfällt bei GK 1 – das Merkmal gilt für alle Formulare', async () => {
    useFormulare.getState().profilSetzen('nw019999|2026A', { abschnitte: { '0:Panel1': { bedingung: GK345 } }, zaehlt: {} });
    const host = await projektBS9();
    await klick(knopf(host, '001-Muster'));
    // ohne Gebäudeklasse entfällt nichts (R-01): der Abschnitt zählt, die leeren Angaben sind offen
    expect(gl(host).querySelector('.fo-gl-punkt.entfaellt')).toBeNull();
    expect(gl(host).querySelector('.fo-gl-zahl')!.textContent).toBe('3/5');
    expect(gl(host).querySelector('.fo-gl-punkt .fo-gl-offen')!.getAttribute('title')).toContain('hängt ab von: Gebäudeklasse (nicht festgelegt)');
    expect(gl(host).querySelector('.fo-gl-fortschritt')!.textContent).toContain('3 von 5');
    // sichtbar nur die Zahl, die Erklärung steht im Tooltip (der Kopf bleibt schmal)
    expect(gl(host).querySelector('.fo-gl-fortschritt .fo-gl-offen')!.textContent).toBe('2 ungeklärt');
    expect(gl(host).querySelector('.fo-gl-fortschritt .fo-gl-offen')!.getAttribute('title')).toContain('hängen an Antragsmerkmalen');
    expect(gl(host).querySelector('.fo-gl-merkmal')!.textContent).toContain('Gebäudeklasse');
    // am Feld: gelb mit Hinweis „Offen“, nicht „Entfällt“
    expect(host.querySelector('.fo-papier [data-feld="0:Memo2"]')!.classList.contains('offen')).toBe(true);
    const info = host.querySelector<HTMLButtonElement>('.fo-papier .fo-entfall-info.offen')!;
    expect(info.getAttribute('aria-label')).toMatch(/^Ungeklärt – hängt ab von: Gebäudeklasse \(nicht festgelegt\)/);

    // „Alle Antragsmerkmale …“ führt zu den Antragsmerkmalen im Antragsumfang
    await klick(knopf(gl(host) as HTMLElement, 'Alle Antragsmerkmale'));
    await warte();
    const gk = host.querySelector<HTMLSelectElement>('select[aria-label="Gebäudeklasse"]')!;
    act(() => {
      gk.value = '1';
      gk.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await warte();
    // Antragsmerkmale gehören zum Antrag (Abschnitt „formulare“, je Fassung) – nicht mehr projektweit in meta.merkmale
    expect(antragIn()?.merkmale).toEqual({ Gebäudeklasse: '1' });
    expect(antragIn('BAUA')?.merkmale).toBeUndefined();
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.merkmale).toBeUndefined();

    await klick(knopf(host, '001-Muster'));
    expect(gl(host).querySelector('.fo-gl-punkt.entfaellt')?.textContent).toContain('entfällt');
    expect(gl(host).querySelector('.fo-gl-fortschritt')!.textContent).toContain('0 von 0');
    expect(gl(host).querySelector('.fo-gl-merkmal')).toBeNull();
    expect(gl(host).querySelector('.fo-gl-offen')).toBeNull();

    await act(() => useAntrag.getState().merkmalSetzen('Gebäudeklasse', '3'));
    await warte();
    expect(gl(host).querySelector('.fo-gl-punkt.entfaellt')).toBeNull();
    expect(gl(host).querySelector('.fo-gl-zahl')!.textContent).toBe('3/5');
    expect(gl(host).querySelector('.fo-gl-offen')).toBeNull();
  });

  it('Antragsmerkmal im Hinweiskasten der Gliederung festlegen: landet in der Projektdatei, offen wird erforderlich (U-02)', async () => {
    useFormulare.getState().profilSetzen('nw019999|2026A', { abschnitte: { '0:Panel1': { bedingung: GK345 } }, zaehlt: {} });
    const host = await projektBS9();
    await klick(knopf(host, '001-Muster'));
    const wahl = gl(host).querySelector('[aria-label="Gebäudeklasse festlegen"]')!;
    // mit Kurzerklärung und Fundstelle
    expect(wahl.textContent).toContain('Gebäudeklasse (§ 2 Abs. 3 BauO NRW 2018)');
    expect([...wahl.querySelectorAll('.fo-merkmal-werte button')].map((b) => b.textContent)).toEqual(['1', '2', '3', '4', '5']);
    expect(wahl.querySelector<HTMLButtonElement>('.fo-merkmal-werte button')!.title).toContain('freistehend');
    // die Erklärung auch für Screenreader: Beschreibung des Knopfs
    const beschreibung = wahl.querySelector<HTMLButtonElement>('.fo-merkmal-werte button')!.getAttribute('aria-describedby')!;
    expect(document.getElementById(beschreibung)!.textContent).toContain('freistehend');
    await klick(knopf(wahl as HTMLElement, '3'));
    await warte();
    expect(antragIn()?.merkmale).toEqual({ Gebäudeklasse: '3' });
    expect(gl(host).querySelector('.fo-gl-merkmal')).toBeNull();
    expect(gl(host).querySelector('.fo-gl-offen')).toBeNull();
    expect(gl(host).querySelector('.fo-gl-zahl')!.textContent).toBe('3/5');
  });

  it('Bedingung zusammenstellen: Antragsmerkmal UND (Feld per Klick im Formular ODER anderes Merkmal) – in Worten und mit Zustand', async () => {
    const host = await projektBS9();
    await klick(knopf(host, '001-Muster'));
    const einrichten = [...host.querySelectorAll<HTMLButtonElement>('.toolbar button')].find((b) => b.textContent?.includes('Einrichten'))!;
    await klick(einrichten);
    const panel = () => host.querySelector<HTMLElement>('aside[aria-label="Einstellungen der Auswahl"]')!;
    const bedingung = () => useFormulare.getState().profile['nw019999|2026A']?.abschnitte['0:Panel1']?.bedingung;
    // Abschnitt im Baum wählen; „immer erforderlich“ → nur bei Gebäudeklasse 4 oder 5
    await klick(host.querySelector<HTMLButtonElement>('.fo-ein-baum [data-auswahl="a:0:Panel1"]')!);
    expect(panel().textContent).toContain('Immer erforderlich');
    await klick(knopf(panel(), 'Nur bei Antragsmerkmal'));
    await klick(panel().querySelector<HTMLInputElement>('input[aria-label="Gebäudeklasse 4"]')!);
    await klick(panel().querySelector<HTMLInputElement>('input[aria-label="Gebäudeklasse 5"]')!);
    expect(bedingung()).toEqual({ art: 'gruppe', op: 'und', teile: [{ art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['4', '5'] }] });

    // Oder-Gruppe: ein Feld eines anderen Abschnitts per Klick ins Formular – hier gibt es nur einen, also das
    // Kästchen der zweiten Seite, falls vorhanden, sonst ein Merkmal
    await klick(knopf(panel(), 'Oder-Gruppe'));
    const gruppe = panel().querySelector<HTMLElement>('.bd-gruppe.tiefe-1')!;
    await klick(knopf(gruppe, 'Bedingung'));
    const wofuer = gruppe.querySelector<HTMLSelectElement>('select[aria-label="Wovon es abhängt"]')!;
    act(() => {
      wofuer.value = 'm:Sonderbau';
      wofuer.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await klick(gruppe.querySelector<HTMLInputElement>('input[aria-label="Sonderbau ja"]')!);
    await klick(knopf(gruppe, 'Bedingung'));
    const zweite = [...gruppe.querySelectorAll<HTMLSelectElement>('select[aria-label="Wovon es abhängt"]')][1];
    act(() => {
      zweite.value = 'm:Verfahren';
      zweite.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await klick(gruppe.querySelector<HTMLInputElement>('input[aria-label="Verfahren Baugenehmigungsverfahren"]')!);
    expect(bedingung()).toEqual({
      art: 'gruppe',
      op: 'und',
      teile: [
        { art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['4', '5'] },
        {
          art: 'gruppe',
          op: 'oder',
          teile: [
            { art: 'merkmal', merkmal: 'Sonderbau', werte: ['ja'] },
            { art: 'merkmal', merkmal: 'Verfahren', werte: ['Baugenehmigungsverfahren'] },
          ],
        },
      ],
    });
    expect(panel().querySelector('.bd-satz')!.textContent).toBe('Erforderlich, wenn Gebäudeklasse 4 oder 5 und (Sonderbau ja oder Verfahren Baugenehmigungsverfahren)');
    // die Merkmale fehlen im Projekt: offen, gilt als erforderlich (R-01)
    expect(panel().querySelector('.bd-jetzt')!.textContent).toBe('offen – Antragsmerkmal nicht festgelegt (gilt als erforderlich)');

    // ein Feld durch Klick ins Formular wählen: Bedingung für das Feld Memo2 – „wenn Sonderbau (Kästchen) angekreuzt“
    await klick(host.querySelector<HTMLButtonElement>('.fo-ein-feld[data-ein="0:Memo2"]')!);
    await klick(knopf(panel(), 'Feld im Formular wählen'));
    expect(panel().textContent).toContain('Im Formular auf das Feld klicken');
    const ziel = host.querySelector<HTMLButtonElement>('.fo-ein-feld[data-ein="0:CheckBox2"]')!;
    expect(ziel.getAttribute('aria-label')).toMatch(/wählen$/);
    await klick(ziel);
    expect(useFormulare.getState().profile['nw019999|2026A'].bedingungen?.['0:Memo2']).toEqual({ art: 'gruppe', op: 'und', teile: [{ art: 'feld', feld: '0:CheckBox2', pruefung: 'ausgefuellt' }] });
    // die Auswahl blieb beim Feld, im Formular trägt es jetzt das Bedingungszeichen
    expect(host.querySelector('.fo-ein-feld[data-ein="0:Memo2"]')!.classList.contains('bedingt')).toBe(true);
    // „Mindestens eine“: Memo2 auch dann, wenn Gebäudeklasse 5
    await klick(knopf(panel(), 'Bedingung'));
    await klick(knopf(panel(), 'Mindestens eine'));
    expect(useFormulare.getState().profile['nw019999|2026A'].bedingungen?.['0:Memo2']?.op).toBe('oder');
  });

  it('ein angekreuztes Feld schaltet ein weiteres erforderliches Feld frei – im Formular farbig statt neutral', async () => {
    useFormulare.getState().profilSetzen('nw019999|2026A', { abschnitte: {}, zaehlt: {}, bedingungen: { '0:Memo2': { art: 'gruppe', op: 'und', teile: [{ art: 'feld', feld: '0:CheckBox2', pruefung: 'ausgefuellt' }] } } });
    const host = await projektBS9();
    await klick(knopf(host, '001-Muster'));
    const memo2 = () => host.querySelector('.fo-papier [data-feld="0:Memo2"]')!;
    // Memo2 (leer) ist noch nicht erforderlich: 3 von 4
    expect(memo2().classList.contains('entfaellt')).toBe(true);
    expect(gl(host).querySelector('.fo-gl-zahl')!.textContent).toBe('3/4');
    const s = useFormulare.getState();
    act(() => s.wertSetzen(s.offen!.felder[0].find((f) => f.name === 'CheckBox2')!, true));
    await warte();
    expect(memo2().classList.contains('entfaellt')).toBe(false);
    expect(gl(host).querySelector('.fo-gl-zahl')!.textContent).toBe('4/5');
  });

  it('entfallendes Feld: Info-Symbol nennt den Grund, ein Klick öffnet den Gesetzestext mit dem Absatz', async () => {
    const bedingung = {
      art: 'gruppe' as const,
      op: 'und' as const,
      teile: [{ art: 'feld' as const, feld: '0:CheckBox2', pruefung: 'ausgefuellt' as const }],
      grund: 'Nur bei Sonderbauten.',
      quellen: [{ gesetz: 'bauo-nrw', paragraf: '68', absatz: 2 }],
    };
    useFormulare.getState().profilSetzen('nw019999|2026A', { abschnitte: {}, zaehlt: {}, bedingungen: { '0:Memo2': bedingung } });
    const host = await projektBS9();
    await klick(knopf(host, '001-Muster'));
    const info = () => host.querySelector<HTMLButtonElement>('.fo-papier .fo-entfall-info');
    expect(info()).not.toBeNull();
    expect(info()!.getAttribute('aria-label')).toContain('Nur bei Sonderbauten.');
    expect(info()!.getAttribute('aria-label')).toContain('Rechtsgrundlage: § 68 Absatz 2 BauO NRW 2018');
    // Zeigen: Hinweis außerhalb des Blatts
    act(() => info()!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: document.body })));
    expect(document.querySelector('.fo-tipp')?.textContent).toContain('Nur bei Sonderbauten.');
    // Klick: Gesetzestext, der zitierte Absatz hervorgehoben
    await klick(info()!);
    for (let i = 0; i < 20 && !document.querySelector('.fo-gesetz-zeile'); i++) await warte();
    const modal = document.querySelector('.fo-gesetz')!;
    expect(modal.querySelector('h3')!.textContent).toContain('§ 68 BauO NRW 2018');
    expect(modal.querySelector('.fo-gesetz-zeile.markiert')!.textContent).toMatch(/^\(2\)/);
    // Esc (Tastendruck im Dokument) schließt das Fenster über den gemeinsamen Dialog-Stapel
    act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('.fo-gesetz')).toBeNull();
    // angekreuzt: Memo2 ist erforderlich, das Symbol verschwindet
    const s = useFormulare.getState();
    act(() => s.wertSetzen(s.offen!.felder[0].find((f) => f.name === 'CheckBox2')!, true));
    await warte();
    expect(info()).toBeNull();
  });

  it('Dokumente des Antragsumfangs mit Bedingung: fehlen ohne Gebäudeklasse, entfallen bei GK 1, fehlen bei GK 3', async () => {
    const host = await projektBS9();
    await useAntrag.getState().umfangSetzen([{ id: 'bauantrag', titel: 'Bauantrag', art: 'intern', formular: 'Bauantrag', bedingung: GK345 }]);
    await warte();
    // fehlendes Merkmal: nie „nicht erforderlich“ (R-01)
    expect(useAntrag.getState().dokumente[0].status).not.toBe('entfaellt');
    expect(useAntrag.getState().dokumente[0].status).toBe('fehlt');
    await useAntrag.getState().merkmalSetzen('Gebäudeklasse', '1');
    await warte();
    expect(useAntrag.getState().dokumente[0].status).toBe('entfaellt');
    expect(host.querySelector('.nav-eintrag.fehlt')).toBeNull();
    await useAntrag.getState().merkmalSetzen('Gebäudeklasse', '3');
    await warte();
    expect(useAntrag.getState().dokumente[0].status).toBe('fehlt');
    expect(host.querySelector('.nav-eintrag.fehlt')?.textContent).toContain('Bauantrag');
  });
});

describe('Formular hinzufügen', () => {
  it('aus einem anderen Projekt – neuester Stand, geleert, geöffnet und in den Antragsumfang aufgenommen', async () => {
    ds.dateien.set('C:/FORMA/H24/004-Bauantrag (2024).frmsjf', MUSTER);
    ds.beruehren('C:/FORMA/H24/003-Bauantrag (2026).frmsjf');
    const host = await projektBS9();
    await useAntrag.getState().umfangSetzen([]);
    await klick(host.querySelector<HTMLButtonElement>('button[aria-label="Formular hinzufügen …"]')!);
    await warte();
    const dialog = dialogMit('Formular hinzufügen')!;
    const zeilen = [...dialog.querySelectorAll('.fh-zeile')];
    // je Formular nur eins: der neueste Stand (2026), Musterformulare aus H24 nicht doppelt
    expect(zeilen.map((z) => z.querySelector('strong')!.textContent)).toEqual(['Bauantrag']);
    expect(zeilen[0].textContent).toContain('003-Bauantrag (2026).frmsjf');
    await klick(zeilen[0] as HTMLElement);
    await klick(knopf(dialog, 'Hinzufügen'));
    await warte();
    const neu = ds.dateien.get('C:/FORMA/BS9/002-Bauantrag (2026).frmsjf')!;
    expect(felderDerSeite(parseFormular(neu).seiten[0], 0).every((f) => f.original === '' || f.original === false)).toBe(true);
    expect(useFormulare.getState().offen?.name).toBe('002-Bauantrag (2026)');
    expect(useAntrag.getState().projektdatei?.umfang).toMatchObject([{ titel: 'Bauantrag', art: 'intern', formularDatei: '002-Bauantrag (2026).frmsjf' }]);
  });
});

describe('Projektübersicht', () => {
  it('je Quelle eingeklappt, die Suche klappt auf, zuletzt geöffnete vorne – mit Antragsstatus und Sperren', async () => {
    useFormulare.setState({ projektordner: ['C:/FORMA', 'D:/Archiv'] });
    ds.dateien.set('D:/Archiv/AB1/001-Muster.frmsjf', MUSTER);
    ds.dateien.set('D:/Archiv/AB1/001-Muster.frmtmp', new Uint8Array([1]));
    ds.dateien.set('D:/Archiv/AB1/sj_office.ini', cp1252Schreiben('[Allgemeines]\r\nText=Am Bach 1\r\n\r\n'));
    const host = await render();
    const koepfe = () => [...host.querySelectorAll('.pa-gruppe-kopf')].map((k) => [k.querySelector('.pa-gruppe-name')!.textContent, k.getAttribute('aria-expanded'), k.querySelector('.pa-zahl')!.textContent]);
    expect(koepfe()).toEqual([
      ['FORMA', 'false', '2'],
      ['Archiv', 'false', '1'],
    ]);
    expect(host.querySelector('.pa-karte')).toBeNull();
    expect(host.querySelector('[aria-label="Zuletzt geöffnet"]')).toBeNull();

    // Suche: nur die passende Quelle, aufgeklappt; Enter öffnet den ersten Treffer
    const suche = host.querySelector<HTMLInputElement>('input[aria-label="Projekte durchsuchen"]')!;
    eingabe(suche, 'bach');
    await warte();
    expect(koepfe()).toEqual([['Archiv', 'true', '1 / 1']]);
    const ab1 = host.querySelector('.pa-karte[data-projekt="AB1"]')!;
    expect(ab1.querySelector('.pa-titel')!.textContent).toBe('Am Bach 1');
    expect(ab1.querySelector('.pa-info')!.textContent).toContain('1 Formular');
    expect(ab1.querySelector('.pa-marke.warnung')!.textContent).toContain('1 geöffnet');
    expect(ab1.querySelector('.pa-status-text')!.textContent).toContain('noch nicht geprüft');
    act(() => void suche.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await warte();
    expect(useFormulare.getState().projekt?.ordner).toBe('AB1');
    expect(host.querySelector('.pa')).toBeNull();

    // BS9 öffnen und den Antragsumfang festlegen – der Antragsstatus wird für die Übersicht gemerkt
    await klick(knopf(host, 'Wechseln'));
    await projektOeffnen(host, 'BS9');
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    expect(useAntrag.getState().projektStatus['C:/FORMA|BS9'].anzahl).toEqual({ unvollstaendig: 1, fehlt: 1, offen: 1 });

    await klick(knopf(host, 'Wechseln'));
    const zuletzt = host.querySelector('[aria-label="Zuletzt geöffnet"]')!;
    expect([...zuletzt.querySelectorAll('.pa-karte')].map((k) => k.getAttribute('data-projekt'))).toEqual(['BS9', 'AB1']);
    const bs9 = zuletzt.querySelector('.pa-karte[data-projekt="BS9"]')!;
    expect(bs9.className).toContain('aktiv');
    expect(bs9.querySelector('.pa-ampel')!.className).toContain('fehlt');
    expect(bs9.querySelector('.pa-status-text')!.textContent).toBe('0/3 aktuell · BAUA 2');
    expect(bs9.querySelectorAll('.pa-balken-teil')).toHaveLength(3);
    expect(bs9.querySelector('.pa-info')!.textContent).toMatch(/1 Formular · geöffnet heute/);

    // aus „Zuletzt geöffnet“ entfernen (Kontextmenü), dann zurück zum Projekt
    await rechtsklick(zuletzt.querySelector('.pa-karte[data-projekt="AB1"]')!);
    await klick(menuePunkt('Aus „Zuletzt geöffnet“ entfernen'));
    expect(useFormulare.getState().zuletzt.map((z) => z.ordner)).toEqual(['BS9']);
    await klick(knopf(host, 'Zurück zu BS9'));
    expect(host.querySelector('.pa')).toBeNull();
    expect(host.querySelector('.fo-projektkopf')!.textContent).toContain('BS9');
  });
});

describe('Angaben zum Antrag in der Projektdatei (.oap)', () => {
  const dialog = dialogMit;

  it('eine alte formulare.json wird gelesen und einmalig in die Projektdatei übernommen – sie selbst bleibt liegen', async () => {
    const alt = new TextEncoder().encode(JSON.stringify({ aktiveFassung: 'BAUA', merkmale: { Gebäudeklasse: '2' } }));
    ds.dateien.set('C:/FORMA/BS9/formulare.json', alt);
    const host = await projektBS9();
    await warte();
    expect(host.textContent).toContain('in die Projektdatei übernommen');
    // nach dem nächsten Laden: in jeden vorhandenen Antrag übernommen (danach unabhängig)
    await act(() => useAntrag.getState().laden());
    expect(abschnitt()).toMatchObject({ aktiveFassung: 'BAUA' });
    expect(antragIn('BAUA')?.merkmale).toEqual({ Gebäudeklasse: '2' });
    expect(antragIn('BAUA 2')?.merkmale).toEqual({ Gebäudeklasse: '2' });
    expect(useAntrag.getState().projektdatei?.merkmale).toEqual({ Gebäudeklasse: '2' });
    expect(ds.dateien.get('C:/FORMA/BS9/formulare.json')).toBe(alt);
    expect(useAntrag.getState().projektdatei).toMatchObject({ aktiveFassung: 'BAUA' });
    // die Stammdaten der Projektdatei bleiben, wie sie sind
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.projektcode).toBe('BS9');
  });

  it('ohne Projektdatei fragt der Stammdaten-Dialog die Angaben ab – danach steht der Antragsumfang in der neuen Datei', async () => {
    ds.dateien.delete(OAP);
    const host = await projektBS9();
    expect(knopf(host, 'Keine Projektdatei')).toBeDefined();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    const sd = dialog('Projektdatei für BS9 anlegen')!;
    expect(sd).not.toBeNull();
    expect(ds.dateien.has(OAP)).toBe(false);
    await klick(knopf(sd, 'Projektdatei anlegen'));
    await warte();
    expect(dialog('Projektdatei für BS9 anlegen')).toBeNull();
    expect((antragIn()!.umfang as { id: string }[]).map((u) => u.id)).toEqual(['muster', 'bauantrag', 'lageplan']);
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.projektcode).toBe('BS9');
    expect(knopf(host, 'Keine Projektdatei')).toBeUndefined();
    expect(ds.dateien.has('C:/FORMA/BS9/formulare.json')).toBe(false);
  });

  it('ohne Projektordner: im Stammordner anlegen und zuordnen, dann Stammdaten – der Antragsumfang landet in der neuen Projektdatei', async () => {
    for (const k of [...ds.dateien.keys()]) if (k.startsWith(PROJEKT)) ds.dateien.delete(k);
    ds.ordner.clear();
    const host = await projektBS9();
    expect(knopf(host, 'Kein Projektordner')).toBeDefined();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    const po = dialog('Projektordner für BS9')!;
    expect(po.querySelector<HTMLInputElement>('input[aria-label="Name des Projektordners"]')!.value).toBe('BS9 Musterstraße 9');
    await klick(knopf(po, 'Ordner anlegen'));
    await warte();
    expect(ds.ordner.has(PROJEKT)).toBe(true);
    expect(useFormulare.getState().ordnerWahl).toEqual({ BS9: PROJEKT });
    // die Zuordnung gilt für alle (gemeinsamer Konfigurationsordner)
    expect(JSON.parse(localStorage.getItem('arch-tools:konfig:formulare')!)).toEqual({ ordnerWahl: { BS9: PROJEKT } });
    await klick(knopf(dialog('Projektdatei für BS9 anlegen')!, 'Projektdatei anlegen'));
    await warte();
    expect((antragIn()!.umfang as unknown[]).length).toBe(3);
    expect(knopf(host, 'Kein Projektordner')).toBeUndefined();
  });
});

describe('Antragsvorlagen und Reihenfolge', () => {
  const ids = () => (antragIn()!.umfang as { id: string }[]).map((u) => u.id);
  const zeile = (host: HTMLElement, titel: string) => [...host.querySelectorAll<HTMLElement>('.pu-zeile')].find((z) => z.querySelector('strong')?.textContent === titel)!;
  const taste = (el: HTMLElement, key: string) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));

  it('Antragsumfang aus der Vorlage zur Antragsart, aus einer anderen Vorlage ergänzen, Reihenfolge ändern', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    // aktive Fassung „BAUA 2“ → Vorlage Bauantrag vorgeschlagen
    const wahl = host.querySelector<HTMLSelectElement>('select[aria-label="Antragsvorlage"]')!;
    expect(wahl.value).toBe('baua');
    expect(wahl.selectedOptions[0].textContent).toBe('Bauantrag (BAUA) – 3 Dokumente');
    // stattdessen die Voranfrage
    act(() => {
      wahl.value = 'bauva';
      wahl.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await klick(knopf(host, 'Antragsumfang festlegen'));
    expect(ids()).toEqual(['lageplan']);

    // fehlende Dokumente des Bauantrags ergänzen (in der Reihenfolge des Katalogs)
    await klick(knopf(host, 'Dokument hinzufügen'));
    await klick(menuePunkt('Aus Vorlage ergänzen'));
    await klick(menuePunkt('Bauantrag (2 fehlen)'));
    await warte();
    expect(ids()).toEqual(['lageplan', 'muster', 'bauantrag']);

    // Reihenfolge: per Kontextmenü und mit der Tastatur am Griff
    await rechtsklick(zeile(host, 'Lageplan'));
    expect(gesperrt(menuePunkt('Nach oben'))).toBe(true);
    await klick(menuePunkt('Nach unten'));
    await warte();
    expect(ids()).toEqual(['muster', 'lageplan', 'bauantrag']);
    taste(zeile(host, 'Bauantrag').querySelector<HTMLElement>('.sort-griff')!, 'ArrowUp');
    await warte();
    expect(ids()).toEqual(['muster', 'bauantrag', 'lageplan']);
    expect([...host.querySelectorAll('.pu-zeile strong')].map((x) => x.textContent)).toEqual(['Musterformular', 'Bauantrag', 'Lageplan']);
  });

  it('Einstellungen: Vorlagen anlegen, Dokumente ankreuzen, Katalog und Vorlagen sortieren', async () => {
    useFormulare.setState({ einstellungenOffen: true, einstellungsBereich: 'antrag' });
    const host = await render();
    const katalogTitel = () => useAntrag.getState().katalog.map((k) => k.id);
    // Antragsdokumente: über der Liste die Vorlage wählen, dann je Dokument ankreuzen
    const wahl = host.querySelector<HTMLSelectElement>('.es-dok-kopf select')!;
    act(() => {
      wahl.value = 'bauva';
      wahl.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const kreuz = (dok: string, vorlage: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${dok} gehört zu ${vorlage}"]`)!;
    expect(kreuz('Lageplan', 'Bauvoranfrage').checked).toBe(true);
    expect(kreuz('Bauantrag', 'Bauvoranfrage').checked).toBe(false);
    act(() => kreuz('Bauantrag', 'Bauvoranfrage').click());
    expect(useAntrag.getState().vorlagen.find((v) => v.id === 'bauva')!.dokumente).toEqual(['lageplan', 'bauantrag']);

    // neue Vorlage mit Antragsart
    await klick(knopf(host, 'Vorlage hinzufügen'));
    const neu = useAntrag.getState().vorlagen[2];
    expect(neu).toMatchObject({ name: 'Neue Vorlage', dokumente: [] });
    const art = host.querySelector<HTMLSelectElement>('select[aria-label="Antragsart von Neue Vorlage"]')!;
    act(() => {
      art.value = 'DENK';
      art.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(useAntrag.getState().vorlagen[2].art).toBe('DENK');
    // gespeichert (und damit auch in der Einstellungsdatei)
    expect(JSON.parse(localStorage.getItem('formulare:vorlagen')!)[2]).toMatchObject({ name: 'Neue Vorlage', art: 'DENK' });

    // Katalog sortieren: Muster eine Zeile nach unten, Vorlage „Neue Vorlage“ nach oben
    expect(katalogTitel()).toEqual(['muster', 'bauantrag', 'lageplan']);
    taste(host.querySelector<HTMLElement>('button[aria-label="Musterformular verschieben"]')!, 'ArrowDown');
    expect(katalogTitel()).toEqual(['bauantrag', 'muster', 'lageplan']);
    taste(host.querySelector<HTMLElement>('button[aria-label="Vorlage Neue Vorlage verschieben"]')!, 'ArrowUp');
    expect(useAntrag.getState().vorlagen.map((v) => v.name)).toEqual(['Bauantrag', 'Neue Vorlage', 'Bauvoranfrage']);
  });
});

describe('Plansatz', () => {
  it('ein Eintrag für alle Pläne: Lücke in der Nummernfolge, noch nicht verschobene, Liste je Plan – auch in der Ansicht „Antrag“', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261111 GP-01 Lageplan.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261111 GP-02 Grundriss EG.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261111 GP-04 Schnitt.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261110 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${PROJEKT}/Planung/BS9 GP 261111 GP-05 Ansichten.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await act(() => useAntrag.getState().umfangSetzen([{ id: 'plaene', titel: 'Bauzeichnungen', art: 'plansatz', quelle: 'Planung' }]));
    await warte();
    await klick(antragsdaten(host));
    const zeile = host.querySelector<HTMLElement>('.pu-zeile')!;
    expect(zeile.className).toContain('unvollstaendig');
    expect(zeile.textContent).toContain('Plansatz');
    expect(zeile.textContent).toContain('4 Pläne · GP-01 bis GP-05 · GP-03 fehlt · 1 nicht verschoben');
    expect(zeile.textContent).toContain('Quelle: Planung');
    await klick(knopf(zeile, 'Pläne zeigen'));
    expect([...host.querySelectorAll('.pu-plan')].map((p) => [p.querySelector('.pu-plan-nr')!.textContent, p.className.split(' ')[1]])).toEqual([
      ['GP-01', 'aktuell'],
      ['GP-02', 'aktuell'],
      ['GP-03', 'fehlt'],
      ['GP-04', 'aktuell'],
      ['GP-05', 'quelle'],
    ]);
    // Projektordner › Antrag: fehlende Pläne einzeln
    await klick(knopfGenau(host, 'Antrag'));
    const fehlt = [...host.querySelectorAll('.fo-bereit-fehlt li')].map((l) => l.textContent);
    expect(fehlt).toEqual(['GP-03Lücke', 'GP-05 Ansichtennicht verschoben']);
    // der Statuspunkt sagt, was mit dem Plan ist (nicht „nicht vollständig ausgefüllt“)
    expect([...host.querySelectorAll('.fo-bereit-fehlt li .st-punkt')].map((p) => p.getAttribute('aria-label'))).toEqual([
      'Lücke – diese Nummer fehlt in der fortlaufenden Nummerierung',
      'nicht verschoben – liegt erst in der Quelle',
    ]);
    // die Plandateien gehören zum Plansatz
    expect([...host.querySelectorAll('.fo-bereit-zeile')].find((z) => z.textContent?.includes('GP-02'))!.textContent).toContain('Bauzeichnungen');
  });

  it('ganz ohne Pläne zählt der Plansatz als fehlend – nie „Alles bereit“', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261110 01 Bauantrag.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await act(() => useAntrag.getState().umfangSetzen([{ id: 'plaene', titel: 'Bauzeichnungen', art: 'plansatz', quelle: 'Planung' }]));
    await warte();
    await klick(knopfGenau(host, 'Antrag'));
    expect([...host.querySelectorAll('.fo-bereit-fehlt li')].map((l) => l.textContent)).toEqual(['Bauzeichnungen']);
    expect(host.querySelector('.fo-bereit-kopf')!.textContent).toContain('1 fehlt');
    expect(host.querySelector('.fo-bereit-fertig')).toBeNull();
    // in den Antragsdaten: keine leere Planliste zum Aufklappen
    await klick(antragsdaten(host));
    const zeile = host.querySelector<HTMLElement>('.pu-zeile')!;
    expect(zeile.textContent).toContain('keine Pläne mit Plannummer gefunden');
    expect(knopf(zeile, 'Pläne zeigen')).toBeUndefined();
  });

  it('verschobener Plan mit der Phase im Namen: „Umbenennen nach Namensformat“ ersetzt nur die Phase – er bleibt im Plansatz', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 GP 261111 GP-01 Grundriss EG.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await act(() => useAntrag.getState().umfangSetzen([{ id: 'plaene', titel: 'Bauzeichnungen', art: 'plansatz', quelle: 'Planung' }]));
    await warte();
    await klick(knopfGenau(host, 'Antrag'));
    const zeile = () => [...host.querySelectorAll<HTMLElement>('.fo-bereit-zeile')].find((z) => z.textContent?.includes('GP-01'))!;
    // im Antragsordner steht statt der Phase die Antragsart – so kann der Plan nicht bereit sein
    expect(zeile().classList.contains('name')).toBe(true);
    expect(zeile().textContent).toContain('Namensformat passt nicht');
    await rechtsklick(zeile().querySelector('.fo-baum-zeile')!);
    await klick(menuePunkt('Umbenennen nach Namensformat'));
    const feld = host.querySelector<HTMLInputElement>('.modal.rf input')!;
    expect(feld.value).toBe('BS9 BAUA 261111 GP-01 Grundriss EG.pdf');
    await klick(knopf(host.querySelector('.modal.rf')!, 'Umbenennen'));
    await warte();
    expect(ds.dateien.has(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261111 GP-01 Grundriss EG.pdf`)).toBe(true);
    // die Plannummer bleibt: weiterhin GP-01 im Plansatz, aktuell
    expect(useAntrag.getState().dokumente[0].plansatz!.plaene.map((p) => [p.schluessel, p.zustand])).toEqual([['GP-01', 'aktuell']]);
  });

  it('Plansatz-Zeile: „n Hinweise“ vor der Quelle, öffnet die Liste und führt zu den Hinweisen', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261111 GP-01 Grundriss EG.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261111 GP-02 Grundriss OG.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await act(() => useAntrag.getState().umfangSetzen([{ id: 'plaene', titel: 'Bauzeichnungen', art: 'plansatz', quelle: 'Planung' }]));
    await warte();
    await klick(antragsdaten(host));
    const zeile = host.querySelector<HTMLElement>('.pu-zeile')!;
    const unter = zeile.querySelector('.pu-text > .small-text:not(.muted)')!.textContent!;
    // kein Schnitt, keine Ansicht: zwei Hinweise
    expect(unter.indexOf('Pläne zeigen')).toBeLessThan(unter.indexOf('2 Hinweise'));
    expect(unter.indexOf('2 Hinweise')).toBeLessThan(unter.indexOf('Quelle: Planung'));
    await klick(knopf(zeile, '2 Hinweise'));
    await warte();
    const hinweise = host.querySelector<HTMLElement>('#plaene-plaene .pu-plan-hinweise')!;
    expect(hinweise.textContent).toContain('kein Schnitt erkannt');
    expect(document.activeElement).toBe(hinweise);
    // ein zweiter Klick schließt die Liste nicht
    await klick(knopf(zeile, '2 Hinweise'));
    await warte();
    expect(host.querySelector('#plaene-plaene')).not.toBeNull();
  });

  it('Antragsordner werden auch an den Antragsarten des Namensschemas erkannt (BVA, ENTW)', async () => {
    ds.ordner.add(`${PROJEKT}/TÖB/BVA`);
    ds.ordner.add(`${PROJEKT}/TÖB/ENTW 2`);
    const host = await projektBS9();
    expect(useAntrag.getState().fassungen.map((f) => f.name)).toEqual(expect.arrayContaining(['BAUA', 'BAUA 2', 'BVA', 'ENTW 2']));
    // BVA ist eine gleichwertige Schreibweise von BAUVA: vorgeschlagen wird die Vorlage der Bauvoranfrage
    await act(() => useAntrag.getState().fassungWaehlen('BVA'));
    await warte();
    await klick(antragsdaten(host));
    const wahl = () => host.querySelector<HTMLSelectElement>('select[aria-label="Antragsvorlage"]')!;
    expect(wahl().value).toBe('bauva');
    expect(knopf(host, 'Antragsumfang festlegen').disabled).toBe(false);
    // zu ENTW gibt es keine Vorlage: keine Vorwahl „Bauantrag“, sondern die Bitte zu wählen
    await act(() => useAntrag.getState().fassungWaehlen('ENTW 2'));
    await warte();
    expect(wahl().value).toBe('');
    expect(wahl().selectedOptions[0].textContent).toBe('– bitte wählen –');
    expect(host.textContent).toContain('Für ENTW gibt es keine Antragsvorlage');
    expect(knopf(host, 'Antragsumfang festlegen').disabled).toBe(true);
    act(() => {
      wahl().value = 'baua';
      wahl().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(knopf(host, 'Antragsumfang festlegen').disabled).toBe(false);
  });

  it('Dateiname beim Export: die Antragsart kommt aus dem aktiven Antrag, auch bei einer alten Vorlage mit {Phase}', async () => {
    // Einstellungen aus einer früheren Fassung: Vorlage mit {Phase}, Phase „BVA“
    useAntrag.setState({ einstellungen: einstellungenAus({ ...VORGABE_EXPORT, namensvorlage: '{Kürzel} {Phase} {Datum} {Nr} {Name}', phase: 'BVA' }) });
    await projektBS9();
    expect(aktiveFassung(useAntrag.getState(), useFormulare.getState().projekt)).toBe('BAUA 2');
    expect(exportVorschlag('C:/FORMA/BS9/001-Muster.frmsjf').name).toMatch(/^BS9 BAUA \d{6} /);
    // auch eine abweichende Vorlage des Projekts mit festem Kürzel
    act(() => useAntrag.getState().setUeberschreibung({ namensvorlage: '{Kürzel} BVA {Datum} {Name}' }));
    expect(exportVorschlag('C:/FORMA/BS9/001-Muster.frmsjf').name).toMatch(/^BS9 BAUA \d{6} /);
  });

  it('ändert sich das Namensschema des Büros, werden die Antragsordner sofort neu erkannt', async () => {
    ds.ordner.add(`${PROJEKT}/TÖB/WEGA`);
    ds.ordner.add(`${PROJEKT}/TÖB/XYZA`);
    await projektBS9();
    const namen = () => useAntrag.getState().fassungen.map((f) => f.name);
    expect(namen()).not.toContain('WEGA');
    act(() => useFormulare.setState({ namensschemaBuero: { ...VORGABE_NAMENSSCHEMA, antragsarten: [...VORGABE_NAMENSSCHEMA.antragsarten, { kuerzel: 'WEGA', name: 'Test' }] } }));
    await warte();
    await warte();
    expect(namen()).toContain('WEGA');
    // ebenso, wenn eine andere App das Namensschema derselben Projektdatei ändert
    const p = readProjectFile(ds.dateien.get(OAP)!);
    p.namensschema = { ...VORGABE_NAMENSSCHEMA, antragsarten: [{ kuerzel: 'XYZA', name: 'Test' }] };
    ds.dateien.set(OAP, writeArchive(p));
    await act(() => useFormulare.getState().oapLaden());
    await warte();
    await warte();
    expect(namen()).toContain('XYZA');
  });
});

describe('Projektordner, Ansicht „Antrag“: Dokumente im Antragsordner mit Vollständigkeit', () => {
  it('nur der Ordner der aktiven Fassung; „bereit“ von Hand und nur im Namensformat; Umbenennen nach Format', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261110 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/Lageplan vom Vermesser.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await klick(knopfGenau(host, 'Antrag'));
    expect(localStorage.getItem('formulare:ablage-ansicht')).toBe('antrag');
    const ansicht = () => host.querySelector('.fo-antrag-ablage')!;
    const kopf = () => ansicht().querySelector('.fo-bereit-kopf')!.textContent;
    const zeile = (name: string) => [...ansicht().querySelectorAll('.fo-bereit-zeile')].find((z) => z.textContent?.includes(name))!;
    expect(ansicht().querySelector('.nav-ablage-name')!.textContent).toBe('TÖB/BAUA 2');
    // nur die Dokumente des Antragsordners, nicht BAUA oder Planung
    expect([...ansicht().querySelectorAll('.fo-bereit-zeile .fo-baum-name')].map((n) => n.firstChild!.textContent)).toEqual(['BS9 BAUA 261110 01 Bauantrag.pdf', 'Lageplan vom Vermesser.pdf']);
    expect(kopf()).toContain('0 von 2 bereit');

    // falscher Name: kann nicht bereit sein
    const falsch = zeile('Lageplan vom Vermesser.pdf');
    expect(falsch.classList.contains('name')).toBe(true);
    expect(falsch.querySelector<HTMLButtonElement>('.fo-bereit-knopf')!.disabled).toBe(true);
    expect(falsch.textContent).toContain('Namensformat passt nicht');

    // von Hand bereit: steht in der Projektdatei (je Fassung)
    await klick(zeile('Bauantrag.pdf').querySelector<HTMLButtonElement>('.fo-bereit-knopf')!);
    expect(kopf()).toContain('1 von 2 bereit');
    expect(zeile('Bauantrag.pdf').querySelector('.fo-bereit-knopf')!.getAttribute('aria-pressed')).toBe('true');
    expect((antragIn('BAUA 2')!.bereit as { datei: string }[]).map((b) => b.datei)).toEqual(['BS9 BAUA 261110 01 Bauantrag.pdf']);

    // Umbenennen nach Namensformat: Vorschlag mit Kürzel, Antragsart und Datum
    await rechtsklick(falsch.querySelector('.fo-baum-zeile')!);
    await klick(menuePunkt('Umbenennen nach Namensformat'));
    const feld = host.querySelector<HTMLInputElement>('.modal.rf input')!;
    expect(feld.value).toMatch(/^BS9 BAUA \d{6} Lageplan vom Vermesser\.pdf$/);
    await klick(knopf(host.querySelector('.modal.rf')!, 'Umbenennen'));
    expect([...ds.dateien.keys()].some((k) => /\/TÖB\/BAUA 2\/BS9 BAUA \d{6} Lageplan vom Vermesser\.pdf$/.test(k))).toBe(true);
    expect(zeile('Lageplan vom Vermesser.pdf').classList.contains('offen')).toBe(true);
    await klick(zeile('Lageplan vom Vermesser.pdf').querySelector<HTMLButtonElement>('.fo-bereit-knopf')!);
    expect(kopf()).toContain('2 von 2 bereit');
    expect(kopf()).toContain('Alles bereit');

    // zurück zur Ordneransicht
    await klick(knopf(host, 'Ordner'));
    expect(host.querySelector('.fo-antrag-ablage')).toBeNull();
  });
});

describe('Projektordner, Ansicht „Antrag“: Quick-Add für Dateien ohne Dokument im Antragsumfang', () => {
  const BSK = 'BS9 BAUA 261110 07 Brandschutzkonzept.pdf';
  const AUFNEHMEN = 'Als neues Dokument aufnehmen: „Brandschutzkonzept“';
  const zeileIn = (host: HTMLElement, name: string) => [...host.querySelectorAll<HTMLElement>('.fo-antrag-ablage .fo-bereit-zeile')].find((z) => z.textContent?.includes(name))!;
  const punktGenau = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.menue-punkt')].find((b) => b.querySelector('.menue-text')?.textContent === text)!;
  const umfangVon = (fassung: string) => (antragIn(fassung)?.umfang ?? []) as { id: string; titel: string; art: string; nr?: string; dateien?: Record<string, string> }[];
  const taste = async (key: string) => act(async () => void (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
  const mitUmfang = async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/${BSK}`, new Uint8Array([1]));
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/Statik Teil 1.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    await klick(knopfGenau(host, 'Antrag'));
    return host;
  };

  it('ohne Antragsumfang kein Quick-Add, kein „nicht im Antragsumfang“, kein Platzhalter', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/${BSK}`, new Uint8Array([1]));
    const host = await projektBS9();
    await klick(knopfGenau(host, 'Antrag'));
    expect(zeileIn(host, 'Brandschutzkonzept').querySelector('.fo-aufnehmen, .fo-aufnehmen-platz')).toBeNull();
    expect(zeileIn(host, 'Brandschutzkonzept').textContent).not.toContain('nicht im Antragsumfang');
  });

  it('als neues Dokument aufnehmen: Titel und Nr. aus dem Namen, verknüpft für die Fassung, mit Meldung', async () => {
    const host = await mitUmfang();
    const zeile = () => zeileIn(host, 'Brandschutzkonzept');
    expect(zeile().querySelector('.fo-bereit-unter')!.textContent).toBe('nicht im Antragsumfang');
    expect(zeile().querySelector<HTMLElement>('.fo-baum-zeile')!.title).toContain(`${BSK} – nicht im Antragsumfang`);
    const plus = zeile().querySelector<HTMLButtonElement>('.fo-aufnehmen')!;
    expect(plus.getAttribute('aria-label')).toBe(`${BSK} in den Antragsumfang aufnehmen`);
    expect(plus.getAttribute('aria-haspopup')).toBe('menu');
    expect(plus.getAttribute('aria-expanded')).toBe('false');
    expect(plus.title).toBe('Nicht im Antragsumfang – als neues Dokument aufnehmen oder mit einem fehlenden verknüpfen');
    expect(zeile().querySelector('.fo-aufnehmen-platz')).toBeNull();
    await klick(plus);
    // meldet „aufgeklappt“, solange sein Menü offen ist
    expect(plus.getAttribute('aria-expanded')).toBe('true');
    // voller Text auch als Tooltip (wird ein langer Titel gekürzt)
    expect(punktGenau(AUFNEHMEN).title).toBe(AUFNEHMEN);
    await klick(punktGenau(AUFNEHMEN));
    for (let i = 0; i < 4; i++) await warte();
    expect(umfangVon('BAUA 2').filter((u) => u.titel === 'Brandschutzkonzept')).toEqual([expect.objectContaining({ art: 'extern', nr: '07', dateien: { 'BAUA 2': BSK } })]);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: `„Brandschutzkonzept“ in den Antragsumfang von BAUA 2 aufgenommen – verknüpft mit „${BSK}“.` });
    // jetzt zugeordnet: der Titel steht unter dem Namen, statt des + ein Platzhalter (Zeitspalte bündig)
    expect(zeile().querySelector('.fo-bereit-unter')!.textContent).toBe('Brandschutzkonzept');
    expect(zeile().querySelector('.fo-aufnehmen')).toBeNull();
    expect(zeile().querySelector('.fo-aufnehmen-platz')!.getAttribute('aria-hidden')).toBe('true');
    expect(useAntrag.getState().dokumente.find((d) => d.eintrag.titel === 'Brandschutzkonzept')?.datei?.pfad).toBe(BSK);
  });

  it('mit einem fehlenden Dokument verknüpfen – aus dem Kontextmenü der Zeile, mit Meldung', async () => {
    const host = await mitUmfang();
    // verknüpfen lassen sich nur Dokumente ohne Datei, kein Plansatz
    const ohneDatei = useAntrag.getState().dokumente.filter((d) => d.status !== 'entfaellt' && !d.plansatz && !d.datei);
    expect(ohneDatei.length).toBeGreaterThan(0);
    const ziel = ohneDatei[0].eintrag;
    await rechtsklick(zeileIn(host, 'Statik Teil 1.pdf').querySelector('.fo-baum-zeile')!);
    expect(punktGenau('Als neues Dokument aufnehmen: „Statik Teil 1“')).toBeTruthy();
    await klick(punktGenau('Mit fehlendem Dokument verknüpfen'));
    const angeboten = [...document.querySelectorAll('.menue-punkt .menue-text')].map((t) => t.textContent);
    for (const d of ohneDatei) expect(angeboten).toContain(d.eintrag.titel);
    expect(useAntrag.getState().dokumente.filter((d) => d.plansatz).every((d) => !angeboten.includes(d.eintrag.titel))).toBe(true);
    await klick(punktGenau(ziel.titel));
    for (let i = 0; i < 4; i++) await warte();
    expect(umfangVon('BAUA 2').find((u) => u.id === ziel.id)!.dateien).toEqual({ 'BAUA 2': 'Statik Teil 1.pdf' });
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: `„Statik Teil 1.pdf“ mit „${ziel.titel}“ verknüpft.` });
    expect(zeileIn(host, 'Statik Teil 1.pdf').querySelector('.fo-aufnehmen')).toBeNull();
    // der Name passt nicht zum Format (das steht unter dem Namen) – die Zuordnung nennt der Tooltip
    expect(zeileIn(host, 'Statik Teil 1.pdf').querySelector<HTMLElement>('.fo-baum-zeile')!.title).toContain(`Statik Teil 1.pdf – ${ziel.titel}`);
  });

  it('Tastatur: Enter öffnet das Untermenü mit Fokus darin, ↓ bleibt dort, ← führt zurück – kein falsches Aufnehmen', async () => {
    const host = await mitUmfang();
    await klick(zeileIn(host, 'Statik Teil 1.pdf').querySelector<HTMLButtonElement>('.fo-aufnehmen')!);
    // Fokus auf dem ersten Punkt; ↓ zum Untermenü-Punkt, Enter (ohne Maus: detail 0) öffnet es
    expect(document.activeElement?.textContent).toContain('Als neues Dokument aufnehmen');
    await taste('ArrowDown');
    const eltern = punktGenau('Mit fehlendem Dokument verknüpfen');
    expect(document.activeElement).toBe(eltern);
    await act(async () => void eltern.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));
    const unter = () => [...document.querySelectorAll<HTMLButtonElement>('.menue .menue .menue-punkt')];
    expect(unter().length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(unter()[0]);
    expect(eltern.getAttribute('aria-expanded')).toBe('true');
    // ↓ wandert im Untermenü (nicht im Hauptmenü)
    await taste('ArrowDown');
    expect(unter()).toContain(document.activeElement);
    // ← zurück zum Punkt im Hauptmenü, das Untermenü schließt
    await taste('ArrowLeft');
    expect(document.activeElement).toBe(punktGenau('Mit fehlendem Dokument verknüpfen'));
    expect(unter().length).toBe(0);
    // → öffnet es wieder, Esc führt zurück (das Menü bleibt offen)
    await taste('ArrowRight');
    expect(document.activeElement).toBe(unter()[0]);
    await taste('Escape');
    expect(document.querySelector('.menue')).not.toBeNull();
    expect(document.activeElement).toBe(punktGenau('Mit fehlendem Dokument verknüpfen'));
  });

  it('Menü in BAUA 2 offen, dann zeigt das Projekt BAUA: nichts aufgenommen, mit Grund', async () => {
    const host = await mitUmfang();
    const vorher = umfangVon('BAUA 2').length;
    await klick(zeileIn(host, 'Brandschutzkonzept').querySelector<HTMLButtonElement>('.fo-aufnehmen')!);
    await act(() => useAntrag.getState().fassungWaehlen('BAUA'));
    for (let i = 0; i < 4; i++) await warte();
    await klick(punktGenau(AUFNEHMEN));
    for (let i = 0; i < 4; i++) await warte();
    expect(umfangVon('BAUA 2').length).toBe(vorher);
    expect(umfangVon('BAUA').some((u) => u.titel === 'Brandschutzkonzept')).toBe(false);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht aufgenommen – inzwischen ist Antrag BAUA angezeigt.' });
  });

  it('eingereicht bzw. ein Antrag wird geöffnet: Quick-Add gesperrt, mit Grund – Knopf und Kontextmenü', async () => {
    const host = await mitUmfang();
    const plus = () => zeileIn(host, 'Brandschutzkonzept').querySelector<HTMLButtonElement>('.fo-aufnehmen')!;
    // wird geöffnet (die Liste gehört noch zu einer anderen Fassung)
    act(() => useAntrag.setState({ dokumenteFuer: 'BAUA' }));
    expect(plus().disabled).toBe(true);
    expect(plus().title).toBe('Der Antrag wird gerade geöffnet – gleich wieder möglich');
    act(() => useAntrag.setState({ dokumenteFuer: 'BAUA 2' }));
    expect(plus().disabled).toBe(false);
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-12' }));
    await warte();
    expect(plus().disabled).toBe(true);
    expect(plus().title).toBe('Der Antrag ist eingereicht und gesperrt – der Antragsumfang bleibt, wie er ist');
    await rechtsklick(zeileIn(host, 'Brandschutzkonzept').querySelector('.fo-baum-zeile')!);
    const punkt = punktGenau(AUFNEHMEN);
    expect(gesperrt(punkt)).toBe(true);
    expect(punkt.textContent).toContain('Antrag eingereicht');
    expect(gesperrt(punktGenau('Mit fehlendem Dokument verknüpfen'))).toBe(true);
    // gesperrt (aria-disabled): das gemeinsame Menü klappt sein Untermenü auch beim Überfahren nicht auf
    act(() => void punktGenau('Mit fehlendem Dokument verknüpfen').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(document.querySelector('.menue .menue')).toBeNull();
    // auch direkt im Store nichts aufgenommen (Sperre)
    const vorher = umfangVon('BAUA 2').length;
    await act(async () => void (await useAntrag.getState().dateiAufnehmen(BSK, { titel: 'Brandschutzkonzept', ansicht: 'BAUA 2' })));
    expect(umfangVon('BAUA 2').length).toBe(vorher);
  });

  it('gleich nach einem Projektwechsel (noch keine Ansicht): Grund „kein Antragsumfang“, nie „Antrag undefined“', async () => {
    await mitUmfang();
    act(() => useAntrag.setState({ projektdatei: null }));
    const info = await act(() => useAntrag.getState().dateiAufnehmen(BSK, { titel: 'Brandschutzkonzept', ansicht: 'BAUA 2' }));
    expect(info.vorab).toBe('umfang');
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht aufgenommen – inzwischen gibt es keinen Antragsumfang mehr.' });
  });

  it('ohne Dokumente ohne Datei: nur „aufnehmen“ im Menü und im Tooltip', async () => {
    const host = await mitUmfang();
    // alle Dokumente ohne Datei entfernen
    await act(() => useAntrag.getState().umfangAendern((u) => u.filter((x) => useAntrag.getState().dokumente.some((d) => d.eintrag.id === x.id && (d.datei || d.plansatz)))));
    for (let i = 0; i < 4; i++) await warte();
    const plus = zeileIn(host, 'Brandschutzkonzept').querySelector<HTMLButtonElement>('.fo-aufnehmen')!;
    expect(plus.title).toBe('Nicht im Antragsumfang – als neues Dokument aufnehmen');
    await klick(plus);
    expect(punktGenau(AUFNEHMEN)).toBeTruthy();
    expect(punktGenau('Mit fehlendem Dokument verknüpfen')).toBeUndefined();
  });

  it('im angezeigten Stand schon verknüpft (z. B. doppelter Klick): kein zweiter Eintrag, nichts geschrieben, mit Meldung', async () => {
    await mitUmfang();
    const erster = await act(() => useAntrag.getState().dateiAufnehmen(BSK, { titel: 'Brandschutzkonzept', ansicht: 'BAUA 2' }));
    expect(erster.geschrieben).toBe(true);
    const bytes = ds.dateien.get(OAP);
    const zweiter = await act(() => useAntrag.getState().dateiAufnehmen(BSK, { titel: 'Brandschutz', ansicht: 'BAUA 2' }));
    expect(zweiter).toEqual({ grund: 'schon mit „Brandschutzkonzept“ verknüpft' });
    expect(ds.dateien.get(OAP)).toBe(bytes);
    expect(umfangVon('BAUA 2').filter((u) => u.dateien?.['BAUA 2'] === BSK).map((u) => u.titel)).toEqual(['Brandschutzkonzept']);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: `Nicht aufgenommen – „${BSK}“ ist schon mit „Brandschutzkonzept“ verknüpft.` });
  });
});

describe('Sammelprojekt: Formulare aus dem Unterordner des aktiven Antrags und der obersten Ebene', () => {
  const UNTER = 'BS9/2. BAUA/002-Bauantrag (2026).frmsjf';
  const gruppen = (host: HTMLElement) => [...host.querySelectorAll('.nav-gruppe')].map((g) => g.textContent);
  // Formulare einer Liste – die Gruppe über ihre Überschrift (aria-labelledby), ohne Gruppen über das aria-label
  const namenIn = (host: HTMLElement, gruppe: string) => {
    const kopf = [...host.querySelectorAll('.nav-gruppe')].find((g) => g.textContent === gruppe);
    const liste = kopf ? host.querySelector(`.nav-liste[aria-labelledby="${kopf.id}"]`) : host.querySelector(`.nav-liste[aria-label="${gruppe}"]`);
    return liste ? [...liste.querySelectorAll('.nav-eintrag:not(.fehlt) .nav-text')].map((t) => t.textContent) : null;
  };
  const sammelprojekt = () => {
    ds.dateien.set(`C:/FORMA/${UNTER}`, MUSTER);
    // Unterordner eines anderen Antrags: nur, wenn er aktiv ist
    ds.dateien.set('C:/FORMA/BS9/BAUA/005-Altantrag.frmsjf', MUSTER);
    // kein Antrag: bleibt unbeachtet
    ds.dateien.set('C:/FORMA/BS9/Vorlagen/009-Entwurf.frmsjf', MUSTER);
  };

  it('zeigt den Unterordner des aktiven Antrags („2. BAUA“ zu BAUA 2) und die oberste Ebene – andere Anträge nicht', async () => {
    sammelprojekt();
    const host = await projektBS9();
    await warte();
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA 2');
    expect(gruppen(host)).toEqual(['Antrag BAUA 2 · Unterordner 2. BAUA', 'Alle Anträge · oberste Ebene']);
    expect(namenIn(host, 'Antrag BAUA 2 · Unterordner 2. BAUA')).toEqual(['002-Bauantrag (2026)']);
    expect(namenIn(host, 'Alle Anträge · oberste Ebene')).toEqual(['001-Muster']);
    // beide Gruppen in einem Rollbereich
    expect(host.querySelectorAll('.nav-gruppen').length).toBe(1);
    expect(host.textContent).not.toContain('005-Altantrag');
    expect(host.textContent).not.toContain('009-Entwurf');
    expect(useFormulare.getState().sammel).toEqual({ unterordner: '2. BAUA', alle: expect.arrayContaining(['2. BAUA', 'BAUA']) });
    expect(useFormulare.getState().sammel!.alle).toHaveLength(2);
    // „+“ nennt das Ziel neuer Formulare
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Formular hinzufügen …"]')!.title).toContain('neue entstehen in 2. BAUA');
    // das Formular im Unterordner öffnet sich wie jedes andere
    await klick(knopf(host, '002-Bauantrag (2026)'));
    expect(useFormulare.getState().offen?.pfad).toBe(UNTER);
  });

  it('anderer Antrag aktiv: dessen Unterordner („eigener“, wenn er so heißt); ohne Unterordner: Hinweis, nur die oberste Ebene', async () => {
    sammelprojekt();
    const host = await projektBS9();
    await warte();
    await act(() => useAntrag.getState().fassungWaehlen('BAUA'));
    for (let i = 0; i < 3; i++) await warte();
    expect(gruppen(host)).toEqual(['Antrag BAUA · eigener Unterordner', 'Alle Anträge · oberste Ebene']);
    expect(namenIn(host, 'Antrag BAUA · eigener Unterordner')).toEqual(['005-Altantrag']);
    expect(host.textContent).not.toContain('002-Bauantrag (2026)');
    // ein neuer Antrag ohne eigenen Unterordner: Hinweis, keine leere Liste
    ds.ordner.add(`${PROJEKT}/TÖB/BAUA 3`);
    await act(() => useAntrag.getState().fassungWaehlen('BAUA 3'));
    for (let i = 0; i < 3; i++) await warte();
    expect(gruppen(host)[0]).toBe('Antrag BAUA 3 · kein eigener Unterordner');
    expect(host.textContent).toContain('Neue Formulare entstehen auf der obersten Ebene.');
    expect(host.textContent).toMatch(/Vorhanden: (2\. BAUA, BAUA|BAUA, 2\. BAUA)/);
    // keine leere Liste unter der Überschrift
    expect(namenIn(host, 'Antrag BAUA 3 · kein eigener Unterordner')).toBeNull();
    expect(namenIn(host, 'Alle Anträge · oberste Ebene')).toEqual(['001-Muster']);
    expect(useFormulare.getState().sammel?.unterordner).toBeNull();
  });

  it('oberste Ebene ohne Zuordnung im aktiven Antrag: trotzdem eine Ampel, mit Hinweis', async () => {
    sammelprojekt();
    ds.dateien.set('C:/FORMA/BS9/004-Baubeschreibung (2026).frmsjf', MUSTER);
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    for (let i = 0; i < 3; i++) await warte();
    const punkt = (name: string) => knopf(host, name).querySelector<HTMLElement>('.nav-symbol .st-punkt');
    // die Baubeschreibung ist keinem Dokument zugeordnet: Ampel aus dem Füllstand (3 von 5 – unvollständig)
    expect(useAntrag.getState().dokumente.some((d) => d.formular?.pfad === 'BS9/004-Baubeschreibung (2026).frmsjf')).toBe(false);
    expect(punkt('004-Baubeschreibung')!.className).toBe('st-punkt unvollstaendig neben');
    expect(punkt('004-Baubeschreibung')!.title).toBe('nicht im Antragsumfang von BAUA 2 · nicht vollständig ausgefüllt');
    expect(knopf(host, '004-Baubeschreibung').title).toContain('nicht im Antragsumfang von BAUA 2');
    // zugeordnete behalten ihre Ampel ohne Hinweis (oberste Ebene und Unterordner)
    expect(punkt('001-Muster')!.title).not.toContain('nicht im Antragsumfang');
    expect(punkt('001-Muster')!.className).not.toContain('neben');
    expect(punkt('002-Bauantrag (2026)')!.title).not.toContain('nicht im Antragsumfang');
  });

  it('Ampel der obersten Ebene folgt dem aktiven Antrag: zugeordnet in BAUA – dort ohne Hinweis, in BAUA 2 blass', async () => {
    sammelprojekt();
    ds.dateien.set('C:/FORMA/BS9/004-Baubeschreibung (2026).frmsjf', MUSTER);
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await act(() =>
      useFormulare.getState().oapAendern((roh) => {
        const f = roh.formulare as { antraege: Record<string, Record<string, unknown>> };
        f.antraege.BAUA = { ...f.antraege.BAUA, umfang: [{ id: 'bb', titel: 'Baubeschreibung', art: 'intern', formularDatei: '004-Baubeschreibung (2026).frmsjf' }] };
        return roh;
      }),
    );
    await act(() => useAntrag.getState().laden());
    for (let i = 0; i < 3; i++) await warte();
    const punkt = () => knopf(host, '004-Baubeschreibung').querySelector<HTMLElement>('.nav-symbol .st-punkt')!;
    expect(punkt().className).toContain('neben');
    await klick(host.querySelector<HTMLButtonElement>('.an-fassung-knopf')!);
    await klick(menuePunkt('BAUA'));
    for (let i = 0; i < 3; i++) await warte();
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA');
    expect(punkt().className).not.toContain('neben');
    expect(punkt().title).not.toContain('nicht im Antragsumfang');
  });

  it('gewöhnliches Projekt: ein nicht zugeordnetes Formular bekommt keine Ampel', async () => {
    ds.dateien.set('C:/FORMA/BS9/004-Baubeschreibung (2026).frmsjf', MUSTER);
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    for (let i = 0; i < 3; i++) await warte();
    expect(knopf(host, '001-Muster').querySelector('.st-punkt')).not.toBeNull();
    expect(knopf(host, '004-Baubeschreibung').querySelector('.st-punkt')).toBeNull();
    expect(useAntrag.getState().stammStatus).toEqual({});
  });

  it('gewöhnliches Projekt (ohne Antrags-Unterordner): eine Liste wie bisher, keine Gruppen', async () => {
    ds.dateien.set('C:/FORMA/BS9/Vorlagen/009-Entwurf.frmsjf', MUSTER);
    const host = await projektBS9();
    await warte();
    expect(gruppen(host)).toEqual([]);
    expect(namenIn(host, 'Formulare')).toEqual(['001-Muster']);
    expect(useFormulare.getState().sammel).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Formular hinzufügen …"]')!.title).not.toContain('neue entstehen');
  });

  it('gleicher Name im Unterordner und auf der obersten Ebene: der Antragsumfang findet das im Unterordner – auch nach dem Export', async () => {
    sammelprojekt();
    ds.dateien.set('C:/FORMA/BS9/003-Bauantrag.frmsjf', MUSTER);
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    for (let i = 0; i < 3; i++) await warte();
    const formularVonBauantrag = () => useAntrag.getState().dokumente.find((d) => d.eintrag.id === 'bauantrag')?.formular?.pfad;
    expect(formularVonBauantrag()).toBe(UNTER);
    // der Export merkt sich den Pfad ab dem Formularprojekt – nicht nur den Dateinamen
    const ziel = exportVorschlag(UNTER);
    await act(() => useAntrag.getState().exportieren(UNTER, ziel, false));
    for (let i = 0; i < 3; i++) await warte();
    expect(useAntrag.getState().projektdatei?.umfang?.find((u) => u.id === 'bauantrag')?.formularDatei).toBe('2. BAUA/002-Bauantrag (2026).frmsjf');
    expect(formularVonBauantrag()).toBe(UNTER);
    // im Menü „Vorhandenes Formular zuordnen“ steht der Unterordner als Hinweis
    expect(formularePunkte('bauantrag').find((p) => !p.trenner && p.text === '002-Bauantrag (2026)')).toMatchObject({ hinweis: 'in 2. BAUA' });
  });

  it('„Antragsdokument“ im Menü eines Formulars im Unterordner: zugeordnet mit dem Pfad ab dem Formularprojekt', async () => {
    sammelprojekt();
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    for (let i = 0; i < 3; i++) await warte();
    await rechtsklick(knopf(host, '002-Bauantrag (2026)'));
    await klick(menuePunkt('Antragsdokument'));
    await klick([...document.querySelectorAll<HTMLButtonElement>('.menue .menue .menue-punkt')].find((b) => b.textContent?.includes('Musterformular'))!);
    for (let i = 0; i < 3; i++) await warte();
    expect(useAntrag.getState().projektdatei?.umfang?.find((u) => u.id === 'muster')?.formularDatei).toBe('2. BAUA/002-Bauantrag (2026).frmsjf');
  });

  it('Größe und Zeit gelten je Pfad: „zuletzt bearbeitet“ und Status auch für ein Formular im Unterordner', async () => {
    sammelprojekt();
    const zeit = new Date('2026-11-10T09:30').getTime();
    ds.geaendert.set(`C:/FORMA/${UNTER}`, zeit);
    // gleicher Name auf der obersten Ebene, andere Zeit – darf nicht gelten
    ds.dateien.set('C:/FORMA/BS9/002-Bauantrag (2026).frmsjf', MUSTER);
    ds.geaendert.set('C:/FORMA/BS9/002-Bauantrag (2026).frmsjf', new Date('2026-01-01T08:00').getTime());
    await projektBS9();
    await warte();
    await act(() => useAntrag.getState().aktualisieren());
    expect(useAntrag.getState().formularInfo[UNTER]?.letzteAenderung).toBe(zeit);
    // geändert (etwa in FORMA): die neue Zeit gilt nach dem Neu-Prüfen
    const spaeter = new Date('2026-11-12T14:00').getTime();
    ds.geaendert.set(`C:/FORMA/${UNTER}`, spaeter);
    await act(() => useAntrag.getState().aktualisieren());
    expect(useAntrag.getState().formularInfo[UNTER]?.letzteAenderung).toBe(spaeter);
  });

  it('Formular anlegen: im Unterordner des Antrags, für den angelegt wird; zugeordnet mit dem Pfad ab dem Formularprojekt', async () => {
    ds.ordner.add('C:/FORMA/BS9/02 BAUA');
    ds.ordner.add('C:/FORMA/BS9/BAUA');
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    for (let i = 0; i < 3; i++) await warte();
    expect(useFormulare.getState().sammel?.unterordner).toBe('02 BAUA');
    // Ziel aus der Fassung des Klicks – auch, wenn inzwischen ein anderer Antrag aktiv ist
    const projekt = useFormulare.getState().projekt!;
    expect(formularOrdner(useFormulare.getState(), projekt, 'BAUA')).toBe('BS9/BAUA');
    expect(formularOrdner(useFormulare.getState(), projekt, 'BAUA 2')).toBe('BS9/02 BAUA');
    expect(formularOrdner(useFormulare.getState(), projekt, 'BAUA 7')).toBe('BS9');
    const fehlt = host.querySelector<HTMLButtonElement>('.nav-eintrag.fehlt')!;
    expect(fehlt.title).toContain('klicken, um das Formular in 02 BAUA anzulegen');
    await klick(fehlt);
    for (let i = 0; i < 3; i++) await warte();
    expect(ds.dateien.has('C:/FORMA/BS9/02 BAUA/002-Bauantrag (2026).frmsjf')).toBe(true);
    expect(ds.dateien.has('C:/FORMA/BS9/002-Bauantrag (2026).frmsjf')).toBe(false);
    expect(useAntrag.getState().projektdatei?.umfang?.find((u) => u.id === 'bauantrag')?.formularDatei).toBe('02 BAUA/002-Bauantrag (2026).frmsjf');
    expect(useFormulare.getState().offen?.pfad).toBe('BS9/02 BAUA/002-Bauantrag (2026).frmsjf');
    expect(namenIn(host, 'Antrag BAUA 2 · Unterordner 02 BAUA')).toEqual(['002-Bauantrag (2026)']);
  });

  it('Lesen der Liste überholt: ein noch für den alten Antrag begonnenes, später fertiges setzt seinen Stand nicht', async () => {
    sammelprojekt();
    await projektBS9();
    await warte();
    // das Lesen des Unterordners von BAUA 2 hängt
    const echt = ds.liste.bind(ds);
    let los!: () => void;
    const tor = new Promise<void>((r) => (los = r));
    let anhalten = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (anhalten && pfad.endsWith('/2. BAUA')) await tor;
      return echt(pfad, tiefe);
    };
    try {
      let alt!: Promise<boolean>;
      act(() => {
        alt = useFormulare.getState().formulareNeuLesen();
      });
      await warte();
      anhalten = false;
      await act(() => useAntrag.getState().fassungWaehlen('BAUA'));
      for (let i = 0; i < 3; i++) await warte();
      expect(useFormulare.getState().sammel?.unterordner).toBe('BAUA');
      los();
      await act(async () => void (await alt));
      await warte();
    } finally {
      ds.liste = echt;
    }
    expect(useFormulare.getState().sammel?.unterordner).toBe('BAUA');
    expect(useFormulare.getState().formulare.map((f) => f.name)).toContain('005-Altantrag');
    expect(useFormulare.getState().formulare.map((f) => f.name)).not.toContain('002-Bauantrag (2026)');
  });

  it('Sperren: auch die im Unterordner des aktiven Antrags', async () => {
    sammelprojekt();
    ds.dateien.set('C:/FORMA/BS9/2. BAUA/002-Bauantrag (2026).frmtmp', new Uint8Array([1]));
    await projektBS9();
    await warte();
    const sperren = await act(() => useFormulare.getState().sperrenAuflisten());
    expect(sperren.map((x) => x.pfad)).toContain('BS9/2. BAUA/002-Bauantrag (2026).frmtmp');
  });
});

describe('Antragsunterlagen ansehen und alle Formulare exportieren', () => {
  it('Archivordner werden beim Sammel-Export ausgelassen', () => {
    expect(istArchiv('BS9/_archiv/003-Alt.frmsjf')).toBe(true);
    expect(istArchiv('BS9/Archiv/003-Alt.frmsjf')).toBe(true);
    expect(istArchiv('BS9/003-Archivierung.frmsjf')).toBe(false);
    expect(istArchiv('BS9/001-Bauantrag.frmsjf')).toBe(false);
  });

  it('Vorschau: alle Unterlagen der aktiven Fassung durchblättern, zoomen, Esc schließt', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/A Notiz.txt`, new Uint8Array([1]));
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/B Foto.png`, new Uint8Array([1]));
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/C Liste.txt`, new Uint8Array([1]));
    const host = await projektBS9();
    await klick(knopfGenau(host, 'Antrag'));
    await klick(knopf(host.querySelector('.fo-antrag-ablage')!, 'Ansehen'));
    // die Vorschau hängt per Portal an <body>
    const ebene = () => document.querySelector('.vs-ebene');
    const zaehler = () => ebene()!.querySelector('.vs-zaehler')!.textContent;
    expect(zaehler()).toBe('1 / 3');
    expect(ebene()!.querySelector('.vs-name')!.textContent).toBe('A Notiz.txt');
    expect(ebene()!.textContent).toContain('keine Vorschau');
    const taste = (key: string) => act(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    taste('ArrowRight');
    await warte();
    expect(zaehler()).toBe('2 / 3');
    expect(ebene()!.querySelector('.vs-bild')).not.toBeNull();
    await klick(ebene()!.querySelector<HTMLButtonElement>('[aria-label="Nächstes Dokument"]')!);
    expect(zaehler()).toBe('3 / 3');
    expect(ebene()!.querySelector<HTMLButtonElement>('[aria-label="Nächstes Dokument"]')!.disabled).toBe(true);
    // Liste links springt direkt
    await klick([...ebene()!.querySelectorAll<HTMLButtonElement>('.vs-liste button')][0]);
    expect(zaehler()).toBe('1 / 3');
    // Zoom
    const zoom = () => ebene()!.querySelector<HTMLSelectElement>('select[aria-label="Zoom"]')!.value;
    expect(zoom()).toBe('0');
    taste('+');
    taste('+');
    expect(zoom()).toBe('0.75');
    taste('0');
    expect(zoom()).toBe('0');
    taste('Escape');
    expect(ebene()).toBeNull();
  });

  it('Vorschau verhält sich wie ein Dialog: Startfokus auf „Schließen“, nach Esc zurück am Knopf „Ansehen“', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/A Notiz.txt`, new Uint8Array([1]));
    const host = await projektBS9();
    await klick(knopfGenau(host, 'Antrag'));
    const ansehen = knopf(host.querySelector('.fo-antrag-ablage')!, 'Ansehen');
    ansehen.focus();
    await klick(ansehen);
    const ebene = () => document.querySelector<HTMLElement>('.vs-ebene');
    // Klasse „modal“: Startfokus, Fokusfang und Fokusrückgabe aus dialoge.ts
    expect(ebene()!.classList.contains('modal')).toBe(true);
    expect(document.activeElement?.textContent).toBe('Schließen');
    expect(ebene()!.contains(document.activeElement)).toBe(true);
    expect(ebene()!.textContent).toContain('Mit Programm öffnen');
    act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await warte();
    expect(ebene()).toBeNull();
    expect(document.activeElement).toBe(ansehen);
  });

  it('alle Formulare auf einmal als PDF – Archiv ausgenommen; vorhandene ersetzen oder überspringen', async () => {
    ds.dateien.set('C:/FORMA/BS9/002-Zweites.frmsjf', MUSTER);
    ds.dateien.set('C:/FORMA/BS9/_archiv/003-Alt.frmsjf', MUSTER);
    const host = await projektBS9();
    await klick(knopfGenau(host, 'Antrag'));
    await klick(knopf(host.querySelector('.fo-antrag-ablage')!, 'Alle Formulare exportieren'));
    const datum = jjmmtt(new Date());
    const exportiert = () => [...ds.dateien.keys()].filter((k) => k.startsWith(`${PROJEKT}/TÖB/BAUA 2/`) && k.endsWith('.pdf')).map((k) => k.split('/').pop());
    expect(exportiert().sort()).toEqual([`BS9 BAUA ${datum} Muster.pdf`, `BS9 BAUA ${datum} Zweites.pdf`]);
    expect(useFormulare.getState().meldung?.text).toContain('2 von 2 Formularen als PDF nach TÖB/BAUA 2 exportiert');
    // noch einmal: Rückfrage, vorhandene überspringen
    await klick(knopf(host.querySelector('.fo-antrag-ablage')!, 'Alle Formulare exportieren'));
    const dialog = host.querySelector('.modal.rf')!;
    expect(dialog.textContent).toContain('2 Dateien gibt es schon');
    await klick(knopf(dialog, 'Vorhandene überspringen'));
    expect(useFormulare.getState().meldung?.text).toContain('0 von 2 Formularen');
    expect(useFormulare.getState().meldung?.text).toContain('2 vorhandene übersprungen');
  });
});

describe('Anträge: eigene Werte je Antrag, Preset, eingereicht', () => {
  it('ein neuer Antrag übernimmt das Preset – danach unabhängig von Preset und anderen Anträgen', async () => {
    useAntrag.getState().setMerkmalDefinitionen(VORGABE_MERKMALE.map((m) => (m.name === 'Gebäudeklasse' ? { ...m, vorgabe: '3' } : m)));
    const host = await projektBS9();
    // die vorhandenen Anträge entstehen beim ersten Öffnen (aus dem Preset, es gab nichts Projektweites)
    expect(antragIn('BAUA')?.merkmale).toEqual({ Gebäudeklasse: '3' });
    await act(() => useAntrag.getState().merkmalSetzen('Gebäudeklasse', '5'));
    expect(antragIn('BAUA 2')?.merkmale).toEqual({ Gebäudeklasse: '5' });
    expect(antragIn('BAUA')?.merkmale).toEqual({ Gebäudeklasse: '3' });

    // Preset ändern, dann neuen Antrag anlegen: der neue bekommt das neue Preset, die alten bleiben
    useAntrag.getState().setMerkmalDefinitionen(VORGABE_MERKMALE.map((m) => (m.name === 'Gebäudeklasse' ? { ...m, vorgabe: '2' } : m)));
    await warte();
    await klick(host.querySelector<HTMLButtonElement>('.an-fassung-knopf')!);
    await klick(menuePunkt('Neue Fassung „BAUA 3“'));
    expect(antragIn('BAUA 3')?.merkmale).toEqual({ Gebäudeklasse: '2' });
    expect(useAntrag.getState().projektdatei?.merkmale).toEqual({ Gebäudeklasse: '2' });
    expect(antragIn('BAUA 2')?.merkmale).toEqual({ Gebäudeklasse: '5' });

    // zurück zu BAUA 2: dessen Werte
    await klick(host.querySelector<HTMLButtonElement>('.an-fassung-knopf')!);
    await klick(menuePunkt('BAUA 2'));
    expect(useAntrag.getState().projektdatei?.merkmale).toEqual({ Gebäudeklasse: '5' });
  });

  it('Eingangsbestätigung im Ordner des Antrags: eingereicht – im Projekt und auf der Startseite (aktuellster Antrag)', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261103 Eingangsbestätigung.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    expect(antragIn('BAUA 2')?.eingereicht).toEqual({ datei: 'BS9 BAUA 261103 Eingangsbestätigung.pdf', datum: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(antragIn('BAUA')?.eingereicht).toBeUndefined();
    // für die Startseiten aller Apps
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.antrag).toMatchObject({ name: 'BAUA 2', eingereicht: { datei: 'BS9 BAUA 261103 Eingangsbestätigung.pdf' } });
    expect(host.querySelector('.an-eingereicht')!.textContent).toContain('eingereicht');

    // Startseite von PERMIO
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    await klick(knopf(host, 'Wechseln'));
    const karte = host.querySelector('[aria-label="Zuletzt geöffnet"] .pa-karte[data-projekt="BS9"]')!;
    expect(karte.querySelector('.pa-marke.ok')!.textContent).toContain('BAUA 2 · eingereicht');
    await klick(knopf(host, 'Zurück zu BS9'));

    // Datei wieder weg: nicht mehr eingereicht
    ds.dateien.delete(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261103 Eingangsbestätigung.pdf`);
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    expect(antragIn('BAUA 2')?.eingereicht).toBeUndefined();
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.antrag).toEqual({ name: 'BAUA 2', angelegt: expect.any(String) });

    // im Archivordner: zählt nicht
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/_archiv/Eingangsbestätigung alt.pdf`, new Uint8Array([1]));
    // auch tief in Unterordnern – hier im (nicht aktiven) Antrag BAUA
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA/Schriftverkehr/Kreis/Antragsprotokoll Online.pdf`, new Uint8Array([1]));
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    expect(antragIn('BAUA')?.eingereicht).toMatchObject({ datei: 'Schriftverkehr/Kreis/Antragsprotokoll Online.pdf' });
    expect(antragIn('BAUA 2')?.eingereicht).toBeUndefined();
  });

  it('Antragsstand bei der Einreichung: festgehalten (ohne Kopie); danach Hinzugekommenes bzw. Geändertes gekennzeichnet – Bescheid nicht', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261103 Eingangsbestätigung.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    // festgehalten: nur Name, Größe, Änderungszeit
    expect(antragIn('BAUA 2')?.stand).toEqual({
      tag: '2026-11-03',
      dateien: expect.arrayContaining([{ pfad: 'BS9 BAUA 261101 01 Bauantrag.pdf', groesse: 1 }, { pfad: 'BS9 BAUA 261103 Eingangsbestätigung.pdf', groesse: 1 }]),
    });
    // danach: ein neuer Plan, die Baugenehmigung, eine Nachforderung – und der Bauantrag wird geändert
    ds.dateien.set(`${ordner}/BS9 BAUA 261120 GP-03 Ansicht.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261125 Baugenehmigung.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/Nachforderung Kreis.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1, 2, 3]));
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    await klick(knopfGenau(host, 'Antrag'));
    const zeile = (n: string) => [...host.querySelectorAll<HTMLElement>('.fo-bereit-zeile')].find((z) => z.textContent?.includes(n))!;
    expect(zeile('GP-03').querySelector('.fo-seit')!.textContent).toBe('neu');
    expect(zeile('GP-03').querySelector('.fo-seit')!.getAttribute('title')).toBe('neu seit der Einreichung');
    expect(zeile('GP-03').classList.contains('seit-neu')).toBe(true);
    expect(zeile('Bauantrag').querySelector('.fo-seit')!.textContent).toBe('geändert');
    expect(zeile('Baugenehmigung').querySelector('.fo-seit')).toBeNull();
    expect(zeile('Nachforderung').querySelector('.fo-seit')).toBeNull();
    expect(zeile('Eingangsbestätigung').querySelector('.fo-seit')).toBeNull();
    expect(host.querySelector('.fo-stand')!.textContent).toContain('Eingereicht am 03.11.2026 – Stand festgehalten · 1 neu, 1 geändert seit der Einreichung');
    // der Stand bleibt, wie er war – auch nach erneutem Lesen
    expect((antragIn('BAUA 2')?.stand as { dateien: unknown[] }).dateien).toHaveLength(2);
    // wieder in Arbeit (Bestätigung verschoben): keine Kennzeichen mehr – der Stand bleibt aber in der Projektdatei
    ds.dateien.delete(`${ordner}/BS9 BAUA 261103 Eingangsbestätigung.pdf`);
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    expect((antragIn('BAUA 2')?.stand as { tag: string; dateien: unknown[] }).dateien).toHaveLength(2);
    expect(host.querySelector('.fo-stand')).toBeNull();
    expect(host.querySelector('.fo-seit')).toBeNull();
    // wieder eingereicht mit demselben Datum: derselbe Stand gilt – der geänderte Bauantrag bleibt „geändert“
    ds.dateien.set(`${ordner}/BS9 BAUA 261103 Eingangsbestätigung.pdf`, new Uint8Array([1]));
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    expect(zeile('Bauantrag').querySelector('.fo-seit')!.textContent).toBe('geändert');
    // eine eingereichte Datei verschwindet: „entfernt“ in der Summe und darunter mit Namen
    ds.dateien.delete(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`);
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    expect(host.querySelector('.fo-stand')!.textContent).toContain('1 neu, 1 entfernt seit der Einreichung');
    expect(host.querySelector('.fo-stand')!.getAttribute('title')).toContain('BS9 BAUA 261101 01 Bauantrag.pdf');
    expect(host.querySelector('.fo-stand-entfernt')!.textContent).toContain('entfernt BS9 BAUA 261101 01 Bauantrag.pdf');
  });

  it('Antragsstand: viele entfernte Dateien – zwei Namen, der Rest über einen Knopf mit aria-expanded, alle im Tooltip', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    const plaene = [1, 2, 3, 4, 5].map((n) => `BS9 BAUA 261101 GP-0${n} Plan.pdf`);
    for (const n of plaene) ds.dateien.set(`${ordner}/${n}`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261103 Eingangsbestätigung.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    for (const n of plaene.slice(0, 4)) ds.dateien.delete(`${ordner}/${n}`);
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    await klick(knopfGenau(host, 'Antrag'));
    expect(host.querySelector('.fo-stand')!.textContent).toContain('4 entfernt seit der Einreichung');
    for (const n of plaene.slice(0, 4)) expect(host.querySelector('.fo-stand')!.getAttribute('title')).toContain(n);
    const zeilen = () => [...host.querySelectorAll('.fo-stand-entfernt li')].map((l) => l.textContent);
    expect(zeilen()).toHaveLength(3);
    const mehr = host.querySelector<HTMLButtonElement>('.fo-stand-entfernt button.pk-nav-mehr')!;
    expect(mehr.textContent).toBe('2 weitere – zeigen');
    expect(mehr.getAttribute('aria-expanded')).toBe('false');
    await klick(mehr);
    expect(zeilen()).toHaveLength(5);
    expect(host.querySelector('.fo-stand-entfernt button.pk-nav-mehr')!.getAttribute('aria-expanded')).toBe('true');
    expect(zeilen()[4]).toBe('2 weitere – verbergen');
  });

  it('Antragsstand: ein vorübergehender Lesefehler verwirft weder „eingereicht“ noch den festgehaltenen Stand', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261103 Eingangsbestätigung.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await klick(knopfGenau(host, 'Antrag'));
    const vorher = antragIn('BAUA 2')!;
    expect(vorher.stand).toBeDefined();
    // der Ordner des Antrags ist einmal nicht lesbar (z. B. Netz nach dem Aufwachen noch nicht da)
    const liste = ds.liste.bind(ds);
    let einmal = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (einmal && pfad.endsWith('/TÖB/BAUA 2')) {
        einmal = false;
        throw new Error('Netzlaufwerk nicht erreichbar');
      }
      return liste(pfad, tiefe);
    };
    // inzwischen ist eine Datei dazugekommen – sie darf nicht in den Stand rutschen
    ds.dateien.set(`${ordner}/BS9 BAUA 261120 GP-03 Ansicht.pdf`, new Uint8Array([1]));
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    expect(einmal).toBe(false);
    expect(antragIn('BAUA 2')?.eingereicht).toEqual(vorher.eingereicht);
    expect(antragIn('BAUA 2')?.stand).toEqual(vorher.stand);
    // die Ablage sagt, dass der Ordner nicht erreichbar war, zeigt den zuletzt gelesenen Stand und behauptet weder
    // „entfernt“ noch „unverändert“
    expect(host.querySelector('.fo-stand-entfernt')).toBeNull();
    expect(host.querySelector('.fo-stand')!.textContent).not.toContain('entfernt');
    expect(host.querySelector('.fo-stand')!.textContent).not.toContain('unverändert');
    expect(host.querySelector('.fo-stand')!.textContent).toContain('Vergleich mit dem Ordner gerade nicht möglich');
    expect(host.querySelector('.fo-lesefehler')!.textContent).toContain('Ordner gerade nicht erreichbar');
    expect(host.querySelector('.fo-lesefehler')!.textContent).toContain('zuletzt gelesene Stand');
    // nur der Text ist Statusmeldung, nicht der Knopf
    expect(host.querySelector('.fo-lesefehler [role="status"] button')).toBeNull();
    expect(host.querySelector('.fo-bereit-kopf')!.textContent).toContain('0 von 2 bereit');
    // beim nächsten Lesen: weiter derselbe Stand, die neue Datei ist „neu seit der Einreichung“
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    expect(antragIn('BAUA 2')?.stand).toEqual(vorher.stand);
    expect(host.querySelector('.fo-lesefehler')).toBeNull();
    expect(host.querySelector('.fo-stand')!.textContent).toContain('1 neu seit der Einreichung');
  });

  it('Antragsstand: ein späteres Bestätigungsschreiben (anderes Datum) überschreibt den Stand nicht', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261103 Antragsprotokoll.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    expect((antragIn('BAUA 2')?.stand as { tag: string }).tag).toBe('2026-11-03');
    // nach der Einreichung geändert, dann kommt die Eingangsbestätigung der Behörde (jünger)
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1, 2, 3]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261110 Eingangsbestätigung.pdf`, new Uint8Array([1]));
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    await klick(knopfGenau(host, 'Antrag'));
    expect((antragIn('BAUA 2')?.stand as { tag: string }).tag).toBe('2026-11-03');
    expect(host.querySelector('.fo-stand')!.textContent).toContain('Eingereicht am 03.11.2026');
    expect(host.querySelector('.fo-stand')!.textContent).toContain('1 geändert seit der Einreichung');
    // Status und Stand zeigen denselben Tag: den des ersten Nachweises
    expect(antragIn('BAUA 2')?.eingereicht).toMatchObject({ datei: 'BS9 BAUA 261103 Antragsprotokoll.pdf', datum: '2026-11-03' });
    // „in Arbeit“ und zurück auf „automatisch“: derselbe Stand gilt wieder, nichts wird neu festgehalten
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: false }));
    await warte();
    await act(() => useAntrag.getState().statusSetzen(null));
    await warte();
    expect((antragIn('BAUA 2')?.stand as { tag: string; zurueckgesetzt?: true }).tag).toBe('2026-11-03');
    expect((antragIn('BAUA 2')?.stand as { zurueckgesetzt?: true }).zurueckgesetzt).toBeUndefined();
    expect(host.querySelector('.fo-stand')!.textContent).toContain('1 geändert seit der Einreichung');
  });

  it('„Erneut versuchen“: läuft sichtbar, bleibt der Ordner unerreichbar, steht die Zeit des Versuchs da', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261103 Eingangsbestätigung.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await klick(knopfGenau(host, 'Antrag'));
    const liste = ds.liste.bind(ds);
    let gesperrt = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (gesperrt && pfad.endsWith('/TÖB/BAUA 2') && tiefe === 1) throw new Error('Netzlaufwerk nicht erreichbar');
      return liste(pfad, tiefe);
    };
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    const knopf = () => host.querySelector<HTMLButtonElement>('.fo-lesefehler button')!;
    expect(knopf().textContent).toBe('Erneut versuchen');
    await klick(knopf());
    await warte();
    expect(host.querySelector('.fo-lesefehler')!.textContent).toMatch(/Letzter Versuch \d{2}:\d{2}:\d{2} – ohne Erfolg/);
    // der Knopf bleibt fokussierbar (aria-disabled statt disabled, nur während des Versuchs)
    expect(knopf().hasAttribute('disabled')).toBe(false);
    // wieder erreichbar: die Warnung verschwindet
    gesperrt = false;
    await klick(knopf());
    await warte();
    expect(host.querySelector('.fo-lesefehler')).toBeNull();
  });

  it('Antragsstand: ändert sich nur der Tag (älterer Nachweis, Datum von Hand), bleibt der Stand – „entfernt“ geht nicht verloren', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 Lageplan.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261110 Eingangsbestätigung.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await klick(knopfGenau(host, 'Antrag'));
    expect((antragIn('BAUA 2')?.stand as { tag: string }).tag).toBe('2026-11-10');
    // der Lageplan verschwindet, dann taucht das Antragsprotokoll vom 03.11. auf
    ds.dateien.delete(`${ordner}/BS9 BAUA 261101 Lageplan.pdf`);
    ds.dateien.set(`${ordner}/BS9 BAUA 261103 Antragsprotokoll.pdf`, new Uint8Array([1]));
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    const stand = antragIn('BAUA 2')?.stand as { tag: string; dateien: { pfad: string }[] };
    expect(stand.tag).toBe('2026-11-03');
    expect(stand.dateien.map((x) => x.pfad)).toContain('BS9 BAUA 261101 Lageplan.pdf');
    expect(host.querySelector('.fo-stand')!.textContent).toContain('Eingereicht am 03.11.2026');
    expect(host.querySelector('.fo-stand')!.textContent).toContain('1 entfernt');
    // von Hand auf einen späteren Tag: Status und Stand zeigen denselben Tag, die Einträge bleiben
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-12' }));
    await warte();
    expect((antragIn('BAUA 2')?.stand as { tag: string }).tag).toBe('2026-11-12');
    expect(host.querySelector('.fo-stand')!.textContent).toContain('Eingereicht am 12.11.2026');
    expect(host.querySelector('.fo-stand')!.textContent).toContain('1 entfernt');
  });

  it('Datum von Hand: erst beim Verlassen übernommen; ungültig bleibt stehen mit Meldung, Esc verwirft, Enter behält den Fokus', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-03' }));
    await warte();
    await klick(antragsdaten(host));
    // Schreibvorgänge zählen
    const statusSetzen = useAntrag.getState().statusSetzen;
    let schreiben = 0;
    useAntrag.setState({
      statusSetzen: (x) => {
        schreiben++;
        return statusSetzen(x);
      },
    });
    const feld = () => host.querySelector<HTMLInputElement>('input[aria-label="eingereicht am"]')!;
    const tippen = async (wert: string) =>
      act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(feld(), wert);
        feld().dispatchEvent(new Event('input', { bubbles: true }));
      });
    const taste = async (key: string) => act(async () => void feld().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
    const verlassen = async () => {
      await act(async () => void feld().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
      await warte();
    };
    for (const w of ['0002-11-03', '0020-11-03', '0202-11-03']) await tippen(w);
    expect(schreiben).toBe(0);
    // unplausibel verlassen: nichts gespeichert, die Eingabe bleibt rot markiert stehen, die Meldung sagt warum
    await verlassen();
    expect(schreiben).toBe(0);
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: true, datum: '2026-11-03' });
    expect(feld().value).toBe('0202-11-03');
    expect(feld().className).toContain('feld-fehler');
    expect(feld().getAttribute('aria-invalid')).toBe('true');
    const meldung = host.querySelector('#' + feld().getAttribute('aria-describedby'))!;
    expect(meldung.getAttribute('role')).toBe('alert');
    expect(meldung.textContent).toContain('Nur Tage vom 01.01.2000 bis heute');
    expect(meldung.textContent).toContain('Esc im Feld stellt den 03.11.2026 wieder her');
    // die Meldung steht hinter den Knöpfen („Nachtrag … anlegen“, „Stand neu festhalten …“) – die springen nicht
    const kinder = [...host.querySelector('.pu-status-wahl')!.children];
    const gruppe = host.querySelector('.pu-status-knoepfe')!;
    expect(gruppe.querySelectorAll('button')).toHaveLength(2);
    expect(kinder.indexOf(gruppe)).toBeGreaterThanOrEqual(0);
    expect(kinder.indexOf(gruppe)).toBeLessThan(kinder.indexOf(meldung));
    // Esc verwirft die Eingabe
    await taste('Escape');
    expect(feld().value).toBe('2026-11-03');
    expect(host.querySelector('#pu-datum-fehler')).toBeNull();
    // gültig, mit Enter übernommen: einmal geschrieben, dasselbe Feld behält den Fokus; Verlassen schreibt nicht noch einmal
    const vorher = feld();
    vorher.focus();
    await tippen('2026-11-04');
    await taste('Enter');
    await warte();
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: true, datum: '2026-11-04' });
    expect(feld()).toBe(vorher);
    expect(document.activeElement).toBe(vorher);
    await verlassen();
    expect(schreiben).toBe(1);
    expect((antragIn('BAUA 2')?.stand as { dateien: unknown[] }).dateien).toHaveLength(1);
  });

  it('Antragsstand: wird nie neu gebaut – weder nach der Reihenfolge von Dateiaktionen noch bei schnellen Statuswechseln während langsamen Lesens', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 Lageplan.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261103 Antragsprotokoll.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await klick(knopfGenau(host, 'Antrag'));
    const stand = () => antragIn('BAUA 2')?.stand as { tag: string; dateien: { pfad: string }[] };
    expect(stand().dateien.map((x) => x.pfad)).toContain('BS9 BAUA 261101 01 Bauantrag.pdf');
    // (R3) erst der Nachweis ins Archiv (nicht mehr eingereicht), aufgefrischt, dann eine spätere Eingangsbestätigung
    ds.dateien.delete(`${ordner}/BS9 BAUA 261103 Antragsprotokoll.pdf`);
    ds.dateien.set(`${ordner}/_archiv/BS9 BAUA 261103 Antragsprotokoll.pdf`, new Uint8Array([1]));
    ds.dateien.delete(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`);
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    ds.dateien.set(`${ordner}/BS9 BAUA 261110 Eingangsbestätigung.pdf`, new Uint8Array([1]));
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    expect(stand().tag).toBe('2026-11-10');
    expect(stand().dateien.map((x) => x.pfad)).toContain('BS9 BAUA 261101 01 Bauantrag.pdf');
    expect(host.querySelector('.fo-stand')!.textContent).toContain('1 entfernt');
    // (R1) langsames Lesen; „in Arbeit“, gleich wieder „eingereicht“ und das Datum berichtigt, ohne auf das Lesen zu warten
    const liste = ds.liste.bind(ds);
    ds.liste = async (pfad: string, tiefe: number) => {
      await new Promise((r) => setTimeout(r, 30));
      return liste(pfad, tiefe);
    };
    await act(async () => {
      void useAntrag.getState().statusSetzen({ eingereicht: false, datum: '2026-11-10' });
      void useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-10' });
      await useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-11' });
    });
    await act(() => new Promise((r) => setTimeout(r, 400)));
    await warte();
    expect(stand().tag).toBe('2026-11-11');
    expect(stand().dateien.map((x) => x.pfad)).toContain('BS9 BAUA 261101 01 Bauantrag.pdf');
  });

  it('Datum von Hand: schlägt das Speichern fehl, sagt das Feld es – ein erneutes Enter versucht es noch einmal', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-03' }));
    await warte();
    await klick(antragsdaten(host));
    // die Projektdatei ist einmal gesperrt
    const oapAendern = useFormulare.getState().oapAendern;
    let gesperrt = true;
    useFormulare.setState({
      oapAendern: async (f) => {
        if (gesperrt) {
          gesperrt = false;
          throw new Error('Datei gesperrt');
        }
        return oapAendern(f);
      },
    });
    const feld = () => host.querySelector<HTMLInputElement>('input[aria-label="eingereicht am"]')!;
    const tippen = async (wert: string) =>
      act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(feld(), wert);
        feld().dispatchEvent(new Event('input', { bubbles: true }));
      });
    const enter = async () => {
      await act(async () => void feld().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
      await warte();
    };
    await tippen('2026-11-04');
    await enter();
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: true, datum: '2026-11-03' });
    expect(feld().value).toBe('2026-11-04');
    expect(feld().className).toContain('feld-fehler');
    expect(host.querySelector('#' + feld().getAttribute('aria-describedby'))!.textContent).toContain('Tag der Einreichung nicht gespeichert – Enter im Feld versucht es erneut');
    // die Datei ist wieder frei: Enter schreibt
    await enter();
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: true, datum: '2026-11-04' });
    expect(feld().className).not.toContain('feld-fehler');
  });

  it('Stand neu festhalten (nach einem Fehlklick): mit Rückfrage, danach gilt, was jetzt im Ordner liegt', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    // versehentlich „eingereicht“ – weitergearbeitet, dann kommt das echte Antragsprotokoll
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-02' }));
    await warte();
    await act(() => useAntrag.getState().statusSetzen(null));
    await warte();
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1, 2, 3]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 Lageplan.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261110 Antragsprotokoll.pdf`, new Uint8Array([1]));
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    await klick(knopfGenau(host, 'Antrag'));
    // neu: der Lageplan – das Antragsprotokoll vom Tag der Einreichung (10.11.) ist der Nachweis selbst, nicht „neu“
    expect(host.querySelector('.fo-stand')!.textContent).toContain('1 neu, 1 geändert seit der Einreichung');
    // in den Antragsdaten neu festhalten (Rückfrage)
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Stand neu festhalten'));
    const ok = [...document.querySelectorAll<HTMLButtonElement>('.rf .dialog-buttons button')].find((b) => b.textContent === 'Neu festhalten')!;
    await klick(ok);
    await warte();
    const stand = antragIn('BAUA 2')?.stand as { tag: string; dateien: { pfad: string; groesse?: number }[] };
    expect(stand.tag).toBe('2026-11-10');
    expect(stand.dateien.find((x) => x.pfad.includes('Bauantrag'))!.groesse).toBe(3);
    await klick(knopfGenau(host, 'Antrag'));
    expect(host.querySelector('.fo-stand')!.textContent).toContain('seitdem unverändert');
  });

  it('Antragsstand: früher, dann später – was dazwischen herausfiel, ist wieder im Vergleich (umkehrbar)', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 Lageplan.pdf`, new Uint8Array([1]));
    // der Lageplan wurde im Februar geändert (nach dem vertippten 01.01., vor dem richtigen Tag)
    ds.geaendert.set(`${ordner}/BS9 BAUA 261101 Lageplan.pdf`, new Date('2026-02-10T10:00').getTime());
    const host = await projektBS9();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-12' }));
    await warte();
    await klick(knopfGenau(host, 'Antrag'));
    const stand = () => antragIn('BAUA 2')?.stand as { tag: string; dateien: { pfad: string }[] };
    expect(stand().dateien).toHaveLength(2);
    // Tippfehler (früherer Tag): die Einträge bleiben im Stand – der nach dem Tag geänderte Lageplan zählt beim Vergleich
    // nicht dazu und gilt als „neu“ …
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-01-01' }));
    await warte();
    expect(stand().tag).toBe('2026-01-01');
    expect(stand().dateien).toHaveLength(2);
    expect(host.querySelector('.fo-stand')!.textContent).toContain('1 neu');
    // … berichtigt: wieder alles im Vergleich, nichts ging verloren; der gelöschte Lageplan ist „entfernt“
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-12' }));
    await warte();
    ds.dateien.delete(`${ordner}/BS9 BAUA 261101 Lageplan.pdf`);
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    expect(host.querySelector('.fo-stand')!.textContent).toContain('1 entfernt');
  });

  it('Stand neu festhalten: beim Lesefehler gesperrt (alter Stand bleibt); danach Meldung, vorher Geändertes gehört dazu', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 Lageplan.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261103 Antragsprotokoll.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    // nach der Einreichung (03.11.) geändert: der Lageplan am 05.11.
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 Lageplan.pdf`, new Uint8Array([1, 2]));
    ds.geaendert.set(`${ordner}/BS9 BAUA 261101 Lageplan.pdf`, new Date('2026-11-05T10:00').getTime());
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    await klick(antragsdaten(host));
    // Ordner gerade nicht lesbar: der Knopf ist gesperrt (aria-disabled) und tut nichts
    const liste = ds.liste.bind(ds);
    let gesperrt = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (gesperrt && pfad.endsWith('/TÖB/BAUA 2')) throw new Error('Netzlaufwerk nicht erreichbar');
      return liste(pfad, tiefe);
    };
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    const knopfNeu = () => knopf(host, 'Stand neu festhalten');
    expect(knopfNeu().getAttribute('aria-disabled')).toBe('true');
    expect(knopfNeu().title).toContain('Ordner gerade nicht erreichbar');
    await klick(knopfNeu());
    expect(document.querySelector('.rf')).toBeNull();
    // auch direkt aufgerufen: der bisherige Stand bleibt, eine Fehlermeldung sagt warum
    const vorher = antragIn('BAUA 2')?.stand;
    await act(() => useAntrag.getState().standNeuFesthalten());
    expect(antragIn('BAUA 2')?.stand).toEqual(vorher);
    expect(useFormulare.getState().meldung?.text).toContain('nicht lesbar (Netzlaufwerk nicht erreichbar) – der bisherige Stand bleibt');
    // wieder erreichbar: neu festhalten (Rückfrage mit Gefahr-Knopf), Meldung, der geänderte Lageplan gehört dazu
    gesperrt = false;
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    await klick(knopfNeu());
    const ok = [...document.querySelectorAll<HTMLButtonElement>('.rf .dialog-buttons button')].find((b) => b.textContent === 'Neu festhalten')!;
    expect(ok.className).toContain('danger');
    await klick(ok);
    await warte();
    expect(useFormulare.getState().meldung?.text).toBe('Stand von BAUA 2 neu festgehalten – 3 Dateien.');
    // Status und Ablage nennen den (heutigen) Tag des Neu-Festhaltens, nicht nur den der Einreichung
    const heute = tagVon(new Date()).split('-').reverse().join('.');
    expect(host.querySelector('.pu-status-text')!.textContent).toContain(`Stand neu festgehalten am ${heute} (3 Dateien)`);
    await klick(knopfGenau(host, 'Antrag'));
    expect(host.querySelector('.fo-stand')!.textContent).toContain(`Eingereicht am 03.11.2026 – Stand neu festgehalten am ${heute} · seitdem unverändert`);
    expect([...host.querySelectorAll('.fo-bereit-zeile')].find((z) => z.textContent?.includes('Lageplan'))!.querySelector('.fo-seit')).toBeNull();
    // danach Geändertes bzw. Entferntes: durchgängig „seit dem Festhalten“ (Summe, Liste, Etiketten)
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1, 2, 3]));
    ds.geaendert.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, Date.now() + 60_000);
    ds.dateien.delete(`${ordner}/BS9 BAUA 261101 Lageplan.pdf`);
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    expect(host.querySelector('.fo-stand')!.textContent).toContain('1 geändert, 1 entfernt seit dem Festhalten');
    expect(host.querySelector('.fo-stand-entfernt')!.getAttribute('aria-label')).toBe('Entfernt seit dem Festhalten');
    expect(host.querySelector<HTMLElement>('.fo-stand-entfernt .fo-seit')!.title).toBe('entfernt seit dem Festhalten');
    expect([...host.querySelectorAll<HTMLElement>('.fo-seit.geaendert')].map((e) => e.title)).toEqual(['geändert seit dem Festhalten']);
  });

  it('Stand neu festhalten: ändert sich während des Lesens der Status, wird abgebrochen statt Veraltetes zu schreiben', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261103 Antragsprotokoll.pdf`, new Uint8Array([1]));
    await projektBS9();
    const vorher = antragIn('BAUA 2')?.stand;
    // das Lesen hängt, bis wir es freigeben
    const liste = ds.liste.bind(ds);
    let frei!: () => void;
    const halt = new Promise<void>((r) => (frei = r));
    let haengen = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (haengen && pfad.endsWith('/TÖB/BAUA 2') && tiefe > 1) await halt;
      return liste(pfad, tiefe);
    };
    let laeuft!: Promise<void>;
    act(() => {
      laeuft = useAntrag.getState().standNeuFesthalten();
    });
    // währenddessen: zum Nachreichen auf „in Arbeit“
    haengen = false;
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: false, datum: '2026-11-03' }));
    await warte();
    frei();
    await act(() => laeuft);
    await warte();
    // der Status des Nutzers bleibt, der Stand wird nicht ersetzt
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: false, datum: '2026-11-03' });
    expect(antragIn('BAUA 2')?.stand).toEqual(vorher);
    expect(useFormulare.getState().meldung?.text).toContain('Stand neu festhalten abgebrochen');
  });

  /** zweites Projekt mit eigener Projektdatei: H24 (FORMA) mit Projektordner „Z:/Projekte/H24 Hofstraße“ */
  const H24_OAP = 'Z:/Projekte/H24 Hofstraße/Planung/Berechnungen/H24.oap';
  const h24Vorbereiten = () => {
    const p = createProject('Hofstraße');
    p.meta = { ...leereMeta(), projektcode: 'H24' };
    ds.dateien.set(H24_OAP, writeArchive(p));
  };
  const h24Waehlen = async () => {
    const h24 = useFormulare.getState().projekte.find((p) => p.ordner === 'H24')!;
    expect(h24).toBeTruthy();
    await act(() => useFormulare.getState().projektWaehlen(h24));
    await warte();
  };
  /** Liste des Antragsordners BAUA 2 anhalten, bis `frei()` aufgerufen wird */
  const baua2Anhalten = () => {
    const liste = ds.liste.bind(ds);
    let frei!: () => void;
    const halt = new Promise<void>((r) => (frei = r));
    let haengen = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (haengen && pfad.endsWith('/TÖB/BAUA 2') && tiefe > 1) await halt;
      return liste(pfad, tiefe);
    };
    return () => {
      haengen = false;
      frei();
    };
  };

  it('Projektwechsel, während BS9 noch schreibt: die Anträge von BS9 landen nicht in der Projektdatei von H24', async () => {
    h24Vorbereiten();
    await projektBS9();
    // H24: Status von Hand – das darf später nicht verloren gehen
    await h24Waehlen();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-10-01' }));
    await warte();
    const h24 = () => (readProjectFile(ds.dateien.get(H24_OAP)!).formulare as { antraege?: Record<string, Record<string, unknown>> } | undefined)?.antraege;
    expect(h24()?.BAUA?.status).toEqual({ eingereicht: true, datum: '2026-10-01' });
    // zurück zu BS9; das Schreiben der Projektdatei von BS9 hängt einmal – währenddessen wird H24 geöffnet
    await act(() => useFormulare.getState().projektWaehlen(useFormulare.getState().projekte.find((p) => p.ordner === 'BS9')!));
    await warte();
    const ersetzen = ds.projektordner.projektdateiErsetzen.bind(ds.projektordner);
    let los!: () => void;
    let einmal = true;
    ds.projektordner.projektdateiErsetzen = async (...a: Parameters<typeof ersetzen>) => {
      if (einmal && a[1].endsWith('BS9.oap')) {
        einmal = false;
        await new Promise<void>((r) => (los = r));
      }
      return ersetzen(...a);
    };
    let laeuft!: Promise<void>;
    act(() => {
      laeuft = useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-05' });
    });
    await warte();
    expect(los).toBeTruthy();
    await h24Waehlen();
    los();
    await act(() => laeuft);
    await warte();
    // ein späteres Aktualisieren in H24 (Fokus, Takt)
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    expect(useFormulare.getState().projekt?.ordner).toBe('H24');
    expect(Object.keys(h24() ?? {})).toEqual(['BAUA']);
    expect(h24()?.BAUA?.status).toEqual({ eingereicht: true, datum: '2026-10-01' });
    // BS9 hat seinen Status in der eigenen Projektdatei
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: true, datum: '2026-11-05' });
  });

  it('Projektdatei erst während des Ladens gelesen: gespeicherte Angaben werden nicht durch frisch angelegte Anträge ersetzt', async () => {
    await projektBS9();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-03' }));
    await warte();
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: true, datum: '2026-11-03' });
    // schließen und wieder öffnen – die Liste des Antragsordners hängt, bis die Projektdatei gelesen ist
    const bs9 = useFormulare.getState().projekt!;
    await act(() => useFormulare.getState().projektWaehlen(null));
    await warte();
    const liste = ds.liste.bind(ds);
    let frei!: () => void;
    const halt = new Promise<void>((r) => (frei = r));
    ds.liste = async (pfad: string, tiefe: number) => {
      if (pfad.endsWith('/TÖB') && tiefe === 1) await halt;
      return liste(pfad, tiefe);
    };
    act(() => void useFormulare.getState().projektWaehlen(bs9));
    await warte();
    const o = useFormulare.getState().oap;
    expect(o && o !== 'fehlt' ? o.pfad : o).toBe('Planung/Berechnungen/BS9.oap');
    frei();
    await warte();
    await warte();
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: true, datum: '2026-11-03' });
    expect(useAntrag.getState().projektdatei?.antraege?.['BAUA 2']?.status).toEqual({ eingereicht: true, datum: '2026-11-03' });
  });

  it('andere Projektdatei gewählt, während noch gelesen wird: die Angaben der bisherigen landen nicht in der neuen', async () => {
    const KOPIE = `${PROJEKT}/Planung/Berechnungen/BS9 Kopie.oap`;
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    await projektBS9();
    // eine Kopie der Projektdatei liegt daneben (mit Abschnitt „formulare“); gewählt ist die bisherige
    ds.dateien.set(KOPIE, ds.dateien.get(OAP)!);
    await act(() => useFormulare.getState().oapWaehlen('Planung/Berechnungen/BS9.oap'));
    await warte();
    // Kennzeichen der bisherigen Projektdatei: Status von Hand
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: false, datum: '2026-10-01' }));
    await warte();
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: false, datum: '2026-10-01' });
    // Eingangsbestätigung kommt dazu; das Lesen hängt (Antragsordner und Antrag) – währenddessen die Kopie wählen
    ds.dateien.set(`${ordner}/BS9 BAUA 261103 Eingangsbestätigung.pdf`, new Uint8Array([1]));
    const liste = ds.liste.bind(ds);
    let frei1!: () => void;
    let frei2!: () => void;
    const halt1 = new Promise<void>((r) => (frei1 = r));
    const halt2 = new Promise<void>((r) => (frei2 = r));
    ds.liste = async (pfad: string, tiefe: number) => {
      if (pfad.endsWith('/TÖB/BAUA 2') && tiefe > 1) await halt1;
      if (pfad.endsWith('/TÖB') && tiefe === 1) await halt2;
      return liste(pfad, tiefe);
    };
    let laeuft!: Promise<void>;
    act(() => {
      laeuft = useAntrag.getState().aktualisieren();
    });
    await act(() => useFormulare.getState().oapWaehlen('Planung/Berechnungen/BS9 Kopie.oap'));
    await warte();
    const kopie = () => (readProjectFile(ds.dateien.get(KOPIE)!).formulare as { antraege?: Record<string, Record<string, unknown>> } | undefined)?.antraege?.['BAUA 2'];
    // erst das alte Lesen fertig: es schreibt nichts in die Kopie (die Angaben im Store stammen aus der bisherigen)
    frei1();
    await act(() => laeuft);
    await warte();
    expect(kopie()?.status).toBeUndefined();
    // dann das Laden der Kopie: „eingereicht“ aus ihren eigenen Angaben
    frei2();
    await warte();
    await warte();
    expect(kopie()?.status).toBeUndefined();
    expect(kopie()?.eingereicht).toEqual({ datei: 'BS9 BAUA 261103 Eingangsbestätigung.pdf', datum: '2026-11-03' });
    // die bisherige behält ihre Angaben
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: false, datum: '2026-10-01' });
  });

  it('Stand neu festhalten: wird während des Lesens ein anderes Projekt geöffnet, wird abgebrochen – keine Projektdatei ändert sich', async () => {
    h24Vorbereiten();
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${ordner}/BS9 BAUA 261103 Antragsprotokoll.pdf`, new Uint8Array([1]));
    await projektBS9();
    const vorher = antragIn('BAUA 2')?.stand;
    expect(vorher).toBeTruthy();
    const frei = baua2Anhalten();
    let laeuft!: Promise<void>;
    act(() => {
      laeuft = useAntrag.getState().standNeuFesthalten();
    });
    await h24Waehlen();
    const h24Vorher = ds.dateien.get(H24_OAP);
    frei();
    await act(() => laeuft);
    await warte();
    expect(antragIn('BAUA 2')?.stand).toEqual(vorher);
    expect(ds.dateien.get(H24_OAP)).toBe(h24Vorher);
    expect(useFormulare.getState().meldung?.text).toContain('Stand neu festhalten abgebrochen');
  });

  /** Schreiben einer Projektdatei einmal anhalten, bis `los()` aufgerufen wird */
  const schreibenAnhalten = (endung: string) => {
    const ersetzen = ds.projektordner.projektdateiErsetzen.bind(ds.projektordner);
    const z: { los: (() => void) | null } = { los: null };
    let einmal = true;
    ds.projektordner.projektdateiErsetzen = async (...a: Parameters<typeof ersetzen>) => {
      if (einmal && a[1].endsWith(endung)) {
        einmal = false;
        await new Promise<void>((r) => (z.los = r));
      }
      return ersetzen(...a);
    };
    return z;
  };
  const bs9Projekt = () => useFormulare.getState().projekte.find((p) => p.ordner === 'BS9')!;
  const h24Projekt = () => useFormulare.getState().projekte.find((p) => p.ordner === 'H24')!;

  it('andere .oap gewählt und fertig geladen, während die bisherige noch schreibt: die Angaben der neuen bleiben', async () => {
    const KOPIE_REL = 'Planung/Berechnungen/BS9 Kopie.oap';
    const KOPIE = `${PROJEKT}/${KOPIE_REL}`;
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    await projektBS9();
    // in der Kopie: Status von Hand „in Arbeit“
    ds.dateien.set(KOPIE, ds.dateien.get(OAP)!);
    await act(() => useFormulare.getState().oapWaehlen(KOPIE_REL));
    await warte();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: false, datum: '2026-09-09' }));
    await warte();
    await act(() => useFormulare.getState().oapWaehlen('Planung/Berechnungen/BS9.oap'));
    await warte();
    const kopie = () => (readProjectFile(ds.dateien.get(KOPIE)!).formulare as { antraege?: Record<string, Record<string, unknown>> } | undefined)?.antraege?.['BAUA 2'];
    expect(kopie()?.status).toEqual({ eingereicht: false, datum: '2026-09-09' });
    // das Schreiben in BS9.oap hängt; währenddessen wird die Kopie gewählt und fertig geladen
    const halt = schreibenAnhalten('BS9.oap');
    let laeuft!: Promise<void>;
    act(() => {
      laeuft = useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-05' });
    });
    await warte();
    expect(halt.los).toBeTruthy();
    await act(() => useFormulare.getState().oapWaehlen(KOPIE_REL));
    await warte();
    await warte();
    halt.los!();
    await act(() => laeuft);
    await warte();
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    expect(kopie()?.status).toEqual({ eingereicht: false, datum: '2026-09-09' });
    expect(useAntrag.getState().projektdatei?.antraege?.['BAUA 2']?.status).toEqual({ eingereicht: false, datum: '2026-09-09' });
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: true, datum: '2026-11-05' });
  });

  it('ohne Projektordner geöffnet, beim Zuordnen ein Ordner mit vorhandenen Anträgen: sie werden geladen, nicht überschrieben', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-03' }));
    await warte();
    expect((antragIn('BAUA 2')?.stand as { dateien: unknown[] }).dateien).toHaveLength(1);
    // neu öffnen, ohne dass der Projektordner über den Namen gefunden wird
    const bs9 = useFormulare.getState().projekt!;
    await act(() => useFormulare.getState().projektWaehlen(null));
    await warte();
    useFormulare.setState({ ablage: [] });
    await act(() => useFormulare.getState().projektWaehlen(bs9));
    await warte();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await act(() => useFormulare.getState().projektordnerWaehlen(PROJEKT));
    await warte();
    await warte();
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: true, datum: '2026-11-03' });
    expect((antragIn('BAUA 2')?.stand as { dateien: unknown[] }).dateien).toHaveLength(1);
    expect(useFormulare.getState().meldung?.text).toBe('Im Projektordner gibt es schon Angaben zum Antrag – sie sind jetzt geladen. Die Änderung ist nicht übernommen; bitte prüfen und bei Bedarf noch einmal vornehmen.');
  });

  it('Formular anlegen: wird während der Suche nach der Vorlage ein anderes Projekt geöffnet, wird abgebrochen', async () => {
    h24Vorbereiten();
    const host = await render();
    await projektOeffnen(host, 'H24');
    await warte();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    const bauantragIn = (oap: string) =>
      Object.values((readProjectFile(ds.dateien.get(oap)!).formulare as { antraege?: Record<string, { umfang?: { id: string; formularDatei?: string }[] }> }).antraege ?? {})
        .flatMap((a) => a.umfang ?? [])
        .find((u) => u.id === 'bauantrag');
    expect(bauantragIn(H24_OAP)).toBeTruthy();
    await act(() => useFormulare.getState().projektWaehlen(bs9Projekt()));
    await warte();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    // die Suche in den anderen Projekten hängt
    const liste = ds.liste.bind(ds);
    let los!: () => void;
    let einmal = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (einmal && pfad === 'C:/FORMA/H24' && tiefe === 1) {
        einmal = false;
        await new Promise<void>((r) => (los = r));
      }
      return liste(pfad, tiefe);
    };
    let laeuft!: Promise<string | null>;
    act(() => {
      laeuft = useAntrag.getState().formularAnlegen('bauantrag');
    });
    await warte();
    expect(los).toBeTruthy();
    await act(() => useFormulare.getState().projektWaehlen(h24Projekt()));
    await warte();
    los();
    expect(await act(() => laeuft)).toBeNull();
    await warte();
    expect(useFormulare.getState().meldung?.text).toBe('„Bauantrag“ nicht angelegt – inzwischen ist ein anderes Projekt offen.');
    expect(bauantragIn(H24_OAP)?.formularDatei).toBeUndefined();
    expect(useFormulare.getState().offen?.pfad ?? '').not.toContain('BS9/');
    expect([...ds.dateien.keys()].filter((k) => k.startsWith('C:/FORMA/BS9/') && /Bauantrag/.test(k))).toEqual([]);
  });

  it('neue Antragsfassung: wird während des Anlegens des Ordners ein anderes Projekt geöffnet, wird sie dort nicht aktiv', async () => {
    h24Vorbereiten();
    const host = await render();
    await projektOeffnen(host, 'H24');
    await warte();
    await act(() => useFormulare.getState().projektWaehlen(bs9Projekt()));
    await warte();
    const anlegen = ds.ordnerAnlegen.bind(ds);
    let los!: () => void;
    let einmal = true;
    ds.ordnerAnlegen = async (...a: Parameters<typeof anlegen>) => {
      if (einmal) {
        einmal = false;
        await new Promise<void>((r) => (los = r));
      }
      return anlegen(...a);
    };
    let laeuft!: Promise<void>;
    act(() => {
      laeuft = useAntrag.getState().fassungWaehlen('BAUA 3', true);
    });
    await warte();
    expect(los).toBeTruthy();
    await act(() => useFormulare.getState().projektWaehlen(h24Projekt()));
    await warte();
    los();
    await act(() => laeuft);
    await warte();
    const h24 = readProjectFile(ds.dateien.get(H24_OAP)!).formulare as { aktiveFassung?: string; antraege?: Record<string, unknown> } | undefined;
    expect(h24?.aktiveFassung).not.toBe('BAUA 3');
    expect(Object.keys(h24?.antraege ?? {})).not.toContain('BAUA 3');
    expect(useFormulare.getState().meldung?.text).toContain('nicht als aktive Antragsfassung gespeichert');
    expect(ds.ordner.has(`${PROJEKT}/TÖB/BAUA 3`)).toBe(true);
  });

  it('Projektdatei kurz nicht lesbar: beim Speichern neu gelesen, nur die eigene Änderung geschrieben (Änderungen von woanders bleiben) – bleibt sie unlesbar, sagt die App es', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    expect(antragIn()?.umfang).toBeTruthy();
    const gut = ds.dateien.get(OAP)!;
    ds.dateien.set(OAP, new Uint8Array([1, 2, 3]));
    await act(() => useFormulare.getState().oapLaden());
    await warte();
    expect(useFormulare.getState().oap).toBe('fehlt');
    // in der Zeit setzt ein anderer Arbeitsplatz BAUA 2 auf „eingereicht“
    const roh = readProjectFile(gut) as unknown as { formulare: { antraege: Record<string, Record<string, unknown>> } };
    roh.formulare.antraege['BAUA 2'] = { ...roh.formulare.antraege['BAUA 2'], status: { eingereicht: false, datum: '2026-11-10' } };
    ds.dateien.set(OAP, writeArchive(roh as unknown as Parameters<typeof writeArchive>[0]));
    expect(useFormulare.getState().meldung?.art).toBe('fehler');
    // wieder lesbar: neu gelesen und gespeichert – nur die eigene Änderung, die fremde bleibt; die Lesefehler-Meldung geht
    await act(() => useAntrag.getState().umfangSetzen(null));
    await warte();
    expect(antragIn()?.umfang).toBeUndefined();
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: false, datum: '2026-11-10' });
    expect(useAntrag.getState().projektdatei?.antraege?.['BAUA 2']?.status).toEqual({ eingereicht: false, datum: '2026-11-10' });
    expect(useFormulare.getState().meldung?.art).not.toBe('fehler');
    // weiter unlesbar: Meldung statt stillem Verwerfen
    ds.dateien.set(OAP, new Uint8Array([1, 2, 3]));
    await act(() => useFormulare.getState().oapLaden());
    await warte();
    await act(() => useAntrag.getState().merkmalSetzen('Gebäudeklasse', '3'));
    await warte();
    expect(useFormulare.getState().meldung?.text).toBe('Angaben zum Antrag von BS9 nicht gespeichert: Die Projektdatei ist gerade nicht lesbar – bitte gleich noch einmal versuchen.');
  });

  it('Projektordner zugeordnet, .oap noch ohne Angaben: zeigt das Projekt dann eine andere Fassung, wird nichts dorthin geschrieben, sondern gesagt', async () => {
    // ohne Projektordner (nicht über den Namen gefunden); BS9.oap hat noch keinen Abschnitt „formulare“
    useFormulare.setState({ ablageordner: [] });
    const host = await projektBS9();
    expect(abschnitt()).toBeUndefined();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    // das erste Auflisten des Antragsordners nach dem Zuordnen hängt (Netzlaufwerk)
    const liste = ds.liste.bind(ds);
    let los!: () => void;
    let einmal = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (einmal && pfad.endsWith('/TÖB') && tiefe === 1) {
        einmal = false;
        await new Promise<void>((r) => (los = r));
      }
      return liste(pfad, tiefe);
    };
    await act(() => useFormulare.getState().projektordnerWaehlen(PROJEKT));
    await warte();
    expect(los).toBeTruthy();
    los();
    await warte();
    await warte();
    const umfangIds = (name: string) => ((antragIn(name)?.umfang as { id: string }[] | undefined) ?? []).map((u) => u.id);
    // vorher angezeigt war „BAUA“ (ohne Ordner), jetzt die Fassung aus dem Projektordner – dort ist nichts festgelegt
    expect(umfangIds('BAUA')).toEqual([]);
    expect(umfangIds('BAUA 2')).toEqual([]);
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA 2');
    expect(useFormulare.getState().meldung?.text).toBe('Projektordner zugeordnet – angezeigt wird jetzt Antrag BAUA 2 aus dem Projektordner. Die Änderung ist nicht übernommen; bitte dort bei Bedarf noch einmal vornehmen.');
  });

  it('Projektdatei gelöscht bzw. verschoben: beim Speichern keine Sackgasse – der Stammdaten-Dialog bietet das Anlegen an', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    ds.dateien.delete(OAP);
    await act(() => useFormulare.getState().oapAuffrischen());
    await warte();
    expect(useFormulare.getState().oap).toBe('fehlt');
    useFormulare.setState({ meldung: null });
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    expect(useFormulare.getState().stammdatenDialog).toBeTruthy();
    expect(useFormulare.getState().meldung?.text ?? '').not.toContain('nicht gespeichert');
  });

  const H24_VORLAGE = { root: 'C:/FORMA', pfad: 'H24/003-Bauantrag (2026).frmsjf', datei: '003-Bauantrag (2026).frmsjf', name: 'Bauantrag', herkunft: 'Projekt H24', geaendert: 0 };
  /** einen Aufruf des Dateisystems einmal anhalten, bis `los()` aufgerufen wird */
  const einmalAnhalten = <K extends 'lies' | 'formularAnlegen' | 'kopieren'>(name: K, passt: (...a: Parameters<SpeicherDateisystem[K]>) => boolean = () => true) => {
    const echt = (ds[name] as (...a: unknown[]) => Promise<unknown>).bind(ds);
    const z: { los: (() => void) | null } = { los: null };
    let einmal = true;
    (ds as unknown as Record<string, unknown>)[name] = async (...a: unknown[]) => {
      if (einmal && passt(...(a as Parameters<SpeicherDateisystem[K]>))) {
        einmal = false;
        await new Promise<void>((r) => (z.los = r));
      }
      return echt(...a);
    };
    return z;
  };
  const bs9Formulare = () => [...ds.dateien.keys()].filter((k) => k.startsWith('C:/FORMA/BS9/') && /Bauantrag/.test(k));

  it('Formular hinzufügen: Projektwechsel beim Lesen der Vorlage – nichts angelegt; nach dem Anlegen – nicht aufgenommen, nicht geöffnet', async () => {
    h24Vorbereiten();
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    const umfangVorher = (antragIn()?.umfang as unknown[]).length;
    // 1. während die Vorlage gelesen wird
    let halt = einmalAnhalten('lies', (root, pfad) => root === 'C:/FORMA' && pfad === H24_VORLAGE.pfad);
    let laeuft!: Promise<string | null>;
    act(() => {
      laeuft = useAntrag.getState().formularHinzufuegen(H24_VORLAGE, true);
    });
    await warte();
    expect(halt.los).toBeTruthy();
    await act(() => useFormulare.getState().projektWaehlen(h24Projekt()));
    await warte();
    halt.los!();
    expect(await act(() => laeuft)).toBeNull();
    expect(useFormulare.getState().meldung?.text).toBe('„Bauantrag“ nicht angelegt – inzwischen ist ein anderes Projekt offen.');
    expect(bs9Formulare()).toEqual([]);
    // 2. während die Datei angelegt wird: sie liegt dann in BS9, wird aber weder aufgenommen noch geöffnet
    await act(() => useFormulare.getState().projektWaehlen(bs9Projekt()));
    await warte();
    halt = einmalAnhalten('formularAnlegen');
    act(() => {
      laeuft = useAntrag.getState().formularHinzufuegen(H24_VORLAGE, true);
    });
    await warte();
    expect(halt.los).toBeTruthy();
    await act(() => useFormulare.getState().projektWaehlen(h24Projekt()));
    await warte();
    halt.los!();
    expect(await act(() => laeuft)).toBeNull();
    expect(useFormulare.getState().meldung?.text).toMatch(/^„.*Bauantrag.*“ in BS9 angelegt, aber nicht in den Antragsumfang aufgenommen und nicht geöffnet – inzwischen ist ein anderes Projekt offen\.$/);
    expect(bs9Formulare()).toHaveLength(1);
    expect((antragIn('BAUA 2')?.umfang as unknown[]).length).toBe(umfangVorher);
    expect(useFormulare.getState().offen?.pfad ?? '').not.toContain('BS9/');
    // 3. während das Aufnehmen geschrieben wird: aufgenommen, aber nicht geöffnet
    for (const k of bs9Formulare()) ds.dateien.delete(k);
    await act(() => useFormulare.getState().projektWaehlen(bs9Projekt()));
    await warte();
    const schreiben = schreibenAnhalten('BS9.oap');
    act(() => {
      laeuft = useAntrag.getState().formularHinzufuegen(H24_VORLAGE, true);
    });
    for (let i = 0; i < 20 && !schreiben.los; i++) await warte();
    expect(schreiben.los).toBeTruthy();
    await act(() => useFormulare.getState().projektWaehlen(h24Projekt()));
    await warte();
    schreiben.los!();
    expect(await act(() => laeuft)).toBeNull();
    expect(useFormulare.getState().meldung?.text).toMatch(/ in BS9 angelegt und in den Antragsumfang aufgenommen, aber nicht geöffnet – inzwischen ist ein anderes Projekt offen\.$/);
    expect((antragIn('BAUA 2')?.umfang as unknown[]).length).toBe(umfangVorher + 1);
    expect(useFormulare.getState().offen?.pfad ?? '').not.toContain('BS9/');
  });

  it('Formular anlegen: Projektwechsel nach dem Anlegen der Datei – nicht zugeordnet; nach dem Zuordnen – zugeordnet, aber nicht geöffnet', async () => {
    h24Vorbereiten();
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    const zugeordnet = () => ((antragIn('BAUA 2')?.umfang as { id: string; formularDatei?: string }[]).find((u) => u.id === 'bauantrag') ?? {}).formularDatei;
    // 1. während die Datei angelegt wird
    let halt = einmalAnhalten('formularAnlegen');
    let laeuft!: Promise<string | null>;
    act(() => {
      laeuft = useAntrag.getState().formularAnlegen('bauantrag');
    });
    await warte();
    expect(halt.los).toBeTruthy();
    await act(() => useFormulare.getState().projektWaehlen(h24Projekt()));
    await warte();
    halt.los!();
    expect(await act(() => laeuft)).toBeNull();
    expect(useFormulare.getState().meldung?.text).toMatch(/ in BS9 angelegt, aber nicht zugeordnet und nicht geöffnet – inzwischen ist ein anderes Projekt offen\.$/);
    expect(zugeordnet()).toBeUndefined();
    expect(bs9Formulare()).toHaveLength(1);
    // 2. während das Zuordnen geschrieben wird (geschrieben ist es, geöffnet wird nicht)
    for (const k of bs9Formulare()) ds.dateien.delete(k);
    await act(() => useFormulare.getState().projektWaehlen(bs9Projekt()));
    await warte();
    const schreiben = schreibenAnhalten('BS9.oap');
    act(() => {
      laeuft = useAntrag.getState().formularAnlegen('bauantrag');
    });
    for (let i = 0; i < 20 && !schreiben.los; i++) await warte();
    expect(schreiben.los).toBeTruthy();
    await act(() => useFormulare.getState().projektWaehlen(h24Projekt()));
    await warte();
    schreiben.los!();
    expect(await act(() => laeuft)).toBeNull();
    expect(useFormulare.getState().meldung?.text).toMatch(/ in BS9 angelegt und „Bauantrag“ zugeordnet, aber nicht geöffnet – inzwischen ist ein anderes Projekt offen\.$/);
    expect(zugeordnet()).toMatch(/Bauantrag/);
    expect(useFormulare.getState().offen?.pfad ?? '').not.toContain('BS9/');
  });

  it('Verknüpfen mit Kopie: Projektwechsel während des Kopierens – kopiert, aber nicht verknüpft', async () => {
    h24Vorbereiten();
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    const halt = einmalAnhalten('kopieren');
    let laeuft!: Promise<void>;
    act(() => {
      laeuft = dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan');
    });
    await warte();
    expect(halt.los).toBeTruthy();
    await act(() => useFormulare.getState().projektWaehlen(h24Projekt()));
    await warte();
    halt.los!();
    await act(() => laeuft);
    await warte();
    expect(useFormulare.getState().meldung?.text).toBe('„BS9 Lageplan.pdf“ in BAUA 2 von BS9 kopiert, aber nicht verknüpft – inzwischen ist ein anderes Projekt offen.');
    expect(ds.dateien.has(`${PROJEKT}/TÖB/BAUA 2/BS9 Lageplan.pdf`)).toBe(true);
    expect(((antragIn('BAUA 2')?.umfang as { id: string; dateien?: Record<string, string> }[]).find((u) => u.id === 'lageplan') ?? {}).dateien).toBeUndefined();
    expect(JSON.stringify(readProjectFile(ds.dateien.get(H24_OAP)!).formulare ?? {})).not.toContain('Lageplan.pdf');
  });

  it('Projektordner zugeordnet, gleiche Fassung: der Antragsumfang bleibt, auch wenn das Schreiben erst nach dem Laden zurückkehrt', async () => {
    // ohne Antragsordner: angezeigt wird vorher und nachher „BAUA“; ohne Projektordner geöffnet
    ds.dateien.delete(`${PROJEKT}/TÖB/BAUA/BS9 GP 260101 Bauantrag.pdf`);
    ds.ordner.delete(`${PROJEKT}/TÖB/BAUA 2`);
    useFormulare.setState({ ablageordner: [] });
    // das Schreiben mit dem Antragsumfang kehrt erst nach dem nächsten Schreibvorgang zurück (langsames Netz)
    const ersetzen = ds.projektordner.projektdateiErsetzen.bind(ds.projektordner);
    let weiter: (() => void) | null = null;
    let einmal = true;
    ds.projektordner.projektdateiErsetzen = async (...a: Parameters<typeof ersetzen>) => {
      const mitUmfang = !!((readProjectFile(a[2]).formulare as { antraege?: Record<string, { umfang?: unknown[] }> } | undefined)?.antraege?.BAUA?.umfang?.length);
      await ersetzen(...a);
      if (weiter) {
        const w = weiter;
        weiter = null;
        w();
      }
      if (mitUmfang && einmal) {
        einmal = false;
        await new Promise<void>((r) => {
          weiter = r;
          setTimeout(r, 150);
        });
      }
    };
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await act(() => useFormulare.getState().projektordnerWaehlen(PROJEKT));
    await warte();
    await act(async () => new Promise((r) => setTimeout(r, 250)));
    await warte();
    await warte();
    const umfangIds = ((antragIn('BAUA')?.umfang as { id: string }[] | undefined) ?? []).map((u) => u.id);
    expect(umfangIds).toEqual(['muster', 'bauantrag', 'lageplan']);
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA');
    expect(((useAntrag.getState().projektdatei?.umfang as { id: string }[] | undefined) ?? []).map((u) => u.id)).toEqual(['muster', 'bauantrag', 'lageplan']);
  });

  for (const [fall, vorbereiten] of [
    [
      'umbenannt (Inhalt gleich)',
      async () => {
        const gut = ds.dateien.get(OAP)!;
        ds.dateien.set(OAP, new Uint8Array([1, 2, 3]));
        await act(() => useFormulare.getState().oapLaden());
        await warte();
        ds.dateien.delete(OAP);
        ds.dateien.set(`${PROJEKT}/Planung/Berechnungen/BS9 Musterstraße.oap`, gut);
        return `${PROJEKT}/Planung/Berechnungen/BS9 Musterstraße.oap`;
      },
    ],
    [
      'gelöscht, dann eine neue angelegt und neu gelesen',
      async () => {
        ds.dateien.delete(OAP);
        await act(() => useFormulare.getState().oapAuffrischen());
        await warte();
        ds.dateien.set(`${PROJEKT}/Planung/Berechnungen/BS9 neu.oap`, neueOap());
        await act(() => useFormulare.getState().oapLaden());
        await warte();
        return `${PROJEKT}/Planung/Berechnungen/BS9 neu.oap`;
      },
    ],
    [
      'beschädigt, in der Projektkarte eine andere gewählt',
      async () => {
        ds.dateien.set(`${PROJEKT}/Planung/Berechnungen/BS9 neu.oap`, neueOap());
        ds.dateien.set(OAP, new Uint8Array([1, 2, 3]));
        await act(() => useFormulare.getState().oapLaden());
        await warte();
        await act(() => useFormulare.getState().oapWaehlen('Planung/Berechnungen/BS9 neu.oap'));
        await warte();
        return `${PROJEKT}/Planung/Berechnungen/BS9 neu.oap`;
      },
    ],
  ] as const) {
    it(`nach „nicht lesbar“ eine andere Projektdatei (${fall}): neu gebunden – spätestens der zweite Versuch speichert`, async () => {
      const host = await projektBS9();
      await klick(antragsdaten(host));
      const neuePfad = await vorbereiten();
      const umfang = [{ id: 'muster', titel: 'Musterformular', art: 'intern' as const, formular: 'Muster' }];
      const gespeichert = () => ((readProjectFile(ds.dateien.get(neuePfad)!).formulare as { antraege?: Record<string, { umfang?: { id: string }[] }> } | undefined)?.antraege?.['BAUA 2']?.umfang ?? []).map((u) => u.id);
      for (let i = 0; i < 2 && !gespeichert().length; i++) {
        await act(() => useAntrag.getState().umfangSetzen(umfang));
        await warte();
      }
      expect(gespeichert()).toEqual(['muster']);
    });
  }

  it('Netzlaufwerk kurz weg (Ordner nicht lesbar, Datei „nicht gefunden“): die Bindung bleibt – Meldung, danach speichert es', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    const lies = ds.lies.bind(ds);
    const liste = ds.liste.bind(ds);
    let weg = true;
    ds.lies = async (root: string, pfad: string) => (weg && `${root}/${pfad}`.startsWith(PROJEKT) ? null : lies(root, pfad));
    ds.liste = async (root: string, tiefe: number) => {
      if (weg && root.startsWith(PROJEKT)) throw new Error('Der Netzwerkpfad wurde nicht gefunden');
      return liste(root, tiefe);
    };
    await act(() => useFormulare.getState().oapAuffrischen());
    await warte();
    expect(useFormulare.getState().oap).toBe('fehlt');
    const umfang = [{ id: 'muster', titel: 'Musterformular', art: 'intern' as const, formular: 'Muster' }];
    await act(() => useAntrag.getState().umfangSetzen(umfang));
    await warte();
    expect(useFormulare.getState().stammdatenDialog).toBeNull();
    expect(useFormulare.getState().meldung?.text).toBe('Angaben zum Antrag von BS9 nicht gespeichert: Die Projektdatei ist gerade nicht lesbar – bitte gleich noch einmal versuchen.');
    // wieder da: gleiche .oap, gespeichert
    weg = false;
    await act(() => useAntrag.getState().umfangSetzen(umfang));
    await warte();
    expect(((antragIn('BAUA 2')?.umfang as { id: string }[] | undefined) ?? []).map((u) => u.id)).toEqual(['muster']);
    expect(useFormulare.getState().stammdatenDialog).toBeNull();
  });

  it('Formular anlegen bei nicht lesbarer .oap bzw. Projektwechsel beim erneuten Lesen: „nicht zugeordnet“ – nichts Falsches gemeldet', async () => {
    h24Vorbereiten();
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    const zugeordnet = () => ((antragIn('BAUA 2')?.umfang as { id: string; formularDatei?: string }[]).find((u) => u.id === 'bauantrag') ?? {}).formularDatei;
    const gut = ds.dateien.get(OAP)!;
    // 1. .oap bleibt unlesbar: angelegt, nicht zugeordnet – die Zeile findet es aber über den Namen (kein „Zuordnen“ nötig)
    ds.dateien.set(OAP, new Uint8Array([1, 2, 3]));
    await act(() => useFormulare.getState().oapLaden());
    await warte();
    expect(await act(() => useAntrag.getState().formularAnlegen('bauantrag'))).toMatch(/Bauantrag/);
    await warte();
    expect(useFormulare.getState().meldung?.art).toBe('info');
    expect(useFormulare.getState().meldung?.text).toMatch(/angelegt \(leer\) – „Bauantrag“ findet es über den Namen\.$/);
    ds.dateien.set(OAP, gut);
    expect(zugeordnet()).toBeUndefined();
    for (const k of bs9Formulare()) ds.dateien.delete(k);
    // 1b. gibt es schon ein anderes „Bauantrag“-Formular, findet die Zeile das neue nicht: Fehler mit Grund und Weg
    ds.dateien.set('C:/FORMA/BS9/000-Bauantrag (2024).frmsjf', MUSTER);
    await act(() => useFormulare.getState().projektWaehlen(bs9Projekt()));
    await warte();
    ds.dateien.set(OAP, new Uint8Array([1, 2, 3]));
    await act(() => useFormulare.getState().oapLaden());
    await warte();
    await act(() => useAntrag.getState().formularAnlegen('bauantrag'));
    await warte();
    expect(useFormulare.getState().meldung?.art).toBe('fehler');
    expect(useFormulare.getState().meldung?.text).toMatch(/angelegt \(leer\), aber nicht zugeordnet – die Projektdatei ist gerade nicht lesbar\. Bitte später per Rechtsklick auf „002-Bauantrag \(2026\)“ in der Navigation › „Antragsdokument“ › „Bauantrag“ zuordnen\.$/);
    ds.dateien.set(OAP, gut);
    for (const k of bs9Formulare()) ds.dateien.delete(k);
    await act(() => useFormulare.getState().projektWaehlen(bs9Projekt()));
    await warte();
    // 2. Projektwechsel, während die wieder lesbare .oap neu gelesen wird: nicht zugeordnet (nicht „zugeordnet“)
    ds.dateien.set(OAP, new Uint8Array([1, 2, 3]));
    await act(() => useFormulare.getState().oapLaden());
    await warte();
    ds.dateien.set(OAP, gut);
    const anlegen = ds.formularAnlegen.bind(ds);
    let scharf = false;
    ds.formularAnlegen = async (...a: Parameters<typeof anlegen>) => {
      await anlegen(...a);
      scharf = true;
    };
    const halt = einmalAnhalten('lies', (root, pfad) => scharf && `${root}/${pfad}` === OAP);
    let laeuft!: Promise<string | null>;
    act(() => {
      laeuft = useAntrag.getState().formularAnlegen('bauantrag');
    });
    for (let i = 0; i < 20 && !halt.los; i++) await warte();
    expect(halt.los).toBeTruthy();
    await act(() => useFormulare.getState().projektWaehlen(h24Projekt()));
    await warte();
    halt.los!();
    expect(await act(() => laeuft)).toBeNull();
    expect(useFormulare.getState().meldung?.text).toMatch(/ in BS9 angelegt, aber nicht zugeordnet und nicht geöffnet – inzwischen ist ein anderes Projekt offen\.$/);
    expect(zugeordnet()).toBeUndefined();
  });

  it('Laden ergänzt nur fehlende Anträge: was ein gleichzeitiger Vorgang inzwischen geschrieben hat, bleibt', async () => {
    await projektBS9();
    // ein neuer Antragsordner – das Laden legt dafür einen Antrag an
    ds.ordner.add(`${PROJEKT}/TÖB/BAUA 3`);
    const liste = ds.liste.bind(ds);
    let losListe!: () => void;
    let listeHalten = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (listeHalten && pfad.endsWith('/TÖB') && tiefe === 1) {
        listeHalten = false;
        await new Promise<void>((r) => (losListe = r));
      }
      return liste(pfad, tiefe);
    };
    let laedt!: Promise<void>;
    act(() => {
      laedt = useAntrag.getState().laden();
    });
    await warte();
    expect(losListe).toBeTruthy();
    // währenddessen: Status von Hand – geschrieben ist er, das Neu-Lesen danach hängt noch
    const ersetzen = ds.projektordner.projektdateiErsetzen.bind(ds.projektordner);
    let geschrieben = false;
    ds.projektordner.projektdateiErsetzen = async (...a: Parameters<typeof ersetzen>) => {
      await ersetzen(...a);
      geschrieben = true;
    };
    const halt = einmalAnhalten('lies', (root, pfad) => geschrieben && `${root}/${pfad}` === OAP);
    let status!: Promise<void>;
    act(() => {
      status = useAntrag.getState().statusSetzen({ eingereicht: false, datum: '2026-10-01' });
    });
    for (let i = 0; i < 20 && !halt.los; i++) await warte();
    expect(halt.los).toBeTruthy();
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: false, datum: '2026-10-01' });
    // das Laden liest weiter (aus dem Stand vor dem Status) und ergänzt „BAUA 3“
    losListe();
    await act(() => laedt);
    await warte();
    halt.los!();
    await act(() => status);
    await warte();
    expect(antragIn('BAUA 3')).toBeTruthy();
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: false, datum: '2026-10-01' });
  });

  /** Projektdatei mit eigenem Abschnitt „formulare“ (wie von einem anderen Arbeitsplatz geschrieben) */
  const oapMit = (bytes: Uint8Array, formulare: (f: Record<string, unknown>) => void) => {
    const p = readProjectFile(bytes) as unknown as { formulare?: Record<string, unknown> };
    p.formulare = structuredClone(p.formulare ?? {});
    formulare(p.formulare);
    return writeArchive(p as unknown as Parameters<typeof writeArchive>[0]);
  };

  it('Laden ergänzt nur: „bereit“ und aktive Fassung, die ein anderer Arbeitsplatz inzwischen geändert hat, bleiben', async () => {
    // vorher: BAUA 2 aktiv, A.pdf bereit
    ds.dateien.set(OAP, oapMit(neueOap(), (f) => Object.assign(f, { aktiveFassung: 'BAUA 2', antraege: { BAUA: { angelegt: '2026-11-01' }, 'BAUA 2': { angelegt: '2026-11-01', bereit: [{ datei: 'A.pdf' }] } } })));
    await projektBS9();
    ds.ordner.add(`${PROJEKT}/TÖB/BAUA 3`);
    const liste = ds.liste.bind(ds);
    let los!: () => void;
    let halten = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (halten && pfad.endsWith('/TÖB') && tiefe === 1) {
        halten = false;
        await new Promise<void>((r) => (los = r));
      }
      return liste(pfad, tiefe);
    };
    let laedt!: Promise<void>;
    act(() => {
      laedt = useAntrag.getState().laden();
    });
    await warte();
    expect(los).toBeTruthy();
    // anderswo: A aufgehoben, B bereit, BAUA aktiv
    ds.dateien.set(
      OAP,
      oapMit(ds.dateien.get(OAP)!, (f) => {
        f.aktiveFassung = 'BAUA';
        (f.antraege as Record<string, Record<string, unknown>>)['BAUA 2'].bereit = [{ datei: 'B.pdf' }];
      }),
    );
    los();
    await act(() => laedt);
    await warte();
    const f = abschnitt() as { aktiveFassung?: string; antraege: Record<string, { bereit?: { datei: string }[] }> };
    expect(f.antraege['BAUA 3']).toBeTruthy();
    expect(f.antraege['BAUA 2'].bereit).toEqual([{ datei: 'B.pdf' }]);
    expect(f.aktiveFassung).toBe('BAUA');
  });

  it('Formular hinzufügen: der Antragsumfang wird erst beim Schreiben gelesen – Einträge von inzwischen bleiben, eine andere Fassung bekommt nichts', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    const ids = (name: string) => ((antragIn(name)?.umfang as { id: string; formularDatei?: string }[] | undefined) ?? []).map((u) => u.formularDatei ?? u.id);
    // 1. während die Datei angelegt wird, kommt ein Eintrag „extra“ dazu
    let halt = einmalAnhalten('formularAnlegen');
    let laeuft!: Promise<string | null>;
    act(() => {
      laeuft = useAntrag.getState().formularHinzufuegen(H24_VORLAGE, true);
    });
    await warte();
    expect(halt.los).toBeTruthy();
    await act(async () => void (await useAntrag.getState().umfangSetzen([...(useAntrag.getState().projektdatei!.umfang ?? []), { id: 'extra', titel: 'Extra', art: 'extern', quelle: 'Planung', muster: '*Extra*' }])));
    await warte();
    halt.los!();
    const pfad = await act(() => laeuft);
    await warte();
    expect(pfad).toMatch(/Bauantrag/);
    expect(ids('BAUA 2')).toContain('extra');
    expect(ids('BAUA 2').some((x) => /Bauantrag/.test(x))).toBe(true);
    // 2. während die Datei angelegt wird, zeigt das Projekt eine andere Fassung: dort wird nichts aufgenommen
    halt = einmalAnhalten('formularAnlegen');
    act(() => {
      laeuft = useAntrag.getState().formularHinzufuegen(H24_VORLAGE, true);
    });
    await warte();
    expect(halt.los).toBeTruthy();
    await act(() => useAntrag.getState().fassungWaehlen('BAUA'));
    await warte();
    await act(async () => void (await useAntrag.getState().umfangSetzen([{ id: 'eigen', titel: 'Eigen', art: 'extern', quelle: 'Planung', muster: '*Eigen*' }])));
    await warte();
    halt.los!();
    await act(() => laeuft);
    await warte();
    expect(ids('BAUA')).toEqual(['eigen']);
    expect(useFormulare.getState().meldung?.text).toMatch(/, aber nicht in den Antragsumfang aufgenommen – inzwischen ist Antrag BAUA angezeigt\. Bitte später in den Antragsdaten von BAUA 2 über „Dokument hinzufügen“ nachholen\.$/);
  });

  it('Formular hinzufügen bei nicht lesbarer .oap bzw. Projektwechsel beim erneuten Lesen: „nicht aufgenommen“ – nichts Falsches gemeldet', async () => {
    h24Vorbereiten();
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    const anzahl = () => (antragIn('BAUA 2')?.umfang as unknown[]).length;
    const vorher = anzahl();
    const gut = ds.dateien.get(OAP)!;
    // 1. bleibt unlesbar: angelegt, aber nicht aufgenommen – mit Grund und Weg
    ds.dateien.set(OAP, new Uint8Array([1, 2, 3]));
    await act(() => useFormulare.getState().oapLaden());
    await warte();
    await act(() => useAntrag.getState().formularHinzufuegen(H24_VORLAGE, true));
    await warte();
    expect(useFormulare.getState().meldung?.art).toBe('fehler');
    expect(useFormulare.getState().meldung?.text).toMatch(/angelegt \(leer\), aber nicht in den Antragsumfang aufgenommen – die Projektdatei ist gerade nicht lesbar\. Bitte später in den Antragsdaten über „Dokument hinzufügen“ nachholen\.$/);
    ds.dateien.set(OAP, gut);
    for (const k of bs9Formulare()) ds.dateien.delete(k);
    // 2. Projektwechsel, während die wieder lesbare .oap neu gelesen wird
    ds.dateien.set(OAP, new Uint8Array([1, 2, 3]));
    await act(() => useFormulare.getState().oapLaden());
    await warte();
    ds.dateien.set(OAP, gut);
    const anlegen = ds.formularAnlegen.bind(ds);
    let scharf = false;
    ds.formularAnlegen = async (...a: Parameters<typeof anlegen>) => {
      await anlegen(...a);
      scharf = true;
    };
    const halt = einmalAnhalten('lies', (root, pfad) => scharf && `${root}/${pfad}` === OAP);
    let laeuft!: Promise<string | null>;
    act(() => {
      laeuft = useAntrag.getState().formularHinzufuegen(H24_VORLAGE, true);
    });
    for (let i = 0; i < 20 && !halt.los; i++) await warte();
    expect(halt.los).toBeTruthy();
    await act(() => useFormulare.getState().projektWaehlen(h24Projekt()));
    await warte();
    halt.los!();
    expect(await act(() => laeuft)).toBeNull();
    expect(useFormulare.getState().meldung?.text).toMatch(/ in BS9 angelegt, aber nicht in den Antragsumfang aufgenommen und nicht geöffnet – inzwischen ist ein anderes Projekt offen\.$/);
    expect(anzahl()).toBe(vorher);
  });

  it('Projektdatei angelegt über den Stammdaten-Dialog: Änderung und gewählte Fassung kommen hinein – keine Meldung „Projektordner zugeordnet“', async () => {
    // Projektordner mit Antragsordnern (BAUA, BAUA 2), aber ohne .oap
    ds.dateien.delete(OAP);
    const host = await projektBS9();
    expect(useFormulare.getState().oap).toBe('fehlt');
    // jeder Schreibvorgang: welche Anträge stehen danach in der Datei (keiner darf zwischendurch verschwinden)
    const ersetzen = ds.projektordner.projektdateiErsetzen.bind(ds.projektordner);
    const staende: string[][] = [];
    ds.projektordner.projektdateiErsetzen = async (...a: Parameters<typeof ersetzen>) => {
      staende.push(Object.keys(((readProjectFile(a[2]).formulare as { antraege?: Record<string, unknown> } | undefined)?.antraege) ?? {}).sort());
      return ersetzen(...a);
    };
    // neue Fassung anlegen: der Dialog fragt die Stammdaten ab – vorher nichts melden
    useFormulare.setState({ meldung: null });
    await act(() => useAntrag.getState().fassungWaehlen('BAUA 3', true));
    await warte();
    const dialog = useFormulare.getState().stammdatenDialog;
    expect(dialog).toBeTruthy();
    expect(useFormulare.getState().meldung?.text ?? '').not.toContain('Neue Antragsfassung');
    await act(() => useFormulare.getState().projektdateiAnlegen(dialog!.meta));
    await warte();
    await warte();
    const f = abschnitt() as { aktiveFassung?: string; antraege: Record<string, unknown> };
    expect(f.aktiveFassung).toBe('BAUA 3');
    expect(Object.keys(f.antraege).sort()).toEqual(['BAUA', 'BAUA 2', 'BAUA 3']);
    const ab = staende.findIndex((k) => k.includes('BAUA 3'));
    expect(ab).toBeGreaterThanOrEqual(0);
    expect(staende.slice(ab).every((k) => k.includes('BAUA 3'))).toBe(true);
    expect(useFormulare.getState().meldung?.text ?? '').not.toContain('Projektordner zugeordnet');
    // Antragsumfang festlegen bei gelöschter .oap mit nicht neuester aktiver Fassung: bleibt in dieser Fassung
    await klick(antragsdaten(host));
    await act(() => useAntrag.getState().fassungWaehlen('BAUA'));
    await warte();
    ds.dateien.delete(OAP);
    await act(() => useFormulare.getState().oapAuffrischen());
    await warte();
    await act(async () => void (await useAntrag.getState().umfangSetzen([{ id: 'muster', titel: 'Musterformular', art: 'intern', formular: 'Muster' }])));
    await warte();
    const d2 = useFormulare.getState().stammdatenDialog;
    expect(d2?.grund).toContain('die bisherige nicht mehr (gelöscht oder verschoben)');
    await act(() => useFormulare.getState().projektdateiAnlegen(d2!.meta));
    await warte();
    await warte();
    const g = abschnitt() as { aktiveFassung?: string };
    expect(g.aktiveFassung).toBe('BAUA');
    expect(((antragIn('BAUA')?.umfang as { id: string }[] | undefined) ?? []).map((u) => u.id)).toEqual(['muster']);
    expect(useFormulare.getState().meldung?.text ?? '').not.toContain('Projektordner zugeordnet');
  });

  it('Formular anlegen: zeigt das Projekt währenddessen eine andere Fassung, wird dort nicht zugeordnet – auch nicht bei gleichem Eintrag', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    // beide Fassungen mit demselben Antragsumfang (Eintrag „bauantrag“)
    await act(() => useAntrag.getState().fassungWaehlen('BAUA'));
    await warte();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    await act(() => useAntrag.getState().fassungWaehlen('BAUA 2'));
    await warte();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    const zugeordnet = (name: string) => ((antragIn(name)?.umfang as { id: string; formularDatei?: string }[]).find((u) => u.id === 'bauantrag') ?? {}).formularDatei;
    const halt = einmalAnhalten('formularAnlegen');
    let laeuft!: Promise<string | null>;
    act(() => {
      laeuft = useAntrag.getState().formularAnlegen('bauantrag');
    });
    for (let i = 0; i < 20 && !halt.los; i++) await warte();
    expect(halt.los).toBeTruthy();
    await act(() => useAntrag.getState().fassungWaehlen('BAUA'));
    await warte();
    halt.los!();
    await act(() => laeuft);
    await warte();
    expect(zugeordnet('BAUA')).toBeUndefined();
    expect(zugeordnet('BAUA 2')).toBeUndefined();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: '„002-Bauantrag (2026).frmsjf“ aus Projekt H24 angelegt (leer) – „Bauantrag“ in BAUA 2 findet es über den Namen.' });
  });

  it('Projektdatei samt Ordner verschoben (Ordner fehlt, Projektordner lesbar): die Bindung wird gelöst – der Dialog bietet das Anlegen an', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    const lies = ds.lies.bind(ds);
    const liste = ds.liste.bind(ds);
    ds.lies = async (root: string, pfad: string) => (`${root}/${pfad}` === OAP ? null : lies(root, pfad));
    ds.liste = async (root: string, tiefe: number) => {
      if (root === `${PROJEKT}/Planung/Berechnungen`) throw new Error('Das System kann den angegebenen Pfad nicht finden');
      return liste(root, tiefe);
    };
    ds.dateien.delete(OAP);
    await act(() => useFormulare.getState().oapAuffrischen());
    await warte();
    await act(async () => void (await useAntrag.getState().umfangSetzen([{ id: 'muster', titel: 'Musterformular', art: 'intern', formular: 'Muster' }])));
    await warte();
    expect(useFormulare.getState().stammdatenDialog?.grund).toContain('die bisherige nicht mehr (gelöscht oder verschoben)');
  });

  it('Verknüpfen mit Kopie bei nicht lesbarer .oap: die Kopie wird gemeldet, kein Erfolg vor dem Speichern', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    ds.dateien.set(OAP, new Uint8Array([1, 2, 3]));
    await act(() => useFormulare.getState().oapLaden());
    await warte();
    await act(() => dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan'));
    await warte();
    expect(ds.dateien.has(`${PROJEKT}/TÖB/BAUA 2/BS9 Lageplan.pdf`)).toBe(true);
    expect(useFormulare.getState().meldung?.art).toBe('fehler');
    expect(useFormulare.getState().meldung?.text).toBe('„BS9 Lageplan.pdf“ in BAUA 2 kopiert, aber nicht verknüpft – die Projektdatei ist gerade nicht lesbar. Bitte später die Kopie in BAUA 2 über „Mit Antragsdokument verknüpfen“ verknüpfen, nicht noch einmal kopieren.');
  });

  it('zwei Antragsmerkmale kurz nacheinander auf einem frischen Antrag (das erste Schreiben läuft noch): beide bleiben', async () => {
    useAntrag.setState({ merkmalDefinitionen: [], einstellungen: { ...VORGABE_EXPORT } });
    await projektBS9();
    const halt = schreibenAnhalten('BS9.oap');
    let erstes!: Promise<void>;
    act(() => {
      erstes = useAntrag.getState().merkmalSetzen('Gebäudeklasse', '3');
    });
    for (let i = 0; i < 20 && !halt.los; i++) await warte();
    expect(halt.los).toBeTruthy();
    let zweites!: Promise<void>;
    act(() => {
      zweites = useAntrag.getState().merkmalSetzen('Sonderbau', 'nein');
    });
    await warte();
    halt.los!();
    await act(() => erstes);
    await act(() => zweites);
    await warte();
    expect(antragIn('BAUA 2')?.merkmale).toEqual({ Gebäudeklasse: '3', Sonderbau: 'nein' });
  });

  it('Verknüpfen mit Kopie: Eintrag inzwischen entfernt bzw. andere Fassung angezeigt – nichts Falsches verknüpft, passende Meldung', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    const verknuepft = (fassung: string) => ((antragIn(fassung)?.umfang as { id: string; dateien?: Record<string, string> }[] | undefined) ?? []).find((u) => u.id === 'lageplan')?.dateien;
    const voll = useAntrag.getState().projektdatei!.umfang!;
    // 1. während des Kopierens wird der Eintrag entfernt
    let halt = einmalAnhalten('kopieren');
    let laeuft!: Promise<void>;
    act(() => {
      laeuft = dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan');
    });
    await warte();
    expect(halt.los).toBeTruthy();
    const ohne = (useAntrag.getState().projektdatei!.umfang ?? []).filter((u) => u.id !== 'lageplan');
    await act(async () => void (await useAntrag.getState().umfangSetzen(ohne)));
    halt.los!();
    await act(() => laeuft);
    await warte();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: '„BS9 Lageplan.pdf“ in BAUA 2 kopiert, aber nicht verknüpft – der Eintrag ist inzwischen nicht mehr im Antragsumfang.' });
    // 2. während des Kopierens wird BAUA angezeigt (mit demselben Eintrag): dort wird nichts verknüpft
    await act(async () => void (await useAntrag.getState().umfangSetzen(voll)));
    await act(() => useAntrag.getState().fassungWaehlen('BAUA'));
    await warte();
    await act(async () => void (await useAntrag.getState().umfangSetzen(voll)));
    await act(() => useAntrag.getState().fassungWaehlen('BAUA 2'));
    await warte();
    halt = einmalAnhalten('kopieren');
    act(() => {
      laeuft = dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan');
    });
    await warte();
    expect(halt.los).toBeTruthy();
    await act(() => useAntrag.getState().fassungWaehlen('BAUA'));
    await warte();
    halt.los!();
    await act(() => laeuft);
    await warte();
    expect(verknuepft('BAUA')).toBeUndefined();
    expect(verknuepft('BAUA 2')).toBeUndefined();
    expect(useFormulare.getState().meldung?.art).toBe('fehler');
    expect(useFormulare.getState().meldung?.text).toMatch(/^„BS9 Lageplan \(Kopie\)\.pdf“ in BAUA 2 kopiert, aber nicht verknüpft – inzwischen ist Antrag BAUA angezeigt\. Bitte später die Kopie in BAUA 2 über „Mit Antragsdokument verknüpfen“ verknüpfen, nicht noch einmal kopieren\.$/);
    // 3. ohne Störung: erst nach dem Speichern „kopiert und verknüpft“
    await act(() => useAntrag.getState().fassungWaehlen('BAUA 2'));
    await warte();
    await act(() => dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan'));
    await warte();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: '„BS9 Lageplan (Kopie 2).pdf“ in BAUA 2 kopiert und verknüpft.' });
    expect(verknuepft('BAUA 2')).toEqual({ 'BAUA 2': 'BS9 Lageplan (Kopie 2).pdf' });
  });

  it('Menü „Zuordnen“ lange offen: der Antragsumfang wird erst beim Klick gelesen – inzwischen Aufgenommenes bleibt', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    const punkte = formularePunkte('bauantrag');
    // während das Menü offen ist, kommt ein Eintrag dazu
    await act(async () => void (await useAntrag.getState().umfangSetzen([...(useAntrag.getState().projektdatei!.umfang ?? []), { id: 'extra', titel: 'Extra', art: 'extern', quelle: 'Planung', muster: '*Extra*' }])));
    await warte();
    const punkt = punkte[0] as { aktion: () => void };
    await act(async () => void punkt.aktion());
    await warte();
    const umfang = antragIn('BAUA 2')?.umfang as { id: string; formularDatei?: string }[];
    expect(umfang.map((u) => u.id)).toContain('extra');
    expect(umfang.find((u) => u.id === 'bauantrag')?.formularDatei).toBe('001-Muster.frmsjf');
  });

  it('Menü „Zuordnen“ aus BAUA 2 offen, dann zeigt das Projekt BAUA (gleicher Eintrag): dort nicht zugeordnet', async () => {
    await mitUmfangInBeiden();
    const punkte = formularePunkte('bauantrag');
    await aktivVonAussen('BAUA');
    const punkt = punkte[0] as { aktion: () => void };
    await act(async () => void punkt.aktion());
    await warte();
    expect(((antragIn('BAUA')?.umfang as { id: string; formularDatei?: string }[]).find((u) => u.id === 'bauantrag') ?? {}).formularDatei).toBeUndefined();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht zugeordnet – inzwischen ist Antrag BAUA angezeigt.' });
  });

  it('Verknüpfen, während ein Fassungswechsel lädt: nichts geändert, „wird gerade geöffnet“ – auch nicht für die festgehaltene Fassung', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 Lageplan B2.pdf`, new Uint8Array([1]));
    await mitUmfangInBeiden();
    const liste = ds.liste.bind(ds);
    let los!: () => void;
    let halten = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (halten && pfad.endsWith('/TÖB') && tiefe === 1) {
        halten = false;
        await new Promise<void>((r) => (los = r));
      }
      return liste(pfad, tiefe);
    };
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 20 && !los; i++) await warte();
    // aktiv ist schon BAUA, angezeigt noch BAUA 2: solange wird nichts geändert – auch nicht für die festgehaltene Fassung
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA 2');
    const info = await act(() => useAntrag.getState().verknuepfen('lageplan', 'BS9 Lageplan B2.pdf', { ansicht: 'BAUA 2' }));
    expect(info).toMatchObject({ vorab: 'fassung', grund: 'Antrag BAUA wird gerade geöffnet' });
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht verknüpft – Antrag BAUA wird gerade geöffnet; bitte gleich noch einmal versuchen.' });
    los();
    await act(() => fw);
    await warte();
    const dateienVon = (f: string) => ((antragIn(f)?.umfang as { id: string; dateien?: Record<string, string> }[]).find((u) => u.id === 'lageplan') ?? {}).dateien;
    expect(dateienVon('BAUA 2')).toBeUndefined();
    expect(dateienVon('BAUA')).toBeUndefined();
  });

  it('Formular anlegen bzw. hinzufügen: Eintrag bzw. Antragsumfang inzwischen entfernt – Info mit dem richtigen Grund, Erfolg mit Bezug', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    // 1. ohne Störung: „… angelegt (leer) und „Bauantrag“ zugeordnet.“
    await act(() => useAntrag.getState().formularAnlegen('bauantrag'));
    await warte();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: '„002-Bauantrag (2026).frmsjf“ aus Projekt H24 angelegt (leer) und „Bauantrag“ zugeordnet.' });
    for (const k of bs9Formulare()) ds.dateien.delete(k);
    await act(() => useFormulare.getState().projektWaehlen(bs9Projekt()));
    await warte();
    await act(async () => void (await useAntrag.getState().umfangSetzen((useAntrag.getState().projektdatei!.umfang ?? []).map((u) => (u.id === 'bauantrag' ? { ...u, formularDatei: undefined } : u)))));
    await warte();
    // 2. Eintrag während des Anlegens entfernt
    let halt = einmalAnhalten('formularAnlegen');
    let laeuft!: Promise<string | null>;
    act(() => {
      laeuft = useAntrag.getState().formularAnlegen('bauantrag');
    });
    for (let i = 0; i < 20 && !halt.los; i++) await warte();
    await act(async () => void (await useAntrag.getState().umfangSetzen((useAntrag.getState().projektdatei!.umfang ?? []).filter((u) => u.id !== 'bauantrag'))));
    halt.los!();
    await act(() => laeuft);
    await warte();
    expect(useFormulare.getState().meldung?.art).toBe('info');
    expect(useFormulare.getState().meldung?.text).toMatch(/ angelegt \(leer\) – der Eintrag „Bauantrag“ ist inzwischen nicht mehr im Antragsumfang\.$/);
    // 3. Formular hinzufügen, während der Antragsumfang aufgehoben wird
    halt = einmalAnhalten('formularAnlegen');
    act(() => {
      laeuft = useAntrag.getState().formularHinzufuegen(H24_VORLAGE, true);
    });
    for (let i = 0; i < 20 && !halt.los; i++) await warte();
    await act(async () => void (await useAntrag.getState().umfangSetzen(null)));
    halt.los!();
    await act(() => laeuft);
    await warte();
    expect(useFormulare.getState().meldung?.art).toBe('info');
    expect(useFormulare.getState().meldung?.text).toMatch(/ angelegt \(leer\) – inzwischen gibt es keinen Antragsumfang mehr\.$/);
  });

  it('„nicht gespeichert“ verschwindet, sobald der nächste Versuch gespeichert hat', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    const gut = ds.dateien.get(OAP)!;
    ds.dateien.set(OAP, new Uint8Array([1, 2, 3]));
    await act(() => useFormulare.getState().oapLaden());
    await warte();
    const umfang = [{ id: 'muster', titel: 'Musterformular', art: 'intern' as const, formular: 'Muster' }];
    await act(async () => void (await useAntrag.getState().umfangSetzen(umfang)));
    await warte();
    expect(useFormulare.getState().meldung?.text).toContain('nicht gespeichert');
    ds.dateien.set(OAP, gut);
    const info = await act(() => useAntrag.getState().umfangSetzen(umfang));
    await warte();
    expect(info.geschrieben).toBe(true);
    expect(useFormulare.getState().meldung?.art).not.toBe('fehler');
  });

  it('Verknüpfen mit Kopie ohne Projektdatei (Dialog offen): „verknüpft wird nach dem Anlegen der Projektdatei“; ohne alte aktive Fassung bleibt die angezeigte', async () => {
    ds.dateien.delete(OAP);
    await projektBS9();
    expect(useFormulare.getState().oap).toBe('fehlt');
    // angezeigt ist „BAUA 2“ (die neueste) – inzwischen entsteht „BAUA 3“ im Projektordner
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA 2');
    ds.ordner.add(`${PROJEKT}/TÖB/BAUA 3`);
    await act(async () => void (await useAntrag.getState().umfangSetzen([{ id: 'lageplan', titel: 'Lageplan', art: 'extern', quelle: 'Planung', muster: '*Lageplan*' }])));
    await warte();
    const dialog = useFormulare.getState().stammdatenDialog;
    expect(dialog).toBeTruthy();
    act(() => useFormulare.getState().stammdatenAbbrechen());
    // Verknüpfen mit Kopie, wieder mit Dialog
    useAntrag.setState({ projektdatei: { ...useAntrag.getState().projektdatei!, umfang: [{ id: 'lageplan', titel: 'Lageplan', art: 'extern', quelle: 'Planung', muster: '*Lageplan*' }] } });
    await act(() => dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan'));
    await warte();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: '„BS9 Lageplan.pdf“ in BAUA 2 kopiert – verknüpft wird nach dem Anlegen der Projektdatei.' });
    const d2 = useFormulare.getState().stammdatenDialog;
    expect(d2).toBeTruthy();
    await act(() => useFormulare.getState().projektdateiAnlegen(d2!.meta));
    await warte();
    await warte();
    // die angezeigte Fassung bleibt die aktive (nicht die inzwischen neueste „BAUA 3“), verknüpft ist dort
    expect((abschnitt() as { aktiveFassung?: string }).aktiveFassung).toBe('BAUA 2');
    expect(((antragIn('BAUA 2')?.umfang as { id: string; dateien?: Record<string, string> }[]).find((u) => u.id === 'lageplan') ?? {}).dateien).toEqual({ 'BAUA 2': 'BS9 Lageplan.pdf' });
    expect(useFormulare.getState().meldung?.text).toBe('Projektdatei angelegt – Antrag BAUA 2 ist das Ziel des Exports.');
  });

  /** BAUA bekommt dieselben Einträge wie BAUA 2 (von einem anderen Arbeitsplatz), neu gelesen */
  const bauaWieBaua2 = async () => {
    ds.dateien.set(
      OAP,
      oapMit(ds.dateien.get(OAP)!, (f) => {
        const a = f.antraege as Record<string, Record<string, unknown>>;
        a.BAUA = { ...(a.BAUA ?? {}), umfang: structuredClone(a['BAUA 2'].umfang) };
      }),
    );
    await act(() => useFormulare.getState().oapLaden());
    await warte();
  };
  /** ein anderer Arbeitsplatz macht eine andere Fassung aktiv, neu gelesen */
  const aktivVonAussen = async (name: string) => {
    ds.dateien.set(OAP, oapMit(ds.dateien.get(OAP)!, (f) => void (f.aktiveFassung = name)));
    await act(() => useFormulare.getState().oapLaden());
    await warte();
  };
  const umfangIdsIn = (fassung: string) => ((antragIn(fassung)?.umfang as { id: string }[] | undefined) ?? []).map((u) => u.id);
  const zeileVon = (host: Element, titel: string) => [...host.querySelectorAll('.pu-zeile')].find((z) => z.querySelector('.pu-text strong')?.textContent === titel)!;
  const mitUmfangInBeiden = async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    await bauaWieBaua2();
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA 2');
    return host;
  };

  it('Zeilenmenü in BAUA 2 offen, dann zeigt das Projekt BAUA: „Aus dem Antragsumfang nehmen“ und „Nach oben“ ändern dort nichts', async () => {
    const host = await mitUmfangInBeiden();
    const vorher = umfangIdsIn('BAUA');
    await rechtsklick(zeileVon(host, 'Lageplan'));
    await aktivVonAussen('BAUA');
    await klick(menuePunkt('Aus dem Antragsumfang nehmen'));
    await warte();
    expect(umfangIdsIn('BAUA')).toEqual(vorher);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht entfernt – inzwischen ist Antrag BAUA angezeigt.' });
    // „Nach oben“ aus einem offenen Menü von BAUA 2
    await aktivVonAussen('BAUA 2');
    await act(() => useAntrag.getState().laden());
    await warte();
    await rechtsklick(zeileVon(host, 'Lageplan'));
    await aktivVonAussen('BAUA');
    await klick(menuePunkt('Nach oben'));
    await warte();
    expect(umfangIdsIn('BAUA')).toEqual(vorher);
  });

  it('Zeilenmenü während des Fassungswechsels offen (ohne anderen Arbeitsplatz): „Aus dem Antragsumfang nehmen“ ändert die neue Fassung nicht', async () => {
    const host = await mitUmfangInBeiden();
    const liste = ds.liste.bind(ds);
    let los!: () => void;
    let halten = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (halten && pfad.endsWith('/TÖB') && tiefe === 1) {
        halten = false;
        await new Promise<void>((r) => (los = r));
      }
      return liste(pfad, tiefe);
    };
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 20 && !los; i++) await warte();
    await rechtsklick(zeileVon(host, 'Lageplan'));
    los();
    await act(() => fw);
    await warte();
    await klick(menuePunkt('Aus dem Antragsumfang nehmen'));
    await warte();
    expect(umfangIdsIn('BAUA')).toContain('lageplan');
  });

  it('Ablage-Menü „In BAUA 2 kopieren und verknüpfen“ offen, dann zeigt das Projekt BAUA: nichts kopiert, nichts verknüpft', async () => {
    await mitUmfangInBeiden();
    const punkte = dateiMenue(PROJEKT, 'Planung/BS9 Lageplan.pdf') as { text?: string; unter?: { text: string; aktion: () => void }[] }[];
    const verkn = punkte.find((x) => x.text?.includes('kopieren und verknüpfen'))!;
    expect(verkn.text).toBe('In BAUA 2 kopieren und verknüpfen');
    const lp = verkn.unter!.find((u) => u.text === 'Lageplan')!;
    await aktivVonAussen('BAUA');
    await act(async () => void lp.aktion());
    await warte();
    expect([...ds.dateien.keys()].filter((k) => k.includes('/TÖB/') && k.includes('Lageplan'))).toEqual([]);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht kopiert – inzwischen ist Antrag BAUA angezeigt.' });
  });

  it('Verknüpfen mit Kopie während des Fassungswechsels: nichts kopiert, „wird gerade geöffnet“ – kein widersprüchlicher Stand', async () => {
    await mitUmfangInBeiden();
    const liste = ds.liste.bind(ds);
    let los!: () => void;
    let halten = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (halten && pfad.endsWith('/TÖB') && tiefe === 1) {
        halten = false;
        await new Promise<void>((r) => (los = r));
      }
      return liste(pfad, tiefe);
    };
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 20 && !los; i++) await warte();
    await act(() => dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan'));
    await warte();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht kopiert – Antrag BAUA wird gerade geöffnet; bitte gleich noch einmal versuchen.' });
    expect([...ds.dateien.keys()].filter((k) => k.includes('/TÖB/') && k.includes('Lageplan'))).toEqual([]);
    los();
    await act(() => fw);
    await warte();
    // danach geht es: in BAUA kopiert und dort verknüpft
    await act(() => dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan'));
    await warte();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: '„BS9 Lageplan.pdf“ in BAUA kopiert und verknüpft.' });
    expect(((antragIn('BAUA')?.umfang as { id: string; dateien?: Record<string, string> }[]).find((u) => u.id === 'lageplan') ?? {}).dateien).toEqual({ BAUA: 'BS9 Lageplan.pdf' });
  });

  it('Verknüpfen bei eingereichtem (gesperrtem) Antrag: nichts kopiert, die Sperrmeldung als eigener Satz', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-10' }));
    await warte();
    await act(() => dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan'));
    await warte();
    expect([...ds.dateien.keys()].filter((k) => k.includes('/TÖB/') && k.includes('Lageplan'))).toEqual([]);
    expect(useFormulare.getState().meldung?.text).toMatch(/^Antrag BAUA 2 ist eingereicht/);
  });

  it('Zeilenknopf „Datei in BAUA 2 verknüpfen“ offen, dann zeigt das Projekt BAUA: dort wird nichts verknüpft', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 Lageplan B2.pdf`, new Uint8Array([1]));
    const host = await mitUmfangInBeiden();
    const knopfDatei = [...zeileVon(host, 'Lageplan').querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.title ?? '').startsWith('Datei in'))!;
    await klick(knopfDatei);
    await aktivVonAussen('BAUA');
    await klick(menuePunkt('BS9 Lageplan B2.pdf'));
    await warte();
    const dateienVon = (f: string) => ((antragIn(f)?.umfang as { id: string; dateien?: Record<string, string> }[]).find((u) => u.id === 'lageplan') ?? {}).dateien;
    expect(dateienVon('BAUA')).toBeUndefined();
    expect(dateienVon('BAUA 2')).toBeUndefined();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht verknüpft – inzwischen ist Antrag BAUA angezeigt.' });
  });

  it('Navigation: Menü „Antragsdokument“ aus BAUA 2 offen, dann zeigt das Projekt BAUA – dort nichts zugeordnet', async () => {
    const host = await mitUmfangInBeiden();
    const nav = (text: string) => [...host.querySelectorAll<HTMLElement>('.nav-eintrag')].find((b) => b.textContent?.includes(text))!;
    // Formular-Menü › Antragsdokument › Bauantrag
    await rechtsklick(nav('Muster'));
    await klick(menuePunkt('Antragsdokument'));
    await aktivVonAussen('BAUA');
    await klick(menuePunkt('Bauantrag'));
    await warte();
    const zugeordnet = (f: string) => ((antragIn(f)?.umfang as { id: string; formularDatei?: string }[]).find((u) => u.id === 'bauantrag') ?? {}).formularDatei;
    expect(zugeordnet('BAUA')).toBeUndefined();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht zugeordnet – inzwischen ist Antrag BAUA angezeigt.' });
  });

  it('Verknüpfen mit Kopie, dann den Stammdaten-Dialog abbrechen: die Zusage wird zurückgenommen', async () => {
    ds.dateien.delete(OAP);
    await projektBS9();
    useAntrag.setState({ projektdatei: { ...useAntrag.getState().projektdatei!, umfang: [{ id: 'lageplan', titel: 'Lageplan', art: 'extern', quelle: 'Planung', muster: '*Lageplan*' }] } });
    await act(() => dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan'));
    await warte();
    expect(useFormulare.getState().meldung?.text).toBe('„BS9 Lageplan.pdf“ in BAUA 2 kopiert – verknüpft wird nach dem Anlegen der Projektdatei.');
    act(() => useFormulare.getState().stammdatenAbbrechen());
    expect(useFormulare.getState().meldung).toEqual({
      art: 'info',
      text: '„BS9 Lageplan.pdf“ in BAUA 2 kopiert, aber nicht verknüpft – keine Projektdatei angelegt. Bitte später die Kopie in BAUA 2 über „Mit Antragsdokument verknüpfen“ verknüpfen, nicht noch einmal kopieren.',
    });
    // allgemein: eine andere Änderung, Dialog abgebrochen
    await act(async () => void (await useAntrag.getState().merkmalSetzen('Gebäudeklasse', '3')));
    await warte();
    act(() => useFormulare.getState().stammdatenAbbrechen());
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Projektdatei nicht angelegt – die Änderung ist nicht gespeichert.' });
  });

  /** BAUA bekommt einen eigenen Umfang (nur „Statik“) – von einem anderen Arbeitsplatz, neu gelesen */
  const bauaNurStatik = async () => {
    ds.dateien.set(
      OAP,
      oapMit(ds.dateien.get(OAP)!, (f) => {
        const a = f.antraege as Record<string, Record<string, unknown>>;
        a.BAUA = { ...(a.BAUA ?? {}), umfang: [{ id: 'statik', titel: 'Statik', art: 'extern' }] };
      }),
    );
    await act(() => useFormulare.getState().oapLaden());
    await warte();
  };
  /** ein anderer Arbeitsplatz ändert den Umfang einer Fassung, neu gelesen */
  const umfangVonAussen = async (fassung: string, aendern: (umfang: { id: string }[]) => { id: string }[]) => {
    ds.dateien.set(
      OAP,
      oapMit(ds.dateien.get(OAP)!, (f) => {
        const a = (f.antraege as Record<string, { umfang: { id: string }[] }>)[fassung];
        a.umfang = aendern(a.umfang);
      }),
    );
    await act(() => useFormulare.getState().oapLaden());
    await warte();
  };
  const navFehlt = (host: Element, titel: string) => [...host.querySelectorAll<HTMLElement>('.nav-eintrag.fehlt')].find((b) => b.textContent?.includes(titel))!;

  it('„Dokument hinzufügen“ aus BAUA 2 offen, dann zeigt das Projekt BAUA: nichts hinzugefügt – ein inzwischen ergänzter Eintrag bleibt', async () => {
    const host = await mitUmfangInBeiden();
    await bauaNurStatik();
    // eigenes Dokument
    await klick(knopf(host, 'Dokument hinzufügen'));
    await aktivVonAussen('BAUA');
    await klick(menuePunkt('Eigenes Dokument'));
    await warte();
    expect(umfangIdsIn('BAUA')).toEqual(['statik']);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht hinzugefügt – inzwischen ist Antrag BAUA angezeigt.' });
    // Katalogeintrag (in BAUA 2 fehlt „Lageplan“)
    await aktivVonAussen('BAUA 2');
    await umfangVonAussen('BAUA 2', (u) => u.filter((x) => x.id !== 'lageplan'));
    await klick(knopf(host, 'Dokument hinzufügen'));
    await aktivVonAussen('BAUA');
    await klick(menuePunkt('Lageplan'));
    await warte();
    expect(umfangIdsIn('BAUA')).toEqual(['statik']);
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'bauantrag']);
    // ohne Fassungswechsel: was ein anderer Arbeitsplatz ergänzt hat, während das Menü offen war, bleibt
    await aktivVonAussen('BAUA 2');
    await klick(knopf(host, 'Dokument hinzufügen'));
    await umfangVonAussen('BAUA 2', (u) => [...u, { id: 'statik', titel: 'Statik', art: 'extern' } as { id: string }]);
    await klick(menuePunkt('Eigenes Dokument'));
    await warte();
    const ids = umfangIdsIn('BAUA 2');
    expect(ids.slice(0, 3)).toEqual(['muster', 'bauantrag', 'statik']);
    expect(ids).toHaveLength(4);
    // der Antragsumfang wurde inzwischen woanders aufgehoben: es entsteht kein neuer mit nur einem Eintrag
    await klick(knopf(host, 'Dokument hinzufügen'));
    ds.dateien.set(OAP, oapMit(ds.dateien.get(OAP)!, (f) => void delete (f.antraege as Record<string, Record<string, unknown>>)['BAUA 2'].umfang));
    await act(() => useFormulare.getState().oapLaden());
    await warte();
    await klick(menuePunkt('Eigenes Dokument'));
    await warte();
    expect(antragIn('BAUA 2')?.umfang).toBeUndefined();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht hinzugefügt – inzwischen gibt es keinen Antragsumfang mehr.' });
  });

  it('Zeile in BAUA 2 ziehen, während das Projekt auf BAUA wechselt: BAUA bleibt, wie es ist', async () => {
    const host = await mitUmfangInBeiden();
    const PE = (window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
    const ziehen = (titel: string, dazwischen?: () => Promise<void>) =>
      act(async () => {
        host.querySelector<HTMLElement>(`[aria-label="${titel} verschieben"]`)!.dispatchEvent(new PE('pointerdown', { bubbles: true, cancelable: true, button: 0, clientY: 0 }));
        await dazwischen?.();
        // ganz nach unten (die Zeilen haben im Test keine Höhe – jede liegt „über“ dem Zeiger)
        window.dispatchEvent(new PE('pointermove', { bubbles: true, clientY: 500 }));
        window.dispatchEvent(new PE('pointerup', { bubbles: true, clientY: 500 }));
      });
    // ohne Wechsel: „Musterformular“ ans Ende
    await ziehen('Musterformular');
    await warte();
    expect(umfangIdsIn('BAUA 2')).toEqual(['bauantrag', 'lageplan', 'muster']);
    // Zug beginnt in BAUA 2, losgelassen wird, wenn das Projekt BAUA zeigt (gleiche Einträge)
    const vorher = umfangIdsIn('BAUA');
    await ziehen('Bauantrag', () => aktivVonAussen('BAUA'));
    await warte();
    expect(umfangIdsIn('BAUA')).toEqual(vorher);
    expect(umfangIdsIn('BAUA 2')).toEqual(['bauantrag', 'lageplan', 'muster']);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht verschoben – inzwischen ist Antrag BAUA angezeigt.' });
  });

  it('PDF-Export, während ein Fassungswechsel lädt: exportiert, aber nicht in den Umfang der bisherigen Fassung verknüpft', async () => {
    await mitUmfangInBeiden();
    const liste = ds.liste.bind(ds);
    let los!: () => void;
    let halten = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (halten && pfad.endsWith('/TÖB') && tiefe === 1) {
        halten = false;
        await new Promise<void>((r) => (los = r));
      }
      return liste(pfad, tiefe);
    };
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 20 && !los; i++) await warte();
    // aktiv ist schon BAUA, angezeigt (samt Umfang) noch BAUA 2
    const muster = useFormulare.getState().formulare[0].pfad;
    const ziel = exportVorschlag(muster);
    expect(ziel.ordner).toBe('TÖB/BAUA');
    await act(() => useAntrag.getState().exportieren(muster, ziel, false));
    los();
    await act(() => fw);
    await warte();
    expect(ds.dateien.has(`${PROJEKT}/TÖB/BAUA/${ziel.name}`)).toBe(true);
    const dateienVon = (f: string) => ((antragIn(f)?.umfang as { id: string; dateien?: Record<string, string> }[]).find((u) => u.id === 'muster') ?? {}).dateien;
    expect(dateienVon('BAUA 2')).toBeUndefined();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: `Als PDF exportiert: TÖB/BAUA/${ziel.name}` });
  });

  it('Navigation, fehlendes Formular: Menü aus BAUA 2 offen, dann zeigt das Projekt BAUA – „Formular anlegen“ und „Aus dem Antragsumfang nehmen“ tun dort nichts', async () => {
    const host = await mitUmfangInBeiden();
    await rechtsklick(navFehlt(host, 'Bauantrag'));
    await aktivVonAussen('BAUA');
    const vorher = bs9Formulare().length;
    await klick(menuePunkt('Formular anlegen'));
    for (let i = 0; i < 5; i++) await warte();
    expect(bs9Formulare().length).toBe(vorher);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Formular nicht angelegt – inzwischen ist Antrag BAUA angezeigt.' });
    await aktivVonAussen('BAUA 2');
    await rechtsklick(navFehlt(host, 'Bauantrag'));
    await aktivVonAussen('BAUA');
    await klick(menuePunkt('Aus dem Antragsumfang nehmen'));
    await warte();
    expect(umfangIdsIn('BAUA')).toContain('bauantrag');
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht entfernt – inzwischen ist Antrag BAUA angezeigt.' });
    // ohne Wechsel nimmt derselbe Menüpunkt den Eintrag heraus – nur in BAUA 2
    await aktivVonAussen('BAUA 2');
    await rechtsklick(navFehlt(host, 'Bauantrag'));
    await klick(menuePunkt('Aus dem Antragsumfang nehmen'));
    await warte();
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'lageplan']);
    expect(umfangIdsIn('BAUA')).toContain('bauantrag');
  });

  it('Menüknopf „Zuordnen“ aus BAUA 2 offen, dann zeigt das Projekt BAUA: „Aus dem Antragsumfang nehmen“ ändert dort nichts', async () => {
    const host = await mitUmfangInBeiden();
    const zuordnen = [...zeileVon(host, 'Bauantrag').querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Zuordnen'))!;
    await klick(zuordnen);
    await aktivVonAussen('BAUA');
    await klick(menuePunkt('Aus dem Antragsumfang nehmen'));
    await warte();
    expect(umfangIdsIn('BAUA')).toContain('bauantrag');
    expect(umfangIdsIn('BAUA 2')).toContain('bauantrag');
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht entfernt – inzwischen ist Antrag BAUA angezeigt.' });
  });

  it('Zeilenmenü offen, der Eintrag wird inzwischen woanders entfernt: Meldungen nennen ihn beim Namen', async () => {
    const host = await mitUmfangInBeiden();
    await rechtsklick(zeileVon(host, 'Lageplan'));
    await umfangVonAussen('BAUA 2', (u) => u.filter((x) => x.id !== 'lageplan'));
    await klick(menuePunkt('Nach oben'));
    await warte();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht verschoben – der Eintrag „Lageplan“ ist inzwischen nicht mehr im Antragsumfang.' });
    // entfernen, was schon weg ist: das Ziel ist erreicht – kein „nicht“
    await umfangVonAussen('BAUA 2', (u) => [...u, { id: 'lageplan', titel: 'Lageplan', art: 'extern' } as { id: string }]);
    await rechtsklick(zeileVon(host, 'Lageplan'));
    await umfangVonAussen('BAUA 2', (u) => u.filter((x) => x.id !== 'lageplan'));
    await klick(menuePunkt('Aus dem Antragsumfang nehmen'));
    await warte();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: '„Lageplan“ ist schon nicht mehr im Antragsumfang.' });
  });

  it('„Verknüpfung lösen“ aus dem Menü von BAUA 2, dann zeigt das Projekt BAUA: die Verknüpfung bleibt', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 Lageplan B2.pdf`, new Uint8Array([1]));
    const host = await mitUmfangInBeiden();
    const dateiKnopf = () => [...zeileVon(host, 'Lageplan').querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.title ?? '').startsWith('Datei in'))!;
    await klick(dateiKnopf());
    await klick(menuePunkt('BS9 Lageplan B2.pdf'));
    await warte();
    const dateienVon = (f: string) => ((antragIn(f)?.umfang as { id: string; dateien?: Record<string, string> }[]).find((u) => u.id === 'lageplan') ?? {}).dateien;
    expect(dateienVon('BAUA 2')).toEqual({ 'BAUA 2': 'BS9 Lageplan B2.pdf' });
    await klick(dateiKnopf());
    await aktivVonAussen('BAUA');
    await klick(menuePunkt('Verknüpfung lösen'));
    await warte();
    expect(dateienVon('BAUA 2')).toEqual({ 'BAUA 2': 'BS9 Lageplan B2.pdf' });
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Verknüpfung nicht gelöst – inzwischen ist Antrag BAUA angezeigt.' });
  });

  it('Ablage: „Mit Antragsdokument verknüpfen“ bzw. „… kopieren und verknüpfen“ aus BAUA 2, dann zeigt das Projekt BAUA – das Verb passt zum Menüpunkt', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 Lageplan B2.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA/BS9 Lageplan B1.pdf`, new Uint8Array([1]));
    await mitUmfangInBeiden();
    type Punkt = { text?: string; unter?: { text: string; aktion: () => void }[] };
    const lageplan = (pfad: string, text: string) => (dateiMenue(PROJEKT, pfad) as Punkt[]).find((x) => x.text === text)!.unter!.find((u) => u.text === 'Lageplan')!;
    // Datei liegt schon im Ordner von BAUA 2: verknüpfen
    const verkn = lageplan('TÖB/BAUA 2/BS9 Lageplan B2.pdf', 'Mit Antragsdokument verknüpfen');
    await aktivVonAussen('BAUA');
    await act(async () => void verkn.aktion());
    await warte();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht verknüpft – inzwischen ist Antrag BAUA angezeigt.' });
    // Datei liegt im Ordner von BAUA (jetzt angezeigt), das Menü bot das Kopieren nach BAUA 2 an
    await aktivVonAussen('BAUA 2');
    const kopie = lageplan('TÖB/BAUA/BS9 Lageplan B1.pdf', 'In BAUA 2 kopieren und verknüpfen');
    await aktivVonAussen('BAUA');
    await act(async () => void kopie.aktion());
    await warte();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht kopiert – inzwischen ist Antrag BAUA angezeigt.' });
    expect(ds.dateien.has(`${PROJEKT}/TÖB/BAUA 2/BS9 Lageplan B1.pdf`)).toBe(false);
  });

  it('BAUA eingereicht, Ablage-Menü „In BAUA 2 kopieren“ offen, dann zeigt das Projekt BAUA: Fassungswechsel gemeldet, nicht die Sperre von BAUA', async () => {
    await mitUmfangInBeiden();
    await act(() => useAntrag.getState().fassungWaehlen('BAUA'));
    await warte();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-03' }));
    await act(() => useAntrag.getState().fassungWaehlen('BAUA 2'));
    await warte();
    const punkte = dateiMenue(PROJEKT, 'Planung/BS9 Lageplan.pdf') as { text?: string; deaktiviert?: boolean; unter?: { text: string; aktion: () => void }[] }[];
    const verkn = punkte.find((x) => x.text === 'In BAUA 2 kopieren und verknüpfen')!;
    expect(verkn.deaktiviert).toBe(false);
    await aktivVonAussen('BAUA');
    await act(async () => void verkn.unter!.find((u) => u.text === 'Lageplan')!.aktion());
    await warte();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht kopiert – inzwischen ist Antrag BAUA angezeigt.' });
  });

  it('eingereichter Antrag: „Antragsdokument“ im Formularmenü und „… kopieren und verknüpfen“ in der Ablage sind gesperrt; ändern wird mit Grund abgewiesen', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await warte();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-03' }));
    await warte();
    const nav = [...host.querySelectorAll<HTMLElement>('.nav-eintrag')].find((b) => b.textContent?.includes('Muster') && !b.classList.contains('fehlt'))!;
    await rechtsklick(nav);
    expect(gesperrt(menuePunkt('Antragsdokument'))).toBe(true);
    const punkte = dateiMenue(PROJEKT, 'Planung/BS9 Lageplan.pdf') as { text?: string; deaktiviert?: boolean; hinweis?: string }[];
    expect(punkte.find((x) => x.text === 'In BAUA 2 kopieren und verknüpfen')).toMatchObject({ deaktiviert: true, hinweis: 'Antrag eingereicht' });
    // der Store weist das Ändern selbst ab – mit dem Sperrtext als Grund
    const sperre = 'Antrag BAUA 2 ist eingereicht (03.11.2026, von Hand gesetzt) und gesperrt. Zum Nachreichen den Status in den Antragsdaten vorübergehend auf „in Arbeit“ setzen';
    expect(await act(() => useAntrag.getState().umfangSetzen([]))).toEqual({ grund: sperre, vorab: 'sperre' });
    act(() => useFormulare.setState({ meldung: null }));
    await act(async () => void (await useAntrag.getState().umfangAendern((u) => u.slice(1), { was: 'Nicht entfernt' })));
    // die Sperre meldet sich als eigener Satz (mit dem Weg zum Entsperren)
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: `${sperre}.` });
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'bauantrag', 'lageplan']);
  });

  /** ohne Projektdatei: der Lageplan steht schon im Antragsumfang der Ansicht */
  const ohneOapMitLageplan = async () => {
    ds.dateien.delete(OAP);
    await projektBS9();
    useAntrag.setState({ projektdatei: { ...useAntrag.getState().projektdatei!, umfang: [{ id: 'lageplan', titel: 'Lageplan', art: 'extern', quelle: 'Planung', muster: '*Lageplan*' }] } });
  };
  /** hält das erste Auflisten an, das bei offenem Stammdaten-Dialog geschieht (das Neu-Prüfen nach dem Schreiben) */
  const listeBeiDialogAnhalten = () => {
    const echt = ds.liste.bind(ds);
    const z: { los: (() => void) | null } = { los: null };
    let einmal = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (einmal && useFormulare.getState().stammdatenDialog) {
        einmal = false;
        await new Promise<void>((r) => (z.los = r));
      }
      return echt(pfad, tiefe);
    };
    return z;
  };

  it('Verknüpfen mit Kopie: Dialog abgebrochen, während danach noch neu geprüft wird – keine Zusage hinterher', async () => {
    await ohneOapMitLageplan();
    const halt = listeBeiDialogAnhalten();
    let p!: Promise<void>;
    act(() => {
      p = dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan');
    });
    for (let i = 0; i < 20 && !halt.los; i++) await warte();
    expect(halt.los).toBeTruthy();
    act(() => useFormulare.getState().stammdatenAbbrechen());
    const abgebrochen = {
      art: 'info',
      text: '„BS9 Lageplan.pdf“ in BAUA 2 kopiert, aber nicht verknüpft – keine Projektdatei angelegt. Bitte später die Kopie in BAUA 2 über „Mit Antragsdokument verknüpfen“ verknüpfen, nicht noch einmal kopieren.',
    };
    expect(useFormulare.getState().meldung).toEqual(abgebrochen);
    halt.los!();
    await act(() => p);
    await warte();
    expect(useFormulare.getState().meldung).toEqual(abgebrochen);
  });

  it('Verknüpfen mit Kopie: Projektdatei angelegt, während danach noch neu geprüft wird – verknüpft, keine Zusage hinterher', async () => {
    await ohneOapMitLageplan();
    const halt2 = listeBeiDialogAnhalten();
    let p!: Promise<void>;
    act(() => {
      p = dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan');
    });
    for (let i = 0; i < 20 && !halt2.los; i++) await warte();
    // die Projektdatei entsteht (und die Änderung kommt hinein), während das Neu-Prüfen danach noch hängt
    await act(() => useFormulare.getState().projektdateiAnlegen(useFormulare.getState().stammdatenDialog!.meta));
    halt2.los!();
    await act(() => p);
    await warte();
    expect(((antragIn('BAUA 2')?.umfang as { id: string; dateien?: Record<string, string> }[]).find((u) => u.id === 'lageplan') ?? {}).dateien).toEqual({ 'BAUA 2': 'BS9 Lageplan.pdf' });
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: '„BS9 Lageplan.pdf“ in BAUA 2 kopiert und verknüpft.' });
  });

  it('erst Projektordner zuordnen, dann den Stammdaten-Dialog abbrechen bzw. schon den Ordner-Dialog: „nicht gespeichert“ wird gesagt', async () => {
    ds.dateien.set('C:/FORMA/K77/001-Muster.frmsjf', MUSTER);
    ds.dateien.set('C:/FORMA/K77/sj_office.ini', cp1252Schreiben('[Allgemeines]\r\nText=Kleiner Weg\r\n\r\n'));
    ds.ordner.add('Z:/Projekte/Kleiner Weg');
    const host = await render();
    await projektOeffnen(host, 'K77');
    await warte();
    // Ordner-Dialog abbrechen
    await act(async () => void (await useAntrag.getState().merkmalSetzen('Gebäudeklasse', '3')));
    await warte();
    expect(useFormulare.getState().ordnerDialog).toBeTruthy();
    act(() => useFormulare.getState().ordnerDialogSchliessen());
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Projektordner nicht zugeordnet – die Änderung ist nicht gespeichert.' });
    // Ordner gewählt, danach den Stammdaten-Dialog abbrechen
    await act(async () => void (await useAntrag.getState().merkmalSetzen('Gebäudeklasse', '3')));
    await warte();
    await act(() => useFormulare.getState().projektordnerWaehlen('Z:/Projekte/Kleiner Weg'));
    await warte();
    expect(useFormulare.getState().stammdatenDialog).toBeTruthy();
    act(() => useFormulare.getState().stammdatenAbbrechen());
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Projektdatei nicht angelegt – die Änderung ist nicht gespeichert.' });
  });

  it('neue Antragsfassung ohne Projektdatei, Dialog abgebrochen: der Ordner ist angelegt, nur nicht als aktive Fassung gespeichert', async () => {
    ds.dateien.delete(OAP);
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await act(() => useAntrag.getState().fassungWaehlen('BAUA 3', true));
    await warte();
    expect(useFormulare.getState().stammdatenDialog).toBeTruthy();
    act(() => useFormulare.getState().stammdatenAbbrechen());
    expect(ds.ordner.has(`${PROJEKT}/TÖB/BAUA 3`)).toBe(true);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Ordner BAUA 3 angelegt, aber nicht als aktive Antragsfassung gespeichert – keine Projektdatei angelegt.' });
  });

  /** hält das Auflisten eines Ordners an (Neu-Prüfen bzw. Laden), bis `los()` */
  const listeAnhalten = (passt: (pfad: string, tiefe: number) => boolean) => {
    const echt = ds.liste.bind(ds);
    const h: { erreicht: boolean; los: () => void } = { erreicht: false, los: () => undefined };
    let frei = false;
    const warten = new Promise<void>((r) => (h.los = () => ((frei = true), r())));
    ds.liste = async (pfad: string, tiefe: number) => {
      if (!frei && passt(pfad, tiefe)) {
        h.erreicht = true;
        await warten;
      }
      return echt(pfad, tiefe);
    };
    return h;
  };
  const PE = () => (window as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  /** zählt die Aufrufe von `laden` (z. B. das Neuladen als Sicherung am Ende des Neu-Prüfens) */
  const ladenZaehlen = () => {
    const echt = useAntrag.getState().laden;
    const z = { anzahl: 0 };
    useAntrag.setState({ laden: () => (z.anzahl++, echt()) });
    return z;
  };
  const nrVon = (fassung: string, id: string) => ((antragIn(fassung)?.umfang as { id: string; nr?: string }[]).find((u) => u.id === id) ?? {}).nr;

  it('↑/↓ zweimal schnell nacheinander, während nach dem ersten Schreiben noch neu geprüft wird: die Zeilen stimmen schon – zweimal nach unten', async () => {
    const host = await mitUmfangInBeiden();
    const griff = () => host.querySelector<HTMLElement>('[aria-label="Musterformular verschieben"]')!;
    const h = listeAnhalten((p, t) => p.endsWith('/TÖB/BAUA 2') && t === 1);
    act(() => void griff().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    for (let i = 0; i < 20 && !h.erreicht; i++) await warte();
    expect(h.erreicht).toBe(true);
    // das Neu-Prüfen hängt – die Zeilen zeigen trotzdem schon die neue Reihenfolge
    expect(useAntrag.getState().dokumente.map((d) => d.eintrag.id)).toEqual(['bauantrag', 'muster', 'lageplan']);
    act(() => void griff().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    await warte();
    h.los();
    await warte();
    await warte();
    expect(umfangIdsIn('BAUA 2')).toEqual(['bauantrag', 'lageplan', 'muster']);
  });

  it('Ziehen: kommt während des Ziehens ein Eintrag von woanders dazu, landet die gezogene Zeile dort, wo sie losgelassen wird (nach Kennung)', async () => {
    const host = await mitUmfangInBeiden();
    const P = PE();
    await act(async () => {
      host.querySelector<HTMLElement>('[aria-label="Musterformular verschieben"]')!.dispatchEvent(new P('pointerdown', { bubbles: true, cancelable: true, button: 0, clientY: 0 }));
    });
    // ein anderer Arbeitsplatz setzt „Statik“ an den Anfang
    await umfangVonAussen('BAUA 2', (u) => [{ id: 'statik', titel: 'Statik', art: 'extern' } as { id: string }, ...u]);
    await act(async () => {
      window.dispatchEvent(new P('pointermove', { bubbles: true, clientY: 500 }));
      window.dispatchEvent(new P('pointerup', { bubbles: true, clientY: 500 }));
    });
    await warte();
    expect(umfangIdsIn('BAUA 2')).toEqual(['statik', 'bauantrag', 'lageplan', 'muster']);
    // ganz nach oben gezogen, während oben „Plan“ dazukommt: oben ist oben (die jetzt angezeigten Zeilen zählen)
    await act(async () => {
      host.querySelector<HTMLElement>('[aria-label="Lageplan verschieben"]')!.dispatchEvent(new P('pointerdown', { bubbles: true, cancelable: true, button: 0, clientY: 0 }));
    });
    await umfangVonAussen('BAUA 2', (u) => [{ id: 'plan', titel: 'Plan', art: 'extern' } as { id: string }, ...u]);
    await act(async () => {
      window.dispatchEvent(new P('pointermove', { bubbles: true, clientY: -500 }));
      window.dispatchEvent(new P('pointerup', { bubbles: true, clientY: -500 }));
    });
    await warte();
    expect(umfangIdsIn('BAUA 2')).toEqual(['lageplan', 'plan', 'statik', 'bauantrag', 'muster']);
  });

  it('Antrag wird geöffnet (eigener Wechsel, Neu-Prüfen dauert): Antragsdaten ausgegraut und nicht bedienbar – Eingaben, Zeilenmenü und Entfernen ändern nichts', async () => {
    const host = await mitUmfangInBeiden();
    ds.dateien.set(
      OAP,
      oapMit(ds.dateien.get(OAP)!, (f) => {
        const a = f.antraege as Record<string, { umfang: { id: string; nr?: string }[] }>;
        a.BAUA.umfang = a.BAUA.umfang.map((u) => (u.id === 'lageplan' ? { ...u, nr: '05' } : u));
        a['BAUA 2'].umfang = a['BAUA 2'].umfang.map((u) => (u.id === 'lageplan' ? { ...u, nr: '03' } : u));
      }),
    );
    await act(() => useFormulare.getState().oapLaden());
    await warte();
    await klick(host.querySelector<HTMLButtonElement>('[aria-label="Lageplan bearbeiten"]')!);
    const h = listeAnhalten((p, t) => p.endsWith('/TÖB/BAUA') && t === 1);
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 30 && useAntrag.getState().projektdatei?.ansicht !== 'BAUA'; i++) await warte();
    await warte();
    // Umfang schon von BAUA, Zeilen noch von BAUA 2 – nicht bedienbar, mit Hinweis
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA');
    const inhalt = host.querySelector('.pu-inhalt')!;
    expect(inhalt.hasAttribute('inert')).toBe(true);
    expect(host.querySelector('.pu')!.getAttribute('aria-busy')).toBe('true');
    // Hinweis und Abblenden erst nach einem Moment (ein schneller Wechsel flackert nicht); die Live-Region ist schon da
    expect(host.querySelector('.pu-laedt-hinweis')?.textContent).toBe('');
    expect(inhalt.classList.contains('laedt')).toBe(false);
    await zeitVergeht(350);
    expect(host.querySelector('.pu-laedt-hinweis')?.textContent).toBe('Antrag BAUA wird geöffnet …');
    expect(inhalt.classList.contains('laedt')).toBe(true);
    // trotzdem ausgelöst (z. B. per Tastatur kurz vorher): nichts geändert, mit Grund
    const nr = zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
    expect(nr.value).toBe('03');
    eingabe(nr, '031');
    await verlassen(nr);
    await warte();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht geändert – Antrag BAUA wird gerade geöffnet; bitte gleich noch einmal versuchen.' });
    await klick(knopf(host.querySelector('.pu-zeile .pu-bearbeiten')!, 'Aus dem Antragsumfang nehmen'));
    await rechtsklick(zeileVon(host, 'Lageplan'));
    await klick(menuePunkt('Nach oben'));
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht verschoben – Antrag BAUA wird gerade geöffnet; bitte gleich noch einmal versuchen.' });
    h.los();
    await act(() => fw);
    await warte();
    expect(nrVon('BAUA', 'lageplan')).toBe('05');
    expect(nrVon('BAUA 2', 'lageplan')).toBe('03');
    expect(umfangIdsIn('BAUA')).toEqual(['muster', 'bauantrag', 'lageplan']);
    // fertig geöffnet: wieder bedienbar
    expect(host.querySelector('.pu-inhalt')!.hasAttribute('inert')).toBe(false);
    expect(host.querySelector('.pu-laedt-hinweis')?.textContent).toBe('');
    expect(host.querySelector('.pu')!.hasAttribute('aria-busy')).toBe(false);
  });

  it('Bearbeiten: Felder speichern im beim Speichern gelesenen Umfang – von woanders Ergänztes bleibt, Entferntes verschwindet sofort aus der Ansicht', async () => {
    const host = await mitUmfangInBeiden();
    await klick(host.querySelector<HTMLButtonElement>('[aria-label="Lageplan bearbeiten"]')!);
    eingabe(zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!, '07');
    await verlassen(zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!);
    await warte();
    expect(nrVon('BAUA 2', 'lageplan')).toBe('07');
    expect(nrVon('BAUA', 'lageplan')).toBeUndefined();
    // ein anderer Arbeitsplatz ergänzt „Statik“: das nächste Speichern behält sie
    await umfangVonAussen('BAUA 2', (u) => [...u, { id: 'statik', titel: 'Statik', art: 'extern' } as { id: string }]);
    eingabe(zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!, '08');
    await verlassen(zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!);
    await warte();
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'bauantrag', 'lageplan', 'statik']);
    expect(nrVon('BAUA 2', 'lageplan')).toBe('08');
    // woanders entfernt: die Zeile verschwindet sofort (neu berechnet), samt Bearbeiten
    await umfangVonAussen('BAUA 2', (u) => u.filter((x) => x.id !== 'lageplan'));
    expect(zeileVon(host, 'Lageplan')).toBeUndefined();
  });

  it('BAUA 2 eingereicht, Wechsel auf BAUA lädt: Antragsdaten nicht bedienbar, der eingereichte Antrag bleibt unverändert', async () => {
    const host = await mitUmfangInBeiden();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-03' }));
    await warte();
    const vorher = JSON.stringify(antragIn('BAUA 2')?.umfang);
    const h = listeAnhalten((p, t) => p.endsWith('/TÖB') && t === 1);
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 20 && !h.erreicht; i++) await warte();
    // aktiv schon BAUA (nicht eingereicht), angezeigt noch BAUA 2 – trotzdem nicht bedienbar
    expect(host.querySelector('.pu-inhalt')!.hasAttribute('inert')).toBe(true);
    const nr = zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
    eingabe(nr, '9');
    await verlassen(nr);
    await act(async () => void (await useAntrag.getState().merkmalSetzen('Gebäudeklasse', '5')));
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht gespeichert – Antrag BAUA wird gerade geöffnet; bitte gleich noch einmal versuchen.' });
    h.los();
    await act(() => fw);
    await warte();
    expect(JSON.stringify(antragIn('BAUA 2')?.umfang)).toBe(vorher);
    expect((antragIn('BAUA 2')?.merkmale as Record<string, string> | undefined)?.['Gebäudeklasse']).toBeUndefined();
  });

  it('Ablage „Antrag“: Menü „Als bereit markieren“ aus BAUA 2 offen, dann zeigt das Projekt BAUA – dort nichts markiert', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261110 01 Bauantrag.pdf`, new Uint8Array([1]));
    const host = await mitUmfangInBeiden();
    await klick(knopfGenau(host, 'Antrag'));
    const zeile = () => [...host.querySelectorAll('.fo-antrag-ablage .fo-bereit-zeile')].find((z) => z.textContent?.includes('Bauantrag.pdf'))!;
    await rechtsklick(zeile().querySelector('.fo-baum-zeile')!);
    await aktivVonAussen('BAUA');
    await klick(menuePunkt('Als bereit markieren'));
    await warte();
    expect(antragIn('BAUA')?.bereit).toBeUndefined();
    expect(antragIn('BAUA 2')?.bereit).toBeUndefined();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht als bereit markiert – inzwischen ist Antrag BAUA angezeigt.' });
    // ohne Wechsel markiert derselbe Menüpunkt in der Fassung der Liste
    await aktivVonAussen('BAUA 2');
    await rechtsklick(zeile().querySelector('.fo-baum-zeile')!);
    await klick(menuePunkt('Als bereit markieren'));
    await warte();
    expect(antragIn('BAUA 2')?.bereit).toEqual([expect.objectContaining({ datei: 'BS9 BAUA 261110 01 Bauantrag.pdf' })]);
  });

  it('eingereicht: „Als bereit markieren“ und das Zeilenmenü der Antragsdaten sind ausgegraut, mit Hinweis „Antrag eingereicht“', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261110 01 Bauantrag.pdf`, new Uint8Array([1]));
    const host = await mitUmfangInBeiden();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-03' }));
    await warte();
    const punkt = (text: string) => ({ aus: gesperrt(menuePunkt(text)), hinweis: menuePunkt(text).querySelector('.menue-hinweis')?.textContent });
    expect(zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')).toMatchObject({ disabled: true, title: expect.stringMatching(/^Der Antrag ist eingereicht und gesperrt/) });
    await rechtsklick(zeileVon(host, 'Lageplan'));
    expect(punkt('Aus dem Antragsumfang nehmen')).toEqual({ aus: true, hinweis: 'Antrag eingereicht' });
    expect(punkt('Bearbeiten')).toEqual({ aus: true, hinweis: 'Antrag eingereicht' });
    act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await rechtsklick(navFehlt(host, 'Bauantrag'));
    expect(punkt('Formular anlegen')).toEqual({ aus: true, hinweis: 'Antrag eingereicht' });
    expect(punkt('Aus dem Antragsumfang nehmen')).toEqual({ aus: true, hinweis: 'Antrag eingereicht' });
    act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await klick(knopfGenau(host, 'Antrag'));
    const zeile = [...host.querySelectorAll('.fo-antrag-ablage .fo-bereit-zeile')].find((z) => z.textContent?.includes('Bauantrag.pdf'))!;
    expect(zeile.querySelector<HTMLButtonElement>('.fo-bereit-knopf')!.disabled).toBe(true);
    await rechtsklick(zeile.querySelector('.fo-baum-zeile')!);
    expect(punkt('Als bereit markieren')).toEqual({ aus: true, hinweis: 'Antrag eingereicht' });
  });

  it('neue Antragsfassung ohne Projektordner, Ordner-Dialog abgebrochen: kein „Ordner angelegt“, sondern die allgemeine Meldung', async () => {
    ds.dateien.set('C:/FORMA/K77/001-Muster.frmsjf', MUSTER);
    ds.dateien.set('C:/FORMA/K77/sj_office.ini', cp1252Schreiben('[Allgemeines]\r\nText=Kleiner Weg\r\n\r\n'));
    const host = await render();
    await projektOeffnen(host, 'K77');
    await warte();
    await act(() => useAntrag.getState().fassungWaehlen('BAUA 3', true));
    await warte();
    expect(useFormulare.getState().ordnerDialog).toBeTruthy();
    act(() => useFormulare.getState().ordnerDialogSchliessen());
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Projektordner nicht zugeordnet – die Änderung ist nicht gespeichert.' });
    expect([...ds.ordner].filter((o) => o.includes('BAUA 3'))).toEqual([]);
  });

  it('„Dokument hinzufügen“: Katalogeintrag bzw. Vorlage, die inzwischen woanders ergänzt wurden, kommen nicht doppelt – aus BAUA 2 bei angezeigtem BAUA nichts', async () => {
    const host = await mitUmfangInBeiden();
    await umfangVonAussen('BAUA 2', (u) => u.filter((x) => x.id !== 'lageplan'));
    await klick(knopf(host, 'Dokument hinzufügen'));
    await umfangVonAussen('BAUA 2', (u) => [...u, { id: 'lageplan', titel: 'Lageplan', art: 'extern' } as { id: string }]);
    await klick(menuePunkt('Lageplan'));
    await warte();
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'bauantrag', 'lageplan']);
    // „Aus Vorlage ergänzen“ aus BAUA 2, dann zeigt das Projekt BAUA
    await umfangVonAussen('BAUA 2', (u) => u.filter((x) => x.id === 'muster'));
    await bauaNurStatik();
    await klick(knopf(host, 'Dokument hinzufügen'));
    await klick(menuePunkt('Aus Vorlage ergänzen'));
    await aktivVonAussen('BAUA');
    await klick(menuePunkt('Bauantrag (2 fehlen)'));
    await warte();
    expect(umfangIdsIn('BAUA')).toEqual(['statik']);
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster']);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht hinzugefügt – inzwischen ist Antrag BAUA angezeigt.' });
  });

  it('Alle Formulare exportieren, während ein Fassungswechsel lädt: exportiert, aber nicht in den Umfang der bisherigen Fassung verknüpft', async () => {
    await mitUmfangInBeiden();
    const h = listeAnhalten((p, t) => p.endsWith('/TÖB') && t === 1);
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 20 && !h.erreicht; i++) await warte();
    await act(async () => void (await useAntrag.getState().alleExportieren()));
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: '1 von 1 Formularen als PDF nach TÖB/BAUA exportiert.' });
    h.los();
    await act(() => fw);
    await warte();
    expect([...ds.dateien.keys()].some((k) => k.startsWith(`${PROJEKT}/TÖB/BAUA/`) && k.endsWith('Musterformular.pdf'))).toBe(true);
    const dateienVon = (f: string) => ((antragIn(f)?.umfang as { id: string; dateien?: Record<string, string> }[]).find((u) => u.id === 'muster') ?? {}).dateien;
    expect(dateienVon('BAUA 2')).toBeUndefined();
  });

  it('Formular anlegen, inzwischen andere Fassung angezeigt, ein gleichnamiges Formular gibt es schon: der Weg nennt die Fassung', async () => {
    h24Vorbereiten();
    ds.dateien.set('C:/FORMA/BS9/000-Bauantrag (2024).frmsjf', MUSTER);
    await mitUmfangInBeiden();
    const halt = einmalAnhalten('formularAnlegen');
    let laeuft!: Promise<string | null>;
    act(() => {
      laeuft = useAntrag.getState().formularAnlegen('bauantrag', { ansicht: 'BAUA 2' });
    });
    for (let i = 0; i < 20 && !halt.los; i++) await warte();
    expect(halt.los).toBeTruthy();
    await act(() => useAntrag.getState().fassungWaehlen('BAUA'));
    await warte();
    halt.los!();
    await act(() => laeuft);
    await warte();
    expect(useFormulare.getState().meldung?.text).toMatch(
      /aber nicht zugeordnet – inzwischen ist Antrag BAUA angezeigt\. Bitte später zu Antrag BAUA 2 wechseln und per Rechtsklick auf „002-Bauantrag \(2026\)“ in der Navigation › „Antragsdokument“ › „Bauantrag“ zuordnen\.$/,
    );
  });

  it('Verknüpfen mit Kopie, inzwischen eingereicht: kopiert, nicht verknüpft – der Sperrtext als eigener Satz', async () => {
    await mitUmfangInBeiden();
    const halt = einmalAnhalten('kopieren');
    let lauf!: Promise<void>;
    act(() => {
      lauf = dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan', { fassung: 'BAUA 2', titel: 'Lageplan' });
    });
    for (let i = 0; i < 20 && !halt.los; i++) await warte();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-03' }));
    await warte();
    halt.los!();
    await act(() => lauf);
    await warte();
    expect(useFormulare.getState().meldung).toEqual({
      art: 'info',
      text: '„BS9 Lageplan.pdf“ in BAUA 2 kopiert, aber nicht verknüpft. Antrag BAUA 2 ist eingereicht (03.11.2026, von Hand gesetzt) und gesperrt. Zum Nachreichen den Status in den Antragsdaten vorübergehend auf „in Arbeit“ setzen. Danach die Kopie verknüpfen, nicht noch einmal kopieren.',
    });
  });

  it('„Antragsumfang aufheben“ fragt nach – Abbrechen lässt ihn stehen', async () => {
    const host = await mitUmfangInBeiden();
    await klick(knopf(host, 'Antragsumfang aufheben'));
    const dialog = () => host.querySelector('.modal.rf');
    expect(dialog()?.textContent).toContain('Antragsumfang von BAUA 2 aufheben?');
    await klick(knopf(dialog()!, 'Abbrechen'));
    await warte();
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'bauantrag', 'lageplan']);
    await klick(knopf(host, 'Antragsumfang aufheben'));
    await klick(knopf(dialog()!, 'Aufheben'));
    await warte();
    expect(antragIn('BAUA 2')?.umfang).toBeUndefined();
    expect(umfangIdsIn('BAUA')).toEqual(['muster', 'bauantrag', 'lageplan']);
  });

  it('Navigation: Menü eines fehlenden Formulars während des Öffnens von BAUA aufgemacht (Zeilen noch von BAUA 2): ausgegraut, auch danach – nichts in BAUA', async () => {
    const host = await mitUmfangInBeiden();
    const h = listeAnhalten((p, t) => p.endsWith('/TÖB/BAUA') && t === 1);
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 30 && useAntrag.getState().projektdatei?.ansicht !== 'BAUA'; i++) await warte();
    await warte();
    // Umfang schon BAUA, die Navigation zeigt noch die fehlenden Formulare von BAUA 2 – ihre Menüpunkte sind ausgegraut
    await rechtsklick(navFehlt(host, 'Bauantrag'));
    expect(gesperrt(menuePunkt('Aus dem Antragsumfang nehmen'))).toBe(true);
    expect(menuePunkt('Aus dem Antragsumfang nehmen').querySelector('.menue-hinweis')?.textContent).toBe('Antrag wird geöffnet');
    h.los();
    await act(() => fw);
    await warte();
    // das Menü von vorhin bleibt so – ein Klick ändert nichts
    await klick(menuePunkt('Aus dem Antragsumfang nehmen'));
    await warte();
    expect(umfangIdsIn('BAUA')).toContain('bauantrag');
  });

  it('während des Öffnens: „Antragsumfang aufheben“ bzw. ein direktes Setzen ändert nichts; ein Zeilenmenü von vorher gilt danach nicht', async () => {
    const host = await mitUmfangInBeiden();
    const h = listeAnhalten((p, t) => p.endsWith('/TÖB/BAUA') && t === 1);
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 30 && useAntrag.getState().projektdatei?.ansicht !== 'BAUA'; i++) await warte();
    await warte();
    expect(await act(() => useAntrag.getState().umfangSetzen(null))).toEqual({ grund: 'Antrag BAUA wird gerade geöffnet', vorab: 'fassung', erneut: true });
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Antragsumfang nicht geändert – Antrag BAUA wird gerade geöffnet; bitte gleich noch einmal versuchen.' });
    // Zeilenmenü der noch angezeigten Zeile von BAUA 2 (per Tastatur erreichbar gewesen), geklickt erst nach dem Öffnen
    await rechtsklick(zeileVon(host, 'Lageplan'));
    h.los();
    await act(() => fw);
    await warte();
    await klick(menuePunkt('Aus dem Antragsumfang nehmen'));
    await warte();
    expect(umfangIdsIn('BAUA')).toEqual(['muster', 'bauantrag', 'lageplan']);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht entfernt – inzwischen ist Antrag BAUA angezeigt.' });
  });

  it('Neu-Prüfen der bisherigen Fassung kommt erst nach dem Wechsel zurück: es gilt nicht – Dateien und Zeilen bleiben die der neuen', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 Nur in BAUA 2.pdf`, new Uint8Array([1]));
    await mitUmfangInBeiden();
    const h = listeAnhalten((p, t) => p.endsWith('/TÖB/BAUA 2') && t === 1);
    let alt!: Promise<void>;
    act(() => {
      alt = useAntrag.getState().aktualisieren();
    });
    for (let i = 0; i < 20 && !h.erreicht; i++) await warte();
    await act(() => useAntrag.getState().fassungWaehlen('BAUA'));
    await warte();
    expect(useAntrag.getState().dateienOrdner).toBe(`${PROJEKT}/TÖB/BAUA`);
    h.los();
    await act(() => alt);
    await warte();
    expect(useAntrag.getState().dateienOrdner).toBe(`${PROJEKT}/TÖB/BAUA`);
    expect(useAntrag.getState().dateien.map((d) => d.pfad)).not.toContain('BS9 Nur in BAUA 2.pdf');
    expect(useAntrag.getState().dokumenteFuer).toBe('BAUA');
  });

  it('Verknüpfen in der Ablage, während der Umfang schon von BAUA, die Zeilen noch von BAUA 2 sind: nichts kopiert, „wird gerade geöffnet“', async () => {
    await mitUmfangInBeiden();
    const h = listeAnhalten((p, t) => p.endsWith('/TÖB/BAUA') && t === 1);
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 30 && useAntrag.getState().projektdatei?.ansicht !== 'BAUA'; i++) await warte();
    await warte();
    await act(() => dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan', { fassung: 'BAUA', titel: 'Lageplan' }));
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht kopiert – Antrag BAUA wird gerade geöffnet; bitte gleich noch einmal versuchen.' });
    expect(ds.dateien.has(`${PROJEKT}/TÖB/BAUA/BS9 Lageplan.pdf`)).toBe(false);
    h.los();
    await act(() => fw);
    await warte();
  });

  it('anderer Arbeitsplatz macht BAUA aktiv (hier noch nicht gelesen), dann eine eigene Änderung: die Ansicht folgt, die Sperre endet', async () => {
    const host = await mitUmfangInBeiden();
    const laden = ladenZaehlen();
    ds.dateien.set(OAP, oapMit(ds.dateien.get(OAP)!, (f) => void (f.aktiveFassung = 'BAUA')));
    const nr = host.querySelector<HTMLInputElement>('.pu-zeile .pu-nr')!;
    eingabe(nr, '01');
    await verlassen(nr);
    for (let i = 0; i < 12; i++) await warte();
    // die Änderung ging in die Zeile, in der getippt wurde (BAUA 2) – angezeigt wird jetzt BAUA, bedienbar
    expect(nrVon('BAUA 2', 'muster')).toBe('01');
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA');
    expect(wechselLaeuft(useAntrag.getState(), useFormulare.getState().projekt)).toBeNull();
    expect(host.querySelector('.pu-inhalt')!.hasAttribute('inert')).toBe(false);
    expect(useAntrag.getState().dokumenteFuer).toBe('BAUA');
    // die Ansicht folgt schon beim Speichern – ohne das Neuladen als Sicherung
    expect(laden.anzahl).toBe(0);
  });

  it('BAUA ausdrücklich gewählt, ein anderer Arbeitsplatz entfernt die aktive Fassung aus der Projektdatei: die vorgegebene wird angezeigt, nichts hängt', async () => {
    const host = await mitUmfangInBeiden();
    await act(() => useAntrag.getState().fassungWaehlen('BAUA'));
    await warte();
    const laden = ladenZaehlen();
    ds.dateien.set(OAP, oapMit(ds.dateien.get(OAP)!, (f) => void delete f.aktiveFassung));
    await act(() => useFormulare.getState().oapLaden());
    for (let i = 0; i < 12; i++) await warte();
    expect(wechselLaeuft(useAntrag.getState(), useFormulare.getState().projekt)).toBeNull();
    // schon beim Lesen passend – ohne das Neuladen als Sicherung
    expect(laden.anzahl).toBe(0);
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA 2');
    expect(host.querySelector('.pu-inhalt')!.hasAttribute('inert')).toBe(false);
  });

  it('BAUA öffnen, das Neu-Prüfen hängt beim Lesen eines Formulars, dann zurück zu BAUA 2: Dateien von BAUA gelten in BAUA 2 nie', async () => {
    await mitUmfangInBeiden();
    // Formular inzwischen geändert: es wird neu gelesen (Netz) – das hält das Neu-Prüfen nach dem Lesen der Ordner an
    ds.geaendert.set('C:/FORMA/BS9/001-Muster.frmsjf', 9e12);
    const lies = ds.lies.bind(ds);
    const wartende: (() => void)[] = [];
    let halten = true;
    ds.lies = async (r: string, pfad: string) => {
      if (halten && pfad.endsWith('001-Muster.frmsjf')) await new Promise<void>((x) => wartende.push(x));
      return lies(r, pfad);
    };
    let fw1!: Promise<void>;
    act(() => {
      fw1 = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 40 && !wartende.length; i++) await warte();
    halten = false;
    const h = listeAnhalten((p, t) => p.endsWith('/TÖB/BAUA 2') && t === 1);
    let fw2!: Promise<void>;
    act(() => {
      fw2 = useAntrag.getState().fassungWaehlen('BAUA 2');
    });
    for (let i = 0; i < 40 && !h.erreicht; i++) await warte();
    // die Dateien der Ablage sind nie die von TÖB/BAUA, solange BAUA 2 angezeigt ist
    expect(useAntrag.getState().dateienOrdner).not.toBe(`${PROJEKT}/TÖB/BAUA`);
    expect(useAntrag.getState().dateien.map((d) => d.pfad)).not.toContain('BS9 GP 260101 Bauantrag.pdf');
    h.los();
    wartende.forEach((x) => x());
    await act(() => fw1);
    await act(() => fw2);
    for (let i = 0; i < 6; i++) await warte();
    expect(useAntrag.getState().dateienOrdner).toBe(`${PROJEKT}/TÖB/BAUA 2`);
    expect(useAntrag.getState().dokumenteFuer).toBe('BAUA 2');
  });

  it('Autofill-Zustand gespeichert, während BAUA geöffnet wird: er kommt in BAUA (den Antrag, der geöffnet wird)', async () => {
    await mitUmfangInBeiden();
    const h = listeAnhalten((p, t) => p.endsWith('/TÖB') && t === 1);
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 40 && !h.erreicht; i++) await warte();
    await act(() => useAntrag.getState().zustaendeSetzen({ '001-Muster.frmsjf': { felder: { x: { auto: 'Musterstraße 9' } } } as never }));
    h.los();
    await act(() => fw);
    for (let i = 0; i < 6; i++) await warte();
    expect(antragIn('BAUA 2')?.felder).toBeUndefined();
    expect(Object.keys((antragIn('BAUA')?.felder as Record<string, unknown> | undefined) ?? {})).toEqual(['001-Muster.frmsjf']);
    expect(Object.keys(useAntrag.getState().projektdatei?.felder ?? {})).toEqual(['001-Muster.frmsjf']);
  });

  it('Bearbeiten-Felder: getippt wird im Feld, gespeichert beim Verlassen bzw. mit Enter – bei langsamem Speichern geht nichts verloren, Esc verwirft', async () => {
    const host = await mitUmfangInBeiden();
    await klick(host.querySelector<HTMLButtonElement>('[aria-label="Lageplan bearbeiten"]')!);
    const echt = useFormulare.getState().oapAendern;
    let los!: () => void;
    const tor = new Promise<void>((r) => (los = r));
    let schreiben = 0;
    useFormulare.setState({ oapAendern: async (f) => (schreiben++, await tor, echt(f)) });
    const titel = () => host.querySelector<HTMLInputElement>('.pu-zeile .pu-bearbeiten input')!;
    eingabe(titel(), 'LageplanA');
    eingabe(titel(), `${titel().value}B`);
    expect(titel().value).toBe('LageplanAB');
    expect(schreiben).toBe(0);
    await verlassen(titel());
    // das Speichern hängt (Netz): das Feld zeigt weiter das Getippte
    expect(titel().value).toBe('LageplanAB');
    los();
    for (let i = 0; i < 8; i++) await warte();
    useFormulare.setState({ oapAendern: echt });
    expect(schreiben).toBe(1);
    expect(((antragIn('BAUA 2')!.umfang as { id: string; titel: string }[]).find((u) => u.id === 'lageplan') ?? { titel: '' }).titel).toBe('LageplanAB');
    // Enter übernimmt, Esc verwirft
    const nr = zeileVon(host, 'LageplanAB').querySelector<HTMLInputElement>('.pu-nr')!;
    eingabe(nr, '04');
    act(() => void nr.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await warte();
    expect(nrVon('BAUA 2', 'lageplan')).toBe('04');
    eingabe(nr, '05');
    act(() => void nr.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await verlassen(nr);
    await warte();
    expect(nr.value).toBe('04');
    expect(nrVon('BAUA 2', 'lageplan')).toBe('04');
  });

  it('PDF-Export bzw. alle exportieren, während BAUA geöffnet wird (Ordner schon gelesen): die neuen Dateien stehen danach in der Liste', async () => {
    await mitUmfangInBeiden();
    const pfad = useFormulare.getState().formulare[0].pfad;
    const h = listeAnhalten((p, t) => p.endsWith('/TÖB/BAUA') && t === 6);
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 40 && !h.erreicht; i++) await warte();
    let ex!: Promise<string | null>;
    act(() => {
      ex = useAntrag.getState().exportieren(pfad, { ordner: 'TÖB/BAUA', name: 'BS9 Neu Export.pdf' }, false);
    });
    let alle!: Promise<number>;
    act(() => {
      alle = useAntrag.getState().alleExportieren();
    });
    for (let i = 0; i < 6; i++) await warte();
    h.los();
    await act(() => fw);
    await act(() => ex);
    await act(() => alle);
    for (let i = 0; i < 8; i++) await warte();
    const imOrdner = [...ds.dateien.keys()].filter((k) => k.startsWith(`${PROJEKT}/TÖB/BAUA/`)).map((k) => k.slice(`${PROJEKT}/TÖB/BAUA/`.length));
    expect(imOrdner).toContain('BS9 Neu Export.pdf');
    expect(useAntrag.getState().dateien.map((d) => d.pfad).sort()).toEqual(imOrdner.sort());
  });

  it('„Antragsumfang aufheben …“: Rückfrage für BAUA 2 offen, inzwischen zeigt das Projekt BAUA – nichts aufgehoben, mit Grund', async () => {
    const host = await mitUmfangInBeiden();
    await klick(knopf(host, 'Antragsumfang aufheben'));
    await aktivVonAussen('BAUA');
    await klick(knopf(host.querySelector('.modal.rf')!, 'Aufheben'));
    await warte();
    expect(umfangIdsIn('BAUA')).toEqual(['muster', 'bauantrag', 'lageplan']);
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'bauantrag', 'lageplan']);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Antragsumfang nicht aufgehoben – inzwischen ist Antrag BAUA angezeigt.' });
  });

  it('während ein Antrag geöffnet wird: „bereit“, Navigation und Ablage ausgegraut mit Hinweis „Antrag wird geöffnet“; die Meldung wie sonst bei „bereit“', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261110 01 Bauantrag.pdf`, new Uint8Array([1]));
    const host = await mitUmfangInBeiden();
    await klick(knopfGenau(host, 'Antrag'));
    const h = listeAnhalten((p, t) => p.endsWith('/TÖB') && t === 1);
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 40 && !h.erreicht; i++) await warte();
    const zeile = [...host.querySelectorAll('.fo-antrag-ablage .fo-bereit-zeile')].find((z) => z.textContent?.includes('Bauantrag.pdf'))!;
    expect(zeile.querySelector<HTMLButtonElement>('.fo-bereit-knopf')).toMatchObject({ disabled: true, title: 'Der Antrag wird gerade geöffnet – gleich wieder möglich' });
    const punkt = (text: string) => ({ aus: gesperrt(menuePunkt(text)), hinweis: menuePunkt(text).querySelector('.menue-hinweis')?.textContent });
    await rechtsklick(zeile.querySelector('.fo-baum-zeile')!);
    expect(punkt('Als bereit markieren')).toEqual({ aus: true, hinweis: 'Antrag wird geöffnet' });
    act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await rechtsklick(navFehlt(host, 'Bauantrag'));
    expect(punkt('Formular anlegen')).toEqual({ aus: true, hinweis: 'Antrag wird geöffnet' });
    act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect((dateiMenue(PROJEKT, 'Planung/BS9 Lageplan.pdf') as { text?: string; deaktiviert?: boolean; hinweis?: string }[]).find((x) => x.text?.includes('verknüpfen'))).toMatchObject({ deaktiviert: true, hinweis: 'Antrag wird geöffnet' });
    // trotzdem ausgelöst: dieselbe Art Meldung wie sonst bei „bereit“
    await act(() => useAntrag.getState().bereitUmschalten('BS9 BAUA 261110 01 Bauantrag.pdf', { fassung: 'BAUA 2' }));
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht als bereit markiert – Antrag BAUA wird gerade geöffnet; bitte gleich noch einmal versuchen.' });
    h.los();
    await act(() => fw);
    await warte();
  });

  it('Sicherung: passen angezeigte und aktive Fassung nach dem Neu-Prüfen nicht zusammen, wird der Antrag neu geladen – die Sperre endet', async () => {
    const host = await mitUmfangInBeiden();
    // künstlich: aktiv BAUA, angezeigt BAUA 2 – ohne dass ein Laden läuft
    act(() => useAntrag.setState({ projektdatei: { ...useAntrag.getState().projektdatei!, aktiveFassung: 'BAUA' } }));
    expect(wechselLaeuft(useAntrag.getState(), useFormulare.getState().projekt)).toBe('BAUA');
    await act(() => useAntrag.getState().aktualisieren());
    for (let i = 0; i < 12; i++) await warte();
    expect(wechselLaeuft(useAntrag.getState(), useFormulare.getState().projekt)).toBeNull();
    expect(host.querySelector('.pu-inhalt')!.hasAttribute('inert')).toBe(false);
  });

  /** Speichern in die .oap anhalten (Netz): zählt die Schreibvorgänge, `los()` lässt alle weiter */
  const schreibenAufhalten = () => {
    const echt = useFormulare.getState().oapAendern;
    let los!: () => void;
    const tor = new Promise<void>((r) => (los = r));
    const z = { anzahl: 0, los: () => los(), zurueck: () => useFormulare.setState({ oapAendern: echt }) };
    useFormulare.setState({ oapAendern: async (f) => (z.anzahl++, await tor, echt(f)) });
    return z;
  };

  it('Textfeld: während des Speicherns auf den alten Wert zurückkorrigiert – der korrigierte Wert wird danach gespeichert', async () => {
    const host = await mitUmfangInBeiden();
    const nr = () => zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
    eingabe(nr(), '03');
    await verlassen(nr());
    await warte();
    expect(nrVon('BAUA 2', 'lageplan')).toBe('03');
    const halt = schreibenAufhalten();
    eingabe(nr(), '07');
    await verlassen(nr());
    eingabe(nr(), '03');
    await verlassen(nr());
    expect(nr().value).toBe('03');
    halt.los();
    for (let i = 0; i < 10; i++) await warte();
    halt.zurueck();
    expect(halt.anzahl).toBe(2);
    expect(nrVon('BAUA 2', 'lageplan')).toBe('03');
    expect(nr().value).toBe('03');
  });

  it('Textfeld: Enter, Enter und Verlassen, während das Speichern läuft – nur ein Schreibvorgang', async () => {
    const host = await mitUmfangInBeiden();
    const nr = () => zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
    const halt = schreibenAufhalten();
    eingabe(nr(), '07');
    act(() => void nr().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    act(() => void nr().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await verlassen(nr());
    halt.los();
    for (let i = 0; i < 10; i++) await warte();
    halt.zurueck();
    expect(halt.anzahl).toBe(1);
    expect(nrVon('BAUA 2', 'lageplan')).toBe('07');
  });

  it('Textfeld: in BAUA 2 getippt, inzwischen zeigt das Projekt BAUA (von außen) – beim Verlassen nichts in BAUA, mit Grund', async () => {
    const host = await mitUmfangInBeiden();
    const nr = () => zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
    eingabe(nr(), '77');
    await aktivVonAussen('BAUA');
    // dieselbe Zeile (gleiche Kennung) zeigt noch den Entwurf
    expect(nr().value).toBe('77');
    await verlassen(nr());
    await warte();
    expect(nrVon('BAUA', 'lageplan')).toBeUndefined();
    expect(nrVon('BAUA 2', 'lageplan')).toBeUndefined();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht geändert – inzwischen ist Antrag BAUA angezeigt.' });
    expect(nr().value).toBe('');
  });

  it('Textfeld: Speichern scheitert – das Getippte bleibt markiert stehen, Enter versucht es erneut; ein leerer Titel wird nicht gespeichert', async () => {
    const host = await mitUmfangInBeiden();
    const echt = useFormulare.getState().oapAendern;
    useFormulare.setState({
      oapAendern: async () => {
        throw new Error('Zugriff verweigert');
      },
    });
    await klick(host.querySelector<HTMLButtonElement>('[aria-label="Lageplan bearbeiten"]')!);
    const titel = () => host.querySelector<HTMLInputElement>('.pu-zeile .pu-bearbeiten input')!;
    eingabe(titel(), 'Lageplan 1:500');
    await verlassen(titel());
    for (let i = 0; i < 4; i++) await warte();
    expect(titel().value).toBe('Lageplan 1:500');
    expect(titel().classList.contains('feld-fehler')).toBe(true);
    expect(titel().getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector(`#${CSS.escape(titel().getAttribute('aria-describedby')!)}`)?.textContent).toBe('Nicht gespeichert – Enter im Feld versucht es erneut, Esc verwirft.');
    // wieder erreichbar: Enter speichert
    useFormulare.setState({ oapAendern: echt });
    act(() => void titel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    for (let i = 0; i < 4; i++) await warte();
    expect(((antragIn('BAUA 2')!.umfang as { id: string; titel: string }[]).find((u) => u.id === 'lageplan') ?? { titel: '' }).titel).toBe('Lageplan 1:500');
    expect(titel().classList.contains('feld-fehler')).toBe(false);
    // leer: markiert, nichts gespeichert; Esc stellt den Titel wieder her
    eingabe(titel(), '  ');
    await verlassen(titel());
    expect(titel().classList.contains('feld-fehler')).toBe(true);
    expect(host.querySelector(`#${CSS.escape(titel().getAttribute('aria-describedby')!)}`)?.textContent).toBe('Der Titel darf nicht leer sein – Esc stellt „Lageplan 1:500“ wieder her.');
    act(() => void titel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(titel().value).toBe('Lageplan 1:500');
    expect(titel().classList.contains('feld-fehler')).toBe(false);
  });

  it('Textfeld: getippt, nicht verlassen – nimmt ein anderer Arbeitsplatz die Zeile heraus, sagt eine Meldung, dass es nicht gespeichert ist', async () => {
    const host = await mitUmfangInBeiden();
    eingabe(zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!, '12');
    await umfangVonAussen('BAUA 2', (u) => u.filter((x) => x.id !== 'lageplan'));
    expect(zeileVon(host, 'Lageplan')).toBeUndefined();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: '„12“ bei „Lageplan“ nicht gespeichert – der Eintrag ist nicht mehr angezeigt.' });
  });

  it('Navigation: fehlender Eintrag während des Öffnens – ohne „anlegen“, Tooltip mit Grund; ein Klick meldet „Formular nicht angelegt“', async () => {
    const host = await mitUmfangInBeiden();
    const h = listeAnhalten((p, t) => p.endsWith('/TÖB') && t === 1);
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 40 && !h.erreicht; i++) await warte();
    const eintrag = navFehlt(host, 'Bauantrag');
    expect(eintrag.querySelector('.nav-unter')).toBeNull();
    expect(eintrag.title).toBe('Bauantrag fehlt – der Antrag wird gerade geöffnet, gleich wieder möglich');
    const vorher = bs9Formulare().length;
    await klick(eintrag);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Formular nicht angelegt – Antrag BAUA wird gerade geöffnet; bitte gleich noch einmal versuchen.' });
    expect(bs9Formulare().length).toBe(vorher);
    h.los();
    await act(() => fw);
    await warte();
    expect(navFehlt(host, 'Bauantrag').querySelector('.nav-unter')?.textContent).toBe('anlegen');
  });

  it('zwei Felder nacheinander übernommen, während das erste Speichern hängt: beide stehen in der Datei – auch zwei Felder derselben Zeile', async () => {
    const host = await mitUmfangInBeiden();
    const nr = (titel: string) => zeileVon(host, titel).querySelector<HTMLInputElement>('.pu-nr')!;
    const halt = schreibenAufhalten();
    eingabe(nr('Lageplan'), '01');
    await verlassen(nr('Lageplan'));
    eingabe(nr('Bauantrag'), '02');
    await verlassen(nr('Bauantrag'));
    halt.los();
    for (let i = 0; i < 10; i++) await warte();
    halt.zurueck();
    expect(nrVon('BAUA 2', 'lageplan')).toBe('01');
    expect(nrVon('BAUA 2', 'bauantrag')).toBe('02');
    // Titel, dann (Tab) Muster derselben Zeile
    await klick(host.querySelector<HTMLButtonElement>('[aria-label="Lageplan bearbeiten"]')!);
    const felder = () => [...host.querySelectorAll<HTMLInputElement>('.pu-zeile .pu-bearbeiten input')];
    const halt2 = schreibenAufhalten();
    eingabe(felder()[0], 'Lageplan 1:500');
    await verlassen(felder()[0]);
    const muster = felder().find((f) => f.placeholder.startsWith('*'))!;
    eingabe(muster, '*LP*');
    await verlassen(muster);
    halt2.los();
    for (let i = 0; i < 10; i++) await warte();
    halt2.zurueck();
    expect((antragIn('BAUA 2')!.umfang as { id: string; titel: string; muster?: string }[]).find((u) => u.id === 'lageplan')).toMatchObject({ titel: 'Lageplan 1:500', muster: '*LP*' });
  });

  it('Speichern hängt, ein anderer Arbeitsplatz nimmt die Zeile heraus: sie kommt nicht zurück, die Meldung sagt es', async () => {
    const host = await mitUmfangInBeiden();
    const nr = zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
    const halt = schreibenAufhalten();
    eingabe(nr, '07');
    await verlassen(nr);
    await umfangVonAussen('BAUA 2', (u) => u.filter((x) => x.id !== 'lageplan'));
    halt.los();
    for (let i = 0; i < 10; i++) await warte();
    halt.zurueck();
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'bauantrag']);
    expect(zeileVon(host, 'Lageplan')).toBeUndefined();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht geändert – der Eintrag „Lageplan“ ist inzwischen nicht mehr im Antragsumfang.' });
  });

  it('Textfeld: während des Speicherns hin und her bestätigt – das zuletzt Bestätigte gilt; Esc während des Speicherns lässt keine Markierung zurück', async () => {
    const host = await mitUmfangInBeiden();
    const nr = () => zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
    const enter = () => act(() => void nr().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    eingabe(nr(), '03');
    await verlassen(nr());
    await warte();
    const halt = schreibenAufhalten();
    eingabe(nr(), '07');
    enter();
    eingabe(nr(), '03');
    enter();
    eingabe(nr(), '07');
    enter();
    halt.los();
    for (let i = 0; i < 10; i++) await warte();
    halt.zurueck();
    expect(nrVon('BAUA 2', 'lageplan')).toBe('07');
    expect(nr().value).toBe('07');
    // Esc während des Speicherns, das dann scheitert: keine Markierung ohne Entwurf
    const echt = useFormulare.getState().oapAendern;
    let los!: () => void;
    const tor = new Promise<void>((r) => (los = r));
    useFormulare.setState({
      oapAendern: async () => {
        await tor;
        throw new Error('Zugriff verweigert');
      },
    });
    eingabe(nr(), '08');
    enter();
    act(() => void nr().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    los();
    for (let i = 0; i < 6; i++) await warte();
    useFormulare.setState({ oapAendern: echt });
    expect(nr().classList.contains('feld-fehler')).toBe(false);
    expect(nr().value).toBe('07');
  });

  it('Titel: während des Speicherns weiter bestätigt, dann geleert – das Leere wird abgelehnt und bleibt markiert, nichts danach gespeichert', async () => {
    const host = await mitUmfangInBeiden();
    await klick(host.querySelector<HTMLButtonElement>('[aria-label="Lageplan bearbeiten"]')!);
    const titel = () => host.querySelector<HTMLInputElement>('.pu-zeile .pu-bearbeiten input')!;
    const enter = () => act(() => void titel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    const halt = schreibenAufhalten();
    eingabe(titel(), 'B');
    enter();
    eingabe(titel(), 'C');
    enter();
    eingabe(titel(), '');
    enter();
    halt.los();
    for (let i = 0; i < 10; i++) await warte();
    halt.zurueck();
    expect(halt.anzahl).toBe(1);
    expect(((antragIn('BAUA 2')!.umfang as { id: string; titel: string }[]).find((u) => u.id === 'lageplan') ?? { titel: '' }).titel).toBe('B');
    expect(titel().value).toBe('');
    expect(titel().classList.contains('feld-fehler')).toBe(true);
  });

  it('Textfeld: „12“ wird gespeichert, „123“ weitergetippt – verschwindet die Zeile, sagt die Meldung, dass „123“ nicht gespeichert ist', async () => {
    const host = await mitUmfangInBeiden();
    const nr = zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
    const halt = schreibenAufhalten();
    eingabe(nr, '12');
    act(() => void nr.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    eingabe(nr, '123');
    await umfangVonAussen('BAUA 2', (u) => u.filter((x) => x.id !== 'lageplan'));
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: '„123“ bei „Lageplan“ nicht gespeichert – der Eintrag ist nicht mehr angezeigt.' });
    halt.los();
    for (let i = 0; i < 10; i++) await warte();
    halt.zurueck();
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'bauantrag']);
  });

  it('Textfeld: in BAUA 2 getippt, inzwischen zeigt das Projekt BAUA – das Feld sagt es gleich (vor dem Verlassen)', async () => {
    const host = await mitUmfangInBeiden();
    const nr = () => zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
    eingabe(nr(), '77');
    await aktivVonAussen('BAUA');
    expect(nr().classList.contains('feld-fehler')).toBe(true);
    expect(host.querySelector(`#${CSS.escape(nr().getAttribute('aria-describedby')!)}`)?.textContent).toBe('Getippt für Antrag BAUA 2 – inzwischen ist Antrag BAUA angezeigt; Esc verwirft.');
    act(() => void nr().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(nr().classList.contains('feld-fehler')).toBe(false);
    expect(nr().value).toBe('');
  });

  it('zwei Dateien kurz nacheinander als bereit markiert, das erste Speichern hängt: beide sind bereit', async () => {
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261110 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 261110 02 Lageplan.pdf`, new Uint8Array([1]));
    await mitUmfangInBeiden();
    await act(() => useAntrag.getState().aktualisieren());
    await warte();
    const halt = schreibenAufhalten();
    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = useAntrag.getState().bereitUmschalten('BS9 BAUA 261110 01 Bauantrag.pdf', { fassung: 'BAUA 2' });
    });
    await warte();
    act(() => {
      p2 = useAntrag.getState().bereitUmschalten('BS9 BAUA 261110 02 Lageplan.pdf', { fassung: 'BAUA 2' });
    });
    await warte();
    halt.los();
    await act(() => Promise.all([p1, p2]));
    for (let i = 0; i < 6; i++) await warte();
    halt.zurueck();
    expect(((antragIn('BAUA 2')?.bereit as { datei: string }[] | undefined) ?? []).map((b) => b.datei)).toEqual(['BS9 BAUA 261110 01 Bauantrag.pdf', 'BS9 BAUA 261110 02 Lageplan.pdf']);
  });

  it('zweimal verschoben, während das erste Speichern hängt: beide Verschiebungen bleiben', async () => {
    await mitUmfangInBeiden();
    const nachOben = (id: string) => (aktuell: { id: string }[]) => {
      const e = aktuell.find((x) => x.id === id)!;
      return [e, ...aktuell.filter((x) => x.id !== id)];
    };
    const halt = schreibenAufhalten();
    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    act(() => {
      p1 = useAntrag.getState().umfangAendern(nachOben('lageplan') as never, { ansicht: 'BAUA 2', eintrag: 'lageplan', titel: 'Lageplan', was: 'Nicht verschoben', verschoben: true });
    });
    await warte();
    act(() => {
      p2 = useAntrag.getState().umfangAendern(nachOben('bauantrag') as never, { ansicht: 'BAUA 2', eintrag: 'bauantrag', titel: 'Bauantrag', was: 'Nicht verschoben', verschoben: true });
    });
    await warte();
    halt.los();
    await act(() => Promise.all([p1, p2]));
    for (let i = 0; i < 6; i++) await warte();
    halt.zurueck();
    expect(umfangIdsIn('BAUA 2')).toEqual(['bauantrag', 'lageplan', 'muster']);
  });

  it('„Nach unten“, während woanders ein Eintrag dazukam (hier noch nicht gelesen): der verschobene Eintrag rückt hinter den, an dem er vorbeizog', async () => {
    const host = await mitUmfangInBeiden();
    // woanders kam „Statik“ hinter „Musterformular“
    ds.dateien.set(
      OAP,
      oapMit(ds.dateien.get(OAP)!, (f) => {
        const a = (f.antraege as Record<string, { umfang: { id: string }[] }>)['BAUA 2'];
        a.umfang = [a.umfang[0], { id: 'statik', titel: 'Statik', art: 'extern' } as { id: string }, ...a.umfang.slice(1)];
      }),
    );
    await rechtsklick(zeileVon(host, 'Musterformular'));
    await klick(menuePunkt('Nach unten'));
    for (let i = 0; i < 6; i++) await warte();
    expect(umfangIdsIn('BAUA 2')).toEqual(['statik', 'bauantrag', 'muster', 'lageplan']);
  });

  it('woanders aufgehoben bzw. der Eintrag entfernt (hier noch nicht gelesen): nichts kommt zurück, keine Erfolgsmeldung', async () => {
    const host = await mitUmfangInBeiden();
    // Antragsumfang aufgehoben, hier eine Nr. übernommen
    ds.dateien.set(OAP, oapMit(ds.dateien.get(OAP)!, (f) => void delete (f.antraege as Record<string, Record<string, unknown>>)['BAUA 2'].umfang));
    const nr = zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
    eingabe(nr, '07');
    await verlassen(nr);
    for (let i = 0; i < 6; i++) await warte();
    expect(antragIn('BAUA 2')?.umfang).toBeUndefined();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Nicht geändert – inzwischen gibt es keinen Antragsumfang mehr.' });
  });

  it('Formular anlegen bzw. Verknüpfen mit Kopie, der Eintrag ist inzwischen woanders entfernt: kein „zugeordnet“ bzw. „verknüpft“', async () => {
    h24Vorbereiten();
    await mitUmfangInBeiden();
    const ohne = (id: string) =>
      ds.dateien.set(
        OAP,
        oapMit(ds.dateien.get(OAP)!, (f) => {
          const a = (f.antraege as Record<string, { umfang: { id: string }[] }>)['BAUA 2'];
          a.umfang = a.umfang.filter((x) => x.id !== id);
        }),
      );
    ohne('bauantrag');
    await act(() => useAntrag.getState().formularAnlegen('bauantrag', { ansicht: 'BAUA 2' }));
    for (let i = 0; i < 6; i++) await warte();
    expect(useFormulare.getState().meldung?.text).toMatch(/ angelegt \(leer\) – der Eintrag „Bauantrag“ ist inzwischen nicht mehr im Antragsumfang\.$/);
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'lageplan']);
    ohne('lageplan');
    await act(() => dateiVerknuepfen(PROJEKT, 'Planung/BS9 Lageplan.pdf', 'lageplan', { fassung: 'BAUA 2', titel: 'Lageplan' }));
    for (let i = 0; i < 6; i++) await warte();
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: '„BS9 Lageplan.pdf“ in BAUA 2 kopiert, aber nicht verknüpft – der Eintrag „Lageplan“ ist inzwischen nicht mehr im Antragsumfang.' });
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster']);
  });

  it('Textfeld: „12“ wird gespeichert, „123“ eingereiht – verschwindet das Feld (andere Ansicht), keine falsche Verlustmeldung, „123“ steht in der Datei', async () => {
    const host = await mitUmfangInBeiden();
    const nr = zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
    const enter = () => act(() => void nr.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    const halt = schreibenAufhalten();
    eingabe(nr, '12');
    enter();
    eingabe(nr, '123');
    enter();
    const meldungen: string[] = [];
    const ab = useFormulare.subscribe((st, vorher) => void (st.meldung && st.meldung !== vorher.meldung && meldungen.push(st.meldung.text)));
    // Projektkarte statt Antragsdaten: das Feld verschwindet
    await klick(host.querySelectorAll<HTMLButtonElement>('.fo-daten .fo-eintrag-karte')[0]);
    ab();
    expect(host.querySelector('.pu-nr')).toBeNull();
    // keine Verlustmeldung (eine andere, etwa zur Projektkarte, darf sein)
    expect(meldungen.filter((m) => /nicht gespeichert/.test(m))).toEqual([]);
    halt.los();
    for (let i = 0; i < 10; i++) await warte();
    halt.zurueck();
    expect(nrVon('BAUA 2', 'lageplan')).toBe('123');
  });

  it('„Antragsumfang festlegen“, während woanders schon einer festgelegt und bearbeitet wurde (hier noch nicht gelesen): der bleibt, mit Meldung', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    ds.dateien.set(
      OAP,
      oapMit(ds.dateien.get(OAP)!, (f) => {
        const a = (f.antraege as Record<string, Record<string, unknown>>)['BAUA 2'];
        a.umfang = [
          { id: 'lageplan', titel: 'Lageplan', art: 'extern', quelle: 'Planung', muster: '*Lageplan*', dateien: { 'BAUA 2': 'BS9 BAUA 261110 02 Lageplan.pdf' }, nr: '02' },
          { id: 'ueigen', titel: 'Brandschutzkonzept', art: 'extern', nr: '05' },
        ];
      }),
    );
    await klick(knopf(host, 'Antragsumfang festlegen'));
    for (let i = 0; i < 6; i++) await warte();
    expect(umfangIdsIn('BAUA 2')).toEqual(['lageplan', 'ueigen']);
    expect(((antragIn('BAUA 2')!.umfang as { id: string; dateien?: Record<string, string> }[])[0]).dateien).toEqual({ 'BAUA 2': 'BS9 BAUA 261110 02 Lageplan.pdf' });
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Antragsumfang nicht festgelegt – inzwischen ist schon einer festgelegt; er ist jetzt geladen.' });
    expect(useAntrag.getState().projektdatei?.umfang?.map((u) => u.id)).toEqual(['lageplan', 'ueigen']);
  });

  it('„Antragsumfang festlegen“, während woanders schon einer festgelegt und BAUA aktiv gemacht wurde: die Meldung nennt beide Fassungen, kein „jetzt geladen“', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    ds.dateien.set(
      OAP,
      oapMit(ds.dateien.get(OAP)!, (f) => {
        f.aktiveFassung = 'BAUA';
        (f.antraege as Record<string, Record<string, unknown>>)['BAUA 2'].umfang = [{ id: 'ueigen', titel: 'Brandschutzkonzept', art: 'extern' }];
      }),
    );
    const { meldungen, ab } = meldungenSammeln();
    try {
      await klick(knopf(host, 'Antragsumfang festlegen'));
      for (let i = 0; i < 8; i++) await warte();
    } finally {
      ab();
    }
    expect(umfangIdsIn('BAUA 2')).toEqual(['ueigen']);
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA');
    expect(meldungen.filter((m) => /er ist jetzt geladen/.test(m))).toEqual([]);
    expect(useFormulare.getState().meldung).toEqual({
      art: 'info',
      text: 'Antragsumfang für Antrag BAUA 2 nicht festgelegt – für diesen ist inzwischen schon einer festgelegt. Angezeigt wird jetzt Antrag BAUA, die aktive Antragsfassung.',
    });
  });

  it('Laden nach „nichts geändert“ hängt, ein zweites Speichern läuft durch: das späte Laden überschreibt den neueren Stand nicht', async () => {
    const host = await mitUmfangInBeiden();
    ds.dateien.set(
      OAP,
      oapMit(ds.dateien.get(OAP)!, (f) => {
        const a = (f.antraege as Record<string, { umfang: { id: string; nr?: string }[] }>)['BAUA 2'];
        a.umfang = a.umfang.map((u) => (u.id === 'lageplan' ? { ...u, nr: '07' } : u));
      }),
    );
    const po = ds.projektordner as unknown as { liesMitStand: (r: string, p: string) => Promise<unknown> };
    const echtLies = po.liesMitStand.bind(po);
    let zaehler = 0;
    let aktiv = true;
    let los!: () => void;
    const tor = new Promise<void>((r) => (los = r));
    po.liesMitStand = async (r: string, p: string) => {
      const ergebnis = await echtLies(r, p);
      if (aktiv && ++zaehler === 2) {
        aktiv = false;
        await tor;
      }
      return ergebnis;
    };
    try {
      const nr = zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
      eingabe(nr, '07');
      await verlassen(nr);
      for (let i = 0; i < 4; i++) await warte();
      const nr2 = zeileVon(host, 'Bauantrag').querySelector<HTMLInputElement>('.pu-nr')!;
      eingabe(nr2, '02');
      await verlassen(nr2);
      for (let i = 0; i < 6; i++) await warte();
      los();
      for (let i = 0; i < 6; i++) await warte();
    } finally {
      po.liesMitStand = echtLies;
    }
    expect(nrVon('BAUA 2', 'bauantrag')).toBe('02');
    expect(useAntrag.getState().projektdatei?.umfang?.find((u) => u.id === 'bauantrag')?.nr).toBe('02');
    expect(zeileVon(host, 'Bauantrag').querySelector<HTMLInputElement>('.pu-nr')!.value).toBe('02');
  });

  it('Projektwechsel während des Schreibens (das andere Projekt hat dieselbe Fassung ohne Antragsumfang): keine falsche Meldung, gespeichert ist gespeichert', async () => {
    ds.ordner.add('Z:/Projekte/H24 Hofstraße/TÖB/BAUA 2');
    ds.dateien.set('Z:/Projekte/H24 Hofstraße/TÖB/BAUA 2/x.pdf', new Uint8Array([1]));
    const host = await mitUmfangInBeiden();
    const po = ds.projektordner as unknown as { projektdateiErsetzen: (...a: unknown[]) => Promise<unknown> };
    const echt = po.projektdateiErsetzen.bind(po);
    let los!: () => void;
    const tor = new Promise<void>((r) => (los = r));
    let einmal = true;
    po.projektdateiErsetzen = async (...a: unknown[]) => {
      if (einmal) {
        einmal = false;
        await tor;
      }
      return echt(...a);
    };
    const meldungen: string[] = [];
    const ab = useFormulare.subscribe((st, vorher) => void (st.meldung && st.meldung !== vorher.meldung && meldungen.push(st.meldung.text)));
    try {
      const nr = zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
      eingabe(nr, '09');
      await verlassen(nr);
      for (let i = 0; i < 3; i++) await warte();
      await act(() => useFormulare.getState().projektWaehlen(useFormulare.getState().projekte.find((p) => p.ordner === 'H24')!));
      for (let i = 0; i < 8; i++) await warte();
      los();
      for (let i = 0; i < 8; i++) await warte();
    } finally {
      po.projektdateiErsetzen = echt;
      ab();
    }
    expect(nrVon('BAUA 2', 'lageplan')).toBe('09');
    expect(meldungen.filter((m) => /keinen Antragsumfang|nicht mehr im Antragsumfang/.test(m))).toEqual([]);
  });

  it('„Antragsumfang festlegen“ mit einem Katalogeintrag, dessen Muster geleert ist: festgelegt, keine Meldung „nicht festgelegt“', async () => {
    useAntrag.setState({ katalog: KATALOG.map((k) => (k.id === 'lageplan' ? { ...k, muster: '' } : k)) });
    const host = await projektBS9();
    await klick(antragsdaten(host));
    const meldungen: string[] = [];
    const ab = useFormulare.subscribe((st, vorher) => void (st.meldung && st.meldung !== vorher.meldung && meldungen.push(st.meldung.text)));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    for (let i = 0; i < 6; i++) await warte();
    ab();
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'bauantrag', 'lageplan']);
    expect(meldungen.filter((m) => /nicht festgelegt/.test(m))).toEqual([]);
  });

  it('„Antragsumfang festlegen“ in BS9, das Schreiben hängt, inzwischen ist H24 offen (dort mit Antragsumfang): BS9 festgelegt, keine Meldung in H24', async () => {
    const H24 = 'Z:/Projekte/H24 Hofstraße';
    ds.ordner.add(`${H24}/TÖB/BAUA 2`);
    ds.dateien.set(`${H24}/TÖB/BAUA 2/x.pdf`, new Uint8Array([1]));
    const p = createProject('Hofstraße');
    p.meta = { ...leereMeta(), projektcode: 'H24' };
    ds.dateien.set(
      `${H24}/Planung/Berechnungen/H24.oap`,
      oapMit(writeArchive(p), (f) => {
        f.aktiveFassung = 'BAUA 2';
        f.antraege = { 'BAUA 2': { umfang: [{ id: 'h1', titel: 'Eigenes Dokument', art: 'extern' }] } };
      }),
    );
    const host = await projektBS9();
    await klick(antragsdaten(host));
    const po = ds.projektordner as unknown as { projektdateiErsetzen: (...a: unknown[]) => Promise<unknown> };
    const echt = po.projektdateiErsetzen.bind(po);
    let los!: () => void;
    const tor = new Promise<void>((r) => (los = r));
    let einmal = true;
    po.projektdateiErsetzen = async (...a: unknown[]) => {
      if (einmal) {
        einmal = false;
        await tor;
      }
      return echt(...a);
    };
    const meldungen: string[] = [];
    const ab = useFormulare.subscribe((st, vorher) => void (st.meldung && st.meldung !== vorher.meldung && meldungen.push(st.meldung.text)));
    try {
      await klick(knopf(host, 'Antragsumfang festlegen'));
      for (let i = 0; i < 3; i++) await warte();
      await act(() => useFormulare.getState().projektWaehlen(useFormulare.getState().projekte.find((x) => x.ordner === 'H24')!));
      for (let i = 0; i < 8; i++) await warte();
      los();
      for (let i = 0; i < 8; i++) await warte();
    } finally {
      po.projektdateiErsetzen = echt;
      ab();
    }
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'bauantrag', 'lageplan']);
    expect(meldungen.filter((m) => /nicht festgelegt/.test(m))).toEqual([]);
  });

  it('„Antragsumfang festlegen“ in BS9 (dort woanders schon festgelegt), das Neuladen danach hängt, inzwischen ist H24 offen: der in BS9 bleibt, die Meldung nennt BS9', async () => {
    ds.ordner.add('Z:/Projekte/H24 Hofstraße/TÖB/BAUA 2');
    ds.dateien.set('Z:/Projekte/H24 Hofstraße/TÖB/BAUA 2/x.pdf', new Uint8Array([1]));
    const host = await projektBS9();
    await klick(antragsdaten(host));
    ds.dateien.set(OAP, oapMit(ds.dateien.get(OAP)!, (f) => void ((f.antraege as Record<string, Record<string, unknown>>)['BAUA 2'].umfang = [{ id: 'ueigen', titel: 'Brandschutzkonzept', art: 'extern' }])));
    // in der Datei steht schon einer: nichts zu schreiben – das Neuladen danach (zweites Lesen) hängt
    const po = ds.projektordner as unknown as { liesMitStand: (r: string, p: string) => Promise<unknown> };
    const echt = po.liesMitStand.bind(po);
    let los!: () => void;
    const tor = new Promise<void>((r) => (los = r));
    let n = 0;
    po.liesMitStand = async (r: string, p: string) => {
      const x = await echt(r, p);
      if (++n === 2) await tor;
      return x;
    };
    const meldungen: string[] = [];
    const ab = useFormulare.subscribe((st, vorher) => void (st.meldung && st.meldung !== vorher.meldung && meldungen.push(st.meldung.text)));
    try {
      await klick(knopf(host, 'Antragsumfang festlegen'));
      for (let i = 0; i < 3; i++) await warte();
      await act(() => useFormulare.getState().projektWaehlen(useFormulare.getState().projekte.find((x) => x.ordner === 'H24')!));
      for (let i = 0; i < 8; i++) await warte();
      los();
      for (let i = 0; i < 8; i++) await warte();
    } finally {
      po.liesMitStand = echt;
      ab();
    }
    expect(umfangIdsIn('BAUA 2')).toEqual(['ueigen']);
    expect(meldungen.filter((m) => /nicht festgelegt/.test(m))).toEqual(['Antragsumfang in BS9 nicht festgelegt – dort ist inzwischen schon einer festgelegt; jetzt ist ein anderes Projekt offen.']);
  });

  it('Projektdatei zweimal geladen: das frühere scheitert spät, das spätere gelingt – kein Fehler, neuer Stand; umgekehrt bleibt der Fehler', async () => {
    await projektBS9();
    await warte();
    const po = ds.projektordner as unknown as { liesMitStand: (r: string, p: string) => Promise<unknown> };
    const echt = po.liesMitStand.bind(po);
    const zweimal = async (erstes: 'scheitert' | 'gelingt') => {
      let los!: () => void;
      const tor = new Promise<void>((r) => (los = r));
      let n = 0;
      po.liesMitStand = async (r: string, p: string) => {
        const k = ++n;
        if (k === 1) {
          const x = erstes === 'gelingt' ? await echt(r, p) : null;
          await tor;
          if (erstes === 'scheitert') throw new Error('Netz weg');
          return x;
        }
        if (erstes === 'gelingt') throw new Error('Netz weg');
        return echt(r, p);
      };
      let fertig = false;
      try {
        const l1 = useFormulare.getState().oapLaden().then(() => (fertig = true));
        await warte();
        await act(() => useFormulare.getState().oapLaden());
        los();
        await act(async () => void (await Promise.race([l1, new Promise((r) => setTimeout(r, 500))])));
      } finally {
        po.liesMitStand = echt;
      }
      return fertig;
    };
    expect(await zweimal('scheitert')).toBe(true);
    expect(useFormulare.getState().oap).not.toBe('fehlt');
    expect(useFormulare.getState().meldung?.text ?? '').not.toMatch(/nicht lesbar/);
    expect(await zweimal('gelingt')).toBe(true);
    expect(useFormulare.getState().oap).toBe('fehlt');
    expect(useFormulare.getState().meldung?.text).toMatch(/^Projektdatei von BS9 nicht lesbar/);
  });

  it('während des Schreibens eine andere Projektdatei gewählt (dort ohne Antragsumfang): keine Meldung „keinen Antragsumfang mehr“', async () => {
    const KOPIE_REL = 'Planung/Berechnungen/BS9 Kopie.oap';
    const host = await mitUmfangInBeiden();
    // die Kopie: BAUA 2 ohne Antragsumfang
    ds.dateien.set(`${PROJEKT}/${KOPIE_REL}`, oapMit(ds.dateien.get(OAP)!, (f) => void delete (f.antraege as Record<string, Record<string, unknown>>)['BAUA 2'].umfang));
    const halt = schreibenAnhalten('BS9.oap');
    const meldungen: string[] = [];
    const ab = useFormulare.subscribe((st, vorher) => void (st.meldung && st.meldung !== vorher.meldung && meldungen.push(st.meldung.text)));
    try {
      const nr = zeileVon(host, 'Lageplan').querySelector<HTMLInputElement>('.pu-nr')!;
      eingabe(nr, '09');
      await verlassen(nr);
      for (let i = 0; i < 20 && !halt.los; i++) await warte();
      await act(() => useFormulare.getState().oapWaehlen(KOPIE_REL));
      for (let i = 0; i < 6; i++) await warte();
      halt.los?.();
      for (let i = 0; i < 8; i++) await warte();
    } finally {
      ab();
    }
    expect(nrVon('BAUA 2', 'lageplan')).toBe('09');
    expect(meldungen.filter((m) => /keinen Antragsumfang|nicht mehr im Antragsumfang/.test(m))).toEqual([]);
  });

  /** sammelt alle Meldungen bis `ab()` */
  const meldungenSammeln = () => {
    const meldungen: string[] = [];
    const ab = useFormulare.subscribe((st, vorher) => void (st.meldung && st.meldung !== vorher.meldung && meldungen.push(st.meldung.text)));
    return { meldungen, ab };
  };

  it('Doppelklick auf „Antragsumfang festlegen“: festgelegt, keine Meldung „nicht festgelegt“', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    const { meldungen, ab } = meldungenSammeln();
    const k = knopf(host, 'Antragsumfang festlegen');
    act(() => {
      k.click();
      k.click();
    });
    for (let i = 0; i < 8; i++) await warte();
    ab();
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'bauantrag', 'lageplan']);
    expect(meldungen.filter((m) => /nicht festgelegt/.test(m))).toEqual([]);
  });

  it('Festlegen (woanders schon festgelegt), das Neuladen hängt, inzwischen andere Projektdatei (ohne Umfang) gewählt: kein „er ist jetzt geladen“', async () => {
    const KOPIE_REL = 'Planung/Berechnungen/BS9 Kopie.oap';
    const host = await projektBS9();
    await klick(antragsdaten(host));
    ds.dateien.set(`${PROJEKT}/${KOPIE_REL}`, ds.dateien.get(OAP)!);
    ds.dateien.set(OAP, oapMit(ds.dateien.get(OAP)!, (f) => void ((f.antraege as Record<string, Record<string, unknown>>)['BAUA 2'].umfang = [{ id: 'ueigen', titel: 'Brandschutzkonzept', art: 'extern' }])));
    const po = ds.projektordner as unknown as { liesMitStand: (r: string, p: string) => Promise<unknown> };
    const echt = po.liesMitStand.bind(po);
    let los!: () => void;
    const tor = new Promise<void>((r) => (los = r));
    let n = 0;
    po.liesMitStand = async (r: string, p: string) => {
      const x = await echt(r, p);
      if (p.endsWith('BS9.oap') && ++n === 2) await tor;
      return x;
    };
    const { meldungen, ab } = meldungenSammeln();
    try {
      await klick(knopf(host, 'Antragsumfang festlegen'));
      for (let i = 0; i < 3; i++) await warte();
      await act(() => useFormulare.getState().oapWaehlen(KOPIE_REL));
      for (let i = 0; i < 6; i++) await warte();
      los();
      for (let i = 0; i < 8; i++) await warte();
    } finally {
      po.liesMitStand = echt;
      ab();
    }
    expect(umfangIdsIn('BAUA 2')).toEqual(['ueigen']);
    expect(meldungen.filter((m) => /er ist jetzt geladen/.test(m))).toEqual([]);
    // gesagt wird es trotzdem – mit der Projektdatei, die gemeint ist
    expect(meldungen).toContain('Antragsumfang in BS9.oap nicht festgelegt – dort ist inzwischen schon einer festgelegt; jetzt ist eine andere Projektdatei gewählt.');
  });

  it('Festlegen (woanders schon festgelegt), das Neuladen danach scheitert (Netz weg): keine „andere Projektdatei“, die Lesefehlermeldung bleibt', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    ds.dateien.set(OAP, oapMit(ds.dateien.get(OAP)!, (f) => void ((f.antraege as Record<string, Record<string, unknown>>)['BAUA 2'].umfang = [{ id: 'ueigen', titel: 'Brandschutzkonzept', art: 'extern' }])));
    // in der Datei steht schon einer: nichts zu schreiben – das Neuladen danach (zweites Lesen) scheitert
    const po = ds.projektordner as unknown as { liesMitStand: (r: string, p: string) => Promise<unknown> };
    const echt = po.liesMitStand.bind(po);
    let n = 0;
    po.liesMitStand = async (r: string, p: string) => {
      if (p.endsWith('BS9.oap') && ++n === 2) throw new Error('Netz weg');
      return echt(r, p);
    };
    const { meldungen, ab } = meldungenSammeln();
    try {
      await klick(knopf(host, 'Antragsumfang festlegen'));
      for (let i = 0; i < 8; i++) await warte();
    } finally {
      po.liesMitStand = echt;
      ab();
    }
    expect(n).toBeGreaterThanOrEqual(2);
    expect(umfangIdsIn('BAUA 2')).toEqual(['ueigen']);
    expect(meldungen.filter((m) => /andere Projektdatei|jetzt geladen/.test(m))).toEqual([]);
    expect(useFormulare.getState().meldung?.text).toMatch(/^Projektdatei von BS9 nicht lesbar: .*Netz weg/);
  });

  it('Festlegen: der erste Versuch sieht einen woanders festgelegten, die Datei ändert sich dabei (dort aufgehoben), der zweite schreibt – keine Meldung', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    // woanders festgelegt, ohne meta.antrag (so schreibt auch der erste Versuch – meta.antrag kommt hinzu)
    const p = readProjectFile(oapMit(ds.dateien.get(OAP)!, (f) => void ((f.antraege as Record<string, Record<string, unknown>>)['BAUA 2'].umfang = [{ id: 'ueigen', titel: 'Brandschutzkonzept', art: 'extern' }]))) as unknown as { meta: Record<string, unknown> };
    delete p.meta.antrag;
    ds.dateien.set(OAP, writeArchive(p as unknown as Parameters<typeof writeArchive>[0]));
    const po = ds.projektordner as unknown as { projektdateiErsetzen: (...a: unknown[]) => Promise<unknown> };
    const echt = po.projektdateiErsetzen.bind(po);
    let einmal = true;
    po.projektdateiErsetzen = async (...a: unknown[]) => {
      if (einmal) {
        einmal = false;
        // währenddessen woanders aufgehoben – die Datei ist geändert, der Versuch scheitert
        const q = readProjectFile(oapMit(ds.dateien.get(OAP)!, (f) => void delete (f.antraege as Record<string, Record<string, unknown>>)['BAUA 2'].umfang)) as unknown as { meta: Record<string, unknown> };
        delete q.meta.antrag;
        ds.dateien.set(OAP, writeArchive(q as unknown as Parameters<typeof writeArchive>[0]));
        ds.geaendert.set(OAP, (ds.geaendert.get(OAP) ?? 0) + 1000);
      }
      return echt(...a);
    };
    const { meldungen, ab } = meldungenSammeln();
    try {
      await klick(knopf(host, 'Antragsumfang festlegen'));
      for (let i = 0; i < 8; i++) await warte();
    } finally {
      po.projektdateiErsetzen = echt;
      ab();
    }
    expect(einmal).toBe(false);
    expect(umfangIdsIn('BAUA 2')).toEqual(['muster', 'bauantrag', 'lageplan']);
    expect(meldungen.filter((m) => /nicht festgelegt/.test(m))).toEqual([]);
  });

  it('Laden von BS9 hängt, H24 geöffnet (dessen Laden hängt auch), BS9 scheitert: der Aufrufer kommt gleich zurück, keine Meldung zu BS9', async () => {
    ds.ordner.add('Z:/Projekte/H24 Hofstraße/TÖB/BAUA 2');
    ds.dateien.set('Z:/Projekte/H24 Hofstraße/TÖB/BAUA 2/x.pdf', new Uint8Array([1]));
    await projektBS9();
    await warte();
    const po = ds.projektordner as unknown as { liesMitStand: (r: string, p: string) => Promise<unknown> };
    const echt = po.liesMitStand.bind(po);
    let losBs9!: () => void;
    const torBs9 = new Promise<void>((r) => (losBs9 = r));
    let losH24!: () => void;
    const torH24 = new Promise<void>((r) => (losH24 = r));
    let bs9 = true;
    po.liesMitStand = async (r: string, p: string) => {
      if (p.endsWith('BS9.oap') && bs9) {
        bs9 = false;
        await torBs9;
        throw new Error('Netz weg');
      }
      return echt(r, p);
    };
    // das Laden von H24 hängt beim Suchen der Projektdatei
    const pl = ds.projektordner as unknown as { liste: (r: string, t: number) => Promise<unknown> };
    const echtListe = pl.liste.bind(pl);
    pl.liste = async (r: string, t: number) => {
      if (r.includes('H24')) await torH24;
      return echtListe(r, t);
    };
    let fertig = false;
    try {
      const l1 = useFormulare.getState().oapLaden().then(() => (fertig = true));
      await warte();
      act(() => void useFormulare.getState().projektWaehlen(useFormulare.getState().projekte.find((x) => x.ordner === 'H24')!));
      for (let i = 0; i < 4; i++) await warte();
      losBs9();
      await act(async () => void (await Promise.race([l1, new Promise((r) => setTimeout(r, 300))])));
      // das Laden von H24 hängt noch – der Aufrufer von BS9 ist trotzdem zurück
      expect(fertig).toBe(true);
      expect(useFormulare.getState().meldung?.text ?? '').not.toMatch(/BS9 nicht lesbar/);
    } finally {
      losH24();
      po.liesMitStand = echt;
      pl.liste = echtListe;
      for (let i = 0; i < 6; i++) await warte();
    }
  });

  it('Antragsstatus von Hand: „in Arbeit“ behält das Datum – zurück auf „eingereicht“ gilt derselbe Stand', async () => {
    const ordner = `${PROJEKT}/TÖB/BAUA 2`;
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1]));
    const host = await projektBS9();
    await act(() => useAntrag.getState().statusSetzen({ eingereicht: true, datum: '2026-11-03' }));
    await warte();
    expect((antragIn('BAUA 2')?.stand as { tag: string }).tag).toBe('2026-11-03');
    ds.dateien.set(`${ordner}/BS9 BAUA 261101 01 Bauantrag.pdf`, new Uint8Array([1, 2, 3]));
    // über die Auswahl im Status: „in Arbeit“, dann wieder „eingereicht“ (ohne Datum einzugeben)
    await klick(antragsdaten(host));
    const auswahl = () => host.querySelector<HTMLSelectElement>('select[aria-label="Status des Antrags"]')!;
    const waehle = async (wert: string) => {
      await act(async () => {
        auswahl().value = wert;
        auswahl().dispatchEvent(new Event('change', { bubbles: true }));
      });
      await warte();
    };
    await waehle('arbeit');
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: false, datum: '2026-11-03' });
    await waehle('eingereicht');
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: true, datum: '2026-11-03' });
    expect((antragIn('BAUA 2')?.stand as { tag: string; dateien: { pfad: string; groesse?: number }[] }).dateien[0].groesse).toBe(1);
  });

  it('zuletzt bearbeitet: an den Formularen der Navigation und an den Dateien im Projektordner (kurz, voll im Tooltip)', async () => {
    const zeit = new Date(2026, 2, 3, 9, 5).getTime();
    ds.geaendert.set('C:/FORMA/BS9/001-Muster.frmsjf', zeit);
    ds.dateien.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 260303 01 Bauantrag.pdf`, new Uint8Array([1]));
    ds.geaendert.set(`${PROJEKT}/TÖB/BAUA 2/BS9 BAUA 260303 01 Bauantrag.pdf`, zeit);
    const host = await projektBS9();
    const nav = [...host.querySelectorAll<HTMLElement>('.nav-eintrag')].find((b) => b.textContent?.includes('001-Muster'))!;
    expect(nav.querySelector('.nav-zeit')!.textContent).toBe(zeitKurz(zeit));
    expect(nav.title).toContain('zuletzt geändert am 03.03.2026, 09:05');
    await klick(knopfGenau(host, 'Antrag'));
    const zeile = [...host.querySelectorAll<HTMLElement>('.fo-bereit-zeile')].find((z) => z.textContent?.includes('Bauantrag'))!;
    expect(zeile.querySelector('.fo-baum-zeit')!.textContent).toBe(zeitKurz(zeit));
    expect(zeile.querySelector('.fo-baum-zeile')!.getAttribute('title')).toContain('zuletzt geändert am 03.03.2026, 09:05');
  });

  it('Status von Hand: eingereicht sperrt Formulare und Antragsdaten, ein Nachtrag entsperrt; die Startseite zeigt den aktiven Antrag', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    expect(host.querySelector('.pu-kopf h2')!.textContent).toBe('Antragsdaten');
    const status = () => host.querySelector<HTMLSelectElement>('select[aria-label="Status des Antrags"]')!;
    expect(status().value).toBe('auto');
    act(() => {
      status().value = 'eingereicht';
      status().dispatchEvent(new Event('change', { bubbles: true }));
    });
    await warte();
    expect(antragIn('BAUA 2')?.status).toEqual({ eingereicht: true, datum: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.antrag).toMatchObject({ name: 'BAUA 2', eingereicht: { manuell: true } });

    // gesperrt: Antragsdaten, Navigation, Formular
    expect(host.querySelector('.pu.gesperrt')).toBeTruthy();
    expect(host.querySelector<HTMLSelectElement>('.pu-merkmale select')!.disabled).toBe(true);
    expect(knopf(host, 'Antragsumfang festlegen').disabled).toBe(true);
    await act(() => useAntrag.getState().umfangSetzen([]));
    expect(antragIn('BAUA 2')?.umfang).toBeUndefined();
    expect(useFormulare.getState().meldung?.text).toContain('eingereicht');
    expect(antragsdaten(host).textContent).toContain('BAUA 2 · eingereicht');
    await klick([...host.querySelectorAll<HTMLButtonElement>('.nav-eintrag')].find((b) => b.textContent?.includes('001-Muster'))!);
    await warte();
    expect(host.querySelector('.fo-meldung.hinweis')!.textContent).toContain('Antrag BAUA 2 ist eingereicht');
    const vorher = useFormulare.getState().offen!.aenderungen;
    const f = useFormulare.getState().offen!.felder.flat().find((x) => x.art === 'text')!;
    act(() => useFormulare.getState().wertSetzen(f, 'geändert'));
    expect(useFormulare.getState().offen!.aenderungen).toEqual(vorher);

    // Nachtrag: neue Fassung, aktiv und bearbeitbar
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Nachtrag „BAUA 3“ anlegen'));
    await warte();
    expect(useAntrag.getState().projektdatei?.aktiveFassung).toBe('BAUA 3');
    expect(host.querySelector('.pu.gesperrt')).toBeNull();
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.antrag).toMatchObject({ name: 'BAUA 3' });

    // wieder BAUA 2 aktiv: Startseite und Projekt zeigen denselben Antrag – eingereicht
    await act(() => useAntrag.getState().fassungWaehlen('BAUA 2'));
    await warte();
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.antrag).toMatchObject({ name: 'BAUA 2', eingereicht: { manuell: true } });
    expect(useAntrag.getState().projektStatus['C:/FORMA|BS9']?.antrag).toMatchObject({ name: 'BAUA 2', eingereicht: { manuell: true } });

    // zurück auf automatisch: ohne Eingangsbestätigung wieder in Arbeit
    act(() => {
      status().value = 'auto';
      status().dispatchEvent(new Event('change', { bubbles: true }));
    });
    await warte();
    expect(antragIn('BAUA 2')?.status).toBeUndefined();
    expect(host.querySelector('.pu.gesperrt')).toBeNull();
  });
});

describe('Formulare umbenennen', () => {
  const ALT = 'C:/FORMA/BS9/001-Muster.frmsjf';
  const NEU = 'C:/FORMA/BS9/010-Muster neu.frmsjf';
  const ZUSTAND = { felder: { '0:Name': { auto: 'Mustermann' } } };
  /** Antragsumfang in BAUA 2 festlegen und im anderen Antrag BAUA eine Zuordnung samt Autofill eintragen */
  async function mitZuordnungen(host: HTMLElement) {
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    await act(() =>
      useFormulare.getState().oapAendern((roh) => {
        const f = roh.formulare as { antraege: Record<string, Record<string, unknown>> };
        f.antraege.BAUA = { ...f.antraege.BAUA, umfang: [{ id: 'm', titel: 'Muster', art: 'intern', formularDatei: '001-Muster.frmsjf' }], felder: { '001-Muster.frmsjf': ZUSTAND } };
        return roh;
      }),
    );
    await act(() => useAntrag.getState().laden());
    await warte();
  }
  const umbenennen = async (host: HTMLElement, von: string, nach: string) => {
    await rechtsklick(knopf(host, von));
    await klick(menuePunkt('Umbenennen'));
    eingabe(document.querySelector<HTMLInputElement>('.rf input')!, nach);
    await klick(knopf(document.querySelector('.rf')!, 'Umbenennen'));
    for (let i = 0; i < 3; i++) await warte();
  };

  it('Zuordnung und Autofill in allen Anträgen, ungespeicherte Eingaben und das geöffnete Formular gehen mit', async () => {
    const host = await projektBS9();
    await mitZuordnungen(host);
    expect((antragIn('BAUA 2')?.umfang as { id: string; formularDatei?: string }[]).find((u) => u.id === 'muster')?.formularDatei).toBeUndefined();
    // im aktiven Antrag zugeordnet (über „Antragsdokument“), dann geöffnet und etwas eingegeben, nicht gespeichert
    await rechtsklick(knopf(host, '001-Muster'));
    await klick(menuePunkt('Antragsdokument'));
    await klick([...document.querySelectorAll<HTMLButtonElement>('.menue .menue .menue-punkt')].find((b) => b.textContent?.includes('Musterformular'))!);
    await klick(knopf(host, '001-Muster'));
    const o = useFormulare.getState().offen!;
    const feld = o.felder.flat().find((f) => f.art === 'text' && !f.berechnet)!;
    act(() => useFormulare.getState().wertSetzen(feld, 'Ungespeichert'));
    await warte();

    // eigene Einstellungen: das Muster hat eine Kennung, sie hängen nicht am Namen – es bleibt alles, wie es ist
    const eigene = { abschnitte: {}, zaehlt: { '0:Name': false } } as unknown as ReturnType<typeof useFormulare.getState>['profile'][string];
    useFormulare.setState({ profile: { 'nw019999|2026A': eigene } });

    await umbenennen(host, '001-Muster', '010-Muster neu');
    expect(useFormulare.getState().profile).toEqual({ 'nw019999|2026A': eigene });
    expect(ds.dateien.has(ALT)).toBe(false);
    expect(ds.dateien.get(NEU)).toBe(MUSTER);
    // keine Sperrdatei mehr am alten Namen; das umbenannte ist wieder offen (und gesperrt), die Eingabe ist noch da
    expect(ds.dateien.has('C:/FORMA/BS9/001-Muster.frmtmp')).toBe(false);
    expect(useFormulare.getState().offen?.pfad).toBe('BS9/010-Muster neu.frmsjf');
    expect(useFormulare.getState().offen?.aenderungen[feld.schluessel]).toBe('Ungespeichert');
    // Verweise in beiden Anträgen
    expect((antragIn('BAUA 2')?.umfang as { id: string; formularDatei?: string }[]).find((u) => u.id === 'muster')?.formularDatei).toBe('010-Muster neu.frmsjf');
    expect(antragIn('BAUA')?.umfang).toEqual([expect.objectContaining({ formularDatei: '010-Muster neu.frmsjf' })]);
    expect(antragIn('BAUA')?.felder).toEqual({ '010-Muster neu.frmsjf': ZUSTAND });
    // die Ampel steht am umbenannten Formular, die Meldung nennt den neuen Namen
    expect(useAntrag.getState().dokumente.find((d) => d.eintrag.id === 'muster')?.formular?.pfad).toBe('BS9/010-Muster neu.frmsjf');
    expect(useFormulare.getState().meldung?.text).toContain('„001-Muster“ in „010-Muster neu“ umbenannt');
  });

  it('eigene Einstellungen eines Formulars ohne Kennung: kopiert, nicht verschoben – und nie über vorhandene', () => {
    const a = { abschnitte: {}, zaehlt: { '0:A': false } } as unknown as ReturnType<typeof useFormulare.getState>['profile'][string];
    const b = { abschnitte: {}, zaehlt: { '0:B': false } } as unknown as ReturnType<typeof useFormulare.getState>['profile'][string];
    useFormulare.setState({ profile: { 'name|Alt': a, 'name|Belegt': b } });
    useFormulare.getState().profilKopieren('name|Alt', 'name|Neu');
    useFormulare.getState().profilKopieren('name|Alt', 'name|Belegt');
    expect(useFormulare.getState().profile).toEqual({ 'name|Alt': a, 'name|Neu': a, 'name|Belegt': b });
    expect(JSON.parse(localStorage.getItem('formulare:profile')!)).toEqual({ 'name|Alt': a, 'name|Neu': a, 'name|Belegt': b });
  });

  it('eine Zuordnung nur über den Namen wird festgeschrieben – sonst fände der Antragsumfang das Formular nicht mehr', async () => {
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    for (let i = 0; i < 3; i++) await warte();
    // „Musterformular“ (Formular „Muster“) findet 001-Muster über den Namen, ohne formularDatei
    const muster = () => (antragIn('BAUA 2')?.umfang as { id: string; formularDatei?: string }[]).find((u) => u.id === 'muster');
    expect(muster()?.formularDatei).toBeUndefined();
    expect(useAntrag.getState().dokumente.find((d) => d.eintrag.id === 'muster')?.formular?.pfad).toBe('BS9/001-Muster.frmsjf');
    await umbenennen(host, '001-Muster', '010-Vordruck');
    expect(muster()?.formularDatei).toBe('010-Vordruck.frmsjf');
    expect(useAntrag.getState().dokumente.find((d) => d.eintrag.id === 'muster')?.formular?.pfad).toBe('BS9/010-Vordruck.frmsjf');
    // Gegenprobe: der Bauantrag (fehlt) bekam keine Zuordnung
    expect((antragIn('BAUA 2')?.umfang as { id: string; formularDatei?: string }[]).find((u) => u.id === 'bauantrag')?.formularDatei).toBeUndefined();
  });

  it('Sammelprojekt: festgeschrieben wird nur im aktiven Antrag bzw. in den Anträgen des Unterordners – fremde bleiben', async () => {
    ds.dateien.set('C:/FORMA/BS9/2. BAUA/002-Bauantrag (2026).frmsjf', MUSTER);
    ds.dateien.set('C:/FORMA/BS9/BAUA/005-Bauantrag.frmsjf', MUSTER);
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    // im Antrag BAUA dieselben Einträge, nur über den Namen (dort gilt der eigene Unterordner BAUA)
    await act(() =>
      useFormulare.getState().oapAendern((roh) => {
        const f = roh.formulare as { antraege: Record<string, Record<string, unknown>> };
        f.antraege.BAUA = { ...f.antraege.BAUA, umfang: [{ id: 'muster', titel: 'Musterformular', art: 'intern', formular: 'Muster' }, { id: 'bauantrag', titel: 'Bauantrag', art: 'intern', formular: 'Bauantrag' }] };
        return roh;
      }),
    );
    await act(() => useAntrag.getState().laden());
    for (let i = 0; i < 3; i++) await warte();
    const eintrag = (antrag: string, id: string) => (antragIn(antrag)?.umfang as { id: string; formularDatei?: string }[]).find((u) => u.id === id);
    await umbenennen(host, '002-Bauantrag (2026)', '003-Vordruck');
    await umbenennen(host, '001-Muster', '010-Vordruck');
    // im aktiven Antrag BAUA 2 festgeschrieben
    expect(eintrag('BAUA 2', 'bauantrag')?.formularDatei).toBe('2. BAUA/003-Vordruck.frmsjf');
    expect(eintrag('BAUA 2', 'muster')?.formularDatei).toBe('010-Vordruck.frmsjf');
    // Gegenprobe: im Antrag BAUA bleibt alles, wie es war
    expect(eintrag('BAUA', 'bauantrag')?.formularDatei).toBeUndefined();
    expect(eintrag('BAUA', 'muster')?.formularDatei).toBeUndefined();
  });

  it('nicht geöffnet: Entwurf und Verlauf ziehen mit; ohne Kennung werden die eigenen Einstellungen kopiert', async () => {
    // dasselbe Muster ohne Kennung – die eigenen Einstellungen hängen dann am Namen
    const ohneKennung = new Uint8Array(Buffer.from(Buffer.from(MUSTER).toString('latin1').replace('nw019999', ''), 'latin1'));
    ds.dateien.set(ALT, ohneKennung);
    const host = await projektBS9();
    await klick(knopf(host, '001-Muster'));
    const feld = useFormulare.getState().offen!.felder.flat().find((f) => f.art === 'text' && !f.berechnet)!;
    act(() => useFormulare.getState().wertSetzen(feld, 'Entwurf'));
    const eigene = { abschnitte: {}, zaehlt: { [feld.schluessel]: false } } as unknown as ReturnType<typeof useFormulare.getState>['profile'][string];
    useFormulare.setState({ profile: { 'name|001-Muster': eigene } });
    await act(() => useFormulare.getState().schliessen());
    const projekt = useFormulare.getState().projekt!;
    expect(hatEntwurf(projekt, 'BS9/001-Muster.frmsjf')).toBe(true);

    await umbenennen(host, '001-Muster', '010-Muster neu');
    expect(hatEntwurf(projekt, 'BS9/001-Muster.frmsjf')).toBe(false);
    expect(entwurfVon(projekt, 'BS9/010-Muster neu.frmsjf')?.aenderungen[feld.schluessel]).toBe('Entwurf');
    expect(localStorage.getItem(`formulare:verlauf:${projekt.root}|BS9/001-Muster.frmsjf`)).toBeNull();
    expect(localStorage.getItem(`formulare:verlauf:${projekt.root}|BS9/010-Muster neu.frmsjf`)).not.toBeNull();
    // kopiert, nicht verschoben; nicht geöffnet bleibt es zu
    expect(useFormulare.getState().profile['name|010-Muster neu']).toEqual(eigene);
    expect(useFormulare.getState().profile['name|001-Muster']).toEqual(eigene);
    expect(useFormulare.getState().offen).toBeNull();
  });

  it('nur die Groß-/Kleinschreibung: umbenannt', async () => {
    const host = await projektBS9();
    await umbenennen(host, '001-Muster', '001-muster');
    expect(ds.dateien.has('C:/FORMA/BS9/001-muster.frmsjf')).toBe(true);
    expect(ds.dateien.has(ALT)).toBe(false);
    expect(ds.dateien.has('C:/FORMA/BS9/001-muster.frmtmp')).toBe(false);
  });

  it('Sammelprojekt: ein Formular im Unterordner – der Pfad ab dem Formularprojekt wandert mit', async () => {
    ds.dateien.set('C:/FORMA/BS9/2. BAUA/002-Bauantrag (2026).frmsjf', MUSTER);
    const host = await projektBS9();
    await klick(antragsdaten(host));
    await klick(knopf(host, 'Antragsumfang festlegen'));
    // ausdrücklich zugeordnet, mit dem Pfad ab dem Formularprojekt
    await act(() =>
      useFormulare.getState().oapAendern((roh) => {
        const f = roh.formulare as { antraege: Record<string, { umfang: { id: string; formularDatei?: string }[] }> };
        f.antraege['BAUA 2'].umfang.find((u) => u.id === 'bauantrag')!.formularDatei = '2. BAUA/002-Bauantrag (2026).frmsjf';
        return roh;
      }),
    );
    await act(() => useAntrag.getState().laden());
    for (let i = 0; i < 3; i++) await warte();
    await umbenennen(host, '002-Bauantrag (2026)', '003-Bauantrag (2026)');
    expect(ds.dateien.has('C:/FORMA/BS9/2. BAUA/003-Bauantrag (2026).frmsjf')).toBe(true);
    expect((antragIn('BAUA 2')?.umfang as { id: string; formularDatei?: string }[]).find((u) => u.id === 'bauantrag')?.formularDatei).toBe('2. BAUA/003-Bauantrag (2026).frmsjf');
  });

  it('inzwischen ein anderes Projekt gewählt: geschrieben wird trotzdem in die Projektdatei des umbenannten Formulars', async () => {
    const host = await projektBS9();
    await mitZuordnungen(host);
    // das Umbenennen auf dem Netzlaufwerk dauert – derweil wird H24 geöffnet
    const umbenennenDs = ds.formularUmbenennen.bind(ds);
    let weiter: () => void = () => undefined;
    const halt = new Promise<void>((r) => (weiter = r));
    let angekommen: () => void = () => undefined;
    const da = new Promise<void>((r) => (angekommen = r));
    ds.formularUmbenennen = async (...a) => {
      angekommen();
      await halt;
      return umbenennenDs(...a);
    };
    await rechtsklick(knopf(host, '001-Muster'));
    await klick(menuePunkt('Umbenennen'));
    eingabe(document.querySelector<HTMLInputElement>('.rf input')!, '010-Muster neu');
    act(() => knopf(document.querySelector('.rf')!, 'Umbenennen').click());
    await da;
    await act(() => useFormulare.getState().projektWaehlen(useFormulare.getState().projekte.find((p) => p.ordner === 'H24')!));
    weiter();
    for (let i = 0; i < 4; i++) await warte();
    expect(useFormulare.getState().projekt?.ordner).toBe('H24');
    expect(ds.dateien.has(NEU)).toBe(true);
    expect(antragIn('BAUA')?.felder).toEqual({ '010-Muster neu.frmsjf': ZUSTAND });
    // keine Sperre bleibt am neuen Namen liegen
    expect(ds.dateien.has('C:/FORMA/BS9/010-Muster neu.frmtmp')).toBe(false);
  });

  it('Projektdatei nicht schreibbar und auch das Zurückbenennen scheitert: Meldung, keine liegen gebliebene Sperre', async () => {
    const host = await projektBS9();
    await mitZuordnungen(host);
    ds.projektordner.projektdateiErsetzen = async () => {
      throw new Error('Netzlaufwerk weg');
    };
    const umbenennenDs = ds.formularUmbenennen.bind(ds);
    let aufrufe = 0;
    ds.formularUmbenennen = async (...a) => {
      if (++aufrufe > 1) throw new Error('Datei in Gebrauch');
      return umbenennenDs(...a);
    };
    await umbenennen(host, '001-Muster', '010-Muster neu');
    expect(ds.dateien.has(NEU)).toBe(true);
    expect(useFormulare.getState().meldung).toMatchObject({ art: 'fehler', text: expect.stringContaining('bitte die Zuordnung in den Antragsdaten von BS9 prüfen') });
    expect(ds.dateien.has('C:/FORMA/BS9/010-Muster neu.frmtmp')).toBe(false);
  });

  it('Speicher voll: umbenannt, aber die Meldung sagt, dass nicht gespeicherte Eingaben am alten Namen bleiben', async () => {
    const host = await projektBS9();
    await klick(knopf(host, '001-Muster'));
    const feld = useFormulare.getState().offen!.felder.flat().find((f) => f.art === 'text' && !f.berechnet)!;
    act(() => useFormulare.getState().wertSetzen(feld, 'Entwurf'));
    await act(() => useFormulare.getState().schliessen());
    const setItem = localStorage.setItem.bind(localStorage);
    const spion = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (k.startsWith('formulare:entwuerfe') || k.startsWith('formulare:verlauf')) if (`${k}${v}`.includes('010-Muster neu')) throw new Error('QuotaExceededError');
      setItem(k, v);
    });
    try {
      await umbenennen(host, '001-Muster', '010-Muster neu');
    } finally {
      spion.mockRestore();
    }
    expect(ds.dateien.has(NEU)).toBe(true);
    expect(useFormulare.getState().meldung).toMatchObject({ art: 'fehler', text: expect.stringContaining('Nicht gespeicherte Eingaben ließen sich nicht mitnehmen') });
    expect(hatEntwurf(useFormulare.getState().projekt!, 'BS9/001-Muster.frmsjf')).toBe(true);
  });

  it('Speicher voll beim Umziehen des Verlaufs: der alte bleibt stehen', () => {
    const projekt = { root: 'C:/FORMA', ordner: 'BS9', titel: '' };
    localStorage.setItem('formulare:verlauf:C:/FORMA|BS9/a.frmsjf', JSON.stringify({ schritte: [{ x: 1 }] }));
    const setItem = localStorage.setItem.bind(localStorage);
    const spion = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (k.includes('b.frmsjf')) throw new Error('QuotaExceededError');
      setItem(k, v);
    });
    try {
      expect(formularLokalVerschieben(projekt, 'BS9/a.frmsjf', 'BS9/b.frmsjf')).toBe(false);
    } finally {
      spion.mockRestore();
    }
    expect(localStorage.getItem('formulare:verlauf:C:/FORMA|BS9/a.frmsjf')).not.toBeNull();
  });

  it('in FORMA geöffnet (Sperrdatei): nicht umbenannt', async () => {
    ds.dateien.set('C:/FORMA/BS9/001-Muster.frmtmp', cp1252Schreiben('[Zugriff]\r\nUser=k.kollege\r\nComputer=CAD02\r\n'));
    const host = await projektBS9();
    await rechtsklick(knopf(host, '001-Muster'));
    await klick(menuePunkt('Umbenennen'));
    // keine Rückfrage, gleich die Meldung
    expect(document.querySelector('.rf input')).toBeNull();
    expect(useFormulare.getState().meldung?.text).toContain('in einem anderen Programm oder auf einem anderen Rechner geöffnet');
    expect(ds.dateien.has(ALT)).toBe(true);
  });

  it('Projektdatei nicht schreibbar: die Umbenennung wird zurückgenommen, nichts verliert seine Zuordnung', async () => {
    const host = await projektBS9();
    await mitZuordnungen(host);
    ds.projektordner.projektdateiErsetzen = async () => {
      throw new Error('Netzlaufwerk weg');
    };
    await umbenennen(host, '001-Muster', '010-Muster neu');
    expect(ds.dateien.has(ALT)).toBe(true);
    expect(ds.dateien.has(NEU)).toBe(false);
    expect(antragIn('BAUA')?.felder).toEqual({ '001-Muster.frmsjf': ZUSTAND });
    expect(useFormulare.getState().meldung).toMatchObject({ art: 'fehler', text: expect.stringContaining('heißt weiter so') });
    expect(knopf(host, '001-Muster')).toBeDefined();
  });

  it('einen vorhandenen Namen nimmt es nicht – und ungültige Zeichen auch nicht', async () => {
    ds.dateien.set('C:/FORMA/BS9/002-Anderes.frmsjf', MUSTER);
    const host = await projektBS9();
    await umbenennen(host, '001-Muster', '002-anderes');
    expect(useFormulare.getState().meldung?.text).toContain('gibt es in diesem Ordner schon');
    await umbenennen(host, '001-Muster', 'Muster: neu');
    expect(useFormulare.getState().meldung?.text).toContain('nicht erlaubt');
    expect(ds.dateien.has(ALT)).toBe(true);
    expect(ds.dateien.get('C:/FORMA/BS9/002-Anderes.frmsjf')).toBe(MUSTER);
  });
});

describe('Reihenfolge der Formulare in der Navigation', () => {
  const namen = (host: HTMLElement, liste = 'formulare') => [...host.querySelectorAll(`[data-formular-liste="${liste}"] > [data-formular] .nav-text`)].map((t) => t.textContent);
  const zeile = (host: HTMLElement, name: string) => knopf(host, name);
  const gemerkt = () => (abschnitt() as { reihenfolge?: string[] } | undefined)?.reihenfolge;

  it('Alt+↑/↓ und Ziehen – für das ganze Projekt in der Projektdatei; ein Klick bleibt ein Klick; zurücksetzen', async () => {
    ds.dateien.set('C:/FORMA/BS9/002-Anderes.frmsjf', MUSTER);
    ds.dateien.set('C:/FORMA/BS9/003-Dritt.frmsjf', MUSTER);
    const host = await projektBS9();
    expect(namen(host)).toEqual(['001-Muster', '002-Anderes', '003-Dritt']);
    // Tastatur
    act(() => void zeile(host, '001-Muster').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })));
    await warte();
    expect(namen(host)).toEqual(['002-Anderes', '001-Muster', '003-Dritt']);
    expect(gemerkt()).toEqual(['002-Anderes.frmsjf', '001-Muster.frmsjf', '003-Dritt.frmsjf']);
    // Gegenprobe: ohne Alt nichts
    act(() => void zeile(host, '001-Muster').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    await warte();
    expect(namen(host)).toEqual(['002-Anderes', '001-Muster', '003-Dritt']);
    // Ziehen: „002-Anderes“ ans Ende
    act(() => void zeile(host, '002-Anderes').dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0, bubbles: true })));
    act(() => void window.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 40 })));
    expect(host.querySelector('[data-formular="BS9/002-Anderes.frmsjf"]')!.getAttribute('data-ziehen')).toBe('quelle');
    act(() => void window.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: 40 })));
    await warte();
    expect(namen(host)).toEqual(['001-Muster', '003-Dritt', '002-Anderes']);
    expect(useFormulare.getState().offen).toBeNull();
    // ein Klick ohne Bewegung öffnet das Formular und verschiebt nichts
    act(() => void zeile(host, '003-Dritt').dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0, bubbles: true })));
    act(() => void window.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: 0 })));
    await klick(zeile(host, '003-Dritt'));
    expect(useFormulare.getState().offen?.pfad).toBe('BS9/003-Dritt.frmsjf');
    expect(namen(host)).toEqual(['001-Muster', '003-Dritt', '002-Anderes']);
    // zurücksetzen
    await rechtsklick(zeile(host, '001-Muster'));
    await klick(menuePunkt('Reihenfolge zurücksetzen'));
    await warte();
    expect(namen(host)).toEqual(['001-Muster', '002-Anderes', '003-Dritt']);
    expect(gemerkt()).toBeUndefined();
  });

  it('ohne Projektdatei: kein Ziehen, kein Hinweis darauf – alphabetisch', async () => {
    ds.dateien.delete(OAP);
    ds.dateien.set('C:/FORMA/BS9/002-Anderes.frmsjf', MUSTER);
    const host = await projektBS9();
    expect(useFormulare.getState().oap).toBe('fehlt');
    act(() => void zeile(host, '001-Muster').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })));
    await warte();
    expect(namen(host)).toEqual(['001-Muster', '002-Anderes']);
    expect(zeile(host, '001-Muster').title).not.toContain('Reihenfolge');
    expect(zeile(host, '001-Muster').hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('Kontextmenü aus dem gemeinsamen Menü: genau eines, Esc schließt es, der Fokus geht an die Zeile zurück', async () => {
    const host = await projektBS9();
    const z = knopf(host, '001-Muster');
    act(() => z.focus());
    await rechtsklick(z);
    expect(document.querySelectorAll('.menue[role="menu"]')).toHaveLength(1);
    // benannt nach dem Formular (Screenreader: „001-Muster, Menü“)
    expect(document.querySelector('.menue')!.getAttribute('aria-label')).toBe('001-Muster');
    expect(document.activeElement?.classList.contains('menue-punkt')).toBe(true);
    act(() => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('.menue')).toBeNull();
    expect(document.activeElement).toBe(z);
  });

  it('Kontextmenü eines Formulars: „Ordner öffnen“, Löschen als Gefahr-Punkt am Ende hinter einem Trenner', async () => {
    const host = await projektBS9();
    await rechtsklick(knopf(host, '001-Muster'));
    const kinder = [...document.querySelector('.menue')!.children];
    const letzter = kinder[kinder.length - 1];
    expect(letzter.textContent).toContain('Löschen');
    expect(letzter.classList.contains('gefahr')).toBe(true);
    expect(kinder[kinder.length - 2].classList.contains('menue-trenner')).toBe(true);
    expect(menuePunkt('Ordner öffnen')).toBeTruthy();
    expect(document.querySelector('.menue')!.textContent).not.toContain('Explorer');
    // der Erstfokus liegt nicht auf dem Gefahr-Punkt
    expect(document.activeElement?.textContent).not.toContain('Löschen');
  });

  it('Rechtsklick und Esc beim Ziehen verschieben nichts; an der Ausgangsstelle keine Einfügestelle', async () => {
    ds.dateien.set('C:/FORMA/BS9/002-Anderes.frmsjf', MUSTER);
    const host = await projektBS9();
    act(() => void zeile(host, '001-Muster').dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX: 0, clientY: 0, bubbles: true })));
    act(() => void window.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 40 })));
    expect(host.querySelector('[data-ziehen]')).toBeNull();
    act(() => void window.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: 40 })));
    // Esc während des Ziehens
    act(() => void zeile(host, '001-Muster').dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0, bubbles: true })));
    act(() => void window.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 40 })));
    expect(host.querySelector('[data-formular="BS9/001-Muster.frmsjf"]')!.getAttribute('data-ziehen')).toBe('quelle');
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    act(() => void window.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: 40 })));
    await warte();
    expect(namen(host)).toEqual(['001-Muster', '002-Anderes']);
    expect(gemerkt()).toBeUndefined();
    // Ziehen zurück an die Ausgangsstelle: keine Markierung „davor“
    act(() => void zeile(host, '001-Muster').dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0, bubbles: true })));
    act(() => void window.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: -40 })));
    expect(host.querySelector('[data-ziehen="davor"]')).toBeNull();
    act(() => void window.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: -40 })));
  });

  it('gleichzeitig hat ein anderer Arbeitsplatz ein Merkmal geändert: es bleibt; schlägt das Schreiben fehl, wird die Anzeige zurückgenommen', async () => {
    ds.dateien.set('C:/FORMA/BS9/002-Anderes.frmsjf', MUSTER);
    const host = await projektBS9();
    // in der Datei, ohne dass die App neu liest
    const p = readProjectFile(ds.dateien.get(OAP)!);
    const f = p.formulare as { antraege: Record<string, Record<string, unknown>> };
    f.antraege['BAUA 2'] = { ...f.antraege['BAUA 2'], merkmale: { Gebäudeklasse: '4' } };
    ds.dateien.set(OAP, writeArchive(p));
    act(() => void zeile(host, '001-Muster').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })));
    await warte();
    expect(gemerkt()).toEqual(['002-Anderes.frmsjf', '001-Muster.frmsjf']);
    expect(antragIn('BAUA 2')?.merkmale).toEqual({ Gebäudeklasse: '4' });
    // Schreiben schlägt fehl: zurück zur gespeicherten Folge
    ds.projektordner.projektdateiErsetzen = async () => {
      throw new Error('Netzlaufwerk weg');
    };
    act(() => void zeile(host, '001-Muster').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true })));
    for (let i = 0; i < 3; i++) await warte();
    expect(namen(host)).toEqual(['002-Anderes', '001-Muster']);
    expect(useFormulare.getState().meldung?.art).toBe('fehler');
  });

  it('ohne Projektdatei: die Store-Aktion meldet es und ändert nichts', async () => {
    ds.dateien.delete(OAP);
    const host = await projektBS9();
    await act(() => useAntrag.getState().reihenfolgeSetzen(['001-Muster.frmsjf']));
    expect(useFormulare.getState().meldung?.text).toContain('Reihenfolge nicht gespeichert');
    expect(useAntrag.getState().projektdatei?.reihenfolge).toBeUndefined();
    expect(ds.dateien.has(OAP)).toBe(false);
    expect(namen(host)).toEqual(['001-Muster']);
  });

  it('während ein Antragswechsel lädt: nichts verschoben, „wird gerade geöffnet“ – danach wieder möglich', async () => {
    ds.dateien.set('C:/FORMA/BS9/002-Anderes.frmsjf', MUSTER);
    const host = await projektBS9();
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA 2');
    // das Lesen des Antragsordners hängt: aktiv ist schon BAUA, angezeigt noch BAUA 2
    const liste = ds.liste.bind(ds);
    let los!: () => void;
    let halten = true;
    ds.liste = async (pfad: string, tiefe: number) => {
      if (halten && pfad.endsWith('/TÖB') && tiefe === 1) {
        halten = false;
        await new Promise<void>((r) => (los = r));
      }
      return liste(pfad, tiefe);
    };
    let fw!: Promise<void>;
    act(() => {
      fw = useAntrag.getState().fassungWaehlen('BAUA');
    });
    for (let i = 0; i < 20 && !los; i++) await warte();
    expect(los).toBeTruthy();
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA 2');
    // über die Tastatur und direkt über die Store-Aktion: nichts geändert, nichts geschrieben
    act(() => void zeile(host, '001-Muster').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })));
    await warte();
    const info = await act(() => useAntrag.getState().reihenfolgeSetzen(['002-Anderes.frmsjf', '001-Muster.frmsjf']));
    expect(info).toEqual({ grund: 'Antrag BAUA wird gerade geöffnet', vorab: 'fassung', erneut: true });
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Reihenfolge nicht geändert – Antrag BAUA wird gerade geöffnet; bitte gleich noch einmal versuchen.' });
    expect(useAntrag.getState().projektdatei?.reihenfolge).toBeUndefined();
    expect(gemerkt()).toBeUndefined();
    expect(namen(host)).toEqual(['001-Muster', '002-Anderes']);
    los();
    await act(() => fw);
    await warte();
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA');
    // Gegenprobe: nach dem Öffnen geht es wieder
    act(() => void zeile(host, '001-Muster').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })));
    await warte();
    expect(namen(host)).toEqual(['002-Anderes', '001-Muster']);
    expect(gemerkt()).toEqual(['002-Anderes.frmsjf', '001-Muster.frmsjf']);
  });

  it('nicht übernommen ohne Ausnahme (während des Schreibens geschlossen): keine Fehlermeldung, kein fremder Stand – die Datei hat die neue Folge', async () => {
    ds.dateien.set('C:/FORMA/BS9/002-Anderes.frmsjf', MUSTER);
    await projektBS9();
    const bs9 = useFormulare.getState().projekt!;
    // das Schreiben hängt einmal – währenddessen wird das Projekt geschlossen
    const ersetzen = ds.projektordner.projektdateiErsetzen.bind(ds.projektordner);
    let los!: () => void;
    let einmal = true;
    ds.projektordner.projektdateiErsetzen = async (...a: Parameters<typeof ersetzen>) => {
      if (einmal) {
        einmal = false;
        await new Promise<void>((r) => (los = r));
      }
      return ersetzen(...a);
    };
    let laeuft!: Promise<SchreibInfo>;
    act(() => {
      laeuft = useAntrag.getState().reihenfolgeSetzen(['002-Anderes.frmsjf', '001-Muster.frmsjf']);
    });
    for (let i = 0; i < 20 && !los; i++) await warte();
    expect(los).toBeTruthy();
    // sofort angezeigt (vor dem Speichern)
    expect(useAntrag.getState().projektdatei?.reihenfolge).toEqual(['002-Anderes.frmsjf', '001-Muster.frmsjf']);
    await act(() => useFormulare.getState().projektWaehlen(null));
    await warte();
    los();
    const info = await act(() => laeuft);
    await warte();
    // geschrieben, aber nicht mehr übernommen (projektdateiSchreiben liefert false, ohne zu werfen): kein „nicht
    // gespeichert“, und ohne offenes Projekt bleibt kein Stand von BS9 im Store
    expect(info.geschrieben).toBe(true);
    expect(info.dialog).toBeUndefined();
    expect(useFormulare.getState().meldung?.text ?? '').not.toMatch(/nicht gespeichert|Reihenfolge/);
    expect(useAntrag.getState().projektdatei).toBeNull();
    expect(gemerkt()).toEqual(['002-Anderes.frmsjf', '001-Muster.frmsjf']);
    // wieder geöffnet: die gespeicherte Folge
    await act(() => useFormulare.getState().projektWaehlen(bs9));
    for (let i = 0; i < 3; i++) await warte();
    expect(useAntrag.getState().projektdatei?.reihenfolge).toEqual(['002-Anderes.frmsjf', '001-Muster.frmsjf']);
  });

  it('Umbenennen nach dem Verschieben: der Platz ist keine Zuordnung – die Rückfrage spricht nicht vom Antragsumfang', async () => {
    ds.dateien.set('C:/FORMA/BS9/002-Anderes.frmsjf', MUSTER);
    const host = await projektBS9();
    act(() => void zeile(host, '001-Muster').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })));
    await warte();
    await rechtsklick(knopf(host, '001-Muster'));
    await klick(menuePunkt('Umbenennen'));
    expect(document.querySelector('.rf')!.textContent).not.toContain('Antragsumfang');
    await klick(knopf(document.querySelector('.rf')!, 'Abbrechen'));
  });

  it('Sammelprojekt: je Gruppe verschoben – die gemerkte Folge der anderen Gruppe bleibt', async () => {
    ds.dateien.set('C:/FORMA/BS9/2. BAUA/002-Bauantrag (2026).frmsjf', MUSTER);
    ds.dateien.set('C:/FORMA/BS9/2. BAUA/001-Lageplan.frmsjf', MUSTER);
    ds.dateien.set('C:/FORMA/BS9/003-Dritt.frmsjf', MUSTER);
    const host = await projektBS9();
    expect(namen(host, 'antrag')).toEqual(['001-Lageplan', '002-Bauantrag (2026)']);
    expect(namen(host, 'alle')).toEqual(['001-Muster', '003-Dritt']);
    act(() => void zeile(host, '001-Lageplan').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })));
    await warte();
    act(() => void zeile(host, '003-Dritt').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true })));
    await warte();
    expect(namen(host, 'antrag')).toEqual(['002-Bauantrag (2026)', '001-Lageplan']);
    expect(namen(host, 'alle')).toEqual(['003-Dritt', '001-Muster']);
    expect(gemerkt()).toEqual(['003-Dritt.frmsjf', '001-Muster.frmsjf', '2. BAUA/002-Bauantrag (2026).frmsjf', '2. BAUA/001-Lageplan.frmsjf']);
  });

  it('umbenannt: die Reihenfolge behält das Formular an seinem Platz', async () => {
    ds.dateien.set('C:/FORMA/BS9/002-Anderes.frmsjf', MUSTER);
    const host = await projektBS9();
    act(() => void zeile(host, '001-Muster').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })));
    await warte();
    await rechtsklick(knopf(host, '001-Muster'));
    await klick(menuePunkt('Umbenennen'));
    eingabe(document.querySelector<HTMLInputElement>('.rf input')!, '000-Erstes');
    await klick(knopf(document.querySelector('.rf')!, 'Umbenennen'));
    for (let i = 0; i < 3; i++) await warte();
    // alphabetisch stünde „000-Erstes“ vorn – gemerkt ist es hinter „002-Anderes“
    expect(namen(host)).toEqual(['002-Anderes', '000-Erstes']);
    expect(gemerkt()).toEqual(['002-Anderes.frmsjf', '000-Erstes.frmsjf']);
  });
});
