import { inflateSync, strFromU8, unzipSync, zipSync } from 'fflate';
import { archivDateiSetzen, readProjectFile, writeArchive } from '../archive';
import type { DateiArt } from '../model';
import type { Project } from '../model';
import type { OrdnerEintrag } from '../projektdatei';
import { OAP_SUCHTIEFE, projektdateiAendern, projektdateiWaehlen } from '../projektdatei';
import { parseProjectData } from '../serialize';
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
  /** nur die Dateien mit dieser Endung (ohne Punkt) bis zur Tiefe – schneller als der ganze Baum */
  dateienSuchen?(root: string, tiefe: number, endung: string): Promise<OrdnerEintrag[]>;
  /** einen Eintrag eines ZIP-Archivs lesen, ohne das ganze Archiv zu laden; `null`, wenn es ihn nicht gibt */
  zipEintrag?(root: string, pfad: string, name: string): Promise<{ daten: Uint8Array; stand: DateiStand } | null>;
  /**
   * Datei umbenennen (nur die Hülle von ATLAS und die Rahmen-App): nur innerhalb von `root`, Endung bleibt, der
   * Zielordner muss es geben; `false`, wenn es das Ziel schon gibt – überschrieben wird nie.
   */
  umbenennen?(root: string, alt: string, neu: string): Promise<boolean>;
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
  dateienSuchen: (root, tiefe, endung) => invoke<OrdnerEintrag[]>('projekt_dateien_suchen', { root, tiefe, endung }),
  umbenennen: (root, alt, neu) => invoke<boolean>('projekt_datei_umbenennen', { root, alt, neu }),
  zipEintrag: async (root, pfad, name) => {
    const r = await invoke<{ daten: string; methode: number; groesse: number; geaendert: number } | null>('projekt_zip_eintrag', { root, pfad, name });
    if (!r) return null;
    const roh = base64ToBytes(r.daten);
    if (r.methode !== 0 && r.methode !== 8) throw new Error(`${pfad}: Kompressionsart ${r.methode} wird nicht unterstützt`);
    return { daten: r.methode === 8 ? inflateSync(roh) : roh, stand: { groesse: r.groesse, geaendert: r.geaendert } };
  },
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
export const ordnerName = (pfad: string) =>
  pfad
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .pop() ?? pfad;

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

/** Fehler beim Ersetzen, weil die Datei seit dem Lesen geändert wurde */
const istGeaendert = (e: unknown) => /inzwischen geändert/.test(e instanceof Error ? e.message : String(e));

/**
 * Projektdatei gezielt ändern: unmittelbar vorher frisch einlesen, `aendern` auf `projekt.json` (Rohdaten, alle
 * Abschnitte) anwenden, nur bei einer Änderung schreiben. Hat jemand die Datei zwischen Lesen und Schreiben
 * geändert (eine andere App, ein Kollege), wird neu gelesen und `aendern` noch einmal angewendet – so gehen
 * gleichzeitige Änderungen verschiedener Abschnitte nicht verloren. Liefert true, wenn geschrieben wurde.
 */
export async function projektdateiSchreiben(fs: ProjektordnerZugriff, root: string, pfad: string, aendern: (roh: Record<string, unknown>) => Record<string, unknown>, versuche = 3): Promise<boolean> {
  for (let versuch = 1; ; versuch++) {
    const r = await fs.liesMitStand(root, pfad);
    if (!r) throw new Error(`${pfad}: nicht gefunden`);
    const neu = projektdateiAendern(r.daten, aendern);
    if (!neu) return false;
    try {
      await fs.projektdateiErsetzen(root, pfad, neu, r.stand);
      return true;
    } catch (e) {
      if (versuch >= versuche || !istGeaendert(e)) throw e;
    }
  }
}

/**
 * Eine Originaldatei in die Projektdatei legen (ersetzt die bisherige derselben Art, z. B. die QGIS-Vorlage); liest
 * frisch und versucht es erneut, wenn eine andere App die Datei zwischen Lesen und Schreiben geändert hat.
 */
export async function projektdateiDateiSetzen(
  fs: ProjektordnerZugriff,
  root: string,
  pfad: string,
  datei: { id: string; name: string; art: DateiArt; datum: string },
  daten: Uint8Array,
  versuche = 3,
): Promise<void> {
  for (let versuch = 1; ; versuch++) {
    const r = await fs.liesMitStand(root, pfad);
    if (!r) throw new Error(`${pfad}: nicht gefunden`);
    try {
      await fs.projektdateiErsetzen(root, pfad, archivDateiSetzen(r.daten, datei, daten), r.stand);
      return;
    } catch (e) {
      if (versuch >= versuche || !istGeaendert(e)) throw e;
    }
  }
}

/** Einen Abschnitt der Projektdatei ersetzen (z. B. „formulare“); alles andere bleibt. `undefined` entfernt ihn. */
export function projektdateiAbschnittSetzen(fs: ProjektordnerZugriff, root: string, pfad: string, abschnitt: string, wert: unknown): Promise<boolean> {
  return projektdateiSchreiben(fs, root, pfad, (roh) => {
    const neu = { ...roh };
    if (wert === undefined) delete neu[abschnitt];
    else neu[abschnitt] = structuredClone(wert);
    return neu;
  });
}

