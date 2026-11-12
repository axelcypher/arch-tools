/**
 * Texterkennung für Satzungen und Verordnungen, die nur als Scan vorliegen (docs/baurecht-konzept.md, 4.4b): lädt
 * die Datei der Norm, rendert die Seiten (pdftoppm) und erkennt den Text (Tesseract, Sprachpaket „deu“), gliedert
 * ihn in Paragrafen und legt ihn unter `texte/<modul>/<norm>@<fassung>.json` ab. Gibt die SHA-256 der Datei aus –
 * sie gehört als `sha256` in die Quelle der Norm (modul.json). Der Text muss danach von Hand durchgesehen werden;
 * bis dahin trägt er `texterkennung: true` und die App zeigt das an.
 *
 *   NUR=nw-05974040/denkmalbereich SEITEN=1-12 npm run texterkennung -w @akh/baurecht-regeln
 *
 * Braucht poppler-utils (pdftoppm) und tesseract-ocr mit tesseract-ocr-deu.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { holen, holenOk } from '@core/recht/netz';
import { satzungParagrafen, satzungsDatum } from '@core/recht/quellen';
import { sha256 } from '@core/recht/text';
import { paketLaden, WURZEL } from '../test/laden';

it('Text eines Scans erkennen', async () => {
  const nur = process.env.NUR;
  expect(nur, 'NUR=<modul>/<norm> angeben').toBeTruthy();
  const [modulId, norm] = nur!.split('/');
  const def = paketLaden().module.find((m) => m.id === modulId)?.normen[norm];
  expect(def?.quelle.art, 'Quelle muss eine Datei sein').toBe('datei');
  const q = def!.quelle as { url: string };
  const r = await holenOk(holen, q.url);
  const tmp = mkdtempSync(join(tmpdir(), 'texterkennung-'));
  writeFileSync(join(tmp, 'scan.pdf'), r.daten);
  const [von, bis] = (process.env.SEITEN ?? '1-999').split('-').map(Number);
  execFileSync('pdftoppm', ['-r', '300', '-gray', '-f', String(von), '-l', String(bis), '-png', join(tmp, 'scan.pdf'), join(tmp, 's')], { stdio: 'inherit' });
  const zeilen: string[] = [];
  for (const bild of readdirSync(tmp).filter((n) => n.endsWith('.png')).sort()) {
    execFileSync('tesseract', [join(tmp, bild), join(tmp, bild), '-l', 'deu', '--psm', '4'], { stdio: 'ignore' });
    zeilen.push(...readFileSync(join(tmp, `${bild}.txt`), 'utf8').split('\n'));
  }
  const paragrafen = satzungParagrafen(zeilen, q.url);
  const datum = satzungsDatum(zeilen) ?? new Date().toISOString().slice(0, 10);
  const ziel = join(WURZEL, 'texte', modulId);
  mkdirSync(ziel, { recursive: true });
  writeFileSync(join(ziel, `${norm}@${datum}.json`), `${JSON.stringify({ quelle: q.url, texterkennung: true, durchgesehen: false, paragrafen }, null, 1)}\n`);
  console.log(`${nur}: ${Object.keys(paragrafen).length} Paragrafen erkannt → texte/${modulId}/${norm}@${datum}.json`);
  console.log(`SHA-256 der Datei (in modul.json als quelle.sha256 eintragen): ${await sha256(r.daten)}`);
});
