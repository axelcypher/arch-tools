import { base64ToBytes, bytesToBase64, isTauri } from '@core/platform/files';
import { cp1252Lesen, cp1252Schreiben } from './forma/cp1252';
import type { Projektkarte } from './forma/projektkarte';
import type { SperrProbe } from './forma/sperre';

/**
 * Zugriff auf die FORMA-Projektordner. In der Desktop-App über eigene Befehle der Tauri-Hülle, die nur
 * vorhandene Formulare ersetzen (atomar), nur Sperrdateien anlegen oder löschen und in der Projektkarte nur
 * vorhandene Einträge ändern – sonst wird nichts geschrieben. Im Browser gibt es keinen Ordnerzugriff: Dort wird
 * ein einzelnes Formular geöffnet und die geänderte Fassung heruntergeladen.
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

/**
 * Änderung eines Projektkarten-Eintrags; geschrieben wird nur, wenn er noch `alt` enthält. Texte ändern den
 * Text (Typ 1/2), Auswahl und Kästchen die Nummer der Wahl (Typ 4/8/16) – deren Möglichkeiten bleiben unverändert.
 */
export type PkAenderung = { gruppe: number; id: number; typ: number } & (
  | { spalte: 'texte'; alt: string; neu: string }
  | { spalte: 'ganzzahl'; alt: number | null; neu: number | null }
);

export interface Dateisystem {
  /** Ordner und Dateien unter `root` bis zur Tiefe `tiefe` (1 = nur direkt enthaltene) */
  liste(root: string, tiefe: number): Promise<Eintrag[]>;
  /** Inhalt der Datei oder `null`, wenn es sie nicht gibt */
  lies(root: string, pfad: string): Promise<Uint8Array | null>;
  /** Ersetzt ein vorhandenes Formular (.frmsjf) atomar */
  ersetze(root: string, pfad: string, daten: Uint8Array): Promise<void>;
  /** Legt eine Sperrdatei (.frmtmp) an; `false`, wenn es schon eine gibt */
  sperreSetzen(root: string, pfad: string, daten: Uint8Array): Promise<boolean>;
  /**
   * Löscht die Sperrdatei, aber nur wenn sie noch genau `daten` enthält – die eigene beim Schließen oder eine
   * verwaiste, die ausdrücklich aufgehoben wird. Fehler, wenn ein Programm sie gerade offen hält.
   */
  sperreLoesen(root: string, pfad: string, daten: Uint8Array): Promise<boolean>;
  /** Zustand einer Sperrdatei (Inhalt, offen gehalten, von dieser App, Alter); `null`, wenn es keine gibt */
  sperrePruefen(root: string, pfad: string): Promise<SperrProbe | null>;
  /** Name des Programms mit dieser Prozessnummer auf diesem Rechner; `null`, wenn keins läuft */
  prozess(pid: number): Promise<string | null>;
  /** Vorhandenes Dokument (PDF, Excel, Word) ersetzen – mit Sicherungskopie; abgelehnt, wenn in Office geöffnet */
  dokumentErsetzen(root: string, pfad: string, daten: Uint8Array): Promise<void>;
  /** Ist das Dokument gerade in Excel oder Word geöffnet? */
  inOffice(root: string, pfad: string): Promise<boolean>;
  /** Neues Dokument anlegen (Ordner wird angelegt); vorhandene werden nie überschrieben */
  dokumentAnlegen(root: string, pfad: string, daten: Uint8Array): Promise<void>;
  /** Projektkarte (`sj_prokarte.sdb`) lesen; `null`, wenn es keine gibt */
  projektkarteLesen(root: string, pfad: string): Promise<Projektkarte | null>;
  /** Einträge der Projektkarte ändern – alle oder keiner; Fehler, wenn einer inzwischen anders lautet */
  projektkarteSchreiben(root: string, pfad: string, aenderungen: PkAenderung[]): Promise<void>;
  rechner(): Promise<Rechner>;
}

async function invoke<T>(befehl: string, args: Record<string, unknown> = {}): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return api.invoke<T>(befehl, args);
}

interface PkRoh {
  gruppen: { id: number; typ: number; text: number[] }[];
  inhalte: { gruppe: number; id: number; typ: number; ganzzahl: number | null; titel: number[]; texte: number[] }[];
}

/**
 * Text aus der Projektkarte: FORMA speichert UTF-8 (`PRAGMA encoding`). Ungültige Bytes – etwa aus einer
 * älteren Fassung in Windows-1252 – werden als Windows-1252 gelesen statt verworfen.
 */
