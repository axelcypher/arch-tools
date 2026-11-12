/**
 * Eigene Ansichten: Aus einem Katalog verfügbarer Felder (z. B. allen Einträgen einer Projektkarte, den Merkmalen eines
 * Antrags, den Angaben einer Projektkarte auf der Startseite oder den Platzhaltern einer Vorlage) stellt man sich
 * Abschnitte mit genau den Feldern zusammen, die man braucht – auf einer Seite. Die App liefert den Katalog und zeigt
 * die Felder selbst an (siehe AnsichtEditor.tsx); hier stehen das Format, das Prüfen gelesener Daten und das Merken.
 *
 * Gemerkt wird je Benutzer im lokalen Speicher (Schlüssel der App), abgeglichen zwischen Fenstern und Tabs.
 */

import { useEffect, useState } from 'react';

/** Ein verfügbares Feld im Katalog */
export interface FeldDef {
  /** Kennung, stabil über Projekte hinweg (z. B. „201:40“ für Bauherr › Name) */
  id: string;
  titel: string;
  /** Gruppe im Katalog, z. B. „Bauherr“ */
  gruppe?: string;
  /** kurzer Hinweis im Editor */
  hinweis?: string;
  /** breites Feld (mehrzeiliger Text): nimmt in der Anzeige zwei Spalten ein */
  breit?: boolean;
}

export interface AnsichtAbschnitt {
  id: string;
  titel: string;
  /** Kennungen der Felder in der gewählten Reihenfolge */
  felder: string[];
}

export interface Ansicht {
  abschnitte: AnsichtAbschnitt[];
}

export const leereAnsicht = (titel = 'Meine Felder'): Ansicht => ({ abschnitte: [{ id: neueId(), titel, felder: [] }] });

let zaehler = 0;
/** Kennung für einen neuen Abschnitt */
export const neueId = () => `a${Date.now().toString(36)}${(zaehler++).toString(36)}`;

/** Gelesene Ansicht prüfen; null, wenn keine (gültige) da ist */
export function ansichtAus(roh: unknown): Ansicht | null {
  if (!roh || typeof roh !== 'object' || !Array.isArray((roh as { abschnitte?: unknown }).abschnitte)) return null;
  const gesehen = new Set<string>();
  const abschnitte = ((roh as { abschnitte: unknown[] }).abschnitte as unknown[])
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map((a, i) => {
      let id = typeof a.id === 'string' && a.id ? a.id : `a${i + 1}`;
      while (gesehen.has(id)) id = `${id}_`;
      gesehen.add(id);
      const felder = Array.isArray(a.felder) ? [...new Set(a.felder.filter((f): f is string => typeof f === 'string' && !!f))] : [];
      return { id, titel: typeof a.titel === 'string' ? a.titel : '', felder };
    });
  return abschnitte.length ? { abschnitte } : null;
}

/** Alle Felder der Ansicht (jedes nur einmal) */
export const felderDerAnsicht = (a: Ansicht | null) => (a ? a.abschnitte.flatMap((x) => x.felder) : []);

/** Feld hinzufügen (ans Ende eines Abschnitts); steht es schon in der Ansicht, wird es dorthin verschoben */
export function feldHinzufuegen(a: Ansicht, abschnitt: string, feld: string): Ansicht {
  const ohne = feldEntfernen(a, feld);
  return { abschnitte: ohne.abschnitte.map((x) => (x.id === abschnitt ? { ...x, felder: [...x.felder, feld] } : x)) };
}

export function feldEntfernen(a: Ansicht, feld: string): Ansicht {
  return { abschnitte: a.abschnitte.map((x) => (x.felder.includes(feld) ? { ...x, felder: x.felder.filter((f) => f !== feld) } : x)) };
}

/** Feld an eine Stelle verschieben – auch in einen anderen Abschnitt (`stelle` nach dem Herausnehmen gezählt) */
export function feldVerschieben(a: Ansicht, feld: string, nach: string, stelle: number): Ansicht {
  const ohne = feldEntfernen(a, feld);
  return {
    abschnitte: ohne.abschnitte.map((x) => {
      if (x.id !== nach) return x;
      const felder = [...x.felder];
      felder.splice(Math.max(0, Math.min(stelle, felder.length)), 0, feld);
      return { ...x, felder };
    }),
  };
}

/** Abschnitt an eine Stelle verschieben (`stelle` nach dem Herausnehmen gezählt) */
export function abschnittVerschieben(a: Ansicht, id: string, stelle: number): Ansicht {
  const von = a.abschnitte.findIndex((x) => x.id === id);
  if (von < 0) return a;
  const abschnitte = [...a.abschnitte];
  const [x] = abschnitte.splice(von, 1);
  abschnitte.splice(Math.max(0, Math.min(stelle, abschnitte.length)), 0, x);
  return { abschnitte };
}

/* ---------- Merken ---------- */

const ANSICHT_EREIGNIS = 'arch-tools:ansicht';

function lesen(schluessel: string): Ansicht | null {
  try {
    const roh = localStorage.getItem(schluessel);
    return roh ? ansichtAus(JSON.parse(roh)) : null;
  } catch {
    return null;
  }
}

/** Ansicht merken; null entfernt sie (dann gilt die Vorgabe der App) */
export function ansichtSpeichern(schluessel: string, a: Ansicht | null) {
  try {
    if (a) localStorage.setItem(schluessel, JSON.stringify(a));
    else localStorage.removeItem(schluessel);
  } catch {
    // nur für diese Sitzung
  }
  window.dispatchEvent(new CustomEvent(ANSICHT_EREIGNIS, { detail: { schluessel, ansicht: a } }));
}

/**
 * Gemerkte Ansicht unter `schluessel` (z. B. „formulare:ansicht:projektkarte“) mit Setzer; folgt Änderungen in anderen
 * Komponenten, Fenstern und Tabs.
 */
export function useAnsicht(schluessel: string): [Ansicht | null, (a: Ansicht | null) => void] {
  const [ansicht, setAnsicht] = useState<Ansicht | null>(() => lesen(schluessel));
  useEffect(() => {
    setAnsicht(lesen(schluessel));
    const hier = (e: Event) => {
      const d = (e as CustomEvent<{ schluessel: string; ansicht: Ansicht | null }>).detail;
      if (d?.schluessel === schluessel) setAnsicht(d.ansicht);
    };
    const anderswo = (e: StorageEvent) => {
      if (e.key === schluessel) setAnsicht(lesen(schluessel));
    };
    window.addEventListener(ANSICHT_EREIGNIS, hier);
    window.addEventListener('storage', anderswo);
    return () => {
      window.removeEventListener(ANSICHT_EREIGNIS, hier);
      window.removeEventListener('storage', anderswo);
    };
  }, [schluessel]);
  return [ansicht, (a) => ansichtSpeichern(schluessel, a)];
}
