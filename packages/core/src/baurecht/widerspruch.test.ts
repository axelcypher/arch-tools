import { describe, expect, it } from 'vitest';
import { angabeVonHand, hinweisBestaetigen } from './angaben';
import { modulFakten } from './auswertung';
import { faktenZurLage } from './geodienste';
import { widersprueche } from './projekt';
import { faktStatus } from './typen';
import type { FaktWert, Modul } from './typen';

/** Gemeindemodul mit einem Wert aus einem Dienst, einer Tabelle darüber und einer Tabelle nach Gemeinde */
const modul = {
  format: 1,
  id: 'nw-x',
  name: 'Stadt X',
  ebene: 'gemeinde',
  version: '2026-11-12',
  normen: {},
  fakten: {
    'x.denkmaldienst': { titel: 'Denkmal-Dienst', gruppe: 'schutz', typ: 'janein' },
    'schutz.denkmalbereich': { titel: 'In einem Denkmalbereich', gruppe: 'schutz', typ: 'janein', nach: { fakt: 'x.denkmaldienst', tabelle: { true: true, false: false } } },
    'x.landschaftsplan': { titel: 'Landschaftsplan', gruppe: 'schutz', typ: 'wahl', nach: { fakt: 'lage.ags', tabelle: { '05974040': 'kein Landschaftsplan' } } },
  },
} as unknown as Modul;

const ags: FaktWert = { wert: '05974040', herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'ALKIS' };
const treffer: FaktWert = { wert: true, herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'Denkmal-Dienst' };
const vonHand = (wert: FaktWert['wert']): FaktWert => ({ wert, herkunft: 'manuell', sicherheit: 'sicher', bestaetigt: { von: 'TP', am: '2026-11-12', grund: 'Auskunft' } });

describe('Widerspruch aus Diensten – auch über abgeleitete Angaben', () => {
  it('„nicht im Denkmalbereich“ von Hand gegen einen Treffer des Dienstes am Bezug: Widerspruch', () => {
    const f = modulFakten([modul], { 'lage.ags': ags, 'x.denkmaldienst': treffer, 'schutz.denkmalbereich': vonHand(false) });
    expect(f['schutz.denkmalbereich'].wert).toBe(false);
    expect(f['schutz.denkmalbereich'].widerspruch).toMatch(/Denkmal-Dienst ergibt „ja“/);
  });

  it('ein bloßes „kein Treffer“ (Hinweis) widerspricht nicht; gleicher Wert auch nicht', () => {
    const kein: FaktWert = { wert: false, herkunft: 'geodienst', sicherheit: 'hinweis', quelle: 'Denkmal-Dienst' };
    expect(modulFakten([modul], { 'lage.ags': ags, 'x.denkmaldienst': kein, 'schutz.denkmalbereich': vonHand(true) })['schutz.denkmalbereich'].widerspruch).toBeUndefined();
    expect(modulFakten([modul], { 'lage.ags': ags, 'x.denkmaldienst': treffer, 'schutz.denkmalbereich': vonHand(true) })['schutz.denkmalbereich'].widerspruch).toBeUndefined();
  });

  it('Treffer am Bezug, der selbst von Hand überschrieben ist: der gespeicherte Dienst zählt', () => {
    const basis = angabeVonHand(treffer, 'x.denkmaldienst', false, { von: 'TP', grund: 'Auskunft', heute: '2026-11-12' });
    expect(basis.widerspruch).toMatch(/meldet „ja“/);
    const f = modulFakten([modul], { 'lage.ags': ags, 'x.denkmaldienst': basis, 'schutz.denkmalbereich': vonHand(false) });
    expect(f['schutz.denkmalbereich'].widerspruch).toBeTruthy();
  });

  it('Planungsrecht gegen Geodaten: ein Treffer des Dienstes bleibt maßgeblich, auch wenn „nein“ von Hand dagegen steht', () => {
    const lsg = angabeVonHand({ wert: true, herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'LINFOS' }, 'schutz.lsg', false, { von: 'TP', grund: 'Auskunft UNB', heute: '2026-11-12' });
    expect(lsg.dienst?.wert).toBe(true);
    const w = widersprueche({ Planungsrecht: 'Innenbereich' }, null, { 'schutz.lsg': lsg });
    expect(w.merkmale.has('Planungsrecht')).toBe(true);
    expect(widersprueche({ Planungsrecht: 'Innenbereich' }, null, { 'schutz.lsg': { wert: false, herkunft: 'manuell', sicherheit: 'sicher' } }).merkmale.size).toBe(0);
  });
});

