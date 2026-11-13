/**
 * Kleine gemeinsame Helfer: lokaler Speicher (JSON, Fehler werden abgefangen) und Byte-Vergleich.
 */

/** Wert aus dem lokalen Speicher (JSON); fehlt er oder ist er unlesbar: `vorgabe` */
export function lesen<T>(schluessel: string, vorgabe: T): T {
  try {
    const roh = localStorage.getItem(schluessel);
    return roh ? (JSON.parse(roh) as T) : vorgabe;
  } catch {
    return vorgabe;
  }
}

/** Wert in den lokalen Speicher (JSON); liefert, ob es gelang (voller oder fehlender Speicher: false) */
export function schreiben(schluessel: string, wert: unknown): boolean {
  try {
    localStorage.setItem(schluessel, JSON.stringify(wert));
    return true;
  } catch {
    return false;
  }
}

/** Gleicher Inhalt Byte für Byte? */
export const bytesGleich = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
