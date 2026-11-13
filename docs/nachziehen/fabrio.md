# FABRIO (`apps/ava`): aus dem Designsystem nachziehen

Offene Punkte aus der Designrichtlinie ([docs/design.md](../design.md)) für diese App. Neue Punkte trägt das
Designsystem ein. Erledigte Punkte löscht die App in ihrem eigenen PR (löschen, nicht abhaken). Dateiangaben beziehen
sich auf den Stand beim Eintragen.
- Hinzufügen-Knöpfe mit `<Symbol name="plus" />` statt „+“ als Schriftzeichen (Regel „Listen“): `lv/LvEditor.tsx` (Position, Abschnitt; Menüknopf „Einfügen“ → „Hinzufügen“ mit Symbol plus, seine Punkte Hinweis, Vorbemerkung ohne „+“), `lv/Angebote.tsx` (Bieter), `lv/Auftrag.tsx` (Nachtrag), `Einstellungen.tsx` (Vorlage), `abrechnung/RechnungPruefen.tsx` (Zahlung), `bauleitung/Bautagebuch.tsx` (Tagesbericht; Auswahlliste „Firma hinzufügen …“), `bauleitung/Protokolle.tsx` (Protokoll, Teilnehmer, Punkt), `bauleitung/Beteiligte.tsx` (Beteiligter), `bauleitung/Maengel.tsx` (Mangel); knappe Knöpfe mit `title` „… hinzufügen“; Hinweistexte, die „+ Abschnitt“ usw. nennen, anpassen; UI-Tests, die die Knöpfe beim Text suchen (`bauleitung.ui.test.ts`), mitziehen
- Gliederungsebene im LV-Editor mit Symbol `ausruecken`/`einruecken` statt `pfeilLinks`/`pfeilRechts`, aria-label mit Gegenstand („Position einrücken“): `lv/LvEditor.tsx`
