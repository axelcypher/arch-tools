import { GLOBAL_GRUPPE, PROJEKT_GRUPPE } from '@core/excel/projekt';
import type { Einzelwert, PlatzhalterSchema } from '@core/excel/schema';

/**
 * Schema aller Platzhalter von TERRIO – Quelle für die Referenz im Excel-Dialog, das Blatt „Platzhalter“ der
 * Muster-Vorlage und docs/excel-vorlagen.md. Tests: platzhalterSchema.test.ts gegen buildGrzContext mit den Beispieldaten
 * aus platzhalterTestdaten.ts.
 */

/** Werte einer Kennzahl (GRZ, GRZ II, GFZ, BMZ) – wie kennzahlWerte in exportData.ts */
function kennzahl(p: string, name: string, groesse: string, einheit: 'm²' | 'm³'): Einzelwert[] {
  return [
    { schluessel: p, text: `${name}, auf die Stellen der App gerundet (leer ohne Festsetzung bzw. Berechnung)` },
    { schluessel: `${p}.stellen`, text: 'Nachkommastellen der Kennzahl (mindestens 3, nahe am Grenzwert mehr)' },
    { schluessel: `${p}.zulaessig`, text: `zulässige ${name} laut Festsetzung` },
    { schluessel: `${p}.zulaessig_flaeche`, text: `zulässige ${groesse}`, einheit },
    { schluessel: `${p}.flaeche`, text: `angerechnete ${groesse}`, einheit },
    { schluessel: `${p}.mit_offenen`, text: `${name} einschließlich der ungeklärten Flächen („prüfen“), sonst leer` },
    { schluessel: `${p}.flaeche_mit_offenen`, text: `${groesse} einschließlich der ungeklärten Flächen, sonst leer`, einheit },
    { schluessel: `${p}.reserve`, text: `zulässige minus angerechnete ${groesse} (negativ = überschritten)`, einheit },
    { schluessel: `${p}.status`, text: 'Ergebnis: „eingehalten“, „überschritten“ …' },
    { schluessel: `${p}.vergleich`, text: `Begründung in ${einheit}, z. B. „GR I 135,00 m² < 240,00 m² zulässig“` },
  ];
}

/** absolute Festsetzung (§ 16 Abs. 2 BauNVO) – wie absolutWerte in exportData.ts */
function absolut(p: string, name: string): Einzelwert[] {
  return [
    { schluessel: `${p}.bezeichnung`, text: `Bezeichnung, z. B. „${name}“ (leer ohne Festsetzung)` },
    { schluessel: p, text: `vorhandene ${name.replace(/ \(.*\)$/, '')}`, einheit: 'm²' },
    { schluessel: `${p}.zulaessig`, text: 'festgesetzter Höchstwert', einheit: 'm²' },
    { schluessel: `${p}.status`, text: 'Ergebnis' },
  ];
}

