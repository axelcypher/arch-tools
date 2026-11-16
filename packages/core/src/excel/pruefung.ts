import type { ExportContext } from './context';
import { globalMitFormat, isCollection, zusaetzeLesen } from './context';
import type { PlatzhalterSchema } from './schema';
import type { CellValue, TemplateRow } from './template';

/**
 * Vorlagenprüfung: meldet mögliche Tippfehler einer Excel-Vorlage mit Blatt und Zelle. Sie ändert nichts an der
 * Ausgabe. Grundlage sind der Export-Kontext (Einzelwerte, Sammlungen mit ihren Feldern, benannte Filter) und – für
 * „Filter passt nicht zur Sammlung“ – das Schema der App.
 */

export type HinweisArt =
  | 'filter'
  | 'filterfelder'
  | 'vergleichsfeld'
  | 'feld'
  | 'name'
  | 'schreibweise'
  | 'zusatz'
  | 'zweite-sammlung'
  | 'block-offen'
  | 'block-verwaist'
  | 'block-unbekannt'
  | 'block-doppelt'
  | 'block-falsch'
  | 'markierung-zeile'
  | 'filterpunkt'
  | 'klammern'
  | 'kopf'
  | 'einzelwert';

export interface VorlagenHinweis {
  art: HinweisArt;
  /** Blattname */
  blatt?: string;
  /** Zelle (A1), „Kopf-/Fußzeile“ oder „Textfeld“ */
  ort: string;
  platzhalter: string;
  text: string;
}

/** Hinweisarten für Doku und Abschlussbericht */
export const HINWEISARTEN: Record<HinweisArt, string> = {
  filter: 'unbekannter benannter Filter',
  filterfelder: 'benannter Filter, dessen Felder im Zusammenhang fehlen',
  vergleichsfeld: 'Vergleich auf ein Feld, das es im Zusammenhang nicht gibt',
  feld: 'unbekanntes Feld einer Sammlung bzw. beim Einzelzugriff',
  name: 'unbekannter Name beim Einzelzugriff',
  schreibweise: 'falsche Groß-/Kleinschreibung oder Leerzeichen im Namen',
  zusatz: 'unbekannter Zusatz',
  'zweite-sammlung': 'zweite ungebundene Sammlung in einer Zeile',
  'block-offen': 'nicht geschlossener Block',
  'block-verwaist': 'Blockende ohne Anfang',
  'block-unbekannt': 'unbekannter Blockname',
  'block-doppelt': 'zwei Blockanfänge in einer Zeile',
  'block-falsch': 'Blockende schließt einen anderen offenen Block',
  'markierung-zeile': 'Blockmarkierung mitten im Text einer Zelle (gilt für die ganze Zeile)',
  filterpunkt: 'Punkt in einem Filterfeld (sammlung.feld statt feld)',
  klammern: 'doppelte oder unpaarige eckige Klammern',
  kopf: '|einmal oder Sammlungsfeld in Kopf-/Fußzeile oder Textfeld',
  einzelwert: 'unbekannter Einzelwert',
};

const PH = () => /\{\{\s*([^{}]+?)\s*\}\}/g;
const VERGLEICH = /^((?:[^[\]=!<>]|\[[^\]]*\])+?)\s*(!=|>=|<=|=|>|<)\s*(.*)$/;
const TERM = /^([a-z0-9_]+)\s*(!=|>=|<=|=|>|<)\s*(.*)$/i;

/** benannter Filter → Sammlungen, bei denen er laut Schema sinnvoll ist */
export function filterSammlungen(schema: PlatzhalterSchema | undefined): Record<string, string[]> | undefined {
  if (!schema) return undefined;
  const m: Record<string, string[]> = {};
  for (const a of schema.abschnitte) if (a.art === 'sammlung') for (const f of a.filter) for (const n of [f.name, ...(f.aliase ?? [])]) (m[n.toLowerCase()] ??= []).push(a.name);
  return m;
}

const colLetter = (n: number) => {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

function cellText(v: CellValue | undefined): string | null {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'richText' in v) return v.richText.map((r) => r.text).join('');
  return null;
}

