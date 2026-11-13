# RECTIO (Entzerrung)

Die App **RECTIO (Entzerrung)** (`apps/entzerrung`, eigene App mit eigenem Installer) macht aus einem schräg
aufgenommenen Foto einer ebenen Fläche (Fassade, Innenwand, Boden, abfotografierter Plan) ein maßstäbliches
Bild, in dem sich Strecken und Flächen messen lassen.

Bis Version 0.12.0 hieß die App „Entzerrung“. Einstellungen und Daten bleiben beim Update erhalten: Kennung
`de.pendzialek.entzerrung`, Ordner `apps/entzerrung` und die Dateiendung `.entz` bleiben gleich.

## Ablauf

1. **Foto hinzufügen**: über den Knopf „Foto …“ mit Plus-Symbol (auch mehrere auf einmal; danach ist das erste gewählt, nicht lesbare
   Dateien nennt eine gemeinsame Meldung), den Knopf in der leeren Fläche oder per Ziehen ins
   Fenster (JPEG, PNG, WebP). Die Ausrichtung vom
   Handy (Hochformat) wird übernommen. HEIC-Fotos vom iPhone lassen sich nicht lesen; dann am iPhone unter
   Einstellungen › Kamera › Formate „Maximale Kompatibilität“ wählen.
2. **Referenz festlegen** (rechte Leiste, Fotoansicht; alle Werkzeuge zum Setzen und Messen stehen dort, oben
   nur Datei, Ansicht, Auswahl, Rückgängig und Einpassen). Drei Wege:
   - **Rechteck**: Die vier Ecken eines bekannten Rechtecks anklicken (links unten, rechts unten, rechts oben,
     links oben), dann Breite und Höhe eintragen. Beim Setzen zeigt eine Linie zum Mauszeiger den Umriss, am
     Zeiger steht die nächste Ecke. Das Rechteck muss **genau in der Messebene** liegen: z. B. die Außenkanten
     einer Fensteröffnung an der Putzfläche (Fertigmaß am Bau nachgemessen, nicht das Rohbaumaß aus dem Plan –
     die geputzte Öffnung ist je Seite rund 1,5–2 cm kleiner) oder eine Plattenteilung. Fensterrahmen und
     Türblätter liegen um die Laibungstiefe zurück und eignen sich nur, wenn man die Rahmenebene messen will.
     Am besten ein großes Rechteck. Ein Rechteck ist nicht überbestimmt, deshalb zur Kontrolle ein bekanntes
     Maß nachmessen. Einzelne Ecken lassen sich verschieben, aber nicht löschen; „Ecken neu setzen“ löscht alle.
   - **Passpunkte**: Mindestens vier Punkte anklicken und ihre Koordinaten in der Ebene eintragen (x nach rechts,
     y nach oben, in Metern, z. B. aus einem Aufmaß). Nach jedem Punkt steht der Cursor im x-Feld; Enter übernimmt.
     Zeilen ohne Koordinaten sind markiert. Liegen die Koordinaten auf einer Geraden oder ergeben sie ein
     gespiegeltes Bild (y nach unten eingegeben), meldet die Anwendung das. Bei mehr als vier Punkten gleicht sie aus und
     zeigt je Punkt den **Restfehler**. Ein auffällig großer Rest bedeutet: Punkt falsch angeklickt oder falsch
     eingemessen.
   - **Fluchtlinien**: Je mindestens zwei waagerechte und zwei senkrechte Kanten nachziehen und zwei bekannte
     Maße angeben, am besten eine Breite und eine Höhe. Das hilft, wenn kein vollständiges Rechteck zu sehen
     ist. Bei mehr als zwei Kanten je Richtung bzw. mehr als zwei Maßen zeigt die Anwendung die Abweichungen.
     Nach jedem Maß steht der Cursor im Längenfeld. Solange etwas fehlt, steht rechts, was noch fehlt.
