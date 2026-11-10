// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { VORGABE_EXPORT, jjmmtt } from './antrag';
import { VORGABE_MERKMALE } from './bedingung';
import { useAntrag } from './antragStore';
import { SpeicherDateisystem } from './dateisystem';
import { cp1252Schreiben } from './forma/cp1252';
import { felderDerSeite } from './forma/felder';
import { parseFormular } from './forma/formular';
import { formularPdf } from './forma/pdf';
import { pdfjs } from './dokumente/pdf';
import { useAufgeklappt } from './components/ProjektUebersicht';
import { useFormulare } from './store';
import { readProjectFile, writeArchive } from '@core/archive';
import { createProject, leereMeta } from '@core/model';

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
    const name = `BS9 GP ${jjmmtt(new Date())} Muster.pdf`;
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
    expect(baum(`BS9 GP ${jjmmtt(new Date())} Muster.pdf`)).toBeDefined();

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
    expect([...ds.dateien.keys()].some((k) => k.startsWith(`${PROJEKT}/Planung/BS9 GP`) && k.endsWith('Muster.pdf'))).toBe(true);
  });

  it('neue Antragsfassung anlegen: Ordner entsteht, sie wird aktiv und in der Projektdatei vermerkt', async () => {
    const host = await projektBS9();
    await klick(host.querySelector<HTMLButtonElement>('.an-fassung-knopf')!);
    await klick(menuePunkt('Neue Fassung „BAUA 3“'));
    expect(ds.ordner.has(`${PROJEKT}/TÖB/BAUA 3`)).toBe(true);
    expect(abschnitt()).toEqual({ aktiveFassung: 'BAUA 3' });
    expect(ds.dateien.has('C:/FORMA/BS9/formulare.json')).toBe(false);
    expect(host.querySelector('.an-fassung')?.textContent).toContain('BAUA 3');
  });
});

