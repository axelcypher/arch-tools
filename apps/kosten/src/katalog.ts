import type { KostenBezug, KostenPosition, KostenStufe } from '@core/model';
import { KOSTEN_BEZUEGE, newId } from '@core/model';
import { istRisiko, kgName, standardBezug } from './din276';
import { MENGEN_INFO } from './mengen';

/**
 * Kennwertkatalog: eigene, austauschbare Datei (JSON oder CSV) mit Quelle und Stand. Die Werte sind
 * Eingaben des Büros (eigene Projekte, Kennwertsammlungen, Literatur) – das Tool rechnet nur transparent damit.
 * Der zuletzt geladene Katalog bleibt im Browser hinterlegt; übernommene Kennwerte stehen im Projekt.
 */

export interface KatalogEintrag {
  kg: string;
  bezeichnung: string;
  bezug: KostenBezug;
  einheit?: string;
  basis?: string[];
  von?: number;
  mittel?: number;
  bis?: number;
  bemerkung?: string;
}

export interface Katalog {
  name: string;
  quelle?: string;
  /** Preisstand, z. B. „1. Quartal 2026“ */
  stand?: string;
  /** Baupreisindex zum Preisstand der Kennwerte */
  index?: number;
  eintraege: KatalogEintrag[];
}

const KEY = 'kostenermittlung:katalog';

export function gespeicherterKatalog(): Katalog | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? leseJson(raw) : null;
  } catch {
    return null;
  }
}

