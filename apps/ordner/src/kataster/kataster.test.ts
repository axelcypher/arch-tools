// @vitest-environment happy-dom
import { strToU8, zipSync } from 'fflate';
import { vorlageQgs, vorlageQgz } from '../__fixtures__/qgisVorlage';
import { describe, expect, it } from 'vitest';
import {
  auftragBauen,
  ausschnitt,
  ergebnisseLesen,
  fehlerAuszug,
  karteVon,
  katasterAus,
  katasterZielpfad,
  planBeschriftung,
  planDateiname,
  planFehler,
  VORGABE_BESCHRIFTUNG,
  VORGABE_KATASTER,
  vorlageLesen,
} from './kataster';

describe('QGIS-Vorlage auslesen', () => {
  it('liest Layouts mit Kartenobjekten und Kartenthemen – aus .qgz und .qgs', () => {
    for (const bytes of [vorlageQgz(), strToU8(vorlageQgs())]) {
      const info = vorlageLesen(bytes);
      expect(info.titel).toBe('Kataster');
      expect(info.themen).toEqual(['Katasterplan', 'Schwarzplan']);
      expect(info.layouts).toEqual([
        { name: 'Katasterauszug A4', karten: [{ id: 'Karte', breite: 190, hoehe: 190 }] },
        { name: 'Katasterauszug A3', karten: [{ id: '', breite: 400, hoehe: 277 }] },
      ]);
      expect(karteVon(info, { layout: 'Katasterauszug A3', karte: '' })).toEqual({ id: '', breite: 400, hoehe: 277 });
    }
  });

  it('meldet Dateien, die kein QGIS-Projekt sind', () => {
    expect(() => vorlageLesen(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/kein QGIS-Projekt/);
    expect(() => vorlageLesen(strToU8('<html/>'))).toThrow(/kein QGIS-Projekt/);
  });

  it('prüft die Pläne gegen die Vorlage', () => {
    const info = vorlageLesen(vorlageQgz());
    const [a4, , schwarz] = VORGABE_KATASTER.plaene;
    expect(VORGABE_KATASTER.plaene.flatMap((p) => planFehler(p, info))).toEqual([]);
    expect(planFehler({ ...a4, layout: 'Gibtsnicht' }, info)).toEqual(['Layout „Gibtsnicht“ gibt es in der Vorlage nicht.']);
    expect(planFehler({ ...a4, karte: 'Übersicht' }, info)).toEqual(['Kartenobjekt „Übersicht“ gibt es im Layout nicht.']);
    expect(planFehler({ ...schwarz, thema: 'Luftbild', breite: undefined }, info)).toEqual([
      'Für DXF bitte Breite und Höhe des Ausschnitts angeben.',
      'Kartenthema „Luftbild“ gibt es in der Vorlage nicht.',
    ]);
    // ohne Vorlage: nur, was sich ohne sie prüfen lässt
    expect(planFehler({ ...a4, layout: '' }, null)).toEqual(['Bitte ein Layout wählen.']);
    expect(ausschnitt({ breite: 190, hoehe: 190 }, 1000)).toEqual({ breite: 190, hoehe: 190 });
    expect(ausschnitt({ breite: 400, hoehe: 277 }, 500)).toEqual({ breite: 200, hoehe: 138.5 });
  });
});

describe('Einstellungen', () => {
  it('ohne Angaben die vier Standardpläne, Ungültiges auf Vorgaben', () => {
    const e = katasterAus(undefined);
    expect(e.plaene.map((p) => `${p.art} ${p.name}`)).toEqual(['pdf Katasterplan A4', 'pdf Katasterplan A3', 'dxf Schwarzplan', 'dxf Katasterplan']);
    expect(e.plaene.find((p) => p.id === 'schwarzplan')).toMatchObject({ thema: 'Schwarzplan', breite: 300, hoehe: 300 });
    const r = katasterAus({ vorlage: ' C:/V.qgz ', ziel: 'antrag', plaene: [{ name: 'X', art: 'dxf', massstab: -5, stil: 'egal', breite: 'viel' }, null] });
    expect(r.vorlage).toBe('C:/V.qgz');
    expect(r.ziel).toBe('antrag');
    expect(r.dateiname).toBe(VORGABE_KATASTER.dateiname);
    expect(r.plaene).toEqual([expect.objectContaining({ id: 'plan1', name: 'X', art: 'dxf', aktiv: true, massstab: 1000, stil: 'symbollayer', breite: undefined })]);
  });
});

describe('Auftrag und Ergebnis', () => {
  it('Dateiname nach Vorlage, ohne unzulässige Zeichen', () => {
    const t = { kuerzel: 'MUS', art: 'BAUA', datum: new Date(2026, 10, 3), kurzname: 'EFH' };
    // alte Namen ({Code}, {Datum}, {Kürzel}) und neue ergeben dasselbe
    expect(planDateiname('{Code} {Art} {Datum} {Name}', { name: 'Katasterplan A4', art: 'pdf' }, t)).toBe('MUS BAUA 261103 Katasterplan A4.pdf');
    expect(planDateiname(VORGABE_KATASTER.dateiname, { name: 'Katasterplan A4', art: 'pdf' }, t)).toBe('MUS BAUA 261103 Katasterplan A4.pdf');
    expect(planDateiname('{PROJEKT_KURZNAME} {DATUM:JJJJ-MM-TT} {Name}', { name: 'Lageplan', art: 'pdf' }, t)).toBe('EFH 2026-11-03 Lageplan.pdf');
    expect(katasterZielpfad('TÖB\\{Antrag}\\Kataster', 'BAUA 2', t)).toBe('TÖB/BAUA 2/Kataster');
    expect(katasterZielpfad('TÖB/{antrag}', undefined, t)).toBeNull();
    expect(katasterZielpfad('Kataster/{PROJEKT_KUERZEL}', undefined, t)).toBe('Kataster/MUS');
    expect(planDateiname('{Kürzel}_{Name}', { name: 'Plan 1:500 / neu', art: 'dxf' }, t)).toBe('MUS_Plan 1 500 neu.dxf');
    expect(planDateiname('', { name: '', art: 'dxf' }, t)).toBe('Plan.dxf');
  });

  it('fester Ablageordner: jeder Ordner gesäubert, leere Teile, „.“ und „..“ verworfen – die Ablage bleibt im Projektordner', () => {
    const t = { kuerzel: 'MUS', art: 'BAUA', datum: new Date(2026, 10, 3), kurzname: 'Umbau: Haus?.' };
    expect(katasterZielpfad('Kataster/{PROJEKT_KURZNAME}', undefined, t)).toBe('Kataster/Umbau Haus');
    expect(katasterZielpfad('../../Fremd', undefined, t)).toBe('Fremd');
    expect(katasterZielpfad('Kataster/./ .. /Pläne//', undefined, t)).toBe('Kataster/Pläne');
    expect(katasterZielpfad('\\\\server\\freigabe', undefined, t)).toBe('server/freigabe');
    expect(katasterZielpfad('..', undefined, t)).toBe('');
    // Gegenprobe: gewöhnliche Ordner unverändert
    expect(katasterZielpfad('TÖB/BAUA 2/Kataster', undefined, t)).toBe('TÖB/BAUA 2/Kataster');
  });

  it('Vorgaben neutral: kein „Auszug“, Beschriftung mit Datum und Hinweis „kein amtlicher Auszug“', () => {
    const pdf = VORGABE_KATASTER.plaene.filter((p) => p.art === 'pdf');
    expect(pdf.map((p) => p.name)).toEqual(['Katasterplan A4', 'Katasterplan A3']);
    for (const p of VORGABE_KATASTER.plaene) expect(`${p.name} ${p.beschriftung}`).not.toMatch(/Auszug aus/);
    expect(pdf.every((p) => p.beschriftung === VORGABE_BESCHRIFTUNG)).toBe(true);
    const t = { kuerzel: 'MUS', art: 'BAUA', datum: new Date(2026, 10, 3) };
    expect(planBeschriftung(VORGABE_BESCHRIFTUNG, pdf[0], t)).toBe('Kartengrundlage: Liegenschaftskarte (ALKIS), Geobasis NRW, Stand 03.11.2026 – kein amtlicher Auszug');
    expect(planBeschriftung('{Name} für {PROJEKT_KUERZEL}', pdf[0], t)).toBe('Katasterplan A4 für MUS');
  });

  it('Projektvariablen der Planköpfe, Koordinate, Pläne mit Ziel', () => {
    const [a4, , schwarz] = VORGABE_KATASTER.plaene;
    const a = auftragBauen(
      [a4, schwarz],
      { epsg: 25832, ost: 405577.31, nord: 5757743.76, lat: 51.96, lon: 7.63, quelle: 'test' } as never,
      { titel: 'Neubau EFH', kennung: 'MUS', strasse: 'Prinzipalmarkt 10', ort: 'Münster', plz: '48143' },
      (p) => `Z:/P/${p.name}.${p.art}`,
    );
    expect(a.koordinaten).toEqual({ ost: 405577.31, nord: 5757743.76, epsg: 25832 });
    expect(a.variablen).toEqual({ project_title: 'Neubau EFH', project_identifier: 'MUS', project_street: 'Prinzipalmarkt 10', project_city: 'Münster', project_zip_code: '48143' });
    expect(a.plaene.map((p) => p.ausgabe)).toEqual(['Z:/P/Katasterplan A4.pdf', 'Z:/P/Schwarzplan.dxf']);
    expect(a.plaene[1]).toMatchObject({ art: 'dxf', thema: 'Schwarzplan', breite: 300, hoehe: 300, stil: 'symbollayer' });
    expect('aktiv' in a.plaene[0]).toBe(false);
  });

  it('liest die Ergebniszeilen des Skripts (auch zwischen Meldungen von QGIS)', () => {
    const aus = [
      'QGIS version: 3.34.4-Prizren',
      'ERGEBNIS {"id": "a4", "datei": "/tmp/0.pdf", "ok": true}',
      'Warnung: irgendwas',
      'ERGEBNIS {"id": "falsch", "datei": "/tmp/1.pdf", "ok": false, "fehler": "Layout „X“ gibt es nicht"}',
      'ERGEBNIS {"id": "kaputt"',
    ].join('\r\n');
    expect(ergebnisseLesen(aus)).toEqual([
      { id: 'a4', ok: true, datei: '/tmp/0.pdf' },
      { id: 'falsch', ok: false, datei: '/tmp/1.pdf', fehler: 'Layout „X“ gibt es nicht' },
    ]);
    expect(fehlerAuszug('a\n\nb\nc', 'ERGEBNIS {}\nd', 3)).toBe('b\nc\nd');
  });
});
