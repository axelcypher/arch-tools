/**
 * Vorgaben der App für Formulare: je Formular und Stand eingebaute Einstellungen – Titel, Gruppen und Bedingungen
 * nach der Rechtsgrundlage (siehe vorgaben/). Die eigenen Einstellungen liegen darüber und gehen immer vor.
 *
 * Gespeichert werden nur die **Abweichungen** von der Vorgabe: was man selbst geändert hat. Alles andere folgt der
 * Vorgabe – auch wenn eine spätere Version der App sie verbessert. Eine Abweichung kann eine Vorgabe auch
 * aufheben: `bedingung: null` (ausdrücklich keine Bedingung), `titel: ''` (der erkannte Titel), `ohneGruppen`
 * (eine Gruppe der Vorgabe aufgelöst).
 *
 * Die Oberfläche arbeitet mit dem wirksamen Profil (Vorgabe + Abweichungen); beim Speichern wird daraus wieder die
 * Abweichung berechnet: `wirksam(V, abweichung(V, P))` ergibt P.
 */

import type { Bedingung } from './bedingung';
import { bedingungAus } from './bedingung';
import type { AbschnittProfil, FormularProfil, Gruppe } from './profil';
import { bereinigt, leeresProfil } from './profil';
import { VORGABEN } from './vorgaben';

export interface AbschnittAbweichung {
  sichtbar?: boolean;
  /** '' = der erkannte Titel statt dem der Vorgabe */
  titel?: string;
  /** null = ausdrücklich keine Bedingung */
  bedingung?: Bedingung | null;
}

/** Eigene Einstellungen eines Formulars als Abweichung von der Vorgabe (ohne Vorgabe: alle eigenen Einstellungen) */
export interface Abweichung {
  abschnitte: Record<string, AbschnittAbweichung>;
  /** Feldschlüssel → zählt (auch `true`, wenn die Vorgabe es ausnimmt) */
  zaehlt: Record<string, boolean>;
  /** '' = der erkannte Titel statt dem der Vorgabe */
  feldTitel?: Record<string, string>;
  /** neue Gruppen und geänderte der Vorgabe (gleiche id ersetzt sie) */
  gruppen?: Gruppe[];
  /** aufgelöste Gruppen der Vorgabe */
  ohneGruppen?: string[];
  /** null = ausdrücklich keine Bedingung */
  bedingungen?: Record<string, Bedingung | null>;
}

/** Vorgabe für ein Formular (Schlüssel wie beim Profil: `<Kennung>|<Stand>`) */
export const vorgabeFuer = (schluessel: string): FormularProfil | undefined => VORGABEN[schluessel];

export const hatVorgabe = (schluessel: string) => !!VORGABEN[schluessel];

