import { isTauri } from '@core/platform/files';
import type { ProjektordnerZugriff } from '@core/platform/projektordner';
import { ordnerWaehlen, ordnerZeigen, SpeicherProjektordner, tauriProjektordner, verbinde } from '@core/platform/projektordner';
import type { OrdnerEintrag } from '@core/projektdatei';

/**
 * Zugriff auf Ordner und Dateien. In der Desktop-App über die gemeinsamen Befehle der Tauri-Hüllen: Ordner und
 * Dateien nur neu anlegen, nie überschreiben – außer der Projektdatei (.oap), die gezielt ergänzt wird (mit
 * Sicherungskopie). Im Browser gibt es keinen Schreibzugriff auf Ordner: Dort entsteht der Projektordner als ZIP,
 * und zum Prüfen wird ein Ordner über den Dateidialog eingelesen.
 */

export type Eintrag = OrdnerEintrag;

/** Zugriff auf Ordner – der gemeinsame der Apps (anlegen, lesen, die Projektdatei gezielt ersetzen) */
export type Dateisystem = ProjektordnerZugriff;

/** Desktop: die gemeinsamen Befehle aller Apps (packages/core/tauri/commands.rs) */
export const tauriDateisystem: Dateisystem = tauriProjektordner;

export const hatDateisystem = () => isTauri();

export const waehleOrdner = (titel: string): Promise<string | null> => ordnerWaehlen(titel);

export const oeffneOrdner = (pfad: string): Promise<void> => ordnerZeigen(pfad);

export { verbinde };

/** im Speicher (Tests, ZIP im Browser) */
export { SpeicherProjektordner as SpeicherDateisystem };

/* ---------- Browser: Ordner über den Dateidialog einlesen ---------- */

export interface GewaehlterOrdner {
  name: string;
  eintraege: Eintrag[];
  lies(pfad: string): Promise<Uint8Array>;
}

/** Ordner über den Dateidialog wählen (nur lesen). Leere Ordner kennt der Browser dabei nicht. */
export function waehleOrdnerImBrowser(): Promise<GewaehlterOrdner | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])];
      input.remove();
      if (!files.length) return resolve(null);
      resolve(ordnerAusDateien(files.map((f) => ({ pfad: f.webkitRelativePath || f.name, groesse: f.size, lies: async () => new Uint8Array(await f.arrayBuffer()) }))));
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** Dateiliste mit Pfaden „Ordner/Unterordner/Datei“ → Einträge relativ zum gewählten Ordner, mit Zwischenordnern */
export function ordnerAusDateien(dateien: { pfad: string; groesse: number; lies: () => Promise<Uint8Array> }[]): GewaehlterOrdner {
  const name = dateien[0]?.pfad.split('/')[0] ?? '';
  const eintraege = new Map<string, Eintrag>();
  const lesen = new Map<string, () => Promise<Uint8Array>>();
  for (const d of dateien) {
    const teile = d.pfad.split('/').slice(1);
    if (!teile.length) continue;
    for (let i = 1; i < teile.length; i++) {
      const p = teile.slice(0, i).join('/');
      if (!eintraege.has(p)) eintraege.set(p, { pfad: p, ordner: true, groesse: 0 });
    }
    const p = teile.join('/');
    eintraege.set(p, { pfad: p, ordner: false, groesse: d.groesse });
    lesen.set(p, d.lies);
  }
  return {
    name,
    eintraege: [...eintraege.values()].sort((a, b) => a.pfad.toLowerCase().localeCompare(b.pfad.toLowerCase())),
    lies: (pfad) => {
      const f = lesen.get(pfad);
      return f ? f() : Promise.reject(new Error(`${pfad}: nicht gefunden`));
    },
  };
}
