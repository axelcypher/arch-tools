/** Testdaten: erfundene Mappe im Aufbau der Kostenkontrolle des Büros (keine Kundendaten) */

import ExcelJS from 'exceljs';

/** Mappe im Aufbau der Kostenkontrolle des Büros (verkleinert, erfundene Werte) */
export async function musterMappe(): Promise<Uint8Array> {
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


/** LV mit zwei Abschnitten, Bedarfsposition, Hinweis, Kostenansatz und drei Bietern (erfundene Werte) */
export function musterLv(): import('../lv/modell').Lv {
  const id = () => Math.random().toString(36).slice(2, 10);
  const pos = (oz: string, kurztext: string, einheit: string, menge: number, ka: number, b: [number, number, number], extra: Record<string, unknown> = {}) => ({
    id: id(),
    art: 'position' as const,
    oz,
    kurztext,
    langtext: [{ laeufe: [{ text: `${kurztext} liefern und fachgerecht einbauen.` }] }, { laeufe: [] }, { laeufe: [{ text: 'Fabrikat: ' }, { text: 'nach Wahl des AN', fett: true }] }],
    einheit,
    menge,
    positionsart: 'normal' as const,
    kostengruppe: '334',
    preise: { '0': { ep: ka }, '10': { ep: b[0] }, '11': { ep: b[1] }, '12': { ep: b[2] } },
    ...extra,
  });
  return {
    kopf: { bezeichnung: 'G08 Fensterarbeiten', nummer: '8', datum: '2025-03-17', eroeffnung: '2025-04-07T11:00', bindefrist: '2025-06-30', vergabeart: 'Freihändige Vergabe', projektName: 'Neubau Musterhaus', projekt: 'Neubau Musterhaus\nMusterweg 1\n12345 Musterstadt', auftraggeber: 'Erika Muster\nMusterweg 1\n12345 Musterstadt', waehrung: 'EUR', mwst: 19, kostengliederung: 'din276-08' },
    ozMaske: { ebenen: [{ name: 'Abschnitt', stellen: 2, schritt: 1, aktiv: true }, { name: 'Titel', stellen: 2, schritt: 1, aktiv: false }, { name: '', stellen: 2, schritt: 1, aktiv: false }, { name: '', stellen: 2, schritt: 1, aktiv: false }], position: { stellen: 4, schritt: 10 } },
    preisanteile: ['Löhne', 'Stoffe', 'Geräte', 'Sonstige'],
    bieter: [{ id: 0, name: 'Kostenansatz LV' }, { id: 10, name: 'Fenster Muster GmbH', nachlass: -2 }, { id: 11, name: 'Beispiel Fensterbau' }, { id: 12, name: 'Holz & Glas KG' }],
    elemente: [
      { id: id(), art: 'hinweis', vorbemerkung: true, kurztext: 'Vorbemerkungen', langtext: [{ laeufe: [{ text: 'Alle für die Ausführung in Frage kommenden Normen und Vorschriften sind einzuhalten.' }] }] },
      { id: id(), art: 'abschnitt', oz: '01', kurztext: 'Baustelleneinrichtung', langtext: [], kinder: [pos('0010', 'Baustelleneinrichtung für eigene Arbeiten', 'psch', 1, 500, [450, 800, 600])] },
      {
        id: id(),
        art: 'abschnitt',
        oz: '02',
        kurztext: 'Fenster und Fenstertüren',
        langtext: [],
        kinder: [
          pos('0010', 'Kunststofffenster 1-flg., 1250 x 1375 mm', 'Stck', 6, 740, [712.5, 790, 1020]),
          pos('0020', 'Kunststofffenster 2-flg., 1875 x 1375 mm', 'Stck', 4, 1150, [1095, 1210, 1180]),
          pos('0030', 'Fenstertür 1-flg., 1010 x 2260 mm', 'Stck', 2, 1412, [1412.25, 1500, 1390]),
          pos('0040', 'Fensterlüfter, schallgedämmt', 'Stck', 6, 29, [29, 35, 48], { positionsart: 'bedarf' }),
          { id: id(), art: 'hinweis' as const, kurztext: 'Hinweis zur Abrechnung', langtext: [{ laeufe: [{ text: 'Abgerechnet wird nach Stückzahl.' }] }] },
          pos('0050', 'Fensterbank innen, Kunststoff', 'm', 18.5, 39, [33.4, 38, 42]),
        ],
      },
    ],
    einbehalte: [],
    auftrag: null,
    nachtraege: [],
  };
}
