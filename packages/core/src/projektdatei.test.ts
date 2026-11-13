import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readProjectFile, writeArchive } from './archive';
import { createProject } from './model';
import { allgemeinAus, VORGABE_ALLGEMEIN } from './platform/konfig';
import { projektdateiAbschnittSetzen, projektdateiAnlegen, projektdateiFinden, projektdateiKopf, projektdateiLaden, projektdateiSchreiben, projekteAuflisten, SpeicherProjektordner, verbinde } from './platform/projektordner';
import { projektdateiAendern, projektdateiPfad, projektdateiWaehlen, unbekanntePlatzhalter } from './projektdatei';

const e = (pfad: string, geaendert = 0) => ({ pfad, ordner: false, groesse: 1, geaendert });

describe('Projektdatei im Projektordner', () => {
  it('welche gilt: gewählt, sonst im Ordner der Berechnungen, sonst kürzester Pfad, dann die neueste', () => {
    const liste = [e('Alt/Variante.oap', 9), e('03 Berechnungen/Flächen/2026-014.oap', 1), e('2026-014.oap', 5), e('~$sperre.oap'), e('Tief/a/b/c/d.oap'), { pfad: 'Ordner.oap', ordner: true, groesse: 0 }];
    expect(projektdateiWaehlen(liste)?.pfad).toBe('03 Berechnungen/Flächen/2026-014.oap');
    expect(projektdateiWaehlen(liste, 'alt/variante.OAP')?.pfad).toBe('Alt/Variante.oap');
    expect(projektdateiWaehlen([e('B/x.oap', 1), e('A/y.oap', 2), e('z.oap', 0)])?.pfad).toBe('z.oap');
    expect(projektdateiWaehlen([e('B/x.oap', 1), e('A/y.oap', 2)])?.pfad).toBe('A/y.oap');
    // zu tief (mehr als vier Ebenen) und Sperrdateien zählen nicht
    expect(projektdateiWaehlen([e('Tief/a/b/c/d.oap'), e('a/~$x.oap')])).toBeNull();
  });

  it('Pfad einer neuen Projektdatei aus der Vorlage', () => {
    expect(projektdateiPfad('03 Berechnungen/Flächen/{nummer} {kurzname}.oap', { nummer: '2026-014', kurzname: 'EFH: A/B' })).toBe('03 Berechnungen/Flächen/2026-014 EFH A B.oap');
    expect(projektdateiPfad('Planung\\Berechnungen\\{Kürzel}', { nummer: 'BS5' })).toBe('Planung/Berechnungen/BS5.oap');
    expect(projektdateiPfad('{nummer} {kurzname}.oap', { nummer: 'BS5' })).toBe('BS5.oap');
    expect(projektdateiPfad('', { nummer: 'X', kurzname: 'Y', jahr: 2026 })).toBe('03 Berechnungen/Flächen/X Y.oap');
    // Vorhaben und Datum (JJMMTT); fehlt das Vorhaben, fällt es weg
    const datum = new Date(2026, 10, 10);
    expect(projektdateiPfad('Organisation/{Kürzel} {Datum} {Vorhaben}.oap', { nummer: 'BS9', vorhaben: 'Neubau EFH / Garage', datum })).toBe('Organisation/BS9 261110 Neubau EFH Garage.oap');
    expect(projektdateiPfad('Organisation/{Kürzel} {Datum} {Vorhaben}.oap', { nummer: 'BS9', datum })).toBe('Organisation/BS9 261110.oap');
    expect(projektdateiPfad('{JAHR}/{ kurzname }', { nummer: 'BS9', kurzname: 'Kita', datum })).toBe('2026/Kita.oap');
    // unbekannte Platzhalter bleiben stehen – die Einstellungen weisen darauf hin
    expect(projektdateiPfad('{Kürzel} {Bauherr}', { nummer: 'BS9' })).toBe('BS9 {Bauherr}.oap');
    expect(unbekanntePlatzhalter('{Kürzel} {Bauherr} {datum} {Ort} {Bauherr}')).toEqual(['{Bauherr}', '{Ort}']);
    // neue Namen (globale Variablen) ergeben dasselbe wie die alten; Vorgabe mit neuen Namen
    expect(projektdateiPfad('Organisation/{PROJEKT_KUERZEL} {DATUM} {PROJEKT_VORHABEN}.oap', { nummer: 'BS9', vorhaben: 'Neubau EFH / Garage', datum })).toBe('Organisation/BS9 261110 Neubau EFH Garage.oap');
    expect(projektdateiPfad('{PROJEKT_KUERZEL}_{BEARBEITER}_{JAHR_KURZ}_{DATUM:JJJJ-MM-TT}', { nummer: 'BS9', bearbeiter: 'TP', datum })).toBe('BS9_TP_26_2026-11-10.oap');
    expect(projektdateiPfad('', { nummer: 'BS9', kurzname: 'Kita' })).toBe('03 Berechnungen/Flächen/BS9 Kita.oap');
    expect(unbekanntePlatzhalter('{PROJEKT_KUERZEL} {PROJEKT_KURZNAME} {DATUM:TT.MM.JJJJ} {JAHR}')).toEqual([]);
    // Datum mit Format (P-06), {jj}; ohne Format bleibt es JJMMTT wie bisher
    expect(projektdateiPfad('{nummer} {datum:JJJJ-MM-TT}', { nummer: 'BS9', datum })).toBe('BS9 2026-11-10.oap');
    expect(projektdateiPfad('{nummer} {Datum:jjmmtt} {jj}', { nummer: 'BS9', datum })).toBe('BS9 261110 26.oap');
    expect(unbekanntePlatzhalter('{datum:JJJJ-MM-TT} {jj} {datum:xyz}')).toEqual(['{datum:xyz}']);
  });

  it('gezielt ändern: nur projekt.json, alle anderen Einträge bleiben, Abschnitte anderer Apps auch; ohne Änderung null', () => {
    const p = createProject('Kita');
    p.meta.projektcode = 'BS5';
    const vorher = unzipSync(writeArchive(p));
    // eine andere App hat einen eigenen Abschnitt und eine eigene Datei hinterlegt
    const roh = JSON.parse(strFromU8(vorher['projekt.json'])) as Record<string, unknown>;
    roh.zukunft = { aktiveFassung: 'BAUA 2' };
    const bytes = zipSync({ ...vorher, 'projekt.json': strToU8(JSON.stringify(roh)), 'quellen/x/Plan.pdf': new Uint8Array([1, 2, 3]) });
    const neu = projektdateiAendern(bytes, (r) => ({ ...r, projektordner: { presets: ['A'] }, meta: { ...(r.meta as object), kurzname: 'Kita' } }))!;
    const z = unzipSync(neu);
    expect([...z['quellen/x/Plan.pdf']]).toEqual([1, 2, 3]);
    expect(z['manifest.json']).toEqual(vorher['manifest.json']);
    const gelesen = readProjectFile(neu);
    expect(gelesen.meta).toMatchObject({ projektcode: 'BS5', kurzname: 'Kita' });
    expect(gelesen.projektordner).toEqual({ presets: ['A'] });
    expect(gelesen.erweiterungen).toEqual({ zukunft: { aktiveFassung: 'BAUA 2' } });
    expect(projektdateiAendern(neu, (r) => r)).toBeNull();
    expect(() => projektdateiAendern(strToU8('{"format":"arch-flaechen-tool"}'), (r) => r)).toThrow(/kein Archiv/);
  });

  it('laden, ändern und anlegen über den Ordnerzugriff; nie überschreiben, was jemand inzwischen geändert hat', async () => {
    const fs = new SpeicherProjektordner();
    const root = 'P:\\Projekte\\BS5 Buchenstraße';
    expect(await projektdateiLaden(fs, root)).toBeNull();
    const p = createProject('Buchenstraße');
    p.meta.projektcode = 'BS5';
    expect(await projektdateiAnlegen(fs, root, 'Planung/Berechnungen/BS5.oap', p, 'Test')).toBe(true);
    // eine vorhandene Datei bleibt beim Anlegen unverändert
    expect(await projektdateiAnlegen(fs, root, 'Planung/Berechnungen/BS5.oap', createProject('anders'), 'Test')).toBe(false);
    const geladen = (await projektdateiLaden(fs, root))!;
    expect(geladen).toMatchObject({ pfad: 'Planung/Berechnungen/BS5.oap', kandidaten: ['Planung/Berechnungen/BS5.oap'] });
    expect(geladen.projekt.name).toBe('Buchenstraße');

    expect(await projektdateiSchreiben(fs, root, geladen.pfad, (r) => ({ ...r, projektordner: { struktur: 'Büro' } }))).toBe(true);
    expect(await projektdateiSchreiben(fs, root, geladen.pfad, (r) => r)).toBe(false);
    expect((await projektdateiLaden(fs, root))!.projekt.projektordner).toEqual({ struktur: 'Büro' });

    // zwischen Lesen und Schreiben ändert ein anderer die Datei: Schreiben scheitert
    const alt = (await fs.liesMitStand(root, geladen.pfad))!;
    fs.setze(`${verbinde(root, geladen.pfad).replace(/\\/g, '/')}`, writeArchive(createProject('Kollege')));
    await expect(fs.projektdateiErsetzen(root, geladen.pfad, alt.daten, alt.stand)).rejects.toThrow(/inzwischen geändert/);
    await expect(fs.projektdateiErsetzen(root, 'Planung/x.xlsx', alt.daten, alt.stand)).rejects.toThrow(/nur Projektdateien/);
  });
});

