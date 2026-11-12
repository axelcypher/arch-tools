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
});
