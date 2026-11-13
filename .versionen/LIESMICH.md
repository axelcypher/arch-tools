# Versionsnotizen

Versionen setzt nur der Release-Lauf. Ein PR, der Code einer App ändert (`apps/<app>/…`) oder den gemeinsamen Kern
(`packages/core/…`, betrifft alle Apps außer Arkly), legt hier **eine Datei mit eindeutigem Namen** an, am besten nach
dem Zweig: `.versionen/<zweig>.json`. Dateien mit verschiedenen Namen kollidieren nie – so gibt es kein Wettrennen um
Versionsnummern.

```json
{
  "grz": { "stufe": "minor", "notiz": "Neuer Nachweis der Stellplätze." },
  "kosten": { "stufe": "patch", "notiz": "Rundung in der Kostengruppe 300 korrigiert." }
}
```

- Schlüssel: Kennung der App – `flaechenrechner` (QUADRIO), `grz` (TERRIO), `kosten` (NUMIO), `ordner` (ATLAS),
  `entzerrung` (RECTIO), `formulare` (PERMIO), `ava` (FABRIO), `suite` (Arkly).
- `stufe`: `patch` (Fehlerkorrektur), `minor` (neue Funktion) oder `major`.
- `notiz`: ein Satz für die Release-Notiz (Deutsch).
- Arkly braucht eine Notiz nur bei Änderungen an `apps/suite`; sonst setzt der Release-Lauf ihre Version selbst
  (Minor, wenn eine App Minor oder Major erhöht, sonst Patch).

Die CI prüft im PR, dass jede betroffene App in einer Notiz steht, dass die Notizen gültig sind und dass der PR keine
Version ändert (`scripts/versionen-pruefen.mjs`). Der Release-Lauf sammelt alle Notizen auf `main`, hebt je App die
größte verlangte Stufe an allen fünf Stellen, löscht die Notizen und committet das als github-actions nach `main`
(`scripts/versionen-setzen.mjs`). Nach dem Merge deshalb `main` frisch holen.
