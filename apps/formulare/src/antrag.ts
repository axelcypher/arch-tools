/**
 * Antrag und Export: Wohin die ausgefüllten Formulare als PDF kommen, wie die Dateien heißen und welche Dokumente
 * zu einem Antrag gehören (Antragsumfang) – samt Prüfung, ob sie im Ordner der aktiven Antragsfassung vollständig
 * und aktuell vorliegen.
 *
 * Ablage im echten Projektordner (einstellbar): `<Projekt>/TÖB/BAUA` – bei mehreren Fassungen `BAUA 2`, `BAUA3` …,
 * daneben andere Antragsarten wie `BAUVA` (Voranfrage) oder `DENK` (Denkmal). Die aktive Fassung ist zugleich das
 * Ziel des Exports. Dateien im Antragsordner heißen `<Projektcode> <Antragsart> <JJMMTT> <Name>`, z. B.
 * „BS9 BAUA 261110 01 Bauantrag.pdf“ – nur so benannte Dateien lassen sich als „bereit“ markieren (von Hand).
 */

import type { AntragKurz } from '@core/model';
import type { Kuerzel, Namensschema, NamensTeil } from '@core/namensschema';
import { alleKuerzel, dateinameZerlegenMitStellen, kuerzelZu, planNummerAus, VORGABE_NAMENSSCHEMA } from '@core/namensschema';
import { antragKurzAus } from '@core/serialize';
import type { Zustaende } from './autofill';
import { zustaendeAus } from './autofill';
import type { Bedingung } from './bedingung';
import { bedingungAus, erfuellt, hatBedingung, nurMerkmale } from './bedingung';
import type { Eintrag } from './dateisystem';
import type { Feld } from './forma/felder';
import { abschnitte } from './forma/felder';
import type { FormularProfil } from './profil';
import { abschnittErforderlich, abschnittId, ausgefuellt, einheiten, formularKontext } from './profil';

/* ---------- Einstellungen ---------- */

export interface ExportEinstellungen {
  /** Ordner der Anträge im Projektordner (relativ), z. B. „TÖB“ */
  antragsordner: string;
  /** Kürzel der Antragsarten; die erste ist der Standard */
  arten: string[];
  /** Vorlage für den Dateinamen (ohne Endung) */
  namensvorlage: string;
  /** Phasenkürzel für {Phase}: BP, EP, GP, AP … */
  phase: string;
  /** Ziel des Exports: Ordner der aktiven Antragsfassung oder ein fester Pfad */
  ziel: 'aktiv' | 'pfad';
  /** fester Zielordner relativ zum Projektordner (Platzhalter erlaubt, z. B. „TÖB/{Antrag}/Formulare“) */
  zielpfad: string;
  /** Berechnungen im Projektordner (Quelle externer Dokumente) */
  berechnungsordner: string;
  /** Ordner mit leeren FORMA-Formularen als Vorlage (vollständiger Pfad); leer = aus anderen Projekten */
  vorlagenordner: string;
}

export const VORGABE_EXPORT: ExportEinstellungen = {
  antragsordner: 'TÖB',
  arten: ['BAUA', 'BAUVA', 'DENK'],
  namensvorlage: '{Kürzel} {Art} {Datum} {Nr} {Name}',
  phase: 'GP',
  ziel: 'aktiv',
  zielpfad: 'TÖB/{Antrag}',
  berechnungsordner: 'Planung/Berechnungen',
  vorlagenordner: '',
};

/** Was je Projekt abweichen darf (wie die angezeigten Pfade im Projektordner) */
export type ExportUeberschreibung = Partial<Pick<ExportEinstellungen, 'namensvorlage' | 'phase' | 'ziel' | 'zielpfad' | 'antragsordner'>>;

export const UEBERSCHREIBBAR: (keyof ExportUeberschreibung)[] = ['antragsordner', 'namensvorlage', 'phase', 'ziel', 'zielpfad'];

/** Hinweis an jeder Namensvorlage – überall derselbe Wortlaut */
export const ART_HINWEIS = 'Die Antragsart ({Art}) kommt immer aus dem aktiven Antrag – „BAUA 2“ → BAUA –, nicht aus einer Einstellung.';

/**
 * Warnung an einer Namensvorlage mit {Phase} bzw. einem festen Kürzel an der Stelle der Antragsart – überall derselbe
 * Wortlaut; null, wenn die Vorlage passt
 */
export function vorlageArtWarnung(vorlage: string, reihenfolge: NamensTeil[] = VORGABE_NAMENSSCHEMA.reihenfolge): string | null {
  if (vorlageMitAntragsart(vorlage, reihenfolge) === vorlage) return null;
  const wort = vorlage.trim().split(/\s+/)[reihenfolge.indexOf('art')];
  return `An der Stelle der Antragsart steht „${wort}“ – beim Export wird dort die Antragsart des aktiven Antrags ({Art}) eingesetzt.`;
}

/**
 * Die Antragsart im Dateinamen kommt immer aus dem Antrag (Ordner der aktiven Antragsfassung, „BAUA 2“ → BAUA), nie
 * aus einer Einstellung: Steht in der Vorlage an der Stelle der Antragsart (nach dem Namensschema; Vorgabe: nach dem
 * Kürzel) {Phase} – die Vorgabe früherer Fassungen, dann stand dort der Wert der Einstellung „Phase“ – oder ein festes
 * Kürzel wie „BVA“ (Großbuchstaben, mindestens ein Buchstabe – „2026“ ist keins), wird daraus {Art}. Das gilt nur, wenn
 * die Vorlage das Kürzel an seiner Stelle hat; sonst bleibt sie, wie sie ist.
 */
export function vorlageMitAntragsart(vorlage: string, reihenfolge: NamensTeil[] = VORGABE_NAMENSSCHEMA.reihenfolge): string {
  // die Wörter der Vorlage entsprechen den Teilen des Namens (Platzhalter bzw. festes Wort)
  const teile = vorlage.trim().split(/\s+/);
  const [iCode, iArt] = [reihenfolge.indexOf('code'), reihenfolge.indexOf('art')];
  if (iCode < 0 || iArt < 0 || !/^\{(k(ü|ue)rzel|projekt)\}$/i.test(teile[iCode] ?? '')) return vorlage;
  const t = teile[iArt];
  if (!t || !(/^\{phase\}$/i.test(t) || /^(?=.*[A-ZÄÖÜ])[A-ZÄÖÜ0-9]{2,8}$/.test(t))) return vorlage;
  teile[iArt] = '{Art}';
  return teile.join(' ');
}

