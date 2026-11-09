/**
 * Verlustfreies Lesen von Delphi-Formulardefinitionen im Textformat (DFM).
 *
 * Jede Eigenschaft behält ihre Originalzeilen. Beim Schreiben werden nur geänderte Eigenschaften neu erzeugt,
 * alles andere wird unverändert übernommen. Die Einrückung in FORMA-Dateien ist unregelmäßig, deshalb wird sie
 * nie neu berechnet.
 */

export type Wert =
  | { art: 'text'; text: string }
  /** Zahl im Originalwortlaut, z. B. `130`, `-13`, `1.5` oder `$00FF00` */
  | { art: 'zahl'; roh: string }
  | { art: 'name'; name: string }
  | { art: 'menge'; elemente: string[] }
  | { art: 'liste'; werte: Wert[] }
  /** Binärdaten (Bilder, Button-Grafiken) als Hex-Text ohne Leerraum */
  | { art: 'binaer'; hex: string }
  | { art: 'sammlung' };

export interface Eigenschaft {
  typ: 'eigenschaft';
  name: string;
  wert: Wert;
  /** Originalzeilen ohne Zeilenende */
  zeilen: string[];
}

export interface Objekt {
  typ: 'objekt';
  name: string;
  klasse: string;
  kopf: string;
  fuss: string;
  elemente: (Eigenschaft | Objekt)[];
}

export class FormatFehler extends Error {
  constructor(
    readonly offset: number,
    meldung: string,
  ) {
    super(`Unbekanntes Dateiformat bei Byte ${offset}: ${meldung}`);
  }
}

/* ---------- Zugriff ---------- */

export const eigenschaften = (o: Objekt) => o.elemente.filter((e): e is Eigenschaft => e.typ === 'eigenschaft');
export const kinder = (o: Objekt) => o.elemente.filter((e): e is Objekt => e.typ === 'objekt');
export const eigenschaft = (o: Objekt, name: string) => eigenschaften(o).find((e) => e.name === name);

/** Sucht eine Komponente in diesem Objekt und allen Unterobjekten */
export function finde(o: Objekt, name: string): Objekt | undefined {
  if (o.name === name) return o;
  for (const k of kinder(o)) {
    const f = finde(k, name);
    if (f) return f;
  }
  return undefined;
}

/** Alle Unterobjekte in Dateireihenfolge (Tiefensuche, ohne `o`) */
export function nachfahren(o: Objekt): Objekt[] {
  return kinder(o).flatMap((k) => [k, ...nachfahren(k)]);
}

export const einrueckung = (e: Eigenschaft) => /^\s*/.exec(e.zeilen[0])![0];

/** Einrückung, mit der neue Eigenschaften dieses Objekts geschrieben werden */
export function eigenschaftsEinrueckung(o: Objekt): string {
  const erste = eigenschaften(o)[0];
  return erste ? einrueckung(erste) : `${/^\s*/.exec(o.kopf)![0]}  `;
}

/** Wert als Text, als Name (`True`, `clBlack`) oder als Zahl – `undefined` bei anderem Typ */
export function text(o: Objekt, name: string): string | undefined {
  const w = eigenschaft(o, name)?.wert;
  return w?.art === 'text' ? w.text : undefined;
}
export function bezeichner(o: Objekt, name: string): string | undefined {
  const w = eigenschaft(o, name)?.wert;
  return w?.art === 'name' ? w.name : undefined;
}
export function zahl(o: Objekt, name: string): number | undefined {
  const w = eigenschaft(o, name)?.wert;
  if (w?.art !== 'zahl') return undefined;
  const n = Number(w.roh.startsWith('$') ? `0x${w.roh.slice(1)}` : w.roh);
  return Number.isFinite(n) ? n : undefined;
}

/* ---------- Ändern ---------- */

export function entferneEigenschaft(o: Objekt, name: string): boolean {
  const vorher = o.elemente.length;
  o.elemente = o.elemente.filter((e) => !(e.typ === 'eigenschaft' && e.name === name));
  return o.elemente.length !== vorher;
}

/**
 * Ersetzt die Eigenschaft gleichen Namens oder fügt sie vor der ersten Eigenschaft ein, die Delphi danach
 * schreiben würde (`schreibtDanach` bekommt den Namen vor dem Punkt, aus `Font.Style` wird `Font`).
 */
export function setzeEigenschaft(o: Objekt, neu: Eigenschaft, schreibtDanach: (name: string) => boolean): void {
  const vorhanden = o.elemente.findIndex((e) => e.typ === 'eigenschaft' && e.name === neu.name);
  if (vorhanden >= 0) {
    o.elemente[vorhanden] = neu;
    return;
  }
  const pos = o.elemente.findIndex((e) => e.typ === 'objekt' || schreibtDanach(e.name.split('.')[0]));
  o.elemente.splice(pos < 0 ? o.elemente.length : pos, 0, neu);
}

