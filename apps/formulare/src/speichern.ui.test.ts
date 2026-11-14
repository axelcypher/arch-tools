// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeicherDateisystem } from './dateisystem';
import { sperrPfad } from './forma/sperre';
import type { OffeneDatei } from './store';
import { PDF_ENTWURF, dateiEntwurfVerschieben, entwurfVon, pdfAnbindung, ungespeichertText, useFormulare } from './store';
import { pdfSpeichern } from './dokumente/pdfSpeichern';

/** Rückfrage „Änderungen speichern?“ (Titelleiste) – im Test beantwortet `antwort` */
const frage = vi.hoisted(() => ({ antwort: 'abbrechen' as 'abbrechen' | 'verwerfen' | 'speichern', gefragt: [] as string[], texte: [] as (string | undefined)[] }));
vi.mock('@core/ui/Rueckfrage', async (original) => ({
  ...(await original<typeof import('@core/ui/Rueckfrage')>()),
  aenderungenSpeichern: async (name: string, speichern: () => Promise<boolean | void> | boolean | void, text?: string) => {
    frage.gefragt.push(name);
    frage.texte.push(text);
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
  frage.texte = [];
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

  it('ein zweites Speichern während des Schreibens wartet – ohne neue Eingaben schreibt es nichts (kein Konflikt mit sich selbst)', async () => {
    const ds = await projekt();
    const o = await oeffnen(ERSTES);
    useFormulare.getState().wertSetzen(o.felder.flat().find((f) => f.art === 'text' && !f.berechnet)!, 'X');
    const halt = ersetzenAnhalten(ds);
    const lauf = useFormulare.getState().speichern();
    await kurz();
    const zweites = useFormulare.getState().speichern();
    halt.weiter();
    await Promise.all([lauf, zweites]);
    expect(halt.aufrufe).toEqual([ERSTES]);
    expect(useFormulare.getState().konflikt).toBe(false);
    expect(useFormulare.getState().offen!.aenderungen).toEqual({});
  });

  it('Strg+S während des Schreibens speichert danach, was inzwischen eingegeben wurde', async () => {
    const ds = await projekt();
    const o = await oeffnen(ERSTES);
    const [a, b] = o.felder.flat().filter((f) => f.art === 'text' && !f.berechnet);
    useFormulare.getState().wertSetzen(a, 'Eins');
    const halt = ersetzenAnhalten(ds);
    const lauf = useFormulare.getState().speichern();
    await kurz();
    useFormulare.getState().wertSetzen(b, 'Zwei');
    const zweites = useFormulare.getState().speichern();
    halt.weiter();
    await lauf;
    await kurz();
    halt.weiter();
    await zweites;
    expect(halt.aufrufe).toEqual([ERSTES, ERSTES]);
    expect(useFormulare.getState().konflikt).toBe(false);
    const nachher = useFormulare.getState().offen!;
    expect(nachher.aenderungen).toEqual({});
    expect(nachher.felder.flat().find((f) => f.schluessel === b.schluessel)!.original).toBe('Zwei');
  });

  it('ein anderes Formular öffnen, während das erste noch geschrieben wird: dessen Sperre fällt erst nach dem Schreiben', async () => {
    const ds = await projekt();
    const o = await oeffnen(ERSTES);
    const a = o.felder.flat().find((f) => f.art === 'text' && !f.berechnet)!;
    useFormulare.getState().wertSetzen(a, 'Gespeichert');
    const halt = ersetzenAnhalten(ds);
    const lauf = useFormulare.getState().speichern();
    await kurz();
    const wechsel = oeffnen(ZWEITES);
    await kurz();
    // noch wird geschrieben: das erste bleibt gesperrt und offen
    expect(await ds.sperrePruefen(ROOT, sperrPfad(ERSTES))).not.toBeNull();
    expect(useFormulare.getState().offen!.pfad).toBe(ERSTES);
    halt.weiter();
    await Promise.all([lauf, wechsel]);
    expect(useFormulare.getState().offen!.pfad).toBe(ZWEITES);
    expect(await ds.sperrePruefen(ROOT, sperrPfad(ERSTES))).toBeNull();
    // gespeichert und der Entwurf des ersten erledigt
    expect(entwurfVon(o.projekt!, ERSTES)).toBeNull();
    expect(useFormulare.getState().meldung?.text ?? '').not.toContain('nicht gespeichert');
  });
});

describe('Formulare schnell nacheinander öffnen', () => {
  it('zwei Klicks kurz nacheinander: das zuletzt angeklickte ist offen, keine liegen gebliebene Sperre', async () => {
    const ds = await projekt();
    const [e1, e2] = [ERSTES, ZWEITES].map((p) => useFormulare.getState().formulare.find((f) => f.pfad === p)!);
    await Promise.all([useFormulare.getState().formularOeffnen(e1), useFormulare.getState().formularOeffnen(e2)]);
    expect(useFormulare.getState().offen!.pfad).toBe(ZWEITES);
    expect(await ds.sperrePruefen(ROOT, sperrPfad(ERSTES))).toBeNull();
    expect(await ds.sperrePruefen(ROOT, sperrPfad(ZWEITES))).not.toBeNull();
  });

  it('das überholte Lösen der Sperre dauert (Netzlaufwerk): die Liste zeigt danach kein Schloss mehr am ersten', async () => {
    const ds = await projekt();
    const [e1, e2] = [ERSTES, ZWEITES].map((p) => useFormulare.getState().formulare.find((f) => f.pfad === p)!);
    // das Lösen der Sperre des ersten hält an, bis das zweite geöffnet ist und die Liste schon gelesen hat
    const loesen = ds.sperreLoesen.bind(ds);
    let weiter: () => void = () => undefined;
    const angehalten = new Promise<void>((r) => (weiter = r));
    ds.sperreLoesen = async (root, pfad, inhalt) => {
      if (pfad === sperrPfad(ERSTES)) await angehalten;
      return loesen(root, pfad, inhalt);
    };
    // das erste sperrt schon (Sperrdatei angelegt), da wird das zweite angeklickt
    const setzen = ds.sperreSetzen.bind(ds);
    let gesetzt: () => void = () => undefined;
    const sperreDa = new Promise<void>((r) => (gesetzt = r));
    ds.sperreSetzen = async (root, pfad, daten) => {
      const ok = await setzen(root, pfad, daten);
      if (pfad === sperrPfad(ERSTES)) gesetzt();
      return ok;
    };
    const a = useFormulare.getState().formularOeffnen(e1);
    await sperreDa;
    const b = useFormulare.getState().formularOeffnen(e2);
    await b;
    expect(useFormulare.getState().offen!.pfad).toBe(ZWEITES);
    // Gegenprobe: solange die Sperre liegt, steht das Schloss am ersten
    expect(useFormulare.getState().formulare.find((f) => f.pfad === ERSTES)!.gesperrt).toBe(true);
    weiter();
    await a;
    expect(await ds.sperrePruefen(ROOT, sperrPfad(ERSTES))).toBeNull();
    expect(useFormulare.getState().formulare.find((f) => f.pfad === ERSTES)!.gesperrt).toBe(false);
  });

  it('auch während ein Speichern läuft: der überholte Klick sperrt nichts', async () => {
    const ds = await projekt();
    const o = await oeffnen(ERSTES);
    useFormulare.getState().wertSetzen(o.felder.flat().find((f) => f.art === 'text' && !f.berechnet)!, 'X');
    const halt = ersetzenAnhalten(ds);
    const lauf = useFormulare.getState().speichern();
    await kurz();
    const [e1, e2] = [ERSTES, ZWEITES].map((p) => useFormulare.getState().formulare.find((f) => f.pfad === p)!);
    // erst das zweite, dann wieder das erste angeklickt – beide warten auf das Speichern
    const a = useFormulare.getState().formularOeffnen(e2);
    const b = useFormulare.getState().formularOeffnen(e1);
    halt.weiter();
    await Promise.all([lauf, a, b]);
    expect(useFormulare.getState().offen!.pfad).toBe(ERSTES);
    expect(await ds.sperrePruefen(ROOT, sperrPfad(ZWEITES))).toBeNull();
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
    weiter();
    await lauf;
    const k = useFormulare.getState().karte!;
    expect(aufrufe).toBe(1);
    expect(k.aenderungen).toEqual({ '201:40': 'Mustermann' });
    expect(k.karte.eintraege.find((e) => e.id === 30)!.text).toBe('Max');
    // ein zweites Speichern wartet auf das erste und schreibt dann den Rest – mit dem frischen Stand als „alt“
    const zweites = useFormulare.getState().karteSpeichern();
    await kurz();
    weiter();
    await zweites;
    expect(aufrufe).toBe(2);
    expect(useFormulare.getState().karte!.aenderungen).toEqual({});
    expect(useFormulare.getState().meldung?.art).toBe('info');
  });

  it('anderes Projekt während des Schreibens: die alte Karte kommt nicht zurück, ihr gemerkter Entwurf ist erledigt', async () => {
    const ds = await projekt();
    await useFormulare.getState().karteLaden();
    useFormulare.getState().karteSetzen(201, 30, 'Max');
    expect(JSON.parse(localStorage.getItem('formulare:projektkarten') ?? '{}')).not.toEqual({});
    const schreiben = ds.projektkarteSchreiben.bind(ds);
    let weiter: () => void = () => undefined;
    ds.projektkarteSchreiben = async (...args) => {
      await new Promise<void>((r) => (weiter = r));
      return schreiben(...args);
    };
    const lauf = useFormulare.getState().karteSpeichern();
    await kurz();
    // wie beim Wechsel des Projekts (projektWaehlen setzt die Karte zurück)
    useFormulare.setState({ karte: null });
    weiter();
    await lauf;
    expect(useFormulare.getState().karte).toBeNull();
    expect(JSON.parse(localStorage.getItem('formulare:projektkarten') ?? '{}')).toEqual({});
    expect(ds.projektkarten.get(`${ROOT}/BS9/sj_prokarte.sdb`)!.eintraege[0].text).toBe('Max');
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

  it('Satz für ungespeicherte Änderungen: Gegenstand mit Artikel, Einzahl bzw. Mehrzahl, nichts ungespeichert ohne Satz', () => {
    expect(ungespeichertText({})).toBeUndefined();
    expect(ungespeichertText({ formular: true })).toBe('Das Formular hat ungespeicherte Änderungen.');
    expect(ungespeichertText({ dokumente: 1, dokumentSichtbar: true })).toBe('Das Dokument hat ungespeicherte Änderungen.');
    // Excel/Word-Bearbeitungen bleiben bis zum Schließen: ein nicht gezeigtes Dokument bzw. mehrere
    expect(ungespeichertText({ dokumente: 1 })).toBe('Ein Dokument hat ungespeicherte Änderungen.');
    expect(ungespeichertText({ dokumente: 2 })).toBe('Die Dokumente haben ungespeicherte Änderungen.');
    expect(ungespeichertText({ formular: true, dokumente: 3 })).toBe('Das Formular und die Dokumente haben ungespeicherte Änderungen.');
    expect(ungespeichertText({ projektdaten: true })).toBe('Die Projektdaten haben ungespeicherte Änderungen.');
    expect(ungespeichertText({ formular: true, dokumente: 1 })).toBe('Das Formular und ein Dokument haben ungespeicherte Änderungen.');
    expect(ungespeichertText({ projektdaten: true, dokumente: 1, dokumentSichtbar: true })).toBe('Die Projektdaten und das Dokument haben ungespeicherte Änderungen.');
  });

  it('bearbeitete PDF verlassen: erst fragen – Abbrechen bleibt, Nicht speichern wechselt', async () => {
    const ds = await projekt();
    useFormulare.setState({ datei: pdf(ds), haupt: 'datei', dateiEntwuerfe: { [`${ROOT}|BS9/Plan.pdf`]: PDF_ENTWURF } });
    useFormulare.getState().setHaupt('projektkarte');
    await kurz();
    expect(frage.gefragt).toEqual(['Plan.pdf']);
    // Satz nach design.md „Ungespeicherte Änderungen“: die Folge davor, dann die Aussage
    expect(frage.texte).toEqual(['Ohne Speichern gehen die Eingaben in der PDF verloren. Das Dokument hat ungespeicherte Änderungen.']);
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

  it('„Speichern“ in der Rückfrage: die PDF wird gespeichert, dann gewechselt – scheitert es, bleibt sie offen', async () => {
    const ds = await projekt();
    useFormulare.setState({ datei: pdf(ds), haupt: 'datei', dateiEntwuerfe: { [`${ROOT}|BS9/Plan.pdf`]: PDF_ENTWURF } });
    frage.antwort = 'speichern';
    const gespeichert = vi.fn(async () => false);
    pdfAnbindung.speichern = gespeichert;
    try {
      useFormulare.getState().setHaupt('formular');
      await kurz();
      expect(gespeichert).toHaveBeenCalledTimes(1);
      expect(useFormulare.getState().haupt).toBe('datei');
      expect(useFormulare.getState().dateiEntwuerfe).toEqual({ [`${ROOT}|BS9/Plan.pdf`]: PDF_ENTWURF });
      gespeichert.mockResolvedValue(true);
      useFormulare.getState().setHaupt('formular');
      await kurz();
      expect(useFormulare.getState().haupt).toBe('formular');
    } finally {
      delete pdfAnbindung.speichern;
    }
  });

  it('Speichern einer PDF scheitert (Konflikt): Entwurf und Rückfrage bleiben, die Meldung warnt vor „Neu laden“', async () => {
    const ds = await projekt();
    useFormulare.setState({ datei: pdf(ds), haupt: 'datei', dateiEntwuerfe: { [`${ROOT}|BS9/Plan.pdf`]: PDF_ENTWURF } });
    // inzwischen außerhalb geändert
    ds.dateien.set(`${ROOT}/BS9/Plan.pdf`, new Uint8Array([37, 80, 68, 70, 50]));
    expect(await useFormulare.getState().dateiSpeichern(new Uint8Array([1]))).toBe(false);
    expect(useFormulare.getState().dateiEntwuerfe).toEqual({ [`${ROOT}|BS9/Plan.pdf`]: PDF_ENTWURF });
    expect(useFormulare.getState().meldung?.text).toContain('„Neu laden“ verwirft die Eingaben in dieser PDF');
  });

  it('pdf.js setzt beim Erzeugen den Änderungsstand zurück: scheitert das Schreiben, gilt die PDF wieder als geändert', async () => {
    const geaendert = vi.fn();
    const fehler = vi.fn();
    expect(
      await pdfSpeichern(
        async () => new Uint8Array([1]),
        async () => false,
        geaendert,
        fehler,
      ),
    ).toBe(false);
    expect(geaendert).toHaveBeenLastCalledWith(true);
    geaendert.mockClear();
    expect(
      await pdfSpeichern(
        async () => Promise.reject(new Error('gesperrt')),
        async () => true,
        geaendert,
        fehler,
      ),
    ).toBe(false);
    expect(geaendert).toHaveBeenLastCalledWith(true);
    expect(fehler).toHaveBeenCalledWith('gesperrt');
    geaendert.mockClear();
    expect(
      await pdfSpeichern(
        async () => new Uint8Array([1]),
        async () => true,
        geaendert,
        fehler,
      ),
    ).toBe(true);
    expect(geaendert).not.toHaveBeenCalled();
  });

  it('umbenannte bzw. gelöschte Dokumente nehmen ihren Entwurf mit – kein verwaistes ●', async () => {
    await projekt();
    useFormulare.setState({ dateiEntwuerfe: { [`${ROOT}|BS9/Liste.xlsx`]: 'zellen', [`${ROOT}|BS9/Plan.pdf`]: PDF_ENTWURF } });
    dateiEntwurfVerschieben(ROOT, 'BS9/Liste.xlsx', 'BS9/Liste neu.xlsx');
    dateiEntwurfVerschieben(ROOT, 'BS9/Plan.pdf', 'BS9/Plan neu.pdf');
    expect(useFormulare.getState().dateiEntwuerfe).toEqual({ [`${ROOT}|BS9/Liste neu.xlsx`]: 'zellen' });
    dateiEntwurfVerschieben(ROOT, 'BS9/Liste neu.xlsx', null);
    expect(useFormulare.getState().dateiEntwuerfe).toEqual({});
  });
});
