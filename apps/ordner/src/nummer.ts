/**
 * Projektnummern und Namensschemata. Platzhalter siehe @core/platzhalter (gemeinsam für alle Apps):
 *   {JAHR} 2026 · {JAHR_KURZ} 26 · {Nr} bzw. {Nr:3} laufende Nummer (mit führenden Nullen)
 * Das Tool schlägt nur vor: die nächste freie Nummer nach den Ordnern im Stammordner. Vergeben wird sie
 * von dem, der das Projekt anlegt – das Feld bleibt frei änderbar.
 */

import { GLOBALE_VARIABLEN, ersetzen, mitAliasen, platzhalterIn, unbekanntePlatzhalter, type Fundstelle, type Variable, type Wert } from '@core/platzhalter';
import { ausOrdnernameNachSchema } from '@core/ui/projektListe';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Variable einer Einstellung (Name ohne Klammern, Erklärung) – siehe @core/platzhalter */
export type Platzhalter = Variable;

/**
 * Globale Variablen im Projektordner. Alte Namen gelten weiter, mit ihrer bisherigen Bedeutung: {nummer}, {kürzel},
 * {projektcode}, {projekt} = Projektkürzel; {datum} war hier JJJJ-MM-TT (die neue Variable {DATUM} ist wie überall
 * JJMMTT, mit Format z. B. {DATUM:JJJJ-MM-TT}).
 */
const GLOBAL: Variable[] = GLOBALE_VARIABLEN.map((v) =>
  v.name === 'PROJEKT_KUERZEL' ? mitAliasen(v.name, ['projekt']) : v.name === 'DATUM' ? mitAliasen(v.name, [{ name: 'datum', angabe: 'JJJJ-MM-TT' }], true) : v,
);
const lokal = (name: string, text: string, alt = name.toLowerCase()): Variable => ({ name, text, aliase: [alt] });

/** Ordner- und Dateinamen im Projekt: alle globalen Variablen */
export const PLATZHALTER_PROJEKT: Variable[] = GLOBAL;
/** Nummernschema: bildet die Projektnummer selbst – nur Jahr und laufende Nummer */
export const PLATZHALTER_NUMMER: Variable[] = [
  GLOBAL.find((v) => v.name === 'JAHR')!,
  GLOBAL.find((v) => v.name === 'JAHR_KURZ')!,
  lokal('Nr', 'laufende Nummer; mit Stellen z. B. {Nr:3} (führende Nullen)'),
];
export const PLATZHALTER_PLAN: Variable[] = [...GLOBAL, lokal('Plannummer', 'Plannummer'), lokal('Index', 'Planindex'), lokal('Titel', 'Plantitel')];
export const PLATZHALTER_VORLAGE: Variable[] = [...GLOBAL, lokal('Name', 'Name der Vorlage ohne Endung')];
/** alle Variablen des Projektordners (zum Ersetzen in beliebigen Namen) */
const ALLE: Variable[] = [...PLATZHALTER_PLAN, ...PLATZHALTER_VORLAGE.filter((v) => v.name === 'Name')];

/** Platzhalter im Schema, die es unter den erlaubten nicht gibt (bleiben so im Namen stehen) */
export function unbekanntePlatzhalterIn(schema: string, erlaubt: Variable[]): string[] {
  return unbekanntePlatzhalter(schema, erlaubt);
}

/** neuer Name des Platzhalters im Nummernschema (JAHR, JAHR_KURZ, Nr) bzw. null */
const imNummernschema = (f: Fundstelle) => f.treffer?.variable.name ?? null;

/** Projektnummer nach Schema */
export function nummerAus(schema: string, nr: number, date = new Date()): string {
  return ersetzen(schema, PLATZHALTER_NUMMER, { JAHR: date, JAHR_KURZ: date, Nr: nr }, { ohneWert: 'stehen' });
}

/**
 * Nächste freie Nummer: höchste laufende Nummer unter den vorhandenen Ordnernamen (im laufenden Jahr, wenn
 * das Schema ein Jahr enthält) plus eins.
 */
