import { beforeEach, describe, expect, it } from 'vitest';
import { readProjectFile } from '@core/archive';
import { baurechtAusRoh, leerePruefung, pruefungSetzen } from '@core/baurecht/projekt';
import type { FaktWert, NormErgebnis, ParagrafErgebnis } from '@core/baurecht/typen';
import { projektdateiRoh } from '@core/projektdatei';
import { beispielOap } from './beispiel.test';
import { wieAngezeigt } from './components/Angaben';
import { suchTreffer } from './components/Vorschriften';
import { aenderungenAnwenden } from './projekt';
import { alleFakten, auswertungMit, OHNE_LAGEBEZUG, planungsrechtVerschoben, pruefstandBerechnen } from './pruefung';
import { useBaurecht } from './store';

const ergebnis = (id: string): ParagrafErgebnis =>
  ({ id, modul: 'bund', norm: 'bnatschg', paragraf: '44', titel: 'Artenschutz', ampel: 'gelb', automatisch: 'gelb', gruende: ['x'], hinweise: [], offen: [], unsicher: [], geaendert: [], verwendet: ['merkmal:Vorhaben'], fundstellen: ['44/1'] }) as ParagrafErgebnis;

/** Anschrift des geladenen Projekts ändern (wie in den Stammdaten) */
function umziehen(strasse: string) {
  const s = useBaurecht.getState();
  useBaurecht.setState({ project: { ...s.project!, meta: { ...s.project!.meta, adresse: { ...s.project!.meta.adresse, strasse } } } });
}

