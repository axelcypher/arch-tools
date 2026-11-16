import type { Project } from '@core/model';
import { berechne, standAus } from '../kosten';
import { positionen, projekt } from '../testdaten';
import { buildKostenContext } from './exportData';

/**
 * Erfundene Beispieldaten der Platzhalter-Referenz von NUMIO (Beschreibung in NUMIO_SCHEMA.beispieldaten) – nur für
 * Tests: Kostenschätzung mit Positionen der KG 300, 400, 530, 540, 700, einer ausgeschalteten Position, Kostenrisiken,
 * einer festgelegten Menge und zwei festgehaltenen Ständen.
 */
export function platzhalterProjekt(): Project {
  const p = projekt();
  p.name = 'Musterhaus';
  p.meta.projektcode = '2417';
  p.kosten = {
    stufe: 'schaetzung',
    datum: '2026-07-01',
    katalog: { name: 'Büro-Kennwerte', quelle: 'eigene Projekte', stand: '1/2026' },
    positionen: [
      ...positionen(),
      { id: 'p560', kg: '560', bezeichnung: 'Einbauten in Außenanlagen', bezug: 'pauschal', mittel: 5000, aus: true },
      { id: 'p610', kg: '610', bezeichnung: 'Ausstattung', bezug: 'wofl', mittel: 50 },
      { id: 'pr', kg: 'risiko', bezeichnung: 'Unvorhergesehenes', bezug: 'pauschal', von: 10000, mittel: 15000, bis: 20000 },
    ],
    mengen: { auf: 400 },
    regionalfaktor: 1.1,
  };
  const e = berechne(p);
  p.kosten.staende = [standAus(e, 'rahmen', 'Vorentwurf', '2026-03-01'), standAus(e, 'schaetzung', 'Entwurf', '2026-07-01')];
  return p;
}

export const platzhalterKontext = () => buildKostenContext(platzhalterProjekt(), new Date(2026, 10, 16));
