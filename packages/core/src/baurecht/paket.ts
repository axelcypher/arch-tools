/**
 * Regelpaket: Module (je Gebiet) und Regeldateien (je Norm und Fassung) laden, prüfen und auswählen.
 *
 *   module/<modul>/modul.json
 *   module/<modul>/<norm>@<fassung>.json
 *   texte/<modul>/<norm>@<fassung>.json   (nur Scans: Text aus der Texterkennung)
 *   index.json                            (Paketversion, Formatversion, SHA-256 je Datei; signiert)
 */

import type { Paragraf } from '../recht/index';
import { sha256 } from '../recht/text';
import { FAKTEN } from './fakten';
import type { FaktDef, Kurz, Modul, Regeldatei } from './typen';

export const PAKET_FORMAT = 1;

export interface Paket {
  /** Paketversion, z. B. „2026.11.12-1“ */
  version: string;
  module: Modul[];
  /** Regeldateien je `modul/norm`, nach Fassung aufsteigend */
  regeln: Map<string, { datei: string; regel: Regeldatei }[]>;
  texte: Map<string, Record<string, Paragraf>>;
  /** Herkunft: mit der App geliefert oder nachgeladen */
  herkunft: 'mitgeliefert' | 'nachgeladen';
}

/** Paket aus Dateien (Pfad im Paket → Inhalt) */
export function paketAusDateien(dateien: Record<string, unknown>, version: string, herkunft: Paket['herkunft'] = 'mitgeliefert'): Paket {
  const module: Modul[] = [];
  const regeln = new Map<string, { datei: string; regel: Regeldatei }[]>();
  const texte = new Map<string, Record<string, Paragraf>>();
  for (const [pfad, inhalt] of Object.entries(dateien)) {
    const p = pfad.replace(/\\/g, '/').replace(/^.*?(module|texte)\//, '$1/');
    if (/^module\/[^/]+\/modul\.json$/.test(p)) module.push(inhalt as Modul);
    else if (/^module\/[^/]+\/[^/]+@\d{4}-\d\d-\d\d\.json$/.test(p)) {
      const r = inhalt as Regeldatei;
      const k = `${r.modul}/${r.norm}`;
      regeln.set(k, [...(regeln.get(k) ?? []), { datei: p, regel: r }].sort((a, b) => a.regel.fassung.localeCompare(b.regel.fassung)));
    } else if (/^texte\//.test(p)) texte.set(p, (inhalt as { paragrafen: Record<string, Paragraf> }).paragrafen ?? (inhalt as Record<string, Paragraf>));
  }
  return { version, module, regeln, texte, herkunft };
}

/**
 * Aktive Module nach Gemeindeschlüssel: Bund immer, Land/Kreis nach dem Anfang des Schlüssels, Gemeinde bei
 * Gleichheit. Ohne Schlüssel nur Bund (und die App sagt, dass er fehlt).
 */
export function aktiveModule(module: Modul[], ags: string | null | undefined): Modul[] {
  const a = (ags ?? '').replace(/\D/g, '');
  const reihe = { bund: 0, land: 1, kreis: 2, gemeinde: 3 };
  return module
    .filter((m) => {
      if (m.ebene === 'bund') return true;
      if (!a || !m.schluessel) return false;
      return m.ebene === 'gemeinde' ? a === m.schluessel : a.startsWith(m.schluessel);
    })
    .sort((x, y) => reihe[x.ebene] - reihe[y.ebene]);
}

/** Welche Ebenen für den Schlüssel fehlen (kein Modul) – für den Hinweis oben */
export function fehlendeEbenen(module: Modul[], ags: string | null | undefined): ('land' | 'kreis' | 'gemeinde')[] {
  const a = (ags ?? '').replace(/\D/g, '');
  if (a.length !== 8) return ['land', 'kreis', 'gemeinde'];
  const aktiv = aktiveModule(module, a);
  const out: ('land' | 'kreis' | 'gemeinde')[] = [];
  if (!aktiv.some((m) => m.ebene === 'land')) out.push('land');
  // kreisfreie Städte (Kreisteil …000? nein: Gemeindeteil 000) haben keine Kreisebene
  const kreisfrei = a.endsWith('000');
  if (!kreisfrei && !aktiv.some((m) => m.ebene === 'kreis')) out.push('kreis');
  if (!aktiv.some((m) => m.ebene === 'gemeinde')) out.push('gemeinde');
  return out;
}

/** Gemeindeschlüssel aus der PLZ, wenn ein Gemeindemodul sie nennt (nur Vorschlag) */
export function agsVorschlag(module: Modul[], plz: string): string | null {
  const p = plz.trim();
  return module.find((m) => m.ebene === 'gemeinde' && m.plz?.includes(p))?.schluessel ?? null;
}

/**
 * Regeldatei einer Norm für eine Textfassung (Abschnitt 6.6): die neueste Datei mit Fassung ≤ Gültig-ab des Textes.
 * Ohne Text: die neueste Datei mit Fassung ≤ Stichtag, sonst die älteste.
 */
export function regeldateiFuer(liste: { datei: string; regel: Regeldatei }[] | undefined, gueltigAb: string | undefined, stichtag: string): { datei: string; regel: Regeldatei } | undefined {
  if (!liste?.length) return undefined;
  const bis = gueltigAb ?? stichtag;
  return [...liste].reverse().find((e) => e.regel.fassung <= bis) ?? liste[0];
}

/* ---------- Prüfung des Pakets (Tests und beim Laden) ---------- */

function blaetter(k: Kurz | undefined, out: Kurz[] = []): Kurz[] {
  if (!k) return out;
  if ('und' in k) k.und.forEach((x) => blaetter(x, out));
  else if ('oder' in k) k.oder.forEach((x) => blaetter(x, out));
  else if ('nicht' in k && !('m' in k)) blaetter(k.nicht, out);
  else out.push(k);
  return out;
}

/** erlaubte Schlüssel je Art einer Bedingung */
const KNOTEN: [string, string[]][] = [
  ['m', ['in', 'nicht']],
  ['f', ['ist', 'in', 'min', 'max', 'bekannt']],
  ['tag', ['ab', 'vor']],
  ['n', ['ampel']],
  ['$', []],
  ['und', []],
  ['oder', []],
  ['nicht', []],
  ['immer', []],
  ['nie', []],
];

/** Aufbau einer Bedingung: genau eine bekannte Art, nur ihre Schlüssel, keine leeren Listen */
function aufbauFehler(k: unknown, wo: string, out: string[], tiefe = 0): void {
  if (tiefe > 40) {
    out.push(`${wo}: Bedingung zu tief verschachtelt`);
    return;
  }
  if (!k || typeof k !== 'object' || Array.isArray(k)) {
    out.push(`${wo}: Bedingung ist kein Objekt`);
    return;
  }
  const o = k as Record<string, unknown>;
  const schluessel = Object.keys(o);
  // „nicht“ ist bei Merkmalen ein Zusatz, sonst eine eigene Art
  const art = KNOTEN.find(([a]) => a in o && !(a === 'nicht' && 'm' in o));
  if (!art) {
    out.push(`${wo}: unbekannte Bedingung ${JSON.stringify(k)}`);
    return;
  }
  const [name, zusatz] = art;
  const fremd = schluessel.filter((x) => x !== name && !zusatz.includes(x));
  if (fremd.length) out.push(`${wo}: unbekannte Angabe(n) ${fremd.join(', ')} in „${name}“`);
  if (name === 'und' || name === 'oder') {
    const l = o[name];
    if (!Array.isArray(l) || !l.length) out.push(`${wo}: „${name}“ ohne Teile`);
    else l.forEach((x) => aufbauFehler(x, wo, out, tiefe + 1));
  }
  if (name === 'nicht') aufbauFehler(o.nicht, wo, out, tiefe + 1);
  if (name === 'm') {
    for (const z of ['in', 'nicht'] as const) if (z in o && (!Array.isArray(o[z]) || !(o[z] as unknown[]).length)) out.push(`${wo}: Merkmal „${String(o.m)}“ mit leerer Liste „${z}“`);
  }
  if (name === 'f' && 'in' in o && (!Array.isArray(o.in) || !(o.in as unknown[]).length)) out.push(`${wo}: Fakt „${String(o.f)}“ mit leerer Liste „in“`);
  if (name === 'n' && (!Array.isArray(o.ampel) || !(o.ampel as unknown[]).length)) out.push(`${wo}: Verweis ohne Ampel`);
  if (name === 'n' && Array.isArray(o.ampel)) for (const a of o.ampel as unknown[]) if (a !== 'rot' && a !== 'gelb' && a !== 'gruen') out.push(`${wo}: Verweis mit unbekannter Ampel „${String(a)}“`);
  if (name === 'tag' && !o.ab && !o.vor) out.push(`${wo}: Stichtag ohne „ab“ bzw. „vor“`);
  if (name === 'tag') for (const z of ['ab', 'vor'] as const) if (z in o && !/^\d{4}-\d\d-\d\d$/.test(String(o[z]))) out.push(`${wo}: Stichtag „${z}“ ist kein Datum (JJJJ-MM-TT)`);
}

/** Bausteine, die sich (über andere) selbst enthalten */
function zyklen(bausteine: Map<string, Kurz[]>): string[] {
  const fehler: string[] = [];
  const fertig = new Set<string>();
  const lauf = (name: string, pfad: string[]) => {
    if (pfad.includes(name)) {
      fehler.push(`Baustein-Zyklus: ${[...pfad.slice(pfad.indexOf(name)), name].join(' → ')}`);
      return;
    }
    if (fertig.has(name)) return;
    for (const def of bausteine.get(name) ?? []) for (const b of blaetter(def)) if ('$' in b) lauf(b.$, [...pfad, name]);
    fertig.add(name);
  };
  for (const name of bausteine.keys()) lauf(name, []);
  return [...new Set(fehler)];
}

/**
 * Zyklen zwischen Fragebedingungen: eine Frage, deren „wenn“ (über Bausteine und den Bezug abgeleiteter Werte) wieder
 * an ihr selbst hängt – dann gäbe es keinen festen Stand, welche Antworten zählen
 */
function fragenZyklen(module: Modul[], bausteine: Map<string, Kurz[]>): string[] {
  // alle Definitionen je Angabe: welche gilt, hängt an den aktiven Modulen (ein Ort ohne Gemeindemodul nimmt die des
  // Landes) – geprüft wird die Vereinigung ihrer Abhängigkeiten (zur sicheren Seite)
  const defs = new Map<string, FaktDef[]>();
  for (const m of module) for (const [id, d] of Object.entries(m.fakten ?? {})) defs.set(id, [...(defs.get(id) ?? []), d]);
  const abhaengig = (id: string): Set<string> => {
    const out = new Set<string>();
    const besucht = new Set<string>();
    const sammeln = (k: Kurz | undefined) => {
      for (const b of blaetter(k)) {
        if ('f' in b) out.add(b.f);
        if ('$' in b && !besucht.has(b.$)) {
          besucht.add(b.$);
          for (const x of bausteine.get(b.$) ?? []) sammeln(x);
        }
      }
    };
    for (const d of defs.get(id) ?? []) {
      // ein abgeleiteter Wert hängt an seinem Bezug (ist der nicht gestellt, wird nichts abgeleitet)
      if (d.nach) out.add(d.nach.fakt);
      sammeln(d.wenn);
    }
    return out;
  };
  const fehler: string[] = [];
  const fertig = new Set<string>();
  const lauf = (id: string, pfad: string[]) => {
    if (pfad.includes(id)) {
      fehler.push(`Fragen-Zyklus: ${[...pfad.slice(pfad.indexOf(id)), id].join(' → ')} – ob eine Frage gestellt wird, darf nicht an ihr selbst hängen`);
      return;
    }
    if (fertig.has(id)) return;
    for (const x of abhaengig(id)) if (defs.has(x)) lauf(x, [...pfad, id]);
    fertig.add(id);
  };
  for (const id of defs.keys()) lauf(id, []);
  return [...new Set(fehler)];
}

/** verweist eine Bedingung (auch über Bausteine) auf die Ampel eines Paragrafen („n“)? */
function verweistAufParagraf(k: unknown, bausteine: Map<string, Kurz[]>, besucht = new Set<string>()): boolean {
  if (Array.isArray(k)) return k.some((x) => verweistAufParagraf(x, bausteine, besucht));
  if (!k || typeof k !== 'object') return false;
  const o = k as Record<string, unknown>;
  if ('n' in o) return true;
  if (typeof o.$ === 'string' && !besucht.has(o.$)) {
    besucht.add(o.$);
    if ((bausteine.get(o.$) ?? []).some((b) => verweistAufParagraf(b, bausteine, besucht))) return true;
  }
  return Object.values(o).some((v) => typeof v === 'object' && verweistAufParagraf(v, bausteine, besucht));
}

/** Prüfsumme (SHA-256, 8 Zeichen) eines leeren Texts */
const LEER_SUMME = 'e3b0c442';

/** Fehler im Paket: unbekannte Fakten, Bausteine, Merkmalwerte, Verweise, doppelte Module, falsches Format */
export function paketPruefen(p: Paket, merkmale: { name: string; werte: string[] }[]): string[] {
  const fehler: string[] = [];
  // Aufbau vorab: ohne Normen bzw. Paragrafen kann nichts weiter geprüft werden (statt eines Absturzes eine Meldung)
  const istObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  const kaputt = p.module.filter((m) => !istObj(m) || typeof m.id !== 'string' || !istObj(m.normen));
  for (const m of kaputt) fehler.push(`${istObj(m) && typeof m.id === 'string' ? m.id : 'Modul'}: Aufbau ungültig (Kennung oder Normen fehlen)`);
  for (const [k, l] of p.regeln) for (const { datei, regel } of l) if (!istObj(regel) || !istObj(regel.paragrafen)) fehler.push(`${datei ?? k}: Aufbau ungültig (Paragrafen fehlen)`);
  if (fehler.length) return fehler;
  const ids = new Set<string>();
  const merkmal = new Map(merkmale.map((m) => [m.name, new Set(m.werte)]));
  const alleParagrafen = new Set<string>();
  for (const [k, l] of p.regeln) for (const { regel } of l) for (const nr of Object.keys(regel.paragrafen)) alleParagrafen.add(`${k}/${nr}`);
  for (const m of p.module) {
    if (m.format !== PAKET_FORMAT) fehler.push(`${m.id}: Format ${String(m.format)} statt ${PAKET_FORMAT}`);
    if (ids.has(m.id)) fehler.push(`${m.id}: Modul doppelt`);
    ids.add(m.id);
    if (m.ebene !== 'bund' && !m.schluessel) fehler.push(`${m.id}: Gemeindeschlüssel fehlt`);
    if (m.ueber && !p.module.some((x) => x.id === m.ueber)) fehler.push(`${m.id}: übergeordnetes Modul „${m.ueber}“ fehlt`);
  }
  // sichtbar für ein Modul: Katalog, das Modul selbst und seine übergeordneten (Kette über `ueber`, Bund immer) –
  // genau die, die zusammen aktiv sind
  const kette = (m: Modul): Modul[] => {
    const out: Modul[] = [];
    const gesehen = new Set<string>();
    for (let x: Modul | undefined = m; x && !gesehen.has(x.id); x = p.module.find((y) => y.id === x!.ueber)) {
      gesehen.add(x.id);
      out.push(x);
    }
    for (const b of p.module.filter((y) => y.ebene === 'bund')) if (!gesehen.has(b.id)) out.push(b);
    return out;
  };
  const sichtbar = (m: Modul) => ({
    fakten: new Map<string, FaktDef>([...Object.entries(FAKTEN), ...kette(m).reverse().flatMap((x) => Object.entries(x.fakten ?? {}))]),
    bausteine: new Set(kette(m).flatMap((x) => Object.keys(x.bausteine ?? {}))),
    bausteinDefs: new Map<string, Kurz>(kette(m).reverse().flatMap((x) => Object.entries(x.bausteine ?? {}))),
  });
  /** Blätter mit aufgelösten Bausteinen (für Prüfungen, die auch im Baustein gelten müssen) */
  const tief = (k: Kurz | undefined, defs: Map<string, Kurz>, tiefe = 0): Kurz[] =>
    blaetter(k).flatMap((b) => ('$' in b && tiefe < 20 && defs.has(b.$) ? tief(defs.get(b.$), defs, tiefe + 1) : [b]));
  // dieselbe Fakt-Kennung in mehreren Modulen muss dieselbe Art haben
  const arten = new Map<string, { typ: string; modul: string }>();
  for (const [id, d] of Object.entries(FAKTEN)) arten.set(id, { typ: d.typ, modul: 'Katalog' });
  for (const m of p.module)
    for (const [id, d] of Object.entries(m.fakten ?? {})) {
      const a = arten.get(id);
      if (a && a.typ !== d.typ) fehler.push(`${m.id}: Fakt „${id}“ hat die Art „${d.typ}“, in ${a.modul} „${a.typ}“`);
      else if (!a) arten.set(id, { typ: d.typ, modul: m.id });
      // feste Werte und Tabellen müssen zur Art passen
      const passt = (w: unknown) => (d.typ === 'janein' ? typeof w === 'boolean' : d.typ === 'zahl' ? typeof w === 'number' : typeof w === 'string' && (d.typ !== 'wahl' || !d.werte || d.werte.includes(w)));
      if (d.wert !== undefined && !passt(d.wert)) fehler.push(`${m.id}: fester Wert von „${id}“ passt nicht zur Art „${d.typ}“`);
      if (d.nach) for (const w of [...Object.values(d.nach.tabelle), ...(d.nach.sonst !== undefined ? [d.nach.sonst] : [])]) if (!passt(w)) fehler.push(`${m.id}: Tabellenwert „${String(w)}“ von „${id}“ passt nicht zur Art „${d.typ}“`);
      // Wert ohne Auslöser: nur mit einer Bedingung „wenn“ sinnvoll und passend zur Art
      if (d.ohneAusloeser !== undefined && (!d.wenn || !passt(d.ohneAusloeser))) fehler.push(`${m.id}: „ohneAusloeser“ von „${id}“ ${d.wenn ? `passt nicht zur Art „${d.typ}“` : 'ohne „wenn“'}`);
    }
  const pruefe = (wo: string, m: Modul, k: Kurz | undefined, o: { ohneBekannt?: boolean } = {}) => {
    if (k === undefined) return;
    const aufbau: string[] = [];
    aufbauFehler(k, wo, aufbau);
    if (aufbau.length) {
      fehler.push(...aufbau);
      return;
    }
    const s = sichtbar(m);
    // „bekannt“ liefert auch bei fehlender Angabe ein festes Ergebnis – in Tatbestand, Ausnahmen und Geltung nicht
    // erlaubt, auch nicht über einen Baustein
    if (o.ohneBekannt && tief(k, s.bausteinDefs).some((b) => 'f' in b && b.bekannt !== undefined)) fehler.push(`${wo}: „bekannt“ liefert auch bei fehlender Angabe ein festes Ergebnis – in Tatbestand und Ausnahmen nicht erlaubt (auch nicht über Bausteine)`);
    for (const b of blaetter(k)) {
      if ('f' in b && !s.fakten.has(b.f)) fehler.push(`${wo}: Fakt „${b.f}“ ist für ${m.id} nicht sichtbar (weder Katalog noch eigenes bzw. übergeordnetes Modul)`);
      if ('$' in b && !s.bausteine.has(b.$)) fehler.push(`${wo}: Baustein „${b.$}“ ist für ${m.id} nicht sichtbar`);
      if ('m' in b) {
        const w = merkmal.get(b.m);
        if (!w) fehler.push(`${wo}: Merkmal „${b.m}“ unbekannt`);
        else for (const x of [...(b.in ?? []), ...(b.nicht ?? [])]) if (!w.has(x)) fehler.push(`${wo}: Merkmal „${b.m}“ hat keinen Wert „${x}“`);
      }
      if ('n' in b && !alleParagrafen.has(b.n)) fehler.push(`${wo}: Verweis auf „${b.n}“ – diesen Paragrafen gibt es im Paket nicht`);
      if ('f' in b) {

        const def = s.fakten.get(b.f);
        const werte = [...(b.in ?? []), ...(b.ist !== undefined ? [b.ist] : [])];
        if (def?.typ === 'janein' && werte.some((x) => typeof x !== 'boolean')) fehler.push(`${wo}: Fakt „${b.f}“ ist ja/nein, verglichen mit „${werte.join(', ')}“`);
        if (def?.typ === 'zahl' && werte.some((x) => typeof x !== 'number')) fehler.push(`${wo}: Fakt „${b.f}“ ist eine Zahl, verglichen mit Text`);
        if ((def?.typ === 'wahl' || def?.typ === 'text') && werte.some((x) => typeof x !== 'string')) fehler.push(`${wo}: Fakt „${b.f}“ ist Text, verglichen mit „${werte.join(', ')}“`);
        if (def?.typ === 'wahl' && def.werte) for (const x of werte) if (!def.werte.includes(String(x))) fehler.push(`${wo}: Fakt „${b.f}“ hat keinen Wert „${String(x)}“`);
        if ((b.min !== undefined || b.max !== undefined) && def && def.typ !== 'zahl') fehler.push(`${wo}: Fakt „${b.f}“ ist keine Zahl`);
      }
    }
  };
  const alleBausteine = new Map<string, Kurz[]>();
  for (const m of p.module) for (const [id, b] of Object.entries(m.bausteine ?? {})) alleBausteine.set(id, [...(alleBausteine.get(id) ?? []), b]);
  fehler.push(...zyklen(alleBausteine));
  fehler.push(...fragenZyklen(p.module, alleBausteine));
  // Bausteine teilen sich einen Namensraum (die Auswertung nimmt den des letzten aktiven Moduls): ein zweiter Baustein
  // gleichen Namens würde z. B. einen Bundesbaustein für eine Gemeinde still umdefinieren
  const bausteinVon = new Map<string, string[]>();
  for (const m of p.module) for (const id of Object.keys(m.bausteine ?? {})) bausteinVon.set(id, [...(bausteinVon.get(id) ?? []), m.id]);
  for (const [id, mods] of bausteinVon) if (mods.length > 1) fehler.push(`Baustein „${id}“ ist mehrfach definiert (${mods.join(', ')}) – Namen von Bausteinen müssen eindeutig sein`);
  for (const m of p.module) {
    for (const [id, b] of Object.entries(m.bausteine ?? {})) pruefe(`${m.id} Baustein ${id}`, m, b);
    for (const [id, f] of Object.entries(m.fakten ?? {})) {
      pruefe(`${m.id} Fakt ${id}`, m, f.wenn);
      // ob eine Frage gestellt wird, hängt nur an Angaben und Merkmalen – nicht an der Ampel eines Paragrafen (die
      // Auswertung bestimmt vorher, welche Antworten zählen)
      if (f.wenn && verweistAufParagraf(f.wenn, alleBausteine)) fehler.push(`${m.id} Fakt ${id}: die Bedingung („wenn“) darf nicht auf Paragrafen verweisen`);
    }
    for (const h of m.hinweise ?? []) pruefe(`${m.id} Hinweis ${h.titel}`, m, h.wenn);
  }
  for (const [k, l] of p.regeln) {
    const [modulId, norm] = k.split('/');
    const m = p.module.find((x) => x.id === modulId);
    if (!m) fehler.push(`${k}: Modul fehlt`);
    else if (!m.normen[norm]) fehler.push(`${k}: Norm ist im Modul nicht erklärt`);
    for (const { datei, regel } of l) {
      if (regel.format !== PAKET_FORMAT) fehler.push(`${datei}: Format`);
      if (!datei.endsWith(`/${regel.norm}@${regel.fassung}.json`)) fehler.push(`${datei}: Dateiname passt nicht zu Norm und Fassung`);
      if (!datei.startsWith(`module/${regel.modul}/`)) fehler.push(`${datei}: liegt nicht im Ordner seines Moduls „${regel.modul}“`);
      if (!m) continue;
      pruefe(`${datei} Geltung`, m, regel.geltung, { ohneBekannt: true });
      for (const [nr, r] of Object.entries(regel.paragrafen)) {
        const wo = `${datei} § ${nr}`;
        if (!r.grund?.trim()) fehler.push(`${wo}: Begründung fehlt`);
        pruefe(wo, m, r.gilt, { ohneBekannt: true });
        pruefe(wo, m, r.entfaellt, { ohneBekannt: true });
        pruefe(wo, m, r.pruefen?.wenn);
        pruefe(wo, m, r.behoerde);
        for (const v of r.verweise ?? []) if (!alleParagrafen.has(v)) fehler.push(`${wo}: Verweis auf „${v}“ – diesen Paragrafen gibt es im Paket nicht`);
        // „35/2“ gehört zu § 35, „A 1.2.9.1“ zu A 1.2.9 (Unterabschnitt der MVV TB)
        for (const fs of r.fundstellen ?? []) if (fs.split('/')[0] !== nr && !fs.startsWith(`${nr}.`)) fehler.push(`${wo}: Fundstelle „${fs}“ gehört zu einem anderen Paragrafen`);
        // die Prüfsumme eines leeren Texts bemerkt keine Änderung (der Absatz wurde beim Abruf nicht gefunden)
        for (const [fs, summe] of Object.entries(r.stand ?? {})) if (summe === LEER_SUMME) fehler.push(`${wo}: Prüfsumme von „${fs}“ ist die eines leeren Texts – Fundstelle im Text nicht gefunden`);
      }
    }
  }
  return fehler;
}

/* ---------- Index und Signatur ---------- */

export interface PaketIndex {
  paket: string;
  format: number;
  erstellt: string;
  dateien: Record<string, { sha256: string; groesse: number }>;
  /** Hosts, die die Module brauchen (wirksam nur bei gültiger Signatur) */
  hosts: string[];
}

/** Index eines Pakets aus seinen Dateien (Werkzeug beim Ausliefern) */
export async function paketIndex(dateien: Record<string, Uint8Array>, version: string, hosts: string[]): Promise<PaketIndex> {
  const out: PaketIndex['dateien'] = {};
  for (const [p, d] of Object.entries(dateien).sort(([a], [b]) => a.localeCompare(b))) out[p] = { sha256: await sha256(d), groesse: d.length };
  return { paket: version, format: PAKET_FORMAT, erstellt: new Date().toISOString(), dateien: out, hosts: [...new Set(hosts)].sort() };
}

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/\s+/g, '')), (c) => c.charCodeAt(0));

