import { raumBodenVersatz } from './calc';
import type { Point } from './geometry';
import { labelPoint, pointInPolygon, polygonArea } from './geometry';
import type { HoehenAnteile, OutlineShape, RoomShape, Storey } from './model';
import { areaMP, intersectMP, polygoneOf, unionAll } from './polygon';
import { clippedPieces, clipHalfPlane } from './roof';

/**
 * Dachschrägen nach WoFlV (F-12): Höhenlinien 1,00 m und 2,00 m lichte Höhe unter einer Dachform und die
 * Teilflächen eines Raums (≥ 2 m voll, 1–2 m zur Hälfte, < 1 m nicht – § 4 Nr. 1–2 WoFlV).
 *
 * Lichte Höhe = Höhe der Dachhaut über dem Fußboden (Dachform des BGF-Umrisses, je Dachfläche linear)
 *   − Dachaufbau bis zur Innenbekleidung, senkrecht umgerechnet (Dicke ÷ cos α)
 *   − Fußbodenaufbau (nur nötig, wenn die Geschosskote auf dem Rohfußboden liegt, siehe FR-14)
 *   − Höhenlage des Raums gegenüber dem Körper (Split-Level).
 * Je Dachfläche ist die Grenze „lichte Höhe = h“ eine Gerade; die Teilflächen sind Polygone, deren Summe exakt die
 * Raumfläche ergibt. Gauben und Kehlbalkendecken bleiben unberücksichtigt (konservativ: Gauben erhöhen die lichte
 * Höhe) – in solchen Räumen die Teilflächen prüfen. Dächer aus dem IFC-Modell liefern die Anteile beim Import.
 */

export interface HoehenZone {
  /** Klasse der lichten Höhe */
  klasse: 'h2' | 'h12' | 'h01';
  points: Point[];
}

export interface HoehenOptionen {
  /** Dachaufbau bis zur Innenbekleidung, senkrecht zur Dachfläche [m] */
  dachaufbau?: number;
  /** Fußbodenaufbau [m] */
  fussbodenaufbau?: number;
  /** Fußboden des Raums über dem Fußboden des Körpers [m] */
  versatz?: number;
}

/** Zonen der lichten Höhe innerhalb eines Polygons unter einer Dachform (ohne Dach: keine Zonen) */
export function hoehenZonen(umriss: OutlineShape, flaeche: readonly Point[], o: HoehenOptionen = {}): HoehenZone[] {
  const d = umriss.dach;
  if (!d || d.typ === 'modell' || flaeche.length < 3) return [];
  const out: HoehenZone[] = [];
  for (const pc of clippedPieces(d, umriss.points)) {
    // Abzug für diese Dachfläche: Aufbau ÷ cos α (= Aufbau × √(1 + tan² α)), Fußbodenaufbau, Höhenlage
    const neigung = Math.hypot(pc.f[0], pc.f[1]);
    const ab = (o.dachaufbau ?? 0) * Math.sqrt(1 + neigung * neigung) + (o.fussbodenaufbau ?? 0) + (o.versatz ?? 0);
    let teile: Point[][];
    try {
      teile = polygoneOf(intersectMP(unionAll([pc.poly]), unionAll([flaeche]))).map((p) => offen(p.aussen));
    } catch {
      teile = [];
    }
    for (const t of teile) {
      if (t.length < 3) continue;
      // ≥ 2 m: f − ab ≥ 2  ⇔  (2 + ab) − f ≤ 0
      const h2 = clipHalfPlane(t, [-pc.f[0], -pc.f[1], 2 + ab - pc.f[2]]);
      // < 1 m: f − ab ≤ 1  ⇔  f − (1 + ab) ≤ 0
      const h01 = clipHalfPlane(t, [pc.f[0], pc.f[1], pc.f[2] - 1 - ab]);
      // 1–2 m: dazwischen
      const h12 = clipHalfPlane(clipHalfPlane(t, [pc.f[0], pc.f[1], pc.f[2] - 2 - ab]), [-pc.f[0], -pc.f[1], 1 + ab - pc.f[2]]);
      for (const [klasse, pts] of [
        ['h2', h2],
        ['h12', h12],
        ['h01', h01],
      ] as const)
        if (pts.length >= 3 && polygonArea(pts) > 1e-9) out.push({ klasse, points: pts });
    }
  }
  return out;
}

/** geschlossene Ringe der Polygonbibliothek: letzten (doppelten) Punkt weglassen */
function offen(r: Point[]): Point[] {
  const n = r.length;
  return n > 1 && r[0].x === r[n - 1].x && r[0].y === r[n - 1].y ? r.slice(0, -1) : r;
}

/** BGF-Umriss mit Dachform, in dem ein Raum liegt */
export function dachUmrissVon(r: RoomShape, storey: Storey): OutlineShape | undefined {
  if (r.points.length < 3) return undefined;
  const p = labelPoint(r.points);
  return storey.shapes.find((s): s is OutlineShape => s.kind === 'outline' && !s.subtract && !!s.dach && s.dach.typ !== 'modell' && s.dach.typ !== 'flach' && pointInPolygon(p, s.points));
}

/** Optionen für einen Raum: Aufbauten des Geschosses, Höhenlage gegenüber dem Körper */
export function raumHoehenOptionen(r: RoomShape, storey: Storey, umriss: OutlineShape): HoehenOptionen {
  return { dachaufbau: storey.dachaufbau, fussbodenaufbau: storey.fussbodenaufbau, versatz: raumBodenVersatz(r, storey) - (umriss.versatz ?? 0) };
}

/**
 * Teilflächen eines Raums nach lichter Höhe als Anteile (Summe 1) – null, wenn er unter keiner Dachform liegt.
 * Die Anteile beziehen sich auf die Polygonfläche; mit dem Putzabzug gelten sie für die Raumfläche gleichermaßen.
 */
export function raumHoehenAnteile(r: RoomShape, storey: Storey): { anteile: HoehenAnteile; zonen: HoehenZone[] } | null {
  const u = dachUmrissVon(r, storey);
  if (!u) return null;
  const zonen = hoehenZonen(u, r.points, raumHoehenOptionen(r, storey, u));
  const ges = polygonArea(r.points);
  if (!zonen.length || ges <= 1e-9) return null;
  const summe = (k: HoehenZone['klasse']) => zonen.filter((z) => z.klasse === k).reduce((a, z) => a + polygonArea(z.points), 0);
  // Teile außerhalb der Dachflächen (Raum ragt über den Umriss) zählen wie ≥ 2 m nicht mit – Anteile auf die Summe beziehen
  const a2 = summe('h2');
  const a01 = summe('h01');
  const innen = sicher(() => areaMP(intersectMP(unionAll([r.points]), unionAll([u.points]))), ges);
  const a12 = Math.max(0, innen - a2 - a01);
  const s = a2 + a12 + a01;
  if (s <= 1e-9) return null;
  return { anteile: { h2: a2 / s, h12: a12 / s, h01: a01 / s }, zonen };
}

function sicher(f: () => number, ersatz: number): number {
  try {
    return f();
  } catch {
    return ersatz;
  }
}
