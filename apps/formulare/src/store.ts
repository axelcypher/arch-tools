import { ansichtLesen, verknuepfteFelder } from '@core/ui/ansicht';
import { create } from 'zustand';
import { pickFile, saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { APP_NAMEN } from '@core/appNamen';
import { aenderungenSpeichern } from '@core/ui/Rueckfrage';
import type { AblageOrdner } from './ablage';
import { VORGABE_AUSWAHL, ablageSuchen, auswahlBereinigt, zuordnen } from './ablage';
import type { Dateisystem, PkAenderung } from './dateisystem';
import { hatDateisystem, tauriDateisystem, verbinde } from './dateisystem';
import type { Feld } from './forma/felder';
import { felderDerSeite } from './forma/felder';
import type { Formular } from './forma/formular';
import { formularBytes, istAngekreuzt, memoText, parseFormular, setzeAngekreuzt, setzeMemoText } from './forma/formular';
import type { PkEintrag as PkEintragTyp, PkWert, Projektkarte } from './forma/projektkarte';
import { istWahl, pkAnzeige, pkArt, pkEintrag, pkMoeglichkeiten, pkSchluessel, pkTitel, pkWert, pkWertPasst, pkWertVon, pkZahlAus } from './forma/projektkarte';
import type { Sperre, SperrBewertung, SperrProbe } from './forma/sperre';
import { bewerten, sperreLesen, sperreSchreiben, sperrPfad, zeitstempel } from './forma/sperre';
import { istEigeneSperre, sperreVergessen, sperreVermerken, verwaisteEigeneSperrenAufraeumen } from './eigeneSperren';
import { finde } from './forma/dfm';
import { gleicheFassung } from '@core/fassung';
import { formularSchluessel } from './antrag';
import type { FormularEintrag, Projekt, UnterordnerWahl } from './projekte';
import { formulareMitUnterordner, projekteSuchen } from './projekte';
import type { Adresse, EigeneAdresse } from './adressbuch';
import { adressenAusKarte, eigeneAdressenAus, wirksameAdressen, zusammenfuehren } from './adressbuch';
import { xlsxLesen } from './dokumente/xlsx';
import { bytesGleich as gleich, lesen, schreiben } from './speicher';
import { anzahl } from './text';
import type { Angabe, ProjektdatenEintrag } from './projektdaten';
import { IN_PROJEKTKARTE, projektdatenLesen } from './projektdaten';
import type { OapInhalt } from './oap';
import { OAP_ANGABEN, angabenAus, metaMit } from './oap';
import type { Project, ProjectMeta } from '@core/model';
import { createProject, leereMeta } from '@core/model';
import { wirksamesNamensschema } from '@core/namensschema';
import { parseProjectData } from '@core/serialize';
import { VORGABE_OAP_PFAD, projektdateiPfad } from '@core/projektdatei';
import type { DateiStand } from '@core/platform/projektordner';
import { projektdateiAnlegen, projektdateiLaden, projektdateiSchreiben } from '@core/platform/projektordner';
import { allgemeinAendern, konfigAendern, konfigLesen, konfigNeuLesen } from '@core/platform/konfig';
import { ordnerName } from '@core/platform/projektordner';
import { sichererDateiname } from '@core/projektdatei';
import type { FormularProfil } from './profil';
import type { FormularZustand } from './autofill';
import { autoWerte, autofillFelder, zustandBeimSpeichern } from './autofill';
import type { Abweichung, Eintrag } from './vorgabe';
import { abweichung, abweichungAus, istLeer as abweichungLeer, ohneEigenes, vorgabeFuer, wirksam } from './vorgabe';
import type { FeldAenderung, Verlauf } from './verlauf';
import { abgleichen, eintragen, eintragenMehrere, kannRueckgaengig, kannWiederholen, leererVerlauf, springe, verlaufAus } from './verlauf';
import { GRUNDSTUECK, PLZ_GRUNDSTUECK, istZusatz, mitZusatz } from './zusatz';
import { adresseSchluessel, koordinatenVeraltet, mitKoordinaten } from '@core/platform/geokodierung';

/**
 * Zustand der App: Einstellungen, die gefundenen Projekte, das geöffnete Formular und die Projektkarte.
 *
 * Eingaben werden nicht sofort in die Datei geschrieben, sondern als Änderungen je Feld gesammelt und nach
 * jeder Eingabe lokal gesichert (Entwurf und Verlauf, beides übersteht Neustarts). Erst beim Speichern wird die
 * Datei frisch eingelesen, mit den Änderungen versehen und ersetzt – vorher wird geprüft, dass sie seit dem
 * Öffnen niemand geändert hat.
 */

const log = logger('formulare');

export type Ansicht = 'felder' | 'seite';
export type Hauptansicht = 'formular' | 'projektkarte' | 'antrag' | 'datei' | 'projekte';

/** Dokumente aus dem Projektordner, die die App selbst zeigt (und teils bearbeitet) */
export type DateiArt = 'pdf' | 'excel' | 'word' | 'bild';

export function dateiArtVon(name: string): DateiArt | null {
  const e = /\.([^.]+)$/.exec(name)?.[1].toLowerCase() ?? '';
  if (e === 'pdf') return 'pdf';
  if (e === 'xlsx' || e === 'xlsm') return 'excel';
  if (e === 'docx') return 'word';
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(e)) return 'bild';
  return null;
}

/** Im Projektordner geöffnetes Dokument */
export interface OffeneDatei {
  /** Ordner des Projekts (absolut) */
  root: string;
  /** relativ dazu, mit „/“ */
  pfad: string;
  name: string;
  art: DateiArt;
  /** Inhalt beim Öffnen bzw. nach dem letzten Speichern */
  bytes: Uint8Array;
  /** in Excel/Word geöffnet – nur ansehen */
  inOffice: boolean;
  /** zählt bei jedem Neuladen/Speichern hoch (die Ansicht liest dann neu) */
  stand: number;
}
type Wert = string | boolean;

const EINSTELLUNGEN = 'formulare:einstellungen';
const ENTWUERFE = 'formulare:entwuerfe';
const VERLAEUFE = 'formulare:verlauf';
const PK_ENTWUERFE = 'formulare:projektkarten';
/** Ergänzungen der Projektkarte durch die App (zusatz.ts) je FORMA-Projekt: Schlüssel `<Gruppe>:<Eintrag>` → Text */
const PK_ZUSATZ = 'formulare:projektkarten-zusatz';
const PROFILE = 'formulare:profile';
const ADRESSBUCH = 'formulare:adressbuch';
const ZULETZT = 'formulare:zuletzt';
/** so viele zuletzt geöffnete Projekte merkt sich die App */
const MAX_ZULETZT = 12;

/** Ein zuletzt geöffnetes Projekt */
export interface ZuletztEintrag {
  root: string;
  ordner: string;
  /** zuletzt geöffnet (ms) */
  zeit: number;
}
/** so viele Formulare behalten ihren Verlauf */
const MAX_VERLAEUFE = 60;

/** Zoom der Formularansicht; 0 = an die Breite anpassen */
export const ZOOMSTUFEN = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

interface Gespeichert {
  /** Ordner mit den FORMA-Projekten */
  projektordner: string[];
  /** Ordner mit den echten Projektordnern (Server) */
  ablageordner: string[];
  ansicht: Ansicht;
  zoom: number;
  leisteBreite: number;
  verlaufOffen: boolean;
  gliederungOffen: boolean;
  /** Stammdaten: Vorgabe je Rolle (Gruppe der Projektkarte) → Schlüssel einer Adresse im Adressbuch */
  rollenVorgaben: Record<string, string>;
  /** Ort einer neuen Projektdatei (.oap) im Projektordner – gemeinsam für alle Apps (allgemein.json, oapPfad) */
  oapVorlage: string;
  /** gewählte Projektdatei je Projektkürzel (Pfad relativ zum Projektordner) */
  oapWahl: Record<string, string>;
  /** angezeigte Pfade im echten Projektordner: Vorgabe und je Projektkürzel */
  vorgabeAuswahl: string[];
  auswahl: Record<string, string[]>;
  /** Projektkarte: Gruppen (Kennung, z. B. 201 Bauherr), die oben unter „Favoriten“ stehen – für alle Projekte */
  kartenFavoriten: number[];
  /** Projektordner, Ansicht „Ordner“: von Hand gezogene Reihenfolge der Ordner je Ebene (Pfad klein → Namen klein) – für alle Projekte */
  ordnerReihenfolge: Record<string, string[]>;
  /** Projektkarte: Gruppen, die in der Gliederung ausgeblendet sind – für alle Projekte */
  kartenAusgeblendet: number[];
  /**
   * Projektkarte: ausgeblendete Einträge innerhalb der Gruppen – `a:<Eintrag>` für alle Beteiligten (gleicher Aufbau),
   * sonst `<Gruppe>:<Eintrag>`; für alle Projekte
   */
  kartenEintraegeAusgeblendet: string[];
}

export type SperrZustand =
  /** eigene Sperrdatei angelegt (Inhalt zum späteren Löschen) */
  | { art: 'eigen'; daten: Uint8Array }
  /** anderswo geöffnet – nur ansehen */
  | { art: 'fremd'; sperre: Sperre; daten: Uint8Array; bewertung: SperrBewertung }
  /** Browser: einzelne Datei, keine Sperre möglich */
  | { art: 'ohne' };

export interface OffenesFormular {
  /** null im Browser (einzelne Datei) */
  projekt: Projekt | null;
  /** relativ zum Projektordner; im Browser der Dateiname */
  pfad: string;
  name: string;
  /** Inhalt der Datei beim Öffnen bzw. nach dem letzten Speichern */
  bytes: Uint8Array;
  formular: Formular;
  /** je Seite */
  felder: Feld[][];
  /** geänderte Felder (Schlüssel `<Seite>:<Name>`) */
  aenderungen: Record<string, Wert>;
  verlauf: Verlauf;
  /** Zeitpunkt der letzten lokalen Sicherung (ms) */
  gesichert: number | null;
  sperre: SperrZustand;
  /** Grund, warum nicht gespeichert werden kann (sonst null) */
  nurLesen: string | null;
}

/** Projektkarte des gewählten Projekts mit den noch nicht gespeicherten Änderungen */
export interface OffeneKarte {
  projekt: Projekt;
  karte: Projektkarte;
  /** Schlüssel `<Gruppe>:<Eintrag>` → neuer Wert (Text, Nummer der Wahl, Kästchen 0/1) */
  aenderungen: Record<string, PkWert>;
  verlauf: Verlauf;
  /** Zeitpunkt der letzten lokalen Sicherung (ms) */
  gesichert: number | null;
}

/** Wert für einen Eintrag der Projektkarte */
export interface KartenWert {
  gruppe: number;
  id: number;
  wert: PkWert;
}

export interface Meldung {
  art: 'info' | 'fehler';
  text: string;
}

/** Dialog mit wartender Aktion: Projektordner zuordnen bzw. Projektdatei (Stammdaten) anlegen */
export type DialogArt = 'ordner' | 'oap';

interface FormulareState extends Gespeichert {
  ds: Dateisystem | null;
  projekte: Projekt[];
  suchfehler: string[];
  sucht: boolean;
  projekt: Projekt | null;
  formulare: FormularEintrag[];
  /**
   * Sammelprojekt (Unterordner je Antrag): Unterordner des aktiven Antrags (null, wenn es für ihn keinen gibt) und alle
   * Antrags-Unterordner; null bei einem gewöhnlichen Projekt
   */
  sammel: { unterordner: string | null; alle: string[] } | null;
  offen: OffenesFormular | null;
  haupt: Hauptansicht;
  /** zuletzt geöffnete Projekte, das neueste zuerst */
  zuletzt: ZuletztEintrag[];
  karte: OffeneKarte | null;
  datei: OffeneDatei | null;
  /** ungespeicherte Bearbeitungen je Dokument (`root|pfad`), nur für diese Sitzung */
  dateiEntwuerfe: Record<string, unknown>;
  /** eigene Einstellungen der Formulare (Gliederung, Füllstand, Bedingungen) je Formular und Stand – als Abweichung von der Vorgabe der App */
  profile: Record<string, Abweichung>;
  /** das Adressbuch, wie es gilt: Adressen der Projektkarten aller FORMA-Projekte mit den eigenen zusammengeführt (null = noch nichts da) */
  adressbuch: { adressen: Adresse[]; stand: number } | null;
  /** zuletzt aus den Projektkarten eingelesene Adressen */
  adressbuchKarten: { adressen: Adresse[]; stand: number } | null;
  /** eigene Adressen der App (gemeinsamer Konfigurationsordner) */
  eigeneAdressen: EigeneAdresse[];
  /** Namensschema des Büros (gemeinsame Einstellungen, roh) – es gilt das der Projektdatei, sonst dieses */
  namensschemaBuero: unknown;
  /** Einlesen läuft: so weit */
  adressbuchLaeuft: { fertig: number; gesamt: number } | null;
  /** Projektdaten.xlsx des gewählten Projekts (nur noch zum Übernehmen alter Angaben); 'fehlt' = keine, null = nicht gesucht */
  projektdaten: ProjektdatenDatei | 'fehlt' | null;
  /** Projektdatei (.oap) des gewählten Projekts – Quelle der Projektstammdaten; 'fehlt' = keine gefunden */
  oap: OapDatei | 'fehlt' | null;
  /** Stammdaten-Dialog zum Anlegen der fehlenden Projektdatei (mit Vorbelegung aus der Projektkarte) */
  stammdatenDialog: { grund: string; meta: ProjectMeta } | null;
  /** Dialog „Projektordner zuordnen“ (wählen oder im Stammordner anlegen) */
  ordnerDialog: { grund: string } | null;
  /** zählt hoch, wenn sich Dateien im Projektordner geändert haben können – der Baum liest dann neu */
  ordnerStand: number;
  /** von Hand zugeordnete Projektordner je Kürzel (vollständiger Pfad) – gemeinsam im Konfigurationsordner */
  ordnerWahl: Record<string, string>;
  /** Bereich der Einstellungen */
  einstellungsBereich: EinstellungsBereich;
  /** Einstellungen als Modal über der aktuellen Ansicht geöffnet */
  einstellungenOffen: boolean;
  /** echte Projektordner (erste und zweite Ebene) */
  ablage: AblageOrdner[];
  ablageFehler: string[];
  /** Datei wurde seit dem Öffnen außerhalb geändert – Speichern verweigert, bis neu geladen wurde */
  konflikt: boolean;
  meldung: Meldung | null;