class Pruefer {
  hinweise: VorlagenHinweis[] = [];
  private felder = new Map<string, Set<string>>();
  private filterZu?: Record<string, string[]>;
  constructor(
    private ctx: ExportContext,
    schema?: PlatzhalterSchema,
  ) {
    this.filterZu = filterSammlungen(schema);
    for (const [name, rows] of Object.entries(ctx.collections)) this.felder.set(name, new Set(rows.flatMap((r) => Object.keys(r)).filter((k) => !k.startsWith('_'))));
    // ohne Datensätze kennt der Kontext die Felder nicht – dann aus dem Schema
    for (const a of schema?.abschnitte ?? []) if (a.art === 'sammlung' && !this.felder.get(a.name)?.size) this.felder.set(a.name, new Set(a.felder.map((f) => f.name)));
  }

  private melde(art: HinweisArt, ort: { blatt?: string; ort: string }, platzhalter: string, text: string) {
    this.hinweise.push({ art, ...ort, platzhalter: `{{${platzhalter}}}`, text });
  }

  private sammlungsName(n: string) {
    const l = n.toLowerCase();
    return isCollection(this.ctx, l) ? l : undefined;
  }

  /** Felder im Zusammenhang einer Bedingung [ … ]: gebundener Datensatz bzw. Projektsummen */
  private kontextFelder(gebunden: string | undefined): { felder: Set<string>; titel: string } {
    if (gebunden) return { felder: this.felder.get(gebunden) ?? new Set(), titel: `im Block {{#${gebunden}}}` };
    return {
      felder: new Set(
        Object.keys(this.ctx.scalars)
          .filter((k) => k.startsWith('summe.'))
          .map((k) => k.slice(6)),
      ),
      titel: 'auf oberster Ebene (Projektsummen summe.*)',
    };
  }