export const TERRIO_SCHEMA: PlatzhalterSchema = {
  app: 'TERRIO',
  beispieldaten:
    'Beispieldaten: Projekt „Musterhaus“, Grundstück 600 m², Bebauungsplan vom 01.06.1995 (BauNVO 1990) mit GRZ 0,4, GFZ 0,8, II Vollgeschossen und Festsetzung nach § 20 Abs. 3 Satz 2; Gebäude 12 × 10 m mit EG, OG und DG (Walmdach, kein Vollgeschoss); Räume Wohnen (EG), Zimmer und Abstellraum (DG); Lageplan: Zufahrt (GRZ II, teilversiegelt), Terrasse (prüfen), Weg (zählt), Garten (Grünfläche), Nachbarhaus.',
  abschnitte: [
    PROJEKT_GRUPPE,
    {
      art: 'einzelwerte',
      id: 'grundlagen',
      titel: 'Grundlagen',
      werte: [
        { schluessel: 'bplan.datum', text: 'Datum des Bebauungsplans (TT.MM.JJJJ)' },
        { schluessel: 'bplan.auslegung', text: 'öffentliche Auslegung des Planentwurfs (TT.MM.JJJJ), maßgebend für die BauNVO-Fassung – leer, wenn nicht eingetragen' },
        { schluessel: 'bplan.angabe', text: 'Nummer, Name und Datum in einer Zeile, z. B. „Nr. 112 „Am Hang“ vom 14.03.1967“' },
        { schluessel: 'gebietsart', text: 'Baugebiet nach BauNVO als Kürzel (WA, MI …)' },
        { schluessel: 'gebietsart.bezeichnung', text: '„Baugebiet“, wenn eines eingetragen ist (Beschriftung), sonst leer' },
        { schluessel: 'gebietsart.text', text: 'Baugebiet mit Bezeichnung, z. B. „WA – allgemeines Wohngebiet“' },
        { schluessel: 'stand', text: 'Stand des Nachweises (im Druckdialog eingetragen) – leer, wenn nicht eingetragen' },
        { schluessel: 'stand.text', text: '„Stand TT.MM.JJJJ“ bzw. leer' },
        { schluessel: 'baunvo.fassung', text: 'angewandte Fassung der BauNVO' },
        { schluessel: 'bauo.fassung', text: 'angewandte Fassung der Bauordnung für den Vollgeschossbegriff' },
        { schluessel: 'recht.hinweise', text: 'Hinweise zur Wahl der Fassung' },
        { schluessel: 'grundstueck.flaeche_nachweis', text: 'maßgebende Grundstücksfläche', einheit: 'm²' },
        { schluessel: 'grundstueck.quelle', text: 'Herkunft der Grundstücksfläche' },
        { schluessel: 'grundstueck.gemeinschaftsanlagen', text: 'hinzugerechneter Anteil an Gemeinschaftsanlagen nach § 21a Abs. 2 BauNVO (leer ohne)', einheit: 'm²' },
        { schluessel: 'gelaende', text: 'Geländeoberfläche über ±0,00', einheit: 'm' },
        { schluessel: 'gelaende.quelle', text: 'Herkunft der Geländeoberfläche' },
        { schluessel: 'hauptanlage', text: 'Grundfläche der Hauptanlage (Gebäude)', einheit: 'm²' },
      ],
    },
    {
      art: 'einzelwerte',
      id: 'grz',
      titel: 'Grundflächenzahl (§ 19 BauNVO)',
      text: 'GRZ I bzw. GRZ (vor 1990) und GRZ II nach § 19 Abs. 4 BauNVO 1990 (Überschreitung durch Garagen, Stellplätze mit Zufahrten, Nebenanlagen und unterirdische Anlagen).',
      werte: [
        { schluessel: 'grz.bezeichnung', text: '„GRZ I“ (BauNVO 1990) bzw. „GRZ“ (frühere Fassungen)' },
        ...kennzahl('grz', 'GRZ I bzw. GRZ', 'Grundfläche (GR I bzw. GR)', 'm²'),
        { schluessel: 'grz.ii.bezeichnung', text: '„GRZ II (§ 19 Abs. 4)“ bei BauNVO 1990, sonst leer' },
        ...kennzahl('grz.ii', 'GRZ II', 'Grundfläche GR II', 'm²'),
        { schluessel: 'grz.offen.bezeichnung', text: '„GRZ II mit ungeklärten Flächen („prüfen“)“ bzw. „GRZ …“ – leer ohne ungeklärte Flächen' },
        { schluessel: 'grz.offen.flaeche', text: 'Grundfläche einschließlich der ungeklärten Flächen (GR II bzw. GR)', einheit: 'm²' },
        { schluessel: 'lageplan.angerechnet_auf', text: '„GR II“ (BauNVO 1990) bzw. „GR“ – Einzelwert für Spaltenüberschriften, obwohl er wie ein Feld von lageplan aussieht' },
        { schluessel: 'unterirdisch.flaeche', text: 'Kellergeschoss außerhalb der Hauptanlage (leer ohne)', einheit: 'm²' },
        { schluessel: 'unterirdisch.angerechnet', text: 'davon angerechnet', einheit: 'm²' },
        { schluessel: 'garagen.frei', text: 'anrechnungsfreie Garagenfläche nach § 19 Abs. 5 (1962) bzw. § 21a Abs. 3 (1968/1977)', einheit: 'm²' },
        ...absolut('gr_absolut', 'GR I (absolut)'),
        ...absolut('gr2_absolut', 'GR II absolut (§ 19 Abs. 4 S. 2)'),
      ],
      beispiele: [
        {
          titel: 'Kennzahlen mit Ergebnis',
          vorlage: [
            ['{{grz.bezeichnung}}', '{{grz}}', 'zulässig {{grz.zulaessig}}', '{{grz.status}}'],
            ['{{#wenn grz.ii}}{{grz.ii.bezeichnung}}', '{{grz.ii}}', 'zulässig {{grz.ii.zulaessig}}', '{{grz.ii.status}}{{/wenn}}'],
            ['{{grz.vergleich}}'],
          ],
          ergebnis: [
            ['GRZ I', 0.225, 'zulässig 0,4', 'eingehalten'],
            ['GRZ II (§ 19 Abs. 4)', 0.25, 'zulässig 0,6', 'eingehalten'],
            ['GR I 135,00 m² < 240,00 m² zulässig; mit ungeklärten Flächen („prüfen“) 150,00 m²', null, null, null],
          ],
        },
      ],
    },
    {
      art: 'einzelwerte',
      id: 'gfz',
      titel: 'Geschossfläche, Baumasse, Vollgeschosse',
      text: 'GFZ nach § 20, BMZ nach § 21 BauNVO; Vollgeschosse nach der Bauordnung der maßgebenden Fassung.',
      werte: [
        { schluessel: 'gf', text: 'Geschossfläche (GF)', einheit: 'm²' },
        { schluessel: 'gf.aufenthalt', text: 'davon Aufenthaltsräume in Nicht-Vollgeschossen samt Treppenräumen und Umfassungswänden', einheit: 'm²' },
        {
          schluessel: 'aufenthalt.titel',
          text: '„Aufenthaltsräume in Nicht-Vollgeschossen“, wenn sie zur Geschossfläche zählen (vor 1990, bei BauNVO 1990 nur bei Festsetzung nach § 20 Abs. 3 Satz 2), sonst leer',
        },
        ...kennzahl('gfz', 'GFZ', 'Geschossfläche', 'm²'),
        ...absolut('gf_absolut', 'GF (absolut)'),
        { schluessel: 'bmz.bezeichnung', text: '„BMZ“ bei Festsetzung, sonst leer' },
        { schluessel: 'bmz.text', text: '„Baumasse (vereinfacht)“ bzw. leer' },
        ...kennzahl('bmz', 'BMZ', 'Baumasse (BM)', 'm³'),
        { schluessel: 'bmz.baumasse', text: 'Baumasse, vereinfacht aus Grundfläche × Geschosshöhe der Vollgeschosse', einheit: 'm³' },
        { schluessel: 'vollgeschosse', text: 'Zahl der Vollgeschosse' },
        { schluessel: 'vollgeschosse.roemisch', text: 'als römische Zahl (II)' },
        { schluessel: 'vollgeschosse.zulaessig', text: 'zulässige Zahl laut Festsetzung' },
        { schluessel: 'vollgeschosse.mindestens', text: 'Mindestzahl laut Festsetzung' },
        { schluessel: 'vollgeschosse.zwingend', text: '„ja“, wenn die Zahl zwingend festgesetzt ist' },
        { schluessel: 'vollgeschosse.status', text: 'Ergebnis' },
        { schluessel: 'vollgeschosse.namen', text: 'Namen der Vollgeschosse, mit Komma getrennt' },
      ],
      beispiele: [
        {
          titel: 'GFZ und Vollgeschosse',
          vorlage: [
            ['GFZ', '{{gfz}}', '{{gfz.vergleich}}'],
            ['Vollgeschosse', '{{vollgeschosse.roemisch}}', '{{vollgeschosse.namen}}'],
          ],
          ergebnis: [
            ['GFZ', 0.449, 'GF 269,15 m² < 480,00 m² zulässig'],
            ['Vollgeschosse', 'II', 'EG, OG'],
          ],
        },
      ],
    },
    {
      art: 'einzelwerte',
      id: 'bilanz',
      titel: 'Flächenbilanz und Hinweise',
      werte: [
        { schluessel: 'bilanz.gebaeude', text: 'Gebäude', einheit: 'm²' },
        { schluessel: 'bilanz.vollversiegelt', text: 'vollversiegelte Flächen', einheit: 'm²' },
        { schluessel: 'bilanz.teilversiegelt', text: 'teilversiegelte Flächen', einheit: 'm²' },
        { schluessel: 'bilanz.gruen', text: 'Grünflächen', einheit: 'm²' },
        { schluessel: 'bilanz.summe', text: 'Summe der erfassten Flächen', einheit: 'm²' },
        { schluessel: 'bilanz.differenz', text: 'Grundstücksfläche minus Summe (nicht erfasst bzw. überlappend)', einheit: 'm²' },
        { schluessel: 'hinweise', text: 'alle Hinweise für die Bauaufsicht in einer Zelle (Zeilenumbrüche; ohne Bedienhinweise der App) – je Zeile: hinweis.text' },
        { schluessel: 'haftung', text: 'Haftungshinweis des Werkzeugs' },
      ],
    },
    {
      art: 'sammlung',
      name: 'geschoss',
      titel: 'Geschosse',
      datensatz: 'je Geschoss',
      text: 'Vollgeschossprüfung und Geschossfläche je Geschoss.',
      felder: [
        { name: 'nr', text: 'laufende Nummer' },
        { name: 'name', text: 'Bezeichnung' },
        { name: 'ueber_gelaende', text: 'Deckenoberkante über der Geländeoberfläche im Mittel', einheit: 'm' },
        { name: 'gelaende', text: 'Geländeoberfläche entlang der Außenwände des Geschosses im Mittel', einheit: 'm' },
        { name: 'gelaende_min', text: 'tiefster Punkt der Geländeoberfläche entlang der Außenwände', einheit: 'm' },
        { name: 'gelaende_max', text: 'höchster Punkt der Geländeoberfläche entlang der Außenwände', einheit: 'm' },
        { name: 'oberirdisch', text: '„ja“ bei oberirdischen Geschossen' },
        { name: 'anteil', text: 'Anteil der Grundfläche mit der geforderten Höhe (nur oberirdische Geschosse)' },
        { name: 'anteil_soll', text: 'geforderter Anteil (0 = ohne Anteilsregel)' },
        { name: 'hoehe_soll', text: 'geforderte Höhe', einheit: 'm' },
        { name: 'flaeche_hoch', text: 'Fläche mit der geforderten Höhe', einheit: 'm²' },
        { name: 'bezugsflaeche', text: 'Bezugsfläche der Anteilsregel', einheit: 'm²' },
        { name: 'vollgeschoss', text: '„ja“ bei Vollgeschossen' },
        { name: 'ergebnis', text: '„Vollgeschoss“ bzw. „kein Vollgeschoss“' },
        { name: 'festlegung', text: '„automatisch“ oder „festgelegt“' },
        { name: 'begruendung', text: 'Begründung der Vollgeschossprüfung' },
        { name: 'gf', text: 'Geschossfläche des Geschosses', einheit: 'm²' },
        { name: 'gf_art', text: 'wie die Geschossfläche ermittelt wurde' },
      ],
      filter: [
        { name: 'vollgeschoss', text: 'Vollgeschosse ([!vollgeschoss]: Nicht-Vollgeschosse)' },
        { name: 'oberirdisch', text: 'oberirdische Geschosse' },
      ],
      enthaelt: [{ sammlung: 'raum', text: 'Räume dieses Geschosses' }],
      zugriff: { ueber: 'name', text: 'Werte eines Geschosses über seinen Namen.', beispiel: '{{geschoss:EG.gf}}' },
      beispiele: [
        {
          titel: 'Vollgeschossprüfung je Geschoss',
          vorlage: [['{{geschoss.name}}', '{{geschoss.ergebnis}}', '{{geschoss.gf}}']],
          ergebnis: [
            ['EG', 'Vollgeschoss', 120],
            ['OG', 'Vollgeschoss', 120],
            ['DG', 'kein Vollgeschoss', 29.15],
          ],
        },
        {
          titel: 'Nicht-Vollgeschosse mit ihren Räumen',
          vorlage: [
            ['{{#geschoss[!vollgeschoss]}}{{geschoss.name}}', '{{geschoss.begruendung}}'],
            [null, '{{raum.name}}', '{{raum.aufenthalt}}{{/geschoss}}'],
          ],
          ergebnis: [
            ['DG', 'geneigte Dachflächen: Höhe ≥ 2,30 m bis OK Dachhaut auf 33 % der eigenen Grundfläche (mehr als drei Viertel gefordert)', null],
            [null, 'Zimmer', 'Aufenthaltsraum'],
            [null, 'Abstellraum', 'kein Aufenthaltsraum'],
          ],
        },
      ],
    },
    {
      art: 'sammlung',
      name: 'lageplan',
      titel: 'Lageplan-Flächen',
      datensatz: 'je Lageplan-Fläche',
      text: 'Flächen des Lageplans mit Anrechnung auf die Grundfläche und Versiegelung; Nachbarflächen ohne Nummer.',
      felder: [
        { name: 'nr', text: 'Nummer wie im Rechenweg (teil.flaeche_nr) und im Druck; leer bei Nachbarflächen' },
        { name: 'name', text: 'Bezeichnung' },
        { name: 'nutzung', text: 'Nutzung, z. B. „Zufahrt“, „Terrasse“' },
        { name: 'versiegelung', text: '„vollversiegelt“, „teilversiegelt“ oder „Grünfläche“' },
        { name: 'flaeche', text: 'Fläche', einheit: 'm²' },
        { name: 'flaeche_aussen', text: 'davon außerhalb des Gebäudes', einheit: 'm²' },
        { name: 'flaeche_eindeutig', text: 'nur dieser Fläche zugeordneter Anteil – Summen zählen Überlagerungen einmal', einheit: 'm²' },
        { name: 'ueberlagert', text: 'von anderen Flächen schon abgedeckter Rest', einheit: 'm²' },
        { name: 'angerechnet', text: 'tatsächlich auf die Grundfläche angerechnet (GR II bei BauNVO 1990, sonst GR)', einheit: 'm²' },
        { name: 'angerechnet_bis', text: 'bei „prüfen“: angerechnet bis zu dieser Fläche, sonst leer', einheit: 'm²' },
        { name: 'anrechnung', text: 'Anrechnung: „zählt“, „GRZ II“, „bis 0,1 frei“, „zählt nicht“, „prüfen“ oder „Nachbar“' },
        { name: 'nachbar', text: '„ja“ bei Flächen eines Nachbargrundstücks' },
        { name: 'hoehe', text: 'Höhe der Oberfläche über ±0,00 (leer ohne)', einheit: 'm' },
      ],
      filter: [
        { name: 'eigen', text: 'Flächen des eigenen Grundstücks' },
        { name: 'nachbar', text: 'Flächen der Nachbargrundstücke' },
        { name: 'zaehlt', aliase: ['zählt'], text: 'zählen wie die Hauptanlage (GR I bzw. GR)' },
        { name: 'grz2', text: 'zählen nur zur GRZ II (§ 19 Abs. 4 BauNVO 1990)' },
        { name: 'pruefen', aliase: ['prüfen'], text: 'nach der maßgebenden Fassung nicht eindeutig („prüfen“)' },
        { name: 'voll', text: 'vollversiegelt' },
        { name: 'teil', text: 'teilversiegelt' },
        { name: 'gruen', aliase: ['grün'], text: 'Grünfläche' },
      ],
      enthaelt: [],
      beispiele: [
        {
          titel: 'Flächen des Grundstücks mit Summe',
          text: 'lageplan.angerechnet_auf ist ein Einzelwert und wiederholt die Kopfzeile nicht.',
          vorlage: [
            ['Fläche', 'Anrechnung', 'angerechnet auf {{lageplan.angerechnet_auf}}'],
            ['{{lageplan[eigen].name}}', '{{lageplan.anrechnung}}', '{{lageplan.angerechnet}}'],
            ['Summe', null, '=SUM(C2:C2)'],
          ],
          ergebnis: [
            ['Fläche', 'Anrechnung', 'angerechnet auf GR II'],
            ['Zufahrt', 'GRZ II', 15],
            ['Terrasse', 'prüfen', 0],
            ['Weg', 'zählt', 15],
            ['Garten', 'zählt nicht', 0],
            ['Summe', null, '=SUM(C2:C5)'],
          ],
        },
        {
          titel: 'Ungeklärte Flächen nur, wenn es welche gibt',
          vorlage: [['{{#wenn lageplan[pruefen]}}Zu prüfen:', '{{lageplan[pruefen].name}}', '{{lageplan[pruefen].angerechnet_bis}}{{/wenn}}']],
          ergebnis: [['Zu prüfen:', 'Terrasse', 15]],
        },
      ],
    },
    {
      art: 'sammlung',
      name: 'raum',
      titel: 'Räume',
      datensatz: 'je Raum',
      text: 'Räume aller Geschosse (ohne Abzugsflächen) mit der Prüfung als Aufenthaltsraum.',
      felder: [
        { name: 'nr', text: 'laufende Nummer' },
        { name: 'geschoss', text: 'Geschoss' },
        { name: 'vollgeschoss', text: '„ja“, wenn der Raum in einem Vollgeschoss liegt' },
        { name: 'nummer', text: 'Raumnummer' },
        { name: 'name', text: 'Raumbezeichnung' },
        { name: 'flaeche', text: 'Fläche ohne Putzabzug', einheit: 'm²' },
        { name: 'aufenthalt', text: '„Aufenthaltsraum“, „Treppenraum“ oder „kein Aufenthaltsraum“' },
        { name: 'festlegung', text: '„automatisch“ oder „festgelegt“' },
        { name: 'begruendung', text: 'Ergebnis der Prüfung nach Nutzung und lichter Höhe' },
        { name: 'hoehenlage', text: 'Höhenlage des Fußbodens gegenüber dem Geschoss (Split-Level; leer auf Geschossniveau)', einheit: 'm' },
      ],
      filter: [
        { name: 'aufenthalt', text: 'Aufenthalts- und Treppenräume' },
        {
          name: 'gf',
          text: 'Räume in Nicht-Vollgeschossen, wenn deren Aufenthaltsräume zur Geschossfläche zählen (vor 1990, bei BauNVO 1990 nur bei Festsetzung nach § 20 Abs. 3 Satz 2) – alle Räume dieser Geschosse, mit [gf,aufenthalt] nur die Aufenthaltsräume',
        },
        { name: 'vollgeschoss', text: 'Räume in Vollgeschossen' },
      ],
      enthaelt: [{ sammlung: 'geschoss', text: 'das Geschoss des Raums' }],
      beispiele: [
        {
          titel: 'Aufenthaltsräume, die zur Geschossfläche zählen',
          vorlage: [['{{#wenn aufenthalt.titel}}{{aufenthalt.titel}}'], [null, '{{raum[gf,aufenthalt].geschoss}}', '{{raum[gf,aufenthalt].name}}', '{{raum[gf,aufenthalt].flaeche}}'], ['{{/wenn}}']],
          ergebnis: [
            ['Aufenthaltsräume in Nicht-Vollgeschossen', null, null, null],
            [null, 'DG', 'Zimmer', 24],
          ],
        },
      ],
    },
    {
      art: 'sammlung',
      name: 'hinweis',
      titel: 'Hinweise',
      datensatz: 'je Hinweis',
      text: 'Hinweise für die Bauaufsicht (ohne Bedienhinweise der App).',
      felder: [
        { name: 'nr', text: 'laufende Nummer' },
        { name: 'text', text: 'Hinweis' },
      ],
      filter: [],
      enthaelt: [],
      beispiele: [
        {
          titel: 'Hinweise nummeriert',
          vorlage: [['{{hinweis[nr<=2].nr}}', '{{hinweis[nr<=2].text}}']],
          ergebnis: [
            [1, 'Grundstücksfläche laut Projektdaten 600,00 m², Lageplan-Flächen mit Gebäude 185,00 m² – Lageplan unvollständig oder Flächen überlappen.'],
            [2, 'Einzelne Flächen sind nach der maßgebenden BauNVO-Fassung nicht eindeutig einzustufen („prüfen“). GRZ I und GRZ II sind ohne und mit ihnen angegeben.'],
          ],
        },
      ],
    },
    {
      art: 'sammlung',
      name: 'formel',
      titel: 'Rechenweg: Formeln',
      datensatz: 'je Formel',
      text: 'Formelzeilen des Rechenwegs, z. B. „GRZ I = GR I / FGst = 135,00 m² / 600,00 m² = 0,225“.',
      felder: [
        { name: 'nr', text: 'laufende Nummer' },
        { name: 'text', text: 'Formel mit eingesetzten Werten' },
      ],
      filter: [],
      enthaelt: [],
      beispiele: [
        {
          titel: 'Formeln zur GRZ I',
          vorlage: [['{{formel[nr<=2].text}}']],
          ergebnis: [['GR I = Hauptanlage 120,00 m² + der Hauptanlage zugerechnete Flächen 15,00 m² = 135,00 m²'], ['GRZ I = GR I / FGst = 135,00 m² / 600,00 m² = 0,225']],
        },
      ],
    },
    {
      art: 'sammlung',
      name: 'teil',
      titel: 'Rechenweg: Teilflächen',
      datensatz: 'je Teilfläche',
      text: 'Zerlegung der Flächen in Rechtecke und Dreiecke (Länge × Breite × Faktor); ohne Zerlegung die Fläche aus Koordinaten × 1 × 1. H = Hauptanlage.',
      felder: [
        { name: 'flaeche_nr', text: 'Nummer der Fläche (H = Hauptanlage, sonst wie lageplan.nr)' },
        { name: 'flaeche_name', text: 'Name der Fläche' },
        { name: 'name', text: 'Teilfläche, z. B. „1.2 Rechteck“' },
        { name: 'art', text: '„Rechteck“, „Dreieck“ oder „Koordinaten“' },
        { name: 'laenge', text: 'Länge bzw. Grundseite', einheit: 'm' },
        { name: 'breite', text: 'Breite bzw. Höhe', einheit: 'm' },
        { name: 'faktor', text: '1 beim Rechteck, 0,5 beim Dreieck' },
        { name: 'flaeche', text: 'Fläche', einheit: 'm²' },
      ],
      filter: [],
      enthaelt: [],
      hinweise: ['Teilflächen sind nicht mit lageplan verknüpft: im Block {{#lageplan}} laufen alle Teilflächen – zuordnen über teil[flaeche_nr=…].'],
      beispiele: [
        {
          titel: 'Teilflächen der Hauptanlage mit Formel',
          vorlage: [['{{teil[flaeche_nr=H].name}}', '{{teil[flaeche_nr=H].laenge}}', '{{teil[flaeche_nr=H].breite}}', '{{teil[flaeche_nr=H].faktor}}', '=B1*C1*D1']],
          ergebnis: [['H.1 Rechteck', 12, 10, 1, '=B1*C1*D1']],
        },
      ],
    },
    GLOBAL_GRUPPE,
  ],
};
