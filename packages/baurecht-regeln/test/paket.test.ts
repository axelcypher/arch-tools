/**
 * Prüfungen über das ganze Regelpaket: Format, bekannte Fakten/Merkmale/Bausteine/Verweise, Prüfsummen eingetragen,
 * und eine Fallmatrix, die jede Regel mit allen Kombinationen der Merkmale (auch „nicht festgelegt“) auswertet.
 */
import { describe, expect, it } from 'vitest';
import type { AuswertungsEingabe } from '@core/baurecht/auswertung';
import type { TextStand } from '@core/baurecht/auswertung';
import { auswerten, faktDefinitionen } from '@core/baurecht/auswertung';
import { aktiveModule, paketPruefen } from '@core/baurecht/paket';
import { widersprueche } from '@core/baurecht/projekt';
import type { FaktWert, ParagrafErgebnis } from '@core/baurecht/typen';
import type { Fassung } from '@core/recht/typen';
import { VORGABE_MERKMALE } from '@core/bedingung';
import { ohneFassungsdatum, paketLaden } from './laden';

const paket = paketLaden();
const SOEST = '05974040';

describe('Regelpaket', () => {
  it('enthält die Module Bund, NRW, Kreis Soest und Stadt Soest', () => {
    expect(paket.module.map((m) => m.id).sort()).toEqual(['bund', 'nw', 'nw-05974', 'nw-05974040']);
    expect(aktiveModule(paket.module, SOEST).map((m) => m.id)).toEqual(['bund', 'nw', 'nw-05974', 'nw-05974040']);
  });

  it('ist in sich stimmig (Fakten, Merkmale, Bausteine, Verweise, Dateinamen)', () => {
    expect(paketPruefen(paket, VORGABE_MERKMALE)).toEqual([]);
  });

  it('jede Norm mit Text hat eine Regeldatei; jede Fundstelle hat eine Prüfsumme', () => {
    const fehlt: string[] = [];
    for (const m of paket.module)
      for (const [norm, def] of Object.entries(m.normen)) {
        const l = paket.regeln.get(`${m.id}/${norm}`);
        if (!l?.length) {
          fehlt.push(`${m.id}/${norm}: keine Regeldatei`);
          continue;
        }
        if (def.quelle.art === 'verweis') continue;
        for (const [nr, r] of Object.entries(l[l.length - 1].regel.paragrafen)) for (const fs of r.fundstellen ?? [nr]) if (!r.stand?.[fs]) fehlt.push(`${m.id}/${norm} § ${nr}: keine Prüfsumme für ${fs} (npm run stand)`);
      }
    expect(fehlt).toEqual([]);
  });

  it('jede Gemeinde des Kreises bekommt ihre Zuständigkeit', () => {
    const kreis = paket.module.find((m) => m.id === 'nw-05974')!;
    expect(Object.keys(kreis.fakten ?? {})).toEqual(expect.arrayContaining(['zustaendig.bauaufsicht']));
  });
});

/* ---------- Fallmatrix ---------- */

/**
 * Die Fallmatrix wertet jede Regel mit allen Kombinationen der Merkmale aus (auch „nicht festgelegt“) – ohne Fakten
 * und ohne Text sowie mit Texten, deren Prüfsummen zu den Regeln passen, und zwei vollständigen Sätzen sicherer
 * Fakten (alles nein / alles ja). Geprüft werden Eigenschaften, die ein falsches Grün ausschließen:
 *
 *  1. Ergänzen: Ist ein Paragraf grün, obwohl ein Merkmal fehlt, darf er mit keinem Wert dieses Merkmals rot sein
 *     (die Entscheidung hing nicht an der fehlenden Angabe).
 *  2. Herabstufen: Ist ein Paragraf grün und wird ein Fakt, auf dem er beruht, zum Hinweis, ist er nicht mehr grün.
 *  3. Text: Ändert sich eine Fundstelle oder fehlt der Text, ist ein grüner Paragraf mit Prüfsummen nicht mehr grün.
 *  4. Jeder Paragraf hat eine Begründung; Grün hat keine offenen und keine unsicheren Angaben.
 */

const WERTE: Record<string, (string | undefined)[]> = {
  Vorhaben: ['Errichtung', 'Änderung', 'Nutzungsänderung', 'Beseitigung', undefined],
  Gebäudeart: ['Einfamilienhaus', 'Zweifamilienhaus', 'Mehrfamilienhaus', 'Nichtwohngebäude', 'kein Gebäude', undefined],
  Gebäudeklasse: ['1', '2', '4', undefined],
  Planungsrecht: ['Bebauungsplan', 'einfacher Bebauungsplan', 'Satzung nach BauGB', 'Innenbereich', 'Außenbereich', undefined],
  Verfahren: ['verfahrensfrei', 'Genehmigungsfreistellung', 'vereinfachtes Verfahren', undefined],
};

function* kombinationen(werte: Record<string, (string | undefined)[]>): Generator<Record<string, string>> {
  const namen = Object.keys(werte);
  const lauf = function* (i: number, acc: Record<string, string>): Generator<Record<string, string>> {
    if (i === namen.length) {
      yield acc;
      return;
    }
    for (const w of werte[namen[i]]) yield* lauf(i + 1, w ? { ...acc, [namen[i]]: w } : acc);
  };
  yield* lauf(0, {});
}
const schluessel = (m: Record<string, string>, namen: string[]) => namen.map((k) => m[k] ?? '–').join('|');

const sicher = (wert: FaktWert['wert']): FaktWert => ({ wert, herkunft: 'manuell', sicherheit: 'sicher' });
const HEUTE = '2026-11-12';

