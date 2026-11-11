import { ProjectFormatError } from '../serialize';

/**
 * Eine gewählte Datei ließ sich nicht lesen. Trägt den Dateinamen zur Meldung (die Auswahl geschieht oft tiefer im
 * Code als die Anzeige) und den ursprünglichen Fehler für das Protokoll.
 */
export class DateiLesenFehler extends Error {
  constructor(
    readonly datei: string,
    readonly ursache: unknown,
  ) {
    super(`${datei}: ${grundText(ursache)}`);
  }
}

/** Grund in Klartext: bekannte Formatfehler mit ihrer Meldung, alles andere allgemein */
export function grundText(e: unknown): string {
  if (e instanceof DateiLesenFehler) return grundText(e.ursache);
  if (e instanceof ProjectFormatError) return e.message;
  return 'Der Inhalt ist unerwartet oder die Datei ist nicht zugänglich.';
}

/** Technische Einzelheiten (aufklappbar bzw. im Protokoll) */
export function technischText(e: unknown): string {
  if (e instanceof DateiLesenFehler) return technischText(e.ursache);
  if (e instanceof ProjectFormatError) return [e.message, e.technisch].filter(Boolean).join(' – ');
  if (e instanceof Error) return e.stack ?? e.message;
  return String(e);
}

/** Lesefehler mit Dateinamen versehen */
export function mitDatei<T>(datei: string, lesen: () => T): T {
  try {
    return lesen();
  } catch (e) {
    throw e instanceof DateiLesenFehler ? e : new DateiLesenFehler(datei, e);
  }
}

/** Text der gemeinsamen Meldung „Datei … ließ sich nicht lesen“ */
export function oeffnenFehlerText(e: unknown, datei?: string, bleibt = 'Das geöffnete Projekt bleibt unverändert.'): string {
  const name = e instanceof DateiLesenFehler ? e.datei : datei;
  const kurz = name ? name.split(/[\\/]/).pop() : undefined;
  return `${kurz ? `Die Datei „${kurz}“` : 'Die Datei'} ließ sich nicht lesen: ${grundText(e)}\n${bleibt}`;
}