describe('Projektumfang und Vollständigkeit', () => {
  it('festlegen, Farbpunkte an den Formularen, fehlendes Formular per Klick anlegen', async () => {
    const host = await projektBS9();
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    await warte();
    // ohne Projektkarte (keine sj_prokarte.sdb) steht der Projektumfang direkt darunter
    await klick(knopf(host, 'Projektumfang festlegen'));
    const datei = abschnitt() as { umfang: { id: string }[] };
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
    expect(d.datei?.pfad).toMatch(/^BS9 GP \d{6} Musterformular\.pdf$/);
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
    expect(host.textContent).toContain('ist gerade in FORMA oder auf einem anderen Rechner geöffnet');
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

describe('Bedingungen: Projektmerkmale und Felder', () => {
  const GK345 = { art: 'gruppe' as const, op: 'und' as const, teile: [{ art: 'merkmal' as const, merkmal: 'Gebäudeklasse', werte: ['3', '4', '5'] }] };
  const gl = (host: Element) => host.querySelector('nav[aria-label="Inhalt des Formulars"]')!;

  it('ein Abschnitt nur bei Gebäudeklasse 3–5: entfällt, bis das Projekt GK 3 ist – das Merkmal gilt für alle Formulare', async () => {
    useFormulare.getState().profilSetzen('nw019999|2026A', { abschnitte: { '0:Panel1': { bedingung: GK345 } }, zaehlt: {} });
    const host = await projektBS9();
    await klick(knopf(host, '001-Muster'));
    expect(gl(host).querySelector('.fo-gl-punkt.entfaellt')?.textContent).toContain('entfällt');
    expect(gl(host).querySelector('.fo-gl-fortschritt')!.textContent).toContain('0 von 0');
    expect(gl(host).querySelector('.fo-gl-merkmal')!.textContent).toContain('Gebäudeklasse');

    // „Festlegen …“ führt zu den Projektmerkmalen im Projektumfang
    await klick(knopf(gl(host) as HTMLElement, 'Festlegen'));
    await warte();
    const gk = host.querySelector<HTMLSelectElement>('select[aria-label="Gebäudeklasse"]')!;
    act(() => {
      gk.value = '3';
      gk.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await warte();
    // Projektmerkmale gehören zum Projekt: meta.merkmale (für alle Apps), nicht der Abschnitt „formulare“
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.merkmale).toEqual({ Gebäudeklasse: '3' });
    expect(abschnitt()?.merkmale).toBeUndefined();

    await klick(knopf(host, '001-Muster'));
    expect(gl(host).querySelector('.fo-gl-punkt.entfaellt')).toBeNull();
    expect(gl(host).querySelector('.fo-gl-zahl')!.textContent).toBe('3/5');
    expect(gl(host).querySelector('.fo-gl-merkmal')).toBeNull();
  });

  it('Bedingung zusammenstellen: Projektmerkmal UND (Feld per Klick im Formular ODER anderes Merkmal) – in Worten und mit Zustand', async () => {
    const host = await projektBS9();
    await klick(knopf(host, '001-Muster'));
    const einrichten = [...host.querySelectorAll<HTMLButtonElement>('.toolbar button')].find((b) => b.textContent?.includes('Einrichten'))!;
    await klick(einrichten);
    const panel = () => host.querySelector<HTMLElement>('aside[aria-label="Einstellungen der Auswahl"]')!;
    const bedingung = () => useFormulare.getState().profile['nw019999|2026A']?.abschnitte['0:Panel1']?.bedingung;
    // Abschnitt im Baum wählen; „immer erforderlich“ → nur bei Gebäudeklasse 4 oder 5
    await klick(host.querySelector<HTMLButtonElement>('.fo-ein-baum [data-auswahl="a:0:Panel1"]')!);
    expect(panel().textContent).toContain('Immer erforderlich');
    await klick(knopf(panel(), 'Nur bei Projektmerkmal'));
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
    expect(panel().querySelector('.bd-jetzt')!.textContent).toBe('trifft gerade nicht zu');

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

  it('Dokumente des Projektumfangs mit Bedingung: entfallen bei GK 1, fehlen bei GK 3', async () => {
    const host = await projektBS9();
    await useAntrag.getState().merkmalSetzen('Gebäudeklasse', '1');
    await useAntrag.getState().umfangSetzen([{ id: 'bauantrag', titel: 'Bauantrag', art: 'intern', formular: 'Bauantrag', bedingung: GK345 }]);
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
  it('aus einem anderen Projekt – neuester Stand, geleert, geöffnet und in den Projektumfang aufgenommen', async () => {
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

    // BS9 öffnen und den Projektumfang festlegen – der Antragsstatus wird für die Übersicht gemerkt
    await klick(knopf(host, 'Wechseln'));
    await projektOeffnen(host, 'BS9');
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    await klick(knopf(host, 'Projektumfang festlegen'));
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
    expect(abschnitt()).toEqual({ aktiveFassung: 'BAUA' });
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.merkmale).toEqual({ Gebäudeklasse: '2' });
    expect(useAntrag.getState().projektdatei?.merkmale).toEqual({ Gebäudeklasse: '2' });
    expect(ds.dateien.get('C:/FORMA/BS9/formulare.json')).toBe(alt);
    expect(useAntrag.getState().projektdatei).toMatchObject({ aktiveFassung: 'BAUA' });
    expect(host.textContent).toContain('in die Projektdatei übernommen');
    // die Stammdaten der Projektdatei bleiben, wie sie sind
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.projektcode).toBe('BS9');
  });

  it('ohne Projektdatei fragt der Stammdaten-Dialog die Angaben ab – danach steht der Projektumfang in der neuen Datei', async () => {
    ds.dateien.delete(OAP);
    const host = await projektBS9();
    expect(knopf(host, 'Keine Projektdatei')).toBeDefined();
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    await klick(knopf(host, 'Projektumfang festlegen'));
    const sd = dialog('Projektdatei für BS9 anlegen')!;
    expect(sd).not.toBeNull();
    expect(ds.dateien.has(OAP)).toBe(false);
    await klick(knopf(sd, 'Projektdatei anlegen'));
    await warte();
    expect(dialog('Projektdatei für BS9 anlegen')).toBeNull();
    expect((abschnitt()!.umfang as { id: string }[]).map((u) => u.id)).toEqual(['muster', 'bauantrag', 'lageplan']);
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.projektcode).toBe('BS9');
    expect(knopf(host, 'Keine Projektdatei')).toBeUndefined();
    expect(ds.dateien.has('C:/FORMA/BS9/formulare.json')).toBe(false);
  });

  it('ohne Projektordner: im Stammordner anlegen und zuordnen, dann Stammdaten – der Projektumfang landet in der neuen Projektdatei', async () => {
    for (const k of [...ds.dateien.keys()]) if (k.startsWith(PROJEKT)) ds.dateien.delete(k);
    ds.ordner.clear();
    const host = await projektBS9();
    expect(knopf(host, 'Kein Projektordner')).toBeDefined();
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    await klick(knopf(host, 'Projektumfang festlegen'));
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
    expect((abschnitt()!.umfang as unknown[]).length).toBe(3);
    expect(knopf(host, 'Kein Projektordner')).toBeUndefined();
  });
});

describe('Antragsvorlagen und Reihenfolge', () => {
  const ids = () => (abschnitt()!.umfang as { id: string }[]).map((u) => u.id);
  const zeile = (host: HTMLElement, titel: string) => [...host.querySelectorAll<HTMLElement>('.pu-zeile')].find((z) => z.querySelector('strong')?.textContent === titel)!;
  const taste = (el: HTMLElement, key: string) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));

  it('Projektumfang aus der Vorlage zur Antragsart, aus einer anderen Vorlage ergänzen, Reihenfolge ändern', async () => {
    const host = await projektBS9();
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    // aktive Fassung „BAUA 2“ → Vorlage Bauantrag vorgeschlagen
    const wahl = host.querySelector<HTMLSelectElement>('select[aria-label="Antragsvorlage"]')!;
    expect(wahl.value).toBe('baua');
    expect(wahl.selectedOptions[0].textContent).toBe('Bauantrag (BAUA) – 3 Dokumente');
    // stattdessen die Voranfrage
    act(() => {
      wahl.value = 'bauva';
      wahl.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await klick(knopf(host, 'Projektumfang festlegen'));
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
    useFormulare.setState({ haupt: 'einstellungen', einstellungsBereich: 'antrag' });
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
