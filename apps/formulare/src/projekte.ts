/**
 * FORMA-Projekte finden: In jedem Projektordner liegt je Projekt ein Unterordner mit den Formularen (`.frmsjf`),
 * der Projektkarte (`sj_prokarte.sdb`) und dem Projekttitel (`sj_office.ini`, Abschnitt `[Allgemeines]`, `Text=`).
 * Ältere Fassungen eines Formulars liegen in `_archiv` und werden nicht angezeigt.
 */

import { fassungAus, gleicheFassung } from '@core/fassung';
import type { Kuerzel } from '@core/namensschema';
import type { Dateisystem, Eintrag } from './dateisystem';
import { verbinde } from './dateisystem';
import { cp1252Lesen, iniLesen } from './forma/cp1252';
import { sperrPfad } from './forma/sperre';

export interface Projekt {
  /** Projektordner, in dem das Projekt liegt */
  root: string;
  /** Name des Projekt-Unterordners, z. B. „BS5“ */
  ordner: string;
  /** Projekttitel aus sj_office.ini, z. B. „Buchenstraße 5 Welver“ */
  titel: string;
  /** beim Suchen ermittelt (für die Projektübersicht) */
  info?: ProjektInfo;
}

export interface ProjektInfo {
  /** Anzahl der Formulare */
  formulare: number;
  /** Formulare mit Sperrdatei (in FORMA oder hier geöffnet) */
  gesperrt: number;
  /** letzte Änderung einer Datei im Projekt (ms); null = unbekannt */
  geaendert: number | null;
}

export interface FormularEintrag {
  /** relativ zum Projektordner, z. B. „BS5/005-Anlage I-3 … (2026).frmsjf“ */
  pfad: string;
  /** Dateiname ohne Endung */
  name: string;
  /** daneben liegt eine Sperrdatei: in FORMA (oder hier) geöffnet */
  gesperrt: boolean;
  /** Sammelprojekt: der Unterordner des Antrags, in dem das Formular liegt (z. B. „2. BAUA“) – fehlt im Stammordner */
  unterordner?: string;
}

/** Welcher Antrag aktiv ist und wie Antragsarten geschrieben werden – damit sich sein Unterordner finden lässt */
export interface UnterordnerWahl {
  /** aktive Antragsfassung, z. B. „BAUA 2“ */
  fassung: string;
  /** alle Schreibweisen der Antragsarten */
  arten: string[];
  /** Antragsarten des Namensschemas (gleichwertige Schreibweisen) */
  antragsarten: Kuerzel[];
}

/** Formulare des Projekts samt Sammelprojekt-Angaben */
export interface FormulareDesProjekts {
  formulare: FormularEintrag[];
  /** Unterordner des aktiven Antrags (relativ zum Projektordner) – null, wenn es keinen gibt */
  unterordner: string | null;
  /** alle Unterordner, die Antragsfassungen sind (Sammelprojekt) – leer bei einem gewöhnlichen Projekt */
  antragsUnterordner: string[];
}

const istProjektdatei = (name: string) => /\.frmsjf$/i.test(name) || /^sj_prokarte\.sdb$/i.test(name);
const sortiere = (a: string, b: string) => a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' });

