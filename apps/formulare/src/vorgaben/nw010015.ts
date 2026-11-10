/**
 * Anlage II/1.1 zur VV BauPrüfVO – Verzeichnis der von den Bauaufsichtsbehörden erteilten Prüfaufträge als
 * Prüfingenieurin oder Prüfingenieur für Baustatik (Stand 2022A), ein Blatt.
 *
 * Tabelle mit 18 gleichartigen Zeilen (eine je Prüfauftrag): Zeilen zählen nicht, nur das Jahr im Kopf (einen
 * Namen sieht der Vordruck nicht vor). Die Summe „Insgesamt“ der Rohbausumme zählt ebenfalls nicht.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { n, tabelle } from './verzeichnis';
import { zaehltNicht } from './hilfen';

export const nw010015: FormularProfil = zusammen(
  {
    abschnitte: {
      '0:-': { titel: 'Verzeichnis der erteilten Prüfaufträge (eine Zeile je Prüfauftrag)' },
    },
    feldTitel: {
      '0:Memo001': 'Verzeichnis für das Jahr',
      '0:Memo171': 'Insgesamt: Rohbausumme / Herstellungskosten (€)',
    },
    zaehlt: zaehltNicht('0:Memo171'),
  },
  tabelle(0, 18, [
    ['Prüf-Nr.', n('Memo', 1, 9)],
    ['Lage des Bauvorhabens (Ort, Straße)', n('Memo', 2, 9)],
    ['Bauherrin oder Bauherr (Name, Wohnort)', n('Memo', 3, 9)],
    ['Bauwerksklasse', n('Memo', 4, 9)],
    ['Art der Nutzung', n('Memo', 5, 9)],
    ['Bauaufsichtsbehörde/Land', n('Memo', 6, 9)],
    ['Datum des Prüfauftrages', n('Memo', 7, 9)],
    ['Abschluss der statischen Prüfung (Datum)', n('Memo', 8, 9)],
    ['Rohbausumme / Herstellungskosten (€)', n('Memo', 9, 9)],
    ['Prüfauftrag Standsicherheitsnachweis', n('CheckBox', 1, 5)],
    ['Prüfauftrag Schallschutz', n('CheckBox', 2, 5)],
    ['Prüfauftrag Brandverhalten von Baustoffen', n('CheckBox', 3, 5)],
    ['Prüfauftrag Feuerwiderstandsfähigkeit tragender Bauteile', n('CheckBox', 4, 5)],
    ['Prüfauftrag Bauüberwachung', n('CheckBox', 5, 5)],
    ['Prüfauftrag Bauzustandsbesichtigung', n('CheckBox', 91, 1)],
  ]),
);

export const vorgaben: Record<string, FormularProfil> = { 'nw010015|2022A': nw010015 };
