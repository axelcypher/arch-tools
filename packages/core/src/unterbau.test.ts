import { describe, expect, it } from 'vitest';
import { computeProject, modellRoofParams, outlineVolume, unterbau } from './calc';
import { rectPoints } from './geometry';
import type { OutlineShape } from './model';
import { createOutline, createProject, createRoom, createStorey } from './model';
import { briKoerper, briRechenweg } from './rechenweg';
import { outlineFaces, unterbauKoerper } from './ui/three3d';

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

  it('abgesenkter Umriss: der ganze Körper wandert, sein Rauminhalt bleibt; Räume darin nur gegenüber dem Umriss', () => {
    const { p, eg } = haus();
    const ol = eg.shapes[0];
    ol.versatz = -0.5;
    const r = createRoom(rectPoints({ x: 1, y: 1 }, { x: 3, y: 3 }), '0.01', 'Lager');
    r.versatz = -0.5; // liegt auf der Unterkante des Körpers → keine weitere Absenkung
    eg.shapes.push(r);
    expect(unterbau(ol as never, eg, p)).toHaveLength(0);
    expect(outlineVolume(ol as never, eg, p)).toBeCloseTo(112 * 3, 9);
  });

  it('Höhenversatz und Körperhöhe: Körper von Versatz bis Versatz + Körperhöhe, Bodenplatte darunter', () => {
    const { p, eg } = haus();
    const ol = eg.shapes[0] as OutlineShape;
    ol.versatz = 0.5;
    ol.hoehe = 2;
    eg.sohle = 0.25;
    expect(outlineVolume(ol, eg, p)).toBeCloseTo(112 * 2 + 32 * 0.25, 9);
    const f = outlineFaces(ol, p, 0, eg.hoehe, eg);
    const zs = [...f.bottom, ...f.tops.flat(), ...f.sides.flat()].map((q) => q.z);
    expect(Math.min(...zs)).toBeCloseTo(0.5, 9);
    expect(Math.max(...zs)).toBeCloseTo(2.5, 9);
    const sohle = unterbauKoerper(ol, eg, p).find((u) => u.art === 'sohle')!;
    expect(sohle.oben).toBeCloseTo(0.5, 9);
    expect(sohle.unten).toBeCloseTo(0.25, 9);
  });

  it('Dach aus dem Modell: Höhen gelten ab der Unterkante des verschobenen Körpers', () => {
    const { p, eg } = haus();
    const ol = eg.shapes[0] as OutlineShape;
    ol.versatz = -0.4;
    expect(modellRoofParams(p, eg, ol).floorZ).toBeCloseTo(2.8 - 0.4, 9);
  });

  it('Split-Level über einem Keller zählt nicht doppelt', () => {
    const p = createProject();
    const kg = createStorey('KG', 2.8);
    const eg = createStorey('EG', 3);
    kg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    eg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    const r = createRoom(rectPoints({ x: 1, y: 1 }, { x: 5, y: 5 }), '0.01', 'Wohnen');
    r.versatz = -0.6;
    eg.shapes.push(r);
    p.storeys = [kg, eg];
    expect(unterbau(eg.shapes[0] as never, eg, p)).toHaveLength(0);
    expect(computeProject(p).total.bri.total).toBeCloseTo(80 * 2.8 + 80 * 3, 9);
  });

  it('Split-Level teils über dem Keller: nur der Teil ohne Geschoss darunter', () => {
    const { p, eg } = haus();
    const r = createRoom(rectPoints({ x: 8, y: 0 }, { x: 12, y: 8 }), '0.01', 'Wohnen');
    r.versatz = -0.6;
    eg.shapes.push(r);
    const t = unterbau(eg.shapes[0] as never, eg, p);
    expect(t).toHaveLength(1);
    expect(t[0].flaeche).toBeCloseTo(2 * 8, 6);
  });

  it('kleiner, nicht unterkellerter Erker behält seine Bodenplatte; schmale Zeichenstreifen nicht', () => {
    const p = createProject();
    const kg = createStorey('KG', 2.8);
    const eg = createStorey('EG', 3);
    kg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 20, y: 12 })));
    // EG 1 cm breiter gezeichnet als das KG, dazu ein 1 × 1 m Erker
    eg.shapes.push(
      createOutline([
        { x: 0, y: 0 },
        { x: 20.01, y: 0 },
        { x: 20.01, y: 5 },
        { x: 21, y: 5 },
        { x: 21, y: 6 },
        { x: 20.01, y: 6 },
        { x: 20.01, y: 12 },
        { x: 0, y: 12 },
      ]),
    );
    eg.sohle = 0.3;
    p.storeys = [kg, eg];
    const t = unterbau(eg.shapes[0] as never, eg, p);
    expect(t).toHaveLength(1);
    expect(t[0].flaeche).toBeCloseTo(1, 2); // Erker 20,00–21,00 × 1 m ohne den Streifen daneben
  });

  it('höher liegender Umriss behält seinen Rauminhalt', () => {
    const { p, kg } = haus();
    kg.shapes[0].versatz = 0.4;
    expect(outlineVolume(kg.shapes[0] as never, kg, p)).toBeCloseTo(80 * 2.8, 9);
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

describe('Höhenlage von Räumen in abgesenkten Umrissen', () => {
  it('ein Raum ohne eigene Höhenlage liegt auf dem Fußboden seines Umrisses', async () => {
    const { raumBodenVersatz } = await import('./calc');
    const { p, eg } = haus();
    eg.shapes[0].versatz = -0.5;
    const r = createRoom(rectPoints({ x: 11, y: 1 }, { x: 13, y: 3 }), '0.01', 'Lager');
    eg.shapes.push(r);
    expect(raumBodenVersatz(r, eg)).toBe(-0.5);
    // keine zusätzliche Absenkung: der Raum liegt auf der Unterkante des verschobenen Körpers
    expect(unterbau(eg.shapes[0] as never, eg, p)).toHaveLength(0);
  });
});
