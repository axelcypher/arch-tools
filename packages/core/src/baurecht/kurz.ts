/**
 * Bedingungen in Kurzform auswerten (dreiwertig) und in Worten darstellen. Unbekanntes ist offen, nie „trifft nicht
 * zu“; „und“: ein Nein entscheidet, „oder“: ein Ja entscheidet, sonst offen, wenn etwas offen ist (wie R-01 in
 * Formulare).
 */

import { MERKMAL_TITEL } from './fakten';
import { gemeindeName } from './gemeinden';
import type { Ampel, FaktDef, FaktWert, Kurz, Wahrheit } from './typen';
import { einheitZu, faktName, zaehlEinheit } from './typen';

export interface KurzKontext {
  merkmale: Record<string, string>;
  fakten: Record<string, FaktWert>;
  /** geplante Einreichung und heute (JJJJ-MM-TT) */
  einreichung: string;
  heute: string;
  bausteine: Record<string, Kurz>;
  /** Ampel eines anderen Paragrafen (unsicher: beruht auf einer Festlegung von Hand); undefined = unbekannt (offen) */
  ampel?: (id: string) => { ampel: Ampel; unsicher?: boolean } | undefined;
  /** Merkmale, deren Wert der Ableitung aus dem Modell widerspricht */
  widersprueche?: Set<string>;
}

export interface Bewertung {
  w: Wahrheit;
  /** fehlende Fakten/Merkmale (Kennungen) */
  offen: string[];
  /** verwendete Fakten, die nur Hinweis sind */
  unsicher: string[];
  /** verwendete Merkmale mit Widerspruch */
  widerspruch: string[];
  /** alle verwendeten Fakten (für „überholt“) */
  verwendet: string[];
}

const leer = (): Bewertung => ({ w: 'ja', offen: [], unsicher: [], widerspruch: [], verwendet: [] });
const vereinen = (w: Wahrheit, teile: Bewertung[]): Bewertung => ({
  w,
  offen: [...new Set(teile.flatMap((t) => t.offen))],
  unsicher: [...new Set(teile.flatMap((t) => t.unsicher))],
  widerspruch: [...new Set(teile.flatMap((t) => t.widerspruch))],
  verwendet: [...new Set(teile.flatMap((t) => t.verwendet))],
});

const aus = (b: boolean): Wahrheit => (b ? 'ja' : 'nein');

const gleich = (a: unknown, b: unknown) => (typeof a === 'string' && typeof b === 'string' ? a.trim().toLowerCase() === b.trim().toLowerCase() : a === b);

