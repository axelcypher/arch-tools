/**
 * Dateibefehle im Projektordner (Kontextmenü): kopieren und einfügen, duplizieren, umbenennen, löschen und mit
 * einem Antragsdokument verknüpfen. Geschrieben wird über die Befehle der Hülle – nichts wird überschrieben, gelöscht
 * wird nur von Hand und erst nach einer Sicherungskopie. Formulare lassen sich löschen, wenn sie nirgends geöffnet
 * sind; Sperrdateien, Projektkarte und Projekttitel verwaltet nur FORMA.
 */

import { create } from 'zustand';
import { vorgang } from './ausstehend';
import { gleicheFassung } from '@core/fassung';
import { logger } from '@core/platform/log';
import { projektdateiSchreiben } from '@core/platform/projektordner';
import { aktiveFassung, antragsOrdner, antragSperre, useAntrag, wechselLaeuft } from './antragStore';
import type { SchreibInfo } from './antragStore';
import type { UmfangEintrag } from './antrag';
import { abschnittVon, formularSchluessel, formularVerweiseUmbenennen, formularVon, klein } from './antrag';
import { bestaetigen, frageText } from './components/Rueckfrage';
import { nurFormaLoescht, verbinde } from './dateisystem';
import { parseFormular } from './forma/formular';
import { sperrPfad, sperreSchreiben, zeitstempel } from './forma/sperre';
import { sperreVergessen, sperreVermerken } from './eigeneSperren';
import { profilSchluessel } from './profil';
import type { FormularEintrag } from './projekte';
import { ablageVon, dateiEntwurfVerschieben, dateiSchluessel, dateiVerlassen, formularLokalVerschieben, hatEntwurf, unterordnerAnbindung, useFormulare } from './store';

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

const log = logger('formulare');

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

const istGeoeffnet = (basis: string, pfad: string) => {
  const d = useFormulare.getState().datei;
  return d?.root === basis && d.pfad === pfad;
};

/** geöffnetes Dokument schließen, wenn es umbenannt oder gelöscht wurde */
function geoeffnetesSchliessen(basis: string, pfad: string) {
  if (istGeoeffnet(basis, pfad)) useFormulare.setState({ datei: null, haupt: 'formular' });
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
    if (istGeoeffnet(basis, pfad) && !(await dateiVerlassen())) return;
    const ziel = zusammen(ordnerVon(pfad), neu);
    await ds.umbenennen(basis, pfad, ziel);
    geoeffnetesSchliessen(basis, pfad);
    dateiEntwurfVerschieben(basis, pfad, ziel);
    geaendert();
  } catch (e) {
    fehler('Umbenennen', e);
  }
}

export async function loeschen(basis: string, pfad: string) {
  const ds = useFormulare.getState().ds;
  if (!ds) return;
  if (nurFormaLoescht(pfad)) return fehler('Löschen', new Error('Projektkarte, Sperrdateien und Projekttitel werden hier nicht gelöscht'));
  const entwurf = dateiSchluessel({ root: basis, pfad }) in useFormulare.getState().dateiEntwuerfe;
  const text = `„${nameVon(pfad)}“ löschen? Eine Sicherungskopie bleibt im Ordner „Sicherungen“ der App.${entwurf ? ' Nicht gespeicherte Bearbeitungen gehen verloren.' : ''}`;
  if (!(await bestaetigen('Löschen', text, 'Löschen', true))) return;
  try {
    await ds.loeschen(basis, pfad);
    geoeffnetesSchliessen(basis, pfad);
    dateiEntwurfVerschieben(basis, pfad, null);
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
    if (useFormulare.getState().projekt === projekt) await useFormulare.getState().formulareNeuLesen();
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
      // im Sammelprojekt mit dem Unterordner des aktiven Antrags; ein Lesefehler bleibt still (beim nächsten Mal wieder)
      const geaendert = await useFormulare.getState().formulareNeuLesen({ still: true });
      if (useFormulare.getState().projekt !== projekt) return;
      // geänderte Liste: das Abo des Antrags gleicht danach selbst ab (samt Projektordner-Baum)
      if (!geaendert) await useAntrag.getState().aktualisieren();
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
  if (st.projektdatei?.ansicht !== fassung || wechselLaeuft(st, projekt)) return melde('info', `${was} – Antrag ${aktiv} wird gerade geöffnet; bitte gleich noch einmal versuchen.`);
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
    // inzwischen eingereicht: der Sperrtext ist ein eigener Satz (mit dem Weg zum Entsperren)
    else if (info.vorab === 'sperre') melde('info', `„${name}“ in ${fassung} kopiert, aber nicht verknüpft. ${info.grund}. Danach die Kopie verknüpfen, nicht noch einmal kopieren.`);
    else melde('fehler', `„${name}“ in ${fassung} kopiert, aber nicht verknüpft – ${klein(info.grund ?? 'nicht gespeichert')}. ${nachholen}`);
  } catch (e) {
    fehler('Verknüpfen', e);
  }
}

