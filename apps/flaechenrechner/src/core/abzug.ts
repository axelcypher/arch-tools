import type { Shape } from '@core/model';

/**
 * Fläche als Abzug markieren bzw. die Markierung aufheben. Ein Raum, der zur Abzugsfläche wird, bekommt die
 * Anrechnung „keine“ und erbt damit Anrechnung und Wohnung des Raums, in dem er liegt (`effektiveWofl`). Sonst
 * behielte er die beim Zeichnen vom zuletzt angelegten Raum übernommene Wohnung und minderte deren Wohnfläche statt
 * der des umgebenden Raums.
 */
export function abzugSetzen<S extends Shape>(s: S, abzug: boolean): S {
  if (s.kind !== 'room' || !abzug || s.subtract) return { ...s, subtract: abzug };
  return { ...s, subtract: true, wofl: { kategorie: 'keine', wohnung: '' } };
}
