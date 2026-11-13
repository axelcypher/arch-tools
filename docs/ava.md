# FABRIO (AVA)

Die App **FABRIO** (`apps/ava`, eigene App mit eigenem Installer, auch als Tab in Arkly, der Rahmen-App) ist für
Ausschreibung, Vergabe, Abrechnung und Bauleitung da und ersetzt das LV-Programm des Büros: Leistungsverzeichnisse
anlegen und bearbeiten, Angebote prüfen, Preisspiegel, Vergabe, Nachträge, Rechnungsprüfung und Kostenkontrolle –
dazu Bauleitung mit Bautagebuch, Protokollen, Mängeln, Notizen, Beteiligten und Mailverlauf. Bis Version 0.4.0
hieß die App „AVA“; Einstellungen und Daten bleiben beim Update erhalten.

Grundsätze:

- **Das Originalprogramm bleibt das Backend, wenn es da ist.** LV-Dateien (`.aslv`) werden in ihrem Format gelesen
  und geschrieben; was die App nicht kennt, bleibt Byte für Byte erhalten, eine unveränderte Datei wird
  unverändert zurückgegeben. Ohne das Originalprogramm arbeitet die App mit ihrem **eigenen Format** (`.oalv`)
  und ist voll nutzbar.
- **Die Kostenkontrolle bleibt die Excel-Mappe des Büros.** Die App liest sie, führt sie mit den LV-Dateien und
  den Rechnungen im Auftragsordner zusammen und schreibt nur in einzelne Zellen – danach funktioniert die Mappe
  ohne die App und sieht aus wie vorher.
- **Metadaten aus der Projektdatei (`.oap`)**: Stammdaten (Projektnummer, Vorhaben, Bauherr, Bearbeiter) wie in
  allen Apps; die Angaben der App zum Projekt stehen im Abschnitt `ava`.
- **Ohne Produktnamen:** Die Oberfläche nennt kein anderes Programm („LV-Datei (.aslv)“).
- **Alles einstellbar:** Ablagestruktur, Dateinamen der Rechnungen, Prüfvorgaben, Deckblatt, Scanordner und
  Mailvorlagen gelten für das ganze Büro (gemeinsamer Konfigurationsordner, Bereich `ava`) – die App funktioniert
  nicht nur mit der Struktur eines Büros.

## Ablage im Projektordner

Vorgabe (alles unter ⚙ Einstellungen › Ablage änderbar):

