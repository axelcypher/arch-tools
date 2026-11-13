import { VORGABE_NAMENSSCHEMA } from '@core/namensschema';
import ExcelJS from 'exceljs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readProjectFile, writeArchive } from '@core/archive';
import { ordnerAusDateien, SpeicherDateisystem, verbinde } from './dateisystem';
import { dateimuster, naechsteNummer, nameAus, nummerAus, nummerPasst, PLATZHALTER_NUMMER, PLATZHALTER_PROJEKT, PLATZHALTER_VORLAGE, unbekanntePlatzhalterIn } from './nummer';
import type { PlanOptionen, Vorlage } from './plan';
import { ausfuehren, ladeVorlagen, nichtVorausgewaehlt, ohne, ordnerName, planen, presetPruefen, vorlagenAnzahl, vorlagenDateien } from './plan';
import { ausserhalbDerStruktur, pruefe } from './pruefung';
import { allePruefen, berichtCsv, sammelCsv } from './sammel';
import type { Stammdaten } from './stammdaten';
import { beteiligteSammeln, projektEinlesen, projektStatusSetzen } from './projekt';
import { alsProject, angabenAusProjekt, leereStammdaten, leseProjektJson, metaAus, mitAlterProjektJson, platzhalter, projektdateiAenderung, stammAusMeta } from './stammdaten';
import type { OrdnerRegel, Struktur } from './struktur';
import { alleLoeschen, ausEingerueckt, ausruecken, baumOrdnung, baumZeilen, duplizieren, einfuegen, einruecken, hinzufuegen, loeschen, obersteAuswahl, teilbaumVon, umbenennen, unterordnerVon, verschieben, verschiebenNach, zusatzSetzen, zusatzSetzenAlle } from './baum';
import { aktivePresets, alterOapPfad, bausteineAus, GANZER_VORLAGENORDNER, lphKette, ordnerAlsText, ordnerGilt, ordnerAusText, ordnerAusTextMitMeldungen, sichererName, STANDARD, strukturAlsJson, strukturAusJson } from './struktur';
import { MAX_SICHERUNGEN, sicherungenAus, sicherungenMit, sicherungsName, strukturUnterschied, unterschiedText } from './sicherung';
import { alsDokument, fuelleDocx, fuelleText, fuelleVorlage, MUSTER_VORLAGEN, zielDateiname } from './vorlagen';

const TAG = new Date(2026, 9, 1);

function stamm(patch: Partial<Stammdaten> = {}): Stammdaten {
  return {
    ...leereStammdaten(),
    nummer: '2026-014',
    kurzname: 'EFH Musterweg',
    bezeichnung: 'Neubau eines Einfamilienhauses',
    adresse: { strasse: 'Musterweg 3', plz: '48143', ort: 'Münster' },
    bauherr: { name: 'Familie Beispiel', adresse: { strasse: 'Altweg 1', plz: '48143', ort: 'Münster' }, kontakte: [{ art: 'email', wert: 'b@example.org' }] },
    bearbeiter: 'TP',
    leistungsphasen: [1, 2, 3, 4],
    beteiligte: [{ rolle: 'Tragwerk', name: 'Büro Statik', kontakt: '0251 1234' }],
    ...patch,
  };
}

const KLEIN: Struktur = {
  ...STANDARD,
  name: 'Klein',
  ordner: [{ pfad: '00 Projekt' }, { pfad: '02 Pläne/Entwurf', dateischema: true }, { pfad: '02 Pläne/Ausführung', lph: [5], dateischema: true }, { pfad: '08 Bauleitung', lph: [8] }],
  // Dateinamen der Vorlagen unverändert (wie vor den Presets)
  vorlagenname: '{name}',
};

/** Projektdatei der Testprojekte in „00 Projekt“ */
const OAP = { oapPfad: '00 Projekt/{nummer} {kurzname}.oap' };
const plane = (s: Stammdaten, struktur: Struktur, vorlagen: Vorlage[], vorhandene: Parameters<typeof planen>[3] = [], date = TAG, opt: PlanOptionen = {}) => planen(s, struktur, vorlagen, vorhandene, date, { ...OAP, ...opt });
/** Projektordner im Speicher als eingelesener Ordner */
const eingelesen = async (fs: SpeicherDateisystem, basis: string) => ({ pfad: basis, name: basis.split('/').pop()!, eintraege: await fs.liste(basis, 12), lies: (p: string) => fs.lies(basis, p) });

const vorlage = (pfad: string, inhalt: string | Uint8Array): Vorlage => ({ pfad, lies: async () => (typeof inhalt === 'string' ? strToU8(inhalt) : inhalt) });

describe('Nummern und Namen', () => {
  it('Projektnummer nach Schema', () => {
    expect(nummerAus('{jahr}-{nr:3}', 14, TAG)).toBe('2026-014');
    expect(nummerAus('{jj}{nr:2}', 7, TAG)).toBe('2607');
    expect(nummerAus('P{nr}', 123, TAG)).toBe('P123');
  });

  it('nächste freie Nummer aus den Ordnern des Stammordners – im laufenden Jahr', () => {
    const ordner = ['2025-031 Altbau', '2026-001 Haus A', '2026-013 Kita', '2026-2 falsches Format', 'Vorlagen', '2026-0140 zu lang'];
    expect(naechsteNummer('{jahr}-{nr:3}', ordner, TAG)).toBe('2026-141');
    expect(naechsteNummer('{jahr}-{nr:3}', ['2025-031 Altbau'], TAG)).toBe('2026-001');
    expect(naechsteNummer('{jahr}-{nr:3}', [], TAG)).toBe('2026-001');
    expect(naechsteNummer('{jj}{nr:3}', ['26013 Kita', '26014_Schule', '25099 Vorjahr'], TAG)).toBe('26015');
    // Schema ohne laufende Nummer: nichts zu zählen
    expect(naechsteNummer('{jahr}', ordner, TAG)).toBe('2026');
  });

  it('Projektnummer passt zum Schema; Vorschlag über die Ordner mehrerer Stammordner (P-03)', () => {
    expect(nummerPasst('{jahr}-{nr:3}', '26-14')).toBe(false);
    expect(nummerPasst('{jahr}-{nr:3}', '2026-014')).toBe(true);
    expect(nummerPasst('{jahr}-{nr:3}', '2026-1014')).toBe(true);
    expect(nummerPasst('{jahr}-{nr:3}', '2026-14')).toBe(false);
    expect(nummerPasst('{jj}{nr:3}', '26015')).toBe(true);
    expect(nummerPasst('P{nr}', 'p7')).toBe(true);
    // Stammordner „Projekte“, „Archiv“ und „Akquise“: die höchste Nummer aller zählt
    const projekte = ['2026-003 Haus', '2026-007 Kita'];
    const archiv = ['2026-012 Abgeschlossen', '2025-099 Alt'];
    const akquise = ['2026-010 Wettbewerb'];
    expect(naechsteNummer('{jahr}-{nr:3}', projekte, TAG)).toBe('2026-008');
    expect(naechsteNummer('{jahr}-{nr:3}', [...projekte, ...archiv, ...akquise], TAG)).toBe('2026-013');
  });

  it('Ordnername: Platzhalter ersetzt, unzulässige Zeichen entfernt', () => {
    expect(ordnerName(stamm(), STANDARD, TAG)).toBe('2026-014 EFH Musterweg');
    expect(ordnerName(stamm({ kurzname: 'Haus: A/B? ' }), STANDARD, TAG)).toBe('2026-014 Haus A B');
    // Jahr als Zahl (Anlagejahr): alte und neue Namen, mit Format
    expect(ordnerName(stamm(), { ...STANDARD, ordnername: '{jahr} {JAHR} {jj} {JAHR_KURZ} {JAHR:JJ} {nummer}' }, TAG, 2024)).toBe('2024 2024 24 24 24 2026-014');
    expect(nameAus('{jahr}/{JAHR}/{JAHR:JJ}/{jj}', { jahr: 2026 })).toBe('2026/2026/26/26');
    expect(nameAus('{JAHR:JJ}-{JAHR:JJJJ}', { jahr: '2025' })).toBe('25-2025');
    expect(sichererName('Ende. ')).toBe('Ende');
    expect(nameAus('{nummer}_{{kurzname}}_{unbekannt}', { nummer: '1', kurzname: 'x' })).toBe('1_x_{unbekannt}');
  });

  it('Dateinamenschema als Prüfmuster', () => {
    const m = dateimuster('{nummer}_{plannummer}_{index}_{titel}', '2026-014');
    expect(m.test('2026-014_A-101_b_Grundriss EG')).toBe(true);
    expect(m.test('2026-014_A-101_b_Grundriss_EG_neu')).toBe(true); // der Titel darf Unterstriche enthalten
    expect(m.test('2026-013_A-101_b_Grundriss EG')).toBe(false); // fremde Projektnummer
    expect(m.test('Grundriss EG')).toBe(false);
    expect(m.test('2026-014_A-101_Grundriss EG')).toBe(false); // Index fehlt
    expect(dateimuster('{datum}_{titel}', '').test('2026-10-01_Aktennotiz')).toBe(true);
  });

  it('ein Platzhalter-Satz: Groß-/Kleinschreibung egal, {kürzel} = {nummer}, {datum:JJMMTT}, unbekannte erkannt (P-06)', () => {
    const werte = { nummer: '2026-014', kurzname: 'EFH', vorhaben: 'Neubau', jahr: 2026, jj: '26', datum: '2026-11-10', bearbeiter: 'TP' };
    expect(nameAus('{Nummer} {KURZNAME} {Kürzel} {projektcode}', werte)).toBe('2026-014 EFH 2026-014 2026-014');
    expect(nameAus('{datum} {datum:JJMMTT} {datum:TT.MM.JJJJ} {Datum:jjjjmmtt}', werte)).toBe('2026-11-10 261110 10.11.2026 20261110');
    expect(nameAus('{datum:xyz} {vorhaben} {jj}', werte)).toBe('{datum:xyz} Neubau 26');
    expect(unbekanntePlatzhalterIn('{Nummer} {kürzel} {datum:JJMMTT} {bauherr} {datum:xyz}', PLATZHALTER_PROJEKT)).toEqual(['{bauherr}', '{datum:xyz}']);
    expect(unbekanntePlatzhalterIn('{jahr}-{nr:4} {nr}', PLATZHALTER_NUMMER)).toEqual([]);
    expect(unbekanntePlatzhalterIn('{name} {titel}', PLATZHALTER_VORLAGE)).toEqual(['{titel}']);
    // Dateischema mit Datum im anderen Format
    expect(dateimuster('{datum:JJMMTT}_{titel}', '').test('261110_Aktennotiz')).toBe(true);
    expect(dateimuster('{Kürzel}_{titel}', '2026-014').test('2026-014_Plan')).toBe(true);
  });
});

