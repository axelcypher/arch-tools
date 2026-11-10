// @vitest-environment happy-dom
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

describe('Formular einrichten', () => {
  const gl = (host: Element) => host.querySelector('nav[aria-label="Inhalt des Formulars"]')!;
  const panel = (host: Element) => host.querySelector<HTMLElement>('aside[aria-label="Einstellungen der Auswahl"]')!;
  const einrichten = (host: Element) => [...host.querySelectorAll<HTMLButtonElement>('.toolbar button')].find((b) => b.textContent?.includes('Einrichten'))!;
  const imFormular = (host: Element, s: string) => host.querySelector<HTMLButtonElement>(`.fo-ein-feld[data-ein="${s}"]`)!;
  const imBaum = (host: Element, id: string) => host.querySelector<HTMLButtonElement>(`.fo-ein-baum [data-auswahl="${id}"]`)!;
  const strgKlick = async (el: Element) => {
    act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })));
    await warte();
  };
  const oeffnen = async () => {
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(knopf(host, '001-Muster'));
    return host;
  };

  it('Abschnitt umbenennen und ausblenden, ein Feld im Formular anklicken und vom Füllstand ausnehmen – gilt in allen Projekten', async () => {
    const host = await oeffnen();
    const abschnitte = () => [...gl(host).querySelectorAll('.fo-gl-abschnitt')].map((b) => b.querySelector('.fo-gl-titel')!.textContent);
    const vorher = abschnitte();
    expect(vorher[0]).toBe('Bauherrschaft');

    await klick(einrichten(host));
    // links der Baum, rechts die Einstellungen, im Formular Flächen zum Anklicken
    expect(gl(host).querySelector('.fo-ein-baum')).not.toBeNull();
    expect(panel(host).textContent).toContain('Feld im Formular anklicken');
    await klick(imBaum(host, 'a:0:Panel1'));
    const titel = panel(host).querySelector<HTMLInputElement>('input[aria-label="Titel für Abschnitt Bauherrschaft"]')!;
    eingabe(titel, 'Bauherr und Grundstück');
    verlassen(titel);
    await warte();
    await klick(imFormular(host, '0:Memo1'));
    expect(panel(host).textContent).toContain('in FORMA „Memo1“');
    await klick(panel(host).querySelector<HTMLInputElement>('input[aria-label="Zählt für den Füllstand"]')!);
    const zweite = host.querySelectorAll<HTMLButtonElement>('.fo-ein-baum .fo-ein-titel')[1];
    if (zweite) {
      await klick(zweite);
      await klick(panel(host).querySelector<HTMLInputElement>('input[role="switch"]')!);
    }
    await klick(knopf(panel(host), 'Fertig'));
    expect(host.querySelector('.fo-ein-feld')).toBeNull();

    expect(abschnitte()[0]).toBe('Bauherr und Grundstück');
    if (zweite) expect(abschnitte()).toHaveLength(vorher.length - 1);
    expect(Object.keys(useFormulare.getState().profile)).toEqual(['nw019999|2026A']);
    expect(Object.values(useFormulare.getState().profile['nw019999|2026A'].zaehlt)).toEqual([false]);

    // im anderen Projekt gilt dasselbe Profil
    await klick(knopfMit(host, 'Projekt schließen'));
    await projektOeffnen(host, 'H24');
    await klick(knopf(host, '001-Muster'));
    expect(abschnitte()[0]).toBe('Bauherr und Grundstück');
  });

  it('mehrere Felder im Formular wählen (Strg) und als eine Angabe zählen, umbenennen, Regel ändern, auflösen', async () => {
    const host = await oeffnen();
    const zahl = () => gl(host).querySelector('.fo-gl-zahl')!.textContent;
    const zahlImBaum = () => gl(host).querySelector('.fo-ein-zahl')!.textContent;
    // Muster: drei Textfelder (zwei gefüllt), zwei Zeilen mit Kästchen (eine angekreuzt)
    expect(zahl()).toBe('3/5');

    await klick(einrichten(host));
    await klick(imFormular(host, '0:CheckBox1'));
    for (const s of ['0:CheckBox3', '0:CheckBox2', '0:CheckBox4']) await strgKlick(imFormular(host, s));
    expect(panel(host).textContent).toContain('4 Felder');
    expect(['0:CheckBox1', '0:CheckBox3', '0:CheckBox2', '0:CheckBox4'].every((s) => imFormular(host, s).classList.contains('gewaehlt'))).toBe(true);
    await klick(knopf(panel(host), 'Gruppe bilden'));
    // der Füllstand im Baum ändert sich sofort mit; die neue Gruppe ist gewählt
    expect(zahlImBaum()).toBe('3/4');
    const gruppenName = panel(host).querySelector<HTMLInputElement>('input[aria-label="Name der Gruppe"]')!;
    eingabe(gruppenName, 'Gebäudeart');
    verlassen(gruppenName);
    await warte();
    await klick(imFormular(host, '0:Memo1'));
    const feldName = panel(host).querySelector<HTMLInputElement>('input[aria-label="Feldtitel für Bauherrschaft"]')!;
    eingabe(feldName, 'Name');
    verlassen(feldName);
    await warte();
    await klick(knopf(panel(host), 'Fertig'));

    expect(zahl()).toBe('3/4');
    await klick(knopfMit(host, 'Angaben in Bauherrschaft'));
    const unter = [...gl(host).querySelectorAll('.fo-gl-einheit')];
    expect(unter.map((u) => u.querySelector('.fo-gl-titel')!.textContent)).toEqual(['Name', 'Bauherrschaft', 'Bauherrschaft', 'Gebäudeart']);
    expect(unter.map((u) => u.querySelector('.fo-gl-status')!.classList.contains('voll'))).toEqual([true, false, true, true]);
    // eigener Name auch als Hinweis am Feld im Formular
    expect(host.querySelector<HTMLElement>('.fo-papier [data-feld="0:Memo1"]')!.title).toBe('Name');
    const profil = useFormulare.getState().profile['nw019999|2026A'];
    expect(profil.feldTitel).toEqual({ '0:Memo1': 'Name' });
    expect(profil.gruppen).toEqual([{ id: 'g1', titel: 'Gebäudeart', regel: 'eins', felder: ['0:CheckBox1', '0:CheckBox3', '0:CheckBox2', '0:CheckBox4'] }]);

    // über ein Feld der Gruppe zur Gruppe; Regel „alle nötig“: zwei der vier Kästchen sind nicht angekreuzt
    await klick(einrichten(host));
    await klick(imFormular(host, '0:CheckBox3'));
    expect(panel(host).textContent).toContain('Zählt über die Gruppe');
    await klick(knopf(panel(host), '„Gebäudeart“'));
    const alle = [...panel(host).querySelectorAll<HTMLLabelElement>('.fo-ein-regel')].find((l) => l.textContent?.includes('alle nötig'))!;
    await klick(alle.querySelector('input')!);
    expect(zahlImBaum()).toBe('2/4');
    // auflösen: wieder einzeln gezählt
    await klick(knopf(panel(host), 'Gruppe auflösen'));
    expect(zahlImBaum()).toBe('3/5');
    expect(useFormulare.getState().profile['nw019999|2026A'].gruppen).toBeUndefined();
  });

  it('Gruppen verschachteln: Untergruppe aus Feldern einer Gruppe, „Teil von“, zwei Gruppen im Baum gruppieren und wieder auflösen', async () => {
    const host = await oeffnen();
    const gruppen = () => useFormulare.getState().profile['nw019999|2026A']?.gruppen;
    await klick(einrichten(host));
    // eine Gruppe aus den vier Kästchen
    await klick(imFormular(host, '0:CheckBox1'));
    for (const s of ['0:CheckBox3', '0:CheckBox2', '0:CheckBox4']) await strgKlick(imFormular(host, s));
    await klick(knopf(panel(host), 'Gruppe bilden'));
    // zwei davon als Untergruppe „alle nötig“ – sie hängt in der ersten
    await klick(imFormular(host, '0:CheckBox1'));
    await strgKlick(imFormular(host, '0:CheckBox3'));
    waehle(panel(host).querySelector<HTMLSelectElement>('select[aria-label="Wann die neue Gruppe ausgefüllt ist"]')!, 'alle');
    await klick(knopf(panel(host), 'Gruppe bilden'));
    expect(gruppen()).toEqual([
      { id: 'g1', regel: 'eins', felder: ['0:CheckBox2', '0:CheckBox4'] },
      { id: 'g2', regel: 'alle', felder: ['0:CheckBox1', '0:CheckBox3'], in: 'g1' },
    ]);
    expect(panel(host).querySelector<HTMLSelectElement>('select[aria-label="Übergeordnete Gruppe"]')!.value).toBe('g1');
    // im Baum: die Untergruppe eingerückt unter der oberen; im Formular sind beim Wählen der oberen alle vier umrandet
    expect([...host.querySelectorAll('.fo-ein-baum .fo-ein-zeile.gruppe')].map((z) => z.getAttribute('data-auswahl'))).toEqual(['g:g1', 'g:g2']);
    expect(imBaum(host, 'g:g2').style.paddingLeft).toBe('38px');
    await klick(imBaum(host, 'g:g1'));
    expect(['0:CheckBox1', '0:CheckBox2', '0:CheckBox3', '0:CheckBox4'].every((s) => imFormular(host, s).classList.contains('gewaehlt'))).toBe(true);
    expect(panel(host).textContent).toContain('Untergruppen');
    // Füllstand: die Untergruppe (beide angekreuzt) genügt der oberen („eine genügt“)
    expect(gl(host).querySelector('.fo-ein-zahl')!.textContent).toBe('3/4');

    // „Teil von“: die Untergruppe wird eigenständig
    await klick(imBaum(host, 'g:g2'));
    waehle(panel(host).querySelector<HTMLSelectElement>('select[aria-label="Übergeordnete Gruppe"]')!, '');
    expect(gruppen()!.find((g) => g.id === 'g2')!.in).toBeUndefined();
    // beide Gruppen im Baum (Strg) zu einer neuen übergeordneten zusammenfassen
    await klick(imBaum(host, 'g:g1'));
    await strgKlick(imBaum(host, 'g:g2'));
    expect(panel(host).textContent).toContain('2 Gruppen');
    await klick(knopf(panel(host), 'Gruppe bilden'));
    expect(gruppen()!.map((g) => [g.id, g.in ?? null, g.felder.length])).toEqual([
      ['g1', 'g3', 2],
      ['g2', 'g3', 2],
      ['g3', null, 0],
    ]);
    // auflösen: die beiden kommen wieder nach oben
    await klick(knopf(panel(host), 'Gruppe auflösen'));
    expect(gruppen()!.map((g) => [g.id, g.in ?? null])).toEqual([
      ['g1', null],
      ['g2', null],
    ]);
  });

  it('Zeigen hebt Felder hervor; im Einrichten-Modus sind gewählte Felder und Abschnitte im Formular umrandet und im Baum markiert', async () => {
    const host = await oeffnen();
    const markiert = () => host.querySelectorAll('.fo-papier .markiert').length;
    const zeigen = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    const weg = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));

    const abschnitt = gl(host).querySelector('.fo-gl-abschnitt')!;
    zeigen(abschnitt);
    expect(markiert()).toBe(7);
    weg(abschnitt);
    expect(markiert()).toBe(0);
    // Untereintrag: nur seine Felder
    await klick(knopfMit(host, 'Angaben in Bauherrschaft'));
    const auswahl = [...gl(host).querySelectorAll('.fo-gl-einheit')].at(-1)!;
    zeigen(auswahl);
    expect([...host.querySelectorAll('.fo-papier .markiert input')].map((i) => i.getAttribute('data-feld'))).toEqual(['0:CheckBox2', '0:CheckBox4']);
    weg(auswahl);

    await klick(einrichten(host));
    const ab = imBaum(host, 'a:0:Panel1');
    zeigen(ab);
    expect(markiert()).toBe(7);
    weg(ab);
    await klick(ab);
    expect(host.querySelector('.fo-ein-rahmen')).not.toBeNull();
    // ein Feld im Formular: gewählt, im Baum markiert (sein Abschnitt klappt auf), der Abschnittsrahmen ist weg
    await klick(imFormular(host, '0:CheckBox2'));
    expect(imFormular(host, '0:CheckBox2').classList.contains('gewaehlt')).toBe(true);
    expect(imBaum(host, 'f:0:CheckBox2').getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('.fo-ein-rahmen')).toBeNull();
    // im Einrichten-Modus wird nichts eingetippt: die Fläche liegt über dem Feld
    expect(useFormulare.getState().offen!.aenderungen).toEqual({});
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
