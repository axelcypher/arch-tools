/**
 * Prüfregeln der Vorgaben (U-04, U-05, R-03): was die App über den Füllstand hinaus meldet – nie blockierend, als
 * Hinweis formuliert – und welche Kästchen sie aus Antragsmerkmalen vorbelegt.
 *
 * - `merkmalFelder`: Antragsmerkmal → Wert → Kästchen im Formular. Leere Kästchen werden aus dem Merkmal vorbelegt
 *   (nie überschrieben, gekennzeichnet); weicht das Formular vom Merkmal ab, erscheint ein Hinweis; beim Ankreuzen
 *   bietet die App an, den Wert als Merkmal zu übernehmen. Verfahren und Antragsart werden bewusst nicht verknüpft
 *   (Verfahren ist nicht Antragsart; „Vorhaben“ ist im Vordruck Freitext).
 * - `mehrfach`: Gruppe (id) → Hinweis, wenn mehr als eine Angabe gemacht ist (z. B. mehrere Gebäudeklassen – bei
 *   Wohnhaus mit Garage oder Doppelhaus zulässig, deshalb nur eine Frage).
 * - `hinweise`: Hinweise, wenn die Bedingung sicher zutrifft (ohne Bedingung: immer – etwa zu einem Vordruck, dessen
 *   Rechtsgrundlage sich geändert hat).
 */

import type { Bedingung, Quelle } from '../bedingung';
import { ist, q, wenn } from './hilfen';

export interface Pruefregeln {
  merkmalFelder?: Record<string, Record<string, string>>;
  mehrfach?: Record<string, string>;
  hinweise?: { bedingung?: Bedingung; text: string; quellen?: Quelle[] }[];
}

const MEHRERE_GEBAEUDEKLASSEN = 'Mehrere Gebäudeklassen angekreuzt – umfasst der Antrag mehrere Gebäude?';

/**
 * „Sonstige bauliche Anlage“ (ein Kästchen in der Zeile der Gebäudeklassen): aus „Gebäudeart: kein Gebäude“ vorbelegt –
 * daran hängen Kosten, Art des Gebäudes, Brandschutz und Baustatistik der Bauanträge
 */
const KEIN_GEBAEUDE = { 'kein Gebäude': '0:CheckBox22' };

/** Bauanträge (Blatt 1, gemeinsame Komponentennamen): Gebäudeklasse 1 bis 5 */
const antrag: Pruefregeln = {
  merkmalFelder: { Gebäudeklasse: { '1': '0:CheckBox4', '2': '0:CheckBox5', '3': '0:CheckBox6', '4': '0:CheckBox7', '5': '0:CheckBox8' }, Gebäudeart: KEIN_GEBAEUDE },
  mehrfach: { 'v:gebaeudeklasse': MEHRERE_GEBAEUDEKLASSEN },
};

export const PRUEFREGELN: Record<string, Pruefregeln> = {
  'nw010001|2026I': antrag,
  'nw010002|2026I': antrag,
  'nw010002|2024D': antrag,
  'nw010005|2026I': {
    merkmalFelder: { Gebäudeklasse: { '1': '0:CheckBox8', '2': '0:CheckBox9', '3': '0:CheckBox10', '4': '0:CheckBox11', '5': '0:CheckBox12' }, Gebäudeart: KEIN_GEBAEUDE },
    mehrfach: { 'v:gebaeudeklasse': MEHRERE_GEBAEUDEKLASSEN },
    hinweise: [
      {
        bedingung: wenn(ist('Sonderbau', 'ja')),
        text: 'Antragsmerkmal Sonderbau: ja – Sonderbauten (außer Solaranlagen) sind von der Genehmigungsfreistellung ausgeschlossen (§ 63 Abs. 1 Satz 2 BauO NRW 2018).',
        quellen: [q('bauo-nrw', '63', 1, 2)],
      },
    ],
  },
  // referenzielles Baugenehmigungsverfahren: durch Gesetz vom 31.10.2023 (GV. NRW. S. 1172) aufgehoben
  'nw010003|2022B': {
    hinweise: [
      {
        text: 'Das referenzielle Baugenehmigungsverfahren (§ 66 Abs. 5 und 6 BauO NRW 2018 a. F.) ist seit 01.01.2024 aufgehoben – diesen Vordruck nicht mehr verwenden.',
      },
    ],
  },
  // Nutzungsänderungsanzeige: seit 01.09.2026 bei der Bauaufsichtsbehörde (der Vordruck 2026C nennt noch die Gemeinde)
  'nw010004|2026C': {
    hinweise: [
      {
        text: 'Die Nutzungsänderungsanzeige ist seit 01.09.2026 bei der Bauaufsichtsbehörde einzureichen; sie legt sie der Gemeinde vor. Der Vordruck nennt noch die Gemeinde – maßgeblich ist das geltende Gesetz.',
        quellen: [q('bauo-nrw', '64', 3, 1), q('bauo-nrw', '64', 3, 2)],
      },
    ],
  },
};
