/**
 * Neue Fassung einer Norm einpflegen (docs/baurecht-konzept.md, 6.7): holt die geltende Fassung, legt eine neue
 * Regeldatei `<norm>@<gültig ab>.json` als Kopie der letzten an – mit neuen Prüfsummen für alle unveränderten
 * Fundstellen – und listet, was sich geändert hat. Deren Prüfsummen bleiben alt: Die Tests (und die App) zeigen sie
 * als „nicht an der geltenden Fassung geprüft“, bis die Regel angesehen und mit `npm run stand` (UEBERNEHMEN=1)
 * bestätigt ist.
 *
 *   NUR=nw/bauo-nrw npm run fassung -w @akh/baurecht-regeln
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { Regeldatei } from '@core/baurecht/typen';
import { holen } from '@core/recht/netz';
import { fassungHolen } from '@core/recht/quellen';
import { paketLaden, WURZEL } from '../test/laden';

it('neue Fassung anlegen', async () => {
  const nur = process.env.NUR;
  expect(nur, 'NUR=<modul>/<norm> angeben').toBeTruthy();
  const [modulId, norm] = nur!.split('/');
  const paket = paketLaden();
  const m = paket.module.find((x) => x.id === modulId);
  const def = m?.normen[norm];
  expect(def, `Norm ${nur} im Paket`).toBeTruthy();
  const l = paket.regeln.get(nur!) ?? [];
  expect(l.length, 'es gibt schon eine Regeldatei').toBeGreaterThan(0);
  const letzte = l[l.length - 1].regel;
  const f = await fassungHolen(holen, { id: norm, kurz: def!.kurz, titel: def!.titel }, def!.quelle, { textAusPaket: async (p) => paket.texte.get(p) ?? null });
  if (f === 'unveraendert') return;
  if (f.gueltigAb <= letzte.fassung) {
    console.log(`${nur}: geltende Fassung ${f.gueltigAb} – keine neuere als die Regeldatei ${letzte.fassung}`);
    return;
  }
  const neu: Regeldatei = structuredClone({ ...letzte, fassung: f.gueltigAb, version: 1 });
  const geaendert: string[] = [];
  for (const [nr, r] of Object.entries(neu.paragrafen))
    for (const fs of r.fundstellen ?? [nr]) {
      const s = f.summen[fs];
      if (!s) geaendert.push(`${fs} (weggefallen)`);
      else if (r.stand?.[fs] === s) continue;
      else geaendert.push(fs);
    }
  const pfad = join(WURZEL, 'module', modulId, `${norm}@${f.gueltigAb}.json`);
  expect(existsSync(pfad), `${pfad} gibt es schon`).toBe(false);
  writeFileSync(pfad, `${JSON.stringify(neu, null, 2)}\n`);
  console.log(`${nur}: neue Regeldatei für die Fassung ${f.gueltigAb} angelegt.`);
  console.log(geaendert.length ? `Geändert – Regeln ansehen: ${geaendert.join(', ')}` : 'Alle Fundstellen unverändert.');
});
