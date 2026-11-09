import { create } from 'zustand';
import { pickFile, saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import type { Dateisystem } from './dateisystem';
import { hatDateisystem, tauriDateisystem } from './dateisystem';
import type { Feld } from './forma/felder';
import { felderDerSeite } from './forma/felder';
import type { Formular } from './forma/formular';
import { formularBytes, istAngekreuzt, memoText, parseFormular, setzeAngekreuzt, setzeMemoText } from './forma/formular';
import type { Sperre } from './forma/sperre';
import { sperreLesen, sperreSchreiben, sperrPfad, zeitstempel } from './forma/sperre';
import { finde } from './forma/dfm';
import type { FormularEintrag, Projekt } from './projekte';
import { formulareDesProjekts, projekteSuchen } from './projekte';

/**
 * Zustand der App: die eingestellten Projektordner, die gefundenen Projekte und das geöffnete Formular.
 *
 * Eingaben werden nicht sofort in die Datei geschrieben, sondern als Änderungen je Feld gesammelt. Erst beim
 * Speichern wird die Datei frisch eingelesen, mit den Änderungen versehen und ersetzt – vorher wird geprüft,
 * dass sie seit dem Öffnen niemand geändert hat. Nicht gespeicherte Änderungen bleiben als Entwurf im
 * Browserspeicher der App erhalten.
 */

const log = logger('formulare');

export type Ansicht = 'felder' | 'seite';
type Wert = string | boolean;

const EINSTELLUNGEN = 'formulare:einstellungen';
const ENTWUERFE = 'formulare:entwuerfe';

interface Gespeichert {
  projektordner: string[];
  ansicht: Ansicht;
}

export type SperrZustand =
  /** eigene Sperrdatei angelegt (Inhalt zum späteren Löschen) */
  | { art: 'eigen'; daten: Uint8Array }
  /** anderswo geöffnet – nur ansehen */
  | { art: 'fremd'; sperre: Sperre }
  /** Browser: einzelne Datei, keine Sperre möglich */
  | { art: 'ohne' };

export interface OffenesFormular {
  /** null im Browser (einzelne Datei) */
  projekt: Projekt | null;
  /** relativ zum Projektordner; im Browser der Dateiname */
  pfad: string;
  name: string;
  /** Inhalt der Datei beim Öffnen bzw. nach dem letzten Speichern */
  bytes: Uint8Array;
  formular: Formular;
  /** je Seite */
  felder: Feld[][];
  /** geänderte Felder (Schlüssel `<Seite>:<Name>`) */
  aenderungen: Record<string, Wert>;
  sperre: SperrZustand;
  /** Grund, warum nicht gespeichert werden kann (sonst null) */
  nurLesen: string | null;
}

export interface Meldung {
  art: 'info' | 'fehler';
  text: string;
}

interface FormulareState extends Gespeichert {
  ds: Dateisystem | null;
  projekte: Projekt[];
  suchfehler: string[];
  sucht: boolean;
  projekt: Projekt | null;
  formulare: FormularEintrag[];
  offen: OffenesFormular | null;
  /** Datei wurde seit dem Öffnen außerhalb geändert – Speichern verweigert, bis neu geladen wurde */
  konflikt: boolean;
  meldung: Meldung | null;

  setAnsicht: (a: Ansicht) => void;
  setMeldung: (m: Meldung | null) => void;
  ordnerHinzufuegen: (pfad: string) => Promise<void>;
  ordnerEntfernen: (pfad: string) => Promise<void>;
  projekteLaden: () => Promise<void>;
  projektWaehlen: (p: Projekt | null) => Promise<void>;
  formularOeffnen: (e: FormularEintrag) => Promise<void>;
  /** Browser: einzelne .frmsjf-Datei über den Dateidialog */
  dateiOeffnen: () => Promise<void>;
  schliessen: () => Promise<void>;
  wertSetzen: (feld: Feld, wert: Wert) => void;
  speichern: () => Promise<void>;
  /** Datei neu einlesen; eigene Änderungen bleiben erhalten */
  neuLaden: () => Promise<void>;
}

function ladeEinstellungen(): Gespeichert {
  const vorgabe: Gespeichert = { projektordner: [], ansicht: 'felder' };
  try {
    const o = JSON.parse(localStorage.getItem(EINSTELLUNGEN) ?? '{}') as Partial<Gespeichert>;
    return {
      projektordner: Array.isArray(o.projektordner) ? o.projektordner.filter((p) => typeof p === 'string') : [],
      ansicht: o.ansicht === 'seite' ? 'seite' : 'felder',
    };
  } catch {
    return vorgabe;
  }
}

/* ---------- Entwürfe (nicht gespeicherte Änderungen) ---------- */

const entwurfSchluessel = (o: Pick<OffenesFormular, 'projekt' | 'pfad'>) => (o.projekt ? `${o.projekt.root}|${o.pfad}` : `datei|${o.pfad}`);

function entwuerfe(): Record<string, Record<string, Wert>> {
  try {
    return JSON.parse(localStorage.getItem(ENTWUERFE) ?? '{}') as Record<string, Record<string, Wert>>;
  } catch {
    return {};
  }
}

export const hatEntwurf = (projekt: Projekt, pfad: string) => !!entwuerfe()[entwurfSchluessel({ projekt, pfad })];

function entwurfSpeichern(o: OffenesFormular): void {
  try {
    const alle = entwuerfe();
    if (Object.keys(o.aenderungen).length) alle[entwurfSchluessel(o)] = o.aenderungen;
    else delete alle[entwurfSchluessel(o)];
    localStorage.setItem(ENTWUERFE, JSON.stringify(alle));
  } catch {
    // ohne Speicher gibt es keinen Entwurf
  }
}

/* ---------- Formular ---------- */

export const istGeaendert = (o: OffenesFormular | null) => !!o && Object.keys(o.aenderungen).length > 0;

export const wertVon = (o: OffenesFormular, f: Feld): Wert => (f.schluessel in o.aenderungen ? o.aenderungen[f.schluessel] : f.original);

const gleich = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

function aufbereiten(bytes: Uint8Array) {
  const formular = parseFormular(bytes);
  const felder = formular.seiten.map((s, i) => felderDerSeite(s, i));
  // Sicherheitsnetz: Was sich nicht unverändert zurückschreiben lässt, wird auch nicht gespeichert
  const nurLesen = gleich(formularBytes(formular), bytes) ? null : 'Die Datei lässt sich nicht verlustfrei zurückschreiben – Speichern ist gesperrt.';
  return { formular, felder, nurLesen };
}

/** Behält nur Änderungen an Feldern, die es gibt und die vom Wert in der Datei abweichen */
function bereinige(aenderungen: Record<string, Wert>, felder: Feld[][]): Record<string, Wert> {
  const out: Record<string, Wert> = {};
  for (const f of felder.flat()) {
    if (!(f.schluessel in aenderungen)) continue;
    const w = aenderungen[f.schluessel];
    if (typeof w === typeof f.original && w !== f.original) out[f.schluessel] = w;
  }
  return out;
}

/** Neue Dateifassung: frisch eingelesen, Änderungen eingetragen und gegengeprüft */
export function mitAenderungen(bytes: Uint8Array, aenderungen: Record<string, Wert>): Uint8Array {
  const f = parseFormular(bytes);
  const eintraege = Object.entries(aenderungen).map(([k, w]) => {
    const i = k.indexOf(':');
    return { seite: Number(k.slice(0, i)), name: k.slice(i + 1), w };
  });
  for (const { seite, name, w } of eintraege) {
    if (typeof w === 'boolean') setzeAngekreuzt(f, seite, name, w);
    else setzeMemoText(f, seite, name, w);
  }
  const neu = formularBytes(f);
  const probe = parseFormular(neu);
  for (const { seite, name, w } of eintraege) {
    const o = finde(probe.seiten[seite].form, name)!;
    const gelesen = typeof w === 'boolean' ? istAngekreuzt(o) : memoText(o);
    const erwartet = typeof w === 'boolean' ? w : memoText(finde(f.seiten[seite].form, name)!);
    if (gelesen !== erwartet) throw new Error(`Gegenprobe fehlgeschlagen bei ${name} (Seite ${seite + 1})`);
  }
  return neu;
}

async function sperren(ds: Dateisystem, root: string, pfad: string): Promise<SperrZustand> {
  const sp = sperrPfad(pfad);
  const vorhanden = await ds.lies(root, sp);
  if (vorhanden) return { art: 'fremd', sperre: sperreLesen(vorhanden) };
  const r = await ds.rechner();
  const daten = sperreSchreiben({ benutzer: r.benutzer, computer: r.computer, angemeldet: zeitstempel(new Date()), inGebrauch: String(r.prozess) });
  if (await ds.sperreSetzen(root, sp, daten)) return { art: 'eigen', daten };
  const jetzt = await ds.lies(root, sp);
  return { art: 'fremd', sperre: jetzt ? sperreLesen(jetzt) : { benutzer: '', computer: '', angemeldet: '', inGebrauch: '' } };
}

const fehlertext = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useFormulare = create<FormulareState>()((set, get) => {
  const fehler = (text: string, e?: unknown) => {
    const t = e === undefined ? text : `${text}: ${fehlertext(e)}`;
    log.error(t);
    set({ meldung: { art: 'fehler', text: t } });
  };

  const oeffnen = async (projekt: Projekt | null, pfad: string, name: string, bytes: Uint8Array, sperre: SperrZustand) => {
    const { formular, felder, nurLesen } = aufbereiten(bytes);
    const offen: OffenesFormular = { projekt, pfad, name, bytes, formular, felder, aenderungen: {}, sperre, nurLesen };
    const entwurf = entwuerfe()[entwurfSchluessel(offen)];
    if (entwurf) offen.aenderungen = bereinige(entwurf, felder);
    const wiederhergestellt = Object.keys(offen.aenderungen).length;
    set({
      offen,
      konflikt: false,
      meldung: wiederhergestellt ? { art: 'info', text: `${wiederhergestellt} nicht gespeicherte Eingabe(n) vom letzten Mal wiederhergestellt.` } : null,
    });
  };

  return {
    ...ladeEinstellungen(),
    ds: hatDateisystem() ? tauriDateisystem : null,
    projekte: [],
    suchfehler: [],
    sucht: false,
    projekt: null,
    formulare: [],
    offen: null,
    konflikt: false,
    meldung: null,

    setAnsicht: (ansicht) => set({ ansicht }),
    setMeldung: (meldung) => set({ meldung }),

    ordnerHinzufuegen: async (pfad) => {
      if (get().projektordner.includes(pfad)) return;
      set({ projektordner: [...get().projektordner, pfad] });
      await get().projekteLaden();
    },

    ordnerEntfernen: async (pfad) => {
      set({ projektordner: get().projektordner.filter((p) => p !== pfad) });
      if (get().projekt?.root === pfad) await get().projektWaehlen(null);
      await get().projekteLaden();
    },

    projekteLaden: async () => {
      const ds = get().ds;
      if (!ds) return;
      set({ sucht: true });
      try {
        const { projekte, fehler: suchfehler } = await projekteSuchen(ds, get().projektordner);
        set({ projekte, suchfehler });
      } finally {
        set({ sucht: false });
      }
    },

    projektWaehlen: async (projekt) => {
      await get().schliessen();
      set({ projekt, formulare: [] });
      const ds = get().ds;
      if (!projekt || !ds) return;
      try {
        set({ formulare: await formulareDesProjekts(ds, projekt) });
      } catch (e) {
        fehler(`Formulare von ${projekt.ordner} nicht lesbar`, e);
      }
    },

    formularOeffnen: async (eintrag) => {
      const { ds, projekt } = get();
      if (!ds || !projekt) return;
      await get().schliessen();
      try {
        const bytes = await ds.lies(projekt.root, eintrag.pfad);
        if (!bytes) throw new Error('Datei nicht gefunden');
        // erst prüfen, ob die Datei lesbar ist – dann sperren
        aufbereiten(bytes);
        const sperre = await sperren(ds, projekt.root, eintrag.pfad);
        // Zwischen Lesen und Sperren könnte FORMA gespeichert haben: mit Sperre noch einmal lesen
        const frisch = sperre.art === 'eigen' ? ((await ds.lies(projekt.root, eintrag.pfad)) ?? bytes) : bytes;
        await oeffnen(projekt, eintrag.pfad, eintrag.name, frisch, sperre);
        log.info(`Geöffnet: ${eintrag.pfad}${sperre.art === 'fremd' ? ' (nur ansehen, anderswo geöffnet)' : ''}`);
        set({ formulare: await formulareDesProjekts(ds, projekt) });
      } catch (e) {
        fehler(`${eintrag.name} lässt sich nicht öffnen`, e);
      }
    },

    dateiOeffnen: async () => {
      const datei = await pickFile('.frmsjf');
      if (!datei) return;
      await get().schliessen();
      try {
        await oeffnen(null, datei.name, datei.name.replace(/\.frmsjf$/i, ''), new Uint8Array(await datei.arrayBuffer()), { art: 'ohne' });
      } catch (e) {
        fehler(`${datei.name} lässt sich nicht öffnen`, e);
      }
    },

    schliessen: async () => {
      const { offen, ds } = get();
      if (!offen) return;
      set({ offen: null, konflikt: false });
      if (offen.sperre.art === 'eigen' && offen.projekt && ds) {
        try {
          await ds.sperreLoesen(offen.projekt.root, sperrPfad(offen.pfad), offen.sperre.daten);
        } catch (e) {
          fehler(`Sperrdatei von ${offen.name} nicht entfernt`, e);
        }
      }
    },

    wertSetzen: (feld, wert) => {
      const o = get().offen;
      if (!o) return;
      const aenderungen = { ...o.aenderungen };
      if (wert === feld.original) delete aenderungen[feld.schluessel];
      else aenderungen[feld.schluessel] = wert;
      const neu = { ...o, aenderungen };
      set({ offen: neu });
      entwurfSpeichern(neu);
    },

    speichern: async () => {
      const { offen: o, ds, konflikt } = get();
      if (!o || !istGeaendert(o)) return;
      if (o.nurLesen) return fehler(o.nurLesen);
      if (o.sperre.art === 'fremd') return fehler(`${o.name} ist bei ${o.sperre.sperre.benutzer || 'jemand anderem'} geöffnet – Speichern nicht möglich`);
      if (konflikt) return fehler('Die Datei wurde inzwischen geändert – bitte erst neu laden');
      try {
        const neu = mitAenderungen(o.bytes, o.aenderungen);
        if (o.projekt && ds) {
          const aktuell = await ds.lies(o.projekt.root, o.pfad);
          if (!aktuell || !gleich(aktuell, o.bytes)) {
            set({ konflikt: true, meldung: { art: 'fehler', text: 'Die Datei wurde seit dem Öffnen außerhalb geändert (z. B. in FORMA). Bitte neu laden – deine Eingaben bleiben erhalten.' } });
            return;
          }
          await ds.ersetze(o.projekt.root, o.pfad, neu);
        } else {
          const ok = await saveBinaryFile({ defaultName: `${o.name}.frmsjf`, data: neu, filterName: 'FORMA-Formular', extension: 'frmsjf', mime: 'application/octet-stream' });
          if (!ok) return;
        }
        const { formular, felder, nurLesen } = aufbereiten(neu);
        const gespeichert: OffenesFormular = { ...o, bytes: neu, formular, felder, nurLesen, aenderungen: {} };
        set({ offen: gespeichert, meldung: { art: 'info', text: `${o.name} gespeichert.` } });
        entwurfSpeichern(gespeichert);
        log.info(`Gespeichert: ${o.pfad} (${Object.keys(o.aenderungen).length} Feld(er))`);
      } catch (e) {
        fehler(`${o.name} nicht gespeichert`, e);
      }
    },

    neuLaden: async () => {
      const { offen: o, ds } = get();
      if (!o?.projekt || !ds) return;
      try {
        const bytes = await ds.lies(o.projekt.root, o.pfad);
        if (!bytes) throw new Error('Datei nicht gefunden');
        const { formular, felder, nurLesen } = aufbereiten(bytes);
        const neu: OffenesFormular = { ...o, bytes, formular, felder, nurLesen, aenderungen: bereinige(o.aenderungen, felder) };
        set({ offen: neu, konflikt: false, meldung: { art: 'info', text: 'Neu geladen – deine Eingaben sind eingetragen, aber noch nicht gespeichert.' } });
        entwurfSpeichern(neu);
      } catch (e) {
        fehler(`${o.name} nicht neu geladen`, e);
      }
    },
  };
});

useFormulare.subscribe((s) => {
  try {
    const g: Gespeichert = { projektordner: s.projektordner, ansicht: s.ansicht };
    localStorage.setItem(EINSTELLUNGEN, JSON.stringify(g));
  } catch {
    // ohne Speicher gelten die Einstellungen nur bis zum Schließen
  }
});
