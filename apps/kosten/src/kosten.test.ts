import { describe, expect, it } from 'vitest';
import { readProjectFile, writeArchive } from '@core/archive';
import type { KostenPosition, Project } from '@core/model';
import { KG_RISIKO, istRisiko, kgEbene, kgInBasis, kgName, kgUnter, standardBezug } from './din276';
import { berechne, bezugLabel, euro, euroSpanne, faktorVon, spanneVon, standAus, vergleiche } from './kosten';
import { mengen, mengenAbgeleitet } from './mengen';
import { addPositionen, mapPosition, removePosition, setKosten } from './store';
import { projekt, projektMitKosten } from './testdaten';

const mitKosten = (patch: Partial<NonNullable<Project['kosten']>>): Project => setKosten(projektMitKosten(), patch);
const summe = (p: Project, kg: string) => berechne(p).summen.find((s) => s.kg === kg)?.summe;

describe('DIN 276', () => {
  it('Gliederung: Ebenen, Unterordnung und Grundlagen', () => {
    expect(['300', '330', '331', '900', '33'].map(kgEbene)).toEqual([1, 2, 3, 0, 0]);
    expect(kgUnter('331', '300')).toBe(true);
    expect(kgUnter('331', '330')).toBe(true);
    expect(kgUnter('330', '340')).toBe(false);
    expect(kgInBasis('412', ['300', '400'])).toBe(true);
    expect(kgInBasis('500', ['300', '400'])).toBe(false);
  });

  it('übliche Bezugsgröße je Kostengruppe', () => {
    expect(standardBezug('300').bezug).toBe('bgf');
    expect(standardBezug('330').bezug).toBe('awf');
    expect(standardBezug('361').bezug).toBe('daf');
    expect(standardBezug('420').bezug).toBe('bgf');
    expect(standardBezug('500').bezug).toBe('auf');
    expect(standardBezug('730')).toEqual({ bezug: 'prozent', basis: ['300', '400'] });
  });
});

describe('Mengen', () => {
  it('aus dem Projekt abgeleitet (Handrechnung)', () => {
    const m = mengenAbgeleitet(projekt());
    expect(m.bgf).toBeCloseTo(4 * 135, 2);
    expect(m.grf).toBeCloseTo(135, 2);
    expect(m.def).toBeCloseTo(3 * 135, 2);
    expect(m.bgi).toBeCloseTo(135 * 2.8, 2);
    // Außenwand: Umfang 46,5 m × (2,80 + 3,45 + 3,20) m; das Walmdach beginnt an der Traufe ohne Kniestock
    expect(m.awf).toBeCloseTo(46.5 * 9.45, 1);
    // Walmdach 45°: Grundfläche / cos 45°
    expect(m.daf).toBeCloseTo(135 / Math.cos(Math.PI / 4), 1);
    expect(m.fbg).toBe(612.5);
    expect(m.auf).toBeCloseTo(612.5 - 135, 2);
    expect(m.bri).toBeGreaterThan(135 * 9.45);
  });

  it('festgelegte Menge gilt statt der abgeleiteten', () => {
    const m = mengen(mitKosten({ mengen: { bgf: 500 } }));
    expect(m.bgf).toEqual({ wert: 500, abgeleitet: 540, festgelegt: true });
    expect(m.grf.festgelegt).toBe(false);
  });
});

