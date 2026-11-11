import { describe, expect, it } from 'vitest';
import type { RasterBackground } from './model';
import { kalibrierFaktor, unterlageKalibrieren, unterlageVerschieben } from './kalibrierung';

const bild: RasterBackground = { type: 'raster', name: 'Lageplan', dataUrl: 'data:', widthPx: 1000, heightPx: 800, metersPerPixel: 0.01, x: 2, y: 3, opacity: 0.5, visible: true };

describe('Kalibrieren einer Unterlage', () => {
  it('zwei Punkte und bekannte Länge ergeben den richtigen Maßstab; der erste Punkt bleibt', () => {
    // Strecke auf dem Bild: 400 px → bei 0,01 m/px 4 m; tatsächlich 20 m
    const a = { x: 2 + 100 * 0.01, y: 3 + 50 * 0.01 };
    const b = { x: a.x + 400 * 0.01, y: a.y };
    expect(kalibrierFaktor(a, b, 20)).toBeCloseTo(5, 9);
    const k = unterlageKalibrieren(bild, a, b, 20);
    expect(k.metersPerPixel).toBeCloseTo(0.05, 9);
    // Pixel 100|50 liegt weiter bei a, Pixel 500|50 jetzt 20 m daneben
    const welt = (px: number, py: number) => ({ x: k.x + px * k.metersPerPixel, y: k.y + py * k.metersPerPixel });
    expect(welt(100, 50).x).toBeCloseTo(a.x, 9);
    expect(welt(100, 50).y).toBeCloseTo(a.y, 9);
    expect(welt(500, 50).x - welt(100, 50).x).toBeCloseTo(20, 9);
  });

  it('Ausrichten verschiebt, ohne den Maßstab zu ändern; ungültige Eingaben werden abgelehnt', () => {
    const v = unterlageVerschieben(bild, { x: 5, y: 5 }, { x: 12, y: 0 });
    expect(v).toMatchObject({ x: 9, y: -2, metersPerPixel: 0.01 });
    expect(() => kalibrierFaktor({ x: 1, y: 1 }, { x: 1, y: 1 }, 5)).toThrow();
    expect(() => kalibrierFaktor({ x: 1, y: 1 }, { x: 2, y: 1 }, 0)).toThrow();
  });
});
