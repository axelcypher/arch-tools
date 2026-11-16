# Excel-Vorlagen

Der Excel-Export (Schaltfläche **Excel**) erzeugt entweder das Standardlayout oder füllt eine eigene
Vorlage. Eine Vorlage ist eine normale `.xlsx`-Datei – mit Logo, Kopf, Schriften, Rahmen, Zahlenformaten
und eigenen Formeln – in die Platzhalter geschrieben werden. Sie wird im Projekt gespeichert (und im
Projektarchiv `.oap` mitgenommen) und zusätzlich in der Anwendung als Standard für weitere Projekte
hinterlegt. QUADRIO, TERRIO und NUMIO nutzen dieselbe Vorlagen-Engine; jede App speichert ihre Vorlage getrennt.

Im Excel-Dialog unter **Eigene Vorlage**:

- **Platzhalter-Referenz …** – alle Platzhalter der App, durchsuchbar und nach Gruppen gegliedert: Art (Einzelwert,
  Sammlung, benannter Einzelzugriff), wo sie nutzbar sind, Felder, Filter, „Enthält“ und Beispiele mit Ergebnis;
  Platzhalter und Beispielvorlagen lassen sich kopieren.
- **Vorlage prüfen** – meldet mögliche Tippfehler mit Blatt und Zelle (siehe „Vorlagenprüfung“). Nach einem Export
  mit Vorlage erscheinen die Hinweise ebenfalls.
- **Muster-Vorlage herunterladen** – Beispieldatei mit allen Techniken und dem Blatt „Platzhalter“.

Die Abschnitte „Syntax“ und die Platzhalter je App sind **aus dem Schema der Apps erzeugt**
(`packages/core/src/excel/kern.ts`, `apps/*/…/platzhalterSchema.ts`) – dieselbe Quelle wie Referenz und Muster-Blatt.
Jedes Beispiel läuft als Test gegen die echte Engine; ein Vollständigkeitstest vergleicht Schema und erzeugte Daten.
Nach einer Änderung am Schema: `node scripts/excel-doku.mjs` (die Tests in `npm test` prüfen, dass diese Datei
aktuell ist).

## Syntax (alle Apps)

<!-- erzeugt:kern – nicht von Hand ändern, scripts/excel-doku.mjs -->

_Beispieldaten: Projekt „Musterhaus“; Geschosse EG (Wohnfläche 21 m²), OG (6 m²), DG (0 m²); Räume Flur 3 m², Küche 18 m², Abstellraum 2 m² (EG), Bad 6 m² (OG), Spitzboden 10 m² (DG) – Abstellraum und Spitzboden ohne Wohnflächenanrechnung; Exportdatum 16.11.2026._

### Schreibweise und Arten

Platzhalter stehen in doppelten geschweiften Klammern: `{{projekt.name}}`. Leerzeichen sind nur außen erlaubt (`{{ summe.bgf }}`), nicht innerhalb des Namens.

Es gibt drei Arten: Einzelwerte (`{{summe.bgf}}`) gelten für das ganze Projekt. Sammlungen sind Datensätze (`{{raum.name}}`): eine Zeile mit einem Feld einer Sammlung wird je Datensatz wiederholt. Der benannte Einzelzugriff (`{{geschoss:EG.bgf}}`) liest ein Feld eines bestimmten Datensatzes über seinen Namen.

Steht in einer Zelle nur ein Platzhalter, wird der Wert als Zahl eingetragen – das Zahlenformat der Vorlagenzelle bleibt erhalten und Excel rechnet damit weiter. Im Fließtext werden Zahlen deutsch geschrieben (bis 3 Nachkommastellen, in Kopf-/Fußzeilen und Textfeldern bis 2).

Unbekannte Einzelwerte bleiben sichtbar stehen, damit Tippfehler auffallen. Ein unbekanntes Feld einer Sammlung (`{{raum.foo}}`) und ein unbekannter Name beim Einzelzugriff (`{{geschoss:XY.bgf}}`) ergeben dagegen eine leere Zelle – die Vorlagenprüfung meldet beides.

| Schreibweise | Art | Wirkung |
| --- | --- | --- |
| `{{projekt.name}}` | Einzelwert | Wert an dieser Stelle |
| `{{raum.name}}` | Sammlung | Zeile wird je Raum wiederholt |
| `{{raum[wofl].name}}` | Sammlung mit Filter | nur Datensätze, die den Filter erfüllen |
| `{{#geschoss}}` … `{{/geschoss}}` | Block einer Sammlung | Zeilenblock wird je Geschoss wiederholt |
| `{{geschoss:EG.bgf}}` | Benannter Einzelzugriff | Feld des Geschosses „EG“ |
| `{{#wenn …}}` … `{{/wenn}}` | Bedingung | Zeilen nur, wenn die Bedingung zutrifft |
| `{{geschoss.name\|einmal}}` | Zusatz | nur in der ersten Zeile einer Wiederholung |
| `{{DATUM:TT.MM.JJJJ}}` | globale Variable mit Format | Datum im angegebenen Format |

**Beispiel: Einzelwerte im Text und als Zahl**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `Projekt: {{projekt.name}}` | `{{summe.wofl}}` | `Wohnfläche {{summe.wofl}} m²` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | Projekt: Musterhaus | 27 | Wohnfläche 27 m² |

