import { describe, expect, it } from 'vitest';
import { vollerOrt } from '@core/einstellungen/baum';
import { pfadEinstellung } from '@core/einstellungen/pfade';
import { VORGABE_EXPORT, type ExportEinstellungen } from './antrag';
import { antragsOrdner, zielOrdner } from './antragStore';

/**
 * Bezüge auf „Pfade und Benennung“ gegen die Auflösung in PERMIO: Die Ordner bildet der Test aus dem Baum
 * (`vollerOrt`) – löst PERMIO sie anders auf, schlägt er fehl.
 */
const zustand = (e: Partial<ExportEinstellungen>) => ({
  einstellungen: { ...VORGABE_EXPORT, antragsordner: 'Genehmigung/TÖB', ...e },
  ueberschreibungen: {},
  projektdatei: { aktiveFassung: 'BAUA 2' } as never,
  fassungen: [],
});
const ort = (id: string, werte: Record<string, string>, zwischen = '') => {
  const o = vollerOrt(pfadEinstellung(id), (x) => werte[x], () => zwischen);
  expect(o?.von, id).toBe('projekt');
  return o!.teile.join('/');
};

describe('Bezüge von PERMIO', () => {
  it('Antragsdokumente liegen im Ordner der aktiven Antragsfassung im Antragsordner', () => {
    const s = zustand({ ziel: 'aktiv' });
    const erwartet = ort('plaene.permio.namensvorlage', { 'ablage.permio.antragsordner': 'Genehmigung/TÖB' }, 'BAUA 2');
    expect(erwartet).toBe('Genehmigung/TÖB/BAUA 2');
    expect(antragsOrdner(s, null)).toBe(erwartet);
    expect(zielOrdner(s, null)).toBe(erwartet);
  });

  it('der feste Zielordner gilt relativ zum Projektordner – nicht zum Antragsordner', () => {
    const s = zustand({ ziel: 'pfad', zielpfad: 'Export/Anträge' });
    expect(zielOrdner(s, null)).toBe(ort('plaene.permio.zielpfad', { 'plaene.permio.zielpfad': 'Export/Anträge' }));
    expect(pfadEinstellung('plaene.permio.zielpfad').bezug).toEqual({ art: 'projekt' });
  });
});
