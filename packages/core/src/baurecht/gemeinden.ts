/**
 * Gemeindenamen zu amtlichen Gemeindeschlüsseln – nur für die Anzeige (Regelbaum, Begründungen). Geprüft wird immer
 * gegen den Schlüssel; unbekannte Schlüssel erscheinen unverändert.
 */
const GEMEINDEN: Record<string, string> = {
  // Kreis Soest (05974)
  '05974004': 'Anröchte',
  '05974008': 'Bad Sassendorf',
  '05974012': 'Ense',
  '05974016': 'Erwitte',
  '05974020': 'Geseke',
  '05974024': 'Lippetal',
  '05974028': 'Lippstadt',
  '05974032': 'Möhnesee',
  '05974036': 'Rüthen',
  '05974040': 'Soest',
  '05974044': 'Warstein',
  '05974048': 'Welver',
  '05974052': 'Werl',
  '05974056': 'Wickede (Ruhr)',
};

export const gemeindeName = (ags: string): string | undefined => GEMEINDEN[ags];
