/**
 * Baurecht: Datenformat der Module und Regeldateien (Regelpaket `packages/baurecht-regeln`) und der Ergebnisse.
 * Konzept: docs/baurecht-konzept.md, Abschnitte 6 und 7.
 */

import type { QuellenRef } from '../recht/typen';

export type Ampel = 'rot' | 'gelb' | 'gruen';
export type Ebene = 'bund' | 'land' | 'kreis' | 'gemeinde';
export type Wahrheit = 'ja' | 'nein' | 'offen';

export const EBENEN: { id: Ebene; titel: string }[] = [
  { id: 'bund', titel: 'Bund' },
  { id: 'land', titel: 'Land' },
  { id: 'kreis', titel: 'Kreis' },
  { id: 'gemeinde', titel: 'Gemeinde' },
];

export type Thema = 'planungsrecht' | 'bauordnung' | 'brandschutz' | 'verfahren' | 'energie' | 'natur' | 'wasser' | 'boden' | 'denkmal' | 'gestaltung' | 'stellplaetze' | 'immission' | 'arbeitsschutz' | 'sonstiges';

export const THEMEN: { id: Thema; titel: string }[] = [
  { id: 'planungsrecht', titel: 'Planungsrecht' },
  { id: 'verfahren', titel: 'Verfahren und Bauvorlagen' },
  { id: 'bauordnung', titel: 'Bauordnung' },
  { id: 'brandschutz', titel: 'Brandschutz' },
  { id: 'gestaltung', titel: 'Gestaltung' },
  { id: 'stellplaetze', titel: 'Stellplätze' },
  { id: 'energie', titel: 'Energie' },
  { id: 'natur', titel: 'Natur und Landschaft' },
  { id: 'wasser', titel: 'Wasser' },
  { id: 'boden', titel: 'Boden und Altlasten' },
  { id: 'denkmal', titel: 'Denkmal' },
  { id: 'immission', titel: 'Immissionsschutz' },
  { id: 'arbeitsschutz', titel: 'Arbeitsschutz' },
  { id: 'sonstiges', titel: 'Sonstiges' },
];

/**
 * Bedingungen in Kurzform (Abschnitt 6.5). Dreiwertig ausgewertet: Unbekanntes ist offen (gelb), nie „trifft nicht
 * zu“.
 */
export type Kurz =
  /** Antragsmerkmal hat einen der Werte (`in`) bzw. keinen davon (`nicht`) */
  | { m: string; in?: string[]; nicht?: string[] }
  /** Fakt: gleich (`ist`), einer von (`in`), Zahl im Bereich (`min`/`max`, einschließlich), überhaupt bekannt */
  | { f: string; ist?: string | number | boolean; in?: (string | number)[]; min?: number; max?: number; bekannt?: boolean }
  /** Stichtag: Einreichung oder heute ab bzw. vor einem Datum */
  | { tag: 'einreichung' | 'heute'; ab?: string; vor?: string }
  /** Ampel eines anderen Paragrafen (`modul/norm/§`) */
  | { n: string; ampel: Ampel[] }
  /** Baustein aus einem Modul */
  | { $: string }
  | { und: Kurz[] }
  | { oder: Kurz[] }
  | { nicht: Kurz }
  | { immer: true }
  | { nie: true };

