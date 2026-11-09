import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bild, delphiFarbe, drehung, lage, seitenMasse } from './darstellung';
import { nachfahren, parseDfm } from './dfm';
import { kaesten } from './felder';
import { parseFormular } from './formular';

describe('Darstellung', () => {
  it('Delphi-Farben: Namen, Systemfarben auf Papier, Zahlen als $00BBGGRR', () => {
    expect(delphiFarbe('clSilver')).toBe('#c0c0c0');
    expect(delphiFarbe('clBtnFace')).toBe('#ffffff');
    expect(delphiFarbe('clWindowText')).toBe('#000000');
    expect(delphiFarbe('9680639')).toBe('#ffb693');
    expect(delphiFarbe('$000000FF')).toBe('#ff0000');
    expect(delphiFarbe('clUnbekannt')).toBeUndefined();
    expect(delphiFarbe('-16777201')).toBeUndefined();
  });

  it('gedrehte Beschriftungen tauschen Breite und Höhe', () => {
    const form = parseDfm(
      ['object F: TForm', '  object L: TExtendedLabel', '    Left = 1', '    Top = 18', '    Width = 230', '    Height = 14', '    Angle = 270', '  end', 'end', ''].join('\r\n'),
    );
    const [k] = kaesten({ schluessel: 'S01', form });
    expect(drehung(k.o)).toBe(270);
    expect(lage(k)).toEqual({ x: 1, y: 18, b: 14, h: 230 });
    expect(seitenMasse([k])).toEqual({ breite: 700, hoehe: 248 });
  });

  it('liest das eingebettete Bild (TBitmap) als BMP', () => {
    const form = parseDfm(['object F: TForm', '  object I: TImage', '    Picture.Data = {', '      07544269746D617006000000424D01020304', '      }', '  end', 'end', ''].join('\r\n'));
    const i = nachfahren(form).find((o) => o.name === 'I')!;
    const b = bild(i)!;
    expect(b.typ).toBe('image/bmp');
    expect([...b.daten]).toEqual([0x42, 0x4d, 1, 2, 3, 4]);
  });

  const REF = process.env.SJFORMA_REF ?? path.resolve(__dirname, '../../../../.ref');
  const statistik = path.join(REF, 'BS5/020-Statistikbogen Baugenehmigung (2024).frmsjf');
  it.skipIf(!existsSync(statistik))('echtes Formular: Kopfbild des Statistikbogens und Papiermaße', () => {
    const f = parseFormular(new Uint8Array(readFileSync(statistik)));
    const k = kaesten(f.seiten[0]);
    const img = k.find((x) => x.o.klasse === 'TImage')!;
    const b = bild(img.o)!;
    expect(b.typ).toBe('image/bmp');
    // BMP-Kopf: Dateigröße im Kopf = Länge der Daten
    expect(b.daten[2] | (b.daten[3] << 8) | (b.daten[4] << 16) | (b.daten[5] << 24)).toBe(b.daten.length);
    expect(seitenMasse(k).breite).toBe(700);
    expect(seitenMasse(k).hoehe).toBeGreaterThan(1000);
  });
});
