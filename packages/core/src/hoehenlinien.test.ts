import { describe, expect, it } from 'vitest';
import { computeStorey } from './calc';
import { polygonArea, rectPoints } from './geometry';
import { hoehenZonen, raumHoehenAnteile } from './hoehenlinien';
import { createOutline, createProject, createRoom } from './model';

/** Satteldach 45° über 10 × 8 m, Traufe auf Fußbodenhöhe, First entlang x bei y = 4 */
function dg() {
  const p = createProject();
  const st = p.storeys[0];
  const u = createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 }));
  u.dach = { typ: 'sattel', traufhoehe: 0, neigung: 45 };
  st.shapes.push(u);
  return { p, st, u };
}

const flaeche = (zonen: ReturnType<typeof hoehenZonen>, k: string) => zonen.filter((z) => z.klasse === k).reduce((a, z) => a + polygonArea(z.points), 0);

describe('Höhenlinien unter Dachschrägen (F-12)', () => {
  it('Höhenlinie 2 m bei 45° mit Aufbau 0,30 m: 2 + 0,30 / cos 45° über der Traufe', () => {
    const { u } = dg();
    const z = hoehenZonen(u, u.points, { dachaufbau: 0.3 });
    const off = 0.3 * Math.SQRT2;
    // ≥ 2 m zwischen y = 2 + off und y = 8 − (2 + off)
    expect(flaeche(z, 'h2')).toBeCloseTo(10 * (8 - 2 * (2 + off)), 9);
    expect(flaeche(z, 'h01')).toBeCloseTo(10 * 2 * (1 + off), 9);
    expect(flaeche(z, 'h12')).toBeCloseTo(20, 9);
    // ohne Aufbau: Linie genau 2 m neben der Traufe
    expect(flaeche(hoehenZonen(u, u.points), 'h2')).toBeCloseTo(10 * 4, 9);
  });

  it('Teilflächen eines Raums summieren sich zur Raumfläche; NRF unverändert, Wohnfläche exakt', () => {
    const { p, st } = dg();
    const r = createRoom(rectPoints({ x: 0.3, y: 0.3 }, { x: 4.3, y: 4 }), '1.01', 'Kind');
    st.shapes.push(r);
    const t = raumHoehenAnteile(r, st)!;
    expect(t.anteile.h2 + t.anteile.h12 + t.anteile.h01).toBeCloseTo(1, 12);
    // Raum y 0,3 … 4: < 1 m bis y = 1, 1–2 m bis y = 2, ≥ 2 m bis y = 4 (je 4 m breit)
    expect(t.anteile.h01 * 4 * 3.7).toBeCloseTo(4 * 0.7, 9);
    expect(t.anteile.h12 * 4 * 3.7).toBeCloseTo(4 * 1, 9);
    expect(t.anteile.h2 * 4 * 3.7).toBeCloseTo(4 * 2, 9);
    r.wofl = { kategorie: 'hoehen', anteile: t.anteile, wohnung: 'WE 01' };
    const s = computeStorey(st, p);
    expect(s.nrf.total).toBeCloseTo(14.8, 9);
    expect(s.wofl).toBeCloseTo(8 + 0.5 * 4, 9);
  });

  it('Höhenlage des Raums (Split-Level) verschiebt die Linien; ohne Dachform keine Teilflächen', () => {
    const { st } = dg();
    const r = createRoom(rectPoints({ x: 0.3, y: 0.3 }, { x: 4.3, y: 4 }), '1.01', 'Kind');
    r.versatz = 0.5; // Fußboden 0,5 m höher → Linien rücken 0,5 m zur Mitte
    st.shapes.push(r);
    const t = raumHoehenAnteile(r, st)!;
    expect(t.anteile.h2 * 4 * 3.7).toBeCloseTo(4 * 1.5, 9);
    const ohne = createProject();
    ohne.storeys[0].shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    const r2 = createRoom(rectPoints({ x: 1, y: 1 }, { x: 3, y: 3 }), '0.01', 'Wohnen');
    ohne.storeys[0].shapes.push(r2);
    expect(raumHoehenAnteile(r2, ohne.storeys[0])).toBeNull();
  });
});
