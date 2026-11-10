/**
 * Bausteine für Verzeichnisse (Tabellen mit vielen gleichartigen Zeilen, z. B. die Verzeichnisse der staatlich
 * anerkannten Sachverständigen und der Prüfingenieure): Jedes Feld einer Zeile heißt „Zeile n: <Spalte>“ und zählt
 * nicht für den Füllstand – nur die Kopfangaben (Jahr, Name, Seite) zählen.
 */

import type { FormularProfil } from '../profil';

/** Spalte einer Tabelle: Titel und Feldname je Zeile (i = 0, 1, …) */
export type Spalte = [titel: string, name: (i: number) => string];

/** fortlaufend nummerierte Komponenten: `n('Memo', 3, 5)(2)` → `Memo13` */
export const n =
  (praefix: string, start: number, schritt: number) =>
  (i: number): string =>
    `${praefix}${start + schritt * i}`;

/** Tabelle mit `zeilen` gleichartigen Zeilen auf Seite `seite`: Titel „Zeile n: <Spalte>“, zählt nicht */
export function tabelle(seite: number, zeilen: number, spalten: Spalte[]): Partial<FormularProfil> {
  const feldTitel: Record<string, string> = {};
  for (let i = 0; i < zeilen; i++) for (const [titel, name] of spalten) feldTitel[`${seite}:${name(i)}`] = `Zeile ${i + 1}: ${titel}`;
  return { feldTitel, zaehlt: Object.fromEntries(Object.keys(feldTitel).map((k) => [k, false])) };
}
