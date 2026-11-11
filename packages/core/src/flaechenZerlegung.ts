import type { Point } from './geometry';
import { polygonArea } from './geometry';

/**
 * Rechenweg einer Fläche: Zerlegung in Rechtecke (Länge × Breite) bzw. Dreiecke (Grundseite × Höhe / 2), wie sie
 * Bauamts-Formulare für GRZ-Nachweise verlangen. Die Summe der Teilflächen ist exakt die Fläche des Polygons.
 *
 *  - Rechtwinklige Flächen (alle Kanten parallel oder senkrecht zueinander, auch schräg zur Planachse und mit
 *    Löchern): Streifen entlang der Achse, gleiche Streifen nebeneinander zu einem Rechteck zusammengefasst
 *  - sonst, ohne Löcher: Dreiecke (Ohrenschneiden), Grundseite = längste Seite
 *  - mehr Teile als `maxTeile` oder keine saubere Zerlegung: keine Teile – „Fläche aus Koordinaten“ (Gauß)
 *
 * Zu Vergleich: rechenweg.ts zerlegt die BGF-Umrisse für den Brutto-Rauminhalt in Teilkörper.
 */

export interface Teilflaeche {
  art: 'rechteck' | 'dreieck';
  /** Länge bzw. Grundseite g [m] */
  laenge: number;
  /** Breite bzw. Höhe h [m] */
  breite: number;
  /** 1 Rechteck, ½ Dreieck; negativ für Abzüge */
  faktor: number;
  /** laenge × breite × faktor (mit Vorzeichen) */
  flaeche: number;
  /** Eckpunkte (für die Skizze) */
  punkte: Point[];
}

export interface Zerlegung {
  teile: Teilflaeche[];
  /** Fläche aus den Koordinaten (Gauß) – gleich der Summe der Teile */
  flaeche: number;
  /** false: keine saubere Zerlegung, die Fläche gilt aus den Koordinaten */
  zerlegt: boolean;
}

export interface FlaechenPolygon {
  aussen: readonly Point[];
  loecher?: readonly (readonly Point[])[];
}

const TOL = 1e-6;

const drehe = (p: Point, c: number, s: number): Point => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });

/** Richtung der längsten Kante (rad) */
function hauptrichtung(ringe: readonly (readonly Point[])[]): number {
  let best = 0;
  let w = 0;
  for (const r of ringe)
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l > best) {
        best = l;
        w = Math.atan2(b.y - a.y, b.x - a.x);
      }
    }
  return w;
}

/** Rechtecke einer rechtwinkligen Fläche (Ringe gerade-ungerade, also mit Löchern) – null, wenn nicht rechtwinklig */
function rechteckeZerlegen(ringe: readonly (readonly Point[])[]): Teilflaeche[] | null {
  const w = hauptrichtung(ringe);
  const c = Math.cos(-w);
  const s = Math.sin(-w);
  const rr = ringe.map((r) => r.map((p) => drehe(p, c, s)));
  // Kanten: waagerecht (y fest) oder senkrecht – sonst keine Rechteckzerlegung
  const waagerecht: { x0: number; x1: number; y: number }[] = [];
  for (const r of rr)
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      if (dx < TOL && dy < TOL) continue;
      if (dy < TOL) waagerecht.push({ x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y: (a.y + b.y) / 2 });
      else if (dx >= TOL) return null;
    }
  const xs = [...new Set(rr.flat().map((p) => p.x))].sort((a, b) => a - b).filter((x, i, l) => i === 0 || x - l[i - 1] > TOL);
  type Offen = { x0: number; y0: number; y1: number };
  let offen: Offen[] = [];
  const fertig: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const xm = (xs[i] + xs[i + 1]) / 2;
    const ys = waagerecht
      .filter((k) => k.x0 < xm && k.x1 > xm)
      .map((k) => k.y)
      .sort((a, b) => a - b);
    const iv: [number, number][] = [];
    for (let k = 0; k + 1 < ys.length; k += 2) if (ys[k + 1] - ys[k] > TOL) iv.push([ys[k], ys[k + 1]]);
    const weiter: Offen[] = [];
    for (const [y0, y1] of iv) {
      const o = offen.find((x) => Math.abs(x.y0 - y0) < TOL && Math.abs(x.y1 - y1) < TOL);
      weiter.push(o ?? { x0: xs[i], y0, y1 });
    }
    for (const o of offen) if (!weiter.includes(o)) fertig.push({ ...o, x1: xs[i] });
    offen = weiter;
  }
  for (const o of offen) fertig.push({ ...o, x1: xs[xs.length - 1] });
  const ci = Math.cos(w);
  const si = Math.sin(w);
  return fertig.map((r) => {
    const laenge = r.x1 - r.x0;
    const breite = r.y1 - r.y0;
    const punkte = [
      { x: r.x0, y: r.y0 },
      { x: r.x1, y: r.y0 },
      { x: r.x1, y: r.y1 },
      { x: r.x0, y: r.y1 },
    ].map((p) => drehe(p, ci, si));
    return { art: 'rechteck' as const, laenge, breite, faktor: 1, flaeche: laenge * breite, punkte };
  });
}