/** Regel eines Paragrafen (Abschnitt 7.2): Tatbestand, Ausnahmen, Einzelfall */
export interface ParagrafRegel {
  /** Titel, falls der Text (noch) nicht vorliegt */
  titel?: string;
  /** Tatbestand; fehlt = gilt immer, sobald die Norm gilt */
  gilt?: Kurz;
  /** Ausnahmen: ja → grün */
  entfaellt?: Kurz;
  /**
   * Einzelfall/Ermessen. Ohne `wenn`: Hinweis bei Rot („im Einzelfall prüfen“). Mit `wenn`: trifft zu oder offen →
   * aus Grün wird Gelb, bei Rot Hinweis.
   */
  pruefen?: { grund: string; wenn?: Kurz };
  /** nie automatisch grün */
  gruenNurVonHand?: boolean;
  /** Begründung in einem Satz */
  grund: string;
  /** Fundstellen „42a/1“ (Paragraf/Absatz) bzw. „42a“ */
  fundstellen?: string[];
  /** prüft die Bauaufsicht? (§§ 63–65 BauO NRW) – sonst eigene Verantwortung */
  behoerde?: Kurz;
  /** womit es im Antrag nachgewiesen wird */
  nachweis?: string[];
  /** Hinweis an der Ampel (z. B. Vorrang des Ortsrechts) */
  hinweis?: string;
  /** verwandte Paragrafen (`modul/norm/§`) */
  verweise?: string[];
  /** Prüfsumme je Fundstelle in der Fassung, an der die Regel geprüft ist */
  stand?: Record<string, string>;
}

export interface Regeldatei {
  format: 1;
  modul: string;
  norm: string;
  /** Fassung, an der die Regeln geprüft sind (gültig ab, JJJJ-MM-TT) */
  fassung: string;
  /** Version dieser Regeldatei */
  version: number;
  /** Anwendungsbereich der Norm; nein → alle Paragrafen grün */
  geltung?: Kurz;
  /** Begründung der Geltung (in Worten) */
  geltungGrund?: string;
  paragrafen: Record<string, ParagrafRegel>;
}

export interface NormDef {
  kurz: string;
  titel: string;
  quelle: QuellenRef;
  thema: Thema;
  /** erlassen von (wenn nicht das Gebiet des Moduls selbst), z. B. „Bezirksregierung Arnsberg“ */
  erlassen?: string;
  /** Annahme des Büros, die an jeder Ampel steht (z. B. „gilt als in Kraft“) */
  annahme?: string;
  /** Lizenz- bzw. Quellenhinweis */
  lizenz?: string;
  /** Text der Norm wird nur als Verweis geführt (Privatrecht, Erläuterung) */
  nurHinweis?: boolean;
}

export type FaktTyp = 'janein' | 'zahl' | 'wahl' | 'text';

export type FaktGruppe = 'lage' | 'planung' | 'schutz' | 'vorhaben' | 'gebaeude' | 'technik' | 'grundstueck' | 'antrag' | 'zustaendig' | 'ortsrecht';

export const FAKT_GRUPPEN: { id: FaktGruppe; titel: string }[] = [
  { id: 'lage', titel: 'Lage' },
  { id: 'planung', titel: 'Planungsrecht' },
  { id: 'schutz', titel: 'Schutzgebiete und Denkmal' },
  { id: 'vorhaben', titel: 'Vorhaben' },
  { id: 'gebaeude', titel: 'Gebäude' },
  { id: 'technik', titel: 'Technik' },
  { id: 'grundstueck', titel: 'Grundstück und Umfeld' },
  { id: 'ortsrecht', titel: 'Ortsrecht' },
  { id: 'zustaendig', titel: 'Zuständigkeit' },
  { id: 'antrag', titel: 'Antrag' },
];

/** Abfrage eines Geodienstes für einen Fakt (Abschnitt 5.4) */
export interface GeodienstDef {
  art: 'wms' | 'arcgis' | 'wfs';
  url: string;
  /** Ebene(n) */
  ebene: string;
  /** amtlich und vollständig für das Gebiet: nur dann kann „kein Treffer“ grün machen */
  vollstaendig: boolean;
  /** Puffer in m (mindestens 25) */
  puffer?: number;
  /** Ebenen der Vorstufen (vorläufig gesichert, geplant …), die ebenfalls ohne Treffer sein müssen */
  vorstufen?: string[];
  /** Attribut, dessen Wert der Fakt bekommt (sonst ja/nein) */
  attribut?: string;
  quelle: string;
  lizenz?: string;
}

