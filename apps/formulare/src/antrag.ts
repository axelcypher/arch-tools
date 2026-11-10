/**
 * Antrag und Export: Wohin die ausgefüllten Formulare als PDF kommen, wie die Dateien heißen und welche Dokumente
 * zu einem Antrag gehören (Projektumfang) – samt Prüfung, ob sie im Ordner der aktiven Antragsfassung vollständig
 * und aktuell vorliegen.
 *
 * Ablage im echten Projektordner (einstellbar): `<Projekt>/TÖB/BAUA` – bei mehreren Fassungen `BAUA 2`, `BAUA3` …,
 * daneben andere Antragsarten wie `BAUVA` (Voranfrage) oder `DENK` (Denkmal). Die aktive Fassung ist zugleich das
 * Ziel des Exports. Unsere Dateien heißen `<Kürzel> <Phase> <JJMMTT> [Nr] <Name>`, z. B. „BS9 GP 261110 Bauantrag.pdf“.
 */

import type { Bedingung } from './bedingung';
import { bedingungAus, erfuellt } from './bedingung';
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
  namensvorlage: '{Kürzel} {Phase} {Datum} {Nr} {Name}',
  phase: 'GP',
  ziel: 'aktiv',
  zielpfad: 'TÖB/{Antrag}',
  berechnungsordner: 'Planung/Berechnungen',
  vorlagenordner: '',
};

/** Was je Projekt abweichen darf (wie die angezeigten Pfade im Projektordner) */
export type ExportUeberschreibung = Partial<Pick<ExportEinstellungen, 'namensvorlage' | 'phase' | 'ziel' | 'zielpfad' | 'antragsordner'>>;

export const UEBERSCHREIBBAR: (keyof ExportUeberschreibung)[] = ['antragsordner', 'namensvorlage', 'phase', 'ziel', 'zielpfad'];

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
  /** Name des Dokuments (Titel im Projektumfang, sonst der Name des Formulars) */
  name: string;
  /** Dateiname des Formulars ohne Endung */
  formular?: string;
  /** aktive Antragsfassung, z. B. „BAUA 2“ */
  antrag?: string;
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
  { name: '{Nr}', text: 'Nummer im Projektumfang (entfällt, wenn leer)' },
  { name: '{Name}', text: 'Titel im Projektumfang, sonst Name des Formulars' },
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

/** Name der nächsten Fassung einer Art: „BAUA“, dann „BAUA 2“, „BAUA 3“ … */
export function naechsteFassung(fassungen: Fassung[], art: string): string {
  const da = fassungen.filter((f) => f.art === art.toUpperCase());
  if (!da.length) return art.toUpperCase();
  return `${art.toUpperCase()} ${Math.max(...da.map((f) => f.nr)) + 1}`;
}

/* ---------- Katalog und Projektumfang ---------- */

export type DokArt = 'intern' | 'extern';

export interface KatalogEintrag {
  id: string;
  titel: string;
  /** intern: Formular aus FORMA; extern: Datei aus dem Projektordner (Berechnung, Plan, fremde PDF) */
  art: DokArt;
  /** intern: Teil des Formularnamens oder Kennung (z. B. „Bauantrag“ oder „nw010005“) */
  formular?: string;
  /** extern: Ordner der Quelle relativ zum Projektordner (z. B. „Planung/Berechnungen“) */
  quelle?: string;
  /** Muster der Datei – Platzhalter * und ?, mehrere mit „;“ getrennt (sonst der Titel) */
  muster?: string;
  /** in neuen Projekten vorgewählt */
  vorgewaehlt: boolean;
  /** nur erforderlich, wenn die Projektmerkmale zutreffen (z. B. Gebäudeklasse 3–5) */
  bedingung?: Bedingung;
}

