import type { Ebene, Foto } from '../model';
import { homographie, konvexesViereck } from './homographie';
import { abbilden, eigenSymmetrisch, inv, kreuz, mul, normierung, skalierung } from './mat';
import type { Mat3, Pt } from './mat';
import { entzeichnen, kamera, verzeichnen } from './verzeichnung';
import type { Kamera } from './verzeichnung';

/** Ergebnis der Entzerrung einer Ebene */
export interface Entzerrung {
  /** idealer Fotopunkt (px) → Ebene (m, y nach oben); w > 0 vor dem Horizont */
  h: Mat3;
  /** Ebene → idealer Fotopunkt */
  hInv: Mat3;
  kamera: Kamera;
  /** Restabweichungen der überbestimmten Angaben */
  residuen: Residuum[];
}

export interface Residuum {
  /** Bezug (Id des Passpunkts, der Linie oder des Maßes) */
  id: string;
  /** Abweichung in m bzw. Grad */
  wert: number;
  einheit: 'm' | '°';
}

export type Ergebnis = { ok: true; e: Entzerrung } | { ok: false; fehler: string };

export function zuEbene(e: Entzerrung, fotoPunkt: Pt): Pt & { w: number } {
  return abbilden(e.h, entzeichnen(e.kamera, fotoPunkt));
}

export function zuFoto(e: Entzerrung, ebenenPunkt: Pt): Pt & { w: number } {
  const u = abbilden(e.hInv, ebenenPunkt);
  return { ...verzeichnen(e.kamera, u), w: u.w };
}

/** Entzerrung der Ebene oder eine verständliche Meldung, was noch fehlt bzw. nicht stimmt */
export function entzerrung(foto: Foto, ebene: Ebene): Ergebnis {
  const kam = kamera(foto.breite, foto.hoehe, foto.linse);
  try {
    switch (ebene.methode) {
      case 'rechteck':
        return rechteck(ebene, kam);
      case 'passpunkte':
        return passpunkte(ebene, kam);
      case 'fluchtlinien':
        return fluchtlinien(ebene, kam);
    }
  } catch (err) {
    return { ok: false, fehler: err instanceof Error ? err.message : String(err) };
  }
}

function fertig(h: Mat3, kam: Kamera, bezug: Pt[], residuen: Residuum[]): Ergebnis {
  // Vorzeichen so, dass die Bezugspunkte vor dem Horizont liegen (w > 0)
  const w = bezug.map((p) => abbilden(h, p).w);
  if (w.every((v) => v < 0)) h = h.map((v) => -v);
  else if (!w.every((v) => v > 0)) {
    return { ok: false, fehler: 'Die Punkte lassen sich nicht als ebene Fläche deuten – liegen sie wirklich auf einer Ebene, ist die Reihenfolge richtig?' };
  }
  return { ok: true, e: { h, hInv: inv(h), kamera: kam, residuen } };
}

function rechteck(ebene: Ebene, kam: Kamera): Ergebnis {
  const { ecken, breite, hoehe } = ebene.rechteck;
  if (ecken.length < 4) return { ok: false, fehler: `Noch ${4 - ecken.length} Ecke${ecken.length === 3 ? '' : 'n'} des Rechtecks setzen.` };
  if (!breite || !hoehe || breite <= 0 || hoehe <= 0) return { ok: false, fehler: 'Breite und Höhe des Rechtecks eingeben.' };
  const ideal = ecken.map((p) => entzeichnen(kam, p));
  if (!konvexesViereck(ideal) || drehsinn(ideal) > 0) {
    return { ok: false, fehler: 'Die Ecken ergeben kein passendes Viereck – Reihenfolge prüfen: links unten, rechts unten, rechts oben, links oben.' };
  }
  const ziel = [
    { x: 0, y: 0 },
    { x: breite, y: 0 },
    { x: breite, y: hoehe },
    { x: 0, y: hoehe },
  ];
  return fertig(homographie(ideal, ziel), kam, ideal, []);
}

