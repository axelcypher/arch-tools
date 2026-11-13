import { eingabeAbschliessen } from '@core/platform/eingabe';
import { logger } from '@core/platform/log';

const log = logger('schreiben');

/** laufende Schreibvorgänge (Projektdatei, Kostenkontrolle, LV, Rechnungsablauf, Ablage, Mailentwürfe, Vorlagetexte) */
const laufend = new Set<Promise<unknown>>();

/** zuletzt gescheitertes Schreiben je Ziel (mit Grund) – bleibt stehen, bis ein späteres Schreiben desselben Ziels gelingt */
const gescheitert = new Map<string, unknown>();

/**
 * Schreibvorgang anmelden, bis er fertig ist (auch bei Fehler); liefert ihn unverändert zurück. Mit `ziel` (z. B.
 * `projektdatei`, `lv:<pfad>`) für Stände, die in FABRIO bearbeitet werden: Scheitert das Schreiben, gilt das Ziel als
 * nicht gespeichert, bis ein späteres Schreiben desselben Ziels gelingt. Ohne `ziel` (einmalige Aktionen wie Ablage
 * oder Mailentwurf, deren Fehler die Oberfläche gleich meldet) zählt ein Fehler nur, wenn er beim Abwarten auftritt.
 */
export function schreibend<T>(p: Promise<T>, ziel?: string): Promise<T> {
  laufend.add(p);
  p.then(
    () => {
      laufend.delete(p);
      if (ziel) gescheitert.delete(ziel);
    },
    (grund: unknown) => {
      laufend.delete(p);
      if (ziel) gescheitert.set(ziel, grund);
    },
  );
  return p;
}

/**
 * Vor dem Schließen (Arkly: `vorDemSchliessen`): die laufende Eingabe abschließen – sie speichert beim Verlassen des
 * Felds und meldet ihren Schreibvorgang dabei sofort an – und alle laufenden Schreibvorgänge abwarten. Schreibt selbst
 * nichts; ein zweiter Aufruf wartet nur mit. Liefert `false`, wenn ein abgewartetes Schreiben scheitert oder ein Ziel
 * nicht gespeichert ist, weil sein letztes Schreiben gescheitert ist (Grund im Protokoll) – das gilt auch bei „Erneut
 * versuchen“, bis ein späteres Schreiben gelingt. Arkly fragt dann nach, statt still zu schließen. Das Zeitlimit (5 s)
 * setzt der Rahmen.
 */
export async function ausstehendesSchreibenAbwarten(): Promise<boolean> {
  eingabeAbschliessen();
  const gemeldet = new Set<unknown>();
  while (laufend.size) {
    for (const r of await Promise.allSettled([...laufend])) {
      if (r.status === 'rejected' && !gemeldet.has(r.reason)) {
        gemeldet.add(r.reason);
        log.error('Schreiben vor dem Schließen gescheitert', r.reason);
      }
    }
  }
  for (const [ziel, grund] of gescheitert) if (!gemeldet.has(grund)) log.error(`Nicht gespeichert (${ziel})`, grund);
  return gemeldet.size === 0 && gescheitert.size === 0;
}