**Beispiel: Benannter Einzelzugriff** – Ein unbekannter Name ergibt eine leere Zelle. Die Vorlagenprüfung meldet hier: unbekannter Name beim Einzelzugriff.

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{geschoss:EG.wofl}}` | `{{geschoss:XY.wofl}}` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | 21 |  |

### Wo was nutzbar ist

Die Tabelle gilt für alle Apps und ist im Test gegen jeden beschriebenen Platzhalter geprüft. In Kopf-/Fußzeilen und Textfeldern werden nur Einzelwerte und der benannte Einzelzugriff ersetzt – keine Sammlungen, keine Blöcke, keine Bedingungen, kein |einmal (sie bleiben dort als Text stehen).

|  | Einzelwert | Sammlung | Benannter Einzelzugriff |
| --- | --- | --- | --- |
| Zelle | ja | ja – die Zeile wird wiederholt | ja |
| Block `{{#…}}` | nein | ja | nein |
| Bedingung `{{#wenn}}` | ja | ja | ja |
| Kopf-/Fußzeile | ja | nein | ja |
| Textfeld/Form | ja | nein | ja |
| Benannte Filter [wofl] | nein | ja (je Sammlung verschieden) | nein |
| Allgemeine Filter [feld=wert] | nein | ja (jede Sammlung) | nein |

### Wiederholte Zeilen

Enthält eine Zeile ein Feld einer Sammlung, wird sie je Datensatz wiederholt; Einzelwerte in derselben Zeile stehen in jeder Wiederholung.

Regel: eine ungebundene Sammlung je Zeile. Wiederholt wird nur die erste, die in der Zeile vorkommt; Felder einer zweiten, nicht gebundenen Sammlung bleiben als Text stehen (die Vorlagenprüfung meldet das). Für Werte einer zweiten Sammlung einen Block verwenden.

Ein Filter gilt für die ganze Zeile. Stehen mehrere verschiedene Filter derselben Sammlung in einer Zeile, müssen alle zutreffen.

Liefert eine Wiederholungszeile außerhalb von Blöcken keinen Datensatz, bleibt eine leere Zeile stehen (das Layout bleibt erhalten); innerhalb eines Blocks entfällt sie.

**Beispiel: Zeile je Raum**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{raum.geschoss}}` | `{{raum.name}}` | `{{raum.flaeche}}` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | EG | Flur | 3 |
| 2 | EG | Küche | 18 |
| 3 | EG | Abstellraum | 2 |
| 4 | OG | Bad | 6 |
| 5 | DG | Spitzboden | 10 |

**Beispiel: Ein Filter gilt für die ganze Zeile**

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{raum.name}}` | `{{raum[wofl].flaeche}}` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | Flur | 3 |
| 2 | Küche | 18 |
| 3 | Bad | 6 |

**Beispiel: Nur die erste Sammlung einer Zeile wiederholt** Die Vorlagenprüfung meldet hier: zweite ungebundene Sammlung in einer Zeile.

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{raum.name}}` | `{{geschoss.name}}` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | Flur | `{{geschoss.name}}` |
| 2 | Küche | `{{geschoss.name}}` |
| 3 | Abstellraum | `{{geschoss.name}}` |
| 4 | Bad | `{{geschoss.name}}` |
| 5 | Spitzboden | `{{geschoss.name}}` |

### Blöcke

`{{#geschoss}}` … `{{/geschoss}}` wiederholt die Zeilen dazwischen je Datensatz. Die Markierung steht allein in einer Zeile (diese Steuerzeile erscheint nicht in der Ausgabe) oder am Anfang der ersten bzw. am Ende der letzten Blockzeile.

Innerhalb des Blocks sind die Felder des Blockdatensatzes Einzelwerte (`{{geschoss.name}}` wiederholt dort nichts). Andere Sammlungen sind auf den Datensatz eingeschränkt, wenn die App das so festlegt – welche, steht je Sammlung unter „Enthält“. Alle übrigen laufen über alle Datensätze.

Blöcke lassen sich verschachteln. Derselbe Block innerhalb seiner selbst liefert nur denselben Datensatz.

Ein Block nimmt Filter wie eine Zeile: `{{#geschoss[name!=DG]}}`.

Leere Blöcke entfallen mit allen Zeilen: Enthält der Block Wiederholungszeilen oder innere Blöcke, entfällt er, wenn keine davon einen Datensatz liefert. Sonst entfällt er, wenn alle Zahlenwerte des Blockdatensatzes 0 sind; laufende Nummern (nr, kg) zählen nicht, Blöcke ganz ohne Zahlenwerte bleiben stehen.

Ein nicht geschlossener Block läuft bis zum Blattende; ein Ende ohne Anfang wird ignoriert (beides meldet die Vorlagenprüfung). Unbekannte Blocknamen (`{{#foo}}`) bleiben als Text stehen.

**Beispiel: Block je Geschoss mit Zwischensumme** – Die Formel =SUM(C2:C2) wird je Geschoss auf dessen Raumzeilen erweitert. Das DG hat keine Wohnflächen-Räume und entfällt ganz.

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{#geschoss}}` |  |  |
| 2 | `{{geschoss.name}}` |  |  |
| 3 |  | `{{raum[wofl].name}}` | `{{raum[wofl].flaeche}}` |
| 4 |  | `Summe` | `=SUM(C3:C3)` |
| 5 | `{{/geschoss}}` |  |  |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | EG |  |  |
| 2 |  | Flur | 3 |
| 3 |  | Küche | 18 |
| 4 |  | Summe | `=SUM(C2:C3)` |
| 5 | OG |  |  |
| 6 |  | Bad | 6 |
| 7 |  | Summe | `=SUM(C6:C6)` |

**Beispiel: Block mit Filter, Markierungen in Inhaltszeilen**

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{#geschoss[name!=DG]}}{{geschoss.name}}` | `{{geschoss.wofl}}{{/geschoss}}` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | EG | 21 |
| 2 | OG | 6 |

### Filter

Filter stehen in eckigen Klammern direkt hinter dem Namen einer Sammlung – in Zeilen (`{{raum[wofl].name}}`), an Blöcken (`{{#geschoss[dg]}}`) und in Bedingungen (`{{#wenn raum[nebenflaeche]}}`). An Einzelwerten (`{{summe[wofl].bgf}}`) und am benannten Einzelzugriff wirken sie nicht: Einzelwerte bleiben dann als Text stehen, der Einzelzugriff wird leer. Ausnahme: `{{#wenn [filter]}}` prüft den umgebenden Datensatz bzw. auf oberster Ebene die Projektsummen summe.*.

Benannte Filter legt jede App je Sammlung fest (siehe dort). Allgemeine Filter gehen bei jeder Sammlung mit jedem Feld.

Mehrere Filter mit Komma müssen alle zutreffen (und); ein „oder“ gibt es nicht. Werte dürfen deshalb kein Komma und keine eckige Klammer enthalten.

Ein unbekannter benannter Filter (Tippfehler) trifft nie zu: die Zeile liefert keine Datensätze, eine Bedingung ist nicht erfüllt – die Vorlagenprüfung meldet ihn. Ein Filter an einer Sammlung, die im Block schon gebunden ist (im `{{#raum}}`-Block `{{raum[wofl].name}}`), wirkt als Bedingung auf deren Datensatz: erfüllt er sie nicht, bleibt die Zelle leer.

| Filter | trifft zu, wenn |
| --- | --- |
| [wofl] | der benannte Filter der App zutrifft |
| [feld=wert] | das Feld den Wert hat – Zahlen numerisch (Komma oder Punkt), Text ohne Groß-/Kleinschreibung |
| [feld!=wert] | das Feld den Wert nicht hat |
| [feld>wert], [feld<wert], [feld>=wert], [feld<=wert] | Zahlenvergleich; leere Felder zählen als 0, Text ist nie größer oder kleiner |
| [!filter] | der Filter nicht zutrifft, z. B. [!wofl], [!geschoss=EG] |
| [a,b,c] | alle Filter zutreffen |

**Beispiel: Allgemeine Filter kombiniert**

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{raum[geschoss=EG,flaeche>=3].name}}` | `{{raum[geschoss=EG,flaeche>=3].flaeche}}` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | Flur | 3 |
| 2 | Küche | 18 |

**Beispiel: Verneinung**

Vorlage:

|  | A |
| --- | --- |
| 1 | `{{raum[!wofl].name}}` |

Ergebnis:

|  | A |
| --- | --- |
| 1 | Abstellraum |
| 2 | Spitzboden |

**Beispiel: Unbekannter Filter liefert keine Datensätze** – Außerhalb von Blöcken bleibt eine leere Zeile stehen. Die Vorlagenprüfung meldet hier: unbekannter benannter Filter.

Vorlage:

|  | A |
| --- | --- |
| 1 | `{{raum[tippfehler].name}}` |

Ergebnis:

|  | A |
| --- | --- |
| 1 |  |

**Beispiel: Filter an der gebundenen Sammlung wirkt als Bedingung**

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{#raum[geschoss=EG]}}{{raum.name}}` | `{{raum[wofl].flaeche}}{{/raum}}` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | Flur | 3 |
| 2 | Küche | 18 |
| 3 | Abstellraum |  |

**Beispiel: Filter an einem Einzelwert wirkt nicht** Die Vorlagenprüfung meldet hier: unbekannter Einzelwert.

Vorlage:

|  | A |
| --- | --- |
| 1 | `{{summe[wofl].flaeche}}` |

Ergebnis:

|  | A |
| --- | --- |
| 1 | `{{summe[wofl].flaeche}}` |

### Bedingungen {{#wenn}}

`{{#wenn BEDINGUNG}}` … `{{/wenn}}` gibt die Zeilen dazwischen einmal aus, wenn die Bedingung zutrifft, sonst entfallen sie. Ein Bedingungsblock bindet keinen Datensatz und kann in anderen Blöcken stehen; dort gilt die Bedingung für den jeweiligen Datensatz.

Die Markierungen stehen allein in einer Zeile oder am Anfang bzw. Ende einer Inhaltszeile; je Zeile nur ein Anfang. Formeln, die auf entfallene Zeilen verweisen, rechnen dort mit 0.

Eine unbekannte Bedingung gilt als nicht erfüllt, ebenso eine mit unbekanntem Filter (`{{#wenn raum[tippfehler]}}`). Die Vorlagenprüfung meldet beides.

`{{#wenn [filter]}}` ohne Sammlung prüft den umgebenden Datensatz – auf oberster Ebene die Projektsummen summe.* (ohne „summe.“ geschrieben: [wofl>0]). `{{#wenn sammlung[filter]}}` prüft dagegen, ob mindestens ein passender Datensatz existiert. Benannte Filter wie wofl oder s prüfen Felder der Datensätze (z. B. raum.wohnflaeche) und treffen bei den Summen nie zu.

| Bedingung | trifft zu, wenn |
| --- | --- |
| raum, raum[nebenflaeche] | die Sammlung (mit Filter) mindestens einen Datensatz hat |
| summe.wofl, geschoss:EG.wofl, projekt.name | der Wert nicht 0, nicht leer und nicht „nein“, „0“ oder „false“ ist |
| raum[wofl].wohnung | das Feld bei mindestens einem Datensatz gefüllt ist |
| summe.wofl>100, projekt.code=2417 | der Vergleich zutrifft (= != > < >= <=) |
| raum[wofl]>=3 | die Sammlung mindestens so viele Datensätze hat (Anzahl) |
| raum.flaeche>20 | mindestens ein Datensatz den Vergleich erfüllt |
| [wofl>0], [dg] | der umgebende Datensatz den Filter erfüllt – auf oberster Ebene die Projektsummen summe.* |
| !raum[nebenflaeche] | umgekehrt |

**Beispiel: Abschnitt nur, wenn es Datensätze gibt**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{#wenn raum[nebenflaeche]}}Flächen ohne Wohnflächenanrechnung` |  |  |
| 2 |  | `{{raum[nebenflaeche].name}}` | `{{raum[nebenflaeche].flaeche}}` |
| 3 | `{{/wenn}}` |  |  |
| 4 | `{{#wenn !raum[nebenflaeche]}}keine Flächen ohne Wohnflächenanrechnung{{/wenn}}` |  |  |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | Flächen ohne Wohnflächenanrechnung |  |  |
| 2 |  | Abstellraum | 2 |
| 3 |  | Spitzboden | 10 |

**Beispiel: Bedingung je Datensatz im Block**

Vorlage:

|  | A |
| --- | --- |
| 1 | `{{#geschoss}}{{geschoss.name}}` |
| 2 | `{{#wenn [wofl>0]}}mit Wohnfläche{{/wenn}}` |
| 3 | `{{#wenn raum>=2}}mehrere Räume{{/wenn}}` |
| 4 | `{{/geschoss}}` |

Ergebnis:

|  | A |
| --- | --- |
| 1 | EG |
| 2 | mit Wohnfläche |
| 3 | mehrere Räume |
| 4 | OG |
| 5 | mit Wohnfläche |
| 6 | DG |

### Häufige Fehler

`{{#wenn[wofl,s!=0]}}` soll heißen „nur, wenn es Wohnfläche im Sonderfall gibt“, ist auf oberster Ebene aber nie erfüllt: [wofl] prüft das Raumfeld wohnflaeche, das die Projektsummen nicht haben, und s!=0 vergleicht ein Feld „s“, das es nicht gibt – s ist ein benannter Filter und wird ohne Vergleich geschrieben. Richtig: `{{#wenn raum[wofl,s]}}` (mindestens ein Raum mit Wohnfläche im Sonderfall) bzw. für eine Summe `{{#wenn[nrf_s!=0]}}`.

Doppelte oder fehlende eckige Klammern (`{{raum[[wofl].name}}`) machen den Platzhalter unlesbar – er bleibt als Text stehen.

Feldnamen klein schreiben (`{{raum.name}}`, nicht `{{raum.Name}}`) und ohne Leerzeichen im Namen. Die Vorlagenprüfung schlägt die richtige Schreibweise vor.

**Beispiel: Umgebender Datensatz gegenüber Sammlung** Die Vorlagenprüfung meldet hier: benannter Filter, dessen Felder im Zusammenhang fehlen.

Vorlage:

|  | A |
| --- | --- |
| 1 | `{{#wenn[wofl]}}nie (Summen haben kein Feld wohnflaeche){{/wenn}}` |
| 2 | `{{#wenn raum[wofl]}}Räume mit Wohnfläche vorhanden{{/wenn}}` |
| 3 | `{{#wenn[wofl>0]}}Wohnfläche gesamt > 0{{/wenn}}` |

Ergebnis:

|  | A |
| --- | --- |
| 1 | Räume mit Wohnfläche vorhanden |
| 2 | Wohnfläche gesamt > 0 |

### Vorlagenprüfung

Beim Export mit eigener Vorlage – und mit „Vorlage prüfen“ im Excel-Dialog – meldet die App mögliche Tippfehler mit Blatt und Zelle. Die Prüfung meldet nur; die Ausgabe ändert sich dadurch nicht.

| Hinweis | Beispiel |
| --- | --- |
| unbekannter benannter Filter | `{{raum[wolf].name}}` |
| benannter Filter, dessen Felder im Zusammenhang fehlen | `{{#wenn[wofl]}}` auf oberster Ebene |
| Vergleich auf ein Feld, das es nicht gibt (auch: Filtername mit Vergleich) | `{{#wenn[s!=0]}}` |
| unbekanntes Feld einer Sammlung bzw. unbekannter Name beim Einzelzugriff | `{{raum.flache}}`, `{{geschoss:XY.bgf}}` |
| falsche Groß-/Kleinschreibung oder Leerzeichen im Namen | `{{raum.Name}}`, `{{ raum . name }}` |
| unbekannter Zusatz | `{{raum.name\|eimal}}` |
| zweite ungebundene Sammlung in einer Zeile | `{{raum.name}}` … `{{geschoss.name}}` |
| nicht geschlossener bzw. verwaister Block | `{{#geschoss}}` ohne `{{/geschoss}}` |
| doppelte oder unpaarige eckige Klammern | `{{raum[[wofl].name}}` |
| \|einmal oder Sammlungsfeld in Kopf-/Fußzeile oder Textfeld | `{{raum.name}}` in der Fußzeile |
| unbekannter Einzelwert (bleibt stehen) | `{{summe.bfg}}` |

### Zusatz |einmal

`{{feld|einmal}}` schreibt den Wert nur in die erste Zeile einer Wiederholung – etwa den Geschossnamen über seinen Räumen. In Zeilen, die nicht wiederholt werden, wirkt er nicht (der Wert steht in jeder Blockwiederholung). Andere Zusätze gibt es nicht; ein unbekannter Zusatz (`{{raum.name|foo}}`) wird still ignoriert.

**Beispiel: Geschossname nur einmal**

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{#geschoss}}{{geschoss.name\|einmal}}` | `{{raum.name}}{{/geschoss}}` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | EG | Flur |
| 2 |  | Küche |
| 3 |  | Abstellraum |
| 4 | OG | Bad |
| 5 | DG | Spitzboden |

### Kopf-/Fußzeilen und Textfelder

In Kopf- und Fußzeilen (Seite einrichten) sowie in Textfeldern und Formen werden Einzelwerte, globale Variablen (auch mit Format) und der benannte Einzelzugriff ersetzt. Sammlungsfelder, Blöcke, Bedingungen und |einmal bleiben dort als Text stehen. „&“ in eingesetzten Werten wird in Kopf-/Fußzeilen verdoppelt, damit Excel es nicht als Steuerzeichen liest.

### Globale Variablen

Die globalen Variablen der Suite (PROJEKT_KUERZEL, PROJEKT_KURZNAME, PROJEKT_VORHABEN, BEARBEITER, DATUM, JAHR, JAHR_KURZ) sind dieselben wie in Datei- und Ordnernamen (docs/platzhalter.md). Datum und Jahr gehen mit Format: `{{DATUM:TT.MM.JJJJ}}`, `{{JAHR:JJ}}` – in Zellen, Kopf-/Fußzeilen und Textfeldern.

**Beispiel: Datum mit Format**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{DATUM:TT.MM.JJJJ}}` | `Stand {{DATUM:TT.MM.JJJJ}}` | `{{JAHR:JJ}}` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | 16.11.2026 | Stand 16.11.2026 | 26 |

### Formeln

Formeln der Vorlage bleiben erhalten und werden auf die erzeugten Zeilen umgeschrieben: ein Bezug auf die eigene Zeile zeigt auf die eigene Ausgabezeile, ein Bezug auf eine Zeile im selben Block auf die Zeile derselben Blockwiederholung. Bereiche über Vorlagenzeilen umfassen alle daraus erzeugten Zeilen – zusammenhängend als C11:C17, sonst als Liste D13,D21,D29, damit eine Gesamtsumme über Zwischensummen keine Einzelwerte derselben Spalte mitzählt. Bezüge auf Zeilen darunter rutschen mit; ein Bezug auf eine Zeile ohne Ausgabe wird 0.

Die Ergebnisse werden beim Export mitberechnet (Grundrechenarten, SUMME, RUNDEN, AUFRUNDEN, ABRUNDEN, ABS, MIN, MAX, MITTELWERT, ANZAHL, WENN), damit auch Vorschauen und LibreOffice Werte zeigen; Excel rechnet beim Öffnen neu. Bezüge aus anderen Blättern auf ein Blatt mit Wiederholungen werden nicht angepasst – dafür Einzelwerte oder den benannten Einzelzugriff verwenden.

**Beispiel: Gesamtsumme über Zwischensummen**

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{#geschoss}}{{geschoss.name\|einmal}}` | `{{raum.flaeche}}` |
| 2 |  | `=SUM(B1:B1)` |
| 3 | `{{/geschoss}}` |  |
| 4 | `Gesamt` | `=SUM(B2:B2)` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | EG | 3 |
| 2 |  | 18 |
| 3 |  | 2 |
| 4 |  | `=SUM(B1:B3)` |
| 5 | OG | 6 |
| 6 |  | `=SUM(B5:B5)` |
| 7 | DG | 10 |
| 8 |  | `=SUM(B7:B7)` |
| 9 | Gesamt | `=SUM(B4,B6,B8)` |

### Groß-/Kleinschreibung und Randfälle

Namen von Sammlungen sind unabhängig von Groß-/Kleinschreibung (`{{RAUM.name}}` geht), Einzelwerte und Feldnamen nicht (`{{Summe.bgf}}` bleibt stehen, `{{raum.Name}}` wird leer). Filterwerte vergleichen ohne Groß-/Kleinschreibung.

Felder, die mit „_“ beginnen, sind intern und werden nicht ausgegeben.

Zahlen im Fließtext einer Zelle: bis 3 Nachkommastellen; in Kopf-/Fußzeilen und Textfeldern bis 2. Steht der Platzhalter allein in der Zelle, wird die Zahl unverändert eingetragen und das Zahlenformat der Zelle bestimmt die Anzeige.

**Beispiel: Unbekanntes Feld einer Sammlung wird leer** Die Vorlagenprüfung meldet hier: unbekanntes Feld einer Sammlung bzw. beim Einzelzugriff; unbekannter Einzelwert.

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{raum[geschoss=OG].name}}` | `{{raum[geschoss=OG].foo}}` | `{{summe.foo}}` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | Bad |  | `{{summe.foo}}` |

<!-- /erzeugt:kern -->

## QUADRIO (Flächenrechner)

Dateiname des Exports: `… WoFl+BGF+BRI.xlsx`. Die Muster-Vorlage enthält die Blätter Wohnflächen, BGF, DIN 277 R+S,
BRI, BRI Teilkörper, Räume und Platzhalter.

<!-- erzeugt:quadrio – nicht von Hand ändern, scripts/excel-doku.mjs -->

_Beispieldaten: Projekt „Musterhaus“ (2417). KG: Keller 20 m² (NUF 7), Heizung 4 m² (TF); EG: Flur 3 m² (VF, WE 1), Wohnen 20 m² (NUF 1, WE 1), Loggia 3 m² (S, ohne Wohnflächenanrechnung), Schacht −0,25 m² (Abzug, WE 1); DG (Walmdach mit Schleppgaube): Zimmer 9 m² (WE 2). BGF-Umrisse: Keller, Haus, Loggia (S), Aussparung (Abzug), Dach._

### Projektangaben

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter. Stammdaten des Projekts, in allen Apps gleich.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{projekt.name}}` | Projektbezeichnung |  |
| `{{projekt.code}}` | Projektcode |  |
| `{{projekt.projektcode}}` | Projektcode (gleich projekt.code) |  |
| `{{projekt.adresse}}` | Adresse in einer Zeile: „Straße Nr., PLZ Ort“ |  |
| `{{projekt.strasse}}` | Straße und Hausnummer |  |
| `{{projekt.plz}}` | Postleitzahl |  |
| `{{projekt.ort}}` | Ort |  |
| `{{projekt.plz_ort}}` | Postleitzahl und Ort |  |
| `{{projekt.bearbeiter}}` | Bearbeitung |  |
| `{{projekt.vorhaben}}` | Bezeichnung des Vorhabens |  |
| `{{bplan.nummer}}` | Bebauungsplan: Nummer |  |
| `{{bplan.name}}` | Bebauungsplan: Name |  |
| `{{bplan.text}}` | Bebauungsplan: Nummer und Name in einer Zeile |  |
| `{{buero}}` | Name des Büros (gemeinsame Einstellungen) |  |
| `{{kopf.angaben}}` | Kopfzeile wie im Druck: „Bauherr: … · Bebauungsplan: … · Büro: … · Bearbeitung: …“ |  |
| `{{grundstueck.gemarkung}}` | Gemarkung |  |
| `{{grundstueck.flur}}` | Flur |  |
| `{{grundstueck.flurstueck}}` | Flurstück |  |
| `{{grundstueck.flurtext}}` | „Gemarkung …, Flur …, Flurstück …“ |  |
| `{{grundstueck.flaeche}}` | Grundstücksfläche laut Projektdaten | m² |
| `{{bauherr.name}}` | Name der Bauherrschaft |  |
| `{{bauherr.adresse}}` | Adresse der Bauherrschaft in einer Zeile |  |
| `{{bauherr.strasse}}` | Straße der Bauherrschaft |  |
| `{{bauherr.plz}}` | Postleitzahl der Bauherrschaft |  |
| `{{bauherr.ort}}` | Ort der Bauherrschaft |  |
| `{{bauherr.plz_ort}}` | Postleitzahl und Ort der Bauherrschaft |  |
| `{{bauherr.email}}` | alle E-Mail-Adressen, mit Komma getrennt |  |
| `{{bauherr.telefon}}` | alle Telefonnummern, mit Komma getrennt |  |
| `{{datum}}` | Datum des Exports (TT.MM.JJJJ) |  |

### Maßgrundlage, Normen, Statistik

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{projekt.massgrundlage}}` | Maßgrundlage: „Planmaß Rohbau“, „Planmaß Fertigmaß“ oder „Aufmaß“ (Projekt-Einstellung) |  |
| `{{projekt.massgrundlage_text}}` | Maßgrundlage als Satz, z. B. „Flächen aus Planmaßen (Rohbau), Putzabzug je Raum“ |  |
| `{{projekt.normen}}` | „Wohnfläche nach WoFlV vom 25.11.2003; Grundflächen und Rauminhalte nach DIN 277:2021-08“ (bzw. II. BV) |  |
| `{{projekt.planunterlagen}}` | Planungsunterlagen (DIN 277, 5.1): Eingabe im Projekt, sonst die hinterlegten Pläne je Geschoss |  |
| `{{projekt.kontrollmass}}` | je kalibriertem Plan, z. B. „EG: aus Plan abgegriffen, Maßstab kalibriert, Kontrollmaß 8,00 m: Abweichung +0,12 %“ |  |
| `{{statistik.wohnungen}}` | Hochbaustatistik: Zahl der Wohnungen |  |
| `{{statistik.raeume}}` | Hochbaustatistik: Zahl der Räume (Wohnen und Aufenthalt ab 6 m², Küchen unabhängig von der Größe) |  |
| `{{statistik.sonstige_nutzflaeche}}` | Hochbaustatistik: Nutzfläche der Räume ohne Wohnflächenanrechnung | m² |

### Projektsummen (summe.*)

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter. Dieselben Kennwerte gibt es je Geschoss als geschoss.* und über den Namen als geschoss:EG.*.

| Teil | Bedeutung |
| --- | --- |
| <basis> | nuf, nuf1 … nuf7, hnf (NUF 1–6), nnf (NUF 7), tf, vf, nrf; kgf nur mit _roh |
| _r / _s | nur Räume im Regel- bzw. Sonderfall der Raumumschließung; R + S = gesamt |
| _roh | ohne Putzabzug der Räume; kgf_roh = BGF − NRF ohne Putzabzug (die BGF hat keinen Putzabzug) |
| Beispiele | `{{summe.nnf_s_roh}}`, `{{summe.hnf_r}}`, `{{geschoss.tf_s}}`, `{{geschoss:EG.nrf_roh}}`, `{{summe.kgf_r_roh}}` |
| gezählt | wie die NRF: Abzugsflächen negativ; Räume außerhalb der BGF und Abzugsflächen, die nur die Wohnfläche mindern, zählen nicht |

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{summe.bgf}}` | Brutto-Grundfläche (BGF) nach DIN 277 | m² |
| `{{summe.bgf_r}}` | BGF im Regelfall der Raumumschließung (R) | m² |
| `{{summe.bgf_s}}` | BGF im Sonderfall der Raumumschließung (S) | m² |
| `{{summe.bri}}` | Brutto-Rauminhalt (BRI) nach DIN 277 | m³ |
| `{{summe.bri_r}}` | BRI im Regelfall (R) | m³ |
| `{{summe.bri_s}}` | BRI im Sonderfall (S) | m³ |
| `{{summe.nuf}}` | Nutzungsfläche (NUF 1–7) | m² |
| `{{summe.nuf1}}` | NUF 1 Wohnen und Aufenthalt | m² |
| `{{summe.nuf2}}` | NUF 2 Büroarbeit | m² |
| `{{summe.nuf3}}` | NUF 3 Produktion, Hand- und Maschinenarbeit, Forschung und Entwicklung | m² |
| `{{summe.nuf4}}` | NUF 4 Lagern, Verteilen und Verkaufen | m² |
| `{{summe.nuf5}}` | NUF 5 Bildung, Unterricht und Kultur | m² |
| `{{summe.nuf6}}` | NUF 6 Heilen und Pflegen | m² |
| `{{summe.nuf7}}` | NUF 7 Sonstige Nutzungen | m² |
| `{{summe.tf}}` | Technikfläche (TF) | m² |
| `{{summe.vf}}` | Verkehrsfläche (VF) | m² |
| `{{summe.nrf}}` | Netto-Raumfläche (NRF = NUF + TF + VF) | m² |
| `{{summe.nrf_r}}` | NRF im Regelfall (R) | m² |
| `{{summe.nrf_s}}` | NRF im Sonderfall (S) | m² |
| `{{summe.kgf}}` | Konstruktions-Grundfläche (KGF = BGF − NRF) | m² |
| `{{summe.kgf_r}}` | KGF im Regelfall (R) | m² |
| `{{summe.kgf_s}}` | KGF im Sonderfall (S) | m² |
| `{{summe.wofl}}` | Wohnfläche nach WoFlV (nach Anrechnung, Putzabzug der Räume abgezogen) | m² |
| `{{summe.anzahl_raeume}}` | Anzahl der Räume |  |
| `{{summe.wofl_roh}}` | Wohnfläche ohne Putzabzug (wenn der Abzug in Excel gerechnet wird) | m² |
| `{{summe.<basis>[_r\|_s][_roh]}}` | fertige Summen nach Raumumschließung und ohne Putzabzug, z. B. nnf_s_roh, hnf_r, tf_s, nrf_roh, kgf_roh – Namensregel in der Tabelle | m² |
| `{{summe.nebenflaeche}}` | Flächen ohne Wohnflächenanrechnung: Grundflächen aller Räume, die nicht auf die Wohnfläche angerechnet werden (nach WoFlV-Anrechnung, nicht nach NUF 7) | m² |

**Beispiel: DIN 277 nach R und S**

Vorlage:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 |  | `R` | `S` | `gesamt` |
| 2 | `NUF 1–6 (HNF)` | `{{summe.hnf_r}}` | `{{summe.hnf_s}}` | `{{summe.hnf}}` |
| 3 | `NUF 7 (NNF)` | `{{summe.nnf_r}}` | `{{summe.nnf_s}}` | `{{summe.nnf}}` |
| 4 | `TF` | `{{summe.tf_r}}` | `{{summe.tf_s}}` | `{{summe.tf}}` |
| 5 | `VF` | `{{summe.vf_r}}` | `{{summe.vf_s}}` | `{{summe.vf}}` |
| 6 | `NRF` | `{{summe.nrf_r}}` | `{{summe.nrf_s}}` | `{{summe.nrf}}` |
| 7 | `NRF ohne Putzabzug` | `{{summe.nrf_r_roh}}` | `{{summe.nrf_s_roh}}` | `{{summe.nrf_roh}}` |
| 8 | `KGF` | `{{summe.kgf_r}}` | `{{summe.kgf_s}}` | `{{summe.kgf}}` |
| 9 | `BGF` | `{{summe.bgf_r}}` | `{{summe.bgf_s}}` | `{{summe.bgf}}` |

Ergebnis:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 |  | R | S | gesamt |
| 2 | NUF 1–6 (HNF) | 32,15 | 3 | 35,15 |
| 3 | NUF 7 (NNF) | 20 | 2 | 22 |
| 4 | TF | 4 | 0 | 4 |
| 5 | VF | 3 | 0 | 3 |
| 6 | NRF | 59,15 | 5 | 64,15 |
| 7 | NRF ohne Putzabzug | 59,75 | 5 | 64,75 |
| 8 | KGF | 219,85 | 1 | 220,85 |
| 9 | BGF | 279 | 6 | 285 |

**Beispiel: Kennwerte des Projekts**

Vorlage:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | `BGF` | `{{summe.bgf}}` | `BRI` | `{{summe.bri}}` |
| 2 | `NRF` | `{{summe.nrf}}` | `Wohnfläche` | `{{summe.wofl}}` |

Ergebnis:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | BGF | 285 | BRI | 660,02 |
| 2 | NRF | 64,15 | Wohnfläche | 35,9 |

### `geschoss` – Geschosse

**Sammlung**, Zeile je Geschoss. Kennwerte je Geschoss in der Reihenfolge der Geschosse.

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält** – im Block `{{#geschoss}}` auf den aktuellen Datensatz eingeschränkt:

- `raum` (Räume): Räume dieses Geschosses
- `bgf` (BGF-Teilflächen): BGF-Teilflächen dieses Geschosses
- `bri` (BRI-Rechenweg (Teilkörper)): BRI-Teilkörper dieses Geschosses
- `koerper` (BRI-Körper (geschlossene Formeln)): BRI-Körper dieses Geschosses
- `wohnung` (Wohnungen): Wohnungen mit mindestens einem Raum in diesem Geschoss – ihre Werte gelten für die ganze Wohnung

**Nicht eingeschränkt** (laufen im Block über alle Datensätze):

- `nutzung`: Flächen je Nutzungsgruppe sind Projektsummen, auch im Geschossblock – je Geschoss: geschoss.nuf1 … geschoss.nuf7, geschoss.tf, geschoss.vf

**Benannter Einzelzugriff:** `{{geschoss:NAME.feld}}` – Kennwerte eines Geschosses über seinen Namen, auch in Kopf-/Fußzeilen. Beispiel: `{{geschoss:EG.bgf}}`. Nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}.

| Teil | Bedeutung |
| --- | --- |
| <basis> | nuf, nuf1 … nuf7, hnf (NUF 1–6), nnf (NUF 7), tf, vf, nrf; kgf nur mit _roh |
| _r / _s | nur Räume im Regel- bzw. Sonderfall der Raumumschließung; R + S = gesamt |
| _roh | ohne Putzabzug der Räume; kgf_roh = BGF − NRF ohne Putzabzug (die BGF hat keinen Putzabzug) |
| Beispiele | `{{summe.nnf_s_roh}}`, `{{summe.hnf_r}}`, `{{geschoss.tf_s}}`, `{{geschoss:EG.nrf_roh}}`, `{{summe.kgf_r_roh}}` |
| gezählt | wie die NRF: Abzugsflächen negativ; Räume außerhalb der BGF und Abzugsflächen, die nur die Wohnfläche mindern, zählen nicht |

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{geschoss.nr}}` | laufende Nummer |  |
| `{{geschoss.name}}` | Bezeichnung |  |
| `{{geschoss.dachgeschoss}}` | „ja“ bei Dachgeschossen, sonst leer |  |
| `{{geschoss.art}}` | „Dachgeschoss“ bzw. „Normalgeschoss“ (Geschossart, automatisch oder festgelegt) |  |
| `{{geschoss.hoehe}}` | Geschosshöhe | m |
| `{{geschoss.sohle}}` | Bodenplatte einschließlich Dämmung darunter, ab deren Unterkante der BRI zählt (leer ohne) | m |
| `{{geschoss.bgf}}` | Brutto-Grundfläche (BGF) nach DIN 277 | m² |
| `{{geschoss.bgf_r}}` | BGF im Regelfall der Raumumschließung (R) | m² |
| `{{geschoss.bgf_s}}` | BGF im Sonderfall der Raumumschließung (S) | m² |
| `{{geschoss.bri}}` | Brutto-Rauminhalt (BRI) nach DIN 277 | m³ |
| `{{geschoss.bri_r}}` | BRI im Regelfall (R) | m³ |
| `{{geschoss.bri_s}}` | BRI im Sonderfall (S) | m³ |
| `{{geschoss.nuf}}` | Nutzungsfläche (NUF 1–7) | m² |
| `{{geschoss.nuf1}}` | NUF 1 Wohnen und Aufenthalt | m² |
| `{{geschoss.nuf2}}` | NUF 2 Büroarbeit | m² |
| `{{geschoss.nuf3}}` | NUF 3 Produktion, Hand- und Maschinenarbeit, Forschung und Entwicklung | m² |
| `{{geschoss.nuf4}}` | NUF 4 Lagern, Verteilen und Verkaufen | m² |
| `{{geschoss.nuf5}}` | NUF 5 Bildung, Unterricht und Kultur | m² |
| `{{geschoss.nuf6}}` | NUF 6 Heilen und Pflegen | m² |
| `{{geschoss.nuf7}}` | NUF 7 Sonstige Nutzungen | m² |
| `{{geschoss.tf}}` | Technikfläche (TF) | m² |
| `{{geschoss.vf}}` | Verkehrsfläche (VF) | m² |
| `{{geschoss.nrf}}` | Netto-Raumfläche (NRF = NUF + TF + VF) | m² |
| `{{geschoss.nrf_r}}` | NRF im Regelfall (R) | m² |
| `{{geschoss.nrf_s}}` | NRF im Sonderfall (S) | m² |
| `{{geschoss.kgf}}` | Konstruktions-Grundfläche (KGF = BGF − NRF) | m² |
| `{{geschoss.kgf_r}}` | KGF im Regelfall (R) | m² |
| `{{geschoss.kgf_s}}` | KGF im Sonderfall (S) | m² |
| `{{geschoss.wofl}}` | Wohnfläche nach WoFlV (nach Anrechnung, Putzabzug der Räume abgezogen) | m² |
| `{{geschoss.anzahl_raeume}}` | Anzahl der Räume |  |
| `{{geschoss.wofl_roh}}` | Wohnfläche ohne Putzabzug (wenn der Abzug in Excel gerechnet wird) | m² |
| `{{geschoss.<basis>[_r\|_s][_roh]}}` | fertige Summen nach Raumumschließung und ohne Putzabzug, z. B. nnf_s_roh, hnf_r, tf_s, nrf_roh, kgf_roh – Namensregel in der Tabelle | m² |
| `{{geschoss.nebenflaeche}}` | Flächen ohne Wohnflächenanrechnung: Grundflächen aller Räume, die nicht auf die Wohnfläche angerechnet werden (nach WoFlV-Anrechnung, nicht nach NUF 7) | m² |

| Benannter Filter | Bedeutung |
| --- | --- |
| `[dg]`, `[dachgeschoss]` | nur im Dachgeschoss (Geschossart) |
| `[normal]`, `[normalgeschoss]` | nur in Normalgeschossen |

- Ein `{{#geschoss}}` innerhalb eines Geschossblocks liefert nur dasselbe Geschoss – für „Überschrift einmal, darunter je Geschoss“ `{{#wenn …}}` außen und `{{#geschoss}}` innen verwenden.

**Beispiel: Zeile je Geschoss mit Summe**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{geschoss.name}}` | `{{geschoss.bgf}}` | `{{geschoss.bri}}` |
| 2 | `Summe` | `=SUM(B1:B1)` | `=SUM(C1:C1)` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | KG | 80 | 200 |
| 2 | EG | 85 | 233,75 |
| 3 | DG | 120 | 226,27 |
| 4 | Summe | `=SUM(B1:B3)` | `=SUM(C1:C3)` |

**Beispiel: Nur Dachgeschosse, benannter Einzelzugriff**

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{geschoss[dg].name}}` | `{{geschoss[dg].art}}` |
| 2 | `BGF EG` | `{{geschoss:EG.bgf}}` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | DG | Dachgeschoss |
| 2 | BGF EG | 85 |

### `raum` – Räume

**Sammlung**, Zeile je Raum. Alle Räume aller Geschosse, auch Abzugsflächen (mit negativer Fläche).

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält** – im Block `{{#raum}}` auf den aktuellen Datensatz eingeschränkt:

- `geschoss` (Geschosse): das Geschoss des Raums

**Nicht eingeschränkt** (laufen im Block über alle Datensätze):

- `wohnung`: alle Wohnungen, nicht nur die des Raums – dafür `{{raum.wohnung}}` verwenden
- `bgf`: alle BGF-Teilflächen (Räume sind keiner Teilfläche zugeordnet)

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{raum.nr}}` | laufende Nummer über alle Geschosse |  |
| `{{raum.geschoss}}` | Geschoss |  |
| `{{raum.dachgeschoss}}` | „ja“, wenn der Raum in einem Dachgeschoss liegt |  |
| `{{raum.nummer}}` | Raumnummer |  |
| `{{raum.name}}` | Raumbezeichnung |  |
| `{{raum.nutzung}}` | Nutzungsgruppe nach DIN 277 kurz, z. B. „NUF 1“, „TF 8“, „VF 9“ (leer außerhalb der BGF) |  |
| `{{raum.nutzung_text}}` | Nutzungsgruppe ausgeschrieben |  |
| `{{raum.umschliessung}}` | Raumumschließung „R“ (Regelfall) oder „S“ (Sonderfall), leer außerhalb der BGF |  |
| `{{raum.ausserhalb_bgf}}` | „ja“ bei Flächen außerhalb der BGF (z. B. ebenerdige Terrasse) – nur Wohnfläche, nicht in der NRF |  |
| `{{raum.flaeche}}` | Grundfläche abzüglich Putzabzug (Abzugsflächen negativ) | m² |
| `{{raum.flaeche_roh}}` | Grundfläche ohne Putzabzug | m² |
| `{{raum.putzabzug}}` | Putzabzug des Raums (leer ohne) | % |
| `{{raum.hoehenlage}}` | Höhenlage des Fußbodens gegenüber dem Geschoss (Split-Level, negativ = tiefer; leer auf Geschossniveau) | m |
| `{{raum.wohnflaeche}}` | „ja“, wenn auf die Wohnfläche angerechnet |  |
| `{{raum.wofl_kategorie}}` | Anrechnung nach WoFlV, z. B. „lichte Höhe ≥ 2 m (100 %)“ |  |
| `{{raum.wofl_faktor}}` | Anrechnungsfaktor nach WoFlV |  |
| `{{raum.teil_h2}}` | nur „Raumteile nach lichter Höhe“: Teilfläche mit lichter Höhe ≥ 2 m | m² |
| `{{raum.teil_h12}}` | nur „Raumteile nach lichter Höhe“: Teilfläche 1–2 m (zur Hälfte angerechnet) | m² |
| `{{raum.teil_h01}}` | nur „Raumteile nach lichter Höhe“: Teilfläche < 1 m (nicht angerechnet) | m² |
| `{{raum.wofl}}` | anrechenbare Wohnfläche (nach Putzabzug) | m² |
| `{{raum.wofl_roh}}` | anrechenbare Wohnfläche ohne Putzabzug – wenn der Abzug in Excel gerechnet wird, sonst würde doppelt abgezogen | m² |
| `{{raum.wohnung}}` | Wohnung, der der Raum zugeordnet ist |  |
| `{{raum.abzug}}` | „Abzug“ bei Abzugsflächen, sonst leer |  |
| `{{raum.bemerkung}}` | Bemerkung |  |

| Benannter Filter | Bedeutung |
| --- | --- |
| `[wofl]`, `[wohnflaeche]`, `[wohnfläche]` | Räume mit Wohnflächenanrechnung (WoFlV-Anrechnung nicht „keine Wohnfläche“) |
| `[nebenflaeche]`, `[nebenfläche]` | Räume ohne Wohnflächenanrechnung – nach der WoFlV-Anrechnung, nicht nach NUF 7: auch Technik-, Verkehrs- und Nutzungsflächen ohne Anrechnung gehören dazu |
| `[freisitz]`, `[freisitze]` | Freisitze nach WoFlV (Anrechnung „Balkon, Loggia, Dachgarten, Terrasse“) – auch ebenerdige Terrassen außerhalb der BGF, die weder R noch S haben |
| `[nuf]` | Nutzungsfläche (NUF 1–7) |
| `[hnf]` | NUF 1–6 (Altname; frühere Hauptnutzfläche HNF nach DIN 277-2:2005) |
| `[nnf]` | NUF 7 Sonstige Nutzungen (Altname; frühere Nebennutzfläche NNF nach DIN 277-2:2005) |
| `[tf]` | Technikfläche (TF 8) |
| `[vf]` | Verkehrsfläche (VF 9) |
| `[r]` | Regelfall der Raumumschließung (R) |
| `[s]` | Sonderfall der Raumumschließung (S) |
| `[abzug]` | Abzugsflächen |
| `[dg]`, `[dachgeschoss]` | nur im Dachgeschoss (Geschossart) |
| `[normal]`, `[normalgeschoss]` | nur in Normalgeschossen |

- Ob ein Raum zur Wohnfläche zählt, legt die WoFlV-Anrechnung im Raum fest („keine Wohnfläche“ = nicht angerechnet). Beim IFC-Import mit „als Wohnfläche anrechnen“ werden Keller-, Technik-, Treppen-, Garagen- und Dachbodenräume sowie Räume in Keller-/Untergeschossen automatisch ausgenommen.
- Für die Wohnflächenberechnung nach der WoFlV-Anrechnung filtern, nicht nach R/S: Wohnräume raum[wofl,!freisitz], Freisitze raum[wofl,freisitz]. R und S sind Begriffe der DIN 277 – ebenerdige Terrassen außerhalb der BGF haben keine Umschließung, und ein Balkon mit voreingestelltem R stünde bei den Wohnräumen.
- Putzabzug: Übernimmt der Import einen Putzabzug je Raum, enthalten raum.flaeche und raum.wofl ihn bereits. Wird der Abzug in Excel gerechnet, raum.flaeche_roh bzw. raum.wofl_roh verwenden.

**Beispiel: Wohnflächen je Geschoss mit Zwischensumme** – Die Formel wird je Geschoss auf dessen Raumzeilen erweitert, die Gesamtsumme auf die Zwischensummen; Geschosse ohne Wohnfläche entfallen.

Vorlage:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | `{{#geschoss}}{{geschoss.name\|einmal}}` | `{{raum[wofl].name}}` | `{{raum[wofl].wofl_roh}}` |  |
| 2 |  |  |  | `=SUM(C1:C1)` |
| 3 | `{{/geschoss}}` |  |  |  |
| 4 | `Wohnfläche gesamt` |  |  | `=SUM(D2:D2)` |

Ergebnis:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | EG | Flur | 3 |  |
| 2 |  | Wohnen | 20 |  |
| 3 |  | Loggia | 0,75 |  |
| 4 |  | Schacht | -0,25 |  |
| 5 |  | Terrasse | 2 |  |
| 6 |  | Treppe | -2 |  |
| 7 |  |  |  | `=SUM(C1:C6)` |
| 8 | DG | Zimmer | 9 |  |
| 9 |  | Bad | 4 |  |
| 10 |  |  |  | `=SUM(C8:C9)` |
| 11 | Wohnfläche gesamt |  |  | `=SUM(D7,D10)` |

**Beispiel: Wohnfläche mit Freisitzen je Wohnung** – Gefiltert nach der WoFlV-Anrechnung (freisitz), nicht nach R/S – so steht auch die ebenerdige Terrasse außerhalb der BGF bei den Freisitzen.

Vorlage:

|  | A | B | C | D | E |
| --- | --- | --- | --- | --- | --- |
| 1 | `{{#wohnung}}{{wohnung.name\|einmal}}` | `{{raum[wofl,!freisitz].name}}` | `{{raum[wofl,!freisitz].flaeche_roh}}` | `{{raum[wofl,!freisitz].wofl_faktor}}` | `{{raum[wofl,!freisitz].wofl_roh}}` |
| 2 | `Wohnräume {{wohnung.name}}` |  |  |  | `=SUM(E1:E1)` |
| 3 | `{{#wenn raum[wofl,freisitz]}}` | `{{raum[wofl,freisitz].name}}` | `{{raum[wofl,freisitz].flaeche_roh}}` | `{{raum[wofl,freisitz].wofl_faktor}}` | `{{raum[wofl,freisitz].wofl_roh}}` |
| 4 | `Freisitze {{wohnung.name}}{{/wenn}}` |  |  |  | `=SUM(E3:E3)` |
| 5 | `{{/wohnung}}` |  |  |  |  |

Ergebnis:

|  | A | B | C | D | E |
| --- | --- | --- | --- | --- | --- |
| 1 | (ohne Zuordnung) | Bad | 4 | 1 | 4 |
| 2 | Wohnräume (ohne Zuordnung) |  |  |  | `=SUM(E1:E1)` |
| 3 | WE 1 | Flur | 3 | 1 | 3 |
| 4 |  | Wohnen | 20 | 1 | 20 |
| 5 |  | Schacht | -0,25 | 1 | -0,25 |
| 6 |  | Treppe | -2 | 1 | -2 |
| 7 | Wohnräume WE 1 |  |  |  | `=SUM(E3:E6)` |
| 8 |  | Loggia | 3 | 0,25 | 0,75 |
| 9 |  | Terrasse | 8 | 0,25 | 2 |
| 10 | Freisitze WE 1 |  |  |  | `=SUM(E8:E9)` |
| 11 | WE 2 | Zimmer | 9 | 1 | 9 |
| 12 | Wohnräume WE 2 |  |  |  | `=SUM(E11:E11)` |

**Beispiel: Flächen ohne Wohnflächenanrechnung**

Vorlage:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | `{{#wenn raum[nebenflaeche]}}Flächen ohne Wohnflächenanrechnung` |  |  |  |
| 2 |  | `{{raum[nebenflaeche].name}}` | `{{raum[nebenflaeche].nutzung}}` | `{{raum[nebenflaeche].flaeche}}` |
| 3 | `{{/wenn}}` |  |  |  |

Ergebnis:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | Flächen ohne Wohnflächenanrechnung |  |  |  |
| 2 |  | Keller | NUF 7 | 20 |
| 3 |  | Heizung | TF 8 | 4 |
| 4 |  | Abstellraum | NUF 7 | 2 |

**Beispiel: Altnamen hnf und nnf**

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{raum[hnf].name}}` | `{{raum[hnf].nutzung}}` |
| 2 | `{{raum[nnf].name}}` | `{{raum[nnf].nutzung}}` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | Wohnen | NUF 1 |
| 2 | Loggia | NUF 1 |
| 3 | Schacht | NUF 1 |
| 4 | Treppe | NUF 1 |
| 5 | Zimmer | NUF 1 |
| 6 | Bad | NUF 1 |
| 7 | Keller | NUF 7 |
| 8 | Abstellraum | NUF 7 |

### `bgf` – BGF-Teilflächen

**Sammlung**, Zeile je BGF-Umriss. Teilflächen der Brutto-Grundfläche, je BGF-Umriss eine Zeile; die Summe der Teilflächen eines Geschosses ist dessen geschoss.bgf.

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält** – im Block `{{#bgf}}` auf den aktuellen Datensatz eingeschränkt:

- `bri` (BRI-Rechenweg (Teilkörper)): BRI-Teilkörper dieser Teilfläche
- `koerper` (BRI-Körper (geschlossene Formeln)): BRI-Körper dieser Teilfläche
- `raum` (Räume): alle Räume des Geschosses der Teilfläche (Räume sind keiner einzelnen Teilfläche zugeordnet)
- `geschoss` (Geschosse): das Geschoss der Teilfläche

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{bgf.nr}}` | laufende Nummer im Geschoss |  |
| `{{bgf.geschoss}}` | Geschoss |  |
| `{{bgf.dachgeschoss}}` | „ja“ im Dachgeschoss |  |
| `{{bgf.name}}` | Bezeichnung des BGF-Umrisses |  |
| `{{bgf.umschliessung}}` | „R“ oder „S“ |  |
| `{{bgf.flaeche}}` | Fläche (negativ bei Abzugsflächen) | m² |
| `{{bgf.bgf_r}}` | Fläche im Regelfall, sonst leer | m² |
| `{{bgf.bgf_s}}` | Fläche im Sonderfall, sonst leer | m² |
| `{{bgf.laenge}}` | Länge – nur bei rechteckigen Teilflächen | m |
| `{{bgf.breite}}` | Breite – nur bei rechteckigen Teilflächen | m |
| `{{bgf.bri}}` | Brutto-Rauminhalt der Teilfläche | m³ |
| `{{bgf.hoehenlage}}` | Höhenversatz des Körpers gegenüber dem Geschoss, sonst leer | m |
| `{{bgf.abzug}}` | „Abzug“ bei Abzugsflächen, sonst leer |  |
| `{{bgf.bemerkung}}` | Bemerkung |  |

| Benannter Filter | Bedeutung |
| --- | --- |
| `[r]` | Regelfall der Raumumschließung (R) |
| `[s]` | Sonderfall der Raumumschließung (S) |
| `[abzug]` | Abzugsflächen |
| `[dg]`, `[dachgeschoss]` | nur im Dachgeschoss (Geschossart) |
| `[normal]`, `[normalgeschoss]` | nur in Normalgeschossen |

**Beispiel: BGF je Geschoss mit Teilflächen**

Vorlage:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | `{{#geschoss}}{{geschoss.name\|einmal}}` | `{{bgf.name}}` | `{{bgf.umschliessung}}` | `{{bgf.flaeche}}` |
| 2 |  |  |  | `=SUM(D1:D1)` |
| 3 | `{{/geschoss}}` |  |  |  |

Ergebnis:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | KG | Keller | R | 80 |
| 2 |  |  |  | `=SUM(D1:D1)` |
| 3 | EG | Haus | R | 80 |
| 4 |  | Loggia | S | 6 |
| 5 |  | Aussparung | R | -1 |
| 6 |  |  |  | `=SUM(D3:D5)` |
| 7 | DG | Dach | R | 120 |
| 8 |  |  |  | `=SUM(D7:D7)` |

**Beispiel: Nur Sonderfall, ohne Abzugsflächen**

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{bgf[s].name}}` | `{{bgf[s].flaeche}}` |
| 2 | `{{bgf[!abzug,geschoss=EG].name}}` | `{{bgf[!abzug,geschoss=EG].flaeche}}` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | Loggia | 6 |
| 2 | Haus | 80 |
| 3 | Loggia | 6 |

### `bri` – BRI-Rechenweg (Teilkörper)

**Sammlung**, Zeile je Teilkörper. Rechenweg des Brutto-Rauminhalts: je BGF-Umriss die Teilkörper mit Volumen = anzahl × flaeche × hoehe × faktor; die Summe entspricht exakt dem BRI.

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält** – im Block `{{#bri}}` auf den aktuellen Datensatz eingeschränkt:

- `bgf` (BGF-Teilflächen): der BGF-Umriss des Teilkörpers
- `geschoss` (Geschosse): das Geschoss des Teilkörpers

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{bri.nr}}` | laufende Nummer im Geschoss |  |
| `{{bri.geschoss}}` | Geschoss |  |
| `{{bri.dachgeschoss}}` | „ja“ im Dachgeschoss |  |
| `{{bri.umriss}}` | BGF-Umriss (bei Abzügen mit „(Abzug)“) |  |
| `{{bri.umschliessung}}` | Raumumschließung des Umrisses „R“ oder „S“ |  |
| `{{bri.bezeichnung}}` | Teilkörper, z. B. „Quader“, „Walmdach: Walmende“, „Schleppgaube“ |  |
| `{{bri.anzahl}}` | Anzahl gleicher Teilkörper (negativ bei Abzügen) |  |
| `{{bri.laenge}}` | Länge (in Firstrichtung) – bei rechteckigen Grundflächen | m |
| `{{bri.breite}}` | Breite – bei rechteckigen Grundflächen | m |
| `{{bri.flaeche}}` | Grundfläche des Teilkörpers | m² |
| `{{bri.hoehe}}` | Höhe | m |
| `{{bri.faktor}}` | Formfaktor (1 Quader, 0,5 Prisma/Keil, 0,333 Pyramide …) |  |
| `{{bri.volumen}}` | anzahl × flaeche × hoehe × faktor | m³ |
| `{{bri.formel}}` | Rechenweg als Text, z. B. „12,00 × 9,00 × 3,151 × ½“ |  |
| `{{bri.unterbau}}` | „Bodenplatte“ bzw. „Split-Level“ bei Teilen unter dem Geschossfußboden, sonst leer |  |

| Benannter Filter | Bedeutung |
| --- | --- |
| `[r]` | Regelfall der Raumumschließung (R) |
| `[s]` | Sonderfall der Raumumschließung (S) |
| `[dg]`, `[dachgeschoss]` | nur im Dachgeschoss (Geschossart) |
| `[normal]`, `[normalgeschoss]` | nur in Normalgeschossen |

**Beispiel: Rechenweg je Geschoss**

Vorlage:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | `{{#geschoss}}{{geschoss.name\|einmal}}` | `{{bri.bezeichnung}}` | `{{bri.formel}}` | `{{bri.volumen}}{{/geschoss}}` |

Ergebnis:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | KG | Quader | 10,00 × 8,00 × 2,500 | 200 |
| 2 | EG | Quader | 10,00 × 8,00 × 2,750 | 220 |
| 3 |  | Quader | 4,00 × 1,50 × 2,750 | 16,5 |
| 4 |  | Quader | − 1,00 × 1,00 × 2,750 | -2,75 |
| 5 | DG | Walmdach: Mittelteil (Dreiecksprisma) | 2,00 × 10,00 × 5,000 × ½ | 50 |
| 6 |  | Walmdach: Walmende | 2 × 5,00 × 10,00 × 5,000 × ⅓ | 166,67 |
| 7 |  | Schleppgaube | 4,00 × 3,00 × 1,601 × ½ | 9,61 |

### `koerper` – BRI-Körper (geschlossene Formeln)

**Sammlung**, Zeile je Körper. BRI mit geschlossenen Formeln: je BGF-Umriss ein Grundkörper (Quader bis Geschoss- bzw. Traufhöhe), bei geneigtem Dach ein Dachkörper als Ganzes und je Gaube ein eigener Körper; die Summe aller Körper ist exakt der BRI.

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält** – im Block `{{#koerper}}` auf den aktuellen Datensatz eingeschränkt:

- `bgf` (BGF-Teilflächen): der BGF-Umriss des Körpers
- `geschoss` (Geschosse): das Geschoss des Körpers

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{koerper.nr}}` | laufende Nummer im Geschoss |  |
| `{{koerper.geschoss}}` | Geschoss |  |
| `{{koerper.dachgeschoss}}` | „ja“, wenn der Körper in einem Dachgeschoss liegt |  |
| `{{koerper.umriss}}` | BGF-Umriss |  |
| `{{koerper.umschliessung}}` | Raumumschließung des Umrisses „R“ oder „S“ |  |
| `{{koerper.art}}` | „Grundkörper“, „Dach“ oder „Gaube“ |  |
| `{{koerper.bezeichnung}}` | z. B. „Quader“, „Grundkörper bis Traufe“, „Walmdach“, „Schleppgaube“ |  |
| `{{koerper.parameter}}` | Maße als Text, z. B. „H: 5,375 m; B: 10,75 m; L: 12,00 m“ |  |
| `{{koerper.formel}}` | Formel mit Formelzeichen, z. B. „B × H × (3 × L − B) / 6“ |  |
| `{{koerper.rechnung}}` | Formel mit eingesetzten Werten (Maße auf mm genau) |  |
| `{{koerper.flaeche}}` | Grundfläche (negativ bei Abzugsflächen) | m² |
| `{{koerper.hoehe}}` | Höhe: Grundkörper = Geschoss-/Traufhöhe, Dach = Höhe über Traufe, Gaube = Höhe der Vorderwand über der Dachfläche | m |
| `{{koerper.laenge}}` | Länge (Firstrichtung) bzw. Gaubenbreite | m |
| `{{koerper.breite}}` | Breite bzw. Gaubentiefe | m |
| `{{koerper.neigung}}` | Dach- bzw. Gaubenneigung | ° |
| `{{koerper.volumen}}` | Volumen | m³ |
| `{{koerper.bemerkung}}` | Fußnote, z. B. Abweichung einer aus dem IFC-Modell erkannten Dachform |  |

| Benannter Filter | Bedeutung |
| --- | --- |
| `[grundkoerper]`, `[grundkörper]` | Grundkörper (Quader bis Geschoss- bzw. Traufhöhe) |
| `[dach]` | Dachkörper |
| `[gaube]`, `[gauben]` | Gauben |
| `[r]` | Regelfall der Raumumschließung (R) |
| `[s]` | Sonderfall der Raumumschließung (S) |
| `[dg]`, `[dachgeschoss]` | nur im Dachgeschoss (Geschossart) |
| `[normal]`, `[normalgeschoss]` | nur in Normalgeschossen |

**Beispiel: Normalgeschosse als Höhe × BGF, Dachgeschoss je Körper**

Vorlage:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | `{{koerper[normal,grundkoerper].geschoss}}` | `{{koerper[normal,grundkoerper].hoehe}}` | `{{koerper[normal,grundkoerper].flaeche}}` | `=B1*C1` |
| 2 | `{{#geschoss[dg]}}{{geschoss.name}}` |  |  |  |
| 3 | `{{#koerper}}{{koerper.bezeichnung}}` | `{{koerper.formel}}` | `{{koerper.rechnung}}` | `{{koerper.volumen}}{{/koerper}}` |
| 4 | `{{/geschoss}}` |  |  |  |

Ergebnis:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | KG | 2,5 | 80 | `=B1*C1` |
| 2 | EG | 2,75 | 80 | `=B2*C2` |
| 3 | EG | 2,75 | 6 | `=B3*C3` |
| 4 | EG | 2,75 | -1 | `=B4*C4` |
| 5 | DG |  |  |  |
| 6 | Walmdach | B × H × (3 × L − B) / 6 | 10 × 5 × (3 × 12 − 10) / 6 | 216,67 |
| 7 | Schleppgaube | B × T² × (tan α − tan β) / 2 | 4 × 3² × (tan 45° − tan 25°) / 2 | 9,61 |

### `wohnung` – Wohnungen

**Sammlung**, Zeile je Wohnung. Wohnungen aus der Zuordnung der Räume (raum.wohnung).

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält** – im Block `{{#wohnung}}` auf den aktuellen Datensatz eingeschränkt:

- `raum` (Räume): Räume der Wohnung; Räume mit Wohnfläche ohne Zuordnung gehören zur Wohnung „(ohne Zuordnung)“
- `geschoss` (Geschosse): Geschosse mit mindestens einem Raum der Wohnung – ihre Werte gelten für das ganze Geschoss

**Benannter Einzelzugriff:** `{{wohnung:NAME.feld}}` – Werte einer Wohnung über ihren Namen. Beispiel: `{{wohnung:WE 1.wofl}}`. Nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{wohnung.nr}}` | laufende Nummer |  |
| `{{wohnung.name}}` | Bezeichnung |  |
| `{{wohnung.anzahl_raeume}}` | Anzahl der Räume |  |
| `{{wohnung.raeume_statistik}}` | Räume für die Hochbaustatistik: Wohnen und Aufenthalt ab 6 m², Küchen unabhängig von der Größe (Bad, WC, Flur, Abstellräume nicht) |  |
| `{{wohnung.grundflaeche}}` | Summe der Grundflächen | m² |
| `{{wohnung.wofl}}` | Wohnfläche nach WoFlV | m² |

Benannte Filter: keine – allgemeine Filter gehen.

**Beispiel: Räume je Wohnung**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{#wohnung}}{{wohnung.name}}` |  | `{{wohnung.wofl}}` |
| 2 |  | `{{raum.name}}` | `{{raum.wofl}}` |
| 3 | `{{/wohnung}}` |  |  |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | (ohne Zuordnung) |  | 4 |
| 2 |  | Bad | 4 |
| 3 | WE 1 |  | 22,9 |
| 4 |  | Flur | 3 |
| 5 |  | Wohnen | 19,4 |
| 6 |  | Loggia | 0,75 |
| 7 |  | Schacht | -0,25 |
| 8 |  | Terrasse | 2 |
| 9 |  | Treppe | -2 |
| 10 | WE 2 |  | 9 |
| 11 |  | Zimmer | 9 |

### `nutzung` – Nutzungsgruppen

**Sammlung**, Zeile je Nutzungsgruppe. Alle Nutzungsgruppen nach DIN 277 (NUF 1 … NUF 7, TF 8, VF 9) mit den Flächen des Projekts – auch die ohne Fläche.

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält** – im Block `{{#nutzung}}` auf den aktuellen Datensatz eingeschränkt:

- `raum` (Räume): Räume dieser Nutzungsgruppe

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{nutzung.gruppe}}` | Kürzel, z. B. „NUF 1“, „TF 8“ |  |
| `{{nutzung.bezeichnung}}` | Bezeichnung nach DIN 277 |  |
| `{{nutzung.flaeche}}` | Fläche des Projekts | m² |

Benannte Filter: keine – allgemeine Filter gehen.

**Beispiel: Nur belegte Nutzungsgruppen**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{nutzung[flaeche>0].gruppe}}` | `{{nutzung[flaeche>0].bezeichnung}}` | `{{nutzung[flaeche>0].flaeche}}` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | NUF 1 | Wohnen und Aufenthalt | 35,15 |
| 2 | NUF 7 | Sonstige Nutzungen | 22 |
| 3 | TF 8 | Technische Anlagen | 4 |
| 4 | VF 9 | Verkehrserschließung und -sicherung | 3 |

### Globale Variablen

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter. Gelten in allen Apps gleich, auch in Datei- und Ordnernamen. DATUM, JAHR und JAHR_KURZ gehen mit Format: `{{DATUM:TT.MM.JJJJ}}`, `{{JAHR:JJ}}`.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{PROJEKT_KUERZEL}}` | Projektkürzel bzw. Projektnummer |  |
| `{{PROJEKT_KURZNAME}}` | Kurzname des Projekts |  |
| `{{PROJEKT_VORHABEN}}` | Bezeichnung des Vorhabens |  |
| `{{BEARBEITER}}` | Bearbeitung (Kürzel bzw. Name) |  |
| `{{DATUM}}` | Datum des Vorgangs (Export, Anlegen …) als JJMMTT; mit Format z. B. `{{DATUM:JJJJ-MM-TT}}` |  |
| `{{JAHR}}` | Jahr des Vorgangs, vierstellig |  |
| `{{JAHR_KURZ}}` | Jahr des Vorgangs, zweistellig |  |
| `{{DATUM.iso}}` | Datum des Exports als JJJJ-MM-TT |  |

<!-- /erzeugt:quadrio -->

### Begriffe

- Die Zeilen „Brutto-/Netto-Wohnflächen“ mit pauschalem Abzug von 3 % in der Muster-Vorlage sind eine Gepflogenheit
  vieler Büros; die WoFlV selbst kennt keinen pauschalen Abzug.
- DIN 277:2021 gliedert die Netto-Raumfläche in Nutzungsfläche (NUF 1–7), Technikfläche (TF) und Verkehrsfläche (VF).
  Die Altnamen `hnf` und `nnf` stehen für NUF 1–6 bzw. NUF 7 (frühere Hauptnutzfläche HNF und Nebennutzfläche NNF nach
  DIN 277-2:2005).
- `raum[nebenflaeche]` und `summe.nebenflaeche` richten sich nach der WoFlV-Anrechnung (Räume ohne
  Wohnflächenanrechnung), nicht nach NUF 7.
- Ein Geschoss gilt automatisch als Dachgeschoss, sobald einer seiner BGF-Umrisse eine geneigte Dachform trägt („Dach
  aus Modell“ zählt nicht); in den Geschosseigenschaften unter **Geschossart** festlegbar. Der Filter `[dg]`/`[normal]`
  wirkt auf `geschoss`, `raum`, `bgf`, `bri` und `koerper`.

### BRI: Normalgeschosse und Dachgeschoss

Normalgeschosse und Dachgeschosse werden unterschiedlich gerechnet: im Normalgeschoss
**Geschosshöhe × BGF**, im Dachgeschoss je Dachkörper mit eigener Formel (Walmdach, Satteldach …).
Dafür gibt es die Sammlung `koerper` – je BGF-Umriss ein **Grundkörper** (Quader bis Geschoss- bzw.
Traufhöhe), bei geneigtem Dach ein **Dachkörper** als Ganzes und je **Gaube** ein eigener Körper
(α = Hauptdachneigung, β/γ = Gaubendachneigung, T = waagerechte Tiefe bis zum Anschluss ans Hauptdach,
h = Wandhöhe über der Dachfläche) – sowie die Filter `[normal]`, `[dg]`, `[dach]`, `[gaube]`.
Herleitung der Formeln: [Dachform und Gauben](dach-und-gauben.md).

Ein Geschoss gilt automatisch als Dachgeschoss, sobald einer seiner BGF-Umrisse eine geneigte Dachform
trägt – ein „Dach aus Modell“ zählt dafür nicht (es steht oft auch über Vordächern oder Anbauten unterer
Geschosse). Ein Körper „bis zur Dachhaut aus dem Modell“ erscheint als Grundkörper mit mittlerer Höhe,
also im Normalgeschoss-Block als Höhe × BGF.
In den Geschosseigenschaften lässt sich das unter **Geschossart** festlegen (automatisch / Normalgeschoss /
Dachgeschoss). Der Filter wirkt auf `geschoss`, `raum`, `bgf`, `bri` und `koerper`.

| Dachform (Rechteck L × B, L in Firstrichtung) | `koerper.formel` |
|---|---|
| Pult-, Sattel-, Sheddach | `L × B × H / 2` |
| Walm-/Zeltdach, gleiche Neigung | `B × H × (3 × L − B) / 6` |
| Walmdach, eigene Walmneigung | `B × H × (3 × L − 2 × a) / 6` (a = Walmtiefe) |
| Krüppelwalmdach | `L × B × H / 2 − a × b × h / 3` |
| Mansarddach | `L × (Hu × (B − d) + Bo × Ho / 2)` |
| Tonnendach | `L × A` (A = Kreisabschnitt) |
| unregelmäßiger Grundriss, Mansardwalm, Dach aus IFC | `A × hm` (Grundfläche × mittlere Höhe) |
| Grundkörper | `L × B × H` bzw. `A × H` |
| Schleppgaube | `B × T² × (tan α − tan β) / 2` |
| Flachdachgaube | `B × T² × tan α / 2` |
| Satteldachgaube | `B × (h² + Hg × (h + Hg / 3)) / (2 × tan α)` (Hg = B/2 × tan γ) |

`koerper.parameter` listet die Maße („H: 5,375 m; B: 10,75 m; L: 12,00 m“), `koerper.rechnung` die Formel
mit eingesetzten Werten („10,75 × 5,375 × (3 × 12 − 10,75) / 6“, Maße auf mm genau – nachrechenbar),
`koerper.volumen` das Ergebnis. Die Summe aller Körper ist exakt der BRI (Blatt „BRI“ der Muster-Vorlage, Beispiel bei `koerper` oben).


Die Zahlenformate `#.##0,00 "m  *"` und `#.##0,00 "m²  ="` erzeugen die Darstellung „2,40 m \*
48,69 m² =“. Gauben erscheinen im Dachgeschossblock automatisch nach dem Dach, z. B. „Schleppgaube /
Hauptdach α: 45°; Gaubendach β: 25°; T: 4,115 m; B: 4,20 m / 4,2 × 4,115² × (tan 45° − tan 25°) / 2 = 18,98 m³“.

### BRI mit Rechenweg (Teilkörper)

Die Sammlung `bri` enthält den **Rechenweg des Brutto-Rauminhalts**: je BGF-Umriss die Teilkörper mit

`Volumen = anzahl × flaeche × hoehe × faktor` (bei Rechtecken `flaeche = laenge × breite`).

| Umriss | Teilkörper | Anzahl | Faktor |
|---|---|---|---|
| ohne Dach | Quader | 1 | 1 |
| Pultdach | Grundkörper bis Traufe + Keil | 1 | ½ |
| Satteldach | Grundkörper + Dreiecksprisma | 1 | ½ |
| Walm-/Zeltdach | Grundkörper + Mittelteil (Prisma) + Walmenden | 1 / 2 | ½ / ⅓ |
| Krüppelwalm | Grundkörper + Satteldach − Krüppelwalm-Abzug | 1 / −2 | ½ / ⅙ |
| Mansarddach | Grundkörper + unten Quader + Seitenkeile + oben Prisma | 1 / 2 / 1 | 1 / ½ / ½ |
| Tonnendach | Grundkörper + Kreisabschnitt | 1 | Formfaktor ≈ 0,67 |
| Sheddach | Grundkörper + Keile | n | ½ |
| Mansardwalm, unregelmäßige Grundrisse, Dach aus IFC | Grundfläche × mittlere Höhe (exakt berechnet) | 1 | 1 |
| Abzugsflächen | wie oben, negative Anzahl | −1 … | |

Die Summe der Teilkörper entspricht exakt dem berechneten BRI. `bri.formel` enthält den Rechenweg als
Text (z. B. `12,00 × 9,00 × 3,151 × ½`). Beispiel: Blatt „BRI Teilkörper“ der Muster-Vorlage und `bri` oben.


## TERRIO (GRZ-Nachweis)

Dateiname des Exports: `… GRZ+GFZ.xlsx`. Das Standardlayout ist die Muster-Vorlage (Blatt „GRZ GFZ“) ohne Hilfeblatt;
GRZ und GFZ sind dort Formeln aus den Zellen. Der Haftungssatz steht nur als Platzhalter `{{haftung}}` zur Verfügung.

<!-- erzeugt:terrio – nicht von Hand ändern, scripts/excel-doku.mjs -->

_Beispieldaten: Projekt „Musterhaus“, Grundstück 600 m², Bebauungsplan vom 01.06.1995 (BauNVO 1990) mit GRZ 0,4, GFZ 0,8, II Vollgeschossen und Festsetzung nach § 20 Abs. 3 Satz 2; Gebäude 12 × 10 m mit EG, OG und DG (Walmdach, kein Vollgeschoss); Räume Wohnen (EG), Zimmer und Abstellraum (DG); Lageplan: Zufahrt (GRZ II, teilversiegelt), Terrasse (prüfen), Weg (zählt), Garten (Grünfläche), Nachbarhaus._

### Projektangaben

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter. Stammdaten des Projekts, in allen Apps gleich.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{projekt.name}}` | Projektbezeichnung |  |
| `{{projekt.code}}` | Projektcode |  |
| `{{projekt.projektcode}}` | Projektcode (gleich projekt.code) |  |
| `{{projekt.adresse}}` | Adresse in einer Zeile: „Straße Nr., PLZ Ort“ |  |
| `{{projekt.strasse}}` | Straße und Hausnummer |  |
| `{{projekt.plz}}` | Postleitzahl |  |
| `{{projekt.ort}}` | Ort |  |
| `{{projekt.plz_ort}}` | Postleitzahl und Ort |  |
| `{{projekt.bearbeiter}}` | Bearbeitung |  |
| `{{projekt.vorhaben}}` | Bezeichnung des Vorhabens |  |
| `{{bplan.nummer}}` | Bebauungsplan: Nummer |  |
| `{{bplan.name}}` | Bebauungsplan: Name |  |
| `{{bplan.text}}` | Bebauungsplan: Nummer und Name in einer Zeile |  |
| `{{buero}}` | Name des Büros (gemeinsame Einstellungen) |  |
| `{{kopf.angaben}}` | Kopfzeile wie im Druck: „Bauherr: … · Bebauungsplan: … · Büro: … · Bearbeitung: …“ |  |
| `{{grundstueck.gemarkung}}` | Gemarkung |  |
| `{{grundstueck.flur}}` | Flur |  |
| `{{grundstueck.flurstueck}}` | Flurstück |  |
| `{{grundstueck.flurtext}}` | „Gemarkung …, Flur …, Flurstück …“ |  |
| `{{grundstueck.flaeche}}` | Grundstücksfläche laut Projektdaten | m² |
| `{{bauherr.name}}` | Name der Bauherrschaft |  |
| `{{bauherr.adresse}}` | Adresse der Bauherrschaft in einer Zeile |  |
| `{{bauherr.strasse}}` | Straße der Bauherrschaft |  |
| `{{bauherr.plz}}` | Postleitzahl der Bauherrschaft |  |
| `{{bauherr.ort}}` | Ort der Bauherrschaft |  |
| `{{bauherr.plz_ort}}` | Postleitzahl und Ort der Bauherrschaft |  |
| `{{bauherr.email}}` | alle E-Mail-Adressen, mit Komma getrennt |  |
| `{{bauherr.telefon}}` | alle Telefonnummern, mit Komma getrennt |  |
| `{{datum}}` | Datum des Exports (TT.MM.JJJJ) |  |

### Grundlagen

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{bplan.datum}}` | Datum des Bebauungsplans (TT.MM.JJJJ) |  |
| `{{bplan.auslegung}}` | öffentliche Auslegung des Planentwurfs (TT.MM.JJJJ), maßgebend für die BauNVO-Fassung – leer, wenn nicht eingetragen |  |
| `{{bplan.angabe}}` | Nummer, Name und Datum in einer Zeile, z. B. „Nr. 112 „Am Hang“ vom 14.03.1967“ |  |
| `{{gebietsart}}` | Baugebiet nach BauNVO als Kürzel (WA, MI …) |  |
| `{{gebietsart.bezeichnung}}` | „Baugebiet“, wenn eines eingetragen ist (Beschriftung), sonst leer |  |
| `{{gebietsart.text}}` | Baugebiet mit Bezeichnung, z. B. „WA – allgemeines Wohngebiet“ |  |
| `{{stand}}` | Stand des Nachweises (im Druckdialog eingetragen) – leer, wenn nicht eingetragen |  |
| `{{stand.text}}` | „Stand TT.MM.JJJJ“ bzw. leer |  |
| `{{baunvo.fassung}}` | angewandte Fassung der BauNVO |  |
| `{{bauo.fassung}}` | angewandte Fassung der Bauordnung für den Vollgeschossbegriff |  |
| `{{recht.hinweise}}` | Hinweise zur Wahl der Fassung |  |
| `{{grundstueck.flaeche_nachweis}}` | maßgebende Grundstücksfläche | m² |
| `{{grundstueck.quelle}}` | Herkunft der Grundstücksfläche |  |
| `{{grundstueck.gemeinschaftsanlagen}}` | hinzugerechneter Anteil an Gemeinschaftsanlagen nach § 21a Abs. 2 BauNVO (leer ohne) | m² |
| `{{gelaende}}` | Geländeoberfläche über ±0,00 | m |
| `{{gelaende.quelle}}` | Herkunft der Geländeoberfläche |  |
| `{{hauptanlage}}` | Grundfläche der Hauptanlage (Gebäude) | m² |

### Grundflächenzahl (§ 19 BauNVO)

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter. GRZ I bzw. GRZ (vor 1990) und GRZ II nach § 19 Abs. 4 BauNVO 1990 (Überschreitung durch Garagen, Stellplätze mit Zufahrten, Nebenanlagen und unterirdische Anlagen).

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{grz.bezeichnung}}` | „GRZ I“ (BauNVO 1990) bzw. „GRZ“ (frühere Fassungen) |  |
| `{{grz}}` | GRZ I bzw. GRZ, auf die Stellen der App gerundet (leer ohne Festsetzung bzw. Berechnung) |  |
| `{{grz.stellen}}` | Nachkommastellen der Kennzahl (mindestens 3, nahe am Grenzwert mehr) |  |
| `{{grz.zulaessig}}` | zulässige GRZ I bzw. GRZ laut Festsetzung |  |
| `{{grz.zulaessig_flaeche}}` | zulässige Grundfläche (GR I bzw. GR) | m² |
| `{{grz.flaeche}}` | angerechnete Grundfläche (GR I bzw. GR) | m² |
| `{{grz.mit_offenen}}` | GRZ I bzw. GRZ einschließlich der ungeklärten Flächen („prüfen“), sonst leer |  |
| `{{grz.flaeche_mit_offenen}}` | Grundfläche (GR I bzw. GR) einschließlich der ungeklärten Flächen, sonst leer | m² |
| `{{grz.reserve}}` | zulässige minus angerechnete Grundfläche (GR I bzw. GR) (negativ = überschritten) | m² |
| `{{grz.status}}` | Ergebnis: „eingehalten“, „überschritten“ … |  |
| `{{grz.vergleich}}` | Begründung in m², z. B. „GR I 135,00 m² < 240,00 m² zulässig“ |  |
| `{{grz.ii.bezeichnung}}` | „GRZ II (§ 19 Abs. 4)“ bei BauNVO 1990, sonst leer |  |
| `{{grz.ii}}` | GRZ II, auf die Stellen der App gerundet (leer ohne Festsetzung bzw. Berechnung) |  |
| `{{grz.ii.stellen}}` | Nachkommastellen der Kennzahl (mindestens 3, nahe am Grenzwert mehr) |  |
| `{{grz.ii.zulaessig}}` | zulässige GRZ II laut Festsetzung |  |
| `{{grz.ii.zulaessig_flaeche}}` | zulässige Grundfläche GR II | m² |
| `{{grz.ii.flaeche}}` | angerechnete Grundfläche GR II | m² |
| `{{grz.ii.mit_offenen}}` | GRZ II einschließlich der ungeklärten Flächen („prüfen“), sonst leer |  |
| `{{grz.ii.flaeche_mit_offenen}}` | Grundfläche GR II einschließlich der ungeklärten Flächen, sonst leer | m² |
| `{{grz.ii.reserve}}` | zulässige minus angerechnete Grundfläche GR II (negativ = überschritten) | m² |
| `{{grz.ii.status}}` | Ergebnis: „eingehalten“, „überschritten“ … |  |
| `{{grz.ii.vergleich}}` | Begründung in m², z. B. „GR I 135,00 m² < 240,00 m² zulässig“ |  |
| `{{grz.offen.bezeichnung}}` | „GRZ II mit ungeklärten Flächen („prüfen“)“ bzw. „GRZ …“ – leer ohne ungeklärte Flächen |  |
| `{{grz.offen.flaeche}}` | Grundfläche einschließlich der ungeklärten Flächen (GR II bzw. GR) | m² |
| `{{lageplan.angerechnet_auf}}` | „GR II“ (BauNVO 1990) bzw. „GR“ – Einzelwert für Spaltenüberschriften, obwohl er wie ein Feld von lageplan aussieht |  |
| `{{unterirdisch.flaeche}}` | Kellergeschoss außerhalb der Hauptanlage (leer ohne) | m² |
| `{{unterirdisch.angerechnet}}` | davon angerechnet | m² |
| `{{garagen.frei}}` | anrechnungsfreie Garagenfläche nach § 19 Abs. 5 (1962) bzw. § 21a Abs. 3 (1968/1977) | m² |
| `{{gr_absolut.bezeichnung}}` | Bezeichnung, z. B. „GR I (absolut)“ (leer ohne Festsetzung) |  |
| `{{gr_absolut}}` | vorhandene GR I | m² |
| `{{gr_absolut.zulaessig}}` | festgesetzter Höchstwert | m² |
| `{{gr_absolut.status}}` | Ergebnis |  |
| `{{gr2_absolut.bezeichnung}}` | Bezeichnung, z. B. „GR II absolut (§ 19 Abs. 4 S. 2)“ (leer ohne Festsetzung) |  |
| `{{gr2_absolut}}` | vorhandene GR II absolut | m² |
| `{{gr2_absolut.zulaessig}}` | festgesetzter Höchstwert | m² |
| `{{gr2_absolut.status}}` | Ergebnis |  |

**Beispiel: Kennzahlen mit Ergebnis**

Vorlage:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | `{{grz.bezeichnung}}` | `{{grz}}` | `zulässig {{grz.zulaessig}}` | `{{grz.status}}` |
| 2 | `{{#wenn grz.ii}}{{grz.ii.bezeichnung}}` | `{{grz.ii}}` | `zulässig {{grz.ii.zulaessig}}` | `{{grz.ii.status}}{{/wenn}}` |
| 3 | `{{grz.vergleich}}` |  |  |  |

Ergebnis:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | GRZ I | 0,225 | zulässig 0,4 | eingehalten |
| 2 | GRZ II (§ 19 Abs. 4) | 0,25 | zulässig 0,6 | eingehalten |
| 3 | GR I 135,00 m² < 240,00 m² zulässig; mit ungeklärten Flächen („prüfen“) 150,00 m² |  |  |  |

### Geschossfläche, Baumasse, Vollgeschosse

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter. GFZ nach § 20, BMZ nach § 21 BauNVO; Vollgeschosse nach der Bauordnung der maßgebenden Fassung.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{gf}}` | Geschossfläche (GF) | m² |
| `{{gf.aufenthalt}}` | davon Aufenthaltsräume in Nicht-Vollgeschossen samt Treppenräumen und Umfassungswänden | m² |
| `{{aufenthalt.titel}}` | „Aufenthaltsräume in Nicht-Vollgeschossen“, wenn sie zur Geschossfläche zählen (vor 1990, bei BauNVO 1990 nur bei Festsetzung nach § 20 Abs. 3 Satz 2), sonst leer |  |
| `{{gfz}}` | GFZ, auf die Stellen der App gerundet (leer ohne Festsetzung bzw. Berechnung) |  |
| `{{gfz.stellen}}` | Nachkommastellen der Kennzahl (mindestens 3, nahe am Grenzwert mehr) |  |
| `{{gfz.zulaessig}}` | zulässige GFZ laut Festsetzung |  |
| `{{gfz.zulaessig_flaeche}}` | zulässige Geschossfläche | m² |
| `{{gfz.flaeche}}` | angerechnete Geschossfläche | m² |
| `{{gfz.mit_offenen}}` | GFZ einschließlich der ungeklärten Flächen („prüfen“), sonst leer |  |
| `{{gfz.flaeche_mit_offenen}}` | Geschossfläche einschließlich der ungeklärten Flächen, sonst leer | m² |
| `{{gfz.reserve}}` | zulässige minus angerechnete Geschossfläche (negativ = überschritten) | m² |
| `{{gfz.status}}` | Ergebnis: „eingehalten“, „überschritten“ … |  |
| `{{gfz.vergleich}}` | Begründung in m², z. B. „GR I 135,00 m² < 240,00 m² zulässig“ |  |
| `{{gf_absolut.bezeichnung}}` | Bezeichnung, z. B. „GF (absolut)“ (leer ohne Festsetzung) |  |
| `{{gf_absolut}}` | vorhandene GF | m² |
| `{{gf_absolut.zulaessig}}` | festgesetzter Höchstwert | m² |
| `{{gf_absolut.status}}` | Ergebnis |  |
| `{{bmz.bezeichnung}}` | „BMZ“ bei Festsetzung, sonst leer |  |
| `{{bmz.text}}` | „Baumasse (vereinfacht)“ bzw. leer |  |
| `{{bmz}}` | BMZ, auf die Stellen der App gerundet (leer ohne Festsetzung bzw. Berechnung) |  |
| `{{bmz.stellen}}` | Nachkommastellen der Kennzahl (mindestens 3, nahe am Grenzwert mehr) |  |
| `{{bmz.zulaessig}}` | zulässige BMZ laut Festsetzung |  |
| `{{bmz.zulaessig_flaeche}}` | zulässige Baumasse (BM) | m³ |
| `{{bmz.flaeche}}` | angerechnete Baumasse (BM) | m³ |
| `{{bmz.mit_offenen}}` | BMZ einschließlich der ungeklärten Flächen („prüfen“), sonst leer |  |
| `{{bmz.flaeche_mit_offenen}}` | Baumasse (BM) einschließlich der ungeklärten Flächen, sonst leer | m³ |
| `{{bmz.reserve}}` | zulässige minus angerechnete Baumasse (BM) (negativ = überschritten) | m³ |
| `{{bmz.status}}` | Ergebnis: „eingehalten“, „überschritten“ … |  |
| `{{bmz.vergleich}}` | Begründung in m³, z. B. „GR I 135,00 m² < 240,00 m² zulässig“ |  |
| `{{bmz.baumasse}}` | Baumasse, vereinfacht aus Grundfläche × Geschosshöhe der Vollgeschosse | m³ |
| `{{vollgeschosse}}` | Zahl der Vollgeschosse |  |
| `{{vollgeschosse.roemisch}}` | als römische Zahl (II) |  |
| `{{vollgeschosse.zulaessig}}` | zulässige Zahl laut Festsetzung |  |
| `{{vollgeschosse.mindestens}}` | Mindestzahl laut Festsetzung |  |
| `{{vollgeschosse.zwingend}}` | „ja“, wenn die Zahl zwingend festgesetzt ist |  |
| `{{vollgeschosse.status}}` | Ergebnis |  |
| `{{vollgeschosse.namen}}` | Namen der Vollgeschosse, mit Komma getrennt |  |

**Beispiel: GFZ und Vollgeschosse**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `GFZ` | `{{gfz}}` | `{{gfz.vergleich}}` |
| 2 | `Vollgeschosse` | `{{vollgeschosse.roemisch}}` | `{{vollgeschosse.namen}}` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | GFZ | 0,449 | GF 269,15 m² < 480,00 m² zulässig |
| 2 | Vollgeschosse | II | EG, OG |

### Flächenbilanz und Hinweise

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{bilanz.gebaeude}}` | Gebäude | m² |
| `{{bilanz.vollversiegelt}}` | vollversiegelte Flächen | m² |
| `{{bilanz.teilversiegelt}}` | teilversiegelte Flächen | m² |
| `{{bilanz.gruen}}` | Grünflächen | m² |
| `{{bilanz.summe}}` | Summe der erfassten Flächen | m² |
| `{{bilanz.differenz}}` | Grundstücksfläche minus Summe (nicht erfasst bzw. überlappend) | m² |
| `{{hinweise}}` | alle Hinweise für die Bauaufsicht in einer Zelle (Zeilenumbrüche; ohne Bedienhinweise der App) – je Zeile: hinweis.text |  |
| `{{haftung}}` | Haftungshinweis des Werkzeugs |  |

### `geschoss` – Geschosse

**Sammlung**, Zeile je Geschoss. Vollgeschossprüfung und Geschossfläche je Geschoss.

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält** – im Block `{{#geschoss}}` auf den aktuellen Datensatz eingeschränkt:

- `raum` (Räume): Räume dieses Geschosses

**Benannter Einzelzugriff:** `{{geschoss:NAME.feld}}` – Werte eines Geschosses über seinen Namen. Beispiel: `{{geschoss:EG.gf}}`. Nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{geschoss.nr}}` | laufende Nummer |  |
| `{{geschoss.name}}` | Bezeichnung |  |
| `{{geschoss.ueber_gelaende}}` | Deckenoberkante über der Geländeoberfläche im Mittel | m |
| `{{geschoss.gelaende}}` | Geländeoberfläche entlang der Außenwände des Geschosses im Mittel | m |
| `{{geschoss.gelaende_min}}` | tiefster Punkt der Geländeoberfläche entlang der Außenwände | m |
| `{{geschoss.gelaende_max}}` | höchster Punkt der Geländeoberfläche entlang der Außenwände | m |
| `{{geschoss.oberirdisch}}` | „ja“ bei oberirdischen Geschossen |  |
| `{{geschoss.anteil}}` | Anteil der Grundfläche mit der geforderten Höhe (nur oberirdische Geschosse) |  |
| `{{geschoss.anteil_soll}}` | geforderter Anteil (0 = ohne Anteilsregel) |  |
| `{{geschoss.hoehe_soll}}` | geforderte Höhe | m |
| `{{geschoss.flaeche_hoch}}` | Fläche mit der geforderten Höhe | m² |
| `{{geschoss.bezugsflaeche}}` | Bezugsfläche der Anteilsregel | m² |
| `{{geschoss.vollgeschoss}}` | „ja“ bei Vollgeschossen |  |
| `{{geschoss.ergebnis}}` | „Vollgeschoss“ bzw. „kein Vollgeschoss“ |  |
| `{{geschoss.festlegung}}` | „automatisch“ oder „festgelegt“ |  |
| `{{geschoss.begruendung}}` | Begründung der Vollgeschossprüfung |  |
| `{{geschoss.gf}}` | Geschossfläche des Geschosses | m² |
| `{{geschoss.gf_art}}` | wie die Geschossfläche ermittelt wurde |  |

| Benannter Filter | Bedeutung |
| --- | --- |
| `[vollgeschoss]` | Vollgeschosse ([!vollgeschoss]: Nicht-Vollgeschosse) |
| `[oberirdisch]` | oberirdische Geschosse |

**Beispiel: Vollgeschossprüfung je Geschoss**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{geschoss.name}}` | `{{geschoss.ergebnis}}` | `{{geschoss.gf}}` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | EG | Vollgeschoss | 120 |
| 2 | OG | Vollgeschoss | 120 |
| 3 | DG | kein Vollgeschoss | 29,15 |

**Beispiel: Nicht-Vollgeschosse mit ihren Räumen**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{#geschoss[!vollgeschoss]}}{{geschoss.name}}` | `{{geschoss.begruendung}}` |  |
| 2 |  | `{{raum.name}}` | `{{raum.aufenthalt}}{{/geschoss}}` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | DG | geneigte Dachflächen: Höhe ≥ 2,30 m bis OK Dachhaut auf 33 % der eigenen Grundfläche (mehr als drei Viertel gefordert) |  |
| 2 |  | Zimmer | Aufenthaltsraum |
| 3 |  | Abstellraum | kein Aufenthaltsraum |

### `lageplan` – Lageplan-Flächen

**Sammlung**, Zeile je Lageplan-Fläche. Flächen des Lageplans mit Anrechnung auf die Grundfläche und Versiegelung; Nachbarflächen ohne Nummer.

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält:** keine Unterpunkte – im Block `{{#lageplan}}` laufen andere Sammlungen über alle Datensätze.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{lageplan.nr}}` | Nummer wie im Rechenweg (teil.flaeche_nr) und im Druck; leer bei Nachbarflächen |  |
| `{{lageplan.name}}` | Bezeichnung |  |
| `{{lageplan.nutzung}}` | Nutzung, z. B. „Zufahrt“, „Terrasse“ |  |
| `{{lageplan.versiegelung}}` | „vollversiegelt“, „teilversiegelt“ oder „Grünfläche“ |  |
| `{{lageplan.flaeche}}` | Fläche | m² |
| `{{lageplan.flaeche_aussen}}` | davon außerhalb des Gebäudes | m² |
| `{{lageplan.flaeche_eindeutig}}` | nur dieser Fläche zugeordneter Anteil – Summen zählen Überlagerungen einmal | m² |
| `{{lageplan.ueberlagert}}` | von anderen Flächen schon abgedeckter Rest | m² |
| `{{lageplan.angerechnet}}` | tatsächlich auf die Grundfläche angerechnet (GR II bei BauNVO 1990, sonst GR) | m² |
| `{{lageplan.angerechnet_bis}}` | bei „prüfen“: angerechnet bis zu dieser Fläche, sonst leer | m² |
| `{{lageplan.anrechnung}}` | Anrechnung: „zählt“, „GRZ II“, „bis 0,1 frei“, „zählt nicht“, „prüfen“ oder „Nachbar“ |  |
| `{{lageplan.nachbar}}` | „ja“ bei Flächen eines Nachbargrundstücks |  |
| `{{lageplan.hoehe}}` | Höhe der Oberfläche über ±0,00 (leer ohne) | m |

| Benannter Filter | Bedeutung |
| --- | --- |
| `[eigen]` | Flächen des eigenen Grundstücks |
| `[nachbar]` | Flächen der Nachbargrundstücke |
| `[zaehlt]`, `[zählt]` | zählen wie die Hauptanlage (GR I bzw. GR) |
| `[grz2]` | zählen nur zur GRZ II (§ 19 Abs. 4 BauNVO 1990) |
| `[pruefen]`, `[prüfen]` | nach der maßgebenden Fassung nicht eindeutig („prüfen“) |
| `[voll]` | vollversiegelt |
| `[teil]` | teilversiegelt |
| `[gruen]`, `[grün]` | Grünfläche |

**Beispiel: Flächen des Grundstücks mit Summe** – lageplan.angerechnet_auf ist ein Einzelwert und wiederholt die Kopfzeile nicht.

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `Fläche` | `Anrechnung` | `angerechnet auf {{lageplan.angerechnet_auf}}` |
| 2 | `{{lageplan[eigen].name}}` | `{{lageplan.anrechnung}}` | `{{lageplan.angerechnet}}` |
| 3 | `Summe` |  | `=SUM(C2:C2)` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | Fläche | Anrechnung | angerechnet auf GR II |
| 2 | Zufahrt | GRZ II | 15 |
| 3 | Terrasse | prüfen | 0 |
| 4 | Weg | zählt | 15 |
| 5 | Garten | zählt nicht | 0 |
| 6 | Summe |  | `=SUM(C2:C5)` |

**Beispiel: Ungeklärte Flächen nur, wenn es welche gibt**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{#wenn lageplan[pruefen]}}Zu prüfen:` | `{{lageplan[pruefen].name}}` | `{{lageplan[pruefen].angerechnet_bis}}{{/wenn}}` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | Zu prüfen: | Terrasse | 15 |

### `raum` – Räume

**Sammlung**, Zeile je Raum. Räume aller Geschosse (ohne Abzugsflächen) mit der Prüfung als Aufenthaltsraum.

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält** – im Block `{{#raum}}` auf den aktuellen Datensatz eingeschränkt:

- `geschoss` (Geschosse): das Geschoss des Raums

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{raum.nr}}` | laufende Nummer |  |
| `{{raum.geschoss}}` | Geschoss |  |
| `{{raum.vollgeschoss}}` | „ja“, wenn der Raum in einem Vollgeschoss liegt |  |
| `{{raum.nummer}}` | Raumnummer |  |
| `{{raum.name}}` | Raumbezeichnung |  |
| `{{raum.flaeche}}` | Fläche ohne Putzabzug | m² |
| `{{raum.aufenthalt}}` | „Aufenthaltsraum“, „Treppenraum“ oder „kein Aufenthaltsraum“ |  |
| `{{raum.festlegung}}` | „automatisch“ oder „festgelegt“ |  |
| `{{raum.begruendung}}` | Ergebnis der Prüfung nach Nutzung und lichter Höhe |  |
| `{{raum.hoehenlage}}` | Höhenlage des Fußbodens gegenüber dem Geschoss (Split-Level; leer auf Geschossniveau) | m |

| Benannter Filter | Bedeutung |
| --- | --- |
| `[aufenthalt]` | Aufenthalts- und Treppenräume |
| `[gf]` | Räume in Nicht-Vollgeschossen, wenn deren Aufenthaltsräume zur Geschossfläche zählen (vor 1990, bei BauNVO 1990 nur bei Festsetzung nach § 20 Abs. 3 Satz 2) – alle Räume dieser Geschosse, mit [gf,aufenthalt] nur die Aufenthaltsräume |
| `[vollgeschoss]` | Räume in Vollgeschossen |

**Beispiel: Aufenthaltsräume, die zur Geschossfläche zählen**

Vorlage:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | `{{#wenn aufenthalt.titel}}{{aufenthalt.titel}}` |  |  |  |
| 2 |  | `{{raum[gf,aufenthalt].geschoss}}` | `{{raum[gf,aufenthalt].name}}` | `{{raum[gf,aufenthalt].flaeche}}` |
| 3 | `{{/wenn}}` |  |  |  |

Ergebnis:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | Aufenthaltsräume in Nicht-Vollgeschossen |  |  |  |
| 2 |  | DG | Zimmer | 24 |

### `hinweis` – Hinweise

**Sammlung**, Zeile je Hinweis. Hinweise für die Bauaufsicht (ohne Bedienhinweise der App).

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält:** keine Unterpunkte – im Block `{{#hinweis}}` laufen andere Sammlungen über alle Datensätze.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{hinweis.nr}}` | laufende Nummer |  |
| `{{hinweis.text}}` | Hinweis |  |

Benannte Filter: keine – allgemeine Filter gehen.

**Beispiel: Hinweise nummeriert**

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{hinweis[nr<=2].nr}}` | `{{hinweis[nr<=2].text}}` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | 1 | Grundstücksfläche laut Projektdaten 600,00 m², Lageplan-Flächen mit Gebäude 185,00 m² – Lageplan unvollständig oder Flächen überlappen. |
| 2 | 2 | Einzelne Flächen sind nach der maßgebenden BauNVO-Fassung nicht eindeutig einzustufen („prüfen“). GRZ I und GRZ II sind ohne und mit ihnen angegeben. |

### `formel` – Rechenweg: Formeln

**Sammlung**, Zeile je Formel. Formelzeilen des Rechenwegs, z. B. „GRZ I = GR I / FGst = 135,00 m² / 600,00 m² = 0,225“.

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält:** keine Unterpunkte – im Block `{{#formel}}` laufen andere Sammlungen über alle Datensätze.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{formel.nr}}` | laufende Nummer |  |
| `{{formel.text}}` | Formel mit eingesetzten Werten |  |

Benannte Filter: keine – allgemeine Filter gehen.

**Beispiel: Formeln zur GRZ I**

Vorlage:

|  | A |
| --- | --- |
| 1 | `{{formel[nr<=2].text}}` |

Ergebnis:

|  | A |
| --- | --- |
| 1 | GR I = Hauptanlage 120,00 m² + der Hauptanlage zugerechnete Flächen 15,00 m² = 135,00 m² |
| 2 | GRZ I = GR I / FGst = 135,00 m² / 600,00 m² = 0,225 |

### `teil` – Rechenweg: Teilflächen

**Sammlung**, Zeile je Teilfläche. Zerlegung der Flächen in Rechtecke und Dreiecke (Länge × Breite × Faktor); ohne Zerlegung die Fläche aus Koordinaten × 1 × 1. H = Hauptanlage.

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält:** keine Unterpunkte – im Block `{{#teil}}` laufen andere Sammlungen über alle Datensätze.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{teil.flaeche_nr}}` | Nummer der Fläche (H = Hauptanlage, sonst wie lageplan.nr) |  |
| `{{teil.flaeche_name}}` | Name der Fläche |  |
| `{{teil.name}}` | Teilfläche, z. B. „1.2 Rechteck“ |  |
| `{{teil.art}}` | „Rechteck“, „Dreieck“ oder „Koordinaten“ |  |
| `{{teil.laenge}}` | Länge bzw. Grundseite | m |
| `{{teil.breite}}` | Breite bzw. Höhe | m |
| `{{teil.faktor}}` | 1 beim Rechteck, 0,5 beim Dreieck |  |
| `{{teil.flaeche}}` | Fläche | m² |

Benannte Filter: keine – allgemeine Filter gehen.

- Teilflächen sind nicht mit lageplan verknüpft: im Block `{{#lageplan}}` laufen alle Teilflächen – zuordnen über teil[flaeche_nr=…].

**Beispiel: Teilflächen der Hauptanlage mit Formel**

Vorlage:

|  | A | B | C | D | E |
| --- | --- | --- | --- | --- | --- |
| 1 | `{{teil[flaeche_nr=H].name}}` | `{{teil[flaeche_nr=H].laenge}}` | `{{teil[flaeche_nr=H].breite}}` | `{{teil[flaeche_nr=H].faktor}}` | `=B1*C1*D1` |

Ergebnis:

|  | A | B | C | D | E |
| --- | --- | --- | --- | --- | --- |
| 1 | H.1 Rechteck | 12 | 10 | 1 | `=B1*C1*D1` |

### Globale Variablen

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter. Gelten in allen Apps gleich, auch in Datei- und Ordnernamen. DATUM, JAHR und JAHR_KURZ gehen mit Format: `{{DATUM:TT.MM.JJJJ}}`, `{{JAHR:JJ}}`.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{PROJEKT_KUERZEL}}` | Projektkürzel bzw. Projektnummer |  |
| `{{PROJEKT_KURZNAME}}` | Kurzname des Projekts |  |
| `{{PROJEKT_VORHABEN}}` | Bezeichnung des Vorhabens |  |
| `{{BEARBEITER}}` | Bearbeitung (Kürzel bzw. Name) |  |
| `{{DATUM}}` | Datum des Vorgangs (Export, Anlegen …) als JJMMTT; mit Format z. B. `{{DATUM:JJJJ-MM-TT}}` |  |
| `{{JAHR}}` | Jahr des Vorgangs, vierstellig |  |
| `{{JAHR_KURZ}}` | Jahr des Vorgangs, zweistellig |  |
| `{{DATUM.iso}}` | Datum des Exports als JJJJ-MM-TT |  |

<!-- /erzeugt:terrio -->

## NUMIO (Kostenermittlung)

Dateiname des Exports: `… Kosten <Stufe>.xlsx`. Das Standardlayout ist die Muster-Vorlage (Blatt „Kosten“) ohne
Hilfeblatt. Beträge sind netto und auf ganze Euro gerundet; Kostengruppen nach DIN 276.

<!-- erzeugt:numio – nicht von Hand ändern, scripts/excel-doku.mjs -->

_Beispieldaten: Kostenschätzung für das Projekt „Musterhaus“ (BGF 540 m²), Regionalfaktor 1,1; Positionen KG 300 und 400 je m² BGF, KG 530 je m² Außenanlagenfläche (von Hand festgelegt: 400 m²), KG 540 pauschal, KG 560 ausgeschaltet, KG 610 je m² Wohnfläche (ohne Menge), KG 700 in % von KG 300 + 400, Kostenrisiken pauschal; zwei festgehaltene Stände. Beträge netto, auf ganze Euro gerundet._

### Projektangaben

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter. Stammdaten des Projekts, in allen Apps gleich.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{projekt.name}}` | Projektbezeichnung |  |
| `{{projekt.code}}` | Projektcode |  |
| `{{projekt.projektcode}}` | Projektcode (gleich projekt.code) |  |
| `{{projekt.adresse}}` | Adresse in einer Zeile: „Straße Nr., PLZ Ort“ |  |
| `{{projekt.strasse}}` | Straße und Hausnummer |  |
| `{{projekt.plz}}` | Postleitzahl |  |
| `{{projekt.ort}}` | Ort |  |
| `{{projekt.plz_ort}}` | Postleitzahl und Ort |  |
| `{{projekt.bearbeiter}}` | Bearbeitung |  |
| `{{projekt.vorhaben}}` | Bezeichnung des Vorhabens |  |
| `{{bplan.nummer}}` | Bebauungsplan: Nummer |  |
| `{{bplan.name}}` | Bebauungsplan: Name |  |
| `{{bplan.text}}` | Bebauungsplan: Nummer und Name in einer Zeile |  |
| `{{buero}}` | Name des Büros (gemeinsame Einstellungen) |  |
| `{{kopf.angaben}}` | Kopfzeile wie im Druck: „Bauherr: … · Bebauungsplan: … · Büro: … · Bearbeitung: …“ |  |
| `{{grundstueck.gemarkung}}` | Gemarkung |  |
| `{{grundstueck.flur}}` | Flur |  |
| `{{grundstueck.flurstueck}}` | Flurstück |  |
| `{{grundstueck.flurtext}}` | „Gemarkung …, Flur …, Flurstück …“ |  |
| `{{grundstueck.flaeche}}` | Grundstücksfläche laut Projektdaten | m² |
| `{{bauherr.name}}` | Name der Bauherrschaft |  |
| `{{bauherr.adresse}}` | Adresse der Bauherrschaft in einer Zeile |  |
| `{{bauherr.strasse}}` | Straße der Bauherrschaft |  |
| `{{bauherr.plz}}` | Postleitzahl der Bauherrschaft |  |
| `{{bauherr.ort}}` | Ort der Bauherrschaft |  |
| `{{bauherr.plz_ort}}` | Postleitzahl und Ort der Bauherrschaft |  |
| `{{bauherr.email}}` | alle E-Mail-Adressen, mit Komma getrennt |  |
| `{{bauherr.telefon}}` | alle Telefonnummern, mit Komma getrennt |  |
| `{{datum}}` | Datum des Exports (TT.MM.JJJJ) |  |

### Grundlagen der Ermittlung

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{stufe}}` | Stufe der Kostenermittlung nach DIN 276, z. B. „Kostenschätzung“ |  |
| `{{stufe.lph}}` | Leistungsphase der Stufe, z. B. „LPh 2“ |  |
| `{{stufe.hinweis}}` | bei Kostenvoranschlag, Kostenanschlag und Kostenfeststellung: Hinweis auf die Fortschreibung mit Kennwerten, sonst leer |  |
| `{{preisstand}}` | Kostenstand (Preisstand) der Ermittlung |  |
| `{{katalog}}` | Herkunft der Kennwerte in einer Zeile |  |
| `{{katalog.name}}` | Name der Kennwertsammlung |  |
| `{{katalog.quelle}}` | Quelle der Kennwertsammlung |  |
| `{{katalog.stand}}` | Stand der Kennwertsammlung |  |
| `{{index.basis}}` | Baupreisindex zum Stand der Kennwerte (leer ohne) |  |
| `{{index.aktuell}}` | aktueller Baupreisindex (leer ohne) |  |
| `{{regionalfaktor}}` | Regionalfaktor (1 ohne Angabe) |  |
| `{{faktor}}` | daraus der Faktor auf die Kennwerte (Index × Regionalfaktor) |  |
| `{{hinweise}}` | alle Hinweise in einer Zelle (Zeilenumbrüche) – je Zeile: hinweis.text |  |
| `{{haftung}}` | Hinweis zur Herkunft der Kennwerte |  |

### Ergebnis

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter. Gesamtkosten als Mittelwert mit Bandbreite (.von/.bis); bei der Kostenfeststellung sind von, Mittel und bis gleich.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{gesamt.netto}}` | Gesamtkosten netto (Mittel), einschließlich Kostenrisiken | € |
| `{{gesamt.netto.von}}` | Gesamtkosten netto, untere Grenze | € |
| `{{gesamt.netto.bis}}` | Gesamtkosten netto, obere Grenze | € |
| `{{gesamt.brutto}}` | Gesamtkosten brutto (Mittel) | € |
| `{{gesamt.brutto.von}}` | Gesamtkosten brutto, untere Grenze | € |
| `{{gesamt.brutto.bis}}` | Gesamtkosten brutto, obere Grenze | € |
| `{{gesamt.mwst}}` | Umsatzsteuer auf das Mittel | € |
| `{{mwst}}` | Umsatzsteuersatz | % |
| `{{risiko}}` | Kostenrisiken (gesondert ausgewiesen, netto, im Gesamt netto enthalten) | € |
| `{{risiko.von}}` | Kostenrisiken, untere Grenze | € |
| `{{risiko.bis}}` | Kostenrisiken, obere Grenze | € |
| `{{kg300}}` | Summe netto einer Kostengruppe der 1. oder 2. Ebene (kg300, kg330 …) – nur Kostengruppen mit Kosten; sonst bleibt der Platzhalter stehen | € |
| `{{kg300.von}}` | dieselbe Summe, untere Grenze | € |
| `{{kg300.bis}}` | dieselbe Summe, obere Grenze | € |
| `{{kennwert.bgf}}` | Bauwerkskosten (KG 300 + 400) brutto je m² BGF (leer ohne Bezugsmenge) | €/m² |
| `{{kennwert.bgf.von}}` | Bauwerkskosten (KG 300 + 400) brutto je m² BGF, untere Grenze | €/m² |
| `{{kennwert.bgf.bis}}` | Bauwerkskosten (KG 300 + 400) brutto je m² BGF, obere Grenze | €/m² |
| `{{kennwert.bri}}` | Bauwerkskosten (KG 300 + 400) brutto je m³ BRI (leer ohne Bezugsmenge) | €/m³ |
| `{{kennwert.bri.von}}` | Bauwerkskosten (KG 300 + 400) brutto je m³ BRI, untere Grenze | €/m³ |
| `{{kennwert.bri.bis}}` | Bauwerkskosten (KG 300 + 400) brutto je m³ BRI, obere Grenze | €/m³ |
| `{{kennwert.nuf}}` | Bauwerkskosten (KG 300 + 400) brutto je m² NUF (leer ohne Bezugsmenge) | €/m² |
| `{{kennwert.nuf.von}}` | Bauwerkskosten (KG 300 + 400) brutto je m² NUF, untere Grenze | €/m² |
| `{{kennwert.nuf.bis}}` | Bauwerkskosten (KG 300 + 400) brutto je m² NUF, obere Grenze | €/m² |
| `{{kennwert.wofl}}` | Bauwerkskosten (KG 300 + 400) brutto je m² WoFl (leer ohne Bezugsmenge) | €/m² |
| `{{kennwert.wofl.von}}` | Bauwerkskosten (KG 300 + 400) brutto je m² WoFl, untere Grenze | €/m² |
| `{{kennwert.wofl.bis}}` | Bauwerkskosten (KG 300 + 400) brutto je m² WoFl, obere Grenze | €/m² |

**Beispiel: Gesamtkosten mit Bandbreite**

Vorlage:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | `{{stufe}} ({{stufe.lph}}), Stand {{preisstand}}` |  |  |  |
| 2 | `Gesamt brutto` | `{{gesamt.brutto.von}}` | `{{gesamt.brutto}}` | `{{gesamt.brutto.bis}}` |
| 3 | `KG 300` | `{{kg300}}` | `KG 530` | `{{kg530}}` |

Ergebnis:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | Kostenschätzung (LPh 2), Stand 1.7.2026 |  |  |  |
| 2 | Gesamt brutto | 1.862.031 | 2.152.139 | 2.450.729 |
| 3 | KG 300 | 1.069.200 | KG 530 | 52.800 |

### Mengen (mengen.*)

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter. Bezugsmengen als Einzelwert; je Zeile mit Ermittlung: Sammlung menge.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{mengen.bgf}}` | Brutto-Grundfläche (BGF) | m² |
| `{{mengen.bri}}` | Brutto-Rauminhalt (BRI) | m³ |
| `{{mengen.nuf}}` | Nutzungsfläche (NUF) | m² |
| `{{mengen.nrf}}` | Netto-Raumfläche (NRF) | m² |
| `{{mengen.tf}}` | Technikfläche (TF) | m² |
| `{{mengen.vf}}` | Verkehrsfläche (VF) | m² |
| `{{mengen.wofl}}` | Wohnfläche (WoFl) | m² |
| `{{mengen.grf}}` | Gründungsfläche (GRF) | m² |
| `{{mengen.bgi}}` | Baugrubenrauminhalt (BGI) | m³ |
| `{{mengen.awf}}` | Außenwandfläche (AWF) | m² |
| `{{mengen.iwf}}` | Innenwandfläche (IWF) | m² |
| `{{mengen.def}}` | Deckenfläche (DEF) | m² |
| `{{mengen.daf}}` | Dachfläche (DAF) | m² |
| `{{mengen.auf}}` | Außenanlagenfläche (AUF) | m² |
| `{{mengen.fbg}}` | Grundstücksfläche (FBG) | m² |
| `{{mengen.we}}` | Wohneinheiten (WE) | Stk |

### `kg` – Kostengruppen der 1. Ebene

**Sammlung**, Zeile je Kostengruppe. Kostengruppen der 1. Ebene nach DIN 276 mit Kosten; gibt es Kostenrisiken, folgt eine Zeile „Kostenrisiken“ ohne KG – so ergibt die Summe des Blocks das Gesamt netto.

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält** – im Block `{{#kg}}` auf den aktuellen Datensatz eingeschränkt:

- `kg2` (Kostengruppen der 2. Ebene): Kostengruppen der 2. Ebene dieser Kostengruppe
- `position` (Positionen): Positionen dieser Kostengruppe (in der Zeile „Kostenrisiken“ die Risiko-Positionen)

**Benannter Einzelzugriff:** `{{kg:NAME.feld}}` – Summe einer Kostengruppe der 1. Ebene über ihre Nummer (Felder wie kg.*). Beispiel: `{{kg:300.mittel}}`. Nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{kg.kg}}` | Kostengruppe nach DIN 276, z. B. „300“ (leer in der Zeile „Kostenrisiken“) |  |
| `{{kg.name}}` | Bezeichnung der Kostengruppe nach DIN 276 |  |
| `{{kg.von}}` | Summe netto, untere Grenze der Bandbreite | € |
| `{{kg.mittel}}` | Summe netto, Mittelwert | € |
| `{{kg.bis}}` | Summe netto, obere Grenze der Bandbreite | € |

Benannte Filter: keine – allgemeine Filter gehen.

- Ohne Kostenrisiken in der Liste: `{{kg[kg!=].name}}` … – der Filter „kg ungleich leer“ lässt die Zeile „Kostenrisiken“ weg.

**Beispiel: Kostenübersicht mit Summe**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{kg.kg}}` | `{{kg.name}}` | `{{kg.mittel}}` |
| 2 |  | `Gesamt netto` | `=SUM(C1:C1)` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | 300 | Bauwerk – Baukonstruktionen | 1.069.200 |
| 2 | 400 | Bauwerk – Technische Anlagen | 356.400 |
| 3 | 500 | Außenanlagen und Freiflächen | 82.800 |
| 4 | 600 | Ausstattung und Kunstwerke | 0 |
| 5 | 700 | Baunebenkosten | 285.120 |
| 6 |  | Kostenrisiken | 15.000 |
| 7 |  | Gesamt netto | `=SUM(C1:C6)` |

**Beispiel: Block je Kostengruppe mit Positionen**

Vorlage:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | `{{#kg[kg=500]}}{{kg.kg}}` | `{{kg.name}}` | `{{kg.mittel}}` |  |
| 2 |  | `{{position.kg}} {{position.bezeichnung}}` | `{{position.kosten}}` | `{{position.aktiv}}{{/kg}}` |

Ergebnis:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | 500 | Außenanlagen und Freiflächen | 82.800 |  |
| 2 |  | 530 Befestigte Flächen | 52.800 | ja |
| 3 |  | 540 Carport | 30.000 | ja |
| 4 |  | 560 Einbauten in Außenanlagen | 5.000 |  |

### `kg2` – Kostengruppen der 2. Ebene

**Sammlung**, Zeile je Kostengruppe der 2. Ebene. Kostengruppen der 2. Ebene nach DIN 276 (z. B. 330, 530) mit Kosten.

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält** – im Block `{{#kg2}}` auf den aktuellen Datensatz eingeschränkt:

- `position` (Positionen): Positionen dieser Kostengruppe

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{kg2.kg}}` | Kostengruppe nach DIN 276, z. B. „300“ (leer in der Zeile „Kostenrisiken“) |  |
| `{{kg2.name}}` | Bezeichnung der Kostengruppe nach DIN 276 |  |
| `{{kg2.von}}` | Summe netto, untere Grenze der Bandbreite | € |
| `{{kg2.mittel}}` | Summe netto, Mittelwert | € |
| `{{kg2.bis}}` | Summe netto, obere Grenze der Bandbreite | € |

Benannte Filter: keine – allgemeine Filter gehen.

**Beispiel: Zweite Ebene**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{kg2.kg}}` | `{{kg2.name}}` | `{{kg2.mittel}}` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | 530 | Oberbau, Deckschichten | 52.800 |
| 2 | 540 | Baukonstruktionen | 30.000 |
| 3 | 610 | Allgemeine Ausstattung | 0 |

