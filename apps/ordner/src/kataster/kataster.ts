import { strFromU8, unzipSync } from 'fflate';
import { isZip } from '@core/archive';
import type { Koordinaten } from '@core/model';
import { ersetzen, globaleWerte, GLOBALE_VARIABLEN, mitAliasen, platzhalterIn, type Variable } from '@core/platzhalter';
import { sichererDateiname } from '@core/projektdatei';

/**
 * Katasterpläne aus einer QGIS-Vorlage: Einstellungen (gemeinsam im Konfigurationsordner), Auslesen der Vorlage
 * (Layouts, Kartenobjekte, Kartenthemen) und der Auftrag an das Export-Skript (katasterexport.py), das mit
 * qgis_process läuft.
 */

export type PlanArt = 'pdf' | 'dxf';
/** Symbolik der DXF: je Symbolebene, je Objekt oder ohne (nur Geometrie) */
export type DxfStil = 'symbollayer' | 'objekt' | 'ohne';

export interface KatasterPlan {
  id: string;
  /** Name des Plans (auch im Dateinamen und im Layout als @plan_name) */
  name: string;
  art: PlanArt;
  aktiv: boolean;
  /** pdf: Name des Layouts in der Vorlage */
  layout: string;
  /** pdf: Kennung des Kartenobjekts im Layout (leer = das erste) */
  karte: string;
  /** Kartenthema der Vorlage (leer = sichtbare Layer) */
  thema: string;
  /** Maßstabszahl (1000 = 1:1000); dxf: Symbolmaßstab */
  massstab: number;
  /** Ausdehnung in m (dxf: Pflicht; pdf: optional – dann ergibt sich der Maßstab aus dem Ausschnitt) */
  breite?: number;
  hoehe?: number;
  /** pdf: Auflösung */
  dpi: number;
  stil: DxfStil;
  /** dxf: Beschriftungen der Layer mit exportieren */
  beschriftungen: boolean;
  /** Text für den Plan, im Layout als [% @plan_beschriftung %] */
  beschriftung: string;
}

export type KatasterZiel = 'antrag' | 'pfad';

export interface KatasterEinstellungen {
  /** QGIS-Projekt (.qgz/.qgs) als Vorlage für neue Projekte (vollständiger Pfad) */
  vorlage: string;
  /** Ablage: Ordner der aktiven Antragsfassung oder fester Ordner im Projektordner */
  ziel: KatasterZiel;
  /** fester Ordner relativ zum Projektordner ({Antrag} = aktive Fassung) */
  zielpfad: string;
  /** Dateiname ohne Endung – Variablen siehe {@link KATASTER_VARIABLEN} */
  dateiname: string;
  plaene: KatasterPlan[];
}

export const VORGABE_PLAENE: KatasterPlan[] = [
  {
    id: 'a4',
    name: 'Katasterauszug A4',
    art: 'pdf',
    aktiv: true,
    layout: 'Katasterauszug A4',
    karte: '',
    thema: '',
    massstab: 1000,
    dpi: 300,
    stil: 'symbollayer',
    beschriftungen: true,
    beschriftung: 'Auszug aus der Liegenschaftskarte',
  },
  {
    id: 'a3',
    name: 'Katasterauszug A3',
    art: 'pdf',
    aktiv: true,
    layout: 'Katasterauszug A3',
    karte: '',
    thema: '',
    massstab: 500,
    dpi: 300,
    stil: 'symbollayer',
    beschriftungen: true,
    beschriftung: 'Auszug aus der Liegenschaftskarte',
  },
  {
    id: 'schwarzplan',
    name: 'Schwarzplan',
    art: 'dxf',
    aktiv: true,
    layout: '',
    karte: '',
    thema: 'Schwarzplan',
    massstab: 1000,
    breite: 300,
    hoehe: 300,
    dpi: 300,
    stil: 'symbollayer',
    beschriftungen: false,
    beschriftung: '',
  },
  {
    id: 'katasterplan',
    name: 'Katasterplan',
    art: 'dxf',
    aktiv: true,
    layout: '',
    karte: '',
    thema: 'Katasterplan',
    massstab: 500,
    breite: 150,
    hoehe: 150,
    dpi: 300,
    stil: 'objekt',
    beschriftungen: true,
    beschriftung: '',
  },
];

