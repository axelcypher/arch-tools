// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { ordnerAufloesen } from './antragStore';
import type { Eintrag } from './dateisystem';

/** Projektordner wie im Büro: Ordner mit Nummern, Unterstrichen, Kurzformen */
const BAUM: Record<string, string[]> = {
  'Z:/Projekte/MUS': ['Fachplaner', 'Planung', 'TÖB'],
  'Z:/Projekte/MUS/Fachplaner': ['G27 Vermessung', 'Statik'],
  'Z:/Projekte/MUS/Planung': ['03 Genehmigungsplanung', '__Berechnungen', 'Ausführungsplanung'],
  'Z:/Projekte/MUS/Planung/03 Genehmigungsplanung': ['pdf', 'dwg'],
};
const ds = {
  liste: async (pfad: string): Promise<Eintrag[]> => {
    const kinder = BAUM[pfad];
    if (!kinder) throw new Error(`${pfad}: nicht gefunden`);
    return kinder.map((k) => ({ pfad: k, ordner: true }) as Eintrag);
  },
};

describe('Quellordner im Projektordner finden', () => {
  it('Schreibweisen: Nummern und Unterstriche vorn, Fachplaner/Fachplanung, Platzhalter', async () => {
    expect(await ordnerAufloesen(ds, 'Z:/Projekte/MUS', 'Planung/Berechnungen')).toBe('Planung/__Berechnungen');
    expect(await ordnerAufloesen(ds, 'Z:/Projekte/MUS', 'Planung/Genehmigungsplanung/pdf')).toBe('Planung/03 Genehmigungsplanung/pdf');
    expect(await ordnerAufloesen(ds, 'Z:/Projekte/MUS', 'Fachplanung/G27*')).toBe('Fachplaner/G27 Vermessung');
    // was es nicht gibt, bleibt wie angegeben
    expect(await ordnerAufloesen(ds, 'Z:/Projekte/MUS', 'Planung/Kosten/pdf')).toBe('Planung/Kosten/pdf');
  });
});
