import { writeArchive } from '@core/archive';
import type { ProjectMeta, ProjektordnerAngaben } from '@core/model';
import { projektdateiSchreiben } from '@core/platform/projektordner';
import { projektdateiPfad, projektdateiWaehlen, VORGABE_OAP_PFAD } from '@core/projektdatei';
import type { Dateisystem, Eintrag } from './dateisystem';
import { DATUM_MUSTER, nameAus } from './nummer';
import type { ProjektdateiAenderung, Stammdaten } from './stammdaten';
import { alsProject, bereinigt, isoDatum, platzhalter, projektdateiAenderung } from './stammdaten';
import type { Struktur, VorlagenEintrag } from './struktur';
import type { VorlagenPreset } from './struktur';
import { aktivePresets, normPfad, regelGilt, sichererName } from './struktur';
import { ausserhalbDerStruktur } from './pruefung';
import { alsDokument, fuelleVorlage, zielDateiname } from './vorlagen';

/**
 * Plan für einen Projektordner – neu anzulegen oder zu ergänzen: erst zeigen, was passiert (Trockenlauf), dann
 * ausführen. Ordner und Vorlagen werden nur neu angelegt – was es schon gibt, bleibt unverändert und ist im Plan als
 * „vorhanden“ markiert. Die Projektdatei (.oap) wird angelegt, wenn sie fehlt, sonst gezielt ergänzt (geänderte
 * Stammdaten, Presets). Gelöscht wird nichts.
 */

/** Datei im Vorlagenordner */
export interface Vorlage {
  /** Pfad im Vorlagenordner, mit „/“ getrennt */
  pfad: string;
  lies: () => Promise<Uint8Array>;
}

export type Herkunft = 'struktur' | 'vorlage' | 'projektdatei';

export interface Schritt {
  art: 'ordner' | 'datei';
  /** Pfad im Projektordner */
  pfad: string;
  herkunft: Herkunft;
  /** bei Vorlagen: Pfad im Vorlagenordner */
  quelle?: string;
  /** bei Vorlagen: das Preset, aus dem sie kommt */
  preset?: string;
  /** gibt es schon – bleibt unverändert */
  vorhanden: boolean;
  /** vorhanden unter anderem Namen (Datum im Dateinamen) */
  vorhandenAls?: string;
  /** vorhandene Projektdatei: was darin ergänzt bzw. geändert wird */
  aenderung?: ProjektdateiAenderung;
  daten?: () => Promise<Uint8Array>;
}

/** Schritt, der etwas tut: Neues anlegen oder die vorhandene Projektdatei ergänzen */
export const tutEtwas = (s: Schritt) => !s.vorhanden || !!s.aenderung?.teile.length;

export interface Plan {
  /** Name des Projektordners */
  ordner: string;
  schritte: Schritt[];
  /** verhindern das Anlegen (fehlende Angaben) */
  fehler: string[];
  /** halten nicht auf, verdienen aber Aufmerksamkeit (z. B. Vorlagen, die im Vorlagenordner fehlen) */
  warnungen: string[];
  hinweise: string[];
  /** Presets, die angewendet werden */
  presets: string[];
  /** die Projektdatei: neu anzulegen oder vorhanden (mit dem, was darin ergänzt wird) */
  projektdatei: { pfad: string; neu: boolean; teile: string[] };
}

export interface PlanOptionen {
  /** Name eines vorhandenen Projektordners (Ergänzen) – sonst ergibt er sich aus dem Schema */
  ordner?: string;
  /** Jahr, in dem das Projekt angelegt wurde (für {jahr} in Namen) – sonst das laufende */
  jahr?: number;
  /** Ort einer neuen Projektdatei im Projektordner (gemeinsame Einstellung aller Apps) */
  oapPfad?: string;
  /** die vorhandene Projektdatei des Ordners (Ergänzen) – sie wird gezielt ergänzt statt neu angelegt */
  projektdatei?: { pfad: string; meta: ProjectMeta; projektordner?: ProjektordnerAngaben } | null;
}

/** Dateien, die keine Vorlagen sind: Systemdateien, Sperrdateien von Office, die Anleitung im Stamm */
const KEINE_VORLAGE = /(^|\/)(thumbs\.db|desktop\.ini|\.ds_store|~\$[^/]*|\.[^/]*)$/i;
const ANLEITUNG = /^liesmich\.(txt|md)$/i;

