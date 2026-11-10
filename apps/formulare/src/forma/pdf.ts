/**
 * PDF aus einem FORMA-Formular – so, wie es die Formularansicht zeigt und der Druck ausgibt: Seiten als A4-Blätter
 * mit Rand, Rahmen, Linien, Beschriftungen, die Inhalte der Felder und Kästchen mit Kreuz, eingebettete Bilder.
 * Vektor-PDF mit echtem Text (durchsuchbar, kopierbar) in den PDF-Standardschriften: Helvetica hat die Breiten
 * von Arial, Courier die von Courier New, Times die von Times New Roman – die Zeilen brechen daher an denselben
 * Stellen um wie auf dem Bildschirm. Zeichen außerhalb von Windows-1252 werden zu „?“.
 *
 * Maße: Delphi rechnet in Bildschirmpixeln (96 dpi), die PDF in Punkt (72 dpi) – Faktor 0,75.
 */

import { unzlibSync, zlibSync } from 'fflate';
import type { Objekt } from './dfm';
import { bezeichner, eigenschaft, text, zahl } from './dfm';
import { bild, blatt, drehung, farbe, lage, seitenMasse } from './darstellung';
import type { Feld, Kasten } from './felder';
import { kaesten, ohneKuerzel } from './felder';
import type { Formular } from './formular';
import { BREITEN } from './schriftbreiten';

/** Pixel → Punkt */
const PT = 0.75;

type Familie = 'Helvetica' | 'Courier' | 'Times';

interface Schrift {
  familie: Familie;
  fett: boolean;
  kursiv: boolean;
  unterstrichen: boolean;
  durchgestrichen: boolean;
  /** Größe in Pixeln */
  groesse: number;
  farbe: [number, number, number];
}

/** Name der Standardschrift im PDF */
function pdfSchrift(s: Pick<Schrift, 'familie' | 'fett' | 'kursiv'>): string {
  if (s.familie === 'Times') return s.fett && s.kursiv ? 'Times-BoldItalic' : s.fett ? 'Times-Bold' : s.kursiv ? 'Times-Italic' : 'Times-Roman';
  const zusatz = s.fett && s.kursiv ? '-BoldOblique' : s.fett ? '-Bold' : s.kursiv ? '-Oblique' : '';
  return s.familie + zusatz;
}

/** Abstand der Grundlinie vom oberen Rand einer Zeile mit Zeilenhöhe 1,15 (nach den Maßen der Windows-Schriften) */
const GRUNDLINIE: Record<Familie, number> = { Helvetica: 0.9215, Courier: 0.841, Times: 0.9125 };
const ZEILE = 1.15;

/** Windows-1252 für die PDF (WinAnsiEncoding); Unbekanntes wird zu „?“ */
const SONDER: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};
export function winAnsi(s: string): number[] {
  return [...s].map((c) => {
    if (SONDER[c] !== undefined) return SONDER[c];
    const k = c.charCodeAt(0);
    if (c === '\t') return 0x20;
    return k >= 0x20 && k < 0x100 && !(k >= 0x7f && k < 0xa0) ? k : 0x3f;
  });
}

/** Breite eines Textes in Pixeln */
export function textBreite(s: string, schrift: Pick<Schrift, 'familie' | 'fett' | 'kursiv' | 'groesse'>): number {
  const tabelle = schrift.familie === 'Courier' ? null : BREITEN[pdfSchrift(schrift)];
  let summe = 0;
  for (const c of winAnsi(s)) summe += tabelle ? (tabelle[c - 32] ?? 0) : 600;
  return (summe / 1000) * schrift.groesse;
}

