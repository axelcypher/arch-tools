/**
 * Prüfungen über das ganze Regelpaket: Format, bekannte Fakten/Merkmale/Bausteine/Verweise, Prüfsummen eingetragen,
 * und eine Fallmatrix, die jede Regel mit allen Kombinationen der Merkmale (auch „nicht festgelegt“) auswertet.
 */
import { describe, expect, it } from 'vitest';
import type { AuswertungsEingabe } from '@core/baurecht/auswertung';
import type { TextStand } from '@core/baurecht/auswertung';
import { auswerten, faktDefinitionen } from '@core/baurecht/auswertung';
import { aktiveModule, paketPruefen } from '@core/baurecht/paket';
import type { FaktWert, ParagrafErgebnis } from '@core/baurecht/typen';
import type { Fassung } from '@core/recht/typen';
import { VORGABE_MERKMALE } from '@core/bedingung';
import { paketLaden } from './laden';

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
  Gebäudeart: ['Einfamilienhaus', 'Mehrfamilienhaus', 'Nichtwohngebäude', 'kein Gebäude', undefined],
  Gebäudeklasse: ['1', '3', '5', undefined],
  Planungsrecht: ['Bebauungsplan', 'einfacher Bebauungsplan', 'Innenbereich', 'Außenbereich', undefined],
  Verfahren: ['Genehmigungsfreistellung', 'vereinfachtes Verfahren', 'Baugenehmigungsverfahren', undefined],
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
const schluessel = (m: Record<string, string>) => Object.keys(WERTE).map((k) => m[k] ?? '–').join('|');

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
const KLEIN = { ...WERTE, Gebäudeklasse: ['1', '5', undefined], Verfahren: ['Genehmigungsfreistellung', 'vereinfachtes Verfahren', undefined] };
const LAEUFE: Lauf[] = [
  { name: 'ohne Fakten, ohne Text', fakten: {}, texte: new Map(), werte: WERTE },
  { name: 'Texte passend, alle Fakten nein', fakten: alleFakten('nein'), texte: TEXTE, werte: KLEIN },
  { name: 'Texte passend, alle Fakten ja', fakten: alleFakten('ja'), texte: TEXTE, werte: KLEIN },
];

describe('Fallmatrix', () => {
  it('kein falsches Grün: Ergänzen, Herabstufen, Text, Begründung', { timeout: 300000 }, () => {
    const fehler: string[] = [];
    const melde = (t: string) => {
      if (fehler.length < 40) fehler.push(t);
    };
    let gruenGesamt = 0;
    const geprueftHerab = new Set<string>();
    const geprueftText = new Set<string>();
    for (const lauf of LAEUFE) {
      const ergebnisse = new Map<string, Map<string, string>>();
      const gruen: { m: Record<string, string>; p: ParagrafErgebnis }[] = [];
      for (const m of kombinationen(lauf.werte)) {
        const a = auswerten(eingabe(m, lauf.fakten, lauf.texte));
        const ampeln = new Map<string, string>();
        for (const p of a.paragrafen) {
          ampeln.set(p.id, p.automatisch);
          if (!p.gruende.length) melde(`${lauf.name}: ${p.id} ohne Begründung`);
          if (p.automatisch === 'gruen') {
            if (p.offen.length) melde(`${lauf.name}: ${p.id} grün mit offenen Angaben ${p.offen.join(', ')}`);
            if (p.unsicher.length) melde(`${lauf.name}: ${p.id} grün mit unsicheren Angaben ${p.unsicher.join(', ')}`);
            gruen.push({ m, p });
          }
        }
        ergebnisse.set(schluessel(m), ampeln);
      }
      gruenGesamt += gruen.length;
      // 1. Ergänzen fehlender Merkmale
      for (const { m, p } of gruen)
        for (const [name, werte] of Object.entries(lauf.werte)) {
          if (m[name]) continue;
          for (const w of werte) {
            if (!w) continue;
            const r = ergebnisse.get(schluessel({ ...m, [name]: w }))?.get(p.id);
            if (r === 'rot') melde(`${lauf.name}: ${p.id} grün ohne ${name}, aber rot mit ${name}=${w} (${JSON.stringify(m)})`);
          }
        }
      // 2. Herabstufen: Bleibt ein Paragraf grün, wenn ein Fakt nur Hinweis ist, dann muss er auch ohne diesen Fakt
      //    grün sein – sonst wurde der Hinweis wie eine gesicherte Angabe behandelt (je Paragraf und Fakt einmal)
      for (const { m, p } of gruen)
        for (const v of p.verwendet) {
          if (v.includes(':') || !lauf.fakten[v] || geprueftHerab.has(`${p.id}|${v}`)) continue;
          geprueftHerab.add(`${p.id}|${v}`);
          const alsHinweis = { ...lauf.fakten, [v]: { ...lauf.fakten[v], sicherheit: 'hinweis' as const, grund: 'Test' } };
          const ohne = { ...lauf.fakten };
          delete ohne[v];
          const q1 = auswerten(eingabe(m, alsHinweis, lauf.texte)).paragrafen.find((x) => x.id === p.id)!;
          const q2 = auswerten(eingabe(m, ohne, lauf.texte)).paragrafen.find((x) => x.id === p.id)!;
          if (q1.automatisch === 'gruen' && q2.automatisch !== 'gruen') melde(`${lauf.name}: ${p.id} bleibt grün, obwohl „${v}“ nur Hinweis ist und ohne „${v}“ nicht grün wäre (${JSON.stringify(m)})`);
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
            if (q.automatisch === 'gruen' && !q.gruende[0].startsWith('Entfällt mit der Norm')) melde(`${lauf.name}: ${p.id} bleibt grün, obwohl der Text ${art} (${JSON.stringify(m)})`);
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
