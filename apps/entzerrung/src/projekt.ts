import { logger } from '@core/platform/log';
import { zwischenstandErsetzt, zwischenstandLadenErlaubt, zwischenstandWirdGeladen } from '@core/platform/startschutz';
import { DateiVonAussenGeaendert, isTauri, istPfad, openFileWithPath, pickFile, saveMergedFile } from '@core/platform/files';
import type { ProjektordnerZugriff } from '@core/platform/projektordner';
import { vorDemSchliessen } from '@core/platform/rahmen';
import { ordnerZeigen, verbinde } from '@core/platform/projektordner';
import { fotoEinlesen } from './bilder';
import { ENDUNG, entpacken, packen } from './datei';
import { neueId, neuesFoto } from './model';
import { fotoSchreiben, schreibenAbgeschlossen, schreibenGescheitert, standLesen, standSchreiben } from './speicher';
import { useEntz } from './store';
import { aenderungenSpeichern, fragen, meldung, oeffnenFehlgeschlagen } from '@core/ui/Rueckfrage';
import { dateiStandLesen } from './dateistand';

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
  dokumentLaden({ fotos: [] }, {}, null);
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
    // Stand merken: „Speichern“ schreibt später ohne Dialog hierher und darf eine inzwischen außen geänderte Datei nicht
    // überschreiben. Der Stand wird nach dem Lesen geholt; der Dateidialog liest selbst, ein Stand davor ist nicht zu bekommen.
    const stand = gewaehlt.pfad ? await dateiStandLesen(gewaehlt.pfad) : undefined;
    if (gewaehlt.pfad && stand === undefined) log.warn('Stand der Datei unbekannt – beim Speichern keine Prüfung auf Änderungen von außen', gewaehlt.pfad);
    dokumentLaden(doc, fotos, gewaehlt.pfad ?? gewaehlt.name, false, stand);
    for (const [id, d] of Object.entries(fotos)) await fotoSchreiben(id, d);
    log.info(`Geöffnet: ${gewaehlt.pfad ?? gewaehlt.name}`, { fotos: doc.fotos.length });
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    log.error(`Öffnen fehlgeschlagen: ${name}`, text);
    await oeffnenFehlgeschlagen(e, name || 'Projektdatei', 'Die geöffnete Entzerrung bleibt unverändert.');
  }
}

let speichertGerade: Promise<boolean> | null = null;
/** das letzte Speichern der .entz ist an einem Fehler gescheitert (nicht abgebrochen) */
let speichernGescheitert = false;

/** zählt die Dokumentwechsel: ein Speichern, das erst nach einem Wechsel fertig wird, betrifft das neue Dokument nicht */
let dokumentNr = 0;

/** anderes Dokument (neu, geöffnet, Foto aus dem Projekt): ein gescheitertes Speichern des vorigen zählt nicht mehr */
function dokumentLaden(...args: Parameters<ReturnType<typeof useEntz.getState>['laden']>) {
  dokumentNr++;
  speichernGescheitert = false;
  useEntz.getState().laden(...args);
}

/**
 * true, wenn gespeichert wurde. Ein zweiter Aufruf während des Speicherns wartet auf den ersten. Ändert sich das
 * Projekt während des Schreibens, bleibt es als ungespeichert markiert. `unterNeuemNamen`: immer mit Dateidialog.
 */
export function speichern(unterNeuemNamen = false): Promise<boolean> {
  if (speichertGerade) return speichertGerade;
  // ein gerade bearbeitetes Feld zuerst übernehmen (Strg+S ohne Verlassen des Felds)
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
  speichernGescheitert = false;
  speichertGerade = speichernJetzt(unterNeuemNamen).finally(() => (speichertGerade = null));
  return speichertGerade;
}

const dateiTeil = (pfad: string) => pfad.split(/[\\/]/).pop() ?? pfad;
/** Ordner eines Pfads; eine Laufwerkswurzel mit Trenner („C:\\“), sonst wäre „C:“ laufwerksrelativ */
const ordnerTeil = (pfad: string) => {
  if (!istPfad(pfad)) return null;
  const ordner = pfad.slice(0, Math.max(pfad.lastIndexOf('/'), pfad.lastIndexOf('\\')));
  return /^[A-Za-z]:$/.test(ordner) ? `${ordner}\\` : ordner || null;
};

