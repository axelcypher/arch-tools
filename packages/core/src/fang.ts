import type { Point } from './geometry';

/**
 * Hilfslinienfang für Zeichenflächen. Pläne sind genordet, Gebäude stehen daher meist schräg – Raster und
 * waagerecht/senkrecht helfen dort nicht. Hilfslinien folgen deshalb den vorhandenen Kanten:
 *
 *  - Verlängerung der angrenzenden Kanten eines verschobenen Eckpunkts („auf der Achse bleiben“)
 *  - die Gebäudeachsen (häufigste Kantenrichtung und rechtwinklig dazu) durch die Nachbarpunkte
 *  - Ausrichtung an anderen Eckpunkten derselben Fläche entlang der Gebäudeachsen
 *
 * Liegt der Mauszeiger nahe an zwei Hilfslinien, wird auf deren Schnittpunkt gefangen.
 */

export interface Hilfslinie {
  /** Punkt auf der Linie (Ursprung für das Abmessen) */
  p: Point;
  /** Richtung (Einheitsvektor) */
  d: Point;
  art: 'kante' | 'achse' | 'flucht';
}

export interface HilfsFang {
  p: Point;
  /** Linien, auf denen der Punkt liegt (für die Anzeige) */
  linien: Hilfslinie[];
}

const norm = (v: Point): Point => {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-12 ? { x: 1, y: 0 } : { x: v.x / l, y: v.y / l };
};

/** Lotfußpunkt und Abstand eines Punkts zu einer Linie */
export function aufLinie(q: Point, l: Hilfslinie): { p: Point; t: number; dist: number } {
  const t = (q.x - l.p.x) * l.d.x + (q.y - l.p.y) * l.d.y;
  const p = { x: l.p.x + l.d.x * t, y: l.p.y + l.d.y * t };
  return { p, t, dist: Math.hypot(q.x - p.x, q.y - p.y) };
}

/** Schnittpunkt zweier Linien (null, wenn nahezu parallel) */
export function schnitt(a: Hilfslinie, b: Hilfslinie): Point | null {
  const den = a.d.x * b.d.y - a.d.y * b.d.x;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((b.p.x - a.p.x) * b.d.y - (b.p.y - a.p.y) * b.d.x) / den;
  return { x: a.p.x + a.d.x * t, y: a.p.y + a.d.y * t };
}

/** gleiche Gerade? (für das Entfernen doppelter Hilfslinien) */
function gleicheLinie(a: Hilfslinie, b: Hilfslinie): boolean {
  if (Math.abs(a.d.x * b.d.y - a.d.y * b.d.x) > 1e-6) return false;
  return aufLinie(b.p, a).dist < 1e-6;
}

/**
 * Häufigste Kantenrichtung (Gebäudeachse) in Grad, 0 ≤ θ < 90 – gewichtet nach Kantenlänge.
 * Ohne Kanten 0 (waagerecht/senkrecht).
 */
export function gebaeudeAchse(polygone: readonly (readonly Point[])[]): number {
  const fach = new Map<number, number>();
  for (const pts of polygone) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.2) continue;
      let w = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      w = ((w % 90) + 90) % 90;
      const k = Math.round(w * 4) / 4; // Viertelgrad
      fach.set(k % 90, (fach.get(k % 90) ?? 0) + len);
    }
  }
  let best = 0;
  let bestW = 0;
  for (const [k, w] of fach) {
    // Nachbarfächer mitzählen (Zeichenungenauigkeit)
    const summe = w + (fach.get((k + 0.25) % 90) ?? 0) + (fach.get((k + 89.75) % 90) ?? 0);
    if (summe > bestW) {
      bestW = summe;
      best = k;
    }
  }
  return best;
}

/** Richtungen der Gebäudeachsen (θ und θ + 90°) als Einheitsvektoren */
export function achsRichtungen(theta: number): [Point, Point] {
  const r = (theta * Math.PI) / 180;
  return [
    { x: Math.cos(r), y: Math.sin(r) },
    { x: -Math.sin(r), y: Math.cos(r) },
  ];
}

/**
 * Hilfslinien beim Verschieben des Eckpunkts `index` eines Polygons. `orig` sind die Punkte zu Beginn des
 * Ziehens – deren Kantenrichtungen bleiben die „bestehenden Verläufe“.
 */
