import { describe, expect, it } from 'vitest';
import { pfadEinstellung } from '@core/einstellungen/pfade';
import { VORGABE_PERMIO } from '@core/einstellungen/eintraege';
import { VORGABE_EXPORT } from './antrag';
import { mitZentral } from './antragStore';

/** PERMIO liest Pfade und Namen des Exports aus den zentralen Einstellungen */
describe('PERMIO und die zentralen Einstellungen', () => {
  it('Vorgaben gleich; die Übernahme kennt die alten Vorgaben', () => {
    expect(pfadEinstellung('ablage.permio.antragsordner').vorgabe).toBe(VORGABE_EXPORT.antragsordner);
    expect(pfadEinstellung('plaene.permio.namensvorlage').vorgabe).toBe(VORGABE_EXPORT.namensvorlage);
    expect(pfadEinstellung('plaene.permio.zielpfad').vorgabe).toBe(VORGABE_EXPORT.zielpfad);
    expect(pfadEinstellung('vorlagen.permio.vorlagenordner').vorgabe).toBe(VORGABE_EXPORT.vorlagenordner);
    expect(VORGABE_PERMIO.berechnungsordner).toBe(VORGABE_EXPORT.berechnungsordner);
  });

  it('mitZentral: zentrale Werte vor den lokalen; Berechnungen in den Ordnern der Rechen-Apps und den zusätzlichen', () => {
    const werte: Record<string, unknown> = {
      'ablage.permio.antragsordner': 'Anträge',
      'plaene.permio.namensvorlage': '{PROJEKT_KUERZEL} {Art} {DATUM} {Name}',
      'plaene.permio.zielpfad': 'Ausgang',
      'vorlagen.permio.vorlagenordner': 'V:\\Leer',
      'ablage.permio.berechnungsordner': ['Statik'],
    };
    const w = (id: string) => (werte[id] ?? pfadEinstellung(id).vorgabe) as string;
    const e = mitZentral({ ...VORGABE_EXPORT, antragsordner: 'lokal', arten: ['BAUA'], ziel: 'pfad' }, w);
    expect(e).toEqual({
      antragsordner: 'Anträge',
      arten: ['BAUA'],
      namensvorlage: '{PROJEKT_KUERZEL} {Art} {DATUM} {Name}',
      ziel: 'pfad',
      zielpfad: 'Ausgang',
      berechnungsordner: '03 Berechnungen/Flächen\n03 Berechnungen/Nachweise\n03 Berechnungen/Kosten\nStatik',
      vorlagenordner: 'V:\\Leer',
    });
  });
});
