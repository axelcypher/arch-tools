import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { readProjectFile, writeArchive } from '@core/archive';
import { addDatei, createLageplanFlaeche } from '@core/model';
import { rectPoints } from '@core/geometry';
import { massNachweis } from '../massNutzung';
import { projekt } from '../testdaten';
import { buildSampleTemplate, exportDefault, exportWithTemplate } from './excel';
import { buildGrzContext } from './exportData';

async function lesen(data: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  return wb;
}

/** alle Zellinhalte eines Blatts als Text (Formeln als „=…“) */
function texte(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  ws.eachRow((row) =>
    row.eachCell((c) => {
      const v = c.value as unknown;
      if (v && typeof v === 'object' && 'formula' in (v as object)) out.push(`=${(v as { formula: string }).formula}`);
      else if (v !== null && v !== undefined) out.push(String(v));
    }),
  );
  return out;
}

function zeileMit(ws: ExcelJS.Worksheet, text: string): number {
  let r = -1;
  ws.eachRow((row, n) => row.eachCell((c) => r < 0 && c.value === text && (r = n)));
  return r;
}

describe('GRZ-Excel', () => {
  it('Kontext: Kennzahlen, Geschosse, Lageplan und Filter', () => {
    const p = projekt();
    const ctx = buildGrzContext(p, new Date(2026, 8, 30));
    const n = massNachweis(p);
    expect(ctx.scalars['baunvo.fassung']).toBe('BauNVO 1962');
    expect(ctx.scalars['bplan.datum']).toBe('14.03.1967');
    expect(ctx.scalars.grz).toBeCloseTo(n.grz.wert!, 3);
    expect(ctx.scalars['grz.ii']).toBe('');
    expect(ctx.scalars['aufenthalt.titel']).toContain('Aufenthaltsräume');
    expect(ctx.collections.geschoss.map((g) => g.name)).toEqual(['EG', 'OG', 'DG']);
    expect(ctx.collections.geschoss.filter((g) => g.vollgeschoss === 'ja')).toHaveLength(n.vollgeschosse.anzahl);
    expect(ctx.collections.lageplan.map((l) => l.name)).toEqual(['Zufahrt', 'Terrasse']);
    // Zimmer im DG (kein Vollgeschoss) zählt vor 1990 zur Geschossfläche
    expect(ctx.collections.raum.filter((r) => ctx.filters!.gf(r)).map((r) => r.name)).toEqual(['Zimmer I']);
  });

  it('Standardlayout: alle Platzhalter ersetzt, Zeilen je Geschoss, Summen über die erzeugten Zeilen', async () => {
    const p = projekt();
    const wb = await lesen(await exportDefault(p, new Date(2026, 8, 30)));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['GRZ GFZ']);
    const ws = wb.getWorksheet('GRZ GFZ')!;
    const t = texte(ws);
    expect(t.filter((x) => x.includes('{{'))).toEqual([]);
    expect(ws.headerFooter.oddFooter).toContain('GRZ-Test');
    expect(t).toContain('BauNVO 1962');
    const n = massNachweis(p);
    // Kennzahlen als Formeln aus den Zellen (Prüfer können nachrechnen), Ergebnis wie in der App
    const grzZeile = zeileMit(ws, 'GRZ');
    const grz = ws.getCell(grzZeile, 4).value as { formula: string; result: number };
    expect(grz.formula).toBe(`IF(C$12>0,C${grzZeile}/C$12,"–")`);
    expect(grz.result).toBeCloseTo(n.grz.wert!, 6);
    expect(ws.getCell(grzZeile, 5).value).toBe(0.4);
    expect((ws.getCell(grzZeile, 6).value as { formula: string; result: number }).result).toBeCloseTo(0.4 * 612.5, 6);
    expect((ws.getCell(grzZeile, 7).value as { result: string }).result).toBe('eingehalten');
    expect(ws.getCell(grzZeile, 4).numFmt).toBe('0.000');
    // Geschossfläche: drei Geschosszeilen und SUMME darüber
    const gfKopf = zeileMit(ws, 'Ermittlung');
    expect([1, 2, 3].map((i) => ws.getCell(gfKopf + i, 1).value)).toEqual(['EG', 'OG', 'DG']);
    const sum = ws.getCell(gfKopf + 4, 3).value as { formula: string; result: number };
    expect(sum.formula).toBe(`SUM(C${gfKopf + 1}:C${gfKopf + 3})`);
    expect(sum.result).toBeCloseTo(n.gf, 1);
    // Lageplan: nur eigene Flächen
    const lp = zeileMit(ws, 'Anrechnung');
    expect(ws.getCell(lp + 1, 1).value).toBe('Zufahrt');
    expect(ws.getCell(lp + 2, 1).value).toBe('Terrasse');
    // Haftungssatz nicht im Blatt für das Bauamt
    expect(t.some((x) => x.includes('Verantwortung'))).toBe(false);
  });

  it('Lageplan-Summe zählt Überlagerungen einmal (Spalte „eindeutig“), offene Spanne als eigene Zeile', async () => {
    const p = projekt();
    p.massNutzung = { ...p.massNutzung, planDatum: '2020-05-01' };
    // Garten umschließt Zufahrt und Terrasse teilweise (Überlagerung), Terrasse 1990 = „prüfen“
    p.lageplan!.flaechen.push({ ...createLageplanFlaeche(rectPoints({ x: 10, y: 0 }, { x: 20, y: 12 }), 'Garten'), nutzung: 'garten', versiegelung: 'gruen' });
    const n = massNachweis(p);
    const wb = await lesen(await exportDefault(p, new Date(2026, 8, 30)));
    const ws = wb.getWorksheet('GRZ GFZ')!;
    const lp = zeileMit(ws, 'Anrechnung');
    const sumZeile = lp + 1 + p.lageplan!.flaechen.length;
    const sumE = ws.getCell(sumZeile, 4).value as { formula: string; result: number };
    expect(sumE.formula).toBe(`SUM(D${lp + 1}:D${lp + 3})`);
    const eindeutig = n.lageplan.reduce((a, l) => a + l.flaecheEindeutig, 0);
    expect(sumE.result).toBeCloseTo(eindeutig, 1);
    expect(eindeutig).toBeLessThan(n.lageplan.reduce((a, l) => a + l.flaeche, 0) - 1);
    // angerechnet (GR II): Zufahrt voll, Terrasse („prüfen“) und Garten 0 – Summe + Hauptanlage = GR II der Kachel
    const sumA = ws.getCell(sumZeile, 6).value as { result: number };
    expect(sumA.result + n.hauptanlage).toBeCloseTo(n.grz2!.flaeche, 1);
    // offene Spanne
    const offen = zeileMit(ws, 'GRZ II bei Anrechnung offener Flächen');
    expect(offen).toBeGreaterThan(0);
    expect((ws.getCell(offen, 4).value as { result: number }).result).toBeCloseTo(n.grz2!.mitOffenen!, 6);
  });

  it('Rechenweg (G-20): Formelzeile „135,00 m² / 612,50 m²“ und Teilflächen mit Formel Länge × Breite', async () => {
    const p = projekt();
    const wb = await lesen(await exportDefault(p, new Date(2026, 8, 30)));
    const ws = wb.getWorksheet('GRZ GFZ')!;
    const t = texte(ws);
    expect(t).toContain('GRZ = GR / FGst = 135,00 m² / 612,50 m² = 0,220');
    expect(t.some((x) => x.startsWith('GF = EG 135,00 m² + OG 135,00 m² + DG'))).toBe(true);
    const h = zeileMit(ws, 'H.1 Rechteck');
    expect(h).toBeGreaterThan(0);
    const f = ws.getCell(h, 6).value as { formula: string; result: number };
    expect(f.formula).toBe(`C${h}*D${h}*E${h}`);
    expect(f.result).toBeCloseTo(135, 6);
    expect(ws.getCell(h + 1, 2).value).toBe('1.1 Rechteck');
    expect((ws.getCell(h + 1, 6).value as { result: number }).result).toBeCloseTo(30, 6);
  });

  it('Muster-Vorlage mit Hilfeblatt; eigene Vorlage mit Block, Filter und Nachschlagen per Name', async () => {
    const muster = await lesen(await buildSampleTemplate());
    expect(muster.worksheets.map((w) => w.name)).toEqual(['GRZ GFZ', 'Platzhalter']);
    expect(texte(muster.getWorksheet('GRZ GFZ')!)).toContain('{{grz.flaeche}}');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Eigen');
    ws.getCell('A1').value = 'GFZ {{gfz}} bei {{vollgeschosse.roemisch}} Vollgeschossen, EG {{geschoss:EG.gf}} m²';
    ws.getCell('A2').value = '{{#geschoss[!vollgeschoss]}}{{geschoss.name}}';
    ws.getCell('B3').value = '{{raum[aufenthalt].name}}';
    ws.getCell('A4').value = '{{/geschoss}}';
    ws.getCell('A5').value = '{{lageplan[teil].name}}';
    const out = await lesen(await exportWithTemplate(new Uint8Array(await wb.xlsx.writeBuffer()), projekt()));
    const e = out.getWorksheet('Eigen')!;
    expect(String(e.getCell('A1').value)).toMatch(/^GFZ 0,\d+ bei II Vollgeschossen, EG 135 m²$/);
    expect(e.getCell('A2').value).toBe('DG');
    expect(e.getCell('B3').value).toBe('Zimmer I');
    expect(e.getCell('A4').value).toBe('Zufahrt');
  });

  it('Vorlage von TERRIO liegt getrennt von der Vorlage in QUADRIO im Archiv', () => {
    let p = projekt();
    p = addDatei(p, 'Flächen.xlsx', 'vorlage', new Uint8Array([80, 75, 1])).project;
    p = addDatei(p, 'GRZ.xlsx', 'vorlage-grz', new Uint8Array([80, 75, 2])).project;
    p = addDatei(p, 'GRZ neu.xlsx', 'vorlage-grz', new Uint8Array([80, 75, 3])).project;
    const back = readProjectFile(writeArchive(p, { app: 'Test' }));
    expect(back.dateien?.map((d) => `${d.art}:${d.name}`).sort()).toEqual(['vorlage-grz:GRZ neu.xlsx', 'vorlage:Flächen.xlsx']);
  });
});