describe('Gemeinsame Einstellungen', () => {
  it('Vorgaben für Fehlendes, Listen bereinigt', () => {
    expect(allgemeinAus(null)).toEqual(VORGABE_ALLGEMEIN);
    expect(allgemeinAus({ projekte: [' P:\\Projekte ', 'P:\\Projekte', 3], oapPfad: '', fotoordner: '10 Fotos', fremd: 1 })).toEqual({ projekte: ['P:\\Projekte'], oapPfad: VORGABE_ALLGEMEIN.oapPfad, fotoordner: '10 Fotos' });
  });
});

describe('Projektdatei: Abschnitte anderer Apps, gleichzeitiges Schreiben, Übersicht', () => {
  it('Abschnitt „formulare“ wird unverändert durchgereicht; Projektmerkmale gehören zu den Stammdaten', () => {
    const p = createProject('X');
    p.formulare = { aktiveFassung: 'BAUA 2', umfang: [{ nr: '01' }] };
    p.meta.merkmale = { gebaeudeklasse: '3', sonderbau: 'nein' };
    const back = readProjectFile(writeArchive(p));
    expect(back.formulare).toEqual({ aktiveFassung: 'BAUA 2', umfang: [{ nr: '01' }] });
    expect(back.meta.merkmale).toEqual({ gebaeudeklasse: '3', sonderbau: 'nein' });
    expect(back.erweiterungen).toBeUndefined();
  });

  it('ändert jemand die Datei zwischen Lesen und Schreiben, wird neu gelesen und noch einmal angewendet', async () => {
    const fs = new SpeicherProjektordner();
    const p = createProject('X');
    await projektdateiAnlegen(fs, '/p', 'a.oap', p, 'Test');
    // beim ersten Ersetzen schreibt „gleichzeitig“ eine andere App ihren Abschnitt
    const ersetzen = fs.projektdateiErsetzen.bind(fs);
    let erster = true;
    fs.projektdateiErsetzen = async (root, pfad, daten, stand) => {
      if (erster) {
        erster = false;
        const anders = readProjectFile((await fs.liesMitStand(root, pfad))!.daten);
        anders.formulare = { aktiveFassung: 'BAUA 1' };
        fs.setze('/p/a.oap', writeArchive(anders));
      }
      return ersetzen(root, pfad, daten, stand);
    };
    expect(await projektdateiAbschnittSetzen(fs, '/p', 'a.oap', 'projektordner', { presets: ['A'] })).toBe(true);
    const ende = readProjectFile(fs.eintraege.get('/p/a.oap')!);
    expect(ende.projektordner).toEqual({ presets: ['A'] });
    expect(ende.formulare).toEqual({ aktiveFassung: 'BAUA 1' });
  });

  it('Projekte der Stammordner auflisten, Projektdatei finden, nur projekt.json lesen', async () => {
    const fs = new SpeicherProjektordner();
    const p = createProject('Kita');
    p.meta.projektcode = '2025-007';
    p.formulare = { aktiveFassung: 'BAUA' };
    await fs.ordnerAnlegen('/p', '2025-007 Kita');
    await projektdateiAnlegen(fs, '/p/2025-007 Kita', '03 Berechnungen/Flächen/2025-007.oap', p, 'Test');
    await fs.ordnerAnlegen('/p', '2026-001 Leer');
    await fs.ordnerAnlegen('/p', '.versteckt');
    const { projekte, fehler } = await projekteAuflisten(fs, ['/p', '/gibt-es-nicht']);
    expect(projekte.map((x) => x.name)).toEqual(['2025-007 Kita', '2026-001 Leer']);
    expect(projekte[0].pfad).toBe('/p/2025-007 Kita');
    expect(fehler).toEqual([]);
    const datei = await projektdateiFinden(fs, '/p/2025-007 Kita');
    expect(datei?.pfad).toBe('03 Berechnungen/Flächen/2025-007.oap');
    expect(await projektdateiFinden(fs, '/p/2026-001 Leer')).toBeNull();
    const kopf = (await projektdateiKopf(fs, '/p/2025-007 Kita', datei!.pfad))!;
    expect(kopf).toMatchObject({ name: 'Kita', meta: { projektcode: '2025-007' }, formulare: { aktiveFassung: 'BAUA' } });
    expect(await projektdateiKopf(fs, '/p/2025-007 Kita', 'fehlt.oap')).toBeNull();
  });
});

