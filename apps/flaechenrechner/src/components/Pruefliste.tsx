import { useDeferredValue, useMemo, useState } from 'react';
import { pruefeProjekt } from '@core/pruefung';
import type { PruefArt, PruefEintrag } from '@core/pruefung';
import type { Project } from '@core/model';
import { useEditor } from '../store/store';
import { useKatalog } from '../core/katalog';
import { fehlendeAngaben } from '../core/bericht';
import { anzahl } from '../core/text';

/** Eintrag der Anzeige: eine Meldung oder mehrere gleichartige eines Geschosses zusammengefasst */
export interface PruefZeile {
  art: PruefArt;
  /** Geschoss, leer bei Angaben zum Projekt */
  storeyId: string;
  shapeIds: string[];
  text: string;
  /** Einzelmeldungen einer Sammelzeile (Tooltip) */
  einzeln?: string[];
  /** Projektangabe: Klick öffnet die Berechnungsgrundlagen */
  projekt?: boolean;
}

/** Sammeltext für mehrere gleichartige Raummeldungen eines Geschosses („keine Wohnfläche“ fasst schon core/pruefung zusammen) */
const SAMMEL: Record<string, (n: number) => string> = {
  'ohne-wohnung': (n) => `${anzahl(n, 'Raum zählt', 'Räume zählen')} zur Wohnfläche, aber ohne Wohnung – alle wählen und Wohnung eintragen.`,
  dachschraege: (n) => `${anzahl(n, 'Raum', 'Räume')} im Dachgeschoss voll angerechnet – lichte Höhe prüfen (Raumteile unter 2 m nach § 4 WoFlV).`,
  'ohne-katalog': (n) => `${anzahl(n, 'Raumbezeichnung', 'Raumbezeichnungen')} nicht im Raumkatalog – Nutzung und Anrechnung prüfen.`,
  'umriss-pruefen': (n) => `${anzahl(n, 'BGF-Umriss ist', 'BGF-Umrisse sind')} zum Prüfen markiert (übernommen) – Außenmaße kontrollieren.`,
};

/** Pflichtangaben des Projekts für den Bericht (DIN 277:2021-08, 5.1) – wie in der Seitenleiste unter „Berechnungsgrundlagen“ */
export function projektPruefung(project: Project): PruefZeile[] {
  const out: PruefZeile[] = [];
  const zeile = (text: string): PruefZeile => ({ art: 'warnung', storeyId: '', shapeIds: [], text, projekt: true });
  const fehlt = fehlendeAngaben(project);
  if (fehlt.includes('Messverfahren')) out.push(zeile('Messverfahren nicht angegeben (DIN 277, 5.1) – unter „Berechnungsgrundlagen“ wählen.'));
  if (fehlt.includes('Planungsunterlagen')) out.push(zeile('Planungsunterlagen nicht angegeben (DIN 277, 5.1) – unter „Berechnungsgrundlagen“ eintragen.'));
  return out;
}

/** Meldungen für die Anzeige: Projektangaben zuerst, dann Warnungen vor Hinweisen; gleichartige Raummeldungen je Geschoss zusammengefasst */
export function pruefZeilen(project: Project, eintraege: readonly PruefEintrag[]): PruefZeile[] {
  const gruppen = new Map<string, PruefEintrag[]>();
  for (const e of eintraege) {
    const k = SAMMEL[e.regel] ? `${e.storeyId}|${e.regel}` : `${gruppen.size}|einzeln`;
    gruppen.set(k, [...(gruppen.get(k) ?? []), e]);
  }
  const zeilen = [...gruppen.values()].map((g): PruefZeile => {
    const e = g[0];
    if (g.length === 1) return { art: e.art, storeyId: e.storeyId, shapeIds: e.shapeIds, text: e.text };
    return { art: e.art, storeyId: e.storeyId, shapeIds: [...new Set(g.flatMap((x) => x.shapeIds))], text: SAMMEL[e.regel](g.length), einzeln: g.map((x) => x.text) };
  });
  const rang = (z: PruefZeile) => (z.art === 'warnung' ? 0 : 1);
  return [...projektPruefung(project), ...zeilen.sort((a, b) => rang(a) - rang(b))];
}

/**
 * Prüfliste (F-10): Hinweise zur Plausibilität aller Geschosse und zu den Pflichtangaben des Projekts – Ampel in der
 * Auswertung, aufklappbar; ein Klick auf einen Eintrag wechselt ins Geschoss und wählt die betroffenen Flächen. Alles
 * sind Hinweise zum Prüfen.
 */
export function Pruefliste() {
  const project = useDeferredValue(useEditor((s) => s.project));
  const katalog = useKatalog((s) => s.katalog);
  const eigen = useKatalog((s) => s.eigen);
  const zeilen = useMemo(() => pruefZeilen(project, pruefeProjekt(project, { katalog: eigen ? katalog.map((k) => k.name) : undefined })), [project, katalog, eigen]);
  const [offen, setOffen] = useState(false);
  const warnungen = zeilen.filter((e) => e.art === 'warnung').length;
  const hinweise = zeilen.length - warnungen;
  const waehlen = (e: PruefZeile) => {
    if (e.projekt) {
      // Berechnungsgrundlagen in der linken Seitenleiste aufklappen und dorthin springen
      const d = document.querySelector<HTMLDetailsElement>('.berechnungsgrundlagen');
      if (d) {
        d.open = true;
        d.scrollIntoView({ block: 'nearest' });
        d.querySelector<HTMLElement>('select, input')?.focus();
      }
      return;
    }
    const st = useEditor.getState();
    if (st.activeStoreyId !== e.storeyId) st.setActiveStorey(e.storeyId);
    if (e.shapeIds.length) st.selectMany(e.shapeIds);
  };
  const name = (id: string) => project.storeys.find((s) => s.id === id)?.name ?? '';
  const teile = [warnungen ? anzahl(warnungen, 'Warnung', 'Warnungen') : '', hinweise ? anzahl(hinweise, 'Hinweis', 'Hinweise') : ''].filter(Boolean);
  return (
    <div className="pruefliste">
      <button className={`small pruef-knopf ${warnungen ? 'pruef-warnung' : zeilen.length ? 'pruef-hinweis' : 'pruef-ok'}`} onClick={() => setOffen(!offen)} aria-expanded={offen}>
        <span className="ampel" aria-hidden />
        {zeilen.length ? `Prüfen: ${teile.join(', ')}` : 'Prüfen: keine Auffälligkeiten'}
        {zeilen.length > 0 && <span aria-hidden>{offen ? ' ▴' : ' ▾'}</span>}
      </button>
      {offen && zeilen.length > 0 && (
        <ul className="pruef-liste small-text">
          {zeilen.map((e, i) => (
            <li key={i} className={`pruef-${e.art}`}>
              <button
                type="button"
                className="list-btn"
                onClick={() => waehlen(e)}
                title={
                  e.projekt
                    ? 'Öffnet die Berechnungsgrundlagen'
                    : e.einzeln
                      ? `Wählt alle betroffenen Flächen:\n${e.einzeln.join('\n')}`
                      : e.shapeIds.length
                        ? 'Wählt die betroffene(n) Fläche(n)'
                        : 'Wechselt ins Geschoss'
                }
              >
                <span>
                  <span className="pruef-geschoss">{e.projekt ? 'Projekt' : name(e.storeyId)}</span> {e.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
