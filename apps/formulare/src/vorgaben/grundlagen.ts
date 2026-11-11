/**
 * Wiederkehrende Bedingungen der Vorgaben mit Begründung und Rechtsgrundlage (Texte in recht/). Erscheinen am Feld,
 * wenn es deshalb entfällt; ein Klick öffnet den Paragrafen.
 */

import { begruendet, ist, istNicht, oder, q, wenn } from './hilfen';

/**
 * Planungsrecht (R-25): „Bebauungsplan“ ist der qualifizierte oder vorhabenbezogene (§ 30 Abs. 1, 2 BauGB). Im
 * einfachen Bebauungsplan (§ 30 Abs. 3 BauGB) richtet sich die Zulässigkeit im Übrigen nach § 34 oder § 35 – er
 * zählt für die Bauvorlagen sowohl als Bebauungsplan (Maß der baulichen Nutzung) als auch als Vorhaben nach den
 * §§ 34, 35 (Auszug aus dem Liegenschaftskataster).
 */
export const PLANUNGSRECHT_BEBAUUNGSPLAN = ist('Planungsrecht', 'Bebauungsplan', 'einfacher Bebauungsplan', 'Satzung nach BauGB');
/** Vorhaben nach den §§ 34 und 35 BauGB (auch im einfachen Bebauungsplan) */
export const PLANUNGSRECHT_34_35 = ist('Planungsrecht', 'Innenbereich', 'Außenbereich', 'einfacher Bebauungsplan');

/** Berechnung des Maßes der baulichen Nutzung: nur im Geltungsbereich eines Bebauungsplans */
export const nurBebauungsplan = begruendet(
  wenn(PLANUNGSRECHT_BEBAUUNGSPLAN),
  'Die Berechnung des Maßes der baulichen Nutzung gehört nur zu Vorhaben im Geltungsbereich eines Bebauungsplans (auch eines einfachen) oder einer anderen Satzung nach dem BauGB.',
  q('baupruefvo', '3', 2),
  q('baugb', '30'),
);

const INNEN_AUSSEN_GRUND =
  'nur bei Vorhaben nach den §§ 34 und 35 BauGB beizufügen (Innen- oder Außenbereich) oder einfacher Bebauungsplan (§ 30 Abs. 3 BauGB). „Bebauungsplan“ heißt hier qualifizierter oder vorhabenbezogener Bebauungsplan (§ 30 Abs. 1, 2 BauGB).';

/** Auszug aus dem Liegenschaftskataster (Flurkarte): nur bei Vorhaben nach §§ 34, 35 BauGB */
export const nurInnenAussen = begruendet(
  wenn(PLANUNGSRECHT_34_35),
  `Der Auszug aus dem Liegenschaftskataster ist ${INNEN_AUSSEN_GRUND}`,
  q('baupruefvo', '10', 1, undefined, 1),
  q('baupruefvo', '2'),
  q('baugb', '30'),
  q('baugb', '34'),
  q('baugb', '35'),
);

/** Nr. 3 Auszug aus der Flurkarte: wie oben; entfällt bei einem amtlichen Lageplan (R-07) */
export const nurInnenAussenFlurkarte = begruendet(
  wenn(PLANUNGSRECHT_34_35),
  `Der Auszug aus der Flurkarte ist ${INNEN_AUSSEN_GRUND} Er entfällt, wenn ein amtlicher Lageplan vorgelegt wird.`,
  q('baupruefvo', '10', 1, undefined, 1),
  q('baupruefvo', '2', 2, 3),
  q('baugb', '30'),
  q('baugb', '34'),
  q('baugb', '35'),
);

/** Nr. 4 Auszug aus der amtlichen Basiskarte: nur bei Vorhaben nach §§ 34, 35 BauGB, üblich im Außenbereich (R-07) */
export const nurInnenAussenBasiskarte = begruendet(
  wenn(PLANUNGSRECHT_34_35),
  `Der Auszug aus der amtlichen Basiskarte ist ${INNEN_AUSSEN_GRUND} Nach Anforderung der Bauaufsichtsbehörde, üblich im Außenbereich.`,
  q('baupruefvo', '10', 1, undefined, 1),
  q('baupruefvo', '2', 3),
  q('baugb', '30'),
  q('baugb', '34'),
  q('baugb', '35'),
);

/** Baubeschreibung: beim Einfamilienhaus nicht (Vorgabe des Büros, gestützt auf § 5 Absatz 1 BauPrüfVO) */
export const keinEinfamilienhaus = begruendet(
  wenn(istNicht('Gebäudeart', 'Einfamilienhaus')),
  'Beim Einfamilienhaus nicht nötig (Vorgabe des Büros): Eine Baubeschreibung braucht es nur, soweit die Angaben nicht schon in Lageplan und Bauzeichnungen stehen.',
  q('baupruefvo', '5', 1),
  q('baupruefvo', '10', 1, undefined, 4),
);

/** Betriebsbeschreibung: nur für gewerbliche oder landwirtschaftliche Betriebe */
export const nurBetrieb = begruendet(
  wenn(ist('Gebäudeart', 'Nichtwohngebäude')),
  'Eine Betriebsbeschreibung brauchen nur gewerbliche oder landwirtschaftliche Betriebe (Nichtwohngebäude).',
  q('baupruefvo', '5', 2),
  q('baupruefvo', '5', 3),
);

/** Barrierefreiheit: Wohnungen ab Gebäudeklasse 3, öffentlich zugängliche Anlagen */
export const barrierefrei = begruendet(
  oder(ist('Gebäudeklasse', '3', '4', '5'), ist('Gebäudeart', 'Nichtwohngebäude')),
  'Barrierefrei sein müssen die Wohnungen in Gebäuden der Gebäudeklassen 3 bis 5 und öffentlich zugängliche bauliche Anlagen.',
  q('bauo-nrw', '49', 1),
  q('bauo-nrw', '49', 2),
);

/** Bescheinigung einer Prüfsachverständigen Person zum Brandschutz statt Erklärung der Entwurfsverfassenden */
export const brandschutzBescheinigung = (b: Parameters<typeof begruendet>[0]) =>
  begruendet(
    b,
    'Die Bescheinigung einer Prüfsachverständigen Person für Brandschutz gilt für Gebäude der Gebäudeklassen 4 und 5, die keine Sonderbauten sind, und für Mittelgaragen; bei Gebäudeklasse 1 bis 3 genügt die Erklärung der Entwurfsverfassenden.',
    q('bauo-nrw', '68', 2, 3),
    q('bauo-nrw', '68', 2, 2),
  );