3. **Objektivverzeichnung** (optional, empfohlen bei Weitwinkel): Mit „Hilfslinie“ Punkte entlang von Kanten
   setzen, die in Wirklichkeit gerade sind, im Foto aber gebogen erscheinen (Traufe, Sockel, Gebäudekante;
   am besten nahe am Bildrand, je mindestens drei Punkte, Abschluss mit Enter, Doppel- oder Rechtsklick).
   „Verzeichnung schätzen“ berechnet die Korrektur. Sie gilt für alle Ebenen des Fotos. Die Werte k1 und k2
   stehen unter „Feinwerte“; Werte, die das Bild zum Rand hin falten, wendet die Anwendung nicht an und meldet sie.
   Eine reine Tonne (nur k1) lässt sich bis etwa k1 = −0,13 bis in die Bildecken zurückrechnen; bei stärkeren
   Weitwinkeln mindestens drei Hilfslinien setzen, damit auch k2 geschätzt wird. Die Anzeige
   „Abweichung der Hilfslinien von der Geraden: 4,4 px → 0,1 px“ zeigt, wie gut das gelungen ist.
4. **Entzerrt ansehen** und **messen**: Strecke, Linienzug und Fläche. Mit gedrückter Umschalttaste bleibt der
   nächste Punkt waagerecht oder senkrecht zum vorigen. Vorhandene Messpunkte werden gefangen. Längen und
   Flächen stehen auf zwei Nachkommastellen (cm bzw. 0,01 m²) – feiner ist eine Messung im Foto meist nicht.
   „Kopieren“ legt die Messungen als Tabelle in die Zwischenablage, zum Einfügen in Excel (dort mit drei
   Stellen als Rechenwert). „Fläche“ ist die geometrische Fläche in der entzerrten Ebene (z. B. Fassaden- oder
   Wandfläche), keine Fläche nach DIN 277 oder WoFlV. Liegt ein Messpunkt nach einer geänderten Referenz nicht
   mehr in der Ebene (hinter dem Horizont), steht „nicht messbar“ statt einer Zahl; im Export fehlt die Messung.
5. **Exportieren**: als PNG (Maßstab 1:1 in den Bilddaten) oder JPEG, die Auflösung immer im Dateinamen, z. B.
   „2,5mm-px“. Im JPEG steht der Maßstab nur, wenn er sich genau als ganze Pixel je cm oder je Zoll eintragen
   lässt (z. B. 1, 2, 2,5 oder 5 mm je Pixel); sonst nur im Dateinamen, damit kein CAD-Programm einen gerundeten,
   falschen Maßstab übernimmt. Eingezeichnete Messungen tragen die Legende „Maße in m“.
   Oder als **PDF im Maßstab** (A4 bis A0 oder passend zum Bild) mit Plankopf: Projekt (Nummer und Vorhaben aus
   der Projektwahl), Foto und Ebene, „M 1:N – nur bei Druck in tatsächlicher Größe (100 %)“, „Maße in m“, Datum,
   Verfahren, Bildauflösung, Größe eines Fotopixels in der Bezugsfläche, größte Abweichung der Bezugsmaße und
   der Hinweis, maßgebliche Maße am Bau zu prüfen; rechts die Maßstabsleiste. Mit „Ausschnitt ziehen“ wird nur
   ein Teil exportiert. Mehrere Ebenen ergeben keine zusammenhängende Ansicht oder Abwicklung; jede Ebene wird
   einzeln exportiert.

Ein Foto kann mehrere **Ebenen** haben, jede mit eigener Referenz und eigenen Messungen, zum Beispiel beide
Fassadenseiten an einer Gebäudeecke.

## Projekt und Fotoordner

In der Desktop-App beginnt RECTIO mit der **Projektübersicht** (wie die anderen Apps; auch über
„Projekte“ in der Titelleiste): Ein Klick wählt den Projektordner. Hat er noch keine Projektdatei (.oap), werden
die Stammdaten erfasst und die Projektdatei angelegt.

Danach zeigt **„Fotos des Projekts“** alle Fotos (JPEG, PNG, WebP) im **Fotoordner** des Projekts – einer
gemeinsamen Einstellung aller Apps, Vorgabe `09 Fotos`, zu ändern in ATLAS (Projektordner) unter Einstellungen – samt
allen Unterordnern, gruppiert nach Ordner, mit kleinem Vorschaubild, Datum, Suche und Sortierung (Name oder neueste zuerst). „Anderer Ordner …“ wählt einen beliebigen Ordner.

