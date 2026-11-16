import type { ExportContext, PlaceholderDocs, Row, Value } from './context';
import { belongsTo, resolveText } from './context';
import type { CellValue, TemplateRow } from './template';
import { expandTemplate } from './template';

/**
 * Maschinenlesbare Beschreibung aller Platzhalter einer App – eine Quelle für die Referenz im Excel-Dialog, das Blatt
 * „Platzhalter“ der Muster-Vorlage und docs/excel-vorlagen.md. Tests prüfen Schema und erzeugte Daten in beide
 * Richtungen (vollstaendigkeit) und führen jedes Beispiel gegen die echte Engine aus (beispielAusfuehren).
 */

/** Art eines Platzhalters */
export type Art = 'einzelwert' | 'sammlung' | 'zugriff';

export const ARTEN: Record<Art, { label: string; text: string }> = {
  einzelwert: { label: 'Einzelwert', text: 'ein Wert für das ganze Projekt, z. B. {{projekt.name}}' },
  sammlung: { label: 'Sammlung', text: 'Datensätze: eine Zeile mit {{name.feld}} wird je Datensatz wiederholt, {{#name}} … {{/name}} wiederholt einen Zeilenblock' },
  zugriff: { label: 'Benannter Einzelzugriff', text: 'ein Feld eines bestimmten Datensatzes über seinen Namen, z. B. {{geschoss:EG.bgf}}' },
};

/** Wo ein Platzhalter wirkt */
export type Ort = 'zelle' | 'wiederholung' | 'block' | 'wenn' | 'kopf' | 'textfeld' | 'filter';

export const ORTE: { id: Ort; label: string; text: string }[] = [
  { id: 'zelle', label: 'Zelle', text: 'in einer Zelle, auch innerhalb wiederholter Zeilen und Blöcke' },
  { id: 'wiederholung', label: 'Wiederholt die Zeile', text: 'die Zeile mit dem Platzhalter wird je Datensatz wiederholt' },
  { id: 'block', label: 'Block {{#…}}', text: 'als Zeilenblock {{#name}} … {{/name}}' },
  { id: 'wenn', label: 'Bedingung {{#wenn}}', text: 'in einer Bedingung {{#wenn …}} … {{/wenn}}' },
  { id: 'kopf', label: 'Kopf-/Fußzeile', text: 'in Kopf- und Fußzeilen (Seite einrichten)' },
  { id: 'textfeld', label: 'Textfeld', text: 'in Textfeldern und Formen' },
  { id: 'filter', label: 'Filter […]', text: 'mit Filter in eckigen Klammern, z. B. {{raum[wofl].name}}' },
];

/** Wo welche Art nutzbar ist – so verhält sich die Engine (geprüft mit ermittleNutzbarkeit) */
export const NUTZBAR: Record<Art, Record<Ort, boolean>> = {
  einzelwert: { zelle: true, wiederholung: false, block: false, wenn: true, kopf: true, textfeld: true, filter: false },
  sammlung: { zelle: true, wiederholung: true, block: true, wenn: true, kopf: false, textfeld: false, filter: true },
  zugriff: { zelle: true, wiederholung: false, block: false, wenn: true, kopf: true, textfeld: true, filter: false },
};

export interface Einzelwert {
  schluessel: string;
  text: string;
  einheit?: string;
  /** Muster (RegExp-Quelltext) für Schlüssel, die von den Daten abhängen, z. B. kg300, kg330 */
  muster?: string;
}

export interface Feld {
  name: string;
  text: string;
  einheit?: string;
  /** Muster (RegExp-Quelltext) für eine Gruppe gleichartiger Felder, z. B. nnf_s_roh; `name` zeigt die Namensregel */
  muster?: string;
}

export interface Filter {
  name: string;
  /** gleichwertige Schreibweisen */
  aliase?: string[];
  text: string;
}

export interface Bezug {
  sammlung: string;
  text: string;
}