/** Zeilen umbrechen wie der Browser: an Leerzeichen, zu lange Wörter an beliebiger Stelle */
export function umbrechen(s: string, breite: number, schrift: Pick<Schrift, 'familie' | 'fett' | 'kursiv' | 'groesse'>): string[] {
  const out: string[] = [];
  for (const absatz of s.split(/\r\n|\r|\n/)) {
    if (!absatz) {
      out.push('');
      continue;
    }
    let zeile = '';
    for (const wort of absatz.split(/(?<= )/)) {
      const versuch = zeile + wort;
      if (!zeile || textBreite(versuch.trimEnd(), schrift) <= breite + 0.01) {
        zeile = versuch;
        // ein einzelnes Wort, das nicht in die Zeile passt: zeichenweise teilen
        while (textBreite(zeile.trimEnd(), schrift) > breite + 0.01 && zeile.trimEnd().length > 1) {
          let n = zeile.length - 1;
          while (n > 1 && textBreite(zeile.slice(0, n), schrift) > breite + 0.01) n--;
          out.push(zeile.slice(0, n));
          zeile = zeile.slice(n);
        }
      } else {
        out.push(zeile.trimEnd());
        zeile = wort;
      }
    }
    out.push(zeile.trimEnd());
  }
  return out;
}

const rgb = (hex: string | undefined, vorgabe: [number, number, number]): [number, number, number] => {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return vorgabe;
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
};

/** Schrift eines Elements – wie in der Formularansicht: eigene Angaben, sonst Arial 13 px */
function schriftVon(o: Objekt): Schrift {
  const hoehe = zahl(o, 'Font.Height');
  const stil = eigenschaft(o, 'Font.Style')?.wert;
  const stile = stil?.art === 'menge' ? stil.elemente : [];
  const name = (text(o, 'Font.Name') ?? 'Arial').toLowerCase();
  const familie: Familie = /courier|consol|lucida console|mono/.test(name) ? 'Courier' : /times|roman|georgia|garamond|book antiqua|serif/.test(name) && !/sans/.test(name) ? 'Times' : 'Helvetica';
  return {
    familie,
    fett: stile.includes('fsBold'),
    kursiv: stile.includes('fsItalic'),
    unterstrichen: stile.includes('fsUnderline'),
    durchgestrichen: stile.includes('fsStrikeOut'),
    groesse: hoehe ? Math.abs(hoehe) : 13,
    farbe: rgb(farbe(o, 'Font.Color'), [0, 0, 0]),
  };
}

const zahlText = (v: number) => (Math.abs(v) < 1e-6 ? '0' : v.toFixed(3).replace(/\.?0+$/, ''));

function pdfString(bytes: number[]): string {
  let s = '(';
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) s += `\\${b.toString(8).padStart(3, '0')}`;
    else s += String.fromCharCode(b);
  }
  return `${s})`;
}

/* ---------- Bilder ---------- */

interface PdfBild {
  breite: number;
  hoehe: number;
  /** Farbraum und Filter samt Daten */
  art: 'jpeg' | 'rgb' | 'grau';
  daten: Uint8Array;
  komponenten?: number;
}

