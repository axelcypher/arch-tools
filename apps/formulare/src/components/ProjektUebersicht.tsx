import { useMemo } from 'react';
import type { UebersichtMarke, UebersichtProjekt, UebersichtStatus } from '@core/ui/ProjektUebersicht';
import { ProjektUebersicht as Uebersicht, quellenName, wann } from '@core/ui/ProjektUebersicht';
import type { ProjektStatus } from '../antrag';
import { STATUS_TEXT, schlimmsterStatus, statusGesamt } from '../antrag';
import { useAntrag } from '../antragStore';
import { oeffnePfad, verbinde } from '../dateisystem';
import type { Projekt } from '../projekte';
import { projektSchluessel } from '../projekte';
import { ablageVon, projektHatEntwuerfe, useFormulare } from '../store';
import type { MenuePunkt } from '@core/ui/Menue';
import { zeigeMenue } from '@core/ui/Menue';
import { Symbol } from '@core/ui/Symbol';

export { useAufgeklappt } from '@core/ui/ProjektUebersicht';

/** Antragsstatus in Worten */
function statusText(st: ProjektStatus | undefined): string {
  if (!st) return 'Antrag noch nicht geprüft';
  const gesamt = statusGesamt(st);
  if (!gesamt) return `Antragsumfang nicht festgelegt · ${st.fassung}`;
  return `${st.anzahl.aktuell ?? 0}/${gesamt} aktuell · ${st.fassung}`;
}

/**
 * Projektübersicht von PERMIO: die gemeinsame Startseite (packages/core) mit den FORMA-Projekten je Quelle,
 * dem Antragsstatus vom letzten Öffnen, Marken für Sperren, ungespeicherte Eingaben und fehlende Projektordner.
 */
