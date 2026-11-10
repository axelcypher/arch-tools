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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MUSTER = new Uint8Array(readFileSync(path.resolve(__dirname, '__fixtures__/muster.frmsjf')));
const PROJEKT = 'Z:/Projekte/BS9 Musterstraße 9';
const KATALOG = [
  { id: 'muster', titel: 'Musterformular', art: 'intern' as const, formular: 'Muster', vorgewaehlt: true },
  { id: 'bauantrag', titel: 'Bauantrag', art: 'intern' as const, formular: 'Bauantrag', vorgewaehlt: true },
  { id: 'lageplan', titel: 'Lageplan', art: 'extern' as const, quelle: 'Planung', muster: '*Lageplan*', vorgewaehlt: true },
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
  });
  useAntrag.setState({ einstellungen: { ...VORGABE_EXPORT }, katalog: KATALOG, merkmalDefinitionen: VORGABE_MERKMALE, ueberschreibungen: {}, projektdatei: null, fassungen: [], dateien: [], quellen: {}, formularInfo: {}, dokumente: [], projektStatus: {} });
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

  it('neue Antragsfassung anlegen: Ordner entsteht, sie wird aktiv und in formulare.json vermerkt', async () => {
    const host = await projektBS9();
    await klick(host.querySelector<HTMLButtonElement>('.an-fassung-knopf')!);
    await klick(menuePunkt('Neue Fassung „BAUA 3“'));
    expect(ds.ordner.has(`${PROJEKT}/TÖB/BAUA 3`)).toBe(true);
    expect(JSON.parse(new TextDecoder().decode(ds.dateien.get('C:/FORMA/BS9/formulare.json')!))).toEqual({ aktiveFassung: 'BAUA 3' });
    expect(host.querySelector('.an-fassung')?.textContent).toContain('BAUA 3');
  });
});

describe('Projektumfang und Vollständigkeit', () => {
  it('festlegen, Farbpunkte an den Formularen, fehlendes Formular per Klick anlegen', async () => {
    const host = await projektBS9();
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    await warte();
    // ohne Projektkarte (keine sj_prokarte.sdb) steht der Projektumfang direkt darunter
    await klick(knopf(host, 'Aus dem Katalog festlegen'));
    const datei = JSON.parse(new TextDecoder().decode(ds.dateien.get('C:/FORMA/BS9/formulare.json')!));
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
  const GK345 = [{ art: 'merkmal' as const, merkmal: 'Gebäudeklasse', werte: ['3', '4', '5'] }];
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
    expect(JSON.parse(new TextDecoder().decode(ds.dateien.get('C:/FORMA/BS9/formulare.json')!)).merkmale).toEqual({ Gebäudeklasse: '3' });

    await klick(knopf(host, '001-Muster'));
    expect(gl(host).querySelector('.fo-gl-punkt.entfaellt')).toBeNull();
    expect(gl(host).querySelector('.fo-gl-zahl')!.textContent).toBe('3/5');
    expect(gl(host).querySelector('.fo-gl-merkmal')).toBeNull();
  });

  it('Bedingung in der Gliederung bearbeiten: Projektmerkmal wählen und Wert ankreuzen', async () => {
    const host = await projektBS9();
    await klick(knopf(host, '001-Muster'));
    await klick(host.querySelector<HTMLButtonElement>('button[aria-label="Gliederung anpassen"]')!);
    await klick(host.querySelector<HTMLButtonElement>('button[aria-label="Bedingung für Abschnitt Bauherrschaft"]')!);
    await klick(knopf(gl(host) as HTMLElement, 'Projektmerkmal'));
    await klick(gl(host).querySelector<HTMLInputElement>('input[aria-label="Gebäudeklasse 4"]')!);
    expect(useFormulare.getState().profile['nw019999|2026A'].abschnitte['0:Panel1'].bedingung).toEqual([{ art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['4'] }]);
  });

  it('ein angekreuztes Feld schaltet ein weiteres erforderliches Feld frei – im Formular farbig statt neutral', async () => {
    useFormulare.getState().profilSetzen('nw019999|2026A', { abschnitte: {}, zaehlt: {}, bedingungen: { '0:Memo2': [{ art: 'feld', feld: '0:CheckBox2', pruefung: 'ausgefuellt' }] } });
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
    expect(ab1.querySelector('.pa-marke.sperre')!.textContent).toContain('1 geöffnet');
    expect(ab1.querySelector('.pa-status-text')!.textContent).toContain('noch nicht geprüft');
    act(() => void suche.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await warte();
    expect(useFormulare.getState().projekt?.ordner).toBe('AB1');
    expect(host.querySelector('.pa')).toBeNull();

    // BS9 öffnen und den Projektumfang festlegen – der Antragsstatus wird für die Übersicht gemerkt
    await klick(knopf(host, 'Wechseln'));
    await projektOeffnen(host, 'BS9');
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    await klick(knopf(host, 'Aus dem Katalog festlegen'));
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
