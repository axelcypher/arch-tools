/**
 * Gemeinsame Hilfen der Tests über das ganze Regelpaket (paket.test.ts, fallmatrix.test.ts, fragen.test.ts): Paket,
 * Stichprobe bzw. volle Matrix (VOLL), Eingaben, passende Texte und vollständige Sätze von Fakten. Die großen
 * Matrizen stehen in eigenen Dateien, damit Vitest sie auf mehrere Worker verteilt (Release-Lauf: --maxWorkers=2).
 */
import type { AuswertungsEingabe } from '@core/baurecht/auswertung';
import type { TextStand } from '@core/baurecht/auswertung';
import { faktDefinitionen } from '@core/baurecht/auswertung';
import { aktiveModule } from '@core/baurecht/paket';
import type { FaktWert } from '@core/baurecht/typen';
import type { Fassung } from '@core/recht/typen';
import { paketLaden } from './laden';

export const paket = paketLaden();
export const SOEST = '05974040';

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

export const WERTE: Record<string, (string | undefined)[]> = {
  Vorhaben: ['Errichtung', 'Änderung', 'Nutzungsänderung', 'Beseitigung', undefined],
  Gebäudeart: ['Einfamilienhaus', 'Zweifamilienhaus', 'Mehrfamilienhaus', 'Nichtwohngebäude', 'kein Gebäude', undefined],
  Gebäudeklasse: ['1', '2', '4', undefined],
  Planungsrecht: ['Bebauungsplan', 'einfacher Bebauungsplan', 'Satzung nach BauGB', 'Innenbereich', 'Außenbereich', undefined],
  Verfahren: ['verfahrensfrei', 'Genehmigungsfreistellung', 'vereinfachtes Verfahren', undefined],
};

/**
 * Volle Matrizen (mehrere Minuten Rechenzeit, ohne Netz) nur in der CI (GitHub Actions setzt CI=true) oder mit VOLL=1.
 * Sonst – lokal, in Cloud-Sitzungen – eine feste Stichprobe, damit das Projekt in unter einer Minute durch ist statt
 * über zehn Minuten ohne Ausgabe zu laufen. Volle Prüfung lokal: VOLL=1 npx vitest run --project regeln (etwa 15 min).
 * REGELN_STICHPROBE=1 setzt die PR-CI, wenn der PR die Auswertung von LEXIO sicher nicht berührt
 * (scripts/regeln-matrix.mjs); auf main, im Release-Lauf und im Regel-Workflow bleibt es voll. VOLL=1 geht immer vor.
 */
export const VOLL = !!process.env.VOLL || (!!process.env.CI && !process.env.REGELN_STICHPROBE);
/** Zeitgrenze der großen Matrizen: voll großzügig (Windows-Runner), mit Stichprobe knapp – nichts läuft still minutenlang */
export const MATRIX_ZEIT = VOLL ? 600000 : 60000;
export const MATRIX_ZEIT_LANG = VOLL ? 900000 : 60000;
export const ggt = (a: number, b: number): number => (b ? ggt(b, a % b) : a);
/**
 * feste Stichprobe von `n` Elementen – mit VOLL die ganze Liste. Nicht „jedes k-te“: die Listen sind kartesische Produkte,
 * eine feste Schrittweite fiele mit der Schachtelung zusammen und ließe ganze Merkmalswerte aus. Deshalb Index i·p mod
 * Länge mit p nahe Länge·0,618 (goldener Schnitt) und teilerfremd zur Länge: verschieden, gestreut über alle Stellen.
 */
export function stichprobe<T>(liste: T[], n: number): T[] {
  return VOLL ? liste : stichprobeLokal(liste, n);
}
/** die Stichprobe selbst (auch ohne VOLL abrufbar – für den Test, dass sie jeden Merkmalswert erreicht) */
export function stichprobeLokal<T>(liste: T[], n: number): T[] {
  if (liste.length <= n) return liste;
  let p = Math.round(liste.length * 0.618);
  while (ggt(p, liste.length) !== 1) p++;
  return Array.from({ length: n }, (_, i) => (i * p) % liste.length)
    .sort((x, y) => x - y)
    .map((i) => liste[i]);
}

/**
 * kleine Auswahl aus einer Merkmalsmatrix (mit VOLL alle Kombinationen): in Fall j hat Merkmal d den Wert Nr.
 * (j · q_d) mod Anzahl, q_d teilerfremd zu den üblichen Anzahlen (2, 3, 4) – jedes Merkmal durchläuft so alle Werte,
 * sobald n mindestens so groß ist wie die längste Werteliste. Paare von Werten deckt die Auswahl nicht ab (dafür die
 * volle Matrix in der CI)
 */
