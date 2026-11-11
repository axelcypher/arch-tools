import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../model';
import { readProjectFile, writeArchive } from '../archive';
import { geokodiererSetzen, koordinatenFuerQgis, koordinatenVeraltet, mitKoordinaten } from './geokodierung';

const meta = (strasse: string, plz: string, ort: string) => ({ ...createProject().meta, adresse: { strasse, plz, ort } });
afterEach(() => geokodiererSetzen(null));

describe('Koordinaten zur Adresse (EPSG:25832)', () => {
  it('fragt strukturiert bei Nominatim, rechnet nach UTM 32N und sichert sie mit der Projektdatei', async () => {
    const abruf = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => [{ lat: '50.94133', lon: '6.95833', place_rank: 30 }] }));
    geokodiererSetzen(abruf);
    const r = await mitKoordinaten(meta('Domkloster 4', '50667', 'Köln'));
    const url = new URL(abruf.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ street: 'Domkloster 4', postalcode: '50667', city: 'Köln', countrycodes: 'de', format: 'jsonv2' });
    expect(r.meta.koordinaten).toMatchObject({ epsg: 25832, ost: 356562.46, nord: 5645285.41, adresse: 'Domkloster 4, 50667 Köln', quelle: 'OpenStreetMap (Nominatim)', genauigkeit: 'adresse' });
    expect(koordinatenFuerQgis(r.meta.koordinaten!)).toBe('356562.46, 5645285.41');
    // Roundtrip in der Projektdatei
    const p = { ...createProject(), meta: r.meta };
    expect(readProjectFile(writeArchive(p)).meta.koordinaten).toEqual(r.meta.koordinaten);
    // unveränderte Adresse: keine neue Abfrage
    expect(koordinatenVeraltet(r.meta)).toBe(false);
    await mitKoordinaten(r.meta);
    expect(abruf).toHaveBeenCalledTimes(1);
  });

  it('geänderte Adresse ohne Treffer oder ohne Verbindung: alte Koordinaten entfallen, mit Hinweis', async () => {
    geokodiererSetzen(async () => ({ ok: true, status: 200, json: async () => [{ lat: '51.96236', lon: '7.62571', place_rank: 26 }] }));
    const alt = (await mitKoordinaten(meta('Prinzipalmarkt', '48143', 'Münster'))).meta;
    expect(alt.koordinaten?.genauigkeit).toBe('strasse');
    geokodiererSetzen(async () => ({ ok: true, status: 200, json: async () => [] }));
    const leer = await mitKoordinaten({ ...alt, adresse: { strasse: 'Gibtsnicht 1', plz: '48143', ort: 'Münster' } });
    expect(leer.meta.koordinaten).toBeUndefined();
    expect(leer.hinweis).toContain('keine Koordinaten gefunden');
    geokodiererSetzen(async () => {
      throw new Error('Netz');
    });
    const offline = await mitKoordinaten({ ...alt, adresse: { strasse: 'Andere 2', plz: '48143', ort: 'Münster' } });
    expect(offline.meta.koordinaten).toBeUndefined();
    expect(offline.hinweis).toContain('ließen sich nicht abfragen');
    // unvollständige Adresse: keine Abfrage
    expect(koordinatenVeraltet(meta('', '48143', 'Münster'))).toBe(false);
  });
});
