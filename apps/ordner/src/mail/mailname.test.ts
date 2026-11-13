import { describe, expect, it } from 'vitest';
import type { MsgKopf } from '@core/mail/msg';
import { datumGueltig, istEigene, mailName, mailNameLesen, mailNamePruefen, mailVorschlag, nachname, themaAus, weitergeleitetVon } from './mailname';

const EIGENE = ['architekten-beispiel.example'];
/** mittags (UTC), damit das Datum in jeder Zeitzone dasselbe ist */
const tagUm = (iso: string) => new Date(`${iso}T11:00:00Z`);

function kopf(p: Partial<MsgKopf>): MsgKopf {
  return { klasse: 'IPM.Note', betreff: '', thema: '', vonName: '', vonMail: '', empfaenger: [], anText: '', ccText: '', anhaenge: [], ...p };
}

describe('Mails benennen: <Projektcode> von|an <Name> <JJMMTT> <Thema>.msg', () => {
  it('prüft den Namen: das Beispiel des Makros und was daran falsch ist', () => {
    const b = mailNamePruefen('BSP von Max.Muster@statik-muster.example 261110 WG__Grundriss_Sanierung_Musterschule.docx.msg', 'BSP');
    expect(b.ok).toBe(false);
    expect(b.gruende).toEqual(['Name ist eine E-Mail-Adresse – nur der Nachname', 'Thema beginnt mit „AW“/„WG“ – ohne Präfix', 'Unterstriche im Thema', 'Dateiendung im Thema (.docx)']);
    expect(mailNamePruefen('BSP von Muster 261110 Raumaufteilung.msg', 'BSP')).toEqual({
      ok: true,
      gruende: [],
      teile: { code: 'BSP', richtung: 'von', name: 'Muster', datum: '261110', thema: 'Raumaufteilung' },
    });
    // Name mit mehreren Wörtern, Thema mit Leerzeichen; Groß-/Kleinschreibung von „von“ und Endung egal
    expect(mailNamePruefen('BSP an Stadt Musterstadt 260301 Bauantrag Nachforderung.MSG', 'bsp').ok).toBe(true);
    expect(mailNamePruefen('BS9 von Muster 261110 Raumaufteilung.msg', 'BSP').gruende).toEqual(['Projektcode „BS9“ statt „BSP“']);
    expect(mailNamePruefen('BSP von Muster 261340 Raumaufteilung.msg', 'BSP').gruende).toEqual(['Datum „261340“ ist kein gültiges JJMMTT']);
    expect(mailNamePruefen('BSP von max.muster 261110 Raumaufteilung.msg', 'BSP').gruende).toEqual(['Name mit Punkt oder Unterstrich']);
    expect(mailNamePruefen('AW Grundriss.msg', 'BSP').gruende[0]).toMatch(/^entspricht nicht dem Schema/);
    expect(mailNamePruefen('BSP von Muster  261110 Raumaufteilung.msg', 'BSP').gruende).toContain('doppelte Leerzeichen');
    expect(datumGueltig('260229')).toBe(false);
    expect(datumGueltig('280229')).toBe(true);
  });

  it('Thema aus dem Betreff, Nachname aus Anzeigename oder Adresse', () => {
    expect(themaAus('WG: Grundriss Sanierung Musterschule.docx')).toBe('Grundriss Sanierung Musterschule');
    expect(themaAus('AW: WG: RE: [EXTERN] Angebot_Fenster.pdf')).toBe('Angebot Fenster');
    expect(themaAus('WG__Grundriss_Sanierung_Musterschule.docx')).toBe('Grundriss Sanierung Musterschule');
    expect(themaAus('Termin: Baubesprechung / Rohbau?')).toBe('Termin Baubesprechung Rohbau');
    expect(themaAus('x '.repeat(80)).length).toBeLessThanOrEqual(80);
    expect(nachname('Muster, Max', 'max.muster@statik-muster.example')).toBe('Muster');
    expect(nachname('Erika Beispiel | Beispiel Architekten GmbH')).toBe('Beispiel');
    expect(nachname('Dr. Anna Schulze-Meier')).toBe('Schulze-Meier');
    expect(nachname('', 'max.muster@statik-muster.example')).toBe('Muster');
    expect(nachname('Max.Muster@statik-muster.example')).toBe('Muster');
    expect(nachname('', 'info@stadt-musterstadt.example')).toBe('Stadt-Musterstadt');
    expect(nachname('"Bauaufsicht" <bauaufsicht@kreis-musterstadt.example>', 'bauaufsicht@kreis-musterstadt.example')).toBe('Bauaufsicht');
    expect(istEigene('T.Planer@Architekten-Beispiel.example', EIGENE)).toBe(true);
    expect(istEigene('muster@statik-muster.example', EIGENE)).toBe(false);
    expect(istEigene('x@architekten-beispiel.example', ['x@architekten-beispiel.example'])).toBe(true);
    expect(weitergeleitetVon('Zur Info\n\nVon: Muster, Max <Max.Muster@statik-muster.example> \nGesendet: Montag')).toEqual({ name: 'Muster, Max', mail: 'Max.Muster@statik-muster.example' });
    expect(weitergeleitetVon('From: bauamt@musterstadt.example [mailto:bauamt@musterstadt.example]')).toEqual({ name: 'bauamt@musterstadt.example', mail: 'bauamt@musterstadt.example' });
  });

  it('Vorschlag aus der Nachricht: von außen, an außen, Weiterleitung aus dem Büro – Datum aus Empfang bzw. Versand', () => {
    // die Beispiel-Mail: Kollegin leitet die Mail von Herrn Muster weiter
    const weiter = kopf({
      betreff: 'WG: Grundriss Sanierung Musterschule.docx',
      thema: 'Grundriss Sanierung Musterschule.docx',
      vonName: 'Erika Beispiel | Beispiel Architekten GmbH',
      vonMail: 'e.beispiel@architekten-beispiel.example',
      empfaenger: [{ name: 'Tom Planer', mail: 't.planer@architekten-beispiel.example', art: 'an' }],
      gesendet: tagUm('2026-11-10'),
      empfangen: tagUm('2026-11-10'),
      text: 'Zur Info + Bearbeitung\n\nVon: Muster, Max <Max.Muster@statik-muster.example>\nGesendet: Montag, 9. November 2026 10:10\nBetreff: Grundriss Sanierung Musterschule.docx',
    });
    const v = mailVorschlag(weiter, { code: 'BSP', eigene: EIGENE });
    expect(v.teile).toEqual({ code: 'BSP', richtung: 'von', name: 'Muster', datum: '261110', thema: 'Grundriss Sanierung Musterschule' });
    expect(v.herkunft).toBe('weitergeleitet von Erika Beispiel, ursprünglich von Max.Muster@statik-muster.example');
    expect(mailName(v.teile)).toBe('BSP von Muster 261110 Grundriss Sanierung Musterschule.msg');
    expect(mailName({ ...v.teile, thema: 'Raumaufteilung' })).toBe('BSP von Muster 261110 Raumaufteilung.msg');

    // von außen: Empfangsdatum
    const vonAussen = kopf({
      betreff: 'AW: Angebot',
      vonName: 'Muster, Max',
      vonMail: 'max.muster@statik-muster.example',
      empfaenger: [{ name: 'TP', mail: 't.planer@architekten-beispiel.example', art: 'an' }],
      gesendet: tagUm('2026-11-09'),
      empfangen: tagUm('2026-11-10'),
    });
    expect(mailVorschlag(vonAussen, { code: 'BSP', eigene: EIGENE }).teile).toMatchObject({ richtung: 'von', name: 'Muster', datum: '261110', thema: 'Angebot' });
    // an außen: Versanddatum, erster Empfänger von außen (Kollegen in Cc zählen nicht)
    const anAussen = kopf({
      betreff: 'Planunterlagen',
      vonName: 'Tom Planer',
      vonMail: 't.planer@architekten-beispiel.example',
      empfaenger: [
        { name: 'Erika Beispiel', mail: 'e.beispiel@architekten-beispiel.example', art: 'an' },
        { name: 'Muster, Max', mail: 'max.muster@statik-muster.example', art: 'an' },
      ],
      gesendet: tagUm('2026-11-08'),
      empfangen: tagUm('2026-11-09'),
    });
    expect(mailVorschlag(anAussen, { code: 'BSP', eigene: EIGENE }).teile).toMatchObject({ richtung: 'an', name: 'Muster', datum: '261108', thema: 'Planunterlagen' });
    // ohne eigene Domain: Richtung aus dem bisherigen Namen
    const bisher = mailNameLesen('BSP an Muster 261101 Alt.msg');
    expect(mailVorschlag(anAussen, { code: 'BSP', eigene: [], bisher }).teile).toMatchObject({ richtung: 'an', name: 'Beispiel', datum: '261108' });
    expect(mailVorschlag(anAussen, { code: 'BSP', eigene: [] }).herkunft).toContain('eigene Domain');
    // ohne Betreff
    expect(mailVorschlag(kopf({ vonMail: 'a@b.example' }), { code: 'BSP', eigene: EIGENE }).teile.thema).toBe('ohne Betreff');
  });
});
