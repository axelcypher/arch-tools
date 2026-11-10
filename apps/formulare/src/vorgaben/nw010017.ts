/**
 * Anlage II/2 zur VV BauPrüfVO – Bericht über die Prüfung der bautechnischen Nachweise (§ 28 Absatz 3 BauPrüfVO),
 * Stand 2026C, drei Blätter. Füllt die Prüfingenieurin oder der Prüfingenieur aus.
 *
 * Nach dem Vordruck:
 * - I.3 Umfang des Prüfauftrages (§ 27 BauPrüfVO): mindestens ein Nachweis.
 * - II.2 „Lage … oder: Gemarkung“: eine Angabe genügt.
 * - IV.1 noch vorzulegende Nachweise: nur, wenn „Die folgenden bautechnischen Nachweise sind noch vorzulegen“
 *   angekreuzt ist. Bemerkungen sind freiwillig.
 * - IV.2 Abweichungen von Technischen Baubestimmungen (§ 88 Absatz 5, § 3 Absatz 2 BauO NRW 2018): nur, wenn es
 *   welche gibt; dann „gerechtfertigt/nicht gerechtfertigt“ und Begründung.
 * - IV.3 Bauprodukte mit CE-Kennzeichnung (§ 19), ohne CE-Kennzeichnung (§ 20) und Bauarten (§ 17 BauO NRW 2018):
 *   nur, wenn es solche gibt; dann die Grundanforderungen bzw. die Art des Nachweises. Eignungsnachweis (§ 18
 *   Absatz 3) und Überwachung (§ 18 Absatz 4): „nicht erforderlich/erforderlich“, die Bezeichnung nur, wenn
 *   erforderlich.
 * - IV.4 Besonderheiten: nur, wenn es welche gibt (freiwillig).
 * - IV.5 Prüfung wird fortgesetzt oder ist abgeschlossen; das abschließende Prüfergebnis nur, wenn abgeschlossen.
 * - V. Unterschriften: Ort, Datum zählt; Namen der beteiligten Mitarbeitenden sind freiwillig.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { lage, pruefauftrag } from './pruefbericht';
import { angekreuzt, fuer, gruppeV, s, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);
const s1 = s(1);
const s2 = s(2);

export const nw010017: FormularProfil = zusammen(pruefauftrag, lage('0:Memo10', '0:Memo11', '0:Memo12'), {
  abschnitte: {
    '0:Panel1': { titel: 'I. Prüfauftrag, II. Angaben zum Bauvorhaben, III. Berechnungsgrundlagen' },
    '1:Panel1': { titel: 'IV. Ergebnis der Prüfung (Nr. 1 bis 3)' },
    '2:Panel1': { titel: 'IV. Ergebnis der Prüfung (Nr. 3 bis 5), V. Unterschriften' },
  },
  feldTitel: {
    '0:CheckBox1': 'Prüfauftrag: Standsicherheitsnachweis',
    '0:CheckBox2': 'Prüfauftrag: Nachweis des Schallschutzes',
    '0:CheckBox3': 'Prüfauftrag: Brandverhalten der Baustoffe und Feuerwiderstandsdauer der tragenden Bauteile',
    '0:Memo6': 'Zur Prüfung vorgelegte Unterlagen / sonstige Unterlagen',
    '0:Memo7': 'Entwurfsverfasserin/Entwurfsverfasser',
    '0:Memo8': 'Aufstellerin/Aufsteller der bautechnischen Nachweise',
    '0:Memo9': 'Bauvorhaben: genaue Bezeichnung',
    '0:Memo13': 'Bauherrin oder Bauherr: Name, Vorname',
    '0:Memo14': 'Bauherrin oder Bauherr: Anschrift',
    '0:Memo15': 'Lastannahmen (kN, kN/m²)',
    '0:Memo16': 'Verwendete Bauprodukte',
    '0:Memo17': 'Tragfähigkeit des Baugrundes',
    '0:CheckBox4': 'Baugrundgutachten liegt vor',
    '0:CheckBox5': 'Baugrundgutachten liegt nicht vor',
    '1:CheckBox1': 'Nachweise sind – mit den eingetragenen Änderungen – richtig und vollständig',
    '1:CheckBox2': 'Beigefügte Bauzeichnungen stimmen mit den geprüften Unterlagen überein',
    '1:CheckBox3': 'Bautechnische Nachweise sind noch vorzulegen',
    '1:Memo1': 'Noch vorzulegende bautechnische Nachweise',
    '1:CheckBox4': 'Nachgeforderte Unterlagen nicht vorgelegt, Prüfung nicht vollständig',
    '1:Memo2': 'Bemerkungen',
    '1:Memo3': 'Abweichungen von Technischen Baubestimmungen / anerkannten Regeln der Technik',
    '1:CheckBox5': 'Abweichung gerechtfertigt',
    '1:CheckBox6': 'Abweichung nicht gerechtfertigt',
    '1:Memo4': 'Abweichung: Begründung',
    '1:Memo5': 'Bauprodukt mit CE-Kennzeichnung (Leistungserklärung nach § 19 BauO NRW 2018)',
    '1:CheckBox7': 'Leistungserklärung: Mechanische Festigkeit und Standsicherheit',
    '1:CheckBox8': 'Leistungserklärung: Brandschutz',
    '1:CheckBox9': 'Leistungserklärung: Hygiene, Gesundheit und Umweltschutz',
    '1:CheckBox10': 'Leistungserklärung: Sicherheit und Barrierefreiheit bei der Nutzung',
    '1:CheckBox11': 'Leistungserklärung: Schallschutz',
    '1:CheckBox12': 'Leistungserklärung: Energieeinsparung und Wärmeschutz',
    '1:Memo6': 'Bauprodukt ohne CE-Kennzeichnung (Verwendbarkeitsnachweis nach § 20 BauO NRW 2018)',
    '1:CheckBox13': 'Verwendbarkeitsnachweis: allgemeine bauaufsichtliche Zulassung',
    '1:CheckBox14': 'Verwendbarkeitsnachweis: allgemeines bauaufsichtliches Prüfzeugnis',
    '1:CheckBox15': 'Verwendbarkeitsnachweis: Zustimmung im Einzelfall',
    '1:Memo7': 'Bauart (Anwendbarkeitsnachweis nach § 17 BauO NRW 2018)',
    '1:CheckBox16': 'Anwendbarkeitsnachweis: allgemeine Bauartgenehmigung',
    '1:CheckBox17': 'Anwendbarkeitsnachweis: vorhabenbezogene Bauartgenehmigung',
    '1:CheckBox18': 'Anwendbarkeitsnachweis: allgemeines bauaufsichtliches Prüfzeugnis für Bauarten',
    '2:CheckBox1': 'Eignungsnachweis (§ 18 Absatz 3 BauO NRW 2018) nicht erforderlich',
    '2:CheckBox2': 'Eignungsnachweis (§ 18 Absatz 3 BauO NRW 2018) erforderlich',
    '2:Memo1': 'Eignungsnachweis: Bezeichnung',
    '2:CheckBox19': 'Überwachung von Tätigkeiten (§ 18 Absatz 4 BauO NRW 2018) nicht erforderlich',
    '2:CheckBox20': 'Überwachung von Tätigkeiten (§ 18 Absatz 4 BauO NRW 2018) erforderlich',
    '2:Memo10': 'Überwachung von Tätigkeiten: Bezeichnung',
    '2:Memo8': 'Besonderheiten bei Erteilung der Baugenehmigung',
    '2:Memo9': 'Besonderheiten bei Bauüberwachung und Bauzustandsbesichtigungen',
    '2:CheckBox21': 'Prüfung wird fortgesetzt',
    '2:CheckBox22': 'Prüfung ist abgeschlossen',
    '2:Memo11': 'Abschließendes Prüfergebnis',
    '2:Memo12': 'Ort, Datum (Prüfingenieurin/Prüfingenieur)',
    '2:Memo13': 'Namen der beteiligten Mitarbeiterinnen und Mitarbeiter',
  },
  zaehlt: zaehltNicht('1:Memo2', '1:Memo3', '1:Memo5', '1:Memo6', '1:Memo7', '2:Memo8', '2:Memo9', '2:Memo13'),
  gruppen: [
    gruppeV('umfang', 'Umfang des Prüfauftrages (mindestens ein Nachweis)', 'eins', s0('CheckBox1', 'CheckBox2', 'CheckBox3')),
    gruppeV('baugrundgutachten', 'Baugrundgutachten liegt vor oder nicht vor', 'eins', s0('CheckBox4', 'CheckBox5')),
    gruppeV('ergebnis', 'Ergebnis der Prüfung', 'eins', s1('CheckBox1', 'CheckBox2', 'CheckBox3', 'CheckBox4')),
    gruppeV('abweichung', 'Abweichung gerechtfertigt oder nicht', 'eins', s1('CheckBox5', 'CheckBox6'), { bedingung: wenn(angekreuzt('1:Memo3')) }),
    gruppeV('leistungserklaerung', 'Leistungserklärung: Grundanforderungen', 'eins', s1('CheckBox7', 'CheckBox8', 'CheckBox9', 'CheckBox10', 'CheckBox11', 'CheckBox12'), {
      bedingung: wenn(angekreuzt('1:Memo5')),
    }),
    gruppeV('verwendbarkeit', 'Art des Verwendbarkeitsnachweises', 'eins', s1('CheckBox13', 'CheckBox14', 'CheckBox15'), { bedingung: wenn(angekreuzt('1:Memo6')) }),
    gruppeV('anwendbarkeit', 'Art des Anwendbarkeitsnachweises', 'eins', s1('CheckBox16', 'CheckBox17', 'CheckBox18'), { bedingung: wenn(angekreuzt('1:Memo7')) }),
    gruppeV('eignungsnachweis', 'Eignungsnachweis erforderlich oder nicht', 'eins', s2('CheckBox1', 'CheckBox2')),
    gruppeV('ueberwachung', 'Überwachung von Tätigkeiten erforderlich oder nicht', 'eins', s2('CheckBox19', 'CheckBox20')),
    gruppeV('abschluss', 'Prüfung wird fortgesetzt oder ist abgeschlossen', 'eins', s2('CheckBox21', 'CheckBox22')),
  ],
  bedingungen: {
    '1:Memo1': wenn(angekreuzt('1:CheckBox3')),
    '1:Memo4': wenn(angekreuzt('1:Memo3')),
    '2:Memo1': wenn(angekreuzt('2:CheckBox2')),
    '2:Memo10': wenn(angekreuzt('2:CheckBox20')),
    ...fuer(s2('Memo11'), wenn(angekreuzt('2:CheckBox22'))),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010017|2026C': nw010017 };
