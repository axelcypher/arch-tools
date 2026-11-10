/**
 * Anlage I/5 zur VV BauPrüfVO – Antrag auf Genehmigung der Grundstücksteilung (§ 7 BauO NRW 2018) bzw. auf ein
 * Negativzeugnis, Stand 2026. Antragstellende sind die Eigentümer bzw. Berechtigten.
 *
 * Nach dem Vordruck:
 * - Antrag auf Genehmigung oder auf Negativzeugnis: eine Auswahl.
 * - Spalte „Öffentlich bestellte/r Vermessungsingenieur/in / Katasteramt“: „Die Angaben in dieser Spalte sind nicht
 *   zwingend erforderlich“ – zählt nicht (auch Ort, Datum dieser Seite).
 * - „Das Grundstück ist bebaut“ / „Die Bebauung ist genehmigt“: Ankreuzen nur, wenn zutreffend – zählen nicht.
 * - Baulasten: nicht eingetragen oder eingetragen; wenn eingetragen, zugunsten und/oder zu Lasten des Grundstücks,
 *   jeweils mit Nummer und Art.
 * - Bauzeichnungen „sofern für die Beurteilung erforderlich (… nur bei Antrag auf Grundstücksteilung)“ – zählen nicht.
 * Eingangsstempel/Aktenzeichen füllt die Behörde aus; Unterschriften sind freiwillig.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { angekreuzt, gruppeV, s, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);

export const nw010007_2026C: FormularProfil = zusammen({
  abschnitte: {
    '0:Panel1': { titel: 'Genehmigungsstelle für den Bodenverkehr / untere Bauaufsichtsbehörde' },
    '0:Panel2': { titel: 'Eingangsstempel (füllt die Behörde aus)' },
    '0:Panel3': { titel: 'Antrag auf Teilungsgenehmigung oder Negativzeugnis' },
    '0:Panel7': { titel: 'Öffentlich bestellte/r Vermessungsingenieur/in / Katasteramt (nicht zwingend)' },
    '0:Panel9': { titel: 'Baulasten' },
    '0:Panel11': { titel: 'Ort, Datum (Antragstellende)' },
    '0:Panel12': { titel: 'Ort, Datum (Vermessungsingenieur/in, Katasteramt – nicht zwingend)' },
  },
  feldTitel: {
    '0:Memo1': 'Genehmigungsstelle / untere Bauaufsichtsbehörde (Anschrift)',
    '0:Memo2': 'Genehmigungsstelle: PLZ, Ort',
    '0:Memo3': 'Aktenzeichen der Behörde',
    '0:CheckBox1': 'Genehmigung der Teilung eines bebauten Grundstücks (§ 7 BauO NRW 2018)',
    '0:CheckBox2': 'Zeugnis, dass eine Teilungsgenehmigung nicht erforderlich ist (Negativzeugnis)',
    '0:Memo5': 'Antragstellende: Name, Vorname, Firma',
    '0:Memo6': 'Antragstellende: Straße, Hausnummer',
    '0:Memo7': 'Antragstellende: PLZ, Ort',
    '0:Memo8': 'Antragstellende: Telefon',
    '0:Memo9': 'Antragstellende: Telefax',
    '0:Memo10': 'Antragstellende: E-Mail',
    '0:Memo11': 'Vermessungsingenieur/in / Katasteramt: Name, Vorname, Büro',
    '0:Memo12': 'Vermessungsingenieur/in / Katasteramt: Straße, Hausnummer',
    '0:Memo13': 'Vermessungsingenieur/in / Katasteramt: PLZ, Ort',
    '0:Memo14': 'Vermessungsingenieur/in / Katasteramt: Telefon',
    '0:Memo15': 'Vermessungsingenieur/in / Katasteramt: Telefax',
    '0:Memo16': 'Vermessungsingenieur/in / Katasteramt: E-Mail',
    '0:CheckBox3': 'Das Grundstück ist bebaut',
    '0:CheckBox10': 'Die Bebauung ist genehmigt',
    '0:Memo20': 'Grundstück: Ort, Straße, Hausnummer, Ortsteil',
    '0:Memo21': 'Grundstück: Gemarkung',
    '0:Memo22': 'Grundstück: Flur',
    '0:Memo23': 'Grundstück: Flurstück(e)',
    '0:CheckBox4': 'Baulasten nicht eingetragen',
    '0:CheckBox5': 'Baulasten eingetragen',
    '0:CheckBox6': 'Baulast zugunsten des Grundstücks',
    '0:Memo4': 'Baulast zugunsten des Grundstücks: Nummer, Art',
    '0:CheckBox7': 'Baulast zu Lasten des Grundstücks',
    '0:Memo17': 'Baulast zu Lasten des Grundstücks: Nummer, Art',
    '0:CheckBox8': 'Amtlicher Lageplan (Vermessungsingenieur/in oder Katasteramt, 2-fach)',
    '0:CheckBox9': 'Bauzeichnungen, sofern erforderlich (nur bei Teilungsgenehmigung, 2-fach)',
    '0:Memo18': 'Ort, Datum (Antragstellende)',
    '0:Memo19': 'Antragstellende (Unterschrift)',
    '0:Memo24': 'Ort, Datum (Vermessungsingenieur/in, Katasteramt)',
    '0:Memo25': 'Vermessungsingenieur/in, Katasteramt (Unterschrift)',
  },
  zaehlt: zaehltNicht('0:Memo3', ...s0('Memo11', 'Memo12', 'Memo13', 'Memo14', 'Memo15', 'Memo16', 'Memo24', 'Memo25'), '0:CheckBox3', '0:CheckBox10', '0:CheckBox9', '0:Memo19'),
  gruppen: [
    gruppeV('antrag', 'Teilungsgenehmigung oder Negativzeugnis', 'eins', s0('CheckBox1', 'CheckBox2')),
    gruppeV('antragsteller-erreichbar', 'Antragstellende: Telefon, Telefax oder E-Mail', 'eins', s0('Memo8', 'Memo9', 'Memo10')),
    gruppeV('baulasten', 'Baulasten: nicht eingetragen oder eingetragen', 'eins', s0('CheckBox4', 'CheckBox5')),
    gruppeV('baulast-art', 'Baulast zugunsten oder zu Lasten des Grundstücks', 'eins', s0('CheckBox6', 'CheckBox7'), { bedingung: wenn(angekreuzt('0:CheckBox5')) }),
  ],
  bedingungen: {
    '0:Memo4': wenn(angekreuzt('0:CheckBox6')),
    '0:Memo17': wenn(angekreuzt('0:CheckBox7')),
  },
});

export const vorgaben: Record<string, FormularProfil> = { 'nw010007|2026C': nw010007_2026C };