export interface FaktDef {
  titel: string;
  /** kurzer Name (höchstens 40 Zeichen), überall statt des Titels; der Titel steht dann als Erläuterung darunter */
  kurz?: string;
  gruppe: FaktGruppe;
  typ: FaktTyp;
  werte?: string[];
  einheit?: string;
  hilfe?: string;
  /** Frage an die Bearbeitung (sonst Titel) */
  frage?: string;
  /** fester Wert, den das Modul setzt */
  wert?: string | number | boolean;
  /** Wert nach einem anderen Fakt (z. B. Gemeindeschlüssel → Landschaftsplan) */
  /** Wert nach einer Tabelle über einen anderen Fakt; `hinweis`: hängt zusätzlich von der Lage ab – nur Hinweis */
  nach?: { fakt: string; tabelle: Record<string, string | number | boolean>; sonst?: string | number | boolean; hinweis?: boolean };
  geodienst?: GeodienstDef;
  /** Vorschlag aus einem anderen Fakt (nur Hinweis) */
  vorschlag?: string;
  /** nur fragen, wenn … */
  wenn?: Kurz;
}

export interface Hinweis {
  titel: string;
  text: string;
  url?: string;
  wenn?: Kurz;
}

export interface Modul {
  format: 1;
  id: string;
  name: string;
  ebene: Ebene;
  /** Gemeindeschlüssel bzw. sein Anfang: Land „05“, Kreis „05974“, Gemeinde „05974040“; Bund ohne */
  schluessel?: string;
  /** Postleitzahlen der Gemeinde (Vorschlag, solange der Gemeindeschlüssel fehlt) */
  plz?: string[];
  ueber?: string;
  /** Version des Moduls (Datum) */
  version: string;
  hosts?: string[];
  normen: Record<string, NormDef>;
  fakten?: Record<string, FaktDef>;
  bausteine?: Record<string, Kurz>;
  /** Übersichtsseiten, deren Links beobachtet werden */
  listen?: string[];
  sperrliste?: string[];
  hinweise?: Hinweis[];
}

/** Name einer Angabe für die Anzeige: der kurze Name, sonst der Titel */
export function faktName(def: Pick<FaktDef, 'titel' | 'kurz'> | undefined, id = ''): string {
  return def?.kurz ?? def?.titel ?? id;
}

/** wie gesichert ein Fakt ist: sicher (auch bestätigt), nur Hinweis, widersprüchlich */
export type FaktStatus = 'sicher' | 'hinweis' | 'widerspruch';

/** Status eines Fakts für Festlegungen */
export function faktStatus(f: FaktWert | undefined): FaktStatus {
  if (!f) return 'hinweis';
  if (f.widerspruch) return 'widerspruch';
  return f.sicherheit === 'hinweis' && !f.bestaetigt ? 'hinweis' : 'sicher';
}

/** Wert eines Fakts im Projekt (Abschnitt 5.1) */
export interface FaktWert {
  wert: string | number | boolean | null;
  herkunft: 'stammdaten' | 'merkmal' | 'flaechen' | 'grz' | 'geodienst' | 'modul' | 'abgeleitet' | 'manuell';
  quelle?: string;
  stand?: string;
  sicherheit: 'sicher' | 'hinweis';
  /** warum nur Hinweis */
  grund?: string;
  /** von Hand bestätigt: wer, wann, worauf gestützt; bei Geodaten die Lage, für die es gilt */
  bestaetigt?: { von: string; am: string; grund?: string; lage?: string };
  /** Lage (Koordinaten), an der ein Geodienst abgefragt wurde */
  lage?: string;
  /** widersprechende Angabe (z. B. Treffer im Geodienst gegen „nein“ von Hand) – macht Grün gelb */
  widerspruch?: string;
  /** bei Angaben von Hand: das letzte Ergebnis des Dienstes – daraus wird der Widerspruch bei jedem Setzen neu bestimmt */
  dienst?: { wert: string | number | boolean | null; quelle?: string; stand?: string; sicherheit: 'sicher' | 'hinweis' };
}

