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
 * - `hinweise`: Hinweise, wenn die Bedingung sicher zutrifft.
 */

import type { Bedingung, Quelle } from '../bedingung';
import { ist, q, wenn } from './hilfen';

export interface Pruefregeln {
  merkmalFelder?: Record<string, Record<string, string>>;
  mehrfach?: Record<string, string>;
  hinweise?: { bedingung: Bedingung; text: string; quellen?: Quelle[] }[];
}

const MEHRERE_GEBAEUDEKLASSEN = 'Mehrere Gebäudeklassen angekreuzt – umfasst der Antrag mehrere Gebäude?';

/** Bauanträge (Blatt 1, gemeinsame Komponentennamen): Gebäudeklasse 1 bis 5 */
const antrag: Pruefregeln = {
  merkmalFelder: { Gebäudeklasse: { '1': '0:CheckBox4', '2': '0:CheckBox5', '3': '0:CheckBox6', '4': '0:CheckBox7', '5': '0:CheckBox8' } },
  mehrfach: { 'v:gebaeudeklasse': MEHRERE_GEBAEUDEKLASSEN },
};

export const PRUEFREGELN: Record<string, Pruefregeln> = {
  'nw010001|2026I': antrag,
  'nw010002|2026I': antrag,
  'nw010002|2024D': antrag,
  'nw010005|2026I': {
    merkmalFelder: { Gebäudeklasse: { '1': '0:CheckBox8', '2': '0:CheckBox9', '3': '0:CheckBox10', '4': '0:CheckBox11', '5': '0:CheckBox12' } },
    mehrfach: { 'v:gebaeudeklasse': MEHRERE_GEBAEUDEKLASSEN },
    hinweise: [
      {
        bedingung: wenn(ist('Sonderbau', 'ja')),
        text: 'Antragsmerkmal Sonderbau: ja – Sonderbauten (außer Solaranlagen) sind von der Genehmigungsfreistellung ausgeschlossen (§ 63 Abs. 1 Satz 2 BauO NRW 2018).',
        quellen: [q('bauo-nrw', '63', 1, 2)],
      },
    ],
  },
};
