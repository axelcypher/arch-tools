import type { Point } from './geometry';

/**
 * Fang auf Kanten (ergänzt den Eckpunkt- und Hilfslinienfang aus fang.ts): Kantenmitte, Lot von einem Punkt auf eine
 * Kante und beliebiger Punkt einer Kante – z. B. eine Terrasse genau an die Hauswand oder rechtwinklig von ihr weg.
 */

export interface KantenFang {
  p: Point;
  art: 'mitte' | 'lot' | 'kante';
  /** die gefangene Kante */
  kante: [Point, Point];
}

/** Lotfußpunkt von q auf die Strecke a–b: Parameter t (0 … 1 auf der Strecke) und Punkt */
export function lotFuss(q: Point, a: Point, b: Point): { t: number; p: Point } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-18 ? 0 : ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2;
  return { t, p: { x: a.x + dx * t, y: a.y + dy * t } };
}

/**
 * Nächster Kantenfang im Umkreis `toleranz` (Weltmaß). Vorrang: Kantenmitte, dann Lot von `von` (z. B. dem letzten
 * gesetzten Punkt) auf die Kante, dann der nächste Punkt der Kante.
 */
export function kantenFang(raw: Point, polygone: readonly (readonly Point[])[], toleranz: number, von?: Point): KantenFang | null {
  let best: { f: KantenFang; d: number; rang: number } | null = null;
  const nimm = (f: KantenFang, rang: number) => {
    const d = Math.hypot(f.p.x - raw.x, f.p.y - raw.y);
    if (d > toleranz) return;
    if (!best || rang < best.rang || (rang === best.rang && d < best.d)) best = { f, d, rang };
  };
  for (const pts of polygone) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
      const kante: [Point, Point] = [a, b];
      nimm({ p: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, art: 'mitte', kante }, 0);
      if (von) {
        const l = lotFuss(von, a, b);
        if (l.t > 1e-9 && l.t < 1 - 1e-9 && Math.hypot(l.p.x - von.x, l.p.y - von.y) > 1e-6) nimm({ p: l.p, art: 'lot', kante }, 1);
      }
      const k = lotFuss(raw, a, b);
      if (k.t >= 0 && k.t <= 1) nimm({ p: k.p, art: 'kante', kante }, 2);
    }
  }
  return best ? (best as { f: KantenFang }).f : null;
}

/** Punkt in Länge und Winkel vom Ausgangspunkt; Winkel in Grad gegen die Richtung `achse` (Einheitsvektor), gegen den Uhrzeigersinn auf dem Bildschirm */
export function polarPunkt(von: Point, laenge: number, winkelGrad: number, achse: Point): Point {
  const r = (winkelGrad * Math.PI) / 180;
  // auf dem Bildschirm „nach oben“ senkrecht zur Achse (y zeigt nach unten)
  const oben = { x: achse.y, y: -achse.x };
  return { x: von.x + laenge * (Math.cos(r) * achse.x + Math.sin(r) * oben.x), y: von.y + laenge * (Math.cos(r) * achse.y + Math.sin(r) * oben.y) };
}
