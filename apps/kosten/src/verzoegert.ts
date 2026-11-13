/**
 * Verzögertes Schreiben (Zwischenstand): `anstossen()` plant das Schreiben nach `ms` (jede weitere Änderung schiebt es
 * hinaus), `sichern()` führt ein ausstehendes Schreiben sofort aus und wartet, bis es fertig ist. Mehrfaches `sichern()`
 * schreibt nicht doppelt, sondern wartet auf das laufende Schreiben – so kann Arkly es vor dem Schließen aufrufen
 * (vorDemSchliessen), auch wiederholt. Schreibvorgänge laufen nacheinander, nie gleichzeitig.
 *
 * `sichern()` liefert, ob der Zwischenstand auf dem neuesten Stand ist: `false`, wenn das letzte Schreiben gescheitert
 * ist (Arkly fragt dann nach, statt still zu schließen); das nächste `sichern()` versucht es erneut. Ein Fehler geht an
 * `beiFehler` und hält die Kette nicht an.
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
          // der Zwischenstand bleibt veraltet: das nächste sichern() (z. B. „Erneut versuchen“ in Arkly) schreibt erneut
          ausstehend = true;
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

/**
 * Einen Wert in einen Object Store schreiben und auf das Ende der Transaktion warten. Scheitert sie (Fehler, Abbruch,
 * Ausnahme z. B. bei nicht klonbaren Daten), wird das Promise abgelehnt. Die Verbindung wird in jedem Fall geschlossen.
 */
export function inStoreSchreiben(d: IDBDatabase, store: string, key: IDBValidKey, wert: () => unknown): Promise<void> {
  return new Promise<void>((fertig, scheitern) => {
    let erledigt = false;
    const ende = (fehler?: unknown) => {
      // onerror und onabort feuern bei einem Fehler beide: nur der erste Aufruf zählt
      if (erledigt) return;
      erledigt = true;
      d.close();
      if (fehler === undefined) fertig();
      else scheitern(fehler);
    };
    try {
      const tx = d.transaction(store, 'readwrite');
      tx.objectStore(store).put(wert(), key);
      tx.oncomplete = () => ende();
      tx.onerror = tx.onabort = () => ende(tx.error ?? new Error('Transaktion abgebrochen'));
    } catch (e) {
      ende(e ?? new Error('Transaktion gescheitert'));
    }
  });
}
