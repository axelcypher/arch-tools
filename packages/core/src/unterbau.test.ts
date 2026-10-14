import { describe, expect, it } from 'vitest';
import { computeProject, outlineVolume, unterbau } from './calc';
import { rectPoints } from './geometry';
import { createOutline, createProject, createRoom, createStorey } from './model';
import { briKoerper, briRechenweg } from './rechenweg';

/** KG 10 × 8 unter einem EG 14 × 8 (4 m nicht unterkellert) */
function haus() {
  const p = createProject();
  const kg = createStorey('KG', 2.8);
  const eg = createStorey('EG', 3);
  kg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
  eg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 14, y: 8 })));
  p.storeys = [kg, eg];
  return { p, kg, eg };
}

describe('BRI unter dem Geschossfußboden', () => {
  it('Bodenplatte des untersten Geschosses: ganze Fläche × Sohlendicke', () => {
    const { p, kg } = haus();
    kg.sohle = 0.3;
    expect(outlineVolume(kg.shapes[0] as never, kg, p)).toBeCloseTo(80 * 2.8 + 80 * 0.3, 9);
  });

  it('Bodenplatte eines Geschosses nur dort, wo kein Geschoss darunter liegt', () => {
    const { p, eg } = haus();
    eg.sohle = 0.25;
    const t = unterbau(eg.shapes[0] as never, eg, p);
    expect(t).toHaveLength(1);
    expect(t[0].flaeche).toBeCloseTo(4 * 8, 6);
    expect(outlineVolume(eg.shapes[0] as never, eg, p)).toBeCloseTo(112 * 3 + 32 * 0.25, 6);
  });

  it('tiefer liegender Raum (Split-Level) vergrößert den BRI um Raumfläche × Absenkung', () => {
    const { p, eg } = haus();
    const r = createRoom(rectPoints({ x: 10.2, y: 0.2 }, { x: 13.8, y: 7.8 }), '0.01', 'Wohnen');
    r.versatz = -0.6;
    eg.shapes.push(r);
    const t = unterbau(eg.shapes[0] as never, eg, p);
    expect(t.map((x) => x.art)).toEqual(['absenkung']);
    expect(t[0].flaeche * t[0].hoehe).toBeCloseTo(3.6 * 7.6 * 0.6, 9);
    expect(computeProject(p).storeys[1].bri.total).toBeCloseTo(112 * 3 + 3.6 * 7.6 * 0.6, 6);
  });

  it('abgesenkter Umriss: Körper beginnt tiefer, Räume darin nur gegenüber dem Umriss', () => {
    const { p, eg } = haus();
    const ol = eg.shapes[0];
    ol.versatz = -0.5;
    const r = createRoom(rectPoints({ x: 1, y: 1 }, { x: 3, y: 3 }), '0.01', 'Lager');
    r.versatz = -0.5; // liegt auf dem Fußboden des Umrisses → keine weitere Absenkung
    eg.shapes.push(r);
    expect(outlineVolume(ol as never, eg, p)).toBeCloseTo(112 * 3.5, 9);
  });

  it('höher liegender Umriss verkleinert den Körper', () => {
    const { p, kg } = haus();
    kg.shapes[0].versatz = 0.4;
    expect(outlineVolume(kg.shapes[0] as never, kg, p)).toBeCloseTo(80 * 2.4, 9);
  });

  it('Rechenweg und Körper weisen Bodenplatte und Absenkung aus – Summe = BRI', () => {
    const { p, kg, eg } = haus();
    kg.sohle = 0.3;
    eg.sohle = 0.25;
    const r = createRoom(rectPoints({ x: 11, y: 1 }, { x: 13, y: 7 }), '0.01', 'Wohnen');
    r.versatz = -0.45;
    eg.shapes.push(r);
    const bri = computeProject(p).total.bri.total;
    const rw = briRechenweg(p);
    expect(rw.reduce((a, s) => a + s.volumen, 0)).toBeCloseTo(bri, 6);
    expect(rw.filter((s) => s.unterbau).map((s) => s.unterbau)).toEqual(['sohle', 'absenkung', 'sohle']);
    expect(briKoerper(p).reduce((a, k) => a + k.volumen, 0)).toBeCloseTo(bri, 6);
  });
});
