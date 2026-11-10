import { describe, expect, it } from 'vitest';
import type { Bedingung, Teilbedingung } from './bedingung';
import { bedingungAus, bedingungText, erfuellt, fehlendeMerkmale, gruppe, hatBedingung, merkmaleAus, nurMerkmale, VORGABE_MERKMALE } from './bedingung';
import type { Abschnitt, Feld } from './forma/felder';
import type { FormularProfil } from './profil';
import { bereinigt, einheiten, feldErforderlich, formularKontext, leeresProfil } from './profil';
import { fuellstand } from './antrag';

const gk345: Teilbedingung = { art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['3', '4', '5'] };
const und = (...t: Bedingung['teile']) => gruppe('und', t);
const oder = (...t: Bedingung['teile']) => gruppe('oder', t);

describe('Bedingungen', () => {
  it('Projektmerkmal: einer der Werte bzw. keiner davon; fehlt der Wert im Projekt, trifft sie nie zu', () => {
    expect(erfuellt(und(gk345), { merkmale: { Gebäudeklasse: '3' } })).toBe(true);
    expect(erfuellt(und(gk345), { merkmale: { Gebäudeklasse: '2' } })).toBe(false);
    expect(erfuellt(und(gk345), { merkmale: {} })).toBe(false);
    const nicht: Teilbedingung = { ...gk345, nicht: true };
    expect(erfuellt(und(nicht), { merkmale: { Gebäudeklasse: '2' } })).toBe(true);
    expect(erfuellt(und(nicht), { merkmale: { Gebäudeklasse: '4' } })).toBe(false);
    expect(erfuellt(und(nicht), { merkmale: {} })).toBe(false);
    expect(fehlendeMerkmale(und(gk345, oder({ art: 'merkmal', merkmal: 'Sonderbau', werte: ['ja'] })), {})).toEqual(['Gebäudeklasse', 'Sonderbau']);
    expect(erfuellt(undefined, { merkmale: {} })).toBe(true);
    expect(erfuellt(und(), { merkmale: {} })).toBe(true);
    expect(hatBedingung(und(oder()))).toBe(false);
  });

  it('Feld: angekreuzt/ausgefüllt, leer, gleich, ungleich', () => {
    const werte: Record<string, string | boolean> = { '0:Sonderbau': true, '0:Art': 'Neubau', '0:Leer': '  ' };
    const k = { merkmale: { Gebäudeklasse: '4' }, wert: (s: string) => werte[s] };
    expect(erfuellt(und({ art: 'feld', feld: '0:Sonderbau', pruefung: 'ausgefuellt' }), k)).toBe(true);
    expect(erfuellt(und({ art: 'feld', feld: '0:Leer', pruefung: 'leer' }), k)).toBe(true);
    expect(erfuellt(und({ art: 'feld', feld: '0:Art', pruefung: 'gleich', wert: 'neubau' }), k)).toBe(true);
    expect(erfuellt(und({ art: 'feld', feld: '0:Art', pruefung: 'ungleich', wert: 'Umbau' }), k)).toBe(true);
    expect(erfuellt(und({ art: 'feld', feld: '0:Art', pruefung: 'ungleich', wert: 'Neubau' }), k)).toBe(false);
  });

  it('und, oder und verschachtelte Gruppen', () => {
    const sonderbau: Teilbedingung = { art: 'feld', feld: '0:Sonderbau', pruefung: 'ausgefuellt' };
    const verfahren: Teilbedingung = { art: 'merkmal', merkmal: 'Verfahren', werte: ['Baugenehmigungsverfahren'] };
    // Gebäudeklasse 3–5 und (Sonderbau angekreuzt oder Baugenehmigungsverfahren)
    const b = und(gk345, oder(sonderbau, verfahren));
    const k = (gk: string, sb: boolean, v = '') => ({ merkmale: { Gebäudeklasse: gk, Verfahren: v }, wert: (s: string) => (s === '0:Sonderbau' ? sb : undefined) });
    expect(erfuellt(b, k('3', true))).toBe(true);
    expect(erfuellt(b, k('3', false, 'Baugenehmigungsverfahren'))).toBe(true);
    expect(erfuellt(b, k('3', false, 'vereinfachtes Verfahren'))).toBe(false);
    expect(erfuellt(b, k('2', true))).toBe(false);
    // oben „mindestens eine“
    expect(erfuellt(oder(gk345, sonderbau), k('1', true))).toBe(true);
    expect(erfuellt(oder(gk345, sonderbau), k('1', false))).toBe(false);
    // eine leere Untergruppe zählt nicht
    expect(erfuellt(und(gk345, oder()), k('4', false))).toBe(true);
  });

  it('in Worten – Untergruppen in Klammern', () => {
    const name = (s: string) => (s === '0:SB' ? { titel: 'Sonderbau', kreuz: true } : undefined);
    expect(bedingungText(und(gk345, { art: 'feld', feld: '0:SB', pruefung: 'ausgefuellt' }), name)).toBe('Gebäudeklasse 3, 4 oder 5 und „Sonderbau“ angekreuzt');
    expect(bedingungText(und(gk345, oder({ art: 'feld', feld: '0:SB', pruefung: 'ausgefuellt' }, { art: 'merkmal', merkmal: 'Verfahren', werte: ['Baugenehmigungsverfahren'], nicht: true })), name)).toBe(
      'Gebäudeklasse 3, 4 oder 5 und („Sonderbau“ angekreuzt oder Verfahren nicht Baugenehmigungsverfahren)',
    );
    expect(bedingungText(und({ art: 'merkmal', merkmal: 'Gebäudeklasse', werte: [] }))).toBe('Gebäudeklasse (noch kein Wert gewählt)');
  });

  it('gelesene Bedingungen: die frühere Liste wird zur Und-Gruppe, Unbekanntes fällt weg', () => {
    expect(bedingungAus([{ art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['3', 7] }, { art: 'feld', feld: '', pruefung: 'leer' }, { art: 'x' }])).toEqual(und({ art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['3'] }));
    expect(bedingungAus({ art: 'gruppe', op: 'oder', teile: [gk345, { art: 'gruppe', op: 'und', teile: [{ art: 'feld', feld: '0:A', pruefung: 'ungleich', wert: 'x' }] }] })).toEqual(
      oder(gk345, und({ art: 'feld', feld: '0:A', pruefung: 'ungleich', wert: 'x' })),
    );
    expect(bedingungAus('kaputt')).toBeUndefined();
    expect(bedingungAus({ art: 'gruppe', op: 'und', teile: [] })).toBeUndefined();
    expect(merkmaleAus(null)).toEqual(VORGABE_MERKMALE);
    expect(merkmaleAus([{ name: ' GK ', werte: ['1', ' 2 ', ''] }, { name: '' }])).toEqual([{ name: 'GK', werte: ['1', '2'] }]);
  });

  it('nur Projektmerkmale (für Dokumente des Projektumfangs)', () => {
    const feld: Teilbedingung = { art: 'feld', feld: '0:A', pruefung: 'leer' };
    expect(nurMerkmale(und(gk345, oder(feld)))).toEqual(und(gk345, oder()));
    expect(nurMerkmale(und(feld))).toBeUndefined();
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
    bedingungen: { '0:Brandschutz': und({ art: 'feld', feld: '0:Sonderbau', pruefung: 'ausgefuellt' }) },
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
    const p: FormularProfil = { ...profil, abschnitte: { '0:-': { bedingung: und(gk345) } } };
    const wert = (f: Feld) => (f === name ? 'Muster' : f.art === 'kreuz' ? false : '');
    expect(fuellstand([a.felder], p, wert, { Gebäudeklasse: '2' })).toEqual({ gefuellt: 0, gesamt: 0 });
    expect(fuellstand([a.felder], p, wert, { Gebäudeklasse: '3' })).toEqual({ gefuellt: 1, gesamt: 2 });
  });

  it('bereinigt behält Bedingungen an Abschnitten, Gruppen und Feldern – alte Listen werden übernommen', () => {
    const alt = [gk345] as unknown as Bedingung;
    const p = bereinigt({ ...profil, abschnitte: { '0:-': { bedingung: alt } }, gruppen: [{ id: 'g1', regel: 'eins', felder: ['0:Name'], bedingung: und(oder(gk345)) }] });
    expect(p.abschnitte['0:-'].bedingung).toEqual(und(gk345));
    expect(p.gruppen?.[0].bedingung).toEqual(und(oder(gk345)));
    expect(p.bedingungen).toEqual(profil.bedingungen);
  });
});