/** Bedingung auswerten; `tiefe` schützt vor Zyklen in Bausteinen */
export function werten(k: Kurz | undefined, ctx: KurzKontext, tiefe = 0): Bewertung {
  if (!k) return leer();
  if (tiefe > 20) throw new Error('Bedingung zu tief verschachtelt (Zyklus in Bausteinen?)');
  if ('immer' in k) return leer();
  if ('nie' in k) return { ...leer(), w: 'nein' };
  if ('und' in k || 'oder' in k) {
    const teile = ('und' in k ? k.und : k.oder).map((t) => werten(t, ctx, tiefe + 1));
    // leeres „und“ ist wahr, leeres „oder“ falsch (paketPruefen meldet beide als Fehler)
    if (!teile.length) return 'und' in k ? leer() : { ...leer(), w: 'nein' };
    const entscheidet: Wahrheit = 'und' in k ? 'nein' : 'ja';
    const ws = teile.map((t) => t.w);
    // nur die Teile, die das Ergebnis tragen, zählen für offen/unsicher – und von ihnen der sicherste: ein einziger
    // gesicherter Teil entscheidet „und = nein“ bzw. „oder = ja“ sicher, unsichere Nebenteile werten das nicht ab
    // (z. B. „Innenbereich“ schließt einen Landschaftsplan aus, auch wenn der Plan im Gemeindegebiet nur Hinweis ist)
    if (ws.includes(entscheidet)) {
      const tragend = teile.filter((t) => t.w === entscheidet);
      const gewicht = (t: Bewertung) => t.unsicher.length + t.widerspruch.length;
      const best = tragend.reduce((a, b) => (gewicht(b) < gewicht(a) ? b : a));
      return { ...vereinen(entscheidet, [best]), verwendet: [...new Set(tragend.flatMap((t) => t.verwendet))] };
    }
    if (ws.includes('offen')) return vereinen('offen', teile);
    return vereinen('und' in k ? 'ja' : 'nein', teile);
  }
  if ('nicht' in k && !('m' in k)) {
    const b = werten(k.nicht, ctx, tiefe + 1);
    return { ...b, w: b.w === 'offen' ? 'offen' : b.w === 'ja' ? 'nein' : 'ja' };
  }
  if ('$' in k) {
    const b = ctx.bausteine[k.$];
    if (!b) throw new Error(`Baustein „${k.$}“ unbekannt`);
    return werten(b, ctx, tiefe + 1);
  }
  if ('m' in k) {
    const v = ctx.merkmale[k.m];
    const widerspruch = ctx.widersprueche?.has(k.m) ? [`merkmal:${k.m}`] : [];
    if (!v) return { w: 'offen', offen: [`merkmal:${k.m}`], unsicher: [], widerspruch, verwendet: [`merkmal:${k.m}`] };
    const w = k.in ? aus(k.in.includes(v)) : k.nicht ? aus(!k.nicht.includes(v)) : 'ja';
    return { w, offen: [], unsicher: [], widerspruch, verwendet: [`merkmal:${k.m}`] };
  }
  if ('f' in k) {
    const fw = ctx.fakten[k.f];
    const verwendet = [k.f];
    if (k.bekannt !== undefined) return { w: aus((fw?.wert != null && fw.wert !== '') === k.bekannt), offen: [], unsicher: [], widerspruch: [], verwendet };
    if (!fw || fw.wert === null || fw.wert === '') return { w: 'offen', offen: [k.f], unsicher: [], widerspruch: [], verwendet };
    const v = fw.wert;
    let w: Wahrheit = 'ja';
    if (k.ist !== undefined) w = aus(gleich(v, k.ist));
    else if (k.in) w = aus(k.in.some((x) => gleich(v, x)));
    if (w === 'ja' && (k.min !== undefined || k.max !== undefined)) {
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n)) return { w: 'offen', offen: [k.f], unsicher: [], widerspruch: [], verwendet };
      // „x,01“ steht im Schema für „über x“ (so heißt es auch in Worten) und wird als echtes „größer als x“ gewertet –
      // sonst fiele „22,005 m“ durch die Lücke zwischen 22 und 22,01
      const ab = k.min === undefined ? undefined : ueberBasis(k.min);
      w = aus((k.min === undefined || (ab !== undefined ? n > ab : n >= k.min)) && (k.max === undefined || n <= k.max));
    }
    const unsicher = fw.sicherheit === 'hinweis' && !fw.bestaetigt ? [k.f] : [];
    return { w, offen: [], unsicher, widerspruch: fw.widerspruch ? [k.f] : [], verwendet };
  }
  if ('tag' in k) {
    const d = k.tag === 'einreichung' ? ctx.einreichung : ctx.heute;
    return { w: aus((!k.ab || d >= k.ab) && (!k.vor || d < k.vor)), offen: [], unsicher: [], widerspruch: [], verwendet: [`tag:${k.tag}`] };
  }
  if ('n' in k) {
    const a = ctx.ampel?.(k.n);
    const verwendet = [`paragraf:${k.n}`];
    if (!a || a.ampel === 'gelb') return { w: 'offen', offen: [`paragraf:${k.n}`], unsicher: [], widerspruch: [], verwendet };
    return { w: aus(k.ampel.includes(a.ampel)), offen: [], unsicher: a.unsicher ? [`paragraf:${k.n}`] : [], widerspruch: [], verwendet };
  }
  throw new Error(`Unbekannte Bedingung: ${JSON.stringify(k)}`);
}