/** Einstellungen für ein Projekt: global, mit den Abweichungen des Projekts */
export function einstellungenFuer(global: ExportEinstellungen, ueber: ExportUeberschreibung | undefined): ExportEinstellungen {
  const out = { ...global };
  for (const k of UEBERSCHREIBBAR) {
    const v = ueber?.[k];
    if (v !== undefined && v !== '') (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** gelesene Einstellungen prüfen und mit der Vorgabe ergänzen */
export function einstellungenAus(roh: unknown): ExportEinstellungen {
  const o = (roh && typeof roh === 'object' ? roh : {}) as Partial<Record<keyof ExportEinstellungen, unknown>>;
  const text = (k: keyof ExportEinstellungen) => (typeof o[k] === 'string' ? (o[k] as string) : (VORGABE_EXPORT[k] as string));
  const arten = Array.isArray(o.arten) ? o.arten.filter((a): a is string => typeof a === 'string' && !!a.trim()).map((a) => a.trim()) : [];
  return {
    antragsordner: text('antragsordner'),
    arten: arten.length ? arten : VORGABE_EXPORT.arten,
    namensvorlage: text('namensvorlage') || VORGABE_EXPORT.namensvorlage,
    phase: text('phase'),
    ziel: o.ziel === 'pfad' ? 'pfad' : 'aktiv',
    zielpfad: text('zielpfad'),
    berechnungsordner: text('berechnungsordner'),
    vorlagenordner: text('vorlagenordner'),
  };
}

/* ---------- Dateinamen ---------- */

export interface NamensAngaben {
  kuerzel: string;
  phase: string;
  datum: Date;
  nr?: string;
  /** Name des Dokuments (Titel im Antragsumfang, sonst der Name des Formulars) */
  name: string;
  /** Dateiname des Formulars ohne Endung */
  formular?: string;
  /** aktive Antragsfassung, z. B. „BAUA 2“ */
  antrag?: string;
  /** Antragsart der aktiven Fassung, z. B. „BAUA“ */
  art?: string;
  kennung?: string;
  stand?: string;
}

const zweistellig = (n: number) => String(n).padStart(2, '0');
export const jjmmtt = (d: Date) => `${zweistellig(d.getFullYear() % 100)}${zweistellig(d.getMonth() + 1)}${zweistellig(d.getDate())}`;

/** Platzhalter der Namensvorlage mit Erklärung (für die Einstellungen) */
export const PLATZHALTER: { name: string; text: string }[] = [
  { name: '{Kürzel}', text: 'Projektkürzel, z. B. BS9' },
  { name: '{Phase}', text: 'Phasenkürzel (BP, EP, GP, AP)' },
  { name: '{Datum}', text: 'Datum des Exports als JJMMTT' },
  { name: '{Nr}', text: 'Nummer im Antragsumfang (entfällt, wenn leer)' },
  { name: '{Name}', text: 'Titel im Antragsumfang, sonst Name des Formulars' },
  { name: '{Art}', text: 'Antragsart der aktiven Fassung, z. B. BAUA (Pflicht im Antragsordner)' },
  { name: '{Antrag}', text: 'aktive Antragsfassung, z. B. BAUA 2' },
  { name: '{Formular}', text: 'Dateiname des Formulars' },
  { name: '{Kennung}', text: 'Kennung des Formulars, z. B. nw010005' },
  { name: '{Stand}', text: 'Stand des Formulars, z. B. 2026A' },
];

/** Name des Formulars ohne laufende Nummer davor und Jahr dahinter („005-Bauantrag (2026)“ → „Bauantrag“) */
export const anzeigeName = (formularName: string) => formularName.replace(/^\s*\d+\s*[-_ ]\s*/, '').replace(/\s*\(\d{4}\)\s*$/, '').trim() || formularName;

/** Dateiname (ohne Endung) aus der Vorlage; Zeichen, die Windows nicht erlaubt, werden zu „-“ */
export function dateiname(vorlage: string, a: NamensAngaben): string {
  const werte: Record<string, string> = {
    kürzel: a.kuerzel,
    kuerzel: a.kuerzel,
    projekt: a.kuerzel,
    phase: a.phase,
    datum: jjmmtt(a.datum),
    jahr: String(a.datum.getFullYear()),
    nr: a.nr ?? '',
    name: a.name,
    formular: a.formular ?? a.name,
    antrag: a.antrag ?? '',
    art: a.art ?? (a.antrag ?? '').replace(/[\s_-]*\d+$/, ''),
    kennung: a.kennung ?? '',
    stand: a.stand ?? '',
  };
  const roh = vorlage.replace(/\{([^{}]+)\}/g, (ganz, n: string) => (n.toLowerCase() in werte ? werte[n.toLowerCase()] : ganz));
  const sauber = roh
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return sauber || 'Formular';
}

/* ---------- Antragsfassungen ---------- */

export interface Fassung {
  /** Ordnername, z. B. „BAUA 2“ */
  name: string;
  /** Antragsart, z. B. „BAUA“ */
  art: string;
  /** laufende Nummer (ohne Nummer: 1) */
  nr: number;
  /** Ordner gibt es schon */
  vorhanden: boolean;
}

const regexText = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Antragsfassungen aus den Ordnernamen im Antragsordner, nach Art und Nummer sortiert */
export function fassungenAus(ordner: string[], arten: string[]): Fassung[] {
  const out: Fassung[] = [];
  for (const name of ordner) {
    const art = arten.find((a) => new RegExp(`^${regexText(a)}(?:[\\s_-]*\\d+)?(?:\\s.*)?$`, 'i').test(name.trim()));
    if (!art) continue;
    const nr = Number(new RegExp(`^${regexText(art)}[\\s_-]*(\\d+)`, 'i').exec(name.trim())?.[1] ?? 1);
    out.push({ name, art: art.toUpperCase(), nr, vorhanden: true });
  }
  const index = (a: string) => arten.findIndex((x) => x.toUpperCase() === a);
  return out.sort((a, b) => index(a.art) - index(b.art) || a.nr - b.nr || a.name.localeCompare(b.name, 'de'));
}

/** Vorgabe, wenn keine Fassung gewählt ist: die neueste der Standardart, sonst die neueste überhaupt */
export function standardFassung(fassungen: Fassung[], arten: string[]): Fassung | null {
  const standard = fassungen.filter((f) => f.art === arten[0]?.toUpperCase());
  const auswahl = standard.length ? standard : fassungen;
  return auswahl.reduce<Fassung | null>((best, f) => (!best || f.nr > best.nr ? f : best), null);
}

/**
 * Hauptkürzel einer Schreibweise nach den Antragsarten des Namensschemas (BVA → BAUVA); unbekannte bleiben, groß
 * geschrieben. Gleichwertige Schreibweisen zählen so als dieselbe Art.
 */
export const hauptArt = (art: string, arten: Kuerzel[] = []) => kuerzelZu(arten, art.trim())?.kuerzel ?? art.trim().toUpperCase();

/**
 * Name der nächsten Fassung einer Art: „BAUA“, dann „BAUA 2“, „BAUA 3“ … – gezählt über alle gleichwertigen
 * Schreibweisen (BVA und BAUVA); der neue Name verwendet die übergebene Schreibweise („BVA“ → „BVA 3“)
 */
export function naechsteFassung(fassungen: Fassung[], art: string, arten: Kuerzel[] = []): string {
  const haupt = hauptArt(art, arten);
  const da = fassungen.filter((f) => hauptArt(f.art, arten) === haupt);
  if (!da.length) return art.toUpperCase();
  return `${art.toUpperCase()} ${Math.max(...da.map((f) => f.nr)) + 1}`;
}

/* ---------- Katalog und Antragsumfang ---------- */

export type DokArt = 'intern' | 'extern' | 'plansatz';

/** Art eines gelesenen Dokuments (unbekannt = intern) */
const dokArtAus = (v: unknown): DokArt => (v === 'extern' || v === 'plansatz' ? v : 'intern');

/** Quelle eines Plansatzes ohne eigene Angabe: der pdf-Ordner der Genehmigungsplanung */
export const PLANSATZ_QUELLE = 'Planung/Genehmigungsplanung/pdf';

export interface KatalogEintrag {
  id: string;
  titel: string;
  /**
   * intern: Formular des Projekts; extern: eine Datei aus dem Projektordner (Berechnung, fremde PDF); plansatz: alle Pläne
   * mit Plannummer (GP-01 …) – geprüft auf Lücken und gegen die Quelle (plansatz.ts)
   */
  art: DokArt;
  /** intern: Teil des Formularnamens oder Kennung (z. B. „Bauantrag“ oder „nw010005“) */
  formular?: string;
  /** extern: Ordner der Quelle relativ zum Projektordner (z. B. „Planung/Berechnungen“) */
  quelle?: string;
  /** Muster der Datei – Platzhalter * und ?, mehrere mit „;“ getrennt (sonst der Titel) */
  muster?: string;
  /** früher: in neuen Projekten vorgewählt – heute bestimmen die Antragsvorlagen, was dazugehört (nur noch zum Übernehmen) */
  vorgewaehlt: boolean;
  /** nur erforderlich, wenn die Antragsmerkmale zutreffen (z. B. Gebäudeklasse 3–5) */
  bedingung?: Bedingung;
}

/** Grundlegende Antragsdokumente – in den Einstellungen anpassbar */
export const VORGABE_KATALOG: KatalogEintrag[] = [
  { id: 'bauantrag', titel: 'Bauantrag', art: 'intern', formular: 'Bauantrag', vorgewaehlt: true },
  { id: 'baubeschreibung', titel: 'Baubeschreibung', art: 'intern', formular: 'Baubeschreibung', vorgewaehlt: true },
  { id: 'betriebsbeschreibung', titel: 'Betriebsbeschreibung', art: 'intern', formular: 'Betriebsbeschreibung', vorgewaehlt: false },
  { id: 'statistik', titel: 'Statistischer Erhebungsbogen', art: 'intern', formular: 'Statisti', vorgewaehlt: true },
  { id: 'standsicherheit', titel: 'Erklärung zum Standsicherheitsnachweis', art: 'intern', formular: 'Standsicherheit', vorgewaehlt: false },
  // Unterlagen vom Vermesser: Fachplanung/G27 … (auch „Fachplaner“)
  { id: 'lageplan', titel: 'Lageplan', art: 'extern', quelle: 'Fachplanung/G27*', muster: '*Lageplan*', vorgewaehlt: true },
  // Genehmigungsplanung als PDF: Planung/03 Genehmigungsplanung/pdf, …/Genehmigung/pdf, …/GP/pdf
  // Plansatz: alle Pläne mit Plannummer (GP-01 …) – Lücken in der Nummernfolge, noch nicht verschobene und veraltete
  { id: 'zeichnungen', titel: 'Bauzeichnungen', art: 'plansatz', quelle: PLANSATZ_QUELLE, vorgewaehlt: true },
  { id: 'grz', titel: 'Berechnung GRZ/GFZ', art: 'extern', quelle: 'Planung/Berechnungen', muster: '*GRZ*;*GFZ*', vorgewaehlt: true },
  { id: 'flaechen', titel: 'Flächenberechnung', art: 'extern', quelle: 'Planung/Berechnungen', muster: '*Fläche*;*Flaeche*;*BRI*;*Wohnfl*', vorgewaehlt: true },
  { id: 'kosten', titel: 'Kostenermittlung', art: 'extern', quelle: 'Planung/Berechnungen', muster: '*Kosten*', vorgewaehlt: true },
  { id: 'stellplaetze', titel: 'Stellplatznachweis', art: 'extern', quelle: 'Planung/Berechnungen', muster: '*Stellpl*', vorgewaehlt: false },
  { id: 'vorbescheid', titel: 'Antrag auf Vorbescheid', art: 'intern', formular: 'Vorbescheid', vorgewaehlt: false },
  { id: 'denkmal', titel: 'Antrag auf denkmalrechtliche Erlaubnis', art: 'intern', formular: 'Denkmal', vorgewaehlt: false },
];

/** Antragsvorlage: welche Dokumente des Katalogs zu einer Art von Antrag gehören (Reihenfolge wie im Katalog) */
export interface AntragsVorlage {
  id: string;
  name: string;
  /** Antragsart (BAUA, BAUVA, DENK …) – für Projekte, deren aktive Fassung diese Art hat, vorgeschlagen */
  art?: string;
  /** ids der Katalogeinträge */
  dokumente: string[];
}

export const VORGABE_VORLAGEN: AntragsVorlage[] = [
  { id: 'baua', name: 'Bauantrag', art: 'BAUA', dokumente: VORGABE_KATALOG.filter((k) => k.vorgewaehlt).map((k) => k.id) },
  { id: 'bauva', name: 'Bauvoranfrage', art: 'BAUVA', dokumente: ['vorbescheid', 'lageplan', 'zeichnungen'] },
  { id: 'denk', name: 'Denkmalrechtliche Erlaubnis', art: 'DENK', dokumente: ['denkmal', 'baubeschreibung', 'lageplan', 'zeichnungen'] },
];

/**
 * Antragsvorlagen aus gespeicherten Daten. Gibt es noch keine, gelten die Vorgaben – der Bauantrag mit den bisher im
 * Katalog vorgewählten Dokumenten (so bleibt eine eigene Auswahl erhalten).
 */
export function vorlagenAus(roh: unknown, katalog: KatalogEintrag[]): AntragsVorlage[] {
  if (!Array.isArray(roh)) {
    const vorgewaehlt = katalog.filter((k) => k.vorgewaehlt).map((k) => k.id);
    return VORGABE_VORLAGEN.map((v) => (v.id === 'baua' && vorgewaehlt.length ? { ...v, dokumente: vorgewaehlt } : { ...v, dokumente: [...v.dokumente] }));
  }
  return roh
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string')
    .map((v, i) => ({
      id: typeof v.id === 'string' && v.id ? v.id : `v${i + 1}`,
      name: String(v.name),
      ...(typeof v.art === 'string' && v.art.trim() ? { art: v.art.trim() } : {}),
      dokumente: Array.isArray(v.dokumente) ? [...new Set(v.dokumente.filter((d): d is string => typeof d === 'string'))] : [],
    }));
}

/** Die Dokumente einer Vorlage in der Reihenfolge des Katalogs */
export const dokumenteDerVorlage = (katalog: KatalogEintrag[], v: AntragsVorlage) => katalog.filter((k) => v.dokumente.includes(k.id));

/**
 * Vorschlag für ein Projekt: die Vorlage zur Art der aktiven Antragsfassung (gleichwertige Schreibweisen wie BVA für
 * BAUVA zählen mit). Gibt es zu der Art keine Vorlage (z. B. BAUF, ENTW), wird nichts vorgeschlagen – eine Vorlage
 * „Bauantrag“ passt dort nicht. Ohne Art gilt die erste.
 */
export function vorlageFuer(vorlagen: AntragsVorlage[], art: string | undefined, arten: Kuerzel[] = []): AntragsVorlage | undefined {
  if (!art?.trim()) return vorlagen[0];
  const haupt = hauptArt(art, arten);
  return vorlagen.find((v) => v.art && hauptArt(v.art, arten) === haupt);
}

/** Element `von` an die Stelle `nach` verschieben (nach dem Herausnehmen gezählt) */
export function verschieben<T>(liste: T[], von: number, nach: number): T[] {
  if (von === nach || von < 0 || von >= liste.length) return liste;
  const neu = [...liste];
  const [x] = neu.splice(von, 1);
  neu.splice(Math.max(0, Math.min(nach, neu.length)), 0, x);
  return neu;
}

export function katalogAus(roh: unknown): KatalogEintrag[] {
  if (!Array.isArray(roh)) return VORGABE_KATALOG;
  return roh
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as { titel?: unknown }).titel === 'string')
    .map((e, i) => ({
      id: typeof e.id === 'string' && e.id ? e.id : `k${i + 1}`,
      titel: String(e.titel),
      art: dokArtAus(e.art),
      formular: typeof e.formular === 'string' ? e.formular : undefined,
      quelle: typeof e.quelle === 'string' ? e.quelle : undefined,
      muster: typeof e.muster === 'string' ? e.muster : undefined,
      vorgewaehlt: e.vorgewaehlt === true,
      bedingung: nurMerkmale(bedingungAus(e.bedingung)),
    }));
}

/** Dokument im Antragsumfang eines Projekts */
export interface UmfangEintrag {
  id: string;
  titel: string;
  art: DokArt;
  formular?: string;
  quelle?: string;
  muster?: string;
  /** Nummer im Antrag (für {Nr}) */
  nr?: string;
  /** zugeordnetes Formular im FORMA-Projekt (Dateiname mit Endung) */
  formularDatei?: string;
  /** verknüpfte Datei je Antragsfassung (Dateiname im Ordner der Fassung) */
  dateien?: Record<string, string>;
  /** nur erforderlich, wenn die Antragsmerkmale zutreffen */
  bedingung?: Bedingung;
}

/** Angaben der App zum Projekt – Abschnitt „formulare“ der Projektdatei (.oap), für alle im Büro gleich */
/**
 * Angaben der App zum Projekt, wie sie die Oberfläche sieht: die Werte des **aktiven Antrags** (`ansicht`) – Antragsumfang,
 * Antragsmerkmale, Autofill-Zustände – und dazu alle Anträge (`antraege`), wie sie in der Projektdatei stehen.
 * Gespeichert wird im Abschnitt „formulare“ nur `aktiveFassung` und `antraege` (siehe `abschnittVon`).
 */
export interface ProjektDatei {
  /** aktive Antragsfassung (Ordnername) */
  aktiveFassung?: string;
  /** Antrag, dessen Werte hier stehen (umfang, merkmale, felder) */
  ansicht?: string;
  /** Antragsumfang; fehlt = nicht festgelegt (keine Vollständigkeitsprüfung) */
  umfang?: UmfangEintrag[];
  /** Antragsmerkmale (Gebäudeklasse, Sonderbau …): Name → Wert, gilt für alle Formulare */
  merkmale?: Record<string, string>;
  /** Autofill: je Formulardatei Auto-Wert und manuelle Überschreibung der Felder (siehe autofill.ts) */
  felder?: Zustaende;
  /** von Hand als „bereit“ markierte Dateien je Antragsfassung (Ordnername) */
  bereit?: Record<string, BereitEintrag[]>;
  /** alle Anträge des Projekts je Fassung (Ordnername) */
  antraege?: Record<string, AntragDaten>;
}

/** Angaben eines Antrags (einer Antragsfassung) – unabhängig von den anderen Anträgen und den Vorgaben */
export interface AntragDaten {
  /** angelegt (JJJJ-MM-TT) */
  angelegt?: string;
  merkmale?: Record<string, string>;
  umfang?: UmfangEintrag[];
  felder?: Zustaende;
  bereit?: BereitEintrag[];
  /** Antragsprotokoll bzw. Eingangsbestätigung im Ordner des Antrags (erkannt) */
  eingereicht?: { datei: string; datum: string };
  /** von Hand gesetzter Status – gilt statt der Erkennung (fehlt = automatisch) */
  status?: AntragStatusManuell;
  /** Stand bei der Einreichung: welche Dateien im Ordner des Antrags lagen (nur Name, Größe, Änderungszeit) */
  stand?: AntragStand;
}

/** Eine Datei im festgehaltenen Antragsstand – keine Kopie, nur zum Wiedererkennen */
export interface StandDatei {
  pfad: string;
  groesse?: number;
  geaendert?: number;
}

/** Antragsstand bei der Einreichung (Tag JJJJ-MM-TT und die Dateien im Ordner des Antrags) */
export interface AntragStand {
  tag: string;
  dateien: StandDatei[];
  /** von Hand neu festgehalten (Zeitpunkt, ms): was bis dahin geändert wurde, gehört vollständig zum Stand */
  festgehalten?: number;
}

/** Hilfsdateien, die nie zu den Unterlagen gehören: Office-Sperrdateien, Thumbs.db, desktop.ini */
export const istHilfsdatei = (pfad: string) => {
  const name = pfad.split(/[\\/]/).pop() ?? '';
  return /^(~\$|\.~lock\.)/.test(name) || /^(thumbs\.db|desktop\.ini)$/i.test(name);
};

/** Verbindungswörter und Behörden, die in einem Schreiben der Behörde neben dem Kernwort stehen dürfen */
const FUELLWOERTER = new Set(
  (
    'der die das des dem den vom von zum zur zu und für fuer über ueber auf vor nach gem gemäß gemaess im mit inkl az aktenzeichen ' +
    'kreis landkreis kreisverwaltung städteregion staedteregion stadt stadtverwaltung gemeinde gemeindeverwaltung bauaufsicht ' +
    'bauaufsichtsbehörde bauaufsichtsbehoerde bauaufsichtsamt bauordnung untere behörde behoerde denkmalbehörde ' +
    'denkmalbehoerde bauamt bauordnungsamt amt bauportal'
  ).split(' '),
);
/** Kernwörter: was die Behörde schickt (ganze Wörter, abschließend aufgezählt) – eines davon muss im Namen stehen */
const KERN = new RegExp(
  '^(' +
    [
      // Bestätigung der Behörde (ein neues Antragsprotokoll belegt dagegen eine weitere Einreichung über das Portal)
      'eingangsbest(ä|ae)tigung|empfangsbest(ä|ae)tigung',
      // Entscheidung
      '(bau|teilbau|nachtrags|nachtragsbau|änderungs|aenderungs|entwässerungs|entwaesserungs)?genehmigung(sbescheid)?',
      '(vor|bauvor|gebühren|gebuehren|ablehnungs|kosten|kostenfestsetzungs|teil|änderungs|aenderungs|abweichungs|befreiungs|verlängerungs|verlaengerungs)?bescheid',
      'ablehnung|versagung|erlaubnis|abgeschlossenheitsbescheinigung|kostenfestsetzung|geb(ü|ue)hr(en)?(rechnung|festsetzung)?',
      // Schreiben im Verfahren
      'anh(ö|oe)rung(sschreiben)?|nachforderung(en|sschreiben)?|aufforderung(sschreiben)?|unterrichtung',
      'vollst(ä|ae)ndigkeit(sbest(ä|ae)tigung|smitteilung|sbescheinigung)?|fiktionsbescheinigung|genehmigungsfiktion',
      '§gemeinde|§rueckgabe',
    ].join('|') +
    ')$',
);
/** dürfen daneben stehen, genügen aber allein nicht */
const ZUSATZ = /^(§az|denkmalrechtlich\S*|vereinfacht\S*|(bau)?genehmigungsverfahren|verfahren|genehmigungsfreistellung|freistellung\S*|mitteilung|nebenbestimmungen)$/;
/** genehmigte Bauvorlagen: das Stempelwort und was auf einer Bauvorlage steht (Planart, Geschoss, Richtung, Bauvorlagen nach BauPrüfVO) */
const STEMPEL = /^(genehmigt\S*|genehmigungsvermerk|gr(ü|ue)nstempel)$/;
const VORLAGE =
  /^(bauvorlagen?|pl(ä|ae|a)ne?|grundri(ss|ß)\S*|schnitt\S*|ansicht\S*|lageplan|baubeschreibung|betriebsbeschreibung|mit|(eg|og|dg|kg|ug|sg)|\d+og|\d+ug|nord\S*|s(ü|ue)d\S*|ost\S*|west\S*|§plannr)$/;

/** Obergrenze für ein Datum der Behörde: ein Jahr nach heute (fängt „720512“ = 2072 ab, ohne von der Uhr abzuhängen) */
const spaetesterTag = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return tagVon(d);
};

