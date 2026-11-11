/**
 * Projektnummern und Namensschemata. Platzhalter in einfachen geschweiften Klammern:
 *   {jahr} 2026 · {jj} 26 · {nr} bzw. {nr:3} laufende Nummer (mit führenden Nullen)
 * Das Tool schlägt nur vor: die nächste freie Nummer nach den Ordnern im Stammordner. Vergeben wird sie
 * von dem, der das Projekt anlegt – das Feld bleibt frei änderbar.
 */

import { datumNachFormat } from '@core/projektdatei';
import { ausOrdnernameNachSchema } from '@core/ui/projektListe';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Platzhalter in einfachen Klammern, mit Angabe nach „:“ – {nr:3} (Stellen), {datum:JJMMTT} (Format) */
const TOKEN = /\{([a-zäöü_]+)(?::([^{}]+))?\}/gi;

/**
 * Gemeinsamer Platzhalter-Satz für Ordner- und Dateinamen und den Pfad der Projektdatei (P-06): Groß-/Kleinschreibung
 * egal, gleiche Bedeutung überall. {kürzel} und {projektcode} sind andere Namen für {nummer}. {datum} ist JJJJ-MM-TT,
 * mit Format z. B. {datum:JJMMTT} (JJJJ, JJ, MM, TT). Einzige Ausnahme aus Rücksicht auf vorhandene Einstellungen:
 * Im Pfad der Projektdatei bleibt {datum} ohne Format JJMMTT (siehe @core/projektdatei).
 */
export interface Platzhalter {
  name: string;
  text: string;
}
const ALIAS: Record<string, string> = { kürzel: 'nummer', kuerzel: 'nummer', projektcode: 'nummer' };
/** zulässige Datumsformate: nur JJJJ, JJ, MM, TT und Trenner */
const DATUMSFORMAT = /^[JMT.\-_ ]+$/i;

export const PLATZHALTER_PROJEKT: Platzhalter[] = [
  { name: '{nummer}', text: 'Projektnummer (gleich: {kürzel})' },
  { name: '{kurzname}', text: 'Kurzname' },
  { name: '{vorhaben}', text: 'Bezeichnung des Vorhabens' },
  { name: '{jahr}', text: 'Jahr des Anlegens' },
  { name: '{jj}', text: 'Jahr des Anlegens, zweistellig' },
  { name: '{datum}', text: 'Tag des Anlegens, JJJJ-MM-TT' },
  { name: '{datum:JJMMTT}', text: 'Tag des Anlegens im angegebenen Format (JJJJ, JJ, MM, TT)' },
  { name: '{bearbeiter}', text: 'Bearbeitung (Kürzel)' },
];
export const PLATZHALTER_NUMMER: Platzhalter[] = [
  { name: '{jahr}', text: 'Jahr, vierstellig' },
  { name: '{jj}', text: 'Jahr, zweistellig' },
  { name: '{nr:3}', text: 'laufende Nummer mit drei Stellen' },
  { name: '{nr}', text: 'laufende Nummer' },
];
export const PLATZHALTER_PLAN: Platzhalter[] = [...PLATZHALTER_PROJEKT, { name: '{plannummer}', text: 'Plannummer' }, { name: '{index}', text: 'Planindex' }, { name: '{titel}', text: 'Plantitel' }];
export const PLATZHALTER_VORLAGE: Platzhalter[] = [...PLATZHALTER_PROJEKT, { name: '{name}', text: 'Name der Vorlage ohne Endung' }];

/** Schlüssel eines Platzhalters zum Vergleichen: klein, Aliase aufgelöst, Format beim Datum vereinheitlicht */
function schluessel(name: string, angabe?: string): string {
  const n = name.toLowerCase();
  const k = ALIAS[n] ?? n;
  if (k === 'datum' && angabe) return DATUMSFORMAT.test(angabe.trim()) ? 'datum:' : `datum:${angabe}`;
  if (k === 'nr' && angabe) return /^\d+$/.test(angabe.trim()) ? 'nr:' : `nr:${angabe}`;
  return k;
}

/** Platzhalter im Schema, die es unter den erlaubten nicht gibt (bleiben so im Namen stehen) */
export function unbekanntePlatzhalterIn(schema: string, erlaubt: Platzhalter[]): string[] {
  const da = new Set(erlaubt.flatMap((p) => [...p.name.matchAll(TOKEN)].map((m) => schluessel(m[1], m[2]))));
  return [...new Set([...schema.matchAll(TOKEN)].filter((m) => !da.has(schluessel(m[1], m[2]))).map((m) => m[0]))];
}

/** Projektnummer nach Schema */
export function nummerAus(schema: string, nr: number, date = new Date()): string {
  return schema.replace(TOKEN, (m, name: string, breite?: string) => {
    const n = name.toLowerCase();
    if (n === 'jahr') return String(date.getFullYear());
    if (n === 'jj') return String(date.getFullYear() % 100).padStart(2, '0');
    if (n === 'nr') return String(nr).padStart(Number(breite ?? 1), '0');
    return m;
  });
}

/**
 * Nächste freie Nummer: höchste laufende Nummer unter den vorhandenen Ordnernamen (im laufenden Jahr, wenn
 * das Schema ein Jahr enthält) plus eins.
 */
