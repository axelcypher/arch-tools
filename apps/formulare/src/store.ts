import { create } from 'zustand';
import { pickFile, saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import type { AblageOrdner } from './ablage';
import { VORGABE_AUSWAHL, ablageSuchen, auswahlBereinigt, zuordnen } from './ablage';
import type { Dateisystem, PkAenderung } from './dateisystem';
import { hatDateisystem, tauriDateisystem, verbinde } from './dateisystem';
import type { Feld } from './forma/felder';
import { felderDerSeite } from './forma/felder';
import type { Formular } from './forma/formular';
import { formularBytes, istAngekreuzt, memoText, parseFormular, setzeAngekreuzt, setzeMemoText } from './forma/formular';
import type { PkWert, Projektkarte } from './forma/projektkarte';
import { istWahl, pkAnzeige, pkEintrag, pkSchluessel, pkWert, pkWertPasst, pkWertVon } from './forma/projektkarte';
import type { Sperre, SperrBewertung, SperrProbe } from './forma/sperre';
import { bewerten, sperreLesen, sperreSchreiben, sperrPfad, zeitstempel } from './forma/sperre';
import { istEigeneSperre, sperreVergessen, sperreVermerken, verwaisteEigeneSperrenAufraeumen } from './eigeneSperren';
import { finde } from './forma/dfm';
import type { FormularEintrag, Projekt } from './projekte';
import { formulareDesProjekts, projekteSuchen } from './projekte';
import type { Adresse } from './adressbuch';
import { adressenAusKarte, zusammenfuehren } from './adressbuch';
import { xlsxLesen } from './dokumente/xlsx';
import type { Angabe, ProjektdatenEintrag } from './projektdaten';
import { IN_PROJEKTKARTE, projektdatenLesen } from './projektdaten';
import type { OapInhalt } from './oap';
import { OAP_ANGABEN, angabenAus, metaMit } from './oap';
import type { Project, ProjectMeta } from '@core/model';
import { createProject, leereMeta } from '@core/model';
import { parseProjectData } from '@core/serialize';
import { VORGABE_OAP_PFAD, projektdateiPfad } from '@core/projektdatei';
import type { DateiStand } from '@core/platform/projektordner';
import { projektdateiAnlegen, projektdateiLaden, projektdateiSchreiben } from '@core/platform/projektordner';
import { allgemeinAendern, konfigAendern, konfigLesen } from '@core/platform/konfig';
import { ordnerName } from '@core/platform/projektordner';
import { sichererDateiname } from '@core/projektdatei';
import type { FormularProfil } from './profil';
import type { FormularZustand } from './autofill';
import { autoWerte, autofillFelder, zustandBeimSpeichern } from './autofill';
import type { Abweichung, Eintrag } from './vorgabe';
import { abweichung, abweichungAus, istLeer as abweichungLeer, ohneEigenes, vorgabeFuer, wirksam } from './vorgabe';
import type { FeldAenderung, Verlauf } from './verlauf';
import { eintragen, eintragenMehrere, kannRueckgaengig, kannWiederholen, leererVerlauf, springe, verlaufAus } from './verlauf';

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
export type Hauptansicht = 'formular' | 'projektkarte' | 'datei' | 'einstellungen' | 'projekte';

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

interface FormulareState extends Gespeichert {
  ds: Dateisystem | null;
  projekte: Projekt[];
  suchfehler: string[];
  sucht: boolean;
  projekt: Projekt | null;
  formulare: FormularEintrag[];
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
  /** Adressen aus den Projektkarten aller FORMA-Projekte (zwischengespeichert) */
  adressbuch: { adressen: Adresse[]; stand: number } | null;
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
  /** Browser: einzelne .frmsjf-Datei über den Dateidialog */
  dateiOeffnen: () => Promise<void>;
  schliessen: () => Promise<void>;
  wertSetzen: (feld: Feld, wert: Wert) => void;
  /** Feld verlassen: ein geleertes Feld mit Auto-Wert bekommt ihn wieder (erzwungen leer: ein Leerzeichen) */
  feldVerlassen: (feld: Feld) => void;
  /** nicht geöffnetes Formular ändern: in den Entwurf, falls es einen gibt, sonst in die Datei (mit Sperre) */
  formularAendern: (pfad: string, werte: Record<string, Wert>) => Promise<'entwurf' | 'gespeichert' | 'gesperrt' | 'nurLesen'>;
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
  /** mehrere Einträge in einem Schritt (Übernehmen, Leeren) */
  karteMehrere: (werte: KartenWert[], titel: string) => void;
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
  setDateiEntwurf: (wert: unknown) => void;
  /** Profil eines Formulars setzen; null = wieder die Vorgabe */
  /** wirksames Profil speichern (gespeichert wird die Abweichung von der Vorgabe); null = alles auf die Vorgabe */
  profilSetzen: (schluessel: string, profil: FormularProfil | null) => void;
  /** eigene Änderungen an einem Abschnitt, Feld oder einer Gruppe verwerfen – es gilt wieder die Vorgabe */
  eigenesVerwerfen: (schluessel: string, eintrag: Eintrag) => void;
  einstellungenOeffnen: (bereich?: EinstellungsBereich) => void;
  setRollenVorgabe: (gruppe: number, schluessel: string | null) => void;
  setOapVorlage: (pfad: string) => void;
  /** Projektdatei für das gewählte Projekt festlegen; null = wieder automatisch */
  oapWaehlen: (pfad: string | null) => Promise<void>;
  /** gemeinsame Einstellungen (allgemein.json) übernehmen: Stammordner der Projekte, Ort neuer Projektdateien */
  gemeinsamLaden: () => Promise<void>;
  /** Projektdatei gezielt ändern (frisch lesen, nur `projekt.json`); legt sie nicht an – dann false */
  oapAendern: (aendern: (roh: Record<string, unknown>) => Record<string, unknown>) => Promise<boolean>;
  /** Stammdaten-Dialog öffnen, um die fehlende Projektdatei anzulegen; `danach` läuft nach dem Anlegen */
  stammdatenErfassen: (grund: string, danach?: () => Promise<void>) => Promise<void>;
  /** Projektdatei mit diesen Stammdaten anlegen (aus dem Dialog) */
  projektdateiAnlegen: (meta: ProjectMeta) => Promise<void>;
  stammdatenAbbrechen: () => void;
  /** Dialog öffnen, um dem gewählten Projekt einen Projektordner zuzuordnen; `danach` läuft, sobald es eine Projektdatei gibt */
  projektordnerZuordnen: (grund: string, danach?: () => Promise<void>) => void;
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

function lesen<T>(schluessel: string, vorgabe: T): T {
  try {
    const roh = localStorage.getItem(schluessel);
    return roh ? (JSON.parse(roh) as T) : vorgabe;
  } catch {
    return vorgabe;
  }
}

function schreiben(schluessel: string, wert: unknown): boolean {
  try {
    localStorage.setItem(schluessel, JSON.stringify(wert));
    return true;
  } catch {
    // ohne Speicher gibt es keinen Entwurf
    return false;
  }
}

const strings = (x: unknown) => (Array.isArray(x) ? x.filter((p): p is string => typeof p === 'string') : []);

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
  };
}

