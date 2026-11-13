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

/** Darstellung eines Felds in der Ansicht */
export interface FeldOptionen {
  /** eigene Beschriftung (sonst der Titel aus dem Katalog) */
  label?: string;
  /** Breite in Spalten von 12 (sonst 4, breite Felder 12) */
  breite?: number;
  /** beginnt eine neue Zeile */
  neueZeile?: boolean;
}

export interface AnsichtAbschnitt {
  id: string;
  titel: string;
  /** Kennungen der Felder in der gewählten Reihenfolge */
  felder: string[];
  /** Beschriftung, Breite und Zeilenumbruch je Feld */
  optionen?: Record<string, FeldOptionen>;
}

export interface Ansicht {
  abschnitte: AnsichtAbschnitt[];
  /**
   * Verknüpfte Felder: je Gruppe Kennungen, die gemeinsam ausgefüllt werden (gleicher Inhalt). Was das heißt, entscheidet
   * die App (z. B. PERMIO: eine Eingabe trägt den Wert in alle Felder der Gruppe ein). Eine Gruppe darf Felder außerhalb
   * der Ansicht enthalten, mindestens eins muss in ihr stehen.
   */
  verknuepfungen?: string[][];
}

/** Breiten zur Auswahl (Spalten von 12) */
export const BREITEN: { wert: number; text: string }[] = [
  { wert: 3, text: '¼' },
  { wert: 4, text: '⅓' },
  { wert: 6, text: '½' },
  { wert: 8, text: '⅔' },
  { wert: 9, text: '¾' },
  { wert: 12, text: 'ganz' },
];

/** Eine gelesene Breite auf die nächste angebotene (BREITEN) bringen – nur diese kennen Editor und Raster */
export const breiteAus = (x: unknown): number | undefined =>
  typeof x === 'number' && Number.isFinite(x) ? BREITEN.reduce((best, b) => (Math.abs(b.wert - x) < Math.abs(best - x) ? b.wert : best), BREITEN[0].wert) : undefined;

/** Breite eines Felds in Spalten von 12 */
export const feldBreite = (o: FeldOptionen | undefined, f: Pick<FeldDef, 'breit'> | undefined) => o?.breite ?? (f?.breit ? 12 : 4);

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
      const optionen: Record<string, FeldOptionen> = {};
      if (a.optionen && typeof a.optionen === 'object')
        for (const [k, v] of Object.entries(a.optionen as Record<string, unknown>)) {
          if (!felder.includes(k) || !v || typeof v !== 'object') continue;
          const o = v as Record<string, unknown>;
          const fo: FeldOptionen = {
            ...(typeof o.label === 'string' && o.label.trim() ? { label: o.label.trim() } : {}),
            ...(breiteAus(o.breite) !== undefined ? { breite: breiteAus(o.breite) } : {}),
            ...(o.neueZeile === true ? { neueZeile: true } : {}),
          };
          if (Object.keys(fo).length) optionen[k] = fo;
        }
      return { id, titel: typeof a.titel === 'string' ? a.titel : '', felder, ...(Object.keys(optionen).length ? { optionen } : {}) };
    });
  if (!abschnitte.length) return null;
  const alle = new Set(abschnitte.flatMap((x) => x.felder));
  const verknuepft = new Set<string>();
  const verknuepfungen = (Array.isArray((roh as { verknuepfungen?: unknown }).verknuepfungen) ? ((roh as { verknuepfungen: unknown[] }).verknuepfungen as unknown[]) : [])
    .map((g) => (Array.isArray(g) ? [...new Set(g.filter((f): f is string => typeof f === 'string' && !!f && !verknuepft.has(f)))] : []))
    // auch Felder außerhalb der Ansicht – solange mindestens eins der Gruppe in ihr steht (sonst sähe man sie nirgends)
    .filter((g) => {
      if (g.length < 2 || !g.some((f) => alle.has(f))) return false;
      g.forEach((f) => verknuepft.add(f));
      return true;
    });
  return { abschnitte, ...(verknuepfungen.length ? { verknuepfungen } : {}) };
}

/** Alle Felder der Ansicht (jedes nur einmal) */
export const felderDerAnsicht = (a: Ansicht | null) => (a ? a.abschnitte.flatMap((x) => x.felder) : []);

/** Optionen eines Felds (in welchem Abschnitt es auch steht) */
export const feldOptionen = (a: Ansicht, feld: string): FeldOptionen | undefined => a.abschnitte.find((x) => x.felder.includes(feld))?.optionen?.[feld];

/** Abschnitt ohne ein Feld (samt seinen Optionen) */
const ohneFeld = (x: AnsichtAbschnitt, feld: string): AnsichtAbschnitt => {
  if (!x.felder.includes(feld)) return x;
  const { [feld]: _, ...optionen } = x.optionen ?? {};
  return { ...x, felder: x.felder.filter((f) => f !== feld), ...(Object.keys(optionen).length ? { optionen } : { optionen: undefined }) };
};

/** Feld hinzufügen (ans Ende eines Abschnitts); steht es schon in der Ansicht, wird es dorthin verschoben */
export function feldHinzufuegen(a: Ansicht, abschnitt: string, feld: string): Ansicht {
  return feldVerschieben(a, feld, abschnitt, Number.MAX_SAFE_INTEGER);
}

