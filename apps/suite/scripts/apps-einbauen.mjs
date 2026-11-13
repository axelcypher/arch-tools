// Baut die Web-Builds aller Apps in die Rahmen-App ein: apps/<app>/dist → <ziel>/<app>/ und setzt in jede
// index.html die Brücke zum Rahmen (rahmen-bruecke.js) vor die Skripte der App. Aufruf: node scripts/apps-einbauen.mjs <ziel>
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const apps = resolve(hier, '../..');
const ziel = resolve(hier, '..', process.argv[2] ?? 'dist/apps');
export const APPS = ['ordner', 'baurecht', 'formulare', 'flaechenrechner', 'grz', 'kosten', 'entzerrung', 'ava'];

rmSync(ziel, { recursive: true, force: true });
const fehlen = APPS.filter((a) => !existsSync(join(apps, a, 'dist', 'index.html')));
if (fehlen.length) {
  console.error(`Web-Build fehlt: ${fehlen.join(', ')} – zuerst „npm run build“ im Stamm (oder npm run build:alle hier).`);
  process.exit(1);
}
for (const a of APPS) {
  cpSync(join(apps, a, 'dist'), join(ziel, a), { recursive: true });
  const html = join(ziel, a, 'index.html');
  const s = readFileSync(html, 'utf8');
  if (!s.includes('rahmen-bruecke.js')) writeFileSync(html, s.replace(/<head>/i, '<head>\n    <script src="../../rahmen-bruecke.js"></script>'));
}
console.log(`Apps eingebaut: ${APPS.join(', ')} → ${ziel}`);
