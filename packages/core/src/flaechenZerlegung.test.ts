import { describe, expect, it } from 'vitest';
import type { Point } from './geometry';
import { polygonArea, rectPoints } from './geometry';
import { flaecheZerlegen, teilFormel } from './flaechenZerlegung';

const summe = (z: ReturnType<typeof flaecheZerlegen>) => z.teile.reduce((s, t) => s + t.flaeche, 0);
const drehe = (pts: Point[], grad: number): Point[] => {
  const r = (grad * Math.PI) / 180;
  return pts.map((p) => ({ x: p.x * Math.cos(r) - p.y * Math.sin(r) + 100, y: p.x * Math.sin(r) + p.y * Math.cos(r) + 50 }));
};

describe('Zerlegung von Flächen in Rechtecke und Dreiecke', () => {
  it('Rechteck: ein Teil Länge × Breite', () => {
    const z = flaecheZerlegen([{ aussen: rectPoints({ x: 12, y: 0 }, { x: 15, y: 5 }) }]);
    expect(z.zerlegt).toBe(true);
    expect(z.teile).toHaveLength(1);
    expect([z.teile[0].laenge, z.teile[0].breite].sort()).toEqual([3, 5]);
    expect(z.teile[0].flaeche).toBeCloseTo(15, 9);
    expect(teilFormel(z.teile[0])).toMatch(/^(3,00 × 5,00|5,00 × 3,00) = 15,00 m²$/);
  });

  it('L-Form (auch schräg zur Planachse): Rechtecke, Summe = Fläche aus Koordinaten', () => {
    const L: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 9 },
      { x: 0, y: 9 },
    ];
    for (const pts of [L, drehe(L, 23)]) {
      const z = flaecheZerlegen([{ aussen: pts }]);
      expect(z.zerlegt).toBe(true);
      expect(z.teile.every((t) => t.art === 'rechteck')).toBe(true);
      expect(z.teile).toHaveLength(2);
      expect(summe(z)).toBeCloseTo(polygonArea(pts), 9);
      expect(z.flaeche).toBeCloseTo(10 * 4 + 4 * 5, 9);
    }
  });

  it('Ring (Garten um das Haus): Rechtecke ohne das Loch', () => {
    const z = flaecheZerlegen([{ aussen: rectPoints({ x: -5, y: -5 }, { x: 17, y: 16 }), loecher: [rectPoints({ x: 0, y: 0 }, { x: 12, y: 11.25 })] }]);
    expect(z.zerlegt).toBe(true);
    expect(summe(z)).toBeCloseTo(22 * 21 - 12 * 11.25, 9);
  });

  it('Dreieck und schiefes Viereck: Grundseite × Höhe / 2', () => {
    const tri: Point[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 1, y: 3 },
    ];
    const z = flaecheZerlegen([{ aussen: tri }]);
    expect(z.teile).toHaveLength(1);
    expect(z.teile[0].art).toBe('dreieck');
    expect(z.teile[0].laenge * z.teile[0].breite * 0.5).toBeCloseTo(6, 9);
    expect(teilFormel(z.teile[0])).toContain(' / 2 = 6,00 m²');
    const trapez: Point[] = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 5, y: 3 },
      { x: 1.5, y: 3.2 },
    ];
    const t = flaecheZerlegen([{ aussen: trapez }]);
    expect(t.teile).toHaveLength(2);
    expect(summe(t)).toBeCloseTo(polygonArea(trapez), 9);
  });

  it('zu viele Teile: keine Zerlegung, Fläche aus Koordinaten', () => {
    const kreis: Point[] = Array.from({ length: 24 }, (_, i) => ({ x: 5 * Math.cos((i * Math.PI) / 12), y: 5 * Math.sin((i * Math.PI) / 12) }));
    const z = flaecheZerlegen([{ aussen: kreis }]);
    expect(z.zerlegt).toBe(false);
    expect(z.flaeche).toBeCloseTo(polygonArea(kreis), 9);
  });
});
