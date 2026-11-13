import { describe, expect, it } from 'vitest';
import { rectPoints } from '@core/geometry';
import { createProject, createRoom } from '@core/model';
import { computeStorey } from '@core/calc';
import { raumNutzung } from '@core/norms';
import { abzugSetzen } from './abzug';
import { katalogAnwenden, katalogAus, katalogEintrag, neuerRaumVorgabe, nutzungSetzen, VORGABE_KATALOG, wohnungNormalisieren } from './katalog';

describe('Raumkatalog (F-11)', () => {
  const raum = () => createRoom(rectPoints({ x: 0, y: 0 }, { x: 2, y: 2 }), '0.01', 'Raum');
  it('Flur in der Wohnung zählt, Hausflur nicht – ein bloßes „Flur“ setzt nichts; „Bad“ → NUF 7 (7.1); Wohnung bleibt', () => {
    const r = { ...raum(), wofl: { kategorie: 'keine' as const, wohnung: 'WE 01' } };
    expect(katalogEintrag(VORGABE_KATALOG, 'flur')).toBeUndefined();
    expect(katalogEintrag(VORGABE_KATALOG, 'Flur (in der Wohnung)')!.wofl).toBe('voll');
    const flur = katalogAnwenden(r, katalogEintrag(VORGABE_KATALOG, 'hausflur/gemeinschaftsflur')!);
    expect([flur.nutzung, flur.wofl.kategorie, flur.katalog]).toEqual(['VF', 'keine', 'Hausflur/Gemeinschaftsflur']);
    const bad = katalogAnwenden(r, katalogEintrag(VORGABE_KATALOG, 'Bad')!);
    expect([bad.nutzung, bad.nutzungsart, bad.wofl.kategorie, bad.wofl.wohnung]).toEqual(['NUF7', '7.1', 'voll', 'WE 01']);
    expect(katalogEintrag(VORGABE_KATALOG, 'Abstellraum (in der Wohnung)')!.wofl).toBe('voll');
    expect(katalogEintrag(VORGABE_KATALOG, 'Abstellraum/Keller (außerhalb)')!.wofl).toBe('keine');
  });

  it('ebenerdige Terrasse: außerhalb der BGF – nur Wohnfläche; unterbaute Terrasse bleibt in der NRF', () => {
    const p = createProject();
    const t = katalogAnwenden({ ...raum(), wofl: { kategorie: 'keine', wohnung: 'WE 01' } }, katalogEintrag(VORGABE_KATALOG, 'Terrasse (ebenerdig, nicht unterbaut)')!);
    expect([t.ausserhalbBgf, t.wofl.kategorie]).toEqual([true, 'freisitz']);
    p.storeys[0].shapes.push(t);
    const r = computeStorey(p.storeys[0], p);
    expect([r.nrf.total, r.wofl, r.rooms[0].ausserhalbBgf]).toEqual([0, 1, true]);
    const dach = katalogAnwenden(t, katalogEintrag(VORGABE_KATALOG, 'Dachterrasse / Terrasse unterbaut')!);
    expect(dach.ausserhalbBgf).toBeUndefined();
    expect(katalogAus([{ name: 'Terrasse', nutzung: 'NUF1', wofl: 'freisitz', ausserhalbBgf: true }])![0].ausserhalbBgf).toBe(true);
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
    // widersprüchliche Angaben: die Nutzungsart gewinnt (wie in der Rechnung)
    expect(katalogAus([{ name: 'Bad', nutzung: 'NUF1', nutzungsart: '7.1', wofl: 'voll' }])![0].nutzung).toBe('NUF7');
  });

  it('Nutzungsgruppe setzen: unpassende Nutzungsart und Katalogbezug entfallen, Anzeige = Rechnung', () => {
    const bad = katalogAnwenden(raum(), katalogEintrag(VORGABE_KATALOG, 'Bad')!);
    const vf = nutzungSetzen(bad, 'VF');
    expect([vf.nutzung, vf.nutzungsart, vf.katalog, raumNutzung(vf)]).toEqual(['VF', undefined, undefined, 'VF']);
    // passende Nutzungsart bleibt
    expect(nutzungSetzen(bad, 'NUF7').nutzungsart).toBe('7.1');
    const p = createProject();
    p.storeys[0].shapes.push(vf);
    const r = computeStorey(p.storeys[0], p);
    expect([r.vf.total, r.nuf.total]).toEqual([4, 0]);
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

describe('Abzugsfläche markieren', () => {
  it('erbt Anrechnung und Wohnung des umgebenden Raums – mindert nicht die zuletzt gezeichnete Wohnung', () => {
    const p = createProject();
    const eg = p.storeys[0];
    const a = { ...createRoom(rectPoints({ x: 0, y: 0 }, { x: 5, y: 4 }), '0.01', 'Wohnen'), wofl: { kategorie: 'voll' as const, wohnung: 'WE 01' } };
    const b = { ...createRoom(rectPoints({ x: 6, y: 0 }, { x: 11, y: 4 }), '0.02', 'Wohnen'), wofl: { kategorie: 'voll' as const, wohnung: 'WE 02' } };
    // Schornstein in 0.01, beim Zeichnen mit den Vorgaben des zuletzt gezeichneten Raums (WE 02)
    const schornstein = { ...createRoom(rectPoints({ x: 1, y: 1 }, { x: 2, y: 2 }), '0.03', 'Schornstein'), ...neuerRaumVorgabe(p, { ...eg, shapes: [a, b] }) };
    expect(schornstein.wofl?.wohnung).toBe('WE 02');
    const abzug = abzugSetzen(schornstein, true);
    expect(abzug.subtract).toBe(true);
    expect(abzug.wofl).toEqual({ kategorie: 'keine', wohnung: '' });
    eg.shapes.push(a, b, abzug);
    const je = new Map<string, number>();
    for (const r of computeStorey(eg, p).rooms) je.set(r.wohnung, (je.get(r.wohnung) ?? 0) + r.woflArea);
    expect([je.get('WE 01'), je.get('WE 02')]).toEqual([19, 20]);
    // Aufheben lässt die Angaben stehen, BGF-Umrisse bleiben unberührt
    expect(abzugSetzen(abzug, false).subtract).toBe(false);
  });
});