/** Werte für Platzhalter in Datei- und Ordnernamen (aus bereinigten Stammdaten) */
export const kurzeWerte = (s: Stammdaten, date: Date, jahr = date.getFullYear()): Record<string, string | number> => ({
  nummer: s.nummer,
  kurzname: s.kurzname,
  vorhaben: s.bezeichnung,
  jahr,
  jj: String(jahr % 100).padStart(2, '0'),
  bearbeiter: s.bearbeiter,
  datum: isoDatum(date),
});

/** steht im Dateinamen für {datum}, um Dateien mit anderem Datum als vorhanden zu erkennen */
const DATUM_PLATZHALTER = '\uE000';
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Zielpfad: Platzhalter ersetzen, jeden Teil für das Dateisystem bereinigen */
function zielPfad(pfad: string, werte: Record<string, string | number>): string {
  return normPfad(pfad)
    .split('/')
    .map((t) => sichererName(nameAus(t, werte)))
    .filter(Boolean)
    .join('/');
}

/** Datei im Vorlagenordner, die als Vorlage in Frage kommt */
export interface VorlagenDatei {
  vorlage: Vorlage;
  /** Pfad im Vorlagenordner, vereinheitlicht */
  pfad: string;
}

/** Dateien des Vorlagenordners ohne System- und Sperrdateien, sortiert */
export function vorlagenDateien(vorlagen: Vorlage[]): VorlagenDatei[] {
  return vorlagen
    .map((vorlage) => ({ vorlage, pfad: normPfad(vorlage.pfad) }))
    .filter((x) => x.pfad && !KEINE_VORLAGE.test(x.pfad))
    .sort((a, b) => a.pfad.localeCompare(b.pfad, 'de', { numeric: true }));
}

export interface VorlagenZiel {
  datei: VorlagenDatei;
  /** Name der Vorlage im Vorlagenordner */
  vorlageName: string;
  /** Pfad im Projekt */
  pfad: string;
  /** Dateiname im Projekt */
  name: string;
  /** mit {datum} im Namen: erkennt dieselbe Datei mit anderem Datum */
  muster?: RegExp;
}

/**
 * Wohin die Dateien einer Zuordnung im Projekt kommen. Eine Datei-Quelle ergibt eine Datei im Zielordner, eine
 * Ordner-Quelle (leer = der ganze Vorlagenordner) alle Dateien darin, mit ihren Unterordnern; eine Anleitung
 * (LIESMICH.txt) direkt im Quellordner nicht. Leer, wenn es die Quelle im Vorlagenordner nicht gibt.
 */
export function zuordnungAufloesen(e: VorlagenEintrag, dateien: VorlagenDatei[], vorlagenname: string, werte: Record<string, string | number>): VorlagenZiel[] {
  const q = normPfad(e.quelle);
  const ql = q.toLowerCase();
  const exakt = q ? dateien.filter((x) => x.pfad.toLowerCase() === ql) : [];
  const treffer = exakt.length
    ? exakt.map((datei) => ({ datei, rel: datei.pfad.split('/').pop()! }))
    : dateien
        .filter((x) => !q || x.pfad.toLowerCase().startsWith(`${ql}/`))
        .map((datei) => ({ datei, rel: q ? datei.pfad.slice(q.length + 1) : datei.pfad }))
        .filter((x) => !ANLEITUNG.test(x.rel));
  const datumWerte = { ...werte, datum: DATUM_PLATZHALTER };
  const out: VorlagenZiel[] = [];
  for (const { datei, rel } of treffer) {
    const teile = rel.split('/');
    const vorlageName = teile.pop()!;
    const ordner = [e.ziel, ...teile].join('/');
    const name = zielDateiname(vorlageName, e.name, vorlagenname, werte);
    if (!name) continue;
    const zielOrdner = zielPfad(ordner, werte);
    const pfad = zielOrdner ? `${zielOrdner}/${name}` : name;
    const mitPlatzhalter = [zielPfad(ordner, datumWerte), zielDateiname(vorlageName, e.name, vorlagenname, datumWerte)].filter(Boolean).join('/');
    const muster = mitPlatzhalter.includes(DATUM_PLATZHALTER) ? new RegExp(`^${escapeRe(mitPlatzhalter.toLowerCase()).split(DATUM_PLATZHALTER).join(DATUM_MUSTER)}$`) : undefined;
    out.push({ datei, vorlageName, pfad, name, ...(muster ? { muster } : {}) });
  }
  return out;
}

