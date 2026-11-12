/**
 * Office-Dateien sind ZIP-Archive. Beim Speichern werden nur die geänderten Teile ersetzt; alle anderen Teile
 * bleiben inhaltlich unverändert und in derselben Reihenfolge.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type Archiv = Map<string, Uint8Array>;

export function archivLesen(bytes: Uint8Array): Archiv {
  return new Map(Object.entries(unzipSync(bytes)));
}

export function archivSchreiben(teile: Archiv): Uint8Array {
  const obj: Record<string, Uint8Array> = {};
  for (const [k, v] of teile) obj[k] = v;
  return zipSync(obj, { level: 6 });
}

export function teilText(a: Archiv, pfad: string): string | null {
  const b = a.get(pfad);
  return b ? strFromU8(b) : null;
}

export const textTeil = (s: string) => strToU8(s);

/** Pfad relativ zu einem Teil auflösen („worksheets/sheet1.xml“ zu „xl/workbook.xml“ → „xl/worksheets/sheet1.xml“) */
export function relativ(basisTeil: string, ziel: string): string {
  if (ziel.startsWith('/')) return ziel.slice(1);
  const teile = basisTeil.split('/').slice(0, -1);
  for (const t of ziel.split('/')) {
    if (t === '..') teile.pop();
    else if (t !== '.') teile.push(t);
  }
  return teile.join('/');
}

/** Beziehungen eines Teils (…/_rels/<name>.rels): Id → Ziel (aufgelöst) */
export function beziehungen(a: Archiv, teil: string): Map<string, { ziel: string; typ: string }> {
  const ordner = teil.split('/').slice(0, -1).join('/');
  const name = teil.split('/').pop()!;
  const rels = teilText(a, `${ordner ? `${ordner}/` : ''}_rels/${name}.rels`);
  const out = new Map<string, { ziel: string; typ: string }>();
  if (!rels) return out;
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]*)"/.exec(m[0])?.[1];
    const ziel = /\bTarget="([^"]*)"/.exec(m[0])?.[1];
    const typ = /\bType="([^"]*)"/.exec(m[0])?.[1] ?? '';
    const extern = /\bTargetMode="External"/.test(m[0]);
    if (id && ziel) out.set(id, { ziel: extern ? ziel : relativ(teil, ziel), typ });
  }
  return out;
}
