import ExcelJS from 'exceljs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { xlsxAendern, xlsxLesen } from '@core/dokumente/xlsx';
import { gewerkKennung } from './gewerk';
import { auftragEintragen, kostenkontrolleLesen, rechnungEintragen } from './kostenkontrolle';

/** Mappe im Aufbau der Kostenkontrolle des Büros (verkleinert, erfundene Werte) */
async function musterMappe(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const rl = wb.addWorksheet('Rechnungsliste');
  rl.getCell('A1').value = 'Rechnungsliste';
  rl.getCell('G1').value = 'P99';
  rl.getCell('G3').value = 'Neubau Musterhaus';
  ['Gewerk', 'Nr.', 'Rechnung', 'Rechn. Datum', 'Freigabe Datum', 'Betrag €', 'Bemerkungen'].forEach((t, i) => (rl.getCell(8, i + 1).value = t));
  const daten: [string, string, Date, number][] = [
    ['G4', 'Rohbau Muster, AB1', new Date(Date.UTC(2025, 8, 15)), 10000],
    ['G08', 'Fenster Muster, AB1', new Date(Date.UTC(2025, 9, 24)), 27824.22],
  ];
  daten.forEach(([g, t, d, b], i) => {
    const z = 10 + i;
    rl.getCell(z, 1).value = g;
    rl.getCell(z, 2).value = i === 0 ? 1 : { formula: `B${z - 1}+1`, result: i + 1 };
    rl.getCell(z, 3).value = t;
    rl.getCell(z, 4).value = d;
    rl.getCell(z, 4).numFmt = 'dd.mm.yyyy';
    rl.getCell(z, 5).value = d;
    rl.getCell(z, 5).numFmt = 'dd.mm.yyyy';
    rl.getCell(z, 6).value = b;
  });
  for (let z = 12; z <= 15; z++) {
    rl.getCell(z, 2).value = { formula: `B${z - 1}+1`, result: z - 9 };
    rl.getCell(z, 4).numFmt = 'dd.mm.yyyy';
  }
  rl.getCell('H20').value = { formula: 'SUM(F:F)', result: 37824.22 };
  const ue = wb.addWorksheet('Übersicht');
  ue.getCell('C8').value = 'Kostenschätzung';
  ue.getCell('F8').value = 'Kostenanschlag';
  ue.getCell('I8').value = 'Kostenfeststellung';
  ue.getCell('A26').value = 'G4';
  ue.getCell('B26').value = 'Rohbauarbeiten';
  ue.getCell('C26').value = 65000;
  ue.getCell('A34').value = 'G8';
  ue.getCell('B34').value = 'Fensterarbeiten';
  ue.getCell('C34').value = 60000;
  ue.getCell('F34').value = { formula: "'G 8'!E15", result: 54269.87 };
  ue.getCell('I34').value = { formula: "'G 8'!E30", result: 27824.22 };
  for (const [name, kennung, an] of [['G4', 'G4', 'Rohbau Muster GmbH'], ['G 8', 'G8', 'Fenster Muster']] as const) {
    const g = wb.addWorksheet(name);
    g.getCell('A1').value = 'Kostenkontrolle Gewerk';
    g.getCell('E1').value = kennung;
    g.getCell('B5').value = 'Gewerk/Kostengruppe';
    g.getCell('E5').value = { formula: `Übersicht!B${kennung === 'G4' ? 26 : 34}`, result: kennung === 'G4' ? 'Rohbauarbeiten' : 'Fensterarbeiten' };
    g.getCell('B6').value = 'Auftragnehmer';
    if (kennung === 'G8') g.getCell('E6').value = an;
    g.getCell('B10').value = 'Kostenschätzung';
    g.getCell('E10').value = 60000;
    g.getCell('C13').value = 'Datum';
    g.getCell('D13').value = 'Einzelsummen €';
    g.getCell('E13').value = 'Gesamtsumme €';
    g.getCell('B15').value = 'Kostenanschlag';
    g.getCell('E15').value = { formula: 'SUM(D16:D25)', result: kennung === 'G8' ? 54269.87 : 0 };
    for (let i = 0; i < 10; i++) g.getCell(16 + i, 1).value = `A${i + 1}`;
    if (kennung === 'G8') {
      g.getCell('B16').value = 'Fenster Muster Auftrag';
      g.getCell('C16').value = new Date(Date.UTC(2025, 6, 3));
      g.getCell('C16').numFmt = 'dd.mm.yyyy';
      g.getCell('D16').value = 54269.87;
    }
    g.getCell('C28').value = 'Datum';
    g.getCell('D28').value = 'Einzelsummen €';
    g.getCell('B30').value = 'Kostenfeststellung';
    g.getCell('E30').value = { formula: 'SUM(D31:D50)', result: kennung === 'G8' ? 27824.22 : 10000 };
    g.getCell('A31').value = kennung === 'G8' ? 2 : 1;
    g.getCell('B31').value = kennung === 'G8' ? 'Fenster Muster, AB1' : 'Rohbau Muster, AB1';
    g.getCell('C31').value = new Date(Date.UTC(2025, 9, 24));
    g.getCell('C31').numFmt = 'dd.mm.yyyy';
    g.getCell('D31').value = kennung === 'G8' ? 27824.22 : 10000;
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('Gewerkkennung', () => {
  it('vereinheitlicht Schreibweisen', () => {
    expect(['G08', 'G8', 'G 8', 'g8 Fenster', 'G1 ', 'G 10'].map(gewerkKennung)).toEqual(['G8', 'G8', 'G8', 'G8', 'G1', 'G10']);
    expect(gewerkKennung('Gewerke')).toBeNull();
  });
});

describe('Kostenkontrolle', () => {
  it('erkennt Rechnungsliste, Gewerkblätter und Übersicht an ihren Beschriftungen', async () => {
    const kk = kostenkontrolleLesen(await musterMappe());
    expect(kk.projekt).toBe('P99');
    expect(kk.rechnungsliste!.rechnungen.map((r) => [r.gewerk, r.nr, r.betrag])).toEqual([
      ['G4', 1, 10000],
      ['G8', 2, 27824.22],
    ]);
    expect(kk.rechnungsliste!.rechnungen[1].datum).toBe('2025-10-24');
    expect(kk.rechnungsliste!.freieZeile).toBe(12);
    expect(kk.rechnungsliste!.naechsteNr).toBe(3);
    const g8 = kk.gewerke.find((g) => g.gewerk === 'G8')!;
    expect(g8.blattName).toBe('G 8');
    expect(g8.auftragnehmer).toBe('Fenster Muster');
    expect(g8.anschlag).toMatchObject({ von: 16, bis: 25, summe: 54269.87 });
    expect(g8.anschlag.eintraege[0]).toMatchObject({ text: 'Fenster Muster Auftrag', datum: '2025-07-03', betrag: 54269.87 });
    expect(g8.feststellung).toMatchObject({ von: 31, bis: 50 });
    expect(kk.uebersicht!.zeilen.find((z) => z.gewerk === 'G8')).toMatchObject({ schaetzung: 60000, anschlag: 54269.87 });
  });

  it('trägt eine Rechnung in Rechnungsliste und Gewerkblatt ein – Summen frisch, Rest unverändert', async () => {
    const bytes = await musterMappe();
    const kk = kostenkontrolleLesen(bytes);
    const r = rechnungEintragen(kk, { gewerk: 'G8', text: 'Fenster Muster, SR1', datum: '2025-10-24', freigabe: '2026-01-22', betrag: 3091.58 });
    expect(r.nr).toBe(3);
    const neu = xlsxAendern(bytes, r.aenderungen, { ergebnisseAuffrischen: true });
    const kk2 = kostenkontrolleLesen(neu);
    const e = kk2.rechnungsliste!.rechnungen[2];
    expect(e).toMatchObject({ zeile: 12, nr: 3, gewerkRoh: 'G4' === e.gewerkRoh ? 'G4' : e.gewerkRoh, text: 'Fenster Muster, SR1', datum: '2025-10-24', freigabe: '2026-01-22', betrag: 3091.58 });
    expect(kk2.rechnungsliste!.naechsteNr).toBe(4);
    const g8 = kk2.gewerke.find((g) => g.gewerk === 'G8')!;
    expect(g8.feststellung.eintraege[1]).toMatchObject({ zeile: 32, nr: 3, text: 'Fenster Muster, SR1', datum: '2025-10-24', betrag: 3091.58 });
    expect(g8.feststellung.summe).toBeCloseTo(30915.8, 6);
    // Übersicht rechnet über das Blatt mit
    const m = xlsxLesen(neu);
    expect(m.blaetter[1].zellen.get('I34')!.wert).toBeCloseTo(30915.8, 6);
    expect(m.blaetter[0].zellen.get('H20')!.wert).toBeCloseTo(40915.8, 6);
  });

  it('trägt Aufträge in den Kostenanschlag ein', async () => {
    const bytes = await musterMappe();
    const kk = kostenkontrolleLesen(bytes);
    const a = auftragEintragen(kk, { gewerk: 'G4', text: 'Rohbau Muster Auftrag', datum: '2025-05-01', betrag: 80995.68, auftragnehmer: 'Rohbau Muster GmbH' });
    const kk2 = kostenkontrolleLesen(xlsxAendern(bytes, a.aenderungen, { ergebnisseAuffrischen: true }));
    const g4 = kk2.gewerke.find((g) => g.gewerk === 'G4')!;
    expect(g4.anschlag.eintraege[0]).toMatchObject({ zeile: 16, text: 'Rohbau Muster Auftrag', betrag: 80995.68, datum: '2025-05-01' });
    expect(g4.anschlag.summe).toBeCloseTo(80995.68, 6);
    expect(g4.auftragnehmer).toBe('Rohbau Muster GmbH');
  });
});

// Echte Kostenkontrolle (nicht eingecheckt): .ref/ im Repository oder KOSTENKONTROLLE_REF
const REF_ORDNER = join(__dirname, '../../../../.ref');
const REF = process.env.KOSTENKONTROLLE_REF ?? (existsSync(REF_ORDNER) ? readdirSync(REF_ORDNER).filter((n) => /kostenkontrolle.*\.xlsx$/i.test(n)).map((n) => join(REF_ORDNER, n))[0] : undefined);

describe.skipIf(!REF || !existsSync(REF))('echte Kostenkontrolle', () => {
  it('liest alle Gewerke und die Rechnungsliste', () => {
    const kk = kostenkontrolleLesen(new Uint8Array(readFileSync(REF!)));
    expect(kk.rechnungsliste!.rechnungen.length).toBeGreaterThan(40);
    expect(kk.gewerke.length).toBeGreaterThan(30);
    for (const g of kk.gewerke) {
      const summe = g.feststellung.eintraege.reduce((s, e) => s + (e.betrag ?? 0), 0);
      if (g.feststellung.summe !== null) expect(summe, g.blattName).toBeCloseTo(g.feststellung.summe, 2);
    }
    const nr = kk.rechnungsliste!.naechsteNr;
    const r = rechnungEintragen(kk, { gewerk: 'G8', text: 'Test, SR4', datum: '2026-11-12', betrag: 100 });
    expect(r.nr).toBe(nr);
  });
});