/** Dateien im Vorlagenordner ohne die Anleitung im Stamm (LIESMICH.txt) – sie wird nie kopiert und zählt nicht mit */
export const vorlagenAnzahl = (vorlagen: Vorlage[]) => vorlagenDateien(vorlagen).filter((d) => !ANLEITUNG.test(d.pfad)).length;

/** Wo die Vorlagen eines Presets außerhalb der Struktur landen: zusätzliche Ordner und lose Dateien im Projektstamm */
export interface PresetAbweichung {
  fremd: string[];
  lose: string[];
  /** Dateien des Presets insgesamt und davon außerhalb der Struktur (in fremden Ordnern oder lose im Stamm) */
  dateien: number;
  ausserhalb: number;
}

/**
 * Prüft ein Preset mit den Regeln des Prüfmodus: Welche Ordner entstehen außerhalb der Struktur, welche Dateien liegen
 * danach lose im Projektstamm? Leistungsphasen bleiben außer Acht (das Preset als Ganzes).
 */
export function presetPruefen(preset: VorlagenPreset, dateien: VorlagenDatei[], struktur: Struktur, werte: Record<string, string | number>): PresetAbweichung {
  const pfade = new Map<string, boolean>();
  for (const e of preset.eintraege)
    for (const z of zuordnungAufloesen(e, dateien, struktur.vorlagenname, werte)) {
      const teile = z.pfad.split('/');
      for (let i = 1; i < teile.length; i++) pfade.set(teile.slice(0, i).join('/'), true);
      pfade.set(z.pfad, false);
    }
  const { fremd, lose } = ausserhalbDerStruktur(
    struktur,
    [...pfade].map(([pfad, ordner]) => ({ pfad, ordner })),
    werte,
  );
  const dateienPfade = [...pfade].filter(([, ordner]) => !ordner).map(([pfad]) => pfad.toLowerCase());
  const weg = fremd.map((f) => `${f.toLowerCase()}/`);
  const ausserhalb = dateienPfade.filter((d) => !d.includes('/') ? lose.some((l) => l.toLowerCase() === d) : weg.some((w) => d.startsWith(w))).length;
  return { fremd, lose, dateien: dateienPfade.length, ausserhalb };
}

/**
 * Standard-Presets mit dem ganzen Vorlagenordner („Alle Vorlagen“), die bei neuen Projekten NICHT vorausgewählt
 * werden, weil der Vorlagenordner anders gegliedert ist als die Struktur (etwa nach Dateiart: Word/, Excel/): Mehr als
 * die Hälfte der Vorlagen landete außerhalb der Struktur. Mit den Abweichungen für den Hinweis. Ohne Vorlagen gibt es
 * nichts zu prüfen.
 */
export function nichtVorausgewaehlt(struktur: Struktur, vorlagen: Vorlage[], date = new Date()): Map<string, PresetAbweichung> {
  const out = new Map<string, PresetAbweichung>();
  const dateien = vorlagenDateien(vorlagen);
  if (!dateien.length) return out;
  const werte = { nummer: 'X', kurzname: 'X', jahr: date.getFullYear(), bearbeiter: '', datum: isoDatum(date) };
  for (const p of struktur.presets) {
    if (!p.standard || !p.eintraege.some((e) => !normPfad(e.quelle))) continue;
    const a = presetPruefen(p, dateien, struktur, werte);
    if (a.ausserhalb * 2 > a.dateien) out.set(p.name, a);
  }
  return out;
}

export function ordnerName(stamm: Stammdaten, struktur: Struktur, date = new Date(), jahr?: number): string {
  const s = bereinigt(stamm);
  return sichererName(nameAus(struktur.ordnername, kurzeWerte(s, date, jahr)));
}

/**
 * Stellt den Plan auf. `vorhandene` sind die Einträge, die es im Projektordner schon gibt (leer, wenn der
 * Ordner neu ist). Vorlagen kommen über die Presets: die in den Stammdaten gewählten, ohne Auswahl die
 * Standard-Presets der Struktur.
 */