**Beispiel: Erste und zweite Ebene verschachtelt**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{#kg[kg=500]}}{{kg.kg}}` | `{{kg.name}}` | `{{kg.mittel}}` |
| 2 | `{{#kg2}}` | `{{kg2.kg}} {{kg2.name}}` | `{{kg2.mittel}}` |
| 3 |  | `{{position.bezeichnung}}` | `{{position.kosten}}{{/kg2}}` |
| 4 | `{{/kg}}` |  |  |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | 500 | Außenanlagen und Freiflächen | 82.800 |
| 2 |  | 530 Oberbau, Deckschichten | 52.800 |
| 3 |  | Befestigte Flächen | 52.800 |
| 4 |  | 540 Baukonstruktionen | 30.000 |
| 5 |  | Carport | 30.000 |

### `position` – Positionen

**Sammlung**, Zeile je Position. Alle Positionen der Ermittlung, auch ausgeschaltete (dann aktiv leer) und Kostenrisiken (kg leer, kg_name „Kostenrisiken“).

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält:** keine Unterpunkte – im Block `{{#position}}` laufen andere Sammlungen über alle Datensätze.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{position.nr}}` | laufende Nummer |  |
| `{{position.kg}}` | Kostengruppe nach DIN 276 (leer bei Kostenrisiken) |  |
| `{{position.kg_name}}` | Bezeichnung der Kostengruppe |  |
| `{{position.bezeichnung}}` | Bezeichnung der Position |  |
| `{{position.bezug}}` | Bezugsgröße, z. B. „m² BGF“, „psch“, „% von KG 300 + 400“ |  |
| `{{position.menge}}` | Menge (bei % die Grundlage in €) |  |
| `{{position.einheit}}` | Einheit der Menge (bei % „€“) |  |
| `{{position.kennwert}}` | Kennwert netto nach Faktor, Mittel (bei % der Prozentsatz, bei Pauschalen der Betrag) |  |
| `{{position.kennwert_von}}` | Kennwert, untere Grenze |  |
| `{{position.kennwert_bis}}` | Kennwert, obere Grenze |  |
| `{{position.kosten}}` | Kosten netto, Mittel (auch bei ausgeschalteten Positionen berechnet) | € |
| `{{position.kosten_von}}` | Kosten netto, untere Grenze | € |
| `{{position.kosten_bis}}` | Kosten netto, obere Grenze | € |
| `{{position.aktiv}}` | „ja“, wenn die Position gerechnet wird |  |
| `{{position.quelle}}` | Herkunft des Kennwerts |  |
| `{{position.bemerkung}}` | Bemerkung |  |
| `{{position.hinweis}}` | Hinweis zur Position, z. B. fehlende Menge |  |

| Benannter Filter | Bedeutung |
| --- | --- |
| `[aktiv]` | gerechnete Positionen |
| `[aus]` | ausgeschaltete Positionen |

- Ausgeschaltete Positionen erscheinen ohne Filter mit – für eine Aufstellung nur der gerechneten Positionen [aktiv] verwenden.

**Beispiel: Gerechnete Positionen einer Kostengruppe**

Vorlage:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | `{{position[aktiv,kg>=500,kg<600].kg}}` | `{{position[aktiv,kg>=500,kg<600].bezeichnung}}` | `{{position.menge}} {{position.einheit}}` | `{{position.kosten}}` |

Ergebnis:

|  | A | B | C | D |
| --- | --- | --- | --- | --- |
| 1 | 530 | Befestigte Flächen | 400 m² | 52.800 |
| 2 | 540 | Carport | 1 psch | 30.000 |

**Beispiel: Ausgeschaltete Positionen nur, wenn es welche gibt**

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{#wenn position[aus]}}Nicht gerechnet:` | `{{position[aus].bezeichnung}}{{/wenn}}` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | Nicht gerechnet: | Einbauten in Außenanlagen |

