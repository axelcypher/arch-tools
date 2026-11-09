/**
 * FORMA-Projekte finden: In jedem Projektordner liegt je Projekt ein Unterordner mit den Formularen (`.frmsjf`),
 * der Projektkarte (`sj_prokarte.sdb`) und dem Projekttitel (`sj_office.ini`, Abschnitt `[Allgemeines]`, `Text=`).
 * Ältere Fassungen eines Formulars liegen in `_archiv` und werden nicht angezeigt.
 */

import type { Dateisystem } from './dateisystem';
import { verbinde } from './dateisystem';
import { cp1252Lesen, iniLesen } from './forma/cp1252';
import { sperrPfad } from './forma/sperre';

export interface Projekt {
  /** Projektordner, in dem das Projekt liegt */
  root: string;
  /** Name des Projekt-Unterordners, z. B. „BS5“ */
  ordner: string;
  /** Projekttitel aus sj_office.ini, z. B. „Birkenstraße 5 Welver“ */
  titel: string;
}

export interface FormularEintrag {
  /** relativ zum Projektordner, z. B. „BS5/005-Anlage I-3 … (2026).frmsjf“ */
  pfad: string;
  /** Dateiname ohne Endung */
  name: string;
  /** daneben liegt eine Sperrdatei: in FORMA (oder hier) geöffnet */
  gesperrt: boolean;
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
        for (const e of eintraege) {
          const [kopf, name] = e.pfad.split('/');
          if (name !== undefined && !e.ordner && istProjektdatei(name)) ordner.set(kopf, true);
        }
        const mitIni = new Set(eintraege.filter((e) => /\/sj_office\.ini$/i.test(e.pfad)).map((e) => e.pfad.split('/')[0]));
        const gefunden = await Promise.all(
          [...ordner.keys()].map(async (o) => ({ root, ordner: o, titel: mitIni.has(o) ? await projektTitel(ds, root, o) : '' })),
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

async function projektTitel(ds: Dateisystem, root: string, ordner: string): Promise<string> {
  try {
    const bytes = await ds.lies(root, `${ordner}/sj_office.ini`);
    return bytes ? (iniLesen(cp1252Lesen(bytes)).get('allgemeines')?.get('text') ?? '') : '';
  } catch {
    return '';
  }
}

export async function formulareDesProjekts(ds: Dateisystem, p: Projekt): Promise<FormularEintrag[]> {
  const eintraege = await ds.liste(verbinde(p.root, p.ordner), 1);
  const namen = new Set(eintraege.filter((e) => !e.ordner).map((e) => e.pfad.toLowerCase()));
  return eintraege
    .filter((e) => !e.ordner && /\.frmsjf$/i.test(e.pfad))
    .map((e) => ({
      pfad: `${p.ordner}/${e.pfad}`,
      name: e.pfad.replace(/\.frmsjf$/i, ''),
      gesperrt: namen.has(sperrPfad(e.pfad).toLowerCase()),
    }))
    .sort((a, b) => sortiere(a.name, b.name));
}