| Ort | Inhalt |
|---|---|
| `Gewerke\<GEWERK>\` | ein Ordner je Gewerk, z. B. `G08 Fenster` (Kennung G + Nummer, dann die Bezeichnung) – darin die LV-Dateien |
| `Gewerke\<GEWERK>\Auftrag\` | vergebene Aufträge, Nachträge, Rechnungen (PDF) |
| `Gewerke\<GEWERK>\Korrespondenz\` | Mailverkehr des Gewerks (`.msg`, `.eml`) |
| `…\Archiv`, `…\_archiv` | alte Fassungen – im Gewerk und im Auftragsordner; ihr Inhalt zählt als alt |
| Kostenkontrolle | Excel mit „Kostenkontrolle“ im Namen, irgendwo im Projekt (bis vier Ebenen); „AKTUELL“ im Namen geht vor, dann das jüngste Datum im Namen (JJMMTT), dann die zuletzt geänderte. Je Projekt lässt sich eine andere wählen (Kostenübersicht). |
| `Bauleitung\` | abgelegte PDFs: `Bautagebuch\`, `Protokolle\`, `Mängel\` |

Die Gewerkkennungen werden vereinheitlicht: „G08“, „G8“, „G 8“ und „G1 “ (mit Leerzeichen) sind dasselbe
Gewerk – in Ordnern, Blattnamen und der Rechnungsliste.

## Bedienung

- **Projektwahl** wie in allen Apps (Projektübersicht aus den Stammordnern, zuletzt geöffnet). Gelesen werden
  nur die Ordnerliste, die Kostenkontrolle und die Projektdatei; LV-Dateien erst beim Öffnen. „Neu einlesen“ in der
  Navigation – und automatisch, wenn das Fenster wieder in den Vordergrund kommt.
- **Navigation** (links, Breite ziehbar): Kostenübersicht, Rechnungen, Rechnungseingang; die **Gewerke** aus
  Ordnern, Kostenkontrolle und Prüfungen (mit Zahl der LV-Dateien); **Bauleitung**; ⚙ Einstellungen (Strg+,).
- **Kostenübersicht:** je Gewerk Kostenschätzung, Kostenanschlag (Aufträge), Abweichung, Kostenfeststellung
  (Rechnungen), offen und ein Balken „abgerechnet“; Summen und Kennzahlen oben, darunter die **Hinweise**
  (siehe Abrechnung). Ein Klick führt zu den Rechnungen des Gewerks.

### Gewerk

Kopf mit Kennung, Bezeichnung, Auftragnehmer und Ordner; rechts die LV-Dateien des Gewerks (aktuelle zuerst,
Archiv gekennzeichnet), „Neues LV …“, „GAEB-Import …“ und „Speichern“ (Strg+S). Beim Betreten öffnet sich das
aktuellste LV. Wer mit ungespeicherten Änderungen das Gewerk oder Projekt wechselt, wird gefragt.

**Leistungsverzeichnis**

- Tabelle der Gliederung: Abschnitte (mit Summe des Kostenansatzes), Positionen, Hinweise und Vorbemerkungen;
  volle OZ nach der OZ-Maske („02.0010“). Menge und Einheitspreis des Kostenansatzes lassen sich direkt in der
  Tabelle ändern (deutsche Schreibweise, ungültige Eingaben bleiben rot stehen).
- Werkzeuge: + Abschnitt, + Position (im gewählten Abschnitt bzw. hinter der gewählten Position), + Hinweis,
  + Vorbemerkung, „Aus Vorlage …“, Duplizieren (Strg+D), ↑/↓, ←/→ (aus dem Abschnitt heraus bzw. in den Abschnitt
  davor), Entfernen (Entf), Neu nummerieren, LV-Eigenschaften, Drucken, GAEB-Export, Rückgängig/Wiederholen
  (Strg+Z/Y), Suche nach OZ und Kurztext. Tastatur in der Tabelle: ↑/↓ wählen, Einfg neue Position.
- **Seitenpanel** des gewählten Elements: OZ, Kurztext, Langtext (fett, kursiv, unterstrichen, Aufzählung –
  übernommen beim Verlassen, ein Schritt im Verlauf), Menge, Einheit (Vorschläge), Einheitspreis des
  Kostenansatzes, **Art der Position** (Normal-, Bedarfs-, Grund-, Wahl-, Zulageposition), Kostengruppe nach
  DIN 276, Nachtrag (0 = Hauptauftrag) und der Gesamtbetrag. In LV-Dateien des Originalprogramms gibt es nur
  Normal- und Bedarfspositionen (Grund-, Wahl- und Zulagepositionen nur im eigenen Format).
- **Vorlagetexte** (eigene Datenbank statt externer Textquellen): suchen, als Position einfügen oder die Texte
  der gewählten Position ersetzen; „Als Vorlage speichern“ an einer Position, „Aus diesem LV übernehmen“ für alle
  Positionen (gleiche Texte nur einmal). Gruppiert nach Gewerk, mit Einheit, Kostengruppe und Richtpreis; sie
  liegen für das ganze Büro im gemeinsamen Konfigurationsordner (Bereich `ava-texte`).
- **LV-Eigenschaften:** Bezeichnung, LV-Nummer, Datum, Vergabeart, Angebotsabgabe (Datum, Uhrzeit), Bindefrist,
  Ausführung von/bis, Projekt, Auftraggeber, Aufgestellt von, Ort der Angebotsabgabe, Umsatzsteuer, Währung,
  Preisanteile und die **OZ-Maske** (Ebenen mit Name, Stellen, Schritt, aktiv; Stellen und Schritt der Positionen).
- **Drucken:** Leistungsbeschreibung mit Leistungsverzeichnis (A4 hoch) – ohne Preise für die Bieter (mit
  Punktlinien und Unterschriftszeile) oder mit den Preisen eines Bieters; Langtexte ein- und ausblendbar.

**Angebote & Preisspiegel**

- Bieter: Name, Angebotsdatum, Nachlass in %, gewertet (ausgeschlossene zählen weder im Preisspiegel noch in der
  Rangfolge), Summe netto, nach Nachlass, brutto, Rang, Abstand zum Ersten, Anzahl der Preise. Der Kostenansatz
  (eigene Kostenberechnung) steht als erste Zeile.
- **Preise erfassen:** je Bieter die Einheitspreise in LV-Reihenfolge, Enter springt zur nächsten Position;
  Abweichung zum Kostenansatz, über 30 % hervorgehoben; „Leere Preise aus dem Kostenansatz“.
- **Angebot aus GAEB (X84)** übernimmt die Einheitspreise einer Angebotsdatei als neuen Bieter – Zuordnung über
  die vollständige OZ, führende Nullen egal; was nicht zugeordnet werden konnte, wird genannt.
- **Preisspiegel:** je Position Einheitspreis und Gesamtbetrag aller gewerteten Bieter, Kostenansatz zum
  Vergleich, Mittelwert; günstigster grün, teuerster rot, auffällige (± 30 % vom Mittel bei mindestens drei
  Preisen) umrandet, Filter „nur auffällige“; Abschnittssummen, Summe, Nachlass, USt, brutto. Druck A4 quer mit
  Rangfolge.

**Auftrag & Nachträge**

- Vergabe an einen Bieter (aus der Rangfolge), Auftragsdatum, Auftragssumme netto (leer = Angebot nach
  Nachlass), brutto. **„In die Kostenkontrolle übernehmen …“** trägt den Auftrag als neue Zeile in den
  Kostenanschlag des Gewerkblatts ein (und den Auftragnehmer, falls er fehlt) – nach einer Rückfrage, die sagt,
  wo.
- Nachträge mit Nummer, Bezeichnung, Datum, Status (angeboten, beauftragt, abgelehnt) und Betrag (leer = Summe
  der Positionen mit dieser Nachtragsnummer); beauftragte lassen sich ebenso in den Kostenanschlag übernehmen.
- Stand der Kostenkontrolle für das Gewerk (Aufträge A1 …, Kostenanschlag) mit Hinweis, wenn er von der
  Auftragssumme im LV abweicht.
- Auftragnehmer & Zahlung: Firma, Ansprechpartner, E-Mail, Telefon, und wer die Rechnungen zahlt (für die
  Mailentwürfe; leer = Vorgabe des Projekts, sonst der Bauherr). Dokumente im Auftragsordner (Doppelklick öffnet).

**Rechnungen** und **Dateien & Korrespondenz:** siehe unten bzw. alle Dateien des Gewerks (Auftrag,
Rechnungen, LV-Dateien, Mails mit Vorschau, weitere; Archiv ein- und ausblendbar).

## Abrechnung

### Zusammenführung der Quellen

Je Gewerk werden die Rechnungen aus allen Quellen zusammengeführt (`abrechnung/aggregat.ts`):

| Quelle | Kürzel | Was |
|---|---|---|
| Rechnungsliste der Kostenkontrolle | L | laufende Nummer, Gewerk, Firma/Art, Rechnungs- und Freigabedatum, Betrag, Bemerkung |
| Gewerkblatt der Kostenkontrolle | G | Kostenfeststellung: Nummer, Text, Datum, Betrag |
| Auftragsordner | P | PDFs, am Dateinamen erkannt (Nummer, Art, Firma, Datum) |
| Projektdatei (`ava`) | A | Prüfungen der App: Korrektur, Status (erfasst, abgelegt, weitergeleitet) |

Zuordnung: Gewerkblatt über Nummer und Betrag, sonst Betrag, sonst Text; PDFs über die Nummer im Dateinamen,
sonst Datum und Art. **Hinweise**, nie blockierend: andere Nummer im Gewerkblatt als in der Rechnungsliste,
abweichende Beträge, fehlt in der Kostenfeststellung, steht nur im Gewerkblatt, PDF ohne Eintrag, keine PDF im
Auftragsordner, Kostenfeststellung ≠ Summe der Rechnungsliste, Gewerkblatt mit falscher Kennung in der
Kopfzeile (Kopierfehler).

### Rechnungsprüfung

Der Ablauf des Büros – Papier prüfen, Korrektur rechnen, nächste freie Nummer, stempeln, unterschreiben, mit
Deckblatt scannen, im Auftragsordner ablegen, an den Zahler weiterleiten – in zwei Schritten
(`abrechnung/ablauf.ts`):

1. **Neue Rechnung prüfen** (Rechnungseingang, Rechnungen, Gewerk): Gewerk, Firma (vom Gewerk), Rechnungsart
   mit laufender Nummer (AB 2 folgt auf AB 1), Rechnungsnummer der Firma, Rechnungs- und Freigabedatum. Mit
   **Rechnungskorrektur** (Vorgabe): Netto-Forderung laut Rechnung, geprüfte Netto-Freigabesumme, Nachlass, USt,
   Gemeinkostenumlage, Sicherheitseinbehalt (bei Schlussrechnungen 0), Skonto, Anmerkung und **„Davon bereits
   erhalten“** (vorgeschlagen aus den bisherigen Zahlungen des Gewerks) – rechts die Rechnung Schritt für Schritt
   bis zur Zahlungsfreigabe. Ohne Korrektur nur der freigegebene Betrag. Unten die **nächste freie Nummer** und der
   künftige Dateiname.
   **„Erfassen & Nr. … vergeben“** liest die Kostenkontrolle frisch (keine doppelte Nummer, auch wenn ein Kollege
   gerade eingetragen hat), trägt die Rechnung in die nächste freie Zeile der Rechnungsliste (die Nummer kommt aus
   deren Formel) und in die Kostenfeststellung des Gewerkblatts ein, speichert die Prüfung in der Projektdatei
   und bietet das **Deckblatt** zum Drucken an. Ist die Mappe in Excel geöffnet, wird nichts geschrieben.
2. **Rechnungseingang:** links die Scans aus dem Scanordner (neueste zuerst, alle 10 s neu gelesen), in der Mitte
   die Vorschau, rechts die erfassten Rechnungen ohne Scan. **„Zuordnen & ablegen …“** benennt den Scan nach dem
   Muster und verschiebt ihn in den Auftragsordner des Gewerks (nie überschreibend; der Scan verschwindet erst,
   wenn die Datei vollständig im Projekt liegt, vorher eine Sicherungskopie) – auf Wunsch mit dem Deckblatt
   digital als erster Seite. Danach: **Mailentwurf an den Zahler** mit der Rechnung als Anhang.

Rechnung (jeder Schritt auf Cent gerundet, wie im Deckblatt des Büros): Netto-Freigabesumme − Nachlass =
1. Zwischensumme; + USt = Brutto-Freigabesumme; − Gemeinkostenumlage = 2. Zwischensumme; − Sicherheitseinbehalt =
3. Zwischensumme; − Skonto = Endsumme; − bereits erhalten = **Zahlungsfreigabe** (so in die Rechnungsliste).
Beispiel aus dem Büro: AB 1 mit 26.110,22 € netto → 27.824,22 €; die SR 1 darüber ohne Einbehalt, abzüglich der
AB 1 → 3.091,58 €.

### Dateinamen der Rechnungen

Muster mit Platzhaltern (Einstellungen › Rechnungen & Benennung; Schreibweise wie in allen Apps, siehe
[platzhalter.md](platzhalter.md)): global `{PROJEKT_KUERZEL}` Projektnummer (und die übrigen globalen Variablen,
beim Erkennen als beliebiger Text), lokal `{Nr}` bzw. `{Nr:3}` Nummer der Rechnungsliste (dreistellig), `{Art}`
Rechnungsart (AB, SR, TSR, R – einstellbar), `{Lfd}` laufende Nummer der Art, `{Firma}`, `{Rechnungsdatum}` als
JJMMTT, `{Gewerk}` („G08“). Das erste Muster gilt für neue Dateien, alle zum Erkennen vorhandener – die Benennung war
nicht immer einheitlich. Gespeicherte Muster mit `{Kürzel}` und `{Datum}` (= Rechnungsdatum) gelten weiter. Vorgabe:

| Muster | Beispiel |
|---|---|
| `{PROJEKT_KUERZEL} R{Nr:3} {Firma} {Rechnungsdatum} {Art}{Lfd}` | `K62 R021 Witthaut 251024 AB1.pdf` |
| `{PROJEKT_KUERZEL} {Rechnungsdatum} {Lfd}.{Art} Fa. {Firma}` | `HVO 261111 1.AB Fa. Tischer.pdf` |
| `{PROJEKT_KUERZEL} {Rechnungsdatum} {Art}{Lfd} {Firma}` | `K62 251024 SR1 Witthaut.pdf` |

Unterstriche statt Leerzeichen werden erkannt. Die Einstellungen zeigen ein Beispiel und probieren das Erkennen
an einem Dateinamen aus.

### Deckblatt

„Kostenfeststellung / Anhang Rechnungsprüfung“ als PDF im Aufbau des Büro-Vordrucks (`abrechnung/deckblatt.ts`):
Bauherr als Empfänger, Projektnummer, Vorhaben und Adresse, Gewerk, Firma, Zahlungsfreigabe (AB 1), Freigabe-
datum, Rechnungsart, Rechnungsdatum, Netto-Forderung, die Rechnung mit allen Schritten, bereits erhaltene
Zahlungen, Überweisungsbetrag, Schlusstext, Gruß, Büro und „i.A. …“. Mit einem **Briefbogen** (PDF, erste Seite als
Hintergrund) sieht es aus wie bisher; ohne steht der Büroname oben rechts und die Fußzeile aus den
Einstellungen unten. Die Nummer der Rechnungsliste lässt sich zusätzlich aufdrucken. Das Deckblatt öffnet sich
zum Drucken im PDF-Programm (Temp-Ordner) und lässt sich jederzeit aus der Rechnungsliste neu erzeugen.

### Mailentwürfe

Mails entstehen als `.eml` mit `X-Unsent: 1` und eingebettetem Anhang (`abrechnung/mail.ts`) und öffnen sich im
Mailprogramm – Outlook zeigt sie als neue, ungesendete Nachricht mit Empfänger, Betreff, Text und Anhang: nur
noch „Senden“. Vorlagen (Einstellungen › Mailvorlagen) mit den globalen Platzhaltern
(`{PROJEKT_KUERZEL}`, `{PROJEKT_VORHABEN}` – ohne Vorhaben der Projektname –, `{BEARBEITER}` – zuerst die Angabe des
Deckblatts – …, siehe [platzhalter.md](platzhalter.md)) und lokal `{Gewerk} {Firma} {FirmaMail} {Rechnung} {Nr}
{Betrag} {Rechnungsdatum} {Zahler}`, in der Protokollvorlage `{Nr} {Protokolldatum} {Teilnehmer}`. Die Chips unter
der Vorlage fügen in das zuletzt bearbeitete Feld ein. Alte Namen (`{Kürzel}`, `{Projekt}`, `{Datum}`, `{Firma-Mail}`,
`{Bearbeiter}`) gelten weiter; „Auf neue Namen umstellen“ stellt um. Mitgeliefert: geprüfte Rechnung an den Zahler, Auftrag
an die Firma, Protokoll an die Teilnehmer.

### Kostenkontrolle (Excel)

Gelesen nach Beschriftungen, nicht nach festen Zellen (`abrechnung/kostenkontrolle.ts`):

- **Rechnungsliste:** Blatt „Rechnungsliste“ (sonst das erste mit „Gewerk“, „Nr.“, „Betrag“ im Kopf); Spalten
  Gewerk, Nr., Rechnung, Rechn. Datum, Freigabe Datum, Betrag €, Bemerkungen; die erste leere Zeile ist die
  nächste, ihre Nummer kommt aus der Formel der Spalte (fortlaufend), sonst die höchste + 1. Nummern wie „18a“
  bleiben Text.
- **Gewerkblätter:** jedes Blatt mit „Kostenanschlag“ und „Kostenfeststellung“; die Zeilen der Bereiche aus den
  SUM-Formeln daneben (`=SUM(D16:D25)`), also auch Blätter mit 15 Aufträgen oder anderen Zeilen; Spalten aus den
  Köpfen „Datum“, „Einzelsummen“, „Gesamtsumme“; Gewerk, Auftragnehmer und Kostenschätzung aus den
  Beschriftungen „Gewerk/Kostengruppe“, „Auftragnehmer“, „Kostenschätzung“.
- **Übersicht:** Blatt „Übersicht“, je Gewerk Kostenschätzung, Kostenanschlag, Kostenfeststellung.

Geschrieben werden nur Werte in einzelne Zellen – Text, Zahl, Datum (als Excel-Datum im Format der Zelle bzw. der
Zeile darüber) –, nie Formeln, Formate, Zeilen oder Blätter. Danach rechnet die App **alle Formeln der Mappe nach**
(auch blattübergreifend wie `='G 8'!E15`, ganze Spalten wie `=SUM(F:F)`, `TODAY()`) und frischt die
zwischengespeicherten Ergebnisse auf – die Datei zeigt überall die neuen Summen, auch in der Vorschau des
Explorers; Excel rechnet beim Öffnen ohnehin neu. Geteilte Formeln (Excel speichert sie nur in der ersten Zelle)
werden ausgeschrieben, falls ihre Hauptzelle geändert wird. Ersetzt wird die Mappe nur, wenn sie seit dem Lesen
niemand geändert hat und sie nicht in Excel geöffnet ist – mit Sicherungskopie im App-Ordner.

## Bauleitung

- **Bautagebuch:** ein Tagesbericht je Tag mit Nummer, Verfasser, **Wetter** und Temperatur („abrufen“: Open-Meteo
  am Ort des Vorhabens – gesendet werden nur die Koordinaten aus den Stammdaten und das Datum, erst auf Knopfdruck),
  Firmen auf der Baustelle (aus Kostenkontrolle und Gewerken, mit Personen und Tätigkeit; ein neuer Bericht
  übernimmt die Firmen des letzten), ausgeführte Leistungen, Behinderungen, Anordnungen, Besucher und **Fotos des
  Tages** (aus dem Fotoordner der gemeinsamen Einstellungen, nach Aufnahmetag). PDF ansehen bzw. im Projekt
  ablegen.
- **Protokolle:** Art (Baubesprechung, Jour fixe …), Nummer, Datum, Beginn/Ende, Ort, Verfasser, nächster Termin,
  Teilnehmer (aus den Beteiligten bzw. dem letzten Protokoll, anwesend/entschuldigt, E-Mail),
  Besprechungspunkte mit Zuständigkeit, Frist und „erledigt“; ein neues Protokoll übernimmt auf Wunsch die
  **offenen Punkte** des letzten (mit Vermerk). PDF ansehen, ablegen oder **an die Teilnehmer mailen** (Entwurf mit
  PDF).
- **Mängel:** Nummer, Gewerk, Firma (aus dem Gewerk), Ort, Beschreibung, festgestellt, Frist, Status (offen,
  angezeigt, erledigt, abgenommen); überfällige rot. Mängelliste als PDF, **Mängelanzeige** an die Firma eines
  Gewerks (Mailentwurf mit PDF, die Mängel gelten dann als angezeigt).
- **Notizen & Aufgaben:** zum Projekt oder Gewerk, mit Frist als Aufgabe (abhaken, überfällige rot, Filter).
- **Beteiligte:** Rolle, Firma, Name, E-Mail, Telefon, Gewerk; „Aus Stammdaten und Gewerken übernehmen“ (Bauherr,
  Beteiligte der Stammdaten, Auftragnehmer); wer die Rechnungen zahlt (Vorgabe für alle Gewerke).
- **Mailverlauf:** alle Mails (`.eml`, `.msg`) aus den Korrespondenzordnern der Gewerke und den Mailordnern des
  Projekts, nach Datum, mit Gewerk, Suche in Betreff, Absender und Text, Vorschau mit Anhängen; Doppelklick öffnet
  im Mailprogramm.

## Einstellungen

Modal mit den Ebenen Ablage, Rechnungen & Benennung, Prüfung (Vorgaben für USt, Umlage, Einbehalt, Nachlass,
Skonto), Deckblatt (Briefbogen, Büro, Unterschrift, Schlusstext, Fußzeile), Scanordner (Pfad, Endungen),
Mailvorlagen und Leistungsverzeichnisse (Format neuer LV-Dateien, Dateiname). Gespeichert im gemeinsamen
Konfigurationsordner (`ava.json`), also für das ganze Büro; „Vorgabe“ setzt alles zurück.

## Dateiformate

### LV-Datei des Originalprogramms (`.aslv`)

zlib-komprimiertes XML (UTF-8 mit BOM, CRLF), Wurzel `<AVAPLANStudio V="V1.0" T="LV">`. Fast alles steht als
`<Parameter Name="…" Value="…"/>` in ParameterListen; Langtexte als RTF (WPTools) im Attribut, mit `&apos;` und
rohen Zeilenumbrüchen.

| Element | Inhalt |
|---|---|
| `LV` › ParameterList | Text1 (Bezeichnung), LVNr, LVDate, LVDateOffen, LVDateFrist, LVDateBegin/Ende (teils deutsch geschrieben), LVVergabeArt, LVPrName, LVPrBez/LVAGAdr/LVErsteller/LVAdrOffen (RTF), LVWaehrung, LVMwSt, KGRTyp, LVOrderBidderID (beauftragter Bieter, −1 = keiner) |
| `OZMask` | OZ1–OZ4 (Name, Count = Stellen, Step, Enabled), OZP (Positionen), OZL |
| `BieterList` › Bieter | BieterID (0 = Kostenansatz), Name, AUF (Auf-/Abschlag in %, −2 = 2 % Nachlass), GBoA, GB, GBMwSt, GBBrutto; CTR › Address (Name1 …) |
| `ItemList` | PreHint (Vorbemerkung), Folder (Abschnitt: OZ, Text1, Summen je Bieter), Point (Position), Hint (Hinweis) – mit ID |
| Point | OZ, EH (Einheit), Text1/Text2 (Kurz-/Langtext), KostGr, EV=1 (Bedarfsposition), ME (selten; die Menge steht meist beim Kostenansatz, Bieter 0), CONo (Nachtrag); BieterList mit EP, GB, GBoA |
| `Ordering` › Order | OrderID 0 (Auftrag), 2147483647 (mit Nachträgen): GB, GBBrutto |
| `Contract` › HoldList | Einbehalte (Vertragserfüllung htCO, Gewährleistung htWY) |
| `Billing`, `Paying`, `Summary`, `MMC`, `BQRPRT` | Abrechnung, Zahlungen, Druckeinstellungen – bleiben unverändert |

Schreiben (`format/aslv.ts`): Die Datei wird frisch gelesen (verlustfreies XML, `format/xmlDom.ts`: jeder
Start-Tag bleibt, wie er war) und nur geändert, was im Modell anders ist. Texte nur, wenn sich der lesbare Inhalt
ändert – dann RTF im Stil des Originals mit dessen Kopf (Schriften, Farben); Zahlen nur, wenn sich der Wert ändert,
nicht die Schreibweise; **Summen** (Positionen, Abschnitte, Bieter) nur, wo sich Preise, Mengen oder Nachlass
geändert haben. Neue Elemente bekommen den Aufbau des Originals, eine neue ID, Anlage-/Änderungsdatum und eine
Kennung wie „APNSBVTNVFOUTUCD“; geänderte Elemente ein neues ChangeDate. Komprimiert wird mit zlib (fflate).

### Projektdatei des Originalprogramms (`.asproj`)

Unkomprimiertes XML mit den Projektangaben und je LV-Datei (Dateiname ohne Ordner) den zwischengespeicherten
Summen: Kostenansatz, Auftrag, Auftrag mit Nachträgen, abgerechnet, gezahlt (`format/asproj.ts`). Gelesen wird sie
zum Abgleich; die App braucht sie nicht (im Büro liegen die LV-Dateien in den Gewerkeordnern). Die Summen eines LV
lassen sich darin auffrischen (`asprojSummenSetzen`), alles andere bleibt Byte für Byte.

### Eigenes Format (`.oalv`)

JSON `{ "format": "arch-tools-lv", "version": 1, "app": "…", "gespeichert": "…", "lv": { … } }` mit dem LV-Modell
der App (`lv/modell.ts`): Kopf, OZ-Maske, Preisanteile, Bieter (Nachlass, Skonto, ausgeschlossen), Gliederung mit
formatierten Texten, Positionsarten, Preisen je Bieter, Nachtragsnummern, Einbehalte, Auftrag, Nachträge.
Unbekannte Felder späterer Versionen bleiben beim Speichern erhalten.

### GAEB DA XML 3.3

Export X81, X83 (ohne Preise), X84, X86 (mit den Preisen eines Bieters bzw. des Auftragnehmers); Import aller
Phasen als neues LV, X84 als Angebot eines Bieters (`format/gaeb.ts`). Abschnitte (`BoQCtgy`), Positionen (`Item`:
`Qty`, `QU`, `UP`, `IT`, `Provis` für Bedarfspositionen, `ALNGroupNo`/`ALNSerNo` für Grund- und Wahlpositionen,
`HourIt`, `LumpSumItem`), Hinweise (`Remark`), Texte als `<p>/<span>` mit Auszeichnung, OZ-Maske (`BoQBkdn`),
Nachlass (`DiscountPcnt`). GAEB 90/2000 (D8x/P8x) wird nicht gelesen.

### Abschnitt `ava` der Projektdatei

`kostenkontrolle` (gewählte Mappe), `zahler`, `gewerke` (je Kennung Firma, Ansprechpartner, E-Mail, Telefon,
Zahler, Kostengruppe), `rechnungen` (Prüfungen: Gewerk, Nummer, Art, laufende Nummer, Firma, Daten, Korrektur,
Betrag, Datei, Status, Versand), `beteiligte`, `bautagebuch`, `protokolle`, `maengel`, `notizen`. Geändert wird
immer auf dem frisch gelesenen Stand der Datei (`avaDaten.ts`), damit Änderungen anderer Apps erhalten bleiben.

## Umsetzung

| Datei | Inhalt |
|---|---|
| `format/xmlDom.ts` | verlustfreies XML (Start-Tags roh, Einrückung neuer Elemente) |
| `format/rtf.ts` | RTF lesen (Absätze, Auszeichnung, Listen, `\'xx`, `\u`) und im Stil des Originals schreiben |
| `format/aslv.ts`, `asproj.ts`, `eigen.ts`, `gaeb.ts` | Dateiformate |
| `lv/modell.ts`, `lv/rechnen.ts`, `lv/textbibliothek.ts` | LV-Modell, Summen, Preisspiegel, Rangfolge, Vorlagetexte |
| `abrechnung/kostenkontrolle.ts`, `aggregat.ts`, `ablauf.ts`, `pruefung.ts`, `benennung.ts`, `deckblatt.ts`, `mail.ts` | Kostenkontrolle, Zusammenführung, Prüfablauf, Rechnung, Dateinamen, Deckblatt (pdf-lib), .eml |
| `bauleitung/mails.ts`, `berichte.ts`, `pdfDokument.ts`, `wetter.ts` | .eml/.msg lesen, PDFs der Bauleitung, Wetter |
| `projekt.ts`, `avaDaten.ts`, `einstellungen.ts`, `dateien.ts`, `store.ts` | Projektstruktur, Abschnitt `ava`, Einstellungen, Dateizugriff, Zustand |
| `components/…` | Oberfläche |
| `demo.ts` | erfundenes Projekt im Speicher, nur in der Entwicklung (`npm run dev:ava`, Adresse mit `?demo`) |

