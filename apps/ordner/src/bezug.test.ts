import { describe, expect, it } from 'vitest';
import { vollerOrt } from '@core/einstellungen/baum';
import { pfadEinstellung } from '@core/einstellungen/pfade';
import { katasterZielpfad } from './kataster/kataster';

/**
 * Bezüge auf „Pfade und Benennung“ gegen die Auflösung in ATLAS: Den Ablageordner der Katasterpläne bildet der Test aus
 * dem Baum (`vollerOrt`) – löst ATLAS ihn anders auf, schlägt er fehl.
 */
describe('Bezüge von ATLAS', () => {
  it('Katasterpläne: Ablageordner relativ zum Projektordner, die Dateien liegen darin', () => {
    const werte: Record<string, string> = { 'ablage.kataster.zielpfad': 'Planung/Kataster' };
    const ordner = vollerOrt(pfadEinstellung('ablage.kataster.zielpfad'), (x) => werte[x]);
    expect(ordner?.von).toBe('projekt');
    expect(katasterZielpfad('Planung/Kataster', 'BAUA 2', { kuerzel: 'BS9' } as never)).toBe(ordner!.teile.join('/'));
    expect(vollerOrt(pfadEinstellung('plaene.kataster.dateiname'), (x) => werte[x])?.teile).toEqual(ordner!.teile);
  });

  it('Vorlagenordner und Stammordner sind vollständige Ordner', () => {
    for (const id of ['vorlagen.atlas.vorlagenordner', 'projekt.stammordner']) expect(pfadEinstellung(id).bezug, id).toEqual({ art: 'absolut' });
    // der Projektordner entsteht im ersten Stammordner
    const o = vollerOrt(pfadEinstellung('projekt.ordnername'), (x) => (x === 'projekt.stammordner' ? ['Z:/Projekte'] : 'BS9 EFH'));
    expect(o).toEqual({ von: 'absolut', teile: ['Z:', 'Projekte', 'BS9 EFH'] });
  });
});
