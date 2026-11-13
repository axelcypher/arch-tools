import { describe, expect, it } from 'vitest';
import { VORGABE_MERKMALE } from '../bedingung';
import { indexLesen, paketIndex, paketNeuer, signiertesPaket } from './paket';
import type { Modul, Regeldatei } from './typen';

const bund: Modul = {
  format: 1,
  id: 'bund',
  name: 'Bund',
  ebene: 'bund',
  version: '2026-11-12',
  normen: { baugb: { kurz: 'BauGB', titel: 'Baugesetzbuch', thema: 'planungsrecht', quelle: { art: 'gii', pfad: 'bbaug' } } },
};
const baugb: Regeldatei = { format: 1, modul: 'bund', norm: 'baugb', fassung: '2023-12-28', version: 1, paragrafen: { '35': { gilt: { m: 'Planungsrecht', in: ['Außenbereich'] }, grund: 'Außenbereich.' } } };

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const bytes = (x: unknown) => new TextEncoder().encode(JSON.stringify(x));

/** signiertes Paket wie aus `npm run index` (Schlüssel nur für den Test) */
async function bauen(dateien: Record<string, unknown>, version = '2026.11.13-4', format?: number) {
  const k = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const roh: Record<string, Uint8Array> = Object.fromEntries(Object.entries(dateien).map(([p, x]) => [p, bytes(x)]));
  const index = await paketIndex(roh, version, ['gis.beispiel.de']);
  if (format !== undefined) index.format = format;
  const indexText = JSON.stringify(index);
  const signatur = b64(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, k.privateKey, new TextEncoder().encode(indexText))));
  const schluessel = b64(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey)));
  return { indexText, signatur, schluessel, roh };
}

const datei = (roh: Record<string, Uint8Array>) => async (p: string) => roh[p] ?? null;
const DATEIEN = { 'module/bund/modul.json': bund, 'module/bund/baugb@2023-12-28.json': baugb };

describe('signiertes Regelpaket', () => {
  it('übernimmt ein vollständig passendes Paket', async () => {
    const s = await bauen(DATEIEN);
    const r = await signiertesPaket({ ...s, datei: datei(s.roh), merkmale: VORGABE_MERKMALE });
    expect('fehler' in r ? r.fehler : '').toBe('');
    if ('paket' in r) {
      expect(r.paket.version).toBe('2026.11.13-4');
      expect(r.paket.herkunft).toBe('nachgeladen');
      expect(r.paket.regeln.get('bund/baugb')?.[0].regel.paragrafen['35']).toBeTruthy();
      expect(r.index.hosts).toEqual(['gis.beispiel.de']);
    }
  });

  it('verwirft das ganze Paket, wenn eine Datei manipuliert ist (z. B. „entfällt immer“ in der Ablage)', async () => {
    const s = await bauen(DATEIEN);
    const boese = { ...baugb, paragrafen: { '35': { ...baugb.paragrafen['35'], entfaellt: { immer: true } } } };
    const r = await signiertesPaket({ ...s, datei: datei({ ...s.roh, 'module/bund/baugb@2023-12-28.json': bytes(boese) }), merkmale: VORGABE_MERKMALE });
    expect(r).toEqual({ fehler: 'module/bund/baugb@2023-12-28.json passt nicht zum Index' });
  });

  it('verwirft bei fehlender Datei, falscher Signatur, fremdem Schlüssel und neuerem Format', async () => {
    const s = await bauen(DATEIEN);
    const fehlt = { ...s.roh };
    delete fehlt['module/bund/baugb@2023-12-28.json'];
    expect(await signiertesPaket({ ...s, datei: datei(fehlt), merkmale: VORGABE_MERKMALE })).toEqual({ fehler: 'module/bund/baugb@2023-12-28.json fehlt' });
    // Index nachträglich geändert (zusätzlicher Host) → Signatur passt nicht mehr
    const geaendert = s.indexText.replace('gis.beispiel.de', 'boese.example');
    expect(await signiertesPaket({ ...s, indexText: geaendert, datei: datei(s.roh), merkmale: VORGABE_MERKMALE })).toEqual({ fehler: 'Signatur ungültig' });
    const fremd = await bauen(DATEIEN);
    expect(await signiertesPaket({ ...s, schluessel: fremd.schluessel, datei: datei(s.roh), merkmale: VORGABE_MERKMALE })).toEqual({ fehler: 'Signatur ungültig' });
    expect(await signiertesPaket({ ...s, schluessel: '', datei: datei(s.roh), merkmale: VORGABE_MERKMALE })).toEqual({ fehler: 'kein öffentlicher Schlüssel' });
    const neu = await bauen(DATEIEN, '2026.11.13-5', 2);
    const r = await signiertesPaket({ ...neu, datei: datei(neu.roh), merkmale: VORGABE_MERKMALE });
    expect('fehler' in r && r.fehler).toMatch(/neuere App-Version/);
  });

  it('verwirft ein signiertes Paket mit Regeln, die diese App-Version nicht kennt', async () => {
    const unbekannt = { ...baugb, paragrafen: { '35': { gilt: { f: 'gibt.es.nicht', ist: true }, grund: 'x' } } };
    const s = await bauen({ ...DATEIEN, 'module/bund/baugb@2023-12-28.json': unbekannt });
    const r = await signiertesPaket({ ...s, datei: datei(s.roh), merkmale: VORGABE_MERKMALE });
    expect('fehler' in r && r.fehler).toMatch(/passt nicht zu dieser App-Version: .*gibt\.es\.nicht/);
  });

  it('prüft den Aufbau des Index', () => {
    expect(indexLesen('{')).toBe('Index ist kein JSON');
    expect(indexLesen(JSON.stringify({ paket: 'x', format: 1, dateien: {}, hosts: [] }))).toMatch(/Paketversion/);
    expect(indexLesen(JSON.stringify({ paket: '2026.1.1-1', format: 1, dateien: { '../x.json': { sha256: 'a', groesse: 1 } }, hosts: [] }))).toMatch(/unzulässiger Dateipfad/);
    expect(indexLesen(JSON.stringify({ paket: '2026.1.1-1', format: 1, dateien: { 'module/bund/modul.json': { sha256: 'a' } }, hosts: [] }))).toMatch(/Größe/);
    expect(typeof indexLesen(JSON.stringify({ paket: '2026.1.1-1', format: 1, erstellt: '', dateien: { 'module/bund/modul.json': { sha256: 'a', groesse: 1 } }, hosts: ['a.de'] }))).toBe('object');
  });
});

describe('Paketversionen', () => {
  it('Laufnummern zählen nur gegeneinander, der Build gewinnt bei gleicher Version', () => {
    expect(paketNeuer('2026.11.13-1', '2026.11.12')).toBe(true);
    expect(paketNeuer('2026.11.12-9', '2026.11.12')).toBe(false);
    expect(paketNeuer('2026.11.12-9', '2026.11.12-3')).toBe(true);
    expect(paketNeuer('2026.11.12-3', '2026.11.12-9')).toBe(false);
    expect(paketNeuer('2026.11.12', '2026.11.12')).toBe(false);
    expect(paketNeuer('2026.11.12-1', '2026.12.1')).toBe(false);
    expect(paketNeuer('2026.12.1-1', '2026.11.30-7')).toBe(true);
  });
});
