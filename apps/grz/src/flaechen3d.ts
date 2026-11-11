import type { Anrechnung, Nachweis } from './massNutzung';

/**
 * 3D-Ansicht (G-31): Lageplan-Flächen auf gleicher Höhe flimmern (Z-Fighting). Jede Fläche erhält eine Stufe nach dem
 * Rang, mit dem der Rechenkern Überlagerungen zuordnet (Anrechnung, dann Listenfolge) – die Fläche mit dem höchsten
 * Rang liegt einige Millimeter höher und ist an jeder Stelle sichtbar.
 */

const RANG: Record<Anrechnung, number> = { hauptanlage: 0, grz2: 1, garage01: 2, pruefen: 3, nein: 4 };

/** Höhenversatz je Stufe [m] */
export const STUFE_M = 0.004;

/** Stufe je Fläche: 0 = unterste (geringster Rang), höchste Zahl = oben */
export function flaechenStufen(n: Pick<Nachweis, 'lageplan'>): Map<string, number> {
  const liste = n.lageplan
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !l.ausGebaeude)
    .sort((a, b) => Number(a.l.nachbar) - Number(b.l.nachbar) || RANG[a.l.anrechnung] - RANG[b.l.anrechnung] || a.i - b.i);
  return new Map(liste.map(({ l }, k) => [l.id, liste.length - 1 - k]));
}
