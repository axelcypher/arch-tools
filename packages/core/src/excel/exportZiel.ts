import { ordnerVon } from '../platform/files';
import { ersetzen, globaleWerte, GLOBALE_VARIABLEN, type GlobaleQuelle, type Variable } from '../platzhalter';
import { sichererDateiname, VORGABE_OAP_PFAD } from '../projektdatei';

/**
 * ÜBERGANG bis die zentralen Einstellungen („Pfade und Benennung“, @core/einstellungen/pfade) auf main sind: dieselbe
 * Schnittstelle, aber nur mit den Vorgaben (nichts wird gespeichert). Danach wird der Import umgestellt und diese
 * Datei gelöscht.
 */

export type ExportApp = 'flaechenrechner' | 'grz' | 'kosten';

export interface ExportPfade {
  /** Berechnungsordner, relativ zum Projektordner (oder vollständiger Pfad); Platzhalter: die globalen */
  berechnungsordner: string;
  /** Dateiname der Excel-Datei ohne Endung; Platzhalter: die globalen und {Inhalt} */
  dateinameExcel: string;
  /** Dateiname des PDF ohne Endung */
  dateinamePdf: string;
  /** beim Direktexport das PDF neben der Excel-Datei mitspeichern */
  pdfMitspeichern: boolean;
}

const VORGABE_ORDNER: Record<ExportApp, string> = { flaechenrechner: '03 Berechnungen/Flächen', grz: '03 Berechnungen/Nachweise', kosten: '03 Berechnungen/Kosten' };
const VORGABE_NAME = '{PROJEKT_KUERZEL} {DATUM} {Inhalt}';

export function exportPfade(app: ExportApp): ExportPfade {
  return { berechnungsordner: VORGABE_ORDNER[app], dateinameExcel: VORGABE_NAME, dateinamePdf: VORGABE_NAME, pdfMitspeichern: true };
}

export async function exportPfadeLaden(app: ExportApp): Promise<ExportPfade> {
  return exportPfade(app);
}

const EXPORT_VARIABLEN: Variable[] = [...GLOBALE_VARIABLEN, { name: 'Inhalt', text: 'was exportiert wird' }];

/** vollständiger Pfad? (Laufwerk, UNC oder „/“) */
export const istVollstaendig = (pfad: string) => /^([a-z]:[\\/]|[\\/]{2}|\/)/i.test(pfad);

/** Teile eines Pfadmusters ersetzen – jeder Teil als sicherer Name, leere Teile fallen weg */
function musterTeile(muster: string, variablen: Variable[], werte: Record<string, unknown>): string[] {
  return ersetzen(muster.trim(), variablen, werte as never, { saeubern: sichererDateiname })
    .split(/[\\/]+/)
    .map((t) => sichererDateiname(t))
    .filter(Boolean);
}

/** Berechnungsordner als vollständiger Pfad; `null`, wenn er relativ ist und der Projektordner fehlt */
export function berechnungsordnerPfad(muster: string, projektordner: string | null, werte: GlobaleQuelle): string | null {
  const w = globaleWerte(werte);
  if (istVollstaendig(muster.trim())) {
    const m = /^([a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+[\\/]?|\/)/i.exec(muster.trim())!;
    const sep = m[0].includes('\\') ? '\\' : '/';
    const wurzel = m[0].replace(/[\\/]+$/, '') + sep;
    return wurzel + musterTeile(muster.trim().slice(m[0].length), GLOBALE_VARIABLEN, w).join(sep);
  }
  if (!projektordner) return null;
  const sep = projektordner.includes('\\') ? '\\' : '/';
  return [projektordner.replace(/[\\/]+$/, ''), ...musterTeile(muster, GLOBALE_VARIABLEN, w)].join(sep);
}

/** Dateiname aus dem Muster, mit Endung; leer ergibt „<Inhalt>.<endung>“ */
export function exportDateinameAusMuster(muster: string, o: { werte: GlobaleQuelle; inhalt: string; endung: 'xlsx' | 'pdf' }): string {
  const name = sichererDateiname(ersetzen(muster.trim() || VORGABE_NAME, EXPORT_VARIABLEN, { ...globaleWerte(o.werte), Inhalt: o.inhalt }).replace(/[\\/]+/g, ' ')) || sichererDateiname(o.inhalt);
  return `${name}.${o.endung}`;
}

/**
 * Projektordner (die Wurzel, die ATLAS anlegt) aus dem Pfad der Projektdatei: Die Ordnerteile des Musters für neue
 * Projektdateien (Teile mit Platzhaltern gelten als beliebig) werden vom Ende des Ordners der .oap abgeschnitten,
 * wenn sie passen (ohne Groß-/Kleinschreibung). Passt das Muster nicht, ist der Projektordner unbekannt: `null`.
 */
export function projektordnerAusDatei(datei: string | null | undefined, oapMuster = VORGABE_OAP_PFAD): string | null {
  const ordner = ordnerVon(datei ?? null);
  if (!ordner || !istVollstaendig(ordner)) return null;
  const muster = oapMuster.split(/[\\/]+/).filter(Boolean).slice(0, -1);
  const sep = ordner.includes('\\') ? '\\' : '/';
  const teile = ordner.replace(/[\\/]+$/, '').split(/[\\/]/);
  if (teile.length - 1 < muster.length) return null;
  const ende = teile.slice(teile.length - muster.length);
  const passt = muster.every((m, i) => m.includes('{') || m.toLocaleLowerCase('de') === ende[i].toLocaleLowerCase('de'));
  if (!passt) return null;
  const wurzel = teile.slice(0, teile.length - muster.length).join(sep);
  return wurzel === '' ? sep : /^[a-z]:$/i.test(wurzel) ? wurzel + sep : wurzel;
}
