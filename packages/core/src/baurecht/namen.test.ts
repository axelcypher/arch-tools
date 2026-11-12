import { describe, expect, it } from 'vitest';
import type { TextKontext } from './kurz';
import { kurzBaum, kurzText } from './kurz';
import { einheitName, einheitVoll, normTitel, normVoll, verweisName, wertAnzeige } from './typen';

describe('Namen ohne Doppelung', () => {
  it('benannte Einheiten: Schlüssel nicht neben dem Titel, Paragrafen mit Nummer', () => {
    expect(einheitName('5', 'Zugänge')).toEqual({ nr: '§ 5', titel: 'Zugänge' });
    expect(einheitName('SO-060', 'SO-060 Standortübungsplatz bei Büecke')).toEqual({ nr: '', titel: 'SO-060 Standortübungsplatz bei Büecke' });
    expect(einheitName('Massnahmenplan', 'Maßnahmenplan')).toEqual({ nr: '', titel: 'Maßnahmenplan' });
    expect(einheitName('Anlage 1', 'Gebietsabgrenzung')).toEqual({ nr: '', titel: 'Anlage 1 – Gebietsabgrenzung' });
    expect(einheitName('C.1', 'Naturschutzgebiete (Festsetzungen C.1)')).toEqual({ nr: '', titel: 'C.1 – Naturschutzgebiete' });
    expect(einheitVoll('SO-060', 'SO-060 Standortübungsplatz')).toBe('SO-060 Standortübungsplatz');
    expect(einheitVoll('42a', 'Gebäude mit mehr als drei Wohnungen')).toBe('§ 42a Gebäude mit mehr als drei Wohnungen');
  });

  it('Normen: Kurzform genau einmal', () => {
    expect(normTitel({ kurz: 'LWG', titel: 'Landeswassergesetz (LWG)' })).toBe('Landeswassergesetz');
    expect(normTitel({ kurz: 'BauO NRW', titel: 'Landesbauordnung 2018 (BauO NRW 2018)' })).toBe('Landesbauordnung 2018');
    expect(normVoll({ kurz: 'DSchG NRW', titel: 'Denkmalschutzgesetz (DSchG NRW)' })).toBe('Denkmalschutzgesetz (DSchG NRW)');
    expect(normVoll({ kurz: 'BauGB', titel: 'Baugesetzbuch' })).toBe('Baugesetzbuch (BauGB)');
    expect(normVoll({ kurz: 'GEG', titel: 'Gebäudeenergiegesetz (amtlich seit 2026: GModG)' })).toBe('Gebäudeenergiegesetz (GEG; amtlich seit 2026: GModG)');
    expect(einheitName('Sperre', 'Veränderungssperre (§ 14 BauGB)')).toEqual({ nr: '', titel: 'Veränderungssperre (§ 14 BauGB)' });
    // eine Klammer, die nichts mit der Kurzform zu tun hat, bleibt
    expect(normTitel({ kurz: 'LSG-VO', titel: 'Landschaftsschutzverordnung (Kreis Soest)' })).toBe('Landschaftsschutzverordnung (Kreis Soest)');
  });
});

describe('Regel als Baum', () => {
  const t: TextKontext = {
    fakt: (id) => ({ titel: { a: 'Angabe A', b: 'Angabe B', c: 'Angabe C' }[id] ?? id, typ: 'janein', gruppe: 'vorhaben' }) as never,
    bausteine: { bs: { oder: [{ f: 'b', ist: true }, { f: 'c', ist: true }] } },
  };
  it('und/oder werden zu eingerückten Gruppen, Bausteine aufgelöst, einzelne Glieder ohne Gruppe', () => {
    const b = kurzBaum({ und: [{ f: 'a', ist: true }, { $: 'bs' }] }, t);
    expect(b.text).toBe('alle folgenden:');
    expect(b.kinder?.[0].text).toBe('Angabe A: ja');
    expect(b.kinder?.[1]).toMatchObject({ text: 'mindestens eines davon:', kinder: [{ text: 'Angabe B: ja' }, { text: 'Angabe C: ja' }] });
    expect(kurzBaum({ und: [{ f: 'a', ist: false }] }, t)).toEqual({ text: 'Angabe A: nein' });
    // positiv formuliert: „nicht (A: ja)“ → „A: nein“
    expect(kurzBaum({ nicht: { f: 'a', ist: true } }, t)).toEqual({ text: 'Angabe A: nein' });
    // verneinte Gruppen: „keines davon“ bzw. „nicht alle davon“
    expect(kurzBaum({ nicht: { $: 'bs' } }, t).text).toBe('keines davon:');
    expect(kurzBaum({ nicht: { und: [{ f: 'a', ist: true }, { f: 'b', ist: true }] } }, t).text).toBe('nicht alle davon:');
  });

  it('mit Kontext: Stand je Knoten und aktueller Wert je Blatt', () => {
    const ctx = { merkmale: {}, fakten: { a: { wert: true, herkunft: 'manuell' as const, sicherheit: 'sicher' as const }, b: { wert: false, herkunft: 'manuell' as const, sicherheit: 'sicher' as const } }, einreichung: '2026-11-12', heute: '2026-11-12', bausteine: t.bausteine };
    const b = kurzBaum({ und: [{ f: 'a', ist: true }, { $: 'bs' }] }, t, ctx);
    expect(b.w).toBe('offen');
    expect(b.kinder?.[0]).toMatchObject({ text: 'Angabe A: ja', w: 'ja', ist: 'ja' });
    expect(b.kinder?.[1].w).toBe('offen');
    expect(b.kinder?.[1].kinder?.[0]).toMatchObject({ w: 'nein', ist: 'nein' });
    expect(b.kinder?.[1].kinder?.[1]).toMatchObject({ w: 'offen', ist: 'nicht angegeben' });
  });
});

