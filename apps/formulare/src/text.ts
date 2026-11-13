/** Anzahl mit Einzahl bzw. Mehrzahl: `anzahl(1, 'Angabe', 'Angaben')` → „1 Angabe“ (statt „1 Angabe(n)“) */
export const anzahl = (n: number, eins: string, mehr: string) => `${n} ${n === 1 ? eins : mehr}`;
