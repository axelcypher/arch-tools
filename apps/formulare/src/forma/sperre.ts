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
