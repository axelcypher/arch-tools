import { describe, expect, it } from 'vitest';
import { kontrollAbweichung, kontrollText, laengeAusText } from './background';

describe('Kalibrieren mit Einheit und Kontrollmaß (F-16)', () => {
  it('Einheitenparser: „1200 cm“ = 12 m, ohne Einheit Meter, deutsche Schreibweise', () => {
    expect(laengeAusText('1200 cm')).toBeCloseTo(12, 12);
    expect(laengeAusText('12 m')).toBe(12);
    expect(laengeAusText('12,5')).toBe(12.5);
    expect(laengeAusText('12000 mm')).toBeCloseTo(12, 12);
    expect(laengeAusText('1.200,5 cm')).toBeCloseTo(12.005, 12);
    expect(laengeAusText('1.200 mm')).toBeCloseTo(1.2, 12);
    expect(laengeAusText('abc')).toBeNull();
    expect(laengeAusText('0')).toBeNull();
  });

  it('Abweichung des Kontrollmaßes in Prozent', () => {
    expect(kontrollAbweichung(10.025, 10)).toBeCloseTo(0.0025, 12);
    expect(kontrollAbweichung(7.99, 8)).toBeCloseTo(-0.00125, 12);
    expect(kontrollText({ soll: 8, abweichung: 0.0012 })).toBe('aus Plan abgegriffen, Maßstab kalibriert, Kontrollmaß 8,00 m: Abweichung +0,12 %');
  });
});
