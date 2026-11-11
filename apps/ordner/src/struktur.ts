/**
 * Struktur: die bürospezifische Konfiguration – Ordnerbaum, Namensschemata, Vorlagen-Presets. Sie gehört
 * nicht ins Tool, sondern in den gemeinsamen Konfigurationsordner (und lässt sich als JSON-Datei weitergeben);
 * die eingebaute Vorgabe ist neutral gehalten. Wo die Projektdatei (.oap) liegt, ist eine Einstellung aller Apps
 * (allgemein.json, siehe @core/platform/konfig).
 */

/** Ort der Projektdatei aus einer älteren Struktur (bis 0.2: „flaechenprojekt“) – zum Übernehmen in die gemeinsamen Einstellungen */
export function alterOapPfad(roh: unknown): string | null {
  const o = roh && typeof roh === 'object' ? (roh as Record<string, unknown>) : {};
  return typeof o.flaechenprojekt === 'string' && o.flaechenprojekt.trim() ? normPfad(o.flaechenprojekt) : null;
}

export interface OrdnerRegel {
  /** Pfad im Projektordner, mit „/“ getrennt */
  pfad: string;
  /** nur anlegen, wenn eine dieser Leistungsphasen beauftragt ist (leer = immer) */
  lph?: number[];
  /** Dateien in diesem Ordner (und darunter) sollen dem Dateinamenschema folgen */
  dateischema?: boolean;
}

/**
 * Zuordnung einer Vorlage: welche Datei (oder welcher Ordner) aus dem Vorlagenordner an welche Stelle im
 * Projekt kommt und wie sie dort heißt.
 */
export interface VorlagenEintrag {
  /** Pfad im Vorlagenordner, mit „/“ getrennt – eine Datei oder ein Ordner (alle Dateien darin); leer = der ganze Vorlagenordner */
  quelle: string;
  /** Zielordner im Projekt (Platzhalter erlaubt); leer = Stamm des Projektordners. Unterordner einer Ordner-Quelle bleiben erhalten. */
  ziel: string;
  /** Dateiname im Projekt, z. B. „{nummer} Kostenschätzung“; leer = Dateinamenschema für Vorlagen. Die Endung kommt von der Vorlage. */
  name?: string;
  /** nur, wenn eine dieser Leistungsphasen beauftragt ist (leer = immer) */
  lph?: number[];
}

/** Zusammenstellung von Vorlagen, die beim Anlegen oder Aktualisieren eines Projekts ergänzt werden */
export interface VorlagenPreset {
  name: string;
  /** bei neuen Projekten vorausgewählt */
  standard?: boolean;
  eintraege: VorlagenEintrag[];
}

export interface Struktur {
  name: string;
  /** Projektnummer, z. B. „{jahr}-{nr:3}“ → 2026-014 */
  nummernschema: string;
  /** Name des Projektordners, z. B. „{nummer} {kurzname}“ */
  ordnername: string;
  /** Dateinamenschema für Pläne, z. B. „{nummer}_{plannummer}_{index}_{titel}“ */
  dateischema: string;
  ordner: OrdnerRegel[];
  /**
   * Dateinamen der Vorlagen im Projekt, z. B. „{nummer} {name}“ ({name} = Name der Vorlage ohne Endung).
   * Gilt nicht für Vorlagen, deren Name selbst Platzhalter enthält, und nicht, wo eine Zuordnung einen Namen vorgibt.
   */
  vorlagenname: string;
  presets: VorlagenPreset[];
}

/** der ganze Vorlagenordner, aufgebaut wie ein Projektordner: jede Datei an denselben Ort */
export const GANZER_VORLAGENORDNER: VorlagenPreset = { name: 'Alle Vorlagen', standard: true, eintraege: [{ quelle: '', ziel: '' }] };

