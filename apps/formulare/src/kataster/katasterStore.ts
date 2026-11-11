import { create } from 'zustand';
import { openFileWithPath } from '@core/platform/files';
import { konfigAendern, konfigLesen } from '@core/platform/konfig';
import { logger } from '@core/platform/log';
import { projektdateiDateiSetzen } from '@core/platform/projektordner';
import { fragen } from '@core/ui/Rueckfrage';
import { artDerFassung } from '../antrag';
import { aktiveFassung, antragsOrdner, useAntrag } from '../antragStore';
import { verbinde } from '../dateisystem';
import { ablageVon, useFormulare } from '../store';
import type { KatasterEinstellungen, KatasterPlan, PlanArt, VorlageInfo } from './kataster';
import { auftragBauen, ergebnisseLesen, fehlerAuszug, katasterAus, neueKennung, planDateiname, planFehler, VORGABE_KATASTER, vorlageLesen } from './kataster';
import skript from './katasterexport.py?raw';

const log = logger('kataster');

/** Pfad zu qgis_process: je Rechner (nicht im gemeinsamen Konfigurationsordner – die Installation unterscheidet sich) */
const PROGRAMM = 'formulare:qgis-programm';

function programmLesen(): string {
  try {
    return localStorage.getItem(PROGRAMM) ?? '';
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

export interface KatasterState {
  einstellungen: KatasterEinstellungen;
  programm: string;
  /** globale Vorlage, ausgelesen (Layouts, Themen) */
  vorlageInfo: { pfad: string; info: VorlageInfo | null; fehler: string | null } | null;
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
  /** QGIS-Vorlage der Projektdatei (oder null) */
  projektVorlage: () => ProjektVorlage | null;
  /** Vorlage der Projektdatei durch die globale ersetzen (bzw. erstmals hineinlegen) */
  projektVorlageAktualisieren: () => Promise<boolean>;
  /** Ausgelesene Vorlage der Projektdatei */
  projektVorlageInfo: () => VorlageInfo | null;
  /** Zielordner relativ zum Projektordner */
  zielOrdner: () => string;
  /** Pläne exportieren; liefert das Ergebnis je Plan (leer bei Abbruch) */
  exportieren: (ids: string[]) => Promise<PlanAusgang[]>;
  ausgangSchliessen: () => void;
}

/** ausgelesene Vorlagen je Inhalt (Projektdatei) */
const infoCache = new WeakMap<Uint8Array, VorlageInfo | null>();

export const useKataster = create<KatasterState>()((set, get) => {
  const speichern = async (e: KatasterEinstellungen) => {
    set({ einstellungen: e });
    try {
      await konfigAendern('formulare', (roh) => ({ ...((roh ?? {}) as Record<string, unknown>), kataster: e }));
    } catch (err) {
      log.warn(`Einstellungen der Katasterpläne nicht geschrieben: ${fehlertext(err)}`);
    }
  };
  const plaeneSetzen = (f: (p: KatasterPlan[]) => KatasterPlan[]) => speichern({ ...get().einstellungen, plaene: f(get().einstellungen.plaene) });
  const meldung = (art: 'info' | 'fehler', text: string) => useFormulare.getState().setMeldung({ art, text });

  return {
    einstellungen: structuredClone(VORGABE_KATASTER),
    programm: programmLesen(),
    vorlageInfo: null,
    laeuft: false,
    ausgang: null,

    laden: async () => {
      try {
        const app = ((await konfigLesen('formulare')) ?? {}) as Record<string, unknown>;
        set({ einstellungen: katasterAus(app.kataster) });
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
      const ds = useFormulare.getState().ds;
      if (!ds) return [];
      const gefunden = await ds.qgisSuchen();
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
      const ds = useFormulare.getState().ds;
      if (!pfad || !ds) {
        set({ vorlageInfo: null });
        return;
      }
      try {
        const bytes = await ds.dateiLesen(pfad);
        if (!bytes) throw new Error('Datei nicht gefunden');
        set({ vorlageInfo: { pfad, info: vorlageLesen(bytes), fehler: null } });
      } catch (e) {
        set({ vorlageInfo: { pfad, info: null, fehler: fehlertext(e) } });
      }
    },

    projektVorlage: () => {
      const o = useFormulare.getState().oap;
      if (!o || o === 'fehlt') return null;
      const d = o.projekt.dateien?.find((x) => x.art === 'qgis');
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
      const f = useFormulare.getState();
      const o = f.oap;
      const pfad = get().einstellungen.vorlage;
      if (!f.ds || !o || o === 'fehlt') {
        meldung('fehler', 'Keine Projektdatei (.oap) im Projektordner – die QGIS-Vorlage wird dort abgelegt.');
        return false;
      }
      if (!pfad) {
        meldung('fehler', 'Keine QGIS-Vorlage gewählt – bitte in den Einstellungen unter „Katasterpläne“ festlegen.');
        return false;
      }
      try {
        const daten = await f.ds.dateiLesen(pfad);
        if (!daten) throw new Error(`${pfad}: Datei nicht gefunden`);
        vorlageLesen(daten); // ist es ein QGIS-Projekt?
        const name = pfad.split(/[\\/]/).pop() || 'Vorlage.qgz';
        await projektdateiDateiSetzen(f.ds.projektordner, o.root, o.pfad, { id: `qgis-${Date.now().toString(36)}`, name, art: 'qgis', datum: heute() }, daten);
        log.info(`${o.pfad}: QGIS-Vorlage ${pfad} übernommen`);
        await useFormulare.getState().oapLaden();
        return true;
      } catch (e) {
        meldung('fehler', `QGIS-Vorlage nicht in die Projektdatei übernommen: ${fehlertext(e)}`);
        return false;
      }
    },

    zielOrdner: () => {
      const { projekt } = useFormulare.getState();
      const e = get().einstellungen;
      const a = useAntrag.getState();
      if (e.ziel === 'antrag' || !e.zielpfad.trim()) return antragsOrdner(a, projekt);
      return e.zielpfad
        .replace(/\{antrag\}/gi, aktiveFassung(a, projekt))
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '');
    },

    exportieren: async (ids) => {
      const f = useFormulare.getState();
      const { ds, projekt } = f;
      const ablage = ablageVon(f, projekt);
      if (!ds || !projekt || !ablage || get().laeuft) return [];
      const basis = verbinde(ablage.root, ablage.pfad);
      const o = f.oap;
      const fehlschlag = (text: string) => {
        meldung('fehler', text);
        return [];
      };
      if (!o || o === 'fehlt') return fehlschlag('Keine Projektdatei (.oap) im Projektordner – dort stehen Koordinaten und QGIS-Vorlage des Projekts.');
      const meta = o.inhalt.meta;
      if (!meta.koordinaten) return fehlschlag('Für das Projekt sind keine Koordinaten gespeichert – bitte die Projektadresse in den Stammdaten speichern (die Koordinaten werden dabei abgefragt).');
      const programm = get().programm;
      if (!programm) return fehlschlag('Pfad zu qgis_process fehlt – bitte in den Einstellungen unter „Katasterpläne“ wählen oder suchen lassen.');
      const plaene = get().einstellungen.plaene.filter((p) => ids.includes(p.id));
      if (!plaene.length) return fehlschlag('Bitte mindestens einen Plan wählen.');

      // Vorlage: die der Projektdatei; beim ersten Export die globale übernehmen
      if (!get().projektVorlage() && !(await get().projektVorlageAktualisieren())) return [];
      const vorlage = get().projektVorlage();
      if (!vorlage) return fehlschlag('Die QGIS-Vorlage der Projektdatei ist nicht lesbar.');
      const info = get().projektVorlageInfo();
      const falsch = plaene.flatMap((p) => planFehler(p, info).map((t) => `${p.name}: ${t}`));
      if (falsch.length) return fehlschlag(`Pläne passen nicht zur QGIS-Vorlage des Projekts: ${falsch.join(' ')}`);

      const a = useAntrag.getState();
      const ordner = get().zielOrdner();
      const teile = { code: meta.projektcode?.trim() || projekt.ordner, kuerzel: projekt.ordner, art: artDerFassung(aktiveFassung(a, projekt)), datum: new Date() };
      const relativ = new Map(plaene.map((p) => [p.id, `${ordner ? `${ordner}/` : ''}${planDateiname(get().einstellungen.dateiname, p, teile)}`]));

      // Vorhandene Dateien: überspringen oder ersetzen (die alte Fassung wird vorher gesichert und gelöscht)
      const vorhanden = (await Promise.all(plaene.map(async (p) => ((await ds.lies(basis, relativ.get(p.id)!).catch(() => null)) ? p : null)))).filter((p): p is KatasterPlan => !!p);
      let auswahl = plaene;
      if (vorhanden.length) {
        const antwort = await fragen({
          titel: `${vorhanden.length === 1 ? 'Eine Datei gibt' : `${vorhanden.length} Dateien gibt`} es schon`,
          text: vorhanden.map((p) => relativ.get(p.id)).join('\n'),
          knoepfe: [
            { id: 'abbrechen', label: 'Abbrechen' },
            { id: 'ueberspringen', label: 'Vorhandene überspringen' },
            { id: 'ersetzen', label: 'Ersetzen', art: 'danger' },
          ],
        });
        if (antwort === 'ueberspringen') auswahl = plaene.filter((p) => !vorhanden.includes(p));
        else if (antwort === 'ersetzen') {
          try {
            for (const p of vorhanden) await ds.loeschen(basis, relativ.get(p.id)!);
          } catch (e) {
            return fehlschlag(`Vorhandene Datei nicht ersetzt: ${fehlertext(e)}`);
          }
        } else return [];
        if (!auswahl.length) return [];
      }

      const kopf = { titel: meta.vorhaben?.trim() || o.inhalt.name, kennung: teile.code, strasse: meta.adresse?.strasse ?? '', ort: meta.adresse?.ort ?? '', plz: meta.adresse?.plz ?? '' };
      const auftrag = auftragBauen(auswahl, meta.koordinaten, kopf, (p) => verbinde(basis, relativ.get(p.id)!));
      set({ laeuft: true, ausgang: null });
      let ausgang: PlanAusgang[] = [];
      let meldungText: string | null = null;
      try {
        log.info(`${projekt.ordner}: Katasterpläne ${auswahl.map((p) => p.name).join(', ')} mit ${programm}`);
        const r = await ds.qgisAusfuehren({ programm, skript, auftrag, vorlage: vorlage.daten, vorlageName: vorlage.name });
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
      } finally {
        set({ laeuft: false });
      }
      set({ ausgang: { plaene: ausgang, meldung: meldungText } });
      await useAntrag.getState().aktualisieren();
      return ausgang;
    },
    ausgangSchliessen: () => set({ ausgang: null }),
  };
});
