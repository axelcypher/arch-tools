/**
 * Gemeinsame Teile der Bescheinigungen staatlich anerkannter Sachverständiger (SV-VO, § 68 BauO NRW 2018) und der
 * Bestätigungen qualifizierter Tragwerksplanender (nw040003 bis nw040017): Alle Vordrucke tragen unter „I. Angaben
 * zum Bauvorhaben“ dieselben Komponentennamen (Bauherrschaft Memo3–8, Entwurfsverfassende Memo9 und Memo11–15,
 * Fachplanende Memo16–21, Baugrundstück Memo22–26, Bezeichnung Memo27) und unter „III. Unterschrift“ Memo28 für
 * Ort und Datum. Unterschrift und Rundstempel sind keine Felder.
 *
 * Ausgefüllt werden die Vordrucke von der sachverständigen Person bzw. den Tragwerksplanenden – deren Angaben zählen.
 * Telefon, Telefax und E-Mail: eine Angabe genügt. Die Fachplanenden sind nicht in jedem Fachgebiet beteiligt (den
 * Nachweis kann auch die sachverständige Person oder die/der Entwurfsverfassende aufstellen); wo der Vordruck das
 * offenlässt, zählen sie nicht.
 */

import type { Bedingung } from '../bedingung';
import type { FormularProfil } from '../profil';
import { gruppeV, s, zaehltNicht } from './hilfen';

const s0 = s(0);

/** Wie die Fachplanenden zählen: immer, nur wenn vorhanden (zählen nicht) oder nach einer Bedingung */
export type Fachplanende = 'pflicht' | 'optional' | Bedingung;

/** I. Angaben zum Bauvorhaben; `bauherrschaft` = Rahmen der Bauherrschaft (Panel1 oder Panel2) */
export function angabenBauvorhaben(bauherrschaft: string, fachplanende: Fachplanende): Partial<FormularProfil> {
  const optional = fachplanende === 'optional';
  const bedingung = typeof fachplanende === 'object' ? fachplanende : undefined;
  return {
    abschnitte: {
      [`0:${bauherrschaft}`]: { titel: 'Bauherrschaft' },
      '0:Panel4': { titel: 'Entwurfsverfassende' },
      '0:Panel5': {
        titel: optional ? 'Fachplanende (nur wenn beteiligt)' : 'Fachplanende',
        ...(bedingung ? { bedingung } : {}),
      },
      '0:Panel6': { titel: 'Angaben zum Baugrundstück' },
      '0:Panel7': { titel: 'Bezeichnung des Vorhabens' },
    },
    feldTitel: {
      '0:Memo3': 'Bauherrschaft: Name, Vorname, Firma',
      '0:Memo4': 'Bauherrschaft: Straße, Hausnummer',
      '0:Memo5': 'Bauherrschaft: PLZ, Ort',
      '0:Memo6': 'Bauherrschaft: Telefon',
      '0:Memo7': 'Bauherrschaft: Telefax',
      '0:Memo8': 'Bauherrschaft: E-Mail',
      '0:Memo9': 'Entwurfsverfassende: Name, Vorname, Büro',
      '0:Memo11': 'Entwurfsverfassende: Straße, Hausnummer',
      '0:Memo12': 'Entwurfsverfassende: PLZ, Ort',
      '0:Memo13': 'Entwurfsverfassende: Telefon',
      '0:Memo14': 'Entwurfsverfassende: Telefax',
      '0:Memo15': 'Entwurfsverfassende: E-Mail',
      '0:Memo16': 'Fachplanende: Name, Vorname, Büro',
      '0:Memo17': 'Fachplanende: Straße, Hausnummer',
      '0:Memo18': 'Fachplanende: PLZ, Ort',
      '0:Memo19': 'Fachplanende: Telefon',
      '0:Memo20': 'Fachplanende: Telefax',
      '0:Memo21': 'Fachplanende: E-Mail',
      '0:Memo22': 'Baugrundstück: Ort, Straße, Hausnummer, Ortsteil',
      '0:Memo23': 'Baugrundstück: Gemarkung(en)',
      '0:Memo24': 'Baugrundstück: Flur(e)',
      '0:Memo25': 'Baugrundstück: Flurstück(e)',
      '0:Memo26': 'Baugrundstück: Größe in m²',
      '0:Memo27': 'Bezeichnung des Vorhabens',
    },
    zaehlt: optional ? zaehltNicht(...s0('Memo16', 'Memo17', 'Memo18')) : {},
    gruppen: [
      gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Telefax oder E-Mail', 'eins', s0('Memo6', 'Memo7', 'Memo8')),
      gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Telefax oder E-Mail', 'eins', s0('Memo13', 'Memo14', 'Memo15')),
      gruppeV('fachplanende-erreichbar', 'Fachplanende: Telefon, Telefax oder E-Mail', optional ? 'nie' : 'eins', s0('Memo19', 'Memo20', 'Memo21')),
    ],
  };
}

/** III. Unterschrift: Ort und Datum (Rundstempel und Unterschrift sind keine Felder) */
export const unterschrift = (titel = 'III. Unterschrift'): Partial<FormularProfil> => ({
  abschnitte: { '0:Panel9': { titel } },
  feldTitel: { '0:Memo28': 'Ort, Datum' },
});

/** Teil II. als Abschnittstitel */
export const ergebnis = (panel: string, titel: string): Partial<FormularProfil> => ({ abschnitte: { [`0:${panel}`]: { titel } } });

/** „Zur Bescheinigung gehören“ bei den Kontrollen: Bericht(e) Nr. … bis … (bis nur bei mehreren Berichten) */
export const kontrollberichte: Partial<FormularProfil> = {
  abschnitte: { '0:-': { titel: 'Zur Bescheinigung gehören' } },
  feldTitel: {
    '0:Memo29': 'Bericht(e) über die stichprobenhafte(n) Kontrolle(n): Nr.',
    '0:Memo30': 'Bericht(e) über die stichprobenhafte(n) Kontrolle(n): bis Nr. (bei mehreren)',
  },
  zaehlt: zaehltNicht('0:Memo30'),
};

/**
 * „Zur Bescheinigung gehören“ bei den Prüfungen: Prüfbericht(e) Nr. … vom … , … (das zweite Datum nur bei mehreren
 * Prüfberichten).
 */
export const pruefberichte = (nr: string, vom: string, weiteres: string): Partial<FormularProfil> => ({
  abschnitte: { '0:-': { titel: 'Zur Bescheinigung gehören' } },
  feldTitel: {
    [`0:${nr}`]: 'Prüfbericht(e) Nr.',
    [`0:${vom}`]: 'Prüfbericht(e) vom (Datum)',
    [`0:${weiteres}`]: 'Prüfbericht(e): weiteres Datum (bei mehreren)',
  },
  zaehlt: zaehltNicht(`0:${weiteres}`),
});