/** Signatur (Ed25519, Base64) des Index prüfen – öffentlicher Schlüssel als Base64 (32 Byte roh) */
export async function signaturPruefen(index: Uint8Array, signatur: string, oeffentlich: string): Promise<boolean> {
  try {
    const key = await globalThis.crypto.subtle.importKey('raw', b64(oeffentlich) as BufferSource, { name: 'Ed25519' }, false, ['verify']);
    return await globalThis.crypto.subtle.verify({ name: 'Ed25519' }, key, b64(signatur) as BufferSource, index as BufferSource);
  } catch {
    return false;
  }
}

/** Datei gegen den Index prüfen */
export async function dateiPasst(index: PaketIndex, pfad: string, daten: Uint8Array): Promise<boolean> {
  const e = index.dateien[pfad];
  return !!e && e.groesse === daten.length && e.sha256 === (await sha256(daten));
}

/**
 * Paketversionen vergleichen („2026.11.12-3“ = Version aus package.json, Laufnummer des Releases): true, wenn `a`
 * neuer ist als `b`. Bei gleicher Version gilt eine Laufnummer nur gegen eine andere Laufnummer – gegen den Build
 * (ohne Laufnummer) nicht, denn der Build enthält mindestens den Stand seiner Version. Neue Regeln brauchen deshalb
 * eine neue Version in package.json (der Wächter und das Ausliefern setzen sie voraus).
 */
