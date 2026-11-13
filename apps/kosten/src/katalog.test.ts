import { describe, expect, it } from 'vitest';
import { eintragAusPosition, gliederung, gliederungFuer, katalogCsv, katalogJson, leseKatalog, positionAusEintrag } from './katalog';
import { positionen } from './testdaten';

const CSV = [
  '# Name: Bürokennwerte',
  '# Quelle: eigene Projekte',
  '# Stand: 1. Quartal 2026',
  '# Index: 131,4',
  'KG;Bezeichnung;Bezug;Grundlage;von;Mittel;bis;Bemerkung',
  '300;Bauwerk – Baukonstruktionen;BGF;;1.500,00;1.800,50;2.100;',
  '330;Außenwände;m² AWF;;;420;;"WDVS; verputzt"',
  '461;Aufzug;Stk;;;45.000;;',
  '540;Carport;psch;;;30000;;',
  '700;Baunebenkosten;%;300+400;18;20;22;',
  '730;Honorare;;;;15;;',
  'abc;keine Kostengruppe;BGF;;;1;;',
].join('\r\n');

describe('Kennwertkatalog', () => {
  it('liest CSV aus Excel: Kopfzeilen, Dezimalkomma, Tausenderpunkt, Bezüge', () => {
    const k = leseKatalog(`﻿${CSV}`, 'Kennwerte.csv');
    expect(k).toMatchObject({ name: 'Bürokennwerte', quelle: 'eigene Projekte', stand: '1. Quartal 2026', index: 131.4 });
    expect(k.eintraege.map((e) => e.kg)).toEqual(['300', '330', '461', '540', '700', '730']);
    expect(k.eintraege[0]).toMatchObject({ bezug: 'bgf', von: 1500, mittel: 1800.5, bis: 2100 });
    expect(k.eintraege[1]).toMatchObject({ bezug: 'awf', mittel: 420, bemerkung: 'WDVS; verputzt' });
    expect(k.eintraege[1].von).toBeUndefined();
    expect(k.eintraege[2]).toMatchObject({ bezug: 'menge', einheit: 'Stk', mittel: 45000 });
    expect(k.eintraege[3]).toMatchObject({ bezug: 'pauschal', mittel: 30000 });
    expect(k.eintraege[4]).toMatchObject({ bezug: 'prozent', basis: ['300', '400'], von: 18, bis: 22 });
    // ohne Bezug: übliche Bezugsgröße der Kostengruppe
    expect(k.eintraege[5]).toMatchObject({ bezug: 'prozent', basis: ['300', '400'], mittel: 15 });
  });

  it('CSV und JSON schreiben und wieder lesen', () => {
    const k = leseKatalog(CSV, 'Kennwerte.csv');
    expect(leseKatalog(katalogCsv(k), 'x.csv')).toEqual(k);
    expect(leseKatalog(katalogJson(k), 'x.json')).toEqual(k);
  });

  it('JSON als reine Liste; ohne Einträge eine verständliche Meldung', () => {
    const k = leseKatalog('[{"kg":"420","bezeichnung":"Wärmeversorgung","mittel":95}]', 'liste.json');
    expect(k.name).toBe('Kennwertkatalog');
    expect(k.eintraege).toEqual([{ kg: '420', bezeichnung: 'Wärmeversorgung', bezug: 'bgf', mittel: 95 }]);
    expect(() => leseKatalog('nur Text', 'leer.csv')).toThrow(/Keine Einträge/);
  });

  it('kaputtes oder falsches JSON ergibt eine deutsche Meldung', () => {
    expect(() => leseKatalog('{', 'kaputt.json')).toThrow(/kein gültiger Kennwertkatalog \(JSON\)/);
    expect(() => leseKatalog('null', 'leer.json')).toThrow(/kein gültiger Kennwertkatalog \(JSON\) – erwartet wird/);
    expect(() => leseKatalog('42', 'zahl.json')).toThrow(/kein gültiger Kennwertkatalog/);
    // Gegenprobe: gültiges JSON
    expect(leseKatalog('{"name":"K","eintraege":[{"kg":"300","mittel":1800}]}', 'k.json').eintraege).toHaveLength(1);
  });

  it('CSV mit Komma als Trennzeichen: Punkt als Dezimalzeichen', () => {
    const k = leseKatalog(['# Index: 131.4', 'KG,Bezeichnung,Bezug,Grundlage,von,Mittel,bis', '300,Bauwerk,BGF,,1500.5,"1,800.25",2100', '420,Wärme,BGF,,,95.5,'].join('\n'), 'komma.csv');
    expect(k.index).toBe(131.4);
    expect(k.eintraege[0]).toMatchObject({ kg: '300', von: 1500.5, mittel: 1800.25, bis: 2100 });
    expect(k.eintraege[1].mittel).toBe(95.5);
    // Gegenprobe: mit Semikolon gilt weiter die deutsche Schreibweise (1.500 = eintausendfünfhundert)
    expect(leseKatalog('KG;Bezeichnung;Bezug;Grundlage;von;Mittel;bis\n300;Bauwerk;BGF;;1.500;1.800,25;2.100', 's.csv').eintraege[0]).toMatchObject({ von: 1500, mittel: 1800.25, bis: 2100 });
  });

  it('CSV mit Komma als Trennzeichen: Dezimalkomma in Anführungszeichen bleibt richtig (je Zelle erkannt)', () => {
    const k = leseKatalog(['KG,Bezeichnung,Bezug,Grundlage,von,Mittel,bis', '300,Bauwerk,BGF,,"1800,5","1.800,50","1,800.50"', '700,Nebenkosten,%,300+400,,"12,5",1800.5'].join('\n'), 'lo.csv');
    expect(k.eintraege[0]).toMatchObject({ von: 1800.5, mittel: 1800.5, bis: 1800.5 });
    expect(k.eintraege[1]).toMatchObject({ mittel: 12.5, bis: 1800.5 });
    // Dreiergruppen allein: in der Komma-CSV Tausender, in der Semikolon-CSV ebenfalls (Punkt)
    expect(leseKatalog('KG,Bezeichnung,Bezug,Grundlage,von,Mittel,bis\n300,B,BGF,,"1,800",,', 'k.csv').eintraege[0].von).toBe(1800);
    expect(leseKatalog('KG;Bezeichnung;Bezug;Grundlage;von;Mittel;bis\n300;B;BGF;;1,800;1.23;', 's.csv').eintraege[0]).toMatchObject({ von: 1.8, mittel: 1.23 });
  });

  it('Kostenrisiken lassen sich aus dem Katalog übernehmen', () => {
    const k = leseKatalog('KG;Bezeichnung;Bezug;Grundlage;von;Mittel;bis\nrisiko;Kostenrisiken;%;300+400;5;10;15', 'r.csv');
    expect(k.eintraege[0]).toMatchObject({ kg: 'risiko', bezug: 'prozent', basis: ['300', '400'], mittel: 10 });
  });

  it('Einträge werden Positionen mit Quelle – und umgekehrt', () => {
    const k = leseKatalog(CSV, 'Kennwerte.csv');
    const p = positionAusEintrag(k.eintraege[4], k);
    expect(p).toMatchObject({ kg: '700', bezug: 'prozent', basis: ['300', '400'], von: 18, mittel: 20, bis: 22, quelle: 'Bürokennwerte, 1. Quartal 2026' });
    expect(positionAusEintrag(k.eintraege[2], k)).toMatchObject({ bezug: 'menge', einheit: 'Stk' });
    expect(positionen().map(eintragAusPosition)[0]).toEqual({ kg: '300', bezeichnung: 'Bauwerk – Baukonstruktionen', bezug: 'bgf', von: 1500, mittel: 1800, bis: 2100 });
  });

  it('Gliederung je Stufe: 1. Ebene für den Kostenrahmen, 2. Ebene ab der Kostenschätzung (DIN 276:2018-12)', () => {
    expect(gliederungFuer('rahmen')).toBe('grob');
    expect(gliederungFuer('schaetzung')).toBe('fein');
    expect(gliederungFuer('berechnung')).toBe('fein');
    expect(gliederung('grob').map((p) => `${p.kg}:${p.bezug}`)).toEqual(['300:bgf', '400:bgf', '500:auf', '700:prozent']);
    const fein = gliederung('fein');
    expect(fein.find((p) => p.kg === '330')?.bezug).toBe('awf');
    expect(fein.find((p) => p.kg === '360')?.bezug).toBe('daf');
    expect(fein.filter((p) => p.kg === '460' || p.kg === '480').map((p) => p.bezug)).toEqual(['bgf', 'bgf']);
    expect(fein.every((p) => p.mittel === undefined)).toBe(true);
  });
});
