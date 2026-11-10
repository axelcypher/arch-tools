import { describe, expect, it } from 'vitest';
import type { UmfangEintrag } from './antrag';
import {
  VORGABE_EXPORT,
  anzeigeName,
  dateiImAntrag,
  dateiname,
  einstellungenFuer,
  externStatus,
  fassungenAus,
  formularStatus,
  formularVon,
  naechsteFassung,
  passt,
  projektDateiAus,
  quelleVon,
  standardFassung,
} from './antrag';

describe('Dateinamen aus der Vorlage', () => {
  const datum = new Date(2026, 10, 10);
  it('Kürzel Phase JJMMTT [Nr] Name – fehlende Nummer entfällt samt Leerzeichen', () => {
    expect(dateiname(VORGABE_EXPORT.namensvorlage, { kuerzel: 'BS9', phase: 'GP', datum, name: 'Bauantrag' })).toBe('BS9 GP 261110 Bauantrag');
    expect(dateiname(VORGABE_EXPORT.namensvorlage, { kuerzel: 'BS9', phase: 'GP', datum, nr: '03', name: 'Baubeschreibung' })).toBe('BS9 GP 261110 03 Baubeschreibung');
  });

  it('weitere Platzhalter, unbekannte bleiben stehen, unzulässige Zeichen werden zu „-“', () => {
    expect(dateiname('{Antrag} - {Name} {Kennung}/{Stand} {Unbekannt}', { kuerzel: 'X', phase: '', datum, name: 'A: B?', antrag: 'BAUA 2', kennung: 'nw010005', stand: '2026A' })).toBe(
      'BAUA 2 - A- B- nw010005-2026A {Unbekannt}',
    );
  });

  it('Name des Formulars ohne Nummer und Jahr', () => {
    expect(anzeigeName('005-Bauantrag (2026)')).toBe('Bauantrag');
    expect(anzeigeName('Baubeschreibung')).toBe('Baubeschreibung');
  });

  it('Einstellungen je Projekt überschreiben nur, was gesetzt ist', () => {
    expect(einstellungenFuer(VORGABE_EXPORT, { phase: 'EP', namensvorlage: '' })).toMatchObject({ phase: 'EP', namensvorlage: VORGABE_EXPORT.namensvorlage, antragsordner: 'TÖB' });
  });
});

describe('Antragsfassungen', () => {
  const arten = ['BAUA', 'BAUVA', 'DENK'];
  it('erkennt BAUA, BAUA2, BAUA 2 und andere Arten; anderes zählt nicht', () => {
    const f = fassungenAus(['BAUA 2', 'Schriftverkehr', 'BAUA', 'denk', 'BAUVA_1', 'BAUA3 Nachreichung'], arten);
    expect(f.map((x) => [x.name, x.art, x.nr])).toEqual([
      ['BAUA', 'BAUA', 1],
      ['BAUA 2', 'BAUA', 2],
      ['BAUA3 Nachreichung', 'BAUA', 3],
      ['BAUVA_1', 'BAUVA', 1],
      ['denk', 'DENK', 1],
    ]);
    expect(standardFassung(f, arten)?.name).toBe('BAUA3 Nachreichung');
    expect(naechsteFassung(f, 'BAUA')).toBe('BAUA 4');
    expect(naechsteFassung([], 'BAUA')).toBe('BAUA');
  });
});

