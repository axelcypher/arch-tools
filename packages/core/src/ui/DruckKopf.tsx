import { useEffect, useState } from 'react';
import type { Project, ProjectMeta } from '../model';
import { anschriftEinzeilig, bebauungsplanText, flurText } from '../model';
import { allgemeinLaden, konfigNeuLesen } from '../platform/konfig';

/**
 * Gemeinsamer Kopf für Ausdrucke und Excel aller Apps: Büro, Bearbeiter, Bauherr, Bauvorhaben, Adresse,
 * Gemarkung/Flur/Flurstück, Bebauungsplan, Datum – aus den Stammdaten der Projektdatei. Seitenzahlen („Seite x von y“)
 * setzt der Druck (base.css, @page).
 */

export interface KopfZeile {
  label: string;
  wert: string;
}

/** Datum TT.MM.JJJJ (zweistellig) */
export const datumText = (d: Date | string): string => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Zeilen des Kopfs (leere Angaben entfallen) – gleich für Druck und Excel */
export function kopfZeilen(project: Pick<Project, 'name' | 'meta'>, o: { buero?: string; stand?: Date | string } = {}): KopfZeile[] {
  const m: ProjectMeta = project.meta;
  const bauherr = [m.bauherr.vorname, m.bauherr.name].filter((x) => x?.trim()).join(' ');
  const zeilen: [string, string | undefined][] = [
    ['Bauvorhaben', [m.projektcode, m.vorhaben?.trim() || project.name].filter((x) => x?.trim()).join(' · ')],
    ['Adresse', anschriftEinzeilig(m.adresse)],
    ['Grundstück', flurText(m.grundstueck)],
    ['Bebauungsplan', bebauungsplanText(m.bebauungsplan)],
    ['Bauherr', bauherr],
    ['Büro', o.buero?.trim()],
    ['Bearbeitung', m.bearbeiter.trim()],
    ['Stand', o.stand ? datumText(o.stand) : undefined],
  ];
  return zeilen.filter((z): z is [string, string] => !!z[1]).map(([label, wert]) => ({ label, wert }));
}

/** Name des Büros aus den gemeinsamen Einstellungen (einmal gelesen) */
let bueroCache: Promise<string> | null = null;
export function useBuero(): string {
  const [buero, setBuero] = useState('');
  useEffect(() => {
    let aktuell = true;
    const lesen = () => {
      bueroCache ??= allgemeinLaden()
        .then((a) => a.buero ?? '')
        .catch(() => '');
      void bueroCache.then((b) => aktuell && setBuero(b));
    };
    lesen();
    // nach einem Wechsel des Speicherorts gilt der Büroname am neuen Ort
    const ab = konfigNeuLesen(() => {
      bueroCache = null;
      lesen();
    });
    return () => {
      aktuell = false;
      ab();
    };
  }, []);
  return buero;
}

/** Kopf eines Ausdrucks: Titel und die Stammdaten des Projekts */
export function DruckKopf({ titel, project, stand, zusatz }: { titel: React.ReactNode; project: Pick<Project, 'name' | 'meta'>; stand?: Date | string; zusatz?: React.ReactNode }) {
  const buero = useBuero();
  const zeilen = kopfZeilen(project, { buero, stand: stand ?? new Date() });
  return (
    <header className="report-header druck-kopf">
      <h1>{titel}</h1>
      <dl className="report-meta druck-kopf-zeilen">
        {zeilen.map((z) => (
          <div key={z.label}>
            <dt>{z.label}</dt>
            <dd>{z.wert}</dd>
          </div>
        ))}
      </dl>
      {zusatz}
    </header>
  );
}
