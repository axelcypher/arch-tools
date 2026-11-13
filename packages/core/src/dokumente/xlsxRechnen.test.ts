import ExcelJS from 'exceljs';
import { strToU8, zipSync } from 'fflate';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ZellInhalt } from './xlsx';
import { datumZuExcel, rechenMappe, stilIstDatum, xlsxAendern, xlsxLesen } from './xlsx';
import { formelVerschieben, mappeBerechnen } from './xlsxRechnen';

async function mappe(bauen: (wb: ExcelJS.Workbook) => void): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  bauen(wb);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('Formeln nachrechnen', () => {
  it('verschiebt geteilte Formeln nur in relativen Bezügen', () => {
    expect(formelVerschieben('B10+1', 1, 0)).toBe('B11+1');
    expect(formelVerschieben('$B$10+B$10+$B10', 2, 1)).toBe('$B$10+C$10+$B12');
    expect(formelVerschieben("'G 8'!E15+\"A1\"", 3, 0)).toBe("'G 8'!E18+\"A1\"");
    expect(formelVerschieben('SUM(D16:D25)', 15, 0)).toBe('SUM(D31:D40)');
  });

  it('rechnet über Blätter, mit ganzen Spalten und TODAY', () => {
    const heute = new Date(2026, 10, 12);
    const m = new Map([
      [
        'Rechnungsliste',
        new Map([
          ['1:6', { wert: 100, formel: null }],
          ['2:6', { wert: 50.5, formel: null }],
          ['3:6', { wert: 'Text', formel: null }],
          ['5:8', { wert: 0, formel: 'SUM(F:F)' }],
          ['6:7', { wert: 0, formel: 'TODAY()' }],
        ]),
      ],
      [
        'G 8',
        new Map([
          ['15:5', { wert: 0, formel: 'SUM(D16:D25)' }],
          ['16:4', { wert: 1000, formel: null }],
          ['17:4', { wert: 234.5, formel: null }],
        ]),
      ],
      ['Übersicht', new Map([['34:6', { wert: 0, formel: "'G 8'!E15/Rechnungsliste!H5" }]])],
    ]);
    const e = mappeBerechnen(m, heute);
    expect(e.get('Rechnungsliste')!.get('5:8')).toBe(150.5);
    expect(e.get('Rechnungsliste')!.get('6:7')).toBe(datumZuExcel(heute));
    expect(e.get('G 8')!.get('15:5')).toBe(1234.5);
    expect(e.get('Übersicht')!.get('34:6')).toBeCloseTo(1234.5 / 150.5, 10);
  });

  it('unbekannte Funktionen bleiben ohne Ergebnis, Kreisbezüge brechen ab', () => {
    const m = new Map([
      [
        'A',
        new Map([
          ['1:1', { wert: 7, formel: 'VLOOKUP(1,B1:C3,2)' }],
          ['2:1', { wert: 0, formel: 'A3+1' }],
          ['3:1', { wert: 0, formel: 'A2+1' }],
          ['4:1', { wert: 0, formel: 'IF(A5>5,"groß","klein")' }],
          ['5:1', { wert: 7, formel: null }],
        ]),
      ],
    ]);
    const e = mappeBerechnen(m);
    expect(e.get('A')?.has('1:1')).toBeFalsy();
    expect(e.get('A')?.has('2:1')).toBeFalsy();
    expect(e.get('A')!.get('4:1')).toBe('groß');
  });
});

