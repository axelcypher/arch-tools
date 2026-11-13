import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Holen } from '../recht/netz';
import { alsFakt, dienstAbfragen, faktenZurLage, flurstueckAus, geoZusammenfuehren, gfiAus, pruefpunkte } from './geodienste';
import type { FaktDef, FaktWert, GeodienstDef } from './typen';

const fixture = (n: string) => readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), 'utf8');
const def: FaktDef = { titel: 'Vogelschutzgebiet', gruppe: 'schutz', typ: 'janein' };
const dienst: GeodienstDef = { art: 'wms', url: 'https://www.wms.nrw.de/umwelt/linfos', ebene: 'Vogelschutzgebiete', vollstaendig: true, quelle: 'LINFOS NRW' };

describe('Geodienste', () => {
  it('Flurstück aus ALKIS: Gemeindeschlüssel, Gemarkung, Flur, Nummer, Fläche, Umring', () => {
    const f = flurstueckAus(fixture('alkis-flurstueck.xml'))!;
    expect(f).toMatchObject({ ags: '05111000', gemeinde: 'Düsseldorf', gemarkung: 'Altstadt', flur: '1', flurstueck: '2', flaeche: 256577 });
    expect(f.umring.length).toBeGreaterThanOrEqual(6);
  });

  it('GetFeatureInfo: Treffer und leere Antwort', () => {
    expect(gfiAus(fixture('linfos-treffer.xml'))).toEqual({ treffer: true });
    expect(gfiAus(fixture('linfos-treffer.xml'), 'localid')).toEqual({ treffer: true, wert: 'DE-4415-401' });
    expect(gfiAus(fixture('linfos-leer.xml'))).toEqual({ treffer: false });
    expect(() => gfiAus('<ServiceExceptionReport><ServiceException>kaputt</ServiceException></ServiceExceptionReport>')).toThrow(/kaputt/);
  });

  it('Prüfpunkte: Mitte, Ecken und der um den Puffer erweiterte Umring', () => {
    const u = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 30 },
      { x: 0, y: 30 },
    ];
    const p = pruefpunkte(u, { x: 10, y: 15 }, 25);
    expect(p[0]).toEqual({ x: 10, y: 15 });
    expect(p.length).toBeGreaterThan(10);
    // alle äußeren Punkte liegen mindestens 25 m vor dem Umring
    const weit = p.filter((q) => q.x < -10 || q.x > 30 || q.y < -10 || q.y > 40);
    expect(weit.length).toBeGreaterThan(4);
  });

  it('ein Treffer genügt und ist sicher; kein Treffer bleibt Hinweis', async () => {
    let n = 0;
    const treffer: Holen = async (url) => {
      n++;
      return { status: 200, url, daten: new TextEncoder().encode(n === 3 ? fixture('linfos-treffer.xml') : fixture('linfos-leer.xml')) };
    };
    const e = await dienstAbfragen(treffer, dienst, null, { x: 0, y: 0 });
    expect(e.treffer).toBe(true);
    expect(alsFakt(def, dienst, e, { genau: true, heute: '2026-11-12' })).toMatchObject({ wert: true, sicherheit: 'sicher' });
    const leer: Holen = async (url) => ({ status: 200, url, daten: new TextEncoder().encode(fixture('linfos-leer.xml')) });
    const f = alsFakt(def, dienst, await dienstAbfragen(leer, dienst, null, { x: 0, y: 0 }), { genau: true, heute: '2026-11-12' })!;
    expect(f).toMatchObject({ wert: false, sicherheit: 'hinweis' });
    expect(f.grund).toMatch(/Amtsblatt/);
  });

  it('Fehler des Dienstes: kein Ergebnis (ein früherer Treffer bleibt), nie „kein Treffer“', async () => {
    const kaputt: Holen = async (url) => ({ status: 503, url, daten: new Uint8Array() });
    const e = await dienstAbfragen(async (u, o) => kaputt(u, o), dienst, null, { x: 0, y: 0 });
    expect(e).toMatchObject({ treffer: false, vollstaendigAbgefragt: false });
    expect(alsFakt(def, dienst, e, { genau: true, heute: '2026-11-12' })).toBeNull();
    const alt: FaktWert = { wert: true, herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'LINFOS' };
    expect(geoZusammenfuehren({ 'schutz.lsg': alt }, {})['schutz.lsg']).toEqual(alt);
  }, 20000);

  it('eine Wartungsseite ist kein „kein Treffer“', () => {
    expect(() => gfiAus('<html><body>Wartungsarbeiten</body></html>')).toThrow(/nicht im erwarteten Format/);
    expect(() => gfiAus('')).toThrow(/nicht im erwarteten Format/);
    expect(gfiAus(fixture('linfos-leer.xml')).treffer).toBe(false);
  });

  it('Prüfpunkte decken auch das Innere eines großen Flurstücks ab', () => {
    const u = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 150 },
      { x: 0, y: 150 },
    ];
    const p = pruefpunkte(u, { x: 100, y: 75 }, 25);
    const innen = p.filter((q) => q.x > 10 && q.x < 190 && q.y > 10 && q.y < 140 && !(q.x === 100 && q.y === 75));
    expect(innen.length).toBeGreaterThanOrEqual(9);
    expect(p.length).toBeLessThanOrEqual(96);
  });
});

