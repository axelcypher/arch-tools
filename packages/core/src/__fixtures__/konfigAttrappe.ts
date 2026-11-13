/**
 * Tests: die Tauri-Befehle des Konfigurationsordners gegen ein Dateisystem im Speicher – lokaler Ordner `BASIS` und
 * ein Netzlaufwerk `NAS`, das sich „abziehen“ lässt. `installieren()` setzt `window.__TAURI_INTERNALS__` wie in der
 * Desktop-App (darüber ruft @tauri-apps/api, und `isTauri()` prüft darauf).
 */

export const BASIS = '/home/a/arch-tools';
export const NAS = '/nas/konfig';
export const KOPIE = `${BASIS}/netz-kopie`;

export const attrappe = {
  dateien: new Map<string, string>(),
  nasErreichbar: true,
  /** abgezogenes Netzlaufwerk liefert beim Lesen „gibt es nicht“ statt eines Fehlers */
  nasWegAlsFehlt: false,
  /** vor dem Vergleich in `konfig_schreiben_wenn`: ein anderer Rechner schreibt dazwischen */
  dazwischen: null as ((pfad: string) => void) | null,
  /** Antwort des Ordnerdialogs */
  ordnerWahl: null as string | null,
  aufrufe: [] as string[],
  /** solange gesetzt, wartet die Prüfung der Erreichbarkeit darauf (laufende Aktion im Dialog) */
  bremse: null as Promise<void> | null,
};

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const text = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
export const lies = (pfad: string) => (attrappe.dateien.has(pfad) ? (JSON.parse(text(attrappe.dateien.get(pfad)!)) as unknown) : undefined);
export const legeAn = (pfad: string, wert: unknown) => attrappe.dateien.set(pfad, b64(`${JSON.stringify(wert, null, 2)}\n`));

const aufNas = (pfad: string) => pfad === NAS || pfad.startsWith(`${NAS}/`);
const pruefeNas = (pfad: string) => {
  if (aufNas(pfad) && !attrappe.nasErreichbar) throw new Error(`${pfad}: Der Netzwerkpfad wurde nicht gefunden.`);
};

async function invoke(befehl: string, a: Record<string, unknown>): Promise<unknown> {
  const fs = attrappe.dateien;
  attrappe.aufrufe.push(befehl);
  switch (befehl) {
    case 'konfig_basis':
      return BASIS;
    case 'ordner_erreichbar':
      if (attrappe.bremse) await attrappe.bremse;
      return aufNas(a.pfad as string) ? attrappe.nasErreichbar : true;
    case 'ordner_waehlen':
      return attrappe.ordnerWahl;
    case 'ordner_zeigen':
      return;
    case 'read_binary_file':
      // ein getrenntes Laufwerk meldet unter Windows teils „Pfad nicht gefunden“ – Rust liefert dann `null`
      if (aufNas(a.path as string) && !attrappe.nasErreichbar && attrappe.nasWegAlsFehlt) return null;
      pruefeNas(a.path as string);
      return fs.get(a.path as string) ?? null;
    case 'write_binary_file':
      pruefeNas(a.path as string);
      fs.set(a.path as string, a.contentsBase64 as string);
      return;
    case 'konfig_dateien': {
      const ordner = a.ordner as string;
      pruefeNas(ordner);
      return [...fs.keys()]
        .filter((p) => p.startsWith(`${ordner}/`) && !p.slice(ordner.length + 1).includes('/') && !p.slice(ordner.length + 1).startsWith('.') && p.endsWith('.json'))
        .map((p) => p.slice(ordner.length + 1))
        .sort();
    }
    case 'konfig_schreiben_wenn': {
      const pfad = a.pfad as string;
      pruefeNas(pfad);
      attrappe.dazwischen?.(pfad);
      if ((fs.get(pfad) ?? null) !== (a.erwartetBase64 ?? null)) return false;
      fs.set(pfad, a.contentsBase64 as string);
      return true;
    }
    default:
      throw new Error(`unbekannter Befehl ${befehl}`);
  }
}

/** Ausgangszustand herstellen und die Befehle bereitstellen */
export function installieren(): void {
  attrappe.dateien.clear();
  attrappe.nasErreichbar = true;
  attrappe.nasWegAlsFehlt = false;
  attrappe.dazwischen = null;
  attrappe.ordnerWahl = null;
  attrappe.bremse = null;
  attrappe.aufrufe.length = 0;
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = { invoke };
}