/**
 * Die Blätter, die ein Ergebnis tragen: bei „und“ = nein das erste Nein, bei „oder“ = ja das erste Ja, sonst alle
 * Teile. Für Begründungen in Worten („Gilt nicht – Art des Vorhabens: „Beseitigung““) statt der ganzen Bedingung.
 */
export function tragendeBlaetter(k: Kurz | undefined, ctx: KurzKontext, w: Wahrheit, tiefe = 0): Kurz[] {
  if (!k || tiefe > 20 || 'immer' in k || 'nie' in k) return [];
  if ('und' in k || 'oder' in k) {
    const teile = 'und' in k ? k.und : k.oder;
    const entscheidet: Wahrheit = 'und' in k ? 'nein' : 'ja';
    if (w === entscheidet) {
      // derselbe Teil wie in werten: der sicherste der entscheidenden (sonst nennte die Begründung einen bloßen Hinweis)
      const kandidaten = teile.map((x) => ({ x, b: werten(x, ctx, tiefe + 1) })).filter((c) => c.b.w === w);
      if (!kandidaten.length) return [];
      const gewicht = (b: Bewertung) => b.unsicher.length + b.widerspruch.length;
      const t = kandidaten.reduce((a, c) => (gewicht(c.b) < gewicht(a.b) ? c : a)).x;
      return tragendeBlaetter(t, ctx, w, tiefe + 1);
    }
    return teile.flatMap((x) => tragendeBlaetter(x, ctx, w, tiefe + 1));
  }
  if ('nicht' in k && !('m' in k)) return tragendeBlaetter(k.nicht, ctx, w === 'ja' ? 'nein' : w === 'nein' ? 'ja' : 'offen', tiefe + 1);
  if ('$' in k) return ctx.bausteine[k.$] ? tragendeBlaetter(ctx.bausteine[k.$], ctx, w, tiefe + 1) : [];
  return werten(k, ctx, tiefe).w === w ? [k] : [];
}

/** ein Blatt als tatsächliche Angabe („Art des Vorhabens: „Beseitigung““, „Nutzfläche: 40 m²“) */
export function istText(k: Kurz, ctx: KurzKontext, t: TextKontext): string {
  if ('m' in k) return `${MERKMAL_TITEL[k.m] ?? k.m}: „${ctx.merkmale[k.m] ?? '–'}“`;
  if ('f' in k) {
    const def = t.fakt(k.f);
    const v = ctx.fakten[k.f]?.wert;
    const name = faktName(def, k.f);
    if (v === null || v === undefined || v === '') return `${name}: nicht angegeben`;
    if (typeof v === 'boolean') return `${name}: ${v ? 'ja' : 'nein'}`;
    if (typeof v === 'number') return `${name}: ${wertText(v, def)}`;
    return `${name}: „${v}“`;
  }
  if ('tag' in k) return `${k.tag === 'einreichung' ? 'Einreichung' : 'heute'} ${datum(k.tag === 'einreichung' ? ctx.einreichung : ctx.heute)}`;
  if ('n' in k) {
    const a = ctx.ampel?.(k.n)?.ampel;
    return `${t.paragraf?.(k.n) ?? k.n}: ${a === 'rot' ? 'gilt' : a === 'gruen' ? 'entfällt' : 'offen'}`;
  }
  return kurzText(k, t);
}

/** tragende Angaben eines Ergebnisses in Worten, ohne Doppelungen */
export function warumText(k: Kurz | undefined, ctx: KurzKontext, t: TextKontext, w: Wahrheit): string {
  return [...new Set(tragendeBlaetter(k, ctx, w).map((b) => istText(b, ctx, t)))].join(' · ');
}

/* ---------- in Worten ---------- */

