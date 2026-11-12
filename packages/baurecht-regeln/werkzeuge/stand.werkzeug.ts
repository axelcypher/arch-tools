/**
 * Prüfsummen in die Regeldateien schreiben: holt für jede Norm die geltende Fassung aus ihrer Quelle und trägt in
 * der neuesten Regeldatei je Fundstelle die Prüfsumme des Absatzes ein (`stand`). Meldet Fundstellen, die es im
 * Text nicht gibt, und neuere Fassungen, für die eine eigene Regeldatei angelegt werden sollte (npm run fassung).
 *
 *   npm run stand -w @akh/baurecht-regeln                 alle Normen
 *   NUR=nw/bauo-nrw npm run stand -w @akh/baurecht-regeln  eine Norm
 *
 * Ändert nur `stand` in den Regeldateien; wo sich eine Prüfsumme gegenüber dem bisherigen Stand ändert, wird das
 * gemeldet – dann muss die Regel an der neuen Fassung geprüft werden, bevor die Prüfsumme übernommen wird
 * (UEBERNEHMEN=1 übernimmt sie trotzdem).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import type { Regeldatei } from '@core/baurecht/typen';
import { holen } from '@core/recht/netz';
import { fassungHolen } from '@core/recht/quellen';
import type { Fassung } from '@core/recht/typen';
import { paketLaden, WURZEL } from '../test/laden';

const nur = process.env.NUR;
const uebernehmen = !!process.env.UEBERNEHMEN;

it('Prüfsummen eintragen', async () => {
  const paket = paketLaden();
  const meldungen: string[] = [];
  for (const m of paket.module)
    for (const [norm, def] of Object.entries(m.normen)) {
      const key = `${m.id}/${norm}`;
      if (nur && nur !== key) continue;
      if (def.quelle.art === 'verweis') continue;
      const dateien = paket.regeln.get(key);
      if (!dateien?.length) {
        meldungen.push(`${key}: keine Regeldatei`);
        continue;
      }
      let f: Fassung;
      try {
        const r = await fassungHolen(holen, { id: norm, kurz: def.kurz, titel: def.titel }, def.quelle, {
          textAusPaket: async (pfad) => {
            const t = paket.texte.get(pfad);
            return t ?? null;
          },
        });
        if (r === 'unveraendert') continue;
        f = r;
      } catch (e) {
        meldungen.push(`${key}: Text nicht abrufbar – ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      const neueste = dateien[dateien.length - 1];
      if (f.gueltigAb > neueste.regel.fassung && def.quelle.art !== 'gii') meldungen.push(`${key}: geltende Fassung ${f.gueltigAb} ist neuer als die Regeldatei ${neueste.regel.fassung} → npm run fassung`);
      const pfad = join(WURZEL, neueste.datei);
      const regel = JSON.parse(readFileSync(pfad, 'utf8')) as Regeldatei;
      let geaendert = false;
      for (const [nr, r] of Object.entries(regel.paragrafen)) {
        if (!f.paragrafen[nr]) {
          meldungen.push(`${key} § ${nr}: steht nicht im Text der geltenden Fassung`);
          continue;
        }
        const stand: Record<string, string> = {};
        for (const fs of r.fundstellen ?? [nr]) {
          const s = f.summen[fs];
          if (!s) {
            meldungen.push(`${key}: Fundstelle ${fs} gibt es im Text nicht`);
            continue;
          }
          if (r.stand?.[fs] && r.stand[fs] !== s && !uebernehmen) {
            meldungen.push(`${key}: § ${fs.replace('/', ' Abs. ')} hat sich geändert – Regel prüfen, dann mit UEBERNEHMEN=1 übernehmen`);
            stand[fs] = r.stand[fs];
            continue;
          }
          stand[fs] = s;
        }
        if (JSON.stringify(stand) !== JSON.stringify(r.stand ?? {})) {
          r.stand = stand;
          geaendert = true;
        }
      }
      if (geaendert) {
        writeFileSync(pfad, `${JSON.stringify(regel, null, 2)}\n`);
        console.log(`${key}: Prüfsummen eingetragen (${neueste.datei})`);
      } else console.log(`${key}: unverändert`);
    }
  if (meldungen.length) console.log(`\nMeldungen:\n${meldungen.map((x) => `  - ${x}`).join('\n')}`);
});
