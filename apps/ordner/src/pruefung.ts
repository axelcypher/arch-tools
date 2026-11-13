import type { Eintrag } from './dateisystem';
import { dateimuster, nameAus } from './nummer';
import type { ProjektAngaben } from './stammdaten';
import { PROJEKT_DATEI } from './stammdaten';
import type { Struktur } from './struktur';
import { normPfad, ordnerGilt, sichererName } from './struktur';
import { MAIL_SCHEMA, mailNamePruefen } from './mail/mailname';

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
  /** passende Aktion der Oberfläche direkt am Befund */
  aktion?: 'ordnerAnlegen' | 'mailsBenennen';
}

export interface Pruefergebnis {
  befunde: Befund[];
  /** Ordner der Struktur, die fehlen (für „Fehlende Ordner anlegen“) */
  fehlendeOrdner: string[];
  ordner: number;
  dateien: number;
  /** Mails (.msg), die nicht nach dem Schema heißen (für „Mails benennen …“) */
  falscheMails: string[];
}

const SYSTEMDATEI = /^(thumbs\.db|desktop\.ini|\.ds_store|~\$.*|\..*)$/i;
/** längere Pfade machen unter Windows Schwierigkeiten (Grenze 260 Zeichen einschließlich Laufwerk und Stammordner) */
const PFAD_LANG = 200;

/** Platzhalter für ein unbekanntes Jahr beim Vergleich (wird zum Muster für vier bzw. zwei Ziffern) */
const JAHR_MARKE = 'qqjahrqq';
const JAHR_KURZ_MARKE = 'qqjkqq';
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Werte ohne bekanntes Jahr? (Projekt ohne Anlagedatum – {JAHR}/{JAHR_KURZ} lassen sich dann nicht auflösen) */
const ohneJahr = (werte: Record<string, string | number>) => !Object.entries(werte).some(([k, v]) => /^(jahr|jj|jahr_kurz)$/i.test(k) && String(v) !== '');

/** braucht der Name das Jahr, das die Werte nicht kennen? */
export function brauchtJahr(schema: string, werte: Record<string, string | number>): boolean {
  return ohneJahr(werte) && nameAus(schema, werte) !== nameAus(schema, { ...werte, jahr: 2000 });
}

/** Woher die Angaben zum Projekt stammen */
export interface ProjektQuelle {
  /** Pfad der Projektdatei (.oap) im Projektordner; fehlt, wenn es keine gibt */
  pfad?: string;
  /** die Angaben stammen (nur) aus der alten projekt.json */
  alteProjektJson?: boolean;
  /** Projektdatei vorhanden, aber nicht lesbar */
  fehler?: string;
  /** eine alte projekt.json liegt im Ordner, ist aber nicht lesbar (kaputt oder fremd) – sie bleibt unangetastet */
  alteProjektJsonDefekt?: string;
}

/**
 * Was im Projektordner außerhalb der Struktur liegt – dieselben Regeln für den Prüfmodus und die Vorschau der
 * Vorlagen-Presets: Ordner auf Ebenen, die die Struktur vorgibt (Stamm und Ordner mit vorgegebenen Unterordnern), die
 * nicht in der Struktur stehen, und lose Dateien im Stamm (außer Projektdatei, Notizen, Verknüpfungen, alter projekt.json).
 */
