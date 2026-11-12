/**
 * Einstellungen sichern und übertragen: alles, was die App im lokalen Speicher an Einstellungen hält – nicht
 * Entwürfe, Verlauf oder Formularinhalte –, als eine JSON-Datei. Zum Sichern, für einen anderen Rechner, für
 * Kolleginnen und Kollegen oder als Vorlage für die Vorgaben der App.
 */

import type { Abweichung } from './vorgabe';
import { abweichungAus, istLeer } from './vorgabe';

export const SICHERUNG_ART = 'formulare-einstellungen';

export interface SicherungsBereich {
  /** Schlüssel im lokalen Speicher */
  schluessel: string;
  titel: string;
  /** gilt nur für diesen Rechner (Ordnerpfade …) – beim Einspielen zunächst nicht angehakt */
  lokal?: boolean;
  /** je Formular bzw. Projekt: Einträge aus der Datei ersetzen gleichnamige, andere bleiben */
  jeEintrag?: boolean;
  /** Umfang in Worten („12 Formulare“) */
  umfang: (wert: unknown) => string;
}

const anzahl = (n: number, eins: string, mehr: string) => `${n} ${n === 1 ? eins : mehr}`;
const istObjekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const eintraege = (x: unknown) => (istObjekt(x) ? Object.keys(x).length : 0);
const liste = (x: unknown) => (Array.isArray(x) ? x.length : 0);

export const SICHERUNG_BEREICHE: SicherungsBereich[] = [
  {
    schluessel: 'formulare:profile',
    titel: 'Gliederung der Formulare (Titel, Gruppen, Bedingungen)',
    jeEintrag: true,
    umfang: (w) => anzahl(eintraege(w), 'Formular', 'Formulare'),
  },
  { schluessel: 'formulare:merkmale', titel: 'Antragsmerkmale', umfang: (w) => anzahl(liste(w), 'Merkmal', 'Merkmale') },
  { schluessel: 'formulare:katalog', titel: 'Antragsdokumente (Katalog)', umfang: (w) => anzahl(liste(w), 'Dokument', 'Dokumente') },
  { schluessel: 'formulare:vorlagen', titel: 'Antragsvorlagen', umfang: (w) => anzahl(liste(w), 'Vorlage', 'Vorlagen') },
  { schluessel: 'formulare:export', titel: 'Antrag & Export (Ordner, Namensvorlage, Phase)', umfang: () => 'angepasst' },
  {
    schluessel: 'formulare:export-projekte',
    titel: 'Antrag & Export: Abweichungen je Projekt',
    jeEintrag: true,
    umfang: (w) => anzahl(eintraege(w), 'Projekt', 'Projekte'),
  },
  { schluessel: 'formulare:stammdaten', titel: 'Bürostammdaten', umfang: (w) => anzahl(liste(w), 'Adresse', 'Adressen') },
  {
    schluessel: 'formulare:einstellungen',
    titel: 'Ordner, angezeigte Pfade, Projektdatei, Ansicht',
    lokal: true,
    umfang: (w) => (istObjekt(w) ? anzahl(liste(w.projektordner) + liste(w.ablageordner), 'Ordner', 'Ordner') : 'angepasst'),
  },
];

export interface Sicherung {
  art: typeof SICHERUNG_ART;
  version: 1;
  /** Version der App, die die Datei geschrieben hat */
  app?: string;
  /** ISO-Zeitpunkt */
  erstellt: string;
  /** Schlüssel im lokalen Speicher → Wert */
  daten: Record<string, unknown>;
}

function speicherLesen(schluessel: string): unknown {
  try {
    const roh = localStorage.getItem(schluessel);
    return roh == null ? undefined : (JSON.parse(roh) as unknown);
  } catch {
    return undefined;
  }
}

/** Alle Einstellungen dieser App (nur, was vom Standard abweicht bzw. angelegt wurde) */
export function sicherungErstellen(app?: string, jetzt = new Date()): Sicherung {
  const daten: Record<string, unknown> = {};
  for (const b of SICHERUNG_BEREICHE) {
    const w = speicherLesen(b.schluessel);
    if (w !== undefined && w !== null) daten[b.schluessel] = w;
  }
  return { art: SICHERUNG_ART, version: 1, ...(app ? { app } : {}), erstellt: jetzt.toISOString(), daten };
}

