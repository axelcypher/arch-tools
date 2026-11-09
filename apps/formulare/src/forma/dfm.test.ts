import { describe, expect, it } from 'vitest';
import { eigenschaft, finde, parseDfm, schreibeObjekt } from './dfm';

const BEISPIEL = [
  'object Form1: TFRMABSeiteForm',
  '  Caption = ',
  "    'Seite ' +",
  "    '1'",
  '  Font.Style = [fsBold, fsItalic]',
  '  object Memo1: TMemo',
  '        Left = -4',
  '        Lines.Strings = (',
  "          'Musterstra'#223'e 1'",
  "          '')",
  '      end',
  '  object Image1: TImage',
  '    Picture.Data = {',
  '      0754',
  '      FF}',
  '  end',
  'end',
  '',
].join('\r\n');

describe('DFM lesen', () => {
  it('liest die Werte', () => {
    const form = parseDfm(BEISPIEL);
    expect([form.name, form.klasse]).toEqual(['Form1', 'TFRMABSeiteForm']);
    expect(eigenschaft(form, 'Caption')?.wert).toEqual({ art: 'text', text: 'Seite 1' });
    expect(eigenschaft(form, 'Font.Style')?.wert).toEqual({ art: 'menge', elemente: ['fsBold', 'fsItalic'] });
    const memo = finde(form, 'Memo1')!;
    expect(eigenschaft(memo, 'Left')?.wert).toEqual({ art: 'zahl', roh: '-4' });
    expect(eigenschaft(memo, 'Lines.Strings')?.wert).toEqual({
      art: 'liste',
      werte: [
        { art: 'text', text: 'Musterstraße 1' },
        { art: 'text', text: '' },
      ],
    });
    expect(eigenschaft(finde(form, 'Image1')!, 'Picture.Data')?.wert).toEqual({ art: 'binaer', hex: '0754FF' });
  });

  it('schreibt unverändert zurück', () => {
    const out: string[] = [];
    schreibeObjekt(parseDfm(BEISPIEL), out);
    expect(out.join('')).toBe(BEISPIEL);
  });

  it('lehnt einzelne LF ab', () => {
    expect(() => parseDfm('object Form1: TForm\n  Tag = 1\r\nend\r\n')).toThrow();
  });

  it('lehnt nicht abgeschlossene Zeichenketten ab', () => {
    expect(() => parseDfm("object Form1: TForm\r\n  Caption = 'abc\r\nend\r\n")).toThrow();
  });

  it('lehnt Nicht-ASCII-Zeichen ab', () => {
    expect(() => parseDfm("object Form1: TForm\r\n  Caption = 'ä'\r\nend\r\n")).toThrow(/Nicht-ASCII/);
  });
});
