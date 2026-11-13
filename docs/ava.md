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
  Ordnern, Kostenkontrolle und Prüfungen (Zahl der LV-Dateien, wenn es mehr als eine gibt); **Bauleitung**
  (Objektüberwachung nach HOAI Leistungsphase 8); ⚙ Einstellungen (Strg+,). Die Einträge sind Knöpfe: mit Tab
  erreichbar, Enter öffnet, der aktive Bereich ist für Screenreader markiert.
- **Kostenübersicht:** je Gewerk Kostenschätzung, Kostenanschlag (Aufträge), Abweichung Kostenanschlag zu
  Kostenschätzung (nur für vergebene Gewerke – ein Gewerk ohne Auftrag erscheint nicht als Einsparung),
  **Zahlungsfreigaben** (Summe der geprüften Freigaben, nach Einbehalt, Umlagen und Skonto), offen (rot, wenn mehr
  freigegeben als beauftragt) und ein Balken „freigegeben“; Kennzahlen oben („noch auszuzahlen“), darunter die
  **Hinweise** (siehe Abrechnung). Ein Klick auf die Zeile (oder Enter) führt zu den Rechnungen des Gewerks, der
  Knopf mit der Kennung öffnet das Gewerk.

### Gewerk

Kopf mit Kennung, Bezeichnung, Auftragnehmer und Ordner. Auf den Tabs Leistungsverzeichnis, Angebote und Auftrag
rechts der **LV-Kopf**: die LV-Dateien des Gewerks (aktuelle zuerst, Archiv gekennzeichnet; Format im Tooltip),
„Neues LV ▾“ (leer oder aus einer GAEB-Datei X81–X86), „LV ▾“ mit den Befehlen für das ganze LV
(LV-Eigenschaften, Neu nummerieren, Drucken, GAEB-Export) und „Speichern“ (Strg+S; übernimmt auch die gerade
laufende Eingabe). Beim Betreten öffnet sich das aktuellste LV. Wer mit ungespeicherten Änderungen das Gewerk
oder Projekt wechselt, wird gefragt. Die Tabs lassen sich mit ←/→ wechseln; bei schmalem Fenster tragen sie
kurze Namen (LV, Angebote, Auftrag, Rechnungen, Dateien).

Was eine LV-Datei (.aslv) nicht aufnehmen kann – Nachträge, Auftragsdatum, Bieter gewertet/ausgeschlossen,
Angebotsdatum, Preisanteile, Grund-, Wahl- und Zulagepositionen –, ist bei einer .aslv gesperrt und mit dem
Hinweis „wird in LV-Dateien (.aslv) nicht gespeichert – im eigenen Format (.oalv) möglich“ gekennzeichnet.

**Leistungsverzeichnis**

- Tabelle der Gliederung: Abschnitte (mit Summe des Kostenansatzes), Positionen, Hinweise und Vorbemerkungen;
  volle OZ nach der OZ-Maske („02.0010“). Menge und Einheitspreis des Kostenansatzes lassen sich direkt in der
  Tabelle ändern (deutsche Schreibweise, ungültige Eingaben bleiben rot stehen).
- Werkzeugleiste in einer Zeile: + Position (im gewählten Abschnitt bzw. hinter der gewählten Position),
  + Abschnitt, „Weitere ▾“ (+ Hinweis, + Vorbemerkung, „Aus Vorlage …“); Duplizieren (Strg+D, ein Abschnitt
  bekommt die nächste freie OZ), ↑/↓, ⇤/⇥ (aus dem Abschnitt heraus bzw. in den Abschnitt davor), Entfernen (Entf);
  Rückgängig/Wiederholen (Strg+Z/Y); rechts die Suche nach OZ und Kurztext (Treffer mit ihren Abschnitten; ohne
  Treffer eine Meldung mit „Suche leeren“, Esc leert). Tastatur in der Tabelle (Fokus sichtbar): ↑/↓ wählen, Enter
  springt in den Kurztext des Seitenpanels, Esc dort zurück, Einfg neue Position. Bei schmalem Fenster (unter
  etwa 1150 px) steht das Seitenpanel unter der Tabelle; die OZ-Spalte bleibt beim seitlichen Rollen stehen.
