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
    expect(BAUGEBIETE).toContain('WA – allgemeines Wohngebiet');
    expect(BAUGEBIETE).toContain('Außenbereich (§ 35 BauGB)');
    expect(BAUGEBIETE).toContain('Fläche für den Gemeinbedarf (§ 9 Abs. 1 Nr. 5 BauGB)');
    expect(BAUGEBIETE.filter((g) => g.startsWith('SO'))).toHaveLength(2);
  });

  it('Anzahl: ganze Zahl', () => {
    expect(istAnzahl('Anzahl')).toBe(true);
    expect(istAnzahl('Anzahl der Wohnungen')).toBe(true);
    expect(istAnzahl('Gesamtanzahl')).toBe(false);
    // die Zahl der Vollgeschosse kann eine Festsetzung wie „II–III“ sein
    expect(istAnzahl('Anzahl der Vollgeschosse')).toBe(false);
  });
});
