/**
 * Bedingungen in Kurzform auswerten (dreiwertig) und in Worten darstellen. Unbekanntes ist offen, nie „trifft nicht
 * zu“; „und“: ein Nein entscheidet, „oder“: ein Ja entscheidet, sonst offen, wenn etwas offen ist (wie R-01 in
 * Formulare).
 */

import { MERKMAL_TITEL } from './fakten';
import type { Ampel, FaktDef, FaktWert, Kurz, Wahrheit } from './typen';

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
    if (!teile.length) return leer();
    const entscheidet: Wahrheit = 'und' in k ? 'nein' : 'ja';
    const ws = teile.map((t) => t.w);
    // nur die Teile, die das Ergebnis tragen, zählen für offen/unsicher
    if (ws.includes(entscheidet)) return vereinen(entscheidet, teile.filter((t) => t.w === entscheidet));
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
      w = aus((k.min === undefined || n >= k.min) && (k.max === undefined || n <= k.max));
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

function wertText(v: string | number | boolean, def?: FaktDef): string {
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  if (typeof v === 'number') return `${zahl(v)}${def?.einheit ? ` ${def.einheit}` : ''}`;
  return v;
}

/** Bedingung in Worten, z. B. „Art des Vorhabens: Errichtung und Gebäudeklasse 3, 4 oder 5“ */
export function kurzText(k: Kurz | undefined, t: TextKontext, oben = true, tiefe = 0): string {
  if (!k || tiefe > 20) return '';
  if ('immer' in k) return 'immer';
  if ('nie' in k) return 'nie';
  if ('und' in k || 'oder' in k) {
    const teile = ('und' in k ? k.und : k.oder).map((x) => kurzText(x, t, false, tiefe + 1)).filter(Boolean);
    const s = teile.join('und' in k ? ' und ' : ' oder ');
    return !oben && teile.length > 1 ? `(${s})` : s;
  }
  if ('nicht' in k && !('m' in k)) return `nicht ${kurzText(k.nicht, t, false, tiefe + 1)}`;
  if ('$' in k) return t.bausteine[k.$] ? kurzText(t.bausteine[k.$], t, oben, tiefe + 1) : k.$;
  if ('m' in k) {
    const name = MERKMAL_TITEL[k.m] ?? k.m;
    if (k.in) return `${name}: ${liste(k.in)}`;
    if (k.nicht) return `${name} nicht ${liste(k.nicht)}`;
    return `${name} festgelegt`;
  }
  if ('f' in k) {
    const def = t.fakt(k.f);
    const name = def?.titel ?? k.f;
    if (k.bekannt !== undefined) return k.bekannt ? `${name} bekannt` : `${name} unbekannt`;
    if (def?.typ === 'janein' && typeof k.ist === 'boolean') return k.ist ? name : `nicht: ${name}`;
    if (k.ist !== undefined) return `${name}: ${wertText(k.ist, def)}`;
    if (k.in) return `${name}: ${liste(k.in)}`;
    if (k.min !== undefined && k.max !== undefined) return `${name} ${zahl(k.min)} bis ${zahl(k.max)}${def?.einheit ? ` ${def.einheit}` : ''}`;
    if (k.min !== undefined) return `${name} mindestens ${zahl(k.min)}${def?.einheit ? ` ${def.einheit}` : ''}`;
    if (k.max !== undefined) return `${name} höchstens ${zahl(k.max)}${def?.einheit ? ` ${def.einheit}` : ''}`;
    return `${name} angegeben`;
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

/** Kennung eines offenen Punkts in Worten (für Listen „fehlt: …“) */
export function offenText(id: string, t: TextKontext): string {
  if (id.startsWith('merkmal:')) return MERKMAL_TITEL[id.slice(8)] ?? id.slice(8);
  if (id.startsWith('paragraf:')) return t.paragraf?.(id.slice(9)) ?? id.slice(9);
  return t.fakt(id)?.titel ?? id;
}
