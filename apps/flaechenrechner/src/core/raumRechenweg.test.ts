import { describe, expect, it } from 'vitest';
import { computeStorey } from '@core/calc';
import { rectPoints } from '@core/geometry';
import { createProject, createRoom } from '@core/model';
import { raumRechenweg, rechenwegText } from './raumRechenweg';

describe('Rechenweg je Raum (F-13)', () => {
  it('Rechteck mit Putzabzug und Abzugsfläche: Summe der Zeilen = Raumfläche, Wohnfläche wie die Auswertung', () => {
    const p = createProject();
    const eg = p.storeys[0];
    const r = createRoom(rectPoints({ x: 0, y: 0 }, { x: 9.4, y: 7.4 }), '0.01', 'Wohnen');
    r.putzabzug = 3;
    r.wofl = { kategorie: 'voll', wohnung: 'WE 01' };
    const s = { ...createRoom(rectPoints({ x: 1, y: 1 }, { x: 1.5, y: 1.5 }), '', 'Schornstein'), subtract: true };
    eg.shapes.push(r, s);
    const w = raumRechenweg(r, eg, p);
    const geo = w.zeilen.filter((z) => z.art === 'teil');
    expect(geo).toHaveLength(1);
    expect([geo[0].laenge, geo[0].breite].sort()).toEqual([7.4, 9.4].sort());
    const summe = w.zeilen.filter((z) => z.art === 'teil' || z.art === 'putz' || z.art === 'abzug').reduce((a, z) => a + z.flaeche, 0);
    const sr = computeStorey(eg, p);
    expect(summe).toBeCloseTo(sr.nrf.total, 10);
    expect(w.nrf).toBeCloseTo(sr.nrf.total, 10);
    expect(w.wofl).toBeCloseTo(sr.wofl, 10);
    expect(w.flaeche).toBeCloseTo(9.4 * 7.4 * 0.97, 10);
    expect(rechenwegText(w)).toBe('9,40 × 7,40 = 69,56 m²; − 3,00 % Putzabzug = 67,47 m²; − Schornstein 0,25 m²; NRF 67,22 m²; WoFl 67,22 m² × 1,00 = 67,22 m²');
  });

  it('L-förmiges Polygon: Zerlegung summiert exakt', () => {
    const p = createProject();
    const l = createRoom(
      [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 3 },
        { x: 2.5, y: 3 },
        { x: 2.5, y: 7 },
        { x: 0, y: 7 },
      ],
      '0.02',
      'Flur',
    );
    p.storeys[0].shapes.push(l);
    const w = raumRechenweg(l, p.storeys[0], p);
    const teile = w.zeilen.filter((z) => z.art === 'teil');
    expect(teile.length).toBeGreaterThanOrEqual(2);
    expect(teile.reduce((a, z) => a + z.flaeche, 0)).toBeCloseTo(6 * 3 + 2.5 * 4, 10);
  });

  it('Raumteile nach lichter Höhe: Teilflächen × Anrechnung', () => {
    const p = createProject();
    const r = createRoom(rectPoints({ x: 0, y: 0 }, { x: 4, y: 5 }), '1.01', 'Kind');
    r.wofl = { kategorie: 'hoehen', anteile: { h2: 0.5, h12: 0.3, h01: 0.2 }, wohnung: 'WE 01' };
    p.storeys[0].shapes.push(r);
    const w = raumRechenweg(r, p.storeys[0], p);
    expect(w.zeilen.filter((z) => z.art === 'wofl').map((z) => z.flaeche)).toEqual([10, 3, 0]);
    expect(w.wofl).toBeCloseTo(13, 10);
  });
});