Die Entzerrung eines Fotos liegt **immer neben dem Foto**: gleicher Name, Endung `.entz`
(`Fassade/Nord/IMG_0012.jpg` → `Fassade/Nord/IMG_0012.entz`). Fotos mit vorhandener Entzerrung sind markiert; ein
Klick öffnet sie, sonst beginnt eine neue mit diesem Foto. „Speichern“ schreibt die `.entz` ohne Rückfrage neben
das Foto. Öffnen und Speichern über den Dateidialog bleiben wie bisher.

## Genauigkeit

- Gemessen werden kann nur **in der entzerrten Ebene**. Was davor oder dahinter liegt (Fensterbank, Gesims,
  Laibung, Dachüberstand, Fallrohr), wird verzerrt wiedergegeben.
- Die Referenz sollte einen großen Teil der Fläche abdecken. Ein kleines Rechteck in einer Ecke verstärkt
  jeden Klickfehler, wenn weit davon entfernt gemessen wird.
- Die Lupe beim Setzen von Punkten und das Zoomen (Mausrad) helfen, Ecken pixelgenau zu treffen. Die Statuszeile
  zeigt in der entzerrten Ansicht, wie groß ein Fotopixel an der Mausposition in Wirklichkeit ist, also die
  erreichbare Genauigkeit an dieser Stelle.
- Zur Kontrolle ein bekanntes Maß nachmessen, das nicht zur Referenz gehört.

## Bedienung

| Eingabe | Wirkung |
|---|---|
| Mausrad | Zoomen |
| Ziehen auf freier Fläche, mittlere Maustaste oder `Leertaste`+Ziehen | Verschieben |
| Punkt ziehen | Punkt verschieben (Ecken, Passpunkte, Kanten, Hilfslinien, Messpunkte) |
| `Enter`, Doppelklick, Rechtsklick | Linienzug, Fläche bzw. Hilfslinie abschließen |
| Rechtsklick ohne laufendes Zeichnen | Kontextmenü zum angeklickten Element: Alles zeigen, Foto/Entzerrt, Rückgängig, Wiederholen und zuletzt „… löschen“ (z. B. „Strecke 1 löschen“) |
| `Rücktaste` | letzten Punkt beim Zeichnen zurücknehmen bzw. Auswahl löschen |
| `Entf` | Auswahl löschen (bei Messungen mit gewähltem Punkt nur diesen Punkt) |
| `Esc` | Zeichnen abbrechen, Auswahl aufheben, zurück zur Auswahl |
| `Umschalt` | beim Messen waagerecht/senkrecht |
| `E` | Foto- und entzerrte Ansicht wechseln |
| `F2` | gewählte Ebene umbenennen (in der Ebenenliste; auch ✎ oder Doppelklick) |
| `Pos1` | alles zeigen |
| `Strg+Z` / `Strg+Y` | Rückgängig / Wiederholen |
| `Strg+S` / `Strg+O` | Speichern / Öffnen |

Die Kürzel ohne Strg wirken nur, wenn kein Dialog offen ist und der Fokus nicht auf einem Knopf oder Feld liegt;
`Tab`, Leertaste und Enter bleiben so der Bedienung mit der Tastatur erhalten. Fotos und Ebenen in der linken
Leiste sind mit `Tab` erreichbar (Enter wählt, `Entf` entfernt). Beide Seitenleisten lassen sich in der Breite
ziehen (Doppelklick: Vorgabe), die linke mit „Fotos“ (Pfeil) in der Werkzeugleiste ausblenden.

Beim Schließen fragt die App nach, solange ungespeicherte Änderungen bestehen. „Öffnen …“ merkt sich auf dem
Desktop den Pfad: „Speichern“ schreibt danach ohne Rückfrage in dieselbe Datei. Ändert man während des
Speicherns weiter, bleibt das Projekt als ungespeichert markiert.