/** Windows-Bitmap (unkomprimiert, 1/4/8/16/24/32 Bit) → RGB */
export function bmpLesen(b: Uint8Array): PdfBild | null {
  if (b.length < 54 || b[0] !== 0x42 || b[1] !== 0x4d) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const anfang = v.getUint32(10, true);
  const kopf = v.getUint32(14, true);
  const breite = v.getInt32(18, true);
  const hoeheRoh = v.getInt32(22, true);
  const bits = v.getUint16(28, true);
  const kompression = kopf >= 40 ? v.getUint32(30, true) : 0;
  if (breite <= 0 || hoeheRoh === 0 || ![1, 4, 8, 16, 24, 32].includes(bits) || (kompression !== 0 && kompression !== 3)) return null;
  const hoehe = Math.abs(hoeheRoh);
  const vonOben = hoeheRoh < 0;
  const farben = kopf >= 40 ? v.getUint32(46, true) : 0;
  const palette: number[][] = [];
  if (bits <= 8) {
    const n = farben || 1 << bits;
    for (let i = 0; i < n; i++) {
      const p = 14 + kopf + i * 4;
      if (p + 3 > b.length) break;
      palette.push([b[p + 2], b[p + 1], b[p]]);
    }
  }
  const zeile = Math.floor((bits * breite + 31) / 32) * 4;
  if (anfang + zeile * hoehe > b.length) return null;
  const out = new Uint8Array(breite * hoehe * 3);
  for (let y = 0; y < hoehe; y++) {
    const quelle = anfang + (vonOben ? y : hoehe - 1 - y) * zeile;
    for (let x = 0; x < breite; x++) {
      let r = 0;
      let g = 0;
      let bl = 0;
      if (bits === 24 || bits === 32) {
        const p = quelle + x * (bits / 8);
        [bl, g, r] = [b[p], b[p + 1], b[p + 2]];
      } else if (bits === 16) {
        const w = b[quelle + x * 2] | (b[quelle + x * 2 + 1] << 8);
        [r, g, bl] = [((w >> 10) & 31) * 8.226, ((w >> 5) & 31) * 8.226, (w & 31) * 8.226];
      } else {
        const proByte = 8 / bits;
        const byte = b[quelle + Math.floor(x / proByte)];
        const index = (byte >> (8 - bits * ((x % proByte) + 1))) & ((1 << bits) - 1);
        [r, g, bl] = palette[index] ?? [0, 0, 0];
      }
      const z = (y * breite + x) * 3;
      out[z] = r;
      out[z + 1] = g;
      out[z + 2] = bl;
    }
  }
  return { breite, hoehe, art: 'rgb', daten: out };
}

/** JPEG: Maße und Farbkomponenten aus dem Kopf; die Daten bleiben unverändert (DCTDecode) */
export function jpegLesen(b: Uint8Array): PdfBild | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let p = 2;
  while (p + 9 < b.length) {
    if (b[p] !== 0xff) return null;
    const marke = b[p + 1];
    const laenge = (b[p + 2] << 8) | b[p + 3];
    if (marke >= 0xc0 && marke <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marke)) {
      const hoehe = (b[p + 5] << 8) | b[p + 6];
      const breite = (b[p + 7] << 8) | b[p + 8];
      const komponenten = b[p + 9];
      return breite && hoehe ? { breite, hoehe, art: 'jpeg', daten: b, komponenten } : null;
    }
    p += 2 + laenge;
  }
  return null;
}

/** PNG (8 Bit, ohne Zeilensprung) → RGB; Transparenz wird auf Weiß gelegt */
export function pngLesen(b: Uint8Array): PdfBild | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (sig.some((x, i) => b[i] !== x)) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 8;
  let breite = 0;
  let hoehe = 0;
  let tiefe = 0;
  let typ = 0;
  let zeilensprung = 0;
  let palette: Uint8Array | null = null;
  let palAlpha: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (p + 8 <= b.length) {
    const laenge = v.getUint32(p);
    const name = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    const daten = b.subarray(p + 8, p + 8 + laenge);
    if (name === 'IHDR') {
      breite = v.getUint32(p + 8);
      hoehe = v.getUint32(p + 12);
      tiefe = b[p + 16];
      typ = b[p + 17];
      zeilensprung = b[p + 20];
    } else if (name === 'PLTE') palette = daten;
    else if (name === 'tRNS') palAlpha = daten;
    else if (name === 'IDAT') idat.push(daten);
    else if (name === 'IEND') break;
    p += 12 + laenge;
  }
  if (!breite || !hoehe || tiefe !== 8 || zeilensprung !== 0 || ![0, 2, 3, 4, 6].includes(typ)) return null;
  const kanaele = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[typ as 0 | 2 | 3 | 4 | 6];
  const gesamt = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  idat.reduce((o, d) => (gesamt.set(d, o), o + d.length), 0);
  let roh: Uint8Array;
  try {
    roh = unzlibSync(gesamt);
  } catch {
    return null;
  }
  const zeile = breite * kanaele;
  if (roh.length < (zeile + 1) * hoehe) return null;
  const pixel = new Uint8Array(zeile * hoehe);
  for (let y = 0; y < hoehe; y++) {
    const filter = roh[y * (zeile + 1)];
    const q = y * (zeile + 1) + 1;
    const z = y * zeile;
    for (let x = 0; x < zeile; x++) {
      const a = x >= kanaele ? pixel[z + x - kanaele] : 0;
      const o = y > 0 ? pixel[z - zeile + x] : 0;
      const c = x >= kanaele && y > 0 ? pixel[z - zeile + x - kanaele] : 0;
      let w = roh[q + x];
      if (filter === 1) w += a;
      else if (filter === 2) w += o;
      else if (filter === 3) w += (a + o) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(o - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + o - 2 * c);
        w += pa <= pb && pa <= pc ? a : pb <= pc ? o : c;
      }
      pixel[z + x] = w & 0xff;
    }
  }
  const out = new Uint8Array(breite * hoehe * 3);
  const weiss = (w: number, alpha: number) => Math.round((w * alpha + 255 * (255 - alpha)) / 255);
  for (let i = 0; i < breite * hoehe; i++) {
    let r: number;
    let g: number;
    let bl: number;
    let al = 255;
    const s = i * kanaele;
    if (typ === 0 || typ === 4) {
      r = g = bl = pixel[s];
      if (typ === 4) al = pixel[s + 1];
    } else if (typ === 3) {
      const k = pixel[s];
      [r, g, bl] = palette ? [palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2]] : [0, 0, 0];
      if (palAlpha && k < palAlpha.length) al = palAlpha[k];
    } else {
      [r, g, bl] = [pixel[s], pixel[s + 1], pixel[s + 2]];
      if (typ === 6) al = pixel[s + 3];
    }
    out[i * 3] = weiss(r, al);
    out[i * 3 + 1] = weiss(g, al);
    out[i * 3 + 2] = weiss(bl, al);
  }
  return { breite, hoehe, art: 'rgb', daten: out };
}

