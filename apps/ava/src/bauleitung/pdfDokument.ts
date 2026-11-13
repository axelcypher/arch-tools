/**
 * Einfache PDF-Dokumente (A4 hoch) für Protokolle, Bautagebuch und Mängellisten: Kopf mit Büro und Projekt,
 * Titel, Angaben in zwei Spalten, Absätze und Tabellen mit Zeilenumbruch, Seitenumbruch, „Seite x von y“.
 * Damit lassen sie sich ablegen und als Anhang verschicken, ohne den Druckdialog.
 */

import type { PDFFont, PDFPage } from 'pdf-lib';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { APP_NAMEN } from '@core/appNamen';

const A4: [number, number] = [595.28, 841.89];
const MM = 72 / 25.4;
const RAND = 18 * MM;
const BREITE = A4[0] - 2 * RAND;
const UNTEN = 22 * MM;
const GRAU = rgb(0.4, 0.4, 0.4);
const LINIE = rgb(0.75, 0.75, 0.75);

export interface TabellenSpalte {
  titel: string;
  /** Anteil an der Breite */
  breite: number;
  rechts?: boolean;
}

const ZEILENTRENNER = new RegExp('[\\u2028\\u2029\\u00a0]', 'g');

/** Zeichen, die die Standardschrift nicht kennt, durch Ähnliches ersetzen */
function sauber(t: string, font: PDFFont): string {
  const s = t.replace(ZEILENTRENNER, ' ').replace(/[‘’]/g, "'").replace(/[“”„]/g, '"').replace(/\t/g, '    ');
  let out = '';
  for (const c of s) {
    try {
      font.encodeText(c);
      out += c;
    } catch {
      out += '?';
    }
  }
  return out;
}

export class PdfDokument {
  private doc!: PDFDocument;
  private font!: PDFFont;
  private fett!: PDFFont;
  private seite!: PDFPage;
  private y = 0;
  private seiten: PDFPage[] = [];

  private constructor(private readonly kopf: { links: string; rechts: string }) {}

  static async neu(kopf: { links: string; rechts: string }, titel: string): Promise<PdfDokument> {
    const d = new PdfDokument(kopf);
    d.doc = await PDFDocument.create();
    d.doc.setTitle(titel);
    d.doc.setCreator(APP_NAMEN.ava.name);
    d.font = await d.doc.embedFont(StandardFonts.Helvetica);
    d.fett = await d.doc.embedFont(StandardFonts.HelveticaBold);
    d.neueSeite();
    return d;
  }

  private neueSeite() {
    this.seite = this.doc.addPage(A4);
    this.seiten.push(this.seite);
    const y = A4[1] - 12 * MM;
    this.seite.drawText(sauber(this.kopf.links, this.font), { x: RAND, y, size: 8, font: this.font, color: GRAU });
    const r = sauber(this.kopf.rechts, this.font);
    this.seite.drawText(r, { x: A4[0] - RAND - this.font.widthOfTextAtSize(r, 8), y, size: 8, font: this.font, color: GRAU });
    this.seite.drawLine({ start: { x: RAND, y: y - 3 }, end: { x: A4[0] - RAND, y: y - 3 }, thickness: 0.5, color: LINIE });
    this.y = y - 10 * MM;
  }

  private platz(h: number) {
    if (this.y - h < UNTEN) this.neueSeite();
  }

  umbrechen(text: string, size: number, breite: number, f = this.font): string[] {
    const out: string[] = [];
    for (const absatz of sauber(text, f).split('\n')) {
      let zeile = '';
      for (const wort of absatz.split(/ +/)) {
        const probe = zeile ? `${zeile} ${wort}` : wort;
        if (f.widthOfTextAtSize(probe, size) > breite && zeile) {
          out.push(zeile);
          zeile = wort;
        } else zeile = probe;
        // sehr lange Wörter hart trennen
        while (f.widthOfTextAtSize(zeile, size) > breite && zeile.length > 1) {
          let n = zeile.length - 1;
          while (n > 1 && f.widthOfTextAtSize(zeile.slice(0, n), size) > breite) n--;
          out.push(zeile.slice(0, n));
          zeile = zeile.slice(n);
        }
      }
      out.push(zeile);
    }
    return out;
  }

  titel(text: string, unter?: string) {
    this.platz(16 * MM);
    this.seite.drawText(sauber(text, this.fett), { x: RAND, y: this.y, size: 15, font: this.fett });
    this.y -= 7 * MM;
    if (unter) {
      this.seite.drawText(sauber(unter, this.font), { x: RAND, y: this.y, size: 10, font: this.font, color: GRAU });
      this.y -= 6 * MM;
    }
    this.y -= 2 * MM;
  }

