/**
 * Verlauf der Eingaben je Formular: Rückgängig, Wiederholen und Sprung zu einem früheren Stand. Ein Schritt
 * hält je Feld den alten und neuen Wert – meist ein Feld, beim Ausfüllen aus der Projektkarte viele. Wer in
 * einem Textfeld weitertippt, verlängert den letzten Schritt, statt für jeden Buchstaben einen neuen anzulegen.
 * Der Verlauf liegt im Speicher der App und übersteht Neustarts – auch über das Speichern hinaus (Rückgängig
 * nach dem Speichern ergibt wieder eine ungespeicherte Änderung).
 */

export type Wert = string | boolean;

export interface FeldAenderung {
  /** Feldschlüssel `<Seite>:<Name>` */
  feld: string;
  vorher: Wert;
  nachher: Wert;
}

export interface Schritt {
  /** Zeitpunkt (ms seit 1970) der letzten Eingabe in diesem Schritt */
  zeit: number;
  aenderungen: FeldAenderung[];
  /** Beschreibung bei Schritten über mehrere Felder (z. B. „Aus Projektkarte ausgefüllt“) */
  titel?: string;
}

export interface Verlauf {
  schritte: Schritt[];
  /** Anzahl der angewendeten Schritte; dahinter liegen die wiederherstellbaren */
  position: number;
}

/** Eingaben im selben Textfeld innerhalb dieser Zeit bilden einen Schritt */
export const ZUSAMMENFASSEN_MS = 1500;
/** so viele Schritte bleiben je Formular erhalten */
export const MAX_SCHRITTE = 500;

export const leererVerlauf = (): Verlauf => ({ schritte: [], position: 0 });

export const kannRueckgaengig = (v: Verlauf) => v.position > 0;
export const kannWiederholen = (v: Verlauf) => v.position < v.schritte.length;

function anhaengen(v: Verlauf, schritt: Schritt | null): Verlauf {
  const schritte = v.schritte.slice(0, v.position);
  if (schritt) schritte.push(schritt);
  const rest = schritte.slice(Math.max(0, schritte.length - MAX_SCHRITTE));
  return { schritte: rest, position: rest.length };
}

/** Neue Eingabe in einem Feld; verwirft die wiederherstellbaren Schritte */
export function eintragen(v: Verlauf, feld: string, vorher: Wert, nachher: Wert, zeit: number): Verlauf {
  if (vorher === nachher) return v;
  const letzter = v.position === v.schritte.length ? v.schritte[v.position - 1] : undefined;
  const a = letzter?.aenderungen.length === 1 && !letzter.titel ? letzter.aenderungen[0] : undefined;
  if (letzter && a && a.feld === feld && typeof nachher === 'string' && typeof a.nachher === 'string' && zeit - letzter.zeit < ZUSAMMENFASSEN_MS) {
    const ohne = { schritte: v.schritte.slice(0, -1), position: v.position - 1 };
    return anhaengen(ohne, a.vorher === nachher ? null : { zeit, aenderungen: [{ feld, vorher: a.vorher, nachher }] });
  }
  return anhaengen(v, { zeit, aenderungen: [{ feld, vorher, nachher }] });
}

/** Mehrere Felder in einem Schritt (z. B. Ausfüllen aus der Projektkarte) */
export function eintragenMehrere(v: Verlauf, aenderungen: FeldAenderung[], titel: string, zeit: number): Verlauf {
  const echte = aenderungen.filter((a) => a.vorher !== a.nachher);
  return echte.length ? anhaengen(v, { zeit, aenderungen: echte, titel }) : v;
}

/**
 * Sprung zu einem Stand im Verlauf (0 = vor dem ersten Schritt). Liefert die Werte, die dafür zu setzen sind:
 * rückwärts der alte Wert der frühesten übersprungenen Änderung je Feld, vorwärts der neue der spätesten.
 */
export function springe(v: Verlauf, ziel: number): { verlauf: Verlauf; werte: Map<string, Wert> } {
  const position = Math.max(0, Math.min(v.schritte.length, ziel));
  const werte = new Map<string, Wert>();
  if (position < v.position) {
    for (let i = v.position - 1; i >= position; i--) for (const a of [...v.schritte[i].aenderungen].reverse()) werte.set(a.feld, a.vorher);
  } else {
    for (let i = v.position; i < position; i++) for (const a of v.schritte[i].aenderungen) werte.set(a.feld, a.nachher);
  }
  return { verlauf: { schritte: v.schritte, position }, werte };
}

const istWert = (w: unknown): w is Wert => typeof w === 'string' || typeof w === 'boolean';
const istAenderung = (a: unknown): a is FeldAenderung =>
  !!a && typeof a === 'object' && typeof (a as FeldAenderung).feld === 'string' && istWert((a as FeldAenderung).vorher) && istWert((a as FeldAenderung).nachher);

/** Liest einen gespeicherten Verlauf; Unbrauchbares wird verworfen */
export function verlaufAus(x: unknown): Verlauf {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<Verlauf>;
  const schritte: Schritt[] = [];
  for (const s of Array.isArray(o.schritte) ? (o.schritte as unknown[]) : []) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Partial<Schritt>;
    const aenderungen = (Array.isArray(r.aenderungen) ? r.aenderungen : []).filter(istAenderung);
    if (typeof r.zeit !== 'number' || !aenderungen.length) continue;
    schritte.push({ zeit: r.zeit, aenderungen, ...(typeof r.titel === 'string' ? { titel: r.titel } : {}) });
  }
  const position = typeof o.position === 'number' && Number.isInteger(o.position) ? Math.max(0, Math.min(schritte.length, o.position)) : schritte.length;
  return { schritte, position };
}
