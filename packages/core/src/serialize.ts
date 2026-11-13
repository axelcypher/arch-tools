import { namensschemaAus } from './namensschema';
import type {
  AntragKurz,
  Anschrift,
  Background,
  Bauherr,
  DateiArt,
  Bebauungsplan,
  Einstufung,
  Gebietsart,
  Grundstueck,
  GrundstuecksGrenze,
  HoehenAnteile,
  KontaktArt,
  ProjektordnerAngaben,
  Kosten,
  KostenBezug,
  KostenPosition,
  KostenStufe,
  Kontrollmass,
  LageplanFlaeche,
  LageplanNutzung,
  Massgrundlage,
  MassNutzung,
  Nutzungsgruppe,
  Project,
  ProjectSettings,
  ProjectMeta,
  ProjektDatei,
  RasterBackground,
  Shape,
  Spanne,
  Storey,
  VectorBackground,
  Versiegelung,
  WoflKategorie,
} from './model';
import { anschriftAusText, createProject, GEBIETSARTEN, KOSTEN_BEZUEGE, KOSTEN_STUFEN, newId } from './model';
import { NUTZUNGSGRUPPEN, WOFL_KATEGORIEN } from './norms';
import type { Gaube, GaubenTyp } from './gaube';
import type { Dach, DachTyp } from './roof';
import { DACH_TYPEN } from './roof';

/** Reine JSON-Fassung (ohne mitgespeicherte Originaldateien – dafür das Projektarchiv, siehe archive.ts) */
export function serializeProject(p: Project): string {
  const { dateien: _, ...rest } = p;
  return JSON.stringify(mitErweiterungen(rest), null, 2);
}

/** Abschnitte, die das Projektmodell kennt – alle anderen landen in `erweiterungen` */
const BEKANNTE_ABSCHNITTE = new Set([
  'format',
  'version',
  'name',
  'meta',
  'settings',
  'storeys',
  'dachModell',
  'gelaendeModell',
  'ifcBekannt',
  'ifcUmrisse',
  'dateien',
  'lageplan',
  'massNutzung',
  'kosten',
  'projektordner',
  'formulare',
  'namensschema',
  'erweiterungen',
]);

/** Unbekannte Abschnitte wieder auf die oberste Ebene (zum Schreiben); bekannte gehen vor */
export function mitErweiterungen<T extends { erweiterungen?: Record<string, unknown> }>(p: T): Omit<T, 'erweiterungen'> {
  const { erweiterungen, ...rest } = p;
  const fremd = Object.fromEntries(Object.entries(erweiterungen ?? {}).filter(([k]) => !BEKANNTE_ABSCHNITTE.has(k)));
  return { ...fremd, ...rest };
}

/** Projektdatei nicht lesbar: `message` ist für die Anwender, `technisch` die Einzelheit für das Protokoll */
export class ProjectFormatError extends Error {
  constructor(
    message: string,
    readonly technisch?: string,
  ) {
    super(message);
  }
}

/** Meldung für alles, was keine Projektdatei ist (kaputt, falsche Datei, andere Anwendung) */
export const KEINE_PROJEKTDATEI = 'Keine gültige Projektdatei (.oap) – beschädigt oder aus einer anderen Anwendung.';

/**
 * Liest eine Projektdatei ein, ergänzt fehlende Felder mit Standardwerten
 * und prüft die Grundstruktur. Späteren Formatversionen dient das als Migrationspunkt.
 */
