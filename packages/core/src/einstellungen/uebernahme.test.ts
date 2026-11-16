import { describe, expect, it } from 'vitest';
import { alteWerteAus, uebernahmePlanen } from './uebernahme';

/** Übernahme der Export-Einstellungen von PERMIO aus dem Speicher eines Rechners in den gemeinsamen Speicher */

describe('Übernahme alter lokaler Werte (PERMIO, „formulare:export“)', () => {
  it('nur abweichende Werte zählen; der Berechnungsordner der Vorgabe entfällt, ein eigener wird zusätzlicher Suchordner', () => {
    expect(alteWerteAus(null)).toEqual([]);
    expect(
      alteWerteAus({ antragsordner: 'TÖB', namensvorlage: '{PROJEKT_KUERZEL} {Art} {DATUM} {Nr} {Name}', zielpfad: 'TÖB/{Antrag}', berechnungsordner: 'Planung/Berechnungen', vorlagenordner: '' }),
    ).toEqual([]);
    expect(
      alteWerteAus({ antragsordner: ' Anträge ', namensvorlage: '{Projekt} {Art} {Datum} {Name}', berechnungsordner: 'Planung/00 Berechnungen', vorlagenordner: 'V:\\Leer', arten: ['BAUA'] }),
    ).toEqual([
      { id: 'ablage.permio.antragsordner', wert: 'Anträge' },
      { id: 'plaene.permio.namensvorlage', wert: '{Projekt} {Art} {Datum} {Name}' },
      { id: 'vorlagen.permio.vorlagenordner', wert: 'V:\\Leer' },
      { id: 'ablage.permio.berechnungsordner', wert: ['Planung/00 Berechnungen'] },
    ]);
    // Unbrauchbares wird übergangen
    expect(alteWerteAus({ antragsordner: 5, zielpfad: '  ' })).toEqual([]);
  });

  it('gemeinsam noch nichts: der lokale Wert wird übernommen – je Rechner nur einmal (ein späteres „Vorgabe wiederherstellen“ bleibt)', () => {
    const alt = alteWerteAus({ antragsordner: 'Anträge', berechnungsordner: 'Statik' });
    expect(uebernahmePlanen(alt, {})).toEqual({ uebernehmen: alt, abweichungen: [], gleich: [] });
    // übernommen und vermerkt, danach im Dialog auf die Vorgabe zurückgesetzt (Eintrag entfällt): nicht erneut übernehmen
    const vermerkt = new Set(['ablage.permio.antragsordner="Anträge"', 'ablage.permio.berechnungsordner=["Statik"]']);
    expect(uebernahmePlanen(alt, {}, vermerkt)).toEqual({ uebernehmen: [], abweichungen: [], gleich: [] });
  });

  it('gemeinsam gleicher Wert: nichts zu tun', () => {
    const alt = alteWerteAus({ antragsordner: 'Anträge', berechnungsordner: 'Statik' });
    expect(uebernahmePlanen(alt, { 'ablage.permio.antragsordner': 'Anträge', 'ablage.permio.berechnungsordner': ['Wärmeschutz', 'statik'] })).toEqual({
      uebernehmen: [],
      abweichungen: [],
      gleich: alt,
    });
  });

  it('zwei Rechner mit verschiedenen alten Werten (Netzwerk): nicht still überschreiben, sondern als Abweichung fragen – bis entschieden', () => {
    const alt = alteWerteAus({ antragsordner: 'Anträge', berechnungsordner: 'Statik' });
    const werte = { 'ablage.permio.antragsordner': 'TÖB-Ablage', 'ablage.permio.berechnungsordner': ['Wärmeschutz'] };
    const plan = uebernahmePlanen(alt, werte);
    expect(plan.uebernehmen).toEqual([]);
    expect(plan.abweichungen).toEqual([
      { id: 'ablage.permio.antragsordner', lokal: 'Anträge', gemeinsam: 'TÖB-Ablage', neu: 'Anträge' },
      // Suchordner werden ergänzt, nicht ersetzt
      { id: 'ablage.permio.berechnungsordner', lokal: ['Statik'], gemeinsam: ['Wärmeschutz'], neu: ['Wärmeschutz', 'Statik'] },
    ]);
    const entschieden = new Set(['ablage.permio.antragsordner="Anträge"']);
    expect(uebernahmePlanen(alt, werte, entschieden).abweichungen.map((a) => a.id)).toEqual(['ablage.permio.berechnungsordner']);
  });
});