export interface TextKontext {
  fakt: (id: string) => FaktDef | undefined;
  bausteine: Record<string, Kurz>;
  /** Titel eines Paragrafen (für Verweise) */
  paragraf?: (id: string) => string | undefined;
}

const liste = (w: (string | number)[], wort = 'oder') => (w.length <= 1 ? String(w[0] ?? '–') : `${w.slice(0, -1).join(', ')} ${wort} ${w[w.length - 1]}`);
const datum = (iso: string) => iso.split('-').reverse().join('.');
const zahl = (n: number) => n.toLocaleString('de-DE');

/** „x,01“ (Untergrenze im Schema) meint „über x“: gibt x zurück, sonst undefined */
export function ueberBasis(min: number): number | undefined {
  return !Number.isInteger(min) && Math.abs(min * 100 - Math.round(min) * 100 - 1) < 1e-6 ? Math.round(min) : undefined;
}

/** Text-Wert in Worten: Gemeindeschlüssel als Gemeindename (beim aktuellen Wert mit Schlüssel: „Soest, Schlüssel …“) */
function textWert(id: string | undefined, v: string, mitSchluessel = false): string {
  const name = id === 'lage.ags' ? gemeindeName(v) : undefined;
  return name ? (mitSchluessel ? `${name}, Schlüssel ${v}` : name) : v;
}

function wertText(v: string | number | boolean, def?: FaktDef, id?: string): string {
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  // wie in den Eingabefeldern: Werte mit Einheit und Nachkommastellen mit zwei Stellen („2,90 m“)
  if (typeof v === 'number') return `${def?.einheit && !zaehlEinheit(def.einheit) && !Number.isInteger(v) ? v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : zahl(v)}${def?.einheit ? ` ${einheitZu(v, def.einheit)}` : ''}`;
  return textWert(id, v, true);
}

/**
 * Schwellen eines Zahlen-Fakts in Worten, wie im Gesetz: „mindestens 22,01 m“ → „über 22 m“, ganzzahlige Anzahlen
 * „mindestens 4“ → „mehr als 3“, „mindestens 1“ bzw. „0,01“ → „vorhanden“, „höchstens 0“ → „keine“. Die Einheit
 * entfällt, wenn der Name sie schon nennt („Kfz-Stellplätze … mehr als 10“), und steht bei 1 in der Einzahl.
 */
function schwelle(name: string, def: FaktDef | undefined, min: number | undefined, max: number | undefined, verneint = false): string | undefined {
  const einheit = def?.einheit;
  const zaehlt = zaehlEinheit(einheit);
  const imNamen = !!einheit && zaehlt && name.toLowerCase().includes(einheit.toLowerCase());
  const mit = (n: number) => `${zahl(n)}${einheit && !imNamen ? ` ${einheitZu(n, einheit)}` : ''}`;
  // „22,01“ → „über 22“ (bei ganzen Zahlen nie: dort zählt „mehr als“)
  const ueber = (x: number) => ueberBasis(x) !== undefined;
  const ganz = (x: number) => zaehlt && Number.isInteger(x);
  const vorhanden = (x: number) => (x > 0 && x <= 0.01) || (ganz(x) && x === 1);
  // untere Schwelle: x gehört dazu („mindestens“); „über n“ bzw. „mehr als n“, wo das Gesetz so zählt
  const ab = (x: number) => (ueber(x) ? `über ${mit(Math.round(x))}` : ganz(x) && x > 1 ? `mehr als ${mit(x - 1)}` : `mindestens ${mit(x)}`);
  const unter = (x: number) => (ueber(x) ? `höchstens ${mit(Math.round(x))}` : ganz(x) ? `höchstens ${mit(x - 1)}` : `unter ${mit(x)}`);
  const ueberMax = (x: number) => (ganz(x) ? `mehr als ${mit(x)}` : `über ${mit(x)}`);
  if (!verneint) {
    if (min !== undefined && max !== undefined) {
      if (min === max) return `${name}: genau ${mit(min)}`;
      if (vorhanden(min)) return `${name}: vorhanden, höchstens ${mit(max)}`;
      return `${name}: ${ueber(min) ? `über ${zahl(Math.round(min))}` : zahl(min)} bis ${mit(max)}`;
    }
    if (min !== undefined) return vorhanden(min) ? `${name}: vorhanden` : `${name}: ${ab(min)}`;
    if (max !== undefined) return max === 0 ? `${name}: keine` : `${name}: höchstens ${mit(max)}`;
    return undefined;
  }
  if (min !== undefined && max !== undefined) return vorhanden(min) ? `${name}: keine oder ${ueberMax(max)}` : `${name}: ${unter(min)} oder ${ueberMax(max)}`;
  if (min !== undefined) return vorhanden(min) ? `${name}: keine` : `${name}: ${unter(min)}`;
  if (max !== undefined) return max === 0 ? `${name}: vorhanden` : `${name}: ${ueberMax(max)}`;
  return undefined;
}