describe('Ort: Festlegungen und Planungsrecht nach einem Adresswechsel', () => {
  beforeEach(() => {
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  });

  it('die Festlegung trägt den Ort und wird nach einem Umzug überholt (nicht mehr grün)', () => {
    const st = useBaurecht.getState();
    st.festlegen(ergebnis('bund/bnatschg/44'), 'gruen', 'Begehung am 03.11.2026 ohne Befund', 'TP', {}, { 'merkmal:Vorhaben': 'Errichtung' });
    const f = useBaurecht.getState().pruefung.festlegungen['bund/bnatschg/44'];
    expect(f.ort?.adresse).toMatch(/\|/);
    // der Ort landet auch in der Datei
    useBaurecht.getState().festlegungenBestaetigen(['bund/bnatschg/44']);
    expect(baurechtAusRoh(aenderungenAnwenden(useBaurecht.getState().roh!)).pruefungen['BAUA 1'].festlegungen['bund/bnatschg/44'].ort).toEqual(f.ort);
    const stand = () => {
      const s = useBaurecht.getState();
      return pruefstandBerechnen(s.paket, s.project, s.merkmale, s.pruefung.fakten, s.pruefung.festlegungen, '2026-12-01', {}, s.pruefung.planungsrechtOrt).auswertung.paragrafen.find((p) => p.id === 'bund/bnatschg/44')!;
    };
    expect(stand().ueberholt ?? '').not.toMatch(/Ort/);
    umziehen('Andere Straße 9');
    expect(stand().ueberholt).toMatch(/Ort seit der Festlegung: Anschrift/);
    expect(stand().ampel).not.toBe('gruen');
  });

  it('Planungsrecht zu einem früheren Ort: Hinweis, zählt als nicht gesichert, „Gilt hier“ bestätigt es', () => {
    const st = useBaurecht.getState();
    // aus Formulare bzw. der Datei, nie in Baurecht bestätigt: nicht gesichert, mit eigenem Grund (kein Widerspruch)
    const s0 = useBaurecht.getState();
    expect(planungsrechtVerschoben(s0.project, s0.merkmale, s0.pruefung.planungsrechtOrt)).toMatch(/noch für keinen Ort bestätigt/);
    const p0 = pruefstandBerechnen(s0.paket, s0.project, s0.merkmale, s0.pruefung.fakten, {}, '2026-12-01', {}, s0.pruefung.planungsrechtOrt);
    expect(p0.planungsrechtHinweis).toMatch(/^Planungsrecht „.+“ noch für keinen Ort bestätigt/);
    expect(p0.auswertung.paragrafen.some((x) => x.gruende.some((g) => g.includes('Nicht gesichert: Planungsrecht')))).toBe(true);
    expect(p0.auswertung.paragrafen.some((x) => x.gruende.some((g) => /Widerspruch: Planungsrecht/.test(g)))).toBe(false);
    st.merkmalSetzen('Planungsrecht', 'Innenbereich');
    expect(useBaurecht.getState().pruefung.planungsrechtOrt).toMatchObject({ wert: 'Innenbereich' });
    const s1 = useBaurecht.getState();
    expect(planungsrechtVerschoben(s1.project, s1.merkmale, s1.pruefung.planungsrechtOrt)).toBeUndefined();
    umziehen('Andere Straße 9');
    const s2 = useBaurecht.getState();
    expect(planungsrechtVerschoben(s2.project, s2.merkmale, s2.pruefung.planungsrechtOrt)).toMatch(/früheren Ort \(Anschrift/);
    const p = pruefstandBerechnen(s2.paket, s2.project, s2.merkmale, s2.pruefung.fakten, {}, '2026-12-01', {}, s2.pruefung.planungsrechtOrt);
    expect(p.planungsrechtFrueher).toBeDefined();
    expect(p.widerspruchMerkmale).toContain('Planungsrecht');
    useBaurecht.getState().planungsrechtBestaetigen();
    const s3 = useBaurecht.getState();
    expect(planungsrechtVerschoben(s3.project, s3.merkmale, s3.pruefung.planungsrechtOrt)).toBeUndefined();
    // der Wert ändert sich (z. B. in Formulare): wieder nicht gesichert
    expect(planungsrechtVerschoben(s3.project, { ...s3.merkmale, Planungsrecht: 'Außenbereich' }, s3.pruefung.planungsrechtOrt)).toMatch(/seit der Bestätigung geändert/);
    // die Vorschau rechnet mit demselben Stand (kein scheinbares Herabstufen ohne Änderung)
    const ohne = auswertungMit(s3.pruefung.fakten).paragrafen.map((x) => x.ampel).join();
    const mit = pruefstandBerechnen(s3.paket, s3.project, s3.merkmale, s3.pruefung.fakten, s3.pruefung.festlegungen, s3.pruefung.einreichung, s3.texte, s3.pruefung.planungsrechtOrt).auswertung.paragrafen.map((x) => x.ampel).join();
    expect(ohne).toBe(mit);
  });
});

describe('Eingaben und Suche', () => {
  it('Zahlen werden gespeichert, wie das Feld sie zeigt', () => {
    expect(wieAngezeigt(22.005, { einheit: 'm' })).toBe(22.01);
    expect(wieAngezeigt(22.004, { einheit: 'm' })).toBe(22);
    expect(wieAngezeigt(5.5, { einheit: 'Stellplätze' })).toBe(6);
    expect(wieAngezeigt(2.4, {})).toBe(2);
  });

  it('Paragrafensuche: Norm genau nach Kurzform, ohne Paragrafentreffer die Volltextsuche', () => {
    const para = (paragraf: string, titel: string, gruende: string[] = []) => ({ paragraf, titel, gruende }) as ParagrafErgebnis;
    const norm = (kurz: string, titel: string, paragrafen: ParagrafErgebnis[]) => ({ def: { kurz, titel }, paragrafen }) as unknown as NormErgebnis;
    const bauo = norm('BauO NRW', 'Landesbauordnung', [para('6', 'Abstandsflächen', ['Höhe über 22 m'])]);
    const san = norm('SAN-VO NRW', 'Verordnung zur Umsetzung der BauO NRW', [para('6', 'Stellplatzflächen')]);
    const alt = norm('Altstadtsatzung', 'Gestaltungssatzung (§ 89 BauO NRW)', [para('6', 'Dächer')]);
    const normen = [bauo, san, alt];
    const treffer = (q: string) => normen.flatMap((n) => n.paragrafen.filter((p) => suchTreffer(q, normen)(p, n)).map((p) => `${n.def.kurz} ${p.paragraf}`));
    expect(treffer('§ 6 BauO NRW')).toEqual(['BauO NRW 6']);
    expect(treffer('6 san-vo')).toEqual(['SAN-VO NRW 6']);
    // „22 m“ ist keine Paragrafennummer mit Norm – es gibt keinen § 22, also Volltext
    expect(treffer('22 m')).toEqual(['BauO NRW 6']);
  });
});

describe('Volltextsuche', () => {
  it('Kürzel am Wortanfang und auch ausgeschrieben, längere Wörter auch in zusammengesetzten', () => {
    const p = (titel: string) => ({ paragraf: '1', titel, gruende: [] }) as unknown as ParagrafErgebnis;
    const n = { def: { kurz: 'X', titel: 'X' }, paragrafen: [] } as unknown as NormErgebnis;
    expect(suchTreffer('gk')(p('Zulässigkeit von Vorhaben'), n)).toBe(false);
    expect(suchTreffer('gk')(p('Gebäudeklasse 3'), n)).toBe(true);
    expect(suchTreffer('abstand')(p('Abstandsflächen'), n)).toBe(true);
    expect(suchTreffer('flächen')(p('Abstandsflächen'), n)).toBe(true);
  });
});

describe('Paragrafensuche, Runde 10', () => {
  const para = (paragraf: string, titel: string, gruende: string[] = []) => ({ paragraf, titel, gruende }) as ParagrafErgebnis;
  const norm = (kurz: string, titel: string, paragrafen: ParagrafErgebnis[]) => ({ def: { kurz, titel }, paragrafen }) as unknown as NormErgebnis;
  const normen = [norm('BauO NRW', 'Landesbauordnung', [para('6', 'Abstandsflächen', ['nach § 6 Abs. 1'])]), norm('BauNVO', 'Baunutzungsverordnung', [para('10', 'Sondergebiete'), para('11', 'Sonstige Sondergebiete')])];
  const treffer = (q: string) => normen.flatMap((n) => n.paragrafen.filter((p) => suchTreffer(q, normen)(p, n)).map((p) => `${n.def.kurz} ${p.paragraf}`));
  it('Absatz zählt nicht zur Nummer, unbekannter § ergibt nichts, Zahlen nur als ganzes Wort', () => {
    expect(treffer('§ 6 Abs. 1 BauO NRW')).toEqual(['BauO NRW 6']);
    expect(treffer('§ 1 BauNVO')).toEqual([]);
    expect(treffer('1 sonder')).toEqual([]);
  });
});

describe('Runde 10: ältere Dateien, Speichern, Konflikte', () => {
  beforeEach(() => {
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  });

  it('Festlegungen ohne Ort: „Für diesen Ort übernehmen“ ordnet sie zu, als Entwurf', () => {
    const f = { ampel: 'gruen' as const, grund: 'Begehung ohne Befund', von: 'TP', am: '2026-11-12', automatisch: 'rot' as const, bestaetigt: '2026-11-12T10:00:00Z' };
    useBaurecht.setState({ pruefung: { ...useBaurecht.getState().pruefung, festlegungen: { 'bund/bnatschg/44': f } } });
    useBaurecht.getState().festlegungenOrtUebernehmen(['bund/bnatschg/44']);
    const neu = useBaurecht.getState().pruefung.festlegungen['bund/bnatschg/44'];
    expect(neu.ort?.adresse).toBeTruthy();
    expect(neu.bestaetigt).toBeUndefined();
  });

  it('Angaben von Hand aus älteren Dateien: negative Werte und halbe Anzahlen nur Hinweis, Lageangaben ohne Lagebezug nur Hinweis', () => {
    const s = useBaurecht.getState();
    const m = (wert: FaktWert['wert']): FaktWert => ({ wert, herkunft: 'manuell', sicherheit: 'sicher' });
    const f = alleFakten(s.project, { 'gebaeude.hoehe': m(-3), 'gebaeude.stellplaetze': m(35.5), 'gebaeude.bgf': m(120.004), 'planung.veraenderungssperre': m(false) }, s.paket.module);
    expect(f['gebaeude.hoehe']).toMatchObject({ sicherheit: 'hinweis', grund: expect.stringMatching(/negativer Wert/) });
    expect(f['gebaeude.stellplaetze']).toMatchObject({ sicherheit: 'hinweis', grund: expect.stringMatching(/nicht ganzzahlig/) });
    expect(f['gebaeude.bgf']).toMatchObject({ wert: 120, sicherheit: 'sicher' });
    expect(f['planung.veraenderungssperre']).toMatchObject({ sicherheit: 'hinweis', lage: OHNE_LAGEBEZUG });
  });

  it('Ort des Planungsrechts: bleibt beim Speichern erhalten, Konflikte werden gemeldet', () => {
    const s = useBaurecht.getState();
    const seit = { pruefung: structuredClone(s.pruefung), merkmale: { ...s.merkmale } };
    s.merkmalSetzen('Planungsrecht', 'Außenbereich');
    // während des Speicherns gesetzt: nach gespeichert(…, seit) noch da
    useBaurecht.getState().gespeichert(useBaurecht.getState().roh!, undefined, seit);
    expect(useBaurecht.getState().pruefung.planungsrechtOrt).toMatchObject({ wert: 'Außenbereich' });
    // beide Seiten geändert: Konflikt
    const basis = leerePruefung();
    const datei = pruefungSetzen({}, 'A', { ...leerePruefung(), planungsrechtOrt: { adresse: 'x', lage: null, wert: 'Innenbereich' } });
    const konflikte: string[] = [];
    pruefungSetzen(datei, 'A', { ...leerePruefung(), planungsrechtOrt: { adresse: 'y', lage: null, wert: 'Außenbereich' } }, basis, { konflikte });
    expect(konflikte).toContain('Ort des Planungsrechts');
  });
});
