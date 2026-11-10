/**
 * Anlage II/4 zur VV BauPrüfVO – Bericht über die Bauzustandsbesichtigung (§ 84 BauO NRW 2018 i. V. m. § 28
 * Absatz 4 BauPrüfVO), Stand 2026C, zwei Blätter. Füllt die Prüfingenieurin oder der Prüfingenieur aus.
 *
 * Nach dem Vordruck:
 * - I.3 Bauzustandsbesichtigung bei Fertigstellung des Rohbaus oder abschließender Fertigstellung; im Bereich …:
 *   mindestens ein Bereich.
 * - II.2 „Lage … oder: Gemarkung“: eine Angabe genügt. II.4 Anzeige der Bauherrschaft vom … über die Fertigstellung
 *   des Rohbaus oder die abschließende Fertigstellung (§ 84 BauO NRW 2018).
 * - III.1 keine Mängel oder folgende Mängel; die Mängel, III.2 (Aufforderung, Beseitigung) und der Vorschlag zur
 *   Mängelbeseitigung nur bei „folgende Mängel“.
 * - IV. Unterschriften: Ort, Datum zählt; Namen der beteiligten Mitarbeitenden sind freiwillig.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { bauvorhaben, ergebnis, lage, pruefauftrag } from './pruefbericht';
import { gruppeV, s } from './hilfen';

const s0 = s(0);

export const nw010019: FormularProfil = zusammen(pruefauftrag, bauvorhaben, lage('0:Memo7', '0:Memo8', '0:Memo9'), ergebnis('0:CheckBox8', '0:CheckBox9', '0:Memo13'), {
  abschnitte: {
    '0:Panel1': { titel: 'I. Prüfauftrag, II. Angaben zum Bauvorhaben, III. Ergebnis der Bauzustandsbesichtigung' },
  },
  feldTitel: {
    '0:CheckBox1': 'Bauzustandsbesichtigung bei Fertigstellung des Rohbaus',
    '0:CheckBox2': 'Bauzustandsbesichtigung bei abschließender Fertigstellung des Bauvorhabens',
    '0:CheckBox3': 'Bauzustandsbesichtigung im Bereich Standsicherheit',
    '0:CheckBox4': 'Bauzustandsbesichtigung im Bereich Schallschutz',
    '0:CheckBox5': 'Bauzustandsbesichtigung im Bereich Brandverhalten der Baustoffe und Feuerwiderstandsdauer der tragenden Bauteile',
    '0:CheckBox10': 'Bauzustandsbesichtigung im Bereich Übereinstimmung mit den Brandschutzvorschriften',
    '0:Memo12': 'Anzeige der Bauherrschaft vom (Datum)',
    '0:CheckBox6': 'Anzeige über die Fertigstellung des Rohbaus',
    '0:CheckBox7': 'Anzeige über die abschließende Fertigstellung des Bauvorhabens',
  },
  gruppen: [
    gruppeV('zeitpunkt', 'Bauzustandsbesichtigung bei Fertigstellung des Rohbaus oder abschließender Fertigstellung', 'eins', s0('CheckBox1', 'CheckBox2')),
    gruppeV('umfang', 'Umfang des Prüfauftrages (mindestens ein Bereich)', 'eins', s0('CheckBox3', 'CheckBox4', 'CheckBox5', 'CheckBox10')),
    gruppeV('anzeige', 'Anzeige über die Fertigstellung des Rohbaus oder die abschließende Fertigstellung', 'eins', s0('CheckBox6', 'CheckBox7')),
  ],
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010019|2026C': nw010019 };
