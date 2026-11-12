// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { VORGABE_EXPORT, einstellungenAus, jjmmtt, tagVon } from './antrag';
import { VORGABE_MERKMALE } from './bedingung';
import { aktiveFassung, exportVorschlag, istArchiv, useAntrag } from './antragStore';
import { SpeicherDateisystem } from './dateisystem';
import { cp1252Schreiben } from './forma/cp1252';
import { felderDerSeite } from './forma/felder';
import { parseFormular } from './forma/formular';
import { formularPdf } from './forma/pdf';
import { pdfjs } from './dokumente/pdf';
import { useAufgeklappt } from './components/ProjektUebersicht';
import { useFormulare } from './store';
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
  ds.dateien.set('C:/FORMA/H24/sj_office.ini', cp1252Schreiben('[Allgemeines]\r\nText=Höggenstraße\r\n\r\n'));
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
  });
  useAntrag.setState({ einstellungen: { ...VORGABE_EXPORT }, katalog: KATALOG, vorlagen: VORLAGEN, merkmalDefinitionen: VORGABE_MERKMALE, ueberschreibungen: {}, projektdatei: null, fassungen: [], dateien: [], quellen: {}, formularInfo: {}, dokumente: [], projektStatus: {} });
  useAufgeklappt.setState({ offen: [] });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

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
const rechtsklick = async (el: Element) => {
  act(() => void el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
  await warte();
};
const eingabe = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

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
    await klick(menuePunkt('Als PDF exportieren'));
    const dialog = host.querySelector('[aria-label="Als PDF exportieren"]')!;
    const name = `BS9 BAUA ${jjmmtt(new Date())} Muster.pdf`;
    expect(dialog.querySelector<HTMLInputElement>('input[aria-label="Dateiname"]')!.value).toBe(name);
    expect(dialog.textContent).toContain('TÖB/BAUA 2');
    await klick(knopf(dialog, 'Exportieren'));
    const pdf = ds.dateien.get(`${PROJEKT}/TÖB/BAUA 2/${name}`)!;
    expect(new TextDecoder().decode(pdf.subarray(0, 8))).toBe('%PDF-1.4');
    expect(host.querySelector('[aria-label="Als PDF exportieren"]')).toBeNull();

    // gibt es die Datei schon, muss Ersetzen bestätigt werden
    await klick(knopf(host, 'PDF'));
    await klick(menuePunkt('Als PDF exportieren'));
    const zweiter = host.querySelector('[aria-label="Als PDF exportieren"]')!;
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
    await klick(knopf(host.querySelector('[aria-label="Als PDF exportieren"]')!, 'Exportieren'));
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
    const dialog = host.querySelector('[aria-label="Als PDF exportieren"]')!;
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
    await klick(knopf(host.querySelector('[aria-label="Als PDF exportieren"]')!, 'Exportieren'));
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
    expect(gl(host).querySelector('.fo-gl-fortschritt')!.textContent).toContain('2 offen (hängt von Merkmalen ab)');
    expect(gl(host).querySelector('.fo-gl-merkmal')!.textContent).toContain('Gebäudeklasse');
    // am Feld: gelb mit Hinweis „Offen“, nicht „Entfällt“
    expect(host.querySelector('.fo-papier [data-feld="0:Memo2"]')!.classList.contains('offen')).toBe(true);
    const info = host.querySelector<HTMLButtonElement>('.fo-papier .fo-entfall-info.offen')!;
    expect(info.getAttribute('aria-label')).toMatch(/^Offen – hängt ab von: Gebäudeklasse \(nicht festgelegt\)/);

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
    await klick(host.querySelector<HTMLButtonElement>('button[aria-label="Formular hinzufügen"]')!);
    await warte();
    const dialog = host.querySelector('[aria-label="Formular hinzufügen"][role="dialog"]')!;
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
  const dialog = (name: string) => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${name}"]`);

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
    expect(menuePunkt('Nach oben').disabled).toBe(true);
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
    // Spalten je Vorlage im Katalog
    const kreuz = (dok: string, vorlage: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${dok} in ${vorlage}"]`)!;
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

    // Startseite von Formulare
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

  /** zweites Projekt mit eigener Projektdatei: H24 (FORMA) mit Projektordner „Z:/Projekte/H24 Höggenstraße“ */
  const H24_OAP = 'Z:/Projekte/H24 Höggenstraße/Planung/Berechnungen/H24.oap';
  const h24Vorbereiten = () => {
    const p = createProject('Höggenstraße');
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
    expect(useFormulare.getState().meldung?.text).toContain('nicht als aktive Antragsfassung gesetzt');
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
    expect(useFormulare.getState().meldung?.text).toBe('Projektordner zugeordnet – angezeigt wird jetzt die Antragsfassung „BAUA 2“ aus dem Projektordner. Die Änderung ist nicht übernommen; bitte dort bei Bedarf noch einmal vornehmen.');
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
    expect(useFormulare.getState().meldung?.text).toMatch(/angelegt \(leer\), aber nicht zugeordnet – die Projektdatei ist gerade nicht lesbar\. Bitte später per Rechtsklick auf das Formular in der Navigation › „Antragsdokument“ › „Bauantrag“ zuordnen\.$/);
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

  it('Verknüpfen aus einem Menü der angezeigten Fassung, während ein Fassungswechsel lädt: für die festgehaltene Fassung', async () => {
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
    // aktiv ist schon BAUA, angezeigt noch BAUA 2 – das Menü der Zeile gehört zu BAUA 2
    expect(useAntrag.getState().projektdatei?.ansicht).toBe('BAUA 2');
    const info = await act(() => useAntrag.getState().verknuepfen('lageplan', 'BS9 Lageplan B2.pdf', { ansicht: 'BAUA 2' }));
    los();
    await act(() => fw);
    await warte();
    expect(info.geschrieben).toBe(true);
    expect(((antragIn('BAUA 2')?.umfang as { id: string; dateien?: Record<string, string> }[]).find((u) => u.id === 'lageplan') ?? {}).dateien).toEqual({ 'BAUA 2': 'BS9 Lageplan B2.pdf' });
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
    expect(useFormulare.getState().meldung?.text).toBe('Projektdatei angelegt – Antragsfassung „BAUA 2“ ist das Ziel des Exports.');
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

  it('Navigation: Menüs „Antragsdokument“ und „Formular anlegen“ aus BAUA 2 offen, dann zeigt das Projekt BAUA – dort nichts geändert bzw. angelegt', async () => {
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
    // fehlendes Formular: „Formular anlegen“ aus dem Menü von BAUA 2
    await aktivVonAussen('BAUA 2');
    await act(() => useAntrag.getState().laden());
    await warte();
    const vorher = bs9Formulare().length;
    await act(async () => void (await useAntrag.getState().formularAnlegen('bauantrag', { ansicht: 'BAUA 2' })));
    await warte();
    for (const k of bs9Formulare().slice(vorher)) ds.dateien.delete(k);
    await act(() => useFormulare.getState().projektWaehlen(bs9Projekt()));
    await warte();
    await act(async () => void (await useAntrag.getState().umfangSetzen((useAntrag.getState().projektdatei!.umfang ?? []).map((u) => (u.id === 'bauantrag' ? { ...u, formularDatei: undefined } : u)))));
    await aktivVonAussen('BAUA');
    const anzahl = bs9Formulare().length;
    expect(await act(() => useAntrag.getState().formularAnlegen('bauantrag', { ansicht: 'BAUA 2' }))).toBeNull();
    expect(bs9Formulare().length).toBe(anzahl);
    expect(useFormulare.getState().meldung).toEqual({ art: 'info', text: 'Formular nicht angelegt – inzwischen ist Antrag BAUA angezeigt.' });
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
