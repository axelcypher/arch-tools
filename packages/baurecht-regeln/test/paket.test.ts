/**
 * Prüfungen über das ganze Regelpaket: Format, bekannte Fakten/Merkmale/Bausteine/Verweise, Prüfsummen eingetragen,
 * und eine Fallmatrix, die jede Regel mit allen Kombinationen der Merkmale (auch „nicht festgelegt“) auswertet.
 */
import { describe, expect, it } from 'vitest';
import type { AuswertungsEingabe } from '@core/baurecht/auswertung';
import type { TextStand } from '@core/baurecht/auswertung';
import { auswerten, faktDefinitionen } from '@core/baurecht/auswertung';
import { werten } from '@core/baurecht/kurz';
import { frageGestellt, RUECKFRAGE_IDS } from '@core/baurecht/fragen';
import { aktiveModule, paketPruefen } from '@core/baurecht/paket';
import { widersprueche } from '@core/baurecht/projekt';
import type { FaktWert, ParagrafErgebnis } from '@core/baurecht/typen';
import type { Fassung } from '@core/recht/typen';
import { VORGABE_MERKMALE } from '@core/bedingung';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { ohneFassungsdatum, paketLaden, WURZEL } from './laden';

const paket = paketLaden();
const SOEST = '05974040';

