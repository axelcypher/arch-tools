import { describe, expect, it } from 'vitest';
import type { Bedingung } from './bedingung';
import { gruppe } from './bedingung';
import type { FormularProfil } from './profil';
import { leeresProfil } from './profil';
import { abweichung, abweichungAus, herkunft, istLeer, ohneEigenes, wirksam } from './vorgabe';

const efh: Bedingung = gruppe('und', [{ art: 'merkmal', merkmal: 'Gebäudeart', werte: ['Einfamilienhaus'], nicht: true }]);
const gk345: Bedingung = gruppe('und', [{ art: 'merkmal', merkmal: 'Gebäudeklasse', werte: ['3', '4', '5'] }]);

const V: FormularProfil = {
  abschnitte: { '0:Punkt6': { titel: '6. Sonderbau', bedingung: efh }, '0:Punkt1': { titel: '1. Bauherrschaft' } },
  zaehlt: { '0:Behoerde': false },
  feldTitel: { '0:Edit1': 'Name', '0:Edit2': 'Vorname' },
  gruppen: [{ id: 'v:gk', titel: 'Gebäudeklasse', regel: 'eins', felder: ['0:GK1', '0:GK2', '0:GK3'] }],
  bedingungen: { '0:Brandschutz': gk345 },
};

describe('Vorgabe und eigene Einstellungen', () => {
  it('ohne eigene Einstellungen gilt die Vorgabe', () => {
    expect(wirksam(V, undefined)).toEqual(V);
    expect(wirksam(undefined, undefined)).toEqual(leeresProfil());
  });

  it('eigene Änderungen gehen vor – gespeichert wird nur, was abweicht', () => {
    const p: FormularProfil = structuredClone(V);
    p.feldTitel!['0:Edit1'] = 'Name/Firma';
    delete p.bedingungen!['0:Brandschutz']; // ausdrücklich immer erforderlich
    p.abschnitte['0:Punkt6'] = { titel: '6. Sonderbau' }; // Bedingung entfernt
    p.zaehlt = {}; // zählt doch
    p.gruppen![0] = { ...p.gruppen![0], regel: 'alle' };
    p.gruppen!.push({ id: 'g1', regel: 'eins', felder: ['0:X', '0:Y'] });
    const e = abweichung(V, p);
    expect(e).toEqual({
      abschnitte: { '0:Punkt6': { bedingung: null } },
      zaehlt: { '0:Behoerde': true },
      feldTitel: { '0:Edit1': 'Name/Firma' },
      bedingungen: { '0:Brandschutz': null },
      gruppen: [
        { id: 'v:gk', titel: 'Gebäudeklasse', regel: 'alle', felder: ['0:GK1', '0:GK2', '0:GK3'] },
        { id: 'g1', regel: 'eins', felder: ['0:X', '0:Y'] },
      ],
    });
    expect(wirksam(V, e)).toEqual({ ...p, zaehlt: {}, bedingungen: undefined });
    // gespeichert und wieder gelesen (JSON mit null) – gleiches Ergebnis
    expect(wirksam(V, abweichungAus(JSON.parse(JSON.stringify(e)))!)).toEqual(wirksam(V, e));
    // unverändert: keine Abweichung
    expect(istLeer(abweichung(V, structuredClone(V)))).toBe(true);
  });

  it('eine Vorgabe-Gruppe auflösen, eigene Gruppen nehmen ihr Felder weg', () => {
    const ohne = abweichung(V, { ...structuredClone(V), gruppen: [] });
    expect(ohne.ohneGruppen).toEqual(['v:gk']);
    expect(wirksam(V, ohne).gruppen).toBeUndefined();
    // eine eigene Gruppe mit GK3: die Vorgabe-Gruppe behält nur GK1, GK2
    const e = { abschnitte: {}, zaehlt: {}, gruppen: [{ id: 'g1', regel: 'eins' as const, felder: ['0:GK3', '0:GK4'] }] };
    expect(wirksam(V, e).gruppen).toEqual([
      { id: 'v:gk', titel: 'Gebäudeklasse', regel: 'eins', felder: ['0:GK1', '0:GK2'] },
      { id: 'g1', regel: 'eins', felder: ['0:GK3', '0:GK4'] },
    ]);
  });

  it('spätere Verbesserungen der Vorgabe kommen an – außer, wo man selbst etwas geändert hat', () => {
    const e = abweichung(V, { ...structuredClone(V), feldTitel: { '0:Edit1': 'Name/Firma', '0:Edit2': 'Vorname' } });
    const V2: FormularProfil = { ...structuredClone(V), feldTitel: { '0:Edit1': 'Name', '0:Edit2': 'Vorname(n)', '0:Edit3': 'Straße' } };
    expect(wirksam(V2, e).feldTitel).toEqual({ '0:Edit1': 'Name/Firma', '0:Edit2': 'Vorname(n)', '0:Edit3': 'Straße' });
  });

  it('frühere vollständige Profile gelten ganz als eigene Einstellungen', () => {
    const alt = { abschnitte: { '0:Punkt6': { sichtbar: false } }, zaehlt: { '0:A': false }, gruppen: [{ id: 'g1', regel: 'eins', felder: ['0:GK1'] }] };
    const e = abweichungAus(alt)!;
    const p = wirksam(V, e);
    expect(p.abschnitte['0:Punkt6']).toEqual({ sichtbar: false, titel: '6. Sonderbau', bedingung: efh });
    expect(p.gruppen?.find((g) => g.id === 'v:gk')?.felder).toEqual(['0:GK2', '0:GK3']);
    expect(abweichungAus('kaputt')).toBeNull();
  });

  it('Herkunft je Eintrag und eigene Änderung verwerfen', () => {
    const e = abweichung(V, { ...structuredClone(V), feldTitel: { '0:Edit1': 'Name/Firma', '0:Edit2': 'Vorname' } });
    expect(herkunft(V, e, { art: 'feld', id: '0:Edit1' })).toBe('eigen');
    expect(herkunft(V, e, { art: 'feld', id: '0:Edit2' })).toBe('vorgabe');
    expect(herkunft(V, e, { art: 'feld', id: '0:Sonst' })).toBeNull();
    expect(herkunft(V, e, { art: 'gruppe', id: 'v:gk' })).toBe('vorgabe');
    expect(herkunft(V, e, { art: 'abschnitt', id: '0:Punkt6' })).toBe('vorgabe');
    expect(istLeer(ohneEigenes(e, { art: 'feld', id: '0:Edit1' }))).toBe(true);
  });
});