export const STANDARD: Struktur = {
  name: 'Standard',
  nummernschema: '{jahr}-{nr:3}',
  ordnername: '{nummer} {kurzname}',
  dateischema: '{nummer}_{plannummer}_{index}_{titel}',
  ordner: [
    { pfad: '00 Projekt' },
    { pfad: '01 Grundlagen/Bestand' },
    { pfad: '01 Grundlagen/Vermessung' },
    { pfad: '01 Grundlagen/Baugrund' },
    { pfad: '02 Pläne/Entwurf', dateischema: true },
    { pfad: '02 Pläne/Genehmigung', lph: [4], dateischema: true },
    { pfad: '02 Pläne/Ausführung', lph: [5], dateischema: true },
    { pfad: '02 Pläne/Fachplaner' },
    { pfad: '03 Berechnungen/Flächen' },
    { pfad: '03 Berechnungen/Kosten' },
    { pfad: '03 Berechnungen/Nachweise' },
    { pfad: '04 Schriftverkehr/Bauherr' },
    { pfad: '04 Schriftverkehr/Behörden' },
    { pfad: '04 Schriftverkehr/Fachplaner' },
    { pfad: '05 Protokolle' },
    { pfad: '06 Genehmigung', lph: [4] },
    { pfad: '07 Ausschreibung', lph: [6, 7] },
    { pfad: '08 Bauleitung/Mängel', lph: [8] },
    { pfad: '08 Bauleitung/Rechnungen', lph: [8] },
    { pfad: '09 Fotos' },
  ],
  vorlagenname: '{nummer} {name}',
  presets: [GANZER_VORLAGENORDNER],
};

/** Pfad vereinheitlichen: „/“ als Trenner, keine leeren Teile, keine Leerzeichen an den Rändern */
export function normPfad(p: string): string {
  return p
    .split(/[\\/]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .join('/');
}

/** in Datei- und Ordnernamen unzulässige Zeichen (Windows) entfernen; keine Punkte/Leerzeichen am Ende */
export function sichererName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
}

/** „5-8“, „6, 7“ oder „4“ → Leistungsphasen */
export function lphAus(text: string): number[] {
  const out = new Set<number>();
  for (const teil of text.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d)(?:\s*[-–]\s*(\d))?$/.exec(teil);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= 9) out.add(i);
  }
  return [...out].sort();
}

export function lphText(lph: number[]): string {
  // zusammenhängende Phasen als Bereich
  const teile: string[] = [];
  for (let i = 0; i < lph.length; i++) {
    let j = i;
    while (j + 1 < lph.length && lph[j + 1] === lph[j] + 1) j++;
    teile.push(j > i ? `${lph[i]}-${lph[j]}` : String(lph[i]));
    i = j;
  }
  return teile.join(', ');
}

/** Meldung zu einer Zeile der Ordnerliste (Zeilennummer ab 1, wie im Textfeld) */
export interface OrdnerMeldung {
  zeile: number;
  text: string;
}

