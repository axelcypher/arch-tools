import { describe, expect, it } from 'vitest';
import type { Project } from '../model';
import { createOutline, createProject, createRoom, createStorey } from '../model';
import { aktiverAntrag, baunvoNachDatum, baurechtAusRoh, gebaeudeklasseAbleiten, leerePruefung, merkmaleAusRoh, merkmalSetzen, projektFakten, pruefungSetzen, widersprueche } from './projekt';

const rechteck = (b: number, t: number) => [
  { x: 0, y: 0 },
  { x: b, y: 0 },
  { x: b, y: t },
  { x: 0, y: t },
];

/** Einfamilienhaus: EG und OG je 10 × 10 m, eine Wohnung, Geschosshöhe 2,90 m */
function haus(geschosse = 2, wohnungen = 1, flaeche = 10): Project {
  const p = createProject('Haus');
  p.storeys = Array.from({ length: geschosse }, (_, i) => {
    const s = createStorey(i === 0 ? 'EG' : `${i}. OG`, 2.9);
    const raum = createRoom(rechteck(flaeche - 1, flaeche - 1), `${i}.01`, 'Wohnen');
    raum.wofl = { kategorie: 'voll', wohnung: `WE ${String((i % wohnungen) + 1).padStart(2, '0')}` };
    s.shapes = [createOutline(rechteck(flaeche, flaeche)), raum];
    return s;
  });
  return p;
}

describe('Abschnitt baurecht und Merkmale', () => {
  const roh = {
    format: 'arch-flaechen-tool',
    meta: { projektcode: 'X' },
    formulare: { aktiveFassung: 'BAUA 2', antraege: { 'BAUA 2': { merkmale: { Gebäudeklasse: '2', Verfahren: 'vereinfachtes Verfahren' } } } },
    kosten: { positionen: [1] },
  };

  it('aktiver Antrag und Merkmale aus Formulare', () => {
    expect(aktiverAntrag(roh)).toBe('BAUA 2');
    expect(merkmaleAusRoh(roh, 'BAUA 2')).toEqual({ Gebäudeklasse: '2', Verfahren: 'vereinfachtes Verfahren' });
    expect(aktiverAntrag({ meta: {} })).toBe('Projekt');
    expect(merkmaleAusRoh({ meta: { merkmale: { Sonderbau: 'nein' } } }, 'Projekt')).toEqual({ Sonderbau: 'nein' });
  });

  it('Merkmal setzen: im Antrag, alles andere bleibt', () => {
    const neu = merkmalSetzen(roh, 'BAUA 2', 'Gebäudeklasse', '3');
    expect(merkmaleAusRoh(neu, 'BAUA 2')['Gebäudeklasse']).toBe('3');
    expect(neu.kosten).toEqual(roh.kosten);
    expect(roh.formulare.antraege['BAUA 2'].merkmale['Gebäudeklasse']).toBe('2'); // Eingabe unverändert
    expect(merkmaleAusRoh(merkmalSetzen(roh, 'BAUA 2', 'Gebäudeklasse', ''), 'BAUA 2')['Gebäudeklasse']).toBeUndefined();
    const ohne = merkmalSetzen({ meta: {} }, 'Projekt', 'Sonderbau', 'nein');
    expect(merkmaleAusRoh(ohne, 'Projekt')).toEqual({ Sonderbau: 'nein' });
  });

  it('Prüfung je Antrag schreiben und lesen; Ungültiges fällt weg', () => {
    const p = leerePruefung();
    p.einreichung = '2026-12-01';
    p.fakten['schutz.lsg'] = { wert: false, herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'LINFOS' };
    p.festlegungen['bund/bnatschg/44'] = { ampel: 'gruen', grund: 'Begehung', von: 'TP', am: '2026-11-12', automatisch: 'gelb', bestaetigt: '2026-11-12T10:00' };
    const neu = pruefungSetzen(roh, 'BAUA 2', p);
    expect(baurechtAusRoh(neu).pruefungen['BAUA 2']).toEqual(p);
    expect(neu.formulare).toEqual(roh.formulare);
    const kaputt = baurechtAusRoh({ baurecht: { pruefungen: { A: { festlegungen: { x: { ampel: 'lila', grund: 'g' }, y: { ampel: 'rot', grund: '' } }, fakten: { f: { wert: {} } } } } } });
    expect(kaputt.pruefungen.A).toEqual(leerePruefung());
  });

  it('Zusammenführen mit Änderungen einer anderen Instanz: je Eintrag, unbekannte Felder bleiben, Konflikte werden gemeldet', () => {
    const basis = leerePruefung();
    basis.fakten.a = { wert: true, herkunft: 'manuell', sicherheit: 'sicher' };
    basis.festlegungen['x/y/1'] = { ampel: 'rot', grund: 'Grund eins', von: 'A', am: '2026-11-01', automatisch: 'gelb', bestaetigt: '2026-11-01T10:00' };
    basis.protokolle = [{ am: '2026-11-01T11:00', von: 'A', paket: 'p', einreichung: '2026-12-01', fassungen: {}, zaehler: { rot: 1, gelb: 0, gruen: 0 }, ampeln: {}, offen: 0 }];
    const geschrieben = pruefungSetzen(roh, 'BAUA 2', basis);
    // die andere Instanz: neues Feld einer neueren App-Version, neue Angabe b, neue Festlegung, eigenes Protokoll
    const andere = structuredClone(geschrieben) as { baurecht: { pruefungen: Record<string, Record<string, Record<string, unknown> | unknown[]>> } };
    const ihre = andere.baurecht.pruefungen['BAUA 2'];
    (ihre.fakten as Record<string, unknown>).a = { ...(ihre.fakten as Record<string, Record<string, unknown>>).a, zukunft: 42 };
    (ihre.fakten as Record<string, unknown>).b = { wert: 3, herkunft: 'manuell', sicherheit: 'sicher' };
    (ihre.festlegungen as Record<string, unknown>)['x/y/2'] = { ampel: 'gelb', grund: 'Grund zwei', von: 'B', am: '2026-11-02', automatisch: 'rot', bestaetigt: '2026-11-02T10:00' };
    (ihre.festlegungen as Record<string, Record<string, unknown>>)['x/y/1'].grund = 'von B geändert';
    (ihre.protokolle as unknown[]).push({ am: '2026-11-02T11:00', von: 'B', zukunft: true });
    // diese Instanz: c neu, Festlegung x/y/1 ebenfalls geändert, ein Protokoll
    const meine = structuredClone(basis);
    meine.fakten.c = { wert: 'z', herkunft: 'manuell', sicherheit: 'sicher' };
    meine.festlegungen['x/y/1'] = { ...basis.festlegungen['x/y/1'], grund: 'von mir geändert' };
    meine.protokolle = [...basis.protokolle, { ...basis.protokolle[0], am: '2026-11-03T11:00' }];
    const konflikte: string[] = [];
    const ergebnis = pruefungSetzen(andere as unknown as Record<string, unknown>, 'BAUA 2', meine, basis, { konflikte });
    const roheP = (ergebnis.baurecht as { pruefungen: Record<string, Record<string, Record<string, Record<string, unknown>> | unknown[]>> }).pruefungen['BAUA 2'];
    const f = roheP.fakten as Record<string, Record<string, unknown>>;
    expect(f.a.zukunft).toBe(42);
    expect(f.b.wert).toBe(3);
    expect(f.c.wert).toBe('z');
    const fl = roheP.festlegungen as Record<string, Record<string, unknown>>;
    expect(fl['x/y/2'].grund).toBe('Grund zwei');
    expect(fl['x/y/1'].grund).toBe('von mir geändert');
    expect(konflikte).toEqual(['Festlegung x/y/1']);
    expect((roheP.protokolle as { am: string }[]).map((p) => p.am)).toEqual(['2026-11-01T11:00', '2026-11-02T11:00', '2026-11-03T11:00']);
    expect((roheP.protokolle as Record<string, unknown>[])[1].zukunft).toBe(true);
  });

  it('fehlt die Sicherheit einer Angabe, gilt sie nur als Hinweis', () => {
    const p = baurechtAusRoh({ baurecht: { pruefungen: { A: { fakten: { f: { wert: false, herkunft: 'geodienst' } } } } } });
    expect(p.pruefungen.A.fakten.f.sicherheit).toBe('hinweis');
  });
});

