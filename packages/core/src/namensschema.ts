/**
 * Namensschema des Büros – gemeinsam für alle Apps: welche Kürzel es gibt (Planphasen wie GP, Antragsarten wie BAUA),
 * an welcher Stelle im Dateinamen Code, Phase bzw. Antragsart, Datum und Plannummer stehen und ab welcher
 * Leistungsphase Pläne einen Index tragen (GP-03a).
 *
 *   „HVO GP 261111 GP-04 Grundriss OG.pdf“      im Planungsordner (Phase GP)
 *   „HVO BAUA 261111 GP-04 Grundriss OG.pdf“    derselbe Plan im Antragsordner (Antragsart statt Phase,
 *                                               das GP der Plannummer bleibt)
 *   „HVO GP 261111 GP01-07 Plansatz.pdf“        zusammengefasster Satz: Pläne 01 bis 07
 *   „HVO BAUA 261110 01 Bauantrag.pdf“          Formular: reine Zahl = Dokumentnummer, kein Plan
 *
 * Die Bürovorgabe steht in den gemeinsamen Einstellungen (`allgemein.json`, Eintrag `namensschema`, gepflegt im
 * Projektordner-Tool), jede Projektdatei trägt ihre Kopie (Abschnitt `namensschema`). Es gilt die der Projektdatei,
 * sonst die des Büros, sonst die eingebaute Vorgabe.
 */

/** Ein Kürzel mit Bedeutung, z. B. GP = Genehmigungsplanung */
export interface Kuerzel {
  kuerzel: string;
  name: string;
  /** gleichwertige Schreibweisen (BVA für BAUVA) */
  synonyme?: string[];
  /** Leistungsphase (HOAI) – bei Planphasen; entscheidet über Indizes */
  lph?: number;
}

/** Teile des Dateinamens, durch Leerzeichen getrennt; was danach kommt, ist die Bezeichnung */
export type NamensTeil = 'code' | 'art' | 'datum' | 'nummer';

export interface Namensschema {
  /** Planphasen: Kürzel an der Stelle „art“ in den Planungsordnern und vor der Plannummer (GP-01) */
  phasen: Kuerzel[];
  /** Antragsarten: Kürzel an der Stelle „art“ im Antragsordner (statt der Phase) */
  antragsarten: Kuerzel[];
  /** Reihenfolge der Teile im Dateinamen */
  reihenfolge: NamensTeil[];
  /** Pläne tragen einen Index (GP-03a) ab dieser Leistungsphase */
  indexAbLph: number;
}

export const NAMENS_TEILE: { id: NamensTeil; name: string; beispiel: string }[] = [
  { id: 'code', name: 'Projektcode', beispiel: 'HVO' },
  { id: 'art', name: 'Phase bzw. Antragsart', beispiel: 'GP' },
  { id: 'datum', name: 'Datum (JJMMTT)', beispiel: '261111' },
  { id: 'nummer', name: 'Plannummer bzw. Dokumentnummer', beispiel: 'GP-04' },
];

export const VORGABE_NAMENSSCHEMA: Namensschema = {
  phasen: [
    { kuerzel: 'BP', name: 'Grundlagenermittlung (Bestand)', lph: 1 },
    { kuerzel: 'EP', name: 'Entwurfsplanung', lph: 3 },
    { kuerzel: 'GP', name: 'Genehmigungsplanung', lph: 4 },
    { kuerzel: 'AP', name: 'Ausführungsplanung', lph: 5 },
    { kuerzel: 'AB', name: 'Abgeschlossenheitsbescheinigung (Sonderfall)' },
  ],
  antragsarten: [
    { kuerzel: 'BAUA', name: 'Bauantrag' },
    { kuerzel: 'BAUVA', name: 'Bauvoranfrage', synonyme: ['BVA'] },
    { kuerzel: 'BAUF', name: 'Genehmigungsfreistellung' },
    { kuerzel: 'DENK', name: 'Denkmalrechtliche Erlaubnis' },
    { kuerzel: 'ABGE', name: 'Abgeschlossenheitsbescheinigung' },
    { kuerzel: 'ENTW', name: 'Entwässerungsantrag' },
  ],
  reihenfolge: ['code', 'art', 'datum', 'nummer'],
  indexAbLph: 5,
};

const TEILE: NamensTeil[] = ['code', 'art', 'datum', 'nummer'];

function kuerzelAus(roh: unknown): Kuerzel[] | null {
  if (!Array.isArray(roh)) return null;
  const gesehen = new Set<string>();
  const out: Kuerzel[] = [];
  for (const x of roh) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const kuerzel = typeof o.kuerzel === 'string' ? o.kuerzel.trim().toUpperCase() : '';
    if (!/^[A-Z0-9ÄÖÜ]{1,8}$/.test(kuerzel) || gesehen.has(kuerzel)) continue;
    gesehen.add(kuerzel);
    const synonyme = Array.isArray(o.synonyme)
      ? [
          ...new Set(
            o.synonyme
              .filter((s): s is string => typeof s === 'string')
              .map((s) => s.trim().toUpperCase())
              .filter((s) => s && s !== kuerzel),
          ),
        ]
      : [];
    out.push({
      kuerzel,
      name: typeof o.name === 'string' ? o.name.trim() : '',
      ...(synonyme.length ? { synonyme } : {}),
      ...(typeof o.lph === 'number' && o.lph >= 0 && o.lph <= 9 ? { lph: Math.round(o.lph) } : {}),
    });
  }
  return out;
}

