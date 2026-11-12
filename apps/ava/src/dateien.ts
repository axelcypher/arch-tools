/**
 * Dateizugriff der App: Lesen, Auflisten und Anlegen über die gemeinsamen Befehle (packages/core), Ersetzen,
 * Umbenennen, Scans übernehmen und Mailentwürfe über die eigenen Befehle der Tauri-Hülle (befehle.rs).
 * Pfade sind relativ zu `root` (dem Projektordner bzw. Scanordner) und mit „/“ getrennt.
 *
 * Im Browser gibt es keinen Ordnerzugriff; für Tests gibt es eine Fassung im Speicher.
 */

import type { DateiStand, ProjektordnerZugriff } from '@core/platform/projektordner';
import { SpeicherProjektordner, tauriProjektordner } from '@core/platform/projektordner';
import type { OrdnerEintrag } from '@core/projektdatei';
import { bytesToBase64, isTauri } from '@core/platform/files';

export type { DateiStand };

export interface AvaDateien {
  readonly projektordner: ProjektordnerZugriff;
  liste(root: string, tiefe: number): Promise<OrdnerEintrag[]>;
  lies(root: string, pfad: string): Promise<{ daten: Uint8Array; stand: DateiStand } | null>;
  /** neue Datei; false = gab es schon (unverändert) */
  anlegen(root: string, pfad: string, daten: Uint8Array): Promise<boolean>;
  ordnerAnlegen(root: string, pfad: string): Promise<boolean>;
  /** vorhandene Datei ersetzen – nur mit dem Stand vom Lesen, mit Sicherungskopie */
  ersetzen(root: string, pfad: string, daten: Uint8Array, stand: DateiStand): Promise<void>;
  umbenennen(root: string, von: string, nach: string): Promise<void>;
  /** Scan aus dem Scanordner ins Projekt (optional mit neuem Inhalt, z. B. mit Deckblatt) */
  scanUebernehmen(scanOrdner: string, scanDatei: string, root: string, ziel: string, daten?: Uint8Array): Promise<void>;
  /** Datei mit ihrem Programm öffnen */
  oeffnen(pfad: string): Promise<void>;
  /** Mailentwurf (.eml) im Mailprogramm öffnen */
  mailEntwurf(name: string, eml: Uint8Array): Promise<void>;
  /** Ist die Datei in Excel geöffnet? */
  inOffice(root: string, pfad: string): Promise<boolean>;
  /** erzeugte Datei (Deckblatt, Protokoll) im Temp-Ordner ablegen und mit ihrem Programm öffnen */
  tempOeffnen(name: string, daten: Uint8Array): Promise<void>;
}

async function invoke<T>(befehl: string, args: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return api.invoke<T>(befehl, args);
}

export const tauriDateien: AvaDateien = {
  projektordner: tauriProjektordner,
  liste: (root, tiefe) => tauriProjektordner.liste(root, tiefe),
  lies: (root, pfad) => tauriProjektordner.liesMitStand(root, pfad),
  anlegen: (root, pfad, daten) => tauriProjektordner.dateiAnlegen(root, pfad, daten),
  ordnerAnlegen: (root, pfad) => tauriProjektordner.ordnerAnlegen(root, pfad),
  ersetzen: (root, pfad, daten, stand) => invoke<void>('ava_ersetzen', { root, pfad, contentsBase64: bytesToBase64(daten), groesse: stand.groesse, geaendert: stand.geaendert }),
  umbenennen: (root, von, nach) => invoke<void>('ava_umbenennen', { root, von, nach }),
  scanUebernehmen: (scanOrdner, scanDatei, root, ziel, daten) =>
    invoke<void>('ava_scan_uebernehmen', { scanOrdner, scanDatei, root, ziel, contentsBase64: daten ? bytesToBase64(daten) : null }),
  oeffnen: (pfad) => invoke<void>('ava_oeffnen', { pfad }),
  mailEntwurf: async (name, eml) => {
    await invoke<string>('ava_mail_entwurf', { name, contentsBase64: bytesToBase64(eml) });
  },
  inOffice: (root, pfad) => invoke<boolean>('ava_office_offen', { root, pfad }),
  tempOeffnen: async (name, daten) => {
    await invoke<string>('ava_temp_oeffnen', { name, contentsBase64: bytesToBase64(daten) });
  },
};

export const hatDateizugriff = () => isTauri();

/** Dateien im Speicher – für Tests und die Web-Vorschau */
export class SpeicherDateien implements AvaDateien {
  readonly projektordner: SpeicherProjektordner;
  readonly geoeffnet: string[] = [];
  readonly mails: { name: string; eml: Uint8Array }[] = [];
  constructor(po = new SpeicherProjektordner()) {
    this.projektordner = po;
  }
  private voll(root: string, pfad: string) {
    return `${root.replace(/[\\/]+$/, '').replace(/\\/g, '/')}/${pfad}`;
  }
  setze(root: string, pfad: string, daten: Uint8Array) {
    this.projektordner.setze(this.voll(root, pfad), daten);
  }
  liste(root: string, tiefe: number) {
    return this.projektordner.liste(root, tiefe);
  }
  lies(root: string, pfad: string) {
    return this.projektordner.liesMitStand(root, pfad);
  }
  anlegen(root: string, pfad: string, daten: Uint8Array) {
    return this.projektordner.dateiAnlegen(root, pfad, daten);
  }
  ordnerAnlegen(root: string, pfad: string) {
    return this.projektordner.ordnerAnlegen(root, pfad);
  }
  async ersetzen(root: string, pfad: string, daten: Uint8Array, stand: DateiStand) {
    const r = await this.lies(root, pfad);
    if (!r) throw new Error(`${pfad}: Datei nicht gefunden`);
    if (r.stand.groesse !== stand.groesse || r.stand.geaendert !== stand.geaendert) throw new Error(`${pfad}: wurde inzwischen geändert – bitte neu einlesen und erneut versuchen`);
    this.setze(root, pfad, daten);
  }
  async umbenennen(root: string, von: string, nach: string) {
    const r = await this.lies(root, von);
    if (!r) throw new Error(`${von}: Datei nicht gefunden`);
    if (await this.lies(root, nach)) throw new Error(`${nach}: Die Datei gibt es schon`);
    this.setze(root, nach, r.daten);
    this.projektordner.eintraege.delete(this.voll(root, von));
  }
  async scanUebernehmen(scanOrdner: string, scanDatei: string, root: string, ziel: string, daten?: Uint8Array) {
    const r = await this.lies(scanOrdner, scanDatei);
    if (!r) throw new Error(`${scanDatei}: Scan nicht gefunden`);
    if (await this.lies(root, ziel)) throw new Error(`${ziel}: Die Datei gibt es schon`);
    this.setze(root, ziel, daten ?? r.daten);
    this.projektordner.eintraege.delete(this.voll(scanOrdner, scanDatei));
  }
  async oeffnen(pfad: string) {
    this.geoeffnet.push(pfad);
  }
  async mailEntwurf(name: string, eml: Uint8Array) {
    this.mails.push({ name, eml });
  }
  async inOffice() {
    return false;
  }
  readonly temp: { name: string; daten: Uint8Array }[] = [];
  async tempOeffnen(name: string, daten: Uint8Array) {
    this.temp.push({ name, daten });
  }
}

/** vollständiger Pfad aus Ordner und relativem Pfad (Trenner wie im Ordner) */
export function vollerPfad(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/, '')}${sep}${rel.split('/').join(sep)}`;
}