export function planen(stamm: Stammdaten, struktur: Struktur, vorlagen: Vorlage[], vorhandene: Eintrag[] = [], date = new Date(), optionen: PlanOptionen = {}): Plan {
  const s = bereinigt(stamm);
  const werte = kurzeWerte(s, date, optionen.jahr);
  const ordner = optionen.ordner ?? ordnerName(s, struktur, date, optionen.jahr);
  const fehler: string[] = [];
  const warnungen: string[] = [];
  const hinweise: string[] = [];
  if (!s.nummer) fehler.push('Die Projektnummer fehlt.');
  if (!s.kurzname) fehler.push('Der Kurzname fehlt.');
  // folgt aus fehlender Nummer bzw. Kurzname – dann nicht noch einmal melden
  if (!ordner && s.nummer && s.kurzname) fehler.push('Aus dem Schema für den Ordnernamen ergibt sich kein Name.');
  if (optionen.ordner === undefined && /\{[^}]*\}/.test(ordner)) fehler.push(`Der Ordnername enthält einen unbekannten Platzhalter: ${ordner}`);

  const da = new Map(vorhandene.map((e) => [e.pfad.toLowerCase(), e]));
  const vorhandeneDateien = vorhandene.filter((e) => !e.ordner);
  const schritte = new Map<string, Schritt>();
  const ordnerSchritt = (pfad: string, herkunft: Herkunft) => {
    // Zwischenordner mit aufnehmen, damit der Plan vollständig zeigt, was entsteht
    const teile = pfad.split('/');
    for (let i = 1; i <= teile.length; i++) {
      const p = teile.slice(0, i).join('/');
      const k = p.toLowerCase();
      if (!schritte.has(k)) schritte.set(k, { art: 'ordner', pfad: p, herkunft, vorhanden: da.get(k)?.ordner === true });
    }
  };

  const ausgeschlossen: string[] = [];
  for (const r of struktur.ordner) {
    const pfad = zielPfad(r.pfad, werte);
    if (!pfad) continue;
    if (regelGilt(r, s.leistungsphasen)) ordnerSchritt(pfad, 'struktur');
    else ausgeschlossen.push(pfad.toLowerCase());
  }
  if (ausgeschlossen.length) hinweise.push(`${ausgeschlossen.length} Ordner gehören zu nicht beauftragten Leistungsphasen und werden nicht angelegt.`);
  // Ein übergeordneter Ordner entfällt mit, wenn die Struktur darunter nur ausgeschlossene Ordner kennt
  // (z. B. „08 Bauleitung“, wenn alle Unterordner an LPh 8 hängen) – sonst kämen Vorlagen darin trotzdem an.
  for (const a of [...ausgeschlossen]) {
    const teile = a.split('/');
    for (let i = 1; i < teile.length; i++) {
      const eltern = teile.slice(0, i).join('/');
      if (!schritte.has(eltern) && !ausgeschlossen.includes(eltern)) ausgeschlossen.push(eltern);
    }
  }

  const { presets, unbekannt } = aktivePresets(struktur, s.presets, nichtVorausgewaehlt(struktur, vorlagen, date).keys());
  for (const n of unbekannt) warnungen.push(`Das Preset „${n}“ gibt es in der Struktur „${struktur.name}“ nicht – es wird übergangen.`);

  const ctx = platzhalter(s, ordner, date);
  const datei = (pfad: string, herkunft: Herkunft, daten: () => Promise<Uint8Array>, extra: Partial<Schritt> = {}, muster?: RegExp) => {
    const k = pfad.toLowerCase();
    const frueher = schritte.get(k);
    if (frueher) {
      // dieselbe Vorlage aus zwei Presets ist kein Widerspruch
      if (!(extra.quelle && frueher.quelle === extra.quelle)) hinweise.push(`„${pfad}“ ergibt sich mehrfach – nur die erste Quelle wird verwendet.`);
      return;
    }
    const eltern = pfad.split('/').slice(0, -1).join('/');
    if (eltern) ordnerSchritt(eltern, herkunft);
    // mit Datum im Namen: eine Datei mit anderem Datum gilt als vorhanden
    const als = da.has(k) ? undefined : muster && vorhandeneDateien.find((e) => muster.test(e.pfad.toLowerCase()))?.pfad;
    schritte.set(k, { art: 'datei', pfad, herkunft, ...extra, vorhanden: da.has(k) || !!als, ...(als ? { vorhandenAls: als } : {}), daten });
  };

  // Projektdatei (.oap): jedes Projekt hat eine. Fehlt sie, wird sie angelegt – mit den Stammdaten, der Struktur
  // und den gewählten Presets; sonst werden darin nur geänderte Stammdaten und die Presets ergänzt.
  const presetNamen = presets.map((p) => p.name);
  const geladen = optionen.projektdatei ?? null;
  const schonDa = geladen ? null : projektdateiWaehlen(vorhandene);
  let projektdatei: Plan['projektdatei'];
  if (geladen) {
    const aenderung = projektdateiAenderung(geladen, s, { struktur, presets: presetNamen });
    const eltern = geladen.pfad.split('/').slice(0, -1).join('/');
    if (eltern) ordnerSchritt(eltern, 'projektdatei');
    schritte.set(geladen.pfad.toLowerCase(), { art: 'datei', pfad: geladen.pfad, herkunft: 'projektdatei', vorhanden: true, aenderung });
    projektdatei = { pfad: geladen.pfad, neu: false, teile: aenderung.teile };
  } else if (schonDa) {
    // vorhanden, aber nicht geladen (z. B. im Browser nicht lesbar): bleibt unverändert
    datei(schonDa.pfad, 'projektdatei', async () => new Uint8Array());
    projektdatei = { pfad: schonDa.pfad, neu: false, teile: [] };
  } else {
    const pfad = projektdateiPfad(optionen.oapPfad ?? VORGABE_OAP_PFAD, { nummer: s.nummer, kurzname: s.kurzname, vorhaben: s.bezeichnung, jahr: werte.jahr, datum: date });
    datei(pfad, 'projektdatei', async () => writeArchive(alsProject(s, { struktur, presets: presetNamen, date }), { app: `Projektordner ${__APP_VERSION__}`, date }));
    projektdatei = { pfad, neu: true, teile: [] };
  }

  // Vorlagen aus den Presets
  const ausgeschlossenerOrdner = (pfad: string) => ausgeschlossen.some((a) => pfad.toLowerCase() === a || pfad.toLowerCase().startsWith(`${a}/`));
  const dateien = vorlagenDateien(vorlagen);
  let uebersprungen = 0;
  let nachLph = 0;
  for (const preset of presets) {
    for (const e of preset.eintraege) {
      if (!regelGilt(e, s.leistungsphasen)) {
        nachLph++;
        continue;
      }
      const ziele = zuordnungAufloesen(e, dateien, struktur.vorlagenname, werte);
      if (!ziele.length) {
        // ohne Vorlagenordner gibt es nichts zu bemängeln
        if (vorlagen.length) warnungen.push(`Preset „${preset.name}“: ${e.quelle ? `„${e.quelle}“ gibt es im Vorlagenordner nicht` : 'der Vorlagenordner enthält keine Vorlagen'}.`);
        continue;
      }
      for (const z of ziele) {
        // Vorlagen in Ordnern nicht beauftragter Leistungsphasen bleiben weg
        if (ausgeschlossenerOrdner(z.pfad)) {
          uebersprungen++;
          continue;
        }
        datei(z.pfad, 'vorlage', async () => fuelleVorlage(z.name, alsDokument(z.vorlageName, await z.datei.vorlage.lies()), ctx), { quelle: z.datei.pfad, preset: preset.name }, z.muster);
      }
    }
  }
  if (uebersprungen) hinweise.push(`${uebersprungen} ${uebersprungen === 1 ? 'Vorlage liegt' : 'Vorlagen liegen'} in Ordnern nicht beauftragter Leistungsphasen und ${uebersprungen === 1 ? 'wird' : 'werden'} nicht kopiert.`);
  if (nachLph) hinweise.push(`${nachLph} ${nachLph === 1 ? 'Zuordnung gehört' : 'Zuordnungen gehören'} zu nicht beauftragten Leistungsphasen und ${nachLph === 1 ? 'entfällt' : 'entfallen'}.`);

  const liste = [...schritte.values()];
  const vorhanden = liste.filter((x) => x.vorhanden).length;
  if (vorhanden) hinweise.push(`${vorhanden} ${vorhanden === 1 ? 'Eintrag ist' : 'Einträge sind'} schon vorhanden und ${vorhanden === 1 ? 'bleibt' : 'bleiben'} unverändert.`);

  // als Baum: jeder Ordner vor seinem Inhalt, Dateien im Stamm zuletzt
  const schluessel = (x: Schritt) => (x.art === 'datei' && !x.pfad.includes('/') ? `￿${x.pfad}` : x.pfad);
  liste.sort((a, b) => schluessel(a).localeCompare(schluessel(b), 'de', { numeric: true }));
  return { ordner, schritte: liste, fehler, warnungen, hinweise, presets: presetNamen, projektdatei };
}