- Ein Zahlenfeld übernimmt nur, was geändert wurde: Ein Einheitspreis mit drei Nachkommastellen (z. B. aus GAEB),
  der gerundet angezeigt wird, bleibt beim Durchklicken unverändert.
- **Seitenpanel** des gewählten Elements: OZ, Kurztext, Langtext (fett, kursiv, unterstrichen, Aufzählung –
  übernommen beim Verlassen, ein Schritt im Verlauf), Menge, Einheit (Vorschläge), Einheitspreis des
  Kostenansatzes, **Art der Position** (Normal-, Bedarfs-, Grund-, Wahl-, Zulageposition), Kostengruppe nach
  DIN 276, Nachtrag (0 = Hauptauftrag) und der Gesamtbetrag. In LV-Dateien des Originalprogramms gibt es nur
  Normal- und Bedarfspositionen (Grund-, Wahl- und Zulagepositionen nur im eigenen Format).
- **Vorlagetexte** (eigene Datenbank statt externer Textquellen): suchen (↑/↓ im Suchfeld wählt, Enter übernimmt), als Position einfügen oder die Texte
  der gewählten Position ersetzen; „Als Vorlage speichern“ an einer Position, „Aus diesem LV übernehmen“ für alle
  Positionen (gleiche Texte nur einmal). Gruppiert nach Gewerk, mit Einheit, Kostengruppe und Richtpreis; sie
  liegen für das ganze Büro im gemeinsamen Konfigurationsordner (Bereich `ava-texte`).
- **LV-Eigenschaften** (Abbrechen, Esc oder ein Klick daneben verwerfen Änderungen nur nach Rückfrage): Bezeichnung, LV-Nummer, Datum, Vergabeart (Vorschläge nach VOB/A: Öffentliche Ausschreibung, Beschränkte Ausschreibung mit/ohne Teilnahmewettbewerb, Freihändige Vergabe, Direktauftrag, EU-Verfahren, Angebotsanfrage für private Auftraggeber; freie Eingabe bleibt möglich), Angebotsabgabe (Datum, Uhrzeit), Bindefrist,
  Ausführung von/bis, Projekt, Auftraggeber, Aufgestellt von, Ort der Angebotsabgabe, Umsatzsteuer, Währung,
  Preisanteile und die **OZ-Maske** (Ebenen mit Name, Stellen, Schritt, aktiv; Stellen und Schritt der Positionen).
- **Drucken:** Leistungsbeschreibung mit Leistungsverzeichnis (A4 hoch) – ohne Preise für die Bieter (mit
  Punktlinien und Unterschriftszeile) oder mit den Preisen eines Bieters; Langtexte ein- und ausblendbar.

**Angebote & Preisspiegel**

- Bieter: Name, Angebotsdatum, Nachlass in %, gewertet (ausgeschlossene zählen weder im Preisspiegel noch in der
  Rangfolge), Summe netto, nach Nachlass, brutto, Rang, Abstand zum Ersten, Anzahl der Preise. Der Kostenansatz
  (vom Planer bepreistes LV) steht als erste Zeile, ohne Nachlass.
- **Unvollständige Angebote** (fehlende Preise) sind mit „unvollständig (n fehlende Preise)“ gekennzeichnet und
  stehen in der Rangfolge hinter den vollständigen – auch im Druck und in der Vergabe, die vorher nachfragt
  (Ausschluss prüfen, § 16a VOB/A). Fehlende Bieterpreise werden nicht aus dem Kostenansatz aufgefüllt.
- **Preise erfassen:** Bieter oben im Kopf wählen; die Einheitspreise in LV-Reihenfolge, Enter springt zur
  nächsten Position; Abweichung zum Kostenansatz, über 30 % hervorgehoben.
- **Angebot aus GAEB (X84)** übernimmt die Einheitspreise einer Angebotsdatei als neuen Bieter – Zuordnung über
  die vollständige OZ, führende Nullen egal; was nicht zugeordnet werden konnte, wird genannt. Gibt es den Bieter
  schon (gleicher Name), fragt die App, ob seine Preise ersetzt werden; bei doppelten Ordnungszahlen im LV warnt
  sie vorher. Der GAEB-Export nennt vorher, was das Programm der Bieter stören kann (doppelte OZ, Positionen neben
  Abschnitten), schlägt bei X84/X86 den ersten echten Bieter vor und warnt, wenn er keine Preise hat.
