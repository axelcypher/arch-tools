import type { Namensschema } from '@core/namensschema';
import { namensschemaAus, VORGABE_NAMENSSCHEMA } from '@core/namensschema';
import { projektWerte } from '@core/excel/projekt';
import type { ExportContext, Row, Value } from '@core/excel/context';
import type { Anschrift, Bauherr, Bebauungsplan, Beteiligter, Grundstueck, Kontakt, Project, ProjectMeta, ProjektordnerAngaben, ProjektStatus, Koordinaten } from '@core/model';
import { createProject, leereAnschrift, LEISTUNGSPHASEN } from '@core/model';
import { gleich } from '@core/zusammenfuehren';
import { sichererName } from './struktur';

export type { Beteiligter };
export { LEISTUNGSPHASEN };

/**
 * Stammdaten eines Projekts – im Formular des Assistenten. Gespeichert werden sie in der Projektdatei (.oap) des
 * Projektordners: unter `meta` (gemeinsam für alle Apps) und die Angaben dieses Tools unter `projektordner`.
 */
export interface Stammdaten {
  nummer: string;
  kurzname: string;
  /** ausführliche Bezeichnung des Vorhabens (in der Projektdatei: `meta.vorhaben`) */
  bezeichnung: string;
  /** Aktenzeichen der Bauaufsicht */
  aktenzeichen?: string;
  adresse: Anschrift;
  grundstueck: Grundstueck;
  /** Bebauungsplan (Nummer, Name) – fehlt, wenn keiner erfasst ist */
  bebauungsplan?: Bebauungsplan;
  bauherr: Bauherr;
  bearbeiter: string;
  /** Stand: Akquise oder abgeschlossen – fehlt = aktiv (beauftragt) */
  status?: ProjektStatus;
  /** beauftragte Leistungsphasen (1–9); leer = nicht festgelegt */
  leistungsphasen: number[];
  beteiligte: Beteiligter[];
  /** gewählte Vorlagen-Presets; nicht gesetzt = die Standard-Presets der Struktur */
  presets?: string[];
  /** Koordinaten der Adresse (EPSG:25832), von den gemeinsamen Stammdaten abgefragt */
  koordinaten?: Koordinaten;
}

export function leereStammdaten(): Stammdaten {
  return {
    nummer: '',
    kurzname: '',
    bezeichnung: '',
    adresse: leereAnschrift(),
    grundstueck: { gemarkung: '', flur: '', flurstueck: '' },
    bauherr: { name: '', adresse: leereAnschrift(), kontakte: [] },
    bearbeiter: '',
    leistungsphasen: [],
    beteiligte: [],
  };
}

export const isoDatum = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Angaben zu einem vorhandenen Projekt: Stammdaten und was dieses Tool dazu vermerkt hat */
export interface ProjektAngaben extends Stammdaten {
  /** JJJJ-MM-TT, leer wenn unbekannt */
  angelegt: string;
  /** Struktur, nach der der Ordner angelegt bzw. zuletzt ergänzt wurde */
  struktur: string;
  dateischema: string;
}

/** Stammdaten bereinigen: keine Leerzeichen an den Rändern, keine leeren Zeilen */
export function bereinigt(s: Stammdaten): Stammdaten {
  const t = (v: string) => v.trim();
  const a = (x: Anschrift): Anschrift => ({ strasse: t(x.strasse), plz: t(x.plz), ort: t(x.ort) });
  const vorname = s.bauherr.vorname?.trim();
  const bp = { nummer: s.bebauungsplan?.nummer?.trim() ?? '', name: s.bebauungsplan?.name?.trim() ?? '' };
  const bplan = bp.nummer || bp.name ? { ...(bp.nummer ? { nummer: bp.nummer } : {}), ...(bp.name ? { name: bp.name } : {}) } : undefined;
  return {
    nummer: t(s.nummer),
    kurzname: sichererName(s.kurzname),
    bezeichnung: t(s.bezeichnung),
    ...(s.aktenzeichen?.trim() ? { aktenzeichen: s.aktenzeichen.trim() } : {}),
    adresse: a(s.adresse),
    grundstueck: { gemarkung: t(s.grundstueck.gemarkung), flur: t(s.grundstueck.flur), flurstueck: t(s.grundstueck.flurstueck), ...(s.grundstueck.flaeche !== undefined ? { flaeche: s.grundstueck.flaeche } : {}) },
    ...(bplan ? { bebauungsplan: bplan } : {}),
    bauherr: {
      name: t(s.bauherr.name),
      ...(vorname ? { vorname } : {}),
      adresse: a(s.bauherr.adresse),
      kontakte: s.bauherr.kontakte.map((k) => ({ art: k.art, wert: t(k.wert) })).filter((k) => k.wert),
    },
    bearbeiter: t(s.bearbeiter),
    ...(s.status && s.status !== 'aktiv' ? { status: s.status } : {}),
    leistungsphasen: [...new Set(s.leistungsphasen)].sort((x, y) => x - y),
    beteiligte: s.beteiligte.map((b) => ({ rolle: t(b.rolle), name: t(b.name), kontakt: t(b.kontakt) })).filter((b) => b.rolle || b.name || b.kontakt),
    ...(s.presets ? { presets: [...new Set(s.presets.map(t).filter(Boolean))] } : {}),
    ...(s.koordinaten ? { koordinaten: { ...s.koordinaten } } : {}),
  };
}

