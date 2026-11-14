# ATLAS (Projektordner)

Die App **ATLAS (Projektordner)** (`apps/ordner`, eigene App mit eigenem Installer, in der Rahmen-App Arkly der Tab
„ATLAS“) ist das Setup-Tool des Büros: Sie legt Projekte an und schreibt sie fort – mit einem **Assistenten**, der
alle Angaben zum Projekt abfragt (Stammdaten, Grundstück, Bauherr, Umfang, Beteiligte) und in der Projektdatei
(`.oap`) ablegt, den Projektordner nach der **Struktur** des Büros anlegt und Vorlagen einsetzt. Dazu prüft sie
vorhandene Projektordner gegen die Struktur und exportiert Katasterpläne.

Bis Version 0.17.0 hieß die App „Projektordner“ (im Fenstertitel und in der Rahmen-App zuletzt „Projekt“).
Einstellungen und Daten bleiben beim Update erhalten: Der Installer entfernt eine Installation unter dem alten Namen
vorher still und legt vorhandene Verknüpfungen im Startmenü bzw. auf dem Desktop unter dem neuen Namen an. Technisch
bleibt alles beim Alten: Ordner `apps/ordner`, Kennung `de.pendzialek.projektordner` (darunter liegen Einstellungen und
Sicherungen), Release-Tags `ordner-v…`, Einstellungsdatei `projektordner.json` und der Abschnitt `projektordner` in der
Projektdatei.

Grundsätze:

- **Jedes Projekt hat eine Projektdatei (.oap).** Sie gehört keinem einzelnen Werkzeug: Stammdaten und die Angaben
  aller Apps stehen darin (siehe [Projektdatei](#projektdatei-oap)). Fehlt sie, legt der Assistent sie an.
- **Automatisch wird nichts gelöscht, verschoben oder überschrieben.** Ordner und Vorlagen werden nur neu
  angelegt; vorhandene Dateien bleiben, wie sie sind. Einzige Ausnahme ist die Projektdatei selbst: Sie wird
  gezielt ergänzt (nur die geänderten Angaben), vorher gesichert. Vor jedem Lauf zeigt der Trockenlauf, was
  passiert.
- **Einstellungen teilen sich alle Apps** im gemeinsamen Konfigurationsordner (siehe [Einstellungen](#einstellungen)).

## Projekt (Assistent)

Acht Schritte; die Schrittleiste oben springt zu jedem Schritt, sobald die davor taugen (ein gesperrter Schritt nennt
im Tooltip, was fehlt). Ein Häkchen bekommen nur Schritte, die schon besucht und vollständig sind. Alles, was der
Assistent abfragt, steht danach in der Projektdatei – für alle Apps. Wer zwischendurch zu „Struktur“, „Vorlagen“ oder
einer anderen Ansicht wechselt, findet den Assistenten beim Zurückkommen im selben Schritt mit allen Eingaben vor –
auch beim Ergänzen.

1. **Projekt:** die **Projektübersicht** – dieselbe Startseite wie in den anderen Apps: vorne „Zuletzt geöffnet“
   (je Benutzer, über alle Apps), darunter die Projektordner je Stammordner als Karten mit Nummer, Bezeichnung und
   Leistungsphasen aus der Projektdatei (im Hintergrund nachgeladen) und der Marke „ohne Projektdatei“, mit Suche.
   Ein Klick auf ein Projekt ergänzt es; **„Neues Projekt“** im Kopf beginnt ein neues, „Anderen Ordner …“ wählt
   einen Projektordner an beliebiger Stelle. Der Ordner muss nicht nach dem Schema heißen; ergänzt wird in genau
   diesem Ordner. Aus „Ordner prüfen“ führt „Projekt ergänzen …“ direkt hierher. Ohne eingestellten Stammordner
   (und im Browser) stehen hier zwei Karten: neues Projekt bzw. Projektordner wählen.
   **Sammelordner:** Projekte in Gruppen-, Akquise- und Archivordnern eines Stammordners (auch verschachtelt, etwa
   „Archiv/2024“) stehen in eigenen Abschnitten („Projekte › Archiv“). Sammelordner erkennt die App am Namen
   („Archiv“, „_Archiv“, „99 Abgeschlossen“, „Akquise“ …, nicht „2026-014 Stadtarchiv“) oder daran, dass darin Ordner
   mit Projektnamen liegen; ein Ordner mit Projektdatei oder nummerierten Unterordnern („00 Projekt“, „01 …“) ist ein
   Projekt. Ohne Status in der Projektdatei gelten Projekte im Archivordner als abgeschlossen (in der Standardansicht
   ausgeblendet) und in der Akquise als Akquise; „Wieder aktiv“ schreibt dann „aktiv“ ausdrücklich in die Datei.
   **Reihenfolge der Stammordner:** die Abschnitte der Übersicht ziehen (die Sammelordner wandern mit) oder unter
   „Einstellungen“ ziehen bzw. mit „Nach oben“/„Nach unten“ – gilt für alle Apps; im ersten entstehen neue Projekte.
   Gibt es genau einen Stammordner, ist er aufgeklappt (ein Archivordner darin nicht). Die Projekte lassen sich sortieren (Ordnername, Nummer –
   neueste zuerst –, zuletzt geändert, Titel) und nach Status filtern (Standard: ohne abgeschlossene; die Wahl gilt
   je Benutzer). Rechtsklick auf ein Projekt: „Ergänzen …“, „Projekt prüfen“, „Ordner öffnen“, **„Projekt
   abschließen“** bzw. „Wieder aktiv“, „Als Akquise kennzeichnen“ und „Anheften“ – angeheftete Projekte stehen ganz
   vorne, in allen Apps. Der Status steht in der Projektdatei (`meta.status`: Akquise, aktiv, abgeschlossen); gesetzt
   wird nur diese Angabe, alles andere in der Datei bleibt. Nummer und Kurzname leitet jede App gleich aus dem
   Ordnernamen ab: Das Schema der Struktur steht dafür in `allgemein.json` (`ordnerSchema`).
2. **Stammdaten:** Projektnummer, Kurzname, Bezeichnung, Adresse des Bauvorhabens (mit Koordinaten) und der
   **Stand**: beauftragt (aktiv) oder Akquise – er steht als `meta.status` in der Projektdatei und gilt für den
   Filter der Projektübersicht aller Apps.
   - Neues Projekt: Das Tool trägt die nächste freie Nummer vor (änderbar) – die höchste laufende Nummer unter den
     Projektordnern **aller** Stammordner (auch Archiv oder Akquise, auch in deren Sammelordnern; im laufenden Jahr, wenn das Schema ein Jahr enthält)
     plus eins. Passt eine Nummer nicht zum Schema („26-14“ bei `{JAHR}-{Nr:3}`), steht am Feld ein Hinweis
     („erwartet z. B. 2026-015“); er hält nicht auf. Projektnummer und Kurzname sind Pflicht (Stern); der
     Ordnername, der sich daraus ergibt, steht direkt darunter, Zeichen wie `/ : ?` meldet das Feld schon beim
     Tippen. Meldungen erscheinen am Feld erst nach dem Verlassen bzw. nach „Weiter“; „Weiter“ nennt dann neben dem
     Knopf, was noch fehlt („Noch offen: Projektnummer, Kurzname“ – ein Klick führt zum Feld), und setzt den Fokus in
     das erste offene Feld. Gibt es den Ordner schon, bietet der Assistent an, dieses Projekt zu ergänzen; ein zweites
     Projekt entsteht darin nicht. Das angefangene Formular bleibt bis zum nächsten Start erhalten; „Leer beginnen“ auf
     der Startseite verwirft es.
   - Bestehendes Projekt: Die Stammdaten kommen aus der Projektdatei. **Fehlt sie, ist das kein Fehler:** Der
     Assistent erfasst die Stammdaten (Nummer und Kurzname aus dem Ordnernamen vorgeschlagen, bei Ordnern aus
     Version 0.1 aus der alten `projekt.json`) und legt die Projektdatei damit an. Der Ordner wird beim Ergänzen
     nicht umbenannt. **Liegt eine Projektdatei im Ordner, die sich nicht lesen lässt** (beschädigt), bleibt sie
     unverändert: Der Assistent sagt dann deutlich, dass die Stammdaten nicht gespeichert werden – sie dienen nur den
     Namen neuer Ordner und Vorlagen. Kennt die Projektdatei kein Anlagedatum, gilt für `{JAHR}` in neuen Namen das
     laufende Jahr; der Trockenlauf weist darauf hin.
3. **Grundstück:** Gemarkung, Flur, Flurstück, Grundstücksfläche, Bebauungsplan (Nummer, Name) und Aktenzeichen
   der Bauaufsicht. (Der Bebauungsplan ging bis 0.13 im Assistenten verloren – er wird jetzt gespeichert.)
4. **Bauherr:** Name bzw. Firma, Vorname, Anschrift, beliebig viele E-Mail-Adressen und Telefonnummern.
5. **Umfang:** beauftragte Leistungsphasen (mit Namen, Schnellwahl „1–4 bis Bauantrag“, „5–8“, „1–9 alle“,
   „ohne Einschränkung“) und Bearbeitung (Kürzel; Vorschläge aus den Mitarbeitern unter „Einstellungen“). An
   Leistungsphasen gebundene Ordner und Vorlagen entstehen nur, wenn eine davon beauftragt ist (keine Auswahl = alle
   Ordner).
6. **Beteiligte:** die schon bekannten Fachplaner, Gutachter und Behörden. Rolle mit Vorschlägen typischer
   Beteiligter (Tragwerksplanung, Prüfingenieur/-in, Brandschutz, Vermessung ÖbVI, TGA, Energieberatung/GEG,
   Bodengutachten, Prüfsachverständige für Brandschutz und Standsicherheit, Sachverständige für Schall- und
   Wärmeschutz, SiGeKo, Bauaufsicht …) oder frei – die typischen stehen außerdem als Knöpfe „+ Tragwerksplanung“ …
   darunter und legen mit einem Klick eine Zeile an. Name mit Vorschlägen aus den Projektdateien der Stammordner; Rolle und
   Kontakt werden dann ergänzt.
7. **Vorlagen:** Vorlagenordner und „Welche Vorlagen?“ – die Presets (siehe [Vorlagen](#vorlagen)). Vorausgewählt sind bei neuen
   Projekten die Presets mit „Standard“, bei bestehenden die in der Projektdatei vermerkten.
8. **Anlegen bzw. Ergänzen:** oben die **Zusammenfassung** – so steht es in der Projektdatei (Projekt, Grundstück,
   Bauherr, Umfang, Beteiligte, Vorlagen), je Abschnitt mit „ändern“, das zum Schritt springt. Darunter der
   Trockenlauf als Baum – jeder Ordner und jede Datei mit Herkunft (Struktur,
   Vorlage mit Preset, Projektdatei) und dem Vermerk „vorhanden“, „wird ergänzt“ (Projektdatei, mit den geänderten
   Angaben als Hinweis), „abgewählt“ bzw. – beim Ergänzen – „neu“. Beim Ergänzen zeigt er nur, was sich ändert
   (umschaltbar). Einzelne Einträge lassen sich abwählen (beim Ergänzen auch „Alle neuen Einträge abwählen“ und
   danach einzelne wieder wählen); mit einem Ordner entfällt alles darin. Zu lange Pfade meldet der Trockenlauf vorab:
   Ordner ab 248 Zeichen (mit Stammordner) legt Windows gar nicht an, Dateien ab 260 Zeichen öffnen der Dateimanager
   und andere Programme nicht. Der Knopf
   **„Projektordner anlegen“** bzw. „Projekt ergänzen“ steht wie „Weiter“ rechts unten in der Navigation, die beim
   Blättern sichtbar bleibt; ist er gesperrt, steht der Grund daneben (etwa „Erst den Stammordner für Projekte
   wählen.“). Unmittelbar vor dem Anlegen sieht der Assistent im Stammordner nach, ob es den Projektordner
   inzwischen gibt (ein Kollege hat dieselbe Nummer vergeben) – dann legt er nichts an und bietet an, das vorhandene
   Projekt zu ergänzen. Ergänzen ohne Leistungsphasen: Der Trockenlauf weist darauf hin, dass alle Ordner
   vorgeschlagen werden, und springt mit „Leistungsphasen wählen“ zum Umfang. Danach meldet das Tool, was angelegt
   bzw. ergänzt wurde, was schon da war und was fehlgeschlagen ist – ein Fehler hält die übrigen Schritte nicht auf.
   Im Browser entsteht der Projektordner als ZIP-Datei zum Herunterladen (statt im Stammordner).
   Nach dem erfolgreichen Anlegen zeigt der Assistent eine **Abschlussseite** (ohne Zurück-Navigation) mit dem Ordnernamen, „Ordner öffnen“
   und „Nächstes Projekt“ (kam der Auftrag aus einer anderen App, außerdem „In … öffnen“, siehe unten); das Formular ist dann schon für das nächste Projekt geleert – „Rückgängig“ (zehn Sekunden)
   holt den Entwurf zurück. Schlägt ein Schritt fehl, bleibt der Entwurf stehen.
   „Projekte“ in der Titelleiste (ebenso ein „Neues Projekt“-Auftrag aus einer anderen App und „Ergänzen“ aus „Ordner
   prüfen“) beginnt den Assistenten neu. Gibt es dabei noch nicht Angelegtes, das verloren ginge – geänderte Angaben
   beim Ergänzen, unter „Anlegen“ bzw. „Ergänzen“ abgewählte Einträge –, fragt ATLAS vorher „Assistent neu beginnen?“
   mit *Abbrechen* und *Verwerfen und neu beginnen* (Gefahr-Knopf, Enter verwirft nichts).
   Der Entwurf eines neuen Projekts geht nicht verloren; er bleibt bis zum Anlegen gespeichert.

**Ungespeicherte Änderungen beim Beenden:** Was beim Beenden verloren ginge, meldet ATLAS als ungespeichert (● in
der Titelleiste bzw. am Tab der Rahmen-App Arkly): offene Eingaben im Assistenten wie oben, den nicht übernommenen
Text der Ordnerliste (Struktur, Textansicht) und Änderungen an der Struktur, die wegen eines Konflikts mit einem
anderen Rechner oder eines gescheiterten Schreibens („Einstellungen nicht gespeichert“, etwa bei getrenntem
Netzlaufwerk) nicht gespeichert sind; ein gescheitertes Schreiben der allgemeinen Einstellungen zählt nicht dazu (es
bleibt bei der Meldung unter „Einstellungen“). Beim Beenden, vor einem Update und in Arkly beim Schließen des Tabs,
Herauslösen und Andocken kommt dann „Änderungen speichern?“; der Satz darunter nennt, was ungespeichert ist („Die
Ordnerstruktur hat ungespeicherte Änderungen.“, „Die Angaben im Assistenten haben …“ bzw. beide in einem Satz).
*Speichern* übernimmt nur, was ohne weitere Entscheidung geht: Es schreibt die Struktur erneut (ist das Laufwerk
wieder da, ist sie danach gespeichert) und übernimmt den Text der Ordnerliste wie mit „Übernehmen“ (vorher gesichert,
mit „Rückgängig“), wenn er gültig ist und vom aktuellen Stand ausgeht. Im Assistenten hieße Speichern, den
Projektordner anzulegen bzw. die Projektdatei zu schreiben, ein Konflikt verlangt „Neu laden“ oder „Meine Fassung
trotzdem speichern“ – das geschieht nicht still: Es gilt „nicht gespeichert“, die Aktion unterbleibt, und ATLAS
meldet, was noch offen ist.
*Nicht speichern* verwirft. Nicht gemeldet werden von Hand geänderte, noch nicht umbenannte Mailnamen und
hineingezogene, noch nicht abgelegte Mails unter „Mails“ (die Mails selbst bleiben im Projektordner bzw. in Outlook;
schon ein Wechsel der Ansicht verwirft diese Eingaben) und alles, was ATLAS sofort speichert.
Änderungen an der Struktur schreibt ATLAS kurz verzögert (zusammengefasst); vor dem Schließen, Andocken, Herauslösen
und einem Update schreibt es eine noch wartende Änderung sofort und wartet darauf, auch ohne Rückfrage. Ein früher
gescheitertes Schreiben versucht es dabei erneut. Scheitert dieses letzte Schreiben (etwa bei getrenntem Netzlaufwerk),
steht es im Protokoll, und Arkly fragt „ATLAS konnte nicht speichern“ mit *Erneut versuchen*, *Trotzdem schließen*
und *Abbrechen*.

### Neues Projekt aus jeder App

In der Rahmen-App Arkly (früher „arch-tools“) steht auf der Projektübersicht **jeder** App – QUADRIO
(Flächenrechner), TERRIO (GRZ-Nachweis), NUMIO (Kostenermittlung), RECTIO (Entzerrung), PERMIO (Formulare) – der
Knopf **„Neues Projekt anlegen“**, dazu im „+“-Menü und auf der Startseite des Rahmens. Er öffnet den Tab „ATLAS“
(bzw. holt dessen herausgelöstes Fenster nach vorn) und startet den Assistenten direkt bei den Stammdaten – ein
angefangener Entwurf bleibt erhalten („Leer beginnen“ auf der Startseite verwirft ihn). Oben steht, aus welcher App der Auftrag kam,
mit „Zurück zu …“. Nach dem Anlegen führt **„In QUADRIO öffnen“** (bzw. „Zurück zu PERMIO“) zurück: Die Übersicht
dort liest die Projekte neu, und QUADRIO, TERRIO, NUMIO und RECTIO öffnen das neue Projekt gleich. In diesen Apps
heißt das bisherige „Neues Projekt“ (leeres Projekt ohne Projektordner) im Rahmen „Leer beginnen“. Die einzeln
installierten Apps können ATLAS nicht starten; dort gibt es den Knopf nicht.

Technik: Nachrichten über den Rahmen (`packages/core/src/platform/rahmen.ts`): `arch-tools:projekt-anlegen` (App →
Rahmen), `arch-tools:assistent-neu` (Rahmen → ATLAS), `arch-tools:zur-app` (ATLAS → Rahmen, mit dem neuen
Projektordner) und `arch-tools:projekt-angelegt` (Rahmen → App). Tabs per `postMessage` (nur gleicher Ursprung, nur
vom Rahmen), herausgelöste Fenster per Tauri-Ereignis (`arch-tools:an-rahmen`, `arch-tools:an-app`). Jede App meldet
sich mit `arch-tools:bereit`, sobald sie hört; was vorher ankommt (etwa beim frisch geöffneten Tab), stellt der
Rahmen danach zu.

**Tastatur:** Strg+Enter geht zum nächsten Schritt; nach jedem Schrittwechsel steht der Fokus auf der Überschrift
(in den Stammdaten im ersten Feld), der aktive Schritt ist für Bildschirmleser gekennzeichnet, die Felder der
Beteiligten sind je Zeile beschriftet („Rolle 2“, „Beteiligten 2 entfernen“), die Kontrollkästchen im Trockenlauf
heißen wie ihr Eintrag („Baugrund anlegen“). Die Projektliste zum Ergänzen ist per Tab erreichbar; Enter im
Suchfeld öffnet den ersten Treffer.

Angelegt bzw. ergänzt werden

1. die **Ordner** der Struktur,
2. die **Vorlagen** der gewählten Presets, umbenannt nach dem Schema des Büros und mit ersetzten Platzhaltern,
3. die **Projektdatei** am eingestellten Ort (Vorgabe `03 Berechnungen/Flächen/{PROJEKT_KUERZEL} {PROJEKT_KURZNAME}.oap`;
   alle globalen Platzhalter, siehe [platzhalter.md](platzhalter.md); `{DATUM}` ist JJMMTT): neu als
   leere Flächenberechnung mit Stammdaten, Anlagedatum, Struktur und Presets – QUADRIO, TERRIO, NUMIO und PERMIO
   öffnen sie –, beim Ergänzen nur mit den geänderten Stammdaten (gegenüber dem
   Stand beim Einlesen; was eine andere App inzwischen eingetragen hat, bleibt) und den Presets. Leerzeichen am
   Rand gespeicherter Werte gelten dabei nicht als Änderung; Unterfelder, die diese Fassung nicht kennt (etwa beim
   Bauherrn, von einer neueren App angelegt), bleiben auch in einem geänderten Teil erhalten. Hat jemand die
   Datei zwischen Einlesen und Ergänzen geändert, wird nicht geschrieben – dann neu einlesen.

`{JAHR}` in Namen ist beim Ergänzen das Jahr, in dem das Projekt angelegt wurde. Enthält der Name einer Vorlage
`{DATUM}` (auch mit Format), gilt sie als vorhanden, wenn es dieselbe Datei mit einem anderen Datum schon gibt („vorhanden*“).

## Einstellungen

### Gemeinsame Einstellungen

Alle Apps lesen ihre übergreifenden Einstellungen aus einem **Konfigurationsordner**. Oben unter „Gemeinsame
Einstellungen“ (und über den Knopf „Einzelplatz“ bzw. „Netzwerk“ in der Titelleiste jeder App) steht, wo er liegt; „Ändern …“ wählt zwischen
**Einzelplatz** (ein Ordner auf diesem Rechner, `%APPDATA%\arch-tools`) und **Netzwerkinstallation** (ein Ordner auf
dem Netzlaufwerk – dann gilt er für das ganze Büro). Beim Wechsel ziehen alle gemeinsamen Einstellungen mit; liegen
dort schon welche, fragt die App, ob sie gelten („Vorhandene übernehmen“, Fehlendes kommt dazu) oder ersetzt werden
(„Mit diesem Rechner überschreiben“, mit Sicherung). Ist das Netzlaufwerk nicht erreichbar, sind die Einstellungen nur lesbar
(lokale Kopie); Einzelheiten in der [README](../README.md#gemeinsame-bedienung-aller-apps).

| Datei | Inhalt |
|---|---|
| `allgemein.json` | Stammordner der Projekte (mehrere möglich, Reihenfolge per Ziehen; im ersten entstehen neue Projekte; Projekte in Gruppen-, Akquise- und Archivordnern darin zählen mit), Ort der Projektdatei in neuen Projekten, Fotoordner im Projekt (für RECTIO), Name des Büros für den Kopf der Ausdrucke und Excel-Dateien, Kürzel der Mitarbeiter (Vorschläge für „Bearbeitung“) |
| `projektordner.json` | Struktur samt Bausteinen und Vorlagen-Presets, Vorlagenordner dieser App |

Welcher Konfigurationsordner gilt, steht je Benutzer in `%APPDATA%\arch-tools\konfig.json` – für alle Apps
derselbe Ort, nie auf dem Netzlaufwerk. Einstellungen früherer Fassungen (lokal gespeichert) werden beim ersten Start übernommen. Im Browser
liegen die Einstellungen im Speicher des Browsers.

`projektordner.json` wird kurz nach der letzten Änderung geschrieben (nicht bei jedem Tastendruck) und nur, wenn
die Datei seit dem Lesen unverändert ist. Hat ein anderer Rechner sie inzwischen geändert, überschreibt das Tool
sie nicht, sondern meldet „Die Struktur wurde inzwischen von einem anderen Rechner geändert – neu laden?“ mit
„Neu laden“ (die eigene Fassung bleibt über „Rückgängig“ erreichbar) und „Meine Fassung trotzdem speichern“ – dabei
kommt die Fassung des anderen Rechners vorher in die Sicherungen (siehe unten), mit Eintrag im Protokoll. Beim
Wechsel in „Struktur“, „Einstellungen“ und „Vorlagen“ liest die App die Datei frisch.

### Namensschema

Unter „Gemeinsame Einstellungen“ steht das **Namensschema** des Büros (Abschnitt „Namensschema: Kürzel und
Plannummern“) – gemeinsam für alle Apps (`allgemein.json`, Eintrag `namensschema`;
`packages/core/src/namensschema.ts`):

- **Aufbau des Dateinamens:** welche Stelle Projektcode, Phase bzw. Antragsart, Datum (JJMMTT) und Plannummer haben –
  Vorgabe „HVO GP 261111 GP-04 Grundriss OG.pdf“ (im Antragsordner steht die Antragsart statt der Phase, die
  Plannummer bleibt).
- **Planphasen** mit Kürzel, Bedeutung und Leistungsphase: BP Grundlagenermittlung (LPh 1), EP Entwurfsplanung (LPh
  3), GP Genehmigungsplanung (LPh 4), AP Ausführungsplanung (LPh 5), AB Abgeschlossenheitsbescheinigung (Sonderfall;
  Aufteilungspläne nach § 7 Abs. 4 WEG).
- **Antrags- und Verfahrensarten** mit gleichwertigen Schreibweisen: BAUA Bauantrag, BAUVA Bauvoranfrage (Antrag auf
  Vorbescheid, § 77 BauO NRW 2018; auch BVA), BAUF Genehmigungsfreistellung (kein Antrag, sondern Vorlage bei der
  Bauaufsichtsbehörde, § 63 Abs. 3 BauO NRW 2018 in der Fassung ab 01.09.2026), DENK Denkmalrechtliche Erlaubnis, ABGE
  Abgeschlossenheitsbescheinigung, ENTW Entwässerungsantrag.
- **Bearbeiten:** Kürzel, Bedeutung, Schreibweisen und Leistungsphasen werden beim Verlassen des Felds übernommen
  (Schreibweisen bereinigt: groß, ohne Doppelte). Kürzel und Schreibweisen bestehen aus Großbuchstaben und Ziffern
  (höchstens 8 Zeichen) und sind über beide Listen eindeutig – eine Antragsart darf nicht wie eine Phase heißen, eine
  Schreibweise nicht schon bei einer anderen Art stehen; sonst zeigt das Feld wieder den gespeicherten Stand und eine
  Meldung sagt warum (beim Lesen werden solche Einträge ebenso verworfen); in einer neuen Zeile bleibt die Eingabe
  dagegen markiert zum Korrigieren stehen. Leistungsphasen sind ganze Zahlen von 0 bis
  9 (die HOAI kennt 1 bis 9; 0 heißt „von Anfang an“) – eine andere Eingabe bleibt mit Meldung stehen, leer = keine.
  Ein neues Kürzel (Knopf „Kürzel“ mit Plus) wird erst gespeichert, wenn man die Zeile mit einem gültigen Kürzel verlässt (Esc
  verwirft es) – vorher gilt es in keiner App. Entfernen fragt nach. Die Stellen tauschen beim Umstellen die Plätze;
  das Beispiel zeigt die Zerlegung mit den Kürzeln des Schemas. „Vorgabe wiederherstellen“ (mit Rückfrage) setzt die
  eingebaute Vorgabe, auch in allen Feldern.
- **Index ab Leistungsphase** (Vorgabe 5, Bürovorgabe): erst ab dann tragen Pläne einen Index (AP-03a).

Jede **neue Projektdatei** bekommt eine Kopie (Abschnitt `namensschema`); beim **Ergänzen** eines Projekts wird
eine fehlende oder abweichende Kopie auf den Stand des Büros gebracht (in der Vorschau als Änderung „Namensschema“
bzw. „Namensschema (Stand des Büros)“; verglichen wird in gelesener Form – die Reihenfolge der Schlüssel in der Datei
spielt keine Rolle, eine andere Reihenfolge der Kürzel schon). Alle Apps lesen zuerst die der Projektdatei, sonst die
des Büros, sonst die Vorgabe. PERMIO
erkennt daran Antragsordner und die Pläne eines Plansatzes und prüft und vergibt danach die Dateinamen im
Antragsordner (Stellen von Projektcode, Antragsart und Datum, „Umbenennen nach Namensformat“, Namensvorlage des
Exports).

> **Alle Rechner gleichzeitig aktualisieren:** Jede App liest das Namensschema geprüft ein und schreibt es so zurück.
> Eine ältere Fassung, die eine Projektdatei speichert, kann daher Angaben einer neueren verlieren (z. B. unbekannte
> Felder des Namensschemas; Formulare (heute PERMIO) bis 0.35 kennt die Dokumentart „Plansatz“ nicht und speichert
> sie als Formular).

### Struktur

Eigener Reiter **„Struktur“** (bis 0.13 Teil der Einstellungen). Ordnerbaum, Bausteine und Namensschemata gehören dem
Büro, nicht dem Tool. Die Struktur lässt sich zusätzlich als JSON-Datei
speichern, weitergeben und laden – samt den Vorlagen-Presets und dem Dateinamenschema für Vorlagen; die eingebaute
Vorgabe ist neutral (nach Dokumentart: Projekt, Grundlagen, Pläne, Berechnungen, Schriftverkehr, Protokolle,
Genehmigung, Ausschreibung, Bauleitung, Fotos). „Vorgabe wiederherstellen …“ setzt Ordner und Schemata zurück; die
Presets bleiben.

Die Bürostruktur gilt für alle, die den Konfigurationsordner nutzen. „Vorgabe wiederherstellen …“ und „Struktur laden …“ fragen
deshalb vorher nach und zeigen, was sich ändert („6 Ordner entfallen, 2 neu, 3 Schemata ändern sich“), mit
„Ersetzen / Abbrechen“. Vor dem Ersetzen wird der bisherige Stand gesichert – in `projektordner-sicherungen.json`
im Konfigurationsordner, je Sicherung mit Namen `projektordner.json.bak-JJJJ-MM-TT-hhmm`; die letzten zehn bleiben.
„Sicherungen“ klappt die Liste zum Wiederherstellen auf. Auch „Ordnerliste übernehmen“ (Textansicht) sichert vorher.
Nach dem Ersetzen nimmt „Rückgängig“ die Änderung zurück, solange nichts anderes geändert wurde.

Lässt sich die Struktur in `projektordner.json` nicht lesen (etwa das Format einer neueren ATLAS-Fassung), zeigt ATLAS
vorläufig die Vorgabe mit einer Warnung, **schreibt aber nichts** – weder die Struktur noch das Ordnerschema für die
anderen Apps. Solange **sperrt** ATLAS das Bearbeiten in „Struktur“ (Name, Schemata, Ordnerliste) und „Vorlagen“
(Presets, Dateinamen, Vorlagenordner – auch im Assistenten) – Eingaben gingen sonst beim nächsten Laden verloren. Alles
bleibt **lesbar**: Felder und Knöpfe sind gesperrt (der Tooltip nennt den Grund „Die Bürostruktur ist nicht lesbar – erst
übernehmen“), Menüpunkte bleiben sichtbar und tragen „Struktur nicht lesbar“ als Hinweis. Der Ordnerbaum lässt sich
weiter scrollen, mit den Pfeiltasten durchgehen, auswählen, kopieren und in der LPh-Vorschau ansehen; Anlegen,
Umbenennen (F2, Doppelklick), Ziehen, Einfügen, Löschen, Bausteine und Rückgängig sind gesperrt – F2, Entf und
Doppelklick nennen den Grund. Die Textansicht zeigt die Liste schreibgeschützt. Erst wenn die Struktur bewusst ersetzt wird
(„Angezeigte Struktur übernehmen …“ unter der Warnung, „Struktur laden …“, eine Sicherung oder „Vorgabe
wiederherstellen …“), wird gespeichert und die Sperre aufgehoben; der unlesbare Inhalt kommt vorher in die
Sicherungen. Das gilt auch für „Rückgängig“ nach „Neu laden“ einer für diese Fassung unlesbaren Struktur eines anderen
Rechners. Felder, die diese Fassung nicht kennt, bleiben beim Speichern erhalten.

Die **Namensschemata** stehen im Kopf der Struktur (sie gelten für alle Ordner, nicht für den gewählten):

| Einstellung | Vorgabe | Platzhalter |
|---|---|---|
| Projektnummer | `{JAHR}-{Nr:3}` → 2026-014 | `{JAHR}`, `{JAHR_KURZ}`, `{Nr}` bzw. `{Nr:3}` (führende Nullen) |
| Name des Projektordners | `{PROJEKT_KUERZEL} {PROJEKT_KURZNAME}` | alle globalen |
| Dateinamenschema für Pläne | `{PROJEKT_KUERZEL}_{Plannummer}_{Index}_{Titel}` | alle globalen, dazu `{Plannummer}`, `{Index}`, `{Titel}` |

Solange ein Schemafeld den Fokus hat, stehen darunter die Platzhalter als Chips – globale und lokale unterscheidbar, wie in allen Apps
([platzhalter.md](platzhalter.md)). Gespeicherte Schemata mit alten Namen (`{jahr}-{nr:3}`, `{nummer} {kurzname}`)
gelten weiter; „Auf neue Namen umstellen“ am Feld stellt sie auf die neuen Namen um.

Die **Ordnerliste** wird mit der Maus bearbeitet – ein Baum wie im Dateimanager, rechts die Angaben zur Auswahl:

- **Auswählen:** Klick; Strg+Klick und Umschalt+Klick wählen mehrere. Rechts dann Name, **Leistungsphasen** (Knöpfe
  1–9, „immer“ und Schnellwahl 1–4, 5–8, 6–7, 8) und „Dateinamen prüfen“ – bei mehreren Ordnern für alle auf einmal
  (teilweise gesetzte Phasen gestrichelt).
- **Anlegen:** „Unterordner“ (Knopf mit Plus, Strg+N), „Ordner daneben“ (Strg+Umschalt+N, im Menü), „Ordner“ (mit
  Plus) im Stamm. Der neue Ordner steht gleich zum Benennen bereit (Enter übernimmt, Esc behält den Vorschlag).
- **Mehrere anlegen …:** eine Zeile je Ordner, eingerückte Zeilen (Tab oder Leerzeichen) werden Unterordner, „/“
  trennt ebenfalls, Zusätze wie in der Textansicht (`| LPh 6-7`, `| Dateischema`); mit Vorschau als Baum. Strg+Enter
  legt an. Ohne Auswahl entstehen die Ordner im Stamm; sind mehrere Ordner markiert, entsteht die Liste in **jedem**
  davon.
- **Umbenennen:** Doppelklick oder F2 (bzw. das Feld rechts); Unterordner wandern mit.
- **Verschieben:** ziehen und ablegen – auf einen Ordner: hinein, an den oberen bzw. unteren Rand: davor bzw.
  dahinter, auf die Fläche am unteren Rand des Baums (beim Ziehen immer sichtbar): in den Stamm; auch mehrere auf
  einmal. Tastatur: Alt+↑/↓ unter Geschwistern, Alt+→ wird Unterordner des Ordners darüber, Alt+← eine Ebene höher.
  Nicht möglich: in sich selbst, oder im Ziel gibt es schon einen Ordner gleichen Namens – solche Ziele werden beim
  Ziehen nicht hervorgehoben, der Mauszeiger zeigt „nicht erlaubt“.
- **Kopieren und Einfügen:** Strg+C kopiert die markierten Ordner samt Unterordnern, Strg+V fügt sie in **alle**
  markierten Ordner ein. Gleichnamige Ordner werden zusammengeführt – mehrfaches Einfügen ändert nichts mehr.
  **Duplizieren** (Strg+D) legt eine Kopie direkt dahinter an („Rohbau 2“).
- **Bausteine** (rechts): wiederkehrende Unterordner, z. B. der Aufbau eines Gewerkeordners. Rechtsklick auf einen
  Ordner → „Unterordner als Baustein speichern …“ speichert seine Unterordner unter
  einem Namen; „Einfügen“ setzt sie in alle markierten Ordner ein. Beispiel: 15 Gewerkeordner mit „Mehrere anlegen“
  in „07 Ausschreibung“ anlegen, alle markieren (Klick, Umschalt+Klick), Baustein „Gewerk“ einfügen – fertig.
  Eingefügt wird eine Kopie; spätere Änderungen am Baustein ändern die Struktur nicht. „Beispiel „Gewerk“ anlegen“
  gibt einen Ausgangspunkt. Bausteine stehen in der Struktur (`bausteine`), werden mit ihr gespeichert, geladen und
  gesichert.
- **Löschen:** Entf bzw. Rechtsklick → Löschen; mit Unterordnern oder mehreren erst nach Rückfrage.
- **Rückgängig/Wiederholen** (Strg+Z/Strg+Y) für jeden Schritt des Editors.
- **LPh-Vorschau:** eigener Modus (Knopf in der Werkzeugleiste, „Vorschau beenden“) – die Leistungsphasen eines
  Beispielprojekts wählen; Ordner, die dann nicht entstehen, sind blass und durchgestrichen („12 von 44 Ordnern
  entstehen“). Die Vorschau ändert nichts an der Struktur.
- **Menüs:** Rechtsklick, der Knopf „Aktionen“ am Ende der Zeile (Symbol mit drei Punkten) oder Umschalt+F10 bzw. die Menütaste (für die Zeile mit der
  Schreibmarke) zeigen alle Aktionen mit ihren Tastenkürzeln – im gemeinsamen Menü aller Apps. Es ist ganz per Tastatur
  bedienbar: Pfeil auf/ab, Pos1/Ende, Enter; Esc oder Tab schließt, der Fokus kehrt in den Baum zurück (Tab geht von
  dort weiter). Kopieren, Einfügen, Duplizieren sowie Alle aufklappen/zuklappen stehen außerdem im Menü „Weitere“ der
  Werkzeugleiste; was gerade nicht geht, bleibt dort blass erreichbar und nennt den Grund im Tooltip. Pfeiltasten, Pos1/Ende bewegen die
  Auswahl.
- **Meldungen** erscheinen am unteren Rand des Baums (Fehler als Warnung) und verschwinden nach einigen Sekunden.

**Leistungsphasen werden vererbt:** Ein Unterordner entsteht nur, wenn auch sein übergeordneter Ordner entsteht –
„07 Ausschreibung | LPh 6-7“ gilt für alle Gewerkeordner darin, ohne dass jeder die Phasen braucht. Im Baum steht
die geerbte Angabe gestrichelt, rechts der Hinweis „Entsteht nur, wenn auch … entsteht“. Das gilt beim Anlegen, im
Trockenlauf und in „Ordner prüfen“ (bis 0.13 entstand ein Unterordner ohne eigene Leistungsphasen immer und zog
seinen übergeordneten Ordner mit). Übergeordnete Ordner, die nur als Teil eines Pfads vorkommen, haben keine eigene
Regel (Tooltip und Seitenleiste sagen es: „entsteht über seine Unterordner“); eine Leistungsphase oder „Dateinamen
prüfen“ gibt ihnen eine.

Für Geübte gibt es die Ordnerliste auch als **Text (Experte)** – dieselbe Liste, eine Zeile je Ordner, Unterordner
mit `/`. Zusätze nach `|`:

```
02 Pläne/Entwurf | Dateischema
02 Pläne/Ausführung | LPh 5 | Dateischema
07 Ausschreibung | LPh 6-7
07 Ausschreibung/Rohbau/Angebote
```

- `LPh 5`, `LPh 6-7`, `LPh 4, 8` – der Ordner entsteht nur, wenn eine dieser Leistungsphasen beauftragt ist
  (Unterordner erben das: „07 Ausschreibung/Rohbau/Angebote“ oben entsteht nur mit LPh 6 oder 7).
- `Dateischema` – Dateien in diesem Ordner werden im Prüfmodus gegen das Dateinamenschema geprüft.

Unzulässige Zeichen in Namen (`\ / : * ? " < > |`) werden entfernt; unter Windows reservierte Namen (CON, PRN, AUX,
NUL, COM1–9, LPT1–9, auch mit Endung, auch mit Leerzeichen davor wie „AUX .txt“) bekommen ein „_“ angehängt („CON“ → „CON_“). Was beim Lesen der Liste entfällt
oder bereinigt wird – doppelte Zeilen (nur die erste gilt), Leistungsphasen außerhalb 1 bis 9, entfernte Zeichen,
reservierte Namen, unbekannte Zusätze nach `|` –, meldet das Tool zeilenweise unter dem Feld („Zeile 4 doppelt zu
Zeile 1 – nur die erste gilt“). Übernommen wird der Text nur mit „Ordnerliste übernehmen“ (vorher gesichert, mit
„Rückgängig“); „Verwerfen“ zeigt wieder die geltende Liste. Wer mit nicht übernommenen Änderungen zum „Baum“
wechselt, wird gefragt (Übernehmen, Verwerfen, Abbrechen; Enter übernimmt). Der nicht übernommene Text bleibt
auch beim Wechsel in eine andere Ansicht (etwa „Vorlagen“ oder „Projekte“) erhalten, bis zum Schließen der App.
Kommt die Struktur inzwischen neu herein (anderer Rechner), bleibt der eigene Text mit Hinweis stehen; entspricht sie
dem Text, ist der Entwurf erledigt. Eine leere Liste übernimmt die Textansicht nicht (Schutz vor versehentlichem
Leeren) – alle Ordner zu löschen geht im Baum. Der Ort der Projektdatei stand bis Version 0.1
in der Struktur („Leere Flächenrechner-Datei“); er ist jetzt eine gemeinsame Einstellung und wird übernommen.

## Vorlagen

Vorlagen liegen in einem eigenen **Vorlagenordner**, nicht im Tool – gegliedert, wie es dem Büro passt (etwa nach
Dateiart: `Word/`, `Excel/`, `Bauantrag/`). Er wird unter **Vorlagen** (oder im Assistenten) gewählt, steht im
Konfigurationsordner und wird bei jedem Wechsel der Ansicht frisch eingelesen; „Neu einlesen“ holt Änderungen sofort.

### Presets

Ein **Preset** ist eine Zusammenstellung von Vorlagen, z. B. „Jedes Projekt“, „Bauantrag“ oder „Ausschreibung“.
Jede **Zuordnung** darin sagt:

| Angabe | Bedeutung |
|---|---|
| Vorlage | Pfad im Vorlagenordner: eine **Datei** oder ein **Ordner** (alle Dateien darin, mit ihren Unterordnern); leer = der ganze Vorlagenordner |
| Zielordner im Projekt | Ordner im Projekt, Vorschläge aus der Struktur; Platzhalter erlaubt; leer = Stamm des Projektordners |
| Dateiname im Projekt | Name nach dem Schema des Büros, z. B. `{PROJEKT_KUERZEL} Brief Bauherr`; leer = Dateinamenschema für Vorlagen |
| LPh | nur, wenn eine dieser Leistungsphasen beauftragt ist, z. B. `4` oder `6-7`; leer = immer |

Zugeordnet wird unter **Vorlagen**: Preset wählen, im Baum des Vorlagenordners auf „+“ klicken, Zielordner und
gegebenenfalls Namen eintragen. Die Vorschau zeigt mit den Stammdaten des angefangenen neuen Projekts (sonst Beispielwerten),
wo jede Datei landet und wie sie heißt (mehr als vier Dateien je Zuordnung: aufklappbar); Vorlagen, die es im
Vorlagenordner nicht gibt, sind markiert. Dazu prüft sie das Preset nach den Regeln von „Ordner prüfen“ und fasst
zusammen, was danach als Abweichung gälte: „3 Ordner liegen außerhalb der Struktur“, „2 Dateien liegen lose im
Projektstamm“ (aufklappbar mit Liste). Die Anleitung `LIESMICH.txt` im Stamm des Vorlagenordners zählt nicht mit.
Die Preset-Liste steht oben in der linken Spalte (per Tab und Enter wählbar); „Löschen …“ fragt wie bei Bausteinen
nach. Eine entfernte Zuordnung („×“) holt „Rückgängig“ zurück. Die Platzhalter-Übersicht für Vorlagen ist
eingeklappt („Platzhalter in Vorlagen anzeigen“).

Presets mit **„Standard“** sind bei neuen Projekten vorausgewählt; welche ein Projekt bekommen hat, steht in seiner
Projektdatei. Die eingebaute Struktur bringt das Preset
**„Alle Vorlagen“** mit: der ganze Vorlagenordner, jede Datei an denselben Ort im Projekt – für einen Vorlagenordner,
der wie ein Projektordner aufgebaut ist. Ist der Vorlagenordner anders gegliedert (mehr als die Hälfte der Vorlagen
landete außerhalb der Struktur, etwa bei `Word/`, `Excel/`), wird ein solches Preset bei neuen Projekten nicht
vorausgewählt; „Vorlagen“ und der Assistent sagen das, und es lässt sich weiterhin ausdrücklich wählen. Projekte merken sich ihre Presets beim Namen (in der Projektdatei); ein
umbenanntes Preset meldet der Trockenlauf beim Ergänzen als unbekannt.

### Dateinamen

So heißt eine Vorlage im Projekt:

1. Gibt die Zuordnung einen **Namen** vor, gilt er.
2. Enthält der Name der Vorlage selbst Platzhalter (`{PROJEKT_KUERZEL} Projektblatt.md`), werden nur diese ersetzt.
3. Sonst gilt das **Dateinamenschema für Vorlagen** (Vorgabe `{PROJEKT_KUERZEL} {Name}`):
   `Kostenschätzung.xlsx` → `2026-014 Kostenschätzung.xlsx`.

Platzhalter in Namen – derselbe Satz für Ordnernamen, Dateinamen und den Pfad der Projektdatei: die globalen
Variablen der Suite (`{PROJEKT_KUERZEL}`, `{PROJEKT_KURZNAME}`, `{PROJEKT_VORHABEN}`, `{BEARBEITER}`, `{DATUM}` als
JJMMTT bzw. `{DATUM:JJJJ-MM-TT}` mit eigenem Format, `{JAHR}`, `{JAHR_KURZ}` – Liste in
[platzhalter.md](platzhalter.md)) und lokal `{Name}` (Name der Vorlage ohne Endung). Unter jedem Schemafeld stehen sie
als Chips, die den Platzhalter an der Schreibmarke einsetzen; die Vorschau folgt schon beim Tippen, unbekannte
Platzhalter sind sofort markiert. In den Zuordnungen der Presets erscheinen die Chips erst, wenn das Feld den Fokus
hat. Alte Namen gelten weiter – `{nummer}`, `{kürzel}`, `{kurzname}`, `{jahr}`, `{jj}`, `{name}` …, auch `{datum}` mit
seiner bisherigen Bedeutung JJJJ-MM-TT (neu `{DATUM:JJJJ-MM-TT}`). Die Endung kommt immer von der Vorlage. **Office-Vorlagen
werden zu Dokumenten:** `.dotx` → `.docx`, `.xltx` → `.xlsx`, `.potx` → `.pptx` (auch die Varianten mit Makros) –
mit umgestelltem Inhaltstyp, sonst öffnet Office die Datei nicht.

Konfigurationen ohne Presets (bis Version 0.1.x) bekommen beim Laden „Alle Vorlagen“ und das Schema `{Name}` –
die Dateinamen bleiben, wie sie waren.

### Inhalte

Eine `LIESMICH.txt` direkt im Quellordner, Systemdateien und Sperrdateien von Office werden nicht kopiert;
Vorlagen in Ordnern nicht beauftragter Leistungsphasen bleiben weg.

„Muster-Vorlagen in einen Ordner schreiben“ (unter **Vorlagen**) legt einen Ausgangspunkt an – Projektblatt,
Planliste, Besprechungsprotokoll, aufgebaut wie ein Projektordner – und stellt den Ordner als Vorlagenordner ein.
Die Muster sind zum Ersetzen durch die eigenen Dateien gedacht.

Platzhalter im **Inhalt** stehen in doppelten Klammern, mit denselben Namen wie in den Excel-Vorlagen der anderen
Werkzeuge: `{{projekt.nummer}}`, `{{projekt.kurzname}}`, `{{projekt.name}}`, `{{projekt.adresse}}`,
`{{grundstueck.flurtext}}`, `{{bauherr.name}}`, `{{bauherr.adresse}}`, `{{bauherr.email}}`,
`{{projekt.bearbeiter}}`, `{{projekt.leistungsphasen}}`, `{{beteiligte}}`, `{{datum}}`, `{{datum.iso}}` …,
dazu die globalen Variablen der Suite (`{{PROJEKT_KUERZEL}}`, `{{DATUM}}`, `{{DATUM:TT.MM.JJJJ}}` …).
Die vollständige Liste steht im Tool unter **Vorlagen**.

| Dateiart | Was passiert |
|---|---|
| Text (`.md`, `.txt`, `.csv`, `.json`, `.html`, `.xml` …) | Platzhalter im Text ersetzt |
| Excel (`.xlsx`, aus `.xltx`) | Vorlagen-Engine der anderen Werkzeuge: Einzelwerte, dazu eine Zeile je Beteiligtem (`{{beteiligter.rolle}}`, `{{beteiligter.name}}`, `{{beteiligter.kontakt}}`) bzw. je Leistungsphase (`{{lph.nr}}`, `{{lph.name}}`) – siehe [Excel-Vorlagen](excel-vorlagen.md) |
| Word (`.docx`, `.docm`, aus `.dotx`/`.dotm`) | Platzhalter im Text, in Kopf- und Fußzeilen. Ein Platzhalter muss in einem Zug getippt sein – wechselt mittendrin die Formatierung, zerlegt Word ihn, und er wird nicht erkannt |
| alles andere (PDF, DWG, Bilder, `.xlsm` …) | unverändert kopiert |

Unbekannte Platzhalter bleiben stehen, damit Tippfehler auffallen.

## Ordner prüfen

Ein vorhandener Projektordner wird eingelesen und mit der Struktur verglichen – aus der Liste der Projektordner aller
Stammordner (mit Suche; ein Klick prüft) oder über „Ordner wählen …“. Gemeldet werden

- die **Projektdatei**: vorhanden (mit Nummer, Kurzname, Anlagedatum, Struktur), fehlt (dann gilt die vollständige
  Struktur; stehen Stammdaten noch in einer alten `projekt.json`, gelten deren Leistungsphasen) oder nicht lesbar,
- der **Ordnername**, wenn er nicht dem Schema und den Stammdaten entspricht,
- **fehlende Ordner** der Struktur – „Fehlende Ordner anlegen“ steht direkt am Befund. Nennt die Projektdatei kein
  Anlagedatum, ist das Jahr für `{JAHR}`/`{JAHR_KURZ}` unbekannt: Ordnername und Ordner, die es brauchen, gelten dann
  als **nicht beurteilbar** (Hinweis) und werden weder als fehlend gemeldet noch angelegt,
- **zusätzliche Ordner** auf Ebenen, die die Struktur vorgibt (Stamm und Ordner mit vorgegebenen Unterordnern),
- **lose Dateien** im Projektordner (die alte `projekt.json` darf liegen bleiben),
- Dateien in den Planordnern, die nicht dem **Dateinamenschema** folgen (mit der Projektnummer aus den
  Stammdaten),
- **überlange Pfade** (mehr als 200 Zeichen ab dem Projektordner – mit Laufwerk und Stammordner droht die
  Windows-Grenze von 260 Zeichen),
- **Mails** (.msg), die nicht nach dem Schema `<Projektcode> von|an <Name> <JJMMTT> <Thema>.msg` heißen – nur am
  Namen; „N Mails benennen …“ führt zu [Mails](#mails).

Die Befunde stehen nach Schwere: Fehler, Abweichungen, Hinweise, in Ordnung; die Kopfzeile zählt sie getrennt („2
Abweichungen · 1 Hinweis“). Lange Pfadlisten (mehr als fünf) sind eingeklappt; Aktionen wie „Fehlende Ordner anlegen“
und „N Mails benennen …“ stehen am Befund, „← Zur Projektliste“ oben am Bericht. „Als CSV speichern …“ speichert ihn
mit allen betroffenen Pfaden (für Excel: Semikolon, UTF-8 mit BOM; Text, der mit `=`, `+`, `-` oder `@` beginnt,
bekommt ein Apostroph vorangestellt, damit Excel ihn nicht als Formel ausführt). Scheitert das Anlegen mittendrin,
wird neu geprüft und gemeldet, wie viele Ordner schon angelegt sind.

**Alle Projekte prüfen** prüft jeden Projektordner der Stammordner – nur lesend – und zeigt eine Übersicht: Projekt,
Zahl der Abweichungen (davon Fehler), Projektdatei ja/nein, längster Pfad; Projekte mit Fehlern und den meisten
Abweichungen zuerst. Ein Klick auf ein Projekt zeigt dessen Einzelbericht; „Als CSV speichern …“ speichert die
Übersicht.

Das Tool meldet nur. Von hier aus lassen sich **fehlende Ordner anlegen** und das **Projekt ergänzen** (im
Assistenten: fehlende Ordner, Vorlagen und die Projektdatei).

## Mails

Reiter **„Mails“** (auch Rechtsklick auf ein Projekt → „Mails prüfen …“ und aus „Ordner prüfen“): Mails richtig
ablegen und benennen. Das Schema:

```
<Projektcode> von|an <Name> <JJMMTT> <Thema>.msg        z. B.  BSP von Muster 261110 Raumaufteilung.msg
```

**Prüfen und umbenennen.** Die App sucht im gewählten Projektordner mit allen Unterordnern nach Outlook-Mails (.msg)
und zeigt die, deren Name nicht passt – mit Grund: kein Schema, anderer Projektcode, E-Mail-Adresse statt Nachname,
Punkt/Unterstrich im Namen, ungültiges Datum, „AW“/„WG“ am Anfang des Themas, Unterstriche, Dateiendungen im Thema
(„.docx“), doppelte Leerzeichen. Für jede schlägt sie den Namen **aus der Mail selbst** vor (gelesen ohne Outlook, auch
ältere ANSI-Nachrichten):

- **von / an und Name:** Absender von außen → „von <Nachname des Absenders>“; Absender aus dem Büro → „an <erster
  Empfänger von außen>“; eine **Weiterleitung aus dem Büro** (WG/FW) einer Mail von außen → „von <ursprünglicher
  Absender>“ aus dem Kopf der weitergeleiteten Mail im Text. Der Nachname kommt aus dem Anzeigenamen („Muster, Max“,
  „Max Muster | Firma“) oder der Adresse („max.muster@…“ → Muster; Sammelpostfächer wie info@ → Name aus der
  Domain).
- **Datum:** Empfang (von außen) bzw. Versand (an außen) – nicht das Dateidatum, das sich beim Kopieren ändert.
- **Thema:** der Betreff ohne „AW:“/„WG:“, ohne Dateiendung, Unterstriche als Leerzeichen. Inhaltlich besser („Raum-
  aufteilung“ statt „Grundriss Sanierung Musterschule“) lässt es sich im Feld ändern; Themen, die im Projekt schon vorkommen,
  stehen als Vorschläge darin. „Mail ansehen“ zeigt Betreff, Von, An, Cc, Gesendet, Empfangen, Anhänge und den Text.

Woran „aus dem Büro“ erkannt wird, stellen die **eigenen Domains** ein (gilt fürs Büro, Konfigurationsordner, Bereich
`mails`); ohne Einstellung schlägt die App die Domain vor, die in den meisten Mails des Projekts vorkommt, und nimmt bis
dahin die Richtung aus dem bisherigen Namen (eigene Domains, die während des Einlesens gespeichert werden, gelten auch
für die danach gelesenen Mails). **„Auch korrekt benannte prüfen“** liest auch die richtig benannten Mails
und meldet ein abweichendes Datum („Datum 261103 – die Mail ist vom 261102 (Versand)“) bzw. eine falsche Richtung. Der
Projektcode kommt aus der Projektdatei und lässt sich oben ändern.

Umbenannt wird erst auf Klick – einzeln oder alle markierten (Auswahl und „Umbenennen“ stehen nur da, wenn es
abweichende Mails gibt) –, im selben Ordner, die Endung bleibt, und **nie überschreibend**: Gibt es den Namen schon,
bleibt alles, wie es war. Mehrere auf einmal benennt die App erst nach einer Rückfrage um („6 Mails umbenennen?“ mit
den ersten vier Namen alt → neu und „… und 2 weitere“), denn ein Rückgängig gibt es nicht. Würde der vollständige Pfad
260 Zeichen oder länger, steht „Pfad zu lang (… Zeichen, Windows erlaubt höchstens 259) – Thema oder Name kürzen“ an
der Mail, und Umbenennen bzw. Ablegen bleibt gesperrt. Ist die Mail in Outlook geöffnet, sagt die App das. (Befehl
`projekt_datei_umbenennen` in `packages/core/tauri/umbenennen.rs`, nur in den Hüllen von ATLAS und Rahmen-App.)

**Mails aus Outlook ablegen.** Mails aus dem **klassischen Outlook** lassen sich direkt auf die Fläche „Mails aus Outlook
hierher ziehen“ ziehen (oder gespeicherte .msg-Dateien wählen). Die App bildet den Namen wie oben, schlägt als Ordner
den vor, in dem im Projekt die meisten Mails liegen, und legt sie mit „Ablegen“ dort ab – **kopiert** (in Outlook
bleiben sie; die App meldet beim Ziehen „kopieren“, nie „verschieben“) und nie überschreibend. Liegt dieselbe Mail
(gleicher Betreff und Versandzeit) schon im Projekt, steht das dabei – verglichen mit allen Mails im Projekt (noch
ungelesene, deren Name nicht passt oder deren Datum um den Tag der neuen Mail liegt, werden dafür gelesen); ebenso,
wenn dieselbe Mail in einer Ablage zweimal dabei ist. Entwürfe ohne Versandzeit gelten nie als doppelt. Eine Datei,
die keine lesbare Outlook-Mail ist, wird so genannt und lässt sich mit „×“ verwerfen; „Verwerfen“ für alle fragt ab
zwei Mails nach. Damit das Ziehen klappt, gibt das Fenster das Ziehen & Ablegen an die
Oberfläche weiter (`dragDropEnabled: false`, wie in der Rahmen-App) – Outlook liefert die Mails dabei als virtuelle
Dateien, die Chromium/WebView2 als .msg übergibt. Auf einem Büro-PC noch zu bestätigen; das neue Outlook liefert so
nichts (dort: auf den Desktop ziehen bzw. „Speichern unter“ und dann wählen). Hintergrund und Alternativen (Graph,
COM, Makro): [docs/outlook-mails.md](outlook-mails.md).

## Katasterpläne

Katasterpläne als PDF und DXF kommen aus einem **QGIS-Projekt als Vorlage**, in dem das Büro seine Dienste
(ALKIS-WMS/WFS), Kartenthemen und Layouts mit Planköpfen pflegt. Exportiert wird je Projekt auf der Startseite
(Rechtsklick auf das Projekt → „Katasterpläne …“); QGIS läuft dabei unsichtbar im Hintergrund (`qgis_process`, ab
QGIS 3.28; geprüft mit 3.34 LTR). Früher war das Teil von PERMIO; dessen Einstellungen werden beim ersten Öffnen
übernommen.

- **Reiter „Katasterpläne“:** die Vorlage (`.qgz`/`.qgs`, gilt für alle im Büro: gemeinsamer
  Konfigurationsordner, Bereich `kataster`), der Pfad zu `qgis_process` (je Rechner; „Suchen“ findet die
  üblichen Installationen, unter Windows `…\QGIS 3.x\bin\qgis_process-qgis-ltr.bat`), die Ablage (fester Ordner im
  Projektordner, Vorgabe `Kataster`, oder der Ordner des aktiven Antrags `TÖB/<Antrag>` – der Antrag aus der
  Projektdatei, `meta.antrag`, gepflegt in PERMIO) mit Dateinamen
  (`{PROJEKT_KUERZEL} {Art} {DATUM} {Name}` – passt zum Namensformat des Antragsordners; alle globalen Platzhalter,
  lokal `{Art}` und `{Name}` des Plans, im festen Ordner `{Antrag}`; alte Namen wie `{Code}` gelten weiter) und die
  Pläne. Vorgegeben sind
  *Katasterplan A4* (Layout „Katasterauszug A4“, 1:1000), *Katasterplan A3* (Layout „Katasterauszug A3“, 1:500),
  *Schwarzplan* (DXF, Kartenthema „Schwarzplan“, 300 × 300 m) und *Katasterplan* (DXF, Kartenthema „Katasterplan“,
  150 × 150 m, je Objekt mit Beschriftungen). Layouts, Kartenobjekte und Kartenthemen stehen zur Auswahl, sobald die
  Vorlage eingelesen ist; was nicht zur Vorlage passt, wird am Plan gemeldet.
- **PDF:** das Kartenobjekt des Layouts (Kennung oder das erste) wird auf die Koordinate der Projektadresse
  zentriert – im eingestellten Maßstab, oder mit Breite × Höhe auf genau diesen Ausschnitt (Maßstab ergibt sich).
  Mit Kartenthema folgt die Karte diesem Thema.
- **DXF:** die sichtbaren Vektorlayer des Kartenthemas im Ausschnitt um die Projektadresse (Rasterlayer wie WMS
  entfallen), Symbolik je Symbolebene, je Objekt oder ohne, Symbolmaßstab = Maßstab des Plans, Beschriftungen wahlweise.
- **Planköpfe:** Projektvariablen `@project_title` (Vorhaben, sonst Name der Projektdatei), `@project_identifier`
  (Projektcode), `@project_street`, `@project_city`, `@project_zip_code` aus der Projektdatei; je Plan außerdem
  `@plan_name`, `@plan_massstab` („1:1000“), `@plan_datum` und `@plan_beschriftung` (Text aus den Einstellungen,
  Platzhalter wie im Dateinamen; Vorgabe „Kartengrundlage: Liegenschaftskarte (ALKIS), Geobasis NRW, Stand
  {DATUM:TT.MM.JJJJ} – kein amtlicher Auszug“).
  `project_title` und `project_identifier` sind in QGIS eingebaute Variablen – gesetzt werden dafür Projekttitel und
  Kennung in den Projekt-Metadaten.
- **Vorlage in der Projektdatei:** beim ersten Export wird die globale Vorlage in die `.oap` übernommen
  (`dateien`, Art `qgis`) und danach von dort verwendet – spätere Änderungen an der Bürovorlage ändern alte Projekte
  nicht. „Vorlage aktualisieren“ im Export-Dialog ersetzt sie durch die aktuelle Fassung.
- Voraussetzung sind **Koordinaten** in der Projektdatei (beim Speichern der Projektadresse abgefragt, EPSG:25832).
  Der Ausschnitt wird auf die geokodierte Adresse zentriert, nicht auf das Flurstück – bei Eckgrundstücken und
  Hinterliegern den Ausschnitt prüfen.
  Im Projektordner wird nichts überschrieben: Gibt es einen Plan schon, wird er übersprungen oder mit neuem Namen
  („… (2).pdf“) abgelegt; bekämen zwei Pläne denselben Namen (etwa ohne `{Name}` im Dateinamen), meldet der Export das
  vorher. Der feste Ablageordner bleibt immer im Projektordner (unzulässige Zeichen, „.“ und „..“ fallen weg).
  `{Art}` im Dateinamen ist die Antragsart des aktiven Antrags (ohne Antrag leer). Schlägt ein Plan fehl, wird keine
  leere oder halbe Datei abgelegt; Kartenthema, Ausschnitt und abgeschaltete Beschriftungen eines Plans gelten nur für
  ihn. „Plan entfernen“ und „Vorgaben“ fragen vorher nach – die Pläne gelten für das ganze Büro.
- **Kein amtlicher Auszug:** Der Export ist eine Arbeits- und Planungsgrundlage. Für den Bauantrag bleibt der
  amtlich beglaubigte Auszug aus der Flurkarte (§ 2 BauPrüfVO NRW) bzw. der amtliche Lageplan (§ 3 Abs. 3 BauPrüfVO
  NRW) nötig. Gespeicherte Einstellungen mit den alten Vorgaben werden beim Einlesen umgestellt: die Beschriftung
  „Auszug aus der Liegenschaftskarte“ auf die heutige Vorgabe, die Namen „Katasterauszug A4/A3“ der beiden PDF-Pläne
  auf „Katasterplan A4/A3“ – nur, wenn der Text genau der alten Vorgabe entspricht; selbst angepasste Texte bleiben.
  Steht `{Name}` im Dateinamen, heißen neue Exporte danach anders; ein schon abgelegter Plan mit altem Namen gilt dann
  nicht als vorhanden.

Umsetzung (`apps/ordner`): `src/kataster/kataster.ts` (Einstellungen, Auslesen der Vorlage, Auftrag), `katasterStore.ts`
(Ablauf), `qgis.ts` (Befehle der Hülle bzw. Ersatz für die Tests), `components/KatasterDialog.tsx` und
`KatasterEinstellungen.tsx`,
`katasterexport.py` (Processing-Skript, wird mitgeliefert und mit `qgis_process run katasterexport.py --
AUFTRAG=<json>` ausgeführt). Die Hülle (`packages/core/tauri/qgis.rs`) startet nur ein Programm namens
`qgis_process…`, legt Skript, Auftrag und Vorlage in einen eigenen temporären Ordner, lässt QGIS dort hineinschreiben
und legt die Pläne danach am Ziel ab – nur neu, nie überschreibend, und nur Pläne, die das Skript als gelungen meldet
(`ERGEBNIS … "ok": true`). Antwortet QGIS nicht, beendet die Hülle es nach einem Zeitlimit (je Plan 3 Minuten,
mindestens 5) und meldet das, statt den Dialog zu sperren.

## Desktop und Browser

Ordner anlegen und einlesen kann nur die Desktop-App. Die Web-Version liefert den Projektordner als
**ZIP-Datei** zum Entpacken (beim Ergänzen nur das Neue; die vorhandene Projektdatei lässt sich dort nicht
ergänzen) und liest Vorlagen- bzw. Projektordner über den Dateidialog (nur lesend; leere Ordner erkennt der
Browser dabei nicht).

Die Desktop-App greift nur auf Ordner zu, die im Dialog gewählt bzw. eingestellt wurden. Sie nutzt die gemeinsamen
Befehle aller Apps ([packages/core/tauri/commands.rs](../packages/core/tauri/commands.rs)): Ordner und Dateien nur
neu anlegen, ersetzen allein die Projektdatei – atomar, nur wenn sie seit dem Einlesen niemand geändert hat, und
mit Sicherungskopie im App-Ordner (`%LOCALAPPDATA%\de.pendzialek.projektordner\Sicherungen`, die neuesten 200).
Umbenennen kann sie nur Mails auf ausdrücklichen Klick (nie überschreibend). Löschen kann das Tool nichts.

## Projektdatei (.oap)

Die Projektdatei ist das gemeinsame Projektarchiv aller Apps (ZIP mit `manifest.json` und `projekt.json`, dazu
Pläne, Modelle und Quelldateien). Dieses Tool schreibt darin die Stammdaten unter `meta` und seine eigenen Angaben
unter `projektordner`:

```json
{
  "name": "Neubau eines Einfamilienhauses",
  "meta": {
    "projektcode": "2026-014",
    "kurzname": "EFH Musterweg",
    "vorhaben": "Neubau eines Einfamilienhauses",
    "adresse": { "strasse": "Musterweg 3", "plz": "48143", "ort": "Münster" },
    "grundstueck": { "gemarkung": "", "flur": "", "flurstueck": "" },
    "bauherr": { "name": "…", "adresse": { "strasse": "", "plz": "", "ort": "" }, "kontakte": [{ "art": "email", "wert": "…" }] },
    "bebauungsplan": { "nummer": "112", "name": "Am Mühlenbach" },
    "bearbeiter": "TP",
    "status": "akquise",
    "leistungsphasen": [1, 2, 3, 4],
    "beteiligte": [{ "rolle": "Tragwerk", "name": "…", "kontakt": "…" }],
    "angelegt": "2026-10-01"
  },
  "projektordner": { "struktur": "Standard", "dateischema": "{PROJEKT_KUERZEL}_{Plannummer}_{Index}_{Titel}", "presets": ["Jedes Projekt", "Bauantrag"] }
}
```

Abschnitte, die eine App nicht kennt (etwa die einer anderen App oder einer neueren Fassung), bleiben beim Lesen
und Schreiben erhalten. Welche Projektdatei gilt, wenn es mehrere gibt (bis vier Ebenen tief): eine im Ordner der
Berechnungen (Pfad enthält „Berechnung“), sonst die mit dem kürzesten Pfad, dann die zuletzt geänderte – dieselbe
Regel wie in PERMIO.

Bis Version 0.1 standen die Stammdaten in einer eigenen `projekt.json` im Projektordner. Sie wird nur noch gelesen
(sie füllt Lücken der Projektdatei, etwa Kurzname und Leistungsphasen) und bleibt liegen. Ist sie nicht lesbar
(beschädigt oder fremd), meldet „Ordner prüfen“ den Hinweis „Alte projekt.json nicht lesbar“, und beim Ergänzen steht
derselbe Hinweis über den Stammdaten – die Datei selbst bleibt unangetastet.

Presets und Bausteine in der Struktur-Datei:

```json
{
  "vorlagenname": "{PROJEKT_KUERZEL} {Name}",
  "presets": [
    {
      "name": "Jedes Projekt",
      "standard": true,
      "eintraege": [
        { "quelle": "Word/Briefbogen.dotx", "ziel": "04 Schriftverkehr/Bauherr", "name": "{PROJEKT_KUERZEL} Brief Bauherr" },
        { "quelle": "Excel/Kostenschätzung.xltx", "ziel": "03 Berechnungen/Kosten" }
      ]
    },
    { "name": "Bauantrag", "eintraege": [{ "quelle": "Bauantrag", "ziel": "06 Genehmigung", "lph": [4] }] }
  ],
  "bausteine": [
    { "name": "Gewerk", "ordner": [{ "pfad": "Angebote" }, { "pfad": "Vergabe" }, { "pfad": "Rechnungen", "lph": [8] }] }
  ]
}
```

`status` fehlt bei beauftragten Projekten (aktiv); `bebauungsplan` fehlt, wenn keiner erfasst ist.

## Grenzen

- „Neues Projekt anlegen“ aus anderen Apps gibt es nur in der Rahmen-App; die einzeln installierten Apps können
  ATLAS nicht starten. PERMIO öffnet das neue Projekt nicht selbst (seine Übersicht zeigt FORMA-Projekte),
  sie wird nur neu geladen.
- Bausteine sind Kopiervorlagen: Ein später geänderter Baustein ändert bereits eingefügte Ordner nicht.
- Mails: nur Outlook-Nachrichten (.msg), keine .eml. Das Thema schlägt die App aus dem Betreff vor – eine inhaltliche
  Zusammenfassung („Raumaufteilung“) setzt man von Hand. Nachrichten nur mit RTF-Text (ohne Klartext/HTML) liefern
  keinen Text für die Erkennung von Weiterleitungen. Verschieben in einen anderen Ordner gibt es noch nicht.
- „Projekt abschließen“ setzt nur den Status; ein Verschieben in einen Archiv-Stammordner (als Kopie) und den
  Prüfbericht als PDF gibt es nicht. Ein von Hand ins Archiv verschobenes Projekt zählt beim Nummernvorschlag mit,
  wenn sein Stammordner eingestellt ist. Keine Obsidian-Projektnotiz.
- Ob eine Vorlage vorhanden ist, entscheidet ihr Name im Projekt. Wurde eine ergänzte Datei später umbenannt,
  ergänzt der nächste Lauf sie erneut – der Trockenlauf zeigt es vorher, und sie lässt sich abwählen.
- Die Planliste ist eine Vorlage, keine Verwaltung – Revisionen und Verteiler führt das Tool nicht.
- Die Nummernvergabe ist ein Vorschlag aus den vorhandenen Ordnern. Legen zwei Personen gleichzeitig an,
  erkennt das Tool die Kollision erst am vorhandenen Ordner – und überschreibt auch dann nichts.