/** Festlegung von Hand (Abschnitt 8) */
export interface Festlegung {
  ampel: Ampel;
  grund: string;
  von: string;
  am: string;
  /** automatische Ampel beim Festlegen */
  automatisch: Ampel;
  /** Fakten (Werte), an denen die Regel beim Festlegen hing */
  fakten?: Record<string, string | number | boolean | null>;
  /** wie gesichert diese Fakten beim Festlegen waren – verliert einer seine Sicherheit, ist die Festlegung überholt */
  sicherheit?: Record<string, FaktStatus>;
  /** Prüfsummen der Fundstellen beim Festlegen */
  stand?: Record<string, string>;
  /** zweite Bestätigung beim Speichern (ISO) – fehlt = Entwurf */
  bestaetigt?: string;
}

export interface ParagrafErgebnis {
  /** `modul/norm/§` */
  id: string;
  /** die Regel in Worten (Geltung, Tatbestand, Ausnahme, Einzelfall) – für „Regel im Einzelnen“ */
  bedingung?: string[];
  /** dieselbe Bedingung als Regelteile (für die Darstellung als Baum) */
  regelteile?: { titel: string; kurz: Kurz }[];
  modul: string;
  norm: string;
  paragraf: string;
  titel: string;
  ampel: Ampel;
  /** Ampel ohne Festlegung */
  automatisch: Ampel;
  /** Begründung in Worten (erste Zeile = Hauptgrund) */
  gruende: string[];
  hinweise: string[];
  /** Fakten bzw. Merkmale, die fehlen (machen gelb) */
  offen: string[];
  /** Fakten, die nur Hinweis sind */
  unsicher: string[];
  /** Absätze, die sich seit der Prüfung der Regel geändert haben */
  geaendert: string[];
  /** Fakten (und `merkmal:…`), an denen die Ampel hängt – für „Festlegung überholt“ */
  verwendet: string[];
  behoerde?: Wahrheit;
  nachweis?: string[];
  fundstellen: string[];
  verweise?: string[];
  festlegung?: Festlegung;
  /** Festlegung überholt: warum */
  ueberholt?: string;
  /**
   * Festlegung „entfällt“ (noch) nicht wirksam, weil der Systemstand fehlt (Text nicht verfügbar, Rechtsstand nicht
   * aktuell, neue Fassung zum Stichtag) – kein Fehler der Festlegung, erneutes Festlegen hilft dagegen nicht
   */
  unwirksam?: string;
  /** Regeldatei */
  regel?: { datei: string; version: number; fassung: string };
  /** Annahme des Büros */
  annahme?: string;
}

export interface NormErgebnis {
  /** `modul/norm` */
  id: string;
  modul: string;
  norm: string;
  def: NormDef;
  ebene: Ebene;
  /** Geltung der Norm */
  geltung: Wahrheit;
  geltungGrund?: string;
  paragrafen: ParagrafErgebnis[];
  zaehler: Record<Ampel, number>;
  /** Fassung des Texts, die verwendet wurde */
  fassung?: { gueltigAb: string; text: string; url: string; abgerufen: string; texterkennung?: boolean };
  /** Text fehlt (nicht abrufbar, Web-Version) */
  ohneText?: boolean;
  /** Regeldatei fehlt für diese Norm */
  ohneRegel?: boolean;
  fehler?: string;
  kuenftige?: { gueltigAb: string; url: string }[];
  /** letzte erfolgreiche Prüfung des Texts an der Quelle */
  geprueft?: string;
}

/**
 * Bezeichnung einer Einheit: „§ 6“ für Paragrafen (Nummer, auch „42a“), sonst der Name selbst – Satzungen,
 * Landschaftspläne und Verordnungslisten gliedern auch nach „C.1“, „SO-060“ oder „Art. 3“.
 */
export function paragrafName(nr: string): string {
  return /^\d/.test(nr) ? `§ ${nr}` : nr;
}

/**
 * Wert einer Angabe für die Anzeige: ja/nein, Zahlen deutsch mit Einheit, Anzahlen (Zahl ohne Einheit) ganzzahlig
 */
/** Einheiten, die Anzahlen zählen (Stellplätze …): ganzzahlig wie Zahlen ohne Einheit */
export const zaehlEinheit = (e?: string): boolean => !e || /plätze|stück|wohnungen|betten|geschosse/i.test(e);

