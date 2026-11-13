# Iconset

Einheitliche Icons für die Rahmen-App und alle acht Apps. Quelle ist `erzeugen.mjs`: Farben, Raster und
Symbole stehen dort an einer Stelle; `node design/icons/erzeugen.mjs` schreibt die SVG-Dateien neu.

Ausgerollt in allen Apps: `src-tauri/icon.svg`, `public/favicon.svg` und die daraus erzeugten Icon-Sätze
(PNG/ICO/ICNS) stammen von hier. Nur Baurecht (LEXIO) folgt mit seiner App.

|                                            | App                          | Motiv                          | Bernstein markiert                                             | Kachel    |
| ------------------------------------------ | ---------------------------- | ------------------------------ | -------------------------------------------------------------- | --------- |
| <img src="suite.svg" width="40">           | **Arkly** (Rahmen-App)       | Rundbogen mit Kämpfern         | Schlussstein – hält den Bogen zusammen wie der Rahmen die Apps | `#242d42` |
| <img src="ordner.svg" width="40">          | **ATLAS** (Projekt)          | Projektordner mit Struktur     | Reiter – das angelegte Projekt                                 | `#006a65` |
| <img src="formulare.svg" width="40">       | **PERMIO** (Formulare)       | Antragsformular mit Eselsohr   | Stift, der ausfüllt                                            | `#8f410e` |
| <img src="flaechenrechner.svg" width="40"> | **QUADRIO** (Flächenrechner) | Grundriss mit drei Räumen      | berechneter Raum                                               | `#2855ad` |
| <img src="grz.svg" width="40">             | **TERRIO** (GRZ-Nachweis)    | Grundstück, Grenze gestrichelt | überbaute Fläche                                               | `#256b35` |
| <img src="kosten.svg" width="40">          | **NUMIO** (Kostenermittlung) | Euro unter dem Dach            | Euro – die ermittelten Kosten                                  | `#9a303c` |
| <img src="entzerrung.svg" width="40">      | **RECTIO** (Entzerrung)      | Fassade in Perspektive         | vier Passpunkte                                                | `#63489a` |
| <img src="ava.svg" width="40">             | **FABRIO** (AVA)             | Klemmbrett der Bauleitung      | Klammer                                                        | `#853a77` |
| <img src="baurecht.svg" width="40">        | **LEXIO** (Baurecht)         | Paragraf mit Ampel             | gelbes Licht – „prüfen“                                        | `#33607e` |

LEXIO (Baurecht) ist noch nicht auf main; sein Icon kommt mit der App.

## Regeln

- **Raster** 64 × 64, Kachel vollflächig mit Radius 14.
- **Linien** 4 breit auf Koordinaten ≡ 2 (mod 4) – bei 16, 32 und 48 px liegt jede Linie auf ganzen Pixeln.
  Nichts unter 2 Breite (verschwindet unter 32 px). Keine Buchstaben; Zeichen wie € und § nur als gezeichnete
  Form mit Linie 4.
- **Symbol** in Weiß, ein Motiv, Freiraum ringsum 10–12. Jedes Icon muss bei 16 px (Tab und Menü der Rahmen-App,
  Browser-Tab) erkennbar bleiben; die Startseite der Rahmen-App zeigt 32 px – beides Größen des Rasters.
- **Bernstein** (`#fcba43`, OKLCH 0,83 / 0,15 / 78) für genau ein Element: das, was die App ermittelt oder
  hervorbringt. Nur auf der Kachelfarbe – auf Weiß fehlt der Kontrast (1,7 : 1), auf weißer Tönung ebenso; wo es
  daran grenzt oder es überlappt, trennt eine Fuge in Kachelfarbe (mind. 2).
- **Kachelfarben** mit gleicher Helligkeit (OKLCH L 0,47), nur der Farbton wechselt: Weiß darauf ≥ 6,4 : 1,
  Bernstein ≥ 3,7 : 1. Der Farbton von Bernstein bleibt als Kachel frei. Der Rahmen ist dunkler und fast unbunt,
  damit er nicht wie eine weitere App wirkt. QUADRIO behält das Blau, das auch `--accent` der Oberfläche ist; LEXIO
  sitzt als gedämpftes Schiefer (C 0,07) zwischen Teal und Blau.

### Festgehaltene Abweichungen

Bewusst abweichend von den Regeln oben (bei 16 px geprüft, bei 2-facher Pixeldichte ohne Einschränkung):

- **ATLAS**: die Zeilen im Ordner sind dunkle Linien 3,5 auf weißer Fläche (y 33/39/45) – drei Zeilen passen sonst
  nicht hinein; bei 16 px leicht weich.
- **NUMIO**: das € hat Linie 5 (Querstriche bei 36,5 und 42), damit es bei 16 px nicht zuläuft.
- **Fuge**: mit `paint-order="stroke"` ist nur die halbe Strichbreite sichtbar – sichtbar mindestens 1,25 (RECTIO,
  Arkly), 1,5 (FABRIO), 1,75 (PERMIO).
- **Freiraum**: Werkzeuge, die über das Motiv hinausragen, dürfen näher an den Rand (PERMIO-Stift bis etwa 4,
  FABRIO-Klammer, RECTIO-Passpunkte und NUMIO-Dach 8–9).

## Ausrollen

Nach einer Änderung am Iconset und für eine neue App (als Nächstes LEXIO):

1. `<app>.svg` nach `apps/<app>/src-tauri/icon.svg` und `apps/<app>/public/favicon.svg` kopieren
   (`suite.svg` → `apps/suite/…`).
2. Je App die Icon-Sätze neu erzeugen: `npx tauri icon src-tauri/icon.svg -o src-tauri/icons` im App-Ordner.
