import { beforeEach, describe, expect, it } from 'vitest';
import { readProjectFile } from '@core/archive';
import { baurechtAusRoh, merkmaleAusRoh } from '@core/baurecht/projekt';
import type { ParagrafErgebnis } from '@core/baurecht/typen';
import { projektdateiRoh } from '@core/projektdatei';
import { beispielOap } from './beispiel.test';
import { aenderungenAnwenden } from './projekt';
import { alleFakten } from './pruefung';
import { istGeaendert, offeneBestaetigungen, offeneFestlegungen, useBaurecht } from './store';

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
    const roh = aenderungenAnwenden(useBaurecht.getState().roh!);
    expect(merkmaleAusRoh(roh, 'BAUA 1')['Gebäudeklasse']).toBe('2');
    const p = baurechtAusRoh(roh).pruefungen['BAUA 1'];
    expect(p.festlegungen['bund/bnatschg/44']).toMatchObject({ ampel: 'gruen', automatisch: 'gelb', von: 'TP', stand: { '44/1': 'abcd1234' } });
    expect(p.festlegungen['bund/bnatschg/44'].bestaetigt).toMatch(/^\d{4}-/);
    expect(p.fakten['gebaeude.beheizt']).toMatchObject({ wert: true, herkunft: 'manuell' });
    // nach dem Speichern gilt der neue Stand als unverändert, nichts ist mehr offen
    useBaurecht.getState().gespeichert(roh);
    expect(istGeaendert(useBaurecht.getState())).toBe(false);
    expect(offeneFestlegungen(useBaurecht.getState())).toEqual([]);
  });

  it('Geodienst: Angaben von Hand bleiben (Widerspruch wird vermerkt), ein Treffer geht einem bestätigten „kein Treffer“ vor', () => {
    const st = useBaurecht.getState();
    st.faktSetzen('schutz.lsg', false, 'TP');
    st.geoFakten({ 'schutz.nsg': { wert: false, herkunft: 'geodienst', sicherheit: 'hinweis', lage: '1,1' } });
    st.faktBestaetigen('schutz.nsg', useBaurecht.getState().pruefung.fakten['schutz.nsg'], 'TP', 'Auskunft UNB vom 02.11.2026', '1,1');
    st.geoFakten({ 'schutz.lsg': { wert: true, herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'LINFOS' }, 'schutz.nsg': { wert: true, herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'LINFOS', lage: '1,1' } });
    const f = useBaurecht.getState().pruefung.fakten;
    expect(f['schutz.lsg']).toMatchObject({ wert: false, herkunft: 'manuell' });
    expect(f['schutz.lsg'].widerspruch).toMatch(/LINFOS meldet „ja“/);
    expect(f['schutz.nsg']).toMatchObject({ wert: true, herkunft: 'geodienst', sicherheit: 'sicher' });
    expect(f['schutz.nsg'].bestaetigt).toBeUndefined();
  });

  it('aufgehobene Festlegungen und neue Bestätigungen sind offen; „ohne“ setzt sie auf den Stand der Datei', () => {
    const st = useBaurecht.getState();
    st.festlegen(ergebnis('bund/bnatschg/44'), 'rot', 'Festlegung mit Begründung', 'TP', {}, {});
    st.festlegungenBestaetigen(['bund/bnatschg/44']);
    useBaurecht.getState().gespeichert(aenderungenAnwenden(useBaurecht.getState().roh!));
    expect(offeneFestlegungen(useBaurecht.getState())).toEqual([]);
    useBaurecht.getState().festlegungAufheben('bund/bnatschg/44');
    expect(offeneFestlegungen(useBaurecht.getState())).toEqual(['bund/bnatschg/44']);
    useBaurecht.getState().faktBestaetigen('gebaeude.nutzflaeche', { wert: 40, herkunft: 'flaechen', sicherheit: 'hinweis' }, 'TP', 'Modell vollständig geprüft');
    expect(offeneBestaetigungen(useBaurecht.getState())).toEqual(['gebaeude.nutzflaeche']);
    useBaurecht.getState().aufDateistand(['bund/bnatschg/44'], ['gebaeude.nutzflaeche']);
    expect(useBaurecht.getState().pruefung.festlegungen['bund/bnatschg/44']).toMatchObject({ ampel: 'rot' });
    expect(useBaurecht.getState().pruefung.fakten['gebaeude.nutzflaeche']).toBeUndefined();
    expect(istGeaendert(useBaurecht.getState())).toBe(false);
  });

  it('Angabe von Hand gegen einen Treffer: mit Begründung, Widerspruch bleibt, braucht die zweite Bestätigung', () => {
    const st = useBaurecht.getState();
    st.geoFakten({ 'schutz.lsg': { wert: true, herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'LINFOS', stand: '2026-11-12' } });
    useBaurecht.getState().faktSetzen('schutz.lsg', false, 'TP', 'Auskunft UNB vom 03.11.2026: außerhalb');
    const f = useBaurecht.getState().pruefung.fakten['schutz.lsg'];
    expect(f).toMatchObject({ wert: false, herkunft: 'manuell', bestaetigt: { von: 'TP', grund: 'Auskunft UNB vom 03.11.2026: außerhalb' } });
    expect(f.widerspruch).toMatch(/LINFOS meldet „ja“/);
    expect(offeneBestaetigungen(useBaurecht.getState())).toContain('schutz.lsg');
  });

  it('bestätigter Wert aus dem Modell gilt nur, solange das Modell denselben Wert liefert', () => {
    const s = useBaurecht.getState();
    const project = s.project!;
    const modell = alleFakten(project, {}, s.paket.module);
    const id = Object.keys(modell).find((k) => modell[k].herkunft === 'flaechen' && typeof modell[k].wert === 'number')!;
    expect(id, 'ein Wert aus dem Flächenrechner').toBeTruthy();
    const bestaetigt = { ...modell[id], bestaetigt: { von: 'TP', am: '2026-11-12', grund: 'Modell vollständig' } };
    expect(alleFakten(project, { [id]: bestaetigt }, s.paket.module)[id].bestaetigt).toBeTruthy();
    // früher bestätigt: ein anderer Wert → die Bestätigung verfällt, der aktuelle Wert gilt als Hinweis
    const alt = { ...bestaetigt, wert: (modell[id].wert as number) + 7 };
    const jetzt = alleFakten(project, { [id]: alt }, s.paket.module)[id];
    expect(jetzt.wert).toBe(modell[id].wert);
    expect(jetzt.bestaetigt).toBeUndefined();
    expect(jetzt.sicherheit).toBe('hinweis');
    expect(jetzt.grund).toMatch(/seit der Bestätigung geändert/);
  });

  it('gespeichert mit „seit“: Änderungen während des Schreibens bleiben in der App und gelten als ungespeichert', () => {
    useBaurecht.getState().faktSetzen('gebaeude.beheizt', true, 'TP');
    const vorher = useBaurecht.getState();
    const seit = { pruefung: structuredClone(vorher.pruefung), merkmale: { ...vorher.merkmale } };
    const roh = aenderungenAnwenden(vorher.roh!);
    // während des Schreibens: weitere Angabe, Merkmal geändert, Einreichung gesetzt
    useBaurecht.getState().faktSetzen('gebaeude.wohnungen', 3, 'TP');
    useBaurecht.getState().merkmalSetzen('Gebäudeklasse', '3');
    useBaurecht.getState().einreichungSetzen('2027-01-15');
    useBaurecht.getState().gespeichert(roh, undefined, seit);
    const s = useBaurecht.getState();
    expect(s.pruefungDatei.fakten['gebaeude.beheizt']).toMatchObject({ wert: true });
    expect(s.pruefungDatei.fakten['gebaeude.wohnungen']).toBeUndefined();
    expect(s.pruefung.fakten['gebaeude.wohnungen']).toMatchObject({ wert: 3 });
    expect(s.merkmale['Gebäudeklasse']).toBe('3');
    expect(s.pruefung.einreichung).toBe('2027-01-15');
    expect(istGeaendert(s)).toBe(true);
  });

  it('gespeichert ohne „seit“: der Stand der Datei gilt, nichts ist ungespeichert', () => {
    useBaurecht.getState().faktSetzen('gebaeude.beheizt', true, 'TP');
    const roh = aenderungenAnwenden(useBaurecht.getState().roh!);
    useBaurecht.getState().gespeichert(roh);
    expect(useBaurecht.getState().pruefung.fakten['gebaeude.beheizt']).toMatchObject({ wert: true });
    expect(istGeaendert(useBaurecht.getState())).toBe(false);
  });

  it('aufgehobene Festlegung lässt sich unverändert wiederherstellen (Rückgängig)', () => {
    const st = useBaurecht.getState();
    st.festlegen(ergebnis('bund/bnatschg/44'), 'gruen', 'Begehung am 03.11.2026 ohne Befund', 'TP', { '44/1': 'abcd1234' }, {});
    const f = structuredClone(useBaurecht.getState().pruefung.festlegungen['bund/bnatschg/44']);
    useBaurecht.getState().festlegungAufheben('bund/bnatschg/44');
    expect(useBaurecht.getState().pruefung.festlegungen['bund/bnatschg/44']).toBeUndefined();
    useBaurecht.getState().festlegungWiederherstellen('bund/bnatschg/44', f);
    expect(useBaurecht.getState().pruefung.festlegungen['bund/bnatschg/44']).toEqual(f);
  });

  it('Rückgängig nach dem Speichern: die Festlegung ist wieder Entwurf und braucht die zweite Bestätigung', () => {
    const st = useBaurecht.getState();
    st.festlegen(ergebnis('bund/bnatschg/44'), 'gruen', 'Begehung am 03.11.2026 ohne Befund', 'TP', {}, {});
    st.festlegungenBestaetigen(['bund/bnatschg/44']);
    useBaurecht.getState().gespeichert(aenderungenAnwenden(useBaurecht.getState().roh!));
    const f = structuredClone(useBaurecht.getState().pruefung.festlegungen['bund/bnatschg/44']);
    expect(f.bestaetigt).toBeTruthy();
    // aufheben und speichern (bestätigt), dann Rückgängig
    useBaurecht.getState().festlegungAufheben('bund/bnatschg/44');
    useBaurecht.getState().gespeichert(aenderungenAnwenden(useBaurecht.getState().roh!));
    useBaurecht.getState().festlegungWiederherstellen('bund/bnatschg/44', f);
    const jetzt = useBaurecht.getState().pruefung.festlegungen['bund/bnatschg/44'];
    expect(jetzt.bestaetigt).toBeUndefined();
    expect(offeneFestlegungen(useBaurecht.getState())).toEqual(['bund/bnatschg/44']);
    // auch eine abweichende Festlegung mit altem „bestätigt“ gilt als offen
    useBaurecht.setState({ pruefung: { ...useBaurecht.getState().pruefung, festlegungen: { 'bund/bnatschg/44': f } } });
    expect(offeneFestlegungen(useBaurecht.getState())).toEqual(['bund/bnatschg/44']);
  });

  it('anderer Antrag: eigene Prüfung, Merkmale neu gelesen', () => {
    useBaurecht.getState().faktSetzen('gebaeude.beheizt', true, 'TP');
    useBaurecht.getState().antragWaehlen('BAUA 2');
    expect(useBaurecht.getState().pruefung.fakten['gebaeude.beheizt']).toBeUndefined();
    expect(useBaurecht.getState().merkmale).toEqual({});
  });
});
