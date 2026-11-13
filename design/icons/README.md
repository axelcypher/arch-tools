# Iconset (Entwurf)

Einheitliche Icons für die Rahmen-App und alle acht Apps. Quelle ist `erzeugen.mjs`: Farben, Raster und
Symbole stehen dort an einer Stelle; `node design/icons/erzeugen.mjs` schreibt die SVG-Dateien neu.

Noch **nicht** ausgerollt: Die Apps verwenden weiter ihre bisherigen `src-tauri/icon.svg`, `public/favicon.svg`
und die daraus erzeugten PNG/ICO/ICNS.

| | App (neuer Name) | Motiv | Bernstein markiert | Kachel |
|---|---|---|---|---|
| <img src="suite.svg" width="40"> | Rahmen-App (**Arkly**) | Rundbogen mit Kämpfern | Schlussstein – hält den Bogen zusammen wie der Rahmen die Apps | `#242d42` |
| <img src="ordner.svg" width="40"> | Projekt (**ATLAS**) | Projektordner mit Struktur | Reiter – das angelegte Projekt | `#006a65` |
| <img src="formulare.svg" width="40"> | Formulare (**PERMIO**) | Antragsformular mit Eselsohr | Stift, der ausfüllt | `#8f410e` |
| <img src="flaechenrechner.svg" width="40"> | Flächenrechner (**QUADRIO**) | Grundriss mit drei Räumen | berechneter Raum | `#2855ad` |
| <img src="grz.svg" width="40"> | GRZ-Nachweis (**TERRIO**) | Grundstück, Grenze gestrichelt | überbaute Fläche | `#256b35` |
| <img src="kosten.svg" width="40"> | Kostenermittlung (**NUMIO**) | Euro unter dem Dach | Euro – die ermittelten Kosten | `#9a303c` |
| <img src="entzerrung.svg" width="40"> | Entzerrung (**RECTIO**) | Fassade in Perspektive | vier Passpunkte | `#63489a` |
| <img src="ava.svg" width="40"> | AVA (**FABRIO**) | Klemmbrett der Bauleitung | Klammer | `#853a77` |
| <img src="baurecht.svg" width="40"> | Baurecht (**LEXIO**) | Paragraf mit Ampel | gelbes Licht – „prüfen“ | `#33607e` |

Die App Baurecht liegt noch auf dem Branch `claude/nice-fermi-702pde`.

## Regeln

- **Raster** 64 × 64, Kachel vollflächig mit Radius 14.
- **Linien** 4 breit auf Koordinaten ≡ 2 (mod 4) – bei 16, 32 und 48 px liegt jede Linie auf ganzen Pixeln.
  Nichts unter 2 Breite (verschwindet unter 32 px). Keine Buchstaben; Zeichen wie € und § nur als gezeichnete
  Form mit Linie 4.
- **Symbol** in Weiß, ein Motiv, Freiraum ringsum 10–12. Jedes Icon muss bei 14 px (Tab der Rahmen-App) erkennbar
  bleiben.
- **Bernstein** (`#fcba43`, OKLCH 0,83 / 0,15 / 78) für genau ein Element: das, was die App ermittelt oder
  hervorbringt. Nur auf der Kachelfarbe – auf Weiß fehlt der Kontrast (1,7 : 1), auf weißer Tönung ebenso; wo es
  daran grenzt oder es überlappt, trennt eine Fuge in Kachelfarbe (mind. 2).
- **Kachelfarben** mit gleicher Helligkeit (OKLCH L 0,47), nur der Farbton wechselt: Weiß darauf ≥ 6,4 : 1,
  Bernstein ≥ 3,7 : 1. Der Farbton von Bernstein bleibt als Kachel frei. Der Rahmen ist dunkler und fast unbunt,
  damit er nicht wie eine weitere App wirkt. Flächenrechner behält das Blau, das auch `--accent` der Oberfläche ist; Baurecht
  sitzt als gedämpftes Schiefer (C 0,07) zwischen Teal und Blau.

## Ausrollen (wenn abgenommen)

1. `<app>.svg` nach `apps/<app>/src-tauri/icon.svg` und `apps/<app>/public/favicon.svg` kopieren
   (`suite.svg` → `apps/suite/…`).
2. Je App die Icon-Sätze neu erzeugen: `npx tauri icon src-tauri/icon.svg -o src-tauri/icons` im App-Ordner.