/** Beispiel: Vorlage (Zellen je Zeile, Formeln mit „=“) und das Ergebnis mit den Beispieldaten der App */
export interface Beispiel {
  titel: string;
  text?: string;
  vorlage: (string | null)[][];
  ergebnis: (string | number | null)[][];
  /** Hinweisarten, die die Vorlagenprüfung für diese Vorlage meldet (Beispiele für Fehler); fehlt = keine */
  pruefung?: string[];
}

export interface EinzelwertGruppe {
  art: 'einzelwerte';
  id: string;
  titel: string;
  text?: string;
  werte: Einzelwert[];
  /** erläuternde Tabelle (z. B. Namensregel), erste Zeile ist der Kopf */
  tabelle?: string[][];
  beispiele?: Beispiel[];
}

export interface Sammlung {
  art: 'sammlung';
  /** Präfix der Platzhalter: raum → {{raum.name}}, {{#raum}} */
  name: string;
  titel: string;
  /** „je Raum“ */
  datensatz: string;
  text: string;
  felder: Feld[];
  /** benannte Filter, die bei dieser Sammlung sinnvoll sind */
  filter: Filter[];
  /** im Block {{#name}} auf den aktuellen Datensatz eingeschränkte Sammlungen */
  enthaelt: Bezug[];
  /** ausdrücklich NICHT eingeschränkte Sammlungen, bei denen man es erwarten könnte */
  nichtEingeschraenkt?: Bezug[];
  /** benannter Einzelzugriff {{name:NAME.feld}} */
  zugriff?: { ueber: string; text: string; beispiel: string };
  hinweise?: string[];
  /** erläuternde Tabelle (z. B. Namensregel), erste Zeile ist der Kopf */
  tabelle?: string[][];
  beispiele: Beispiel[];
}

export type Abschnitt = EinzelwertGruppe | Sammlung;

export interface PlatzhalterSchema {
  app: string;
  /** Beschreibung der Beispieldaten, mit denen die Ergebnisse der Beispiele entstehen */
  beispieldaten: string;
  abschnitte: Abschnitt[];
}

/* ---------- Abfragen ---------- */

export const sammlungen = (s: PlatzhalterSchema) => s.abschnitte.filter((a): a is Sammlung => a.art === 'sammlung');
export const einzelwertGruppen = (s: PlatzhalterSchema) => s.abschnitte.filter((a): a is EinzelwertGruppe => a.art === 'einzelwerte');
export const alleFilterNamen = (x: Sammlung) => x.filter.flatMap((f) => [f.name, ...(f.aliase ?? [])]);

/** Kurze Liste aller Platzhalter je Abschnitt – Ersatz für die alte Tabelle (PlaceholderDocs) */
export function schemaZuDocs(s: PlatzhalterSchema): PlaceholderDocs {
  return s.abschnitte.map((a) =>
    a.art === 'einzelwerte'
      ? { group: a.titel, keys: a.werte.map((w) => [w.schluessel, w.text + (w.einheit ? ` [${w.einheit}]` : '')] as [string, string]) }
      : {
          group: `${a.name}.* – ${a.titel} (Zeile ${a.datensatz})`,
          keys: [
            ...a.felder.map((f) => [`${a.name}.${f.name}`, f.text + (f.einheit ? ` [${f.einheit}]` : '')] as [string, string]),
            ...a.filter.map((f) => [`${a.name}[${f.name}]`, `Filter: ${f.text}`] as [string, string]),
          ],
        },
  );
}

/* ---------- Prüfungen (für die Tests der Apps) ---------- */

export interface Vollstaendigkeit {
  /** erzeugt, aber nicht beschrieben */
  fehlt: string[];
  /** beschrieben, aber nicht erzeugt */
  ueberzaehlig: string[];
}

/**
 * Vergleicht Schema und erzeugten Kontext in beide Richtungen: Einzelwerte, Sammlungen und ihre Felder, benannte Filter
 * und Einzelzugriffe. Der Kontext sollte aus Testdaten stammen, in denen jede Sammlung Datensätze hat.
 */
