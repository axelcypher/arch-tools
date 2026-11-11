import type { Point } from './geometry';
import type { Dach } from './roof';
import type { DachModell } from './roofMesh';

/**
 * Datenmodell eines Projekts. Alle Längen in Metern.
 *
 * Grundprinzip:
 *  - Je Geschoss werden BGF-Umrisse (kind "outline") gezeichnet → BGF und BRI.
 *  - Räume (kind "room") werden je Nutzungsgruppe nach DIN 277 erfasst → NUF/TF/VF = NRF.
 *  - Räume können zusätzlich mit einer Anrechnungskategorie nach WoFlV versehen werden → Wohnfläche.
 *  - Jede Fläche kann als Abzugsfläche markiert werden: Umriss z. B. Innenhof, Luftraum über Galerie;
 *    Raum z. B. Schornstein, Pfeiler, Schacht im Raum (Schornsteine und Schächte sind keine BGF-Abzüge).
 */

/** Raumumschließung nach DIN 277: Regelfall (R) oder Sonderfall (S, z. B. Balkon, Loggia). */
export type Raumumschliessung = 'R' | 'S';

export type Nutzungsgruppe = 'NUF1' | 'NUF2' | 'NUF3' | 'NUF4' | 'NUF5' | 'NUF6' | 'NUF7' | 'TF' | 'VF';

/** Anrechnung nach Wohnflächenverordnung (WoFlV § 4). */
export type WoflKategorie =
  | 'keine' // nicht Teil der Wohnfläche (z. B. Keller, Heizraum, Garage – § 2 Abs. 3)
  | 'voll' // lichte Höhe ≥ 2 m: 100 %
  | 'halb' // lichte Höhe ≥ 1 m und < 2 m: 50 %
  | 'null' // lichte Höhe < 1 m: 0 %
  | 'wintergarten' // unbeheizbare Wintergärten, Schwimmbäder u. ä.: 50 %
  | 'freisitz' // Balkone, Loggien, Dachgärten, Terrassen: i. d. R. 25 %, höchstens 50 %
  | 'individuell' // frei wählbarer Faktor
  | 'hoehen'; // Raumteile nach lichter Höhe (Teilflächen ≥ 2 m / 1–2 m / < 1 m, siehe WoflAngaben.anteile)

/** Anteile der Raumfläche nach lichter Höhe (Summe 1): ≥ 2 m (100 %), 1–2 m (50 %), < 1 m (0 %) */
export interface HoehenAnteile {
  h2: number;
  h12: number;
  h01: number;
}

export interface WoflAngaben {
  kategorie: WoflKategorie;
  /** nur bei "freisitz" (überschreibt Projektstandard) oder "individuell" */
  faktor?: number;
  /** nur bei "hoehen": Teilflächen als Anteile der Raumfläche (Wohnfläche = Fläche × (h2 + ½ h12), exakt) */
  anteile?: HoehenAnteile;
  /** Zuordnung zu einer Wohneinheit, z. B. "WE 01" */
  wohnung: string;
}

interface ShapeBase {
  id: string;
  name: string;
  points: Point[];
  /** Abzugsfläche: wird negativ gerechnet */
  subtract: boolean;
  umschliessung: Raumumschliessung;
  bemerkung?: string;
  /**
   * Höhenlage gegenüber dem Geschossfußboden in m (Split-Level): negativ = tiefer, positiv = höher.
   * Umriss („Höhenversatz Körper“): Der ganze Körper – Unterkante, Oberkante, Dach – wird um diesen Betrag
   * verschoben; seine Höhe (hoehe bzw. Geschosshöhe) bleibt.
   * Raum („Höhenlage Fußboden“): Ein Raum, der tiefer liegt als der Körper seines Umrisses, vergrößert den BRI
   * um Raumfläche × Absenkung.
   * Ohne Angabe liegt ein Raum auf dem Fußboden des Umrisses, in dem er liegt (bei abgesenktem Umriss also mit ihm).
   */
  versatz?: number;
  /** IFC-GlobalId der Quelle (Zone bzw. Geschoss) – für den erneuten Import */
  ifcId?: string;
  /** Werte, wie sie beim letzten IFC-Import kamen – erkennt beim erneuten Import, was seitdem von Hand geändert wurde */
  ifcStand?: IfcStand;
}

/**
 * Stand eines aus der IFC übernommenen Elements beim letzten Import (nur die aus der IFC stammenden Felder).
 * Beim erneuten Import gilt je Feld: unverändert seit dem Import → neuer Wert aus der IFC; von Hand geändert →
 * bleibt (siehe ifcAbgleich.ts).
 */
export type IfcStand = Record<string, unknown>;