describe('Stammdaten: eine Quelle, gemeinsamer Kopf (Q-4)', () => {
  it('Stammdaten aus der Projektdatei (mit Bebauungsplan) – der Kopf enthält die Felder; Büro aus den Einstellungen', async () => {
    const { kopfZeilen } = await import('./ui/DruckKopf');
    const { projektWerte } = await import('./excel/projekt');
    const p = createProject();
    p.name = 'EFH Musterweg';
    p.meta = {
      ...p.meta,
      projektcode: '2026-014',
      vorhaben: 'Neubau eines Einfamilienhauses',
      adresse: { strasse: 'Musterweg 3', plz: '48143', ort: 'Münster' },
      grundstueck: { gemarkung: 'Münster', flur: '12', flurstueck: '345' },
      bebauungsplan: { nummer: '112', name: 'Am Mühlenbach' },
      bauherr: { name: 'Beispiel', vorname: 'Anna', adresse: { strasse: '', plz: '', ort: '' }, kontakte: [] },
      bearbeiter: 'TP',
    };
    const gelesen = readProjectFile(writeArchive(p));
    expect(gelesen.meta.bebauungsplan).toEqual({ nummer: '112', name: 'Am Mühlenbach' });
    allgemeinAus({ buero: 'Architekturbüro Muster' });
    const kopf = Object.fromEntries(kopfZeilen(gelesen, { buero: 'Architekturbüro Muster', stand: new Date(2026, 5, 1) }).map((z) => [z.label, z.wert]));
    expect(kopf).toEqual({
      Bauvorhaben: '2026-014 · Neubau eines Einfamilienhauses',
      Adresse: 'Musterweg 3, 48143 Münster',
      Grundstück: 'Gemarkung Münster, Flur 12, Flurstück 345',
      Bebauungsplan: 'Nr. 112 „Am Mühlenbach“',
      Bauherr: 'Anna Beispiel',
      Büro: 'Architekturbüro Muster',
      Bearbeitung: 'TP',
      Stand: '01.06.2026',
    });
    const w = projektWerte(gelesen, new Date(2026, 5, 1));
    expect(w['bplan.text']).toBe('Nr. 112 „Am Mühlenbach“');
    expect(w.datum).toBe('01.06.2026');
    expect(w['kopf.angaben']).toBe('Bebauungsplan: Nr. 112 „Am Mühlenbach“ · Bauherr: Anna Beispiel · Büro: Architekturbüro Muster · Bearbeitung: TP');
    // ohne Bebauungsplan entfällt der Abschnitt in der Datei
    const ohne = readProjectFile(writeArchive({ ...p, meta: { ...p.meta, bebauungsplan: { nummer: ' ' } } }));
    expect(ohne.meta.bebauungsplan).toBeUndefined();
  });
});