const gueltigerTag = (t: number, m: number) => m >= 1 && m <= 12 && t >= 1 && t <= 31;

/**
 * Datum aus „261125“, „20261125“, „12.11.2026“, „12.11.26“ (Tag), „11.2026“ (Monat) bzw. einer Jahreszahl (Jahr) – als
 * JJJJ-MM-TT, JJJJ-MM bzw. JJJJ, damit ein Vergleich nur so genau ist wie die Angabe; sonst null
 */
function datumAusWort(w: string): string | null {
  const jahr = (j: string) => (j.length === 4 ? j : `20${j}`);
  let m = /^(20)?(\d{2})(\d{2})(\d{2})$/.exec(w);
  if (m && gueltigerTag(Number(m[4]), Number(m[3]))) return `20${m[2]}-${m[3]}-${m[4]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(w);
  if (m && gueltigerTag(Number(m[1]), Number(m[2]))) return `${jahr(m[3])}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{1,2})\.(\d{4})$/.exec(w);
  if (m && gueltigerTag(1, Number(m[1]))) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = /^((19|20)\d{2})$/.exec(w);
  return m ? m[1] : null;
}
/**
 * Neue Dateien, die nach der Einreichung erwartungsgemäß in den Antragsordner kommen und deshalb nicht als „neu seit der
 * Einreichung“ gelten (nur für Dateien, die nicht im festgehaltenen Stand sind – was eingereicht wurde, wird immer auf
 * „geändert“ und „entfernt“ geprüft). Grundsatz: im Zweifel „neu“ – nachgereichte Bauvorlagen müssen auffallen
 * (§ 70 Abs. 2 Satz 4 und § 71 Abs. 1 Sätze 6 und 7 BauO NRW 2018, § 7 BauPrüfVO NRW). Deshalb eine Positivliste:
 * Erwartet ist eine Datei nur, wenn ihr Name **ausschließlich** aus einem Schreiben der Behörde besteht – ein Kernwort
 * und sonst nur Zusätze und Füllwörter. Alles Weitere (eine Bauvorlage, ein Begleitwort des Büros, ein Bestand, ein
 * Ortsname, eine Dokumentnummer) macht sie zu etwas Nachgereichtem.
 *
 * Kernwörter (abschließend) – Bürovorgabe: die Genehmigung selbst (auch die Fiktionsbescheinigung, § 74 Abs. 3 Satz 1
 * Nr. 4 BauO NRW 2018 i. V. m. § 42a Abs. 3 VwVfG NRW), die Empfangsbestätigung und Nachforderungen der Behörde (§ 71
 * Abs. 1 Satz 7). Ergänzt: Eingangsbestätigung (§ 71 Abs. 1 Satz 1) und Antragsprotokoll, die Unterrichtung über die
 * Vollständigkeit (§ 71 Abs. 1 Satz 9 BauO NRW 2018 in der Fassung ab 01.09.2026), Bescheide (Vorbescheid, Gebühren,
 * Ablehnung, Abweichung, Befreiung, Verlängerung …), Ablehnung, Anhörung, Kostenfestsetzung, (denkmalrechtliche)
 * Erlaubnis, Abgeschlossenheitsbescheinigung, Rückgabe der Unterlagen (§ 63 Abs. 4 Satz 3) sowie Mitteilung bzw.
 * Erklärung der Gemeinde (§ 63 Abs. 3 Satz 5; § 63 Abs. 2 Satz 1 Nr. 4 i. V. m. Abs. 4 Satz 1). Füllwörter: die
 * Behörde (ohne Ortsnamen), Verbindungswörter, ein Aktenzeichen („Az 63-1234-26“), Projektcode und Antragsart, ein
 * Datum bzw. Jahr ab dem Tag der Einreichung (ein älteres meint einen beigefügten Bestand, auch im Aktenzeichen; eines
 * mehr als ein Jahr in der Zukunft zählt nicht),
 * der Bezug „zum Bauantrag“ bzw. „Genehmigung Bauantrag“ (nur das ganze Wort), feste Wendungen wie „von Unterlagen“,
 * „Behebung der Mängel“, „an den Bauherrn“.
 *
 * Genehmigte Bauvorlagen (§ 74 Abs. 4 Satz 5): mit „genehmigt…“, „Genehmigungsvermerk“ oder „Grünstempel“ dürfen auch
 * Planart, Geschoss, Richtung, Plannummer und Bauvorlagen nach BauPrüfVO im Namen stehen („GP-03 Grundriss OG
 * genehmigt“); Aufteilungspläne mit „gesiegelt“, „gestempelt“ oder „beglaubigt“.
 */