/* ---------- Schreiben ---------- */

export function schreibeObjekt(o: Objekt, out: string[]): void {
  out.push(o.kopf, '\r\n');
  for (const e of o.elemente) {
    if (e.typ === 'objekt') schreibeObjekt(e, out);
    else for (const z of e.zeilen) out.push(z, '\r\n');
  }
  out.push(o.fuss, '\r\n');
}

/* ---------- Lesen ---------- */

/** Liest eine einzelne DFM-Definition, die mit CRLF enden muss */
export function parseDfm(quelle: string): Objekt {
  const p = new Leser(quelle, 0);
  const o = p.objekt();
  if (!p.amEnde()) p.fehler('Text nach dem Formularende');
  return o;
}

const OBJEKTKOPF = /^(object|inherited|inline) /;
const istNamensAnfang = (c: string) => /[A-Za-z_]/.test(c);
const istNamensZeichen = (c: string) => /[A-Za-z0-9_.]/.test(c);
const istZahlZeichen = (c: string) => /[A-Za-z0-9.+$-]/.test(c);
const istHex = (c: string) => /[0-9A-Fa-f]/.test(c);

/** keine einzelnen Surrogate (String.isWellFormed gibt es erst ab ES2024) */
function wohlgeformt(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xdc00 && c <= 0xdfff) return false;
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i++;
    }
  }
  return true;
}

/** Leser über reinem ASCII-Text; `pos` ist die aktuelle Position */
export class Leser {
  constructor(
    private readonly q: string,
    public pos: number,
  ) {
    for (let i = 0; i < q.length; i++) if (q.charCodeAt(i) > 0x7f) throw new FormatFehler(i, 'Nicht-ASCII-Zeichen');
  }

  fehler(meldung: string): never {
    throw new FormatFehler(this.pos, meldung);
  }

  bei(s: string): boolean {
    return this.q.startsWith(s, this.pos);
  }

  amEnde(): boolean {
    return this.pos === this.q.length;
  }

  erwarte(s: string): void {
    if (!this.bei(s)) this.fehler(`„${s}“ erwartet`);
    this.pos += s.length;
  }

  /** Liest bis vor `ende`, ohne `ende` zu verbrauchen */
  bis(ende: string): string {
    const i = this.q.indexOf(ende, this.pos);
    if (i < 0) this.fehler(`„${ende}“ fehlt`);
    const s = this.q.slice(this.pos, i);
    this.pos = i;
    return s;
  }

  private zeichen(): string {
    return this.q[this.pos] ?? '';
  }

  private solange(f: (c: string) => boolean): string {
    const start = this.pos;
    while (this.pos < this.q.length && f(this.q[this.pos])) this.pos++;
    return this.q.slice(start, this.pos);
  }

  private leerzeichen(): void {
    this.solange((c) => c === ' ' || c === '\t');
  }

  /** Überspringt Leerzeichen und Zeilenwechsel (nur CRLF) */
  private leerraum(): void {
    for (;;) {
      this.leerzeichen();
      if (!this.bei('\r\n')) return;
      this.pos += 2;
    }
  }

  private zeile(): string {
    const i = this.q.indexOf('\r\n', this.pos);
    if (i < 0) this.fehler('Zeilenende (CRLF) fehlt');
    return this.q.slice(this.pos, i);
  }

  private ganzeZeile(): string {
    const z = this.zeile();
    if (/[\r\n]/.test(z)) this.fehler('einzelnes CR oder LF');
    this.pos += z.length + 2;
    return z;
  }

  objekt(): Objekt {
    const kopf = this.ganzeZeile();
    const m = /^(?:object|inherited|inline) ([^:]*):\s*(\S+)/.exec(kopf.trim());
    if (!m) this.fehler('Objektkopf „object Name: Typ“ erwartet');
    const elemente: (Eigenschaft | Objekt)[] = [];
    for (;;) {
      const t = this.zeile().trim();
      if (t === 'end') {
        const fuss = this.ganzeZeile();
        return { typ: 'objekt', name: m[1].trim(), klasse: m[2], kopf, fuss, elemente };
      }
      elemente.push(OBJEKTKOPF.test(t) ? this.objekt() : this.eigenschaft());
    }
  }

  private eigenschaft(): Eigenschaft {
    const start = this.pos;
    this.leerzeichen();
    const name = this.solange(istNamensZeichen);
    if (!name) this.fehler('Eigenschaftsname erwartet');
    this.leerzeichen();
    this.erwarte('=');
    const wert = this.wert();
    this.leerzeichen();
    if (!this.bei('\r\n')) this.fehler('Zeilenende nach dem Wert erwartet');
    const zeilen = this.q.slice(start, this.pos).split('\r\n');
    this.pos += 2;
    return { typ: 'eigenschaft', name, wert, zeilen };
  }

