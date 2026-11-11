import { describe, expect, it } from 'vitest';
import type { UmfangEintrag } from './antrag';
import { VORGABE_EXPORT, antragsNameFehler, artDerFassung, bereitschaft, ordnerPasst, anzeigeName, dateiImAntrag, dateiname, einstellungenFuer, externStatus, fassungenAus, formularStatus, formularVon, naechsteFassung, passt, projektDateiAus, quelleVon, standardFassung, projektStatusAus, projektStatusLesen, schlimmsterStatus, statusGesamt, verschieben, vorlagenAus, vorlageFuer, umfangAusKatalog, VORGABE_KATALOG } from './antrag';

describe('Dateinamen aus der Vorlage', () => {
  const datum = new Date(2026, 10, 10);
  it('Kürzel Antragsart JJMMTT [Nr] Name – fehlende Nummer entfällt samt Leerzeichen; {Phase} gibt es weiter', () => {
    expect(dateiname(VORGABE_EXPORT.namensvorlage, { kuerzel: 'BS9', phase: 'GP', datum, name: 'Bauantrag', antrag: 'BAUA 2' })).toBe('BS9 BAUA 261110 Bauantrag');
    expect(dateiname(VORGABE_EXPORT.namensvorlage, { kuerzel: 'BS9', phase: 'GP', datum, nr: '03', name: 'Baubeschreibung', art: 'DENK' })).toBe('BS9 DENK 261110 03 Baubeschreibung');
    expect(dateiname('{Kürzel} {Phase} {Datum} {Name}', { kuerzel: 'BS9', phase: 'GP', datum, name: 'Bauantrag' })).toBe('BS9 GP 261110 Bauantrag');
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

describe('Antragsstatus für die Projektübersicht', () => {
  it('zählt je Status (ohne „entfällt“), der schlimmste bestimmt den Farbpunkt', () => {
    const st = projektStatusAus(['aktuell', 'offen', 'entfaellt', 'aktuell', 'unvollstaendig'], 'BAUA 2', 5);
    expect(st).toEqual({ anzahl: { aktuell: 2, offen: 1, unvollstaendig: 1 }, fassung: 'BAUA 2', zeit: 5 });
    expect(statusGesamt(st)).toBe(4);
    expect(schlimmsterStatus(st)).toBe('unvollstaendig');
    expect(schlimmsterStatus(projektStatusAus(['aktuell'], 'BAUA', 0))).toBe('aktuell');
    expect(schlimmsterStatus(projektStatusAus([], 'BAUA', 0))).toBeNull();
  });

  it('gespeicherte Status werden geprüft', () => {
    expect(projektStatusLesen({ a: { anzahl: { aktuell: 2, fehlt: -1, quatsch: 3 }, fassung: 'BAUA', zeit: 1 }, b: { fassung: 1 }, c: null })).toEqual({
      a: { anzahl: { aktuell: 2 }, fassung: 'BAUA', zeit: 1 },
    });
    expect(projektStatusLesen('kaputt')).toEqual({});
  });
});

describe('Antragsvorlagen und Reihenfolge', () => {
  it('verschieben: herausnehmen und an der neuen Stelle einsetzen', () => {
    const l = ['a', 'b', 'c', 'd'];
    expect(verschieben(l, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(verschieben(l, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(verschieben(l, 1, 1)).toBe(l);
    expect(verschieben(l, 0, 9)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('ohne gespeicherte Vorlagen: der Bauantrag übernimmt die bisher vorgewählten Dokumente', () => {
    const katalog = VORGABE_KATALOG.map((k) => ({ ...k, vorgewaehlt: k.id === 'lageplan' || k.id === 'kosten' }));
    const v = vorlagenAus(null, katalog);
    expect(v.map((x) => [x.id, x.art])).toEqual([
      ['baua', 'BAUA'],
      ['bauva', 'BAUVA'],
      ['denk', 'DENK'],
    ]);
    expect(v[0].dokumente).toEqual(['lageplan', 'kosten']);
    expect(vorlagenAus([{ name: 'X', dokumente: ['a', 'a', 3] }, { titel: 'kaputt' }], katalog)).toEqual([{ id: 'v1', name: 'X', dokumente: ['a'] }]);
  });

  it('Projektumfang aus einer Vorlage in der Reihenfolge des Katalogs; Vorschlag nach Antragsart', () => {
    const vorlagen = [
      { id: 'a', name: 'Bauantrag', art: 'BAUA', dokumente: ['kosten', 'bauantrag'] },
      { id: 'b', name: 'Voranfrage', art: 'BAUVA', dokumente: ['lageplan'] },
    ];
    expect(umfangAusKatalog(VORGABE_KATALOG, vorlagen[0]).map((u) => u.id)).toEqual(['bauantrag', 'kosten']);
    expect(vorlageFuer(vorlagen, 'bauva')?.id).toBe('b');
    expect(vorlageFuer(vorlagen, 'DENK')?.id).toBe('a');
    expect(vorlageFuer([], 'BAUA')).toBeUndefined();
  });
});

describe('Dokumente im Antragsordner: Namensformat und „bereit“', () => {
  const o = { codes: ['MUS', '2026-014'], art: 'BAUA' };
  it('Namensformat „<Projektcode> <Antragsart> <JJMMTT> …“', () => {
    expect(antragsNameFehler('MUS BAUA 261110 Bauantrag.pdf', o)).toBeNull();
    expect(antragsNameFehler('2026-014 BAUA 261110 01 Lageplan.pdf', o)).toBeNull();
    expect(antragsNameFehler('mus baua 261110 Bauantrag.pdf', o)).toBeNull();
    expect(antragsNameFehler('MUS GP 261110 Bauantrag.pdf', o)).toContain('Antragsart BAUA fehlt');
    expect(antragsNameFehler('Bauantrag MUS BAUA 261110.pdf', o)).toContain('Projektcode fehlt');
    expect(antragsNameFehler('MUS BAUA Bauantrag.pdf', o)).toContain('Datum JJMMTT');
    expect(antragsNameFehler('MUS BAUA 261110.pdf', o)).toContain('Datum JJMMTT und Name fehlen');
    expect(antragsNameFehler('MUS BAUA 261310 Bauantrag.pdf', o)).toContain('Kein gültiges Datum');
    expect(antragsNameFehler('MUS BAUA 261110 Bauantrag.pdf', { codes: ['MUS'], art: artDerFassung('BAUA 2') })).toBeNull();
    expect(artDerFassung('bauva3')).toBe('BAUVA');
  });

  it('bereit nur von Hand, mit passendem Namen und ohne spätere Änderung', () => {
    const d = { pfad: 'MUS BAUA 261110 Bauantrag.pdf', geaendert: 1000 };
    expect(bereitschaft(d, undefined, null)).toBe('offen');
    expect(bereitschaft(d, { datei: d.pfad, stand: 1000 }, null)).toBe('bereit');
    expect(bereitschaft({ ...d, geaendert: 60_000 }, { datei: d.pfad, stand: 1000 }, null)).toBe('geaendert');
    expect(bereitschaft(d, { datei: d.pfad, stand: 1000 }, 'Name passt nicht')).toBe('name');
  });

  it('„bereit“ wird mit der Projektdatei gelesen', () => {
    expect(projektDateiAus({ bereit: { BAUA: [{ datei: 'MUS BAUA 261110 A.pdf', stand: 5 }, { kaputt: 1 }], leer: [] } }).bereit).toEqual({ BAUA: [{ datei: 'MUS BAUA 261110 A.pdf', stand: 5 }] });
  });
});

describe('Quellordner: Schreibweisen der Büros', () => {
  it('Nummern und Unterstriche vorn, gleichwertige Namen, Platzhalter', () => {
    for (const n of ['00 Berechnungen', '0 Berechnungen', '__Berechnungen', '_Berechnungen', 'Berechnungen']) expect([n, ordnerPasst(n, 'Berechnungen')]).toEqual([n, true]);
    for (const n of ['03 Genehmigungsplanung', 'Genehmigungsplanung', 'Genehmigung', 'GP']) expect([n, ordnerPasst(n, 'Genehmigungsplanung')]).toEqual([n, true]);
    expect(ordnerPasst('Fachplaner', 'Fachplanung')).toBe(true);
    expect(ordnerPasst('G27 Vermessung Müller', 'G27*')).toBe(true);
    expect(ordnerPasst('Ausführungsplanung', 'Genehmigungsplanung')).toBe(false);
  });
});
