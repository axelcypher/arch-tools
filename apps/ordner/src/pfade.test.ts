import { describe, expect, it } from 'vitest';
import { pfadEinstellung } from '@core/einstellungen/pfade';
import { VORGABE_FOTOORDNER } from '@core/einstellungen/eintraege';
import { VORGABE_ALLGEMEIN } from '@core/platform/konfig';
import { STANDARD } from './struktur';
import { VORGABE_KATASTER } from './kataster/kataster';

/** Die zentralen Einstellungen (Pfade und Benennung) zeigen dieselben Vorgaben, nach denen ATLAS arbeitet */
describe('Vorgaben von ATLAS im zentralen Verzeichnis', () => {
  it('Struktur, Kataster und gemeinsame Einstellungen', () => {
    expect(pfadEinstellung('projekt.nummernschema').vorgabe).toBe(STANDARD.nummernschema);
    expect(pfadEinstellung('projekt.ordnername').vorgabe).toBe(STANDARD.ordnername);
    expect(pfadEinstellung('plaene.dateischema').vorgabe).toBe(STANDARD.dateischema);
    expect(pfadEinstellung('vorlagen.vorlagenname').vorgabe).toBe(STANDARD.vorlagenname);
    expect(pfadEinstellung('ablage.kataster.zielpfad').vorgabe).toBe(VORGABE_KATASTER.zielpfad);
    expect(pfadEinstellung('plaene.kataster.dateiname').vorgabe).toBe(VORGABE_KATASTER.dateiname);
    expect(pfadEinstellung('projekt.oapPfad').vorgabe).toBe(VORGABE_ALLGEMEIN.oapPfad);
    expect(VORGABE_FOTOORDNER).toBe(VORGABE_ALLGEMEIN.fotoordner);
    // die Berechnungsordner des Exports sind Ordner der Standardstruktur
    for (const app of ['flaechenrechner', 'grz', 'kosten']) expect(STANDARD.ordner.map((o) => o.pfad)).toContain(pfadEinstellung(`export.berechnungsordner.${app}`).vorgabe);
  });
});
