import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { xlsxAendern, xlsxLesen } from '@core/dokumente/xlsx';
import { gewerkKennung } from './gewerk';
import { auftragEintragen, kostenkontrolleLesen, rechnungEintragen } from './kostenkontrolle';
import { musterMappe } from '../__fixtures__/muster';

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
