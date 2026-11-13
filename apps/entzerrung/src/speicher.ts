import { logger } from '@core/platform/log';
import type { Dokument } from './model';

/**
 * Automatische Zwischenspeicherung im Browser (IndexedDB): Der Stand (klein) wird bei jeder Änderung
 * geschrieben, die Fotos (groß) nur einmal beim Hinzufügen.
 */

const DB = 'arch-tools-entzerrung';
const log = logger('speicher');

export interface Stand {
  doc: Dokument;
  dateiname: string | null;
  /** Stand der Datei beim letzten Öffnen bzw. Speichern (siehe Zustand `dateiStand`) */
  dateiStand?: { groesse: number; geaendert: number } | null;
  dirty: boolean;
}

function oeffnen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('stand');
      r.result.createObjectStore('fotos');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

let db: Promise<IDBDatabase> | null = null;
const verbindung = () => (db ??= oeffnen());

/** laufende Schreibvorgänge (Stand und Fotos), damit das Schließen auf sie warten kann */
const laufend = new Set<Promise<unknown>>();
function merken<T>(arbeit: Promise<T>): Promise<T> {
  laufend.add(arbeit);
  void arbeit.finally(() => laufend.delete(arbeit)).catch(() => undefined);
  return arbeit;
}

/** seit dem letzten gelungenen Stand ist ein Schreiben gescheitert (ein gelungener Stand trägt fehlende Fotos nach) */
let gescheitert = false;
export const schreibenGescheitert = () => gescheitert;

/**
 * wartet, bis kein Schreiben mehr läuft – auch auf solche, die vor dem Ende des letzten laufenden Vorgangs starten.
 * Nacheinander gestartete Fotos (etwa beim Öffnen) können danach noch folgen; deren Bilddaten trägt der nächste Stand
 * ohnehin aus `bilder` nach. false, wenn seit dem letzten gelungenen Stand ein Schreiben gescheitert ist.
 */
export async function schreibenAbgeschlossen(): Promise<boolean> {
  while (laufend.size) await Promise.allSettled([...laufend]);
  return !gescheitert;
}

function anfrage<T>(store: string, modus: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return verbindung().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, modus);
        const r = f(t.objectStore(store));
        t.oncomplete = () => resolve(r.result);
        t.onerror = () => reject(t.error);
      }),
  );
}

/**
 * Schreibt den Stand. Fotos des Dokuments, die im Zwischenspeicher fehlen, werden aus `bilder` nachgetragen;
 * gelöscht werden nur Fotos, die weder dieses Dokument noch `behalten()` (Dokument und Rückgängig-Verlauf zum
 * Zeitpunkt des Löschens) braucht.
 */
export function standSchreiben(s: Stand, bilder: Record<string, Uint8Array> = {}, behalten: () => Set<string> = () => new Set(s.doc.fotos.map((f) => f.id))): Promise<boolean> {
  return merken(standSchreibenJetzt(s, bilder, behalten));
}

/** true, wenn geschrieben; ein Fehler wird protokolliert und als false gemeldet */
async function standSchreibenJetzt(s: Stand, bilder: Record<string, Uint8Array>, behalten: () => Set<string>): Promise<boolean> {
  try {
    const vorhanden = new Set((await anfrage('fotos', 'readonly', (o) => o.getAllKeys())).map(String));
    for (const f of s.doc.fotos) if (!vorhanden.has(f.id) && bilder[f.id]) await anfrage('fotos', 'readwrite', (o) => o.put(bilder[f.id], f.id));
    await anfrage('stand', 'readwrite', (o) => o.put(s, 'stand'));
    // erst jetzt fragen, was gebraucht wird: inzwischen hinzugefügte Fotos bleiben
    const brauchen = behalten();
    for (const k of vorhanden) if (!brauchen.has(k) && !s.doc.fotos.some((f) => f.id === k)) await anfrage('fotos', 'readwrite', (o) => o.delete(k));
    gescheitert = false;
    return true;
  } catch (e) {
    log.warn('Zwischenspeichern fehlgeschlagen', e);
    gescheitert = true;
    return false;
  }
}

/** true, wenn geschrieben; ein Fehler wird protokolliert und als false gemeldet */
export function fotoSchreiben(id: string, daten: Uint8Array): Promise<boolean> {
  return merken(
    anfrage('fotos', 'readwrite', (o) => o.put(daten, id)).then(
      () => true,
      (e) => {
        log.warn('Foto konnte nicht zwischengespeichert werden', e);
        gescheitert = true;
        return false;
      },
    ),
  );
}

export async function standLesen(): Promise<{ stand: Stand; bilder: Record<string, Uint8Array> } | null> {
  try {
    const stand = await anfrage<Stand | undefined>('stand', 'readonly', (o) => o.get('stand'));
    if (!stand?.doc) return null;
    const bilder: Record<string, Uint8Array> = {};
    for (const f of stand.doc.fotos) {
      const b = await anfrage<Uint8Array | undefined>('fotos', 'readonly', (o) => o.get(f.id));
      if (b) bilder[f.id] = b;
    }
    // Fotos ohne Bilddaten (z. B. abgebrochenes Speichern) weglassen
    return { stand: { ...stand, doc: { fotos: stand.doc.fotos.filter((f) => bilder[f.id]) } }, bilder };
  } catch (e) {
    log.warn('Zwischenstand konnte nicht gelesen werden', e);
    return null;
  }
}
