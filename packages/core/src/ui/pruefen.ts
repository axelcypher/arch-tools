/**
 * Gemeinsame Prüfregeln für Eingaben (alle Apps). Jede Regel liefert die Meldung oder null, wenn die Eingabe passt.
 * Die Meldungen erscheinen am Feld – erst nach dem Verlassen des Feldes bzw. nach dem Absenden (siehe fields.tsx).
 * Weiche Regeln (PLZ, E-Mail) sind Hinweise: Sie blockieren nichts.
 */

export type Pruefung = (wert: string) => string | null;

/** Pflichtfeld */
export const pflicht =
  (was = 'Angabe'): Pruefung =>
  (v) =>
    v.trim() ? null : `${was} fehlt.`;

/** Postleitzahl: fünf Ziffern (Deutschland) */
export const plz: Pruefung = (v) => (!v.trim() || /^\d{5}$/.test(v.trim()) ? null : 'PLZ mit fünf Ziffern, z. B. 48143.');

/** E-Mail-Adressen, mehrere mit Komma oder Semikolon – je Eintrag geprüft */
export const email: Pruefung = (v) => {
  const falsch = v
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter((x) => x && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x));
  return falsch.length ? `Keine gültige E-Mail-Adresse: ${falsch.join(', ')}` : null;
};

/** Zeichen, die in Ordner- und Dateinamen nicht erlaubt sind (Windows) */
export const UNZULAESSIG = /[<>:"/\\|?*]/g;

/** Hinweis, welche Zeichen im Ordnernamen entfernt werden */
export const ordnername: Pruefung = (v) => {
  const zeichen = [...new Set(v.match(UNZULAESSIG) ?? [])];
  return zeichen.length ? `${zeichen.join(' ')} ${zeichen.length === 1 ? 'wird' : 'werden'} im Ordnernamen entfernt.` : null;
};

/** mehrere Prüfungen nacheinander: die erste Meldung zählt */
export const alle =
  (...p: Pruefung[]): Pruefung =>
  (v) => {
    for (const f of p) {
      const m = f(v);
      if (m) return m;
    }
    return null;
  };

/** Zahl außerhalb des erlaubten Bereichs – mit Vorschlag bei vergessenem Komma (GRZ „4“ → „gemeint 0,4?“) */
export function bereichMeldung(v: number, min: number | undefined, max: number | undefined, zeige: (n: number) => string): string | null {
  if (min !== undefined && v < min) return `Mindestens ${zeige(min)}.`;
  if (max !== undefined && v > max) {
    const gemeint = [v / 10, v / 100].find((x) => x <= max && (min === undefined || x >= min));
    return `Höchstens ${zeige(max)}${gemeint !== undefined && max <= 1 ? ` – gemeint ${zeige(gemeint)}?` : '.'}`;
  }
  return null;
}
