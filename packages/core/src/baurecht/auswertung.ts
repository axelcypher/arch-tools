/**
 * Auswertung: Ampel je Paragraf (docs/baurecht-konzept.md, Abschnitt 7).
 *
 *  1. Norm nicht anwendbar (Geltung nein) → grün
 *  2. von Hand festgelegt → die Festlegung (überholt, wenn sich danach Ampel, Fakten oder Text geändert haben)
 *  3. Ausnahme greift (entfällt ja) → grün
 *  4. Tatbestand: ja → rot, nein → grün, offen → gelb
 *  5. zur sicheren Seite: aus Grün wird Gelb bei Einzelfall, „nur von Hand“, geändertem Text, unsicheren Fakten,
 *     Widerspruch Merkmal/Ableitung oder fehlendem Text; Rot bleibt Rot (mit Hinweis)
 *  6. Paragraf ohne Regel → gelb
 */

import { VORGABE_MERKMALE } from '../bedingung';
import type { Fassung } from '../recht/typen';
import { FAKTEN } from './fakten';
import type { Bewertung, KurzKontext, TextKontext } from './kurz';
import { kurzText, offenText, warumText, werten } from './kurz';
import type { Paket } from './paket';
import { regeldateiFuer } from './paket';
import { frageGestellt } from './fragen';
import { plusMonate } from '../recht/quellen';
import { ortGeaendert } from './ort';
import type { Ampel, FaktDef, FaktWert, Festlegung, Hinweis, Kurz, Modul, NormErgebnis, Ort, ParagrafErgebnis, ParagrafRegel, Wahrheit } from './typen';
import { faktStatus, fundstelleName, paragrafName, verweisName } from './typen';

export interface TextStand {
  fassung: Fassung | null;
  /** die vorige Fassung (Gegenüberstellung alt/neu) */
  vorige?: Fassung | null;
  fehler?: string;
  kuenftige?: { gueltigAb: string; url: string }[];
  /** letzte erfolgreiche Prüfung an der Quelle (ISO) – für die Altersgrenze des Rechtsstands */
  geprueft?: string;
  /** Stichtag, für den der Text geholt wurde (fehlt = unbekannt); passt er nicht zur Einreichung, trägt der Text kein Grün */
  stichtag?: string;
  /** zum Stichtag gilt laut Quelle schon eine neuere Fassung (ab diesem Tag), deren Text nicht vorliegt */
  ueberholtAb?: string;
}

/** so lange gilt ein Rechtsstand ohne erfolgreiche Prüfung an der Quelle (Tage) */
export const RECHTSSTAND_TAGE = 14;
/** so lange nach der Einreichung wird mit der Entscheidung gerechnet (Monate) – angekündigte Fassungen darin zählen */
export const ENTSCHEIDUNG_MONATE = 6;

export interface AuswertungsEingabe {
  paket: Paket;
  /** aktive Module (nach Gemeindeschlüssel) */
  module: Modul[];
  merkmale: Record<string, string>;
  fakten: Record<string, FaktWert>;
  /** geplante Einreichung und heute (JJJJ-MM-TT) */
  einreichung: string;
  heute: string;
  /** Texte je `modul/norm` (fehlt = noch nicht geholt bzw. Web-Version) */
  texte: Map<string, TextStand>;
  festlegungen: Record<string, Festlegung>;
  /** Merkmale, deren Wert der Ableitung widerspricht */
  widersprueche?: Set<string>;
  /** Merkmale, die aus einem anderen Grund als einem Widerspruch nicht gesichert sind (Name → Grund in Worten) */
  vorbehalte?: Record<string, string>;
  /** Ort des Vorhabens jetzt – Festlegungen zu einem anderen Ort sind überholt (fehlt = kein Vergleich) */
  ort?: Ort;
  /** Altersgrenze des Rechtsstands in Tagen (Vorgabe RECHTSSTAND_TAGE) */
  rechtsstandTage?: number;
  /** erwartete Dauer bis zur Entscheidung in Monaten (Vorgabe ENTSCHEIDUNG_MONATE) */
  entscheidungMonate?: number;
}

export interface Auswertung {
  normen: NormErgebnis[];
  /** alle Paragrafen */
  paragrafen: ParagrafErgebnis[];
  zaehler: Record<Ampel, number>;
  /** fehlende Angaben, sortiert nach Zahl der gelben Paragrafen, die sie klären würden */
  klaerung: { id: string; titel: string; anzahl: number }[];
  /** Hinweise, deren Bestätigung Paragrafen entscheidet (gelb nur, weil die Angabe nicht gesichert ist) */
  bestaetigen: { id: string; titel: string; anzahl: number }[];
  hinweise: (Hinweis & { modul: string })[];
  /** Fakten inkl. der Werte, die Module setzen */
  fakten: Record<string, FaktWert>;
  /** Fakten-Definitionen (Katalog + Module) */
  faktDefs: Record<string, FaktDef>;
  text: TextKontext;
  /** Auswertungskontext (Fakten, Merkmale, Ampeln anderer Paragrafen) – für „Regel im Einzelnen“ mit Stand */
  kontext: KurzKontext;
}

/** Fakten-Definitionen aus Katalog und Modulen */
export function faktDefinitionen(module: Modul[]): Record<string, FaktDef> {
  return Object.assign({}, FAKTEN, ...module.map((m) => m.fakten ?? {}));
}

/** Merkmale nur mit Werten aus ihrer Werteliste (VORGABE_MERKMALE); andere Merkmale (eigene aus Formulare) unverändert */
export function gueltigeMerkmale(merkmale: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(merkmale)) {
    const vorgabe = VORGABE_MERKMALE.find((m) => m.name === k);
    if (!vorgabe || vorgabe.werte.includes(v)) out[k] = v;
  }
  return out;
}

/** passt der Wert zur Angabe (Typ, bei Auswahl einer der Werte)? */
export function wertPasst(def: Pick<FaktDef, 'typ' | 'werte'>, w: FaktWert['wert']): boolean {
  if (w === null || w === undefined) return true;
  if (def.typ === 'janein') return typeof w === 'boolean';
  if (def.typ === 'zahl') return typeof w === 'number' && Number.isFinite(w);
  if (def.typ === 'wahl') return typeof w === 'string' && (!def.werte?.length || def.werte.includes(w));
  return typeof w === 'string';
}

