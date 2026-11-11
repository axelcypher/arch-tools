import { describe, expect, it } from 'vitest';
import { rectPoints } from './geometry';
import { kantenFang, lotFuss, polarPunkt } from './kantenFang';

const haus = rectPoints({ x: 0, y: 0 }, { x: 12, y: 10 });

describe('Fang auf Kanten', () => {
  it('Punkt einer Kante: nächster Punkt auf der Wand', () => {
    const f = kantenFang({ x: 12.03, y: 3.2 }, [haus], 0.1)!;
    expect(f.art).toBe('kante');
    expect(f.p.x).toBeCloseTo(12, 9);
    expect(f.p.y).toBeCloseTo(3.2, 9);
  });

  it('Kantenmitte hat Vorrang', () => {
    const f = kantenFang({ x: 12.02, y: 5.04 }, [haus], 0.1)!;
    expect(f.art).toBe('mitte');
    expect(f.p).toEqual({ x: 12, y: 5 });
  });

  it('Lot vom letzten Punkt auf die Kante', () => {
    const von = { x: 15, y: 7.3 };
    const f = kantenFang({ x: 12.04, y: 7.25 }, [haus], 0.1, von)!;
    expect(f.art).toBe('lot');
    expect(f.p.x).toBeCloseTo(12, 9);
    expect(f.p.y).toBeCloseTo(7.3, 9);
    expect(lotFuss(von, { x: 12, y: 0 }, { x: 12, y: 10 }).t).toBeCloseTo(0.73, 9);
  });

  it('außerhalb der Toleranz kein Fang', () => {
    expect(kantenFang({ x: 13, y: 3 }, [haus], 0.1)).toBeNull();
  });

  it('Länge und Winkel gegen die Gebäudeachse', () => {
    const p = polarPunkt({ x: 1, y: 1 }, 3, 0, { x: 1, y: 0 });
    expect(p).toEqual({ x: 4, y: 1 });
    const q = polarPunkt({ x: 1, y: 1 }, 2, 90, { x: 1, y: 0 });
    expect(q.x).toBeCloseTo(1, 9);
    expect(q.y).toBeCloseTo(-1, 9);
  });
});
