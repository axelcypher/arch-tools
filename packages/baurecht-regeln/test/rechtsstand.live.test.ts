/**
 * Wächter (docs/baurecht-konzept.md, 4.8): holt für jede Norm aller Module die geltende Fassung und prüft, dass jede
 * Fundstelle der neuesten Regeldatei im Text steht und ihre Prüfsumme noch stimmt. Nur mit LIVE=1 (Netz); in der CI
 * wöchentlich – schlägt er fehl, legt der Workflow ein Issue mit den betroffenen Regeln an.
 *
 *   LIVE=1 npx vitest run --project regeln test/rechtsstand.live.test.ts
 */
import { describe, expect, it } from 'vitest';
import { holen } from '@core/recht/netz';
import { fassungHolen } from '@core/recht/quellen';
import { paketLaden } from './laden';

const live = !!process.env.LIVE;

describe.skipIf(!live)('Rechtsstand der Regeln', () => {
  const paket = paketLaden();
  for (const m of paket.module)
    for (const [norm, def] of Object.entries(m.normen)) {
      if (def.quelle.art === 'verweis') continue;
      it(`${m.id}/${norm}: Fundstellen vorhanden und unverändert`, { timeout: 180000 }, async () => {
        const l = paket.regeln.get(`${m.id}/${norm}`) ?? [];
        expect(l.length, 'Regeldatei vorhanden').toBeGreaterThan(0);
        const f = await fassungHolen(holen, { id: norm, kurz: def.kurz, titel: def.titel }, def.quelle, { textAusPaket: async (p) => paket.texte.get(p) ?? null });
        if (f === 'unveraendert') return;
        const regel = l[l.length - 1].regel;
        const probleme: string[] = [];
        for (const [nr, r] of Object.entries(regel.paragrafen))
          for (const fs of r.fundstellen ?? [nr]) {
            if (!f.summen[fs]) probleme.push(`${fs}: steht nicht im Text`);
            else if (r.stand?.[fs] && r.stand[fs] !== f.summen[fs]) probleme.push(`${fs}: Text geändert`);
          }
        if (f.gueltigAb > regel.fassung && def.quelle.art !== 'gii') probleme.push(`neue Fassung ab ${f.gueltigAb} (Regeldatei: ${regel.fassung}) → npm run fassung`);
        expect(probleme, `${def.kurz}: Regeln nachziehen`).toEqual([]);
      });
    }
});
