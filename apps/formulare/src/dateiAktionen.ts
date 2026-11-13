/**
 * Dateibefehle im Projektordner (Kontextmenü): kopieren und einfügen, duplizieren, umbenennen, löschen und mit
 * einem Antragsdokument verknüpfen. Geschrieben wird über die Befehle der Hülle – nichts wird überschrieben, gelöscht
 * wird nur von Hand und erst nach einer Sicherungskopie. Formulare lassen sich löschen, wenn sie nirgends geöffnet
 * sind; Sperrdateien, Projektkarte und Projekttitel verwaltet nur FORMA.
 */

import { create } from 'zustand';
import { gleicheFassung } from '@core/fassung';
import { logger } from '@core/platform/log';
import { aktiveFassung, antragsOrdner, antragSperre, useAntrag, wechselLaeuft } from './antragStore';
import type { SchreibInfo } from './antragStore';
import { abschnittVon, formularSchluessel, formularVerweiseUmbenennen, klein } from './antrag';
import { bestaetigen, frageText } from './components/Rueckfrage';
import { nurFormaLoescht, verbinde } from './dateisystem';
import { parseFormular } from './forma/formular';
import { sperreSchreiben, zeitstempel } from './forma/sperre';
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
function oapMitUmbenanntem(roh: Record<string, unknown>, alt: string, neu: string, gehoertZu: (fassung: string) => boolean): Record<string, unknown> {
  if (roh.formulare !== undefined) return { ...roh, formulare: formularVerweiseUmbenennen(roh.formulare, alt, neu, gehoertZu).abschnitt };
  const erw = roh.erweiterungen as Record<string, unknown> | undefined;
  if (erw?.formulare !== undefined) return { ...roh, erweiterungen: { ...erw, formulare: formularVerweiseUmbenennen(erw.formulare, alt, neu, gehoertZu).abschnitt } };
  return roh;
}

/**
 * Formular umbenennen (Rechtsklick › Umbenennen …) – nur im selben Ordner, nie über ein vorhandenes. Mit dem Namen
 * ändern sich alle Verweise: die Zuordnung im Antragsumfang und der Autofill-Zustand in allen Anträgen der Projektdatei,
 * ungespeicherte Eingaben und Verlauf (lokal) und – bei einem Formular ohne Kennung – die eigenen Einstellungen
 * (kopiert; sie gelten auch für gleichnamige Formulare anderer Projekte). In FORMA oder auf einem anderen Rechner
 * geöffnet (Sperrdatei): nicht umbenannt. Hier geöffnet: kurz geschlossen und danach wieder geöffnet. Lässt sich die
 * Projektdatei nicht schreiben, wird die Umbenennung zurückgenommen – nichts verliert seine Zuordnung.
 */
