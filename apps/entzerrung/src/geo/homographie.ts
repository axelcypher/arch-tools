import { abbilden, eigenSymmetrisch, inv, mul, normiert, normierung } from './mat';
import type { Mat3, Pt } from './mat';

/**
 * Homographie H mit H·quelle[i] ≈ ziel[i] aus mindestens vier Punktpaaren (normierte DLT nach Hartley).
 * Bei mehr als vier Punkten im Sinne der kleinsten Quadrate (algebraischer Fehler).
 */
export function homographie(quelle: Pt[], ziel: Pt[]): Mat3 {
  if (quelle.length !== ziel.length) throw new Error('Ungleich viele Punkte');
  if (quelle.length < 4) throw new Error('Mindestens vier Punkte nötig');
  const tq = normierung(quelle);
  const tz = normierung(ziel);
  const q = quelle.map((p) => abbilden(tq, p));
  const z = ziel.map((p) => abbilden(tz, p));

  // AᵀA direkt aufsummieren (9×9)
  const ata = new Array<number>(81).fill(0);
  const zeile = (r: number[]) => {
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) ata[i * 9 + j] += r[i] * r[j];
  };
  for (let i = 0; i < q.length; i++) {
    const { x, y } = q[i];
    const { x: X, y: Y } = z[i];
    zeile([0, 0, 0, -x, -y, -1, Y * x, Y * y, Y]);
    zeile([x, y, 1, 0, 0, 0, -X * x, -X * y, -X]);
  }
  const { werte, vektoren } = eigenSymmetrisch(ata, 9);
  // mit vier Punkten ist der zweitkleinste Eigenwert deutlich > 0, solange keine drei Punkte auf einer Geraden liegen
  if (werte[1] < 1e-10 * Math.max(1, werte[8])) throw new Error('Die Punkte liegen (fast) auf einer Geraden');
  const hn = vektoren[0];
  return normiert(mul(inv(tz), mul(hn, tq)));
}

/** true, wenn die vier Punkte ein konvexes, sich nicht selbst schneidendes Viereck bilden */
export function konvexesViereck(p: Pt[]): boolean {
  if (p.length !== 4) return false;
  let vorzeichen = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i];
    const b = p[(i + 1) % 4];
    const c = p[(i + 2) % 4];
    const k = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(k) < 1e-12) return false;
    const s = Math.sign(k);
    if (vorzeichen === 0) vorzeichen = s;
    else if (s !== vorzeichen) return false;
  }
  return true;
}
