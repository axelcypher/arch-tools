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
import { useAntrag } from './antragStore';
import { useFormulare } from './store';
import { VORGABE_NAMENSSCHEMA } from '@core/namensschema';

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
    ['H24', 'Hofstraße 24', karte('Beispiel', 'Kreis Soest')],
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
    adressbuchKarten: null,
    eigeneAdressen: [],
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
  // ein offenes Menü (gemeinsamer Store in core) schließen – sonst stünde es im nächsten Test wieder da
  act(() => void window.dispatchEvent(new Event('blur')));
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const warte = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const knopf = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const knopfGenau = (host: Element, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const knoepfe = (host: Element, text: string) => [...host.querySelectorAll('button')].filter((b) => b.textContent?.includes(text));
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

/** Dialog nach seinem zugänglichen Namen (aria-label bzw. sichtbarer Kopf über aria-labelledby) */
const dialogMit = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => (d.getAttribute('aria-label') ?? document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent) === name) ?? null;
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

  it('Baum einklappbar (knappe Breite): × im Kopf blendet ihn aus, „Gliederung“ in der Werkzeugleiste zeigt ihn wieder', async () => {
    const host = await oeffnen();
    await klick(einrichten(host));
    expect(gl(host).querySelector('.fo-ein-baum')).not.toBeNull();
    await klick(knopfMit(gl(host), 'Aufbau ausblenden'));
    expect(host.querySelector('nav[aria-label="Inhalt des Formulars"]')).toBeNull();
    expect(panel(host)).not.toBeNull();
    const gliederung = [...host.querySelectorAll<HTMLButtonElement>('.toolbar button')].find((b) => b.textContent?.includes('Gliederung'))!;
    expect(gliederung.getAttribute('aria-pressed')).toBe('false');
    await klick(gliederung);
    expect(gliederung.getAttribute('aria-pressed')).toBe('true');
    expect(gl(host).querySelector('.fo-ein-baum')).not.toBeNull();
    // die Gliederung außerhalb des Einrichtens bleibt unberührt; beim nächsten Einrichten ist der Baum wieder offen
    await klick(knopfMit(gl(host), 'Aufbau ausblenden'));
    await klick(einrichten(host));
    expect(useFormulare.getState().gliederungOffen).toBe(true);
    expect(gl(host).querySelector('.fo-gl-abschnitt')).not.toBeNull();
    await klick(einrichten(host));
    expect(gl(host).querySelector('.fo-ein-baum')).not.toBeNull();
  });

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
    expect(panel(host).textContent).toContain('Feldname „Memo1“');
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
    expect(host.querySelector<HTMLElement>('.fo-papier [data-feld="0:Memo1"]')!.title).toBe('Name – Wert aus der Projektkarte');
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
  it('Adressbuch aus allen Projektkarten, Stammdaten als Vorgabe je Rolle', async () => {
    const host = await render();
    await klick(knopfMit(host, 'Einstellungen …'));
    expect(host.querySelector('.es-nav')).not.toBeNull();
    await klick(knopf(host, 'Adressbuch'));
    await klick(knopf(host, 'Aus den Projektdaten einlesen'));
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

  it('leeres Adressbuch: „Adresse hinzufügen“ öffnet das Formular für eine neue Adresse; unter „Büro & Stammdaten“ führt der Knopf ins Adressbuch', async () => {
    const host = await render();
    await klick(knopfMit(host, 'Einstellungen …'));
    await klick(knopf(host, 'Büro & Stammdaten'));
    expect(knopf(host, 'Adresse hinzufügen')).toBeUndefined();
    await klick(knopf(host, 'Zum Adressbuch'));
    // die Leerseite trägt die Knöpfe – jeder nur einmal (nicht zusätzlich in der Titelzeile)
    expect(knoepfe(host, 'Adresse hinzufügen')).toHaveLength(1);
    expect(knoepfe(host, 'Aus den Projektdaten einlesen')).toHaveLength(1);
    await klick(knopf(host, 'Adresse hinzufügen'));
    expect(host.querySelector('form[aria-label="Neue Adresse"]')).not.toBeNull();
    // mit dem Formular verschwindet die Leerseite, die Titelzeile zeigt ihre Knöpfe – noch nie eingelesen, also nicht „Neu einlesen“
    expect(knoepfe(host, 'Adresse hinzufügen')).toHaveLength(1);
    expect(knoepfe(host, 'Aus den Projektdaten einlesen')).toHaveLength(1);
    expect(knoepfe(host, 'Neu einlesen')).toHaveLength(0);
  });

  it('Adressbuch bearbeiten: neue Adresse anlegen, eine aus den Projektkarten ändern und ausblenden – gespeichert im Konfigurationsordner', async () => {
    const host = await render();
    await klick(knopfMit(host, 'Einstellungen …'));
    await klick(knopf(host, 'Adressbuch'));
    await klick(knopf(host, 'Aus den Projektdaten einlesen'));
    await warte();
    const namen = () => [...host.querySelectorAll('.es-adress-eintrag strong')].map((s) => s.textContent);
    const eintrag = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('.es-adress-eintrag')].find((b) => b.textContent?.includes(name))!;
    const formFeld = (titel: string) => host.querySelector<HTMLInputElement>(`.es-adress-form input[aria-label="${titel}"]`)!;

    // neu anlegen – ohne Projektkarte
    await klick(knopf(host, 'Adresse hinzufügen'));
    eingabe(formFeld('Name/Firma'), 'Statik Nord GmbH');
    eingabe(formFeld('Ort'), 'Lippstadt');
    await klick(knopf(host.querySelector('.es-adress-form')!, 'Speichern'));
    expect(namen()).toEqual(['Beispiel', 'Kreis Soest', 'Mustermann', 'Statik Nord GmbHeigene']);
    expect(useFormulare.getState().eigeneAdressen).toMatchObject([{ texte: { '40': 'Statik Nord GmbH', '110': 'Lippstadt' } }]);
    expect(useFormulare.getState().eigeneAdressen[0].schluessel).toMatch(/^e:/);

    // eine Adresse aus den Projektkarten ändern: eigene Fassung, Verwendungen bleiben
    await klick(eintrag('Kreis Soest'));
    await klick(knopf(host.querySelector('.es-adress-detail')!, 'Bearbeiten'));
    eingabe(formFeld('Straße/Nr.'), 'Hoher Weg 3');
    await klick(knopf(host.querySelector('.es-adress-form')!, 'Speichern'));
    expect(eintrag('Kreis Soest').textContent).toContain('geändert');
    expect(host.querySelector('.es-adress-detail')!.textContent).toContain('Hoher Weg 3');
    expect([...host.querySelectorAll('.es-verwendungen li')].map((l) => l.textContent)).toEqual(['BS9 · Bauaufsichtsbehörde', 'H24 · Bauaufsichtsbehörde']);
    const kreis = useFormulare.getState().adressbuch!.adressen.find((a) => a.texte['40'] === 'Kreis Soest')!;
    expect(kreis.werte['70']).toBe('Hoher Weg 3');

    // ausblenden und wieder einblenden
    await klick(knopf(host.querySelector('.es-adress-detail')!, 'Ausblenden'));
    await klick(knopfGenau(document.body, 'Ausblenden'));
    expect(namen().some((n) => n?.startsWith('Kreis Soest'))).toBe(false);
    expect(host.textContent).toContain('Ausgeblendet (1)');
    await klick(knopf(host, 'Einblenden'));
    expect(namen().some((n) => n?.startsWith('Kreis Soest'))).toBe(true);

    // gespeichert im Bereich „formulare“ der gemeinsamen Einstellungen (ohne Konfigurationsordner: lokal)
    const roh = Object.entries(localStorage).find(([k]) => k.includes('formulare') && k.includes('konfig'));
    expect(JSON.stringify(roh ?? useFormulare.getState().eigeneAdressen)).toContain('Statik Nord GmbH');
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
      // Ergänzung der App: in FORMA ohne Eintrag, kommt hier aus der Projektdatei
      'Grundstück: PLZ',
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
    expect(zeilen()[5].classList.contains('gleich')).toBe(true);
    expect(zeilen()[1].classList.contains('gleich')).toBe(true);
    await klick(knopf(host, 'Abweichende übernehmen (4)'));
    expect(useFormulare.getState().karte!.aenderungen).toMatchObject({ '101:30': 'Umbau Wohnhaus', '301:40': 'Musterhausen', '301:50': '3', '301:60': '123' });
    // Projektkarte → Projektdatei: der Ort des Bauherrn
    await klick(knopf(host, 'Abweichende eintragen (1)'));
    expect(readProjectFile(ds.dateien.get(OAP)!).meta.bauherr.adresse.ort).toBe('Musterstadt');

    // in der Projektkarte den Namen ändern und speichern: die Projektdatei wird mitgeführt
    act(() => useFormulare.getState().karteSetzen(201, 40, 'Musterfrau'));
    await warte();
    await klick(knopf(host, 'Projektdaten speichern'));
    await warte();
    const p = readProjectFile(ds.dateien.get(OAP)!);
    expect(p.meta).toMatchObject({ projektcode: 'BS9', vorhaben: 'Umbau Wohnhaus', bearbeiter: 'TP', bauherr: { name: 'Musterfrau', adresse: { ort: 'Musterstadt' } } });
    expect(p.name).toBe('EFH Musterstraße');
    expect(host.textContent).toContain('Projektdatei mitgeführt (1 Angabe)');
    // über den gemeinsamen Zugriff (packages/core): atomar, mit Sicherungskopie, nur wenn seitdem unverändert
    expect(ds.schreibvorgaenge.filter((w) => !w.startsWith('sperre'))).toEqual([
      // beim ersten Öffnen: der Antrag entsteht (Abschnitt „formulare“)
      'oap Planung/Berechnungen/BS9 Flächen.oap',
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
    await klick(knopf(host, 'Projektdaten speichern'));
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
    // wie in ATLAS (Projektordner): eine Kopie des Namensschemas des Büros (hier: die Vorgabe)
    expect(p.namensschema).toEqual(VORGABE_NAMENSSCHEMA);
    expect(knopf(host, 'Projektdatei (.oap)').textContent).toContain('BS9.oap');
    // der Ort neuer Projektdateien gilt für alle Apps
    expect(JSON.parse(localStorage.getItem('arch-tools:konfig:allgemein')!)).toMatchObject({ projekte: ['Z:/Projekte'], oapPfad: 'Planung/Berechnungen/{Kürzel}.oap' });
  });

  it('Ort neuer Projektdateien mit {Datum} und {Vorhaben} – Einstellungen zeigen Beispiel und unbekannte Platzhalter', async () => {
    const d = new Date();
    const heute = [d.getFullYear() % 100, d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, '0')).join('');
    useFormulare.setState({ oapVorlage: 'Organisation/{Kürzel} {Datum} {Vorhaben}.oap' });
    const host = await oeffnen();
    act(() => useFormulare.getState().karteSetzen(101, 30, 'Neubau EFH'));
    await warte();
    await klick(knopf(host, 'Projektdaten speichern'));
    await warte();
    const dialog = document.querySelector('[role="dialog"][aria-label="Projektdatei für BS9 anlegen"]') as HTMLElement;
    expect(useFormulare.getState().stammdatenDialog?.meta.vorhaben).toBe('Neubau EFH');
    await klick(knopf(dialog, 'Projektdatei anlegen'));
    await warte();
    expect(ds.schreibvorgaenge).toContain(`neu Organisation/BS9 ${heute} Neubau EFH.oap`);

    // Einstellungen › Projektdatei: Platzhalter einfügen, Beispiel, Warnung
    act(() => useFormulare.getState().einstellungenOeffnen('projektdaten'));
    await warte();
    const beispiel = () => document.querySelector('[aria-label="Beispiel für den Pfad"]')!.textContent;
    expect(beispiel()).toBe(`Beispiel: Organisation/BS9 ${heute} Neubau Einfamilienhaus.oap`);
    act(() => useFormulare.getState().setOapVorlage('Organisation/{Kürzel} {Bauherr}.oap'));
    await warte();
    expect(document.querySelector('.feld-meldung')!.textContent).toContain('{Bauherr}');
    await klick(knopf(document.body, '{PROJEKT_KURZNAME}'));
    expect(useFormulare.getState().oapVorlage).toBe('Organisation/{Kürzel} {Bauherr} {PROJEKT_KURZNAME}.oap');
    expect(beispiel()).toBe('Beispiel: Organisation/BS9 {Bauherr} EFH Musterweg.oap');
    // alte Namen: Hinweis mit „Vorlage anpassen“, erst der Klick stellt um
    expect(document.querySelector('.ph-veraltet')!.textContent).toContain('{Kürzel} → {PROJEKT_KUERZEL}');
    await klick(knopf(document.querySelector('.ph-veraltet') as HTMLElement, 'Auf neue Namen umstellen'));
    expect(useFormulare.getState().oapVorlage).toBe('Organisation/{PROJEKT_KUERZEL} {Bauherr} {PROJEKT_KURZNAME}.oap');
    expect(beispiel()).toBe('Beispiel: Organisation/BS9 {Bauherr} EFH Musterweg.oap');
  });

  it('eine alte Projektdaten.xlsx wird nur gelesen – ihre Angaben lassen sich in die Projektkarte übernehmen', async () => {
    ds.dateien.set(PD, await projektdaten());
    ds.dateien.set(OAP, projektdatei());
    const vorher = ds.dateien.get(PD);
    const host = await oeffnen();
    await klick(knopf(host, 'Projektdatei (.oap)'));
    const alt = host.querySelector('.pk-alt')!;
    expect(alt.textContent).toContain('Projektdaten.xlsx (bisher)');
    await klick(knopf(alt as HTMLElement, 'In die Projektdaten übernehmen (4)'));
    expect(useFormulare.getState().karte!.aenderungen).toMatchObject({ '101:30': 'Umbau Wohnhaus', '301:40': 'Musterhausen' });
    expect(ds.dateien.get(PD)).toBe(vorher);
  });
});