describe('Regel in Worten: Verneinung positiv, Schwellen lesbar', () => {
  const t: TextKontext = {
    fakt: (id) => (({ h: { titel: 'Höhe', kurz: 'Höhe', gruppe: 'gebaeude', typ: 'zahl', einheit: 'm' }, g: { titel: 'Garagen', gruppe: 'gebaeude', typ: 'zahl', einheit: 'm²' }, art: { titel: 'Gebäudeart', gruppe: 'gebaeude', typ: 'wahl' } }) as Record<string, unknown>)[id] as never,
    bausteine: {},
    paragraf: (id) => (id === 'x/14' ? '§ 14 BauGB' : id),
  };
  it('verneinte Blätter ohne „trifft nicht zu“', () => {
    expect(kurzBaum({ nicht: { f: 'art', in: ['EFH', 'ZFH'] } }, t).text).toBe('Gebäudeart: alles außer „EFH“ und „ZFH“');
    // ein Wert: kein „weder“, kein „ist nicht“ (Numerus bei Namen im Plural)
    expect(kurzBaum({ nicht: { f: 'art', in: ['EFH'] } }, t).text).toBe('Gebäudeart: alles außer „EFH“');
    expect(kurzBaum({ nicht: { f: 'art', ist: 'EFH' } }, t).text).toBe('Gebäudeart: alles außer „EFH“');
    expect(kurzBaum({ nicht: { n: 'x/14', ampel: ['rot'] } }, t).text).toBe('§ 14 BauGB nicht „gilt“');
    expect(kurzBaum({ nicht: { f: 'h', min: 7 } }, t).text).toBe('Höhe unter 7 m');
    expect(kurzBaum({ nicht: { f: 'art', in: ['EFH'] } }, t).text).not.toMatch(/trifft nicht zu/);
  });
  it('Schwellen: „über 22 m“, „vorhanden“, „keine“', () => {
    expect(kurzBaum({ f: 'h', min: 22.01 }, t).text).toBe('Höhe über 22 m');
    expect(kurzBaum({ f: 'g', min: 0.01 }, t).text).toBe('Garagen: vorhanden');
    expect(kurzBaum({ f: 'g', max: 0 }, t).text).toBe('Garagen: keine');
    expect(kurzBaum({ f: 'h', min: 7 }, t).text).toBe('Höhe mindestens 7 m');
  });
});