/** Baustein-Verweise bis zur eigentlichen Bedingung auflösen (für die Verneinung) */
function aufloesen(k: Kurz, t: TextKontext): Kurz {
  let x = k;
  for (let i = 0; i < 10 && '$' in x && t.bausteine[x.$]; i++) x = t.bausteine[x.$];
  return x;
}

/** „nicht X“ positiv umformen, wo es gleichwertig geht (auch dreiwertig: offen bleibt offen) */
function nichtUmgeformt(n: Kurz, t: TextKontext): Kurz | undefined {
  if ('f' in n && typeof n.ist === 'boolean' && t.fakt(n.f)?.typ === 'janein') return { ...n, ist: !n.ist };
  if ('m' in n && n.in) return { m: n.m, nicht: n.in };
  if ('m' in n && n.nicht) return { m: n.m, in: n.nicht };
  if ('nicht' in n && !('m' in n)) return aufloesen(n.nicht, t);
  // De Morgan (gilt auch dreiwertig): „nicht (A oder B)“ = „nicht A und nicht B“, „nicht (A und B)“ = „nicht A oder
  // nicht B“ – die Teile werden ihrerseits positiv formuliert, gleiche Merkmale zusammengefasst
  if ('und' in n || 'oder' in n) {
    const teile = ('und' in n ? n.und : n.oder).map((x) => {
      const a = aufloesen(x, t);
      return nichtUmgeformt(a, t) ?? { nicht: a };
    });
    if ('und' in n) return { oder: teile };
    const und: Kurz[] = [];
    for (const x of teile) {
      const vorher = 'm' in x && x.nicht ? und.find((y): y is { m: string; nicht: string[] } => 'm' in y && y.m === x.m && !!y.nicht) : undefined;
      if (vorher && 'm' in x && x.nicht) vorher.nicht = [...new Set([...vorher.nicht, ...x.nicht])];
      else und.push('m' in x && x.nicht ? { m: x.m, nicht: [...x.nicht] } : x);
    }
    return { und };
  }
  return undefined;
}

/** Bedingung in Worten, z. B. „Art des Vorhabens: Errichtung und Gebäudeklasse 3, 4 oder 5“ */
/** Werte in Anführungszeichen („kein Gebäude“) – damit sie sich vom Satz abheben */
const zitiert = (w: (string | number)[], wort = 'oder') => liste(w.map((x) => `„${x}“`), wort);

/** verschachtelte gleichartige Verknüpfungen (auch über Bausteine) einebnen: (A oder (B oder C)) → A oder B oder C */
function einebnen(art: 'und' | 'oder', teile: Kurz[], t: TextKontext, tiefe = 0): Kurz[] {
  return teile.flatMap((k) => {
    const b = '$' in k ? t.bausteine[k.$] : k;
    if (tiefe < 10 && b && art in b) return einebnen(art, (b as Record<'und' | 'oder', Kurz[]>)[art], t, tiefe + 1);
    return [k];
  });
}