/** Verweise im Abschnitt „formulare“ der rohen Projektdatei umschreiben (auch im früheren Ort `erweiterungen.formulare`) */
function oapMitUmbenanntem(
  roh: Record<string, unknown>,
  alt: string,
  neu: string,
  gehoertZu: (fassung: string) => boolean,
  festschreiben: (u: UmfangEintrag, fassung: string | null) => boolean,
): { roh: Record<string, unknown>; anzahl: number } {
  if (roh.formulare !== undefined) {
    const r = formularVerweiseUmbenennen(roh.formulare, alt, neu, gehoertZu, festschreiben);
    return { roh: { ...roh, formulare: r.abschnitt }, anzahl: r.anzahl };
  }
  const erw = roh.erweiterungen as Record<string, unknown> | undefined;
  if (erw?.formulare !== undefined) {
    const r = formularVerweiseUmbenennen(erw.formulare, alt, neu, gehoertZu, festschreiben);
    return { roh: { ...roh, erweiterungen: { ...erw, formulare: r.abschnitt } }, anzahl: r.anzahl };
  }
  return { roh, anzahl: 0 };
}

/** Namen, die Windows für Geräte reserviert (auch mit Endung) */
const RESERVIERT = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Formular umbenennen (Rechtsklick › Umbenennen …) – nur im selben Ordner, nie über ein vorhandenes. Mit dem Namen
 * ändern sich alle Verweise: die Zuordnung im Antragsumfang (auch eine, die bisher nur über den Namen bestand – sie
 * wird festgeschrieben) und der Autofill-Zustand in allen Anträgen der Projektdatei, ungespeicherte Eingaben und
 * Verlauf (lokal) und – bei einem Formular ohne Kennung – die eigenen Einstellungen (kopiert; sie gelten auch für
 * gleichnamige Formulare anderer Projekte).
 *
 * Ablauf: In einem anderen Programm oder auf einem anderen Rechner geöffnet (Sperrdatei) – nicht umbenannt. Hier
 * geöffnet – kurz geschlossen und danach wieder geöffnet. Die Projektdatei des Projekts wird zu Beginn festgehalten
 * (geschrieben wird in sie, auch wenn inzwischen ein anderes Projekt gewählt ist) und frisch gelesen umgeschrieben.
 * Der neue Name ist gesperrt, bis sie geschrieben ist; scheitert das, wird zurückbenannt.
 */
