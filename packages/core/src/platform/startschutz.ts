import { logger } from './log';

/**
 * Startschutz für den automatischen Zwischenstand: Stürzt eine App ab, während oder kurz nachdem sie ihn
 * geladen hat (Darstellungsfehler, Hänger, Absturz der Webansicht), lädt sie ihn beim nächsten Start nicht
 * automatisch – sonst sperrte ein fehlerhaftes Projekt die App bei jedem Start aus.
 *
 * Vermerk je App im localStorage:
 *   „laeuft“    Zwischenstand geladen, Start noch nicht bestätigt (stabil nach STABIL ms oder bei normalem Schließen)
 *   „aussetzen“ beim Start nicht laden – bis ein neuer Zwischenstand ihn ersetzt oder er ausdrücklich freigegeben wird
 */

const STABIL = 10_000;
type Vermerk = 'laeuft' | 'aussetzen';

const log = logger('startschutz');
const schluessel = (app: string) => `${app}.zwischenstand`;

function lesen(app: string): Vermerk | null {
  try {
    const v = localStorage.getItem(schluessel(app));
    return v === 'laeuft' || v === 'aussetzen' ? v : null;
  } catch {
    return null;
  }
}

function schreiben(app: string, v: Vermerk | null) {
  try {
    if (v) localStorage.setItem(schluessel(app), v);
    else localStorage.removeItem(schluessel(app));
  } catch {
    // ohne localStorage kein Schutz – die App läuft trotzdem
  }
}

let aktiv: string | null = null;
const geprueft = new Map<string, boolean>();
let ausgesetzt = false;
const hoerer = new Set<() => void>();

/** App, die ihren Zwischenstand über den Startschutz lädt (für die Absturzanzeige) */
export const startschutzApp = () => aktiv;

/** Wurde der Zwischenstand bei diesem Start ausgesetzt? (Hinweis mit „Trotzdem laden“) */
export const zwischenstandAusgesetzt = () => ausgesetzt;

export function startschutzAbonnieren(f: () => void): () => void {
  hoerer.add(f);
  return () => hoerer.delete(f);
}

/** Darf der Zwischenstand bei diesem Start geladen werden? Mehrfach aufrufbar, geprüft wird einmal je Start. */
export function zwischenstandLadenErlaubt(app: string): boolean {
  aktiv = app;
  let ok = geprueft.get(app);
  if (ok === undefined) {
    ok = lesen(app) === null;
    if (!ok) {
      schreiben(app, 'aussetzen');
      log.warn('Zwischenstand nicht geladen: die App ist nach dem letzten Laden abgestürzt oder hängen geblieben');
      ausgesetzt = true;
      hoerer.forEach((f) => f());
    }
    geprueft.set(app, ok);
  }
  return ok;
}

/** Unmittelbar vor dem Laden des Zwischenstands aufrufen */
export function zwischenstandWirdGeladen(app: string) {
  schreiben(app, 'laeuft');
  const bestaetigen = () => {
    if (lesen(app) === 'laeuft') schreiben(app, null);
  };
  setTimeout(bestaetigen, STABIL);
  if (typeof window !== 'undefined') window.addEventListener('pagehide', bestaetigen, { once: true });
}

/** Ein neuer Zwischenstand wurde geschrieben – ein ausgesetzter ist damit ersetzt */
export function zwischenstandErsetzt(app: string) {
  if (lesen(app) === 'aussetzen') schreiben(app, null);
}

/** Darstellungsfehler: kurz nach dem Laden des Zwischenstands → beim nächsten Start nicht laden. Liefert, ob ausgesetzt wird. */
export function absturzMelden(): boolean {
  if (!aktiv || lesen(aktiv) !== 'laeuft') return false;
  schreiben(aktiv, 'aussetzen');
  return true;
}

/** „Ohne Zwischenstand neu starten“ */
export function zwischenstandAussetzen() {
  if (aktiv) schreiben(aktiv, 'aussetzen');
}

/** „Trotzdem laden“: beim nächsten Start wieder laden (weiterhin geschützt) */
export function zwischenstandFreigeben() {
  if (aktiv) schreiben(aktiv, null);
}
