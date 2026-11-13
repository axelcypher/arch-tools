import { describe, expect, it } from 'vitest';
import { testMsg } from '../__fixtures__/msg';
import { msgKopf } from './msg';

describe('Outlook-Nachrichten (.msg) lesen', () => {
  const lang = 'Guten Morgen,\n'.repeat(400);

  it('Betreff, Absender, Empfänger mit Art, Sende- und Empfangszeit, Anhänge, Text – Unicode und ANSI, kleine und große Ströme', () => {
    for (const ansi of [false, true]) {
      const bytes = testMsg({
        betreff: 'WG: Grundriss Sanierung Musterschule.docx',
        vonName: 'Erika Beispiel | Beispiel Architekten GmbH',
        vonMail: 'e.beispiel@architekten-beispiel.example',
        an: [
          { name: 'Tom Planer', mail: 't.planer@architekten-beispiel.example' },
          { name: 'Muster, Max', mail: 'max.muster@statik-muster.example', art: 'cc' },
        ],
        gesendet: new Date('2026-11-10T08:07:17Z'),
        empfangen: new Date('2026-11-10T08:07:20Z'),
        text: `Zur Info\n\nVon: Muster, Max <Max.Muster@statik-muster.example>\nGesendet: Montag, 9. November 2026 10:10\n${lang}`,
        anhaenge: ['Grundriss Sanierung Musterschule.docx'],
        ansi,
      });
      const k = msgKopf(bytes, { mitText: true });
      expect(k).toMatchObject({
        klasse: 'IPM.Note',
        betreff: 'WG: Grundriss Sanierung Musterschule.docx',
        thema: 'Grundriss Sanierung Musterschule.docx',
        vonName: 'Erika Beispiel | Beispiel Architekten GmbH',
        vonMail: 'e.beispiel@architekten-beispiel.example',
        empfaenger: [
          { name: 'Tom Planer', mail: 't.planer@architekten-beispiel.example', art: 'an' },
          { name: 'Muster, Max', mail: 'max.muster@statik-muster.example', art: 'cc' },
        ],
        anText: 'Tom Planer',
        ccText: 'Muster, Max',
        anhaenge: ['Grundriss Sanierung Musterschule.docx'],
        flags: 1,
      });
      expect(k.gesendet?.toISOString()).toBe('2026-11-10T08:07:17.000Z');
      expect(k.empfangen?.toISOString()).toBe('2026-11-10T08:07:20.000Z');
      // der Text ist größer als die Grenze des Mini-Stroms (4096 Bytes)
      expect(k.text).toContain('Von: Muster, Max <Max.Muster@statik-muster.example>');
      expect(k.text!.length).toBeGreaterThan(4096);
    }
    expect(msgKopf(testMsg({ betreff: 'x', vonName: 'a', vonMail: 'a@b.example', an: [] }))).not.toHaveProperty('text');
  });

  it('keine Outlook-Nachricht: verständlicher Fehler', () => {
    expect(() => msgKopf(new TextEncoder().encode('From: a@b.example\n\nHallo'))).toThrow('Keine Outlook-Nachricht (.msg)');
  });
});
