/**
 * Projektkarte eines FORMA-Projekts (`sj_prokarte.sdb`, SQLite, Texte in UTF-8): Projektdaten, Beteiligte,
 * Grundstück … in Gruppen (Tabelle `Gruppe`) mit Einträgen (Tabelle `Inhalte`). Gelesen und geschrieben wird
 * über die Tauri-Hülle; hier steht, was daraus folgt.
 *
 * Jede Formularseite enthält eine versteckte Liste `lstbxProkarte`, die Textfeldern Einträge zuordnet, z. B.
 *   Memo7=K0201aedt040;0201aedt030          → „Name, Vorname“ des Bauherrn
 *   Memo2=…;K0201aedt070;"Postfach ";K0201aedt080;…
 * Teile sind durch „;“ getrennt: `<Trenner><Gruppe 4-stellig><Art><Eintrag 3-stellig>` oder ein Text in
 * Anführungszeichen. Die Trenner stehen hinter einem gefüllten Wert: K = „, “, L = Leerzeichen, R = neue Zeile.
 * Ein Text erscheint nur, wenn der Wert danach gefüllt ist („Postfach “ nur mit Postfach).
 */

import type { Objekt } from './dfm';
import { eigenschaft, finde } from './dfm';
import type { Seite } from './formular';

export interface PkGruppe {
  id: number;
  typ: number;
  text: string;
}

export interface PkEintrag {
  gruppe: number;
  id: number;
  /** 1 Text, 2 mehrzeilig, 4 Auswahlliste, 8 Optionen, 16 Kästchen */
  typ: number;
  titel: string;
  /** Text (1/2), die Möglichkeiten zeilenweise (4/8) bzw. die Beschriftung des Kästchens (16) */
  text: string;
  /** gewählte Möglichkeit wie in der Datei (4: ohne die leere erste Zeile, 8: ab 0; null oder −1 = keine) bzw. angekreuzt (16: 1) */
  zahl: number | null;
}

export interface Projektkarte {
  gruppen: PkGruppe[];
  eintraege: PkEintrag[];
}

export const pkSchluessel = (gruppe: number, id: number) => `${gruppe}:${id}`;

/**
 * Art eines Eintrags. Auswahllisten (4) beginnen mit einer leeren Zeile – „nichts gewählt“ –, die bei der Nummer
 * der Wahl in der Datei **nicht** mitzählt: `Ganzzahl` 0 ist die erste Möglichkeit danach, −1 die leere Zeile (wie
 * SJ Office sie liest). Optionen (8) haben keine leere Zeile und zählen ab 0.
 */
export type PkArt = 'text' | 'mehrzeilig' | 'auswahl' | 'optionen' | 'kreuz';

export function pkArt(e: Pick<PkEintrag, 'typ'>): PkArt {
  switch (e.typ) {
    case 2:
      return 'mehrzeilig';
    case 4:
      return 'auswahl';
    case 8:
      return 'optionen';
    case 16:
      return 'kreuz';
    default:
      return 'text';
  }
}

export const istWahl = (e: Pick<PkEintrag, 'typ'>) => ['auswahl', 'optionen', 'kreuz'].includes(pkArt(e));

/** Möglichkeiten einer Auswahl in der gespeicherten Reihenfolge (bei Auswahllisten mit der leeren ersten) */
export const pkMoeglichkeiten = (e: PkEintrag) => (istWahl(e) && pkArt(e) !== 'kreuz' ? e.text.split(/\r\n|\r|\n/) : []);

/**
 * Wert eines Eintrags für die Oberfläche: Text mit \n als Zeilenumbruch, bei Auswahl die Nummer der gewählten
 * Möglichkeit in `pkMoeglichkeiten` (null = keine), bei Kästchen 1 oder 0.
 */
export type PkWert = string | number | null;

/** Auswahlliste mit leerer erster Zeile: In der Datei zählt sie nicht mit (Ganzzahl = Nummer in der Liste − 1) */
const versatz = (e: Pick<PkEintrag, 'typ' | 'text'>) => (pkArt(e) === 'auswahl' && /^(\r\n|\r|\n)/.test(e.text) ? 1 : 0);

export function pkWertVon(e: PkEintrag): PkWert {
  if (!istWahl(e)) return e.text.replace(/\r\n?/g, '\n');
  if (pkArt(e) === 'kreuz') return e.zahl === 1 ? 1 : 0;
  return e.zahl === null || e.zahl < 0 ? null : e.zahl + versatz(e);
}

/** Gegenstück zu `pkWertVon` für Auswahl und Optionen: die Ganzzahl der Datei (null bleibt null, die leere Zeile −1) */
export function pkZahlAus(e: Pick<PkEintrag, 'typ' | 'text'>, wert: PkWert): number | null {
  if (typeof wert !== 'number') return null;
  if (pkArt(e) === 'kreuz') return wert;
  const z = wert - versatz(e);
  return z < 0 ? -1 : z;
}

/** Text eines Werts – so erscheint er in Formularen und Übersichten */
export function pkAnzeige(e: PkEintrag, wert: PkWert): string {
  switch (pkArt(e)) {
    case 'kreuz':
      return wert === 1 ? e.text : '';
    case 'auswahl':
    case 'optionen':
      return typeof wert === 'number' ? (pkMoeglichkeiten(e)[wert] ?? '') : '';
    default:
      return typeof wert === 'string' ? wert : '';
  }
}

