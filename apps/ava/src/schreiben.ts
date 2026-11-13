import { eingabeAbschliessen } from '@core/platform/eingabe';
import { logger } from '@core/platform/log';

const log = logger('schreiben');

/** laufende Schreibvorgänge (Projektdatei, Kostenkontrolle, LV, Rechnungsablauf, Ablage, Mailentwürfe, Vorlagetexte) */
const laufend = new Set<Promise<unknown>>();

/** Schreibvorgang anmelden, bis er fertig ist (auch bei Fehler); liefert ihn unverändert zurück */
export function schreibend<T>(p: Promise<T>): Promise<T> {
  laufend.add(p);
  const weg = () => void laufend.delete(p);
  p.then(weg, weg);
  return p;
}

/**
 * Vor dem Schließen (Arkly: `vorDemSchliessen`): die laufende Eingabe abschließen – sie speichert beim Verlassen des
 * Felds und meldet ihren Schreibvorgang dabei sofort an – und alle laufenden Schreibvorgänge abwarten. Schreibt selbst
 * nichts; ein zweiter Aufruf wartet nur mit. Liefert `false`, wenn ein abgewartetes Schreiben gescheitert ist (Grund im
 * Protokoll) – Arkly fragt dann nach, statt still zu schließen. Das Zeitlimit (5 s) setzt der Rahmen.
 */
export async function ausstehendesSchreibenAbwarten(): Promise<boolean> {
  eingabeAbschliessen();
  let ok = true;
  while (laufend.size) {
    for (const r of await Promise.allSettled([...laufend])) {
      if (r.status === 'rejected') {
        ok = false;
        log.error('Schreiben vor dem Schließen gescheitert', r.reason);
      }
    }
  }
  return ok;
}