export function nachEinreichungErwartet(name: string, o: { schema?: Pick<Namensschema, 'phasen' | 'antragsarten'>; codes?: string[]; tag?: string } = {}): boolean {
  const schema = o.schema ?? VORGABE_NAMENSSCHEMA;
  // zerlegte Umlaute (macOS) zusammenführen, Endung weg
  const roh = (name.normalize('NFC').split(/[\\/]/).pop() ?? '').replace(/\.[a-z0-9]{1,5}$/i, '');
  // vom Tag der Einreichung (ohne Stand: ab dem Vorjahr) an ist ein Datum im Namen das der Behörde – höchstens ein Jahr
  // in der Zukunft
  const ab = o.tag ?? `${new Date().getFullYear() - 1}-01-01`;
  const bis = spaetesterTag();
  // so genau wie die Angabe: Jahr, Monat oder Tag
  const imZeitraum = (datum: string) => datum >= ab.slice(0, datum.length) && datum <= bis.slice(0, datum.length);
  // 1. Trennzeichen außer dem Bindestrich vereinheitlichen
  let text = roh.replace(/[_()[\]{},;]+/g, ' ');
  // 2. Projektcodes zuerst – genauso vereinheitlicht, Bindestrich und Leerzeichen gleichwertig („2025-014“, „2025_014“);
  //    nach dem Auflösen der Bindestriche (6.) noch einmal („BS9-BAUA-261110-Nachforderung“)
  const codeMuster = [...(o.codes ?? [])]
    .map((x) => x.replace(/[_()[\]{},;]+/g, ' ').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(
      (c) =>
        new RegExp(
          `(^|\\s)${c
            .split(/[-\s]+/)
            .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('[-\\s]+')}(?=\\s|$)`,
          'gi',
        ),
    );
  const ohneCodes = (t: string) => codeMuster.reduce((x, m) => x.replace(m, ' '), t);
  text = ohneCodes(text);
  // 3. Plannummern erkennen, solange der Bindestrich noch steht („GP-03“, „GP03“, Satz „GP01-07“)
  text = text
    .split(/\s+/)
    .map((w) => (planNummerAus(w, schema) ? '§plannr' : w))
    .join(' ');
  // 4. Daten mit Bindestrich als Datum, nur gültige: JJJJ-MM-TT, TT-MM-JJJJ, TT-MM-JJ, MM-JJJJ, JJJJ-MM
  const alsDatum = (g: string, t: string, m: string, j: string) => (gueltigerTag(Number(t), Number(m)) ? `${t}.${m}.${j}` : g);
  text = text
    .replace(/(?<=^|\s)(\d{4})-(\d{2})-(\d{2})(?=\s|$)/g, (g, j, m, t) => alsDatum(g, t, m, j))
    .replace(/(?<=^|\s)(\d{1,2})-(\d{1,2})-(\d{4}|\d{2})(?=\s|$)/g, (g, t, m, j) => alsDatum(g, t, m, j))
    .replace(/(?<=^|\s)(\d{1,2})-(\d{4})(?=\s|$)/g, (g, m, j) => (gueltigerTag(1, Number(m)) ? `${m}.${j}` : g))
    .replace(/(?<=^|\s)(\d{4})-(\d{1,2})(?=\s|$)/g, (g, j, m) => (gueltigerTag(1, Number(m)) ? `${m}.${j}` : g));
  // 5. Aktenzeichen als Ganzes – eine Jahresangabe vor der Einreichung darin meint einen Bestand. Steht am Ende eine
  //    Jahresangabe („63-1234-72“, „63-1934-2026“), entscheidet sie allein (die Zahlen davor sind laufende Nummern);
  //    sonst jede vierstellige Jahreszahl („63-1999-0815“, „Nr. 1972“)
  const abJahr = Number(ab.slice(0, 4));
  let alt = false;
  const aktenzeichen = (gruppe: string) => {
    const zahlen = gruppe.match(/\d+/g) ?? [];
    const letzte = zahlen[zahlen.length - 1] ?? '';
    // erst ab drei Zahlengruppen oder mit „Az“/„Nr.“ ist die letzte sicher das Jahr („1972-26“ kann Jahr-Nummer sein)
    const mitJahr = zahlen.length >= 3 || (zahlen.length > 1 && /^\s*(az|aktenzeichen|nr)/i.test(gruppe));
    const schlussJahr = !mitJahr ? null : letzte.length === 2 ? 2000 + Number(letzte) : /^(19|20)\d{2}$/.test(letzte) ? Number(letzte) : null;
    if (schlussJahr !== null) {
      if (schlussJahr < abJahr || schlussJahr > abJahr + 1) alt = true;
    } else if (zahlen.some((z) => /^(19|20)\d{2}$/.test(z) && Number(z) < abJahr)) alt = true;
    return ' §az ';
  };
  text = text
    .replace(/(^|\s)(az|aktenzeichen|nr)\.?:?\s*[\w./-]*\d[\w./-]*/gi, (g) => aktenzeichen(g))
    .replace(/(^|\s)\d+(-\d+)+(?=\s|$)/g, (g) => aktenzeichen(g));
  if (alt) return false;
  // 6. übrige Bindestriche zwischen Wörtern (dann noch einmal die Codes), 7. sonstige Zeichen
  text = ohneCodes(text.replace(/(?<=[\p{L}\p{N}])-(?=[\p{L}\p{N}])/gu, ' '))
    .replace(/[^\p{L}\p{N}.§]+/gu, ' ')
    // Bezug (nur das ganze Wort „Bauantrag“), Adressat und feste Wendungen
    .replace(/(^|\s)(zum|zu dem|über den|ueber den|auf den|für den|fuer den) bauantrag(e?s)?(?=\s|$)/gi, ' ')
    .replace(/(^|\s)(zur|zu der) (bau)?voranfrage(?=\s|$)/gi, ' ')
    .replace(/(genehmigung\S*|(?<!vor)bescheid\S*|ablehnung\S*) (des )?bauantrag(e?s)?(?=\s|$)/gi, '$1')
    .replace(/(mitteilung|erkl(ä|ae)rung) (der |des )?(gemeinde|stadt)(?=\s|$)/gi, ' §gemeinde ')
    .replace(/r(ü|ue)ckgabe (der )?unterlagen/gi, ' §rueckgabe ')
    .replace(/((bescheinigung|mitteilung|unterrichtung|best(ä|ae)tigung) )?((ü|ue)ber die|der) (vollst(ä|ae)ndigkeit)/gi, ' $6 ')
    .replace(/bescheinigung (über den |ueber den )?(eintritt (der )?)?genehmigungsfiktion/gi, ' genehmigungsfiktion ')
    .replace(/(eintritt (der )?)genehmigungsfiktion/gi, ' genehmigungsfiktion ')
    .replace(/(?<=^|\s)(?!(?:bau)?vorbescheid)(\S*bescheid) (?:über die |ueber die )?verl(?:ä|ae)ngerung(?: de[rs] (?:vorbescheid\S*|baugenehmigung))?(?=\s|$)/gi, '$1')
    // nur hinter dem Schreiben der Behörde: „Aufforderung zur Behebung der Mängel“, „Baugenehmigung mit Anlagen“ – sonst
    // ist „Behebung der Mängel …“ bzw. „… mit Anlagen“ die Antwort des Büros
    .replace(/((?:auf|nach)forderung\S*) zur (?:m(?:ä|ae)ngelbeseitigung|behebung (?:der |von )?m(?:ä|ae)ngel(?:n)?)(?=\s|$)/gi, '$1')
    .replace(/((?:\S*genehmigung\S*|\S*bescheid\S*|ablehnung|erlaubnis|nachforderung\S*|aufforderung\S*|anh(?:ö|oe)rung\S*)) mit anlagen?(?=\s|$)/gi, '$1')
    .replace(/von (fehlenden )?unterlagen|fehlender unterlagen|an (den|die) (bauherr\S*|antragsteller\S*)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const woerter = text.split(' ').filter(Boolean);
  const klein = woerter.map((w) => w.toLowerCase().replace(/\.+$/, ''));
  const arten = new Set(alleKuerzel(schema.antragsarten).map((k) => k.toLowerCase()));
  const stempel = klein.some((w) => STEMPEL.test(w));
  const aufteilung = klein.some((w) => /^aufteilungspl/.test(w)) && klein.some((w) => /^(gesiegelt|gestempelt|beglaubigt)$/.test(w));
  let kern = stempel || aufteilung;
  // eine Präposition direkt vor dem Kernwort („zur Genehmigung“, „gem. Nachforderung“, „für die Genehmigung“) ist die
  // Bezeichnung des Büros – außer sie hängt an einem Kernwort davor („Anhörung vor Ablehnung“)
  const PRAEP = /^(zur|zum|zu|für|fuer|vor|nach|auf|gem|gemäß|gemaess)$/;
  for (let i = 0; i < klein.length; i++) {
    if (!PRAEP.test(klein[i])) continue;
    const naechstes = klein.slice(i + 1).find((w) => !/^(der|die|das|den|dem|des)$/.test(w));
    const davor = klein.slice(0, i).filter((w) => !FUELLWOERTER.has(w)).pop();
    if (naechstes && KERN.test(naechstes) && !(davor && KERN.test(davor))) return false;
  }
  const erlaubt = klein.every((w) => {
    if (KERN.test(w)) return (kern = true);
    if (ZUSATZ.test(w) || FUELLWOERTER.has(w) || arten.has(w)) return true;
    const datum = datumAusWort(w);
    if (datum) return imZeitraum(datum);
    if (stempel && (STEMPEL.test(w) || VORLAGE.test(w))) return true;
    // Schnittbezeichnung „Schnitt A-A“
    if (stempel && /^[a-z]$/.test(w) && klein.some((x) => /^schnitt/.test(x))) return true;
    if (aufteilung && /^(aufteilungspl\S*|gesiegelt|gestempelt|beglaubigt)$/.test(w)) return true;
    return false;
  });
  return erlaubt && kern;
}

/**
 * Antragsstand festhalten: alle Dateien im Ordner des Antrags (ohne Archiv und Hilfsdateien), verlustfrei. Was nach dem
 * Tag der Einreichung geändert wurde (etwa wenn die Einreichung erst später erkannt wird), zählt erst beim Vergleich
 * nicht dazu (`imStand`) – so bleibt der Stand richtig, auch wenn sich der Tag später noch ändert.
 */
export function standAus(dateien: Eintrag[], tag: string, festgehalten?: number): AntragStand {
  return {
    tag,
    ...(festgehalten ? { festgehalten } : {}),
    dateien: dateien
      .filter((d) => !d.ordner && !istArchiv(d.pfad) && !istHilfsdatei(d.pfad))
      .map((d) => ({ pfad: d.pfad, groesse: d.groesse, ...(d.geaendert ? { geaendert: d.geaendert } : {}) })),
  };
}

/**
 * Einträge des Stands, die zur Einreichung gehören: nicht erst nach dem Tag der Einreichung geändert – bei einem von
 * Hand neu festgehaltenen Stand alles bis zu diesem Zeitpunkt
 */
export function imStand(stand: AntragStand): StandDatei[] {
  const ende = Math.max(new Date(`${stand.tag}T23:59:59.999`).getTime(), stand.festgehalten ?? 0);
  return stand.dateien.filter((d) => !(d.geaendert && d.geaendert > ende));
}

/** neu: erst nach der Einreichung dazugekommen · geaendert: danach geändert */
export type SeitEinreichung = 'neu' | 'geaendert';

export const SEIT_EINREICHUNG_TEXT: Record<SeitEinreichung, string> = { neu: 'neu seit der Einreichung', geaendert: 'geändert seit der Einreichung' };

/**
 * Eingereichte Dateien auf oberster Ebene des Antragsordners, die es nicht mehr gibt (gelöscht oder verschoben) – der
 * Nachweis der Einreichung selbst (Antragsprotokoll, Eingangs- bzw. Empfangsbestätigung) nicht; `vorhanden` sind die
 * Pfade der Dateien im Ordner des Antrags.
 */
export function entferntSeitEinreichung(vorhanden: string[], stand: AntragStand | undefined): StandDatei[] {
  if (!stand) return [];
  const da = new Set(vorhanden.map((p) => p.toLowerCase()));
  return imStand(stand).filter((s) => !/[\\/]/.test(s.pfad) && !da.has(s.pfad.toLowerCase()) && !EINGEREICHT_MUSTER.test(s.pfad) && !istHilfsdatei(s.pfad));
}

/**
 * Hat sich eine Datei seit der Einreichung geändert bzw. ist sie neu? Was eingereicht wurde, wird immer verglichen
 * (außer dem Nachweis der Einreichung); eine neue Datei zählt nicht, wenn sie erwartungsgemäß kommt (Bescheid …).
 */
export function seitEinreichung(
  d: Pick<Eintrag, 'pfad' | 'groesse' | 'geaendert'>,
  stand: AntragStand | undefined,
  o: { schema?: Pick<Namensschema, 'phasen' | 'antragsarten'>; codes?: string[] } = {},
): SeitEinreichung | null {
  if (!stand) return null;
  const name = d.pfad.split('/').pop() ?? '';
  const s = imStand(stand).find((x) => x.pfad.toLowerCase() === d.pfad.toLowerCase());
  if (!s) return nachEinreichungErwartet(name, { ...o, tag: stand.tag }) ? null : 'neu';
  if (EINGEREICHT_MUSTER.test(name)) return null;
  const groesse = s.groesse !== undefined && s.groesse !== d.groesse;
  // Änderungszeit: zwei Sekunden Spielraum (Dateisysteme runden)
  const zeit = !!s.geaendert && !!d.geaendert && Math.abs(s.geaendert - d.geaendert) > 2000;
  return groesse || zeit ? 'geaendert' : null;
}

function standAusRoh(roh: unknown): AntragStand | undefined {
  if (!roh || typeof roh !== 'object') return undefined;
  const o = roh as Record<string, unknown>;
  if (typeof o.tag !== 'string' || !TAG.test(o.tag) || !Array.isArray(o.dateien)) return undefined;
  const dateien = o.dateien
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && typeof (d as { pfad?: unknown }).pfad === 'string')
    .map((d) => ({ pfad: d.pfad as string, ...(typeof d.groesse === 'number' ? { groesse: d.groesse } : {}), ...(typeof d.geaendert === 'number' ? { geaendert: d.geaendert } : {}) }));
  return { tag: o.tag, dateien, ...(typeof o.festgehalten === 'number' ? { festgehalten: o.festgehalten } : {}) };
}

/** Von Hand gesetzter Antragsstatus: eingereicht (mit Datum) oder ausdrücklich noch in Arbeit */
export interface AntragStatusManuell {
  eingereicht: boolean;
  /** Tag der Einreichung (JJJJ-MM-TT) */
  datum?: string;
}

/** Wirksamer Stand „eingereicht“ eines Antrags: von Hand gesetzt vor erkannt; null = in Arbeit */
export function eingereichtVon(a: AntragDaten | undefined): { datei?: string; datum: string; manuell?: true } | null {
  if (!a) return null;
  // von Hand ohne Datum (nur bei einer von Hand bearbeiteten Projektdatei): der erkannte Tag bzw. der des Stands vor „heute“
  if (a.status) return a.status.eingereicht ? { datum: a.status.datum ?? a.eingereicht?.datum ?? a.stand?.tag ?? tagVon(new Date()), manuell: true } : null;
  return a.eingereicht ?? null;
}

/** Kurzfassung eines Antrags für die Startseiten (`meta.antrag`) */
export function antragKurzVon(antraege: Record<string, AntragDaten>, name: string): AntragKurz | null {
  const d = antraege[name];
  if (!d) return null;
  const e = eingereichtVon(d);
  return { name, ...(d.angelegt ? { angelegt: d.angelegt } : {}), ...(e ? { eingereicht: e } : {}) };
}

/** Gespeicherter Abschnitt „formulare“: aktive Fassung und die Anträge; `alt` = Angaben aus der Zeit vor den Anträgen */
export interface Abschnitt {
  aktiveFassung?: string;
  antraege: Record<string, AntragDaten>;
  /** früher projektweit (Antragsumfang, Merkmale, Autofill) – wird in die vorhandenen Anträge übernommen */
  alt?: AntragDaten;
}

/** Eine als „bereit“ markierte Datei im Ordner einer Antragsfassung */
export interface BereitEintrag {
  /** Dateiname im Ordner der Fassung */
  datei: string;
  /** Änderungszeit der Datei beim Markieren (ms) – ist sie danach geändert worden, gilt sie nicht mehr als bereit */
  stand?: number;
}

export function projektDateiAus(roh: unknown): ProjektDatei {
  const o = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
  const out: ProjektDatei = {};
  if (typeof o.aktiveFassung === 'string' && o.aktiveFassung.trim()) out.aktiveFassung = o.aktiveFassung.trim();
  if (Array.isArray(o.umfang))
    out.umfang = o.umfang
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as { titel?: unknown }).titel === 'string')
      .map((e, i) => {
        const u: UmfangEintrag = { id: typeof e.id === 'string' && e.id ? e.id : `u${i + 1}`, titel: String(e.titel), art: dokArtAus(e.art) };
        for (const k of ['formular', 'quelle', 'muster', 'nr', 'formularDatei'] as const) if (typeof e[k] === 'string' && e[k]) u[k] = e[k] as string;
        if (e.dateien && typeof e.dateien === 'object')
          u.dateien = Object.fromEntries(Object.entries(e.dateien as Record<string, unknown>).filter((x): x is [string, string] => typeof x[1] === 'string'));
        const b = nurMerkmale(bedingungAus(e.bedingung));
        if (b) u.bedingung = b;
        return u;
      });
  if (o.merkmale && typeof o.merkmale === 'object') {
    const m = Object.fromEntries(Object.entries(o.merkmale as Record<string, unknown>).filter((x): x is [string, string] => typeof x[1] === 'string' && !!x[1]));
    if (Object.keys(m).length) out.merkmale = m;
  }
  const felder = zustaendeAus(o.felder);
  if (Object.keys(felder).length) out.felder = felder;
  if (o.bereit && typeof o.bereit === 'object') {
    const b: Record<string, BereitEintrag[]> = {};
    for (const [fassung, liste] of Object.entries(o.bereit as Record<string, unknown>)) {
      if (!Array.isArray(liste)) continue;
      const eintraege = liste
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { datei?: unknown }).datei === 'string')
        .map((x) => ({ datei: String(x.datei), ...(typeof x.stand === 'number' ? { stand: x.stand } : {}) }));
      if (eintraege.length) b[fassung] = eintraege;
    }
    if (Object.keys(b).length) out.bereit = b;
  }
  return out;
}

const TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Tag (JJJJ-MM-TT) in Ortszeit */
export const tagVon = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function antragDatenAus(roh: unknown): AntragDaten {
  const o = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
  const p = projektDateiAus({ umfang: o.umfang, merkmale: o.merkmale, felder: o.felder, bereit: { x: o.bereit } });
  const a: AntragDaten = {};
  if (typeof o.angelegt === 'string' && TAG.test(o.angelegt)) a.angelegt = o.angelegt;
  if (p.merkmale) a.merkmale = p.merkmale;
  if (p.umfang) a.umfang = p.umfang;
  if (p.felder) a.felder = p.felder;
  if (p.bereit?.x) a.bereit = p.bereit.x;
  const e = o.eingereicht as Record<string, unknown> | undefined;
  if (e && typeof e === 'object' && typeof e.datei === 'string' && e.datei && typeof e.datum === 'string' && TAG.test(e.datum)) a.eingereicht = { datei: e.datei, datum: e.datum };
  const st = o.status as Record<string, unknown> | undefined;
  if (st && typeof st === 'object' && typeof st.eingereicht === 'boolean') {
    // das Datum bleibt auch bei „in Arbeit“ stehen – beim Zurückstellen auf „eingereicht“ gilt wieder derselbe Tag
    a.status = { eingereicht: st.eingereicht, ...(typeof st.datum === 'string' && TAG.test(st.datum) ? { datum: st.datum } : {}) };
  }
  const stand = standAusRoh(o.stand);
  if (stand) a.stand = stand;
  return a;
}

/**
 * Abschnitt „formulare“ lesen. Ältere Projektdateien hatten Antragsumfang, Autofill (im Abschnitt) und Antragsmerkmale
 * (`meta.merkmale`) für das ganze Projekt: Sie kommen nach `alt` und werden in die vorhandenen Anträge übernommen;
 * die „bereit“-Markierungen waren schon je Fassung.
 */
export function abschnittAus(roh: unknown, metaMerkmale?: Record<string, string>): Abschnitt {
  const o = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
  const legacy = projektDateiAus(o);
  const a: Abschnitt = { antraege: {} };
  if (legacy.aktiveFassung) a.aktiveFassung = legacy.aktiveFassung;
  if (o.antraege && typeof o.antraege === 'object' && !Array.isArray(o.antraege))
    for (const [name, daten] of Object.entries(o.antraege as Record<string, unknown>)) if (name.trim()) a.antraege[name] = antragDatenAus(daten);
  const alt: AntragDaten = {};
  const merkmale = legacy.merkmale ?? (metaMerkmale && Object.keys(metaMerkmale).length ? { ...metaMerkmale } : undefined);
  if (merkmale) alt.merkmale = merkmale;
  if (legacy.umfang) alt.umfang = legacy.umfang;
  if (legacy.felder) alt.felder = legacy.felder;
  if (Object.keys(alt).length) a.alt = alt;
  for (const [fassung, liste] of Object.entries(legacy.bereit ?? {})) {
    const ziel = a.antraege[fassung];
    if (ziel) {
      if (!ziel.bereit) ziel.bereit = liste;
    } else a.antraege[fassung] = { ...structuredClone(alt), bereit: liste };
  }
  return a;
}

/** Neuer Antrag: die Vorgabewerte der Antragsmerkmale (globales Preset), sonst leer */
export function neuerAntrag(vorgaben: Record<string, string>, angelegt: string): AntragDaten {
  return { angelegt, ...(Object.keys(vorgaben).length ? { merkmale: { ...vorgaben } } : {}) };
}

/**
 * Ansicht für einen Antrag: dessen Werte vorne, alle Anträge dahinter. Fehlt der Antrag, entsteht er – aus den früher
 * projektweiten Angaben (`alt`) oder aus den Vorgaben; `neu` sagt dann, dass er noch gespeichert werden muss.
 */
