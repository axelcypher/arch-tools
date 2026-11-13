/**
 * Verlauf der Eingaben je Formular: Rückgängig, Wiederholen und Sprung zu einem früheren Stand. Ein Schritt
 * hält je Feld den alten und neuen Wert – meist ein Feld, beim Ausfüllen aus der Projektkarte viele. Wer in
 * einem Textfeld weitertippt, verlängert den letzten Schritt, statt für jeden Buchstaben einen neuen anzulegen.
 * Der Verlauf liegt im Speicher der App und übersteht Neustarts – auch über das Speichern hinaus (Rückgängig
 * nach dem Speichern ergibt wieder eine ungespeicherte Änderung).
 */

export type Wert = string | boolean | number | null;

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
  /**
   * Schritte einer früheren Sitzung, deren Werte nicht in der geöffneten Datei stehen (z. B. Web-Version: Eingaben
   * heruntergeladen, dann die Originaldatei wieder geöffnet) – nur zur Ansicht, nicht rückgängig zu machen
   */
  frueher?: Schritt[];
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
  return { schritte: rest, position: rest.length, ...(v.frueher ? { frueher: v.frueher } : {}) };
}

/** Neue Eingabe in einem Feld; verwirft die wiederherstellbaren Schritte */
export function eintragen(v: Verlauf, feld: string, vorher: Wert, nachher: Wert, zeit: number): Verlauf {
  if (vorher === nachher) return v;
  const letzter = v.position === v.schritte.length ? v.schritte[v.position - 1] : undefined;
  const a = letzter?.aenderungen.length === 1 && !letzter.titel ? letzter.aenderungen[0] : undefined;
  if (letzter && a && a.feld === feld && typeof nachher === 'string' && typeof a.nachher === 'string' && zeit - letzter.zeit < ZUSAMMENFASSEN_MS) {
    const ohne = { ...v, schritte: v.schritte.slice(0, -1), position: v.position - 1 };
    return anhaengen(ohne, a.vorher === nachher ? null : { zeit, aenderungen: [{ feld, vorher: a.vorher, nachher }] });
  }
  return anhaengen(v, { zeit, aenderungen: [{ feld, vorher, nachher }] });
}

/**
 * Mehrere Felder in einem Schritt (z. B. Ausfüllen aus der Projektkarte). Mit `zusammenfassen` (Tippen in verknüpften
 * Feldern) wird ein unmittelbar vorangehender Schritt mit demselben Titel und denselben Feldern fortgeführt, solange
 * die Eingaben schnell aufeinander folgen – wie beim Tippen in einem Feld.
 */
export function eintragenMehrere(v: Verlauf, aenderungen: FeldAenderung[], titel: string, zeit: number, zusammenfassen = false): Verlauf {
  const echte = aenderungen.filter((a) => a.vorher !== a.nachher);
  if (!echte.length) return v;
  const letzter = v.position === v.schritte.length ? v.schritte[v.position - 1] : undefined;
  const felder = (s: FeldAenderung[]) =>
    s
      .map((a) => a.feld)
      .sort()
      .join('\n');
  if (zusammenfassen && letzter && letzter.titel === titel && zeit - letzter.zeit < ZUSAMMENFASSEN_MS && felder(letzter.aenderungen) === felder(echte)) {
    const vorher = new Map(letzter.aenderungen.map((a) => [a.feld, a.vorher]));
    // „has“ statt „??“: null („keine Angabe“) ist ein gültiger alter Wert
    const zusammen = echte.map((a) => ({ feld: a.feld, vorher: vorher.has(a.feld) ? vorher.get(a.feld)! : a.vorher, nachher: a.nachher })).filter((a) => a.vorher !== a.nachher);
    const ohne = { ...v, schritte: v.schritte.slice(0, -1), position: v.position - 1 };
    return anhaengen(ohne, zusammen.length ? { zeit, aenderungen: zusammen, titel } : null);
  }
  return anhaengen(v, { zeit, aenderungen: echte, titel });
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
  return { verlauf: { ...v, position }, werte };
}

/** Werte zum Vergleich: Zeilenenden und Leerraum am Ende zählen nicht, leer ist leer */
const vergleichswert = (w: Wert | undefined) => (typeof w === 'string' ? w.replace(/\r\n?/g, '\n').replace(/\s+$/, '') : w === null ? '' : w);

/**
 * Passt der Verlauf zum Inhalt der geöffneten Datei? Nach den angewendeten Schritten muss jedes Feld den Wert seiner
 * letzten Änderung haben. Sonst stammen die Schritte aus einer anderen Fassung der Datei (Web-Version: Eingaben
 * heruntergeladen, dann die Originaldatei wieder geöffnet; Desktop: Datei außerhalb geändert): Sie kommen unter
 * „frühere Sitzung – nicht in dieser Datei“ (nur zur Ansicht), der Verlauf beginnt neu. `wert` liefert den
 * aktuellen Wert eines Felds (Datei samt wiederhergestellten Eingaben), unbekannte Felder `undefined`.
 */
export function abgleichen(v: Verlauf, wert: (feld: string) => Wert | undefined): Verlauf {
  const soll = new Map<string, Wert>();
  for (const s of v.schritte.slice(0, v.position)) for (const a of s.aenderungen) soll.set(a.feld, a.nachher);
  const passt = [...soll].every(([feld, w]) => {
    const ist = wert(feld);
    return ist === undefined || vergleichswert(ist) === vergleichswert(w);
  });
  if (passt) return v;
  const frueher = [...(v.frueher ?? []), ...v.schritte.slice(0, v.position)];
  return { schritte: [], position: 0, frueher: frueher.slice(Math.max(0, frueher.length - MAX_SCHRITTE)) };
}

const istWert = (w: unknown): w is Wert => w === null || ['string', 'boolean', 'number'].includes(typeof w);
const istAenderung = (a: unknown): a is FeldAenderung =>
  !!a && typeof a === 'object' && typeof (a as FeldAenderung).feld === 'string' && istWert((a as FeldAenderung).vorher) && istWert((a as FeldAenderung).nachher);

function schritteAus(roh: unknown): Schritt[] {
  const schritte: Schritt[] = [];
  for (const s of Array.isArray(roh) ? (roh as unknown[]) : []) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Partial<Schritt>;
    const aenderungen = (Array.isArray(r.aenderungen) ? r.aenderungen : []).filter(istAenderung);
    if (typeof r.zeit !== 'number' || !aenderungen.length) continue;
    schritte.push({ zeit: r.zeit, aenderungen, ...(typeof r.titel === 'string' ? { titel: r.titel } : {}) });
  }
  return schritte;
}

/** Liest einen gespeicherten Verlauf; Unbrauchbares wird verworfen */
export function verlaufAus(x: unknown): Verlauf {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<Verlauf>;
  const schritte = schritteAus(o.schritte);
  const frueher = schritteAus(o.frueher);
  const position = typeof o.position === 'number' && Number.isInteger(o.position) ? Math.max(0, Math.min(schritte.length, o.position)) : schritte.length;
  return { schritte, position, ...(frueher.length ? { frueher } : {}) };
}
