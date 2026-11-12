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

import type { Fassung } from '../recht/typen';
import { FAKTEN } from './fakten';
import type { Bewertung, KurzKontext, TextKontext } from './kurz';
import { kurzText, offenText, werten } from './kurz';
import type { Paket } from './paket';
import { regeldateiFuer } from './paket';
import { plusMonate } from '../recht/quellen';
import type { Ampel, FaktDef, FaktWert, Festlegung, Hinweis, Kurz, Modul, NormErgebnis, ParagrafErgebnis, ParagrafRegel, Wahrheit } from './typen';
import { fundstelleName, paragrafName } from './typen';

export interface TextStand {
  fassung: Fassung | null;
  /** die vorige Fassung (Gegenüberstellung alt/neu) */
  vorige?: Fassung | null;
  fehler?: string;
  kuenftige?: { gueltigAb: string; url: string }[];
  /** letzte erfolgreiche Prüfung an der Quelle (ISO) – für die Altersgrenze des Rechtsstands */
  geprueft?: string;
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
  hinweise: (Hinweis & { modul: string })[];
  /** Fakten inkl. der Werte, die Module setzen */
  fakten: Record<string, FaktWert>;
  /** Fakten-Definitionen (Katalog + Module) */
  faktDefs: Record<string, FaktDef>;
  text: TextKontext;
}

/** Fakten-Definitionen aus Katalog und Modulen */
export function faktDefinitionen(module: Modul[]): Record<string, FaktDef> {
  return Object.assign({}, FAKTEN, ...module.map((m) => m.fakten ?? {}));
}

/** Werte, die Module setzen (fest oder nach einer Tabelle) – Angaben von Hand gehen vor */
export function modulFakten(module: Modul[], fakten: Record<string, FaktWert>): Record<string, FaktWert> {
  const out = { ...fakten };
  for (const m of module)
    for (const [id, d] of Object.entries(m.fakten ?? {})) {
      if (out[id] && out[id].herkunft !== 'modul') continue;
      if (d.wert !== undefined) out[id] = { wert: d.wert, herkunft: 'modul', quelle: m.name, sicherheit: 'sicher' };
      else if (d.nach) {
        const basis = out[d.nach.fakt];
        if (basis?.wert == null) continue;
        const v = d.nach.tabelle[String(basis.wert)] ?? d.nach.sonst;
        if (v !== undefined) out[id] = { wert: v, herkunft: 'modul', quelle: m.name, sicherheit: basis.sicherheit, ...(basis.bestaetigt ? { bestaetigt: basis.bestaetigt } : {}) };
      }
    }
  return out;
}

const zaehlerLeer = (): Record<Ampel, number> => ({ rot: 0, gelb: 0, gruen: 0 });
/** ganze Tage von einem Zeitpunkt (ISO) bis zu einem Tag (JJJJ-MM-TT) */
const tageSeit = (iso: string, heute: string) => Math.floor((Date.parse(`${heute}T12:00:00`) - Date.parse(iso)) / 86400000);
const undW = (a: Wahrheit, b: Wahrheit): Wahrheit => (a === 'nein' || b === 'nein' ? 'nein' : a === 'offen' || b === 'offen' ? 'offen' : 'ja');

