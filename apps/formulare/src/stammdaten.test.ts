import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { adressName, adressenAusKarte, inRolle, sucheAdressen, zusammenfuehren } from './adressbuch';
import { xlsxLesen } from './dokumente/xlsx';
import { abschnitte, felderDerSeite } from './forma/felder';
import { parseFormular } from './forma/formular';
import type { Projektkarte } from './forma/projektkarte';
import { abschnittId, ausgefuellt, bereinigt, einheiten, leeresProfil } from './profil';
import { IN_PROJEKTKARTE, projektdatenLesen, zellwert } from './projektdaten';

const adresse = (gruppe: number, werte: Record<number, string>) =>
  Object.entries({ 30: '', 40: '', 70: '', 90: '', 110: '', ...werte }).map(([id, text]) => ({ gruppe, id: Number(id), typ: 1, titel: '', text, zahl: null }));

const karte = (kuerzel: string): Projektkarte => ({
  gruppen: [
    { id: 201, typ: 1, text: 'Bauherr' },
    { id: 202, typ: 1, text: 'Entwurfsverfasser' },
    { id: 231, typ: 1, text: 'Bauaufsichtsbehörde' },
    { id: 301, typ: 16, text: 'Baugrundstücksdaten' },
  ],
  eintraege: [
    ...adresse(201, { 30: 'Max', 40: `Bauherr ${kuerzel}`, 110: 'Welver' }),
    ...adresse(202, { 40: 'Muster Architekten GmbH', 70: 'Hauptstr. 1', 110: 'Soest' }),
    ...adresse(231, { 40: 'Kreis Soest', 70: 'Hoher Weg 1-3', 110: 'Soest' }),
    { gruppe: 301, id: 40, typ: 1, titel: 'Gemarkung:', text: 'Meyerich', zahl: null },
  ],
});

describe('Adressbuch aus allen Projektkarten', () => {
  it('sammelt gefüllte Adressgruppen und führt gleiche Adressen zusammen', () => {
    const alle = zusammenfuehren([...adressenAusKarte('BS5', karte('BS5')), ...adressenAusKarte('H24', { ...karte('H24'), eintraege: karte('H24').eintraege.map((e) => (e.gruppe === 202 && e.id === 70 ? { ...e, text: 'Hauptstr 1' } : e)) })]);
    expect(alle.map(adressName)).toEqual(['Bauherr BS5, Max', 'Bauherr H24, Max', 'Kreis Soest', 'Muster Architekten GmbH']);
    const buero = alle.find((a) => adressName(a) === 'Muster Architekten GmbH')!;
    // „Hauptstr. 1“ und „Hauptstr 1“ sind dieselbe Adresse
    expect(buero.verwendungen.map((v) => `${v.projekt}:${v.rolle}`)).toEqual(['BS5:Entwurfsverfasser', 'H24:Entwurfsverfasser']);
    expect(inRolle(alle, 231).map(adressName)).toEqual(['Kreis Soest']);
    expect(sucheAdressen(alle, 'soest weg').map(adressName)).toEqual(['Kreis Soest']);
    expect(sucheAdressen(alle, 'entwurfsverfasser').map(adressName)).toEqual(['Muster Architekten GmbH']);
  });
});

describe('Projektdaten.xlsx allgemein auslesen', () => {
  async function mappe() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Projektdaten');
    const zeilen: (string | number | null)[][] = [
      ['Projektdaten', null],
      ['Bauvorhaben:', 'Umnutzung DG'],
      ['Grundstück', null],
      ['Straße / Nr.:', 'Buchenstraße 5'],
      ['PLZ / Ort:', '59514 Welver'],
      ['Gemarkung', 'Meyerich', 'Flur', 2, 'Flurstück', '566'],
      ['Bauherr', null],
      ['Name:', 'Gretenkort'],
      ['Straße:', 'Buchenstraße 15'],
      ['PLZ:', null],
      ['Ort:', 'Welver'],
    ];
    zeilen.forEach((z, i) => z.forEach((v, j) => v !== null && (ws.getCell(i + 1, j + 1).value = v)));
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  it('erkennt Beschriftungen mit Wert daneben; Überschriften bestimmen, wozu Straße, PLZ und Ort gehören', async () => {
    const e = projektdatenLesen(xlsxLesen(await mappe()));
    const nach = Object.fromEntries(e.map((x) => [x.angabe, [x.wert, x.zelle]]));
    expect(nach).toEqual({
      vorhaben: ['Umnutzung DG', 'B2'],
      'grundstueck.strasse': ['Buchenstraße 5', 'B4'],
      'grundstueck.plz': ['59514', 'B5'],
      'grundstueck.ort': ['Welver', 'B5'],
      gemarkung: ['Meyerich', 'B6'],
      flur: ['2', 'D6'],
      flurstueck: ['566', 'F6'],
      'bauherr.name': ['Gretenkort', 'B8'],
      'bauherr.strasse': ['Buchenstraße 15', 'B9'],
      // leerer Wert: die Zelle rechts neben der Beschriftung
      'bauherr.plz': ['', 'B10'],
      'bauherr.ort': ['Welver', 'B11'],
    });
    expect(IN_PROJEKTKARTE['bauherr.strasse']).toEqual({ gruppe: 201, id: 70, titel: 'Bauherr: Straße/Nr.' });
    // „PLZ / Ort“ in einer Zelle wird wieder zusammengesetzt
    const ort = e.find((x) => x.angabe === 'grundstueck.ort')!;
    expect(zellwert(e, ort, new Map([['grundstueck.ort', 'Hamm']]))).toBe('59514 Hamm');
  });
});

describe('Formularprofil', () => {
  const muster = parseFormular(new Uint8Array(readFileSync(path.resolve(__dirname, '__fixtures__/muster.frmsjf'))));
  const felder = felderDerSeite(muster.seiten[0], 0);
  const [bauherr] = abschnitte(felder);

  it('zählt Textfelder einzeln, Kästchen einer Zeile als eine Auswahl, ausgenommene Felder nicht', () => {
    const e = einheiten(bauherr, leeresProfil());
    expect(e.filter((x) => x.art === 'text')).toHaveLength(3);
    const wert = (f: (typeof felder)[number]) => f.original;
    expect(e.filter((x) => ausgefuellt(x, wert)).length).toBeGreaterThan(0);
    const ohne = einheiten(bauherr, { abschnitte: {}, zaehlt: { [bauherr.felder[0].schluessel]: false } });
    expect(ohne.flatMap((x) => x.felder)).not.toContain(bauherr.felder[0]);
    expect(abschnittId(bauherr)).toMatch(/^0:Panel/);
  });

  it('speichert nur Abweichungen von der Vorgabe', () => {
    expect(bereinigt({ abschnitte: { a: { sichtbar: true, titel: ' ' }, b: { sichtbar: false } }, zaehlt: { x: true, y: false } })).toEqual({ abschnitte: { b: { sichtbar: false } }, zaehlt: { y: false } });
  });
});
