import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { computeProject } from '@core/calc';
import { rectPoints } from '@core/geometry';
import { createOutline, createProject, createRoom, createStorey } from '@core/model';
import { defaultDach } from '@core/roof';
import { buildSampleTemplate, exportDefault, exportWithTemplate } from './excel';

function project() {
  const p = createProject('Sanierung EFH Sander');
  p.meta.adresse = { strasse: 'Deiringser Weg 7a', plz: '59494', ort: 'Soest' };
  const kg = p.storeys[0];
  kg.name = 'KG';
  const eg = createStorey('EG', 2.8);
  const dg = createStorey('DG', 2.5);
  p.storeys.push(eg, dg);
  const room = (st: typeof kg, name: string, w: number, h: number, wofl: boolean) => {
    const r = createRoom(rectPoints({ x: 0, y: 0 }, { x: w, y: h }), '', name);
    if (wofl) r.wofl = { kategorie: 'voll', wohnung: 'WE 1' };
    r.putzabzug = 3;
    st.shapes.push(r);
  };
  room(kg, 'Keller', 5, 4, false);
  room(eg, 'Flur', 2, 1.5, true);
  room(eg, 'Küche', 4, 4.5, true);
  room(dg, 'Zimmer I', 3, 3, true);
  kg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
  eg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 })));
  const dgO = createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 8 }));
  dgO.dach = { ...defaultDach('walm', 1), neigung: 40, neigungWalm: 50 };
  dg.shapes.push(dgO);
  return p;
}

async function load(buf: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  return wb;
}

const val = (ws: ExcelJS.Worksheet, a: string) => ws.getCell(a).value as unknown;
const formula = (ws: ExcelJS.Worksheet, a: string) => (ws.getCell(a).value as { formula: string }).formula;