export function ansichtVon(a: Abschnitt, fassung: string, neu: () => AntragDaten): { pd: ProjektDatei; neu: boolean } {
  const antraege = { ...a.antraege };
  const fehlt = !antraege[fassung];
  if (fehlt) antraege[fassung] = a.alt ? { ...structuredClone(a.alt), angelegt: neu().angelegt } : neu();
  const d = antraege[fassung];
  const bereit = Object.fromEntries(Object.entries(antraege).flatMap(([n, x]) => (x.bereit?.length ? [[n, x.bereit]] : [])));
  const pd: ProjektDatei = {
    ...(a.aktiveFassung ? { aktiveFassung: a.aktiveFassung } : {}),
    ansicht: fassung,
    ...(d.umfang ? { umfang: d.umfang } : {}),
    ...(d.merkmale && Object.keys(d.merkmale).length ? { merkmale: d.merkmale } : {}),
    ...(d.felder && Object.keys(d.felder).length ? { felder: d.felder } : {}),
    ...(Object.keys(bereit).length ? { bereit } : {}),
    antraege,
  };
  return { pd, neu: fehlt };
}

/** Anträge aus der Ansicht: die Werte des angezeigten Antrags und die „bereit“-Markierungen je Fassung zurückgeschrieben */
export function antraegeVon(pd: ProjektDatei): Record<string, AntragDaten> {
  const antraege: Record<string, AntragDaten> = {};
  for (const [n, x] of Object.entries(pd.antraege ?? {})) {
    const { bereit: _, ...rest } = x;
    antraege[n] = rest;
  }
  if (pd.ansicht) {
    const { merkmale: _m, umfang: _u, felder: _f, ...rest } = antraege[pd.ansicht] ?? {};
    antraege[pd.ansicht] = {
      ...rest,
      ...(pd.merkmale && Object.keys(pd.merkmale).length ? { merkmale: pd.merkmale } : {}),
      ...(pd.umfang ? { umfang: pd.umfang } : {}),
      ...(pd.felder && Object.keys(pd.felder).length ? { felder: pd.felder } : {}),
    };
  }
  for (const [n, liste] of Object.entries(pd.bereit ?? {})) if (liste.length) antraege[n] = { ...antraege[n], bereit: liste };
  return antraege;
}

/** Zu speichernder Abschnitt „formulare“ */
export function abschnittVon(pd: ProjektDatei): Record<string, unknown> {
  const antraege = antraegeVon(pd);
  return { ...(pd.aktiveFassung ? { aktiveFassung: pd.aktiveFassung } : {}), ...(Object.keys(antraege).length ? { antraege } : {}) };
}

/**
 * Der zuletzt angelegte Antrag: nach `angelegt`, bei gleichem Tag bzw. ohne Datum nach der
 * Reihenfolge der Fassungen (`reihe`, z. B. BAUVA, BAUA, BAUA 2) – die spätere gewinnt.
 */
export function aktuellsterAntrag(antraege: Record<string, AntragDaten>, reihe: string[] = []): AntragKurz | null {
  const rang = (n: string) => {
    const i = reihe.findIndex((r) => r.toLowerCase() === n.toLowerCase());
    return i < 0 ? -1 : i;
  };
  const namen = Object.keys(antraege).sort((a, b) => (antraege[a].angelegt ?? '').localeCompare(antraege[b].angelegt ?? '') || rang(a) - rang(b) || a.localeCompare(b, 'de', { numeric: true }));
  const name = namen.at(-1);
  if (!name) return null;
  const d = antraege[name];
  return { name, ...(d.angelegt ? { angelegt: d.angelegt } : {}), ...(d.eingereicht ? { eingereicht: d.eingereicht } : {}) };
}

/** Dokumente, die einen Antrag als eingereicht kennzeichnen */
export const EINGEREICHT_MUSTER = /antragsprotokoll|eingangsbest(ä|ae)tigung|empfangsbest(ä|ae)tigung/i;

/** Datei oder Ordner in einem Archivordner (`_archiv`, `archiv`, auch tiefer) */
export const istArchiv = (pfad: string) => /(^|\/)_?archiv(\/|$)/i.test(pfad.replace(/\\/g, '/'));

/** Wie tief im Ordner des Antrags nach dem Antragsprotokoll bzw. der Eingangsbestätigung gesucht wird */
export const EINGEREICHT_TIEFE = 6;

/**
 * Eingereicht? – der erste Nachweis im Ordner des Antrags oder seinen Unterordnern (Archivordner und Hilfsdateien
 * ausgenommen): Maßgeblich ist der Eingang (§ 71 Abs. 1 Satz 1 BauO NRW 2018) – eine spätere Eingangsbestätigung
 * bestätigt nur diesen Eingang, ihr Briefdatum ist nicht der Tag der Einreichung. `datei` ist der Pfad relativ zum
 * Ordner des Antrags.
 */
export function eingereichtAus(dateien: Eintrag[]): { datei: string; datum: string } | null {
  const nachweise = dateien
    .filter((d) => !d.ordner && !istArchiv(d.pfad) && !istHilfsdatei(d.pfad) && EINGEREICHT_MUSTER.test(d.pfad.split('/').pop() ?? ''))
    .map((d) => {
      // Datum: aus dem Namen („… 261103 Eingangsbestätigung.pdf“), sonst die Änderungszeit
      const n = datumAusName(d.pfad);
      const datum = n ? `${Math.floor(n.tag / 10000)}-${String(Math.floor(n.tag / 100) % 100).padStart(2, '0')}-${String(n.tag % 100).padStart(2, '0')}` : tagVon(d.geaendert ? new Date(d.geaendert) : new Date());
      return { datei: d.pfad, datum };
    });
  return nachweise.reduce<{ datei: string; datum: string } | null>((erster, x) => (!erster || x.datum < erster.datum ? x : erster), null);
}

/* ---------- Dokumente im Antragsordner: Namensformat und „bereit“ ---------- */

/** Antragsart einer Fassung: „BAUA 2“ → „BAUA“ */
export const artDerFassung = (fassung: string) => fassung.trim().replace(/[\s_-]*\d+$/, '').toUpperCase();

const gueltigesDatum = (t: string | undefined) => {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(t ?? '');
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31;
};

/** Erwarteter Kopf eines Dateinamens im Antragsordner nach dem Namensschema, z. B. „HVO BAUA JJMMTT“ */
export function antragsMuster(codes: string[], art: string, reihenfolge: NamensTeil[] = VORGABE_NAMENSSCHEMA.reihenfolge): string {
  const code = codes.map((c) => c.trim()).find(Boolean);
  return reihenfolge
    .filter((t) => t !== 'nummer')
    .map((t) => (t === 'code' ? (code ?? 'Projektcode') : t === 'art' ? art.trim() || 'Antragsart' : 'JJMMTT'))
    .join(' ');
}

/**
 * Prüft das Namensformat einer Datei im Antragsordner: Projektcode, Antragsart und JJMMTT an ihren Stellen nach dem
 * Namensschema (Vorgabe `<Projektcode> <Antragsart> <JJMMTT> <Rest>`, z. B. „BS9 BAUA 261110 Bauantrag.pdf“), danach
 * mindestens ein Wort. Projektcode ist das Projektkürzel (oder der Projektcode der Projektdatei), die Antragsart die der
 * Fassung (BAUA, BAUVA, DENK …) – gleichwertige Schreibweisen der Antragsarten des Schemas gelten (BVA = BAUVA).
 * Liefert null, wenn der Name passt, sonst den Grund.
 */
export function antragsNameFehler(name: string, o: { codes: string[]; art: string; reihenfolge?: NamensTeil[]; schema?: Pick<Namensschema, 'antragsarten'> }): string | null {
  const reihenfolge = o.reihenfolge ?? VORGABE_NAMENSSCHEMA.reihenfolge;
  const arten = (o.schema ?? VORGABE_NAMENSSCHEMA).antragsarten;
  const codes = [...new Set(o.codes.map((c) => c.trim()).filter(Boolean))];
  const art = o.art.trim();
  const erwartet = `erwartet „${antragsMuster(codes, art, reihenfolge)} …“`;
  // „am Anfang“, „nach dem Projektcode“ … (bei der Vorgabe-Reihenfolge wie gewohnt), sonst „an Stelle n“
  const wo = (t: NamensTeil) => {
    const i = reihenfolge.indexOf(t);
    if (i === 0) return 'am Anfang';
    const davor = reihenfolge[i - 1];
    return davor === 'code' ? 'nach dem Projektcode' : davor === 'art' ? 'nach der Antragsart' : `an Stelle ${i + 1}`;
  };
  // gemeinsame Zerlegung (core): mehrteiliger Projektcode, Nummer nur, wenn sie wie eine aussieht
  const { teile, code } = dateinameZerlegenMitStellen(name, { reihenfolge }, codes);
  if (!code) return `Projektcode fehlt ${wo('code')} – ${erwartet}`;
  if (!art || !teile.art || hauptArt(teile.art, arten) !== hauptArt(art, arten)) return `Antragsart ${art || '?'} fehlt ${wo('art')} – ${erwartet}`;
  if (!/^\d{6}$/.test(teile.datum ?? '')) return `Datum JJMMTT fehlt ${wo('datum')} – ${erwartet}`;
  // nach den Teilen braucht es eine Bezeichnung (eine Nummer allein genügt nicht)
  if (!teile.rest) return `Bezeichnung fehlt – ${erwartet}`;
  if (!gueltigesDatum(teile.datum)) return `Kein gültiges Datum „${teile.datum}“ – ${erwartet}`;
  return null;
}

/**
 * Vorschlag „Umbenennen nach Namensformat“: Projektcode, Antragsart, Datum und Nummer nach dem Namensschema vor die
 * Bezeichnung. Was davon am Anfang des Namens schon steht – auch verrutscht –, wird übernommen statt verdoppelt: der
 * Projektcode, ein gültiges JJMMTT, eine Plan- oder Dokumentnummer und ein bekanntes Kürzel (Phase oder andere
 * Antragsart), das die Antragsart ersetzt – „HVO GP 261111 GP-04 Grundriss.pdf“ → „HVO BAUA 261111 GP-04
 * Grundriss.pdf“, „HVO 261111 Bauantrag.pdf“ → „HVO BAUA 261111 Bauantrag.pdf“. Eine Plannummer mit Phasenkürzel
 * („GP-04“) kommt auch von weiter hinten an ihre Stelle (sonst wäre der Plan danach keiner mehr); eine bloße Zahl in der
 * Bezeichnung („Statik Teil 2“, „OG2“) bleibt, wo sie ist.
 */
