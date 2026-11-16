import { direktExportieren, type DirektExportAuftrag, type DirektExportUmgebung } from '../excel/direktExport';
import type { VorlagenHinweis } from '../excel/pruefung';
import { isTauri } from '../platform/files';
import { logger } from '../platform/log';
import { excelAlsPdf } from '../platform/pdf';
import { ordnerZeigen } from '../platform/projektordner';
import { fehlerText, fragen, meldung } from './Rueckfrage';

const log = logger('excel');

/** Umgebung der Desktop-App (Tauri-Befehle); im Browser nur `desktop: false` */
export function tauriUmgebung(): DirektExportUmgebung {
  const invoke = async <T>(befehl: string, args: Record<string, unknown>) => (await import('@tauri-apps/api/core')).invoke<T>(befehl, args);
  return {
    desktop: isTauri(),
    existiert: async (pfad) => (await invoke<unknown>('datei_stand', { path: pfad })) != null,
    ordnerAnlegen: async (pfad) => {
      // projekt_ordner_anlegen braucht eine vorhandene Wurzel: das Laufwerk bzw. „/“ (UNC: \\server\freigabe)
      const m = /^([a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+[\\/]?|\/)/i.exec(pfad);
      if (!m) throw new Error(`Kein vollständiger Pfad: ${pfad}`);
      const rel = pfad.slice(m[0].length).replace(/^[\\/]+|[\\/]+$/g, '');
      if (rel) await invoke<boolean>('projekt_ordner_anlegen', { root: m[0], pfad: rel.replace(/\\/g, '/') });
    },
    schreiben: async (pfad, daten) => {
      const { bytesToBase64 } = await import('../platform/files');
      await invoke<void>('write_binary_file', { path: pfad, contentsBase64: bytesToBase64(daten) });
    },
    pdf: excelAlsPdf,
    fragen,
  };
}

const name = (pfad: string) => pfad.split(/[\\/]/).pop() ?? pfad;

/**
 * Direktexport mit Rückmeldung: danach eine Meldung mit Ordner und Dateien, „Ordner öffnen“ und – wenn die
 * Vorlagenprüfung etwas gefunden hat – „Hinweise ansehen …“ (öffnet den Export-Dialog mit den Hinweisen). Geht es
 * nicht direkt, öffnet sich der Dialog mit dem Grund. Fehler erscheinen als Meldung; es wird nichts überschrieben.
 */
export async function direktExportMitMeldung(
  auftrag: DirektExportAuftrag,
  dialogOeffnen: (o: { grund?: string; hinweise?: VorlagenHinweis[] }) => void,
  umgebung: DirektExportUmgebung = tauriUmgebung(),
): Promise<void> {
  try {
    const r = await direktExportieren(auftrag, umgebung);
    if (r.art === 'abgebrochen') return;
    if (r.art === 'dialog') return dialogOeffnen({ grund: r.grund });
    log.info('Direktexport', { dateien: r.dateien, vorlage: r.vorlage, hinweise: r.hinweise.length });
    const dateien = r.dateien.map(name).join(' und ');
    const teile = [`Gespeichert im Berechnungsordner: ${dateien}${r.vorlage ? ` (Vorlage „${r.vorlage}“)` : ' (Standardlayout)'}.`];
    if (r.pdfFehler) teile.push(`Das PDF fehlt: ${r.pdfFehler}`);
    if (r.hinweise.length) teile.push(`Die Vorlagenprüfung meldet ${r.hinweise.length === 1 ? 'einen Hinweis' : `${r.hinweise.length} Hinweise`}.`);
    const wahl = await umgebung.fragen({
      titel: r.pdfFehler ? 'Exportiert – ohne PDF' : 'Exportiert',
      text: teile.join(' '),
      details: r.dateien.join('\n'),
      knoepfe: [
        ...(r.hinweise.length ? [{ id: 'hinweise' as const, label: 'Hinweise ansehen …' }] : []),
        { id: 'ordner' as const, label: 'Ordner öffnen' },
        { id: 'ok' as const, label: 'OK', art: 'primary' as const },
      ],
    });
    if (wahl === 'ordner') await ordnerZeigen(r.ordner).catch((e) => log.warn('Ordner ließ sich nicht öffnen', e));
    if (wahl === 'hinweise') dialogOeffnen({ hinweise: r.hinweise });
  } catch (e) {
    log.error('Direktexport fehlgeschlagen', e);
    await meldung('Export fehlgeschlagen', `Die Datei ließ sich nicht speichern: ${fehlerText(e)}`, e);
  }
}