/** gleichartige Merkmal-Bedingungen in einem „oder“ zusammenfassen: (Vorhaben: A oder Vorhaben: B) → Vorhaben: A oder B */
function zusammenfassen(teile: Kurz[]): Kurz[] {
  const out: Kurz[] = [];
  for (const k of teile) {
    const vorher = 'm' in k && k.in ? out.find((x): x is { m: string; in: string[] } => 'm' in x && x.m === k.m && !!x.in && !x.nicht) : undefined;
    if (vorher && 'm' in k && k.in) vorher.in = [...new Set([...vorher.in, ...k.in])];
    else out.push('m' in k && k.in ? { ...k, in: [...k.in] } : k);
  }
  return out;
}

export function kurzText(k: Kurz | undefined, t: TextKontext, oben = true, tiefe = 0): string {
  if (!k || tiefe > 20) return '';
  if ('immer' in k) return 'immer';
  if ('nie' in k) return 'nie';
  if ('und' in k || 'oder' in k) {
    const roh = 'und' in k ? einebnen('und', k.und, t) : zusammenfassen(einebnen('oder', k.oder, t));
    const teile = roh.map((x) => kurzText(x, t, false, tiefe + 1)).filter(Boolean);
    if (teile.length === 1) return teile[0];
    const s = teile.join('und' in k ? ' und ' : ' oder ');
    return !oben ? `(${s})` : s;
  }
  if ('nicht' in k && !('m' in k)) {
    const n = aufloesen(k.nicht, t);
    const um = nichtUmgeformt(n, t);
    if (um) return kurzText(um, t, oben, tiefe + 1);
    return verneint(n, t) ?? `nicht (${kurzText(n, t, true, tiefe + 1)})`;
  }
  if ('$' in k) return t.bausteine[k.$] ? kurzText(t.bausteine[k.$], t, oben, tiefe + 1) : k.$;
  if ('m' in k) {
    const name = MERKMAL_TITEL[k.m] ?? k.m;
    if (k.in) return `${name}: ${zitiert(k.in)}`;
    // „alles außer „kein Gebäude““ ist eine doppelte Verneinung – positiv: „ein Gebäude“
    if (k.nicht?.length === 1 && k.nicht[0] === 'kein Gebäude') return `${name}: ein Gebäude`;
    if (k.nicht) return `${name}: alles außer ${zitiert(k.nicht, 'und')}`;
    return `${name}: festgelegt`;
  }
  if ('f' in k) {
    const def = t.fakt(k.f);
    const name = faktName(def, k.f);
    if (k.bekannt !== undefined) return k.bekannt ? `${name}: bekannt` : `${name}: unbekannt`;
    if (def?.typ === 'janein' && typeof k.ist === 'boolean') return `${name}: ${k.ist ? 'ja' : 'nein'}`;
    if (k.ist !== undefined) return `${name}: ${typeof k.ist === 'string' ? `„${textWert(k.f, k.ist)}“` : wertText(k.ist, def)}`;
    if (k.in) return `${name}: ${zitiert(k.in.map((v) => (typeof v === 'string' ? textWert(k.f, v) : v)))}`;
    return schwelle(name, def, k.min, k.max) ?? `${name}: angegeben`;
  }
  if ('tag' in k) {
    const was = k.tag === 'einreichung' ? 'Einreichung' : 'heute';
    if (k.ab && k.vor) return `${was} zwischen ${datum(k.ab)} und ${datum(k.vor)}`;
    return k.ab ? `${was} ab ${datum(k.ab)}` : `${was} vor ${datum(k.vor!)}`;
  }
  if ('n' in k) {
    const titel = t.paragraf?.(k.n) ?? k.n;
    const ampel = k.ampel.map((a) => (a === 'rot' ? 'gilt' : a === 'gruen' ? 'entfällt' : 'offen'));
    return `${titel} ${liste(ampel)}`;
  }
  return '';
}

