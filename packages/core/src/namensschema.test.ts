import { describe, expect, it } from 'vitest';
import { createProject } from './model';
import { parseProjectData, serializeProject } from './serialize';
import { dateinameZerlegen, dateinameZerlegenMitStellen, indexVorgesehen, istNummer, kuerzelZu, namensschemaAus, planNummerAus, VORGABE_NAMENSSCHEMA, wirksamesNamensschema } from './namensschema';

describe('Namensschema', () => {
  it('zerlegt Dateinamen nach den Stellen: Code, Phase bzw. Antragsart, Datum, Nummer, Rest', () => {
    expect(dateinameZerlegen('Planung/GP/pdf/HVO GP 261111 GP-04 Grundriss OG.pdf')).toEqual({ code: 'HVO', art: 'GP', datum: '261111', nummer: 'GP-04', rest: 'Grundriss OG' });
    expect(dateinameZerlegen('BS9 BAUA 261110 01 Bauantrag.pdf')).toMatchObject({ art: 'BAUA', nummer: '01', rest: 'Bauantrag' });
    // andere Reihenfolge im Schema
    expect(dateinameZerlegen('261111 HVO GP-04 GP Grundriss.pdf', { reihenfolge: ['datum', 'code', 'nummer', 'art'] })).toMatchObject({ code: 'HVO', art: 'GP', nummer: 'GP-04', datum: '261111' });
    // die Nummer ist optional: ohne Nummer gehört das Wort zur Bezeichnung
    expect(dateinameZerlegen('HVO BAUA 261110 Bauantrag.pdf')).toEqual({ code: 'HVO', art: 'BAUA', datum: '261110', rest: 'Bauantrag' });
    expect(dateinameZerlegen('HVO 261110 BAUA Bauantrag.pdf', { reihenfolge: ['code', 'nummer', 'datum', 'art'] })).toEqual({ code: 'HVO', datum: '261110', art: 'BAUA', rest: 'Bauantrag' });
    // mehrteiliger Projektcode – der längste passende gilt
    expect(dateinameZerlegen('BS 9 BAUA 261111 GP-01 Grundriss EG.pdf', VORGABE_NAMENSSCHEMA, ['BS', 'BS 9'])).toEqual({
      code: 'BS 9',
      art: 'BAUA',
      datum: '261111',
      nummer: 'GP-01',
      rest: 'Grundriss EG',
    });
    expect(dateinameZerlegenMitStellen('BS 9 BAUA 261111 GP-01 Grundriss.pdf', VORGABE_NAMENSSCHEMA, ['BS 9'])).toMatchObject({
      code: 'BS 9',
      stelle: { code: 0, art: 2, datum: 3, nummer: 4 },
      endung: '.pdf',
    });
    expect(['01', '03a', 'GP-04', 'GP01-07', 'AP-03a'].every((w) => istNummer(w))).toBe(true);
    expect(['Bauantrag', '2026', 'BAUA', 'Anlage1', 'Ansicht2', 'Plan-3', 'OG2', 'EG1', '3D', 'GP04'].some((w) => istNummer(w))).toBe(false);
    // mit folgender Bezeichnung auch ohne Trennzeichen bzw. klein
    expect(['GP04', 'gp-04', 'OG2'].every((w) => istNummer(w, true))).toBe(true);
    expect(istNummer('3D', true)).toBe(false);
    // klein geschriebene Plannummer nur, wenn eine Bezeichnung folgt
    expect(dateinameZerlegen('hvo gp 261111 gp-04 grundriss.pdf')).toMatchObject({ nummer: 'gp-04', rest: 'grundriss' });
    expect(dateinameZerlegen('BS9 BAUA 261110 Anlage1.pdf')).toMatchObject({ rest: 'Anlage1' });
    expect(dateinameZerlegen('HVO GP 261111 GP-04.pdf')).toMatchObject({ nummer: 'GP-04', rest: '' });
  });

  it('Plannummern nur mit Plankürzel: GP-01, GP01, Satz GP01-07, Index – eine reine Zahl ist kein Plan', () => {
    expect(planNummerAus('GP-04')).toEqual({ kuerzel: 'GP', von: 4, bis: 4 });
    expect(planNummerAus('gp04')).toEqual({ kuerzel: 'GP', von: 4, bis: 4 });
    expect(planNummerAus('GP01-07')).toEqual({ kuerzel: 'GP', von: 1, bis: 7 });
    expect(planNummerAus('GP-01-GP-07')).toEqual({ kuerzel: 'GP', von: 1, bis: 7 });
    expect(planNummerAus('AP-03a')).toEqual({ kuerzel: 'AP', von: 3, bis: 3, index: 'a' });
    expect(planNummerAus('01')).toBeNull();
    expect(planNummerAus('XY-01')).toBeNull();
    expect(planNummerAus('GP07-01')).toBeNull();
  });

  it('Indizes ab Leistungsphase 5, Synonyme der Antragsarten', () => {
    expect(indexVorgesehen(VORGABE_NAMENSSCHEMA, 'GP')).toBe(false);
    expect(indexVorgesehen(VORGABE_NAMENSSCHEMA, 'AP')).toBe(true);
    expect(kuerzelZu(VORGABE_NAMENSSCHEMA.antragsarten, 'bva')?.kuerzel).toBe('BAUVA');
  });

  it('liest robust, Projektdatei vor Büro vor Vorgabe; als Abschnitt der Projektdatei erhalten', () => {
    expect(namensschemaAus(null)).toBeNull();
    const s = namensschemaAus({ phasen: [{ kuerzel: 'gp', name: 'Genehmigung', lph: 4 }, { kuerzel: 'GP' }, { kuerzel: 'zu lang!' }], reihenfolge: ['code', 'code'], indexAbLph: 99 })!;
    expect(s.phasen).toEqual([{ kuerzel: 'GP', name: 'Genehmigung', lph: 4 }]);
    expect(s.reihenfolge).toEqual(VORGABE_NAMENSSCHEMA.reihenfolge);
    // außerhalb des Bereichs: begrenzt (nicht stillschweigend auf die Vorgabe zurück)
    expect(s.indexAbLph).toBe(9);
    expect(namensschemaAus({ indexAbLph: -2, phasen: [{ kuerzel: 'X', lph: 12 }] })!).toMatchObject({ indexAbLph: 0, phasen: [{ kuerzel: 'X', lph: 9 }] });
    expect(namensschemaAus({ indexAbLph: 'fünf' })!.indexAbLph).toBe(5);
    // Schreibweisen eindeutig: ungültige, doppelte und schon vergebene entfallen; eine Antragsart heißt nie wie eine Phase
    const eindeutig = namensschemaAus({
      phasen: [{ kuerzel: 'GP', synonyme: ['GEN'] }],
      antragsarten: [
        { kuerzel: 'BAUA', synonyme: ['BA', 'ba', 'GP', 'B-A', 'BAUVA'] },
        { kuerzel: 'BAUVA', synonyme: ['BA', 'BVA'] },
        { kuerzel: 'GEN', name: 'kollidiert mit einer Schreibweise der Phase' },
      ],
    })!;
    expect(eindeutig.antragsarten).toEqual([
      { kuerzel: 'BAUA', name: '', synonyme: ['BA'] },
      { kuerzel: 'BAUVA', name: '', synonyme: ['BVA'] },
    ]);
    expect(s.antragsarten).toEqual(VORGABE_NAMENSSCHEMA.antragsarten);
    expect(wirksamesNamensschema(undefined, { indexAbLph: 4 }).indexAbLph).toBe(4);
    expect(wirksamesNamensschema({ indexAbLph: 3 }, { indexAbLph: 4 }).indexAbLph).toBe(3);
    expect(wirksamesNamensschema().phasen.map((p) => p.kuerzel)).toEqual(['BP', 'EP', 'GP', 'AP', 'AB']);

    const p = createProject('X');
    p.namensschema = { ...structuredClone(VORGABE_NAMENSSCHEMA), indexAbLph: 4 };
    expect(parseProjectData(JSON.parse(serializeProject(p))).namensschema?.indexAbLph).toBe(4);
  });
});
