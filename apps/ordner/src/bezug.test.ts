import { describe, expect, it } from 'vitest';
import { vollerOrt } from '@core/einstellungen/baum';
import { pfadEinstellung } from '@core/einstellungen/pfade';
import { useKataster } from './kataster/katasterStore';

/**
 * Bezüge auf „Pfade und Benennung“ gegen die Auflösung in ATLAS: Den Ablageordner der Katasterpläne bildet der Test aus
 * dem Baum (`vollerOrt`) und vergleicht ihn mit dem Zielordner, den ATLAS beim Export nimmt (`zielOrdner`).
 */
const projekt = (antrag?: string) => ({ name: 'BS9 EFH', oap: { projekt: { meta: { projektcode: 'BS9', ...(antrag ? { antrag: { name: antrag } } : {}) } } } }) as never;
const zielOrdner = (e: { ziel: 'pfad' | 'antrag'; zielpfad: string }, antrag?: string) => {
  useKataster.setState({ einstellungen: { ...useKataster.getState().einstellungen, ...e }, projekt: projekt(antrag) });
  return useKataster.getState().zielOrdner();
};

describe('Bezüge von ATLAS', () => {
  it('Katasterpläne: fester Ablageordner relativ zum Projektordner – dort legt ATLAS sie ab', () => {
    const ordner = vollerOrt(pfadEinstellung('ablage.kataster.zielpfad'), () => 'Planung/Kataster');
    expect(ordner?.von).toBe('projekt');
    expect(zielOrdner({ ziel: 'pfad', zielpfad: 'Planung/Kataster' }, 'BAUA 2')).toBe(ordner!.teile.join('/'));
    // die Dateinamen hängen an diesem Ordner
    expect(vollerOrt(pfadEinstellung('plaene.kataster.dateiname'), (x) => (x === 'ablage.kataster.zielpfad' ? 'Planung/Kataster' : undefined))?.teile).toEqual(ordner!.teile);
  });

  it('Katasterpläne im Ordner des aktiven Antrags: der andere Modus, den die Bezugszeile nennt', () => {
    expect(zielOrdner({ ziel: 'antrag', zielpfad: 'Planung/Kataster' }, 'BAUA 2')).toBe('TÖB/BAUA 2');
    expect(pfadEinstellung('plaene.kataster.dateiname').bezug).toMatchObject({ sonst: expect.stringContaining('Ordner des aktiven Antrags') });
  });

  it('Vorlagenordner und Stammordner sind vollständige Ordner; der Projektordner entsteht im ersten Stammordner', () => {
    for (const id of ['vorlagen.atlas.vorlagenordner', 'projekt.stammordner']) expect(pfadEinstellung(id).bezug, id).toEqual({ art: 'absolut' });
    const o = vollerOrt(pfadEinstellung('projekt.ordnername'), (x) => (x === 'projekt.stammordner' ? ['Z:/Projekte'] : 'BS9 EFH'));
    expect(o).toMatchObject({ von: 'absolut', teile: ['Z:', 'Projekte', 'BS9 EFH'] });
  });
});
