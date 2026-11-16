/**
 * Vorfragen (FaktDef.vorfrage, fragen.ts): „nein“ erledigt die Einzelfragen, „ja“ in einer Einzelfrage macht die Vorfrage
 * zu „ja“, nie ein falsches Grün. Mit den Vorfragen des Katalogs (Natura 2000) und einem kleinen Regelpaket.
 */
import { describe, expect, it } from 'vitest';
import { VORGABE_MERKMALE } from '../bedingung';
import type { AuswertungsEingabe } from './auswertung';
import { auswerten } from './auswertung';
import { FAKTEN } from './fakten';
import { ableitungenAnwenden, einzelfragenVon, frageGestellt, mitVorfragen, vorfrageHinweis, vorfragenAnwenden, vorfragenKarte } from './fragen';
import { aktiveModule, paketAusDateien, paketPruefen } from './paket';
import type { FaktDef, FaktWert, Kurz, Modul, Regeldatei } from './typen';

const sicher = (wert: FaktWert['wert']): FaktWert => ({ wert, herkunft: 'manuell', sicherheit: 'sicher' });
const V = 'vorfrage.natura2000';

const bund: Modul = {
  format: 1,
  id: 'bund',
  name: 'Bund',
  ebene: 'bund',
  version: '2026-11-16',
  normen: { bnatschg: { kurz: 'BNatSchG', titel: 'Bundesnaturschutzgesetz', thema: 'natur', quelle: { art: 'gii', pfad: 'bnatschg_2009' } } },
  fakten: {
    // eine Einzelfrage, die selbst Vorfrage einer Auswahl ist (wie Heilquellenschutzgebiet → Zonen)
    'x.zone': { titel: 'Zone im Vogelschutzgebiet', gruppe: 'schutz', typ: 'wahl', werte: ['A', 'B', 'außerhalb'], vorfrage: { fakt: 'schutz.vsg', sonst: 'außerhalb' } },
  },
};
const bnatschg: Regeldatei = {
  format: 1,
  modul: 'bund',
  norm: 'bnatschg',
  fassung: '2026-09-30',
  version: 1,
  paragrafen: {
    '34': {
      gilt: {
        oder: [
          { f: 'schutz.ffh', ist: true },
          { f: 'schutz.vsg', ist: true },
          { f: 'schutz.natura_nah', ist: true },
        ],
      },
      grund: 'Verträglichkeit.',
    },
    Zone: { gilt: { f: 'x.zone', in: ['A', 'B'] }, grund: 'Zone.' },
    Versammlung: { gilt: { f: 'gebaeude.besucher', min: 200.01 }, grund: 'Versammlungsstätte.' },
    Wohnungen: { gilt: { f: 'gebaeude.wohnungen', min: 3 }, grund: 'Ab drei Wohnungen.' },
  },
};
const paket = paketAusDateien({ 'module/bund/modul.json': bund, 'module/bund/bnatschg@2026-09-30.json': bnatschg }, 'test');