function bildLesen(o: Objekt): PdfBild | null {
  const b = bild(o);
  if (!b) return null;
  if (b.typ === 'image/bmp') return bmpLesen(b.daten);
  if (b.typ === 'image/jpeg') return jpegLesen(b.daten);
  if (b.typ === 'image/png') return pngLesen(b.daten);
  return null;
}

/* ---------- Seiten zeichnen ---------- */

/** Zeichenbefehle einer Seite; Koordinaten in Pixeln von oben links, umgerechnet beim Schreiben */
class Seite {
  readonly ops: string[] = [];
  readonly schriften = new Set<string>();
  readonly bilder: PdfBild[] = [];

  /** `hoehe`: Höhe der Seite in Punkt */
  constructor(readonly hoehe: number) {}

  private x = (px: number) => zahlText(px * PT);
  private y = (px: number) => zahlText(this.hoehe - px * PT);

  farbe(c: [number, number, number], art: 'rg' | 'RG') {
    this.ops.push(`${c.map(zahlText).join(' ')} ${art}`);
  }

  rechteck(x: number, y: number, b: number, h: number, art: 'f' | 'S', farbe: [number, number, number] = [0, 0, 0], staerke = 1) {
    if (b <= 0 || h <= 0) return;
    this.ops.push('q');
    if (art === 'f') this.farbe(farbe, 'rg');
    else {
      this.farbe(farbe, 'RG');
      this.ops.push(`${zahlText(staerke * PT)} w`);
    }
    this.ops.push(`${this.x(x)} ${this.y(y + h)} ${zahlText(b * PT)} ${zahlText(h * PT)} re ${art}`, 'Q');
  }

  linie(x1: number, y1: number, x2: number, y2: number, staerke = 1, farbe: [number, number, number] = [0, 0, 0]) {
    this.ops.push('q');
    this.farbe(farbe, 'RG');
    this.ops.push(`${zahlText(staerke * PT)} w 0 J`, `${this.x(x1)} ${this.y(y1)} m ${this.x(x2)} ${this.y(y2)} l S`, 'Q');
  }

