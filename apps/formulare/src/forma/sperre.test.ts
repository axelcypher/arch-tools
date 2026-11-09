import { describe, expect, it } from 'vitest';
import type { Sperre } from './sperre';
import { ALT_MS, bewerten, dauer, sperreLesen, sperreSchreiben, zeitpunkt } from './sperre';

const sperre = (mehr: Partial<Sperre> = {}): Sperre => ({ benutzer: 'kollegin', computer: 'CAD02', angemeldet: '09.11.2026 10:17:12', inGebrauch: '67802', ...mehr });
const JETZT = new Date(2026, 10, 9, 11, 17, 12).getTime();
const frei = { offen: false, geaendert: 0 };

describe('Sperrdatei', () => {
  it('liest und schreibt das Format von FORMA', () => {
    const s = sperre();
    expect(sperreLesen(sperreSchreiben(s))).toEqual(s);
    expect(zeitpunkt('09.11.2026 10:17:12')?.getTime()).toBe(new Date(2026, 10, 9, 10, 17, 12).getTime());
    expect(zeitpunkt('gestern')).toBeNull();
    expect(dauer(3 * 3600_000)).toBe('3 Stunden');
    expect(dauer(5 * 86400_000)).toBe('5 Tagen');
  });
});

describe('Ist die Sperre noch in Gebrauch?', () => {
  it('offen gehalten: in Gebrauch, lässt sich nicht aufheben', () => {
    const b = bewerten(sperre(), { offen: true, geaendert: 0 }, 'HELEN', undefined, JETZT);
    expect(b).toMatchObject({ art: 'benutzt', aufhebbar: false });
    expect(b.grund).toContain('seit 1 Stunde');
  });

  it('auf diesem Rechner: läuft der eingetragene Prozess noch?', () => {
    const hier = sperre({ computer: 'helen' });
    expect(bewerten(hier, frei, 'HELEN', null, JETZT)).toMatchObject({ art: 'verwaist', aufhebbar: true });
    expect(bewerten(hier, frei, 'HELEN', null, JETZT).grund).toContain('kein Programm mit der Nummer 67802');
    expect(bewerten(hier, frei, 'HELEN', 'notepad.exe', JETZT)).toMatchObject({ art: 'verwaist' });
    expect(bewerten(hier, frei, 'HELEN', 'Formulare.exe', JETZT)).toMatchObject({ art: 'benutzt', aufhebbar: true });
    expect(bewerten(hier, frei, 'HELEN', 'SJOffice.exe', JETZT)).toMatchObject({ art: 'benutzt' });
  });

  it('auf einem anderen Rechner: nicht prüfbar, ab einem halben Tag wahrscheinlich verwaist', () => {
    expect(bewerten(sperre(), frei, 'HELEN', undefined, JETZT)).toMatchObject({ art: 'unklar', aufhebbar: true });
    const alt = new Date(JETZT + ALT_MS + 60_000).getTime();
    const b = bewerten(sperre(), frei, 'HELEN', undefined, alt);
    expect(b.art).toBe('verwaist');
    expect(b.grund).toContain('auf CAD02');
    // ohne lesbaren Zeitpunkt zählt das Änderungsdatum der Datei
    expect(bewerten(sperre({ angemeldet: '' }), { offen: false, geaendert: JETZT - 2 * ALT_MS }, 'HELEN', undefined, JETZT).art).toBe('verwaist');
  });
});
