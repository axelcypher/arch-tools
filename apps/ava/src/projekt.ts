/**
 * Ein Projekt aus Sicht der App: der Projektordner mit seinen Gewerkeordnern. Je Gewerk die LV-Dateien (direkt
 * im Gewerkeordner bzw. im eingestellten Unterordner), der Auftragsordner (Auftrag, Nachträge, Rechnungen),
 * die Korrespondenz und die Archive. Dazu die Kostenkontrolle (Excel) und eine .asproj des Originalprogramms,
 * falls vorhanden. Gelesen wird nur die Ordnerliste – die Dateien selbst erst, wenn sie gebraucht werden.
 */

import type { OrdnerEintrag } from '@core/projektdatei';
import type { RechnungsName } from './abrechnung/benennung';
import { datumAusJJMMTT, nameErkennen } from './abrechnung/benennung';
import { gewerkKennung, gewerkNummer } from './abrechnung/gewerk';
import type { AvaDateien } from './dateien';
import type { AvaEinstellungen } from './einstellungen';
import { imArchiv } from './einstellungen';

export type LvFormat = 'aslv' | 'oalv';

export interface Datei {
  /** relativ zum Projektordner */
  pfad: string;
  name: string;
  groesse: number;
  geaendert: number;
  /** liegt in einem Archivordner */
  archiv: boolean;
}

export interface LvDatei extends Datei {
  format: LvFormat;
}

export interface RechnungsDatei extends Datei {
  erkannt: RechnungsName & { muster: string };
}

export interface Gewerk {
  /** „G8“ */
  kennung: string;
  /** Ordnername, z. B. „G08 Fenster“ */
  ordner: string;
  /** relativ zum Projektordner */
  pfad: string;
  /** Bezeichnung aus dem Ordnernamen („Fenster“) */
  name: string;
  lvs: LvDatei[];
  /** Dokumente im Auftragsordner, die keine Rechnungen sind (Auftrag, Nachträge, Schriftverkehr) */
  auftrag: Datei[];
  rechnungen: RechnungsDatei[];
  korrespondenz: Datei[];
  /** alle übrigen Dateien des Gewerkeordners */
  sonstige: Datei[];
}

export interface Projektstruktur {
  /** vollständiger Pfad des Projektordners */
  ordner: string;
  gewerkeOrdner: string | null;
  gewerke: Gewerk[];
  /** Kostenkontrolle (Excel) – die aktuelle, dazu weitere zur Auswahl */
  kostenkontrolle: Datei | null;
  kostenkontrollen: Datei[];
  asproj: Datei[];
  /** Mails außerhalb der Gewerke (Projektkorrespondenz) */
  mails: Datei[];
  hinweise: string[];
}

const LV_ENDUNG = /\.(aslv|oalv)$/i;
const MAIL_ENDUNG = /\.(eml|msg)$/i;

const datei = (e: OrdnerEintrag, praefix: string, archive: string[]): Datei => {
  const pfad = praefix ? `${praefix}/${e.pfad}` : e.pfad;
  return { pfad, name: e.pfad.split('/').pop()!, groesse: e.groesse, geaendert: e.geaendert ?? 0, archiv: imArchiv(e.pfad, archive) };
};

/** Gewerkeordner „G08 Fenster“ → Kennung und Name */
export function gewerkAusOrdner(name: string): { kennung: string; name: string } | null {
  const k = gewerkKennung(name);
  if (!k) return null;
  return { kennung: k, name: name.replace(/^\s*G\s*\d+\s*[-_.]?\s*/i, '').trim() };
}

/** Datum im Dateinamen („K62 260519 Kostenkontrolle …“) */
function datumImNamen(name: string): string | null {
  for (const m of name.matchAll(/(?:^|\D)(\d{6})(?=\D|$)/g)) {
    const d = datumAusJJMMTT(m[1]);
    if (d) return d;
  }
  return null;
}

/**
 * Aktuelle Kostenkontrolle: nicht im Archiv, keine Office-Besitzerdatei; „AKTUELL“ im Namen geht vor, dann das
 * jüngste Datum im Namen, dann die zuletzt geänderte.
 */
export function aktuellsteKostenkontrolle(kandidaten: Datei[]): Datei | null {
  const gueltig = kandidaten.filter((d) => !d.archiv && !d.name.startsWith('~$'));
  if (!gueltig.length) return null;
  return [...gueltig].sort((a, b) => {
    const ak = /aktuell/i.test(a.name) ? 1 : 0;
    const bk = /aktuell/i.test(b.name) ? 1 : 0;
    if (ak !== bk) return bk - ak;
    const ad = datumImNamen(a.name) ?? '';
    const bd = datumImNamen(b.name) ?? '';
    if (ad !== bd) return bd.localeCompare(ad);
    return b.geaendert - a.geaendert;
  })[0];
}