async function speichernJetzt(unterNeuemNamen: boolean): Promise<boolean> {
  const s = useEntz.getState();
  const nr = dokumentNr;
  // inzwischen ein anderes Dokument (z. B. „Neu“ mit „Nicht speichern“ während des Schreibens): Dateiname, Stand und
  // Fehler des alten nicht auf das neue übertragen – sonst schriebe „Speichern“ das neue ohne Dialog in die alte Datei
  const gewechselt = () => nr !== dokumentNr;
  if (!s.doc.fotos.length) return false;
  // ohne Dialog direkt in die geöffnete Datei (z. B. neben dem Foto im Projekt) – nur, wenn sie noch den gemerkten Stand hat
  const direkt = !unterNeuemNamen && !!s.dateiname && istPfad(s.dateiname);
  const vorschlag = s.dateiname ? dateiTeil(s.dateiname) : `${s.doc.fotos[0].name}.${ENDUNG}`;
  try {
    const name = await saveMergedFile({
      pfad: direkt ? s.dateiname : null,
      defaultName: unterNeuemNamen ? vorschlag.replace(new RegExp(`\\.${ENDUNG}$`, 'i'), ` (Kopie).${ENDUNG}`) : vorschlag,
      defaultDir: s.dateiname ? ordnerTeil(s.dateiname) : null,
      filterName: 'Entzerrung',
      extension: ENDUNG,
      mime: 'application/zip',
      // die bisherige Datei wird nicht gebraucht (die Fotos stecken im Projekt) – bei großen .entz spart das Zeit
      vorhandenLesen: false,
      // im Dialog gewählte Dateien hat man selbst bestätigt; geprüft wird nur das Schreiben ohne Dialog
      ...(direkt && s.dateiStand !== undefined ? { stand: s.dateiStand } : {}),
      build: () => packen(s.doc, s.bilder),
    });
    if (name && gewechselt()) {
      log.info(`Gespeichert: ${name} (inzwischen ein anderes Dokument geöffnet)`);
      return true;
    }
    if (name) {
      const stand = istPfad(name) ? await dateiStandLesen(name) : undefined;
      if (istPfad(name) && stand === undefined) log.warn('Stand nach dem Speichern unbekannt – beim nächsten Speichern keine Prüfung', name);
      if (gewechselt()) return true;
      useEntz.getState().gespeichert(name, s.doc, stand);
      log.info(`Gespeichert: ${name}`);
    }
    return !!name;
  } catch (e) {
    if (gewechselt()) {
      log.warn('Speichern des vorigen Dokuments fehlgeschlagen', e instanceof Error ? e.message : String(e));
      return false;
    }
    if (e instanceof DateiVonAussenGeaendert) {
      log.warn('Speichern abgelehnt: Datei von außen geändert', s.dateiname);
      // „Ordner öffnen“ zeigt den Ordner der Datei (Desktop), danach kommt die Rückfrage wieder – entschieden wird erst dann
      const ordner = s.dateiname ? ordnerTeil(s.dateiname) : null;
      for (;;) {
        const wahl = await fragen({
          titel: 'Datei wurde inzwischen geändert',
          text: `${
            s.dateiStand === null
              ? `„${dateiTeil(s.dateiname ?? '')}“ wurde inzwischen außerhalb von RECTIO angelegt, z. B. auf einem anderen Rechner im Büro.`
              : `„${dateiTeil(s.dateiname ?? '')}“ wurde nach dem Öffnen außerhalb von RECTIO geändert, z. B. auf einem anderen Rechner im Büro.`
          } Sie wurde deshalb nicht überschrieben; Ihre Änderungen sind noch in RECTIO. Unter neuem Namen speichern und danach beide Fassungen vergleichen.`,
          knoepfe: [
            { id: 'abbrechen', label: 'Abbrechen' },
            ...(ordner && isTauri() ? [{ id: 'ordner' as const, label: 'Ordner öffnen' }] : []),
            { id: 'neu', label: 'Unter neuem Namen speichern …', art: 'primary' as const },
          ],
        });
        if (wahl !== 'ordner' || !ordner) return wahl === 'neu' ? speichernJetzt(true) : false;
        try {
          await ordnerZeigen(ordner);
        } catch (err) {
          log.warn('Ordner ließ sich nicht öffnen', { ordner, fehler: String(err) });
          await meldung('Ordner ließ sich nicht öffnen', ordner, err);
        }
      }
    }
    const text = e instanceof Error ? e.message : String(e);
    log.error('Speichern fehlgeschlagen', text);
    speichernGescheitert = true;
    await meldung('Speichern fehlgeschlagen', 'Die Entzerrung ließ sich nicht speichern. Die Änderungen bleiben in der App erhalten.', e);
    return false;
  }
}