/** Knoten der Regel als Baum: Blatt in Worten oder „alle“/„eines“/„keines“ mit Unterpunkten; mit Kontext ausgewertet */
export interface KurzKnoten {
  text: string;
  kinder?: KurzKnoten[];
  /** ausgewertet: trifft zu, trifft nicht zu, offen */
  w?: Wahrheit;
  /** der aktuelle Wert eines Blatts („Innenbereich“, „ja“, „nicht angegeben“) */
  ist?: string;
  /** der Wert ist nur Hinweis bzw. widersprüchlich – das ✓/✗ trägt dann nichts aus */
  unsicher?: boolean;
  /** Art einer Gruppe (intern, für die Verneinung) */
  art?: 'und' | 'oder';
}

/** verneintes Blatt in Worten, positiv formuliert; undefined, wenn es keine natürliche Form gibt */
function verneint(k: Kurz, t: TextKontext): string | undefined {
  if ('f' in k) {
    const def = t.fakt(k.f);
    const name = faktName(def, k.f);
    if (k.bekannt !== undefined) return k.bekannt ? `${name}: unbekannt` : `${name}: bekannt`;
    // ohne „ist nicht“ (Numerus: „Nachbarrechtliche Fragen ist …“) und ohne „weder“ bei nur einem Wert
    if (typeof k.ist === 'string') return `${name}: alles außer „${textWert(k.f, k.ist)}“`;
    if (typeof k.ist === 'number') return `${name}: nicht ${wertText(k.ist, def)}`;
    if (k.in) return `${name}: alles außer ${zitiert(k.in.map((v) => (typeof v === 'string' ? textWert(k.f, v) : v)), 'und')}`;
    // wie die Schwellen selbst: „nicht über 22 m“ → „höchstens 22 m“, „nicht vorhanden“ → „keine“
    return schwelle(name, def, k.min, k.max, true);
  }
  if ('n' in k) {
    const titel = t.paragraf?.(k.n) ?? k.n;
    const ampel = k.ampel.map((a) => (a === 'rot' ? 'gilt' : a === 'gruen' ? 'entfällt' : 'offen'));
    return `${titel} ${ampel.length === 1 ? `nicht „${ampel[0]}“` : `weder ${ampel.map((a) => `„${a}“`).join(' noch ')}`}`;
  }
  if ('tag' in k) {
    const was = k.tag === 'einreichung' ? 'Einreichung' : 'heute';
    if (k.ab && !k.vor) return `${was} vor ${datum(k.ab)}`;
    if (k.vor && !k.ab) return `${was} ab ${datum(k.vor)}`;
  }
  return undefined;
}

/** aktueller Wert eines Blatts in Worten */
function istWert(k: Kurz, t: TextKontext, ctx: KurzKontext): string | undefined {
  if ('m' in k) return ctx.merkmale[k.m] ?? 'nicht festgelegt';
  if ('f' in k) {
    const f = ctx.fakten[k.f];
    if (f?.wert == null) return 'nicht angegeben';
    return wertText(f.wert, t.fakt(k.f), k.f) + (f.sicherheit === 'hinweis' && !f.bestaetigt ? ', nur Hinweis' : '') + (f.widerspruch ? ', Widerspruch' : '');
  }
  if ('n' in k) {
    const a = ctx.ampel?.(k.n);
    return a ? (a.ampel === 'rot' ? 'gilt' : a.ampel === 'gruen' ? 'entfällt' : 'offen') : 'offen';
  }
  if ('tag' in k) return datum(k.tag === 'einreichung' ? ctx.einreichung : ctx.heute);
  return undefined;
}

/**
 * Regel als eingerückter Baum statt verschachtelter Klammern (für „Regel im Einzelnen“). Mit Kontext trägt jeder
 * Knoten seinen Stand (trifft zu / nicht / offen) und jedes Blatt den aktuellen Wert.
 */