  /** prüft eine Filterliste für eine Sammlung bzw. einen Zusammenhang ([…] einer Bedingung: `bereich`) */
  private filterPruefen(spec: string, ziel: { sammlung?: string; felder: Set<string>; titel: string; bereich?: boolean }, ort: { blatt?: string; ort: string }, ph: string) {
    const filter = this.ctx.filters ?? {};
    const benannt: string[] = [];
    const neu: string[] = [];
    for (const roh of spec
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)) {
      const neg = roh.startsWith('!') ? '!' : '';
      const t = neg ? roh.slice(1).trim() : roh;
      const punkt = /^([a-z][a-z0-9]*)\.([a-z0-9_]+)\s*(!=|>=|<=|=|>|<)/i.exec(t);
      if (punkt) {
        this.melde(
          'filterpunkt',
          ort,
          ph,
          `Im Filter steht nur der Feldname: [${t.replace(/^[a-z][a-z0-9]*\./i, '')}] – „${punkt[1]}.${punkt[2]}“ wird als unbekannter Filter gelesen und trifft nie zu.`,
        );
        neu.push(roh);
        continue;
      }
      const v = TERM.exec(t);
      if (v) {
        const feld = v[1];
        if (ziel.felder.size && !ziel.felder.has(feld)) {
          if (filter[feld.toLowerCase()]) {
            this.melde('vergleichsfeld', ort, ph, `„${feld}“ ist ein benannter Filter, kein Feld – ohne Vergleich schreiben: [${neg}${feld}].`);
            benannt.push(feld.toLowerCase());
            neu.push(`${neg}${feld}`);
            continue;
          }
          const gross = [...ziel.felder].find((f) => f.toLowerCase() === feld.toLowerCase());
          if (gross) this.melde('schreibweise', ort, ph, `Feld „${feld}“ heißt „${gross}“ (klein schreiben).`);
          else this.melde('vergleichsfeld', ort, ph, `Feld „${feld}“ gibt es ${ziel.titel} nicht – der Vergleich trifft dort nie zu.`);
        }
        neu.push(roh);
        continue;
      }
      if (!filter[t.toLowerCase()]) {
        const aehnlich = Object.keys(filter).filter((b) => abstand(b, t.toLowerCase()) <= 2);
        this.melde('filter', ort, ph, `Filter [${t}] gibt es nicht – er trifft nie zu.${aehnlich.length ? ` Meinten Sie [${aehnlich[0]}]?` : ''}`);
      } else benannt.push(t.toLowerCase());
      neu.push(roh);
    }
    if (!this.filterZu) return;
    const zu = this.filterZu;
    const nichtPassend = benannt.filter((f) => !ziel.sammlung || !(zu[f] ?? []).includes(ziel.sammlung));
    if (!nichtPassend.length) return;
    const gemeinsam = Object.keys(this.ctx.collections).find((c) => benannt.every((f) => (zu[f] ?? []).includes(c)));
    const vorschlag = gemeinsam && ziel.bereich ? ` Meinten Sie {{#wenn ${gemeinsam}[${neu.join(',')}]}}?` : '';
    this.melde(
      'filterfelder',
      ort,
      ph,
      `${nichtPassend.map((f) => `[${f}]`).join(', ')} prüft Felder, die es ${ziel.titel} nicht gibt – trifft dort nie zu${gemeinsam ? ` (gehört zu ${gemeinsam})` : ''}.${vorschlag}`,
    );
  }

  private klammernOk(inner: string, ort: { blatt?: string; ort: string }): boolean {
    let tiefe = 0;
    let ok = true;
    for (const ch of inner) {
      if (ch === '[') tiefe++;
      else if (ch === ']') tiefe--;
      if (tiefe > 1 || tiefe < 0) ok = false;
    }
    if (tiefe !== 0) ok = false;
    if (!ok) this.melde('klammern', ort, inner, 'Eckige Klammern doppelt oder unpaarig – Filter stehen in genau einem Paar: name[filter].feld.');
    return ok;
  }

  /** Ist der Schlüssel gültig? (ohne Meldung) */
  private gueltig(key: string): boolean {
    if (key in this.ctx.scalars || globalMitFormat(key, this.ctx) !== undefined) return true;
    const named = /^([a-z][a-z0-9]*):(.+)\.([a-z0-9_]+)$/i.exec(key);
    if (named && this.ctx.byName?.[named[1]]) return this.ctx.byName[named[1]].has(named[2].trim()) && !!this.felder.get(named[1])?.has(named[3]);
    const m = /^([a-z][a-z0-9]*)(?:\[([^\]]*)\])?\.([a-z0-9_]+)$/.exec(key);
    return !!m && isCollection(this.ctx, m[1]) && !!this.felder.get(m[1])?.has(m[3]);
  }

  /** Vorschlag für eine falsche Schreibweise (Leerzeichen, Groß-/Kleinschreibung) */
  private vorschlag(key: string): string | undefined {
    const ohne = key.replace(/\s+(?![^[]*\])/g, '');
    const kandidaten = [ohne];
    const m = /^([a-z][a-z0-9]*)(\[[^\]]*\])?\.([a-z0-9_]+)$/i.exec(ohne);
    if (m) {
      const c = m[1].toLowerCase();
      const f = [...(this.felder.get(c) ?? [])].find((x) => x.toLowerCase() === m[3].toLowerCase());
      if (f) kandidaten.push(`${c}${m[2] ?? ''}.${f}`);
    }
    const s = Object.keys(this.ctx.scalars).find((k) => k.toLowerCase() === ohne.toLowerCase());
    if (s) kandidaten.push(s);
    return kandidaten.find((k) => k !== key && this.gueltig(k));
  }

  /** ein Platzhalter (ohne Klammern) in einer Zelle bzw. in Kopf-/Fußzeile oder Textfeld */
  schluessel(inner: string, ort: { blatt?: string; ort: string }, gebunden: Set<string>, kopf: boolean): string | undefined {
    const z = zusaetzeLesen(inner);
    const key = z.key;
    const mod = inner.includes('|') ? inner.slice(inner.indexOf('|') + 1) : undefined;
    for (const u of z.unbekannt)
      this.melde('zusatz', ort, inner.trim(), `Zusatz |${u} gibt es nicht (nur |einmal, |vor:TEXT, |nach:TEXT)${kopf ? ' – der Platzhalter bleibt hier als Text stehen' : ' – er wird ignoriert'}.`);
    if (z.einmal && kopf) this.melde('kopf', ort, inner.trim(), '|einmal wirkt in Kopf-/Fußzeilen und Textfeldern nicht – der Platzhalter bleibt dort als Text stehen.');
    inner = inner.trim();
    if (!this.klammernOk(key, ort)) return undefined;
    if (key in this.ctx.scalars || globalMitFormat(key, this.ctx) !== undefined) return undefined;
    const vorschlag = this.vorschlag(key);
    if (vorschlag) {
      this.melde('schreibweise', ort, inner, `Schreibweise: {{${vorschlag}${mod ? `|${mod}` : ''}}} (Namen klein und ohne Leerzeichen).`);
      return undefined;
    }
    const named = /^([a-z][a-z0-9]*):(.+)\.([a-z0-9_]+)$/i.exec(key);
    if (named && (this.ctx.byName?.[named[1]] || isCollection(this.ctx, named[1].toLowerCase()))) {
      const map = this.ctx.byName?.[named[1]];
      if (!map) this.melde('name', ort, inner, `Für ${named[1]} gibt es keinen Einzelzugriff über den Namen.`);
      else if (map.size && !map.has(named[2].trim()))
        this.melde('name', ort, inner, `„${named[2].trim()}“ gibt es in ${named[1]} nicht (vorhanden: ${[...map.keys()].slice(0, 6).join(', ')}) – die Zelle bleibt leer.`);
      else if (!this.felder.get(named[1])?.has(named[3])) this.melde('feld', ort, inner, `Feld „${named[3]}“ gibt es bei ${named[1]} nicht – die Zelle bleibt leer.`);
      return undefined;
    }
    const m = /^([a-z][a-z0-9]*)(?:\[([^\]]*)\])?\.([a-z0-9_]+)$/i.exec(key);
    const coll = m && this.sammlungsName(m[1]);
    if (m && coll) {
      if (kopf) {
        this.melde('kopf', ort, inner, 'Sammlungsfelder werden in Kopf-/Fußzeilen und Textfeldern nicht ersetzt – Einzelwert oder Einzelzugriff verwenden.');
        return undefined;
      }
      const felder = this.felder.get(coll) ?? new Set();
      if (felder.size && !felder.has(m[3])) this.melde('feld', ort, inner, `Feld „${m[3]}“ gibt es bei ${coll} nicht – die Zelle bleibt leer.`);
      if (m[2]) this.filterPruefen(m[2], { sammlung: coll, felder, titel: `bei ${coll}` }, ort, inner);
      return gebunden.has(coll) ? undefined : coll;
    }
    if (/\[/.test(key)) this.melde('einzelwert', ort, inner, 'Filter wirken nur an Sammlungen – an Einzelwerten bleibt der Platzhalter als Text stehen.');
    else this.melde('einzelwert', ort, inner, 'Unbekannter Platzhalter – er bleibt als Text stehen.');
    return undefined;
  }

  /** Filter an einem Blockanfang {{#name[…]}} */
  blockFilter(coll: string, spec: string, ort: { blatt?: string; ort: string }, ph: string) {
    if (this.klammernOk(`${coll}[${spec}]`, ort)) this.filterPruefen(spec, { sammlung: coll, felder: this.felder.get(coll) ?? new Set(), titel: `bei ${coll}` }, ort, ph.replace(/^\{\{|\}\}$/g, ''));
  }

  /** Bedingung eines {{#wenn …}} */
  bedingung(expr: string, ort: { blatt?: string; ort: string }, innerste: string | undefined, gebunden: Set<string>) {
    let e = expr.trim();
    if (e.startsWith('!')) e = e.slice(1).trim();
    const ph = `#wenn ${expr.trim()}`;
    if (!this.klammernOk(e, ort)) return;
    const bereich = /^\[([^\]]*)\]$/.exec(e);
    if (bereich) {
      const k = this.kontextFelder(innerste);
      this.filterPruefen(bereich[1], { sammlung: innerste, ...k, bereich: true }, ort, ph);
      return;
    }
    const vgl = VERGLEICH.exec(e);
    const links = vgl ? vgl[1].trim() : e;
    const c = /^([a-z][a-z0-9]*)(?:\[([^\]]*)\])?$/i.exec(links);
    if (c && this.sammlungsName(c[1])) {
      const coll = this.sammlungsName(c[1])!;
      if (c[2]) this.filterPruefen(c[2], { sammlung: coll, felder: this.felder.get(coll) ?? new Set(), titel: `bei ${coll}` }, ort, ph);
      return;
    }
    this.schluessel(links, ort, gebunden, false);
  }
}