export function paketNeuer(a: string, b: string): boolean {
  const zerlegen = (v: string) => {
    const [basis, lauf] = v.split('-', 2);
    return { basis: basis.split('.').map((x) => Number.parseInt(x, 10) || 0), lauf: lauf === undefined ? null : Number.parseInt(lauf, 10) || 0 };
  };
  const [x, y] = [zerlegen(a), zerlegen(b)];
  for (let i = 0; i < Math.max(x.basis.length, y.basis.length); i++) if ((x.basis[i] ?? 0) !== (y.basis[i] ?? 0)) return (x.basis[i] ?? 0) > (y.basis[i] ?? 0);
  return x.lauf !== null && y.lauf !== null && x.lauf > y.lauf;
}

/** Index aus Text lesen und seinen Aufbau prüfen (statt ungeprüfter Übernahme); Text = Fehler */
export function indexLesen(text: string): PaketIndex | string {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    return 'Index ist kein JSON';
  }
  const i = roh as Partial<PaketIndex> | null;
  if (!i || typeof i !== 'object') return 'Index ist kein Objekt';
  if (typeof i.paket !== 'string' || !/^\d+(\.\d+)*(-\d+)?$/.test(i.paket)) return 'Index: Paketversion fehlt oder ist ungültig';
  if (typeof i.format !== 'number') return 'Index: Formatversion fehlt';
  if (!i.dateien || typeof i.dateien !== 'object') return 'Index: Dateiliste fehlt';
  for (const [p, d] of Object.entries(i.dateien)) {
    if (!/^(module|texte)\/[\w.-]+\/[\w.@-]+\.json$/.test(p)) return `Index: unzulässiger Dateipfad „${p}“`;
    if (!d || typeof d.sha256 !== 'string' || typeof d.groesse !== 'number') return `Index: Prüfsumme oder Größe fehlt für „${p}“`;
  }
  if (!Array.isArray(i.hosts) || i.hosts.some((h) => typeof h !== 'string')) return 'Index: Hostliste fehlt';
  return i as PaketIndex;
}