/** Vorzeichen des Umlaufs im Bild (y nach unten): negativ = links unten → rechts unten → rechts oben */
function drehsinn(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i].x * q.y - q.x * p[i].y;
  }
  return a;
}

function passpunkte(ebene: Ebene, kam: Kamera): Ergebnis {
  const pp = ebene.passpunkte.filter((p) => p.x !== undefined && p.y !== undefined);
  if (pp.length < 4) {
    const ohne = ebene.passpunkte.length - pp.length;
    return {
      ok: false,
      fehler: `Mindestens vier Passpunkte mit Koordinaten nötig (vorhanden: ${pp.length}${ohne ? `, ${ohne} ohne Koordinaten` : ''}).`,
    };
  }
  const ideal = pp.map((p) => entzeichnen(kam, p.bild));
  const ziel = pp.map((p) => ({ x: p.x!, y: p.y! }));
  const h = homographie(ideal, ziel);
  const residuen: Residuum[] =
    pp.length > 4
      ? pp.map((p, i) => {
          const q = abbilden(h, ideal[i]);
          return { id: p.id, wert: Math.hypot(q.x - ziel[i].x, q.y - ziel[i].y), einheit: 'm' as const };
        })
      : [];
  return fertig(h, kam, ideal, residuen);
}

/** Fluchtpunkt (homogen) als bestmöglicher Schnitt der Linien */
function fluchtpunkt(linien: number[][]): number[] {
  const m = new Array<number>(9).fill(0);
  for (const l of linien) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] += l[i] * l[j];
  return eigenSymmetrisch(m, 3).vektoren[0];
}

