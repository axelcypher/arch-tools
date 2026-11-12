/**
 * Schlüsselpaar für die Signatur des Regelpakets erzeugen (Ed25519). Einmal ausführen:
 *
 *   npm run schluessel -w @akh/baurecht-regeln
 *
 * Den privaten Schlüssel (PKCS#8, Base64) als GitHub-Secret BAURECHT_REGELN_SCHLUESSEL hinterlegen – nie ins Repo.
 * Den öffentlichen Schlüssel (32 Byte roh, Base64) in packages/baurecht-regeln/schluessel/regeln.pub eintragen; mit
 * dem nächsten App-Build prüfen die Apps nachgeladene Pakete damit.
 */
import { it } from 'vitest';

/** Ausgabe direkt auf die Konsole (vitest fängt console.log ab) */
const ausgabe = (t = '') => void process.stdout.write(`${t}\n`);

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

it('Schlüsselpaar erzeugen', async () => {
  const k = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const privat = new Uint8Array(await crypto.subtle.exportKey('pkcs8', k.privateKey));
  const oeffentlich = new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey));
  ausgabe('\nPrivater Schlüssel → GitHub-Secret BAURECHT_REGELN_SCHLUESSEL (geheim halten):\n');
  ausgabe(b64(privat));
  ausgabe('\nÖffentlicher Schlüssel → packages/baurecht-regeln/schluessel/regeln.pub:\n');
  ausgabe(b64(oeffentlich));
  ausgabe('');
});
