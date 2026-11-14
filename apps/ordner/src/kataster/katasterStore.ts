/**
 * Katasterpläne in ATLAS (Projektordner): Einstellungen (QGIS-Vorlage, Pläne, Ablage, Dateiname – für alle im Büro im
 * gemeinsamen Konfigurationsordner, Bereich „kataster“), der Pfad zu qgis_process (je Rechner) und der Export für ein
 * Projekt: Koordinaten und Kopfangaben aus der Projektdatei (.oap), die QGIS-Vorlage des Projekts ebenfalls dort.
 *
 * Früher Teil von PERMIO (Formulare) – dessen Einstellungen (Bereich „formulare“, Eintrag „kataster“) werden beim ersten Laden
 * übernommen.
 */

import { create } from 'zustand';
import { artDerFassung } from '@core/fassung';
import { openFileWithPath } from '@core/platform/files';
import { konfigAendern, konfigLesen, konfigNeuLesen } from '@core/platform/konfig';
import { logger } from '@core/platform/log';
import type { GeladeneProjektdatei, ProjektordnerZugriff } from '@core/platform/projektordner';
import { projektdateiDateiSetzen, projektdateiLaden, tauriProjektordner, verbinde } from '@core/platform/projektordner';
import { fragen } from '@core/ui/Rueckfrage';
import type { KatasterEinstellungen, KatasterPlan, PlanArt, VorlageInfo } from './kataster';
import {
  auftragBauen,
  ergebnisseLesen,
  fehlerAuszug,
  katasterAus,
  katasterZielpfad,
  neueKennung,
  planBeschriftung,
  planDateiname,
  planFehler,
  VORGABE_KATASTER,
  vorlageLesen,
  type Namensteile,
} from './kataster';
import type { QgisZugriff } from './qgis';
import { tauriQgis } from './qgis';
import skript from './katasterexport.py?raw';

const log = logger('kataster');

/** Bereich im gemeinsamen Konfigurationsordner */
export const KATASTER_BEREICH = 'kataster';
/** Pfad zu qgis_process: je Rechner (nicht gemeinsam – die Installation unterscheidet sich) */
const PROGRAMM = 'projektordner:qgis-programm';
/** früher in PERMIO */
const PROGRAMM_ALT = 'formulare:qgis-programm';
/** Ordner der Anträge im Projektordner (wie in PERMIO vorgegeben) */
export const ANTRAGSORDNER = 'TÖB';

function programmLesen(): string {
  try {
    return localStorage.getItem(PROGRAMM) ?? localStorage.getItem(PROGRAMM_ALT) ?? '';
  } catch {
    return '';
  }
}

const fehlertext = (e: unknown) => (e instanceof Error ? e.message : String(e));
const heute = () => new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Ergebnis je Plan nach dem Export */
export interface PlanAusgang {
  id: string;
  name: string;
  ok: boolean;
  /** relativer Pfad im Projektordner */
  datei?: string;
  fehler?: string;
}

/** QGIS-Vorlage in der Projektdatei (.oap) */
export interface ProjektVorlage {
  name: string;
  datum: string;
  daten: Uint8Array;
}

/** Das Projekt, für das exportiert wird */
export interface KatasterProjekt {
  /** Projektordner (vollständiger Pfad) */
  basis: string;
  name: string;
  /** Projektdatei; null = keine gefunden */
  oap: GeladeneProjektdatei | null;
}

export interface KatasterState {
  /** Zugriff auf die Projektordner und QGIS (Tests: im Speicher) */
  fs: ProjektordnerZugriff;
  qgis: QgisZugriff;
  einstellungen: KatasterEinstellungen;
  programm: string;
  /** globale Vorlage, ausgelesen (Layouts, Themen) */
  vorlageInfo: { pfad: string; info: VorlageInfo | null; fehler: string | null } | null;
  /** Projekt des Exports (Dialog offen) */
  projekt: KatasterProjekt | null;
  /** laufender Export */
  laeuft: boolean;
  /** letztes Ergebnis */
  ausgang: { plaene: PlanAusgang[]; meldung: string | null } | null;

