// @vitest-environment happy-dom
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { SpeicherDateisystem } from './dateisystem';
import { readProjectFile, writeArchive } from '@core/archive';
import { createProject, leereMeta } from '@core/model';
import { cp1252Schreiben } from './forma/cp1252';
import type { Projektkarte } from './forma/projektkarte';
import { useFormulare } from './store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MUSTER = new Uint8Array(readFileSync(path.resolve(__dirname, '__fixtures__/muster.frmsjf')));
const ORDNER = 'Z:/Projekte/BS9 Musterstraße 9';
const PD = `${ORDNER}/Organisation/BS9 Projektdaten.xlsx`;

const adresse = (gruppe: number, werte: Record<number, string>) =>
  Object.entries({ 30: '', 40: '', 70: '', 90: '', 110: '', ...werte }).map(([id, text]) => ({ gruppe, id: Number(id), typ: 1, titel: '', text, zahl: null }));
const karte = (bauherr: string, behoerde: string): Projektkarte => ({
  gruppen: [
    { id: 101, typ: 4, text: 'Projektdaten' },
    { id: 201, typ: 1, text: 'Bauherr' },
    { id: 231, typ: 1, text: 'Bauaufsichtsbehörde' },
    { id: 301, typ: 16, text: 'Baugrundstücksdaten' },
  ],
  eintraege: [
    { gruppe: 101, id: 30, typ: 2, titel: 'Bezeichnung der Baumaßnahme:', text: '', zahl: null },
    ...adresse(201, { 40: bauherr, 110: 'Musterstadt' }),
    ...adresse(231, behoerde ? { 40: behoerde, 70: 'Hoher Weg 1', 110: 'Soest' } : {}),
    { gruppe: 301, id: 40, typ: 1, titel: 'Gemarkung:', text: '', zahl: null },
    { gruppe: 301, id: 50, typ: 1, titel: 'Flur:', text: '', zahl: null },
    { gruppe: 301, id: 60, typ: 1, titel: 'Flurstück:', text: '', zahl: null },
  ],
});

