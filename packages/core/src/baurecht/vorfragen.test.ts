/**
 * Vorfragen (FaktDef.vorfrage, fragen.ts): „nein“ erledigt die Einzelfragen, „ja“ in einer Einzelfrage macht die Vorfrage
 * zu „ja“, nie ein falsches Grün. Mit den Vorfragen des Katalogs (Natura 2000) und einem kleinen Regelpaket.
 */
import { describe, expect, it } from 'vitest';
import { VORGABE_MERKMALE } from '../bedingung';
import type { AuswertungsEingabe } from './auswertung';
import { auswerten } from './auswertung';
import { FAKTEN } from './fakten';
import { einzelfragenVon, frageGestellt, mitVorfragen, vorfrageHinweis, vorfragenAnwenden, vorfragenKarte } from './fragen';
import { aktiveModule, paketAusDateien, paketPruefen } from './paket';
import type { FaktWert, Modul, Regeldatei } from './typen';

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
  },
};
const paket = paketAusDateien({ 'module/bund/modul.json': bund, 'module/bund/bnatschg@2026-09-30.json': bnatschg }, 'test');

function lauf(fakten: Record<string, FaktWert>) {
  const e: AuswertungsEingabe = {
    paket,
    module: aktiveModule(paket.module, null),
    merkmale: { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus' },
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
    // danach „nein“ in der Vorfrage: die eigenen Antworten bleiben stehen, die fehlende folgt aus der Vorfrage
    const nachher = lauf({ ...alt, [V]: sicher(false) });
    expect(nachher.a.fakten['schutz.natura_nah']).toMatchObject({ wert: false, ausVorfrage: V });
    expect(nachher.ampel('34')).toBe('gruen');
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
    expect(h).toMatch(/ohne Treffer im Umkreis von 25 m: FFH-Gebiet \(Natura 2000\)\./);
    expect(h).toMatch(/Natura-2000-Gebiet in der Nähe/);
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
