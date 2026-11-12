/**
 * QGIS im Hintergrund (qgis_process) für die Katasterpläne: in der Desktop-App über die Befehle der Tauri-Hülle
 * (`packages/core/tauri/qgis.rs`), in den Tests im Speicher. Die Hülle startet nur ein Programm namens qgis_process mit
 * dem Export-Skript und legt die Pläne an ihren Zielen ab – nur neu, nie überschreibend.
 */

import type { SpeicherProjektordner } from '@core/platform/projektordner';

/** Aufruf von qgis_process mit dem Export-Skript (siehe katasterexport.py) */
export interface QgisAufruf {
  /** Pfad zu qgis_process */
  programm: string;
  /** Inhalt des Export-Skripts */
  skript: string;
  /** Auftrag (JSON); „vorlage“ setzt die Hülle, „ausgabe“ je Plan ist der vollständige Zielpfad */
  auftrag: unknown;
  vorlage: Uint8Array;
  vorlageName: string;
}

export interface QgisErgebnis {
  code: number;
  ausgabe: string;
  fehler: string;
  /** am Ziel abgelegte Pläne (nie überschrieben: sonst `fehler`) */
  abgelegt: { id: string; datei: string | null; fehler: string | null }[];
}

export interface QgisZugriff {
  /** qgis_process in den üblichen Installationsorten suchen (neueste zuerst) */
  suchen(): Promise<string[]>;
  /** Export-Skript ausführen; legt die Pläne an ihren Zielen ab */
  ausfuehren(a: QgisAufruf): Promise<QgisErgebnis>;
  /** Datei mit vollständigem Pfad lesen (QGIS-Vorlage); null, wenn es sie nicht gibt */
  dateiLesen(pfad: string): Promise<Uint8Array | null>;
}

async function invoke<T>(befehl: string, args: Record<string, unknown> = {}): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return api.invoke<T>(befehl, args);
}

const zuBase64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const ausBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const tauriQgis: QgisZugriff = {
  suchen: () => invoke<string[]>('qgis_suchen'),
  ausfuehren: (a) =>
    invoke<QgisErgebnis>('qgis_ausfuehren', { programm: a.programm, skript: a.skript, auftrag: JSON.stringify(a.auftrag), vorlageBase64: zuBase64(a.vorlage), vorlageName: a.vorlageName }),
  dateiLesen: async (pfad) => {
    const b64 = await invoke<string | null>('read_binary_file', { path: pfad });
    return b64 == null ? null : ausBase64(b64);
  },
};

/** Im Speicher (Tests): Dateien mit vollständigem Pfad, Aufrufe merken, Pläne mit `ok` neu im Projektordner anlegen */
export class SpeicherQgis implements QgisZugriff {
  /** Dateien außerhalb der Projektordner (QGIS-Vorlage) */
  readonly dateien = new Map<string, Uint8Array>();
  programme: string[] = [];
  readonly aufrufe: QgisAufruf[] = [];
  /** Ersatz für qgis_process: liefert die Ausgabe; ohne: alle Pläne gelingen */
  lauf: ((a: QgisAufruf) => { code?: number; ausgabe?: string; fehler?: string; ok?: string[] }) | null = null;

  constructor(private readonly fs: SpeicherProjektordner) {}

  async suchen() {
    return this.programme;
  }
  async dateiLesen(pfad: string) {
    return this.dateien.get(pfad) ?? null;
  }
  async ausfuehren(a: QgisAufruf): Promise<QgisErgebnis> {
    this.aufrufe.push(a);
    const plaene = (a.auftrag as { plaene: { id: string; ausgabe: string }[] }).plaene;
    const r = this.lauf?.(a) ?? { ok: plaene.map((p) => p.id) };
    const ausgabe = r.ausgabe ?? plaene.map((p) => `ERGEBNIS ${JSON.stringify({ id: p.id, ok: true, datei: p.ausgabe })}`).join('\n');
    const abgelegt = plaene.map((p) => {
      if (!(r.ok ?? []).includes(p.id)) return { id: p.id, datei: null, fehler: null };
      if (this.fs.eintraege.has(p.ausgabe)) return { id: p.id, datei: null, fehler: `${p.ausgabe}: Datei gibt es schon` };
      this.fs.setze(p.ausgabe, new Uint8Array([1]));
      return { id: p.id, datei: p.ausgabe, fehler: null };
    });
    return { code: r.code ?? 0, ausgabe, fehler: r.fehler ?? '', abgelegt };
  }
}