- **Preisspiegel:** je Position Einheitspreis und Gesamtbetrag aller gewerteten Bieter, Kostenansatz zum
  Vergleich, Mittelwert; günstigster grün, teuerster rot, auffällige (± 30 % vom Mittel bei mindestens drei
  Preisen) umrandet – mit Legende über der Tabelle –, Filter „nur auffällige“; Abschnittssummen, Summe, Nachlass,
  USt, brutto. Druck A4 quer mit Rangfolge. Ohne Bieter erklärt ein Hinweis, wie Angebote hineinkommen.

**Auftrag & Nachträge**

- Vergabe an einen Bieter vermerken (Spalte „Vergabe“ in der Rangfolge; den Auftrag erteilt der Bauherr), Auftragsdatum, Auftragssumme netto (leer = Angebot nach
  Nachlass), brutto. **„In die Kostenkontrolle übernehmen …“** trägt den Auftrag als neue Zeile in den
  Kostenanschlag des Gewerkblatts ein (und den Auftragnehmer, falls er fehlt) – nach einer Rückfrage, die sagt,
  wo.
- Nachträge mit Nummer, Bezeichnung, Datum, Status (angeboten, beauftragt, abgelehnt) und Betrag (leer = Summe
  der Positionen mit dieser Nachtragsnummer); beauftragte lassen sich ebenso in den Kostenanschlag übernehmen.
- Stand der Kostenkontrolle für das Gewerk (Aufträge A1 …, Kostenanschlag) mit Hinweis, wenn er von der
  Auftragssumme im LV abweicht.
- Auftragnehmer & Zahlung: Firma, Ansprechpartner, E-Mail, Telefon, und wer die Rechnungen zahlt (für die
  Mailentwürfe; leer = Vorgabe des Projekts, sonst der Bauherr). Dokumente im Auftragsordner mit Knopf „Öffnen“.

**Rechnungen** und **Dateien & Korrespondenz:** siehe unten bzw. alle Dateien des Gewerks (Auftrag,
Rechnungen, LV-Dateien, Mails mit Vorschau, weitere; feste Spalten Datei, Unterordner, Größe, geändert; Archiv
ein- und ausblendbar; ist der Ordner leer, ein Hinweis mit „Ordner öffnen“).

## Abrechnung

### Zusammenführung der Quellen

Je Gewerk werden die Rechnungen aus allen Quellen zusammengeführt (`abrechnung/aggregat.ts`):

| Quelle | Kürzel | Was |
|---|---|---|
| Rechnungsliste der Kostenkontrolle | Liste | laufende Nummer, Gewerk, Firma/Art, Rechnungs- und Freigabedatum, Betrag, Bemerkung |
| Gewerkblatt der Kostenkontrolle | Blatt | Spalte „Kostenfeststellung“ der Mappe: Nummer, Text, Datum, Betrag |
| Auftragsordner | PDF | PDFs, am Dateinamen erkannt (Nummer, Art, Firma, Datum) |
| Projektdatei (`ava`) | Prüfung | Prüfungen der App: Korrektur, Stand (ohne Scan, abgelegt, weitergeleitet) |