export function katalogSpeichern(k: Katalog | null): boolean {
  try {
    if (k) localStorage.setItem(KEY, JSON.stringify(k));
    else localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

/* ---------- Lesen ---------- */

/**
 * Zahl aus einer Zelle, je Zelle erkannt: Stehen Punkt und Komma darin, ist das zuletzt stehende das Dezimalzeichen
 * („1.800,50“, „1,800.50“). Steht nur eines darin, ist es das Dezimalzeichen – außer es trennt genau Dreiergruppen
 * („1.800“, „1,800“); dann entscheidet die Datei: in einer CSV mit Komma als Trennzeichen (dezimalpunkt) gilt das
 * Komma als Tausendertrenner, sonst der Punkt.
 */
const zahl = (v: unknown, dezimalpunkt = false): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string' || !v.trim()) return undefined;
  let t = v.trim().replace(/\s|€|%/g, '');
  const punkt = t.lastIndexOf('.');
  const komma = t.lastIndexOf(',');
  if (punkt >= 0 && komma >= 0) t = punkt > komma ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.');
  else if (komma >= 0) t = dezimalpunkt && /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  else if (punkt >= 0 && !dezimalpunkt && /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/** Bezug aus Kürzel (BGF, AWF, psch, %) oder interner Bezeichnung; sonst eigene Menge mit dieser Einheit */
function bezugAus(text: string, kg: string): { bezug: KostenBezug; einheit?: string } {
  const t = text.trim();
  if (!t) return { bezug: standardBezug(kg).bezug };
  const l = t.toLowerCase();
  if (KOSTEN_BEZUEGE.includes(l as KostenBezug)) return { bezug: l as KostenBezug };
  if (l === '%' || l === 'prozent') return { bezug: 'prozent' };
  if (l === 'psch' || l === 'pauschal' || l === 'pausch.') return { bezug: 'pauschal' };
  const kurz = Object.entries(MENGEN_INFO).find(([, v]) => v.kurz.toLowerCase() === l.replace(/^m[²³]\s*/, ''));
  if (kurz) return { bezug: kurz[0] as KostenBezug };
  return { bezug: 'menge', einheit: t };
}

function eintragAus(o: Record<string, unknown>, dezimalpunkt = false): KatalogEintrag | null {
  const kg = String(o.kg ?? '').trim();
  if (!/^[1-8]\d\d$/.test(kg) && !istRisiko(kg)) return null;
  const b = typeof o.bezug === 'string' ? bezugAus(o.bezug, kg) : { bezug: standardBezug(kg).bezug };
  const e: KatalogEintrag = { kg, bezeichnung: String(o.bezeichnung ?? '').trim() || kgName(kg), ...b };
  if (typeof o.einheit === 'string' && o.einheit.trim()) e.einheit = o.einheit.trim();
  const basis = Array.isArray(o.basis) ? o.basis.map(String) : typeof o.basis === 'string' ? o.basis.split(/[\s,+;]+/) : [];
  if (e.bezug === 'prozent') e.basis = basis.filter((x) => /^[1-8]\d\d$/.test(x)).length ? basis.filter((x) => /^[1-8]\d\d$/.test(x)) : (standardBezug(kg).basis ?? ['300', '400']);
  for (const f of ['von', 'mittel', 'bis'] as const) {
    const n = zahl(o[f], dezimalpunkt);
    if (n !== undefined) e[f] = n;
  }
  if (typeof o.bemerkung === 'string' && o.bemerkung.trim()) e.bemerkung = o.bemerkung.trim();
  return e;
}

const KEIN_KATALOG = 'Die Datei ist kein gültiger Kennwertkatalog (JSON)';

function leseJson(text: string): Katalog {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch (err) {
    throw new Error(`${KEIN_KATALOG}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!roh || typeof roh !== 'object') throw new Error(`${KEIN_KATALOG} – erwartet wird ein Objekt mit „eintraege“ oder eine Liste von Einträgen.`);
  const o = roh as Record<string, unknown>;
  const index = zahl(o.index);
  const list = Array.isArray(o) ? o : Array.isArray(o.eintraege) ? o.eintraege : [];
  const eintraege = (list as unknown[])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => eintragAus(x))
    .filter((x): x is KatalogEintrag => x !== null);
  return {
    name: typeof o.name === 'string' && o.name ? o.name : 'Kennwertkatalog',
    ...(typeof o.quelle === 'string' && o.quelle ? { quelle: o.quelle } : {}),
    ...(typeof o.stand === 'string' && o.stand ? { stand: o.stand } : {}),
    ...(index !== undefined ? { index } : {}),
    eintraege,
  };
}

const CSV_SPALTEN = ['KG', 'Bezeichnung', 'Bezug', 'Grundlage', 'von', 'Mittel', 'bis', 'Bemerkung'];

/** Trennzeichen der CSV: Semikolon (Excel, deutsch), sonst Komma – nach der ersten Zeile ohne „#“ */
const csvTrenner = (text: string) => ((text.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '').includes(';') ? ';' : ',');

function csvZeilen(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * CSV (Excel, Semikolon, Dezimalkomma): Kopfzeilen „# Name: …“, „# Quelle: …“, „# Stand: …“, „# Index: …“,
 * dann die Spalten KG; Bezeichnung; Bezug; Grundlage; von; Mittel; bis; Bemerkung. Mit Komma als Trennzeichen
 * gilt der Punkt als Dezimalzeichen.
 */
function leseCsv(text: string, dateiname: string): Katalog {
  const k: Katalog = { name: dateiname.replace(/\.[^.]+$/, ''), eintraege: [] };
  let kopf: string[] | null = null;
  const inhalt = text.replace(/^﻿/, '');
  const sep = csvTrenner(inhalt);
  const dezimalpunkt = sep === ',';
  for (const r of csvZeilen(inhalt, sep)) {
    const erste = (r[0] ?? '').trim();
    const meta = /^#\s*(name|quelle|stand|index)\s*:\s*(.*)$/i.exec(r.join(';').trim());
    if (meta) {
      const wert = meta[2].replace(/;+$/, '').trim();
      const f = meta[1].toLowerCase();
      if (f === 'index') k.index = zahl(wert, dezimalpunkt);
      else if (wert) (k as unknown as Record<string, string>)[f] = wert;
      continue;
    }
    if (!erste || erste.startsWith('#')) continue;
    if (!kopf && /^kg$/i.test(erste)) {
      kopf = r.map((x) => x.trim().toLowerCase());
      continue;
    }
    const spalten = kopf ?? CSV_SPALTEN.map((x) => x.toLowerCase());
    const o: Record<string, unknown> = {};
    spalten.forEach((s, i) => {
      const key = s === 'grundlage' ? 'basis' : s;
      o[key] = r[i] ?? '';
    });
    const e = eintragAus(o, dezimalpunkt);
    if (e) k.eintraege.push(e);
  }
  return k;
}

export function leseKatalog(text: string, dateiname: string): Katalog {
  const k = /\.json$/i.test(dateiname) || text.trim().startsWith('{') || text.trim().startsWith('[') ? leseJson(text) : leseCsv(text, dateiname);
  if (!k.eintraege.length) throw new Error('Keine Einträge gefunden. Erwartet wird JSON oder CSV mit den Spalten KG; Bezeichnung; Bezug; Grundlage; von; Mittel; bis.');
  return k;
}

/* ---------- Schreiben ---------- */

const csvZelle = (v: string | number | undefined) => {
  if (v === undefined) return '';
  const s = typeof v === 'number' ? v.toLocaleString('de-DE', { useGrouping: false, maximumFractionDigits: 4 }) : v;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function bezugText(e: KatalogEintrag): string {
  if (e.bezug === 'menge') return e.einheit ?? 'Stk';
  if (e.bezug === 'pauschal') return 'psch';
  if (e.bezug === 'prozent') return '%';
  return MENGEN_INFO[e.bezug].kurz;
}

export function katalogCsv(k: Katalog): string {
  const zeilen = [
    `# Name: ${k.name}`,
    `# Quelle: ${k.quelle ?? ''}`,
    `# Stand: ${k.stand ?? ''}`,
    `# Index: ${k.index !== undefined ? k.index.toLocaleString('de-DE') : ''}`,
    CSV_SPALTEN.join(';'),
    ...k.eintraege.map((e) => [e.kg, e.bezeichnung, bezugText(e), e.basis?.join('+') ?? '', e.von, e.mittel, e.bis, e.bemerkung].map(csvZelle).join(';')),
  ];
  return `﻿${zeilen.join('\r\n')}\r\n`;
}

export const katalogJson = (k: Katalog) => JSON.stringify(k, null, 2);

/* ---------- Übernahme ---------- */

export function positionAusEintrag(e: KatalogEintrag, k: Pick<Katalog, 'name' | 'stand'>): KostenPosition {
  const p: KostenPosition = { id: newId('kp'), kg: e.kg, bezeichnung: e.bezeichnung, bezug: e.bezug };
  if (e.bezug === 'menge') p.einheit = e.einheit ?? 'Stk';
  if (e.basis) p.basis = [...e.basis];
  for (const f of ['von', 'mittel', 'bis'] as const) if (e[f] !== undefined) p[f] = e[f];
  p.quelle = [k.name, k.stand].filter(Boolean).join(', ');
  if (e.bemerkung) p.bemerkung = e.bemerkung;
  return p;
}

export function eintragAusPosition(p: KostenPosition): KatalogEintrag {
  const e: KatalogEintrag = { kg: p.kg, bezeichnung: p.bezeichnung, bezug: p.bezug };
  if (p.bezug === 'menge') e.einheit = p.einheit ?? 'Stk';
  if (p.basis) e.basis = [...p.basis];
  for (const f of ['von', 'mittel', 'bis'] as const) if (p[f] !== undefined) e[f] = p[f];
  if (p.bemerkung) e.bemerkung = p.bemerkung;
  return e;
}

/* ---------- Gliederungen ---------- */

const GLIEDERUNG: Record<'grob' | 'fein', string[]> = {
  // Kostenrahmen: 1. Ebene
  grob: ['300', '400', '500', '700'],
  // ab der Kostenschätzung: 2. Ebene für das Bauwerk
  fein: ['310', '320', '330', '340', '350', '360', '390', '410', '420', '430', '440', '450', '460', '480', '500', '700'],
};

/**
 * Gliederungstiefe je Stufe: DIN 276:2018-12 verlangt für die Kostenschätzung die 2., für die Kostenberechnung die
 * 3. Ebene; HOAI § 2 Abs. 10/11 (mit Bezug auf DIN 276:2008-12) die 1. bzw. 2. Ebene. Vorgeschlagen wird deshalb
 * die 1. Ebene nur für den Kostenrahmen, ab der Kostenschätzung die 2. Ebene (die 3. Ebene ist frei eintragbar).
 */
export const gliederungFuer = (stufe: KostenStufe | undefined) => (stufe === 'rahmen' ? 'grob' : 'fein');

/** leere Positionen (ohne Kennwerte) mit der üblichen Bezugsgröße je Kostengruppe */
export function gliederung(art: 'grob' | 'fein'): KostenPosition[] {
  return GLIEDERUNG[art].map((kg) => {
    const b = standardBezug(kg);
    return { id: newId('kp'), kg, bezeichnung: kgName(kg), bezug: b.bezug, ...(b.basis ? { basis: b.basis } : {}) };
  });
}