export const VORGABE_KATASTER: KatasterEinstellungen = {
  vorlage: '',
  ziel: 'pfad',
  zielpfad: 'Kataster',
  dateiname: '{PROJEKT_KUERZEL} {Art} {DATUM} {Name}',
  plaene: VORGABE_PLAENE,
};

const text = (v: unknown, vorgabe = '') => (typeof v === 'string' ? v : vorgabe);
const zahl = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** Einstellungen aus der Konfiguration – Unbekanntes und Ungültiges wird auf die Vorgaben gesetzt */
export function katasterAus(roh: unknown): KatasterEinstellungen {
  if (!roh || typeof roh !== 'object') return structuredClone(VORGABE_KATASTER);
  const r = roh as Record<string, unknown>;
  const plaene = Array.isArray(r.plaene)
    ? r.plaene
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
        .map((p, i): KatasterPlan => {
          const art: PlanArt = p.art === 'dxf' ? 'dxf' : 'pdf';
          return {
            id: text(p.id) || `plan${i + 1}`,
            name: text(p.name) || `Plan ${i + 1}`,
            art,
            aktiv: p.aktiv !== false,
            layout: text(p.layout),
            karte: text(p.karte),
            thema: text(p.thema),
            massstab: zahl(p.massstab) ?? 1000,
            breite: zahl(p.breite),
            hoehe: zahl(p.hoehe),
            dpi: zahl(p.dpi) ?? 300,
            stil: p.stil === 'objekt' || p.stil === 'ohne' ? p.stil : 'symbollayer',
            beschriftungen: p.beschriftungen !== false,
            beschriftung: text(p.beschriftung),
          };
        })
    : structuredClone(VORGABE_PLAENE);
  return {
    vorlage: text(r.vorlage).trim(),
    ziel: r.ziel === 'antrag' ? 'antrag' : 'pfad',
    zielpfad: text(r.zielpfad, VORGABE_KATASTER.zielpfad),
    dateiname: text(r.dateiname).trim() || VORGABE_KATASTER.dateiname,
    plaene,
  };
}

/** Neue, eindeutige Kennung für einen Plan */
export function neueKennung(plaene: KatasterPlan[], basis = 'plan'): string {
  for (let i = plaene.length + 1; ; i++) if (!plaene.some((p) => p.id === `${basis}${i}`)) return `${basis}${i}`;
}

/* ---------- Vorlage auslesen ---------- */

export interface VorlageLayout {
  name: string;
  /** Kartenobjekte: Kennung (kann leer sein) und Größe im Layout (mm) */
  karten: { id: string; breite: number; hoehe: number }[];
}

export interface VorlageInfo {
  titel: string;
  layouts: VorlageLayout[];
  themen: string[];
}

/** Elementtyp „Karte“ in QGIS-Layouts (QgsLayoutItemRegistry::LayoutMap) */
const LAYOUT_KARTE = '65639';

/** Projekt-XML (.qgs) aus einer .qgz oder .qgs */
export function vorlageXml(bytes: Uint8Array): string {
  if (!isZip(bytes)) return new TextDecoder().decode(bytes);
  const zip = unzipSync(bytes, { filter: (f) => /\.qgs$/i.test(f.name) });
  const name = Object.keys(zip)[0];
  if (!name) throw new Error('In der .qgz steckt kein QGIS-Projekt (.qgs).');
  return strFromU8(zip[name]);
}