  /** auf ein Rechteck beschränken (bis `ende`) */
  beschneiden(x: number, y: number, b: number, h: number) {
    this.ops.push('q', `${this.x(x)} ${this.y(y + h)} ${zahlText(Math.max(0, b) * PT)} ${zahlText(Math.max(0, h) * PT)} re W n`);
  }

  ende() {
    this.ops.push('Q');
  }

  /**
   * Eine Textzeile mit Grundlinie bei (x, y); `winkel` in Grad gegen den Uhrzeigersinn, `stauchung` waagerecht
   * (1 = unverändert).
   */
  text(s: string, x: number, y: number, schrift: Schrift, winkel = 0, stauchung = 1) {
    if (!s) return;
    const name = pdfSchrift(schrift);
    this.schriften.add(name);
    const rad = (winkel * Math.PI) / 180;
    const [c, si] = [Math.cos(rad), Math.sin(rad)];
    this.ops.push('BT');
    this.farbe(schrift.farbe, 'rg');
    this.ops.push(`/${name} ${zahlText(schrift.groesse * PT)} Tf`);
    if (stauchung !== 1) this.ops.push(`${zahlText(stauchung * 100)} Tz`);
    this.ops.push(`${zahlText(c)} ${zahlText(si)} ${zahlText(-si)} ${zahlText(c)} ${this.x(x)} ${this.y(y)} Tm`, `${pdfString(winAnsi(s))} Tj`, 'ET');
    // Unter- und Durchstreichung (nur waagerecht)
    if (winkel === 0 && (schrift.unterstrichen || schrift.durchgestrichen)) {
      const breite = textBreite(s, schrift) * stauchung;
      const dicke = Math.max(0.6, schrift.groesse / 15);
      if (schrift.unterstrichen) this.linie(x, y + schrift.groesse * 0.12, x + breite, y + schrift.groesse * 0.12, dicke, schrift.farbe);
      if (schrift.durchgestrichen) this.linie(x, y - schrift.groesse * 0.28, x + breite, y - schrift.groesse * 0.28, dicke, schrift.farbe);
    }
  }

  bild(b: PdfBild, x: number, y: number, breite: number, hoehe: number) {
    const n = this.bilder.push(b);
    this.ops.push('q', `${zahlText(breite * PT)} 0 0 ${zahlText(hoehe * PT)} ${this.x(x)} ${this.y(y + hoehe)} cm`, `/Bild${n} Do`, 'Q');
  }
}

const AUSRICHTUNG: Record<string, 'links' | 'mitte' | 'rechts'> = { taRightJustify: 'rechts', taCenter: 'mitte' };

/** Textblock in einem Kasten: Zeilen mit Ausrichtung, Zeilenhöhe 1,15 */
function textBlock(seite: Seite, zeilen: string[], x: number, y: number, b: number, schrift: Schrift, ausrichtung: 'links' | 'mitte' | 'rechts', stauchung = 1) {
  const hoehe = schrift.groesse * ZEILE;
  zeilen.forEach((z, i) => {
    const w = textBreite(z, schrift) * stauchung;
    const xs = ausrichtung === 'rechts' ? x + b - w : ausrichtung === 'mitte' ? x + (b - w) / 2 : x;
    seite.text(z, xs, y + i * hoehe + schrift.groesse * GRUNDLINIE[schrift.familie], schrift, 0, stauchung);
  });
}

