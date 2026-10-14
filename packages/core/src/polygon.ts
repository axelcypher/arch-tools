import pc from 'polygon-clipping';
import type { MultiPolygon, Polygon } from 'polygon-clipping';
import type { Point } from './geometry';
import { pointInPolygon } from './geometry';

/**
 * Flächenoperationen auf Polygonen (Vereinigung, Differenz, Schnitt) – Grundlage dafür, dass sich
 * überlagernde Flächen nie doppelt zählen. MultiPolygon = Liste von Polygonen, je [Außenring, …Löcher].
 */

export type { MultiPolygon };

export const toPoly = (pts: readonly Point[]): Polygon => [pts.map((p) => [p.x, p.y] as [number, number])];

/** Vereinigung beliebig vieler (auch sich selbst überlagernder) Punktlisten */
export function unionAll(polys: readonly (readonly Point[])[]): MultiPolygon {
  const valid = polys.filter((p) => p.length >= 3);
  if (!valid.length) return [];
  try {
    return pc.union(toPoly(valid[0]), ...valid.slice(1).map(toPoly));
  } catch {
    // degenerierte Eingaben (z. B. sich selbst schneidende Polygone): einzeln vereinigen und Ausreißer auslassen
    let acc: MultiPolygon = [];
    for (const p of valid) {
      try {
        acc = acc.length ? pc.union(acc, toPoly(p)) : pc.union(toPoly(p));
      } catch {
        // dieses Polygon bleibt unberücksichtigt
      }
    }
    return acc;
  }
}

export function unionMP(...mps: MultiPolygon[]): MultiPolygon {
  const valid = mps.filter((m) => m.length);
  if (!valid.length) return [];
  return pc.union(valid[0], ...valid.slice(1));
}

export function diffMP(a: MultiPolygon, ...b: MultiPolygon[]): MultiPolygon {
  const valid = b.filter((m) => m.length);
  if (!a.length || !valid.length) return a;
  return pc.difference(a, ...valid);
}

export function intersectMP(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (!a.length || !b.length) return [];
  return pc.intersection(a, b);
}

function ringArea(r: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function areaMP(mp: MultiPolygon): number {
  return mp.reduce((a, poly) => a + ringArea(poly[0]) - poly.slice(1).reduce((h, r) => h + ringArea(r), 0), 0);
}

export function inMP(p: Point, mp: MultiPolygon): boolean {
  for (const poly of mp) {
    const ring = poly[0].map(([x, y]) => ({ x, y }));
    if (!pointInPolygon(p, ring)) continue;
    if (poly.slice(1).some((h) => pointInPolygon(p, h.map(([x, y]) => ({ x, y }))))) continue;
    return true;
  }
  return false;
}

/** alle Ringe (außen und Löcher) als Punktlisten – für die Darstellung */
export function ringsOf(mp: MultiPolygon): Point[][] {
  return mp.flatMap((poly) => poly.map((r) => r.map(([x, y]) => ({ x, y }))));
}

/** Polygone mit Löchern als Punktlisten */
export function polygoneOf(mp: MultiPolygon): { aussen: Point[]; loecher: Point[][] }[] {
  return mp.map((poly) => ({
    aussen: poly[0].map(([x, y]) => ({ x, y })),
    loecher: poly.slice(1).map((r) => r.map(([x, y]) => ({ x, y }))),
  }));
}
