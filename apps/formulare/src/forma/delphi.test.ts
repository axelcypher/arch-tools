import { describe, expect, it } from 'vitest';
import { kodiereStuecke, stringlisteZeilen, zeichenketteZeilen } from './delphi';

describe('Delphi-Zeichenketten', () => {
  it('kurze Zeichenkette mit Umlaut', () => {
    expect(zeichenketteZeilen('        ', 'Caption', 'Anlage I/3 zur VV BauPrüfVO (Blatt 1)')).toEqual([
      "        Caption = 'Anlage I/3 zur VV BauPr'#252'fVO (Blatt 1)'",
    ]);
  });

  it('leere Zeichenkette', () => {
    expect(zeichenketteZeilen('  ', 'Caption', '')).toEqual(["  Caption = ''"]);
  });

  it('Hochkomma und Steuerzeichen als #nnn', () => {
    expect(kodiereStuecke("Bauherr's\r\nA")).toEqual(["'Bauherr'#39's'#13#10'A'"]);
  });

  it('genau 64 Zeichen bleiben auf einer Zeile', () => {
    const s = 'x'.repeat(64);
    expect(zeichenketteZeilen('', 'Caption', s)).toEqual([`Caption = '${s}'`]);
  });

  it('lange Zeichenkette wird nach 64 Zeichen umbrochen', () => {
    expect(zeichenketteZeilen('  ', 'Caption', 'NRW - 2026 - Anlage I-3 - Antrag auf Genehmigungsfreistellung - Seite 1 von 3')).toEqual([
      '  Caption = ',
      "    'NRW - 2026 - Anlage I-3 - Antrag auf Genehmigungsfreistellung - ' +",
      "    'Seite 1 von 3'",
    ]);
  });

  it('#nnn zählt als ein Zeichen', () => {
    expect(kodiereStuecke(`${'a'.repeat(63)}üb`)).toEqual([`'${'a'.repeat(63)}'#252`, "'b'"]);
  });

  it('Zeichen außerhalb der BMP als Surrogatpaar', () => {
    expect(kodiereStuecke('😀')).toEqual(['#55357#56832']);
  });

  it('langer Listeneintrag bekommt einen eigenen Block', () => {
    expect(stringlisteZeilen('  ', 'Items.Strings', [`Memo1=${'K'.repeat(60)}`, 'Memo2=x'])).toEqual([
      '  Items.Strings = (',
      '    ',
      `      'Memo1=${'K'.repeat(58)}' +`,
      "      'KK'",
      "    'Memo2=x')",
    ]);
  });
});
