import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readProjectFile, writeArchive } from './archive';
import { createProject } from './model';
import { allgemeinAus, VORGABE_ALLGEMEIN } from './platform/konfig';
import { projektdateiAnlegen, projektdateiLaden, projektdateiSchreiben, SpeicherProjektordner, verbinde } from './platform/projektordner';
import { projektdateiAendern, projektdateiPfad, projektdateiWaehlen } from './projektdatei';

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
  });

  it('gezielt ändern: nur projekt.json, alle anderen Einträge bleiben, Abschnitte anderer Apps auch; ohne Änderung null', () => {
    const p = createProject('Kita');
    p.meta.projektcode = 'BS5';
    const vorher = unzipSync(writeArchive(p));
    // eine andere App hat einen eigenen Abschnitt und eine eigene Datei hinterlegt
    const roh = JSON.parse(strFromU8(vorher['projekt.json'])) as Record<string, unknown>;
    roh.formulare = { aktiveFassung: 'BAUA 2' };
    const bytes = zipSync({ ...vorher, 'projekt.json': strToU8(JSON.stringify(roh)), 'quellen/x/Plan.pdf': new Uint8Array([1, 2, 3]) });
    const neu = projektdateiAendern(bytes, (r) => ({ ...r, projektordner: { presets: ['A'] }, meta: { ...(r.meta as object), kurzname: 'Kita' } }))!;
    const z = unzipSync(neu);
    expect([...z['quellen/x/Plan.pdf']]).toEqual([1, 2, 3]);
    expect(z['manifest.json']).toEqual(vorher['manifest.json']);
    const gelesen = readProjectFile(neu);
    expect(gelesen.meta).toMatchObject({ projektcode: 'BS5', kurzname: 'Kita' });
    expect(gelesen.projektordner).toEqual({ presets: ['A'] });
    expect(gelesen.erweiterungen).toEqual({ formulare: { aktiveFassung: 'BAUA 2' } });
    expect(projektdateiAendern(neu, (r) => r)).toBeNull();
    expect(() => projektdateiAendern(strToU8('{"format":"arch-flaechen-tool"}'), (r) => r)).toThrow(/kein Archiv/);
  });

  it('laden, ändern und anlegen über den Ordnerzugriff; nie überschreiben, was jemand inzwischen geändert hat', async () => {
    const fs = new SpeicherProjektordner();
    const root = 'P:\\Projekte\\BS5 Birkenstraße';
    expect(await projektdateiLaden(fs, root)).toBeNull();
    const p = createProject('Birkenstraße');
    p.meta.projektcode = 'BS5';
    expect(await projektdateiAnlegen(fs, root, 'Planung/Berechnungen/BS5.oap', p, 'Test')).toBe(true);
    // eine vorhandene Datei bleibt beim Anlegen unverändert
    expect(await projektdateiAnlegen(fs, root, 'Planung/Berechnungen/BS5.oap', createProject('anders'), 'Test')).toBe(false);
    const geladen = (await projektdateiLaden(fs, root))!;
    expect(geladen).toMatchObject({ pfad: 'Planung/Berechnungen/BS5.oap', kandidaten: ['Planung/Berechnungen/BS5.oap'] });
    expect(geladen.projekt.name).toBe('Birkenstraße');

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
