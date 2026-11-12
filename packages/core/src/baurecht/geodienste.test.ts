import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Holen } from '../recht/netz';
import { alsFakt, dienstAbfragen, flurstueckAus, gfiAus, pruefpunkte } from './geodienste';
import type { FaktDef, GeodienstDef } from './typen';

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

  it('Fehler des Dienstes: kein Treffer, nicht vollständig abgefragt', async () => {
    const kaputt: Holen = async (url) => ({ status: 503, url, daten: new Uint8Array() });
    const e = await dienstAbfragen(async (u, o) => kaputt(u, o), dienst, null, { x: 0, y: 0 });
    expect(e).toMatchObject({ treffer: false, vollstaendigAbgefragt: false });
    expect(alsFakt(def, dienst, e, { genau: true, heute: '2026-11-12' })!.grund).toMatch(/nicht alle Abfragen/);
  }, 20000);
});