describe('Rückfragen des Kerns', () => {
  it('jede Kennung in RUECKFRAGEN gibt es im Paket (sonst kippte die Rückfrage still auf „gestellt, solange nicht nein“)', () => {
    const defs = faktDefinitionen(paket.module);
    for (const id of RUECKFRAGE_IDS) expect(defs[id], id).toBeDefined();
  });
});

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

  it('jede Regel hat einen kurzen Titel wie im Gesetz (auch ohne abgerufenen Text lesbar)', () => {
    const probleme: string[] = [];
    for (const [key, l] of paket.regeln)
      for (const { regel } of l)
        for (const [nr, r] of Object.entries(regel.paragrafen)) {
          const t = r.titel?.trim() ?? '';
          // zusammengezogene Wörter aus Zeilenumbrüchen der Quelle („undBauvorlagen“); Abkürzungen wie „BauGB“ zählen nicht
          const verklebt = t.split(/\s+/).some((w) => (w.match(/[A-ZÄÖÜ]/g) ?? []).length === 1 && /[a-zäöüß][A-ZÄÖÜ]/.test(w));
          if (!t || t.length > 120 || /\(zu §/.test(t) || verklebt) probleme.push(`${key} § ${nr}: „${t}“`);
        }
    expect(probleme).toEqual([]);
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
            // nur, was die Prüfungen unten brauchen (die vollen Ergebnisse aller grünen Pfade sprengten den Speicher)
            gruen.push({ m, p: { id: p.id, modul: p.modul, norm: p.norm, paragraf: p.paragraf, verwendet: p.verwendet } as ParagrafErgebnis, ref });
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

/* ---------- Fragen und Regeln: was nicht gefragt wird, entscheidet nichts ---------- */

/**
 * Eine Angabe, deren Frage die App nicht stellt (frageGestellt – dasselbe Kriterium wie Kern und App: Bedingung „nein“,
 * bei Rückfragen auch „offen“), darf keinen Paragrafen gelb machen,
 * keinen Paragrafen ändern und nicht unter „klärt am meisten“ stehen – sonst fehlt dem Anwender eine Frage, die er
 * nicht beantworten kann. Geprüft an Grundfällen (vollständige, plausible Angaben je Merkmalskombination und Gemeinde):
 * Angaben mit nicht gestellter Frage werden entfernt (so lange, bis sich nichts mehr ändert) und das Ergebnis verglichen.
 */
describe('Fragen und Regeln', () => {
  const grund = (): Record<string, FaktWert['wert']> => {
    const defs = faktDefinitionen(aktiveModule(paket.module, SOEST));
    const f: Record<string, FaktWert['wert']> = {};
    // abgeleitete Angaben (Tabellen der Module, Stellplatzregeln der Satzung) liefern die Module selbst
    for (const [id, d] of Object.entries(defs)) if (d.typ === 'janein' && !d.nach && d.wert === undefined) f[id] = false;
    return {
      ...f,
      'gebaeude.beheizt': true, 'gebaeude.aufenthaltsraeume': true, 'gebaeude.freistehend': true, 'vorhaben.erdarbeiten': true,
      'vorhaben.entwaesserung': true, 'vorhaben.stellplaetze_grundstueck': true, 'technik.waermepumpe': true, 'vorhaben.heizung': true,
      'gebaeude.wohnungen': 1, 'gebaeude.nutzungseinheiten': 1, 'gebaeude.hoehe': 6.5, 'gebaeude.bgf': 200, 'gebaeude.bri': 700,
      'gebaeude.nutzflaeche': 150, 'gebaeude.besucher': 0, 'gebaeude.gastbetten': 0, 'gebaeude.verkaufsflaeche': 0,
      'gebaeude.garage_nutzflaeche': 30, 'gebaeude.stellplaetze': 2, 'nw.geschosse_oberirdisch': 2, 'nw.stellplatzflaeche': 0,
      'lage.erdbebenzone': '0', 'planung.gebietsart': 'WA', 'planung.baunvo': 'aktuell', 'nw.nachbarrecht': 'geklärt',
      'soest.stellplatzzone': '3', 'kreis_soest.hsg_qualitativ': 'außerhalb', 'kreis_soest.hsg_quantitativ': 'außerhalb',
    };
  };
  const lauf = (ags: string, m: Record<string, string>, f: Record<string, FaktWert['wert']>) =>
    auswerten({
      paket,
      module: aktiveModule(paket.module, ags),
      merkmale: m,
      fakten: { 'lage.ags': sicher(ags), ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, sicher(v)])) },
      einreichung: '2026-12-01',
      heute: HEUTE,
      texte: TEXTE,
      festlegungen: {},
    });
  const UMFAENGE = ['vollständiger Abbruch ohne Ersatzbau', 'Teilabbruch', 'Abbruch mit Ersatzbau'];
  // Grundfälle: Merkmale × Gemeinde × Lage (ohne bzw. mit Schutzgebieten, Planaufstellung und Altstadt)
  const LAGEN: Record<string, Record<string, FaktWert['wert']>> = {
    ohne: {},
    schutz: { 'schutz.wsg': true, 'schutz.vsg': true, 'schutz.ffh': true, 'planung.planaufstellung': true, 'planung.planreife': true, 'soest.altstadt': true, 'soest.denkmalbereich': true, 'schutz.denkmalbereich': true },
    // ohne neue Heizung, ohne Aufenthaltsräume, mehrere Nutzungseinheiten und viele Stellplätze
    anders: { 'vorhaben.heizung': false, 'gebaeude.aufenthaltsraeume': false, 'vorhaben.entwaesserung': false, 'gebaeude.nutzungseinheiten': 3, 'gebaeude.stellplaetze': 40, 'nw.stellplatzflaeche': 40, 'planung.planaufstellung': true },
  };
  const faelle: { name: string; ags: string; m: Record<string, string>; f: Record<string, FaktWert['wert']> }[] = [];
  for (const ags of [SOEST, '05974052', '05974008'])
    for (const [lage, extra] of Object.entries(LAGEN))
      for (const v of ['Errichtung', 'Änderung', 'Nutzungsänderung', ...UMFAENGE])
        for (const art of ['Einfamilienhaus', 'Mehrfamilienhaus', 'Nichtwohngebäude', 'kein Gebäude'])
          for (const p of ['Bebauungsplan', 'einfacher Bebauungsplan', 'Innenbereich', 'Außenbereich'])
            for (const vf of ['vereinfachtes Verfahren', 'verfahrensfrei']) {
              const bes = UMFAENGE.includes(v);
              const m: Record<string, string> = { Vorhaben: bes ? 'Beseitigung' : v, Gebäudeart: art, Planungsrecht: p, Verfahren: vf, Sonderbau: 'nein' };
              if (art !== 'kein Gebäude') m.Gebäudeklasse = art === 'Mehrfamilienhaus' ? '4' : '1';
              const f = { ...grund(), ...extra, ...(bes ? { 'vorhaben.beseitigung_umfang': v, 'nw.altbau_verfahrensfrei': true, 'nw.beseitigung_mit_beantragt': false } : {}) };
              if (art === 'Mehrfamilienhaus') Object.assign(f, { 'gebaeude.wohnungen': 8, 'gebaeude.nutzungseinheiten': 8, 'gebaeude.hoehe': 11, 'nw.geschosse_oberirdisch': 4, 'gebaeude.stellplaetze': 8 });
              if (art === 'kein Gebäude') Object.assign(f, { 'gebaeude.aufenthaltsraeume': false, 'gebaeude.beheizt': false, 'vorhaben.entwaesserung': false, 'vorhaben.heizung': false, 'gebaeude.wohnungen': 0 });
              // ein Nichtwohngebäude ohne Wohnung (Laden, Büro) – sonst blieben Fragen unentdeckt, die nur mit Wohnung gestellt werden
              if (art === 'Nichtwohngebäude') Object.assign(f, { 'gebaeude.wohnungen': 0 });
              faelle.push({ name: `${ags} ${lage} ${v} ${art} ${p} ${vf}`, ags, m, f });
            }

  it('§ 47 Abs. 6 BauO NRW: Nutzungsänderung eines Nichtwohngebäudes ohne Wohnung – keine „Ausnahme möglich“ über die nicht gestellte Umnutzung', () => {
    const m = { Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein' };
    const r = lauf(SOEST, m, { ...grund(), 'gebaeude.wohnungen': 0, 'gebaeude.nutzungseinheiten': 3 });
    for (const id of ['nw/bauo-nrw/29', 'nw/bauo-nrw/34', 'nw/bauo-nrw/36']) {
      const p = r.paragrafen.find((x) => x.id === id)!;
      expect(p.offen, id).not.toContain('nw.umnutzung_wohnraum');
      expect(p.hinweise.join(' '), id).not.toMatch(/Ausnahme möglich.*Umnutzung/);
    }
    // mit Wohnung: die Frage wird gestellt, „ja“ lässt §§ 34, 36 entfallen
    const mitWohnung = lauf(SOEST, m, { ...grund(), 'gebaeude.wohnungen': 2, 'gebaeude.nutzungseinheiten': 3, 'nw.umnutzung_wohnraum': true });
    for (const id of ['nw/bauo-nrw/34', 'nw/bauo-nrw/36']) expect(mitWohnung.paragrafen.find((x) => x.id === id)!.ampel, id).toBe('gruen');
  });

  it('eine Angabe, deren Frage nicht gestellt wird, ändert keinen Paragrafen und steht nicht unter „klärt am meisten“', { timeout: 600000 }, () => {
    const fehler = new Set<string>();
    const melde = (t: string) => {
      if (fehler.size < 60) fehler.add(t);
    };
    for (const fall of faelle) {
      const defs = faktDefinitionen(aktiveModule(paket.module, fall.ags));
      const basis = lauf(fall.ags, fall.m, fall.f);
      // Angaben mit nicht gestellter Frage entfernen – bis sich nichts mehr ändert (eine Antwort kann eine Frage verbergen)
      const f = { ...fall.f };
      let r = basis;
      for (let runde = 0; runde < 6; runde++) {
        const weg = Object.keys(f).filter((id) => !frageGestellt(id, defs[id], r.kontext));
        if (!weg.length) break;
        for (const id of weg) delete f[id];
        r = lauf(fall.ags, fall.m, f);
      }
      const verborgen = (id: string) => !frageGestellt(id, defs[id], r.kontext);
      const vorher = new Map(basis.paragrafen.map((p) => [p.id, p.automatisch]));
      for (const p of r.paragrafen) {
        if (vorher.get(p.id) !== p.automatisch) melde(`${p.id}: ${vorher.get(p.id)} → ${p.automatisch} ohne nicht gestellte Angaben (${fall.name})`);
        const v = p.offen.filter(verborgen);
        if (v.length) melde(`${p.id}: offen wegen nicht gestellter Frage ${v.join(', ')} (${fall.name})`);
      }
      const k = r.klaerung.filter((x) => verborgen(x.id));
      if (k.length) melde(`„Klärt am meisten“ nennt nicht gestellte Fragen ${k.map((x) => x.id).join(', ')} (${fall.name})`);
    }
    expect([...fehler]).toEqual([]);
    expect(faelle.length).toBeGreaterThan(500);
  });

  it('je gestellte Angabe einzeln offen: keine nicht gestellte Frage unter „es fehlt“, in `klaerend` oder „klärt am meisten“', { timeout: 900000 }, () => {
    const fehler = new Set<string>();
    const melde = (t: string) => {
      if (fehler.size < 60) fehler.add(t);
    };
    // Auswahl der Grundfälle (Soest, ohne Schutzgebiete, Innenbereich; jedes Vorhaben, Gebäudearten ohne das
    // Mehrfamilienhaus) – dazu bei der
    // Beseitigung der Altbau „nein“ und der Umfang offen (die Grundfälle oben setzen den Altbau immer auf „ja“)
    const auswahl: typeof faelle = [];
    for (const fall of faelle) {
      if (fall.ags !== SOEST || !fall.name.includes(' ohne ') || fall.m.Planungsrecht !== 'Innenbereich' || fall.m.Verfahren !== 'vereinfachtes Verfahren' || fall.m.Gebäudeart === 'Mehrfamilienhaus') continue;
      auswahl.push(fall);
      if (fall.m.Vorhaben === 'Beseitigung') {
        auswahl.push({ ...fall, name: `${fall.name} Altbau nein`, f: { ...fall.f, 'nw.altbau_verfahrensfrei': false } });
        const { 'vorhaben.beseitigung_umfang': _u, ...ohneUmfang } = fall.f;
        auswahl.push({ ...fall, name: `${fall.name} Umfang offen`, f: ohneUmfang });
      }
    }
    for (const fall of auswahl) {
      const defs = faktDefinitionen(aktiveModule(paket.module, fall.ags));
      // Angaben mit nicht gestellter Frage entfernen (wie im Fall oben)
      const f = { ...fall.f };
      let r = lauf(fall.ags, fall.m, f);
      for (let runde = 0; runde < 6; runde++) {
        const weg = Object.keys(f).filter((id) => !frageGestellt(id, defs[id], r.kontext));
        if (!weg.length) break;
        for (const id of weg) delete f[id];
        r = lauf(fall.ags, fall.m, f);
      }
      // nur Angaben, an denen eine Regel hängt
      const verwendet = new Set(r.paragrafen.flatMap((p) => p.verwendet));
      for (const id of Object.keys(f).filter((x) => verwendet.has(x))) {
        const { [id]: _w, ...ohne } = f;
        const r2 = lauf(fall.ags, fall.m, ohne);
        const verborgen = (x: string) => !frageGestellt(x, defs[x], r2.kontext);
        for (const p of r2.paragrafen) {
          const v = [...p.offen, ...(p.klaerend ?? [])].filter(verborgen);
          if (v.length) melde(`${p.id}: nicht gestellte Frage ${[...new Set(v)].join(', ')} offen, wenn ${id} fehlt (${fall.name})`);
        }
        const k = r2.klaerung.filter((x) => verborgen(x.id));
        if (k.length) melde(`„Klärt am meisten“ nennt nicht gestellte Fragen ${k.map((x) => x.id).join(', ')}, wenn ${id} fehlt (${fall.name})`);
      }
    }
    expect([...fehler]).toEqual([]);
    expect(auswahl.length).toBeGreaterThan(30);
  });

  it('Fachprüfung Runde 13: gelb nur, wenn eine Antwort etwas ändert; Ersatzbau als Neubau; Entwässerung ohne Anschluss', () => {
    const EFH = { Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Sonderbau: 'nein', Verfahren: 'vereinfachtes Verfahren' };
    const ampel = (m: Record<string, string>, f: Record<string, FaktWert['wert']>, id: string) => lauf(SOEST, m, f).paragrafen.find((p) => p.id === id)!.automatisch;
    const ohne = (f: Record<string, FaktWert['wert']>, ...ids: string[]) => Object.fromEntries(Object.entries(f).filter(([k]) => !ids.includes(k)));
    const g = grund();
    // „Im Zusammenhang bebauter Ortsteil“ offen (einfacher B-Plan, Satzung): § 18 BNatSchG und § 36 BauGB gelten so oder so
    // (§ 36 dort, wo der Kreis Bauaufsicht ist – Bad Sassendorf; in Soest entscheidet die Stadt selbst)
    for (const p of ['einfacher Bebauungsplan', 'Satzung nach BauGB']) {
      expect(ampel({ ...EFH, Vorhaben: 'Errichtung', Planungsrecht: p }, ohne(g, 'planung.innen'), 'bund/bnatschg/18')).toBe('rot');
      expect(lauf('05974008', { ...EFH, Vorhaben: 'Errichtung', Planungsrecht: p }, ohne(g, 'planung.innen')).paragrafen.find((x) => x.id === 'bund/baugb/36')!.automatisch).toBe('rot');
    }
    // Umfang der Beseitigung offen: Altstadt § 12 (und § 1) bei jeder Beseitigung eines Gebäudes, § 74 bei Freistellung
    const alt = { ...ohne(g, 'vorhaben.beseitigung_umfang'), 'soest.altstadt': true, 'soest.einfriedungspflicht': true, 'nw.altbau_verfahrensfrei': true };
    expect(ampel({ ...EFH, Vorhaben: 'Beseitigung', Planungsrecht: 'Innenbereich' }, alt, 'nw-05974040/altstadtsatzung/12')).toBe('rot');
    expect(ampel({ ...EFH, Vorhaben: 'Beseitigung', Planungsrecht: 'Innenbereich' }, alt, 'nw-05974040/altstadtsatzung/1')).toBe('rot');
    const mfh = { Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '4', Sonderbau: 'nein', Verfahren: 'Genehmigungsfreistellung', Vorhaben: 'Beseitigung', Planungsrecht: 'Bebauungsplan' };
    expect(ampel(mfh, { ...g, 'gebaeude.wohnungen': 8, 'gebaeude.hoehe': 11, 'nw.geschosse_oberirdisch': 4, 'nw.altbau_verfahrensfrei': false }, 'nw/bauo-nrw/74')).toBe('rot');
    // Gartenhaus ohne Aufenthaltsräume und ohne Entwässerung: §§ 14, 15 der Entwässerungssatzung entfallen; ein Gebäude mit
    // Aufenthaltsräumen und „ohne Entwässerung“: gilt, mit Einzelfallhinweis; ohne Angabe: gilt
    const gh = { Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '1', Sonderbau: 'nein', Verfahren: 'verfahrensfrei', Vorhaben: 'Errichtung', Planungsrecht: 'Innenbereich' };
    for (const nr of ['14', '15']) {
      const id = `nw-05974040/entwaesserungssatzung/${nr}`;
      expect(ampel(gh, { ...g, 'gebaeude.aufenthaltsraeume': false, 'vorhaben.entwaesserung': false }, id)).toBe('gruen');
      const mitAR = lauf(SOEST, { ...EFH, Vorhaben: 'Errichtung', Planungsrecht: 'Innenbereich' }, { ...g, 'vorhaben.entwaesserung': false }).paragrafen.find((p) => p.id === id)!;
      expect(mitAR.automatisch).toBe('rot');
      expect(mitAR.hinweise.join(' ')).toMatch(/Im Einzelfall prüfen: .*ohne neue Entwässerung/);
      expect(ampel({ ...EFH, Vorhaben: 'Errichtung', Planungsrecht: 'Innenbereich' }, ohne(g, 'vorhaben.entwaesserung'), id)).toBe('rot');
    }
    // Nutzungsänderung einer Anlage, die kein Gebäude ist: keine Gebäudevorschriften als Einzelfall
    const kg = { Gebäudeart: 'kein Gebäude', Sonderbau: 'nein', Verfahren: 'vereinfachtes Verfahren', Vorhaben: 'Nutzungsänderung', Planungsrecht: 'Innenbereich' };
    for (const nr of ['27', '28', '31', '32', '34', '37', '40']) expect(ampel(kg, { ...g, 'gebaeude.aufenthaltsraeume': false, 'gebaeude.wohnungen': 0 }, `nw/bauo-nrw/${nr}`), nr).toBe('gruen');
    // Verweis auf „rot, Ausnahme möglich“: der Hinweis geht mit
    const r = lauf(SOEST, { ...EFH, Vorhaben: 'Errichtung', Planungsrecht: 'einfacher Bebauungsplan' }, ohne(g, 'planung.innen'));
    expect(r.paragrafen.find((p) => p.id === 'bund/bnatschg/15')!.hinweise.join(' ')).toMatch(/Ausnahme möglich über § 14 BNatSchG/);
  });

  it('Antworten auf nicht gestellte Fragen ändern nichts – weder „ja“ noch „nein“ (auch nicht über Tabellen der Module)', { timeout: 600000 }, () => {
    const fehler = new Set<string>();
    const auswahl = faelle.filter((f) => ['05974008', '05974052'].includes(f.ags) && f.name.includes(' ohne ') && f.m.Planungsrecht === 'Innenbereich' && f.m.Verfahren === 'vereinfachtes Verfahren');
    for (const fall of auswahl) {
      const defs = faktDefinitionen(aktiveModule(paket.module, fall.ags));
      const f = { ...fall.f };
      let r = lauf(fall.ags, fall.m, f);
      for (let runde = 0; runde < 6; runde++) {
        const weg = Object.keys(f).filter((id) => !frageGestellt(id, defs[id], r.kontext));
        if (!weg.length) break;
        for (const id of weg) delete f[id];
        r = lauf(fall.ags, fall.m, f);
      }
      const verborgen = Object.entries(defs).filter(([id, d]) => d.typ === 'janein' && !d.nach && d.wert === undefined && !(id in f) && !frageGestellt(id, d, r.kontext)).map(([id]) => id);
      const vorher = new Map(r.paragrafen.map((p) => [p.id, p.automatisch]));
      for (const w of [true, false]) {
        const r2 = lauf(fall.ags, fall.m, { ...f, ...Object.fromEntries(verborgen.map((id) => [id, w])) });
        for (const p of r2.paragrafen) if (vorher.get(p.id) !== p.automatisch && fehler.size < 40) fehler.add(`${p.id}: ${vorher.get(p.id)} → ${p.automatisch}, wenn nicht gestellte Fragen „${w ? 'ja' : 'nein'}“ sind (${fall.name})`);
      }
    }
    expect([...fehler]).toEqual([]);
    expect(auswahl.length).toBeGreaterThan(20);
  });

  it('Fachprüfung Runde 14: § 36 BauGB nur, wo der Kreis Bauaufsicht ist; § 74 und BauPrüfVO § 2 ohne Gelb ohne Wirkung; Entwässerung § 9', () => {
    const g = grund();
    const ohne = (f: Record<string, FaktWert['wert']>, ...ids: string[]) => Object.fromEntries(Object.entries(f).filter(([k]) => !ids.includes(k)));
    const EFH = { Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Sonderbau: 'nein', Verfahren: 'vereinfachtes Verfahren', Vorhaben: 'Errichtung', Planungsrecht: 'Innenbereich' };
    const p36 = (ags: string) => lauf(ags, EFH, g).paragrafen.find((x) => x.id === 'bund/baugb/36')!;
    // Soest, Lippstadt, Warstein, Werl und kreisfreie Städte (Dortmund) entscheiden selbst – kein Einvernehmen
    for (const ags of [SOEST, '05974028', '05974044', '05974052', '05913000']) expect(p36(ags).automatisch, ags).toBe('gruen');
    // Bad Sassendorf: der Kreis ist Bauaufsicht
    expect(p36('05974008').automatisch).toBe('rot');
    // eine kreisangehörige Gemeinde außerhalb des Kreises Soest: Zuständigkeit offen – gilt, Ausnahme möglich (kein Grün)
    const anders = p36('05958004');
    expect(anders.automatisch).toBe('rot');
    expect(anders.offen).toContain('zustaendig.gemeinde_bauaufsicht');
    // Gemeindeschlüssel nur Hinweis: nicht sicher grün
    const hinweis = auswerten({ paket, module: aktiveModule(paket.module, SOEST), merkmale: EFH, fakten: { 'lage.ags': { wert: SOEST, herkunft: 'abgeleitet', sicherheit: 'hinweis' }, ...Object.fromEntries(Object.entries(g).map(([k, v]) => [k, sicher(v)])) }, einreichung: '2026-12-01', heute: HEUTE, texte: TEXTE, festlegungen: {} });
    expect(hinweis.paragrafen.find((x) => x.id === 'bund/baugb/36')!.automatisch).not.toBe('gruen');
    // § 74: Freistellung, Beseitigung, Umfang offen, Abbruch nicht verfahrensfrei (angebautes EFH) – gilt so oder so
    const frei = { ...EFH, Verfahren: 'Genehmigungsfreistellung', Vorhaben: 'Beseitigung', Planungsrecht: 'Bebauungsplan' };
    expect(lauf(SOEST, frei, { ...ohne(g, 'vorhaben.beseitigung_umfang', 'nw.altbau_verfahrensfrei'), 'gebaeude.freistehend': false }).paragrafen.find((x) => x.id === 'nw/bauo-nrw/74')!.automatisch).toBe('rot');
    // BauPrüfVO § 2: Freistellung, Nutzungsänderung, einfacher B-Plan, „im Zusammenhang bebaut“ offen – gilt so oder so
    const nae = { ...EFH, Verfahren: 'Genehmigungsfreistellung', Vorhaben: 'Nutzungsänderung', Planungsrecht: 'einfacher Bebauungsplan' };
    expect(lauf(SOEST, nae, ohne(g, 'planung.innen')).paragrafen.find((x) => x.id === 'nw/baupruefvo/2')!.automatisch).toBe('rot');
    // Entwässerungssatzung § 9: Gartenhaus ohne Aufenthaltsräume und ohne neue Entwässerung – Einzelfall (Dachwasser)
    const gh = { Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '1', Sonderbau: 'nein', Verfahren: 'verfahrensfrei', Vorhaben: 'Errichtung', Planungsrecht: 'Innenbereich' };
    const p9 = lauf(SOEST, gh, { ...g, 'gebaeude.aufenthaltsraeume': false, 'vorhaben.entwaesserung': false }).paragrafen.find((x) => x.id === 'nw-05974040/entwaesserungssatzung/9')!;
    expect(p9.automatisch).toBe('gelb');
    expect(p9.gruende.join(' ')).toMatch(/Niederschlagswasser/);
  });

  it('Begründungen ohne doppelte Klammern: der Anwendungsbereich endet nicht mit einer Klammer, da ihm die tragende Angabe in Klammern folgt', () => {
    const probleme: string[] = [];
    for (const [key, l] of paket.regeln)
      for (const { regel } of l) {
        const g = regel.geltungGrund ?? '';
        if (g.endsWith(')') || g.includes(') (')) probleme.push(`${key}: ${g}`);
        for (const [nr, r] of Object.entries(regel.paragrafen)) for (const t of [r.titel ?? '', r.grund ?? '']) if (t.includes(') (')) probleme.push(`${key} § ${nr}: ${t}`);
      }
    expect(probleme).toEqual([]);
  });
});

/* ---------- Fälle aus dem Fachreview: kein Grün, wo das Gesetz noch greift ---------- */

describe('Fälle aus dem Fachreview', () => {
  // Beseitigung meint hier den vollständigen Abbruch ohne Ersatzbau – wo nicht anders angegeben (seit Runde 8 eine
  // Angabe, seit Runde 9 eine Auswahl: vollständiger Abbruch / Teilabbruch / Abbruch mit Ersatzbau)
  const UMFANG = 'vorhaben.beseitigung_umfang';
  const a = (merkmale: Record<string, string>, fakten: Record<string, FaktWert> = {}) => {
    const r = auswerten(eingabe(merkmale, merkmale.Vorhaben === 'Beseitigung' && !(UMFANG in fakten) ? { [UMFANG]: sicher('vollständiger Abbruch ohne Ersatzbau'), ...fakten } : fakten, TEXTE));
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
      for (const id of ['bund/baunvo/25c', 'bund/baunvo/4', 'bund/baunvo/12']) expect(x(id), `${id} ${JSON.stringify(f)}`).not.toBe('gruen');
      // seit Runde 6: die Vorschriften anderer Gebietsarten berührt die alte Fassung nicht
      expect(x('bund/baunvo/3'), `bund/baunvo/3 ${JSON.stringify(f)}`).toBe('gruen');
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
    // Soest: die Stellplatzsatzung ersetzt die StellplatzVO – ohne Angabe zum Zu- oder Abfahrtsverkehr offen (seit Runde 6)
    const x = a(m);
    for (const id of ['nw/bauo-nrw/48', 'nw-05974040/stellplatzsatzung/3']) expect(x(id), id).not.toBe('gruen');
    // in einer Gemeinde ohne Stellplatzsatzung (Kreis Soest, kein Gemeindemodul) gilt § 9 auch bei „verfahrensfrei“
    const ohne = auswerten({ ...eingabe(m, {}, TEXTE), module: aktiveModule(paket.module, '05974999'), fakten: { 'lage.ags': sicher('05974999') } });
    for (const nr of ['1', '2', '3']) expect(ohne.paragrafen.find((p) => p.id === `nw/stellplatzvo/${nr}`)!.ampel, `§ ${nr}`).not.toBe('gruen');
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
    const f = merkmale.Vorhaben === 'Beseitigung' && !(UMFANG in fakten) ? { [UMFANG]: sicher('vollständiger Abbruch ohne Ersatzbau'), ...fakten } : fakten;
    const r = auswerten({ ...eingabe(merkmale, f, TEXTE), module: aktiveModule(paket.module, ags), fakten: { 'lage.ags': sicher(ags), ...f } });
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
    // Gegenprobe: nichts geschützt, kein Eingriff in Gehölze oder Quartiere (Innenumbau) – seit Runde 4 gehört dazu auch
    // die Prüfung nach § 67 Abs. 2 (Artenschutz bei Neubau, Abbruch, Dach/Fassade) und Natura 2000
    const innen = { ...m, Vorhaben: 'Änderung' };
    expect(a(innen, { ...sonst, ...nein('schutz.naturdenkmal', 'schutz.ffh', 'schutz.vsg', 'schutz.natura_nah', 'vorhaben.baeume_faellen', 'vorhaben.dach_fassade') })('bund/bnatschg/67')).toBe('gruen');
    expect(a(m, { ...sonst, ...nein('schutz.naturdenkmal', 'schutz.ffh', 'schutz.vsg', 'schutz.natura_nah', 'vorhaben.baeume_faellen') })('bund/bnatschg/67')).not.toBe('gruen');
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

  /* ---------- Runde 4 ---------- */

  const M4 = (x: Record<string, string> = {}) => ({ Vorhaben: 'Errichtung', Gebäudeart: 'Einfamilienhaus', Gebäudeklasse: '1', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein', ...x });
  const wert = (id: string, w: FaktWert['wert']) => ({ [id]: sicher(w) });
  const keinSchutz = () => nein('schutz.nsg', 'schutz.lsg', 'schutz.naturdenkmal', 'schutz.biotop', 'schutz.baum', 'schutz.ffh', 'schutz.vsg', 'schutz.natura_nah', 'schutz.landschaftsplan');

  it('Runde 4: Befreiung nach § 67 BNatSchG / § 75 LNatSchG auch außerhalb von Schutzgebieten (Gehölzfällung, Artenschutz, Natura 2000, Landschaftsplan)', () => {
    // Neubau mit Gehölzfällung bei der Baufeldräumung: § 39 und § 44 gelten – § 67 nicht „entfällt“
    const x = a(M4(), { ...keinSchutz(), ...ja('vorhaben.baeume_faellen') });
    expect(x('bund/bnatschg/39')).toBe('rot');
    expect(x('bund/bnatschg/44')).toBe('rot');
    expect(x('bund/bnatschg/67')).not.toBe('gruen');
    expect(x('nw/lnatschg/75')).not.toBe('gruen');
    // FFH-Gebiet bzw. Landschaftsplan: § 67 nicht grün, während § 75 gilt (kein Widerspruch mehr)
    const y = a(M4({ Planungsrecht: 'Außenbereich' }), { ...keinSchutz(), ...nein('vorhaben.baeume_faellen'), ...ja('schutz.ffh', 'schutz.landschaftsplan') });
    expect(y('bund/bnatschg/67')).not.toBe('gruen');
    expect(y('nw/lnatschg/75')).toBe('rot');
    // Klasse: Naturdenkmal eines Landschaftsplans – ein Fakt für Kreisverordnung und Landschaftsplan
    const lp = inGemeinde('05974052', M4({ Planungsrecht: 'Außenbereich' }), { ...keinSchutz(), ...ja('schutz.landschaftsplan', 'schutz.naturdenkmal') });
    for (const id of ['nw-05974/lp_vi/C.3', 'bund/bnatschg/67', 'nw/lnatschg/75']) expect(lp(id).ampel, id).toBe('rot');
  });

  it('Runde 4: Landschaftspläne – Nutzungsänderung im NSG bzw. an geschützten Landschaftsbestandteilen (LP VI Werl), auch ohne Erdarbeiten und Fällung', () => {
    const f = { ...ja('schutz.nsg', 'schutz.lsg', 'schutz.naturdenkmal'), ...nein('vorhaben.erdarbeiten', 'vorhaben.baeume_faellen') };
    for (const ags of ['05974052', '05974048', '05974056']) {
      const x = inGemeinde(ags, M4({ Vorhaben: 'Nutzungsänderung', Planungsrecht: 'Außenbereich' }), f);
      const lp = { '05974052': 'lp_vi', '05974048': 'lp_iv', '05974056': 'lp_v' }[ags]!;
      expect(x(`nw-05974/${lp}/C.1`).ampel, `${lp} C.1`).toBe('rot');
      expect(x(`nw-05974/${lp}/C.4`).ampel, `${lp} C.4`).toBe('rot');
      // Landschaftsschutz und Naturdenkmal: im Einzelfall
      expect(x(`nw-05974/${lp}/C.2`).ampel, `${lp} C.2`).not.toBe('gruen');
      expect(x(`nw-05974/${lp}/C.3`).ampel, `${lp} C.3`).not.toBe('gruen');
    }
  });

  it('Runde 4: Planreife (§ 33 BauGB) bei Merkmal Außen- oder Innenbereich – BauNVO §§ 13, 14, 18–23 nicht „gilt nicht“', () => {
    for (const Planungsrecht of ['Außenbereich', 'Innenbereich']) {
      const x = a(M4({ Planungsrecht }), { ...ja('planung.planaufstellung', 'planung.planreife', 'vorhaben.nebenanlage', 'vorhaben.freiberuflich'), ...wert('planung.gebietsart', 'WA') });
      for (const id of ['bund/baunvo/13', 'bund/baunvo/14', 'bund/baunvo/19', 'bund/baunvo/20', 'bund/baunvo/23']) expect(x(id), `${id} (${Planungsrecht})`).toBe('rot');
      for (const id of ['bund/baunvo/18', 'bund/baunvo/21a', 'bund/baunvo/22']) expect(x(id), `${id} (${Planungsrecht})`).not.toBe('gruen');
    }
    // Gegenprobe: kein Plan in Aufstellung → im Innenbereich ohne Plan „gilt nicht“
    const ohne = a(M4(), { ...nein('planung.planaufstellung'), ...wert('planung.gebietsart', 'WA') });
    for (const id of ['bund/baunvo/18', 'bund/baunvo/19', 'bund/baunvo/23']) expect(ohne(id), id).toBe('gruen');
  });

  it('Runde 4: § 49 BauO NRW – Ein- oder Zweifamilienhaus mit öffentlich zugänglicher Praxis bzw. Laden', () => {
    expect(a(M4(), ja('gebaeude.gemischt', 'gebaeude.oeffentlich'))('nw/bauo-nrw/49')).toBe('rot');
    expect(a(M4({ Gebäudeart: 'Zweifamilienhaus' }), ja('gebaeude.oeffentlich'))('nw/bauo-nrw/49')).toBe('rot');
  });

  it('Runde 4: Ausnahmen für Wohngebäude der GK 1/2 nur bei reiner Wohnnutzung – Trennwände, Flure, Prüfung von Standsicherheit und Schall-/Wärmeschutz', () => {
    const ids = ['nw/bauo-nrw/29', 'nw/bauo-nrw/36', 'nw/svvo/12', 'nw/svvo/23'];
    const mit = a(M4({ Gebäudeart: 'Zweifamilienhaus', Gebäudeklasse: '2' }), ja('gebaeude.gemischt'));
    for (const id of ids.filter((i) => i !== 'nw/bauo-nrw/36')) expect(mit(id), id).toBe('rot');
    // § 36: auch sonstige Gebäude der GK 1/2 brauchen notwendige Flure nur im Kellergeschoss (Abs. 1 Satz 2 Nr. 2) – gelb (Runde 7)
    expect(mit('nw/bauo-nrw/36')).toBe('gelb');
    const offen = a(M4({ Gebäudeart: 'Zweifamilienhaus', Gebäudeklasse: '2' }));
    for (const id of ids) expect(offen(id), `${id} ohne Angabe`).not.toBe('gruen');
    const rein = a(M4({ Gebäudeart: 'Zweifamilienhaus', Gebäudeklasse: '2' }), nein('gebaeude.gemischt'));
    for (const id of ids) expect(rein(id), `${id} rein`).toBe('gruen');
  });

  it('Runde 4: Bebauungsplan-Norm der Stadt Soest – Merkmal Innenbereich, Plan im Dienst als Entwurf bzw. Plan in Aufstellung', () => {
    const x = a(M4(), ja('soest.bplan_entwurf'));
    expect(x('nw-05974040/bebauungsplan/Verfahrensstand')).toBe('rot');
    // künftige Festsetzungen binden erst bei Planreife (Runde 8): ohne Angabe offen, planreif rot
    expect(x('nw-05974040/bebauungsplan/Festsetzungen')).toBe('gelb');
    expect(a(M4(), ja('soest.bplan_entwurf', 'planung.planreife'))('nw-05974040/bebauungsplan/Festsetzungen')).toBe('rot');
    expect(a(M4(), { ...nein('soest.bplan_entwurf'), ...ja('planung.planaufstellung') })('nw-05974040/bebauungsplan/Festsetzungen')).toBe('gelb');
    expect(a(M4(), { ...nein('soest.bplan_entwurf'), ...ja('planung.planaufstellung', 'planung.planreife') })('nw-05974040/bebauungsplan/Festsetzungen')).toBe('rot');
    // ohne Angabe zum Verfahren: nicht „entfällt mit der Norm“
    expect(a(M4())('nw-05974040/bebauungsplan/Festsetzungen')).not.toBe('gruen');
  });

  it('Runde 4: Abweichung nur von einer örtlichen Bauvorschrift – § 72 BauO NRW (Nachbarbeteiligung) wie § 69', () => {
    const x = a(M4(), { ...nein('planung.abweichung', 'planung.befreiung'), ...ja('ortsrecht.abweichung') });
    expect(x('nw/bauo-nrw/69')).toBe('rot');
    expect(x('nw/bauo-nrw/72')).toBe('rot');
    // Gegenprobe (kleines Vorhaben, keine Öffentlichkeitsbeteiligung nach Abs. 3)
    expect(a(M4(), { ...nein('planung.abweichung', 'planung.befreiung', 'ortsrecht.abweichung'), ...wert('gebaeude.besucher', 10), ...wert('gebaeude.bgf', 200) })('nw/bauo-nrw/72')).toBe('gruen');
  });

  it('Runde 4: § 9 DSchG auch im Denkmalbereich (Maßstab für die Erlaubnis nach § 10 Abs. 2) sowie bei Garten- und Bodendenkmal', () => {
    const alleNein = nein('schutz.denkmal', 'schutz.denkmal_umgebung', 'schutz.denkmalbereich', 'schutz.denkmalbereich_umgebung', 'schutz.bodendenkmal', 'schutz.gartendenkmal');
    for (const id of ['schutz.denkmalbereich', 'schutz.gartendenkmal', 'schutz.bodendenkmal']) {
      const x = a(M4({ Vorhaben: 'Änderung' }), { ...alleNein, ...ja(id) });
      expect(x('nw/dschg/9'), id).toBe('rot');
    }
    expect(a(M4({ Vorhaben: 'Änderung' }), alleNein)('nw/dschg/9')).toBe('gruen');
  });

  it('Runde 4: Anlagen, die keine Gebäude sind (freistehende Wärmepumpe, Klimagerät, Tribüne) – §§ 15, 26, 38 BauO NRW', () => {
    const m = M4({ Gebäudeart: 'kein Gebäude' });
    const wp = a(m, ja('technik.waermepumpe'));
    expect(wp('nw/bauo-nrw/15')).toBe('rot');
    expect(wp('nw/bauo-nrw/42')).toBe('rot');
    const klima = a(m, { ...nein('technik.waermepumpe', 'technik.feuerstaette'), ...ja('technik.lueftung') });
    expect(klima('nw/bauo-nrw/15')).toBe('rot');
    const sonst = a(m, nein('technik.waermepumpe', 'technik.feuerstaette', 'technik.lueftung'));
    for (const id of ['nw/bauo-nrw/15', 'nw/bauo-nrw/26', 'nw/bauo-nrw/38']) expect(sonst(id), id).not.toBe('gruen');
  });

  it('Runde 4: Altstadtsatzung § 14 – Mobilfunk-, Antennen- oder Klimaanlage als „kein Gebäude“; § 3 Abstandsflächen für Mauern', () => {
    const m = M4({ Gebäudeart: 'kein Gebäude' });
    expect(a(m, { ...ja('soest.altstadt', 'technik.lueftung') })('nw-05974040/altstadtsatzung/14')).toBe('rot');
    const antenne = a(m, { ...ja('soest.altstadt'), ...nein('technik.lueftung', 'technik.waermepumpe') });
    expect(antenne('nw-05974040/altstadtsatzung/14')).not.toBe('gruen');
    expect(antenne('nw-05974040/altstadtsatzung/3')).not.toBe('gruen');
  });

  it('Runde 4: Heilquellenschutz Bad Sassendorf Zone III – Lagerplatz, Silo, Camping („kein Gebäude“) und gewerbliche Teile', () => {
    const zone = { ...ja('schutz.wsg', 'kreis_soest.hsg'), ...wert('kreis_soest.hsg_qualitativ', 'III'), ...wert('kreis_soest.hsg_quantitativ', 'außerhalb'), ...nein('technik.waermepumpe', 'technik.brennstofflager', 'vorhaben.versickerung', 'vorhaben.grundwasser', 'vorhaben.erdarbeiten') };
    const lager = a(M4({ Gebäudeart: 'kein Gebäude' }), zone);
    expect(lager('nw-05974/hsg_bad_sassendorf/3')).not.toBe('gruen');
    expect(lager('nw-05974/hsg_bad_sassendorf/9')).not.toBe('gruen');
    const mfh = a(M4({ Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' }), { ...zone, ...ja('gebaeude.gemischt') });
    expect(mfh('nw-05974/hsg_bad_sassendorf/3')).not.toBe('gruen');
  });

  it('Runde 4: GEG §§ 42–45 beim Neubau auch ohne „Heizung eingebaut oder ersetzt“ (Fernwärme, § 10 Abs. 2 Nr. 3)', () => {
    const x = a(M4(), { ...ja('gebaeude.beheizt'), ...nein('vorhaben.heizung') });
    expect(x('bund/geg/42')).toBe('rot');
    for (const id of ['bund/geg/43', 'bund/geg/44', 'bund/geg/45']) expect(x(id), id).not.toBe('gruen');
    // Neubau mit Fernwärme: Heizungsart verneint → §§ 43–45 entfallen
    const fern = a(M4(), { ...ja('gebaeude.beheizt'), ...nein('vorhaben.heizung', 'technik.heizung_fossil', 'technik.solarthermie', 'technik.biomasse') });
    for (const id of ['bund/geg/43', 'bund/geg/44', 'bund/geg/45']) expect(fern(id), id).toBe('gruen');
    // Bestand ohne neue Heizung: nicht berührt
    expect(a(M4({ Vorhaben: 'Änderung' }), { ...ja('gebaeude.beheizt'), ...nein('vorhaben.heizung') })('bund/geg/42')).toBe('gruen');
  });

  it('Runde 4: Satzung historische Ortsteile – Nutzungsänderung (§ 3 Lager- und Einstellplätze) und Anlagen ohne Gebäude (§ 4)', () => {
    expect(a(M4({ Vorhaben: 'Nutzungsänderung' }), ja('soest.historische_ortsteile'))('nw-05974040/historische_ortsteile/3')).not.toBe('gruen');
    expect(a(M4({ Gebäudeart: 'kein Gebäude' }), ja('soest.historische_ortsteile'))('nw-05974040/historische_ortsteile/4')).not.toBe('gruen');
  });

  it('Runde 4: Bergbau bzw. Gefährdung des Untergrunds – § 12 BauO NRW (Standsicherheit), gelb bis zur Auskunft', () => {
    expect(a(M4())('nw/bauo-nrw/12')).toBe('rot');
    expect(a(M4({ Vorhaben: 'Nutzungsänderung' }))('nw/bauo-nrw/12')).toBe('gelb');
    expect(a(M4({ Vorhaben: 'Nutzungsänderung' }), ja('lage.bergbau'))('nw/bauo-nrw/12')).toBe('gelb');
    // Nutzungsänderung (geänderte Lasten): seit Runde 5 Einzelfall, auch ohne Bergbau
    expect(a(M4({ Vorhaben: 'Nutzungsänderung' }), nein('lage.bergbau'))('nw/bauo-nrw/12')).toBe('gelb');
    const r = auswerten(eingabe(M4(), ja('lage.bergbau'), TEXTE)).paragrafen.find((p) => p.id === 'nw/bauo-nrw/12')!;
    expect(r.hinweise.join(' ')).toMatch(/Bezirksregierung Arnsberg/);
  });

  it('Runde 4: PV über Stellplatzflächen – beim Ein-/Zweifamilienhaus wird nicht gefragt, die Regeln entfallen dort; Fakt § 9 FStrG nennt geplante Straßen und Ortsdurchfahrten', () => {
    const x = a(M4({ Vorhaben: 'Änderung' }), { ...nein('vorhaben.dachhaut'), ...wert('gebaeude.nutzflaeche', 140) });
    for (const id of ['nw/san-vo/1', 'nw/san-vo/6', 'nw/san-vo/7']) expect(x(id), id).toBe('gruen');
    // Mehrfamilienhaus: die Frage bleibt, ohne Antwort nicht „entfällt“
    expect(a(M4({ Vorhaben: 'Änderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' }), nein('vorhaben.dachhaut'))('nw/san-vo/6')).not.toBe('gruen');
    const defs = faktDefinitionen(aktiveModule(paket.module, SOEST));
    expect(`${defs['lage.bundesfernstrasse'].titel} ${defs['lage.bundesfernstrasse'].hilfe}`).toMatch(/geplant.*Ortsdurchfahrt|Ortsdurchfahrt.*geplant/s);
  });
  it('Runde 5: § 74 BauO NRW für jede Baugenehmigung, die Freistellung und die Beseitigung; § 70 auch bei der Freistellung', () => {
    expect(a(M4({ Verfahren: 'Baugenehmigungsverfahren', Sonderbau: 'ja', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3' }))('nw/bauo-nrw/74')).toBe('rot');
    const frei = a(M4({ Verfahren: 'Genehmigungsfreistellung', Planungsrecht: 'Bebauungsplan' }));
    expect(frei('nw/bauo-nrw/74')).toBe('rot');
    expect(frei('nw/bauo-nrw/70')).toBe('rot');
    // seit Runde 6 nur die anzuzeigende Beseitigung (§ 62 Abs. 3 Satz 7), z. B. ein angebautes Mehrfamilienhaus
    expect(a(M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3', Verfahren: 'verfahrensfrei' }), nein('gebaeude.freistehend'))('nw/bauo-nrw/74')).toBe('rot');
    // Gegenprobe: verfahrensfreie Errichtung – keine Baugenehmigung, keine Baubeginnanzeige
    expect(a(M4({ Verfahren: 'verfahrensfrei' }))('nw/bauo-nrw/74')).toBe('gruen');
    expect(a(M4({ Verfahren: 'verfahrensfrei' }))('nw/bauo-nrw/70')).toBe('gruen');
  });

  it('Runde 5: Standsicherheit bei der Beseitigung angebauter Gebäude und bei Nutzungsänderung – § 12 BauO NRW, §§ 2 und 8 BauPrüfVO', () => {
    const angebaut = a(M4({ Vorhaben: 'Beseitigung', Verfahren: 'vereinfachtes Verfahren' }), { ...nein('lage.bergbau', 'gebaeude.freistehend') });
    expect(angebaut('nw/bauo-nrw/12')).toBe('rot');
    expect(angebaut('nw/baupruefvo/2')).toBe('rot');
    expect(angebaut('nw/baupruefvo/8')).not.toBe('gruen');
    expect(angebaut('nw/baupruefvo/15')).toBe('rot');
    // offen, ob freistehend: nicht „gilt nicht“
    expect(a(M4({ Vorhaben: 'Beseitigung' }), nein('lage.bergbau'))('nw/bauo-nrw/12')).toBe('gelb');
    expect(a(M4({ Vorhaben: 'Nutzungsänderung' }), nein('lage.bergbau'))('nw/bauo-nrw/12')).not.toBe('gruen');
    // Gegenprobe: freistehendes Gebäude ohne Bergbau und ohne Erdarbeiten – keine Nachbarn bzw. kein Nachbarbaugrund berührt (Runde 7)
    const frei = a(M4({ Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' }), { ...nein('lage.bergbau', 'vorhaben.erdarbeiten'), ...ja('gebaeude.freistehend') });
    expect(frei('nw/bauo-nrw/12')).toBe('gruen');
    expect(frei('nw/baupruefvo/2')).toBe('gruen');
  });

  it('Runde 5: Landschaftspläne im Innenbereich (Soest, Werl) – kein Fehl-Gelb „nur Hinweis“; im Außenbereich bzw. dort, wo die Lage entscheidet, kein falsches Grün', () => {
    const lpIds = (r: ReturnType<typeof auswerten>) => r.paragrafen.filter((x) => x.modul === 'nw-05974' && x.norm.startsWith('lp_'));
    for (const ags of [SOEST, '05974052']) {
      const r = auswerten({ ...eingabe(M4(), {}, TEXTE), module: aktiveModule(paket.module, ags), fakten: { 'lage.ags': sicher(ags) } });
      const lp = lpIds(r);
      expect(lp.length).toBeGreaterThan(10);
      for (const x of lp) {
        expect(x.ampel, `${x.id} in ${ags}`).toBe('gruen');
        expect(x.gruende.join(' '), x.id).not.toMatch(/Nur Hinweis/);
      }
    }
    // Soest: kein Landschaftsplan steht fest – § 7 LNatSchG beim EFH im Bebauungsplan nicht mehr gelb
    expect(a(M4({ Planungsrecht: 'Bebauungsplan' }))('nw/lnatschg/7')).toBe('gruen');
    // Werl, Außenbereich: LP VI gilt, ohne Angaben nicht „entfällt“
    const werl = inGemeinde('05974052', M4({ Planungsrecht: 'Außenbereich' }));
    for (const nr of ['C.1', 'C.2', 'C.3', 'C.4']) expect(werl(`nw-05974/lp_vi/${nr}`).ampel, nr).not.toBe('gruen');
    // Anröchte: die Lage entscheidet (LP I/II) – im Außenbereich offen
    expect(inGemeinde('05974004', M4({ Planungsrecht: 'Außenbereich' }))('nw-05974/lp_ii/C.2').ampel).not.toBe('gruen');
  });

  it('Runde 5: Naturdenkmal der Kreisverordnung (Innenbereich) – Schutzobjekt auch bei Merkmal Außenbereich; Nutzungsänderung im Einzelfall', () => {
    const aussen = a(M4({ Planungsrecht: 'Außenbereich' }), ja('kreis_soest.naturdenkmal'));
    for (const nr of ['1', '2', '4']) expect(aussen(`nw-05974/nd_vo_innen/${nr}`), `§ ${nr}`).toBe('rot');
    const nutzung = a(M4({ Vorhaben: 'Nutzungsänderung' }), { ...ja('kreis_soest.naturdenkmal'), ...nein('vorhaben.erdarbeiten', 'vorhaben.baeume_faellen') });
    expect(nutzung('nw-05974/nd_vo_innen/2')).not.toBe('gruen');
    expect(nutzung('nw-05974/nd_vo_innen/4')).not.toBe('gruen');
    // Gegenprobe: kein Schutzobjekt, Außenbereich – die Verordnung berührt das Vorhaben nicht
    expect(a(M4({ Planungsrecht: 'Außenbereich' }), nein('kreis_soest.naturdenkmal'))('nw-05974/nd_vo_innen/2')).toBe('gruen');
  });

  it('Runde 5: § 75 LNatSchG wie § 67 BNatSchG – Neubau, Abbruch, Dacharbeiten ohne Schutzgebiet; Grund nach der Neufassung', () => {
    for (const m of [M4(), M4({ Vorhaben: 'Beseitigung' }), M4({ Vorhaben: 'Änderung' })]) {
      const f = { ...keinSchutz(), ...nein('vorhaben.baeume_faellen'), ...(m.Vorhaben === 'Änderung' ? ja('vorhaben.dach_fassade') : {}) };
      const x = a(m, f);
      expect(x('bund/bnatschg/67'), `§ 67 ${m.Vorhaben}`).not.toBe('gruen');
      expect(x('nw/lnatschg/75'), `§ 75 ${m.Vorhaben}`).not.toBe('gruen');
    }
    // Innenumbau ohne Dach/Fassade und ohne Schutz: beide entfallen
    const innen = a(M4({ Vorhaben: 'Änderung' }), { ...keinSchutz(), ...nein('vorhaben.baeume_faellen', 'vorhaben.dach_fassade') });
    expect(innen('bund/bnatschg/67')).toBe('gruen');
    expect(innen('nw/lnatschg/75')).toBe('gruen');
    const r = auswerten(eingabe(M4(), ja('schutz.lsg'), TEXTE)).paragrafen.find((p) => p.id === 'nw/lnatschg/75')!;
    expect(r.gruende.join(' ')).toMatch(/sechs Wochen/);
    expect(r.gruende.join(' ')).not.toMatch(/widersprechen/);
  });

  it('Runde 5: § 51 BauO NRW – Behelfsbau auch zum Wohnen (Wohncontainer)', () => {
    expect(a(M4({ Gebäudeart: 'Einfamilienhaus' }), ja('gebaeude.behelfsbau'))('nw/bauo-nrw/51')).toBe('rot');
  });

  it('Runde 5: weitere Stellen – historische Ortsteile §§ 5, 7, 8; § 41 freistehend; StrlSchG § 123 Abs. 4; GEG § 34; § 63 nach der Neufassung', () => {
    const nutzung = a(M4({ Vorhaben: 'Nutzungsänderung' }), ja('soest.historische_ortsteile'));
    for (const nr of ['5', '7', '8']) expect(nutzung(`nw-05974040/historische_ortsteile/${nr}`), `§ ${nr}`).not.toBe('gruen');
    expect(a(M4({ Gebäudeart: 'kein Gebäude' }), ja('soest.historische_ortsteile'))('nw-05974040/historische_ortsteile/8')).not.toBe('gruen');
    expect(a(M4({ Gebäudeart: 'kein Gebäude' }), ja('technik.lueftung'))('nw/bauo-nrw/41')).toBe('rot');
    const umbau = a(M4({ Vorhaben: 'Änderung' }), ja('vorhaben.aussenbauteile', 'gebaeude.beheizt'));
    expect(umbau('bund/strlschg/123')).not.toBe('gruen');
    expect(umbau('bund/geg/34')).toBe('rot');
    expect(a(M4({ Vorhaben: 'Änderung' }), { ...nein('vorhaben.aussenbauteile'), ...ja('gebaeude.beheizt') })('bund/geg/34')).toBe('gruen');
    const r = auswerten(eingabe(M4({ Verfahren: 'Genehmigungsfreistellung', Planungsrecht: 'Innenbereich' }), {}, TEXTE)).paragrafen.find((p) => p.id === 'nw/bauo-nrw/63')!;
    expect(r.ampel).toBe('rot');
    expect(r.hinweise.join(' ')).toMatch(/Dachgeschossausbau/);
  });

  /* ---------- Runde 6 ---------- */

  const mitVerfahren = (m: Record<string, string>, v?: string) => {
    const { Verfahren: _alt, ...ohne } = m;
    return v ? { ...ohne, Verfahren: v } : ohne;
  };
  /** Anlage, die kein Gebäude ist (ohne Gebäudeklasse) */
  const anlage = (x: Record<string, string> = {}) => ({ Vorhaben: 'Errichtung', Gebäudeart: 'kein Gebäude', Planungsrecht: 'Innenbereich', Verfahren: 'vereinfachtes Verfahren', Sonderbau: 'nein', ...x });

  it('Runde 6: Beseitigung – Anzeigepflicht nach § 62 Abs. 3 BauO NRW aus den Angaben, gleich welches Verfahren gewählt ist (BauPrüfVO §§ 1, 2, 15, DSchG § 24, § 74)', () => {
    // Fälle X1, X2, A3: angebautes Mehrfamilienhaus GK 3 im Denkmalbereich – anzuzeigen, kein Baugenehmigungsverfahren
    const mfh = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' });
    for (const v of [undefined, 'verfahrensfrei', 'vereinfachtes Verfahren', 'Baugenehmigungsverfahren', 'Genehmigungsfreistellung']) {
      const x = a(mitVerfahren(mfh, v), { ...nein('gebaeude.freistehend'), ...ja('schutz.denkmalbereich') });
      const w = v ?? 'Verfahren offen';
      for (const id of ['nw/bauo-nrw/74', 'nw/baupruefvo/1', 'nw/baupruefvo/2', 'nw/baupruefvo/15', 'nw/dschg/24']) expect(x(id), `${id} (${w})`).toBe('rot');
      // kein Fehl-Gelb bzw. Fehl-Rot aus dem gewählten Verfahren
      for (const id of ['nw/bauo-nrw/63', 'nw/bauo-nrw/64', 'nw/bauo-nrw/65', 'nw/bauo-nrw/70', 'nw/baupruefvo/10', 'nw/baupruefvo/11', 'nw/baupruefvo/13']) expect(x(id), `${id} (${w})`).toBe('gruen');
      // keine Baugenehmigung, keine Tarifstelle für die Anzeige – offen nur wegen der denkmalrechtlichen Erlaubnis (Runde 8)
      expect(x('nw/avwgebo/1'), `AVwGebO (${w})`).toBe('gelb');
    }
    // Fall A2: Reihenhaus GK 2 ist nie freistehend und als Wohngebäude nie Anlage nach Abs. 1 – anzuzeigen, auch ohne Angabe „freistehend“
    const a2 = a(mitVerfahren(M4({ Vorhaben: 'Beseitigung', Gebäudeklasse: '2' })));
    for (const id of ['nw/bauo-nrw/74', 'nw/baupruefvo/2', 'nw/baupruefvo/15']) expect(a2(id), `${id} (A2)`).toBe('rot');
    // Fall A5: Anlage, die kein Gebäude ist – über 10 m anzuzeigen, bis 10 m verfahrensfrei
    const mast = anlage({ Vorhaben: 'Beseitigung', Planungsrecht: 'Außenbereich' });
    expect(a(mitVerfahren(mast), { ...ja('nw.anlage_ueber_10m'), ...nein('nw.beseitigung_abs1') })('nw/bauo-nrw/74')).toBe('rot');
    // über 10 m, aber offen, ob schon die Errichtung verfahrensfrei wäre (Abs. 3 Satz 1 Nr. 1): offen
    expect(a(mitVerfahren(mast), ja('nw.anlage_ueber_10m'))('nw/bauo-nrw/74')).toBe('gelb');
    expect(a(mitVerfahren(mast, 'verfahrensfrei'), nein('nw.anlage_ueber_10m'))('nw/bauo-nrw/74')).toBe('gruen');
    // angebaute Garage: Errichtung wäre verfahrensfrei (Abs. 3 Satz 1 Nr. 1) – Beseitigung verfahrensfrei, auch angebaut
    const garage = a(M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Nichtwohngebäude', Verfahren: 'verfahrensfrei' }), { ...nein('gebaeude.freistehend'), ...ja('nw.beseitigung_abs1') });
    for (const id of ['nw/bauo-nrw/74', 'nw/baupruefvo/15']) expect(garage(id), `${id} (Garage)`).toBe('gruen');
    // Gegenprobe ohne Angaben: offen, nicht „gilt nicht“
    const offen = a(mitVerfahren(mfh), ja('schutz.denkmalbereich'));
    for (const id of ['nw/bauo-nrw/74', 'nw/baupruefvo/15', 'nw/dschg/24']) expect(offen(id), `${id} offen`).not.toBe('gruen');
    expect(a(mitVerfahren(mast))('nw/bauo-nrw/74')).not.toBe('gruen');
  });

  it('Runde 6: BauPrüfVO § 2 bei der Freistellung einer Nutzungsänderung im Innenbereich (Dachgeschossausbau, § 13 Abs. 1 Satz 2 mit § 10 Abs. 3)', () => {
    // Fall B2
    const b2 = a(M4({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3', Verfahren: 'Genehmigungsfreistellung' }), ja('vorhaben.dach_fassade'));
    expect(b2('nw/baupruefvo/2')).toBe('rot');
    expect(b2('nw/baupruefvo/13')).toBe('rot');
    // Gegenprobe: Freistellung eines Neubaus im qualifizierten Bebauungsplan – kein Katasterauszug nach § 2
    expect(a(M4({ Verfahren: 'Genehmigungsfreistellung', Planungsrecht: 'Bebauungsplan' }))('nw/baupruefvo/2')).toBe('gruen');
  });

  it('Runde 6: Beseitigung als Eingriff auch ohne Erdarbeiten – Naturschutzgebiet im Landschaftsplan (C.1), Naturdenkmal (ND-VO, LP C.3), geschützte Bäume (Baumschutzsatzung § 4)', () => {
    const ohneErde = nein('vorhaben.erdarbeiten', 'vorhaben.baeume_faellen');
    // Fall X12: Abbruch einer freistehenden Scheune im NSG, Werl (LP VI)
    const scheune = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Nichtwohngebäude', Planungsrecht: 'Außenbereich', Verfahren: 'verfahrensfrei' });
    const werl = (f: Record<string, FaktWert>) => inGemeinde('05974052', scheune, { ...ohneErde, ...ja('gebaeude.freistehend'), ...f });
    expect(werl(ja('schutz.nsg'))('nw-05974/lp_vi/C.1').ampel).toBe('rot');
    expect(werl(ja('schutz.naturdenkmal'))('nw-05974/lp_vi/C.3').ampel).not.toBe('gruen');
    // Naturdenkmal der Kreisverordnung (Innenbereich, Soest)
    const efh = M4({ Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' });
    expect(a(efh, { ...ohneErde, ...ja('kreis_soest.naturdenkmal', 'gebaeude.freistehend') })('nw-05974/nd_vo_innen/2')).toBe('rot');
    // Fall A6: geschützter Baum auf dem Grundstück
    expect(a(efh, { ...ohneErde, ...ja('soest.baeume', 'gebaeude.freistehend') })('nw-05974040/baumschutzsatzung/4')).not.toBe('gruen');
    // Gegenprobe: kein Schutzobjekt – die Verbote berühren den Abbruch nicht
    const ohneSchutz = werl(nein('schutz.nsg', 'schutz.naturdenkmal'));
    for (const nr of ['C.1', 'C.3']) expect(ohneSchutz(`nw-05974/lp_vi/${nr}`).ampel, nr).toBe('gruen');
    const keinBaum = a(efh, { ...ohneErde, ...ja('gebaeude.freistehend'), ...nein('soest.baeume', 'kreis_soest.naturdenkmal') });
    expect(keinBaum('nw-05974040/baumschutzsatzung/4')).toBe('gruen');
    expect(keinBaum('nw-05974/nd_vo_innen/2')).toBe('gruen');
  });

  it('Runde 6: Einzelfall übersteuert kein sicheres „entfällt“ – SV-VO § 12 beim Wohngebäude GK 1/2 (auch Beseitigung), GEIG §§ 8, 9 beim Neubau, BauPrüfVO § 2 bei der Änderung im Bebauungsplan', () => {
    // Fälle K1–K7, A1: Einfamilienhaus bis 200 m² BGF, reine Wohnnutzung
    const efh = { ...nein('gebaeude.gemischt', 'gebaeude.landwirtschaft'), ...zahl('gebaeude.bgf', 150) };
    expect(a(M4(), efh)('nw/svvo/12')).toBe('gruen');
    expect(a(M4({ Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' }), { ...efh, ...ja('gebaeude.freistehend') })('nw/svvo/12')).toBe('gruen');
    // Gegenprobe: Nichtwohngebäude GK 1 – Prüfung der Standsicherheit nicht „entfällt“
    expect(a(M4({ Gebäudeart: 'Nichtwohngebäude' }), efh)('nw/svvo/12')).not.toBe('gruen');
    // Fall F1: Neubau Wohn- und Geschäftshaus mit 12 Stellplätzen – GEIG §§ 8, 9 regeln Bestandsgebäude
    const f1 = { ...ja('gebaeude.gemischt'), ...zahl('gebaeude.stellplaetze', 12) };
    const neu = a(M4({ Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '4', Planungsrecht: 'Bebauungsplan' }), f1);
    for (const id of ['bund/geig/8', 'bund/geig/9']) expect(neu(id), id).toBe('gruen');
    expect(a(M4({ Vorhaben: 'Änderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '4' }), { ...f1, ...ja('vorhaben.groessere_renovierung') })('bund/geig/8')).toBe('rot');
    // Fall K8: Änderung im qualifizierten Bebauungsplan – der Übersichtsplan ist nur noch Hinweis
    expect(a(M4({ Vorhaben: 'Änderung', Planungsrecht: 'Bebauungsplan' }))('nw/baupruefvo/2')).toBe('gruen');
    expect(a(M4({ Vorhaben: 'Änderung' }))('nw/baupruefvo/2')).toBe('rot');
  });

  it('Runde 6: Nutzungsänderung übersteuert kein sicheres „entfällt“ – §§ 29, 35, 36 BauO NRW und SV-VO § 23 beim Wohngebäude GK 1/2, MVV TB A 1.2.9 außerhalb der Erdbebenzonen', () => {
    const ids = ['nw/bauo-nrw/29', 'nw/bauo-nrw/35', 'nw/bauo-nrw/36', 'nw/svvo/23', 'nw/mvv-tb/A 1.2.9'];
    // Fall D4: Wohnung → Ferienwohnung im Einfamilienhaus, Erdbebenzone 0
    const d4 = a(M4({ Vorhaben: 'Nutzungsänderung' }), { ...nein('gebaeude.gemischt'), ...wert('lage.erdbebenzone', '0') });
    for (const id of ids) expect(d4(id), id).toBe('gruen');
    // Gegenprobe: Nutzungsänderung im gemischt genutzten Mehrfamilienhaus GK 3 (Fall D1), Erdbebenzone offen – Einzelfall bleibt
    const d1 = a(M4({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' }), ja('gebaeude.gemischt'));
    for (const id of ids) expect(d1(id), `${id} (D1)`).not.toBe('gruen');
  });

  it('Runde 6: Stellplätze bei Anlagen, die keine Gebäude sind – § 48 BauO NRW, StellplatzVO und Stellplatzsatzung nach der Angabe „Zu-/Abfahrtsverkehr zu erwarten“', () => {
    // Fall E4: freistehende Wärmepumpe, verfahrensfrei, Soest
    const wp = anlage({ Verfahren: 'verfahrensfrei' });
    const ohne = a(wp, nein('vorhaben.zu_abfahrtsverkehr'));
    for (const id of ['nw/bauo-nrw/48', 'nw/stellplatzvo/1', 'nw-05974040/stellplatzsatzung/3', 'nw-05974040/stellplatzsatzung/4']) expect(ohne(id), id).toBe('gruen');
    // Stellplatzanlage oder Sportplatz: Zu- und Abfahrtsverkehr
    const mit = a(wp, ja('vorhaben.zu_abfahrtsverkehr'));
    expect(mit('nw/bauo-nrw/48')).toBe('rot');
    expect(mit('nw-05974040/stellplatzsatzung/3')).toBe('rot');
    // ohne Angabe nicht „gilt nicht“
    expect(a(wp)('nw/bauo-nrw/48')).not.toBe('gruen');
    // Fall E2: Werl ohne Gemeindemodul – § 48 nach derselben Angabe
    expect(inGemeinde('05974052', anlage({ Planungsrecht: 'Außenbereich' }), ja('vorhaben.zu_abfahrtsverkehr'))('nw/bauo-nrw/48').ampel).toBe('rot');
    expect(inGemeinde('05974052', anlage({ Planungsrecht: 'Außenbereich' }), nein('vorhaben.zu_abfahrtsverkehr'))('nw/bauo-nrw/48').ampel).toBe('gruen');
  });

  it('Runde 6: § 30 BauO NRW (Brandwände) – Einzelfall nur bei Vorhaben nach § 29 BauGB, nicht bei der Beseitigung', () => {
    const mfh = { Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' };
    expect(a(M4({ ...mfh, Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' }), nein('gebaeude.freistehend'))('nw/bauo-nrw/30')).toBe('gruen');
    // Gegenprobe: Neubau des Mehrfamilienhauses – Gebäudeabschlusswand im Einzelfall
    expect(a(M4(mfh), nein('nw.grenzabstand_unter_2_5', 'nw.landwirtschaft_angebaut'))('nw/bauo-nrw/30')).toBe('gelb');
  });

  it('Runde 6: BauNVO in älterer Fassung – Einzelfall nur für die festgesetzte (oder offene) Gebietsart; § 25c nur bei offener Fassung', () => {
    const bplan = M4({ Planungsrecht: 'Bebauungsplan' });
    // Fall X4: WA nach BauNVO 1990
    const x4 = a(bplan, { ...wert('planung.gebietsart', 'WA'), ...wert('planung.baunvo', '1990') });
    for (const nr of ['2', '3', '5', '6', '8', '9', '25c']) expect(x4(`bund/baunvo/${nr}`), `§ ${nr}`).toBe('gruen');
    expect(x4('bund/baunvo/4')).not.toBe('gruen');
    // Gegenproben: Gebietsart offen bzw. Fassung offen oder vor 1990
    expect(a(bplan, wert('planung.baunvo', '1990'))('bund/baunvo/3')).not.toBe('gruen');
    expect(a(bplan, wert('planung.gebietsart', 'WA'))('bund/baunvo/25c')).not.toBe('gruen');
    expect(a(bplan, { ...wert('planung.gebietsart', 'WA'), ...wert('planung.baunvo', '1968') })('bund/baunvo/25c')).toBe('rot');
  });

  it('Runde 6: § 45 BauO NRW (Blitzschutz) – Angabe „Besondere Blitzgefahr oder -folgen“ statt Dauer-Einzelfall', () => {
    expect(a(M4(), nein('nw.blitzschutz_anlass'))('nw/bauo-nrw/45')).toBe('gruen');
    expect(a(M4(), ja('nw.blitzschutz_anlass'))('nw/bauo-nrw/45')).toBe('rot');
    expect(a(anlage({ Planungsrecht: 'Außenbereich' }), ja('nw.blitzschutz_anlass'))('nw/bauo-nrw/45')).toBe('rot');
    // Gegenprobe: ohne Angabe offen (Gebäudeklasse 4/5 allein macht § 45 nicht rot – Runde 7)
    expect(a(M4())('nw/bauo-nrw/45')).not.toBe('gruen');
  });

  it('Runde 6: § 36 BauGB (Einvernehmen der Gemeinde) nur im Baugenehmigungsverfahren – nicht bei verfahrensfreien Vorhaben und der Freistellung', () => {
    const aussen = M4({ Planungsrecht: 'Außenbereich' });
    // Fälle E4, I1, X10 (verfahrensfrei), B2, X7 (Freistellung)
    expect(a(mitVerfahren(aussen, 'verfahrensfrei'))('bund/baugb/36')).toBe('gruen');
    expect(a(mitVerfahren(aussen, 'Genehmigungsfreistellung'))('bund/baugb/36')).toBe('gruen');
    // Gegenproben: im vereinfachten Verfahren rot, wo der Kreis Bauaufsicht ist (Bad Sassendorf); in Soest entscheidet die
    // Stadt selbst – kein Einvernehmen (Fachprüfung Runde 14); ohne Verfahren nicht grün
    const sassendorf = (m: Record<string, string>) => {
      const r = auswerten({ ...eingabe(m, { 'lage.ags': sicher('05974008') }, TEXTE), module: aktiveModule(paket.module, '05974008') });
      return r.paragrafen.find((x) => x.id === 'bund/baugb/36')!.ampel;
    };
    expect(sassendorf(aussen)).toBe('rot');
    expect(a(aussen)('bund/baugb/36')).toBe('gruen');
    expect(sassendorf(mitVerfahren(aussen))).not.toBe('gruen');
  });

  it('Runde 6: § 74 Abs. 8 und BauPrüfVO §§ 1, 15 nur bei der anzuzeigenden Beseitigung bzw. beim Antrag nach § 62 Abs. 3 Satz 2 – nicht bei der verfahrensfreien', () => {
    // Fall A1: freistehendes Einfamilienhaus GK 1, verfahrensfrei
    const a1 = M4({ Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' });
    const frei = a(a1, ja('gebaeude.freistehend'));
    for (const id of ['nw/bauo-nrw/74', 'nw/baupruefvo/1', 'nw/baupruefvo/2', 'nw/baupruefvo/15']) expect(frei(id), id).toBe('gruen');
    // Antrag auf Baugenehmigung für die verfahrensfreie Beseitigung (§ 62 Abs. 3 Satz 2)
    const antrag = a(mitVerfahren(a1, 'vereinfachtes Verfahren'), ja('gebaeude.freistehend'));
    for (const id of ['nw/bauo-nrw/64', 'nw/bauo-nrw/74', 'nw/baupruefvo/15']) expect(antrag(id), `${id} (Antrag)`).toBe('rot');
    // Gegenprobe: angebautes Mehrfamilienhaus GK 3 – anzuzeigen, § 74 Abs. 8 gilt
    expect(a(M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3', Verfahren: 'verfahrensfrei' }), nein('gebaeude.freistehend'))('nw/bauo-nrw/74')).toBe('rot');
  });

  it('Runde 6: Altstadtsatzung – Gestaltung nur bei Errichtung bzw. Änderung mit Arbeiten an Dach oder Fassade; Innenumbau ohne Außenwirkung nicht rot', () => {
    // Fall X8: Innenumbau eines Mehrfamilienhauses in der Altstadt
    const x8 = M4({ Vorhaben: 'Änderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' });
    const innen = a(x8, { ...ja('soest.altstadt'), ...nein('vorhaben.dach_fassade', 'technik.waermepumpe', 'technik.lueftung') });
    for (const nr of ['3', '4', '6', '7', '10', '11', '14']) expect(innen(`nw-05974040/altstadtsatzung/${nr}`), `§ ${nr}`).toBe('gruen');
    // Gegenproben: Arbeiten an Dach oder Fassade rot, ohne Angabe offen
    const aussen = a(x8, ja('soest.altstadt', 'vorhaben.dach_fassade'));
    for (const nr of ['3', '4', '6']) expect(aussen(`nw-05974040/altstadtsatzung/${nr}`), `§ ${nr}`).toBe('rot');
    expect(a(x8, ja('soest.altstadt'))('nw-05974040/altstadtsatzung/4')).not.toBe('gruen');
    // Fall D3: Nutzungsänderung zum Café, Schaufenster und Vordach verneint – §§ 8, 9 entfallen sicher
    const d3 = a(M4({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3' }), { ...ja('soest.altstadt'), ...nein('soest.schaufenster', 'soest.vordach') });
    for (const nr of ['8', '9']) expect(d3(`nw-05974040/altstadtsatzung/${nr}`), `§ ${nr}`).toBe('gruen');
  });

  /* ---------- Runde 7 ---------- */

  /** ganzes Ergebnis je Paragraf (für Hinweise) */
  const voll = (merkmale: Record<string, string>, fakten: Record<string, FaktWert> = {}) => {
    const r = auswerten(eingabe(merkmale, fakten, TEXTE));
    return (id: string) => r.paragrafen.find((x) => x.id === id)!;
  };
  /** Bestandsangaben eines großen Gebäudes – bei der Beseitigung ohne Bedeutung für Errichtung und Betrieb */
  const bestand = () => ({
    ...ja('technik.feuerstaette', 'technik.waermepumpe', 'technik.brennstofflager', 'technik.heizoel', 'technik.lueftung', 'gebaeude.aufzug', 'gebaeude.behelfsbau', 'nw.elt_betriebsraum', 'nw.feste_brennstoffe_50kw', 'gebaeude.gemischt', 'gebaeude.oeffentlich', 'vorhaben.werbeanlage', 'vorhaben.dachhaut'),
    ...zahl('gebaeude.gastbetten', 80), ...zahl('gebaeude.besucher', 300), ...zahl('gebaeude.hoehe', 25), ...zahl('gebaeude.verkaufsflaeche', 2500),
    ...zahl('gebaeude.garage_nutzflaeche', 1500), ...zahl('gebaeude.stellplaetze', 60), ...zahl('gebaeude.bgf', 8000), ...zahl('nw.geschosse_oberirdisch', 8), ...zahl('nw.stellplatzflaeche', 900),
  });
  /** Regeln, die Errichtung oder Betrieb betreffen und bei der Beseitigung nicht gelten (Befund 2) */
  const nichtBeiBeseitigung = [
    'nw/baupruefvo/9', 'nw/baupruefvo/12', 'nw/baupruefvo/14',
    'nw/bauo-nrw/10', 'nw/bauo-nrw/39', 'nw/bauo-nrw/42', 'nw/bauo-nrw/42a', 'nw/bauo-nrw/45', 'nw/bauo-nrw/50', 'nw/bauo-nrw/51', 'nw/bauo-nrw/72',
    'nw/sbauvo/1', 'nw/sbauvo/47', 'nw/sbauvo/55', 'nw/sbauvo/60', 'nw/sbauvo/92', 'nw/sbauvo/143',
    ...['1', '3', '4', '5', '6', '7', '9', '10', '11', '12'].map((nr) => `nw/feuvo/${nr}`),
    ...['1', '4', '5', '6', '7', '8'].map((nr) => `nw/san-vo/${nr}`),
    'bund/whg/78c', 'bund/geig/6', 'bund/geig/7', 'bund/geig/10', 'bund/baugb/15', 'nw/svvo/16', 'nw/lwg/44',
    'nw-05974/hsg_bad_sassendorf/3', 'nw-05974/hsg_bad_sassendorf/9', 'nw-05974/uesg_ahse/2',
    'nw-05974040/altstadtsatzung/1', 'nw-05974040/altstadtsatzung/5a', 'nw-05974040/altstadtsatzung/14', 'nw-05974040/werbeanlagen_altstadt/2', 'nw-05974040/historische_ortsteile/6',
  ];
  /** Lage: Altstadt, historische Ortsteile, Heilquellenschutzzone III, Überschwemmungsgebiet (damit auch das Ortsrecht geprüft wird) */
  const lage = () => ({
    // (Heilquellenschutzgebiet seit Runde 12 nur mit „Wasser- oder Heilquellenschutzgebiet“ – dort wird erst gefragt)
    ...ja('soest.altstadt', 'soest.historische_ortsteile', 'schutz.wsg', 'kreis_soest.hsg', 'schutz.uesg'),
    ...wert('kreis_soest.hsg_qualitativ', 'III'), ...wert('kreis_soest.hsg_quantitativ', 'außerhalb'),
    ...nein('vorhaben.erdarbeiten', 'vorhaben.versickerung', 'vorhaben.grundwasser', 'vorhaben.erstbebauung', 'planung.planaufstellung', 'planung.fnp_verfahren', 'nw.blitzschutz_anlass'),
    // seit Runde 8 gefragt: keine Freitreppe zur Straße, keine notwendigen Stellplätze, die wegfallen; seit Runde 9
    // auch bei der Beseitigung: keine Einfriedigung zur Straße betroffen
    ...nein('soest.freitreppe', 'soest.stellplaetze_entfallen', 'soest.einfriedung'),
  });

  it('Runde 7: AVwGebO § 1 – Baugenehmigung für eine verfahrensfreie Beseitigung beantragt (§ 62 Abs. 3 Satz 2 BauO NRW) ist gebührenpflichtig', () => {
    // Fall N9: angebaute Garage, deren Errichtung verfahrensfrei wäre, im Denkmalbereich – Baugenehmigung beantragt
    const garage = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Nichtwohngebäude' });
    const f = { ...nein('gebaeude.freistehend'), ...ja('nw.beseitigung_abs1', 'schutz.denkmalbereich') };
    expect(a(garage, f)('nw/avwgebo/1')).toBe('rot');
    // auch das freistehende Einfamilienhaus der GK 1 mit Antrag im Baugenehmigungsverfahren
    expect(a(M4({ Vorhaben: 'Beseitigung', Verfahren: 'Baugenehmigungsverfahren' }), ja('gebaeude.freistehend'))('nw/avwgebo/1')).toBe('rot');
    // Gegenproben: ohne Antrag verfahrensfrei → grün (außerhalb des Denkmalbereichs; im Denkmalbereich offen wegen der
    // gesonderten denkmalrechtlichen Erlaubnis, Runde 8); Verfahren offen → nicht grün
    // (Baulast angegeben – offen ist sie seit Runde 11 ein Einzelfall wie Abweichung und Befreiung)
    expect(a(mitVerfahren(garage, 'verfahrensfrei'), { ...f, ...nein('lage.baulast', 'schutz.denkmal', 'schutz.denkmal_umgebung', 'schutz.denkmalbereich', 'schutz.denkmalbereich_umgebung', 'schutz.bodendenkmal', 'schutz.gartendenkmal') })('nw/avwgebo/1')).toBe('gruen');
    expect(a(mitVerfahren(garage, 'verfahrensfrei'), f)('nw/avwgebo/1')).toBe('gelb');
    expect(a(mitVerfahren(garage), f)('nw/avwgebo/1')).not.toBe('gruen');
  });

  it('Runde 7: Beseitigung – Bestandsangaben (Sonderbau, Gastbetten, Feuerstätte, Aufzug, Ölheizung …) lösen keine Anforderungen an Errichtung oder Betrieb aus, klassenweit', () => {
    // Fall B7a: Hotel (Sonderbau) GK 5 freistehend – alle Bestandsangaben gesetzt, verfahrensfrei bzw. mit Antrag
    for (const Verfahren of ['verfahrensfrei', 'vereinfachtes Verfahren']) {
      const hotel = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '5', Sonderbau: 'ja', Verfahren });
      // (Einfriedigungspflicht beantwortet – seit Runde 11 auch beim Abbruch freistehender Gebäude gefragt)
      const x = a(hotel, { ...bestand(), ...lage(), ...ja('gebaeude.freistehend'), ...nein('soest.einfriedungspflicht') });
      for (const id of nichtBeiBeseitigung) expect(x(id), `${id} (${Verfahren})`).toBe('gruen');
      // kein falsches Grün: Artenschutz beim Abbruch, Genehmigungsvorbehalt und Verfahrensfreiheit bleiben
      for (const id of ['bund/bnatschg/44', 'nw/bauo-nrw/60', 'nw/bauo-nrw/62']) expect(x(id), `${id} (${Verfahren})`).toBe('rot');
    }
    // Fall B7c: Einfamilienhaus GK 1 – Angaben zu Gebäude und Technik offen: kein Fehl-Gelb
    const efh = a(M4({ Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' }), { ...lage(), ...ja('gebaeude.freistehend'), ...nein('soest.einfriedungspflicht') });
    for (const id of nichtBeiBeseitigung) expect(efh(id), `${id} (B7c)`).toBe('gruen');
    // Gegenproben: dasselbe Gebäude als Neubau – die Anforderungen gelten bzw. sind zu prüfen
    const neu = a(M4({ Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '5', Sonderbau: 'ja', Verfahren: 'Baugenehmigungsverfahren' }), { ...bestand(), ...lage(), ...ja('gebaeude.freistehend') });
    for (const id of ['nw/baupruefvo/9', 'nw/baupruefvo/12', 'nw/bauo-nrw/39', 'nw/bauo-nrw/42', 'nw/bauo-nrw/50', 'nw/bauo-nrw/51', 'nw/sbauvo/1', 'nw/sbauvo/47', 'nw/sbauvo/55', 'nw/sbauvo/60', 'nw/sbauvo/92', 'nw/sbauvo/143', 'nw/feuvo/3', 'nw/feuvo/11', 'nw/san-vo/1', 'nw/san-vo/6', 'bund/whg/78c', 'nw-05974/hsg_bad_sassendorf/3', 'nw-05974/uesg_ahse/2', 'nw-05974040/altstadtsatzung/14', 'nw-05974040/werbeanlagen_altstadt/2']) expect(neu(id), `${id} (Neubau)`).toBe('rot');
    for (const id of ['bund/geig/7']) expect(neu(id), `${id} (Neubau)`).not.toBe('gruen');
    // Änderung mit bestehender Feuerstätte bzw. Aufzug: weiterhin rot
    const umbau = a(M4({ Vorhaben: 'Änderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '4' }), ja('technik.feuerstaette', 'gebaeude.aufzug'));
    for (const id of ['nw/bauo-nrw/39', 'nw/bauo-nrw/42', 'nw/feuvo/3']) expect(umbau(id), `${id} (Änderung)`).toBe('rot');
  });

  it('Runde 7: § 12 BauO NRW – Beseitigung eines freistehenden Gebäudes mit Erdarbeiten: Tragfähigkeit des Nachbarbaugrunds im Einzelfall', () => {
    // Fall A1: freistehendes Einfamilienhaus GK 1, verfahrensfrei, mit Erdarbeiten (Keller, Fundamente)
    const a1 = M4({ Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' });
    expect(a(a1, { ...ja('gebaeude.freistehend', 'vorhaben.erdarbeiten'), ...nein('lage.bergbau') })('nw/bauo-nrw/12')).toBe('gelb');
    // Gegenproben: ohne Erdarbeiten grün; angebaut rot (Standsicherheit der Nachbargebäude)
    expect(a(a1, { ...ja('gebaeude.freistehend'), ...nein('vorhaben.erdarbeiten', 'lage.bergbau') })('nw/bauo-nrw/12')).toBe('gruen');
    expect(a(a1, { ...nein('gebaeude.freistehend', 'vorhaben.erdarbeiten', 'lage.bergbau') })('nw/bauo-nrw/12')).toBe('rot');
  });

  it('Runde 7: Altstadtsatzung §§ 12, 13, 15 – nur mit Arbeiten an Einfriedigung, Außenanlagen bzw. Garage; Innenumbau nicht rot', () => {
    const ids = ['12', '13', '15'].map((nr) => `nw-05974040/altstadtsatzung/${nr}`);
    const mfh = M4({ Vorhaben: 'Änderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' });
    // Fall X8: Innenumbau, Garage im Bestand, keine Stellplätze geplant – ohne die Angaben offen (Runde 8: auch beim
    // Innenumbau können Einfriedigung, Außenanlagen oder Garage mitgebaut werden), mit „nein“ grün
    const x8f = { ...ja('soest.altstadt'), ...nein('vorhaben.dach_fassade', 'vorhaben.stellplaetze_grundstueck'), ...zahl('gebaeude.garage_nutzflaeche', 30) };
    for (const id of ids) expect(a(mfh, x8f)(id), `${id} (X8 offen)`).toBe('gelb');
    const x8 = a(mfh, { ...x8f, ...nein('soest.einfriedung', 'soest.aussenanlagen', 'soest.garage', 'soest.freitreppe') });
    for (const id of ids) expect(x8(id), `${id} (X8)`).toBe('gruen');
    // Fall DM2: Fenstertausch (Arbeiten an der Fassade) – ohne Angabe offen, mit „nein“ grün
    const dm2 = { ...ja('soest.altstadt', 'vorhaben.dach_fassade'), ...nein('vorhaben.stellplaetze_grundstueck'), ...zahl('gebaeude.garage_nutzflaeche', 30) };
    for (const id of ids) expect(a(mfh, dm2)(id), `${id} (DM2 offen)`).toBe('gelb');
    const dm2nein = a(mfh, { ...dm2, ...nein('soest.einfriedung', 'soest.aussenanlagen', 'soest.garage', 'soest.freitreppe') });
    for (const id of ids) expect(dm2nein(id), `${id} (DM2)`).toBe('gruen');
    // Gegenproben: die Arbeiten sind angegeben → rot, auch beim Innenumbau
    expect(a(mfh, { ...dm2, ...ja('soest.einfriedung') })(ids[0])).toBe('rot');
    expect(a(mfh, { ...dm2, ...ja('soest.aussenanlagen') })(ids[1])).toBe('rot');
    expect(a(mfh, { ...dm2, ...ja('soest.garage') })(ids[2])).toBe('rot');
    // Neubau mit Garage: Außenanlagen und Garage rot, Einfriedigung offen
    const neu = a(M4(), { ...ja('soest.altstadt'), ...zahl('gebaeude.garage_nutzflaeche', 30) });
    expect(neu(ids[1])).toBe('rot');
    expect(neu(ids[2])).toBe('rot');
    expect(neu(ids[0])).not.toBe('gruen');
    // Beseitigung in der Altstadt: Gestaltung entfällt – bis auf die Freitreppen (§ 13 Abs. 4, Runde 8),
    // straßenseitige Einfriedigungen (§ 12, Runde 9) und die Baulücke beim Abbruch angebauter Gebäude (Runde 10) –
    // hier ein freistehendes Gebäude
    // (Runde 11: auch beim Abbruch eines freistehenden Gebäudes wird nach der Einfriedigungspflicht gefragt)
    const weg = a(M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' }), { ...ja('soest.altstadt', 'gebaeude.freistehend'), ...nein('soest.freitreppe', 'soest.einfriedung', 'soest.einfriedungspflicht'), ...zahl('gebaeude.garage_nutzflaeche', 30) });
    for (const id of ids) expect(weg(id), `${id} (Beseitigung)`).toBe('gruen');
  });

  it('Runde 7: Stellplatzsatzung §§ 1, 2 – Anlagen, die keine Gebäude sind, nur mit Zu-/Abfahrtsverkehr (wie §§ 3, 4)', () => {
    const ids = ['1', '2'].map((nr) => `nw-05974040/stellplatzsatzung/${nr}`);
    // Fälle E4, KG4: freistehende Wärmepumpe bzw. Einfriedung ohne Verkehr
    const ohne = a(anlage({ Verfahren: 'verfahrensfrei' }), nein('vorhaben.zu_abfahrtsverkehr'));
    for (const id of ids) expect(ohne(id), id).toBe('gruen');
    // Fall KG1: Stellplatzanlage für einen Markt – Herstellungspflicht rot
    const mit = a(anlage({ Planungsrecht: 'Bebauungsplan' }), { ...ja('vorhaben.zu_abfahrtsverkehr'), ...zahl('nw.stellplatzflaeche', 40) });
    for (const id of ids) expect(mit(id), `${id} (KG1)`).toBe('rot');
    // Gegenproben: ohne Angabe nicht grün; Gebäude rot
    for (const id of ids) expect(a(anlage())(id), `${id} (offen)`).not.toBe('gruen');
    for (const id of ids) expect(a(M4())(id), `${id} (Gebäude)`).toBe('rot');
  });

  it('Runde 7: SV-VO § 12 – kein Einzelfall bei verfahrensfreien Vorhaben (keine Prüfung, § 68 Abs. 3 Satz 5 BauO NRW)', () => {
    // Fälle X10 (Garage 45 m²), DM3 (Gartenhaus), BA1 (Garage mit Abweichung)
    const garage = M4({ Gebäudeart: 'Nichtwohngebäude', Verfahren: 'verfahrensfrei' });
    const f = { ...zahl('gebaeude.bgf', 45), ...zahl('gebaeude.garage_nutzflaeche', 40), ...nein('gebaeude.landwirtschaft') };
    expect(a(garage, f)('nw/svvo/12')).toBe('gruen');
    expect(a(garage, { ...f, ...ja('planung.abweichung') })('nw/svvo/12')).toBe('gruen');
    // Gegenproben: dieselbe Garage im vereinfachten Verfahren bzw. Verfahren offen – nicht grün
    expect(a(mitVerfahren(garage, 'vereinfachtes Verfahren'), f)('nw/svvo/12')).not.toBe('gruen');
    expect(a(mitVerfahren(garage), f)('nw/svvo/12')).not.toBe('gruen');
  });

  it('Runde 7: § 45 BauO NRW – Gebäudeklasse 4/5 allein macht Blitzschutz nicht rot; beim Sonderbau Einzelfall', () => {
    for (const Gebäudeklasse of ['4', '5']) expect(a(M4({ Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse }), nein('nw.blitzschutz_anlass'))('nw/bauo-nrw/45'), `GK ${Gebäudeklasse}`).toBe('gruen');
    // Sonderbau ohne angegebenen Anlass: die SBauVO verlangt Blitzschutz teils ausdrücklich – gelb
    expect(a(M4({ Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '5', Sonderbau: 'ja' }), nein('nw.blitzschutz_anlass'))('nw/bauo-nrw/45')).toBe('gelb');
    // Gegenproben: mit Anlass rot, ohne Angabe nicht grün, bei der Beseitigung grün
    expect(a(M4({ Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '4' }), ja('nw.blitzschutz_anlass'))('nw/bauo-nrw/45')).toBe('rot');
    expect(a(M4({ Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '5' }))('nw/bauo-nrw/45')).not.toBe('gruen');
    expect(a(M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '5' }), ja('nw.blitzschutz_anlass'))('nw/bauo-nrw/45')).toBe('gruen');
  });

  it('Runde 7: SBauVO Teile 2–4, § 50 BauO NRW und Spielplatzsatzung nur für Gebäude – Mobilfunkmast mit 30 m Höhe', () => {
    // Fall KG2: Mast 30 m im Außenbereich (Höhe nicht über 30 m → kein großer Sonderbau nach § 50 Abs. 2)
    const mast = anlage({ Planungsrecht: 'Außenbereich' });
    const kg2 = a(mast, { ...zahl('gebaeude.hoehe', 30), ...ja('nw.blitzschutz_anlass'), ...nein('vorhaben.zu_abfahrtsverkehr') });
    for (const id of ['nw/sbauvo/47', 'nw/sbauvo/55', 'nw/sbauvo/60', 'nw/sbauvo/92', 'nw/bauo-nrw/50', ...['1', '2', '3', '4'].map((nr) => `nw-05974040/spielplatzsatzung/${nr}`)]) expect(kg2(id), id).toBe('gruen');
    expect(kg2('nw/bauo-nrw/45')).toBe('rot');
    // Gegenproben: Mast über 30 m → Sonderbau im Einzelfall; Gebäude über 22 m → Hochhaus
    expect(a(mast, zahl('gebaeude.hoehe', 35))('nw/bauo-nrw/50')).toBe('gelb');
    const hoch = a(M4({ Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '5' }), zahl('gebaeude.hoehe', 25));
    expect(hoch('nw/sbauvo/92')).toBe('rot');
    expect(hoch('nw/bauo-nrw/50')).toBe('gelb');
    expect(a(M4({ Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' }), zahl('gebaeude.wohnungen', 6))('nw-05974040/spielplatzsatzung/2')).toBe('rot');
  });

  it('Runde 7: § 63 BauO NRW – Abweichung von einer örtlichen Bauvorschrift bei der Genehmigungsfreistellung: Hinweis', () => {
    // Fall F2: Mehrfamilienhaus GK 3 im Bebauungsplan, Abweichung von der Gestaltungssatzung beabsichtigt
    const f2 = M4({ Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3', Planungsrecht: 'Bebauungsplan', Verfahren: 'Genehmigungsfreistellung' });
    const mit = voll(f2, { ...ja('ortsrecht.abweichung'), ...nein('planung.befreiung') })('nw/bauo-nrw/63');
    expect(mit.ampel).toBe('rot');
    expect(mit.hinweise.join(' ')).toMatch(/Abweichung von einer örtlichen Bauvorschrift .*schließt die Freistellung aus/);
    // Gegenprobe: keine Abweichung, keine Befreiung, kein großes Vorhaben → kein Einzelfall-Hinweis
    const ohne = voll(f2, { ...nein('ortsrecht.abweichung', 'planung.befreiung'), ...zahl('gebaeude.bgf', 600), ...zahl('gebaeude.besucher', 0) })('nw/bauo-nrw/63');
    expect(ohne.ampel).toBe('rot');
    expect(ohne.hinweise.join(' ')).not.toMatch(/Im Einzelfall prüfen/);
  });

  it('Runde 7: § 33 BauGB entfällt, wenn die Planreife verneint ist', () => {
    // Fall G2: Innenbereich, Plan in Aufstellung, keine Planreife
    expect(a(M4(), { ...ja('planung.planaufstellung'), ...nein('planung.planreife') })('bund/baugb/33')).toBe('gruen');
    // Gegenproben: Planreife ja → rot; Planreife offen → nicht grün
    expect(a(M4(), ja('planung.planaufstellung', 'planung.planreife'))('bund/baugb/33')).toBe('rot');
    expect(a(M4(), ja('planung.planaufstellung'))('bund/baugb/33')).not.toBe('gruen');
  });

  it('Runde 7: § 36 BauO NRW – sonstige Gebäude der GK 1 und 2 brauchen notwendige Flure nur im Kellergeschoss (gelb statt rot)', () => {
    // Fall GM1: Einfamilienhaus mit Arztpraxis (gemischt) GK 1; Fall X10: Garage GK 1
    expect(a(M4(), ja('gebaeude.gemischt'))('nw/bauo-nrw/36')).toBe('gelb');
    expect(a(M4({ Gebäudeart: 'Nichtwohngebäude', Verfahren: 'verfahrensfrei' }))('nw/bauo-nrw/36')).toBe('gelb');
    // Gegenproben: reines Wohngebäude GK 1/2 grün; Gebäudeklasse 3 rot; Nutzungsänderung im Mehrfamilienhaus GK 3 nicht grün
    expect(a(M4(), nein('gebaeude.gemischt'))('nw/bauo-nrw/36')).toBe('gruen');
    expect(a(M4({ Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3' }))('nw/bauo-nrw/36')).toBe('rot');
    expect(a(M4({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' }))('nw/bauo-nrw/36')).not.toBe('gruen');
  });

  /* ---------- Runde 8 ---------- */

  const altstadt = (m: Record<string, string>, f: Record<string, FaktWert> = {}) => a(m, { ...ja('soest.altstadt'), ...f });

  it('Runde 8: Altstadtsatzung §§ 12, 13, 15 – Arbeiten an Einfriedigung, Außenanlagen oder Garage sind rot, auch beim Innenumbau (keine Ausnahme schlägt die Angabe)', () => {
    const innen = M4({ Vorhaben: 'Änderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' });
    const f = { ...nein('vorhaben.dach_fassade', 'vorhaben.stellplaetze_grundstueck'), ...zahl('gebaeude.garage_nutzflaeche', 30) };
    // Fälle A1–A3: Änderung im Wallring, Dach/Fassade nein, aber Arbeiten an Einfriedigung, Außenanlagen bzw. Garage
    expect(altstadt(innen, { ...f, ...ja('soest.einfriedung') })('nw-05974040/altstadtsatzung/12')).toBe('rot');
    expect(altstadt(innen, { ...f, ...ja('soest.aussenanlagen') })('nw-05974040/altstadtsatzung/13')).toBe('rot');
    expect(altstadt(innen, { ...f, ...ja('soest.garage') })('nw-05974040/altstadtsatzung/15')).toBe('rot');
    // Carport ohne Garagen-Nutzfläche: § 15 gilt trotzdem
    expect(altstadt(innen, { ...f, ...zahl('gebaeude.garage_nutzflaeche', 0), ...ja('soest.garage') })('nw-05974040/altstadtsatzung/15')).toBe('rot');
    // Gegenproben: offen → gelb (gefragt), „nein“ → grün
    for (const nr of ['12', '13', '15']) expect(altstadt(innen, f)(`nw-05974040/altstadtsatzung/${nr}`), `§ ${nr} offen`).toBe('gelb');
    const alleNein = altstadt(innen, { ...f, ...nein('soest.einfriedung', 'soest.aussenanlagen', 'soest.garage', 'soest.freitreppe') });
    for (const nr of ['12', '13', '15']) expect(alleNein(`nw-05974040/altstadtsatzung/${nr}`), `§ ${nr} nein`).toBe('gruen');
  });

  it('Runde 8: Teilabbruch und Abbruch mit Ersatzbau – „Beseitigung“ nur beim vollständigen Abbruch; sonst wie eine Änderung bzw. offen', () => {
    const mfh = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3', Verfahren: 'vereinfachtes Verfahren' });
    const voll = (w?: boolean) => (w === undefined ? { [UMFANG]: { wert: null, herkunft: 'manuell' as const, sicherheit: 'sicher' as const } } : { [UMFANG]: sicher(w ? 'vollständiger Abbruch ohne Ersatzbau' : 'Teilabbruch') });
    const ids = ['nw/bauo-nrw/6', 'nw/bauo-nrw/29', 'nw/bauo-nrw/35', 'nw/baupruefvo/3', 'bund/baugb/34'];
    // Angabe offen: keine Anforderung an Errichtung/Änderung still „gilt nicht“
    const offen = a(mfh, voll());
    for (const id of ids) expect(offen(id), `${id} (offen)`).not.toBe('gruen');
    // Teilabbruch (nicht vollständig): wie eine Änderung – die Anforderungen gelten
    const teil = a(mfh, voll(false));
    const aenderung = a({ ...mfh, Vorhaben: 'Änderung' });
    for (const id of ids) expect(teil(id), `${id} (Teilabbruch)`).toBe(aenderung(id));
    // Gegenprobe: vollständiger Abbruch – Anforderungen an die Errichtung entfallen, die Anzeige gilt
    const ganz = a(mfh, { ...voll(true), ...nein('gebaeude.freistehend') });
    for (const id of ['nw/bauo-nrw/29', 'nw/bauo-nrw/35']) expect(ganz(id), `${id} (vollständig)`).toBe('gruen');
    expect(ganz('nw/bauo-nrw/62')).toBe('rot');
  });

  it('Runde 8: Stellplatzsatzung §§ 4, 6 – Beseitigung notwendiger Stellplätze ist nicht „gilt nicht“', () => {
    // Fall A4: Beseitigung einer Garage mit zwei Stellplätzen
    const garage = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Nichtwohngebäude', Verfahren: 'verfahrensfrei' });
    const f = { ...ja('gebaeude.freistehend'), ...zahl('gebaeude.garage_nutzflaeche', 30) };
    for (const nr of ['4', '6']) {
      expect(a(garage, f)(`nw-05974040/stellplatzsatzung/${nr}`), `§ ${nr} offen`).toBe('gelb');
      expect(a(garage, { ...f, ...ja('soest.stellplaetze_entfallen') })(`nw-05974040/stellplatzsatzung/${nr}`), `§ ${nr} ja`).toBe('rot');
      // Gegenprobe: keine notwendigen Stellplätze betroffen → grün
      expect(a(garage, { ...f, ...nein('soest.stellplaetze_entfallen') })(`nw-05974040/stellplatzsatzung/${nr}`), `§ ${nr} nein`).toBe('gruen');
    }
    // beim Neubau gilt § 4 wie bisher und – seit Runde 9 – auch § 6 (Abs. 1 Satz 1: notwendige Stellplätze nicht
    // hergestellt ist ordnungswidrig)
    expect(a(M4())('nw-05974040/stellplatzsatzung/4')).toBe('rot');
    expect(a(M4())('nw-05974040/stellplatzsatzung/6')).toBe('rot');
  });

  it('Runde 8: Altstadtsatzung § 13 Abs. 4 (und § 1) – Freitreppen an öffentlichen Verkehrsflächen dürfen nicht beseitigt werden', () => {
    // Fälle N1, R1, R11: Beseitigung im Wallring
    const weg = M4({ Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' });
    // keine Einfriedigung zur Straße betroffen (sonst bliebe § 1 über § 12 offen, Runde 9)
    const f = { ...ja('gebaeude.freistehend'), ...nein('soest.einfriedung', 'soest.einfriedungspflicht') };
    for (const nr of ['1', '13']) {
      expect(altstadt(weg, f)(`nw-05974040/altstadtsatzung/${nr}`), `§ ${nr} offen`).toBe('gelb');
      expect(altstadt(weg, { ...f, ...ja('soest.freitreppe') })(`nw-05974040/altstadtsatzung/${nr}`), `§ ${nr} ja`).toBe('rot');
      expect(altstadt(weg, { ...f, ...nein('soest.freitreppe') })(`nw-05974040/altstadtsatzung/${nr}`), `§ ${nr} nein`).toBe('gruen');
    }
    // Reparatur der Freitreppe bei einer Änderung: § 13 gilt (Abs. 4 Satz 2)
    const umbau = M4({ Vorhaben: 'Änderung' });
    expect(altstadt(umbau, { ...nein('soest.aussenanlagen', 'vorhaben.stellplaetze_grundstueck'), ...ja('soest.freitreppe') })('nw-05974040/altstadtsatzung/13')).toBe('rot');
  });

  it('Runde 8: AVwGebO § 1 – Abweichung oder Befreiung auch bei verfahrensfreiem Vorhaben und Freistellung; Freistellung nicht „entfällt“; Anzeige ohne Tarifstelle', () => {
    const keinDenkmal = nein('schutz.denkmal', 'schutz.denkmal_umgebung', 'schutz.denkmalbereich', 'schutz.denkmalbereich_umgebung', 'schutz.bodendenkmal', 'schutz.gartendenkmal');
    // (Baulast angegeben – offen ist sie seit Runde 11 ein Einzelfall wie Abweichung und Befreiung)
    const keineAbw = nein('planung.abweichung', 'planung.befreiung', 'ortsrecht.abweichung', 'lage.baulast');
    // Fälle BA1, V1: verfahrensfreie Garage mit Abweichung bzw. Befreiung
    const garage = M4({ Gebäudeart: 'Nichtwohngebäude', Verfahren: 'verfahrensfrei' });
    for (const abw of ['planung.abweichung', 'planung.befreiung', 'ortsrecht.abweichung']) expect(a(garage, { ...keinDenkmal, ...keineAbw, ...ja(abw) })('nw/avwgebo/1'), abw).toBe('rot');
    // Fall F5: Freistellung mit Befreiung rot; Fall A8: Freistellung ohne – gelb (Gebühr auf Antrag), nicht grün
    const frei = M4({ Verfahren: 'Genehmigungsfreistellung' });
    expect(a(frei, { ...keinDenkmal, ...keineAbw, ...ja('planung.befreiung') })('nw/avwgebo/1')).toBe('rot');
    expect(a(frei, { ...keinDenkmal, ...keineAbw })('nw/avwgebo/1')).toBe('gelb');
    // Gegenproben: verfahrensfrei ohne Abweichung → grün; offen → gelb; anzuzeigende Beseitigung ohne Denkmal → grün
    expect(a(garage, { ...keinDenkmal, ...keineAbw })('nw/avwgebo/1')).toBe('gruen');
    expect(a(garage, keinDenkmal)('nw/avwgebo/1')).toBe('gelb');
    const anzeige = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3', Verfahren: 'verfahrensfrei' });
    expect(a(anzeige, { ...keinDenkmal, ...nein('gebaeude.freistehend', 'lage.baulast') })('nw/avwgebo/1')).toBe('gruen');
  });

  it('Runde 8: BauGB §§ 144, 145 – im vereinfachten Sanierungsverfahren ohne Genehmigungspflicht (Soest: alle Satzungen schließen § 144 aus)', () => {
    // Fälle A7, R2: Sanierungsgebiet in Soest
    expect(a(M4(), ja('planung.sanierungsgebiet'))('bund/baugb/144')).toBe('gruen');
    expect(a(M4(), ja('planung.sanierungsgebiet'))('bund/baugb/145')).toBe('gruen');
    // andere Gemeinde: ohne Angabe offen, mit „nicht ausgeschlossen“ rot, mit „ausgeschlossen“ grün
    const werl = (f: Record<string, FaktWert>) => inGemeinde('05974052', M4(), { ...ja('planung.sanierungsgebiet'), ...f })('bund/baugb/144').ampel;
    expect(werl({})).toBe('gelb');
    expect(werl(nein('planung.sanierung_144_ausgeschlossen'))).toBe('rot');
    expect(werl(ja('planung.sanierung_144_ausgeschlossen'))).toBe('gruen');
    // Gegenprobe: kein Sanierungsgebiet → grün
    expect(werl(nein('planung.sanierungsgebiet'))).toBe('gruen');
  });

  it('Runde 8: Festsetzungen eines Plans in Aufstellung binden erst bei Planreife (§ 33 BauGB)', () => {
    // Fall P1: Außenbereich, Plan in Aufstellung, Planreife nein → grün; Fall PR2: Planreife offen → gelb
    const aussen = M4({ Planungsrecht: 'Außenbereich' });
    const fest = (f: Record<string, FaktWert>) => a(aussen, { ...ja('planung.planaufstellung'), ...nein('soest.bplan_entwurf'), ...f })('nw-05974040/bebauungsplan/Festsetzungen');
    expect(fest(nein('planung.planreife'))).toBe('gruen');
    expect(fest({})).toBe('gelb');
    // Gegenproben: planreif → rot; Bebauungsplan → rot
    expect(fest(ja('planung.planreife'))).toBe('rot');
    expect(a(M4({ Planungsrecht: 'Bebauungsplan' }))('nw-05974040/bebauungsplan/Festsetzungen')).toBe('rot');
  });

  it('Runde 8: LNatSchG §§ 39, 41 – rot nur mit der eigenen Angabe (geschützte Hecke/Ausgleichspflanzung, Allee), sonst gelb', () => {
    // Fall R3: Baumfällung im Innenbereich
    const faellen = (f: Record<string, FaktWert>) => a(M4(), { ...ja('vorhaben.baeume_faellen'), ...f });
    expect(faellen({})('nw/lnatschg/39')).toBe('gelb');
    expect(faellen(ja('schutz.hecke_ausgleich'))('nw/lnatschg/39')).toBe('rot');
    expect(faellen(nein('schutz.hecke_ausgleich'))('nw/lnatschg/39')).toBe('gruen');
    // § 41: geschützter Baum (Baumschutzsatzung) ohne Angabe zur Allee gelb, Allee rot, keine Allee grün
    expect(a(M4(), ja('schutz.baum'))('nw/lnatschg/41')).toBe('gelb');
    expect(a(M4(), ja('schutz.baum', 'schutz.allee'))('nw/lnatschg/41')).toBe('rot');
    expect(a(M4(), { ...ja('schutz.baum'), ...nein('schutz.allee') })('nw/lnatschg/41')).toBe('gruen');
    // Gegenproben: keine Fällung bzw. keine geschützten Bäume → grün
    expect(a(M4(), nein('vorhaben.baeume_faellen'))('nw/lnatschg/39')).toBe('gruen');
    expect(a(M4(), nein('schutz.baum'))('nw/lnatschg/41')).toBe('gruen');
  });

  it('Runde 8: Altstadtsatzung §§ 4, 6, 7, 10, 11, 14 – Nutzungsänderung ohne Arbeiten an Dach oder Fassade grün', () => {
    // Fall A5: Büro → Laden in der Altstadt, Dach/Fassade nein, keine Wärmepumpe/Lüftung
    const na = M4({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3' });
    const f = nein('vorhaben.dach_fassade', 'technik.waermepumpe', 'technik.lueftung');
    for (const nr of ['4', '6', '7', '10', '11', '14']) {
      expect(altstadt(na, f)(`nw-05974040/altstadtsatzung/${nr}`), `§ ${nr}`).toBe('gruen');
      // Gegenprobe: mit Arbeiten an der Fassade bzw. ohne Angabe – im Einzelfall prüfen
      expect(altstadt(na, { ...f, ...ja('vorhaben.dach_fassade') })(`nw-05974040/altstadtsatzung/${nr}`), `§ ${nr} Fassade`).toBe('gelb');
      expect(altstadt(na)(`nw-05974040/altstadtsatzung/${nr}`), `§ ${nr} offen`).not.toBe('gruen');
    }
  });

  it('Runde 8: Fernwärmesatzung §§ 2, 3 – bei der Beseitigung kein Fehl-Gelb aus der Angabe „Heizung“', () => {
    // Fall R4: Beseitigung in der Britischen Siedlung, Heizung offen
    const weg = a(M4({ Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' }), ja('soest.fernwaerme', 'gebaeude.freistehend'));
    for (const nr of ['2', '3']) expect(weg(`nw-05974040/fernwaerme/${nr}`), `§ ${nr}`).toBe('gruen');
    // Gegenprobe: Neubau eines beheizten Gebäudes im Gebiet → rot
    const neu = a(M4(), ja('soest.fernwaerme', 'gebaeude.beheizt'));
    for (const nr of ['2', '3']) expect(neu(`nw-05974040/fernwaerme/${nr}`), `§ ${nr} Neubau`).toBe('rot');
  });

  it('Runde 8: § 62 BauO NRW – Hinweis auf § 53 Abs. 2 Satz 2 und die Anzeige des Beginns der Beseitigung', () => {
    const r = auswerten(eingabe(M4({ Vorhaben: 'Beseitigung' }), { [UMFANG]: sicher('vollständiger Abbruch ohne Ersatzbau') }, TEXTE));
    const p = r.paragrafen.find((x) => x.id === 'nw/bauo-nrw/62')!;
    expect(p.hinweise.join(' ')).toMatch(/§ 53 Abs\. 2 Satz 2/);
    expect(p.hinweise.join(' ')).toMatch(/§ 74 Abs\. 8/);
  });

  /* ---------- Runde 9 ---------- */

  const umfang = (w?: string) => (w === undefined ? { [UMFANG]: { wert: null, herkunft: 'manuell' as const, sicherheit: 'sicher' as const } } : { [UMFANG]: sicher(w) });

  it('Runde 9: Abbruch mit Ersatzbau wird wie eine Errichtung geprüft (Neubau-Normen rot), Teilabbruch wie eine Änderung, offen nie grün', () => {
    // Fälle E1/E1N: Mehrfamilienhaus als Ersatzbau nach Abbruch
    const m = M4({ Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' });
    const f = ja('gebaeude.beheizt', 'vorhaben.dachhaut', 'gebaeude.freistehend');
    const neubau = ['bund/geg/10', 'bund/geg/16', 'nw/bauo-nrw/42a', 'nw/san-vo/1', 'bund/strlschg/123', 'bund/bnatschg/18'];
    const errichtung = a(m, f);
    const ersatz = a({ ...m, Vorhaben: 'Beseitigung' }, { ...f, ...umfang('Abbruch mit Ersatzbau') });
    for (const id of neubau) {
      expect(errichtung(id), `${id} (Errichtung)`).toBe('rot');
      expect(ersatz(id), `${id} (Ersatzbau)`).toBe('rot');
      expect(a({ ...m, Vorhaben: 'Beseitigung' }, { ...f, ...umfang() })(id), `${id} (offen)`).not.toBe('gruen');
    }
    // der Abbruch selbst gehört beim Ersatzbau dazu (Artenschutz beim Abbruch)
    expect(ersatz('bund/bnatschg/44')).toBe('rot');
    // Teilabbruch: wie eine Änderung
    const teil = a({ ...m, Vorhaben: 'Beseitigung' }, { ...f, ...umfang('Teilabbruch') });
    const aenderung = a({ ...m, Vorhaben: 'Änderung' }, f);
    for (const id of [...neubau, 'nw/bauo-nrw/6', 'nw/bauo-nrw/35']) expect(teil(id), `${id} (Teilabbruch)`).toBe(aenderung(id));
    // Gegenprobe: vollständiger Abbruch ohne Ersatzbau – Neubau-Normen entfallen
    const ganz = a({ ...m, Vorhaben: 'Beseitigung' }, { ...f, ...umfang('vollständiger Abbruch ohne Ersatzbau') });
    for (const id of ['bund/geg/10', 'nw/bauo-nrw/42a', 'nw/san-vo/1']) expect(ganz(id), `${id} (vollständig)`).toBe('gruen');
    // Hinweise passend zum Umfang – auch für den offenen Fall
    const titel = (w?: string) => auswerten(eingabe({ ...m, Vorhaben: 'Beseitigung' }, { ...f, ...umfang(w) }, TEXTE)).hinweise.map((h) => h.titel);
    expect(titel()).toContain('Umfang der Beseitigung offen');
    expect(titel()).not.toContain('Teilabbruch');
    expect(titel('Teilabbruch')).toContain('Teilabbruch');
    expect(titel('Abbruch mit Ersatzbau')).toContain('Abbruch mit Ersatzbau');
    expect(titel('vollständiger Abbruch ohne Ersatzbau')).not.toContain('Umfang der Beseitigung offen');
  });

  it('Runde 9: Umfang der Beseitigung fehlt nur, wo er etwas entscheidet („Vorhaben oder Beseitigung“ ohne Frage)', () => {
    const m = M4({ Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' });
    const r = auswerten(eingabe(m, { ...umfang(), ...ja('planung.veraenderungssperre', 'schutz.denkmal'), ...nein('gebaeude.freistehend') }, TEXTE));
    for (const id of ['nw/bauo-nrw/60', 'bund/baugb/14', 'nw/dschg/9', 'nw/bauo-nrw/12']) {
      const p = r.paragrafen.find((x) => x.id === id)!;
      expect(p.automatisch, id).toBe('rot');
      expect(p.offen, id).not.toContain(UMFANG);
    }
  });

  it('Runde 9: Altstadtsatzung § 12 – Einfriedigungspflicht bei Neubau bzw. Stellplatzanlage, auch ohne geplante Einfriedigung; Beseitigung einer straßenseitigen Einfriedigung', () => {
    const p12 = 'nw-05974040/altstadtsatzung/12';
    // Fall T5: EFH-Neubau mit Vorgarten, Einfriedigung „nicht geplant“
    const t5 = { ...nein('soest.einfriedung', 'vorhaben.stellplaetze_grundstueck') };
    expect(altstadt(M4(), t5)(p12), 'Pflicht offen').toBe('gelb');
    expect(altstadt(M4(), { ...t5, ...ja('soest.einfriedungspflicht') })(p12), 'Pflicht ja').toBe('rot');
    expect(altstadt(M4(), { ...t5, ...nein('soest.einfriedungspflicht') })(p12), 'Pflicht nein').toBe('gruen');
    // Fall T6: Stellplatzanlage mit 6 Stellplätzen (Änderung am Grundstück)
    expect(altstadt(M4({ Vorhaben: 'Änderung' }), { ...nein('soest.einfriedung'), ...ja('vorhaben.stellplaetze_grundstueck', 'soest.einfriedungspflicht') })(p12)).toBe('rot');
    // Fall B2J: Beseitigung einer Bruchsteinmauer zur Straße
    const weg = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'kein Gebäude', Verfahren: 'verfahrensfrei' });
    expect(altstadt(weg, { ...ja('soest.einfriedung'), ...nein('soest.freitreppe') })(p12)).toBe('rot');
    expect(altstadt(weg, { ...nein('soest.einfriedung', 'soest.freitreppe') })(p12)).toBe('gruen');
    // Innenumbau ohne Arbeiten am Grundstück: die Pflicht wird nicht gefragt und nichts gilt
    expect(altstadt(M4({ Vorhaben: 'Änderung' }), nein('soest.einfriedung', 'vorhaben.stellplaetze_grundstueck'))(p12)).toBe('gruen');
  });

  it('Runde 9: Stellplatzsatzung § 6 – Errichtung ohne notwendige Stellplätze und Wegfall bei Teilabbruch, Umbau oder Nutzungsänderung', () => {
    const p6 = 'nw-05974040/stellplatzsatzung/6';
    // Fall B1N: Teilabbruch, bei dem notwendige Stellplätze wegfallen
    const garage = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Nichtwohngebäude', Verfahren: 'verfahrensfrei' });
    expect(a(garage, { ...umfang('Teilabbruch'), ...ja('soest.stellplaetze_entfallen') })(p6)).toBe('rot');
    // Fall T4: Garage wird Wohnraum (Nutzungsänderung) – Zweckentfremdung
    expect(a(M4({ Vorhaben: 'Nutzungsänderung' }), ja('soest.stellplaetze_entfallen'))(p6)).toBe('rot');
    // Errichtung: Herstellungspflicht nach § 2 – ihre Verletzung ist ordnungswidrig
    expect(a(M4())(p6)).toBe('rot');
    // Gegenprobe: vollständiger Abbruch einer Anlage, deren Stellplätze nicht notwendig sind
    expect(a(garage, { ...umfang('vollständiger Abbruch ohne Ersatzbau'), ...nein('soest.stellplaetze_entfallen') })(p6)).toBe('gruen');
  });

  it('Runde 9: AVwGebO § 1 – keine Gebühr für die Erlaubnis nach § 9 DSchG; Einzelfall nur bei Bodendenkmälern (Tarifstelle 3.3.1)', () => {
    const ohne = nein('planung.abweichung', 'planung.befreiung', 'ortsrecht.abweichung', 'lage.baulast');
    // Fall G2: verfahrensfreies Gartenhaus in der Umgebung eines Baudenkmals
    const g2 = M4({ Gebäudeart: 'Nichtwohngebäude', Verfahren: 'verfahrensfrei' });
    expect(a(g2, { ...ohne, ...ja('schutz.denkmal_umgebung'), ...nein('schutz.denkmal', 'schutz.bodendenkmal') })('nw/avwgebo/1')).toBe('gruen');
    // mit Bodendenkmal und Erdarbeiten: Erlaubnis nach § 15 DSchG – Gebühr möglich
    expect(a(g2, { ...ohne, ...ja('schutz.bodendenkmal', 'vorhaben.erdarbeiten') })('nw/avwgebo/1')).toBe('gelb');
    // Gegenprobe: mit Baugenehmigung gilt der Tarif
    expect(a(M4(), ohne)('nw/avwgebo/1')).toBe('rot');
  });

  it('Runde 9: Bebauungsplan „Festsetzungen“ – Planreife auch bei einem Plan im Verfahren laut Dienst; bei vollständigem Abbruch Einzelfall statt rot', () => {
    const defs = faktDefinitionen(aktiveModule(paket.module, SOEST));
    expect(werten(defs['planung.planreife'].wenn!, { merkmale: {}, fakten: { 'soest.bplan_entwurf': sicher(true), 'planung.planaufstellung': sicher(false) }, einreichung: '2026-12-01', heute: HEUTE, bausteine: Object.assign({}, ...paket.module.map((x) => x.bausteine ?? {})) }).w).toBe('ja');
    const bplan = { Planungsrecht: 'Bebauungsplan' };
    const fest = 'nw-05974040/bebauungsplan/Festsetzungen';
    expect(a(M4({ ...bplan, Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' }), umfang('vollständiger Abbruch ohne Ersatzbau'))(fest)).toBe('gelb');
    expect(a(M4({ ...bplan, Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' }), umfang('Teilabbruch'))(fest)).toBe('rot');
    expect(a(M4(bplan))(fest)).toBe('rot');
  });

  it('Runde 9: Altstadtsatzung § 1 nur, wenn eine Gestaltungsvorschrift greift; § 18 Einzelfall nur bei Wirkung nach außen', () => {
    // Fall T1: Innenumbau, alles verneint
    const innen = M4({ Vorhaben: 'Änderung' });
    const nichts = nein('vorhaben.dach_fassade', 'vorhaben.werbeanlage', 'soest.einfriedung', 'soest.aussenanlagen', 'soest.garage', 'soest.freitreppe', 'soest.dachaufbauten', 'soest.solaranlage', 'vorhaben.stellplaetze_grundstueck', 'technik.waermepumpe', 'technik.lueftung', 'planung.abweichung', 'ortsrecht.abweichung', 'vorhaben.dachhaut');
    expect(altstadt(innen, nichts)('nw-05974040/altstadtsatzung/1')).toBe('gruen');
    expect(altstadt(innen, nichts)('nw-05974040/altstadtsatzung/18')).toBe('gruen');
    // Gegenprobe: Arbeiten an der Fassade – Gestaltung greift, der Beirat kann verlangt werden
    const fassade = { ...nichts, ...ja('vorhaben.dach_fassade') };
    expect(altstadt(innen, fassade)('nw-05974040/altstadtsatzung/1')).toBe('rot');
    expect(altstadt(innen, fassade)('nw-05974040/altstadtsatzung/18')).toBe('gelb');
  });

  it('Runde 9: LNatSchG § 39 nennt geförderte Anpflanzungen (Abs. 1 Nr. 1); § 62-Hinweis mit Abs. 3 Satz 7', () => {
    const defs = faktDefinitionen(aktiveModule(paket.module, SOEST));
    expect(defs['schutz.hecke_ausgleich'].titel).toMatch(/Geförderte Anpflanzung/);
    const r = auswerten(eingabe(M4({ Vorhaben: 'Beseitigung' }), umfang('vollständiger Abbruch ohne Ersatzbau'), TEXTE));
    expect(r.paragrafen.find((x) => x.id === 'nw/bauo-nrw/62')!.hinweise.join(' ')).toMatch(/Abs\. 3 Satz 7 mit § 74 Abs\. 8/);
  });
  it('Runde 10: Ersatzbau – der Abbruch ist von der Baugenehmigung des Neubaus nur erfasst, wenn er verfahrensfrei ist und mit beantragt wurde (DSchG § 24)', () => {
    const p24 = 'nw/dschg/24';
    // Fall X3E: Baudenkmal EFH abbrechen, Ersatzbau im vereinfachten Verfahren
    const m = M4({ Vorhaben: 'Beseitigung' });
    const d = { ...ja('schutz.denkmal'), ...umfang('Abbruch mit Ersatzbau') };
    expect(a(m, d)(p24), 'Altbau offen').toBe('gelb');
    expect(a(m, { ...d, ...ja('nw.altbau_verfahrensfrei'), ...nein('nw.beseitigung_mit_beantragt') })(p24), 'nicht mit beantragt').toBe('rot');
    expect(a(m, { ...d, ...nein('nw.altbau_verfahrensfrei') })(p24), 'Altbau anzuzeigen').toBe('rot');
    expect(a(m, { ...d, ...ja('nw.altbau_verfahrensfrei', 'nw.beseitigung_mit_beantragt') })(p24), 'mit beantragt').toBe('gruen');
    // Gegenproben: Neubau mit Baugenehmigung, verfahrensfreie Beseitigung mit beantragter Genehmigung
    expect(a(M4(), ja('schutz.denkmal'))(p24)).toBe('gruen');
    expect(a(m, { ...ja('schutz.denkmal', 'gebaeude.freistehend'), ...umfang('vollständiger Abbruch ohne Ersatzbau') })(p24)).toBe('gruen');
  });

  it('Runde 10: Ersatzbau – das Verfahren für den Abbruch folgt aus dem Altbau, nicht aus den Merkmalen des Neubaus (BauPrüfVO §§ 2, 15, BauO § 74)', () => {
    // Fall X1E: Reihenhaus abbrechen, Ersatz: freistehendes EFH GK 1 in der Genehmigungsfreistellung
    const m = M4({ Vorhaben: 'Beseitigung', Planungsrecht: 'Bebauungsplan', Verfahren: 'Genehmigungsfreistellung' });
    const f = { ...ja('gebaeude.freistehend'), ...umfang('Abbruch mit Ersatzbau') };
    expect(a(m, f)('nw/baupruefvo/15'), 'Altbau offen').toBe('gelb');
    expect(a(m, f)('nw/baupruefvo/2'), 'Altbau offen').toBe('gelb');
    const anzeige = a(m, { ...f, ...nein('nw.altbau_verfahrensfrei') });
    for (const id of ['nw/baupruefvo/15', 'nw/baupruefvo/2', 'nw/bauo-nrw/74']) expect(anzeige(id), `${id} (Anzeige)`).toBe('rot');
    // Gegenprobe: verfahrensfreier Altbau ohne Genehmigungsverfahren – keine Bauvorlagen für den Abbruch
    expect(a(m, { ...f, ...ja('nw.altbau_verfahrensfrei') })('nw/baupruefvo/15')).toBe('gruen');
    // die Merkmale des Neubaus („freistehend, GK 1“) machen die Beseitigung nicht mehr verfahrensfrei
    expect(a(m, { ...f, ...nein('nw.altbau_verfahrensfrei') })('nw/bauo-nrw/62')).toBe('rot');
  });

  it('Runde 10: Teilabbruch an einem angebauten Gebäude – Einzelfall statt „entfällt“; ein angebautes eigenständiges Gebäude ist eine Beseitigung', () => {
    const defs = faktDefinitionen(aktiveModule(paket.module, SOEST));
    expect(defs[UMFANG].hilfe).toMatch(/angebautes, eigenständiges Gebäude .*kein Teilabbruch/);
    expect(defs[UMFANG].hilfe).not.toMatch(/Teilabbruch \(z\. B\. Anbau/);
    // Fall S7: Teilabbruch, verfahrensfrei, angebaut
    const m = M4({ Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' });
    const angebaut = { ...umfang('Teilabbruch'), ...nein('gebaeude.freistehend') };
    expect(a(m, angebaut)('nw/baupruefvo/15')).toBe('gelb');
    expect(a(m, angebaut)('nw/bauo-nrw/74')).toBe('gelb');
    // Gegenprobe: Teilabbruch eines freistehenden Gebäudes – keine Bauvorlagen für eine Beseitigung
    expect(a(m, { ...umfang('Teilabbruch'), ...ja('gebaeude.freistehend') })('nw/baupruefvo/15')).toBe('gruen');
  });

  it('Runde 10: AVwGebO § 1 – Baulast „eingetragen oder nötig“: Gebühr für Eintragung bzw. Auskunft möglich (Tarifstelle 3.1.5.6)', () => {
    // Fall G4: verfahrensfreie Garage mit nötiger Baulast
    const g4 = M4({ Gebäudeart: 'Nichtwohngebäude', Verfahren: 'verfahrensfrei' });
    const ohne = nein('planung.abweichung', 'planung.befreiung', 'ortsrecht.abweichung', 'schutz.bodendenkmal');
    expect(a(g4, { ...ohne, ...ja('lage.baulast') })('nw/avwgebo/1')).toBe('gelb');
    expect(a(g4, { ...ohne, ...nein('lage.baulast') })('nw/avwgebo/1')).toBe('gruen');
    // Text: Grabungserlaubnis nach § 15 Abs. 1; § 15 Abs. 2 wie § 9 gebührenfrei
    const r = auswerten(eingabe(g4, { ...ohne, ...ja('lage.baulast') }, TEXTE)).paragrafen.find((x) => x.id === 'nw/avwgebo/1')!;
    expect(r.gruende.join(' ')).toMatch(/§ 15 Abs\. 1 DSchG/);
    expect(r.gruende.join(' ')).toMatch(/§ 15 Abs\. 2 DSchG ist gebührenfrei/);
  });

  it('Runde 10: Altstadtsatzung § 12 – auch beim Abbruch eines angebauten Gebäudes (Fläche zwischen Gebäuden zur Straße)', () => {
    const p12 = 'nw-05974040/altstadtsatzung/12';
    // Fall S2/X4V: Reihenhaus abbrechen
    const m = M4({ Vorhaben: 'Beseitigung' });
    const f = { ...nein('soest.einfriedung', 'gebaeude.freistehend'), ...umfang('vollständiger Abbruch ohne Ersatzbau') };
    expect(altstadt(m, f)(p12), 'Pflicht offen').toBe('gelb');
    expect(altstadt(m, { ...f, ...ja('soest.einfriedungspflicht') })(p12), 'Baulücke zur Straße').toBe('rot');
    // Gegenprobe: freistehendes Hinterhaus – keine Fläche zur Straße (seit Runde 11 gefragt, mit „nein“ grün)
    expect(altstadt(m, { ...f, ...ja('gebaeude.freistehend'), ...nein('soest.einfriedungspflicht') })(p12)).toBe('gruen');
    // Frage: „zu öffentlichen Verkehrsflächen hin“ auch für Gärten, Lagerplätze, Stellplatzanlagen (Nr. 2)
    const defs = faktDefinitionen(aktiveModule(paket.module, SOEST));
    expect(defs['soest.einfriedungspflicht'].hilfe).toMatch(/Rückwärtige Gärten ohne Grenze zur Verkehrsfläche zählen nicht/);
  });

  it('Runde 10: StrWG § 25 entfällt beim vollständigen Abbruch; Entwässerungssatzung nur, soweit ein Anschluss betroffen ist', () => {
    // Fall S1: Scheune an der Landesstraße abbrechen
    const scheune = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3', Planungsrecht: 'Außenbereich', Verfahren: 'verfahrensfrei' });
    expect(a(scheune, { ...ja('lage.strasse_ausserorts', 'gebaeude.freistehend'), ...umfang('vollständiger Abbruch ohne Ersatzbau') })('nw/strwg/25')).toBe('gruen');
    expect(a(M4({ Planungsrecht: 'Außenbereich' }), ja('lage.strasse_ausserorts'))('nw/strwg/25')).toBe('rot');
    const e = (nr: string) => `nw-05974040/entwaesserungssatzung/${nr}`;
    // Fall S3: Gartenmauer ohne Entwässerung
    const mauer = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'kein Gebäude', Verfahren: 'verfahrensfrei' });
    expect(a(mauer, { ...nein('vorhaben.entwaesserung'), ...umfang('vollständiger Abbruch ohne Ersatzbau') })(e('14'))).toBe('gruen');
    // Fall S4: EFH abbrechen, Kanalanschluss zurückbauen – § 14 (Abbruch mitteilen), nicht §§ 9, 15
    const efh = M4({ Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' });
    const s4 = a(efh, { ...ja('vorhaben.entwaesserung', 'gebaeude.freistehend'), ...umfang('vollständiger Abbruch ohne Ersatzbau') });
    expect(s4(e('14'))).toBe('rot');
    expect(s4(e('9'))).toBe('gruen');
    expect(s4(e('15'))).toBe('gruen');
    // Fall S5: Garage, Entwässerung nein – ob ein Anschlusskanal da ist, ist offen (Einzelfall)
    expect(a(efh, { ...nein('vorhaben.entwaesserung'), ...umfang('vollständiger Abbruch ohne Ersatzbau') })(e('14'))).toBe('gelb');
    // Gegenprobe Ersatzbau: der Neubau braucht den Anschluss
    expect(a(efh, { ...nein('vorhaben.entwaesserung'), ...umfang('Abbruch mit Ersatzbau') })(e('14'))).toBe('rot');
  });

  it('Runde 10: offener Umfang – wo jede Antwort zu „gilt“ führt, ist der Paragraf rot (§§ 64, 70, 74 BauO, BauPrüfVO §§ 1, 2, AVwGebO § 1, BNatSchG § 44)', () => {
    // Fall B5O: freistehendes EFH GK 1, Baugenehmigung beantragt, Umfang offen
    const m = M4({ Vorhaben: 'Beseitigung' });
    const o = a(m, { ...umfang(), ...ja('gebaeude.freistehend', 'vorhaben.baeume_faellen'), ...nein('planung.abweichung', 'planung.befreiung', 'ortsrecht.abweichung') });
    for (const id of ['nw/bauo-nrw/64', 'nw/bauo-nrw/70', 'nw/bauo-nrw/74', 'nw/baupruefvo/1', 'nw/baupruefvo/2', 'nw/avwgebo/1', 'bund/bnatschg/44']) expect(o(id), id).toBe('rot');
  });

  it('Runde 10: Hinweis „Gestaltungsbeirat“ wie § 18 (nicht bei einer Mauer); Bebauungsplan-Hinweis nennt den Erhaltungsbereich nach § 172 Abs. 1', () => {
    const titel = (m: Record<string, string>, f: Record<string, FaktWert> = {}) => auswerten(eingabe(m, { ...ja('soest.altstadt'), ...f }, TEXTE)).hinweise.map((h) => h.titel);
    const ohne = nein('planung.abweichung', 'ortsrecht.abweichung');
    expect(titel(M4({ Gebäudeart: 'kein Gebäude', Verfahren: 'verfahrensfrei' }), ohne)).not.toContain('Gestaltungsbeirat');
    expect(titel(M4(), ohne)).toContain('Gestaltungsbeirat');
    const r = auswerten(eingabe(M4({ Planungsrecht: 'Bebauungsplan', Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' }), umfang('vollständiger Abbruch ohne Ersatzbau'), TEXTE)).paragrafen.find((x) => x.id === 'nw-05974040/bebauungsplan/Festsetzungen')!;
    expect(r.gruende.join(' ')).toMatch(/§ 172 Abs\. 1 BauGB/);
    expect(r.gruende.join(' ')).not.toMatch(/Erhaltungsgebote \(§ 9 Abs\. 1 Nr\. 25 b/);
  });

  /* ---------- Runde 11 ---------- */

  it('Runde 11: Altstadtsatzung § 12 – auch beim Abbruch eines freistehenden Gebäudes und beim Teilabbruch wird nach der Einfriedigungspflicht gefragt', () => {
    const p12 = 'nw-05974040/altstadtsatzung/12';
    // Fall P1: freistehendes EFH an der Straße vollständig abbrechen, Einfriedigungspflicht „ja“ → rot
    const p1 = M4({ Vorhaben: 'Beseitigung' });
    const f1 = { ...ja('gebaeude.freistehend'), ...nein('soest.einfriedung'), ...umfang('vollständiger Abbruch ohne Ersatzbau') };
    expect(altstadt(p1, { ...f1, ...ja('soest.einfriedungspflicht') })(p12), 'P1 Pflicht ja').toBe('rot');
    expect(altstadt(p1, f1)(p12), 'P1 Pflicht offen').toBe('gelb');
    expect(altstadt(p1, { ...f1, ...nein('soest.einfriedungspflicht') })(p12), 'P1 Pflicht nein').toBe('gruen');
    // Fall P3: Teilabbruch eines straßenseitigen Flügels
    const f3 = { ...nein('soest.einfriedung', 'soest.aussenanlagen', 'soest.garage', 'soest.freitreppe', 'vorhaben.stellplaetze_grundstueck'), ...umfang('Teilabbruch') };
    expect(altstadt(p1, { ...f3, ...ja('soest.einfriedungspflicht') })(p12), 'P3 Pflicht ja').toBe('rot');
    expect(altstadt(p1, f3)(p12), 'P3 Pflicht offen').toBe('gelb');
    expect(altstadt(p1, { ...f3, ...nein('soest.einfriedungspflicht') })(p12), 'P3 Pflicht nein').toBe('gruen');
    // die Frage wird gestellt (Bedingung der Angabe erfüllt) – beim vollständigen Abbruch und beim Teilabbruch
    const defs = faktDefinitionen(aktiveModule(paket.module, SOEST));
    const bausteine = Object.assign({}, ...aktiveModule(paket.module, SOEST).map((m) => m.bausteine ?? {}));
    for (const f of [f1, f3]) expect(werten(defs['soest.einfriedungspflicht'].wenn, { merkmale: p1, fakten: { ...ja('soest.altstadt'), ...f }, einreichung: '2026-12-01', heute: '2026-11-12', bausteine }).w).toBe('ja');
  });

  it('Runde 11: AVwGebO § 1 – keine Genehmigungsfreistellung bei reiner Beseitigung; Baulast offen ist ein Einzelfall', () => {
    const ohne = nein('planung.abweichung', 'planung.befreiung', 'ortsrecht.abweichung', 'schutz.bodendenkmal', 'lage.baulast');
    // Fall V0Og2: vollständiger Abbruch eines angebauten EFH (anzuzeigen), Verfahren offen → grün, keine Freistellung
    const v0 = mitVerfahren(M4({ Vorhaben: 'Beseitigung', Gebäudeklasse: '2' }));
    expect(a(v0, { ...ohne, ...nein('gebaeude.freistehend'), ...umfang('vollständiger Abbruch ohne Ersatzbau') })('nw/avwgebo/1')).toBe('gruen');
    // Gegenprobe: Neubau mit offenem Verfahren bleibt offen (Freistellung möglich)
    expect(a(mitVerfahren(M4()), ohne)('nw/avwgebo/1')).not.toBe('gruen');
    // Fall G2: verfahrensfreie Beseitigung, Baulast offen → gelb; „nein“ → grün; „ja“ → gelb
    const g2 = M4({ Vorhaben: 'Beseitigung', Verfahren: 'verfahrensfrei' });
    const g2f = { ...nein('planung.abweichung', 'planung.befreiung', 'ortsrecht.abweichung', 'schutz.bodendenkmal'), ...ja('gebaeude.freistehend'), ...umfang('vollständiger Abbruch ohne Ersatzbau') };
    expect(a(g2, g2f)('nw/avwgebo/1')).toBe('gelb');
    expect(a(g2, { ...g2f, ...nein('lage.baulast') })('nw/avwgebo/1')).toBe('gruen');
    expect(a(g2, { ...g2f, ...ja('lage.baulast') })('nw/avwgebo/1')).toBe('gelb');
  });

  it('Runde 11: Satzangaben zu § 62 Abs. 3 BauO NRW; Fragen zur Verfahrensfreiheit des Abbruchs nicht beim Ersatzbau; Hinweise ohne Bezug beim reinen Abbruch', () => {
    const defs = faktDefinitionen(aktiveModule(paket.module, SOEST));
    expect(defs['nw.altbau_verfahrensfrei'].hilfe).toMatch(/anzuzeigen \(Satz 3\)/);
    expect(defs['nw.altbau_verfahrensfrei'].hilfe).toMatch(/\(Sätze 4, 5\)/);
    expect(defs['nw.altbau_verfahrensfrei'].hilfe).not.toMatch(/Satz 2\)|Satz 3, 4\)/);
    const bausteine = Object.assign({}, ...aktiveModule(paket.module, SOEST).map((m) => m.bausteine ?? {}));
    const ctx = (m: Record<string, string>, w: string) => ({ merkmale: m, fakten: { [UMFANG]: sicher(w) }, einreichung: '2026-12-01', heute: '2026-11-12', bausteine });
    const nwb = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Nichtwohngebäude' });
    const keinGeb = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'kein Gebäude' });
    // beim Ersatzbau nicht gefragt (zählt die Angabe zum Altbau), beim vollständigen Abbruch schon
    expect(werten(defs['nw.beseitigung_abs1'].wenn, ctx(nwb, 'Abbruch mit Ersatzbau')).w).toBe('nein');
    expect(werten(defs['nw.anlage_ueber_10m'].wenn, ctx(keinGeb, 'Abbruch mit Ersatzbau')).w).toBe('nein');
    expect(werten(defs['nw.beseitigung_abs1'].wenn, ctx(nwb, 'vollständiger Abbruch ohne Ersatzbau')).w).toBe('ja');
    expect(werten(defs['nw.anlage_ueber_10m'].wenn, ctx(keinGeb, 'vollständiger Abbruch ohne Ersatzbau')).w).toBe('ja');
    // Fall V2Og2: Hinweise zu GEG und Photovoltaik nicht beim reinen Abbruch, wohl beim Neubau
    const titel = (m: Record<string, string>, f: Record<string, FaktWert> = {}) => auswerten(eingabe(m, { ...ja('soest.altstadt'), ...f }, TEXTE)).hinweise.map((h) => h.titel);
    const weg = titel(M4({ Vorhaben: 'Beseitigung' }), umfang('vollständiger Abbruch ohne Ersatzbau'));
    expect(weg.some((t) => t.startsWith('Gebäudeenergiegesetz geändert'))).toBe(false);
    expect(weg).not.toContain('Photovoltaik und Solarthermie in der Altstadt');
    const neu = titel(M4());
    expect(neu.some((t) => t.startsWith('Gebäudeenergiegesetz geändert'))).toBe(true);
    expect(neu).toContain('Photovoltaik und Solarthermie in der Altstadt');
  });

  /* ---------- Runde 12 ---------- */

  /** Wird die Frage zur Angabe gestellt? (Bedingung `wenn` der Angabe) */
  const gefragt = (id: string, m: Record<string, string>, f: Record<string, FaktWert> = {}, ags = SOEST) => {
    const r = auswerten({ ...eingabe(m, f, TEXTE), module: aktiveModule(paket.module, ags), fakten: { 'lage.ags': sicher(ags), ...f } });
    const w = r.faktDefs[id]?.wenn;
    return !w || werten(w, r.kontext).w !== 'nein';
  };

  it('Runde 12: Heilquellenschutz Bad Sassendorf und Vogelschutzgebiet Hellwegbörde nur mit gestellter Frage; außerhalb Bad Sassendorf und Soest kein Heilquellenschutzgebiet', () => {
    const hsg = ['1', '3', '4', '5', '6', '9', '10'].map((nr) => `nw-05974/hsg_bad_sassendorf/${nr}`);
    const vsg = 'nw-05974/vsg_hellwegboerde/Schutzzweck';
    // Fall E1: Neubau in Soest, kein Wasser- bzw. Vogelschutzgebiet – Frage nach HSG/VSG nicht gestellt, Normen grün
    const r = auswerten(eingabe(M4(), nein('schutz.wsg', 'schutz.vsg'), TEXTE));
    for (const id of [...hsg, vsg]) expect(r.paragrafen.find((p) => p.id === id)!.automatisch, id).toBe('gruen');
    expect(r.klaerung.map((k) => k.id)).not.toEqual(expect.arrayContaining(['kreis_soest.hsg']));
    expect(r.klaerung.map((k) => k.id)).not.toContain('kreis_soest.vsg_hellweg');
    expect(gefragt('kreis_soest.hsg', M4(), nein('schutz.wsg'))).toBe(false);
    // Gegenproben: im Wasser- bzw. Heilquellenschutzgebiet wird gefragt; offen → nicht grün
    expect(gefragt('kreis_soest.hsg', M4(), ja('schutz.wsg'))).toBe(true);
    const x = a(M4(), { ...ja('schutz.wsg', 'schutz.vsg'), ...ja('vorhaben.erdarbeiten') });
    expect(x(hsg[0])).toBe('gelb');
    expect(x(vsg)).toBe('gelb');
    // Werl, Lippstadt: kein Heilquellenschutzgebiet (§ 1 der Verordnung) – auch im Wasserschutzgebiet grün
    for (const ags of ['05974052', '05974028']) {
      const w = inGemeinde(ags, M4(), ja('schutz.wsg'));
      for (const id of hsg) expect(w(id).automatisch, `${id} (${ags})`).toBe('gruen');
    }
    // Bad Sassendorf: hängt von der Lage ab – offen
    expect(inGemeinde('05974008', M4(), ja('schutz.wsg'))(hsg[0]).automatisch).toBe('gelb');
  });

  it('Runde 12: Entwässerung – bei Anlagen, die keine Gebäude sind, nur mit neuer oder geänderter Entwässerung (WHG § 55, Entwässerungssatzung §§ 9, 14, 15)', () => {
    const ids = ['bund/whg/55', ...['9', '14', '15'].map((nr) => `nw-05974040/entwaesserungssatzung/${nr}`)];
    // Fälle E5, K1, F2: Mauer, Mobilfunkmast, Freiflächen-PV ohne Entwässerung → grün
    const mauer = M4({ Gebäudeart: 'kein Gebäude', Verfahren: 'verfahrensfrei' });
    delete (mauer as Record<string, string>).Gebäudeklasse;
    // (ohne Stellplätze auf dem Grundstück – sonst bliebe § 9 Einzelfall für das Niederschlagswasser, Fall W9)
    const ohne = a(mauer, nein('vorhaben.entwaesserung', 'vorhaben.versickerung', 'vorhaben.stellplaetze_grundstueck'));
    for (const id of ids) expect(ohne(id), id).toBe('gruen');
    // Gegenproben: mit Entwässerung (Stellplatzanlage) rot; Neubau eines Gebäudes rot auch ohne Angabe
    const mit = a(mauer, { ...ja('vorhaben.entwaesserung'), ...nein('vorhaben.versickerung') });
    for (const id of ids) expect(mit(id), id).toBe('rot');
    const efh = a(M4(), nein('vorhaben.entwaesserung', 'vorhaben.versickerung'));
    for (const id of ids) expect(efh(id), id).toBe('rot');
    // Gebäudeart offen: nicht grün
    const offen = a({ Vorhaben: 'Errichtung', Planungsrecht: 'Innenbereich', Verfahren: 'verfahrensfrei', Sonderbau: 'nein' }, nein('vorhaben.entwaesserung', 'vorhaben.versickerung'));
    for (const id of ids) expect(offen(id), id).not.toBe('gruen');
  });

  it('Runde 12: Stellplätze nach § 48 Abs. 1 BauO NRW nur bei Zu- oder Abfahrtsverkehr – Gebäude ohne Aufenthaltsräume (Gartenhaus) fragen danach', () => {
    const ids = ['nw/bauo-nrw/48', 'nw/stellplatzvo/7', ...['1', '2', '3', '4', '6'].map((nr) => `nw-05974040/stellplatzsatzung/${nr}`)];
    // Fall H6: verfahrensfreies Gartenhaus 12 m² ohne Aufenthaltsräume, ohne Stellplätze → grün
    const haus = M4({ Gebäudeart: 'Nichtwohngebäude', Verfahren: 'verfahrensfrei' });
    const f = { ...nein('gebaeude.aufenthaltsraeume', 'soest.stellplaetze_entfallen'), ...zahl('gebaeude.nutzflaeche', 12) };
    expect(gefragt('vorhaben.zu_abfahrtsverkehr', haus, f)).toBe(true);
    const ohne = a(haus, { ...f, ...nein('vorhaben.zu_abfahrtsverkehr') });
    for (const id of ids) expect(ohne(id), id).toBe('gruen');
    // Gegenproben: Lagerhalle mit Anlieferung bzw. Gebäude mit Aufenthaltsräumen rot; Angabe offen → nicht grün
    const halle = a(haus, { ...f, ...ja('vorhaben.zu_abfahrtsverkehr') });
    for (const id of ids.slice(0, 5)) expect(halle(id), id).toBe('rot');
    expect(a(haus, ja('gebaeude.aufenthaltsraeume'))('nw/bauo-nrw/48')).toBe('rot');
    expect(a(haus, f)('nw/bauo-nrw/48')).toBe('gelb');
    // Wohngebäude: stets Zu- und Abfahrtsverkehr – nicht gefragt, rot auch ohne Angabe zu Aufenthaltsräumen
    expect(gefragt('vorhaben.zu_abfahrtsverkehr', M4())).toBe(false);
    expect(a(M4())('nw/bauo-nrw/48')).toBe('rot');
  });

  it('Runde 12: Altstadt § 12 – beim Teilabbruch und bei neuen Stellplätzen zählt nur die Fläche, die durch das Vorhaben entsteht', () => {
    const defs = faktDefinitionen(aktiveModule(paket.module, SOEST));
    // Runde 13: der Ersatzbau gehört zum Neubau („liegt oder entsteht“), „entsteht erst“ nur ohne Ersatzbau
    expect(defs['soest.einfriedungspflicht'].frage).toMatch(/^Neubau, auch Abbruch mit Ersatzbau: Liegt oder entsteht .*Abbruch ohne Ersatzbau, Teilabbruch oder neue Stellplätze: Entsteht eine solche Fläche erst durch das Vorhaben\?/);
    expect(defs['soest.einfriedungspflicht'].hilfe).toMatch(/vorhandener Vorgarten, an dem nichts geändert wird, muss nicht angepasst werden/);
    // Fall H7: Abbruch eines hinteren Anbaus, Vorgarten vorhanden, nichts entsteht neu → § 12 und § 1 nicht rot
    const p1 = M4({ Vorhaben: 'Beseitigung', Gebäudeklasse: '2' });
    const f = { ...nein('soest.einfriedung', 'soest.einfriedungspflicht', 'soest.aussenanlagen', 'soest.garage', 'soest.freitreppe', 'vorhaben.stellplaetze_grundstueck', 'vorhaben.dach_fassade', 'gebaeude.freistehend'), ...umfang('Teilabbruch') };
    expect(altstadt(p1, f)('nw-05974040/altstadtsatzung/12')).toBe('gruen');
    expect(altstadt(p1, { ...f, ...ja('soest.einfriedungspflicht') })('nw-05974040/altstadtsatzung/12')).toBe('rot');
  });

  it('Runde 12: GEG §§ 43–45 – die Heizungsart wird beim Neubau immer gefragt, bei der Änderung nur mit neuer Heizung', () => {
    const tech = ['technik.heizung_fossil', 'technik.solarthermie', 'technik.biomasse'];
    const ids = ['43', '44', '45'].map((nr) => `bund/geg/${nr}`);
    // Fall H1: Neubau, „Heizung eingebaut“ nein (Fernwärme) → gefragt; verneint → grün
    const f = { ...ja('gebaeude.beheizt'), ...nein('vorhaben.heizung') };
    for (const id of tech) expect(gefragt(id, M4(), f), id).toBe(true);
    const neu = a(M4(), { ...f, ...nein(...tech) });
    for (const id of ids) expect(neu(id), id).toBe('gruen');
    // Änderung ohne neue Heizung: nicht gefragt, grün
    const aend = M4({ Vorhaben: 'Änderung' });
    for (const id of tech) expect(gefragt(id, aend, f), id).toBe(false);
    for (const id of ids) expect(a(aend, f)(id), id).toBe('gruen');
    // kein Gebäude: nicht gefragt
    const mast = M4({ Gebäudeart: 'kein Gebäude' });
    for (const id of tech) expect(gefragt(id, mast, f), id).toBe(false);
  });

  it('Runde 12: Planreife nur bei Planaufstellung – Eingriffsregelung im Außenbereich ohne „Ausnahme möglich: Planreife“; Höhe und Bauweise bei Planreife gefragt', () => {
    const aussen = M4({ Planungsrecht: 'Außenbereich' });
    // (in Soest fragt die Stadt die Planreife auch bei einem Plan im Verfahren – hier keiner)
    const r = auswerten(eingabe(aussen, { ...nein('planung.planaufstellung', 'soest.bplan_entwurf'), ...ja('vorhaben.erdarbeiten') }, TEXTE));
    for (const id of ['bund/bnatschg/14', 'nw/lnatschg/30', 'nw/lnatschg/31', 'nw/lnatschg/33']) {
      const p = r.paragrafen.find((x) => x.id === id)!;
      expect(p.automatisch, id).toBe('rot');
      expect(p.offen, id).not.toContain('planung.planreife');
      expect(p.hinweise.join(' '), id).not.toMatch(/Planreife/);
    }
    expect(r.klaerung.map((k) => k.id)).not.toContain('planung.planreife');
    // Gegenprobe: Plan in Aufstellung, planreif → Eingriffsregelung entfällt (§ 18 Abs. 2 BNatSchG)
    const planreif = a(aussen, ja('planung.planaufstellung', 'planung.planreife', 'vorhaben.erdarbeiten'));
    expect(planreif('bund/bnatschg/14')).toBe('gruen');
    // Fall P1: Planreife im Außenbereich – Höhe und Bauweise nach dem Entwurf gefragt (§ 33 Abs. 1 Nr. 2 BauGB)
    for (const id of ['planung.hoehe_festgesetzt', 'planung.bauweise_festgesetzt']) {
      expect(gefragt(id, aussen, ja('planung.planaufstellung', 'planung.planreife')), id).toBe(true);
      expect(gefragt(id, aussen, nein('planung.planaufstellung', 'soest.bplan_entwurf')), id).toBe(false);
    }
    const p1 = a(aussen, { ...ja('planung.planaufstellung', 'planung.planreife'), ...nein('planung.hoehe_festgesetzt', 'planung.bauweise_festgesetzt') });
    expect(p1('bund/baunvo/18')).toBe('gruen');
    expect(p1('bund/baunvo/22')).toBe('gruen');
  });

  it('Runde 12: Beseitigung – eine offene Angabe, deren Antworten alle dasselbe ergeben, macht nicht gelb (BauPrüfVO §§ 1, 2, 15, BauO NRW § 74)', () => {
    const UMF = ['vollständiger Abbruch ohne Ersatzbau', 'Teilabbruch', 'Abbruch mit Ersatzbau'];
    // Fall E0Fjn: freistehendes Nichtwohngebäude GK 1, verfahrensfrei, Altbau verfahrensfrei, nicht mitbeantragt – Umfang offen
    const m = M4({ Vorhaben: 'Beseitigung', Gebäudeart: 'Nichtwohngebäude', Verfahren: 'verfahrensfrei' });
    const f = { ...ja('gebaeude.freistehend', 'nw.altbau_verfahrensfrei'), ...nein('nw.beseitigung_mit_beantragt', 'gebaeude.aufenthaltsraeume') };
    const offen = a(m, { ...f, ...umfang() });
    for (const id of ['nw/bauo-nrw/74', 'nw/baupruefvo/1', 'nw/baupruefvo/2', 'nw/baupruefvo/15']) {
      const je = UMF.map((u) => a(m, { ...f, ...umfang(u) })(id));
      expect(new Set(je).size, `${id}: ${je.join(', ')}`).toBe(1);
      // bei offenem Umfang ist die Frage zum Altbau nicht gestellt – ihre gespeicherte Antwort zählt nicht (Fachprüfung
      // Runde 15): kein Grün aus ihr, sondern „es fehlt: Umfang“
      if (je[0] === 'gruen') expect(offen(id), id).toBe('gelb');
      else expect(offen(id), id).toBe(je[0]);
    }
    // Fall E1Bjj: Ersatzbau im vereinfachten Verfahren, Abbruch mitbeantragt – Angabe zum Altbau offen: § 15 gilt so oder so
    const e = M4({ Vorhaben: 'Beseitigung', Gebäudeklasse: '3' });
    const g = { ...umfang('Abbruch mit Ersatzbau'), ...ja('nw.beseitigung_mit_beantragt', 'gebaeude.freistehend') };
    expect(a(e, { ...g, ...ja('nw.altbau_verfahrensfrei') })('nw/baupruefvo/15')).toBe('rot');
    expect(a(e, { ...g, ...nein('nw.altbau_verfahrensfrei') })('nw/baupruefvo/15')).toBe('rot');
    // Angabe zum Altbau offen: „mitbeantragt“ ist dann nicht gestellt, seine gespeicherte Antwort zählt nicht (Fachprüfung
    // Runde 15) – gelb mit „es fehlt: Altbau“, nicht rot aus einer verborgenen Antwort
    expect(a(e, g)('nw/baupruefvo/15')).toBe('gelb');
    // Gegenprobe: Altbau verfahrensfrei und nicht mitbeantragt → § 15 gilt nicht; offen → nicht grün
    const h = { ...umfang('Abbruch mit Ersatzbau'), ...ja('gebaeude.freistehend') };
    expect(a(e, { ...h, ...ja('nw.altbau_verfahrensfrei'), ...nein('nw.beseitigung_mit_beantragt') })('nw/baupruefvo/15')).toBe('gruen');
    expect(a(e, h)('nw/baupruefvo/15')).not.toBe('gruen');
  });

  it('Runde 12: GEIG §§ 6, 7 – Einzelfall „gemischt genutzt“ nur bei Gebäuden; § 29 BauO NRW bei nur einer Nutzungseinheit Einzelfall', () => {
    // Fall H3: Stellplatzanlage mit 40 Stellplätzen (kein Gebäude) → GEIG grün
    const anlage = M4({ Gebäudeart: 'kein Gebäude' });
    const h3 = a(anlage, { ...zahl('gebaeude.stellplaetze', 40) });
    expect(h3('bund/geig/6')).toBe('gruen');
    expect(h3('bund/geig/7')).toBe('gruen');
    // § 29: Halle bzw. Garage mit einer Nutzungseinheit → gelb (Abs. 2 Nr. 2 bis 4); mehrere → rot
    const halle = M4({ Gebäudeart: 'Nichtwohngebäude', Gebäudeklasse: '3' });
    const eine = auswerten(eingabe(halle, zahl('gebaeude.nutzungseinheiten', 1), TEXTE)).paragrafen.find((p) => p.id === 'nw/bauo-nrw/29')!;
    expect(eine.automatisch).toBe('gelb');
    expect(eine.gruende.join(' ')).toMatch(/Abs\. 2 Nr\. 2 bis 4/);
    expect(a(halle, zahl('gebaeude.nutzungseinheiten', 3))('nw/bauo-nrw/29')).toBe('rot');
    // Mehrfamilienhaus: mehrere Nutzungseinheiten auch ohne Angabe; Wohngebäude GK 1/2 entfällt (Abs. 6)
    expect(a(M4({ Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '4' }))('nw/bauo-nrw/29')).toBe('rot');
    expect(a(M4(), nein('gebaeude.gemischt'))('nw/bauo-nrw/29')).toBe('gruen');
  });

  it('Runde 15: § 47 Abs. 6 BauO NRW – Umnutzung von Nutzungseinheiten mit Aufenthaltsräumen zu Wohnraum (Fall T29)', () => {
    // Fall T29: Büro → vier Wohnungen im bestehenden Gebäude (GK 3)
    const t29 = M4({ Vorhaben: 'Nutzungsänderung', Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' });
    const f = zahl('gebaeude.wohnungen', 4);
    const r = (x: Record<string, FaktWert>) => auswerten(eingabe(t29, { ...f, ...x }, TEXTE));
    const umgenutzt = r(ja('nw.umnutzung_wohnraum'));
    const p = (id: string, a0 = umgenutzt) => a0.paragrafen.find((x) => x.id === `nw/bauo-nrw/${id}`)!;
    // Satz 2: §§ 29, 34, 36 nicht anzuwenden
    for (const nr of ['29', '34', '36']) expect(p(nr).ampel, `§ ${nr}`).toBe('gruen');
    // § 35: Abs. 1 und 3 bis 8 nicht – Abs. 2 bleibt (gilt, mit Hinweis)
    expect(p('35').ampel).toBe('rot');
    expect(p('35').hinweise.join(' ')).toMatch(/Abs\. 2/);
    // Satz 1: §§ 27, 28, 31, 32 gelten – nicht für bestehende Bauteile (Hinweis)
    for (const nr of ['27', '28', '31', '32']) {
      expect(p(nr).ampel, `§ ${nr}`).toBe('rot');
      expect(p(nr).hinweise.join(' '), `§ ${nr}`).toMatch(/bestehende Bauteile \(§ 47 Abs\. 6 Satz 1\)/);
    }
    // keine Umnutzung zu Wohnraum aus Aufenthaltsräumen (z. B. Scheune ohne Aufenthaltsräume): §§ 29, 34, 36 gelten
    const nicht = r(nein('nw.umnutzung_wohnraum'));
    for (const nr of ['29', '34', '36']) expect(p(nr, nicht).ampel, `§ ${nr}`).not.toBe('gruen');
    // offen: nicht grün, die Angabe klärt
    const offen = r({});
    for (const nr of ['29', '34', '36']) {
      expect(p(nr, offen).ampel, `§ ${nr}`).not.toBe('gruen');
      expect(p(nr, offen).klaerend ?? [], `§ ${nr}`).toContain('nw.umnutzung_wohnraum');
    }
    // bei einer Errichtung nicht gestellt – eine gespeicherte Antwort wirkt nicht
    const neubau = M4({ Gebäudeart: 'Mehrfamilienhaus', Gebäudeklasse: '3' });
    const mitAntwort = auswerten(eingabe(neubau, { ...f, ...ja('nw.umnutzung_wohnraum') }, TEXTE));
    const ohneAntwort = auswerten(eingabe(neubau, f, TEXTE));
    for (const nr of ['29', '34', '36']) expect(p(nr, mitAntwort).ampel, `§ ${nr}`).toBe(p(nr, ohneAntwort).ampel);
    // in § 47 Abs. 6 nicht genannte Paragrafen verweisen nicht darauf
    for (const nr of ['5', '8', '26', '37', '38', '40']) expect(p(nr).hinweise.join(' ') + p(nr).gruende.join(' '), `§ ${nr}`).not.toMatch(/47 Abs\. 6/);
  });

  it('Runde 15: Entwässerungssatzung § 9 – Anlage ohne Gebäude mit befestigter Fläche: Einzelfall Niederschlagswasser (Fall W9)', () => {
    const id = 'nw-05974040/entwaesserungssatzung/9';
    const anlage = M4({ Gebäudeart: 'kein Gebäude', Verfahren: 'Baugenehmigungsverfahren' });
    // Stellplatzanlage ohne neue Entwässerung: nicht grün – das Niederschlagswasser der befestigten Fläche
    const w9 = auswerten(eingabe(anlage, { ...nein('vorhaben.entwaesserung'), ...ja('vorhaben.stellplaetze_grundstueck') }, TEXTE)).paragrafen.find((x) => x.id === id)!;
    expect(w9.ampel).toBe('gelb');
    expect(w9.gruende.join(' ')).toMatch(/befestigter Fläche/);
    // ohne befestigte Fläche (z. B. Mast): entfällt; Angabe offen: nicht grün
    expect(a(anlage, nein('vorhaben.entwaesserung', 'vorhaben.stellplaetze_grundstueck'))(id)).toBe('gruen');
    expect(a(anlage, nein('vorhaben.entwaesserung'))(id)).not.toBe('gruen');
  });
});


describe('Werkzeuge', () => {
  it('index-pruefen: Laufnummer genau, keine mitgelieferte Signatur, Dateien wie im Repo', () => {
    const ausgabe = mkdtempSync(join(tmpdir(), 'regeln-index-'));
    try {
      // Artefakt wie „npm run index“: jede Datei kompakt, Pfade mit „__“
      const dateien: Record<string, { groesse: number; sha256: string }> = {};
      const hosts = new Set<string>();
      const lauf = (dir: string) => {
        for (const n of readdirSync(dir)) {
          const p = join(dir, n);
          if (statSync(p).isDirectory()) lauf(p);
          else if (n.endsWith('.json')) {
            const inhalt = JSON.parse(readFileSync(p, 'utf8')) as { hosts?: string[] };
            const pfad = relative(WURZEL, p).split('\\').join('/');
            const b = Buffer.from(JSON.stringify(inhalt), 'utf8');
            dateien[pfad] = { groesse: b.length, sha256: createHash('sha256').update(b).digest('hex') };
            writeFileSync(join(ausgabe, pfad.replace(/\//g, '__')), b);
            if (/^module\/[^/]+\/modul\.json$/.test(pfad)) for (const h of inhalt.hosts ?? []) hosts.add(h);
          }
        }
      };
      for (const d of ['module', 'texte']) lauf(join(WURZEL, d));
      const version = (JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8')) as { version: string }).version;
      const index = (paket: string) => writeFileSync(join(ausgabe, 'index.json'), JSON.stringify({ format: 1, paket, dateien, hosts: [...hosts].sort() }));
      const skript = join(WURZEL, 'werkzeuge', 'index-pruefen.mjs');
      const pruefen = (run?: string) => spawnSync(process.execPath, [skript, ausgabe], { env: { ...process.env, GITHUB_RUN_NUMBER: run ?? '' }, encoding: 'utf8' });
      index(`${version}-42`);
      expect(pruefen('42').status, pruefen('42').stderr).toBe(0);
      // ohne Laufnummer: nur das Format
      expect(pruefen().status).toBe(0);
      // fremde Laufnummer bzw. Unsinn
      expect(pruefen('41').status).toBe(1);
      index(`${version}-99999999`);
      expect(pruefen('42').status).toBe(1);
      index(`${version}-x`);
      expect(pruefen().status).toBe(1);
      // eine schon mitgelieferte Signatur
      index(`${version}-42`);
      writeFileSync(join(ausgabe, 'index.json.sig'), 'AAAA');
      const r = pruefen('42');
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/Signatur schon in der Ausgabe/);
      rmSync(join(ausgabe, 'index.json.sig'));
      // geänderte Regeldatei in der Ausgabe
      const eine = Object.keys(dateien).find((p) => p.startsWith('module/nw/bauo-nrw'))!;
      writeFileSync(join(ausgabe, eine.replace(/\//g, '__')), '{}');
      expect(pruefen('42').status).toBe(1);
    } finally {
      rmSync(ausgabe, { recursive: true, force: true });
    }
  });

  it('Quellen ohne Fassungsdatum (gii, Datei ohne Satzungsdatum) melden keine „neue Fassung ab heute“', () => {
    const datei = { art: 'datei' as const, url: 'https://example.org/s.pdf', format: 'pdf' as const };
    expect(ohneFassungsdatum({ quelle: datei, fassung: 'Datei vom 12.11.2026' })).toBe(true);
    expect(ohneFassungsdatum({ quelle: datei, fassung: 'vom 14.11.2023' })).toBe(false);
    expect(ohneFassungsdatum({ quelle: { art: 'gii', pfad: 'fstrg' }, fassung: 'Stand 30.07.2026' })).toBe(true);
    expect(ohneFassungsdatum({ quelle: { art: 'ris', eli: 'eli/bund/x' }, fassung: 'gültig ab 01.01.2026' })).toBe(false);
  });

  it('Norm mit Quelle „ris“, deren Fassung aus dem Rückfall auf gii stammt: maßgeblich ist die tatsächliche Quelle', () => {
    // so liefert fassungHolen den Rückfall (BauNVO, BNatSchG): die Fassung trägt quelle gii, nicht ris
    const ausRueckfall = { quelle: { art: 'gii' as const, pfad: 'baunvo' }, fassung: 'Stand: zuletzt geändert …' };
    expect(ohneFassungsdatum(ausRueckfall)).toBe(true);
    // Wächter und Werkzeuge verwenden die Quelle der Fassung, nicht die des Moduls
    for (const datei of ['test/rechtsstand.live.test.ts', 'werkzeuge/stand.werkzeug.ts', 'werkzeuge/fassung.werkzeug.ts']) {
      const text = readFileSync(join(WURZEL, datei), 'utf8');
      expect(text, datei).not.toMatch(/ohneFassungsdatum\(def/);
    }
  });
});
