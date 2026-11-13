// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeicherDateisystem } from './dateisystem';
import { sperrPfad } from './forma/sperre';
import type { OffeneDatei } from './store';
import { PDF_ENTWURF, entwurfVon, useFormulare } from './store';

/** Rückfrage „Änderungen speichern?“ (Titelleiste) – im Test beantwortet `antwort` */
const frage = vi.hoisted(() => ({ antwort: 'abbrechen' as 'abbrechen' | 'verwerfen' | 'speichern', gefragt: [] as string[] }));
vi.mock('@core/ui/Rueckfrage', async (original) => ({
  ...(await original<typeof import('@core/ui/Rueckfrage')>()),
  aenderungenSpeichern: async (name: string, speichern: () => Promise<boolean | void> | boolean | void) => {
    frage.gefragt.push(name);
    if (frage.antwort === 'abbrechen') return false;
    if (frage.antwort === 'verwerfen') return true;
    return (await speichern()) !== false;
  },
}));

const MUSTER = new Uint8Array(readFileSync(path.resolve(__dirname, '__fixtures__/muster.frmsjf')));
const ROOT = 'C:/FORMA';
const ERSTES = 'BS9/001-Muster.frmsjf';
const ZWEITES = 'BS9/002-Zweites.frmsjf';

/** Projekt BS9 mit zwei Formularen und einer kleinen Projektkarte; liefert das Dateisystem */
async function projekt(): Promise<SpeicherDateisystem> {
  const ds = new SpeicherDateisystem();
  ds.dateien.set(`${ROOT}/${ERSTES}`, MUSTER);
  ds.dateien.set(`${ROOT}/${ZWEITES}`, MUSTER);
  ds.dateien.set(`${ROOT}/BS9/sj_prokarte.sdb`, new Uint8Array([1]));
  ds.projektkarten.set(`${ROOT}/BS9/sj_prokarte.sdb`, {
    gruppen: [{ id: 201, typ: 1, text: 'Bauherr' }],
    eintraege: [
      { gruppe: 201, id: 30, typ: 1, titel: 'Vorname:', text: '', zahl: null },
      { gruppe: 201, id: 40, typ: 1, titel: 'Name:', text: '', zahl: null },
    ],
  });
  useFormulare.setState({ ds, projektordner: [ROOT], ablageordner: [], offen: null, projekt: null, karte: null, datei: null, dateiEntwuerfe: {}, meldung: null, konflikt: false, haupt: 'formular' });
  await useFormulare.getState().projekteLaden();
  await useFormulare.getState().projektWaehlen(useFormulare.getState().projekte.find((x) => x.ordner === 'BS9')!);
  return ds;
}

async function oeffnen(pfad: string) {
  await useFormulare.getState().formularOeffnen(useFormulare.getState().formulare.find((f) => f.pfad === pfad)!);
  return useFormulare.getState().offen!;
}

/** hält `ds.ersetze` an, bis `weiter()` gerufen wird (Schreiben auf ein langsames Netzlaufwerk) */
function ersetzenAnhalten(ds: SpeicherDateisystem) {
  const ersetze = ds.ersetze.bind(ds);
  const aufrufe: string[] = [];
  let weiter: () => void = () => undefined;
  ds.ersetze = async (root, pfad, daten) => {
    aufrufe.push(pfad);
    await new Promise<void>((r) => (weiter = r));
    return ersetze(root, pfad, daten);
  };
  return { aufrufe, weiter: () => weiter() };
}

const kurz = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  frage.antwort = 'abbrechen';
  frage.gefragt = [];
});

