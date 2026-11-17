import { describe, expect, it } from 'vitest';
import { ausAlten, EXPORT_APPS, gemeinsamSpeicher, gruppeLesen, VORGABE_BERECHNUNGSORDNER, VORGABE_EXPORT_DATEINAME, wirksamFuer, type ExportApp, type ExportGruppe } from './gemeinsam';
import { pfadWerteAus } from './pfade';

/** Gemeinsame Angaben des direkten Exports: Übernahme der bisherigen Werte je App ohne Verlust, ältere Versionen lesen weiter */

const je = (q: string, t: string, n: string): Record<ExportApp, string> => ({ flaechenrechner: q, grz: t, kosten: n });
/** was bisher galt: der Wert unter dem alten Schlüssel, sonst die bisherige Vorgabe */
const bisher = (g: ExportGruppe, pfade: Record<string, string>, app: ExportApp) => {
  const k = g === 'ordner' ? `export.berechnungsordner.${app}` : `export.${g}.${app}`;
  return pfade[k]?.trim() || (g === 'ordner' ? VORGABE_BERECHNUNGSORDNER[app] : VORGABE_EXPORT_DATEINAME);
};

describe('Gemeinsame Angaben: Übernahme der bisherigen Werte je App', () => {
  it('gleiche Werte werden die gemeinsame Angabe, ohne Abweichungen', () => {
    expect(ausAlten('ordner', je('Berechnungen', 'Berechnungen', 'Berechnungen'))).toEqual({ gemeinsam: 'Berechnungen', je: je('', '', '') });
    expect(ausAlten('excel', je('X {Inhalt}', 'X {Inhalt}', 'X {Inhalt}'))).toEqual({ gemeinsam: 'X {Inhalt}', je: je('', '', '') });
  });

  it('Ordner: gemeinsam der längste gemeinsame Anfang, je App der Rest – ohne gemeinsamen Anfang der Projektordner', () => {
    expect(ausAlten('ordner', VORGABE_BERECHNUNGSORDNER)).toEqual({ gemeinsam: '03 Berechnungen', je: je('Flächen', 'Nachweise', 'Kosten') });
    expect(ausAlten('ordner', je('A/B/C', 'A/B', 'A\\B\\D'))).toEqual({ gemeinsam: 'A/B', je: je('C', '', 'D') });
    expect(ausAlten('ordner', je('Flächen', 'Nachweise', 'Kosten'))).toEqual({ gemeinsam: '', je: je('Flächen', 'Nachweise', 'Kosten') });
  });

  it('Namen: der häufigste Wert wird gemeinsam, die übrigen sichtbare Abweichungen; bei Gleichstand der erste', () => {
    expect(ausAlten('pdf', je('A', 'B', 'B'))).toEqual({ gemeinsam: 'B', je: je('A', '', '') });
    expect(ausAlten('pdf', je('A', 'B', 'C'))).toEqual({ gemeinsam: 'A', je: je('', 'B', 'C') });
  });

  // bisherige Einstellungen, wie sie in allgemein.pfade stehen können
  const FAELLE: Record<string, string>[] = [
    {},
    { 'export.berechnungsordner.grz': '03 Berechnungen/{PROJEKT_KUERZEL} GRZ' },
    { 'export.berechnungsordner.flaechenrechner': 'Ber', 'export.berechnungsordner.grz': 'Ber', 'export.berechnungsordner.kosten': 'Ber' },
    { 'export.berechnungsordner.flaechenrechner': 'X/Flächen', 'export.berechnungsordner.kosten': 'Kosten' },
    { 'export.berechnungsordner.flaechenrechner': '' },
    { 'export.excel.kosten': '{PROJEKT_KUERZEL} Kosten', 'export.pdf.grz': 'GRZ {DATUM}', 'export.pdf.kosten': 'GRZ {DATUM}' },
    { 'export.excel.flaechenrechner': 'A', 'export.excel.grz': 'B', 'export.excel.kosten': 'C', 'export.pdf.flaechenrechner': 'A' },
  ];

  it('nichts geht verloren: jede App exportiert danach in denselben Ordner und unter demselben Namen wie vorher', () => {
    for (const pfade of FAELLE)
      for (const g of ['ordner', 'excel', 'pdf'] as const) {
        const w = gruppeLesen(g, pfade);
        for (const app of EXPORT_APPS) expect(wirksamFuer(g, w, app), `${JSON.stringify(pfade)} ${g} ${app}`).toBe(bisher(g, pfade, app).replace(/\\/g, '/'));
      }
  });

  it('das Verzeichnis zeigt die übernommenen Werte (pfadWerteAus): gemeinsam und je App', () => {
    const w = pfadWerteAus({ allgemein: { pfade: { 'export.berechnungsordner.grz': '03 Berechnungen/{PROJEKT_KUERZEL} GRZ', 'export.excel.kosten': 'K' } } });
    // gemeinsamer Ordner bleibt die Vorgabe, TERRIO bekommt seinen Unterordner; NUMIO weicht beim Excel-Namen ab
    expect(w['export.berechnungsordner']).toBeUndefined();
    expect(w['export.unterordner.grz']).toBe('{PROJEKT_KUERZEL} GRZ');
    expect(w['export.unterordner.flaechenrechner']).toBeUndefined();
    expect(w['export.excel']).toBeUndefined();
    expect(w['export.excel.abweichend.kosten']).toBe('K');
  });
});

describe('Gemeinsame Angaben: Schreiben', () => {
  it('schreibt die neuen Schlüssel und für ältere Versionen die wirksamen Werte je App unter die bisherigen', () => {
    const roh = gemeinsamSpeicher('ordner').schreiben({ buero: 'B', pfade: { andere: 1 } }, 'Ber');
    expect(roh).toEqual({
      buero: 'B',
      pfade: {
        andere: 1,
        'export.berechnungsordner': 'Ber',
        'export.berechnungsordner.flaechenrechner': 'Ber/Flächen',
        'export.berechnungsordner.grz': 'Ber/Nachweise',
        'export.berechnungsordner.kosten': 'Ber/Kosten',
      },
    });
    // NUMIO direkt in den gemeinsamen Ordner
    const roh2 = gemeinsamSpeicher('ordner', 'kosten').schreiben(roh, '');
    expect((roh2.pfade as Record<string, string>)['export.unterordner.kosten']).toBe('');
    expect((roh2.pfade as Record<string, string>)['export.berechnungsordner.kosten']).toBe('Ber');
    // zurück zu den Vorgaben: kein Eintrag mehr (auch nicht unter den bisherigen Schlüsseln)
    const zurueck = gemeinsamSpeicher('ordner', 'kosten').schreiben(gemeinsamSpeicher('ordner').schreiben(roh2, undefined), undefined);
    expect(zurueck).toEqual({ buero: 'B', pfade: { andere: 1 } });
  });

  it('beim ersten Schreiben nach der Übernahme bleibt alles Übrige, wie es galt', () => {
    const vorher = { 'export.excel.flaechenrechner': 'A', 'export.excel.grz': 'B', 'export.excel.kosten': 'B' };
    const roh = gemeinsamSpeicher('excel', 'flaechenrechner').schreiben({ pfade: vorher }, 'A2');
    const w = gruppeLesen('excel', roh.pfade as Record<string, unknown>);
    expect(EXPORT_APPS.map((a) => wirksamFuer('excel', w, a))).toEqual(['A2', 'B', 'B']);
    expect(w).toEqual({ gemeinsam: 'B', je: je('A2', '', '') });
  });
});
