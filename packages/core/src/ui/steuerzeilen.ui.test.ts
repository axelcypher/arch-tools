import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');

/** Die Liste im :where(...) der einzigen Regel mit dem gegebenen Rest des Selektors */
function liste(rest: RegExp): string[] {
  const treffer = [...css.matchAll(new RegExp(String.raw`:where\(([^)]*)\)\s*` + rest.source, 'g'))];
  // genau eine Regel, sonst prüfte der Test still die falsche Liste
  expect(treffer.length, rest.source).toBe(1);
  return treffer[0][1].split(',').map((s) => s.trim());
}

describe('Steuerzeilen', () => {
  it('.rollend-kopf und .karte-leiste zählen wie .toolbar: Knöpfe, Felder und Segmente in --ctl-h', () => {
    for (const zeile of ['.toolbar', '.rollend-kopf', '.karte-leiste']) {
      expect(liste(/:where\(button\),/)).toContain(zeile);
      expect(liste(/:where\(select, input:not/)).toContain(zeile);
      expect(liste(/:where\(button\.small, button\.icon\) \{/)).toContain(zeile);
      expect(liste(/:where\(\.segment\) > :where\(button\) \{\s*min-height:\s*calc\(var\(--ctl-h\) - 2px\)/)).toContain(zeile);
    }
  });

  it('Kästchen mit Text hält Abstand aus der Skala', () => {
    const i = css.indexOf('\n.toggle {');
    expect(css.slice(i, css.indexOf('}', i))).toMatch(/margin-right:\s*var\(--s2\)/);
    expect(css).toMatch(/\.karte-aktionen > \.toggle:last-child \{\s*margin-right:\s*0;/);
  });
});