export function nameNachFormat(name: string, o: { codes: string[]; art: string; datum: Date; reihenfolge?: NamensTeil[]; schema?: Pick<Namensschema, 'phasen' | 'antragsarten'> }): string {
  const reihenfolge = o.reihenfolge ?? VORGABE_NAMENSSCHEMA.reihenfolge;
  const schema = o.schema ?? VORGABE_NAMENSSCHEMA;
  const codes = [...new Set(o.codes.map((c) => c.trim()).filter(Boolean))];
  // mehrteilige Codes zuerst („BS 9“ vor „BS“)
  const codesLang = [...codes].sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);
  const { woerter, endung, teile, stelle, code } = dateinameZerlegenMitStellen(name, { reihenfolge }, codes);
  const bekannt = new Set([...alleKuerzel(schema.phasen), ...alleKuerzel(schema.antragsarten), o.art].map((k) => k.toUpperCase()));
  const istPlannummer = (w: string) => !!planNummerAus(w, schema);
  // ein Projektcode an seiner Stelle im Schema zählt als vorhanden
  const codeStellen = code ? Array.from({ length: code.split(/\s+/).length }, (_, i) => stelle.code! + i) : [];
  const werte: Partial<Record<NamensTeil, string>> = code ? { code: teile.code } : {};
  // die Wörter mit ihrer Stelle im Namen (ein Kürzel klein geschrieben zählt nur an der Stelle der Antragsart)
  let rest = woerter.map((w, i) => ({ w, i })).filter((x) => !codeStellen.includes(x.i));
  // Kopf: Teile am Anfang übernehmen, bis das erste Wort der Bezeichnung kommt
  kopf: while (rest.length) {
    if (!werte.code)
      for (const c of codesLang) {
        const n = c.split(/\s+/).length;
        const text = rest
          .slice(0, n)
          .map((x) => x.w)
          .join(' ');
        if (text.toLowerCase() === c.toLowerCase()) {
          werte.code = text;
          rest = rest.slice(n);
          continue kopf;
        }
      }
    const { w, i } = rest[0];
    // „Entw Grundriss“, „Ab 2027 …“: klein geschrieben ist das ein Wort der Bezeichnung, kein Kürzel – außer an der
    // Stelle der Antragsart mit einem weiteren Kopfteil daneben (Projektcode davor oder Datum danach) oder verrutscht
    // ganz vorn vor Projektcode und Datum („bva HVO 261111 …“, nicht „Entw HVO Grundriss“)
    const folgt = rest.slice(1).map((x) => x.w);
    const codeDanach = codesLang.find((c) => folgt.slice(0, c.split(/\s+/).length).join(' ').toLowerCase() === c.toLowerCase());
    const mitKopf = !!werte.code || gueltigesDatum(rest[1]?.w) || !!codeDanach;
    const vorn = i === 0 && !!codeDanach && gueltigesDatum(folgt[codeDanach.split(/\s+/).length]);
    if (!werte.art && bekannt.has(w.toUpperCase()) && (w === w.toUpperCase() || (i === stelle.art && mitKopf) || vorn)) werte.art = o.art;
    else if (!werte.datum && gueltigesDatum(w)) werte.datum = w;
    else if (!werte.nummer && (istPlannummer(w) || /^\d{1,3}[a-z]?$/.test(w))) werte.nummer = w;
    else break;
    rest = rest.slice(1);
  }
  // ein Projektcode weiter hinten (verrutscht hinter ein Wort der Bezeichnung): herausnehmen statt doppeln
  if (!werte.code)
    for (const c of codesLang) {
      const n = c.split(/\s+/).length;
      const j = rest.findIndex((_, k) =>
        rest
          .slice(k, k + n)
          .map((x) => x.w)
          .join(' ')
          .toLowerCase() === c.toLowerCase(),
      );
      if (j < 0) continue;
      werte.code = rest
        .slice(j, j + n)
        .map((x) => x.w)
        .join(' ');
      rest = [...rest.slice(0, j), ...rest.slice(j + n)];
      break;
    }
  // eine Plannummer von weiter hinten nur, wenn sie eindeutig ist („Lageplan zu GP-02 und GP-03“ bleibt)
  const plannummern = rest.filter((x) => istPlannummer(x.w));
  if (!werte.nummer && plannummern.length === 1) {
    werte.nummer = plannummern[0].w;
    rest = rest.filter((x) => x !== plannummern[0]);
  }
  const wert = (t: NamensTeil) => (t === 'code' ? (werte.code ?? codes[0]) : t === 'art' ? o.art : t === 'datum' ? (werte.datum ?? jjmmtt(o.datum)) : werte.nummer);
  // leere Teile weglassen (kein führendes Leerzeichen ohne Projektcode), dann die Bezeichnung
  return `${[...reihenfolge.map(wert).filter(Boolean), ...rest.map((x) => x.w)].join(' ')}${endung}`;
}

/** bereit: von Hand markiert und seitdem unverändert · offen: noch nicht markiert · name: Namensformat passt nicht · geaendert: nach dem Markieren geändert */
export type Bereitschaft = 'bereit' | 'offen' | 'name' | 'geaendert';

export const BEREIT_TEXT: Record<Bereitschaft, string> = {
  bereit: 'bereit (von Hand markiert)',
  offen: 'noch nicht als bereit markiert',
  name: 'Namensformat passt nicht – kann nicht bereit sein',
  geaendert: 'nach dem Markieren geändert – bitte erneut prüfen',
};

export function bereitschaft(datei: Pick<Eintrag, 'pfad' | 'geaendert'>, markiert: BereitEintrag | undefined, nameFehler: string | null): Bereitschaft {
  if (nameFehler) return 'name';
  if (!markiert) return 'offen';
  if (markiert.stand && datei.geaendert && datei.geaendert > markiert.stand + 2000) return 'geaendert';
  return 'bereit';
}

/** Antragsumfang aus den vorgewählten Einträgen des Katalogs */
/** Antragsumfang aus Katalogeinträgen (ohne Vorlage: die früher vorgewählten) */
export const umfangAusKatalog = (katalog: KatalogEintrag[], vorlage?: AntragsVorlage): UmfangEintrag[] =>
  (vorlage ? dokumenteDerVorlage(katalog, vorlage) : katalog.filter((k) => k.vorgewaehlt)).map(alsUmfang);

/** Katalogeintrag als Dokument des Antragsumfangs */
export const alsUmfang = ({ id, titel, art, formular, quelle, muster, bedingung }: KatalogEintrag): UmfangEintrag => ({ id, titel, art, formular, quelle, muster, ...(hatBedingung(bedingung) ? { bedingung } : {}) });

/* ---------- Ordner im Projektordner: Schreibweisen ---------- */

/** gleichwertige Ordnernamen (nach dem Normalisieren) */
const ORDNER_GLEICH: string[][] = [
  ['genehmigungsplanung', 'genehmigung', 'gp'],
  ['fachplanung', 'fachplaner'],
  ['berechnungen', 'berechnung'],
  ['toeb', 'traegeroeffentlicherbelange'],
];

/** Ordnername zum Vergleichen: Nummern, Unterstriche und Punkte vorn weg („03 Genehmigungsplanung“, „__Berechnungen“) */
const ordnerKern = (name: string) => normal(name.replace(/^[\s\d._-]+/, '')) || normal(name);

/**
 * Passt ein Ordner zum Teil eines Quellpfads? Platzhalter * und ? wie bei Dateien; sonst gleich nach dem Normalisieren
 * oder gleichwertig (Genehmigungsplanung = Genehmigung = GP, Fachplanung = Fachplaner, Berechnungen = Berechnung).
 */
export function ordnerPasst(name: string, teil: string): boolean {
  if (/[*?]/.test(teil)) return glob(teil).test(name.trim());
  const a = ordnerKern(name);
  const b = ordnerKern(teil);
  if (a === b) return true;
  return ORDNER_GLEICH.some((g) => g.includes(a) && g.includes(b));
}

/* ---------- Zuordnung von Dateien ---------- */

/** für Vergleiche: klein, Umlaute ausgeschrieben, nur Buchstaben und Ziffern */
export const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');