export async function projektLesen(fs: AvaDateien, ordner: string, e: AvaEinstellungen, o: { kostenkontrolle?: string | null } = {}): Promise<Projektstruktur> {
  const hinweise: string[] = [];
  const archive = e.ablage.archive;
  const oben = await fs.liste(ordner, 4);
  const gewerkeName = e.ablage.gewerke.replace(/^[\\/]+|[\\/]+$/g, '');
  const gewerkeOrdner = oben.find((x) => x.ordner && x.pfad.toLowerCase() === gewerkeName.toLowerCase())?.pfad ?? (oben.some((x) => x.pfad.toLowerCase().startsWith(`${gewerkeName.toLowerCase()}/`)) ? gewerkeName : null);
  const gewerke: Gewerk[] = [];
  if (gewerkeOrdner) {
    const eintraege = await fs.liste(`${ordner.replace(/[\\/]+$/, '')}/${gewerkeOrdner}`, 5);
    const ordnerNamen = new Set<string>();
    for (const x of eintraege) ordnerNamen.add(x.pfad.split('/')[0]);
    for (const name of ordnerNamen) {
      const ist = eintraege.find((x) => x.pfad === name);
      if (ist && !ist.ordner) continue;
      const g = gewerkAusOrdner(name);
      if (!g) continue;
      const praefix = `${gewerkeOrdner}/${name}`;
      const inhalt = eintraege.filter((x) => x.pfad.startsWith(`${name}/`) && !x.ordner).map((x) => ({ ...x, pfad: x.pfad.slice(name.length + 1) }));
      const gw: Gewerk = { kennung: g.kennung, ordner: name, pfad: praefix, name: g.name, lvs: [], auftrag: [], rechnungen: [], korrespondenz: [], sonstige: [] };
      const auftragOrdner = e.ablage.auftrag.toLowerCase();
      const korrOrdner = e.ablage.korrespondenz.toLowerCase();
      const lvOrdner = e.ablage.lv.replace(/^[\\/]+|[\\/]+$/g, '').toLowerCase();
      for (const x of inhalt) {
        if (x.pfad.split('/').pop()!.startsWith('~$')) continue;
        const d = datei(x, praefix, archive);
        const erster = x.pfad.split('/')[0].toLowerCase();
        const tiefe = x.pfad.split('/').length;
        if (LV_ENDUNG.test(x.pfad) && (lvOrdner ? erster === lvOrdner || tiefe === 1 : tiefe === 1 || d.archiv)) {
          gw.lvs.push({ ...d, format: x.pfad.toLowerCase().endsWith('.oalv') ? 'oalv' : 'aslv' });
        } else if (erster === auftragOrdner && tiefe > 1) {
          const erkannt = /\.pdf$/i.test(d.name) ? nameErkennen(d.name, e.rechnungen.muster, e.rechnungen.arten) : null;
          if (erkannt) gw.rechnungen.push({ ...d, erkannt });
          else gw.auftrag.push(d);
        } else if (erster === korrOrdner && tiefe > 1) gw.korrespondenz.push(d);
        else gw.sonstige.push(d);
      }
      gw.lvs.sort((a, b) => Number(a.archiv) - Number(b.archiv) || b.geaendert - a.geaendert);
      gw.rechnungen.sort((a, b) => (a.erkannt.nr ?? 0) - (b.erkannt.nr ?? 0) || (a.erkannt.datum ?? '').localeCompare(b.erkannt.datum ?? ''));
      gewerke.push(gw);
    }
    gewerke.sort((a, b) => gewerkNummer(a.kennung) - gewerkNummer(b.kennung) || a.ordner.localeCompare(b.ordner));
    const doppelt = gewerke.filter((g, i) => gewerke.findIndex((h) => h.kennung === g.kennung) !== i);
    for (const d of doppelt) hinweise.push(`Zwei Ordner für ${d.kennung}: „${gewerke.find((g) => g.kennung === d.kennung)!.ordner}“ und „${d.ordner}“.`);
  } else hinweise.push(`Kein Gewerkeordner „${e.ablage.gewerke}“ im Projekt.`);
  const alle = oben.filter((x) => !x.ordner);
  const kk = alle.filter((x) => /\.xls[xm]$/i.test(x.pfad) && x.pfad.toLowerCase().includes(e.ablage.kostenkontrolle.toLowerCase())).map((x) => datei(x, '', archive));
  const gewaehlt = o.kostenkontrolle ? kk.find((d) => d.pfad === o.kostenkontrolle) ?? null : null;
  const mailNamen = e.ablage.mailOrdner.map((m) => m.toLowerCase());
  const mails = alle
    .filter((x) => MAIL_ENDUNG.test(x.pfad) && !x.pfad.toLowerCase().startsWith(`${(gewerkeOrdner ?? '\u0000').toLowerCase()}/`) && x.pfad.split('/').slice(0, -1).some((t) => mailNamen.includes(t.toLowerCase())))
    .map((x) => datei(x, '', archive));
  return {
    ordner,
    gewerkeOrdner,
    gewerke,
    kostenkontrolle: gewaehlt ?? aktuellsteKostenkontrolle(kk),
    kostenkontrollen: kk.sort((a, b) => b.geaendert - a.geaendert),
    asproj: alle.filter((x) => /\.asproj$/i.test(x.pfad)).map((x) => datei(x, '', archive)),
    mails,
    hinweise,
  };
}

/** aktuelle LV-Dateien eines Gewerks (ohne Archiv) */
export const aktuelleLvs = (g: Gewerk) => g.lvs.filter((l) => !l.archiv);