Wurde die geöffnete `.entz` inzwischen außerhalb von RECTIO geändert oder angelegt (z. B. von einem anderen Rechner
im Büro), überschreibt „Speichern“ sie nicht. Es erscheint die Meldung „Datei wurde inzwischen geändert“. Die
Änderungen bleiben in der App, und „Unter neuem Namen speichern …“ legt eine Kopie an (Vorschlag „… (Kopie).entz“);
danach lassen sich beide Fassungen vergleichen. In der Desktop-App öffnet „Ordner öffnen“ den Ordner der Datei,
danach erscheint die Rückfrage wieder. Das gilt auch für eine neue Entzerrung neben dem Foto: Hat jemand die
`.entz` inzwischen angelegt, wird sie nicht überschrieben. Beim Speichern liest RECTIO die bisherige Datei nicht
mehr ein, das spart bei großen Projekten Zeit.

## Projektdatei

Gespeichert wird als `.entz`: ein ZIP mit `entzerrung.json` (Fotos, Ebenen, Referenzen, Messungen) und den
unveränderten Originalfotos unter `fotos/`. Entzerrt wird bei jedem Öffnen neu. Zusätzlich speichert die
Anwendung laufend im Browser-Speicher zwischen (IndexedDB) und stellt den Stand nach einem Neustart wieder her;
beim Schließen wird der letzte Stand sofort geschrieben. In Arkly warten Schließen, Andocken, Herauslösen und
Update-Neustart außerdem höchstens 5 s, bis laufendes Schreiben (`.entz`, Zwischenstand, Fotos) fertig ist.
Scheitert dabei ein Schreiben, meldet RECTIO das an Arkly (der Grund steht im Protokoll); Arkly fragt dann nach,
statt das Fenster zu schließen, und „Erneut versuchen“ schreibt den Zwischenstand noch einmal. Ein gescheitertes
Speichern der `.entz` zählt, bis wieder gespeichert oder ein anderes Projekt geöffnet bzw. neu angelegt ist.
Fotos, die Rückgängig/Wiederholen noch braucht, bleiben dort erhalten. Beim Öffnen prüft die Anwendung die Datei: Ungültige Zahlen, Punkte und Messungen werden
verworfen, fehlende Teile ergänzt; bei fehlender Bildgröße oder doppelten Kennungen gilt die Datei als beschädigt.

## Technik

- `src/geo/homographie.ts`: normierte DLT (Hartley) aus vier oder mehr Punktpaaren, Lösung über die Eigenvektoren
  von AᵀA (Jacobi).
- `src/geo/ebene.ts`: Entzerrung je Ebene. Für Fluchtlinien werden die Fluchtpunkte als bestmöglicher Schnitt
  der Kanten bestimmt. Die Fluchtgerade wird ins Unendliche abgebildet (projektiver Anteil), die
  Fluchtrichtungen auf die Achsen (affiner Anteil). Die Maßstäbe je Achse folgen aus den Maßen über
  a²·Δx² + b²·Δy² = L² (kleinste Quadrate, relativ gewichtet).
- `src/geo/verzeichnung.ts`: radiales Modell mit zwei Gliedern um die Bildmitte, verzeichnet = c + (u − c)·(1 + k1·ρ² + k2·ρ⁴).
  Die Schätzung erfolgt mit Nelder-Mead über die Geradheit der Hilfslinien. Bei weniger als drei Linien wird
  nur k1 geschätzt.
- Alle Punkte stehen in Pixeln des Originalfotos. Wird die Referenz oder die Verzeichnung nachgebessert, bleiben
  die Messungen an ihren Bildmerkmalen und rechnen sich neu.
- `src/render/gl.ts`: Die Darstellung rechnet im WebGL2-Shader für jeden Bildschirmpixel über eine 3×3-Matrix
  auf den Fotopunkt zurück, verzeichnet ihn und liest das Foto mit Mipmaps. Daher ist die entzerrte Ansicht in
  jeder Zoomstufe scharf und folgt beim Ziehen der Referenzpunkte sofort. Der Export rendert gekachelt in einen
  Framebuffer (bis 16 000 px Kantenlänge bzw. 60 Mio. Pixel).
- `src/export/pdf.ts`: kleiner eigener PDF-Schreiber (JPEG-Bild, Linien, Helvetica/WinAnsi). `src/export/png.ts`:
  pHYs-Block bzw. JFIF-Dichte für den Maßstab (JFIF nur, wenn auf 0,1 % genau darstellbar). Der Exportbereich
  wird auf ganze Pixel erweitert, damit Bild, Maßstab und eingezeichnete Vektoren genau übereinstimmen.