function glob(muster: string): RegExp {
  return new RegExp(`^${muster.trim().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
}

/** Passt der Dateiname zum Muster (Platzhalter, mehrere mit „;“)? Ohne Platzhalter: enthält den Text. */
export function passt(name: string, muster: string): boolean {
  return muster
    .split(';')
    .map((m) => m.trim())
    .filter(Boolean)
    .some((m) => (/[*?]/.test(m) ? glob(m).test(name) : normal(name).includes(normal(m))));
}

const nurName = (pfad: string) => pfad.split('/').pop() ?? pfad;

/* ---------- Stand einer Datei: Datum im Namen vor Änderungszeit ---------- */

/** Datum aus einem Dateinamen: Tag als JJJJMMTT, dazu die Uhrzeit HHMM, wenn sie dabeisteht */
export interface NamensDatum {
  tag: number;
  zeit?: number;
}

const gueltig = (j: number, m: number, t: number) => m >= 1 && m <= 12 && t >= 1 && t <= 31 && j >= 1990 && j <= 2099;
const tagZahl = (j: number, m: number, t: number) => j * 10000 + m * 100 + t;
const zeitZahl = (h?: string, min?: string) => (h !== undefined && min !== undefined && Number(h) < 24 && Number(min) < 60 ? Number(h) * 100 + Number(min) : undefined);

/**
 * Das Datum im Dateinamen – so, wie es die Büros schreiben: „BS9 BAUA 261110 Bauantrag“ (JJMMTT, auch mit Uhrzeit
 * „261110_1430“), „20261110“, „2026-11-10“ oder „10.11.2026“. Es zählt das erste Datum im Namen; ein Projektcode am
 * Anfang (`codes`, z. B. eine sechsstellige Projektnummer) wird übergangen. null, wenn keins darin steht.
 */
export function datumAusName(name: string, codes: string[] = []): NamensDatum | null {
  let t = nurName(name).replace(/\.[^.]+$/, '');
  const code = codes.map((c) => c.trim()).find((c) => c && t.toLowerCase().startsWith(c.toLowerCase()) && !/[\dA-Za-z]/.test(t.charAt(c.length)));
  if (code) t = ' '.repeat(code.length) + t.slice(code.length);
  const kandidaten: { pos: number; d: NamensDatum }[] = [];
  const muster: [RegExp, (m: RegExpExecArray) => NamensDatum | null][] = [
    // 2026-11-10, auch mit Uhrzeit 2026-11-10 14-30 / T14:30
    [
      /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?:[ T_-](\d{2})[:.-]?(\d{2}))?(?!\d)/g,
      (m) => (gueltig(+m[1], +m[2], +m[3]) ? { tag: tagZahl(+m[1], +m[2], +m[3]), ...(zeitZahl(m[4], m[5]) !== undefined ? { zeit: zeitZahl(m[4], m[5]) } : {}) } : null),
    ],
    // 10.11.2026 bzw. 10.11.26
    [
      /(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)/g,
      (m) => {
        const j = m[3].length === 2 ? 2000 + +m[3] : +m[3];
        return gueltig(j, +m[2], +m[1]) ? { tag: tagZahl(j, +m[2], +m[1]) } : null;
      },
    ],
    // 20261110, auch 20261110_1430
    [
      /(?<!\d)((?:19|20)\d{2})(\d{2})(\d{2})(?:[_-](\d{2})(\d{2}))?(?!\d)/g,
      (m) => (gueltig(+m[1], +m[2], +m[3]) ? { tag: tagZahl(+m[1], +m[2], +m[3]), ...(zeitZahl(m[4], m[5]) !== undefined ? { zeit: zeitZahl(m[4], m[5]) } : {}) } : null),
    ],
    // 261110, auch 261110_1430
    [
      /(?<!\d)(\d{2})(\d{2})(\d{2})(?:[_-](\d{2})(\d{2}))?(?!\d)/g,
      (m) => (gueltig(2000 + +m[1], +m[2], +m[3]) ? { tag: tagZahl(2000 + +m[1], +m[2], +m[3]), ...(zeitZahl(m[4], m[5]) !== undefined ? { zeit: zeitZahl(m[4], m[5]) } : {}) } : null),
    ],
  ];
  for (const [re, lesen] of muster)
    for (let m = re.exec(t); m; m = re.exec(t)) {
      const d = lesen(m);
      if (d && !kandidaten.some((k) => m!.index >= k.pos && m!.index < k.pos + 10)) kandidaten.push({ pos: m.index, d });
    }
  return kandidaten.sort((a, b) => a.pos - b.pos)[0]?.d ?? null;
}

/** Tag einer Änderungszeit (ms) als JJJJMMTT in Ortszeit */
const tagDerZeit = (ms: number) => {
  const d = new Date(ms);
  return tagZahl(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

/**
 * Welche Datei ist neuer? Maßstab ist zuerst das Datum im Namen (das setzt man beim Erstellen einer Fassung bewusst),
 * erst danach die Änderungszeit – sie ändert sich auch, wenn eine Datei nur noch einmal gespeichert wird.
 *  - Beide mit Datum im Namen: das Datum entscheidet (mit Uhrzeit, wenn beide eine haben); gleich = gleicher Stand.
 *  - Nur eine mit Datum: verglichen mit dem Tag der Änderungszeit der anderen; am selben Tag die Änderungszeit.
 *  - Keine: die Änderungszeit.
 * Liefert > 0, wenn `a` neuer ist, < 0, wenn `b` neuer ist, 0 bei gleichem Stand.
 */
export function standVergleich(a: Pick<Eintrag, 'pfad' | 'geaendert'>, b: Pick<Eintrag, 'pfad' | 'geaendert'>, codes: string[] = []): number {
  const na = datumAusName(a.pfad, codes);
  const nb = datumAusName(b.pfad, codes);
  if (na && nb) {
    if (na.tag !== nb.tag) return na.tag - nb.tag;
    if (na.zeit !== undefined && nb.zeit !== undefined && na.zeit !== nb.zeit) return na.zeit - nb.zeit;
    return 0;
  }
  return standGegenZeit(na, a.geaendert, nb, b.geaendert);
}

/** Vergleich, wenn höchstens eine Seite ein Datum im Namen hat (sonst `standVergleich`) */
function standGegenZeit(na: NamensDatum | null, za: number | undefined, nb: NamensDatum | null, zb: number | undefined): number {
  if (na || nb) {
    const ta = na?.tag ?? (za ? tagDerZeit(za) : null);
    const tb = nb?.tag ?? (zb ? tagDerZeit(zb) : null);
    if (ta !== null && tb !== null && ta !== tb) return ta - tb;
  }
  return (za ?? 0) - (zb ?? 0);
}

/** Die neueste Datei (nach `standVergleich`, bei gleichem Stand die zuletzt geänderte) */
export function neueste<T extends Pick<Eintrag, 'pfad' | 'geaendert'>>(dateien: T[], codes: string[] = []): T | null {
  return dateien.reduce<T | null>((best, d) => {
    if (!best) return d;
    const v = standVergleich(d, best, codes);
    return v > 0 || (v === 0 && (d.geaendert ?? 0) > (best.geaendert ?? 0)) ? d : best;
  }, null);
}

/**
 * Die Datei eines Dokuments im Ordner der Antragsfassung: ausdrücklich verknüpft, sonst nach Muster bzw. Titel
 * (PDF bevorzugt, bei mehreren die neueste – nach dem Datum im Namen, sonst der Änderungszeit).
 */
export function dateiImAntrag(u: UmfangEintrag, dateien: Eintrag[], fassung: string, codes: string[] = []): Eintrag | null {
  const nurDateien = dateien.filter((d) => !d.ordner);
  const verknuepft = u.dateien?.[fassung];
  if (verknuepft) {
    const d = nurDateien.find((x) => nurName(x.pfad).toLowerCase() === verknuepft.toLowerCase());
    if (d) return d;
  }
  const kandidaten = nurDateien.filter((d) => passt(nurName(d.pfad), u.muster || u.titel) || (u.art === 'intern' && !!u.formular && passt(nurName(d.pfad), u.formular)));
  const pdfs = kandidaten.filter((d) => /\.pdf$/i.test(d.pfad));
  return neueste(pdfs.length ? pdfs : kandidaten, codes);
}

/** Quelle eines externen Dokuments (z. B. die Berechnung) – die neueste passende Datei (nach dem Datum im Namen, sonst der Änderungszeit) */
export function quelleVon(u: UmfangEintrag, dateien: Eintrag[], codes: string[] = []): Eintrag | null {
  return neueste(
    dateien.filter((d) => !d.ordner && !/^~\$/.test(nurName(d.pfad)) && passt(nurName(d.pfad), u.muster || u.titel)),
    codes,
  );
}

/** Das Formular eines internen Dokuments im FORMA-Projekt: zugeordnet, sonst nach Name oder Kennung */
export function formularVon<T extends { pfad: string; name: string; kennung?: string | null }>(u: UmfangEintrag, formulare: T[]): T | null {
  if (u.formularDatei) {
    const f = formulare.find((x) => nurName(x.pfad).toLowerCase() === u.formularDatei!.toLowerCase());
    if (f) return f;
  }
  const muster = u.formular || u.titel;
  return formulare.find((f) => (f.kennung && normal(f.kennung) === normal(muster)) || passt(f.name, muster)) ?? null;
}

/* ---------- Vollständigkeit ---------- */

/**
 * grau: fehlt · rot: unvollständig · gelb: ausgefüllt, aber nicht (aktuell) im Antragsordner · grün: aktuell ·
 * entfällt: nach den Antragsmerkmalen nicht erforderlich
 */
export type Status = 'fehlt' | 'unvollstaendig' | 'offen' | 'aktuell' | 'entfaellt';

export const STATUS_TEXT: Record<Status, string> = {
  entfaellt: 'nicht erforderlich (Antragsmerkmale)',
  fehlt: 'fehlt',
  unvollstaendig: 'nicht vollständig ausgefüllt',
  offen: 'noch nicht (aktuell) im Antragsordner',
  aktuell: 'liegt aktuell im Antragsordner',
};

/** Reihenfolge der Status vom besten zum schlimmsten (ohne „entfällt“) */
export const STATUS_REIHE = ['aktuell', 'offen', 'unvollstaendig', 'fehlt'] as const;
export type ZaehlStatus = (typeof STATUS_REIHE)[number];

/** Antragsstatus eines Projekts, berechnet, als es zuletzt geöffnet war – für die Projektübersicht */
export interface ProjektStatus {
  /** Dokumente je Status (ohne „entfällt“); leer = kein Antragsumfang festgelegt */
  anzahl: Partial<Record<ZaehlStatus, number>>;
  /** aktive Antragsfassung, z. B. „BAUA 2“ */
  fassung: string;
  /** berechnet (ms) */
  zeit: number;
  /** der zuletzt angelegte Antrag (mit „eingereicht“) */
  antrag?: AntragKurz;
}

export function projektStatusAus(status: Status[], fassung: string, zeit: number, antrag?: AntragKurz | null): ProjektStatus {
  const anzahl: ProjektStatus['anzahl'] = {};
  for (const st of status) if (st !== 'entfaellt') anzahl[st] = (anzahl[st] ?? 0) + 1;
  return { anzahl, fassung, zeit, ...(antrag ? { antrag } : {}) };
}

export const statusGesamt = (p: ProjektStatus) => STATUS_REIHE.reduce((n, st) => n + (p.anzahl[st] ?? 0), 0);

/** Der schlimmste Status (für den Farbpunkt); null ohne Antragsumfang */
export function schlimmsterStatus(p: ProjektStatus): ZaehlStatus | null {
  for (const st of [...STATUS_REIHE].reverse()) if (p.anzahl[st]) return st;
  return null;
}

/** Gespeicherte Antragsstatus prüfen (je Projektschlüssel) */
export function projektStatusLesen(roh: unknown): Record<string, ProjektStatus> {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return {};
  const out: Record<string, ProjektStatus> = {};
  for (const [k, v] of Object.entries(roh as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    if (typeof o.fassung !== 'string' || typeof o.zeit !== 'number' || !o.anzahl || typeof o.anzahl !== 'object') continue;
    const anzahl: ProjektStatus['anzahl'] = {};
    for (const st of STATUS_REIHE) {
      const n = (o.anzahl as Record<string, unknown>)[st];
      if (typeof n === 'number' && n > 0) anzahl[st] = Math.floor(n);
    }
    const antrag = antragKurzAus(o.antrag);
    out[k] = { anzahl, fassung: o.fassung, zeit: o.zeit, ...(antrag ? { antrag } : {}) };
  }
  return out;
}

export interface Fuellstand {
  gefuellt: number;
  gesamt: number;
}

/**
 * Füllstand eines Formulars wie in der Gliederung: nur angezeigte und erforderliche Abschnitte, Einheiten nach dem
 * Profil ohne die, deren Bedingung (Antragsmerkmal, anderes Feld) nicht zutrifft
 */
export function fuellstand(felder: Feld[][], profil: FormularProfil, wert: (f: Feld) => string | boolean, merkmale: Record<string, string> = {}): Fuellstand {
  const k = formularKontext(merkmale, felder.flat(), wert);
  let gefuellt = 0;
  let gesamt = 0;
  for (const seite of felder)
    for (const a of abschnitte(seite)) {
      if (profil.abschnitte[abschnittId(a)]?.sichtbar === false || !abschnittErforderlich(a, profil, k)) continue;
      for (const e of einheiten(a, profil, k)) {
        if (e.entfaellt) continue;
        gesamt++;
        if (ausgefuellt(e, wert)) gefuellt++;
      }
    }
  return { gefuellt, gesamt };
}

/** Ist ein Dokument des Antragsumfangs nach den Antragsmerkmalen erforderlich? */
export const umfangErforderlich = (u: Pick<UmfangEintrag, 'bedingung'>, merkmale: Record<string, string>) => erfuellt(u.bedingung, { merkmale });

/**
 * Status eines Formulars: unvollständig, solange nicht alle Angaben gemacht sind; sonst aktuell, wenn die PDF im
 * Antragsordner nicht älter ist als die letzte Änderung am Formular (Datei oder ungespeicherte Eingaben). Die PDF
 * zählt mit dem Datum in ihrem Namen („BS9 BAUA 261110 …“): liegt es nach dem Tag der Änderung, ist sie aktuell,
 * davor nicht; am selben Tag (oder ohne Datum im Namen) entscheidet die Änderungszeit.
 */
export function formularStatus(f: Fuellstand, letzteAenderung: number, pdf: Eintrag | null, codes: string[] = []): Status {
  if (f.gefuellt < f.gesamt) return 'unvollstaendig';
  if (!pdf) return 'offen';
  if (!pdf.geaendert && !datumAusName(pdf.pfad, codes)) return 'aktuell';
  return standGegenZeit(datumAusName(pdf.pfad, codes), pdf.geaendert, null, letzteAenderung) >= 0 ? 'aktuell' : 'offen';
}

/**
 * Status eines externen Dokuments: aktuell, wenn die Datei im Antragsordner nicht älter ist als ihre Quelle – nach
 * dem Datum im Namen (gleiches Datum = gleicher Stand, auch wenn die Quelle danach noch einmal gespeichert wurde),
 * sonst nach der Änderungszeit.
 */
export function externStatus(quelle: Eintrag | null, datei: Eintrag | null, codes: string[] = []): Status {
  if (datei) {
    if (!quelle) return 'aktuell';
    const mitDatum = datumAusName(quelle.pfad, codes) || datumAusName(datei.pfad, codes);
    if (!mitDatum && (!quelle.geaendert || !datei.geaendert)) return 'aktuell';
    return standVergleich(datei, quelle, codes) >= 0 ? 'aktuell' : 'offen';
  }
  return quelle ? 'offen' : 'fehlt';
}