/** Texte aller Normen, deren Prüfsummen genau zu den Regeln passen (an der Quelle bestätigt) */
function passendeTexte(): Map<string, TextStand> {
  const t = new Map<string, TextStand>();
  for (const [k, l] of paket.regeln) {
    const r = l[l.length - 1].regel;
    const summen: Record<string, string> = {};
    const paragrafen: Fassung['paragrafen'] = {};
    for (const [nr, p] of Object.entries(r.paragrafen)) {
      Object.assign(summen, p.stand ?? {});
      paragrafen[nr] = { titel: `§ ${nr}`, url: '', text: ['(1) …'] };
    }
    const fassung: Fassung = { id: r.norm, kurz: r.norm, titel: r.norm, fassung: '', url: '', paragrafen, gueltigAb: r.fassung, abgerufen: `${HEUTE}T08:00:00Z`, quelle: { art: 'gii', pfad: r.norm }, summen, kennung: r.fassung };
    t.set(k, { fassung, geprueft: `${HEUTE}T08:00:00Z` });
  }
  return t;
}

/** ein vollständiger Satz sicherer Fakten (alle Fakten der aktiven Module) */
function alleFakten(art: 'nein' | 'ja'): Record<string, FaktWert> {
  const defs = faktDefinitionen(aktiveModule(paket.module, SOEST));
  const out: Record<string, FaktWert> = {};
  for (const [id, d] of Object.entries(defs)) {
    if (id === 'lage.ags' || id === 'antrag.einreichung') continue;
    if (d.typ === 'janein') out[id] = sicher(art === 'ja');
    else if (d.typ === 'zahl') out[id] = sicher(art === 'ja' ? 10000 : 10);
    else if (d.typ === 'wahl' && d.werte?.length) out[id] = sicher(art === 'ja' ? d.werte[d.werte.length - 1] : d.werte[0]);
  }
  return out;
}

function eingabe(merkmale: Record<string, string>, fakten: Record<string, FaktWert> = {}, texte = new Map<string, TextStand>()): AuswertungsEingabe {
  return {
    paket,
    module: aktiveModule(paket.module, SOEST),
    merkmale,
    fakten: { 'lage.ags': sicher(SOEST), ...fakten },
    einreichung: '2026-12-01',
    heute: HEUTE,
    texte,
    festlegungen: {},
  };
}

interface Lauf {
  name: string;
  fakten: Record<string, FaktWert>;
  texte: Map<string, TextStand>;
  werte: Record<string, (string | undefined)[]>;
}

const TEXTE = passendeTexte();
// mit Texten und Fakten: die übrigen Werte der Merkmale, dazu Sonderbau
const KLEIN: Record<string, (string | undefined)[]> = {
  Vorhaben: WERTE.Vorhaben,
  Gebäudeart: ['Einfamilienhaus', 'Mehrfamilienhaus', 'Nichtwohngebäude', undefined],
  Gebäudeklasse: ['3', '5', undefined],
  Planungsrecht: ['Bebauungsplan', 'Satzung nach BauGB', 'Außenbereich', undefined],
  Verfahren: ['Baugenehmigungsverfahren', 'verfahrensfrei', undefined],
  Sonderbau: ['ja', 'nein', undefined],
};
const LAEUFE: Lauf[] = [
  { name: 'ohne Fakten, ohne Text', fakten: {}, texte: new Map(), werte: WERTE },
  // mit passenden Texten über alle Merkmalswerte – erst so werden grüne Pfade der Normen mit Text erreicht
  { name: 'Texte passend, alle Fakten nein', fakten: alleFakten('nein'), texte: TEXTE, werte: WERTE },
  { name: 'Texte passend, alle Fakten ja', fakten: alleFakten('ja'), texte: TEXTE, werte: WERTE },
  { name: 'Texte passend, alle Fakten nein, mit Sonderbau', fakten: alleFakten('nein'), texte: TEXTE, werte: KLEIN },
];

