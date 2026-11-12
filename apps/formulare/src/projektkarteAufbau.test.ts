import { describe, expect, it } from 'vitest';
import { BAUGEBIETE, istAnzahl, NUTZUNGSARTEN, nutzungsarten } from './projektkarteAufbau';

describe('Eingaben mit fester Form in der Projektkarte', () => {
  it('Art der Nutzung: Auswahl gängiger Nutzungen, Art der baulichen Nutzung: Gebiete der BauNVO', () => {
    expect(nutzungsarten('Art der Nutzung')).toBe(NUTZUNGSARTEN);
    expect(nutzungsarten('Art der Nutzung:')).toBe(NUTZUNGSARTEN);
    expect(nutzungsarten('Nutzungsart')).toBe(NUTZUNGSARTEN);
    expect(nutzungsarten('Art der baulichen Nutzung')).toBe(BAUGEBIETE);
    expect(nutzungsarten('Maß der baulichen Nutzung')).toBeNull();
    expect(nutzungsarten('Bezeichnung der Baumaßnahme')).toBeNull();
    expect(NUTZUNGSARTEN).toContain('Wohnen');
    expect(BAUGEBIETE).toContain('Allgemeines Wohngebiet (WA)');
  });

  it('Anzahl: ganze Zahl', () => {
    expect(istAnzahl('Anzahl')).toBe(true);
    expect(istAnzahl('Anzahl der Wohnungen')).toBe(true);
    expect(istAnzahl('Gesamtanzahl')).toBe(false);
  });
});