/* ---------- Projektdatei (.oap) ---------- */

/** Stammdaten als `meta` der Projektdatei (ohne Anlagedatum) */
export function metaAus(stamm: Stammdaten): ProjectMeta {
  const s = bereinigt(stamm);
  const m: ProjectMeta = {
    projektcode: s.nummer,
    adresse: { ...s.adresse },
    grundstueck: { ...s.grundstueck },
    bauherr: { ...s.bauherr, adresse: { ...s.bauherr.adresse }, kontakte: s.bauherr.kontakte.map((k) => ({ ...k })) },
    bearbeiter: s.bearbeiter,
  };
  if (s.kurzname) m.kurzname = s.kurzname;
  // die ausführliche Bezeichnung ist das Vorhaben (so steht es auch in der Projektkarte von FORMA)
  if (s.bezeichnung) m.vorhaben = s.bezeichnung;
  if (s.aktenzeichen) m.aktenzeichen = s.aktenzeichen;
  if (s.bebauungsplan) m.bebauungsplan = { ...s.bebauungsplan };
  if (s.status) m.status = s.status;
  if (s.leistungsphasen.length) m.leistungsphasen = [...s.leistungsphasen];
  if (s.beteiligte.length) m.beteiligte = s.beteiligte.map((b) => ({ ...b }));
  if (s.koordinaten) m.koordinaten = { ...s.koordinaten };
  return m;
}

/** Stammdaten als `meta` für die Eingabefelder – unbereinigt (auch leere Zeilen, die gerade angelegt werden) */
export function formularMeta(s: Stammdaten): ProjectMeta {
  const m: ProjectMeta = { projektcode: s.nummer, adresse: s.adresse, grundstueck: s.grundstueck, bauherr: s.bauherr, bearbeiter: s.bearbeiter, leistungsphasen: s.leistungsphasen, beteiligte: s.beteiligte };
  if (s.kurzname) m.kurzname = s.kurzname;
  if (s.bezeichnung) m.vorhaben = s.bezeichnung;
  if (s.aktenzeichen) m.aktenzeichen = s.aktenzeichen;
  if (s.bebauungsplan) m.bebauungsplan = s.bebauungsplan;
  if (s.status) m.status = s.status;
  if (s.koordinaten) m.koordinaten = s.koordinaten;
  return m;
}

/** Stammdaten aus `meta` (und den Angaben dieses Tools) einer Projektdatei */
export function stammAusMeta(m: ProjectMeta, angaben?: ProjektordnerAngaben): Stammdaten {
  return {
    nummer: m.projektcode,
    kurzname: m.kurzname ?? '',
    bezeichnung: m.vorhaben ?? '',
    ...(m.aktenzeichen ? { aktenzeichen: m.aktenzeichen } : {}),
    adresse: { ...m.adresse },
    grundstueck: { ...m.grundstueck },
    ...(m.bebauungsplan ? { bebauungsplan: { ...m.bebauungsplan } } : {}),
    bauherr: { ...m.bauherr, adresse: { ...m.bauherr.adresse }, kontakte: m.bauherr.kontakte.map((k) => ({ ...k })) },
    bearbeiter: m.bearbeiter,
    ...(m.status ? { status: m.status } : {}),
    leistungsphasen: [...(m.leistungsphasen ?? [])],
    beteiligte: (m.beteiligte ?? []).map((b) => ({ ...b })),
    ...(angaben?.presets ? { presets: [...angaben.presets] } : {}),
    ...(m.koordinaten ? { koordinaten: { ...m.koordinaten } } : {}),
  };
}

