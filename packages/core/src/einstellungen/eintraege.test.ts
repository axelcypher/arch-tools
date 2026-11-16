import { describe, expect, it } from 'vitest';
import { GLOBALE_VARIABLEN, unbekanntePlatzhalter } from '../platzhalter';
import { VORGABE_OAP_PFAD } from '../projektdatei';
import { PFAD_EINSTELLUNGEN } from './eintraege';
import { pfadWerteAus } from './pfade';
import { hatFehler, istAbsolut, mitSchluessel, pfadPruefen, PFAD_THEMEN, type PfadEinstellung } from './verzeichnis';

const nachId = (id: string) => PFAD_EINSTELLUNGEN.find((e) => e.id === id)!;

describe('Verzeichnis der Pfad- und Namenseinstellungen', () => {
  it('Kennungen eindeutig, jedes Thema bekannt, Vorgaben gültig und ohne unbekannte Platzhalter', () => {
    const ids = PFAD_EINSTELLUNGEN.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of PFAD_EINSTELLUNGEN) {
      expect(
        PFAD_THEMEN.some((t) => t.id === e.thema),
        e.id,
      ).toBe(true);
      expect(e.apps.length, e.id).toBeGreaterThan(0);
      if (e.art === 'schalter') continue;
      const text = Array.isArray(e.vorgabe) ? e.vorgabe.join('\n') : String(e.vorgabe);
      expect(hatFehler(pfadPruefen(e, text)), `${e.id}: ${JSON.stringify(pfadPruefen(e, text))}`).toBe(false);
      if (e.variablen) expect(unbekanntePlatzhalter(text, e.variablen), e.id).toEqual([]);
    }
  });

  it('neue Einträge für den direkten Export: Berechnungsordner je App nach der Struktur von ATLAS, Dateinamen je App, PDF mitspeichern (ja)', () => {
    expect(nachId('export.berechnungsordner.flaechenrechner').vorgabe).toBe('03 Berechnungen/Flächen');
    expect(nachId('export.berechnungsordner.grz').vorgabe).toBe('03 Berechnungen/Nachweise');
    expect(nachId('export.berechnungsordner.kosten').vorgabe).toBe('03 Berechnungen/Kosten');
    // die Projektdatei liegt per Vorgabe im Berechnungsordner von QUADRIO
    expect(VORGABE_OAP_PFAD.startsWith(`${nachId('export.berechnungsordner.flaechenrechner').vorgabe}/`)).toBe(true);
    for (const app of ['flaechenrechner', 'grz', 'kosten']) {
      expect(nachId(`export.excel.${app}`).endung).toBe('.xlsx');
      expect(nachId(`export.pdf.${app}`).endung).toBe('.pdf');
      expect(nachId(`export.excel.${app}`).variablen!.map((v) => v.name)).toContain('Inhalt');
    }
    expect(nachId('export.pdfMitspeichern').vorgabe).toBe(true);
  });

  it('Übernahme ohne Verlust: bisherige Schlüssel werden gelesen, wie die Apps sie geschrieben haben', () => {
    const werte = pfadWerteAus({
      allgemein: { oapPfad: 'Organisation/{Kürzel}.oap', fotoordner: '10 Fotos', ordnerSchema: 'x', projekte: ['Z:\\Projekte'] },
      projektordner: {
        struktur: { nummernschema: '{jj}-{nr:3}', ordnername: '{nummer} {kurzname}', dateischema: '{Kürzel}_{Plannummer}', vorlagenname: '{Name}', ordner: [] },
        vorlagenordner: 'V:\\Vorlagen',
      },
      kataster: { zielpfad: 'Kataster/{Antrag}', dateiname: '{Code} {Name}' },
      ava: { ablage: { gewerke: 'LV', lv: '', archive: ['Alt'], kostenkontrolle: 'KK' }, rechnungen: { muster: ['{Kürzel} {Nr}'] }, lv: { dateiname: '{Kürzel} LV {Gewerk}' } },
    });
    expect(werte).toMatchObject({
      'projekt.oapPfad': 'Organisation/{Kürzel}.oap',
      'ablage.fotoordner': '10 Fotos',
      'projekt.nummernschema': '{jj}-{nr:3}',
      'projekt.ordnername': '{nummer} {kurzname}',
      'plaene.dateischema': '{Kürzel}_{Plannummer}',
      'vorlagen.vorlagenname': '{Name}',
      'ablage.kataster.zielpfad': 'Kataster/{Antrag}',
      'plaene.kataster.dateiname': '{Code} {Name}',
      'ablage.fabrio.gewerke': 'LV',
      // leer heißt bei den bisherigen Schlüsseln: leer (FABRIO: LV direkt im Gewerkeordner)
      'ablage.fabrio.lv': '',
      'ablage.fabrio.archive': ['Alt'],
      'ablage.fabrio.kostenkontrolle': 'KK',
      'plaene.fabrio.rechnungen': ['{Kürzel} {Nr}'],
      'vorlagen.fabrio.lv': '{Kürzel} LV {Gewerk}',
    });
    // nicht Gesetztes fehlt (es gilt die Vorgabe)
    expect(werte['export.excel.flaechenrechner']).toBeUndefined();
    expect(pfadWerteAus({})).toEqual({});
  });

  it('Schreiben: nur der eine Wert ändert sich, alle übrigen Angaben (auch unbekannte) bleiben', () => {
    const e = nachId('projekt.nummernschema');
    const roh = { struktur: { name: 'Büro', ordner: [{ pfad: 'A' }], zukunft: 1, nummernschema: '{JAHR}-{Nr:3}' }, vorlagenordner: 'V:\\Vorlagen' };
    const neu = e.speicher.schreiben(roh, '{JAHR_KURZ}-{Nr:2}');
    expect(neu).toEqual({ struktur: { name: 'Büro', ordner: [{ pfad: 'A' }], zukunft: 1, nummernschema: '{JAHR_KURZ}-{Nr:2}' }, vorlagenordner: 'V:\\Vorlagen' });
    expect(roh.struktur.nummernschema).toBe('{JAHR}-{Nr:3}');
    // „Vorgabe wiederherstellen“ schreibt die Vorgabe ausdrücklich (Apps übernähmen einen fehlenden Wert sonst aus ihrem Speicher)
    expect(nachId('projekt.oapPfad').speicher.schreiben({ oapPfad: 'x.oap', fotoordner: 'F' }, undefined)).toEqual({ oapPfad: VORGABE_OAP_PFAD, fotoordner: 'F' });
    // neue Einstellungen: unter pfade, „Vorgabe“ entfernt den Eintrag
    const x = nachId('export.excel.grz').speicher;
    const mit = x.schreiben({ buero: 'B', pfade: { andere: 'y' } }, '{PROJEKT_KUERZEL} GRZ');
    expect(mit).toEqual({ buero: 'B', pfade: { andere: 'y', 'export.excel.grz': '{PROJEKT_KUERZEL} GRZ' } });
    expect(x.schreiben(mit, undefined)).toEqual({ buero: 'B', pfade: { andere: 'y' } });
  });

  it('in die Struktur von ATLAS wird nur geschrieben, wenn ATLAS sie angelegt hat – eine fehlende oder unlesbare bleibt unberührt', () => {
    const e = nachId('plaene.dateischema');
    expect(() => e.speicher.schreiben({}, '{Plannummer}')).toThrow(/ATLAS/);
    expect(() => e.speicher.schreiben({ struktur: 'kaputt' }, '{Plannummer}')).toThrow(/ATLAS/);
    expect(() => mitSchluessel({ ablage: 'kaputt' }, 'ablage.gewerke', 'G')).toThrow(/nicht lesbar/);
    expect(mitSchluessel({}, 'ablage.gewerke', 'G')).toEqual({ ablage: { gewerke: 'G' } });
  });

  it('der Name des Projektordners wird für alle Apps gespiegelt (allgemein.ordnerSchema)', () => {
    expect(nachId('projekt.ordnername').auch).toEqual({ bereich: 'allgemein', schluessel: 'ordnerSchema' });
  });
});