  ueberschrift(text: string) {
    this.platz(12 * MM);
    this.y -= 2 * MM;
    this.seite.drawText(sauber(text, this.fett), { x: RAND, y: this.y, size: 11, font: this.fett });
    this.y -= 2.5 * MM;
    this.seite.drawLine({ start: { x: RAND, y: this.y }, end: { x: A4[0] - RAND, y: this.y }, thickness: 0.5, color: LINIE });
    this.y -= 5 * MM;
  }

  /** Angaben „Bezeichnung: Wert“ */
  angaben(liste: [string, string][]) {
    for (const [k, v] of liste) {
      if (!v) continue;
      const zeilen = this.umbrechen(v, 9.5, BREITE - 40 * MM);
      this.platz(zeilen.length * 4.6 * MM);
      this.seite.drawText(sauber(k, this.font), { x: RAND, y: this.y, size: 9.5, font: this.font, color: GRAU });
      zeilen.forEach((z, i) => this.seite.drawText(z, { x: RAND + 40 * MM, y: this.y - i * 4.6 * MM, size: 9.5, font: this.font }));
      this.y -= zeilen.length * 4.6 * MM + 1;
    }
    this.y -= 2 * MM;
  }

  absatz(text: string, o: { fett?: boolean; groesse?: number } = {}) {
    const size = o.groesse ?? 9.5;
    const f = o.fett ? this.fett : this.font;
    for (const z of this.umbrechen(text, size, BREITE, f)) {
      this.platz(size * 0.5 * MM);
      this.seite.drawText(z, { x: RAND, y: this.y, size, font: f });
      this.y -= size * 0.48 * MM;
    }
    this.y -= 2 * MM;
  }

  tabelle(spalten: TabellenSpalte[], zeilen: (string | { text: string; fett?: boolean })[][]) {
    const summe = spalten.reduce((s, x) => s + x.breite, 0);
    const b = spalten.map((x) => (x.breite / summe) * BREITE);
    const size = 9;
    const zh = 4.3 * MM;
    const kopf = () => {
      this.platz(zh * 2);
      let x = RAND;
      spalten.forEach((s, i) => {
        this.seite.drawText(sauber(s.titel, this.fett), { x: s.rechts ? x + b[i] - 2 - this.fett.widthOfTextAtSize(sauber(s.titel, this.fett), size) : x + 1, y: this.y, size, font: this.fett });
        x += b[i];
      });
      this.y -= 2;
      this.seite.drawLine({ start: { x: RAND, y: this.y }, end: { x: A4[0] - RAND, y: this.y }, thickness: 0.6, color: rgb(0, 0, 0) });
      this.y -= zh;
    };
    kopf();
    for (const zeile of zeilen) {
      const zellen = zeile.map((z, i) => {
        const t = typeof z === 'string' ? { text: z } : z;
        return { ...t, zeilen: this.umbrechen(t.text, size, b[i] - 4, t.fett ? this.fett : this.font) };
      });
      const h = Math.max(1, ...zellen.map((z) => z.zeilen.length)) * zh;
      if (this.y - h < UNTEN) {
        this.neueSeite();
        kopf();
      }
      let x = RAND;
      zellen.forEach((z, i) => {
        const f = z.fett ? this.fett : this.font;
        z.zeilen.forEach((t, k) => this.seite.drawText(t, { x: spalten[i].rechts ? x + b[i] - 2 - f.widthOfTextAtSize(t, size) : x + 1, y: this.y - k * zh, size, font: f }));
        x += b[i];
      });
      this.y -= h - zh + 1.5 * MM;
      this.seite.drawLine({ start: { x: RAND, y: this.y + zh - 1.2 * MM }, end: { x: A4[0] - RAND, y: this.y + zh - 1.2 * MM }, thickness: 0.3, color: LINIE });
      this.y -= zh - 1.5 * MM + 1;
    }
    this.y -= 3 * MM;
  }

  abstand(mm: number) {
    this.y -= mm * MM;
  }

  async speichern(): Promise<Uint8Array> {
    const n = this.seiten.length;
    this.seiten.forEach((s, i) => {
      const t = `Seite ${i + 1} von ${n}`;
      s.drawText(t, { x: A4[0] - RAND - this.font.widthOfTextAtSize(t, 8), y: 12 * MM, size: 8, font: this.font, color: GRAU });
    });
    return this.doc.save();
  }
}
