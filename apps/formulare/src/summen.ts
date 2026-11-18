/**
 * Summenfelder: Felder, die FORMA selbst ausrechnet (gesperrt, `Enabled = False`) – etwa die Stellplätze der
 * Baubeschreibung. FORMA rechnet sie erst beim Öffnen in FORMA; die App rechnet sie gleich beim Tippen, damit Formular,
 * PDF und Prüfliste stimmen.
 *
 * Regeln:
 * - Sind alle Teile leer, bleibt die Summe leer (nicht 0). Ist mindestens ein Teil gefüllt, zählen leere Teile als 0.
 * - Teile sind ganze Zahlen; Leerzeichen außen und Tausendertrennung („1.000“, „1 000“) sind erlaubt. Steht in einem
 *   Teil etwas anderes („ca. 3“, „2-3“, „2 3“), bleibt die Summe leer und ein Hinweis nennt das Feld – eine falsche
 *   Summe gibt es nie.
 * - Neu gerechnet wird eine Summe nur, wenn sich einer ihrer Teile ändert. Steht in einer Datei eine andere Summe (etwa
 *   von Hand in einer älteren Fassung), bleibt sie stehen, und ein Hinweis nennt beide Werte; „Neu berechnen“ am Feld
 *   übernimmt die Summe. Sind die Teile wieder wie in der Datei (z. B. nach Rückgängig), gilt wieder die Summe der
 *   Datei – außer, sie wurde ausdrücklich neu berechnet.
 * - Summen können auf Summen aufbauen („Summe“ aus „insgesamt auf dem Baugrundstück“); sie stehen in Rechenfolge.
 */

import type { Plausi } from './plausibel';

export interface Summe {
  /** Feldschlüssel der Summe (`<Seite>:<Name>`) */
  ziel: string;
  /** Feldschlüssel der Teile */
  teile: string[];
}

/**
 * Stellplätze (Kfz und Fahrrad, eine Regel für beide), im Wortlaut des Vordrucks: „insgesamt auf dem Baugrundstück“ =
 * in Garagen + im Freien; „Summe“ = insgesamt auf dem Baugrundstück + auf fremdem Grundstück mit Baulast + durch
 * Ablösung (§ 48 BauO NRW, Vordruck Anlage I/7 Nr. 5 und 7). „Davon für Menschen mit Behinderungen“ ist keine Summe.
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
  const t = s.trim();
  if (!t) return null;
  // nur Ziffern – oder Dreiergruppen mit einer Sorte Tausendertrennung (Punkt oder Leerzeichen, auch geschützt/schmal)
  const getrennt = /^\d{1,3}([.\s]\d{3})+$/.test(t) && new Set(t.replace(/\d/g, '')).size === 1;
  const n = /^\d+$/.test(t) || getrennt ? Number(t.replace(/\D/g, '')) : NaN;
  return Number.isSafeInteger(n) ? n : NaN;
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
 * hat. `vorher`/`nachher` liefern den Text eines Felds (undefined, wenn es das Feld nicht gibt). Mit `datei` (Werte in
 * der Datei): Stimmen alle Teile wieder mit der Datei überein, gilt die Summe der Datei – außer für Summen in
 * `gesetzt` (ausdrücklich neu berechnet).
 */
export function summenNachAenderung(
  summen: Summe[],
  vorher: (s: string) => string | undefined,
  nachher: (s: string) => string | undefined,
  datei?: (s: string) => string | undefined,
  gesetzt: ReadonlySet<string> = new Set(),
): Map<string, string> {
  const neu = new Map<string, string>();
  const jetzt = (s: string) => (neu.has(s) ? neu.get(s)! : (nachher(s) ?? ''));
  const geaendert = new Set<string>();
  for (const s of summen) for (const t of s.teile) if ((vorher(t) ?? '') !== (nachher(t) ?? '')) geaendert.add(t);
  for (const s of summen) {
    if (nachher(s.ziel) === undefined || !s.teile.some((t) => geaendert.has(t))) continue;
    const wieInDatei = datei && !gesetzt.has(s.ziel) && s.teile.every((t) => jetzt(t) === (datei(t) ?? ''));
    const wert = wieInDatei ? (datei(s.ziel) ?? '') : rechne(s.teile, jetzt).wert;
    if (wert !== (nachher(s.ziel) ?? '')) neu.set(s.ziel, wert);
    geaendert.add(s.ziel);
  }
  return neu;
}

/**
 * Herkunft eines Summenfelds: „Summe aus „in Garagen“ und „im Freien““. Mit `kurz` ohne den gemeinsamen Anfang der
 * Titel (bis zum letzten gemeinsamen Wortende), sonst mit den vollen Titeln.
 */
export function herkunft(s: Summe, titel: (schluessel: string) => string, kurz = false): string {
  const voll = s.teile.map(titel);
  let vorne = 0;
  if (kurz && voll.length > 1) {
    let i = 0;
    while (i < voll[0].length && voll.every((t) => t[i] === voll[0][i])) i++;
    // nur bis zu einem Wortende kürzen: hinter dem letzten gemeinsamen Leerzeichen
    vorne = voll[0].slice(0, i).lastIndexOf(' ') + 1;
  }
  const namen = voll.map((t) => `„${t.slice(vorne).trim() || t}“`);
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
      const soll = summe === '' ? 'keine Summe (alle leer)' : summe;
      out.push({
        art: 'hinweis',
        text: `„${titel(s.ziel)}“: ${eingetragen.trim() ? `eingetragen ist ${eingetragen.trim()}` : 'nichts eingetragen'}, die Angaben ergeben ${soll}. „Neu berechnen“ am Feld übernimmt die Summe.`,
        felder: [s.ziel],
      });
    }
  }
  return out;
}
