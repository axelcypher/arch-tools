/**
 * Gemeinsame Teile der älteren FORMA-Vordrucke (Fassung 2018: Anzeigen nw0300xx, Anlagen und Vollmachten nw0200xx):
 * Bauherrschaft, Entwurfsverfassende und Baugrundstück sehen überall gleich aus, nur die Komponentennamen
 * unterscheiden sich. Alle Felder liegen auf Blatt 1 (Seite 0).
 *
 * - Telefon, Telefax, E-Mail: eine Angabe genügt.
 * - „Bevollmächtigt“ / „vertreten durch“: nur, wenn jemand die Bauherrschaft vertritt – zählt nicht.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { begruendet, gruppeV, ist, oder, q, s, zaehltNicht } from './hilfen';

const s0 = s(0);

/** Komponentennamen in der Reihenfolge des Vordrucks: Name, Straße, PLZ/Ort, Telefon, Telefax, E-Mail */
export type Person = [name: string, strasse: string, ort: string, telefon: string, telefax: string, email: string];

/** Bauherrschaft; `vertreten` = Feld „Bevollmächtigt“ bzw. „vertreten durch“ (falls im Vordruck) */
export function bauherrschaft([name, strasse, ort, telefon, telefax, email]: Person, vertreten?: { feld: string; titel: string }): Partial<FormularProfil> {
  return {
    feldTitel: {
      [`0:${name}`]: 'Bauherrschaft: Name, Vorname, Firma',
      [`0:${strasse}`]: 'Bauherrschaft: Straße, Hausnummer',
      [`0:${ort}`]: 'Bauherrschaft: PLZ, Ort',
      [`0:${telefon}`]: 'Bauherrschaft: Telefon',
      [`0:${telefax}`]: 'Bauherrschaft: Telefax',
      [`0:${email}`]: 'Bauherrschaft: E-Mail',
      ...(vertreten ? { [`0:${vertreten.feld}`]: vertreten.titel } : {}),
    },
    zaehlt: vertreten ? zaehltNicht(`0:${vertreten.feld}`) : {},
    gruppen: [gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Telefax oder E-Mail', 'eins', s0(telefon, telefax, email))],
  };
}

/** Entwurfsverfassende */
export function entwurf([name, strasse, ort, telefon, telefax, email]: Person): Partial<FormularProfil> {
  return {
    feldTitel: {
      [`0:${name}`]: 'Entwurfsverfassende: Name, Vorname, Büro',
      [`0:${strasse}`]: 'Entwurfsverfassende: Straße, Hausnummer',
      [`0:${ort}`]: 'Entwurfsverfassende: PLZ, Ort',
      [`0:${telefon}`]: 'Entwurfsverfassende: Telefon',
      [`0:${telefax}`]: 'Entwurfsverfassende: Telefax',
      [`0:${email}`]: 'Entwurfsverfassende: E-Mail',
    },
    gruppen: [gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Telefax oder E-Mail', 'eins', s0(telefon, telefax, email))],
  };
}

/** Baugrundstück: Lage, Gemarkung, Flur, Flurstück, Größe */
export function grundstueck([lage, gemarkung, flur, flurstueck, groesse]: [string, string, string, string, string]): Partial<FormularProfil> {
  return {
    feldTitel: {
      [`0:${lage}`]: 'Baugrundstück: Ort, Straße, Hausnummer, Ortsteil',
      [`0:${gemarkung}`]: 'Baugrundstück: Gemarkung(en)',
      [`0:${flur}`]: 'Baugrundstück: Flur(e)',
      [`0:${flurstueck}`]: 'Baugrundstück: Flurstück(e)',
      [`0:${groesse}`]: 'Baugrundstück: Größe in m²',
    },
  };
}

/** Bauleitende der Anzeigen nw030001 bis nw030003 (Memo25 bis Memo28) */
export const bauleitende: Partial<FormularProfil> = {
  feldTitel: {
    '0:Memo25': 'Bauleitende: Name, Vorname',
    '0:Memo26': 'Bauleitende: Straße, Hausnummer',
    '0:Memo27': 'Bauleitende: PLZ, Ort',
    '0:Memo28': 'Bauleitende: Telefon',
  },
};

/**
 * Kopf der Anzeigen nw030001 bis nw030004: Bauaufsichtsbehörde, Aktenzeichen, Bauherrschaft, Entwurfsverfassende.
 * Das Aktenzeichen ist bei der Anzeige bekannt (Baugenehmigung bzw. Genehmigungsfreistellung) – die Bauherrschaft
 * trägt es ein; es zählt (nw030004 schränkt es ein).
 */
export const anzeigeKopf: FormularProfil = zusammen(
  {
    abschnitte: { '0:Panel1': { titel: 'Bauaufsichtsbehörde' } },
    feldTitel: {
      '0:Memo1': 'Bauaufsichtsbehörde (Anschrift)',
      '0:Memo2': 'Bauaufsichtsbehörde: PLZ, Ort',
      '0:Memo10': 'Aktenzeichen der Bauaufsichtsbehörde',
    },
  },
  bauherrschaft(['Memo3', 'Memo4', 'Memo5', 'Memo7', 'Memo8', 'Memo9'], { feld: 'Memo6', titel: 'Bauherrschaft: bevollmächtigte Person' }),
  entwurf(['Memo11', 'Memo12', 'Memo13', 'Memo14', 'Memo15', 'Memo16']),
);

/**
 * Bautechnische Nachweise (§ 68 BauO NRW 2018) bei Baubeginn und abschließender Fertigstellung. „Gebäude nach § 68
 * Absatz 2“ sind hier die Wohngebäude der Gebäudeklassen 1 und 2 (Absatz 2 Nr. 1) – die übrigen Fälle des Absatzes
 * (kleine Nichtwohngebäude u. a.) lassen sich mit den Merkmalen nicht erkennen und bleiben erforderlich.
 */
export const nachweise = {
  /** kein Gebäude nach § 68 Absatz 2: Gebäudeklasse 3 bis 5 oder Nichtwohngebäude */
  nichtAbsatz2Gebaeude: begruendet(
    oder(ist('Gebäudeklasse', '3', '4', '5'), ist('Gebäudeart', 'Nichtwohngebäude')),
    'Laut Vordruck nicht erforderlich bei Gebäuden nach § 68 Absatz 2 (hier: Wohngebäude der Gebäudeklassen 1 und 2).',
    q('bauo-nrw', '68'),
  ),
  /** wie oben, dazu bauliche Anlagen, die keine Gebäude sind (Standsicherheit) */
  nichtAbsatz2: begruendet(
    oder(ist('Gebäudeklasse', '3', '4', '5'), ist('Gebäudeart', 'Nichtwohngebäude', 'kein Gebäude')),
    'Laut Vordruck nicht erforderlich bei Gebäuden nach § 68 Absatz 2 (hier: Wohngebäude der Gebäudeklassen 1 und 2).',
    q('bauo-nrw', '68', 3),
  ),
  /** Brandschutz: geprüft oder bescheinigt nur bei Gebäudeklasse 4 und 5 sowie Sonderbauten */
  brandschutz: begruendet(
    oder(ist('Gebäudeklasse', '4', '5'), ist('Sonderbau', 'ja')),
    'Laut Vordruck nicht erforderlich bei Gebäuden der Gebäudeklassen 1 bis 3 – dort genügt die Erklärung der Entwurfsverfassenden.',
    q('bauo-nrw', '68', 2),
  ),
};
