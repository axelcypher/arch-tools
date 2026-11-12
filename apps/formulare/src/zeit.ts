/** Änderungszeiten kurz und lang – für Formulare in der Navigation und Dateien im Projektordner */

const zwei = (n: number) => String(n).padStart(2, '0');
/** Beginn des Tages, `tage` Tage später – über das Datum, nicht über 24 h (Tage der Zeitumstellung haben 23 bzw. 25 h) */
const tagBeginn = (d: Date, tage = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + tage).getTime();

/**
 * Kurz für Listen: „heute 14:30“, „gestern 09:05“, im selben Jahr „12.11.“, sonst „12.11.25“; unbekannt (0) = leer.
 * `jetzt` nur für Tests.
 */
export function zeitKurz(ms: number | undefined, jetzt: number = Date.now()): string {
  if (!ms) return '';
  const d = new Date(ms);
  const j = new Date(jetzt);
  const [gestern, heute, morgen] = [tagBeginn(j, -1), tagBeginn(j), tagBeginn(j, 1)];
  const uhr = `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
  if (ms >= heute && ms < morgen) return `heute ${uhr}`;
  if (ms >= gestern && ms < heute) return `gestern ${uhr}`;
  const tag = `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.`;
  return d.getFullYear() === new Date(jetzt).getFullYear() ? tag : `${tag}${String(d.getFullYear() % 100).padStart(2, '0')}`;
}

/** Lang für Tooltips: „zuletzt geändert am 12.11.2026, 14:30“ */
export function zeitLang(ms: number | undefined): string {
  if (!ms) return 'Änderungszeit unbekannt';
  const d = new Date(ms);
  return `zuletzt geändert am ${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}, ${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}