export type SigniertesPaket = { paket: Paket; index: PaketIndex } | { fehler: string };

/**
 * Signiertes Regelpaket übernehmen (nachgeladen oder aus der Ablage): Signatur des Index, Format, jede Datei gegen
 * Größe und SHA-256 im Index, dann `paketPruefen` gegen die Merkmale dieser App-Version. Ein Fehler irgendwo verwirft
 * das ganze Paket – es gibt kein halb übernommenes Paket.
 *
 * `datei` liefert die Bytes einer Datei des Index (oder null, wenn sie fehlt).
 */
export async function signiertesPaket(o: {
  indexText: string;
  signatur: string;
  schluessel: string;
  datei: (pfad: string) => Promise<Uint8Array | null>;
  merkmale: { name: string; werte: string[] }[];
}): Promise<SigniertesPaket> {
  if (!o.schluessel) return { fehler: 'kein öffentlicher Schlüssel' };
  if (!(await signaturPruefen(new TextEncoder().encode(o.indexText), o.signatur.trim(), o.schluessel))) return { fehler: 'Signatur ungültig' };
  const index = indexLesen(o.indexText);
  if (typeof index === 'string') return { fehler: index };
  if (index.format !== PAKET_FORMAT) return { fehler: `Format ${index.format} – braucht eine neuere App-Version` };
  const inhalt: Record<string, unknown> = {};
  for (const p of Object.keys(index.dateien)) {
    const d = await o.datei(p);
    if (!d) return { fehler: `${p} fehlt` };
    if (!(await dateiPasst(index, p, d))) return { fehler: `${p} passt nicht zum Index` };
    try {
      inhalt[p] = JSON.parse(new TextDecoder().decode(d)) as unknown;
    } catch {
      return { fehler: `${p} ist kein JSON` };
    }
  }
  const paket = paketAusDateien(inhalt, index.paket, 'nachgeladen');
  if (!paket.module.length) return { fehler: 'Paket ohne Module' };
  const fehler = paketPruefen(paket, o.merkmale);
  if (fehler.length) return { fehler: `Paket passt nicht zu dieser App-Version: ${fehler[0]}${fehler.length > 1 ? ` (und ${fehler.length - 1} weitere)` : ''}` };
  return { paket, index };
}
