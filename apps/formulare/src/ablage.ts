/**
 * Die echten Projektordner auf dem Server – getrennt von den FORMA-Projekten, nur als zweite Quelle zum
 * Nachsehen (welche Formulare schon als PDF vorliegen, welche Berechnungen es gibt). Hier wird nichts geschrieben.
 *
 * Zuordnung über das Kürzel: Der FORMA-Projektordner heißt wie das Kürzel („BS5“), der echte Ordner beginnt
 * damit („BS5 Birkenstraße 5“), manchmal mit einem Wort davor („JJ H24 …“). Gesucht wird zwei Ebenen tief,
 * damit auch Projekte in Unterordnern wie der Akquise gefunden werden.
 *
 * Welche Teile eines Projektordners links erscheinen, bestimmt eine Liste von Pfaden („Organisation“,
 * „03 Berechnungen/Flächen“, Platzhalter `*` und `?` je Ordnerebene) – mit Vorgabe, je Projekt änderbar.
 */

import type { Dateisystem } from './dateisystem';

export interface AblageOrdner {
  /** eingestellter Projektordner, in dem gesucht wurde */
  root: string;
  /** relativ dazu, mit „/“ getrennt (eine oder zwei Ebenen) */
  pfad: string;
  /** Ordnername */
  name: string;
}

/** Vorgabe der angezeigten Pfade: alle Ordner der obersten Ebene */
export const VORGABE_AUSWAHL = ['*'];

const woerter = (name: string) => name.split(/[^0-9A-Za-zÄÖÜäöüß]+/).filter(Boolean);

/** Gehört der Ordnername zum Kürzel? Das Kürzel ist das erste oder zweite Wort. */
export function kuerzelPasst(ordnername: string, kuerzel: string): boolean {
  const k = kuerzel.trim().toLowerCase();
  if (!k) return false;
  const w = woerter(ordnername).slice(0, 2).map((x) => x.toLowerCase());
  return w.includes(k);
}

/** Alle Ordner der ersten und zweiten Ebene unter den Projektordnern */
export async function ablageSuchen(ds: Dateisystem, roots: string[]): Promise<{ ordner: AblageOrdner[]; fehler: string[] }> {
  const ordner: AblageOrdner[] = [];
  const fehler: string[] = [];
  await Promise.all(
    roots.map(async (root) => {
      try {
        for (const e of await ds.liste(root, 2)) {
          if (e.ordner) ordner.push({ root, pfad: e.pfad, name: e.pfad.split('/').pop()! });
        }
      } catch (e) {
        fehler.push(`${root}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  );
  return { ordner, fehler };
}

/** Der echte Ordner zum Kürzel: zuerst auf der obersten Ebene, sonst eine Ebene tiefer */
export function zuordnen(kuerzel: string, ordner: AblageOrdner[]): AblageOrdner | null {
  const passend = ordner.filter((o) => kuerzelPasst(o.name, kuerzel));
  const tiefe = (o: AblageOrdner) => o.pfad.split('/').length;
  return passend.sort((a, b) => tiefe(a) - tiefe(b) || a.pfad.localeCompare(b.pfad, 'de'))[0] ?? null;
}

function globRegex(muster: string): RegExp {
  const re = muster.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${re}$`, 'i');
}

/** Pfadliste bereinigt: getrimmt, „\“ als „/“, ohne leere Einträge und doppelte Trenner */
export function auswahlBereinigt(liste: string[]): string[] {
  return [...new Set(liste.map((m) => m.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '')).filter(Boolean))];
}

/**
 * Sichtbarkeit eines Pfads im Projektordner: `ganz`, wenn er (oder ein Ordner darüber) ausgewählt ist – dann
 * auch alles darunter; `teil`, wenn eine Auswahl tiefer darin liegt – dann nur der Weg dorthin; sonst `weg`.
 */
export function sichtbarkeit(pfad: string, auswahl: string[]): 'ganz' | 'teil' | 'weg' {
  const teile = pfad.split('/');
  let ergebnis: 'teil' | 'weg' = 'weg';
  for (const m of auswahl) {
    const mt = m.split('/');
    const n = Math.min(mt.length, teile.length);
    let passt = true;
    for (let i = 0; i < n && passt; i++) passt = globRegex(mt[i]).test(teile[i]);
    if (!passt) continue;
    if (mt.length <= teile.length) return 'ganz';
    ergebnis = 'teil';
  }
  return ergebnis;
}

/** Art einer Datei für Symbol und Hinweis */
export function dateiArt(name: string): 'pdf' | 'berechnung' | 'tabelle' | 'text' | 'plan' | 'bild' | 'formular' | 'sonst' {
  const e = /\.([^.]+)$/.exec(name)?.[1].toLowerCase() ?? '';
  if (e === 'pdf') return 'pdf';
  if (['oap', 'grz', 'kosten'].includes(e)) return 'berechnung';
  if (['xlsx', 'xlsm', 'xls', 'csv', 'ods'].includes(e)) return 'tabelle';
  if (['docx', 'doc', 'odt', 'txt', 'rtf', 'msg', 'eml'].includes(e)) return 'text';
  if (['dwg', 'dxf', 'pln', 'pla', 'ifc', 'skp'].includes(e)) return 'plan';
  if (['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'gif', 'heic', 'webp'].includes(e)) return 'bild';
  if (e === 'frmsjf') return 'formular';
  return 'sonst';
}
