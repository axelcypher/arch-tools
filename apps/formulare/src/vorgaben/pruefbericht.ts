/**
 * Gemeinsame Teile der Berichte der Prüfingenieurinnen und Prüfingenieure nach Anlage II zur VV BauPrüfVO
 * (II/2 Prüfung der bautechnischen Nachweise, II/3 Bauüberwachung, II/4 Bauzustandsbesichtigung): Blatt 1 beginnt
 * überall mit „I. Prüfauftrag“ (gleiche Komponentennamen Memo1 bis Memo5), II/3 und II/4 haben dazu dieselben
 * Angaben zum Bauvorhaben und dasselbe Blatt 2 (Mängelbeseitigung, Unterschriften).
 *
 * Die Berichte füllt die Prüfingenieurin oder der Prüfingenieur aus – ihre Angaben zählen. Nicht zählen: Namen und
 * Paraphen der beteiligten Mitarbeitenden (freiwillig).
 */

import type { FormularProfil } from '../profil';
import { angekreuzt, fuer, gruppeV, s, wenn, zaehltNicht } from './hilfen';

const s1 = s(1);

/** I. Prüfauftrag, Nr. 1 und 2 */
export const pruefauftrag: Partial<FormularProfil> = {
  feldTitel: {
    '0:Memo1': 'Prüfingenieurin/Prüfingenieur: Name, Vorname',
    '0:Memo2': 'Prüfingenieurin/Prüfingenieur: Anschrift',
    '0:Memo3': 'Prüfauftrag erteilt von (Bauaufsichtsbehörde)',
    '0:Memo4': 'Datum des Prüfauftrages',
    '0:Memo5': 'Aktenzeichen des Bauantrages',
  },
};

/** Lage (Ort, Straße) oder Gemarkung, Flur und Flurstück: eine Angabe genügt */
export function lage(ort: string, flur: string, flurstueck: string): Partial<FormularProfil> {
  return {
    feldTitel: {
      [ort]: 'Lage: Ort, Straße, Hausnummer',
      [flur]: 'Lage: Gemarkung, Flur',
      [flurstueck]: 'Lage: Flurstück-Nr.',
    },
    gruppen: [gruppeV('lage', 'Lage oder Gemarkung, Flur, Flurstück', 'eins', [ort, flur, flurstueck])],
  };
}

/** II/3 und II/4, Blatt 1: II. Angaben zum Bauvorhaben Nr. 1 bis 3 */
export const bauvorhaben: Partial<FormularProfil> = {
  feldTitel: {
    '0:Memo6': 'Bauvorhaben: genaue Bezeichnung',
    '0:Memo10': 'Bauherrin oder Bauherr: Name, Vorname',
    '0:Memo11': 'Bauherrin oder Bauherr: Anschrift',
  },
};

/**
 * II/3 und II/4: III. Ergebnis – keine Mängel oder folgende Mängel (Blatt 1), und nur bei Mängeln Aufforderung,
 * Beseitigung und Vorschlag zur Mängelbeseitigung (Blatt 2); dazu IV. Unterschriften.
 */
export function ergebnis(keine: string, folgende: string, liste: string): Partial<FormularProfil> {
  const mitMaengeln = wenn(angekreuzt(folgende));
  return {
    abschnitte: { '1:Panel1': { titel: 'III. Ergebnis (Fortsetzung): Mängelbeseitigung; IV. Unterschriften' } },
    feldTitel: {
      [keine]: 'Ergebnis: keine Mängel',
      [folgende]: 'Ergebnis: folgende Mängel',
      [liste]: 'Festgestellte Mängel',
      '1:CheckBox1': 'Bauherrschaft zur Mängelbeseitigung aufgefordert',
      '1:CheckBox2': 'Bauherrschaft zur Mängelbeseitigung nicht aufgefordert',
      '1:CheckBox3': 'Mängel beseitigt',
      '1:CheckBox4': 'Mängel nicht beseitigt',
      '1:Memo1': 'Vorschlag zur Mängelbeseitigung',
      '1:Memo2': 'Ort, Datum (Prüfingenieurin/Prüfingenieur)',
      '1:Memo3': 'Namen der beteiligten Mitarbeiterinnen und Mitarbeiter',
    },
    zaehlt: zaehltNicht('1:Memo3'),
    gruppen: [
      gruppeV('maengel', 'Keine Mängel oder folgende Mängel', 'eins', [keine, folgende]),
      gruppeV('aufgefordert', 'Zur Mängelbeseitigung aufgefordert: ja oder nein', 'eins', s1('CheckBox1', 'CheckBox2'), { bedingung: mitMaengeln }),
      gruppeV('beseitigt', 'Mängel beseitigt: ja oder nein', 'eins', s1('CheckBox3', 'CheckBox4'), { bedingung: mitMaengeln }),
    ],
    bedingungen: fuer([liste, '1:Memo1'], mitMaengeln),
  };
}
