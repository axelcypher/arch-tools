/**
 * Summenfelder: Felder, die FORMA selbst ausrechnet (gesperrt, `Enabled = False`) – etwa die Stellplätze der
 * Baubeschreibung. FORMA rechnet sie erst beim Öffnen in FORMA; die App rechnet sie gleich beim Tippen, damit Formular,
 * PDF und Prüfliste stimmen.
 *
 * Regeln:
 * - Sind alle Teile leer, bleibt die Summe leer (nicht 0). Ist mindestens ein Teil gefüllt, zählen leere Teile als 0.
 * - Teile sind ganze Zahlen; Leerzeichen und Tausenderpunkte („1.000“) sind erlaubt. Steht in einem Teil etwas anderes
 *   („ca. 3“, „2-3“), bleibt die Summe leer und ein Hinweis nennt das Feld – eine falsche Summe gibt es nie.
 * - Neu gerechnet wird eine Summe nur, wenn sich einer ihrer Teile ändert. Steht in einer Datei eine andere Summe (etwa
 *   von Hand in einer älteren Fassung), bleibt sie stehen, und ein Hinweis nennt beide Werte.
 * - Summen können auf Summen aufbauen („insgesamt“ aus der Summe auf dem Baugrundstück); sie stehen in Rechenfolge.
 */

import type { Plausi } from './plausibel';

export interface Summe {
  /** Feldschlüssel der Summe (`<Seite>:<Name>`) */
  ziel: string;
  /** Feldschlüssel der Teile */
  teile: string[];
}

/**
 * Stellplätze (Kfz und Fahrrad, eine Regel für beide): auf dem Baugrundstück = in Garagen + im Freien; insgesamt = auf
 * dem Baugrundstück + auf fremdem Grundstück mit Baulast + durch Ablösung (§ 48 BauO NRW, Vordruck Anlage I/7 Nr. 5 und 7)
 */
export function stellplatzSummen(f: { garagen: string; freien: string; grundstueck: string; baulast: string; abloesung: string; insgesamt: string }): Summe[] {
  return [
    { ziel: f.grundstueck, teile: [f.garagen, f.freien] },
    { ziel: f.insgesamt, teile: [f.grundstueck, f.baulast, f.abloesung] },
  ];
}

/** je Formularkennung (alle Stände) */
export const SUMMEN: Record<string, Summe[]> = {
  // Baubeschreibung (Anlage I/7): Nr. 5 Stellplätze, Nr. 7 Fahrradstellplätze
  nw010010: [
    ...stellplatzSummen({ garagen: '0:Memo12', freien: '0:Memo13', grundstueck: '0:Memo14', baulast: '0:Memo15', abloesung: '0:Memo16', insgesamt: '0:Memo17' }),
    ...stellplatzSummen({ garagen: '1:Memo3', freien: '1:Memo4', grundstueck: '1:Memo5', baulast: '1:Memo6', abloesung: '1:Memo7', insgesamt: '1:Memo8' }),
  ],
};

export const summenVon = (kennung: string | undefined): Summe[] => (kennung ? (SUMMEN[kennung] ?? []) : []);

/** ganze Zahl aus einer Eingabe: null = leer, NaN = keine ganze Zahl */
export function ganzeZahl(s: string): number | null {
  const t = s.replace(/[\s  ]/g, '');
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  return NaN;
}

export interface Ergebnis {
  /** Summe als Text („“ = leer) */
  wert: string;
  /** Teile, die keine ganze Zahl sind (dann ist `wert` leer) */
  ungueltig: string[];
}

/** Summe aus den Werten der Teile */
export function rechne(teile: string[], wert: (schluessel: string) => string): Ergebnis {
  const zahlen = teile.map((t) => ganzeZahl(wert(t)));
  const ungueltig = teile.filter((_, i) => Number.isNaN(zahlen[i]));
  if (ungueltig.length) return { wert: '', ungueltig };
  if (zahlen.every((z) => z === null)) return { wert: '', ungueltig: [] };
  return { wert: String(zahlen.reduce<number>((a, z) => a + (z ?? 0), 0)), ungueltig: [] };
}

/**
 * Neue Werte der Summen nach einer Änderung: nur Summen, von deren Teilen (auch über andere Summen) sich einer geändert
 * hat. `vorher`/`nachher` liefern den Text eines Felds (undefined, wenn es das Feld nicht gibt).
 */
export function summenNachAenderung(summen: Summe[], vorher: (s: string) => string | undefined, nachher: (s: string) => string | undefined): Map<string, string> {
  const neu = new Map<string, string>();
  const jetzt = (s: string) => (neu.has(s) ? neu.get(s)! : (nachher(s) ?? ''));
  const geaendert = new Set<string>();
  for (const s of summen) for (const t of s.teile) if ((vorher(t) ?? '') !== (nachher(t) ?? '')) geaendert.add(t);
  for (const s of summen) {
    if (nachher(s.ziel) === undefined || !s.teile.some((t) => geaendert.has(t))) continue;
    const { wert } = rechne(s.teile, jetzt);
    if (wert !== (nachher(s.ziel) ?? '')) neu.set(s.ziel, wert);
    geaendert.add(s.ziel);
  }
  return neu;
}

/** „Summe aus „in Garagen“ und „im Freien““ – Herkunft eines Summenfelds */
export function herkunft(s: Summe, titel: (schluessel: string) => string): string {
  const namen = s.teile.map((t) => `„${titel(t)}“`);
  return `Summe aus ${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}`;
}

/**
 * Hinweise zu Summen: ein Teil ist keine ganze Zahl (die Summe bleibt leer), oder die eingetragene Summe weicht von der
 * Summe der Teile ab (aus einer älteren Fassung oder von Hand).
 */
export function summenHinweise(summen: Summe[], wert: (s: string) => string | undefined, titel: (schluessel: string) => string): Plausi[] {
  const out: Plausi[] = [];
  for (const s of summen) {
    const eingetragen = wert(s.ziel);
    if (eingetragen === undefined) continue;
    const { wert: summe, ungueltig } = rechne(s.teile, (t) => wert(t) ?? '');
    if (ungueltig.length) {
      const namen = ungueltig.map((t) => `„${titel(t)}“ („${(wert(t) ?? '').trim()}“)`).join(', ');
      out.push({ art: 'hinweis', text: `${namen}: bitte als ganze Zahl eintragen – „${titel(s.ziel)}“ wird erst dann berechnet.`, felder: [...ungueltig, s.ziel] });
    } else if (eingetragen.trim() !== summe && ganzeZahl(eingetragen) !== (summe === '' ? null : Number(summe))) {
      const soll = summe === '' ? 'leer (keine Angaben)' : summe;
      out.push({
        art: 'hinweis',
        text: `„${titel(s.ziel)}“: eingetragen ist ${eingetragen.trim()}, die Summe der Angaben ist ${soll}. Die Summe wird neu berechnet, sobald sich eine der Angaben ändert.`,
        felder: [s.ziel],
      });
    }
  }
  return out;
}