describe('Regel in Worten: Bausteine, Anzahlen, Gemeinden, Verweise', () => {
  const t: TextKontext = {
    fakt: (id) =>
      (
        ({
          w: { titel: 'Wohnungen', gruppe: 'gebaeude', typ: 'zahl' },
          st: { titel: 'Kfz-Stellplätze im oder am Gebäude', gruppe: 'gebaeude', typ: 'zahl', einheit: 'Stellplätze' },
          sf: { titel: 'Stellplatzfläche', gruppe: 'gebaeude', typ: 'zahl', einheit: 'Stellplätze' },
          gn: { titel: 'Nutzfläche von Garagen', gruppe: 'gebaeude', typ: 'zahl', einheit: 'm²' },
          'lage.ags': { titel: 'Gemeindeschlüssel', gruppe: 'lage', typ: 'text' },
        }) as Record<string, unknown>
      )[id] as never,
    bausteine: { beseitigung: { m: 'Vorhaben', in: ['Beseitigung'] }, tief: { $: 'beseitigung' } },
  };
  it('verneinte Bausteine positiv, auch über mehrere Stufen und doppelt verneint', () => {
    expect(kurzBaum({ nicht: { $: 'tief' } }, t).text).toBe('Art des Vorhabens: alles außer „Beseitigung“');
    expect(kurzText({ nicht: { $: 'beseitigung' } }, t)).toBe('Art des Vorhabens: alles außer „Beseitigung“');
    expect(kurzBaum({ nicht: { nicht: { $: 'beseitigung' } } }, t).text).toBe('Art des Vorhabens: „Beseitigung“');
    expect(kurzBaum({ nicht: { m: 'Gebäudeart', in: ['A', 'B', 'C'] } }, t).text).toMatch(/alles außer „A“, „B“ und „C“$/);
  });
  it('ganzzahlige Anzahlen wie im Gesetz: „mehr als“, „genau“, „vorhanden“, Einheit nicht doppelt, Einzahl', () => {
    expect(kurzBaum({ f: 'w', min: 4 }, t).text).toBe('Wohnungen mehr als 3');
    expect(kurzBaum({ f: 'w', min: 3, max: 3 }, t).text).toBe('Wohnungen: genau 3');
    expect(kurzBaum({ f: 'w', min: 1 }, t).text).toBe('Wohnungen: vorhanden');
    expect(kurzBaum({ nicht: { f: 'w', min: 4 } }, t).text).toBe('Wohnungen höchstens 3');
    expect(kurzBaum({ f: 'st', min: 11 }, t).text).toBe('Kfz-Stellplätze im oder am Gebäude mehr als 10');
    expect(kurzBaum({ f: 'st', min: 1 }, t).text).toBe('Kfz-Stellplätze im oder am Gebäude: vorhanden');
    expect(kurzBaum({ f: 'sf', min: 36 }, t).text).toBe('Stellplatzfläche mehr als 35 Stellplätze');
    expect(kurzBaum({ f: 'sf', max: 1 }, t).text).toBe('Stellplatzfläche höchstens 1 Stellplatz');
    expect(kurzBaum({ f: 'gn', min: 0.01, max: 100 }, t).text).toBe('Nutzfläche von Garagen: vorhanden, höchstens 100 m²');
    expect(wertAnzeige(1, { typ: 'zahl', einheit: 'Stellplätze' })).toBe('1 Stellplatz');
  });
  it('Gemeindeschlüssel als Gemeindename, beim aktuellen Wert mit Schlüssel', () => {
    expect(kurzBaum({ f: 'lage.ags', in: ['05974040', '05974048'] }, t).text).toBe('Gemeindeschlüssel: „Soest“ oder „Welver“');
    const ctx = { merkmale: {}, fakten: { 'lage.ags': { wert: '05974040', herkunft: 'manuell' as const, sicherheit: 'sicher' as const } }, einreichung: '2026-11-12', heute: '2026-11-12', bausteine: t.bausteine };
    expect(kurzBaum({ f: 'lage.ags', in: ['05974040'] }, t, ctx).ist).toBe('Soest (05974040)');
    // unbekannte Schlüssel bleiben stehen
    expect(kurzBaum({ f: 'lage.ags', in: ['09999999'] }, t).text).toBe('Gemeindeschlüssel: „09999999“');
  });
  it('Verweise: Norm vor dem Titel', () => {
    expect(verweisName('144', 'Genehmigungspflichtige Vorhaben', 'BauGB')).toBe('§ 144 BauGB – Genehmigungspflichtige Vorhaben');
    expect(verweisName('14', '', 'BauGB')).toBe('§ 14 BauGB');
    expect(verweisName('Anlage 1', 'Gebietsabgrenzung', 'Altstadtsatzung')).toBe('Altstadtsatzung – Anlage 1 – Gebietsabgrenzung');
  });
});

describe('Regel in Worten: verneinte Schwellen und unsichere Gruppen', () => {
  const t: TextKontext = {
    fakt: (id) => (({ h: { titel: 'Höhe', gruppe: 'gebaeude', typ: 'zahl', einheit: 'm' }, g: { titel: 'Garagen', gruppe: 'gebaeude', typ: 'zahl', einheit: 'm²' }, a: { titel: 'A', gruppe: 'vorhaben', typ: 'janein' }, b: { titel: 'B', gruppe: 'vorhaben', typ: 'janein' } }) as Record<string, unknown>)[id] as never,
    bausteine: {},
  };
  it('„nicht über 22 m“ → „höchstens 22 m“, „nicht vorhanden“ → „keine“', () => {
    expect(kurzBaum({ nicht: { f: 'h', min: 22.01 } }, t).text).toBe('Höhe höchstens 22 m');
    expect(kurzBaum({ nicht: { f: 'g', min: 0.01 } }, t).text).toBe('Garagen: keine');
  });
  it('eine Gruppe, deren Stand nur auf Hinweisen beruht, ist unsicher', () => {
    const ctx = { merkmale: {}, fakten: { a: { wert: false, herkunft: 'geodienst' as const, sicherheit: 'hinweis' as const }, b: { wert: false, herkunft: 'geodienst' as const, sicherheit: 'hinweis' as const } }, einreichung: '2026-11-12', heute: '2026-11-12', bausteine: {} };
    const b = kurzBaum({ und: [{ f: 'a', ist: true }, { f: 'b', ist: true }] }, t, ctx);
    expect(b).toMatchObject({ w: 'nein', unsicher: true });
  });
});
