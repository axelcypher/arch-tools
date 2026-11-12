// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { SpeicherDateisystem } from './dateisystem';
import { cp1252Lesen, cp1252Schreiben } from './forma/cp1252';
import type { Projektkarte } from './forma/projektkarte';
import { sperreVermerken } from './eigeneSperren';
import { kartenVerknuepfbar, mitAenderungen, useFormulare } from './store';
import { einstiegsAktionen, farbschemaWechseln } from '@core/ui/rauchtest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MUSTER = new Uint8Array(readFileSync(path.resolve(__dirname, '__fixtures__/muster.frmsjf')));
const FORMULAR = 'C:/FORMA/BS9/001-Muster.frmsjf';
const SPERRE = 'C:/FORMA/BS9/001-Muster.frmtmp';
const KARTE = 'C:/FORMA/BS9/sj_prokarte.sdb';

const ANREDE = '\r\nSehr geehrte Frau\r\nSehr geehrter Herr\r\nSehr geehrte Damen und Herren,';
const adresse = (gruppe: number, werte: Record<number, string>, anrede: number | null = null) => [
  { gruppe, id: 30, typ: 1, titel: 'Vorname:', text: werte[30] ?? '', zahl: null },
  { gruppe, id: 40, typ: 1, titel: 'Name/Firma:', text: werte[40] ?? '', zahl: null },
  { gruppe, id: 70, typ: 1, titel: 'Straße/Nr.:', text: werte[70] ?? '', zahl: null },
  { gruppe, id: 90, typ: 1, titel: 'PLZ Straße:', text: werte[90] ?? '', zahl: null },
  { gruppe, id: 110, typ: 1, titel: 'Ort:', text: werte[110] ?? '', zahl: null },
  { gruppe, id: 210, typ: 4, titel: 'Anrede:', text: ANREDE, zahl: anrede },
];
const projektkarte = (): Projektkarte => ({
  gruppen: [
    { id: 101, typ: 4, text: 'Projektdaten' },
    { id: 201, typ: 1, text: 'Bauherr' },
    { id: 205, typ: 1, text: 'Eigentümer des Baugrundstücks' },
    { id: 232, typ: 1, text: 'Gemeinde' },
  ],
  eintraege: [
    { gruppe: 101, id: 30, typ: 2, titel: 'Bezeichnung der Baumaßnahme:', text: 'Neubau\r\nEinfamilienhaus', zahl: null },
    { gruppe: 101, id: 60, typ: 4, titel: 'Land:', text: '\r\nBayern\r\nNordrhein-Westfalen', zahl: null },
    ...adresse(201, { 30: 'Max', 40: 'Mustermann', 70: 'Musterweg 1', 90: '12345', 110: 'Musterstadt' }),
    ...adresse(205, {}),
    ...adresse(232, { 110: 'Musterstadt' }),
  ],
});

let ds: SpeicherDateisystem;
let root: ReturnType<typeof createRoot> | null = null;

const ANFANG = {
  projektordner: ['C:/FORMA'],
  ablageordner: [] as string[],
  projekte: [],
  projekt: null,
  formulare: [],
  offen: null,
  karte: null,
  haupt: 'formular' as const,
  ablage: [],
  vorgabeAuswahl: ['*'],
  auswahl: {},
  verlaufOffen: false,
  gliederungOffen: true,
  adressbuch: null,
  adressbuchKarten: null,
  eigeneAdressen: [],
  adressbuchLaeuft: null,
  rollenVorgaben: {},
  profile: {},
  projektdaten: null,
  datei: null,
  dateiEntwuerfe: {},
  konflikt: false,
  meldung: null,
  ansicht: 'felder' as const,
};

beforeEach(() => {
  localStorage.clear();
  ds = new SpeicherDateisystem({ benutzer: 't.test', computer: 'HELEN', prozess: 4242 });
  ds.dateien.set(FORMULAR, MUSTER);
  ds.dateien.set('C:/FORMA/BS9/sj_office.ini', cp1252Schreiben('[Allgemeines]\r\nText=Musterstraße 9\r\n\r\n'));
  ds.dateien.set(KARTE, new Uint8Array([1]));
  ds.projektkarten.set(KARTE, projektkarte());
  ds.dateien.set('C:/FORMA/BS9/_archiv/000-Alt.frmsjf', MUSTER);
  ds.dateien.set('C:/FORMA/Sonstiges/notiz.txt', new Uint8Array([1]));
  useFormulare.setState({ ds, ...ANFANG, kartenFavoriten: [], kartenAusgeblendet: [], kartenEintraegeAusgeblendet: [] });
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

/** wartet, bis die (im Speicher sofort erledigten) Dateizugriffe durch sind */
const warte = () => act(async () => new Promise((r) => setTimeout(r, 0)));

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

/** App „neu starten“: Oberfläche weg, Zustand bis auf Einstellungen zurück */
async function neustart(): Promise<HTMLElement> {
  act(() => root?.unmount());
  document.body.innerHTML = '';
  useFormulare.setState({ projekt: null, formulare: [], offen: null, karte: null, meldung: null });
  return render();
}

const knoepfe = (host: Element) => [...host.querySelectorAll('button')];
const knopf = (host: Element, text: string) => knoepfe(host).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const knopfGenau = (host: Element, text: string) => knoepfe(host).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const knopfMit = (host: Element, label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"], button[title="${label}"]`)!;
const klick = async (el: HTMLElement) => {
  act(() => el.click());
  await warte();
};
/** Eingabe wie von Hand */
const eingabe = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const taste = (el: EventTarget, key: string, mehr: KeyboardEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mehr }));
  });
const feld = (host: Element, label: string, n = 0) => host.querySelectorAll<HTMLInputElement>(`[aria-label="${label}"]`)[n];
const kreuz = (host: Element, beschriftung: string) =>
  [...host.querySelectorAll('label.fo-kreuz')].find((l) => l.textContent === beschriftung)!.querySelector('input') as HTMLInputElement;
/** Eingabe eines Eintrags der gerade gezeigten Gruppe der Projektkarte (nach dem Titel über dem Feld) */
const kartenFeld = <T extends HTMLElement = HTMLInputElement>(host: Element, titel: string) =>
  [...host.querySelectorAll('.pk-feld')].find((f) => f.querySelector('.pk-feld-titel')?.textContent === titel)!.querySelector('input, select, textarea') as unknown as T;
const gruppeWaehlen = async (host: Element, name: string) =>
  klick([...host.querySelectorAll<HTMLButtonElement>('.pk-nav-eintrag')].find((b) => b.querySelector('.pk-nav-name')?.textContent?.startsWith(name))!);
const waehle = (el: HTMLSelectElement, value: string) =>
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
const karteVon = () => ds.projektkarten.get(KARTE)!;
const pkText = (gruppe: number, id: number) => karteVon().eintraege.find((e) => e.gruppe === gruppe && e.id === id)!;

async function oeffneMuster(host?: HTMLElement): Promise<HTMLElement> {
  host ??= await render();
  await projektOeffnen(host, 'BS9');
  await klick(knopf(host, '001-Muster'));
  return host;
}

