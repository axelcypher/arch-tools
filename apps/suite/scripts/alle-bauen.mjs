// Web-Builds aller Apps, dann die Rahmen-App selbst (für tauri build und die CI). Plattformunabhängig – ohne
// „cd … &&“, das unter Windows (cmd) anders läuft.
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const stamm = resolve(hier, '../../..');
const apps = ['flaechenrechner', 'grz-nachweis', 'kostenermittlung', 'projektordner', 'entzerrung', 'formulare'];
execSync(`npm run build ${apps.map((a) => `-w ${a}`).join(' ')}`, { cwd: stamm, stdio: 'inherit' });
execSync('npm run build', { cwd: resolve(hier, '..'), stdio: 'inherit' });