  setAnsicht: (a: Ansicht) => void;
  setHaupt: (h: Hauptansicht) => void;
  setZoom: (z: number) => void;
  setLeisteBreite: (b: number) => void;
  setVerlaufOffen: (o: boolean) => void;
  setGliederungOffen: (o: boolean) => void;
  setMeldung: (m: Meldung | null) => void;
  ordnerHinzufuegen: (pfad: string) => Promise<void>;
  ordnerEntfernen: (pfad: string) => Promise<void>;
  ablageHinzufuegen: (pfad: string) => Promise<void>;
  ablageEntfernen: (pfad: string) => Promise<void>;
  setVorgabeAuswahl: (liste: string[]) => void;
  /** Pfadliste für ein Projekt; `null` = wieder die Vorgabe */
  setAuswahl: (kuerzel: string, liste: string[] | null) => void;
  projekteLaden: () => Promise<void>;
  /** Einstellungen und Gliederungen neu aus dem lokalen Speicher lesen (nach dem Einspielen einer Datei) */
  einstellungenNeuLesen: () => Promise<void>;
  ablageLaden: () => Promise<void>;
  projektWaehlen: (p: Projekt | null) => Promise<void>;
  /** Projekt aus „Zuletzt geöffnet“ streichen */
  zuletztEntfernen: (p: Pick<Projekt, 'root' | 'ordner'>) => void;
  formularOeffnen: (e: FormularEintrag) => Promise<void>;
  /**
   * Formulare des Projekts neu lesen – im Sammelprojekt mit dem Unterordner des aktiven Antrags. Liefert, ob sich die
   * Liste geändert hat; `still`: ein Lesefehler wird weitergereicht statt gemeldet (regelmäßiges Auffrischen)
   */
  formulareNeuLesen: (o?: { still?: boolean }) => Promise<boolean>;
  /** Browser: einzelne .frmsjf-Datei über den Dateidialog */
  dateiOeffnen: () => Promise<void>;
  schliessen: () => Promise<void>;
  wertSetzen: (feld: Feld, wert: Wert) => void;
  /** Feld verlassen: ein geleertes Feld mit Auto-Wert bekommt ihn wieder (erzwungen leer: ein Leerzeichen) */
  feldVerlassen: (feld: Feld) => void;
  /** nicht geöffnetes Formular ändern: in den Entwurf, falls es einen gibt, sonst in die Datei (mit Sperre) */
  formularAendern: (pfad: string, werte: Record<string, Wert>) => Promise<'entwurf' | 'gespeichert' | 'gesperrt' | 'nurLesen' | 'eingereicht'>;
  /** mehrere Felder in einem Schritt (Ausfüllen aus der Projektkarte) */
  werteSetzen: (werte: { feld: Feld; wert: Wert }[], titel: string) => void;
  /** liefert den Schlüssel des betroffenen Felds (zum Hinspringen) */
  rueckgaengig: () => string | null;
  wiederholen: () => string | null;
  zuVerlaufsstand: (position: number) => void;
  speichern: () => Promise<void>;
  /** Datei neu einlesen; eigene Änderungen bleiben erhalten */
  neuLaden: () => Promise<void>;
  /** Sperre des offenen Formulars neu bewerten; ist sie weg, wird das Formular zum Bearbeiten geöffnet */
  sperreNeuPruefen: () => Promise<void>;
  /** fremde Sperre des offenen Formulars aufheben und es zum Bearbeiten öffnen */
  sperreAufheben: () => Promise<void>;
  /** alle Sperrdateien des gewählten Projekts mit Bewertung */
  sperrenAuflisten: () => Promise<SperrEintrag[]>;
  /** eine Sperrdatei des Projekts aufheben (nur wenn sie noch genau `daten` enthält) */
  sperrdateiAufheben: (pfad: string, daten: Uint8Array) => Promise<boolean>;
  karteLaden: () => Promise<void>;
  karteSetzen: (gruppe: number, id: number, wert: PkWert) => void;
  /**
   * Mehrere Einträge in einem Schritt (Übernehmen, Leeren, Verwerfen). Verknüpfte Einträge (eigene Ansicht) werden
   * mitgefüllt – außer bei `ohneVerknuepfungen` (Verwerfen, Gruppe leeren: nur die genannten Einträge);
   * `zusammenfassen` führt einen gleichen Schritt beim Tippen fort
   */
  karteMehrere: (werte: KartenWert[], titel: string, o?: { zusammenfassen?: boolean; ohneVerknuepfungen?: boolean }) => void;
  /** liefert den Schlüssel des betroffenen Eintrags (zum Hinspringen) */
  karteRueckgaengig: () => string | null;
  karteWiederholen: () => string | null;
  /** alle ungespeicherten Änderungen zurücknehmen – als ein Schritt, der sich rückgängig machen lässt */
  karteVerwerfen: () => void;
  karteSpeichern: () => Promise<void>;
  /** Dokument aus dem Projektordner in der App zeigen */
  dateiAnsehen: (root: string, pfad: string) => Promise<void>;
  /** Dokument neu einlesen (Bearbeitungen bleiben als Entwurf) */
  dateiNeuLaden: () => Promise<void>;
  /** neue Fassung speichern – vorher prüfen, dass die Datei seit dem Öffnen unverändert ist */
  dateiSpeichern: (neu: Uint8Array) => Promise<boolean>;
  /** Entwurf des gezeigten Dokuments (bzw. von `fuer`) setzen; null = keiner (gespeichert oder verworfen) */
  setDateiEntwurf: (wert: unknown, fuer?: Pick<OffeneDatei, 'root' | 'pfad'>) => void;
  /** wirksames Profil eines Formulars speichern (gespeichert wird die Abweichung von der Vorgabe); null = alles auf die Vorgabe */
  profilSetzen: (schluessel: string, profil: FormularProfil | null) => void;
  /** eigene Einstellungen eines Formulars auch unter einem anderen Schlüssel (umbenanntes Formular ohne Kennung) – nur, wenn dort noch keine stehen */
  profilKopieren: (von: string, nach: string) => void;
  /** eigene Änderungen an einem Abschnitt, Feld oder einer Gruppe verwerfen – es gilt wieder die Vorgabe */
  eigenesVerwerfen: (schluessel: string, eintrag: Eintrag) => void;
  /** Einstellungen als Modal öffnen – die Ansicht darunter bleibt, wie sie ist */
  einstellungenOeffnen: (bereich?: EinstellungsBereich) => void;
  einstellungenSchliessen: () => void;
  setRollenVorgabe: (gruppe: number, schluessel: string | null) => void;
  /** Gruppe der Projektkarte als Favorit markieren bzw. die Markierung entfernen */
  kartenFavoritUmschalten: (gruppe: number) => void;
  /** Reihenfolge der Ordner einer Ebene im Projektordner-Baum setzen (Namen); leer = wieder alphabetisch */
  ordnerReihenfolgeSetzen: (ebene: string, namen: string[]) => void;
  /** Gruppe der Projektkarte in der Gliederung aus- bzw. wieder einblenden */
  kartenAusblendenUmschalten: (gruppe: number) => void;
  /** Einträge (Schlüssel siehe `kartenEintraegeAusgeblendet`) aus- bzw. wieder einblenden */
  kartenEintraegeUmschalten: (schluessel: string[]) => void;
  setOapVorlage: (pfad: string) => void;
  /** Projektdatei für das gewählte Projekt festlegen; null = wieder automatisch */
  oapWaehlen: (pfad: string | null) => Promise<void>;
  /** gemeinsame Einstellungen (allgemein.json) übernehmen: Stammordner der Projekte, Ort neuer Projektdateien */
  gemeinsamLaden: () => Promise<void>;
  /** Namensschema des Büros neu lesen (beim Zurückkommen ins Fenster) – gesetzt nur, wenn es sich geändert hat */
  namensschemaNeuLesen: () => Promise<void>;
  /** Projektdatei gezielt ändern (frisch lesen, nur `projekt.json`); legt sie nicht an – dann false */
  oapAendern: (aendern: (roh: Record<string, unknown>) => Record<string, unknown>) => Promise<boolean>;
  /** Stammdaten-Dialog öffnen, um die fehlende Projektdatei anzulegen; `danach` läuft nach dem Anlegen, `abgebrochen` beim Abbrechen (z. B. eine Zusage zurücknehmen) */
  stammdatenErfassen: (grund: string, danach?: () => Promise<void>, abgebrochen?: (art: DialogArt) => void) => Promise<void>;
  /** Projektdatei mit diesen Stammdaten anlegen (aus dem Dialog) */
  projektdateiAnlegen: (meta: ProjectMeta) => Promise<void>;
  stammdatenAbbrechen: () => void;
  /** Dialog öffnen, um dem gewählten Projekt einen Projektordner zuzuordnen; `danach` läuft nach dem Zuordnen (bzw. Anlegen der Projektdatei), `abgebrochen` beim Abbrechen */
  projektordnerZuordnen: (grund: string, danach?: () => Promise<void>, abgebrochen?: (art: DialogArt) => void) => void;
  /** vorhandenen Ordner zuordnen */
  projektordnerWaehlen: (pfad: string) => Promise<void>;
  /** neuen Projektordner im Stammordner anlegen und zuordnen */
  projektordnerAnlegen: (stammordner: string, name: string) => Promise<void>;
  ordnerDialogSchliessen: () => void;
  /** Projektordner-Baum neu lesen lassen */
  ordnerNeuLesen: () => void;
  /** Projektdatei neu lesen, wenn sie sich seitdem geändert hat (oder bisher fehlte) */
  oapAuffrischen: () => Promise<void>;
  /** Projektdatei des gewählten Projekts suchen und lesen */
  oapLaden: () => Promise<void>;
  /** Angaben aus der Projektdatei in die Projektkarte übernehmen (ein Schritt) */
  oapUebernehmen: (angaben: Angabe[]) => void;
  /** Angaben der Projektkarte (mit ungespeicherten Änderungen) in die Projektdatei eintragen – legt sie an, wenn sie fehlt */
  oapEintragen: (angaben: Angabe[]) => Promise<void>;
  /** Adressbuch aus allen FORMA-Projekten neu einlesen */
  adressbuchLaden: () => Promise<void>;
  /** Adressen ins Adressbuch aufnehmen (z. B. eine eben als Vorgabe festgelegte) */
  adressbuchErgaenzen: (adressen: Adresse[]) => void;
  /** eigene Adresse speichern (neu, geänderte Fassung oder ausgeblendet) */
  eigeneAdresseSpeichern: (a: EigeneAdresse) => Promise<void>;
  /** eigene Adresse bzw. eigene Fassung entfernen – bei Adressen aus Projektkarten gilt wieder deren Fassung */
  eigeneAdresseEntfernen: (schluessel: string) => Promise<void>;
  /** Projektdaten.xlsx des gewählten Projekts suchen und lesen */
  projektdatenLaden: () => Promise<void>;
  /** Angaben aus der Projektdaten.xlsx in die Projektkarte übernehmen (ein Schritt) */
  projektdatenUebernehmen: (angaben: Angabe[]) => void;
}

export type EinstellungsBereich = 'ordner' | 'stammdaten' | 'adressbuch' | 'formulare' | 'antrag' | 'projektdaten' | 'sicherung';

export interface OapDatei {
  /** Projektordner (absolut) */
  root: string;
  pfad: string;
  /** Stand beim Lesen (zum Erkennen fremder Änderungen) */
  stand: DateiStand;
  /** das ganze Projekt, wie es die Apps lesen (auch die Abschnitte anderer Apps unter `erweiterungen`) */
  projekt: Project;
  inhalt: OapInhalt;
  /** alle Projektdateien im Projektordner (für die Wahl) */
  kandidaten: string[];
}

export interface ProjektdatenDatei {
  /** Projektordner (absolut) */
  root: string;
  pfad: string;
  bytes: Uint8Array;
  eintraege: ProjektdatenEintrag[];
  inOffice: boolean;
}

/* ---------- lokaler Speicher ---------- */

const strings = (x: unknown) => (Array.isArray(x) ? x.filter((p): p is string => typeof p === 'string') : []);
const zahlen = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((p): p is number => Number.isInteger(p)))] : []);

function ladeEinstellungen(): Gespeichert {
  const o = lesen<Partial<Gespeichert>>(EINSTELLUNGEN, {});
  const auswahl: Record<string, string[]> = {};
  if (o.auswahl && typeof o.auswahl === 'object') for (const [k, v] of Object.entries(o.auswahl)) auswahl[k] = strings(v);
  return {
    projektordner: strings(o.projektordner),
    ablageordner: strings(o.ablageordner),
    ansicht: o.ansicht === 'felder' ? 'felder' : 'seite',
    zoom: typeof o.zoom === 'number' && (o.zoom === 0 || ZOOMSTUFEN.includes(o.zoom)) ? o.zoom : 0,
    leisteBreite: typeof o.leisteBreite === 'number' ? Math.min(600, Math.max(220, o.leisteBreite)) : 300,
    verlaufOffen: o.verlaufOffen === true,
    gliederungOffen: o.gliederungOffen !== false,
    rollenVorgaben: o.rollenVorgaben && typeof o.rollenVorgaben === 'object' ? Object.fromEntries(Object.entries(o.rollenVorgaben).filter(([, v]) => typeof v === 'string')) : {},
    // früher eigene Einstellung „oapNeu“ – wird beim ersten Start in die gemeinsamen Einstellungen übernommen
    oapVorlage: typeof o.oapVorlage === 'string' && o.oapVorlage.trim() ? o.oapVorlage : typeof (o as { oapNeu?: unknown }).oapNeu === 'string' && (o as { oapNeu: string }).oapNeu.trim() ? (o as { oapNeu: string }).oapNeu : VORGABE_OAP_PFAD,
    oapWahl: o.oapWahl && typeof o.oapWahl === 'object' ? Object.fromEntries(Object.entries(o.oapWahl).filter(([, v]) => typeof v === 'string')) : {},
    vorgabeAuswahl: Array.isArray(o.vorgabeAuswahl) ? strings(o.vorgabeAuswahl) : VORGABE_AUSWAHL,
    auswahl,
    kartenFavoriten: zahlen(o.kartenFavoriten),
    ordnerReihenfolge:
      o.ordnerReihenfolge && typeof o.ordnerReihenfolge === 'object' ? Object.fromEntries(Object.entries(o.ordnerReihenfolge).map(([k, v]) => [k, strings(v).map((x) => x.toLowerCase())])) : {},
    kartenAusgeblendet: zahlen(o.kartenAusgeblendet),
    kartenEintraegeAusgeblendet: [...new Set(strings(o.kartenEintraegeAusgeblendet))],
  };
}

export { VORGABE_OAP_PFAD };

/** Adressbuch, wie es gilt (Projektkarten + eigene); null, solange beides fehlt */
function wirksamesAdressbuch(karten: { adressen: Adresse[]; stand: number } | null, eigene: EigeneAdresse[]): { adressen: Adresse[]; stand: number } | null {
  if (!karten && !eigene.length) return null;
  return { adressen: wirksameAdressen(karten?.adressen ?? [], eigene), stand: karten?.stand ?? 0 };
}

/**
 * eigene Adressen im gemeinsamen Konfigurationsordner ändern (Bereich „formulare“, Eintrag „adressen“): `aendern` wirkt
 * auf den frisch gelesenen Stand, nicht auf die Liste im Speicher – so bleiben Adressen erhalten, die ein anderer
 * Rechner inzwischen ergänzt hat bzw. die nach einem Wechsel des Speicherorts am neuen Ort liegen
 */