describe('Vorschau und Übernahme rechnen gleich', () => {
  it('Bestätigen löscht einen Widerspruch des Dienstes nicht', () => {
    const agsVonHand = angabeVonHand({ wert: '05974036', herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'ALKIS' }, 'lage.ags', '05974040', { von: 'TP', heute: '2026-11-12' });
    expect(agsVonHand.sicherheit).toBe('hinweis');
    expect(agsVonHand.widerspruch).toMatch(/ALKIS meldet „05974036“/);
    const bestaetigt = hinweisBestaetigen(agsVonHand, { von: 'TP', grund: 'Flurstücksnachweis vom 03.11.2026', heute: '2026-11-12' });
    expect(bestaetigt.bestaetigt?.grund).toMatch(/Flurstücksnachweis/);
    expect(bestaetigt.widerspruch).toMatch(/ALKIS/);
  });

  it('ohne Koordinaten bei Lagebezug: keine Bestätigung, bleibt Hinweis', () => {
    const f = hinweisBestaetigen({ wert: false, herkunft: 'geodienst', sicherheit: 'hinweis', quelle: 'LINFOS' }, { von: 'TP', grund: 'Auskunft UNB', lage: null, heute: '2026-11-12' });
    expect(f.bestaetigt).toBeUndefined();
    expect(f.grund).toMatch(/ohne Koordinaten/);
  });
});

describe('Bestätigung eines Tabellenwerts', () => {
  it('bleibt, solange die Tabelle denselben Wert liefert; sonst gilt wieder der Tabellenwert als Hinweis', () => {
    const agsHinweis: FaktWert = { wert: '05974040', herkunft: 'abgeleitet', sicherheit: 'hinweis' };
    const ohne = modulFakten([modul], { 'lage.ags': agsHinweis });
    expect(ohne['x.landschaftsplan']).toMatchObject({ wert: 'kein Landschaftsplan', sicherheit: 'hinweis' });
    const best = { ...ohne['x.landschaftsplan'], bestaetigt: { von: 'TP', am: '2026-11-12', grund: 'Auskunft UNB' } };
    const mit = modulFakten([modul], { 'lage.ags': agsHinweis, 'x.landschaftsplan': best });
    expect(mit['x.landschaftsplan'].bestaetigt?.grund).toBe('Auskunft UNB');
    const anders = modulFakten([modul], { 'lage.ags': agsHinweis, 'x.landschaftsplan': { ...best, wert: 'LP II' } });
    expect(anders['x.landschaftsplan'].bestaetigt).toBeUndefined();
    expect(anders['x.landschaftsplan'].wert).toBe('kein Landschaftsplan');
  });
});

describe('Lagebindung ohne gültige Koordinaten', () => {
  it('ohne Lage werden alle lagegebundenen Angaben Hinweis – auch der Gemeindeschlüssel aus ALKIS und ein bestätigtes „kein Schutzgebiet“', () => {
    const f = faktenZurLage(
      {
        'lage.ags': { wert: '05974040', herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'ALKIS', lage: '438091,5713737' },
        'schutz.lsg': { wert: false, herkunft: 'geodienst', sicherheit: 'hinweis', lage: '438091,5713737', bestaetigt: { von: 'TP', am: '2026-11-12', grund: 'Auskunft UNB', lage: '438091,5713737' } },
        'gebaeude.beheizt': { wert: true, herkunft: 'manuell', sicherheit: 'sicher' },
      },
      null,
    );
    expect(f['lage.ags']).toMatchObject({ sicherheit: 'hinweis' });
    expect(f['lage.ags'].grund).toMatch(/früheren Lage/);
    expect(f['schutz.lsg'].bestaetigt).toBeUndefined();
    expect(f['schutz.lsg'].sicherheit).toBe('hinweis');
    // ohne Lagebezug bleibt eine Angabe von Hand, wie sie ist
    expect(f['gebaeude.beheizt']).toMatchObject({ sicherheit: 'sicher' });
  });
});

