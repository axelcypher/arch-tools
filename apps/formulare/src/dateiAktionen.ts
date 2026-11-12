/**
 * Dateibefehle im Projektordner (Kontextmenü): kopieren und einfügen, duplizieren, umbenennen, löschen und mit
 * einem Antragsdokument verknüpfen. Geschrieben wird über die Befehle der Hülle – nichts wird überschrieben, gelöscht
 * wird nur von Hand und erst nach einer Sicherungskopie. Formulare lassen sich löschen, wenn sie nirgends geöffnet
 * sind; Sperrdateien, Projektkarte und Projekttitel verwaltet nur FORMA.
 */

import { create } from 'zustand';
import { aktiveFassung, antragsOrdner, antragSperre, useAntrag } from './antragStore';
import type { SchreibInfo } from './antragStore';
import { klein } from './antrag';
import { bestaetigen, frageText } from './components/Rueckfrage';
import { nurFormaLoescht, verbinde } from './dateisystem';
import type { FormularEintrag } from './projekte';
import { formulareDesProjekts } from './projekte';
import { hatEntwurf, useFormulare } from './store';

interface Zwischenablage {
  basis: string;
  pfad: string;
}

/** Stand des Ordnerbaums (zählt nach jeder Änderung hoch, dann wird neu gelesen) und die Zwischenablage */
export const useDateiAktionen = create<{ stand: number; ablage: Zwischenablage | null; neu: () => void; merken: (z: Zwischenablage | null) => void }>((set) => ({
  stand: 0,
  ablage: null,
  neu: () => set((s) => ({ stand: s.stand + 1 })),
  merken: (ablage) => set({ ablage }),
}));

const ordnerVon = (pfad: string) => (pfad.includes('/') ? pfad.slice(0, pfad.lastIndexOf('/')) : '');
const nameVon = (pfad: string) => pfad.split('/').pop() ?? pfad;
const zusammen = (ordner: string, name: string) => (ordner ? `${ordner}/${name}` : name);

/** „Name (Kopie).pdf“, „Name (Kopie 2).pdf“ … – der erste freie Name im Ordner */
export function freierName(vorhanden: string[], name: string, zusatz = 'Kopie'): string {
  const belegt = new Set(vorhanden.map((n) => n.toLowerCase()));
  if (!belegt.has(name.toLowerCase())) return name;
  const punkt = name.lastIndexOf('.');
  const [stamm, endung] = punkt > 0 ? [name.slice(0, punkt), name.slice(punkt)] : [name, ''];
  for (let i = 1; ; i++) {
    const n = `${stamm} (${zusatz}${i > 1 ? ` ${i}` : ''})${endung}`;
    if (!belegt.has(n.toLowerCase())) return n;
  }
}

async function namenIn(basis: string, ordner: string): Promise<string[]> {
  const ds = useFormulare.getState().ds!;
  return (await ds.liste(ordner ? verbinde(basis, ordner) : basis, 1).catch(() => [])).map((e) => e.pfad);
}

function geaendert() {
  useDateiAktionen.getState().neu();
  void useAntrag.getState().aktualisieren();
}

function fehler(was: string, e: unknown) {
  useFormulare.getState().setMeldung({ art: 'fehler', text: `${was}: ${e instanceof Error ? e.message : String(e)}` });
}

/** geöffnetes Dokument schließen, wenn es umbenannt oder gelöscht wurde */
function geoeffnetesSchliessen(basis: string, pfad: string) {
  const s = useFormulare.getState();
  if (s.datei?.root === basis && s.datei.pfad === pfad) useFormulare.setState({ datei: null, haupt: 'formular' });
}

export async function duplizieren(basis: string, pfad: string) {
  const ds = useFormulare.getState().ds;
  if (!ds) return;
  try {
    const ordner = ordnerVon(pfad);
    const ziel = zusammen(ordner, freierName(await namenIn(basis, ordner), nameVon(pfad)));
    await ds.kopieren(basis, pfad, ziel);
    geaendert();
  } catch (e) {
    fehler('Duplizieren', e);
  }
}