async function eigeneAendern(aendern: (liste: EigeneAdresse[]) => EigeneAdresse[]) {
  const s = useFormulare.getState();
  const sofort = aendern(s.eigeneAdressen);
  useFormulare.setState({ eigeneAdressen: sofort, adressbuch: wirksamesAdressbuch(s.adressbuchKarten, sofort) });
  try {
    const neu = await konfigAendern('formulare', (roh) => {
      const o = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
      return { ...o, adressen: aendern(eigeneAdressenAus(o.adressen)) };
    });
    const liste = neu.adressen;
    useFormulare.setState({ eigeneAdressen: liste, adressbuch: wirksamesAdressbuch(useFormulare.getState().adressbuchKarten, liste) });
  } catch (e) {
    // nicht gespeichert: wieder den gültigen Stand zeigen
    useFormulare.setState({ eigeneAdressen: s.eigeneAdressen, adressbuch: wirksamesAdressbuch(useFormulare.getState().adressbuchKarten, s.eigeneAdressen) });
    useFormulare.getState().setMeldung({ art: 'fehler', text: `Adressbuch nicht gespeichert: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/* ---------- Entwürfe und Verlauf ---------- */

const dokSchluessel = (o: Pick<OffenesFormular, 'projekt' | 'pfad'>) => (o.projekt ? `${o.projekt.root}|${o.pfad}` : `datei|${o.pfad}`);
const karteSchluessel = (p: Projekt) => `karte|${p.root}|${p.ordner}`;

/** gemerkte Ergänzungen eines Projekts; die PLZ des Grundstücks sonst aus der Projektdatei (.oap) */
function zusatzWerte(p: Projekt, oap: FormulareState['oap']): Record<string, string> {
  const gemerkt = lesen<Record<string, Record<string, string>>>(PK_ZUSATZ, {})[karteSchluessel(p)] ?? {};
  const plz = `${GRUNDSTUECK}:${PLZ_GRUNDSTUECK}`;
  if (!(plz in gemerkt) && oap && oap !== 'fehlt' && oap.inhalt.meta.adresse.plz.trim()) return { ...gemerkt, [plz]: oap.inhalt.meta.adresse.plz.trim() };
  return gemerkt;
}

function zusatzMerken(p: Projekt, werte: Record<string, string>) {
  const alle = lesen<Record<string, Record<string, string>>>(PK_ZUSATZ, {});
  alle[karteSchluessel(p)] = { ...alle[karteSchluessel(p)], ...werte };
  schreiben(PK_ZUSATZ, alle);
}

const entwuerfe = () => lesen<Record<string, Record<string, Wert>>>(ENTWUERFE, {});

export const hatEntwurf = (projekt: Projekt, pfad: string) => !!entwuerfe()[dokSchluessel({ projekt, pfad })];

/** Ungespeicherte Eingaben irgendwo im Projekt (Formulare oder Projektkarte) */
export function projektHatEntwuerfe(p: Pick<Projekt, 'root' | 'ordner'>): boolean {
  const vorne = `${p.root}|${p.ordner}/`;
  return Object.keys(entwuerfe()).some((k) => k.startsWith(vorne)) || !!lesen<Record<string, unknown>>(PK_ENTWUERFE, {})[`karte|${p.root}|${p.ordner}`];
}

/** gespeicherte eigene Einstellungen der Formulare prüfen (frühere Bedingungen als Liste werden zur Und-Gruppe) */
function profileAus(roh: unknown): Record<string, Abweichung> {
  if (!roh || typeof roh !== 'object') return {};
  const out: Record<string, Abweichung> = {};
  for (const [k, v] of Object.entries(roh as Record<string, unknown>)) {
    try {
      const e = abweichungAus(v);
      if (e && !abweichungLeer(e)) out[k] = e;
    } catch {
      // unlesbar: weglassen
    }
  }
  return out;
}

const wirksamCache = new Map<string, { e: Abweichung | undefined; p: FormularProfil }>();
/** Wirksames Profil eines Formulars: Vorgabe der App, darüber die eigenen Einstellungen (gleiches Objekt, solange sich nichts ändert) */
export function profilFuer(profile: Record<string, Abweichung>, schluessel: string): FormularProfil {
  const e = profile[schluessel];
  const c = wirksamCache.get(schluessel);
  if (c && c.e === e) return c.p;
  const p = wirksam(vorgabeFuer(schluessel), e);
  wirksamCache.set(schluessel, { e, p });
  return p;
}

function zuletztLaden(): ZuletztEintrag[] {
  const roh = lesen<unknown>(ZULETZT, []);
  return Array.isArray(roh)
    ? roh.filter((z): z is ZuletztEintrag => !!z && typeof z.root === 'string' && typeof z.ordner === 'string' && typeof z.zeit === 'number').slice(0, MAX_ZULETZT)
    : [];
}

/** Ungespeicherte Eingaben eines (nicht geöffneten) Formulars und wann sie zuletzt geändert wurden */
export function entwurfVon(projekt: Projekt, pfad: string): { aenderungen: Record<string, Wert>; zeit: number } | null {
  const k = dokSchluessel({ projekt, pfad });
  const aenderungen = entwuerfe()[k];
  if (!aenderungen || !Object.keys(aenderungen).length) return null;
  return { aenderungen, zeit: lesen<Record<string, number>>(VERLAEUFE, {})[k] ?? Date.now() };
}

/** Verlauf je Formular unter eigenem Schlüssel; ein Verzeichnis hält fest, wann er zuletzt geändert wurde */
const verlaufSchluessel = (k: string) => `${VERLAEUFE}:${k}`;

function verlaufLaden(schluessel: string): Verlauf {
  return verlaufAus(lesen<unknown>(verlaufSchluessel(schluessel), null));
}

/** Sichert Entwurf und Verlauf eines Formulars bzw. einer Projektkarte; liefert den Zeitpunkt oder null */
function sichern(o: OffenesFormular): number | null {
  return sichernUnter(ENTWUERFE, dokSchluessel(o), o.aenderungen, o.verlauf);
}

function sichernUnter(ablage: string, k: string, aenderungen: Record<string, unknown>, verlauf: Verlauf): number | null {
  const alle = lesen<Record<string, unknown>>(ablage, {});
  if (Object.keys(aenderungen).length) alle[k] = aenderungen;
  else delete alle[k];
  const jetzt = Date.now();
  const verzeichnis = lesen<Record<string, number>>(VERLAEUFE, {});
  let ok = schreiben(ablage, alle);
  if (verlauf.schritte.length || verlauf.frueher?.length) {
    ok = schreiben(verlaufSchluessel(k), verlauf) && ok;
    verzeichnis[k] = jetzt;
  } else {
    delete verzeichnis[k];
    try {
      localStorage.removeItem(verlaufSchluessel(k));
    } catch {
      // ohne Speicher nichts zu löschen
    }
  }
  // nur die zuletzt bearbeiteten Formulare behalten ihren Verlauf
  const reihe = Object.entries(verzeichnis).sort((a, b) => b[1] - a[1]);
  for (const [alt] of reihe.slice(MAX_VERLAEUFE)) {
    try {
      localStorage.removeItem(verlaufSchluessel(alt));
    } catch {
      // ohne Speicher nichts zu löschen
    }
  }
  return schreiben(VERLAEUFE, Object.fromEntries(reihe.slice(0, MAX_VERLAEUFE))) && ok ? jetzt : null;
}

/**
 * Umbenanntes Formular: ungespeicherte Eingaben und Verlauf ziehen unter den neuen Pfad um (Schlüssel root|pfad).
 * Der alte Eintrag fällt erst weg, wenn der neue geschrieben ist – bei vollem Speicher bleibt er stehen (und die
 * Funktion liefert false); verloren geht so nichts.
 */
export function formularLokalVerschieben(projekt: Projekt, von: string, nach: string): boolean {
  const alt = dokSchluessel({ projekt, pfad: von });
  const neu = dokSchluessel({ projekt, pfad: nach });
  if (alt === neu) return true;
  let ok = true;
  const alle = entwuerfe();
  if (alt in alle) {
    const mit = { ...alle, [neu]: alle[alt] };
    const ohne = { ...mit };
    delete ohne[alt];
    // in einem Schritt umschreiben; klappt das nicht, bleibt die bisherige Fassung (mit dem alten Schlüssel)
    if (!schreiben(ENTWUERFE, ohne)) ok = false;
  }
  const verlauf = lesen<unknown>(verlaufSchluessel(alt), null);
  if (verlauf !== null) {
    if (schreiben(verlaufSchluessel(neu), verlauf)) {
      try {
        localStorage.removeItem(verlaufSchluessel(alt));
      } catch {
        // ohne Speicher nichts zu löschen
      }
      const verzeichnis = lesen<Record<string, number>>(VERLAEUFE, {});
      if (alt in verzeichnis) {
        verzeichnis[neu] = verzeichnis[alt];
        delete verzeichnis[alt];
        schreiben(VERLAEUFE, verzeichnis);
      }
    } else ok = false;
  }
  if (!ok) log.warn(`Entwurf bzw. Verlauf von ${von} nicht vollständig nach ${nach} umgezogen (Speicher voll?)`);
  return ok;
}

/* ---------- Formular ---------- */

export const istGeaendert = (o: OffenesFormular | null) => !!o && Object.keys(o.aenderungen).length > 0;

export const wertVon = (o: OffenesFormular, f: Feld): Wert => (f.schluessel in o.aenderungen ? o.aenderungen[f.schluessel] : f.original);

/**
 * Anbindung des Autofill-Zustands (liegt im Abschnitt „formulare“ der Projektdatei, den antragStore verwaltet –
 * so entsteht kein Kreis zwischen den Stores): antragStore trägt hier Lesen und Schreiben ein.
 */
export const autofillAnbindung: {
  zustand: (datei: string) => FormularZustand | undefined;
  speichern: (datei: string, z: FormularZustand) => void;
  /** nach dem Speichern der Projektkarte (vorher/nachher) – fragt, ob die Unterlagen aktualisiert werden sollen */
  karteGespeichert?: (alt: Projektkarte, neu: Projektkarte) => void;
} = { zustand: () => undefined, speichern: () => undefined };

/**
 * Nach einer Eingabe von Hand (ein Feld): merkmalAbgleich.ts trägt hier ein, dass beim Ankreuzen einer Gebäudeklasse
 * angeboten wird, sie als Antragsmerkmal zu übernehmen (U-05) – ohne Kreis zwischen den Modulen.
 */
export const eingabeAnbindung: { nachEingabe?: (o: OffenesFormular, feld: Feld, wert: Wert) => void } = {};

/**
 * Sperre durch einen eingereichten Antrag (antragStore.ts trägt sie ein): Formulare des Projekts lassen sich dann nur
 * ansehen – keine Eingaben, kein Speichern, kein „Daten aktualisieren“. Liefert den Grund, sonst null.
 */
export const sperrAnbindung: { antrag: (projekt: Projekt | null) => string | null } = { antrag: () => null };

/**
 * Aktiver Antrag für die Unterordner eines Sammelprojekts (antragStore.ts trägt ihn ein – sobald seine Angaben für das
 * Projekt geladen sind; vorher undefined: dann nur der Stammordner)
 */
export const unterordnerAnbindung: { wahl: (projekt: Projekt) => UnterordnerWahl | undefined } = { wahl: () => undefined };

/**
 * Ordner, in dem neue Formulare des Projekts entstehen: im Sammelprojekt der Unterordner des Antrags `fassung` (der
 * beim Klick angezeigte – auch, wenn inzwischen ein anderer aktiv ist), ohne `fassung` der des aktiven; gibt es keinen,
 * die oberste Ebene
 */
export function formularOrdner(s: Pick<FormulareState, 'sammel'>, projekt: Projekt, fassung?: string): string {
  if (!s.sammel) return projekt.ordner;
  const wahl = unterordnerAnbindung.wahl(projekt);
  const unter = fassung && wahl ? s.sammel.alle.find((u) => gleicheFassung(u, fassung, wahl.antragsarten, wahl.arten)) : s.sammel.unterordner;
  return unter ? `${projekt.ordner}/${unter}` : projekt.ordner;
}

/**
 * Entwurf eines Dokuments mitnehmen, wenn es umbenannt wird (`nach`), bzw. entfernen, wenn es gelöscht wird (null) –
 * sonst hielte ein verwaister Entwurf das ● der Titelleiste. Der Hinweis auf eine bearbeitete PDF zieht nicht mit: Ihre
 * Eingaben verfallen mit der Ansicht (vorher fragt `dateiVerlassen`).
 */
export function dateiEntwurfVerschieben(root: string, von: string, nach: string | null) {
  const alt = dateiSchluessel({ root, pfad: von });
  const s = useFormulare.getState();
  if (!(alt in s.dateiEntwuerfe)) return;
  const entwuerfe = { ...s.dateiEntwuerfe };
  const wert = entwuerfe[alt];
  delete entwuerfe[alt];
  if (nach && wert !== PDF_ENTWURF) entwuerfe[dateiSchluessel({ root, pfad: nach })] = wert;
  useFormulare.setState({ dateiEntwuerfe: entwuerfe });
}

/** Lauf des Neulesens der Formularliste – ein früher begonnener, später fertiger setzt seinen Stand nicht mehr */
let formulareLeseNr = 0;

/**
 * Lauf des Öffnens eines Formulars – zwei Klicks kurz nacheinander warten beide in `schliessen` (auch auf ein laufendes
 * Speichern); nur der letzte öffnet, ein überholter bricht ab und löst eine schon gesetzte eigene Sperre wieder
 */
let oeffnenNr = 0;

/** Warum ein offenes Formular nicht bearbeitet werden kann (Datei, eingereichter Antrag) – null, wenn es geht */
export const bearbeitungGesperrt = (o: OffenesFormular) => o.nurLesen ?? (o.projekt ? sperrAnbindung.antrag(o.projekt) : null);

/** Schlüssel eines Formulars im Formularprojekt (Autofill-Zustand): Pfad ab dem Projektordner, siehe formularSchluessel */
export const formularDatei = formularSchluessel;

/** Auto-Werte des offenen Formulars aus der Projektkarte (mit ihren ungespeicherten Änderungen); null, solange sie nicht gelesen ist */
export function autoWerteVon(o: OffenesFormular, karte: OffeneKarte | null) {
  if (!karte || !o.projekt || karte.projekt.ordner !== o.projekt.ordner || karte.projekt.root !== o.projekt.root) return null;
  return autoWerte(o.formular, o.felder, karteMitAenderungen(karte));
}

export const kannZurueck = (o: OffenesFormular | null) => !!o && kannRueckgaengig(o.verlauf);
export const kannVor = (o: OffenesFormular | null) => !!o && kannWiederholen(o.verlauf);

function aufbereiten(bytes: Uint8Array) {
  const formular = parseFormular(bytes);
  const felder = formular.seiten.map((s, i) => felderDerSeite(s, i));
  // Sicherheitsnetz: Was sich nicht unverändert zurückschreiben lässt, wird auch nicht gespeichert
  const nurLesen = gleich(formularBytes(formular), bytes) ? null : 'Die Datei lässt sich nicht verlustfrei zurückschreiben – Speichern ist gesperrt.';
  return { formular, felder, nurLesen };
}

/** Behält nur Änderungen an Feldern, die es gibt und die vom Wert in der Datei abweichen */
function bereinige(aenderungen: Record<string, Wert>, felder: Feld[][]): Record<string, Wert> {
  const out: Record<string, Wert> = {};
  for (const f of felder.flat()) {
    if (!(f.schluessel in aenderungen)) continue;
    const w = aenderungen[f.schluessel];
    if (typeof w === typeof f.original && w !== f.original) out[f.schluessel] = w;
  }
  return out;
}

/** Werte eintragen: gleich dem Wert in der Datei → keine Änderung mehr */
function mitWerten(o: OffenesFormular, werte: Map<string, unknown>): Record<string, Wert> {
  const aenderungen = { ...o.aenderungen };
  const felder = new Map(o.felder.flat().map((f) => [f.schluessel, f]));
  for (const [k, w] of werte) {
    const f = felder.get(k);
    if (!f || typeof w !== typeof f.original) continue;
    if (w === f.original) delete aenderungen[k];
    else aenderungen[k] = w as Wert;
  }
  return aenderungen;
}

/** Neue Dateifassung: frisch eingelesen, Änderungen eingetragen und gegengeprüft */
export function mitAenderungen(bytes: Uint8Array, aenderungen: Record<string, Wert>): Uint8Array {
  const f = parseFormular(bytes);
  const eintraege = Object.entries(aenderungen).map(([k, w]) => {
    const i = k.indexOf(':');
    return { seite: Number(k.slice(0, i)), name: k.slice(i + 1), w };
  });
  for (const { seite, name, w } of eintraege) {
    if (typeof w === 'boolean') setzeAngekreuzt(f, seite, name, w);
    else setzeMemoText(f, seite, name, w);
  }
  const neu = formularBytes(f);
  const probe = parseFormular(neu);
  for (const { seite, name, w } of eintraege) {
    const o = finde(probe.seiten[seite].form, name)!;
    const gelesen = typeof w === 'boolean' ? istAngekreuzt(o) : memoText(o);
    const erwartet = typeof w === 'boolean' ? w : memoText(finde(f.seiten[seite].form, name)!);
    if (gelesen !== erwartet) throw new Error(`Gegenprobe fehlgeschlagen bei ${name} (Seite ${seite + 1})`);
  }
  return neu;
}

/** Eine Sperrdatei des Projekts mit Bewertung (Übersicht „Sperren“) */
export interface SperrEintrag {
  /** Pfad der Sperrdatei relativ zum Projektordner */
  pfad: string;
  /** Name des Formulars (ohne Endung) */
  name: string;
  /** es gibt kein Formular dazu (Sperrdatei ohne Formular) */
  waise: boolean;
  sperre: Sperre;
  daten: Uint8Array;
  /** von dieser App in diesem Lauf (das offene Formular) */
  eigen: boolean;
  bewertung: SperrBewertung;
}

/** Fremde Sperre bewerten: offen gehalten? Prozess auf diesem Rechner? Alter? */
async function sperreBewerten(ds: Dateisystem, sperre: Sperre, probe: SperrProbe): Promise<SperrBewertung> {
  const r = await ds.rechner();
  const pid = /^\d+$/.test(sperre.inGebrauch.trim()) ? Number(sperre.inGebrauch) : null;
  const hier = sperre.computer.trim().toLowerCase() === r.computer.trim().toLowerCase();
  const prozess = hier && pid !== null && !probe.offen ? await ds.prozess(pid).catch(() => undefined) : undefined;
  return bewerten(sperre, probe, r.computer, prozess);
}

/**
 * Formular sperren. Liegt schon eine Sperre da: Ist es eine eigene aus einem früheren Lauf (gleicher Inhalt wie
 * vermerkt) und hält sie kein Programm offen, ist sie verwaist und wird ersetzt. Sonst ist das Formular anderswo
 * geöffnet (oder die Sperre verwaist) – bewertet, aber nicht angefasst.
 */
async function sperren(ds: Dateisystem, root: string, pfad: string): Promise<{ zustand: SperrZustand; aufgeraeumt: boolean }> {
  const sp = sperrPfad(pfad);
  let aufgeraeumt = false;
  const probe = await ds.sperrePruefen(root, sp);
  if (probe && !probe.offen && istEigeneSperre(root, sp, probe.inhalt)) {
    aufgeraeumt = await ds.sperreLoesen(root, sp, probe.inhalt);
    sperreVergessen(root, sp);
    if (aufgeraeumt) log.info(`Verwaiste eigene Sperre entfernt: ${sp}`);
  } else if (probe) {
    const sperre = sperreLesen(probe.inhalt);
    return { zustand: { art: 'fremd', sperre, daten: probe.inhalt, bewertung: await sperreBewerten(ds, sperre, probe) }, aufgeraeumt };
  }
  const r = await ds.rechner();
  const daten = sperreSchreiben({ benutzer: r.benutzer, computer: r.computer, angemeldet: zeitstempel(new Date()), inGebrauch: String(r.prozess) });
  if (await ds.sperreSetzen(root, sp, daten)) {
    sperreVermerken(root, sp, daten);
    return { zustand: { art: 'eigen', daten }, aufgeraeumt };
  }
  // in diesem Augenblick hat jemand anderes gesperrt
  const jetzt = await ds.sperrePruefen(root, sp);
  const sperre = jetzt ? sperreLesen(jetzt.inhalt) : { benutzer: '', computer: '', angemeldet: '', inGebrauch: '' };
  const bewertung = jetzt ? await sperreBewerten(ds, sperre, jetzt) : { art: 'unklar' as const, grund: 'Die Sperre ließ sich nicht lesen.', aufhebbar: false, seit: null };
  return { zustand: { art: 'fremd', sperre, daten: jetzt?.inhalt ?? new Uint8Array(), bewertung }, aufgeraeumt };
}

/* ---------- Projektkarte ---------- */

/** Aktueller Wert eines Eintrags (mit ungespeicherter Änderung); null, wenn es ihn nicht gibt */
export function karteWert(k: OffeneKarte, gruppe: number, id: number): PkWert {
  const s = pkSchluessel(gruppe, id);
  if (s in k.aenderungen) return k.aenderungen[s];
  const e = pkEintrag(k.karte, gruppe, id);
  return e ? pkWertVon(e) : null;
}

/** Angezeigter Text eines Eintrags (mit ungespeicherter Änderung) */
export function karteText(k: OffeneKarte, gruppe: number, id: number): string {
  const e = pkEintrag(k.karte, gruppe, id);
  return e ? pkAnzeige(e, karteWert(k, gruppe, id)) : '';
}

/** Projektkarte mit den eingetragenen Änderungen – Grundlage fürs Ausfüllen */
export function karteMitAenderungen(k: OffeneKarte): Projektkarte {
  return {
    gruppen: k.karte.gruppen,
    eintraege: k.karte.eintraege.map((e) => {
      const s = pkSchluessel(e.gruppe, e.id);
      if (!(s in k.aenderungen)) return e;
      const w = k.aenderungen[s];
      return istWahl(e) ? { ...e, zahl: pkZahlAus(e, typeof w === 'number' ? w : null) } : { ...e, text: typeof w === 'string' ? w : '' };
    }),
  };
}

export const karteGeaendert = (k: OffeneKarte | null) => !!k && Object.keys(k.aenderungen).length > 0;

/** Änderungen eintragen: gleich dem gespeicherten Wert → keine Änderung mehr; Unpassendes wird übergangen */
function karteMitWerten(k: OffeneKarte, werte: Map<string, unknown>): Record<string, PkWert> {
  const aenderungen = { ...k.aenderungen };
  for (const [s, w] of werte) {
    const [g, i] = s.split(':').map(Number);
    const e = pkEintrag(k.karte, g, i);
    if (!e || !pkWertPasst(e, w)) continue;
    if (w === pkWertVon(e)) delete aenderungen[s];
    else aenderungen[s] = w;
  }
  return aenderungen;
}

/** Änderungen für die Hülle: Texte mit CR LF wie bei FORMA, Auswahl als Ganzzahl der Datei (pkZahlAus) */
function kartenAenderungen(k: OffeneKarte): PkAenderung[] {
  return Object.entries(k.aenderungen).flatMap(([s, w]): PkAenderung[] => {
    const [gruppe, id] = s.split(':').map(Number);
    const e = pkEintrag(k.karte, gruppe, id);
    if (!e) return [];
    if (istWahl(e)) {
      // „keine Wahl“: was vorher stand (leer oder −1) bleibt so, wenn es schon nichts war
      const neu = typeof w === 'number' ? pkZahlAus(e, w) : e.zahl === null ? null : -1;
      return neu === e.zahl ? [] : [{ gruppe, id, typ: e.typ, spalte: 'ganzzahl', alt: e.zahl, neu }];
    }
    return [{ gruppe, id, typ: e.typ, spalte: 'texte', alt: e.text, ...(e.textRoh ? { altRoh: e.textRoh } : {}), neu: (typeof w === 'string' ? w : '').replace(/\n/g, '\r\n') }];
  });
}

const fehlertext = (e: unknown) => (e instanceof Error ? e.message : String(e));

class KeinFormular extends Error {
  constructor(readonly ursache: unknown) {
    super(fehlertext(ursache));
  }
}

/** Meldung, wenn eine Datei kein lesbares FORMA-Formular ist (die technische Einzelheit steht im Protokoll) */
export const KEIN_FORMULAR = 'Das ist keine Formulardatei (.frmsjf). Bitte ein Formular aus einem Formularprojekt wählen.';

/* ---------- Bearbeitete PDF ---------- */

/**
 * Entwurf einer PDF in `dateiEntwuerfe`: Die Eingaben selbst hält pdf.js in der Ansicht (sie lassen sich nicht in den
 * Store heben); der Eintrag zeigt nur an, dass es ungespeicherte gibt – für das ● der Titelleiste, die Rückfrage beim
 * Beenden und beim Verlassen der PDF.
 */
export const PDF_ENTWURF = Object.freeze({ pdf: true });

/** Speichern der gerade gezeigten PDF (trägt die Ansicht ein, solange sie da ist); liefert, ob gespeichert wurde */
export const pdfAnbindung: { speichern?: () => Promise<boolean> } = {};

/** Schlüssel eines Dokuments in `dateiEntwuerfe` */
export const dateiSchluessel = (d: Pick<OffeneDatei, 'root' | 'pfad'>) => `${d.root}|${d.pfad}`;

/** Ist die gezeigte Datei eine PDF mit ungespeicherten Bearbeitungen? */
export const pdfGeaendert = (s: Pick<FormulareState, 'datei' | 'dateiEntwuerfe'>) => s.datei?.art === 'pdf' && !!s.dateiEntwuerfe[dateiSchluessel(s.datei)];

/** Ungespeicherte Bearbeitungen in irgendeinem Dokument (PDF, Excel, Word) – sie gelten nur für diese Sitzung */
export const dokumenteGeaendert = (s: Pick<FormulareState, 'dateiEntwuerfe'>) => Object.keys(s.dateiEntwuerfe).length > 0;

/**
 * Vor dem Verlassen einer bearbeiteten PDF (andere Ansicht, anderes Dokument, Formular, Projekt): „Speichern / Nicht
 * speichern / Abbrechen“. Liefert, ob es weitergehen darf; ohne ungespeicherte PDF sofort true.
 */
export async function dateiVerlassen(): Promise<boolean> {
  const s = useFormulare.getState();
  if (!s.datei || !pdfGeaendert(s)) return true;
  const d = s.datei;
  const weiter = await aenderungenSpeichern(d.name, () => pdfAnbindung.speichern?.() ?? false, 'Die Eingaben in dieser PDF sind noch nicht gespeichert und gingen sonst verloren.');
  // „Nicht speichern“: die Eingaben verfallen mit der Ansicht – der Hinweis darauf auch
  if (weiter) useFormulare.getState().setDateiEntwurf(null, d);
  return weiter;
}

export const useFormulare = create<FormulareState>()((set, get) => {
  const fehler = (text: string, e?: unknown) => {
    const t = e === undefined ? text : `${text}: ${fehlertext(e)}`;
    log.error(t);
    set({ meldung: { art: 'fehler', text: t } });
  };
  /** Datei ließ sich nicht als Formular lesen: Alltagssprache in der Meldung, Technik ins Protokoll */
  const nichtLesbar = (name: string, e: unknown) => {
    log.error(`${name} lässt sich nicht öffnen: ${fehlertext(e)}`);
    set({ meldung: { art: 'fehler', text: `„${name}“ ließ sich nicht öffnen. ${e instanceof KeinFormular ? KEIN_FORMULAR : fehlertext(e)} Das geöffnete Formular bleibt unverändert.` } });
  };
  /** liest das Formular zur Probe; ein Lesefehler heißt: keine FORMA-Formulardatei */
  const pruefen = (bytes: Uint8Array) => {
    try {
      aufbereiten(bytes);
    } catch (e) {
      throw new KeinFormular(e);
    }
  };

  const oeffnen = async (projekt: Projekt | null, pfad: string, name: string, bytes: Uint8Array, sperre: SperrZustand) => {
    const { formular, felder, nurLesen } = aufbereiten(bytes);
    const offen: OffenesFormular = { projekt, pfad, name, bytes, formular, felder, aenderungen: {}, verlauf: leererVerlauf(), gesichert: null, sperre, nurLesen };
    const k = dokSchluessel(offen);
    const entwurf = entwuerfe()[k];
    if (entwurf) offen.aenderungen = bereinige(entwurf, felder);
    // der Verlauf muss zum Inhalt der Datei passen (B-08) – sonst gehören die Schritte zu einer anderen Fassung
    const geladen = verlaufLaden(k);
    const nach = new Map(felder.flat().map((f) => [f.schluessel, f]));
    offen.verlauf = abgleichen(geladen, (s) => (nach.has(s) ? wertVon(offen, nach.get(s)!) : undefined));
    if (offen.verlauf !== geladen) offen.gesichert = sichern(offen);
    const wiederhergestellt = Object.keys(offen.aenderungen).length;
    set({
      offen,
      haupt: 'formular',
      konflikt: false,
      meldung: wiederhergestellt ? { art: 'info', text: `${anzahl(wiederhergestellt, 'nicht gespeicherte Eingabe', 'nicht gespeicherte Eingaben')} vom letzten Mal wiederhergestellt.` } : null,
    });
  };

  /** Neuer Stand des offenen Formulars: übernehmen und lokal sichern */
  const aktualisieren = (o: OffenesFormular) => {
    const neu = { ...o };
    neu.gesichert = sichern(neu);
    if (neu.gesichert === null) sicherungFehlgeschlagen();
    set({ offen: neu });
    return neu;
  };

  /** Laufendes Speichern des Formulars bzw. der Projektkarte – ein weiteres wartet darauf, Schließen ebenso */
  let laufendFormular: Promise<void> | null = null;
  let laufendKarte: Promise<void> | null = null;

  /** Lokale Sicherung gescheitert (Speicher voll o. Ä.): einmal je Sitzung melden, statt still weiterzumachen */
  let sicherungGemeldet = false;
  const sicherungFehlgeschlagen = () => {
    if (sicherungGemeldet) return;
    sicherungGemeldet = true;
    fehler('Die Eingaben lassen sich gerade nicht lokal sichern (Speicher voll?). Bitte bald speichern – bei einem Absturz gingen sie sonst verloren.');
  };

  /**
   * Nach dem Schreiben einer Formulardatei: Die Datei trägt jetzt `gespeichert`. Was während des Schreibens eingegeben
   * wurde, bleibt als Änderung gegenüber der neuen Fassung stehen (auch ein Zurücksetzen auf den alten Dateiwert); der
   * Verlauf von jetzt bleibt. Ist inzwischen ein anderes Formular offen, wird nur dessen gemerkter Entwurf bereinigt –
   * das gespeicherte darf nicht wieder als offen (mit längst gelöster Sperre) erscheinen.
   */
  const nachDemSchreiben = (o: OffenesFormular, gespeichert: Record<string, Wert>, datei: Pick<OffenesFormular, 'bytes' | 'formular' | 'felder' | 'nurLesen'>) => {
    const k = dokSchluessel(o);
    const jetzt = get().offen;
    if (!jetzt || dokSchluessel(jetzt) !== k) {
      const entwurf = entwuerfe()[k];
      if (entwurf) sichernUnter(ENTWUERFE, k, bereinige(entwurf, datei.felder), verlaufLaden(k));
      return;
    }
    const bisher = new Map(jetzt.felder.flat().map((f) => [f.schluessel, f]));
    const stand: Record<string, Wert> = {};
    for (const s of new Set([...Object.keys(gespeichert), ...Object.keys(jetzt.aenderungen)])) {
      const f = bisher.get(s);
      if (f) stand[s] = wertVon(jetzt, f);
    }
    aktualisieren({ ...jetzt, ...datei, aenderungen: bereinige(stand, datei.felder) });
  };

  /**
   * Angaben in die Projektdatei (.oap) schreiben: frisch einlesen, nur die übergebenen Angaben in `meta` ändern
   * (gemeinsamer Zugriff aus packages/core: atomar, mit Sicherungskopie, nur wenn seitdem niemand die Datei
   * geändert hat). Fehlt die Datei, öffnet sich der Stammdaten-Dialog, der sie anlegt. Liefert eine Meldung oder null.
   */
  const inProjektdatei = async (projekt: Projekt, werte: Map<Angabe, string>): Promise<string | null> => {
    const ds = get().ds;
    const ablage = ablageVon(get(), projekt);
    if (!ds || !ablage || !werte.size || get().projekt !== projekt) return null;
    const o = get().oap;
    if (o === 'fehlt') {
      void get().stammdatenErfassen('Die Projektdaten sind gespeichert. Für die Projektstammdaten fehlt im Projektordner noch die Projektdatei (.oap) – mit diesen Angaben wird sie angelegt.');
      return null;
    }
    if (!o) return null;
    let geaendertAnzahl = 0;
    // Koordinaten zur geänderten Adresse des Vorhabens vorab abfragen (das Schreiben selbst liest frisch und ist synchron)
    const lage = (await mitKoordinaten(metaMit(o.inhalt.meta, werte))).meta.koordinaten;
    const geschrieben = await get().oapAendern((roh) => {
      const bisher = parseProjectData(roh).meta;
      // nur, was sich unterscheidet – steht schon alles so darin, bleibt die Datei unberührt
      const vorher = angabenAus(bisher);
      const geaendert = new Map([...werte].filter(([a, w]) => (vorher.get(a) ?? '').trim() !== w.trim()));
      geaendertAnzahl = geaendert.size;
      if (!geaendert.size) return roh;
      const meta = metaMit(bisher, geaendert);
      if (lage && lage.adresse === adresseSchluessel(meta.adresse)) meta.koordinaten = lage;
      else if (koordinatenVeraltet(meta)) delete meta.koordinaten;
      return { ...roh, meta };
    });
    if (!geschrieben) return null;
    log.info(`Projektdatei ${o.pfad}: ${anzahl(geaendertAnzahl, 'Angabe', 'Angaben')}`);
    return `Projektdatei mitgeführt (${anzahl(geaendertAnzahl, 'Angabe', 'Angaben')})`;
  };

  /** Vorbelegung der Stammdaten aus der Projektkarte (alle Angaben mit Gegenstück) */
  const metaAusKarte = (projekt: Projekt, k: OffeneKarte | null): ProjectMeta => {
    const werte = new Map<Angabe, string>();
    if (k)
      for (const { angabe } of OAP_ANGABEN) {
        const ziel = IN_PROJEKTKARTE[angabe];
        if (ziel && pkEintrag(k.karte, ziel.gruppe, ziel.id)) {
          const t = karteText(k, ziel.gruppe, ziel.id).trim();
          if (t) werte.set(angabe, t);
        }
      }
    const meta = metaMit({ ...leereMeta(), projektcode: projekt.ordner }, werte);
    return projekt.titel ? { ...meta, kurzname: projekt.titel } : meta;
  };
  /** nach dem Anlegen der Projektdatei weitermachen (z. B. den Antragsumfang speichern) */
  let nachAnlegen: (() => Promise<void>) | null = null;
  let beiAbbruch: ((art: DialogArt) => void) | null = null;
  /** Laufende Nummer des letzten `oapLaden` und sein Ende – ein älteres Ergebnis gilt nicht mehr */
  let oapLadeNr = 0;
  let oapLadung: Promise<void> = Promise.resolve();

  /** Projektordner zugeordnet: Projektdatei suchen; fehlt sie, die Stammdaten erfassen (die wartende Aktion bleibt) */
  const nachZuordnen = async (projekt: Projekt) => {
    await get().oapLaden();
    if (get().projekt !== projekt) return;
    const weiter = nachAnlegen;
    // der Abbruch-Rückruf gilt weiter (Projektordner zugeordnet, dann den Stammdaten-Dialog abgebrochen)
    if (get().oap === 'fehlt') await get().stammdatenErfassen('Im Projektordner gibt es noch keine Projektdatei (.oap). Mit diesen Stammdaten wird sie angelegt.', weiter ?? undefined, beiAbbruch ?? undefined);
    else {
      nachAnlegen = null;
      if (weiter) await weiter();
    }
  };

  /** Neuer Stand der Projektkarte: übernehmen und lokal sichern (Entwurf und Verlauf) */
  const karteAktualisieren = (k: OffeneKarte) => {
    const neu = { ...k, gesichert: sichernUnter(PK_ENTWUERFE, karteSchluessel(k.projekt), k.aenderungen, k.verlauf) };
    if (neu.gesichert === null) sicherungFehlgeschlagen();
    set({ karte: neu });
  };

  /** Formular in die Datei schreiben (nur über `speichern`, das parallele Läufe nacheinander abarbeitet) */
  const formularSpeichern = async (): Promise<void> => {
    const { ds, konflikt } = get();
    let o = get().offen;
    if (!o || !istGeaendert(o)) return;
    if (bearbeitungGesperrt(o)) return fehler(bearbeitungGesperrt(o)!);
    if (o.sperre.art === 'fremd') return fehler(`${o.name} ist bei ${o.sperre.sperre.benutzer || 'jemand anderem'} geöffnet – Speichern nicht möglich`);
    if (konflikt) return fehler('Die Datei wurde inzwischen geändert – bitte erst neu laden');
    try {
      // Autofill: geleerte Felder bekommen den Auto-Wert (erzwungen leer ist ein Leerzeichen)
      const datei = formularDatei(o.pfad);
      const zustand = o.projekt ? autofillAnbindung.zustand(datei) : undefined;
      const auto = autoWerteVon(o, get().karte);
      const bezug = (k: string) => ({ aktuell: auto?.get(k)?.wert, zuletzt: zustand?.felder[k]?.auto });
      const zugeordnet = autofillFelder(o.formular, o.felder);
      const alt = o.aenderungen;
      const aenderungen = { ...alt };
      for (const [k, w] of Object.entries(aenderungen)) {
        const b = bezug(k);
        if (w === '' && zugeordnet.has(k) && (b.aktuell || b.zuletzt)) aenderungen[k] = (b.aktuell || b.zuletzt)!;
      }
      if (Object.keys(aenderungen).some((k) => aenderungen[k] !== alt[k])) o = aktualisieren({ ...o, aenderungen });
      // Stand, der jetzt geschrieben wird – Eingaben während des Schreibens kommen danach wieder obenauf
      const gespeichert = o.aenderungen;
      const neu = mitAenderungen(o.bytes, gespeichert);
      if (o.projekt && ds) {
        const aktuell = await ds.lies(o.projekt.root, o.pfad);
        if (!aktuell || !gleich(aktuell, o.bytes)) {
          set({ konflikt: true, meldung: { art: 'fehler', text: 'Die Datei wurde seit dem Öffnen außerhalb geändert (z. B. in einem anderen Programm). Bitte neu laden – deine Eingaben bleiben erhalten.' } });
          return;
        }
        await ds.ersetze(o.projekt.root, o.pfad, neu);
      } else {
        const ok = await saveBinaryFile({ defaultName: `${o.name}.frmsjf`, data: neu, filterName: 'Formular', extension: 'frmsjf', mime: 'application/octet-stream' });
        if (!ok) return;
      }
      const { formular, felder, nurLesen } = aufbereiten(neu);
      const geaendert = Object.keys(gespeichert).filter((k) => zugeordnet.has(k));
      nachDemSchreiben(o, gespeichert, { bytes: neu, formular, felder, nurLesen });
      // im Browser entsteht eine neue Datei (Download) – die geöffnete bleibt, wie sie war
      set({ meldung: { art: 'info', text: o.projekt && ds ? `${o.name} gespeichert.` : `${o.name} heruntergeladen als „${o.name}.frmsjf“ – bitte die neue Datei weiterverwenden.` } });
      if (o.projekt && geaendert.length) {
        const z = zustandBeimSpeichern(zustand, geaendert, (k) => (typeof gespeichert[k] === 'string' ? (gespeichert[k] as string) : undefined), bezug);
        if (JSON.stringify(z) !== JSON.stringify(zustand ?? { felder: {} })) autofillAnbindung.speichern(datei, z);
      }
      log.info(`Gespeichert: ${o.pfad} (${Object.keys(gespeichert).length} Feld(er))`);
    } catch (e) {
      fehler(`${o.name} nicht gespeichert`, e);
    }
  };

  /** Projektkarte schreiben (nur über `karteSpeichern`, das parallele Läufe nacheinander abarbeitet) */
  const karteSchreiben = async (): Promise<void> => {
    const { ds, karte: k } = get();
    if (!ds || !k || !karteGeaendert(k)) return;
    const pfad = `${k.projekt.ordner}/sj_prokarte.sdb`;
    try {
      // Ergänzungen der App (zusatz.ts) nie in die Projektkarte von FORMA – sie merkt sich die App selbst
      const alle = kartenAenderungen(k);
      const aenderungen = alle.filter((a) => !istZusatz(a.gruppe, a.id));
      const zusatz = Object.fromEntries(alle.filter((a) => istZusatz(a.gruppe, a.id)).map((a) => [pkSchluessel(a.gruppe, a.id), String(a.neu ?? '')]));
      if (Object.keys(zusatz).length) zusatzMerken(k.projekt, zusatz);
      if (aenderungen.length) await ds.projektkarteSchreiben(k.projekt.root, pfad, aenderungen);
      const gelesen = await ds.projektkarteLesen(k.projekt.root, pfad);
      if (!gelesen) throw new Error('Projektdaten nach dem Speichern nicht lesbar');
      const frisch = mitZusatz(gelesen, zusatzWerte(k.projekt, get().oap));
      // Eingaben während des Schreibens bleiben als Änderung gegenüber der neuen Fassung stehen (wie beim Formular);
      // ist inzwischen ein anderes Projekt gewählt, gehört die angezeigte Karte nicht mehr zu diesem Speichern
      const jetzt = get().karte;
      if (jetzt && karteSchluessel(jetzt.projekt) === karteSchluessel(k.projekt)) {
        const stand = new Map<string, unknown>();
        for (const s of new Set([...Object.keys(k.aenderungen), ...Object.keys(jetzt.aenderungen)])) {
          const [g, i] = s.split(':').map(Number);
          stand.set(s, karteWert(jetzt, g, i));
        }
        const neu: OffeneKarte = { ...jetzt, karte: frisch, aenderungen: {} };
        karteAktualisieren({ ...neu, aenderungen: karteMitWerten(neu, stand) });
      } else {
        const gemerkt = lesen<Record<string, Record<string, unknown>>>(PK_ENTWUERFE, {})[karteSchluessel(k.projekt)];
        if (gemerkt) {
          const neu: OffeneKarte = { ...k, karte: frisch, aenderungen: {} };
          sichernUnter(PK_ENTWUERFE, karteSchluessel(k.projekt), karteMitWerten(neu, new Map(Object.entries(gemerkt))), verlaufLaden(karteSchluessel(k.projekt)));
        }
      }
      set({ meldung: { art: 'info', text: `Projektdaten von ${k.projekt.ordner} gespeichert.` } });
      if (alle.length) autofillAnbindung.karteGespeichert?.(k.karte, frisch);
      // die Projektdatei (.oap) im Projektordner gleich mitführen: geänderte Angaben mit Gegenstück
      const geaendert = new Set(alle.map((a) => pkSchluessel(a.gruppe, a.id)));
      const werte = new Map<Angabe, string>();
      for (const { angabe } of OAP_ANGABEN) {
        const z = IN_PROJEKTKARTE[angabe];
        if (z && geaendert.has(pkSchluessel(z.gruppe, z.id))) werte.set(angabe, pkWert(frisch, z.gruppe, z.id));
      }
      try {
        const text = await inProjektdatei(k.projekt, werte);
        if (text) set({ meldung: { art: 'info', text: `Projektdaten gespeichert – ${text}.` } });
      } catch (e) {
        fehler('Projektdaten gespeichert, aber nicht in die Projektdatei übernommen', e);
      }
      log.info(`Projektkarte gespeichert: ${pfad} (${aenderungen.length} Einträge${Object.keys(zusatz).length ? `, ${Object.keys(zusatz).length} Ergänzung(en) der App` : ''})`);
    } catch (e) {
      fehler('Projektdaten nicht gespeichert', e);
    }
  };

  return {
    ...ladeEinstellungen(),
    ds: hatDateisystem() ? tauriDateisystem : null,
    projekte: [],
    suchfehler: [],
    sucht: false,
    projekt: null,
    formulare: [],
    sammel: null,
    offen: null,
    haupt: 'formular',
    zuletzt: zuletztLaden(),
    karte: null,
    datei: null,
    dateiEntwuerfe: {},
    profile: profileAus(lesen<unknown>(PROFILE, {})),
    adressbuchKarten: lesen<{ adressen: Adresse[]; stand: number } | null>(ADRESSBUCH, null),
    adressbuch: wirksamesAdressbuch(lesen<{ adressen: Adresse[]; stand: number } | null>(ADRESSBUCH, null), []),
    eigeneAdressen: [],
    namensschemaBuero: null,
    adressbuchLaeuft: null,
    projektdaten: null,
    oap: null,
    stammdatenDialog: null,
    ordnerDialog: null,
    ordnerWahl: {},
    ordnerStand: 0,
    einstellungsBereich: 'ordner',
    einstellungenOffen: false,
    ablage: [],
    ablageFehler: [],
    konflikt: false,
    meldung: null,

    setAnsicht: (ansicht) => set({ ansicht }),
    setHaupt: (haupt) => {
      // nie auf eine Ansicht, die es nicht gibt: ohne Projekt keine Projektkarte (sonst verschwände das Formular, B-03)
      if ((haupt === 'projektkarte' || haupt === 'antrag') && !get().projekt) return;
      const wechseln = () => {
        set({ haupt });
        if (haupt === 'projektkarte' && !get().karte) void get().karteLaden();
      };
      // eine bearbeitete PDF ginge beim Verlassen verloren: erst fragen (sonst sofort wechseln)
      if (haupt !== 'datei' && pdfGeaendert(get())) void dateiVerlassen().then((weiter) => weiter && wechseln());
      else wechseln();
    },
    setZoom: (zoom) => set({ zoom }),
    setLeisteBreite: (b) => set({ leisteBreite: Math.min(600, Math.max(220, Math.round(b))) }),
    setVerlaufOffen: (verlaufOffen) => set({ verlaufOffen }),
    setGliederungOffen: (gliederungOffen) => set({ gliederungOffen }),
    setMeldung: (meldung) => set({ meldung }),

    ordnerHinzufuegen: async (pfad) => {
      if (get().projektordner.includes(pfad)) return;
      set({ projektordner: [...get().projektordner, pfad] });
      await get().projekteLaden();
    },

    ordnerEntfernen: async (pfad) => {
      set({ projektordner: get().projektordner.filter((p) => p !== pfad) });
      if (get().projekt?.root === pfad) await get().projektWaehlen(null);
      await get().projekteLaden();
    },

    ablageHinzufuegen: async (pfad) => {
      if (get().ablageordner.includes(pfad)) return;
      set({ ablageordner: [...get().ablageordner, pfad] });
      void allgemeinAendern({ projekte: get().ablageordner }).catch((e) => log.warn(`Gemeinsame Einstellungen nicht geschrieben: ${fehlertext(e)}`));
      await get().ablageLaden();
    },

    ablageEntfernen: async (pfad) => {
      set({ ablageordner: get().ablageordner.filter((p) => p !== pfad) });
      void allgemeinAendern({ projekte: get().ablageordner }).catch((e) => log.warn(`Gemeinsame Einstellungen nicht geschrieben: ${fehlertext(e)}`));
      await get().ablageLaden();
    },

    setVorgabeAuswahl: (liste) => set({ vorgabeAuswahl: auswahlBereinigt(liste) }),

    setAuswahl: (kuerzel, liste) => {
      const auswahl = { ...get().auswahl };
      if (liste) auswahl[kuerzel] = auswahlBereinigt(liste);
      else delete auswahl[kuerzel];
      set({ auswahl });
    },

    projekteLaden: async () => {
      const ds = get().ds;
      if (!ds) return;
      // Sperren, die nach einem Absturz liegen geblieben sind, zuerst wegräumen
      const verwaist = await verwaisteEigeneSperrenAufraeumen(ds);
      if (verwaist.length) {
        const namen = verwaist.map((v) => v.split('/').pop()!.replace(/\.frmtmp$/i, '')).join(', ');
        log.info(`Verwaiste eigene Sperren entfernt: ${verwaist.join(', ')}`);
        set({ meldung: { art: 'info', text: `Nach einem Absturz liegen gebliebene ${verwaist.length === 1 ? 'Sperre' : 'Sperren'} entfernt: ${namen}.` } });
      }
      set({ sucht: true });
      try {
        const { projekte, fehler: suchfehler } = await projekteSuchen(ds, get().projektordner);
        set({ projekte, suchfehler });
      } finally {
        set({ sucht: false });
      }
      await get().ablageLaden();
    },

    einstellungenNeuLesen: async () => {
      const ordner = (x: Pick<Gespeichert, 'projektordner' | 'ablageordner'>) => [...x.projektordner, '|', ...x.ablageordner].join('\n');
      const vorher = ordner(get());
      const neu = ladeEinstellungen();
      set({ ...neu, profile: profileAus(lesen<unknown>(PROFILE, {})) });
      if (ordner(neu) !== vorher) await get().projekteLaden();
    },

    ablageLaden: async () => {
      const ds = get().ds;
      if (!ds) return;
      const { ordner, fehler: ablageFehler } = await ablageSuchen(ds, get().ablageordner);
      set({ ablage: ordner, ablageFehler });
    },

    projektWaehlen: async (projekt) => {
      if (!(await dateiVerlassen())) return;
      await get().schliessen();
      nachAnlegen = null;
      beiAbbruch = null;
      set({ projekt, formulare: [], sammel: null, karte: null, datei: null, projektdaten: null, oap: null, stammdatenDialog: null, ordnerDialog: null, haupt: 'formular' });
      const ds = get().ds;
      if (!projekt || !ds) return;
      const gleich = (z: Pick<Projekt, 'root' | 'ordner'>) => z.root === projekt.root && z.ordner === projekt.ordner;
      const zuletzt = [{ root: projekt.root, ordner: projekt.ordner, zeit: Date.now() }, ...get().zuletzt.filter((z) => !gleich(z))].slice(0, MAX_ZULETZT);
      schreiben(ZULETZT, zuletzt);
      set({ zuletzt });
      await get().formulareNeuLesen();
      void get().oapLaden();
      void get().projektdatenLaden();
    },

    zuletztEntfernen: (p) => {
      const zuletzt = get().zuletzt.filter((z) => z.root !== p.root || z.ordner !== p.ordner);
      schreiben(ZULETZT, zuletzt);
      set({ zuletzt });
    },

    formulareNeuLesen: async (o = {}) => {
      const { ds, projekt } = get();
      if (!ds || !projekt) return false;
      const nr = ++formulareLeseNr;
      try {
        const r = await formulareMitUnterordner(ds, projekt, unterordnerAnbindung.wahl(projekt));
        // inzwischen ein anderes Projekt bzw. ein neueres Lesen (etwa nach einem Wechsel des Antrags): dessen Stand gilt;
        // unverändert: nichts setzen (kein Neuberechnen)
        if (get().projekt !== projekt || nr !== formulareLeseNr) return false;
        const sammel = r.antragsUnterordner.length ? { unterordner: r.unterordner, alle: r.antragsUnterordner } : null;
        const s = get();
        if (JSON.stringify(s.sammel) !== JSON.stringify(sammel)) set({ sammel });
        if (JSON.stringify(s.formulare) === JSON.stringify(r.formulare)) return false;
        set({ formulare: r.formulare });
        return true;
      } catch (e) {
        if (nr !== formulareLeseNr) return false;
        if (o.still) throw e;
        if (get().projekt === projekt) fehler(`Formulare von ${projekt.ordner} nicht lesbar`, e);
        return false;
      }
    },

    formularOeffnen: async (eintrag) => {
      const { ds, projekt } = get();
      if (!ds || !projekt) return;
      if (!(await dateiVerlassen())) return;
      const nr = ++oeffnenNr;
      const ueberholt = () => nr !== oeffnenNr;
      // erst lesen und prüfen – ein fehlgeschlagenes Öffnen lässt das geöffnete Formular unverändert
      let bytes: Uint8Array;
      try {
        const b = await ds.lies(projekt.root, eintrag.pfad);
        if (!b) throw new Error('Die Datei wurde nicht gefunden.');
        pruefen(b);
        bytes = b;
      } catch (e) {
        if (!ueberholt()) nichtLesbar(eintrag.name, e);
        return;
      }
      if (ueberholt()) return;
      await get().schliessen();
      // überholt oder inzwischen ein anderes Projekt gewählt: nichts mehr öffnen
      if (ueberholt() || get().projekt !== projekt) return;
      let gesperrt: SperrZustand | null = null;
      const sperreLoesen = async () => {
        if (gesperrt?.art !== 'eigen') return;
        const sp = sperrPfad(eintrag.pfad);
        await ds.sperreLoesen(projekt.root, sp, gesperrt.daten).catch(() => false);
        sperreVergessen(projekt.root, sp);
      };
      try {
        const { zustand: sperre, aufgeraeumt } = await sperren(ds, projekt.root, eintrag.pfad);
        gesperrt = sperre;
        // Zwischen Lesen und Sperren könnte FORMA gespeichert haben: mit Sperre noch einmal lesen
        const frisch = sperre.art === 'eigen' ? ((await ds.lies(projekt.root, eintrag.pfad)) ?? bytes) : bytes;
        // inzwischen ein anderes Formular angeklickt: das gilt – die eigene Sperre dieses Laufs wieder lösen
        // (auf dem Netzlaufwerk kann das dauern: das andere hat die Liste womöglich schon gelesen, als die Sperre noch
        // lag – dann stünde hier weiter das Schloss „anderswo geöffnet“; also danach die Liste neu lesen)
        if (ueberholt()) {
          // nur eine eigene Sperre fällt – nach einer fremden ist nichts neu zu lesen
          const eigene = gesperrt?.art === 'eigen';
          await sperreLoesen();
          if (eigene && get().projekt === projekt) await get().formulareNeuLesen();
          return;
        }
        await oeffnen(projekt, eintrag.pfad, eintrag.name, frisch, sperre);
        gesperrt = null;
        const offen = get().offen;
        if (offen && !get().karte && autofillFelder(offen.formular, offen.felder).size) void get().karteLaden();
        if (aufgeraeumt && !get().meldung) set({ meldung: { art: 'info', text: 'Eine verwaiste Sperre dieser App (nach einem Absturz) wurde entfernt.' } });
        log.info(`Geöffnet: ${eintrag.pfad}${sperre.art === 'fremd' ? ` (nur ansehen: ${sperre.bewertung.art})` : ''}`);
        await get().formulareNeuLesen();
      } catch (e) {
        // gesperrt, aber nicht geöffnet (z. B. das frisch gelesene ist nicht lesbar): die eigene Sperre gleich wieder
        // lösen – sonst bliebe das Formular für FORMA bis zum Beenden der App gesperrt
        await sperreLoesen();
        if (!ueberholt()) fehler(`${eintrag.name} lässt sich nicht öffnen`, e);
      }
    },

    dateiOeffnen: async () => {
      const datei = await pickFile('.frmsjf');
      if (!datei) return;
      // erst lesen und prüfen, dann das bisherige Formular schließen – bei einem Fehler bleibt es offen
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await datei.arrayBuffer());
        pruefen(bytes);
      } catch (e) {
        nichtLesbar(datei.name, e);
        return;
      }
      await get().schliessen();
      try {
        await oeffnen(null, datei.name, datei.name.replace(/\.frmsjf$/i, ''), bytes, { art: 'ohne' });
      } catch (e) {
        nichtLesbar(datei.name, e);
      }
    },

    schliessen: async () => {
      // erst fertig schreiben lassen: die Sperre darf nicht fallen, solange die Datei noch ersetzt wird
      while (laufendFormular) await laufendFormular;
      const { offen, ds } = get();
      if (!offen) return;
      set({ offen: null, konflikt: false });
      if (offen.sperre.art === 'eigen' && offen.projekt && ds) {
        const sp = sperrPfad(offen.pfad);
        try {
          await ds.sperreLoesen(offen.projekt.root, sp, offen.sperre.daten);
          sperreVergessen(offen.projekt.root, sp);
        } catch (e) {
          // der Vermerk bleibt: beim nächsten Start wird die Sperre aufgeräumt
          fehler(`Sperrdatei von ${offen.name} nicht entfernt`, e);
        }
      }
    },

    sperreNeuPruefen: async () => {
      const { offen: o, ds, formulare } = get();
      if (!o?.projekt || !ds || o.sperre.art !== 'fremd') return;
      const eintrag = formulare.find((f) => f.pfad === o.pfad) ?? { pfad: o.pfad, name: o.name, gesperrt: true };
      const probe = await ds.sperrePruefen(o.projekt.root, sperrPfad(o.pfad));
      if (!probe || (!probe.offen && istEigeneSperre(o.projekt.root, sperrPfad(o.pfad), probe.inhalt))) {
        // Sperre ist weg (Formular dort geschlossen) oder eine verwaiste eigene: jetzt selbst sperren und bearbeiten
        await get().formularOeffnen(eintrag);
        return;
      }
      const sperre = sperreLesen(probe.inhalt);
      const bewertung = await sperreBewerten(ds, sperre, probe);
      const aktuell = get().offen;
      if (aktuell?.pfad === o.pfad) set({ offen: { ...aktuell, sperre: { art: 'fremd', sperre, daten: probe.inhalt, bewertung } } });
    },

    sperreAufheben: async () => {
      const { offen: o, formulare } = get();
      if (!o?.projekt || o.sperre.art !== 'fremd') return;
      const eintrag = formulare.find((f) => f.pfad === o.pfad) ?? { pfad: o.pfad, name: o.name, gesperrt: true };
      if (await get().sperrdateiAufheben(sperrPfad(o.pfad), o.sperre.daten)) {
        await get().formularOeffnen(eintrag);
        if (get().offen?.sperre.art === 'eigen') set({ meldung: { art: 'info', text: `Sperre von ${o.sperre.sperre.benutzer || 'unbekannt'} aufgehoben – ${o.name} ist jetzt hier zum Bearbeiten geöffnet.` } });
      } else {
        await get().sperreNeuPruefen();
      }
    },

    sperrenAuflisten: async () => {
      const { ds, projekt, sammel } = get();
      if (!ds || !projekt) return [];
      const out: SperrEintrag[] = [];
      // Stammordner und – im Sammelprojekt – der Unterordner des aktiven Antrags
      for (const ordner of [projekt.ordner, ...(sammel?.unterordner ? [`${projekt.ordner}/${sammel.unterordner}`] : [])]) {
        const eintraege = await ds.liste(verbinde(projekt.root, ordner), 1);
        const formulare = new Set(eintraege.filter((e) => !e.ordner && /\.frmsjf$/i.test(e.pfad)).map((e) => e.pfad.toLowerCase()));
        for (const e of eintraege.filter((x) => !x.ordner && /\.frmtmp$/i.test(x.pfad))) {
          const pfad = `${ordner}/${e.pfad}`;
          const probe = await ds.sperrePruefen(projekt.root, pfad);
          if (!probe) continue;
          const sperre = sperreLesen(probe.inhalt);
          const name = e.pfad.replace(/\.frmtmp$/i, '');
          out.push({
            pfad,
            name,
            waise: !formulare.has(`${name}.frmsjf`.toLowerCase()),
            sperre,
            daten: probe.inhalt,
            eigen: probe.eigen,
            bewertung: probe.eigen ? { art: 'benutzt', grund: 'Hier in dieser App geöffnet – wird beim Schließen des Formulars aufgehoben.', aufhebbar: false, seit: null } : await sperreBewerten(ds, sperre, probe),
          });
        }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
    },

    sperrdateiAufheben: async (pfad, daten) => {
      const { ds, projekt } = get();
      if (!ds || !projekt) return false;
      try {
        const ok = await ds.sperreLoesen(projekt.root, pfad, daten);
        if (ok) {
          sperreVergessen(projekt.root, pfad);
          log.warn(`Sperre von Hand aufgehoben: ${pfad} (${sperreLesen(daten).benutzer}@${sperreLesen(daten).computer})`);
          await get().formulareNeuLesen();
        } else {
          set({ meldung: { art: 'fehler', text: 'Die Sperre hat sich inzwischen geändert (das Formular wurde dort neu geöffnet) – sie wurde nicht aufgehoben.' } });
        }
        return ok;
      } catch (e) {
        fehler('Sperre nicht aufgehoben', e);
        return false;
      }
    },

    wertSetzen: (feld, wert) => {
      const o = get().offen;
      if (!o || bearbeitungGesperrt(o)) return;
      const vorher = wertVon(o, feld);
      if (vorher === wert) return;
      const verlauf = eintragen(o.verlauf, feld.schluessel, vorher, wert, Date.now());
      const neu = aktualisieren({ ...o, verlauf, aenderungen: mitWerten(o, new Map([[feld.schluessel, wert]])) });
      eingabeAnbindung.nachEingabe?.(neu, feld, wert);
    },

    feldVerlassen: (feld) => {
      const o = get().offen;
      if (!o || feld.art !== 'text' || wertVon(o, feld) !== '') return;
      const auto = autoWerteVon(o, get().karte)?.get(feld.schluessel)?.wert ?? autofillAnbindung.zustand(formularDatei(o.pfad))?.felder[feld.schluessel]?.auto;
      if (auto) get().wertSetzen(feld, auto);
    },

    formularAendern: async (pfad, werte) => {
      const { ds, projekt } = get();
      if (!ds || !projekt) return 'gesperrt';
      if (sperrAnbindung.antrag(projekt)) return 'eingereicht';
      const k = dokSchluessel({ projekt, pfad });
      const alle = entwuerfe();
      if (alle[k] && Object.keys(alle[k]).length) {
        alle[k] = { ...alle[k], ...werte };
        schreiben(ENTWUERFE, alle);
        return 'entwurf';
      }
      const { zustand } = await sperren(ds, projekt.root, pfad);
      if (zustand.art === 'fremd') return 'gesperrt';
      const sp = sperrPfad(pfad);
      try {
        const bytes = await ds.lies(projekt.root, pfad);
        if (!bytes) throw new Error(`${pfad} nicht gefunden`);
        if (aufbereiten(bytes).nurLesen) return 'nurLesen';
        await ds.ersetze(projekt.root, pfad, mitAenderungen(bytes, werte));
        log.info(`Aktualisiert: ${pfad} (${Object.keys(werte).length} Feld(er))`);
        return 'gespeichert';
      } finally {
        if (zustand.art === 'eigen') {
          await ds.sperreLoesen(projekt.root, sp, zustand.daten).catch(() => false);
          sperreVergessen(projekt.root, sp);
        }
      }
    },

    werteSetzen: (werte, titel) => {
      const o = get().offen;
      if (!o || bearbeitungGesperrt(o)) return;
      const aenderungen: FeldAenderung[] = werte.map(({ feld, wert }) => ({ feld: feld.schluessel, vorher: wertVon(o, feld), nachher: wert }));
      const verlauf = eintragenMehrere(o.verlauf, aenderungen, titel, Date.now());
      if (verlauf === o.verlauf) return;
      aktualisieren({ ...o, verlauf, aenderungen: mitWerten(o, new Map(werte.map(({ feld, wert }) => [feld.schluessel, wert]))) });
    },

    rueckgaengig: () => {
      const o = get().offen;
      if (!o || !kannRueckgaengig(o.verlauf)) return null;
      const schritt = o.verlauf.schritte[o.verlauf.position - 1];
      get().zuVerlaufsstand(o.verlauf.position - 1);
      return schritt.aenderungen[0]?.feld ?? null;
    },

    wiederholen: () => {
      const o = get().offen;
      if (!o || !kannWiederholen(o.verlauf)) return null;
      const schritt = o.verlauf.schritte[o.verlauf.position];
      get().zuVerlaufsstand(o.verlauf.position + 1);
      return schritt.aenderungen[0]?.feld ?? null;
    },

    zuVerlaufsstand: (position) => {
      const o = get().offen;
      if (!o) return;
      const { verlauf, werte } = springe(o.verlauf, position);
      aktualisieren({ ...o, verlauf, aenderungen: mitWerten(o, werte) });
    },

    speichern: async () => {
      // läuft schon ein Speichern (Strg+S doppelt, Speichern beim Beenden): abwarten, dann den Rest speichern – was
      // während des Schreibens eingegeben wurde; parallel verglichen beide mit demselben alten Stand
      while (laufendFormular) await laufendFormular;
      const lauf = formularSpeichern();
      laufendFormular = lauf;
      try {
        await lauf;
      } finally {
        if (laufendFormular === lauf) laufendFormular = null;
      }
    },

    neuLaden: async () => {
      const { offen: o, ds } = get();
      if (!o?.projekt || !ds) return;
      try {
        const bytes = await ds.lies(o.projekt.root, o.pfad);
        if (!bytes) throw new Error('Datei nicht gefunden');
        const { formular, felder, nurLesen } = aufbereiten(bytes);
        // inzwischen ein anderes Formular offen: nichts übernehmen; sonst die Eingaben von jetzt (nicht die vor dem Lesen)
        const jetzt = get().offen;
        if (!jetzt || dokSchluessel(jetzt) !== dokSchluessel(o)) return;
        aktualisieren({ ...jetzt, bytes, formular, felder, nurLesen, aenderungen: bereinige(jetzt.aenderungen, felder) });
        set({ konflikt: false, meldung: { art: 'info', text: 'Neu geladen – deine Eingaben sind eingetragen, aber noch nicht gespeichert.' } });
      } catch (e) {
        fehler(`${o.name} nicht neu geladen`, e);
      }
    },

    karteLaden: async () => {
      const { ds, projekt } = get();
      if (!ds || !projekt) return;
      try {
        const karte = await ds.projektkarteLesen(projekt.root, `${projekt.ordner}/sj_prokarte.sdb`);
        if (get().projekt !== projekt) return;
        if (!karte) {
          set({ karte: null, meldung: { art: 'info', text: `${projekt.ordner} hat keine Projektdaten (keine Projektkarte im Formularprojekt).` } });
          return;
        }
        const k = karteSchluessel(projekt);
        const geladen = verlaufLaden(k);
        const offen: OffeneKarte = { projekt, karte: mitZusatz(karte, zusatzWerte(projekt, get().oap)), aenderungen: {}, verlauf: geladen, gesichert: null };
        // nur Entwürfe übernehmen, die zum Eintrag passen und noch vom gespeicherten Wert abweichen
        const entwurf = lesen<Record<string, Record<string, unknown>>>(PK_ENTWUERFE, {})[k] ?? {};
        offen.aenderungen = karteMitWerten(offen, new Map(Object.entries(entwurf)));
        // der Verlauf muss zum Inhalt der Karte passen (wie beim Formular, B-08): Hat sie jemand anderes geändert, kommen
        // die alten Schritte unter „frühere Sitzung“ – sonst schriebe Strg+Z alte Werte über die fremde Änderung
        offen.verlauf = abgleichen(geladen, (s) => {
          const [g, i] = s.split(':').map(Number);
          return pkEintrag(offen.karte, g, i) ? karteWert(offen, g, i) : undefined;
        });
        if (offen.verlauf !== geladen) offen.gesichert = sichernUnter(PK_ENTWUERFE, k, offen.aenderungen, offen.verlauf);
        set({ karte: offen });
      } catch (e) {
        fehler(`Projektdaten von ${projekt.ordner} nicht lesbar`, e);
      }
    },

    karteSetzen: (gruppe, id, wert) => {
      const k = get().karte;
      if (!k) return;
      const s = pkSchluessel(gruppe, id);
      const vorher = karteWert(k, gruppe, id);
      if (vorher === wert) return;
      // verknüpfte Einträge (eigene Ansicht der Projektkarte) bekommen denselben Inhalt – beim Tippen ein Schritt im Verlauf
      if (verknuepfteWerte(k, gruppe, id, wert).length) {
        const e = pkEintrag(k.karte, gruppe, id);
        get().karteMehrere([{ gruppe, id, wert }], `${e ? pkTitel(e.titel).replace(/:$/, '') : s} (verknüpft)`, { zusammenfassen: true });
        return;
      }
      const verlauf = eintragen(k.verlauf, s, vorher, wert, Date.now());
      karteAktualisieren({ ...k, verlauf, aenderungen: karteMitWerten(k, new Map([[s, wert]])) });
    },

    karteMehrere: (werte, titel, o = {}) => {
      const k = get().karte;
      if (!k) return;
      const { zusammenfassen = false, ohneVerknuepfungen = false } = o;
      // verknüpfte Einträge mitfüllen (sofern nicht ausdrücklich mitgegeben)
      const schon = new Set(werte.map((w) => pkSchluessel(w.gruppe, w.id)));
      const alle = [...werte];
      if (!ohneVerknuepfungen)
        for (const w of werte)
          for (const v of verknuepfteWerte(k, w.gruppe, w.id, w.wert)) {
            const sv = pkSchluessel(v.gruppe, v.id);
            if (!schon.has(sv)) {
              schon.add(sv);
              alle.push(v);
            }
          }
      const liste = alle.filter((w) => {
        const e = pkEintrag(k.karte, w.gruppe, w.id);
        return !!e && pkWertPasst(e, w.wert);
      });
      const aenderungen: FeldAenderung[] = liste.map((w) => ({ feld: pkSchluessel(w.gruppe, w.id), vorher: karteWert(k, w.gruppe, w.id), nachher: w.wert }));
      const verlauf = eintragenMehrere(k.verlauf, aenderungen, titel, Date.now(), zusammenfassen);
      if (verlauf === k.verlauf) return;
      karteAktualisieren({ ...k, verlauf, aenderungen: karteMitWerten(k, new Map(aenderungen.map((a) => [a.feld, a.nachher]))) });
    },

    karteRueckgaengig: () => {
      const k = get().karte;
      if (!k || !kannRueckgaengig(k.verlauf)) return null;
      const schritt = k.verlauf.schritte[k.verlauf.position - 1];
      const { verlauf, werte } = springe(k.verlauf, k.verlauf.position - 1);
      karteAktualisieren({ ...k, verlauf, aenderungen: karteMitWerten(k, werte) });
      return schritt.aenderungen[0]?.feld ?? null;
    },

    karteWiederholen: () => {
      const k = get().karte;
      if (!k || !kannWiederholen(k.verlauf)) return null;
      const schritt = k.verlauf.schritte[k.verlauf.position];
      const { verlauf, werte } = springe(k.verlauf, k.verlauf.position + 1);
      karteAktualisieren({ ...k, verlauf, aenderungen: karteMitWerten(k, werte) });
      return schritt.aenderungen[0]?.feld ?? null;
    },

    karteVerwerfen: () => {
      const k = get().karte;
      if (!k || !karteGeaendert(k)) return;
      const zurueck = Object.keys(k.aenderungen).map((s) => {
        const [gruppe, id] = s.split(':').map(Number);
        return { gruppe, id, wert: pkWertVon(pkEintrag(k.karte, gruppe, id)!) };
      });
      // nur die geänderten Einträge zurück – nicht über Verknüpfungen auf andere übertragen
      get().karteMehrere(zurueck, 'Änderungen verworfen', { ohneVerknuepfungen: true });
      set({ meldung: { art: 'info', text: 'Ungespeicherte Änderungen der Projektdaten verworfen – Strg+Z holt sie zurück.' } });
    },

    dateiAnsehen: async (root, pfad) => {
      const ds = get().ds;
      const name = pfad.split('/').pop()!;
      const art = dateiArtVon(name);
      if (!ds || !art) return;
      // auch dasselbe Dokument: neu Einlesen baut die Ansicht neu auf, die Bearbeitungen einer PDF wären weg
      if (!(await dateiVerlassen())) return;
      try {
        const bytes = await ds.lies(root, pfad);
        if (!bytes) throw new Error('Datei nicht gefunden');
        const inOffice = art === 'excel' || art === 'word' ? await ds.inOffice(root, pfad).catch(() => false) : false;
        set({ datei: { root, pfad, name, art, bytes, inOffice, stand: (get().datei?.stand ?? 0) + 1 }, haupt: 'datei' });
      } catch (e) {
        fehler(`${name} lässt sich nicht öffnen`, e);
      }
    },

    dateiNeuLaden: async () => {
      const d = get().datei;
      if (d) await get().dateiAnsehen(d.root, d.pfad);
    },

    dateiSpeichern: async (neu) => {
      const { ds, datei: d } = get();
      if (!ds || !d) return false;
      const k = dateiSchluessel(d);
      // der Entwurf, aus dem `neu` entstand – nur er ist danach gespeichert
      const entwurfVorher = get().dateiEntwuerfe[k];
      try {
        const aktuell = await ds.lies(d.root, d.pfad);
        if (!aktuell || !gleich(aktuell, d.bytes)) {
          // Excel/Word: der Entwurf liegt im Store und übersteht das Neuladen; die Eingaben einer PDF hält nur die Ansicht
          const rat = d.art === 'pdf' ? 'Achtung: „Neu laden“ verwirft die Eingaben in dieser PDF.' : 'Bitte neu laden – deine Bearbeitungen bleiben erhalten.';
          set({ meldung: { art: 'fehler', text: `${d.name} wurde seit dem Öffnen außerhalb geändert und ist nicht gespeichert. ${rat}` } });
          return false;
        }
        await ds.dokumentErsetzen(d.root, d.pfad, neu);
        // während des Schreibens weiter bearbeitet: dieser Entwurf bleibt; ein anderes Dokument geöffnet: es bleibt offen
        const entwuerfe = { ...get().dateiEntwuerfe };
        if (entwuerfe[k] === entwurfVorher) delete entwuerfe[k];
        const jetzt = get().datei;
        const gleichesDokument = !!jetzt && jetzt.root === d.root && jetzt.pfad === d.pfad;
        set({
          ...(gleichesDokument ? { datei: { ...jetzt, bytes: neu, stand: jetzt.stand + 1 } } : {}),
          dateiEntwuerfe: entwuerfe,
          meldung: { art: 'info', text: `${d.name} gespeichert (die vorige Fassung liegt als Sicherung im App-Ordner).` },
        });
        log.info(`Dokument gespeichert: ${d.pfad}`);
        return true;
      } catch (e) {
        fehler(`${d.name} nicht gespeichert`, e);
        return false;
      }
    },

    einstellungenOeffnen: (bereich) => set({ einstellungenOffen: true, ...(bereich ? { einstellungsBereich: bereich } : {}) }),
    einstellungenSchliessen: () => set({ einstellungenOffen: false }),

    kartenFavoritUmschalten: (gruppe) => {
      const f = get().kartenFavoriten;
      // ein Favorit ist nie zugleich ausgeblendet
      set({ kartenFavoriten: f.includes(gruppe) ? f.filter((x) => x !== gruppe) : [...f, gruppe], kartenAusgeblendet: get().kartenAusgeblendet.filter((x) => x !== gruppe) });
    },

    ordnerReihenfolgeSetzen: (ebene, namen) => {
      const r = { ...get().ordnerReihenfolge };
      if (namen.length) r[ebene.toLowerCase()] = namen.map((n) => n.toLowerCase());
      else delete r[ebene.toLowerCase()];
      set({ ordnerReihenfolge: r });
    },

    kartenEintraegeUmschalten: (schluessel) => {
      const a = get().kartenEintraegeAusgeblendet;
      const aus = schluessel.every((k) => a.includes(k));
      set({ kartenEintraegeAusgeblendet: aus ? a.filter((k) => !schluessel.includes(k)) : [...new Set([...a, ...schluessel])] });
    },

    kartenAusblendenUmschalten: (gruppe) => {
      const a = get().kartenAusgeblendet;
      set({ kartenAusgeblendet: a.includes(gruppe) ? a.filter((x) => x !== gruppe) : [...a, gruppe], kartenFavoriten: get().kartenFavoriten.filter((x) => x !== gruppe) });
    },

    setRollenVorgabe: (gruppe, schluessel) => {
      const rollenVorgaben = { ...get().rollenVorgaben };
      if (schluessel) rollenVorgaben[String(gruppe)] = schluessel;
      else delete rollenVorgaben[String(gruppe)];
      set({ rollenVorgaben });
    },

    setOapVorlage: (pfad) => {
      const oapVorlage = pfad.trim() || VORGABE_OAP_PFAD;
      set({ oapVorlage });
      void allgemeinAendern({ oapPfad: oapVorlage }).catch((e) => log.warn(`Gemeinsame Einstellungen nicht geschrieben: ${fehlertext(e)}`));
    },
    oapWaehlen: async (pfad) => {
      const p = get().projekt;
      if (!p) return;
      const oapWahl = { ...get().oapWahl };
      if (pfad) oapWahl[p.ordner] = pfad;
      else delete oapWahl[p.ordner];
      set({ oapWahl });
      await get().oapLaden();
    },
    oapLaden: async () => {
      const { ds, projekt } = get();
      const ablage = ablageVon(get(), projekt);
      if (!ds || !projekt || !ablage) return;
      const root = verbinde(ablage.root, ablage.pfad);
      // Reihenfolge: ein späteres Laden gilt – kommt dieses danach zurück, setzt es nicht seinen älteren Stand, sondern
      // wartet, bis das spätere fertig ist (so liest der Aufrufer danach den neuesten)
      const nr = ++oapLadeNr;
      let fertig!: () => void;
      const lauf = new Promise<void>((r) => (fertig = r));
      oapLadung = lauf;
      try {
        const g = await projektdateiLaden(ds.projektordner, root, { gewaehlt: get().oapWahl[projekt.ordner] });
        if (get().projekt !== projekt) return;
        if (nr !== oapLadeNr) return void (await oapLadung);
        if (!g) {
          set({ oap: 'fehlt' });
          return;
        }
        set({ oap: { root, pfad: g.pfad, stand: g.stand, projekt: g.projekt, inhalt: { name: g.projekt.name, meta: g.projekt.meta }, kandidaten: g.kandidaten } });
        // wieder lesbar: die eigene Fehlermeldung von vorhin gilt nicht mehr
        const m = get().meldung;
        if (m?.art === 'fehler' && m.text.startsWith(`Projektdatei von ${projekt.ordner} nicht lesbar`)) set({ meldung: null });
        // Ergänzungen der Projektkarte, die noch leer sind (z. B. PLZ des Grundstücks), aus der Projektdatei
        const k = get().karte;
        if (k && k.projekt === projekt) {
          const werte = zusatzWerte(projekt, get().oap);
          const eintraege = k.karte.eintraege.map((e) => (istZusatz(e.gruppe, e.id) && !e.text.trim() && werte[pkSchluessel(e.gruppe, e.id)] ? { ...e, text: werte[pkSchluessel(e.gruppe, e.id)] } : e));
          if (eintraege.some((e, i) => e !== k.karte.eintraege[i])) set({ karte: { ...k, karte: { ...k.karte, eintraege } } });
        }
      } catch (e) {
        // inzwischen ein anderes Projekt: nichts melden, nicht auf dessen Laden warten
        if (get().projekt !== projekt) return;
        if (nr !== oapLadeNr) return void (await oapLadung);
        log.warn(`Projektdatei von ${projekt.ordner} nicht lesbar: ${fehlertext(e)}`);
        set({ oap: 'fehlt', meldung: { art: 'fehler', text: `Projektdatei von ${projekt.ordner} nicht lesbar: ${fehlertext(e)}` } });
      } finally {
        fertig();
      }
    },
    oapAendern: async (aendern) => {
      const { ds } = get();
      const o = get().oap;
      if (!ds || !o || o === 'fehlt') return false;
      // liest frisch und versucht es erneut, wenn eine andere App die Datei zwischen Lesen und Schreiben geändert hat
      const geschrieben = await projektdateiSchreiben(ds.projektordner, o.root, o.pfad, aendern);
      if (geschrieben) await get().oapLaden();
      return geschrieben;
    },
    stammdatenErfassen: async (grund, danach, abgebrochen) => {
      const projekt = get().projekt;
      if (!projekt) return;
      if (!get().karte) await get().karteLaden();
      if (get().projekt !== projekt) return;
      nachAnlegen = danach ?? null;
      beiAbbruch = abgebrochen ?? null;
      set({ stammdatenDialog: { grund, meta: metaAusKarte(projekt, get().karte) } });
    },
    stammdatenAbbrechen: () => {
      const abbruch = nachAnlegen ? beiAbbruch : null;
      nachAnlegen = null;
      beiAbbruch = null;
      set({ stammdatenDialog: null });
      abbruch?.('oap');
    },
    projektdateiAnlegen: async (meta) => {
      const { ds, projekt } = get();
      const ablage = ablageVon(get(), projekt);
      if (!ds || !projekt || !ablage) throw new Error('Kein Projektordner zugeordnet.');
      const root = verbinde(ablage.root, ablage.pfad);
      const pfad = projektdateiPfad(get().oapVorlage, { nummer: meta.projektcode || projekt.ordner, kurzname: meta.kurzname, vorhaben: meta.vorhaben });
      if (!pfad) throw new Error('Kein Ort für neue Projektdateien eingestellt.');
      const p = createProject(meta.kurzname || meta.vorhaben || projekt.titel || projekt.ordner);
      p.meta = meta;
      // wie in ATLAS (Projektordner): jede neue Projektdatei trägt eine Kopie des Namensschemas des Büros
      p.namensschema = wirksamesNamensschema(undefined, get().namensschemaBuero);
      if (!(await projektdateiAnlegen(ds.projektordner, root, pfad, p, APP_NAMEN.formulare.name))) throw new Error(`${pfad}: Dort liegt schon eine Datei – bitte in den Projektdaten auswählen.`);
      log.info(`Projektdatei angelegt: ${pfad}`);
      set({ stammdatenDialog: null, meldung: { art: 'info', text: `Projektdatei angelegt: ${pfad}` } });
      get().ordnerNeuLesen();
      await get().oapLaden();
      const weiter = nachAnlegen;
      nachAnlegen = null;
      beiAbbruch = null;
      if (weiter) await weiter();
    },
    projektordnerZuordnen: (grund, danach, abgebrochen) => {
      if (!get().projekt) return;
      nachAnlegen = danach ?? null;
      beiAbbruch = abgebrochen ?? null;
      set({ ordnerDialog: { grund } });
    },
    ordnerNeuLesen: () => set((s) => ({ ordnerStand: s.ordnerStand + 1 })),
    oapAuffrischen: async () => {
      const { ds, oap: o } = get();
      if (!ds || !get().projekt) return;
      if (!o || o === 'fehlt') return get().oapLaden();
      const ordner = o.pfad.includes('/') ? o.pfad.slice(0, o.pfad.lastIndexOf('/')) : '';
      try {
        const name = o.pfad.slice(ordner ? ordner.length + 1 : 0).toLowerCase();
        const e = (await ds.liste(ordner ? verbinde(o.root, ordner) : o.root, 1)).find((x) => x.pfad.toLowerCase() === name);
        if (!e || e.groesse !== o.stand.groesse || (e.geaendert ?? 0) !== o.stand.geaendert) await get().oapLaden();
      } catch {
        await get().oapLaden();
      }
    },
    ordnerDialogSchliessen: () => {
      const abbruch = nachAnlegen ? beiAbbruch : null;
      nachAnlegen = null;
      beiAbbruch = null;
      set({ ordnerDialog: null });
      abbruch?.('ordner');
    },
    projektordnerWaehlen: async (pfad) => {
      const projekt = get().projekt;
      if (!projekt) return;
      const ordnerWahl = { ...get().ordnerWahl, [projekt.ordner]: pfad };
      set({ ordnerWahl, ordnerDialog: null, oap: null });
      await formulareKonfigAendern({ ordnerWahl });
      log.info(`${projekt.ordner}: Projektordner ${pfad} zugeordnet`);
      await nachZuordnen(projekt);
    },
    projektordnerAnlegen: async (stammordner, name) => {
      const { ds, projekt } = get();
      if (!ds || !projekt) return;
      const sauber = sichererDateiname(name);
      if (!sauber) throw new Error('Bitte einen Namen für den Ordner angeben.');
      if (!(await ds.projektordner.ordnerAnlegen(stammordner, sauber))) throw new Error(`${sauber}: Den Ordner gibt es schon – bitte „Vorhandenen Ordner wählen …“.`);
      log.info(`${projekt.ordner}: Projektordner angelegt: ${verbinde(stammordner, sauber)}`);
      await get().ablageLaden();
      get().ordnerNeuLesen();
      await get().projektordnerWaehlen(verbinde(stammordner, sauber));
    },
    namensschemaNeuLesen: async () => {
      try {
        const roh = ((await konfigLesen('allgemein')) ?? {}) as Record<string, unknown>;
        if (JSON.stringify(roh.namensschema ?? null) !== JSON.stringify(get().namensschemaBuero)) set({ namensschemaBuero: roh.namensschema ?? null });
      } catch {
        // gemeinsame Einstellungen nicht lesbar: der bisherige Stand gilt weiter
      }
    },
    gemeinsamLaden: async () => {
      try {
        const app = ((await konfigLesen('formulare')) ?? {}) as Record<string, unknown>;
        const eigeneAdressen = eigeneAdressenAus(app.adressen);
        set({ eigeneAdressen, adressbuch: wirksamesAdressbuch(get().adressbuchKarten, eigeneAdressen) });
        if (app.ordnerWahl && typeof app.ordnerWahl === 'object') set({ ordnerWahl: Object.fromEntries(Object.entries(app.ordnerWahl as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string')) });
        const roh = ((await konfigLesen('allgemein')) ?? {}) as Record<string, unknown>;
        if (JSON.stringify(roh.namensschema ?? null) !== JSON.stringify(get().namensschemaBuero)) set({ namensschemaBuero: roh.namensschema ?? null });
        const projekte = Array.isArray(roh.projekte) ? roh.projekte.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
        // Stammordner: gemeinsam; gibt es dort noch keine, die bisherigen dieser App übernehmen
        if (projekte.length) {
          if (projekte.join('\n') !== get().ablageordner.join('\n')) {
            set({ ablageordner: projekte });
            await get().ablageLaden();
          }
        } else if (get().ablageordner.length) await allgemeinAendern({ projekte: get().ablageordner });
        // Ort neuer Projektdateien: ebenso
        if (typeof roh.oapPfad === 'string' && roh.oapPfad.trim()) set({ oapVorlage: roh.oapPfad.trim() });
        else if (get().oapVorlage.trim() && get().oapVorlage !== VORGABE_OAP_PFAD) await allgemeinAendern({ oapPfad: get().oapVorlage });
      } catch (e) {
        log.warn(`Gemeinsame Einstellungen nicht lesbar: ${fehlertext(e)}`);
      }
    },
    oapUebernehmen: (angaben) => {
      const o = get().oap;
      if (!o || o === 'fehlt') return;
      const werte = angabenAus(o.inhalt.meta);
      const neu: KartenWert[] = [];
      const k = get().karte;
      for (const a of angaben) {
        const ziel = IN_PROJEKTKARTE[a];
        if (ziel && werte.has(a) && k && pkEintrag(k.karte, ziel.gruppe, ziel.id)) neu.push({ gruppe: ziel.gruppe, id: ziel.id, wert: werte.get(a)! });
      }
      get().karteMehrere(neu, 'Aus der Projektdatei übernommen');
    },
    oapEintragen: async (angaben) => {
      const { karte: k, projekt } = get();
      if (!k || !projekt) return;
      const werte = new Map<Angabe, string>();
      for (const a of angaben) {
        const ziel = IN_PROJEKTKARTE[a];
        if (ziel && pkEintrag(k.karte, ziel.gruppe, ziel.id)) werte.set(a, karteText(k, ziel.gruppe, ziel.id));
      }
      try {
        const text = await inProjektdatei(projekt, werte);
        if (text) set({ meldung: { art: 'info', text } });
      } catch (e) {
        fehler('Nicht in die Projektdatei eingetragen', e);
      }
    },

    adressbuchLaden: async () => {
      const { ds, projekte } = get();
      if (!ds || get().adressbuchLaeuft) return;
      const gesammelt: Adresse[] = [];
      set({ adressbuchLaeuft: { fertig: 0, gesamt: projekte.length } });
      try {
        for (const [i, p] of projekte.entries()) {
          try {
            const pk = await ds.projektkarteLesen(p.root, `${p.ordner}/sj_prokarte.sdb`);
            if (pk) gesammelt.push(...adressenAusKarte(p.ordner, pk));
          } catch {
            // eine unlesbare Projektkarte überspringen
          }
          set({ adressbuchLaeuft: { fertig: i + 1, gesamt: projekte.length } });
        }
        const karten = { adressen: zusammenfuehren(gesammelt), stand: Date.now() };
        schreiben(ADRESSBUCH, karten);
        set({ adressbuchKarten: karten, adressbuch: wirksamesAdressbuch(karten, get().eigeneAdressen) });
        log.info(`Adressbuch: ${karten.adressen.length} Adressen aus ${projekte.length} Projekten`);
      } finally {
        set({ adressbuchLaeuft: null });
      }
    },

    adressbuchErgaenzen: (adressen) => {
      const alt = get().adressbuchKarten?.adressen ?? [];
      const neu = adressen.filter((a) => !alt.some((x) => x.schluessel === a.schluessel));
      if (!neu.length) return;
      const karten = { adressen: zusammenfuehren([...alt, ...neu]), stand: get().adressbuchKarten?.stand ?? Date.now() };
      schreiben(ADRESSBUCH, karten);
      set({ adressbuchKarten: karten, adressbuch: wirksamesAdressbuch(karten, get().eigeneAdressen) });
    },

    eigeneAdresseSpeichern: async (a) => {
      const neu = { ...a, geaendert: Date.now() };
      await eigeneAendern((liste) => [...liste.filter((x) => x.schluessel !== a.schluessel), neu]);
    },
    eigeneAdresseEntfernen: async (schluessel) => {
      await eigeneAendern((liste) => liste.filter((x) => x.schluessel !== schluessel));
    },

    projektdatenLaden: async () => {
      const { ds, projekt } = get();
      const ablage = ablageVon(get(), projekt);
      if (!ds || !projekt || !ablage) return;
      const root = verbinde(ablage.root, ablage.pfad);
      try {
        const eintraege = await ds.liste(verbinde(root, 'Organisation'), 1).catch(() => []);
        const kandidaten = eintraege.filter((e) => !e.ordner && /projektdaten.*\.xlsx$/i.test(e.pfad) && !e.pfad.startsWith('~$'));
        const datei = kandidaten.find((e) => e.pfad.toLowerCase().startsWith(projekt.ordner.toLowerCase())) ?? kandidaten[0];
        if (!datei) {
          if (get().projekt === projekt) set({ projektdaten: 'fehlt' });
          return;
        }
        const pfad = `Organisation/${datei.pfad}`;
        const bytes = await ds.lies(root, pfad);
        if (!bytes) throw new Error('nicht lesbar');
        const inOffice = await ds.inOffice(root, pfad).catch(() => false);
        if (get().projekt === projekt) set({ projektdaten: { root, pfad, bytes, eintraege: projektdatenLesen(xlsxLesen(bytes)), inOffice } });
      } catch (e) {
        log.warn(`Projektdaten.xlsx von ${projekt.ordner} nicht lesbar: ${fehlertext(e)}`);
        if (get().projekt === projekt) set({ projektdaten: 'fehlt' });
      }
    },

    projektdatenUebernehmen: (angaben) => {
      const pd = get().projektdaten;
      if (!pd || pd === 'fehlt') return;
      const werte: KartenWert[] = [];
      for (const a of angaben) {
        const ziel = IN_PROJEKTKARTE[a];
        const e = pd.eintraege.find((x) => x.angabe === a);
        if (ziel && e) werte.push({ gruppe: ziel.gruppe, id: ziel.id, wert: e.wert });
      }
      get().karteMehrere(werte, 'Aus Projektdaten.xlsx übernommen');
    },

    profilSetzen: (schluessel, profil) => {
      const profile = { ...get().profile };
      const e = profil && abweichung(vorgabeFuer(schluessel), profil);
      if (e && !abweichungLeer(e)) profile[schluessel] = e;
      else delete profile[schluessel];
      schreiben(PROFILE, profile);
      set({ profile });
    },
    profilKopieren: (von, nach) => {
      const e = get().profile[von];
      if (!e || von === nach || get().profile[nach]) return;
      const profile = { ...get().profile, [nach]: structuredClone(e) };
      schreiben(PROFILE, profile);
      set({ profile });
    },
    eigenesVerwerfen: (schluessel, eintrag) => {
      const e = get().profile[schluessel];
      if (!e) return;
      const profile = { ...get().profile };
      const n = ohneEigenes(e, eintrag);
      if (abweichungLeer(n)) delete profile[schluessel];
      else profile[schluessel] = n;
      schreiben(PROFILE, profile);
      set({ profile });
    },

    setDateiEntwurf: (wert, fuer) => {
      const d = fuer ?? get().datei;
      if (!d) return;
      const k = dateiSchluessel(d);
      if (wert === null || wert === undefined ? !(k in get().dateiEntwuerfe) : get().dateiEntwuerfe[k] === wert) return;
      const entwuerfe = { ...get().dateiEntwuerfe };
      if (wert === null || wert === undefined) delete entwuerfe[k];
      else entwuerfe[k] = wert;
      set({ dateiEntwuerfe: entwuerfe });
    },

    karteSpeichern: async () => {
      // läuft schon ein Speichern: abwarten, dann den Rest – parallel schickten beide dieselben Änderungen mit veraltetem „alt“
      while (laufendKarte) await laufendKarte;
      const lauf = karteSchreiben();
      laufendKarte = lauf;
      try {
        await lauf;
      } finally {
        if (laufendKarte === lauf) laufendKarte = null;
      }
    },
  };
});

/** von Hand zugeordnete Ordner als AblageOrdner – je Pfad dasselbe Objekt (stabil für Selektoren) */
const gewaehlteOrdner = new Map<string, AblageOrdner>();

/** Echter Projektordner des gewählten FORMA-Projekts (über das Kürzel bzw. von Hand zugeordnet) */
export function ablageVon(s: Pick<FormulareState, 'ablage' | 'ordnerWahl'>, p: Projekt | null): AblageOrdner | null {
  if (!p) return null;
  const gewaehlt = s.ordnerWahl[p.ordner];
  if (gewaehlt) {
    let a = gewaehlteOrdner.get(gewaehlt);
    if (!a) {
      const name = ordnerName(gewaehlt);
      const root = gewaehlt.replace(/[\\/]+$/, '').slice(0, -name.length).replace(/[\\/]+$/, '') || gewaehlt;
      a = { root, pfad: name, name };
      gewaehlteOrdner.set(gewaehlt, a);
    }
    return a;
  }
  return zuordnen(p.ordner, s.ablage);
}

/** App-Bereich im gemeinsamen Konfigurationsordner gezielt ändern (frisch lesen, nur die übergebenen Angaben) */
async function formulareKonfigAendern(patch: Record<string, unknown>) {
  try {
    await konfigAendern('formulare', (roh) => ({ ...((roh ?? {}) as Record<string, unknown>), ...patch }));
  } catch (e) {
    log.warn(`Einstellungen von PERMIO nicht geschrieben: ${fehlertext(e)}`);
  }
}

/** Schlüssel der eigenen Ansicht der Projektkarte (je Benutzer, für alle Projekte) */
export const KARTEN_ANSICHT = 'formulare:ansicht:projektkarte';

const TEXTARTEN = new Set(['text', 'mehrzeilig']);
const WAHLARTEN = new Set(['auswahl', 'optionen']);

/** Lassen sich zwei Einträge der Projektkarte verknüpfen? Text mit Text, Auswahl mit Auswahl, Kästchen mit Kästchen */
export function kartenVerknuepfbar(a: Pick<PkEintragTyp, 'typ' | 'text' | 'titel'> | undefined, b: Pick<PkEintragTyp, 'typ' | 'text' | 'titel'> | undefined): boolean {
  if (!a || !b) return false;
  const [x, y] = [pkArt(a as PkEintragTyp), pkArt(b as PkEintragTyp)];
  return (TEXTARTEN.has(x) && TEXTARTEN.has(y)) || (WAHLARTEN.has(x) && WAHLARTEN.has(y)) || (x === 'kreuz' && y === 'kreuz');
}

/**
 * Werte für die mit einem Eintrag verknüpften Einträge (Verknüpfungen der eigenen Ansicht): Text in Text (einzeilig ohne
 * Zeilenumbrüche); Auswahl und Optionen über den Text der Möglichkeit (fehlt er im Ziel, bleibt es unverändert);
 * Kästchen in Kästchen.
 */
function verknuepfteWerte(k: OffeneKarte, gruppe: number, id: number, wert: PkWert): KartenWert[] {
  const quelle = pkEintrag(k.karte, gruppe, id);
  if (!quelle) return [];
  const qArt = pkArt(quelle);
  return verknuepfteFelder(ansichtLesen(KARTEN_ANSICHT), pkSchluessel(gruppe, id)).flatMap((v) => {
    const [g, i] = v.split(':').map(Number);
    const ziel = pkEintrag(k.karte, g, i);
    if (!ziel) return [];
    const zArt = pkArt(ziel);
    if (TEXTARTEN.has(qArt) && TEXTARTEN.has(zArt)) return [{ gruppe: g, id: i, wert: zArt === 'text' && typeof wert === 'string' ? wert.replace(/\s*\r?\n\s*/g, ' ') : wert }];
    if (WAHLARTEN.has(qArt) && WAHLARTEN.has(zArt)) {
      if (wert === null) return [{ gruppe: g, id: i, wert: null }];
      const text = typeof wert === 'number' ? pkMoeglichkeiten(quelle)[wert] : undefined;
      const n = text ? pkMoeglichkeiten(ziel).indexOf(text) : -1;
      return n >= 0 ? [{ gruppe: g, id: i, wert: n }] : [];
    }
    return qArt === zArt ? [{ gruppe: g, id: i, wert }] : [];
  });
}

/** Angezeigte Pfade im echten Projektordner eines Projekts */
export const auswahlVon = (s: Pick<FormulareState, 'auswahl' | 'vorgabeAuswahl'>, p: Projekt | null) => (p && s.auswahl[p.ordner]) || s.vorgabeAuswahl;

/** zuletzt geschriebene Einstellungen – geschrieben wird nur, wenn sich eine geändert hat (nicht bei jedem Tastendruck) */
let gespeichertZuletzt: Gespeichert | null = null;

useFormulare.subscribe((s) => {
  const z = gespeichertZuletzt;
  if (z && (Object.keys(z) as (keyof Gespeichert)[]).every((k) => z[k] === s[k])) return;
  const g: Gespeichert = {
    projektordner: s.projektordner,
    ablageordner: s.ablageordner,
    ansicht: s.ansicht,
    zoom: s.zoom,
    leisteBreite: s.leisteBreite,
    verlaufOffen: s.verlaufOffen,
    gliederungOffen: s.gliederungOffen,
    rollenVorgaben: s.rollenVorgaben,
    oapVorlage: s.oapVorlage,
    oapWahl: s.oapWahl,
    vorgabeAuswahl: s.vorgabeAuswahl,
    auswahl: s.auswahl,
    kartenFavoriten: s.kartenFavoriten,
    ordnerReihenfolge: s.ordnerReihenfolge,
    kartenAusgeblendet: s.kartenAusgeblendet,
    kartenEintraegeAusgeblendet: s.kartenEintraegeAusgeblendet,
  };
  gespeichertZuletzt = g;
  schreiben(EINSTELLUNGEN, g);
});

/** Wirksames Profil eines Formulars (Vorgabe + eigene Einstellungen) */
export const useProfil = (schluessel: string) => useFormulare((s) => profilFuer(s.profile, schluessel));

// Speicherort der Einstellungen gewechselt (auch in einem anderen Fenster) bzw. Netzlaufwerk weg oder wieder da:
// gemeinsame Einstellungen (Adressbuch, Stammordner, Projektordner-Zuordnung) neu lesen
konfigNeuLesen(() => void useFormulare.getState().gemeinsamLaden());
