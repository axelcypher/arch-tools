import { direktExportieren, type DirektExportAuftrag, type DirektExportUmgebung } from '../excel/direktExport';
import type { VorlagenHinweis } from '../excel/pruefung';
import { isTauri } from '../platform/files';
import { logger } from '../platform/log';
import { excelAlsPdf } from '../platform/pdf';
import { ordnerZeigen } from '../platform/projektordner';
import { zeigeHinweis, type HinweisDaten } from './Hinweis';
import { fehlerText, fragen } from './Rueckfrage';

const log = logger('excel');

/** Umgebung der Desktop-App (Tauri-Befehle); im Browser nur `desktop: false` */
export function tauriUmgebung(): DirektExportUmgebung {
  const invoke = async <T>(befehl: string, args: Record<string, unknown>) => (await import('@tauri-apps/api/core')).invoke<T>(befehl, args);
  return {
    desktop: isTauri(),
    existiert: async (pfad) => (await invoke<unknown>('datei_stand', { path: pfad })) != null,
    ordnerAnlegen: async (pfad) => {
      const { root, rel } = wurzelUndRest(pfad);
      if (rel) await invoke<boolean>('projekt_ordner_anlegen', { root, pfad: rel });
    },
    schreiben: async (pfad, daten) => {
      const { bytesToBase64 } = await import('../platform/files');
      await invoke<void>('write_binary_file', { path: pfad, contentsBase64: bytesToBase64(daten) });
    },
    pdf: excelAlsPdf,
    fragen,
  };
}

/**
 * Vollständigen Pfad in eine vorhandene Wurzel und den Rest zerlegen – `projekt_ordner_anlegen` legt nur unterhalb
 * einer Wurzel an: das Laufwerk („C:\\“), die Freigabe („\\\\server\\freigabe\\“) bzw. „/“. Rest mit „/“.
 */
export function wurzelUndRest(pfad: string): { root: string; rel: string } {
  const m = /^([a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+[\\/]?|\/)/i.exec(pfad);
  if (!m) throw new Error(`Kein vollständiger Pfad: ${pfad}`);
  return {
    root: m[0],
    rel: pfad
      .slice(m[0].length)
      .replace(/^[\\/]+|[\\/]+$/g, '')
      .replace(/\\/g, '/'),
  };
}

const name = (pfad: string) => pfad.split(/[\\/]/).pop() ?? pfad;

/**
 * Direktexport mit Rückmeldung als Hinweis nach einer Aktion (`zeigeHinweis`, id „export“, docs/design.md): Erfolg mit
 * Ordner und „Ordner öffnen“; hat die Vorlagenprüfung etwas gefunden oder fehlt das PDF, derselbe Hinweis als Warnung,
 * bei Prüfhinweisen mit „Prüfhinweise …“ (öffnet den Export-Dialog mit der Liste). Scheitert das Schreiben, meldet ihn
 * ein Fehler-Hinweis. Der Hinweis hält nichts auf; überschrieben wird nur nach „Ersetzen“.
 */
export async function direktExportMitMeldung(
  auftrag: DirektExportAuftrag,
  hinweiseZeigen: (hinweise: VorlagenHinweis[]) => void,
  umgebung: DirektExportUmgebung = tauriUmgebung(),
  hinweis: (d: HinweisDaten) => unknown = zeigeHinweis,
): Promise<void> {
  try {
    const r = await direktExportieren(auftrag, umgebung);
    if (r.art === 'abgebrochen') return;
    if (r.art === 'gesperrt') return void hinweis({ id: 'export', art: 'fehler', text: `Nicht exportiert – ${r.grund}` });
    log.info('Direktexport', { dateien: r.dateien, vorlage: r.vorlage, hinweise: r.hinweise.length });
    const teile = [`Gespeichert: ${r.dateien.map(name).join(' und ')}${r.vorlage ? ` (Vorlage „${r.vorlage}“)` : ' (Standardlayout)'}.`];
    if (r.pdfFehler) teile.push(r.pdfAlt ? `Das PDF daneben hat noch den alten Stand – das neue ließ sich nicht erzeugen: ${r.pdfFehler}` : `Das PDF fehlt: ${r.pdfFehler}`);
    if (r.hinweise.length) teile.push(`Die Vorlagenprüfung meldet ${r.hinweise.length === 1 ? 'einen Hinweis' : `${r.hinweise.length} Hinweise`}.`);
    hinweis({
      id: 'export',
      art: r.pdfFehler || r.hinweise.length ? 'warnung' : 'ok',
      text: teile.join(' '),
      pfad: r.ordner,
      aktionen: [
        { text: 'Ordner öffnen', aktion: () => ordnerZeigen(r.ordner), schliesst: true },
        ...(r.hinweise.length ? [{ text: 'Prüfhinweise …', aktion: () => hinweiseZeigen(r.hinweise) }] : []),
      ],
    });
  } catch (e) {
    log.error('Direktexport fehlgeschlagen', e);
    hinweis({ id: 'export', art: 'fehler', text: `Export fehlgeschlagen – die Datei ließ sich nicht speichern: ${fehlerText(e)}` });
  }
}
