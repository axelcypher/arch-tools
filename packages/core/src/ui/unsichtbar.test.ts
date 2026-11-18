import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'base.css'), 'utf8');

describe('.unsichtbar (nur für Screenreader)', () => {
  it('blendet über clip-path aus, clip als Rückfall, ohne display: none', () => {
    const i = css.indexOf('\n.unsichtbar,');
    expect(i).toBeGreaterThan(-1);
    const r = css.slice(i, css.indexOf('}', i));
    expect(r).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(r).toMatch(/clip:\s*rect\(0 0 0 0\)/);
    expect(r).toMatch(/margin:\s*-1px/);
    expect(r).toMatch(/padding:\s*0;/);
    expect(r).toMatch(/border:\s*0;/);
    expect(r).not.toMatch(/display:\s*none|visibility/);
  });

  it('eine Regel für alle Namen (.nur-vorlesen gleichwertig), keine zweite Kopie in core', () => {
    expect(css).toMatch(/\n\.unsichtbar,\n\.nur-vorlesen,\n\.titlebar-unsichtbar \{/);
    expect(css).not.toMatch(/\n\.nur-vorlesen \{/);
  });
});