export const sicherungText = (s: Sicherung) => `${JSON.stringify(s, null, 2)}\n`;

/** Vorschlag für den Dateinamen: „Formulare-Einstellungen 261110.json“ */
export function sicherungDateiname(jetzt = new Date()): string {
  const zwei = (n: number) => String(n).padStart(2, '0');
  return `Formulare-Einstellungen ${zwei(jetzt.getFullYear() % 100)}${zwei(jetzt.getMonth() + 1)}${zwei(jetzt.getDate())}.json`;
}

/** Liest eine Einstellungsdatei; wirft mit verständlicher Meldung, wenn es keine ist */
export function sicherungLesen(text: string): Sicherung {
  let o: unknown;
  try {
    o = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (!istObjekt(o) || o.art !== SICHERUNG_ART) throw new Error('Die Datei enthält keine Einstellungen der App „Formulare“.');
  if (typeof o.version !== 'number' || o.version > 1) throw new Error('Die Datei stammt aus einer neueren Version der App – bitte zuerst aktualisieren.');
  const daten = istObjekt(o.daten) ? o.daten : {};
  const bekannt = new Set(SICHERUNG_BEREICHE.map((b) => b.schluessel));
  return {
    art: SICHERUNG_ART,
    version: 1,
    ...(typeof o.app === 'string' ? { app: o.app } : {}),
    erstellt: typeof o.erstellt === 'string' ? o.erstellt : '',
    daten: Object.fromEntries(Object.entries(daten).filter(([k, v]) => bekannt.has(k) && v !== null && v !== undefined)),
  };
}

/** Bereiche, die in der Datei stehen */
export const bereicheIn = (s: Sicherung) => SICHERUNG_BEREICHE.filter((b) => b.schluessel in s.daten);

/** Eigene Einstellungen eines Formulars aus einer Datei: geprüft, sonst null */
function profilAus(roh: unknown): Abweichung | null {
  try {
    const e = abweichungAus(roh);
    return e && !istLeer(e) ? e : null;
  } catch {
    return null;
  }
}

/** Wert eines Bereichs prüfen, bevor er in den Speicher kommt (der Rest wird beim Lesen der App geprüft) */
function geprueft(schluessel: string, wert: unknown): unknown {
  if (schluessel === 'formulare:profile') {
    if (!istObjekt(wert)) return undefined;
    return Object.fromEntries(Object.entries(wert).flatMap(([k, v]) => {
      const p = profilAus(v);
      return p ? [[k, p]] : [];
    }));
  }
  if (schluessel === 'formulare:export-projekte') return istObjekt(wert) ? Object.fromEntries(Object.entries(wert).filter(([, v]) => istObjekt(v))) : undefined;
  return wert;
}

/**
 * Spielt die gewählten Bereiche ein: ganze Bereiche werden ersetzt, Bereiche „je Eintrag“ ergänzt (gleiche
 * Formulare bzw. Projekte ersetzt). Liefert die Titel der übernommenen Bereiche.
 */
export function sicherungEinspielen(s: Sicherung, schluessel: Iterable<string>): string[] {
  const wahl = new Set(schluessel);
  const uebernommen: string[] = [];
  for (const b of bereicheIn(s)) {
    if (!wahl.has(b.schluessel)) continue;
    const neu = geprueft(b.schluessel, s.daten[b.schluessel]);
    if (neu === undefined) continue;
    const vorher = speicherLesen(b.schluessel);
    const wert = b.jeEintrag && istObjekt(vorher) && istObjekt(neu) ? { ...vorher, ...neu } : neu;
    try {
      localStorage.setItem(b.schluessel, JSON.stringify(wert));
      uebernommen.push(b.titel);
    } catch {
      // ohne Speicher nichts zu übernehmen
    }
  }
  return uebernommen;
}