/** Plan ohne die abgewählten Einträge – mit einem Ordner entfällt alles darin */
export function ohne(plan: Plan, abgewaehlt: Iterable<string>): Plan {
  const weg = [...abgewaehlt].map((p) => p.toLowerCase());
  if (!weg.length) return plan;
  const entfaellt = (pfad: string) => weg.some((w) => pfad.toLowerCase() === w || pfad.toLowerCase().startsWith(`${w}/`));
  return { ...plan, schritte: plan.schritte.filter((x) => !entfaellt(x.pfad)) };
}

export interface Ergebnis {
  schritt: Schritt;
  /** angelegt = neu, ergaenzt = vorhandene Projektdatei geändert, vorhanden = unverändert gelassen */
  status: 'angelegt' | 'ergaenzt' | 'vorhanden' | 'fehler';
  meldung?: string;
}

export interface AusfuehrenOptionen {
  fortschritt?: (fertig: number, gesamt: number) => void;
  /** `root` ist der Projektordner selbst (Aktualisieren) – sonst der Stammordner, in dem er entsteht */
  imProjektordner?: boolean;
}

/**
 * Führt den Plan unter `root` aus: im Stammordner (der Projektordner entsteht darin) oder – beim Aktualisieren –
 * im Projektordner selbst. Vorhandenes bleibt unverändert; ausgeführt werden nur die Schritte, die im Plan noch
 * fehlen. Fehler einzelner Schritte halten die übrigen nicht auf; jeder Schritt meldet, ob er angelegt hat oder
 * das Ziel schon vorhanden war.
 */
