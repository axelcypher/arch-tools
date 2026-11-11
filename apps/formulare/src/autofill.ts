/**
 * Autofill mit Zustand: Felder, die FORMA einem Eintrag der Projektkarte zuordnet, bekommen ihren Text von dort
 * (Auto-Wert). Je Feld merkt sich die App in der Projektdatei (.oap, Abschnitt „formulare“ → `felder`) getrennt
 * den zuletzt eingetragenen Auto-Wert und eine manuelle Überschreibung:
 *
 * - Neue Formulare: leere Felder mit Auto-Wert werden gleich befüllt.
 * - Wer den Auto-Text durch eigenen ersetzt, fixiert die Überschreibung – sie bleibt beim Aktualisieren.
 * - Ein geleertes Feld bekommt wieder den Auto-Wert; erzwungen leer ist ein Feld mit einem Leerzeichen.
 * - Ändern sich die Projektdaten, werden Felder aktualisiert, die noch den (alten) Auto-Wert tragen oder leer
 *   sind; Ausgefülltes wird nie geleert. Felder ohne gespeicherten Zustand mit anderem Inhalt bleiben, wie sie
 *   sind – sie lassen sich im Dialog einzeln übernehmen.
 * - „Manuelle Überschreibungen ignorieren“ (je Formular): auch überschriebene Felder bekommen den Auto-Wert;
 *   die Überschreibung bleibt gemerkt und kommt zurück, wenn der Haken wieder weg ist.
 */

import type { Feld } from './forma/felder';
import type { Formular } from './forma/formular';
import type { Projektkarte, Teil } from './forma/projektkarte';
import { ausfuellen, pkTitel, pkWert, verwendeteEintraege, zuordnungen } from './forma/projektkarte';
import { kennung } from './forma/formular';
import { korrigiert } from './vorgaben/zuordnungen';

export interface FeldZustand {
  /** zuletzt eingetragener Auto-Wert */
  auto: string;
  /** fixierte manuelle Überschreibung (ein Leerzeichen = erzwungen leer) */
  manuell?: string;
}

export interface FormularZustand {
  /** Feldschlüssel (`<Seite>:<Name>`) → Zustand */
  felder: Record<string, FeldZustand>;
  /** manuelle Überschreibungen ignorieren: überall der Auto-Wert */
  ignorieren?: boolean;
}

/** Zustände je Formulardatei (Name im FORMA-Projekt) */
export type Zustaende = Record<string, FormularZustand>;

export interface AutoWert {
  feld: Feld;
  wert: string;
  /** woher der Wert kommt, z. B. „Bauherr: Name/Firma, Vorname“ */
  quelle: string;
}

export const normiert = (s: string) => s.replace(/\s+/g, ' ').trim();
const gleich = (a: string, b: string | undefined) => b !== undefined && normiert(a) === normiert(b);
/** erzwungen leer: nur Leerzeichen (mindestens eins) */
export const erzwungenLeer = (s: string) => s.length > 0 && !s.trim();

function quelle(teile: Teil[], pk: Projektkarte): string {
  const nach = new Map<number, string[]>();
  for (const t of verwendeteEintraege(teile)) {
    const e = pk.eintraege.find((x) => x.gruppe === t.gruppe && x.id === t.id);
    if (!e) continue;
    nach.set(t.gruppe, [...(nach.get(t.gruppe) ?? []), pkTitel(e.titel)]);
  }
  return [...nach].map(([g, titel]) => `${pk.gruppen.find((x) => x.id === g)?.text ?? `Gruppe ${g}`}: ${titel.join(', ')}`).join(' · ');
}

/**
 * Felder mit Zuordnung zur Projektkarte (Textfelder) – unabhängig davon, ob die Projektkarte etwas hat. Verweist ein
 * Vordruck auf die falsche Beteiligten-Gruppe, gilt die Korrektur aus `vorgaben/zuordnungen.ts`.
 */