Die Art (AB, SR, TSR, R) und die laufende Nummer liest die App aus dem Text der Rechnungsliste nur am Ende
(„Rohbau Muster, AB2“) – ein Firmenname wie „Richter“ ist keine Rechnung „R“. In der Liste der Rechnungen stehen
je Rechnung der **Stand** und die Quellen (grün = vorhanden, gestrichelt = fehlt); ein Doppelklick bzw. „Prüfung“
zeigt eine geprüfte Rechnung zum Ansehen. Die Beträge der Mappe sind **Zahlungsfreigaben** (nach Einbehalt, Umlage
und Skonto), die App nennt sie so; „noch auszuzahlen“ = Kostenanschlag − Zahlungsfreigaben.

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
   und laufende Nummer (AB 2 folgt auf AB 1), Rechnungsnummer der Firma, Rechnungsdatum, **Eingang** (Zugang; daneben
   die Fälligkeit nach § 16 VOB/B: Abschlag 21 Tage, Schlusszahlung 30 Tage) und Freigabedatum. Mit
   **Rechnungskorrektur** (Vorgabe): Netto-Forderung laut Rechnung, geprüfte Netto-Freigabesumme, Nachlass, USt,
   Gemeinkostenumlage, Einbehalt, Skonto (mit Skontofrist), Anmerkung und **„Davon bisher freigegeben“** – rechts
   die Rechnung Schritt für Schritt bis zur Zahlungsfreigabe. Ohne Korrektur nur der freigegebene Betrag. Unten die
   **nächste freie Nummer** und der künftige Dateiname; was noch fehlt, steht sichtbar neben den Knöpfen. Esc oder
   „Abbrechen“ fragen nach, bevor eingegebene Angaben verloren gehen.
   Vorschlag je Rechnungsart (bei jedem Wechsel von Gewerk, Art und Nummer neu, für das gewählte Gewerk):
   - **Abschlagsrechnung:** Sicherheitseinbehalt nach Vorgabe; ab der zweiten die bisherigen Zahlungen der Reihe.
   - **Schlussrechnung:** alle bisherigen Zahlungen; Einbehalt = **Sicherheit für Mängelansprüche** (§ 17 VOB/B)
     aus dem geöffneten LV des Gewerks (Einbehalt „Gewährleistung“), sonst aus den Einstellungen; ist nirgends ein
     Satz hinterlegt, weist die Prüfung darauf hin (0 % = keine Sicherheit).
   - **Teilschlussrechnung** (§ 16 Abs. 4 VOB/B): wie die Schlussrechnung, aber ohne automatischen Abzug – die
     Zahlungen, die zu diesem Teil gehören, übernimmt man selbst. (Ältere Einstellungen mit „TSR“ als
     Schlussrechnung gelten ebenso.)
   - **Rechnung** (z. B. Stundenlohn): kein Abzug; Einzelrechnungen zählen auch nicht zu den bisherigen Zahlungen.
     Gutschriften (negative Beträge) zählen mit.
   **„Erfassen & Nr. … vergeben“** liest die Kostenkontrolle frisch (keine doppelte Nummer, auch wenn ein Kollege
   gerade eingetragen hat), trägt die Rechnung in die nächste freie Zeile der Rechnungsliste (die Nummer kommt aus
   deren Formel) und in die Kostenfeststellung des Gewerkblatts ein, speichert die Prüfung in der Projektdatei
   und bietet das **Deckblatt** zum Drucken an. Ist die Mappe in Excel geöffnet oder inzwischen von jemand anderem
   gespeichert, wird nichts geschrieben. Lässt sich nach dem Eintrag in die Mappe nur die Projektdatei nicht
   speichern, meldet die App das als Teilerfolg mit der vergebenen Nummer und bietet „Projektdatei erneut
   speichern“ an – nicht neu erfassen, sonst stünde die Rechnung doppelt in der Mappe.
2. **Rechnungseingang:** links die Scans aus dem Scanordner (neueste zuerst, alle 10 s neu gelesen), in der Mitte
   die Vorschau, rechts die erfassten Rechnungen ohne Scan (Listen mit ↑/↓ und Enter bedienbar). Die Rechnung wird
   ausdrücklich gewählt – nur bei genau einer offenen ist sie vorbelegt. **„Zuordnen & ablegen …“** benennt den Scan
   nach dem Muster (unzulässige Zeichen wie `/ : ?` fallen weg) und verschiebt ihn in den Auftragsordner des Gewerks
   (nie überschreibend; der Scan verschwindet erst, wenn die Datei vollständig im Projekt liegt, vorher eine
   Sicherungskopie) – auf Wunsch mit dem Deckblatt digital als erster Seite. Liegt die Datei im Projekt, lässt sich
   aber der Scan nicht löschen, gilt sie trotzdem als abgelegt (mit Hinweis). Danach: **Mailentwurf an den Zahler**
   mit der Rechnung als Anhang; die App bestätigt den Entwurf bzw. meldet eine fehlende Vorlage. Unter etwa 1100 px
   rückt die rechte Spalte unter die Vorschau.

