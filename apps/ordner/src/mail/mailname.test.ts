import { describe, expect, it } from 'vitest';
import type { MsgKopf } from '@core/mail/msg';
import { datumGueltig, istEigene, mailName, mailNameLesen, mailNamePruefen, mailVorschlag, nachname, themaAus, weitergeleitetVon } from './mailname';

const EIGENE = ['akh-architektur.de'];
/** mittags (UTC), damit das Datum in jeder Zeitzone dasselbe ist */
const tagUm = (iso: string) => new Date(`${iso}T11:00:00Z`);

function kopf(p: Partial<MsgKopf>): MsgKopf {
  return { klasse: 'IPM.Note', betreff: '', thema: '', vonName: '', vonMail: '', empfaenger: [], anText: '', ccText: '', anhaenge: [], ...p };
}

describe('Mails benennen: <Projektcode> von|an <Name> <JJMMTT> <Thema>.msg', () => {
  it('prüft den Namen: das Beispiel des Makros und was daran falsch ist', () => {
    const b = mailNamePruefen('SIS von Ruediger.Peitz@shs-soest.de 261110 WG__Grundriss_Sanierung_ESG.docx.msg', 'SIS');
    expect(b.ok).toBe(false);
    expect(b.gruende).toEqual(['Name ist eine E-Mail-Adresse – nur der Nachname', 'Thema beginnt mit „AW“/„WG“ – ohne Präfix', 'Unterstriche im Thema', 'Dateiendung im Thema (.docx)']);
    expect(mailNamePruefen('SIS von Peitz 261110 Raumaufteilung.msg', 'SIS')).toEqual({
      ok: true,
      gruende: [],
      teile: { code: 'SIS', richtung: 'von', name: 'Peitz', datum: '261110', thema: 'Raumaufteilung' },
    });
    // Name mit mehreren Wörtern, Thema mit Leerzeichen; Groß-/Kleinschreibung von „von“ und Endung egal
    expect(mailNamePruefen('SIS an Stadt Soest 260301 Bauantrag Nachforderung.MSG', 'sis').ok).toBe(true);
    expect(mailNamePruefen('BS9 von Peitz 261110 Raumaufteilung.msg', 'SIS').gruende).toEqual(['Projektcode „BS9“ statt „SIS“']);
    expect(mailNamePruefen('SIS von Peitz 261340 Raumaufteilung.msg', 'SIS').gruende).toEqual(['Datum „261340“ ist kein gültiges JJMMTT']);
    expect(mailNamePruefen('SIS von ruediger.peitz 261110 Raumaufteilung.msg', 'SIS').gruende).toEqual(['Name mit Punkt oder Unterstrich']);
    expect(mailNamePruefen('AW Grundriss.msg', 'SIS').gruende[0]).toMatch(/^entspricht nicht dem Schema/);
    expect(mailNamePruefen('SIS von Peitz  261110 Raumaufteilung.msg', 'SIS').gruende).toContain('doppelte Leerzeichen');
    expect(datumGueltig('260229')).toBe(false);
    expect(datumGueltig('280229')).toBe(true);
  });

  it('Thema aus dem Betreff, Nachname aus Anzeigename oder Adresse', () => {
    expect(themaAus('WG: Grundriss Sanierung ESG.docx')).toBe('Grundriss Sanierung ESG');
    expect(themaAus('AW: WG: RE: [EXTERN] Angebot_Fenster.pdf')).toBe('Angebot Fenster');
    expect(themaAus('WG__Grundriss_Sanierung_ESG.docx')).toBe('Grundriss Sanierung ESG');
    expect(themaAus('Termin: Baubesprechung / Rohbau?')).toBe('Termin Baubesprechung Rohbau');
    expect(themaAus('x '.repeat(80)).length).toBeLessThanOrEqual(80);
    expect(nachname('Peitz, Rüdiger', 'ruediger.peitz@shs-soest.de')).toBe('Peitz');
    expect(nachname('Nicole Aring | AKH Architektur GmbH')).toBe('Aring');
    expect(nachname('Dr. Anna Schulze-Meier')).toBe('Schulze-Meier');
    expect(nachname('', 'ruediger.peitz@shs-soest.de')).toBe('Peitz');
    expect(nachname('Ruediger.Peitz@shs-soest.de')).toBe('Peitz');
    expect(nachname('', 'info@stadt-soest.de')).toBe('Stadt-Soest');
    expect(nachname('"Bauaufsicht" <bauaufsicht@kreis-soest.de>', 'bauaufsicht@kreis-soest.de')).toBe('Bauaufsicht');
    expect(istEigene('T.Pendzialek@AKH-Architektur.de', EIGENE)).toBe(true);
    expect(istEigene('peitz@shs-soest.de', EIGENE)).toBe(false);
    expect(istEigene('x@akh-architektur.de', ['x@akh-architektur.de'])).toBe(true);
    expect(weitergeleitetVon('Zur Info\n\nVon: Peitz, Rüdiger <Ruediger.Peitz@shs-soest.de> \nGesendet: Montag')).toEqual({ name: 'Peitz, Rüdiger', mail: 'Ruediger.Peitz@shs-soest.de' });
    expect(weitergeleitetVon('From: bauamt@soest.de [mailto:bauamt@soest.de]')).toEqual({ name: 'bauamt@soest.de', mail: 'bauamt@soest.de' });
  });

  it('Vorschlag aus der Nachricht: von außen, an außen, Weiterleitung aus dem Büro – Datum aus Empfang bzw. Versand', () => {
    // die Beispiel-Mail: Kollegin leitet die Mail von Herrn Peitz weiter
    const weiter = kopf({
      betreff: 'WG: Grundriss Sanierung ESG.docx',
      thema: 'Grundriss Sanierung ESG.docx',
      vonName: 'Nicole Aring | AKH Architektur GmbH',
      vonMail: 'n.aring@akh-architektur.de',
      empfaenger: [{ name: 'Tobias Pendzialek', mail: 't.pendzialek@akh-architektur.de', art: 'an' }],
      gesendet: tagUm('2026-11-10'),
      empfangen: tagUm('2026-11-10'),
      text: 'Zur Info + Bearbeitung\n\nVon: Peitz, Rüdiger <Ruediger.Peitz@shs-soest.de>\nGesendet: Montag, 9. November 2026 10:10\nBetreff: Grundriss Sanierung ESG.docx',
    });
    const v = mailVorschlag(weiter, { code: 'SIS', eigene: EIGENE });
    expect(v.teile).toEqual({ code: 'SIS', richtung: 'von', name: 'Peitz', datum: '261110', thema: 'Grundriss Sanierung ESG' });
    expect(v.herkunft).toBe('weitergeleitet von Nicole Aring, ursprünglich von Ruediger.Peitz@shs-soest.de');
    expect(mailName(v.teile)).toBe('SIS von Peitz 261110 Grundriss Sanierung ESG.msg');
    expect(mailName({ ...v.teile, thema: 'Raumaufteilung' })).toBe('SIS von Peitz 261110 Raumaufteilung.msg');

    // von außen: Empfangsdatum
    const vonAussen = kopf({
      betreff: 'AW: Angebot',
      vonName: 'Peitz, Rüdiger',
      vonMail: 'ruediger.peitz@shs-soest.de',
      empfaenger: [{ name: 'TP', mail: 't.pendzialek@akh-architektur.de', art: 'an' }],
      gesendet: tagUm('2026-11-09'),
      empfangen: tagUm('2026-11-10'),
    });
    expect(mailVorschlag(vonAussen, { code: 'SIS', eigene: EIGENE }).teile).toMatchObject({ richtung: 'von', name: 'Peitz', datum: '261110', thema: 'Angebot' });
    // an außen: Versanddatum, erster Empfänger von außen (Kollegen in Cc zählen nicht)
    const anAussen = kopf({
      betreff: 'Planunterlagen',
      vonName: 'Tobias Pendzialek',
      vonMail: 't.pendzialek@akh-architektur.de',
      empfaenger: [
        { name: 'Nicole Aring', mail: 'n.aring@akh-architektur.de', art: 'an' },
        { name: 'Peitz, Rüdiger', mail: 'ruediger.peitz@shs-soest.de', art: 'an' },
      ],
      gesendet: tagUm('2026-11-08'),
      empfangen: tagUm('2026-11-09'),
    });
    expect(mailVorschlag(anAussen, { code: 'SIS', eigene: EIGENE }).teile).toMatchObject({ richtung: 'an', name: 'Peitz', datum: '261108', thema: 'Planunterlagen' });
    // ohne eigene Domain: Richtung aus dem bisherigen Namen
    const bisher = mailNameLesen('SIS an Peitz 261101 Alt.msg');
    expect(mailVorschlag(anAussen, { code: 'SIS', eigene: [], bisher }).teile).toMatchObject({ richtung: 'an', name: 'Aring', datum: '261108' });
    expect(mailVorschlag(anAussen, { code: 'SIS', eigene: [] }).herkunft).toContain('eigene Domain');
    // ohne Betreff
    expect(mailVorschlag(kopf({ vonMail: 'a@b.de' }), { code: 'SIS', eigene: EIGENE }).teile.thema).toBe('ohne Betreff');
  });
});