export function wertAnzeige(w: FaktWert['wert'] | undefined, def?: Pick<FaktDef, 'typ' | 'einheit'>): string {
  if (w == null) return '–';
  if (w === true) return 'ja';
  if (w === false) return 'nein';
  if (typeof w === 'number') {
    const anzahl = def?.typ === 'zahl' && zaehlEinheit(def.einheit) && Number.isInteger(w);
    // wie in den Eingabefeldern: mit Einheit zwei Nachkommastellen, wenn es welche gibt („2,90 m“, „40 m²“)
    const stellen = anzahl || Number.isInteger(w) ? { maximumFractionDigits: 0 } : def?.einheit && !zaehlEinheit(def.einheit) ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 };
    return `${w.toLocaleString('de-DE', stellen)}${def?.einheit ? ` ${def.einheit}` : ''}`;
  }
  return w;
}

const vergleichbar = (s: string) => s.toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z0-9]/g, '');

/**
 * Paragraf bzw. benannte Einheit (Satzungsteil, Liste, Gebiet) mit Titel – ohne Doppelung: „SO-060“ mit Titel
 * „SO-060 Standortübungsplatz …“ nur einmal, ein Schlüssel wie „Massnahmenplan“ nicht neben „Maßnahmenplan“.
 * `nr` ist leer bei benannten Einheiten, die im Titel stehen.
 */
export function einheitName(nr: string, titel?: string): { nr: string; titel: string } {
  if (/^\d/.test(nr)) return { nr: `§ ${nr}`, titel: titel ?? '' };
  if (!titel) return { nr: '', titel: nr };
  const k = vergleichbar(nr);
  if (vergleichbar(titel).startsWith(k)) return { nr: '', titel };
  // Schlüssel in der Klammer am Ende („Naturschutzgebiete (Festsetzungen C.1)“): Klammer weg, Schlüssel vorn
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(titel);
  if (m && k.length >= 2 && vergleichbar(m[2]).includes(k)) return { nr: '', titel: `${nr} – ${m[1]}` };
  // längerer Schlüssel steckt schon im Titel („Sperre“ in „Veränderungssperre (§ 14 BauGB)“): nur der Titel
  if (k.length >= 4 && vergleichbar(titel).includes(k)) return { nr: '', titel };
  return { nr: '', titel: `${nr} – ${titel}` };
}

/** Einheit mit Titel in einer Zeile: „§ 5 Zugänge“, „SO-060 Standortübungsplatz …“ */
export function einheitVoll(nr: string, titel?: string): string {
  const e = einheitName(nr, titel);
  return [e.nr, e.titel].filter(Boolean).join(' ');
}

/** Titel einer Norm ohne angehängte Kurzform, wenn die schon im Titel steht („Landeswassergesetz (LWG)“ → „Landeswassergesetz“) */
export function normTitel(def: { kurz: string; titel: string }): string {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(def.titel);
  if (!m) return def.titel;
  const [k, inner] = [vergleichbar(def.kurz), vergleichbar(m[2])];
  return k && (inner.includes(k) || k.includes(inner)) ? m[1] : def.titel;
}

/** Titel mit Kurzform genau einmal: „Denkmalschutzgesetz (DSchG NRW)“ */
export function normVoll(def: { kurz: string; titel: string }): string {
  const t = normTitel(def);
  if (vergleichbar(t).includes(vergleichbar(def.kurz))) return t;
  // schon eine Klammer am Ende („Gebäudeenergiegesetz (amtlich seit 2026: GModG)“): Kurzform hinein statt zweiter Klammer
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(t);
  return m ? `${m[1]} (${def.kurz}; ${m[2]})` : `${t} (${def.kurz})`;
}

/** Fundstelle in Worten: „6/1“ → „§ 6 Abs. 1“ */
export function fundstelleName(fs: string): string {
  const [nr, abs] = fs.split('/');
  return abs ? `${paragrafName(nr)} Abs. ${abs}` : paragrafName(nr);
}
