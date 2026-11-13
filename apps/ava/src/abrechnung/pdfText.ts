/**
 * Text für die Standardschriften von pdf-lib (WinAnsi): Zeichen, die die Schrift nicht kennt, würden beim Zeichnen
 * einen Fehler werfen. Sie werden ersetzt – zuerst durch den Grundbuchstaben („Łukasz“ → „Lukasz“, „ş“ → „s“), sonst
 * durch „?“. Typografische Anführungszeichen und Zeilentrenner werden vereinfacht.
 */

import type { PDFFont } from 'pdf-lib';

const ZEILENTRENNER = new RegExp('[\\u2028\\u2029]', 'g');
const KOMBINIEREND = new RegExp('[\\u0300-\\u036f]', 'g');

/** Buchstaben, die NFD nicht zerlegt */
const ERSATZ: Record<string, string> = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', Ø: 'O', ø: 'o', Ħ: 'H', ħ: 'h', ı: 'i', Ŀ: 'L', ŀ: 'l' };

export function pdfText(t: string, font: PDFFont): string {
  const s = t.replace(ZEILENTRENNER, ' ').replace(/\t/g, '    ');
  let out = '';
  for (const c of s) {
    for (const kandidat of [c, ERSATZ[c] ?? c.normalize('NFD').replace(KOMBINIEREND, ''), c === '‘' || c === '’' ? "'" : c === '“' || c === '”' || c === '„' ? '"' : '', '?']) {
      if (!kandidat) continue;
      try {
        font.encodeText(kandidat);
        out += kandidat;
        break;
      } catch {
        // nächster Ersatz
      }
    }
  }
  return out;
}