export function pkText(b: number[] | Uint8Array): string {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return cp1252Lesen(bytes);
  }
}

/**
 * Text für die Projektkarte (UTF-8). Zeichen, die es in Windows-1252 nicht gibt (z. B. Emojis), werden
 * abgelehnt: FORMA zeigt in seinen Formularen nur diesen Zeichensatz zuverlässig an.
 */
export function pkBytes(s: string): number[] {
  if (cp1252Lesen(cp1252Schreiben(s)) !== s) {
    const falsch = [...s].filter((c) => cp1252Lesen(cp1252Schreiben(c)) !== c);
    throw new Error(`Diese Zeichen kann FORMA nicht darstellen: ${[...new Set(falsch)].join(' ')}`);
  }
  return [...new TextEncoder().encode(s)];
}

const text = pkText;

export const tauriDateisystem: Dateisystem = {
  liste: (root, tiefe) => invoke<Eintrag[]>('fs_list', { root, tiefe }),
  lies: async (root, pfad) => {
    const b64 = await invoke<string | null>('fs_read', { root, pfad });
    return b64 == null ? null : base64ToBytes(b64);
  },
  ersetze: (root, pfad, daten) => invoke<void>('fs_replace', { root, pfad, contentsBase64: bytesToBase64(daten) }),
  sperreSetzen: (root, pfad, daten) => invoke<boolean>('lock_create', { root, pfad, contentsBase64: bytesToBase64(daten) }),
  sperreLoesen: (root, pfad, daten) => invoke<boolean>('lock_release', { root, pfad, contentsBase64: bytesToBase64(daten) }),
  projektkarteLesen: async (root, pfad) => {
    const roh = await invoke<PkRoh | null>('prokarte_read', { root, pfad });
    if (!roh) return null;
    return {
      gruppen: roh.gruppen.map((g) => ({ id: g.id, typ: g.typ, text: text(g.text) })),
      eintraege: roh.inhalte.map((e) => ({ gruppe: e.gruppe, id: e.id, typ: e.typ, titel: text(e.titel), text: text(e.texte), zahl: e.ganzzahl ?? null })),
    };
  },
  projektkarteSchreiben: (root, pfad, aenderungen) =>
    invoke<void>('prokarte_write', {
      root,
      pfad,
      aenderungen: aenderungen.map((a) => (a.spalte === 'texte' ? { ...a, alt: [...new TextEncoder().encode(a.alt)], neu: pkBytes(a.neu) } : a)),
    }),
  sperrePruefen: async (root, pfad) => {
    const p = await invoke<{ inhalt: string; offen: boolean; eigen: boolean; geaendert: number } | null>('lock_probe', { root, pfad });
    return p && { ...p, inhalt: base64ToBytes(p.inhalt) };
  },
  prozess: (pid) => invoke<string | null>('process_info', { pid }),
  dokumentErsetzen: (root, pfad, daten) => invoke<void>('doc_replace', { root, pfad, contentsBase64: bytesToBase64(daten) }),
  inOffice: (root, pfad) => invoke<boolean>('doc_in_office', { root, pfad }),
  dokumentAnlegen: (root, pfad, daten) => invoke<void>('doc_create', { root, pfad, contentsBase64: bytesToBase64(daten) }),
  rechner: () => invoke<Rechner>('machine_info'),
};

export const hatDateisystem = () => isTauri();

export async function waehleOrdner(titel: string): Promise<string | null> {
  return invoke<string | null>('pick_folder', { title: titel });
}

