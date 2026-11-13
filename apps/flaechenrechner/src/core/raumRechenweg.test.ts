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

describe('Fläche außerhalb der BGF (ebenerdige Terrasse) mit Abzug darin', () => {
  it('NRF bleibt unverändert, der Abzug mindert nur die Wohnfläche; Rechenweg, CSV und Statistik ohne NRF', async () => {
    const { createOutline, createProject, createRoom } = await import('@core/model');
    const { rectPoints } = await import('@core/geometry');
    const { computeProject } = await import('@core/calc');
    const { projectToCsv } = await import('./export');
    const { statistik } = await import('./bericht');
    const p = createProject('Haus');
    const eg = p.storeys[0];
    eg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
    const wohnen = { ...createRoom(rectPoints({ x: 0.3, y: 0.3 }, { x: 9.7, y: 7.7 }), '0.01', 'Wohnen'), wofl: { kategorie: 'voll' as const, wohnung: 'WE 01' } };
    const terrasse = { ...createRoom(rectPoints({ x: 0, y: 9 }, { x: 5, y: 13 }), '0.02', 'Terrasse'), ausserhalbBgf: true, wofl: { kategorie: 'freisitz' as const, wohnung: 'WE 01' } };
    const beet = { ...createRoom(rectPoints({ x: 1, y: 10 }, { x: 2, y: 11 }), '', 'Pflanzbeet'), subtract: true, wofl: { kategorie: 'keine' as const, wohnung: '' } };
    const gemeinschaft = { ...createRoom(rectPoints({ x: 6, y: 9 }, { x: 10, y: 14 }), '0.03', 'Gemeinschaftsterrasse'), ausserhalbBgf: true };
    eg.shapes.push(wohnen, terrasse, beet, gemeinschaft);
    const r = computeProject(p);
    expect(r.total.nrf.total).toBeCloseTo(9.4 * 7.4, 10); // nur „Wohnen“
    expect(r.total.wofl).toBeCloseTo(9.4 * 7.4 + (20 - 1) * 0.25, 10);
    expect(r.storeys[0].rooms.find((x) => x.name === 'Pflanzbeet')?.ausserhalbBgf).toBe(true);
    const w = raumRechenweg(terrasse, eg, p);
    expect(w.nrf).toBe(0);
    expect(w.zeilen.some((z) => z.art === 'nrf')).toBe(false);
    expect(w.wofl).toBeCloseTo(19 * 0.25, 10);
    const csv = projectToCsv(p, r);
    expect(csv).toMatch(/0\.02;Terrasse;außerhalb BGF;;20,00/);
    expect(statistik(r).sonstigeNutzflaeche).toBe(0);
  });
});