export function auswerten(e: AuswertungsEingabe): Auswertung {
  // nur die aktiven Module: Bausteine und Fakten inaktiver Module dürfen nichts beeinflussen
  const bausteine: Record<string, Kurz> = Object.assign({}, ...e.module.map((m) => m.bausteine ?? {}));
  const faktDefs = faktDefinitionen(e.module);
  const tageAlt = e.rechtsstandTage ?? RECHTSSTAND_TAGE;
  const entscheidungBis = plusMonate(e.einreichung, e.entscheidungMonate ?? ENTSCHEIDUNG_MONATE);
  const fakten = modulFakten(e.module, e.fakten);
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
      for (const [nr, r] of Object.entries(datei?.regel.paragrafen ?? {})) titelCache.set(`${key}/${nr}`, `${paragrafName(nr)} ${stand?.fassung?.paragrafen[nr]?.titel || r.titel || ''} ${m.normen[norm].kurz}`.replace(/\s+/g, ' ').trim());
    }

  const ergebnisse = new Map<string, ParagrafErgebnis>();
  const inArbeit = new Set<string>();
  const regelVon = new Map<string, { n: (typeof normen)[number]; nr: string; r: ParagrafRegel }>();
  for (const n of normen) for (const [nr, r] of Object.entries(n.datei?.regel.paragrafen ?? {})) regelVon.set(`${n.key}/${nr}`, { n, nr, r });

  const ctx: KurzKontext = {
    merkmale: e.merkmale,
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
      if (p.festlegung?.bestaetigt && !p.ueberholt) return { ampel: p.festlegung.ampel, unsicher: true };
      return { ampel: p.automatisch };
    },
  };

  const geltungCache = new Map<string, Bewertung>();
  const geltung = (n: (typeof normen)[number]): Bewertung => {
    let g = geltungCache.get(n.key);
    if (!g) {
      g = werten(n.datei?.regel.geltung, ctx);
      geltungCache.set(n.key, g);
    }
    return g;
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
    let ampel: Ampel;
    let tragend: Bewertung[] = [];
    if (g.w === 'nein') {
      ampel = 'gruen';
      gruende.push(`Entfällt mit der Norm: ${n.datei?.regel.geltungGrund ?? `gilt nur bei ${kurzText(n.datei?.regel.geltung, text)}`}`);
      tragend = [g];
    } else if (entf?.w === 'ja') {
      ampel = 'gruen';
      gruende.push(`Entfällt: ${kurzText(r.entfaellt, text)}`);
      tragend = [entf];
    } else if (tatbestand === 'ja') {
      ampel = 'rot';
      gruende.push(r.grund);
      tragend = [g, gilt];
      if (entf?.w === 'offen') hinweise.push(`Ausnahme möglich (${kurzText(r.entfaellt, text)}) – fehlt: ${entf.offen.map((o) => offenText(o, text)).join(', ')}`);
    } else if (tatbestand === 'nein') {
      ampel = 'gruen';
      gruende.push(r.gilt ? `Gilt nicht: Voraussetzung ist ${kurzText(r.gilt, text)}` : 'Gilt nicht');
      tragend = [gilt];
    } else {
      ampel = 'gelb';
      const fehlt = [...new Set([...g.offen, ...gilt.offen])];
      gruende.push(`Offen – gilt bei ${kurzText(r.gilt ?? n.datei?.regel.geltung, text) || 'Geltung der Norm'}; fehlt: ${fehlt.map((o) => offenText(o, text)).join(', ') || 'Angaben'}`);
      tragend = [g, gilt];
    }

    // Änderungen am Text seit der Prüfung der Regel
    const geaendert: string[] = [];
    if (fassung && r.stand) for (const [k, summe] of Object.entries(r.stand)) if (fassung.summen[k] !== summe) geaendert.push(k);
    const unsicher = [...new Set(tragend.flatMap((b) => b.unsicher))];
    const widerspruch = [...new Set(tragend.flatMap((b) => b.widerspruch))];
    const offen = ampel === 'gelb' ? [...new Set(tragend.flatMap((b) => b.offen))] : entf?.w === 'offen' && ampel === 'rot' ? entf.offen : [];

    // zur sicheren Seite
    if (ampel === 'gruen') {
      const herab: string[] = [];
      // Einzelfall macht Grün nur gelb, wenn die Regel sagt, wann (sonst nur Hinweis bei Rot)
      // … und auch dann, wenn das „nein“ nur auf Hinweisen oder widersprüchlichen Angaben beruht
      if (r.pruefen?.wenn && (pruef.w !== 'nein' || pruef.unsicher?.length || pruef.widerspruch?.length)) herab.push(`Einzelfall: ${r.pruefen.grund}`);
      if (r.gruenNurVonHand) herab.push('Kann nur von Hand ausgeschlossen werden (z. B. nach Prüfung vor Ort).');
      if (geaendert.length) herab.push(`Text seit der Prüfung der Regel geändert (${geaendert.map(fundstelleName).join(', ')}) – Regel noch nicht nachgezogen.`);
      if (unsicher.length) herab.push(`Nur Hinweis, nicht gesichert: ${unsicher.map((u) => offenText(u, text)).join(', ')}.`);
      if (widerspruch.length) herab.push(`Widerspruch: ${widerspruch.map((w) => offenText(w, text)).join(', ')} – Angaben widersprechen einander (Merkmal/Modell bzw. von Hand/Geodienst).`);
      if (!fassung && r.stand && g.w !== 'nein') herab.push('Text der Norm nicht verfügbar – nicht an der geltenden Fassung geprüft.');
      if (fassung && r.stand && !n.stand?.geprueft) herab.push('Rechtsstand nie an der Quelle bestätigt – ob die Fassung noch gilt, ist offen.');
      else if (fassung && r.stand && n.stand?.geprueft && tageSeit(n.stand.geprueft, e.heute) > tageAlt) herab.push(`Rechtsstand seit ${tageSeit(n.stand.geprueft, e.heute)} Tagen nicht an der Quelle bestätigt – ob die Fassung noch gilt, ist offen.`);
      const angekuendigt = (n.stand?.kuenftige ?? []).filter((k) => k.gueltigAb > e.einreichung && k.gueltigAb <= entscheidungBis);
      if (r.stand && angekuendigt.length) herab.push(`Neue Fassung ab ${angekuendigt.map((k) => k.gueltigAb.split('-').reverse().join('.')).join(', ')} angekündigt – voraussichtlich vor der Entscheidung; an der künftigen Fassung prüfen.`);
      if (fassung && !fassung.paragrafen[nr] && g.w !== 'nein') herab.push(`${paragrafName(nr)} steht nicht (mehr) im Text der geltenden Fassung.`);
      if (herab.length) {
        // der Grund für Gelb zuerst (steht in der Liste), dann warum es sonst grün wäre
        ampel = 'gelb';
        gruende.unshift(...herab);
      }
    } else if (ampel === 'rot') {
      if (pruef.w === 'ja' && r.pruefen) hinweise.push(`Im Einzelfall prüfen: ${r.pruefen.grund}`);
      if (geaendert.length) hinweise.push(`Text seit der Prüfung der Regel geändert (${geaendert.map(fundstelleName).join(', ')}).`);
    }
    if (r.hinweis) hinweise.push(r.hinweis);
    if (def.annahme) hinweise.push(`Annahme: ${def.annahme}`);
    if (fassung?.texterkennung) hinweise.push('Text aus Texterkennung (Scan) – maßgeblich ist die Originalurkunde.');

    const automatisch = ampel;
    const fl = e.festlegungen[id];
    let ueberholt: string | undefined;
    if (fl) {
      ampel = fl.ampel;
      const gruende2: string[] = [];
      if (fl.automatisch !== automatisch) gruende2.push(`automatisch jetzt ${automatisch === 'rot' ? 'rot' : automatisch === 'gruen' ? 'grün' : 'gelb'} statt ${fl.automatisch === 'rot' ? 'rot' : fl.automatisch === 'gruen' ? 'grün' : 'gelb'}`);
      for (const [f, alt] of Object.entries(fl.fakten ?? {})) {
        const jetzt = f.startsWith('merkmal:') ? (e.merkmale[f.slice(8)] ?? null) : (fakten[f]?.wert ?? null);
        if (jetzt !== alt) gruende2.push(`${offenText(f, text)} geändert`);
      }
      if (fassung) for (const [k, summe] of Object.entries(fl.stand ?? {})) if (fassung.summen[k] !== summe) gruende2.push(`Text von § ${k.replace('/', ' Abs. ')} geändert`);
      if (gruende2.length) ueberholt = gruende2.join('; ');
      // ein überholtes „entfällt“ trägt nicht mehr (zur sicheren Seite); strengere Festlegungen bleiben
      if (ueberholt && fl.ampel === 'gruen') {
        ampel = 'gelb';
        gruende.unshift(`Festlegung „entfällt“ überholt (${ueberholt}) – erneut festlegen oder aufheben.`);
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
      geaendert,
      verwendet: [...new Set([...g.verwendet, ...gilt.verwendet, ...(entf?.verwendet ?? []), ...(pruef.verwendet ?? [])])].filter((v) => !v.startsWith('tag:')),
      ...(behoerde ? { behoerde } : {}),
      ...(r.nachweis ? { nachweis: r.nachweis } : {}),
      fundstellen: r.fundstellen ?? [nr],
      ...(r.verweise ? { verweise: r.verweise } : {}),
      ...(fl ? { festlegung: fl } : {}),
      ...(ueberholt ? { ueberholt } : {}),
      ...(n.datei ? { regel: { datei: n.datei.datei, version: n.datei.regel.version, fassung: n.datei.regel.fassung } } : {}),
      ...(def.annahme ? { annahme: def.annahme } : {}),
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
  for (const p of paragrafen) if (p.automatisch === 'gelb' || (p.automatisch === 'rot' && p.offen.length)) for (const o of p.offen) if (!o.startsWith('paragraf:')) zahl.set(o, (zahl.get(o) ?? 0) + 1);
  const klaerung = [...zahl.entries()].map(([id, anzahl]) => ({ id, titel: offenText(id, text), anzahl })).sort((a, b) => b.anzahl - a.anzahl || a.titel.localeCompare(b.titel, 'de'));

  const hinweise = e.module.flatMap((m) => (m.hinweise ?? []).filter((h) => !h.wenn || werten(h.wenn, ctx).w !== 'nein').map((h) => ({ ...h, modul: m.name })));
  return { normen: normErgebnisse, paragrafen, zaehler, klaerung, hinweise, fakten, faktDefs, text };
}

