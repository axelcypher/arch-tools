import { describe, expect, it } from 'vitest';
import { ablageSuchen, auswahlBereinigt, dateiArt, kuerzelPasst, sichtbarkeit, zuordnen } from './ablage';
import { SpeicherDateisystem } from './dateisystem';

describe('Projektordner über das Kürzel zuordnen', () => {
  it('Kürzel als erstes oder zweites Wort, ganze Wörter, ohne Groß/Klein', () => {
    expect(kuerzelPasst('BS5 Buchenstraße 5 Welver', 'BS5')).toBe(true);
    expect(kuerzelPasst('JJ H24 Hofstraße 24', 'H24')).toBe(true);
    expect(kuerzelPasst('26 OMW2 Umbau', 'omw2')).toBe(true);
    expect(kuerzelPasst('STRa Straßenhaus', 'STRa')).toBe(true);
    expect(kuerzelPasst('STRb Straßenhaus', 'STRa')).toBe(false);
    expect(kuerzelPasst('BS50 Bahnhofstraße 50', 'BS5')).toBe(false);
    expect(kuerzelPasst('Alt Neubau BS5', 'BS5')).toBe(false);
    expect(kuerzelPasst('BS5_Buchenstraße', 'BS5')).toBe(true);
  });

  it('sucht zwei Ebenen tief und bevorzugt die oberste', async () => {
    const ds = new SpeicherDateisystem();
    for (const p of ['BS5 Buchenstraße/Organisation/x.xlsx', '_Akquise/H24 Hofstraße/notiz.txt', '_Akquise/BS5 alt/a.txt', 'AH5 Alter Weg/a.pdf']) ds.dateien.set(`Z:/Projekte/${p}`, new Uint8Array([1]));
    const { ordner, fehler } = await ablageSuchen(ds, ['Z:/Projekte']);
    expect(fehler).toEqual([]);
    expect(zuordnen('BS5', ordner)?.pfad).toBe('BS5 Buchenstraße');
    expect(zuordnen('H24', ordner)?.pfad).toBe('_Akquise/H24 Hofstraße');
    expect(zuordnen('XY1', ordner)).toBeNull();
  });
});

describe('Angezeigte Pfade', () => {
  const auswahl = ['Organisation', '03 Berechnungen/Fl*', '0? Pläne'];
  it('ganz, auf dem Weg dorthin oder gar nicht', () => {
    expect(sichtbarkeit('Organisation', auswahl)).toBe('ganz');
    expect(sichtbarkeit('Organisation/Verträge/a.pdf', auswahl)).toBe('ganz');
    expect(sichtbarkeit('03 Berechnungen', auswahl)).toBe('teil');
    expect(sichtbarkeit('03 Berechnungen/Flächen', auswahl)).toBe('ganz');
    expect(sichtbarkeit('03 Berechnungen/Kosten', auswahl)).toBe('weg');
    expect(sichtbarkeit('02 Pläne', auswahl)).toBe('ganz');
    expect(sichtbarkeit('organisation', auswahl)).toBe('ganz');
    expect(sichtbarkeit('Fotos', auswahl)).toBe('weg');
    expect(sichtbarkeit('irgendwas', ['*'])).toBe('ganz');
  });

  it('bereinigt die Liste', () => {
    expect(auswahlBereinigt([' Organisation ', '', '03 Berechnungen\\Flächen\\', '/Organisation', 'a//b'])).toEqual(['Organisation', '03 Berechnungen/Flächen', 'a/b']);
  });

  it('erkennt Dateiarten', () => {
    expect(dateiArt('BS5 Anlage I-3.PDF')).toBe('pdf');
    expect(dateiArt('BS5.oap')).toBe('berechnung');
    expect(dateiArt('BS5 Projektdaten.xlsx')).toBe('tabelle');
    expect(dateiArt('ohne')).toBe('sonst');
  });
});
