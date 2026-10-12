import { eigenSymmetrisch } from './mat';
import type { Pt } from './mat';

/**
 * Radiale Objektivverzeichnung (Brown, zwei Glieder) um die Bildmitte:
 *
 *   verzeichnet = c + (u − c) · (1 + k1·ρ² + k2·ρ⁴),   ρ = |u − c| / R,   R = halbe Bilddiagonale
 *
 * `u` ist der ideale (lochkamera-treue) Bildpunkt. Die Richtung ideal → verzeichnet ist geschlossen
 * berechenbar – das braucht das Entzerren jedes Ausgabepixels. Angeklickte Punkte werden numerisch
 * zurückgerechnet (`entzeichnen`).
 * k1 < 0: Tonnenverzeichnung (typisch Weitwinkel), k1 > 0: Kissenverzeichnung.
 */
export interface Linse {
  k1: number;
  k2: number;
}

export interface Kamera extends Linse {
  cx: number;
  cy: number;
  /** Bezugsradius: halbe Bilddiagonale in Pixeln */
  r: number;
}

export function kamera(breite: number, hoehe: number, linse: Linse | undefined): Kamera {
  return { cx: breite / 2, cy: hoehe / 2, r: Math.hypot(breite, hoehe) / 2, k1: linse?.k1 ?? 0, k2: linse?.k2 ?? 0 };
}

export const ohneVerzeichnung = (k: Linse) => k.k1 === 0 && k.k2 === 0;

/** idealer Punkt → Punkt im Foto */
export function verzeichnen(k: Kamera, u: Pt): Pt {
  const dx = u.x - k.cx;
  const dy = u.y - k.cy;
  const r2 = (dx * dx + dy * dy) / (k.r * k.r);
  const f = 1 + k.k1 * r2 + k.k2 * r2 * r2;
  return { x: k.cx + dx * f, y: k.cy + dy * f };
}

/** Punkt im Foto → idealer Punkt (Newton auf dem Radius) */
export function entzeichnen(k: Kamera, d: Pt): Pt {
  if (ohneVerzeichnung(k)) return d;
  const dx = d.x - k.cx;
  const dy = d.y - k.cy;
  const rd = Math.hypot(dx, dy) / k.r;
  if (rd === 0) return d;
  let ru = rd;
  for (let i = 0; i < 30; i++) {
    const r2 = ru * ru;
    const g = ru * (1 + k.k1 * r2 + k.k2 * r2 * r2) - rd;
    const dg = 1 + 3 * k.k1 * r2 + 5 * k.k2 * r2 * r2;
    if (dg <= 0) break;
    const schritt = g / dg;
    ru -= schritt;
    if (Math.abs(schritt) < 1e-12) break;
  }
  const s = ru / rd;
  return { x: k.cx + dx * s, y: k.cy + dy * s };
}

/**
 * Ist die Abbildung über das ganze Foto eindeutig (Radius wächst monoton bis in die Bildecken)?
 * Sonst falten sich die Ränder – solche Werte sind unbrauchbar.
 */
export function linseGueltig(k: Linse): boolean {
  for (let i = 0; i <= 60; i++) {
    const r2 = (i / 50) ** 2; // bis 1,2 × halbe Diagonale
    if (1 + 3 * k.k1 * r2 + 5 * k.k2 * r2 * r2 <= 0.05) return false;
    if (1 + k.k1 * r2 + k.k2 * r2 * r2 <= 0.05) return false;
  }
  return true;
}

/** mittlere quadratische Abweichung (px) der Punkte von ihrer Ausgleichsgeraden, je Linie und gesamt */
export function geradheit(linien: Pt[][]): { rms: number; je: number[] } {
  let summe = 0;
  let anzahl = 0;
  const je = linien.map((l) => {
    const d = abweichungen(l);
    const q = d.reduce((s, v) => s + v * v, 0);
    summe += q;
    anzahl += l.length;
    return l.length ? Math.sqrt(q / l.length) : 0;
  });
  return { rms: anzahl ? Math.sqrt(summe / anzahl) : 0, je };
}

/** senkrechte Abstände der Punkte zur Ausgleichsgeraden (Hauptachse der Punktwolke) */
function abweichungen(l: Pt[]): number[] {
  if (l.length < 3) return l.map(() => 0);
  const mx = l.reduce((s, p) => s + p.x, 0) / l.length;
  const my = l.reduce((s, p) => s + p.y, 0) / l.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of l) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  const { vektoren } = eigenSymmetrisch([sxx, sxy, sxy, syy], 2);
  const [nx, ny] = vektoren[0]; // Normale = Richtung der kleinsten Streuung
  return l.map((p) => (p.x - mx) * nx + (p.y - my) * ny);
}