export interface OutlineShape extends ShapeBase {
  kind: 'outline';
  /**
   * Körperhöhe für den BRI (Unter- bis Oberkante des Körpers, z. B. Galerie, Luftraum); sonst Geschosshöhe.
   * Bei Umschließung S (Balkon, Loggia, Dachterrasse) ausdrücklich anzugeben: Unterkante Überdeckung bzw.
   * Oberkante Umwehrung.
   */
  hoehe?: number;
  /** Bodenplatte des Geschosses auch unter diesem S-Umriss ansetzen (sonst nur unter R-Umrissen) */
  sohleAnsetzen?: boolean;
  /** Umriss ist zu prüfen (z. B. aus dem Geschoss darunter übernommen) */
  pruefen?: boolean;
  /** Lage der Beschriftung (Weltkoordinaten); ohne Angabe automatisch */
  stempel?: Point;
  /** Dach/oberer Abschluss: BRI dieses Umrisses = Volumen vom Fußboden bis zur Dachhaut */
  dach?: Dach;
  /**
   * GRZ-Nachweis: Gebäudeteil ist keine Hauptanlage, sondern Garage/Carport bzw. Nebenanlage (angebaut, aus der IFC) –
   * gerechnet als Anlage nach § 19 Abs. 4 BauNVO 1990 bzw. § 21a (1962–1977). Ohne Angabe: Hauptanlage.
   */
  anlage?: 'garage' | 'nebenanlage';
}

export interface RoomShape extends ShapeBase {
  kind: 'room';
  nummer: string;
  nutzung: Nutzungsgruppe;
  wofl: WoflAngaben;
  /** Abzug in % von der Polygonfläche, z. B. 3 % Putzabzug bei Ermittlung aus Rohbaumaßen */
  putzabzug?: number;
  /**
   * Raumumschließung von Hand festgelegt. Sonst gilt die des BGF-Umrisses, in dem der Raum liegt (ein gespeichertes
   * „S“ gilt immer als von Hand, weil Räume früher stets mit „R“ angelegt wurden).
   */
  rsVonHand?: boolean;
  /**
   * Nur Abzugsflächen: was sie mindern – NRF und Wohnfläche (Standard, z. B. Schornstein, Schacht im Raum), nur die
   * Wohnfläche (§ 3 Abs. 3 WoFlV, z. B. Treppe mit mehr als drei Steigungen) oder nur die NRF nach DIN 277.
   */
  abzugArt?: AbzugArt;
  /** Nutzungsart (zweite Ebene unter der Nutzungsgruppe, Nummer aus dem Katalog des Büros, z. B. „7.1“) */
  nutzungsart?: string;
  /** Bezeichnung des Katalogeintrags, aus dem Nutzung und Anrechnung stammen (Vorschlag „aus Katalog“) */
  katalog?: string;
  /** Lage des Raumstempels (Weltkoordinaten); ohne Angabe automatisch */
  stempel?: Point;
  /**
   * Aufenthaltsraum im Sinne der BauNVO vor 1990 (Geschossfläche in Nicht-Vollgeschossen, GRZ-Nachweis);
   * „treppe“ = zugehöriger Treppenraum. Ohne Angabe nach Nutzung und Raumname.
   */
  aufenthalt?: 'ja' | 'nein' | 'treppe';
}

/** Versiegelungsgrad einer Fläche im Lageplan */
export type Versiegelung = 'voll' | 'teil' | 'gruen';

/** Nutzung einer Fläche im Lageplan – maßgebend für die Anrechnung auf die Grundfläche */
export type LageplanNutzung = 'zufahrt' | 'stellplatz' | 'garage' | 'terrasse' | 'weg' | 'nebenanlage' | 'unterirdisch' | 'garten' | 'sonstige';

/** Fläche im Lageplan (Freifläche, Belag, Garage …) für GRZ und Flächenbilanz */
export interface LageplanFlaeche {
  id: string;
  name: string;
  points: Point[];
  nutzung: LageplanNutzung;
  versiegelung: Versiegelung;
  /** Fläche eines Nachbargrundstücks: nur Darstellung, zählt nirgends mit */
  nachbar?: boolean;
  /** mittlere Höhe der Oberfläche über ±0,00 in m (aus dem Modell) – für die Geländeoberfläche */
  hoehe?: number;
  /** GRZ-Nachweis: Fläche gehört nur zu dieser Variante („B“); ohne Angabe zu allen */
  variante?: string;
  /** Herkunft aus der IFC (GlobalId des Bauteils, ggf. mit Teilnummer) – für den erneuten Import */
  ifcId?: string;
  ifcStand?: IfcStand;
}

/**
 * Lageplan des Grundstücks. Gepflegt vom GRZ/GFZ-Nachweis; der Flächenrechner übernimmt ihn beim
 * IFC-Import (Geschoss „Lageplan“) und bewahrt ihn beim Speichern.
 */
export interface Lageplan {
  flaechen: LageplanFlaeche[];
  /** Grundstücksgrenze (Flurstücke) – maßgebend für die Grundstückslinie im Plan; fehlt: Umriss der erfassten Flächen */
  grenze?: GrundstuecksGrenze[];
  /** Unterlage zum Nachzeichnen (amtlicher Lageplan als Bild bzw. PDF-Seite), kalibriert in Metern */
  unterlage?: Background;
}