export function kurzBaum(k: Kurz | undefined, t: TextKontext, ctx?: KurzKontext, tiefe = 0): KurzKnoten {
  if (!k || tiefe > 20) return { text: '' };
  let w: Wahrheit | undefined;
  // Stand beruht nur auf Hinweisen, Widersprüchen oder einer Festlegung (bei Verweisen): Zeichen in Klammern
  let knotenUnsicher = false;
  if (ctx) {
    try {
      const b = werten(k, ctx);
      w = b.w;
      knotenUnsicher = w !== 'offen' && b.unsicher.length + b.widerspruch.length > 0;
    } catch {
      w = 'offen';
    }
  }
  const mitW = (n: KurzKnoten): KurzKnoten => (w ? { ...n, w, ...(knotenUnsicher || n.unsicher ? { unsicher: true } : {}) } : n);
  if ('$' in k) return t.bausteine[k.$] ? kurzBaum(t.bausteine[k.$], t, ctx, tiefe + 1) : mitW({ text: k.$ });
  if ('und' in k || 'oder' in k) {
    const roh = 'und' in k ? einebnen('und', k.und, t) : zusammenfassen(einebnen('oder', k.oder, t));
    const kinder = roh.map((x) => kurzBaum(x, t, ctx, tiefe + 1)).filter((x) => x.text || x.kinder?.length);
    if (kinder.length === 1) return kinder[0];
    if (!kinder.length) return mitW({ text: 'und' in k ? 'immer' : 'nie' });
    return mitW({ text: 'und' in k ? 'alle folgenden:' : 'mindestens eines davon:', kinder, art: 'und' in k ? 'und' : 'oder' });
  }
  if ('nicht' in k && !('m' in k)) {
    // positiv formuliert, wo es geht: „nicht (Fakt: nein)“ → „Fakt: ja“, „nicht (Merkmal: A)“ → „Merkmal: alles außer A“
    // auch durch Bausteine hindurch („nicht Art des Vorhabens: „Beseitigung““ → „… alles außer „Beseitigung““)
    const n = aufloesen(k.nicht, t);
    const um = nichtUmgeformt(n, t);
    if (um) return kurzBaum(um, t, ctx, tiefe + 1);
    const innen = kurzBaum(n, t, ctx, tiefe + 1);
    // „nicht (A oder B)“ = keines davon; „nicht (A und B)“ = nicht alle davon
    if (innen.kinder) return mitW({ text: innen.art === 'oder' ? 'keines davon:' : 'nicht alle davon:', kinder: innen.kinder });
    // Blätter positiv: „Gebäudeart ist nicht „EFH““ statt „trifft nicht zu: …“ (das ist der Wortschatz der Zustände)
    return mitW({ text: verneint(n, t) ?? `nicht ${innen.text}`, ...(innen.ist ? { ist: innen.ist } : {}), ...(innen.unsicher ? { unsicher: true } : {}) });
  }
  const ist = ctx ? istWert(k, t, ctx) : undefined;
  const f = 'f' in k && ctx ? ctx.fakten[k.f] : undefined;
  const unsicher = !!f && f.wert != null && ((f.sicherheit === 'hinweis' && !f.bestaetigt) || !!f.widerspruch);
  return mitW({ text: kurzText(k, t, true, tiefe), ...(ist ? { ist } : {}), ...(unsicher ? { unsicher: true } : {}) });
}

/** fehlende Angabe in Worten – bei Fakten die Frage, wenn es eine gibt („Gilt eine Veränderungssperre?“) */
export function offenText(id: string, t: TextKontext): string {
  if (id.startsWith('merkmal:')) return MERKMAL_TITEL[id.slice(8)] ?? id.slice(8);
  if (id.startsWith('paragraf:')) return t.paragraf?.(id.slice(9)) ?? id.slice(9);
  return faktName(t.fakt(id), id);
}

