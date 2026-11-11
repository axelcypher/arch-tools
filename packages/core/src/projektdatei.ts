import type { ZipOptions } from 'fflate';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { ARCHIV_ENDUNG, ARCHIV_FORMAT, isZip } from './archive';
import { gleich } from './zusammenfuehren';

/**
 * Die Projektdatei (.oap) im Projektordner – gemeinsam für alle Apps. Jedes Projekt hat eine; sie gehört keinem
 * einzelnen Werkzeug. Hier stehen die reinen Regeln (ohne Dateizugriff):
 *
 *  - welche .oap im Projektordner gilt, wenn es mehrere gibt,
 *  - wo eine neue angelegt wird (Pfadvorlage aus den gemeinsamen Einstellungen),
 *  - wie eine vorhandene gezielt geändert wird: nur die betroffenen Abschnitte von `projekt.json`, alle übrigen
 *    Einträge des Archivs (Pläne, Modelle, Quelldateien) bleiben Byte für Byte, wie sie sind.
 *
 * Gelöscht wird nie etwas.
 */

/** Eintrag eines eingelesenen Projektordners (relativ zum Projektordner, mit „/“ getrennt) */
export interface OrdnerEintrag {
  pfad: string;
  ordner: boolean;
  groesse: number;
  /** letzte Änderung (ms seit 1970); 0 oder fehlend, wenn unbekannt */
  geaendert?: number;
}

/** so tief wird im Projektordner nach der Projektdatei gesucht */
export const OAP_SUCHTIEFE = 4;

/** Vorgabe für den Ort einer neuen Projektdatei im Projektordner */
export const VORGABE_OAP_PFAD = '03 Berechnungen/Flächen/{nummer} {kurzname}.oap';

const istOap = (e: OrdnerEintrag) => !e.ordner && new RegExp(`\\.${ARCHIV_ENDUNG}$`, 'i').test(e.pfad) && !/(^|\/)(~\$|\.)[^/]*$/.test(e.pfad);

/** alle Projektdateien im Projektordner (bis zur Suchtiefe) */
export const projektdateien = (eintraege: OrdnerEintrag[]) => eintraege.filter((e) => istOap(e) && e.pfad.split('/').length <= OAP_SUCHTIEFE);

/**
 * Welche Projektdatei gilt: die gewählte, sonst eine im Ordner der Berechnungen (Pfad enthält „Berechnung“),
 * sonst die mit dem kürzesten Pfad, dann die zuletzt geänderte. `null`, wenn es keine gibt.
 */
