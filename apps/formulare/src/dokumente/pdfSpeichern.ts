/**
 * Bearbeitete PDF speichern: `erzeugen` (pdf.js `saveDocument`) setzt den Änderungsstand von pdf.js immer zurück – auch
 * wenn das Schreiben danach scheitert (Konflikt, Datei gesperrt). Die Eingaben stehen dann weiter in der Ansicht; damit
 * sie nicht still verloren gehen, gilt die PDF in diesem Fall wieder als geändert (● und Rückfrage beim Verlassen bleiben).
 * Liefert, ob gespeichert wurde.
 */
export async function pdfSpeichern(
  erzeugen: () => Promise<Uint8Array>,
  schreiben: (bytes: Uint8Array) => Promise<boolean>,
  geaendert: (g: boolean) => void,
  fehler: (text: string) => void,
): Promise<boolean> {
  let ok = false;
  try {
    ok = await schreiben(await erzeugen());
    return ok;
  } catch (e) {
    fehler(e instanceof Error ? e.message : String(e));
    return false;
  } finally {
    if (!ok) geaendert(true);
  }
}