export { VORGABE_OAP_PFAD };

/* ---------- Entwürfe und Verlauf ---------- */

const dokSchluessel = (o: Pick<OffenesFormular, 'projekt' | 'pfad'>) => (o.projekt ? `${o.projekt.root}|${o.pfad}` : `datei|${o.pfad}`);
const karteSchluessel = (p: Projekt) => `karte|${p.root}|${p.ordner}`;

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
  if (verlauf.schritte.length) {
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

/** Dateiname eines Formulars im FORMA-Projekt (Schlüssel des Autofill-Zustands) */
export const formularDatei = (pfad: string) => pfad.split('/').pop() ?? pfad;

/** Auto-Werte des offenen Formulars aus der Projektkarte (mit ihren ungespeicherten Änderungen); null, solange sie nicht gelesen ist */
export function autoWerteVon(o: OffenesFormular, karte: OffeneKarte | null) {
  if (!karte || !o.projekt || karte.projekt.ordner !== o.projekt.ordner || karte.projekt.root !== o.projekt.root) return null;
  return autoWerte(o.formular, o.felder, karteMitAenderungen(karte));
}

export const kannZurueck = (o: OffenesFormular | null) => !!o && kannRueckgaengig(o.verlauf);
export const kannVor = (o: OffenesFormular | null) => !!o && kannWiederholen(o.verlauf);

const gleich = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

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
      return istWahl(e) ? { ...e, zahl: typeof w === 'number' ? w : null } : { ...e, text: typeof w === 'string' ? w : '' };
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

/** Änderungen für die Hülle: Texte mit CR LF wie bei FORMA, Auswahl als Nummer */
function kartenAenderungen(k: OffeneKarte): PkAenderung[] {
  return Object.entries(k.aenderungen).flatMap(([s, w]): PkAenderung[] => {
    const [gruppe, id] = s.split(':').map(Number);
    const e = pkEintrag(k.karte, gruppe, id);
    if (!e) return [];
    if (istWahl(e)) {
      // „keine Wahl“: was vorher stand (leer oder −1) bleibt so, wenn es schon nichts war
      const neu = typeof w === 'number' ? w : e.zahl === null ? null : -1;
      return neu === e.zahl ? [] : [{ gruppe, id, typ: e.typ, spalte: 'ganzzahl', alt: e.zahl, neu }];
    }
    return [{ gruppe, id, typ: e.typ, spalte: 'texte', alt: e.text, neu: (typeof w === 'string' ? w : '').replace(/\n/g, '\r\n') }];
  });
}

const fehlertext = (e: unknown) => (e instanceof Error ? e.message : String(e));

class KeinFormular extends Error {
  constructor(readonly ursache: unknown) {
    super(fehlertext(ursache));
  }
}

/** Meldung, wenn eine Datei kein lesbares FORMA-Formular ist (die technische Einzelheit steht im Protokoll) */
export const KEIN_FORMULAR = 'Das ist kein FORMA-Formular (.frmsjf). Bitte eine Formulardatei aus dem FORMA-Projektordner wählen.';

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
    offen.verlauf = verlaufLaden(k);
    const wiederhergestellt = Object.keys(offen.aenderungen).length;
    set({
      offen,
      haupt: 'formular',
      konflikt: false,
      meldung: wiederhergestellt ? { art: 'info', text: `${wiederhergestellt} nicht gespeicherte Eingabe(n) vom letzten Mal wiederhergestellt.` } : null,
    });
  };

  /** Neuer Stand des offenen Formulars: übernehmen und lokal sichern */
  const aktualisieren = (o: OffenesFormular) => {
    const neu = { ...o };
    neu.gesichert = sichern(neu);
    set({ offen: neu });
    return neu;
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
      void get().stammdatenErfassen('Die Projektkarte ist gespeichert. Für die Projektstammdaten fehlt im Projektordner noch die Projektdatei (.oap) – mit diesen Angaben wird sie angelegt.');
      return null;
    }
    if (!o) return null;
    let anzahl = 0;
    const geschrieben = await get().oapAendern((roh) => {
      const bisher = parseProjectData(roh).meta;
      // nur, was sich unterscheidet – steht schon alles so darin, bleibt die Datei unberührt
      const vorher = angabenAus(bisher);
      const geaendert = new Map([...werte].filter(([a, w]) => (vorher.get(a) ?? '').trim() !== w.trim()));
      anzahl = geaendert.size;
      return geaendert.size ? { ...roh, meta: metaMit(bisher, geaendert) } : roh;
    });
    if (!geschrieben) return null;
    log.info(`Projektdatei ${o.pfad}: ${anzahl} Angabe(n)`);
    return `Projektdatei mitgeführt (${anzahl} Angabe(n))`;
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
  /** nach dem Anlegen der Projektdatei weitermachen (z. B. den Projektumfang speichern) */
  let nachAnlegen: (() => Promise<void>) | null = null;

  /** Projektordner zugeordnet: Projektdatei suchen; fehlt sie, die Stammdaten erfassen (die wartende Aktion bleibt) */
  const nachZuordnen = async (projekt: Projekt) => {
    await get().oapLaden();
    if (get().projekt !== projekt) return;
    const weiter = nachAnlegen;
    if (get().oap === 'fehlt') await get().stammdatenErfassen('Im Projektordner gibt es noch keine Projektdatei (.oap). Mit diesen Stammdaten wird sie angelegt.', weiter ?? undefined);
    else {
      nachAnlegen = null;
      if (weiter) await weiter();
    }
  };

  /** Neuer Stand der Projektkarte: übernehmen und lokal sichern (Entwurf und Verlauf) */
  const karteAktualisieren = (k: OffeneKarte) => {
    const neu = { ...k, gesichert: sichernUnter(PK_ENTWUERFE, karteSchluessel(k.projekt), k.aenderungen, k.verlauf) };
    set({ karte: neu });
  };

  return {
    ...ladeEinstellungen(),
    ds: hatDateisystem() ? tauriDateisystem : null,
    projekte: [],
    suchfehler: [],
    sucht: false,
    projekt: null,
    formulare: [],
    offen: null,
    haupt: 'formular',
    zuletzt: zuletztLaden(),
    karte: null,
    datei: null,
    dateiEntwuerfe: {},
    profile: profileAus(lesen<unknown>(PROFILE, {})),
    adressbuch: lesen<{ adressen: Adresse[]; stand: number } | null>(ADRESSBUCH, null),
    adressbuchLaeuft: null,
    projektdaten: null,
    oap: null,
    stammdatenDialog: null,
    ordnerDialog: null,
    ordnerWahl: {},
    ordnerStand: 0,
    einstellungsBereich: 'ordner',
    ablage: [],
    ablageFehler: [],
    konflikt: false,
    meldung: null,

    setAnsicht: (ansicht) => set({ ansicht }),
    setHaupt: (haupt) => {
      set({ haupt });
      if (haupt === 'projektkarte' && !get().karte) void get().karteLaden();
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
        set({ meldung: { art: 'info', text: `Nach einem Absturz liegen gebliebene Sperre(n) entfernt: ${namen}.` } });
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
      await get().schliessen();
      nachAnlegen = null;
      set({ projekt, formulare: [], karte: null, datei: null, projektdaten: null, oap: null, stammdatenDialog: null, ordnerDialog: null, haupt: 'formular' });
      const ds = get().ds;
      if (!projekt || !ds) return;
      const gleich = (z: Pick<Projekt, 'root' | 'ordner'>) => z.root === projekt.root && z.ordner === projekt.ordner;
      const zuletzt = [{ root: projekt.root, ordner: projekt.ordner, zeit: Date.now() }, ...get().zuletzt.filter((z) => !gleich(z))].slice(0, MAX_ZULETZT);
      schreiben(ZULETZT, zuletzt);
      set({ zuletzt });
      try {
        set({ formulare: await formulareDesProjekts(ds, projekt) });
      } catch (e) {
        fehler(`Formulare von ${projekt.ordner} nicht lesbar`, e);
      }
      void get().oapLaden();
      void get().projektdatenLaden();
    },

    zuletztEntfernen: (p) => {
      const zuletzt = get().zuletzt.filter((z) => z.root !== p.root || z.ordner !== p.ordner);
      schreiben(ZULETZT, zuletzt);
      set({ zuletzt });
    },

    formularOeffnen: async (eintrag) => {
      const { ds, projekt } = get();
      if (!ds || !projekt) return;
      // erst lesen und prüfen – ein fehlgeschlagenes Öffnen lässt das geöffnete Formular unverändert
      let bytes: Uint8Array;
      try {
        const b = await ds.lies(projekt.root, eintrag.pfad);
        if (!b) throw new Error('Die Datei wurde nicht gefunden.');
        pruefen(b);
        bytes = b;
      } catch (e) {
        nichtLesbar(eintrag.name, e);
        return;
      }
      await get().schliessen();
      try {
        const { zustand: sperre, aufgeraeumt } = await sperren(ds, projekt.root, eintrag.pfad);
        // Zwischen Lesen und Sperren könnte FORMA gespeichert haben: mit Sperre noch einmal lesen
        const frisch = sperre.art === 'eigen' ? ((await ds.lies(projekt.root, eintrag.pfad)) ?? bytes) : bytes;
        await oeffnen(projekt, eintrag.pfad, eintrag.name, frisch, sperre);
        const offen = get().offen;
        if (offen && !get().karte && autofillFelder(offen.formular, offen.felder).size) void get().karteLaden();
        if (aufgeraeumt && !get().meldung) set({ meldung: { art: 'info', text: 'Eine verwaiste Sperre dieser App (nach einem Absturz) wurde entfernt.' } });
        log.info(`Geöffnet: ${eintrag.pfad}${sperre.art === 'fremd' ? ` (nur ansehen: ${sperre.bewertung.art})` : ''}`);
        set({ formulare: await formulareDesProjekts(ds, projekt) });
      } catch (e) {
        fehler(`${eintrag.name} lässt sich nicht öffnen`, e);
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
      const { ds, projekt } = get();
      if (!ds || !projekt) return [];
      const eintraege = await ds.liste(verbinde(projekt.root, projekt.ordner), 1);
      const formulare = new Set(eintraege.filter((e) => !e.ordner && /\.frmsjf$/i.test(e.pfad)).map((e) => e.pfad.toLowerCase()));
      const out: SperrEintrag[] = [];
      for (const e of eintraege.filter((x) => !x.ordner && /\.frmtmp$/i.test(x.pfad))) {
        const pfad = `${projekt.ordner}/${e.pfad}`;
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
          set({ formulare: await formulareDesProjekts(ds, projekt) });
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
      if (!o) return;
      const vorher = wertVon(o, feld);
      if (vorher === wert) return;
      const verlauf = eintragen(o.verlauf, feld.schluessel, vorher, wert, Date.now());
      aktualisieren({ ...o, verlauf, aenderungen: mitWerten(o, new Map([[feld.schluessel, wert]])) });
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
      if (!o) return;
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
      const { ds, konflikt } = get();
      let o = get().offen;
      if (!o || !istGeaendert(o)) return;
      if (o.nurLesen) return fehler(o.nurLesen);
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
        const neu = mitAenderungen(o.bytes, o.aenderungen);
        if (o.projekt && ds) {
          const aktuell = await ds.lies(o.projekt.root, o.pfad);
          if (!aktuell || !gleich(aktuell, o.bytes)) {
            set({ konflikt: true, meldung: { art: 'fehler', text: 'Die Datei wurde seit dem Öffnen außerhalb geändert (z. B. in FORMA). Bitte neu laden – deine Eingaben bleiben erhalten.' } });
            return;
          }
          await ds.ersetze(o.projekt.root, o.pfad, neu);
        } else {
          const ok = await saveBinaryFile({ defaultName: `${o.name}.frmsjf`, data: neu, filterName: 'FORMA-Formular', extension: 'frmsjf', mime: 'application/octet-stream' });
          if (!ok) return;
        }
        const { formular, felder, nurLesen } = aufbereiten(neu);
        const geaendert = Object.keys(o.aenderungen).filter((k) => zugeordnet.has(k));
        aktualisieren({ ...o, bytes: neu, formular, felder, nurLesen, aenderungen: {} });
        set({ meldung: { art: 'info', text: `${o.name} gespeichert.` } });
        if (o.projekt && geaendert.length) {
          const werte = o.aenderungen;
          const z = zustandBeimSpeichern(zustand, geaendert, (k) => (typeof werte[k] === 'string' ? (werte[k] as string) : undefined), bezug);
          if (JSON.stringify(z) !== JSON.stringify(zustand ?? { felder: {} })) autofillAnbindung.speichern(datei, z);
        }
        log.info(`Gespeichert: ${o.pfad} (${Object.keys(o.aenderungen).length} Feld(er))`);
      } catch (e) {
        fehler(`${o.name} nicht gespeichert`, e);
      }
    },

    neuLaden: async () => {
      const { offen: o, ds } = get();
      if (!o?.projekt || !ds) return;
      try {
        const bytes = await ds.lies(o.projekt.root, o.pfad);
        if (!bytes) throw new Error('Datei nicht gefunden');
        const { formular, felder, nurLesen } = aufbereiten(bytes);
        aktualisieren({ ...o, bytes, formular, felder, nurLesen, aenderungen: bereinige(o.aenderungen, felder) });
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
          set({ karte: null, meldung: { art: 'info', text: `${projekt.ordner} hat keine Projektkarte.` } });
          return;
        }
        const k = karteSchluessel(projekt);
        const offen: OffeneKarte = { projekt, karte, aenderungen: {}, verlauf: verlaufLaden(k), gesichert: null };
        // nur Entwürfe übernehmen, die zum Eintrag passen und noch vom gespeicherten Wert abweichen
        const entwurf = lesen<Record<string, Record<string, unknown>>>(PK_ENTWUERFE, {})[k] ?? {};
        offen.aenderungen = karteMitWerten(offen, new Map(Object.entries(entwurf)));
        set({ karte: offen });
      } catch (e) {
        fehler(`Projektkarte von ${projekt.ordner} nicht lesbar`, e);
      }
    },

    karteSetzen: (gruppe, id, wert) => {
      const k = get().karte;
      if (!k) return;
      const s = pkSchluessel(gruppe, id);
      const vorher = karteWert(k, gruppe, id);
      if (vorher === wert) return;
      const verlauf = eintragen(k.verlauf, s, vorher, wert, Date.now());
      karteAktualisieren({ ...k, verlauf, aenderungen: karteMitWerten(k, new Map([[s, wert]])) });
    },

    karteMehrere: (werte, titel) => {
      const k = get().karte;
      if (!k) return;
      const liste = werte.filter((w) => {
        const e = pkEintrag(k.karte, w.gruppe, w.id);
        return !!e && pkWertPasst(e, w.wert);
      });
      const aenderungen: FeldAenderung[] = liste.map((w) => ({ feld: pkSchluessel(w.gruppe, w.id), vorher: karteWert(k, w.gruppe, w.id), nachher: w.wert }));
      const verlauf = eintragenMehrere(k.verlauf, aenderungen, titel, Date.now());
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
      get().karteMehrere(zurueck, 'Änderungen verworfen');
      set({ meldung: { art: 'info', text: 'Ungespeicherte Änderungen der Projektkarte verworfen – Strg+Z holt sie zurück.' } });
    },

    dateiAnsehen: async (root, pfad) => {
      const ds = get().ds;
      const name = pfad.split('/').pop()!;
      const art = dateiArtVon(name);
      if (!ds || !art) return;
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
      try {
        const aktuell = await ds.lies(d.root, d.pfad);
        if (!aktuell || !gleich(aktuell, d.bytes)) {
          set({ meldung: { art: 'fehler', text: `${d.name} wurde seit dem Öffnen außerhalb geändert – bitte neu laden (deine Bearbeitungen bleiben erhalten).` } });
          return false;
        }
        await ds.dokumentErsetzen(d.root, d.pfad, neu);
        const k = `${d.root}|${d.pfad}`;
        const entwuerfe = { ...get().dateiEntwuerfe };
        delete entwuerfe[k];
        set({ datei: { ...d, bytes: neu, stand: d.stand + 1 }, dateiEntwuerfe: entwuerfe, meldung: { art: 'info', text: `${d.name} gespeichert (die vorige Fassung liegt als Sicherung im App-Ordner).` } });
        log.info(`Dokument gespeichert: ${d.pfad}`);
        return true;
      } catch (e) {
        fehler(`${d.name} nicht gespeichert`, e);
        return false;
      }
    },

    einstellungenOeffnen: (bereich) => set({ haupt: 'einstellungen', ...(bereich ? { einstellungsBereich: bereich } : {}) }),

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
      try {
        const g = await projektdateiLaden(ds.projektordner, root, { gewaehlt: get().oapWahl[projekt.ordner] });
        if (get().projekt !== projekt) return;
        if (!g) {
          set({ oap: 'fehlt' });
          return;
        }
        set({ oap: { root, pfad: g.pfad, stand: g.stand, projekt: g.projekt, inhalt: { name: g.projekt.name, meta: g.projekt.meta }, kandidaten: g.kandidaten } });
      } catch (e) {
        log.warn(`Projektdatei von ${projekt.ordner} nicht lesbar: ${fehlertext(e)}`);
        if (get().projekt === projekt) set({ oap: 'fehlt', meldung: { art: 'fehler', text: `Projektdatei von ${projekt.ordner} nicht lesbar: ${fehlertext(e)}` } });
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
    stammdatenErfassen: async (grund, danach) => {
      const projekt = get().projekt;
      if (!projekt) return;
      if (!get().karte) await get().karteLaden();
      if (get().projekt !== projekt) return;
      nachAnlegen = danach ?? null;
      set({ stammdatenDialog: { grund, meta: metaAusKarte(projekt, get().karte) } });
    },
    stammdatenAbbrechen: () => {
      nachAnlegen = null;
      set({ stammdatenDialog: null });
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
      if (!(await projektdateiAnlegen(ds.projektordner, root, pfad, p, 'Formulare'))) throw new Error(`${pfad}: Dort liegt schon eine Datei – bitte in der Projektkarte auswählen.`);
      log.info(`Projektdatei angelegt: ${pfad}`);
      set({ stammdatenDialog: null, meldung: { art: 'info', text: `Projektdatei angelegt: ${pfad}` } });
      get().ordnerNeuLesen();
      await get().oapLaden();
      const weiter = nachAnlegen;
      nachAnlegen = null;
      if (weiter) await weiter();
    },
    projektordnerZuordnen: (grund, danach) => {
      if (!get().projekt) return;
      nachAnlegen = danach ?? null;
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
      nachAnlegen = null;
      set({ ordnerDialog: null });
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
    gemeinsamLaden: async () => {
      try {
        const app = ((await konfigLesen('formulare')) ?? {}) as Record<string, unknown>;
        if (app.ordnerWahl && typeof app.ordnerWahl === 'object') set({ ordnerWahl: Object.fromEntries(Object.entries(app.ordnerWahl as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string')) });
        const roh = ((await konfigLesen('allgemein')) ?? {}) as Record<string, unknown>;
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
        const adressbuch = { adressen: zusammenfuehren(gesammelt), stand: Date.now() };
        schreiben(ADRESSBUCH, adressbuch);
        set({ adressbuch });
        log.info(`Adressbuch: ${adressbuch.adressen.length} Adressen aus ${projekte.length} Projekten`);
      } finally {
        set({ adressbuchLaeuft: null });
      }
    },

    adressbuchErgaenzen: (adressen) => {
      const alt = get().adressbuch?.adressen ?? [];
      const neu = adressen.filter((a) => !alt.some((x) => x.schluessel === a.schluessel));
      if (!neu.length) return;
      const adressbuch = { adressen: zusammenfuehren([...alt, ...neu]), stand: get().adressbuch?.stand ?? Date.now() };
      schreiben(ADRESSBUCH, adressbuch);
      set({ adressbuch });
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

    setDateiEntwurf: (wert) => {
      const d = get().datei;
      if (!d) return;
      const k = `${d.root}|${d.pfad}`;
      const entwuerfe = { ...get().dateiEntwuerfe };
      if (wert === null || wert === undefined) delete entwuerfe[k];
      else entwuerfe[k] = wert;
      set({ dateiEntwuerfe: entwuerfe });
    },

    karteSpeichern: async () => {
      const { ds, karte: k } = get();
      if (!ds || !k || !karteGeaendert(k)) return;
      const pfad = `${k.projekt.ordner}/sj_prokarte.sdb`;
      try {
        const aenderungen = kartenAenderungen(k);
        if (aenderungen.length) await ds.projektkarteSchreiben(k.projekt.root, pfad, aenderungen);
        const frisch = await ds.projektkarteLesen(k.projekt.root, pfad);
        if (!frisch) throw new Error('Projektkarte nach dem Speichern nicht lesbar');
        karteAktualisieren({ ...k, karte: frisch, aenderungen: {} });
        set({ meldung: { art: 'info', text: `Projektkarte von ${k.projekt.ordner} gespeichert.` } });
        if (aenderungen.length) autofillAnbindung.karteGespeichert?.(k.karte, frisch);
        // die Projektdatei (.oap) im Projektordner gleich mitführen: geänderte Angaben mit Gegenstück
        const geaendert = new Set(aenderungen.map((a) => pkSchluessel(a.gruppe, a.id)));
        const werte = new Map<Angabe, string>();
        for (const { angabe } of OAP_ANGABEN) {
          const z = IN_PROJEKTKARTE[angabe];
          if (z && geaendert.has(pkSchluessel(z.gruppe, z.id))) werte.set(angabe, pkWert(frisch, z.gruppe, z.id));
        }
        try {
          const text = await inProjektdatei(k.projekt, werte);
          if (text) set({ meldung: { art: 'info', text: `Projektkarte gespeichert – ${text}.` } });
        } catch (e) {
          fehler('Projektkarte gespeichert, aber nicht in die Projektdatei übernommen', e);
        }
        log.info(`Projektkarte gespeichert: ${pfad} (${aenderungen.length} Einträge)`);
      } catch (e) {
        fehler('Projektkarte nicht gespeichert', e);
      }
    },
  };
});

/** Echter Projektordner des gewählten FORMA-Projekts (über das Kürzel) */
/** von Hand zugeordnete Ordner als AblageOrdner – je Pfad dasselbe Objekt (stabil für Selektoren) */
const gewaehlteOrdner = new Map<string, AblageOrdner>();

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
    log.warn(`Einstellungen von Formulare nicht geschrieben: ${fehlertext(e)}`);
  }
}

/** Angezeigte Pfade im echten Projektordner eines Projekts */
export const auswahlVon = (s: Pick<FormulareState, 'auswahl' | 'vorgabeAuswahl'>, p: Projekt | null) => (p && s.auswahl[p.ordner]) || s.vorgabeAuswahl;

useFormulare.subscribe((s) => {
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
  };
  schreiben(EINSTELLUNGEN, g);
});

/** Wirksames Profil eines Formulars (Vorgabe + eigene Einstellungen) */
export const useProfil = (schluessel: string) => useFormulare((s) => profilFuer(s.profile, schluessel));