async function projektdaten(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Projekt');
  [
    ['Bauvorhaben:', 'Umbau Wohnhaus'],
    ['Gemarkung', 'Musterhausen'],
    ['Flur', '3'],
    ['Flurstück', '123'],
    ['Bauherr', null],
    ['Name:', 'Mustermann'],
  ].forEach((z, i) => z.forEach((v, j) => v !== null && (ws.getCell(i + 1, j + 1).value = v)));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

let ds: SpeicherDateisystem;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  localStorage.clear();
  ds = new SpeicherDateisystem({ benutzer: 't.test', computer: 'HELEN', prozess: 4242 });
  for (const [k, titel, pk] of [
    ['BS9', 'Musterstraße 9', karte('Mustermann', 'Kreis Soest')],
    ['H24', 'Höggenstraße 24', karte('Beispiel', 'Kreis Soest')],
  ] as const) {
    ds.dateien.set(`C:/FORMA/${k}/001-Muster.frmsjf`, MUSTER);
    ds.dateien.set(`C:/FORMA/${k}/sj_office.ini`, cp1252Schreiben(`[Allgemeines]\r\nText=${titel}\r\n\r\n`));
    ds.dateien.set(`C:/FORMA/${k}/sj_prokarte.sdb`, new Uint8Array([1]));
    ds.projektkarten.set(`C:/FORMA/${k}/sj_prokarte.sdb`, structuredClone(pk));
  }
  ds.dateien.set(`${ORDNER}/Planung/plan.pdf`, new Uint8Array([1]));
  useFormulare.setState({
    ds,
    projektordner: ['C:/FORMA'],
    ablageordner: ['Z:/Projekte'],
    vorgabeAuswahl: ['*'],
    auswahl: {},
    projekte: [],
    projekt: null,
    formulare: [],
    offen: null,
    karte: null,
    datei: null,
    dateiEntwuerfe: {},
    haupt: 'formular',
    ansicht: 'seite',
    gliederungOffen: true,
    adressbuch: null,
    adressbuchLaeuft: null,
    rollenVorgaben: {},
    profile: {},
    projektdaten: null,
    oapVorlage: 'Planung/Berechnungen/{Kürzel}.oap',
    oapWahl: {},
    oap: null,
    einstellungsBereich: 'ordner',
    meldung: null,
  });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const warte = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const knopfMit = (host: Element, label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const klick = async (el: HTMLElement) => {
  act(() => el.click());
  await warte();
};
const eingabe = (el: HTMLInputElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const verlassen = (el: HTMLElement) => act(() => void el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
const waehle = (el: HTMLSelectElement, value: string) =>
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
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

/** Projekt in der Projektübersicht öffnen – eingeklappte Quellen vorher aufklappen */
async function projektOeffnen(host: HTMLElement, kuerzel: string) {
  const karte = () => host.querySelector<HTMLButtonElement>(`.pa-karte[data-projekt="${kuerzel}"]`);
  if (!karte()) for (const g of host.querySelectorAll<HTMLButtonElement>('.pa-gruppe-kopf[aria-expanded="false"]')) await klick(g);
  await klick(karte()!);
}

describe('Gliederung je Formular', () => {
  it('Abschnitte ausblenden und umbenennen, Felder vom Füllstand ausnehmen – gilt für das Formular in allen Projekten', async () => {
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(knopf(host, '001-Muster'));
    const gl = () => host.querySelector('nav[aria-label="Inhalt des Formulars"]')!;
    const abschnitte = () => [...gl().querySelectorAll('.fo-gl-abschnitt')].map((b) => b.querySelector('.fo-gl-titel')!.textContent);
    const vorher = abschnitte();
    expect(vorher[0]).toBe('Bauherrschaft');

    await klick(knopfMit(host, 'Gliederung anpassen'));
    const zeile = gl().querySelector('.fo-gl-anpassen')!;
    const titel = zeile.querySelector('input')!;
    eingabe(titel, 'Bauherr und Grundstück');
    verlassen(titel);
    await warte();
    // Felder aufklappen und das erste vom Füllstand ausnehmen
    await klick(zeile.querySelector<HTMLButtonElement>('button[aria-label="Felder"]')!);
    await klick(gl().querySelector<HTMLButtonElement>('.fo-gl-feld button[aria-label="Zählt für den Füllstand"]')!);
    // zweiten Abschnitt ausblenden
    const zweite = gl().querySelectorAll('.fo-gl-anpassen')[1];
    if (zweite) await klick(zweite.querySelector<HTMLButtonElement>('button[aria-label="In der Gliederung ausblenden"]')!);
    await klick(knopfMit(host, 'Gliederung anpassen'));

    expect(abschnitte()[0]).toBe('Bauherr und Grundstück');
    if (zweite) expect(abschnitte()).toHaveLength(vorher.length - 1);
    const profil = Object.values(useFormulare.getState().profile)[0];
    expect(Object.keys(useFormulare.getState().profile)).toEqual(['nw019999|2026A']);
    expect(Object.values(profil.zaehlt)).toEqual([false]);

    // im anderen Projekt gilt dasselbe Profil
    await klick(knopfMit(host, 'Projekt schließen'));
    await projektOeffnen(host, 'H24');
    await klick(knopf(host, '001-Muster'));
    expect(abschnitte()[0]).toBe('Bauherr und Grundstück');
  });

  it('Felder gruppieren und umbenennen: eine Auswahl über zwei Zeilen zählt als eine Angabe, die Untereinträge zeigen die Namen', async () => {
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(knopf(host, '001-Muster'));
    const gl = () => host.querySelector('nav[aria-label="Inhalt des Formulars"]')!;
    const zahl = () => gl().querySelector('.fo-gl-zahl')!.textContent;
    // Muster: drei Textfelder (zwei gefüllt), zwei Zeilen mit Kästchen (eine angekreuzt)
    expect(zahl()).toBe('3/5');

    await klick(knopfMit(host, 'Gliederung anpassen'));
    await klick(gl().querySelector<HTMLButtonElement>('button[aria-label="Felder"]')!);
    for (const name of ['Wohngebäude', 'CheckBox3', 'Sonderbau', 'CheckBox4']) {
      act(() => gl().querySelector<HTMLInputElement>(`input[aria-label="${name} auswählen"]`)!.click());
    }
    await warte();
    await klick(knopf(gl() as HTMLElement, 'als eine Angabe zählen'));
    // die Zahl am Abschnitt ändert sich sofort mit
    expect(zahl()).toBe('3/4');
    const gruppenName = gl().querySelector<HTMLInputElement>('input[aria-label="Name der Gruppe"]')!;
    eingabe(gruppenName, 'Gebäudeart');
    verlassen(gruppenName);
    await warte();
    const feldName = gl().querySelector<HTMLInputElement>('input[aria-label="Feldtitel für Bauherrschaft"]')!;
    eingabe(feldName, 'Name');
    verlassen(feldName);
    await warte();
    await klick(knopfMit(host, 'Gliederung anpassen'));

    expect(zahl()).toBe('3/4');
    await klick(knopfMit(host, 'Angaben in Bauherrschaft'));
    const unter = [...gl().querySelectorAll('.fo-gl-einheit')];
    expect(unter.map((u) => u.querySelector('.fo-gl-titel')!.textContent)).toEqual(['Name', 'Bauherrschaft', 'Bauherrschaft', 'Gebäudeart']);
    expect(unter.map((u) => u.querySelector('.fo-gl-status')!.classList.contains('voll'))).toEqual([true, false, true, true]);
    // eigener Name auch als Hinweis am Feld im Formular
    expect(host.querySelector<HTMLElement>('.fo-papier [data-feld="0:Memo1"]')!.title).toBe('Name');

    const profil = useFormulare.getState().profile['nw019999|2026A'];
    expect(profil.feldTitel).toEqual({ '0:Memo1': 'Name' });
    expect(profil.gruppen).toEqual([{ id: 'g1', titel: 'Gebäudeart', regel: 'eins', felder: ['0:CheckBox1', '0:CheckBox3', '0:CheckBox2', '0:CheckBox4'] }]);

    // Regel „alle nötig“: zwei der vier Kästchen sind nicht angekreuzt
    // im Anpassen-Modus bleibt der zuletzt aufgeklappte Abschnitt offen
    await klick(knopfMit(host, 'Gliederung anpassen'));
    waehle(gl().querySelector<HTMLSelectElement>('select[aria-label="Wann die Gruppe ausgefüllt ist"]')!, 'alle');
    await warte();
    expect(zahl()).toBe('2/4');
    // auflösen: wieder einzeln gezählt
    await klick(knopfMit(host, 'Gruppe auflösen'));
    expect(zahl()).toBe('3/5');
    expect(useFormulare.getState().profile['nw019999|2026A'].gruppen).toBeUndefined();
  });

  it('Zeigen auf einen Eintrag hebt seine Felder im Formular hervor; im Anpassen-Modus nach drei Sekunden umrandet', async () => {
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(knopf(host, '001-Muster'));
    const gl = () => host.querySelector('nav[aria-label="Inhalt des Formulars"]')!;
    const markiert = () => host.querySelectorAll('.fo-papier .markiert').length;
    const zeigen = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    const weg = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));

    const abschnitt = gl().querySelector('.fo-gl-abschnitt')!;
    zeigen(abschnitt);
    expect(markiert()).toBe(7);
    expect(host.querySelector('.fo-umrandung')).toBeNull();
    weg(abschnitt);
    expect(markiert()).toBe(0);

    // Untereintrag: nur seine Felder
    await klick(knopfMit(host, 'Angaben in Bauherrschaft'));
    const auswahl = [...gl().querySelectorAll('.fo-gl-einheit')].at(-1)!;
    zeigen(auswahl);
    expect([...host.querySelectorAll('.fo-papier .markiert input')].map((i) => i.getAttribute('data-feld'))).toEqual(['0:CheckBox2', '0:CheckBox4']);
    weg(auswahl);

    await klick(knopfMit(host, 'Gliederung anpassen'));
    vi.useFakeTimers();
    try {
      const zeile = gl().querySelector('.fo-gl-anpassen-zeile')!;
      zeigen(zeile);
      expect(markiert()).toBe(7);
      act(() => void vi.advanceTimersByTime(2900));
      expect(host.querySelector('.fo-umrandung')).toBeNull();
      act(() => void vi.advanceTimersByTime(200));
      expect(host.querySelector('.fo-umrandung')).not.toBeNull();
      weg(zeile);
      expect(host.querySelector('.fo-umrandung')).toBeNull();
      expect(markiert()).toBe(0);
      // wer vorher weggeht, sieht keine Umrandung
      zeigen(zeile);
      act(() => void vi.advanceTimersByTime(1500));
      weg(zeile);
      act(() => void vi.advanceTimersByTime(3000));
      expect(host.querySelector('.fo-umrandung')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Einstellungen', () => {
  it('Adressbuch aus allen FORMA-Projekten, Stammdaten als Vorgabe je Rolle', async () => {
    const host = await render();
    await klick(knopfMit(host, 'Einstellungen'));
    expect(host.querySelector('.es-nav')).not.toBeNull();
    await klick(knopf(host, 'Adressbuch'));
    await klick(knopf(host, 'Adressbuch einlesen'));
    await warte();
    const namen = [...host.querySelectorAll('.es-adress-eintrag strong')].map((s) => s.textContent);
    expect(namen).toEqual(['Beispiel', 'Kreis Soest', 'Mustermann']);
    // die Behörde aus beiden Projekten erscheint einmal, mit beiden Verwendungen
    await klick([...host.querySelectorAll<HTMLButtonElement>('.es-adress-eintrag')].find((b) => b.textContent?.includes('Kreis Soest'))!);
    expect([...host.querySelectorAll('.es-verwendungen li')].map((l) => l.textContent)).toEqual(['BS9 · Bauaufsichtsbehörde', 'H24 · Bauaufsichtsbehörde']);

    await klick(knopf(host, 'Büro & Stammdaten'));
    const auswahl = host.querySelector<HTMLSelectElement>('select[aria-label="Vorgabe für Bauaufsichtsbehörde"]')!;
    const kreis = [...auswahl.options].find((o) => o.textContent?.startsWith('Kreis Soest'))!;
    expect(kreis.textContent).toContain('(2×)');
    waehle(auswahl, kreis.value);
    await warte();
    expect(useFormulare.getState().rollenVorgaben['231']).toBe(kreis.value);
    expect(host.querySelector('.es-adresse')!.textContent).toContain('Hoher Weg 1');
  });
});

describe('Projektdatei (.oap) als Quelle der Projektstammdaten', () => {
  const OAP = `${ORDNER}/Planung/Berechnungen/BS9 Flächen.oap`;
  const projektdatei = () => {
    const p = createProject('EFH Musterstraße');
    p.meta = { ...leereMeta(), projektcode: 'BS9', vorhaben: 'Umbau Wohnhaus', grundstueck: { gemarkung: 'Musterhausen', flur: '3', flurstueck: '123' }, bauherr: { name: 'Mustermann', adresse: { strasse: '', plz: '', ort: '' }, kontakte: [] }, bearbeiter: 'TP' };
    return writeArchive(p);
  };
  const oeffnen = async () => {
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await warte();
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    await warte();
    return host;
  };

  it('abgleichen in beide Richtungen und beim Speichern der Projektkarte mitführen – nur meta ändert sich', async () => {
    ds.dateien.set(OAP, projektdatei());
    ds.dateien.set(`${ORDNER}/Planung/Berechnungen/Variante.oap`, projektdatei());
    const host = await oeffnen();
    const eintrag = knopf(host, 'Projektdatei (.oap)');
    expect(eintrag.textContent).toContain('BS9 Flächen.oap');
    await klick(eintrag);
    const zeilen = () => [...host.querySelectorAll('.pk-abgleich tbody tr')];
    expect(zeilen().map((z) => z.querySelector('td')!.firstChild!.textContent)).toEqual([
      'Bezeichnung der Baumaßnahme',
      'Gemarkung',
      'Flur',
      'Flurstück',
      'Bauherr: Name/Firma',
      'Bauherr: Vorname',
      'Bauherr: Straße/Nr.',
      'Bauherr: PLZ',
      'Bauherr: Ort',
    ]);
    // Name stimmt schon; Projektdatei → Projektkarte
    expect(zeilen()[4].classList.contains('gleich')).toBe(true);
    await klick(knopf(host, 'Abweichende übernehmen (4)'));
    expect(useFormulare.getState().karte!.aenderungen).toMatchObject({ '101:30': 'Umbau Wohnhaus', '301:40': 'Musterhausen', '301:50': '3', '301:60': '123' });
    // Projektkarte → Projektdatei: der Ort des Bauherrn
    await klick(knopf(host, 'Abweichende eintragen (1)'));
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.bauherr.adresse.ort).toBe('Musterstadt');

    // in der Projektkarte den Namen ändern und speichern: die Projektdatei wird mitgeführt
    act(() => useFormulare.getState().karteSetzen(201, 40, 'Musterfrau'));
    await warte();
    await klick(knopf(host, 'Projektkarte speichern'));
    await warte();
    const p = readProjectFile(ds.dateien.get(OAP)!);
    expect(p.meta).toMatchObject({ projektcode: 'BS9', vorhaben: 'Umbau Wohnhaus', bearbeiter: 'TP', bauherr: { name: 'Musterfrau', adresse: { ort: 'Musterstadt' } } });
    expect(p.name).toBe('EFH Musterstraße');
    expect(host.textContent).toContain('Projektdatei mitgeführt (1 Angabe(n))');
    // über den gemeinsamen Zugriff (packages/core): atomar, mit Sicherungskopie, nur wenn seitdem unverändert
    expect(ds.schreibvorgaenge.filter((w) => !w.startsWith('sperre'))).toEqual([
      'oap Planung/Berechnungen/BS9 Flächen.oap',
      'projektkarte BS9/sj_prokarte.sdb (5)',
      'oap Planung/Berechnungen/BS9 Flächen.oap',
    ]);
    expect(ds.papierkorb.has(`${OAP}.sicherung`)).toBe(true);
    // die andere Projektdatei bleibt unberührt; sie lässt sich je Projekt wählen
    expect(readProjectFile(ds.dateien.get(`${ORDNER}/Planung/Berechnungen/Variante.oap`)!).meta.bauherr.name).toBe('Mustermann');
    act(() => (host.querySelector<HTMLSelectElement>('select[aria-label="Projektdatei"]')!.value = 'Planung/Berechnungen/Variante.oap'));
    act(() => void host.querySelector<HTMLSelectElement>('select[aria-label="Projektdatei"]')!.dispatchEvent(new Event('change', { bubbles: true })));
    await warte();
    expect(useFormulare.getState().oap).toMatchObject({ pfad: 'Planung/Berechnungen/Variante.oap' });
    expect(useFormulare.getState().oapWahl).toEqual({ BS9: 'Planung/Berechnungen/Variante.oap' });
  });

  it('fehlt die Projektdatei, legt sie der Stammdaten-Dialog an – vorbelegt aus der Projektkarte, am gemeinsamen Ort', async () => {
    const host = await oeffnen();
    expect(knopf(host, 'Projektdatei (.oap)').textContent).toContain('nicht gefunden');
    act(() => useFormulare.getState().karteSetzen(201, 40, 'Neue Bauherrin'));
    await warte();
    await klick(knopf(host, 'Projektkarte speichern'));
    await warte();
    // gespeichert ist die Projektkarte; statt eines Fehlers fragt der Dialog die Stammdaten ab
    const dialog = document.querySelector('[role="dialog"][aria-label="Projektdatei für BS9 anlegen"]')!;
    expect(dialog).not.toBeNull();
    expect(useFormulare.getState().stammdatenDialog?.meta).toMatchObject({ projektcode: 'BS9', bauherr: { name: 'Neue Bauherrin' } });
    expect([...ds.dateien.keys()].some((k) => k.endsWith('.oap'))).toBe(false);
    await klick(knopf(dialog as HTMLElement, 'Projektdatei anlegen'));
    await warte();
    expect(document.querySelector('[role="dialog"][aria-label="Projektdatei für BS9 anlegen"]')).toBeNull();
    expect(ds.schreibvorgaenge).toContain('neu Planung/Berechnungen/BS9.oap');
    const p = readProjectFile(ds.dateien.get(`${ORDNER}/Planung/Berechnungen/BS9.oap`)!);
    expect(p.meta).toMatchObject({ projektcode: 'BS9', bauherr: { name: 'Neue Bauherrin' } });
    expect(knopf(host, 'Projektdatei (.oap)').textContent).toContain('BS9.oap');
    // der Ort neuer Projektdateien gilt für alle Apps
    expect(JSON.parse(localStorage.getItem('arch-tools:konfig:allgemein')!)).toMatchObject({ projekte: ['Z:/Projekte'], oapPfad: 'Planung/Berechnungen/{Kürzel}.oap' });
  });

  it('eine alte Projektdaten.xlsx wird nur gelesen – ihre Angaben lassen sich in die Projektkarte übernehmen', async () => {
    ds.dateien.set(PD, await projektdaten());
    ds.dateien.set(OAP, projektdatei());
    const vorher = ds.dateien.get(PD);
    const host = await oeffnen();
    await klick(knopf(host, 'Projektdatei (.oap)'));
    const alt = host.querySelector('.pk-alt')!;
    expect(alt.textContent).toContain('Projektdaten.xlsx (bisher)');
    await klick(knopf(alt as HTMLElement, 'In die Projektkarte übernehmen (4)'));
    expect(useFormulare.getState().karte!.aenderungen).toMatchObject({ '101:30': 'Umbau Wohnhaus', '301:40': 'Musterhausen' });
    expect(ds.dateien.get(PD)).toBe(vorher);
  });
});
