/**
 * Verzögertes Schreiben (Zwischenstand): `anstossen()` plant das Schreiben nach `ms` (jede weitere Änderung schiebt es
 * hinaus), `sichern()` führt ein ausstehendes Schreiben sofort aus und wartet, bis es fertig ist. Mehrfaches `sichern()`
 * schreibt nicht doppelt, sondern wartet auf das laufende Schreiben – so kann Arkly es vor dem Schließen aufrufen
 * (vorDemSchliessen), auch wiederholt. Schreibvorgänge laufen nacheinander, nie gleichzeitig.
 */
export function verzoegertSchreiben(schreiben: () => Promise<void>, ms: number): { anstossen: () => void; sichern: () => Promise<void> } {
  let uhr: ReturnType<typeof setTimeout> | undefined;
  let ausstehend = false;
  let laufend: Promise<void> = Promise.resolve();

  const jetzt = (): Promise<void> => {
    clearTimeout(uhr);
    uhr = undefined;
    ausstehend = false;
    // ein Fehler beim Schreiben hält die Kette nicht an (der Zwischenstand ist nur eine Absicherung)
    laufend = laufend.then(() => schreiben().catch(() => undefined));
    return laufend;
  };

  return {
    anstossen: () => {
      ausstehend = true;
      clearTimeout(uhr);
      uhr = setTimeout(() => void jetzt(), ms);
    },
    sichern: () => (ausstehend ? jetzt() : laufend),
  };
}