export function ProjektUebersicht({ onEinstellungen }: { onEinstellungen: () => void }) {
  const projektordner = useFormulare((s) => s.projektordner);
  const projekte = useFormulare((s) => s.projekte);
  const sucht = useFormulare((s) => s.sucht);
  const suchfehler = useFormulare((s) => s.suchfehler);
  const zuletzt = useFormulare((s) => s.zuletzt);
  const aktuell = useFormulare((s) => s.projekt);
  const ablage = useFormulare((s) => s.ablage);
  const ordnerWahl = useFormulare((s) => s.ordnerWahl);
  const ablageGesucht = useFormulare((s) => s.ablageordner.length > 0);
  const projektStatus = useAntrag((s) => s.projektStatus);
  const { projekteLaden, setHaupt } = useFormulare.getState();

  const nachSchluessel = useMemo(() => new Map(projekte.map((p) => [projektSchluessel(p), p])), [projekte]);
  const eintraege = useMemo(
    (): UebersichtProjekt[] =>
      projekte.map((p) => ({
        schluessel: projektSchluessel(p),
        gruppe: p.root,
        kuerzel: p.ordner,
        titel: p.titel,
        info: p.info ? `${p.info.formulare} ${p.info.formulare === 1 ? 'Formular' : 'Formulare'}` : undefined,
        geaendert: p.info?.geaendert,
        ...(projektStatus[projektSchluessel(p)]?.antrag ? { antrag: projektStatus[projektSchluessel(p)].antrag } : {}),
      })),
    [projekte, projektStatus],
  );
  const gruppen = useMemo(() => projektordner.map((root) => ({ id: root, name: quellenName(root, projektordner), pfad: root })), [projektordner]);

  const oeffnen = (e: UebersichtProjekt) => {
    const p = nachSchluessel.get(e.schluessel);
    if (!p) return;
    if (aktuell && projektSchluessel(aktuell) === e.schluessel) setHaupt('formular');
    else void useFormulare.getState().projektWaehlen(p);
  };

  const status = (e: UebersichtProjekt): UebersichtStatus => {
    const st = projektStatus[e.schluessel];
    const stufe = st ? schlimmsterStatus(st) : null;
    return {
      stufe,
      unbekannt: !st,
      balken: st?.anzahl,
      text: statusText(st),
      titel: stufe ? `Antrag: ${STATUS_TEXT[stufe]}` : statusText(st),
      textTitel: st ? `Stand beim letzten Öffnen: ${wann(st.zeit)}` : 'Wird beim Öffnen des Projekts geprüft',
    };
  };

  const marken = (e: UebersichtProjekt): UebersichtMarke[] => {
    const p = nachSchluessel.get(e.schluessel);
    if (!p) return [];
    const m: UebersichtMarke[] = [];
    if (p.info?.gesperrt) m.push({ text: `${p.info.gesperrt} geöffnet`, art: 'warnung', symbol: 'schloss', titel: 'Formulare mit Sperrdatei – hier oder in einem anderen Programm geöffnet' });
    if (projektHatEntwuerfe(p)) m.push({ text: 'ungespeichert', art: 'hinweis', symbol: 'stift', titel: 'Hier eingegeben, aber noch nicht in die Formulardatei gespeichert' });
    if (ablageGesucht && !ablageVon({ ablage, ordnerWahl }, p)) m.push({ text: 'kein Projektordner', symbol: 'ordner', titel: 'Kein Projektordner mit diesem Kürzel gefunden' });
    return m;
  };

  const menue = (p: Projekt, zuletztKarte: boolean): MenuePunkt[] => {
    const a = ablageVon({ ablage, ordnerWahl }, p);
    return [
      { text: 'Öffnen', symbol: 'formular', aktion: () => oeffnen({ schluessel: projektSchluessel(p) } as UebersichtProjekt) },
      { trenner: true },
      { text: 'Formularordner öffnen', symbol: 'ordnerOffen', aktion: () => void oeffnePfad(verbinde(p.root, p.ordner)).catch(() => undefined) },
      {
        text: 'Projektordner öffnen',
        symbol: 'ordnerOffen',
        deaktiviert: !a,
        ...(a ? {} : { hinweis: 'kein Projektordner' }),
        aktion: () => a && void oeffnePfad(verbinde(a.root, a.pfad)).catch(() => undefined),
      },
      { text: 'Pfad kopieren', symbol: 'kopie', aktion: () => void navigator.clipboard?.writeText(verbinde(p.root, p.ordner)) },
      ...(zuletztKarte ? [{ trenner: true as const }, { text: 'Aus „Zuletzt geöffnet“ entfernen', symbol: 'schliessen' as const, aktion: () => useFormulare.getState().zuletztEntfernen(p) }] : []),
    ];
  };

  return (
    <Uebersicht
      gruppen={gruppen}
      projekte={eintraege}
      zuletzt={zuletzt.map((z) => ({ schluessel: projektSchluessel(z), zeit: z.zeit }))}
      aktiv={aktuell ? projektSchluessel(aktuell) : null}
      sucht={sucht}
      fehler={suchfehler}
      onOeffnen={oeffnen}
      onZurueck={() => setHaupt('formular')}
      onNeuLaden={() => void projekteLaden()}
      onEinstellungen={onEinstellungen}
      onKontext={(e, ev, zuletztKarte) => {
        const p = nachSchluessel.get(e.schluessel);
        if (p) zeigeMenue(ev, menue(p, zuletztKarte), p.titel ? `${p.ordner} ${p.titel}` : p.ordner);
      }}
      status={status}
      marken={marken}
      gruppeLeer="Keine Formularprojekte in diesem Ordner."
      leer={
        <div className="pa-leer">
          <h2>Willkommen</h2>
          <p>Stelle zuerst ein, wo eure Formularprojekte liegen – danach erscheinen sie hier.</p>
          <button className="primary" onClick={onEinstellungen}>
            <Symbol name="ordner" /> Ordner einstellen …
          </button>
        </div>
      }
    />
  );
}