/** Zeichen, die in Ordnernamen nicht erlaubt sind und beim Lesen entfernt werden („/“ und „\\“ trennen Unterordner) */
const ENTFERNT = /[:*?"<>\u0000-\u001f]/g;

/** „5-8“, „6, 7“ – Teile, die keine Leistungsphase 1–9 ergeben (z. B. „10“) */
function falscheLph(text: string): string[] {
  return text
    .split(/[,;\s]+/)
    .filter(Boolean)
    .filter((teil) => {
      const m = /^(\d)(?:\s*[-–]\s*(\d))?$/.exec(teil);
      return !m || Number(m[1]) < 1 || (m[2] !== undefined && Number(m[2]) < 1);
    });
}

/**
 * Ordnerliste als Text – eine Zeile je Ordner, Zusätze mit „|“:
 *   02 Pläne/Ausführung | LPh 5 | Dateischema
 * Leerzeilen und Zeilen mit „#“ werden übergangen. Liefert neben den Ordnern Meldungen mit Zeilennummer zu allem,
 * was beim Lesen entfällt oder bereinigt wird: doppelte Pfade (nur der erste gilt), Leistungsphasen außerhalb 1–9,
 * entfernte Zeichen, unbekannte Zusätze.
 */
export function ordnerAusTextMitMeldungen(text: string): { ordner: OrdnerRegel[]; meldungen: OrdnerMeldung[] } {
  const out: OrdnerRegel[] = [];
  const meldungen: OrdnerMeldung[] = [];
  const gesehen = new Map<string, number>();
  text.split(/\r?\n/).forEach((zeile, i) => {
    const nr = i + 1;
    if (!zeile.trim() || zeile.trim().startsWith('#')) return;
    const [roh, ...zusaetze] = zeile.split('|');
    const zeichen = [...new Set(roh.match(ENTFERNT) ?? [])].filter((z) => z.trim());
    if (zeichen.length) meldungen.push({ zeile: nr, text: `Zeile ${nr}: Zeichen ${zeichen.join(' ')} ${zeichen.length === 1 ? 'wird' : 'werden'} entfernt.` });
    const pfad = normPfad(roh).split('/').map(sichererName).filter(Boolean).join('/');
    if (!pfad) {
      meldungen.push({ zeile: nr, text: `Zeile ${nr}: kein Ordnername – die Zeile entfällt.` });
      return;
    }
    const frueher = gesehen.get(pfad.toLowerCase());
    if (frueher !== undefined) {
      meldungen.push({ zeile: nr, text: `Zeile ${nr} doppelt zu Zeile ${frueher} – nur die erste gilt.` });
      return;
    }
    gesehen.set(pfad.toLowerCase(), nr);
    const regel: OrdnerRegel = { pfad };
    for (const z of zusaetze.map((x) => x.trim())) {
      if (!z) continue;
      const m = /^lph\.?\s*(.*)$/i.exec(z);
      if (m) {
        const falsch = falscheLph(m[1]);
        if (falsch.length)
          meldungen.push({ zeile: nr, text: `Zeile ${nr}: LPh ${falsch.join(', ')} gibt es nicht (nur 1 bis 9)${lphAus(m[1]).length ? '' : ' – der Ordner wird dann immer angelegt'}.` });
        else if (!m[1].trim()) meldungen.push({ zeile: nr, text: `Zeile ${nr}: „LPh“ ohne Leistungsphase – der Ordner wird immer angelegt.` });
        const lph = lphAus(m[1]);
        if (lph.length) regel.lph = lph;
      } else if (/^dateischema$/i.test(z)) regel.dateischema = true;
      else meldungen.push({ zeile: nr, text: `Zeile ${nr}: unbekannter Zusatz „${z}“ – erlaubt sind „LPh …“ und „Dateischema“.` });
    }
    out.push(regel);
  });
  return { ordner: out, meldungen };
}

/** Ordnerliste als Text lesen (ohne Meldungen, siehe `ordnerAusTextMitMeldungen`) */
export const ordnerAusText = (text: string): OrdnerRegel[] => ordnerAusTextMitMeldungen(text).ordner;

export function ordnerAlsText(ordner: OrdnerRegel[]): string {
  return ordner.map((o) => [o.pfad, o.lph?.length ? `LPh ${lphText(o.lph)}` : '', o.dateischema ? 'Dateischema' : ''].filter(Boolean).join(' | ')).join('\n');
}

const text = (v: unknown, vorgabe: string) => (typeof v === 'string' && v.trim() ? v.trim() : vorgabe);

/** Zielpfad im Projekt bereinigen: „/“ als Trenner, unzulässige Zeichen je Teil entfernt (Platzhalter bleiben) */
export const zielordnerAus = (p: string) => normPfad(p).split('/').map(sichererName).filter(Boolean).join('/');

const lphListe = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 9))].sort() : []);

function eintragAus(x: unknown): VorlagenEintrag | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.quelle !== 'string') return null;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  const lph = lphListe(o.lph);
  return { quelle: normPfad(o.quelle), ziel: typeof o.ziel === 'string' ? zielordnerAus(o.ziel) : '', ...(name ? { name } : {}), ...(lph.length ? { lph } : {}) };
}