  private wert(): Wert {
    this.leerraum();
    const c = this.zeichen();
    if (c === "'" || c === '#') return { art: 'text', text: this.zeichenkette() };
    if (c === '(') return this.liste();
    if (c === '[') return this.menge();
    if (c === '{') return this.binaer();
    if (c === '<') return this.sammlung();
    if (/[-+$0-9]/.test(c)) return { art: 'zahl', roh: this.solange(istZahlZeichen) };
    if (istNamensAnfang(c)) return { art: 'name', name: this.solange(istNamensZeichen) };
    this.fehler('Wert erwartet');
  }

  /** `'abc'#252'def' + 'ghi'`; Fortsetzungen nach `+` dürfen auf der nächsten Zeile stehen */
  private zeichenkette(): string {
    const einheiten: number[] = [];
    for (;;) {
      const teilAnfang = this.pos;
      for (;;) {
        const c = this.zeichen();
        if (c === "'") this.inHochkommas(einheiten);
        else if (c === '#') this.zeichencode(einheiten);
        else break;
      }
      if (this.pos === teilAnfang) this.fehler('Zeichenkette erwartet');
      const nachTeil = this.pos;
      this.leerzeichen();
      if (this.zeichen() === '+') {
        this.pos++;
        this.leerraum();
      } else {
        this.pos = nachTeil;
        break;
      }
    }
    let s = '';
    for (let i = 0; i < einheiten.length; i += 8192) s += String.fromCharCode(...einheiten.slice(i, i + 8192));
    if (!wohlgeformt(s)) this.fehler('ungültige UTF-16-Zeichenfolge');
    return s;
  }

  private inHochkommas(einheiten: number[]): void {
    this.pos++;
    for (;;) {
      const c = this.zeichen();
      if (c === '' || c === '\r' || c === '\n') this.fehler('Zeichenkette nicht abgeschlossen');
      if (c === "'") {
        if (this.q[this.pos + 1] === "'") {
          einheiten.push(0x27);
          this.pos += 2;
          continue;
        }
        this.pos++;
        return;
      }
      einheiten.push(c.charCodeAt(0));
      this.pos++;
    }
  }

  private zeichencode(einheiten: number[]): void {
    this.pos++;
    const ziffern = this.solange((c) => c >= '0' && c <= '9');
    const n = Number(ziffern);
    if (!ziffern || n > 0xffff) this.fehler('Zeichencode #nnn erwartet');
    einheiten.push(n);
  }

  private liste(): Wert {
    this.pos++;
    const werte: Wert[] = [];
    for (;;) {
      this.leerraum();
      if (this.zeichen() === ')') {
        this.pos++;
        return { art: 'liste', werte };
      }
      werte.push(this.wert());
    }
  }

  private menge(): Wert {
    this.pos++;
    const elemente: string[] = [];
    for (;;) {
      this.leerraum();
      const c = this.zeichen();
      if (c === ']') {
        this.pos++;
        return { art: 'menge', elemente };
      }
      if (c === ',') this.pos++;
      else if (istNamensAnfang(c)) elemente.push(this.solange(istNamensZeichen));
      else this.fehler('Mengenelement erwartet');
    }
  }

  private binaer(): Wert {
    this.pos++;
    const ende = this.q.indexOf('}', this.pos);
    if (ende < 0) this.fehler('„}“ fehlt');
    const roh = this.q.slice(this.pos, ende);
    // nur Hex-Ziffern, Leerzeichen und CRLF-Zeilenwechsel
    const hex = roh.replace(/[ \t]|\r\n/g, '');
    for (let i = 0; i < hex.length; i++) {
      if (!istHex(hex[i])) {
        this.pos += roh.indexOf(hex[i]);
        this.fehler('Hex-Ziffer erwartet');
      }
    }
    this.pos = ende + 1;
    return { art: 'binaer', hex };
  }

  /** `<item Name = Wert … end …>`; der Inhalt wird nur geprüft, nicht ausgewertet */
  private sammlung(): Wert {
    this.pos++;
    for (;;) {
      this.leerraum();
      if (this.zeichen() === '>') {
        this.pos++;
        return { art: 'sammlung' };
      }
      if (this.solange(istNamensZeichen) !== 'item') this.fehler('„item“ erwartet');
      for (;;) {
        this.leerraum();
        const name = this.solange(istNamensZeichen);
        if (name === 'end') break;
        if (!name) this.fehler('Eigenschaftsname erwartet');
        this.leerzeichen();
        this.erwarte('=');
        this.wert();
      }
    }
  }
}
