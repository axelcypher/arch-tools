import { describe, expect, it } from 'vitest';
import { achsBeschraenkt, achsRechteck, eckpunktHilfslinien, gebaeudeAchse, hilfslinienFang, zeichenHilfslinien } from './fang';
import type { Point } from './geometry';

/** Rechteck 10 × 6, um 23° gedreht (genordeter Plan) */
const rot = (p: Point, w = 23): Point => {
  const r = (w * Math.PI) / 180;
  return { x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) };
};
const haus = [rot({ x: 0, y: 0 }), rot({ x: 10, y: 0 }), rot({ x: 10, y: 6 }), rot({ x: 0, y: 6 })];

describe('Hilfslinienfang', () => {
  it('erkennt die Gebäudeachse schräg stehender Gebäude', () => {
    expect(gebaeudeAchse([haus])).toBeCloseTo(23, 0);
    expect(gebaeudeAchse([])).toBe(0);
  });

  it('hält einen verschobenen Eckpunkt auf der Verlängerung seiner Kante', () => {
    const linien = eckpunktHilfslinien(haus, 1, 23);
    // Maus knapp neben der Verlängerung der Kante 0→1 (12 m statt 10 m, 3 cm daneben)
    const ziel = rot({ x: 12, y: 0.03 });
    const f = hilfslinienFang(ziel, linien, 0.1)!;
    const lokal = rot(f.p, -23);
    expect(lokal.y).toBeCloseTo(0, 9);
    expect(lokal.x).toBeCloseTo(12, 6);
  });

  it('fängt den Schnittpunkt zweier Verläufe (Ecke bleibt rechtwinklig)', () => {
    const linien = eckpunktHilfslinien(haus, 2, 23);
    const f = hilfslinienFang(rot({ x: 10.04, y: 6.05 }), linien, 0.1)!;
    expect(f.linien).toHaveLength(2);
    const lokal = rot(f.p, -23);
    expect(lokal.x).toBeCloseTo(10, 9);
    expect(lokal.y).toBeCloseTo(6, 9);
  });

  it('rundet den Abstand entlang der Hilfslinie auf das Raster', () => {
    const linien = eckpunktHilfslinien(haus, 1, 23);
    const f = hilfslinienFang(rot({ x: 11.237, y: 0.01 }), linien, 0.1, 0.05)!;
    expect(rot(f.p, -23).x).toBeCloseTo(11.25, 9);
  });

  it('außerhalb der Reichweite kein Fang', () => {
    expect(hilfslinienFang(rot({ x: 5, y: 3 }), eckpunktHilfslinien(haus, 1, 23), 0.1)).toBeNull();
  });

  it('Umschalt beschränkt auf die Gebäudeachse, Rechtecke folgen ihr', () => {
    const o = haus[0];
    const q = achsBeschraenkt(o, rot({ x: 4, y: 0.4 }), 23);
    expect(rot(q, -23).y).toBeCloseTo(0, 9);
    const r = achsRechteck(o, rot({ x: 4, y: 3 }), 23).map((p) => rot(p, -23));
    expect(r[1].x).toBeCloseTo(4, 9);
    expect(r[1].y).toBeCloseTo(0, 9);
    expect(r[3].x).toBeCloseTo(0, 9);
    expect(r[3].y).toBeCloseTo(3, 9);
  });

  it('Zeichnen: Achsen durch den letzten Punkt, Flucht zum Startpunkt', () => {
    const l = zeichenHilfslinien([haus[0], haus[1]], 23);
    // Flucht durch den Startpunkt rechtwinklig zur Achse → schließt das Rechteck
    const f = hilfslinienFang(rot({ x: 0.02, y: 6 }), [...l, ...zeichenHilfslinien([haus[0], haus[1], haus[2]], 23)], 0.1)!;
    expect(rot(f.p, -23).x).toBeCloseTo(0, 6);
  });
});
