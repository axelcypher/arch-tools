/**
 * Formeln einer ganzen Excel-Mappe nachrechnen – auch über Blätter hinweg („'G 8'!E15“, „Übersicht!J3“) –, damit
 * nach dem Ändern einzelner Zellen die zwischengespeicherten Ergebnisse stimmen: in der Dateivorschau, in
 * Programmen ohne Neuberechnung und beim erneuten Einlesen in der App. Excel rechnet beim Öffnen ohnehin neu
 * (fullCalcOnLoad); was hier nicht berechnet werden kann (unbekannte Funktion), behält sein bisheriges Ergebnis.
 *
 * Unterstützt: Zahlen, Texte, WAHR/FALSCH, + − * / ^ & %, Vergleiche, Klammern, Zellbezüge und Bereiche (auch
 * ganze Spalten „F:F“) auf demselben oder einem anderen Blatt, SUM, MIN, MAX, AVERAGE, COUNT, COUNTA, ROUND,
 * ROUNDUP, ROUNDDOWN, ABS, IF, IFERROR, AND, OR, NOT, TODAY, NOW, CONCATENATE, SUMIF, INT, MOD.
 */

export type Wert = number | string | boolean | null;

export class RechenFehler extends Error {}

/* ---------- Bezüge ---------- */

export function spalteZahl(s: string): number {
  let n = 0;
  for (const c of s.toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64;
  return n;
}

export function spalteText(n: number): string {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

type Tok =
  | { t: 'zahl'; v: number }
  | { t: 'text'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'bezug'; blatt: string | null; a: string; b: string | null }
  | { t: 'fn'; v: string }
  | { t: 'op'; v: string }
  | { t: 'fehler'; v: string };

const ZELLE = /^\$?[A-Za-z]{1,3}\$?\d+/;
const SPALTE = /^\$?[A-Za-z]{1,3}(?=:)/;

/** Zerlegt eine Formel (ohne „=“) in Teile; Bezüge mit Blattnamen bleiben zusammen */
function zerlegen(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const rest = () => src.slice(i);
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length) {
        if (src[j] === '"' && src[j + 1] === '"') {
          s += '"';
          j += 2;
        } else if (src[j] === '"') break;
        else s += src[j++];
      }
      out.push({ t: 'text', v: s });
      i = j + 1;
      continue;
    }
    if (c === '#') {
      const m = /^#[A-Z/0!?]+[!?]?/i.exec(rest());
      out.push({ t: 'fehler', v: m ? m[0] : '#' });
      i += m ? m[0].length : 1;
      continue;
    }
    // Blattname: 'Name mit Leerzeichen'! oder Name!
    let blatt: string | null = null;
    if (c === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length) {
        if (src[j] === "'" && src[j + 1] === "'") {
          s += "'";
          j += 2;
        } else if (src[j] === "'") break;
        else s += src[j++];
      }
      if (src[j + 1] !== '!') throw new RechenFehler(`Unerwartet: ${src.slice(i)}`);
      blatt = s;
      i = j + 2;
    } else {
      const m = /^([^\s!"'(),:;+\-*/^&=<>%{}]+)!/.exec(rest());
      if (m) {
        blatt = m[1];
        i += m[0].length;
      }
    }
    const r = rest();
    const zelle = ZELLE.exec(r);
    const spalte = !zelle || /^\$?[A-Za-z]{1,3}:/.test(r) ? SPALTE.exec(r) : null;
    if (spalte && !zelle) {
      // ganze Spalte „F:F“
      const m = /^(\$?[A-Za-z]{1,3}):(\$?[A-Za-z]{1,3})(?![\d(])/.exec(r);
      if (m) {
        out.push({ t: 'bezug', blatt, a: m[1], b: m[2] });
        i += m[0].length;
        continue;
      }
    }
    if (zelle && !/^[A-Za-z]{1,3}\d+\s*\(/.test(r)) {
      let a = zelle[0];
      let b: string | null = null;
      i += a.length;
      const weiter = /^:(\$?[A-Za-z]{1,3}\$?\d+)/.exec(rest());
      if (weiter) {
        b = weiter[1];
        i += weiter[0].length;
      }
      a = a.toUpperCase();
      out.push({ t: 'bezug', blatt, a, b: b && b.toUpperCase() });
      continue;
    }
    if (blatt !== null) throw new RechenFehler(`Bezug erwartet nach ${blatt}!`);
    if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(r);
      if (!m) throw new RechenFehler(`Zahl erwartet: ${r}`);
      out.push({ t: 'zahl', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    const fn = /^([A-Za-z_][A-Za-z0-9_.]*)\s*\(/.exec(r);
    if (fn) {
      out.push({ t: 'fn', v: fn[1].toUpperCase().replace(/^_XLFN\./, '') });
      i += fn[0].length;
      continue;
    }
    const wahr = /^(TRUE|FALSE)\b/i.exec(r);
    if (wahr) {
      out.push({ t: 'bool', v: wahr[1].toUpperCase() === 'TRUE' });
      i += wahr[0].length;
      continue;
    }
    const op = /^(<>|<=|>=|[-+*/^&=<>%(),;])/.exec(r);
    if (op) {
      out.push({ t: 'op', v: op[1] === ';' ? ',' : op[1] });
      i += op[1].length;
      continue;
    }
    throw new RechenFehler(`Unbekannt: ${r}`);
  }
  return out;
}

/* ---------- Geteilte Formeln verschieben ---------- */

/** Bezug ohne „$“ um dz Zeilen und ds Spalten verschieben */
function verschiebeZelle(ref: string, dz: number, ds: number): string {
  const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(ref);
  if (!m) return ref;
  const sp = m[1] ? m[2] : spalteText(Math.max(1, spalteZahl(m[2]) + ds));
  const ze = m[3] ? m[4] : String(Math.max(1, Number(m[4]) + dz));
  return `${m[1]}${sp}${m[3]}${ze}`;
}

/**
 * Formel einer geteilten Formel (shared formula) für eine andere Zelle: relative Bezüge wandern um den Abstand
 * zur Ausgangszelle mit, Texte in Anführungszeichen und Blattnamen bleiben, wie sie sind.
 */
export function formelVerschieben(formel: string, dz: number, ds: number): string {
  if (!dz && !ds) return formel;
  let out = '';
  let i = 0;
  while (i < formel.length) {
    const c = formel[i];
    if (c === '"' || c === "'") {
      const j = formel.indexOf(c, i + 1);
      const e = j < 0 ? formel.length : j + 1;
      out += formel.slice(i, e);
      i = e;
      continue;
    }
    const vorher = i > 0 ? formel[i - 1] : '';
    if (/[A-Za-z$]/.test(c) && !/[A-Za-z0-9_.]/.test(vorher)) {
      const m = /^\$?[A-Za-z]{1,3}\$?\d+(?![\w(!])/.exec(formel.slice(i));
      if (m) {
        out += verschiebeZelle(m[0], dz, ds);
        i += m[0].length;
        continue;
      }
      const w = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(formel.slice(i));
      if (w) {
        out += w[0];
        i += w[0].length;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/* ---------- Ausdrücke ---------- */

type Knoten =
  | { k: 'wert'; v: Wert }
  | { k: 'bezug'; blatt: string | null; a: string; b: string | null }
  | { k: 'fn'; name: string; args: Knoten[] }
  | { k: 'un'; op: string; x: Knoten }
  | { k: 'bin'; op: string; l: Knoten; r: Knoten }
  | { k: 'prozent'; x: Knoten };

const RANG: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };

function parsen(toks: Tok[]): Knoten {
  let p = 0;
  const ist = (v: string) => toks[p]?.t === 'op' && (toks[p] as { v: string }).v === v;
  const primaer = (): Knoten => {
    const t = toks[p++];
    if (!t) throw new RechenFehler('Formel unvollständig');
    if (t.t === 'zahl' || t.t === 'text' || t.t === 'bool') return { k: 'wert', v: t.v };
    if (t.t === 'fehler') throw new RechenFehler(t.v);
    if (t.t === 'bezug') return { k: 'bezug', blatt: t.blatt, a: t.a, b: t.b };
    if (t.t === 'fn') {
      const args: Knoten[] = [];
      if (!ist(')')) {
        for (;;) {
          if (ist(',')) args.push({ k: 'wert', v: null });
          else args.push(ausdruck(0));
          if (ist(',')) {
            p++;
            continue;
          }
          break;
        }
      }
      if (!ist(')')) throw new RechenFehler(') fehlt');
      p++;
      return { k: 'fn', name: t.v, args };
    }
    if (t.t === 'op' && t.v === '(') {
      const x = ausdruck(0);
      if (!ist(')')) throw new RechenFehler(') fehlt');
      p++;
      return x;
    }
    if (t.t === 'op' && (t.v === '-' || t.v === '+')) return { k: 'un', op: t.v, x: ausdruck(5) };
    throw new RechenFehler('Unerwartetes Zeichen in der Formel');
  };
  const ausdruck = (min: number): Knoten => {
    let l = primaer();
    while (ist('%')) {
      p++;
      l = { k: 'prozent', x: l };
    }
    for (;;) {
      const t = toks[p];
      if (!t || t.t !== 'op' || !(t.v in RANG)) break;
      const r = RANG[t.v];
      if (r < min) break;
      p++;
      const rechts = ausdruck(t.v === '^' ? r : r + 1);
      l = { k: 'bin', op: t.v, l, r: rechts };
    }
    return l;
  };
  const x = ausdruck(0);
  if (p < toks.length) throw new RechenFehler('Formel nicht vollständig gelesen');
  return x;
}

/* ---------- Rechnen ---------- */

export interface ZellQuelle {
  /** Wert einer Zelle (berechnet, wenn sie eine Formel hat) */
  wert(blatt: string, zeile: number, spalte: number): Wert;
  /** belegte Zeilen einer Spalte (für „F:F“) */
  zeilenVon(blatt: string, spalte: number): number[];
  /** Blatt dieses Namens vorhanden? */
  hatBlatt(blatt: string): boolean;
  heute: Date;
}

type Ergebnis = Wert | Wert[];

const zahl = (v: Wert): number => {
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v.replace(',', '.'));
  if (Number.isFinite(n) && v.trim() !== '') return n;
  throw new RechenFehler('#WERT!');
};
const text = (v: Wert): string => (v === null ? '' : typeof v === 'boolean' ? (v ? 'WAHR' : 'FALSCH') : String(v));
const wahr = (v: Wert): boolean => (typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : typeof v === 'string' ? v.toUpperCase() === 'TRUE' : false);

function vergleiche(a: Wert, b: Wert): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if ((a === null || typeof a === 'number') && (b === null || typeof b === 'number')) return (a ?? 0) - (b ?? 0);
  return text(a).toLowerCase().localeCompare(text(b).toLowerCase());
}

function rund(x: number, stellen: number, art: 'rund' | 'auf' | 'ab'): number {
  const f = 10 ** stellen;
  const y = x * f;
  const r = art === 'rund' ? Math.sign(y) * Math.round(Math.abs(y) + 1e-9) : art === 'auf' ? Math.sign(y) * Math.ceil(Math.abs(y) - 1e-9) : Math.sign(y) * Math.floor(Math.abs(y) + 1e-9);
  return r / f;
}

/** Excel-Seriennummer des Tages (1900er System) */
export const excelDatum = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);

function bedingung(krit: Wert): (v: Wert) => boolean {
  const s = text(krit);
  const m = /^(<>|<=|>=|=|<|>)?(.*)$/.exec(s)!;
  const op = m[1] ?? '=';
  const sollText = m[2];
  const sollZahl = Number(sollText.replace(',', '.'));
  const istZahl = sollText.trim() !== '' && Number.isFinite(sollZahl);
  return (v) => {
    const d = istZahl && typeof v === 'number' ? v - sollZahl : text(v).toLowerCase().localeCompare(sollText.toLowerCase());
    return op === '=' ? d === 0 : op === '<>' ? d !== 0 : op === '<' ? d < 0 : op === '>' ? d > 0 : op === '<=' ? d <= 0 : d >= 0;
  };
}

function auswerten(n: Knoten, blatt: string, q: ZellQuelle): Ergebnis {
  switch (n.k) {
    case 'wert':
      return n.v;
    case 'bezug': {
      const b = n.blatt ?? blatt;
      if (!q.hatBlatt(b)) throw new RechenFehler('#BEZUG!');
      const a = n.a.replace(/\$/g, '');
      if (n.b === null) {
        const m = /^([A-Z]+)(\d+)$/.exec(a)!;
        return q.wert(b, Number(m[2]), spalteZahl(m[1]));
      }
      const e = n.b.replace(/\$/g, '');
      const ma = /^([A-Z]+)(\d+)?$/.exec(a.toUpperCase());
      const me = /^([A-Z]+)(\d+)?$/.exec(e.toUpperCase());
      if (!ma || !me) throw new RechenFehler('#BEZUG!');
      const s1 = spalteZahl(ma[1]);
      const s2 = spalteZahl(me[1]);
      const out: Wert[] = [];
      for (let s = Math.min(s1, s2); s <= Math.max(s1, s2); s++) {
        if (!ma[2] || !me[2]) {
          for (const z of q.zeilenVon(b, s)) out.push(q.wert(b, z, s));
        } else {
          const z1 = Number(ma[2]);
          const z2 = Number(me[2]);
          for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) out.push(q.wert(b, z, s));
        }
      }
      return out;
    }
    case 'un': {
      const x = einzeln(auswerten(n.x, blatt, q));
      return n.op === '-' ? -zahl(x) : zahl(x);
    }
    case 'prozent':
      return zahl(einzeln(auswerten(n.x, blatt, q))) / 100;
    case 'bin': {
      const l = einzeln(auswerten(n.l, blatt, q));
      const r = einzeln(auswerten(n.r, blatt, q));
      switch (n.op) {
        case '+':
          return zahl(l) + zahl(r);
        case '-':
          return zahl(l) - zahl(r);
        case '*':
          return zahl(l) * zahl(r);
        case '/': {
          const d = zahl(r);
          if (d === 0) throw new RechenFehler('#DIV/0!');
          return zahl(l) / d;
        }
        case '^':
          return zahl(l) ** zahl(r);
        case '&':
          return text(l) + text(r);
        case '=':
          return vergleiche(l, r) === 0;
        case '<>':
          return vergleiche(l, r) !== 0;
        case '<':
          return vergleiche(l, r) < 0;
        case '>':
          return vergleiche(l, r) > 0;
        case '<=':
          return vergleiche(l, r) <= 0;
        case '>=':
          return vergleiche(l, r) >= 0;
      }
      throw new RechenFehler(`Operator ${n.op}`);
    }
    case 'fn':
      return funktion(n.name, n.args, blatt, q);
  }
}

const einzeln = (e: Ergebnis): Wert => (Array.isArray(e) ? (e.length === 1 ? e[0] : (() => {
  throw new RechenFehler('#WERT!');
})()) : e);

/** Werte der Argumente, Bereiche flach; Texte und leere Zellen in Bereichen zählen nicht als Zahl */
function zahlenAus(args: Knoten[], blatt: string, q: ZellQuelle): number[] {
  const out: number[] = [];
  for (const a of args) {
    const e = auswerten(a, blatt, q);
    if (Array.isArray(e)) {
      for (const v of e) if (typeof v === 'number') out.push(v);
    } else if (e !== null) out.push(zahl(e));
  }
  return out;
}

function funktion(name: string, args: Knoten[], blatt: string, q: ZellQuelle): Ergebnis {
  const arg = (i: number) => (args[i] ? einzeln(auswerten(args[i], blatt, q)) : null);
  switch (name) {
    case 'SUM':
      return zahlenAus(args, blatt, q).reduce((s, x) => s + x, 0);
    case 'MIN': {
      const z = zahlenAus(args, blatt, q);
      return z.length ? Math.min(...z) : 0;
    }
    case 'MAX': {
      const z = zahlenAus(args, blatt, q);
      return z.length ? Math.max(...z) : 0;
    }
    case 'AVERAGE': {
      const z = zahlenAus(args, blatt, q);
      if (!z.length) throw new RechenFehler('#DIV/0!');
      return z.reduce((s, x) => s + x, 0) / z.length;
    }
    case 'COUNT':
      return zahlenAus(args, blatt, q).length;
    case 'COUNTA': {
      let n = 0;
      for (const a of args) {
        const e = auswerten(a, blatt, q);
        for (const v of Array.isArray(e) ? e : [e]) if (v !== null && v !== '') n++;
      }
      return n;
    }
    case 'ROUND':
      return rund(zahl(arg(0)), zahl(arg(1)), 'rund');
    case 'ROUNDUP':
      return rund(zahl(arg(0)), zahl(arg(1)), 'auf');
    case 'ROUNDDOWN':
      return rund(zahl(arg(0)), zahl(arg(1)), 'ab');
    case 'INT':
      return Math.floor(zahl(arg(0)));
    case 'MOD': {
      const d = zahl(arg(1));
      if (d === 0) throw new RechenFehler('#DIV/0!');
      const x = zahl(arg(0));
      return x - d * Math.floor(x / d);
    }
    case 'ABS':
      return Math.abs(zahl(arg(0)));
    case 'IF': {
      const b = wahr(arg(0));
      if (b) return args[1] ? einzeln(auswerten(args[1], blatt, q)) : true;
      return args[2] ? einzeln(auswerten(args[2], blatt, q)) : false;
    }
    case 'IFERROR':
      try {
        return einzeln(auswerten(args[0], blatt, q));
      } catch (e) {
        if (e instanceof RechenFehler && /^#/.test(e.message)) return arg(1);
        throw e;
      }
    case 'AND':
      return args.every((_, i) => wahr(arg(i)));
    case 'OR':
      return args.some((_, i) => wahr(arg(i)));
    case 'NOT':
      return !wahr(arg(0));
    case 'TODAY':
      return excelDatum(q.heute);
    case 'NOW': {
      const d = q.heute;
      return excelDatum(d) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
    }
    case 'CONCATENATE':
      return args.map((_, i) => text(arg(i))).join('');
    case 'SUMIF': {
      const bereich = auswerten(args[0], blatt, q);
      const krit = bedingung(arg(1));
      const summe = args[2] ? auswerten(args[2], blatt, q) : bereich;
      const b = Array.isArray(bereich) ? bereich : [bereich];
      const s = Array.isArray(summe) ? summe : [summe];
      let out = 0;
      b.forEach((v, i) => {
        if (krit(v) && typeof s[i] === 'number') out += s[i] as number;
      });
      return out;
    }
  }
  throw new RechenFehler(`Funktion ${name} wird nicht berechnet`);
}

/** Formel (ohne „=“) auf einem Blatt berechnen */
export function formelBerechnen(formel: string, blatt: string, q: ZellQuelle): Wert {
  return einzeln(auswerten(parsen(zerlegen(formel)), blatt, q));
}

/* ---------- ganze Mappe ---------- */

export interface RechenZelle {
  /** gespeicherter Wert (bei Formeln das zwischengespeicherte Ergebnis) */
  wert: Wert;
  /** wirksame Formel ohne „=“ (bei geteilten Formeln für diese Zelle verschoben) */
  formel: string | null;
}

/** Blatt → „Zeile:Spalte“ → Zelle */
export type RechenMappe = Map<string, Map<string, RechenZelle>>;

const schl = (z: number, s: number) => `${z}:${s}`;

/**
 * Alle Formeln der Mappe berechnen. Liefert die neuen Ergebnisse je Blatt und Zelle; Formeln, die sich nicht
 * berechnen lassen, fehlen im Ergebnis (ihr bisheriger Wert bleibt). Kreisbezüge brechen ab, ohne Ergebnis.
 */
export function mappeBerechnen(mappe: RechenMappe, heute = new Date()): Map<string, Map<string, Wert>> {
  const ergebnis = new Map<string, Map<string, Wert>>();
  const fehlgeschlagen = new Set<string>();
  const laeuft = new Set<string>();
  const blattNamen = new Map([...mappe.keys()].map((n) => [n.toLowerCase(), n]));
  const name = (b: string) => blattNamen.get(b.toLowerCase()) ?? b;
  const spaltenZeilen = new Map<string, number[]>();
  const q: ZellQuelle = {
    heute,
    hatBlatt: (b) => blattNamen.has(b.toLowerCase()),
    zeilenVon: (b, s) => {
      const k = `${name(b)}|${s}`;
      let z = spaltenZeilen.get(k);
      if (!z) {
        z = [];
        for (const key of mappe.get(name(b))?.keys() ?? []) {
          const [ze, sp] = key.split(':').map(Number);
          if (sp === s) z.push(ze);
        }
        z.sort((a, c) => a - c);
        spaltenZeilen.set(k, z);
      }
      return z;
    },
    wert: (b0, z, s) => {
      const b = name(b0);
      const zelle = mappe.get(b)?.get(schl(z, s));
      if (!zelle) return null;
      if (!zelle.formel) return zelle.wert;
      const k = `${b}|${z}:${s}`;
      const fertig = ergebnis.get(b)?.get(schl(z, s));
      if (fertig !== undefined) return fertig;
      if (fehlgeschlagen.has(k)) throw new RechenFehler('nicht berechenbar');
      if (laeuft.has(k)) throw new RechenFehler('Kreisbezug');
      laeuft.add(k);
      try {
        const v = formelBerechnen(zelle.formel, b, q);
        if (!ergebnis.has(b)) ergebnis.set(b, new Map());
        ergebnis.get(b)!.set(schl(z, s), v);
        return v;
      } catch (e) {
        fehlgeschlagen.add(k);
        throw e;
      } finally {
        laeuft.delete(k);
      }
    },
  };
  for (const [b, zellen] of mappe) {
    for (const [key, z] of zellen) {
      if (!z.formel) continue;
      const [ze, sp] = key.split(':').map(Number);
      try {
        q.wert(b, ze, sp);
      } catch {
        // bleibt beim bisherigen Ergebnis
      }
    }
  }
  return ergebnis;
}
