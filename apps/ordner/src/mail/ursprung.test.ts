import { describe, expect, it } from 'vitest';
import type { TestMail } from '@core/__fixtures__/msg';
import { testMsg } from '@core/__fixtures__/msg';
import { msgKopf } from '@core/mail/msg';
import { mailVorschlag } from './mailname';
import { betreffPraefixe, datumAusText, kopfbloecke, mailSchluessel, ursprungBestimmen } from './ursprung';

// alles erfunden: Büro „architekten-beispiel.example“, Absender von außen mit .example-Domains
const EIGENE = ['architekten-beispiel.example'];
const X500 = '/o=ExchangeLabs/ou=Exchange Administrative Group (FYDIBOHF23SPDLT)/cn=Recipients/cn=ebeispiel';
const mittag = (iso: string) => new Date(`${iso}T11:00:00Z`);
const kollegin = { vonName: 'Erika Beispiel | Beispiel Architekten GmbH', vonMail: 'e.beispiel@architekten-beispiel.example' };
const an = [{ name: 'Tom Planer', mail: 't.planer@architekten-beispiel.example' }];
const lies = (m: Partial<TestMail>) => msgKopf(testMsg({ betreff: '', vonName: '', vonMail: '', an, gesendet: mittag('2026-11-10'), empfangen: mittag('2026-11-10'), ...m }), { mitText: true });
const vorschlag = (m: Partial<TestMail>, o: Partial<Parameters<typeof mailVorschlag>[1]> = {}) => mailVorschlag(lies(m), { code: 'BSP', eigene: EIGENE, ...o });

