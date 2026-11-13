/**
 * Namensschema des Büros – gemeinsam für alle Apps: welche Kürzel es gibt (Planphasen wie GP, Antrags- und
 * Verfahrensarten wie BAUA oder BAUF – die Genehmigungsfreistellung ist kein Antrag, sondern eine Vorlage bei der
 * Bauaufsichtsbehörde nach § 63 Abs. 3 BauO NRW 2018 in der Fassung ab 01.09.2026),
 * an welcher Stelle im Dateinamen Code, Phase bzw. Antragsart, Datum und Plannummer stehen und ab welcher
 * Leistungsphase Pläne einen Index tragen (AP-03a).
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
  /** Antrags- und Verfahrensarten: Kürzel an der Stelle „art“ im Antragsordner (statt der Phase) */
  antragsarten: Kuerzel[];
  /** Reihenfolge der Teile im Dateinamen */
  reihenfolge: NamensTeil[];
  /** Pläne tragen einen Index (AP-03a) ab dieser Leistungsphase */
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
    { kuerzel: 'BP', name: 'Grundlagenermittlung', lph: 1 },
    { kuerzel: 'EP', name: 'Entwurfsplanung', lph: 3 },
    { kuerzel: 'GP', name: 'Genehmigungsplanung', lph: 4 },
    { kuerzel: 'AP', name: 'Ausführungsplanung', lph: 5 },
    { kuerzel: 'AB', name: 'Abgeschlossenheitsbescheinigung (Sonderfall – Aufteilungspläne, § 7 Abs. 4 WEG)' },
  ],
  antragsarten: [
    { kuerzel: 'BAUA', name: 'Bauantrag' },
    { kuerzel: 'BAUVA', name: 'Bauvoranfrage (Antrag auf Vorbescheid, § 77 BauO NRW 2018)', synonyme: ['BVA'] },
    { kuerzel: 'BAUF', name: 'Genehmigungsfreistellung' },
    { kuerzel: 'DENK', name: 'Denkmalrechtliche Erlaubnis' },
    { kuerzel: 'ABGE', name: 'Abgeschlossenheitsbescheinigung' },
    { kuerzel: 'ENTW', name: 'Entwässerungsantrag' },
  ],
  reihenfolge: ['code', 'art', 'datum', 'nummer'],
  indexAbLph: 5,
};

const TEILE: NamensTeil[] = ['code', 'art', 'datum', 'nummer'];

/** Leistungsphase 0 bis 9 (HOAI kennt 1 bis 9; 0 = von Anfang an): Zahlen werden begrenzt, alles andere ist keine */
export const lphAus = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? Math.min(9, Math.max(0, Math.round(x))) : undefined);

/** gültiges Kürzel bzw. gültige Schreibweise: Großbuchstaben und Ziffern, höchstens 8 Zeichen */
export const KUERZEL_MUSTER = /^[A-Z0-9ÄÖÜ]{1,8}$/;

/**
 * Kürzelliste lesen: ungültige und doppelte Kürzel entfallen; eine Schreibweise entfällt, wenn sie ungültig ist oder
 * schon vergeben (als Kürzel der Liste, als Schreibweise eines anderen Eintrags oder in `belegt`, z. B. die Phasen) –
 * sonst wäre nicht eindeutig, welches Kürzel gemeint ist.
 */
function kuerzelAus(roh: unknown, belegt: string[] = []): Kuerzel[] | null {
  if (!Array.isArray(roh)) return null;
  const eintraege = roh.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
  const kuerzelVon = (o: Record<string, unknown>) => (typeof o.kuerzel === 'string' ? o.kuerzel.trim().toUpperCase() : '');
  const alleKuerzelDerListe = new Set(eintraege.map(kuerzelVon));
  const gesehen = new Set<string>();
  const vergeben = new Set(belegt);
  const out: Kuerzel[] = [];
  for (const o of eintraege) {
    const kuerzel = kuerzelVon(o);
    if (!KUERZEL_MUSTER.test(kuerzel) || gesehen.has(kuerzel) || vergeben.has(kuerzel)) continue;
    gesehen.add(kuerzel);
    const synonyme: string[] = [];
    for (const s of Array.isArray(o.synonyme) ? o.synonyme : []) {
      const x = typeof s === 'string' ? s.trim().toUpperCase() : '';
      if (!KUERZEL_MUSTER.test(x) || x === kuerzel || alleKuerzelDerListe.has(x) || vergeben.has(x) || synonyme.includes(x)) continue;
      synonyme.push(x);
      vergeben.add(x);
    }
    out.push({
      kuerzel,
      name: typeof o.name === 'string' ? o.name.trim() : '',
      ...(synonyme.length ? { synonyme } : {}),
      ...(lphAus(o.lph) !== undefined ? { lph: lphAus(o.lph) } : {}),
    });
  }
  return out;
}

