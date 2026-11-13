/**
 * Druck (B-02): Die Druckregel aus packages/core blendet alles außer Berichten aus. Formulare muss sie für die
 * Formularblätter aufheben (spezifischere Regel) und darf im Druck keine Zutaten der App zeigen.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const lies = (pfad: string) => readFileSync(fileURLToPath(new URL(pfad, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const BASE = lies('../../../packages/core/src/ui/base.css');
const FORMULARE = lies('./styles.css');

/** Inhalt aller `@media print { … }`-Blöcke */
function druckBloecke(css: string): string[] {
  const out: string[] = [];
  for (let i = css.indexOf('@media print'); i >= 0; i = css.indexOf('@media print', i + 1)) {
    const auf = css.indexOf('{', i);
    let tiefe = 0;
    for (let j = auf; j < css.length; j++) {
      if (css[j] === '{') tiefe++;
      else if (css[j] === '}' && --tiefe === 0) {
        out.push(css.slice(auf + 1, j));
        break;
      }
    }
  }
  return out;
}

interface Regel {
  selektoren: string[];
  deklarationen: string;
}

/** Regeln eines Blocks (verschachtelte @-Regeln wie @page übersprungen) */
function regeln(block: string): Regel[] {
  const out: Regel[] = [];
  let i = 0;
  while (i < block.length) {
    const auf = block.indexOf('{', i);
    if (auf < 0) break;
    const kopf = block.slice(i, auf).trim();
    let tiefe = 0;
    let j = auf;
    for (; j < block.length; j++) {
      if (block[j] === '{') tiefe++;
      else if (block[j] === '}' && --tiefe === 0) break;
    }
    if (!kopf.startsWith('@')) out.push({ selektoren: kopf.split(',').map((s) => s.trim().replace(/\s+/g, ' ')), deklarationen: block.slice(auf + 1, j) });
    i = j + 1;
  }
  return out;
}

/** Spezifität [IDs, Klassen/Pseudoklassen/Attribute, Elemente]; `:not(x)` zählt wie x */
function spezifitaet(sel: string): [number, number, number] {
  const ohneNot = sel.replace(/:not\(([^)]*)\)/g, ' $1');
  const ids = (ohneNot.match(/#[\w-]+/g) ?? []).length;
  const klassen = (ohneNot.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  const elemente = (ohneNot.replace(/[.#:][\w-]+|\[[^\]]*\]/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return [ids, klassen, elemente];
}
const groesser = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const blendetAus = (r: Regel) => /display\s*:\s*none\s*!important/.test(r.deklarationen);
const zeigt = (r: Regel) => /display\s*:\s*block\s*!important/.test(r.deklarationen);

describe('Druck der Formulare (B-02)', () => {
  const core = druckBloecke(BASE).flatMap(regeln);
  const eigene = druckBloecke(FORMULARE).flatMap(regeln);

  it('die Druckregel aus core blendet die App aus – PERMIO hebt sie für .fo-main mit höherer Spezifität auf', () => {
    const ausblenden = core.filter(blendetAus).flatMap((r) => r.selektoren.filter((s) => s.startsWith('.app >')));
    expect(ausblenden.length).toBeGreaterThan(0);
    const aufheben = eigene.filter(zeigt).flatMap((r) => r.selektoren.filter((s) => /\.fo-main$/.test(s)));
    expect(aufheben.length).toBeGreaterThan(0);
    for (const a of ausblenden) for (const s of aufheben) expect(groesser(spezifitaet(s), spezifitaet(a)), `${s} gegen ${a}`).toBeGreaterThan(0);
  });

  it('Formularblätter sichtbar, ein Blatt je Seite; Info-Symbole, Hinweise und Gliederung ausgeblendet', () => {
    const versteckt = new Set(eigene.filter(blendetAus).flatMap((r) => r.selektoren));
    for (const s of ['.fo-entfall-info', '.fo-tipp', '.fo-gliederung', '.fo-umrandung', '.fo-blatt-kopf']) expect(versteckt, s).toContain(s);
    expect([...versteckt].filter((s) => /fo-blatt$|fo-papier$|fo-inhalt$/.test(s))).toEqual([]);
    expect(eigene.some((r) => r.selektoren.includes('.fo-blatt') && /break-after\s*:\s*page/.test(r.deklarationen))).toBe(true);
    expect(/@page\s*{[^}]*size\s*:\s*A4 portrait/.test(druckBloecke(FORMULARE).join('\n'))).toBe(true);
  });

  it('keine Farben der App im Druck: entfallende/offene Felder, Autofill, Textmarker, Feldhinterlegung', () => {
    const neutral = new Set(
      eigene.filter((r) => /background\s*:\s*transparent\s*!important/.test(r.deklarationen) && /box-shadow\s*:\s*none\s*!important/.test(r.deklarationen)).flatMap((r) => r.selektoren),
    );
    for (const s of [
      '.fo-papier .fo-memo',
      '.fo-papier .fo-memo.entfaellt',
      '.fo-papier .fo-memo.offen',
      '.fo-papier .fo-memo.auto',
      '.fo-papier .fo-memo.fixiert',
      '.fo-papier .fo-memo.markiert',
      '.fo-papier .fo-memo.geaendert',
      '.fo-papier .fo-check input',
      '.fo-papier .fo-check.entfaellt input',
    ])
      expect(neutral, s).toContain(s);
  });
});
