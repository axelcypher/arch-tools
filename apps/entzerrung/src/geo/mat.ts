/**
 * Kleine lineare Algebra für 3×3-Matrizen (Zeilen zuerst) und symmetrische Eigenwertprobleme.
 */

export interface Pt {
  x: number;
  y: number;
}

/** 3×3-Matrix, zeilenweise: [a, b, c, d, e, f, g, h, i] */
export type Mat3 = number[];

export const EINHEIT: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

export function det(m: Mat3): number {
  return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
}

export function inv(m: Mat3): Mat3 {
  const d = det(m);
  if (!Number.isFinite(d) || d === 0) throw new Error('Matrix ist nicht umkehrbar');
  return [
    (m[4] * m[8] - m[5] * m[7]) / d,
    (m[2] * m[7] - m[1] * m[8]) / d,
    (m[1] * m[5] - m[2] * m[4]) / d,
    (m[5] * m[6] - m[3] * m[8]) / d,
    (m[0] * m[8] - m[2] * m[6]) / d,
    (m[2] * m[3] - m[0] * m[5]) / d,
    (m[3] * m[7] - m[4] * m[6]) / d,
    (m[1] * m[6] - m[0] * m[7]) / d,
    (m[0] * m[4] - m[1] * m[3]) / d,
  ];
}

/** Bildet einen Punkt projektiv ab. `w` ist der homogene Nenner (≤ 0: hinter dem Horizont). */
export function abbilden(m: Mat3, p: Pt): Pt & { w: number } {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w, w };
}

/** Skaliert die Matrix so, dass ihre Frobeniusnorm 1 ist (projektiv gleichwertig) */
export function normiert(m: Mat3): Mat3 {
  const n = Math.hypot(...m);
  return m.map((v) => v / n);
}

export function skalierung(sx: number, sy: number, tx = 0, ty = 0): Mat3 {
  return [sx, 0, tx, 0, sy, ty, 0, 0, 1];
}

export function kreuz(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export const abstand = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Eigenwerte und -vektoren einer symmetrischen n×n-Matrix (zeilenweise) nach Jacobi.
 * Ergebnis aufsteigend sortiert; `vektoren[k]` gehört zu `werte[k]`.
 */
export function eigenSymmetrisch(a: number[], n: number): { werte: number[]; vektoren: number[][] } {
  const m = a.slice();
  const v = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += m[p * n + q] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = m[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (m[q * n + q] - m[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const mkp = m[k * n + p];
          const mkq = m[k * n + q];
          m[k * n + p] = c * mkp - s * mkq;
          m[k * n + q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k++) {
          const mpk = m[p * n + k];
          const mqk = m[q * n + k];
          m[p * n + k] = c * mpk - s * mqk;
          m[q * n + k] = s * mpk + c * mqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p];
          const vkq = v[k * n + q];
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const idx = [...Array(n).keys()].sort((i, j) => m[i * n + i] - m[j * n + j]);
  return {
    werte: idx.map((i) => m[i * n + i]),
    vektoren: idx.map((i) => [...Array(n).keys()].map((k) => v[k * n + i])),
  };
}

/** Verschiebt den Schwerpunkt in den Ursprung und skaliert auf mittleren Abstand √2 (Hartley) */
export function normierung(pts: Pt[]): Mat3 {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const d = pts.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / pts.length;
  const s = d > 0 ? Math.SQRT2 / d : 1;
  return [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1];
}
