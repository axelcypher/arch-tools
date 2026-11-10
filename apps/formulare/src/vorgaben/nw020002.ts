/**
 * Berechnung des Maßes der baulichen Nutzung (NRW 2018) – Bauvorlage nach § 3 BauPrüfVO, beizufügen nur im Bereich
 * eines Bebauungsplans oder einer Satzung (das regelt der Bauantrag, nicht dieses Blatt).
 *
 * Es zählen die Kopfangaben (Bauantrag vom, Bauherrschaft, Entwurfsverfassende, Baugrundstück mit Bebauungsplan,
 * Bauvorhaben), die Grundflächenzahl, die Anzahl der Normalgeschosse und Datum/Unterschrift. Weitere Festsetzungen
 * (Zahl der Vollgeschosse, GFZ, BMZ) zählen nicht: Ein Bebauungsplan muss stets nur die Grundflächenzahl oder
 * Grundfläche festsetzen (§ 16 Absatz 3 BauNVO), die übrigen nur, soweit festgesetzt. Die Rechenzeilen sind
 * gleichartig – man füllt so viele, wie es Bauteile gibt –, sie zählen nicht; Flächen, Summen und zulässige Werte
 * rechnet FORMA. Ebenso zählen nicht: das Kästchen „gültige BauNVO vor 1990“, das Kellergeschoss (2.1, nur wenn
 * vorhanden) und die „Weiteren Angaben“ (freiwillig). Telefon, Telefax und E-Mail: eine Angabe genügt.
 *
 * Nach dem Vordruck: „der Nachweis 1.2 ist nur für Vorhaben erforderlich, für die die BauNVO 1990 gilt“ – 1.2
 * entfällt, wenn „gültige BauNVO vor 1990“ angekreuzt ist.
 */

import type { FormularProfil } from '../profil';
import { zusammen } from './antrag';
import { gruppeV, s, wenn, zaehltNicht } from './hilfen';

const s0 = s(0);
/** 1.2 nur, wenn die BauNVO 1990 gilt (Kästchen „gültige BauNVO vor 1990“ nicht angekreuzt) */
const baunvo1990 = wenn({ art: 'feld', feld: '0:CheckBox1', pruefung: 'leer' });

const flaeche = ['Bezeichnung', 'Länge (m)', 'Breite (m)', 'Fläche (m²)'];
const masse = ['Bezeichnung', 'Länge (m)', 'Breite (m)', 'Höhe (m)', 'Baumasse (m³)'];

/** Tabelle: je Zeile die Felder in der Reihenfolge der Spalten; das letzte rechnet FORMA */
interface Tabelle {
  name: string;
  seite: number;
  spalten: string[];
  zeilen: number[][];
}

const tabellen: Tabelle[] = [
  {
    name: '1.1',
    seite: 0,
    spalten: flaeche,
    zeilen: [
      [14, 15, 16, 17],
      [18, 25, 26, 27],
      [28, 29, 30, 31],
      [32, 33, 34, 35],
      [36, 37, 38, 39],
      [40, 41, 42, 43],
      [44, 45, 46, 47],
      [48, 49, 50, 51],
    ],
  },
  {
    name: '1.2.1',
    seite: 1,
    spalten: flaeche,
    zeilen: [
      [48, 49, 50, 51],
      [52, 53, 54, 55],
      [56, 57, 58, 59],
    ],
  },
  {
    name: '1.2.2',
    seite: 1,
    spalten: flaeche,
    zeilen: [
      [60, 61, 62, 63],
      [64, 65, 66, 67],
      [68, 69, 70, 71],
    ],
  },
  {
    name: '1.2.3',
    seite: 1,
    spalten: flaeche,
    zeilen: [
      [72, 73, 74, 75],
      [76, 77, 78, 79],
      [80, 81, 82, 83],
    ],
  },
  {
    name: '2.3 Grundfläche darunter',
    seite: 2,
    spalten: flaeche,
    zeilen: [
      [8, 2, 3, 4],
      [62, 5, 6, 7],
      [63, 52, 53, 54],
      [64, 55, 56, 57],
      [65, 58, 59, 61],
    ],
  },
  {
    name: '2.3 lichte Höhe 2,30 m',
    seite: 2,
    spalten: flaeche,
    zeilen: [
      [66, 67, 68, 69],
      [83, 70, 71, 72],
      [84, 73, 74, 75],
      [85, 76, 77, 78],
      [86, 79, 80, 81],
    ],
  },
  {
    name: '2.4 Grundfläche darunter',
    seite: 2,
    spalten: flaeche,
    zeilen: [
      [1, 9, 10, 11],
      [25, 12, 13, 14],
      [26, 15, 16, 17],
      [27, 18, 19, 20],
      [28, 21, 22, 24],
    ],
  },
  {
    name: '2.4 lichte Höhe 2,30 m',
    seite: 2,
    spalten: flaeche,
    zeilen: [
      [29, 30, 31, 32],
      [46, 33, 34, 35],
      [47, 36, 37, 38],
      [48, 39, 40, 41],
      [49, 42, 43, 44],
    ],
  },
  {
    name: '3.1',
    seite: 3,
    spalten: flaeche,
    zeilen: [
      [10, 11, 12, 13],
      [14, 15, 16, 52],
      [53, 54, 55, 56],
      [57, 58, 59, 60],
      [61, 62, 63, 64],
      [65, 17, 18, 19],
      [20, 21, 22, 23],
      [24, 25, 26, 27],
      [28, 29, 30, 31],
      [32, 33, 34, 35],
      [36, 37, 38, 39],
      [40, 41, 42, 43],
      [44, 45, 46, 47],
    ],
  },
  {
    name: '3.2',
    seite: 3,
    spalten: flaeche,
    zeilen: [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 110, 111, 112],
    ],
  },
  {
    name: '4.',
    seite: 3,
    spalten: masse,
    zeilen: [
      [71, 72, 73, 74, 75],
      [76, 77, 78, 79, 80],
      [81, 82, 83, 84, 85],
      [86, 87, 88, 89, 90],
      [91, 92, 93, 94, 95],
      [96, 97, 98, 99, 100],
    ],
  },
];

