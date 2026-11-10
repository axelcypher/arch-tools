import type { Eintrag } from './dateisystem';
import { dateimuster, nameAus } from './nummer';
import type { ProjektAngaben } from './stammdaten';
import { PROJEKT_DATEI } from './stammdaten';
import type { Struktur } from './struktur';
import { normPfad, regelGilt, sichererName } from './struktur';

/**
 * Prüfmodus: vorhandenen Projektordner mit der Struktur vergleichen und Abweichungen melden – auch, ob er eine
 * Projektdatei (.oap) hat.
 * Das Tool meldet nur – es verschiebt, benennt und löscht nichts. Fehlende Ordner lassen sich auf Wunsch
 * nachträglich anlegen.
 */

export type BefundArt = 'fehler' | 'warnung' | 'hinweis' | 'ok';

export interface Befund {
  art: BefundArt;
  titel: string;
  text?: string;
  /** betroffene Pfade im Projektordner */
  pfade?: string[];
}

export interface Pruefergebnis {
  befunde: Befund[];
  /** Ordner der Struktur, die fehlen (für „Fehlende Ordner anlegen“) */
  fehlendeOrdner: string[];
  ordner: number;
  dateien: number;
}

const SYSTEMDATEI = /^(thumbs\.db|desktop\.ini|\.ds_store|~\$.*|\..*)$/i;
/** längere Pfade machen unter Windows Schwierigkeiten (Grenze 260 Zeichen einschließlich Laufwerk und Stammordner) */
const PFAD_LANG = 200;

/** Woher die Angaben zum Projekt stammen */
export interface ProjektQuelle {
  /** Pfad der Projektdatei (.oap) im Projektordner; fehlt, wenn es keine gibt */
  pfad?: string;
  /** die Angaben stammen (nur) aus der alten projekt.json */
  alteProjektJson?: boolean;
  /** Projektdatei vorhanden, aber nicht lesbar */
  fehler?: string;
}

