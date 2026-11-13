/**
 * Verzögertes Schreiben (Zwischenstand): `anstossen()` plant das Schreiben nach `ms` (jede weitere Änderung schiebt es
 * hinaus), `sichern()` führt ein ausstehendes Schreiben sofort aus und wartet, bis es fertig ist. Mehrfaches `sichern()`
 * schreibt nicht doppelt, sondern wartet auf das laufende Schreiben – so kann Arkly es vor dem Schließen aufrufen
 * (vorDemSchliessen), auch wiederholt. Schreibvorgänge laufen nacheinander, nie gleichzeitig.
 *
 * `sichern()` liefert, ob der Zwischenstand auf dem neuesten Stand ist: `false`, wenn das letzte Schreiben gescheitert
 * ist (Arkly fragt dann nach, statt still zu schließen). Ein Fehler geht an `beiFehler` und hält die Kette nicht an.
 */
export function verzoegertSchreiben(schreiben: () => Promise<void>, ms: number, beiFehler: (e: unknown) => void = () => undefined): { anstossen: () => void; sichern: () => Promise<boolean> } {
  let uhr: ReturnType<typeof setTimeout> | undefined;
  let ausstehend = false;
  let laufend: Promise<boolean> = Promise.resolve(true);

  const jetzt = (): Promise<boolean> => {
    clearTimeout(uhr);
    uhr = undefined;
    ausstehend = false;
    laufend = laufend.then(() =>
      schreiben().then(
        () => true,
        (e: unknown) => {
          beiFehler(e);
          return false;
        },
      ),
    );
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
