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
import type { Kurz, Modul, Regeldatei } from './typen';

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

/** Fehler im Paket: unbekannte Fakten, Bausteine, Merkmalwerte, Verweise, doppelte Module, falsches Format */
export function paketPruefen(p: Paket, merkmale: { name: string; werte: string[] }[]): string[] {
  const fehler: string[] = [];
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
  // Fakten und Bausteine sichtbar für ein Modul: die eigenen und die aller anderen Module (Verweise zwischen Ebenen)
  const fakten = new Set([...Object.keys(FAKTEN), ...p.module.flatMap((m) => Object.keys(m.fakten ?? {}))]);
  const bausteine = new Set(p.module.flatMap((m) => Object.keys(m.bausteine ?? {})));
  const pruefe = (wo: string, k: Kurz | undefined) => {
    for (const b of blaetter(k)) {
      if ('f' in b && !fakten.has(b.f)) fehler.push(`${wo}: Fakt „${b.f}“ unbekannt`);
      if ('$' in b && !bausteine.has(b.$)) fehler.push(`${wo}: Baustein „${b.$}“ unbekannt`);
      if ('m' in b) {
        const w = merkmal.get(b.m);
        if (!w) fehler.push(`${wo}: Merkmal „${b.m}“ unbekannt`);
        else for (const x of [...(b.in ?? []), ...(b.nicht ?? [])]) if (!w.has(x)) fehler.push(`${wo}: Merkmal „${b.m}“ hat keinen Wert „${x}“`);
      }
      if ('n' in b && !alleParagrafen.has(b.n)) fehler.push(`${wo}: Verweis auf „${b.n}“ – diesen Paragrafen gibt es im Paket nicht`);
      if ('f' in b) {
        const def = FAKTEN[b.f] ?? p.module.map((m) => m.fakten?.[b.f]).find(Boolean);
        if (def?.typ === 'janein' && b.ist !== undefined && typeof b.ist !== 'boolean') fehler.push(`${wo}: Fakt „${b.f}“ ist ja/nein, verglichen mit „${String(b.ist)}“`);
        if (def?.typ === 'wahl' && def.werte) for (const x of [...(b.in ?? []), ...(b.ist !== undefined ? [b.ist] : [])]) if (!def.werte.includes(String(x))) fehler.push(`${wo}: Fakt „${b.f}“ hat keinen Wert „${String(x)}“`);
        if ((b.min !== undefined || b.max !== undefined) && def && def.typ !== 'zahl') fehler.push(`${wo}: Fakt „${b.f}“ ist keine Zahl`);
      }
    }
  };
  for (const m of p.module) {
    for (const [id, b] of Object.entries(m.bausteine ?? {})) pruefe(`${m.id} Baustein ${id}`, b);
    for (const [id, f] of Object.entries(m.fakten ?? {})) pruefe(`${m.id} Fakt ${id}`, f.wenn);
    for (const h of m.hinweise ?? []) pruefe(`${m.id} Hinweis ${h.titel}`, h.wenn);
  }
  for (const [k, l] of p.regeln) {
    const [modulId, norm] = k.split('/');
    const m = p.module.find((x) => x.id === modulId);
    if (!m) fehler.push(`${k}: Modul fehlt`);
    else if (!m.normen[norm]) fehler.push(`${k}: Norm ist im Modul nicht erklärt`);
    for (const { datei, regel } of l) {
      if (regel.format !== PAKET_FORMAT) fehler.push(`${datei}: Format`);
      if (!datei.endsWith(`/${regel.norm}@${regel.fassung}.json`)) fehler.push(`${datei}: Dateiname passt nicht zu Norm und Fassung`);
      pruefe(`${datei} Geltung`, regel.geltung);
      for (const [nr, r] of Object.entries(regel.paragrafen)) {
        const wo = `${datei} § ${nr}`;
        if (!r.grund?.trim()) fehler.push(`${wo}: Begründung fehlt`);
        pruefe(wo, r.gilt);
        pruefe(wo, r.entfaellt);
        pruefe(wo, r.pruefen?.wenn);
        pruefe(wo, r.behoerde);
        for (const v of r.verweise ?? []) if (!alleParagrafen.has(v)) fehler.push(`${wo}: Verweis auf „${v}“ – diesen Paragrafen gibt es im Paket nicht`);
        for (const fs of r.fundstellen ?? []) if (fs.split('/')[0] !== nr) fehler.push(`${wo}: Fundstelle „${fs}“ gehört zu einem anderen Paragrafen`);
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
