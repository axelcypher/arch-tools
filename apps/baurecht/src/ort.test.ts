import { beforeEach, describe, expect, it } from 'vitest';
import { readProjectFile } from '@core/archive';
import { baurechtAusRoh, leerePruefung, pruefungSetzen } from '@core/baurecht/projekt';
import type { FaktWert, NormErgebnis, ParagrafErgebnis } from '@core/baurecht/typen';
import { projektdateiRoh } from '@core/projektdatei';
import { beispielOap } from './beispiel.test';
import { kuerzen, merkmalUnterzeile, ohneKlammer, wieAngezeigt } from './components/Angaben';
import { textPasst } from './suche';
import { suchTreffer } from './components/Vorschriften';
import { aenderungenAnwenden } from './projekt';
import { alleFakten, auswertungMit, OHNE_LAGEBEZUG, planungsrechtVerschoben, pruefstandBerechnen } from './pruefung';
import { offeneBestaetigungen, PLANUNGSRECHT, useBaurecht } from './store';

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
    expect(stand().ueberholt).toMatch(/Anschrift bzw. Grundstück geändert/);
    expect(stand().ampel).not.toBe('gruen');
  });

  it('Planungsrecht zu einem früheren Ort: Hinweis, zählt als nicht gesichert, „Gilt hier“ bestätigt es', () => {
    const st = useBaurecht.getState();
    // aus Formulare bzw. der Datei, nie in Baurecht bestätigt: nicht gesichert, mit eigenem Grund (kein Widerspruch)
    const s0 = useBaurecht.getState();
    expect(planungsrechtVerschoben(s0.project, s0.merkmale, s0.pruefung.planungsrechtOrt)).toMatch(/noch nicht bestätigt/);
    const p0 = pruefstandBerechnen(s0.paket, s0.project, s0.merkmale, s0.pruefung.fakten, {}, '2026-12-01', {}, s0.pruefung.planungsrechtOrt);
    expect(p0.planungsrechtHinweis).toMatch(/^Planungsrecht „.+“ für .+ noch nicht bestätigt$/);
    expect(p0.auswertung.paragrafen.some((x) => x.gruende.some((g) => g.includes('Nicht gesichert: Planungsrecht')))).toBe(true);
    expect(p0.auswertung.paragrafen.some((x) => x.gruende.some((g) => /Widerspruch: Planungsrecht/.test(g)))).toBe(false);
    st.merkmalSetzen('Planungsrecht', 'Innenbereich');
    expect(useBaurecht.getState().pruefung.planungsrechtOrt).toMatchObject({ wert: 'Innenbereich' });
    const s1 = useBaurecht.getState();
    expect(planungsrechtVerschoben(s1.project, s1.merkmale, s1.pruefung.planungsrechtOrt)).toBeUndefined();
    umziehen('Andere Straße 9');
    const s2 = useBaurecht.getState();
    expect(planungsrechtVerschoben(s2.project, s2.merkmale, s2.pruefung.planungsrechtOrt)).toMatch(/war für .+ bestätigt – für .+ noch nicht/);
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
    // unbekannter §, aber genannte Norm: die Norm
    expect(treffer('§ 1 BauNVO')).toEqual(['BauNVO 10', 'BauNVO 11']);
    expect(treffer('§ 99')).toEqual([]);
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

describe('Design Runde 9: Suche und Unterzeilen', () => {
  it('Synonyme und Kürzel in beiden Suchen', () => {
    expect(textPasst('Beseitigung von Anlagen', 'Abriss')).toBe(true);
    expect(textPasst('Rückbau', 'Rückbau')).toBe(true);
    expect(textPasst('Stellplätze nicht herstellbar (Schwierigkeiten)', 'GK')).toBe(false);
    expect(textPasst('Gebäudeklasse', 'GK')).toBe(true);
  });
  it('„§ 34 I BauGB“ und „§ 6 Abs. 8 BauO NRW“ finden genau den Paragrafen', () => {
    const para = (paragraf: string, titel: string, gruende: string[] = []) => ({ paragraf, titel, gruende }) as ParagrafErgebnis;
    const norm = (kurz: string, titel: string, paragrafen: ParagrafErgebnis[]) => ({ def: { kurz, titel }, paragrafen }) as unknown as NormErgebnis;
    const normen = [norm('BauGB', 'Baugesetzbuch', [para('34', 'Innenbereich'), para('35', 'Außenbereich', ['wie § 34 Abs. 1'])]), norm('BauO NRW', 'Landesbauordnung', [para('6', 'Abstandsflächen'), para('74', 'Baugenehmigung', ['§ 6 Abs. 8'])])];
    const treffer = (q: string) => normen.flatMap((n) => n.paragrafen.filter((p) => suchTreffer(q, normen)(p, n)).map((p) => `${n.def.kurz} ${p.paragraf}`));
    expect(treffer('§34 I BauGB')).toEqual(['BauGB 34']);
    expect(treffer('§ 34 Abs. 1 BauGB')).toEqual(['BauGB 34']);
    expect(treffer('§ 6 Abs. 8 BauO NRW')).toEqual(['BauO NRW 6']);
  });
  it('Unterzeilen, die nur eine Klammer sind, ohne Klammer; Wortgrenze beachtet', () => {
    expect(merkmalUnterzeile('Gebäudeklasse', 'Gebäudeklasse (§ 2 Abs. 3 BauO NRW)')).toBe('§ 2 Abs. 3 BauO NRW');
    expect(merkmalUnterzeile('Planungsrecht', 'Planungsrechtliche Lage (§§ 30, 34, 35 BauGB)')).toBe('Planungsrechtliche Lage (§§ 30, 34, 35 BauGB)');
    expect(ohneKlammer('(a (b) c)')).toBe('(a (b) c)');
  });
});

describe('Paragrafensuche, Runde 11: Satzzeichen, mehrere Nummern, Nr. mit Buchstabe', () => {
  const para = (paragraf: string, titel: string) => ({ paragraf, titel, gruende: [] }) as unknown as ParagrafErgebnis;
  const norm = (kurz: string, titel: string, paragrafen: ParagrafErgebnis[]) => ({ def: { kurz, titel }, paragrafen }) as unknown as NormErgebnis;
  const normen = [norm('BauGB', 'Baugesetzbuch', [para('30', 'B-Plan'), para('34', 'Innenbereich'), para('35', 'Außenbereich')]), norm('BauO NRW', 'Landesbauordnung', [para('62', 'Verfahrensfrei')])];
  const treffer = (q: string) => normen.flatMap((n) => n.paragrafen.filter((p) => suchTreffer(q, normen)(p, n)).map((p) => `${n.def.kurz} ${p.paragraf}`));
  it('übliche Schreibweisen', () => {
    expect(treffer('§ 34 BauGB.')).toEqual(['BauGB 34']);
    expect(treffer('§ 34, BauGB')).toEqual(['BauGB 34']);
    expect(treffer('§§ 30, 34 BauGB')).toEqual(['BauGB 30', 'BauGB 34']);
    expect(treffer('§ 62 Abs. 1 Satz 1 Nr. 1 a BauO NRW')).toEqual(['BauO NRW 62']);
  });
});

describe('Runde 11: ältere Angaben', () => {
  beforeEach(() => {
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  });
  it('„vollständiger Abbruch: ja“ wird Vorschlag für den Umfang; Zahlen als Text werden gelesen oder sind Hinweis', () => {
    const s = useBaurecht.getState();
    const m = (wert: FaktWert['wert']): FaktWert => ({ wert, herkunft: 'manuell', sicherheit: 'sicher' });
    const f = alleFakten(s.project, { 'vorhaben.beseitigung_vollstaendig': m(true), 'gebaeude.hoehe': m('7,5'), 'gebaeude.bgf': m('viel') }, s.paket.module);
    expect(f['vorhaben.beseitigung_umfang']).toMatchObject({ wert: 'vollständiger Abbruch ohne Ersatzbau', sicherheit: 'hinweis' });
    expect(f['gebaeude.hoehe']).toMatchObject({ wert: 7.5, sicherheit: 'sicher' });
    expect(f['gebaeude.bgf']).toMatchObject({ sicherheit: 'hinweis', grund: expect.stringMatching(/keine Zahl/) });
    // bestätigt: gilt als gesichert
    const best = alleFakten(s.project, { 'vorhaben.beseitigung_vollstaendig': m(true), 'vorhaben.beseitigung_umfang': { wert: 'vollständiger Abbruch ohne Ersatzbau', herkunft: 'abgeleitet', sicherheit: 'hinweis', bestaetigt: { von: 'TP', am: '2026-11-12', grund: 'Abbruchantrag geprüft' } } }, s.paket.module);
    expect(best['vorhaben.beseitigung_umfang'].bestaetigt).toBeDefined();
  });
});

describe('Suche, Runde 12', () => {
  const para = (paragraf: string, titel: string) => ({ paragraf, titel, gruende: [] }) as unknown as ParagrafErgebnis;
  const norm = (kurz: string, titel: string, paragrafen: ParagrafErgebnis[]) => ({ def: { kurz, titel }, paragrafen }) as unknown as NormErgebnis;
  const normen = [norm('BauGB', 'Baugesetzbuch', [para('30', 'B-Plan'), para('33', 'Planreife'), para('34', 'Innenbereich'), para('35', 'Außenbereich')]), norm('BauO NRW', 'Landesbauordnung', [para('6', 'Abstandsflächen'), para('62', 'Verfahrensfrei')])];
  const treffer = (q: string) => normen.flatMap((n) => n.paragrafen.filter((p) => suchTreffer(q, normen)(p, n)).map((p) => `${n.def.kurz} ${p.paragraf}`));
  it('Buchstaben, Bereiche, Satzzeichen im Volltext, Hinweis beim Rückfall auf die Norm', () => {
    expect(treffer('§ 62 Abs. 1 Satz 1 Nr. 1 Buchst. a BauO NRW')).toEqual(['BauO NRW 62']);
    expect(treffer('§§ 30 bis 34 BauGB')).toEqual(['BauGB 30', 'BauGB 33', 'BauGB 34']);
    expect(treffer('Abstandsflächen.')).toEqual(['BauO NRW 6']);
    expect(suchTreffer('§ 999 BauGB', normen).hinweis).toMatch(/§ 999 BauGB ist nicht erfasst – gezeigt: BauGB/);
  });
});


describe('Runde 12: Planungsrecht beim Speichern, Suche', () => {
  beforeEach(() => {
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  });
  it('die Bestätigung des Planungsrechts steht beim Speichern zur Bestätigung an, mit Name und Datum; „ohne“ setzt sie zurück', () => {
    useBaurecht.getState().planungsrechtBestaetigen();
    const s = useBaurecht.getState();
    expect(s.pruefung.planungsrechtOrt).toMatchObject({ von: expect.any(String), am: expect.stringMatching(/^\d{4}-/) });
    expect(offeneBestaetigungen(s)).toContain(PLANUNGSRECHT);
    useBaurecht.getState().aufDateistand([], [PLANUNGSRECHT]);
    expect(useBaurecht.getState().pruefung.planungsrechtOrt).toBeUndefined();
  });
  it('„Nr. 1a“, „Abs. 3a“, „§§ 30 ff.“, „LP I“', () => {
    const para = (paragraf: string, titel: string) => ({ paragraf, titel, gruende: [] }) as unknown as ParagrafErgebnis;
    const norm = (kurz: string, titel: string, paragrafen: ParagrafErgebnis[]) => ({ def: { kurz, titel }, paragrafen }) as unknown as NormErgebnis;
    const normen = [norm('BauGB', 'Baugesetzbuch', [para('29', 'Vorhaben'), para('30', 'B-Plan'), para('34', 'Innenbereich')]), norm('BauO NRW', 'Landesbauordnung', [para('62', 'Verfahrensfrei')]), norm('LP I', 'Landschaftsplan I', [para('C.1', 'NSG')]), norm('LP II', 'Landschaftsplan II', [para('C.1', 'NSG')])];
    const treffer = (q: string) => normen.flatMap((n) => n.paragrafen.filter((p) => suchTreffer(q, normen)(p, n)).map((p) => `${n.def.kurz} ${p.paragraf}`));
    expect(treffer('§ 62 Abs. 1 Satz 1 Nr. 1a BauO NRW')).toEqual(['BauO NRW 62']);
    expect(treffer('§ 34 Abs. 3a BauGB')).toEqual(['BauGB 34']);
    expect(treffer('§§ 30 ff. BauGB')).toEqual(['BauGB 30', 'BauGB 34']);
    expect(treffer('LP I')).toEqual(['LP I C.1']);
    expect(textPasst('Einfamilienhaus', 'EFH')).toBe(true);
  });
});

describe('Runde 13: Gebäudeklasse nur aus gültigen Angaben', () => {
  beforeEach(() => {
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  });
  it('„nein“ als Text ist kein false: die Ableitung wie ohne Angabe', () => {
    const s = useBaurecht.getState();
    const m = (wert: FaktWert['wert']): FaktWert => ({ wert, herkunft: 'manuell', sicherheit: 'sicher' });
    const ohne = pruefstandBerechnen(s.paket, s.project, s.merkmale, {}, {}, '2026-12-01', {}).gk;
    const text = pruefstandBerechnen(s.paket, s.project, s.merkmale, { 'gebaeude.landwirtschaft': m('nein'), 'gebaeude.freistehend': m('false') }, {}, '2026-12-01', {}).gk;
    expect(text?.klassen).toEqual(ohne?.klassen);
  });
});


describe('Runde 14: Zitatsuche, Kürzen', () => {
  const para = (paragraf: string, titel: string) => ({ paragraf, titel, gruende: [] }) as unknown as ParagrafErgebnis;
  const norm = (kurz: string, titel: string, paragrafen: ParagrafErgebnis[]) => ({ def: { kurz, titel }, paragrafen }) as unknown as NormErgebnis;
  const normen = [norm('BauGB', 'Baugesetzbuch', [para('30', 'B-Plan'), para('33', 'Planreife'), para('34', 'Innenbereich'), para('35', 'Außenbereich')])];
  const treffer = (q: string) => normen.flatMap((n) => n.paragrafen.filter((p) => suchTreffer(q, normen)(p, n)).map((p) => `${n.def.kurz} ${p.paragraf}`));
  it('Bereiche mit Gedanken- und Bindestrich, Mehrzahl im Hinweis, Einfriedung/Einfriedigung', () => {
    const alle = ['BauGB 30', 'BauGB 33', 'BauGB 34', 'BauGB 35'];
    expect(treffer('§§ 30–35 BauGB')).toEqual(alle);
    expect(treffer('§§ 30-35 BauGB')).toEqual(alle);
    expect(treffer('§§ 30 – 35 BauGB')).toEqual(alle);
    expect(suchTreffer('§§ 248, 249 BauGB', normen).hinweis).toBe('§§ 248, 249 BauGB sind nicht erfasst – gezeigt: BauGB');
    expect(suchTreffer('§§ 29 bis 30 BauGB', normen).hinweis).toBe('§ 29 ist nicht erfasst');
    expect(textPasst('Einfriedigungen der Vorgärten', 'Einfriedung')).toBe(true);
    expect(textPasst('Einfriedungen', 'Einfriedigung')).toBe(true);
  });
  it('lange Erläuterungen werden am Satzende gekürzt, nicht nach „z. B.“', () => {
    const t = 'Erster Satz mit Inhalt. Zweiter Satz (z. B. Garage, Dach) mit mehr Inhalt. Dritter Satz, der zu lang ist und abgeschnitten werden muss.';
    expect(kuerzen(t, 90)).toBe('Erster Satz mit Inhalt. Zweiter Satz (z. B. Garage, Dach) mit mehr Inhalt.');
    expect(kuerzen('kurz', 90)).toBe('kurz');
    // zitierte Nummern und Jahre beenden einen Satz, Ordnungszahlen nicht
    expect(kuerzen('Gilt nach § 62 Abs. 1. Danach kommt ein langer zweiter Satz, der nicht mehr hineinpasst.', 40)).toBe('Gilt nach § 62 Abs. 1.');
    expect(kuerzen('Gilt nach Satz 1 Nr. 3. Er betrifft dann etwas ganz anderes und ist sehr lang.', 40)).toBe('Gilt nach Satz 1 Nr. 3.');
    expect(kuerzen('Die Satzung gilt seit 2024. Danach kommt ein langer zweiter Satz ohne Ende.', 40)).toBe('Die Satzung gilt seit 2024.');
    expect(kuerzen('Bekannt gemacht am 3. Juni im Amtsblatt der Stadt und sehr lang danach.', 40)).toBe('Bekannt gemacht am 3. Juni im Amtsblatt');
    expect(kuerzen('ein langer Text ohne Satzende der nur aus Wörtern besteht und weiter geht', 30)).toBe('ein langer Text ohne Satzende');
  });
});

describe('Runde 15: Suche – Volltext mit Bindestrich, Einheiten, „f.“, lange Listen', () => {
  const para = (paragraf: string, titel: string, gruende: string[] = []) => ({ paragraf, titel, gruende }) as unknown as ParagrafErgebnis;
  const norm = (kurz: string, titel: string, paragrafen: ParagrafErgebnis[]) => ({ def: { kurz, titel }, paragrafen }) as unknown as NormErgebnis;
  const normen = [
    norm('GEG', 'Gebäudeenergiegesetz', [para('14', 'Sommerlicher Wärmeschutz', ['Nachweis nach DIN 4108-2, Stand 2013-02']), para('15', 'Gesamtenergiebedarf')]),
    norm('BauGB', 'Baugesetzbuch', [para('30', 'B-Plan'), para('31', 'Ausnahmen'), para('34', 'Innenbereich')]),
    norm('LP I', 'Landschaftsplan I', [para('C.1', 'NSG'), para('C.3', 'LSG')]),
  ];
  const treffer = (q: string) => normen.flatMap((n) => n.paragrafen.filter((p) => suchTreffer(q, normen)(p, n)).map((p) => `${n.def.kurz} ${p.paragraf}`));
  it('Bindestrich im Volltext bleibt Teil des Worts („DIN 4108-2“), im Zitat heißt er „bis“', () => {
    expect(treffer('DIN 4108-2')).toEqual(['GEG 14']);
    expect(treffer('2013-02')).toEqual(['GEG 14']);
    expect(treffer('§§ 30-31 BauGB')).toEqual(['BauGB 30', 'BauGB 31']);
  });
  it('benannte Einheiten („C.3“) und „f.“', () => {
    expect(treffer('C.3')).toEqual(['LP I C.3']);
    expect(treffer('§ 30 f. BauGB')).toEqual(['BauGB 30', 'BauGB 31']);
  });
  it('lange Listen nicht erfasster §§ werden zusammengefasst', () => {
    expect(suchTreffer('§§ 1–35 BauGB', normen).hinweis).toBe('32 der 35 §§ sind nicht erfasst');
    expect(suchTreffer('§§ 200–210 BauGB', normen).hinweis).toBe('alle 11 §§ BauGB sind nicht erfasst – gezeigt: BauGB');
  });
});

describe('Runde 18: gespeicherte Antworten auf nicht gestellte Rückfragen wirken nicht', () => {
  beforeEach(() => {
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  });
  const m = (wert: FaktWert['wert']): FaktWert => ({ wert, herkunft: 'manuell', sicherheit: 'sicher' });
  const ampeln = (f: Record<string, FaktWert>) => new Map(auswertungMit(f).paragrafen.map((p) => [p.id, p.ampel]));
  it('Umfang zurückgesetzt, „Altbau verfahrensfrei: ja“ gespeichert: dieselben Ampeln wie ohne die Antwort', () => {
    useBaurecht.getState().merkmalSetzen('Vorhaben', 'Beseitigung');
    const basis = { ...useBaurecht.getState().pruefung.fakten };
    for (const alt of [true, false]) {
      const mit = ampeln({ ...basis, 'nw.altbau_verfahrensfrei': m(alt) });
      const ohne = ampeln(basis);
      expect([...mit].filter(([id, a]) => ohne.get(id) !== a)).toEqual([]);
    }
  });
  it('Altbau zurückgesetzt, „mitbeantragt“ gespeichert: ohne Wirkung', () => {
    useBaurecht.getState().merkmalSetzen('Vorhaben', 'Beseitigung');
    const basis = { ...useBaurecht.getState().pruefung.fakten, 'vorhaben.beseitigung_umfang': m('Abbruch mit Ersatzbau') };
    for (const mb of [true, false]) {
      const mit = ampeln({ ...basis, 'nw.beseitigung_mit_beantragt': m(mb) });
      const ohne = ampeln(basis);
      expect([...mit].filter(([id, a]) => ohne.get(id) !== a)).toEqual([]);
    }
  });
});

describe('Runde 18: Suche ohne Umlaute', () => {
  it('„Stellpla“ trifft „Stellplätze“, „rueckbau“ nicht nötig – Synonyme mit Umlaut bleiben', () => {
    expect(textPasst('Notwendige Stellplätze', 'Stellpla')).toBe(true);
    expect(textPasst('Notwendige Stellplätze', 'Stellplatze')).toBe(true);
    expect(textPasst('Beseitigung von Anlagen', 'Rückbau')).toBe(true);
  });
});


describe('Runde 19: Suche mit ae/oe/ue', () => {
  it('„Stellplaetze“, „Abstandsflaechen“, „Ruckbau“', () => {
    expect(textPasst('Notwendige Stellplätze', 'Stellplaetze')).toBe(true);
    expect(textPasst('Abstandsflächen', 'Abstandsflaechen')).toBe(true);
    expect(textPasst('Gebäudeklasse 3', 'Gebaeudeklasse')).toBe(true);
    expect(textPasst('Beseitigung von Anlagen', 'Ruckbau')).toBe(true);
    expect(textPasst('Beseitigung von Anlagen', 'Rueckbau')).toBe(true);
  });
});