export function naechsteNummer(schema: string, vorhandene: string[], date = new Date()): string {
  if (!/\{nr(?::\d+)?\}/i.test(schema)) return nummerAus(schema, 1, date);
  let muster = '';
  let pos = 0;
  for (const m of schema.matchAll(TOKEN)) {
    muster += escape(schema.slice(pos, m.index));
    const n = m[1].toLowerCase();
    if (n === 'jahr') muster += String(date.getFullYear());
    else if (n === 'jj') muster += String(date.getFullYear() % 100).padStart(2, '0');
    else if (n === 'nr') muster += '(\\d+)';
    else muster += escape(m[0]);
    pos = m.index + m[0].length;
  }
  muster += escape(schema.slice(pos));
  // der Ordnername beginnt mit der Nummer; danach darf keine weitere Ziffer folgen
  const re = new RegExp(`^${muster}(?!\\d)`);
  let max = 0;
  for (const name of vorhandene) {
    const m = re.exec(name.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return nummerAus(schema, max + 1, date);
}

/**
 * Passt eine Projektnummer zum Schema? {jahr} = vier Ziffern, {jj} = zwei, {nr:3} = mindestens drei Ziffern, {nr}
 * = Ziffern; der Rest wörtlich. „26-14“ passt nicht zu „{jahr}-{nr:3}“, „2026-014“ schon. Nur ein Hinweis – die
 * Nummer vergibt das Büro.
 */
export function nummerPasst(schema: string, nummer: string): boolean {
  let muster = '';
  let pos = 0;
  for (const m of schema.matchAll(TOKEN)) {
    muster += escape(schema.slice(pos, m.index));
    const n = m[1].toLowerCase();
    if (n === 'jahr') muster += '\\d{4}';
    else if (n === 'jj') muster += '\\d{2}';
    else if (n === 'nr') muster += `\\d{${Number(m[2] ?? 1)},}`;
    else muster += '.+?';
    pos = m.index + m[0].length;
  }
  muster += escape(schema.slice(pos));
  return new RegExp(`^${muster}$`, 'i').test(nummer.trim());
}

/**
 * Platzhalter in Datei- und Ordnernamen: {nummer}, {kurzname} … (auch in doppelten Klammern, Groß-/Kleinschreibung
 * egal, {kürzel} = {nummer}); {datum:JJMMTT} formatiert den Wert von `datum` (JJJJ-MM-TT) um.
 */
export function nameAus(schema: string, werte: Record<string, string | number>): string {
  return schema.replace(/\{\{?\s*([a-zäöüß_.]+)(?::([^{}]+?))?\s*\}?\}/gi, (m, key: string, angabe?: string) => {
    const klein = key.toLowerCase();
    const v = werte[key] ?? werte[klein] ?? (ALIAS[klein] ? werte[ALIAS[klein]] : undefined);
    if (v === undefined) return m;
    if (klein === 'datum' && angabe) {
      if (!DATUMSFORMAT.test(angabe.trim())) return m;
      const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
      return iso ? datumNachFormat(new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])), angabe.trim().toUpperCase()) : String(v);
    }
    return String(v);
  });
}

/**
 * Prüfmuster für Dateinamen (ohne Endung) aus dem Dateinamenschema. {nummer} muss der Projektnummer
 * entsprechen, wenn sie bekannt ist; die übrigen Teile sind frei, dürfen aber das Trennzeichen nicht enthalten.
 */
export function dateimuster(schema: string, nummer: string): RegExp {
  let muster = '';
  let pos = 0;
  const tokens = [...schema.matchAll(TOKEN)];
  tokens.forEach((m, i) => {
    const davor = schema.slice(pos, m.index);
    muster += escape(davor);
    const n = m[1].toLowerCase();
    const letzter = i === tokens.length - 1;
    // Zeichen, das auf diesen Teil folgt – der Teil selbst darf es nicht enthalten
    const danach = schema.slice(m.index + m[0].length)[0];
    const frei = danach && !letzter ? `[^${escape(danach)}]+` : '.+';
    if (n === 'nummer' || n === 'projekt' || ALIAS[n] === 'nummer') muster += nummer ? escape(nummer) : frei;
    else if (n === 'index') muster += '[A-Za-z0-9]{1,3}';
    else if (n === 'datum') muster += DATUM_MUSTER;
    else muster += frei;
    pos = m.index + m[0].length;
  });
  muster += escape(schema.slice(pos));
  return new RegExp(`^${muster}$`);
}

/** ein Datum im Dateinamen, gleich in welchem Format ({datum}, {datum:JJMMTT} …) */
export const DATUM_MUSTER = '(?:\\d{4}-\\d{2}-\\d{2}|\\d{6}|\\d{8}|\\d{2}\\.\\d{2}\\.\\d{4})';

/**
 * Nummer und Kurzname aus einem Ordnernamen nach dem Schema („2026-014 EFH Musterweg“ bei „{nummer} {kurzname}“) –
 * für Projektordner ohne Projektdatei, damit der Assistent nicht bei null anfängt. Leer, wenn er nicht passt.
 * Dieselbe Ableitung nutzen alle Apps (Schema in `allgemein.ordnerSchema`, @core/ui/projektListe).
 */
export const ausOrdnername = ausOrdnernameNachSchema;
