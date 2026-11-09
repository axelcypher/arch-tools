import ExcelJS from 'exceljs';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { docxAendern, docxLesen } from './docx';
import { adresse, alsZahl, formatieren, spaltenName, xlsxAendern, xlsxLesen } from './xlsx';
import { ersetzen, xmlLesen } from './xml';

async function mappe(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Flächen');
  ws.getCell('A1').value = 'Raum';
  ws.getCell('A1').font = { bold: true };
  ws.getCell('B1').value = 'Fläche';
  ws.getCell('A2').value = 'Wohnen';
  ws.getCell('B2').value = 24.5;
  ws.getCell('B2').numFmt = '0.00';
  ws.getCell('A3').value = 'Küche';
  ws.getCell('B3').value = 10;
  ws.getCell('B4').value = { formula: 'SUM(B2:B3)', result: 34.5 };
  ws.getCell('C5').value = new Date(Date.UTC(2026, 10, 9));
  ws.getCell('C5').numFmt = 'dd.mm.yyyy';
  ws.mergeCells('A6:B6');
  ws.getColumn(1).width = 20;
  wb.addWorksheet('Leer');
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('XML', () => {
  it('kennt die Lage jedes Elements und ersetzt gezielt', () => {
    const q = '<?xml version="1.0"?><a x="1 &amp; 2"><b>T&lt;ext</b><c/><!-- k --></a>';
    const a = xmlLesen(q).kinder[0];
    expect(a.attr.x).toBe('1 & 2');
    const [b, c] = a.kinder;
    expect(b.text).toBe('T<ext');
    expect(q.slice(b.innenStart, b.innenEnde)).toBe('T&lt;ext');
    expect(q.slice(c.start, c.ende)).toBe('<c/>');
    expect(ersetzen(q, [{ start: b.innenStart, ende: b.innenEnde, text: 'neu' }])).toBe('<?xml version="1.0"?><a x="1 &amp; 2"><b>neu</b><c/><!-- k --></a>');
    expect(() => xmlLesen('<a><b></a>')).toThrow();
  });
});

describe('Excel', () => {
  it('Adressen, deutsche Zahlen, Formate', () => {
    expect(spaltenName(28)).toBe('AB');
    expect(adresse('AB12')).toEqual({ zeile: 12, spalte: 28 });
    expect(alsZahl('1.234,5')).toBe(1234.5);
    expect(alsZahl('12,75')).toBe(12.75);
    expect(alsZahl('3.5')).toBe(3.5);
    expect(alsZahl('1.000')).toBe(1000);
    expect(alsZahl('12 m²')).toBeNull();
    expect(formatieren(24.5, '0.00')).toBe('24,50');
    expect(formatieren(0.256, '0.0%')).toBe('25,6 %');
    expect(formatieren(1234.5, '#,##0.00')).toBe('1.234,50');
    expect(formatieren(46335, 'dd.mm.yyyy')).toBe('09.11.2026');
  });

  it('liest Werte, Formeln, Formate, verbundene Zellen und Breiten', async () => {
    const m = xlsxLesen(await mappe());
    expect(m.blaetter.map((b) => b.name)).toEqual(['Flächen', 'Leer']);
    const b = m.blaetter[0];
    expect(b.zellen.get('A1')!.anzeige).toBe('Raum');
    expect(m.stile[b.zellen.get('A1')!.stil].fett).toBe(true);
    expect(b.zellen.get('B2')!.anzeige).toBe('24,50');
    expect(b.zellen.get('B2')!.eingabe).toBe('24,5');
    expect(b.zellen.get('B4')!).toMatchObject({ formel: 'SUM(B2:B3)', eingabe: '=SUM(B2:B3)', anzeige: '34,5' });
    expect(b.zellen.get('C5')!.anzeige).toBe('09.11.2026');
    expect(b.zusammen).toEqual([{ z1: 6, s1: 1, z2: 6, s2: 2 }]);
    expect(b.breiten.get(1)).toBe(20);
  });

  it('ändert nur die bearbeiteten Zellen; neue Zellen und Zeilen werden einsortiert, Excel rechnet neu', async () => {
    const vorher = await mappe();
    const neu = xlsxAendern(
      vorher,
      new Map([
        [
          0,
          new Map([
            ['B3', '12,25'],
            ['A2', 'Wohnen & Essen'],
            ['C2', 'neu'],
            ['A9', 'Summe'],
            ['B9', '=B4*2'],
            ['A1', ''],
          ]),
        ],
      ]),
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(neu as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Flächen')!;
    expect(ws.getCell('B3').value).toBe(12.25);
    expect(ws.getCell('A2').value).toBe('Wohnen & Essen');
    expect(ws.getCell('C2').value).toBe('neu');
    expect(ws.getCell('A9').value).toBe('Summe');
    expect((ws.getCell('B9').value as { formula: string }).formula).toBe('B4*2');
    expect(ws.getCell('A1').value).toBeNull();
    // Stil der geänderten Zelle bleibt
    expect(ws.getCell('B2').numFmt).toBe('0.00');
    expect(xlsxLesen(neu).blaetter[0].zellen.get('A1')!.stil).toBe(xlsxLesen(vorher).blaetter[0].zellen.get('A1')!.stil);

    const a = unzipSync(vorher);
    const b = unzipSync(neu);
    expect(new TextDecoder().decode(b['xl/workbook.xml'])).toContain('fullCalcOnLoad="1"');
    // alle anderen Teile unverändert
    for (const k of Object.keys(a)) if (!['xl/worksheets/sheet1.xml', 'xl/workbook.xml', 'xl/calcChain.xml', '[Content_Types].xml', 'xl/_rels/workbook.xml.rels'].includes(k)) expect(b[k], k).toEqual(a[k]);
  });
});

/* ---------- Word ---------- */

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
function dokument(body: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`),
    'word/styles.xml': strToU8('<w:styles/>'),
  });
}

describe('Word', () => {
  const body =
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:jc w:val="center"/></w:pPr><w:r><w:t>Baubeschreibung</w:t></w:r></w:p>' +
    '<w:p><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>Bauherr:</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve"> Max </w:t></w:r><w:hyperlink><w:r><w:t>Link</w:t></w:r></w:hyperlink></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Zelle</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t/></w:r></w:p></w:tc></w:tr></w:tbl>';

  it('liest Absätze, Läufe mit Format, Tabellen', () => {
    const d = docxLesen(dokument(body));
    expect(d.texte).toEqual(['Baubeschreibung', 'Bauherr:', ' Max ', 'Link', 'Zelle', '']);
    const [h, p, t] = d.bloecke;
    expect(h).toMatchObject({ art: 'absatz', ausrichtung: 'center', ebene: 1 });
    expect(p.art === 'absatz' && p.laeufe.map((l) => [l.art, l.text, l.fett, l.groesse])).toEqual([
      ['text', 'Bauherr:', true, 12],
      ['tab', '\t', false, null],
      ['text', ' Max ', false, null],
      ['text', 'Link', false, null],
    ]);
    expect(t.art === 'tabelle' && t.zeilen[0].length).toBe(2);
  });

  it('ändert nur die Textstücke; Leerzeichen am Rand bleiben erhalten', () => {
    const vorher = dokument(body);
    const neu = docxAendern(
      vorher,
      new Map([
        [0, 'Baubeschreibung <Entwurf> & mehr'],
        [1, ' Bauherrin:'],
        [5, 'gefüllt'],
      ]),
    );
    const d = docxLesen(neu);
    expect(d.texte).toEqual(['Baubeschreibung <Entwurf> & mehr', ' Bauherrin:', ' Max ', 'Link', 'Zelle', 'gefüllt']);
    const xml = new TextDecoder().decode(unzipSync(neu)['word/document.xml']);
    expect(xml).toContain('<w:t xml:space="preserve"> Bauherrin:</w:t>');
    expect(xml).toContain('<w:rPr><w:b/><w:sz w:val="24"/></w:rPr>');
    const a = unzipSync(vorher);
    const b = unzipSync(neu);
    for (const k of Object.keys(a)) if (k !== 'word/document.xml') expect(b[k]).toEqual(a[k]);
  });
});