const kreuz = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function imDreieck(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = kreuz(a, b, p);
  const d2 = kreuz(b, c, p);
  const d3 = kreuz(c, a, p);
  return d1 >= -1e-12 && d2 >= -1e-12 && d3 >= -1e-12;
}

/** Dreiecke eines einfachen Polygons (Ohrenschneiden) – null, wenn es nicht aufgeht (überschlagen) */
function dreieckeZerlegen(ring: readonly Point[]): Teilflaeche[] | null {
  // gegen den Uhrzeigersinn (mathematisch positiv) ordnen, doppelte und gerade Punkte entfernen
  let pts = ring.filter((p, i) => {
    const q = ring[(i + 1) % ring.length];
    return Math.hypot(q.x - p.x, q.y - p.y) > TOL;
  });
  let a2 = 0;
  for (let i = 0; i < pts.length; i++) a2 += pts[i].x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * pts[i].y;
  if (a2 < 0) pts = [...pts].reverse();
  pts = pts.filter((p, i) => Math.abs(kreuz(pts[(i - 1 + pts.length) % pts.length], p, pts[(i + 1) % pts.length])) > 1e-10);
  const out: Teilflaeche[] = [];
  let guard = 0;
  while (pts.length > 3 && guard++ < 1000) {
    let ohr = -1;
    for (let i = 0; i < pts.length && ohr < 0; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      if (kreuz(a, b, c) <= 1e-12) continue;
      if (pts.some((p) => p !== a && p !== b && p !== c && imDreieck(p, a, b, c))) continue;
      ohr = i;
    }
    if (ohr < 0) return null;
    const n = pts.length;
    out.push(dreieck(pts[(ohr - 1 + n) % n], pts[ohr], pts[(ohr + 1) % n]));
    pts = pts.filter((_, i) => i !== ohr);
  }
  if (pts.length === 3) out.push(dreieck(pts[0], pts[1], pts[2]));
  return out;
}

/** Dreieck mit der längsten Seite als Grundseite g und der Höhe h darauf */
function dreieck(a: Point, b: Point, c: Point): Teilflaeche {
  const seiten: [Point, Point][] = [
    [a, b],
    [b, c],
    [c, a],
  ];
  const g = Math.max(...seiten.map(([p, q]) => Math.hypot(q.x - p.x, q.y - p.y)));
  const A = Math.abs(kreuz(a, b, c)) / 2;
  return { art: 'dreieck', laenge: g, breite: (2 * A) / g, faktor: 0.5, flaeche: A, punkte: [a, b, c] };
}

/** Zerlegt Flächen (Außenring mit Löchern) in Rechtecke bzw. Dreiecke; Summe der Teile = Fläche */
export function flaecheZerlegen(polygone: readonly FlaechenPolygon[], o: { maxTeile?: number } = {}): Zerlegung {
  const maxTeile = o.maxTeile ?? 8;
  const flaeche = polygone.reduce((s, p) => s + polygonArea(p.aussen as Point[]) - (p.loecher ?? []).reduce((t, h) => t + polygonArea(h as Point[]), 0), 0);
  const ringe = polygone.flatMap((p) => [p.aussen, ...(p.loecher ?? [])]).filter((r) => r.length >= 3);
  if (!ringe.length || flaeche < 1e-9) return { teile: [], flaeche, zerlegt: false };
  const rechtecke = rechteckeZerlegen(ringe);
  if (rechtecke && rechtecke.length <= maxTeile) return { teile: rechtecke, flaeche, zerlegt: true };
  if (!polygone.some((p) => p.loecher?.length)) {
    const dreiecke: Teilflaeche[] = [];
    for (const p of polygone) {
      const d = dreieckeZerlegen(p.aussen);
      if (!d) return { teile: [], flaeche, zerlegt: false };
      dreiecke.push(...d);
    }
    if (dreiecke.length <= maxTeile && Math.abs(dreiecke.reduce((s, t) => s + t.flaeche, 0) - flaeche) < 1e-6) return { teile: dreiecke, flaeche, zerlegt: true };
  }
  return { teile: [], flaeche, zerlegt: false };
}

const f2 = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formel einer Teilfläche: „3,00 × 5,00 = 15,00 m²“ bzw. „4,00 × 3,00 / 2 = 6,00 m²“ */
export function teilFormel(t: Teilflaeche): string {
  const v = t.faktor < 0 ? '− ' : '';
  const f = Math.abs(t.faktor) === 0.5 ? ' / 2' : '';
  return `${v}${f2(t.laenge)} × ${f2(t.breite)}${f} = ${f2(t.flaeche)} m²`;
}
