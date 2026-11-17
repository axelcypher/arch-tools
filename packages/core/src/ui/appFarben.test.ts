// Farben je App (base.css, „App-Farbe“): Kachelfarbe der Titelleiste, Akzent hell und dunkel, Bernstein für die
// Ausgabe. Regeln aus docs/design.md „Farben“: Kontrast mindestens 4,5 : 1 (WCAG AA), und eine App-Farbe dient nur dann
// als Akzent, wenn ihr Farbton mindestens 35° von ok, Warnung und Fehler entfernt ist – sonst bleibt der neutrale Akzent.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_NAMEN, appKennungZu, type AppKennung } from '../appNamen';

// Kommentare entfernen: Beispiele darin (z. B. „--x: …;“) sind keine Deklarationen
const css = readFileSync(new URL('./base.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Deklarationen eines Blocks mit genau diesem Selektor; ohne den Block leer (Pflichtblöcke: `muss`) */
function block(selektor: string): Record<string, string> {
  const i = css.indexOf(`${selektor} {`);
  if (i < 0) return {};
  const rumpf = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  return Object.fromEntries([...rumpf.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
/** wie `block`, aber der Block und die genannten Variablen müssen da sein */
function muss(selektor: string, ...namen: string[]): Record<string, string> {
  const b = block(selektor);
  for (const n of namen) if (!b[n]) throw new Error(`${n} fehlt in „${selektor}“ (base.css)`);
  return b;
}

const hell = muss(':root', '--panel', '--accent', '--accent-text', '--accent-soft', '--on-accent', '--ausgabe', '--ausgabe-hover', '--on-ausgabe', '--ok-punkt', '--warn-punkt', '--fehler-punkt');
const dunkel = muss(":root[data-theme='dunkel']", '--panel', '--accent', '--accent-text', '--accent-soft', '--on-accent', '--ausgabe-hover');
const leiste = muss(':root[data-app] .titlebar', '--tb-ungespeichert');

const rgb = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`keine Farbe: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const luminanz = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const kontrast = (a: string, b: string) => {
  const [x, y] = [luminanz(a), luminanz(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const farbton = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
/** a mit Deckung über b (Farbe auf undurchsichtigem Grund) */
const mischen = (a: string, b: string, deckung: number) =>
  '#' +
  rgb(a)
    .map((c, i) =>
      Math.round(c * deckung + rgb(b)[i] * (1 - deckung))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const abstand = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

const status = { ok: hell['--ok-punkt'], warnung: hell['--warn-punkt'], fehler: hell['--fehler-punkt'] };
const naechsterStatus = (hex: string) => Math.min(...Object.values(status).map((s) => abstand(farbton(hex), farbton(s))));

const apps = (Object.keys(APP_NAMEN) as AppKennung[]).filter((k) => k !== 'suite');

describe('Farben je App', () => {
  it('neutraler Akzent und Bernstein: Kontrast hell und dunkel', () => {
    expect(kontrast(hell['--accent'], hell['--panel'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(hell['--accent-text'], hell['--accent-soft'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(hell['--on-accent'], hell['--accent'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(dunkel['--accent'], dunkel['--panel'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(dunkel['--accent-text'], dunkel['--accent-soft'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(dunkel['--on-accent'], dunkel['--accent'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(hell['--on-ausgabe'], hell['--ausgabe'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(hell['--on-ausgabe'], hell['--ausgabe-hover'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(hell['--on-ausgabe'], dunkel['--ausgabe-hover'])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(apps)('%s: Kachelfarbe trägt weiße Schrift in der Titelleiste', (k) => {
    const app = muss(`:root[data-app='${k}']`, '--app')['--app'];
    expect(kontrast('#ffffff', app)).toBeGreaterThanOrEqual(4.5);
    // Nebentext der Leiste (Projekt): Weiß mit 82 % Deckung, auf die Kachelfarbe gerechnet
    expect(kontrast(mischen('#ffffff', app, 0.82), app)).toBeGreaterThanOrEqual(4.5);
    // Punkt für ungespeicherte Änderungen (Nicht-Text: 3 : 1)
    expect(kontrast(leiste['--tb-ungespeichert'], app)).toBeGreaterThanOrEqual(3);
  });

  it.each(apps)('%s: eigener Akzent nur mit Abstand zu ok, Warnung und Fehler – und mit Kontrast hell und dunkel', (k) => {
    const h = muss(`:root[data-app='${k}']`, '--app');
    const d = block(`:root[data-theme='dunkel'][data-app='${k}']`);
    const weitWeg = naechsterStatus(h['--app']) >= 35;
    // die Regel gilt in beide Richtungen: weit genug weg → Akzent aus der Kachelfarbe, sonst neutral
    expect(!!h['--accent'], `${k}: Farbton ${Math.round(farbton(h['--app']))}°, nächster Status ${Math.round(naechsterStatus(h['--app']))}° entfernt`).toBe(weitWeg);
    expect(!!d['--accent']).toBe(weitWeg);
    if (!weitWeg) return;
    expect(naechsterStatus(h['--accent'])).toBeGreaterThanOrEqual(35);
    expect(naechsterStatus(d['--accent'])).toBeGreaterThanOrEqual(35);
    expect(kontrast(h['--accent'], hell['--panel'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(h['--accent-text'], h['--accent-soft'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(hell['--on-accent'], h['--accent'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(hell['--on-accent'], h['--accent-hover'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(d['--accent'], dunkel['--panel'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(d['--accent-text'], d['--accent-soft'])).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(dunkel['--on-accent'], d['--accent'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('appKennungZu', () => {
  it('Produktname → Kennung; unbekannt → undefined', () => {
    expect(appKennungZu('QUADRIO')).toBe('flaechenrechner');
    expect(appKennungZu('Arkly')).toBe('suite');
    for (const k of Object.keys(APP_NAMEN) as AppKennung[]) expect(appKennungZu(APP_NAMEN[k].name)).toBe(k);
    expect(appKennungZu('Quadrio')).toBeUndefined();
    expect(appKennungZu('')).toBeUndefined();
  });
});
