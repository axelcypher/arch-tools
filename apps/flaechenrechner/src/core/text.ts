/** „1 Raum“, „3 Räume“ – Zahl mit Einzahl bzw. Mehrzahl */
export function anzahl(n: number, einzahl: string, mehrzahl: string): string {
  return `${n} ${n === 1 ? einzahl : mehrzahl}`;
}