describe('Fallmatrix', () => {
  it('kein falsches Grün: Ergänzen, Herabstufen, Text, Begründung', { timeout: 600000 }, () => {
    const fehler: string[] = [];
    const melde = (t: string) => {
      if (fehler.length < 40) fehler.push(t);
    };
    let gruenGesamt = 0;
    const geprueftHerab = new Set<string>();
    const geprueftText = new Set<string>();
    for (const lauf of LAEUFE) {
      const ergebnisse = new Map<string, Map<string, string>>();
      const gruen: { m: Record<string, string>; p: ParagrafErgebnis; ref: string[] }[] = [];
      for (const m of kombinationen(lauf.werte)) {
        const a = auswerten(eingabe(m, lauf.fakten, lauf.texte));
        const nachId = new Map(a.paragrafen.map((x) => [x.id, x]));
        const ampeln = new Map<string, string>();
        for (const p of a.paragrafen) {
          ampeln.set(p.id, p.automatisch);
          if (!p.gruende.length) melde(`${lauf.name}: ${p.id} ohne Begründung`);
          if (p.automatisch === 'gruen') {
            if (p.offen.length) melde(`${lauf.name}: ${p.id} grün mit offenen Angaben ${p.offen.join(', ')}`);
            if (p.unsicher.length) melde(`${lauf.name}: ${p.id} grün mit unsicheren Angaben ${p.unsicher.join(', ')}`);
            // Fakten der Paragrafen, auf die verwiesen wird (eine Ebene) – für das Herabstufen über Verweise
            const ref = p.verwendet.filter((v) => v.startsWith('paragraf:')).flatMap((v) => nachId.get(v.slice(9))?.verwendet ?? []);
            gruen.push({ m, p, ref });
          }
        }
        ergebnisse.set(schluessel(m, Object.keys(lauf.werte)), ampeln);
      }
      gruenGesamt += gruen.length;
      // 1. Ergänzen fehlender Merkmale
      for (const { m, p } of gruen)
        for (const [name, werte] of Object.entries(lauf.werte)) {
          if (m[name]) continue;
          for (const w of werte) {
            if (!w) continue;
            const r = ergebnisse.get(schluessel({ ...m, [name]: w }, Object.keys(lauf.werte)))?.get(p.id);
            if (r === 'rot') melde(`${lauf.name}: ${p.id} grün ohne ${name}, aber rot mit ${name}=${w} (${JSON.stringify(m)})`);
          }
        }
      // 2. Herabstufen: Bleibt ein Paragraf grün, wenn ein Fakt nur Hinweis ist, dann muss er auch ohne diesen Fakt
      //    grün sein – sonst wurde der Hinweis wie eine gesicherte Angabe behandelt (je Paragraf und Fakt einmal)
      for (const { m, p, ref } of gruen) {
        for (const v of [...new Set([...p.verwendet, ...ref])]) {
          if (v.includes(':') || !lauf.fakten[v] || geprueftHerab.has(`${p.id}|${v}`)) continue;
          geprueftHerab.add(`${p.id}|${v}`);
          const alsHinweis = { ...lauf.fakten, [v]: { ...lauf.fakten[v], sicherheit: 'hinweis' as const, grund: 'Test' } };
          // „unbekannt“ ausdrücklich (leerer Wert von Hand) – sonst spränge eine Tabelle des Moduls mit anderem Wert ein
          const ohne = { ...lauf.fakten, [v]: { wert: null, herkunft: 'manuell' as const, sicherheit: 'sicher' as const } };
          const q1 = auswerten(eingabe(m, alsHinweis, lauf.texte)).paragrafen.find((x) => x.id === p.id)!;
          const q2 = auswerten(eingabe(m, ohne, lauf.texte)).paragrafen.find((x) => x.id === p.id)!;
          if (q1.automatisch === 'gruen' && q2.automatisch !== 'gruen') melde(`${lauf.name}: ${p.id} bleibt grün, obwohl „${v}“ nur Hinweis ist und ohne „${v}“ nicht grün wäre (${JSON.stringify(m)})`);
        }
      }
      // 3. Text geändert bzw. fehlt → nicht mehr grün (je Paragraf einmal)
      if (lauf.texte.size)
        for (const { m, p } of gruen) {
          const key = `${p.modul}/${p.norm}`;
          const regel = paket.regeln.get(key)!.at(-1)!.regel.paragrafen[p.paragraf];
          const fs = Object.keys(regel.stand ?? {})[0];
          if (!fs || geprueftText.has(p.id)) continue;
          geprueftText.add(p.id);
          const t = lauf.texte.get(key)!;
          const geaendert = new Map(lauf.texte).set(key, { ...t, fassung: { ...t.fassung!, summen: { ...t.fassung!.summen, [fs]: '00000000' } } });
          const ohne = new Map(lauf.texte);
          ohne.delete(key);
          for (const [art, texte] of [['geändert', geaendert], ['fehlt', ohne]] as const) {
            const q = auswerten(eingabe(m, lauf.fakten, texte)).paragrafen.find((x) => x.id === p.id)!;
            if (q.automatisch === 'gruen') melde(`${lauf.name}: ${p.id} bleibt grün, obwohl der Text ${art} (${JSON.stringify(m)})`);
          }
        }
    }
    expect(fehler).toEqual([]);
    // die Matrix erreicht tatsächlich grüne Pfade (sonst prüfte sie nichts)
    expect(gruenGesamt).toBeGreaterThan(1000);
    expect(geprueftHerab.size).toBeGreaterThan(20);
    expect(geprueftText.size).toBeGreaterThan(20);
  });

  it('was ohne jede Angabe grün ist, wird mit keinem vollständigen Satz von Fakten rot', () => {
    const leer = auswerten(eingabe({}));
    const mitJa = new Map(auswerten(eingabe({}, alleFakten('ja'))).paragrafen.map((p) => [p.id, p.automatisch]));
    const mitNein = new Map(auswerten(eingabe({}, alleFakten('nein'))).paragrafen.map((p) => [p.id, p.automatisch]));
    const rot = leer.paragrafen.filter((p) => p.automatisch === 'gruen' && (mitJa.get(p.id) === 'rot' || mitNein.get(p.id) === 'rot')).map((p) => p.id);
    expect(rot).toEqual([]);
  });
});

/* ---------- Fälle aus dem Fachreview: kein Grün, wo das Gesetz noch greift ---------- */