export function ausserhalbDerStruktur(struktur: Struktur, eintraege: Pick<Eintrag, 'pfad' | 'ordner'>[], werte: Record<string, string | number> = {}): { fremd: string[]; lose: string[] } {
  // ohne bekanntes Jahr steht für {JAHR}/{JAHR_KURZ} eine Marke, die beim Vergleich auf beliebige Ziffern passt
  const w = ohneJahr(werte) ? { ...Object.fromEntries(Object.entries(werte).filter(([k]) => !/^(jahr|jj|jahr_kurz)$/i.test(k))), JAHR: JAHR_MARKE, JAHR_KURZ: JAHR_KURZ_MARKE } : werte;
  const ziel = (p: string) =>
    normPfad(p)
      .split('/')
      .map((t) => sichererName(nameAus(t, w)))
      .filter(Boolean)
      .join('/');
  const bekannt = new Set<string>();
  const vorgegebeneEltern = new Set<string>(['']);
  const bekanntMuster: RegExp[] = [];
  const elternMuster: RegExp[] = [];
  const merken = (pfad: string, set: Set<string>, muster: RegExp[]) => {
    if (!pfad.includes(JAHR_MARKE) && !pfad.includes(JAHR_KURZ_MARKE)) return void set.add(pfad);
    muster.push(new RegExp(`^${escapeRe(pfad).replaceAll(JAHR_MARKE, '\\d{4}').replaceAll(JAHR_KURZ_MARKE, '\\d{2}')}$`));
  };
  for (const r of struktur.ordner) {
    const teile = ziel(r.pfad).toLowerCase().split('/');
    for (let i = 1; i <= teile.length; i++) {
      merken(teile.slice(0, i).join('/'), bekannt, bekanntMuster);
      if (i < teile.length) merken(teile.slice(0, i).join('/'), vorgegebeneEltern, elternMuster);
    }
  }
  const fremd = eintraege
    .filter((e) => e.ordner)
    .map((e) => e.pfad)
    .filter((p) => {
      const k = p.toLowerCase();
      const eltern = k.split('/').slice(0, -1).join('/');
      return (vorgegebeneEltern.has(eltern) || elternMuster.some((m) => m.test(eltern))) && !bekannt.has(k) && !bekanntMuster.some((m) => m.test(k));
    });
  const erlaubtImStamm = /\.(oap|md|lnk|url)$/i;
  // die alte projekt.json (bis 0.2) darf liegen bleiben – gelöscht wird nichts
  const lose = eintraege
    .filter((e) => !e.ordner && !SYSTEMDATEI.test(e.pfad.split('/').pop()!))
    .map((e) => e.pfad)
    .filter((p) => !p.includes('/') && p.toLowerCase() !== PROJEKT_DATEI && !erlaubtImStamm.test(p));
  return { fremd, lose };
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
  if (quelle.alteProjektJsonDefekt)
    befunde.push({
      art: 'hinweis',
      titel: `Alte ${PROJEKT_DATEI} nicht lesbar`,
      text: `Im Ordner liegt eine ${PROJEKT_DATEI} (Stammdaten bis Version 0.2), die sich nicht lesen lässt: ${quelle.alteProjektJsonDefekt}. Die Datei bleibt unverändert liegen.`,
      pfade: [PROJEKT_DATEI],
    });
  // Jahr nur aus einem gültigen Anlagedatum – sonst bleibt es unbekannt und Namen mit {JAHR} sind nicht beurteilbar
  const jahr = /^\d{4}/.test(projekt?.angelegt ?? '') ? projekt!.angelegt.slice(0, 4) : '';
  const werte: Record<string, string> = { nummer: projekt?.nummer ?? '', kurzname: projekt?.kurzname ?? '', ...(jahr ? { jahr } : {}) };
  const ohneAnlagedatum = 'Die Projektdatei nennt kein Anlagedatum, das Jahr für {JAHR} bzw. {JAHR_KURZ} ist deshalb unbekannt.';
  if (projekt) {
    const soll = sichererName(nameAus(struktur.ordnername, werte));
    // ohne Kurzname (etwa eine Projektdatei aus PERMIO, der Formulare-App) lässt sich der Name nicht beurteilen
    const vollstaendig = projekt.nummer && (projekt.kurzname || !/kurzname/i.test(struktur.ordnername));
    if (vollstaendig && brauchtJahr(struktur.ordnername, werte)) befunde.push({ art: 'hinweis', titel: 'Ordnername nicht beurteilbar', text: ohneAnlagedatum });
    else if (soll && vollstaendig && soll.toLowerCase() !== ordnerName.toLowerCase())
      befunde.push({ art: 'warnung', titel: 'Der Ordnername weicht vom Schema ab', text: `Der Ordner heißt „${ordnerName}“, nach dem Schema „${struktur.ordnername}“ und den Stammdaten wäre es „${soll}“.` });
  }

  /* Ordner der Struktur */
  const lph = projekt?.leistungsphasen ?? [];
  const ziel = (p: string) =>
    normPfad(p)
      .split('/')
      .map((t) => sichererName(nameAus(t, werte)))
      .filter(Boolean)
      .join('/');
  const gueltig = struktur.ordner.filter((r) => ordnerGilt(struktur.ordner, r.pfad, lph));
  // Ordner, deren Name (oder der eines Elternordners) das unbekannte Jahr braucht, werden weder gemeldet noch angelegt
  const nichtBeurteilbar = gueltig.filter((r) => brauchtJahr(r.pfad, werte)).map((r) => normPfad(r.pfad));
  const regeln = gueltig.filter((r) => !brauchtJahr(r.pfad, werte)).map((r) => ({ ...r, pfad: ziel(r.pfad) }));
  const fehlendeOrdner = regeln.map((r) => r.pfad).filter((p) => p && !da.has(p.toLowerCase()));
  if (fehlendeOrdner.length)
    befunde.push({ art: 'warnung', titel: `${fehlendeOrdner.length} Ordner der Struktur ${fehlendeOrdner.length === 1 ? 'fehlt' : 'fehlen'}`, pfade: fehlendeOrdner, aktion: 'ordnerAnlegen' });
  else if (regeln.length) befunde.push({ art: 'ok', titel: `Alle ${regeln.length} Ordner der Struktur sind vorhanden` });
  if (nichtBeurteilbar.length)
    befunde.push({
      art: 'hinweis',
      titel: `${nichtBeurteilbar.length} ${nichtBeurteilbar.length === 1 ? 'Ordner der Struktur ist' : 'Ordner der Struktur sind'} nicht beurteilbar`,
      text: `${ohneAnlagedatum} Diese Ordner werden weder geprüft noch angelegt.`,
      pfade: nichtBeurteilbar,
    });

  // Ordner außerhalb der Struktur und lose Dateien im Stamm
  const { fremd, lose } = ausserhalbDerStruktur(struktur, eintraege, werte);
  if (fremd.length) befunde.push({ art: 'hinweis', titel: `${fremd.length} Ordner ${fremd.length === 1 ? 'steht' : 'stehen'} nicht in der Struktur`, text: 'Auf Ebenen, die die Struktur vorgibt, liegen zusätzliche Ordner.', pfade: fremd });

  /* lose Dateien im Stamm */
  if (lose.length) befunde.push({ art: 'hinweis', titel: `${lose.length} ${lose.length === 1 ? 'Datei liegt' : 'Dateien liegen'} lose im Projektordner`, text: 'Dateien gehören in einen Ordner der Struktur.', pfade: lose });

  /* Mails nach dem Schema „<Projektcode> von|an <Name> <JJMMTT> <Thema>.msg“ – nur am Namen; lesen und umbenennen in „Mails“ */
  const mails = dateien.filter((e) => /\.msg$/i.test(e.pfad));
  const falscheMails = projekt?.nummer ? mails.filter((e) => !mailNamePruefen(e.pfad.split('/').pop()!, projekt.nummer).ok).map((e) => e.pfad) : [];
  if (falscheMails.length)
    befunde.push({
      art: 'warnung',
      titel: `${falscheMails.length} von ${mails.length} ${mails.length === 1 ? 'Mail heißt' : 'Mails heißen'} nicht nach dem Schema`,
      text: `Schema: ${MAIL_SCHEMA} (Projektcode ${projekt!.nummer}). „Mails benennen …“ schlägt die richtigen Namen aus den Mails vor.`,
      pfade: falscheMails,
      aktion: 'mailsBenennen',
    });
  else if (mails.length && projekt?.nummer) befunde.push({ art: 'ok', titel: `Alle ${mails.length} Mails heißen nach dem Schema` });

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
  return { befunde, fehlendeOrdner, ordner: ordner.length, dateien: dateien.length, falscheMails };
}
