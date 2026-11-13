/**
 * Eigene Sperrdateien über einen Absturz hinweg: Jede Sperre, die diese App anlegt, wird mit ihrem Inhalt im
 * Speicher der App vermerkt und beim Schließen wieder gestrichen. Stürzt die App ab, bleibt die Sperrdatei liegen –
 * beim nächsten Start (und beim Öffnen des Formulars) wird sie gelöscht, wenn sie noch genau den eigenen Inhalt
 * hat und kein Programm sie offen hält. Fremde Sperren werden hier nie angefasst.
 */

import { base64ToBytes, bytesToBase64 } from '@core/platform/files';
import type { Dateisystem } from './dateisystem';
import { bytesGleich as gleich } from './speicher';

const SCHLUESSEL = 'formulare:eigene-sperren';

interface Vermerk {
  root: string;
  /** Pfad der Sperrdatei relativ zu `root` */
  pfad: string;
  /** Inhalt (Base64) */
  inhalt: string;
}

function lesen(): Vermerk[] {
  try {
    const o = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? '[]') as unknown;
    return Array.isArray(o) ? o.filter((v): v is Vermerk => !!v && typeof v.root === 'string' && typeof v.pfad === 'string' && typeof v.inhalt === 'string') : [];
  } catch {
    return [];
  }
}

function schreiben(liste: Vermerk[]) {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(liste));
  } catch {
    // ohne Speicher keine Aufräumhilfe nach Abstürzen
  }
}

export function sperreVermerken(root: string, pfad: string, inhalt: Uint8Array): void {
  schreiben([...lesen().filter((v) => v.root !== root || v.pfad !== pfad), { root, pfad, inhalt: bytesToBase64(inhalt) }]);
}

export function sperreVergessen(root: string, pfad: string): void {
  schreiben(lesen().filter((v) => v.root !== root || v.pfad !== pfad));
}

/** Ist das eine Sperre, die diese App (in einem früheren Lauf) angelegt hat? */
export function istEigeneSperre(root: string, pfad: string, inhalt: Uint8Array): boolean {
  return lesen().some((v) => v.root === root && v.pfad === pfad && gleich(base64ToBytes(v.inhalt), inhalt));
}

/**
 * Verwaiste eigene Sperren löschen. Liefert die Pfade der gelöschten. Eine Sperre bleibt, solange ein Programm
 * sie offen hält (etwa eine zweite laufende Instanz dieser App).
 */
export async function verwaisteEigeneSperrenAufraeumen(ds: Dateisystem): Promise<string[]> {
  const geloescht: string[] = [];
  for (const v of lesen()) {
    try {
      const probe = await ds.sperrePruefen(v.root, v.pfad);
      const inhalt = base64ToBytes(v.inhalt);
      if (!probe || !gleich(probe.inhalt, inhalt)) {
        sperreVergessen(v.root, v.pfad);
      } else if (!probe.offen) {
        if (await ds.sperreLoesen(v.root, v.pfad, inhalt)) geloescht.push(v.pfad);
        sperreVergessen(v.root, v.pfad);
      }
    } catch {
      // Ordner gerade nicht erreichbar (z. B. Server getrennt): beim nächsten Start erneut versuchen
    }
  }
  return geloescht;
}
