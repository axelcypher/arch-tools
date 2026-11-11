import { logger } from './log';

/**
 * Harmlose Konsolenmeldungen von Bibliotheken: web-ifc meldet beim Laden „wasm streaming compile failed … falling
 * back to ArrayBuffer instantiation“ (falscher MIME-Typ der .wasm-Datei) – der Import funktioniert trotzdem. Solche
 * Meldungen zählen nicht als Fehler/Warnung (roter Zähler „Protokoll“), sondern stehen nur als Hinweis im Protokoll.
 */
const HARMLOS = [/wasm streaming compile failed/i, /falling back to ArrayBuffer instantiation/i];

export function harmloseMeldung(text: string): boolean {
  return HARMLOS.some((r) => r.test(text));
}

const log = logger('ifc');

/**
 * Führt `fn` aus und stuft währenddessen harmlose Konsolenmeldungen (siehe oben) als Hinweis (Info) herab; alle anderen
 * gehen unverändert an die bisherige Konsole (und damit ins Protokoll).
 */
export async function mitHarmlosenMeldungen<T>(fn: () => Promise<T>): Promise<T> {
  const warn = console.warn;
  const error = console.error;
  const filter =
    (orig: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      const text = args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : String(a))).join(' ');
      if (harmloseMeldung(text)) log.info(`(harmlos) ${text}`);
      else orig(...args);
    };
  const w = filter(warn);
  const e = filter(error);
  console.warn = w;
  console.error = e;
  try {
    return await fn();
  } finally {
    // nur zurücksetzen, wenn inzwischen niemand anderes die Konsole ersetzt hat
    if (console.warn === w) console.warn = warn;
    if (console.error === e) console.error = error;
  }
}