export function vollstaendigkeit(s: PlatzhalterSchema, ctx: ExportContext): Vollstaendigkeit {
  const fehlt: string[] = [];
  const ueberzaehlig: string[] = [];
  const werte = einzelwertGruppen(s).flatMap((g) => g.werte);
  const muster = werte.filter((w) => w.muster).map((w) => new RegExp(`^(?:${w.muster})$`));
  const beschrieben = new Set(werte.filter((w) => !w.muster).map((w) => w.schluessel));
  for (const k of Object.keys(ctx.scalars)) if (!beschrieben.has(k) && !muster.some((m) => m.test(k))) fehlt.push(k);
  for (const k of beschrieben) if (!(k in ctx.scalars)) ueberzaehlig.push(k);
  for (const w of werte) if (w.muster && !Object.keys(ctx.scalars).some((k) => new RegExp(`^(?:${w.muster})$`).test(k))) ueberzaehlig.push(w.schluessel);

  const samml = sammlungen(s);
  for (const name of Object.keys(ctx.collections)) if (!samml.some((x) => x.name === name)) fehlt.push(`Sammlung ${name}`);
  for (const x of samml) {
    const rows = ctx.collections[x.name];
    if (!rows) {
      ueberzaehlig.push(`Sammlung ${x.name}`);
      continue;
    }
    const echt = new Set(rows.flatMap((r) => Object.keys(r)).filter((k) => !k.startsWith('_')));
    const felder = new Set(x.felder.filter((f) => !f.muster).map((f) => f.name));
    const fMuster = x.felder.filter((f) => f.muster).map((f) => ({ f, re: new RegExp(`^(?:${f.muster})$`) }));
    for (const k of echt) if (!felder.has(k) && !fMuster.some((m) => m.re.test(k))) fehlt.push(`${x.name}.${k}`);
    if (rows.length) {
      for (const k of felder) if (!echt.has(k)) ueberzaehlig.push(`${x.name}.${k}`);
      for (const m of fMuster) if (![...echt].some((k) => m.re.test(k))) ueberzaehlig.push(`${x.name}.${m.f.name}`);
    }
    if (x.zugriff && !ctx.byName?.[x.name]) ueberzaehlig.push(`${x.name}:NAME`);
    if (!x.zugriff && ctx.byName?.[x.name]) fehlt.push(`${x.name}:NAME`);
  }
  for (const n of Object.keys(ctx.byName ?? {})) if (!samml.some((x) => x.name === n)) fehlt.push(`${n}:NAME`);

  const filter = new Set(samml.flatMap(alleFilterNamen));
  for (const f of Object.keys(ctx.filters ?? {})) if (!filter.has(f)) fehlt.push(`Filter [${f}]`);
  for (const f of filter) if (!ctx.filters?.[f]) ueberzaehlig.push(`Filter [${f}]`);
  return { fehlt, ueberzaehlig };
}

/** Ist `kind` im Block der Sammlung `eltern` auf den Datensatz eingeschränkt? (für mindestens einen Eltern-Datensatz) */
export function eingeschraenkt(ctx: ExportContext, eltern: string, kind: string): boolean {
  const kinder = ctx.collections[kind] ?? [];
  return (ctx.collections[eltern] ?? []).some((p) => kinder.some((r) => !belongsTo(kind, r, eltern, p, ctx)));
}

/** Vorlagenzeilen aus einer Tabelle (leere Zellen weglassen, „=…“ als Formel) */
export function vorlagenZeilen(spec: (string | null)[][]): TemplateRow[] {
  return spec.map((cells, i) => {
    const m = new Map<number, CellValue>();
    cells.forEach((v, c) => {
      if (v === null || v === '') return;
      m.set(c + 1, v.startsWith('=') ? { formula: v.slice(1) } : v);
    });
    return { r: i + 1, cells: m };
  });
}

/** Führt ein Beispiel mit der echten Engine aus: Ergebnis als Tabelle (Formeln als „=…“, leere Zellen null) */
export function beispielAusfuehren(b: Pick<Beispiel, 'vorlage'>, ctx: ExportContext): (string | number | null)[][] {
  const breite = Math.max(1, ...b.vorlage.map((z) => z.length));
  return expandTemplate(vorlagenZeilen(b.vorlage), ctx).map((o) =>
    Array.from({ length: breite }, (_, i) => {
      const v = o.cells.get(i + 1);
      if (v === undefined || v === null || v === '') return null;
      if (typeof v === 'object' && 'formula' in v) return `=${v.formula}`;
      return v as string | number;
    }),
  );
}