describe('Struktur', () => {
  it('Ordnerliste als Text lesen und schreiben', () => {
    const text = '# Kommentar\n00 Projekt\n02 Pläne\\Ausführung | LPh 5-6 | Dateischema\n\n07 Ausschreibung | lph 6, 7\n00 projekt\n  08 Bau/  Mängel? | LPh 8';
    const o = ordnerAusText(text);
    expect(o).toEqual([{ pfad: '00 Projekt' }, { pfad: '02 Pläne/Ausführung', lph: [5, 6], dateischema: true }, { pfad: '07 Ausschreibung', lph: [6, 7] }, { pfad: '08 Bau/Mängel', lph: [8] }]);
    expect(ordnerAlsText(o)).toBe('00 Projekt\n02 Pläne/Ausführung | LPh 5-6 | Dateischema\n07 Ausschreibung | LPh 6-7\n08 Bau/Mängel | LPh 8');
    expect(ordnerAusText(ordnerAlsText(STANDARD.ordner))).toEqual(STANDARD.ordner);
  });

  it('Ordnerliste: Meldungen mit Zeilennummer statt stiller Korrektur (PB-03)', () => {
    const text = '00 Projekt\n# Kommentar\n\n10 Archiv | LPh 10\n00 projekt\nTest<>Ordner\n05 Protokolle | LPh 4 | Ablage\n06 Genehmigung | LPh 0, 4';
    const { ordner, meldungen } = ordnerAusTextMitMeldungen(text);
    expect(ordner).toEqual([{ pfad: '00 Projekt' }, { pfad: '10 Archiv' }, { pfad: 'Test Ordner' }, { pfad: '05 Protokolle', lph: [4] }, { pfad: '06 Genehmigung', lph: [4] }]);
    expect(meldungen).toEqual([
      { zeile: 4, text: 'Zeile 4: LPh 10 gibt es nicht (nur 1 bis 9) – der Ordner wird dann immer angelegt.' },
      { zeile: 5, text: 'Zeile 5 doppelt zu Zeile 1 – nur die erste gilt.' },
      { zeile: 6, text: 'Zeile 6: Zeichen < > werden entfernt.' },
      { zeile: 7, text: 'Zeile 7: unbekannter Zusatz „Ablage“ – erlaubt sind „LPh …“ und „Dateischema“.' },
      { zeile: 8, text: 'Zeile 8: LPh 0 gibt es nicht (nur 1 bis 9).' },
    ]);
    // fehlerfreie Listen: keine Meldungen, dasselbe Ergebnis wie bisher
    expect(ordnerAusTextMitMeldungen(ordnerAlsText(STANDARD.ordner))).toEqual({ ordner: STANDARD.ordner, meldungen: [] });
    expect(ordnerAusText(text)).toEqual(ordner);
  });

  it('Ordnerliste als Baum: einrücken, ausrücken, verschieben, umbenennen, löschen, hinzufügen, Zusätze – Rundlauf mit dem Text (P-04)', () => {
    const o: OrdnerRegel[] = [{ pfad: 'A' }, { pfad: 'B/x', lph: [5] }, { pfad: 'B/y', dateischema: true }, { pfad: 'C' }];
    expect(baumZeilen(o).map((z) => `${'  '.repeat(z.tiefe)}${z.name}${z.regel ? '' : ' (ohne Regel)'}`)).toEqual(['A', 'B (ohne Regel)', '  x', '  y', 'C']);
    // C wird Unterordner von B, dann wieder hinaus (direkt hinter B)
    const ein = einruecken(o, 'C');
    expect(ein).toEqual([{ pfad: 'A' }, { pfad: 'B/x', lph: [5] }, { pfad: 'B/y', dateischema: true }, { pfad: 'B/C' }]);
    expect(ausruecken(ein, 'B/C')).toEqual(o);
    // verschieben unter Geschwistern; der erste kann nicht nach oben
    expect(verschieben(o, 'B/y', -1).map((r) => r.pfad)).toEqual(['A', 'B/y', 'B/x', 'C']);
    expect(verschieben(o, 'A', -1)).toBe(o);
    expect(verschieben(o, 'C', -1).map((r) => r.pfad)).toEqual(['A', 'C', 'B/x', 'B/y']);
    // umbenennen benennt den ganzen Zweig um; doppelte Namen und unzulässige Zeichen
    expect(umbenennen(o, 'B', 'Pläne').map((r) => r.pfad)).toEqual(['A', 'Pläne/x', 'Pläne/y', 'C']);
    expect(umbenennen(o, 'B', 'a')).toBe(o);
    expect(umbenennen(o, 'A', 'Test<>/Ordner').map((r) => r.pfad)[0]).toBe('Test Ordner');
    // löschen mit Inhalt, hinzufügen mit durchgezählten Namen
    expect(loeschen(o, 'B')).toEqual([{ pfad: 'A' }, { pfad: 'C' }]);
    const h = hinzufuegen(hinzufuegen(o, 'B').ordner, 'B');
    expect(h.pfad).toBe('B/Neuer Ordner 2');
    expect(h.ordner.map((r) => r.pfad)).toEqual(['A', 'B/x', 'B/y', 'B/Neuer Ordner', 'B/Neuer Ordner 2', 'C']);
    // Zusätze: ein Ordner ohne Regel bekommt eine
    expect(zusatzSetzen(o, 'B', { lph: [8, 4] })).toEqual([{ pfad: 'A' }, { pfad: 'B', lph: [4, 8] }, { pfad: 'B/x', lph: [5] }, { pfad: 'B/y', dateischema: true }, { pfad: 'C' }]);
    expect(zusatzSetzen(o, 'B/x', { lph: [] })[1]).toEqual({ pfad: 'B/x' });
    // Rundlauf Text ↔ Baum verlustfrei
    expect(ordnerAusText(ordnerAlsText(baumOrdnung(STANDARD.ordner)))).toEqual(STANDARD.ordner);
    expect(baumOrdnung(STANDARD.ordner)).toEqual(STANDARD.ordner);
  });

  it('Klick-Editor: kopieren und in mehrere Ordner einfügen, Bausteine, duplizieren, verschieben, mehrere anlegen', () => {
    const o: OrdnerRegel[] = [{ pfad: '07 Ausschreibung', lph: [6, 7] }, { pfad: '07 Ausschreibung/Rohbau/Angebote' }, { pfad: '07 Ausschreibung/Rohbau/Vergabe', dateischema: true }, { pfad: '07 Ausschreibung/Dach' }, { pfad: '08 Bauleitung' }];
    // oberste Auswahl: Unterordner gewählter Ordner zählen nicht extra
    expect(obersteAuswahl(['07 Ausschreibung/Rohbau', '07 ausschreibung/rohbau/Angebote', '08 Bauleitung', '08 Bauleitung'])).toEqual(['07 Ausschreibung/Rohbau', '08 Bauleitung']);
    // Baustein aus den Unterordnern von Rohbau – relativ, mit Regeln
    const baustein = unterordnerVon(o, '07 Ausschreibung/Rohbau');
    expect(baustein).toEqual([{ pfad: 'Angebote' }, { pfad: 'Vergabe', dateischema: true }]);
    // in mehrere Ordner auf einmal; vorhandene werden zusammengeführt, erneutes Einfügen ändert nichts
    const r = einfuegen(o, ['07 Ausschreibung/Dach', '08 Bauleitung', '07 Ausschreibung/Rohbau'], baustein);
    expect(r.neu).toEqual(['07 Ausschreibung/Dach/Angebote', '07 Ausschreibung/Dach/Vergabe', '08 Bauleitung/Angebote', '08 Bauleitung/Vergabe']);
    expect(r.ordner.filter((x) => x.pfad.startsWith('07 Ausschreibung/Dach')).map((x) => x)).toEqual([{ pfad: '07 Ausschreibung/Dach' }, { pfad: '07 Ausschreibung/Dach/Angebote' }, { pfad: '07 Ausschreibung/Dach/Vergabe', dateischema: true }]);
    const nochmal = einfuegen(r.ordner, ['07 Ausschreibung/Dach'], baustein);
    expect(nochmal.neu).toEqual([]);
    expect(nochmal.ordner).toBe(r.ordner);
    // in den Stamm
    expect(einfuegen([], [''], [{ pfad: 'A/B' }]).ordner).toEqual([{ pfad: 'A/B' }]);
    // kopieren: der Ordner selbst samt Inhalt, relativ zu seinem Elternordner
    expect(teilbaumVon(o, ['07 Ausschreibung/Rohbau'])).toEqual([{ pfad: 'Rohbau/Angebote' }, { pfad: 'Rohbau/Vergabe', dateischema: true }]);
    expect(einfuegen(o, ['08 Bauleitung'], teilbaumVon(o, ['07 Ausschreibung/Rohbau'])).neu).toEqual(['08 Bauleitung/Rohbau']);
    // duplizieren: direkt dahinter, Name durchgezählt
    const d = duplizieren(o, '07 Ausschreibung/Rohbau');
    expect(d.pfad).toBe('07 Ausschreibung/Rohbau 2');
    expect(d.ordner.map((x) => x.pfad)).toEqual([
      '07 Ausschreibung',
      '07 Ausschreibung/Rohbau/Angebote',
      '07 Ausschreibung/Rohbau/Vergabe',
      '07 Ausschreibung/Rohbau 2',
      '07 Ausschreibung/Rohbau 2/Angebote',
      '07 Ausschreibung/Rohbau 2/Vergabe',
      '07 Ausschreibung/Dach',
      '08 Bauleitung',
    ]);
    expect(duplizieren(d.ordner, '07 Ausschreibung/Rohbau').pfad).toBe('07 Ausschreibung/Rohbau 3');
    // verschieben: hinein, davor, dahinter; nicht in sich selbst, nicht auf einen gleichen Namen
    expect(verschiebenNach(o, ['07 Ausschreibung/Dach'], '08 Bauleitung', 'in')).toEqual({
      ordner: [{ pfad: '07 Ausschreibung', lph: [6, 7] }, { pfad: '07 Ausschreibung/Rohbau/Angebote' }, { pfad: '07 Ausschreibung/Rohbau/Vergabe', dateischema: true }, { pfad: '08 Bauleitung' }, { pfad: '08 Bauleitung/Dach' }],
      pfade: ['08 Bauleitung/Dach'],
    });
    expect(verschiebenNach(o, ['07 Ausschreibung/Dach'], '07 Ausschreibung/Rohbau', 'vor')!.ordner.map((x) => x.pfad)).toEqual(['07 Ausschreibung', '07 Ausschreibung/Dach', '07 Ausschreibung/Rohbau/Angebote', '07 Ausschreibung/Rohbau/Vergabe', '08 Bauleitung']);
    expect(verschiebenNach(o, ['08 Bauleitung'], '07 Ausschreibung', 'vor')!.pfade).toEqual(['08 Bauleitung']);
    expect(verschiebenNach(o, ['07 Ausschreibung/Rohbau', '08 Bauleitung'], '', 'in')!.ordner.map((x) => x.pfad)).toEqual(['07 Ausschreibung', '07 Ausschreibung/Dach', 'Rohbau/Angebote', 'Rohbau/Vergabe', '08 Bauleitung']);
    expect(verschiebenNach(o, ['07 Ausschreibung'], '07 Ausschreibung/Rohbau', 'in')).toBeNull();
    expect(verschiebenNach(einfuegen(o, ['08 Bauleitung'], [{ pfad: 'Dach' }]).ordner, ['07 Ausschreibung/Dach'], '08 Bauleitung', 'in')).toBeNull();
    // ein Elternordner ohne eigene Regel, der leer würde, bleibt stehen
    expect(verschiebenNach(o, ['07 Ausschreibung/Rohbau/Angebote', '07 Ausschreibung/Rohbau/Vergabe'], '08 Bauleitung', 'in')!.ordner).toContainEqual({ pfad: '07 Ausschreibung/Rohbau' });
    // mehrere löschen, Zusätze für mehrere
    expect(alleLoeschen(o, ['07 Ausschreibung/Rohbau', '07 Ausschreibung/Rohbau/Angebote', '08 Bauleitung']).map((x) => x.pfad)).toEqual(['07 Ausschreibung', '07 Ausschreibung/Dach']);
    expect(zusatzSetzenAlle(o, ['07 Ausschreibung/Dach', '08 Bauleitung'], (r) => ({ lph: [...(r?.lph ?? []), 8] })).filter((x) => x.lph?.includes(8)).map((x) => x.pfad)).toEqual(['07 Ausschreibung/Dach', '08 Bauleitung']);
    // mehrere Ordner aus einer eingerückten Liste, mit Zusätzen und Meldungen
    expect(ausEingerueckt('Rohbau\n\tAngebote\n\tVergabe | Dateischema\n- Dach | LPh 6-7\n    Angebote/Alt\n\n# Kommentar\nRohbau')).toEqual({
      ordner: [{ pfad: 'Rohbau' }, { pfad: 'Rohbau/Angebote' }, { pfad: 'Rohbau/Vergabe', dateischema: true }, { pfad: 'Dach', lph: [6, 7] }, { pfad: 'Dach/Angebote/Alt' }],
      meldungen: [{ zeile: 8, text: 'Zeile 8 doppelt zu Zeile 1 – nur die erste gilt.' }],
    });
  });

  it('Leistungsphasen werden an Unterordner vererbt – im Plan und in der Prüfung', () => {
    const o: OrdnerRegel[] = [{ pfad: '07 Ausschreibung', lph: [6, 7] }, { pfad: '07 Ausschreibung/Rohbau/Angebote' }, { pfad: '07 Ausschreibung/Rohbau/Mängel', lph: [8] }, { pfad: '09 Fotos' }];
    expect(lphKette(o, '07 Ausschreibung/Rohbau/Mängel')).toEqual([{ pfad: '07 Ausschreibung', lph: [6, 7] }, { pfad: '07 Ausschreibung/Rohbau/Mängel', lph: [8] }]);
    expect(ordnerGilt(o, '07 Ausschreibung/Rohbau/Angebote', [1, 2, 3, 4])).toBe(false);
    expect(ordnerGilt(o, '07 Ausschreibung/Rohbau/Angebote', [6])).toBe(true);
    expect(ordnerGilt(o, '07 Ausschreibung/Rohbau/Mängel', [6])).toBe(false);
    expect(ordnerGilt(o, '07 Ausschreibung/Rohbau/Mängel', [7, 8])).toBe(true);
    // ohne Leistungsphasen entsteht alles
    expect(ordnerGilt(o, '07 Ausschreibung/Rohbau/Mängel', [])).toBe(true);
    const s: Struktur = { ...STANDARD, ordner: o, presets: [] };
    const pfade = planen(stamm({ leistungsphasen: [1, 2, 3, 4] }), s, [], [], TAG).schritte.filter((x) => x.art === 'ordner' && x.herkunft === 'struktur').map((x) => x.pfad);
    expect(pfade).toEqual(['09 Fotos']);
    // Prüfung: Ordner unter einem nicht beauftragten Elternordner fehlen nicht
    expect(pruefe('2026-014 EFH Musterweg', [{ pfad: '09 Fotos', ordner: true, groesse: 0 }], s, { ...stamm({ leistungsphasen: [1, 2, 3, 4] }), angelegt: '2026-10-01', struktur: '', dateischema: '' }).fehlendeOrdner).toEqual([]);
    expect(pruefe('2026-014 EFH Musterweg', [{ pfad: '09 Fotos', ordner: true, groesse: 0 }], s, { ...stamm({ leistungsphasen: [6] }), angelegt: '2026-10-01', struktur: '', dateischema: '' }).fehlendeOrdner).toEqual(['07 Ausschreibung', '07 Ausschreibung/Rohbau/Angebote']);
  });

  it('Bausteine in der Struktur-Datei: Hin und zurück, ungültige entfallen, ohne Bausteine unverändert', () => {
    const s: Struktur = { ...KLEIN, bausteine: [{ name: 'Gewerk', ordner: [{ pfad: 'Angebote' }, { pfad: 'Vergabe', lph: [6, 7] }] }] };
    expect(strukturAusJson(strukturAlsJson(s))).toEqual(s);
    expect(strukturAusJson(strukturAlsJson(KLEIN))).not.toHaveProperty('bausteine');
    expect(bausteineAus([{ name: ' Gewerk ', ordner: [{ pfad: 'A<>' }, { pfad: '' }, 3] }, { name: 'gewerk', ordner: [{ pfad: 'B' }] }, { name: 'Leer', ordner: [] }, { ordner: [{ pfad: 'C' }] }, 'x'])).toEqual([
      { name: 'Gewerk', ordner: [{ pfad: 'A' }] },
    ]);
    expect(unterschiedText(strukturUnterschied(KLEIN, s))).toBe('1 Baustein neu (Gewerk)');
  });

  it('Konfiguration als JSON: Hin und zurück, Vorgaben für fehlende Angaben, verständliche Fehler', () => {
    expect(strukturAusJson(strukturAlsJson(KLEIN))).toEqual(KLEIN);
    const teil = strukturAusJson('{"name":"Büro","ordner":["A | LPh 2","B/C"],"flaechenprojekt":"03 Flächen/{nummer}.oap"}');
    expect(teil).toMatchObject({ name: 'Büro', nummernschema: STANDARD.nummernschema, ordner: [{ pfad: 'A', lph: [2] }, { pfad: 'B/C' }] });
    // der Ort der Projektdatei ist jetzt eine gemeinsame Einstellung aller Apps – aus älteren Strukturen übernommen
    expect('flaechenprojekt' in teil).toBe(false);
    expect(alterOapPfad({ flaechenprojekt: '03 Flächen\\{nummer}.oap' })).toBe('03 Flächen/{nummer}.oap');
    expect(alterOapPfad({})).toBeNull();
    expect(() => strukturAusJson('kein json')).toThrow(/kein gültiges JSON/);
    expect(() => strukturAusJson('{"ordner":[1,2]}')).toThrow(/keinen gültigen Ordner/);
    // Gegenprobe: eine leere Ordnerliste ist gültig (alle Ordner gelöscht) und sperrt das Speichern nicht
    expect(strukturAusJson('{"ordner":[]}').ordner).toEqual([]);
  });
});

