# Mails aus Outlook in die App – ohne Add-in (Recherche, Stand 12.11.2026)

Frage: Lassen sich Mails aus Outlook in die App „Projekt“ holen, um sie dort zu benennen und abzulegen, **ohne Add-in
oder sonstige Outlook-seitige Zusätze**? Sonst müsste das Outlook-Makro überarbeitet werden.

## Ergebnis

**Ja – per Ziehen & Ablegen aus dem klassischen Outlook direkt ins Fenster der App.** Outlook übergibt Mails beim
Ziehen als *virtuelle Dateien* (CFSTR_FILEDESCRIPTOR/FILECONTENTS). Chromium – und damit WebView2, auf dem die
Tauri-App läuft – liest sie seit Chrome 76 beim Ablegen in temporäre Dateien und reicht sie der Seite als `File`
(„<Betreff>.msg“, Inhalt = die originale .msg) weiter. Voraussetzung: Das Fenster überlässt das Ziehen der Oberfläche
(`dragDropEnabled: false`; Tauris eigener Handler kennt nur echte Dateien). Outlook-seitig wird nichts installiert, es
gibt keine Sicherheitsabfragen, und es geht mit jedem Postfach (Exchange Online, Exchange vor Ort, IMAP).

Umgesetzt in der App „Projekt“, Reiter „Mails“ → „Mails aus Outlook hierher ziehen“ (siehe
[projektordner.md](projektordner.md#mails)). **Noch auf einem Büro-PC zu bestätigen** – belegt ist das Verhalten über
den Chromium-Quelltext und die Microsoft-Doku zu Outlook-Add-ins in WebView2, nicht in einem Tauri-Fenster selbst.
Wichtig: beim Ziehen „kopieren“ melden, nie „verschieben“ – sonst kann Outlook die Mail aus dem Postfach nehmen (die App
tut das).

Für später, unabhängig vom Outlook-Programm: ein **Graph-Modus** (Exchange Online) – Mails mit einer Kategorie oder in
einem Ordner „Ablage“ markieren, die App holt sie. Liefert allerdings .eml statt .msg.

Das **Makro** bleibt nur Übergang: Das neue Outlook für Windows kennt weder VBA noch COM.

## Die Wege im Überblick

| Weg | Was es braucht (Outlook / Admin / App) | klassisches Outlook | neues Outlook | Einschränkungen | Urteil |
|---|---|---|---|---|---|
| Ziehen & Ablegen in die Oberfläche (`dragDropEnabled: false`) | – / – / .msg lesen, „kopieren“ melden | ja (indirekt belegt) | nein (nur über den Desktop als .eml) | Inhalt statt Pfad; Mails und Anhänge nicht gemischt; keine Ordner | **geht** – umgesetzt |
| Tauris eigenes Ziehen & Ablegen | – | nein | nein | nur echte Dateien (CF_HDROP) | geht nicht |
| COM-Fernsteuerung (Rust oder PowerShell) | laufendes klassisches Outlook / ggf. Gruppenrichtlinie / IDispatch | ja | nein | Sicherheitsabfragen (Absender, Empfänger, SaveAs), gleiche Rechtestufe | eingeschränkt |
| Microsoft Graph | – / App-Registrierung, Admin-Zustimmung / OAuth (PKCE) | ja | ja | nur Exchange Online, nur .eml, keine „Auswahl“ in Outlook | geht |
| EWS | – | – | – | Exchange Online: Abschaltung seit Oktober 2026, endgültig ab 1.4.2027 | geht nicht (vor Ort: geht) |
| IMAP mit OAuth | – / IMAP aktiv, App-Registrierung / IMAP-Client | ja | ja | .eml, keine Kategorien | eingeschränkt |
| .ost/.pst direkt lesen | – | nein | nein | gesperrt, Format, keine Auswahl | geht nicht |
| „Speichern unter“ + überwachter Ordner | – / – / Ordner beobachten | ja | ja (MSG seit 2025) | Handarbeit | eingeschränkt |
| Power Automate | Flow, Gateway, Lizenz | ja | ja | .eml, 20 MB, Gateway | eingeschränkt |
| überarbeitetes Makro | VBA, Makrosicherheit | ja | nein | endet mit der Umstellung | Übergang |

## Einzelheiten

**Ziehen & Ablegen.** Chromium-Commit e524176 (29.04.2019, crbug 322605): virtuelle Dateien aus Outlook beim Ablegen
in temporäre Dateien, Namen für Windows bereinigt, gleiche Betreffs unterschieden, Ordner ausgeschlossen. Microsoft
dokumentiert für Outlook-Add-ins (die unter Windows in WebView2 laufen): Ablegen über die HTML5-API, „Dropped as a .msg
file“, mehrere Nachrichten zugleich, nicht gemischt mit Anhängen. Tauri: „Disabling it is required to use HTML5 drag
and drop on the frontend on Windows“. Das neue Outlook lässt Mails nicht in Web-Ablageflächen ziehen; auf den Desktop
gezogen entsteht eine .eml (nicht verifiziert: Ablegen direkt in die App).

- https://chromium.googlesource.com/chromium/src.git/+/e524176b0fb387f1c3e509364cde09af045b8a91
- https://learn.microsoft.com/en-us/office/dev/add-ins/outlook/drag-drop-items
- https://learn.microsoft.com/en-us/office/dev/add-ins/concepts/browsers-used-by-office-web-add-ins
- https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-utils/src/config.rs (`dragDropEnabled`)
- https://jira.atlassian.com/browse/BSERV-12630 (Ablegen mit „verschieben“ entfernt die Mail)
- https://learn.microsoft.com/en-us/answers/questions/5770202/ (neues Outlook)

**COM.** Braucht ein laufendes klassisches Outlook auf derselben Rechtestufe; die Auswahl gibt es nur mit offenem
Hauptfenster. Geschützt (Sicherheitsabfrage, wenn der Virenschutz nicht als „gut“ gemeldet ist oder eine Richtlinie es
verlangt): Absender, Empfänger, Text, PropertyAccessor und **SaveAs**; gehärtete Rechner (DISA-STIG) verweigern SaveAs
still. Interne Absender liefern eine X.500- statt SMTP-Adresse (SMTP über 0x5D01001F).

- https://learn.microsoft.com/en-us/office/vba/outlook/how-to/security/protected-properties-and-methods
- https://learn.microsoft.com/en-us/office/vba/outlook/how-to/security/security-behavior-of-the-outlook-object-model
- https://support.microsoft.com/kb/2941697
- https://learn.microsoft.com/en-us/microsoft-365-apps/outlook/get-started/state-of-com-add-ins

**Graph.** Delegiert `Mail.Read` bzw. `Mail.ReadWrite` (Kategorie setzen, verschieben); einmalige Admin-Zustimmung
einplanen (Nutzerzustimmung für Mail-Rechte ist in vielen Mandanten gesperrt – nicht offiziell bestätigt). Anmeldung mit
Auth-Code + PKCE über den System-Browser, kein Device-Code. `GET /me/messages/{id}/$value` liefert MIME (.eml); .msg
selbst zu erzeugen wäre Wochen Arbeit – für diesen Weg .eml akzeptieren. Statt „Auswahl in Outlook“: Kategorie
„Ablage“, ein Ordner „Zu archivieren“ (QuickStep/Regel) oder Suche in der App.

- https://learn.microsoft.com/en-us/graph/outlook-get-mime-message
- https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent

**EWS.** Exchange Online schaltet EWS seit Oktober 2026 ab (ohne Admin-Aktion `EWSEnabled=False`), endgültig ab
1.4.2027 – für Neues nicht mehr sinnvoll.

- https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/deprecation-of-ews-exchange-online

**Neues Outlook / Zukunft des Makros.** Enterprise: Opt-out-Phase ab 1.3.2027, die endgültige Umstellung wird
mindestens 12 Monate vorher angekündigt; Business Standard/Premium werden seit Januar 2025 umgestellt (Rückkehr
möglich); das klassische Outlook wird mindestens bis 2029 unterstützt.

- https://mc.merill.net/message/MC949965
- https://learn.microsoft.com/microsoft-365-apps/outlook/get-started/control-install

## Falls das Makro bleibt

Das Makro sollte nur noch Rohdaten abliefern und das Benennen der App überlassen:

1. `SaveAs <Eingang>\<GUID>.msg, olMSGUnicode`
2. daneben `<GUID>.json` (erst als .tmp, dann umbenennen): Absendername und SMTP-Adresse, SMTP-Adressen der Empfänger,
   SentOn und ReceivedTime (ISO 8601 mit Zeitzone), Betreff, ConversationID, InternetMessageID, Ordner in Outlook,
   Richtung (gesendet/empfangen)
3. optional die Kategorie „An App übergeben“ setzen

Mit dem Reiter „Mails“ ist das aber kaum nötig: Die App liest diese Angaben selbst aus der .msg.

## Nicht verifiziert

Ablegen im Tauri-Fenster selbst (nur über Chromium und die Add-in-Doku belegt) · Ablegen direkt aus dem neuen Outlook ·
Verhalten bei sehr großen Mails · Pflicht zur Admin-Zustimmung · Kategorien über IMAP.
