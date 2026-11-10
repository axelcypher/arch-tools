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
import { xlsxAendern, xlsxLesen } from './dokumente/xlsx';
import type { Angabe, ProjektdatenEintrag } from './projektdaten';
import { IN_PROJEKTKARTE, projektdatenLesen, zellwert } from './projektdaten';
import type { FormularProfil } from './profil';
import { bereinigt as profilBereinigt, istLeer as profilLeer } from './profil';
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
export type Hauptansicht = 'formular' | 'projektkarte' | 'datei' | 'einstellungen';

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
  /** Vorlage für eine neue Projektdaten.xlsx (vollständiger Pfad); leer = keine anlegen */
  projektdatenVorlage: string;
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
  karte: OffeneKarte | null;
  datei: OffeneDatei | null;
  /** ungespeicherte Bearbeitungen je Dokument (`root|pfad`), nur für diese Sitzung */
  dateiEntwuerfe: Record<string, unknown>;
  /** Formularprofile (Gliederung, Füllstand) je Formular und Stand */
  profile: Record<string, FormularProfil>;
  /** Adressen aus den Projektkarten aller FORMA-Projekte (zwischengespeichert) */
  adressbuch: { adressen: Adresse[]; stand: number } | null;
  /** Einlesen läuft: so weit */
  adressbuchLaeuft: { fertig: number; gesamt: number } | null;
  /** Projektdaten.xlsx des gewählten Projekts; 'fehlt' = keine gefunden, null = nicht gesucht */
  projektdaten: ProjektdatenDatei | 'fehlt' | null;
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
  ablageLaden: () => Promise<void>;
  projektWaehlen: (p: Projekt | null) => Promise<void>;
  formularOeffnen: (e: FormularEintrag) => Promise<void>;
  /** Browser: einzelne .frmsjf-Datei über den Dateidialog */
  dateiOeffnen: () => Promise<void>;
  schliessen: () => Promise<void>;
  wertSetzen: (feld: Feld, wert: Wert) => void;
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
  profilSetzen: (schluessel: string, profil: FormularProfil | null) => void;
  einstellungenOeffnen: (bereich?: EinstellungsBereich) => void;
  setRollenVorgabe: (gruppe: number, schluessel: string | null) => void;
  setProjektdatenVorlage: (pfad: string) => void;
  /** Adressbuch aus allen FORMA-Projekten neu einlesen */
  adressbuchLaden: () => Promise<void>;
  /** Adressen ins Adressbuch aufnehmen (z. B. eine eben als Vorgabe festgelegte) */
  adressbuchErgaenzen: (adressen: Adresse[]) => void;
  /** Projektdaten.xlsx des gewählten Projekts suchen und lesen */
  projektdatenLaden: () => Promise<void>;
  /** Angaben aus der Projektdaten.xlsx in die Projektkarte übernehmen (ein Schritt) */
  projektdatenUebernehmen: (angaben: Angabe[]) => void;
}

export type EinstellungsBereich = 'ordner' | 'stammdaten' | 'adressbuch' | 'formulare' | 'antrag' | 'projektdaten';

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
    projektdatenVorlage: typeof o.projektdatenVorlage === 'string' ? o.projektdatenVorlage : '',
    vorgabeAuswahl: Array.isArray(o.vorgabeAuswahl) ? strings(o.vorgabeAuswahl) : VORGABE_AUSWAHL,
    auswahl,
  };
}

/* ---------- Entwürfe und Verlauf ---------- */

const dokSchluessel = (o: Pick<OffenesFormular, 'projekt' | 'pfad'>) => (o.projekt ? `${o.projekt.root}|${o.pfad}` : `datei|${o.pfad}`);
const karteSchluessel = (p: Projekt) => `karte|${p.root}|${p.ordner}`;

const entwuerfe = () => lesen<Record<string, Record<string, Wert>>>(ENTWUERFE, {});

export const hatEntwurf = (projekt: Projekt, pfad: string) => !!entwuerfe()[dokSchluessel({ projekt, pfad })];

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

