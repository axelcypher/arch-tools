import { base64ToBytes, bytesToBase64, isTauri } from '@core/platform/files';

/**
 * Zugriff auf die FORMA-Projektordner. In der Desktop-App über eigene Befehle der Tauri-Hülle, die nur
 * vorhandene Formulare ersetzen (atomar) und nur Sperrdateien anlegen oder löschen – sonst wird nichts
 * geschrieben. Im Browser gibt es keinen Ordnerzugriff: Dort wird ein einzelnes Formular geöffnet und die
 * geänderte Fassung heruntergeladen.
 *
 * Pfade sind relativ zum Projektordner (dem Ordner, in dem die FORMA-Projekte liegen), mit „/“ getrennt.
 */

export interface Eintrag {
  pfad: string;
  ordner: boolean;
  groesse: number;
}

export interface Rechner {
  benutzer: string;
  computer: string;
  prozess: number;
}

export interface Dateisystem {
  /** Ordner und Dateien unter `root` bis zur Tiefe `tiefe` (1 = nur direkt enthaltene) */
  liste(root: string, tiefe: number): Promise<Eintrag[]>;
  /** Inhalt der Datei oder `null`, wenn es sie nicht gibt */
  lies(root: string, pfad: string): Promise<Uint8Array | null>;
  /** Ersetzt ein vorhandenes Formular (.frmsjf) atomar */
  ersetze(root: string, pfad: string, daten: Uint8Array): Promise<void>;
  /** Legt eine Sperrdatei (.frmtmp) an; `false`, wenn es schon eine gibt */
  sperreSetzen(root: string, pfad: string, daten: Uint8Array): Promise<boolean>;
  /** Löscht die Sperrdatei, aber nur wenn sie noch genau `daten` enthält (also die eigene ist) */
  sperreLoesen(root: string, pfad: string, daten: Uint8Array): Promise<boolean>;
  rechner(): Promise<Rechner>;
}

async function invoke<T>(befehl: string, args: Record<string, unknown> = {}): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return api.invoke<T>(befehl, args);
}

export const tauriDateisystem: Dateisystem = {
  liste: (root, tiefe) => invoke<Eintrag[]>('fs_list', { root, tiefe }),
  lies: async (root, pfad) => {
    const b64 = await invoke<string | null>('fs_read', { root, pfad });
    return b64 == null ? null : base64ToBytes(b64);
  },
  ersetze: (root, pfad, daten) => invoke<void>('fs_replace', { root, pfad, contentsBase64: bytesToBase64(daten) }),
  sperreSetzen: (root, pfad, daten) => invoke<boolean>('lock_create', { root, pfad, contentsBase64: bytesToBase64(daten) }),
  sperreLoesen: (root, pfad, daten) => invoke<boolean>('lock_release', { root, pfad, contentsBase64: bytesToBase64(daten) }),
  rechner: () => invoke<Rechner>('machine_info'),
};

export const hatDateisystem = () => isTauri();

export async function waehleOrdner(titel: string): Promise<string | null> {
  return invoke<string | null>('pick_folder', { title: titel });
}

export async function oeffneOrdner(pfad: string): Promise<void> {
  await invoke<void>('open_folder', { pfad });
}

/** Pfad aus Ordner und relativem Teil – mit dem Trenner, den der Ordner schon verwendet */
export function verbinde(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/, '')}${sep}${rel.split('/').join(sep)}`;
}

const gleich = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/* ---------- im Speicher (Tests) ---------- */

/** Dateisystem im Speicher: Schlüssel sind vollständige Pfade mit „/“; Ordner entstehen implizit */
export class SpeicherDateisystem implements Dateisystem {
  readonly dateien = new Map<string, Uint8Array>();
  /** Protokoll der schreibenden Aufrufe */
  readonly schreibvorgaenge: string[] = [];

  constructor(readonly rechnerInfo: Rechner = { benutzer: 'test', computer: 'TEST-PC', prozess: 4242 }) {}

  private pfad(root: string, rel: string) {
    return `${root.replace(/[\\/]+$/, '').replace(/\\/g, '/')}/${rel}`;
  }

  async liste(root: string, tiefe: number): Promise<Eintrag[]> {
    const basis = `${root.replace(/[\\/]+$/, '').replace(/\\/g, '/')}/`;
    const out = new Map<string, Eintrag>();
    for (const [p, v] of this.dateien) {
      if (!p.startsWith(basis)) continue;
      const teile = p.slice(basis.length).split('/');
      for (let i = 1; i <= Math.min(teile.length, tiefe); i++) {
        const rel = teile.slice(0, i).join('/');
        const ordner = i < teile.length;
        if (!out.has(rel)) out.set(rel, { pfad: rel, ordner, groesse: ordner ? 0 : v.length });
      }
    }
    return [...out.values()].sort((a, b) => a.pfad.toLowerCase().localeCompare(b.pfad.toLowerCase()));
  }

  async lies(root: string, pfad: string): Promise<Uint8Array | null> {
    return this.dateien.get(this.pfad(root, pfad)) ?? null;
  }

  async ersetze(root: string, pfad: string, daten: Uint8Array): Promise<void> {
    const p = this.pfad(root, pfad);
    if (!pfad.toLowerCase().endsWith('.frmsjf')) throw new Error(`${pfad}: nur Formulare dürfen ersetzt werden`);
    if (!this.dateien.has(p)) throw new Error(`${pfad}: nicht gefunden`);
    this.dateien.set(p, daten);
    this.schreibvorgaenge.push(`ersetze ${pfad}`);
  }

  async sperreSetzen(root: string, pfad: string, daten: Uint8Array): Promise<boolean> {
    const p = this.pfad(root, pfad);
    if (this.dateien.has(p)) return false;
    this.dateien.set(p, daten);
    this.schreibvorgaenge.push(`sperre ${pfad}`);
    return true;
  }

  async sperreLoesen(root: string, pfad: string, daten: Uint8Array): Promise<boolean> {
    const p = this.pfad(root, pfad);
    const vorhanden = this.dateien.get(p);
    if (!vorhanden || !gleich(vorhanden, daten)) return false;
    this.dateien.delete(p);
    this.schreibvorgaenge.push(`entsperre ${pfad}`);
    return true;
  }

  async rechner(): Promise<Rechner> {
    return this.rechnerInfo;
  }
}
