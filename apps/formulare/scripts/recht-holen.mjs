#!/usr/bin/env node
/**
 * Holt die Gesetzestexte, auf die sich die Vorgaben der Formulare stützen, aus den amtlichen Quellen und legt sie als
 * JSON unter src/recht/daten/ ab (Gesetze sind amtliche Werke, § 5 UrhG). Erneut ausführen, wenn eine neue Fassung
 * gilt – dann die URL unten anpassen:
 *
 *   node apps/formulare/scripts/recht-holen.mjs
 *
 * Landesrecht NRW von recht.nrw.de (ganze Gesetze), Bundesrecht von gesetze-im-internet.de (einzelne Paragrafen).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ZIEL = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/core/src/recht/daten');

/** Landesrecht: ganze Fassung */
const LAND = [
  {
    id: 'bauo-nrw',
    kurz: 'BauO NRW 2018',
    titel: 'Bauordnung für das Land Nordrhein-Westfalen (Landesbauordnung 2018)',
    url: 'https://recht.nrw.de/lrgv/gesetz/01092026-landesbauordnung-2018-bauo-nrw-2018',
  },
  {
    id: 'baupruefvo',
    kurz: 'BauPrüfVO',
    titel: 'Verordnung über bautechnische Prüfungen (BauPrüfVO)',
    url: 'https://recht.nrw.de/lrgv/rechtsverordnung/26112024-verordnung-ueber-bautechnische-pruefungen-baupruefvo-1',
  },
];

/** Bundesrecht: einzelne Paragrafen */
const BUND = [
  { id: 'baugb', kurz: 'BauGB', titel: 'Baugesetzbuch', pfad: 'bbaug', paragrafen: ['29', '30', '31', '34', '35', '36', '246e'] },
  { id: 'baunvo', kurz: 'BauNVO', titel: 'Baunutzungsverordnung', pfad: 'baunvo', paragrafen: ['16', '17', '19', '20', '21'] },
  { id: 'bnatschg', kurz: 'BNatSchG', titel: 'Bundesnaturschutzgesetz', pfad: 'bnatschg_2009', paragrafen: ['44'] },
  { id: 'geig', kurz: 'GEIG', titel: 'Gebäude-Elektromobilitätsinfrastruktur-Gesetz', pfad: 'geig', paragrafen: ['6', '7', '10'] },
];

const ENTITAETEN = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", sect: '§', shy: '' };
const entschluesseln = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (g, n) => ENTITAETEN[n.toLowerCase()] ?? (/^[a-z]uml$/i.test(n) ? { auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü' }[n] : n === 'szlig' ? 'ß' : g));

/** Text eines HTML-Stücks: Absätze, Listenpunkte und Zeilenumbrüche werden zu eigenen Zeilen */
function zeilen(html) {
  const t = entschluesseln(
    html
      .replace(/<(br|\/p|\/div|\/li|\/dd|\/dt|\/tr)[^>]*>/gi, '\n')
      .replace(/<dt[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  );
  return t
    .split('\n')
    .map((z) => z.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

async function laden(url, kodierung = 'utf-8') {
  const r = await fetch(url, { headers: { 'User-Agent': 'arch-tools Formulare (Gesetzestexte)' } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return new TextDecoder(kodierung).decode(await r.arrayBuffer());
}

async function landesrecht(g) {
  const html = await laden(g.url);
  const fassung = /G(?:ü|&uuml;)ltig ab\s*(?:<[^>]+>\s*)*([0-9.]{10})/.exec(html)?.[1];
  const paragrafen = {};
  for (const teil of html.split('<section class="legaldoc-article">').slice(1)) {
    const anker = /id="(ss-[^"]+)"/.exec(teil)?.[1];
    const nr = /field--field_num">\s*§\s*([0-9]+[a-z]?)\s*</.exec(teil)?.[1];
    if (!anker || !nr) continue;
    const titel = entschluesseln(/field--field_headline">([\s\S]*?)<\/span>/.exec(teil)?.[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const start = teil.indexOf('field--field_text');
    if (start < 0) continue;
    const text = zeilen(teil.slice(teil.indexOf('>', start) + 1));
    paragrafen[nr] = { titel, url: `${g.url}#${anker}`, text };
  }
  if (Object.keys(paragrafen).length < 10) throw new Error(`${g.kurz}: nur ${Object.keys(paragrafen).length} Paragrafen gefunden`);
  return { id: g.id, kurz: g.kurz, titel: g.titel, fassung: fassung ? `gültig ab ${fassung}` : '', url: g.url, paragrafen };
}

async function bundesrecht(g) {
  const paragrafen = {};
  for (const nr of g.paragrafen) {
    const url = `https://www.gesetze-im-internet.de/${g.pfad}/__${nr}.html`;
    const html = await laden(url, 'iso-8859-1');
    const titel = entschluesseln(/class="jnentitel">([\s\S]*?)<\/span>/.exec(html)?.[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .trim();
    const absaetze = [...html.matchAll(/<div class="jurAbsatz">([\s\S]*?)<\/div>(?=\s*(?:<div class="jurAbsatz">|<\/div>))/g)].flatMap((m) => zeilen(m[1]));
    if (!absaetze.length) throw new Error(`${g.kurz} § ${nr}: kein Text`);
    paragrafen[nr] = { titel, url, text: absaetze };
  }
  return { id: g.id, kurz: g.kurz, titel: g.titel, fassung: `Stand ${new Date().toLocaleDateString('de-DE')}`, url: `https://www.gesetze-im-internet.de/${g.pfad}/`, paragrafen };
}

mkdirSync(ZIEL, { recursive: true });
for (const g of LAND) {
  const d = await landesrecht(g);
  writeFileSync(join(ZIEL, `${g.id}.json`), JSON.stringify(d, null, 1) + '\n');
  console.log(`${g.kurz}: ${Object.keys(d.paragrafen).length} Paragrafen, ${d.fassung}`);
}
for (const g of BUND) {
  const d = await bundesrecht(g);
  writeFileSync(join(ZIEL, `${g.id}.json`), JSON.stringify(d, null, 1) + '\n');
  console.log(`${g.kurz}: ${Object.keys(d.paragrafen).join(', ')}`);
}
