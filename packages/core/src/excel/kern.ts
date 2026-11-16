import type { Beispiel } from './schema';

/**
 * Gemeinsame Syntax der Excel-Vorlagen (alle Apps) – Quelle für die Referenz im Excel-Dialog und den Abschnitt
 * „Syntax“ in docs/excel-vorlagen.md. Jedes Beispiel läuft im Test gegen die echte Engine (kern.test.ts).
 * Beschrieben ist das tatsächliche Verhalten, auch wo es überrascht (Abschnitt „Randfälle“).
 */

export interface Thema {
  id: string;
  titel: string;
  absaetze: string[];
  /** Tabelle: erste Zeile ist der Kopf */
  tabelle?: string[][];
  beispiele?: Beispiel[];
}

export const KERN_BEISPIELDATEN =
  'Beispieldaten: Projekt „Musterhaus“; Geschosse EG (Wohnfläche 21 m²), OG (6 m²), DG (0 m²); Räume Flur 3 m² und Küche 18 m² (EG, Wohnung WE 1), Abstellraum 2 m² (EG), Bad 6 m² (OG, WE 2), Spitzboden 10 m² (DG) – Abstellraum und Spitzboden ohne Wohnflächenanrechnung; Exportdatum 16.11.2026.';

export const KERN_THEMEN: Thema[] = [
  {
    id: 'schreibweise',
    titel: 'Schreibweise und Arten',
    absaetze: [
      'Platzhalter stehen in doppelten geschweiften Klammern: {{projekt.name}}. Leerzeichen sind nur außen erlaubt ({{ summe.bgf }}), nicht innerhalb des Namens.',
      'Es gibt drei Arten: Einzelwerte ({{summe.bgf}}) gelten für das ganze Projekt. Sammlungen sind Datensätze ({{raum.name}}): eine Zeile mit einem Feld einer Sammlung wird je Datensatz wiederholt. Der benannte Einzelzugriff ({{geschoss:EG.bgf}}) liest ein Feld eines bestimmten Datensatzes über seinen Namen.',
      'Steht in einer Zelle nur ein Platzhalter, wird der Wert als Zahl eingetragen – das Zahlenformat der Vorlagenzelle bleibt erhalten und Excel rechnet damit weiter. Im Fließtext werden Zahlen deutsch geschrieben (bis 3 Nachkommastellen, in Kopf-/Fußzeilen und Textfeldern bis 2).',
      'Unbekannte Einzelwerte bleiben sichtbar stehen, damit Tippfehler auffallen. Ein unbekanntes Feld einer Sammlung ({{raum.foo}}) und ein unbekannter Name beim Einzelzugriff ({{geschoss:XY.bgf}}) ergeben dagegen eine leere Zelle – die Vorlagenprüfung meldet beides.',
    ],
    tabelle: [
      ['Schreibweise', 'Art', 'Wirkung'],
      ['{{projekt.name}}', 'Einzelwert', 'Wert an dieser Stelle'],
      ['{{raum.name}}', 'Sammlung', 'Zeile wird je Raum wiederholt'],
      ['{{raum[wofl].name}}', 'Sammlung mit Filter', 'nur Datensätze, die den Filter erfüllen'],
      ['{{#geschoss}} … {{/geschoss}}', 'Block einer Sammlung', 'Zeilenblock wird je Geschoss wiederholt'],
      ['{{geschoss:EG.bgf}}', 'Benannter Einzelzugriff', 'Feld des Geschosses „EG“'],
      ['{{#wenn …}} … {{/wenn}}', 'Bedingung', 'Zeilen nur, wenn die Bedingung zutrifft'],
      ['{{geschoss.name|einmal}}', 'Zusatz', 'nur in der ersten Zeile einer Wiederholung'],
      ['{{raum.wohnung|vor: - }}', 'Zusatz', 'Text davor (bzw. |nach: dahinter), nur wenn der Wert nicht leer ist'],
      ['{{DATUM:TT.MM.JJJJ}}', 'globale Variable mit Format', 'Datum im angegebenen Format'],
    ],
    beispiele: [
      {
        titel: 'Einzelwerte im Text und als Zahl',
        vorlage: [['Projekt: {{projekt.name}}', '{{summe.wofl}}', 'Wohnfläche {{summe.wofl}} m²']],
        ergebnis: [['Projekt: Musterhaus', 27, 'Wohnfläche 27 m²']],
      },
      {
        titel: 'Benannter Einzelzugriff',
        pruefung: ['name'],
        text: 'Ein unbekannter Name ergibt eine leere Zelle.',
        vorlage: [['{{geschoss:EG.wofl}}', '{{geschoss:XY.wofl}}']],
        ergebnis: [[21, null]],
      },
    ],
  },
  {
    id: 'nutzbar',
    titel: 'Wo was nutzbar ist',
    absaetze: [
      'Die Tabelle gilt für alle Apps und ist im Test gegen jeden beschriebenen Platzhalter geprüft. In Kopf-/Fußzeilen und Textfeldern werden nur Einzelwerte und der benannte Einzelzugriff ersetzt – keine Sammlungen, keine Blöcke, keine Bedingungen, kein |einmal (sie bleiben dort als Text stehen).',
    ],
    tabelle: [
      ['', 'Einzelwert', 'Sammlung', 'Benannter Einzelzugriff'],
      ['Zelle', 'ja', 'ja – die Zeile wird wiederholt', 'ja'],
      ['Block {{#…}}', 'nein', 'ja', 'nein'],
      ['Bedingung {{#wenn}}', 'ja', 'ja', 'ja'],
      ['Kopf-/Fußzeile', 'ja', 'nein', 'ja'],
      ['Textfeld/Form', 'ja', 'nein', 'ja'],
      ['Benannte Filter [wofl]', 'nein', 'ja (je Sammlung verschieden)', 'nein'],
      ['Allgemeine Filter [feld=wert]', 'nein', 'ja (jede Sammlung)', 'nein'],
    ],
  },
  {
    id: 'wiederholung',
    titel: 'Wiederholte Zeilen',
    absaetze: [
      'Enthält eine Zeile ein Feld einer Sammlung, wird sie je Datensatz wiederholt; Einzelwerte in derselben Zeile stehen in jeder Wiederholung.',
      'Regel: eine ungebundene Sammlung je Zeile. Wiederholt wird nur die erste, die in der Zeile vorkommt; Felder einer zweiten, nicht gebundenen Sammlung bleiben als Text stehen (die Vorlagenprüfung meldet das). Für Werte einer zweiten Sammlung einen Block verwenden.',
      'Ein Filter gilt für die ganze Zeile. Stehen mehrere verschiedene Filter derselben Sammlung in einer Zeile, müssen alle zutreffen.',
      'Liefert eine Wiederholungszeile außerhalb von Blöcken keinen Datensatz, bleibt eine leere Zeile stehen (das Layout bleibt erhalten); innerhalb eines Blocks entfällt sie.',
    ],
    beispiele: [
      {
        titel: 'Zeile je Raum',
        vorlage: [['{{raum.geschoss}}', '{{raum.name}}', '{{raum.flaeche}}']],
        ergebnis: [
          ['EG', 'Flur', 3],
          ['EG', 'Küche', 18],
          ['EG', 'Abstellraum', 2],
          ['OG', 'Bad', 6],
          ['DG', 'Spitzboden', 10],
        ],
      },
      {
        titel: 'Ein Filter gilt für die ganze Zeile',
        vorlage: [['{{raum.name}}', '{{raum[wofl].flaeche}}']],
        ergebnis: [
          ['Flur', 3],
          ['Küche', 18],
          ['Bad', 6],
        ],
      },
      {
        titel: 'Nur die erste Sammlung einer Zeile wiederholt',
        pruefung: ['zweite-sammlung'],
        vorlage: [['{{raum.name}}', '{{geschoss.name}}']],
        ergebnis: [
          ['Flur', '{{geschoss.name}}'],
          ['Küche', '{{geschoss.name}}'],
          ['Abstellraum', '{{geschoss.name}}'],
          ['Bad', '{{geschoss.name}}'],
          ['Spitzboden', '{{geschoss.name}}'],
        ],
      },
    ],
  },
  {
    id: 'bloecke',
    titel: 'Blöcke',
    absaetze: [
      '{{#geschoss}} … {{/geschoss}} wiederholt die Zeilen dazwischen je Datensatz. Die Markierung steht allein in einer Zeile (diese Steuerzeile erscheint nicht in der Ausgabe) oder am Anfang der ersten bzw. am Ende der letzten Blockzeile. Sie gilt immer für die ganze Zeile – mitten im Text einer Zelle wirkt sie nicht „ab hier“.',
      'Regeln: je Zeile ein Blockanfang (bei zwei gilt nur der letzte); ein Blockende schließt den zuletzt geöffneten Block, ohne den Namen zu prüfen – Anfang und Ende müssen also paarweise zusammenpassen. Die Vorlagenprüfung meldet beides.',
      'Innerhalb des Blocks sind die Felder des Blockdatensatzes Einzelwerte ({{geschoss.name}} wiederholt dort nichts). Andere Sammlungen sind auf den Datensatz eingeschränkt, wenn die App das so festlegt – welche, steht je Sammlung unter „Enthält“. Alle übrigen laufen über alle Datensätze.',
      'Blöcke lassen sich verschachteln. Derselbe Block innerhalb seiner selbst liefert nur denselben Datensatz.',
      'Ein Block nimmt Filter wie eine Zeile: {{#geschoss[name!=DG]}}.',
      'Leere Blöcke entfallen mit allen Zeilen: Enthält der Block Wiederholungszeilen oder innere Blöcke, entfällt er, wenn keine davon einen Datensatz liefert. Sonst entfällt er, wenn alle Zahlenwerte des Blockdatensatzes 0 sind; laufende Nummern (nr, kg) zählen nicht, Blöcke ganz ohne Zahlenwerte bleiben stehen.',
      'Ein nicht geschlossener Block läuft bis zum Blattende; ein Ende ohne Anfang wird ignoriert (beides meldet die Vorlagenprüfung). Unbekannte Blocknamen ({{#foo}}) bleiben als Text stehen.',
    ],
    beispiele: [
      {
        titel: 'Block je Geschoss mit Zwischensumme',
        text: 'Die Formel =SUM(C2:C2) wird je Geschoss auf dessen Raumzeilen erweitert. Das DG hat keine Wohnflächen-Räume und entfällt ganz.',
        vorlage: [['{{#geschoss}}'], ['{{geschoss.name}}'], [null, '{{raum[wofl].name}}', '{{raum[wofl].flaeche}}'], [null, 'Summe', '=SUM(C3:C3)'], ['{{/geschoss}}']],
        ergebnis: [
          ['EG', null, null],
          [null, 'Flur', 3],
          [null, 'Küche', 18],
          [null, 'Summe', '=SUM(C2:C3)'],
          ['OG', null, null],
          [null, 'Bad', 6],
          [null, 'Summe', '=SUM(C6:C6)'],
        ],
      },
      {
        titel: 'Block mit Filter, Markierungen in Inhaltszeilen',
        vorlage: [['{{#geschoss[name!=DG]}}{{geschoss.name}}', '{{geschoss.wofl}}{{/geschoss}}']],
        ergebnis: [
          ['EG', 21],
          ['OG', 6],
        ],
      },
    ],
  },
  {
    id: 'filter',
    titel: 'Filter',
    absaetze: [
      'Filter stehen in eckigen Klammern direkt hinter dem Namen einer Sammlung – in Zeilen ({{raum[wofl].name}}), an Blöcken ({{#geschoss[dg]}}) und in Bedingungen ({{#wenn raum[nebenflaeche]}}). An Einzelwerten ({{summe[wofl].bgf}}) und am benannten Einzelzugriff wirken sie nicht: Einzelwerte bleiben dann als Text stehen, der Einzelzugriff wird leer. Ausnahme: {{#wenn [filter]}} prüft den umgebenden Datensatz bzw. auf oberster Ebene die Projektsummen summe.*.',
      'Benannte Filter legt jede App je Sammlung fest (siehe dort). Allgemeine Filter gehen bei jeder Sammlung mit jedem Feld.',
      'Mehrere Filter mit Komma müssen alle zutreffen (und); ein „oder“ gibt es nicht. Werte dürfen deshalb kein Komma und keine eckige Klammer enthalten. Im Filter steht nur der Feldname ohne Sammlung: [wohnung!=], nicht [raum.wohnung!=].',
      'Ein unbekannter benannter Filter (Tippfehler) trifft nie zu: die Zeile liefert keine Datensätze, eine Bedingung ist nicht erfüllt – die Vorlagenprüfung meldet ihn. Ein Filter an einer Sammlung, die im Block schon gebunden ist (im {{#raum}}-Block {{raum[wofl].name}}), wirkt als Bedingung auf deren Datensatz: erfüllt er sie nicht, bleibt die Zelle leer.',
    ],
    tabelle: [
      ['Filter', 'trifft zu, wenn'],
      ['[wofl]', 'der benannte Filter der App zutrifft'],
      ['[feld=wert]', 'das Feld den Wert hat – Zahlen numerisch (Komma oder Punkt), Text ohne Groß-/Kleinschreibung'],
      ['[feld!=wert]', 'das Feld den Wert nicht hat'],
      ['[feld>wert], [feld<wert], [feld>=wert], [feld<=wert]', 'Zahlenvergleich; leere Felder zählen als 0, Text ist nie größer oder kleiner'],
      ['[!filter]', 'der Filter nicht zutrifft, z. B. [!wofl], [!geschoss=EG]'],
      ['[a,b,c]', 'alle Filter zutreffen'],
    ],
    beispiele: [
      {
        titel: 'Allgemeine Filter kombiniert',
        vorlage: [['{{raum[geschoss=EG,flaeche>=3].name}}', '{{raum[geschoss=EG,flaeche>=3].flaeche}}']],
        ergebnis: [
          ['Flur', 3],
          ['Küche', 18],
        ],
      },
      {
        titel: 'Verneinung',
        vorlage: [['{{raum[!wofl].name}}']],
        ergebnis: [['Abstellraum'], ['Spitzboden']],
      },
      {
        titel: 'Unbekannter Filter liefert keine Datensätze',
        pruefung: ['filter'],
        text: 'Außerhalb von Blöcken bleibt eine leere Zeile stehen.',
        vorlage: [['{{raum[tippfehler].name}}']],
        ergebnis: [[null]],
      },
      {
        titel: 'Filter an der gebundenen Sammlung wirkt als Bedingung',
        vorlage: [['{{#raum[geschoss=EG]}}{{raum.name}}', '{{raum[wofl].flaeche}}{{/raum}}']],
        ergebnis: [
          ['Flur', 3],
          ['Küche', 18],
          ['Abstellraum', null],
        ],
      },
      {
        titel: 'Filter an einem Einzelwert wirkt nicht',
        pruefung: ['einzelwert'],
        vorlage: [['{{summe[wofl].flaeche}}']],
        ergebnis: [['{{summe[wofl].flaeche}}']],
      },
    ],
  },
  {
    id: 'wenn',
    titel: 'Bedingungen {{#wenn}}',
    absaetze: [
      '{{#wenn BEDINGUNG}} … {{/wenn}} gibt die Zeilen dazwischen einmal aus, wenn die Bedingung zutrifft, sonst entfallen sie. Ein Bedingungsblock bindet keinen Datensatz und kann in anderen Blöcken stehen; dort gilt die Bedingung für den jeweiligen Datensatz.',
      'Die Markierungen stehen allein in einer Zeile oder am Anfang bzw. Ende einer Inhaltszeile; je Zeile nur ein Anfang. Formeln, die auf entfallene Zeilen verweisen, rechnen dort mit 0.',
      'Eine unbekannte Bedingung gilt als nicht erfüllt, ebenso eine mit unbekanntem Filter ({{#wenn raum[tippfehler]}}). Die Vorlagenprüfung meldet beides.',
      '{{#wenn [filter]}} ohne Sammlung prüft den umgebenden Datensatz – auf oberster Ebene die Projektsummen summe.* (ohne „summe.“ geschrieben: [wofl>0]). {{#wenn sammlung[filter]}} prüft dagegen, ob mindestens ein passender Datensatz existiert. Benannte Filter wie wofl oder s prüfen Felder der Datensätze (z. B. raum.wohnflaeche) und treffen bei den Summen nie zu.',
    ],
    tabelle: [
      ['Bedingung', 'trifft zu, wenn'],
      ['raum, raum[nebenflaeche]', 'die Sammlung (mit Filter) mindestens einen Datensatz hat'],
      ['summe.wofl, geschoss:EG.wofl, projekt.name', 'der Wert nicht 0, nicht leer und nicht „nein“, „0“ oder „false“ ist'],
      ['raum[wofl].wohnung', 'das Feld bei mindestens einem Datensatz gefüllt ist'],
      ['summe.wofl>100, projekt.code=2417', 'der Vergleich zutrifft (= != > < >= <=)'],
      ['raum[wofl]>=3', 'die Sammlung mindestens so viele Datensätze hat (Anzahl)'],
      ['raum.flaeche>20', 'mindestens ein Datensatz den Vergleich erfüllt'],
      ['[wofl>0], [dg]', 'der umgebende Datensatz den Filter erfüllt – auf oberster Ebene die Projektsummen summe.*'],
      ['!raum[nebenflaeche]', 'umgekehrt'],
    ],
    beispiele: [
      {
        titel: 'Abschnitt nur, wenn es Datensätze gibt',
        vorlage: [
          ['{{#wenn raum[nebenflaeche]}}Flächen ohne Wohnflächenanrechnung'],
          [null, '{{raum[nebenflaeche].name}}', '{{raum[nebenflaeche].flaeche}}'],
          ['{{/wenn}}'],
          ['{{#wenn !raum[nebenflaeche]}}keine Flächen ohne Wohnflächenanrechnung{{/wenn}}'],
        ],
        ergebnis: [
          ['Flächen ohne Wohnflächenanrechnung', null, null],
          [null, 'Abstellraum', 2],
          [null, 'Spitzboden', 10],
        ],
      },
      {
        titel: 'Bedingung je Datensatz im Block',
        vorlage: [['{{#geschoss}}{{geschoss.name}}'], ['{{#wenn [wofl>0]}}mit Wohnfläche{{/wenn}}'], ['{{#wenn raum>=2}}mehrere Räume{{/wenn}}'], ['{{/geschoss}}']],
        ergebnis: [['EG'], ['mit Wohnfläche'], ['mehrere Räume'], ['OG'], ['mit Wohnfläche'], ['DG']],
      },
    ],
  },
  {
    id: 'fehler',
    titel: 'Häufige Fehler',
    absaetze: [
      '{{#wenn[wofl,s!=0]}} soll heißen „nur, wenn es Wohnfläche im Sonderfall gibt“, ist auf oberster Ebene aber nie erfüllt: [wofl] prüft das Raumfeld wohnflaeche, das die Projektsummen nicht haben, und s!=0 vergleicht ein Feld „s“, das es nicht gibt – s ist ein benannter Filter und wird ohne Vergleich geschrieben. Richtig: {{#wenn raum[wofl,s]}} (mindestens ein Raum mit Wohnfläche im Sonderfall) bzw. für eine Summe {{#wenn[nrf_s!=0]}}.',
      'Doppelte oder fehlende eckige Klammern ({{raum[[wofl].name}}) machen den Platzhalter unlesbar – er bleibt als Text stehen.',
      'Text nur bei gefülltem Wert: nicht {{raum.name}}{{#wenn[wohnung!=]}} - {{raum.wohnung}}{{/wenn}} – Blockmarkierungen gelten für ganze Zeilen –, sondern {{raum.name}}{{raum.wohnung|vor: - }}.',
      'Feldnamen klein schreiben ({{raum.name}}, nicht {{raum.Name}}) und ohne Leerzeichen im Namen. Die Vorlagenprüfung schlägt die richtige Schreibweise vor.',
    ],
    beispiele: [
      {
        titel: 'Umgebender Datensatz gegenüber Sammlung',
        pruefung: ['filterfelder'],
        vorlage: [
          ['{{#wenn[wofl]}}nie (Summen haben kein Feld wohnflaeche){{/wenn}}'],
          ['{{#wenn raum[wofl]}}Räume mit Wohnfläche vorhanden{{/wenn}}'],
          ['{{#wenn[wofl>0]}}Wohnfläche gesamt > 0{{/wenn}}'],
        ],
        ergebnis: [['Räume mit Wohnfläche vorhanden'], ['Wohnfläche gesamt > 0']],
      },
    ],
  },
  {
    id: 'pruefung',
    titel: 'Vorlagenprüfung',
    absaetze: [
      'Beim Export mit eigener Vorlage – und mit „Vorlage prüfen“ im Excel-Dialog – meldet die App mögliche Tippfehler mit Blatt und Zelle. Die Prüfung meldet nur; die Ausgabe ändert sich dadurch nicht.',
    ],
    tabelle: [
      ['Hinweis', 'Beispiel'],
      ['unbekannter benannter Filter', '{{raum[wolf].name}}'],
      ['benannter Filter, dessen Felder im Zusammenhang fehlen', '{{#wenn[wofl]}} auf oberster Ebene'],
      ['Vergleich auf ein Feld, das es nicht gibt (auch: Filtername mit Vergleich)', '{{#wenn[s!=0]}}'],
      ['unbekanntes Feld einer Sammlung bzw. unbekannter Name beim Einzelzugriff', '{{raum.flache}}, {{geschoss:XY.bgf}}'],
      ['falsche Groß-/Kleinschreibung oder Leerzeichen im Namen', '{{raum.Name}}, {{ raum . name }}'],
      ['unbekannter Zusatz', '{{raum.name|eimal}}'],
      ['Punkt in einem Filterfeld', '{{#wenn[hnf.wohnung!=0]}}'],
      ['zwei Blockanfänge in einer Zeile', '{{#geschoss}} … {{#wenn …}} in derselben Zeile'],
      ['Blockende schließt einen anderen offenen Block', '{{#wenn …}} … {{/geschoss}}'],
      ['Blockmarkierung mitten im Text einer Zelle (gilt für die ganze Zeile)', '{{raum.name}}{{#wenn …}} - {{raum.wohnung}}{{/wenn}}'],
      ['zweite ungebundene Sammlung in einer Zeile', '{{raum.name}} … {{geschoss.name}}'],
      ['nicht geschlossener bzw. verwaister Block', '{{#geschoss}} ohne {{/geschoss}}'],
      ['doppelte oder unpaarige eckige Klammern', '{{raum[[wofl].name}}'],
      ['|einmal oder Sammlungsfeld in Kopf-/Fußzeile oder Textfeld', '{{raum.name}} in der Fußzeile'],
      ['unbekannter Einzelwert (bleibt stehen)', '{{summe.bfg}}'],
    ],
  },
  {
    id: 'zusaetze',
    titel: 'Zusätze |einmal, |vor:, |nach:',
    absaetze: [
      '{{feld|einmal}} schreibt den Wert nur in die erste Zeile einer Wiederholung – etwa den Geschossnamen über seinen Räumen. In Zeilen, die nicht wiederholt werden, wirkt er nicht (der Wert steht in jeder Blockwiederholung). In Kopf-/Fußzeilen und Textfeldern geht |einmal nicht.',
      '{{feld|vor:TEXT}} und {{feld|nach:TEXT}} setzen Text vor bzw. hinter den Wert – nur, wenn der Wert nicht leer ist. Leerzeichen im Text bleiben erhalten: {{raum.name}}{{raum.wohnung|vor: - }} ergibt „Flur - WE 1“, bei einem Raum ohne Wohnung nur „Abstellraum“. Beide gehen zusammen ({{feld|vor:(|nach:)}}), auch in Kopf-/Fußzeilen und Textfeldern. Mit Text davor oder danach wird eine Zahl zu Text.',
      'Ein unbekannter Zusatz ({{raum.name|foo}}) wird in Zellen ignoriert, in Kopf-/Fußzeilen und Textfeldern bleibt der Platzhalter dann stehen; die Vorlagenprüfung meldet ihn.',
    ],
    beispiele: [
      {
        titel: 'Wohnung nur, wenn zugeordnet',
        vorlage: [['{{raum.name}}{{raum.wohnung|vor: - }}', '{{raum.flaeche|nach: m²}}']],
        ergebnis: [
          ['Flur - WE 1', '3 m²'],
          ['Küche - WE 1', '18 m²'],
          ['Abstellraum', '2 m²'],
          ['Bad - WE 2', '6 m²'],
          ['Spitzboden', '10 m²'],
        ],
      },
      {
        titel: 'Geschossname nur einmal',
        vorlage: [['{{#geschoss}}{{geschoss.name|einmal}}', '{{raum.name}}{{/geschoss}}']],
        ergebnis: [
          ['EG', 'Flur'],
          [null, 'Küche'],
          [null, 'Abstellraum'],
          ['OG', 'Bad'],
          ['DG', 'Spitzboden'],
        ],
      },
    ],
  },
  {
    id: 'kopf',
    titel: 'Kopf-/Fußzeilen und Textfelder',
    absaetze: [
      'In Kopf- und Fußzeilen (Seite einrichten) sowie in Textfeldern und Formen werden Einzelwerte, globale Variablen (auch mit Format) und der benannte Einzelzugriff ersetzt. Sammlungsfelder, Blöcke, Bedingungen und |einmal bleiben dort als Text stehen. „&“ in eingesetzten Werten wird in Kopf-/Fußzeilen verdoppelt, damit Excel es nicht als Steuerzeichen liest.',
    ],
  },
  {
    id: 'global',
    titel: 'Datum mit Format (globale Variablen)',
    absaetze: [
      'Die globalen Variablen der Suite (PROJEKT_KUERZEL, PROJEKT_KURZNAME, PROJEKT_VORHABEN, BEARBEITER, DATUM, JAHR, JAHR_KURZ) sind dieselben wie in Datei- und Ordnernamen (docs/platzhalter.md). Datum und Jahr gehen mit Format: {{DATUM:TT.MM.JJJJ}}, {{JAHR:JJ}} – in Zellen, Kopf-/Fußzeilen und Textfeldern.',
    ],
    beispiele: [
      {
        titel: 'Datum mit Format',
        vorlage: [['{{DATUM:TT.MM.JJJJ}}', 'Stand {{DATUM:TT.MM.JJJJ}}', '{{JAHR:JJ}}']],
        ergebnis: [['16.11.2026', 'Stand 16.11.2026', '26']],
      },
    ],
  },
  {
    id: 'formeln',
    titel: 'Formeln',
    absaetze: [
      'Formeln der Vorlage bleiben erhalten und werden auf die erzeugten Zeilen umgeschrieben: ein Bezug auf die eigene Zeile zeigt auf die eigene Ausgabezeile, ein Bezug auf eine Zeile im selben Block auf die Zeile derselben Blockwiederholung. Bereiche über Vorlagenzeilen umfassen alle daraus erzeugten Zeilen – zusammenhängend als C11:C17, sonst als Liste D13,D21,D29, damit eine Gesamtsumme über Zwischensummen keine Einzelwerte derselben Spalte mitzählt. Bezüge auf Zeilen darunter rutschen mit; ein Bezug auf eine Zeile ohne Ausgabe wird 0.',
      'Die Ergebnisse werden beim Export mitberechnet (Grundrechenarten, SUMME, RUNDEN, AUFRUNDEN, ABRUNDEN, ABS, MIN, MAX, MITTELWERT, ANZAHL, WENN), damit auch Vorschauen und LibreOffice Werte zeigen; Excel rechnet beim Öffnen neu. Bezüge aus anderen Blättern auf ein Blatt mit Wiederholungen werden nicht angepasst – dafür Einzelwerte oder den benannten Einzelzugriff verwenden.',
    ],
    beispiele: [
      {
        titel: 'Gesamtsumme über Zwischensummen',
        vorlage: [['{{#geschoss}}{{geschoss.name|einmal}}', '{{raum.flaeche}}'], [null, '=SUM(B1:B1)'], ['{{/geschoss}}'], ['Gesamt', '=SUM(B2:B2)']],
        ergebnis: [
          ['EG', 3],
          [null, 18],
          [null, 2],
          [null, '=SUM(B1:B3)'],
          ['OG', 6],
          [null, '=SUM(B5:B5)'],
          ['DG', 10],
          [null, '=SUM(B7:B7)'],
          ['Gesamt', '=SUM(B4,B6,B8)'],
        ],
      },
    ],
  },
  {
    id: 'randfaelle',
    titel: 'Groß-/Kleinschreibung und Randfälle',
    absaetze: [
      'Namen von Sammlungen sind unabhängig von Groß-/Kleinschreibung ({{RAUM.name}} geht), Einzelwerte und Feldnamen nicht ({{Summe.bgf}} bleibt stehen, {{raum.Name}} wird leer). Filterwerte vergleichen ohne Groß-/Kleinschreibung.',
      'Felder, die mit „_“ beginnen, sind intern und werden nicht ausgegeben.',
      'Zahlen im Fließtext einer Zelle: bis 3 Nachkommastellen; in Kopf-/Fußzeilen und Textfeldern bis 2. Steht der Platzhalter allein in der Zelle, wird die Zahl unverändert eingetragen und das Zahlenformat der Zelle bestimmt die Anzeige.',
    ],
    beispiele: [
      {
        titel: 'Unbekanntes Feld einer Sammlung wird leer',
        pruefung: ['feld', 'einzelwert'],
        vorlage: [['{{raum[geschoss=OG].name}}', '{{raum[geschoss=OG].foo}}', '{{summe.foo}}']],
        ergebnis: [['Bad', null, '{{summe.foo}}']],
      },
    ],
  },
];