export function naechsteNummer(schema: string, vorhandene: string[], date = new Date()): string {
  const teile = platzhalterIn(schema, PLATZHALTER_NUMMER);
  if (!teile.some((f) => imNummernschema(f) === 'Nr')) return nummerAus(schema, 1, date);
  let muster = '';
  let pos = 0;
  for (const f of teile) {
    muster += escape(schema.slice(pos, f.index));
    const n = imNummernschema(f);
    if (n === 'JAHR' || n === 'JAHR_KURZ') muster += escape(ersetzen(f.roh, PLATZHALTER_NUMMER, { [n]: date }));
    else if (n === 'Nr') muster += '(\\d+)';
    else muster += escape(f.roh);
    pos = f.index + f.roh.length;
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
  for (const f of platzhalterIn(schema, PLATZHALTER_NUMMER)) {
    muster += escape(schema.slice(pos, f.index));
    const n = imNummernschema(f);
    const angabe = f.treffer?.angabe?.toUpperCase();
    if (n === 'JAHR' || n === 'JAHR_KURZ') muster += angabe === 'JJ' ? '\\d{2}' : angabe === 'JJJJ' ? '\\d{4}' : '.+?';
    else if (n === 'Nr') muster += `\\d{${/^\d+$/.test(angabe ?? '') ? Number(angabe) : 1},}`;
    else muster += '.+?';
    pos = f.index + f.roh.length;
  }
  muster += escape(schema.slice(pos));
  return new RegExp(`^${muster}$`, 'i').test(nummer.trim());
}

/** alte Schlüssel der Werte (nummer, kurzname, datum JJJJ-MM-TT …) → neue Namen der Variablen */
const WERT_SCHLUESSEL: Record<string, string> = {
  nummer: 'PROJEKT_KUERZEL',
  kürzel: 'PROJEKT_KUERZEL',
  projekt: 'PROJEKT_KUERZEL',
  kurzname: 'PROJEKT_KURZNAME',
  vorhaben: 'PROJEKT_VORHABEN',
  bearbeiter: 'BEARBEITER',
  datum: 'DATUM',
  jahr: 'JAHR',
  jj: 'JAHR_KURZ',
  plannummer: 'Plannummer',
  index: 'Index',
  titel: 'Titel',
  name: 'Name',
};

/**
 * Platzhalter in Datei- und Ordnernamen ersetzen (alte und neue Namen, siehe {@link PLATZHALTER_PLAN}). `werte` mit den
 * bisherigen Schlüsseln (nummer, kurzname, datum als JJJJ-MM-TT, jahr …) oder den neuen Namen. Ohne Wert bleibt der
 * Platzhalter stehen – auch bei leerem Jahr.
 */
export function nameAus(schema: string, werte: Record<string, string | number>): string {
  const w: Record<string, Wert> = {};
  for (const [k, v] of Object.entries(werte)) w[WERT_SCHLUESSEL[k.toLowerCase()] ?? k] = v;
  // ein leeres Jahr (Projekt ohne Anlagedatum) ist unbekannt: {JAHR} und {JAHR_KURZ} bleiben stehen statt '' bzw. '00'
  if (w.JAHR === '') delete w.JAHR;
  if (w.JAHR_KURZ === '') delete w.JAHR_KURZ;
  if (w.JAHR !== undefined && w.JAHR_KURZ === undefined) w.JAHR_KURZ = String(Number(w.JAHR) % 100).padStart(2, '0');
  return ersetzen(schema, ALLE, w, { ohneWert: 'stehen' });
}

/**
 * Prüfmuster für Dateinamen (ohne Endung) aus dem Dateinamenschema. {nummer} muss der Projektnummer
 * entsprechen, wenn sie bekannt ist; die übrigen Teile sind frei, dürfen aber das Trennzeichen nicht enthalten.
 */
export function dateimuster(schema: string, nummer: string): RegExp {
  let muster = '';
  let pos = 0;
  const tokens = platzhalterIn(schema, ALLE);
  tokens.forEach((f, i) => {
    muster += escape(schema.slice(pos, f.index));
    const n = f.treffer?.variable.name;
    const letzter = i === tokens.length - 1;
    // Zeichen, das auf diesen Teil folgt – der Teil selbst darf es nicht enthalten
    const danach = schema.slice(f.index + f.roh.length)[0];
    const frei = danach && !letzter ? `[^${escape(danach)}]+` : '.+';
    if (n === 'PROJEKT_KUERZEL') muster += nummer ? escape(nummer) : frei;
    else if (n === 'Index') muster += '[A-Za-z0-9]{1,3}';
    else if (n === 'DATUM') muster += DATUM_MUSTER;
    else muster += frei;
    pos = f.index + f.roh.length;
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