/** Zeigt einen Ordner im Explorer bzw. öffnet eine Datei mit dem zugehörigen Programm */
export async function oeffnePfad(pfad: string): Promise<void> {
  await invoke<void>('open_path', { pfad });
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
  /** Projektkarten je vollständigem Pfad der .sdb (die Datei selbst muss in `dateien` stehen) */
  readonly projektkarten = new Map<string, Projektkarte>();
  /** Protokoll der schreibenden Aufrufe */
  readonly schreibvorgaenge: string[] = [];
  /** Sperrdateien, die ein anderes Programm offen hält (vollständige Pfade) */
  readonly offeneSperren = new Set<string>();
  /** laufende Programme auf diesem Rechner: Prozessnummer → Name */
  readonly prozesse = new Map<number, string>();
  /** Änderungszeit von Dateien (ms), sonst „jetzt“ */
  readonly geaendert = new Map<string, number>();
  /** von „dieser App“ angelegte und offen gehaltene Sperren */
  private readonly eigene = new Set<string>();

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
    this.eigene.add(p);
    this.schreibvorgaenge.push(`sperre ${pfad}`);
    return true;
  }

  async sperreLoesen(root: string, pfad: string, daten: Uint8Array): Promise<boolean> {
    const p = this.pfad(root, pfad);
    const vorhanden = this.dateien.get(p);
    this.eigene.delete(p);
    if (!vorhanden || !gleich(vorhanden, daten)) return false;
    if (this.offeneSperren.has(p)) throw new Error(`${pfad}: Die Sperre wird gerade von einem anderen Programm benutzt`);
    this.dateien.delete(p);
    this.schreibvorgaenge.push(`entsperre ${pfad}`);
    return true;
  }

  async sperrePruefen(root: string, pfad: string): Promise<SperrProbe | null> {
    const p = this.pfad(root, pfad);
    const inhalt = this.dateien.get(p);
    if (!inhalt) return null;
    return { inhalt, offen: this.offeneSperren.has(p) || this.eigene.has(p), eigen: this.eigene.has(p), geaendert: this.geaendert.get(p) ?? Date.now() };
  }

  async prozess(pid: number): Promise<string | null> {
    return this.prozesse.get(pid) ?? null;
  }

  async inOffice(root: string, pfad: string): Promise<boolean> {
    const p = this.pfad(root, pfad);
    const ordner = p.slice(0, p.lastIndexOf('/') + 1);
    const name = p.slice(ordner.length);
    return this.dateien.has(`${ordner}~$${name}`) || this.dateien.has(`${ordner}~$${name.slice(2)}`);
  }

  async dokumentAnlegen(root: string, pfad: string, daten: Uint8Array): Promise<void> {
    const p = this.pfad(root, pfad);
    if (this.dateien.has(p)) throw new Error(`${pfad}: Die Datei gibt es schon`);
    this.dateien.set(p, daten);
    this.schreibvorgaenge.push(`neu ${pfad}`);
  }

  async dokumentErsetzen(root: string, pfad: string, daten: Uint8Array): Promise<void> {
    const p = this.pfad(root, pfad);
    if (!/\.(pdf|xlsx|xlsm|docx)$/i.test(pfad)) throw new Error(`${pfad}: Nur PDF-, Excel- und Word-Dateien dürfen hier gespeichert werden`);
    if (!this.dateien.has(p)) throw new Error(`${pfad}: Datei nicht gefunden`);
    if (await this.inOffice(root, pfad)) throw new Error(`${pfad}: Die Datei ist gerade in Excel bzw. Word geöffnet – bitte dort schließen`);
    this.dateien.set(p, daten);
    this.schreibvorgaenge.push(`dokument ${pfad}`);
  }

  async projektkarteLesen(root: string, pfad: string): Promise<Projektkarte | null> {
    const pk = this.projektkarten.get(this.pfad(root, pfad));
    return pk ? structuredClone(pk) : null;
  }

  async projektkarteSchreiben(root: string, pfad: string, aenderungen: PkAenderung[]): Promise<void> {
    const pk = this.projektkarten.get(this.pfad(root, pfad));
    if (!pk) throw new Error(`${pfad}: nicht gefunden`);
    const ziele = aenderungen.map((a) => {
      const e = pk.eintraege.find((x) => x.gruppe === a.gruppe && x.id === a.id && x.typ === a.typ);
      if (!e) throw new Error(`Eintrag ${a.gruppe}/${a.id} gibt es nicht`);
      if (a.spalte === 'texte') {
        pkBytes(a.neu);
        if (e.typ !== 1 && e.typ !== 2) throw new Error(`Eintrag ${a.gruppe}/${a.id} ist kein Text`);
        if (e.text !== a.alt) throw new Error(`Die Projektkarte wurde inzwischen geändert (${e.titel})`);
      } else {
        if (![4, 8, 16].includes(e.typ)) throw new Error(`Eintrag ${a.gruppe}/${a.id} ist keine Auswahl`);
        if (e.zahl !== a.alt) throw new Error(`Die Projektkarte wurde inzwischen geändert (${e.titel})`);
      }
      return { e, a };
    });
    for (const { e, a } of ziele) {
      if (a.spalte === 'texte') e.text = a.neu;
      else e.zahl = a.neu;
    }
    this.schreibvorgaenge.push(`projektkarte ${pfad} (${aenderungen.length})`);
  }

  async rechner(): Promise<Rechner> {
    return this.rechnerInfo;
  }
}
