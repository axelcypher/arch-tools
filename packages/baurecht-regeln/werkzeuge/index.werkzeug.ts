/**
 * Regelpaket zum Ausliefern bauen: alle Dateien ohne Leerraum nach `ausgabe/` (Pfade mit „__“ statt „/“, weil
 * Release-Dateien keine Ordner kennen), `index.json` mit Paketversion, Formatversion, SHA-256 und Größe je Datei und
 * den Hosts der Module, dazu die Signatur `index.json.sig` (Ed25519) – mit dem privaten Schlüssel aus der Umgebung
 * (BAURECHT_REGELN_SCHLUESSEL, PKCS#8 als Base64). Ohne Schlüssel: Index ohne Signatur und ein Hinweis.
 *
 *   PAKET=2026.11.12-1 npm run index -w @akh/baurecht-regeln
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { paketIndex, paketPruefen } from '@core/baurecht/paket';
import { VORGABE_MERKMALE } from '@core/bedingung';
import { paketDateien, paketLaden, WURZEL } from '../test/laden';

it('Paket bauen und signieren', async () => {
  const paket = paketLaden();
  expect(paketPruefen(paket, VORGABE_MERKMALE)).toEqual([]);
  const version = process.env.PAKET ?? `${paket.version}-1`;
  const ausgabe = join(WURZEL, 'ausgabe');
  rmSync(ausgabe, { recursive: true, force: true });
  mkdirSync(ausgabe, { recursive: true });
  const bytes: Record<string, Uint8Array> = {};
  for (const [pfad, inhalt] of Object.entries(paketDateien())) {
    const b = new TextEncoder().encode(JSON.stringify(inhalt));
    bytes[pfad] = b;
    writeFileSync(join(ausgabe, pfad.replace(/\//g, '__')), b);
  }
  const index = await paketIndex(bytes, version, paket.module.flatMap((m) => m.hosts ?? []));
  const indexText = JSON.stringify(index);
  writeFileSync(join(ausgabe, 'index.json'), indexText);
  const geheim = process.env.BAURECHT_REGELN_SCHLUESSEL;
  if (!geheim) {
    console.log('Kein privater Schlüssel (BAURECHT_REGELN_SCHLUESSEL) – Index ohne Signatur. Die App lädt nur signierte Pakete nach.');
    return;
  }
  const roh = Uint8Array.from(atob(geheim.replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', roh, { name: 'Ed25519' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, new TextEncoder().encode(indexText)));
  writeFileSync(join(ausgabe, 'index.json.sig'), btoa(String.fromCharCode(...sig)));
  console.log(`Regelpaket ${version}: ${Object.keys(bytes).length} Dateien, signiert → ${ausgabe}`);
});
