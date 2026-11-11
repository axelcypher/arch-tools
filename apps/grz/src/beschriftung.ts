import type { Point } from '@core/geometry';
import { labelPoint, polygonArea } from '@core/geometry';
import type { MultiPolygon } from '@core/polygon';
import { polygoneOf } from '@core/polygon';

/**
 * Beschriftung im Lageplan: Punkt im eindeutigen Anteil einer Fläche – nicht unter dem Gebäude oder unter Flächen, die
 * sie überlagern; bei mehreren Teilstücken im größten. Ohne eindeutigen Anteil (ganz überdeckt) im Umriss selbst.
 */
export function beschriftungsPunkt(eindeutig: MultiPolygon, umriss: readonly Point[]): Point {
  let best: { aussen: Point[]; loecher: Point[][]; a: number } | null = null;
  for (const p of polygoneOf(eindeutig)) {
    const a = polygonArea(p.aussen) - p.loecher.reduce((s, h) => s + polygonArea(h), 0);
    if (a > 1e-6 && (!best || a > best.a)) best = { ...p, a };
  }
  return best ? labelPoint(best.aussen, best.loecher) : labelPoint(umriss);
}

/** Länge der Maßstabsleiste: runde Länge (1, 2, 5, 10, 20, 50 … m), etwa ein Fünftel der Planbreite */
export function massstabLaenge(breite: number): number {
  const ziel = breite / 5;
  const stufen = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let best = stufen[0];
  for (const s of stufen) if (s <= ziel) best = s;
  return best;
}

/** Punkte 1 pt = 4/3 px (CSS) */
export const PT = 4 / 3;