Gemeinsam mit den anderen Apps (`packages/core`): die Excel-Bausteine `dokumente/xml.ts`, `zip.ts`, `xlsx.ts` (von
PERMIO, der Formular-App, hierher verschoben, mit Zellen mit Typ und dem Nachrechnen `xlsxRechnen.ts`), Projektwahl, Stammdaten,
Projektdatei, Konfigurationsordner.

Die Tauri-Hülle (`src-tauri/src/befehle.rs`, auch in Arkly eingebunden) ersetzt nur vorhandene Dateien
der App (`.aslv`, `.asproj`, `.oalv`, `.xlsx`, `.xlsm`, `.pdf`, `.json`) – atomar, nach einer Sicherungskopie
(`%LOCALAPPDATA%\de.pendzialek.ava\Sicherungen`), nur mit dem Stand vom Lesen und nicht, solange Excel sie geöffnet
hat; benennt um und verschiebt nie überschreibend; übernimmt Scans aus dem Scanordner (der Scan wird erst
entfernt, wenn die Datei vollständig im Projekt liegt); öffnet Dateien und Mailentwürfe mit ihrem Programm.
Lesen, Auflisten und neue Dateien laufen über die gemeinsamen Befehle.

## Tests

`npx vitest run --project ava` – LV-Format (RTF, verlustfreies XML, Anlegen, Ändern, Verschieben), GAEB,
Kostenkontrolle, Zusammenführung, Benennung, Prüfrechnung, Deckblatt, Mailentwurf, Mails lesen, Wetter, der
ganze Prüfablauf und der Zustand der App mit einem Projekt im Speicher.

