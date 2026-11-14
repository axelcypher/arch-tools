/** ein Gegenstand mit ungespeicherten Änderungen, in Nutzersprache mit Artikel, z. B. „die Ordnerstruktur“ */
export interface Gegenstand {
  text: string;
  /** Mehrzahl („die Stammdaten haben …“) */
  mehrzahl?: boolean;
}

export const ORDNERSTRUKTUR: Gegenstand = { text: 'die Ordnerstruktur' };
export const STAMMDATEN: Gegenstand = { text: 'die Stammdaten', mehrzahl: true };
export const TROCKENLAUF_AUSWAHL: Gegenstand = { text: 'die Auswahl im Trockenlauf' };

/**
 * Satz für ungespeicherte Änderungen (design.md „Ungespeicherte Änderungen“) an der Titelleiste bzw. für die Rückfragen
 * des Rahmens: „Die Ordnerstruktur hat ungespeicherte Änderungen.“, „Die Ordnerstruktur und die Stammdaten haben …“.
 * Ohne Gegenstand undefined (dann gilt der allgemeine Satz).
 */
export function satzUngespeichert(gegenstaende: readonly Gegenstand[]): string | undefined {
  if (!gegenstaende.length) return undefined;
  const texte = gegenstaende.map((g) => g.text);
  const liste = texte.length === 1 ? texte[0] : `${texte.slice(0, -1).join(', ')} und ${texte.at(-1)}`;
  const mehrzahl = gegenstaende.length > 1 || !!gegenstaende[0].mehrzahl;
  return `${liste.charAt(0).toUpperCase()}${liste.slice(1)} ${mehrzahl ? 'haben' : 'hat'} ungespeicherte Änderungen.`;
}
