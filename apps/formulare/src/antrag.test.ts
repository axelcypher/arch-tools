import { describe, expect, it } from 'vitest';
import { VORGABE_NAMENSSCHEMA } from '@core/namensschema';
import type { UmfangEintrag } from './antrag';
import { abschnittAus, abschnittVon, aktuellsterAntrag, ansichtVon, eingereichtAus, neuerAntrag } from './antrag';
import { merkmalVorgaben } from './bedingung';
import { VORGABE_EXPORT, einstellungenAus, nameNachFormat, vorlageMitAntragsart, datumAusName, standVergleich, antragsNameFehler, artDerFassung, bereitschaft, ordnerPasst, anzeigeName, dateiImAntrag, dateiname, einstellungenFuer, externStatus, fassungenAus, formularStatus, formularVon, naechsteFassung, passt, projektDateiAus, quelleVon, standardFassung, projektStatusAus, projektStatusLesen, schlimmsterStatus, statusGesamt, verschieben, vorlagenAus, vorlageFuer, umfangAusKatalog, VORGABE_KATALOG } from './antrag';

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

  it('die Antragsart im Dateinamen kommt immer aus dem Antrag – nicht aus der Einstellung „Phase“ oder einem festen Kürzel', () => {
    // Vorgabe früherer Fassungen: an Stelle 2 stand {Phase} (Einstellung, z. B. „BVA“) – jetzt die Antragsart des Antrags
    expect(vorlageMitAntragsart('{Kürzel} {Phase} {Datum} {Nr} {Name}')).toBe('{Kürzel} {Art} {Datum} {Nr} {Name}');
    expect(vorlageMitAntragsart('{Kuerzel} BVA {Datum} {Name}')).toBe('{Kuerzel} {Art} {Datum} {Name}');
    expect(vorlageMitAntragsart('{Kürzel} {Art} {Datum} {Nr} {Name}')).toBe('{Kürzel} {Art} {Datum} {Nr} {Name}');
    // eigene Vorlagen ohne Kürzel vorn bleiben, ebenso ein Wort, das kein Kürzel ist
    expect(vorlageMitAntragsart('{Name} {Datum}')).toBe('{Name} {Datum}');
    expect(vorlageMitAntragsart('{Kürzel} Antrag {Datum}')).toBe('{Kürzel} Antrag {Datum}');
    // reine Zahlen sind kein Kürzel
    expect(vorlageMitAntragsart('{Kürzel} 2026 {Name}')).toBe('{Kürzel} 2026 {Name}');
    expect(vorlageMitAntragsart('{Kürzel} 01 {Name}')).toBe('{Kürzel} 01 {Name}');
    // nach der Reihenfolge des Namensschemas: Antragsart an Stelle 3
    expect(vorlageMitAntragsart('{Kürzel} {Datum} {Phase} {Name}', ['code', 'datum', 'art', 'nummer'])).toBe('{Kürzel} {Datum} {Art} {Name}');
    expect(vorlageMitAntragsart('{Kürzel} {Phase} {Datum} {Name}', ['code', 'datum', 'art', 'nummer'])).toBe('{Kürzel} {Phase} {Datum} {Name}');
    // gespeichert bleibt die Vorlage, wie sie ist – eingesetzt wird beim Export (wirksameEinstellungen)
    const alt = einstellungenAus({ namensvorlage: '{Kürzel} {Phase} {Datum} {Nr} {Name}', phase: 'BVA' });
    expect(alt.namensvorlage).toBe('{Kürzel} {Phase} {Datum} {Nr} {Name}');
    // im Antrag „BAUA 2“ heißt die Datei also BAUA, auch wenn „Phase“ BVA ist
    expect(dateiname(vorlageMitAntragsart(alt.namensvorlage), { kuerzel: 'BS9', phase: alt.phase, datum: new Date(2026, 10, 12), nr: '01', name: 'Bauantrag', antrag: 'BAUA 2', art: artDerFassung('BAUA 2') })).toBe(
      'BS9 BAUA 261112 01 Bauantrag',
    );
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
    // gleichwertige Schreibweisen zählen zusammen (BVA und BAUVA), benannt wird in der gewählten
    const vb = fassungenAus(['BAUVA', 'BVA 2'], ['BAUVA', 'BVA']);
    expect(naechsteFassung(vb, 'BVA', VORGABE_NAMENSSCHEMA.antragsarten)).toBe('BVA 3');
    expect(naechsteFassung(vb, 'BVA')).toBe('BVA 3');
    expect(naechsteFassung(fassungenAus(['BAUVA'], ['BAUVA', 'BVA']), 'BVA', VORGABE_NAMENSSCHEMA.antragsarten)).toBe('BVA 2');
  });
});