export async function umbenennen(basis: string, pfad: string, vorschlag?: string, text?: string) {
  const ds = useFormulare.getState().ds;
  if (!ds) return;
  const neu = await frageText('Umbenennen', vorschlag ?? nameVon(pfad), 'Umbenennen', text);
  if (!neu || neu === nameVon(pfad)) return;
  if (/[<>:"/\\|?*]/.test(neu)) return fehler('Umbenennen', new Error('Diese Zeichen sind in Dateinamen nicht erlaubt: < > : " / \\ | ? *'));
  try {
    await ds.umbenennen(basis, pfad, zusammen(ordnerVon(pfad), neu));
    geoeffnetesSchliessen(basis, pfad);
    geaendert();
  } catch (e) {
    fehler('Umbenennen', e);
  }
}

export async function loeschen(basis: string, pfad: string) {
  const ds = useFormulare.getState().ds;
  if (!ds) return;
  if (nurFormaLoescht(pfad)) return fehler('Löschen', new Error('Projektkarte, Sperrdateien und Projekttitel werden hier nicht gelöscht'));
  if (!(await bestaetigen('Löschen', `„${nameVon(pfad)}“ löschen? Eine Sicherungskopie bleibt im Ordner „Sicherungen“ der App.`, 'Löschen', true))) return;
  try {
    await ds.loeschen(basis, pfad);
    geoeffnetesSchliessen(basis, pfad);
    geaendert();
  } catch (e) {
    fehler('Löschen', e);
  }
}

/**
 * Formular aus dem FORMA-Projekt löschen – mit Rückfrage und Sicherungskopie. Ist es hier geöffnet, wird es vorher
 * geschlossen; ist es in FORMA (oder auf einem anderen Rechner) geöffnet, wird nicht gelöscht.
 */
export async function formularLoeschen(f: FormularEintrag) {
  const s = useFormulare.getState();
  const { ds, projekt } = s;
  if (!ds || !projekt) return;
  const hier = s.offen?.projekt === projekt && s.offen.pfad === f.pfad;
  if (f.gesperrt && !hier) return fehler('Löschen', new Error(`„${f.name}“ ist gerade in einem anderen Programm oder auf einem anderen Rechner geöffnet – bitte erst dort schließen`));
  const entwurf = hatEntwurf(projekt, f.pfad) || (hier && Object.keys(s.offen!.aenderungen).length > 0);
  const text = `Formular „${f.name}“ löschen? Eine Sicherungskopie bleibt im Ordner „Sicherungen“ der App.${entwurf ? ' Nicht gespeicherte Eingaben gehen verloren.' : ''}`;
  if (!(await bestaetigen('Formular löschen', text, 'Löschen', true))) return;
  try {
    if (hier) await useFormulare.getState().schliessen();
    await ds.loeschen(projekt.root, f.pfad);
    if (useFormulare.getState().projekt === projekt) useFormulare.setState({ formulare: await formulareDesProjekts(ds, projekt) });
    useFormulare.getState().setMeldung({ art: 'info', text: `„${f.name}“ gelöscht – die Sicherungskopie liegt im Ordner „Sicherungen“ der App.` });
  } catch (e) {
    fehler('Löschen', e);
  }
}

let frischt = false;

/**
 * Von außen geänderte Dateien übernehmen – neue Formulare (FORMA), neue Dokumente im Projektordner (Explorer,
 * Kollegen), Sperren und den Antragsstatus. `voll` (wenn das Fenster wieder in den Vordergrund kommt): auch die
 * Projektdatei und – in der Übersicht – die Liste der Projekte.
 */
export async function auffrischen(voll = false) {
  const s = useFormulare.getState();
  if (frischt || !s.ds) return;
  frischt = true;
  try {
    const projekt = s.projekt;
    if (projekt) {
      const neu = await formulareDesProjekts(s.ds, projekt);
      const st = useFormulare.getState();
      if (st.projekt !== projekt) return;
      // geänderte Liste: das Abo des Antrags gleicht danach selbst ab (samt Projektordner-Baum)
      if (JSON.stringify(neu) !== JSON.stringify(st.formulare)) useFormulare.setState({ formulare: neu });
      else await useAntrag.getState().aktualisieren();
      if (voll) await useFormulare.getState().oapAuffrischen();
    }
    if (voll && (!projekt || s.haupt === 'projekte') && !s.sucht) await useFormulare.getState().projekteLaden();
  } catch {
    // beim nächsten Mal wieder
  } finally {
    frischt = false;
  }
}

/** Kopierte Datei in einen Ordner einfügen (innerhalb desselben Projektordners) */
export async function einfuegen(basis: string, ordner: string) {
  const ds = useFormulare.getState().ds;
  const z = useDateiAktionen.getState().ablage;
  if (!ds || !z) return;
  if (z.basis !== basis) return fehler('Einfügen', new Error('Nur innerhalb desselben Projektordners'));
  try {
    const ziel = zusammen(ordner, freierName(await namenIn(basis, ordner), nameVon(z.pfad)));
    await ds.kopieren(basis, z.pfad, ziel);
    geaendert();
  } catch (e) {
    fehler('Einfügen', e);
  }
}

export async function ordnerNeu(basis: string, ordner: string) {
  const ds = useFormulare.getState().ds;
  if (!ds) return;
  const name = await frageText('Neuer Ordner', 'Neuer Ordner', 'Anlegen');
  if (!name) return;
  try {
    await ds.ordnerAnlegen(basis, zusammen(ordner, name));
    geaendert();
  } catch (e) {
    fehler('Neuer Ordner', e);
  }
}

/**
 * Datei mit einem Dokument des Antragsumfangs verknüpfen. Liegt sie nicht im Ordner der aktiven Fassung, wird sie
 * dorthin kopiert (ohne zu überschreiben) und die Kopie verknüpft.
 */
export async function verknuepfen(basis: string, pfad: string, umfangId: string, o: { fassung?: string; titel?: string } = {}) {
  const ds = useFormulare.getState().ds;
  const projekt = useFormulare.getState().projekt;
  if (!ds || !projekt) return;
  const st = useAntrag.getState();
  const melde = (art: 'info' | 'fehler', text: string) => useFormulare.getState().setMeldung({ art, text });
  // die Fassung des Menüs (sonst die aktive) und ihr Ordner: liegt die Datei schon dort, wird nur verknüpft
  const aktiv = aktiveFassung(st, projekt);
  const fassung = o.fassung ?? aktiv;
  const ordnerAktiv = antragsOrdner(st, projekt);
  const ziel = `${ordnerAktiv.slice(0, ordnerAktiv.length - aktiv.length)}${fassung}`;
  const kopiert = ordnerVon(pfad).toLowerCase() !== ziel.toLowerCase();
  const was = kopiert ? 'Nicht kopiert' : 'Nicht verknüpft';
  // erst: noch dieselbe Fassung angezeigt und aktiv? – sonst nichts kopieren (auch keine Sperre einer anderen melden)
  if (aktiv !== fassung) return melde('info', `${was} – inzwischen ist Antrag ${aktiv} angezeigt.`);
  if (st.projektdatei?.ansicht !== fassung) return melde('info', `${was} – Antrag ${aktiv} wird gerade geöffnet; bitte gleich noch einmal versuchen.`);
  // dann: eingereicht und gesperrt – nichts kopieren
  const sperre = antragSperre(st, projekt);
  if (sperre) return melde('info', sperre);
  try {
    let name = nameVon(pfad);
    if (kopiert) {
      name = freierName(await namenIn(basis, ziel), name);
      await ds.kopieren(basis, pfad, zusammen(ziel, name));
      // inzwischen ein anderes Projekt: kopiert ist im bisherigen, verknüpft wird nicht (sonst im falschen Projekt)
      if (useFormulare.getState().projekt !== projekt) {
        melde('info', `„${name}“ in ${fassung} von ${projekt.ordner} kopiert, aber nicht verknüpft – inzwischen ist ein anderes Projekt offen.`);
        return;
      }
    }
    const nachholen = `Bitte später die Kopie in ${fassung} über „Mit Antragsdokument verknüpfen“ verknüpfen, nicht noch einmal kopieren.`;
    // wird ein Dialog (Projektordner, Projektdatei) abgebrochen, gilt eine Zusage nicht – schon vor dem Schreiben festgelegt
    const info: SchreibInfo = kopiert
      ? {
          beiAbbruch: (art) =>
            melde('info', `„${name}“ in ${fassung} kopiert, aber nicht verknüpft – ${art === 'oap' ? 'keine Projektdatei angelegt' : 'kein Projektordner zugeordnet'}. ${nachholen}`),
        }
      : {};
    await useAntrag.getState().verknuepfen(umfangId, name, { ansicht: fassung, still: kopiert, titel: o.titel, info });
    useDateiAktionen.getState().neu();
    if (!kopiert) return;
    // die Kopie ist angelegt – gemeldet wird nach dem Speichern, was daraus wurde (nicht noch einmal kopieren)
    const f = useFormulare.getState();
    const verknuepft = useAntrag.getState().projektdatei?.umfang?.find((u) => u.id === umfangId)?.dateien?.[fassung] === name;
    if (info.geschrieben || verknuepft) melde('info', `„${name}“ in ${fassung} kopiert und verknüpft.`);
    else if (info.dialog) {
      // die Zusage nur, solange der Dialog noch offen ist (abgebrochen: die Rücknahme ist schon gemeldet)
      if (f.stammdatenDialog || f.ordnerDialog) melde('info', `„${name}“ in ${fassung} kopiert – verknüpft wird nach dem Anlegen der Projektdatei.`);
    } else if (info.vorab === 'eintrag' || info.vorab === 'umfang') melde('info', `„${name}“ in ${fassung} kopiert, aber nicht verknüpft – ${klein(info.grund!)}.`);
    else melde('fehler', `„${name}“ in ${fassung} kopiert, aber nicht verknüpft – ${klein(info.grund ?? 'nicht gespeichert')}. ${nachholen}`);
  } catch (e) {
    fehler('Verknüpfen', e);
  }
}