Rechnung (jeder Schritt auf Cent gerundet, wie im Deckblatt des Büros): Netto-Freigabesumme − Nachlass =
1. Zwischensumme; + USt = Brutto-Freigabesumme; − Gemeinkostenumlage = 2. Zwischensumme; − Sicherheitseinbehalt =
3. Zwischensumme; − Skonto = Endsumme; − bisher freigegeben = **Zahlungsfreigabe** (so in die Rechnungsliste; negativ
bei Überzahlung). Beispiel aus dem Büro: AB 1 mit 26.110,22 € netto → 27.824,22 €; die SR 1 darüber ohne
Sicherheit, abzüglich der AB 1 → 3.091,58 €. Über eine ganze Reihe AB 1 … SR ist die Summe der Zahlungsfreigaben
gleich der Endsumme der Schlussrechnung (Test).

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
datum, Rechnungsart, Rechnungsdatum, Netto-Forderung, die Rechnung mit allen Schritten (USt; „vereinbarungsgemäß“
nur vor Sätzen über 0 %, bei Skonto mit Frist), bisher freigegebene Zahlungen (mehr als zwölf: die ältesten in einer
Sammelzeile mit Summe), Überweisungsbetrag, Schlusstext, Gruß, Büro und „i.A. …“. Mit einem **Briefbogen** (PDF, erste Seite als
Hintergrund) sieht es aus wie bisher; ohne steht der Büroname oben rechts und die Fußzeile aus den
Einstellungen unten. Die Nummer der Rechnungsliste lässt sich zusätzlich aufdrucken. Das Deckblatt öffnet sich
zum Drucken im PDF-Programm (Temp-Ordner) und lässt sich jederzeit aus der Rechnungsliste neu erzeugen. Zeichen,
die die PDF-Standardschrift nicht kennt (Łukasz, ş), werden durch den Grundbuchstaben ersetzt.

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

Gemeint ist die **Objektüberwachung nach HOAI, Leistungsphase 8** (Bauüberwachung und Dokumentation durch das
Büro) – nicht die Bauleitung nach § 56 BauO NRW 2018 (Bauleiterin/Bauleiter mit Erklärung gegenüber der
Bauaufsicht).

- **Bautagebuch:** ein Tagesbericht je Tag mit Nummer, Verfasser, **Wetter** und Temperatur („abrufen“: Open-Meteo
  am Ort des Vorhabens – gesendet werden nur die Koordinaten aus den Stammdaten und das Datum, erst auf Knopfdruck),
  Firmen auf der Baustelle (aus Kostenkontrolle und Gewerken, mit Personen und Tätigkeit; ein neuer Bericht
  übernimmt die Firmen des letzten), ausgeführte Leistungen, Behinderungen, Anordnungen, Besucher und **Fotos des
  Tages** (aus dem Fotoordner der gemeinsamen Einstellungen, nach Aufnahmetag in Ortszeit). PDF ansehen bzw. im
  Projekt ablegen. Ein Eintrag unter „Behinderungen“ ersetzt nicht die schriftliche Behinderungsanzeige des
  Auftragnehmers (§ 6 Abs. 1 VOB/B); das Formular weist darauf hin.
- **Protokolle:** Art (Baubesprechung, Jour fixe, Baustellenbegehung, Abnahmebegehung, Planungsbesprechung),
  Nummer, Datum, Beginn/Ende, Ort, Verfasser, nächster Termin, Teilnehmer (aus den Beteiligten bzw. dem letzten
  Protokoll, anwesend/entschuldigt, E-Mail), Besprechungspunkte mit Zuständigkeit, Frist und „erledigt“; ein neues
  Protokoll übernimmt auf Wunsch die **offenen Punkte** des letzten (mit Vermerk). PDF ansehen, im Projekt ablegen
  oder **an die Teilnehmer mailen** (Entwurf mit PDF). Unter dem Protokoll steht: „Einwände bitten wir innerhalb
  einer Woche nach Zugang mitzuteilen; andernfalls gehen wir davon aus, dass das Protokoll den Besprechungsverlauf
  zutreffend wiedergibt.“ – eine Bitte, keine Anerkennung durch Schweigen.
