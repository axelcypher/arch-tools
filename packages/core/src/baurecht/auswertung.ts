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
import type { Ampel, FaktDef, FaktWert, Festlegung, Hinweis, Kurz, Modul, NormErgebnis, ParagrafErgebnis, ParagrafRegel, Wahrheit } from './typen';

export interface TextStand {
  fassung: Fassung | null;
  fehler?: string;
  kuenftige?: { gueltigAb: string; url: string }[];
}

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
const undW = (a: Wahrheit, b: Wahrheit): Wahrheit => (a === 'nein' || b === 'nein' ? 'nein' : a === 'offen' || b === 'offen' ? 'offen' : 'ja');

export function auswerten(e: AuswertungsEingabe): Auswertung {
  const bausteine: Record<string, Kurz> = Object.assign({}, ...e.paket.module.map((m) => m.bausteine ?? {}));
  const faktDefs = faktDefinitionen(e.paket.module);
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
      for (const [nr, r] of Object.entries(datei?.regel.paragrafen ?? {})) titelCache.set(`${key}/${nr}`, `§ ${nr} ${stand?.fassung?.paragrafen[nr]?.titel || r.titel || ''} ${m.normen[norm].kurz}`.replace(/\s+/g, ' ').trim());
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
      if (ergebnisse.has(id)) return ergebnisse.get(id)!.ampel;
      if (inArbeit.has(id) || !regelVon.has(id)) return undefined;
      return paragraf(id).ampel;
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
      if (r.pruefen?.wenn && pruef.w !== 'nein') herab.push(`Einzelfall: ${r.pruefen.grund}`);
      if (r.gruenNurVonHand) herab.push('Kann nur von Hand ausgeschlossen werden (z. B. nach Prüfung vor Ort).');
      if (geaendert.length) herab.push(`Text seit der Prüfung der Regel geändert (${geaendert.map((k) => `§ ${k.replace('/', ' Abs. ')}`).join(', ')}) – Regel noch nicht nachgezogen.`);
      if (unsicher.length) herab.push(`Nur Hinweis, nicht gesichert: ${unsicher.map((u) => offenText(u, text)).join(', ')}.`);
      if (widerspruch.length) herab.push(`Widerspruch zwischen Merkmal und Modell: ${widerspruch.join(', ')}.`);
      if (!fassung && r.stand && g.w !== 'nein') herab.push('Text der Norm nicht verfügbar – nicht an der geltenden Fassung geprüft.');
      if (fassung && !fassung.paragrafen[nr] && g.w !== 'nein') herab.push(`§ ${nr} steht nicht (mehr) im Text der geltenden Fassung.`);
      if (herab.length) {
        ampel = 'gelb';
        gruende.push(...herab);
      }
    } else if (ampel === 'rot') {
      if (pruef.w === 'ja' && r.pruefen) hinweise.push(`Im Einzelfall prüfen: ${r.pruefen.grund}`);
      if (geaendert.length) hinweise.push(`Text seit der Prüfung der Regel geändert (${geaendert.map((k) => `§ ${k.replace('/', ' Abs. ')}`).join(', ')}).`);
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
    inArbeit.delete(id);
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