/* ---------- Projekte für Übersichten ---------- */

export interface ProjektordnerEintrag {
  /** Stammordner, in dem der Projektordner liegt */
  root: string;
  /** vollständiger Pfad des Projektordners */
  pfad: string;
  name: string;
  geaendert: number;
  /**
   * Unterordner des Stammordners, in dem das Projekt liegt – ein Gruppen-, Akquise- oder Archivordner („Archiv“,
   * „Archiv/2024“); fehlt bei Projekten direkt im Stammordner
   */
  gruppe?: string;
}

/**
 * Name eines Sammelordners für abgeschlossene bzw. Akquise-Projekte: das Stichwort am Anfang, höchstens nach einer
 * Sortiernummer („_Archiv“, „99 Abgeschlossen“, „Archiv 2024“, „00_Akquise“) – nicht „2026-014 Stadtarchiv“.
 */
export const ARCHIV_NAME = /^(?:\d{1,3}[ _.-]*|[_.\-\s]+)?(?:archiv|abgeschlossen|erledigt|beendet|storniert|ruhend)/i;
export const AKQUISE_NAME = /^(?:\d{1,3}[ _.-]*|[_.\-\s]+)?(?:akquise|akquisition)/i;

/** Stand eines Projekts aus seinem Sammelordner – gilt, solange die Projektdatei keinen Status nennt */
export function statusAusGruppe(gruppe: string | undefined): 'akquise' | 'abgeschlossen' | undefined {
  if (!gruppe) return undefined;
  const teile = gruppe.split('/');
  if (teile.some((t) => ARCHIV_NAME.test(t))) return 'abgeschlossen';
  if (teile.some((t) => AKQUISE_NAME.test(t))) return 'akquise';
  return undefined;
}

/** Ordnername, der nach einem Projekt aussieht: Kürzel mit Ziffer bzw. in Großbuchstaben, dann ein Name („2026-014 EFH …“, „SIS Sanierung“) */
const PROJEKTNAME = /^(?:\S*\d\S*|[A-ZÄÖÜ][A-ZÄÖÜ0-9]{1,7})[\s_-]+\S/;
/** Unterordner, wie sie in Projekten stehen: nummeriert („00 Projekt“, „01_Grundlagen“) */
const NUMMERIERT = /^\d{1,3}(?:[ _.-]|$)/;

type Kinder = { ordner: string[]; dateien: string[] };

/**
 * Ist ein Ordner ein Projekt oder ein Sammelordner (Gruppe, Akquise, Archiv)? Aus seinem Namen und seinen direkten
 * Einträgen: Akquise-/Archivnamen sammeln; eine Projektdatei, mehrere nummerierte Unterordner oder ein alter
 * projekt.json machen ein Projekt; sonst sammelt er, wenn darin Ordner mit Projektnamen liegen. Im Zweifel: Projekt
 * (wie bisher).
 */
export function istSammelordner(name: string, k: Kinder): boolean {
  if (ARCHIV_NAME.test(name) || AKQUISE_NAME.test(name)) return true;
  if (k.dateien.some((d) => /\.oap$/i.test(d) || d.toLowerCase() === 'projekt.json')) return false;
  if (k.ordner.filter((o) => NUMMERIERT.test(o)).length >= 2) return false;
  // „00 Projekt“ ist ein Unterordner eines Projekts, kein Projekt
  return k.ordner.some((o) => PROJEKTNAME.test(o) && !NUMMERIERT.test(o));
}

/** so tief werden Sammelordner durchsucht (Archiv/2024/Projekt = 2) */
const SAMMEL_TIEFE = 3;

/**
 * Projektordner in den Stammordnern – direkt darin und in Sammelordnern (Gruppen, Akquise, Archiv, auch
 * verschachtelt bis `SAMMEL_TIEFE`), siehe `istSammelordner`. Gelesen werden je Ordner nur zwei Ebenen. Die
 * Projektdatei je Ordner sucht `projektdateiFinden`, ihre Stammdaten liest `projektdateiKopf` – beides am besten erst
 * für sichtbare Karten. Nicht lesbare Stammordner stehen in `fehler`.
 */