/** Angaben, deren Wert nicht zur Angabe passt: offen (Wert entfernt), als Hinweis mit Grund */
export function gueltigeFakten(fakten: Record<string, FaktWert>, defs: Record<string, FaktDef>): Record<string, FaktWert> {
  const out: Record<string, FaktWert> = {};
  for (const [id, f] of Object.entries(fakten)) {
    const d = defs[id];
    if (!d || wertPasst(d, f.wert)) {
      out[id] = f;
      continue;
    }
    const { bestaetigt: _b, ...ohne } = f;
    const erwartet = d.typ === 'janein' ? 'ja oder nein' : d.typ === 'zahl' ? 'eine Zahl' : d.typ === 'wahl' ? `einer von: ${(d.werte ?? []).join(', ')}` : 'ein Text';
    out[id] = { ...ohne, wert: null, sicherheit: 'hinweis', grund: `Wert „${String(f.wert)}“ passt nicht zur Angabe (erwartet ${erwartet}) – bitte neu angeben` };
  }
  return out;
}

/** Werte, die Module setzen (fest oder nach einer Tabelle) – Angaben von Hand gehen vor */
export function modulFakten(module: Modul[], fakten: Record<string, FaktWert>): Record<string, FaktWert> {
  // gespeicherte Modulwerte (nur wegen einer Bestätigung in der Datei) setzen die Module unten neu – liefert kein aktives
  // Modul bzw. keine Tabelle mehr einen Wert (anderer Gemeindeschlüssel, Bezug weg), gilt der alte nicht weiter
  const out: Record<string, FaktWert> = {};
  for (const [id, f] of Object.entries(fakten)) if (f.herkunft !== 'modul') out[id] = f;
  // Land-, Kreis- und Gemeindemodule gelten nur so sicher wie der Gemeindeschlüssel, über den sie gewählt sind
  const ags = fakten['lage.ags'];
  const agsUnsicher = !ags || (ags.sicherheit === 'hinweis' && !ags.bestaetigt) || !!ags.widerspruch;
  for (const m of module)
    for (const [id, d] of Object.entries(m.fakten ?? {})) {
      if (out[id] && out[id].herkunft !== 'modul') {
        // Angabe von Hand gegen einen Wert, den ein Dienst über den Bezug liefert (z. B. „nicht im Denkmalbereich“ gegen
        // einen Treffer des Denkmal-Dienstes): Widerspruch – wie beim Dienst am Fakt selbst
        if (d.nach) {
          const w = nachWiderspruch(d.nach, out[d.nach.fakt], out[id]);
          if (w && !out[id].widerspruch) out[id] = { ...out[id], widerspruch: w };
        }
        continue;
      }
      if (d.wert !== undefined)
        out[id] =
          m.ebene !== 'bund' && agsUnsicher
            ? { wert: d.wert, herkunft: 'modul', quelle: m.name, sicherheit: 'hinweis', grund: 'Gemeindeschlüssel nur vorgeschlagen bzw. nicht gesichert – ob dieses Modul gilt, ist offen' }
            : { wert: d.wert, herkunft: 'modul', quelle: m.name, sicherheit: 'sicher' };
      else if (d.nach) {
        const basis = out[d.nach.fakt];
        if (basis?.wert == null) continue;
        const v = d.nach.tabelle[String(basis.wert)] ?? d.nach.sonst;
        // so sicher wie der Bezug (ein bestätigter Hinweis gilt als sicher); ein Widerspruch am Bezug geht mit; die
        // Bestätigung selbst wird nicht kopiert – sie gehört zum Bezug, nicht zum abgeleiteten Wert
        // Werte der Gebietsmodule hängen am Gemeindeschlüssel, auch wenn sie aus einem anderen Fakt abgeleitet sind;
        // Tabellen, deren Werte von der Lage im Gemeindegebiet abhängen, sind immer nur Hinweis
        const unsicher = (basis.sicherheit === 'hinweis' && !basis.bestaetigt) || (m.ebene !== 'bund' && agsUnsicher) || !!d.nach.hinweis;
        // eigene Bestätigung des Tabellenwerts (mit Beleg, z. B. Auskunft der Behörde): gilt, solange die Tabelle
        // denselben Wert liefert
        const bestaetigt = fakten[id]?.herkunft === 'modul' && fakten[id].bestaetigt && fakten[id].wert === v ? fakten[id].bestaetigt : undefined;
        if (v !== undefined)
          out[id] = {
            wert: v,
            herkunft: 'modul',
            quelle: `${m.name}, abgeleitet aus ${d.nach.fakt === 'lage.ags' ? 'dem Gemeindeschlüssel' : d.nach.fakt}`,
            sicherheit: unsicher ? 'hinweis' : 'sicher',
            ...(unsicher ? { grund: d.nach.hinweis ? `Tabelle nach ${d.nach.fakt === 'lage.ags' ? 'Gemeinde' : d.nach.fakt} – hängt von der Lage ab, bitte prüfen` : (basis.grund ?? 'abgeleitet aus einem nicht gesicherten Wert') } : {}),
            ...(basis.widerspruch ? { widerspruch: basis.widerspruch } : {}),
            ...(bestaetigt ? { bestaetigt } : {}),
          };
      }
    }
  return out;
}

/** Widerspruch einer Angabe von Hand zu dem Wert, den ein Dienst über den Bezug einer Tabelle ergäbe */
function nachWiderspruch(nach: NonNullable<FaktDef['nach']>, basis: FaktWert | undefined, f: FaktWert): string | undefined {
  if (!basis) return undefined;
  if (basis.widerspruch) return basis.widerspruch;
  const dienst = basis.herkunft === 'geodienst' ? { wert: basis.wert, sicherheit: basis.sicherheit, quelle: basis.quelle } : basis.dienst;
  if (!dienst || dienst.wert == null) return undefined;
  // ein bloßes „kein Treffer“ (Hinweis) widerspricht nicht
  if (dienst.wert === false && dienst.sicherheit === 'hinweis') return undefined;
  const v = nach.tabelle[String(dienst.wert)] ?? nach.sonst;
  if (v === undefined || v === f.wert) return undefined;
  return `${dienst.quelle ?? 'Geodienst'} ergibt „${v === true ? 'ja' : v === false ? 'nein' : String(v)}“ (über ${nach.fakt})`;
}

const zaehlerLeer = (): Record<Ampel, number> => ({ rot: 0, gelb: 0, gruen: 0 });
/** Strenge einer Ampel: gilt > prüfen > entfällt */
const RANG: Record<Ampel, number> = { gruen: 0, gelb: 1, rot: 2 };
const datumText = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');
/**
 * Angaben, deren Modulwert das Bundesmodul liefert – entscheidend ist das Modul, das den Wert setzt (wie in modulFakten
 * das letzte mit `wert` bzw. `nach`), nicht das, das die Angabe definiert (z. B. Naturdenkmal: im Bund definiert, vom
 * Kreis nach seiner Liste geliefert)
 */
