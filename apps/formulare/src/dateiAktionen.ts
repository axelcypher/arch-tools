/**
 * Dateibefehle im Projektordner (Kontextmenü): kopieren und einfügen, duplizieren, umbenennen, löschen und mit
 * einem Antragsdokument verknüpfen. Geschrieben wird über die Befehle der Hülle – nichts wird überschrieben, gelöscht
 * wird erst nach einer Sicherungskopie, Dateien von FORMA sind ausgenommen.
 */

import { create } from 'zustand';
import { aktiveFassung, antragsOrdner, useAntrag } from './antragStore';
import { bestaetigen, frageText } from './components/Rueckfrage';
import { istFormaDatei, verbinde } from './dateisystem';
import { useFormulare } from './store';

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

export async function umbenennen(basis: string, pfad: string) {
  const ds = useFormulare.getState().ds;
  if (!ds) return;
  const neu = await frageText('Umbenennen', nameVon(pfad), 'Umbenennen');
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
  if (istFormaDatei(pfad)) return fehler('Löschen', new Error('Dateien von FORMA werden nur in FORMA gelöscht'));
  if (!(await bestaetigen('Löschen', `„${nameVon(pfad)}“ löschen? Eine Sicherungskopie bleibt im Ordner „Sicherungen“ der App.`, 'Löschen', true))) return;
  try {
    await ds.loeschen(basis, pfad);
    geoeffnetesSchliessen(basis, pfad);
    geaendert();
  } catch (e) {
    fehler('Löschen', e);
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
 * Datei mit einem Dokument des Projektumfangs verknüpfen. Liegt sie nicht im Ordner der aktiven Fassung, wird sie
 * dorthin kopiert (ohne zu überschreiben) und die Kopie verknüpft.
 */
export async function verknuepfen(basis: string, pfad: string, umfangId: string) {
  const ds = useFormulare.getState().ds;
  const projekt = useFormulare.getState().projekt;
  if (!ds || !projekt) return;
  const st = useAntrag.getState();
  const ziel = antragsOrdner(st, projekt);
  try {
    let name = nameVon(pfad);
    if (ordnerVon(pfad).toLowerCase() !== ziel.toLowerCase()) {
      name = freierName(await namenIn(basis, ziel), name);
      await ds.kopieren(basis, pfad, zusammen(ziel, name));
      useFormulare.getState().setMeldung({ art: 'info', text: `In ${aktiveFassung(st, projekt)} kopiert und verknüpft: ${name}` });
    }
    await useAntrag.getState().verknuepfen(umfangId, name);
    useDateiAktionen.getState().neu();
  } catch (e) {
    fehler('Verknüpfen', e);
  }
}
