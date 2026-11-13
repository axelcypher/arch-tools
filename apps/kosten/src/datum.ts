/**
 * Datumsangaben der Kostenermittlung (Kostenstand, festgehaltene Stände) als ISO-Text JJJJ-MM-TT im lokalen Kalender.
 * Bewusst ohne Umweg über Date/UTC: `new Date('2026-07-01')` gilt als Mitternacht UTC und ergäbe westlich von
 * Greenwich den Vortag, `toISOString()` kurz nach Mitternacht deutscher Zeit ebenfalls.
 */

/** „2026-07-01“ → „1.7.2026“; andere Texte unverändert */
export const datumAnzeige = (iso: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.${iso.slice(0, 4)}` : iso);

/** heutiges Datum im lokalen Kalender als JJJJ-MM-TT */
export function heuteIso(d = new Date()): string {
  const zwei = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}