export function bundGelieferte(module: Modul[]): Set<string> {
  const ebene = new Map<string, string>();
  for (const m of module) for (const [id, d] of Object.entries(m.fakten ?? {})) if (d.wert !== undefined || d.nach) ebene.set(id, m.ebene);
  return new Set([...ebene].filter(([, e]) => e === 'bund').map(([id]) => id));
}

/**
 * Wo ein unsicherer Modulwert zu bestätigen ist, damit er gesichert wird. Quellen der Unsicherheit:
 *  - der Gemeindeschlüssel, solange er nicht gesichert ist (Werte eines Gebietsmoduls gelten erst mit ihm – nicht bei
 *    Werten des Bundesmoduls, `bund`),
 *  - der Bezug der Tabelle (`nach.fakt`), wenn er selbst nur Hinweis ist – ist der Bezug selbst ein Modulwert, zählen
 *    dessen Quellen (z. B. Landschaftsplan ← Name des Landschaftsplans ← Gemeindeschlüssel: der Gemeindeschlüssel),
 *  - der Wert selbst, wenn die Tabelle von der Lage abhängt (`nach.hinweis`).
 * Genau eine Quelle: dort bestätigen. Mehrere: keine davon entschiede allein – dann der Wert selbst (ein Tabellenwert
 * lässt sich mit Beleg bestätigen); ein fester Wert hängt nur am Gemeindeschlüssel.
 */
export function modulZiel(id: string, fakten: Record<string, FaktWert>, defs: Record<string, FaktDef>, bund: ReadonlySet<string> = new Set()): string {
  const q = modulQuellen(id, fakten, defs, bund, new Set());
  if (q.size === 1) return [...q][0];
  return defs[id]?.nach ? id : 'lage.ags';
}

const unsicherWert = (f: FaktWert | undefined) => !f || f.wert == null || (f.sicherheit === 'hinweis' && !f.bestaetigt) || !!f.widerspruch;

function modulQuellen(id: string, fakten: Record<string, FaktWert>, defs: Record<string, FaktDef>, bund: ReadonlySet<string>, besucht: Set<string>): Set<string> {
  besucht.add(id);
  const d = defs[id];
  const q = new Set<string>();
  if (!bund.has(id) && unsicherWert(fakten['lage.ags'])) q.add('lage.ags');
  if (d?.nach && unsicherWert(fakten[d.nach.fakt])) {
    const b = fakten[d.nach.fakt];
    // ein Bezug, der selbst ein Modulwert ist (und nicht eigens bestätigt): seine Quellen
    if (b?.herkunft === 'modul' && !b.bestaetigt && !b.widerspruch && !besucht.has(d.nach.fakt)) for (const x of modulQuellen(d.nach.fakt, fakten, defs, bund, besucht)) q.add(x);
    else q.add(d.nach.fakt);
  }
  if (d?.nach?.hinweis) q.add(id);
  return q;
}

/**
 * Die Antworten, deren Frage gestellt wird (frageGestellt) – ausgewertet mit den abgeleiteten Werten (`ableiten`), bis
 * sich nichts mehr ändert (höchstens einige Runden; eine weggelassene Antwort kann weitere Fragen verbergen)
 */
export function gestellteAntworten(eingabe: Record<string, FaktWert>, ableiten: (f: Record<string, FaktWert>) => Record<string, FaktWert>, defs: Record<string, FaktDef>, rest: Omit<KurzKontext, 'fakten'>): Record<string, FaktWert> {
  let gestellt = eingabe;
  // in jeder Runde gestellt (für den Ausweg ohne Fixpunkt)
  let immer = new Set(Object.keys(eingabe));
  for (let runde = 0; runde < 8; runde++) {
    const ctx: KurzKontext = { ...rest, fakten: ableiten(gestellt) };
    const naechste = Object.fromEntries(Object.entries(eingabe).filter(([id]) => frageGestellt(id, defs[id], ctx)));
    if (Object.keys(naechste).length === Object.keys(gestellt).length && Object.keys(naechste).every((id) => id in gestellt)) return naechste;
    immer = new Set([...immer].filter((id) => id in naechste));
    gestellt = naechste;
  }
  // kein Fixpunkt (Bedingungen, die sich gegenseitig ein- und ausschalten – paketPruefen lehnt solche Zyklen ab): nur die
  // Antworten, die in jeder Runde gestellt waren. Eine weggelassene Antwort führt nur zu „offen“ (Regeln dürfen nicht nach
  // „bekannt“ fragen), eine behaltene könnte ein Grün tragen
  return Object.fromEntries(Object.entries(eingabe).filter(([id]) => immer.has(id)));
}

/** ganze Tage von einem Zeitpunkt (ISO) bis zu einem Tag (JJJJ-MM-TT) */
const tageSeit = (iso: string, heute: string) => Math.floor((Date.parse(`${heute}T12:00:00`) - Date.parse(iso)) / 86400000);
const undW = (a: Wahrheit, b: Wahrheit): Wahrheit => (a === 'nein' || b === 'nein' ? 'nein' : a === 'offen' || b === 'offen' ? 'offen' : 'ja');

