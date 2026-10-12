# Entzerrung

Die **Entzerrung** (`apps/entzerrung`, eigene App mit eigenem Installer) macht aus einem schräg aufgenommenen
Foto einer ebenen Fläche (Fassade, Innenwand, Boden, abfotografierter Plan) ein maßstäbliches Bild, in dem
sich Strecken und Flächen messen lassen.

## Ablauf

1. **Foto hinzufügen**: über „+ Foto“ oder per Ziehen ins Fenster (JPEG, PNG, WebP). Die Ausrichtung vom
   Handy (Hochformat) wird übernommen. HEIC-Fotos vom iPhone lassen sich nicht lesen; dann am iPhone unter
   Einstellungen › Kamera › Formate „Maximale Kompatibilität“ wählen.
2. **Referenz festlegen** (rechte Leiste, Fotoansicht). Drei Wege:
   - **Rechteck**: Die vier Ecken eines bekannten Rechtecks anklicken (links unten, rechts unten, rechts oben,
     links oben), dann Breite und Höhe eintragen. Am besten ein großes Rechteck wie eine Tür, ein Fenster mit
     bekannten Rohbaumaßen oder eine Plattenteilung.
   - **Passpunkte**: Mindestens vier Punkte anklicken und ihre Koordinaten in der Ebene eintragen (x nach rechts,
     y nach oben, in Metern, z. B. aus einem Aufmaß). Bei mehr als vier Punkten gleicht die Anwendung aus und
     zeigt je Punkt den **Restfehler**. Ein auffällig großer Rest bedeutet: Punkt falsch angeklickt oder falsch
     eingemessen.
   - **Fluchtlinien**: Je mindestens zwei waagerechte und zwei senkrechte Kanten nachziehen und zwei bekannte
     Maße angeben, am besten eine Breite und eine Höhe. Das hilft, wenn kein vollständiges Rechteck zu sehen
     ist. Bei mehr als zwei Kanten je Richtung bzw. mehr als zwei Maßen zeigt die Anwendung die Abweichungen.
3. **Objektivverzeichnung** (optional, empfohlen bei Weitwinkel): Mit „Hilfslinie“ Punkte entlang von Kanten
   setzen, die in Wirklichkeit gerade sind, im Foto aber gebogen erscheinen (Traufe, Sockel, Gebäudekante;
   am besten nahe am Bildrand, je mindestens drei Punkte, Abschluss mit Enter, Doppel- oder Rechtsklick).
   „Verzeichnung schätzen“ berechnet die Korrektur. Sie gilt für alle Ebenen des Fotos. Die Anzeige
   „Abweichung der Hilfslinien von der Geraden: 4,4 px → 0,1 px“ zeigt, wie gut das gelungen ist.
4. **Entzerrt ansehen** und **messen**: Strecke, Linienzug und Fläche. Mit gedrückter Umschalttaste bleibt der
   nächste Punkt waagerecht oder senkrecht zum vorigen. Vorhandene Messpunkte werden gefangen. „Kopieren“ legt
   die Messungen als Tabelle in die Zwischenablage, zum Einfügen in Excel.
5. **Exportieren**: als PNG oder JPEG (Maßstab 1:1 in den Bilddaten, Auflösung im Dateinamen, z. B.
   „2,5mm-px“) oder als **PDF im Maßstab** (A4 bis A0 oder passend zum Bild) mit Maßstabsleiste. Messungen
   lassen sich mit einzeichnen. Mit „Ausschnitt ziehen“ wird nur ein Teil exportiert.

Ein Foto kann mehrere **Ebenen** haben, jede mit eigener Referenz und eigenen Messungen, zum Beispiel beide
Fassadenseiten an einer Gebäudeecke.

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
| `Rücktaste` | letzten Punkt beim Zeichnen zurücknehmen bzw. Auswahl löschen |
| `Entf` | Auswahl löschen (bei Messungen mit gewähltem Punkt nur diesen Punkt) |
| `Esc` | Zeichnen abbrechen, Auswahl aufheben, zurück zur Auswahl |
| `Umschalt` | beim Messen waagerecht/senkrecht |
| `Tab` | Foto- und entzerrte Ansicht wechseln |
| `Pos1` | alles zeigen |
| `Strg+Z` / `Strg+Y` | Rückgängig / Wiederholen |
| `Strg+S` / `Strg+O` | Speichern / Öffnen |

## Projektdatei

Gespeichert wird als `.entz`: ein ZIP mit `entzerrung.json` (Fotos, Ebenen, Referenzen, Messungen) und den
unveränderten Originalfotos unter `fotos/`. Entzerrt wird bei jedem Öffnen neu. Zusätzlich speichert die
Anwendung laufend im Browser-Speicher zwischen (IndexedDB) und stellt den Stand nach einem Neustart wieder her.

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
  pHYs-Block bzw. JFIF-Dichte für den Maßstab.