export const useFormulare = create<FormulareState>()((set, get) => {
  const fehler = (text: string, e?: unknown) => {
    const t = e === undefined ? text : `${text}: ${fehlertext(e)}`;
    log.error(t);
    set({ meldung: { art: 'fehler', text: t } });
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
   * Nach dem Speichern der Projektkarte: geänderte Angaben auch in die Projektdaten.xlsx im Ordner „Organisation“
   * schreiben (nur die Wertzellen). Fehlt die Datei und ist eine Vorlage eingestellt, wird sie daraus angelegt.
   */
  const projektdatenNachtragen = async (projekt: Projekt, karte: Projektkarte, geaendert: string[]) => {
    const ds = get().ds;
    if (!ds || get().projekt !== projekt) return;
    const angaben = (Object.entries(IN_PROJEKTKARTE) as [Angabe, { gruppe: number; id: number }][]).filter(([, z]) => geaendert.includes(pkSchluessel(z.gruppe, z.id)));
    if (!angaben.length) return;
    let pd = get().projektdaten;
    try {
      const vorlage = get().projektdatenVorlage;
      const ablage = ablageVon(get(), projekt);
      if (pd === 'fehlt' && vorlage && ablage) {
        const i = Math.max(vorlage.lastIndexOf('\\'), vorlage.lastIndexOf('/'));
        const bytes = await ds.lies(vorlage.slice(0, i), vorlage.slice(i + 1));
        if (!bytes) throw new Error(`Vorlage ${vorlage} nicht gefunden`);
        await ds.dokumentAnlegen(verbinde(ablage.root, ablage.pfad), `Organisation/${projekt.ordner} Projektdaten.xlsx`, bytes);
        await get().projektdatenLaden();
        pd = get().projektdaten;
      }
      if (!pd || pd === 'fehlt') return;
      if (pd.inOffice || (await ds.inOffice(pd.root, pd.pfad))) {
        set({ meldung: { art: 'fehler', text: 'Projektdaten.xlsx ist in Excel geöffnet – dort nicht nachgetragen.' } });
        return;
      }
      const neu = new Map<Angabe, string>();
      for (const [a, z] of angaben) neu.set(a, pkWert(karte, z.gruppe, z.id));
      const zellen = new Map<number, Map<string, string>>();
      for (const e of pd.eintraege) {
        if (!neu.has(e.angabe)) continue;
        const w = zellwert(pd.eintraege, e, neu);
        if (w === e.wert && !pd.eintraege.some((x) => x !== e && x.zelle === e.zelle)) continue;
        zellen.set(e.blatt, (zellen.get(e.blatt) ?? new Map()).set(e.zelle, w));
      }
      if (![...zellen.values()].some((m) => m.size)) return;
      const aktuell = await ds.lies(pd.root, pd.pfad);
      if (!aktuell || !gleich(aktuell, pd.bytes)) throw new Error('die Datei wurde inzwischen geändert');
      await ds.dokumentErsetzen(pd.root, pd.pfad, xlsxAendern(pd.bytes, zellen));
      await get().projektdatenLaden();
      set({ meldung: { art: 'info', text: `Projektkarte gespeichert – Projektdaten.xlsx mitgeführt (${[...zellen.values()].reduce((n, m) => n + m.size, 0)} Wert(e)).` } });
    } catch (e) {
      fehler('Projektdaten.xlsx nicht mitgeführt', e);
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
    karte: null,
    datei: null,
    dateiEntwuerfe: {},
    profile: lesen<Record<string, FormularProfil>>(PROFILE, {}),
    adressbuch: lesen<{ adressen: Adresse[]; stand: number } | null>(ADRESSBUCH, null),
    adressbuchLaeuft: null,
    projektdaten: null,
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
      await get().ablageLaden();
    },

    ablageEntfernen: async (pfad) => {
      set({ ablageordner: get().ablageordner.filter((p) => p !== pfad) });
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

    ablageLaden: async () => {
      const ds = get().ds;
      if (!ds) return;
      const { ordner, fehler: ablageFehler } = await ablageSuchen(ds, get().ablageordner);
      set({ ablage: ordner, ablageFehler });
    },

    projektWaehlen: async (projekt) => {
      await get().schliessen();
      set({ projekt, formulare: [], karte: null, datei: null, projektdaten: null, haupt: 'formular' });
      const ds = get().ds;
      if (!projekt || !ds) return;
      try {
        set({ formulare: await formulareDesProjekts(ds, projekt) });
      } catch (e) {
        fehler(`Formulare von ${projekt.ordner} nicht lesbar`, e);
      }
      void get().projektdatenLaden();
    },

    formularOeffnen: async (eintrag) => {
      const { ds, projekt } = get();
      if (!ds || !projekt) return;
      await get().schliessen();
      try {
        const bytes = await ds.lies(projekt.root, eintrag.pfad);
        if (!bytes) throw new Error('Datei nicht gefunden');
        // erst prüfen, ob die Datei lesbar ist – dann sperren
        aufbereiten(bytes);
        const { zustand: sperre, aufgeraeumt } = await sperren(ds, projekt.root, eintrag.pfad);
        // Zwischen Lesen und Sperren könnte FORMA gespeichert haben: mit Sperre noch einmal lesen
        const frisch = sperre.art === 'eigen' ? ((await ds.lies(projekt.root, eintrag.pfad)) ?? bytes) : bytes;
        await oeffnen(projekt, eintrag.pfad, eintrag.name, frisch, sperre);
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
      await get().schliessen();
      try {
        await oeffnen(null, datei.name, datei.name.replace(/\.frmsjf$/i, ''), new Uint8Array(await datei.arrayBuffer()), { art: 'ohne' });
      } catch (e) {
        fehler(`${datei.name} lässt sich nicht öffnen`, e);
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
      const { offen: o, ds, konflikt } = get();
      if (!o || !istGeaendert(o)) return;
      if (o.nurLesen) return fehler(o.nurLesen);
      if (o.sperre.art === 'fremd') return fehler(`${o.name} ist bei ${o.sperre.sperre.benutzer || 'jemand anderem'} geöffnet – Speichern nicht möglich`);
      if (konflikt) return fehler('Die Datei wurde inzwischen geändert – bitte erst neu laden');
      try {
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
        aktualisieren({ ...o, bytes: neu, formular, felder, nurLesen, aenderungen: {} });
        set({ meldung: { art: 'info', text: `${o.name} gespeichert.` } });
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

    setProjektdatenVorlage: (projektdatenVorlage) => set({ projektdatenVorlage: projektdatenVorlage.trim() }),

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
      const sauber = profil && profilBereinigt(profil);
      if (sauber && !profilLeer(sauber)) profile[schluessel] = sauber;
      else delete profile[schluessel];
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
        // die Projektdaten.xlsx im Projektordner gleich mitführen
        set({ meldung: { art: 'info', text: `Projektkarte von ${k.projekt.ordner} gespeichert.` } });
        await projektdatenNachtragen(k.projekt, frisch, aenderungen.map((a) => pkSchluessel(a.gruppe, a.id)));
        log.info(`Projektkarte gespeichert: ${pfad} (${aenderungen.length} Einträge)`);
      } catch (e) {
        fehler('Projektkarte nicht gespeichert', e);
      }
    },
  };
});

/** Echter Projektordner des gewählten FORMA-Projekts (über das Kürzel) */
export const ablageVon = (s: Pick<FormulareState, 'ablage'>, p: Projekt | null) => (p ? zuordnen(p.ordner, s.ablage) : null);

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
    projektdatenVorlage: s.projektdatenVorlage,
    vorgabeAuswahl: s.vorgabeAuswahl,
    auswahl: s.auswahl,
  };
  schreiben(EINSTELLUNGEN, g);
});
