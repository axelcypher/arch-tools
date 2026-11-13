import { describe, expect, it } from 'vitest';
import { testMsg } from '../__fixtures__/msg';
import { msgKopf } from './msg';

describe('Outlook-Nachrichten (.msg) lesen', () => {
  const lang = 'Guten Morgen,\n'.repeat(400);

  it('Betreff, Absender, Empfänger mit Art, Sende- und Empfangszeit, Anhänge, Text – Unicode und ANSI, kleine und große Ströme', () => {
    for (const ansi of [false, true]) {
      const bytes = testMsg({
        betreff: 'WG: Grundriss Sanierung ESG.docx',
        vonName: 'Nicole Aring | AKH Architektur GmbH',
        vonMail: 'n.aring@akh-architektur.de',
        an: [
          { name: 'Tobias Pendzialek', mail: 't.pendzialek@akh-architektur.de' },
          { name: 'Peitz, Rüdiger', mail: 'ruediger.peitz@shs-soest.de', art: 'cc' },
        ],
        gesendet: new Date('2026-11-10T08:07:17Z'),
        empfangen: new Date('2026-11-10T08:07:20Z'),
        text: `Zur Info\n\nVon: Peitz, Rüdiger <Ruediger.Peitz@shs-soest.de>\nGesendet: Montag, 9. November 2026 10:10\n${lang}`,
        anhaenge: ['Grundriss Sanierung ESG.docx'],
        ansi,
      });
      const k = msgKopf(bytes, { mitText: true });
      expect(k).toMatchObject({
        klasse: 'IPM.Note',
        betreff: 'WG: Grundriss Sanierung ESG.docx',
        thema: 'Grundriss Sanierung ESG.docx',
        vonName: 'Nicole Aring | AKH Architektur GmbH',
        vonMail: 'n.aring@akh-architektur.de',
        empfaenger: [
          { name: 'Tobias Pendzialek', mail: 't.pendzialek@akh-architektur.de', art: 'an' },
          { name: 'Peitz, Rüdiger', mail: 'ruediger.peitz@shs-soest.de', art: 'cc' },
        ],
        anText: 'Tobias Pendzialek',
        ccText: 'Peitz, Rüdiger',
        anhaenge: ['Grundriss Sanierung ESG.docx'],
        flags: 1,
      });
      expect(k.gesendet?.toISOString()).toBe('2026-11-10T08:07:17.000Z');
      expect(k.empfangen?.toISOString()).toBe('2026-11-10T08:07:20.000Z');
      // der Text ist größer als die Grenze des Mini-Stroms (4096 Bytes)
      expect(k.text).toContain('Von: Peitz, Rüdiger <Ruediger.Peitz@shs-soest.de>');
      expect(k.text!.length).toBeGreaterThan(4096);
    }
    expect(msgKopf(testMsg({ betreff: 'x', vonName: 'a', vonMail: 'a@b.de', an: [] }))).not.toHaveProperty('text');
  });

  it('keine Outlook-Nachricht: verständlicher Fehler', () => {
    expect(() => msgKopf(new TextEncoder().encode('From: a@b.de\n\nHallo'))).toThrow('Keine Outlook-Nachricht (.msg)');
  });
});