describe('Autofill mit Zustand (Auto-Wert und manuelle Überschreibung)', () => {
  const OAP = `${ORDNER}/Planung/Berechnungen/BS9 Flächen.oap`;
  const FORMULAR = 'C:/FORMA/BS9/001-Muster.frmsjf';
  const memo1 = (host: Element) => host.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-feld="0:Memo1"]')!;
  const tippen = (el: HTMLInputElement | HTMLTextAreaElement, value: string) =>
    act(() => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  /** Autofill-Zustände des aktiven Antrags in der Projektdatei */
  const felderImAntrag = () =>
    (readProjectFile(ds.dateien.get(OAP)!).formulare as { antraege?: Record<string, { felder?: Record<string, unknown> }> } | undefined)?.antraege?.[useAntrag.getState().projektdatei!.ansicht!]?.felder;
  const zustand = () => felderImAntrag()?.['001-Muster.frmsjf'];
  const speichern = () => act(() => useFormulare.getState().speichern());
  const karteAendern = async (name: string) => {
    act(() => useFormulare.getState().karteSetzen(231, 40, name));
    await act(() => useFormulare.getState().karteSpeichern());
    await warte();
    await warte();
  };
  const dialog = (_host: Element) => dialogMit('Daten aktualisieren');
  const rueckfrage = () => dialogMit('Projektdaten geändert – Unterlagen aktualisieren?');

  it('übernehmen, leeren → Auto-Wert, Leerzeichen, Überschreibung fixiert, ignorieren, Rückfrage nach geänderten Projektdaten', async () => {
    const p = createProject('EFH');
    p.meta = { ...leereMeta(), projektcode: 'BS9' };
    ds.dateien.set(OAP, writeArchive(p));
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await warte();
    await klick(knopf(host, '001-Muster'));
    await warte();
    expect(memo1(host).value).toBe('Mustermann, Max');

    // Daten aktualisieren: anderer Inhalt ohne Zustand – nur auf Wunsch
    await klick(knopf(host, 'Daten aktualisieren'));
    const zeile = dialog(host)!.querySelector<HTMLElement>('.fo-ausfuellen-zeile')!;
    expect(zeile.textContent).toContain('anderer Inhalt (Herkunft unbekannt)');
    expect(zeile.textContent).toContain('Kreis Soest, Hoher Weg 1');
    expect(zeile.querySelector('input')!.checked).toBe(false);
    await klick(zeile.querySelector('input')!);
    await klick(knopf(dialog(host)!, '1 Feld übernehmen'));
    expect(memo1(host).value).toBe('Kreis Soest, Hoher Weg 1');
    await speichern();
    expect(zustand()).toEqual({ felder: { '0:Memo1': { auto: 'Kreis Soest, Hoher Weg 1' } } });

    // geleert → wieder der Auto-Wert; ein Leerzeichen bleibt (erzwungen leer)
    tippen(memo1(host), '');
    verlassen(memo1(host));
    expect(memo1(host).value).toBe('Kreis Soest, Hoher Weg 1');
    tippen(memo1(host), ' ');
    verlassen(memo1(host));
    expect(memo1(host).value).toBe(' ');

    // eigener Text ersetzt den Auto-Text: beim Speichern fixiert
    tippen(memo1(host), 'Bauaufsicht Soest');
    verlassen(memo1(host));
    await speichern();
    expect(zustand()).toEqual({ felder: { '0:Memo1': { auto: 'Kreis Soest, Hoher Weg 1', manuell: 'Bauaufsicht Soest' } } });
    expect(memo1(host).title).toContain('von Hand überschrieben');

    // Projektdaten geändert: die Überschreibung bleibt – nichts zu fragen
    await karteAendern('Kreis Unna');
    expect(rueckfrage()).toBeNull();
    expect(memo1(host).value).toBe('Bauaufsicht Soest');

    // Haken „Manuelle Überschreibungen ignorieren“ im Menü des Formulars: Auto-Wert; wieder weg: die Überschreibung
    const menue = () => host.querySelector<HTMLButtonElement>('.fo-menue-knopf')!;
    await klick(menue());
    // Umschalter: Kästchen im Menü, aus
    const schalter = () => knopf(document.body, 'Manuelle Überschreibungen ignorieren');
    expect(schalter().getAttribute('role')).toBe('menuitemcheckbox');
    expect(schalter().getAttribute('aria-checked')).toBe('false');
    await klick(schalter());
    expect(memo1(host).value).toBe('Kreis Unna, Hoher Weg 1');
    expect(zustand()).toMatchObject({ ignorieren: true });
    await klick(menue());
    expect(schalter().getAttribute('aria-checked')).toBe('true');
    await klick(schalter());
    expect(memo1(host).value).toBe('Bauaufsicht Soest');

    // zurück zum Auto-Wert (leeren), speichern, schließen – dann aktualisiert die Rückfrage auch die Datei
    tippen(memo1(host), '');
    verlassen(memo1(host));
    expect(memo1(host).value).toBe('Kreis Unna, Hoher Weg 1');
    await speichern();
    expect(zustand()).toEqual({ felder: { '0:Memo1': { auto: 'Kreis Unna, Hoher Weg 1' } } });
    await act(() => useFormulare.getState().schliessen());
    await karteAendern('Kreis Hamm');
    expect(rueckfrage()!.textContent).toContain('001-Muster');
    expect(rueckfrage()!.textContent).toContain('1 Feld aktualisieren');
    await klick(knopf(rueckfrage()!, 'Unterlagen aktualisieren'));
    await warte();
    expect(rueckfrage()).toBeNull();
    const { parseFormular } = await import('./forma/formular');
    const { felderDerSeite } = await import('./forma/felder');
    const f = parseFormular(ds.dateien.get(FORMULAR)!);
    expect(felderDerSeite(f.seiten[0], 0).find((x) => x.name === 'Memo1')!.original).toBe('Kreis Hamm, Hoher Weg 1');
    expect(zustand()).toEqual({ felder: { '0:Memo1': { auto: 'Kreis Hamm, Hoher Weg 1' } } });
  });

  it('ein neues Formular wird gleich mit den Angaben aus den Projektdaten befüllt', async () => {
    const p = createProject('EFH');
    p.meta = { ...leereMeta(), projektcode: 'BS9' };
    ds.dateien.set(OAP, writeArchive(p));
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await warte();
    const { useAntrag } = await import('./antragStore');
    await act(() => useAntrag.getState().formularHinzufuegen({ root: 'C:/FORMA', pfad: 'H24/001-Muster.frmsjf', datei: '001-Muster.frmsjf', name: 'Muster', herkunft: 'Projekt H24', geaendert: 0 }, false));
    await warte();
    const { parseFormular } = await import('./forma/formular');
    const { felderDerSeite } = await import('./forma/felder');
    const neu = felderDerSeite(parseFormular(ds.dateien.get('C:/FORMA/BS9/002-Muster.frmsjf')!).seiten[0], 0);
    expect(neu.find((x) => x.name === 'Memo1')!.original).toBe('Kreis Soest, Hoher Weg 1');
    // Felder ohne Angabe in der Projektkarte bleiben leer
    expect(neu.find((x) => x.name === 'Memo3')!.original).toBe('');
    expect(felderImAntrag()!['002-Muster.frmsjf']).toEqual({ felder: { '0:Memo1': { auto: 'Kreis Soest, Hoher Weg 1' } } });
    expect(useFormulare.getState().meldung?.text).toContain('mit 1 Angabe aus den Projektdaten befüllt');
  });
});