describe('Sicherungen der Struktur (P-01)', () => {
  it('Name projektordner.json.bak-JJJJ-MM-TT-hhmm, nur die neuesten zehn bleiben', () => {
    expect(sicherungsName(new Date(2026, 10, 1, 9, 5))).toBe('projektordner.json.bak-2026-11-01-0905');
    let roh: unknown = null;
    for (let i = 0; i < 12; i++) roh = sicherungenMit(roh, { name: `S${i}`, grund: 'Test', inhalt: { struktur: KLEIN, vorlagenordner: '' } });
    const liste = sicherungenAus(roh);
    expect(liste).toHaveLength(MAX_SICHERUNGEN);
    expect(liste.map((x) => x.name).slice(0, 2)).toEqual(['S11', 'S10']);
    expect(liste.at(-1)!.name).toBe('S2');
    // Ungültiges entfällt
    expect(sicherungenAus({ sicherungen: [{ name: 'x' }, null] })).toEqual([]);
  });

  it('Vorschau der Änderung: entfallende und neue Ordner, Schemata, Presets', () => {
    const neu: Struktur = { ...KLEIN, nummernschema: '{jj}-{nr:2}', ordnername: '{nummer}_{kurzname}', ordner: [{ pfad: 'B' }, { pfad: 'C' }, { pfad: 'D' }], presets: [] };
    const u = strukturUnterschied(KLEIN, neu);
    expect(u).toMatchObject({ weg: KLEIN.ordner.map((o) => o.pfad), neu: ['B', 'C', 'D'], schemata: ['Projektnummer', 'Name des Projektordners'] });
    expect(unterschiedText(u)).toMatch(/^4 Ordner entfallen, 3 neu, 2 Schemata ändern sich \(Projektnummer, Name des Projektordners\)/);
    expect(unterschiedText(strukturUnterschied(KLEIN, KLEIN))).toBe('');
  });
});

describe('Stammdaten', () => {
  it('Koordinaten der Adresse gehen in die Projektdatei und zurück', () => {
    const koordinaten = { epsg: 25832 as const, ost: 405577.31, nord: 5757743.76, lat: 51.96236, lon: 7.62571, adresse: 'Musterweg 3, 48143 Münster', quelle: 'OpenStreetMap (Nominatim)', stand: '2026-11-11' };
    const m = metaAus({ ...stamm(), koordinaten });
    expect(m.koordinaten).toEqual(koordinaten);
    expect(stammAusMeta(m).koordinaten).toEqual(koordinaten);
  });

  it('Bebauungsplan und Stand (Akquise) aus dem Assistenten gehen in die Projektdatei und zurück; beim Ergänzen als Änderung erkannt', () => {
    const m = metaAus(stamm({ bebauungsplan: { nummer: ' 112 ', name: '' }, status: 'akquise' }));
    expect(m.bebauungsplan).toEqual({ nummer: '112' });
    expect(m.status).toBe('akquise');
    expect(stammAusMeta(m)).toMatchObject({ bebauungsplan: { nummer: '112' }, status: 'akquise' });
    // „aktiv“ steht nicht in der Datei, leerer Bebauungsplan entfällt
    expect(metaAus(stamm({ bebauungsplan: { nummer: ' ', name: '' }, status: 'aktiv' }))).not.toHaveProperty('status');
    expect(metaAus(stamm({ bebauungsplan: { nummer: ' ', name: '' } }))).not.toHaveProperty('bebauungsplan');
    // mit der Kopie des Namensschemas (Vorgabe), sonst käme „Namensschema“ als Änderung dazu
    const basis = { meta: metaAus(stamm()), namensschema: structuredClone(VORGABE_NAMENSSCHEMA) };
    expect(projektdateiAenderung(basis, stamm({ status: 'akquise', bebauungsplan: { nummer: '5' } }), { struktur: KLEIN, presets: [] }).teile).toEqual(['Bebauungsplan', 'Status', 'Struktur']);
  });

  it('Ergänzen: unbekannte Unterfelder geänderter Teile bleiben erhalten; Leerzeichen am Rand gelten nicht als Änderung', () => {
    // eine neuere Fassung hat beim Bauherrn und in der Adresse Felder angelegt, die dieses Tool nicht kennt
    const meta = metaAus(stamm());
    const zukunft = {
      ...meta,
      bauherr: { ...meta.bauherr, firma: 'Beispiel GmbH', adresse: { ...meta.bauherr.adresse, land: 'DE' } },
      adresse: { ...meta.adresse, zusatz: 'Hinterhaus' },
    } as typeof meta;
    const basis = { meta: zukunft, namensschema: structuredClone(VORGABE_NAMENSSCHEMA) };
    const ziel = { struktur: KLEIN, presets: [] };
    const geladen = stammAusMeta(zukunft);
    // nichts geändert: die unbekannten Felder allein sind keine Änderung
    expect(projektdateiAenderung(basis, geladen, ziel).teile).toEqual(['Struktur']);
    // Bauherr geändert: zusammengeführt statt ersetzt
    const a = projektdateiAenderung(basis, { ...geladen, bauherr: { ...geladen.bauherr, name: 'Familie Muster', adresse: { ...geladen.bauherr.adresse, ort: 'Greven' } } }, ziel);
    expect(a.teile).toEqual(['Bauherr', 'Struktur']);
    const roh = a.aendern({ meta: structuredClone(zukunft) }) as { meta: typeof zukunft };
    expect(roh.meta.bauherr).toMatchObject({ name: 'Familie Muster', firma: 'Beispiel GmbH', adresse: { ort: 'Greven', land: 'DE' } });
    // die nicht geänderte Adresse bleibt, wie sie war
    expect(roh.meta.adresse).toEqual(zukunft.adresse);
    // Gegenprobe: ein im Assistenten geleertes bekanntes Unterfeld entfällt wirklich
    const ohneVorname = projektdateiAenderung({ ...basis, meta: { ...zukunft, bauherr: { ...zukunft.bauherr, vorname: 'Erika' } } }, geladen, ziel);
    expect(ohneVorname.teile).toContain('Bauherr');
    const b = (ohneVorname.aendern({ meta: { ...structuredClone(zukunft), bauherr: { ...structuredClone(zukunft.bauherr), vorname: 'Erika' } } }) as { meta: typeof zukunft }).meta.bauherr;
    expect(b).not.toHaveProperty('vorname');
    expect(b).toHaveProperty('firma', 'Beispiel GmbH');
    // Leerzeichen am Rand gespeicherter Werte: keine Änderung
    const mitLeer = { ...meta, kurzname: ' EFH Musterweg ', bauherr: { ...meta.bauherr, name: 'Familie Beispiel ' } };
    expect(projektdateiAenderung({ ...basis, meta: mitLeer }, stammAusMeta(mitLeer), ziel).teile).toEqual(['Struktur']);
  });

  it('Projektdatei: Stammdaten, Anlagedatum, Struktur und Presets hin und zurück', () => {
    const p = alsProject(stamm({ kurzname: ' EFH Musterweg ', aktenzeichen: '63/1' }), { struktur: KLEIN, presets: ['Alle Vorlagen'], date: TAG });
    expect(p.name).toBe('Neubau eines Einfamilienhauses');
    expect(p.meta).toMatchObject({ projektcode: '2026-014', kurzname: 'EFH Musterweg', vorhaben: 'Neubau eines Einfamilienhauses', aktenzeichen: '63/1', leistungsphasen: [1, 2, 3, 4], angelegt: '2026-10-01' });
    expect(p.projektordner).toEqual({ struktur: 'Klein', dateischema: KLEIN.dateischema, presets: ['Alle Vorlagen'] });
    const a = angabenAusProjekt(readProjectFile(writeArchive(p)));
    expect(a).toMatchObject({ nummer: '2026-014', kurzname: 'EFH Musterweg', angelegt: '2026-10-01', struktur: 'Klein', presets: ['Alle Vorlagen'] });
    expect(a.bauherr.kontakte).toEqual([{ art: 'email', wert: 'b@example.org' }]);
    expect(a.beteiligte).toEqual([{ rolle: 'Tragwerk', name: 'Büro Statik', kontakt: '0251 1234' }]);
    expect(stammAusMeta(p.meta).bezeichnung).toBe('Neubau eines Einfamilienhauses');
    // Namensschema: die Vorgabe bzw. das des Büros kommt in die Projektdatei und bleibt erhalten
    expect(readProjectFile(writeArchive(p)).namensschema?.phasen.map((x) => x.kuerzel)).toEqual(['BP', 'EP', 'GP', 'AP', 'AB']);
    const eigen = alsProject(stamm(), { namensschema: { ...structuredClone(VORGABE_NAMENSSCHEMA), indexAbLph: 4 } });
    expect(readProjectFile(writeArchive(eigen)).namensschema?.indexAbLph).toBe(4);
  });

  it('Ergänzen: ein fehlendes oder abweichendes Namensschema der Projektdatei wird auf den Stand des Büros gebracht', () => {
    const s = stamm();
    const struktur = { name: 'Klein', dateischema: '' };
    const p = alsProject(s, { struktur, presets: [] });
    const buero = { ...structuredClone(VORGABE_NAMENSSCHEMA), indexAbLph: 4 };
    // alte Projektdatei ohne Namensschema: „Namensschema“ kommt dazu, sonst bleibt alles
    const ohne = projektdateiAenderung({ meta: p.meta, projektordner: p.projektordner }, s, { struktur, presets: [], namensschema: buero });
    expect(ohne.teile).toEqual(['Namensschema']);
    expect(ohne.aendern({ meta: p.meta, fremd: 1 })).toMatchObject({ fremd: 1, namensschema: buero });
    // abweichendes Schema: auf den Stand des Büros
    const anders = projektdateiAenderung({ meta: p.meta, projektordner: p.projektordner, namensschema: structuredClone(VORGABE_NAMENSSCHEMA) }, s, { struktur, presets: [], namensschema: buero });
    expect(anders.teile).toEqual(['Namensschema (Stand des Büros)']);
    expect(anders.aendern({ meta: p.meta }).namensschema).toEqual(buero);
    // gleich: keine Änderung, der Abschnitt bleibt unberührt
    const gleich = projektdateiAenderung({ meta: p.meta, projektordner: p.projektordner, namensschema: buero }, s, { struktur, presets: [], namensschema: buero });
    expect(gleich.teile).toEqual([]);
    expect(gleich.aendern({ meta: p.meta })).not.toHaveProperty('namensschema');
    // andere Reihenfolge der Schlüssel ist keine Änderung
    const umgestellt = { indexAbLph: buero.indexAbLph, reihenfolge: buero.reihenfolge, antragsarten: buero.antragsarten, phasen: buero.phasen.map((k) => ({ lph: k.lph, name: k.name, kuerzel: k.kuerzel })) };
    expect(projektdateiAenderung({ meta: p.meta, projektordner: p.projektordner, namensschema: umgestellt as typeof buero }, s, { struktur, presets: [], namensschema: buero }).teile).toEqual([]);
    // ohne Büro-Schema gilt die Vorgabe
    expect(projektdateiAenderung({ meta: p.meta, projektordner: p.projektordner, namensschema: structuredClone(VORGABE_NAMENSSCHEMA) }, s, { struktur, presets: [] }).teile).toEqual([]);
  });

  it('alte projekt.json (bis 0.2) wird noch gelesen und füllt Lücken der Projektdatei', () => {
    const alt = leseProjektJson(JSON.stringify({ format: 'projektordner', version: 1, nummer: '2025-007', kurzname: 'Kita', leistungsphasen: [1, 2], beteiligte: [{ rolle: 'Statik', name: 'X' }], angelegt: '2025-05-01', struktur: 'Alt' }));
    expect(alt).toMatchObject({ nummer: '2025-007', kurzname: 'Kita', leistungsphasen: [1, 2], angelegt: '2025-05-01' });
    expect(() => leseProjektJson('{"name":"fremd"}')).toThrow(/keine Projektdatei/);
    expect(() => leseProjektJson('{')).toThrow(/kein gültiges JSON/);
    // Projektdatei aus einer anderen App (ohne Kurzname, Leistungsphasen): Lücken aus der projekt.json
    const ausOap = angabenAusProjekt(alsProject({ ...leereStammdaten(), nummer: '2025-007', bezeichnung: 'Kita am Park' }));
    expect(mitAlterProjektJson(ausOap, alt)).toMatchObject({ nummer: '2025-007', kurzname: 'Kita', bezeichnung: 'Kita am Park', leistungsphasen: [1, 2], struktur: 'Alt' });
  });

  it('Platzhalter heißen wie in den anderen Werkzeugen', () => {
    const ctx = platzhalter(stamm(), '2026-014 EFH Musterweg', TAG);
    expect(ctx.scalars).toMatchObject({
      'projekt.nummer': '2026-014',
      'projekt.code': '2026-014',
      'projekt.name': 'Neubau eines Einfamilienhauses',
      'projekt.adresse': 'Musterweg 3, 48143 Münster',
      'bauherr.name': 'Familie Beispiel',
      'bauherr.email': 'b@example.org',
      'projekt.leistungsphasen': '1, 2, 3, 4',
      datum: '01.10.2026',
      'datum.iso': '2026-10-01',
      beteiligte: 'Tragwerk: Büro Statik (0251 1234)',
    });
    expect(ctx.collections.lph.map((l) => l.name)).toEqual(['Grundlagenermittlung', 'Vorplanung', 'Entwurfsplanung', 'Genehmigungsplanung']);
  });
});

