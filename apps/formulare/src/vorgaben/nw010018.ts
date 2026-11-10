/**
 * Anlage II/3 zur VV BauPrüfVO – Bericht über die Bauüberwachung (§ 83 BauO NRW 2018 i. V. m. § 28 Absatz 4
 * BauPrüfVO), Stand 2026C, zwei Blätter. Füllt die Prüfingenieurin oder der Prüfingenieur aus.
 *
 * Nach dem Vordruck:
 * - I.3 Bauüberwachung im Bereich …: mindestens ein Bereich.
 * - II.2 „Lage … oder: Gemarkung“: eine Angabe genügt. II.4 „Sonstige Unternehmen“ nur, wenn es welche gibt.
 * - III.1 keine Mängel oder folgende Mängel; die Mängel, III.2 (Aufforderung, Beseitigung) und der Vorschlag zur
 *   Mängelbeseitigung nur bei „folgende Mängel“.
 * - IV. Unterschriften: Ort, Datum zählt; Namen der beteiligten Mitarbeitenden sind freiwillig.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { bauvorhaben, ergebnis, lage, pruefauftrag } from './pruefbericht';
import { gruppeV, s, zaehltNicht } from './hilfen';

const s0 = s(0);

export const nw010018: FormularProfil = zusammen(pruefauftrag, bauvorhaben, lage('0:Memo7', '0:Memo8', '0:Memo9'), ergebnis('0:CheckBox4', '0:CheckBox5', '0:Memo14'), {
  abschnitte: {
    '0:Panel1': { titel: 'I. Prüfauftrag, II. Angaben zum Bauvorhaben, III. Ergebnis der Bauüberwachung' },
  },
  feldTitel: {
    '0:CheckBox1': 'Bauüberwachung im Bereich Standsicherheit',
    '0:CheckBox2': 'Bauüberwachung im Bereich Schallschutz',
    '0:CheckBox3': 'Bauüberwachung im Bereich Brandverhalten der Baustoffe und Feuerwiderstandsdauer der tragenden Bauteile',
    '0:CheckBox6': 'Bauüberwachung im Bereich Übereinstimmung mit den Brandschutzvorschriften',
    '0:Memo12': 'Ausführende Unternehmen für die Rohbauarbeiten',
    '0:Memo13': 'Sonstige Unternehmen',
  },
  zaehlt: zaehltNicht('0:Memo13'),
  gruppen: [gruppeV('umfang', 'Umfang des Prüfauftrages (mindestens ein Bereich)', 'eins', s0('CheckBox1', 'CheckBox2', 'CheckBox3', 'CheckBox6'))],
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010018|2026C': nw010018 };
