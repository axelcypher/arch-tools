import { describe, expect, it } from 'vitest';
import type { Bedingung } from './bedingung';
import { bedingungAus, bedingungText, erfuellt, fehlendeMerkmale, merkmaleAus, VORGABE_MERKMALE } from './bedingung';
import type { Abschnitt, Feld } from './forma/felder';
import type { FormularProfil } from './profil';
import { bereinigt, einheiten, feldErforderlich, formularKontext, leeresProfil } from './profil';
import { fuellstand } from './antrag';

const gk345: Bedingung = [{ art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['3', '4', '5'] }];

describe('Bedingungen', () => {
  it('Projektmerkmal: einer der Werte; fehlt der Wert im Projekt, trifft sie nicht zu', () => {
    expect(erfuellt(gk345, { merkmale: { Gebäudeklasse: '3' } })).toBe(true);
    expect(erfuellt(gk345, { merkmale: { Gebäudeklasse: '2' } })).toBe(false);
    expect(erfuellt(gk345, { merkmale: {} })).toBe(false);
    expect(fehlendeMerkmale(gk345, {})).toEqual(['Gebäudeklasse']);
    expect(erfuellt(undefined, { merkmale: {} })).toBe(true);
    expect(erfuellt([], { merkmale: {} })).toBe(true);
  });

  it('Feld: angekreuzt/ausgefüllt, leer, gleich – alle Teile müssen zutreffen', () => {
    const werte: Record<string, string | boolean> = { '0:Sonderbau': true, '0:Art': 'Neubau', '0:Leer': '  ' };
    const k = { merkmale: { Gebäudeklasse: '4' }, wert: (s: string) => werte[s] };
    expect(erfuellt([{ art: 'feld', feld: '0:Sonderbau', pruefung: 'ausgefuellt' }], k)).toBe(true);
    expect(erfuellt([{ art: 'feld', feld: '0:Leer', pruefung: 'leer' }], k)).toBe(true);
    expect(erfuellt([{ art: 'feld', feld: '0:Art', pruefung: 'gleich', wert: 'neubau' }], k)).toBe(true);
    expect(erfuellt([...gk345, { art: 'feld', feld: '0:Sonderbau', pruefung: 'leer' }], k)).toBe(false);
  });

  it('in Worten', () => {
    const name = (s: string) => (s === '0:SB' ? { titel: 'Sonderbau', kreuz: true } : undefined);
    expect(bedingungText([...gk345, { art: 'feld', feld: '0:SB', pruefung: 'ausgefuellt' }], name)).toBe('Gebäudeklasse 3, 4 oder 5 und „Sonderbau“ angekreuzt');
  });

  it('gelesene Bedingungen und Merkmale werden geprüft', () => {
    expect(bedingungAus([{ art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['3', 7] }, { art: 'feld', feld: '', pruefung: 'leer' }, { art: 'x' }])).toEqual([{ art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['3'] }]);
    expect(bedingungAus('kaputt')).toBeUndefined();
    expect(merkmaleAus(null)).toEqual(VORGABE_MERKMALE);
    expect(merkmaleAus([{ name: ' GK ', werte: ['1', ' 2 ', ''] }, { name: '' }])).toEqual([{ name: 'GK', werte: ['1', '2'] }]);
  });
});

describe('Bedingungen in der Gliederung', () => {
  const feld = (name: string, art: 'text' | 'kreuz', y: number): Feld =>
    ({ schluessel: `0:${name}`, seite: 0, name, art, beschriftung: name, abschnitt: 'A', kasten: { x: 0, y, b: 20, h: 14 }, einzeilig: true, original: '' }) as unknown as Feld;
  const sonderbau = feld('Sonderbau', 'kreuz', 0);
  const brandschutz = feld('Brandschutz', 'text', 20);
  const name = feld('Name', 'text', 40);
  const a: Abschnitt = { titel: 'A', felder: [sonderbau, brandschutz, name], rahmen: null };
  const profil: FormularProfil = {
    ...leeresProfil(),
    bedingungen: { '0:Brandschutz': [{ art: 'feld', feld: '0:Sonderbau', pruefung: 'ausgefuellt' }] },
  };

  it('ein angekreuztes Feld schaltet weitere erforderliche Felder frei', () => {
    const werte: Record<string, string | boolean> = {};
    const wert = (f: Feld) => werte[f.schluessel] ?? (f.art === 'kreuz' ? false : '');
    const k = () => formularKontext({}, a.felder, wert);
    const zaehlen = () => einheiten(a, profil, k()).filter((e) => !e.entfaellt).map((e) => e.id);
    expect(zaehlen()).toEqual(['0:Sonderbau', '0:Name']);
    expect(feldErforderlich(brandschutz, a, profil, k())).toBe(false);
    werte['0:Sonderbau'] = true;
    expect(zaehlen()).toEqual(['0:Sonderbau', '0:Brandschutz', '0:Name']);
    expect(feldErforderlich(brandschutz, a, profil, k())).toBe(true);
  });

  it('Abschnitte nach Projektmerkmal – der Füllstand zählt nur erforderliche', () => {
    const p: FormularProfil = { ...profil, abschnitte: { '0:-': { bedingung: gk345 } } };
    const wert = (f: Feld) => (f === name ? 'Muster' : f.art === 'kreuz' ? false : '');
    expect(fuellstand([a.felder], p, wert, { Gebäudeklasse: '2' })).toEqual({ gefuellt: 0, gesamt: 0 });
    expect(fuellstand([a.felder], p, wert, { Gebäudeklasse: '3' })).toEqual({ gefuellt: 1, gesamt: 2 });
  });

  it('bereinigt behält Bedingungen an Abschnitten, Gruppen und Feldern', () => {
    const p = bereinigt({ ...profil, abschnitte: { '0:-': { bedingung: gk345 } }, gruppen: [{ id: 'g1', regel: 'eins', felder: ['0:Name'], bedingung: gk345 }] });
    expect(p.abschnitte['0:-'].bedingung).toEqual(gk345);
    expect(p.gruppen?.[0].bedingung).toEqual(gk345);
    expect(p.bedingungen).toEqual(profil.bedingungen);
  });
});
