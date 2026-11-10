/**
 * Wiederkehrende Bedingungen der Vorgaben mit Begründung und Rechtsgrundlage (Texte in recht/). Erscheinen am Feld,
 * wenn es deshalb entfällt; ein Klick öffnet den Paragrafen.
 */

import { begruendet, ist, istNicht, oder, q, wenn } from './hilfen';

/** Berechnung des Maßes der baulichen Nutzung: nur im Geltungsbereich eines Bebauungsplans */
export const nurBebauungsplan = begruendet(
  wenn(ist('Planungsrecht', 'Bebauungsplan')),
  'Die Berechnung des Maßes der baulichen Nutzung gehört nur zu Vorhaben im Geltungsbereich eines Bebauungsplans (oder einer anderen Satzung nach dem BauGB).',
  q('baupruefvo', '3', 2),
  q('baugb', '30'),
);

/** Auszug aus dem Liegenschaftskataster (Flurkarte): nur bei Vorhaben nach §§ 34, 35 BauGB */
export const nurInnenAussen = begruendet(
  wenn(ist('Planungsrecht', 'Innenbereich', 'Außenbereich')),
  'Der Auszug aus dem Liegenschaftskataster ist nur bei Vorhaben nach den §§ 34 und 35 BauGB beizufügen (Innen- oder Außenbereich).',
  q('baupruefvo', '10', 1, undefined, 1),
  q('baupruefvo', '2'),
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
