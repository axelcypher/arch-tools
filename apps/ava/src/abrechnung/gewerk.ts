/**
 * Gewerkkennungen vereinheitlichen: In Ordnern, Blättern und Listen steht dasselbe Gewerk als „G08“, „G8“,
 * „G 8“ oder „G1 “. Verglichen wird über die Kurzform „G8“.
 */

/** „G08“, „G 8“, „g8 Fenster“ → „G8“; sonst null */
export function gewerkKennung(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^\s*G\s*0*(\d{1,3})(?![\d])/i.exec(String(s));
  return m ? `G${Number(m[1])}` : null;
}

/** Nummer des Gewerks (für die Sortierung) */
export const gewerkNummer = (k: string | null) => (k ? Number(k.slice(1)) : Number.POSITIVE_INFINITY);

/** zweistellige Schreibweise wie in den Ordnern: „G8“ → „G08“ */
export const gewerkZweistellig = (k: string) => `G${String(Number(k.slice(1))).padStart(2, '0')}`;
