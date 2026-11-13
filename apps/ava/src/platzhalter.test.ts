import { describe, expect, it } from 'vitest';
import { veraltetePlatzhalter } from '@core/platzhalter';
import { VORGABE } from './einstellungen';
import { globaleAva, LV_NAME_VARIABLEN, lvDateiname } from './platzhalter';

const META = { projektcode: 'K62', kurzname: 'Kita', vorhaben: 'Neubau EFH / Garage', bearbeiter: 'TP' };

describe('Platzhalter von FABRIO', () => {
  it('Name neuer LV-Dateien: neue und alte Namen gleich, „/“ im Wert ergibt keinen Unterordner', () => {
    const w = { ...globaleAva(META, 'Projekt', undefined, new Date(2026, 10, 12)), Gewerk: 'G08' };
    expect(lvDateiname(VORGABE.lv.dateiname, w)).toBe('K62 261112 LV G08');
    expect(lvDateiname('{Kürzel} {Datum} LV {Gewerk}', w)).toBe(lvDateiname(VORGABE.lv.dateiname, w));
    expect(lvDateiname('{PROJEKT_VORHABEN} {Unbekannt} {Gewerk}', w)).toBe('Neubau EFH Garage G08');
    expect(veraltetePlatzhalter(VORGABE.lv.dateiname, LV_NAME_VARIABLEN)).toEqual([]);
  });

  it('globale Werte: Vorhaben ersatzweise der Projektname, Bearbeitung zuerst vom Deckblatt', () => {
    const w = globaleAva({ ...META, vorhaben: '' }, 'Projekt X', 'AB');
    expect(w.PROJEKT_VORHABEN).toBe('Projekt X');
    expect(w.BEARBEITER).toBe('AB');
    expect(globaleAva(META, 'P').BEARBEITER).toBe('TP');
  });
});