describe('Prüfung', () => {
  const pfad: PfadEinstellung = { ...nachId('export.berechnungsordner.kosten') };
  const name: PfadEinstellung = { ...nachId('export.excel.kosten') };
  const texte = (e: PfadEinstellung, v: string) => pfadPruefen(e, v).map((m) => `${m.art}: ${m.text}`);

  it('Pfade: relativ, ohne ungültige Zeichen, ohne „..“, ohne reservierte Namen; Pflichtfeld', () => {
    expect(texte(pfad, '03 Berechnungen/Kosten')).toEqual([]);
    expect(texte(pfad, '')[0]).toMatch(/^fehler: Angabe fehlt/);
    expect(texte(pfad, 'C:\\Projekte\\Kosten')[0]).toMatch(/^fehler: Relativ zum Projektordner/);
    expect(texte(pfad, '\\\\server\\freigabe\\Kosten')[0]).toMatch(/^fehler: Relativ/);
    expect(texte(pfad, 'Kosten<neu>')[0]).toBe('fehler: Nicht erlaubt in Ordner- und Dateinamen: < >');
    expect(texte(pfad, '../Kosten')[0]).toMatch(/„\.\.“/);
    expect(texte(pfad, 'Kosten/CON')[0]).toMatch(/reservierter Name: CON/);
    expect(texte(pfad, 'Kosten./x')).toEqual(['hinweis: Punkte und Leerzeichen am Ende eines Namens entfallen unter Windows.']);
    // Platzhalter mit Doppelpunkt (Datumsformat) sind kein ungültiges Zeichen
    expect(texte(pfad, '03 Berechnungen/{DATUM:JJJJ-MM-TT}')).toEqual([]);
    expect(texte(pfad, '03 Berechnungen/{Unbekannt}')).toEqual(['hinweis: Unbekannter Platzhalter, bleibt so stehen: {Unbekannt}']);
  });

  it('Namen: kein „/“ und keine anderen ungültigen Zeichen', () => {
    expect(texte(name, '{PROJEKT_KUERZEL} {Inhalt}')).toEqual([]);
    expect(texte(name, 'A/B')[0]).toBe('fehler: Nicht erlaubt im Dateinamen: /');
    expect(texte(name, 'Was?')[0]).toBe('fehler: Nicht erlaubt im Dateinamen: ?');
  });

  it('Ordner: vollständig mit Laufwerk oder als Netzwerkpfad; leer erlaubt, wo keine Pflicht', () => {
    const o = nachId('vorlagen.permio.vorlagenordner');
    expect(texte(o, '')).toEqual([]);
    expect(texte(o, 'Z:\\Vorlagen')).toEqual([]);
    expect(texte(o, '\\\\server\\Vorlagen')).toEqual([]);
    expect(texte(o, 'Vorlagen')[0]).toMatch(/^fehler: Vollständigen Ordner/);
    expect(istAbsolut('z:/a')).toBe(true);
    expect(istAbsolut('a/b')).toBe(false);
  });

  it('Listen: je Zeile geprüft, Pflicht = mindestens eine Zeile; Hinweise der App (PERMIO: Anfang des Namens)', () => {
    const r = nachId('plaene.fabrio.rechnungen');
    expect(texte(r, '')[0]).toMatch(/Mindestens eine Zeile/);
    expect(texte(r, '{PROJEKT_KUERZEL} R{Nr:3}\nA/B')[0]).toBe('fehler: Nicht erlaubt im Dateinamen: /');
    const p = nachId('ablage.permio.berechnungsordner');
    expect(texte(p, 'Planung/Berechnungen\nStatik')).toEqual([]);
    const v = nachId('plaene.permio.namensvorlage');
    expect(texte(v, '{Projekt} {Art} {Datum} {Name}')).toEqual([]);
    expect(texte(v, '{Name} {DATUM}')[0]).toMatch(/^hinweis: Dateien im Antragsordner/);
  });

  it('die Platzhalter des Projektdatei-Pfads sind die globalen', () => {
    expect(nachId('projekt.oapPfad').variablen).toBe(GLOBALE_VARIABLEN);
  });
});