/** Flurstück bzw. Grundstück als Polygon (GRZ-Nachweis) */
export interface GrundstuecksGrenze {
  id: string;
  name: string;
  points: Point[];
}

/** Was eine Abzugsfläche im Raum mindert (siehe RoomShape.abzugArt) */
export type AbzugArt = 'beide' | 'wofl' | 'din';

export type Shape = OutlineShape | RoomShape;
export type ShapeKind = Shape['kind'];

interface BackgroundBase {
  name: string;
  /** Originaldatei (PDF, DXF) in Project.dateien – wird im Projektarchiv mitgespeichert */
  quelle?: string;
  /** Weltkoordinate des lokalen Ursprungs (Raster: linke obere Bildecke) */
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
}

/** Rasterbild (PNG/JPG oder gerenderte PDF-Seite). */
export interface RasterBackground extends BackgroundBase {
  type: 'raster';
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  metersPerPixel: number;
  /** Bei PDF-Seiten: Meter pro Pixel bei Maßstab 1:1 – erlaubt die Eingabe des Planmaßstabs */
  pdf?: { page: number; metersPerPixelAt1: number };
}

export interface DxfLayer {
  name: string;
  color: string;
  visible: boolean;
}

/** Linienzug in lokalen Koordinaten (DXF-Einheiten, y nach unten), flach: [x0, y0, x1, y1, …] */
export interface DxfPolyline {
  layer: number;
  pts: number[];
  closed: boolean;
  /** aus Bogen/Kreis/Ellipse entstanden (z. B. Türaufschlag) */
  arc?: boolean;
}

export interface DxfText {
  layer: number;
  x: number;
  y: number;
  h: number;
  /** Drehung in Grad (im Uhrzeigersinn, da y nach unten) */
  rot: number;
  text: string;
}

/** Vektorplan (DXF). Weltkoordinate = (x, y) + lokal × scale */
export interface VectorBackground extends BackgroundBase {
  type: 'vector';
  /** Meter je DXF-Zeichnungseinheit (mm → 0,001) */
  scale: number;
  /** Herkunft: DXF-Datei oder Geschossschnitt aus einem IFC-Modell */
  source?: 'dxf' | 'ifc';
  layers: DxfLayer[];
  polylines: DxfPolyline[];
  texts: DxfText[];
}

export type Background = RasterBackground | VectorBackground;

/** @deprecated Altname, nur für Kompatibilität */
export type BackgroundImage = RasterBackground;

export interface Storey {
  id: string;
  name: string;
  /**
   * Brutto-Geschosshöhe für den BRI: Fußboden bis Fußboden darüber bzw. OK Dach – Fußboden in derselben Bezugsebene
   * wie die Geschosskoten (i. d. R. OK Fertigfußboden)
   */
  hoehe: number;
  /** Höhe OK Fußboden über ±0,00 in m; ohne Angabe Summe der Geschosshöhen darunter */
  elevation?: number;
  /** Dach aus Modell: Rauminhalt höchstens bis zur Geschosshöhe (nicht bis unter die Dachhaut erweitern) */
  geschosshoeheBegrenzt?: boolean;
  /** Geschossart für Auswertung und Vorlagen; ohne Angabe automatisch (siehe istDachgeschoss) */
  dachgeschoss?: boolean;
  /**
   * Kellergeschoss (WoFlV: Räume darin i. d. R. Zubehör, keine Wohnfläche); ohne Angabe nach dem Geschossnamen
   * (siehe istKellergeschoss). Eine Souterrainwohnung steht in einem Geschoss mit keller = false.
   */
  keller?: boolean;
  /** Präfix der Raumnummern, z. B. „0“ → 0.01, „-1“ → -1.01; ohne Angabe aus dem Geschossnamen bzw. der Lage */
  nummernPraefix?: string;
  /** Dachaufbau bis zur Innenbekleidung (senkrecht zur Dachfläche gemessen) in m – für die lichte Höhe unter Schrägen */
  dachaufbau?: number;
  /** Fußbodenaufbau in m (nur nötig, wenn die Geschosskote auf dem Rohfußboden liegt) – für die lichte Höhe */
  fussbodenaufbau?: number;
  /** Vollgeschoss für GFZ und Zahl der Vollgeschosse (GRZ/GFZ-Nachweis); ohne Angabe nach der Bauordnung geprüft */
  vollgeschoss?: boolean;
  /**
   * Bodenplatte: Abstand UK Sohle bis zum Geschossfußboden in m. Der BRI rechnet ab der Unterseite der Sohle
   * (DIN 277) – für alle Teile des Geschosses, unter denen kein anderes Geschoss liegt.
   */
  sohle?: number;
  /** IFC-GlobalId des Geschosses (IfcBuildingStorey) – für den erneuten Import */
  ifcId?: string;
  /** Werte beim letzten IFC-Import (Name, Kote, Höhe, Sohle) */
  ifcStand?: IfcStand;
  shapes: Shape[];
  background?: Background;
}