/** Projekt in der Projektübersicht öffnen – eingeklappte Quellen vorher aufklappen */
async function projektOeffnen(host: HTMLElement, kuerzel: string) {
  const karte = () => host.querySelector<HTMLButtonElement>(`.pa-karte[data-projekt="${kuerzel}"]`);
  if (!karte()) for (const g of host.querySelectorAll<HTMLButtonElement>('.pa-gruppe-kopf[aria-expanded="false"]')) await klick(g);
  await klick(karte()!);
}

describe('Formulare', () => {
  it('Leerzustand im Browser: einheitlicher Einstieg „Datei öffnen …“ (Q-5)', async () => {
    useFormulare.setState({ ds: null, offen: null, projekt: null });
    const host = await render();
    expect(einstiegsAktionen(host)).toEqual(['Datei öffnen …']);
  });

  it('Farbschema wechselt sofort (Menü ◐), ohne Option „Zeichenfläche abdunkeln“', async () => {
    const host = await render();
    expect(farbschemaWechseln(host, 'Dunkel')).toBe('dunkel');
    expect(farbschemaWechseln(host, 'Hell')).toBe('hell');
  });

  it('findet Projekte mit Titel und ihre Formulare (ohne Archiv)', async () => {
    const host = await render();
    // Projektübersicht statt Liste in der Seitenleiste: je Quelle eine Gruppe – bei genau einer Quelle aufgeklappt (P-09)
    expect(host.querySelector('.nav')).toBeNull();
    const gruppe = host.querySelector<HTMLButtonElement>('.pa-gruppe-kopf')!;
    expect(gruppe.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.pa-karte[data-projekt="BS9"]')!.textContent).toContain('Musterstraße 9');
    expect(knopf(host, 'Sonstiges')).toBeUndefined();
    await projektOeffnen(host, 'BS9');
    expect(host.querySelector('.fo-projektkopf')?.textContent).toContain('BS9');
    expect(knopf(host, '001-Muster')).toBeDefined();
    expect(knopf(host, '000-Alt')).toBeUndefined();
    // Projektdaten (die Projektkarte aus FORMA) stehen hervorgehoben über den Formularen
    const daten = host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!;
    expect(daten.textContent).toContain('Projektdaten');
    expect(daten.closest('[aria-label="Formulare"]')).toBeNull();
  });

  it('sperrt beim Öffnen, speichert nur die geänderten Wertzeilen und entsperrt beim Schließen', async () => {
    const host = await oeffneMuster();
    const sperre = cp1252Lesen(ds.dateien.get(SPERRE)!);
    expect(sperre).toMatch(/^\[Zugriff\]\r\nUser=t\.test\r\nComputer=HELEN\r\nAngemeldet=\d\d\.\d\d\.\d{4} \d\d:\d\d:\d\d\r\nInGebrauch=4242\r\n\r\n$/);

    expect(feld(host, 'Bauherrschaft', 0).value).toBe('Mustermann, Max');
    eingabe(feld(host, 'Bauherrschaft', 1), 'Musterweg 7');
    act(() => kreuz(host, 'Sonderbau').click());
    act(() => kreuz(host, 'Wohngebäude').click());
    expect(host.textContent).toContain('3 Feld(er) geändert');
    expect(host.textContent).toContain('lokal gesichert');
    expect(ds.dateien.get(FORMULAR)).toBe(MUSTER);

    await klick(knopfGenau(host, 'Speichern'));
    const gespeichert = ds.dateien.get(FORMULAR)!;
    expect(gespeichert).toEqual(mitAenderungen(MUSTER, { '0:Memo2': 'Musterweg 7', '0:CheckBox2': true, '0:CheckBox1': false }));
    const text = new TextDecoder().decode(gespeichert);
    expect(text).toContain("          Lines.Strings = (\r\n            'Musterweg 7')\r\n          ParentFont = False");
    expect(gespeichert.length - MUSTER.length).toBe("          Lines.Strings = (\r\n            'Musterweg 7')\r\n".length);
    expect(host.textContent).toContain('gespeichert');
    expect(knopfGenau(host, 'Speichern').disabled).toBe(true);

    await klick(knopfMit(host, 'Projekt schließen'));
    expect(ds.dateien.has(SPERRE)).toBe(false);
    expect(ds.schreibvorgaenge).toEqual(['sperre BS9/001-Muster.frmtmp', 'ersetze BS9/001-Muster.frmsjf', 'entsperre BS9/001-Muster.frmtmp']);
  });

  it('ist das Formular in FORMA geöffnet, lässt es sich nur ansehen', async () => {
    const fremd = cp1252Schreiben('[Zugriff]\r\nUser=kollegin\r\nComputer=CAD02\r\nAngemeldet=09.11.2026 10:17:12\r\nInGebrauch=67802\r\n\r\n');
    ds.dateien.set(SPERRE, fremd);
    const host = await oeffneMuster();
    expect(host.textContent).toContain('Nur ansehen: Das Formular ist bei kollegin auf CAD02 geöffnet (seit 09.11.2026 10:17:12).');
    expect(feld(host, 'Bauherrschaft', 1).disabled).toBe(true);
    expect(knopfGenau(host, 'Speichern').disabled).toBe(true);
    await klick(knopfMit(host, 'Projekt schließen'));
    expect(ds.dateien.get(SPERRE)).toBe(fremd);
    expect(ds.schreibvorgaenge).toEqual([]);
  });

  it('nach einem Absturz liegen gebliebene eigene Sperren werden beim Start entfernt', async () => {
    const alt = cp1252Schreiben('[Zugriff]\r\nUser=t.test\r\nComputer=HELEN\r\nAngemeldet=09.11.2026 08:00:00\r\nInGebrauch=1111\r\n\r\n');
    ds.dateien.set(SPERRE, alt);
    sperreVermerken('C:/FORMA', 'BS9/001-Muster.frmtmp', alt);
    const host = await render();
    expect(ds.dateien.has(SPERRE)).toBe(false);
    expect(host.textContent).toContain('Nach einem Absturz liegen gebliebene Sperre(n) entfernt: 001-Muster.');
    // fremde Sperren mit anderem Inhalt bleiben unberührt
    const fremd = cp1252Schreiben('[Zugriff]\r\nUser=kollegin\r\nComputer=CAD02\r\nAngemeldet=09.11.2026 08:00:00\r\nInGebrauch=1111\r\n\r\n');
    ds.dateien.set(SPERRE, fremd);
    sperreVermerken('C:/FORMA', 'BS9/001-Muster.frmtmp', alt);
    await neustart();
    expect(ds.dateien.get(SPERRE)).toBe(fremd);
  });

  it('eine eigene verwaiste Sperre wird beim Öffnen ersetzt – aber nicht, solange ein Programm sie offen hält', async () => {
    const host = await render();
    const alt = cp1252Schreiben('[Zugriff]\r\nUser=t.test\r\nComputer=HELEN\r\nAngemeldet=09.11.2026 08:00:00\r\nInGebrauch=1111\r\n\r\n');
    ds.dateien.set(SPERRE, alt);
    sperreVermerken('C:/FORMA', 'BS9/001-Muster.frmtmp', alt);
    ds.offeneSperren.add(SPERRE);
    await oeffneMuster(host);
    expect(host.textContent).toContain('In Gebrauch');
    expect(feld(host, 'Bauherrschaft', 1).disabled).toBe(true);
    expect(knopf(host, 'Sperre aufheben')).toBeUndefined();

    // das andere Programm schließt die Datei: „Erneut prüfen“ ersetzt die verwaiste Sperre
    ds.offeneSperren.delete(SPERRE);
    await klick(knopfGenau(host, 'Erneut prüfen'));
    expect(feld(host, 'Bauherrschaft', 1).disabled).toBe(false);
    expect(cp1252Lesen(ds.dateien.get(SPERRE)!)).toContain('InGebrauch=4242');
    expect(host.textContent).toContain('verwaiste Sperre dieser App');
  });

  it('eine verwaiste fremde Sperre auf diesem Rechner lässt sich aufheben – danach wird bearbeitet', async () => {
    // FORMA auf diesem Rechner abgestürzt: Prozess 67802 läuft nicht mehr
    ds.dateien.set(SPERRE, cp1252Schreiben('[Zugriff]\r\nUser=t.test\r\nComputer=HELEN\r\nAngemeldet=09.11.2026 10:17:12\r\nInGebrauch=67802\r\n\r\n'));
    const host = await oeffneMuster();
    expect(host.querySelector('.fo-meldung.hinweis')!.textContent).toContain('Verwaist');
    expect(host.textContent).toContain('kein Programm mit der Nummer 67802 mehr');
    await klick(knopf(host, 'Sperre aufheben'));
    expect(host.querySelector('[aria-label="Sperre aufheben"]')!.textContent).toContain('t.test auf HELEN');
    await klick(knopfGenau(host, 'Sperre aufheben und bearbeiten'));
    expect(feld(host, 'Bauherrschaft', 1).disabled).toBe(false);
    expect(cp1252Lesen(ds.dateien.get(SPERRE)!)).toContain('InGebrauch=4242');
    expect(host.textContent).toContain('ist jetzt hier zum Bearbeiten geöffnet');
    expect(ds.schreibvorgaenge).toEqual(['entsperre BS9/001-Muster.frmtmp', 'sperre BS9/001-Muster.frmtmp']);
  });

  it('läuft das Programm der Sperre noch, gilt sie als in Gebrauch; ist sie weg, öffnet „Erneut prüfen“ zum Bearbeiten', async () => {
    ds.prozesse.set(67802, 'SJOffice.exe');
    ds.dateien.set(SPERRE, cp1252Schreiben('[Zugriff]\r\nUser=t.test\r\nComputer=HELEN\r\nAngemeldet=09.11.2026 10:17:12\r\nInGebrauch=67802\r\n\r\n'));
    const host = await oeffneMuster();
    expect(host.textContent).toContain('Auf diesem Rechner läuft SJOffice.exe');
    expect(host.querySelector('.fo-meldung.hinweis')!.textContent).toContain('In Gebrauch');
    // FORMA schließt das Formular
    ds.dateien.delete(SPERRE);
    await klick(knopfGenau(host, 'Erneut prüfen'));
    expect(feld(host, 'Bauherrschaft', 1).disabled).toBe(false);
    expect(host.querySelector('.fo-meldung.hinweis')).toBeNull();
  });

  it('Übersicht der Sperren: auch Sperrdateien ohne Formular, aufheben nach Bestätigung', async () => {
    const waise = 'C:/FORMA/BS9/002-Umbenannt.frmtmp';
    ds.dateien.set(waise, cp1252Schreiben('[Zugriff]\r\nUser=kollegin\r\nComputer=CAD02\r\nAngemeldet=01.01.2026 09:00:00\r\nInGebrauch=1\r\n\r\n'));
    ds.dateien.set(SPERRE, cp1252Schreiben('[Zugriff]\r\nUser=kollege\r\nComputer=CAD03\r\nAngemeldet=09.11.2026 10:17:12\r\nInGebrauch=2\r\n\r\n'));
    ds.offeneSperren.add(SPERRE);
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(knopfMit(host, 'Sperren'));
    await warte();
    const zeilen = [...host.querySelectorAll('.fo-sperr-zeile')];
    expect(zeilen.map((z) => z.querySelector('strong')!.textContent)).toEqual(['001-Muster', '002-Umbenannt']);
    expect(zeilen[0].textContent).toContain('In Gebrauch');
    expect(knopf(zeilen[0], 'Aufheben').disabled).toBe(true);
    expect(zeilen[1].textContent).toContain('(kein Formular dazu)');
    expect(zeilen[1].textContent).toContain('Verwaist');
    await klick(knopf(zeilen[1], 'Aufheben'));
    await klick(knopfGenau(host, 'Sperre aufheben'));
    await warte();
    expect(ds.dateien.has(waise)).toBe(false);
    expect(ds.dateien.has(SPERRE)).toBe(true);
    expect(host.querySelectorAll('.fo-sperr-zeile')).toHaveLength(1);
  });

  it('wurde die Datei inzwischen geändert, wird erst nach dem Neuladen gespeichert – mit beiden Änderungen', async () => {
    const host = await oeffneMuster();
    eingabe(feld(host, 'Bauherrschaft', 1), 'Musterweg 7');
    const vonFORMA = mitAenderungen(MUSTER, { '0:CheckBox4': true });
    ds.dateien.set(FORMULAR, vonFORMA);

    await klick(knopfGenau(host, 'Speichern'));
    expect(ds.dateien.get(FORMULAR)).toBe(vonFORMA);
    expect(host.textContent).toContain('seit dem Öffnen außerhalb geändert');

    await klick(knopfGenau(host, 'Neu laden'));
    expect(feld(host, 'Bauherrschaft', 1).value).toBe('Musterweg 7');
    await klick(knopfGenau(host, 'Speichern'));
    expect(ds.dateien.get(FORMULAR)).toEqual(mitAenderungen(MUSTER, { '0:CheckBox4': true, '0:Memo2': 'Musterweg 7' }));
  });

  it('nicht gespeicherte Eingaben und der Verlauf überstehen einen Neustart', async () => {
    let host = await oeffneMuster();
    eingabe(feld(host, 'Bauherrschaft', 1), 'Musterweg 7');
    act(() => kreuz(host, 'Sonderbau').click());
    await klick(knopfMit(host, 'Projekt schließen'));
    await projektOeffnen(host, 'BS9');
    expect(knopf(host, '001-Muster').textContent).toContain('●');

    host = await oeffneMuster(await neustart());
    expect(feld(host, 'Bauherrschaft', 1).value).toBe('Musterweg 7');
    expect(host.textContent).toContain('2 nicht gespeicherte Eingabe(n) vom letzten Mal wiederhergestellt');
    expect(ds.dateien.get(FORMULAR)).toBe(MUSTER);

    // Rückgängig über den Neustart hinweg – erst das Kästchen, dann die Straße
    await klick(knopfMit(host, 'Rückgängig'));
    expect(kreuz(host, 'Sonderbau').checked).toBe(false);
    await klick(knopfMit(host, 'Rückgängig'));
    expect(feld(host, 'Bauherrschaft', 1).value).toBe('');
    expect(knopfGenau(host, 'Speichern').disabled).toBe(true);
    expect(knopfMit(host, 'Rückgängig').disabled).toBe(true);
    await klick(knopfMit(host, 'Wiederholen'));
    expect(feld(host, 'Bauherrschaft', 1).value).toBe('Musterweg 7');
  });

  it('Strg+Z und Strg+Y nehmen Eingaben zurück und stellen sie wieder her; der Verlauf zeigt jeden Schritt', async () => {
    const host = await oeffneMuster();
    eingabe(feld(host, 'Bauherrschaft', 1), 'Musterweg 7');
    taste(window, 'z', { ctrlKey: true });
    expect(feld(host, 'Bauherrschaft', 1).value).toBe('');
    taste(window, 'y', { ctrlKey: true });
    expect(feld(host, 'Bauherrschaft', 1).value).toBe('Musterweg 7');

    await klick(knopfGenau(host, 'Verlauf'));
    const schritte = host.querySelectorAll('.fo-verlauf-liste .fo-verlauf-schritt');
    expect(schritte).toHaveLength(1);
    expect(schritte[0].textContent).toContain('Bauherrschaft');
    expect(schritte[0].textContent).toContain('(leer) → Musterweg 7');
    // Klick auf „Anfang“ nimmt alles zurück
    await klick(knopf(host, 'Anfang (vor der ersten Eingabe)'));
    expect(feld(host, 'Bauherrschaft', 1).value).toBe('');
  });

  it('Formularansicht: Felder an ihrer Stelle auf weißem Papier, dieselben Eingaben wie in der Feldansicht', async () => {
    const host = await oeffneMuster();
    await klick(knopfGenau(host, 'Formular'));
    expect(host.querySelectorAll('.fo-papier')).toHaveLength(2);
    expect(host.querySelectorAll('textarea.fo-memo')).toHaveLength(3);
    expect(host.querySelectorAll('label.fo-check input')).toHaveLength(4);
    const memo = host.querySelector<HTMLTextAreaElement>('textarea.fo-memo')!;
    expect([memo.style.left, memo.style.top, memo.value]).toEqual(['5px', '40px', 'Mustermann, Max']);
    expect(memo.style.fontFamily).toContain('Courier New');
    eingabe(memo, 'Musterfrau, Erika');
    await klick(knopfGenau(host, 'Felder'));
    expect(feld(host, 'Bauherrschaft', 0).value).toBe('Musterfrau, Erika');
  });

  it('die Gliederung gehört zum Formular: eigener Bereich neben dem Formular, nicht in der Navigation', async () => {
    const host = await oeffneMuster();
    const gl = host.querySelector('nav[aria-label="Inhalt des Formulars"]')!;
    expect(gl.closest('.fo-leiste')).toBeNull();
    expect(gl.textContent).toContain('001-Muster');
    expect(gl.textContent).toContain('Bauherrschaft');
    await klick(knopfMit(host, 'Gliederung ausblenden'));
    expect(host.querySelector('nav[aria-label="Inhalt des Formulars"]')).toBeNull();
    await klick(knopfGenau(host, 'Gliederung'));
    expect(host.querySelector('nav[aria-label="Inhalt des Formulars"]')).not.toBeNull();
  });

  it('Enter in einzeiligen Feldern springt zum nächsten Feld', async () => {
    const host = await oeffneMuster();
    const erstes = feld(host, 'Bauherrschaft', 0);
    act(() => erstes.focus());
    taste(erstes, 'Enter');
    expect(document.activeElement).toBe(feld(host, 'Bauherrschaft', 1));
  });

  it('Projektkarte: Gruppen mit Kurzfassung, bearbeiten und speichern – nur geänderte Einträge, mit dem alten Wert als Prüfung', async () => {
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    const nav = [...host.querySelectorAll('.pk-nav-eintrag')].map((b) => [b.querySelector('.pk-nav-name')!.textContent!.trim(), b.querySelector('.pk-nav-kurz')!.textContent]);
    expect(nav).toEqual([
      // oben die eigene Ansicht (noch nicht zusammengestellt); der Antragsumfang steht in den Antragsdaten
      ['Eigene Ansicht', 'zusammenstellen …'],
      ['Projektdaten', 'Neubau'],
      ['Bauherr', 'Mustermann, Max · Musterstadt'],
      ['Eigentümer des Baugrundstücks', 'nicht ausgefüllt'],
      ['Gemeinde', 'Musterstadt'],
    ]);
    await gruppeWaehlen(host, 'Bauherr');
    expect(kartenFeld(host, 'Name/Firma').value).toBe('Mustermann');
    expect(host.querySelector('.pk-vorschau')!.textContent).toContain('Musterweg 1');

    eingabe(kartenFeld(host, 'Name/Firma'), 'Musterfrau');
    expect(host.textContent).toContain('1 Eintrag/Einträge geändert');
    expect(host.querySelector('.pk-feld.geaendert')).not.toBeNull();
    // in der Zwischenzeit ändert jemand in FORMA einen anderen Eintrag – das stört nicht
    pkText(201, 110).text = 'Neustadt';
    await klick(knopfGenau(host, 'Projektkarte speichern'));
    expect(pkText(201, 40).text).toBe('Musterfrau');
    expect(ds.schreibvorgaenge).toEqual(['projektkarte BS9/sj_prokarte.sdb (1)']);
    expect(kartenFeld(host, 'Ort').value).toBe('Neustadt');
    expect(host.textContent).toContain('Alles gespeichert');

    // derselbe Eintrag inzwischen anders: nichts wird geschrieben
    eingabe(kartenFeld(host, 'Name/Firma'), 'Beispiel');
    pkText(201, 40).text = 'von FORMA';
    await klick(knopfGenau(host, 'Projektkarte speichern'));
    expect(host.textContent).toContain('inzwischen geändert');
    expect(pkText(201, 40).text).toBe('von FORMA');
  });

  it('Projektkarte: Auswahllisten speichern die Nummer der Wahl, Hinweise auf Tippfehler, Rückgängig', async () => {
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    await gruppeWaehlen(host, 'Bauherr');
    const anrede = kartenFeld<HTMLSelectElement>(host, 'Anrede');
    // die leere erste Zeile ist „keine Angabe“ – angeboten werden die drei Anreden
    expect([...anrede.options].map((o) => o.textContent)).toEqual(['– keine Angabe –', 'Sehr geehrte Frau', 'Sehr geehrter Herr', 'Sehr geehrte Damen und Herren,']);
    waehle(anrede, '2');
    eingabe(kartenFeld(host, 'PLZ Straße'), '1234');
    expect(host.textContent).toContain('Postleitzahlen in Deutschland haben fünf Ziffern.');

    await klick(knopfMit(host, 'Rückgängig'));
    expect(kartenFeld(host, 'PLZ Straße').value).toBe('12345');
    await klick(knopfGenau(host, 'Projektkarte speichern'));
    expect(pkText(201, 210).zahl).toBe(2);
    // die Möglichkeiten selbst bleiben, wie FORMA sie angelegt hat
    expect(pkText(201, 210).text).toBe(ANREDE);
    expect(ds.schreibvorgaenge).toEqual(['projektkarte BS9/sj_prokarte.sdb (1)']);
  });

  it('Projektkarte: Art der Nutzung als Auswahl – eine eigene Angabe bleibt erhalten; Anzahl nur als ganze Zahl', async () => {
    const k = projektkarte();
    k.eintraege.push(
      { gruppe: 101, id: 100, typ: 1, titel: 'Art der Nutzung:', text: 'Eigene Nutzung', zahl: null },
      { gruppe: 101, id: 110, typ: 1, titel: 'Anzahl Wohnungen:', text: 'ca. 3', zahl: null },
    );
    ds.projektkarten.set(KARTE, k);
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    await gruppeWaehlen(host, 'Projektdaten');

    // ein Text, der nicht in der Liste steht, wird als „(eigene Angabe)“ angeboten und nicht überschrieben
    const nutzung = () => kartenFeld<HTMLSelectElement>(host, 'Art der Nutzung');
    expect(nutzung().tagName).toBe('SELECT');
    expect(nutzung().value).toBe('Eigene Nutzung');
    const optionen = () => [...nutzung().options].map((o) => o.textContent);
    expect(optionen()).toContain('Eigene Nutzung (eigene Angabe)');
    expect(optionen()).toContain('Wohnen');
    expect(optionen().at(-1)).toBe('eigene Angabe ändern …');

    // „eigene Angabe ändern …“ öffnet die Eingabe mit dem Text, der Pfeil führt zur Liste zurück – ohne zu löschen
    waehle(nutzung(), '\u0000frei');
    const frei = kartenFeld(host, 'Art der Nutzung');
    expect(frei.tagName).toBe('INPUT');
    expect(frei.value).toBe('Eigene Nutzung');
    eingabe(frei, 'Atelier');
    await klick(knopfMit(host, 'Aus der Liste wählen'));
    expect(nutzung().value).toBe('Atelier');
    expect(optionen()).toContain('Atelier (eigene Angabe)');
    expect(document.activeElement).toBe(nutzung());
    // mit der Tastatur: Esc führt ebenso zurück, der Fokus bleibt am Eintrag
    waehle(nutzung(), '\u0000frei');
    taste(kartenFeld(host, 'Art der Nutzung'), 'Escape');
    expect(nutzung().tagName).toBe('SELECT');
    expect(nutzung().value).toBe('Atelier');
    expect(document.activeElement).toBe(nutzung());

    // ein Wert aus der Liste ersetzt die eigene Angabe; danach heißt der letzte Punkt wieder „andere …“
    waehle(nutzung(), 'Wohnen');
    expect(nutzung().value).toBe('Wohnen');
    expect(optionen().some((o) => o?.includes('(eigene Angabe)'))).toBe(false);
    expect(optionen().at(-1)).toBe('andere …');

    // Anzahl: Ziffernfeld; ein alter Text, der keine ganze Zahl ist, bleibt sichtbar (und leerbar) und wird gemeldet
    const anzahl = () => kartenFeld(host, 'Anzahl Wohnungen');
    expect(anzahl().type).toBe('text');
    expect(anzahl().inputMode).toBe('numeric');
    expect(anzahl().value).toBe('ca. 3');
    expect(anzahl().getAttribute('aria-invalid')).toBe('true');
    expect(host.textContent).toContain('„ca. 3“ ist keine ganze Zahl – bitte als Zahl eintragen');
    // die Warnung steht direkt unter dem Feld (vor der Herkunft) und ist mit ihm verbunden
    expect(anzahl().nextElementSibling?.className).toBe('pk-warnung');
    expect(anzahl().getAttribute('aria-describedby')).toBe(anzahl().nextElementSibling!.id);
    eingabe(anzahl(), '3');
    expect(anzahl().value).toBe('3');
    expect(host.textContent).not.toContain('keine ganze Zahl');
    // nur Ziffern lassen sich tippen; Eingefügtes wird nicht verändert, sondern gemeldet
    for (const t of [',', '.', '-', 'e', 'a', ' ']) {
      const ev = new KeyboardEvent('keydown', { key: t, bubbles: true, cancelable: true });
      act(() => void anzahl().dispatchEvent(ev));
      expect(ev.defaultPrevented).toBe(true);
    }
    eingabe(anzahl(), '1.5');
    expect(useFormulare.getState().karte!.aenderungen['101:110']).toBe('1.5');
    expect(anzahl().value).toBe('1.5');
    expect(host.textContent).toContain('„1.5“ ist keine ganze Zahl – bitte als Zahl eintragen');
    const ziffer = new KeyboardEvent('keydown', { key: '7', bubbles: true, cancelable: true });
    act(() => void anzahl().dispatchEvent(ziffer));
    expect(ziffer.defaultPrevented).toBe(false);
    eingabe(anzahl(), '3');

    await klick(knopfGenau(host, 'Projektkarte speichern'));
    expect(pkText(101, 100).text).toBe('Wohnen');
    expect(pkText(101, 110).text).toBe('3');
  });

  it('Projektkarte: Angaben von einer anderen Gruppe übernehmen; eine Adresse als Vorgabe festlegen und eintragen', async () => {
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    await gruppeWaehlen(host, 'Eigentümer');
    waehle(host.querySelector<HTMLSelectElement>('.pk-uebernehmen')!, 'g:201');
    await warte();
    expect(kartenFeld(host, 'Name/Firma').value).toBe('Mustermann');
    expect(kartenFeld(host, 'Ort').value).toBe('Musterstadt');
    // ein Schritt: Strg+Z nimmt die ganze Übernahme zurück
    taste(window, 'z', { ctrlKey: true });
    await warte();
    expect(kartenFeld(host, 'Name/Firma').value).toBe('');

    // Bauherr als Vorgabe der Rolle festlegen: landet im Adressbuch und in den Stammdaten
    await gruppeWaehlen(host, 'Bauherr');
    await klick(knopfGenau(host, 'Als Vorgabe festlegen'));
    expect(host.textContent).toContain('„Mustermann, Max“ ist jetzt die Vorgabe für Bauherr');
    expect(useFormulare.getState().rollenVorgaben['201']).toBe(useFormulare.getState().adressbuch!.adressen[0].schluessel);
    expect(host.querySelector('.pk-marke')!.textContent).toContain('Vorgabe');

    // leere Gruppen bekommen die Vorgabe mit „Vorgaben eintragen“ (ein Schritt)
    await klick(knopfGenau(host, 'Leeren'));
    expect(kartenFeld(host, 'Name/Firma').value).toBe('');
    await klick(knopf(host, 'Vorgaben eintragen (1)'));
    expect(kartenFeld(host, 'Name/Firma').value).toBe('Mustermann');
    expect(kartenFeld(host, 'Straße/Nr.').value).toBe('Musterweg 1');
    // in der Auswahl „Übernehmen von …“ steht die Vorgabe obenan
    expect([...host.querySelectorAll('.pk-uebernehmen optgroup')].map((g) => g.getAttribute('label'))[0]).toBe('Vorgabe (Stammdaten)');
  });

  it('Projektkarte durchsuchen: ein Treffer springt in seine Gruppe', async () => {
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    eingabe(host.querySelector<HTMLInputElement>('.pk-suche')!, 'musterweg');
    const treffer = [...host.querySelectorAll<HTMLButtonElement>('.pk-treffer-zeile')];
    expect(treffer.map((t) => t.querySelector('.pk-treffer-ort')!.textContent)).toEqual(['Bauherr › Straße/Nr.']);
    await klick(treffer[0]);
    expect(host.querySelector('.pk-kopf h2')!.textContent).toBe('Bauherr');
  });

  it('Projektkarte: Gruppen als Favorit oben anzeigen und ausblenden – gilt für alle Projekte, bleibt gespeichert', async () => {
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    const reihen = () =>
      [...host.querySelectorAll('.pk-nav-reihe:not(.pk-nav-eigen)')].map((r) => [
        r.querySelector('.pk-nav-titel')?.textContent ?? r.querySelector('.pk-nav-mehr')?.textContent,
        ...[...r.querySelectorAll('.pk-nav-eintrag .pk-nav-name')].map((n) => n.textContent!.trim()),
      ]);
    const zeile = (name: string) => [...host.querySelectorAll('.pk-nav-zeile')].find((z) => z.querySelector('.pk-nav-name')!.textContent!.trim() === name)!;
    expect(reihen()).toEqual([['Projekt', 'Projektdaten'], ['Beteiligte', 'Bauherr', 'Eigentümer des Baugrundstücks', 'Gemeinde']]);

    // Favorit: oben unter „Favoriten“, nicht mehr doppelt in der eigenen Reihe
    await klick(zeile('Gemeinde').querySelector<HTMLButtonElement>('.pk-nav-stern')!);
    expect(reihen()[0]).toEqual(['Favoriten', 'Gemeinde']);
    expect(reihen()[2]).toEqual(['Beteiligte', 'Bauherr', 'Eigentümer des Baugrundstücks']);
    expect(zeile('Gemeinde').querySelector('.pk-nav-stern')!.getAttribute('aria-pressed')).toBe('true');

    // ausblenden: verschwindet aus der Gliederung, über „… ausgeblendet – zeigen“ erreichbar; die Suche findet sie weiter
    await klick(zeile('Eigentümer des Baugrundstücks').querySelector<HTMLButtonElement>('.pk-nav-auge')!);
    expect(reihen()).toEqual([['Favoriten', 'Gemeinde'], ['Projekt', 'Projektdaten'], ['Beteiligte', 'Bauherr'], ['1 ausgeblendet – zeigen']]);
    await klick(host.querySelector<HTMLButtonElement>('.pk-nav-mehr')!);
    expect(reihen()[3]).toEqual(['1 ausgeblendet – verbergen', 'Eigentümer des Baugrundstücks']);
    expect(useFormulare.getState()).toMatchObject({ kartenFavoriten: [232], kartenAusgeblendet: [205] });
    expect(JSON.parse(localStorage.getItem('formulare:einstellungen')!)).toMatchObject({ kartenFavoriten: [232], kartenAusgeblendet: [205] });

    // wieder einblenden; ein Favorit lässt sich nicht zugleich ausblenden
    await klick(zeile('Eigentümer des Baugrundstücks').querySelector<HTMLButtonElement>('.pk-nav-auge')!);
    await klick(zeile('Gemeinde').querySelector<HTMLButtonElement>('.pk-nav-auge')!);
    expect(useFormulare.getState()).toMatchObject({ kartenFavoriten: [], kartenAusgeblendet: [232] });
  });

  it('Projektkarte: eigene Ansicht – Einträge aus allen Gruppen auf einer Seite zusammenstellen, ordnen und bearbeiten', async () => {
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    await klick([...host.querySelectorAll<HTMLButtonElement>('.pk-nav-eintrag')].find((b) => b.textContent!.includes('Eigene Ansicht'))!);
    expect(host.querySelector('.pk-kopf h2')!.textContent).toBe('Eigene Ansicht');
    await klick([...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Ansicht zusammenstellen …')!);
    const editor = document.querySelector<HTMLElement>('.av-editor')!;
    expect(editor).toBeTruthy();
    const haken = (gruppe: string, titel: string) =>
      [...[...editor.querySelectorAll('.av-ed-gruppe')].find((g) => g.querySelector('.av-ed-gruppe-titel')?.textContent === gruppe)!.querySelectorAll<HTMLLabelElement>('.av-ed-kat-feld')]
        .find((l) => l.textContent === titel)!
        .querySelector('input')!;
    await klick(haken('Bauherr', 'Name/Firma'));
    await klick(haken('Gemeinde', 'Ort'));
    await klick(haken('Bauherr', 'Ort'));
    const imAufbau = () => [...editor.querySelectorAll<HTMLInputElement>('.av-ed-feld .av-ed-label')].map((t) => t.placeholder);
    expect(imAufbau()).toEqual(['Name/Firma', 'Ort', 'Ort']);
    // eigene Beschriftung, Breite, neue Zeile
    const feldZeile = (n: number) => editor.querySelectorAll<HTMLElement>('.av-ed-feld')[n];
    eingabe(feldZeile(0).querySelector<HTMLInputElement>('.av-ed-label')!, 'Bauherrschaft');
    waehle(feldZeile(0).querySelector<HTMLSelectElement>('select[aria-label^="Breite"]')!, '8');
    await klick(feldZeile(1).querySelector<HTMLInputElement>('input[aria-label$="beginnt eine neue Zeile"]')!);
    // Ort der Gemeinde mit dem Ort des Bauherrn verknüpfen (Knopf ⛓, dann das Kästchen)
    const verknuepfeMit = async (zeile: HTMLElement, text: string) => {
      const knopf = zeile.querySelector<HTMLButtonElement>('button.av-ed-link')!;
      if (knopf.getAttribute('aria-expanded') !== 'true') await klick(knopf);
      await klick([...editor.querySelectorAll<HTMLLabelElement>('.av-ed-link-liste label')].find((l) => l.textContent?.startsWith(text))!.querySelector('input')!);
    };
    await verknuepfeMit(feldZeile(1), 'Ort (Bauherr)');
    await warte();
    const gespeichert = JSON.parse(localStorage.getItem('formulare:ansicht:projektkarte')!);
    expect(gespeichert.abschnitte[0].optionen).toEqual({ '201:40': { label: 'Bauherrschaft', breite: 8 }, '232:110': { neueZeile: true } });
    expect(gespeichert.verknuepfungen).toEqual([['232:110', '201:110']]);
    expect([...editor.querySelectorAll('.av-ed-vorschau-feld')].map((v) => v.textContent)).toEqual(['Bauherrschaft', 'Ort', 'Ort']);
    // Bauherr › Ort wieder heraus
    await klick(feldZeile(2).querySelector<HTMLButtonElement>('.av-ed-weg')!);
    expect(JSON.parse(localStorage.getItem('formulare:ansicht:projektkarte')!).verknuepfungen).toBeUndefined();
    await verknuepfeMit(feldZeile(1), 'Name/Firma (Bauherr)');
    await warte();
    expect(imAufbau()).toEqual(['Name/Firma', 'Ort']);
    // mit der Tastatur umordnen
    taste(editor.querySelectorAll<HTMLElement>('.av-griff')[1], 'ArrowUp');
    await warte();
    expect(imAufbau()).toEqual(['Ort', 'Name/Firma']);
    expect(JSON.parse(localStorage.getItem('formulare:ansicht:projektkarte')!).abschnitte[0].felder).toEqual(['232:110', '201:40']);
    await klick([...editor.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Fertig')!);
    expect(document.querySelector('.av-editor')).toBeNull();
    // auf der Seite: eigene Beschriftung, Herkunft dezent unter dem Feld, Breite im Raster
    expect([...host.querySelectorAll('.pk-eigen .pk-feld-titel')].map((t) => t.textContent)).toEqual(['Ort', 'Bauherrschaft']);
    expect([...host.querySelectorAll('.pk-eigen .pk-feld-unter')].map((g) => g.textContent)).toEqual(['Gemeinde · ⛓ Bauherr', 'Bauherr · ⛓ Gemeinde']);
    expect([...host.querySelectorAll<HTMLElement>('.pk-eigen .av-feld')].map((f) => [f.dataset.breite, 'neueZeile' in f.dataset])).toEqual([
      ['4', true],
      ['8', false],
    ]);
    // verknüpft: eine Eingabe füllt beide Felder (ein Schritt im Verlauf)
    const name = host.querySelector<HTMLInputElement>('.pk-eigen [data-pk="201:40"]')!;
    eingabe(name, 'Musterfrau, Erika');
    expect(useFormulare.getState().karte!.aenderungen['201:40']).toBe('Musterfrau, Erika');
    expect(useFormulare.getState().karte!.aenderungen['232:110']).toBe('Musterfrau, Erika');
    act(() => void useFormulare.getState().karteRueckgaengig());
    expect(useFormulare.getState().karte!.aenderungen).toEqual({});
    // Zeichen für Zeichen: ein Schritt im Verlauf
    for (const t of ['M', 'Mu', 'Mus']) eingabe(name, t);
    expect(useFormulare.getState().karte!.verlauf.schritte).toHaveLength(1);
    expect(useFormulare.getState().karte!.aenderungen['232:110']).toBe('Mus');
    act(() => void useFormulare.getState().karteRueckgaengig());
    expect(useFormulare.getState().karte!.aenderungen).toEqual({});
    eingabe(name, 'Musterfrau, Erika');
    // Navigation: Zahl der Einträge
    expect([...host.querySelectorAll('.pk-nav-eigen .pk-nav-kurz')].map((k) => k.textContent)).toEqual(['2 Einträge auf einer Seite']);
  });

  it('Projektkarte: Verwerfen und Gruppe leeren wirken nur auf die eigenen Einträge, nicht über Verknüpfungen', async () => {
    // Ort des Bauherrn (Musterstadt) ist mit dem Ort der Gemeinde (hier: Köln) verknüpft
    const k = projektkarte();
    k.eintraege.find((e) => e.gruppe === 232 && e.id === 110)!.text = 'Köln';
    ds.projektkarten.set(KARTE, k);
    localStorage.setItem('formulare:ansicht:projektkarte', JSON.stringify({ abschnitte: [{ id: 'a1', titel: 'Orte', felder: ['201:110', '232:110'] }], verknuepfungen: [['201:110', '232:110']] }));
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    const aenderungen = () => useFormulare.getState().karte!.aenderungen;
    // in A „Köln“: B ist damit unverändert (gleich dem gespeicherten Wert)
    act(() => useFormulare.getState().karteSetzen(201, 110, 'Köln'));
    expect(aenderungen()).toEqual({ '201:110': 'Köln' });
    // Verwerfen: A zurück auf Musterstadt – B bleibt Köln, keine ungespeicherte Änderung übrig
    act(() => useFormulare.getState().karteVerwerfen());
    expect(aenderungen()).toEqual({});
    // Gruppe Bauherr leeren: der verknüpfte Ort der Gemeinde bleibt
    await gruppeWaehlen(host, 'Bauherr');
    await klick(knopfGenau(host, 'Leeren'));
    expect(aenderungen()['201:110']).toBe('');
    expect(aenderungen()['232:110']).toBeUndefined();
    // eine Eingabe dagegen füllt beide
    act(() => useFormulare.getState().karteSetzen(201, 110, 'Münster'));
    expect(aenderungen()).toMatchObject({ '201:110': 'Münster', '232:110': 'Münster' });
  });

  it('Projektkarte: Verknüpfungen je Art – Text in Text (ohne Zeilenumbruch), Auswahl über den Text der Wahl, Kästchen in Kästchen', async () => {
    const k = projektkarte();
    k.eintraege.push(
      { gruppe: 101, id: 200, typ: 16, titel: 'Denkmal', text: 'Baudenkmal', zahl: 0 },
      { gruppe: 101, id: 210, typ: 16, titel: 'Denkmalbereich', text: 'Denkmalbereich', zahl: 0 },
    );
    ds.projektkarten.set(KARTE, k);
    localStorage.setItem(
      'formulare:ansicht:projektkarte',
      JSON.stringify({
        abschnitte: [{ id: 'a1', titel: 'A', felder: ['101:30', '232:110', '201:210', '232:210', '101:60', '101:200', '101:210'] }],
        // mehrzeilig ↔ einzeilig, Anrede ↔ Anrede (gleiche Möglichkeiten), Land ↔ Anrede (andere Möglichkeiten), Kästchen ↔ Kästchen
        verknuepfungen: [['101:30', '232:110'], ['201:210', '232:210', '101:60'], ['101:200', '101:210']],
      }),
    );
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    const aenderungen = () => useFormulare.getState().karte!.aenderungen;
    // mehrzeiliger Text ins einzeilige Feld: ohne Zeilenumbruch
    act(() => useFormulare.getState().karteSetzen(101, 30, 'Neubau\nZweifamilienhaus'));
    expect(aenderungen()).toMatchObject({ '101:30': 'Neubau\nZweifamilienhaus', '232:110': 'Neubau Zweifamilienhaus' });
    // Auswahl über den Text der Wahl: Anrede 2 („Sehr geehrter Herr“) auch in der anderen Anrede; „Land“ kennt den Text
    // nicht und bleibt unverändert
    act(() => useFormulare.getState().karteSetzen(201, 210, 2));
    expect(aenderungen()['232:210']).toBe(2);
    expect(aenderungen()['101:60']).toBeUndefined();
    // keine Angabe überträgt sich ebenso
    act(() => useFormulare.getState().karteSetzen(201, 210, null));
    expect(aenderungen()['232:210']).toBeUndefined();
    // Kästchen in Kästchen
    act(() => useFormulare.getState().karteSetzen(101, 200, 1));
    expect(aenderungen()).toMatchObject({ '101:200': 1, '101:210': 1 });
    // unpassende Paare bietet der Editor gar nicht an
    const eintrag = (g: number, id: number) => k.eintraege.find((e) => e.gruppe === g && e.id === id)!;
    expect(kartenVerknuepfbar(eintrag(101, 30), eintrag(232, 110))).toBe(true);
    expect(kartenVerknuepfbar(eintrag(201, 210), eintrag(101, 60))).toBe(true);
    expect(kartenVerknuepfbar(eintrag(101, 200), eintrag(101, 210))).toBe(true);
    expect(kartenVerknuepfbar(eintrag(101, 200), eintrag(232, 110))).toBe(false);
    expect(kartenVerknuepfbar(eintrag(201, 210), eintrag(232, 110))).toBe(false);
    expect(kartenVerknuepfbar(eintrag(101, 30), undefined)).toBe(false);
  });

  it('Projektkarte: einzelne Einträge ausblenden – bei Beteiligten für alle, mit ungespeicherter Änderung sichtbar', async () => {
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    await gruppeWaehlen(host, 'Bauherr');
    const titel = () => [...host.querySelectorAll('.pk-feld-titel')].map((t) => t.textContent);
    const zelle = (t: string) => [...host.querySelectorAll('.pk-feld')].find((f) => f.querySelector('.pk-feld-titel')?.textContent === t)!;
    expect(titel()).toContain('Straße/Nr.');
    await klick(zelle('Straße/Nr.').querySelector<HTMLButtonElement>('.pk-feld-auge')!);
    expect(titel()).not.toContain('Straße/Nr.');
    expect(useFormulare.getState().kartenEintraegeAusgeblendet).toEqual(['a:70']);
    expect(JSON.parse(localStorage.getItem('formulare:einstellungen')!).kartenEintraegeAusgeblendet).toEqual(['a:70']);
    // gilt für alle Beteiligten
    await gruppeWaehlen(host, 'Gemeinde');
    expect(titel()).not.toContain('Straße/Nr.');
    // „zeigen“: wieder sichtbar (gedämpft) und einblendbar
    const mehr = host.querySelector<HTMLButtonElement>('.pk-eintraege-mehr')!;
    expect(mehr.textContent).toBe('1 Eintrag ausgeblendet – zeigen');
    await klick(mehr);
    expect(zelle('Straße/Nr.').classList.contains('ausgeblendet')).toBe(true);
    // mit ungespeicherter Änderung zählt der Eintrag nicht als verborgen – er bleibt sichtbar
    eingabe(kartenFeld(host, 'Straße/Nr.'), 'Rathausplatz 1');
    expect(host.querySelector('.pk-eintraege-mehr')).toBeNull();
    expect(titel()).toContain('Straße/Nr.');
    await klick(zelle('Straße/Nr.').querySelector<HTMLButtonElement>('.pk-feld-auge')!);
    expect(useFormulare.getState().kartenEintraegeAusgeblendet).toEqual([]);
  });

  it('füllt das Formular aus der Projektkarte – leere Felder vorgewählt, in einem rückgängig zu machenden Schritt', async () => {
    const host = await oeffneMuster();
    // Projektkarte vorher ändern (noch nicht gespeichert): zählt beim Ausfüllen mit
    await klick(host.querySelector<HTMLButtonElement>('.fo-eintrag-karte')!);
    await gruppeWaehlen(host, 'Gemeinde');
    eingabe(kartenFeld(host, 'PLZ Straße'), '12345');
    await klick(knopf(host, '001-Muster'));

    await klick(knopf(host, 'Daten aktualisieren'));
    const zeilen = [...host.querySelectorAll('.fo-ausfuellen-zeile')];
    // Memo2 (leer) → „12345 Musterstadt“; Memo1 („Mustermann, Max“) bekäme den leeren Eintrag der Behörde – nicht angeboten
    expect(zeilen.map((z) => [z.querySelector('strong')!.textContent, z.querySelector('input')!.checked])).toEqual([['Bauherrschaft', true]]);
    expect(zeilen[0].textContent).toContain('12345 Musterstadt');
    await klick(knopf(host, '1 Feld(er) übernehmen'));
    expect(feld(host, 'Bauherrschaft', 1).value).toBe('12345 Musterstadt');
    expect(feld(host, 'Bauherrschaft', 0).value).toBe('Mustermann, Max');

    await klick(knopfMit(host, 'Rückgängig'));
    expect(feld(host, 'Bauherrschaft', 1).value).toBe('');
  });

  it('zeigt den echten Projektordner zum Kürzel, beschränkt auf die ausgewählten Pfade', async () => {
    ds.dateien.set('Z:/Projekte/BS9 Musterstraße 9/Organisation/BS9 Projektdaten.xlsx', new Uint8Array([1]));
    ds.dateien.set('Z:/Projekte/BS9 Musterstraße 9/Organisation/Vertrag.pdf', new Uint8Array([1]));
    ds.dateien.set('Z:/Projekte/BS9 Musterstraße 9/Fotos/a.jpg', new Uint8Array([1]));
    ds.dateien.set('Z:/Projekte/_Akquise/XY1 Anfrage/a.txt', new Uint8Array([1]));
    useFormulare.setState({ ablageordner: ['Z:/Projekte'], vorgabeAuswahl: ['Organisation'] });
    const host = await render();
    await projektOeffnen(host, 'BS9');
    await warte();
    const block = host.querySelector('.fo-baum')!.closest('.nav-abschnitt')!;
    expect(block.textContent).toContain('BS9 Musterstraße 9');
    // zwischen FORMA und Projektordner eine Trennlinie
    expect(block.previousElementSibling?.classList.contains('nav-trenner')).toBe(true);
    expect(knopf(block, 'Organisation')).toBeDefined();
    expect(knopf(block, 'Fotos')).toBeUndefined();
    await klick(knopf(block, 'Organisation'));
    await warte();
    expect(knopf(block, 'BS9 Projektdaten.xlsx')).toBeDefined();
    expect(knopf(block, 'Vertrag.pdf')).toBeDefined();
  });

  it('Schnellwahl mit Strg+K: Kürzel tippen, Enter öffnet das Projekt', async () => {
    const host = await render();
    taste(window, 'k', { ctrlKey: true });
    await warte();
    const suche = host.querySelector<HTMLInputElement>('.fo-schnellwahl input')!;
    eingabe(suche, 'bs9');
    taste(suche, 'Enter');
    await warte();
    expect(host.querySelector('.fo-schnellwahl')).toBeNull();
    expect(useFormulare.getState().projekt?.ordner).toBe('BS9');
  });
});