describe('ein sicherer Teil entscheidet sicher', () => {
  it('„und = nein“: ein gesichertes Nein trägt, ein unsicheres Nein daneben wertet nicht ab; ohne gesichertes bleibt es unsicher', async () => {
    const { werten } = await import('./kurz');
    const ctx = {
      merkmale: { Planungsrecht: 'Innenbereich' },
      fakten: { 'schutz.landschaftsplan': { wert: false, herkunft: 'modul' as const, sicherheit: 'hinweis' as const } },
      einreichung: '2026-11-12',
      heute: '2026-11-12',
      bausteine: {},
    };
    const regel = { und: [{ m: 'Planungsrecht', in: ['Außenbereich'] }, { f: 'schutz.landschaftsplan', ist: true }] };
    const b = werten(regel, ctx);
    expect(b.w).toBe('nein');
    expect(b.unsicher).toEqual([]);
    // nur das unsichere Nein: bleibt unsicher
    const nur = werten({ und: [{ m: 'Planungsrecht', in: ['Außenbereich', 'Innenbereich'] }, { f: 'schutz.landschaftsplan', ist: true }] }, ctx);
    expect(nur.w).toBe('nein');
    expect(nur.unsicher).toEqual(['schutz.landschaftsplan']);
  });
});

describe('Angaben zur Lage von Hand', () => {
  it('werden an die Lage gebunden (auch ohne Beleg) und verfallen bei anderer bzw. fehlender Lage', () => {
    const f = angabeVonHand(undefined, 'lage.altlasten', false, { von: 'TP', lage: '438091,5713737', heute: '2026-11-12' });
    expect(f).toMatchObject({ wert: false, sicherheit: 'sicher', lage: '438091,5713737' });
    expect(faktenZurLage({ 'lage.altlasten': f }, '438091,5713737')['lage.altlasten'].sicherheit).toBe('sicher');
    expect(faktenZurLage({ 'lage.altlasten': f }, '1,1')['lage.altlasten'].sicherheit).toBe('hinweis');
    expect(faktenZurLage({ 'lage.altlasten': f }, null)['lage.altlasten'].sicherheit).toBe('hinweis');
    // Gemeindeschlüssel mit Beleg: an die Lage gebunden; ohne Koordinaten nur Hinweis
    const ags = angabeVonHand(undefined, 'lage.ags', '05974040', { von: 'TP', grund: 'Flurstücksnachweis', lage: '438091,5713737', heute: '2026-11-12' });
    expect(ags.bestaetigt?.lage).toBe('438091,5713737');
    expect(faktenZurLage({ 'lage.ags': ags }, null)['lage.ags']).toMatchObject({ sicherheit: 'hinweis' });
    expect(angabeVonHand(undefined, 'lage.altlasten', false, { von: 'TP', lage: null, heute: '2026-11-12' }).sicherheit).toBe('hinweis');
  });
});

describe('Begründung nennt den tragenden, sicheren Teil', () => {
  it('bei „und = nein“ mit sicherem und unsicherem Nein: der sichere wird genannt', async () => {
    const { tragendeBlaetter } = await import('./kurz');
    const ctx = {
      merkmale: { Planungsrecht: 'Innenbereich' },
      fakten: { 'schutz.lsg': { wert: false, herkunft: 'geodienst' as const, sicherheit: 'hinweis' as const } },
      einreichung: '2026-11-12',
      heute: '2026-11-12',
      bausteine: {},
    };
    const regel = { und: [{ f: 'schutz.lsg', ist: true }, { m: 'Planungsrecht', in: ['Außenbereich'] }] };
    expect(tragendeBlaetter(regel, ctx, 'nein')).toEqual([{ m: 'Planungsrecht', in: ['Außenbereich'] }]);
  });
});