export interface ProjectSettings {
  /** Rasterweite für den Fang in m */
  gridStep: number;
  /** Standardfaktor für Balkone/Terrassen nach WoFlV (0,25 … 0,5) */
  freisitzFaktor: number;
  /** Maßgrundlage der Flächen (Bericht, Excel): Planmaß Rohbau, Planmaß Fertigmaß oder Aufmaß */
  massgrundlage?: Massgrundlage;
  /** Altberechnung nach der II. BV (§§ 42–44, nur zum Vergleich mit Bestandsberechnungen bis 31.12.2003) */
  zweiteBV?: boolean;
  /** Flächenrechner: Vorlage und Abschnitte des Berichts (geprüft in der App) */
  bericht?: { vorlage?: string; abschnitte?: string[] };
}

export type Massgrundlage = 'rohbau' | 'fertig' | 'aufmass';

export interface Anschrift {
  /** Straße und Hausnummer */
  strasse: string;
  plz: string;
  ort: string;
}

export type KontaktArt = 'email' | 'telefon';

export interface Kontakt {
  art: KontaktArt;
  wert: string;
}

export interface Grundstueck {
  gemarkung: string;
  flur: string;
  flurstueck: string;
  /** Grundstücksfläche in m² */
  flaeche?: number;
}

/** Bebauungsplan, in dessen Geltungsbereich das Grundstück liegt */
export interface Bebauungsplan {
  /** Nummer, z. B. „Nr. 112“ */
  nummer?: string;
  /** Name, z. B. „Am Mühlenbach“ */
  name?: string;
}

export interface Bauherr {
  /** Name bzw. Firma */
  name: string;
  /** Vorname (wie in der Projektkarte von FORMA getrennt geführt) */
  vorname?: string;
  adresse: Anschrift;
  /** beliebig viele E-Mail-Adressen und Telefonnummern */
  kontakte: Kontakt[];
}

/** Beteiligter am Projekt (Fachplaner, Behörde …) */
export interface Beteiligter {
  /** z. B. Tragwerksplanung, Vermessung, Bauamt */
  rolle: string;
  name: string;
  kontakt: string;
}

/**
 * Projektstammdaten – gemeinsam für alle Apps (Flächenrechner, GRZ-Nachweis, Kostenermittlung, Projektordner,
 * Formulare, Entzerrung); die Formulare-App gleicht sie mit der Projektkarte von FORMA ab.
 */
export interface ProjectMeta {
  /** Projektcode / Projektnummer */
  projektcode: string;
  /** Kurzname, z. B. „EFH Musterweg“ (Teil des Ordnernamens) */
  kurzname?: string;
  /** Bezeichnung des Vorhabens bzw. der Baumaßnahme */
  vorhaben?: string;
  /** Aktenzeichen der Bauaufsicht */
  aktenzeichen?: string;
  /** Adresse des Bauvorhabens */
  adresse: Anschrift;
  grundstueck: Grundstueck;
  /** Bebauungsplan (Nummer, Name) – fehlt, wenn keiner erfasst ist */
  bebauungsplan?: Bebauungsplan;
  bauherr: Bauherr;
  bearbeiter: string;
  /** beauftragte Leistungsphasen (1–9); fehlt = nicht festgelegt */
  leistungsphasen?: number[];
  beteiligte?: Beteiligter[];
  /** Tag, an dem das Projekt angelegt wurde (JJJJ-MM-TT) */
  angelegt?: string;
  /**
   * Projektmerkmale (Name → Wert), z. B. Gebäudeklasse, Sonderbau, Verfahren – frei erweiterbar; welche es gibt,
   * steht in den Einstellungen der Apps.
   */
  merkmale?: Record<string, string>;
  /** Stand des Projekts: Akquise, aktiv, abgeschlossen – fehlt = aktiv (Filter der Projektübersicht) */
  status?: ProjektStatus;
}

export type ProjektStatus = 'akquise' | 'aktiv' | 'abgeschlossen';
export const PROJEKT_STATUS: { id: ProjektStatus; label: string }[] = [
  { id: 'akquise', label: 'Akquise' },
  { id: 'aktiv', label: 'aktiv' },
  { id: 'abgeschlossen', label: 'abgeschlossen' },
];

/** Leistungsphasen nach HOAI */
export const LEISTUNGSPHASEN: { nr: number; label: string }[] = [
  { nr: 1, label: 'Grundlagenermittlung' },
  { nr: 2, label: 'Vorplanung' },
  { nr: 3, label: 'Entwurfsplanung' },
  { nr: 4, label: 'Genehmigungsplanung' },
  { nr: 5, label: 'Ausführungsplanung' },
  { nr: 6, label: 'Vorbereitung der Vergabe' },
  { nr: 7, label: 'Mitwirkung bei der Vergabe' },
  { nr: 8, label: 'Objektüberwachung' },
  { nr: 9, label: 'Objektbetreuung' },
];

