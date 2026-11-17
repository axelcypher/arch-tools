import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Die Startseite ist in allen Apps derselbe Baustein (docs/design.md „Startseite“): die Projektübersicht aus core
 * (direkt oder über `ProjektWahl`), ohne eigene Gestaltung. Apps liefern nur Daten in die Slots.
 */
const wurzel = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const appsOrdner = join(wurzel, 'apps');
const dateien = (ordner: string, endung: RegExp): string[] =>
  readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' || n === 'dist' || n === 'src-tauri' ? [] : dateien(p, endung);
    return endung.test(n) ? [p] : [];
  });
/** Apps mit Projektübersicht – Arkly (suite) hat keine Projekte, nur die Übersicht der Apps */
const apps = readdirSync(appsOrdner).filter((a) => a !== 'suite' && statSync(join(appsOrdner, a, 'src')).isDirectory());

describe('Startseite: in allen Apps derselbe Baustein', () => {
  it.each(apps)('%s nutzt die Projektübersicht aus core', (app) => {
    const quellen = dateien(join(appsOrdner, app, 'src'), /\.tsx$/)
      .filter((d) => !/\.test\.tsx$/.test(d))
      .map((d) => readFileSync(d, 'utf8'));
    expect(quellen.some((q) => /from '@core\/ui\/(ProjektWahl|ProjektUebersicht)'/.test(q))).toBe(true);
  });

  it('keine App-CSS gestaltet die Projektübersicht oder den Einstieg um (.pa…, .pw…)', () => {
    const treffer = dateien(appsOrdner, /\.css$/).flatMap((d) =>
      readFileSync(d, 'utf8')
        .split('\n')
        .map((zeile, i) => ({ zeile, i }))
        .filter(({ zeile }) => /(^|[\s,>+~(])\.(pa|pw)(-[\w-]+)?(?![\w-])/.test(zeile))
        .map(({ zeile, i }) => `${d.slice(wurzel.length + 1)}:${i + 1}: ${zeile.trim()}`),
    );
    expect(treffer).toEqual([]);
  });

  it('die Übersicht hat feste Slots statt eines freien Kopfs', () => {
    const quelle = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ProjektUebersicht.tsx'), 'utf8');
    expect(quelle).not.toMatch(/\n\s+kopf\?: ReactNode/);
    for (const slot of ['neu?: UebersichtAktion', 'dateiOeffnen?: UebersichtAktion', 'weitere?:', 'status?:', 'marken?:', 'kontextMenue?:', 'leer?: ReactNode']) expect(quelle).toContain(slot);
  });
});