Echte Dateien sind das Orakel und gehören nicht ins Repository: `.ref/` im Repository (nicht eingecheckt) bzw.
`AVAPLAN_REF` und `KOSTENKONTROLLE_REF`. Mit einer echten LV-Datei wird geprüft, dass sie unverändert byte-genau
zurückgeschrieben wird, dass die berechneten Summen denen in der Datei entsprechen und dass eine Preisänderung nur
Preis-, Summen- und Datumszeilen ändert; mit einer echten Kostenkontrolle, dass alle Formeln wie in Excel
nachgerechnet werden, alle Gewerkblätter erkannt werden und die Zusammenführung mit den PDFs des Auftragsordners
stimmt.

```bash
npx vitest run --project ava
AVAPLAN_REF=/pfad/zu/lv-dateien npx vitest run --project ava
KOSTENKONTROLLE_REF=/pfad/zur/kostenkontrolle.xlsx npx vitest run --project core --project ava
```

## Offen

- **Gegenprobe im Originalprogramm:** eine hier geänderte und eine hier angelegte LV-Datei dort öffnen, prüfen und
  wieder speichern – besonders neue Positionen, neue Bieter, geänderte Langtexte, die Vergabe (LVOrderBidderID,
  Order-Summen) und eine neue LV-Datei aus der Vorlage.
