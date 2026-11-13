import { describe, expect, it } from 'vitest';
import { escZiel, kantenpunktAufRaster, relativerPunkt } from './zeichnen';

describe('Kantenfang mit Rasterfang (A3)', () => {
  it('waagerechte Kante: x auf 5 cm gerundet, y bleibt auf der Kante', () => {
    expect(kantenpunktAufRaster({ x: 4.9875, y: 2 }, { x: 0, y: 2 }, { x: 10, y: 2 }, 0.05)).toEqual({ x: 5, y: 2 });
  });
  it('senkrechte Kante: y gerundet, innerhalb der Kante geklemmt', () => {
    expect(kantenpunktAufRaster({ x: 3, y: 1.03 }, { x: 3, y: 0 }, { x: 3, y: 1.01 }, 0.05)).toEqual({ x: 3, y: 1.01 });
    expect(kantenpunktAufRaster({ x: 3, y: 0.513 }, { x: 3, y: 0 }, { x: 3, y: 4 }, 0.05).y).toBeCloseTo(0.5, 9);
  });
  it('schräge Kante: Abstand vom Anfang in Rasterschritten, Punkt bleibt auf der Kante', () => {
    const q = kantenpunktAufRaster({ x: 0.71, y: 0.71 }, { x: 0, y: 0 }, { x: 3, y: 3 }, 0.05);
    expect(Math.hypot(q.x, q.y) / 0.05).toBeCloseTo(Math.round(Math.hypot(q.x, q.y) / 0.05), 3);
    expect(q.x).toBeCloseTo(q.y, 4);
  });
  it('Gegenprobe: ohne Raster bleibt der Lotfußpunkt unverändert', () => {
    expect(kantenpunktAufRaster({ x: 4.9875, y: 2 }, { x: 0, y: 2 }, { x: 10, y: 2 }, 0)).toEqual({ x: 4.9875, y: 2 });
  });
});

describe('Eingabe dx;dy (A4)', () => {
  it('positives dy zeichnet nach oben (intern y kleiner), negatives nach unten', () => {
    expect(relativerPunkt({ x: 1, y: 5 }, 2, 3)).toEqual({ x: 3, y: 2 });
    expect(relativerPunkt({ x: 1, y: 5 }, 0, -3)).toEqual({ x: 1, y: 8 });
  });
});

describe('Esc-Reihenfolge (A6)', () => {
  const leer = { eingabe: false, entwurf: false, kalibrierung: false, messung: false, werkzeug: false };
  it('Entwurf geht vor einer stehenden Messung', () => {
    expect(escZiel({ ...leer, entwurf: true, messung: true, werkzeug: true })).toBe('entwurf');
  });
  it('Zahleneingabe vor Entwurf; Messung vor Werkzeug; zuletzt die Auswahl', () => {
    expect(escZiel({ ...leer, eingabe: true, entwurf: true })).toBe('eingabe');
    expect(escZiel({ ...leer, messung: true, werkzeug: true })).toBe('messung');
    expect(escZiel(leer)).toBe('auswahl');
  });
});
