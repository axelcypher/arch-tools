/**
 * Verzeichnis der erteilten Bescheinigungen einer/eines staatlich anerkannten Sachverständigen für Erd- und Grundbau
 * (Stand 2019E), ein Blatt.
 *
 * Tabelle mit zehn gleichartigen Zeilen (eine je Bauvorhaben): Zeilen zählen nicht, nur die Kopfangaben (Jahr, Name,
 * Seite). Die Summen unter den Spalten 5 bis 7 zählen ebenfalls nicht.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { n, tabelle } from './verzeichnis';
import { s, zaehltNicht } from './hilfen';

const s0 = s(0);

export const nw040015: FormularProfil = zusammen(
  {
    abschnitte: {
      '0:Panel1': { titel: 'Erteilte Bescheinigungen (eine Zeile je Bauvorhaben)' },
      '0:Panel2': { titel: 'Summen' },
    },
    feldTitel: {
      '0:Memo1': 'Verzeichnis für das Jahr',
      '0:Memo2': 'Name der/des Sachverständigen',
      '0:Memo76': 'Seite',
      '0:Memo73': 'Summe: Sonderbau',
      '0:Memo74': 'Summe: Wohngebäude',
      '0:Memo75': 'Summe: Sonstige Bauvorhaben',
    },
    zaehlt: zaehltNicht(...s0('Memo73', 'Memo74', 'Memo75')),
  },
  tabelle(0, 10, [
    ['Prüf-Nr.', n('Memo', 3, 7)],
    ['Bezeichnung und Lage des Bauvorhabens', n('Memo', 4, 7)],
    ['Bauherrschaft (Name, Wohnort)', n('Memo', 5, 7)],
    ['zuständiges Bauaufsichtsamt', n('Memo', 6, 7)],
    ['Sonderbau', n('CheckBox', 1, 3)],
    ['Wohngebäude', n('CheckBox', 2, 3)],
    ['Sonstiges Bauvorhaben', n('CheckBox', 3, 3)],
    ['Name der/des Sachverständigen für die Prüfung der Standsicherheit', n('Memo', 7, 7)],
    ['Datum des Prüfauftrages', n('Memo', 8, 7)],
    ['Bescheinigung nach § 19 SV-VO erteilt am (Datum)', n('Memo', 9, 7)],
  ]),
);

export const vorgaben: Record<string, FormularProfil> = { 'nw040015|2019E': nw040015 };