describe('Excel-Export mit Vorlage', () => {
  it('Wohnflächen: Geschossblöcke, Haupt-/Nebenflächen, Summenformeln', async () => {
    const p = project();
    const wb = await load(await exportWithTemplate(await buildSampleTemplate(), p, computeProject(p)));
    const ws = wb.getWorksheet('Wohnflächen')!;
    // Kopf unverändert, Platzhalter ersetzt, Zellverbund erhalten
    expect(val(ws, 'A3')).toBe('Sanierung EFH Sander');
    expect(val(ws, 'A4')).toBe('Deiringser Weg 7a, 59494 Soest');
    expect(val(ws, 'A8')).toBe('Entwurfsplanung');
    expect(ws.getCell('D8').isMerged).toBe(true);
    // Block EG (Steuerzeile entfällt → erste Raumzeile in Zeile 11)
    expect([val(ws, 'A11'), val(ws, 'B11'), val(ws, 'C11')]).toEqual(['EG', 'Flur', 3]);
    expect([val(ws, 'A12'), val(ws, 'B12'), val(ws, 'C12')]).toEqual([null, 'Küche', 18]);
    expect(formula(ws, 'D13')).toBe('SUM(C11:C12)');
    expect([val(ws, 'A15'), val(ws, 'B15'), val(ws, 'C15')]).toEqual(['DG', 'Zimmer I', 9]);
    expect(formula(ws, 'D16')).toBe('SUM(C15:C15)');
    // KG hat keine Wohnfläche → Block entfällt
    expect(val(ws, 'A18')).toBe('Brutto-Wohnflächen gesamt');
    expect(formula(ws, 'D18')).toBe('SUM(D13,D16)');
    expect(formula(ws, 'D19')).toBe('-ROUND(D18*0.03,2)');
    expect(formula(ws, 'D20')).toBe('D18+D19');
    // Ergebnisse sind vorberechnet: 3 + 18 + 9 = 30; 30 − 0,90
    expect((ws.getCell('D18').value as { result: number }).result).toBe(30);
    expect((ws.getCell('D20').value as { result: number }).result).toBeCloseTo(29.1, 9);
    // Nebenflächen: nur KG
    expect([val(ws, 'A23'), val(ws, 'B23'), val(ws, 'C23')]).toEqual(['KG', 'Keller', 20]);
    expect(formula(ws, 'D24')).toBe('SUM(C23:C23)');
    expect(formula(ws, 'D25')).toBe('SUM(D24:D24)');
    // Formatierung aus der Vorlagenzeile
    expect(ws.getCell('C12').numFmt).toBe('#,##0.00 "m²"');
    expect(ws.getCell('A18').font?.bold).toBe(true);
  });

  it('BRI-Rechenweg: Teilkörper ergeben den berechneten BRI', async () => {
    const p = project();
    const res = computeProject(p);
    const wb = await load(await exportWithTemplate(await buildSampleTemplate(), p, res));
    const ws = wb.getWorksheet('BRI Teilkörper')!;
    const rows: { geschoss: string; teil: string; v: number }[] = [];
    let current = '';
    let total: string | null = null;
    ws.eachRow((row, r) => {
      if (r < 11) return;
      const a = row.getCell(1).value;
      const b = row.getCell(2).value;
      const i = row.getCell(9).value as { formula?: string } | null;
      if (typeof a === 'string' && !b) current = a;
      if (a === 'Brutto-Rauminhalt gesamt') total = (i as { formula: string }).formula;
      const n = row.getCell(3).value;
      if (typeof n === 'number' && i?.formula) {
        const v = n * (row.getCell(6).value as number) * (row.getCell(7).value as number) * (row.getCell(8).value as number);
        rows.push({ geschoss: current, teil: String(b), v });
        expect(i.formula).toBe(`C${r}*F${r}*G${r}*H${r}`);
      }
    });
    expect(rows.map((x) => x.teil)).toEqual(['Quader', 'Quader', 'Grundkörper bis Traufe', 'Walmdach: Mittelteil (Dreiecksprisma)', 'Walmdach: Walmende']);
    const sum = rows.reduce((a, x) => a + x.v, 0);
    expect(Math.abs(sum - res.total.bri.total)).toBeLessThan(0.05);
    expect(total).toMatch(/^SUM\(I\d+(,I\d+)+\)$/);
    const totRow = ws.getRows(11, 60)!.find((r) => r.getCell(1).value === 'Brutto-Rauminhalt gesamt')!;
    expect(Math.abs((totRow.getCell(9).value as { result: number }).result - res.total.bri.total)).toBeLessThan(0.05);
  });

  it('BRI: Normalgeschosse Höhe × BGF, Dachgeschoss mit Dachformel', async () => {
    const p = createProject('Sanierung EFH Sander');
    const kg = p.storeys[0];
    kg.name = 'Kellergeschoss I';
    kg.hoehe = 2.4;
    kg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 10, y: 4.869 })));
    const eg = createStorey('Erdgeschoss', 3.45);
    eg.shapes.push(createOutline(rectPoints({ x: 0, y: 0 }, { x: 12, y: 10.75 })));
    const dg = createStorey('DG', 3);
    const dach = createOutline(rectPoints({ x: 0, y: 0 }, { x: 12, y: 10.75 }));
    dach.dach = { ...defaultDach('walm', 0), neigung: 45 };
    dg.shapes.push(dach);
    p.storeys.push(eg, dg);
    const res = computeProject(p);
    const ws = (await load(await exportWithTemplate(await buildSampleTemplate(), p, res))).getWorksheet('BRI')!;
    expect([val(ws, 'B11'), val(ws, 'C11'), val(ws, 'D11'), formula(ws, 'E11')]).toEqual(['Kellergeschoss I', 2.4, 48.69, 'C11*D11']);
    expect([val(ws, 'B12'), val(ws, 'C12'), val(ws, 'D12'), formula(ws, 'E12')]).toEqual(['Erdgeschoss', 3.45, 129, 'C12*D12']);
    expect(formula(ws, 'F13')).toBe('SUM(E11:E12)');
    expect(val(ws, 'A15')).toBe('DG');
    expect(val(ws, 'B16')).toBe('Walmdach');
    expect(val(ws, 'B17')).toBe('H: 5,375 m; B: 10,75 m; L: 12,00 m');
    expect(val(ws, 'D19')).toBe('B × H × (3 × L − B) / 6 =');
    expect(val(ws, 'D20')).toBe('10,75 × 5,375 × (3 × 12 − 10,75) / 6 =');
    expect(val(ws, 'E20')).toBeCloseTo(243.16, 2);
    expect(formula(ws, 'F22')).toBe('SUM(E20:E20)');
    expect(val(ws, 'A24')).toBe('Brutto-Rauminhalt gesamt');
    expect((ws.getCell('F24').value as { result: number }).result).toBeCloseTo(res.total.bri.total, 1);
  });

  it('BRI: Dachgeschoss mit Schleppgaube wie in der Büro-Vorlage', async () => {
    const p = createProject('Sanierung EFH Sander');
    const dg = p.storeys[0];
    dg.name = 'DG';
    const o = createOutline(rectPoints({ x: 0, y: 0 }, { x: 12, y: 10.75 }));
    o.dach = { ...defaultDach('walm', 0), neigung: 45, neigungWalm: 45, gauben: [{ typ: 'schlepp', seite: 0, abstand: 3.9, breite: 4.2, vorne: 0.5, tiefe: 4.115, neigung: 25 }] };
    dg.shapes.push(o);
    const res = computeProject(p);
    const ws = (await load(await exportWithTemplate(await buildSampleTemplate(), p, res))).getWorksheet('BRI')!;
    const rows: unknown[][] = [];
    ws.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
    const text = rows.map((r) => r.filter((v) => v !== null && v !== undefined && typeof v !== 'object').join(' | '));
    expect(text).toContain('Schleppgaube');
    expect(text).toContain('Hauptdach α: 45°; Gaubendach β: 25°; T: 4,115 m; B: 4,20 m');
    expect(text).toContain('B × T² × (tan α − tan β) / 2 =');
    const r = rows.find((x) => x[3] === '4,2 × 4,115² × (tan 45° − tan 25°) / 2 =')!;
    expect(r[4]).toBeCloseTo(18.98, 2);
    const sum = rows.find((x) => x[0] === 'Brutto-Rauminhalt gesamt')!;
    expect((sum[5] as { result: number }).result).toBeCloseTo(res.total.bri.total, 1);
  });

  it('Bedingungsblock: Abschnitt ohne Daten entfällt in der Excel-Datei, Formel darunter rutscht mit', async () => {
    const p = project();
    const tpl = new ExcelJS.Workbook();
    const ws = tpl.addWorksheet('Test');
    ws.getCell('A1').value = '{{#wenn raum[abzug]}}Abzugsflächen';
    ws.getCell('B2').value = '{{raum[abzug].name}}';
    ws.getCell('C2').value = '{{raum[abzug].flaeche}}';
    ws.getCell('A3').value = 'Summe{{/wenn}}';
    ws.getCell('C3').value = { formula: 'SUM(C2:C2)' };
    ws.getCell('A4').value = '{{#wenn !raum[abzug]}}keine Abzugsflächen{{/wenn}}';
    ws.getCell('A5').value = 'Ende';
    ws.getCell('C5').value = { formula: 'C3+1' };
    const wb = await load(await exportWithTemplate(new Uint8Array(await tpl.xlsx.writeBuffer()), p, computeProject(p)));
    const out = wb.getWorksheet('Test')!;
    expect(out.getCell('A1').value).toBe('keine Abzugsflächen');
    expect(out.getCell('A2').value).toBe('Ende');
    expect((out.getCell('C2').value as { formula: string }).formula).toBe('0+1');
  });

  it('ersetzt Platzhalter in Kopf- und Fußzeile', async () => {
    const tpl = new ExcelJS.Workbook();
    const ws0 = tpl.addWorksheet('Kopf');
    ws0.getCell('A1').value = '{{projekt.name}}';
    ws0.headerFooter.oddHeader = '&L&"Arial,Fett"{{projekt.name}}&RProjekt {{projekt.code}}';
    ws0.headerFooter.oddFooter = '&LStand {{datum}} · BRI {{summe.bri}} m³ · {{gibtsnicht}}&RSeite &P/&N';
    const p = project();
    p.meta.projektcode = 'A&B 42';
    const wb = await load(await exportWithTemplate(new Uint8Array(await tpl.xlsx.writeBuffer()), p, computeProject(p), new Date(2026, 8, 28)));
    const hf = wb.getWorksheet('Kopf')!.headerFooter;
    expect(hf.oddHeader).toBe('&L&"Arial,Fett"Sanierung EFH Sander&RProjekt A&&B 42');
    expect(hf.oddFooter).toMatch(/^&LStand 28\.9\.2026 · BRI [\d.,]+ m³ · \{\{gibtsnicht\}\}&RSeite &P\/&N$/);
  });

  it('Wohnflächen: Abschnitt Nebenflächen nur, wenn es welche gibt', async () => {
    const p = project();
    p.storeys[0].shapes = p.storeys[0].shapes.filter((s) => s.kind !== 'room'); // Keller war die einzige Nebenfläche
    const wb = await load(await exportWithTemplate(await buildSampleTemplate(), p, computeProject(p)));
    const ws = wb.getWorksheet('Wohnflächen')!;
    const texte: unknown[] = [];
    ws.eachRow((row) => row.eachCell((c) => texte.push(c.value)));
    expect(texte).toContain('Netto-Wohnflächen gesamt');
    expect(texte).not.toContain('Neben-Nutzflächen');
    expect(texte).not.toContain('Brutto-Nebenflächen gesamt');
    expect(texte.filter((t) => typeof t === 'string' && t.includes('{{'))).toEqual([]);
  });

  it('BGF: Teilflächen je Geschoss mit Zwischen- und Gesamtsumme', async () => {
    const p = project();
    p.storeys[1].shapes.push({ ...createOutline(rectPoints({ x: 10, y: 0 }, { x: 13, y: 2 }), 'Wintergarten'), umschliessung: 'S' });
    p.storeys.push(createStorey('Spitzboden', 1.5)); // ohne BGF → Block entfällt
    const wb = await load(await exportWithTemplate(await buildSampleTemplate(), p, computeProject(p)));
    const ws = wb.getWorksheet('BGF')!;
    const zeile = (r: number) => [1, 2, 3, 4].map((c) => {
      const v = ws.getCell(r, c).value as unknown;
      return v && typeof v === 'object' && 'formula' in v ? `=${(v as { formula: string }).formula}` : v;
    });
    expect([11, 12, 13, 14, 15, 16, 17, 18].map(zeile)).toEqual([
      ['KG', 'BGF', 80, null],
      [null, null, null, '=SUM(C11:C11)'],
      ['EG', 'BGF', 80, null],
      [null, 'Wintergarten', 6, null],
      [null, null, null, '=SUM(C13:C14)'],
      ['DG', 'BGF', 80, null],
      [null, null, null, '=SUM(C16:C16)'],
      ['Bruttogrundfläche gesamt', null, null, '=SUM(D12,D15,D17)'],
    ]);
    expect((ws.getCell('D18').value as { result: number }).result).toBe(246);
  });

  it('erzeugt das Standardlayout inkl. BRI-Rechenweg', async () => {
    const p = project();
    const wb = await load(await exportDefault(p, computeProject(p)));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['DIN 277', 'BGF-Teilflächen', 'NRF Nutzungsgruppen', 'Raumliste', 'Wohnflächen', 'BRI-Rechenweg']);
    const ws = wb.getWorksheet('DIN 277')!;
    expect(ws.getCell('A6').value).toBe('KG');
    expect(ws.getCell('E6').value).toBe(80);
    const teile = wb.getWorksheet('BGF-Teilflächen')!;
    expect([1, 2, 3, 4, 5, 6, 7].map((c) => teile.getCell(6, c).value)).toEqual(['KG', 1, 'BGF', 'R', 10, 8, 80]);
    expect(teile.getCell('A9').value).toBe('Summe');
    expect(formula(teile, 'G9')).toBe('SUM(G6:G8)');
    const bri = wb.getWorksheet('BRI-Rechenweg')!;
    expect(bri.getCell('C6').value).toBe('Quader');
    expect(formula(bri, 'J6')).toBe('D6*G6*H6*I6');
  });
});
