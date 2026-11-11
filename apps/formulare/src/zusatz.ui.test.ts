// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { SpeicherDateisystem } from './dateisystem';
import type { Projektkarte } from './forma/projektkarte';
import { pkWert } from './forma/projektkarte';
import type { Projekt } from './projekte';
import { useFormulare } from './store';

const KARTE = 'C:/FORMA/BS9/sj_prokarte.sdb';
const projekt: Projekt = { root: 'C:/FORMA', ordner: 'BS9', titel: 'Musterweg 12' };
const karte = (): Projektkarte => ({
  gruppen: [{ id: 301, typ: 2, text: 'Baugrundstücksdaten' }],
  eintraege: [
    { gruppe: 301, id: 20, typ: 1, titel: 'Straße/Nr.:', text: 'Musterweg 12', zahl: null },
    { gruppe: 301, id: 10, typ: 1, titel: 'Ort:', text: 'Münster', zahl: null },
  ],
});

let ds: SpeicherDateisystem;
beforeEach(() => {
  localStorage.clear();
  ds = new SpeicherDateisystem();
  ds.dateien.set(KARTE, new Uint8Array([1]));
  ds.projektkarten.set(KARTE, karte());
  useFormulare.setState({ ds, projekt, karte: null, oap: null, meldung: null });
});

describe('PLZ des Grundstücks als Ergänzung der App', () => {
  it('erscheint in der Projektkarte, wird gemerkt – aber nie in die Projektkarte von FORMA geschrieben', async () => {
    const st = useFormulare.getState();
    await st.karteLaden();
    const k = () => useFormulare.getState().karte!;
    expect(k().karte.eintraege.find((e) => e.id === 9010)).toMatchObject({ gruppe: 301, titel: 'PLZ (Ergänzung der App):', text: '' });
    st.karteSetzen(301, 9010, '48143');
    st.karteSetzen(301, 10, 'Münster-Hiltrup');
    await st.karteSpeichern();
    // nur der FORMA-Eintrag geht in die sdb
    expect(ds.schreibvorgaenge).toEqual(['projektkarte BS9/sj_prokarte.sdb (1)']);
    expect(ds.projektkarten.get(KARTE)!.eintraege.some((e) => e.id === 9010)).toBe(false);
    expect(pkWert(k().karte, 301, 9010)).toBe('48143');
    expect(Object.keys(k().aenderungen)).toEqual([]);
    // nach erneutem Laden wieder da
    useFormulare.setState({ karte: null });
    await useFormulare.getState().karteLaden();
    expect(pkWert(k().karte, 301, 9010)).toBe('48143');
  });

  it('ohne eigene Angabe kommt die PLZ aus der Projektdatei (.oap)', async () => {
    const meta = {
      projektcode: 'BS9',
      adresse: { strasse: 'Musterweg 12', plz: '48165', ort: 'Münster' },
      grundstueck: { gemarkung: '', flur: '', flurstueck: '' },
      bauherr: { name: '', adresse: { strasse: '', plz: '', ort: '' }, kontakte: [] },
      bearbeiter: '',
    };
    useFormulare.setState({ oap: { root: 'P:/BS9', pfad: 'BS9.oap', stand: null, projekt: {}, inhalt: { name: 'BS9', meta }, kandidaten: [] } as never });
    await useFormulare.getState().karteLaden();
    expect(pkWert(useFormulare.getState().karte!.karte, 301, 9010)).toBe('48165');
  });
});
