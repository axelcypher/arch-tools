/**
 * Abgleich mit den echten Quellen – nur mit `LIVE=1` (braucht Netz; in der CI nur im Wächter-Workflow).
 *   LIVE=1 npx vitest run packages/core/src/recht/quellen.live.test.ts
 */
import { describe, expect, it } from 'vitest';
import { holen } from './netz';
import { fassungHolen, listeHolen, mvvtbAusgabe } from './quellen';
import type { Fassung } from './typen';

const live = !!process.env.LIVE;
const kopf = (id: string) => ({ id, kurz: id, titel: id });
const fassung = async (...a: Parameters<typeof fassungHolen>) => {
  const f = await fassungHolen(...a);
  if (f === 'unveraendert') throw new Error('unerwartet unverändert');
  return f as Fassung;
};

describe.skipIf(!live)('Quellen live', { timeout: 120000 }, () => {
  it('gesetze-im-internet.de: BauGB mit § 35 und Prüfsummen', async () => {
    const f = await fassung(holen, kopf('baugb'), { art: 'gii', pfad: 'bbaug' });
    expect(f.paragrafen['35'].titel).toBe('Bauen im Außenbereich');
    expect(f.summen['35/1']).toMatch(/^[0-9a-f]{8}$/);
    expect(Object.keys(f.paragrafen).length).toBeGreaterThan(200);
  });

  it('RIS: BauNVO zum Stichtag', async () => {
    const f = await fassung(holen, kopf('baunvo'), { art: 'ris', eli: 'eli/bund/bgbl-1/1962/s429', gii: 'baunvo' });
    expect(f.paragrafen['19'].titel).toMatch(/Grundflächenzahl/);
    expect(f.gueltigAb).toMatch(/^\d{4}-\d\d-\d\d$/);
  });

  it('recht.nrw.de: BauO NRW über den Term-Link', async () => {
    const f = await fassung(holen, kopf('bauo-nrw'), { art: 'recht-nrw', term: 32203 });
    expect(f.paragrafen['6'].titel).toBe('Abstandsflächen');
    expect(f.paragrafen['42a'].text.join(' ')).toMatch(/solarer Strahlungsenergie/);
    expect(Object.keys(f.paragrafen).length).toBeGreaterThan(80);
  });

  it('recht.nrw.de: LWG mit § 104a (ohne §-Zeichen)', async () => {
    const f = await fassung(holen, kopf('lwg'), { art: 'recht-nrw', term: 26930 });
    expect(f.paragrafen['104a']).toBeDefined();
  });

  it('Ortsrecht: Stellplatzsatzung Soest (PDF)', async () => {
    const f = await fassung(holen, kopf('stellplatz'), {
      art: 'datei',
      format: 'pdf',
      url: 'https://www.soest.de/fileadmin/user_upload/Dokumente/Politik_und_Verwaltung/Bekanntmachungen_und_Satzungen/Stellplatzsatzung_-_Soest.pdf',
    });
    expect(Object.keys(f.paragrafen).length).toBeGreaterThanOrEqual(5);
    expect(f.kennung).toMatch(/^sha256:/);
  });

  it('DIBt: neueste MVV TB in der Liste', async () => {
    const l = await listeHolen(holen, 'https://www.dibt.de/de/service/bekanntmachungen');
    expect(mvvtbAusgabe(l)?.ausgabe).toMatch(/^\d{4}\/\d$/);
  });
});