describe('Plausibilität: neues Wohngebäude als „verfahrensfrei“ (§ 62 Abs. 1, § 63 BauO NRW)', () => {
  const efh = { Gebäudeart: 'Einfamilienhaus', Verfahren: 'verfahrensfrei', Vorhaben: 'Errichtung' };
  const umfang = (wert: string): Record<string, FaktWert> => ({ 'vorhaben.beseitigung_umfang': { wert, herkunft: 'manuell', sicherheit: 'sicher' } });

  it('Errichtung eines Wohngebäudes: Widerspruch am Merkmal „Verfahren“; der Satz richtet sich nach dem Planungsrecht', () => {
    const satz = (pr?: string) => {
      const w = widersprueche(pr ? { ...efh, Planungsrecht: pr } : efh, null);
      expect([...w.merkmale]).toEqual(['Verfahren']);
      expect(w.zu).toEqual(['Verfahren']);
      return w.texte[0];
    };
    const anfang = 'Verfahren „verfahrensfrei“ festgelegt, ein neues Wohngebäude (Einfamilienhaus) ist aber nicht verfahrensfrei (§ 62 Abs. 1 BauO NRW) – ';
    // Freistellung nur im qualifizierten bzw. vorhabenbezogenen Bebauungsplan (§ 63 Abs. 2 Nr. 1), sonst § 64
    expect(satz('Bebauungsplan')).toBe(`${anfang}mindestens Genehmigungsfreistellung (§ 63), bitte klären`);
    for (const pr of ['Innenbereich', 'Außenbereich', 'einfacher Bebauungsplan', 'Satzung nach BauGB']) expect(satz(pr)).toBe(`${anfang}mindestens vereinfachtes Baugenehmigungsverfahren (§ 64), bitte klären`);
    expect(satz()).toBe(`${anfang}Genehmigungsfreistellung (§ 63) nur im Bebauungsplan, sonst mindestens vereinfachtes Baugenehmigungsverfahren (§ 64), bitte klären`);
    for (const art of ['Zweifamilienhaus', 'Mehrfamilienhaus', 'Wohn- und Geschäftshaus']) expect(widersprueche({ ...efh, Gebäudeart: art }, null).merkmale.has('Verfahren')).toBe(true);
  });

  it('Ersatzbau (Beseitigung mit Umfang „Abbruch mit Ersatzbau“): ebenso – nicht aber Abbruch ohne Ersatzbau', () => {
    const b = { ...efh, Vorhaben: 'Beseitigung' };
    expect(widersprueche(b, null, umfang('Abbruch mit Ersatzbau')).texte[0]).toMatch(/^Verfahren „verfahrensfrei“ festgelegt, ein Ersatzbau für ein Wohngebäude \(Einfamilienhaus\)/);
    // auch, wenn der Umfang nur Hinweis ist (z. B. aus einer älteren Angabe) – eine Warnung, zur sicheren Seite
    const nurHinweis: Record<string, FaktWert> = { 'vorhaben.beseitigung_umfang': { wert: 'Abbruch mit Ersatzbau', herkunft: 'abgeleitet', sicherheit: 'hinweis' } };
    expect(widersprueche(b, null, nurHinweis).merkmale.has('Verfahren')).toBe(true);
    expect(widersprueche(b, null, umfang('vollständiger Abbruch ohne Ersatzbau')).merkmale.size).toBe(0);
    expect(widersprueche(b, null).merkmale.size).toBe(0);
  });

  it('kein Hinweis: anderes Verfahren, Nichtwohngebäude, kein Gebäude, Änderung, Erweiterung (§ 62 Abs. 1 Nr. 1 g, i), Nutzungsänderung, Gebäudeart offen', () => {
    for (const m of [
      { ...efh, Verfahren: 'Genehmigungsfreistellung' },
      { ...efh, Gebäudeart: 'Nichtwohngebäude' },
      { ...efh, Gebäudeart: 'kein Gebäude' },
      { ...efh, Vorhaben: 'Änderung' },
      { ...efh, Vorhaben: 'Erweiterung' },
      { ...efh, Vorhaben: 'Nutzungsänderung' },
      { Verfahren: 'verfahrensfrei', Vorhaben: 'Errichtung' },
    ])
      expect(widersprueche(m, null).merkmale.size, JSON.stringify(m)).toBe(0);
  });
});

describe('Widersprüche: Merkmal je Satz; Status einer über einen Hinweis gestellten Antwort', () => {
  it('je Satz das Merkmal, um das es geht (gleiche Reihenfolge)', () => {
    const lsg: FaktWert = { wert: true, herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'LINFOS' };
    const w = widersprueche({ Planungsrecht: 'Innenbereich', Gebäudeart: 'Einfamilienhaus', Verfahren: 'verfahrensfrei', Vorhaben: 'Errichtung' }, null, { 'schutz.lsg': lsg });
    expect(w.zu).toEqual(['Planungsrecht', 'Verfahren']);
    expect(w.texte).toHaveLength(2);
    expect(w.texte[0]).toMatch(/^Planungsrecht/);
    expect(w.texte[1]).toMatch(/^Verfahren/);
  });

  it('faktStatus: über einen Hinweis bzw. Widerspruch gestellt → so gesichert wie der Auslöser', () => {
    const s: FaktWert = { wert: true, herkunft: 'manuell', sicherheit: 'sicher' };
    expect(faktStatus(s)).toBe('sicher');
    expect(faktStatus({ ...s, ueberHinweis: ['vorhaben.beseitigung_umfang'] })).toBe('hinweis');
    expect(faktStatus({ ...s, ueberWiderspruch: ['vorhaben.beseitigung_umfang'] })).toBe('widerspruch');
    expect(faktStatus({ ...s, ueberHinweis: ['a'], ueberWiderspruch: ['a'] })).toBe('widerspruch');
    expect(faktStatus({ ...s, ueberHinweis: [] })).toBe('sicher');
  });
});