/** Angaben der App „Projektordner“ zum Projekt */
export interface ProjektordnerAngaben {
  /** Struktur, nach der der Projektordner angelegt bzw. zuletzt ergänzt wurde */
  struktur?: string;
  /** Dateinamenschema für Pläne, z. B. „{nummer}_{plannummer}_{index}_{titel}“ */
  dateischema?: string;
  /** gewählte Vorlagen-Presets */
  presets?: string[];
}

export const leereAnschrift = (): Anschrift => ({ strasse: '', plz: '', ort: '' });

export function leereMeta(): ProjectMeta {
  return {
    projektcode: '',
    adresse: leereAnschrift(),
    grundstueck: { gemarkung: '', flur: '', flurstueck: '' },
    bauherr: { name: '', adresse: leereAnschrift(), kontakte: [] },
    bearbeiter: '',
  };
}

/** „PLZ Ort“ */
export function plzOrt(a: Anschrift): string {
  return [a.plz, a.ort].map((x) => x.trim()).filter(Boolean).join(' ');
}

/** Anschrift in einer Zeile: „Straße Nr., PLZ Ort“ */
export function anschriftEinzeilig(a: Anschrift): string {
  return [a.strasse.trim(), plzOrt(a)].filter(Boolean).join(', ');
}

/** Freitext „Straße Nr., PLZ Ort“ (frühere Versionen) in eine Anschrift zerlegen */
export function anschriftAusText(text: string): Anschrift {
  const t = text.trim();
  const m = /^(.*?)[,\n]\s*(\d{4,5})\s+(.+)$/s.exec(t);
  if (m) return { strasse: m[1].trim(), plz: m[2], ort: m[3].trim() };
  const nurOrt = /^(\d{4,5})\s+(.+)$/.exec(t);
  if (nurOrt) return { strasse: '', plz: nurOrt[1], ort: nurOrt[2].trim() };
  return { strasse: t, plz: '', ort: '' };
}

/** Bebauungsplan in einer Zeile: „Nr. 112 „Am Mühlenbach““ */
export function bebauungsplanText(b: Bebauungsplan | undefined): string {
  const nr = b?.nummer?.trim();
  const name = b?.name?.trim();
  return [nr && (/^nr\.?\s/i.test(nr) ? nr : `Nr. ${nr}`), name && `„${name}“`].filter(Boolean).join(' ');
}

/** Gemarkung, Flur, Flurstück in einer Zeile */
export function flurText(g: Grundstueck): string {
  return [g.gemarkung && `Gemarkung ${g.gemarkung}`, g.flur && `Flur ${g.flur}`, g.flurstueck && `Flurstück ${g.flurstueck}`].filter(Boolean).join(', ');
}

/** Art einer mitgespeicherten Originaldatei */
export type DateiArt = 'ifc' | 'dxf' | 'pdf' | 'vorlage' | 'vorlage-grz' | 'vorlage-kosten';

/** Excel-Vorlagen: „vorlage“ des Flächenrechners, „vorlage-grz“ des GRZ-Nachweises, „vorlage-kosten“ der Kostenermittlung */
export const istVorlage = (art: DateiArt) => art === 'vorlage' || art === 'vorlage-grz' || art === 'vorlage-kosten';

/** Originaldatei eines Imports bzw. die Excel-Vorlage des Projekts – im Archiv unter quellen/ abgelegt */
export interface ProjektDatei {
  id: string;
  name: string;
  art: DateiArt;
  /** Datum der Übernahme (TT.MM.JJJJ) */
  datum: string;
  daten: Uint8Array;
}

export interface Project {
  format: 'arch-flaechen-tool';
  version: 1;
  name: string;
  meta: ProjectMeta;
  settings: ProjectSettings;
  storeys: Storey[];
  /** Dachhaut aus einem importierten Gebäudemodell (IFC) für Dächer vom Typ "modell" */
  dachModell?: DachModell;
  /** Geländeoberfläche aus dem Modell (IFC-Gelände, nach oben zeigende Dreiecke) – für die Geschossigkeit */
  gelaendeModell?: DachModell;
  /**
   * IFC-GlobalIds aus dem letzten Import (Geschosse, Räume, Lageplan-Flächen). Fehlt ein solches Element im
   * Projekt, wurde es von Hand gelöscht – ein erneuter Import legt es dann nicht wieder an.
   */
  ifcBekannt?: string[];
  /**
   * BGF-Umrisse des letzten IFC-Imports (je Geschoss: GlobalId bzw. Name). Umrisse haben keine eigene GlobalId –
   * ein Umriss, der hier steht, aber im Projekt fehlt, wurde von Hand gelöscht und kommt nicht wieder.
   */
  ifcUmrisse?: { geschoss: string; points: Point[] }[];
  /** Originaldateien der Importe (IFC, DXF, PDF) und die Excel-Vorlage */
  dateien?: ProjektDatei[];
  /** Lageplan des Grundstücks (GRZ/GFZ-Nachweis) */
  lageplan?: Lageplan;
  /** Festsetzungen des Bebauungsplans (GRZ/GFZ-Nachweis) */
  massNutzung?: MassNutzung;
  /** Kostenermittlung nach DIN 276 */
  kosten?: Kosten;
  /** Angaben der App „Projektordner“ (Struktur, Vorlagen-Presets) */
  projektordner?: ProjektordnerAngaben;
  /** Angaben der App „Formulare“ (Projektumfang, aktive Antragsfassung …) – geprüft wird in der App, hier nur durchgereicht */
  formulare?: unknown;
  /**
   * Abschnitte der Projektdatei, die diese Programmfassung nicht kennt (von neueren Fassungen oder anderen Apps).
   * Sie werden unverändert wieder geschrieben – keine App verliert Daten einer anderen.
   */
  erweiterungen?: Record<string, unknown>;
}