export function pruefe(ordnerName: string, eintraege: Eintrag[], struktur: Struktur, projekt: ProjektAngaben | null, quelle: ProjektQuelle = {}): Pruefergebnis {
  const befunde: Befund[] = [];
  const ordner = eintraege.filter((e) => e.ordner);
  const dateien = eintraege.filter((e) => !e.ordner && !SYSTEMDATEI.test(e.pfad.split('/').pop()!));
  const da = new Set(ordner.map((e) => e.pfad.toLowerCase()));

  /* Projektdatei und Stammdaten */
  const beschreibung = (p: ProjektAngaben) =>
    `${p.nummer} ${p.kurzname}${p.angelegt ? `, angelegt am ${new Date(p.angelegt).toLocaleDateString('de-DE')}` : ''}${p.struktur ? `, Struktur „${p.struktur}“` : ''}`;
  if (quelle.fehler) befunde.push({ art: 'fehler', titel: 'Die Projektdatei (.oap) ist nicht lesbar', text: quelle.fehler, ...(quelle.pfad ? { pfade: [quelle.pfad] } : {}) });
  else if (projekt && quelle.pfad) befunde.push({ art: 'ok', titel: 'Projektdatei vorhanden', text: `${quelle.pfad} – ${beschreibung(projekt)}` });
  else if (projekt && quelle.alteProjektJson)
    befunde.push({
      art: 'warnung',
      titel: 'Projektdatei (.oap) fehlt – Stammdaten aus der alten projekt.json',
      text: `${beschreibung(projekt)}. „Projekt ergänzen“ legt die Projektdatei mit diesen Stammdaten an; die ${PROJEKT_DATEI} bleibt liegen.`,
    });
  else befunde.push({ art: 'warnung', titel: 'Projektdatei (.oap) fehlt', text: 'Jedes Projekt hat eine Projektdatei mit den Stammdaten. „Projekt ergänzen“ legt sie an. Geprüft wird gegen die vollständige Struktur.' });
  if (projekt) {
    const soll = sichererName(nameAus(struktur.ordnername, { nummer: projekt.nummer, kurzname: projekt.kurzname, jahr: projekt.angelegt.slice(0, 4) }));
    // ohne Kurzname (etwa eine Projektdatei aus der Formulare-App) lässt sich der Name nicht beurteilen
    const vollstaendig = projekt.nummer && (projekt.kurzname || !/kurzname/i.test(struktur.ordnername));
    if (soll && vollstaendig && soll.toLowerCase() !== ordnerName.toLowerCase())
      befunde.push({ art: 'warnung', titel: 'Der Ordnername weicht vom Schema ab', text: `Der Ordner heißt „${ordnerName}“, nach dem Schema „${struktur.ordnername}“ und den Stammdaten wäre es „${soll}“.` });
  }

  /* Ordner der Struktur */
  const lph = projekt?.leistungsphasen ?? [];
  const werte = { nummer: projekt?.nummer ?? '', kurzname: projekt?.kurzname ?? '', jahr: projekt?.angelegt.slice(0, 4) ?? '' };
  const ziel = (p: string) =>
    normPfad(p)
      .split('/')
      .map((t) => sichererName(nameAus(t, werte)))
      .filter(Boolean)
      .join('/');
  const regeln = struktur.ordner.filter((r) => regelGilt(r, lph)).map((r) => ({ ...r, pfad: ziel(r.pfad) }));
  const fehlendeOrdner = regeln.map((r) => r.pfad).filter((p) => p && !da.has(p.toLowerCase()));
  if (fehlendeOrdner.length) befunde.push({ art: 'warnung', titel: `${fehlendeOrdner.length} Ordner der Struktur ${fehlendeOrdner.length === 1 ? 'fehlt' : 'fehlen'}`, pfade: fehlendeOrdner });
  else if (regeln.length) befunde.push({ art: 'ok', titel: `Alle ${regeln.length} Ordner der Struktur sind vorhanden` });

  // Ordner außerhalb der Struktur: auf Ebenen, die die Struktur vorgibt (Stamm und Ordner mit vorgegebenen Unterordnern)
  const bekannt = new Set<string>();
  const vorgegebeneEltern = new Set<string>(['']);
  for (const r of struktur.ordner) {
    const teile = ziel(r.pfad).toLowerCase().split('/');
    for (let i = 1; i <= teile.length; i++) {
      bekannt.add(teile.slice(0, i).join('/'));
      if (i < teile.length) vorgegebeneEltern.add(teile.slice(0, i).join('/'));
    }
  }
  const fremd = ordner
    .map((e) => e.pfad)
    .filter((p) => {
      const k = p.toLowerCase();
      const eltern = k.split('/').slice(0, -1).join('/');
      return vorgegebeneEltern.has(eltern) && !bekannt.has(k);
    });
  if (fremd.length) befunde.push({ art: 'hinweis', titel: `${fremd.length} Ordner ${fremd.length === 1 ? 'steht' : 'stehen'} nicht in der Struktur`, text: 'Auf Ebenen, die die Struktur vorgibt, liegen zusätzliche Ordner.', pfade: fremd });

  /* lose Dateien im Stamm */
  const erlaubtImStamm = /\.(oap|md|lnk|url)$/i;
  // die alte projekt.json (bis 0.2) darf liegen bleiben – gelöscht wird nichts
  const lose = dateien.map((e) => e.pfad).filter((p) => !p.includes('/') && p.toLowerCase() !== PROJEKT_DATEI && !erlaubtImStamm.test(p));
  if (lose.length) befunde.push({ art: 'hinweis', titel: `${lose.length} ${lose.length === 1 ? 'Datei liegt' : 'Dateien liegen'} lose im Projektordner`, text: 'Dateien gehören in einen Ordner der Struktur.', pfade: lose });

  /* Dateinamenschema */
  const schema = projekt?.dateischema || struktur.dateischema;
  const schemaOrdner = regeln.filter((r) => r.dateischema && r.pfad).map((r) => `${r.pfad.toLowerCase()}/`);
  if (schema && schemaOrdner.length) {
    const muster = dateimuster(schema, projekt?.nummer ?? '');
    const geprueft = dateien.filter((e) => schemaOrdner.some((o) => e.pfad.toLowerCase().startsWith(o)));
    const abweichend = geprueft
      .map((e) => e.pfad)
      .filter((p) => {
        const name = p.split('/').pop()!;
        const ohneEndung = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
        return !muster.test(ohneEndung);
      });
    if (abweichend.length)
      befunde.push({
        art: 'warnung',
        titel: `${abweichend.length} von ${geprueft.length} ${geprueft.length === 1 ? 'Datei' : 'Dateien'} ${abweichend.length === 1 ? 'folgt' : 'folgen'} nicht dem Dateinamenschema`,
        text: `Schema: ${schema}${projekt?.nummer ? ` (mit Projektnummer ${projekt.nummer})` : ''}`,
        pfade: abweichend,
      });
    else if (geprueft.length) befunde.push({ art: 'ok', titel: `Alle ${geprueft.length} Dateien in den Planordnern folgen dem Dateinamenschema`, text: `Schema: ${schema}` });
  }

  /* lange Pfade */
  const lang = eintraege.map((e) => e.pfad).filter((p) => ordnerName.length + 1 + p.length > PFAD_LANG);
  if (lang.length) befunde.push({ art: 'warnung', titel: `${lang.length} ${lang.length === 1 ? 'Pfad ist' : 'Pfade sind'} sehr lang`, text: `Mehr als ${PFAD_LANG} Zeichen ab dem Projektordner – mit Laufwerk und Stammordner kann die Windows-Grenze von 260 Zeichen überschritten werden.`, pfade: lang });

  const rang: Record<BefundArt, number> = { fehler: 0, warnung: 1, hinweis: 2, ok: 3 };
  befunde.sort((a, b) => rang[a.art] - rang[b.art]);
  return { befunde, fehlendeOrdner, ordner: ordner.length, dateien: dateien.length };
}
