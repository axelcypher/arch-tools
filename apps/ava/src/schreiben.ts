import { eingabeAbschliessen } from '@core/platform/eingabe';

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
 * nichts; ein zweiter Aufruf wartet nur mit. Das Zeitlimit (5 s) setzt der Rahmen, hier wird ohne Grenze gewartet.
 */
export async function ausstehendesSchreibenAbwarten(): Promise<void> {
  eingabeAbschliessen();
  while (laufend.size) await Promise.allSettled([...laufend]);
}
