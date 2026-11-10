import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readProjectFile, writeArchive } from '@core/archive';
import { addDatei, createProject } from '@core/model';
import type { Angabe } from './projektdaten';
import { parseProjectData } from '@core/serialize';
import { projektdateiAendern, projektdateiPfad } from '@core/projektdatei';
import { angabenAus, flaecheZahl, metaMit, oapLesen } from './oap';

// 1×1-PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function projektdatei() {
  let p = createProject('EFH Musterweg');
  p.meta = {
    projektcode: 'BS9',
    vorhaben: 'Neubau eines Einfamilienhauses',
    adresse: { strasse: 'Musterweg 3', plz: '59494', ort: 'Soest' },
    grundstueck: { gemarkung: 'Soest', flur: '12', flurstueck: '345', flaeche: 523.4 },
    bauherr: { name: 'Mustermann', vorname: 'Max', adresse: { strasse: 'Am Hang 1', plz: '59494', ort: 'Soest' }, kontakte: [{ art: 'email', wert: 'max@example.org' }] },
    bearbeiter: 'TP',
  };
  // ein Plan aus einer mitgespeicherten PDF: beides muss beim Ändern der Stammdaten unverändert bleiben
  const pdf = addDatei(p, 'Lageplan.pdf', 'pdf', new Uint8Array([37, 80, 68, 70, 9, 8, 7]));
  p = pdf.project;
  p.storeys[0].background = {
    type: 'raster',
    name: 'Lageplan.pdf',
    quelle: pdf.id,
    dataUrl: `data:image/png;base64,${PNG}`,
    widthPx: 1,
    heightPx: 1,
    metersPerPixel: 0.01,
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
  };
  return writeArchive(p, { app: 'Flächenrechner', date: new Date(Date.UTC(2026, 0, 1)) });
}

describe('Projektdatei (.oap) als Quelle der Stammdaten', () => {
  it('liest die Angaben wie die Projektkarte sie führt', () => {
    const { meta } = oapLesen(projektdatei());
    const a = angabenAus(meta);
    expect(Object.fromEntries(a)).toMatchObject({
      vorhaben: 'Neubau eines Einfamilienhauses',
      aktenzeichen: '',
      'grundstueck.strasse': 'Musterweg 3',
      'grundstueck.ort': 'Soest',
      gemarkung: 'Soest',
      flur: '12',
      flurstueck: '345',
      grundstuecksflaeche: '523,4',
      'bauherr.name': 'Mustermann',
      'bauherr.vorname': 'Max',
      'bauherr.email': 'max@example.org',
      'bauherr.telefon': '',
    });
  });

  it('ändert nur die übergebenen Angaben – Kontakte, Fläche und PLZ/Ort werden richtig zerlegt', () => {
    const { meta } = oapLesen(projektdatei());
    const neu = metaMit(
      meta,
      new Map<Angabe, string>([
        ['aktenzeichen', '63/123/26'],
        ['grundstueck.ort', '59457 Werl'],
        ['grundstuecksflaeche', '1.234,50 m²'],
        ['bauherr.telefon', '02921 12345'],
        ['bauherr.email', ''],
        ['bauherr.vorname', ''],
      ]),
    );
    expect(neu).toMatchObject({ aktenzeichen: '63/123/26', adresse: { strasse: 'Musterweg 3', plz: '59457', ort: 'Werl' }, grundstueck: { flaeche: 1234.5, flur: '12' }, bearbeiter: 'TP' });
    expect(neu.bauherr.kontakte).toEqual([{ art: 'telefon', wert: '02921 12345' }]);
    expect('vorname' in neu.bauherr).toBe(false);
    // das Original bleibt unberührt
    expect(meta.bauherr.vorname).toBe('Max');
  });

  it('schreibt nur meta in projekt.json; alle anderen Einträge des Archivs bleiben gleich', () => {
    const vorher = projektdatei();
    const { meta } = oapLesen(vorher);
    const nachher = projektdateiAendern(vorher, (roh) => ({ ...roh, meta: metaMit(parseProjectData(roh).meta, new Map<Angabe, string>([['bauherr.name', 'Musterfrau']])) }))!;
    expect(meta.bauherr.name).toBe('Mustermann');
    const [a, b] = [unzipSync(vorher), unzipSync(nachher)];
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    expect(Object.keys(a).some((k) => k.startsWith('plaene/')) && Object.keys(a).some((k) => k.startsWith('quellen/'))).toBe(true);
    for (const k of Object.keys(a)) if (k !== 'projekt.json') expect([...b[k]]).toEqual([...a[k]]);
    const pa = JSON.parse(strFromU8(a['projekt.json']));
    const pb = JSON.parse(strFromU8(b['projekt.json']));
    expect({ ...pb, meta: undefined }).toEqual({ ...pa, meta: undefined });
    const p = readProjectFile(nachher);
    expect(p.meta.bauherr.name).toBe('Musterfrau');
    expect(p.dateien?.[0].daten).toEqual(new Uint8Array([37, 80, 68, 70, 9, 8, 7]));
  });

  it('der bisherige Ort neuer Projektdateien gilt auch mit den gemeinsamen Platzhaltern', () => {
    expect(projektdateiPfad('Planung\\Berechnungen\\{Kürzel}.oap', { nummer: 'BS9' })).toBe('Planung/Berechnungen/BS9.oap');
    expect(projektdateiPfad('Planung/Berechnungen/{nummer} {kurzname}', { nummer: 'BS9', kurzname: 'Musterstraße 9' })).toBe('Planung/Berechnungen/BS9 Musterstraße 9.oap');
  });

  it('Flächen als Text', () => {
    expect(flaecheZahl('523,40')).toBe(523.4);
    expect(flaecheZahl('1.234 m²')).toBe(1234);
    expect(flaecheZahl('650')).toBe(650);
    expect(flaecheZahl('ca. viel')).toBeUndefined();
    expect(flaecheZahl('')).toBeUndefined();
  });
});