/** Feld aus der Ansicht nehmen – auch aus seinen Verknüpfungen */
export function feldEntfernen(a: Ansicht, feld: string): Ansicht {
  return mitVerknuepfungen(
    { ...a, abschnitte: a.abschnitte.map((x) => ohneFeld(x, feld)) },
    (a.verknuepfungen ?? []).map((g) => g.filter((f) => f !== feld)),
  );
}

/** Feld an eine Stelle verschieben – auch in einen anderen Abschnitt (`stelle` nach dem Herausnehmen gezählt); Optionen und Verknüpfungen bleiben */
export function feldVerschieben(a: Ansicht, feld: string, nach: string, stelle: number): Ansicht {
  const optionen = feldOptionen(a, feld);
  return {
    ...a,
    abschnitte: a.abschnitte
      .map((x) => ohneFeld(x, feld))
      .map((x) => {
        if (x.id !== nach) return x;
        const felder = [...x.felder];
        felder.splice(Math.max(0, Math.min(stelle, felder.length)), 0, feld);
        return { ...x, felder, ...(optionen ? { optionen: { ...x.optionen, [feld]: optionen } } : {}) };
      }),
  };
}

/** Beschriftung, Breite oder Zeilenumbruch eines Felds ändern (leere Werte entfallen) */
export function feldOptionenSetzen(a: Ansicht, feld: string, patch: Partial<FeldOptionen>): Ansicht {
  return {
    ...a,
    abschnitte: a.abschnitte.map((x) => {
      if (!x.felder.includes(feld)) return x;
      const neu: FeldOptionen = { ...x.optionen?.[feld], ...patch };
      if (!neu.label?.trim()) delete neu.label;
      if (!neu.breite) delete neu.breite;
      if (!neu.neueZeile) delete neu.neueZeile;
      const { [feld]: _, ...rest } = x.optionen ?? {};
      const optionen = Object.keys(neu).length ? { ...rest, [feld]: neu } : rest;
      return { ...x, optionen: Object.keys(optionen).length ? optionen : undefined };
    }),
  };
}

/** Abschnitt entfernen – seine Felder auch aus den Verknüpfungen */
export function abschnittEntfernen(a: Ansicht, id: string): Ansicht {
  const weg = new Set(a.abschnitte.find((x) => x.id === id)?.felder ?? []);
  return mitVerknuepfungen(
    { ...a, abschnitte: a.abschnitte.filter((x) => x.id !== id) },
    (a.verknuepfungen ?? []).map((g) => g.filter((f) => !weg.has(f))),
  );
}

/* ---------- Verknüpfungen ---------- */

/** Verknüpfungen setzen: nur Gruppen mit mindestens zwei Feldern, von denen eins in der Ansicht steht */
const mitVerknuepfungen = (a: Ansicht, gruppen: string[][]): Ansicht => {
  const drin = new Set(felderDerAnsicht(a));
  const sauber = gruppen.filter((g) => g.length > 1 && g.some((f) => drin.has(f)));
  const { verknuepfungen: _, ...rest } = a;
  return sauber.length ? { ...rest, verknuepfungen: sauber } : rest;
};

/** Die mit `feld` verknüpften Felder (ohne es selbst) */
export const verknuepfteFelder = (a: Ansicht | null, feld: string) => (a?.verknuepfungen?.find((g) => g.includes(feld)) ?? []).filter((f) => f !== feld);

/** Zwei Felder verknüpfen – ihre Gruppen werden zu einer */
export function verknuepfen(a: Ansicht, feld: string, mit: string): Ansicht {
  if (feld === mit) return a;
  const gruppen = a.verknuepfungen ?? [];
  const ga = gruppen.find((g) => g.includes(feld)) ?? [feld];
  const gb = gruppen.find((g) => g.includes(mit)) ?? [mit];
  return mitVerknuepfungen(a, [...gruppen.filter((g) => g !== ga && g !== gb), [...new Set([...ga, ...gb])]]);
}

/** Ein Feld aus seiner Verknüpfung lösen */
export const verknuepfungLoesen = (a: Ansicht, feld: string): Ansicht =>
  mitVerknuepfungen(
    a,
    (a.verknuepfungen ?? []).map((g) => g.filter((f) => f !== feld)),
  );

/** Abschnitt an eine Stelle verschieben (`stelle` nach dem Herausnehmen gezählt) */
export function abschnittVerschieben(a: Ansicht, id: string, stelle: number): Ansicht {
  const von = a.abschnitte.findIndex((x) => x.id === id);
  if (von < 0) return a;
  const abschnitte = [...a.abschnitte];
  const [x] = abschnitte.splice(von, 1);
  abschnitte.splice(Math.max(0, Math.min(stelle, abschnitte.length)), 0, x);
  return { ...a, abschnitte };
}

/* ---------- Merken ---------- */

const ANSICHT_EREIGNIS = 'arch-tools:ansicht';

/** Gemerkte Ansicht lesen (ohne Hook, z. B. für Verknüpfungen beim Eintragen) */
export function ansichtLesen(schluessel: string): Ansicht | null {
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
  const [ansicht, setAnsicht] = useState<Ansicht | null>(() => ansichtLesen(schluessel));
  useEffect(() => {
    setAnsicht(ansichtLesen(schluessel));
    const hier = (e: Event) => {
      const d = (e as CustomEvent<{ schluessel: string; ansicht: Ansicht | null }>).detail;
      if (d?.schluessel === schluessel) setAnsicht(d.ansicht);
    };
    const anderswo = (e: StorageEvent) => {
      if (e.key === schluessel) setAnsicht(ansichtLesen(schluessel));
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