describe('Vorlagen', () => {
  const ctx = platzhalter(stamm(), '2026-014 EFH Musterweg', TAG);

  it('Text: bekannte Platzhalter ersetzt, unbekannte bleiben stehen', () => {
    expect(fuelleText('{{projekt.nummer}} – {{ bauherr.name }} – {{tippfehler}}', ctx)).toBe('2026-014 – Familie Beispiel – {{tippfehler}}');
  });

  it('Textdatei mit BOM (Excel-CSV) behält das BOM', async () => {
    const out = await fuelleVorlage('Planliste.csv', strToU8('\uFEFFProjekt;{{projekt.nummer}}'), ctx);
    expect([...out.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(strFromU8(out.subarray(3))).toBe('Projekt;2026-014');
  });

  it('Word: Platzhalter in Text und Kopfzeile, Sonderzeichen maskiert; andere Teile unverändert', () => {
    const docx = zipSync({
      'word/document.xml': strToU8('<w:t>{{projekt.nummer}} {{bauherr.name}}</w:t><w:t>{{beteiligte}}</w:t>'),
      'word/header1.xml': strToU8('<w:t>{{projekt.kurzname}}</w:t>'),
      'word/styles.xml': strToU8('<x>{{projekt.nummer}}</x>'),
    });
    const z = unzipSync(fuelleDocx(docx, platzhalter(stamm({ bauherr: { ...stamm().bauherr, name: 'Müller & Söhne <GbR>' } }), 'x', TAG)));
    expect(strFromU8(z['word/document.xml'])).toBe('<w:t>2026-014 Müller &amp; Söhne &lt;GbR&gt;</w:t><w:t>Tragwerk: Büro Statik (0251 1234)</w:t>');
    expect(strFromU8(z['word/header1.xml'])).toBe('<w:t>EFH Musterweg</w:t>');
    expect(strFromU8(z['word/styles.xml'])).toBe('<x>{{projekt.nummer}}</x>');
  });

  it('Excel: Einzelwerte und Zeile je Beteiligtem über die gemeinsame Vorlagen-Engine', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Projektblatt');
    ws.getCell('A1').value = '{{projekt.nummer}} {{projekt.kurzname}}';
    ws.getCell('A2').value = '{{beteiligter.rolle}}';
    ws.getCell('B2').value = '{{beteiligter.name}}';
    const zwei = platzhalter(stamm({ beteiligte: [...stamm().beteiligte, { rolle: 'Vermessung', name: 'ÖbVI Muster', kontakt: '' }] }), 'x', TAG);
    const out = await fuelleVorlage('Projektblatt.xlsx', new Uint8Array(await wb.xlsx.writeBuffer()), zwei);
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
    const b = back.getWorksheet('Projektblatt')!;
    expect(b.getCell('A1').value).toBe('2026-014 EFH Musterweg');
    expect([b.getCell('A2').value, b.getCell('B2').value, b.getCell('A3').value, b.getCell('B3').value]).toEqual(['Tragwerk', 'Büro Statik', 'Vermessung', 'ÖbVI Muster']);
  });

  it('andere Dateiarten bleiben unverändert', async () => {
    const pdf = new Uint8Array([37, 80, 68, 70, 123, 123]);
    expect(await fuelleVorlage('Formular.pdf', pdf, ctx)).toBe(pdf);
  });
});

describe('Plan und Anlegen', () => {
  it('Projektdatei: Platzhalter {Kürzel}, {Datum} (JJMMTT) und {Vorhaben} der gemeinsamen Einstellung', () => {
    const plan = plane(stamm(), KLEIN, [], [], TAG, { oapPfad: 'Organisation/{Kürzel} {Datum} {Vorhaben}.oap' });
    expect(plan.projektdatei?.pfad).toBe('Organisation/2026-014 261001 Neubau eines Einfamilienhauses.oap');
  });

  it('Trockenlauf: Ordner nach Leistungsphasen, Projektdatei, Vorlagen', () => {
    const plan = plane(
      stamm(),
      KLEIN,
      [vorlage('LIESMICH.txt', 'nicht kopieren'), vorlage('00 Projekt/{nummer} Projektblatt.md', '# {{projekt.nummer}}'), vorlage('08 Bauleitung/Bautagebuch.md', 'x'), vorlage('00 Projekt/~$gesperrt.docx', 'x'), vorlage('10 Sonstiges/Notiz.txt', 'x')],
      [],
      TAG,
    );
    expect(plan.ordner).toBe('2026-014 EFH Musterweg');
    expect(plan.fehler).toEqual([]);
    expect(plan.schritte.map((s) => `${s.art === 'ordner' ? 'D' : 'F'} ${s.pfad} [${s.herkunft}]`)).toEqual([
      'D 00 Projekt [struktur]',
      'F 00 Projekt/2026-014 EFH Musterweg.oap [projektdatei]',
      'F 00 Projekt/2026-014 Projektblatt.md [vorlage]',
      'D 02 Pläne [struktur]',
      'D 02 Pläne/Entwurf [struktur]',
      'D 10 Sonstiges [vorlage]',
      'F 10 Sonstiges/Notiz.txt [vorlage]',
    ]);
    expect(plan.projektdatei).toEqual({ pfad: '00 Projekt/2026-014 EFH Musterweg.oap', neu: true, teile: [] });
    // LPh 5 und 8 sind nicht beauftragt: zwei Ordner und eine Vorlage bleiben weg
    expect(plan.hinweise.join(' ')).toContain('2 Ordner gehören zu nicht beauftragten Leistungsphasen');
    expect(plan.hinweise.join(' ')).toContain('1 Vorlage liegt in Ordnern nicht beauftragter Leistungsphasen');
    // ohne Angabe von Leistungsphasen entsteht alles
    expect(plane(stamm({ leistungsphasen: [] }), KLEIN, [], [], TAG).schritte.filter((s) => s.art === 'ordner')).toHaveLength(5);
  });

  it('Vorlagen in einem Ordner, dessen Unterordner alle an nicht beauftragten Leistungsphasen hängen, bleiben weg', () => {
    const vorlagen = [vorlage('08 Bauleitung/Bautagebuch.md', 'x'), vorlage('08 Bauleitung/Mängel/Liste.csv', 'x'), vorlage('02 Pläne/Planliste.csv', 'x')];
    // Standardstruktur: „08 Bauleitung“ selbst steht nicht in der Liste, nur seine Unterordner (LPh 8)
    const ohneLph8 = plane(stamm({ leistungsphasen: [1, 2, 3, 4] }), STANDARD, vorlagen, [], TAG);
    expect(ohneLph8.schritte.map((s) => s.pfad).filter((p) => p.startsWith('08'))).toEqual([]);
    // Standardstruktur: Dateinamen nach dem Schema „{nummer} {name}“
    expect(ohneLph8.schritte.map((s) => s.pfad)).toContain('02 Pläne/2026-014 Planliste.csv');
    expect(ohneLph8.hinweise.join(' ')).toContain('2 Vorlagen liegen in Ordnern nicht beauftragter Leistungsphasen');
    // „02 Pläne“ bleibt: dort gibt es weiterhin beauftragte Unterordner
    const mit = plane(stamm({ leistungsphasen: [8] }), STANDARD, vorlagen, [], TAG);
    expect(mit.schritte.map((s) => s.pfad).filter((p) => p.startsWith('08'))).toEqual([
      '08 Bauleitung',
      '08 Bauleitung/2026-014 Bautagebuch.md',
      '08 Bauleitung/Mängel',
      '08 Bauleitung/Mängel/2026-014 Liste.csv',
      '08 Bauleitung/Rechnungen',
    ]);
  });

  it('fehlende Angaben verhindern das Anlegen', async () => {
    const plan = plane(stamm({ nummer: ' ', kurzname: '' }), KLEIN, [], [], TAG);
    // der abgeleitete Fehler „kein Name“ entfällt, wenn Nummer bzw. Kurzname fehlen (P-08)
    expect(plan.fehler).toEqual(['Die Projektnummer fehlt.', 'Der Kurzname fehlt.']);
    expect(plane(stamm({ nummer: 'X', kurzname: 'Y' }), { ...KLEIN, ordnername: '{bauherr}' }, [], [], TAG).fehler).toEqual([expect.stringContaining('unbekannten Platzhalter')]);
    await expect(ausfuehren(new SpeicherDateisystem(), '/p', plan)).rejects.toThrow(/Projektnummer fehlt/);
  });

  it('legt an, füllt Vorlagen und schreibt die Projektdatei mit den Stammdaten', async () => {
    const fs = new SpeicherDateisystem();
    const plan = plane(stamm(), KLEIN, [vorlage('00 Projekt/{nummer} Projektblatt.md', '# {{projekt.nummer}} – {{bauherr.name}}')], [], TAG);
    const ergebnis = await ausfuehren(fs, 'P:\\Projekte', plan);
    expect(ergebnis.every((e) => e.status === 'angelegt')).toBe(true);
    const basis = 'P:/Projekte/2026-014 EFH Musterweg';
    expect(fs.eintraege.get(`${basis}/02 Pläne/Entwurf`)).toBeNull();
    expect(strFromU8(fs.eintraege.get(`${basis}/00 Projekt/2026-014 Projektblatt.md`)!)).toBe('# 2026-014 – Familie Beispiel');
    // keine eigene projekt.json mehr – alles steht in der Projektdatei
    expect(fs.eintraege.has(`${basis}/projekt.json`)).toBe(false);
    // die Projektdatei öffnen QUADRIO, TERRIO, NUMIO und PERMIO
    const p = readProjectFile(fs.eintraege.get(`${basis}/00 Projekt/2026-014 EFH Musterweg.oap`)!);
    expect(p.name).toBe('Neubau eines Einfamilienhauses');
    expect(p.meta).toMatchObject({ projektcode: '2026-014', kurzname: 'EFH Musterweg', bearbeiter: 'TP', angelegt: '2026-10-01', leistungsphasen: [1, 2, 3, 4], adresse: { ort: 'Münster' }, bauherr: { name: 'Familie Beispiel' } });
    expect(p.projektordner).toEqual({ struktur: 'Klein', dateischema: KLEIN.dateischema, presets: ['Alle Vorlagen'] });
    expect(p.storeys.length).toBeGreaterThan(0);
  });

  it('überschreibt nie: Vorhandenes bleibt, der Plan zeigt es vorher an', async () => {
    const fs = new SpeicherDateisystem();
    await ausfuehren(fs, '/p', plane(stamm(), KLEIN, [], [], TAG));
    const basis = '/p/2026-014 EFH Musterweg';
    // von Hand angelegt
    await fs.dateiAnlegen(basis, '00 Projekt/Notiz.txt', strToU8('von Hand'));
    const vorhandene = await fs.liste(basis, 12);
    // zweiter Lauf mit mehr Leistungsphasen und Vorlagen, eine davon gibt es schon
    const plan = plane(stamm({ leistungsphasen: [1, 2, 3, 4, 5] }), KLEIN, [vorlage('00 Projekt/Notiz.txt', 'neu'), vorlage('00 Projekt/Liste.csv', 'neu')], vorhandene, TAG);
    expect(plan.schritte.filter((s) => !s.vorhanden).map((s) => s.pfad)).toEqual(['00 Projekt/Liste.csv', '02 Pläne/Ausführung']);
    expect(plan.hinweise.join(' ')).toContain('5 Einträge sind schon vorhanden und bleiben unverändert');
    const ergebnis = await ausfuehren(fs, '/p', plan);
    expect(ergebnis.filter((e) => e.status === 'angelegt').map((e) => e.schritt.pfad)).toEqual(['00 Projekt/Liste.csv', '02 Pläne/Ausführung']);
    expect(strFromU8(fs.eintraege.get(`${basis}/00 Projekt/Notiz.txt`)!)).toBe('von Hand');
  });

  it('ein Fehler in einem Schritt hält die übrigen nicht auf', async () => {
    const fs = new SpeicherDateisystem();
    const plan = plane(stamm(), KLEIN, [{ pfad: '00 Projekt/kaputt.md', lies: () => Promise.reject(new Error('Datei gesperrt')) }, vorlage('00 Projekt/gut.md', 'ok')], [], TAG);
    const ergebnis = await ausfuehren(fs, '/p', plan);
    expect(ergebnis.filter((e) => e.status === 'fehler').map((e) => [e.schritt.pfad, e.meldung])).toEqual([['00 Projekt/kaputt.md', 'Datei gesperrt']]);
    expect(fs.eintraege.has('/p/2026-014 EFH Musterweg/00 Projekt/gut.md')).toBe(true);
  });

  it('Muster-Vorlagen als Vorlagenordner: Anleitung bleibt weg, Namen und Inhalte werden gefüllt', async () => {
    const fs = new SpeicherDateisystem();
    for (const m of MUSTER_VORLAGEN) await fs.dateiAnlegen('/vorlagen', m.pfad, strToU8(m.inhalt));
    const vorlagen = await ladeVorlagen(fs, '/vorlagen');
    expect(vorlagen).toHaveLength(MUSTER_VORLAGEN.length);
    const plan = plane(stamm(), STANDARD, vorlagen, [], TAG);
    await ausfuehren(fs, '/p', plan);
    const basis = '/p/2026-014 EFH Musterweg';
    expect(fs.eintraege.has(`${basis}/LIESMICH.txt`)).toBe(false);
    const blatt = strFromU8(fs.eintraege.get(`${basis}/00 Projekt/2026-014 Projektblatt.md`)!);
    expect(blatt).toContain('# Projektblatt 2026-014 – EFH Musterweg');
    expect(blatt).toContain('| Bauherr | Familie Beispiel |');
    expect(blatt).not.toContain('{{');
    expect(fs.eintraege.has(`${basis}/02 Pläne/2026-014 Planliste.csv`)).toBe(true);
    // als ZIP (Browser): Ordner und Dateien unter dem Projektordner
    const zip = unzipSync(fs.alsZip('/p'));
    expect(Object.keys(zip)).toContain('2026-014 EFH Musterweg/09 Fotos/');
    expect(Object.keys(zip)).toContain('2026-014 EFH Musterweg/00 Projekt/2026-014 EFH Musterweg.oap');
  });

  it('Pfade verbinden mit dem Trenner des Stammordners', () => {
    expect(verbinde('P:\\Projekte\\', '2026-014 Haus/00 Projekt')).toBe('P:\\Projekte\\2026-014 Haus\\00 Projekt');
    expect(verbinde('/srv/projekte', 'a/b')).toBe('/srv/projekte/a/b');
  });
});

describe('Vorlagen-Presets', () => {
  const werte = { nummer: '2026-014', kurzname: 'EFH Musterweg', jahr: 2026, bearbeiter: 'TP', datum: '2026-10-01' };

  it('Vorlagenordner nach Dateiart: Ordner außerhalb der Struktur und lose Dateien, „Alle Vorlagen“ nicht vorausgewählt (P-05)', () => {
    const vorlagen = [vorlage('Word/Brief.dotx', 'x'), vorlage('Word/Fax.dotx', 'x'), vorlage('Excel/Kosten.xltx', 'x'), vorlage('Briefbogen.pdf', 'x'), vorlage('LIESMICH.txt', 'x'), vorlage('00 Projekt/Notiz.md', 'x')];
    const a = presetPruefen(GANZER_VORLAGENORDNER, vorlagenDateien(vorlagen), KLEIN, werte);
    expect(a).toEqual({ fremd: ['Excel', 'Word'], lose: ['Briefbogen.pdf'], dateien: 5, ausserhalb: 4 });
    // LIESMICH.txt zählt nicht mit
    expect(vorlagenAnzahl(vorlagen)).toBe(5);
    // mehr als die Hälfte außerhalb: bei neuen Projekten nicht vorausgewählt – ausdrücklich gewählt gilt es weiter
    expect([...nichtVorausgewaehlt(KLEIN, vorlagen).keys()]).toEqual(['Alle Vorlagen']);
    expect(plane(stamm({ presets: undefined }), KLEIN, vorlagen).schritte.filter((s) => s.herkunft === 'vorlage')).toEqual([]);
    expect(plane(stamm({ presets: ['Alle Vorlagen'] }), KLEIN, vorlagen).schritte.some((s) => s.pfad === 'Word')).toBe(true);
    // wie ein Projektordner aufgebaut: vorausgewählt wie bisher
    expect(nichtVorausgewaehlt(KLEIN, [vorlage('00 Projekt/A.md', 'x'), vorlage('02 Pläne/Entwurf/B.txt', 'x'), vorlage('10 Extra/C.txt', 'x')]).size).toBe(0);
    // Prüfmodus und Vorschau folgen denselben Regeln
    expect(ausserhalbDerStruktur(KLEIN, [{ pfad: 'Word', ordner: true }, { pfad: '02 Pläne/Alt', ordner: true }, { pfad: 'x.pdf', ordner: false }, { pfad: 'y.oap', ordner: false }])).toEqual({
      fremd: ['Word', '02 Pläne/Alt'],
      lose: ['x.pdf'],
    });
  });

  it('Dateinamen: Schema, eigene Platzhalter, Name aus der Zuordnung, Office-Vorlagen werden Dokumente', () => {
    expect(zielDateiname('Kostenschätzung.xlsx', undefined, '{nummer} {name}', werte)).toBe('2026-014 Kostenschätzung.xlsx');
    // eigener Platzhalter im Namen der Vorlage: das Schema gilt nicht
    expect(zielDateiname('{nummer} Projektblatt.md', undefined, '{nummer} {name}', werte)).toBe('2026-014 Projektblatt.md');
    // Name aus der Zuordnung; die Endung kommt von der Vorlage
    expect(zielDateiname('Brief.dotx', '{nummer}_{kurzname}_Brief Bauherr', '{nummer} {name}', werte)).toBe('2026-014_EFH Musterweg_Brief Bauherr.docx');
    expect(zielDateiname('Brief.dotx', '{nummer} Brief.dotx', '{name}', werte)).toBe('2026-014 Brief.docx');
    expect(zielDateiname('Liste.xltx', undefined, '{name} {datum}', werte)).toBe('Liste 2026-10-01.xlsx');
    expect(zielDateiname('Plan v1.2.pdf', '{name}', '', werte)).toBe('Plan v1.2.pdf');
    // unzulässige Zeichen aus den Stammdaten fallen heraus
    expect(zielDateiname('Notiz.txt', '{kurzname}: {name}', '', { ...werte, kurzname: 'A/B' })).toBe('A B Notiz.txt');
  });

  it('Office-Vorlage als Dokument: Inhaltstyp des Hauptteils umgestellt, sonst unverändert', () => {
    const dotx = zipSync({
      '[Content_Types].xml': strToU8('<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml"/></Types>'),
      'word/document.xml': strToU8('<w:t>{{projekt.nummer}}</w:t>'),
    });
    const docx = unzipSync(alsDokument('Brief.dotx', dotx));
    expect(strFromU8(docx['[Content_Types].xml'])).toContain('wordprocessingml.document.main+xml');
    expect(strFromU8(docx['[Content_Types].xml'])).not.toContain('template');
    const xlsx = new Uint8Array([1, 2, 3]);
    expect(alsDokument('Liste.xlsx', xlsx)).toBe(xlsx);
    expect(() => alsDokument('kaputt.xltx', new Uint8Array([1, 2, 3]))).toThrow(/beschädigt/);
  });

  // Vorlagenordner des Büros, gegliedert nach Dateiart – nicht wie ein Projektordner
  const BUERO: Vorlage[] = [
    vorlage('Word/Briefbogen.dotx', zipSync({ '[Content_Types].xml': strToU8('<Types ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml"/>'), 'word/document.xml': strToU8('<w:t>{{bauherr.name}}</w:t>') })),
    vorlage('Excel/Kostenschätzung.csv', 'Projekt;{{projekt.nummer}}'),
    vorlage('Bauantrag/Bauantrag.pdf', '%PDF'),
    vorlage('Bauantrag/Anlagen/Baubeschreibung.md', '# {{projekt.name}}'),
    vorlage('Bauantrag/LIESMICH.txt', 'nicht kopieren'),
    vorlage('Bauantrag/~$gesperrt.docx', 'x'),
  ];
  const MIT_PRESETS: Struktur = {
    ...STANDARD,
    presets: [
      {
        name: 'Jedes Projekt',
        standard: true,
        eintraege: [
          { quelle: 'Word/Briefbogen.dotx', ziel: '04 Schriftverkehr/Bauherr', name: '{nummer} Brief Bauherr' },
          { quelle: 'Excel/Kostenschätzung.csv', ziel: '03 Berechnungen/Kosten' },
        ],
      },
      { name: 'Bauantrag', eintraege: [{ quelle: 'Bauantrag', ziel: '06 Genehmigung', lph: [4] }, { quelle: 'Bauantrag/Fehlt.docx', ziel: '06 Genehmigung' }] },
    ],
  };
  const vorlagenIm = (plan: ReturnType<typeof planen>) => plan.schritte.filter((x) => x.herkunft === 'vorlage' && x.art === 'datei').map((x) => `${x.pfad} ← ${x.quelle} [${x.preset}]`);

  it('Presets ordnen Vorlagen aus einem eigenen Vorlagenordner zu – mit Namen nach dem Schema des Büros', () => {
    // ohne Auswahl gelten die Standard-Presets
    const standard = plane(stamm(), MIT_PRESETS, BUERO, [], TAG);
    expect(standard.presets).toEqual(['Jedes Projekt']);
    expect(vorlagenIm(standard)).toEqual([
      '03 Berechnungen/Kosten/2026-014 Kostenschätzung.csv ← Excel/Kostenschätzung.csv [Jedes Projekt]',
      '04 Schriftverkehr/Bauherr/2026-014 Brief Bauherr.docx ← Word/Briefbogen.dotx [Jedes Projekt]',
    ]);
    expect(standard.warnungen).toEqual([]);

    // Ordner-Quelle: alle Dateien darin mit ihren Unterordnern; Anleitung und Sperrdateien nicht
    const beide = plane(stamm({ presets: ['Jedes Projekt', 'Bauantrag'] }), MIT_PRESETS, BUERO, [], TAG);
    expect(vorlagenIm(beide)).toContain('06 Genehmigung/2026-014 Bauantrag.pdf ← Bauantrag/Bauantrag.pdf [Bauantrag]');
    expect(vorlagenIm(beide)).toContain('06 Genehmigung/Anlagen/2026-014 Baubeschreibung.md ← Bauantrag/Anlagen/Baubeschreibung.md [Bauantrag]');
    expect(vorlagenIm(beide)).toHaveLength(4);
    expect(beide.warnungen).toEqual(['Preset „Bauantrag“: „Bauantrag/Fehlt.docx“ gibt es im Vorlagenordner nicht.']);

    // an LPh 4 gebunden: ohne Genehmigungsplanung entfällt die Zuordnung
    const ohneLph4 = plane(stamm({ leistungsphasen: [1, 2, 3], presets: ['Bauantrag'] }), MIT_PRESETS, BUERO, [], TAG);
    expect(vorlagenIm(ohneLph4)).toEqual([]);
    expect(ohneLph4.hinweise.join(' ')).toContain('1 Zuordnung gehört zu nicht beauftragten Leistungsphasen');

    // unbekanntes Preset (z. B. aus einer alten projekt.json) wird gemeldet
    expect(plane(stamm({ presets: ['Gibt es nicht'] }), MIT_PRESETS, BUERO, [], TAG).warnungen).toEqual(['Das Preset „Gibt es nicht“ gibt es in der Struktur „Standard“ nicht – es wird übergangen.']);
    // ohne Vorlagenordner keine Warnungen
    expect(plane(stamm({ presets: ['Bauantrag'] }), MIT_PRESETS, [], [], TAG).warnungen).toEqual([]);
    expect(aktivePresets(MIT_PRESETS, []).presets).toEqual([]);
  });

  it('legt an: Office-Vorlage als Dokument gefüllt, Presets in der Projektdatei vermerkt', async () => {
    const fs = new SpeicherDateisystem();
    await ausfuehren(fs, '/p', plane(stamm(), MIT_PRESETS, BUERO, [], TAG));
    const basis = '/p/2026-014 EFH Musterweg';
    const brief = unzipSync(fs.eintraege.get(`${basis}/04 Schriftverkehr/Bauherr/2026-014 Brief Bauherr.docx`)!);
    expect(strFromU8(brief['word/document.xml'])).toBe('<w:t>Familie Beispiel</w:t>');
    expect(strFromU8(brief['[Content_Types].xml'])).toContain('wordprocessingml.document.main+xml');
    expect(strFromU8(fs.eintraege.get(`${basis}/03 Berechnungen/Kosten/2026-014 Kostenschätzung.csv`)!)).toBe('Projekt;2026-014');
    expect(readProjectFile(fs.eintraege.get(`${basis}/00 Projekt/2026-014 EFH Musterweg.oap`)!).projektordner?.presets).toEqual(['Jedes Projekt']);
  });

  it('ergänzt ein vorhandenes Projekt: nur Fehlendes, auch in einem umbenannten Ordner; die Projektdatei gezielt', async () => {
    const fs = new SpeicherDateisystem();
    await ausfuehren(fs, '/p', plane(stamm(), MIT_PRESETS, BUERO, [], TAG));
    // von Hand umbenannt und bearbeitet
    for (const [k, v] of [...fs.eintraege]) {
      fs.eintraege.delete(k);
      fs.eintraege.set(k.replace('/p/2026-014 EFH Musterweg', '/p/2026-014 Musterweg (alt)'), v);
    }
    const basis = '/p/2026-014 Musterweg (alt)';
    fs.eintraege.set(`${basis}/03 Berechnungen/Kosten/2026-014 Kostenschätzung.csv`, strToU8('von Hand'));

    // eingelesen wie im Assistenten
    const g = await projektEinlesen(await eingelesen(fs, basis));
    expect(g.quelle).toEqual({ pfad: '00 Projekt/2026-014 EFH Musterweg.oap' });
    const { angelegt, struktur: _s, dateischema: _d, ...stammdaten } = g.angaben!;
    expect(angelegt).toBe('2026-10-01');
    expect(stammdaten.presets).toEqual(['Jedes Projekt']);

    // später: Bauantrag beauftragt, Preset dazu gewählt
    const plan = plane({ ...stammdaten, leistungsphasen: [1, 2, 3, 4, 5], presets: ['Jedes Projekt', 'Bauantrag'] }, MIT_PRESETS, BUERO, (await eingelesen(fs, basis)).eintraege, new Date(2027, 0, 15), {
      ordner: '2026-014 Musterweg (alt)',
      jahr: 2026,
      projektdatei: g.projektdatei,
    });
    expect(plan.fehler).toEqual([]);
    expect(plan.projektdatei).toEqual({ pfad: '00 Projekt/2026-014 EFH Musterweg.oap', neu: false, teile: ['Leistungsphasen', 'Vorlagen-Presets'] });
    const fehlt = plan.schritte.filter((x) => !x.vorhanden).map((x) => x.pfad);
    expect(fehlt).toEqual(['02 Pläne/Ausführung', '06 Genehmigung/2026-014 Bauantrag.pdf', '06 Genehmigung/Anlagen', '06 Genehmigung/Anlagen/2026-014 Baubeschreibung.md']);

    // einzelne Einträge abwählen: mit einem Ordner entfällt sein Inhalt
    expect(ohne(plan, ['06 Genehmigung/Anlagen']).schritte.filter((x) => !x.vorhanden).map((x) => x.pfad)).toEqual(['02 Pläne/Ausführung', '06 Genehmigung/2026-014 Bauantrag.pdf']);

    // inzwischen trägt PERMIO (Formulare) ein Aktenzeichen ein – das bleibt erhalten
    const oap = `${basis}/00 Projekt/2026-014 EFH Musterweg.oap`;
    const vonFormulare = readProjectFile(fs.eintraege.get(oap)!);
    vonFormulare.meta.aktenzeichen = '63/123/27';
    fs.setze(oap, writeArchive(vonFormulare));

    const ergebnis = await ausfuehren(fs, basis, plan, { imProjektordner: true });
    expect(ergebnis.filter((e) => e.status === 'angelegt').map((e) => e.schritt.pfad)).toEqual(fehlt);
    expect(ergebnis.filter((e) => e.status === 'ergaenzt').map((e) => e.schritt.pfad)).toEqual(['00 Projekt/2026-014 EFH Musterweg.oap']);
    const nachher = readProjectFile(fs.eintraege.get(oap)!);
    expect(nachher.meta).toMatchObject({ leistungsphasen: [1, 2, 3, 4, 5], aktenzeichen: '63/123/27', angelegt: '2026-10-01', kurzname: 'EFH Musterweg' });
    expect(nachher.projektordner?.presets).toEqual(['Jedes Projekt', 'Bauantrag']);
    expect(strFromU8(fs.eintraege.get(`${basis}/03 Berechnungen/Kosten/2026-014 Kostenschätzung.csv`)!)).toBe('von Hand');
    // kein zweiter Projektordner unter dem Namen nach Schema
    expect([...fs.eintraege.keys()].some((k) => k.startsWith('/p/2026-014 EFH Musterweg'))).toBe(false);
    // ein zweiter Lauf ändert nichts mehr
    const g2 = await projektEinlesen(await eingelesen(fs, basis));
    const { angelegt: _a2, struktur: _s2, dateischema: _d2, ...stamm2 } = g2.angaben!;
    const plan2 = plane(stamm2, MIT_PRESETS, BUERO, (await eingelesen(fs, basis)).eintraege, new Date(2027, 0, 16), { ordner: '2026-014 Musterweg (alt)', jahr: 2026, projektdatei: g2.projektdatei });
    expect(plan2.schritte.filter((x) => !x.vorhanden || x.aenderung?.teile.length)).toEqual([]);
  });

  it('Beteiligte früherer Projekte aus den Projektdateien der Stammordner, je Name einmal (P-14)', async () => {
    const fs = new SpeicherDateisystem();
    await ausfuehren(fs, 'P:/Projekte', plane(stamm({ nummer: '2026-001', beteiligte: [{ rolle: 'Tragwerk', name: 'Büro Statik', kontakt: '0251 1' }] }), KLEIN, []));
    await ausfuehren(fs, 'P:/Archiv', plane(stamm({ nummer: '2025-009', beteiligte: [{ rolle: 'Vermessung', name: 'ÖbVI Meier', kontakt: 'm@example.org' }, { rolle: 'Statik', name: 'büro statik', kontakt: 'alt' }] }), KLEIN, []));
    await fs.ordnerAnlegen('P:/Projekte', '2019-003 ohne Projektdatei');
    const liste = await beteiligteSammeln(fs, ['P:/Projekte', 'P:/Archiv']);
    expect(liste.map((b) => b.name.toLowerCase()).sort()).toEqual(['büro statik', 'öbvi meier']);
    expect(liste.find((b) => b.name === 'ÖbVI Meier')).toEqual({ rolle: 'Vermessung', name: 'ÖbVI Meier', kontakt: 'm@example.org' });
  });

  it('Projektordner ohne Projektdatei: Stammdaten erfassen, die Projektdatei wird angelegt', async () => {
    const fs = new SpeicherDateisystem();
    await fs.ordnerAnlegen('/p', 'Altprojekt/00 Projekt');
    await fs.dateiAnlegen('/p/Altprojekt', 'projekt.json', strToU8(JSON.stringify({ format: 'projektordner', version: 1, nummer: '2019-003', kurzname: 'Altbau', leistungsphasen: [8] })));
    const g = await projektEinlesen(await eingelesen(fs, '/p/Altprojekt'));
    expect(g.projektdatei).toBeNull();
    expect(g.quelle).toEqual({ alteProjektJson: true });
    expect(g.angaben).toMatchObject({ nummer: '2019-003', kurzname: 'Altbau', leistungsphasen: [8] });
    const plan = plane(g.angaben!, KLEIN, [], (await eingelesen(fs, '/p/Altprojekt')).eintraege, TAG, { ordner: 'Altprojekt' });
    expect(plan.projektdatei).toEqual({ pfad: '00 Projekt/2019-003 Altbau.oap', neu: true, teile: [] });
    await ausfuehren(fs, '/p/Altprojekt', plan, { imProjektordner: true });
    expect(readProjectFile(fs.eintraege.get('/p/Altprojekt/00 Projekt/2019-003 Altbau.oap')!).meta).toMatchObject({ projektcode: '2019-003', kurzname: 'Altbau', leistungsphasen: [8] });
    // die alte projekt.json bleibt liegen
    expect(fs.eintraege.has('/p/Altprojekt/projekt.json')).toBe(true);
  });

  it('Datum im Dateinamen: dieselbe Datei mit anderem Datum gilt beim Aktualisieren als vorhanden', async () => {
    const struktur: Struktur = { ...MIT_PRESETS, presets: [{ name: 'Kosten', standard: true, eintraege: [{ quelle: 'Excel/Kostenschätzung.csv', ziel: '03 Berechnungen/Kosten', name: '{nummer} Kostenschätzung {datum}' }] }] };
    const fs = new SpeicherDateisystem();
    await ausfuehren(fs, '/p', plane(stamm(), struktur, BUERO, [], TAG));
    const basis = '/p/2026-014 EFH Musterweg';
    expect(fs.eintraege.has(`${basis}/03 Berechnungen/Kosten/2026-014 Kostenschätzung 2026-10-01.csv`)).toBe(true);

    const spaeter = plane(stamm(), struktur, BUERO, await fs.liste(basis, 12), new Date(2026, 10, 10));
    const datei = spaeter.schritte.find((x) => x.herkunft === 'vorlage')!;
    expect(datei).toMatchObject({ pfad: '03 Berechnungen/Kosten/2026-014 Kostenschätzung 2026-11-10.csv', vorhanden: true, vorhandenAls: '03 Berechnungen/Kosten/2026-014 Kostenschätzung 2026-10-01.csv' });
    const ergebnis = await ausfuehren(fs, '/p', spaeter);
    expect(ergebnis.find((e) => e.schritt === datei)?.status).toBe('vorhanden');
    expect(fs.eintraege.has(`${basis}/03 Berechnungen/Kosten/2026-014 Kostenschätzung 2026-11-10.csv`)).toBe(false);
  });

  it('Datum mit Format im Dateinamen: dieselbe Datei mit anderem Datum gilt als vorhanden (P-06)', async () => {
    const struktur: Struktur = { ...MIT_PRESETS, presets: [{ name: 'Kosten', standard: true, eintraege: [{ quelle: 'Excel/Kostenschätzung.csv', ziel: '03 Berechnungen/Kosten', name: '{Kürzel} {datum:JJMMTT} Kosten' }] }] };
    const fs = new SpeicherDateisystem();
    await ausfuehren(fs, '/p', plane(stamm(), struktur, BUERO, [], TAG));
    const basis = '/p/2026-014 EFH Musterweg';
    expect(fs.eintraege.has(`${basis}/03 Berechnungen/Kosten/2026-014 261001 Kosten.csv`)).toBe(true);
    const spaeter = plane(stamm(), struktur, BUERO, await fs.liste(basis, 12), new Date(2026, 10, 10));
    expect(spaeter.schritte.find((x) => x.herkunft === 'vorlage')).toMatchObject({ vorhanden: true, vorhandenAls: '03 Berechnungen/Kosten/2026-014 261001 Kosten.csv' });
  });

  it('Projekt abschließen: nur meta.status in der Projektdatei, alles andere bleibt; Nummernvorschlag zählt den Archiv-Stammordner (P-15)', async () => {
    const fs = new SpeicherDateisystem();
    await ausfuehren(fs, 'P:/Projekte', plane(stamm(), KLEIN, []));
    const basis = 'P:/Projekte/2026-014 EFH Musterweg';
    const pfad = `${basis}/00 Projekt/2026-014 EFH Musterweg.oap`;
    const vorher = unzipSync(fs.eintraege.get(pfad)!);
    const metaVorher = readProjectFile(fs.eintraege.get(pfad)!).meta;
    await projektStatusSetzen(fs, basis, 'abgeschlossen');
    const nachher = unzipSync(fs.eintraege.get(pfad)!);
    expect(readProjectFile(fs.eintraege.get(pfad)!).meta).toEqual({ ...metaVorher, status: 'abgeschlossen' });
    for (const k of Object.keys(vorher).filter((k) => k !== 'projekt.json')) expect(nachher[k]).toEqual(vorher[k]);
    // „aktiv“ ist der Normalfall und steht nicht in der Datei
    await projektStatusSetzen(fs, basis, 'aktiv');
    expect(readProjectFile(fs.eintraege.get(pfad)!).meta.status).toBeUndefined();
    // im Archivordner: „aktiv“ ausdrücklich, sonst gälte der Stand des Ordners
    await projektStatusSetzen(fs, basis, 'aktiv', { ausdruecklich: true });
    expect(readProjectFile(fs.eintraege.get(pfad)!).meta.status).toBe('aktiv');
    // ohne Projektdatei: verständliche Meldung, nichts wird angelegt
    await fs.ordnerAnlegen('P:/Projekte', '2019-003 Altbau');
    await expect(projektStatusSetzen(fs, 'P:/Projekte/2019-003 Altbau', 'abgeschlossen')).rejects.toThrow(/noch keine Projektdatei/);
    // verschobene Projekte im Archiv-Stammordner zählen beim Nummernvorschlag mit
    expect(naechsteNummer('{jahr}-{nr:3}', ['2026-014 EFH Musterweg', ...['2026-020 Archiviert']], TAG)).toBe('2026-021');
  });

  it('dieselbe Vorlage aus zwei Presets ist kein Widerspruch; verschiedene Vorlagen mit demselben Ziel schon', () => {
    const doppelt: Struktur = {
      ...MIT_PRESETS,
      presets: [
        { name: 'A', standard: true, eintraege: [{ quelle: 'Excel/Kostenschätzung.csv', ziel: 'K' }] },
        { name: 'B', standard: true, eintraege: [{ quelle: 'Excel/Kostenschätzung.csv', ziel: 'K' }, { quelle: 'Bauantrag/Bauantrag.pdf', ziel: 'K', name: '{nummer} Kostenschätzung.csv' }] },
      ],
    };
    const plan = plane(stamm(), doppelt, BUERO, [], TAG);
    expect(vorlagenIm(plan)).toEqual(['K/2026-014 Kostenschätzung.csv ← Excel/Kostenschätzung.csv [A]', 'K/2026-014 Kostenschätzung.csv.pdf ← Bauantrag/Bauantrag.pdf [B]']);
    expect(plan.hinweise.filter((h) => h.includes('mehrfach'))).toEqual([]);
    const gleich: Struktur = { ...doppelt, presets: [{ name: 'A', standard: true, eintraege: [{ quelle: 'Bauantrag/Bauantrag.pdf', ziel: 'K', name: 'X' }, { quelle: 'Bauantrag/Anlagen', ziel: 'K', name: 'X.pdf' }] }] };
    expect(plane(stamm(), gleich, [...BUERO, vorlage('Bauantrag/Anlagen/Nachweis.pdf', 'x')], [], TAG).hinweise.join(' ')).toContain('„K/X.pdf“ ergibt sich mehrfach');
  });

  it('Konfiguration: Presets hin und zurück; ältere Konfigurationen ohne Presets behalten das bisherige Verhalten', () => {
    expect(strukturAusJson(strukturAlsJson(MIT_PRESETS))).toEqual(MIT_PRESETS);
    const alt = strukturAusJson('{"name":"Büro","ordner":["A"]}');
    expect(alt.presets).toEqual([GANZER_VORLAGENORDNER]);
    expect(alt.vorlagenname).toBe('{Name}');
    const roh = strukturAusJson(
      JSON.stringify({
        presets: [
          { name: ' P ', standard: true, eintraege: [{ quelle: 'a\\b.docx', ziel: '00 Projekt/ x?', name: ' ', lph: [4, 4, 12] }, { ziel: 'ohne Quelle' }, 'Text'] },
          { name: 'p', eintraege: [] },
          { eintraege: [] },
        ],
      }),
    );
    expect(roh.presets).toEqual([{ name: 'P', standard: true, eintraege: [{ quelle: 'a/b.docx', ziel: '00 Projekt/x', lph: [4] }] }]);
    expect(roh.vorlagenname).toBe(STANDARD.vorlagenname);
  });
});

describe('Prüfmodus', () => {
  async function angelegt() {
    const fs = new SpeicherDateisystem();
    await ausfuehren(fs, '/p', plane(stamm(), KLEIN, [], [], TAG));
    const basis = '/p/2026-014 EFH Musterweg';
    const g = await projektEinlesen(await eingelesen(fs, basis));
    return { fs, basis, projekt: g.angaben, quelle: g.quelle };
  }

  it('beschädigte alte projekt.json: Hinweis „Alte projekt.json nicht lesbar“, die Datei bleibt unangetastet', async () => {
    const fs = new SpeicherDateisystem();
    const basis = '/p/2019-003 Altbau';
    await fs.ordnerAnlegen('/p', '2019-003 Altbau');
    await fs.dateiAnlegen(basis, 'projekt.json', strToU8('{kaputt'));
    const g = await projektEinlesen(await eingelesen(fs, basis));
    expect(g.angaben).toBeNull();
    expect(g.quelle.alteProjektJsonDefekt).toContain('kein gültiges JSON');
    const r = pruefe('2019-003 Altbau', await fs.liste(basis, 12), KLEIN, g.angaben, g.quelle);
    const b = r.befunde.find((x) => x.titel === 'Alte projekt.json nicht lesbar')!;
    expect(b.art).toBe('hinweis');
    expect(new TextDecoder().decode(await fs.lies(basis, 'projekt.json'))).toBe('{kaputt');
    // ohne projekt.json: kein solcher Befund
    const { fs: fs2, basis: b2, projekt, quelle } = await angelegt();
    expect(pruefe('2026-014 EFH Musterweg', await fs2.liste(b2, 12), KLEIN, projekt, quelle).befunde.some((x) => x.titel.includes('projekt.json'))).toBe(false);
  });

  it('Alle Projekte prüfen: eine Zeile je Projekt, Befunde nach Schwere, CSV für Übersicht und Bericht (P-10)', async () => {
    const fs = new SpeicherDateisystem();
    await ausfuehren(fs, 'P:/Projekte', plane(stamm(), KLEIN, []));
    await fs.ordnerAnlegen('P:/Projekte', '2019-003 Altbau;alt/Fremd');
    await fs.dateiAnlegen('P:/Projekte/2019-003 Altbau;alt', 'lose.pdf', strToU8('x'));
    await fs.ordnerAnlegen('P:/Archiv', '2018-001 Archiv');
    const zeilen = await allePruefen(fs, ['P:/Projekte', 'P:/Archiv'], KLEIN);
    expect(zeilen.map((z) => z.projekt).sort()).toEqual(['2018-001 Archiv', '2019-003 Altbau;alt', '2026-014 EFH Musterweg']);
    const neu = zeilen.find((z) => z.projekt === '2026-014 EFH Musterweg')!;
    expect(neu).toMatchObject({ abweichungen: 0, projektdatei: true });
    expect(neu.laengsterPfad).toBe('2026-014 EFH Musterweg/00 Projekt/2026-014 EFH Musterweg.oap'.length);
    const alt = zeilen.find((z) => z.projekt.startsWith('2019'))!;
    expect(alt.projektdatei).toBe(false);
    expect(alt.abweichungen).toBeGreaterThanOrEqual(3);
    // nur lesend: nichts wurde angelegt
    expect([...fs.eintraege.keys()].some((k) => k.includes('2019-003 Altbau;alt/00 Projekt'))).toBe(false);
    // CSV mit BOM, Semikolon, Feld mit Semikolon in Anführungszeichen
    const c = sammelCsv(zeilen);
    expect(c.startsWith('\uFEFFProjekt;Abweichungen;davon Fehler;Projektdatei;Längster Pfad (Zeichen);Pfad;Lesefehler\r\n')).toBe(true);
    expect(c).toContain('"2019-003 Altbau;alt";');
    // Einzelbericht: Befunde nach Schwere, je Pfad eine Zeile
    const fs2 = await eingelesen(fs, 'P:/Projekte/2019-003 Altbau;alt');
    const ergebnis = pruefe(fs2.name, fs2.eintraege, KLEIN, null);
    const rang = { fehler: 0, warnung: 1, hinweis: 2, ok: 3 };
    expect(ergebnis.befunde.map((b) => rang[b.art])).toEqual([...ergebnis.befunde.map((b) => rang[b.art])].sort());
    const bericht = berichtCsv(ergebnis).split('\r\n');
    expect(bericht[0]).toBe('\uFEFFArt;Befund;Erläuterung;Pfad');
    expect(bericht.some((z) => z.startsWith('Hinweis;') && z.endsWith(';lose.pdf'))).toBe(true);
  });

  it('frisch angelegter Ordner: keine Abweichungen', async () => {
    const { fs, basis, projekt, quelle } = await angelegt();
    const r = pruefe('2026-014 EFH Musterweg', await fs.liste(basis, 12), KLEIN, projekt, quelle);
    expect(r.befunde.map((b) => b.art)).toEqual(['ok', 'ok']);
    expect(r.befunde[0].titel).toBe('Projektdatei vorhanden');
    expect(r.fehlendeOrdner).toEqual([]);
    expect([r.ordner, r.dateien]).toEqual([3, 1]);
  });

  it('meldet fehlende und fremde Ordner, lose Dateien, Dateinamen, Ordnernamen – und ändert nichts', async () => {
    const { fs, basis, projekt, quelle } = await angelegt();
    fs.eintraege.delete(`${basis}/02 Pläne/Entwurf`);
    await fs.ordnerAnlegen(basis, 'Diverses');
    await fs.ordnerAnlegen(basis, '02 Pläne/Alt');
    await fs.ordnerAnlegen(basis, '02 Pläne/Entwurf'); // wieder da, mit Dateien
    await fs.dateiAnlegen(basis, '02 Pläne/Entwurf/2026-014_A-101_a_Grundriss EG.pdf', strToU8('x'));
    await fs.dateiAnlegen(basis, '02 Pläne/Entwurf/Grundriss final neu.pdf', strToU8('x'));
    await fs.dateiAnlegen(basis, '02 Pläne/Entwurf/Thumbs.db', strToU8('x'));
    await fs.dateiAnlegen(basis, 'Angebot.pdf', strToU8('x'));
    await fs.dateiAnlegen(basis, 'projekt.json', strToU8('{}'));
    fs.eintraege.delete(`${basis}/00 Projekt/2026-014 EFH Musterweg.oap`);
    fs.eintraege.delete(`${basis}/00 Projekt`);
    const vorher = new Map(fs.eintraege);
    const r = pruefe('2026-14 Musterweg', await fs.liste(basis, 12), KLEIN, projekt, quelle);
    expect(fs.eintraege).toEqual(vorher);
    expect(r.fehlendeOrdner).toEqual(['00 Projekt']);
    const t = r.befunde.map((b) => `${b.art}: ${b.titel}${b.pfade ? ` → ${b.pfade.join(', ')}` : ''}`);
    expect(t).toEqual([
      'warnung: Der Ordnername weicht vom Schema ab',
      'warnung: 1 Ordner der Struktur fehlt → 00 Projekt',
      'warnung: 1 von 2 Dateien folgt nicht dem Dateinamenschema → 02 Pläne/Entwurf/Grundriss final neu.pdf',
      'hinweis: 2 Ordner stehen nicht in der Struktur → 02 Pläne/Alt, Diverses',
      'hinweis: 1 Datei liegt lose im Projektordner → Angebot.pdf',
      'ok: Projektdatei vorhanden',
    ]);
  });

  it('ohne Projektdatei: Warnung, Prüfung gegen die vollständige Struktur; alte projekt.json und kaputte Datei', async () => {
    const { fs, basis } = await angelegt();
    const eintraege = (await fs.liste(basis, 12)).filter((e) => !e.pfad.endsWith('.oap'));
    const r = pruefe('2026-014 EFH Musterweg', eintraege, KLEIN, null);
    expect(r.befunde[0]).toMatchObject({ art: 'warnung', titel: 'Projektdatei (.oap) fehlt' });
    expect(r.fehlendeOrdner).toEqual(['02 Pläne/Ausführung', '08 Bauleitung']);
    const alt = leseProjektJson(JSON.stringify({ format: 'projektordner', nummer: '2026-014', kurzname: 'EFH Musterweg', leistungsphasen: [1, 2, 3, 4] }));
    expect(pruefe('2026-014 EFH Musterweg', eintraege, KLEIN, alt, { alteProjektJson: true }).befunde[0]).toMatchObject({ art: 'warnung', titel: 'Projektdatei (.oap) fehlt – Stammdaten aus der alten projekt.json' });
    expect(pruefe('x', eintraege, KLEIN, null, { pfad: 'a.oap', fehler: 'Das Archiv ist beschädigt' }).befunde[0]).toMatchObject({ art: 'fehler', titel: 'Die Projektdatei (.oap) ist nicht lesbar' });
  });

  it('überlange Pfade', () => {
    const lang = `02 Pläne/Entwurf/${'x'.repeat(190)}.pdf`;
    const r = pruefe('2026-014 EFH Musterweg', [{ pfad: lang, ordner: false, groesse: 1 }], { ...KLEIN, ordner: [] }, null);
    expect(r.befunde.find((b) => b.titel.includes('sehr lang'))?.pfade).toEqual([lang]);
  });

  it('Browser: Dateiliste eines gewählten Ordners wird zu Einträgen mit Zwischenordnern', async () => {
    const o = ordnerAusDateien([
      { pfad: 'Projekt X/projekt.json', groesse: 5, lies: async () => strToU8('{}') },
      { pfad: 'Projekt X/02 Pläne/Entwurf/a.pdf', groesse: 9, lies: async () => strToU8('pdf') },
    ]);
    expect(o.name).toBe('Projekt X');
    expect(o.eintraege).toEqual([
      { pfad: '02 Pläne', ordner: true, groesse: 0 },
      { pfad: '02 Pläne/Entwurf', ordner: true, groesse: 0 },
      { pfad: '02 Pläne/Entwurf/a.pdf', ordner: false, groesse: 9 },
      { pfad: 'projekt.json', ordner: false, groesse: 5 },
    ]);
    expect(strFromU8(await o.lies('projekt.json'))).toBe('{}');
  });
});

describe('Plan: Warnungen vor dem Anlegen (Gesamt-Review)', () => {
  it('zu lange Pfade (Windows-Grenze) schon im Plan – mit Stammordner bzw. Projektordner; Gegenprobe kurz', async () => {
    const { WINDOWS_PFAD_GRENZE } = await import('./plan');
    const lang = `P:/${'Sehr langer Stammordner/'.repeat(9)}Projekte`;
    const p = planen(stamm(), KLEIN, [], [], TAG, { ort: lang });
    const w = p.warnungen.find((x) => x.includes('zu lang für Windows'));
    expect(w).toMatch(/^\d+ Pfade wären zu lang für Windows \(Ordner ab 248, Dateien ab 260 Zeichen\) – Windows legt solche Ordner nicht an, Explorer und Office öffnen solche Dateien nicht\./);
    const laengster = w!.split('): ').pop()!;
    expect(laengster.startsWith(`${lang}/2026-014 EFH Musterweg/`)).toBe(true);
    expect(laengster.length).toBeGreaterThanOrEqual(WINDOWS_PFAD_GRENZE);
    // Ergänzen: der Projektordner selbst ist der Ort; Vorhandenes zählt nicht
    const vorhanden = p.schritte.map((x) => ({ pfad: x.pfad, ordner: x.art === 'ordner', groesse: 0 }));
    expect(planen(stamm(), KLEIN, [], vorhanden, TAG, { ordner: '2026-014 EFH Musterweg', ort: `${lang}/2026-014 EFH Musterweg` }).warnungen.join(' ')).not.toContain('zu lang für Windows');
    // Gegenprobe: kurzer Stammordner bzw. ohne Ort (Browser)
    expect(planen(stamm(), KLEIN, [], [], TAG, { ort: 'P:/Projekte' }).warnungen.join(' ')).not.toContain('zu lang für Windows');
    expect(planen(stamm(), KLEIN, [], [], TAG).warnungen.join(' ')).not.toContain('zu lang für Windows');
  });

  it('Pfadgrenzen: Ordner ab 248 Zeichen (CreateDirectory), Dateien ab 260; Gegenprobe knapp darunter', async () => {
    const { pfadZuLang, WINDOWS_ORDNER_GRENZE } = await import('./plan');
    expect(WINDOWS_ORDNER_GRENZE).toBe(248);
    expect(pfadZuLang('x'.repeat(247), true)).toBe(false);
    expect(pfadZuLang('x'.repeat(248), true)).toBe(true);
    expect(pfadZuLang('x'.repeat(259))).toBe(false);
    expect(pfadZuLang('x'.repeat(260))).toBe(true);
    // im Plan: ein tiefer Ordner mit 250 Zeichen ist zu lang, obwohl keine Datei 260 erreicht
    const s: Struktur = { ...STANDARD, ordner: [{ pfad: 'Tief/Ein sehr langer Unterordnername' }] };
    const optionen = (ort: string): PlanOptionen => ({ ort, oapPfad: 'P.oap' });
    const roh = planen(stamm(), s, [], [], TAG, optionen('P:'));
    const laenge = (ort: string, art: 'ordner' | 'datei') => Math.max(...roh.schritte.filter((x) => x.art === art).map((x) => verbinde(`${ort}/${ordnerName(stamm(), s, TAG)}`, x.pfad).length));
    const ortFuer = (ziel: number) => `P:/${'x'.repeat(ziel - laenge('P:/', 'ordner'))}`;
    const zuLang = ortFuer(250);
    expect(laenge(zuLang, 'ordner')).toBe(250);
    expect(laenge(zuLang, 'datei')).toBeLessThan(260);
    expect(planen(stamm(), s, [], [], TAG, optionen(zuLang)).warnungen.join(' ')).toContain('1 Pfad wäre zu lang für Windows');
    // Gegenprobe: 247 Zeichen
    expect(planen(stamm(), s, [], [], TAG, optionen(ortFuer(247))).warnungen.join(' ')).not.toContain('zu lang für Windows');
  });

  it('vorhandene, aber nicht gelesene Projektdatei: Warnung, dass die Stammdaten nicht ankommen; Gegenprobe gelesen', () => {
    const oap = { pfad: '03 Berechnungen/Flächen/2026-014 EFH Musterweg.oap', ordner: false, groesse: 5 };
    const ohne = planen(stamm(), KLEIN, [], [oap], TAG, { ordner: '2026-014 EFH Musterweg', projektdatei: null });
    expect(ohne.warnungen).toContain('Die vorhandene Projektdatei „03 Berechnungen/Flächen/2026-014 EFH Musterweg.oap“ bleibt unverändert – Stammdaten und Presets werden darin nicht gespeichert.');
    const gelesen = planen(stamm(), KLEIN, [], [oap], TAG, { ordner: '2026-014 EFH Musterweg', projektdatei: { pfad: oap.pfad, meta: alsProject(stamm(), { struktur: KLEIN, presets: [] }).meta } });
    expect(gelesen.warnungen.join(' ')).not.toContain('bleibt unverändert');
  });

  it('Ergänzen ohne bekanntes Anlagejahr: Hinweis, dass {JAHR} das laufende Jahr ist; Gegenprobe mit Jahr bzw. ohne {JAHR}', () => {
    const mitJahr: Struktur = { ...KLEIN, ordner: [...KLEIN.ordner, { pfad: 'Archiv {JAHR}' }] };
    const hinweis = (s: Struktur, jahr?: number) => planen(stamm(), s, [], [], TAG, { ordner: '2026-014 EFH Musterweg', ...(jahr ? { jahr } : {}) }).hinweise.find((h) => h.includes('Jahr der Anlage'));
    expect(hinweis(mitJahr)).toBe('Das Jahr der Anlage ist nicht bekannt (die Projektdatei nennt keins) – für {JAHR} in neuen Namen gilt das laufende Jahr 2026.');
    expect(hinweis(mitJahr, 2019)).toBeUndefined();
    expect(hinweis(KLEIN)).toBeUndefined();
    // neues Projekt: das laufende Jahr ist richtig – kein Hinweis
    expect(planen(stamm(), mitJahr, [], [], TAG).hinweise.join(' ')).not.toContain('Jahr der Anlage');
  });

  it('Zielordner frisch geprüft: vorhanden (auch anders geschrieben, mit fremder Projektdatei) bzw. frei', async () => {
    const { zielordnerVorhanden } = await import('./plan');
    const fs = new SpeicherDateisystem();
    await fs.ordnerAnlegen('P:/Projekte', '2026-014 efh musterweg');
    fs.setze('P:/Projekte/2026-014 efh musterweg/Kollege.oap', strToU8('x'));
    expect(await zielordnerVorhanden(fs, 'P:/Projekte', '2026-014 EFH Musterweg')).toBe('2026-014 efh musterweg');
    expect(await zielordnerVorhanden(fs, 'P:/Projekte', '2026-015 Anderes')).toBeNull();
    // nur die oberste Ebene zählt
    expect(await zielordnerVorhanden(fs, 'P:/Projekte', 'Kollege.oap')).toBeNull();
  });
});