- **Abnahmebegehung** (früher Art „Abnahme“, alte Protokolle werden genauso behandelt): zusätzlich **Vorbehalt
  bekannter Mängel** (Text, „Aus der Mängelliste übernehmen“ hängt die offenen und angezeigten Mängel an) und
  **Vertragsstrafe vorbehalten**; im PDF mit Unterschriftsfeldern für Auftraggeber, Auftragnehmer und
  Objektüberwachung. Hinweis: Die rechtsgeschäftliche Abnahme erklärt der Auftraggeber (Bauherr); das Büro bereitet
  sie vor und empfiehlt sie (§ 12 Abs. 4 und 5, § 11 Abs. 4 VOB/B; § 640 Abs. 3 BGB).
- **Mängel:** Nummer, Gewerk, Firma (aus dem Gewerk) und Ort, Beschreibung, festgestellt und Frist, Status (offen,
  angezeigt, erledigt, abgenommen); überfällige rot. Wer im Filter „offene und angezeigte“ einen Mangel auf erledigt
  setzt, sieht ihn abgeblendet stehen, bis der Filter wechselt. Mängelliste als PDF, **Mängelanzeige** an die Firma
  eines Gewerks (Mailentwurf mit den offenen Mängeln als PDF). Der Text fordert zur Beseitigung bis zur Frist auf;
  fehlen Fristen, warnt die App vorher (eine angemessene Frist ist nötig, § 4 Abs. 7 bzw. § 13 Abs. 5 VOB/B) und
  lässt im Text eine Lücke. Als **„angezeigt“ mit Datum** gilt ein Mangel erst nach der Bestätigung „versendet“
  (Rückfrage nach dem Entwurf) oder wenn der Status von Hand gesetzt wird.
- **Notizen & Aufgaben:** zum Projekt oder Gewerk, mit Frist als Aufgabe (abhaken, überfällige rot und mit
  „überfällig“ beschriftet, Filter).
- **Beteiligte:** Rolle, Firma, Name, E-Mail, Telefon, Gewerk; „Aus Stammdaten und Gewerken übernehmen“ (Bauherr,
  Beteiligte der Stammdaten, Auftragnehmer); wer die Rechnungen zahlt (Vorgabe für alle Gewerke).
- **Mailverlauf:** alle Mails (`.eml`, `.msg`) aus den Korrespondenzordnern der Gewerke und den Mailordnern des
  Projekts, nach Datum, mit Gewerk, Suche in Betreff, Absender und Text (Esc leert), Vorschau mit Anhängen;
  Pfeiltasten wählen, Enter oder Doppelklick öffnet im Mailprogramm.
- **Bedienung:** Listen (Tagesberichte, Protokolle) mit ↑/↓ wählbar; neue Einträge bekommen den Fokus; alle
  Eingaben in Tabellen sind für Screenreader beschriftet. Änderungen werden auf dem frischen Stand der
  Projektdatei gespeichert – zwei schnelle Eingaben hintereinander überschreiben sich nicht, und Nummern neuer
  Berichte und Protokolle werden erst beim Schreiben vergeben.

## Einstellungen

Modal mit den Ebenen Ablage, Rechnungen & Benennung, Prüfung (Vorgaben für USt, Umlage, Einbehalt der Abschläge,
Sicherheit für Mängelansprüche bei Schlussrechnungen, Nachlass, Skonto), Deckblatt (Briefbogen, Büro, Unterschrift, Schlusstext, Fußzeile), Scanordner (Pfad, Endungen),
Mailvorlagen und Leistungsverzeichnisse (Format neuer LV-Dateien, Dateiname). Gespeichert im gemeinsamen
Konfigurationsordner (`ava.json`), also für das ganze Büro; „Vorgabe“ setzt nach Rückfrage alles zurück. Esc,
„Abbrechen“ fragen bei ungespeicherten Änderungen nach; ein Klick neben den Dialog schließt ihn nicht. Die Ebenen
lassen sich mit ↑/↓ wechseln.

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
Gesamtbeträge werden wie in der App gerechnet (kaufmännisch auf Cent, Brutto = Netto + USt je auf Cent).

