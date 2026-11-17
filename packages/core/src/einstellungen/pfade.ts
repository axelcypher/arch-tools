import { useEffect, useState } from 'react';
import { konfigAendern, konfigBeobachten, konfigGeaendertMelden, konfigLesen, konfigNeuLesen } from '../platform/konfig';
import { verbinde } from '../platform/projektordner';
import { ersetzen, globaleWerte, type GlobaleQuelle } from '../platzhalter';
import { sichererDateiname } from '../projektdatei';
import { gleicherWert, mitSchluessel, type PfadEinstellung, type PfadWert } from './verzeichnis';
import { PFAD_EINSTELLUNGEN } from './eintraege';
import { abweichungId, EXPORT_APPS, gemeinsamId, wirksamAus, type ExportApp, type ExportGruppe } from './gemeinsam';
import { EXPORT_VARIABLEN } from './variablen';

/**
 * Zugriff der Apps auf die zentralen Pfad- und Namenseinstellungen (Verzeichnis in `eintraege.ts`). Gelesen wird aus
 * dem gemeinsamen Einstellungsspeicher; die Werte liegen danach im Zwischenspeicher dieses Fensters (`pfadWert` liest
 * synchron, `usePfadWert` folgt Änderungen). Ändert ein Fenster eine Einstellung, lesen alle anderen neu.
 */

const nachId = new Map(PFAD_EINSTELLUNGEN.map((e) => [e.id, e]));

/** Beschreibung einer Einstellung nach Kennung */
export function pfadEinstellung(id: string): PfadEinstellung {
  const e = nachId.get(id);
  if (!e) throw new Error(`Unbekannte Pfadeinstellung ${id}`);
  return e;
}

/** gespeicherte Werte (ohne Vorgaben) nach Kennung */
export type PfadWerte = Record<string, PfadWert | undefined>;

const bereiche = () => [...new Set(PFAD_EINSTELLUNGEN.map((e) => e.speicher.bereich))];
const objekt = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

let zwischen: PfadWerte = {};
let geladen: Promise<PfadWerte> | null = null;
const hoerer = new Set<() => void>();
const melden = () => hoerer.forEach((f) => f());

/** gespeicherte Werte aus Rohdaten je Bereich – auch für Tests der Übernahme alter Schlüssel */
export function pfadWerteAus(roh: Record<string, unknown>): PfadWerte {
  const out: PfadWerte = {};
  for (const e of PFAD_EINSTELLUNGEN) {
    const w = e.speicher.lesen(objekt(roh[e.speicher.bereich]));
    if (w !== undefined) out[e.id] = w;
  }
  return out;
}

/** alle Werte frisch lesen (je Bereich einmal) und den Zwischenspeicher füllen */
let laeufe = 0;
export function pfadWerteLaden(): Promise<PfadWerte> {
  const lauf = ++laeufe;
  const p = (async () => {
    const roh: Record<string, unknown> = {};
    await Promise.all(bereiche().map(async (b) => (roh[b] = await konfigLesen(b).catch(() => null))));
    const werte = pfadWerteAus(roh);
    // nur das Ergebnis des letzten Laufs gilt – ein älterer überholt keinen neueren und kein Speichern dazwischen
    if (lauf === laeufe) {
      zwischen = werte;
      melden();
    }
    return werte;
  })();
  geladen = p;
  p.catch(() => {
    if (geladen === p) geladen = null;
  });
  return p;
}

/** einmal laden; danach der Zwischenspeicher (frisch nach jeder gemeldeten Änderung) */
const sicherGeladen = () => geladen ?? pfadWerteLaden();

/** gilt: gespeicherter Wert, sonst Vorgabe; Text, wo ein Text erwartet wird */
const gilt = (e: PfadEinstellung, werte: PfadWerte): PfadWert => werte[e.id] ?? e.vorgabe;

/** Wert einer Einstellung aus dem Zwischenspeicher (sonst die Vorgabe) – synchron, z. B. beim Zeichnen */
export function pfadWert(id: string): PfadWert {
  void sicherGeladen().catch(() => undefined);
  return gilt(pfadEinstellung(id), zwischen);
}

/** Wert einer Einstellung, frisch gelesen */
export async function pfadWertLesen(id: string): Promise<PfadWert> {
  return gilt(pfadEinstellung(id), await pfadWerteLaden());
}

