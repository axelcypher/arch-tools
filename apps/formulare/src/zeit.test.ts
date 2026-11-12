import { describe, expect, it } from 'vitest';
import { zeitKurz, zeitLang } from './zeit';

describe('Änderungszeit kurz und lang', () => {
  const jetzt = new Date(2026, 10, 12, 16, 0).getTime();
  it('heute, gestern, im selben Jahr, früher; unbekannt = leer', () => {
    expect(zeitKurz(new Date(2026, 10, 12, 14, 30).getTime(), jetzt)).toBe('heute 14:30');
    expect(zeitKurz(new Date(2026, 10, 11, 9, 5).getTime(), jetzt)).toBe('gestern 09:05');
    expect(zeitKurz(new Date(2026, 2, 3, 9, 5).getTime(), jetzt)).toBe('03.03.');
    expect(zeitKurz(new Date(2025, 11, 24, 9, 5).getTime(), jetzt)).toBe('24.12.25');
    expect(zeitKurz(0, jetzt)).toBe('');
    expect(zeitLang(new Date(2026, 10, 12, 14, 30).getTime())).toBe('zuletzt geändert am 12.11.2026, 14:30');
    expect(zeitLang(undefined)).toBe('Änderungszeit unbekannt');
  });
  it('an Tagen der Zeitumstellung (23 bzw. 25 Stunden) stimmen „heute“ und „gestern“', () => {
    // Montag nach der Umstellung auf Sommerzeit (29.03.2026): Sonntag hatte nur 23 Stunden
    const montag = new Date(2026, 2, 30, 0, 30).getTime();
    expect(zeitKurz(new Date(2026, 2, 29, 0, 10).getTime(), montag)).toBe('gestern 00:10');
    expect(zeitKurz(new Date(2026, 2, 28, 23, 50).getTime(), montag)).toBe('28.03.');
    // Montag nach der Umstellung auf Winterzeit (25.10.2026): Sonntag hatte 25 Stunden
    const nachWinter = new Date(2026, 9, 26, 0, 30).getTime();
    expect(zeitKurz(new Date(2026, 9, 25, 23, 30).getTime(), nachWinter)).toBe('gestern 23:30');
    expect(zeitKurz(new Date(2026, 9, 24, 23, 30).getTime(), nachWinter)).toBe('24.10.');
  });
});
