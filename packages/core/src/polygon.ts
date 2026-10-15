import pc from 'polygon-clipping';
import type { MultiPolygon, Polygon } from 'polygon-clipping';
import type { Point } from './geometry';

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

/** Punkt im Ring (Strahlverfahren) direkt auf den Koordinatenpaaren – ohne Zwischenobjekte */
function inRing(x: number, y: number, r: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inMP(p: Point, mp: MultiPolygon): boolean {
  for (const poly of mp) {
    if (!inRing(p.x, p.y, poly[0])) continue;
    let imLoch = false;
    for (let k = 1; k < poly.length && !imLoch; k++) imLoch = inRing(p.x, p.y, poly[k]);
    if (!imLoch) return true;
  }
  return false;
}

/** Fläche um `d` erweitern (Rechtecke um jede Kante, Quadrate um jede Ecke – für kleine d ausreichend genau) */
export function erweitern(mp: MultiPolygon, d: number): MultiPolygon {
  if (!mp.length || d <= 0) return mp;
  const teile: Polygon[] = [];
  for (const poly of mp)
    for (const r of poly)
      for (let i = 0; i < r.length; i++) {
        const [x1, y1] = r[i];
        const [x2, y2] = r[(i + 1) % r.length];
        const l = Math.hypot(x2 - x1, y2 - y1);
        teile.push([[[x1 - d, y1 - d], [x1 + d, y1 - d], [x1 + d, y1 + d], [x1 - d, y1 + d]]]);
        if (l < 1e-12) continue;
        const nx = (-(y2 - y1) / l) * d;
        const ny = ((x2 - x1) / l) * d;
        teile.push([[[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]]]);
      }
  try {
    return pc.union(mp, ...teile);
  } catch {
    return mp;
  }
}

/**
 * Öffnung: Teile schmaler als 2 · d entfallen (auch wenn sie an eine echte Fläche anschließen), alles andere
 * bleibt in seiner ursprünglichen Form – für Restflächen aus leicht abweichend gezeichneten Umrissen.
 */
export function oeffnen(mp: MultiPolygon, d: number): MultiPolygon {
  if (!mp.length) return mp;
  // nur Teile mit geringer mittlerer Breite (2 · Fläche / Umfang) können Streifen enthalten, die ins Gewicht
  // fallen – breite Teile bleiben unverändert (spart die aufwendige Rechnung im Regelfall)
  const breit: MultiPolygon = [];
  const schmal: MultiPolygon = [];
  for (const poly of mp) {
    const a = ringArea(poly[0]) - poly.slice(1).reduce((h, r) => h + ringArea(r), 0);
    const u = poly.reduce((x, r) => x + ringUmfang(r), 0);
    (u > 0 && (2 * a) / u >= 25 * d ? breit : schmal).push(poly);
  }
  if (!schmal.length) return mp;
  const offen = oeffnenAlle(schmal, d);
  return breit.length ? [...breit, ...offen] : offen;
}

function ringUmfang(r: [number, number][]): number {
  let u = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    u += Math.hypot(x2 - x1, y2 - y1);
  }
  return u;
}

function oeffnenAlle(mp: MultiPolygon, d: number): MultiPolygon {
  try {
    const rand = diffMP(erweitern(mp, d), mp); // Saum außen
    const kern = diffMP(mp, erweitern(rand, d)); // um d geschrumpft
    if (!kern.length) return [];
    return intersectMP(erweitern(kern, d), mp);
  } catch {
    return mp;
  }
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