/** Text einer Einstellung (Vorlage) */
export const pfadText = (id: string): string => {
  const w = pfadWert(id);
  return Array.isArray(w) ? w.join('\n') : String(w);
};

/** gespeicherte Werte sind in Kraft? (für die Anzeige „Vorgabe“ bzw. „Eigener Wert“) */
export const istVorgabe = (e: PfadEinstellung, werte: PfadWerte): boolean => werte[e.id] === undefined || gleicherWert(werte[e.id], e.vorgabe);

/** Änderungen des Zwischenspeichers verfolgen (z. B. eine App, die einen Wert in ihren Zustand übernimmt); liefert das Abmelden */
export function pfadeAbonnieren(f: () => void): () => void {
  hoerer.add(f);
  void sicherGeladen().catch(() => undefined);
  return () => void hoerer.delete(f);
}

/**
 * Einstellung speichern; `undefined` stellt die Vorgabe wieder her (der Schlüssel entfällt). Schreibt in ihren Bereich
 * (frisch gelesen, nur dieser Wert ersetzt) und meldet die Änderung allen Fenstern.
 */
export async function pfadSpeichern(id: string, wert: PfadWert | undefined): Promise<void> {
  const e = pfadEinstellung(id);
  const neu = typeof wert === 'string' ? wert.trim() : Array.isArray(wert) ? wert.map((x) => x.trim()).filter(Boolean) : wert;
  // gleich der Vorgabe: als Vorgabe speichern – neue Einstellungen folgen so späteren Vorgaben
  const speichern = neu === undefined || (typeof neu === 'string' && !neu && e.pflicht) || gleicherWert(neu, e.vorgabe) ? undefined : neu;
  const gelesen = e.speicher.lesen(objekt(await konfigAendern(e.speicher.bereich, (roh) => e.speicher.schreiben(objekt(roh), speichern))));
  if (e.auch) {
    const { bereich, schluessel } = e.auch;
    await konfigAendern(bereich, (roh) => mitSchluessel(objekt(roh), schluessel, gelesen ?? e.vorgabe));
  }
  laeufe++; // ein laufendes Lesen von vorher übernimmt seinen älteren Stand nicht mehr
  zwischen = { ...zwischen };
  if (gelesen === undefined) delete zwischen[id];
  else zwischen[id] = gelesen;
  melden();
  konfigGeaendertMelden([e.speicher.bereich, ...(e.auch ? [e.auch.bereich] : [])]);
}

/** Wert einer Einstellung im Render – folgt Änderungen (auch aus anderen Fenstern) */
export function usePfadWert(id: string): PfadWert {
  const [, setStand] = useState(0);
  useEffect(() => {
    const f = () => setStand((n) => n + 1);
    hoerer.add(f);
    void sicherGeladen().catch(() => undefined);
    return () => void hoerer.delete(f);
  }, []);
  return gilt(pfadEinstellung(id), zwischen);
}

/** alle gespeicherten Werte im Render (für den Einstellungsdialog); `null`, solange sie gelesen werden */
export function usePfadWerte(): PfadWerte | null {
  const [werte, setWerte] = useState<PfadWerte | null>(null);
  useEffect(() => {
    let aktiv = true;
    const f = () => aktiv && setWerte({ ...zwischen });
    hoerer.add(f);
    void pfadWerteLaden().then(f, () => aktiv && setWerte({}));
    return () => {
      aktiv = false;
      hoerer.delete(f);
    };
  }, []);
  return werte;
}

/** auf jeden Fall: Änderungen anderer Fenster und Wechsel des Speicherorts lesen neu */
for (const b of bereiche()) konfigBeobachten(b, () => void (geladen ? pfadWerteLaden().catch(() => undefined) : undefined));
konfigNeuLesen(() => void (geladen ? pfadWerteLaden().catch(() => undefined) : undefined));

/* ---------- Export in den Berechnungsordner (QUADRIO, TERRIO, NUMIO) ---------- */

export type { ExportApp } from './gemeinsam';

export interface ExportPfade {
  /** Berechnungsordner als Vorlage relativ zum Projektordner */
  berechnungsordner: string;
  /** Dateinamen-Vorlagen ohne Endung */
  dateinameExcel: string;
  dateinamePdf: string;
  /** beim direkten Export das PDF mitspeichern */
  pdfMitspeichern: boolean;
}

