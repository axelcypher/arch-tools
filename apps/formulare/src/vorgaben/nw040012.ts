/**
 * Verzeichnis der erteilten Bescheinigungen einer/eines staatlich anerkannten Sachverständigen für Schall- und
 * Wärmeschutz (Stand 2019E), ein Blatt.
 *
 * Tabelle mit zehn gleichartigen Zeilen (eine je Bauvorhaben): Zeilen zählen nicht, nur die Kopfangaben (Jahr, Name,
 * Seite). Die Summen unter den Spalten 5 bis 11 zählen ebenfalls nicht.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { n, tabelle } from './verzeichnis';
import { s, zaehltNicht } from './hilfen';

const s0 = s(0);

export const nw040012: FormularProfil = zusammen(
  {
    abschnitte: {
      '0:Panel1': { titel: 'Erteilte Bescheinigungen (eine Zeile je Bauvorhaben)' },
      '0:Panel2': { titel: 'Summen' },
    },
    feldTitel: {
      '0:Memo1': 'Verzeichnis für das Jahr',
      '0:Memo2': 'Name der/des Sachverständigen',
      '0:Memo60': 'Seite',
      '0:Memo53': 'Summe: Schallschutz',
      '0:Memo54': 'Summe: Wärmeschutz',
      '0:Memo55': 'Summe: Sonderbau',
      '0:Memo56': 'Summe: Wohngebäude',
      '0:Memo57': 'Summe: Sonstige Bauvorhaben',
      '0:Memo58': 'Summe: Aufstellen',
      '0:Memo59': 'Summe: Prüfen',
    },
    zaehlt: zaehltNicht(...s0('Memo53', 'Memo54', 'Memo55', 'Memo56', 'Memo57', 'Memo58', 'Memo59')),
  },
  tabelle(0, 10, [
    ['Auftrags-Nr.', n('Memo', 3, 5)],
    ['Bezeichnung und Lage des Bauvorhabens', n('Memo', 4, 5)],
    ['Bauherrschaft (Name, Wohnort)', n('Memo', 5, 5)],
    ['zuständiges Bauaufsichtsamt', n('Memo', 6, 5)],
    ['Nachweis Schallschutz', n('CheckBox', 1, 8)],
    ['Nachweis Wärmeschutz', n('CheckBox', 2, 8)],
    ['Sonderbau', n('CheckBox', 3, 8)],
    ['Wohngebäude', n('CheckBox', 4, 8)],
    ['Sonstiges Bauvorhaben', n('CheckBox', 5, 8)],
    ['Nachweise aufgestellt', n('CheckBox', 6, 8)],
    ['Nachweise geprüft', n('CheckBox', 7, 8)],
    ['Bescheinigung erteilt am (Datum)', n('Memo', 7, 5)],
    ['Stichprobenhafte Kontrollen beauftragt', n('CheckBox', 8, 8)],
  ]),
);

export const vorgaben: Record<string, FormularProfil> = { 'nw040012|2019E': nw040012 };