export function matrixAuswahl(werte: Record<string, (string | undefined)[]>, n: number): Record<string, string>[] {
  if (VOLL) return [...kombinationen(werte)];
  const q = [1, 5, 7, 11, 13, 17];
  return Array.from({ length: n }, (_, j) => {
    const m: Record<string, string> = {};
    Object.entries(werte).forEach(([k, l], d) => {
      const w = l[(j * q[d % q.length]) % l.length];
      if (w) m[k] = w;
    });
    return m;
  });
}

export function* kombinationen(werte: Record<string, (string | undefined)[]>): Generator<Record<string, string>> {
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
export const schluessel = (m: Record<string, string>, namen: string[]) => namen.map((k) => m[k] ?? '–').join('|');

export const sicher = (wert: FaktWert['wert']): FaktWert => ({ wert, herkunft: 'manuell', sicherheit: 'sicher' });
export const HEUTE = '2026-11-12';

/** Texte aller Normen, deren Prüfsummen genau zu den Regeln passen (an der Quelle bestätigt) */
export function passendeTexte(): Map<string, TextStand> {
  const t = new Map<string, TextStand>();
  for (const [k, l] of paket.regeln) {
    const r = l[l.length - 1].regel;
    const summen: Record<string, string> = {};
    const paragrafen: Fassung['paragrafen'] = {};
    for (const [nr, p] of Object.entries(r.paragrafen)) {
      Object.assign(summen, p.stand ?? {});
      paragrafen[nr] = { titel: `§ ${nr}`, url: '', text: ['(1) …'] };
    }
    const fassung: Fassung = {
      id: r.norm,
      kurz: r.norm,
      titel: r.norm,
      fassung: '',
      url: '',
      paragrafen,
      gueltigAb: r.fassung,
      abgerufen: `${HEUTE}T08:00:00Z`,
      quelle: { art: 'gii', pfad: r.norm },
      summen,
      kennung: r.fassung,
    };
    t.set(k, { fassung, geprueft: `${HEUTE}T08:00:00Z` });
  }
  return t;
}

/** ein vollständiger Satz sicherer Fakten (alle Fakten der aktiven Module) */
export function alleFakten(art: 'nein' | 'ja'): Record<string, FaktWert> {
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

export function eingabe(merkmale: Record<string, string>, fakten: Record<string, FaktWert> = {}, texte = new Map<string, TextStand>()): AuswertungsEingabe {
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

export interface Lauf {
  name: string;
  fakten: Record<string, FaktWert>;
  texte: Map<string, TextStand>;
  werte: Record<string, (string | undefined)[]>;
}

export const TEXTE = passendeTexte();
// mit Texten und Fakten: die übrigen Werte der Merkmale, dazu Sonderbau
export const KLEIN: Record<string, (string | undefined)[]> = {
  Vorhaben: WERTE.Vorhaben,
  Gebäudeart: ['Einfamilienhaus', 'Mehrfamilienhaus', 'Nichtwohngebäude', undefined],
  Gebäudeklasse: ['3', '5', undefined],
  Planungsrecht: ['Bebauungsplan', 'Satzung nach BauGB', 'Außenbereich', undefined],
  Verfahren: ['Baugenehmigungsverfahren', 'verfahrensfrei', undefined],
  Sonderbau: ['ja', 'nein', undefined],
};
export const LAEUFE: Lauf[] = [
  { name: 'ohne Fakten, ohne Text', fakten: {}, texte: new Map(), werte: WERTE },
  // mit passenden Texten über alle Merkmalswerte – erst so werden grüne Pfade der Normen mit Text erreicht
  { name: 'Texte passend, alle Fakten nein', fakten: alleFakten('nein'), texte: TEXTE, werte: WERTE },
  { name: 'Texte passend, alle Fakten ja', fakten: alleFakten('ja'), texte: TEXTE, werte: WERTE },
  { name: 'Texte passend, alle Fakten nein, mit Sonderbau', fakten: alleFakten('nein'), texte: TEXTE, werte: KLEIN },
];

/** Auslöser einer Frage (Angaben im `wenn` einer anderen Angabe, auch über Bausteine) → die Angaben, deren Frage sie auslösen */
export const AUSLOESER: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const out = new Map<string, Set<string>>();
  const bausteine: Record<string, unknown> = Object.assign({}, ...aktiveModule(paket.module, SOEST).map((m) => m.bausteine ?? {}));
  for (const [id, d] of Object.entries(faktDefinitionen(aktiveModule(paket.module, SOEST)))) {
    const besucht = new Set<string>();
    const lauf = (k: unknown): void => {
      if (Array.isArray(k)) k.forEach(lauf);
      else if (k && typeof k === 'object') {
        const o = k as Record<string, unknown>;
        if (typeof o.f === 'string' && o.f !== id) out.set(o.f, (out.get(o.f) ?? new Set()).add(id));
        if (typeof o.$ === 'string' && !besucht.has(o.$)) {
          besucht.add(o.$);
          lauf(bausteine[o.$]);
        }
        Object.values(o).forEach(lauf);
      }
    };
    lauf(d.wenn);
  }
  return out;
})();
