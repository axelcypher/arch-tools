import { logger } from '@core/platform/log';
import { zwischenstandErsetzt, zwischenstandLadenErlaubt, zwischenstandWirdGeladen } from '@core/platform/startschutz';
import { istPfad, pickFile, saveMergedFile } from '@core/platform/files';
import type { ProjektordnerZugriff } from '@core/platform/projektordner';
import { verbinde } from '@core/platform/projektordner';
import { fotoEinlesen } from './bilder';
import { ENDUNG, entpacken, packen } from './datei';
import { neueId, neuesFoto } from './model';
import { fotoSchreiben, standLesen, standSchreiben } from './speicher';
import { useEntz } from './store';

/** Projekt neu, öffnen, speichern, Fotos hinzufügen und automatisch zwischenspeichern */

const log = logger('projekt');

function verwerfenOk(): boolean {
  return !useEntz.getState().dirty || window.confirm('Ungespeicherte Änderungen verwerfen?');
}

export function neu() {
  if (!verwerfenOk()) return;
  useEntz.getState().laden({ fotos: [] }, {}, null);
  log.info('Neues Projekt');
}

export async function oeffnen(datei?: File) {
  if (!datei && !verwerfenOk()) return;
  const f = datei ?? (await pickFile(`.${ENDUNG}`));
  if (!f) return;
  if (datei && !verwerfenOk()) return;
  try {
    const { doc, fotos } = entpacken(new Uint8Array(await f.arrayBuffer()));
    useEntz.getState().laden(doc, fotos, f.name);
    for (const [id, d] of Object.entries(fotos)) await fotoSchreiben(id, d);
    log.info(`Geöffnet: ${f.name}`, { fotos: doc.fotos.length });
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    log.error(`Öffnen fehlgeschlagen: ${f.name}`, text);
    window.alert(text);
  }
}

export async function speichern() {
  const s = useEntz.getState();
  if (!s.doc.fotos.length) return;
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
      useEntz.getState().gespeichert(name);
      log.info(`Gespeichert: ${name}`);
    }
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    log.error('Speichern fehlgeschlagen', text);
    window.alert(`Speichern fehlgeschlagen: ${text}`);
  }
}

export async function fotosHinzufuegen(dateien?: File[]) {
  let liste = dateien;
  if (!liste) {
    const f = await pickFile('image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,.heic');
    liste = f ? [f] : [];
  }
  for (const d of liste) {
    try {
      const b = await fotoEinlesen(d);
      const id = neueId();
      await fotoSchreiben(id, b.daten);
      useEntz.getState().fotoHinzufuegen(id, b.name, b.mime, b.breite, b.hoehe, b.daten);
      log.info(`Foto hinzugefügt: ${d.name}`, { breite: b.breite, hoehe: b.hoehe });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      log.error('Foto konnte nicht hinzugefügt werden', text);
      window.alert(text);
    }
  }
}

/* ---------- Fotos im Projektordner ---------- */

/** Fotos, die die Entzerrung lesen kann */
export const FOTO_ENDUNG = /\.(jpe?g|png|webp)$/i;

/** die Entzerrungsdatei eines Fotos: daneben, gleicher Name, Endung .entz */
export const entzZuFoto = (fotoPfad: string) => `${fotoPfad.replace(/\.[^./\\]+$/, '')}.${ENDUNG}`;

/**
 * Foto aus dem Projekt öffnen: Gibt es daneben schon seine Entzerrung (.entz), wird sie geöffnet; sonst beginnt
 * eine neue mit diesem Foto. „Speichern“ schreibt die .entz neben das Foto – ohne Rückfrage.
 * `root` ist der Fotoordner, `pfad` das Foto darin.
 */
export async function fotoImProjektOeffnen(fs: ProjektordnerZugriff, root: string, pfad: string): Promise<void> {
  if (!verwerfenOk()) return;
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
    await fotoSchreiben(id, b.daten);
    useEntz.getState().laden({ fotos: [neuesFoto(id, b.name, b.mime, b.breite, b.hoehe)] }, { [id]: b.daten }, ziel);
    useEntz.getState().waehleFoto(id);
    log.info(`Foto geöffnet: ${verbinde(root, pfad)}`, { breite: b.breite, hoehe: b.hoehe });
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    log.error(`Öffnen fehlgeschlagen: ${pfad}`, text);
    window.alert(text);
  }
}

/** Dateien aus Ziehen & Ablegen: Projektdatei öffnen oder Fotos hinzufügen */
export async function ablegen(dateien: File[]) {
  const projekt = dateien.find((d) => d.name.toLowerCase().endsWith(`.${ENDUNG}`));
  if (projekt) return oeffnen(projekt);
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
  return useEntz.subscribe((s, vorher) => {
    if (s.doc === vorher.doc && s.dateiname === vorher.dateiname && s.dirty === vorher.dirty) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const a = useEntz.getState();
      void standSchreiben({ doc: a.doc, dateiname: a.dateiname, dirty: a.dirty }).then(() => zwischenstandErsetzt(APP));
    }, 600);
  });
}