export function auswerten(e: AuswertungsEingabe): Auswertung {
  // nur die aktiven Module: Bausteine und Fakten inaktiver Module dürfen nichts beeinflussen
  const bausteine: Record<string, Kurz> = Object.assign({}, ...e.module.map((m) => m.bausteine ?? {}));
  const faktDefs = faktDefinitionen(e.module);
  const tageAlt = e.rechtsstandTage ?? RECHTSSTAND_TAGE;
  const entscheidungBis = plusMonate(e.einreichung, e.entscheidungMonate ?? ENTSCHEIDUNG_MONATE);
  // nur zulässige Werte zählen – ein Merkmalwert außerhalb der Werteliste (Formulare erlaubt eigene Werte) oder eine
  // Angabe mit falschem Typ bzw. einem Wert außerhalb der Auswahl (ältere Datei, umbenannter Auswahlwert) ist offen,
  // nicht „trifft nicht zu“ (sonst entstünde ein falsches Grün)
  // vor UND nach der Ableitung: ein ungültiger Bezug (z. B. „false“ als Text) darf keinen gesicherten Wert ableiten
  const merkmale = gueltigeMerkmale(e.merkmale);
  const eingabe = gueltigeFakten(e.fakten, faktDefs);
  // eine gespeicherte Antwort auf eine Frage, die gerade nicht gestellt wird (nach einem Ortswechsel, einem zurückgesetzten
  // Auslöser – z. B. „Altbau verfahrensfrei“ nach zurückgesetztem Umfang), zählt nicht: weder in den Regeln noch für
  // Ableitungen. Bis zum Fixpunkt, denn eine weggelassene Antwort kann weitere Fragen verbergen (oder wieder stellen)
  const fakten = gueltigeFakten(modulFakten(e.module, gestellteAntworten(eingabe, (f) => gueltigeFakten(modulFakten(e.module, f), faktDefs), faktDefs, { merkmale, einreichung: e.einreichung, heute: e.heute, bausteine, widersprueche: e.widersprueche })), faktDefs);
  const titelCache = new Map<string, string>();
  const text: TextKontext = { fakt: (id) => faktDefs[id], bausteine, paragraf: (id) => titelCache.get(id) };

  // Regeldatei und Text je Norm
  const normen: { modul: Modul; norm: string; key: string; datei?: { datei: string; regel: import('./typen').Regeldatei }; stand?: TextStand }[] = [];
  for (const m of e.module)
    for (const norm of Object.keys(m.normen)) {
      const key = `${m.id}/${norm}`;
      const stand = e.texte.get(key);
      const datei = regeldateiFuer(e.paket.regeln.get(key), stand?.fassung?.gueltigAb, e.einreichung);
      normen.push({ modul: m, norm, key, datei, stand });
      for (const [nr, r] of Object.entries(datei?.regel.paragrafen ?? {})) titelCache.set(`${key}/${nr}`, verweisName(nr, stand?.fassung?.paragrafen[nr]?.titel || r.titel || '', m.normen[norm].kurz));
    }

  const ergebnisse = new Map<string, ParagrafErgebnis>();
  const inArbeit = new Set<string>();
  const regelVon = new Map<string, { n: (typeof normen)[number]; nr: string; r: ParagrafRegel }>();
  for (const n of normen) for (const [nr, r] of Object.entries(n.datei?.regel.paragrafen ?? {})) regelVon.set(`${n.key}/${nr}`, { n, nr, r });

  const ctx: KurzKontext = {
    merkmale,
    fakten,
    einreichung: e.einreichung,
    heute: e.heute,
    bausteine,
    widersprueche: e.widersprueche,
    ampel: (id) => {
      if (inArbeit.has(id) || !regelVon.has(id)) return undefined;
      const p = ergebnisse.get(id) ?? paragraf(id);
      // eine bestätigte, nicht überholte Festlegung zählt – aber nur als Hinweis (eine Entscheidung von Hand trägt kein
      // automatisches „entfällt“ weiter); Entwürfe und überholte Festlegungen zählen nicht
      if (p.festlegung?.bestaetigt && !p.ueberholt && !p.unwirksam) return { ampel: p.festlegung.ampel, unsicher: true };
      // Entwurf bzw. überholte oder nicht wirksame Festlegung: zählt nicht – außer sie ist strenger als die Automatik,
      // dann sieht der Verweis die strengere (angezeigte) Ampel, als Hinweis (sonst schwächte sie auf Umwegen doch ab)
      if (p.festlegung && RANG[p.ampel] > RANG[p.automatisch]) return { ampel: p.ampel, unsicher: true };
      // beruht die automatische Ampel auf Hinweisen, ist auch der Verweis darauf nur ein Hinweis
      return { ampel: p.automatisch, ...(p.unsicher.length ? { unsicher: true } : {}) };
    },
  };

  // eine Angabe, deren Frage gerade nicht gestellt wird (frageGestellt – dasselbe Kriterium wie die App), fehlt nicht:
  // sie steht nicht unter „es fehlt“, nicht in `offen` und nicht unter „klärt am meisten“ – die Ampel bleibt
  const gestelltCache = new Map<string, boolean>();
  const gestellt = (o: string): boolean => {
    if (o.startsWith('merkmal:') || o.startsWith('paragraf:')) return true;
    let g = gestelltCache.get(o);
    if (g === undefined) {
      g = frageGestellt(o, faktDefs[o], ctx);
      gestelltCache.set(o, g);
    }
    return g;
  };
  // nur gestellte Angaben (und Verweise) – bleibt nichts übrig, alle (sonst stünde ein Gelb ohne Grund da)
  const nurGestellte = (offen: string[]) => {
    const g = offen.filter((o) => o.startsWith('paragraf:') || gestellt(o));
    return g.length ? g : offen;
  };

  const geltungCache = new Map<string, Bewertung>();
  const geltung = (n: (typeof normen)[number]): Bewertung => {
    let g = geltungCache.get(n.key);
    if (!g) {
      try {
        g = werten(n.datei?.regel.geltung, ctx);
      } catch {
        // fehlerhafte Geltung: offen (nie „entfällt mit der Norm“)
        g = { w: 'offen', offen: [], unsicher: [], widerspruch: [], verwendet: [] };
      }
      geltungCache.set(n.key, g);
    }
    return g;
  };
  // je Norm: Prüfsummen vorhanden bzw. irgendeine Fundstelle geändert (für „entfällt mit der Norm“)
  const normStand = (n: (typeof normen)[number]) => {
    const paras = Object.values(n.datei?.regel.paragrafen ?? {});
    const f = n.stand?.fassung;
    return {
      hatStand: paras.some((p) => p.stand && Object.keys(p.stand).length),
      geaendert: !!f && paras.some((p) => Object.entries(p.stand ?? {}).some(([k, s]) => f.summen[k] !== s)),
    };
  };

  function paragraf(id: string): ParagrafErgebnis {
    const vorhanden = ergebnisse.get(id);
    if (vorhanden) return vorhanden;
    inArbeit.add(id);
    try {
      return paragrafWerten(id);
    } catch (fehler) {
      // eine fehlerhafte Regel darf nur ihren Paragrafen treffen – und nie grün machen
      const { n, nr, r } = regelVon.get(id)!;
      const kaputt: ParagrafErgebnis = {
        id,
        modul: n.modul.id,
        norm: n.norm,
        paragraf: nr,
        titel: n.stand?.fassung?.paragrafen[nr]?.titel || r.titel || '',
        ampel: 'gelb',
        automatisch: 'gelb',
        gruende: [`Regel fehlerhaft – von Hand beurteilen (${fehler instanceof Error ? fehler.message : String(fehler)})`],
        hinweise: [],
        offen: [],
        unsicher: [],
        geaendert: [],
        verwendet: [],
        fundstellen: r.fundstellen ?? [nr],
      };
      ergebnisse.set(id, kaputt);
      return kaputt;
    } finally {
      inArbeit.delete(id);
    }
  }

  function paragrafWerten(id: string): ParagrafErgebnis {
    const { n, nr, r } = regelVon.get(id)!;
    const fassung = n.stand?.fassung ?? null;
    const def = n.modul.normen[n.norm];
    const gruende: string[] = [];
    const hinweise: string[] = [];
    const g = geltung(n);
    const gilt = werten(r.gilt, ctx);
    const entf = r.entfaellt ? werten(r.entfaellt, ctx) : null;
    const pruef: Pick<Bewertung, 'w'> & Partial<Bewertung> = r.pruefen ? (r.pruefen.wenn ? werten(r.pruefen.wenn, ctx) : { w: 'ja' }) : { w: 'nein' };
    const tatbestand = undW(g.w, gilt.w);
    // beide Wege führen zu Grün („entfällt“ und „gilt nicht“): es trägt der sicherere – ein bloßer Hinweis im
    // Ausnahmeteil soll ein gesichertes „gilt nicht“ nicht abwerten
    const gewicht = (b: Bewertung) => b.unsicher.length + b.widerspruch.length;
    let ampel: Ampel;
    let bestaetigend: string | undefined;
    let tragend: Bewertung[] = [];
    // Begründungen nennen die Angaben, die das Ergebnis tragen; die ganze Bedingung steht in `bedingung`
    const warum = (k: Kurz | undefined, w: Wahrheit) => warumText(k, ctx, text, w);
    if (g.w === 'nein') {
      ampel = 'gruen';
      const w = warum(n.datei?.regel.geltung, 'nein');
      gruende.push(`Entfällt mit der Norm – ${n.datei?.regel.geltungGrund ?? 'Anwendungsbereich nicht berührt'}${w ? ` (${w})` : ''}.`);
      tragend = [g];
    } else if (entf?.w === 'ja' && !(tatbestand === 'nein' && gewicht(gilt) < gewicht(entf))) {
      ampel = 'gruen';
      gruende.push(`Entfällt – ${warum(r.entfaellt, 'ja') || kurzText(r.entfaellt, text)}.`);
      tragend = [entf];
    } else if (tatbestand === 'ja') {
      ampel = 'rot';
      gruende.push(r.grund);
      tragend = [g, gilt];
      if (entf?.w === 'offen') hinweise.push(`Ausnahme möglich – es fehlt: ${nurGestellte(entf.offen).map((o) => offenText(o, text)).join(' · ')}`);
      // hängt die Regel an einem Paragrafen, der nur „rot, Ausnahme möglich“ ist, und entfiele sie mit dessen Ausnahme:
      // der Hinweis geht mit (die Ampel bleibt rot – zur sicheren Seite)
      for (const v of gilt.verwendet) {
        if (!v.startsWith('paragraf:')) continue;
        const q = ergebnisse.get(v.slice(9));
        if (!q || q.automatisch !== 'rot' || !q.offen.length || q.festlegung) continue;
        const ohne = werten(r.gilt, { ...ctx, ampel: (x) => (x === q.id ? { ampel: 'gruen' } : ctx.ampel?.(x)) });
        if (undW(g.w, ohne.w) === 'ja') continue;
        hinweise.push(`Ausnahme möglich über ${offenText(v, text)} – es fehlt dort: ${q.offen.map((o) => offenText(o, text)).join(' · ')}`);
      }
    } else if (tatbestand === 'nein') {
      ampel = 'gruen';
      gruende.push(r.gilt ? `Gilt nicht – ${warum(r.gilt, 'nein') || 'Voraussetzung nicht erfüllt'}.` : 'Gilt nicht.');
      tragend = [gilt];
    } else {
      ampel = 'gelb';
      const fehlt = nurGestellte([...new Set([...g.offen, ...gilt.offen])]);
      // fehlende Angaben als Fragen; offene Paragrafen, an denen die Regel hängt, als „hängt an“ (nicht „es fehlt“)
      const angaben = fehlt.filter((o) => !o.startsWith('paragraf:'));
      const haengt = fehlt.filter((o) => o.startsWith('paragraf:'));
      // überall derselbe kurze Name der Angabe (nicht die Frage)
      const teile = [angaben.length ? `es fehlt: ${angaben.map((o) => offenText(o, text)).join(' · ')}` : '', haengt.length ? `hängt an ${haengt.map((o) => offenText(o, text)).join(' · ')} – dort offen` : ''].filter(Boolean);
      const satz = teile.join('; ') || 'es fehlt: Angaben';
      // kein Punkt nach einer Frage („… (LINFOS-Kennung)?“)
      gruende.push(`Offen – ${satz}${/[?.!]$/.test(satz) ? '' : '.'}`);
      tragend = [g, gilt];
    }

    // Änderungen am Text seit der Prüfung der Regel
    const geaendert: string[] = [];
    if (fassung && r.stand) for (const [k, summe] of Object.entries(r.stand)) if (fassung.summen[k] !== summe) geaendert.push(k);
    const unsicher = [...new Set(tragend.flatMap((b) => b.unsicher))];
    const widerspruch = [...new Set(tragend.flatMap((b) => b.widerspruch))];
    const offen = nurGestellte(ampel === 'gelb' ? [...new Set(tragend.flatMap((b) => b.offen))] : entf?.w === 'offen' && ampel === 'rot' ? entf.offen : []);

    // zur sicheren Seite
    if (ampel === 'gruen') {
      const herab: string[] = [];
      bestaetigend = undefined;
      // „entfällt mit der Norm“ hängt am Anwendungsbereich – auch der muss an der geltenden Fassung geprüft sein
      const mitNorm = g.w === 'nein';
      // Einzelfall macht Grün nur gelb, wenn die Regel sagt, wann (sonst nur Hinweis bei Rot) – und nur, wenn die Norm
      // überhaupt gilt: außerhalb ihres Anwendungsbereichs (z. B. außerhalb der Altstadt) gibt es keinen Einzelfall;
      // … und auch dann, wenn das „nein“ nur auf Hinweisen oder widersprüchlichen Angaben beruht
      if (!mitNorm && r.pruefen?.wenn && (pruef.w !== 'nein' || pruef.unsicher?.length || pruef.widerspruch?.length)) herab.push(`Einzelfall: ${r.pruefen.grund}`);
      if (r.gruenNurVonHand) herab.push('Kann nur von Hand ausgeschlossen werden (z. B. nach Prüfung vor Ort).');
      if (geaendert.length) herab.push(`Text seit der Prüfung der Regel geändert (${geaendert.map(fundstelleName).join(', ')}) – Regel noch nicht nachgezogen.`);
      if (unsicher.length) herab.push(`Nur Hinweis, nicht gesichert: ${unsicher.map((u) => offenText(u, text)).join(', ')}.`);
      // Merkmale mit eigenem Vorbehalt (z. B. Planungsrecht noch nicht für diesen Ort bestätigt) mit ihrem Grund
      const vorbehalt = widerspruch.filter((w) => w.startsWith('merkmal:') && e.vorbehalte?.[w.slice(8)]);
      const echt = widerspruch.filter((w) => !vorbehalt.includes(w));
      for (const v of vorbehalt) herab.push(`Nicht gesichert: ${e.vorbehalte![v.slice(8)]}.`);
      if (echt.length) herab.push(`Widerspruch: ${echt.map((w) => offenText(w, text)).join(', ')} – Angaben widersprechen einander (Merkmal/Modell bzw. von Hand/Geodienst).`);
      const ns = normStand(n);
      const pruefbar = mitNorm ? ns.hatStand : !!(r.stand && Object.keys(r.stand).length);
      if (mitNorm && ns.geaendert) herab.push('Text der Norm seit der Prüfung der Regeln geändert – ob der Anwendungsbereich gleich geblieben ist, ist offen.');
      if (!fassung && pruefbar) herab.push(mitNorm ? 'Text der Norm nicht verfügbar – der Anwendungsbereich ist nicht an der geltenden Fassung geprüft.' : 'Text der Norm nicht verfügbar – nicht an der geltenden Fassung geprüft.');
      if (fassung && pruefbar && !n.stand?.geprueft) herab.push('Rechtsstand nie an der Quelle bestätigt – ob die Fassung noch gilt, ist offen.');
      else if (fassung && pruefbar && n.stand?.geprueft && tageSeit(n.stand.geprueft, e.heute) > tageAlt) herab.push(`Rechtsstand seit ${tageSeit(n.stand.geprueft, e.heute)} Tagen nicht an der Quelle bestätigt – ob die Fassung noch gilt, ist offen.`);
      if (fassung && pruefbar && n.stand?.ueberholtAb) herab.push(`Zum Stichtag gilt schon die Fassung ab ${datumText(n.stand.ueberholtAb)} – ihr Text liegt noch nicht vor.`);
      if (fassung && pruefbar && n.stand?.stichtag && n.stand.stichtag !== e.einreichung) herab.push('Text für einen anderen Stichtag geholt – wird aktualisiert.');
      const angekuendigt = (n.stand?.kuenftige ?? []).filter((k) => k.gueltigAb > e.einreichung && k.gueltigAb <= entscheidungBis);
      if (pruefbar && angekuendigt.length) herab.push(`Neue Fassung ab ${angekuendigt.map((k) => datumText(k.gueltigAb)).join(', ')} angekündigt – voraussichtlich vor der Entscheidung; an der künftigen Fassung prüfen.`);
      if (fassung && !fassung.paragrafen[nr] && g.w !== 'nein') herab.push(`${paragrafName(nr)} steht nicht (mehr) im Text der geltenden Fassung.`);
      // gelb allein wegen genau einer nicht gesicherten Angabe: deren Bestätigung entschiede den Paragrafen
      if (herab.length === 1 && unsicher.length === 1 && !widerspruch.length) bestaetigend = unsicher[0];
      if (herab.length) {
        // der Grund für Gelb zuerst (steht in der Liste), dann warum es sonst grün wäre – als Konjunktiv, damit neben
        // „prüfen“ kein „Entfällt –“ steht
        ampel = 'gelb';
        const ohne = herab.length === 1 ? 'Ohne diesen Vorbehalt' : 'Ohne diese Vorbehalte';
        const sonst = gruende.map((g) => g.replace(/^(Entfällt mit der Norm|Entfällt|Gilt nicht) – /, (_m, art: string) => (art === 'Gilt nicht' ? `${ohne} gälte sie nicht – ` : art === 'Entfällt mit der Norm' ? `${ohne} entfiele sie mit der Norm – ` : `${ohne} entfiele sie – `)));
        gruende.splice(0, gruende.length, ...herab, ...sonst);
      }
    } else if (ampel === 'rot') {
      if (pruef.w === 'ja' && r.pruefen) hinweise.push(/^Im Einzelfall prüfen/i.test(r.pruefen.grund) ? r.pruefen.grund : `Im Einzelfall prüfen: ${r.pruefen.grund}`);
      const neu = (n.stand?.kuenftige ?? []).filter((k) => k.gueltigAb > e.einreichung && k.gueltigAb <= entscheidungBis);
      if (neu.length) hinweise.push(`Neue Fassung ab ${neu.map((k) => datumText(k.gueltigAb)).join(', ')} angekündigt – voraussichtlich vor der Entscheidung; Anforderungen der künftigen Fassung prüfen.`);
      if (geaendert.length) hinweise.push(`Text seit der Prüfung der Regel geändert (${geaendert.map(fundstelleName).join(', ')}).`);
    }
    if (r.hinweis) hinweise.push(r.hinweis);
    if (def.annahme) hinweise.push(`Annahme: ${def.annahme}`);
    if (fassung?.texterkennung) hinweise.push('Text aus Texterkennung (Scan) – maßgeblich ist die Originalurkunde.');

    const automatisch = ampel;
    const fl = e.festlegungen[id];
    let ueberholt: string | undefined;
    let unwirksam: string | undefined;
    if (fl) {
      ampel = fl.ampel;
      const gruende2: string[] = [];
      // überholt nur, wenn die Automatik jetzt strenger ist als damals und als die Festlegung (wird sie schwächer oder
      // kommt sie bei der Festlegung an – z. B. nach „Rechtsstand prüfen“ –, bleibt die Festlegung richtig)
      if (fl.automatisch !== automatisch && RANG[automatisch] > RANG[fl.automatisch] && RANG[automatisch] > RANG[fl.ampel]) gruende2.push(`automatisch jetzt ${automatisch === 'rot' ? 'rot' : automatisch === 'gruen' ? 'grün' : 'gelb'} statt ${fl.automatisch === 'rot' ? 'rot' : fl.automatisch === 'gruen' ? 'grün' : 'gelb'}`);
      for (const [f, alt] of Object.entries(fl.fakten ?? {})) {
        const jetzt = f.startsWith('merkmal:') ? (e.merkmale[f.slice(8)] ?? null) : (fakten[f]?.wert ?? null);
        if (jetzt !== alt) gruende2.push(`${offenText(f, text)} geändert`);
        // gleicher Wert, aber nicht mehr so gesichert (Lage verschoben, Gemeindeschlüssel unsicher, Widerspruch)
        else if (!f.includes(':') && jetzt !== null) {
          const vorher = fl.sicherheit?.[f] ?? 'sicher';
          const nun = faktStatus(fakten[f]);
          if (nun !== vorher && nun !== 'sicher') gruende2.push(`${offenText(f, text)} jetzt ${nun === 'widerspruch' ? 'widersprüchlich' : 'nur Hinweis'}`);
        } else if (f.startsWith('merkmal:') && jetzt !== null) {
          // Merkmal mit gleichem Wert, das inzwischen den Geodaten bzw. dem Modell widerspricht
          const vorher = fl.sicherheit?.[f] ?? 'sicher';
          // mit eigenem Vorbehalt (Planungsrecht nicht für diesen Ort bestätigt) dessen Grund, sonst „widersprüchlich“
          if (e.widersprueche?.has(f.slice(8)) && vorher !== 'widerspruch') gruende2.push(e.vorbehalte?.[f.slice(8)] ? `${offenText(f, text)} nicht gesichert (${e.vorbehalte[f.slice(8)]})` : `${offenText(f, text)} jetzt widersprüchlich`);
        }
      }
      if (fassung) for (const [k, summe] of Object.entries(fl.stand ?? {})) if (fassung.summen[k] !== summe) gruende2.push(`Text von ${fundstelleName(k)} geändert`);
      // eine Festlegung von Hand gilt für den Ort, an dem sie getroffen wurde (Begehung, Abstimmung, Planstand)
      const ortWeg = ortGeaendert(fl.ort, e.ort);
      if (ortWeg) gruende2.push(fl.ort ? ortWeg : 'ohne Ortsangabe getroffen – ältere Datei');
      // ein festgelegtes „entfällt“ braucht wie das automatische einen geprüften, aktuellen Text. Fehlt der Systemstand,
      // ist es „noch nicht wirksam“ (erneut festlegen hilft nicht); wurde ohne Text festgelegt und liegt er jetzt vor,
      // ist es überholt (jetzt am Text erneut festlegen)
      const system: string[] = [];
      if (fl.ampel === 'gruen' && r.stand && Object.keys(r.stand).length) {
        if (!fassung) system.push('Text der Norm nicht verfügbar');
        else if (Object.keys(r.stand).some((k) => !fl.stand?.[k])) gruende2.push('Festlegung ohne geprüften Text getroffen – an der geltenden Fassung erneut festlegen');
        else if (!n.stand?.geprueft || tageSeit(n.stand.geprueft, e.heute) > tageAlt) system.push('Rechtsstand nicht aktuell an der Quelle bestätigt');
        else if (n.stand?.ueberholtAb) system.push(`zum Stichtag gilt schon die Fassung ab ${datumText(n.stand.ueberholtAb)}`);
        else if (n.stand?.stichtag && n.stand.stichtag !== e.einreichung) system.push('Text für einen anderen Stichtag geholt – wird aktualisiert');
        // wie beim automatischen „entfällt“: eine angekündigte Fassung vor der Entscheidung ist erst noch zu prüfen
        const angekuendigt = (n.stand?.kuenftige ?? []).filter((k) => k.gueltigAb > e.einreichung && k.gueltigAb <= entscheidungBis);
        if (angekuendigt.length) system.push(`neue Fassung ab ${angekuendigt.map((k) => datumText(k.gueltigAb)).join(', ')} angekündigt – an der künftigen Fassung prüfen`);
      }
      if (gruende2.length) ueberholt = gruende2.join('; ');
      if (system.length) unwirksam = system.join('; ');
      // eine überholte bzw. nicht wirksame Festlegung schwächt nie ab (zur sicheren Seite): ein „entfällt“ wird
      // mindestens „prüfen“, ein überholtes „prüfen“ hält ein automatisches „gilt“ nicht auf; strengere Festlegungen bleiben
      const staerker = (a: Ampel, b: Ampel): Ampel => (RANG[a] >= RANG[b] ? a : b);
      if (ueberholt && fl.ampel === 'gruen') {
        ampel = staerker(automatisch, 'gelb');
        gruende.unshift(`Festlegung „entfällt“ überholt (${ueberholt}) – erneut festlegen oder aufheben.`);
      } else if (ueberholt && RANG[fl.ampel] < RANG[automatisch]) {
        ampel = automatisch;
        gruende.unshift(`Festlegung „${fl.ampel === 'gelb' ? 'prüfen' : 'entfällt'}“ überholt (${ueberholt}) – es gilt die automatische Ampel; erneut festlegen oder aufheben.`);
      } else if (unwirksam && fl.ampel === 'gruen') {
        ampel = staerker(automatisch, 'gelb');
        gruende.unshift(`Festlegung „entfällt“ noch nicht wirksam (${unwirksam}) – sie zählt, sobald der Text geprüft vorliegt.`);
      }
    }

    const behoerde = r.behoerde ? werten(r.behoerde, ctx).w : undefined;
    const ergebnis: ParagrafErgebnis = {
      id,
      modul: n.modul.id,
      norm: n.norm,
      paragraf: nr,
      titel: fassung?.paragrafen[nr]?.titel || r.titel || '',
      ampel,
      automatisch,
      gruende,
      hinweise,
      offen,
      unsicher,
      ...(bestaetigend && !fl ? { bestaetigend } : {}),
      geaendert,
      verwendet: [...new Set([...g.verwendet, ...gilt.verwendet, ...(entf?.verwendet ?? []), ...(pruef.verwendet ?? [])])].filter((v) => !v.startsWith('tag:')),
      ...(behoerde ? { behoerde } : {}),
      ...(r.nachweis ? { nachweis: r.nachweis } : {}),
      fundstellen: r.fundstellen ?? [nr],
      ...(r.verweise ? { verweise: r.verweise } : {}),
      ...(fl ? { festlegung: fl } : {}),
      ...(ueberholt ? { ueberholt } : {}),
      ...(unwirksam ? { unwirksam } : {}),
      ...(n.datei ? { regel: { datei: n.datei.datei, version: n.datei.regel.version, fassung: n.datei.regel.fassung } } : {}),
      ...(def.annahme ? { annahme: def.annahme } : {}),
      bedingung: [
        n.datei?.regel.geltung ? `Die Norm gilt, wenn: ${kurzText(n.datei.regel.geltung, text)}` : '',
        r.gilt ? `Gilt, wenn: ${kurzText(r.gilt, text)}` : '',
        r.entfaellt ? `Entfällt, wenn: ${kurzText(r.entfaellt, text)}` : '',
        r.pruefen?.wenn ? `Einzelfall, wenn: ${kurzText(r.pruefen.wenn, text)}` : '',
      ].filter(Boolean),
      regelteile: [
        ...(n.datei?.regel.geltung ? [{ titel: 'Die Norm gilt, wenn', kurz: n.datei.regel.geltung }] : []),
        ...(r.gilt ? [{ titel: 'Gilt, wenn', kurz: r.gilt }] : []),
        ...(r.entfaellt ? [{ titel: 'Entfällt, wenn', kurz: r.entfaellt }] : []),
        ...(r.pruefen?.wenn ? [{ titel: 'Einzelfall, wenn', kurz: r.pruefen.wenn }] : []),
      ],
    };
    ergebnisse.set(id, ergebnis);
    return ergebnis;
  }

  const normErgebnisse: NormErgebnis[] = normen.map((n) => {
    const def = n.modul.normen[n.norm];
    const paragrafen = Object.keys(n.datei?.regel.paragrafen ?? {})
      .sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
      .map((nr) => paragraf(`${n.key}/${nr}`));
    const zaehler = zaehlerLeer();
    for (const p of paragrafen) zaehler[p.ampel]++;
    if (!n.datei) zaehler.gelb++;
    const g = n.datei ? geltung(n).w : 'offen';
    const f = n.stand?.fassung;
    return {
      id: n.key,
      modul: n.modul.id,
      norm: n.norm,
      def,
      ebene: n.modul.ebene,
      geltung: g,
      ...(n.datei?.regel.geltungGrund ? { geltungGrund: n.datei.regel.geltungGrund } : {}),
      paragrafen,
      zaehler,
      ...(f ? { fassung: { gueltigAb: f.gueltigAb, text: f.fassung, url: f.url, abgerufen: f.abgerufen, ...(f.texterkennung ? { texterkennung: true } : {}) } } : {}),
      ...(!f && def.quelle.art !== 'verweis' ? { ohneText: true } : {}),
      ...(!n.datei ? { ohneRegel: true } : {}),
      ...(n.stand?.fehler ? { fehler: n.stand.fehler } : {}),
      ...(n.stand?.kuenftige?.length ? { kuenftige: n.stand.kuenftige } : {}),
      ...(n.stand?.geprueft ? { geprueft: n.stand.geprueft } : {}),
    };
  });

  const paragrafen = normErgebnisse.flatMap((n) => n.paragrafen);
  const zaehler = zaehlerLeer();
  for (const n of normErgebnisse) for (const a of ['rot', 'gelb', 'gruen'] as const) zaehler[a] += n.zaehler[a];

  // Was klärt am meisten: fehlende Angaben an automatisch gelben Paragrafen
  const zahl = new Map<string, number>();
  // ohne Paragrafen mit wirksamer Festlegung – dort ist nichts mehr zu klären
  // (wirksam = bestätigt, nicht überholt, nicht unwirksam – wie bei Verweisen; ein Entwurf klärt noch nichts)
  const offenAuto = (p: ParagrafErgebnis) => !(p.festlegung?.bestaetigt && !p.ueberholt && !p.unwirksam) && (p.automatisch === 'gelb' || (p.automatisch === 'rot' && p.offen.length > 0));
  // eine Angabe klärt einen Paragrafen nur, wenn ihre Antwort dort etwas ändert: führt jede mögliche Antwort zum
  // selben Ergebnis (Regeln mit beiden Zweigen, z. B. „Beseitigung, ganz oder teilweise“), zählt sie dort nicht mit
  const moeglich = (o: string): (string | boolean)[] | null => {
    if (o.startsWith('merkmal:')) return VORGABE_MERKMALE.find((m) => m.name === o.slice(8))?.werte ?? null;
    const d = faktDefs[o];
    if (d?.typ === 'janein') return [true, false];
    return d?.typ === 'wahl' && d.werte?.length ? d.werte : null;
  };
  const ausgang = (id: string, c: KurzKontext): Ampel => {
    const { n, r } = regelVon.get(id)!;
    try {
      const g = werten(n.datei?.regel.geltung, c).w;
      if (g === 'nein' || (r.entfaellt && werten(r.entfaellt, c).w === 'ja')) return 'gruen';
      const t = undW(g, werten(r.gilt, c).w);
      return t === 'ja' ? 'rot' : t === 'nein' ? 'gruen' : 'gelb';
    } catch {
      return 'gelb';
    }
  };
  const klaert = (p: ParagrafErgebnis, o: string): boolean => {
    const werte = moeglich(o);
    if (!werte || !regelVon.has(p.id)) return true;
    const mit = (v: string | boolean): KurzKontext =>
      o.startsWith('merkmal:') ? { ...ctx, merkmale: { ...ctx.merkmale, [o.slice(8)]: String(v) } } : { ...ctx, fakten: { ...ctx.fakten, [o]: { wert: v, herkunft: 'manuell', sicherheit: 'sicher' } } };
    const aus = new Set(werte.map((v) => ausgang(p.id, mit(v))));
    return aus.size > 1 || aus.has('gelb');
  };
  for (const p of paragrafen) {
    if (!offenAuto(p)) continue;
    // eine nicht gestellte Frage klärt nichts (sie steht nur da, wenn sonst kein Grund für Gelb bliebe)
    p.klaerend = p.offen.filter((o) => !o.startsWith('paragraf:') && gestellt(o) && klaert(p, o));
    for (const o of p.klaerend) zahl.set(o, (zahl.get(o) ?? 0) + 1);
  }
  const klaerung = [...zahl.entries()].map(([id, anzahl]) => ({ id, titel: offenText(id, text), anzahl })).sort((a, b) => b.anzahl - a.anzahl || a.titel.localeCompare(b.titel, 'de'));
  // gelb nur wegen eines Hinweises (nichts fehlt): bestätigen klärt – Angaben, keine Merkmale
  // nur Paragrafen, die allein wegen genau dieses Hinweises gelb sind. Ein Modulwert ist dort zu bestätigen, woher seine
  // Unsicherheit kommt (Ziel: modulZiel)
  const zahlB = new Map<string, number>();
  // Werte, die das Bundesmodul liefert, hängen nicht am Gemeindeschlüssel
  const bundFakten = bundGelieferte(e.module);
  for (const p of paragrafen) {
    if (!p.bestaetigend || p.bestaetigend.includes(':') || !offenAuto(p)) continue;
    const ziel = fakten[p.bestaetigend]?.herkunft === 'modul' ? modulZiel(p.bestaetigend, fakten, faktDefs, bundFakten) : p.bestaetigend;
    p.bestaetigend = ziel;
    zahlB.set(ziel, (zahlB.get(ziel) ?? 0) + 1);
  }
  const bestaetigen = [...zahlB.entries()].map(([id, anzahl]) => ({ id, titel: offenText(id, text), anzahl })).sort((a, b) => b.anzahl - a.anzahl || a.titel.localeCompare(b.titel, 'de'));

  const zeigen = (h: Hinweis) => {
    try {
      return !h.wenn || werten(h.wenn, ctx).w !== 'nein';
    } catch {
      return true; // fehlerhafte Bedingung: Hinweis lieber zeigen
    }
  };
  const hinweise = e.module.flatMap((m) => (m.hinweise ?? []).filter(zeigen).map((h) => ({ ...h, modul: m.name })));
  return { normen: normErgebnisse, paragrafen, zaehler, klaerung, bestaetigen, hinweise, fakten, faktDefs, text, kontext: ctx };
}

