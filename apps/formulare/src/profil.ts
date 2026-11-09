/**
 * Formularprofile: je Formular (Kennung + Stand, z. B. „nw010005|2026I“) einstellbar, welche Abschnitte die
 * Gliederung zeigt, wie sie heißen und welche Felder in den Füllstand eingehen. Gilt für alle Projekte, die dieses
 * Formular nutzen; liegt in der App (nicht im FORMA-Projekt).
 *
 * Gezählt wird in Einheiten: jedes Textfeld für sich, Kästchen einer Zeile gemeinsam als eine Auswahl
 * („Gebäudeklasse 1 2 3 4 5“ ist ausgefüllt, wenn eins angekreuzt ist).
 */

import type { Abschnitt, Feld } from './forma/felder';
import { zeilen } from './forma/felder';
import type { Formular } from './forma/formular';
import { kennung, stand } from './forma/formular';

export interface AbschnittProfil {
  /** false = in der Gliederung ausgeblendet */
  sichtbar?: boolean;
  /** eigener Titel statt des erkannten */
  titel?: string;
}

export interface FormularProfil {
  /** Abschnitt (`<Seite>:<Rahmen>`) → Einstellungen */
  abschnitte: Record<string, AbschnittProfil>;
  /** Feldschlüssel (`<Seite>:<Name>`) → zählt für den Füllstand (fehlt = ja) */
  zaehlt: Record<string, boolean>;
}

export const leeresProfil = (): FormularProfil => ({ abschnitte: {}, zaehlt: {} });

/** Profil gilt je Formular und Stand; ohne Kennung nach dem Dateinamen */
export function profilSchluessel(f: Formular, name: string): string {
  const k = kennung(f);
  return k ? `${k}|${stand(f) ?? ''}` : `name|${name.replace(/\s*\(\d{4}\)\s*$/, '')}`;
}

export const abschnittId = (a: Abschnitt) => `${a.felder[0].seite}:${a.rahmen?.o.name ?? '-'}`;

export const istLeer = (p: FormularProfil) => !Object.keys(p.abschnitte).length && !Object.keys(p.zaehlt).length;

export interface Einheit {
  felder: Feld[];
  art: 'text' | 'auswahl';
}

/** Zähleinheiten eines Abschnitts unter Beachtung des Profils */
export function einheiten(a: Abschnitt, profil: FormularProfil): Einheit[] {
  const zaehlt = (f: Feld) => profil.zaehlt[f.schluessel] !== false;
  const texte = a.felder.filter((f) => f.art === 'text' && zaehlt(f)).map((f): Einheit => ({ felder: [f], art: 'text' }));
  const kreuze = zeilen(a.felder.filter((f) => f.art === 'kreuz' && zaehlt(f))).map((z): Einheit => ({ felder: z, art: 'auswahl' }));
  return [...texte, ...kreuze];
}

/** Einheit ausgefüllt: Text nicht leer bzw. mindestens ein Kästchen angekreuzt */
export function ausgefuellt(e: Einheit, wert: (f: Feld) => string | boolean): boolean {
  return e.felder.some((f) => {
    const w = wert(f);
    return w === true || (typeof w === 'string' && w.trim() !== '');
  });
}

/** Profil ohne Einträge, die dem Standard entsprechen (sichtbar, ohne eigenen Titel, zählt mit) */
export function bereinigt(p: FormularProfil): FormularProfil {
  const abschnitte: Record<string, AbschnittProfil> = {};
  for (const [k, v] of Object.entries(p.abschnitte)) {
    const e: AbschnittProfil = {};
    if (v.sichtbar === false) e.sichtbar = false;
    if (v.titel?.trim()) e.titel = v.titel.trim();
    if (Object.keys(e).length) abschnitte[k] = e;
  }
  const zaehlt = Object.fromEntries(Object.entries(p.zaehlt).filter(([, v]) => v === false));
  return { abschnitte, zaehlt };
}
