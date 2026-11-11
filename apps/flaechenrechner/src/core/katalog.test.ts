import { describe, expect, it } from 'vitest';
import { rectPoints } from '@core/geometry';
import { createProject, createRoom } from '@core/model';
import { katalogAnwenden, katalogAus, katalogEintrag, neuerRaumVorgabe, VORGABE_KATALOG, wohnungNormalisieren } from './katalog';

describe('Raumkatalog (F-11)', () => {
  const raum = () => createRoom(rectPoints({ x: 0, y: 0 }, { x: 2, y: 2 }), '0.01', 'Raum');
  it('„Flur“ → VF, keine Wohnfläche; „Bad“ → NUF 7 (7.1); Wohnung bleibt', () => {
    const r = { ...raum(), wofl: { kategorie: 'keine' as const, wohnung: 'WE 01' } };
    const flur = katalogAnwenden(r, katalogEintrag(VORGABE_KATALOG, 'flur')!);
    expect([flur.nutzung, flur.wofl.kategorie, flur.katalog]).toEqual(['VF', 'keine', 'Flur']);
    const bad = katalogAnwenden(r, katalogEintrag(VORGABE_KATALOG, 'Bad')!);
    expect([bad.nutzung, bad.nutzungsart, bad.wofl.kategorie, bad.wofl.wohnung]).toEqual(['NUF7', '7.1', 'voll', 'WE 01']);
    expect(katalogEintrag(VORGABE_KATALOG, 'Abstellraum (in der Wohnung)')!.wofl).toBe('voll');
    expect(katalogEintrag(VORGABE_KATALOG, 'Abstellraum/Keller (außerhalb)')!.wofl).toBe('keine');
  });

  it('Wohnungsauswahl: Schreibvarianten werden zur vorhandenen Wohnung', () => {
    expect(wohnungNormalisieren('WE01', ['WE 01', 'WE 02'])).toBe('WE 01');
    expect(wohnungNormalisieren(' we-02 ', ['WE 01', 'WE 02'])).toBe('WE 02');
    expect(wohnungNormalisieren('WE 03', ['WE 01'])).toBe('WE 03');
  });

  it('eigener Katalog aus der Einstellungsdatei; Nutzungsart bestimmt die Gruppe', () => {
    expect(katalogAus([{ name: 'Sauna', nutzungsart: '1.1', wofl: 'voll' }, { name: '' }, 'x'])).toEqual([{ name: 'Sauna', nutzung: 'NUF1', nutzungsart: '1.1', wofl: 'voll' }]);
    expect(katalogAus({ eintraege: [{ name: 'WC', nutzung: 'NUF7', wofl: 'voll' }] })).toHaveLength(1);
    expect(katalogAus(null)).toBeNull();
  });

  it('Vorgabe für neue Räume: vom zuletzt angelegten Raum des Geschosses', () => {
    const p = createProject();
    expect(neuerRaumVorgabe(p, p.storeys[0])).toEqual({});
    const r = { ...raum(), nutzung: 'NUF7' as const, wofl: { kategorie: 'voll' as const, wohnung: 'WE 01' } };
    p.storeys[0].shapes.push(r);
    expect(neuerRaumVorgabe(p, p.storeys[0])).toMatchObject({ nutzung: 'NUF7', wofl: { kategorie: 'voll', wohnung: 'WE 01' } });
    p.storeys.push({ ...createProject().storeys[0], name: '1. OG' });
    expect(neuerRaumVorgabe(p, p.storeys[1])).toEqual({ wofl: { kategorie: 'voll', wohnung: 'WE 01' } });
  });
});
