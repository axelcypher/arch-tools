import { describe, expect, it } from 'vitest';
import {
  aufloesen,
  ersetzen,
  globaleWerte,
  GLOBALE_VARIABLEN,
  istGlobal,
  istGlobalerName,
  istLokalerName,
  mitAliasen,
  modernisieren,
  platzhalterIn,
  unbekanntePlatzhalter,
  veraltetePlatzhalter,
  type Variable,
} from './platzhalter';

const TAG = new Date(2026, 10, 3);
const LOKAL: Variable[] = [
  { name: 'Name', text: 'Name des Dokuments', aliase: ['name'] },
  { name: 'Nr', text: 'Nummer', aliase: ['nr'] },
];
const VARS = [...GLOBALE_VARIABLEN, ...LOKAL];
const WERTE = { ...globaleWerte({ projektcode: 'BS9', kurzname: 'EFH Musterweg', vorhaben: 'Neubau', bearbeiter: 'TP', datum: TAG }), Name: 'Bauantrag', Nr: 7 };

describe('Platzhalter der Suite', () => {
  it('Schreibregel: global GROSS mit Unterstrich, lokal case-sensitiv ohne Unterstrich', () => {
    for (const v of GLOBALE_VARIABLEN) expect(istGlobalerName(v.name)).toBe(true);
    expect(istGlobalerName('PROJEKT_KUERZEL')).toBe(true);
    expect(istGlobalerName('Projekt_Kuerzel')).toBe(false);
    expect(istLokalerName('Name')).toBe(true);
    expect(istLokalerName('FirmaMail')).toBe(true);
    expect(istLokalerName('Firma_Mail')).toBe(false);
    expect(istLokalerName('name')).toBe(false);
    expect(istLokalerName('NAME')).toBe(false);
    expect(LOKAL.every((v) => !istGlobal(v))).toBe(true);
    // jede globale Variable hat Erklärung, Quelle und Beispiel
    for (const v of GLOBALE_VARIABLEN) expect(v.text && v.quelle && v.beispiel).toBeTruthy();
  });

  it('ersetzt neue Namen, Datum mit Format, Zahlen mit Stellen', () => {
    expect(ersetzen('{PROJEKT_KUERZEL} {DATUM} {Nr:3} {Name}', VARS, WERTE)).toBe('BS9 261103 007 Bauantrag');
    expect(ersetzen('{DATUM:JJJJ-MM-TT}/{JAHR}/{JAHR_KURZ}/{JAHR:JJ}', VARS, WERTE)).toBe('2026-11-03/2026/26/26');
    expect(ersetzen('{PROJEKT_KURZNAME} – {PROJEKT_VORHABEN} ({BEARBEITER})', VARS, WERTE)).toBe('EFH Musterweg – Neubau (TP)');
    // ein Jahr als Zahl oder vierstelliger Text: JJJJ bzw. JJ
    expect(ersetzen('{JAHR} {JAHR:JJ} {JAHR_KURZ}', VARS, { JAHR: 2024, JAHR_KURZ: '2024' })).toBe('2024 24 24');
    expect(ersetzen('{JAHR:MM}', VARS, { JAHR: 2024 })).toBe('{JAHR:MM}');
    // Datum als Text JJJJ-MM-TT wird ebenso formatiert
    expect(ersetzen('{DATUM}', VARS, { DATUM: '2026-11-03' })).toBe('261103');
  });

  it('alte Namen gelten weiter (Aliase, Groß-/Kleinschreibung egal) – Gegenprobe: neue und alte Vorlage ergeben dasselbe', () => {
    const alt = '{Kürzel} {datum} {nr:3} {name}';
    const neu = '{PROJEKT_KUERZEL} {DATUM} {Nr:3} {Name}';
    expect(ersetzen(alt, VARS, WERTE)).toBe(ersetzen(neu, VARS, WERTE));
    expect(ersetzen('{kuerzel}/{nummer}/{projektcode}/{KURZNAME}/{jj}/{Jahr}', VARS, WERTE)).toBe('BS9/BS9/BS9/EFH Musterweg/26/2026');
    expect(ersetzen('{{nummer}}', VARS, WERTE)).toBe('BS9');
  });

  it('Alias mit eigener Angabe: im Projektordner war {datum} JJJJ-MM-TT – {DATUM} bleibt JJMMTT', () => {
    const ordner = [mitAliasen('DATUM', [{ name: 'datum', angabe: 'JJJJ-MM-TT' }], true)];
    expect(ersetzen('{datum}', ordner, { DATUM: TAG })).toBe('2026-11-03');
    expect(ersetzen('{Datum}', ordner, { DATUM: TAG })).toBe('2026-11-03');
    expect(ersetzen('{DATUM}', ordner, { DATUM: TAG })).toBe('261103');
    expect(ersetzen('{datum:JJMMTT}', ordner, { DATUM: TAG })).toBe('261103');
  });

  it('exakter Name vor Alias: ein lokaler Alias überdeckt keine globale Variable', () => {
    const vars = [...GLOBALE_VARIABLEN, { name: 'Rechnungsdatum', text: '', aliase: ['Datum'] }];
    expect(aufloesen('Datum', undefined, vars)?.variable.name).toBe('Rechnungsdatum');
    expect(aufloesen('DATUM', undefined, vars)?.variable.name).toBe('DATUM');
  });

  it('unbekannte Platzhalter und unpassende Angaben bleiben stehen', () => {
    expect(ersetzen('{Bauherr} {DATUM:xyz} {Nr:abc}', VARS, WERTE)).toBe('{Bauherr} {DATUM:xyz} {Nr:abc}');
    expect(unbekanntePlatzhalter('{Bauherr} {DATUM:xyz} {DATUM} {Bauherr}', VARS)).toEqual(['{Bauherr}', '{DATUM:xyz}']);
    // geschweifte Klammern ohne Platzhalter (z. B. in Mailtexten) bleiben unberührt
    expect(ersetzen('a { b } {} {Name', VARS, WERTE)).toBe('a { b } {} {Name');
  });

  it('ohne Wert: leer (Vorgabe) oder stehen lassen', () => {
    expect(ersetzen('{Name}-{Nr}', LOKAL, { Name: 'X' })).toBe('X-');
    expect(ersetzen('{Name}-{Nr}', LOKAL, { Name: 'X' }, { ohneWert: 'stehen' })).toBe('X-{Nr}');
    expect(ersetzen('{Name}', LOKAL, { Name: 'a/b' }, { saeubern: (t) => t.replace('/', ' ') })).toBe('a b');
  });

  it('Fundstellen, alte Namen melden und Vorlage auf Wunsch umstellen', () => {
    const f = platzhalterIn('{Kürzel} x {Nr:3}', VARS);
    expect(f.map((x) => [x.roh, x.index, x.treffer?.variable.name, x.treffer?.angabe, x.treffer?.veraltet])).toEqual([
      ['{Kürzel}', 0, 'PROJEKT_KUERZEL', undefined, true],
      ['{Nr:3}', 11, 'Nr', '3', false],
    ]);
    expect(veraltetePlatzhalter('{Kürzel} {Kürzel} {datum:JJJJ} {jj} {DATUM}', VARS)).toEqual([
      { alt: '{Kürzel}', neu: '{PROJEKT_KUERZEL}' },
      { alt: '{datum:JJJJ}', neu: '{DATUM:JJJJ}' },
      { alt: '{jj}', neu: '{JAHR_KURZ}' },
    ]);
    expect(modernisieren('{Kürzel} {datum} {Name} {Bauherr}', VARS)).toBe('{PROJEKT_KUERZEL} {DATUM} {Name} {Bauherr}');
    // die Bedeutung bleibt: {datum} im Projektordner (JJJJ-MM-TT) wird zu {DATUM:JJJJ-MM-TT}
    const ordner = [mitAliasen('DATUM', [{ name: 'datum', angabe: 'JJJJ-MM-TT' }], true)];
    expect(modernisieren('{datum}_{datum:JJMMTT}', ordner)).toBe('{DATUM:JJJJ-MM-TT}_{DATUM}');
    expect(ersetzen(modernisieren('{datum}', ordner), ordner, { DATUM: TAG })).toBe(ersetzen('{datum}', ordner, { DATUM: TAG }));
    expect(veraltetePlatzhalter('{PROJEKT_KUERZEL} {Name}', VARS)).toEqual([]);
  });
});
