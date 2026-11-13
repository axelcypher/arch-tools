import { describe, expect, it } from 'vitest';
import { dateinameZerlegen, planNummerAus, VORGABE_NAMENSSCHEMA } from '@core/namensschema';
import type { UmfangEintrag } from './antrag';
import { abschnittAus, abschnittVon, aktuellsterAntrag, ansichtVon, aufnahmeVorschlag, eingereichtAus, formularSchluessel, formularVerweiseUmbenennen, neuerAntrag, pdfOhneZuordnung } from './antrag';
import { merkmalVorgaben } from './bedingung';
import { ueberschreibungenAus, aenderungAnwenden, alsAngaben, bereitAnwenden, klein, stabil, umfangAnwenden, VORGABE_EXPORT, einstellungenAus, entferntSeitEinreichung, imStand, nachEinreichungErwartet, nameNachFormat, seitEinreichung, standAus, vorlageMitAntragsart, zielpfadAus, datumAusName, standVergleich, antragsNameFehler, artDerFassung, bereitschaft, ordnerPasst, anzeigeName, dateiImAntrag, dateiname, einstellungenFuer, externStatus, fassungenAus, formularStatus, formularVon, naechsteFassung, passt, projektDateiAus, quelleVon, standardFassung, projektStatusAus, projektStatusLesen, schlimmsterStatus, statusGesamt, verschieben, vorlagenAus, vorlageFuer, umfangAusKatalog, VORGABE_KATALOG, ueberschreibungAus } from './antrag';