/* ---------- Kostenermittlung (DIN 276) ---------- */

/**
 * Bezugsgröße einer Kostenposition: Mengen nach DIN 277 bzw. daraus abgeleitete Bauteilmengen,
 * eine eigene Menge, ein Pauschalbetrag oder ein Prozentsatz anderer Kostengruppen.
 */
export type KostenBezug =
  | 'bgf'
  | 'bri'
  | 'nuf'
  | 'nrf'
  | 'tf'
  | 'vf'
  | 'wofl'
  | 'grf'
  | 'bgi'
  | 'awf'
  | 'iwf'
  | 'def'
  | 'daf'
  | 'auf'
  | 'fbg'
  | 'we'
  | 'menge'
  | 'pauschal'
  | 'prozent';

export const KOSTEN_BEZUEGE: KostenBezug[] = ['bgf', 'bri', 'nuf', 'nrf', 'tf', 'vf', 'wofl', 'grf', 'bgi', 'awf', 'iwf', 'def', 'daf', 'auf', 'fbg', 'we', 'menge', 'pauschal', 'prozent'];

export interface KostenPosition {
  id: string;
  /** Kostengruppe, z. B. „300“, „330“ oder „331“ */
  kg: string;
  bezeichnung: string;
  bezug: KostenBezug;
  /** nur Bezug „menge“: Menge und Einheit */
  menge?: number;
  einheit?: string;
  /** nur Bezug „prozent“: Kostengruppen, deren Summe die Grundlage bildet (z. B. ["300", "400"]) */
  basis?: string[];
  /** Kennwert je Einheit (bei „prozent“ in %, bei „pauschal“ der Betrag) – Bandbreite von / Mittel / bis */
  von?: number;
  mittel?: number;
  bis?: number;
  /** ausgeschaltet: wird angezeigt, aber nicht gerechnet */
  aus?: boolean;
  /** Herkunft des Kennwerts */
  quelle?: string;
  bemerkung?: string;
}

/** Stufen der Kostenermittlung nach DIN 276 */
export type KostenStufe = 'rahmen' | 'schaetzung' | 'berechnung' | 'voranschlag' | 'anschlag' | 'feststellung';

export const KOSTEN_STUFEN: { id: KostenStufe; label: string; lph: string }[] = [
  { id: 'rahmen', label: 'Kostenrahmen', lph: 'LPh 1' },
  { id: 'schaetzung', label: 'Kostenschätzung', lph: 'LPh 2' },
  { id: 'berechnung', label: 'Kostenberechnung', lph: 'LPh 3' },
  { id: 'voranschlag', label: 'Kostenvoranschlag', lph: 'LPh 5/6' },
  { id: 'anschlag', label: 'Kostenanschlag', lph: 'LPh 7' },
  { id: 'feststellung', label: 'Kostenfeststellung', lph: 'LPh 8' },
];

/** Bandbreite von / Mittel / bis */
export type Spanne = [number, number, number];

/** festgehaltener Kostenstand – für Historie und Vorher/Nachher */
export interface KostenStand {
  id: string;
  /** ISO-Datum JJJJ-MM-TT */
  datum: string;
  stufe: KostenStufe;
  bemerkung: string;
  /** Mengen zum Zeitpunkt des Stands */
  mengen: Record<string, number>;
  /** Kosten je Kostengruppe (1. und 2. Ebene), netto */
  summen: Record<string, Spanne>;
  gesamtNetto: Spanne;
  gesamtBrutto: Spanne;
}

export interface Kosten {
  stufe?: KostenStufe;
  /** Preisstand der Ermittlung (ISO-Datum) */
  datum?: string;
  positionen: KostenPosition[];
  /** von Hand festgelegte Mengen (überschreiben die abgeleiteten) */
  mengen?: Partial<Record<KostenBezug, number>>;
  /**
   * Auswahl im Mengennachweis: Teile einer Menge (Umriss, Raum, Wand …), die abweichend vom Standard mitzählen
   * (true) oder nicht (false). Schlüssel ist die Kennung des Teils, z. B. „iwf-<GlobalId der Wand>“.
   */
  teile?: Record<string, boolean>;
  /** Baupreisindex zum Stand der Kennwerte und aktuell – Faktor aktuell/Basis */
  indexBasis?: number;
  indexAktuell?: number;
  /** Regionalfaktor (1 = Bundesdurchschnitt) */
  regionalfaktor?: number;
  /** Umsatzsteuer in % (Standard 19) */
  mwst?: number;
  /** Kennwerte enthalten die Umsatzsteuer */
  kennwerteBrutto?: boolean;
  /** Herkunft der Kennwerte */
  katalog?: { name: string; quelle?: string; stand?: string };
  staende?: KostenStand[];
}