const zellen = tabellen.flatMap((t) =>
  t.zeilen.flatMap((z, i) => z.map((nr, j) => ({ feld: `${t.seite}:Memo${nr}`, titel: `${t.name} Zeile ${i + 1}: ${t.spalten[j]}`, berechnet: j === z.length - 1 }))),
);

export const nw020002_2021L: FormularProfil = zusammen({
  abschnitte: {
    '0:-': { titel: 'Anlage zum Bauantrag' },
    '0:Panel7': { titel: '1.1 Grundflächen der Gebäude (ohne Garagen, Stellplätze und Nebenanlagen)' },
    '1:Panel1': { titel: '1.2.1 Grundflächen der Garagen und Stellplätze mit ihren Zufahrten', bedingung: baunvo1990 },
    '1:Panel4': { titel: '1.2.2 Grundflächen der Nebenanlagen i. S. § 14 BauNVO', bedingung: baunvo1990 },
    '1:Panel5': { titel: '1.2.3 Grundflächen der nicht überbauten unterirdischen baulichen Anlagen, Summe nach 1.2', bedingung: baunvo1990 },
    '1:-': { titel: 'Ergebnis des Nachweises nach 1.2', bedingung: baunvo1990 },
    '1:Panel6': { titel: '1.3 Weitere Angaben zur Grundflächenberechnung (freiwillig)' },
    '1:Panel2': { titel: '2.1 Vollgeschosse: Kellergeschoss (nur wenn vorhanden)' },
    '1:Panel3': { titel: '2.2 Normalgeschoss' },
    '2:Panel4': { titel: '2.3 Dachgeschoss' },
    '2:Panel1': { titel: '2.4 Weiteres Dachgeschoss (nur wenn vorhanden), Summe der Vollgeschosse' },
    '2:Panel2': { titel: '2.5 Weitere Angaben zur Ermittlung der Zahl der Vollgeschosse (freiwillig)' },
    '3:Panel4': { titel: '3.1 Geschossfläche: Flächen der Vollgeschosse' },
    '3:Panel1': { titel: '3.2 Flächen von Aufenthaltsräumen in anderen Geschossen, zulässige Geschossfläche' },
    '3:Panel2': { titel: '3.3 Weitere Angaben zur Geschossflächenberechnung (freiwillig)' },
    '3:Panel3': { titel: '4. Berechnung der vorhandenen und geplanten Baumasse' },
    '3:Panel5': { titel: '4.1 Weitere Angaben zur Berechnung der Baumasse (freiwillig)' },
    '3:Panel999': { titel: 'Datum, Name und Unterschrift der/des Entwurfsverfassenden' },
  },
  feldTitel: {
    '0:Memo1': 'Anlage zum Bauantrag vom (Datum)',
    '0:Memo2': 'Bauherrschaft: Name, Vorname, Firma',
    '0:Memo3': 'Bauherrschaft: Straße, Hausnummer',
    '0:Memo4': 'Bauherrschaft: PLZ, Ort',
    '0:Memo5': 'Bauherrschaft: Telefon',
    '0:Memo6': 'Bauherrschaft: Telefax',
    '0:Memo7': 'Bauherrschaft: E-Mail',
    '0:Memo8': 'Entwurfsverfassende: Name, Vorname, Firma',
    '0:Memo9': 'Entwurfsverfassende: Straße, Hausnummer',
    '0:Memo10': 'Entwurfsverfassende: PLZ, Ort',
    '0:Memo11': 'Entwurfsverfassende: Telefon',
    '0:Memo12': 'Entwurfsverfassende: Telefax',
    '0:Memo13': 'Entwurfsverfassende: E-Mail',
    '0:Memo20': 'Baugrundstück: Ort, Straße, Hausnummer, Ortsteil',
    '0:Memo21': 'Baugrundstück: Gemarkung(en)',
    '0:Memo22': 'Baugrundstück: Flur(e)',
    '0:Memo94': 'Baugrundstück: Flurstück(e)',
    '0:Memo97': 'Baugrundstück: Größe (m²)',
    '0:Memo95': 'Bebauungsplan-Nr.',
    '0:Memo96': 'Bebauungsplan vom (Datum)',
    '0:Memo23': 'Festsetzung: Grundflächenzahl (GRZ)',
    '0:Memo24': 'Festsetzung: Zahl der Vollgeschosse',
    '0:Memo88': 'Festsetzung: Geschossflächenzahl (GFZ)',
    '0:Memo89': 'Festsetzung: Baumassenzahl (BMZ)',
    '0:Memo19': 'Bauvorhaben',
    ...Object.fromEntries(zellen.map((z) => [z.feld, z.titel])),
    '0:Memo52': '1.1 Summe der Grundflächen (m²)',
    '0:Memo53': '1.1 Zulässige Grundfläche: 1. Faktor',
    '0:Memo54': '1.1 Zulässige Grundfläche: 2. Faktor',
    '0:Memo55': '1.1 Zulässige Grundfläche (m²)',
    '0:CheckBox1': 'Gültige BauNVO vor 1990 (Nachweis 1.2 entfällt)',
    '1:Memo84': '1.2 Summe der Grundflächen (m²)',
    '1:Memo85': '1.2 Zulässige Grundfläche nach 1.1 (× 1,5)',
    '1:Memo86': '1.2 Zulässige Grundfläche für 1.1 und 1.2 (m²)',
    '1:Memo1': '1.2 Ergebnis des Nachweises',
    '1:Memo87': '1.3 Weitere Angaben zur Grundflächenberechnung',
    '1:Memo3': '2.1 Kellergeschoss: OK FF EG über Gelände im Mittel (m)',
    '1:Memo4': '2.1 Kellergeschoss: Geschosshöhe KG (m)',
    '1:Memo5': '2.1 Kellergeschoss: hieraus folgt',
    '1:Memo6': '2.1 Kellergeschoss: Ergebnis (Vollgeschoss)',
    '1:Memo7': '2.2 Anzahl der Normalgeschosse',
    '2:Memo60': '2.3 Summe Grundfläche des darunter liegenden Geschosses (m²)',
    '2:Memo82': '2.3 Summe Fläche mit lichter Höhe 2,30 m (m²)',
    '2:Memo87': '2.3 Dachgeschoss: hieraus folgt',
    '2:Memo88': '2.3 Dachgeschoss: Ergebnis (Vollgeschoss)',
    '2:Memo23': '2.4 Summe Grundfläche des darunter liegenden Geschosses (m²)',
    '2:Memo45': '2.4 Summe Fläche mit lichter Höhe 2,30 m (m²)',
    '2:Memo50': '2.4 Weiteres Dachgeschoss: hieraus folgt',
    '2:Memo51': '2.4 Weiteres Dachgeschoss: Ergebnis (Vollgeschoss)',
    '2:Memo107': 'Summe der Vollgeschosse',
    '2:Memo108': 'Zulässige Anzahl der Vollgeschosse',
    '2:Memo109': '2.5 Weitere Angaben zur Ermittlung der Zahl der Vollgeschosse',
    '3:Memo48': '3.1 Zwischensumme (m²)',
    '3:Memo66': 'Summe 3.1 + 3.2 (m²)',
    '3:Memo67': 'Zulässige Geschossfläche: 1. Faktor',
    '3:Memo68': 'Zulässige Geschossfläche: 2. Faktor',
    '3:Memo69': 'Zulässige Geschossfläche (m²)',
    '3:Memo70': '3.3 Weitere Angaben zur Geschossflächenberechnung',
    '3:Memo101': '4. Summe der anzurechnenden Baumassen (m³)',
    '3:Memo102': 'Zulässige Baumasse: 1. Faktor',
    '3:Memo103': 'Zulässige Baumasse: 2. Faktor',
    '3:Memo104': 'Zulässige Baumasse (m³)',
    '3:Memo105': '4.1 Weitere Angaben zur Berechnung der Baumasse',
    '3:Memo106': 'Datum, Name und Unterschrift der/des Entwurfsverfassenden',
  },
  zaehlt: zaehltNicht(
    // Festsetzungen nur, soweit im Bebauungsplan getroffen
    '0:Memo24',
    '0:Memo88',
    '0:Memo89',
    '0:CheckBox1',
    // Kellergeschoss nur, wenn vorhanden
    '1:Memo3',
    '1:Memo4',
    // freiwillige weitere Angaben
    '1:Memo87',
    '2:Memo109',
    '3:Memo70',
    '3:Memo105',
    // Rechenzeilen (ohne das berechnete Ergebnis)
    ...zellen.filter((z) => !z.berechnet).map((z) => z.feld),
  ),
  gruppen: [
    gruppeV('bauherrschaft-erreichbar', 'Bauherrschaft: Telefon, Telefax oder E-Mail', 'eins', s0('Memo5', 'Memo6', 'Memo7')),
    gruppeV('entwurf-erreichbar', 'Entwurfsverfassende: Telefon, Telefax oder E-Mail', 'eins', s0('Memo11', 'Memo12', 'Memo13')),
  ],
});

export const vorgaben: Record<string, FormularProfil> = { 'nw020002|2021L': nw020002_2021L };
