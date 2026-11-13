/**
 * Laufende Schreibvorgänge: vor dem Schließen, Andocken, Herauslösen, Beenden oder einem Update-Neustart wartet Arkly
 * darauf (`vorDemSchliessen` aus core, höchstens wenige Sekunden). Hier wird nur gewartet, nie selbst geschrieben –
 * mehrfaches Aufrufen schreibt nichts doppelt.
 *
 * Verfolgt wird zweifach:
 * - jeder einzelne Schreibbefehl an das Dateisystem (`mitVerfolgung`: Formular ersetzen, Sperre setzen und lösen,
 *   Dokument anlegen/ersetzen, Formular anlegen, kopieren, umbenennen, löschen, Ordner anlegen, Projektkarte und
 *   Projektdatei schreiben bzw. anlegen);
 * - Abläufe aus mehreren Schritten, die nur zusammen stimmig sind (`vorgang`: Speichern samt Warteschlange,
 *   Formular umbenennen mit Projektdatei, Formular anlegen und aufnehmen, PDF-Export mit Verknüpfung) – erst nach
 *   einer Rückfrage, damit eine offene Rückfrage nicht als „speichert noch“ gilt.
 * Lesen, Sperren prüfen und Rückfragen werden nicht abgewartet.
 */
import type { ProjektordnerZugriff } from '@core/platform/projektordner';
import { vorDemSchliessen } from '@core/platform/rahmen';
import type { Dateisystem } from './dateisystem';

const laufend = new Set<Promise<unknown>>();

/** Schreibvorgang merken, bis er fertig (oder gescheitert) ist; liefert ihn unverändert zurück */
export function verfolgen<T>(arbeit: Promise<T>): Promise<T> {
  laufend.add(arbeit);
  const weg = () => void laufend.delete(arbeit);
  arbeit.then(weg, weg);
  return arbeit;
}

/** Ablauf aus mehreren Schritten als einen Schreibvorgang verfolgen (gleich gestartet) */
export const vorgang = <T>(ablauf: () => Promise<T>): Promise<T> => verfolgen(ablauf());

/**
 * Klammer um einen Ablauf, der erst nach Rückfragen bzw. Suchen zu schreiben beginnt: ab jetzt verfolgt, bis die
 * gelieferte Funktion aufgerufen wird (mehrfacher Aufruf schadet nicht)
 */
export function klammer(): () => void {
  let fertig!: () => void;
  void verfolgen(new Promise<void>((r) => (fertig = r)));
  return () => fertig();
}

/** Zahl der laufenden Schreibvorgänge (für Tests) */
export const laufendeSchreibvorgaenge = () => laufend.size;

/** bis alle laufenden Schreibvorgänge fertig sind – auch die, die währenddessen dazukommen (Folgeschreiben) */
export async function ausstehendAbwarten(): Promise<void> {
  while (laufend.size) await Promise.allSettled([...laufend]);
}

/** beim Rahmen anmelden; liefert die Abmeldung */
export const vorDemSchliessenAnmelden = () => vorDemSchliessen(ausstehendAbwarten);

/**
 * Einteilung aller Befehle – vom Typsystem erzwungen: ein neuer Befehl im Dateisystem bzw. Projektordner muss hier
 * eingetragen werden (sonst bliebe ein neuer Schreibbefehl stillschweigend unverfolgt)
 */
const DS_ART = {
  projektordner: 'sonst',
  liste: 'lesen',
  lies: 'lesen',
  ersetze: 'schreiben',
  sperreSetzen: 'schreiben',
  sperreLoesen: 'schreiben',
  sperrePruefen: 'lesen',
  prozess: 'lesen',
  dokumentErsetzen: 'schreiben',
  inOffice: 'lesen',
  dokumentAnlegen: 'schreiben',
  ordnerAnlegen: 'schreiben',
  formularAnlegen: 'schreiben',
  kopieren: 'schreiben',
  umbenennen: 'schreiben',
  formularUmbenennen: 'schreiben',
  loeschen: 'schreiben',
  projektkarteLesen: 'lesen',
  projektkarteSchreiben: 'schreiben',
  rechner: 'lesen',
} satisfies Record<keyof Dateisystem, 'schreiben' | 'lesen' | 'sonst'>;
const PO_ART = {
  liste: 'lesen',
  lies: 'lesen',
  liesMitStand: 'lesen',
  ordnerAnlegen: 'schreiben',
  dateiAnlegen: 'schreiben',
  projektdateiErsetzen: 'schreiben',
  dateienSuchen: 'lesen',
  zipEintrag: 'lesen',
  umbenennen: 'schreiben',
} satisfies Record<keyof ProjektordnerZugriff, 'schreiben' | 'lesen'>;
const schreibend = (art: Record<string, string>) => new Set<PropertyKey>(Object.keys(art).filter((k) => art[k] === 'schreiben'));
const DS_SCHREIBEN = schreibend(DS_ART);
const PO_SCHREIBEN = schreibend(PO_ART);

/** Hülle um ein Objekt: die genannten Methoden liefern verfolgte Promises (jeder Zugriff liefert eine neu gebundene Funktion) */
function umhuellt<T extends object>(ziel: T, schreiben: Set<PropertyKey>, weitere: (k: PropertyKey, wert: unknown) => unknown = (_k, w) => w): T {
  return new Proxy(ziel, {
    get(t, k) {
      const wert = Reflect.get(t, k, t) as unknown;
      if (typeof wert === 'function' && schreiben.has(k)) return (...a: unknown[]) => verfolgen(Promise.resolve((wert as (...x: unknown[]) => unknown).apply(t, a)));
      if (typeof wert === 'function') return (wert as (...x: unknown[]) => unknown).bind(t);
      return weitere(k, wert);
    },
  });
}

/** Dateisystem, dessen Schreibbefehle (auch die der Projektordner) verfolgt werden */
export function mitVerfolgung(ds: Dateisystem): Dateisystem {
  let po: ProjektordnerZugriff | null = null;
  return umhuellt(ds, DS_SCHREIBEN, (k, wert) => {
    if (k !== 'projektordner') return wert;
    po ??= umhuellt(wert as ProjektordnerZugriff, PO_SCHREIBEN);
    return po;
  });
}