/** Layouts (mit Kartenobjekten) und Kartenthemen der Vorlage */
export function vorlageLesen(bytes: Uint8Array): VorlageInfo {
  const doc = new DOMParser().parseFromString(vorlageXml(bytes), 'application/xml');
  const wurzel = doc.documentElement;
  if (!wurzel || wurzel.nodeName !== 'qgis') throw new Error('Die Datei ist kein QGIS-Projekt.');
  const layouts = [...doc.getElementsByTagName('Layout')]
    .filter((l) => l.getAttribute('name'))
    .map((l) => ({
      name: l.getAttribute('name')!,
      karten: [...l.getElementsByTagName('LayoutItem')]
        .filter((i) => i.getAttribute('type') === LAYOUT_KARTE)
        .map((i) => {
          const [b, h] = (i.getAttribute('size') ?? '').split(',').map(Number);
          return { id: i.getAttribute('id') ?? '', breite: b || 0, hoehe: h || 0 };
        }),
    }));
  const themen = [...doc.getElementsByTagName('visibility-preset')].map((t) => t.getAttribute('name') ?? '').filter(Boolean);
  const titel = [...wurzel.children].find((c) => c.nodeName === 'title')?.textContent ?? wurzel.getAttribute('projectname') ?? '';
  return { titel, layouts, themen: [...new Set(themen)] };
}

/** Kartenobjekt eines Plans in der Vorlage (oder null) */
export function karteVon(info: VorlageInfo, plan: Pick<KatasterPlan, 'layout' | 'karte'>) {
  const l = info.layouts.find((x) => x.name === plan.layout);
  if (!l) return null;
  return (plan.karte ? l.karten.find((k) => k.id === plan.karte) : l.karten[0]) ?? null;
}

/** Was an einem Plan nicht zur Vorlage passt (leer = passt) */
export function planFehler(plan: KatasterPlan, info: VorlageInfo | null): string[] {
  const f: string[] = [];
  if (plan.art === 'dxf' && !(plan.breite && plan.hoehe)) f.push('Für DXF bitte Breite und Höhe des Ausschnitts angeben.');
  if (plan.art === 'pdf' && !plan.layout.trim()) f.push('Bitte ein Layout wählen.');
  if (!info) return f;
  if (plan.art === 'pdf' && plan.layout.trim()) {
    const l = info.layouts.find((x) => x.name === plan.layout);
    if (!l) f.push(`Layout „${plan.layout}“ gibt es in der Vorlage nicht.`);
    else if (!l.karten.length) f.push(`Layout „${plan.layout}“ hat kein Kartenobjekt.`);
    else if (plan.karte && !l.karten.some((k) => k.id === plan.karte)) f.push(`Kartenobjekt „${plan.karte}“ gibt es im Layout nicht.`);
  }
  if (plan.thema && !info.themen.includes(plan.thema)) f.push(`Kartenthema „${plan.thema}“ gibt es in der Vorlage nicht.`);
  return f;
}

/** Ausschnitt in m, den ein Kartenobjekt (mm) im Maßstab zeigt */
export const ausschnitt = (karte: { breite: number; hoehe: number }, massstab: number) => ({ breite: (karte.breite * massstab) / 1000, hoehe: (karte.hoehe * massstab) / 1000 });

/* ---------- Auftrag ---------- */

export interface PlanKopf {
  /** project_title */
  titel: string;
  /** project_identifier (Projektcode) */
  kennung: string;
  strasse: string;
  ort: string;
  plz: string;
}

export interface Namensteile {
  /** Projektkürzel (ohne Projektcode der Name des Projekts) */
  kuerzel: string;
  /** Antragsart (z. B. BAUA) */
  art: string;
  datum: Date;
  kurzname?: string;
  vorhaben?: string;
  bearbeiter?: string;
}

/** globale Variablen; {Code} hieß hier früher das Projektkürzel */
const GLOBAL_KATASTER: Variable[] = GLOBALE_VARIABLEN.map((v) => (v.name === 'PROJEKT_KUERZEL' ? mitAliasen(v.name, ['Code']) : v));
/** Variablen im Dateinamen der Katasterpläne */
export const KATASTER_VARIABLEN: Variable[] = [
  ...GLOBAL_KATASTER,
  { name: 'Art', text: 'Antragsart des aktiven Antrags, z. B. BAUA' },
  { name: 'Name', text: 'Name des Plans, z. B. Katasterauszug A4' },
];
/** Variablen im festen Ablageordner */
export const KATASTER_ZIEL_VARIABLEN: Variable[] = [...GLOBAL_KATASTER, { name: 'Antrag', text: 'aktive Antragsfassung, z. B. BAUA 2' }];