/** Beschriftung – Umbruch nur mit WordWrap, sonst gestaucht, wenn sie breiter ist als ihr Kasten */
function beschriftung(seite: Seite, k: Kasten) {
  const inhalt = ohneKuerzel(text(k.o, 'Caption') ?? '');
  const l = lage(k);
  const schrift = schriftVon(k.o);
  const hintergrund = farbe(k.o, 'Color');
  if (bezeichner(k.o, 'Transparent') !== 'True' && hintergrund && hintergrund !== '#ffffff') seite.rechteck(l.x, l.y, l.b, l.h, 'f', rgb(hintergrund, [1, 1, 1]));
  if (!inhalt.trim()) return;
  const ausrichtung = AUSRICHTUNG[bezeichner(k.o, 'Alignment') ?? ''] ?? 'links';
  const d = k.o.klasse === 'TExtendedLabel' ? drehung(k.o) : 0;
  if (d === 90 || d === 270) {
    // senkrecht: 270° liest von oben nach unten, 90° von unten nach oben (eine Zeile)
    const zeile = inhalt.split(/\r\n|\r|\n/)[0];
    const laenge = textBreite(zeile, schrift);
    const versatz = ausrichtung === 'rechts' ? l.h - laenge : ausrichtung === 'mitte' ? (l.h - laenge) / 2 : 0;
    const grund = schrift.groesse * GRUNDLINIE[schrift.familie];
    if (d === 270) seite.text(zeile, l.x + l.b - grund, l.y + versatz, schrift, -90);
    else seite.text(zeile, l.x + grund, l.y + l.h - versatz, schrift, 90);
    return;
  }
  const umbruch = bezeichner(k.o, 'WordWrap') === 'True';
  const zeilen = umbruch ? umbrechen(inhalt, l.b, schrift) : inhalt.split(/\r\n|\r|\n/);
  const breiteste = Math.max(...zeilen.map((z) => textBreite(z, schrift)));
  const stauchung = !umbruch && breiteste > l.b + 0.5 && l.b > 0 ? l.b / breiteste : 1;
  textBlock(seite, zeilen, l.x, l.y, l.b, schrift, ausrichtung, stauchung);
}

/** Textfeld: Inhalt mit 1 px Rand oben und 3 px links/rechts, auf den Kasten beschränkt */
function textfeld(seite: Seite, k: Kasten, wert: string) {
  if (!wert) return;
  const schrift = schriftVon(k.o);
  const innen = k.b - 6;
  const umbruch = bezeichner(k.o, 'WordWrap') !== 'False';
  const zeilen = umbruch ? umbrechen(wert, innen, schrift) : wert.split(/\r\n|\r|\n/);
  seite.beschneiden(k.x, k.y, k.b, k.h);
  textBlock(seite, zeilen, k.x + 3, k.y + 1, innen, schrift, AUSRICHTUNG[bezeichner(k.o, 'Alignment') ?? ''] ?? 'links');
  seite.ende();
}

/** Kästchen 12 × 12 px mit Kreuz, daneben die Beschriftung (Abstand 4 px) */
function kaestchen(seite: Seite, k: Kasten, angekreuzt: boolean) {
  const schrift = schriftVon(k.o);
  const caption = ohneKuerzel(text(k.o, 'Caption') ?? '');
  const rechts = bezeichner(k.o, 'Alignment') !== 'taLeftJustify';
  const breite = caption ? textBreite(caption, schrift) : 0;
  const kx = rechts ? k.x : k.x + breite + (caption ? 4 : 0);
  const ky = k.y + 1;
  seite.rechteck(kx + 0.5, ky + 0.5, 11, 11, 'S');
  if (angekreuzt) {
    seite.linie(kx + 2, ky + 2, kx + 10, ky + 10, 1.3);
    seite.linie(kx + 10, ky + 2, kx + 2, ky + 10, 1.3);
  }
  if (caption) seite.text(caption, rechts ? k.x + 16 : k.x, k.y + schrift.groesse * GRUNDLINIE[schrift.familie], schrift);
}

const LINIEN: Record<string, ('oben' | 'unten' | 'links' | 'rechts')[]> = {
  bsBottomLine: ['unten'],
  bsTopLine: ['oben'],
  bsLeftLine: ['links'],
  bsRightLine: ['rechts'],
  bsFrame: ['oben', 'unten', 'links', 'rechts'],
  bsBox: ['oben', 'unten', 'links', 'rechts'],
  bsSpacer: [],
};