/** Grundlegende Antragsdokumente – in den Einstellungen anpassbar */
export const VORGABE_KATALOG: KatalogEintrag[] = [
  { id: 'bauantrag', titel: 'Bauantrag', art: 'intern', formular: 'Bauantrag', vorgewaehlt: true },
  { id: 'baubeschreibung', titel: 'Baubeschreibung', art: 'intern', formular: 'Baubeschreibung', vorgewaehlt: true },
  { id: 'betriebsbeschreibung', titel: 'Betriebsbeschreibung', art: 'intern', formular: 'Betriebsbeschreibung', vorgewaehlt: false },
  { id: 'statistik', titel: 'Statistischer Erhebungsbogen', art: 'intern', formular: 'Statisti', vorgewaehlt: true },
  { id: 'standsicherheit', titel: 'Erklärung zum Standsicherheitsnachweis', art: 'intern', formular: 'Standsicherheit', vorgewaehlt: false },
  { id: 'lageplan', titel: 'Lageplan', art: 'extern', quelle: 'Planung', muster: '*Lageplan*', vorgewaehlt: true },
  { id: 'zeichnungen', titel: 'Bauzeichnungen', art: 'extern', quelle: 'Planung', muster: '*Grundri*;*Schnitt*;*Ansicht*', vorgewaehlt: true },
  { id: 'grz', titel: 'Berechnung GRZ/GFZ', art: 'extern', quelle: 'Planung/Berechnungen', muster: '*GRZ*;*GFZ*', vorgewaehlt: true },
  { id: 'flaechen', titel: 'Flächenberechnung', art: 'extern', quelle: 'Planung/Berechnungen', muster: '*Fläche*;*Flaeche*;*BRI*;*Wohnfl*', vorgewaehlt: true },
  { id: 'kosten', titel: 'Kostenermittlung', art: 'extern', quelle: 'Planung/Berechnungen', muster: '*Kosten*', vorgewaehlt: true },
  { id: 'stellplaetze', titel: 'Stellplatznachweis', art: 'extern', quelle: 'Planung/Berechnungen', muster: '*Stellpl*', vorgewaehlt: false },
];

export function katalogAus(roh: unknown): KatalogEintrag[] {
  if (!Array.isArray(roh)) return VORGABE_KATALOG;
  return roh
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as { titel?: unknown }).titel === 'string')
    .map((e, i) => ({
      id: typeof e.id === 'string' && e.id ? e.id : `k${i + 1}`,
      titel: String(e.titel),
      art: e.art === 'extern' ? 'extern' : 'intern',
      formular: typeof e.formular === 'string' ? e.formular : undefined,
      quelle: typeof e.quelle === 'string' ? e.quelle : undefined,
      muster: typeof e.muster === 'string' ? e.muster : undefined,
      vorgewaehlt: e.vorgewaehlt === true,
      bedingung: bedingungAus(e.bedingung)?.filter((t) => t.art === 'merkmal'),
    }));
}

/** Dokument im Projektumfang eines Projekts */
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
  /** nur erforderlich, wenn die Projektmerkmale zutreffen */
  bedingung?: Bedingung;
}

/** Angaben der App zum Projekt – Abschnitt „formulare“ der Projektdatei (.oap), für alle im Büro gleich */
export interface ProjektDatei {
  /** aktive Antragsfassung (Ordnername) */
  aktiveFassung?: string;
  /** Projektumfang; fehlt = nicht festgelegt (keine Vollständigkeitsprüfung) */
  umfang?: UmfangEintrag[];
  /** Projektmerkmale (Gebäudeklasse, Sonderbau …): Name → Wert, gilt für alle Formulare */
  merkmale?: Record<string, string>;
}

export function projektDateiAus(roh: unknown): ProjektDatei {
  const o = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
  const out: ProjektDatei = {};
  if (typeof o.aktiveFassung === 'string' && o.aktiveFassung.trim()) out.aktiveFassung = o.aktiveFassung.trim();
  if (Array.isArray(o.umfang))
    out.umfang = o.umfang
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as { titel?: unknown }).titel === 'string')
      .map((e, i) => {
        const u: UmfangEintrag = { id: typeof e.id === 'string' && e.id ? e.id : `u${i + 1}`, titel: String(e.titel), art: e.art === 'extern' ? 'extern' : 'intern' };
        for (const k of ['formular', 'quelle', 'muster', 'nr', 'formularDatei'] as const) if (typeof e[k] === 'string' && e[k]) u[k] = e[k] as string;
        if (e.dateien && typeof e.dateien === 'object')
          u.dateien = Object.fromEntries(Object.entries(e.dateien as Record<string, unknown>).filter((x): x is [string, string] => typeof x[1] === 'string'));
        const b = bedingungAus(e.bedingung)?.filter((t) => t.art === 'merkmal');
        if (b?.length) u.bedingung = b;
        return u;
      });
  if (o.merkmale && typeof o.merkmale === 'object') {
    const m = Object.fromEntries(Object.entries(o.merkmale as Record<string, unknown>).filter((x): x is [string, string] => typeof x[1] === 'string' && !!x[1]));
    if (Object.keys(m).length) out.merkmale = m;
  }
  return out;
}

/** Projektumfang aus den vorgewählten Einträgen des Katalogs */
export const umfangAusKatalog = (katalog: KatalogEintrag[]): UmfangEintrag[] =>
  katalog
    .filter((k) => k.vorgewaehlt)
    .map(({ id, titel, art, formular, quelle, muster, bedingung }) => ({ id, titel, art, formular, quelle, muster, ...(bedingung?.length ? { bedingung } : {}) }));

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