const globaleAus = (t: Namensteile) => globaleWerte({ projektcode: t.kuerzel, kurzname: t.kurzname, vorhaben: t.vorhaben, bearbeiter: t.bearbeiter, datum: t.datum });

/** Dateiname eines Plans (mit Endung) nach der Vorlage */
export function planDateiname(vorlage: string, plan: Pick<KatasterPlan, 'name' | 'art'>, t: Namensteile): string {
  const name = ersetzen(vorlage, KATASTER_VARIABLEN, { ...globaleAus(t), Art: t.art, Name: plan.name })
    .replace(/\s+/g, ' ')
    .trim();
  return `${sichererDateiname(name) || sichererDateiname(plan.name) || 'Plan'}.${plan.art}`;
}

/** fester Ablageordner mit eingesetzten Variablen; null, wenn er {Antrag} enthält und kein Antrag aktiv ist */
export function katasterZielpfad(zielpfad: string, antrag: string | undefined, t: Namensteile): string | null {
  if (!antrag && platzhalterIn(zielpfad, KATASTER_ZIEL_VARIABLEN).some((f) => f.treffer?.variable.name === 'Antrag')) return null;
  return ersetzen(zielpfad, KATASTER_ZIEL_VARIABLEN, { ...globaleAus(t), Antrag: antrag ?? '' }, { saeubern: (v) => v.replace(/[\\/]+/g, ' ') })
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

export interface Auftrag {
  koordinaten: { ost: number; nord: number; epsg: number };
  variablen: Record<string, string>;
  plaene: (Omit<KatasterPlan, 'aktiv'> & { ausgabe: string })[];
}

/** Auftrag an das Export-Skript; `ausgabe(plan)` liefert den vollständigen Zielpfad */
export function auftragBauen(plaene: KatasterPlan[], koordinaten: Koordinaten, kopf: PlanKopf, ausgabe: (p: KatasterPlan) => string): Auftrag {
  return {
    koordinaten: { ost: koordinaten.ost, nord: koordinaten.nord, epsg: 25832 },
    variablen: {
      project_title: kopf.titel,
      project_identifier: kopf.kennung,
      project_street: kopf.strasse,
      project_city: kopf.ort,
      project_zip_code: kopf.plz,
    },
    plaene: plaene.map(({ aktiv: _, ...p }) => ({ ...p, ...(p.art === 'pdf' && !(p.breite && p.hoehe) ? { breite: undefined, hoehe: undefined } : {}), ausgabe: ausgabe({ aktiv: true, ...p }) })),
  };
}

/* ---------- Ergebnis ---------- */

export interface PlanErgebnis {
  id: string;
  ok: boolean;
  datei?: string;
  fehler?: string;
}

/** „ERGEBNIS {json}“-Zeilen des Skripts */
export function ergebnisseLesen(ausgabe: string): PlanErgebnis[] {
  const out: PlanErgebnis[] = [];
  for (const zeile of ausgabe.split(/\r?\n/)) {
    const i = zeile.indexOf('ERGEBNIS {');
    if (i < 0) continue;
    try {
      const r = JSON.parse(zeile.slice(i + 'ERGEBNIS '.length)) as Record<string, unknown>;
      out.push({ id: String(r.id ?? ''), ok: r.ok === true, ...(typeof r.datei === 'string' ? { datei: r.datei } : {}), ...(typeof r.fehler === 'string' && r.fehler ? { fehler: r.fehler } : {}) });
    } catch {
      /* unvollständige Zeile */
    }
  }
  return out;
}

/** Aussagekräftiger Auszug aus der Fehlerausgabe von qgis_process (letzte Zeilen ohne Leerzeilen) */
export function fehlerAuszug(fehler: string, ausgabe = '', zeilen = 6): string {
  const alle = `${fehler}\n${ausgabe}`
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter((z) => z && !/^ERGEBNIS /.test(z));
  return alle.slice(-zeilen).join('\n');
}
