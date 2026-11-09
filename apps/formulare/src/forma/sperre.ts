/**
 * Sperrdateien von FORMA: Solange ein Formular geöffnet ist, liegt daneben eine INI-Datei mit gleichem Namen und
 * der Endung `.frmtmp` (Windows-1252, CRLF):
 *
 *   [Zugriff]
 *   User=t.mustermann
 *   Computer=CAD02
 *   Angemeldet=09.11.2026 10:17:12
 *   InGebrauch=67802
 *
 * Diese App liest sie (ist das Formular anderswo offen, wird nur angezeigt) und legt beim Bearbeiten selbst eine
 * im selben Format an. Was FORMA mit `InGebrauch` anfängt, ist nicht bekannt; hier steht die Prozessnummer.
 */

import { cp1252Lesen, cp1252Schreiben, iniLesen } from './cp1252';

export interface Sperre {
  benutzer: string;
  computer: string;
  /** wie in der Datei, z. B. „09.11.2026 10:17:12“ */
  angemeldet: string;
  inGebrauch: string;
}

export const sperrPfad = (formularPfad: string) => formularPfad.replace(/\.frmsjf$/i, '.frmtmp');

export function sperreLesen(bytes: Uint8Array): Sperre {
  const z = iniLesen(cp1252Lesen(bytes)).get('zugriff');
  return {
    benutzer: z?.get('user') ?? '',
    computer: z?.get('computer') ?? '',
    angemeldet: z?.get('angemeldet') ?? '',
    inGebrauch: z?.get('ingebrauch') ?? '',
  };
}

export function sperreSchreiben(s: Sperre): Uint8Array {
  return cp1252Schreiben(
    `[Zugriff]\r\nUser=${s.benutzer}\r\nComputer=${s.computer}\r\nAngemeldet=${s.angemeldet}\r\nInGebrauch=${s.inGebrauch}\r\n\r\n`,
  );
}

/** Zeitstempel wie FORMA: „09.11.2026 10:17:12“ */
export function zeitstempel(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

/** „09.11.2026 10:17:12“ → Datum; null bei anderem Aufbau */
export function zeitpunkt(s: string): Date | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ---------- Ist die Sperre noch in Gebrauch? ---------- */

/** Was sich über die Sperrdatei feststellen ließ (Tauri-Hülle) */
export interface SperrProbe {
  inhalt: Uint8Array;
  /** ein Programm hält die Datei offen – sicher in Gebrauch (diese App hält ihre Sperren offen) */
  offen: boolean;
  /** von dieser App in diesem Lauf angelegt */
  eigen: boolean;
  /** letzte Änderung der Datei (ms) */
  geaendert: number;
}

export type SperrZustandArt = 'benutzt' | 'verwaist' | 'unklar';

export interface SperrBewertung {
  art: SperrZustandArt;
  /** Begründung für die Anzeige */
  grund: string;
  /** darf von Hand aufgehoben werden (nicht, solange ein Programm die Datei offen hält) */
  aufhebbar: boolean;
  /** seit wann (ms seit 1970), wenn bekannt */
  seit: number | null;
}

/** Programme, die eine Sperre halten können: diese App und FORMA bzw. SJ OFFICE */
const SPERRENDE_PROGRAMME = /formulare|forma|sj/i;

/** Ab diesem Alter gilt eine Sperre von einem anderen Rechner als wahrscheinlich verwaist */
export const ALT_MS = 12 * 60 * 60 * 1000;

export function dauer(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'weniger als einer Minute';
  if (min < 60) return `${min} Minute${min === 1 ? '' : 'n'}`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} Stunde${h === 1 ? '' : 'n'}`;
  return `${Math.round(h / 24)} Tagen`;
}

/**
 * Bewertung einer fremden Sperre. Sicher in Gebrauch ist sie, wenn ein Programm die Datei offen hält. Liegt sie
 * auf diesem Rechner, zeigt die Prozessnummer (`InGebrauch`), ob das Programm noch läuft. Von einem anderen
 * Rechner lässt sich das nicht prüfen – dann zählen Alter und Entscheidung des Benutzers.
 */
export function bewerten(s: Sperre, probe: Pick<SperrProbe, 'offen' | 'geaendert'>, rechner: string, prozess: string | null | undefined, jetzt = Date.now()): SperrBewertung {
  const seit = zeitpunkt(s.angemeldet)?.getTime() ?? (probe.geaendert || null);
  const alter = seit ? ` (seit ${dauer(jetzt - seit)})` : '';
  if (probe.offen) return { art: 'benutzt', grund: `Die Sperrdatei ist gerade in Gebrauch – das Formular ist dort geöffnet${alter}.`, aufhebbar: false, seit };
  const pid = /^\d+$/.test(s.inGebrauch.trim()) ? Number(s.inGebrauch) : null;
  const hier = !!s.computer && s.computer.trim().toLowerCase() === rechner.trim().toLowerCase();
  if (hier && pid !== null && prozess !== undefined) {
    if (prozess === null) return { art: 'verwaist', grund: `Auf diesem Rechner läuft kein Programm mit der Nummer ${pid} mehr – die Sperre ist verwaist${alter}.`, aufhebbar: true, seit };
    if (!SPERRENDE_PROGRAMME.test(prozess))
      return { art: 'verwaist', grund: `Die Nummer ${pid} gehört inzwischen einem anderen Programm (${prozess}) – die Sperre ist verwaist${alter}.`, aufhebbar: true, seit };
    return { art: 'benutzt', grund: `Auf diesem Rechner läuft ${prozess} (Nummer ${pid}) – das Formular ist dort vermutlich geöffnet${alter}.`, aufhebbar: true, seit };
  }
  const wo = s.computer ? `auf ${s.computer}` : 'dort';
  if (seit && jetzt - seit > ALT_MS)
    return { art: 'verwaist', grund: `Die Sperre ist ${dauer(jetzt - seit)} alt und wird von keinem Programm offen gehalten – vermutlich verwaist. Ob das Formular ${wo} noch geöffnet ist, lässt sich von hier nicht prüfen.`, aufhebbar: true, seit };
  return { art: 'unklar', grund: `Ob das Formular ${wo} noch geöffnet ist, lässt sich von hier nicht prüfen${alter}.`, aufhebbar: true, seit };
}
