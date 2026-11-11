import ExcelJS from 'exceljs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readProjectFile, writeArchive } from '@core/archive';
import { ordnerAusDateien, SpeicherDateisystem, verbinde } from './dateisystem';
import { dateimuster, naechsteNummer, nameAus, nummerAus } from './nummer';
import type { PlanOptionen, Vorlage } from './plan';
import { ausfuehren, ladeVorlagen, ohne, ordnerName, planen } from './plan';
import { pruefe } from './pruefung';
import type { Stammdaten } from './stammdaten';
import { projektEinlesen } from './projekt';
import { alsProject, angabenAusProjekt, leereStammdaten, leseProjektJson, mitAlterProjektJson, platzhalter, stammAusMeta } from './stammdaten';
import type { Struktur } from './struktur';
import { aktivePresets, alterOapPfad, GANZER_VORLAGENORDNER, ordnerAlsText, ordnerAusText, ordnerAusTextMitMeldungen, sichererName, STANDARD, strukturAlsJson, strukturAusJson } from './struktur';
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

  it('Ordnername: Platzhalter ersetzt, unzulässige Zeichen entfernt', () => {
    expect(ordnerName(stamm(), STANDARD, TAG)).toBe('2026-014 EFH Musterweg');
    expect(ordnerName(stamm({ kurzname: 'Haus: A/B? ' }), STANDARD, TAG)).toBe('2026-014 Haus A B');
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
  });
});

describe('Stammdaten', () => {
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
    expect(plan.fehler).toEqual(['Die Projektnummer fehlt.', 'Der Kurzname fehlt.', 'Aus dem Schema für den Ordnernamen ergibt sich kein Name.']);
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
    // die Projektdatei öffnen Flächenrechner, GRZ-Nachweis, Kostenermittlung und Formulare
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

    // inzwischen trägt die Formulare-App ein Aktenzeichen ein – das bleibt erhalten
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
    expect(alt.vorlagenname).toBe('{name}');
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
