// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { VORGABE_EXPORT, VORGABE_KATALOG, VORGABE_VORLAGEN, vorlagenAus } from './antrag';
import { useAntrag } from './antragStore';
import { VORGABE_MERKMALE } from './bedingung';
import { PERMIO_ENTWURF, entwurfAenderungen, entwurfSetzen, entwurfUebernehmen, entwurfVerwerfen, entwurfWert } from './einstellungsEntwurf';
import { useFormulare } from './store';

const lesen = (k: string) => JSON.parse(localStorage.getItem(k) ?? 'null');

beforeEach(() => {
  localStorage.clear();
  entwurfVerwerfen();
  useFormulare.setState({ projektordner: [], rollenVorgaben: { '231': 'kreis' }, vorgabeAuswahl: ['Organisation'], profile: {} });
  useAntrag.setState({ einstellungen: { ...VORGABE_EXPORT }, merkmalDefinitionen: VORGABE_MERKMALE, katalog: structuredClone(VORGABE_KATALOG), vorlagen: structuredClone(VORGABE_VORLAGEN) });
});

describe('Entwurf der Seite PERMIO (zentraler Einstellungsdialog)', () => {
  it('Änderungen bleiben im Entwurf, bis „Übernehmen“ sie unter den bisherigen Schlüsseln speichert', async () => {
    entwurfSetzen('arten', ['BAUA', 'ABBR']);
    entwurfSetzen('ziel', 'pfad');
    entwurfSetzen('merkmale', [...VORGABE_MERKMALE, { name: 'Sonderbau', werte: ['ja', 'nein'] }]);
    entwurfSetzen('katalog', [...VORGABE_KATALOG].reverse());
    entwurfSetzen('rollenVorgaben', { '202': 'ich' });
    entwurfSetzen('vorgabeAuswahl', ['Organisation', 'Planung/Berechnungen']);
    expect(PERMIO_ENTWURF.geaendert()).toBe(true);
    // gespeichert ist noch nichts
    expect(useAntrag.getState().einstellungen.arten).toEqual(VORGABE_EXPORT.arten);
    expect(localStorage.getItem('formulare:merkmale')).toBeNull();
    expect(localStorage.getItem('formulare:katalog')).toBeNull();
    expect(useFormulare.getState().rollenVorgaben).toEqual({ '231': 'kreis' });

    await entwurfUebernehmen();
    expect(PERMIO_ENTWURF.geaendert()).toBe(false);
    // dieselben Schlüssel wie im früheren eigenen Dialog – nichts muss umziehen
    expect(lesen('formulare:export')).toMatchObject({ arten: ['BAUA', 'ABBR'], ziel: 'pfad' });
    expect(lesen('formulare:merkmale').map((m: { name: string }) => m.name)).toContain('Sonderbau');
    expect(lesen('formulare:katalog').map((k: { id: string }) => k.id)).toEqual([...VORGABE_KATALOG].reverse().map((k) => k.id));
    expect(lesen('formulare:einstellungen')).toMatchObject({ rollenVorgaben: { '202': 'ich' }, vorgabeAuswahl: ['Organisation', 'Planung/Berechnungen'] });
    expect(useFormulare.getState().rollenVorgaben).toEqual({ '202': 'ich' });
  });

  it('Verwerfen (Abbrechen, Esc) lässt alles, wie es war; ein Wert wie der gespeicherte gilt nicht als Änderung', () => {
    entwurfSetzen('arten', ['DENK']);
    entwurfVerwerfen();
    expect(entwurfWert('arten')).toEqual(VORGABE_EXPORT.arten);
    expect(localStorage.getItem('formulare:export')).toBeNull();
    entwurfSetzen('rollenVorgaben', { '231': 'kreis' });
    expect(entwurfAenderungen()).toEqual([]);
  });

  it('„Vorgabe wiederherstellen“ entfernt den eigenen Wert (die App bringt ihre Vorgabe wieder mit)', async () => {
    useAntrag.getState().setKatalog([VORGABE_KATALOG[0]]);
    expect(localStorage.getItem('formulare:katalog')).not.toBeNull();
    entwurfSetzen('katalog', null);
    expect(entwurfWert('katalog')).toEqual(VORGABE_KATALOG);
    await entwurfUebernehmen();
    expect(localStorage.getItem('formulare:katalog')).toBeNull();
    expect(useAntrag.getState().katalog).toEqual(VORGABE_KATALOG);
  });

  it('Vorlagen auf Vorgabe, danach den Katalog geändert: Vorlagen leiten sich neu ab und werden als Vorgabe (ohne eigenen Eintrag) übernommen', async () => {
    useAntrag.getState().setVorlagen([{ id: 'eigen', name: 'Eigene', dokumente: [] }]);
    entwurfSetzen('vorlagen', null);
    const katalog = VORGABE_KATALOG.slice(1);
    entwurfSetzen('katalog', katalog);
    expect(entwurfWert('vorlagen')).toEqual(vorlagenAus(null, katalog));
    await entwurfUebernehmen();
    expect(localStorage.getItem('formulare:vorlagen')).toBeNull();
    expect(useAntrag.getState().vorlagen).toEqual(vorlagenAus(null, katalog));
  });

  it('Formulare zurücksetzen erst mit „Übernehmen“', async () => {
    useFormulare.getState().profilSetzen('nw019999|2026A', { abschnitte: { a: { sichtbar: false } }, zaehlt: {} });
    expect(Object.keys(useFormulare.getState().profile)).toEqual(['nw019999|2026A']);
    entwurfSetzen('profileZurueck', ['nw019999|2026A']);
    expect(Object.keys(useFormulare.getState().profile)).toEqual(['nw019999|2026A']);
    await entwurfUebernehmen();
    expect(useFormulare.getState().profile).toEqual({});
    expect(lesen('formulare:profile')).toEqual({});
  });
});