describe('interne Weiterleitung: ursprünglichen Absender bestimmen', () => {
  it('Betreff-Präfixe in mehreren Sprachen, mehrfach und gemischt', () => {
    expect(betreffPraefixe('WG: Angebot')).toEqual(['weiter']);
    expect(betreffPraefixe('Fwd: FW: TR: Angebot')).toEqual(['weiter', 'weiter', 'weiter']);
    expect(betreffPraefixe('AW: WG: Angebot')).toEqual(['antwort', 'weiter']);
    expect(betreffPraefixe('[EXTERN] RE[2]: wg : Angebot')).toEqual(['antwort', 'weiter']);
    expect(betreffPraefixe('RV: Presupuesto')).toEqual(['weiter']);
    expect(betreffPraefixe('Termin: Baubesprechung')).toEqual([]);
  });

  it('Outlook deutsch, Nur-Text: „Von: … Gesendet: … An: … Betreff: …“', () => {
    const v = vorschlag({
      ...kollegin,
      betreff: 'WG: Statik Dach',
      text: 'Zur Info\n\nVon: Muster, Max <max.muster@statik-muster.example>\nGesendet: Montag, 9. November 2026 10:10\nAn: Beispiel, Erika <e.beispiel@architekten-beispiel.example>\nBetreff: Statik Dach\n\nAnbei die Statik.',
    });
    expect(v.ursprung).toMatchObject({ art: 'weitergeleitet', quelle: { name: 'Muster, Max', mail: 'max.muster@statik-muster.example' } });
    expect(v.ursprung.weiterleiter?.mail).toBe('e.beispiel@architekten-beispiel.example');
    expect(v.teile).toMatchObject({ richtung: 'von', name: 'Muster', datum: '261110', thema: 'Statik Dach' });
    expect(v.herkunft).toBe('ursprünglich von Muster, Max <max.muster@statik-muster.example> · weitergeleitet von Erika Beispiel am 10.11.2026');
  });

  it('Outlook englisch, HTML (Quelltext umbrochen, „[mailto:…]“), Absender nur mit X.500-Adresse; ohne eigene Domains wird nicht geraten', () => {
    const html =
      '<html><body><p>FYI</p><div style="border-top:solid #E1E1E1 1.0pt"><p class=MsoNormal><b>From:</b> Fenster, J&uuml;rgen\r\n[mailto:j.fenster@fenster-beispiel.example]<br><b>Sent:</b> Monday, November 9, 2026 10:10 AM<br><b>To:</b> Beispiel, Erika<br><b>Subject:</b> Angebot Fenster</p></div><p>Sehr geehrte Damen und Herren</p></body></html>';
    const v = vorschlag({ betreff: 'FW: Angebot Fenster', vonName: 'Erika Beispiel', vonMail: '', vonX500: X500, html });
    expect(v.ursprung).toMatchObject({ art: 'weitergeleitet', quelle: { name: 'Fenster, Jürgen', mail: 'j.fenster@fenster-beispiel.example' } });
    expect(v.teile).toMatchObject({ richtung: 'von', name: 'Fenster' });
    // ohne eigene Domains: die Weiterleitung ist am X.500-Absender erkannt, ob die SMTP-Adresse im Kopf zum Büro gehört, nicht
    const ohne = vorschlag({ betreff: 'FW: Angebot Fenster', vonName: 'Erika Beispiel', vonMail: '', vonX500: X500, html }, { eigene: [] });
    expect(ohne.ursprung).toMatchObject({ art: 'unklar', hinweis: 'ohne eigene Domains ist nicht zu erkennen, ob der Absender zum Büro gehört' });
    expect(ohne.ursprung.kandidaten).toEqual([{ name: 'Fenster, Jürgen', mail: 'j.fenster@fenster-beispiel.example' }]);
    expect(ohne.teile.name).toBe('');
  });

  it('Outlook englisch, Nur-Text und Outlook deutsch, HTML', () => {
    const text = vorschlag({
      ...kollegin,
      betreff: 'FW: Rohbau',
      text: 'see below\r\n\r\nFrom: Bau GmbH <info@bau-beispiel.example>\r\nSent: Monday, November 9, 2026 10:10 AM\r\nTo: Erika Beispiel\r\nSubject: Rohbau',
    });
    expect(text.ursprung.quelle.mail).toBe('info@bau-beispiel.example');
    const html = vorschlag({
      ...kollegin,
      betreff: 'WG: Rohbau',
      html: '<p>s. u.</p><p><b>Von:</b> Bau GmbH &lt;info@bau-beispiel.example&gt;<br><b>Gesendet:</b> Montag, 9. November 2026 10:10<br><b>An:</b> Erika Beispiel<br><b>Betreff:</b> Rohbau</p>',
    });
    expect(html.ursprung.quelle.mail).toBe('info@bau-beispiel.example');
  });

  it('Gmail und Thunderbird: Trennzeile, auch ohne „WG:“ im Betreff', () => {
    const gmail = vorschlag({
      ...kollegin,
      betreff: 'Fwd: Bodengutachten',
      text: '---------- Forwarded message ---------\nFrom: Geo Labor <labor@geo-beispiel.example>\nDate: Mon, Nov 9, 2026 at 10:10 AM\nSubject: Bodengutachten\nTo: <e.beispiel@architekten-beispiel.example>\n',
    });
    expect(gmail.ursprung.quelle.mail).toBe('labor@geo-beispiel.example');
    const thunderbird = vorschlag({
      ...kollegin,
      betreff: 'Bodengutachten',
      text: 'Zur Kenntnis\n\n-------- Weitergeleitete Nachricht --------\nBetreff: \tBodengutachten\nDatum: \tMon, 9 Nov 2026 10:10:00 +0100\nVon: \tGeo Labor <labor@geo-beispiel.example>\nAn: \tErika Beispiel <e.beispiel@architekten-beispiel.example>\n',
    });
    expect(thunderbird.ursprung).toMatchObject({ art: 'weitergeleitet', quelle: { mail: 'labor@geo-beispiel.example' } });
    expect(kopfbloecke('-------- Weitergeleitete Nachricht --------\nBetreff: x\nDatum: y\nVon: a@b.example\nAn: c@d.example')[0]).toMatchObject({ weiterMarke: true, betreff: 'x', datum: 'y' });
  });

  it('Kette mit zweifacher Weiterleitung: der älteste externe Absender; interne Glieder nur mit Namen über die Kontakte', () => {
    const text = [
      'bitte übernehmen',
      '',
      'Von: Planer, Tom',
      'Gesendet: Dienstag, 10. November 2026 08:00',
      'An: Beispiel, Erika',
      'Betreff: WG: Brandschutz',
      '',
      'zur Info',
      '',
      'Von: Brand, Bernd <b.brand@brandschutz-beispiel.example>',
      'Gesendet: Montag, 9. November 2026 10:10',
      'An: Planer, Tom',
      'Betreff: Brandschutz',
    ].join('\n');
    // „Planer, Tom“ ohne Adresse: ohne Kontakte unklar …
    expect(vorschlag({ ...kollegin, betreff: 'WG: WG: Brandschutz', text }).ursprung).toMatchObject({ art: 'unklar', kandidaten: [{ name: 'Planer, Tom', mail: '' }] });
    // … mit Kontakten intern – dann weiter zurück zum Brandschutzplaner
    const v = vorschlag({ ...kollegin, betreff: 'WG: WG: Brandschutz', text }, { kontakte: [{ name: 'Tom Planer', mail: 't.planer@architekten-beispiel.example' }] });
    expect(v.ursprung).toMatchObject({ art: 'weitergeleitet', quelle: { name: 'Brand, Bernd', mail: 'b.brand@brandschutz-beispiel.example' } });
    expect(v.ursprung.kette.map((g) => g.mail)).toEqual(['t.planer@architekten-beispiel.example', 'b.brand@brandschutz-beispiel.example']);
    expect(v.teile.name).toBe('Brand');
  });

  it('angehängte .msg und eingebettete Nachricht (auch verschachtelt); mit Kopfblock im Text nur ein Anhang vom selben Absender', () => {
    const original: TestMail = { betreff: 'Statik Dach', vonName: 'Muster, Max', vonMail: 'max.muster@statik-muster.example', an, gesendet: mittag('2026-11-09') };
    const datei = vorschlag({ ...kollegin, betreff: 'Statik Dach', text: 'siehe Anhang', angehaengt: [{ art: 'msg', name: 'Statik Dach.msg', mail: original }] });
    expect(datei.ursprung).toMatchObject({ art: 'weitergeleitet', quelle: { mail: 'max.muster@statik-muster.example' } });
    expect(datei.ursprung.kette[0]).toMatchObject({ quelle: 'anhang', betreff: 'Statik Dach' });
    const innen: TestMail = { betreff: 'WG: Statik Dach', vonName: 'Tom Planer', vonMail: '', vonX500: X500, an, angehaengt: [{ art: 'eingebettet', mail: original }] };
    // der Kopfblock nennt den Kollegen, dessen Weiterleitung angehängt ist: dann gilt die angehängte Mail (mit dem Original darin)
    const verschachtelt = vorschlag({
      ...kollegin,
      betreff: 'WG: Statik Dach',
      text: 'Von: Planer, Tom\nGesendet: Montag\nBetreff: WG: Statik Dach',
      angehaengt: [{ art: 'eingebettet', mail: innen }],
    });
    expect(verschachtelt.ursprung.quelle.mail).toBe('max.muster@statik-muster.example');
    // Weiterleitung im Text, die weitergeleitete Mail hatte selbst eine .msg angehängt: Quelle ist der Absender im Kopf
    const pruef: TestMail = { betreff: 'Prüfbericht', vonName: 'Prüf, Paula', vonMail: 'p.pruef@pruefamt-beispiel.example', an };
    const mitAnhang = vorschlag({
      ...kollegin,
      betreff: 'WG: Statik Dach',
      text: 'Von: Muster, Max <max.muster@statik-muster.example>\nGesendet: Montag\nBetreff: Statik Dach\n\nanbei der Prüfbericht',
      angehaengt: [{ art: 'msg', name: 'Prüfbericht.msg', mail: pruef }],
    });
    expect(mitAnhang.ursprung).toMatchObject({ art: 'weitergeleitet', quelle: { mail: 'max.muster@statik-muster.example' } });
    // … auch wenn der Anhang von jemandem aus dem Büro ist
    const internerAnhang = vorschlag({
      ...kollegin,
      betreff: 'WG: Statik Dach',
      text: 'Von: Muster, Max <max.muster@statik-muster.example>\nGesendet: Montag\nBetreff: Statik Dach',
      angehaengt: [{ art: 'msg', name: 'Notiz.msg', mail: { betreff: 'Notiz', vonName: 'Tom Planer', vonMail: 't.planer@architekten-beispiel.example', an } }],
    });
    expect(internerAnhang.ursprung.quelle.mail).toBe('max.muster@statik-muster.example');
    // angehängte .eml (message/rfc822)
    const eml = vorschlag({
      ...kollegin,
      betreff: 'WG: Angebot',
      angehaengt: [{ art: 'eml', name: 'Angebot.eml', inhalt: 'From: Jürgen Fenster <j.fenster@fenster-beispiel.example>\r\nSubject: Angebot\r\n\r\nText' }],
    });
    expect(eml.ursprung.quelle.mail).toBe('j.fenster@fenster-beispiel.example');
  });

  it('interne Mail ohne Weiterleitung und interne Weiterleitung einer internen Mail: der direkte Absender gilt', () => {
    const intern = vorschlag({ ...kollegin, betreff: 'Planbesprechung', text: 'Von: Planer, Tom <t.planer@architekten-beispiel.example>\nGesendet: Montag\nBetreff: Planbesprechung' });
    expect(intern.ursprung.art).toBe('direkt');
    expect(intern.teile).toMatchObject({ richtung: 'von', name: 'Beispiel' });
    // Antwort aus dem Büro mit zitiertem Kopf von außen: keine Weiterleitung
    expect(vorschlag({ ...kollegin, betreff: 'AW: Statik', text: 'Danke\n\nVon: Muster, Max <max.muster@statik-muster.example>\nGesendet: Montag\nBetreff: Statik' }).ursprung.art).toBe('direkt');
    const rein = vorschlag({ ...kollegin, betreff: 'WG: Urlaubsplanung', text: 'Von: Planer, Tom <t.planer@architekten-beispiel.example>\nGesendet: Montag\nBetreff: Urlaubsplanung' });
    expect(rein.ursprung.art).toBe('intern');
    expect(rein.teile).toMatchObject({ richtung: 'von', name: 'Beispiel' });
    expect(rein.herkunft).toContain('ursprünglich ebenfalls aus dem Büro');
  });

  it('externe Weiterleitung: der externe Weiterleiter gilt, nicht der Ursprung', () => {
    const v = vorschlag({
      betreff: 'WG: Statik Dach',
      vonName: 'Bauherr, Berta',
      vonMail: 'berta@bauherr-beispiel.example',
      text: 'Von: Muster, Max <max.muster@statik-muster.example>\nGesendet: Montag\nBetreff: Statik Dach',
    });
    expect(v.ursprung.art).toBe('direkt');
    expect(v.teile).toMatchObject({ richtung: 'von', name: 'Bauherr' });
  });

  it('mehrdeutig: nichts raten – „unklar“ ohne Namen; Korrektur von Hand gilt und lässt sich auf „intern“ setzen', () => {
    const kopf = lies({ ...kollegin, betreff: 'WG: Termin', text: 'siehe unten\n\nVon: Schmidt, Anna\nGesendet: Montag\nBetreff: Termin', nachrichtId: '<wg-7@architekten-beispiel.example>' });
    const kontakte = [
      { name: 'Anna Schmidt', mail: 'a.schmidt@statik-muster.example' },
      { name: 'Schmidt, Anna', mail: 'anna.schmidt@bau-beispiel.example' },
    ];
    const v = mailVorschlag(kopf, { code: 'BSP', eigene: EIGENE, kontakte });
    expect(v.ursprung).toMatchObject({ art: 'unklar', hinweis: '„Schmidt, Anna“ ohne Adresse – mehrere Treffer in den Kontakten' });
    expect(v.ursprung.kandidaten.map((p) => p.mail)).toEqual(['a.schmidt@statik-muster.example', 'anna.schmidt@bau-beispiel.example']);
    expect(v.teile).toMatchObject({ richtung: 'von', name: '' });
    expect(v.herkunft).toBe('intern weitergeleitet – ursprünglicher Absender unklar');
    expect(mailSchluessel(kopf)).toBe('<wg-7@architekten-beispiel.example>');
    const korrigiert = mailVorschlag(kopf, { code: 'BSP', eigene: EIGENE, kontakte, korrekturen: { [mailSchluessel(kopf)]: kontakte[1] } });
    expect(korrigiert.ursprung.art).toBe('korrigiert');
    expect(korrigiert.teile.name).toBe('Schmidt');
    expect(korrigiert.herkunft).toContain('(von Hand)');
    const alsIntern = mailVorschlag(kopf, { code: 'BSP', eigene: EIGENE, korrekturen: { [mailSchluessel(kopf)]: { intern: true } } });
    expect(alsIntern.teile).toMatchObject({ richtung: 'von', name: 'Beispiel' });
    // ohne jeden Kopfblock: ebenfalls unklar
    expect(ursprungBestimmen(lies({ ...kollegin, betreff: 'WG: Termin', text: 'bitte erledigen' }), { eigene: EIGENE })).toMatchObject({
      art: 'unklar',
      hinweis: 'kein Kopf der weitergeleiteten Mail gefunden',
    });
    // zwei angehängte Mails verschiedener Absender
    const zwei = ursprungBestimmen(
      lies({
        ...kollegin,
        betreff: 'WG: zwei Mails',
        angehaengt: [
          { art: 'eingebettet', mail: { betreff: 'a', vonName: 'A', vonMail: 'a@eins.example', an } },
          { art: 'eingebettet', mail: { betreff: 'b', vonName: 'B', vonMail: 'b@zwei.example', an } },
        ],
      }),
      { eigene: EIGENE },
    );
    expect(zwei).toMatchObject({ art: 'unklar', hinweis: 'mehrere angehängte Mails von verschiedenen Absendern' });
    expect(zwei.kandidaten.map((p) => p.mail)).toEqual(['a@eins.example', 'b@zwei.example']);
  });

  it('Name ohne Adresse, eindeutig in den Kontakten: Adresse daraus, mit Hinweis', () => {
    const v = vorschlag(
      { ...kollegin, betreff: 'WG: Statik', text: 'Von: Muster, Max\nGesendet: Montag\nBetreff: Statik' },
      { kontakte: [{ name: 'Dr. Max Muster', mail: 'max.muster@statik-muster.example' }] },
    );
    expect(v.ursprung).toMatchObject({ art: 'weitergeleitet', quelle: { mail: 'max.muster@statik-muster.example' }, hinweis: 'Adresse über den Namen aus den Kontakten' });
  });

  it('Datum aus dem Kopfblock: Outlook deutsch und englisch, Gmail, Thunderbird, Zahlen; sonst null', () => {
    const ort = (j: number, m: number, t: number, h: number, min: number) => new Date(j, m - 1, t, h, min).getTime();
    expect(datumAusText('Montag, 9. November 2026 10:10')?.getTime()).toBe(ort(2026, 11, 9, 10, 10));
    expect(datumAusText('Monday, November 9, 2026 10:10 PM')?.getTime()).toBe(ort(2026, 11, 9, 22, 10));
    expect(datumAusText('Mon, Nov 9, 2026 at 10:10 AM')?.getTime()).toBe(ort(2026, 11, 9, 10, 10));
    expect(datumAusText('Mo., 9. Nov. 2026 um 10:10 Uhr')?.getTime()).toBe(ort(2026, 11, 9, 10, 10));
    expect(datumAusText('Mon, 9 Nov 2026 10:10:00 +0100')?.getTime()).toBe(ort(2026, 11, 9, 10, 10));
    expect(datumAusText('09.11.2026 10:10')?.getTime()).toBe(ort(2026, 11, 9, 10, 10));
    expect(datumAusText('11/9/2026 10:10 AM')?.getTime()).toBe(ort(2026, 11, 9, 10, 10));
    expect(datumAusText('Montag')).toBeNull();
    expect(datumAusText('31. Februar 2026')).toBeNull();
  });
});
