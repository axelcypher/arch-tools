/** ein Gegenstand mit ungespeicherten Änderungen, in Nutzersprache mit Artikel, z. B. „die Ordnerstruktur“ */
export interface Gegenstand {
  text: string;
  /** Mehrzahl („die Stammdaten haben …“) */
  mehrzahl?: boolean;
}

export const ORDNERSTRUKTUR: Gegenstand = { text: 'die Ordnerstruktur' };
/** alles, was im Assistenten noch nicht angelegt ist (geänderte Angaben beim Ergänzen, abgewählte Einträge) */
export const ASSISTENT_ANGABEN: Gegenstand = { text: 'die Angaben im Assistenten', mehrzahl: true };

/**
 * Satz für ungespeicherte Änderungen (design.md „Ungespeicherte Änderungen“) an der Titelleiste bzw. für die Rückfragen
 * des Rahmens: „Die Ordnerstruktur hat ungespeicherte Änderungen.“, „Die Ordnerstruktur und die Angaben im Assistenten haben …“.
 * Ohne Gegenstand undefined (dann gilt der allgemeine Satz).
 */
export function satzUngespeichert(gegenstaende: readonly Gegenstand[]): string | undefined {
  if (!gegenstaende.length) return undefined;
  const texte = gegenstaende.map((g) => g.text);
  const liste = texte.length === 1 ? texte[0] : `${texte.slice(0, -1).join(', ')} und ${texte.at(-1)}`;
  const mehrzahl = gegenstaende.length > 1 || !!gegenstaende[0].mehrzahl;
  return `${liste.charAt(0).toUpperCase()}${liste.slice(1)} ${mehrzahl ? 'haben' : 'hat'} ungespeicherte Änderungen.`;
}