export async function projekteAuflisten(fs: ProjektordnerZugriff, roots: string[]): Promise<{ projekte: ProjektordnerEintrag[]; fehler: { root: string; text: string }[] }> {
  const projekte: ProjektordnerEintrag[] = [];
  const fehler: { root: string; text: string }[] = [];
  const durchsuchen = async (root: string, ordner: string, gruppe: string, tiefe: number) => {
    const eintraege = await fs.liste(ordner, 2);
    const kinder = new Map<string, Kinder>();
    const oben: { name: string; geaendert: number }[] = [];
    for (const e of eintraege) {
      const teile = e.pfad.split('/');
      if (teile.length === 1) {
        if (e.ordner && !/^[.~$]/.test(e.pfad)) {
          oben.push({ name: e.pfad, geaendert: e.geaendert ?? 0 });
          if (!kinder.has(e.pfad)) kinder.set(e.pfad, { ordner: [], dateien: [] });
        }
      } else if (teile.length === 2) {
        const k = kinder.get(teile[0]) ?? { ordner: [], dateien: [] };
        (e.ordner ? k.ordner : k.dateien).push(teile[1]);
        kinder.set(teile[0], k);
      }
    }
    for (const o of oben) {
      const pfad = verbinde(ordner, o.name);
      if (tiefe < SAMMEL_TIEFE && istSammelordner(o.name, kinder.get(o.name)!)) {
        try {
          await durchsuchen(root, pfad, gruppe ? `${gruppe}/${o.name}` : o.name, tiefe + 1);
        } catch (e) {
          fehler.push({ root, text: `${o.name}: ${e instanceof Error ? e.message : String(e)}` });
        }
      } else projekte.push({ root, pfad, name: o.name, geaendert: o.geaendert, ...(gruppe ? { gruppe } : {}) });
    }
  };
  for (const root of roots) {
    try {
      await durchsuchen(root, root, '', 1);
    } catch (e) {
      fehler.push({ root, text: e instanceof Error ? e.message : String(e) });
    }
  }
  return { projekte, fehler };
}

/** Die geltende Projektdatei eines Projektordners (Pfad darin) – `null`, wenn es keine gibt */
export async function projektdateiFinden(fs: ProjektordnerZugriff, projektordner: string, gewaehlt?: string | null): Promise<OrdnerEintrag | null> {
  const eintraege = fs.dateienSuchen ? await fs.dateienSuchen(projektordner, OAP_SUCHTIEFE, 'oap') : await fs.liste(projektordner, OAP_SUCHTIEFE);
  return projektdateiWaehlen(eintraege, gewaehlt);
}

export interface ProjektdateiKopf {
  name: string;
  meta: Project['meta'];
  projektordner?: Project['projektordner'];
  formulare?: unknown;
  stand: DateiStand;
}

/**
 * Nur `projekt.json` einer Projektdatei lesen (Name, Stammdaten, Angaben der Apps) – ohne Pläne und Modelle zu
 * laden. `null`, wenn es die Datei nicht gibt.
 */
export async function projektdateiKopf(fs: ProjektordnerZugriff, root: string, pfad: string): Promise<ProjektdateiKopf | null> {
  let json: Uint8Array;
  let stand: DateiStand;
  if (fs.zipEintrag) {
    const r = await fs.zipEintrag(root, pfad, 'projekt.json');
    if (!r) return null;
    ({ daten: json, stand } = r);
  } else {
    const r = await fs.liesMitStand(root, pfad);
    if (!r) return null;
    const z = unzipSync(r.daten, { filter: (f) => f.name === 'projekt.json' });
    if (!z['projekt.json']) throw new Error(`${pfad}: Im Archiv fehlt das Projekt (projekt.json).`);
    json = z['projekt.json'];
    stand = r.stand;
  }
  const p = parseProjectData(JSON.parse(strFromU8(json)) as unknown);
  return { name: p.name, meta: p.meta, ...(p.projektordner ? { projektordner: p.projektordner } : {}), ...(p.formulare !== undefined ? { formulare: p.formulare } : {}), stand };
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
  async umbenennen(root: string, alt: string, neu: string): Promise<boolean> {
    const von = this.pfad(root, alt);
    const nach = this.pfad(root, neu);
    const v = this.eintraege.get(von);
    if (!(v instanceof Uint8Array)) throw new Error(`${alt}: keine Datei`);
    const endung = (p: string) => (/\.[^./]+$/.exec(p)?.[0] ?? '').toLowerCase();
    if (endung(alt) !== endung(neu)) throw new Error(`${neu}: die Endung der Datei darf sich nicht ändern`);
    const eltern = neu.split('/').slice(0, -1).join('/');
    if (eltern && this.eintraege.get(this.pfad(root, eltern)) !== null) throw new Error(`${neu}: den Zielordner gibt es nicht`);
    if (von === nach) return true;
    if (von.toLowerCase() !== nach.toLowerCase() && this.eintraege.has(nach)) return false;
    this.eintraege.delete(von);
    this.setze(nach, v);
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

  async dateienSuchen(root: string, tiefe: number, endung: string): Promise<OrdnerEintrag[]> {
    const e = endung.replace(/^\./, '').toLowerCase();
    return (await this.liste(root, tiefe)).filter((x) => !x.ordner && x.pfad.toLowerCase().endsWith(`.${e}`));
  }

  async zipEintrag(root: string, pfad: string, name: string) {
    const r = await this.liesMitStand(root, pfad);
    if (!r) return null;
    const z = unzipSync(r.daten, { filter: (f) => f.name === name });
    return z[name] ? { daten: z[name], stand: r.stand } : null;
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
