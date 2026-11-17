import { describe, expect, it } from 'vitest';
import { antragsordnerSpeicher, zielAusPfad, zielGruppeLesen, zielpfadWirksam, zielSpeicher } from './zielordner';

/** Fester Zielordner der Antragsdokumente: relativ zum Antragsordner, Übernahme des bisherigen Pfads ohne Verlust */
describe('Zielordner der Antragsdokumente', () => {
  it('bisheriger Pfad im Antragsordner: dieser Teil wird abgeschnitten; sonst bleibt er als abweichender Ordner', () => {
    expect(zielAusPfad('TÖB/{Antrag}', 'TÖB')).toEqual({ zielordner: '{Antrag}', abweichend: '' });
    expect(zielAusPfad('Genehmigung\\TÖB\\{Antrag}\\Formulare', 'Genehmigung/TÖB')).toEqual({ zielordner: '{Antrag}/Formulare', abweichend: '' });
    expect(zielAusPfad('Ausgang/{Antrag}', 'TÖB')).toEqual({ zielordner: '{Antrag}', abweichend: 'Ausgang/{Antrag}' });
    // der Antragsordner selbst ist kein Ordner darin
    expect(zielAusPfad('TÖB', 'TÖB')).toEqual({ zielordner: '{Antrag}', abweichend: 'TÖB' });
  });

  // bisherige Einstellungen in allgemein.pfade
  const FAELLE: Record<string, string>[] = [
    {},
    { 'plaene.permio.zielpfad': 'TÖB/{Antrag}/Export' },
    { 'ablage.permio.antragsordner': 'Anträge', 'plaene.permio.zielpfad': 'Anträge/{Art}' },
    { 'ablage.permio.antragsordner': 'Anträge', 'plaene.permio.zielpfad': 'Ausgang' },
    { 'plaene.permio.zielpfad': 'TÖB' },
  ];
  it('PERMIO schreibt danach in denselben Ordner wie vorher (war ein Zielordner eingestellt)', () => {
    for (const pfade of FAELLE) {
      const vorher = pfade['plaene.permio.zielpfad'] ?? `${pfade['ablage.permio.antragsordner'] ?? 'TÖB'}/{Antrag}`;
      expect(zielpfadWirksam(zielGruppeLesen(pfade)), JSON.stringify(pfade)).toBe(vorher);
    }
  });

  it('der Antragsordner ändert sich: der Zielordner zieht mit, der wirksame Pfad steht für ältere Versionen unter dem alten Schlüssel', () => {
    const roh = antragsordnerSpeicher().schreiben({ pfade: { 'plaene.permio.zielpfad': 'TÖB/{Antrag}/Export' } }, 'Anträge');
    const pfade = roh.pfade as Record<string, string>;
    expect(zielGruppeLesen(pfade)).toEqual({ antragsordner: 'Anträge', zielordner: '{Antrag}/Export', abweichend: '' });
    expect(pfade['plaene.permio.zielpfad']).toBe('Anträge/{Antrag}/Export');
    // zurück zu den Vorgaben: keine Einträge mehr
    const zurueck = zielSpeicher('zielordner').schreiben(antragsordnerSpeicher().schreiben(roh, undefined), undefined);
    expect(zurueck).toEqual({ pfade: {} });
  });

  it('ein abweichender Ordner im Antragsordner wird der Zielordner darin; leer gilt wieder der Zielordner im Antragsordner', () => {
    const roh = zielSpeicher('abweichend').schreiben({}, 'TÖB/Export/{Antrag}');
    expect(zielGruppeLesen(roh.pfade as Record<string, unknown>)).toEqual({ antragsordner: 'TÖB', zielordner: 'Export/{Antrag}', abweichend: '' });
    const aussen = zielSpeicher('abweichend').schreiben(roh, 'Ausgang');
    expect(zielpfadWirksam(zielGruppeLesen(aussen.pfade as Record<string, unknown>))).toBe('Ausgang');
    const leer = zielSpeicher('abweichend').schreiben(aussen, '');
    expect(zielpfadWirksam(zielGruppeLesen(leer.pfade as Record<string, unknown>))).toBe('TÖB/Export/{Antrag}');
  });
});
