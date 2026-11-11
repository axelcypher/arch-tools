import { describe, expect, it } from 'vitest';
import { polygonArea } from '@core/geometry';
import { createOutline, createProject } from '@core/model';
import { sVorschlagen } from './umriss';

describe('BGF-Umriss ohne Plan (F-15)', () => {
  it('Näherung „Umriss aus Räumen + Wanddicke“ nur mit Vermerk', async () => {
    const { umrissAusRaeumen, naeherungsVermerk } = await import('./umriss');
    const { createRoom } = await import('@core/model');
    const a = createRoom(
      [
        { x: 0.3, y: 0.3 },
        { x: 5, y: 0.3 },
        { x: 5, y: 7.7 },
        { x: 0.3, y: 7.7 },
      ],
      '0.01',
      'A',
    );
    const b = createRoom(
      [
        { x: 5.24, y: 0.3 },
        { x: 9.7, y: 0.3 },
        { x: 9.7, y: 7.7 },
        { x: 5.24, y: 7.7 },
      ],
      '0.02',
      'B',
    );
    const polys = umrissAusRaeumen([a, b], 0.3);
    expect(polys).toHaveLength(1);
    expect(polygonArea(polys[0])).toBeCloseTo(80, 6);
    expect(naeherungsVermerk(0.3)).toMatch(/^Näherung: Umriss aus Räumen \+ Wanddicke 0,30 m/);
  });

  it('kleiner Umriss außen am Gebäude: S vorschlagen', () => {
    const p = createProject();
    p.storeys[0].shapes.push(
      createOutline([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 8 },
        { x: 0, y: 8 },
      ]),
    );
    expect(
      sVorschlagen(
        [
          { x: 10, y: 2 },
          { x: 12, y: 2 },
          { x: 12, y: 6 },
          { x: 10, y: 6 },
        ],
        p.storeys[0],
      ),
    ).toBe(true);
    expect(
      sVorschlagen(
        [
          { x: 20, y: 2 },
          { x: 22, y: 2 },
          { x: 22, y: 6 },
          { x: 20, y: 6 },
        ],
        p.storeys[0],
      ),
    ).toBe(false);
  });
});