describe('Ergebnisse der Geodienste zusammenführen', () => {
  const kein: FaktWert = { wert: false, herkunft: 'geodienst', quelle: 'LINFOS', stand: '2026-11-01', sicherheit: 'hinweis', grund: 'Kein Treffer', lage: '1,1' };
  const treffer: FaktWert = { wert: true, herkunft: 'geodienst', quelle: 'LINFOS', stand: '2026-11-12', sicherheit: 'sicher', lage: '1,1' };
  const bestaetigt = (f: FaktWert): FaktWert => ({ ...f, bestaetigt: { von: 'TP', am: '2026-11-02', grund: 'Auskunft UNB vom 02.11.', lage: '1,1' } });

  it('ein Treffer geht einem bestätigten „kein Treffer“ vor', () => {
    const r = geoZusammenfuehren({ 'schutz.lsg': bestaetigt(kein) }, { 'schutz.lsg': treffer });
    expect(r['schutz.lsg']).toEqual(treffer);
  });

  it('die Bestätigung bleibt, wenn an derselben Lage wieder kein Treffer kommt – nicht an einer anderen', () => {
    expect(geoZusammenfuehren({ 'schutz.lsg': bestaetigt(kein) }, { 'schutz.lsg': { ...kein, stand: '2026-11-12' } })['schutz.lsg'].bestaetigt?.von).toBe('TP');
    expect(geoZusammenfuehren({ 'schutz.lsg': bestaetigt(kein) }, { 'schutz.lsg': { ...kein, lage: '9,9' } })['schutz.lsg'].bestaetigt).toBeUndefined();
  });

  it('ein Treffer gegen „nein“ von Hand wird als Widerspruch vermerkt, „kein Treffer“ gegen „ja“ von Hand nicht', () => {
    const vonHand = (wert: boolean): FaktWert => ({ wert, herkunft: 'manuell', sicherheit: 'sicher', quelle: 'von Hand (TP)' });
    const r = geoZusammenfuehren({ 'schutz.lsg': vonHand(false) }, { 'schutz.lsg': treffer });
    expect(r['schutz.lsg'].wert).toBe(false);
    expect(r['schutz.lsg'].herkunft).toBe('manuell');
    expect(r['schutz.lsg'].widerspruch).toMatch(/LINFOS meldet „ja“/);
    expect(geoZusammenfuehren({ 'schutz.lsg': vonHand(true) }, { 'schutz.lsg': kein })['schutz.lsg'].widerspruch).toBeUndefined();
    // stimmt der Dienst später zu, verschwindet der Widerspruch
    expect(geoZusammenfuehren(r, { 'schutz.lsg': { ...treffer, wert: false, sicherheit: 'sicher' } })['schutz.lsg'].widerspruch).toBeUndefined();
  });

  it('Ergebnisse und Bestätigungen verfallen, wenn sich die Lage ändert', () => {
    const f = faktenZurLage({ a: bestaetigt(kein), b: treffer, c: { wert: false, herkunft: 'manuell', sicherheit: 'sicher' } }, '5,5');
    expect(f.a.bestaetigt).toBeUndefined();
    expect(f.a.sicherheit).toBe('hinweis');
    expect(f.b).toMatchObject({ wert: true, sicherheit: 'hinweis' });
    expect(f.b.grund).toMatch(/Koordinaten/);
    expect(f.c.sicherheit).toBe('sicher');
    expect(faktenZurLage({ a: bestaetigt(kein) }, '1,1').a.bestaetigt?.von).toBe('TP');
  });
});