export interface Schaetzung extends Linse {
  /** Geradheit vorher/nachher (px, mittlere Abweichung von der Geraden) */
  vorher: number;
  nachher: number;
  /** nur k1 geschätzt (zu wenig Linien für k2) */
  nurK1: boolean;
}

/**
 * Schätzt k1 (und bei genug Linien k2) so, dass die Hilfslinien nach dem Entzeichnen möglichst gerade sind.
 * `linien`: im Foto gekrümmte, in Wirklichkeit gerade Kanten (je mindestens drei Punkte).
 */
export function schaetzeLinse(breite: number, hoehe: number, linien: Pt[][]): Schaetzung {
  const brauchbar = linien.filter((l) => l.length >= 3);
  if (!brauchbar.length) throw new Error('Mindestens eine Hilfslinie mit drei Punkten nötig');
  const nurK1 = brauchbar.length < 3 || brauchbar.reduce((s, l) => s + l.length, 0) < 12;
  const kosten = (k1: number, k2: number) => {
    const linse = { k1, k2 };
    if (!linseGueltig(linse)) return Infinity;
    const k = kamera(breite, hoehe, linse);
    // relativ zur Länge der Linie (in Promille), damit lange Linien nicht allein bestimmen
    let s = 0;
    for (const l of brauchbar) {
      const u = l.map((p) => entzeichnen(k, p));
      const laenge = Math.max(1, Math.hypot(u[u.length - 1].x - u[0].x, u[u.length - 1].y - u[0].y));
      for (const d of abweichungen(u)) s += ((1000 * d) / laenge) ** 2;
    }
    // schwache Dämpfung von k2: nicht bestimmbare Anteile bleiben klein
    return s + 1e-4 * k2 * k2;
  };
  const start: number[][] = nurK1 ? [[0], [-0.1]] : [[0, 0], [-0.1, 0], [0, -0.05]];
  const f = nurK1 ? (v: number[]) => kosten(v[0], 0) : (v: number[]) => kosten(v[0], v[1]);
  const best = nelderMead(f, start, 400);
  const linse = { k1: best[0], k2: nurK1 ? 0 : best[1] };
  const k = kamera(breite, hoehe, linse);
  return {
    ...linse,
    vorher: geradheit(brauchbar).rms,
    nachher: geradheit(brauchbar.map((l) => l.map((p) => entzeichnen(k, p)))).rms,
    nurK1,
  };
}

/** Nelder-Mead-Simplexverfahren (Startsimplex mit n+1 Punkten) */
export function nelderMead(f: (v: number[]) => number, simplex: number[][], iterationen: number): number[] {
  const n = simplex[0].length;
  let s = simplex.map((p) => ({ p, v: f(p) }));
  for (let it = 0; it < iterationen; it++) {
    s.sort((a, b) => a.v - b.v);
    const spanne = Math.max(...s.slice(1).map((e) => Math.max(...e.p.map((x, i) => Math.abs(x - s[0].p[i])))));
    if (spanne < 1e-10) break;
    const mitte = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) mitte[j] += s[i].p[j] / n;
    const schlecht = s[n];
    const punkt = (t: number) => mitte.map((m, j) => m + t * (schlecht.p[j] - m));
    const r = punkt(-1);
    const fr = f(r);
    if (fr < s[0].v) {
      const e = punkt(-2);
      const fe = f(e);
      s[n] = fe < fr ? { p: e, v: fe } : { p: r, v: fr };
    } else if (fr < s[n - 1].v) {
      s[n] = { p: r, v: fr };
    } else {
      const c = fr < schlecht.v ? punkt(-0.5) : punkt(0.5);
      const fc = f(c);
      if (fc < Math.min(fr, schlecht.v)) s[n] = { p: c, v: fc };
      else s = s.map((e, i) => (i === 0 ? e : { p: e.p.map((x, j) => s[0].p[j] + 0.5 * (x - s[0].p[j])), v: NaN })).map((e) => (Number.isNaN(e.v) ? { p: e.p, v: f(e.p) } : e));
    }
  }
  s.sort((a, b) => a.v - b.v);
  return s[0].p;
}
