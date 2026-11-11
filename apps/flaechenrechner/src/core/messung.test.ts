import { describe, expect, it } from 'vitest';
import { messText, messung } from './messung';

describe('Messen (F-19)', () => {
  it('Kettenmessung: Summe, dx/dy und Winkel je Abschnitt', () => {
    // y nach unten: (0,0) → (3,−4) ist „nach oben rechts“
    const m = messung([
      { x: 0, y: 0 },
      { x: 3, y: -4 },
      { x: 3, y: 1 },
    ]);
    expect(m.abschnitte.map((a) => a.laenge)).toEqual([5, 5]);
    expect(m.summe).toBe(10);
    expect(m.abschnitte[0].dx).toBe(3);
    expect(m.abschnitte[0].dy).toBe(4);
    expect(m.abschnitte[0].winkel).toBeCloseTo(53.1301, 3);
    expect(m.abschnitte[1].winkel).toBeCloseTo(270, 9);
    expect(m.flaeche).toBeUndefined();
  });

  it('geschlossen: Umfang und Fläche; Text zum Kopieren', () => {
    const m = messung(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
      true,
    );
    expect(m.summe).toBe(14);
    expect(m.flaeche).toBe(12);
    expect(messText(m)).toMatch(/Umfang: 14,000 m\nFläche: 12,00 m²$/);
  });
});
