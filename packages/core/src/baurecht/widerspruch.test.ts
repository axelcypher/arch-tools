import { describe, expect, it } from 'vitest';
import { angabeVonHand, hinweisBestaetigen } from './angaben';
import { modulFakten } from './auswertung';
import { faktenZurLage } from './geodienste';
import { widersprueche } from './projekt';
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