  laden: () => Promise<void>;
  aendern: (patch: Partial<KatasterEinstellungen>) => Promise<void>;
  planAendern: (id: string, patch: Partial<KatasterPlan>) => Promise<void>;
  planHinzufuegen: (art: PlanArt) => Promise<void>;
  planEntfernen: (id: string) => Promise<void>;
  planVerschieben: (id: string, richtung: -1 | 1) => Promise<void>;
  vorgabenWiederherstellen: () => Promise<void>;
  programmSetzen: (pfad: string) => void;
  programmSuchen: () => Promise<string[]>;
  vorlageWaehlen: () => Promise<void>;
  vorlageInfoLaden: () => Promise<void>;
  /** Projekt für den Export wählen: Projektdatei lesen; null schließt. Nur der letzte Aufruf zählt – ein spätes Ergebnis eines früheren (nach dem Schließen bzw. einem anderen Projekt) wird verworfen */
  projektWaehlen: (basis: string | null, name?: string) => Promise<void>;
  /** QGIS-Vorlage der Projektdatei (oder null) */
  projektVorlage: () => ProjektVorlage | null;
  /** Vorlage der Projektdatei durch die globale ersetzen (bzw. erstmals hineinlegen) */
  projektVorlageAktualisieren: () => Promise<boolean>;
  /** Ausgelesene Vorlage der Projektdatei */
  projektVorlageInfo: () => VorlageInfo | null;
  /** Zielordner relativ zum Projektordner; null = kein aktiver Antrag für die Ablage „Antrag“ */
  zielOrdner: () => string | null;
  /** Werte der Variablen in Dateiname und Ablageordner (Projektdatei, aktiver Antrag, heute) */
  namensteile: () => Namensteile;
  /** Pläne exportieren; liefert das Ergebnis je Plan (leer bei Abbruch) */
  exportieren: (ids: string[]) => Promise<PlanAusgang[]>;
  ausgangSchliessen: () => void;
}

/** ausgelesene Vorlagen je Inhalt (Projektdatei) */
const infoCache = new WeakMap<Uint8Array, VorlageInfo | null>();

