const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** 1234.5 → "1.234,50" */
export function fmt2(v: number): string {
  return nf2.format(normZero(v));
}

export function fmt3(v: number): string {
  return nf3.format(normZero(v));
}

/** Zahl ohne Tausendertrennzeichen mit Dezimalkomma (für CSV/Excel). */
export function fmtPlain(v: number, digits = 2): string {
  return normZero(v).toFixed(digits).replace('.', ',');
}

export function fmtPercent(f: number): string {
  return `${Math.round(f * 100)} %`;
}

function normZero(v: number) {
  return Math.abs(v) < 5e-7 ? 0 : v;
}

/** Einheiten, die hinter einer Zahl stehen dürfen (werden ignoriert) */
const EINHEIT = /(m²|m2|m³|m3|qm|cbm|m|%)$/i;

/**
 * Zahl in deutscher Schreibweise lesen: Komma als Dezimalzeichen, Punkt als Tausendertrenner, Einheit erlaubt.
 *   "3,25" → 3,25 · "1.234,5" → 1234,5 · "1.234" → 1234 · "1.234.567" → 1234567 · "12,5 m²" → 12,5 · "40 %" → 40
 * Ein Punkt gilt nur als Dezimalpunkt, wenn es eindeutig ist ("3.25", "0.4", "0.400"); genau drei Ziffern nach einem
 * einzelnen Punkt (ohne Komma, vorne nicht 0) sind Tausender. Ungültig → null.
 */
export function parseNum(s: string): number | null {
  let t = s.trim().replace(/\s/g, '').replace(/−/g, '-').replace(EINHEIT, '');
  if (t === '' || t === '-' || t === '.' || t === ',') return null;
  if (!/^[-+]?[\d.,]+$/.test(t)) return null;
  if (t.includes(',')) {
    // Komma = Dezimalzeichen; Punkte davor sind Tausendertrenner (nur in Dreiergruppen)
    if (t.indexOf(',') !== t.lastIndexOf(',')) return null;
    const [ganz, dez] = t.split(',');
    if (ganz.includes('.') && !/^[-+]?\d{1,3}(\.\d{3})+$/.test(ganz)) return null;
    if (dez.includes('.')) return null;
    t = `${ganz.replace(/\./g, '')}.${dez}`;
  } else if (t.includes('.')) {
    const teile = t.split('.');
    const tausender = teile.length > 2 ? /^[-+]?\d{1,3}(\.\d{3})+$/.test(t) : /^[-+]?[1-9]\d{0,2}\.\d{3}$/.test(t);
    if (tausender) t = t.replace(/\./g, '');
    else if (teile.length > 2) return null;
  }
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