export function projektdateiWaehlen(eintraege: OrdnerEintrag[], gewaehlt?: string | null): OrdnerEintrag | null {
  const oap = projektdateien(eintraege);
  const g = gewaehlt && oap.find((e) => e.pfad.toLowerCase() === gewaehlt.toLowerCase());
  if (g) return g;
  const rang = (e: OrdnerEintrag) => [/berechnung/i.test(e.pfad) ? 0 : 1, e.pfad.split('/').length, -(e.geaendert ?? 0)];
  return (
    [...oap].sort((a, b) => {
      const [x, y] = [rang(a), rang(b)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.pfad.localeCompare(b.pfad, 'de');
    })[0] ?? null
  );
}

/** in Datei- und Ordnernamen unzulässige Zeichen (Windows) entfernen; keine Punkte/Leerzeichen am Ende */
export function sichererDateiname(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
}

/** Platzhalter für den Pfad neuer Projektdateien (Groß-/Kleinschreibung egal) – für die Einstellungen */
export const OAP_PLATZHALTER: { name: string; text: string }[] = [
  { name: '{Kürzel}', text: 'Projektkürzel bzw. -nummer (gleich: {nummer}, {projektcode})' },
  { name: '{Kurzname}', text: 'Kurzname des Projekts' },
  { name: '{Vorhaben}', text: 'Bezeichnung des Vorhabens' },
  { name: '{Datum}', text: 'Tag des Anlegens – hier ohne Angabe als JJMMTT (wie bisher); mit Format z. B. {datum:JJJJ-MM-TT}' },
  { name: '{datum:JJMMTT}', text: 'Tag des Anlegens im angegebenen Format (JJJJ, JJ, MM, TT)' },
  { name: '{Jahr}', text: 'Jahr des Anlegens (vierstellig)' },
  { name: '{jj}', text: 'Jahr des Anlegens (zweistellig)' },
];

const PLATZHALTER_MUSTER = /\{\s*([^{}]*?)\s*\}/g;
const BEKANNT = /^(nummer|k(?:ü|ue)rzel|projektcode|kurzname|vorhaben|datum(?::\s*[JMT.\-_ ]+)?|jahr|jj)$/i;

/**
 * Datum nach Format: JJJJ (Jahr), JJ (zweistellig), MM, TT, dazwischen Trenner – „JJJJ-MM-TT“ → 2026-11-11, „JJMMTT“ →
 * 261111. Gemeinsam für Dateinamen und den Pfad der Projektdatei.
 */
export function datumNachFormat(d: Date, format: string): string {
  const zwei = (n: number) => String(n).padStart(2, '0');
  return format.replace(/JJJJ|JJ|MM|TT/g, (t) => (t === 'JJJJ' ? String(d.getFullYear()) : t === 'JJ' ? zwei(d.getFullYear() % 100) : t === 'MM' ? zwei(d.getMonth() + 1) : zwei(d.getDate())));
}

/** Platzhalter der Vorlage, die nicht aufgelöst werden (bleiben so im Pfad stehen) */
export const unbekanntePlatzhalter = (vorlage: string) => [...new Set([...vorlage.matchAll(PLATZHALTER_MUSTER)].filter((m) => !BEKANNT.test(m[1])).map((m) => m[0]))];

const zweistellig = (n: number) => String(n).padStart(2, '0');

/**
 * Pfad einer neuen Projektdatei im Projektordner aus der Vorlage. Platzhalter: {nummer} bzw. {kürzel} (Projektcode),
 * {kurzname}, {vorhaben}, {datum} (JJMMTT) und {jahr} – siehe {@link OAP_PLATZHALTER}. Fehlt die Endung, wird sie
 * ergänzt; leere Teile (z. B. ohne Kurzname) fallen weg. Unbekannte Platzhalter bleiben stehen.
 */
export function projektdateiPfad(vorlage: string, werte: { nummer: string; kurzname?: string; vorhaben?: string; jahr?: number | string; datum?: Date }): string {
  const tag = werte.datum ?? new Date();
  const ersetzt = (vorlage.trim() || VORGABE_OAP_PFAD).replace(PLATZHALTER_MUSTER, (m, k: string) => {
    if (!BEKANNT.test(k)) return m;
    const n = k.toLowerCase();
    // Werte ohne Trenner und unzulässige Zeichen – ein „/“ im Kurznamen darf keinen Unterordner ergeben
    if (n === 'kurzname') return sichererDateiname(werte.kurzname ?? '');
    if (n === 'vorhaben') return sichererDateiname(werte.vorhaben ?? '');
    if (n === 'jahr') return String(werte.jahr ?? tag.getFullYear());
    if (n === 'jj') return zweistellig(Number(werte.jahr ?? tag.getFullYear()) % 100);
    // {datum} ohne Format bleibt hier JJMMTT, damit vorhandene Einstellungen dieselben Namen ergeben
    if (n.startsWith('datum:'))
      return datumNachFormat(
        tag,
        k
          .slice(k.indexOf(':') + 1)
          .trim()
          .toUpperCase(),
      );
    if (n === 'datum') return `${zweistellig(tag.getFullYear() % 100)}${zweistellig(tag.getMonth() + 1)}${zweistellig(tag.getDate())}`;
    return sichererDateiname(werte.nummer);
  });
  const teile = ersetzt
    .split(/[\\/]+/)
    // „BS5 .oap“ (ohne Kurzname) → „BS5.oap“
    .map((t) => sichererDateiname(t.replace(/\s+(\.[^.\s]+)$/, '$1')))
    .filter(Boolean);
  if (!teile.length) return '';
  const name = teile[teile.length - 1];
  if (!new RegExp(`\\.${ARCHIV_ENDUNG}$`, 'i').test(name)) teile[teile.length - 1] = `${name}.${ARCHIV_ENDUNG}`;
  return teile.join('/');
}

/**
 * Projektdatei gezielt ändern: `aendern` bekommt `projekt.json` als Rohdaten (alle Abschnitte, auch die anderer
 * Apps) und liefert die neue Fassung. Alle übrigen Einträge des Archivs werden unverändert übernommen (Pläne, PDF
 * und Excel unkomprimiert wie im Original). Liefert `null`, wenn sich nichts ändert – dann muss nichts geschrieben
 * werden.
 */
export function projektdateiAendern(bytes: Uint8Array, aendern: (roh: Record<string, unknown>) => Record<string, unknown>): Uint8Array | null {
  if (!isZip(bytes)) throw new Error('Die Projektdatei ist kein Archiv (ältere JSON-Fassung) – bitte einmal im Flächenrechner öffnen und speichern.');
  let zip: ReturnType<typeof unzipSync>;
  try {
    zip = unzipSync(bytes);
  } catch {
    throw new Error('Die Projektdatei ist beschädigt und kann nicht gelesen werden.');
  }
  const manifest = JSON.parse(strFromU8(zip['manifest.json'] ?? strToU8('{}'))) as { format?: string; inhalt?: { pfad: string; art: string }[] };
  if (manifest.format !== ARCHIV_FORMAT) throw new Error('Die Datei ist keine Projektdatei (.oap).');
  if (!zip['projekt.json']) throw new Error('Im Archiv fehlt das Projekt (projekt.json).');
  const vorher = JSON.parse(strFromU8(zip['projekt.json'])) as Record<string, unknown>;
  const nachher = aendern(structuredClone(vorher));
  if (gleich(vorher, nachher)) return null;
  const unkomprimiert = new Set((manifest.inhalt ?? []).filter((e) => e.art === 'plan' || e.art === 'pdf' || e.art.startsWith('vorlage')).map((e) => e.pfad));
  const dateien: Record<string, [Uint8Array, ZipOptions]> = {};
  for (const [pfad, daten] of Object.entries(zip)) {
    dateien[pfad] = pfad === 'projekt.json' ? [strToU8(JSON.stringify(nachher)), { level: 6 }] : [daten, { level: unkomprimiert.has(pfad) ? 0 : 6 }];
  }
  return zipSync(dateien);
}

/** `projekt.json` einer Projektdatei als Rohdaten (alle Abschnitte) – zum Vergleichen und Anzeigen */
export function projektdateiRoh(bytes: Uint8Array): Record<string, unknown> {
  if (!isZip(bytes)) return JSON.parse(strFromU8(bytes)) as Record<string, unknown>;
  const zip = unzipSync(bytes, { filter: (f) => f.name === 'projekt.json' });
  if (!zip['projekt.json']) throw new Error('Im Archiv fehlt das Projekt (projekt.json).');
  return JSON.parse(strFromU8(zip['projekt.json'])) as Record<string, unknown>;
}
