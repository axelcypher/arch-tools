import { readFileSync } from 'node:fs';
import path from 'node:path';
import { zlibSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { pdfjs, pdfOeffnen, pdfSchliessen } from '../dokumente/pdf';
import type { Feld } from './felder';
import { felderDerSeite } from './felder';
import { parseFormular } from './formular';
import { bmpLesen, formularPdf, jpegLesen, pngLesen, textBreite, umbrechen, winAnsi } from './pdf';

const MUSTER = new Uint8Array(readFileSync(path.resolve(__dirname, '../__fixtures__/muster.frmsjf')));

async function texte(pdf: Uint8Array): Promise<{ seiten: number; texte: string[][]; groesse: number[] }> {
  const doc = await pdfOeffnen(pdf);
  try {
    const texte: string[][] = [];
    const seite1 = await doc.getPage(1);
    const vp = seite1.getViewport({ scale: 1 });
    for (let n = 1; n <= doc.numPages; n++) {
      const inhalt = await (await doc.getPage(n)).getTextContent();
      texte.push(inhalt.items.map((i) => ('str' in i ? i.str : '')).filter(Boolean));
    }
    return { seiten: doc.numPages, texte, groesse: [vp.width, vp.height] };
  } finally {
    await pdfSchliessen(doc);
  }
}

// pdf.js ist groß: einmal vorab laden – auf langsamen Rechnern (CI unter Windows) dauert das mehrere Sekunden
beforeAll(async () => {
  await pdfjs();
}, 60_000);

describe('PDF aus dem Formular', { timeout: 30_000 }, () => {
  const formular = parseFormular(MUSTER);
  const felder = formular.seiten.map((s, i) => felderDerSeite(s, i));
  const original = (f: Feld) => f.original;

  it('enthält jede Seite als A4-Blatt mit Beschriftungen und Feldinhalten als Text', async () => {
    const pdf = formularPdf(formular, felder, original, { titel: 'BS9 Muster', zeit: new Date(Date.UTC(2026, 10, 10)) });
    expect(new TextDecoder().decode(pdf.subarray(0, 8))).toBe('%PDF-1.4');
    const { seiten, texte: t, groesse } = await texte(pdf);
    expect(seiten).toBe(2);
    expect(groesse.map(Math.round)).toEqual([595, 842]);
    const s1 = t[0].join('|');
    expect(s1).toContain('Bauherrschaft');
    expect(s1).toContain('Mustermann, Max');
    expect(s1).toContain('Wohngebäude');
    expect(s1).toContain('Musterformular zur VV BauPrüfVO (Blatt 1)');
    expect(t[1].join('|')).toContain('Stand 2026');
  });

  it('nimmt ungespeicherte Eingaben mit – auch Umlaute und Sonderzeichen aus Windows-1252', async () => {
    const memo = felder[0].find((f) => f.art === 'text')!;
    const pdf = formularPdf(formular, felder, (f) => (f === memo ? 'Müller – Straße 5 „Süd“ €' : f.original));
    const { texte: t } = await texte(pdf);
    expect(t[0].join('|')).toContain('Müller – Straße 5 „Süd“ €');
  });

  it('ohne Werte: leere Felder, aber alle Beschriftungen', async () => {
    const pdf = formularPdf(formular, felder, (f) => (f.art === 'kreuz' ? false : ''));
    const { texte: t } = await texte(pdf);
    expect(t[0].join('|')).not.toContain('Mustermann');
    expect(t[0].join('|')).toContain('Sonderbau');
  });
});

describe('Text für die PDF', () => {
  it('Windows-1252, Unbekanntes als Fragezeichen', () => {
    expect(winAnsi('Aä€–√')).toEqual([0x41, 0xe4, 0x80, 0x96, 0x3f]);
  });

  it('Breiten wie Arial (Helvetica) und Courier New (Courier)', () => {
    expect(textBreite('A', { familie: 'Helvetica', fett: false, kursiv: false, groesse: 10 })).toBeCloseTo(6.67, 2);
    expect(textBreite('iiii', { familie: 'Courier', fett: false, kursiv: false, groesse: 10 })).toBeCloseTo(24, 5);
    expect(textBreite('W', { familie: 'Helvetica', fett: true, kursiv: false, groesse: 10 })).toBeCloseTo(9.44, 2);
  });

  it('bricht an Leerzeichen um, zu lange Wörter zeichenweise, Absätze bleiben', () => {
    const s = { familie: 'Courier' as const, fett: false, kursiv: false, groesse: 10 };
    // 6 px je Zeichen: 30 px = 5 Zeichen
    expect(umbrechen('ab cd ef', 30, s)).toEqual(['ab cd', 'ef']);
    expect(umbrechen('abcdefghij', 30, s)).toEqual(['abcde', 'fghij']);
    expect(umbrechen('ab\r\n\r\ncd', 30, s)).toEqual(['ab', '', 'cd']);
  });
});

describe('Bilder für die PDF', () => {
  it('liest Bitmaps (24 Bit und mit Farbtabelle, von unten nach oben)', () => {
    // 2 × 2 px, 24 Bit: unten rot, blau; oben grün, weiß (Zeilen auf 4 Byte aufgefüllt)
    const kopf = (bits: number, daten: number[], palette: number[] = []) => {
      const anfang = 54 + palette.length;
      const b = new Uint8Array(anfang + daten.length);
      const v = new DataView(b.buffer);
      b[0] = 0x42;
      b[1] = 0x4d;
      v.setUint32(2, b.length, true);
      v.setUint32(10, anfang, true);
      v.setUint32(14, 40, true);
      v.setInt32(18, 2, true);
      v.setInt32(22, 2, true);
      v.setUint16(26, 1, true);
      v.setUint16(28, bits, true);
      v.setUint32(46, palette.length / 4, true);
      b.set(palette, 54);
      b.set(daten, anfang);
      return b;
    };
    const rgb24 = bmpLesen(kopf(24, [0, 0, 255, 255, 0, 0, 0, 0, 0, 255, 0, 255, 255, 255, 0, 0]))!;
    expect([...rgb24.daten]).toEqual([0, 255, 0, 255, 255, 255, 255, 0, 0, 0, 0, 255]);
    // 8 Bit mit Farbtabelle (BGRA): 0 = schwarz, 1 = rot
    const pal = bmpLesen(kopf(8, [1, 0, 0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 0, 0, 255, 0]))!;
    expect([...pal.daten]).toEqual([0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 0]);
  });

  it('liest PNG (mit Transparenz auf Weiß) und JPEG-Köpfe', () => {
    const crc = () => [0, 0, 0, 0];
    const chunk = (name: string, daten: number[]) => [...[24, 16, 8, 0].map((s) => (daten.length >> s) & 255), ...[...name].map((c) => c.charCodeAt(0)), ...daten, ...crc()];
    // 1 × 2 px RGBA: rot deckend, schwarz durchsichtig
    const roh = zlibSync(new Uint8Array([0, 255, 0, 0, 255, 0, 0, 0, 0, 0]));
    const ihdr = [0, 0, 0, 1, 0, 0, 0, 2, 8, 6, 0, 0, 0];
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', ihdr), ...chunk('IDAT', [...roh]), ...chunk('IEND', [])]);
    const b = pngLesen(png)!;
    expect([b.breite, b.hoehe]).toEqual([1, 2]);
    expect([...b.daten]).toEqual([255, 0, 0, 255, 255, 255]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 20, 0, 30, 3, 0, 0, 0, 0]);
    expect(jpegLesen(jpeg)).toMatchObject({ breite: 30, hoehe: 20, komponenten: 3, art: 'jpeg' });
  });
});