export async function formularUmbenennen(f: FormularEintrag) {
  const s = useFormulare.getState();
  const { ds, projekt } = s;
  if (!ds || !projekt) return;
  const hier = () => {
    const o = useFormulare.getState().offen;
    return o?.projekt === projekt && o.pfad === f.pfad;
  };
  // die Liste kann veraltet sein (etwa nach dem Schließen) – im Zweifel die Sperrdatei selbst ansehen
  const fremdGesperrt = f.gesperrt && !(hier() && s.offen?.sperre.art === 'eigen') && !!(await ds.sperrePruefen(projekt.root, sperrPfad(f.pfad)).catch(() => true));
  if (fremdGesperrt) return fehler('Umbenennen', new Error(`„${f.name}“ ist gerade in einem anderen Programm oder auf einem anderen Rechner geöffnet – bitte erst dort schließen`));
  if (ablageVon(useFormulare.getState(), projekt) && useFormulare.getState().oap === null) await useFormulare.getState().oapLaden();
  if (useFormulare.getState().projekt !== projekt) return;
  const o = useFormulare.getState().oap;
  const oapZiel = o && o !== 'fehlt' ? { root: o.root, pfad: o.pfad } : null;
  // Zuordnungen: ausdrücklich (formularDatei) oder über Name bzw. Kennung (im aktiven Antrag sichtbar als Dokument)
  const alt = formularSchluessel(f.pfad);
  const gehoertZu = (fassung: string) => {
    if (!f.unterordner) return false;
    const w = unterordnerAnbindung.wahl(projekt);
    return w ? gleicheFassung(f.unterordner, fassung, w.antragsarten, w.arten) : f.unterordner.toLowerCase() === fassung.toLowerCase();
  };
  const pd = useAntrag.getState().projektdatei;
  const zugeordnet = (pd ? formularVerweiseUmbenennen(abschnittVon(pd), alt, alt, gehoertZu).anzahl > 0 : false) || useAntrag.getState().dokumente.some((d) => d.formular?.pfad === f.pfad);
  if (zugeordnet && !oapZiel)
    return fehler(
      'Umbenennen',
      new Error(`„${f.name}“ ist im Antragsumfang zugeordnet, aber die Projektdatei (.oap) lässt sich nicht schreiben – nicht umbenannt, sonst ginge die Zuordnung verloren`),
    );
  // nennt nur, was es gibt: Zuordnung (mit den Werten aus der Projektkarte) und nicht gespeicherte Eingaben
  const entwurf = hatEntwurf(projekt, f.pfad) || (hier() && Object.keys(s.offen!.aenderungen).length > 0);
  const erhalten = [...(zugeordnet ? ['Die Zuordnung im Antragsumfang', 'Werte aus der Projektkarte'] : []), ...(entwurf ? ['nicht gespeicherte Eingaben'] : [])];
  const liste = erhalten.length > 1 ? `${erhalten.slice(0, -1).join(', ')} und ${erhalten.at(-1)}` : (erhalten[0] ?? '');
  const bleibt = liste ? `${liste[0].toUpperCase()}${liste.slice(1)} bleiben erhalten.` : '';
  const eingabe = await frageText(
    'Formular umbenennen',
    f.name,
    'Umbenennen',
    [bleibt, hier() ? 'Das Formular wird dafür kurz geschlossen und danach wieder geöffnet.' : ''].filter(Boolean).join(' ') || undefined,
  );
  const name = eingabe
    ?.trim()
    .replace(/\.frmsjf$/i, '')
    .trim();
  if (!name || name === f.name) return;
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(name)) return fehler('Umbenennen', new Error('Diese Zeichen sind in Dateinamen nicht erlaubt: < > : " / \\ | ? *'));
  if (/\.$/.test(name)) return fehler('Umbenennen', new Error('Ein Dateiname darf nicht auf einen Punkt enden'));
  if (RESERVIERT.test(name)) return fehler('Umbenennen', new Error(`„${name}“ ist unter Windows als Dateiname reserviert`));
  const endung = /\.frmsjf$/i.exec(f.pfad)?.[0] ?? '.frmsjf';
  const ziel = zusammen(ordnerVon(f.pfad), `${name}${endung}`);
  const nurSchreibweise = ziel.toLowerCase() === f.pfad.toLowerCase();
  if (!nurSchreibweise && useFormulare.getState().formulare.some((x) => x.pfad.toLowerCase() === ziel.toLowerCase()))
    return fehler('Umbenennen', new Error(`„${name}“ gibt es in diesem Ordner schon`));
  if (useFormulare.getState().projekt !== projekt) return;
  const neu = formularSchluessel(ziel);
  // Einträge, die das Formular nur über Name bzw. Titel finden, fänden es unter dem neuen Namen womöglich nicht mehr
  const info = useAntrag.getState().formularInfo;
  const vorher = useFormulare.getState().formulare.map((x) => ({ pfad: x.pfad, name: x.name, kennung: info[x.pfad]?.kennung ?? null }));
  const nachher = vorher.map((x) => (x.pfad === f.pfad ? { ...x, pfad: ziel, name } : x));
  // die Formularliste gilt nur für den aktiven Antrag: im Sammelprojekt ein Formular im Unterordner nur in den
  // Anträgen dieses Unterordners, eines der obersten Ebene nur im aktiven Antrag (in den anderen fände der Eintrag womöglich
  // ein gleichnamiges im eigenen Unterordner); im gewöhnlichen Projekt überall
  const sammel = !!useFormulare.getState().sammel;
  const aktiv = useAntrag.getState().projektdatei?.ansicht ?? null;
  const giltListe = (fassung: string | null) => (!sammel ? true : fassung === null ? false : f.unterordner ? gehoertZu(fassung) : fassung === aktiv);
  const festschreiben = (u: UmfangEintrag, fassung: string | null) => giltListe(fassung) && formularVon(u, vorher)?.pfad === f.pfad && formularVon(u, nachher)?.pfad !== ziel;

  // hier geöffnet: schließen – wartet auf ein laufendes Speichern, die eigene Sperre fällt; ungespeicherte Eingaben
  // bleiben als Entwurf und ziehen unten mit um
  const warOffen = hier();
  if (warOffen) {
    if (!(await dateiVerlassen())) return;
    await useFormulare.getState().schliessen();
  }
  const wiederOeffnen = async (pfad: string) => {
    if (!warOffen || useFormulare.getState().projekt !== projekt) return;
    const e = useFormulare.getState().formulare.find((x) => x.pfad === pfad);
    if (e) await useFormulare.getState().formularOeffnen(e);
  };
  const neuLesen = async () => {
    if (useFormulare.getState().projekt === projekt) await useFormulare.getState().formulareNeuLesen();
  };
  // eigene Einstellungen hängen bei Formularen ohne Kennung am Namen
  let profil: [string, string] | null = null;
  try {
    const bytes = await ds.lies(projekt.root, f.pfad);
    if (bytes) {
      const formular = parseFormular(bytes);
      profil = [profilSchluessel(formular, f.name), profilSchluessel(formular, name)];
    }
  } catch {
    // nicht lesbar: ohne eigene Einstellungen
  }
  // ab hier ein Vorgang (Sperre, Umbenennen, Projektdatei, Sperre lösen): vor dem Schließen wird er ganz abgewartet,
  // sonst bliebe das Formular umbenannt ohne Zuordnung bzw. die eigene Sperre liegen
  return vorgang(async () => {
    const r = await ds.rechner();
    const sperre = sperreSchreiben({ benutzer: r.benutzer, computer: r.computer, angemeldet: zeitstempel(new Date()), inGebrauch: String(r.prozess) });
    // den neuen Namen sperren, bis die Projektdatei geschrieben ist – sonst könnte FORMA ihn öffnen und das Zurückbenennen
    // verhindern (nur Groß-/Kleinschreibung: dieselbe Sperrdatei, die Hülle sperrt selbst)
    const zielSperre = sperrPfad(ziel);
    let zielGesperrt = false;
    if (!nurSchreibweise) {
      try {
        zielGesperrt = await ds.sperreSetzen(projekt.root, zielSperre, sperre);
      } catch (e) {
        fehler('Umbenennen', e);
        return wiederOeffnen(f.pfad);
      }
      if (!zielGesperrt) {
        fehler('Umbenennen', new Error(`„${name}“ ist schon als geöffnet markiert (Sperrdatei) – nicht umbenannt. Bitte einen anderen Namen wählen`));
        return wiederOeffnen(f.pfad);
      }
      sperreVermerken(projekt.root, zielSperre, sperre);
    }
    const zielFrei = async () => {
      if (!zielGesperrt) return;
      zielGesperrt = false;
      await ds.sperreLoesen(projekt.root, zielSperre, sperre).catch(() => false);
      sperreVergessen(projekt.root, zielSperre);
    };
    try {
      await ds.formularUmbenennen(projekt.root, f.pfad, ziel, sperre);
    } catch (e) {
      await zielFrei();
      fehler('Umbenennen', e);
      await neuLesen();
      return wiederOeffnen(f.pfad);
    }
    // bei vollem Speicher bleiben Entwurf bzw. Verlauf am alten Namen – das wird gemeldet
    const lokalOk = formularLokalVerschieben(projekt, f.pfad, ziel);
    log.info(`Formular umbenannt: ${f.pfad} → ${ziel}`);
    let verweise = 0;
    let fehlgeschlagen = false;
    if (oapZiel) {
      try {
        // frisch gelesen gezählt und umgeschrieben; ohne Verweise wird nichts geschrieben
        await projektdateiSchreiben(ds.projektordner, oapZiel.root, oapZiel.pfad, (roh) => {
          const x = oapMitUmbenanntem(roh, alt, neu, gehoertZu, festschreiben);
          verweise = x.anzahl;
          return x.roh;
        });
      } catch (e) {
        log.warn(`Projektdatei beim Umbenennen von ${f.pfad} nicht geschrieben: ${e instanceof Error ? e.message : String(e)}`);
        fehlgeschlagen = true;
      }
    }
    if (fehlgeschlagen) {
      // zurück zum alten Namen – sonst verlöre das Formular seine Zuordnung (am neuen Namen liegt noch die eigene Sperre)
      try {
        await ds.formularUmbenennen(projekt.root, ziel, f.pfad, sperre);
        formularLokalVerschieben(projekt, ziel, f.pfad);
        await zielFrei();
        fehler('Umbenennen', new Error(`Die Projektdatei (.oap) ließ sich nicht schreiben – „${f.name}“ heißt weiter so`));
        await neuLesen();
        return wiederOeffnen(f.pfad);
      } catch (e) {
        log.warn(`Alter Name von ${ziel} nicht wiederhergestellt: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await zielFrei();
    if (profil && profil[0] !== profil[1]) useFormulare.getState().profilKopieren(profil[0], profil[1]);
    const ohneEingaben = lokalOk ? '' : ' Nicht gespeicherte Eingaben ließen sich nicht mitnehmen (Speicher voll) – sie gelten weiter für den alten Namen.';
    const zuordnungPruefen = new Error(
      `„${name}“ umbenannt, aber die Projektdatei (.oap) ließ sich nicht schreiben – bitte die Zuordnung in den Antragsdaten von ${projekt.ordner} prüfen.${ohneEingaben}`,
    );
    // inzwischen ein anderes Projekt: die Fehlermeldung trotzdem zeigen, die Erfolgsmeldung entfällt
    if (useFormulare.getState().projekt !== projekt) {
      if (fehlgeschlagen) fehler('Umbenennen', zuordnungPruefen);
      else if (!lokalOk) fehler('Umbenennen', new Error(`„${name}“ umbenannt.${ohneEingaben}`));
      return;
    }
    if (oapZiel) await useFormulare.getState().oapLaden();
    await neuLesen();
    await useAntrag.getState().laden();
    await wiederOeffnen(ziel);
    if (fehlgeschlagen) fehler('Umbenennen', zuordnungPruefen);
    else
      useFormulare.getState().setMeldung({
        art: lokalOk ? 'info' : 'fehler',
        text: `„${f.name}“ in „${name}“ umbenannt${verweise ? ' – die Zuordnung im Antragsumfang ist erhalten geblieben' : ''}.${ohneEingaben}`,
      });
  });
}