export const useKataster = create<KatasterState>()((set, get) => {
  /** Laufkennung von projektWaehlen: jeder Aufruf (auch null) macht frühere, noch lesende ungültig */
  let projektLauf = 0;
  const speichern = async (e: KatasterEinstellungen) => {
    set({ einstellungen: e });
    try {
      await konfigAendern(KATASTER_BEREICH, (roh) => ({ ...((roh ?? {}) as Record<string, unknown>), ...e }));
    } catch (err) {
      log.warn(`Einstellungen der Katasterpläne nicht geschrieben: ${fehlertext(err)}`);
    }
  };
  const plaeneSetzen = (f: (p: KatasterPlan[]) => KatasterPlan[]) => speichern({ ...get().einstellungen, plaene: f(get().einstellungen.plaene) });
  const fehlschlag = (text: string): PlanAusgang[] => {
    set({ ausgang: { plaene: [], meldung: text } });
    return [];
  };

  /** der eigentliche Export – `exportieren` sperrt vorher (gegen Doppelklick) und gibt die Sperre am Ende frei */
  const exportLauf = async (ids: string[]): Promise<PlanAusgang[]> => {
    const { fs, qgis, projekt } = get();
    if (!projekt) return [];
    const { basis, oap } = projekt;
    if (!oap) return fehlschlag('Keine Projektdatei (.oap) im Projektordner – dort stehen Koordinaten und QGIS-Vorlage des Projekts.');
    const meta = oap.projekt.meta;
    if (!meta.koordinaten) return fehlschlag('Für das Projekt sind keine Koordinaten gespeichert – bitte die Projektadresse in den Stammdaten speichern (die Koordinaten werden dabei abgefragt).');
    const programm = get().programm;
    if (!programm) return fehlschlag('Pfad zu qgis_process fehlt – bitte unter „Einrichtung“ → „Katasterpläne“ wählen oder suchen lassen.');
    const plaene = get().einstellungen.plaene.filter((p) => ids.includes(p.id));
    if (!plaene.length) return fehlschlag('Bitte mindestens einen Plan wählen.');
    const ordner = get().zielOrdner();
    if (ordner === null) return fehlschlag('In der Projektdatei steht kein aktiver Antrag – bitte unter „Einrichtung“ → „Katasterpläne“ einen festen Ordner für die Ablage wählen.');

    // Vorlage: die der Projektdatei; beim ersten Export die globale übernehmen
    if (!get().projektVorlage() && !(await get().projektVorlageAktualisieren())) return [];
    const vorlage = get().projektVorlage();
    if (!vorlage) return fehlschlag('Die QGIS-Vorlage der Projektdatei ist nicht lesbar.');
    const info = get().projektVorlageInfo();
    const falsch = plaene.flatMap((p) => planFehler(p, info).map((t) => `${p.name}: ${t}`));
    if (falsch.length) return fehlschlag(`Pläne passen nicht zur QGIS-Vorlage des Projekts: ${falsch.join(' ')}`);

    const teile = get().namensteile();
    const relativ = new Map(plaene.map((p) => [p.id, `${ordner ? `${ordner}/` : ''}${planDateiname(get().einstellungen.dateiname, p, teile)}`]));

    // zwei Pläne mit demselben Dateinamen (etwa ohne {Name} im Dateinamen): vorher melden statt nach dem Rechnen scheitern
    const gleich = new Map<string, KatasterPlan[]>();
    for (const p of plaene) {
      const k = relativ.get(p.id)!.toLowerCase();
      gleich.set(k, [...(gleich.get(k) ?? []), p]);
    }
    const doppelt = [...gleich.values()].filter((ps) => ps.length > 1);
    if (doppelt.length)
      return fehlschlag(
        `Mehrere Pläne bekämen denselben Dateinamen: ${doppelt.map((ps) => `„${relativ.get(ps[0].id)!.split('/').pop()}“ (${ps.map((p) => p.name).join(', ')})`).join('; ')}. Bitte {Name} in den Dateinamen der Einstellungen aufnehmen oder nur einen dieser Pläne wählen.`,
      );

    // Vorhandene Dateien: überspringen oder mit neuem Namen ablegen – im Projektordner wird nichts überschrieben
    const da = async (rel: string) => !!(await fs.liesMitStand(basis, rel).catch(() => null));
    const vorhanden: KatasterPlan[] = [];
    for (const p of plaene) if (await da(relativ.get(p.id)!)) vorhanden.push(p);
    let auswahl = plaene;
    if (vorhanden.length) {
      const antwort = await fragen({
        titel: `${vorhanden.length === 1 ? 'Eine Datei gibt' : `${vorhanden.length} Dateien gibt`} es schon`,
        text: `${vorhanden.map((p) => relativ.get(p.id)).join('\n')}\n\nVorhandene Dateien werden nicht überschrieben.`,
        knoepfe: [
          { id: 'abbrechen', label: 'Abbrechen' },
          { id: 'ueberspringen', label: 'Vorhandene überspringen' },
          { id: 'neu', label: 'Mit neuem Namen ablegen', art: 'primary' },
        ],
      });
      if (antwort === 'ueberspringen') auswahl = plaene.filter((p) => !vorhanden.includes(p));
      else if (antwort === 'neu') {
        // Namen, die schon ein Plan dieses Laufs bekommt, sind ebenfalls belegt
        const belegt = new Set([...relativ.values()].map((r) => r.toLowerCase()));
        for (const p of vorhanden) {
          const alt = relativ.get(p.id)!;
          const punkt = alt.lastIndexOf('.');
          for (let i = 2; ; i++) {
            const kandidat = `${alt.slice(0, punkt)} (${i})${alt.slice(punkt)}`;
            if (!belegt.has(kandidat.toLowerCase()) && !(await da(kandidat))) {
              relativ.set(p.id, kandidat);
              belegt.add(kandidat.toLowerCase());
              break;
            }
          }
        }
      } else return [];
      if (!auswahl.length) return [];
    }

    const kopf = { titel: meta.vorhaben?.trim() || oap.projekt.name, kennung: teile.kuerzel, strasse: meta.adresse?.strasse ?? '', ort: meta.adresse?.ort ?? '', plz: meta.adresse?.plz ?? '' };
    const mitBeschriftung = auswahl.map((p) => ({ ...p, beschriftung: planBeschriftung(p.beschriftung, p, teile) }));
    const auftrag = auftragBauen(mitBeschriftung, meta.koordinaten, kopf, (p) => verbinde(basis, relativ.get(p.id)!));
    set({ ausgang: null });
    let ausgang: PlanAusgang[] = [];
    let meldungText: string | null = null;
    try {
      log.info(`${projekt.name}: Katasterpläne ${auswahl.map((p) => p.name).join(', ')} mit ${programm}`);
      const r = await qgis.ausfuehren({ programm, skript, auftrag, vorlage: vorlage.daten, vorlageName: vorlage.name });
      const ergebnisse = ergebnisseLesen(r.ausgabe);
      ausgang = auswahl.map((p) => {
        const e = ergebnisse.find((x) => x.id === p.id);
        const abgelegt = r.abgelegt.find((x) => x.id === p.id);
        if (e?.ok && abgelegt?.datei) return { id: p.id, name: p.name, ok: true, datei: relativ.get(p.id) };
        return { id: p.id, name: p.name, ok: false, fehler: abgelegt?.fehler ?? e?.fehler ?? 'QGIS hat den Plan nicht erzeugt' };
      });
      if (!ergebnisse.length) meldungText = `QGIS ist ohne Ergebnis beendet (Code ${r.code}).${fehlerAuszug(r.fehler, r.ausgabe) ? `\n${fehlerAuszug(r.fehler, r.ausgabe)}` : ''}`;
      for (const x of ausgang) {
        if (x.ok) log.info(`${x.name}: ${x.datei}`);
        else log.warn(`${x.name}: ${x.fehler}`);
      }
    } catch (e) {
      meldungText = `QGIS konnte nicht gestartet werden: ${fehlertext(e)}`;
      ausgang = auswahl.map((p) => ({ id: p.id, name: p.name, ok: false, fehler: 'nicht ausgeführt' }));
    }
    set({ ausgang: { plaene: ausgang, meldung: meldungText } });
    return ausgang;
  };

  return {
    fs: tauriProjektordner,
    qgis: tauriQgis,
    einstellungen: structuredClone(VORGABE_KATASTER),
    programm: programmLesen(),
    vorlageInfo: null,
    projekt: null,
    laeuft: false,
    ausgang: null,

    laden: async () => {
      try {
        let roh = await konfigLesen(KATASTER_BEREICH);
        if (!roh) {
          // früher in PERMIO: einmalig übernehmen
          const alt = (((await konfigLesen('formulare')) ?? {}) as Record<string, unknown>).kataster;
          if (alt) {
            roh = alt;
            await konfigAendern(KATASTER_BEREICH, () => alt as Record<string, unknown>);
            log.info('Einstellungen der Katasterpläne aus PERMIO (Formulare) übernommen');
          }
        }
        set({ einstellungen: katasterAus(roh) });
      } catch (e) {
        log.warn(`Einstellungen der Katasterpläne nicht lesbar: ${fehlertext(e)}`);
      }
      await get().vorlageInfoLaden();
    },
    aendern: async (patch) => {
      await speichern({ ...get().einstellungen, ...patch });
      if ('vorlage' in patch) await get().vorlageInfoLaden();
    },
    planAendern: (id, patch) => plaeneSetzen((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p))),
    planHinzufuegen: (art) =>
      plaeneSetzen((ps) => [
        ...ps,
        {
          id: neueKennung(ps),
          name: art === 'pdf' ? 'Neuer Plan' : 'Neue DXF',
          art,
          aktiv: true,
          layout: '',
          karte: '',
          thema: '',
          massstab: 1000,
          ...(art === 'dxf' ? { breite: 200, hoehe: 200 } : {}),
          dpi: 300,
          stil: 'symbollayer',
          beschriftungen: art === 'pdf',
          beschriftung: '',
        },
      ]),
    planEntfernen: (id) => plaeneSetzen((ps) => ps.filter((p) => p.id !== id)),
    planVerschieben: (id, richtung) =>
      plaeneSetzen((ps) => {
        const i = ps.findIndex((p) => p.id === id);
        const j = i + richtung;
        if (i < 0 || j < 0 || j >= ps.length) return ps;
        const neu = [...ps];
        [neu[i], neu[j]] = [neu[j], neu[i]];
        return neu;
      }),
    vorgabenWiederherstellen: () => plaeneSetzen(() => structuredClone(VORGABE_KATASTER.plaene)),
    programmSetzen: (pfad) => {
      set({ programm: pfad.trim() });
      try {
        localStorage.setItem(PROGRAMM, pfad.trim());
      } catch {
        /* ohne Speicher: gilt bis zum Schließen */
      }
    },
    programmSuchen: async () => {
      const gefunden = await get().qgis.suchen();
      if (gefunden.length && !get().programm) get().programmSetzen(gefunden[0]);
      return gefunden;
    },
    vorlageWaehlen: async () => {
      const d = await openFileWithPath({ filterName: 'QGIS-Projekt', extensions: ['qgz', 'qgs'], defaultDir: null });
      if (!d?.pfad) return;
      await get().aendern({ vorlage: d.pfad });
    },
    vorlageInfoLaden: async () => {
      const pfad = get().einstellungen.vorlage;
      if (!pfad) {
        set({ vorlageInfo: null });
        return;
      }
      try {
        const bytes = await get().qgis.dateiLesen(pfad);
        if (!bytes) throw new Error('Datei nicht gefunden');
        set({ vorlageInfo: { pfad, info: vorlageLesen(bytes), fehler: null } });
      } catch (e) {
        set({ vorlageInfo: { pfad, info: null, fehler: fehlertext(e) } });
      }
    },

    projektWaehlen: async (basis, name) => {
      const kennung = ++projektLauf;
      if (!basis) {
        set({ projekt: null, ausgang: null });
        return;
      }
      let oap: GeladeneProjektdatei | null = null;
      try {
        oap = await projektdateiLaden(get().fs, basis);
      } catch (e) {
        log.warn(`${basis}: Projektdatei nicht lesbar: ${fehlertext(e)}`);
      }
      // inzwischen geschlossen oder ein anderes Projekt gewählt: dieses Ergebnis ist überholt
      if (kennung !== projektLauf) return;
      set({ projekt: { basis, name: name ?? basis.split(/[\\/]/).pop() ?? basis, oap }, ausgang: null });
    },

    projektVorlage: () => {
      const o = get().projekt?.oap;
      const d = o?.projekt.dateien?.find((x) => x.art === 'qgis');
      return d ? { name: d.name, datum: d.datum, daten: d.daten } : null;
    },
    projektVorlageInfo: () => {
      const v = get().projektVorlage();
      if (!v) return null;
      if (!infoCache.has(v.daten)) {
        try {
          infoCache.set(v.daten, vorlageLesen(v.daten));
        } catch {
          infoCache.set(v.daten, null);
        }
      }
      return infoCache.get(v.daten) ?? null;
    },
    projektVorlageAktualisieren: async () => {
      const p = get().projekt;
      const pfad = get().einstellungen.vorlage;
      if (!p?.oap) {
        fehlschlag('Keine Projektdatei (.oap) im Projektordner – die QGIS-Vorlage wird dort abgelegt.');
        return false;
      }
      if (!pfad) {
        fehlschlag('Keine QGIS-Vorlage gewählt – bitte unter „Einrichtung“ → „Katasterpläne“ festlegen.');
        return false;
      }
      try {
        const daten = await get().qgis.dateiLesen(pfad);
        if (!daten) throw new Error(`${pfad}: Datei nicht gefunden`);
        vorlageLesen(daten); // ist es ein QGIS-Projekt?
        const name = pfad.split(/[\\/]/).pop() || 'Vorlage.qgz';
        await projektdateiDateiSetzen(get().fs, p.basis, p.oap.pfad, { id: `qgis-${Date.now().toString(36)}`, name, art: 'qgis', datum: heute() }, daten);
        log.info(`${p.oap.pfad}: QGIS-Vorlage ${pfad} übernommen`);
        await get().projektWaehlen(p.basis, p.name);
        return true;
      } catch (e) {
        fehlschlag(`QGIS-Vorlage nicht in die Projektdatei übernommen: ${fehlertext(e)}`);
        return false;
      }
    },

    namensteile: () => {
      const projekt = get().projekt;
      const meta = projekt?.oap?.projekt.meta;
      return {
        kuerzel: meta?.projektcode?.trim() || projekt?.name || '',
        art: meta?.antrag ? artDerFassung(meta.antrag.name) : '',
        datum: new Date(),
        kurzname: meta?.kurzname,
        vorhaben: meta?.vorhaben,
        bearbeiter: meta?.bearbeiter,
      };
    },

    zielOrdner: () => {
      const e = get().einstellungen;
      const antrag = get().projekt?.oap?.projekt.meta.antrag?.name;
      if (e.ziel === 'antrag' || !e.zielpfad.trim()) {
        // der Name aus der .oap wird wie ein Platzhalter gesäubert: kein „/“, kein „..“, keine unzulässigen Zeichen
        const ordner = antrag ? katasterZielpfad('{Antrag}', antrag, get().namensteile()) : null;
        return ordner ? `${ANTRAGSORDNER}/${ordner}` : null;
      }
      return katasterZielpfad(e.zielpfad, antrag, get().namensteile());
    },

    exportieren: async (ids) => {
      // Sperre sofort setzen: ein Doppelklick startet sonst während der Dateiprüfung einen zweiten Lauf
      if (!get().projekt || get().laeuft) return [];
      set({ laeuft: true, ausgang: null });
      try {
        return await exportLauf(ids);
      } finally {
        set({ laeuft: false });
      }
    },
    ausgangSchliessen: () => set({ ausgang: null }),
  };
});

// Speicherort der Einstellungen gewechselt bzw. Netzlaufwerk weg oder wieder da: neu lesen
konfigNeuLesen(() => void useKataster.getState().laden());