describe('Speichern des Formulars, während weiter getippt wird', () => {
  it('Eingaben während des Schreibens bleiben erhalten – in der Ansicht und im lokalen Entwurf', async () => {
    const ds = await projekt();
    const o = await oeffnen(ERSTES);
    const [a, b] = o.felder.flat().filter((f) => f.art === 'text' && !f.berechnet);
    useFormulare.getState().wertSetzen(a, 'Erste Eingabe');
    const halt = ersetzenAnhalten(ds);
    const lauf = useFormulare.getState().speichern();
    await kurz();
    useFormulare.getState().wertSetzen(b, 'Getippt während des Speicherns');
    halt.weiter();
    await lauf;
    const nachher = useFormulare.getState().offen!;
    // gespeichert ist nur die erste Eingabe; die zweite steht weiter als Änderung da
    expect(nachher.aenderungen).toEqual({ [b.schluessel]: 'Getippt während des Speicherns' });
    expect(nachher.felder.flat().find((f) => f.schluessel === a.schluessel)!.original).toBe('Erste Eingabe');
    expect(entwurfVon(nachher.projekt!, ERSTES)?.aenderungen).toEqual({ [b.schluessel]: 'Getippt während des Speicherns' });
    // der Verlauf bleibt: beide Eingaben lassen sich zurücknehmen
    expect(nachher.verlauf.position).toBe(2);
  });

  it('ein Zurücksetzen während des Schreibens bleibt als Änderung gegenüber der neuen Fassung', async () => {
    const ds = await projekt();
    const o = await oeffnen(ERSTES);
    const a = o.felder.flat().find((f) => f.art === 'text' && !f.berechnet)!;
    const vorher = a.original;
    useFormulare.getState().wertSetzen(a, 'Wird gespeichert');
    const halt = ersetzenAnhalten(ds);
    const lauf = useFormulare.getState().speichern();
    await kurz();
    useFormulare.getState().wertSetzen(a, vorher);
    halt.weiter();
    await lauf;
    expect(useFormulare.getState().offen!.aenderungen).toEqual({ [a.schluessel]: vorher });
  });

  it('ein zweites Speichern während des Schreibens entfällt (kein Konflikt mit sich selbst)', async () => {
    const ds = await projekt();
    const o = await oeffnen(ERSTES);
    useFormulare.getState().wertSetzen(o.felder.flat().find((f) => f.art === 'text' && !f.berechnet)!, 'X');
    const halt = ersetzenAnhalten(ds);
    const lauf = useFormulare.getState().speichern();
    await kurz();
    await useFormulare.getState().speichern();
    halt.weiter();
    await lauf;
    expect(halt.aufrufe).toEqual([ERSTES]);
    expect(useFormulare.getState().konflikt).toBe(false);
    expect(useFormulare.getState().offen!.aenderungen).toEqual({});
  });

  it('ein anderes Formular, während das erste noch geschrieben wird: das erste kommt nicht zurück, seine Sperre bleibt gelöst', async () => {
    const ds = await projekt();
    const o = await oeffnen(ERSTES);
    const a = o.felder.flat().find((f) => f.art === 'text' && !f.berechnet)!;
    useFormulare.getState().wertSetzen(a, 'Gespeichert');
    const halt = ersetzenAnhalten(ds);
    const lauf = useFormulare.getState().speichern();
    await kurz();
    await oeffnen(ZWEITES);
    halt.weiter();
    await lauf;
    expect(useFormulare.getState().offen!.pfad).toBe(ZWEITES);
    expect(await ds.sperrePruefen(ROOT, sperrPfad(ERSTES))).toBeNull();
    // der Entwurf des ersten ist mit dem Speichern erledigt
    expect(entwurfVon(o.projekt!, ERSTES)).toBeNull();
  });
});

describe('Projektkarte speichern, während weiter getippt wird', () => {
  it('Eingaben während des Schreibens bleiben erhalten', async () => {
    const ds = await projekt();
    await useFormulare.getState().karteLaden();
    useFormulare.getState().karteSetzen(201, 30, 'Max');
    const schreiben = ds.projektkarteSchreiben.bind(ds);
    let weiter: () => void = () => undefined;
    let aufrufe = 0;
    ds.projektkarteSchreiben = async (...args) => {
      aufrufe++;
      await new Promise<void>((r) => (weiter = r));
      return schreiben(...args);
    };
    const lauf = useFormulare.getState().karteSpeichern();
    await kurz();
    useFormulare.getState().karteSetzen(201, 40, 'Mustermann');
    // ein zweites Speichern während des Schreibens entfällt
    await useFormulare.getState().karteSpeichern();
    weiter();
    await lauf;
    const k = useFormulare.getState().karte!;
    expect(aufrufe).toBe(1);
    expect(k.aenderungen).toEqual({ '201:40': 'Mustermann' });
    expect(k.karte.eintraege.find((e) => e.id === 30)!.text).toBe('Max');
  });

  it('Verlauf passt nicht mehr zur Karte (anderswo geändert): Strg+Z schreibt keine alten Werte darüber', async () => {
    const ds = await projekt();
    await useFormulare.getState().karteLaden();
    useFormulare.getState().karteSetzen(201, 30, 'Max');
    await useFormulare.getState().karteSpeichern();
    expect(useFormulare.getState().karte!.verlauf.position).toBe(1);
    // FORMA ändert den Eintrag, danach wird die Karte neu gelesen
    ds.projektkarten.get(`${ROOT}/BS9/sj_prokarte.sdb`)!.eintraege[0].text = 'Moritz';
    await useFormulare.getState().karteLaden();
    const k = useFormulare.getState().karte!;
    expect(k.verlauf.position).toBe(0);
    expect(k.verlauf.frueher).toHaveLength(1);
    expect(useFormulare.getState().karteRueckgaengig()).toBeNull();
    expect(k.aenderungen).toEqual({});
  });
});