describe('Antragsumfang: Dateien und Status', () => {
  const pdf = (pfad: string, geaendert: number) => ({ pfad, ordner: false, groesse: 1, geaendert });
  const bauantrag: UmfangEintrag = { id: 'bauantrag', titel: 'Bauantrag', art: 'intern', formular: 'Bauantrag' };

  it('Muster mit Platzhaltern und „;“, sonst Teil des Namens (Umlaute egal)', () => {
    expect(passt('BS9 GP 261110 Grundriss EG.pdf', '*Grundri*;*Schnitt*')).toBe(true);
    expect(passt('BS9 GP 261110 Flaechenberechnung.pdf', 'Flächenberechnung')).toBe(true);
    expect(passt('BS9 Kosten.xlsx', '*GRZ*')).toBe(false);
  });

  it('Datei im Antragsordner: verknüpft vor Muster, PDF vor anderem, neueste zuerst (Datum im Namen vor Änderungszeit)', () => {
    const dateien = [pdf('BS9 GP 261101 Bauantrag.pdf', 1), pdf('BS9 GP 261110 Bauantrag.pdf', 2), pdf('Bauantrag alt.pdf', 3), pdf('Bauantrag.docx', 9)];
    expect(dateiImAntrag(bauantrag, dateien, 'BAUA')?.pfad).toBe('BS9 GP 261110 Bauantrag.pdf');
    // ohne Datum im Namen: die zuletzt geänderte
    expect(dateiImAntrag(bauantrag, [pdf('Bauantrag a.pdf', 5), pdf('Bauantrag b.pdf', 3)], 'BAUA')?.pfad).toBe('Bauantrag a.pdf');
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

  it('Datum im Dateinamen: JJMMTT, JJJJMMTT, ISO, deutsch, mit Uhrzeit; Projektcode am Anfang zählt nicht', () => {
    expect(datumAusName('BS9 BAUA 261110 01 Bauantrag.pdf')).toEqual({ tag: 20261110 });
    expect(datumAusName('Planung/Berechnungen/BS9 Flächenberechnung 261111_1430.xlsx')).toEqual({ tag: 20261111, zeit: 1430 });
    expect(datumAusName('Lageplan_20261105.pdf')).toEqual({ tag: 20261105 });
    expect(datumAusName('Kosten 2026-11-03.xlsx')).toEqual({ tag: 20261103 });
    expect(datumAusName('Statik vom 4.11.2026.pdf')).toEqual({ tag: 20261104 });
    expect(datumAusName('BS9 GRZ.pdf')).toBeNull();
    expect(datumAusName('Grundriss EG 1-100 Index 01.pdf')).toBeNull();
    // kein gültiges Datum
    expect(datumAusName('Flurstück 123199.pdf')).toBeNull();
    // sechsstellige Projektnummer als Projektcode: das Datum dahinter zählt
    expect(datumAusName('240117 BAUA 261110 Bauantrag.pdf', ['240117'])).toEqual({ tag: 20261110 });
    expect(datumAusName('240117 BAUA 261110 Bauantrag.pdf')).toEqual({ tag: 20240117 });
  });

  it('Stand: Datum im Namen vor Änderungszeit, gleiches Datum = gleicher Stand', () => {
    const tag = (iso: string, h = 12) => new Date(`${iso}T${String(h).padStart(2, '0')}:00:00`).getTime();
    // Flächenberechnung von gestern als PDF im Antrag, die Excel-Datei danach noch einmal gespeichert
    const quelle = pdf('BS9 Flächenberechnung 261111.xlsx', tag('2026-11-12', 9));
    const imAntrag = pdf('BS9 BAUA 261111 Flächenberechnung.pdf', tag('2026-11-11', 17));
    expect(standVergleich(imAntrag, quelle)).toBe(0);
    expect(externStatus(quelle, imAntrag)).toBe('aktuell');
    // neue Fassung der Berechnung mit neuem Datum: die PDF im Antrag ist veraltet – auch wenn sie später gespeichert wurde
    expect(externStatus(pdf('BS9 Flächenberechnung 261112.xlsx', tag('2026-11-12', 8)), pdf('BS9 BAUA 261111 Flächenberechnung.pdf', tag('2026-11-12', 10)))).toBe('offen');
    // nur eine Seite mit Datum: gegen den Tag der Änderungszeit, am selben Tag die Änderungszeit
    expect(externStatus(pdf('BS9 Fläche.xlsx', tag('2026-11-10')), pdf('BS9 BAUA 261111 Fläche.pdf', tag('2026-11-09')))).toBe('aktuell');
    expect(externStatus(pdf('BS9 Fläche.xlsx', tag('2026-11-12')), pdf('BS9 BAUA 261111 Fläche.pdf', tag('2026-11-13')))).toBe('offen');
    expect(externStatus(pdf('BS9 Fläche.xlsx', tag('2026-11-11', 9)), pdf('BS9 BAUA 261111 Fläche.pdf', tag('2026-11-11', 10)))).toBe('aktuell');
    expect(externStatus(pdf('BS9 Fläche.xlsx', tag('2026-11-11', 11)), pdf('BS9 BAUA 261111 Fläche.pdf', tag('2026-11-11', 10)))).toBe('offen');
    // Quelle: die neueste nach dem Datum im Namen, nicht nach der Änderungszeit
    const flaeche = { id: 'f', titel: 'Fläche', art: 'extern' as const, muster: '*Fläche*' };
    expect(quelleVon(flaeche, [pdf('Fläche 261105.pdf', tag('2026-11-12')), pdf('Fläche 261111.xlsx', tag('2026-11-11'))])?.pfad).toBe('Fläche 261111.xlsx');
    // Formular: PDF mit späterem Datum als die letzte Änderung ist aktuell, mit früherem nicht; am selben Tag die Änderungszeit
    const voll = { gefuellt: 5, gesamt: 5 };
    expect(formularStatus(voll, tag('2026-11-10'), pdf('BS9 BAUA 261111 Bauantrag.pdf', tag('2026-11-09')))).toBe('aktuell');
    expect(formularStatus(voll, tag('2026-11-12'), pdf('BS9 BAUA 261111 Bauantrag.pdf', tag('2026-11-13')))).toBe('offen');
    expect(formularStatus(voll, tag('2026-11-11', 15), pdf('BS9 BAUA 261111 Bauantrag.pdf', tag('2026-11-11', 10)))).toBe('offen');
    expect(formularStatus(voll, tag('2026-11-11', 9), pdf('BS9 BAUA 261111 Bauantrag.pdf', tag('2026-11-11', 10)))).toBe('aktuell');
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

  it('Antragsumfang aus einer Vorlage in der Reihenfolge des Katalogs; Vorschlag nach Antragsart', () => {
    const vorlagen = [
      { id: 'a', name: 'Bauantrag', art: 'BAUA', dokumente: ['kosten', 'bauantrag'] },
      { id: 'b', name: 'Voranfrage', art: 'BAUVA', dokumente: ['lageplan'] },
    ];
    expect(umfangAusKatalog(VORGABE_KATALOG, vorlagen[0]).map((u) => u.id)).toEqual(['bauantrag', 'kosten']);
    expect(vorlageFuer(vorlagen, 'bauva')?.id).toBe('b');
    // keine Vorlage zur Art: kein Vorschlag (nicht stillschweigend „Bauantrag“); ohne Art die erste
    expect(vorlageFuer(vorlagen, 'DENK')).toBeUndefined();
    expect(vorlageFuer(vorlagen, '')?.id).toBe('a');
    expect(vorlageFuer([], 'BAUA')).toBeUndefined();
    // gleichwertige Schreibweise nach dem Namensschema: BVA → BAUVA
    expect(vorlageFuer(vorlagen, 'BVA')).toBeUndefined();
    expect(vorlageFuer(vorlagen, 'BVA', VORGABE_NAMENSSCHEMA.antragsarten)?.id).toBe('b');
  });
});

describe('Umbenennen nach Namensformat', () => {
  const datum = new Date(2026, 10, 12);
  const o = { codes: ['HVO'], art: 'BAUA', datum, kuerzel: ['BP', 'EP', 'GP', 'AP', 'AB', 'BAUA', 'BAUVA', 'BVA'] };
  it('verschobener Plan: nur die Phase an der Stelle der Antragsart wird ersetzt – die Plannummer bleibt', () => {
    expect(nameNachFormat('HVO GP 261111 GP-04 Grundriss OG.pdf', o)).toBe('HVO BAUA 261111 GP-04 Grundriss OG.pdf');
    expect(nameNachFormat('hvo bva 261111 01 Bauantrag.pdf', o)).toBe('hvo BAUA 261111 01 Bauantrag.pdf');
    expect(antragsNameFehler(nameNachFormat('HVO GP 261111 GP-04 Grundriss OG.pdf', o), o)).toBeNull();
  });
  it('sonst kommen Projektcode, Antragsart und Datum nach dem Namensschema davor', () => {
    expect(nameNachFormat('Lageplan vom Vermesser.pdf', o)).toBe('HVO BAUA 261112 Lageplan vom Vermesser.pdf');
    // ein unbekanntes Wort an der Stelle der Antragsart wird nicht ersetzt
    expect(nameNachFormat('HVO Entwurf 261111 Lageplan.pdf', o)).toBe('HVO BAUA 261112 HVO Entwurf 261111 Lageplan.pdf');
    expect(nameNachFormat('Lageplan.pdf', { ...o, reihenfolge: ['datum', 'code', 'art', 'nummer'] })).toBe('261112 HVO BAUA Lageplan.pdf');
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
    // Projektcode aus mehreren Wörtern
    expect(antragsNameFehler('BS 9 BAUA 261110 Bauantrag.pdf', { codes: ['BS 9'], art: 'BAUA' })).toBeNull();
    // andere Reihenfolge im Namensschema: Datum vorn
    const r = { ...o, reihenfolge: ['datum', 'code', 'art', 'nummer'] as ('datum' | 'code' | 'art' | 'nummer')[] };
    expect(antragsNameFehler('261110 MUS BAUA Bauantrag.pdf', r)).toBeNull();
    expect(antragsNameFehler('MUS BAUA 261110 Bauantrag.pdf', r)).toContain('Projektcode fehlt an Stelle 2');
    expect(antragsNameFehler('MUS BAUA 261110 Bauantrag.pdf', r)).toContain('erwartet „JJMMTT MUS BAUA …“');
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

describe('Anträge: je Antrag eigene Antragsmerkmale, Antragsumfang und Autofill', () => {
  const umfang: UmfangEintrag[] = [{ id: 'muster', titel: 'Muster', art: 'intern' }];

  it('übernimmt die früher projektweiten Angaben (Abschnitt bzw. meta.merkmale) als „alt“, „bereit“ je Fassung in den Antrag', () => {
    const a = abschnittAus({ aktiveFassung: 'BAUA 2', umfang, felder: { 'a.frmsjf': { felder: { x: { auto: '1' } } } }, bereit: { 'BAUA 2': [{ datei: 'x.pdf', stand: 5 }] } }, { Gebäudeklasse: '3' });
    expect(a.aktiveFassung).toBe('BAUA 2');
    expect(a.alt).toEqual({ merkmale: { Gebäudeklasse: '3' }, umfang, felder: { 'a.frmsjf': { felder: { x: { auto: '1' } } } } });
    expect(a.antraege['BAUA 2']).toMatchObject({ merkmale: { Gebäudeklasse: '3' }, umfang, bereit: [{ datei: 'x.pdf', stand: 5 }] });
    // neues Format: nichts „alt“
    const neu = abschnittAus({ antraege: { BAUA: { angelegt: '2026-10-01', merkmale: { Sonderbau: 'ja' }, eingereicht: { datei: 'Eingangsbestätigung.pdf', datum: '2026-10-20' } } } });
    expect(neu).toEqual({ antraege: { BAUA: { angelegt: '2026-10-01', merkmale: { Sonderbau: 'ja' }, eingereicht: { datei: 'Eingangsbestätigung.pdf', datum: '2026-10-20' } } } });
  });

  it('Ansicht des aktiven Antrags und zurück: andere Anträge bleiben unberührt; ein fehlender entsteht aus den Vorgaben', () => {
    const a = abschnittAus({ antraege: { BAUA: { angelegt: '2026-10-01', merkmale: { Gebäudeklasse: '2' }, umfang } } });
    const { pd, neu } = ansichtVon(a, 'BAUA 2', () => neuerAntrag(merkmalVorgaben([{ name: 'Gebäudeklasse', werte: ['1', '2', '3'], vorgabe: '3' }, { name: 'Sonderbau', werte: ['ja'], vorgabe: 'nein' }]), '2026-11-11'));
    expect(neu).toBe(true);
    expect(pd).toMatchObject({ ansicht: 'BAUA 2', merkmale: { Gebäudeklasse: '3' } });
    expect(pd.umfang).toBeUndefined();
    // Änderung im angezeigten Antrag
    const geschrieben = abschnittVon({ ...pd, aktiveFassung: 'BAUA 2', merkmale: { Gebäudeklasse: '4' }, bereit: { 'BAUA 2': [{ datei: 'y.pdf' }] } });
    expect(geschrieben).toEqual({
      aktiveFassung: 'BAUA 2',
      antraege: {
        BAUA: { angelegt: '2026-10-01', merkmale: { Gebäudeklasse: '2' }, umfang },
        'BAUA 2': { angelegt: '2026-11-11', merkmale: { Gebäudeklasse: '4' }, bereit: [{ datei: 'y.pdf' }] },
      },
    });
  });

  it('aktuellster Antrag: zuletzt angelegt, bei gleichem Tag die spätere Fassung', () => {
    expect(aktuellsterAntrag({})).toBeNull();
    const antraege = {
      BAUVA: { angelegt: '2026-03-01', eingereicht: { datei: 'Antragsprotokoll.pdf', datum: '2026-03-20' } },
      BAUA: { angelegt: '2026-09-01' },
      'BAUA 2': { angelegt: '2026-09-01' },
    };
    expect(aktuellsterAntrag(antraege, ['BAUVA', 'BAUA', 'BAUA 2'])).toEqual({ name: 'BAUA 2', angelegt: '2026-09-01' });
    expect(aktuellsterAntrag({ ...antraege, BAUVA: { ...antraege.BAUVA, angelegt: '2026-10-01' } }, ['BAUVA', 'BAUA', 'BAUA 2'])).toEqual({ name: 'BAUVA', angelegt: '2026-10-01', eingereicht: { datei: 'Antragsprotokoll.pdf', datum: '2026-03-20' } });
  });

  it('eingereicht: Antragsprotokoll oder Eingangsbestätigung (auch „ae“), die neueste; Sperrdateien zählen nicht', () => {
    const zeit = new Date(2026, 10, 3, 12).getTime();
    expect(eingereichtAus([{ pfad: 'BS9 BAUA 261101 Bauantrag.pdf', ordner: false, groesse: 1 }])).toBeNull();
    expect(eingereichtAus([{ pfad: '~$Eingangsbestätigung.docx', ordner: false, groesse: 1 }])).toBeNull();
    expect(
      eingereichtAus([
        { pfad: 'BS9 BAUA 261020 Antragsprotokoll.pdf', ordner: false, groesse: 1, geaendert: zeit - 86400000 * 14 },
        { pfad: 'Eingangsbestaetigung Kreis.pdf', ordner: false, groesse: 1, geaendert: zeit },
      ]),
    ).toEqual({ datei: 'Eingangsbestaetigung Kreis.pdf', datum: '2026-11-03' });
  });

  it('eingereicht: auch in Unterordnern des Antrags – mit Pfad relativ zum Antragsordner', () => {
    const zeit = new Date(2026, 10, 3, 12).getTime();
    expect(
      eingereichtAus([
        { pfad: 'Schriftverkehr', ordner: true, groesse: 0 },
        { pfad: 'Schriftverkehr/Eingangsbestätigung', ordner: true, groesse: 0 },
        { pfad: 'Schriftverkehr/Kreis/BS9 BAUA 261103 Antragsprotokoll.pdf', ordner: false, groesse: 1, geaendert: zeit },
      ]),
    ).toEqual({ datei: 'Schriftverkehr/Kreis/BS9 BAUA 261103 Antragsprotokoll.pdf', datum: '2026-11-03' });
    // Archivordner (archiv, _archiv – auch tiefer) zählen nicht
    expect(eingereichtAus([{ pfad: '_archiv/Eingangsbestätigung.pdf', ordner: false, groesse: 1 }])).toBeNull();
    expect(eingereichtAus([{ pfad: 'Schriftverkehr/Archiv/Antragsprotokoll.pdf', ordner: false, groesse: 1 }])).toBeNull();
    expect(eingereichtAus([{ pfad: 'Archivierung/Antragsprotokoll.pdf', ordner: false, groesse: 1 }])).not.toBeNull();
  });
});
