import { base64ToBytes, bytesToBase64, isTauri } from './files';

/**
 * PDF aus einer Excel-Datei (gefüllte Excel-Vorlage): in der Desktop-App über ein installiertes Microsoft Excel,
 * ersatzweise LibreOffice ohne Oberfläche (Tauri-Befehl `excel_als_pdf`, packages/core/tauri/pdf.rs). Druckbereich,
 * Kopf- und Fußzeile, Skalierung und Seitenformat der Vorlage bleiben erhalten. In der Web-Fassung gibt es das nicht.
 */

/** Grund, warum es in der Web-Fassung kein PDF gibt (für gesperrte Knöpfe und Schalter) */
export const PDF_NUR_DESKTOP = 'Das PDF entsteht über Microsoft Excel oder LibreOffice auf dem Rechner – das geht nur in der Desktop-App.';

/** Kann diese Umgebung PDF aus Excel erzeugen? (ob Excel oder LibreOffice installiert ist, zeigt erst der Versuch) */
export const pdfMoeglich = (): boolean => isTauri();

/** Wandelt eine .xlsx in ein PDF; wirft mit verständlicher Meldung (z. B. wenn weder Excel noch LibreOffice installiert ist) */
export async function excelAlsPdf(xlsx: Uint8Array): Promise<Uint8Array> {
  if (!pdfMoeglich()) throw new Error(PDF_NUR_DESKTOP);
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    const b64 = await invoke<string>('excel_als_pdf', { xlsxBase64: bytesToBase64(xlsx) });
    return base64ToBytes(b64);
  } catch (e) {
    throw new Error(typeof e === 'string' ? e : e instanceof Error ? e.message : String(e));
  }
}