describe('Sperre und lokale Sicherung', () => {
  it('scheitert das Öffnen nach dem Sperren, wird die eigene Sperre gleich wieder gelöst', async () => {
    const ds = await projekt();
    const lies = ds.lies.bind(ds);
    let n = 0;
    // erstes Lesen (Prüfung) gelingt, das zweite (nach dem Sperren) liefert Unlesbares
    ds.lies = async (root, pfad) => (pfad === ERSTES && ++n === 2 ? new Uint8Array([1, 2, 3]) : lies(root, pfad));
    await useFormulare.getState().formularOeffnen(useFormulare.getState().formulare.find((f) => f.pfad === ERSTES)!);
    expect(useFormulare.getState().offen).toBeNull();
    expect(useFormulare.getState().meldung?.art).toBe('fehler');
    expect(await ds.sperrePruefen(ROOT, sperrPfad(ERSTES))).toBeNull();
  });

  it('lässt sich nicht mehr lokal sichern (Speicher voll), kommt einmal eine Meldung', async () => {
    await projekt();
    const o = await oeffnen(ERSTES);
    const [a, b] = o.felder.flat().filter((f) => f.art === 'text' && !f.berechnet);
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      useFormulare.getState().wertSetzen(a, 'Eins');
      expect(useFormulare.getState().meldung).toMatchObject({ art: 'fehler' });
      expect(useFormulare.getState().meldung!.text).toContain('nicht lokal sichern');
      useFormulare.getState().setMeldung(null);
      useFormulare.getState().wertSetzen(b, 'Zwei');
      expect(useFormulare.getState().meldung).toBeNull();
    } finally {
      setItem.mockRestore();
    }
  });
});

describe('Dokumente: Bearbeitungen gehen nicht still verloren', () => {
  const pdf = (ds: SpeicherDateisystem): OffeneDatei => {
    ds.dateien.set(`${ROOT}/BS9/Plan.pdf`, new Uint8Array([37, 80, 68, 70]));
    return { root: ROOT, pfad: 'BS9/Plan.pdf', name: 'Plan.pdf', art: 'pdf', bytes: new Uint8Array([37, 80, 68, 70]), inOffice: false, stand: 1 };
  };

  it('bearbeitete PDF verlassen: erst fragen – Abbrechen bleibt, Nicht speichern wechselt', async () => {
    const ds = await projekt();
    useFormulare.setState({ datei: pdf(ds), haupt: 'datei', dateiEntwuerfe: { [`${ROOT}|BS9/Plan.pdf`]: PDF_ENTWURF } });
    useFormulare.getState().setHaupt('projektkarte');
    await kurz();
    expect(frage.gefragt).toEqual(['Plan.pdf']);
    expect(useFormulare.getState().haupt).toBe('datei');
    frage.antwort = 'verwerfen';
    useFormulare.getState().setHaupt('projektkarte');
    await kurz();
    expect(useFormulare.getState().haupt).toBe('projektkarte');
    expect(useFormulare.getState().dateiEntwuerfe).toEqual({});
  });

  it('ohne Bearbeitungen wechselt die Ansicht sofort, ohne Rückfrage', async () => {
    const ds = await projekt();
    useFormulare.setState({ datei: pdf(ds), haupt: 'datei' });
    useFormulare.getState().setHaupt('formular');
    expect(useFormulare.getState().haupt).toBe('formular');
    expect(frage.gefragt).toEqual([]);
  });

  it('ein anderes Formular öffnen bzw. „Abbrechen“: die PDF bleibt offen', async () => {
    const ds = await projekt();
    useFormulare.setState({ datei: pdf(ds), haupt: 'datei', dateiEntwuerfe: { [`${ROOT}|BS9/Plan.pdf`]: PDF_ENTWURF } });
    await useFormulare.getState().formularOeffnen(useFormulare.getState().formulare.find((f) => f.pfad === ERSTES)!);
    expect(useFormulare.getState().haupt).toBe('datei');
    expect(useFormulare.getState().offen).toBeNull();
  });

  it('Speichern eines Dokuments: ein während des Schreibens geänderter Entwurf bleibt stehen', async () => {
    const ds = await projekt();
    const d = pdf(ds);
    useFormulare.setState({ datei: d, haupt: 'datei', dateiEntwuerfe: { [`${ROOT}|BS9/Plan.pdf`]: 'erster' } });
    const ersetzen = ds.dokumentErsetzen.bind(ds);
    let weiter: () => void = () => undefined;
    ds.dokumentErsetzen = async (...args) => {
      await new Promise<void>((r) => (weiter = r));
      return ersetzen(...args);
    };
    const lauf = useFormulare.getState().dateiSpeichern(new Uint8Array([37, 80, 68, 70, 49]));
    await kurz();
    useFormulare.getState().setDateiEntwurf('zweiter');
    weiter();
    expect(await lauf).toBe(true);
    expect(useFormulare.getState().dateiEntwuerfe).toEqual({ [`${ROOT}|BS9/Plan.pdf`]: 'zweiter' });
    expect(useFormulare.getState().datei!.stand).toBe(2);
  });
});
