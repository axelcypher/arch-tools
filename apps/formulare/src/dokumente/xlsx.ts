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

function zelleLesen(c: XmlElement, geteilt: string[], stile: Stil[], datum1904: boolean): Zelle {
  const r = c.attr.r ?? '';
  const { zeile, spalte } = adresse(r);
  const stil = Number(c.attr.s ?? 0);
  const t = c.attr.t ?? 'n';
  const f = kind(c, 'f');
  const v = kind(c, 'v')?.text ?? '';
  const formel = f && f.text ? f.text : null;
  let anzeige = '';
  let zahl = false;
  let roh = '';
  if (t === 's') anzeige = roh = geteilt[Number(v)] ?? '';
  else if (t === 'inlineStr') anzeige = roh = nachfahren(kind(c, 'is') ?? c, 't').map((x) => x.text).join('');
  else if (t === 'str') anzeige = roh = v;
  else if (t === 'b') anzeige = roh = v === '1' ? 'WAHR' : 'FALSCH';
  else if (t === 'e') anzeige = roh = v;
  else if (v !== '') {
    const n = Number(v);
    zahl = Number.isFinite(n);
    roh = zahl ? zahlDE(n) : v;
    anzeige = zahl ? formatieren(n, stile[stil]?.zahlformat ?? 'General', datum1904) : v;
  }
  return { r, zeile, spalte, anzeige, eingabe: formel ? `=${formel}` : roh, formel, stil, zahl };
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
    let zeilen = 0;
    let spalten = 0;
    const hoehen = new Map<number, number>();
    for (const row of alleKinder(kind(w, 'sheetData'), 'row')) {
      if (row.attr.ht && row.attr.customHeight === '1') hoehen.set(Number(row.attr.r), Number(row.attr.ht));
      for (const c of alleKinder(row, 'c')) {
        if (!c.attr.r) continue;
        const z = zelleLesen(c, geteilt, stile, teile.datum1904);
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

/** Änderungen: Blattnummer → Zelladresse → neue Eingabe (Text, Zahl mit Komma, „=Formel“ oder leer) */
export type Aenderungen = Map<number, Map<string, string>>;

const ZAHL = /^[+-]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$|^[+-]?\d*\.\d+$|^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/;

/** Eingabe als Zahl? (deutsch „1.234,5“ oder „1234,5“, auch „1234.5“) */
export function alsZahl(s: string): number | null {
  const t = s.trim();
  if (!ZAHL.test(t)) return null;
  const n = /,/.test(t) || /^\d{1,3}(\.\d{3})+$/.test(t.replace(/^[+-]/, '')) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Zelle als XML; Stil bleibt erhalten */
function zelleXml(r: string, stil: string | undefined, eingabe: string): string {
  const s = stil ? ` s="${stil}"` : '';
  const t = eingabe;
  if (!t.trim()) return `<c r="${r}"${s}/>`;
  if (t.startsWith('=') && t.length > 1) return `<c r="${r}"${s}><f>${verschluesseln(t.slice(1))}</f></c>`;
  const n = alsZahl(t);
  if (n !== null) return `<c r="${r}"${s}><v>${n}</v></c>`;
  const raum = /^\s|\s$|\n/.test(t) ? ' xml:space="preserve"' : '';
  return `<c r="${r}"${s} t="inlineStr"><is><t${raum}>${verschluesseln(t)}</t></is></c>`;
}

function blattAendern(quelle: string, aenderungen: Map<string, string>): string {
  const w = wurzelVon(xmlLesen(quelle));
  const daten = kind(w, 'sheetData');
  if (!daten) throw new Error('Blatt ohne sheetData');
  const rows = new Map(alleKinder(daten, 'row').map((r) => [Number(r.attr.r), r]));
  const ersetzungen: { start: number; ende: number; text: string }[] = [];
  // neue Zellen je Zeile sammeln, damit mehrere in derselben Zeile richtig einsortiert werden
  const neueInZeile = new Map<number, { spalte: number; xml: string }[]>();
  for (const [r, eingabe] of aenderungen) {
    const { zeile, spalte } = adresse(r);
    const row = rows.get(zeile);
    const c = row && alleKinder(row, 'c').find((x) => x.attr.r?.toUpperCase() === r.toUpperCase());
    if (c) ersetzungen.push({ start: c.start, ende: c.ende, text: zelleXml(r, c.attr.s, eingabe) });
    else if (eingabe.trim()) neueInZeile.set(zeile, [...(neueInZeile.get(zeile) ?? []), { spalte, xml: zelleXml(r, row?.attr.s && row.attr.customFormat === '1' ? row.attr.s : undefined, eingabe) }]);
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

/** Neue Fassung der Datei mit den geänderten Zellen */
export function xlsxAendern(bytes: Uint8Array, aenderungen: Aenderungen): Uint8Array {
  const teile = mappeTeile(archivLesen(bytes));
  const a = teile.archiv;
  for (const [nr, zellen] of aenderungen) {
    if (!zellen.size) continue;
    const blatt = teile.blaetter[nr];
    if (!blatt) throw new Error(`Blatt ${nr + 1} gibt es nicht`);
    a.set(blatt.teil, textTeil(blattAendern(teilText(a, blatt.teil)!, zellen)));
  }
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
