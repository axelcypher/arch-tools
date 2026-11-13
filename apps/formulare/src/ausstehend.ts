/**
 * Laufende Schreibvorgänge (Formular, Projektkarte, Projektdatei, Dokumente): vor dem Schließen, Andocken,
 * Herauslösen oder einem Update-Neustart wartet Arkly darauf (`vorDemSchliessen` aus core, höchstens wenige Sekunden).
 * Hier wird nur gewartet, nie selbst geschrieben – mehrfaches Aufrufen schreibt nichts doppelt.
 */
import { vorDemSchliessen } from '@core/platform/rahmen';

const laufend = new Set<Promise<unknown>>();

/** Schreibvorgang merken, bis er fertig (oder gescheitert) ist; liefert ihn unverändert zurück */
export function verfolgen<T>(arbeit: Promise<T>): Promise<T> {
  laufend.add(arbeit);
  const weg = () => void laufend.delete(arbeit);
  arbeit.then(weg, weg);
  return arbeit;
}

/** Zahl der laufenden Schreibvorgänge (für Tests) */
export const laufendeSchreibvorgaenge = () => laufend.size;

/** bis alle laufenden Schreibvorgänge fertig sind – auch die, die währenddessen dazukommen (Folgeschreiben) */
export async function ausstehendAbwarten(): Promise<void> {
  while (laufend.size) await Promise.allSettled([...laufend]);
}

/** beim Rahmen anmelden; liefert die Abmeldung */
export const vorDemSchliessenAnmelden = () => vorDemSchliessen(ausstehendAbwarten);