export async function projekteSuchen(ds: Dateisystem, roots: string[]): Promise<{ projekte: Projekt[]; fehler: string[] }> {
  const projekte: Projekt[] = [];
  const fehler: string[] = [];
  await Promise.all(
    roots.map(async (root) => {
      try {
        const eintraege = await ds.liste(root, 2);
        const ordner = new Map<string, boolean>();
        const info = new Map<string, ProjektInfo>();
        for (const e of eintraege) {
          const [kopf, name] = e.pfad.split('/');
          if (name === undefined || e.ordner) continue;
          if (istProjektdatei(name)) ordner.set(kopf, true);
          const i = info.get(kopf) ?? { formulare: 0, gesperrt: 0, geaendert: null };
          if (/\.frmsjf$/i.test(name)) i.formulare++;
          if (/\.frmtmp$/i.test(name)) i.gesperrt++;
          if (e.geaendert) i.geaendert = Math.max(i.geaendert ?? 0, e.geaendert);
          info.set(kopf, i);
        }
        const mitIni = new Set(eintraege.filter((e) => /\/sj_office\.ini$/i.test(e.pfad)).map((e) => e.pfad.split('/')[0]));
        const gefunden = await Promise.all(
          [...ordner.keys()].map(async (o) => ({ root, ordner: o, titel: mitIni.has(o) ? await projektTitel(ds, root, o) : '', info: info.get(o) })),
        );
        projekte.push(...gefunden);
      } catch (e) {
        fehler.push(`${root}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  );
  projekte.sort((a, b) => sortiere(a.root, b.root) || sortiere(a.ordner, b.ordner));
  return { projekte, fehler };
}

/** Schlüssel eines Projekts (Quelle und Ordner) */
export const projektSchluessel = (p: Pick<Projekt, 'root' | 'ordner'>) => `${p.root}|${p.ordner}`;

async function projektTitel(ds: Dateisystem, root: string, ordner: string): Promise<string> {
  try {
    const bytes = await ds.lies(root, `${ordner}/sj_office.ini`);
    return bytes ? (iniLesen(cp1252Lesen(bytes)).get('allgemeines')?.get('text') ?? '') : '';
  } catch {
    return '';
  }
}

/** Formulare eines Ordners (eine Ebene), `ordner` relativ zum Projektordner-Root */
function formulareIn(eintraege: Eintrag[], ordner: string, unterordner?: string): FormularEintrag[] {
  const namen = new Set(eintraege.filter((e) => !e.ordner).map((e) => e.pfad.toLowerCase()));
  return eintraege
    .filter((e) => !e.ordner && /\.frmsjf$/i.test(e.pfad))
    .map((e) => ({
      pfad: `${ordner}/${e.pfad}`,
      name: e.pfad.replace(/\.frmsjf$/i, ''),
      gesperrt: namen.has(sperrPfad(e.pfad).toLowerCase()),
      ...(unterordner ? { unterordner } : {}),
    }))
    .sort((a, b) => sortiere(a.name, b.name));
}

/**
 * Formulare des Projekts. Ein Sammelprojekt hat je Antrag einen Unterordner, benannt wie die Antragsfassung („BAUA 2“,
 * „2. BAUA“, „02 BAUA“ …, @core/fassung): Mit `wahl` kommen die Formulare aus dem Unterordner des aktiven Antrags dazu –
 * vor denen des Stammordners (antragsübergreifend), damit sie bei gleichem Namen Vorrang haben.
 */
export async function formulareMitUnterordner(ds: Dateisystem, p: Projekt, wahl?: UnterordnerWahl): Promise<FormulareDesProjekts> {
  const eintraege = await ds.liste(verbinde(p.root, p.ordner), 1);
  const stamm = formulareIn(eintraege, p.ordner);
  const antragsUnterordner = wahl ? eintraege.filter((e) => e.ordner && fassungAus(e.pfad, wahl.arten)).map((e) => e.pfad) : [];
  const unterordner = wahl ? (antragsUnterordner.find((u) => gleicheFassung(u, wahl.fassung, wahl.antragsarten, wahl.arten)) ?? null) : null;
  if (!unterordner) return { formulare: stamm, unterordner: null, antragsUnterordner };
  const darin = await ds.liste(verbinde(p.root, `${p.ordner}/${unterordner}`), 1);
  return { formulare: [...formulareIn(darin, `${p.ordner}/${unterordner}`, unterordner), ...stamm], unterordner, antragsUnterordner };
}

/** Formulare des Projekts (siehe formulareMitUnterordner) */
export async function formulareDesProjekts(ds: Dateisystem, p: Projekt, wahl?: UnterordnerWahl): Promise<FormularEintrag[]> {
  return (await formulareMitUnterordner(ds, p, wahl)).formulare;
}
