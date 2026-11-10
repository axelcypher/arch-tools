import { describe, expect, it } from 'vitest';
import { quellenName, wann } from './ProjektUebersicht';

describe('Zeitangaben auf den Projektkarten', () => {
  it('heute mit Uhrzeit, gestern, vor einigen Tagen, sonst das Datum', () => {
    const jetzt = new Date(2026, 10, 10, 15, 0).getTime();
    expect(wann(new Date(2026, 10, 10, 9, 5).getTime(), jetzt)).toBe('heute 09:05');
    expect(wann(new Date(2026, 10, 9, 23, 0).getTime(), jetzt)).toBe('gestern');
    expect(wann(new Date(2026, 10, 7, 12, 0).getTime(), jetzt)).toBe('vor 3 Tagen');
    expect(wann(new Date(2026, 9, 1, 12, 0).getTime(), jetzt)).toBe('01.10.2026');
  });
});

describe('Name einer Quelle', () => {
  it('der Ordnername, bei gleichen Namen mit dem übergeordneten Ordner', () => {
    expect(quellenName('C:/FORMA', ['C:/FORMA', 'D:/Archiv'])).toBe('FORMA');
    expect(quellenName('Z:\\Akquise\\FORMA', ['C:/FORMA', 'Z:\\Akquise\\FORMA'])).toBe('Akquise/FORMA');
    expect(quellenName('C:/FORMA', ['C:/FORMA', 'Z:/Akquise/forma'])).toBe('C:/FORMA');
  });
});
