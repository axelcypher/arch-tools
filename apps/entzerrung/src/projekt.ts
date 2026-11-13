import { logger } from '@core/platform/log';
import { zwischenstandErsetzt, zwischenstandLadenErlaubt, zwischenstandWirdGeladen } from '@core/platform/startschutz';
import { istPfad, openFileWithPath, saveMergedFile } from '@core/platform/files';
import type { ProjektordnerZugriff } from '@core/platform/projektordner';
import { verbinde } from '@core/platform/projektordner';
import { fotoEinlesen } from './bilder';
import { ENDUNG, entpacken, packen } from './datei';
import { neueId, neuesFoto } from './model';
import { fotoSchreiben, standLesen, standSchreiben } from './speicher';
import { useEntz } from './store';
import { aenderungenSpeichern, meldung, oeffnenFehlgeschlagen } from '@core/ui/Rueckfrage';

/** Projekt neu, öffnen, speichern, Fotos hinzufügen und automatisch zwischenspeichern */

const log = logger('projekt');

/** vor Neu/Öffnen: ungespeicherte Änderungen speichern, verwerfen oder abbrechen; true = weiter */
export async function verwerfenOk(): Promise<boolean> {
  const s = useEntz.getState();
  if (!s.dirty) return true;
  return aenderungenSpeichern(s.dateiname?.split(/[\\/]/).pop() ?? s.doc.fotos[0]?.name ?? 'Entzerrung', () => speichern());
}

export async function neu() {
  if (!(await verwerfenOk())) return;
  useEntz.getState().laden({ fotos: [] }, {}, null);
  log.info('Neues Projekt');
}

/** Projektdatei öffnen: aus dem Dateidialog (auf dem Desktop mit Pfad, damit „Speichern“ in dieselbe Datei schreibt) oder abgelegt */
export async function oeffnen(datei?: File) {
  if (!(await verwerfenOk())) return;
  let name = datei?.name ?? '';
  try {
    let gewaehlt: { name: string; pfad: string | null; bytes: Uint8Array } | null;
    if (datei) {
      // abgelegte Datei: auf dem Desktop trägt sie ihren Pfad mit (Tauri/Electron), im Browser nicht
      const pfad = (datei as File & { path?: string }).path;
      gewaehlt = { name: datei.name, pfad: pfad && istPfad(pfad) ? pfad : null, bytes: new Uint8Array(await datei.arrayBuffer()) };
    } else gewaehlt = await openFileWithPath({ filterName: 'Entzerrung', extensions: [ENDUNG] });
    if (!gewaehlt) return;
    name = gewaehlt.name;
    const { doc, fotos } = entpacken(gewaehlt.bytes);
    useEntz.getState().laden(doc, fotos, gewaehlt.pfad ?? gewaehlt.name);
    for (const [id, d] of Object.entries(fotos)) await fotoSchreiben(id, d);
    log.info(`Geöffnet: ${gewaehlt.pfad ?? gewaehlt.name}`, { fotos: doc.fotos.length });
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    log.error(`Öffnen fehlgeschlagen: ${name}`, text);
    await oeffnenFehlgeschlagen(e, name || 'Projektdatei', 'Die geöffnete Entzerrung bleibt unverändert.');
  }
}

let speichertGerade: Promise<boolean> | null = null;

/**
 * true, wenn gespeichert wurde. Ein zweiter Aufruf während des Speicherns wartet auf den ersten. Ändert sich das
 * Projekt während des Schreibens, bleibt es als ungespeichert markiert.
 */
export function speichern(): Promise<boolean> {
  if (speichertGerade) return speichertGerade;
  // ein gerade bearbeitetes Feld zuerst übernehmen (Strg+S ohne Verlassen des Felds)
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
  speichertGerade = speichernJetzt().finally(() => (speichertGerade = null));
  return speichertGerade;
}

async function speichernJetzt(): Promise<boolean> {
  const s = useEntz.getState();
  if (!s.doc.fotos.length) return false;
  const vorschlag = s.dateiname ?? `${s.doc.fotos[0].name}.${ENDUNG}`;
  try {
    const name = await saveMergedFile({
      // neben dem Foto im Projekt: ohne Rückfrage in diese Datei (sie gehört der Entzerrung)
      pfad: s.dateiname && istPfad(s.dateiname) ? s.dateiname : null,
      defaultName: vorschlag,
      filterName: 'Entzerrung',
      extension: ENDUNG,
      mime: 'application/zip',
      build: () => packen(s.doc, s.bilder),
    });
    if (name) {
      useEntz.getState().gespeichert(name, s.doc);
      log.info(`Gespeichert: ${name}`);
    }
    return !!name;
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    log.error('Speichern fehlgeschlagen', text);
    await meldung('Speichern fehlgeschlagen', 'Die Entzerrung ließ sich nicht speichern. Die Änderungen bleiben in der App erhalten.', e);
    return false;
  }
}

export async function fotosHinzufuegen(dateien?: File[]) {
  let liste = dateien;
  if (!liste) {
    liste = await fotosWaehlen();
  }
  for (const d of liste) {
    try {
      const b = await fotoEinlesen(d);
      const id = neueId();
      // erst ins Dokument, dann in den Zwischenspeicher (so räumt ein laufendes Zwischenspeichern es nicht weg)
      useEntz.getState().fotoHinzufuegen(id, b.name, b.mime, b.breite, b.hoehe, b.daten);
      await fotoSchreiben(id, b.daten);
      log.info(`Foto hinzugefügt: ${d.name}`, { breite: b.breite, hoehe: b.hoehe });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      log.error('Foto konnte nicht hinzugefügt werden', text);
      await meldung('Foto ließ sich nicht hinzufügen', `${d.name}: ${text}`, e);
    }
  }
}

