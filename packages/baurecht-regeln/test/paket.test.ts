/**
 * Prüfungen über das ganze Regelpaket: Format, bekannte Fakten/Merkmale/Bausteine/Verweise, Prüfsummen eingetragen,
 * und eine Fallmatrix, die jede Regel mit allen Kombinationen der Merkmale (auch „nicht festgelegt“) auswertet.
 */
import { describe, expect, it } from 'vitest';
import type { AuswertungsEingabe } from '@core/baurecht/auswertung';
import { auswerten } from '@core/baurecht/auswertung';
import { aktiveModule, paketPruefen } from '@core/baurecht/paket';
import type { FaktWert } from '@core/baurecht/typen';
import { VORGABE_MERKMALE } from '@core/bedingung';
import { paketLaden } from './laden';

const paket = paketLaden();
const SOEST = '05974040';

describe('Regelpaket', () => {
  it('enthält die Module Bund, NRW, Kreis Soest und Stadt Soest', () => {
    expect(paket.module.map((m) => m.id).sort()).toEqual(['bund', 'nw', 'nw-05974', 'nw-05974040']);
    expect(aktiveModule(paket.module, SOEST).map((m) => m.id)).toEqual(['bund', 'nw', 'nw-05974', 'nw-05974040']);
  });

  it('ist in sich stimmig (Fakten, Merkmale, Bausteine, Verweise, Dateinamen)', () => {
    expect(paketPruefen(paket, VORGABE_MERKMALE)).toEqual([]);
  });

  it('jede Norm mit Text hat eine Regeldatei; jede Fundstelle hat eine Prüfsumme', () => {
    const fehlt: string[] = [];
    for (const m of paket.module)
      for (const [norm, def] of Object.entries(m.normen)) {
        const l = paket.regeln.get(`${m.id}/${norm}`);
        if (!l?.length) {
          fehlt.push(`${m.id}/${norm}: keine Regeldatei`);
          continue;
        }
        if (def.quelle.art === 'verweis') continue;
        for (const [nr, r] of Object.entries(l[l.length - 1].regel.paragrafen)) for (const fs of r.fundstellen ?? [nr]) if (!r.stand?.[fs]) fehlt.push(`${m.id}/${norm} § ${nr}: keine Prüfsumme für ${fs} (npm run stand)`);
      }
    expect(fehlt).toEqual([]);
  });

  it('jede Gemeinde des Kreises bekommt ihre Zuständigkeit', () => {
    const kreis = paket.module.find((m) => m.id === 'nw-05974')!;
    expect(Object.keys(kreis.fakten ?? {})).toEqual(expect.arrayContaining(['zustaendig.bauaufsicht']));
  });
});

/* ---------- Fallmatrix ---------- */

const WERTE: Record<string, (string | undefined)[]> = {
  Vorhaben: ['Errichtung', 'Änderung', 'Nutzungsänderung', 'Beseitigung', undefined],
  Gebäudeart: ['Einfamilienhaus', 'Mehrfamilienhaus', 'Nichtwohngebäude', 'kein Gebäude', undefined],
  Gebäudeklasse: ['1', '3', '5', undefined],
  Planungsrecht: ['Bebauungsplan', 'einfacher Bebauungsplan', 'Innenbereich', 'Außenbereich', undefined],
  Verfahren: ['Genehmigungsfreistellung', 'vereinfachtes Verfahren', 'Baugenehmigungsverfahren', undefined],
};

function* kombinationen(): Generator<Record<string, string>> {
  const namen = Object.keys(WERTE);
  const lauf = function* (i: number, acc: Record<string, string>): Generator<Record<string, string>> {
    if (i === namen.length) {
      yield acc;
      return;
    }
    for (const w of WERTE[namen[i]]) yield* lauf(i + 1, w ? { ...acc, [namen[i]]: w } : acc);
  };
  yield* lauf(0, {});
}

const sicher = (wert: FaktWert['wert']): FaktWert => ({ wert, herkunft: 'manuell', sicherheit: 'sicher' });

function eingabe(merkmale: Record<string, string>, fakten: Record<string, FaktWert> = {}, ags = SOEST): AuswertungsEingabe {
  return {
    paket,
    module: aktiveModule(paket.module, ags),
    merkmale,
    fakten: { 'lage.ags': sicher(ags), ...fakten },
    einreichung: '2026-12-01',
    heute: '2026-11-12',
    texte: new Map(),
    festlegungen: {},
  };
}

describe('Fallmatrix', () => {
  it('jede Kombination der Merkmale lässt sich auswerten; ohne Angaben ist nichts grün, was hängen bleibt', { timeout: 180000 }, () => {
    let n = 0;
    for (const m of kombinationen()) {
      const a = auswerten(eingabe(m));
      for (const p of a.paragrafen) {
        // fehlende Angaben machen nie grün
        if (p.automatisch === 'gruen') expect(p.offen, `${p.id} bei ${JSON.stringify(m)}`).toEqual([]);
        expect(p.gruende.length, p.id).toBeGreaterThan(0);
      }
      n++;
    }
    expect(n).toBe(5 * 5 * 4 * 5 * 4);
  });

  it('ohne jede Angabe ist kein Paragraf grün, außer er entfällt mit Sicherheit', () => {
    const a = auswerten(eingabe({}));
    const gruen = a.paragrafen.filter((p) => p.ampel === 'gruen');
    for (const p of gruen) expect(p.gruende[0], p.id).toMatch(/Entfällt|Gilt nicht/);
  });
});