/** BauNVO-Fassungen mit unterschiedlicher Berechnung von Grund- und Geschossfläche */
export type BauNVOFassung = '1962' | '1968' | '1990';
/** Vollgeschossbegriff der Bauordnung NRW (statisch nach dem Datum des Bebauungsplans) */
export type BauOFassung = 'nw1962' | 'nw1985' | 'nrw2019';
/**
 * Einstufung einer Flächennutzung, die die BauNVO-Fassung nicht eindeutig regelt: ja = zählt zur Grundfläche
 * (BauNVO 1990: GRZ II), grz1 = zählt zur Hauptanlage (GRZ I, BauNVO 1990), nein = zählt nicht
 */
export type Einstufung = 'ja' | 'nein' | 'grz1';

/** Baugebiet nach BauNVO (Art der baulichen Nutzung) */
export type Gebietsart = 'WS' | 'WR' | 'WA' | 'WB' | 'MD' | 'MDW' | 'MI' | 'MU' | 'MK' | 'GE' | 'GI' | 'SO';
export const GEBIETSARTEN: { id: Gebietsart; label: string }[] = [
  { id: 'WS', label: 'WS – Kleinsiedlungsgebiet' },
  { id: 'WR', label: 'WR – reines Wohngebiet' },
  { id: 'WA', label: 'WA – allgemeines Wohngebiet' },
  { id: 'WB', label: 'WB – besonderes Wohngebiet' },
  { id: 'MD', label: 'MD – Dorfgebiet' },
  { id: 'MDW', label: 'MDW – dörfliches Wohngebiet' },
  { id: 'MI', label: 'MI – Mischgebiet' },
  { id: 'MU', label: 'MU – urbanes Gebiet' },
  { id: 'MK', label: 'MK – Kerngebiet' },
  { id: 'GE', label: 'GE – Gewerbegebiet' },
  { id: 'GI', label: 'GI – Industriegebiet' },
  { id: 'SO', label: 'SO – Sondergebiet' },
];

export interface MassNutzung {
  /** Inkrafttreten / Satzungsbeschluss des Bebauungsplans (JJJJ-MM-TT); leer = aktuelles Recht (§ 34/35 BauGB) */
  planDatum?: string;
  /** abweichend vom Plandatum */
  baunvo?: BauNVOFassung;
  bauo?: BauOFassung;
  grz?: number;
  gfz?: number;
  vollgeschosseMax?: number;
  /** abweichende Obergrenze für die GRZ II (§ 19 Abs. 4 Satz 3) */
  grzIIMax?: number;
  /** festgelegte Geländeoberfläche (m über ±0,00); sonst aus dem Lageplan */
  gelaende?: number;
  /** Dicke des Dachaufbaus senkrecht gemessen: lichte Höhe = Dachhaut − Aufbau */
  dachaufbau?: number;
  /** Einfamilienhaus (BauO NW 1962/1970: lichte Höhe für Aufenthaltsräume 2,30 statt 2,50 m) */
  einfamilienhaus?: boolean;
  /** Umfassungswände um Aufenthaltsräume (BauNVO vor 1990) in m */
  wandzuschlag?: number;
  /** Festlegung für Nutzungen, die die Fassung offenlässt („prüfen“) */
  einstufung?: Partial<Record<LageplanNutzung, Einstufung>>;
  /** Baugebiet (BauNVO 1962 § 19 Abs. 5: Garagen in MK, GE, GI anrechnungsfrei) */
  gebietsart?: Gebietsart;
  /** Stand des Nachweises (JJJJ-MM-TT) für Druck und Excel – nicht automatisch heute */
  stand?: string;
  /** Grundfläche bzw. Geschossfläche als absolute Festsetzung [m²] (§ 16 Abs. 2 BauNVO) */
  grAbsolut?: number;
  gfAbsolut?: number;
  /** Baumassenzahl (§ 21 BauNVO) */
  bmz?: number;
  /** Vollgeschosse als Mindestmaß; zwingend: genau vollgeschosseMax */
  vollgeschosseMin?: number;
  vollgeschosseZwingend?: boolean;
  /** Trauf- und Firsthöhe höchstens [m] – nur als Eingabe mit Prüfhinweis */
  traufhoeheMax?: number;
  firsthoeheMax?: number;
  /** § 20 Abs. 3 Satz 2 BauNVO 1990: Aufenthaltsräume in Nicht-Vollgeschossen mitrechnen (festgesetzt) */
  aufenthaltNichtVollgeschoss?: boolean;
  /** Variante, für die der Nachweis gilt (Lageplan-Flächen mit `variante`); ohne Angabe „A“ */
  variante?: string;
}

