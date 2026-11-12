import { beforeEach, describe, expect, it } from 'vitest';
import { readProjectFile } from '@core/archive';
import { baurechtAusRoh, merkmaleAusRoh } from '@core/baurecht/projekt';
import type { ParagrafErgebnis } from '@core/baurecht/typen';
import { projektdateiRoh } from '@core/projektdatei';
import { beispielOap } from './beispiel.test';
import { aenderungenAnwenden } from './projekt';
import { istGeaendert, offeneFestlegungen, useBaurecht } from './store';

const ergebnis = (id: string): ParagrafErgebnis =>
  ({ id, modul: 'bund', norm: 'bnatschg', paragraf: '44', titel: 'Artenschutz', ampel: 'gelb', automatisch: 'gelb', gruende: ['x'], hinweise: [], offen: [], unsicher: [], geaendert: [], verwendet: ['merkmal:Vorhaben'], fundstellen: ['44/1'] }) as ParagrafErgebnis;

describe('Zustand der App', () => {
  beforeEach(() => {
    const bytes = beispielOap();
    useBaurecht.getState().projektSetzen({ art: 'datei', name: 'EFH.oap', bytes }, readProjectFile(bytes), projektdateiRoh(bytes));
  });

  it('liest aktiven Antrag und Merkmale aus Formulare', () => {
    const s = useBaurecht.getState();
    expect(s.antrag).toBe('BAUA 1');
    expect(s.merkmale['Gebäudeart']).toBe('Einfamilienhaus');
    expect(istGeaendert(s)).toBe(false);
  });

  it('Festlegung ist Entwurf, bis sie bestätigt wird; geänderte Merkmale und Prüfung landen in projekt.json', () => {
    const st = useBaurecht.getState();
    st.festlegen(ergebnis('bund/bnatschg/44'), 'gruen', 'Begehung am 03.11.2026 ohne Befund', 'TP', { '44/1': 'abcd1234' }, { 'merkmal:Vorhaben': 'Errichtung' });
    st.merkmalSetzen('Gebäudeklasse', '2');
    st.faktSetzen('gebaeude.beheizt', true, 'TP');
    expect(istGeaendert(useBaurecht.getState())).toBe(true);
    expect(offeneFestlegungen(useBaurecht.getState())).toEqual(['bund/bnatschg/44']);
    useBaurecht.getState().festlegungenBestaetigen(['bund/bnatschg/44']);
    expect(offeneFestlegungen(useBaurecht.getState())).toEqual([]);
    const roh = aenderungenAnwenden(useBaurecht.getState().roh!);
    expect(merkmaleAusRoh(roh, 'BAUA 1')['Gebäudeklasse']).toBe('2');
    const p = baurechtAusRoh(roh).pruefungen['BAUA 1'];
    expect(p.festlegungen['bund/bnatschg/44']).toMatchObject({ ampel: 'gruen', automatisch: 'gelb', von: 'TP', stand: { '44/1': 'abcd1234' } });
    expect(p.festlegungen['bund/bnatschg/44'].bestaetigt).toMatch(/^\d{4}-/);
    expect(p.fakten['gebaeude.beheizt']).toMatchObject({ wert: true, herkunft: 'manuell' });
    // nach dem Speichern gilt der neue Stand als unverändert
    useBaurecht.getState().gespeichert(roh);
    expect(istGeaendert(useBaurecht.getState())).toBe(false);
  });

  it('Geodienst überschreibt keine Angaben von Hand und keine bestätigten Werte', () => {
    const st = useBaurecht.getState();
    st.faktSetzen('schutz.lsg', true, 'TP');
    st.geoFakten({ 'schutz.lsg': { wert: false, herkunft: 'geodienst', sicherheit: 'hinweis' }, 'schutz.nsg': { wert: false, herkunft: 'geodienst', sicherheit: 'hinweis' } });
    const f = useBaurecht.getState().pruefung.fakten;
    expect(f['schutz.lsg']).toMatchObject({ wert: true, herkunft: 'manuell' });
    expect(f['schutz.nsg']).toMatchObject({ wert: false, herkunft: 'geodienst' });
  });

  it('anderer Antrag: eigene Prüfung, Merkmale neu gelesen', () => {
    useBaurecht.getState().faktSetzen('gebaeude.beheizt', true, 'TP');
    useBaurecht.getState().antragWaehlen('BAUA 2');
    expect(useBaurecht.getState().pruefung.fakten['gebaeude.beheizt']).toBeUndefined();
    expect(useBaurecht.getState().merkmale).toEqual({});
  });
});