/** Export-Einstellungen einer App: gemeinsame Angaben mit ihrer Abweichung (`gemeinsam.ts`) */
const exportAus = (app: ExportApp, w: (id: string) => PfadWert): ExportPfade => {
  const gilt = (g: ExportGruppe) => wirksamAus(g === 'ordner' ? 'unterordner' : 'ersetzt', String(w(gemeinsamId(g))), String(w(abweichungId(g, app))));
  return { berechnungsordner: gilt('ordner'), dateinameExcel: gilt('excel'), dateinamePdf: gilt('pdf'), pdfMitspeichern: w('export.pdfMitspeichern') !== false };
};

/** Export-Einstellungen einer App aus beliebigen Werten (für Tests des Abgleichs mit dem Baum) */
export const exportAusWerten = exportAus;

/** Export-Einstellungen einer App aus dem Zwischenspeicher (sonst Vorgaben) – synchron */
export const exportPfade = (app: ExportApp): ExportPfade => exportAus(app, pfadWert);

/** Export-Einstellungen einer App, frisch gelesen (vor dem Export) */
export async function exportPfadeLaden(app: ExportApp): Promise<ExportPfade> {
  const werte = await pfadWerteLaden();
  return exportAus(app, (id) => gilt(pfadEinstellung(id), werte));
}

/** Pfad relativ zum Projektordner aus einer Vorlage: Platzhalter ersetzt, Teile bereinigt, leere Teile entfallen */
export function relativerPfad(vorlage: string, werte: GlobaleQuelle, lokal: Record<string, string> = {}): string {
  const ersetzt = ersetzen(vorlage, EXPORT_VARIABLEN, { ...globaleWerte(werte), ...lokal }, { saeubern: sichererDateiname });
  return ersetzt
    .split(/[\\/]+/)
    .map((t) => sichererDateiname(t))
    .filter((t) => t && t !== '.' && t !== '..')
    .join('/');
}

/** absoluter Berechnungsordner aus der Vorlage; `null` ohne Projektordner */
export function berechnungsordnerPfad(muster: string, projektordner: string | null, werte: GlobaleQuelle): string | null {
  if (!projektordner) return null;
  const rel = relativerPfad(muster, werte);
  return rel ? verbinde(projektordner, rel) : projektordner;
}

/** Dateiname mit Endung aus einer Vorlage: Platzhalter ersetzt, unzulässige Zeichen bereinigt; nie leer */
export function exportDateinameAusMuster(muster: string, o: { werte: GlobaleQuelle; inhalt: string; endung: 'xlsx' | 'pdf' }): string {
  const name = sichererDateiname(ersetzen(muster, EXPORT_VARIABLEN, { ...globaleWerte(o.werte), Inhalt: o.inhalt }, { saeubern: sichererDateiname }));
  return `${name || sichererDateiname(o.inhalt) || 'Export'}.${o.endung}`;
}

/* ---------- PERMIO: wo Berechnungen als Antragsdokumente gesucht werden ---------- */

/**
 * Vorlagen der Ordner, in denen PERMIO externe Antragsdokumente (Berechnungen, Nachweise) sucht: die Berechnungsordner
 * von QUADRIO, TERRIO und NUMIO und die zusätzlich eingestellten – relativ zum Projektordner, ohne doppelte, Platzhalter
 * noch nicht ersetzt (das geschieht im Projekt, `relativerPfad` mit dessen Angaben).
 */
export function berechnungenSuchvorlagen(w: (id: string) => PfadWert = pfadWert): string[] {
  const extra = w('ablage.permio.berechnungsordner');
  const vorlagen = [...EXPORT_APPS.map((a) => exportAus(a, w).berechnungsordner), ...(Array.isArray(extra) ? extra : [])];
  const out: string[] = [];
  const norm = (v: string) =>
    v
      .replace(/[\\/]+/g, '/')
      .replace(/^\/|\/$/g, '')
      .trim();
  for (const v of vorlagen.map(norm)) if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  return out;
}

/** die Suchordner eines Projekts: die Vorlagen mit dessen Angaben, ohne doppelte */
export function berechnungenSuchordner(werte: GlobaleQuelle = {}, w: (id: string) => PfadWert = pfadWert): string[] {
  const out: string[] = [];
  for (const v of berechnungenSuchvorlagen(w)) {
    const rel = relativerPfad(v, werte);
    if (rel && !out.some((x) => x.toLowerCase() === rel.toLowerCase())) out.push(rel);
  }
  return out;
}