/**
 * Die Datei eines Dokuments im Ordner der Antragsfassung: ausdrücklich verknüpft, sonst nach Muster bzw. Titel
 * (PDF bevorzugt, bei mehreren die neueste).
 */
export function dateiImAntrag(u: UmfangEintrag, dateien: Eintrag[], fassung: string): Eintrag | null {
  const nurDateien = dateien.filter((d) => !d.ordner);
  const verknuepft = u.dateien?.[fassung];
  if (verknuepft) {
    const d = nurDateien.find((x) => nurName(x.pfad).toLowerCase() === verknuepft.toLowerCase());
    if (d) return d;
  }
  const kandidaten = nurDateien.filter((d) => passt(nurName(d.pfad), u.muster || u.titel) || (u.art === 'intern' && !!u.formular && passt(nurName(d.pfad), u.formular)));
  const pdfs = kandidaten.filter((d) => /\.pdf$/i.test(d.pfad));
  const auswahl = pdfs.length ? pdfs : kandidaten;
  return auswahl.reduce<Eintrag | null>((best, d) => (!best || (d.geaendert ?? 0) > (best.geaendert ?? 0) ? d : best), null);
}

/** Quelle eines externen Dokuments (z. B. die Berechnung) – die neueste passende Datei */
export function quelleVon(u: UmfangEintrag, dateien: Eintrag[]): Eintrag | null {
  const passend = dateien.filter((d) => !d.ordner && !/^~\$/.test(nurName(d.pfad)) && passt(nurName(d.pfad), u.muster || u.titel));
  return passend.reduce<Eintrag | null>((best, d) => (!best || (d.geaendert ?? 0) > (best.geaendert ?? 0) ? d : best), null);
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
 * entfällt: nach den Projektmerkmalen nicht erforderlich
 */
export type Status = 'fehlt' | 'unvollstaendig' | 'offen' | 'aktuell' | 'entfaellt';

export const STATUS_TEXT: Record<Status, string> = {
  entfaellt: 'nicht erforderlich (Projektmerkmale)',
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
  /** Dokumente je Status (ohne „entfällt“); leer = kein Projektumfang festgelegt */
  anzahl: Partial<Record<ZaehlStatus, number>>;
  /** aktive Antragsfassung, z. B. „BAUA 2“ */
  fassung: string;
  /** berechnet (ms) */
  zeit: number;
}

export function projektStatusAus(status: Status[], fassung: string, zeit: number): ProjektStatus {
  const anzahl: ProjektStatus['anzahl'] = {};
  for (const st of status) if (st !== 'entfaellt') anzahl[st] = (anzahl[st] ?? 0) + 1;
  return { anzahl, fassung, zeit };
}

export const statusGesamt = (p: ProjektStatus) => STATUS_REIHE.reduce((n, st) => n + (p.anzahl[st] ?? 0), 0);

/** Der schlimmste Status (für den Farbpunkt); null ohne Projektumfang */
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
    out[k] = { anzahl, fassung: o.fassung, zeit: o.zeit };
  }
  return out;
}

export interface Fuellstand {
  gefuellt: number;
  gesamt: number;
}

/**
 * Füllstand eines Formulars wie in der Gliederung: nur angezeigte und erforderliche Abschnitte, Einheiten nach dem
 * Profil ohne die, deren Bedingung (Projektmerkmal, anderes Feld) nicht zutrifft
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

/** Ist ein Dokument des Projektumfangs nach den Projektmerkmalen erforderlich? */
export const umfangErforderlich = (u: Pick<UmfangEintrag, 'bedingung'>, merkmale: Record<string, string>) => erfuellt(u.bedingung, { merkmale });

/**
 * Status eines Formulars: unvollständig, solange nicht alle Angaben gemacht sind; sonst aktuell, wenn die PDF
 * im Antragsordner nach der letzten Änderung (Datei oder ungespeicherte Eingaben) entstanden ist.
 */
export function formularStatus(f: Fuellstand, letzteAenderung: number, pdf: Eintrag | null): Status {
  if (f.gefuellt < f.gesamt) return 'unvollstaendig';
  if (!pdf) return 'offen';
  return (pdf.geaendert ?? 0) >= letzteAenderung || !pdf.geaendert ? 'aktuell' : 'offen';
}

/** Status eines externen Dokuments: aktuell, wenn die Datei im Antragsordner nicht älter ist als ihre Quelle */
export function externStatus(quelle: Eintrag | null, datei: Eintrag | null): Status {
  if (datei) return !quelle || !quelle.geaendert || !datei.geaendert || datei.geaendert >= quelle.geaendert ? 'aktuell' : 'offen';
  return quelle ? 'offen' : 'fehlt';
}