export function eckpunktHilfslinien(orig: readonly Point[], index: number, theta: number): Hilfslinie[] {
  const n = orig.length;
  if (n < 3) return [];
  const cur = orig[index];
  const prev = orig[(index - 1 + n) % n];
  const next = orig[(index + 1) % n];
  const [ax, ay] = achsRichtungen(theta);
  const out: Hilfslinie[] = [];
  const add = (l: Hilfslinie) => {
    if (!out.some((x) => gleicheLinie(x, l))) out.push(l);
  };
  if (Math.hypot(cur.x - prev.x, cur.y - prev.y) > 1e-6) add({ p: prev, d: norm({ x: cur.x - prev.x, y: cur.y - prev.y }), art: 'kante' });
  if (Math.hypot(cur.x - next.x, cur.y - next.y) > 1e-6) add({ p: next, d: norm({ x: cur.x - next.x, y: cur.y - next.y }), art: 'kante' });
  for (const q of [prev, next]) {
    add({ p: q, d: ax, art: 'achse' });
    add({ p: q, d: ay, art: 'achse' });
  }
  // Fluchten zu den übrigen Eckpunkten derselben Fläche
  orig.forEach((q, i) => {
    if (i === index || q === prev || q === next) return;
    add({ p: q, d: ax, art: 'flucht' });
    add({ p: q, d: ay, art: 'flucht' });
  });
  return out;
}

/** Hilfslinien beim Zeichnen: Gebäudeachsen durch den letzten Punkt und Fluchten zum ersten Punkt */
export function zeichenHilfslinien(draft: readonly Point[], theta: number): Hilfslinie[] {
  if (!draft.length) return [];
  const [ax, ay] = achsRichtungen(theta);
  const last = draft[draft.length - 1];
  const out: Hilfslinie[] = [
    { p: last, d: ax, art: 'achse' },
    { p: last, d: ay, art: 'achse' },
  ];
  if (draft.length >= 2) {
    const first = draft[0];
    out.push({ p: first, d: ax, art: 'flucht' }, { p: first, d: ay, art: 'flucht' });
    const vor = draft[draft.length - 2];
    // Verlängerung der letzten Kante
    if (Math.hypot(last.x - vor.x, last.y - vor.y) > 1e-6) out.push({ p: last, d: norm({ x: last.x - vor.x, y: last.y - vor.y }), art: 'kante' });
  }
  return out.filter((l, i) => !out.slice(0, i).some((x) => gleicheLinie(x, l)));
}

/**
 * Fang an Hilfslinien: Schnittpunkt zweier Linien in Reichweite, sonst Lotfußpunkt auf der nächsten.
 * `toleranz` in Weltkoordinaten; `schritt` > 0 rundet den Abstand vom Ursprung der Linie (z. B. auf 5 cm).
 */
export function hilfslinienFang(raw: Point, linien: readonly Hilfslinie[], toleranz: number, schritt = 0): HilfsFang | null {
  const nah = linien.map((l) => ({ l, ...aufLinie(raw, l) })).filter((x) => x.dist <= toleranz);
  if (!nah.length) return null;
  nah.sort((a, b) => a.dist - b.dist);
  // Schnittpunkte
  let bestS: HilfsFang | null = null;
  let bestD = toleranz * 1.5;
  for (let i = 0; i < nah.length; i++) {
    for (let j = i + 1; j < nah.length; j++) {
      const s = schnitt(nah[i].l, nah[j].l);
      if (!s) continue;
      const d = Math.hypot(s.x - raw.x, s.y - raw.y);
      if (d < bestD) {
        bestD = d;
        bestS = { p: s, linien: [nah[i].l, nah[j].l] };
      }
    }
  }
  if (bestS) return bestS;
  const { l, t } = nah[0];
  const tt = schritt > 0 ? Math.round(t / schritt) * schritt : t;
  return { p: { x: l.p.x + l.d.x * tt, y: l.p.y + l.d.y * tt }, linien: [l] };
}

/** Rechtwinklig zur Gebäudeachse beschränken (Umschalttaste): der Achsrichtung folgen, die der Bewegung am nächsten ist */
export function achsBeschraenkt(origin: Point, p: Point, theta: number, schritt = 0): Point {
  const [ax, ay] = achsRichtungen(theta);
  const v = { x: p.x - origin.x, y: p.y - origin.y };
  const tx = v.x * ax.x + v.y * ax.y;
  const ty = v.x * ay.x + v.y * ay.y;
  const r = (t: number) => (schritt > 0 ? Math.round(t / schritt) * schritt : t);
  return Math.abs(tx) >= Math.abs(ty) ? { x: origin.x + ax.x * r(tx), y: origin.y + ax.y * r(tx) } : { x: origin.x + ay.x * r(ty), y: origin.y + ay.y * r(ty) };
}

/** Rechteck aus zwei Ecken, ausgerichtet an der Gebäudeachse */
export function achsRechteck(a: Point, b: Point, theta: number): Point[] {
  const [ax, ay] = achsRichtungen(theta);
  const v = { x: b.x - a.x, y: b.y - a.y };
  const u = v.x * ax.x + v.y * ax.y;
  const w = v.x * ay.x + v.y * ay.y;
  return [a, { x: a.x + ax.x * u, y: a.y + ax.y * u }, b, { x: a.x + ay.x * w, y: a.y + ay.y * w }];
}