- **Abrechnung in der LV-Datei:** Aufmaße, Rechnungen und Zahlungen (`Billing`, `Paying`, `Summary`) des
  Originalprogramms werden noch nicht geschrieben, nur unverändert bewahrt – dafür fehlt eine LV-Datei mit
  erfassten Rechnungen als Muster. Bis dahin stehen die Rechnungen in der Kostenkontrolle und in der Projektdatei.
- **Nachträge in der LV-Datei:** Nachtragspositionen tragen ihre Nummer (CONo); eigene Order-Einträge je Nachtrag
  werden nicht angelegt, bis ihr Aufbau an einer echten Datei geprüft ist.
- **Grund-, Wahl- und Zulagepositionen** gibt es nur im eigenen Format; ihre Kennzeichnung in der LV-Datei ist
  unbekannt.
- **Deckblatt:** mit dem Briefbogen des Büros abgleichen (Lage der Felder); die Excel-Vorlage der
  Rechnungskorrektur des Büros könnte als Vorlage dienen.
- **Mailprogramm:** `.eml` mit `X-Unsent` öffnet in Outlook als Entwurf; andere Programme zeigen die Nachricht
  nur an. Alternative wäre MAPI.
- **Zwischenspeicher** (wie in den anderen Apps) für ungespeicherte LV-Änderungen nach einem Absturz.
