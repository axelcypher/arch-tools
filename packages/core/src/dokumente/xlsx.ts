/**
 * Excel-Mappen (.xlsx/.xlsm) anzeigen und einzelne Zellen ändern. Gelesen werden Werte, Formeln, einfache
 * Formate (fett, kursiv, Füllung, Ausrichtung, Rahmen, Zahl- und Datumsformate), verbundene Zellen und
 * Spaltenbreiten. Beim Speichern werden nur die geänderten Zellen im Blatt ersetzt – alles andere (Diagramme,
 * Makros, bedingte Formate …) bleibt unverändert. Excel rechnet beim nächsten Öffnen neu (fullCalcOnLoad).
 */

import type { XmlElement } from './xml';
import { alleKinder, ersetzen, kind, nachfahren, verschluesseln, wurzelVon, xmlLesen } from './xml';
import type { Archiv } from './zip';
import { archivLesen, archivSchreiben, beziehungen, teilText, textTeil } from './zip';
import type { RechenMappe, Wert } from './xlsxRechnen';
import { formelVerschieben, mappeBerechnen } from './xlsxRechnen';

export interface Stil {
  fett: boolean;
  kursiv: boolean;
  unterstrichen: boolean;
  groesse: number | null;
  farbe: string | null;
  fuellung: string | null;
  ausrichtung: 'left' | 'center' | 'right' | null;
  umbruch: boolean;
  rahmen: { l: boolean; r: boolean; o: boolean; u: boolean };
  zahlformat: string;
}

export interface Zelle {
  r: string;
  zeile: number;
  spalte: number;
  /** so angezeigt wie in Excel (ungefähr) */
  anzeige: string;
  /** zum Bearbeiten: Formel mit „=“ oder der Wert */
  eingabe: string;
  formel: string | null;
  stil: number;
  zahl: boolean;
  /** gespeicherter Wert (bei Formeln das zwischengespeicherte Ergebnis): Zahl, Text, Wahrheitswert oder leer */
  wert: number | string | boolean | null;
  /** Teil einer geteilten Formel (Excel speichert sie nur in der ersten Zelle); `formel` ist für diese Zelle verschoben */
  geteilt?: { si: string; haupt: boolean };
}

export interface Blatt {
  name: string;
  teil: string;
  zellen: Map<string, Zelle>;
  zusammen: { z1: number; s1: number; z2: number; s2: number }[];
  /** Spaltenbreite in Zeichen (Excel-Einheit) je Spalte ab 1 */
  breiten: Map<number, number>;
  hoehen: Map<number, number>;
  zeilen: number;
  spalten: number;
}

export interface Mappe {
  blaetter: Blatt[];
  stile: Stil[];
}

/* ---------- Adressen ---------- */

