import { zipSync } from 'fflate';
import { readProjectFile, writeArchive } from '../archive';
import type { Project } from '../model';
import type { OrdnerEintrag } from '../projektdatei';
import { OAP_SUCHTIEFE, projektdateiAendern, projektdateiWaehlen } from '../projektdatei';
import { base64ToBytes, bytesToBase64, isTauri } from './files';

/**
 * Zugriff auf Projektordner – gemeinsam für alle Apps. In der Desktop-App über die gemeinsamen Befehle der
 * Tauri-Hüllen (packages/core/tauri/commands.rs): lesen, neue Ordner und Dateien anlegen, die Projektdatei
 * (.oap) gezielt ersetzen (atomar, mit Sicherungskopie, nur wenn sie seit dem Lesen niemand geändert hat).
 * Andere Dateien werden nie überschrieben, und gelöscht wird nichts.
 */

/** Stand einer Datei beim Lesen – geschrieben wird nur, wenn er noch gilt */
export interface DateiStand {
  groesse: number;
  /** letzte Änderung (ms seit 1970) */
  geaendert: number;
}

export interface ProjektordnerZugriff {
  /** Ordner und Dateien unter `root` bis zur Tiefe `tiefe` (1 = nur direkt enthaltene) */
  liste(root: string, tiefe: number): Promise<OrdnerEintrag[]>;
  /** Inhalt einer Datei; Fehler, wenn es sie nicht gibt */
  lies(root: string, pfad: string): Promise<Uint8Array>;
  /** Inhalt und Stand einer Datei; `null`, wenn es sie nicht gibt */
  liesMitStand(root: string, pfad: string): Promise<{ daten: Uint8Array; stand: DateiStand } | null>;
  /** true = neu angelegt, false = war schon vorhanden */
  ordnerAnlegen(root: string, pfad: string): Promise<boolean>;
  /** true = neu angelegt, false = vorhandene Datei unverändert gelassen */
  dateiAnlegen(root: string, pfad: string, daten: Uint8Array): Promise<boolean>;
  /** vorhandene Projektdatei (.oap) ersetzen – nur, wenn sie noch den Stand `stand` hat */
  projektdateiErsetzen(root: string, pfad: string, daten: Uint8Array, stand: DateiStand): Promise<void>;
}

async function invoke<T>(befehl: string, args: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return api.invoke<T>(befehl, args);
}

export const tauriProjektordner: ProjektordnerZugriff = {
  liste: (root, tiefe) => invoke<OrdnerEintrag[]>('projekt_liste', { root, tiefe }),
  lies: async (root, pfad) => {
    const r = await tauriProjektordner.liesMitStand(root, pfad);
    if (!r) throw new Error(`${pfad}: nicht gefunden`);
    return r.daten;
  },
  liesMitStand: async (root, pfad) => {
    const r = await invoke<{ daten: string; groesse: number; geaendert: number } | null>('projekt_lesen', { root, pfad });
    return r ? { daten: base64ToBytes(r.daten), stand: { groesse: r.groesse, geaendert: r.geaendert } } : null;
  },
  ordnerAnlegen: (root, pfad) => invoke<boolean>('projekt_ordner_anlegen', { root, pfad }),
  dateiAnlegen: (root, pfad, daten) => invoke<boolean>('projekt_datei_anlegen', { root, pfad, contentsBase64: bytesToBase64(daten) }),
  projektdateiErsetzen: (root, pfad, daten, stand) => invoke<void>('projekt_oap_ersetzen', { root, pfad, contentsBase64: bytesToBase64(daten), groesse: stand.groesse, geaendert: stand.geaendert }),
};

/** Gibt es Ordnerzugriff (Desktop-App)? Im Browser nur lesend über den Dateidialog. */
export const hatOrdnerzugriff = () => isTauri();

/** Ordner im Dialog wählen; `null` bei Abbruch */
export function ordnerWaehlen(titel: string): Promise<string | null> {
  return invoke<string | null>('ordner_waehlen', { title: titel });
}

/** Ordner im Dateimanager zeigen */
export function ordnerZeigen(pfad: string): Promise<void> {
  return invoke<void>('ordner_zeigen', { pfad });
}