export function autofillFelder(formular: Formular, felder: Feld[][]): Map<string, { feld: Feld; teile: Teil[] }> {
  const out = new Map<string, { feld: Feld; teile: Teil[] }>();
  const k = kennung(formular);
  formular.seiten.forEach((seite, i) => {
    const nachName = new Map((felder[i] ?? []).map((f) => [f.name, f]));
    for (const [name, teile] of zuordnungen(seite)) {
      const feld = nachName.get(name);
      if (feld && feld.art === 'text') out.set(feld.schluessel, { feld, teile: korrigiert(k, feld.schluessel, teile) });
    }
  });
  return out;
}

/** Auto-Werte eines Formulars aus der Projektkarte (nur Felder, für die sie etwas hat) */
export function autoWerte(formular: Formular, felder: Feld[][], pk: Projektkarte): Map<string, AutoWert> {
  const out = new Map<string, AutoWert>();
  for (const [k, { feld, teile }] of autofillFelder(formular, felder)) {
    const wert = ausfuellen(teile, (g, id) => pkWert(pk, g, id), feld.einzeilig);
    if (wert.trim()) out.set(k, { feld, wert, quelle: quelle(teile, pk) });
  }
  return out;
}

/** Wie ein Feld beim Aktualisieren behandelt wird */
export type SchrittArt =
  /** trägt noch den (alten) Auto-Wert */
  | 'auto'
  /** leer */
  | 'leer'
  /** von Hand überschrieben (fixiert) bzw. erzwungen leer */
  | 'manuell'
  /** anderer Inhalt ohne gespeicherten Zustand (z. B. in FORMA geändert) */
  | 'unbekannt';

export interface Schritt {
  feld: Feld;
  aktuell: string;
  neu: string;
  art: SchrittArt;
  quelle: string;
  /** im Dialog vorgewählt bzw. beim Aktualisieren ohne Rückfrage übernommen */
  vorgewaehlt: boolean;
}

export const ART_TEXT: Record<SchrittArt, string> = {
  auto: 'Auto-Wert veraltet',
  leer: 'leer',
  manuell: 'von Hand überschrieben',
  unbekannt: 'anderer Inhalt (Herkunft unbekannt)',
};

/**
 * Was beim Aktualisieren geschieht: je Feld mit Auto-Wert, dessen Inhalt sich ändern würde. `alteAuto` sind die
 * Auto-Werte vor einer Änderung der Projektkarte – stimmt ein Feld damit überein, war es nicht von Hand
 * geändert (auch ohne gespeicherten Zustand).
 */
export function aktualisierung(auto: Map<string, AutoWert>, wert: (f: Feld) => string, zustand: FormularZustand | undefined, alteAuto?: Map<string, AutoWert>): Schritt[] {
  const out: Schritt[] = [];
  for (const [k, a] of auto) {
    const aktuell = wert(a.feld);
    const z = zustand?.felder[k];
    let art: SchrittArt;
    if (z?.manuell !== undefined || erzwungenLeer(aktuell)) {
      // im Ignorieren-Modus steht im Feld schon der Auto-Wert: der neue kommt dazu
      if (zustand?.ignorieren && z?.manuell !== undefined && (gleich(aktuell, z.auto) || !aktuell)) art = 'auto';
      else art = 'manuell';
    } else if (!aktuell) art = 'leer';
    else if (gleich(aktuell, a.wert)) continue;
    else if (gleich(aktuell, z?.auto) || gleich(aktuell, alteAuto?.get(k)?.wert)) art = 'auto';
    else art = 'unbekannt';
    if (gleich(aktuell, a.wert) && aktuell.trim()) continue;
    out.push({ feld: a.feld, aktuell, neu: a.wert, art, quelle: a.quelle, vorgewaehlt: art === 'auto' || art === 'leer' || (art === 'manuell' && !!zustand?.ignorieren) });
  }
  return out;
}