/** Presets aus der Konfiguration: ohne Namen oder doppelt benannte entfallen */
export function presetsAus(liste: unknown[]): VorlagenPreset[] {
  const out: VorlagenPreset[] = [];
  const namen = new Set<string>();
  for (const x of liste) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name || namen.has(name.toLowerCase())) continue;
    namen.add(name.toLowerCase());
    const eintraege = (Array.isArray(o.eintraege) ? o.eintraege : []).map(eintragAus).filter((e): e is VorlagenEintrag => !!e);
    out.push({ name, ...(o.standard === true ? { standard: true } : {}), eintraege });
  }
  return out;
}

/** Struktur aus einer Konfigurationsdatei; fehlende Angaben kommen aus der Vorgabe */
export function strukturAusJson(json: string): Struktur {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(json) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Die Konfiguration ist kein gültiges JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Die Konfiguration muss ein JSON-Objekt sein.');
  const liste = Array.isArray(o.ordner) ? o.ordner : null;
  const ordner: OrdnerRegel[] = [];
  for (const x of liste ?? []) {
    if (typeof x === 'string') ordner.push(...ordnerAusText(x));
    else if (x && typeof x === 'object' && typeof (x as OrdnerRegel).pfad === 'string') {
      const r = x as OrdnerRegel;
      const pfad = normPfad(r.pfad).split('/').map(sichererName).filter(Boolean).join('/');
      if (!pfad) continue;
      const lph = Array.isArray(r.lph) ? r.lph.filter((n) => Number.isInteger(n) && n >= 1 && n <= 9) : [];
      ordner.push({ pfad, ...(lph.length ? { lph } : {}), ...(r.dateischema === true ? { dateischema: true } : {}) });
    }
  }
  if (liste && !ordner.length) throw new Error('Die Konfiguration enthält keinen gültigen Ordner.');
  // Konfigurationen ohne Presets (bis Version 0.1.x): der ganze Vorlagenordner wie bisher, Dateinamen unverändert
  const ohnePresets = !Array.isArray(o.presets);
  return {
    name: text(o.name, STANDARD.name),
    nummernschema: text(o.nummernschema, STANDARD.nummernschema),
    ordnername: text(o.ordnername, STANDARD.ordnername),
    dateischema: text(o.dateischema, STANDARD.dateischema),
    ordner: liste ? ordner : STANDARD.ordner,
    vorlagenname: text(o.vorlagenname, ohnePresets ? '{name}' : STANDARD.vorlagenname),
    presets: ohnePresets ? [GANZER_VORLAGENORDNER] : presetsAus(o.presets as unknown[]),
  };
}

export const strukturAlsJson = (s: Struktur) => `${JSON.stringify(s, null, 2)}\n`;

/** Gilt die Regel für ein Projekt mit diesen Leistungsphasen? Ohne Angabe von Phasen gelten alle Ordner. */
export const regelGilt = (r: { lph?: number[] }, lph: number[]) => !r.lph?.length || !lph.length || r.lph.some((p) => lph.includes(p));

/**
 * Presets, die für ein Projekt gelten: die ausgewählten – ohne Auswahl die Standard-Presets der Struktur, außer denen
 * in `nichtAutomatisch` (z. B. „Alle Vorlagen“ bei einem anders gegliederten Vorlagenordner).
 * `unbekannt` sind ausgewählte Namen, die es in der Struktur nicht (mehr) gibt.
 */
export function aktivePresets(struktur: Struktur, auswahl: string[] | undefined, nichtAutomatisch: Iterable<string> = []): { presets: VorlagenPreset[]; unbekannt: string[] } {
  if (!auswahl) {
    const ohne = new Set(nichtAutomatisch);
    return { presets: struktur.presets.filter((p) => p.standard && !ohne.has(p.name)), unbekannt: [] };
  }
  const gewaehlt = new Set(auswahl.map((n) => n.toLowerCase()));
  const presets = struktur.presets.filter((p) => gewaehlt.has(p.name.toLowerCase()));
  const da = new Set(struktur.presets.map((p) => p.name.toLowerCase()));
  return { presets, unbekannt: auswahl.filter((n) => !da.has(n.toLowerCase())) };
}