/** Pfad aus Ordner und relativem Teil – mit dem Trenner, den der Ordner schon verwendet */
export function verbinde(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/, '')}${sep}${rel.split('/').join(sep)}`;
}

/** letzter Teil eines Pfads */
export const ordnerName = (pfad: string) => pfad.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? pfad;

/* ---------- Projektdatei im Projektordner ---------- */

export interface GeladeneProjektdatei {
  /** Pfad im Projektordner */
  pfad: string;
  projekt: Project;
  stand: DateiStand;
  /** alle Projektdateien im Ordner (bei mehreren lässt sich eine andere wählen) */
  kandidaten: string[];
}

/**
 * Projektdatei eines Projektordners laden. `null`, wenn es keine gibt – das ist kein Fehler: Dann legen die Apps
 * über den Stammdaten-Dialog eine an. `eintraege` (schon eingelesen) spart das erneute Auflisten.
 */
export async function projektdateiLaden(fs: ProjektordnerZugriff, root: string, o: { eintraege?: OrdnerEintrag[]; gewaehlt?: string | null } = {}): Promise<GeladeneProjektdatei | null> {
  const eintraege = o.eintraege ?? (await fs.liste(root, OAP_SUCHTIEFE));
  const datei = projektdateiWaehlen(eintraege, o.gewaehlt);
  if (!datei) return null;
  const r = await fs.liesMitStand(root, datei.pfad);
  if (!r) return null;
  const kandidaten = eintraege.filter((e) => !e.ordner && /\.oap$/i.test(e.pfad)).map((e) => e.pfad);
  return { pfad: datei.pfad, projekt: readProjectFile(r.daten), stand: r.stand, kandidaten };
}

/**
 * Projektdatei gezielt ändern: frisch einlesen, `aendern` auf `projekt.json` (Rohdaten, alle Abschnitte) anwenden,
 * nur bei einer Änderung schreiben. Hat jemand die Datei zwischen Lesen und Schreiben geändert, scheitert das
 * Schreiben (dann erneut versuchen). Liefert true, wenn geschrieben wurde.
 */
export async function projektdateiSchreiben(fs: ProjektordnerZugriff, root: string, pfad: string, aendern: (roh: Record<string, unknown>) => Record<string, unknown>): Promise<boolean> {
  const r = await fs.liesMitStand(root, pfad);
  if (!r) throw new Error(`${pfad}: nicht gefunden`);
  const neu = projektdateiAendern(r.daten, aendern);
  if (!neu) return false;
  await fs.projektdateiErsetzen(root, pfad, neu, r.stand);
  return true;
}

/** Neue Projektdatei anlegen; false, wenn es an der Stelle schon eine Datei gibt (sie bleibt unverändert) */
export function projektdateiAnlegen(fs: ProjektordnerZugriff, root: string, pfad: string, projekt: Project, app: string): Promise<boolean> {
  return fs.dateiAnlegen(root, pfad, writeArchive(projekt, { app }));
}

/* ---------- im Speicher (Tests, ZIP im Browser) ---------- */

/** Projektordner im Speicher: Schlüssel sind vollständige Pfade mit „/“; Ordner haben den Wert null */
export class SpeicherProjektordner implements ProjektordnerZugriff {
  readonly eintraege = new Map<string, Uint8Array | null>();
  /** Änderungszeit je Datei (zählt bei jedem Schreiben hoch) */
  private readonly zeiten = new Map<string, number>();
  private uhr = 1;

  private pfad(root: string, rel: string) {
    return `${root.replace(/[\\/]+$/, '').replace(/\\/g, '/')}/${rel}`;
  }

  /** Datei von außen setzen (wie eine andere App oder ein Kollege) */
  setze(voll: string, daten: Uint8Array) {
    this.eintraege.set(voll, daten);
    this.zeiten.set(voll, this.uhr++);
  }

  async liste(root: string, tiefe: number): Promise<OrdnerEintrag[]> {
    const basis = `${root.replace(/[\\/]+$/, '').replace(/\\/g, '/')}/`;
    const out: OrdnerEintrag[] = [];
    for (const [p, v] of this.eintraege) {
      if (!p.startsWith(basis)) continue;
      const rel = p.slice(basis.length);
      if (!rel || rel.split('/').length > tiefe) continue;
      out.push({ pfad: rel, ordner: v === null, groesse: v?.length ?? 0, geaendert: this.zeiten.get(p) ?? 0 });
    }
    return out.sort((a, b) => a.pfad.toLowerCase().localeCompare(b.pfad.toLowerCase()));
  }

  async lies(root: string, pfad: string): Promise<Uint8Array> {
    const v = this.eintraege.get(this.pfad(root, pfad));
    if (!v) throw new Error(`${pfad}: nicht gefunden`);
    return v;
  }

  async liesMitStand(root: string, pfad: string) {
    const p = this.pfad(root, pfad);
    const v = this.eintraege.get(p);
    return v ? { daten: v, stand: { groesse: v.length, geaendert: this.zeiten.get(p) ?? 0 } } : null;
  }

  async ordnerAnlegen(root: string, pfad: string): Promise<boolean> {
    const teile = pfad.split('/');
    let neu = false;
    for (let i = 1; i <= teile.length; i++) {
      const p = this.pfad(root, teile.slice(0, i).join('/'));
      if (this.eintraege.get(p) instanceof Uint8Array) throw new Error(`${pfad}: Es gibt bereits eine Datei mit diesem Namen`);
      if (!this.eintraege.has(p)) {
        this.eintraege.set(p, null);
        neu = i === teile.length || neu;
      }
    }
    return neu;
  }

  async dateiAnlegen(root: string, pfad: string, daten: Uint8Array): Promise<boolean> {
    const p = this.pfad(root, pfad);
    if (this.eintraege.has(p)) return false;
    const eltern = pfad.split('/').slice(0, -1).join('/');
    if (eltern) await this.ordnerAnlegen(root, eltern);
    this.setze(p, daten);
    return true;
  }

  async projektdateiErsetzen(root: string, pfad: string, daten: Uint8Array, stand: DateiStand): Promise<void> {
    if (!/\.oap$/i.test(pfad)) throw new Error(`${pfad}: nur Projektdateien (.oap) dürfen ersetzt werden`);
    const p = this.pfad(root, pfad);
    const v = this.eintraege.get(p);
    if (!v) throw new Error(`${pfad}: nicht gefunden`);
    if (v.length !== stand.groesse || (this.zeiten.get(p) ?? 0) !== stand.geaendert) throw new Error(`${pfad}: wurde inzwischen geändert – bitte erneut versuchen`);
    this.setze(p, daten);
  }

  /** alles unter `root` als ZIP (leere Ordner bleiben erhalten) */
  alsZip(root: string): Uint8Array {
    const basis = `${root.replace(/[\\/]+$/, '').replace(/\\/g, '/')}/`;
    const dateien: Record<string, Uint8Array> = {};
    for (const [p, v] of this.eintraege) {
      if (!p.startsWith(basis)) continue;
      const rel = p.slice(basis.length);
      if (v === null) dateien[`${rel}/`] = new Uint8Array(0);
      else dateien[rel] = v;
    }
    return zipSync(dateien, { level: 6 });
  }
}
