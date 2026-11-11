import type { Point } from '@core/geometry';
import { distanceToEdges, polygonArea } from '@core/geometry';
import type { OutlineShape, RoomShape, Storey } from '@core/model';
import { areaMP, erweitern, intersectMP, polygoneOf, unionAll } from '@core/polygon';

/**
 * BGF-Umriss ohne Plan (F-15): „Umriss aus Räumen + Wanddicke“ – nur mit ausdrücklicher Wanddicke und Vermerk
 * „Näherung“, weil ungleiche Wanddicken oder Dämmung BGF, BRI und damit die Gebühr verfälschen.
 */

const z = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

export function naeherungsVermerk(wanddicke: number): string {
  return `Näherung: Umriss aus Räumen + Wanddicke ${z(wanddicke)} m – bei ungleichen Wanddicken oder Dämmung weichen BGF, BRI und Gebühr ab`;
}

/** Außenumrisse der um die Wanddicke erweiterten Räume (Innenhöfe bleiben als Löcher unberücksichtigt) */
export function umrissAusRaeumen(raeume: readonly RoomShape[], wanddicke: number): Point[][] {
  const polys = raeume.filter((r) => !r.subtract && r.points.length >= 3).map((r) => r.points);
  if (!polys.length || !(wanddicke > 0)) return [];
  try {
    return polygoneOf(erweitern(unionAll(polys), wanddicke))
      .map((p) => offen(p.aussen))
      .filter((p) => p.length >= 3 && polygonArea(p) > 0.5);
  } catch {
    return [];
  }
}

function offen(r: Point[]): Point[] {
  const n = r.length;
  return n > 1 && r[0].x === r[n - 1].x && r[0].y === r[n - 1].y ? r.slice(0, -1) : r;
}

/**
 * Kleiner Umriss, der außen an einen R-Umriss anschließt (Balkon, Loggia)? Dann die Umschließung S vorschlagen
 * (DIN 277: nicht allseitig in voller Höhe umschlossen).
 */
export function sVorschlagen(neu: readonly Point[], storey: Storey): boolean {
  const a = polygonArea(neu);
  if (a > 25 || a < 0.5) return false;
  const r = storey.shapes.filter((s): s is OutlineShape => s.kind === 'outline' && !s.subtract && s.umschliessung === 'R' && s.points !== neu);
  if (!r.length) return false;
  let ueber = 0;
  try {
    ueber = areaMP(intersectMP(unionAll([neu]), unionAll(r.map((x) => x.points))));
  } catch {
    return false;
  }
  if (ueber > 0.1 * a) return false;
  // berührt einen R-Umriss (mindestens zwei Eckpunkte auf dessen Rand)
  return r.some((o) => neu.filter((p) => distanceToEdges(p, o.points) < 0.05).length >= 2);
}
