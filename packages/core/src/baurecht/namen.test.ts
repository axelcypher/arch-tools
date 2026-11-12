import { describe, expect, it } from 'vitest';
import type { TextKontext } from './kurz';
import { kurzBaum } from './kurz';
import { einheitName, einheitVoll, normTitel, normVoll } from './typen';

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
    expect(kurzBaum({ nicht: { f: 'art', in: ['EFH', 'ZFH'] } }, t).text).toBe('Gebäudeart: weder „EFH“ noch „ZFH“');
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