describe('Dateinamen aus der Vorlage', () => {
  const datum = new Date(2026, 10, 10);
  it('Kürzel Antragsart JJMMTT [Nr] Name – fehlende Nummer entfällt samt Leerzeichen; {Phase} alter Vorlagen gilt als {Art}', () => {
    expect(dateiname(VORGABE_EXPORT.namensvorlage, { kuerzel: 'BS9', datum, name: 'Bauantrag', antrag: 'BAUA 2' })).toBe('BS9 BAUA 261110 Bauantrag');
    expect(dateiname(VORGABE_EXPORT.namensvorlage, { kuerzel: 'BS9', datum, nr: '03', name: 'Baubeschreibung', art: 'DENK' })).toBe('BS9 DENK 261110 03 Baubeschreibung');
    expect(dateiname('{Kürzel} {Phase} {Datum} {Name}', { kuerzel: 'BS9', datum, name: 'Bauantrag', antrag: 'BAUA 2' })).toBe('BS9 BAUA 261110 Bauantrag');
    expect(dateiname('{Name} ({Phase})', { kuerzel: 'BS9', datum, name: 'Bauantrag', art: 'DENK' })).toBe('Bauantrag (DENK)');
  });

  it('neue und alte Namen ergeben dasselbe (Gegenprobe); globale Variablen aus der Projektdatei', () => {
    const a = { kuerzel: 'BS9', datum, nr: '03', name: 'Bauantrag', antrag: 'BAUA 2', kurzname: 'Kita', bearbeiter: 'TP' };
    expect(VORGABE_EXPORT.namensvorlage).toBe('{PROJEKT_KUERZEL} {Art} {DATUM} {Nr} {Name}');
    expect(dateiname('{Kürzel} {Art} {Datum} {Nr} {Name}', a)).toBe(dateiname(VORGABE_EXPORT.namensvorlage, a));
    expect(dateiname('{Projekt} {kuerzel} {Jahr} {jj}', a)).toBe('BS9 BS9 2026 26');
    expect(dateiname('{PROJEKT_KUERZEL} {PROJEKT_KURZNAME} {BEARBEITER} {DATUM:JJJJ-MM-TT}', a)).toBe('BS9 Kita TP 2026-11-10');
    // {Kürzel} an der Stelle des Kürzels: ein festes Kürzel bzw. {Phase} an der Stelle der Antragsart wird {Art} – auch mit neuen Namen
    expect(vorlageMitAntragsart('{PROJEKT_KUERZEL} BVA {DATUM} {Name}')).toBe('{PROJEKT_KUERZEL} {Art} {DATUM} {Name}');
    expect(vorlageMitAntragsart('{Kürzel} {Phase} {Datum} {Name}')).toBe('{Kürzel} {Art} {Datum} {Name}');
    expect(vorlageMitAntragsart('{PROJEKT_KURZNAME} BVA {DATUM}')).toBe('{PROJEKT_KURZNAME} BVA {DATUM}');
  });

  it('fester Zielordner: {Antrag} und globale Variablen, alte Namen gelten weiter', () => {
    expect(zielpfadAus('TÖB/{Antrag}/Formulare', { kuerzel: 'BS9', antrag: 'BAUA 2' })).toBe('TÖB/BAUA 2/Formulare');
    expect(zielpfadAus('\\{kürzel}\\{antrag}\\', { kuerzel: 'BS9', antrag: 'BAUA 2' })).toBe('BS9/BAUA 2');
    expect(zielpfadAus('{PROJEKT_KURZNAME}/{Art}', { kuerzel: 'BS9', antrag: 'DENK', kurzname: 'A/B' })).toBe('A B/DENK');
  });

  it('weitere Platzhalter, unbekannte bleiben stehen, unzulässige Zeichen werden zu „-“', () => {
    expect(dateiname('{Antrag} - {Name} {Kennung}/{Stand} {Unbekannt}', { kuerzel: 'X', datum, name: 'A: B?', antrag: 'BAUA 2', kennung: 'nw010005', stand: '2026A' })).toBe(
      'BAUA 2 - A- B- nw010005-2026A {Unbekannt}',
    );
  });

  it('Name des Formulars ohne Nummer und Jahr', () => {
    expect(anzeigeName('005-Bauantrag (2026)')).toBe('Bauantrag');
    expect(anzeigeName('Baubeschreibung')).toBe('Baubeschreibung');
  });

  it('Abweichungen je Projekt: nur Erlaubtes, leere entfallen – auch nur „Phase“ (entfallene Einstellung)', () => {
    expect(ueberschreibungenAus({ BS9: { phase: 'EP' }, HVO: { phase: 'EP', zielpfad: 'TÖB/Formulare', namensvorlage: '' }, X: null, Y: { ziel: 'woanders' } })).toEqual({
      HVO: { zielpfad: 'TÖB/Formulare' },
    });
    expect(ueberschreibungenAus({ A: { ziel: 'pfad', antragsordner: 'Anträge' } })).toEqual({ A: { ziel: 'pfad', antragsordner: 'Anträge' } });
    expect(ueberschreibungenAus(null)).toEqual({});
    expect(ueberschreibungenAus(['x'])).toEqual({});
  });

  it('Einstellungen je Projekt überschreiben nur, was gesetzt ist', () => {
    expect(einstellungenFuer(VORGABE_EXPORT, { zielpfad: 'TÖB/Formulare', namensvorlage: '' })).toMatchObject({ zielpfad: 'TÖB/Formulare', namensvorlage: VORGABE_EXPORT.namensvorlage, antragsordner: 'TÖB' });
  });

  it('gelesene Abweichungen je Projekt: nur Texte, Ziel nur „aktiv“/„pfad“ – Unbrauchbares fällt weg statt die App lahmzulegen', () => {
    expect(ueberschreibungAus({ zielpfad: 5, antragsordner: 'Bauamt', ziel: 'irgendwo', phase: null, namensvorlage: ['x'], fremd: 'y' })).toEqual({ antragsordner: 'Bauamt' });
    expect(ueberschreibungAus({ ziel: 'pfad', zielpfad: 'D:/Abgabe' })).toEqual({ ziel: 'pfad', zielpfad: 'D:/Abgabe' });
    expect(ueberschreibungAus('kaputt')).toEqual({});
    expect(ueberschreibungenAus({ BS5: { zielpfad: 5 }, BS6: { antragsordner: 'Bauamt' } })).toEqual({ BS6: { antragsordner: 'Bauamt' } });
    expect(ueberschreibungenAus([1, 2])).toEqual({});
    // auch was unbesehen hereinkommt, wirkt nicht
    expect(einstellungenFuer(VORGABE_EXPORT, { zielpfad: 5, antragsordner: 7 } as never)).toMatchObject({ zielpfad: VORGABE_EXPORT.zielpfad, antragsordner: 'TÖB' });
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
    // die entfallene Einstellung „Phase“ wird nicht mehr gelesen
    expect(alt).not.toHaveProperty('phase');
    // im Antrag „BAUA 2“ heißt die Datei also BAUA, auch wenn „Phase“ BVA war
    expect(dateiname(vorlageMitAntragsart(alt.namensvorlage), { kuerzel: 'BS9', datum: new Date(2026, 10, 12), nr: '01', name: 'Bauantrag', antrag: 'BAUA 2', art: artDerFassung('BAUA 2') })).toBe(
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
  it('Nummer vorn („2 BAUA“, „2. BAUA“, „02. BAUA“, „02 BAUA“): erkannt, die nächste in derselben Schreibweise', () => {
    const f = fassungenAus(['BAUA', '02. BAUA', '2 DENK', 'Schriftverkehr'], arten);
    expect(f.map((x) => [x.name, x.art, x.nr])).toEqual([
      ['BAUA', 'BAUA', 1],
      ['02. BAUA', 'BAUA', 2],
      ['2 DENK', 'DENK', 2],
    ]);
    expect(standardFassung(f, arten)?.name).toBe('02. BAUA');
    expect(naechsteFassung(f, 'BAUA')).toBe('03. BAUA');
    expect(naechsteFassung(f, 'DENK')).toBe('3 DENK');
    expect(naechsteFassung(fassungenAus(['BAUA', '2.BAUA'], arten), 'BAUA')).toBe('3.BAUA');
    expect(naechsteFassung(fassungenAus(['BAUA', 'BAUA_02'], arten), 'BAUA')).toBe('BAUA_03');
    // nur „BAUA“ (ohne Nummer): wie bisher „BAUA 2“
    expect(naechsteFassung(fassungenAus(['BAUA'], arten), 'BAUA')).toBe('BAUA 2');
    // die Antragsart einer Fassung, auch mit Nummer vorn
    expect(artDerFassung('02. BAUA')).toBe('BAUA');
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

describe('Antragsstand bei der Einreichung', () => {
  const tag = '2026-11-02';
  const zeit = (t: string) => new Date(t).getTime();
  const d = (pfad: string, geaendert: number, groesse = 10) => ({ pfad, ordner: false, groesse, geaendert });
  // Positivliste: Projektcodes und der Tag der Einreichung gehören dazu
  const codes = ['BS9', 'HVO'];
  const erw = (n: string) => nachEinreichungErwartet(n, { codes, tag: '2026-11-03' });
  const liste = [
    d('BS9 BAUA 261101 01 Bauantrag.pdf', zeit('2026-11-01T10:00')),
    d('BS9 BAUA 261101 GP-01 Grundriss.pdf', zeit('2026-11-02T09:00')),
    d('BS9 BAUA 261102 Antragsprotokoll.pdf', zeit('2026-11-02T11:00')),
    d('_Archiv/alt.pdf', zeit('2026-10-01T10:00')),
    d('BS9 BAUA 261105 GP-02 Schnitt.pdf', zeit('2026-11-05T10:00')),
  ];
  it('hält Name, Größe und Änderungszeit fest – keine Kopie; was erst nach dem Tag geändert wurde, gehört nicht dazu', () => {
    const s = standAus(liste, tag);
    expect(s.tag).toBe(tag);
    // verlustfrei: alle Dateien (ohne Archiv); zur Einreichung gehört nur, was nicht erst danach geändert wurde
    expect(s.dateien.map((x) => x.pfad)).toEqual(['BS9 BAUA 261101 01 Bauantrag.pdf', 'BS9 BAUA 261101 GP-01 Grundriss.pdf', 'BS9 BAUA 261102 Antragsprotokoll.pdf', 'BS9 BAUA 261105 GP-02 Schnitt.pdf']);
    expect(imStand(s).map((x) => x.pfad)).toEqual(['BS9 BAUA 261101 01 Bauantrag.pdf', 'BS9 BAUA 261101 GP-01 Grundriss.pdf', 'BS9 BAUA 261102 Antragsprotokoll.pdf']);
    // ein späterer Tag nimmt ihn wieder auf (umkehrbar)
    expect(imStand({ ...s, tag: '2026-11-05' }).map((x) => x.pfad)).toContain('BS9 BAUA 261105 GP-02 Schnitt.pdf');
    expect(s.dateien[0]).toEqual({ pfad: 'BS9 BAUA 261101 01 Bauantrag.pdf', groesse: 10, geaendert: zeit('2026-11-01T10:00') });
  });
  it('neu bzw. geändert seit der Einreichung – Bescheid, Eingangsbestätigung und Nachforderung nicht', () => {
    const s = standAus(liste, tag);
    expect(seitEinreichung(liste[0], s)).toBeNull();
    expect(seitEinreichung(liste[4], s)).toBe('neu');
    expect(seitEinreichung({ ...liste[0], groesse: 11 }, s)).toBe('geaendert');
    expect(seitEinreichung({ ...liste[0], geaendert: liste[0].geaendert + 60_000 }, s)).toBe('geaendert');
    expect(seitEinreichung({ ...liste[0], geaendert: liste[0].geaendert + 1000 }, s)).toBeNull();
    for (const n of ['BS9 BAUA 261120 Baugenehmigung.pdf', 'Bescheid.pdf', 'Eingangsbestätigung.pdf', 'Empfangsbestaetigung.pdf', 'Nachforderung.pdf'])
      expect(seitEinreichung(d(n, zeit('2026-11-20T10:00')), s, { codes })).toBeNull();
    // im Zweifel „neu“: eine Bauvorlage zur Nachforderung (Statik) ist nachgereicht und muss auffallen
    expect(seitEinreichung(d('Nachforderung Statik.pdf', zeit('2026-11-20T10:00')), s, { codes })).toBe('neu');
    // „Genehmigungsplanung“ ist keine Genehmigung; Antragsunterlagen gelten nie als erwartet
    expect(seitEinreichung(d('BS9 BAUA 261120 Genehmigungsplanung.pdf', zeit('2026-11-20T10:00')), s, { codes })).toBe('neu');
    for (const n of ['HVO BAUVA 261110 01 Antrag auf Vorbescheid.pdf', 'HVO BAUF 261110 Genehmigungsfreistellung.pdf', 'Antrag auf Baugenehmigung.pdf', 'Antrag auf denkmalrechtliche Erlaubnis.pdf'])
      expect(seitEinreichung(d(n, zeit('2026-11-20T10:00')), s)).toBe('neu');
    // die Entscheidung bei Vorbescheid, DENK und ABGE ist erwartet, ebenso die Mitteilung der Gemeinde (BAUF)
    for (const n of ['Vorbescheid.pdf', 'Denkmalrechtliche Erlaubnis.pdf', 'Abgeschlossenheitsbescheinigung.pdf', 'Aufteilungsplan gesiegelt.pdf', 'Mitteilung der Gemeinde.pdf', 'Nachforderung Kreis.pdf'])
      expect(erw(n), n).toBe(true);
    // so heißt auch das Schreiben der Behörde; dazu Vollständigkeitsmitteilung (§ 71), genehmigte Bauvorlagen
    // (Genehmigungsvermerk), ein Bescheid – auch „zum Bauantrag“ – und Mitteilung bzw. Erklärung der Stadt (BAUF)
    for (const n of [
      'HVO BAUA 261120 Nachforderung von Unterlagen.pdf',
      'Vollständigkeitsmitteilung.pdf',
      'Vollstaendigkeitsbestaetigung Kreis.pdf',
      'Genehmigte Bauvorlagen.pdf',
      'GP-01 Grundriss mit Genehmigungsvermerk.pdf',
      'Bescheid zum Bauantrag.pdf',
      'Bescheid über den Bauantrag.pdf',
      'Mitteilung der Stadt.pdf',
      'Erklärung der Gemeinde.pdf',
      // Fiktionsbescheinigung (§ 74 Abs. 3 Satz 1 Nr. 4 BauO NRW 2018) und Unterrichtung über die Vollständigkeit
      'Fiktionsbescheinigung.pdf',
      'Mitteilung über die Vollständigkeit.pdf',
      'Unterrichtung Vollstaendigkeit.pdf',
      'Aufteilungspläne gesiegelt.pdf',
      'Ablehnung.pdf',
      'Anhörung vor Ablehnung.pdf',
      // der Bezug auf den Antrag ist keine Antragsunterlage; Bindestriche wie Leerzeichen
      'Mitteilung der Gemeinde an den Bauherrn.pdf',
      'Bescheid-zum-Bauantrag.pdf',
      'Genehmigung Bauantrag.pdf',
      'Ablehnung Bauantrag.pdf',
      'Gebührenbescheid Bauantrag.pdf',
      'Gebührenfestsetzung.pdf',
      'Bescheid zur Bauvoranfrage.pdf',
    ])
      expect(erw(n), n).toBe(true);
    // eingereichte bzw. nachgereichte Unterlagen des Büros fallen auf: ungesiegelter Aufteilungsplan, Typengenehmigung,
    // Unterlagen zur Nachforderung, eine beigefügte Genehmigung des Bestands, der Antrag auf Vorbescheid
    for (const n of [
      'HVO ABGE 261110 AB-01 Aufteilungsplan EG.pdf',
      'Typengenehmigung Garage.pdf',
      'Unterlagen zur Nachforderung.pdf',
      'Nachreichung auf Nachforderung.pdf',
      'Antwort Nachforderung.pdf',
      'Baugenehmigung Bestand 1972.pdf',
      'Bestandsgenehmigung.pdf',
      'Antrag auf Vorbescheid.pdf',
      // jede Schreibweise des Antrags geht vor dem Wort „Vorbescheid“
      'Antrag Vorbescheid.pdf',
      'Vorbescheidsantrag.pdf',
      'Vorbescheid Antrag.pdf',
      'Antrag_auf_Vorbescheid.pdf',
      'Verlängerungsantrag Vorbescheid.pdf',
      'Fragestellung Vorbescheid.pdf',
      // Schreiben des Büros: nachgereicht, Ergänzung, Verzicht auf die Fiktion, Mitteilung an die Stadt, Stadtwerke
      'Nachgereichte Unterlagen Nachforderung.pdf',
      'Ergänzung Nachforderung.pdf',
      'Anschreiben Nachforderung.pdf',
      'Verzicht auf Genehmigungsfiktion.pdf',
      'Mitteilung an die Stadt Baubeginn.pdf',
      'Erklärung Stadtwerke Anschluss.pdf',
      'Unterlagen Nachforderung.pdf',
      // Bauvorlagen, Plannummern und Antragsunterlagen gehen vor jedem Behördenwort (im Zweifel „neu“)
      'BS9 BAUA 261120 GP-03 Ansicht Nachforderung.pdf',
      'BS9 BAUA 261120 Lageplan Nachforderung.pdf',
      'Baubeschreibung Nachforderung.pdf',
      'Stellplatznachweis Nachforderung.pdf',
      'Lageplan nach Nachforderung.pdf',
      'Lageplan aufgrund Nachforderung.pdf',
      'Bauantrag Nachforderung.pdf',
      'Antrag Fiktionsbescheinigung.pdf',
      'Bauantrag Vollständigkeit.pdf',
      'Antrag Mitteilung Gemeinde.pdf',
      'Stellungnahme zur Anhörung.pdf',
      'Antwort Anhörung.pdf',
      'Erwiderung Anhörung.pdf',
      // Bestand, auch mit Endung und Unterstrichen; Fragen; Checkliste; Baulast, Entwurfsverfasser
      'Baugenehmigung von 1972.pdf',
      'Baugenehmigung_von_1972.pdf',
      'Baugenehmigung aus 1985.pdf',
      'Altgenehmigung.pdf',
      'Fragen zum Vorbescheid.pdf',
      'Fragenkatalog Vorbescheid.pdf',
      'Checkliste Vollständigkeit.pdf',
      'Erklärung Entwurfsverfasser Stadt.pdf',
      'Baulasterklärung Stadt.pdf',
      'Mitteilung-an-die-Stadt.pdf',
      // Runde 11: beglaubigt/gesiegelt nur bei Aufteilungsplänen, Versiegelung, Bestand mit „genehmigt“ oder Jahr,
      // Satzzeichen, Bauvorlagen nach BauPrüfVO, Ausnahmen überall
      'Flurkarte beglaubigt.pdf',
      'Amtlicher Lageplan gesiegelt.pdf',
      'Baulasterklärung beglaubigt.pdf',
      'Bestandsgenehmigung beglaubigt.pdf',
      'Nachweis versiegelte Flächen.pdf',
      'Nachweis Flächenversiegelung.pdf',
      'BS9 BAUA 261120 Versiegelungsberechnung.pdf',
      'Entsiegelungsnachweis.pdf',
      'Grundbuchauszug beglaubigt.pdf',
      'Beglaubigte Vollmacht Bauherr.pdf',
      'Aufteilungsplan ungesiegelt.pdf',
      'Lageplan ungestempelt.pdf',
      'Grundriss nicht genehmigt.pdf',
      'Genehmigter Bestand.pdf',
      'Nachweis genehmigter Bestand.pdf',
      'Bestandspläne genehmigt.pdf',
      'Grundriss genehmigt 1972.pdf',
      'Gegenüberstellung genehmigt geplant.pdf',
      'Baugenehmigung vom 12.05.1972.pdf',
      'Baugenehmigung 1972.pdf',
      'Baugenehmigung (1972).pdf',
      'Unterlagen - Nachforderung.pdf',
      'Unterlagen (Nachforderung).pdf',
      'Unterlagen zum Bauantrag Nachforderung.pdf',
      'Baulasterklärung Nachforderung.pdf',
      'Mitteilung an die Stadt Nachforderung.pdf',
      'Erklärung Entwurfsverfasser Nachforderung.pdf',
      'Nachforderung Flurkarte.pdf',
      'Brandschutzkonzept Nachforderung.pdf',
      'Übereinstimmungserklärung Nachforderung.pdf',
      'Gutachten Nachforderung.pdf',
      'Widerspruch gegen Gebührenbescheid.pdf',
      'Genehmigungsunterlagen.pdf',
      // Schreiben der Behörde mit weiteren Wörtern: im Zweifel nachgereicht
      'Nachforderung Brandschutz Stellplätze.pdf',
    ])
      expect(erw(n), n).toBe(false);
    // Gegenproben: das Schreiben der Behörde mit Behörde, Datum, Code, Aktenzeichen
    for (const n of [
      'Aufteilungspläne gesiegelt.pdf',
      'Grundriss genehmigt.pdf',
      'Baugenehmigung 2026.pdf',
      'Baugenehmigung vom 12.11.2026.pdf',
      'BS9 BAUA 261120 Nachforderung Kreis.pdf',
      'Nachforderung Bauaufsicht 12.11.2026.pdf',
      'Anhörung vor Ablehnung.pdf',
      'Nachforderung zum Bauantrag.pdf',
      'Anhörung zum Bauantrag.pdf',
      'Fiktionsbescheinigung zum Bauantrag.pdf',
      'Bescheinigung Genehmigungsfiktion.pdf',
      'Baugenehmigung Az 2050-26.pdf',
      'Baugenehmigung Az. 63-1234-26.pdf',
      'Mitteilung der Gemeinde an den Bauherrn.pdf',
      // Runde 13: Trennzeichen, Mehrzahl, Schreiben, zweistelliges Jahr, NFD-Umlaute, weitere Bescheide
      'BS9_BAUA_261110_Nachforderung.pdf',
      'BS9-BAUA-261110-Nachforderung.pdf',
      'Nachforderung_BS9.pdf',
      'Baugenehmigung (Az. 63-1234-26).pdf',
      'Bauvorbescheid.pdf',
      'Nachforderungen.pdf',
      'Anhörungsschreiben.pdf',
      'Aufforderungsschreiben.pdf',
      'Nachforderung vom 10.11.26.pdf',
      'Anhörung.pdf'.normalize('NFD'),
      'Gebührenbescheid.pdf'.normalize('NFD'),
      'Verlängerungsbescheid.pdf',
      'Abweichungsbescheid.pdf',
      'Bescheinigung über den Eintritt der Genehmigungsfiktion.pdf',
      'Bestätigung der Vollständigkeit.pdf',
      'Rückgabe der Unterlagen.pdf',
      'Baugenehmigung mit Nebenbestimmungen.pdf',
      // genehmigte Bauvorlagen mit Geschoss, Richtung, Plannummer, Bauvorlage nach BauPrüfVO
      'Grundriss EG genehmigt.pdf',
      'GP-03 Grundriss OG genehmigt.pdf',
      'genehmigt Ansicht Nord.pdf',
      'Grünstempel Schnitt A-A.pdf',
      'Baubeschreibung genehmigt.pdf',
      // Runde 14: feste Wendungen, des Bauantrags, Verlängerung im Bescheid, Monat der Einreichung, achtstelliges Datum
      'Aufforderung zur Behebung der Mängel.pdf',
      'Nachforderung zur Behebung der Mängel.pdf',
      'Aufforderung zur Mängelbeseitigung.pdf',
      'Baugenehmigung mit Anlagen.pdf',
      'Genehmigung des Bauantrags.pdf',
      'Ablehnung des Bauantrags.pdf',
      'Bescheid über die Verlängerung.pdf',
      'Nachforderung 11-2026.pdf',
      'Baugenehmigung 20261120.pdf',
      // ein Aktenzeichen ohne „Az“ mit dem Jahr der Einreichung am Ende ist kein Datum
      'Baugenehmigung 63-12-26.pdf',
      'Baugenehmigung Az 63-2015-26.pdf',
      // steht am Ende das Jahr der Einreichung, sind die Zahlen davor laufende Nummern
      'Baugenehmigung Az 1950-26.pdf',
      'Baugenehmigung 63-1934-2026.pdf',
      'Nachforderung Az 63-1912-26.pdf',
      // Runde 15: Vollständigkeit mit Bescheinigung, Verlängerung im Bescheid, Mängelbeseitigung hinter der Nachforderung
      'Bescheinigung über die Vollständigkeit.pdf',
      'Bescheinigung der Vollständigkeit.pdf',
      'BS9 BAUA 261110 Bescheinigung über die Vollständigkeit.pdf',
      'Bescheid über die Verlängerung des Vorbescheids.pdf',
      'Nachforderung zur Mängelbeseitigung.pdf',
    ])
      expect(erw(n), n).toBe(true);
    // Projektnummern mit Bindestrich oder Unterstrich als Projektcode (Vorgabe der Suite: {jahr}-{nr:3})
    for (const [n, code] of [
      ['2025-014 BAUA 261110 Nachforderung.pdf', '2025-014'],
      ['2025-014 BAUA 261120 Baugenehmigung.pdf', '2025-014'],
      ['2025_014 BAUA 261120 Baugenehmigung.pdf', '2025-014'],
      ['2026-14 Nachforderung.pdf', '2026-14'],
      ['2026-5 Baugenehmigung.pdf', '2026-5'],
      ['BS-9 Nachforderung.pdf', 'BS-9'],
      ['H-24 Baugenehmigung.pdf', 'H 24'],
    ])
      expect(nachEinreichungErwartet(n, { codes: [code], tag: '2026-11-03' }), n).toBe(true);
    // Runde 12: nur Füllwörter zählen – alles andere ist nachgereicht (im Zweifel „neu“)
    for (const n of [
      // Ortsnamen nach Kreis/Stadt sind nicht erkennbar von einer Bauvorlage zu unterscheiden
      'Nachforderung Kreis Brandschutz.pdf',
      'Nachforderung Stadt Stellplätze.pdf',
      'Erklärung der Gemeinde Stellplätze.pdf',
      'BS9 BAUA 261120 Nachforderung Kreis Viersen.pdf',
      // an die Behörde, von der Bauherrschaft
      'Schreiben an das Bauamt Nachforderung.pdf',
      'Mitteilung an Bauamt Nachforderung.pdf',
      'Schreiben an Kreis Viersen Nachforderung.pdf',
      'Erklärung Bauherr Nachforderung.pdf',
      'Erklärung der Bauherrschaft Fiktion.pdf',
      'Mitteilung des Bauherrn zur Fiktion.pdf',
      'Vollständigkeitserklärung Bauherr.pdf',
      // Antrag, Änderung, Tektur, Nachtrag zur genehmigten Planung
      'Antrag auf Änderung der genehmigten Planung.pdf',
      'Nachtrag zur genehmigten Planung.pdf',
      'Tektur genehmigte Planung.pdf',
      'Brandschutzkonzept zur genehmigten Planung.pdf',
      // Bestand mit älterem Jahr bzw. Datum, frühere Genehmigung
      'Baugenehmigung von 2003.pdf',
      'Baugenehmigung vom 12.05.2015.pdf',
      'Baugenehmigung 2008.pdf',
      'Bestandsbaugenehmigung.pdf',
      'Frühere Baugenehmigung.pdf',
      'Baugenehmigung Altbau.pdf',
      'Baugenehmigung Umbau Bestand.pdf',
      // Kürzel, Plannummern ohne Trennzeichen, Dokumentnummer, § 6 BauPrüfVO, Zustimmungen
      'BSK Nachforderung.pdf',
      'GEG Nachforderung.pdf',
      'BS9 BAUA 261120 GP03 Nachforderung.pdf',
      'BS9 BAUA 261120 03 Nachforderung.pdf',
      'Herstellungskosten Gebühr.pdf',
      'Rohbauwert Gebühr.pdf',
      'Zustimmung Eigentümer Genehmigung.pdf',
      // CamelCase, Punkte, Verneinung
      'NachforderungBrandschutz.pdf',
      'Nachforderung.Wärmeschutz.pdf',
      'Grundriss ohne Grünstempel.pdf',
      'Grundriss kein Genehmigungsvermerk.pdf',
      // Runde 13: eine Jahreszahl vor der Einreichung im Aktenzeichen bzw. mit Bindestrich meint einen Bestand
      'Baugenehmigung Az. 63-1999-0815.pdf',
      'Baugenehmigung Nr. 1972.pdf',
      'Baugenehmigung 12-05-1972.pdf',
      'Baugenehmigung vom 12-05-1972.pdf',
      'Baugenehmigung 1972-05.pdf',
      'Baugenehmigung 05-1972.pdf',
      'Genehmigung 12-05-72.pdf',
      'Baugenehmigung 720512.pdf',
      // „Bescheinigung“ allein, Kernwörter mit Endungen des Büros
      'Bescheinigung.pdf',
      'HVO BAUA 261201 Bescheinigung.pdf',
      'Bescheinigung Kreis.pdf',
      'Gebührenübernahmeerklärung.pdf',
      'Gebührenberechnung.pdf',
      'Vollständigkeitserklärung.pdf',
      'Vollständigkeitscheckliste.pdf',
      // „Antrag“ nach der Genehmigung ist der Antrag selbst
      'Baugenehmigung Antrag.pdf',
      'Baugenehmigung Antragsunterlagen.pdf',
      'Teilbaugenehmigung Antrag.pdf',
      'Genehmigungsfiktion Antrag.pdf',
      // Verlängerung ohne Bescheid, Nachreichung zum Nachweis
      'Verlängerung Baugenehmigung.pdf',
      'Nachreichung zum Antragsprotokoll.pdf',
      // Runde 14: Anlagen, Mängelbeseitigung und Bescheinigungen zu einem Schreiben sind die Antwort des Büros
      'Anlagen zur Nachforderung.pdf',
      'HVO BAUA 261120 Anlagen zur Nachforderung.pdf',
      'Nachforderung Anlagen.pdf',
      'Anlage zur Nachforderung.pdf',
      'Anlagen zur Anhörung.pdf',
      'Antragsprotokoll Anlagen.pdf',
      'Mängelbeseitigung Nachforderung.pdf',
      'Mängelbeseitigung zur Nachforderung.pdf',
      'Nachforderung Mängelbeseitigung.pdf',
      'Mängel Nachforderung.pdf',
      'Mängel Anhörung.pdf',
      'Bescheinigung zur Nachforderung.pdf',
      'Bescheinigung Nachforderung.pdf',
      // zweistellige Jahresangabe vor der Einreichung im Aktenzeichen
      'Baugenehmigung Az 63-1234-72.pdf',
      'Baugenehmigung Nr. 815-72.pdf',
      'Genehmigung Az 63-12-85.pdf',
      // Standsicherheitsnachweise erhalten keinen Genehmigungsvermerk; Buchstaben und Zahlen nur als Schnitt bzw. Plannummer
      'genehmigt Statik.pdf',
      'Grundriss genehmigt b.pdf',
      'Plan genehmigt 999.pdf',
      // Runde 15: „Behebung der Mängel“ und „mit Anlagen“ nur hinter dem Schreiben der Behörde
      'Behebung der Mängel zur Nachforderung.pdf',
      'Zur Behebung der Mängel Nachforderung vom 10.11.2026.pdf',
      'Behebung der Mängel Nachforderung.pdf',
      'Behebung der Mängel zur Anhörung.pdf',
      'HVO BAUA 261120 Behebung der Mängel Nachforderung.pdf',
      'Antragsprotokoll Behebung der Mängel.pdf',
      'Eingangsbestätigung Behebung der Mängel.pdf',
      'Behebung der Mängel Baugenehmigung.pdf',
      'Mit Anlagen Nachforderung.pdf',
      'Antragsprotokoll mit Anlagen.pdf',
      'Eingangsbestätigung mit Anlagen.pdf',
      // Präposition vor dem Kernwort: die Bezeichnung des Büros
      'zur Genehmigung.pdf',
      'HVO BAUA 261120 zur Genehmigung.pdf',
      'für die Genehmigung.pdf',
      'vor Genehmigung.pdf',
      'zur Baugenehmigung.pdf',
      'gem. Nachforderung.pdf',
      'gemäß Nachforderung vom 20.11.2026.pdf',
      'Zur Nachforderung.pdf',
      'Auf Nachforderung.pdf',
      // Verlängerung zum Vorbescheid kann der Antrag sein; Jahr-Nummer ohne „Az“; ein neues Antragsprotokoll
      'Vorbescheid Verlängerung.pdf',
      'Baugenehmigung 1972-26.pdf',
      'Antragsprotokoll.pdf',
      'Antragsprotokoll Bauportal.pdf',
    ])
      expect(erw(n), n).toBe(false);
    expect(seitEinreichung(d('HVO ABGE 261110 AB-01 Aufteilungsplan EG.pdf', zeit('2026-11-20T10:00')), s)).toBe('neu');
    expect(seitEinreichung(liste[4], undefined)).toBeNull();
  });
  it('entfernt seit der Einreichung: eingereichte Dateien auf oberster Ebene, die fehlen – der Nachweis der Einreichung nicht', () => {
    const s = {
      tag,
      dateien: [{ pfad: 'BS9 BAUA 261101 01 Bauantrag.pdf' }, { pfad: 'Plaene/GP-01.pdf' }, { pfad: 'BS9 BAUA 261102 Antragsprotokoll.pdf' }, { pfad: 'Lageplan.pdf' }, { pfad: 'Fragestellung Vorbescheid.pdf' }],
    };
    // auch eine eingereichte Datei mit „Behördenwort“ im Namen zählt
    expect(entferntSeitEinreichung(['lageplan.PDF'], s).map((x) => x.pfad)).toEqual(['BS9 BAUA 261101 01 Bauantrag.pdf', 'Fragestellung Vorbescheid.pdf']);
    expect(entferntSeitEinreichung([], undefined)).toEqual([]);
    // Hilfsdateien (auch aus einem älteren Stand) zählen nie
    expect(entferntSeitEinreichung([], { tag, dateien: [{ pfad: 'Thumbs.db' }, { pfad: 'desktop.ini' }, { pfad: '~$Bauantrag.docx' }] })).toEqual([]);
    expect(standAus([d('Thumbs.db', zeit('2026-11-01T10:00')), d('desktop.ini', zeit('2026-11-01T10:00')), d('Lageplan.pdf', zeit('2026-11-01T10:00'))], tag).dateien.map((x) => x.pfad)).toEqual(['Lageplan.pdf']);
  });
  it('eingereichte Dateien werden immer verglichen – die Namensregel gilt nur für neue', () => {
    const s = { tag, dateien: [{ pfad: 'Vorbescheid 1998.pdf', groesse: 5 }, { pfad: 'BS9 BAUA 261102 Antragsprotokoll.pdf', groesse: 5 }] };
    expect(seitEinreichung({ pfad: 'Vorbescheid 1998.pdf', groesse: 6 }, s)).toBe('geaendert');
    // der Nachweis der Einreichung selbst nicht
    expect(seitEinreichung({ pfad: 'BS9 BAUA 261102 Antragsprotokoll.pdf', groesse: 6 }, s)).toBeNull();
    // neu: nur, wenn nicht erwartet
    expect(seitEinreichung({ pfad: 'Vorbescheid.pdf', groesse: 1 }, s)).toBeNull();
    expect(seitEinreichung({ pfad: 'Lageplan.pdf', groesse: 1 }, s)).toBe('neu');
  });
  it('der Nachweis der Einreichung: im Stand oder vom Tag der Einreichung nie „neu“ – ein späteres Protokoll schon', () => {
    const s = { tag: '2026-11-03', dateien: [{ pfad: 'BS9 BAUA 261101 01 Bauantrag.pdf', groesse: 1, geaendert: zeit('2026-11-01T10:00') }, { pfad: 'BS9 BAUA 261103 Antragsprotokoll.pdf', groesse: 1, geaendert: zeit('2026-11-03T10:00') }] };
    // A: im Stand, erst nach dem Tag noch einmal gespeichert (fällt beim Vergleich aus dem Stand) – bleibt unauffällig
    expect(seitEinreichung(d('BS9 BAUA 261103 Antragsprotokoll.pdf', zeit('2026-11-05T10:00')), s)).toBeNull();
    // B: nicht im Stand, trägt aber den Tag der Einreichung (am Folgetag gespeichert) bzw. einen früheren
    expect(seitEinreichung(d('BS9 BAUA 261103 Eingangsbestätigung.pdf', zeit('2026-11-04T09:00')), s)).toBeNull();
    expect(seitEinreichung(d('BS9 BAUA 261102 Antragsprotokoll Bauportal.pdf', zeit('2026-11-04T09:00')), s)).toBeNull();
    // C: ein späteres Protokoll (erneute Einreichung) bzw. eines ohne Datum ist neu
    expect(seitEinreichung(d('BS9 BAUA 261120 Antragsprotokoll.pdf', zeit('2026-11-20T09:00')), s)).toBe('neu');
    expect(seitEinreichung(d('Antragsprotokoll.pdf', zeit('2026-11-20T09:00')), s)).toBe('neu');
  });
  it('Präposition vor dem Kernwort: nach einem Schreiben der Behörde mit Datum bleibt es erwartet', () => {
    const o = { codes: ['BS9', 'HVO'], tag };
    expect(nachEinreichungErwartet('Gebührenbescheid vom 20.11.2026 zur Baugenehmigung.pdf', o)).toBe(true);
    expect(nachEinreichungErwartet('Gebührenbescheid 261120 zur Baugenehmigung.pdf', o)).toBe(true);
    expect(nachEinreichungErwartet('Gebührenbescheid Az 63-1234-26 zur Baugenehmigung.pdf', o)).toBe(true);
    expect(nachEinreichungErwartet('Kostenfestsetzung BAUA zur Baugenehmigung.pdf', o)).toBe(true);
    expect(nachEinreichungErwartet('Anhörung vom 20.11.2026 vor Ablehnung.pdf', o)).toBe(true);
    expect(nachEinreichungErwartet('Bescheid über die Verlängerung der Geltungsdauer der Baugenehmigung.pdf', o)).toBe(true);
    expect(nachEinreichungErwartet('Verlängerung der Geltungsdauer.pdf', o)).toBe(false);
    expect(nachEinreichungErwartet('zur Baugenehmigung vom 20.11.2026.pdf', o)).toBe(false);
  });
});

describe('Schlüssel eines Formulars (Sammelprojekt)', () => {
  it('Pfad ab dem Projektordner: im Stammordner der Dateiname, im Unterordner mit ihm', () => {
    expect(formularSchluessel('BS9/001-Muster.frmsjf')).toBe('001-Muster.frmsjf');
    expect(formularSchluessel('BS9/2. BAUA/002-Bauantrag.frmsjf')).toBe('2. BAUA/002-Bauantrag.frmsjf');
    // ohne Projekt (einzeln geöffnet): der Dateiname
    expect(formularSchluessel('Formular.frmsjf')).toBe('Formular.frmsjf');
  });
  it('Zuordnung im Antragsumfang: genau das Formular; eine ältere nur mit Dateinamen findet es auch im Unterordner', () => {
    const formulare = [
      { pfad: 'BS9/2. BAUA/002-Bauantrag.frmsjf', name: '002-Bauantrag' },
      { pfad: 'BS9/002-Bauantrag.frmsjf', name: '002-Bauantrag' },
    ];
    // Titel passt zu keinem Formularnamen – gefunden wird nur über die Zuordnung
    const u = (formularDatei: string): UmfangEintrag => ({ id: 'b', titel: 'Statik', art: 'intern', formularDatei });
    expect(formularVon(u('002-Bauantrag.frmsjf'), formulare)?.pfad).toBe('BS9/002-Bauantrag.frmsjf');
    expect(formularVon(u('2. BAUA/002-Bauantrag.frmsjf'), formulare)?.pfad).toBe('BS9/2. BAUA/002-Bauantrag.frmsjf');
    expect(formularVon(u('002-Bauantrag.frmsjf'), [formulare[0]])?.pfad).toBe('BS9/2. BAUA/002-Bauantrag.frmsjf');
    // ein Schlüssel mit Unterordner (eines anderen Antrags) findet nicht über den bloßen Dateinamen ein anderes
    expect(formularVon(u('3. BAUA/002-Bauantrag.frmsjf'), [formulare[1]])).toBeNull();
  });
});

describe('Quick-Add: Titel und Nummer aus dem Dateinamen', () => {
  const codes = ['HVO', 'BS 9'];
  it('im Namensformat: die Bezeichnung als Titel, eine Dokumentnummer als Nr.', () => {
    expect(aufnahmeVorschlag('HVO BAUA 261110 05 Brandschutzkonzept.pdf', { codes })).toEqual({ titel: 'Brandschutzkonzept', nr: '05' });
    expect(aufnahmeVorschlag('HVO BAUA 261110 Baubeschreibung Teil 2.pdf', { codes })).toEqual({ titel: 'Baubeschreibung Teil 2' });
    // mehrteiliger Projektcode; Index klein
    expect(aufnahmeVorschlag('BS 9 BAUA 261110 03a Statik.pdf', { codes })).toEqual({ titel: 'Statik', nr: '03a' });
  });
  it('eine Plannummer wird keine Nr.', () => {
    expect(aufnahmeVorschlag('HVO BAUA 261110 GP-04 Grundriss OG.pdf', { codes })).toEqual({ titel: 'Grundriss OG' });
  });
  it('ohne Namensformat (kein Projektcode, kein Datum, keine Bezeichnung): der Name ohne Endung', () => {
    expect(aufnahmeVorschlag('Lageplan vom Vermesser.pdf', { codes })).toEqual({ titel: 'Lageplan vom Vermesser' });
    expect(aufnahmeVorschlag('HVO Statik.pdf', { codes })).toEqual({ titel: 'HVO Statik' });
    expect(aufnahmeVorschlag('HVO BAUA 261110.pdf', { codes })).toEqual({ titel: 'HVO BAUA 261110' });
    expect(aufnahmeVorschlag('HVO BAUA 261110 05 Brandschutz.pdf', { codes: [] })).toEqual({ titel: 'HVO BAUA 261110 05 Brandschutz' });
  });
  it('nach der Reihenfolge des Namensschemas', () => {
    expect(aufnahmeVorschlag('HVO 261110 BAUA 05 Brandschutzkonzept.pdf', { codes, reihenfolge: ['code', 'datum', 'art', 'nummer'] })).toEqual({ titel: 'Brandschutzkonzept', nr: '05' });
  });
});

describe('Umbenennen nach Namensformat', () => {
  const datum = new Date(2026, 10, 12);
  // Kürzel und Plannummern nach dem Vorgabe-Namensschema (BP … AB, BAUA, BAUVA/BVA …)
  const o = { codes: ['HVO'], art: 'BAUA', datum };
  it('verschobener Plan: nur die Phase an der Stelle der Antragsart wird ersetzt – die Plannummer bleibt', () => {
    expect(nameNachFormat('HVO GP 261111 GP-04 Grundriss OG.pdf', o)).toBe('HVO BAUA 261111 GP-04 Grundriss OG.pdf');
    expect(nameNachFormat('hvo bva 261111 01 Bauantrag.pdf', o)).toBe('hvo BAUA 261111 01 Bauantrag.pdf');
    expect(antragsNameFehler(nameNachFormat('HVO GP 261111 GP-04 Grundriss OG.pdf', o), o)).toBeNull();
  });
  it('sonst kommen Projektcode, Antragsart und Datum nach dem Namensschema davor', () => {
    expect(nameNachFormat('Lageplan vom Vermesser.pdf', o)).toBe('HVO BAUA 261112 Lageplan vom Vermesser.pdf');
    // ein unbekanntes Wort an der Stelle der Antragsart wird nicht ersetzt
    expect(nameNachFormat('HVO Entwurf 261111 Lageplan.pdf', o)).toBe('HVO BAUA 261112 Entwurf 261111 Lageplan.pdf');
    // Code und Antragsart da, nur das Datum fehlt: kein doppelter Kopf
    expect(nameNachFormat('HVO BAUA Bauantrag.pdf', o)).toBe('HVO BAUA 261112 Bauantrag.pdf');
    expect(nameNachFormat('HVO GP Grundriss.pdf', o)).toBe('HVO BAUA 261112 Grundriss.pdf');
    expect(nameNachFormat('Lageplan.pdf', { ...o, reihenfolge: ['datum', 'code', 'art', 'nummer'] })).toBe('261112 HVO BAUA Lageplan.pdf');
  });
  it('was am Anfang schon steht (auch verrutscht), wird übernommen statt verdoppelt', () => {
    expect(nameNachFormat('HVO 261111 Bauantrag.pdf', o)).toBe('HVO BAUA 261111 Bauantrag.pdf');
    expect(nameNachFormat('BAUA 261111 Bauantrag.pdf', o)).toBe('HVO BAUA 261111 Bauantrag.pdf');
    expect(nameNachFormat('261111 Bauantrag.pdf', o)).toBe('HVO BAUA 261111 Bauantrag.pdf');
    expect(nameNachFormat('BAUA HVO 261111 01 Bauantrag.pdf', o)).toBe('HVO BAUA 261111 01 Bauantrag.pdf');
    expect(nameNachFormat('GP 261111 GP-01 Grundriss.pdf', o)).toBe('HVO BAUA 261111 GP-01 Grundriss.pdf');
    // ein ungültiges Datum ist Bezeichnung
    expect(nameNachFormat('261340 Bauantrag.pdf', o)).toBe('HVO BAUA 261112 261340 Bauantrag.pdf');
  });
  it('nur eine echte Plannummer kommt von hinten an ihre Stelle – Zahlen in der Bezeichnung bleiben', () => {
    expect(nameNachFormat('Statik Teil 2.pdf', o)).toBe('HVO BAUA 261112 Statik Teil 2.pdf');
    expect(nameNachFormat('Anlage 3 Baubeschreibung.pdf', o)).toBe('HVO BAUA 261112 Anlage 3 Baubeschreibung.pdf');
    expect(nameNachFormat('Lageplan M 1 500.pdf', o)).toBe('HVO BAUA 261112 Lageplan M 1 500.pdf');
    expect(nameNachFormat('Grundriss OG2 Ansicht.pdf', o)).toBe('HVO BAUA 261112 Grundriss OG2 Ansicht.pdf');
    expect(nameNachFormat('Grundriss EG GP-02.pdf', o)).toBe('HVO BAUA 261112 GP-02 Grundriss EG.pdf');
    // eine Dokumentnummer als erstes Wort der Bezeichnung
    expect(nameNachFormat('01 Bauantrag.pdf', o)).toBe('HVO BAUA 261112 01 Bauantrag.pdf');
    // mehrere Plannummern: keine wird herausgezogen
    expect(nameNachFormat('Lageplan zu GP-02 und GP-03.pdf', o)).toBe('HVO BAUA 261112 Lageplan zu GP-02 und GP-03.pdf');
  });
  it('ein Kürzel klein geschrieben zählt nur an der Stelle der Antragsart – sonst ist es ein Wort der Bezeichnung', () => {
    expect(nameNachFormat('Entw Grundriss.pdf', o)).toBe('HVO BAUA 261112 Entw Grundriss.pdf');
    expect(nameNachFormat('Ab 2027 Nutzung.pdf', o)).toBe('HVO BAUA 261112 Ab 2027 Nutzung.pdf');
    expect(nameNachFormat('hvo bva 261111 01 Bauantrag.pdf', o)).toBe('hvo BAUA 261111 01 Bauantrag.pdf');
    expect(nameNachFormat('ENTW Grundriss.pdf', o)).toBe('HVO BAUA 261112 Grundriss.pdf');
    // auch wenn die Antragsart im Schema vorn steht: ohne weiteren Kopfteil bleibt das Wort
    for (const reihenfolge of [
      ['art', 'code', 'datum', 'nummer'],
      ['nummer', 'art', 'code', 'datum'],
      ['art', 'datum', 'code', 'nummer'],
    ] as ('code' | 'art' | 'datum' | 'nummer')[][]) {
      for (const name of ['Entw Grundriss.pdf', 'Denk Mal.pdf', 'Ab 2027 Nutzung.pdf'])
        expect(nameNachFormat(name, { ...o, reihenfolge }).replace(/\.pdf$/, '').split(' ')).toContain(name.split(' ')[0]);
      // mit Datum daneben zählt es als Kürzel
      expect(nameNachFormat('bva 261111 Antrag.pdf', { ...o, reihenfolge })).not.toContain('bva');
    }
    // verrutscht vor dem Projektcode: kein doppelter Kopf; ein Projektcode weiter hinten wird herausgenommen
    expect(nameNachFormat('bva HVO 261111 Antrag.pdf', o)).toBe('HVO BAUA 261111 Antrag.pdf');
    expect(nameNachFormat('261111 bva HVO Antrag.pdf', o)).toBe('HVO BAUA 261111 Antrag.pdf');
    expect(nameNachFormat('Entw HVO Grundriss.pdf', o)).toBe('HVO BAUA 261112 Entw Grundriss.pdf');
  });
  it('Rundlauf in allen 24 Reihenfolgen, auch mit einem Projektcode, der wie eine Plannummer aussieht (BS9)', () => {
    const teile = ['code', 'art', 'datum', 'nummer'] as const;
    const alle: (typeof teile)[number][][] = [];
    const permutieren = (rest: (typeof teile)[number][], weg: (typeof teile)[number][]) =>
      rest.length ? rest.forEach((t, i) => permutieren([...rest.slice(0, i), ...rest.slice(i + 1)], [...weg, t])) : alle.push(weg);
    permutieren([...teile], []);
    expect(alle).toHaveLength(24);
    for (const codes of [['HVO'], ['BS9']])
      for (const reihenfolge of alle)
        for (const name of ['Lageplan.pdf', 'GP-04 Grundriss.pdf', '01 Bauantrag.pdf']) {
          const neu = nameNachFormat(name, { ...o, codes, reihenfolge });
          expect(antragsNameFehler(neu, { ...o, codes, reihenfolge }), `${codes} ${reihenfolge} ${name} → ${neu}`).toBeNull();
          // nochmals angewandt: bleibt gleich
          expect(nameNachFormat(neu, { ...o, codes, reihenfolge })).toBe(neu);
        }
  });
  it('gleichwertige Schreibweisen der Antragsart gelten (BVA = BAUVA)', () => {
    expect(antragsNameFehler('HVO BAUVA 261110 Antrag auf Vorbescheid.pdf', { codes: ['HVO'], art: 'BVA' })).toBeNull();
    expect(antragsNameFehler('HVO BVA 261110 Antrag auf Vorbescheid.pdf', { codes: ['HVO'], art: 'BAUVA' })).toBeNull();
    expect(antragsNameFehler('HVO BAUA 261110 Bauantrag.pdf', { codes: ['HVO'], art: 'BVA' })).toContain('Antragsart BVA fehlt');
  });
  it('Rundlauf mit ungewöhnlicher Reihenfolge: der Vorschlag besteht die eigene Prüfung; eine Nummer allein ist keine Bezeichnung', () => {
    for (const reihenfolge of [
      ['code', 'nummer', 'datum', 'art'],
      ['code', 'art', 'nummer', 'datum'],
      ['datum', 'code', 'art', 'nummer'],
      ['code', 'art', 'datum', 'nummer'],
    ] as ('code' | 'art' | 'datum' | 'nummer')[][]) {
      const neu = nameNachFormat('Lageplan.pdf', { ...o, reihenfolge });
      expect(antragsNameFehler(neu, { ...o, reihenfolge })).toBeNull();
      // ein Plan bleibt nach dem Umbenennen ein Plan – die Plannummer steht an ihrer Stelle im Schema
      for (const plan of ['GP-04 Grundriss.pdf', 'HVO GP 261111 GP-04 Grundriss.pdf', 'HVO GP GP-04 261111 Grundriss.pdf']) {
        const umbenannt = nameNachFormat(plan, { ...o, reihenfolge });
        expect(antragsNameFehler(umbenannt, { ...o, reihenfolge })).toBeNull();
        expect(planNummerAus(dateinameZerlegen(umbenannt, { reihenfolge }, o.codes).nummer)).toEqual({ kuerzel: 'GP', von: 4, bis: 4 });
      }
    }
    expect(nameNachFormat('HVO GP GP-04 Grundriss.pdf', { ...o, reihenfolge: ['code', 'art', 'nummer', 'datum'] })).toBe('HVO BAUA GP-04 261112 Grundriss.pdf');
    // „OG2“, „3D“ sind Bezeichnungen
    expect(antragsNameFehler('HVO BAUA 261110 OG2.pdf', o)).toBeNull();
    expect(antragsNameFehler('HVO BAUA 261110 3D Visualisierung.pdf', o)).toBeNull();
    // ohne Projektcode: kein führendes Leerzeichen
    expect(nameNachFormat('Lageplan.pdf', { ...o, codes: [] })).toBe('BAUA 261112 Lageplan.pdf');
    // schon im Format (nur die Bezeichnung fehlt): der Vorschlag ist der Name selbst – das Menü bietet dann nichts an
    expect(nameNachFormat('HVO BAUA 261110.pdf', o)).toBe('HVO BAUA 261110.pdf');
    expect(antragsNameFehler('HVO 261110 BAUA Bauantrag.pdf', { ...o, reihenfolge: ['code', 'nummer', 'datum', 'art'] })).toBeNull();
    expect(antragsNameFehler('HVO 01 261110 BAUA Bauantrag.pdf', { ...o, reihenfolge: ['code', 'nummer', 'datum', 'art'] })).toBeNull();
    expect(antragsNameFehler('HVO BAUA 01 261110.pdf', { ...o, reihenfolge: ['code', 'art', 'nummer', 'datum'] })).toContain('Bezeichnung fehlt');
    expect(antragsNameFehler('HVO BAUA 261110 01.pdf', o)).toContain('Bezeichnung fehlt');
    // mehrteiliger Projektcode: der längste passende
    expect(antragsNameFehler('BS 9 BAUA 261110 Bauantrag.pdf', { codes: ['BS', 'BS 9'], art: 'BAUA' })).toBeNull();
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
    expect(antragsNameFehler('MUS BAUA Bauantrag.pdf', o)).toContain('Datum JJMMTT fehlt nach der Antragsart');
    expect(antragsNameFehler('MUS BAUA 261110.pdf', o)).toContain('Bezeichnung fehlt');
    // eine Bezeichnung mit angehängter Ziffer ist keine Nummer
    expect(antragsNameFehler('MUS BAUA 261110 Anlage1.pdf', o)).toBeNull();
    expect(antragsNameFehler('MUS BAUA 261110 Ansicht2.pdf', o)).toBeNull();
    expect(antragsNameFehler('MUS BAUA 261110 Plan-3.pdf', o)).toBeNull();
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

  it('eingereicht: Antragsprotokoll oder Eingangsbestätigung (auch „ae“), der erste Nachweis (Tag der Einreichung); Sperrdateien zählen nicht', () => {
    const zeit = new Date(2026, 10, 3, 12).getTime();
    expect(eingereichtAus([{ pfad: 'BS9 BAUA 261101 Bauantrag.pdf', ordner: false, groesse: 1 }])).toBeNull();
    expect(eingereichtAus([{ pfad: '~$Eingangsbestätigung.docx', ordner: false, groesse: 1 }])).toBeNull();
    expect(
      eingereichtAus([
        { pfad: 'BS9 BAUA 261020 Antragsprotokoll.pdf', ordner: false, groesse: 1, geaendert: zeit - 86400000 * 14 },
        { pfad: 'Eingangsbestaetigung Kreis.pdf', ordner: false, groesse: 1, geaendert: zeit },
      ]),
    ).toEqual({ datei: 'BS9 BAUA 261020 Antragsprotokoll.pdf', datum: '2026-10-20' });
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

describe('Antragsumfang je Eintrag zusammenführen (umfangAnwenden)', () => {
  const e = (id: string, mehr: Partial<UmfangEintrag> = {}): UmfangEintrag => ({ id, titel: id, art: 'extern', ...mehr });
  const ids = (u?: UmfangEintrag[]) => (u ?? []).map((x) => x.id);
  it('zwei Änderungen kurz nacheinander (die zweite auf dem alten Stand): beide bleiben – auch zwei Felder desselben Eintrags', () => {
    const alt = [e('muster'), e('bauantrag'), e('lageplan')];
    // in der Datei steht schon die erste Änderung (Nr. am Lageplan)
    const frisch = [e('muster'), e('bauantrag'), e('lageplan', { nr: '01' })];
    const z = umfangAnwenden(frisch, alt, [e('muster'), e('bauantrag', { nr: '02' }), e('lageplan')])!;
    expect(z.map((x) => [x.id, x.nr])).toEqual([['muster', undefined], ['bauantrag', '02'], ['lageplan', '01']]);
    const z2 = umfangAnwenden([e('lageplan', { titel: 'Lageplan 1:500' })], [e('lageplan')], [e('lageplan', { muster: '*LP*' })])!;
    expect(z2[0]).toMatchObject({ titel: 'Lageplan 1:500', muster: '*LP*' });
  });
  it('woanders entfernt: eine Änderung an dem Eintrag bringt ihn nicht zurück; eigenes Entfernen entfernt', () => {
    expect(ids(umfangAnwenden([e('a'), e('c')], [e('a'), e('b'), e('c')], [e('a'), e('b', { nr: '07' }), e('c')]))).toEqual(['a', 'c']);
    expect(ids(umfangAnwenden([e('a'), e('b'), e('c', { nr: '3' })], [e('a'), e('b'), e('c')], [e('a'), e('c')]))).toEqual(['a', 'c']);
  });
  it('hinzugefügt: hinter dem Vorgänger, Einträge von anderswo bleiben; doppelt kommt nichts', () => {
    // woanders kam „x“ ans Ende, hier „neu“ hinter „b“
    expect(ids(umfangAnwenden([e('a'), e('b'), e('x')], [e('a'), e('b')], [e('a'), e('b'), e('neu')]))).toEqual(['a', 'b', 'neu', 'x']);
    expect(ids(umfangAnwenden([e('a'), e('neu')], [e('a')], [e('neu'), e('a')]))).toEqual(['a', 'neu']);
    expect(ids(umfangAnwenden([e('a')], [e('a')], [e('vorn'), e('a')]))).toEqual(['vorn', 'a']);
  });
  it('Reihenfolge geändert: nur der verschobene Eintrag zieht um, was nur andere kennen bleibt an seiner Stelle', () => {
    // ganz nach oben gezogen: oben (auch vor einem woanders hinzugekommenen)
    expect(ids(umfangAnwenden([e('x'), e('a'), e('b'), e('c')], [e('a'), e('b'), e('c')], [e('c'), e('a'), e('b')]))).toEqual(['c', 'x', 'a', 'b']);
    // zweimal kurz nacheinander verschoben (das zweite auf dem alten Stand): beide Verschiebungen bleiben
    expect(ids(umfangAnwenden([e('l'), e('m'), e('b')], [e('m'), e('b'), e('l')], [e('b'), e('m'), e('l')]))).toEqual(['b', 'l', 'm']);
    // ein einzelnes ↑ ersetzt eine Umstellung von anderswo nicht: „c“ soll über „b“ – dort steht es schon
    expect(ids(umfangAnwenden([e('d'), e('c'), e('b'), e('a')], [e('a'), e('b'), e('c'), e('d')], [e('a'), e('c'), e('b'), e('d')]))).toEqual(['d', 'c', 'b', 'a']);
    // ↓ an „a“ (an „b“ vorbei), woanders kam „x“ dazwischen: „a“ hinter „b“, „x“ bleibt
    expect(ids(umfangAnwenden([e('a'), e('x'), e('b'), e('c')], [e('a'), e('b'), e('c')], [e('b'), e('a'), e('c')], 'a'))).toEqual(['x', 'b', 'a', 'c']);
    // zwei getauschte Nachbarn sind mehrdeutig – der Aufrufer sagt, welchen er verschob
    expect(ids(umfangAnwenden([e('a'), e('b'), e('c'), e('d')], [e('a'), e('b'), e('c'), e('d')], [e('a'), e('c'), e('b'), e('d')], 'b'))).toEqual(['a', 'c', 'b', 'd']);
    // unverändert gelassen: eine Umstellung von anderswo bleibt
    expect(ids(umfangAnwenden([e('b'), e('a')], [e('a'), e('b')], [e('a', { nr: '1' }), e('b')]))).toEqual(['b', 'a']);
  });
  it('ohne gleichzeitige Änderung (frisch = alt) ergibt sich genau `neu` – erschöpfend: Umstellen, Entfernen, Hinzufügen in einem Schritt', () => {
    const alle = (l: string[]): string[][] => (l.length <= 1 ? [l] : l.flatMap((x, i) => alle([...l.slice(0, i), ...l.slice(i + 1)]).map((r) => [x, ...r])));
    const alt = ['A', 'B', 'C', 'D'].map((id) => e(id));
    let faelle = 0;
    for (let maske = 0; maske < 16; maske++) {
      const rest = alt.filter((_, i) => maske & (1 << i)).map((u) => u.id);
      for (const folge of alle(rest))
        for (let p = 0; p <= folge.length; p++)
          for (const dazu of [false, true]) {
            const neuIds = dazu ? [...folge.slice(0, p), 'X'] .concat(folge.slice(p)) : folge;
            if (!dazu && p > 0) continue;
            const z = umfangAnwenden(alt, alt, neuIds.map((id) => e(id)));
            expect(ids(z), `${ids(alt)} → ${neuIds}`).toEqual(neuIds);
            faelle++;
          }
    }
    expect(faelle).toBeGreaterThan(100);
  });
  it('jede Einzelverschiebung mit Angabe des Eintrags (frisch = alt) ergibt genau `neu`', () => {
    const alt = ['A', 'B', 'C', 'D', 'E'];
    for (const id of alt)
      for (let p = 0; p < alt.length; p++) {
        const ohne = alt.filter((x) => x !== id);
        const neuIds = [...ohne.slice(0, p), id, ...ohne.slice(p)];
        expect(ids(umfangAnwenden(alt.map((x) => e(x)), alt.map((x) => e(x)), neuIds.map((x) => e(x)), id)), `${id} → ${p}`).toEqual(neuIds);
      }
  });
  it('ein einzeln verschobener Eintrag behält seine Richtung, auch wenn anderswo umgestellt wurde', () => {
    // A von Platz 3 hinter E gezogen; woanders wurde E ganz nach oben gestellt: A bleibt hinter D (an dem es vorbeizog)
    const alt = ['B', 'C', 'A', 'D', 'E', 'F'].map((id) => e(id));
    const neu = ['B', 'C', 'D', 'E', 'A', 'F'].map((id) => e(id));
    const frisch = ['E', 'B', 'C', 'A', 'D', 'F'].map((id) => e(id));
    expect(ids(umfangAnwenden(frisch, alt, neu, 'A'))).toEqual(['E', 'B', 'C', 'D', 'A', 'F']);
    // ganz nach unten gezogen, woanders kam unten „X“ dazu: ganz unten
    expect(ids(umfangAnwenden([e('A'), e('B'), e('C'), e('X')], [e('A'), e('B'), e('C')], [e('B'), e('C'), e('A')], 'A'))).toEqual(['B', 'C', 'X', 'A']);
  });
  it('woanders aufgehoben bleibt aufgehoben; angehängt, obwohl die Vorgänger woanders entfernt sind: hinten', () => {
    expect(umfangAnwenden(undefined, [e('a')], [e('a', { nr: '1' })])).toBeUndefined();
    expect(ids(umfangAnwenden([e('x'), e('y')], [e('a'), e('b'), e('x')], [e('a'), e('b'), e('x'), e('neu')]))).toEqual(['x', 'neu', 'y']);
    expect(ids(umfangAnwenden([e('y')], [e('a'), e('b')], [e('a'), e('b'), e('neu')]))).toEqual(['y', 'neu']);
  });
  it('verknüpfte Dateien je Fassung; festlegen bzw. aufheben ganz', () => {
    const z = umfangAnwenden([e('lp', { dateien: { BAUA: 'a.pdf' } })], [e('lp')], [e('lp', { dateien: { 'BAUA 2': 'b.pdf' } })])!;
    expect(z[0].dateien).toEqual({ BAUA: 'a.pdf', 'BAUA 2': 'b.pdf' });
    expect(umfangAnwenden(undefined, undefined, [e('a')])).toEqual([e('a')]);
    // festgelegt, während woanders inzwischen schon einer festgelegt war: der bleibt
    expect(umfangAnwenden([e('x')], undefined, [e('a')])).toEqual([e('x')]);
    expect(umfangAnwenden([e('x')], [e('x')], undefined)).toBeUndefined();
  });
});

describe('Kennzeichen „Antragsumfang behalten“ beim Zusammenführen', () => {
  const abschnitt = (umfang?: UmfangEintrag[]) => ({ antraege: { 'BAUA 2': { angelegt: '2026-11-01', ...(umfang ? { umfang } : {}) } } });
  const ansicht = (umfang?: UmfangEintrag[]) => ({ ansicht: 'BAUA 2', ...(umfang ? { umfang } : {}), antraege: { 'BAUA 2': { angelegt: '2026-11-01' } } });
  const e = (id: string, mehr: Partial<UmfangEintrag> = {}): UmfangEintrag => ({ id, titel: id, art: 'extern', ...mehr });
  const kennzeichen = (frisch?: UmfangEintrag[], neu?: UmfangEintrag[]) => {
    const k: { umfangBehalten?: boolean } = {};
    aenderungAnwenden(abschnitt(frisch), ansicht(), ansicht(neu), { kennzeichen: k });
    return !!k.umfangBehalten;
  };
  it('gesetzt, wenn in der Datei schon ein anderer steht; nicht bei gleichem (auch mit leeren Texten) und nicht ohne', () => {
    expect(kennzeichen([e('x')], [e('a')])).toBe(true);
    expect(kennzeichen([e('a')], [e('a', { muster: '' })])).toBe(false);
    expect(kennzeichen(undefined, [e('a')])).toBe(false);
  });
});

describe('„bereit“ je Datei zusammenführen (bereitAnwenden)', () => {
  const b = (datei: string, stand?: number) => ({ datei, ...(stand ? { stand } : {}) });
  it('zwei Markierungen kurz nacheinander bzw. von zwei Arbeitsplätzen: beide bleiben; aufheben entfernt nur die eigene', () => {
    expect(bereitAnwenden([b('A.pdf')], [], [b('B.pdf')])).toEqual([b('A.pdf'), b('B.pdf')]);
    expect(bereitAnwenden([b('A.pdf'), b('B.pdf')], [b('a.pdf')], [])).toEqual([b('B.pdf')]);
    expect(bereitAnwenden([b('A.pdf')], [b('A.pdf')], [])).toBeUndefined();
  });
  it('geänderter Stand wird übernommen, woanders Aufgehobenes kommt dadurch nicht zurück', () => {
    expect(bereitAnwenden([b('A.pdf', 1)], [b('A.pdf', 1)], [b('A.pdf', 2)])).toEqual([b('A.pdf', 2)]);
    expect(bereitAnwenden([], [b('A.pdf', 1)], [b('A.pdf', 2)])).toBeUndefined();
  });
});

describe('Kennungen im Antragsumfang beim Lesen', () => {
  it('fehlende bzw. doppelte Kennungen werden eindeutig – ohne eine ausdrücklich gesetzte zu treffen', () => {
    const pd = projektDateiAus({ umfang: [{ id: 'u2', titel: 'Lageplan' }, { titel: 'Statik' }, { id: 'u2', titel: 'Doppelt' }, { titel: 'Vierter' }] });
    const ids = pd.umfang!.map((u) => u.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids[0]).toBe('u2');
    expect(pd.umfang!.map((u) => u.titel)).toEqual(['Lageplan', 'Statik', 'Doppelt', 'Vierter']);
  });
});

describe('Änderung auf den frisch gelesenen Abschnitt anwenden', () => {
  it('Grund mitten im Satz: klein, außer ein Substantiv am Anfang („Antrag …“)', () => {
    expect(klein('Die Projektdatei ist gerade nicht lesbar')).toBe('die Projektdatei ist gerade nicht lesbar');
    expect(klein('Antrag BAUA 2 ist eingereicht')).toBe('Antrag BAUA 2 ist eingereicht');
    expect(klein('Antragsfassung BAUA 3 fehlt')).toBe('Antragsfassung BAUA 3 fehlt');
    expect(klein('Antragsumfang fehlt')).toBe('Antragsumfang fehlt');
    expect(klein('Antragsmerkmale fehlen')).toBe('Antragsmerkmale fehlen');
    expect(klein('Inzwischen ist Antrag BAUA angezeigt')).toBe('inzwischen ist Antrag BAUA angezeigt');
  });
  const umfang = [{ id: 'muster', titel: 'Musterformular', art: 'intern' as const, formular: 'Muster' }];
  it('nur geänderte Felder je Antrag – was ein anderer inzwischen gespeichert hat, bleibt', () => {
    const vorher = { ansicht: 'BAUA 2', antraege: { 'BAUA 2': { angelegt: '2026-11-01' } } };
    const nachher = { ...vorher, umfang };
    // inzwischen woanders: BAUA 2 eingereicht, ein neuer Antrag BAUVA
    const frisch = { antraege: { 'BAUA 2': { angelegt: '2026-11-01', status: { eingereicht: true, datum: '2026-11-10' } }, BAUVA: { angelegt: '2026-11-02' } } };
    const a = aenderungAnwenden(frisch, vorher, nachher);
    expect(a.antraege['BAUA 2']).toEqual({ angelegt: '2026-11-01', status: { eingereicht: true, datum: '2026-11-10' }, umfang });
    expect(a.antraege.BAUVA).toEqual({ angelegt: '2026-11-02' });
  });
  it('ein entferntes Feld wird entfernt, ein fehlender Antrag ganz übernommen, die aktive Fassung nur bei Änderung', () => {
    const vorher = { ansicht: 'BAUA', aktiveFassung: 'BAUA', umfang, antraege: { BAUA: { angelegt: '2026-11-01' } } };
    const nachher = { ansicht: 'BAUA', aktiveFassung: 'BAUA', antraege: { BAUA: { angelegt: '2026-11-01' }, 'BAUA 2': { angelegt: '2026-11-12' } } };
    const frisch = { aktiveFassung: 'BAUVA', antraege: { BAUA: { angelegt: '2026-11-01', umfang, merkmale: { gk: '3' } } } };
    const a = aenderungAnwenden(frisch, vorher, nachher);
    expect(a.antraege.BAUA).toEqual({ angelegt: '2026-11-01', merkmale: { gk: '3' } });
    expect(a.antraege['BAUA 2']).toEqual({ angelegt: '2026-11-12' });
    expect(a.aktiveFassung).toBe('BAUVA');
    expect(aenderungAnwenden(frisch, vorher, { ...nachher, aktiveFassung: 'BAUA 2' }).aktiveFassung).toBe('BAUA 2');
  });
  it('fehlende Anträge ergänzen (Laden): ein Antrag, den der Aufrufer nicht kannte, bleibt ganz, wie er ist', () => {
    const vorher = { antraege: {} };
    const nachher = { ansicht: 'BAUA', antraege: { BAUA: { angelegt: '2026-11-12', merkmale: { gk: '1' } }, 'BAUA 2': { angelegt: '2026-11-12' } } };
    const frisch = { antraege: { BAUA: { angelegt: '2026-10-01', umfang, merkmale: { gk: '3' } } } };
    const a = aenderungAnwenden(frisch, vorher, nachher);
    expect(a.antraege.BAUA).toEqual({ angelegt: '2026-10-01', umfang, merkmale: { gk: '3' } });
    expect(a.antraege['BAUA 2']).toEqual({ angelegt: '2026-11-12' });
  });
  it('„bereit“: aus dem gelesenen Stand (alsAngaben) und seiner Ansicht ist nichts geändert – Markierungen anderer bleiben', () => {
    const gelesenAbschnitt = { antraege: { 'BAUA 2': { angelegt: '2026-11-01', bereit: [{ datei: 'A.pdf' }] } } };
    const gelesen = alsAngaben(structuredClone(gelesenAbschnitt));
    const ansicht = { ansicht: 'BAUA 2', bereit: { 'BAUA 2': [{ datei: 'A.pdf' }] }, antraege: structuredClone(gelesenAbschnitt.antraege) };
    // inzwischen: A aufgehoben, B markiert (anderer Arbeitsplatz)
    const frisch = { antraege: { 'BAUA 2': { angelegt: '2026-11-01', bereit: [{ datei: 'B.pdf' }] } } };
    expect(aenderungAnwenden(frisch, gelesen, ansicht)).toEqual(frisch);
  });
  it('Zuordnungen (Antragsmerkmale) je Schlüssel: gleichzeitige Einträge anderer bleiben', () => {
    const vorher = { ansicht: 'BAUA', merkmale: { gk: '3' }, antraege: { BAUA: { angelegt: '2026-11-01' } } };
    const nachher = { ...vorher, merkmale: { gk: '4' } };
    const frisch = { antraege: { BAUA: { angelegt: '2026-11-01', merkmale: { gk: '3', sonderbau: 'nein' } } } };
    expect(aenderungAnwenden(frisch, vorher, nachher).antraege.BAUA.merkmale).toEqual({ gk: '4', sonderbau: 'nein' });
  });
  it('Zuordnungen auch beim ersten bzw. letzten Eintrag je Schlüssel – nichts von anderen geht verloren oder kommt zurück', () => {
    const basis = (merkmale?: Record<string, string>) => ({ ansicht: 'BAUA', ...(merkmale ? { merkmale } : {}), antraege: { BAUA: { angelegt: '2026-11-01', ...(merkmale ? { merkmale } : {}) } } });
    // erstes Merkmal, anderswo kam schon eines dazu
    expect(aenderungAnwenden({ antraege: { BAUA: { angelegt: '2026-11-01', merkmale: { sonderbau: 'nein' } } } }, basis(), basis({ gk: '3' })).antraege.BAUA.merkmale).toEqual({ sonderbau: 'nein', gk: '3' });
    // letztes Merkmal entfernt, anderswo kam eines dazu
    expect(aenderungAnwenden({ antraege: { BAUA: { angelegt: '2026-11-01', merkmale: { gk: '3', sonderbau: 'nein' } } } }, basis({ gk: '3' }), basis()).antraege.BAUA.merkmale).toEqual({ sonderbau: 'nein' });
    // anderswo ganz entfernt: kommt nicht zurück, nur das eigene
    expect(aenderungAnwenden({ antraege: { BAUA: { angelegt: '2026-11-01' } } }, basis({ gk: '3', sonderbau: 'nein' }), basis({ gk: '4', sonderbau: 'nein' })).antraege.BAUA.merkmale).toEqual({ gk: '4' });
    // eine leer gewordene Zuordnung entfällt
    expect(aenderungAnwenden({ antraege: { BAUA: { angelegt: '2026-11-01', merkmale: { gk: '3' } } } }, basis({ gk: '3' }), basis()).antraege.BAUA).toEqual({ angelegt: '2026-11-01' });
  });
  it('Autofill (felder) je Formulardatei: der Eintrag eines anderen Formulars bleibt', () => {
    const z = (felder?: Record<string, unknown>) => ({ ansicht: 'BAUA', ...(felder ? { felder } : {}), antraege: { BAUA: { angelegt: '2026-11-01', ...(felder ? { felder } : {}) } } }) as unknown as Parameters<typeof aenderungAnwenden>[1] & object;
    const frisch = { antraege: { BAUA: { angelegt: '2026-11-01', felder: { 'B.frmsjf': { felder: { x: { auto: '2' } } } } } } } as unknown as Parameters<typeof aenderungAnwenden>[0];
    const a = aenderungAnwenden(frisch, z(), z({ 'A.frmsjf': { felder: { y: { auto: '1' } } } }));
    expect(Object.keys(a.antraege.BAUA.felder ?? {}).sort()).toEqual(['A.frmsjf', 'B.frmsjf']);
  });
  it('stabil: Reihenfolge der Schlüssel egal, undefined wie fehlend', () => {
    expect(stabil({ a: 1, b: { c: 2, d: 3 } })).toBe(stabil({ b: { d: 3, c: 2 }, a: 1 }));
    expect(stabil({ a: 1, b: undefined })).toBe(stabil({ a: 1 }));
    expect(stabil(undefined)).toBe('undefined');
  });
});

describe('formularVerweiseUmbenennen', () => {
  const z = { felder: { '0:Name': { auto: 'X' } } };
  it('Zuordnung und Autofill in allen Anträgen und den früheren projektweiten Angaben; andere bleiben', () => {
    const roh = {
      aktiveFassung: 'BAUA 2',
      umfang: [{ id: 'a', formularDatei: '001-Muster.frmsjf' }],
      antraege: {
        BAUA: { umfang: [{ id: 'a', formularDatei: '001-MUSTER.frmsjf' }, { id: 'b', formularDatei: '002-Anderes.frmsjf' }], felder: { '001-Muster.frmsjf': z, '002-Anderes.frmsjf': z }, eigen: 1 },
        'BAUA 2': { merkmale: { GK: '3' } },
      },
    };
    const { abschnitt, anzahl } = formularVerweiseUmbenennen(roh, '001-Muster.frmsjf', '010-Neu.frmsjf');
    expect(anzahl).toBe(3);
    expect(abschnitt).toEqual({
      aktiveFassung: 'BAUA 2',
      umfang: [{ id: 'a', formularDatei: '010-Neu.frmsjf' }],
      antraege: {
        BAUA: { umfang: [{ id: 'a', formularDatei: '010-Neu.frmsjf' }, { id: 'b', formularDatei: '002-Anderes.frmsjf' }], felder: { '002-Anderes.frmsjf': z, '010-Neu.frmsjf': z }, eigen: 1 },
        'BAUA 2': { merkmale: { GK: '3' } },
      },
    });
    // das Original bleibt unverändert
    expect(roh.antraege.BAUA.umfang[0].formularDatei).toBe('001-MUSTER.frmsjf');
  });

  it('im Unterordner: eine ältere Zuordnung nur mit dem Dateinamen gilt nur in den Anträgen dieses Unterordners', () => {
    const roh = { antraege: { 'BAUA 2': { umfang: [{ id: 'a', formularDatei: '002-Bauantrag.frmsjf' }] }, BAUA: { umfang: [{ id: 'a', formularDatei: '002-Bauantrag.frmsjf' }] } } };
    const { abschnitt, anzahl } = formularVerweiseUmbenennen(roh, '2. BAUA/002-Bauantrag.frmsjf', '2. BAUA/003-Bauantrag.frmsjf', (f) => f === 'BAUA 2');
    expect(anzahl).toBe(1);
    expect(abschnitt).toEqual({ antraege: { 'BAUA 2': { umfang: [{ id: 'a', formularDatei: '2. BAUA/003-Bauantrag.frmsjf' }] }, BAUA: { umfang: [{ id: 'a', formularDatei: '002-Bauantrag.frmsjf' }] } } });
  });

  it('nichts zugeordnet: dasselbe Objekt zurück, kein Verweis gezählt', () => {
    const roh = { antraege: { BAUA: { umfang: [{ id: 'a', formularDatei: 'x.frmsjf' }] } } };
    expect(formularVerweiseUmbenennen(roh, 'y.frmsjf', 'z.frmsjf')).toEqual({ abschnitt: roh, anzahl: 0 });
    expect(formularVerweiseUmbenennen(undefined, 'y.frmsjf', 'z.frmsjf')).toEqual({ abschnitt: undefined, anzahl: 0 });
  });
});

describe('pdfOhneZuordnung', () => {
  const d = (pfad: string, geaendert = 1) => ({ pfad, ordner: false, groesse: 1, geaendert });
  it('nach dem Namen ohne Nummer und Jahr, PDFs vor anderen Dateien', () => {
    const dateien = [d('BS9 BAUA 261110 Baubeschreibung.docx'), d('BS9 BAUA 261110 Baubeschreibung.pdf'), d('BS9 BAUA 261110 Lageplan.pdf')];
    expect(pdfOhneZuordnung('003-Baubeschreibung (2026)', dateien, new Set())?.pfad).toBe('BS9 BAUA 261110 Baubeschreibung.pdf');
    // Gegenprobe: ohne passende Datei keine
    expect(pdfOhneZuordnung('003-Baubeschreibung (2026)', [d('BS9 BAUA 261110 Lageplan.pdf')], new Set())).toBeNull();
  });
  it('eine PDF, die schon einem Dokument des Antragsumfangs gehört, zählt nicht', () => {
    const dateien = [d('BS9 BAUA 261110 Baubeschreibung.pdf')];
    expect(pdfOhneZuordnung('004-Baubeschreibung', dateien, new Set(['bs9 baua 261110 baubeschreibung.pdf']))).toBeNull();
  });
});