export function createLageplanFlaeche(points: Point[], name = 'Fläche'): LageplanFlaeche {
  return { id: newId('lp'), name, points, nutzung: 'sonstige', versiegelung: 'voll' };
}

let idCounter = 0;
export function newId(prefix = 'id'): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createStorey(name: string, hoehe = 3): Storey {
  return { id: newId('st'), name, hoehe, shapes: [] };
}

export function createProject(name = 'Neues Projekt'): Project {
  return {
    format: 'arch-flaechen-tool',
    version: 1,
    name,
    meta: leereMeta(),
    settings: { gridStep: 0.05, freisitzFaktor: 0.25 },
    storeys: [createStorey('EG', 3)],
  };
}

export function createOutline(points: Point[], name = 'BGF'): OutlineShape {
  return { id: newId('sh'), kind: 'outline', name, points, subtract: false, umschliessung: 'R' };
}

export function createRoom(points: Point[], nummer: string, name = 'Raum'): RoomShape {
  return {
    id: newId('sh'),
    kind: 'room',
    name,
    nummer,
    points,
    subtract: false,
    umschliessung: 'R',
    nutzung: 'NUF1',
    wofl: { kategorie: 'keine', wohnung: '' },
  };
}

/**
 * Fügt eine Originaldatei hinzu; eine inhaltsgleiche Datei (z. B. dasselbe PDF für mehrere Geschosse)
 * wird wiederverwendet. Liefert das Projekt und die ID der Datei.
 */
export function addDatei(p: Project, name: string, art: DateiArt, daten: Uint8Array): { project: Project; id: string } {
  const same = p.dateien?.find((d) => d.art === art && d.name === name && gleicheBytes(d.daten, daten));
  if (same) return { project: p, id: same.id };
  const d: ProjektDatei = { id: newId('df'), name, art, datum: new Date().toLocaleDateString('de-DE'), daten };
  // es gibt nur eine Excel-Vorlage je Projekt und App
  const rest = (p.dateien ?? []).filter((x) => !istVorlage(art) || x.art !== art);
  return { project: { ...p, dateien: [...rest, d] }, id: d.id };
}

function gleicheBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Nur noch benötigte Originaldateien: PDF/DXF, auf die ein Plan verweist, alle IFC-Modelle und die Vorlagen */
export function benutzteDateien(p: Project): ProjektDatei[] {
  const refs = new Set(p.storeys.map((s) => s.background?.quelle).filter(Boolean));
  return (p.dateien ?? []).filter((d) => d.art === 'ifc' || istVorlage(d.art) || refs.has(d.id));
}

/** Fußbodenhöhen aller Geschosse (explizit oder als Summe der Geschosshöhen, unterstes Geschoss = 0) */
export function storeyElevations(p: Project): number[] {
  const out: number[] = [];
  let z = 0;
  for (const s of p.storeys) {
    const e = s.elevation ?? z;
    out.push(e);
    z = e + s.hoehe;
  }
  return out;
}

/**
 * Dachgeschoss? Ohne ausdrückliche Angabe gilt ein Geschoss als Dachgeschoss, sobald einer seiner
 * BGF-Umrisse eine geneigte Dachform trägt. Ein Dach aus dem IFC-Modell zählt nicht: Es steht auch
 * über Teilen unterer Geschosse (Vordach, Anbau), die sonst fälschlich als Dachgeschoss gälten.
 */
export function istDachgeschoss(s: Storey): boolean {
  if (s.dachgeschoss !== undefined) return s.dachgeschoss;
  return s.shapes.some((sh) => sh.kind === 'outline' && !sh.subtract && sh.dach !== undefined && sh.dach.typ !== 'flach' && sh.dach.typ !== 'modell');
}

/** Geschossnamen, die auf ein Kellergeschoss deuten (nur ohne ausdrückliche Geschossart) */
const KELLER_NAME = /keller|\bkg\b|\bug\b|untergeschoss/i;

/** Kellergeschoss? Ausdrückliche Angabe, sonst nach dem Geschossnamen (KG, UG, Keller …) */
export function istKellergeschoss(s: Pick<Storey, 'name' | 'keller'>): boolean {
  return s.keller ?? KELLER_NAME.test(s.name.trim());
}

/** Anrechenbare Grundfläche eines Raums (Polygonfläche abzüglich Putzabzug) */
export function roomArea(r: RoomShape): number {
  return polygonAreaAbs(r.points) * (1 - (r.putzabzug ?? 0) / 100);
}

function polygonAreaAbs(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Fläche einer Form wie in der Auswertung (Räume inkl. Putzabzug), ohne Vorzeichen */
export function shapeArea(s: Shape): number {
  return s.kind === 'room' ? roomArea(s) : polygonAreaAbs(s.points);
}