/** Zustand nach dem Übernehmen von Auto-Werten (übernommene Felder: Auto-Wert, Überschreibung im Ignorieren-Modus bleibt gemerkt) */
export function nachUebernahme(zustand: FormularZustand | undefined, uebernommen: { feld: Feld; neu: string }[], auto: Map<string, AutoWert>, wert: (f: Feld) => string): FormularZustand {
  const felder: Record<string, FeldZustand> = { ...zustand?.felder };
  const neu = new Map(uebernommen.map((u) => [u.feld.schluessel, u.neu]));
  for (const [k, a] of auto) {
    const z = felder[k];
    if (neu.has(k)) felder[k] = zustand?.ignorieren && z?.manuell !== undefined ? { auto: a.wert, manuell: z.manuell } : { auto: a.wert };
    else if (gleich(wert(a.feld), a.wert)) felder[k] = z?.manuell !== undefined && zustand?.ignorieren ? { ...z, auto: a.wert } : { auto: a.wert };
    else if (z) felder[k] = { ...z, auto: z.auto };
  }
  return { ...zustand, felder };
}

/**
 * Zustand beim Speichern eines Formulars: Felder, die in dieser Sitzung geändert wurden, sind Auto (gleich dem
 * aktuellen oder dem zuletzt eingetragenen Auto-Wert) oder fixiert überschrieben (anderer Inhalt, auch ein
 * Leerzeichen). Unveränderte Felder behalten ihren Zustand.
 */
export function zustandBeimSpeichern(
  zustand: FormularZustand | undefined,
  geaendert: Iterable<string>,
  wert: (k: string) => string | undefined,
  bezug: (k: string) => { aktuell?: string; zuletzt?: string },
): FormularZustand {
  const felder: Record<string, FeldZustand> = { ...zustand?.felder };
  for (const k of geaendert) {
    const { aktuell, zuletzt } = bezug(k);
    const v = wert(k);
    const ref = zuletzt ?? aktuell;
    if (ref === undefined || v === undefined) continue;
    const z = felder[k];
    const autoWert = v.trim() && gleich(v, aktuell) ? aktuell! : v.trim() && gleich(v, zuletzt) ? zuletzt! : undefined;
    if (autoWert !== undefined) felder[k] = zustand?.ignorieren && z?.manuell !== undefined ? { auto: autoWert, manuell: z.manuell } : { auto: autoWert };
    else if (v) felder[k] = { auto: ref, manuell: v };
    else felder[k] = { auto: ref };
  }
  return { ...zustand, felder };
}

/** Werte beim Umschalten von „Manuelle Überschreibungen ignorieren“: an = Auto-Werte, aus = die Überschreibungen zurück */
export function beimIgnorieren(zustand: FormularZustand | undefined, an: boolean, auto: Map<string, AutoWert>): { schluessel: string; wert: string }[] {
  const out: { schluessel: string; wert: string }[] = [];
  for (const [k, z] of Object.entries(zustand?.felder ?? {})) {
    if (z.manuell === undefined) continue;
    out.push({ schluessel: k, wert: an ? (auto.get(k)?.wert ?? z.auto) : z.manuell });
  }
  return out;
}

/** Zustände aus der Projektdatei prüfen */
export function zustaendeAus(roh: unknown): Zustaende {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return {};
  const out: Zustaende = {};
  for (const [datei, z] of Object.entries(roh as Record<string, unknown>)) {
    if (!z || typeof z !== 'object') continue;
    const o = z as Record<string, unknown>;
    const felder: Record<string, FeldZustand> = {};
    for (const [k, f] of Object.entries(o.felder && typeof o.felder === 'object' ? (o.felder as Record<string, unknown>) : {})) {
      if (!f || typeof f !== 'object' || typeof (f as FeldZustand).auto !== 'string') continue;
      const fz: FeldZustand = { auto: (f as FeldZustand).auto };
      if (typeof (f as FeldZustand).manuell === 'string') fz.manuell = (f as FeldZustand).manuell;
      felder[k] = fz;
    }
    const fz: FormularZustand = { felder };
    if (o.ignorieren === true) fz.ignorieren = true;
    if (Object.keys(felder).length || fz.ignorieren) out[datei] = fz;
  }
  return out;
}