/** Angaben eines vorhandenen Projekts aus seiner Projektdatei */
export function angabenAusProjekt(p: Project): ProjektAngaben {
  return { ...stammAusMeta(p.meta, p.projektordner), angelegt: p.meta.angelegt ?? '', struktur: p.projektordner?.struktur ?? '', dateischema: p.projektordner?.dateischema ?? '' };
}

/**
 * Neue Projektdatei: leere Flächenberechnung mit den Stammdaten, dem Anlagedatum und den Angaben dieses Tools
 * (Struktur, Dateischema, gewählte Presets). QUADRIO, TERRIO, NUMIO und PERMIO öffnen sie.
 */
export function alsProject(stamm: Stammdaten, o: { struktur?: { name: string; dateischema: string }; presets?: string[]; date?: Date; namensschema?: Namensschema } = {}): Project {
  const s = bereinigt(stamm);
  const p = createProject(s.bezeichnung || s.kurzname || s.nummer || 'Neues Projekt');
  p.meta = { ...metaAus(s), angelegt: isoDatum(o.date ?? new Date()) };
  if (o.struktur || o.presets) {
    p.projektordner = {
      ...(o.struktur ? { struktur: o.struktur.name, ...(o.struktur.dateischema ? { dateischema: o.struktur.dateischema } : {}) } : {}),
      ...(o.presets ? { presets: [...o.presets] } : {}),
    };
  }
  // Namensschema des Büros: jede Projektdatei trägt ihre Kopie (Kürzel, Stellen, Indizes) – für alle Apps
  p.namensschema = structuredClone(o.namensschema ?? VORGABE_NAMENSSCHEMA);
  return p;
}

const META_TEILE: [keyof ProjectMeta, string][] = [
  ['projektcode', 'Projektnummer'],
  ['kurzname', 'Kurzname'],
  ['vorhaben', 'Bezeichnung'],
  ['aktenzeichen', 'Aktenzeichen'],
  ['adresse', 'Adresse'],
  ['grundstueck', 'Grundstück'],
  ['bebauungsplan', 'Bebauungsplan'],
  ['bauherr', 'Bauherr'],
  ['status', 'Status'],
  ['bearbeiter', 'Bearbeitung'],
  ['leistungsphasen', 'Leistungsphasen'],
  ['beteiligte', 'Beteiligte'],
  ['koordinaten', 'Koordinaten'],
];

/** leere Liste und fehlender Wert gelten als gleich */
const wert = (v: unknown) => (Array.isArray(v) && !v.length ? undefined : v === '' ? undefined : v);

/**
 * Unterfelder, die dieses Tool in den Teilen der Stammdaten kennt (und schreibt) – je Feld darunter die bekannten
 * Unterfelder eines enthaltenen Objekts. Alle übrigen, etwa von einer neueren Fassung einer App angelegt, bleiben beim
 * Ergänzen erhalten, auch wenn der Teil geändert wird.
 */
type Bekannt = { felder: string[]; unter?: Record<string, Bekannt> };
const ANSCHRIFT: Bekannt = { felder: ['strasse', 'plz', 'ort'] };
const BEKANNTE_FELDER: Partial<Record<keyof ProjectMeta, Bekannt>> = {
  adresse: ANSCHRIFT,
  grundstueck: { felder: ['gemarkung', 'flur', 'flurstueck', 'flaeche'] },
  bebauungsplan: { felder: ['nummer', 'name'] },
  bauherr: { felder: ['name', 'vorname', 'adresse', 'kontakte'], unter: { adresse: ANSCHRIFT } },
};
const istObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** neuen Wert eines Teils mit dem bisherigen zusammenführen: bekannte Unterfelder aus `neu`, unbekannte aus `alt` */
function zusammengefuehrt(alt: unknown, neu: unknown, bekannt?: Bekannt): unknown {
  if (!bekannt || !istObjekt(alt) || !istObjekt(neu)) return structuredClone(neu);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(alt)) if (!bekannt.felder.includes(k)) out[k] = structuredClone(v);
  for (const [k, v] of Object.entries(neu)) out[k] = zusammengefuehrt(alt[k], v, bekannt.unter?.[k]);
  return out;
}

