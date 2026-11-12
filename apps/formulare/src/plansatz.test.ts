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

  it('Quelle: noch nicht verschoben, veraltet nach dem Datum im Namen; leere Quelle ist in Ordnung', () => {
    const antrag = [datei('HVO BAUA 261105 GP-01 Grundriss EG.pdf', 50), datei('HVO BAUA 261111 GP-02 Grundriss OG.pdf', 10)];
    const quelle = [datei('Planung/GP/pdf/HVO GP 261111 GP-01 Grundriss EG.pdf', 5), datei('Planung/GP/pdf/HVO GP 261111 GP-03 Schnitt.pdf', 5)];
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
      'GP-04a: Index bei GP nicht vorgesehen (erst ab Leistungsphase 5) – zählt als neuere Fassung',
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
    expect(r.hinweise).toEqual(['Projektdatei: 3 Geschosse, 2 Grundrisse erkannt']);
    expect(plansatzPruefen(antrag, [], S, { geschosse: 2 }).hinweise).toEqual([]);
  });

  it('fehlen Schnitt oder Ansicht am Ende der Reihe (keine Lücke), gibt es einen Hinweis nach § 4 BauPrüfVO – ohne Sperre', () => {
    const r = plansatzPruefen([datei('A BAUA 261111 GP-01 Grundriss EG.pdf'), datei('A BAUA 261111 GP-02 Grundriss OG.pdf'), datei('A BAUA 261111 GP-03 Schnitt A-A.pdf')], [], S);
    expect(r.status).toBe('aktuell');
    expect(r.hinweise).toEqual(['keine Ansicht erkannt (Bauzeichnungen: Grundrisse, Schnitte, Ansichten – § 4 Abs. 1 BauPrüfVO NRW)']);
    expect(plansatzPruefen([datei('A BAUA 261111 GP-01 Grundriss EG.pdf')], [], S).hinweise).toHaveLength(2);
  });
});
