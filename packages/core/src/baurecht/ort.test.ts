import { describe, expect, it } from 'vitest';
import { createProject } from '../model';
import { faktenZurLage } from './geodienste';
import { ortGeaendert, ortVon } from './ort';

describe('Ort des Vorhabens', () => {
  it('Anschrift und Grundstück vereinheitlicht, Lage nur aus passenden Koordinaten', () => {
    const p = createProject();
    p.meta.adresse = { strasse: ' Musterweg  1', plz: '59494', ort: 'Soest' };
    const o = ortVon(p)!;
    expect(o.adresse).toBe('musterweg 1|59494|soest|||');
    expect(o.lage).toBeNull();
    expect(ortGeaendert(o, { ...o })).toBeUndefined();
    expect(ortGeaendert(o, { ...o, adresse: 'x' })).toMatch(/Anschrift/);
    expect(ortGeaendert(undefined, o)).toMatch(/ohne Ortsangabe/);
    expect(ortGeaendert(o, undefined)).toBeUndefined();
  });

  it('eine Angabe mit Beleg zu einer früheren Lage behält den Vermerk der Lage (Anzeige „frühere Lage“ statt „Bestätigen“)', () => {
    const f = faktenZurLage({ x: { wert: true, herkunft: 'manuell', sicherheit: 'sicher', bestaetigt: { von: 'TP', am: '2026-11-12', grund: 'Auskunft der Behörde', lage: '1,1' } } }, '2,2');
    expect(f.x).toMatchObject({ sicherheit: 'hinweis', lage: '1,1' });
    expect(f.x.bestaetigt).toBeUndefined();
  });
});
