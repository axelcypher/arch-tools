/**
 * Texte der Normen: HTML/XML in Zeilen, Absätze erkennen, Prüfsummen je Absatz, Änderungen zwischen Fassungen.
 * Gemeinsam für alle Quellen – damit dieselbe Fassung, egal woher, dieselben Prüfsummen ergibt.
 */

import type { Paragraf } from './index';
import type { Aenderungen } from './typen';

const ENTITAETEN: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  sect: '§',
  shy: '',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  ndash: '–',
  mdash: '—',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  sbquo: '‚',
  lsquo: '‘',
  rsquo: '’',
  hellip: '…',
  deg: '°',
  sup2: '²',
  sup3: '³',
  middot: '·',
  times: '×',
  euro: '€',
};

/** HTML-/XML-Entitäten auflösen */
export function entschluesseln(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9]+);/gi, (g, n: string) => ENTITAETEN[n] ?? ENTITAETEN[n.toLowerCase()] ?? g);
}

/** eine Zeile vereinheitlichen: Leerraum, weiche Trennstriche, geschützte Leerzeichen */
export const zeileNormal = (z: string) =>
  z
    .replace(/[­​]/g, '')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Text eines HTML-/XML-Stücks als Zeilen: Absätze, Listenpunkte, Tabellenzeilen und Zeilenumbrüche werden zu eigenen
 * Zeilen; Nummern von Listenpunkten (`<DT>1.</DT><DD>…`) bleiben vor ihrem Text.
 */
export function zeilen(html: string): string[] {
  const t = entschluesseln(
    html
      // Fußnoten-Verweise und Skripte entfernen
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<(br|BR)\s*\/?>/g, '\n')
      .replace(/<\/(p|P|div|li|LI|dd|DD|tr|TR|h\d|section|table|Title|Subtitle)\s*>/g, '\n')
      .replace(/<(dt|DT)[^>]*>/g, '\n')
      .replace(/<\/(dt|DT|td|TD|th|TH)\s*>/g, ' ')
      .replace(/<[^>]+>/g, ''),
  );
  return t.split('\n').map(zeileNormal).filter(Boolean);
}

/** Titel ohne Fußnotenzeichen wie „(Fn 9)“, „[1]“ oder „1)“ am Ende */
export const titelOhneFussnote = (t: string) =>
  zeileNormal(t)
    .replace(/\s*(\(Fn\s*\d+\)|\[\d+\]|\d+\))\s*$/g, '')
    .trim();

/** Beginnt die Zeile einen Absatz „(n)“? Liefert die Nummer. */
export const absatzNummer = (z: string): string | undefined => /^\((\d+[a-z]?)\)/.exec(z)?.[1];

/**
 * Absätze eines Paragrafen: Nummer → Zeilen; ohne nummerierte Absätze nur `''` (ganzer Paragraf). Eingefügte Absätze
 * mit Buchstaben („(3a)“) sind eigene Absätze. Zeilen vor dem ersten Absatz gehören zum ersten.
 */
export function absaetze(p: Paragraf): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!p.text.some((z) => absatzNummer(z))) {
    out.set('', p.text);
    return out;
  }
  let aktuell: string | null = null;
  const vorweg: string[] = [];
  for (const z of p.text) {
    const n = absatzNummer(z);
    if (n && !out.has(n)) {
      aktuell = n;
      out.set(n, out.size === 0 ? [...vorweg, z] : [z]);
    } else if (aktuell) out.get(aktuell)!.push(z);
    else vorweg.push(z);
  }
  return out;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** SHA-256 als Hex */
export async function sha256(daten: Uint8Array | string): Promise<string> {
  const bytes = typeof daten === 'string' ? new TextEncoder().encode(daten) : daten;
  return hex(await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

/** Prüfsumme eines Textstücks: SHA-256 der normalisierten Zeilen, gekürzt auf 8 Hex-Zeichen */
export async function pruefsumme(zeilenListe: string[]): Promise<string> {
  return (await sha256(zeilenListe.map(zeileNormal).filter(Boolean).join('\n'))).slice(0, 8);
}

/** Prüfsummen aller Paragrafen (`6`) und Absätze (`6/1`) */
export async function pruefsummen(paragrafen: Record<string, Paragraf>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [nr, p] of Object.entries(paragrafen)) {
    out[nr] = await pruefsumme(p.text);
    for (const [abs, z] of absaetze(p)) if (abs) out[`${nr}/${abs}`] = await pruefsumme(z);
  }
  return out;
}

/**
 * Was sich zwischen zwei Fassungen geändert hat. Verglichen wird je Absatz; ein Paragraf ohne Absätze zählt als
 * Ganzes. Neue und weggefallene Paragrafen erscheinen mit ihrer Nummer.
 */
export function aenderungen(alt: Record<string, string>, neu: Record<string, string>): Aenderungen {
  const einheiten = (s: Record<string, string>) => {
    const hatAbsaetze = new Set(Object.keys(s).filter((k) => k.includes('/')).map((k) => k.split('/')[0]));
    return Object.keys(s).filter((k) => k.includes('/') || !hatAbsaetze.has(k));
  };
  const a = new Set(einheiten(alt));
  const n = new Set(einheiten(neu));
  const geaendert: string[] = [];
  const neue: string[] = [];
  const weg: string[] = [];
  const paragraf = (k: string) => k.split('/')[0];
  for (const k of n) {
    // ein Absatz, den es vorher nicht gab, in einem Paragrafen, den es gab: geändert, nicht neu
    if (!a.has(k)) (alt[paragraf(k)] !== undefined ? geaendert : neue).push(k);
    else if (alt[k] !== neu[k]) geaendert.push(k);
  }
  for (const k of a) if (!n.has(k)) (neu[paragraf(k)] !== undefined ? geaendert : weg).push(k);
  const sortiert = (l: string[]) => [...new Set(l)].sort((x, y) => x.localeCompare(y, 'de', { numeric: true }));
  return { geaendert: sortiert(geaendert), neu: sortiert(neue), weggefallen: sortiert(weg) };
}

/** Datum „01.09.2026“ → „2026-09-01“; sonst undefined */
export function isoDatum(s: string | undefined | null): string | undefined {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s ?? '');
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : undefined;
}

/** Datum „1. September 2026“ → „2026-09-01“ */
export function isoDatumLang(s: string): string | undefined {
  const monate = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
  const m = /(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/.exec(s);
  if (!m) return undefined;
  const i = monate.indexOf(m[2].toLowerCase());
  return i < 0 ? undefined : `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