export function parseProject(json: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new ProjectFormatError(KEINE_PROJEKTDATEI, `kein gültiges JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  return parseProjectData(raw);
}

/** Wie parseProject, aber für bereits gelesene Daten (Archiv, Autosave mit Originaldateien als Uint8Array) */
export function parseProjectData(raw: unknown): Project {
  if (!isObj(raw) || raw.format !== 'arch-flaechen-tool') {
    throw new ProjectFormatError(KEINE_PROJEKTDATEI, 'Kennung „format: arch-flaechen-tool“ fehlt');
  }
  if (raw.version !== 1) {
    throw new ProjectFormatError(`Nicht unterstützte Dateiversion: ${String(raw.version)}`);
  }
  const base = createProject();
  const storeysRaw = Array.isArray(raw.storeys) ? raw.storeys : [];
  const project: Project = {
    format: 'arch-flaechen-tool',
    version: 1,
    name: str(raw.name, base.name),
    meta: normalizeMeta(raw.meta),
    settings: normalizeSettings(raw.settings, base.settings),
    // Lageplan-Geschosse aus 0.7.0 gehören nicht zum Gebäude – ihre Flächen wandern in project.lageplan
    storeys: storeysRaw.filter(isObj).filter((s) => s.lageplan !== true).map(normalizeStorey),
  };
  if (project.storeys.length === 0) project.storeys = base.storeys;
  // Lageplan: eigener Projektteil, früher (0.7.0) Flächen in einem Lageplan-Geschoss
  const lpRoh = [
    ...(isObj(raw.lageplan) && Array.isArray(raw.lageplan.flaechen) ? raw.lageplan.flaechen : []),
    ...storeysRaw.filter(isObj).filter((s) => s.lageplan === true).flatMap((s) => (Array.isArray(s.shapes) ? s.shapes : [])),
  ];
  const flaechen = lpRoh.filter(isObj).map(normalizeFlaeche).filter((f): f is LageplanFlaeche => f !== null);
  if (flaechen.length || isObj(raw.lageplan)) project.lageplan = { flaechen };
  if (project.lageplan && isObj(raw.lageplan)) {
    const grenze = (Array.isArray(raw.lageplan.grenze) ? raw.lageplan.grenze : []).filter(isObj).flatMap((g): GrundstuecksGrenze[] => {
      const points = (Array.isArray(g.points) ? g.points : []).filter(isObj).map((q) => ({ x: num(q.x, NaN), y: num(q.y, NaN) })).filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
      return points.length >= 3 ? [{ id: str(g.id, newId('gr')), name: str(g.name, 'Flurstück'), points }] : [];
    });
    if (grenze.length) project.lageplan.grenze = grenze;
    const unterlage = normalizeBackground(raw.lageplan.unterlage);
    if (unterlage) project.lageplan.unterlage = unterlage;
  }
  if (isObj(raw.massNutzung)) project.massNutzung = normalizeMassNutzung(raw.massNutzung);
  if (isObj(raw.kosten)) project.kosten = normalizeKosten(raw.kosten);
  if (Array.isArray(raw.dateien)) {
    const dateien = raw.dateien.filter(isObj).map(normalizeDatei).filter((d): d is ProjektDatei => d !== null);
    if (dateien.length) project.dateien = dateien;
  }
  if (isObj(raw.dachModell) && Array.isArray(raw.dachModell.triangles)) {
    project.dachModell = { name: str(raw.dachModell.name, 'Modell'), triangles: raw.dachModell.triangles.filter((v): v is number => typeof v === 'number') };
  }
  if (Array.isArray(raw.ifcUmrisse)) {
    const u = raw.ifcUmrisse
      .filter(isObj)
      .filter((x) => typeof x.geschoss === 'string' && Array.isArray(x.points))
      .map((x) => ({ geschoss: x.geschoss as string, points: (x.points as unknown[]).filter(isObj).map((q) => ({ x: Number(q.x) || 0, y: Number(q.y) || 0 })) }))
      .filter((x) => x.points.length >= 3);
    if (u.length) project.ifcUmrisse = u;
  }
  if (Array.isArray(raw.ifcBekannt)) {
    const ids = raw.ifcBekannt.filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (ids.length) project.ifcBekannt = ids;
  }
  if (isObj(raw.gelaendeModell) && Array.isArray(raw.gelaendeModell.triangles)) {
    project.gelaendeModell = { name: str(raw.gelaendeModell.name, 'Gelände'), triangles: raw.gelaendeModell.triangles.filter((v): v is number => typeof v === 'number') };
  }
  if (isObj(raw.projektordner)) {
    const po = normalizeProjektordner(raw.projektordner);
    if (Object.keys(po).length) project.projektordner = po;
  }
  // Abschnitt von PERMIO: unverändert durchgereicht (die App prüft ihn selbst)
  if (raw.formulare !== undefined && raw.formulare !== null) project.formulare = raw.formulare;
  const schema = namensschemaAus(raw.namensschema);
  if (schema) project.namensschema = schema;
  // was diese Fassung nicht kennt, bleibt erhalten (neuere Fassungen, andere Apps)
  const fremd = Object.entries(raw).filter(([k, v]) => !BEKANNTE_ABSCHNITTE.has(k) && v !== undefined);
  if (fremd.length) project.erweiterungen = Object.fromEntries(fremd);
  return project;
}

function normalizeProjektordner(v: Record<string, unknown>): ProjektordnerAngaben {
  const out: ProjektordnerAngaben = {};
  if (typeof v.struktur === 'string' && v.struktur.trim()) out.struktur = v.struktur.trim();
  if (typeof v.dateischema === 'string' && v.dateischema.trim()) out.dateischema = v.dateischema.trim();
  if (Array.isArray(v.presets)) out.presets = [...new Set(v.presets.filter((n): n is string => typeof n === 'string' && !!n.trim()).map((n) => n.trim()))];
  return out;
}

function normalizeAnschrift(v: unknown): Anschrift {
  // bis 0.5: Adresse als Freitext
  if (typeof v === 'string') return anschriftAusText(v);
  const a = isObj(v) ? v : {};
  return { strasse: str(a.strasse, ''), plz: str(a.plz, ''), ort: str(a.ort, '') };
}

function normalizeMeta(v: unknown): ProjectMeta {
  const m = isObj(v) ? v : {};
  const g = isObj(m.grundstueck) ? m.grundstueck : {};
  const b = isObj(m.bauherr) ? m.bauherr : {};
  const grundstueck: Grundstueck = { gemarkung: str(g.gemarkung, ''), flur: str(g.flur, ''), flurstueck: str(g.flurstueck, '') };
  if (typeof g.flaeche === 'number' && Number.isFinite(g.flaeche)) grundstueck.flaeche = g.flaeche;
  const bauherr: Bauherr = {
    name: str(b.name, ''),
    adresse: normalizeAnschrift(b.adresse),
    kontakte: (Array.isArray(b.kontakte) ? b.kontakte : [])
      .filter(isObj)
      .map((k) => ({ art: oneOf<KontaktArt>(k.art, ['email', 'telefon'], 'telefon'), wert: str(k.wert, '') })),
  };
  if (typeof b.vorname === 'string' && b.vorname) bauherr.vorname = b.vorname;
  const meta: ProjectMeta = { projektcode: str(m.projektcode, ''), adresse: normalizeAnschrift(m.adresse), grundstueck, bauherr, bearbeiter: str(m.bearbeiter, '') };
  // erst später ergänzt: nur, wenn vorhanden
  if (typeof m.kurzname === 'string' && m.kurzname) meta.kurzname = m.kurzname;
  if (typeof m.vorhaben === 'string' && m.vorhaben) meta.vorhaben = m.vorhaben;
  if (typeof m.aktenzeichen === 'string' && m.aktenzeichen) meta.aktenzeichen = m.aktenzeichen;
  if (isObj(m.bebauungsplan)) {
    const bp: Bebauungsplan = {};
    if (typeof m.bebauungsplan.nummer === 'string' && m.bebauungsplan.nummer.trim()) bp.nummer = m.bebauungsplan.nummer;
    if (typeof m.bebauungsplan.name === 'string' && m.bebauungsplan.name.trim()) bp.name = m.bebauungsplan.name;
    if (bp.nummer || bp.name) meta.bebauungsplan = bp;
  }
  if (isObj(m.koordinaten)) {
    const k = m.koordinaten;
    const zahl = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    if (zahl(k.ost) && zahl(k.nord) && zahl(k.lat) && zahl(k.lon))
      meta.koordinaten = {
        epsg: 25832,
        ost: k.ost as number,
        nord: k.nord as number,
        lat: k.lat as number,
        lon: k.lon as number,
        adresse: str(k.adresse, ''),
        quelle: str(k.quelle, ''),
        stand: str(k.stand, ''),
        ...(k.genauigkeit === 'adresse' || k.genauigkeit === 'strasse' || k.genauigkeit === 'ort' ? { genauigkeit: k.genauigkeit } : {}),
      };
  }
  if (Array.isArray(m.leistungsphasen)) {
    const lph = [...new Set(m.leistungsphasen.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 9))].sort((a, b) => a - b);
    if (lph.length) meta.leistungsphasen = lph;
  }
  if (Array.isArray(m.beteiligte)) {
    const bt = m.beteiligte
      .filter(isObj)
      .map((x) => ({ rolle: str(x.rolle, ''), name: str(x.name, ''), kontakt: str(x.kontakt, '') }))
      .filter((x) => x.rolle || x.name || x.kontakt);
    if (bt.length) meta.beteiligte = bt;
  }
  if (typeof m.angelegt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.angelegt)) meta.angelegt = m.angelegt;
  if (isObj(m.merkmale)) {
    const mk = Object.entries(m.merkmale).filter((e): e is [string, string] => typeof e[1] === 'string' && !!e[0].trim());
    if (mk.length) meta.merkmale = Object.fromEntries(mk);
  }
  if (m.status === 'akquise' || m.status === 'aktiv' || m.status === 'abgeschlossen') meta.status = m.status;
  const a = antragKurzAus(m.antrag);
  if (a) meta.antrag = a;
  return meta;
}

const TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Kurzfassung eines Antrags (meta.antrag); null, wenn ungültig */
export function antragKurzAus(roh: unknown): AntragKurz | null {
  if (!isObj(roh) || typeof roh.name !== 'string' || !roh.name.trim()) return null;
  const a: AntragKurz = { name: roh.name.trim() };
  if (typeof roh.angelegt === 'string' && TAG.test(roh.angelegt)) a.angelegt = roh.angelegt;
  const e = roh.eingereicht;
  if (isObj(e) && typeof e.datum === 'string' && TAG.test(e.datum) && ((typeof e.datei === 'string' && e.datei) || e.manuell === true))
    a.eingereicht = { ...(typeof e.datei === 'string' && e.datei ? { datei: e.datei } : {}), datum: e.datum, ...(e.manuell === true ? { manuell: true } : {}) };
  return a;
}

const NUTZUNGEN: LageplanNutzung[] = ['zufahrt', 'stellplatz', 'garage', 'terrasse', 'weg', 'nebenanlage', 'unterirdisch', 'garten', 'sonstige'];

function normalizeFlaeche(f: Record<string, unknown>): LageplanFlaeche | null {
  const points = (Array.isArray(f.points) ? f.points : [])
    .filter(isObj)
    .map((p) => ({ x: num(p.x, NaN), y: num(p.y, NaN) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (points.length < 3) return null;
  return {
    id: str(f.id, newId('lp')),
    name: str(f.name, ''),
    points,
    nutzung: oneOf<LageplanNutzung>(f.nutzung, NUTZUNGEN, 'sonstige'),
    versiegelung: oneOf<Versiegelung>(f.versiegelung, ['voll', 'teil', 'gruen'], 'voll'),
    ...(f.nachbar === true ? { nachbar: true } : {}),
    ...(typeof f.hoehe === 'number' && Number.isFinite(f.hoehe) ? { hoehe: f.hoehe } : {}),
    ...(typeof f.variante === 'string' && f.variante.trim() ? { variante: f.variante.trim() } : {}),
    ...(typeof f.ifcId === 'string' && f.ifcId ? { ifcId: f.ifcId } : {}),
    ...(isObj(f.ifcStand) ? { ifcStand: f.ifcStand } : {}),
  };
}

function normalizeMassNutzung(m: Record<string, unknown>): MassNutzung {
  const out: MassNutzung = {};
  if (typeof m.planDatum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.planDatum)) out.planDatum = m.planDatum;
  if (m.baunvo === '1962' || m.baunvo === '1968' || m.baunvo === '1990') out.baunvo = m.baunvo;
  if (m.bauo === 'nw1962' || m.bauo === 'nw1985' || m.bauo === 'nrw2019') out.bauo = m.bauo;
  for (const k of ['grz', 'gfz', 'vollgeschosseMax', 'grzIIMax', 'gelaende', 'dachaufbau', 'wandzuschlag', 'grAbsolut', 'gfAbsolut', 'bmz', 'vollgeschosseMin', 'traufhoeheMax', 'firsthoeheMax'] as const) {
    if (typeof m[k] === 'number' && Number.isFinite(m[k])) out[k] = m[k] as number;
  }
  if (m.einfamilienhaus === true) out.einfamilienhaus = true;
  if (m.vollgeschosseZwingend === true) out.vollgeschosseZwingend = true;
  if (m.aufenthaltNichtVollgeschoss === true) out.aufenthaltNichtVollgeschoss = true;
  if (typeof m.gebietsart === 'string' && GEBIETSARTEN.some((g) => g.id === m.gebietsart)) out.gebietsart = m.gebietsart as Gebietsart;
  if (typeof m.stand === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.stand)) out.stand = m.stand;
  if (typeof m.variante === 'string' && m.variante.trim()) out.variante = m.variante.trim();
  if (isObj(m.einstufung)) {
    const e: MassNutzung['einstufung'] = {};
    for (const n of NUTZUNGEN) if (m.einstufung[n] === 'ja' || m.einstufung[n] === 'nein' || m.einstufung[n] === 'grz1') e[n] = m.einstufung[n] as Einstufung;
    out.einstufung = e;
  }
  return out;
}

const STUFEN: KostenStufe[] = KOSTEN_STUFEN.map((s) => s.id);
const zahl = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const spanne = (v: unknown): Spanne => (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (v as Spanne) : [0, 0, 0]);

function normalizeKosten(k: Record<string, unknown>): Kosten {
  const positionen: KostenPosition[] = (Array.isArray(k.positionen) ? k.positionen : []).filter(isObj).map((p) => {
    const pos: KostenPosition = {
      id: str(p.id, newId('kp')),
      kg: str(p.kg, ''),
      bezeichnung: str(p.bezeichnung, ''),
      bezug: KOSTEN_BEZUEGE.includes(p.bezug as KostenBezug) ? (p.bezug as KostenBezug) : 'pauschal',
    };
    for (const f of ['menge', 'von', 'mittel', 'bis'] as const) if (zahl(p[f]) !== undefined) pos[f] = zahl(p[f]);
    for (const f of ['einheit', 'quelle', 'bemerkung'] as const) if (typeof p[f] === 'string' && p[f]) pos[f] = p[f] as string;
    if (Array.isArray(p.basis)) pos.basis = p.basis.filter((x): x is string => typeof x === 'string');
    if (p.aus === true) pos.aus = true;
    return pos;
  });
  const out: Kosten = { positionen };
  if (STUFEN.includes(k.stufe as KostenStufe)) out.stufe = k.stufe as KostenStufe;
  if (typeof k.datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k.datum)) out.datum = k.datum;
  if (isObj(k.mengen)) {
    const m: Kosten['mengen'] = {};
    for (const b of KOSTEN_BEZUEGE) if (zahl(k.mengen[b]) !== undefined) m[b] = zahl(k.mengen[b]);
    out.mengen = m;
  }
  if (isObj(k.teile)) {
    const t: Record<string, boolean> = {};
    for (const [id, v] of Object.entries(k.teile)) if (typeof v === 'boolean') t[id] = v;
    if (Object.keys(t).length) out.teile = t;
  }
  for (const f of ['indexBasis', 'indexAktuell', 'regionalfaktor', 'mwst'] as const) if (zahl(k[f]) !== undefined) out[f] = zahl(k[f]);
  if (k.kennwerteBrutto === true) out.kennwerteBrutto = true;
  if (isObj(k.katalog) && typeof k.katalog.name === 'string') {
    out.katalog = { name: k.katalog.name };
    if (typeof k.katalog.quelle === 'string') out.katalog.quelle = k.katalog.quelle;
    if (typeof k.katalog.stand === 'string') out.katalog.stand = k.katalog.stand;
  }
  if (Array.isArray(k.staende)) {
    out.staende = k.staende.filter(isObj).map((s) => {
      const summen: Record<string, Spanne> = {};
      if (isObj(s.summen)) for (const [kg, v] of Object.entries(s.summen)) summen[kg] = spanne(v);
      const mengen: Record<string, number> = {};
      if (isObj(s.mengen)) for (const [b, v] of Object.entries(s.mengen)) if (zahl(v) !== undefined) mengen[b] = v as number;
      return {
        id: str(s.id, newId('ks')),
        datum: str(s.datum, ''),
        stufe: STUFEN.includes(s.stufe as KostenStufe) ? (s.stufe as KostenStufe) : 'schaetzung',
        bemerkung: str(s.bemerkung, ''),
        mengen,
        summen,
        gesamtNetto: spanne(s.gesamtNetto),
        gesamtBrutto: spanne(s.gesamtBrutto),
      };
    });
  }
  return out;
}

const DATEI_ARTEN: DateiArt[] = ['ifc', 'dxf', 'pdf', 'vorlage', 'vorlage-grz', 'vorlage-kosten', 'qgis'];

function normalizeDatei(d: Record<string, unknown>): ProjektDatei | null {
  if (!(d.daten instanceof Uint8Array) || !DATEI_ARTEN.includes(d.art as DateiArt)) return null;
  return { id: str(d.id, newId('df')), name: str(d.name, 'Datei'), art: d.art as DateiArt, datum: str(d.datum, ''), daten: d.daten };
}

function normalizeStorey(s: Record<string, unknown>): Storey {
  const shapes = (Array.isArray(s.shapes) ? s.shapes : []).filter(isObj).map(normalizeShape).filter((x): x is Shape => x !== null);
  const storey: Storey = {
    id: str(s.id, newId('st')),
    name: str(s.name, 'Geschoss'),
    hoehe: num(s.hoehe, 3),
    elevation: typeof s.elevation === 'number' && Number.isFinite(s.elevation) ? s.elevation : undefined,
    shapes,
  };
  if (typeof s.dachgeschoss === 'boolean') storey.dachgeschoss = s.dachgeschoss;
  if (typeof s.keller === 'boolean') storey.keller = s.keller;
  if (typeof s.nummernPraefix === 'string' && s.nummernPraefix.trim()) storey.nummernPraefix = s.nummernPraefix.trim();
  for (const k of ['dachaufbau', 'fussbodenaufbau'] as const) if (typeof s[k] === 'number' && Number.isFinite(s[k]) && (s[k] as number) > 0) storey[k] = s[k] as number;
  if (s.geschosshoeheBegrenzt === true) storey.geschosshoeheBegrenzt = true;
  if (typeof s.vollgeschoss === 'boolean') storey.vollgeschoss = s.vollgeschoss;
  if (typeof s.sohle === 'number' && Number.isFinite(s.sohle) && s.sohle > 0) storey.sohle = s.sohle;
  if (typeof s.ifcId === 'string' && s.ifcId) storey.ifcId = s.ifcId;
  if (isObj(s.ifcStand)) storey.ifcStand = s.ifcStand;
  const bg = normalizeBackground(s.background);
  if (bg) storey.background = bg;
  return storey;
}

function normalizeShape(s: Record<string, unknown>): Shape | null {
  const points = (Array.isArray(s.points) ? s.points : [])
    .filter(isObj)
    .map((p) => ({ x: num(p.x, NaN), y: num(p.y, NaN) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (points.length < 3) return null;
  const common = {
    id: str(s.id, newId('sh')),
    name: str(s.name, ''),
    points,
    subtract: s.subtract === true,
    umschliessung: s.umschliessung === 'S' ? ('S' as const) : ('R' as const),
    bemerkung: typeof s.bemerkung === 'string' ? s.bemerkung : undefined,
    // Raum: 0 heißt „auf dem Geschossfußboden“ (leer: auf dem Fußboden des Umrisses); Umriss: 0 = keine Angabe
    ...(typeof s.versatz === 'number' && Number.isFinite(s.versatz) && (s.versatz !== 0 || s.kind === 'room') ? { versatz: s.versatz } : {}),
    ...(typeof s.ifcId === 'string' && s.ifcId ? { ifcId: s.ifcId } : {}),
    ...(isObj(s.ifcStand) ? { ifcStand: s.ifcStand } : {}),
  };
  const stempel = isObj(s.stempel) && Number.isFinite(s.stempel.x) && Number.isFinite(s.stempel.y) ? { stempel: { x: Number(s.stempel.x), y: Number(s.stempel.y) } } : {};
  if (s.kind === 'outline') {
    return {
      ...common,
      kind: 'outline',
      hoehe: typeof s.hoehe === 'number' ? s.hoehe : undefined,
      dach: normalizeDach(s.dach),
      ...(s.sohleAnsetzen === true ? { sohleAnsetzen: true } : {}),
      ...(s.ueberdeckt === true ? { ueberdeckt: true } : {}),
      ...(s.pruefen === true ? { pruefen: true } : {}),
      ...stempel,
      ...(s.anlage === 'garage' || s.anlage === 'nebenanlage' ? { anlage: s.anlage } : {}),
    };
  }
  if (s.kind === 'room') {
    const w = isObj(s.wofl) ? s.wofl : {};
    return {
      ...common,
      kind: 'room',
      nummer: str(s.nummer, ''),
      putzabzug: typeof s.putzabzug === 'number' && s.putzabzug > 0 && s.putzabzug < 100 ? s.putzabzug : undefined,
      ...(s.aufenthalt === 'ja' || s.aufenthalt === 'nein' || s.aufenthalt === 'treppe' ? { aufenthalt: s.aufenthalt } : {}),
      ...(s.rsVonHand === true ? { rsVonHand: true } : {}),
      ...(s.ausserhalbBgf === true ? { ausserhalbBgf: true } : {}),
      ...(s.abzugArt === 'wofl' || s.abzugArt === 'din' || s.abzugArt === 'beide' ? { abzugArt: s.abzugArt } : {}),
      ...(typeof s.nutzungsart === 'string' && s.nutzungsart.trim() ? { nutzungsart: s.nutzungsart.trim() } : {}),
      ...(typeof s.katalog === 'string' && s.katalog.trim() ? { katalog: s.katalog } : {}),
      ...stempel,
      nutzung: oneOf<Nutzungsgruppe>(s.nutzung, NUTZUNGSGRUPPEN.map((n) => n.id), 'NUF1'),
      wofl: {
        kategorie: oneOf<WoflKategorie>(w.kategorie, WOFL_KATEGORIEN.map((k) => k.id), 'keine'),
        faktor: typeof w.faktor === 'number' ? w.faktor : undefined,
        ...(isObj(w.anteile) ? { anteile: normalizeAnteile(w.anteile) } : {}),
        wohnung: str(w.wohnung, ''),
      },
    };
  }
  return null;
}

/** Höhenanteile: nicht negativ, Summe 1 */
function normalizeAnteile(a: Record<string, unknown>): HoehenAnteile {
  const h2 = Math.max(0, num(a.h2, 0));
  const h12 = Math.max(0, num(a.h12, 0));
  const h01 = Math.max(0, num(a.h01, 0));
  const s = h2 + h12 + h01;
  return s > 0 ? { h2: h2 / s, h12: h12 / s, h01: h01 / s } : { h2: 1, h12: 0, h01: 0 };
}

const DACH_IDS: DachTyp[] = [...DACH_TYPEN.map((t) => t.id), 'modell'];
const DACH_NUM_KEYS = ['neigungWalm', 'firstrichtung', 'krueppelHoehe', 'neigungUnten', 'hoeheUnten', 'stich', 'shedAnzahl', 'shedHoehe', 'maxHoehe', 'modellAbweichung'] as const;

function normalizeDach(d: unknown): Dach | undefined {
  if (!isObj(d) || !DACH_IDS.includes(d.typ as DachTyp)) return undefined;
  const out: Dach = { typ: d.typ as DachTyp, traufhoehe: num(d.traufhoehe, 3), neigung: num(d.neigung, 0) };
  for (const k of DACH_NUM_KEYS) if (typeof d[k] === 'number' && Number.isFinite(d[k])) out[k] = d[k] as number;
  if (d.umkehren === true) out.umkehren = true;
  if (Array.isArray(d.gauben)) {
    const gauben = d.gauben.filter(isObj).map(normalizeGaube);
    if (gauben.length) out.gauben = gauben;
  }
  return out;
}

const GAUBEN_NUM_KEYS = ['tiefe', 'neigung', 'wandhoehe', 'dachneigung'] as const;

function normalizeGaube(g: Record<string, unknown>): Gaube {
  const out: Gaube = {
    typ: oneOf<GaubenTyp>(g.typ, ['schlepp', 'flach', 'sattel'], 'schlepp'),
    seite: g.seite === 1 || g.seite === 2 || g.seite === 3 ? g.seite : 0,
    abstand: num(g.abstand, 0),
    breite: num(g.breite, 1),
    vorne: num(g.vorne, 0),
  };
  for (const k of GAUBEN_NUM_KEYS) if (typeof g[k] === 'number' && Number.isFinite(g[k])) out[k] = g[k] as number;
  if (typeof g.name === 'string' && g.name) out.name = g.name;
  return out;
}

function normalizeBackground(b: unknown): Background | undefined {
  if (!isObj(b)) return undefined;
  const base = {
    name: str(b.name, 'Plan'),
    x: num(b.x, 0),
    y: num(b.y, 0),
    opacity: num(b.opacity, 0.6),
    visible: b.visible !== false,
    ...(typeof b.quelle === 'string' ? { quelle: b.quelle } : {}),
  };
  // Version 0.1: Rasterbilder ohne "type"
  if ((b.type === 'raster' || b.type === undefined) && typeof b.dataUrl === 'string') {
    const r: RasterBackground = {
      ...base,
      type: 'raster',
      dataUrl: b.dataUrl,
      widthPx: num(b.widthPx, 1),
      heightPx: num(b.heightPx, 1),
      metersPerPixel: num(b.metersPerPixel, 0.01),
    };
    if (isObj(b.pdf)) r.pdf = { page: num(b.pdf.page, 1), metersPerPixelAt1: num(b.pdf.metersPerPixelAt1, 0) };
    return r;
  }
  if (b.type === 'vector' && Array.isArray(b.polylines) && Array.isArray(b.layers)) {
    return {
      ...base,
      type: 'vector',
      source: b.source === 'ifc' ? 'ifc' : undefined,
      scale: num(b.scale, 1),
      layers: b.layers.filter(isObj).map((l) => ({ name: str(l.name, '0'), color: str(l.color, '#333333'), visible: l.visible !== false })),
      polylines: b.polylines as VectorBackground['polylines'],
      texts: Array.isArray(b.texts) ? (b.texts as VectorBackground['texts']) : [],
    };
  }
  return undefined;
}

/**
 * Projekteinstellungen aus der Datei prüfen: bekannte Felder mit falschem Typ oder außerhalb des gültigen Bereichs
 * fallen auf die Vorgabe zurück bzw. entfallen (z. B. „freisitzFaktor": null rechnete Balkone sonst still mit 0 %,
 * „gridStep": 0 erzeugte beim Verschieben NaN-Koordinaten). Unbekannte Felder (andere Apps, neuere Versionen) bleiben.
 */
export function normalizeSettings(roh: unknown, base: ProjectSettings): ProjectSettings {
  const r = isObj(roh) ? roh : {};
  const out: Record<string, unknown> = { ...r };
  const zahl = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  out.gridStep = zahl(r.gridStep) && r.gridStep > 0 ? r.gridStep : base.gridStep;
  out.freisitzFaktor = zahl(r.freisitzFaktor) && r.freisitzFaktor >= 0 && r.freisitzFaktor <= 0.5 ? r.freisitzFaktor : base.freisitzFaktor;
  if (!MASSGRUNDLAGE_IDS.includes(r.massgrundlage as Massgrundlage)) delete out.massgrundlage;
  if (typeof r.zweiteBV !== 'boolean') delete out.zweiteBV;
  if (typeof r.planunterlagen !== 'string') delete out.planunterlagen;
  if (!isObj(r.bericht)) delete out.bericht;
  if (isObj(r.kontrollmasse)) {
    const k: Record<string, Kontrollmass> = {};
    for (const [id, v] of Object.entries(r.kontrollmasse)) {
      if (!isObj(v) || !zahl(v.soll) || v.soll <= 0 || !zahl(v.ist) || !zahl(v.abweichung)) continue;
      k[id] = { soll: v.soll, ist: v.ist, abweichung: v.abweichung, ...(zahl(v.massstab) && v.massstab > 0 ? { massstab: v.massstab } : {}) };
    }
    out.kontrollmasse = k;
  } else delete out.kontrollmasse;
  return out as unknown as ProjectSettings;
}

const MASSGRUNDLAGE_IDS: readonly Massgrundlage[] = ['rohbau', 'fertig', 'aufmass'];

function oneOf<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return allowed.includes(v as T) ? (v as T) : d;
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown, d: string): string {
  return typeof v === 'string' ? v : d;
}
function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}