describe('Zellen mit Typ schreiben', () => {
  it('schreibt Datum, Zahl und Text, frischt Summen auf und bewahrt den Stil', async () => {
    const bytes = await mappe((wb) => {
      const ws = wb.addWorksheet('Liste');
      ws.getCell('A1').value = 'Nr';
      ws.getCell('B2').value = 1;
      ws.getCell('B3').value = { formula: 'B2+1', result: 2 };
      ws.getCell('C2').value = new Date(Date.UTC(2025, 9, 24));
      ws.getCell('C2').numFmt = 'dd.mm.yyyy';
      ws.getCell('C3').numFmt = 'dd.mm.yyyy';
      ws.getCell('D2').value = 100;
      ws.getCell('D3').numFmt = '#,##0.00';
      ws.getCell('D10').value = { formula: 'SUM(D2:D9)', result: 100 };
      const g = wb.addWorksheet('G 8');
      g.getCell('E15').value = { formula: "Liste!D10*2", result: 200 };
    });
    const neu = xlsxAendern(
      bytes,
      new Map([[0, new Map<string, string | ZellInhalt>([
        ['C3', { datum: '2025-10-27' }],
        ['D3', { zahl: 5418.8 }],
        ['E3', { text: 'Witthaut, AB2' }],
      ])]]),
      { ergebnisseAuffrischen: true },
    );
    const m = xlsxLesen(neu);
    const liste = m.blaetter[0];
    expect(liste.zellen.get('C3')!.anzeige).toBe('27.10.2025');
    expect(stilIstDatum(m.stile, liste.zellen.get('C3')!.stil)).toBe(true);
    expect(liste.zellen.get('D3')!.wert).toBe(5418.8);
    expect(liste.zellen.get('E3')!.wert).toBe('Witthaut, AB2');
    expect(liste.zellen.get('D10')!.wert).toBeCloseTo(5518.8, 6);
    expect(m.blaetter[1].zellen.get('E15')!.wert).toBeCloseTo(11037.6, 6);
    // ExcelJS liest die Datei wieder
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(neu as unknown as ArrayBuffer);
    expect(wb.getWorksheet('Liste')!.getCell('E3').value).toBe('Witthaut, AB2');
  });

  it('schreibt geteilte Formeln aus, wenn ihre Hauptzelle geändert wird', () => {
    // geteilte Formel von Hand (ExcelJS schreibt keine)
    const blatt = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="B1"><v>1</v></c></row><row r="2"><c r="B2"><f t="shared" ref="B2:B4" si="0">B1+1</f><v>2</v></c></row><row r="3"><c r="B3"><f t="shared" si="0"/><v>3</v></c></row><row r="4"><c r="B4"><f t="shared" si="0"/><v>4</v></c></row></sheetData></worksheet>`;
    const bytes = minimaleMappe(blatt);
    const m = xlsxLesen(bytes);
    expect(m.blaetter[0].zellen.get('B4')!.formel).toBe('B3+1');
    const neu = xlsxAendern(bytes, new Map([[0, new Map([['B2', '10']])]]), { ergebnisseAuffrischen: true });
    const m2 = xlsxLesen(neu);
    expect(m2.blaetter[0].zellen.get('B3')!.formel).toBe('B2+1');
    expect(m2.blaetter[0].zellen.get('B3')!.geteilt).toBeUndefined();
    expect(m2.blaetter[0].zellen.get('B4')!.wert).toBe(12);
  });
});

/** kleinste gültige Mappe mit einem Blatt (für Fälle, die ExcelJS nicht schreibt) */
function minimaleMappe(blattXml: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tabelle1" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(blattXml),
  });
}

// Echte Kostenkontrolle (Kundendaten, nicht eingecheckt): KOSTENKONTROLLE_REF=/pfad/zur/datei.xlsx
const REF = process.env.KOSTENKONTROLLE_REF;
describe.skipIf(!REF || !existsSync(REF))('echte Mappe', () => {
  it('rechnet alle Formeln wie Excel', () => {
    const m = xlsxLesen(new Uint8Array(readFileSync(REF!)));
    const e = mappeBerechnen(rechenMappe(m), new Date(2026, 10, 9));
    let geprueft = 0;
    for (const b of m.blaetter) {
      for (const z of b.zellen.values()) {
        if (!z.formel || typeof z.wert !== 'number') continue;
        const v = e.get(b.name)?.get(`${z.zeile}:${z.spalte}`);
        expect(v, `${b.name}!${z.r} = ${z.formel}`).toBeCloseTo(z.wert, 6);
        geprueft++;
      }
    }
    expect(geprueft).toBeGreaterThan(500);
  });
});