describe('Projektumfang: Dateien und Status', () => {
  const pdf = (pfad: string, geaendert: number) => ({ pfad, ordner: false, groesse: 1, geaendert });
  const bauantrag: UmfangEintrag = { id: 'bauantrag', titel: 'Bauantrag', art: 'intern', formular: 'Bauantrag' };

  it('Muster mit Platzhaltern und „;“, sonst Teil des Namens (Umlaute egal)', () => {
    expect(passt('BS9 GP 261110 Grundriss EG.pdf', '*Grundri*;*Schnitt*')).toBe(true);
    expect(passt('BS9 GP 261110 Flaechenberechnung.pdf', 'Flächenberechnung')).toBe(true);
    expect(passt('BS9 Kosten.xlsx', '*GRZ*')).toBe(false);
  });

  it('Datei im Antragsordner: verknüpft vor Muster, PDF vor anderem, neueste zuerst', () => {
    const dateien = [pdf('BS9 GP 261101 Bauantrag.pdf', 1), pdf('BS9 GP 261110 Bauantrag.pdf', 2), pdf('Bauantrag alt.pdf', 3), pdf('Bauantrag.docx', 9)];
    expect(dateiImAntrag(bauantrag, dateien, 'BAUA')?.pfad).toBe('Bauantrag alt.pdf');
    expect(dateiImAntrag({ ...bauantrag, dateien: { BAUA: 'BS9 GP 261101 Bauantrag.pdf' } }, dateien, 'BAUA')?.pfad).toBe('BS9 GP 261101 Bauantrag.pdf');
    expect(dateiImAntrag(bauantrag, [], 'BAUA')).toBeNull();
  });

  it('Formular im FORMA-Projekt: zugeordnet, sonst Name oder Kennung', () => {
    const formulare = [
      { pfad: 'BS9/001-Bauantrag (2026).frmsjf', name: '001-Bauantrag (2026)', kennung: 'nw010001' },
      { pfad: 'BS9/002-Anlage.frmsjf', name: '002-Anlage', kennung: 'nw010005' },
    ];
    expect(formularVon(bauantrag, formulare)?.name).toBe('001-Bauantrag (2026)');
    expect(formularVon({ ...bauantrag, formular: 'nw010005' }, formulare)?.name).toBe('002-Anlage');
    expect(formularVon({ ...bauantrag, formularDatei: '002-Anlage.frmsjf' }, formulare)?.name).toBe('002-Anlage');
  });

  it('Status: rot unvollständig, gelb ohne aktuelle PDF, grün mit PDF nach der letzten Änderung', () => {
    expect(formularStatus({ gefuellt: 3, gesamt: 5 }, 10, pdf('a.pdf', 20))).toBe('unvollstaendig');
    expect(formularStatus({ gefuellt: 5, gesamt: 5 }, 10, null)).toBe('offen');
    expect(formularStatus({ gefuellt: 5, gesamt: 5 }, 30, pdf('a.pdf', 20))).toBe('offen');
    expect(formularStatus({ gefuellt: 5, gesamt: 5 }, 10, pdf('a.pdf', 20))).toBe('aktuell');
  });

  it('externe Dokumente: Quelle und Datei im Antragsordner', () => {
    const grz = { id: 'grz', titel: 'Berechnung GRZ', art: 'extern' as const, muster: '*GRZ*' };
    const quelle = quelleVon(grz, [pdf('BS9 GRZ.grz', 50), pdf('BS9 GRZ alt.grz', 10), pdf('Kosten.kosten', 99)]);
    expect(quelle?.pfad).toBe('BS9 GRZ.grz');
    expect(externStatus(quelle, null)).toBe('offen');
    expect(externStatus(quelle, pdf('BS9 GRZ.pdf', 40))).toBe('offen');
    expect(externStatus(quelle, pdf('BS9 GRZ.pdf', 60))).toBe('aktuell');
    expect(externStatus(null, null)).toBe('fehlt');
  });

  it('Projektdatei: unbekannte Angaben werden verworfen', () => {
    expect(projektDateiAus({ aktiveFassung: ' BAUA 2 ', umfang: [{ titel: 'Lageplan', art: 'extern', dateien: { BAUA: 'a.pdf', x: 3 } }, { kaputt: true }] })).toEqual({
      aktiveFassung: 'BAUA 2',
      umfang: [{ id: 'u1', titel: 'Lageplan', art: 'extern', dateien: { BAUA: 'a.pdf' } }],
    });
  });
});