function element(seite: Seite, k: Kasten, feld: Feld | undefined, wert: (f: Feld) => string | boolean) {
  switch (k.o.klasse) {
    case 'TPanel': {
      const hintergrund = farbe(k.o, 'Color');
      if (hintergrund && hintergrund !== '#ffffff') seite.rechteck(k.x, k.y, k.b, k.h, 'f', rgb(hintergrund, [1, 1, 1]));
      const ohneRand = bezeichner(k.o, 'BevelOuter') === 'bvNone' && bezeichner(k.o, 'BorderStyle') !== 'bsSingle';
      if (!ohneRand) seite.rechteck(k.x + 0.5, k.y + 0.5, k.b - 1, k.h - 1, 'S');
      return;
    }
    case 'TBevel': {
      for (const seiteDerLinie of LINIEN[bezeichner(k.o, 'Shape') ?? ''] ?? LINIEN.bsBox) {
        if (seiteDerLinie === 'oben') seite.linie(k.x, k.y + 0.5, k.x + k.b, k.y + 0.5);
        if (seiteDerLinie === 'unten') seite.linie(k.x, k.y + k.h - 0.5, k.x + k.b, k.y + k.h - 0.5);
        if (seiteDerLinie === 'links') seite.linie(k.x + 0.5, k.y, k.x + 0.5, k.y + k.h);
        if (seiteDerLinie === 'rechts') seite.linie(k.x + k.b - 0.5, k.y, k.x + k.b - 0.5, k.y + k.h);
      }
      return;
    }
    case 'TLabel':
    case 'TExtendedLabel':
      return beschriftung(seite, k);
    case 'TMemo':
      if (feld) textfeld(seite, k, String(wert(feld) || ''));
      return;
    case 'TCheckBox':
      if (feld) kaestchen(seite, k, wert(feld) === true);
      return;
    case 'TImage': {
      const b = bildLesen(k.o);
      if (!b) return;
      // wie in der Ansicht: gestreckt oder eingepasst (oben links)
      if (bezeichner(k.o, 'Stretch') === 'True') seite.bild(b, k.x, k.y, k.b, k.h);
      else {
        const f = Math.min(k.b / b.breite, k.h / b.hoehe);
        seite.bild(b, k.x, k.y, b.breite * f, b.hoehe * f);
      }
      return;
    }
    default:
      return;
  }
}

/* ---------- Datei schreiben ---------- */

const ascii = (s: string) => new TextEncoder().encode(s);

export interface PdfAngaben {
  titel?: string;
  /** Erzeugungszeit (für Tests fest) */
  zeit?: Date;
}