### `menge` – Mengen

**Sammlung**, Zeile je Menge. Alle Bezugsmengen mit Kürzel, Wert und Ermittlung (als Einzelwert: mengen.*).

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält:** keine Unterpunkte – im Block `{{#menge}}` laufen andere Sammlungen über alle Datensätze.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{menge.kurz}}` | Kürzel, z. B. „BGF“ |  |
| `{{menge.label}}` | Bezeichnung, z. B. „Brutto-Grundfläche“ |  |
| `{{menge.wert}}` | Wert |  |
| `{{menge.einheit}}` | Einheit, z. B. „m²“ |  |
| `{{menge.ermittlung}}` | wie die Menge ermittelt wurde bzw. „festgelegt“ |  |
| `{{menge.festgelegt}}` | „ja“, wenn von Hand festgelegt |  |

| Benannter Filter | Bedeutung |
| --- | --- |
| `[festgelegt]` | von Hand festgelegte Mengen |

**Beispiel: Mengen mit Wert**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{menge[wert>0,wert<300].kurz}}` | `{{menge.wert}}` | `{{menge.einheit}}` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | GRF | 135 | m² |
| 2 | DAF | 190,92 | m² |

### `stand` – Festgehaltene Stände

**Sammlung**, Zeile je Stand. Festgehaltene Stände der Kostenermittlung (Kostenkontrolle).

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält:** keine Unterpunkte – im Block `{{#stand}}` laufen andere Sammlungen über alle Datensätze.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{stand.nr}}` | laufende Nummer |  |
| `{{stand.datum}}` | Datum des Stands (T.M.JJJJ, ohne führende Null) |  |
| `{{stand.stufe}}` | Stufe der Kostenermittlung |  |
| `{{stand.bemerkung}}` | Bemerkung |  |
| `{{stand.netto}}` | Gesamtkosten netto (Mittel) | € |
| `{{stand.brutto}}` | Gesamtkosten brutto (Mittel) | € |
| `{{stand.brutto_von}}` | Gesamtkosten brutto, untere Grenze | € |
| `{{stand.brutto_bis}}` | Gesamtkosten brutto, obere Grenze | € |

Benannte Filter: keine – allgemeine Filter gehen.

**Beispiel: Kostenkontrolle**

Vorlage:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | `{{stand.datum}}` | `{{stand.stufe}}` | `{{stand.brutto}}` |

Ergebnis:

|  | A | B | C |
| --- | --- | --- | --- |
| 1 | 1.3.2026 | Kostenrahmen | 2.152.139 |
| 2 | 1.7.2026 | Kostenschätzung | 2.152.139 |

### `hinweis` – Hinweise

**Sammlung**, Zeile je Hinweis. Hinweise zur Ermittlung (fehlende Mengen, Faktoren, doppelte Positionen …).

**Wo nutzbar:** Zelle, Wiederholt die Zeile, Block {{#…}}, Bedingung {{#wenn}}; nicht: Kopf-/Fußzeile, Textfeld. Filter: benannte (unten) und allgemeine (`[feld=wert]` …).

**Enthält:** keine Unterpunkte – im Block `{{#hinweis}}` laufen andere Sammlungen über alle Datensätze.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{hinweis.nr}}` | laufende Nummer |  |
| `{{hinweis.text}}` | Hinweis |  |

Benannte Filter: keine – allgemeine Filter gehen.

**Beispiel: Hinweise**

Vorlage:

|  | A | B |
| --- | --- | --- |
| 1 | `{{hinweis.nr}}` | `{{hinweis.text}}` |

Ergebnis:

|  | A | B |
| --- | --- | --- |
| 1 | 1 | 1 Position ohne Menge oder Kennwert: KG 610 (WoFl ist 0). |
| 2 | 2 | Kennwerte mit Faktor 1,1 angepasst (Baupreisindex/Regionalfaktor); Pauschalen und Prozentsätze unverändert. |

### Globale Variablen

**Einzelwerte** – nutzbar: Zelle, Bedingung {{#wenn}}, Kopf-/Fußzeile, Textfeld; nicht: Block {{#…}}; keine Filter. Gelten in allen Apps gleich, auch in Datei- und Ordnernamen. DATUM, JAHR und JAHR_KURZ gehen mit Format: `{{DATUM:TT.MM.JJJJ}}`, `{{JAHR:JJ}}`.

| Platzhalter | Bedeutung | Einheit |
| --- | --- | --- |
| `{{PROJEKT_KUERZEL}}` | Projektkürzel bzw. Projektnummer |  |
| `{{PROJEKT_KURZNAME}}` | Kurzname des Projekts |  |
| `{{PROJEKT_VORHABEN}}` | Bezeichnung des Vorhabens |  |
| `{{BEARBEITER}}` | Bearbeitung (Kürzel bzw. Name) |  |
| `{{DATUM}}` | Datum des Vorgangs (Export, Anlegen …) als JJMMTT; mit Format z. B. `{{DATUM:JJJJ-MM-TT}}` |  |
| `{{JAHR}}` | Jahr des Vorgangs, vierstellig |  |
| `{{JAHR_KURZ}}` | Jahr des Vorgangs, zweistellig |  |
| `{{DATUM.iso}}` | Datum des Exports als JJJJ-MM-TT |  |

<!-- /erzeugt:numio -->

## Einschränkungen

- Nur `.xlsx` (kein `.xls`/`.xlsm`)
- Der Bereich oberhalb der ersten Wiederholung (Kopf, Logo) bleibt unverändert. Bilder und Logos der
  Vorlage – auch in Kopf-/Fußzeile und als Blatthintergrund – werden unverändert übernommen, aber im
  wiederholten Bereich nicht vervielfältigt (ebenso bedingte Formatierungen und Datenüberprüfungen)
- Verbundene Zellen werden je Zeile übernommen, mehrzeilige Verbünde im wiederholten Bereich nicht