export async function ausfuehren(fs: Dateisystem, root: string, plan: Plan, optionen: AusfuehrenOptionen = {}): Promise<Ergebnis[]> {
  if (plan.fehler.length) throw new Error(plan.fehler.join(' '));
  const out: Ergebnis[] = [];
  for (const [i, schritt] of plan.schritte.entries()) {
    const pfad = optionen.imProjektordner ? schritt.pfad : `${plan.ordner}/${schritt.pfad}`;
    try {
      if (schritt.aenderung) {
        // vorhandene Projektdatei: frisch lesen, nur die Änderungen eintragen
        const geschrieben = schritt.aenderung.teile.length ? await projektdateiSchreiben(fs, root, pfad, schritt.aenderung.aendern) : false;
        out.push({ schritt, status: geschrieben ? 'ergaenzt' : 'vorhanden' });
      } else {
        // eine Datei mit anderem Datum im Namen gilt als vorhanden – nicht noch einmal anlegen
        const neu = schritt.vorhandenAls ? false : schritt.art === 'ordner' ? await fs.ordnerAnlegen(root, pfad) : await fs.dateiAnlegen(root, pfad, await schritt.daten!());
        out.push({ schritt, status: neu ? 'angelegt' : 'vorhanden' });
      }
    } catch (e) {
      out.push({ schritt, status: 'fehler', meldung: e instanceof Error ? e.message : String(e) });
    }
    optionen.fortschritt?.(i + 1, plan.schritte.length);
  }
  return out;
}

/** Vorlagen aus einem Vorlagenordner */
export async function ladeVorlagen(fs: Dateisystem, ordner: string): Promise<Vorlage[]> {
  const eintraege = await fs.liste(ordner, 12);
  return eintraege.filter((e) => !e.ordner).map((e) => ({ pfad: e.pfad, lies: () => fs.lies(ordner, e.pfad) }));
}