export async function fotosHinzufuegen(dateien?: File[]) {
  let liste = dateien;
  if (!liste) {
    liste = await pickFile('image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', { mehrere: true });
  }
  let erstes: string | null = null;
  const fehler: string[] = [];
  for (const d of liste) {
    try {
      const b = await fotoEinlesen(d);
      const id = neueId();
      // erst ins Dokument, dann in den Zwischenspeicher (so räumt ein laufendes Zwischenspeichern es nicht weg)
      useEntz.getState().fotoHinzufuegen(id, b.name, b.mime, b.breite, b.hoehe, b.daten);
      erstes ??= id;
      await fotoSchreiben(id, b.daten);
      log.info(`Foto hinzugefügt: ${d.name}`, { breite: b.breite, hoehe: b.hoehe });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      log.error('Foto konnte nicht hinzugefügt werden', text);
      fehler.push(text.startsWith(d.name) ? text : `${d.name}: ${text}`);
    }
  }
  // bei mehreren: das erste der Auswahl zeigen, nicht das zuletzt gelesene
  if (erstes) useEntz.getState().waehleFoto(erstes);
  // eine Meldung für alle Fehler statt einer je Datei
  if (fehler.length) {
    const titel = liste.length === 1 ? 'Foto ließ sich nicht hinzufügen' : `${fehler.length} von ${liste.length} Fotos ließen sich nicht hinzufügen`;
    await meldung(titel, fehler.join('\n'));
  }
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
      dokumentLaden(doc, fotos, ziel, false, vorhanden.stand);
      for (const [id, d] of Object.entries(fotos)) await fotoSchreiben(id, d);
      log.info(`Geöffnet: ${ziel}`, { fotos: doc.fotos.length });
      return;
    }
    const daten = await fs.lies(root, pfad);
    const name = pfad.split('/').pop()!;
    const b = await fotoEinlesen(new File([daten as BlobPart], name));
    const id = neueId();
    // die .entz gibt es noch nicht (Stand null): legt sie inzwischen jemand anders an, wird sie nicht überschrieben
    dokumentLaden({ fotos: [neuesFoto(id, b.name, b.mime, b.breite, b.hoehe)] }, { [id]: b.daten }, ziel, false, null);
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
    useEntz.getState().laden(z.stand.doc, z.bilder, z.stand.dateiname, z.stand.dirty, z.stand.dateiStand);
    log.info('Zwischenstand wiederhergestellt', { fotos: z.stand.doc.fotos.length });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** das zuletzt angestoßene Schreiben samt Startschutz-Vermerk */
  let zuletzt: Promise<void> = Promise.resolve();
  /** läuft das zuletzt angestoßene Schreiben noch? (ein älteres, später fertiges ändert das nicht) */
  let standLaeuft = false;
  const schreiben = () => {
    timer = undefined;
    const a = useEntz.getState();
    standLaeuft = true;
    // den Startschutz-Vermerk erst nach gelungenem Stand ersetzen – sonst lädt der nächste Start den ausgesetzten alten
    const p: Promise<void> = standSchreiben({ doc: a.doc, dateiname: a.dateiname, dateiStand: a.dateiStand, dirty: a.dirty }, a.bilder, () => verwendeteFotos(useEntz.getState()))
      .then((ok) => void (ok && zwischenstandErsetzt(APP)))
      .catch((e) => log.warn('Startschutz-Vermerk fehlgeschlagen', e))
      .finally(() => zuletzt === p && (standLaeuft = false));
    zuletzt = p;
  };
  // beim Schließen den ausstehenden Stand sofort schreiben
  const sofort = () => timer !== undefined && (clearTimeout(timer), schreiben());
  window.addEventListener('pagehide', sofort);
  window.addEventListener('beforeunload', sofort);
  // vor dem Schließen, Andocken, Herauslösen und Update-Neustart in Arkly: erst ein laufendes Speichern der .entz abwarten
  // (es ändert danach noch den Stand), dann den ausstehenden – oder zuletzt gescheiterten – Zwischenstand sofort schreiben
  // und alles laufende Schreiben abwarten. Ein zweiter Aufruf wartet nur, statt erneut zu schreiben; nach einem Fehler
  // („Erneut versuchen“) schreibt er den Zwischenstand noch einmal. false (der Grund steht im Protokoll), solange ein
  // Schreiben gescheitert ist – beim Zwischenstand bis zum nächsten gelungenen, bei der .entz, bis wieder gespeichert ist
  // (die .entz wird nicht von selbst erneut gespeichert, das braucht womöglich einen Dialog). Dann fragt Arkly nach.
  const vorbereiten = async (): Promise<boolean> => {
    await Promise.allSettled([speichertGerade]);
    if (timer !== undefined || (schreibenGescheitert() && !standLaeuft)) {
      clearTimeout(timer);
      schreiben();
    }
    await Promise.allSettled([zuletzt]);
    const ok = await schreibenAbgeschlossen();
    return ok && !(speichernGescheitert && useEntz.getState().dirty);
  };
  const abmelden = vorDemSchliessen(vorbereiten);
  const ende = useEntz.subscribe((s, vorher) => {
    if (s.doc === vorher.doc && s.dateiname === vorher.dateiname && s.dateiStand === vorher.dateiStand && s.dirty === vorher.dirty) return;
    clearTimeout(timer);
    timer = setTimeout(schreiben, 600);
  });
  return () => {
    ende();
    abmelden();
    clearTimeout(timer);
    window.removeEventListener('pagehide', sofort);
    window.removeEventListener('beforeunload', sofort);
  };
}

/** Fotos, die das Dokument oder der Rückgängig-Verlauf noch braucht (die übrigen darf der Zwischenspeicher löschen) */
export function verwendeteFotos(s: Pick<ReturnType<typeof useEntz.getState>, 'doc' | 'vergangenheit' | 'zukunft'>): Set<string> {
  return new Set([s.doc, ...s.vergangenheit, ...s.zukunft].flatMap((d) => d.fotos.map((f) => f.id)));
}
