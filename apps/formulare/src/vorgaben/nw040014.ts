/**
 * Verzeichnis der erteilten Bescheinigungen einer/eines staatlich anerkannten Sachverständigen für die Prüfung des
 * Brandschutzes (Stand 2019E), ein Blatt.
 *
 * Tabelle mit zehn gleichartigen Zeilen (eine je Bauvorhaben): Zeilen zählen nicht, nur die Kopfangaben (Jahr, Name,
 * Seite). Die Summen unter den Spalten 5 und 6 zählen ebenfalls nicht.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { n, tabelle } from './verzeichnis';
import { s, zaehltNicht } from './hilfen';

const s0 = s(0);

export const nw040014: FormularProfil = zusammen(
  {
    abschnitte: {
      '0:Panel1': { titel: 'Erteilte Bescheinigungen (eine Zeile je Bauvorhaben)' },
      '0:Panel2': { titel: 'Summen' },
    },
    feldTitel: {
      '0:Memo1': 'Verzeichnis für das Jahr',
      '0:Memo2': 'Name der/des Sachverständigen',
      '0:Memo65': 'Seite',
      '0:Memo63': 'Summe: Wohngebäude',
      '0:Memo64': 'Summe: Sonstige Bauvorhaben',
    },
    zaehlt: zaehltNicht(...s0('Memo63', 'Memo64')),
  },
  tabelle(0, 10, [
    ['Prüf-Nr.', n('Memo', 3, 6)],
    ['Bezeichnung und Lage des Bauvorhabens', n('Memo', 4, 6)],
    ['Bauherrschaft (Name, Wohnort)', n('Memo', 5, 6)],
    ['zuständiges Bauaufsichtsamt', n('Memo', 6, 6)],
    ['Wohngebäude', n('CheckBox', 1, 3)],
    ['Sonstiges Bauvorhaben', n('CheckBox', 2, 3)],
    ['Datum des Prüfauftrages', n('Memo', 7, 6)],
    ['Bescheinigung über die Prüfung des Brandschutzes erteilt am (Datum)', n('Memo', 8, 6)],
    ['Stichprobenhafte Kontrollen beauftragt', n('CheckBox', 3, 3)],
  ]),
);

export const vorgaben: Record<string, FormularProfil> = { 'nw040014|2019E': nw040014 };