**Was eine LV-Datei nicht aufnimmt** (`ASLV_NICHT_GESPEICHERT` in `format/aslv.ts`): Nachträge (Titel, Status,
Betrag), Auftragsdatum und -bemerkung, Status „ausgeschlossen“, Angebotsdatum, Anschrift, Skonto, Bemerkung und
Kontakt der Bieter, geänderte Preisanteile, Grund-, Wahl- und Zulagepositionen. Für diese Angaben ist im Format kein
bekanntes Feld vorhanden; beim Speichern als `.aslv` gehen sie verloren (`aslvVerluste` meldet, welche geändert
sind). Die Oberfläche sperrt bzw. kennzeichnet sie bei LV-Dateien; voll speicherbar sind sie im eigenen Format.

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

- **Export nach dem Schema:** Hinweise stehen nur in Positionslisten (`Itemlist`). Vorbemerkungen vor einer
  Gliederung mit Abschnitten kommen in einen eigenen Abschnitt „0 Vorbemerkungen“, der Langtext eines Abschnitts als
  erster Hinweis seiner Positionsliste, Hinweise zwischen Abschnitten an den Anfang des folgenden Abschnitts.
  Positionen neben Abschnitten landen in einem eigenen Abschnitt „Positionen ohne Abschnitt“ (nächste freie Nummer);
  `gaebPruefen` meldet sie vor dem Export, ebenso doppelte Ordnungszahlen. Eigene Exporte werden beim Import an
  ihren Kennungen erkannt und wieder so aufgebaut wie vorher.
- **Grund- und Wahlpositionen:** Gruppen (`ALNGroupNo`) fortlaufend; eine Wahlposition gehört zu ihrer
  Grundposition bzw. zur letzten davor; beim Import wird der Bezug wieder gesetzt.
- **Preise:** `UP` mit allen Nachkommastellen des Einheitspreises, `IT` wie in der App gerundet.
- **Import fremder Dateien:** Texte mit gemischtem Inhalt („Vorher <span>fett</span> nachher“, `<br/>`) in
  Dokumentreihenfolge, Einrückung im XML als ein Leerzeichen; Zeichensatz laut Deklaration (auch in einfachen
  Anführungszeichen), sonst UTF-8 und, wenn das nicht passt, Windows-1252. Abgeschnittene oder beschädigte Dateien
  brechen mit einer Meldung ab. Doppelte Ordnungszahlen werden als Hinweis gemeldet. Wird ein Angebot desselben
  Bieters erneut eingelesen, lässt sich der vorhandene Bieter ersetzen (`gleicherBieter`); dabei verlieren
  Positionen ohne Preis in der neuen Datei ihren alten Preis.
- **Rangfolge:** Unvollständige Angebote (fehlende Preise) stehen hinter den vollständigen und sind
  gekennzeichnet (§ 16a VOB/A prüfen); ihre Summe ist nicht vergleichbar.

### Abschnitt `ava` der Projektdatei

`kostenkontrolle` (gewählte Mappe), `zahler`, `gewerke` (je Kennung Firma, Ansprechpartner, E-Mail, Telefon,
Zahler, Kostengruppe), `rechnungen` (Prüfungen: Gewerk, Nummer, Art, laufende Nummer, Firma, Daten, Korrektur,
Betrag, Datei, Status, Versand), `beteiligte`, `bautagebuch`, `protokolle`, `maengel`, `notizen`. Geändert wird
immer auf dem frisch gelesenen Stand der Datei (`avaDaten.ts`), damit Änderungen anderer Apps erhalten bleiben;
Schlüssel, die diese Version nicht kennt (etwa aus einer neueren Version eines Kollegen), bleiben erhalten.

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
- **Steuern in der Prüfung:** Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG) und Bauabzugsteuer
  (§ 48 EStG, Freistellungsbescheinigung) sind nicht abgebildet – bei Bedarf USt 0 % eintragen und in der
  Anmerkung vermerken.
- **Zwischenspeicher** (wie in den anderen Apps) für ungespeicherte LV-Änderungen nach einem Absturz.
