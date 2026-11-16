import { describe, expect, it } from 'vitest';
import { testMsg } from '../__fixtures__/msg';
import { emlKopf, htmlText, msgKopf } from './msg';

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

  it('angehängte Nachrichten: eingebettet, als .msg- und als .eml-Datei, auch verschachtelt; X.500-Absender; Nachrichten-ID; nur HTML', () => {
    const original = { betreff: 'Statik Dach', vonName: 'Muster, Max', vonMail: 'max.muster@statik-muster.example', an: [], gesendet: new Date('2026-11-09T09:10:00Z'), text: 'Anbei die Statik.' };
    const innen = {
      betreff: 'WG: Statik Dach',
      vonName: 'Tom Planer',
      vonMail: '',
      vonX500: '/O=EXCHANGELABS/OU=EXCHANGE ADMINISTRATIVE GROUP/CN=RECIPIENTS/CN=TPLANER',
      an: [],
      angehaengt: [{ art: 'eingebettet' as const, mail: original }],
    };
    const k = msgKopf(
      testMsg({
        betreff: 'WG: Statik Dach',
        vonName: 'Erika Beispiel',
        vonMail: '',
        vonX500: '/o=ExchangeLabs/ou=Exchange Administrative Group/cn=Recipients/cn=ebeispiel',
        an: [],
        nachrichtId: '<wg-1@architekten-beispiel.example>',
        html: '<html><head><style>p{}</style></head><body><p>Zur Info</p><p><b>Von:</b> Muster,\r\n Max &lt;max.muster@statik-muster.example&gt;<br><b>Gesendet:</b> Montag</p></body></html>',
        angehaengt: [
          { art: 'eingebettet', mail: innen },
          { art: 'msg', name: 'Rückfrage.msg', mail: { ...original, betreff: 'Rückfrage', vonName: 'Bauamt Musterstadt', vonMail: 'bauamt@musterstadt.example' } },
          {
            art: 'eml',
            name: 'Angebot.eml',
            inhalt:
              'From: =?utf-8?Q?J=C3=BCrgen_Fenster?= <j.fenster@fenster-beispiel.example>\r\nTo: a@architekten-beispiel.example\r\nSubject: Angebot\r\nDate: Mon, 9 Nov 2026 10:10:00 +0100\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nGr=C3=BC=C3=9Fe',
          },
        ],
      }),
      { mitText: true },
    );
    expect(k).toMatchObject({ vonName: 'Erika Beispiel', vonMail: '', vonX500: true, nachrichtId: '<wg-1@architekten-beispiel.example>' });
    expect(k.text).toBe('Zur Info\nVon: Muster, Max <max.muster@statik-muster.example>\nGesendet: Montag\n');
    expect(k.anhaenge).toEqual(['WG: Statik Dach', 'Rückfrage.msg', 'Angebot.eml']);
    expect(k.angehaengt?.map((a) => [a.klasse, a.vonName, a.vonMail])).toEqual([
      ['IPM.Note', 'Tom Planer', ''],
      ['IPM.Note', 'Bauamt Musterstadt', 'bauamt@musterstadt.example'],
      ['eml', 'Jürgen Fenster', 'j.fenster@fenster-beispiel.example'],
    ]);
    expect(k.angehaengt?.[0].vonX500).toBe(true);
    expect(k.angehaengt?.[0].angehaengt?.[0]).toMatchObject({ vonMail: 'max.muster@statik-muster.example', text: 'Anbei die Statik.' });
    expect(k.angehaengt?.[0].angehaengt?.[0].gesendet?.toISOString()).toBe('2026-11-09T09:10:00.000Z');
    expect(k.angehaengt?.[2]).toMatchObject({ text: 'Grüße', betreff: 'Angebot' });
    // ohne mitText keine angehängten Nachrichten
    expect(msgKopf(testMsg({ ...original, angehaengt: [{ art: 'eingebettet', mail: original }] }))).not.toHaveProperty('angehaengt');
  });

  it('eml: mehrteilig, base64, HTML; keine Internet-Nachricht: Fehler', () => {
    const eml = [
      'From: "Muster, Max" <max.muster@statik-muster.example>',
      'Subject: =?utf-8?B?R3J1bmRyaXNz?=',
      'Content-Type: multipart/alternative; boundary="xx"',
      '',
      '--xx',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      btoa('<p>Hallo</p><p>Welt</p>'),
      '--xx--',
      '',
    ].join('\r\n');
    expect(emlKopf(new TextEncoder().encode(eml))).toMatchObject({ vonName: 'Muster, Max', vonMail: 'max.muster@statik-muster.example', betreff: 'Grundriss', text: 'Hallo\nWelt\n' });
    expect(() => emlKopf(new TextEncoder().encode('Hallo'))).toThrow('Keine Internet-Nachricht');
    expect(htmlText('a&#228;&#x00FC;&auml;&unbekannt;')).toBe('aäüä&unbekannt;');
  });

  it('keine Outlook-Nachricht: verständlicher Fehler', () => {
    expect(() => msgKopf(new TextEncoder().encode('From: a@b.example\n\nHallo'))).toThrow('Keine Outlook-Nachricht (.msg)');
  });
});