describe('Kosten', () => {
  it('Bandbreite: fehlende Werte werden ergänzt', () => {
    expect(spanneVon({ mittel: 10 })).toEqual([10, 10, 10]);
    expect(spanneVon({ von: 8, bis: 12 })).toEqual([8, 10, 12]);
    expect(spanneVon({ von: 8 })).toEqual([8, 8, 8]);
    expect(spanneVon({})).toEqual([0, 0, 0]);
  });

  it('Kostenschätzung gegen Handrechnung', () => {
    const e = berechne(projektMitKosten());
    const s = (kg: string) => e.summen.find((x) => x.kg === kg)!.summe;
    // KG 300: 540 m² BGF × 1.500 / 1.800 / 2.100 €
    expect(s('300')).toEqual([810000, 972000, 1134000]);
    // KG 400: 540 m² × 600 €
    expect(s('400')).toEqual([324000, 324000, 324000]);
    // KG 500: befestigte Flächen 477,5 m² × 120 € (KG 530) + Carport pauschal 30.000 € (KG 540)
    expect(s('500')[1]).toBeCloseTo(57300 + 30000, 2);
    expect(s('530')[1]).toBeCloseTo(57300, 2);
    expect(s('540')[1]).toBe(30000);
    // KG 700: 18 / 20 / 22 % von KG 300 + 400
    expect(s('700')[0]).toBeCloseTo(0.18 * 1134000, 2);
    expect(s('700')[1]).toBeCloseTo(0.2 * 1296000, 2);
    expect(s('700')[2]).toBeCloseTo(0.22 * 1458000, 2);
    expect(e.gesamtNetto[0]).toBeCloseTo(1425420, 2);
    expect(e.gesamtNetto[1]).toBeCloseTo(1642500, 2);
    expect(e.gesamtNetto[2]).toBeCloseTo(1866060, 2);
    expect(e.gesamtBrutto[1]).toBeCloseTo(1642500 * 1.19, 2);
    // Bauwerk brutto je m² BGF: (972.000 + 324.000) × 1,19 / 540
    expect(e.kennwerte.find((k) => k.kurz === 'BGF')!.wert[1]).toBeCloseTo(2856, 2);
    expect(e.hinweise).toEqual([]);
  });

  it('Baupreisindex und Regionalfaktor wirken auf Kennwerte, nicht auf Pauschalen und Prozentsätze', () => {
    const p = mitKosten({ indexBasis: 100, indexAktuell: 120, regionalfaktor: 1.05 });
    const e = berechne(p);
    expect(e.faktor).toBeCloseTo(1.26, 6);
    expect(summe(p, '300')![1]).toBeCloseTo(972000 * 1.26, 2);
    expect(summe(p, '540')![1]).toBe(30000);
    expect(summe(p, '700')![1]).toBeCloseTo(0.2 * 1296000 * 1.26, 2);
    expect(e.hinweise.join(' ')).toContain('Faktor 1,26');
  });

  it('Kennwerte brutto werden auf netto umgerechnet; eigener Umsatzsteuersatz', () => {
    const p = mitKosten({ kennwerteBrutto: true, mwst: 7 });
    const e = berechne(p);
    expect(summe(p, '300')![1]).toBeCloseTo(972000 / 1.07, 2);
    expect(e.gesamtBrutto[1]).toBeCloseTo(e.gesamtNetto[1] * 1.07, 2);
  });

  it('eigene Menge, ausgeschaltete Position und dritte Ebene', () => {
    let p = addPositionen(projektMitKosten(), [{ id: 'p461', kg: '461', bezeichnung: 'Aufzug', bezug: 'menge', menge: 2, einheit: 'Stk', mittel: 45000 }]);
    expect(p.kosten!.positionen.map((x) => x.kg)).toEqual(['300', '400', '461', '530', '540', '700']);
    expect(summe(p, '460')![1]).toBe(90000);
    // KG 400 und 461 gleichzeitig: Hinweis auf Doppelerfassung
    expect(berechne(p).hinweise.join(' ')).toContain('KG 400 und KG 461');
    p = mapPosition(p, 'p461', (x) => ({ ...x, aus: true }));
    expect(summe(p, '460')).toBeUndefined();
    expect(berechne(p).hinweise).toEqual([]);
    expect(removePosition(p, 'p461').kosten!.positionen).toHaveLength(5);
  });

  it('Hinweise: fehlender Kennwert, fehlende Menge, ungültige Kostengruppe, Grundlage mit eigener Kostengruppe', () => {
    const p = setKosten(projekt(), {
      positionen: [
        { id: 'a', kg: '300', bezeichnung: 'ohne Kennwert', bezug: 'bgf' },
        { id: 'b', kg: '610', bezeichnung: 'ohne Menge', bezug: 'menge', mittel: 500 },
        { id: 'c', kg: '9', bezeichnung: 'falsche KG', bezug: 'pauschal', mittel: 1000 },
        { id: 'd', kg: '730', bezeichnung: 'Honorar', bezug: 'prozent', basis: ['300', '700'], mittel: 10 },
      ],
    });
    const e = berechne(p);
    expect(e.positionen.map((x) => x.hinweis)).toEqual(['Kennwert fehlt', 'Menge fehlt', undefined, 'Grundlage enthält die eigene Kostengruppe']);
    expect(e.positionen[2].aktiv).toBe(false);
    expect(e.gesamtNetto).toEqual([0, 0, 0]);
    expect(e.hinweise.join(' ')).toContain('keine gültige Kostengruppe');
    expect(e.hinweise.join(' ')).toContain('3 Positionen ohne Menge oder Kennwert');
  });

  it('Bezugsgröße als Text', () => {
    const [p300, , , p540, p700] = projektMitKosten().kosten!.positionen;
    expect([p300, p540, p700].map(bezugLabel)).toEqual(['m² BGF', 'psch', '% von KG 300 + 400']);
    expect(bezugLabel({ bezug: 'menge', einheit: 'lfm' })).toBe('lfm');
  });

  it('Prozentpositionen hängen nicht von der Reihenfolge ab', () => {
    // 300 pauschal 1.000.000 € · 700 = 20 % von 300 = 200.000 € · 810 = 10 % von 300 + 700 = 120.000 € → 1.320.000 €
    const p300: KostenPosition = { id: 'a', kg: '300', bezeichnung: 'Bauwerk', bezug: 'pauschal', mittel: 1000000 };
    const p700: KostenPosition = { id: 'b', kg: '700', bezeichnung: 'Baunebenkosten', bezug: 'prozent', basis: ['300'], mittel: 20 };
    const p810: KostenPosition = { id: 'c', kg: '810', bezeichnung: 'Finanzierung', bezug: 'prozent', basis: ['300', '700'], mittel: 10 };
    const gesamt = (positionen: KostenPosition[]) => berechne(setKosten(projekt(), { positionen })).gesamtNetto[1];
    expect(gesamt([p300, p700, p810])).toBeCloseTo(1320000, 2);
    expect(gesamt([p300, p810, p700])).toBeCloseTo(1320000, 2);
    expect(gesamt([p810, p700, p300])).toBeCloseTo(1320000, 2);
    // Gegenprobe: ohne KG 700 in der Grundlage nur 10 % von 300
    expect(gesamt([p300, { ...p810, basis: ['300'] }, p700])).toBeCloseTo(1300000, 2);
    // ausgeschaltete Prozentposition zählt nicht zur Grundlage, wird aber selbst gerechnet
    const e = berechne(setKosten(projekt(), { positionen: [p300, p810, { ...p700, aus: true }] }));
    expect(e.gesamtNetto[1]).toBeCloseTo(1100000, 2);
    expect(e.positionen[2].kosten[1]).toBeCloseTo(200000, 2);
  });

  it('Zirkelbezug zwischen Prozentpositionen (auch über mehrere Stufen) wird erkannt und mit 0 € gerechnet', () => {
    const positionen: KostenPosition[] = [
      { id: 'a', kg: '300', bezeichnung: 'Bauwerk', bezug: 'pauschal', mittel: 1000000 },
      { id: 'b', kg: '710', bezeichnung: 'A', bezug: 'prozent', basis: ['300', '820'], mittel: 10 },
      { id: 'c', kg: '820', bezeichnung: 'B', bezug: 'prozent', basis: ['600'], mittel: 10 },
      { id: 'd', kg: '610', bezeichnung: 'C', bezug: 'prozent', basis: ['710'], mittel: 10 },
      // baut nur auf dem Zirkel auf, gehört nicht dazu
      { id: 'e', kg: '510', bezeichnung: 'D', bezug: 'prozent', basis: ['300', '700'], mittel: 1 },
    ];
    const e = berechne(setKosten(projekt(), { positionen }));
    expect(e.positionen.slice(1, 4).map((x) => x.kosten)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(e.positionen[1].hinweis).toBe('Zirkelbezug mit KG 820, KG 610 – mit 0 € gerechnet');
    expect(e.positionen[4].kosten[1]).toBeCloseTo(10000, 2);
    expect(e.positionen[4].hinweis).toBeUndefined();
    expect(e.hinweise.join(' ')).toContain('Zirkelbezug zwischen Prozentpositionen (KG 710, KG 820, KG 610)');
    expect(e.hinweise.join(' ')).not.toContain('ohne Menge oder Kennwert');
    // Gegenprobe: Kette ohne Rückbezug wird vollständig gerechnet (610 = 10 % von 710 = 10.000 €, 820 = 10 % davon)
    const kette = berechne(setKosten(projekt(), { positionen: positionen.map((x) => (x.id === 'b' ? { ...x, basis: ['300'] } : x)) }));
    expect(kette.positionen.map((x) => Math.round(x.kosten[1]))).toEqual([1000000, 100000, 1000, 10000, 11000]);
    expect(kette.hinweise.join(' ')).not.toContain('Zirkelbezug');
  });

  it('Grundlage ohne Kosten wird gemeldet', () => {
    const positionen: KostenPosition[] = [
      { id: 'a', kg: '300', bezeichnung: 'Bauwerk', bezug: 'pauschal', mittel: 500000 },
      { id: 'b', kg: '700', bezeichnung: 'Baunebenkosten', bezug: 'prozent', basis: ['400'], mittel: 20 },
    ];
    const e = berechne(setKosten(projekt(), { positionen }));
    expect(e.positionen[1].hinweis).toBe('Grundlage ohne Kosten (KG 400)');
    expect(e.hinweise.join(' ')).toContain('1 Position ohne Menge oder Kennwert: KG 700 (Grundlage ohne Kosten (KG 400))');
    // Gegenprobe: Grundlage mit Kosten
    const ok = berechne(setKosten(projekt(), { positionen: [positionen[0], { ...positionen[1], basis: ['300'] }] }));
    expect(ok.positionen[1].hinweis).toBeUndefined();
    expect(ok.hinweise).toEqual([]);
  });

  it('vertauschte Bandbreite wird sortiert gerechnet und gemeldet', () => {
    expect(spanneVon({ von: 20, mittel: 10, bis: 5 })).toEqual([5, 10, 20]);
    expect(spanneVon({ von: 12, bis: 8 })).toEqual([8, 10, 12]);
    const p = setKosten(projekt(), { positionen: [{ id: 'a', kg: '400', bezeichnung: 'TGA', bezug: 'bgf', von: 700, mittel: 600, bis: 500 }] });
    const e = berechne(p);
    // 540 m² BGF × 500 / 600 / 700 €
    expect(e.gesamtNetto).toEqual([270000, 324000, 378000]);
    expect(e.positionen[0].hinweis).toBe('von/Mittel/bis nicht aufsteigend – sortiert gerechnet');
    expect(e.hinweise.join(' ')).toContain('1 Position mit unplausiblen Eingaben – bitte prüfen: KG 400');
    // Gegenprobe: aufsteigende Eingabe ohne Hinweis
    const ok = berechne(setKosten(projekt(), { positionen: [{ id: 'a', kg: '400', bezeichnung: 'TGA', bezug: 'bgf', von: 500, mittel: 600, bis: 700 }] }));
    expect(ok.gesamtNetto).toEqual(e.gesamtNetto);
    expect(ok.positionen[0].hinweis).toBeUndefined();
  });

  it('ungültiger Baupreisindex, Regionalfaktor und Umsatzsteuersatz werden gemeldet und ersetzt', () => {
    const regional0 = berechne(mitKosten({ regionalfaktor: 0 }));
    expect(regional0.faktor).toBe(1);
    expect(regional0.gesamtNetto[1]).toBeCloseTo(1642500, 2);
    expect(regional0.hinweise.join(' ')).toContain('Regionalfaktor ungültig (0)');
    const index0 = berechne(mitKosten({ indexBasis: 100, indexAktuell: 0, regionalfaktor: 1.1 }));
    expect(index0.faktor).toBeCloseTo(1.1, 9);
    expect(index0.hinweise.join(' ')).toContain('Baupreisindex ungültig (Stand der Kennwerte 100, aktuell 0)');
    expect(faktorVon({ positionen: [], indexBasis: Number.NaN, indexAktuell: 120 })).toBe(1);
    expect(faktorVon({ positionen: [], regionalfaktor: -1 })).toBe(1);
    const ust = berechne(mitKosten({ mwst: 190 }));
    expect(ust.mwst).toBe(19);
    expect(ust.gesamtBrutto[1]).toBeCloseTo(1642500 * 1.19, 2);
    expect(ust.hinweise.join(' ')).toContain('Umsatzsteuersatz ungültig (190 %) – mit 19 % gerechnet');
    expect(berechne(mitKosten({ mwst: -5 })).mwst).toBe(19);
    // Gegenprobe: gültige Werte, darunter 0 % Umsatzsteuer, ohne Hinweis
    const ok = berechne(mitKosten({ indexBasis: 100, indexAktuell: 110, regionalfaktor: 0.9, mwst: 0 }));
    expect(ok.faktor).toBeCloseTo(0.99, 9);
    expect(ok.mwst).toBe(0);
    expect(ok.hinweise.join(' ')).not.toContain('ungültig');
  });

  it('negative Mengen und Kennwerte (etwa aus einer Datei) werden gemeldet', () => {
    const p = setKosten(projekt(), {
      positionen: [
        { id: 'a', kg: '461', bezeichnung: 'Aufzug', bezug: 'menge', menge: -2, einheit: 'Stk', mittel: 45000 },
        { id: 'b', kg: '420', bezeichnung: 'Heizung', bezug: 'bgf', mittel: -95 },
        { id: 'c', kg: '700', bezeichnung: 'Nebenkosten', bezug: 'prozent', basis: ['400'], mittel: -5 },
      ],
    });
    const e = berechne(p);
    expect(e.positionen.map((x) => x.hinweis)).toEqual(['Menge negativ', 'Kennwert negativ', 'Prozentsatz negativ']);
    expect(e.hinweise.join(' ')).toContain('3 Positionen mit unplausiblen Eingaben – bitte prüfen: KG 461 (Menge negativ), KG 420 (Kennwert negativ), KG 700 (Prozentsatz negativ)');
    // Gegenprobe
    const ok = berechne(setKosten(projekt(), { positionen: [{ id: 'a', kg: '461', bezeichnung: 'Aufzug', bezug: 'menge', menge: 2, einheit: 'Stk', mittel: 45000 }] }));
    expect(ok.positionen[0].hinweis).toBeUndefined();
  });

  it('Kostenrisiken: gesondert ausgewiesen, nicht in den Kostengruppen, aber in den Gesamtkosten', () => {
    expect(istRisiko(KG_RISIKO)).toBe(true);
    expect(istRisiko('300')).toBe(false);
    expect(kgName(KG_RISIKO)).toBe('Kostenrisiken');
    expect(standardBezug(KG_RISIKO)).toEqual({ bezug: 'prozent', basis: ['300', '400'] });
    // 5 % von KG 300 + 400 (1.296.000 €) = 64.800 € und pauschal 10.000 €
    const p = addPositionen(projektMitKosten(), [
      { id: 'r1', kg: KG_RISIKO, bezeichnung: 'Baugrund', bezug: 'prozent', basis: ['300', '400'], mittel: 5 },
      { id: 'r2', kg: KG_RISIKO, bezeichnung: 'Altlasten', bezug: 'pauschal', mittel: 10000 },
    ]);
    const e = berechne(p);
    expect(e.risiko[1]).toBeCloseTo(64800 + 10000, 2);
    expect(e.kgNetto[1]).toBeCloseTo(1642500, 2);
    expect(e.gesamtNetto[1]).toBeCloseTo(1642500 + 74800, 2);
    expect(e.gesamtBrutto[1]).toBeCloseTo((1642500 + 74800) * 1.19, 2);
    expect(e.summen.map((x) => x.kg)).not.toContain(KG_RISIKO);
    // Baunebenkosten (KG 700 auf 300 + 400) und Kennwerte des Bauwerks bleiben ohne Risiko
    expect(e.summen.find((x) => x.kg === '700')!.summe[1]).toBeCloseTo(259200, 2);
    expect(e.kennwerte.find((x) => x.kurz === 'BGF')!.wert[1]).toBeCloseTo(2856, 2);
    expect(e.hinweise).toEqual([]);
    // Kostenstand und Vergleich führen das Risiko als eigene Zeile
    const stand = standAus(e, 'berechnung', '', '2026-07-01');
    expect(stand.summen[KG_RISIKO][1]).toBeCloseTo(74800, 2);
    const v = vergleiche(stand, berechne(mapPosition(p, 'r2', (x) => ({ ...x, aus: true }))));
    expect(v.zeilen.at(-1)).toMatchObject({ kg: KG_RISIKO, name: 'Kostenrisiken', differenz: -10000 });
    expect(v.zeilen.reduce((a, z) => a + z.differenz, 0)).toBeCloseTo(v.gesamt.differenz, 6);
    // Gegenprobe: ohne Risiko-Positionen ist gesamtNetto = kgNetto, kein Schlüssel im Kostenstand
    const ohne = berechne(projektMitKosten());
    expect(ohne.risiko).toEqual([0, 0, 0]);
    expect(ohne.gesamtNetto).toEqual(ohne.kgNetto);
    expect(standAus(ohne, 'schaetzung', '').summen[KG_RISIKO]).toBeUndefined();
  });

  it('Kostenrisiken sind keine Grundlage anderer Prozentpositionen', () => {
    const p = setKosten(projekt(), {
      positionen: [
        { id: 'a', kg: '300', bezeichnung: 'Bauwerk', bezug: 'pauschal', mittel: 1000000 },
        { id: 'r', kg: KG_RISIKO, bezeichnung: 'Risiko', bezug: 'prozent', basis: ['300'], mittel: 10 },
        { id: 'b', kg: '700', bezeichnung: 'Baunebenkosten', bezug: 'prozent', basis: ['300', KG_RISIKO], mittel: 20 },
      ],
    });
    const e = berechne(p);
    expect(e.positionen[2].kosten[1]).toBeCloseTo(200000, 2);
    expect(e.positionen[2].hinweis).toBe('Kostenrisiken sind keine Grundlage – nicht berücksichtigt');
    expect(e.positionen[1].hinweis).toBeUndefined();
    expect(e.hinweise.join(' ')).not.toContain('keine gültige Kostengruppe');
    expect(e.gesamtNetto[1]).toBeCloseTo(1300000, 2);
  });

  it('Euro-Beträge ohne „-0“ und „NaN“', () => {
    expect(euro(-0.3)).toBe('0 €');
    expect(euro(Number.NaN)).toBe('0 €');
    expect(euro(1234.5)).toBe('1.235 €');
    expect(euroSpanne([-0.4, 0, 0.4])).toBe('0 €');
    expect(euroSpanne([Number.NaN, 5, 10])).toBe('0 – 10 €');
    expect(euroSpanne([-1000, 0, 1000])).toBe('-1.000 – 1.000 €');
  });
});

describe('Kostenstände', () => {
  it('Stand festhalten und nach einer Flächenänderung vergleichen', () => {
    const p = projektMitKosten();
    const stand = standAus(berechne(p), 'schaetzung', 'Vorentwurf', '2026-07-01');
    expect(stand.gesamtNetto[1]).toBeCloseTo(1642500, 2);
    expect(stand.mengen.bgf).toBe(540);
    // BGF sinkt auf 500 m²: KG 300 −72.000 €, KG 400 −24.000 €, KG 700 −19.200 €
    const v = vergleiche(stand, berechne(setKosten(p, { mengen: { bgf: 500 } })));
    expect(v.zeilen.map((z) => [z.kg, Math.round(z.differenz)])).toEqual([
      ['300', -72000],
      ['400', -24000],
      ['500', 0],
      ['700', -19200],
    ]);
    expect(v.gesamt.differenz).toBeCloseTo(-115200, 2);
    expect(v.mengen).toEqual([{ bezug: 'bgf', vorher: 540, jetzt: 500 }]);
  });

  it('Kosten, Kostenstände und Festlegungen überstehen das Speichern im Projektarchiv', () => {
    let p = mitKosten({ mengen: { bgf: 500 }, indexBasis: 100, indexAktuell: 120, katalog: { name: 'Büro', stand: '1/2026' } });
    p = setKosten(p, { staende: [standAus(berechne(p), 'schaetzung', 'Vorentwurf', '2026-07-01')] });
    const back = readProjectFile(writeArchive(p, { app: 'Test' }));
    expect(back.kosten).toEqual(p.kosten);
    expect(berechne(back).gesamtNetto).toEqual(berechne(p).gesamtNetto);
  });
});
