import { describe, expect, it } from 'vitest';
import { VORGABE_NAMENSSCHEMA } from '@core/namensschema';
import { plansatzKurz, plansatzPruefen } from './plansatz';

const datei = (pfad: string, geaendert = 1) => ({ pfad, ordner: false, groesse: 1, geaendert });
const S = VORGABE_NAMENSSCHEMA;

describe('Plansatz', () => {
  it('erkennt Pläne an der Plannummer, Formulare (reine Zahl) zählen nicht; Lücke = fehlender Plan', () => {
    const antrag = [
      datei('HVO BAUA 261111 GP-01 Lageplan.pdf'),
      datei('HVO BAUA 261111 GP-02 Grundriss EG.pdf'),
      datei('HVO BAUA 261111 GP-03 Grundriss OG.pdf'),
      datei('HVO BAUA 261111 GP-05 Schnitt.pdf'),
      datei('HVO BAUA 261110 01 Bauantrag.pdf'),
      datei('HVO BAUA 261110 Eingangsbestätigung.pdf'),
    ];
    const r = plansatzPruefen(antrag, [], S);
    expect(r.plaene.map((p) => [p.schluessel, p.zustand])).toEqual([
      ['GP-01', 'aktuell'],
      ['GP-02', 'aktuell'],
      ['GP-03', 'aktuell'],
      ['GP-04', 'fehlt'],
      ['GP-05', 'aktuell'],
    ]);
    expect(r.luecken).toEqual(['GP-04']);
    expect(r.status).toBe('unvollstaendig');
    expect(plansatzKurz(r)).toBe('4 Pläne · GP-01 bis GP-05 · GP-04 fehlt');
  });

  it('Reihe muss nicht bei 01 beginnen; je Plankürzel getrennt; Sonderpläne hinten stören nicht', () => {
    const r = plansatzPruefen(
      [datei('X BAUA 261111 GP-03 Grundriss.pdf'), datei('X BAUA 261111 GP-04 Ansicht.pdf'), datei('X BAUA 261111 BP-01 Bestand EG.pdf'), datei('X BAUA 261111 BP-02 Bestand OG.pdf')],
      [],
      S,
    );
    expect(r.luecken).toEqual([]);
    expect(r.status).toBe('aktuell');
    expect(r.plaene.map((p) => p.schluessel)).toEqual(['BP-01', 'BP-02', 'GP-03', 'GP-04']);
  });

  it('ein Plan, dessen Nummer nicht an ihrer Stelle steht, fällt nicht still heraus – Hinweis, nicht gezählt', () => {
    const quelle = [datei('GP-01 Grundriss.pdf'), datei('GP 261111 GP-02 Schnitt.pdf'), datei('HVO BAUA 261111 GP-03 Ansicht.pdf'), datei('HVO BAUA 261111 01 Planliste GP-01 bis GP-03.pdf')];
    const r = plansatzPruefen([], quelle, S, { codes: ['HVO'] });
    expect(r.plaene.map((p) => p.schluessel)).toEqual(['GP-03']);
    expect(r.hinweise).toEqual(
      expect.arrayContaining([
        'GP-01 Grundriss.pdf (Quelle): Plannummer GP-01 erkannt, sie steht aber nicht an ihrer Stelle im Namensschema – zählt nicht zum Plansatz; umbenennen?',
        'GP 261111 GP-02 Schnitt.pdf (Quelle): Plannummer GP-02 erkannt, sie steht aber nicht an ihrer Stelle im Namensschema – zählt nicht zum Plansatz; umbenennen?',
      ]),
    );
    // ein Dokument mit Dokumentnummer, das Plannummern nur erwähnt, ist kein falsch benannter Plan
    expect(r.hinweise.join('\n')).not.toContain('Planliste');
  });

  it('Quelle: noch nicht verschoben, veraltet nach dem Datum im Namen; leere Quelle ist in Ordnung', () => {
    const antrag = [datei('HVO BAUA 261105 GP-01 Grundriss EG.pdf', 50), datei('HVO BAUA 261111 GP-02 Grundriss OG.pdf', 10)];
    const quelle = [datei('HVO GP 261111 GP-01 Grundriss EG.pdf', 5), datei('HVO GP 261111 GP-03 Schnitt.pdf', 5)];
    const r = plansatzPruefen(antrag, quelle, S);
    expect(r.plaene.map((p) => [p.schluessel, p.zustand])).toEqual([
      ['GP-01', 'veraltet'],
      ['GP-02', 'aktuell'],
      ['GP-03', 'quelle'],
    ]);
    expect(r.status).toBe('offen');
    expect(plansatzKurz(r)).toBe('3 Pläne · GP-01 bis GP-03 · 1 nicht verschoben · 1 veraltet');
    expect(plansatzPruefen(antrag, [], S).status).toBe('aktuell');
    expect(plansatzPruefen([], [], S).status).toBe('fehlt');
  });

  it('ältere Fassungen, Satz neben Einzelplänen, Index ohne Vorgabe – nur Hinweise', () => {
    const r = plansatzPruefen(
      [datei('HVO BAUA 261101 GP-02 Grundriss.pdf'), datei('HVO BAUA 261111 GP-02 Grundriss.pdf'), datei('HVO BAUA 261111 GP01-03 Plansatz.pdf'), datei('HVO BAUA 261111 GP-04a Ansicht.pdf')],
      [],
      S,
    );
    expect(r.luecken).toEqual([]);
    expect(r.plaene.find((p) => p.schluessel === 'GP-02')!.datei!.pfad).toBe('HVO BAUA 261111 GP-02 Grundriss.pdf');
    expect(r.plaene.find((p) => p.schluessel === 'GP-01')!.satz).toBe(true);
    expect(r.hinweise).toEqual([
      'GP-04a: Index bei GP (LPH 4) – nach dem Namensschema des Büros erst ab LPH 5; zählt als neuere Fassung',
      'GP-02: ältere Fassung „HVO BAUA 261101 GP-02 Grundriss.pdf“ liegt auch im Antragsordner – alte Fassung?',
      '„HVO BAUA 261111 GP01-03 Plansatz.pdf“ (Satz) und einzelne Pläne daraus liegen beide im Antragsordner',
    ]);
  });

  it('Geschosse aus der Projektdatei: weniger Grundrisse als Geschosse – Hinweis, kein Fehler', () => {
    const antrag = [
      datei('A BAUA 261111 GP-01 Lageplan.pdf'),
      datei('A BAUA 261111 GP-02 Grundriss KG.pdf'),
      datei('A BAUA 261111 GP-03 Grundriss EG.pdf'),
      datei('A BAUA 261111 GP-04 Schnitt.pdf'),
      datei('A BAUA 261111 GP-05 Ansichten.pdf'),
    ];
    const r = plansatzPruefen(antrag, [], S, { geschosse: 3 });
    expect(r.status).toBe('aktuell');
    expect(r.hinweise).toEqual(['Projektdatei: 3 Geschosse, 2 Grundrisse erkannt (Grundrisse für alle Geschosse – § 4 Abs. 2 BauPrüfVO NRW)']);
    // Entwässerungsantrag: weder BauPrüfVO noch Grundrisse aller Geschosse (nur die mit Entwässerungsanlagen)
    expect(plansatzPruefen(antrag, [], S, { geschosse: 3, art: 'ENTW' }).hinweise).toEqual([]);
    // Vorbescheid: nur, soweit für die Fragen erforderlich (§ 16 BauPrüfVO)
    expect(plansatzPruefen(antrag, [], S, { geschosse: 3, art: 'BAUVA' }).hinweise).toEqual([
      'Projektdatei: 3 Geschosse, 2 Grundrisse erkannt (Grundrisse für alle Geschosse – § 4 Abs. 2 BauPrüfVO NRW – beim Vorbescheid nur, soweit für die Fragen erforderlich (§ 16 BauPrüfVO NRW))',
    ]);
    expect(plansatzPruefen(antrag, [], S, { geschosse: 2 }).hinweise).toEqual([]);
  });

  it('fehlen Schnitt oder Ansicht am Ende der Reihe (keine Lücke), gibt es einen Hinweis nach § 4 BauPrüfVO – ohne Sperre', () => {
    const r = plansatzPruefen([datei('A BAUA 261111 GP-01 Grundriss EG.pdf'), datei('A BAUA 261111 GP-02 Grundriss OG.pdf'), datei('A BAUA 261111 GP-03 Schnitt A-A.pdf')], [], S);
    expect(r.status).toBe('aktuell');
    expect(r.hinweise).toEqual(['keine Ansicht erkannt (Bauzeichnungen umfassen Grundrisse, Schnitte und Ansichten – § 4 Abs. 1, 4 BauPrüfVO NRW)']);
    expect(plansatzPruefen([datei('A BAUA 261111 GP-01 Grundriss EG.pdf')], [], S).hinweise).toHaveLength(2);
    // Aufteilungspläne (AB, ohne Leistungsphase) bzw. Abgeschlossenheit/Entwässerung: die BauPrüfVO ist nicht die Grundlage
    expect(plansatzPruefen([datei('A ABGE 261111 AB-01 Grundriss EG.pdf')], [], S).hinweise).toEqual([]);
    // Abgeschlossenheitsbescheinigung: Grundrisse, Schnitte, Ansichten üblich (WEG) – Hinweise ohne BauPrüfVO, auch für AB
    const ohneParagraf = ['kein Schnitt erkannt (übliche Bauzeichnungen: Grundrisse, Schnitte, Ansichten)', 'keine Ansicht erkannt (übliche Bauzeichnungen: Grundrisse, Schnitte, Ansichten)'];
    expect(plansatzPruefen([datei('A ABGE 261111 GP-01 Grundriss EG.pdf')], [], S, { art: 'ABGE' }).hinweise).toEqual(ohneParagraf);
    expect(plansatzPruefen([datei('A ABGE 261111 AB-01 Grundriss EG.pdf')], [], S, { art: 'ABGE' }).hinweise).toEqual(ohneParagraf);
    // denkmalrechtliche Erlaubnis: Hinweis ohne Paragraphen der BauPrüfVO; Vorbescheid: mit § 16
    expect(plansatzPruefen([datei('A DENK 261111 GP-01 Grundriss EG.pdf'), datei('A DENK 261111 GP-02 Schnitt.pdf')], [], S, { art: 'DENK', geschosse: 2 }).hinweise).toEqual([
      'keine Ansicht erkannt (übliche Bauzeichnungen: Grundrisse, Schnitte, Ansichten)',
      'Projektdatei: 2 Geschosse, 1 Grundriss erkannt',
    ]);
    expect(plansatzPruefen([datei('A BAUVA 261111 GP-01 Lageplan.pdf'), datei('A BAUVA 261111 GP-02 Schnitt.pdf')], [], S, { art: 'BAUVA' }).hinweise).toEqual([
      'keine Ansicht erkannt (Bauzeichnungen umfassen Grundrisse, Schnitte und Ansichten – § 4 Abs. 1, 4 BauPrüfVO NRW – beim Vorbescheid nur, soweit für die Fragen erforderlich (§ 16 BauPrüfVO NRW))',
    ]);
    // „Lageplan Ausschnitt“ ist kein Schnitt, „Längsschnitt“ schon
    expect(plansatzPruefen([datei('A BAUA 261111 GP-01 Lageplan Ausschnitt.pdf'), datei('A BAUA 261111 GP-02 Ansicht Nord.pdf')], [], S).hinweise).toEqual([
      'kein Schnitt erkannt (Bauzeichnungen umfassen Grundrisse, Schnitte und Ansichten – § 4 Abs. 1, 3 BauPrüfVO NRW)',
    ]);
    expect(plansatzPruefen([datei('A BAUA 261111 GP-01 Längsschnitt.pdf'), datei('A BAUA 261111 GP-02 Ansicht Nord.pdf')], [], S).hinweise).toEqual([]);
  });

  it('Unterordner der Quelle (Archiv, alt) zählen nicht – keine Scheinnummern und Scheinlücken', () => {
    const antrag = [datei('A BAUA 261111 GP-01 Grundriss.pdf'), datei('A BAUA 261111 GP-02 Schnitt.pdf')];
    const quelle = [
      datei('A GP 261111 GP-01 Grundriss.pdf'),
      datei('_Archiv/A GP 261001 GP-05 Ansicht.pdf'),
      datei('alt/A GP 261001 GP-04 Ansicht.pdf'),
      { pfad: '_Archiv', ordner: true, groesse: 0, geaendert: 1 },
    ];
    const r = plansatzPruefen(antrag, quelle, S);
    expect(r.plaene.map((p) => [p.schluessel, p.zustand])).toEqual([
      ['GP-01', 'aktuell'],
      ['GP-02', 'aktuell'],
    ]);
    expect(r.luecken).toEqual([]);
  });

  it('eine sehr große Lücke (Tippfehler GP-41 statt GP-04) ist ein Hinweis, keine Liste fehlender Pläne', () => {
    const r = plansatzPruefen(
      [datei('A BAUA 261111 GP-01 Grundriss.pdf'), datei('A BAUA 261111 GP-02 Schnitt.pdf'), datei('A BAUA 261111 GP-03 Ansicht.pdf'), datei('A BAUA 261111 GP-41 Ansicht Süd.pdf')],
      [],
      S,
    );
    expect(r.luecken).toEqual([]);
    expect(r.plaene.map((p) => p.schluessel)).toEqual(['GP-01', 'GP-02', 'GP-03', 'GP-41']);
    expect(r.hinweise).toContain('GP-04 bis GP-40 fehlen – ungewöhnlich große Lücke vor GP-41: Tippfehler in der Plannummer?');
    // bis zu zehn fehlende Nummern am Stück bleiben einzelne Lücken
    expect(plansatzPruefen([datei('A BAUA 261111 GP-01 Grundriss.pdf'), datei('A BAUA 261111 GP-12 Schnitt.pdf')], [], S).luecken).toHaveLength(10);
  });

  it('mehrteiliger Projektcode („BS 9“): die Pläne werden erkannt', () => {
    const r = plansatzPruefen([datei('BS 9 BAUA 261111 GP-01 Grundriss EG.pdf'), datei('BS 9 BAUA 261111 GP-02 Schnitt.pdf')], [], S, { codes: ['BS', 'BS 9'] });
    expect(r.plaene.map((p) => p.schluessel)).toEqual(['GP-01', 'GP-02']);
    expect(r.plaene[0].bezeichnung).toBe('Grundriss EG');
  });

  it('derselbe Plan als PDF und DWG: es zählt das PDF, kein Hinweis auf eine alte Fassung', () => {
    const r = plansatzPruefen([datei('A BAUA 261111 GP-01 Grundriss.pdf'), datei('A BAUA 261111 GP-01 Grundriss.dwg', 99)], [], S);
    expect(r.plaene[0].datei!.pfad).toBe('A BAUA 261111 GP-01 Grundriss.pdf');
    expect(r.hinweise.filter((h) => h.includes('ältere Fassung'))).toEqual([]);
  });

  it('veraltet auch nach dem Index: AP-03a in der Quelle bei gleichem Datum ist neuer als AP-03 im Antragsordner', () => {
    const r = plansatzPruefen([datei('A BAUA 261111 AP-03 Detail.pdf', 50)], [datei('A AP 261111 AP-03a Detail.pdf', 5)], S);
    expect(r.plaene.map((p) => [p.schluessel, p.zustand])).toEqual([['AP-03', 'veraltet']]);
    expect(r.hinweise.filter((h) => h.includes('Index'))).toEqual([]);
    // ein Index bei einer Phase ohne Leistungsphase: das Namensschema sieht keinen vor
    expect(plansatzPruefen([datei('A ABGE 261111 AB-02b Grundriss.pdf')], [], S).hinweise).toEqual(['AB-02b: für AB sieht das Namensschema des Büros keinen Index vor – zählt als neuere Fassung']);
  });
});