describe('Fakten aus dem Projekt', () => {
  it('BauNVO nach Plandatum', () => {
    expect(baunvoNachDatum('1965-05-01')).toBe('1962');
    expect(baunvoNachDatum('1975-05-01')).toBe('1968');
    expect(baunvoNachDatum('1985-05-01')).toBe('1977');
    expect(baunvoNachDatum('2005-05-01')).toBe('1990');
  });

  it('Einfamilienhaus: Höhe 2,90 m, eine Wohnung → Gebäudeklasse 1 oder 2 (freistehend offen)', () => {
    const gk = gebaeudeklasseAbleiten(haus())!;
    expect(gk.hoehe).toBe(2.9);
    expect(gk.klassen).toEqual(['1', '2']);
    expect(gk.hinweis).toBe(true); // Gelände nicht festgelegt
    expect(gebaeudeklasseAbleiten(haus(), { freistehend: true })!.klassen).toEqual(['1']);
  });

  it('Mehrfamilienhaus mit 4 Geschossen: Höhe 8,70 m → Gebäudeklasse 4', () => {
    const p = haus(4, 4);
    p.massNutzung = { gelaende: 0 };
    const gk = gebaeudeklasseAbleiten(p)!;
    expect(gk.hoehe).toBe(8.7);
    expect(gk.klassen).toEqual(['4']);
    expect(gk.hinweis).toBe(false);
  });

  it('Widerspruch zwischen Merkmal und Ableitung', () => {
    const gk = gebaeudeklasseAbleiten(haus(4, 4))!;
    const w = widersprueche({ Gebäudeklasse: '2' }, gk);
    expect([...w.merkmale]).toEqual(['Gebäudeklasse']);
    expect(w.texte[0]).toMatch(/Gebäudeklasse 2 festgelegt, nach dem Modell 4/);
    expect(widersprueche({ Gebäudeklasse: '4' }, gk).merkmale.size).toBe(0);
  });

  it('Fakten: Flächen, Wohnungen, Höhe (als Hinweis ohne Gelände), Festsetzungen', () => {
    const p = haus();
    p.meta.adresse.ort = 'Soest';
    p.massNutzung = { gebietsart: 'WA', planDatum: '1985-03-01' };
    const f = projektFakten(p, '2026-11-12');
    expect(f['gebaeude.bgf'].wert).toBe(200);
    expect(f['gebaeude.wohnungen'].wert).toBe(1);
    expect(f['planung.gebietsart'].wert).toBe('WA');
    expect(f['planung.baunvo'].wert).toBe('1977');
    expect(f['lage.gemeinde'].wert).toBe('Soest');
    expect(f['gebaeude.hoehe']).toMatchObject({ wert: 2.9 });
  });
});
