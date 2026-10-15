/**
 * Plattform-Abstraktion für Dateioperationen.
 *
 * Im Tauri-Desktop-Build wird ein nativer Speichern-Dialog über ein Rust-Kommando genutzt,
 * im Browser ein Download. Öffnen funktioniert in beiden Umgebungen über <input type="file">.
 * Alles Plattformspezifische bleibt in dieser Datei – der Rest der App ist reine Web-Technik.
 */

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface SaveOptions {
  defaultName: string;
  /** Ordner, in dem der Dialog startet (z. B. der Ordner der Projektdatei) */
  defaultDir?: string | null;
  contents: string;
  filterName: string;
  extension: string;
  mime: string;
}

/** Liefert false, wenn der Benutzer abgebrochen hat. */
export async function saveTextFile(o: SaveOptions): Promise<boolean> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await invoke<string | null>('save_file', {
      defaultName: o.defaultName,
      defaultDir: o.defaultDir ?? null,
      contents: o.contents,
      filterName: o.filterName,
      extensions: [o.extension],
    });
    return path != null;
  }
  downloadBlob(new Blob([o.contents], { type: o.mime }), o.defaultName);
  return true;
}

export interface SaveBinaryOptions {
  defaultName: string;
  /** Ordner, in dem der Dialog startet (z. B. der Ordner der Projektdatei) */
  defaultDir?: string | null;
  data: Uint8Array;
  filterName: string;
  extension: string;
  /** weitere gleichwertige Endungen für den Dateifilter */
  moreExtensions?: string[];
  mime: string;
}

/** Speichert Binärdaten (z. B. .xlsx). Liefert false, wenn der Benutzer abgebrochen hat. */
export async function saveBinaryFile(o: SaveBinaryOptions): Promise<boolean> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await invoke<string | null>('save_binary_file', {
      defaultName: o.defaultName,
      defaultDir: o.defaultDir ?? null,
      contentsBase64: bytesToBase64(o.data),
      filterName: o.filterName,
      extensions: [o.extension, ...(o.moreExtensions ?? [])],
    });
    return path != null;
  }
  downloadBlob(new Blob([o.data as BlobPart], { type: o.mime }), o.defaultName);
  return true;
}

export interface SaveMergedOptions extends Omit<SaveBinaryOptions, 'data'> {
  /** erzeugt den Dateiinhalt; bekommt den bisherigen Inhalt der Zieldatei (null bei neuer Datei bzw. im Browser) */
  build: (vorhanden: Uint8Array | null) => Uint8Array;
  /** ohne Dialog direkt in diese Datei schreiben (vollständiger Pfad, nur Desktop) */
  pfad?: string | null;
}

/**
 * Speichern mit Blick auf die vorhandene Datei: Ziel wählen (oder den bekannten Pfad nehmen), deren Inhalt
 * lesen, daraus die neuen Daten erzeugen und schreiben. Liefert den vollständigen Pfad (Desktop) bzw. den
 * Dateinamen (Browser) oder null bei Abbruch.
 */
export async function saveMergedFile(o: SaveMergedOptions): Promise<string | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const path =
      o.pfad && istPfad(o.pfad)
        ? o.pfad
        : await invoke<string | null>('pick_save_path', {
            defaultName: o.defaultName,
            defaultDir: o.defaultDir ?? null,
            filterName: o.filterName,
            extensions: [o.extension, ...(o.moreExtensions ?? [])],
          });
    if (path == null) return null;
    const vorhanden = await invoke<string | null>('read_binary_file', { path });
    const data = o.build(vorhanden == null ? null : base64ToBytes(vorhanden));
    await invoke('write_binary_file', { path, contentsBase64: bytesToBase64(data) });
    return path;
  }
  downloadBlob(new Blob([o.build(null) as BlobPart], { type: o.mime }), o.defaultName);
  return o.defaultName;
}

/** Gewählte Datei: Name, Inhalt und – auf dem Desktop – der vollständige Pfad */
export interface GewaehlteDatei {
  name: string;
  /** vollständiger Pfad (nur Desktop); damit speichert „Speichern“ ohne Rückfrage in dieselbe Datei */
  pfad: string | null;
  bytes: Uint8Array;
}

/**
 * Datei öffnen. Auf dem Desktop über den nativen Dialog (liefert den Pfad), im Browser über
 * <input type="file">. `extensions` ohne Punkt, z. B. ['oap', 'json', 'ifc'].
 */
export async function openFileWithPath(o: { filterName: string; extensions: string[]; defaultDir?: string | null }): Promise<GewaehlteDatei | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await invoke<string | null>('pick_open_path', { defaultDir: o.defaultDir ?? null, filterName: o.filterName, extensions: o.extensions });
    if (path == null) return null;
    const b64 = await invoke<string | null>('read_binary_file', { path });
    if (b64 == null) throw new Error(`Datei nicht gefunden: ${path}`);
    return { name: dateiname(path), pfad: path, bytes: base64ToBytes(b64) };
  }
  const f = await pickFile(o.extensions.map((e) => `.${e}`).join(','));
  if (!f) return null;
  return { name: f.name, pfad: null, bytes: new Uint8Array(await f.arrayBuffer()) };
}

/** Ist das ein vollständiger Pfad (Windows oder Unix) und nicht nur ein Dateiname? */
export function istPfad(s: string): boolean {
  return /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(s);
}

/** Dateiname ohne Ordner */
export function dateiname(pfad: string): string {
  return pfad.split(/[\\/]/).pop() || pfad;
}

/** Ordner eines vollständigen Pfads (null bei bloßem Dateinamen) */
export function ordnerVon(pfad: string | null | undefined): string | null {
  if (!pfad || !istPfad(pfad)) return null;
  const i = Math.max(pfad.lastIndexOf('/'), pfad.lastIndexOf('\\'));
  return i > 0 ? pfad.slice(0, i) : null;
}

/** Dateiname ohne Endung */
export function ohneEndung(name: string): string {
  return name.replace(/\.[^.\\/]+$/, '');
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export async function openTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  const f = await pickFile(accept);
  if (!f) return null;
  return { name: f.name, text: await f.text() };
}

export function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
    img.src = dataUrl;
  });
}