export interface ProjektdateiAenderung {
  /** was sich ändert, in Worten („Leistungsphasen“, „Vorlagen-Presets“ …); leer = nichts */
  teile: string[];
  /** wendet die Änderung auf `projekt.json` (Rohdaten, frisch gelesen) an */
  aendern: (roh: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Was beim Ergänzen eines Projekts in seiner Projektdatei geändert wird: die Stammdaten, die im Assistenten
 * geändert wurden (gegenüber dem Stand beim Laden – nicht alles, damit Änderungen anderer Apps in der Zwischenzeit
 * erhalten bleiben), und die Angaben dieses Tools (Struktur, Dateischema, Presets). Gelöscht wird nichts außer
 * dem, was im Assistenten geleert wurde.
 */
export function projektdateiAenderung(
  basis: { meta: ProjectMeta; projektordner?: ProjektordnerAngaben; namensschema?: Namensschema },
  stamm: Stammdaten,
  ziel: { struktur: { name: string; dateischema: string }; presets: string[]; namensschema?: Namensschema },
): ProjektdateiAenderung {
  const neu = metaAus(stamm);
  // verglichen mit dem Stand beim Laden in derselben Form (bereinigt): Leerzeichen am Rand gespeicherter Werte und
  // Unterfelder, die dieses Tool nicht kennt, gelten nicht als Änderung
  const vorher = metaAus(stammAusMeta(basis.meta));
  const geaendert = META_TEILE.filter(([k]) => !gleich(wert(vorher[k]), wert(neu[k])));
  const po: ProjektordnerAngaben = { struktur: ziel.struktur.name, ...(ziel.struktur.dateischema ? { dateischema: ziel.struktur.dateischema } : {}), presets: [...ziel.presets] };
  const alt = basis.projektordner ?? {};
  const poGeaendert = (['struktur', 'dateischema', 'presets'] as const).filter((k) => !gleich(wert(alt[k]), wert(po[k])));
  // Namensschema: fehlt es in der Projektdatei oder weicht es vom Büro ab, wird das des Büros übernommen (beim Ergänzen sichtbar)
  // verglichen in gelesener Form (namensschemaAus) – die Reihenfolge der Schlüssel macht keinen Unterschied
  const schema = namensschemaAus(ziel.namensschema) ?? structuredClone(VORGABE_NAMENSSCHEMA);
  const schemaNeu = JSON.stringify(namensschemaAus(basis.namensschema)) !== JSON.stringify(schema);
  const teile = [
    ...geaendert.map(([, t]) => t),
    ...(poGeaendert.includes('presets') ? ['Vorlagen-Presets'] : []),
    ...(poGeaendert.some((k) => k !== 'presets') ? ['Struktur'] : []),
    ...(schemaNeu ? [basis.namensschema ? 'Namensschema (Stand des Büros)' : 'Namensschema'] : []),
  ];
  return {
    teile,
    aendern: (roh) => {
      const meta = { ...((roh.meta && typeof roh.meta === 'object' ? roh.meta : {}) as Record<string, unknown>) };
      for (const [k] of geaendert) {
        if (neu[k] === undefined) delete meta[k];
        else meta[k] = zusammengefuehrt(meta[k], neu[k], BEKANNTE_FELDER[k]);
      }
      const bisher = (roh.projektordner && typeof roh.projektordner === 'object' ? roh.projektordner : {}) as Record<string, unknown>;
      const projektordner = { ...bisher };
      for (const k of poGeaendert) {
        if (po[k] === undefined) delete projektordner[k];
        else projektordner[k] = structuredClone(po[k]);
      }
      return { ...roh, meta, ...(poGeaendert.length ? { projektordner } : {}), ...(schemaNeu ? { namensschema: structuredClone(schema) } : {}) };
    },
  };
}

/* ---------- alte projekt.json (bis Version 0.2) – wird nur noch gelesen ---------- */

/** Stammdaten lagen früher in einer eigenen Datei im Projektordner; sie bleibt liegen und wird nur gelesen */
export const PROJEKT_DATEI = 'projekt.json';
export const PROJEKT_FORMAT = 'projektordner';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const anschrift = (v: unknown): Anschrift => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { strasse: str(o.strasse), plz: str(o.plz), ort: str(o.ort) };
};

/** Liest eine alte projekt.json; wirft bei fremden oder kaputten Dateien */
export function leseProjektJson(json: string): ProjektAngaben {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(json) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`kein gültiges JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!o || typeof o !== 'object' || o.format !== PROJEKT_FORMAT) throw new Error('keine Projektdatei dieses Tools (Feld „format“ fehlt)');
  const g = (o.grundstueck && typeof o.grundstueck === 'object' ? o.grundstueck : {}) as Record<string, unknown>;
  const b = (o.bauherr && typeof o.bauherr === 'object' ? o.bauherr : {}) as Record<string, unknown>;
  return {
    nummer: str(o.nummer),
    kurzname: str(o.kurzname),
    bezeichnung: str(o.bezeichnung),
    adresse: anschrift(o.adresse),
    grundstueck: {
      gemarkung: str(g.gemarkung),
      flur: str(g.flur),
      flurstueck: str(g.flurstueck),
      ...(typeof g.flaeche === 'number' && Number.isFinite(g.flaeche) ? { flaeche: g.flaeche } : {}),
    },
    bauherr: {
      name: str(b.name),
      adresse: anschrift(b.adresse),
      kontakte: (Array.isArray(b.kontakte) ? b.kontakte : [])
        .filter((k): k is Kontakt => !!k && typeof k === 'object' && ((k as Kontakt).art === 'email' || (k as Kontakt).art === 'telefon') && typeof (k as Kontakt).wert === 'string')
        .map((k) => ({ art: k.art, wert: k.wert })),
    },
    bearbeiter: str(o.bearbeiter),
    leistungsphasen: (Array.isArray(o.leistungsphasen) ? o.leistungsphasen : []).filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 9),
    beteiligte: (Array.isArray(o.beteiligte) ? o.beteiligte : [])
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({ rolle: str(x.rolle), name: str(x.name), kontakt: str(x.kontakt) })),
    ...(Array.isArray(o.presets) ? { presets: o.presets.filter((n): n is string => typeof n === 'string' && !!n.trim()).map((n) => n.trim()) } : {}),
    angelegt: str(o.angelegt),
    struktur: str(o.struktur),
    dateischema: str(o.dateischema),
  };
}

/** Lücken der Angaben aus der Projektdatei mit der alten projekt.json füllen (Übergang) */
export function mitAlterProjektJson(a: ProjektAngaben, alt: ProjektAngaben): ProjektAngaben {
  const leer = (v: unknown) => v === undefined || v === '' || (Array.isArray(v) && !v.length);
  const out = { ...a } as Record<string, unknown>;
  for (const [k, v] of Object.entries(alt)) if (leer(out[k]) && !leer(v)) out[k] = v;
  return out as unknown as ProjektAngaben;
}

/* ---------- Platzhalter ---------- */

/**
 * Werte für Platzhalter in Vorlagen. Die Projektangaben heißen wie in den Excel-Vorlagen der anderen Werkzeuge
 * ({{projekt.name}}, {{bauherr.name}} …), dazu kommen die Angaben dieses Tools.
 */
export function platzhalter(s: Stammdaten, ordner: string, date = new Date()): ExportContext {
  const scalars: Record<string, Value> = {
    ...projektWerte(alsProject(s, { date }), date),
    'projekt.nummer': s.nummer,
    'projekt.kurzname': s.kurzname,
    'projekt.bezeichnung': s.bezeichnung,
    'projekt.ordner': ordner,
    'projekt.leistungsphasen': s.leistungsphasen.join(', '),
    'datum.iso': isoDatum(date),
    jahr: date.getFullYear(),
    beteiligte: s.beteiligte.map((b) => [b.rolle && `${b.rolle}:`, b.name, b.kontakt && `(${b.kontakt})`].filter(Boolean).join(' ')).join('\n'),
    // kurze Namen für Datei- und Ordnernamen
    nummer: s.nummer,
    kurzname: s.kurzname,
  };
  const beteiligter: Row[] = s.beteiligte.map((b, i) => ({ nr: i + 1, rolle: b.rolle, name: b.name, kontakt: b.kontakt }));
  const lph: Row[] = LEISTUNGSPHASEN.filter((l) => s.leistungsphasen.includes(l.nr)).map((l) => ({ nr: l.nr, name: l.label }));
  return { scalars, collections: { beteiligter, lph } };
}