/** gleiche Werte (Reihenfolge der Schlüssel egal) */
export function gleich(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => gleich(x, (b as unknown[])[i]));
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => gleich((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const istObjekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export const istLeer = (e: Abweichung) =>
  !Object.keys(e.abschnitte).length &&
  !Object.keys(e.zaehlt).length &&
  !Object.keys(e.feldTitel ?? {}).length &&
  !(e.gruppen ?? []).length &&
  !(e.ohneGruppen ?? []).length &&
  !Object.keys(e.bedingungen ?? {}).length;

/** Wirksames Profil: Vorgabe, darüber die Abweichungen */
export function wirksam(v: FormularProfil | undefined, e: Abweichung | undefined): FormularProfil {
  if (!v && !e) return leeresProfil();
  const vor: FormularProfil = { ...leeresProfil(), ...v };
  const ab: Abweichung = { abschnitte: {}, zaehlt: {}, ...e };
  const abschnitte: Record<string, AbschnittProfil> = {};
  for (const id of new Set([...Object.keys(vor.abschnitte), ...Object.keys(ab.abschnitte)])) {
    const a: AbschnittProfil = { ...vor.abschnitte[id] };
    const x = ab.abschnitte[id];
    if (x) {
      if (x.sichtbar !== undefined) a.sichtbar = x.sichtbar;
      if (x.titel !== undefined) a.titel = x.titel;
      if (x.bedingung === null) delete a.bedingung;
      else if (x.bedingung) a.bedingung = x.bedingung;
    }
    abschnitte[id] = a;
  }
  const bedingungen: Record<string, Bedingung> = { ...vor.bedingungen };
  for (const [k, b] of Object.entries(ab.bedingungen ?? {})) {
    if (b) bedingungen[k] = b;
    else delete bedingungen[k];
  }
  // Gruppen: eigene ersetzen gleichnamige der Vorgabe; Felder in eigenen Gruppen fehlen in denen der Vorgabe
  const eigene = new Map((ab.gruppen ?? []).map((g) => [g.id, g]));
  const ohne = new Set(ab.ohneGruppen ?? []);
  const vergeben = new Set((ab.gruppen ?? []).flatMap((g) => g.felder));
  const gruppen: Gruppe[] = [];
  for (const g of vor.gruppen ?? []) {
    if (ohne.has(g.id)) continue;
    const x = eigene.get(g.id);
    if (x) {
      gruppen.push(x);
      eigene.delete(g.id);
    } else gruppen.push({ ...g, felder: g.felder.filter((f) => !vergeben.has(f)) });
  }
  gruppen.push(...eigene.values());
  return bereinigt({
    abschnitte,
    zaehlt: { ...vor.zaehlt, ...ab.zaehlt },
    feldTitel: { ...vor.feldTitel, ...ab.feldTitel },
    gruppen,
    bedingungen,
  });
}

/** Was am Profil P von der Vorgabe V abweicht (P wie aus der Oberfläche; wird zuerst bereinigt) */
export function abweichung(v: FormularProfil | undefined, profil: FormularProfil): Abweichung {
  const p = bereinigt(profil);
  if (!v) return p;
  const vor = bereinigt({ ...leeresProfil(), ...v });
  const e: Abweichung = { abschnitte: {}, zaehlt: {} };
  for (const id of new Set([...Object.keys(vor.abschnitte), ...Object.keys(p.abschnitte)])) {
    const a = p.abschnitte[id] ?? {};
    const b = vor.abschnitte[id] ?? {};
    const x: AbschnittAbweichung = {};
    if ((a.sichtbar !== false) !== (b.sichtbar !== false)) x.sichtbar = a.sichtbar !== false;
    if ((a.titel ?? '') !== (b.titel ?? '')) x.titel = a.titel ?? '';
    if (!gleich(a.bedingung, b.bedingung)) x.bedingung = a.bedingung ?? null;
    if (Object.keys(x).length) e.abschnitte[id] = x;
  }
  for (const k of new Set([...Object.keys(vor.zaehlt), ...Object.keys(p.zaehlt)])) {
    if ((p.zaehlt[k] !== false) !== (vor.zaehlt[k] !== false)) e.zaehlt[k] = p.zaehlt[k] !== false;
  }
  const titel: Record<string, string> = {};
  for (const k of new Set([...Object.keys(vor.feldTitel ?? {}), ...Object.keys(p.feldTitel ?? {})])) {
    if ((p.feldTitel?.[k] ?? '') !== (vor.feldTitel?.[k] ?? '')) titel[k] = p.feldTitel?.[k] ?? '';
  }
  if (Object.keys(titel).length) e.feldTitel = titel;
  const bedingungen: Record<string, Bedingung | null> = {};
  for (const k of new Set([...Object.keys(vor.bedingungen ?? {}), ...Object.keys(p.bedingungen ?? {})])) {
    if (!gleich(p.bedingungen?.[k], vor.bedingungen?.[k])) bedingungen[k] = p.bedingungen?.[k] ?? null;
  }
  if (Object.keys(bedingungen).length) e.bedingungen = bedingungen;
  const vorGruppen = new Map((vor.gruppen ?? []).map((g) => [g.id, g]));
  const gruppen = (p.gruppen ?? []).filter((g) => !gleich(g, vorGruppen.get(g.id)));
  if (gruppen.length) e.gruppen = gruppen;
  const da = new Set((p.gruppen ?? []).map((g) => g.id));
  const ohne = [...vorGruppen.keys()].filter((id) => !da.has(id));
  if (ohne.length) e.ohneGruppen = ohne;
  return e;
}

/** Gespeicherte Abweichung prüfen (auch frühere vollständige Profile – sie gelten ganz als eigene Einstellungen) */
export function abweichungAus(roh: unknown): Abweichung | null {
  if (!istObjekt(roh)) return null;
  const e: Abweichung = { abschnitte: {}, zaehlt: {} };
  for (const [id, a] of Object.entries(istObjekt(roh.abschnitte) ? roh.abschnitte : {})) {
    if (!istObjekt(a)) continue;
    const x: AbschnittAbweichung = {};
    if (typeof a.sichtbar === 'boolean') x.sichtbar = a.sichtbar;
    if (typeof a.titel === 'string') x.titel = a.titel.trim();
    if (a.bedingung === null) x.bedingung = null;
    else {
      const b = bedingungAus(a.bedingung);
      if (b) x.bedingung = b;
    }
    if (Object.keys(x).length) e.abschnitte[id] = x;
  }
  for (const [k, z] of Object.entries(istObjekt(roh.zaehlt) ? roh.zaehlt : {})) if (typeof z === 'boolean') e.zaehlt[k] = z;
  const titel = Object.fromEntries(Object.entries(istObjekt(roh.feldTitel) ? roh.feldTitel : {}).flatMap(([k, t]) => (typeof t === 'string' ? [[k, t.trim()]] : [])));
  if (Object.keys(titel).length) e.feldTitel = titel;
  const bedingungen: Record<string, Bedingung | null> = {};
  for (const [k, b] of Object.entries(istObjekt(roh.bedingungen) ? roh.bedingungen : {})) {
    if (b === null) bedingungen[k] = null;
    else {
      const x = bedingungAus(b);
      if (x) bedingungen[k] = x;
    }
  }
  if (Object.keys(bedingungen).length) e.bedingungen = bedingungen;
  if (Array.isArray(roh.gruppen)) {
    const roheGruppen = roh.gruppen.filter((g): g is Record<string, unknown> => istObjekt(g) && typeof g.id === 'string' && Array.isArray(g.felder));
    const gruppen =
      bereinigt({
        ...leeresProfil(),
        gruppen: roheGruppen.map((g) => ({ ...(g as unknown as Gruppe), felder: (g.felder as unknown[]).filter((f): f is string => typeof f === 'string') })),
      }).gruppen ?? [];
    if (gruppen.length) e.gruppen = gruppen;
  }
  if (Array.isArray(roh.ohneGruppen)) {
    const ohne = roh.ohneGruppen.filter((x): x is string => typeof x === 'string');
    if (ohne.length) e.ohneGruppen = [...new Set(ohne)];
  }
  return e;
}

/** Woher eine Einstellung kommt: eigene Änderung, Vorgabe der App oder keine */
export type Herkunft = 'eigen' | 'vorgabe' | null;

export type Eintrag = { art: 'abschnitt'; id: string } | { art: 'feld'; id: string } | { art: 'gruppe'; id: string };

/** Herkunft der Einstellungen eines Abschnitts, Felds oder einer Gruppe */
export function herkunft(v: FormularProfil | undefined, e: Abweichung | undefined, x: Eintrag): Herkunft {
  if (x.art === 'abschnitt') return e?.abschnitte[x.id] ? 'eigen' : v?.abschnitte[x.id] && Object.keys(v.abschnitte[x.id]).length ? 'vorgabe' : null;
  if (x.art === 'gruppe') return e?.gruppen?.some((g) => g.id === x.id) || e?.ohneGruppen?.includes(x.id) ? 'eigen' : v?.gruppen?.some((g) => g.id === x.id) ? 'vorgabe' : null;
  const id = x.id;
  if (e && (id in e.zaehlt || id in (e.feldTitel ?? {}) || id in (e.bedingungen ?? {}))) return 'eigen';
  return v && (id in v.zaehlt || id in (v.feldTitel ?? {}) || id in (v.bedingungen ?? {})) ? 'vorgabe' : null;
}

/** Eigene Änderungen an einem Abschnitt, Feld oder einer Gruppe verwerfen – es gilt wieder die Vorgabe */
export function ohneEigenes(e: Abweichung, x: Eintrag): Abweichung {
  const n: Abweichung = structuredClone(e);
  if (x.art === 'abschnitt') delete n.abschnitte[x.id];
  else if (x.art === 'gruppe') {
    n.gruppen = (n.gruppen ?? []).filter((g) => g.id !== x.id);
    n.ohneGruppen = (n.ohneGruppen ?? []).filter((id) => id !== x.id);
  } else {
    delete n.zaehlt[x.id];
    delete n.feldTitel?.[x.id];
    delete n.bedingungen?.[x.id];
  }
  return n;
}