export async function formularUmbenennen(f: FormularEintrag) {
  const s = useFormulare.getState();
  const { ds, projekt } = s;
  if (!ds || !projekt) return;
  const hier = () => {
    const o = useFormulare.getState().offen;
    return o?.projekt === projekt && o.pfad === f.pfad;
  };
  if (f.gesperrt && !(hier() && s.offen?.sperre.art === 'eigen'))
    return fehler('Umbenennen', new Error(`„${f.name}“ ist gerade in einem anderen Programm oder auf einem anderen Rechner geöffnet – bitte erst dort schließen`));
  // Verweise in der Projektdatei: im Unterordner eines Sammelprojekts gehören ältere Zuordnungen nur mit dem
  // Dateinamen zu den Anträgen dieses Unterordners. Schon vor der Rückfrage gezählt – sie nennt die Zuordnung nur, wenn es eine gibt
  const alt = formularSchluessel(f.pfad);
  const gehoertZu = (fassung: string) => {
    if (!f.unterordner) return false;
    const w = unterordnerAnbindung.wahl(projekt);
    return w ? gleicheFassung(f.unterordner, fassung, w.antragsarten, w.arten) : f.unterordner.toLowerCase() === fassung.toLowerCase();
  };
  const verweiseZaehlen = () => {
    const pd = useAntrag.getState().projektdatei;
    return pd ? formularVerweiseUmbenennen(abschnittVon(pd), alt, alt, gehoertZu).anzahl : 0;
  };
  const zugeordnet = verweiseZaehlen() > 0;
  const bleibt = zugeordnet ? 'Die Zuordnung im Antragsumfang, Werte aus der Projektkarte und nicht gespeicherte Eingaben bleiben erhalten.' : 'Nicht gespeicherte Eingaben bleiben erhalten.';
  const eingabe = await frageText('Formular umbenennen', f.name, 'Umbenennen', `${bleibt}${hier() ? ' Das Formular wird dafür kurz geschlossen und danach wieder geöffnet.' : ''}`);
  const name = eingabe
    ?.trim()
    .replace(/\.frmsjf$/i, '')
    .trim();
  if (!name || name === f.name) return;
  if (/[<>:"/\\|?*]/.test(name)) return fehler('Umbenennen', new Error('Diese Zeichen sind in Dateinamen nicht erlaubt: < > : " / \\ | ? *'));
  if (/\.$/.test(name)) return fehler('Umbenennen', new Error('Ein Dateiname darf nicht auf einen Punkt enden'));
  const endung = /\.frmsjf$/i.exec(f.pfad)?.[0] ?? '.frmsjf';
  const ziel = `${ordnerVon(f.pfad)}/${name}${endung}`;
  const nurSchreibweise = ziel.toLowerCase() === f.pfad.toLowerCase();
  if (!nurSchreibweise && useFormulare.getState().formulare.some((x) => x.pfad.toLowerCase() === ziel.toLowerCase()))
    return fehler('Umbenennen', new Error(`„${name}“ gibt es in diesem Ordner schon`));
  const neu = formularSchluessel(ziel);
  if (ablageVon(useFormulare.getState(), projekt) && useFormulare.getState().oap === null) await useFormulare.getState().oapLaden();
  // nach der Rückfrage noch einmal: inzwischen kann jemand zugeordnet haben
  const verweise = verweiseZaehlen();
  const oap = useFormulare.getState().oap;
  if (verweise && (!oap || oap === 'fehlt'))
    return fehler(
      'Umbenennen',
      new Error(`„${f.name}“ ist im Antragsumfang zugeordnet, aber die Projektdatei (.oap) lässt sich nicht schreiben – nicht umbenannt, sonst ginge die Zuordnung verloren`),
    );
  if (useFormulare.getState().projekt !== projekt) return;
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
  const r = await ds.rechner();
  const sperre = sperreSchreiben({ benutzer: r.benutzer, computer: r.computer, angemeldet: zeitstempel(new Date()), inGebrauch: String(r.prozess) });
  try {
    await ds.formularUmbenennen(projekt.root, f.pfad, ziel, sperre);
  } catch (e) {
    fehler('Umbenennen', e);
    await useFormulare.getState().formulareNeuLesen();
    return wiederOeffnen(f.pfad);
  }
  formularLokalVerschieben(projekt, f.pfad, ziel);
  log.info(`Formular umbenannt: ${f.pfad} → ${ziel}`);
  if (verweise) {
    let geschrieben = false;
    try {
      geschrieben = await useFormulare.getState().oapAendern((roh) => oapMitUmbenanntem(roh, alt, neu, gehoertZu));
    } catch (e) {
      // der technische Grund ins Protokoll, die Meldung bleibt kurz
      log.warn(`Projektdatei beim Umbenennen von ${f.pfad} nicht geschrieben: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!geschrieben) {
      // zurück zum alten Namen – sonst verlöre das Formular seine Zuordnung
      try {
        await ds.formularUmbenennen(projekt.root, ziel, f.pfad, sperre);
        formularLokalVerschieben(projekt, ziel, f.pfad);
        fehler('Umbenennen', new Error(`Die Projektdatei (.oap) ließ sich nicht schreiben – „${f.name}“ heißt weiter so`));
        await useFormulare.getState().formulareNeuLesen();
        return wiederOeffnen(f.pfad);
      } catch (e) {
        log.warn(`Alter Name von ${ziel} nicht wiederhergestellt: ${e instanceof Error ? e.message : String(e)}`);
        fehler('Umbenennen', new Error(`„${name}“ umbenannt, aber die Projektdatei (.oap) ließ sich nicht schreiben – bitte die Zuordnung in den Antragsdaten prüfen`));
      }
    }
  }
  if (profil && profil[0] !== profil[1]) useFormulare.getState().profilKopieren(profil[0], profil[1]);
  if (useFormulare.getState().projekt !== projekt) return;
  await useFormulare.getState().formulareNeuLesen();
  await useAntrag.getState().laden();
  await wiederOeffnen(ziel);
  const m = useFormulare.getState().meldung;
  if (!(m?.art === 'fehler' && m.text.startsWith('Umbenennen')))
    useFormulare.getState().setMeldung({ art: 'info', text: `„${f.name}“ in „${name}“ umbenannt${verweise ? ' – die Zuordnung im Antragsumfang ist erhalten geblieben' : ''}.` });
}