function pdfDatum(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}${z(d.getUTCHours())}${z(d.getUTCMinutes())}${z(d.getUTCSeconds())}Z`;
}

/**
 * PDF des Formulars mit den Werten aus `wert` (gespeicherte Inhalte samt ungespeicherter Eingaben). `felder` je
 * Seite wie in der Oberfläche.
 */
export function formularPdf(formular: Formular, felder: Feld[][], wert: (f: Feld) => string | boolean, angaben: PdfAngaben = {}): Uint8Array {
  const seiten = formular.seiten.map((s, i) => {
    const k = kaesten(s);
    const masse = blatt(seitenMasse(k));
    // genau A4, wenn das Blatt A4 ist (793 × 1122 px sind knapp darunter)
    const breite = masse.breite === 793 ? 595.28 : masse.breite * PT;
    const hoehe = masse.hoehe === 1122 ? 841.89 : masse.hoehe * PT;
    const seite = new Seite(hoehe);
    const nachName = new Map(felder[i]?.map((f) => [f.name, f]) ?? []);
    // wie auf dem Blatt: das Formular mit Rand, alles außerhalb des Blatts abgeschnitten
    seite.beschneiden(0, 0, masse.breite, masse.hoehe);
    seite.ops.push(`1 0 0 1 ${zahlText(masse.links * PT)} ${zahlText(-masse.oben * PT)} cm`);
    for (const kasten of k) element(seite, kasten, nachName.get(kasten.o.name), wert);
    seite.ende();
    return { seite, breite, hoehe };
  });

  // Objekte: 1 Katalog, 2 Seitenbaum, 3 Info, dann Schriften, je Seite Seite + Inhalt + Bilder
  const objekte: (string | Uint8Array)[] = [];
  const neu = (inhalt: string | Uint8Array = '') => objekte.push(inhalt);
  neu(); // Katalog
  neu(); // Seiten
  neu(); // Info
  const alleSchriften = [...new Set(seiten.flatMap((s) => [...s.seite.schriften]))].sort();
  const schriftNr = new Map(alleSchriften.map((name) => [name, neu(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`)]));
  const seitenNr: number[] = [];
  for (const { seite, breite, hoehe } of seiten) {
    const bilder = seite.bilder.map((b) => {
      const kopf =
        b.art === 'jpeg'
          ? `/Filter /DCTDecode /ColorSpace /${b.komponenten === 1 ? 'DeviceGray' : b.komponenten === 4 ? 'DeviceCMYK' : 'DeviceRGB'}${b.komponenten === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : ''}`
          : `/Filter /FlateDecode /ColorSpace /${b.art === 'grau' ? 'DeviceGray' : 'DeviceRGB'}`;
      const daten = b.art === 'jpeg' ? b.daten : zlibSync(b.daten);
      return neu(strom(`<< /Type /XObject /Subtype /Image /Width ${b.breite} /Height ${b.hoehe} /BitsPerComponent 8 ${kopf} /Length ${daten.length} >>`, daten));
    });
    const inhalt = zlibSync(ascii(seite.ops.join('\n')));
    const inhaltNr = neu(strom(`<< /Length ${inhalt.length} /Filter /FlateDecode >>`, inhalt));
    const res = `<< /Font << ${alleSchriften.map((n) => `/${n} ${schriftNr.get(n)} 0 R`).join(' ')} >>${bilder.length ? ` /XObject << ${bilder.map((nr, i) => `/Bild${i + 1} ${nr} 0 R`).join(' ')} >>` : ''} >>`;
    seitenNr.push(neu(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${zahlText(breite)} ${zahlText(hoehe)}] /Resources ${res} /Contents ${inhaltNr} 0 R >>`));
  }
  objekte[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objekte[1] = `<< /Type /Pages /Kids [${seitenNr.map((n) => `${n} 0 R`).join(' ')}] /Count ${seitenNr.length} >>`;
  const titel = angaben.titel ? ` /Title ${pdfString(winAnsi(angaben.titel))}` : '';
  objekte[2] = `<< /Producer (Formulare)${titel} /CreationDate (${pdfDatum(angaben.zeit ?? new Date())}) >>`;
  return schreibeDatei(objekte);
}

function strom(kopf: string, daten: Uint8Array): Uint8Array {
  const a = ascii(`${kopf}\nstream\n`);
  const e = ascii('\nendstream');
  const out = new Uint8Array(a.length + daten.length + e.length);
  out.set(a);
  out.set(daten, a.length);
  out.set(e, a.length + daten.length);
  return out;
}

function schreibeDatei(objekte: (string | Uint8Array)[]): Uint8Array {
  // Kopf mit Binärkommentar (zeigt Programmen, dass die Datei Binärdaten enthält)
  const teile: Uint8Array[] = [new Uint8Array([...ascii('%PDF-1.4\n%'), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
  let laenge = teile[0].length;
  const lagen: number[] = [];
  objekte.forEach((o, i) => {
    lagen.push(laenge);
    const inhalt = typeof o === 'string' ? ascii(o) : o;
    const kopf = ascii(`${i + 1} 0 obj\n`);
    const fuss = ascii('\nendobj\n');
    teile.push(kopf, inhalt, fuss);
    laenge += kopf.length + inhalt.length + fuss.length;
  });
  const xref = laenge;
  teile.push(ascii(`xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${lagen.map((l) => `${String(l).padStart(10, '0')} 00000 n \n`).join('')}`));
  teile.push(ascii(`trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  const out = new Uint8Array(teile.reduce((n, t) => n + t.length, 0));
  teile.reduce((o, t) => (out.set(t, o), o + t.length), 0);
  return out;
}