function lauf(fakten: Record<string, FaktWert>, merkmale: Record<string, string> = { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus' }, widersprueche?: Set<string>) {
  const e: AuswertungsEingabe = {
    paket,
    module: aktiveModule(paket.module, null),
    merkmale,
    widersprueche,
    fakten,
    einreichung: '2026-12-01',
    heute: '2026-11-16',
    texte: new Map(),
    festlegungen: {},
  };
  const a = auswerten(e);
  return { a, ampel: (nr: string) => a.paragrafen.find((p) => p.id === `bund/bnatschg/${nr}`)!.automatisch, gestellt: (id: string) => frageGestellt(id, a.faktDefs[id], a.kontext) };
}
const KINDER = ['schutz.ffh', 'schutz.vsg', 'schutz.natura_nah'];

describe('Vorfragen', () => {
  it('Karte: je Vorfrage die Einzelfragen, auch über Stufen; Vorfragen zählen mit ihren Einzelfragen', () => {
    const defs = { ...FAKTEN, ...bund.fakten };
    const karte = vorfragenKarte(defs);
    expect(karte.get(V)).toEqual(KINDER);
    expect(einzelfragenVon(V, karte)).toEqual(['schutz.ffh', 'schutz.vsg', 'x.zone', 'schutz.natura_nah']);
    expect([...mitVorfragen(['x.zone'], defs)].sort()).toEqual(['schutz.vsg', V, 'x.zone'].sort());
  });

  it('unbeantwortet: Einzelfragen gestellt und offen; die Vorfrage klärt, was sie klären – zuerst', () => {
    const { a, ampel, gestellt } = lauf({});
    expect(ampel('34')).toBe('gelb');
    for (const k of KINDER) expect(gestellt(k), k).toBe(true);
    expect(a.klaerung[0]).toMatchObject({ id: V, anzahl: 2 });
    expect(a.paragrafen.find((p) => p.id === 'bund/bnatschg/34')!.klaerend).toContain(V);
  });

  it('„nein“ (gesichert): Einzelfragen entfallen, gelten als „nein“ mit der Vorfrage als Quelle – auch über Stufen', () => {
    const { a, ampel, gestellt } = lauf({ [V]: sicher(false) });
    expect(ampel('34')).toBe('gruen');
    expect(ampel('Zone')).toBe('gruen');
    for (const k of KINDER) {
      expect(a.fakten[k], k).toMatchObject({ wert: false, herkunft: 'abgeleitet', sicherheit: 'sicher', ausVorfrage: V });
      expect(a.fakten[k].quelle).toMatch(/Vorfrage „Natura 2000 am Standort oder im Umfeld“: nein/);
      expect(gestellt(k), k).toBe(false);
    }
    expect(a.fakten['x.zone']).toMatchObject({ wert: 'außerhalb', ausVorfrage: 'schutz.vsg' });
    expect(a.klaerung).toEqual([]);
  });

  it('„nein“ nur als Hinweis (z. B. frühere Lage) bzw. unbeantwortet: nichts entfällt', () => {
    const { a, ampel, gestellt } = lauf({ [V]: { ...sicher(false), sicherheit: 'hinweis', grund: 'frühere Lage' } });
    expect(ampel('34')).toBe('gelb');
    for (const k of KINDER) {
      expect(a.fakten[k]?.wert ?? null, k).toBeNull();
      expect(gestellt(k), k).toBe(true);
    }
  });

  it('kein falsches Grün: Treffer eines Dienstes gegen „nein“ in der Vorfrage – Widerspruch, die Einzelfragen bleiben', () => {
    const { a, ampel, gestellt } = lauf({ [V]: sicher(false), 'schutz.ffh': { wert: true, herkunft: 'geodienst', sicherheit: 'sicher', quelle: 'LINFOS' } });
    expect(a.fakten[V].widerspruch).toMatch(/„FFH-Gebiet \(Natura 2000\)“ ist „ja“/);
    expect(ampel('34')).toBe('rot');
    expect(gestellt('schutz.natura_nah')).toBe(true);
    expect(a.fakten['schutz.natura_nah']?.wert ?? null).toBeNull();
  });

  it('kein falsches Grün: eine widersprüchliche Einzelfrage („nein“ gegen einen Treffer) hält die Vorfrage offen', () => {
    const ffh: FaktWert = { ...sicher(false), widerspruch: 'LINFOS: Treffer', dienst: { wert: true, sicherheit: 'sicher' } };
    const { a, ampel, gestellt } = lauf({ [V]: sicher(false), 'schutz.ffh': ffh, 'schutz.vsg': sicher(false) });
    expect(a.fakten[V].widerspruch).toMatch(/widersprüchlich/);
    expect(gestellt('schutz.natura_nah')).toBe(true);
    expect(ampel('34')).toBe('gelb');
  });

  it('ältere Projekte ohne Vorfrage: eine Einzelfrage „ja“ macht die Vorfrage zu „ja“ (mit Beleg); die übrigen bleiben gefragt', () => {
    const { a, ampel, gestellt } = lauf({ 'schutz.vsg': sicher(true), 'schutz.ffh': sicher(false) });
    expect(a.fakten[V]).toMatchObject({ wert: true, herkunft: 'abgeleitet', sicherheit: 'sicher' });
    expect(a.fakten[V].quelle).toMatch(/aus „Vogelschutzgebiet \(Natura 2000\)“/);
    expect(ampel('34')).toBe('rot');
    expect(gestellt('schutz.natura_nah')).toBe(true);
    expect(gestellt('x.zone')).toBe(true);
    // nur ein Hinweis „ja“: die Vorfrage auch nur als Hinweis
    const h = lauf({ 'schutz.vsg': { wert: true, herkunft: 'geodienst', sicherheit: 'hinweis', grund: 'Grenze nahe' } });
    expect(h.a.fakten[V]).toMatchObject({ wert: true, sicherheit: 'hinweis' });
  });

  it('ältere Projekte ohne Vorfrage, Einzelfragen „nein“: Die Vorfrage wird gefragt, die Antworten bleiben erhalten', () => {
    const alt = { 'schutz.ffh': sicher(false), 'schutz.vsg': sicher(false) };
    const vorher = lauf(alt);
    expect(vorher.a.fakten[V]?.wert ?? null).toBeNull();
    expect(vorher.gestellt(V)).toBe(true);
    expect(vorher.a.fakten['schutz.ffh']).toMatchObject({ wert: false, herkunft: 'manuell' });
    expect(vorher.a.fakten['schutz.vsg']).toMatchObject({ wert: false, herkunft: 'manuell' });
    expect(vorher.gestellt('schutz.natura_nah')).toBe(true);
    expect(vorher.ampel('34')).toBe('gelb');
    // danach „nein“ in der Vorfrage: Die Einzelfragen sind nicht mehr gestellt, es gilt derselbe Wert aus der Vorfrage
    // (die eigenen Antworten bleiben gespeichert, zählen aber nicht doppelt)
    const nachher = lauf({ ...alt, [V]: sicher(false) });
    for (const k of KINDER) expect(nachher.a.fakten[k], k).toMatchObject({ wert: false, ausVorfrage: V });
    expect(nachher.ampel('34')).toBe('gruen');
  });

  it('kein falsches Grün über Stufen: „ja“ unter einer Einzelfrage, deren Vorfrage „nein“ ist, macht die oberste Vorfrage widersprüchlich', () => {
    const { a, ampel, gestellt } = lauf({ [V]: sicher(false), 'x.zone': sicher('A') });
    expect(a.fakten['schutz.vsg']).toMatchObject({ wert: true, herkunft: 'abgeleitet' });
    expect(a.fakten[V].widerspruch).toMatch(/„Vogelschutzgebiet \(Natura 2000\)“ ist „ja“/);
    expect(gestellt('schutz.vsg')).toBe(true);
    expect(gestellt('x.zone')).toBe(true);
    expect(gestellt('schutz.natura_nah')).toBe(true);
    expect(ampel('34')).toBe('rot');
    expect(ampel('Zone')).toBe('rot');
    // ebenso bei „nein“ in beiden Stufen: der Widerspruch der mittleren reicht nach oben
    const beide = lauf({ [V]: sicher(false), 'schutz.vsg': sicher(false), 'x.zone': sicher('A') });
    expect(beide.a.fakten['schutz.vsg'].widerspruch).toBeTruthy();
    expect(beide.a.fakten[V].widerspruch).toMatch(/widersprüchlich/);
    expect(beide.gestellt('x.zone')).toBe(true);
    expect(beide.ampel('Zone')).toBe('rot');
  });

  it('eine Antwort mit der Kennung `ausVorfrage` aus einer Datei zählt als eigene Antwort, nicht als abgeleitet', () => {
    const { a } = lauf({ 'schutz.ffh': { ...sicher(false), ausVorfrage: V } });
    expect(a.fakten['schutz.ffh'].ausVorfrage).toBeUndefined();
  });

  it('Hinweis an der offenen Vorfrage: die Lage-Abfrage ohne Treffer belegt sie nicht vor (Umfeld, andere Einzelfragen)', () => {
    const defs = { ...FAKTEN, 'schutz.ffh': { ...FAKTEN['schutz.ffh'], geodienst: { art: 'wms' as const, url: 'x', ebene: 'FFH', vollstaendig: true, puffer: 25, quelle: 'LINFOS' } } };
    const fakten = vorfragenAnwenden({ 'schutz.ffh': { wert: false, herkunft: 'geodienst', sicherheit: 'sicher' } }, defs);
    expect(fakten[V]?.wert ?? null).toBeNull();
    const h = vorfrageHinweis(V, fakten, defs)!;
    expect(h).toMatch(/kein Treffer im Umkreis von 25 m \(FFH-Gebiet \(Natura 2000\)\)\./);
    expect(h).toMatch(/Nicht geprüft: .*Natura-2000-Gebiet in der Nähe/);
    expect(h).toMatch(/nicht vorbelegt/);
    expect(vorfrageHinweis(V, { ...fakten, [V]: sicher(true) }, defs)).toBeUndefined();
  });
});

describe('Prüfung des Pakets: Vorfragen', () => {
  const mit = (fakten: Modul['fakten']) =>
    paketPruefen(
      paketAusDateien({ 'module/bund/modul.json': { ...bund, fakten }, 'module/bund/bnatschg@2026-09-30.json': { ...bnatschg, paragrafen: { '34': bnatschg.paragrafen['34'] } } }, 'x'),
      VORGABE_MERKMALE,
    );
  const j = (vorfrage: { fakt: string; sonst: string | number | boolean }) => ({ titel: 'T', gruppe: 'schutz' as const, typ: 'janein' as const, vorfrage });
  it('gültig, unbekannt, nicht ja/nein, Wert ohne Vorfrage passt nicht, Kreis', () => {
    expect(mit({ 'x.a': j({ fakt: V, sonst: false }) })).toEqual([]);
    expect(mit({ 'x.a': j({ fakt: 'x.gibtsnicht', sonst: false }) }).join('\n')).toMatch(/Vorfrage „x\.gibtsnicht“ von „x\.a“ ist nicht sichtbar/);
    expect(mit({ 'x.a': j({ fakt: 'lage.gemeinde', sonst: false }) }).join('\n')).toMatch(/keine Ja\/Nein-Angabe/);
    expect(mit({ 'x.a': j({ fakt: V, sonst: 'nein' }) }).join('\n')).toMatch(/Wert ohne Vorfrage von „x\.a“ passt nicht/);
    expect(mit({ 'x.a': j({ fakt: 'x.b', sonst: false }), 'x.b': j({ fakt: 'x.a', sonst: false }) }).join('\n')).toMatch(/Vorfragen im Kreis: x\.a → x\.b → x\.a/);
  });
});

describe('Werte, die sich aus anderen ergeben (FaktDef.folgt)', () => {
  const MFH = { Vorhaben: 'Errichtung', Gebäudeart: 'Mehrfamilienhaus' };
  it('reines Wohngebäude: keine Versammlungsstätte – abgeleitet mit Grund, keine Frage, „entfällt“', () => {
    const { a, ampel, gestellt } = lauf({}, MFH);
    expect(a.fakten['gebaeude.besucher']).toMatchObject({ wert: 0, herkunft: 'abgeleitet', sicherheit: 'sicher', ausFolge: 'reines Wohngebäude – keine Versammlungsstätte' });
    expect(gestellt('gebaeude.besucher')).toBe(false);
    expect(ampel('Versammlung')).toBe('gruen');
    expect(a.klaerung.map((k) => k.id)).not.toContain('gebaeude.besucher');
    // Wohn- und Geschäftshaus: gefragt, offen
    const wg = lauf({}, { ...MFH, Gebäudeart: 'Wohn- und Geschäftshaus' });
    expect(wg.a.fakten['gebaeude.besucher']?.wert ?? null).toBeNull();
    expect(wg.gestellt('gebaeude.besucher')).toBe(true);
    expect(wg.ampel('Versammlung')).toBe('gelb');
  });

  it('Einfamilienhaus eine Wohnung, Zweifamilienhaus zwei; ohne Gebäudeart offen', () => {
    expect(lauf({}).a.fakten['gebaeude.wohnungen']).toMatchObject({ wert: 1, ausFolge: 'Einfamilienhaus – eine Wohnung' });
    expect(lauf({}, { Vorhaben: 'Errichtung', Gebäudeart: 'Zweifamilienhaus' }).a.fakten['gebaeude.wohnungen'].wert).toBe(2);
    const ohne = lauf({}, { Vorhaben: 'Errichtung' });
    expect(ohne.a.fakten['gebaeude.wohnungen']?.wert ?? null).toBeNull();
    expect(ohne.gestellt('gebaeude.wohnungen')).toBe(true);
  });

  it('nie still überschrieben: eine abweichende ältere Antwort bleibt als Widerspruch (kein Grün), mit Beleg überstimmt sie', () => {
    const alt = lauf({ 'gebaeude.besucher': sicher(300) }, MFH);
    expect(alt.a.fakten['gebaeude.besucher']).toMatchObject({ wert: 300, herkunft: 'manuell' });
    expect(alt.a.fakten['gebaeude.besucher'].widerspruch).toMatch(/ergibt sich aus anderen Angaben als „0“ \(reines Wohngebäude/);
    expect(alt.gestellt('gebaeude.besucher')).toBe(true);
    expect(alt.ampel('Versammlung')).toBe('rot');
    // auch ein Hinweis aus dem Modell (z. B. drei Wohnungen in einem Einfamilienhaus) wird nicht ersetzt
    const modell = lauf({ 'gebaeude.wohnungen': { wert: 3, herkunft: 'flaechen', sicherheit: 'hinweis', grund: 'Wohnungen der Räume' } });
    expect(modell.a.fakten['gebaeude.wohnungen']).toMatchObject({ wert: 3, herkunft: 'flaechen' });
    expect(modell.a.fakten['gebaeude.wohnungen'].widerspruch).toBeTruthy();
    expect(modell.ampel('Wohnungen')).not.toBe('gruen');
    // derselbe Wert: zählt nicht eigens, es gilt der abgeleitete
    expect(lauf({ 'gebaeude.besucher': sicher(0) }, MFH).a.fakten['gebaeude.besucher'].ausFolge).toBeTruthy();
    // mit Beleg überstimmt (Sonderfall): kein Widerspruch
    const beleg = lauf({ 'gebaeude.besucher': { ...sicher(300), bestaetigt: { von: 'TP', am: '2026-11-16', grund: 'Gemeinschaftssaal, Auskunft Bauaufsicht' } } }, MFH);
    expect(beleg.a.fakten['gebaeude.besucher'].widerspruch).toBeUndefined();
    expect(beleg.ampel('Versammlung')).toBe('rot');
  });

  it('nur aus gesicherten Angaben: ein widersprüchliches Merkmal leitet nichts ab', () => {
    const { a, gestellt } = lauf({}, MFH, new Set(['Gebäudeart']));
    expect(a.fakten['gebaeude.besucher']?.wert ?? null).toBeNull();
    expect(gestellt('gebaeude.besucher')).toBe(true);
  });

  it('Teilmenge als Vorfrage: ohne Arbeiten an Dach oder Fassade keine Erneuerung der Dachhaut', () => {
    const { a, gestellt } = lauf({ 'vorhaben.dach_fassade': sicher(false) });
    expect(a.fakten['vorhaben.dachhaut']).toMatchObject({ wert: false, ausVorfrage: 'vorhaben.dach_fassade' });
    expect(gestellt('vorhaben.dachhaut')).toBe(false);
    expect(lauf({ 'vorhaben.dachhaut': sicher(true) }).a.fakten['vorhaben.dach_fassade']).toMatchObject({ wert: true, herkunft: 'abgeleitet' });
  });

  it('Prüfung des Pakets: Wert und Grund von „folgt“', () => {
    const mit = (f: NonNullable<Modul['fakten']>[string]) =>
      paketPruefen(
        paketAusDateien({ 'module/bund/modul.json': { ...bund, fakten: { 'x.f': f } }, 'module/bund/bnatschg@2026-09-30.json': { ...bnatschg, paragrafen: { '34': bnatschg.paragrafen['34'] } } }, 'x'),
        VORGABE_MERKMALE,
      );
    const z = (wert: string | number | boolean, grund = 'Grund') => ({
      titel: 'F',
      gruppe: 'gebaeude' as const,
      typ: 'zahl' as const,
      folgt: [{ wenn: { m: 'Gebäudeart', in: ['Einfamilienhaus'] }, wert, grund }],
    });
    expect(mit(z(0))).toEqual([]);
    expect(mit(z('null')).join('\n')).toMatch(/folgt\[0\]: Wert „null“ passt nicht zur Art „zahl“/);
    expect(mit(z(0, ' ')).join('\n')).toMatch(/folgt\[0\]: Grund fehlt/);
    expect(mit({ ...z(0), wert: 1 }).join('\n')).toMatch(/„folgt“ nicht zusammen mit festem Wert/);
  });

  it('Fixpunkt im Wechsel: ein Wert nach `folgt` stützt sich auf eine Vorfrage und umgekehrt', () => {
    const defs: Record<string, FaktDef> = {
      ...FAKTEN,
      'x.folge': { titel: 'Folge', gruppe: 'schutz', typ: 'janein', folgt: [{ wenn: { f: 'schutz.ffh', ist: false }, wert: true, grund: 'kein FFH-Gebiet' }] },
      'x.kind': { titel: 'Kind', gruppe: 'gebaeude', typ: 'janein', vorfrage: { fakt: 'gebaeude.beheizt', sonst: false } },
    };
    const rest = { merkmale: { Gebäudeart: 'kein Gebäude' }, einreichung: '2026-12-01', heute: '2026-11-16', bausteine: {} };
    const out = ableitungenAnwenden({ [V]: sicher(false) }, defs, rest);
    // Vorfrage „nein“ → FFH „nein“ → x.folge ergibt sich
    expect(out['x.folge']).toMatchObject({ wert: true, ausFolge: 'kein FFH-Gebiet' });
    // kein Gebäude → beheizt „nein“ (folgt) → x.kind entfällt (Vorfrage)
    expect(out['gebaeude.beheizt']).toMatchObject({ wert: false, ausFolge: 'kein Gebäude – das GEG gilt nur für Gebäude' });
    expect(out['x.kind']).toMatchObject({ wert: false, ausVorfrage: 'gebaeude.beheizt' });
  });

  it('trifft eine Bedingung im Lauf nicht mehr zu, fällt der abgeleitete Wert weg – die eigene Angabe gilt wieder', () => {
    const defs: Record<string, FaktDef> = {
      'x.a': { titel: 'A', gruppe: 'gebaeude', typ: 'zahl', folgt: [{ wenn: { f: 'x.b', bekannt: false }, wert: 0, grund: 'B unbekannt' }] },
      'x.b': { titel: 'B', gruppe: 'gebaeude', typ: 'zahl', folgt: [{ wenn: { m: 'Gebäudeart', in: ['Einfamilienhaus'] }, wert: 1, grund: 'EFH' }] },
    };
    const eigen = sicher(7);
    const out = ableitungenAnwenden({ 'x.a': eigen }, defs, { merkmale: { Gebäudeart: 'Einfamilienhaus' }, einreichung: '2026-12-01', heute: '2026-11-16', bausteine: {} });
    expect(out['x.b']).toMatchObject({ wert: 1, ausFolge: 'EFH' });
    expect(out['x.a']).toEqual(eigen);
    // ebenso eine eigene Antwort gleichen Werts, die zwischendurch durch den abgeleiteten Wert ersetzt war
    const gleich = sicher(0);
    expect(ableitungenAnwenden({ 'x.a': gleich }, defs, { merkmale: { Gebäudeart: 'Einfamilienhaus' }, einreichung: '2026-12-01', heute: '2026-11-16', bausteine: {} })['x.a']).toEqual(gleich);
  });

  it('die eigene Antwort gleichen Werts bleibt in den Angaben der Prüfung erhalten (nur in der Auswertung zählt der abgeleitete Wert)', () => {
    const eingabe = { 'gebaeude.besucher': sicher(0) };
    const { a } = lauf(eingabe, MFH);
    expect(a.fakten['gebaeude.besucher'].ausFolge).toBeTruthy();
    expect(eingabe['gebaeude.besucher']).toEqual(sicher(0));
  });

  it('Prüfung des Pakets: `folgt` ohne Verweis auf Paragrafen und ohne Zyklus über andere Angaben', () => {
    const mit = (fakten: NonNullable<Modul['fakten']>) =>
      paketPruefen(
        paketAusDateien({ 'module/bund/modul.json': { ...bund, fakten }, 'module/bund/bnatschg@2026-09-30.json': { ...bnatschg, paragrafen: { '34': bnatschg.paragrafen['34'] } } }, 'x'),
        VORGABE_MERKMALE,
      );
    const f = (wenn: Kurz) => ({ titel: 'F', gruppe: 'gebaeude' as const, typ: 'janein' as const, folgt: [{ wenn, wert: false, grund: 'G' }] });
    expect(mit({ 'x.p': f({ n: 'bund/bnatschg/34', ampel: ['rot'] }) }).join('\n')).toMatch(/folgt\[0\]: die Bedingung darf nicht auf Paragrafen verweisen/);
    expect(mit({ 'x.a': f({ f: 'x.b', ist: true }), 'x.b': f({ f: 'x.a', ist: true }) }).join('\n')).toMatch(/Fragen-Zyklus: x\.a → x\.b → x\.a/);
  });
});
