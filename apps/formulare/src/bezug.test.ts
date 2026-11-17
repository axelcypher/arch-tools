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
  const o = vollerOrt(
    pfadEinstellung(id),
    (x) => werte[x],
    () => zwischen,
  );
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

  it('der feste Zielordner liegt im Antragsordner und zieht mit; ein übernommener abweichender gilt relativ zum Projektordner', async () => {
    const { pfadWerteAus } = await import('@core/einstellungen/pfade');
    const { mitZentral } = await import('./antragStore');
    const werte = (pfade: Record<string, string>) => {
      const w = pfadWerteAus({ allgemein: { pfade } });
      return (id: string) => w[id] ?? pfadEinstellung(id).vorgabe;
    };
    // im Antragsordner: was der Baum zeigt, löst PERMIO auf
    const w1 = werte({ 'ablage.permio.antragsordner': 'Genehmigung/TÖB', 'plaene.permio.zielordner': 'Export/{Antrag}' });
    const s1 = zustand({ ...mitZentral(VORGABE_EXPORT, w1), ziel: 'pfad' });
    const erwartet = ort('plaene.permio.zielordner', { 'ablage.permio.antragsordner': 'Genehmigung/TÖB', 'plaene.permio.zielordner': 'Export/{Antrag}' });
    expect(erwartet).toBe('Genehmigung/TÖB/Export/{Antrag}');
    expect(zielOrdner(s1, null)).toBe('Genehmigung/TÖB/Export/BAUA 2');
    // übernommener Pfad außerhalb: relativ zum Projektordner, wie bisher
    const w2 = werte({ 'plaene.permio.zielpfad': 'Ausgang/{Antrag}' });
    expect(zielOrdner(zustand({ ...mitZentral(VORGABE_EXPORT, w2), ziel: 'pfad' }), null)).toBe('Ausgang/BAUA 2');
    expect(pfadEinstellung('plaene.permio.zielpfad').bezug).toEqual({ art: 'projekt' });
  });
});