/** Dateidialog für Fotos mit Mehrfachauswahl */
function fotosWaehlen(): Promise<File[]> {
  if (typeof document === 'undefined') return Promise.resolve([]);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

/* ---------- Fotos im Projektordner ---------- */

/** Fotos, die RECTIO lesen kann */
export const FOTO_ENDUNG = /\.(jpe?g|png|webp)$/i;

/** die Entzerrungsdatei eines Fotos: daneben, gleicher Name, Endung .entz */
export const entzZuFoto = (fotoPfad: string) => `${fotoPfad.replace(/\.[^./\\]+$/, '')}.${ENDUNG}`;

/**
 * Foto aus dem Projekt öffnen: Gibt es daneben schon seine Entzerrung (.entz), wird sie geöffnet; sonst beginnt
 * eine neue mit diesem Foto. „Speichern“ schreibt die .entz neben das Foto – ohne Rückfrage.
 * `root` ist der Fotoordner, `pfad` das Foto darin.
 */
export async function fotoImProjektOeffnen(fs: ProjektordnerZugriff, root: string, pfad: string): Promise<void> {
  if (!(await verwerfenOk())) return;
  const entz = entzZuFoto(pfad);
  const ziel = verbinde(root, entz);
  try {
    const vorhanden = await fs.liesMitStand(root, entz);
    if (vorhanden) {
      const { doc, fotos } = entpacken(vorhanden.daten);
      useEntz.getState().laden(doc, fotos, ziel);
      for (const [id, d] of Object.entries(fotos)) await fotoSchreiben(id, d);
      log.info(`Geöffnet: ${ziel}`, { fotos: doc.fotos.length });
      return;
    }
    const daten = await fs.lies(root, pfad);
    const name = pfad.split('/').pop()!;
    const b = await fotoEinlesen(new File([daten as BlobPart], name));
    const id = neueId();
    useEntz.getState().laden({ fotos: [neuesFoto(id, b.name, b.mime, b.breite, b.hoehe)] }, { [id]: b.daten }, ziel);
    await fotoSchreiben(id, b.daten);
    log.info(`Foto geöffnet: ${verbinde(root, pfad)}`, { breite: b.breite, hoehe: b.hoehe });
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    log.error(`Öffnen fehlgeschlagen: ${pfad}`, text);
    await oeffnenFehlgeschlagen(e, pfad, 'Die geöffnete Entzerrung bleibt unverändert.');
  }
}

/** Dateien aus Ziehen & Ablegen: Projektdatei öffnen oder Fotos hinzufügen */
export async function ablegen(dateien: File[]) {
  const projekt = dateien.find((d) => d.name.toLowerCase().endsWith(`.${ENDUNG}`));
  if (projekt) {
    const uebrig = dateien.length - 1;
    await oeffnen(projekt);
    if (uebrig)
      await meldung(
        'Nur die Projektdatei geöffnet',
        `${uebrig === 1 ? 'Die übrige Datei wurde' : `Die übrigen ${uebrig} Dateien wurden`} nicht hinzugefügt – Fotos bitte nach dem Öffnen getrennt ablegen.`,
      );
    return;
  }
  return fotosHinzufuegen(dateien);
}

/** Startschutz: nach einem Absturz beim letzten Laden wird der Zwischenstand nicht erneut geladen */
const APP = 'entzerrung';

/** Zwischenstand laden und danach jede Änderung zwischenspeichern */
export async function zwischenspeicherStarten(): Promise<() => void> {
  const z = zwischenstandLadenErlaubt(APP) ? await standLesen() : null;
  if (z && z.stand.doc.fotos.length) {
    zwischenstandWirdGeladen(APP);
    useEntz.getState().laden(z.stand.doc, z.bilder, z.stand.dateiname, z.stand.dirty);
    log.info('Zwischenstand wiederhergestellt', { fotos: z.stand.doc.fotos.length });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schreiben = () => {
    timer = undefined;
    const a = useEntz.getState();
    void standSchreiben({ doc: a.doc, dateiname: a.dateiname, dirty: a.dirty }, a.bilder, () => verwendeteFotos(useEntz.getState())).then(() => zwischenstandErsetzt(APP));
  };
  // beim Schließen den ausstehenden Stand sofort schreiben
  const sofort = () => timer !== undefined && (clearTimeout(timer), schreiben());
  window.addEventListener('pagehide', sofort);
  window.addEventListener('beforeunload', sofort);
  const ende = useEntz.subscribe((s, vorher) => {
    if (s.doc === vorher.doc && s.dateiname === vorher.dateiname && s.dirty === vorher.dirty) return;
    clearTimeout(timer);
    timer = setTimeout(schreiben, 600);
  });
  return () => {
    ende();
    clearTimeout(timer);
    window.removeEventListener('pagehide', sofort);
    window.removeEventListener('beforeunload', sofort);
  };
}

/** Fotos, die das Dokument oder der Rückgängig-Verlauf noch braucht (die übrigen darf der Zwischenspeicher löschen) */
export function verwendeteFotos(s: Pick<ReturnType<typeof useEntz.getState>, 'doc' | 'vergangenheit' | 'zukunft'>): Set<string> {
  return new Set([s.doc, ...s.vergangenheit, ...s.zukunft].flatMap((d) => d.fotos.map((f) => f.id)));
}
