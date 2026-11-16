import { describe, expect, it } from 'vitest';
import { pfadEinstellung } from '@core/einstellungen/pfade';
import { VORGABE } from './einstellungen';

/** Die zentralen Einstellungen (Pfade und Benennung) zeigen dieselben Vorgaben, nach denen FABRIO arbeitet */
describe('Vorgaben von FABRIO im zentralen Verzeichnis', () => {
  it('Ablage, Rechnungsmuster und Name neuer LV-Dateien', () => {
    for (const k of ['gewerke', 'lv', 'auftrag', 'korrespondenz', 'archive', 'kostenkontrolle', 'bauleitung', 'mailOrdner'] as const)
      expect(pfadEinstellung(`ablage.fabrio.${k}`).vorgabe, k).toEqual(VORGABE.ablage[k]);
    expect(pfadEinstellung('plaene.fabrio.rechnungen').vorgabe).toEqual(VORGABE.rechnungen.muster);
    expect(pfadEinstellung('vorlagen.fabrio.lv').vorgabe).toBe(VORGABE.lv.dateiname);
  });
});
