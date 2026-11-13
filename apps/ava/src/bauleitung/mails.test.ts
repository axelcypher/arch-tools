import { describe, expect, it } from 'vitest';
import { emlBauen } from '../abrechnung/mail';
import { emlLesen, kopfDekodieren } from './mails';
import { wetterAbrufen, wetterlage } from './wetter';

describe('Mails lesen', () => {
  it('liest eine selbst gebaute .eml mit Umlauten und Anhang', () => {
    const eml = emlBauen({ von: 'Fenster Müller <info@example.org>', an: ['bauleitung@example.org'], betreff: 'AW: Montagetermin – Änderung', text: 'Guten Tag,\nwir kommen Montag früh.', anhaenge: [{ name: 'Lieferschein Nr. 5.pdf', daten: new Uint8Array([1, 2, 3]) }] }, new Date('2025-10-20T09:12:00Z'));
    const m = emlLesen(eml);
    expect(m.betreff).toBe('AW: Montagetermin – Änderung');
    expect(m.von).toBe('Fenster Müller <info@example.org>');
    expect(m.an).toBe('bauleitung@example.org');
    expect(m.text).toBe('Guten Tag,\nwir kommen Montag früh.');
    expect(m.anhaenge).toEqual(['Lieferschein Nr. 5.pdf']);
  });

  it('liest übliche Kopfzeilen und quoted-printable', () => {
    const roh = 'From: =?iso-8859-1?Q?J=FCrgen?= <j@example.org>\r\nTo: a@example.org\r\nSubject: =?UTF-8?B?UHLDvGZ1bmc=?=\r\nDate: Mon, 20 Oct 2025 11:12:00 +0200\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nGr=C3=BC=C3=9Fe aus der Baustelle=\r\n!\r\n';
    const m = emlLesen(new TextEncoder().encode(roh));
    expect(m.von).toBe('Jürgen <j@example.org>');
    expect(m.betreff).toBe('Prüfung');
    expect(m.datum).toBe('2025-10-20T09:12:00.000Z');
    expect(m.text).toBe('Grüße aus der Baustelle!');
    expect(kopfDekodieren('=?UTF-8?Q?Gr=C3=BC=C3=9Fe?=')).toBe('Grüße');
  });
});

describe('Wetter', () => {
  it('übersetzt die Wetterlage und fragt nur Koordinaten und Datum ab', async () => {
    expect(wetterlage(63)).toBe('Regen');
    let adresse = '';
    const abruf = (async (url: string) => {
      adresse = url;
      return { ok: true, json: async () => ({ daily: { weather_code: [61], temperature_2m_max: [12.4], temperature_2m_min: [4.6], precipitation_sum: [2.3] } }) };
    }) as unknown as typeof fetch;
    const w = await wetterAbrufen(51.5712, 8.1063, '2026-11-10', abruf);
    expect(w).toEqual({ lage: 'leichter Regen, 2,3 mm Niederschlag', temperatur: '5 bis 12 °C' });
    expect(adresse).toContain('latitude=51.5712');
    expect(adresse).toContain('start_date=2026-11-10');
  });
});