function fluchtlinien(ebene: Ebene, kam: Kamera): Ergebnis {
  const { waagerecht, senkrecht, masse } = ebene.fluchtlinien;
  if (waagerecht.length < 2 || senkrecht.length < 2) {
    return { ok: false, fehler: `Je mindestens zwei waagerechte und senkrechte Kanten nachziehen (vorhanden: ${waagerecht.length} waagerecht, ${senkrecht.length} senkrecht).` };
  }
  const mitLaenge = masse.filter((m) => m.laenge !== undefined && m.laenge > 0);
  if (mitLaenge.length < 2) {
    return { ok: false, fehler: 'Zwei bekannte Maße eintragen – am besten eine Breite und eine Höhe.' };
  }
  const id = (l: { a: Pt; b: Pt }) => ({ a: entzeichnen(kam, l.a), b: entzeichnen(kam, l.b) });
  const lw = waagerecht.map(id);
  const ls = senkrecht.map(id);
  const lm = mitLaenge.map(id);
  const alle = [...lw, ...ls].flatMap((l) => [l.a, l.b]);
  // normierte Bildkoordinaten: Ursprung im Schwerpunkt der Kanten (liegt sicher vor dem Horizont)
  const t = normierung(alle);
  const gerade = (l: { a: Pt; b: Pt }) => {
    const a = abbilden(t, l.a);
    const b = abbilden(t, l.b);
    const g = kreuz([a.x, a.y, 1], [b.x, b.y, 1]);
    const n = Math.hypot(g[0], g[1]);
    if (n < 1e-12) throw new Error('Eine Kante hat keine Länge.');
    return g.map((v) => v / n);
  };
  const vw = fluchtpunkt(lw.map(gerade));
  const vs = fluchtpunkt(ls.map(gerade));
  const horizont = kreuz(vw, vs);
  if (Math.abs(horizont[2]) < 1e-9 * Math.hypot(...horizont)) {
    throw new Error('Waagerechte und senkrechte Kanten laufen auf denselben Punkt zu – Kanten prüfen.');
  }
  // projektiver Anteil: Fluchtgerade ins Unendliche, im Schwerpunkt w = 1
  const hp: Mat3 = [1, 0, 0, 0, 1, 0, horizont[0] / horizont[2], horizont[1] / horizont[2], 1];
  // affiner Anteil: Fluchtrichtungen auf die Achsen
  const a = inv([vw[0], vs[0], 0, vw[1], vs[1], 0, 0, 0, 1]);
  let g = mul(a, mul(hp, t));

  // Richtungssinn: im Foto rechts → x wächst, im Foto oben → y wächst
  const c = { x: alle.reduce((s, p) => s + p.x, 0) / alle.length, y: alle.reduce((s, p) => s + p.y, 0) / alle.length };
  const p0 = abbilden(g, c);
  const sx = abbilden(g, { x: c.x + 1, y: c.y }).x < p0.x ? -1 : 1;
  const sy = abbilden(g, { x: c.x, y: c.y - 1 }).y < p0.y ? -1 : 1;
  g = mul(skalierung(sx, sy), g);

  // Maßstab je Achse aus den Maßen: a²·Δx² + b²·Δy² = L² (kleinste Quadrate)
  let s11 = 0;
  let s12 = 0;
  let s22 = 0;
  let r1 = 0;
  let r2 = 0;
  const deltas = lm.map((l) => {
    const p = abbilden(g, l.a);
    const q = abbilden(g, l.b);
    return [(q.x - p.x) ** 2, (q.y - p.y) ** 2];
  });
  deltas.forEach(([dx2, dy2], i) => {
    const l2 = mitLaenge[i].laenge! ** 2;
    // relativ gewichtet, damit kurze und lange Maße gleich zählen
    const w = 1 / (l2 * l2);
    s11 += w * dx2 * dx2;
    s12 += w * dx2 * dy2;
    s22 += w * dy2 * dy2;
    r1 += w * dx2 * l2;
    r2 += w * dy2 * l2;
  });
  const d = s11 * s22 - s12 * s12;
  if (d < 1e-6 * (s11 + s22) ** 2) {
    throw new Error('Die Maße zeigen in dieselbe Richtung – eines sollte eine Breite, eines eine Höhe sein.');
  }
  const a2 = (r1 * s22 - r2 * s12) / d;
  const b2 = (s11 * r2 - s12 * r1) / d;
  if (!(a2 > 0) || !(b2 > 0)) throw new Error('Die Maße passen nicht zu den Kanten – Maße und Kanten prüfen.');
  g = mul(skalierung(Math.sqrt(a2), Math.sqrt(b2)), g);

  // Ursprung links unten an den Kanten
  const pe = alle.map((p) => abbilden(g, p));
  g = mul(skalierung(1, 1, -Math.min(...pe.map((p) => p.x)), -Math.min(...pe.map((p) => p.y))), g);

  const residuen: Residuum[] = [];
  const winkel = (l: { a: Pt; b: Pt }, soll: 0 | 90) => {
    const p = abbilden(g, l.a);
    const q = abbilden(g, l.b);
    let w = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
    w = ((w % 180) + 180) % 180; // 0 … 180
    return soll === 0 ? Math.min(w, 180 - w) : Math.abs(w - 90);
  };
  if (lw.length > 2) lw.forEach((l, i) => residuen.push({ id: waagerecht[i].id, wert: winkel(l, 0), einheit: '°' }));
  if (ls.length > 2) ls.forEach((l, i) => residuen.push({ id: senkrecht[i].id, wert: winkel(l, 90), einheit: '°' }));
  if (lm.length > 2) {
    lm.forEach((l, i) => {
      const p = abbilden(g, l.a);
      const q = abbilden(g, l.b);
      residuen.push({ id: mitLaenge[i].id, wert: Math.abs(Math.hypot(q.x - p.x, q.y - p.y) - mitLaenge[i].laenge!), einheit: 'm' });
    });
  }
  return fertig(g, kam, alle, residuen);
}

/** Die Punkte im Foto, aus denen die Ebene bestimmt ist (für Bereich und Auflösung) */
export function bezugspunkte(ebene: Ebene): Pt[] {
  switch (ebene.methode) {
    case 'rechteck':
      return ebene.rechteck.ecken;
    case 'passpunkte':
      return ebene.passpunkte.map((p) => p.bild);
    case 'fluchtlinien': {
      const f = ebene.fluchtlinien;
      return [...f.waagerecht, ...f.senkrecht, ...f.masse].flatMap((l) => [l.a, l.b]);
    }
  }
}