/** Gelesenes Namensschema prüfen und mit der Vorgabe ergänzen; null, wenn keins da ist */
export function namensschemaAus(roh: unknown): Namensschema | null {
  if (!roh || typeof roh !== 'object') return null;
  const o = roh as Record<string, unknown>;
  const reihe = Array.isArray(o.reihenfolge) ? o.reihenfolge.filter((t): t is NamensTeil => TEILE.includes(t as NamensTeil)) : [];
  const phasen = kuerzelAus(o.phasen) ?? structuredClone(VORGABE_NAMENSSCHEMA.phasen);
  return {
    phasen,
    // eine Antragsart darf keine Phase heißen (sonst wäre ein Ordner „GP“ ein Antragsordner)
    antragsarten: kuerzelAus(o.antragsarten, alleKuerzel(phasen)) ?? structuredClone(VORGABE_NAMENSSCHEMA.antragsarten),
    reihenfolge: reihe.length === TEILE.length && new Set(reihe).size === TEILE.length ? reihe : [...VORGABE_NAMENSSCHEMA.reihenfolge],
    indexAbLph: lphAus(o.indexAbLph) ?? VORGABE_NAMENSSCHEMA.indexAbLph,
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

const PLANNUMMER = /^[A-ZÄÖÜ]{1,8}[-_]?\d{1,3}(?:[-–](?:[A-ZÄÖÜ]{1,8}[-_]?)?\d{1,3})?[a-z]?$/;

/**
 * Sieht ein Wort nach einer Plan- oder Dokumentnummer aus? Dokumentnummer „01“, „03a“ (Index klein); Plannummer mit
 * Plankürzel in Großbuchstaben und Trennzeichen („GP-04“, „AP-03a“, Satz „GP01-07“). Folgt danach noch eine
 * Bezeichnung (`folgt`), zählen auch „GP04“ oder „gp-04“. So bleiben „Anlage1“, „OG2“ oder „3D“ Bezeichnungen.
 */
export function istNummer(wort: string, folgt = false): boolean {
  if (/^\d{1,3}[a-z]?$/.test(wort)) return true;
  if (folgt) return new RegExp(PLANNUMMER.source, 'i').test(wort);
  return PLANNUMMER.test(wort) && /[-_–]/.test(wort);
}

/** Zerlegung mit den Stellen der Teile (Wortindex) – für Prüfen und Umbenennen */
export interface Zerlegung {
  teile: Namensteile;
  /** Wortindex je Teil (beim mehrteiligen Projektcode: das erste Wort) */
  stelle: Partial<Record<NamensTeil, number>>;
  woerter: string[];
  /** Endung samt Punkt („.pdf“) bzw. leer */
  endung: string;
  /** der erkannte Projektcode aus `codes` (beim Zerlegen ohne Codes: undefined) */
  code?: string;
}

/**
 * Dateinamen nach dem Schema zerlegen: die Teile in der Reihenfolge des Schemas, danach die Bezeichnung. Mit `codes`
 * darf der Projektcode aus mehreren Wörtern bestehen („BS 9“) – der längste passende gilt. Die Nummer ist optional:
 * Sie belegt nur dann ein Wort, wenn es nach einer Plan- oder Dokumentnummer aussieht („HVO BAUA 261110 Bauantrag“).
 */
export function dateinameZerlegenMitStellen(name: string, schema: Pick<Namensschema, 'reihenfolge'> = VORGABE_NAMENSSCHEMA, codes: string[] = []): Zerlegung {
  const datei = (name.split(/[\\/]/).pop() ?? name).trim();
  const endung = /\.[A-Za-z0-9]{1,5}$/.exec(datei)?.[0] ?? '';
  const woerter = datei
    .slice(0, datei.length - endung.length)
    .split(/\s+/)
    .filter(Boolean);
  const nachLaenge = [...codes]
    .map((c) => c.trim())
    .filter(Boolean)
    .sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length);
  const teile: Namensteile = { rest: '' };
  const stelle: Partial<Record<NamensTeil, number>> = {};
  let code: string | undefined;
  let p = 0;
  for (const t of schema.reihenfolge) {
    if (woerter[p] === undefined) break;
    if (t === 'code' && nachLaenge.length) {
      code = nachLaenge.find((c) => c.split(/\s+/).every((w, i) => woerter[p + i]?.toLowerCase() === w.toLowerCase()));
      const n = code ? code.split(/\s+/).length : 1;
      [teile.code, stelle.code] = [woerter.slice(p, p + n).join(' '), p];
      p += n;
      continue;
    }
    // Nummer: in Großbuchstaben immer; klein geschrieben nur, wenn danach noch eine Bezeichnung kommt – und nie, wenn hier
    // ein Projektcode beginnt („BS9“ sähe sonst wie eine Plannummer aus)
    const codeHier = nachLaenge.some((c) => c.split(/\s+/).every((w, i) => woerter[p + i]?.toLowerCase() === w.toLowerCase()));
    if (t === 'nummer' && (codeHier || !istNummer(woerter[p], woerter[p + 1] !== undefined))) continue;
    [teile[t], stelle[t]] = [woerter[p], p];
    p++;
  }
  teile.rest = woerter.slice(p).join(' ');
  return { teile, stelle, woerter, endung, code };
}

/** Dateinamen nach dem Schema zerlegen (siehe dateinameZerlegenMitStellen) */
export const dateinameZerlegen = (name: string, schema: Pick<Namensschema, 'reihenfolge'> = VORGABE_NAMENSSCHEMA, codes: string[] = []): Namensteile =>
  dateinameZerlegenMitStellen(name, schema, codes).teile;

/* ---------- Plannummern ---------- */

export interface PlanNummer {
  /** Plankürzel (Phase), z. B. GP */
  kuerzel: string;
  /** erste und letzte Nummer (bei einem zusammengefassten Satz verschieden) */
  von: number;
  bis: number;
  /** Index (AP-03a) – klein */
  index?: string;
}

/** Text als Teil eines regulären Ausdrucks (Sonderzeichen maskiert) */
export const regexText = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Plannummer aus dem Teil „nummer“: Plankürzel einer Phase des Schemas und Nummer – „GP-01“, „GP01“, „GP_01“, ein
 * zusammengefasster Satz „GP01-07“ bzw. „GP-01-GP-07“, mit Index „AP-03a“. Eine reine Zahl („01“) ist eine
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
