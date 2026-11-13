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
 *
 * Gescheitertes Speichern eines Bearbeitungsstands (`standSpeichern`: Formular, Dokument, Projektkarte, Projektdatei)
 * bleibt gemerkt, bis dieselbe Datei erfolgreich gespeichert ist: so liefert auch ein späterer Aufruf (nach „Erneut
 * versuchen“ oder ein Schließen lange nach dem Fehler) weiter `false` – wie der Vertrag von `vorDemSchliessen` verlangt.
 * Wird die Datei umbenannt, wandert der Merker mit; wird sie gelöscht, entfällt er. Verwerfen löscht ihn nicht (Strg+Z
 * holt die Änderungen zurück); Arkly fragt dann nach, „Trotzdem schließen“ bleibt möglich. Einmalige Aktionen (PDF-Export,
 * anlegen, kopieren, umbenennen, löschen, Sperren) melden ihren Fehler sofort und zählen nur, solange sie abgewartet werden.
 */
import type { ProjektordnerZugriff } from '@core/platform/projektordner';
import { logger } from '@core/platform/log';
import { vorDemSchliessen } from '@core/platform/rahmen';
import type { Dateisystem } from './dateisystem';

const log = logger('ausstehend');
const laufend = new Set<Promise<unknown>>();
/** gescheitertes Speichern eines Bearbeitungsstands: Datei (Ordner/Pfad) → Grund */
const gescheitert = new Map<string, string>();
const grundVon = (e: unknown) => (e instanceof Error ? e.message : String(e));

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

const schluessel = (root: string, pfad: string) => `${root}/${pfad}`;

/**
 * Speichern eines Bearbeitungsstands (Formular, Dokument, Projektkarte, Projektdatei) verfolgen und sein Ergebnis merken:
 * gescheitert bleibt es „nicht gespeichert“, bis dieselbe Datei gelingt. Bei der Projektdatei, die nur Unterschiede
 * schreibt, heißt „gelingt“: der letzte Schreiblauf in diese Datei (auch ein automatischer), nicht jede einzelne Änderung
 */
export function standSpeichern<T>(root: string, pfad: string, arbeit: Promise<T>): Promise<T> {
  const z = schluessel(root, pfad);
  arbeit.then(
    () => void gescheitert.delete(z),
    (e: unknown) => void gescheitert.set(z, grundVon(e)),
  );
  return verfolgen(arbeit);
}

/** umbenannt bzw. gelöscht: der Merker wandert mit bzw. entfällt (sonst bliebe er am alten Namen, ohne Weg zum Auflösen) */
function dateiBewegt(root: string, alt: string, neu: string | null) {
  const grund = gescheitert.get(schluessel(root, alt));
  if (grund === undefined) return;
  gescheitert.delete(schluessel(root, alt));
  if (neu !== null) gescheitert.set(schluessel(root, neu), grund);
}

/** gemerkte Fehler vergessen (für Tests) */
export const gescheitertVergessen = () => gescheitert.clear();

/**
 * bis alle laufenden Schreibvorgänge fertig sind – auch die, die währenddessen dazukommen (Folgeschreiben). Liefert
 * `false`, wenn einer davon gescheitert ist oder ein früher gescheitertes Schreiben eines Stands seither nicht gelungen
 * ist (dann fragt Arkly „… konnte nicht speichern“); der Grund steht im Protokoll
 */
export async function ausstehendAbwarten(): Promise<boolean> {
  let alleOk = true;
  while (laufend.size) {
    for (const r of await Promise.allSettled([...laufend])) {
      if (r.status === 'rejected') {
        alleOk = false;
        log.warn(`Vor dem Schließen: Schreiben fehlgeschlagen – ${grundVon(r.reason)}`);
      }
    }
  }
  // ein früher gescheitertes Schreiben, das seither nicht gelungen ist, gilt weiter als „nicht gespeichert“
  for (const [ziel, grund] of gescheitert) {
    alleOk = false;
    log.warn(`Vor dem Schließen: noch nicht gespeichert (${ziel}) – ${grund}`);
  }
  return alleOk;
}

/** beim Rahmen anmelden; liefert die Abmeldung */
// `false` (ein Schreiben ist gescheitert) zeigt Arkly als „… konnte nicht speichern“
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
/** Befehle, die eine Datei umbenennen (Ordner, alt, neu, …) bzw. löschen (Ordner, Datei): der Merker folgt ihnen */
const BEWEGT = new Set<PropertyKey>(['umbenennen', 'formularUmbenennen'] satisfies (keyof Dateisystem | keyof ProjektordnerZugriff)[]);
const GELOESCHT = new Set<PropertyKey>(['loeschen'] satisfies (keyof Dateisystem)[]);

/** Hülle um ein Objekt: die genannten Methoden liefern verfolgte Promises (jeder Zugriff liefert eine neu gebundene Funktion) */
function umhuellt<T extends object>(ziel: T, schreiben: Set<PropertyKey>, weitere: (k: PropertyKey, wert: unknown) => unknown = (_k, w) => w): T {
  return new Proxy(ziel, {
    get(t, k) {
      const wert = Reflect.get(t, k, t) as unknown;
      if (typeof wert === 'function' && schreiben.has(k))
        return (...a: unknown[]) => {
          const arbeit = Promise.resolve((wert as (...x: unknown[]) => unknown).apply(t, a));
          if (BEWEGT.has(k) || GELOESCHT.has(k))
            arbeit.then(
              // `false`: nichts umbenannt (z. B. Ziel vorhanden, ProjektordnerZugriff.umbenennen) – der Merker bleibt
              (r) => void (r !== false && dateiBewegt(String(a[0]), String(a[1]), BEWEGT.has(k) ? String(a[2]) : null)),
              () => undefined,
            );
          return verfolgen(arbeit);
        };
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
