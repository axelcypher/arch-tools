/**
 * Zustand für Antrag und Export: Einstellungen (global und je Projekt), die Angaben der App zum gewählten
 * Projekt (Abschnitt „formulare“ der Projektdatei: Antragsumfang, aktive Antragsfassung), die Antragsfassungen im Projektordner und der
 * Status jedes Dokuments im Antragsumfang. Dazu der Export als PDF, das Verknüpfen von Dateien und das Anlegen
 * fehlender Formulare.
 *
 * Eigener Store neben dem der Formulare, damit Tastendrücke im Formular hier nur eine leichte Neuberechnung
 * auslösen (verzögert), keine Dateizugriffe.
 */

import { create } from 'zustand';
import { saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import type { Abschnitt, AntragDaten, AntragStatusManuell } from './antrag';
import type { AntragsVorlage, ExportEinstellungen, ExportUeberschreibung, Fassung, Fuellstand, KatalogEintrag, ProjektDatei, ProjektStatus, Status, UmfangEintrag } from './antrag';
import {
  anzeigeName,
  dateiImAntrag,
  formularSchluessel,
  hauptArt,
  dateiname,
  einstellungenAus,
  einstellungenFuer,
  vorlageMitAntragsart,
  externStatus,
  fassungenAus,
  formularStatus,
  formularVon,
  fuellstand,
  katalogAus,
  passt,
  projektDateiAus,
  abschnittAus,
  abschnittVon,
  antragKurzVon,
  aenderungAnwenden,
  klein,
  stabil,
  alsAngaben,
  ansichtVon,
  antraegeVon,
  EINGEREICHT_TIEFE,
  eingereichtAus,
  eingereichtVon,
  standAus,
  naechsteFassung,
  istArchiv,
  neuerAntrag,
  tagVon,
  projektStatusAus,
  projektStatusLesen,
  quelleVon,
  standardFassung,
  UEBERSCHREIBBAR,
  umfangErforderlich,
  vorlagenAus,
  antragsNameFehler,
  artDerFassung,
  ordnerPasst,
  PLANSATZ_QUELLE,
} from './antrag';
import type { Namensschema } from '@core/namensschema';
import { alleKuerzel, wirksamesNamensschema } from '@core/namensschema';
import type { PlansatzErgebnis } from './plansatz';
import { plansatzPruefen } from './plansatz';
import type { Merkmal } from './bedingung';
import { merkmaleAus, merkmalVorgaben, mitVorgabeMerkmalen } from './bedingung';
import type { Eintrag } from './dateisystem';
import { ALTE_PROJEKTDATEI, verbinde } from './dateisystem';
import type { Feld } from './forma/felder';
import { felderDerSeite } from './forma/felder';
import type { Formular } from './forma/formular';
import { formularBytes, kennung, parseFormular, setzeAngekreuzt, setzeMemoText, stand } from './forma/formular';
import { bezeichner } from './forma/dfm';
import { formularPdf } from './forma/pdf';
import type { FormularProfil } from './profil';
import { leeresProfil, profilSchluessel } from './profil';
import type { FormularEintrag, Projekt } from './projekte';
import { projektSchluessel } from './projekte';
import type { FormularZustand, Zustaende } from './autofill';
import { autoWerte } from './autofill';
import type { DialogArt } from './store';
import { ablageVon, autofillAnbindung, entwurfVon, formularOrdner, karteMitAenderungen, mitAenderungen, profilFuer as wirksamesProfil, sperrAnbindung, unterordnerAnbindung, useFormulare, wertVon } from './store';
import { fragen } from '@core/ui/Rueckfrage';

const log = logger('formulare');

const EINSTELLUNGEN = 'formulare:export';
const KATALOG = 'formulare:katalog';
const VORLAGEN = 'formulare:vorlagen';
const UEBERSCHREIBUNGEN = 'formulare:export-projekte';
const MERKMALE = 'formulare:merkmale';
const PROJEKTSTATUS = 'formulare:projektstatus';

function lesen<T>(schluessel: string, vorgabe: T): T {
  try {
    const roh = localStorage.getItem(schluessel);
    return roh ? (JSON.parse(roh) as T) : vorgabe;
  } catch {
    return vorgabe;
  }
}
function schreiben(schluessel: string, wert: unknown) {
  try {
    localStorage.setItem(schluessel, JSON.stringify(wert));
  } catch {
    // nur für diese Sitzung
  }
}

/** Angaben zu einem Formular des Projekts (aus der Datei, mit ungespeicherten Eingaben) */
export interface FormularInfo {
  pfad: string;
  name: string;
  kennung: string | null;
  stand: string | null;
  fuellstand: Fuellstand;
  /** letzte Änderung: Datei oder ungespeicherte Eingaben (ms) */
  letzteAenderung: number;
}

/** Ein Dokument des Antragsumfangs mit seinem Status in der aktiven Fassung */
export interface DokZustand {
  eintrag: UmfangEintrag;
  status: Status;
  /** intern: das Formular im FORMA-Projekt */
  formular: FormularInfo | null;
  /** die Datei im Ordner der aktiven Fassung */
  datei: Eintrag | null;
  /** extern: die Quelle (z. B. die Berechnung) */
  quelle: Eintrag | null;
  /** Plansatz: alle Pläne mit Zustand, Lücken und Hinweisen */
  plansatz?: PlansatzErgebnis;
}

/** Dateien eines Dokuments im Antragsordner: die verknüpfte bzw. gefundene – bei einem Plansatz jede seiner Plandateien */
export const dateienVon = (d: DokZustand): string[] => (d.plansatz ? [...new Set(d.plansatz.plaene.flatMap((p) => (p.datei ? [p.datei.pfad] : [])))] : d.datei ? [d.datei.pfad] : []);

/** Das Dokument des Antragsumfangs, zu dem eine Datei im Antragsordner gehört (Groß-/Kleinschreibung egal) */
export const dokumentZu = (dokumente: DokZustand[], pfad: string) => dokumente.find((d) => dateienVon(d).some((p) => p.toLowerCase() === pfad.toLowerCase()));

/** Quellordner eines Dokuments (relativ zum Projektordner): angegeben, sonst Berechnungen bzw. Genehmigungsplanung/pdf */
export const quelleVonEintrag = (u: Pick<UmfangEintrag, 'art' | 'quelle'>, e: Pick<ExportEinstellungen, 'berechnungsordner'>) =>
  (u.quelle?.trim() || (u.art === 'plansatz' ? PLANSATZ_QUELLE : e.berechnungsordner)).trim();

/** Wohin exportiert wird: Ordner relativ zum Projektordner und Dateiname mit Endung */
export interface ExportZiel {
  ordner: string;
  name: string;
}

interface AntragState {
  einstellungen: ExportEinstellungen;
  katalog: KatalogEintrag[];
  /** Antragsvorlagen: welche Katalogdokumente zu welcher Art von Antrag gehören */
  vorlagen: AntragsVorlage[];
  /** Antragsmerkmale (Gebäudeklasse …) mit ihren möglichen Werten – für Bedingungen */
  merkmalDefinitionen: Merkmal[];
  /** je Projektkürzel */
  ueberschreibungen: Record<string, ExportUeberschreibung>;
  /** Abschnitt „formulare“ der Projektdatei des gewählten Projekts; null = nicht gelesen */
  projektdatei: ProjektDatei | null;
  fassungen: Fassung[];
  /** Dateien im Ordner der aktiven Fassung */
  dateien: Eintrag[];
  /** der Ordner der aktiven Fassung war beim letzten Lesen da, aber nicht lesbar (dann gilt die zuletzt gelesene Liste) */
  dateienLesefehler: boolean;
  /** Ordner (mit der Ablage), aus dem `dateien` stammt */
  dateienOrdner: string | null;
  /** Quellen externer Dokumente: Ordner (relativ) → Dateien darin */
  quellen: Record<string, Eintrag[]>;
  formularInfo: Record<string, FormularInfo>;
  dokumente: DokZustand[];
  /** Fassung, deren Ordner zuletzt gelesen und berechnet wurde (Zeilen der Antragsdaten, Ablage „Antrag“); null vor dem ersten Lesen */
  dokumenteFuer: string | null;
  laedt: boolean;
  /** Antragsstatus je Projekt (Schlüssel `<Quelle>|<Ordner>`), zuletzt berechnet – für die Projektübersicht */
  projektStatus: Record<string, ProjektStatus>;

  setEinstellungen: (e: Partial<ExportEinstellungen>) => void;
  setKatalog: (k: KatalogEintrag[] | null) => void;
  /** null = wieder die Vorgabe */
  setVorlagen: (v: AntragsVorlage[] | null) => void;
  setMerkmalDefinitionen: (m: Merkmal[] | null) => void;
  /** Wert eines Antragsmerkmals im gewählten Projekt setzen (leer = entfernen) – in der Projektdatei */
  merkmalSetzen: (name: string, wert: string) => Promise<void>;
  /** Status des aktiven Antrags von Hand setzen (eingereicht mit Datum bzw. in Arbeit); null = wieder automatisch */
  statusSetzen: (status: AntragStatusManuell | null) => Promise<void>;
  /** den Antragsstand des aktiven Antrags durch die Dateien ersetzen, die jetzt im Ordner liegen (erst lesen, dann in einem Schritt) */
  standNeuFesthalten: () => Promise<void>;
  /** Abweichungen des gewählten Projekts; null = wieder die Vorgabe */
  setUeberschreibung: (u: ExportUeberschreibung | null) => void;
  /** Einstellungen neu aus dem lokalen Speicher lesen (nach dem Einspielen einer Datei) und neu berechnen */
  einstellungenNeuLesen: () => void;
  /** alles für das gewählte Projekt neu lesen */
  laden: () => Promise<void>;
  /** Dateien neu auflisten und Status berechnen */
  aktualisieren: () => Promise<void>;
  /** nur neu berechnen (nach Eingaben im Formular) */
  neuBerechnen: () => void;
  fassungWaehlen: (name: string, anlegen?: boolean) => Promise<void>;
  /** Antragsumfang setzen – das Ergebnis sagt, ob gespeichert wurde (bzw. ein Dialog es nachholt) */
  /** `bewegt`: der Eintrag, der verschoben wurde (für das Zusammenführen mit gleichzeitigen Änderungen) */
  umfangSetzen: (umfang: UmfangEintrag[] | null, o?: { info?: SchreibInfo; bewegt?: string }) => Promise<SchreibInfo>;
  /**
   * Antragsumfang ändern – gelesen wird er erst jetzt (Menüs, Verknüpfen, Formular anlegen halten keinen alten fest).
   * Mit `ansicht` nur, wenn noch diese Fassung angezeigt wird, mit `eintrag` nur, wenn es den Eintrag noch gibt; sonst
   * nennt das Ergebnis den Grund (gemeldet wird er, außer mit `still`)
   */
  umfangAendern: (aendern: (umfang: UmfangEintrag[]) => UmfangEintrag[] | null, o?: UmfangAenderung) => Promise<SchreibInfo>;
  /** Datei im Ordner der aktiven Fassung mit einem Dokument verknüpfen; null = Verknüpfung lösen */
  /** Datei verknüpfen: mit `ansicht` nur, wenn noch diese Fassung angezeigt (und aktiv) ist – für sie wird verknüpft */
  verknuepfen: (umfangId: string, dateiname: string | null, o?: Omit<UmfangAenderung, 'eintrag'>) => Promise<SchreibInfo>;
  /**
   * Datei im Antragsordner als neues Dokument (extern) in den Antragsumfang aufnehmen und mit ihr verknüpfen (Quick-Add) –
   * mit `ansicht` nur, wenn noch diese Fassung angezeigt ist; für sie wird verknüpft
   */
  dateiAufnehmen: (dateiname: string, o: { titel: string; nr?: string; ansicht?: string }) => Promise<SchreibInfo>;
  exportieren: (formularPfad: string, ziel: ExportZiel, ersetzen: boolean) => Promise<string | null>;
  speichernUnter: (formularPfad: string) => Promise<boolean>;
  /** Formular für einen Eintrag anlegen – mit `ansicht` (aus einem Menü) nur, wenn noch diese Fassung angezeigt ist */
  formularAnlegen: (umfangId: string, o?: { ansicht?: string }) => Promise<string | null>;
  /** verfügbare Formulare zum Hinzufügen: Vorlagenordner und andere Projekte, je Formular der neueste Stand */
  vorlagenAuflisten: () => Promise<Vorlage[]>;
  /** Formular aus einer Vorlage geleert anlegen und öffnen; auf Wunsch in den Antragsumfang aufnehmen */
  formularHinzufuegen: (v: Vorlage, inUmfang: boolean) => Promise<string | null>;
  /** Autofill-Zustand von Formularen (Dateiname im FORMA-Projekt) in die Projektdatei – nur, wenn es eine gibt */
  zustaendeSetzen: (neu: Zustaende) => Promise<void>;
  /** Datei im Ordner der aktiven Fassung von Hand als „bereit“ markieren bzw. die Markierung aufheben */
  /** `fassung`: die der angezeigten Liste bzw. des Menüs – ist sie nicht mehr angezeigt, ändert sich nichts */
  bereitUmschalten: (datei: string, o?: { fassung?: string }) => Promise<void>;
  /** alle Formulare des FORMA-Projekts (ohne Archivordner) als PDF an ihr Exportziel; liefert die Zahl der exportierten */
  alleExportieren: () => Promise<number>;
  /** läuft gerade der Sammel-Export: fertig von gesamt */
  sammelExport: { fertig: number; gesamt: number } | null;
}

/** Formular, das sich ins Projekt übernehmen lässt */
export interface Vorlage {
  /** Ordner, in dem es liegt (absolut) */
  root: string;
  /** relativ dazu */
  pfad: string;
  /** Dateiname */
  datei: string;
  /** Name ohne Nummer und Jahr */
  name: string;
  /** „Vorlagenordner“ oder „Projekt BS5“ */
  herkunft: string;
  geaendert: number;
}

/* ---------- Hilfen ---------- */

const ctx = () => {
  const s = useFormulare.getState();
  const ablage = ablageVon(s, s.projekt);
  return { ds: s.ds, projekt: s.projekt, ablage, basis: ablage ? verbinde(ablage.root, ablage.pfad) : null };
};

/**
 * Einstellungen für das Projekt (global, mit seinen Abweichungen). An der Stelle der Antragsart steht in der
 * Namensvorlage immer {Art} – eine ältere Vorlage mit {Phase} oder einem festen Kürzel dort wird hier umgestellt
 * (nach der Reihenfolge des Namensschemas); gespeichert bleibt sie, wie sie ist.
 */
export const wirksameEinstellungen = (s: Pick<AntragState, 'einstellungen' | 'ueberschreibungen'>, p: Projekt | null) => {
  const e = einstellungenFuer(s.einstellungen, p ? s.ueberschreibungen[p.ordner] : undefined);
  return { ...e, namensvorlage: vorlageMitAntragsart(e.namensvorlage, namensschema().reihenfolge) };
};

/** Die aktive Antragsfassung: gewählt, sonst die neueste der Standardart, sonst die Standardart selbst */
export function aktiveFassung(s: Pick<AntragState, 'projektdatei' | 'fassungen' | 'einstellungen' | 'ueberschreibungen'>, p: Projekt | null): string {
  const e = wirksameEinstellungen(s, p);
  return s.projektdatei?.aktiveFassung || standardFassung(s.fassungen, e.arten)?.name || e.arten[0] || 'BAUA';
}

/**
 * Quellordner (relativ, z. B. „Planung/Berechnungen“) im Projektordner suchen: je Teil zuerst der genaue Name, sonst
 * eine gleichwertige Schreibweise (`ordnerPasst`). Teile, die es nicht gibt, bleiben wie angegeben.
 */
export async function ordnerAufloesen(ds: { liste: (pfad: string, tiefe: number) => Promise<Eintrag[]> }, basis: string, rel: string): Promise<string> {
  const teile = rel.replace(/\\/g, '/').split('/').filter(Boolean);
  const out: string[] = [];
  for (const teil of teile) {
    let kinder: string[] = [];
    try {
      kinder = (await ds.liste(out.length ? verbinde(basis, out.join('/')) : basis, 1)).filter((e) => e.ordner).map((e) => e.pfad);
    } catch {
      return [...out, ...teile.slice(out.length)].join('/');
    }
    const genau = kinder.find((k) => k.toLowerCase() === teil.toLowerCase());
    const treffer = genau ?? kinder.filter((k) => ordnerPasst(k, teil)).sort((a, b) => b.localeCompare(a, 'de', { numeric: true }))[0];
    out.push(treffer ?? teil);
  }
  return out.join('/');
}

/** Formular in einem Archivordner – wird beim Sammel-Export ausgelassen */
export { istArchiv };

let schemaZuletzt: { projekt: unknown; buero: unknown; schema: Namensschema } | null = null;
/**
 * Namensschema des Projekts: das der Projektdatei, sonst das des Büros, sonst die Vorgabe. Aus einem Zustand des
 * Formulare-Stores – zwischengespeichert, solange sich beide Quellen nicht ändern (auch als Selektor geeignet).
 */
export function namensschemaVon(f: Pick<ReturnType<typeof useFormulare.getState>, 'oap' | 'namensschemaBuero'>): Namensschema {
  const projekt = f.oap && f.oap !== 'fehlt' ? f.oap.projekt.namensschema : undefined;
  if (!schemaZuletzt || schemaZuletzt.projekt !== projekt || schemaZuletzt.buero !== f.namensschemaBuero)
    schemaZuletzt = { projekt, buero: f.namensschemaBuero, schema: wirksamesNamensschema(projekt, f.namensschemaBuero) };
  return schemaZuletzt.schema;
}

/** Namensschema des gewählten Projekts (siehe namensschemaVon) */
export const namensschema = (): Namensschema => namensschemaVon(useFormulare.getState());

/** Antragsarten, an denen Ordner im Antragsordner erkannt werden: die der Einstellungen zuerst, dann die des Namensschemas */
export const antragsarten = (e: Pick<ExportEinstellungen, 'arten'>, synonyme = true, schema: Namensschema = namensschema()) => [
  ...new Set([...e.arten.map((a) => a.toUpperCase()), ...(synonyme ? alleKuerzel(schema.antragsarten) : schema.antragsarten.map((k) => k.kuerzel))]),
];

/** Stand „eingereicht“ des aktiven Antrags (von Hand gesetzt vor erkannt); null = in Arbeit */
export function aktiverEingereicht(s: Pick<AntragState, 'projektdatei' | 'fassungen' | 'einstellungen' | 'ueberschreibungen'>, p: Projekt | null) {
  return eingereichtVon(s.projektdatei?.antraege?.[aktiveFassung(s, p)]);
}

const tagText = (iso: string) => iso.split('-').reverse().join('.');

/**
 * Ist der aktive Antrag eingereicht, ist er für die Bearbeitung gesperrt: Formulare nur ansehen, Antragsdaten, Export
 * und „bereit“ unverändert. Nachgereicht wird im selben Antrag: Status vorübergehend „in Arbeit“ (Tag und Stand
 * bleiben); ein Nachtrag (neue Antragsfassung) erst nach Rücknahme, Ablehnung oder für eine Änderung nach der
 * Genehmigung. Liefert den Grund in Worten, sonst null.
 */
export function antragSperre(s: Pick<AntragState, 'projektdatei' | 'fassungen' | 'einstellungen' | 'ueberschreibungen'>, p: Projekt | null): string | null {
  const e = aktiverEingereicht(s, p);
  if (!e) return null;
  return `Antrag ${aktiveFassung(s, p)} ist eingereicht (${tagText(e.datum)}${e.manuell ? ', von Hand gesetzt' : ''}) und gesperrt. Zum Nachreichen den Status in den Antragsdaten vorübergehend auf „in Arbeit“ setzen.`;
}

/**
 * Antragsart einer Fassung: die der erkannten Fassung, sonst nach den Antragsarten der Einstellungen und des
 * Namensschemas („02. BAUA“, „BAUA 2 Nachtrag“ → „BAUA“) – überall dieselbe Erkennung wie für die Antragsordner
 */
export const artVonFassung = (s: Pick<AntragState, 'fassungen' | 'einstellungen' | 'ueberschreibungen'>, p: Projekt | null, fassung: string) =>
  s.fassungen.find((f) => f.name === fassung)?.art ?? artDerFassung(fassung, antragsarten(wirksameEinstellungen(s, p)));

/** Name des nächsten Nachtrags (neue Fassung derselben Antragsart) */
export function nachtragName(s: Pick<AntragState, 'projektdatei' | 'fassungen' | 'einstellungen' | 'ueberschreibungen'>, p: Projekt | null): string {
  const aktiv = aktiveFassung(s, p);
  return naechsteFassung(s.fassungen, artVonFassung(s, p, aktiv), namensschema().antragsarten);
}

/** Projektcodes, mit denen Dateien im Antragsordner beginnen dürfen: Kürzel des FORMA-Projekts, Projektcode der .oap */
export function projektCodes(p: Projekt): string[] {
  const o = useFormulare.getState().oap;
  return [p.ordner, ...(o && o !== 'fehlt' && o.inhalt.meta.projektcode ? [o.inhalt.meta.projektcode] : [])];
}

/**
 * Lädt gerade ein Antrag (Fassungswechsel, auch von außen)? Dann ist die neue Fassung schon aktiv, angezeigt wird aber
 * noch die bisherige – erst ihr Umfang, bis zum Ende des Neu-Prüfens auch ihre Zeilen und Dateien. Solange wird am
 * Antrag nichts geändert. Liefert den Namen der Fassung, die geöffnet wird, sonst null.
 */
export function wechselLaeuft(s: Pick<AntragState, 'projektdatei' | 'fassungen' | 'einstellungen' | 'ueberschreibungen' | 'dokumenteFuer'>, p: Projekt | null): string | null {
  const aktiv = aktiveFassung(s, p);
  const ansicht = s.projektdatei?.ansicht ?? aktiv;
  return ansicht !== aktiv || (s.dokumenteFuer !== null && s.dokumenteFuer !== ansicht) ? aktiv : null;
}

/** Fassung der angezeigten Zeilen (Antragsdaten, Navigation, Ablage „Antrag“) – an sie sind Aktionen aus Zeilen und deren Menüs gebunden */
export const zeilenFassung = (s: Pick<AntragState, 'projektdatei' | 'fassungen' | 'einstellungen' | 'ueberschreibungen' | 'dokumenteFuer'>, p: Projekt | null) =>
  s.dokumenteFuer ?? s.projektdatei?.ansicht ?? aktiveFassung(s, p);

/** Ordner der aktiven Fassung relativ zum Projektordner */
export const antragsOrdner = (s: Parameters<typeof aktiveFassung>[0], p: Projekt | null) => `${wirksameEinstellungen(s, p).antragsordner.replace(/^\/+|\/+$/g, '')}/${aktiveFassung(s, p)}`;

/** voreingestellter Zielordner des Exports (relativ zum Projektordner) */
export function zielOrdner(s: Parameters<typeof aktiveFassung>[0], p: Projekt | null): string {
  const e = wirksameEinstellungen(s, p);
  if (e.ziel === 'aktiv' || !e.zielpfad.trim()) return antragsOrdner(s, p);
  return e.zielpfad
    .replace(/\{antrag\}/gi, aktiveFassung(s, p))
    .replace(/\{k(ü|ue)rzel\}/gi, p?.ordner ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

const ohneEndung = (n: string) => n.replace(/\.[^.]+$/, '');
const nurName = (pfad: string) => pfad.split('/').pop() ?? pfad;

/** Zerlegte Formulare je Datei (nach Größe und Änderungszeit), damit Neuberechnungen nichts neu einlesen */
const zerlegt = new Map<string, { formular: Formular; felder: Feld[][] }>();

async function formularLesen(projekt: Projekt, pfad: string, eintrag: Eintrag | undefined) {
  const s = useFormulare.getState();
  if (s.offen?.projekt === projekt && s.offen.pfad === pfad) return { formular: s.offen.formular, felder: s.offen.felder };
  const k = `${projekt.root}|${pfad}|${eintrag?.groesse ?? 0}|${eintrag?.geaendert ?? 0}`;
  const da = zerlegt.get(k);
  if (da) return da;
  const bytes = await s.ds!.lies(projekt.root, pfad);
  if (!bytes) throw new Error(`${pfad}: nicht gefunden`);
  const formular = parseFormular(bytes);
  const neu = { formular, felder: formular.seiten.map((x, i) => felderDerSeite(x, i)) };
  zerlegt.set(k, neu);
  return neu;
}

const profilFuer = (formular: Formular, name: string): FormularProfil => ({ ...leeresProfil(), ...wirksamesProfil(useFormulare.getState().profile, profilSchluessel(formular, name)) });

/** Werte eines Formulars: im geöffneten die aktuellen Eingaben, sonst Datei plus ungespeicherter Entwurf */
function werteVon(projekt: Projekt, pfad: string): { wert: (f: Feld) => string | boolean; entwurfZeit: number | null } {
  const s = useFormulare.getState();
  const offen = s.offen;
  if (offen?.projekt === projekt && offen.pfad === pfad) {
    const geaendert = Object.keys(offen.aenderungen).length > 0;
    return { wert: (f) => wertVon(offen, f), entwurfZeit: geaendert ? (offen.gesichert ?? Date.now()) : null };
  }
  const e = entwurfVon(projekt, pfad);
  return { wert: (f) => (e && f.schluessel in e.aenderungen ? e.aenderungen[f.schluessel] : f.original), entwurfZeit: e?.zeit ?? null };
}

/** Werte zum Ausfüllen leeren: Textfelder (außer schreibgeschützten) und Kästchen */
function geleert(bytes: Uint8Array): Uint8Array {
  const f = parseFormular(bytes);
  f.seiten.forEach((s, i) => {
    for (const feld of felderDerSeite(s, i)) {
      if (feld.art === 'kreuz') {
        if (feld.original === true) setzeAngekreuzt(f, i, feld.name, false);
      } else if (bezeichner(feld.kasten.o, 'ReadOnly') !== 'True' && feld.original !== '') setzeMemoText(f, i, feld.name, '');
    }
  });
  return formularBytes(f);
}

/* ---------- Store ---------- */

/** Größe und Zeit der Formulare des Projekts, je Pfad relativ zum Root (klein) – Stammordner und Unterordner der gelisteten */
let dateienFormaProjekt = new Map<string, Eintrag>();
const formularEintrag = (pfad: string) => dateienFormaProjekt.get(pfad.toLowerCase());

/**
 * `projekt.json` mit den Angaben der App: im Abschnitt „formulare“ die aktive Antragsfassung und die Anträge (je
 * Antrag Antragsumfang, Antragsmerkmale, Autofill, „bereit“, angelegt, eingereicht), dazu in `meta.antrag` der zuletzt
 * angelegte Antrag für die Startseiten. `meta.merkmale` (früher projektweit) entfällt – die Werte stehen in den Anträgen.
 */
function mitAbschnitt(roh: Record<string, unknown>, neu: ProjektDatei): Record<string, unknown> {
  // noch nicht übernommene, früher projektweite Angaben gehen nie verloren: in jeden vorhandenen Antrag ohne eigene
  const gespeichert = abschnittAus(roh.formulare ?? (roh.erweiterungen as Record<string, unknown> | undefined)?.formulare, (roh.meta as { merkmale?: Record<string, string> } | undefined)?.merkmale);
  if (gespeichert.alt) {
    const antraege = { ...neu.antraege };
    for (const f of useAntrag.getState().fassungen) if (!antraege[f.name]) antraege[f.name] = { ...structuredClone(gespeichert.alt), angelegt: tagVon(new Date()) };
    neu = { ...neu, antraege };
  }
  const abschnitt = abschnittVon(neu);
  const { formulare: _alt, ...rest } = roh;
  const meta = { ...((roh.meta as Record<string, unknown> | undefined) ?? {}) };
  delete meta.merkmale;
  const kurz = antragKurzVon(antraegeVon(neu), aktiveFassung({ ...useAntrag.getState(), projektdatei: neu }, useFormulare.getState().projekt));
  if (kurz) meta.antrag = kurz;
  else delete meta.antrag;
  return { ...rest, meta, ...(Object.keys(abschnitt).length ? { formulare: abschnitt } : {}) };
}

/**
 * Die Änderung eines Aufrufers (`vorher` → `nachher`) in den frisch gelesenen Abschnitt von `roh` eintragen – je Antrag
 * und Feld nur, was er geändert hat (aenderungAnwenden); `meta.antrag` wie bei mitAbschnitt
 */
function mitAenderung(roh: Record<string, unknown>, vorher: ProjektDatei | null, nachher: ProjektDatei, bewegt?: string, kennzeichen?: { umfangBehalten?: boolean }): Record<string, unknown> {
  const frisch = abschnittAus(roh.formulare ?? (roh.erweiterungen as Record<string, unknown> | undefined)?.formulare, (roh.meta as { merkmale?: Record<string, string> } | undefined)?.merkmale);
  return mitAbschnitt(roh, alsAngaben(aenderungAnwenden(frisch, vorher, nachher, { bewegt, kennzeichen })));
}

/** Bedingungen und Texte für umfangAendern */
export interface UmfangAenderung {
  /** nur, wenn noch diese Fassung angezeigt und aktiv ist (die beim Öffnen des Menüs bzw. beim Start) */
  ansicht?: string;
  /** nur, wenn es diesen Eintrag noch gibt */
  eintrag?: string;
  /** Titel des Eintrags für die Meldung */
  titel?: string;
  /** Anfang der Meldung, wenn nichts geändert wird (z. B. „Nicht verknüpft“) */
  was?: string;
  /** nichts melden (der Aufrufer meldet selbst) */
  still?: boolean;
  /** die Änderung verschiebt den Eintrag `eintrag` (Ziehen, ↑/↓) – so wird nur er umgesetzt */
  verschoben?: boolean;
  /** Ergebnis-Objekt des Aufrufers (z. B. mit `beiAbbruch`, schon vor dem Schreiben gesetzt) */
  info?: SchreibInfo;
}

/** Was beim Schreiben der Projektdatei geschah – für Meldungen der Aufrufer */
export interface SchreibInfo {
  /** in die .oap geschrieben (auch wenn danach ein anderes Projekt offen ist) */
  geschrieben?: boolean;
  /** ein Dialog (Projektordner zuordnen, Projektdatei anlegen) ist offen; er speichert danach */
  dialog?: boolean;
  /** warum nicht gespeichert wurde (ohne Punkt) */
  grund?: string;
  /** nicht möglich: andere Fassung angezeigt, Eintrag bzw. Antragsumfang entfernt (vor bzw. beim Schreiben bemerkt), gesperrt */
  vorab?: 'fassung' | 'eintrag' | 'umfang' | 'sperre';
  /** nicht gespeichert, ein erneuter Versuch kann gehen (Schreibfehler, Datei gerade nicht lesbar, Antrag wird geöffnet) */
  erneut?: boolean;
  /** beim Schreiben stand schon ein Antragsumfang in der Datei, wo der Aufrufer keinen kannte – der blieb */
  umfangBehalten?: boolean;
  /** die beschriebene Projektdatei (`root|pfad`) – auch wenn danach eine andere bzw. keine lesbare geladen ist */
  oap?: string;
  /** wird der offene Dialog abgebrochen: dies statt der allgemeinen Meldung (z. B. eine Zusage zurücknehmen) */
  beiAbbruch?: (art: DialogArt) => void;
}

/** Gespeicherter Abschnitt der geladenen Projektdatei; null, wenn es keine Projektdatei gibt oder nichts darin steht */
function abschnittRohAusOap(): Abschnitt | null {
  const o = useFormulare.getState().oap;
  if (!o || o === 'fehlt') return null;
  const roh = o.projekt.formulare ?? o.projekt.erweiterungen?.formulare;
  const merkmale = o.projekt.meta.merkmale;
  if (roh === undefined && !merkmale) return null;
  return abschnittAus(roh, merkmale);
}

/** Neuer Antrag aus den Vorgaben (globales Preset der Antragsmerkmale) */
const neuAusVorgaben = (angelegt = tagVon(new Date())) => neuerAntrag(merkmalVorgaben(useAntrag.getState().merkmalDefinitionen), angelegt);

/** Ansicht der App für den aktiven Antrag aus der geladenen Projektdatei (nach Änderungen von außen) */
function abschnittAusOap(): ProjektDatei | null {
  const a = abschnittRohAusOap();
  if (!a) return null;
  const st = useAntrag.getState();
  // ohne gespeicherte aktive Fassung die vorgegebene (wie `aktiveFassung`) – nicht die bisherige Ansicht, sonst passten
  // Ansicht und aktive Fassung nicht zusammen
  const fassung = a.aktiveFassung || aktiveFassung({ ...st, projektdatei: null }, useFormulare.getState().projekt);
  return ansichtVon(a, fassung, () => neuAusVorgaben()).pd;
}

/**
 * Neues Formular mit Auto-Werten: leere Felder, die FORMA der Projektkarte zuordnet, werden gleich befüllt; der
 * Zustand (Auto-Wert je Feld) kommt danach in die Projektdatei.
 */
const befuellt = (z: FormularZustand | null) => (z ? ` und mit ${Object.keys(z.felder).length} Angabe(n) aus der Projektkarte befüllt` : ' (leer)');

async function mitAutofill(bytes: Uint8Array, projekt: Projekt): Promise<{ bytes: Uint8Array; zustand: FormularZustand | null }> {
  const f = useFormulare.getState();
  if (!f.karte || f.karte.projekt !== projekt) await f.karteLaden();
  const k = useFormulare.getState().karte;
  // nur die Projektkarte des Projekts, für das angelegt wird
  if (!k || k.projekt !== projekt) return { bytes, zustand: null };
  const formular = parseFormular(bytes);
  const felder = formular.seiten.map((seite, i) => felderDerSeite(seite, i));
  const auto = [...autoWerte(formular, felder, karteMitAenderungen(k))].filter(([, a]) => !String(a.feld.original).trim());
  if (!auto.length) return { bytes, zustand: null };
  return {
    bytes: mitAenderungen(bytes, Object.fromEntries(auto.map(([s, a]) => [s, a.wert]))),
    zustand: { felder: Object.fromEntries(auto.map(([s, a]) => [s, { auto: a.wert }])) },
  };
}

/**
 * Wofür die Projektdatei im Store gelesen wurde: Projekt und .oap (`root|pfad`, null = ohne .oap). Geschrieben wird nur,
 * wenn sie noch zum offenen Projekt und zur gelesenen .oap gehört – sonst landeten nach einem Projektwechsel während
 * eines Lese- oder Schreibvorgangs die Angaben des einen Projekts in der Projektdatei des anderen.
 */
let projektdateiQuelle: { projekt: Projekt; oap: string | null } | null = null;
const oapSchluessel = () => {
  const o = useFormulare.getState().oap;
  return o && o !== 'fehlt' ? `${o.root}|${o.pfad}` : null;
};
const quelleMerken = (projekt: Projekt | null) => {
  projektdateiQuelle = projekt ? { projekt, oap: oapSchluessel() } : null;
};
/** gehört die Projektdatei im Store zum offenen Projekt – und (mit `mitOap`) zur gerade gelesenen .oap? */
const projektdateiPasst = (mitOap: boolean) => {
  const q = projektdateiQuelle;
  if (!q || q.projekt !== useFormulare.getState().projekt) return false;
  return mitOap ? q.oap !== null && q.oap === oapSchluessel() : q.oap === null || q.oap === oapSchluessel();
};

/** Angaben aus einer alten formulare.json einmalig in die Projektdatei übernehmen (die alte Datei bleibt liegen) */
async function uebernehmen(projekt: Projekt, alt: ProjektDatei) {
  const f = useFormulare.getState();
  if (!Object.keys(alt).length || f.projekt !== projekt) return;
  if (f.oap === null) await f.oapLaden();
  const o = useFormulare.getState().oap;
  if (!o || o === 'fehlt' || abschnittAusOap() || useFormulare.getState().projekt !== projekt) return;
  try {
    const altFormat = (roh: Record<string, unknown>) => ({ ...alt, merkmale: { ...alt.merkmale, ...((roh.meta as { merkmale?: Record<string, string> } | undefined)?.merkmale ?? {}) } });
    // im bisherigen Format – das nächste Laden übernimmt die Angaben in die Anträge
    if (await useFormulare.getState().oapAendern((roh) => (roh.formulare === undefined ? { ...roh, formulare: altFormat(roh) } : roh))) {
      log.info(`${projekt.ordner}: ${ALTE_PROJEKTDATEI} in die Projektdatei ${o.pfad} übernommen`);
      useFormulare.getState().setMeldung({ art: 'info', text: `Antragsumfang und Antragsfassung aus ${ALTE_PROJEKTDATEI} in die Projektdatei übernommen – die alte Datei bleibt liegen.` });
    }
  } catch (e) {
    log.warn(`${ALTE_PROJEKTDATEI} nicht in die Projektdatei übernommen: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export const useAntrag = create<AntragState>((set, get) => {
  /**
   * Angaben der App zum Projekt in den Abschnitt „formulare“ der Projektdatei (.oap) schreiben – gezielt, alles
   * andere in der Datei bleibt. Fehlt die Projektdatei, fragt der Stammdaten-Dialog die Angaben ab, legt sie an und
   * speichert danach; ohne Projektordner wird erst einer zugeordnet. Liefert true, wenn gespeichert wurde.
   */
  const projektdateiSchreiben = async (neu: ProjektDatei, erwartet?: Projekt, o: { basis?: ProjektDatei | null; info?: SchreibInfo; bewegt?: string } = {}): Promise<boolean> => {
    const f = useFormulare.getState();
    // das Projekt des Aufrufers (nach seinen eigenen await) – sonst landeten seine Angaben im inzwischen geöffneten
    const projekt = erwartet ?? f.projekt;
    // die Angaben, aus denen der Aufrufer `neu` gebaut hat: geschrieben wird nur der Unterschied (aenderungAnwenden)
    const basis = 'basis' in o ? (o.basis ?? null) : get().projektdatei;
    const info = o.info ?? {};
    if (!f.ds || !projekt) return false;
    if (f.projekt !== projekt) {
      nichtGespeichert(projekt, info, 'Inzwischen ist ein anderes Projekt offen');
      return false;
    }
    // nach einem Dialog (Projektordner zuordnen, Projektdatei anlegen): Gibt es dort schon Angaben zum Antrag, werden
    // sie geladen statt überschrieben. Sonst erst laden (Fassungen aus dem Projektordner) – zeigt das Projekt nach dem
    // Zuordnen eine andere Fassung, gehört die Änderung nicht dorthin; das wird gesagt. In eine eben angelegte (leere)
    // Projektdatei kommt die Änderung mit der Fassung, für die sie gedacht war
    const nachDialog = async (art: 'ordner' | 'oap') => {
      const g = useFormulare.getState();
      if (g.projekt !== projekt) return;
      if (g.oap === null) await g.oapLaden();
      if (anderesProjekt(projekt)) return;
      if (abschnittRohAusOap()) {
        meldung('info', 'Im Projektordner gibt es schon Angaben zum Antrag – sie sind jetzt geladen. Die Änderung ist nicht übernommen; bitte prüfen und bei Bedarf noch einmal vornehmen.');
        await get().laden();
        return;
      }
      await get().laden();
      if (anderesProjekt(projekt)) return;
      // die Fassung, für die die Änderung gedacht war: ausdrücklich gewählt (aktiveFassung geändert) bzw. angezeigt
      const gewollt = neu.aktiveFassung && stabil(neu.aktiveFassung) !== stabil(basis?.aktiveFassung) ? neu.aktiveFassung : neu.ansicht;
      const jetzt = get().projektdatei?.ansicht;
      let ziel = neu;
      let zielBasis = basis;
      if (gewollt && jetzt && jetzt !== gewollt) {
        if (art === 'ordner') {
          meldung('info', `Projektordner zugeordnet – angezeigt wird jetzt Antrag ${jetzt} aus dem Projektordner. Die Änderung ist nicht übernommen; bitte dort bei Bedarf noch einmal vornehmen.`);
          return;
        }
        // eben angelegte Projektdatei: die Fassung des Aufrufers bleibt die aktive (als eigene Änderung geschrieben)
        ziel = { ...neu, aktiveFassung: gewollt };
        zielBasis = basis ? { ...basis, aktiveFassung: undefined } : null;
      }
      // eben angelegte Projektdatei: ein Antragsumfang des Aufrufers war nie darin – er gilt ganz (nicht „woanders
      // aufgehoben“)
      if (art === 'oap' && zielBasis) zielBasis = { ...zielBasis, umfang: undefined };
      if (!(await projektdateiSchreiben(ziel, projekt, { basis: zielBasis }))) return;
      await get().laden();
      if (art === 'oap' && gewollt && ziel.aktiveFassung === gewollt && stabil(gewollt) !== stabil(basis?.aktiveFassung))
        meldung('info', `Projektdatei angelegt – Antrag ${gewollt} ist das Ziel des Exports.`);
    };
    // Dialog abgebrochen: die Zusage des Aufrufers zurücknehmen bzw. allgemein melden
    const abgebrochen = (art: DialogArt) =>
      info.beiAbbruch ? info.beiAbbruch(art) : meldung('info', `${art === 'oap' ? 'Projektdatei nicht angelegt' : 'Projektordner nicht zugeordnet'} – die Änderung ist nicht gespeichert.`);
    if (!ablageVon(f, projekt)) {
      info.dialog = true;
      f.projektordnerZuordnen('Die Angaben zum Antrag werden in der Projektdatei (.oap) im Projektordner gespeichert. Für dieses Projekt ist noch kein Projektordner zugeordnet.', () => nachDialog('ordner'), abgebrochen);
      return false;
    }
    // noch nicht gelesen bzw. gerade nicht lesbar (Netz nach dem Aufwachen): (neu) lesen
    const q = projektdateiQuelle;
    if (f.oap === null || f.oap === 'fehlt') await f.oapLaden();
    if (anderesProjekt(projekt)) {
      nichtGespeichert(projekt, info, 'Inzwischen ist ein anderes Projekt offen');
      return false;
    }
    // die .oap, aus der die Angaben stammen, gibt es nicht mehr (gelöscht, verschoben – der Ordner ist lesbar, die Datei
    // fehlt): die Bindung lösen, dann gilt der normale Weg (andere .oap bzw. Stammdaten-Dialog zum Anlegen)
    let geloest = false;
    if (useFormulare.getState().oap === 'fehlt' && q?.projekt === projekt && q.oap && (await quelleGeloescht(q.oap))) {
      if (anderesProjekt(projekt)) return false;
      projektdateiQuelle = { projekt, oap: null };
      geloest = true;
    }
    // nur in die .oap, aus der die Angaben stammen
    if (!projektdateiPasst(false)) {
      if (useFormulare.getState().oap === 'fehlt') nichtGespeichert(projekt, info, 'Die Projektdatei ist gerade nicht lesbar', 'bitte gleich noch einmal versuchen');
      else nichtGespeichert(projekt, info, 'Inzwischen ist eine andere Projektdatei gewählt', 'bitte noch einmal versuchen');
      return false;
    }
    const oap = useFormulare.getState().oap;
    if (!oap || oap === 'fehlt') {
      info.dialog = true;
      await f.stammdatenErfassen(
        `Die Angaben zum Antrag (Antragsumfang, Antragsfassung, Antragsmerkmale) werden in der Projektdatei (.oap) gespeichert. Im Projektordner gibt es ${geloest ? 'die bisherige nicht mehr (gelöscht oder verschoben)' : 'noch keine'} – mit diesen Stammdaten wird sie angelegt.`,
        () => nachDialog('oap'),
        abgebrochen,
      );
      return false;
    }
    const ziel = oapSchluessel();
    // nur die eigene Änderung in den frisch gelesenen Abschnitt – Gleichzeitiges von anderswo bleibt
    // nichts zu ändern (steht so schon in der Datei, bzw. was geändert werden sollte, ist woanders entfernt): dann
    // wird nicht geschrieben – den Stand der Datei trotzdem übernehmen, damit Store und Meldungen ihr entsprechen
    // Kennzeichen aus dem Zusammenführen – bei einem erneuten Versuch (Datei inzwischen geändert) neu ermittelt
    const kennzeichen: { umfangBehalten?: boolean } = {};
    const zusammenfuehren = (roh: Record<string, unknown>) => {
      kennzeichen.umfangBehalten = false;
      return mitAenderung(roh, basis, neu, o.bewegt, kennzeichen);
    };
    if (!(await useFormulare.getState().oapAendern(zusammenfuehren))) await useFormulare.getState().oapLaden();
    info.geschrieben = true;
    if (ziel) info.oap = ziel;
    if (kennzeichen.umfangBehalten) info.umfangBehalten = true;
    // gespeichert: eine eigene „nicht gespeichert“-Meldung von vorhin gilt nicht mehr
    const m = useFormulare.getState().meldung;
    if (m?.art === 'fehler' && m.text.startsWith(`Angaben zum Antrag von ${projekt.ordner} nicht gespeichert`)) useFormulare.setState({ meldung: null });
    // gespeichert – ist inzwischen ein anderes Projekt bzw. eine andere .oap gewählt, bleiben deren Angaben im Store
    if (useFormulare.getState().projekt !== projekt || oapSchluessel() !== ziel) return false;
    // im Store der gespeicherte Stand (mit dem, was andere inzwischen eingetragen haben), in der Ansicht des Aufrufers –
    // hat inzwischen ein anderer Arbeitsplatz eine andere Fassung aktiv gemacht (und der Aufrufer die aktive nicht
    // geändert), in der gespeicherten aktiven: Ansicht und aktive Fassung passen dann zusammen (sonst hinge der Wechsel)
    const gespeichert = abschnittRohAusOap();
    const aktivGespeichert = gespeichert ? gespeichert.aktiveFassung || aktiveFassung({ ...get(), projektdatei: null }, projekt) : undefined;
    const eigeneWahl = stabil(neu.aktiveFassung) !== stabil(basis?.aktiveFassung);
    const ansicht = !eigeneWahl && aktivGespeichert ? aktivGespeichert : neu.ansicht;
    set({ projektdatei: gespeichert && ansicht ? ansichtVon(gespeichert, ansicht, () => neuAusVorgaben()).pd : neu });
    quelleMerken(projekt);
    return true;
  };
  /** Eine Änderung wurde nicht gespeichert – sagen statt still verwerfen (`grund` ohne Punkt, `rat` optional) */
  const nichtGespeichert = (projekt: Projekt, info: SchreibInfo, grund: string, rat?: string) => {
    info.grund = grund;
    info.erneut = true;
    log.warn(`Angaben zum Antrag von ${projekt.ordner} nicht gespeichert: ${grund}`);
    meldung('fehler', `Angaben zum Antrag von ${projekt.ordner} nicht gespeichert: ${grund}${rat ? ` – ${rat}` : ''}.`);
  };
  /** Inzwischen ein anderes Projekt geöffnet? (nach einem await) */
  const anderesProjekt = (projekt: Projekt) => useFormulare.getState().projekt !== projekt;
  /**
   * Ist die Datei der Quelle (`root|pfad`) gelöscht bzw. verschoben? Nur wenn ihr Ordner – oder bei fehlendem Ordner
   * der Projektordner – lesbar ist und sie dort fehlt; ein nicht erreichbares Netzlaufwerk zählt nicht als gelöscht
   */
  const quelleGeloescht = async (schluessel: string) => {
    const ds = useFormulare.getState().ds;
    const i = schluessel.indexOf('|');
    if (!ds || i < 0) return false;
    const root = schluessel.slice(0, i);
    const pfad = schluessel.slice(i + 1);
    const ordner = pfad.includes('/') ? pfad.slice(0, pfad.lastIndexOf('/')) : '';
    const name = pfad.slice(pfad.lastIndexOf('/') + 1).toLowerCase();
    try {
      const liste = await ds.liste(ordner ? verbinde(root, ordner) : root, 1);
      return !liste.some((e) => !e.ordner && e.pfad.toLowerCase() === name);
    } catch {
      // der Ordner selbst fehlt (verschoben) – oder nichts ist erreichbar: am Projektordner unterscheiden
      if (!ordner) return false;
      try {
        await ds.liste(root, 1);
        return true;
      } catch {
        return false;
      }
    }
  };
  /**
   * Formular im bisherigen Projekt angelegt, inzwischen ist ein anderes offen: sagen, was geschehen ist (`was`: „,
   * aber nicht zugeordnet und nicht geöffnet“ bzw. „ und zugeordnet, aber nicht geöffnet“ …) – liefert true, wenn so
   */
  const angelegtImAnderen = (name: string, projekt: Projekt, was: string) => {
    if (!anderesProjekt(projekt)) return false;
    meldung('info', `„${name}“ in ${projekt.ordner} angelegt${was} – inzwischen ist ein anderes Projekt offen.`);
    return true;
  };
  /** Anlegen abgebrochen, bevor eine Datei entstand (Projektwechsel während der Suche bzw. des Vorbereitens) */
  const nichtAngelegt = (titel: string, projekt: Projekt) => {
    if (!anderesProjekt(projekt)) return false;
    meldung('info', `„${titel}“ nicht angelegt – inzwischen ist ein anderes Projekt offen.`);
    return true;
  };
  /** Ohne Rückfrage speichern (neue Anträge, „eingereicht“) – nur, wenn es eine Projektdatei gibt */
  const stillSpeichern = async (neu: ProjektDatei, basis: ProjektDatei | null): Promise<void> => {
    const o = useFormulare.getState().oap;
    // nur in die .oap, aus der die Angaben stammen (nicht in die eines inzwischen gewählten Projekts)
    if (!o || o === 'fehlt' || !projektdateiPasst(true)) return;
    try {
      // nur der Unterschied zu `basis` in den frisch gelesenen Abschnitt (z. B. fehlende Anträge ergänzen)
      await useFormulare.getState().oapAendern((roh) => mitAenderung(roh, basis, neu));
    } catch (e) {
      log.warn(`Anträge nicht in die Projektdatei geschrieben: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  /**
   * „Eingereicht“ der Anträge nachführen und `meta.antrag` (zuletzt angelegter Antrag, für die Startseiten) aktuell
   * halten – gespeichert wird nur, wenn sich etwas geändert hat.
   */
  const antragStandPflegen = async (eingereicht: Record<string, { datei: string; datum: string } | null>, listen: Record<string, Eintrag[]> = {}) => {
    const pd = get().projektdatei;
    const o = useFormulare.getState().oap;
    // ohne gespeicherte Angaben (z. B. während eine alte formulare.json übernommen wird) nichts schreiben – und nur, wenn
    // die Projektdatei im Store zum offenen Projekt und zur gelesenen .oap gehört
    if (!pd?.antraege || !o || o === 'fehlt' || !abschnittRohAusOap() || !projektdateiPasst(true)) return;
    let geaendert = false;
    const antraege: Record<string, AntragDaten> = { ...pd.antraege };
    for (const [name, e] of Object.entries(eingereicht)) {
      const alt = antraege[name];
      if (!alt || JSON.stringify(alt.eingereicht ?? null) === JSON.stringify(e)) continue;
      const { eingereicht: _, ...rest } = alt;
      antraege[name] = e ? { ...rest, eingereicht: e } : rest;
      geaendert = true;
      log.info(`${name}: ${e ? `eingereicht (${e.datei})` : 'nicht mehr eingereicht'}`);
    }
    // Antragsstand bei der Einreichung einmal festhalten (Dateiliste, keine Kopie) – danach nie verwerfen und nie neu
    // bauen: So geht er weder durch die Reihenfolge von Dateiaktionen noch durch einen Statuswechsel verloren. Gilt der
    // Antrag als in Arbeit, bleibt er nur unsichtbar. Ändert sich der Tag der Einreichung (von Hand berichtigt, ein
    // älterer Nachweis, der erste verschwunden), wird er neu beschriftet; bei einem früheren Tag gehört, was erst danach
    // geändert wurde, beim Vergleich nicht dazu (seitEinreichung) und gilt dann als „neu“. Nach einem Fehlklick lässt er
    // sich von Hand neu festhalten (standNeuFesthalten); Nachreichungen bleiben im selben Antrag.
    for (const [name, a] of Object.entries(antraege)) {
      const ein = eingereichtVon(a);
      if (!ein) continue;
      if (!a.stand && listen[name]) {
        antraege[name] = { ...a, stand: standAus(listen[name], ein.datum) };
        geaendert = true;
        log.info(`${name}: Antragsstand vom ${ein.datum} festgehalten (${antraege[name].stand!.dateien.length} Dateien)`);
      } else if (a.stand && a.stand.tag !== ein.datum) {
        // nur neu beschriften – die Einträge bleiben (umkehrbar); was nach dem Tag geändert wurde, zählt erst beim Vergleich
        antraege[name] = { ...a, stand: { ...a.stand, tag: ein.datum } };
        geaendert = true;
        log.info(`${name}: Tag der Einreichung jetzt ${ein.datum} (Stand bleibt)`);
      }
    }
    const neu = geaendert ? { ...pd, antraege } : pd;
    const kurz = antragKurzVon(antraegeVon(neu), aktiveFassung({ ...get(), projektdatei: neu }, useFormulare.getState().projekt));
    if (!geaendert && JSON.stringify(kurz) === JSON.stringify(o.projekt.meta.antrag ?? null)) return;
    set({ projektdatei: neu });
    await stillSpeichern(neu, pd);
  };
  const meldung = (art: 'info' | 'fehler', text: string) => useFormulare.getState().setMeldung({ art, text });
  /** Eingereichter Antrag: nichts ändern, Meldung zeigen – liefert true, wenn gesperrt */
  /**
   * Warum der Antrag gerade nicht geändert werden kann (ohne Punkt): ein Antrag wird gerade geöffnet (`mitWechsel`) bzw.
   * er ist eingereicht – sonst null
   */
  const sperrGrund = (mitWechsel: boolean): { grund: string; vorab: 'fassung' | 'sperre' } | null => {
    const projekt = useFormulare.getState().projekt;
    const wechsel = mitWechsel ? wechselLaeuft(get(), projekt) : null;
    if (wechsel) return { grund: `Antrag ${wechsel} wird gerade geöffnet`, vorab: 'fassung' };
    const sperre = antragSperre(get(), projekt);
    return sperre ? { grund: sperre.replace(/\.$/, ''), vorab: 'sperre' } : null;
  };
  /** Meldung zu einem Sperrgrund: die Sperre als eigener Satz, sonst `was` und Grund – beim Wechsel mit Rat */
  const sperrMeldung = (g: { grund: string; vorab: 'fassung' | 'sperre' }, was: string) =>
    g.vorab === 'sperre' ? `${g.grund}.` : `${was} – ${g.grund}; bitte gleich noch einmal versuchen.`;
  /** Gesperrt? – dann mit Meldung. Der Export prüft nur die Sperre (`mitWechsel` false), Änderungen auch den Wechsel */
  const gesperrt = (mitWechsel = true, was = 'Nicht gespeichert'): boolean => {
    const g = sperrGrund(mitWechsel);
    if (g) meldung('info', sperrMeldung(g, was));
    return !!g;
  };
  const fehler = (was: string, e: unknown) => {
    const text = `${was}: ${e instanceof Error ? e.message : String(e)}`;
    log.error(text);
    meldung('fehler', text);
  };

  return {
    sammelExport: null,

    alleExportieren: async () => {
      const { ds, projekt, basis } = ctx();
      if (!ds || !projekt || !basis || get().sammelExport || gesperrt(false)) return 0;
      const liste = useFormulare.getState().formulare.filter((f) => !istArchiv(f.pfad));
      if (!liste.length) {
        meldung('info', 'In diesem Projekt gibt es keine Formulare zum Exportieren.');
        return 0;
      }
      const ziele = liste.map((f) => ({ f, ziel: exportVorschlag(f.pfad) }));
      const pfadVon = (z: ExportZiel) => `${z.ordner ? `${z.ordner}/` : ''}${z.name}`;
      const vorhanden: string[] = [];
      for (const { ziel } of ziele) if (await ds.lies(basis, pfadVon(ziel)).catch(() => null)) vorhanden.push(ziel.name);
      let ersetzen = false;
      if (vorhanden.length) {
        const a = await fragen({
          titel: `${vorhanden.length === 1 ? 'Eine Datei gibt' : `${vorhanden.length} Dateien gibt`} es schon`,
          text: `${vorhanden.slice(0, 8).join('\n')}${vorhanden.length > 8 ? `\n… und ${vorhanden.length - 8} weitere` : ''}`,
          knoepfe: [
            { id: 'abbrechen', label: 'Abbrechen' },
            { id: 'ueberspringen', label: 'Vorhandene überspringen' },
            { id: 'ersetzen', label: 'Ersetzen', art: 'danger' },
          ],
        });
        if (a !== 'ueberspringen' && a !== 'ersetzen') return 0;
        ersetzen = a === 'ersetzen';
      }
      const fertig: { pfad: string; name: string; ordner: string }[] = [];
      const fehlgeschlagen: string[] = [];
      let uebersprungen = 0;
      set({ sammelExport: { fertig: 0, gesamt: ziele.length } });
      try {
        for (const [i, { f, ziel }] of ziele.entries()) {
          const pfad = pfadVon(ziel);
          try {
            const da = vorhanden.includes(ziel.name);
            if (da && !ersetzen) uebersprungen++;
            else {
              const pdf = await pdfVon(projekt, f.pfad);
              if (da) await ds.dokumentErsetzen(basis, pfad, pdf);
              else await ds.dokumentAnlegen(basis, pfad, pdf);
              fertig.push({ pfad: f.pfad, name: ziel.name, ordner: ziel.ordner });
              log.info(`Exportiert: ${f.pfad} → ${verbinde(basis, pfad)}`);
            }
          } catch (e) {
            fehlgeschlagen.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
          }
          set({ sammelExport: { fertig: i + 1, gesamt: ziele.length } });
        }
        // im Ordner der aktiven Fassung: mit den Dokumenten des Antragsumfangs verknüpfen (ein Schritt)
        const st = get();
        const umfang = st.projektdatei?.umfang;
        const fassung = aktiveFassung(st, projekt);
        const imAntrag = fertig.filter((x) => x.ordner === antragsOrdner(st, projekt));
        // nur, wenn die aktive Fassung auch angezeigt ist (nicht während ein Wechsel lädt) – sonst gehörte der Umfang zur bisherigen
        if (umfang && imAntrag.length && !wechselLaeuft(st, projekt)) {
          const neu = umfang.map((u) => {
            const doc = st.dokumente.find((d) => d.eintrag.id === u.id);
            const x = doc?.formular && imAntrag.find((y) => y.pfad === doc.formular!.pfad);
            return x ? { ...u, formularDatei: formularSchluessel(x.pfad), dateien: { ...u.dateien, [fassung]: x.name } } : u;
          });
          await get().umfangSetzen(neu);
        } else await get().aktualisieren();
      } finally {
        set({ sammelExport: null });
      }
      const ordner = [...new Set(ziele.map((z) => z.ziel.ordner || 'Projektordner'))].join(', ');
      const teile = [`${fertig.length} von ${ziele.length} Formularen als PDF nach ${ordner} exportiert`, uebersprungen ? `${uebersprungen} vorhandene übersprungen` : '', fehlgeschlagen.length ? `nicht exportiert: ${fehlgeschlagen.join('; ')}` : ''];
      meldung(fehlgeschlagen.length ? 'fehler' : 'info', `${teile.filter(Boolean).join(' – ')}.`);
      return fertig.length;
    },

    bereitUmschalten: async (datei, o = {}) => {
      const projekt = useFormulare.getState().projekt;
      if (!projekt) return;
      const st = get();
      const fassung = aktiveFassung(st, projekt);
      const pd = st.projektdatei ?? {};
      const istMarkiert = (f: string) => (pd.bereit?.[f] ?? []).some((b) => b.datei.toLowerCase() === datei.toLowerCase());
      const was = istMarkiert(o.fassung ?? zeilenFassung(st, projekt)) ? 'Markierung nicht aufgehoben' : 'Nicht als bereit markiert';
      // ein Antrag wird gerade geöffnet bzw. eingereicht: nichts ändern (die Meldung wie die übrigen zu „bereit“)
      const g = sperrGrund(true);
      if (g) {
        meldung('info', sperrMeldung(g, was));
        return;
      }
      // Liste bzw. Menü einer anderen Fassung (inzwischen ist eine andere angezeigt): nichts ändern
      if (o.fassung !== undefined && o.fassung !== fassung) {
        meldung('info', `${was} – inzwischen ist Antrag ${fassung} angezeigt.`);
        return;
      }
      const liste = pd.bereit?.[fassung] ?? [];
      const markiert = istMarkiert(fassung);
      let neu: typeof liste;
      if (markiert) neu = liste.filter((b) => b.datei.toLowerCase() !== datei.toLowerCase());
      else {
        const fehlerText = antragsNameFehler(datei, { codes: projektCodes(projekt), art: artVonFassung(get(), projekt, fassung), reihenfolge: namensschema().reihenfolge, schema: namensschema() });
        if (fehlerText) {
          meldung('fehler', `„${datei}“ kann nicht als bereit markiert werden: ${fehlerText}.`);
          return;
        }
        const e = st.dateien.find((d) => !d.ordner && d.pfad.toLowerCase() === datei.toLowerCase());
        neu = [...liste, { datei, ...(e?.geaendert ? { stand: e.geaendert } : {}) }];
      }
      const bereit = { ...pd.bereit, [fassung]: neu };
      if (!neu.length) delete bereit[fassung];
      const naechste: ProjektDatei = { ...pd, bereit };
      if (!Object.keys(bereit).length) delete naechste.bereit;
      if (await projektdateiSchreiben(naechste)) log.info(`${fassung}: ${datei} ${markiert ? 'nicht mehr bereit' : 'bereit'}`);
    },

    einstellungen: einstellungenAus(lesen<unknown>(EINSTELLUNGEN, null)),
    katalog: katalogAus(lesen<unknown>(KATALOG, null)),
    vorlagen: vorlagenAus(lesen<unknown>(VORLAGEN, null), katalogAus(lesen<unknown>(KATALOG, null))),
    merkmalDefinitionen: merkmaleAus(lesen<unknown>(MERKMALE, null)),
    ueberschreibungen: lesen<Record<string, ExportUeberschreibung>>(UEBERSCHREIBUNGEN, {}),
    projektdatei: null,
    fassungen: [],
    dateien: [],
    dateienLesefehler: false,
    dateienOrdner: null,
    quellen: {},
    formularInfo: {},
    dokumente: [],
    dokumenteFuer: null,
    laedt: false,
    projektStatus: projektStatusLesen(lesen<unknown>(PROJEKTSTATUS, null)),

    einstellungenNeuLesen: () => {
      set({
        einstellungen: einstellungenAus(lesen<unknown>(EINSTELLUNGEN, null)),
        katalog: katalogAus(lesen<unknown>(KATALOG, null)),
        vorlagen: vorlagenAus(lesen<unknown>(VORLAGEN, null), katalogAus(lesen<unknown>(KATALOG, null))),
        merkmalDefinitionen: merkmaleAus(lesen<unknown>(MERKMALE, null)),
        ueberschreibungen: lesen<Record<string, ExportUeberschreibung>>(UEBERSCHREIBUNGEN, {}),
      });
      void get().laden();
    },
    setEinstellungen: (teil) => {
      const einstellungen = einstellungenAus({ ...get().einstellungen, ...teil });
      schreiben(EINSTELLUNGEN, einstellungen);
      set({ einstellungen });
      void get().laden();
    },
    setVorlagen: (v) => {
      if (v) schreiben(VORLAGEN, v);
      else
        try {
          localStorage.removeItem(VORLAGEN);
        } catch {
          // nichts zu löschen
        }
      set({ vorlagen: v ?? vorlagenAus(null, get().katalog) });
    },
    setKatalog: (k) => {
      const katalog = k ?? katalogAus(null);
      if (k) schreiben(KATALOG, katalog);
      else
        try {
          localStorage.removeItem(KATALOG);
        } catch {
          // nichts zu löschen
        }
      set({ katalog });
    },
    setMerkmalDefinitionen: (m) => {
      // die Merkmale der App bleiben (die Vorgaben der Formulare brauchen sie)
      const merkmalDefinitionen = m ? mitVorgabeMerkmalen(m) : merkmaleAus(null);
      if (m) schreiben(MERKMALE, merkmalDefinitionen);
      else
        try {
          localStorage.removeItem(MERKMALE);
        } catch {
          // nichts zu löschen
        }
      set({ merkmalDefinitionen });
    },
    merkmalSetzen: async (name, wert) => {
      if (gesperrt()) return;
      try {
        const alt = get().projektdatei ?? {};
        const merkmale = { ...alt.merkmale };
        if (wert) merkmale[name] = wert;
        else delete merkmale[name];
        const neu: ProjektDatei = { ...alt, merkmale };
        if (!Object.keys(merkmale).length) delete neu.merkmale;
        await projektdateiSchreiben(neu);
        get().neuBerechnen();
      } catch (e) {
        fehler(`Antragsmerkmal ${name}`, e);
      }
    },
    standNeuFesthalten: async () => {
      const { ds, projekt, basis } = ctx();
      if (!ds || !projekt || !basis || !eingereichtVon(get().projektdatei?.antraege?.[aktiveFassung(get(), projekt)])) return;
      const fassung = aktiveFassung(get(), projekt);
      const ordner = antragsOrdner(get(), projekt);
      // erst lesen, dann in einem Schritt ersetzen – ist der Ordner nicht lesbar, bleibt der bisherige Stand
      let liste: Eintrag[];
      try {
        liste = await ds.liste(verbinde(basis, ordner), EINGEREICHT_TIEFE);
      } catch (e) {
        log.error(`Stand neu festhalten: ${e instanceof Error ? e.message : String(e)}`);
        meldung('fehler', `Stand neu festhalten: Ordner ${ordner} nicht lesbar (${e instanceof Error ? e.message : String(e)}) – der bisherige Stand bleibt.`);
        await get().aktualisieren();
        return;
      }
      // während des Lesens kann sich viel ändern (anderes Projekt, andere Fassung, Status): frisch prüfen und aus der
      // aktuellen Projektdatei schreiben – sonst überschriebe ein alter Stand neuere Angaben oder ein anderes Projekt
      const jetzt = get().projektdatei;
      const a = jetzt?.antraege?.[fassung];
      const ein = eingereichtVon(a);
      if (useFormulare.getState().projekt !== projekt || aktiveFassung(get(), projekt) !== fassung || !jetzt?.antraege || !a || !ein) {
        meldung('info', 'Stand neu festhalten abgebrochen – Projekt, Antrag oder Status hat sich inzwischen geändert.');
        return;
      }
      // angezeigt wird der echte Zeitpunkt; zum Stand gehört alles bis zur jüngsten Änderungszeit der Liste (die Uhr des
      // Netzlaufwerks kann vorgehen) plus zwei Sekunden Spielraum
      const jetztMs = Date.now();
      const stand = standAus(liste, ein.datum, { am: jetztMs, bis: Math.max(jetztMs, ...liste.map((d) => d.geaendert ?? 0)) + 2000 });
      try {
        if (await projektdateiSchreiben({ ...jetzt, antraege: { ...jetzt.antraege, [fassung]: { ...a, stand } } }, projekt)) {
          log.info(`${fassung}: Antragsstand von Hand neu festgehalten (${stand.dateien.length} Dateien)`);
          meldung('info', `Stand von ${fassung} neu festgehalten – ${stand.dateien.length} ${stand.dateien.length === 1 ? 'Datei' : 'Dateien'}.`);
          await get().aktualisieren();
        }
      } catch (e) {
        fehler('Stand neu festhalten', e);
      }
    },
    statusSetzen: async (status) => {
      const projekt = useFormulare.getState().projekt;
      const pd = get().projektdatei;
      if (!projekt || !pd) return;
      const fassung = aktiveFassung(get(), projekt);
      const antraege = { ...(pd.antraege ?? {}) };
      const { status: _, ...rest } = antraege[fassung] ?? {};
      antraege[fassung] = status ? { ...rest, status } : rest;
      try {
        if (await projektdateiSchreiben({ ...pd, antraege }, projekt)) {
          log.info(`${fassung}: Status ${status ? (status.eingereicht ? `eingereicht (${status.datum ?? 'ohne Datum'}, von Hand)` : 'in Arbeit (von Hand)') : 'automatisch'}`);
          get().neuBerechnen();
          // Antragsstand festhalten bzw. verwerfen (braucht die Dateiliste des Antragsordners)
          void get().aktualisieren();
        }
      } catch (e) {
        fehler(`Status von ${fassung}`, e);
      }
    },
    setUeberschreibung: (u) => {
      const p = useFormulare.getState().projekt;
      if (!p) return;
      const alle = { ...get().ueberschreibungen };
      const sauber = u ? Object.fromEntries(UEBERSCHREIBBAR.filter((k) => u[k] !== undefined && u[k] !== '').map((k) => [k, u[k]])) : {};
      if (Object.keys(sauber).length) alle[p.ordner] = sauber;
      else delete alle[p.ordner];
      schreiben(UEBERSCHREIBUNGEN, alle);
      set({ ueberschreibungen: alle });
      void get().laden();
    },

    laden: async () => {
      const { ds, projekt, basis } = ctx();
      if (!ds || !projekt) {
        set({ projektdatei: null, fassungen: [], dateien: [], dateienLesefehler: false, dateienOrdner: null, quellen: {}, formularInfo: {}, dokumente: [], dokumenteFuer: null });
        quelleMerken(null);
        return;
      }
      set({ laedt: true });
      try {
        // aus welchem Stand der .oap gelesen wird (null: noch keine bzw. keine) – wird sie während des Ladens erst gelesen
        // oder inzwischen geschrieben (etwa der Antragsumfang nach dem Zuordnen des Projektordners), gilt das hier
        // Gebaute nicht (es ersetzte Gespeichertes durch frische Anträge), dann neu laden
        const von = useFormulare.getState().oap;
        let abschnitt = abschnittRohAusOap();
        let ausJson = false;
        if (!abschnitt) {
          // früher: formulare.json im FORMA-Projekt – wird nur noch gelesen und in die Projektdatei übernommen
          try {
            const roh = await ds.lies(projekt.root, `${projekt.ordner}/${ALTE_PROJEKTDATEI}`);
            if (roh) {
              const alt = projektDateiAus(JSON.parse(new TextDecoder().decode(roh)));
              abschnitt = abschnittAus(alt);
              ausJson = true;
              void uebernehmen(projekt, alt);
            }
          } catch (e) {
            fehler(`${ALTE_PROJEKTDATEI} von ${projekt.ordner} nicht lesbar`, e);
          }
        }
        const a: Abschnitt = abschnitt ?? { antraege: {} };
        // gespeichert wird nur, was hier entsteht (fehlende Anträge) – nie Vorhandenes aus diesem Stand
        const gelesen = alsAngaben(structuredClone(a));
        let fassungen: Fassung[] = [];
        const ordnerZeit = new Map<string, number>();
        const e = wirksameEinstellungen(get(), projekt);
        if (basis && e.antragsordner.trim()) {
          try {
            const ordner = (await ds.liste(verbinde(basis, e.antragsordner), 1)).filter((x) => x.ordner);
            for (const o of ordner) if (o.geaendert) ordnerZeit.set(o.pfad, o.geaendert);
            fassungen = fassungenAus(
              ordner.map((x) => x.pfad),
              antragsarten(e),
            );
          } catch {
            // Antragsordner gibt es (noch) nicht
          }
        }
        // inzwischen ein anderes Projekt gewählt bzw. die .oap erst jetzt gelesen oder geändert?
        if (useFormulare.getState().projekt !== projekt) return;
        if (useFormulare.getState().oap !== von) {
          void get().laden();
          return;
        }
        const tag = (fassung: string) => tagVon(new Date(ordnerZeit.get(fassung) ?? Date.now()));
        // Jeder Ordner einer Antragsfassung ist ein Antrag: fehlende entstehen aus den früher projektweiten Angaben
        // (einmalige Übernahme) bzw. aus den Vorgaben – danach unabhängig
        let anlegen = false;
        for (const f of fassungen)
          if (!a.antraege[f.name]) {
            a.antraege[f.name] = a.alt ? { ...structuredClone(a.alt), angelegt: tag(f.name) } : neuAusVorgaben(tag(f.name));
            anlegen = true;
          }
        const fassung = a.aktiveFassung || aktiveFassung({ ...get(), projektdatei: null, fassungen }, projekt);
        const ansicht = ansichtVon(a, fassung, () => neuAusVorgaben(tag(fassung)));
        set({ projektdatei: ansicht.pd, fassungen });
        quelleMerken(projekt);
        if ((anlegen || ansicht.neu) && !ausJson) await stillSpeichern(ansicht.pd, gelesen);
        await get().aktualisieren();
      } finally {
        set({ laedt: false });
      }
    },

    aktualisieren: async () => {
      const { ds, projekt, basis } = ctx();
      if (!ds || !projekt) return;
      // gelesen wird der Ordner dieser Fassung – ist danach eine andere aktiv, gilt das Ergebnis nicht (das Lesen für sie läuft)
      const fuer = aktiveFassung(get(), projekt);
      const e = wirksameEinstellungen(get(), projekt);
      let dateien: Eintrag[] = [];
      let dateienLesefehler = false;
      const quellen: Record<string, Eintrag[]> = {};
      if (basis) {
        try {
          dateien = await ds.liste(verbinde(basis, antragsOrdner(get(), projekt)), 1);
        } catch {
          // Ordner der Fassung gibt es noch nicht – oder er ist gerade nicht lesbar (Netz nach dem Aufwachen): dann zeigt
          // die Ablage das an und meldet nichts als „entfernt“
          dateienLesefehler = !!get().fassungen.find((f) => f.name === aktiveFassung(get(), projekt))?.vorhanden;
          // die zuletzt gelesene Liste desselben Ordners bleibt stehen – sonst sähe alles wie gelöscht aus
          if (dateienLesefehler && get().dateienOrdner === verbinde(basis, antragsOrdner(get(), projekt))) dateien = get().dateien;
        }
        const ordner = new Set((get().projektdatei?.umfang ?? []).filter((u) => u.art !== 'intern').map((u) => quelleVonEintrag(u, e)));
        for (const o of ordner) {
          try {
            // Schreibweisen der Büros: „Planung/00 Berechnungen“, „Planung/_Berechnungen“, „…/GP/pdf“ …
            quellen[o] = o ? await ds.liste(verbinde(basis, await ordnerAufloesen(ds, basis, o)), 2) : [];
          } catch {
            quellen[o] = [];
          }
        }
      }
      // der Stammordner und jeder Ordner, aus dem Formulare gelistet sind (im Sammelprojekt der Unterordner des Antrags)
      const formularOrdnerListe = new Set([projekt.ordner, ...useFormulare.getState().formulare.map((f) => f.pfad.slice(0, f.pfad.lastIndexOf('/')))]);
      const formaDateien = new Map<string, Eintrag>();
      for (const ordner of formularOrdnerListe) {
        try {
          for (const d of await ds.liste(verbinde(projekt.root, ordner), 1)) if (!d.ordner) formaDateien.set(`${ordner}/${d.pfad}`.toLowerCase(), d);
        } catch {
          // nicht lesbar: ohne Größe und Zeit
        }
      }
      dateienFormaProjekt = formaDateien;
      // eingereicht? – Antragsprotokoll bzw. Eingangsbestätigung im Ordner eines Antrags, auch in Unterordnern
      const eingereicht: Record<string, ReturnType<typeof eingereichtAus>> = {};
      // die Listen dienen auch dem Antragsstand bei der Einreichung
      const listen: Record<string, Eintrag[]> = {};
      if (basis) {
        for (const f of get().fassungen) {
          try {
            listen[f.name] = await ds.liste(verbinde(basis, `${e.antragsordner.replace(/^\/+|\/+$/g, '')}/${f.name}`), EINGEREICHT_TIEFE);
            eingereicht[f.name] = eingereichtAus(listen[f.name]);
          } catch {
            // nicht lesbar (Netz noch nicht da, Aussetzer): nichts schließen – weder „nicht mehr eingereicht“ noch den
            // festgehaltenen Antragsstand verwerfen; beim nächsten Lesen wird es nachgeholt
          }
        }
      }
      if (useFormulare.getState().projekt !== projekt || aktiveFassung(get(), projekt) !== fuer) return;
      await antragStandPflegen(eingereicht, listen);
      // nach Export, neuer Fassung, Verknüpfen … oder von außen: auch der Projektordner-Baum liest neu
      useFormulare.getState().ordnerNeuLesen();
      // Formulare zerlegen (zwischengespeichert), dann rechnen
      const formulare = useFormulare.getState().formulare;
      await Promise.all(
        formulare.map(async (f) => {
          try {
            await formularLesen(projekt, f.pfad, formularEintrag(f.pfad));
          } catch {
            // nicht lesbar: ohne Füllstand
          }
        }),
      );
      if (useFormulare.getState().projekt !== projekt || aktiveFassung(get(), projekt) !== fuer) return;
      // angezeigt ist (noch) eine andere Fassung als die gelesene: Dateien und Zeilen passten nicht zusammen – nichts
      // übernehmen; das Neu-Prüfen am Ende des Ladens setzt es. Lädt nichts, als Sicherung einmal neu laden, damit der
      // Wechsel endet (sonst blieben die Antragsdaten gesperrt)
      const ansicht = get().projektdatei?.ansicht ?? fuer;
      if (ansicht !== fuer) {
        if (!get().laedt && heilung !== `${ansicht}>${fuer}`) {
          heilung = `${ansicht}>${fuer}`;
          log.warn(`Ansicht ${ansicht}, aktiv ${fuer} – Antrag wird neu geladen`);
          void get().laden();
        }
        return;
      }
      // erst jetzt übernehmen, zusammen mit den Zeilen: Dateien einer inzwischen verlassenen Fassung gelten so nie
      set({ dateien, dateienLesefehler, dateienOrdner: dateienLesefehler && !dateien.length ? null : basis ? verbinde(basis, antragsOrdner(get(), projekt)) : null, quellen });
      get().neuBerechnen();
      // Zeilen und Dateien gehören jetzt zu dieser Fassung – ein Wechsel dorthin ist fertig
      set({ dokumenteFuer: fuer });
      heilung = null;
    },

    neuBerechnen: () => {
      const s = useFormulare.getState();
      const projekt = s.projekt;
      if (!projekt) return;
      const formularInfo: Record<string, FormularInfo> = {};
      const merkmale = get().projektdatei?.merkmale ?? {};
      for (const f of s.formulare) {
        const eintrag = formularEintrag(f.pfad);
        const k = `${projekt.root}|${f.pfad}|${eintrag?.groesse ?? 0}|${eintrag?.geaendert ?? 0}`;
        const offen = s.offen?.projekt === projekt && s.offen.pfad === f.pfad ? s.offen : null;
        const z = offen ? { formular: offen.formular, felder: offen.felder } : zerlegt.get(k);
        if (!z) continue;
        const { wert, entwurfZeit } = werteVon(projekt, f.pfad);
        formularInfo[f.pfad] = {
          pfad: f.pfad,
          name: f.name,
          kennung: kennung(z.formular) ?? null,
          stand: stand(z.formular) ?? null,
          fuellstand: fuellstand(z.felder, profilFuer(z.formular, f.name), wert, merkmale),
          letzteAenderung: Math.max(eintrag?.geaendert ?? 0, entwurfZeit ?? 0),
        };
      }
      const st = get();
      const e = wirksameEinstellungen(st, projekt);
      const fassung = aktiveFassung(st, projekt);
      const infos = Object.values(formularInfo);
      const codes = projektCodes(projekt);
      const dokumente = (st.projektdatei?.umfang ?? []).map((u): DokZustand => {
        const datei = dateiImAntrag(u, st.dateien, fassung, codes);
        if (!umfangErforderlich(u, merkmale)) return { eintrag: u, status: 'entfaellt', formular: u.art === 'intern' ? formularVon(u, infos) : null, datei, quelle: null };
        if (u.art === 'intern') {
          const formular = formularVon(u, infos);
          if (!formular) return { eintrag: u, status: 'fehlt', formular: null, datei, quelle: null };
          return { eintrag: u, status: formularStatus(formular.fuellstand, formular.letzteAenderung, datei, codes), formular, datei, quelle: null };
        }
        if (u.art === 'plansatz') {
          const o = useFormulare.getState().oap;
          const geschosse = o && o !== 'fehlt' ? o.projekt.storeys.length : undefined;
          const schema = namensschema();
          const art = hauptArt(artVonFassung(st, projekt, fassung), schema.antragsarten);
          const plansatz = plansatzPruefen(st.dateien, st.quellen[quelleVonEintrag(u, e)] ?? [], schema, { codes, geschosse, muster: u.muster, art });
          // „Datei“ eines Plansatzes: keine einzelne – die Pläne stehen in `plansatz` (je Nummer mit Datei)
          return { eintrag: u, status: plansatz.status, formular: null, datei: null, quelle: null, plansatz };
        }
        const quelle = quelleVon(u, st.quellen[quelleVonEintrag(u, e)] ?? [], codes);
        return { eintrag: u, status: externStatus(quelle, datei, codes), formular: null, datei, quelle };
      });
      set({ formularInfo, dokumente });
      // für die Projektübersicht merken – mit gelesenen Angaben zum Antrag; der Stand der Dokumente nur, wenn alle
      // Formulare zerlegt sind (sonst bleibt der letzte), der Antrag (eingereicht?) immer – wie im Projekt angezeigt
      if (st.projektdatei) {
        const k = projektSchluessel(projekt);
        const alt = st.projektStatus[k];
        const antrag = st.projektdatei.antraege ? antragKurzVon(antraegeVon(st.projektdatei), fassung) : null;
        const vollstaendig = infos.length >= s.formulare.length;
        const neu = vollstaendig || !alt ? projektStatusAus(st.projektdatei.umfang ? dokumente.map((d) => d.status) : [], fassung, Date.now(), antrag) : { ...alt, fassung, ...(antrag ? { antrag } : {}) };
        if (!antrag) delete neu.antrag;
        if (!alt || JSON.stringify([alt.anzahl, alt.fassung, alt.antrag]) !== JSON.stringify([neu.anzahl, neu.fassung, neu.antrag]) || neu.zeit - alt.zeit > 60_000) {
          const projektStatus = { ...st.projektStatus, [k]: neu };
          schreiben(PROJEKTSTATUS, projektStatus);
          set({ projektStatus });
        }
      }
    },

    fassungWaehlen: async (name, anlegen = false) => {
      const { ds, projekt, basis } = ctx();
      if (!ds || !projekt) return;
      try {
        // ohne Projektordner entsteht kein Ordner – dann nur die aktive Fassung
        const ordnerAngelegt = anlegen && !!basis;
        if (ordnerAngelegt) await ds.ordnerAnlegen(basis, `${wirksameEinstellungen(get(), projekt).antragsordner}/${name}`);
        // inzwischen ein anderes Projekt: der Ordner bleibt im bisherigen, aktiv wird dort nichts
        if (anderesProjekt(projekt)) {
          meldung(
            'info',
            ordnerAngelegt
              ? `Ordner ${name} in ${projekt.ordner} angelegt, aber nicht als aktive Antragsfassung gespeichert – inzwischen ist ein anderes Projekt offen.`
              : `Antragsfassung ${name} in ${projekt.ordner} nicht gespeichert – inzwischen ist ein anderes Projekt offen.`,
          );
          return;
        }
        // Dialog abgebrochen: der Ordner ist schon da, nur die aktive Fassung fehlt – das sagen statt „Änderung nicht gespeichert“
        const info: SchreibInfo = ordnerAngelegt
          ? {
              beiAbbruch: (art) =>
                meldung('info', `Ordner ${name} angelegt, aber nicht als aktive Antragsfassung gespeichert – ${art === 'oap' ? 'keine Projektdatei angelegt' : 'kein Projektordner zugeordnet'}.`),
            }
          : {};
        await projektdateiSchreiben({ ...(get().projektdatei ?? {}), aktiveFassung: name }, projekt, { info });
        if (anderesProjekt(projekt)) return;
        await get().laden();
        // ist ein Dialog offen (Projektordner, Projektdatei), wird die Fassung erst danach aktiv – dann nichts melden
        if (anlegen && !info.dialog) meldung('info', `Neue Antragsfassung ${name} angelegt – sie ist jetzt das Ziel des Exports.`);
      } catch (e) {
        fehler(`Antragsfassung ${name}`, e);
      }
    },

    umfangSetzen: async (umfang, o = {}) => {
      const info: SchreibInfo = o.info ?? {};
      // eingereicht bzw. ein Antrag wird gerade geöffnet: nichts ändern – mit Meldung und dem Grund für den Aufrufer
      const g = sperrGrund(true);
      if (g) {
        meldung('info', sperrMeldung(g, 'Antragsumfang nicht geändert'));
        return Object.assign(info, g, g.vorab === 'fassung' ? { erneut: true } : {});
      }
      try {
        const projekt = useFormulare.getState().projekt;
        const neu: ProjektDatei = { ...(get().projektdatei ?? {}) };
        if (umfang) neu.umfang = umfang;
        else delete neu.umfang;
        const imStore = await projektdateiSchreiben(neu, undefined, { info, bewegt: o.bewegt });
        // festgelegt, während woanders inzwischen schon einer festgelegt war (so beim Zusammenführen bemerkt): der
        // bleibt – die Meldung sagt, wo, wenn inzwischen ein anderes Projekt bzw. eine andere Projektdatei offen ist;
        // „jetzt geladen“ nur, wenn der Store noch diese Projektdatei in derselben Fassung zeigt
        if (info.umfangBehalten) {
          delete info.geschrieben;
          info.grund = 'inzwischen ist schon einer festgelegt';
          if (projekt && useFormulare.getState().projekt !== projekt) {
            meldung('info', `Antragsumfang in ${projekt.ordner} nicht festgelegt – dort ist inzwischen schon einer festgelegt; jetzt ist ein anderes Projekt offen.`);
          } else if (!imStore) {
            // nur bei einer wirklich anderen, gelesenen Projektdatei – ist sie nicht lesbar, bleibt deren Fehlermeldung stehen
            const jetzt = oapSchluessel();
            if (info.oap && jetzt && jetzt !== info.oap)
              meldung('info', `Antragsumfang in ${nurName(info.oap.slice(info.oap.indexOf('|') + 1))} nicht festgelegt – dort ist inzwischen schon einer festgelegt; jetzt ist eine andere Projektdatei gewählt.`);
          } else {
            const angezeigt = get().projektdatei?.ansicht;
            if (neu.ansicht && angezeigt && angezeigt !== neu.ansicht)
              meldung('info', `Antragsumfang für Antrag ${neu.ansicht} nicht festgelegt – für diesen ist inzwischen schon einer festgelegt. Angezeigt wird jetzt Antrag ${angezeigt}, die aktive Antragsfassung.`);
            else meldung('info', 'Antragsumfang nicht festgelegt – inzwischen ist schon einer festgelegt; er ist jetzt geladen.');
          }
        }
        await get().aktualisieren();
      } catch (e) {
        info.grund = e instanceof Error ? e.message : String(e);
        info.erneut = true;
        fehler('Antragsumfang nicht gespeichert', e);
      }
      return info;
    },

    verknuepfen: async (umfangId, name, o = {}) => {
      const projekt = useFormulare.getState().projekt;
      if (!projekt) return { grund: 'Kein Projekt offen' };
      // verknüpft wird für die festgehaltene Fassung (die des Ordners), sonst für die aktive
      const fassung = o.ansicht ?? aktiveFassung(get(), projekt);
      return get().umfangAendern(
        (umfang) =>
          umfang.map((u) => {
            if (u.id !== umfangId) return u;
            const dateien = { ...u.dateien };
            if (name) dateien[fassung] = name;
            else delete dateien[fassung];
            return { ...u, dateien };
          }),
        { was: 'Nicht verknüpft', ...o, eintrag: umfangId },
      );
    },

    dateiAufnehmen: async (name, o) => {
      const projekt = useFormulare.getState().projekt;
      if (!projekt) return { grund: 'Kein Projekt offen' };
      const fassung = o.ansicht ?? aktiveFassung(get(), projekt);
      const id = `u${Date.now().toString(36)}`;
      const eintrag: UmfangEintrag = { id, titel: o.titel, art: 'extern', ...(o.nr ? { nr: o.nr } : {}), dateien: { [fassung]: name } };
      // im angezeigten Stand schon mit einem Dokument verknüpft (etwa nach einem doppelten Klick): kein zweites, nichts
      // schreiben – das sagen; ein anderer Arbeitsplatz, dessen Stand noch nicht geladen ist, wird hier nicht erkannt
      const pd = get().projektdatei;
      const schon = pd?.ansicht === fassung ? pd.umfang?.find((u) => u.dateien?.[fassung]?.toLowerCase() === name.toLowerCase()) : undefined;
      if (schon) {
        meldung('info', `Nicht aufgenommen – „${name}“ ist schon mit „${schon.titel}“ verknüpft.`);
        return { grund: `schon mit „${schon.titel}“ verknüpft` };
      }
      const info = await get().umfangAendern((umfang) => [...umfang, eintrag], { was: 'Nicht aufgenommen', ansicht: o.ansicht, titel: o.titel });
      // gesagt wird es nur, wenn er jetzt im Antragsumfang steht – in diesem Projekt und dieser Fassung
      const st = get().projektdatei;
      if (info.geschrieben && useFormulare.getState().projekt === projekt && st?.ansicht === fassung && st.umfang?.some((u) => u.id === id))
        meldung('info', `„${o.titel}“ in den Antragsumfang von ${fassung} aufgenommen – verknüpft mit „${name}“.`);
      return info;
    },

    umfangAendern: async (aendern, o = {}) => {
      const pd = get().projektdatei;
      // die Prüfung nach dem Schreiben gilt nur für dasselbe Projekt und dieselbe Projektdatei
      const projektVorher = useFormulare.getState().projekt;
      const oapVorher = oapSchluessel();
      // erst feststellen, ob es noch geht – dann der Grund daraus: nicht, während ein Antrag geöffnet wird; sonst nur in
      // der festgehaltenen Fassung (die dann angezeigt und aktiv ist) und nur, wenn es den Eintrag noch gibt
      const umfang = pd?.umfang;
      const wechsel = wechselLaeuft(get(), useFormulare.getState().projekt);
      // eine andere Fassung angezeigt: das ist der Grund (auch wenn sie keinen Antragsumfang hat) – nur, wenn bekannt
      // ist, welche (gleich nach einem Projektwechsel gibt es noch keine Ansicht: dann „kein Antragsumfang“)
      const vorab: SchreibInfo['vorab'] = wechsel
        ? 'fassung'
        : o.ansicht !== undefined && pd?.ansicht !== undefined && pd.ansicht !== o.ansicht
          ? 'fassung'
          : !umfang
            ? 'umfang'
            : o.eintrag && !umfang.some((x) => x.id === o.eintrag)
              ? 'eintrag'
              : undefined;
      if (vorab || !umfang) {
        const grund = wechsel
          ? `Antrag ${wechsel} wird gerade geöffnet`
          : vorab === 'fassung'
            ? `inzwischen ist Antrag ${pd?.ansicht} angezeigt`
            : vorab === 'eintrag'
              ? `der Eintrag ${o.titel ? `„${o.titel}“ ` : ''}ist inzwischen nicht mehr im Antragsumfang`
              : 'inzwischen gibt es keinen Antragsumfang mehr';
        if (!o.still) meldung('info', `${o.was ?? 'Antragsumfang nicht geändert'} – ${grund}${wechsel ? '; bitte gleich noch einmal versuchen' : ''}.`);
        return Object.assign(o.info ?? {}, { grund, vorab: vorab ?? 'umfang' }, wechsel ? { erneut: true } : {});
      }
      const neu = aendern(umfang);
      const info = await get().umfangSetzen(neu, { info: o.info, bewegt: o.verschoben ? o.eintrag : undefined });
      // inzwischen woanders entfernt bzw. aufgehoben (beim Schreiben gelesen): die Änderung kam nicht hinein, er kommt
      // auch nicht zurück – das sagen; für die Aufrufer gilt es als nicht gespeichert
      const st = get().projektdatei;
      if (info.geschrieben && neu && st?.ansicht === pd?.ansicht && useFormulare.getState().projekt === projektVorher && oapSchluessel() === oapVorher) {
        const weg = !st?.umfang ? 'umfang' : o.eintrag && neu.some((x) => x.id === o.eintrag) && !st.umfang.some((x) => x.id === o.eintrag) ? 'eintrag' : null;
        if (weg) {
          const grund = weg === 'umfang' ? 'inzwischen gibt es keinen Antragsumfang mehr' : `der Eintrag ${o.titel ? `„${o.titel}“ ` : ''}ist inzwischen nicht mehr im Antragsumfang`;
          if (!o.still) meldung('info', `${o.was ?? 'Antragsumfang nicht geändert'} – ${grund}.`);
          delete info.geschrieben;
          return Object.assign(info, { grund, vorab: weg });
        }
      }
      return info;
    },

    exportieren: async (formularPfad, ziel, ersetzen) => {
      const { ds, projekt, basis } = ctx();
      if (!ds || !projekt || !basis || gesperrt(false)) return null;
      try {
        const pdf = await pdfVon(projekt, formularPfad);
        const pfad = `${ziel.ordner ? `${ziel.ordner}/` : ''}${ziel.name}`;
        const da = await ds.lies(basis, pfad).catch(() => null);
        if (da && !ersetzen) throw new Error(`${ziel.name} gibt es in ${ziel.ordner || 'diesem Ordner'} schon`);
        if (da) await ds.dokumentErsetzen(basis, pfad, pdf);
        else await ds.dokumentAnlegen(basis, pfad, pdf);
        log.info(`Exportiert: ${formularPfad} → ${verbinde(basis, pfad)}`);
        // im Ordner der aktiven Fassung: mit dem Dokument des Antragsumfangs verknüpfen
        const st = get();
        const umfang = st.projektdatei?.umfang;
        const doc = st.dokumente.find((d) => d.formular?.pfad === formularPfad);
        if (umfang && doc && ziel.ordner === antragsOrdner(st, projekt) && !wechselLaeuft(st, projekt)) {
          const fassung = aktiveFassung(st, projekt);
          await get().umfangSetzen(
            umfang.map((u) => (u.id === doc.eintrag.id ? { ...u, formularDatei: formularSchluessel(formularPfad), dateien: { ...u.dateien, [fassung]: ziel.name } } : u)),
          );
        } else await get().aktualisieren();
        meldung('info', `Als PDF exportiert: ${pfad}`);
        return verbinde(basis, pfad);
      } catch (e) {
        fehler('PDF-Export', e);
        return null;
      }
    },

    speichernUnter: async (formularPfad) => {
      const { projekt, basis } = ctx();
      if (!projekt) return false;
      try {
        const pdf = await pdfVon(projekt, formularPfad);
        const v = exportVorschlag(formularPfad);
        const ordner = basis ? verbinde(basis, zielOrdner(get(), projekt)) : null;
        const ok = await saveBinaryFile({ defaultName: v.name, defaultDir: ordner, data: pdf, filterName: 'PDF', extension: 'pdf', mime: 'application/pdf' });
        if (ok) {
          meldung('info', `${v.name} gespeichert.`);
          void get().aktualisieren();
        }
        return ok;
      } catch (e) {
        fehler('Speichern unter', e);
        return false;
      }
    },

    vorlagenAuflisten: async () => {
      const s = useFormulare.getState();
      const ds = s.ds;
      if (!ds) return [];
      const liste = async (root: string, ordner: string, herkunft: string): Promise<Vorlage[]> =>
        (await ds.liste(ordner ? verbinde(root, ordner) : root, 1).catch(() => [] as Eintrag[]))
          .filter((e) => !e.ordner && /\.frmsjf$/i.test(e.pfad))
          .map((e) => ({ root, pfad: ordner ? `${ordner}/${e.pfad}` : e.pfad, datei: e.pfad, name: anzeigeName(ohneEndung(e.pfad)), herkunft, geaendert: e.geaendert ?? 0 }));
      const vorlagenordner = get().einstellungen.vorlagenordner.trim();
      const andere = s.projekte.filter((p) => !(p.root === s.projekt?.root && p.ordner === s.projekt?.ordner));
      const alle = [
        ...(vorlagenordner ? await liste(vorlagenordner, '', 'Vorlagenordner') : []),
        ...(await Promise.all(andere.map((p) => liste(p.root, p.ordner, `Projekt ${p.ordner}`)))).flat(),
      ];
      // je Formular (Name ohne Nummer und Jahr) eine: aus dem Vorlagenordner, sonst die neueste
      const je = new Map<string, Vorlage>();
      for (const v of alle) {
        const k = v.name.toLowerCase();
        const da = je.get(k);
        const rang = (x: Vorlage) => (x.herkunft === 'Vorlagenordner' ? 1 : 0);
        const besser = !da || rang(v) > rang(da) || (rang(v) === rang(da) && v.geaendert > da.geaendert);
        if (besser) je.set(k, v);
      }
      return [...je.values()].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
    },

    formularHinzufuegen: async (v, inUmfang) => {
      const s = useFormulare.getState();
      const { ds, projekt } = ctx();
      if (!ds || !projekt || gesperrt(true, 'Formular nicht hinzugefügt')) return null;
      try {
        const bytes = await ds.lies(v.root, v.pfad);
        if (!bytes) throw new Error(`${v.datei} nicht gefunden`);
        if (nichtAngelegt(v.name, projekt)) return null;
        const name = neuerName(v.datei, s.formulare);
        // im Sammelprojekt in den Unterordner des Antrags, der jetzt angezeigt ist (auch wenn danach ein anderer aktiv wird)
        const fassung = get().projektdatei?.ansicht;
        const pfad = `${formularOrdner(useFormulare.getState(), projekt, fassung)}/${name}`;
        const schluessel = formularSchluessel(pfad);
        const neu = await mitAutofill(geleert(bytes), projekt);
        if (nichtAngelegt(v.name, projekt)) return null;
        // noch im eigenen Projekt: aufnehmen nur, wenn es einen Antragsumfang gibt – in den der angezeigten Fassung
        const aufnehmen = inUmfang && !!get().projektdatei?.umfang;
        await ds.formularAnlegen(projekt.root, pfad, neu.bytes);
        log.info(`Formular angelegt: ${pfad} (Vorlage: ${v.herkunft}, ${v.pfad})`);
        if (angelegtImAnderen(name, projekt, aufnehmen ? ', aber nicht in den Antragsumfang aufgenommen und nicht geöffnet' : ', aber nicht geöffnet')) return null;
        if (neu.zustand) await get().zustaendeSetzen({ [schluessel]: neu.zustand });
        // den Antragsumfang erst jetzt lesen (er kann sich inzwischen geändert haben) – und nur in dieselbe Fassung
        const info: SchreibInfo =
          aufnehmen && !anderesProjekt(projekt)
            ? await get().umfangAendern((umfang) => [...umfang, { id: `u${Date.now().toString(36)}`, titel: v.name, art: 'intern', formular: v.name, formularDatei: schluessel }], { ansicht: fassung, still: true })
            : {};
        await useFormulare.getState().formulareNeuLesen();
        const was = !aufnehmen ? ', aber nicht geöffnet' : info.geschrieben ? ' und in den Antragsumfang aufgenommen, aber nicht geöffnet' : ', aber nicht in den Antragsumfang aufgenommen und nicht geöffnet';
        if (angelegtImAnderen(name, projekt, was)) return null;
        const eintrag = useFormulare.getState().formulare.find((f) => f.pfad === pfad);
        if (eintrag) await useFormulare.getState().formularOeffnen(eintrag);
        // im selben Projekt nicht gespeichert (Projektdatei nicht lesbar): angelegt ist es – das Aufnehmen nachholen
        // im selben Projekt nicht aufgenommen: der Grund – und wo es nachzuholen ist, wenn das noch geht
        const nicht = aufnehmen && !info.geschrieben && !info.dialog;
        const nachholen = !nicht
          ? ''
          : info.vorab === 'umfang'
            ? ` – ${klein(info.grund!)}`
            : `, aber nicht in den Antragsumfang aufgenommen – ${klein(info.grund ?? 'nicht gespeichert')}. Bitte später in den Antragsdaten${info.vorab === 'fassung' ? ` von ${fassung}` : ''} über „Dokument hinzufügen“ nachholen`;
        meldung(nicht && info.vorab !== 'umfang' ? 'fehler' : 'info', `„${name}“ aus ${v.herkunft} angelegt${befuellt(neu.zustand)}${nachholen}.`);
        return pfad;
      } catch (e) {
        fehler(`Formular „${v.name}“ hinzufügen`, e);
        return null;
      }
    },

    zustaendeSetzen: async (neu) => {
      const zusammen = (alt: Zustaende | undefined): Zustaende => {
        const z = { ...alt };
        for (const [datei, fz] of Object.entries(neu)) {
          if (Object.keys(fz.felder).length || fz.ignorieren) z[datei] = fz;
          else delete z[datei];
        }
        return z;
      };
      const pd = get().projektdatei ?? {};
      // während ein Antrag geöffnet wird, gehört die Ansicht noch zum bisherigen – dann nur in die Datei (beim aktiven)
      if (!wechselLaeuft(get(), useFormulare.getState().projekt)) set({ projektdatei: { ...pd, felder: zusammen(pd.felder) } });
      const f = useFormulare.getState();
      if (!f.ds || !f.projekt || !ablageVon(f, f.projekt)) return;
      if (f.oap === null) await f.oapLaden();
      const o = useFormulare.getState().oap;
      // ohne Projektdatei gilt der Zustand nur bis zum Neuladen – kein Dialog dafür; inzwischen anderes Projekt: nichts
      if (!o || o === 'fehlt' || useFormulare.getState().projekt !== f.projekt) return;
      try {
        // der aktive Antrag – auch, während er geöffnet wird (nicht der noch angezeigte bisherige)
        const fassung = aktiveFassung(get(), f.projekt);
        await useFormulare.getState().oapAendern((roh) => {
          const a = abschnittAus(roh.formulare ?? (roh.erweiterungen as Record<string, unknown> | undefined)?.formulare, (roh.meta as { merkmale?: Record<string, string> } | undefined)?.merkmale);
          const { pd: frisch } = ansichtVon(a, fassung, () => neuAusVorgaben());
          return mitAbschnitt(roh, { ...frisch, felder: zusammen(frisch.felder) });
        });
      } catch (e) {
        log.warn(`Autofill-Zustand nicht in die Projektdatei geschrieben: ${e instanceof Error ? e.message : String(e)}`);
      }
    },

    formularAnlegen: async (umfangId, o = {}) => {
      const s = useFormulare.getState();
      const { ds, projekt } = ctx();
      // aus einem lange offenen Menü: inzwischen eine andere Fassung – dann nicht für deren gleichnamigen Eintrag
      if (o.ansicht !== undefined && get().projektdatei?.ansicht !== o.ansicht) {
        meldung('info', `Formular nicht angelegt – inzwischen ist Antrag ${get().projektdatei?.ansicht} angezeigt.`);
        return null;
      }
      const u = get().projektdatei?.umfang?.find((x) => x.id === umfangId);
      if (!ds || !projekt || !u) {
        meldung('fehler', 'Formular anlegen: kein Projekt bzw. kein Eintrag im Antragsumfang – bitte das Projekt neu laden.');
        return null;
      }
      if (gesperrt(true, 'Formular nicht angelegt') || anlegenLaeuft.has(umfangId)) return null;
      anlegenLaeuft.add(umfangId);
      // zugeordnet wird im Antragsumfang dieser Fassung
      const fassung = get().projektdatei?.ansicht;
      // die Suche kann bei vielen Projekten dauern – sofort sagen, was passiert
      meldung('info', `Suche eine Vorlage für „${u.titel}“ …`);
      try {
        const vorlage = await vorlageSuchen(u);
        if (!vorlage) throw new Error(`Keine Vorlage für „${u.titel}“ gefunden – bitte in den Einstellungen einen Vorlagenordner mit leeren Formularen angeben`);
        if (nichtAngelegt(u.titel, projekt)) return null;
        const name = neuerName(vorlage.name, s.formulare);
        // im Sammelprojekt in den Unterordner des Antrags, für den angelegt wird (beim Klick festgehalten – die
        // Vorlagensuche kann dauern, inzwischen kann ein anderer aktiv sein)
        const pfad = `${formularOrdner(useFormulare.getState(), projekt, fassung)}/${name}`;
        const schluessel = formularSchluessel(pfad);
        const neu = await mitAutofill(geleert(vorlage.bytes), projekt);
        if (nichtAngelegt(u.titel, projekt)) return null;
        await ds.formularAnlegen(projekt.root, pfad, neu.bytes);
        log.info(`Formular angelegt: ${pfad} (Vorlage: ${vorlage.herkunft})`);
        if (angelegtImAnderen(name, projekt, ', aber nicht zugeordnet und nicht geöffnet')) return null;
        if (neu.zustand) await get().zustaendeSetzen({ [schluessel]: neu.zustand });
        // den Antragsumfang erst jetzt lesen – zugeordnet wird nur in derselben Fassung, die den Eintrag noch hat
        const info: SchreibInfo = !anderesProjekt(projekt)
          ? await get().umfangAendern((umfang) => umfang.map((x) => (x.id === u.id ? { ...x, formularDatei: schluessel } : x)), { ansicht: fassung, eintrag: u.id, still: true })
          : {};
        await useFormulare.getState().formulareNeuLesen();
        if (angelegtImAnderen(name, projekt, info.geschrieben ? ` und „${u.titel}“ zugeordnet, aber nicht geöffnet` : ', aber nicht zugeordnet und nicht geöffnet')) return null;
        const eintrag = useFormulare.getState().formulare.find((f) => f.pfad === pfad);
        if (eintrag) await useFormulare.getState().formularOeffnen(eintrag);
        // im selben Projekt nicht gespeichert (Projektdatei nicht lesbar): angelegt ist es – das Zuordnen nachholen
        if (info.geschrieben) {
          meldung('info', `„${name}“ aus ${vorlage.herkunft} angelegt${neu.zustand ? `, „${u.titel}“ zugeordnet${befuellt(neu.zustand)}` : ` (leer) und „${u.titel}“ zugeordnet`}.`);
        } else if (info.dialog) {
          meldung('info', `„${name}“ aus ${vorlage.herkunft} angelegt${befuellt(neu.zustand)}.`);
        } else if (info.vorab === 'eintrag' || info.vorab === 'umfang') {
          // den Eintrag gibt es nicht mehr – zuzuordnen ist nichts
          meldung('info', `„${name}“ aus ${vorlage.herkunft} angelegt${befuellt(neu.zustand)} – ${info.vorab === 'eintrag' ? `der Eintrag „${u.titel}“ ist inzwischen nicht mehr im Antragsumfang` : klein(info.grund!)}.`);
        } else {
          // findet die Zeile (die Formulare gelten fürs ganze Projekt) es ohnehin über den Namen, ist nichts nachzuholen –
          // „Zuordnen“ gibt es dort dann auch nicht; findet sie ein anderes, führt nur der Weg über die Navigation hin
          const gefunden = formularVon(u, useFormulare.getState().formulare);
          const in_ = info.vorab === 'fassung' ? ` in ${fassung}` : '';
          if (gefunden?.pfad === pfad) meldung('info', `„${name}“ aus ${vorlage.herkunft} angelegt${befuellt(neu.zustand)} – „${u.titel}“${in_} findet es über den Namen.`);
          else
            meldung(
              'fehler',
              `„${name}“ aus ${vorlage.herkunft} angelegt${befuellt(neu.zustand)}, aber nicht zugeordnet – ${klein(info.grund ?? 'nicht gespeichert')}. ${
                gefunden
                  ? `Bitte später ${in_ ? `zu Antrag ${fassung} wechseln und ` : ''}per Rechtsklick auf „${name.replace(/\.frmsjf$/i, '')}“ in der Navigation › „Antragsdokument“ › „${u.titel}“ zuordnen.`
                  : `Bitte später in den Antragsdaten${in_ ? ` von ${fassung}` : ''} über „Zuordnen“ nachholen.`
              }`,
            );
        }
        return pfad;
      } catch (e) {
        fehler(`Formular für „${u.titel}“ anlegen`, e);
        return null;
      } finally {
        anlegenLaeuft.delete(umfangId);
      }
    },
  };
});

/** Ansicht und aktive Fassung, für die `aktualisieren` zuletzt neu laden ließ (nur einmal je Paar – keine Schleife) */
let heilung: string | null = null;

/** Formulare, die gerade angelegt werden (je Eintrag des Antragsumfangs) – ein zweiter Klick legt kein zweites an */
const anlegenLaeuft = new Set<string>();

/*
 * Innerhalb derselben Fassung gelten die gelesenen Dateien weiter: ändert sich die Projektdatei (Speichern, von außen),
 * werden die Zeilen gleich neu berechnet – sonst zeigten sie bis zum Ende des Neu-Prüfens (Netz) den alten Umfang, und
 * Ziehen bzw. ↑/↓ gingen von Stellen aus, die es so nicht mehr gibt. Während eines Wechsels bleibt es beim Neu-Prüfen.
 */
useAntrag.subscribe((s, vorher) => {
  if (s.projektdatei !== vorher.projektdatei && s.projektdatei && s.dokumenteFuer !== null && !wechselLaeuft(s, useFormulare.getState().projekt)) s.neuBerechnen();
});

autofillAnbindung.zustand = (datei) => useAntrag.getState().projektdatei?.felder?.[datei];
sperrAnbindung.antrag = (p) => (p && p === useFormulare.getState().projekt ? antragSperre(useAntrag.getState(), p) : null);

/*
 * Sammelprojekt: die Formulare kommen aus dem Unterordner des aktiven Antrags – bekannt erst, wenn die Angaben dieses
 * Projekts geladen sind (vorher nur der Stammordner). Wird ein anderer Antrag aktiv, liest die Liste neu.
 */
const unterordnerWahl = (p: Projekt) => {
  const st = useAntrag.getState();
  if (!st.projektdatei || p !== useFormulare.getState().projekt) return undefined;
  return { fassung: aktiveFassung(st, p), arten: antragsarten(wirksameEinstellungen(st, p)), antragsarten: namensschema().antragsarten };
};
unterordnerAnbindung.wahl = unterordnerWahl;
let unterordnerFuer: string | null = null;
useAntrag.subscribe((s) => {
  const p = useFormulare.getState().projekt;
  const fuer = p && s.projektdatei ? `${projektSchluessel(p)}|${aktiveFassung(s, p)}` : null;
  if (fuer === unterordnerFuer) return;
  unterordnerFuer = fuer;
  if (fuer) void useFormulare.getState().formulareNeuLesen();
});
autofillAnbindung.speichern = (datei, z) => void useAntrag.getState().zustaendeSetzen({ [datei]: z });

/* ---------- Export ---------- */

/** PDF eines Formulars des Projekts – mit allen Eingaben, auch den noch nicht gespeicherten */
export async function pdfVon(projekt: Projekt, pfad: string): Promise<Uint8Array> {
  const eintrag = formularEintrag(pfad);
  const { formular, felder } = await formularLesen(projekt, pfad, eintrag);
  const { wert } = werteVon(projekt, pfad);
  return formularPdf(formular, felder, wert, { titel: `${projekt.ordner} – ${anzeigeName(ohneEndung(nurName(pfad)))}` });
}

/** Vorschlag für den Export: Zielordner und Dateiname nach den Einstellungen */
export function exportVorschlag(formularPfad: string, datum = new Date()): ExportZiel {
  const s = useFormulare.getState();
  const st = useAntrag.getState();
  const projekt = s.projekt;
  const e = wirksameEinstellungen(st, projekt);
  const info = st.formularInfo[formularPfad];
  const doc = st.dokumente.find((d) => d.formular?.pfad === formularPfad);
  const formularName = ohneEndung(nurName(formularPfad));
  const name = dateiname(e.namensvorlage, {
    kuerzel: projekt?.ordner ?? '',
    phase: e.phase,
    datum,
    nr: doc?.eintrag.nr,
    name: doc?.eintrag.titel ?? anzeigeName(formularName),
    formular: formularName,
    antrag: aktiveFassung(st, projekt),
    art: artVonFassung(st, projekt, aktiveFassung(st, projekt)),
    kennung: info?.kennung ?? undefined,
    stand: info?.stand ?? undefined,
  });
  return { ordner: zielOrdner(st, projekt), name: `${name}.pdf` };
}

/* ---------- Formular anlegen ---------- */

/**
 * Vorlage für ein fehlendes Formular: zuerst im Vorlagenordner, sonst das neueste passende Formular aus einem
 * anderen FORMA-Projekt (seine Eingaben werden beim Anlegen geleert).
 */
async function vorlageSuchen(u: UmfangEintrag): Promise<{ name: string; bytes: Uint8Array; herkunft: string } | null> {
  const s = useFormulare.getState();
  const ds = s.ds!;
  const st = useAntrag.getState();
  const muster = u.formular || u.titel;
  const kandidaten = async (root: string, ordner: string) => {
    const liste = await ds.liste(ordner ? verbinde(root, ordner) : root, 1).catch(() => [] as Eintrag[]);
    return liste.filter((e) => !e.ordner && /\.frmsjf$/i.test(e.pfad)).map((e) => ({ ...e, root, rel: ordner ? `${ordner}/${e.pfad}` : e.pfad }));
  };
  const passend = async (liste: Awaited<ReturnType<typeof kandidaten>>) => {
    // Name genügt; sonst die Kennung im Kopf des Formulars
    const nachName = liste.filter((e) => passt(ohneEndung(e.pfad), muster));
    if (nachName.length) return nachName;
    const out: typeof liste = [];
    for (const e of liste) {
      const b = await ds.lies(e.root, e.rel).catch(() => null);
      try {
        if (b && kennung(parseFormular(b))?.toLowerCase() === muster.toLowerCase()) out.push(e);
      } catch {
        // keine FORMA-Datei
      }
    }
    return out;
  };
  const neueste = <T extends Eintrag>(l: T[]) => l.reduce<T | null>((b, e) => (!b || (e.geaendert ?? 0) > (b.geaendert ?? 0) ? e : b), null);

  if (st.einstellungen.vorlagenordner.trim()) {
    const v = neueste(await passend(await kandidaten(st.einstellungen.vorlagenordner.trim(), '')));
    const b = v && (await ds.lies(v.root, v.rel));
    if (v && b) return { name: v.pfad, bytes: b, herkunft: 'dem Vorlagenordner' };
  }
  // in den anderen Projekten nur nach dem Namen – jedes Formular aller Projekte zu öffnen, um die Kennung zu lesen,
  // dauerte bei vielen Projekten Minuten (und sah aus, als passiere nichts)
  const andere = s.projekte.filter((p) => !(p.root === s.projekt?.root && p.ordner === s.projekt?.ordner));
  const alle = (await Promise.all(andere.map((p) => kandidaten(p.root, p.ordner)))).flat();
  const v = neueste(alle.filter((e) => passt(ohneEndung(e.pfad), muster)));
  const b = v && (await ds.lies(v.root, v.rel));
  return v && b ? { name: v.pfad, bytes: b, herkunft: `Projekt ${v.rel.split('/')[0]}` } : null;
}

/** Name im Projekt: mit der nächsten laufenden Nummer, wenn die Formulare des Projekts so heißen („006-…“) */
export function neuerName(vorlage: string, formulare: FormularEintrag[]): string {
  const nummern = formulare.map((f) => /^(\d+)\s*-/.exec(f.name)?.[1]).filter((n): n is string => !!n);
  const rest = vorlage.replace(/^\s*\d+\s*-\s*/, '');
  let name = rest;
  if (nummern.length) {
    const stellen = Math.max(...nummern.map((n) => n.length));
    name = `${String(Math.max(...nummern.map(Number)) + 1).padStart(stellen, '0')}-${rest}`;
  }
  const vorhanden = new Set(formulare.map((f) => `${f.name}.frmsjf`.toLowerCase()));
  let kandidat = name;
  for (let i = 2; vorhanden.has(kandidat.toLowerCase()); i++) kandidat = name.replace(/\.frmsjf$/i, ` (${i}).frmsjf`);
  return kandidat;
}

/* ---------- mit dem Formulare-Store verbinden ---------- */

let verzoegert: ReturnType<typeof setTimeout> | undefined;
type OapStand = ReturnType<typeof useFormulare.getState>['oap'];
/** Was die Erkennung von Antragsordnern und Plänen bestimmt: Namensschema der Projektdatei und Zahl der Geschosse */
const schemaDerProjektdatei = (o: Exclude<OapStand, 'fehlt' | null>) => JSON.stringify([o.projekt.namensschema ?? null, o.projekt.storeys.length]);
useFormulare.subscribe((s, vorher) => {
  // Namensschema des Büros (gemeinsame Einstellungen) oder das bzw. die Geschosse derselben Projektdatei geändert:
  // Antragsordner und Plansätze neu erkennen – nicht erst beim nächsten Takt. Eine neu gewählte oder eben angelegte
  // Projektdatei laden die Zweige unten bzw. der Aufrufer.
  // (die Projektdatei wird nur verglichen, wenn sie sich geändert hat – nicht bei jedem Tastendruck)
  const dieselbe = s.oap !== vorher.oap && s.oap && s.oap !== 'fehlt' && vorher.oap && vorher.oap !== 'fehlt' && s.oap.pfad === vorher.oap.pfad;
  const schemaNeu = s.namensschemaBuero !== vorher.namensschemaBuero || (!!dieselbe && schemaDerProjektdatei(s.oap as Exclude<OapStand, 'fehlt' | null>) !== schemaDerProjektdatei(vorher.oap as Exclude<OapStand, 'fehlt' | null>));
  if (s.projekt !== vorher.projekt || s.ablage !== vorher.ablage || s.ds !== vorher.ds) {
    zerlegt.clear();
    if (s.projekt !== vorher.projekt) {
      // die Sicherung gilt je Projekt neu
      heilung = null;
      useAntrag.setState({ projektdatei: null, fassungen: [], dateien: [], dateienLesefehler: false, dateienOrdner: null, quellen: {}, formularInfo: {}, dokumente: [], dokumenteFuer: null });
      quelleMerken(null);
    }
    void useAntrag.getState().laden();
  } else if (
    s.oap !== vorher.oap &&
    s.oap &&
    s.oap !== 'fehlt' &&
    (!vorher.oap ||
      (vorher.oap !== 'fehlt' && vorher.oap.pfad !== s.oap.pfad) ||
      // nach „nicht lesbar“ eine andere als die, aus der die Angaben stammen (umbenannt, neu, in der Projektkarte gewählt)
      (vorher.oap === 'fehlt' && projektdateiQuelle?.projekt === s.projekt && !!projektdateiQuelle.oap && projektdateiQuelle.oap !== oapSchluessel()))
  ) {
    // Projektdatei erstmals gelesen bzw. eine andere gewählt: neu laden (und neu binden) – dabei entstehen fehlende
    // Anträge (und werden ergänzt). Eine eben angelegte (vorher „fehlt“) lädt der Aufrufer selbst nach dem Speichern.
    void useAntrag.getState().laden();
  } else if (schemaNeu) {
    void useAntrag.getState().laden();
  } else if (s.oap !== vorher.oap) {
    // Projektdatei geändert (auch von einer anderen App): Abschnitt „formulare“ übernehmen
    const neu = abschnittAusOap();
    if (neu && JSON.stringify(neu) !== JSON.stringify(useAntrag.getState().projektdatei)) {
      useAntrag.setState({ projektdatei: neu });
      quelleMerken(s.projekt);
      void useAntrag.getState().aktualisieren();
    }
  } else if (s.formulare !== vorher.formulare || s.offen?.bytes !== vorher.offen?.bytes) {
    void useAntrag.getState().aktualisieren();
  } else if (s.offen !== vorher.offen || s.profile !== vorher.profile) {
    clearTimeout(verzoegert);
    verzoegert = setTimeout(() => useAntrag.getState().neuBerechnen(), 300);
  }
});
