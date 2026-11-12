/**
 * „Lage abfragen“: Flurstück und Gemeindeschlüssel aus ALKIS (an den Koordinaten der Stammdaten), danach alle
 * Geodienste, die die aktiven Module für Fakten nennen – am Umring des Flurstücks mit Puffer.
 */

import { faktDefinitionen } from '@core/baurecht/auswertung';
import { alsFakt, dienstAbfragen, flurstueckAbfragen, lageKennung } from '@core/baurecht/geodienste';
import type { FaktWert } from '@core/baurecht/typen';
import { aktiveModule } from '@core/baurecht/paket';
import { logger } from '@core/platform/log';
import { holen } from '@core/recht/netz';
import { heute, useBaurecht } from './store';

const log = logger('lage');

export interface LageErgebnis {
  meldung: string;
  fehler: string[];
}

export async function lageAbfragen(): Promise<LageErgebnis> {
  const s = useBaurecht.getState();
  const k = s.project?.meta.koordinaten;
  if (!k) return { meldung: 'Keine Koordinaten in den Stammdaten – bitte die Adresse des Vorhabens eintragen (die Koordinaten werden dann ermittelt).', fehler: [] };
  const punkt = { x: k.ost, y: k.nord };
  // Ergebnisse gelten nur für diese Lage (ändern sich die Koordinaten, werden sie wieder zum Hinweis)
  const lage = lageKennung(k.ost, k.nord);
  const fehler: string[] = [];
  const fakten: Record<string, FaktWert> = {};
  let umring = null as { x: number; y: number }[] | null;
  let ags: string | null = null;
  try {
    const f = await flurstueckAbfragen(holen, punkt);
    if (f) {
      ags = f.ags;
      umring = f.umring.length >= 3 ? f.umring : null;
      const quelle = `ALKIS NRW (Flurstück ${f.gemarkung}, Flur ${f.flur}, ${f.flurstueck})`;
      const genau = k.genauigkeit === 'adresse' || k.genauigkeit === undefined;
      const sicherheit = genau ? ({ sicherheit: 'sicher' } as const) : ({ sicherheit: 'hinweis', grund: 'Koordinaten nur auf Straße oder Ort genau – Flurstück bitte prüfen' } as const);
      fakten['lage.ags'] = { wert: f.ags, herkunft: 'geodienst', quelle, stand: heute(), lage, ...sicherheit };
      fakten['lage.gemeinde'] = { wert: f.gemeinde, herkunft: 'geodienst', quelle, stand: heute(), lage, ...sicherheit };
    } else fehler.push('Kein Flurstück an den Koordinaten gefunden (außerhalb NRW?)');
  } catch (e) {
    fehler.push(`ALKIS: ${e instanceof Error ? e.message : String(e)}`);
  }
  const module = aktiveModule(s.paket.module, ags ?? (typeof s.pruefung.fakten['lage.ags']?.wert === 'string' ? (s.pruefung.fakten['lage.ags'].wert as string) : null));
  const defs = faktDefinitionen(module);
  const genau = !!umring && (k.genauigkeit === 'adresse' || k.genauigkeit === undefined);
  let abgefragt = 0;
  for (const [id, def] of Object.entries(defs)) {
    if (!def.geodienst) continue;
    try {
      const e = await dienstAbfragen(holen, def.geodienst, umring, punkt);
      abgefragt++;
      const f = alsFakt(def, def.geodienst, e, { genau, heute: heute(), lage });
      if (f) fakten[id] = f;
      if (e.fehler) fehler.push(`${def.titel}: ${e.fehler}`);
    } catch (e) {
      fehler.push(`${def.titel}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  useBaurecht.getState().geoFakten(fakten);
  log.info('Lage abgefragt', { ags, dienste: abgefragt, fehler: fehler.length });
  const treffer = Object.entries(fakten).filter(([id, f]) => id.startsWith('schutz.') && f.wert === true).map(([id]) => defs[id]?.titel ?? id);
  return {
    meldung: `${ags ? `Gemeindeschlüssel ${ags}` : 'Kein Flurstück'} · ${abgefragt} Dienste abgefragt${treffer.length ? ` · Treffer: ${treffer.join(', ')}` : ' · keine Treffer (nur Hinweis, bitte bestätigen)'}`,
    fehler,
  };
}