describe('QGIS-Vorlage in der Projektdatei', () => {
  it('wird als Originaldatei gesetzt und ersetzt, alles andere bleibt; andere Apps behalten sie beim Speichern', async () => {
    const { archivDateiSetzen } = await import('./archive');
    const p = createProject();
    p.name = 'EFH';
    const v1 = new Uint8Array([1, 2, 3]);
    let oap = archivDateiSetzen(writeArchive(p), { id: 'q1', name: 'Kataster.qgz', art: 'qgis', datum: '2026-11-11' }, v1);
    let gelesen = readProjectFile(oap);
    expect(gelesen.name).toBe('EFH');
    expect(gelesen.dateien?.map((d) => [d.art, d.name, [...d.daten]])).toEqual([['qgis', 'Kataster.qgz', [1, 2, 3]]]);
    // aktualisieren: die alte Fassung verschwindet
    oap = archivDateiSetzen(oap, { id: 'q2', name: 'Kataster.qgz', art: 'qgis', datum: '2026-12-01' }, new Uint8Array([9]));
    gelesen = readProjectFile(oap);
    expect(gelesen.dateien?.map((d) => [d.id, [...d.daten]])).toEqual([['q2', [9]]]);
    expect(Object.keys(unzipSync(oap)).filter((k) => k.startsWith('quellen/'))).toEqual(['quellen/q2/Kataster.qgz']);
    // eine andere App speichert das Projekt neu: die Vorlage bleibt
    expect(readProjectFile(writeArchive(gelesen)).dateien?.map((d) => d.art)).toEqual(['qgis']);
  });
});