describe('Fälle aus dem Fachreview', () => {
  const a = (merkmale: Record<string, string>, fakten: Record<string, FaktWert> = {}) => {
    const r = auswerten(eingabe(merkmale, fakten, TEXTE));
    return (id: string) => {
      const p = r.paragrafen.find((x) => x.id === id);
      expect(p, id).toBeTruthy();
      return p!.ampel;
    };
  };
  const ja = (...ids: string[]) => Object.fromEntries(ids.map((i) => [i, sicher(true)]));
  const nein = (...ids: string[]) => Object.fromEntries(ids.map((i) => [i, sicher(false)]));

  it('Nutzungsänderung Büro → sechs Wohnungen (GK 4) und zu einer Gaststätte: Brandschutz der BauO NRW nicht „entfällt“', () => {
    const wohnen = a({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '4', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' });
    const gast = a({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3', Planungsrecht: 'Innenbereich', Verfahren: 'Baugenehmigungsverfahren', Sonderbau: 'ja' });
    for (const nr of ['5', '26', '28', '32', '34', '35', '36', '37', '38']) {
      expect(wohnen(`nw/bauo-nrw/${nr}`), `§ ${nr} (Wohnen)`).not.toBe('gruen');
      expect(gast(`nw/bauo-nrw/${nr}`), `§ ${nr} (Gaststätte)`).not.toBe('gruen');
    }
    // Gegenprobe: beim Neubau eines Einfamilienhauses GK 1 entfällt der notwendige Treppenraum
    expect(a({ Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' })('nw/bauo-nrw/35')).toBe('gruen');
  });

  it('Garage im Innenbereich: § 62 ist offen, solange das Verfahren nicht feststeht; „verfahrensfrei“ → gilt', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '1', Planungsrecht: 'Innenbereich', Sonderbau: 'nein' };
    expect(a(m)('nw/bauo-nrw/62')).toBe('gelb');
    expect(a({ ...m, Verfahren: 'verfahrensfrei' })('nw/bauo-nrw/62')).toBe('rot');
    expect(a({ ...m, Verfahren: 'vereinfachtes Verfahren' })('nw/bauo-nrw/62')).toBe('gruen');
  });

  it('einfacher Bebauungsplan bzw. Satzung im Außenbereich (§ 30 Abs. 3 mit § 35): Eingriffsregelung und Landschaftsrecht nicht „entfällt“', () => {
    for (const planung of ['einfacher Bebauungsplan', 'Satzung nach BauGB']) {
      const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3', Planungsrecht: planung, Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
      for (const f of [nein('planung.innen'), {}]) {
        const x = a(m, f);
        for (const id of ['bund/bnatschg/14', 'bund/bnatschg/15', 'nw/lnatschg/30', 'nw/lnatschg/31', 'nw/lnatschg/33']) expect(x(id), `${id} bei ${planung} ${JSON.stringify(f)}`).not.toBe('gruen');
      }
      // im Innenbereich-Teil (planung.innen = ja) entfällt die Eingriffsregelung
      expect(a(m, ja('planung.innen'))('bund/bnatschg/14')).toBe('gruen');
    }
    // qualifizierter Bebauungsplan: entfällt
    expect(a({ Vorhaben: 'Errichtung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3', Planungsrecht: 'Bebauungsplan', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' })('bund/bnatschg/14')).toBe('gruen');
  });

  it('Nutzungsänderung im Außenbereich: Eingriffsregelung, LNatSchG § 30 und Ziele der Raumordnung nicht „entfällt“', () => {
    const x = a({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3', Planungsrecht: 'Außenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' });
    for (const id of ['bund/bnatschg/14', 'nw/lnatschg/30', 'nw-05974/regionalplan/Ziele']) expect(x(id), id).not.toBe('gruen');
  });

  it('Stellplätze in Soest: § 7 StellplatzVO (Stellplätze für Menschen mit Behinderung) bleibt neben der Satzung', () => {
    const x = a({ Vorhaben: 'Errichtung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' });
    expect(x('nw/stellplatzvo/7')).toBe('rot');
    // was die Soester Satzung regelt, tritt zurück
    expect(x('nw/stellplatzvo/3')).toBe('gruen');
  });

  it('Aufstockung bzw. Nutzungsänderung eines Gebäudes mit mehr als drei Geschossen: Aufzugspflicht nicht „entfällt“', () => {
    for (const Vorhaben of ['Änderung', 'Nutzungsänderung']) {
      const x = a({ Vorhaben, Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '4', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' }, { 'nw.geschosse_oberirdisch': sicher(5), 'gebaeude.aufzug': sicher(false) });
      expect(x('nw/bauo-nrw/39'), Vorhaben).not.toBe('gruen');
    }
  });

  it('BauNVO im Bebauungsplan: alte oder unbekannte Fassung → nicht „entfällt“ (statische Verweisung)', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Bebauungsplan', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    const hinweis1990: FaktWert = { wert: '1990', herkunft: 'grz', sicherheit: 'hinweis', grund: 'aus dem Plandatum' };
    const faelle: Record<string, FaktWert>[] = [{}, { 'planung.baunvo': hinweis1990 }, { 'planung.baunvo': sicher('1977') }];
    for (const f of faelle) {
      const x = a(m, { 'planung.gebietsart': sicher('WA'), ...f });
      for (const id of ['bund/baunvo/25c', 'bund/baunvo/3', 'bund/baunvo/12']) expect(x(id), `${id} ${JSON.stringify(f)}`).not.toBe('gruen');
    }
    // geltende Fassung, gesichert: reines Wohngebiet entfällt im WA
    expect(a(m, { 'planung.gebietsart': sicher('WA'), 'planung.baunvo': sicher('aktuell') })('bund/baunvo/3')).toBe('gruen');
  });

  it('Befreiung im Innenbereich mit faktischem Baugebiet: § 31 BauGB nicht „entfällt“', () => {
    const x = a({ Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' }, { 'planung.befreiung': sicher(true), 'planung.gebietsart': sicher('WA') });
    expect(x('bund/baugb/31')).not.toBe('gruen');
  });

  it('neue Zufahrt zu einer Kreisstraße außerorts, Gebäude weiter als 40 m entfernt: § 25 StrWG NRW nicht „entfällt“', () => {
    const x = a({ Vorhaben: 'Errichtung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3', Planungsrecht: 'Außenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' }, { 'lage.strasse_ausserorts': sicher(false), 'lage.zufahrt_neu': sicher(true), 'lage.zufahrt_klassifiziert': sicher(true) });
    expect(x('nw/strwg/25')).toBe('rot');
  });

  it('Runde 2: „Plan in Aufstellung“ allein macht Natura 2000 und Eingriffsregelung nicht „entfällt“ – erst die Planreife', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3', Planungsrecht: 'Außenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    const x = a(m, { ...ja('planung.planaufstellung', 'schutz.ffh') });
    for (const id of ['bund/bnatschg/14', 'bund/bnatschg/15', 'bund/bnatschg/34', 'nw/lnatschg/30', 'nw/lnatschg/31', 'nw/lnatschg/33']) expect(x(id), id).not.toBe('gruen');
    // Planreife gesichert: Eingriffsregelung entfällt (§ 18 Abs. 2)
    expect(a(m, { ...ja('planung.planaufstellung', 'planung.planreife') })('bund/bnatschg/14')).toBe('gruen');
  });

  it('Runde 2: Zufahrt zu Kreisstraße außerorts (§ 20 StrWG) und bestehender Anschluss bei Nutzungsänderung (§ 25)', () => {
    const m = { Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3', Planungsrecht: 'Außenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    expect(a(m, { ...nein('lage.strasse_ausserorts'), ...ja('lage.zufahrt_neu', 'lage.zufahrt_klassifiziert') })('nw/strwg/20')).toBe('rot');
    expect(a(m, { ...nein('lage.strasse_ausserorts', 'lage.zufahrt_neu'), ...ja('lage.anschluss_klassifiziert') })('nw/strwg/25')).toBe('rot');
  });

  it('Runde 2: Satzung nach BauGB mit Innenbereich-Teil wie § 34 (Befreiung, Nebenanlagen, Benehmen)', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Satzung nach BauGB', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    const x = a(m, { ...ja('planung.innen', 'planung.befreiung', 'vorhaben.nebenanlage'), 'planung.gebietsart': sicher('WA') });
    for (const id of ['bund/baugb/31', 'bund/baunvo/14', 'bund/bnatschg/18']) expect(x(id), id).not.toBe('gruen');
  });

  it('Runde 2: Stellplätze auch für Anlagen, die keine Gebäude sind; § 9 auch bei „verfahrensfrei“', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'kein Gebäude', Gebäudeklasse: '1', Planungsrecht: 'Außenbereich', Verfahren: 'verfahrensfrei', Sonderbau: 'nein' };
    const x = a(m);
    for (const nr of ['1', '2', '3']) expect(x(`nw/stellplatzvo/${nr}`), `§ ${nr}`).not.toBe('gruen');
    // in einer Gemeinde ohne Stellplatzsatzung (Kreis Soest, kein Gemeindemodul) gilt § 9 auch bei „verfahrensfrei“
    const ohne = auswerten({ ...eingabe(m, {}, TEXTE), module: aktiveModule(paket.module, '05974999'), fakten: { 'lage.ags': sicher('05974999') } });
    expect(ohne.paragrafen.find((p) => p.id === 'nw/stellplatzvo/9')!.ampel).toBe('rot');
  });

  it('Runde 2: Dachgeschossausbau als Nutzungsänderung in der Altstadt – Gauben, Abweichung und Beirat nicht „entfällt“', () => {
    const x = a({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' }, { ...ja('soest.dachaufbauten', 'planung.abweichung', 'soest.altstadt') });
    for (const id of ['nw-05974040/altstadtsatzung/5', 'nw-05974040/altstadtsatzung/17', 'nw-05974040/altstadtsatzung/18']) expect(x(id), id).not.toBe('gruen');
  });

  it('Runde 2: engere Umgebung eines Denkmalbereichs → DSchG nicht „entfällt“', () => {
    const x = a({ Vorhaben: 'Errichtung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '4', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' }, { ...nein('schutz.denkmal', 'schutz.denkmal_umgebung', 'schutz.denkmalbereich'), ...ja('schutz.denkmalbereich_umgebung') });
    expect(x('nw/dschg/9')).toBe('rot');
  });

  it('Runde 2: Merkmal „Innenbereich“ gegen Bebauungsplan bzw. Landschaftsplan aus den Geodaten → nicht „entfällt“', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    const w = widersprueche(m, null, { ...ja('schutz.landschaftsplan') });
    const r = auswerten({ ...eingabe(m, ja('schutz.landschaftsplan'), TEXTE), widersprueche: w.merkmale });
    expect(r.paragrafen.find((p) => p.id === 'nw/lnatschg/7')!.ampel).not.toBe('gruen');
    expect(w.texte[0]).toMatch(/Landschaftsplan/);
  });

  it('Runde 2: Krankenhaus (Sonderbau) – zusätzliche Bauvorlagen nicht „entfällt“; Nachbarrecht nie „gilt“', () => {
    const x = a({ Vorhaben: 'Errichtung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '5', Planungsrecht: 'Bebauungsplan', Verfahren: 'Baugenehmigungsverfahren', Sonderbau: 'ja' }, { 'gebaeude.besucher': sicher(50), 'gebaeude.gastbetten': sicher(0), 'gebaeude.verkaufsflaeche': sicher(0), 'gebaeude.garage_nutzflaeche': sicher(0), ...nein('nw.elt_betriebsraum') });
    expect(x('nw/baupruefvo/12')).not.toBe('gruen');
    const n = auswerten(eingabe({ Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus' }, ja('nw.grenzabstand_unter_2_5'), TEXTE));
    expect(n.paragrafen.filter((p) => p.norm === 'nachbg').every((p) => p.ampel !== 'rot')).toBe(true);
  });

  /* ---------- Runde 3 ---------- */

  const zahl = (id: string, w: number) => ({ [id]: sicher(w) });
  /** Auswertung in einer anderen Gemeinde des Kreises (ohne Gemeindemodul) */
  const inGemeinde = (ags: string, merkmale: Record<string, string>, fakten: Record<string, FaktWert> = {}) => {
    const r = auswerten({ ...eingabe(merkmale, fakten, TEXTE), module: aktiveModule(paket.module, ags), fakten: { 'lage.ags': sicher(ags), ...fakten } });
    return (id: string) => r.paragrafen.find((x) => x.id === id)!;
  };

  it('Runde 3: Anlagen, die keine Gebäude sind (Mobilfunkmast, Silo, Stützmauer) – bautechnische Nachweise und Brandschutz nicht „gilt nicht“', () => {
    for (const Planungsrecht of ['Außenbereich', 'Innenbereich']) {
      const x = a({ Vorhaben: 'Errichtung', Gebäudeart: 'kein Gebäude', Planungsrecht, Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' });
      for (const id of ['nw/bauo-nrw/68', 'nw/bauo-nrw/14', 'nw/baupruefvo/8', 'nw/svvo/12']) expect(x(id), `${id} (${Planungsrecht})`).toBe('rot');
      for (const id of ['nw/bauo-nrw/45', 'nw/bauo-nrw/8']) expect(x(id), `${id} (${Planungsrecht})`).not.toBe('gruen');
    }
    // verfahrensfrei: keine bautechnischen Nachweise (§ 68 Abs. 1 Satz 2)
    expect(a({ Vorhaben: 'Errichtung', Gebäudeart: 'kein Gebäude', Planungsrecht: 'Innenbereich', Verfahren: 'verfahrensfrei', Sonderbau: 'nein' })('nw/bauo-nrw/68')).toBe('gruen');
  });

  it('Runde 3: verfahrensfreie Maßnahme nur in der engeren Umgebung eines Denkmalbereichs – Erlaubnis nach § 24 DSchG gesondert beantragen', () => {
    const m = { Vorhaben: 'Änderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3', Planungsrecht: 'Innenbereich', Verfahren: 'verfahrensfrei', Sonderbau: 'nein' };
    const f = { ...nein('schutz.denkmal', 'schutz.denkmal_umgebung', 'schutz.denkmalbereich', 'schutz.bodendenkmal', 'schutz.gartendenkmal'), ...ja('schutz.denkmalbereich_umgebung') };
    const x = a(m, f);
    for (const id of ['nw/dschg/9', 'nw/dschg/10', 'nw/dschg/24']) expect(x(id), id).toBe('rot');
    // Gartendenkmal allein: § 13 und § 24
    const g = a(m, { ...nein('schutz.denkmal', 'schutz.denkmal_umgebung', 'schutz.denkmalbereich', 'schutz.denkmalbereich_umgebung', 'schutz.bodendenkmal'), ...ja('schutz.gartendenkmal') });
    expect(g('nw/dschg/13')).toBe('rot');
    expect(g('nw/dschg/24')).toBe('rot');
    // ohne jeden Denkmalbezug entfällt § 24
    expect(a(m, nein('schutz.denkmal', 'schutz.denkmal_umgebung', 'schutz.denkmalbereich', 'schutz.denkmalbereich_umgebung', 'schutz.bodendenkmal', 'schutz.gartendenkmal'))('nw/dschg/24')).toBe('gruen');
  });

  it('Runde 3: Wohn- und Geschäftshaus in der Soester Altstadt als „Mehrfamilienhaus“ – GEG für Nichtwohnteile, Schaufenster und Vordächer', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '4', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    const basis = ja('soest.altstadt', 'gebaeude.beheizt');
    const x = a(m, { ...basis, ...ja('gebaeude.gemischt', 'soest.schaufenster', 'soest.vordach') });
    for (const id of ['bund/geg/18', 'bund/geg/19', 'bund/geg/106', 'nw-05974040/altstadtsatzung/8', 'nw-05974040/altstadtsatzung/9']) expect(x(id), id).toBe('rot');
    // nicht angegeben: nicht „entfällt“
    const offen = a(m, basis);
    for (const id of ['bund/geg/18', 'bund/geg/19', 'nw-05974040/altstadtsatzung/8', 'nw-05974040/altstadtsatzung/9']) expect(offen(id), `${id} ohne Angabe`).not.toBe('gruen');
    // umgekehrt: Nichtwohngebäude mit Wohnungen → §§ 15, 16
    const nwg = a({ ...m, Gebäudeart: 'Nichtwohngebäude' }, { ...basis, ...ja('gebaeude.gemischt') });
    for (const id of ['bund/geg/15', 'bund/geg/16']) expect(nwg(id), id).toBe('rot');
    // Gegenprobe: reines Wohngebäude ohne Schaufenster und Vordach
    const rein = a(m, { ...basis, ...nein('gebaeude.gemischt', 'soest.schaufenster', 'soest.vordach') });
    for (const id of ['bund/geg/18', 'nw-05974040/altstadtsatzung/8', 'nw-05974040/altstadtsatzung/9']) expect(rein(id), id).toBe('gruen');
  });

  it('Runde 3: Naturdenkmal der Kreisverordnung – Befreiung nach § 67 BNatSchG und § 75 LNatSchG nicht „gilt nicht“', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    const sonst = nein('schutz.nsg', 'schutz.lsg', 'schutz.biotop', 'schutz.landschaftsplan', 'schutz.baum');
    const x = a(m, { ...sonst, ...ja('kreis_soest.naturdenkmal') });
    for (const id of ['bund/bnatschg/67', 'nw/lnatschg/75', 'nw-05974/nd_vo_innen/4']) expect(x(id), id).toBe('rot');
    // Naturdenkmal nicht angegeben bzw. geschützte Bäume: nicht „gilt nicht“
    expect(a(m, sonst)('bund/bnatschg/67')).not.toBe('gruen');
    expect(a(m, { ...sonst, ...nein('schutz.naturdenkmal'), ...ja('schutz.baum') })('bund/bnatschg/67')).not.toBe('gruen');
    // Gegenprobe: nichts geschützt
    expect(a(m, { ...sonst, ...nein('schutz.naturdenkmal') })('bund/bnatschg/67')).toBe('gruen');
  });

  it('Runde 3: Stellplatzanlage mit 40 notwendigen Stellplätzen für einen Markt („kein Gebäude“) – PV-Pflicht nach SAN-VO', () => {
    const x = a({ Vorhaben: 'Errichtung', Gebäudeart: 'kein Gebäude', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' }, zahl('nw.stellplatzflaeche', 40));
    for (const id of ['nw/san-vo/1', 'nw/san-vo/6', 'nw/san-vo/7']) expect(x(id), id).toBe('rot');
  });

  it('Runde 3: Nutzungsänderung (Scheune zu Wohnhaus im Außenbereich, Hinterhaus zu Wohnung) – § 4 BauO NRW nicht „gilt nicht“', () => {
    const scheune = a({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Außenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' });
    const hinterhaus = a({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' });
    expect(scheune('nw/bauo-nrw/4')).not.toBe('gruen');
    expect(hinterhaus('nw/bauo-nrw/4')).not.toBe('gruen');
  });

  it('Runde 3: Neubau mit Gasheizung – §§ 42, 43 GEG über § 10 Abs. 2 Nr. 3', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    const x = a(m, { ...ja('gebaeude.beheizt', 'vorhaben.heizung', 'technik.heizung_fossil'), ...nein('technik.solarthermie', 'technik.biomasse', 'technik.stromdirekt') });
    expect(x('bund/geg/42')).toBe('rot');
    expect(x('bund/geg/43')).toBe('rot');
    // Heizungsart nicht angegeben: nicht „entfällt“
    expect(a(m, ja('gebaeude.beheizt', 'vorhaben.heizung'))('bund/geg/43')).not.toBe('gruen');
    // Stromdirektheizung im Bestand mit Wohnungen: § 46
    expect(a({ ...m, Vorhaben: 'Änderung' }, ja('gebaeude.beheizt', 'vorhaben.heizung', 'technik.stromdirekt'))('bund/geg/46')).toBe('rot');
  });

  it('Runde 3: Außenbereich mit planreifem Bebauungsplan (§ 33 BauGB) – die BauNVO entfällt nicht mit der Norm', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Außenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    const r = auswerten(eingabe(m, { ...ja('planung.planaufstellung', 'planung.planreife'), 'planung.gebietsart': sicher('WA'), 'planung.baunvo': sicher('aktuell') }, TEXTE));
    const baunvo = r.paragrafen.filter((p) => p.norm === 'baunvo');
    expect(baunvo.filter((p) => p.gruende.some((g) => g.startsWith('Entfällt mit der Norm'))).map((p) => p.id)).toEqual([]);
    expect(baunvo.find((p) => p.paragraf === '4')!.ampel).toBe('rot');
    // Planreife noch offen: nicht „entfällt“
    const offen = auswerten(eingabe(m, { ...ja('planung.planaufstellung'), 'planung.gebietsart': sicher('WA') }, TEXTE));
    expect(offen.paragrafen.find((p) => p.id === 'bund/baunvo/4')!.ampel).not.toBe('gruen');
  });

  it('Runde 3: Zurückstellung (§ 15 BauGB) – „nicht beantragt“ trägt kein Grün, solange ein Plan aufgestellt wird; Abs. 3 beim Flächennutzungsplan', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3', Planungsrecht: 'Außenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    expect(a(m, { ...ja('planung.planaufstellung'), ...nein('planung.zurueckstellung', 'planung.planreife') })('bund/baugb/15')).toBe('gelb');
    expect(a(m, { ...nein('planung.planaufstellung'), ...ja('planung.fnp_verfahren') })('bund/baugb/15')).not.toBe('gruen');
    expect(a(m, { ...nein('planung.planaufstellung'), ...ja('planung.fnp_verfahren', 'planung.zurueckstellung') })('bund/baugb/15')).toBe('rot');
    expect(a(m, nein('planung.planaufstellung', 'planung.fnp_verfahren'))('bund/baugb/15')).toBe('gruen');
  });

  it('Runde 3: Landschaftsplan III in Lippetal im qualifizierten Bebauungsplan – nicht „entfällt mit der Norm“, solange offen ist, ob er sich darauf erstreckt', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Bebauungsplan', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    const lp = { 'kreis_soest.landschaftsplan': sicher('III') };
    for (const nr of ['C.1', 'C.2', 'C.3', 'C.4']) {
      const p = inGemeinde('05974024', m, lp)(`nw-05974/lp_iii/${nr}`);
      expect(p.ampel, nr).not.toBe('gruen');
      expect(p.gruende.join(' '), nr).not.toMatch(/Entfällt mit der Norm/);
    }
    // erstreckt sich nach Auskunft nicht auf den Plan: entfällt
    expect(inGemeinde('05974024', m, { ...lp, ...nein('schutz.landschaftsplan') })('nw-05974/lp_iii/C.2').gruende.join(' ')).toMatch(/Entfällt mit der Norm/);
    // Satzung nach § 34 Abs. 4 BauGB mit Innenbereich-Teil ebenso
    expect(inGemeinde('05974024', { ...m, Planungsrecht: 'Satzung nach BauGB' }, { ...lp, ...ja('planung.innen') })('nw-05974/lp_iii/C.2').ampel).not.toBe('gruen');
  });

  it('Runde 3: Büro zu sechs Wohnungen – Spielplatzsatzung nicht „entfällt“ (§ 8 Abs. 2 Satz 3 BauO NRW)', () => {
    const x = a({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' }, zahl('gebaeude.wohnungen', 6));
    for (const nr of ['1', '2', '3', '4']) expect(x(`nw-05974040/spielplatzsatzung/${nr}`), `§ ${nr}`).not.toBe('gruen');
  });

  it('Runde 3: Stellplätze auf dem Grundstück, keine am Gebäude – BauNVO §§ 12, 21a und SBauVO § 121 nicht „gilt nicht“', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3', Planungsrecht: 'Bebauungsplan', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    const plan = { 'planung.gebietsart': sicher('WA'), 'planung.baunvo': sicher('aktuell'), ...zahl('gebaeude.stellplaetze', 0), ...zahl('gebaeude.garage_nutzflaeche', 0) };
    const x = a(m, { ...plan, ...ja('vorhaben.stellplaetze_grundstueck') });
    for (const id of ['bund/baunvo/12', 'bund/baunvo/21a', 'nw/sbauvo/121']) expect(x(id), id).toBe('rot');
    const offen = a(m, plan);
    for (const id of ['bund/baunvo/12', 'nw/sbauvo/121']) expect(offen(id), `${id} ohne Angabe`).not.toBe('gruen');
  });

  it('Runde 3: Abweichung nur von der Altstadt- bzw. Werbeanlagensatzung – §§ 16–18 und § 9 nicht „entfällt“', () => {
    const x = a({ Vorhaben: 'Änderung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' }, { ...ja('soest.altstadt', 'ortsrecht.abweichung', 'vorhaben.werbeanlage'), ...nein('planung.abweichung') });
    for (const id of ['nw-05974040/altstadtsatzung/16', 'nw-05974040/altstadtsatzung/17', 'nw-05974040/altstadtsatzung/18', 'nw-05974040/werbeanlagen_altstadt/9', 'nw/bauo-nrw/69']) expect(x(id), id).toBe('rot');
  });

  it('Runde 3: Pension mit acht Gastbetten – Rauchwarnmelder je Beherbergungsraum (§ 47 Satz 2, § 55 Abs. 2 SBauVO)', () => {
    const x = a({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '2', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' }, zahl('gebaeude.gastbetten', 8));
    expect(x('nw/sbauvo/47')).toBe('rot');
    expect(x('nw/sbauvo/55')).toBe('rot');
  });

  it('Runde 3: Änderung der Außenbauteile nach § 36 GEG – Erfüllungserklärung und Energieausweis nicht „gilt nicht“', () => {
    const x = a({ Vorhaben: 'Änderung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' }, { ...ja('gebaeude.beheizt', 'vorhaben.aussenbauteile'), ...nein('vorhaben.erweiterung_beheizt', 'vorhaben.heizung') });
    expect(x('bund/geg/36')).toBe('rot');
    expect(x('bund/geg/92')).not.toBe('gruen');
    expect(x('bund/geg/80')).not.toBe('gruen');
  });

  it('Runde 3: Altenteilerhaus am Stall mit 2,50 m Grenzabstand – Brandwand nach § 30 Abs. 2 Nr. 4 BauO NRW', () => {
    const x = a({ Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Außenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' }, { ...nein('nw.grenzabstand_unter_2_5', 'gebaeude.landwirtschaft'), ...ja('nw.landwirtschaft_angebaut') });
    expect(x('nw/bauo-nrw/30')).toBe('rot');
  });

  it('Runde 3: neu aufgenommene Vorschriften (Umlegung, Gartendenkmal, Energieausweis, Gehölzschnitt, Nutzungsänderungsanzeige)', () => {
    const m = { Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    const x = a(m, ja('planung.umlegung', 'gebaeude.beheizt', 'vorhaben.baeume_faellen'));
    for (const id of ['bund/baugb/51', 'bund/geg/80', 'bund/bnatschg/39']) expect(x(id), id).toBe('rot');
    const anzeige = a({ ...m, Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Nichtwohngebäude', Verfahren: 'Baugenehmigungsverfahren' }, ja('vorhaben.nutzung_befristet'));
    expect(anzeige('nw/bauo-nrw/64')).toBe('rot');
  });
});


describe('Werkzeuge', () => {
  it('Quellen ohne Fassungsdatum (gii, Datei ohne Satzungsdatum) melden keine „neue Fassung ab heute“', () => {
    const datei = { art: 'datei' as const, url: 'https://example.org/s.pdf', format: 'pdf' as const };
    expect(ohneFassungsdatum(datei, { fassung: 'Datei vom 12.11.2026' })).toBe(true);
    expect(ohneFassungsdatum(datei, { fassung: 'vom 14.11.2023' })).toBe(false);
    expect(ohneFassungsdatum({ art: 'gii', pfad: 'fstrg' }, { fassung: 'Stand 30.07.2026' })).toBe(true);
    expect(ohneFassungsdatum({ art: 'ris', eli: 'eli/bund/x' }, { fassung: 'gültig ab 01.01.2026' })).toBe(false);
  });
});