/** Gelesenes Namensschema prüfen und mit der Vorgabe ergänzen; null, wenn keins da ist */
export function namensschemaAus(roh: unknown): Namensschema | null {
  if (!roh || typeof roh !== 'object') return null;
  const o = roh as Record<string, unknown>;
  const reihe = Array.isArray(o.reihenfolge) ? o.reihenfolge.filter((t): t is NamensTeil => TEILE.includes(t as NamensTeil)) : [];
  return {
    phasen: kuerzelAus(o.phasen) ?? structuredClone(VORGABE_NAMENSSCHEMA.phasen),
    antragsarten: kuerzelAus(o.antragsarten) ?? structuredClone(VORGABE_NAMENSSCHEMA.antragsarten),
    reihenfolge: reihe.length === TEILE.length && new Set(reihe).size === TEILE.length ? reihe : [...VORGABE_NAMENSSCHEMA.reihenfolge],
    indexAbLph: typeof o.indexAbLph === 'number' && o.indexAbLph >= 0 && o.indexAbLph <= 10 ? Math.round(o.indexAbLph) : VORGABE_NAMENSSCHEMA.indexAbLph,
  };
}

/** Es gilt das Schema der Projektdatei, sonst das des Büros, sonst die Vorgabe */
export function wirksamesNamensschema(ausProjekt?: unknown, ausBuero?: unknown): Namensschema {
  return namensschemaAus(ausProjekt) ?? namensschemaAus(ausBuero) ?? structuredClone(VORGABE_NAMENSSCHEMA);
}

/** Alle Schreibweisen einer Liste (Kürzel und Synonyme) */
export const alleKuerzel = (liste: Kuerzel[]) => liste.flatMap((k) => [k.kuerzel, ...(k.synonyme ?? [])]);

/** Das Kürzel zu einer Schreibweise (BVA → BAUVA) */
export const kuerzelZu = (liste: Kuerzel[], text: string) => liste.find((k) => k.kuerzel === text.toUpperCase() || k.synonyme?.includes(text.toUpperCase()));

/* ---------- Dateinamen zerlegen ---------- */

export interface Namensteile {
  code?: string;
  art?: string;
  datum?: string;
  nummer?: string;
  /** Bezeichnung (alles nach den Teilen), ohne Endung */
  rest: string;
}

/** Dateinamen nach dem Schema zerlegen: die ersten vier Wörter in der Reihenfolge des Schemas, der Rest ist die Bezeichnung */
export function dateinameZerlegen(name: string, schema: Pick<Namensschema, 'reihenfolge'> = VORGABE_NAMENSSCHEMA): Namensteile {
  const ohne = (name.split(/[\\/]/).pop() ?? name).replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
  const woerter = ohne.split(/\s+/).filter(Boolean);
  const out: Namensteile = { rest: woerter.slice(schema.reihenfolge.length).join(' ') };
  schema.reihenfolge.forEach((t, i) => {
    if (woerter[i] !== undefined) out[t] = woerter[i];
  });
  return out;
}

/* ---------- Plannummern ---------- */

export interface PlanNummer {
  /** Plankürzel (Phase), z. B. GP */
  kuerzel: string;
  /** erste und letzte Nummer (bei einem zusammengefassten Satz verschieden) */
  von: number;
  bis: number;
  /** Index (GP-03a) – klein */
  index?: string;
}

const regexText = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Plannummer aus dem Teil „nummer“: Plankürzel einer Phase des Schemas und Nummer – „GP-01“, „GP01“, „GP_01“, ein
 * zusammengefasster Satz „GP01-07“ bzw. „GP-01-GP-07“, mit Index „GP-03a“. Eine reine Zahl („01“) ist eine
 * Dokumentnummer (Formulare) und kein Plan: null.
 */
export function planNummerAus(teil: string | undefined, schema: Pick<Namensschema, 'phasen'> = VORGABE_NAMENSSCHEMA): PlanNummer | null {
  if (!teil) return null;
  const kuerzel = alleKuerzel(schema.phasen)
    .sort((a, b) => b.length - a.length)
    .map(regexText)
    .join('|');
  if (!kuerzel) return null;
  const m = new RegExp(`^(${kuerzel})[-_]?(\\d{1,3})(?:[-–](?:(?:${kuerzel})[-_]?)?(\\d{1,3}))?([a-z])?$`, 'i').exec(teil.trim());
  if (!m) return null;
  const k = kuerzelZu(schema.phasen, m[1])?.kuerzel ?? m[1].toUpperCase();
  const von = Number(m[2]);
  const bis = m[3] ? Number(m[3]) : von;
  if (bis < von || bis - von > 200) return null;
  return { kuerzel: k, von, bis, ...(m[4] ? { index: m[4].toLowerCase() } : {}) };
}

/** Schlüssel eines einzelnen Plans: „GP-04“ */
export const planSchluessel = (kuerzel: string, nr: number) => `${kuerzel}-${String(nr).padStart(2, '0')}`;

/** Trägt die Phase nach dem Schema Indizes (ab Leistungsphase `indexAbLph`)? */
export const indexVorgesehen = (schema: Pick<Namensschema, 'phasen' | 'indexAbLph'>, kuerzel: string) => (kuerzelZu(schema.phasen, kuerzel)?.lph ?? 0) >= schema.indexAbLph;
