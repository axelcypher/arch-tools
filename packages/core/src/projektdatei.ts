import type { ZipOptions } from 'fflate';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { ARCHIV_ENDUNG, ARCHIV_FORMAT, isZip } from './archive';
import { gleich } from './zusammenfuehren';
import { datumNachFormat, ersetzen, globaleWerte, GLOBALE_VARIABLEN, unbekanntePlatzhalter as unbekannteIn, type Variable } from './platzhalter';

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
export const VORGABE_OAP_PFAD = '03 Berechnungen/Flächen/{PROJEKT_KUERZEL} {PROJEKT_KURZNAME}.oap';

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

/**
 * Variablen für den Pfad neuer Projektdateien: alle globalen (@core/platzhalter). Alte Namen ({nummer}, {Kürzel},
 * {projektcode}, {kurzname}, {datum} = JJMMTT, {jj} …) gelten weiter.
 */
export const OAP_VARIABLEN: Variable[] = GLOBALE_VARIABLEN;

export { datumNachFormat };

/** Platzhalter der Vorlage, die nicht aufgelöst werden (bleiben so im Pfad stehen) */
export const unbekanntePlatzhalter = (vorlage: string) => unbekannteIn(vorlage, OAP_VARIABLEN);

/**
 * Pfad einer neuen Projektdatei im Projektordner aus der Vorlage – Variablen siehe {@link OAP_VARIABLEN}. Fehlt die
 * Endung, wird sie ergänzt; leere Teile (z. B. ohne Kurzname) fallen weg. Unbekannte Platzhalter bleiben stehen.
 */
export function projektdateiPfad(vorlage: string, werte: { nummer: string; kurzname?: string; vorhaben?: string; bearbeiter?: string; jahr?: number | string; datum?: Date }): string {
  const tag = werte.datum ?? new Date();
  const w = globaleWerte({ projektcode: werte.nummer, kurzname: werte.kurzname, vorhaben: werte.vorhaben, bearbeiter: werte.bearbeiter, datum: tag });
  if (werte.jahr !== undefined) Object.assign(w, { JAHR: String(werte.jahr), JAHR_KURZ: String(Number(werte.jahr) % 100).padStart(2, '0') });
  // Werte ohne Trenner und unzulässige Zeichen – ein „/“ im Kurznamen darf keinen Unterordner ergeben
  const ersetzt = ersetzen(vorlage.trim() || VORGABE_OAP_PFAD, OAP_VARIABLEN, w, { saeubern: sichererDateiname });
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