export function spaltenName(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

export function adresse(r: string): { zeile: number; spalte: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(r.toUpperCase());
  if (!m) throw new Error(`Ungültige Zelladresse: ${r}`);
  const spalte = [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  return { zeile: Number(m[2]), spalte };
}

export const zellName = (zeile: number, spalte: number) => `${spaltenName(spalte)}${zeile}`;

/* ---------- Formate ---------- */

const EINGEBAUTE_FORMATE: Record<number, string> = {
  0: 'General',
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  9: '0%',
  10: '0.00%',
  11: '0.00E+00',
  14: 'dd.mm.yyyy',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  18: 'h:mm AM/PM',
  20: 'h:mm',
  21: 'h:mm:ss',
  22: 'dd.mm.yyyy h:mm',
  49: '@',
};

function istDatumsformat(f: string): boolean {
  // Texte in Anführungszeichen, [Farbe]/[$€] und maskierte Zeichen zählen nicht
  const g = f.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
  if (/^general$/i.test(g)) return false;
  return /[dyh]/i.test(g) || (/m/i.test(g) && !/[0#]/.test(g));
}

const zahlDE = (n: number, stellen?: number) =>
  n.toLocaleString('de-DE', stellen === undefined ? { maximumSignificantDigits: 11, useGrouping: false } : { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

/** Wert wie in Excel anzeigen (vereinfacht: Nachkommastellen, Tausender, Prozent, Datum/Uhrzeit) */
export function formatieren(wert: number, format: string, datum1904 = false): string {
  const f = format.split(';')[0];
  if (istDatumsformat(f)) {
    const ms = Math.round((wert - (datum1904 ? -1462 : 25569)) * 86400000);
    const d = new Date(ms);
    const z = (n: number) => String(n).padStart(2, '0');
    const datum = `${z(d.getUTCDate())}.${z(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
    const zeit = `${z(d.getUTCHours())}:${z(d.getUTCMinutes())}`;
    const hatDatum = /[dy]/i.test(f) || /m{3,}/i.test(f);
    const hatZeit = /h/i.test(f);
    return [hatDatum ? datum : '', hatZeit ? zeit : ''].filter(Boolean).join(' ') || datum;
  }
  if (/%/.test(f)) return `${zahlDE(wert * 100, (/0\.(0+)/.exec(f)?.[1].length ?? 0))} %`;
  const nach = /0\.(0+)/.exec(f)?.[1].length;
  if (/#,##0|0,0/.test(f)) return wert.toLocaleString('de-DE', { minimumFractionDigits: nach ?? 0, maximumFractionDigits: nach ?? 0 });
  if (nach !== undefined || /^0+$/.test(f)) return zahlDE(wert, nach ?? 0);
  return zahlDE(wert);
}

function farbe(el: XmlElement | undefined): string | null {
  const rgb = el?.attr.rgb;
  return rgb && /^[0-9a-f]{8}$/i.test(rgb) ? `#${rgb.slice(2)}` : rgb && /^[0-9a-f]{6}$/i.test(rgb) ? `#${rgb}` : null;
}

function stileLesen(a: Archiv): Stil[] {
  const quelle = teilText(a, 'xl/styles.xml');
  const leer: Stil = { fett: false, kursiv: false, unterstrichen: false, groesse: null, farbe: null, fuellung: null, ausrichtung: null, umbruch: false, rahmen: { l: false, r: false, o: false, u: false }, zahlformat: 'General' };
  if (!quelle) return [leer];
  const w = wurzelVon(xmlLesen(quelle));
  const formate = new Map<number, string>(Object.entries(EINGEBAUTE_FORMATE).map(([k, v]) => [Number(k), v]));
  for (const nf of alleKinder(kind(w, 'numFmts'), 'numFmt')) formate.set(Number(nf.attr.numFmtId), nf.attr.formatCode ?? 'General');
  const fonts = alleKinder(kind(w, 'fonts'), 'font');
  const fills = alleKinder(kind(w, 'fills'), 'fill');
  const borders = alleKinder(kind(w, 'borders'), 'border');
  const linie = (b: XmlElement | undefined, n: string) => !!kind(b, n)?.attr.style && kind(b, n)!.attr.style !== 'none';
  return alleKinder(kind(w, 'cellXfs'), 'xf').map((xf) => {
    const font = fonts[Number(xf.attr.fontId ?? 0)];
    const fill = kind(fills[Number(xf.attr.fillId ?? 0)], 'patternFill');
    const border = borders[Number(xf.attr.borderId ?? 0)];
    const al = kind(xf, 'alignment');
    const h = al?.attr.horizontal;
    const u = kind(font, 'u');
    return {
      fett: !!kind(font, 'b') && kind(font, 'b')!.attr.val !== '0',
      kursiv: !!kind(font, 'i') && kind(font, 'i')!.attr.val !== '0',
      unterstrichen: !!u && u.attr.val !== 'none',
      groesse: kind(font, 'sz') ? Number(kind(font, 'sz')!.attr.val) : null,
      farbe: farbe(kind(font, 'color')),
      fuellung: fill && fill.attr.patternType && fill.attr.patternType !== 'none' ? farbe(kind(fill, 'fgColor')) : null,
      ausrichtung: h === 'center' || h === 'centerContinuous' ? 'center' : h === 'right' ? 'right' : h === 'left' ? 'left' : null,
      umbruch: al?.attr.wrapText === '1' || al?.attr.wrapText === 'true',
      rahmen: { l: linie(border, 'left'), r: linie(border, 'right'), o: linie(border, 'top'), u: linie(border, 'bottom') },
      zahlformat: formate.get(Number(xf.attr.numFmtId ?? 0)) ?? 'General',
    };
  });
}

/* ---------- Lesen ---------- */

interface MappeIntern {
  archiv: Archiv;
  workbookTeil: string;
  datum1904: boolean;
}

function mappeTeile(a: Archiv): MappeIntern & { blaetter: { name: string; teil: string }[] } {
  const rels = beziehungen(a, '');
  const workbookTeil = [...rels.values()].find((r) => r.typ.endsWith('/officeDocument'))?.ziel ?? 'xl/workbook.xml';
  const wb = teilText(a, workbookTeil);
  if (!wb) throw new Error('Keine Excel-Mappe (workbook.xml fehlt)');
  const w = wurzelVon(xmlLesen(wb));
  const wbRels = beziehungen(a, workbookTeil);
  const blaetter = alleKinder(kind(w, 'sheets'), 'sheet')
    .map((s) => ({ name: s.attr.name ?? '', teil: wbRels.get(s.attr['r:id'] ?? '')?.ziel ?? '' }))
    .filter((s) => s.teil && a.has(s.teil));
  const pr = kind(w, 'workbookPr');
  return { archiv: a, workbookTeil, blaetter, datum1904: pr?.attr.date1904 === '1' || pr?.attr.date1904 === 'true' };
}

function geteilteTexte(a: Archiv): string[] {
  const q = teilText(a, 'xl/sharedStrings.xml');
  if (!q) return [];
  return alleKinder(wurzelVon(xmlLesen(q)), 'si').map((si) => nachfahren(si, 't').filter((t) => !istPhonetisch(si, t)).map((t) => t.text).join(''));
}

/** Lautschrift (rPh) gehört nicht zum Text */
const istPhonetisch = (si: XmlElement, t: XmlElement) => alleKinder(si, 'rPh').some((r) => nachfahren(r, 't').includes(t));

/** Hauptzellen geteilter Formeln eines Blatts: Kennung → Formel und Lage */
type GeteilteFormeln = Map<string, { formel: string; zeile: number; spalte: number }>;

function zelleLesen(c: XmlElement, geteilt: string[], stile: Stil[], datum1904: boolean, formeln: GeteilteFormeln): Zelle {
  const r = c.attr.r ?? '';
  const { zeile, spalte } = adresse(r);
  const stil = Number(c.attr.s ?? 0);
  const t = c.attr.t ?? 'n';
  const f = kind(c, 'f');
  const v = kind(c, 'v')?.text ?? '';
  let formel = f && f.text ? f.text : null;
  let teil: Zelle['geteilt'];
  if (f && f.attr.t === 'shared' && f.attr.si !== undefined) {
    const si = f.attr.si;
    if (formel && f.attr.ref) {
      formeln.set(si, { formel, zeile, spalte });
      teil = { si, haupt: true };
    } else {
      const h = formeln.get(si);
      if (h) formel = formelVerschieben(h.formel, zeile - h.zeile, spalte - h.spalte);
      teil = { si, haupt: false };
    }
  }
  let anzeige = '';
  let zahl = false;
  let roh = '';
  let wert: Zelle['wert'] = null;
  if (t === 's') anzeige = roh = wert = geteilt[Number(v)] ?? '';
  else if (t === 'inlineStr') anzeige = roh = wert = nachfahren(kind(c, 'is') ?? c, 't').map((x) => x.text).join('');
  else if (t === 'str') anzeige = roh = wert = v;
  else if (t === 'b') {
    anzeige = roh = v === '1' ? 'WAHR' : 'FALSCH';
    wert = v === '1';
  } else if (t === 'e') anzeige = roh = wert = v;
  else if (v !== '') {
    const n = Number(v);
    zahl = Number.isFinite(n);
    roh = zahl ? zahlDE(n) : v;
    wert = zahl ? n : v;
    anzeige = zahl ? formatieren(n, stile[stil]?.zahlformat ?? 'General', datum1904) : v;
  }
  return { r, zeile, spalte, anzeige, eingabe: formel ? `=${formel}` : roh, formel, stil, zahl, wert, ...(teil ? { geteilt: teil } : {}) };
}

/** Ist das Zahlformat dieses Stils ein Datum? */
export function stilIstDatum(stile: Stil[], stil: number): boolean {
  return istDatumsformat(stile[stil]?.zahlformat ?? 'General');
}

/** Excel-Seriennummer → Datum (UTC-Mitternacht) */
export function excelZuDatum(n: number, datum1904 = false): Date {
  return new Date(Math.round((n - (datum1904 ? -1462 : 25569)) * 86400000));
}

/** Datum (Kalendertag) → Excel-Seriennummer */
export function datumZuExcel(d: Date | string, datum1904 = false): number {
  const t = typeof d === 'string' ? (/^\d{4}-\d{2}-\d{2}/.test(d) ? Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) : NaN) : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  if (!Number.isFinite(t)) throw new Error(`Ungültiges Datum: ${String(d)}`);
  return t / 86400000 + (datum1904 ? -1462 : 25569);
}

export interface GeleseneMappe extends Mappe {
  intern: MappeIntern;
}

export function xlsxLesen(bytes: Uint8Array): GeleseneMappe {
  const teile = mappeTeile(archivLesen(bytes));
  const a = teile.archiv;
  const stile = stileLesen(a);
  const geteilt = geteilteTexte(a);
  const blaetter: Blatt[] = teile.blaetter.map(({ name, teil }) => {
    const w = wurzelVon(xmlLesen(teilText(a, teil)!));
    const zellen = new Map<string, Zelle>();
    const formeln: GeteilteFormeln = new Map();
    let zeilen = 0;
    let spalten = 0;
    const hoehen = new Map<number, number>();
    for (const row of alleKinder(kind(w, 'sheetData'), 'row')) {
      if (row.attr.ht && row.attr.customHeight === '1') hoehen.set(Number(row.attr.r), Number(row.attr.ht));
      for (const c of alleKinder(row, 'c')) {
        if (!c.attr.r) continue;
        const z = zelleLesen(c, geteilt, stile, teile.datum1904, formeln);
        zellen.set(z.r, z);
        zeilen = Math.max(zeilen, z.zeile);
        spalten = Math.max(spalten, z.spalte);
      }
    }
    const zusammen = alleKinder(kind(w, 'mergeCells'), 'mergeCell').flatMap((m) => {
      const [a1, a2] = (m.attr.ref ?? '').split(':');
      if (!a1 || !a2) return [];
      const p = adresse(a1);
      const q = adresse(a2);
      zeilen = Math.max(zeilen, q.zeile);
      spalten = Math.max(spalten, q.spalte);
      return [{ z1: p.zeile, s1: p.spalte, z2: q.zeile, s2: q.spalte }];
    });
    const breiten = new Map<number, number>();
    for (const col of alleKinder(kind(w, 'cols'), 'col')) {
      for (let s = Number(col.attr.min); s <= Number(col.attr.max) && s <= 300; s++) if (col.attr.width) breiten.set(s, Number(col.attr.width));
    }
    return { name, teil, zellen, zusammen, breiten, hoehen, zeilen, spalten };
  });
  return { blaetter, stile, intern: teile };
}

/* ---------- Ändern ---------- */

/**
 * Neuer Inhalt einer Zelle mit Typ – für Programme, die Werte schreiben (statt Eingaben wie in der Zellansicht):
 * Datum als Seriennummer im Datumsformat der Zelle (fehlt es, das Format aus `stilVon`), Zahl, Text, Formel.
 */
export type ZellInhalt =
  | { zahl: number; stilVon?: string; stil?: number }
  | { datum: Date | string; stilVon?: string; stil?: number }
  | { text: string; stilVon?: string; stil?: number }
  | { formel: string; stilVon?: string; stil?: number }
  | { leer: true };

/** Änderungen: Blattnummer → Zelladresse → neue Eingabe (Text, Zahl mit Komma, „=Formel“ oder leer) */
export type Aenderungen = Map<number, Map<string, string>>;
/** wie `Aenderungen`, auch mit Inhalten mit Typ (Datum, Zahl …) */
export type ZellAenderungen = Map<number, Map<string, string | ZellInhalt>>;

const ZAHL = /^[+-]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$|^[+-]?\d*\.\d+$|^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/;

/** Eingabe als Zahl? (deutsch „1.234,5“ oder „1234,5“, auch „1234.5“) */
export function alsZahl(s: string): number | null {
  const t = s.trim();
  if (!ZAHL.test(t)) return null;
  const n = /,/.test(t) || /^\d{1,3}(\.\d{3})+$/.test(t.replace(/^[+-]/, '')) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Zahl so, wie Excel sie speichert (ohne Rundungsrauschen wie 0.30000000000000004) */
const zahlXml = (n: number) => String(Number(n.toPrecision(15)));

/** Zelle als XML; Stil bleibt erhalten */
function zelleXml(r: string, stil: string | undefined, eingabe: string | ZellInhalt, datum1904: boolean, wert?: Wert): string {
  const s = stil ? ` s="${stil}"` : '';
  if (typeof eingabe !== 'string') {
    if ('leer' in eingabe) return `<c r="${r}"${s}/>`;
    if ('zahl' in eingabe) return `<c r="${r}"${s}><v>${zahlXml(eingabe.zahl)}</v></c>`;
    if ('datum' in eingabe) return `<c r="${r}"${s}><v>${zahlXml(datumZuExcel(eingabe.datum, datum1904))}</v></c>`;
    if ('formel' in eingabe) return `<c r="${r}"${s}${typeof wert === 'string' ? ' t="str"' : ''}><f>${verschluesseln(eingabe.formel.replace(/^=/, ''))}</f>${wertXml(wert)}</c>`;
    const raum = /^\s|\s$|\n/.test(eingabe.text) ? ' xml:space="preserve"' : '';
    return eingabe.text === '' ? `<c r="${r}"${s}/>` : `<c r="${r}"${s} t="inlineStr"><is><t${raum}>${verschluesseln(eingabe.text)}</t></is></c>`;
  }
  const t = eingabe;
  if (!t.trim()) return `<c r="${r}"${s}/>`;
  if (t.startsWith('=') && t.length > 1) return `<c r="${r}"${s}${typeof wert === 'string' ? ' t="str"' : ''}><f>${verschluesseln(t.slice(1))}</f>${wertXml(wert)}</c>`;
  const n = alsZahl(t);
  if (n !== null) return `<c r="${r}"${s}><v>${n}</v></c>`;
  const raum = /^\s|\s$|\n/.test(t) ? ' xml:space="preserve"' : '';
  return `<c r="${r}"${s} t="inlineStr"><is><t${raum}>${verschluesseln(t)}</t></is></c>`;
}

const wertXml = (w: Wert | undefined) =>
  w === undefined || w === null ? '' : typeof w === 'number' ? (Number.isFinite(w) ? `<v>${zahlXml(w)}</v>` : '') : typeof w === 'boolean' ? `<v>${w ? 1 : 0}</v>` : `<v>${verschluesseln(w)}</v>`;

/** Stil für eine geänderte Zelle: eigener, sonst der von `stilVon` bzw. ausdrücklich gesetzte */
function stilFuer(eingabe: string | ZellInhalt, eigen: string | undefined, stilVon: (r: string) => string | undefined): string | undefined {
  if (typeof eingabe === 'string' || 'leer' in eingabe) return eigen;
  if (eingabe.stil !== undefined) return String(eingabe.stil);
  if (eingabe.stilVon && (!eigen || ('datum' in eingabe && !eigenIstDatum(eigen)))) return stilVon(eingabe.stilVon) ?? eigen;
  return eigen;
}

/** wird während des Schreibens gesetzt: Zahlformate der Mappe (für „ist der Stil der Zelle ein Datum?“) */
let datumsStile: Set<string> = new Set();
const eigenIstDatum = (s: string) => datumsStile.has(s);

interface BlattKontext {
  datum1904: boolean;
  /** neue Ergebnisse von Formelzellen: Adresse → Wert */
  ergebnisse?: Map<string, Wert>;
}

function blattAendern(quelle: string, aenderungen: Map<string, string | ZellInhalt>, k: BlattKontext): string {
  const w = wurzelVon(xmlLesen(quelle));
  const daten = kind(w, 'sheetData');
  if (!daten) throw new Error('Blatt ohne sheetData');
  const rows = new Map(alleKinder(daten, 'row').map((r) => [Number(r.attr.r), r]));
  const zellenNachAdresse = new Map<string, XmlElement>();
  for (const row of rows.values()) for (const c of alleKinder(row, 'c')) if (c.attr.r) zellenNachAdresse.set(c.attr.r.toUpperCase(), c);
  const stilVon = (r: string) => zellenNachAdresse.get(r.toUpperCase())?.attr.s;
  const ersetzungen: { start: number; ende: number; text: string }[] = [];
  const geaendert = new Set<string>();
  // geteilte Formeln: Wird ihre Hauptzelle geändert, bekommen die übrigen Zellen ihre Formel ausgeschrieben –
  // sonst verwiesen sie auf eine Formel, die es nicht mehr gibt, und Excel meldete die Datei als beschädigt.
  const ausschreiben = new Map<string, string>();
  for (const r of aenderungen.keys()) {
    const c = zellenNachAdresse.get(r.toUpperCase());
    const f = c && kind(c, 'f');
    if (!c || !f || f.attr.t !== 'shared' || !f.attr.ref || !f.text) continue;
    const h = adresse(c.attr.r!);
    for (const andere of zellenNachAdresse.values()) {
      const g = kind(andere, 'f');
      if (andere === c || !g || g.attr.t !== 'shared' || g.attr.si !== f.attr.si || g.text) continue;
      const p = adresse(andere.attr.r!);
      ausschreiben.set(andere.attr.r!.toUpperCase(), formelVerschieben(f.text, p.zeile - h.zeile, p.spalte - h.spalte));
    }
  }
  const alle = new Map<string, string | ZellInhalt>(aenderungen);
  for (const [r, formel] of ausschreiben) if (!alle.has(r)) alle.set(r, { formel });
  // neue Zellen je Zeile sammeln, damit mehrere in derselben Zeile richtig einsortiert werden
  const neueInZeile = new Map<number, { spalte: number; xml: string }[]>();
  for (const [r0, eingabe] of alle) {
    const r = r0.toUpperCase();
    const { zeile, spalte } = adresse(r);
    const row = rows.get(zeile);
    const c = zellenNachAdresse.get(r);
    geaendert.add(r);
    const wert = k.ergebnisse?.get(r);
    if (c) {
      // Formelzelle, deren Formel bleibt (nur ausgeschrieben): bisheriges Ergebnis behalten, wenn kein neues da ist
      const alt = wert === undefined && typeof eingabe !== 'string' && 'formel' in eingabe ? kind(c, 'v')?.text : undefined;
      const xml = zelleXml(r, stilFuer(eingabe, c.attr.s, stilVon), eingabe, k.datum1904, wert ?? (alt !== undefined ? (c.attr.t === 'str' ? alt : Number(alt)) : undefined));
      ersetzungen.push({ start: c.start, ende: c.ende, text: xml });
    } else if (typeof eingabe === 'string' ? eingabe.trim() : !('leer' in eingabe)) {
      const zeilenStil = row?.attr.s && row.attr.customFormat === '1' ? row.attr.s : undefined;
      neueInZeile.set(zeile, [...(neueInZeile.get(zeile) ?? []), { spalte, xml: zelleXml(r, stilFuer(eingabe, zeilenStil, stilVon), eingabe, k.datum1904, wert) }]);
    }
  }
  // zwischengespeicherte Ergebnisse unveränderter Formelzellen auffrischen
  if (k.ergebnisse) {
    for (const [r, wert] of k.ergebnisse) {
      if (geaendert.has(r)) continue;
      const c = zellenNachAdresse.get(r);
      const f = c && kind(c, 'f');
      if (!c || !f) continue;
      const v = kind(c, 'v');
      const alt = v?.text;
      const neuText = typeof wert === 'number' ? zahlXml(wert) : typeof wert === 'boolean' ? (wert ? '1' : '0') : wert === null ? '' : wert;
      if (alt === neuText || (typeof wert === 'number' && alt !== undefined && Math.abs(Number(alt) - wert) < 1e-9 * Math.max(1, Math.abs(wert)))) continue;
      if (typeof wert === 'number' && (c.attr.t ?? 'n') !== 'n') continue;
      if (typeof wert === 'string' && c.attr.t !== 'str') continue;
      if (typeof wert === 'boolean' && c.attr.t !== 'b') continue;
      if (wert === null || !Number.isFinite(typeof wert === 'number' ? wert : 0)) continue;
      if (v) ersetzungen.push({ start: v.start, ende: v.ende, text: `<v>${verschluesseln(neuText)}</v>` });
      else ersetzungen.push({ start: f.ende, ende: f.ende, text: `<v>${verschluesseln(neuText)}</v>` });
    }
  }
  const neueZeilen: { zeile: number; xml: string }[] = [];
  for (const [zeile, neu] of neueInZeile) {
    neu.sort((a, b) => a.spalte - b.spalte);
    const row = rows.get(zeile);
    if (!row) {
      neueZeilen.push({ zeile, xml: `<row r="${zeile}">${neu.map((n) => n.xml).join('')}</row>` });
      continue;
    }
    if (row.innenStart === row.ende) {
      // <row …/>: zu einem Element mit Inhalt machen
      const kopf = quelle.slice(row.start, row.ende - 2).replace(/\s+$/, '');
      ersetzungen.push({ start: row.start, ende: row.ende, text: `${kopf}>${neu.map((n) => n.xml).join('')}</row>` });
      continue;
    }
    const zellen = alleKinder(row, 'c');
    for (const n of neu) {
      const danach = zellen.find((c) => c.attr.r && adresse(c.attr.r).spalte > n.spalte);
      const pos = danach ? danach.start : row.innenEnde;
      ersetzungen.push({ start: pos, ende: pos, text: n.xml });
    }
  }
  if (neueZeilen.length) {
    neueZeilen.sort((a, b) => a.zeile - b.zeile);
    if (daten.innenStart === daten.ende) {
      ersetzungen.push({ start: daten.start, ende: daten.ende, text: `<sheetData>${neueZeilen.map((z) => z.xml).join('')}</sheetData>` });
    } else {
      const vorhanden = alleKinder(daten, 'row');
      for (const z of neueZeilen) {
        const danach = vorhanden.find((r) => Number(r.attr.r) > z.zeile);
        const pos = danach ? danach.start : daten.innenEnde;
        ersetzungen.push({ start: pos, ende: pos, text: z.xml });
      }
    }
  }
  // gleiche Einfügestelle: in der Reihenfolge der Spalten/Zeilen lassen
  return ersetzenStabil(quelle, ersetzungen);
}

/** wie `ersetzen`, aber mehrere Einfügungen an derselben Stelle behalten ihre Reihenfolge */
function ersetzenStabil(quelle: string, liste: { start: number; ende: number; text: string }[]): string {
  const gruppiert = new Map<string, { start: number; ende: number; text: string }>();
  for (const e of liste) {
    const k = `${e.start}:${e.ende}`;
    const da = gruppiert.get(k);
    if (da && e.start === e.ende) da.text += e.text;
    else gruppiert.set(k, { ...e });
  }
  return ersetzen(quelle, [...gruppiert.values()]);
}

/** Excel beim nächsten Öffnen alles neu berechnen lassen (Formeln, die von geänderten Zellen abhängen) */
function neuBerechnen(wb: string): string {
  const w = wurzelVon(xmlLesen(wb));
  const calc = kind(w, 'calcPr');
  if (calc) {
    if (calc.attr.fullCalcOnLoad === '1') return wb;
    const kopf = wb.slice(calc.start, calc.innenStart);
    const neu = /\bfullCalcOnLoad="[^"]*"/.test(kopf) ? kopf.replace(/\bfullCalcOnLoad="[^"]*"/, 'fullCalcOnLoad="1"') : kopf.replace(/^<calcPr/, '<calcPr fullCalcOnLoad="1"');
    return wb.slice(0, calc.start) + neu + wb.slice(calc.innenStart);
  }
  const NACH = ['oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'];
  const vor = w.kinder.find((k) => NACH.includes(k.name));
  const pos = vor ? vor.start : w.innenEnde;
  return `${wb.slice(0, pos)}<calcPr fullCalcOnLoad="1"/>${wb.slice(pos)}`;
}

export interface AendernOptionen {
  /**
   * Formeln der ganzen Mappe nachrechnen und ihre zwischengespeicherten Ergebnisse auffrischen (auch über
   * Blätter hinweg), damit die Datei überall die neuen Summen zeigt. Excel rechnet beim Öffnen trotzdem neu.
   */
  ergebnisseAuffrischen?: boolean;
  /** „heute“ für TODAY() beim Nachrechnen */
  heute?: Date;
}

/** Werte einer gelesenen Mappe für das Nachrechnen der Formeln */
export function rechenMappe(m: Mappe): RechenMappe {
  const out: RechenMappe = new Map();
  for (const b of m.blaetter) {
    const zellen = new Map<string, { wert: Wert; formel: string | null }>();
    for (const z of b.zellen.values()) zellen.set(`${z.zeile}:${z.spalte}`, { wert: z.wert, formel: z.formel });
    out.set(b.name, zellen);
  }
  return out;
}

/** Neue Fassung der Datei mit den geänderten Zellen */
export function xlsxAendern(bytes: Uint8Array, aenderungen: ZellAenderungen, optionen: AendernOptionen = {}): Uint8Array {
  const teile = mappeTeile(archivLesen(bytes));
  const a = teile.archiv;
  const stile = stileLesen(a);
  datumsStile = new Set(stile.map((st, i) => (istDatumsformat(st.zahlformat) ? String(i) : '')).filter(Boolean));
  let ergebnisse: Map<string, Map<string, Wert>> | null = null;
  if (optionen.ergebnisseAuffrischen) ergebnisse = neueErgebnisse(bytes, aenderungen, teile.datum1904, optionen.heute);
  for (let nr = 0; nr < teile.blaetter.length; nr++) {
    const zellen = aenderungen.get(nr) ?? new Map<string, string | ZellInhalt>();
    const blatt = teile.blaetter[nr];
    const erg = ergebnisse?.get(blatt.name);
    if (!zellen.size && !erg?.size) continue;
    a.set(blatt.teil, textTeil(blattAendern(teilText(a, blatt.teil)!, zellen, { datum1904: teile.datum1904, ergebnisse: erg })));
  }
  for (const nr of aenderungen.keys()) if (!teile.blaetter[nr]) throw new Error(`Blatt ${nr + 1} gibt es nicht`);
  a.set(teile.workbookTeil, textTeil(neuBerechnen(teilText(a, teile.workbookTeil)!)));
  // zwischengespeicherte Rechenkette verweist auf alte Zellen – Excel baut sie neu auf
  a.delete('xl/calcChain.xml');
  const ct = teilText(a, '[Content_Types].xml');
  if (ct) a.set('[Content_Types].xml', textTeil(ct.replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, '')));
  const wbRels = `xl/_rels/${teile.workbookTeil.split('/').pop()}.rels`;
  const rels = teilText(a, wbRels);
  if (rels) a.set(wbRels, textTeil(rels.replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/, '')));
  return archivSchreiben(a);
}

/** Ergebnisse aller Formeln nach den Änderungen: Blattname → Adresse → Wert */
function neueErgebnisse(bytes: Uint8Array, aenderungen: ZellAenderungen, datum1904: boolean, heute?: Date): Map<string, Map<string, Wert>> {
  const m = xlsxLesen(bytes);
  const rm = rechenMappe(m);
  for (const [nr, zellen] of aenderungen) {
    const b = m.blaetter[nr];
    if (!b) continue;
    const ziel = rm.get(b.name)!;
    for (const [r, e] of zellen) {
      const { zeile, spalte } = adresse(r);
      const k = `${zeile}:${spalte}`;
      if (typeof e === 'string') {
        const t = e.trim();
        if (!t) ziel.delete(k);
        else if (t.startsWith('=')) ziel.set(k, { wert: null, formel: t.slice(1) });
        else ziel.set(k, { wert: alsZahl(t) ?? e, formel: null });
      } else if ('leer' in e) ziel.delete(k);
      else if ('zahl' in e) ziel.set(k, { wert: e.zahl, formel: null });
      else if ('datum' in e) ziel.set(k, { wert: datumZuExcel(e.datum, datum1904), formel: null });
      else if ('text' in e) ziel.set(k, { wert: e.text, formel: null });
      else ziel.set(k, { wert: null, formel: e.formel.replace(/^=/, '') });
    }
  }
  const roh = mappeBerechnen(rm, heute);
  const out = new Map<string, Map<string, Wert>>();
  for (const [blatt, werte] of roh) {
    const m2 = new Map<string, Wert>();
    for (const [k, v] of werte) {
      const [z, s] = k.split(':').map(Number);
      m2.set(zellName(z, s), v);
    }
    out.set(blatt, m2);
  }
  return out;
}
