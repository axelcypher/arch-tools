# Formulare

Die App **Formulare** (`apps/formulare`, eigene App mit eigenem Installer) füllt Bauantragsformulare aus
**SJ FORMA** (SJ Software GmbH, Aachen; Teil von SJ OFFICE) aus – mit einer aufgeräumten Oberfläche statt der
Formularmasken des Originals.

Grundsatz: **Das Originalprogramm muss jede Datei weiter lesen können**, denn im Büro arbeiten alle anderen
weiter mit FORMA. Geändert wird nur der Inhalt von Feldern, nie das Layout, und alles Unveränderte bleibt
Byte für Byte erhalten. Was sich nicht verlustfrei zurückschreiben lässt, wird nur angezeigt.

## Bedienung

- **Projektordner:** Links die Ordner, in denen die FORMA-Projekte liegen – es können mehrere sein (z. B. ein
  Ordner je Standort oder Jahrgang). Sie werden einmal hinzugefügt und bleiben eingestellt; „×“ entfernt einen
  Ordner nur aus der Liste.
- **Projekte:** Jeder Unterordner mit Formularen (`.frmsjf`) oder Projektkarte (`sj_prokarte.sdb`) ist ein
  Projekt. Angezeigt werden Ordnername und Projekttitel; die Suche filtert nach beidem.
- **Formulare:** die Formulare des gewählten Projekts, ohne die alten Fassungen in `_archiv`. 🔒 heißt: Das
  Formular ist anderswo geöffnet. ● heißt: Es gibt nicht gespeicherte Eingaben.
- **Ansicht „Felder“:** alle Textfelder und Kästchen nach Seiten und Abschnitten, mit Suche über Beschriftung
  und Inhalt. Geänderte Felder sind links orange markiert.
- **Ansicht „Seite“:** die Seiten so, wie FORMA sie zeigt (aus den Positionen in der Datei) – zur Kontrolle.
  Die Felder sind dieselben Eingaben wie in der Feldansicht.
- **Speichern** (Strg+S) schreibt die geänderten Felder in die Datei. Vorher wird sie frisch eingelesen: Hat
  sie seit dem Öffnen jemand geändert (z. B. in FORMA gespeichert), wird nicht gespeichert. „Neu laden“ liest
  die neue Fassung und trägt die eigenen Eingaben wieder ein; danach kann gespeichert werden.
- **Entwürfe:** Nicht gespeicherte Eingaben bleiben im Speicher der App erhalten – auch beim Wechsel des
  Formulars oder nach dem Schließen. Beim nächsten Öffnen werden sie wieder eingetragen.

### Sperren

FORMA legt neben jedes geöffnete Formular eine Sperrdatei (gleicher Name, Endung `.frmtmp`). Die App hält es
genauso:

- Liegt beim Öffnen schon eine Sperrdatei da, ist das Formular anderswo geöffnet – es wird **nur angezeigt**,
  mit Benutzer, Rechner und Zeitpunkt aus der Sperrdatei.
- Sonst legt die App eine eigene Sperrdatei im selben Format an und entfernt sie beim Schließen des Formulars
  bzw. beim Beenden – aber nur, solange sie noch genau den eigenen Inhalt hat.
- Bleibt eine Sperrdatei nach einem Absturz liegen, muss sie von Hand gelöscht werden (wie bei FORMA).

### Web-Version

Ohne Desktop-App gibt es keinen Zugriff auf Ordner: Die Web-Version öffnet ein einzelnes Formular über den
Dateidialog, und „Herunterladen“ liefert die geänderte Fassung als Datei. Sperrdateien gibt es dort nicht.

## Dateiformat

Ein FORMA-Projekt ist ein Ordner:

| Datei | Inhalt |
|---|---|
| `*.frmsjf` | ein Formular je Datei (Text, ASCII, CRLF) |
| `_archiv/` | ältere Fassungen eines Formulars (z. B. Anlage I-3 von 2024, als die von 2026 kam) |
| `sj_prokarte.sdb` | Projektkarte (SQLite): Projektdaten, Beteiligte, Grundstück … – `.bak` ist die Sicherung |
| `sj_office.ini` | Projekttitel (`[Allgemeines]`, `Text=`, Windows-1252) |
| `*.frmtmp` | Sperrdatei, solange das Formular geöffnet ist (INI, Windows-1252) |

### Formulardatei (`.frmsjf`)

Signatur und Kopf, dann je Seite eine **Delphi-Formulardefinition im Textformat (DFM)** – ohne Zeilenumbrüche
zwischen den Abschnitten, und am Ende ohne Zeilenumbruch:

```
[*SJ_FORMULAR (w) by SJ GmbH Aachen#][*SJ_BEGIN#][*SJ_MODIFIED#]nw010005[*SJ_VERSION#]2026I[*SJ_END#]
[*S01#][*SJ_BEGIN#]object Form1_2: TFRMABSeiteForm
  …
end
[*SJ_END#][*S02#][*SJ_BEGIN#]object Form2: TFRMABSeiteForm
  …
end
[*SJ_END#]
```

- `SJ_MODIFIED` enthält die Formularkennung (`nw010005` = NRW, Formular 005), `SJ_VERSION` den Stand.
- Layout und eingetragene Werte stehen gemeinsam in den Definitionen: Textfelder (`TMemo`) als
  `Lines.Strings = ('…' '…')`, Kästchen (`TCheckBox`) als `Checked = True` und `State = cbChecked`. Leere
  Felder und leere Kästchen haben diese Eigenschaften gar nicht.
- Zeichenketten schreibt Delphi in Stücken von höchstens 64 Zeichen (mit ` +` verbunden); druckbare
  ASCII-Zeichen in Hochkommas, alles andere als `#nnn` (UTF-16), z. B. `'Bauaufsichtsbeh'#246'rde'`.
- Die Eigenschaften stehen in Delphis fester Reihenfolge: `Lines.Strings` nach `Font.*` und vor `ParentFont`,
  `Checked` nach `Caption`, `State` vor `TabOrder`.
- Die Einrückung ist unregelmäßig (FORMA setzt die Dateien aus Bausteinen zusammen) und wird deshalb nie neu
  berechnet: Jede Eigenschaft behält ihre Originalzeilen, nur geänderte werden neu erzeugt.
- In Textfeldern mit Zeilenumbruch speichert FORMA jede *angezeigte* Zeile einzeln – ein langer Name kann
  also auf zwei Zeilen verteilt sein.
- Eine versteckte Liste `lstbxProkarte` ordnet Textfeldern Einträge der Projektkarte zu (z. B.
  `Memo8=0201aedt070` → Gruppe 201 „Bauherr“, Eintrag 70); daraus füllt FORMA Felder automatisch.

### Umsetzung

`src/forma/` ist der Formatkern: `dfm.ts` liest DFM-Text verlustfrei, `delphi.ts` schreibt Zeichenketten
wie Delphi, `formular.ts` liest und schreibt Formulardateien und ändert Textfelder und Kästchen,
`felder.ts` leitet Beschriftung und Abschnitt eines Felds aus der Lage ab (FORMA kennt keine Verknüpfung),
`sperre.ts` liest und schreibt Sperrdateien.

Die Tauri-Hülle (`src-tauri/src/lib.rs`) ersetzt nur vorhandene `.frmsjf` (atomar über eine temporäre Datei)
und legt nur `.frmtmp` an bzw. löscht sie – sonst schreibt sie nichts.

## Kompatibilitätstests

Die echten FORMA-Dateien sind das Orakel: Jede Zeichenkette, jedes ausgefüllte Textfeld und jedes Kreuz darin
hat FORMA geschrieben. `formular.test.ts` prüft für jede Datei,

- dass sie unverändert byte-genau zurückgeschrieben wird,
- dass jede Zeichenkette genau wie von Delphi kodiert wird,
- dass jedes Textfeld nach Leeren und erneutem Füllen und jedes Kästchen nach Umschalten und Zurückschalten
  wieder die Originaldatei ergibt (damit stimmen auch die Einfügepositionen).

Versioniert ist nur eine anonymisierte Musterdatei (`src/__fixtures__/muster.frmsjf`). Echte Projekte mit
Kundendaten gehören nach `.ref/` im Repository (nicht eingecheckt) oder in den Ordner aus `SJFORMA_REF`:

```bash
SJFORMA_REF=/pfad/zu/forma-projekten npx vitest run --project formulare
```

## Offen

- **Gegenprobe in FORMA:** eine hier gespeicherte Datei in FORMA öffnen, prüfen und dort wieder speichern –
  schreibt FORMA dieselben Bytes, ist der Nachweis vollständig.
- **`InGebrauch` in der Sperrdatei:** Bedeutung unbekannt; die App trägt ihre Prozessnummer ein. Zu prüfen:
  Was zeigt FORMA, wenn die App ein Formular gesperrt hat?
- **Projektkarte:** wird noch nicht gelesen. Mit der Zuordnung aus `lstbxProkarte` ließen sich Felder aus der
  Projektkarte (oder aus `projekt.json` der Projektordner-App) vorbelegen.
- **Beschriftungen in Tabellen** (z. B. „1-fach / 3-fach“-Spalten) sind aus der Lage nur unvollständig ableitbar.
