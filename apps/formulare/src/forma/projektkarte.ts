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
  /** 1 Zeile, 2 mehrzeilig, 4 Auswahl, 8/16 weitere Arten aus FORMA */
  typ: number;
  titel: string;
  text: string;
}

export interface Projektkarte {
  gruppen: PkGruppe[];
  eintraege: PkEintrag[];
}

export const pkSchluessel = (gruppe: number, id: number) => `${gruppe}:${id}`;

/** Wert eines Eintrags (leer, wenn es ihn nicht gibt) */
export function pkWert(pk: Projektkarte, gruppe: number, id: number): string {
  return pk.eintraege.find((e) => e.gruppe === gruppe && e.id === id)?.text ?? '';
}

/** Titel ohne den Doppelpunkt am Ende („Name/Firma:“ → „Name/Firma“) */
export const pkTitel = (titel: string) => titel.replace(/\s*:\s*$/, '');

/* ---------- Zuordnung Feld → Projektkarte ---------- */

export type Teil = { art: 'eintrag'; gruppe: number; id: number; trenner: string } | { art: 'text'; text: string };

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
    const v = wert(t.gruppe, t.id).replace(/\r\n?/g, '\n').trim();
    if (v) out += davor + v + t.trenner;
    davor = '';
  }
  out = out.replace(/[\s,;]+$/, '');
  return einzeilig ? out.replace(/\s*\n\s*/g, ' ') : out;
}

/** Einträge, die die Zuordnung verwendet (für den Hinweis, woher ein Feld seinen Wert bekommt) */
export const verwendeteEintraege = (teile: Teil[]) => teile.filter((t): t is Extract<Teil, { art: 'eintrag' }> => t.art === 'eintrag');