/** Levenshtein-Abstand (kurze Namen) */
function abstand(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Prüft die Zeilen eines Blatts (Zellen mit Platzhaltern, Blöcke, Bedingungen) – Blockregeln wie in der Engine */
export function pruefeBlatt(rows: TemplateRow[], ctx: ExportContext, opts: { blatt?: string; schema?: PlatzhalterSchema } = {}): VorlagenHinweis[] {
  const p = new Pruefer(ctx, opts.schema);
  const stapel: { name: string; ort: string; ph: string; wenn: boolean }[] = [];
  const blockName = (n: string) => (ctx.collections[n.toLowerCase()] ? n.toLowerCase() : undefined);
  const hinweis = (art: HinweisArt, ort: { blatt?: string; ort: string }, platzhalter: string, text: string) => p.hinweise.push({ art, ...ort, platzhalter, text });
  for (const row of rows) {
    type Treffer = { voll: string; inner: string; vorher: string; nachher: string };
    const zellen: { ort: { blatt?: string; ort: string }; treffer: Treffer[] }[] = [];
    for (const [col, v] of row.cells) {
      const t = cellText(v);
      if (!t || !t.includes('{{')) continue;
      zellen.push({
        ort: { blatt: opts.blatt, ort: `${colLetter(col)}${row.r}` },
        treffer: [...t.matchAll(PH())].map((m) => ({ voll: m[0], inner: m[0].slice(2, -2), vorher: t.slice(0, m.index), nachher: t.slice(m.index! + m[0].length) })),
      });
    }
    const vorher = [...stapel].reverse().find((s) => !s.wenn)?.name;
    const gebundenVorher = new Set(stapel.filter((s) => !s.wenn).map((s) => s.name));
    // 1. Blockanfänge: je Zeile gilt nur der letzte (wie die Engine)
    const anfaenge: { name: string; wenn: boolean; ort: { blatt?: string; ort: string }; ph: string }[] = [];
    const enden: { name: string; ort: { blatt?: string; ort: string }; ph: string }[] = [];
    for (const z of zellen)
      for (const m of z.treffer) {
        const inner = m.inner.trim();
        const wenn = /^#\s*wenn\b\s*(.*)$/i.exec(inner);
        const start = !wenn && /^#\s*([a-z][a-z0-9]*)\s*(?:\[([^\]]*)\])?$/i.exec(inner);
        const ende = /^\/\s*([a-z][a-z0-9]*)\s*$/i.exec(inner);
        if (!wenn && !start && !ende) continue;
        // Markierungen stehen am Anfang (Anfang) bzw. am Ende (Ende) einer Zelle – sie gelten für die ganze Zeile
        if ((wenn || start) && m.vorher.replace(/\{\{[^{}]*\}\}/g, (x) => (/^\{\{\s*#/.test(x) ? '' : x)).trim())
          hinweis('markierung-zeile', z.ort, m.voll, 'Die Markierung gilt für die ganze Zeile, nicht nur für den Text dahinter. Für Text nur bei gefülltem Wert: {{feld|vor:TEXT}}.');
        if (ende && m.nachher.replace(/\{\{\s*\/[^{}]*\}\}/g, '').trim())
          hinweis('markierung-zeile', z.ort, m.voll, 'Das Blockende gilt nach der ganzen Zeile, nicht direkt hinter dem Text davor. Für Text nur bei gefülltem Wert: {{feld|vor:TEXT}}.');
        if (wenn) {
          p.bedingung(wenn[1], z.ort, vorher, gebundenVorher);
          anfaenge.push({ name: 'wenn', wenn: true, ort: z.ort, ph: m.voll });
        } else if (start) {
          const coll = blockName(start[1]);
          if (!coll) {
            hinweis('block-unbekannt', z.ort, m.voll, `Block „${start[1]}“ gibt es nicht – die Markierung bleibt als Text stehen.`);
            continue;
          }
          if (start[2]) p.blockFilter(coll, start[2], z.ort, m.voll);
          anfaenge.push({ name: coll, wenn: false, ort: z.ort, ph: m.voll });
        } else if (ende) {
          const name = ende[1].toLowerCase();
          if (name !== 'wenn' && !blockName(name)) hinweis('block-unbekannt', z.ort, m.voll, `Block „${ende[1]}“ gibt es nicht – die Markierung bleibt als Text stehen.`);
          else enden.push({ name, ort: z.ort, ph: m.voll });
        }
      }
    const gilt = anfaenge[anfaenge.length - 1];
    for (const a of anfaenge.slice(0, -1))
      hinweis('block-doppelt', a.ort, a.ph, `Je Zeile gilt nur ein Blockanfang: ${a.ph} öffnet nicht, es gilt ${gilt.ph}. Den Anfang in eine eigene Zeile setzen.`);
    if (gilt) stapel.push({ name: gilt.name, ort: gilt.ort.ort, ph: gilt.ph, wenn: gilt.wenn });

    // 2. Platzhalter der Zeile
    const gebunden = new Set(stapel.filter((s) => !s.wenn).map((s) => s.name));
    const ungebunden: { coll: string; ort: string; ph: string }[] = [];
    for (const z of zellen)
      for (const m of z.treffer) {
        if (/^\s*[#/]/.test(m.inner)) continue;
        const coll = p.schluessel(m.inner, z.ort, gebunden, false);
        if (coll) ungebunden.push({ coll, ort: z.ort.ort, ph: m.voll.replace(/^\{\{\s*|\s*\}\}$/g, (x) => x.trim()) });
      }
    const erste = ungebunden[0];
    const gemeldet = new Set<string>();
    for (const u of ungebunden)
      if (erste && u.coll !== erste.coll && !gemeldet.has(u.coll)) {
        gemeldet.add(u.coll);
        hinweis(
          'zweite-sammlung',
          { blatt: opts.blatt, ort: u.ort },
          u.ph,
          `Eine ungebundene Sammlung je Zeile: die Zeile wird je ${erste.coll} wiederholt, ${u.ph} bleibt als Text stehen – für ${u.coll} einen Block verwenden.`,
        );
      }

    // 3. Blockenden nach der Zeile – wie die Engine: ein Sammlungsende schließt den obersten Block, ohne den Namen zu prüfen
    const sammlungsEnden = enden.filter((e) => e.name !== 'wenn');
    const wennEnden = enden.filter((e) => e.name === 'wenn');
    sammlungsEnden.forEach((e, i) => {
      const oben = stapel[stapel.length - 1];
      if (i > 0 || !oben) return hinweis('block-verwaist', e.ort, e.ph, `${e.ph} ohne passenden Anfang – wird ignoriert.`);
      stapel.pop();
      if (oben.wenn || oben.name !== e.name) hinweis('block-falsch', e.ort, e.ph, `${e.ph} schließt den offenen Block ${oben.ph} – Anfang und Ende passen nicht zusammen.`);
    });
    wennEnden.forEach((e, i) => {
      const oben = stapel[stapel.length - 1];
      if (i === 0 && oben?.wenn) stapel.pop();
      else hinweis('block-verwaist', e.ort, e.ph, `${e.ph} ohne passenden Anfang – wird ignoriert.`);
    });
  }
  for (const s of stapel) p.hinweise.push({ art: 'block-offen', blatt: opts.blatt, ort: s.ort, platzhalter: s.ph, text: 'Block ohne Ende – er läuft bis zum Blattende.' });
  return p.hinweise;
}

/** Prüft den Text einer Kopf-/Fußzeile bzw. eines Textfelds */
export function pruefeText(text: string, ctx: ExportContext, ort: { blatt?: string; ort: string }, schema?: PlatzhalterSchema): VorlagenHinweis[] {
  const p = new Pruefer(ctx, schema);
  for (const m of text.matchAll(PH())) {
    if (/^[#/]/.test(m[1].trim())) {
      p.hinweise.push({ art: 'kopf', ...ort, platzhalter: m[0], text: 'Blöcke und Bedingungen wirken in Kopf-/Fußzeilen und Textfeldern nicht.' });
      continue;
    }
    p.schluessel(m[0].slice(2, -2), ort, new Set(), true);
  }
  return p.hinweise;
}
