import { describe, expect, it } from 'vitest';
import { artDerFassung, fassungAus, fassungsName, gleicheFassung } from './fassung';
import { alleKuerzel, VORGABE_NAMENSSCHEMA } from './namensschema';

const ARTEN = alleKuerzel(VORGABE_NAMENSSCHEMA.antragsarten);

describe('Namen von Antragsfassungen', () => {
  it('Nummer hinten, vorn, ohne – mit Stellen, Punkt und Trenner', () => {
    expect(fassungAus('BAUA', ARTEN)).toEqual({ art: 'BAUA', nr: 1 });
    expect(fassungAus('BAUA 2', ARTEN)).toEqual({ art: 'BAUA', nr: 2, form: { vorn: false, stellen: 1, punkt: false, trenner: ' ' } });
    expect(fassungAus('baua_03', ARTEN)).toEqual({ art: 'BAUA', nr: 3, form: { vorn: false, stellen: 2, punkt: false, trenner: '_' } });
    expect(fassungAus('BAUA2', ARTEN)?.nr).toBe(2);
    expect(fassungAus('2 BAUA', ARTEN)).toEqual({ art: 'BAUA', nr: 2, form: { vorn: true, stellen: 1, punkt: false, trenner: ' ' } });
    expect(fassungAus('2. BAUA', ARTEN)).toEqual({ art: 'BAUA', nr: 2, form: { vorn: true, stellen: 1, punkt: true, trenner: ' ' } });
    expect(fassungAus('02. BAUA', ARTEN)).toEqual({ art: 'BAUA', nr: 2, form: { vorn: true, stellen: 2, punkt: true, trenner: ' ' } });
    expect(fassungAus('02 BAUA', ARTEN)).toEqual({ art: 'BAUA', nr: 2, form: { vorn: true, stellen: 2, punkt: false, trenner: ' ' } });
    expect(fassungAus('2.BAUA', ARTEN)?.form).toEqual({ vorn: true, stellen: 1, punkt: true, trenner: '' });
    expect(fassungAus('02_bva', ARTEN)).toEqual({ art: 'BVA', nr: 2, form: { vorn: true, stellen: 2, punkt: false, trenner: '_' } });
  });
  it('ein Zusatz nach einem Leerzeichen zählt nicht mit; andere Ordner sind keine Fassung', () => {
    expect(fassungAus('BAUA 2 Nachtrag', ARTEN)).toMatchObject({ art: 'BAUA', nr: 2 });
    expect(fassungAus('02. BAUA Umbau', ARTEN)).toMatchObject({ art: 'BAUA', nr: 2 });
    expect(fassungAus('BAUA Nachtrag', ARTEN)).toEqual({ art: 'BAUA', nr: 1 });
    expect(fassungAus('Planung', ARTEN)).toBeNull();
    expect(fassungAus('BAUAX 2', ARTEN)).toBeNull();
    expect(fassungAus('2 Planung', ARTEN)).toBeNull();
    // die längere Art wird nicht als kürzere gelesen
    expect(fassungAus('2. BAUVA', ARTEN)?.art).toBe('BAUVA');
  });
  it('ein Zusatz nach der Nummer auch mit „-“, „_“ oder Punkt; vorn höchstens zwei Stellen', () => {
    expect(fassungAus('BAUA 2-Nachtrag', ARTEN)).toMatchObject({ art: 'BAUA', nr: 2 });
    expect(fassungAus('BAUA 2_alt', ARTEN)).toMatchObject({ art: 'BAUA', nr: 2 });
    expect(fassungAus('BAUA 2. Nachtrag', ARTEN)).toMatchObject({ art: 'BAUA', nr: 2 });
    expect(fassungAus('BAUA-Umbau', ARTEN)).toEqual({ art: 'BAUA', nr: 1 });
    // kein Zusatz, sondern ein anderes Wort: keine Fassung
    expect(fassungAus('BAUA2x', ARTEN)).toBeNull();
    // Jahreszahl vorn ist keine Nummer
    expect(fassungAus('2023 BAUA', ARTEN)).toBeNull();
    expect(fassungAus('12 BAUA', ARTEN)?.nr).toBe(12);
  });
  it('Antragsart einer Fassung – mit und ohne Liste der Arten', () => {
    expect(artDerFassung('02. BAUA', ARTEN)).toBe('BAUA');
    expect(artDerFassung('BAUA 2', ARTEN)).toBe('BAUA');
    expect(artDerFassung('BAUA 2 Nachtrag', ARTEN)).toBe('BAUA');
    expect(artDerFassung('2. baua')).toBe('BAUA');
    expect(artDerFassung('02 DENK')).toBe('DENK');
    expect(artDerFassung('BAUA 3')).toBe('BAUA');
    expect(artDerFassung('XYZ_4')).toBe('XYZ');
    // ohne Liste der Arten: ein Zusatz fällt weg
    expect(artDerFassung('BAUA 2 Nachtrag')).toBe('BAUA');
    expect(artDerFassung('02. BAUA Umbau')).toBe('BAUA');
  });
  it('Name in einer Schreibweise – ohne Vorlage „BAUA 2“', () => {
    expect(fassungsName('baua', 1)).toBe('BAUA');
    expect(fassungsName('BAUA', 3)).toBe('BAUA 3');
    expect(fassungsName('BAUA', 3, fassungAus('02. BAUA', ARTEN)!.form)).toBe('03. BAUA');
    expect(fassungsName('BAUA', 10, fassungAus('02 BAUA', ARTEN)!.form)).toBe('10 BAUA');
    expect(fassungsName('BAUA', 3, fassungAus('2.BAUA', ARTEN)!.form)).toBe('3.BAUA');
    expect(fassungsName('BVA', 3, fassungAus('BAUVA_02', ARTEN)!.form)).toBe('BVA_03');
  });
  it('dieselbe Fassung: gleiche Art (auch gleichwertige Schreibweise) und Nummer', () => {
    const g = (a: string, b: string) => gleicheFassung(a, b, VORGABE_NAMENSSCHEMA.antragsarten, ARTEN);
    expect(g('BAUA 2', '2. BAUA')).toBe(true);
    expect(g('BAUA 2', '02 BAUA')).toBe(true);
    expect(g('BAUA', '01. BAUA')).toBe(true);
    expect(g('BVA 2', '2. BAUVA')).toBe(true);
    expect(g('BAUA 2', '3. BAUA')).toBe(false);
    expect(g('BAUA 2', '2. DENK')).toBe(false);
    expect(g('BAUA 2', 'Planung')).toBe(false);
  });
});
