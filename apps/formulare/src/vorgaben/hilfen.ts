/**
 * Bausteine für die Vorgaben: Bedingungen kurz geschrieben. Merkmale und Werte wie in VORGABE_MERKMALE.
 */

import type { Bedingung, BedingungTeil, Quelle, Teilbedingung } from '../bedingung';
import { gruppe } from '../bedingung';
import type { Gruppe, Regel } from '../profil';

/** Projektmerkmal hat einen der Werte */
export const ist = (merkmal: string, ...werte: string[]): Teilbedingung => ({ art: 'merkmal', merkmal, werte });
/** Projektmerkmal hat keinen der Werte (ohne Wert im Projekt: offen, siehe bedingung.ts) */
export const istNicht = (merkmal: string, ...werte: string[]): Teilbedingung => ({ art: 'merkmal', merkmal, werte, nicht: true });
/** Kästchen angekreuzt bzw. Textfeld ausgefüllt */
export const angekreuzt = (feld: string): Teilbedingung => ({ art: 'feld', feld, pruefung: 'ausgefuellt' });

export const und = (...teile: BedingungTeil[]): Bedingung => gruppe('und', teile);
export const oder = (...teile: BedingungTeil[]): Bedingung => gruppe('oder', teile);
/** eine einzelne Prüfung als Bedingung */
export const wenn = (t: BedingungTeil): Bedingung => gruppe('und', [t]);

/** Gruppe der Vorgabe (id mit Präfix `v:`) */
export function gruppeV(id: string, titel: string, regel: Regel, felder: string[], extra: Partial<Gruppe> = {}): Gruppe {
  return { id: `v:${id}`, titel, regel, felder, ...extra };
}

/** dieselbe Bedingung für mehrere Felder */
export const fuer = (felder: string[], b: Bedingung): Record<string, Bedingung> => Object.fromEntries(felder.map((f) => [f, b]));

/** Felder, die nicht für den Füllstand zählen */
export const zaehltNicht = (...felder: string[]): Record<string, boolean> => Object.fromEntries(felder.map((f) => [f, false]));

/** Feldschlüssel einer Seite: `s(1)('Memo4')` → `1:Memo4` */
export const s =
  (seite: number) =>
  (...namen: string[]): string[] =>
    namen.map((n) => `${seite}:${n}`);

/** Fundstelle: `q('bauo-nrw', '68', 2, 3)` = § 68 Absatz 2 Satz 3 BauO NRW 2018 */
export const q = (gesetz: string, paragraf: string, absatz?: number, satz?: number, nummer?: number): Quelle => ({
  gesetz,
  paragraf,
  ...(absatz ? { absatz } : {}),
  ...(satz ? { satz } : {}),
  ...(nummer ? { nummer } : {}),
});

/** Bedingung mit Begründung und Rechtsgrundlage – erscheint am Feld, wenn es deshalb entfällt */
export const begruendet = (b: Bedingung, grund: string, ...quellen: Quelle[]): Bedingung => ({ ...b, grund, ...(quellen.length ? { quellen } : {}) });