/** Ersetzung in Kopf- und Fußzeilen (wie fuelleVorlage; „&“ ist dort Steuerzeichen und wird verdoppelt) */
export function kopfFusszeileErsetzen(t: string, ctx: ExportContext): string {
  return t.replace(/\{\{[^{}]+\}\}/g, (m) => {
    const v = resolveText(m, ctx);
    return v === m ? m : (typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : String(v)).replace(/&/g, '&&');
  });
}

/** Ersetzung in Textfeldern und Formen (wie fuelleVorlage) */
export const textfeldErsetzen = (t: string, ctx: ExportContext) => String(resolveText(t, ctx));

const leer = (v: unknown) => v === null || v === undefined || v === '';

/**
 * Wo wirkt ein Platzhalter wirklich? Probiert ihn in jedem Ort mit der Engine aus. `ph` ohne Klammern, z. B.
 * „summe.bgf“, „raum.name“ oder „geschoss:EG.bgf“; der Wert muss in den Testdaten gefüllt sein.
 */
export function ermittleNutzbarkeit(ph: string, ctx: ExportContext): Record<Ort, boolean> {
  const zelle = (t: string) => beispielAusfuehren({ vorlage: [[t]] }, ctx);
  const erste = zelle(`{{${ph}}}`);
  const ersetzt = erste.length > 0 && !leer(erste[0][0]) && erste[0][0] !== `{{${ph}}}`;
  const coll = /^([a-z][a-z0-9]*)\.([a-z0-9_]+)$/i.exec(ph);
  // ein Einzelwert, dessen Präfix wie eine Sammlung heißt ({{lageplan.angerechnet_auf}}), ist kein Sammlungsfeld
  const name = coll && !(ph in ctx.scalars) ? coll[1].toLowerCase() : ph;
  const anzahl = ctx.collections[name]?.length ?? 0;
  // Bedingung: Vergleich mit dem tatsächlichen Wert trifft zu, mit einem anderen nicht
  let wenn = false;
  const wert = erste[0]?.[0];
  if (ersetzt && wert !== null) {
    const ja = zelle(`{{#wenn ${ph}=${wert}}}ja{{/wenn}}`).length === 1;
    const nein = zelle(`{{#wenn ${ph}=§nie§}}ja{{/wenn}}`).length === 0;
    wenn = ja && nein;
  }
  const block = zelle(`{{#${name}}}x{{/${name}}}`);
  // Filter: ein Feldvergleich, der alles durchlässt, bzw. einer, der nichts durchlässt
  const gefiltert = zelle(`{{${ph.replace(/^([a-z][a-z0-9]*)/i, '$1[zzfeld!=zznie]')}}}`);
  const nichts = zelle(`{{${ph.replace(/^([a-z][a-z0-9]*)/i, '$1[zzfeld=zznie]')}}}`);
  return {
    zelle: ersetzt,
    wiederholung: ersetzt && anzahl > 1 && erste.length === anzahl,
    block: anzahl > 1 && block.length === anzahl && block.every((z) => z[0] === 'x'),
    wenn,
    kopf: kopfFusszeileErsetzen(`{{${ph}}}`, ctx) !== `{{${ph}}}`,
    textfeld: textfeldErsetzen(`{{${ph}}}`, ctx) !== `{{${ph}}}`,
    filter: ersetzt && gefiltert.length === erste.length && gefiltert[0]?.[0] === wert && nichts.every((z) => leer(z[0])),
  };
}

/* ---------- Suche ---------- */

const norm = (t: string) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

/** Passt ein Text zur Suche? Alle Wörter müssen vorkommen (ohne Groß/klein, ä = ae) */
export function passt(suche: string, ...texte: (string | undefined)[]): boolean {
  const w = norm(suche).split(/\s+/).filter(Boolean);
  if (!w.length) return true;
  const t = norm(texte.filter(Boolean).join(' '));
  return w.every((x) => t.includes(x));
}

export type { Row, Value };