/** Passt der Wert zur Art des Eintrags? (für gemerkte Werte und Entwürfe) */
export function pkWertPasst(e: PkEintrag, wert: unknown): wert is PkWert {
  if (!istWahl(e)) return typeof wert === 'string';
  if (pkArt(e) === 'kreuz') return wert === 0 || wert === 1;
  return wert === null || (typeof wert === 'number' && Number.isInteger(wert) && wert >= 0 && wert < pkMoeglichkeiten(e).length);
}

export const pkEintrag = (pk: Projektkarte, gruppe: number, id: number) => pk.eintraege.find((e) => e.gruppe === gruppe && e.id === id);

/** Angezeigter Wert eines Eintrags (leer, wenn es ihn nicht gibt) */
export function pkWert(pk: Projektkarte, gruppe: number, id: number): string {
  const e = pkEintrag(pk, gruppe, id);
  return e ? pkAnzeige(e, pkWertVon(e)) : '';
}

/** Titel ohne Doppelpunkt am Ende („Name/Firma:“ → „Name/Firma“) */
export const pkTitel = (titel: string) => titel.replace(/\s*:\s*$/, '');

/* ---------- Zuordnung Feld → Projektkarte ---------- */

/**
 * Teil einer Zuordnung: ein Eintrag der Projektkarte (mit Trenner danach) oder fester Text. `auszug` (nur von der
 * App gesetzt, nie in FORMA-Dateien) nimmt aus „Straße Nr.“ nur die Straße bzw. nur die Hausnummer.
 */
export type Teil = { art: 'eintrag'; gruppe: number; id: number; trenner: string; auszug?: 'strasse' | 'hausnummer' } | { art: 'text'; text: string };

/** „Musterweg 12 a“ → Straße „Musterweg“, Hausnummer „12 a“; ohne erkennbare Nummer alles Straße */
export function strasseUndNummer(text: string): { strasse: string; hausnummer: string } {
  const t = text.trim();
  const m = /^(.*?\D)\s*(\d+\s*[a-zA-Z]?(?:\s*[-–/]\s*\d+\s*[a-zA-Z]?)?)$/.exec(t);
  return m ? { strasse: m[1].trim().replace(/,$/, ''), hausnummer: m[2].replace(/\s+/g, ' ').trim() } : { strasse: t, hausnummer: '' };
}

const TRENNER: Record<string, string> = { K: ', ', L: ' ', R: '\n' };

/** Zerlegt die Zuordnung eines Felds (Teil hinter „=“) */
export function teileAus(def: string): Teil[] {
  const out: Teil[] = [];
  for (const roh of def.split(';')) {
    // in den FORMA-Dateien kommen vereinzelt Steuerzeichen und Leerzeichen am Rand vor
    const t = roh.replace(/[\x00-\x1f]/g, '').trim();
    if (!t) continue;
    const text = /^"(.*)"$/.exec(t);
    if (text) {
      out.push({ art: 'text', text: text[1] });
      continue;
    }
    const m = /^([A-Z]*)(\d{4})[a-z]+(\d{3})$/.exec(t);
    if (!m) continue;
    const trenner = [...m[1]].map((c) => TRENNER[c] ?? '').join('').replace(/ +\n/g, '\n');
    out.push({ art: 'eintrag', gruppe: Number(m[2]), id: Number(m[3]), trenner });
  }
  return out;
}

/** Einträge der versteckten Liste `lstbxProkarte` einer Seite: Feldname → Teile */
export function zuordnungen(seite: Seite): Map<string, Teil[]> {
  const out = new Map<string, Teil[]>();
  const liste: Objekt | undefined = finde(seite.form, 'lstbxProkarte');
  const w = liste && eigenschaft(liste, 'Items.Strings')?.wert;
  if (w?.art !== 'liste') return out;
  for (const e of w.werte) {
    if (e.art !== 'text') continue;
    const i = e.text.indexOf('=');
    if (i <= 0) continue;
    const teile = teileAus(e.text.slice(i + 1));
    if (teile.some((t) => t.art === 'eintrag')) out.set(e.text.slice(0, i).trim(), teile);
  }
  return out;
}

/** Text eines Felds aus der Projektkarte; Trenner am Ende entfallen, einzeilige Felder ohne Zeilenumbruch */
export function ausfuellen(teile: Teil[], wert: (gruppe: number, id: number) => string, einzeilig = false): string {
  let out = '';
  let davor = '';
  for (const t of teile) {
    if (t.art === 'text') {
      davor += t.text;
      continue;
    }
    let v = wert(t.gruppe, t.id).replace(/\r\n?/g, '\n').trim();
    if (t.auszug) v = strasseUndNummer(v.replace(/\s*\n\s*/g, ' '))[t.auszug];
    if (v) out += davor + v + t.trenner;
    davor = '';
  }
  out = out.replace(/[\s,;]+$/, '');
  return einzeilig ? out.replace(/\s*\n\s*/g, ' ') : out;
}

/** Einträge, die die Zuordnung verwendet (für den Hinweis, woher ein Feld seinen Wert bekommt) */
export const verwendeteEintraege = (teile: Teil[]) => teile.filter((t): t is Extract<Teil, { art: 'eintrag' }> => t.art === 'eintrag');
