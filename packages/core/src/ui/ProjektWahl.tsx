import { useEffect, useMemo, useState } from 'react';
import { readProjectFile } from '../archive';
import type { Project, ProjectMeta } from '../model';
import { createProject, leereMeta } from '../model';
import type { AllgemeineEinstellungen } from '../platform/konfig';
import { allgemeinAendern, allgemeinLaden, angeheftetLesen, anheftenUmschalten, zuletztMerken } from '../platform/konfig';
import { logger } from '../platform/log';
import { projektAnlegenMoeglich, projektAnlegenStarten } from '../platform/rahmen';
import type { ProjektordnerZugriff } from '../platform/projektordner';
import { hatOrdnerzugriff, ordnerName, ordnerWaehlen, ordnerZeigen, projektdateiAnlegen, projektdateiFinden, projektdateiKopf, tauriProjektordner, verbinde } from '../platform/projektordner';
import { projektdateiPfad } from '../projektdatei';
import { ausOrdnernameMit, useProjektordnerListe } from './projektListe';
import type { KontextEintrag, UebersichtProjekt } from './ProjektUebersicht';
import { ProjektUebersicht } from './ProjektUebersicht';
import { StammdatenDialog } from './Stammdaten';
import './projektwahl.css';
import { useEscSchliessen } from './Dialog';
import { Symbol } from './Symbol';
import { Flaeche, Karte } from './Karte';
import { appMitWas } from '../appNamen';

const log = logger('projektwahl');

/** Ergebnis der Projektwahl: das Projekt aus der Projektdatei des gewählten Projektordners */
export interface GewaehltesProjekt {
  project: Project;
  /** vollständiger Pfad der Projektdatei (.oap) – „Speichern“ schreibt dorthin */
  datei: string;
  /** vollständiger Pfad des Projektordners */
  ordner: string;
  /** die Projektdatei wurde eben erst angelegt (Stammdaten-Dialog) */
  neu: boolean;
}

const isoHeute = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Projektwahl für Apps, die mit der Projektdatei arbeiten (QUADRIO, TERRIO, NUMIO …): die
 * gemeinsame Projektübersicht über das ganze Fenster unter der Titelleiste. Ein Klick öffnet die Projektdatei des
 * Projektordners. Hat der Ordner noch keine, ist das kein Fehler: Der Stammdaten-Dialog erfasst die Stammdaten,
 * und die Projektdatei wird am eingestellten Ort angelegt (gemeinsame Einstellung „Projektdatei in neuen
 * Projekten“). Die Stammordner kommen aus den gemeinsamen Einstellungen. Datei direkt öffnen bleibt möglich.
 */
export function ProjektWahl({
  app,
  offeneDatei,
  onGewaehlt,
  onSchliessen,
  onDateiOeffnen,
  onNeu,
  dateiHinweis,
  fs: fsVorgabe,
  nurOrdner = false,
}: {
  /** Name der App – für „Zuletzt geöffnet“ und das Manifest neuer Projektdateien */
  app: string;
  /** Projektdatei des geöffneten Projekts (vollständiger Pfad) – ihr Projektordner wird hervorgehoben */
  offeneDatei?: string | null;
  onGewaehlt: (g: GewaehltesProjekt) => void | Promise<void>;
  /** zurück zum geöffneten Projekt */
  onSchliessen?: () => void;
  /** Projektdatei über den Dateidialog öffnen (wie bisher) */
  onDateiOeffnen?: () => void;
  /** neues, leeres Projekt beginnen */
  onNeu?: () => void;
  /** was „Datei öffnen …“ öffnet (Hinweis am Knopf), z. B. „Projektdatei (.oap) oder IFC-Modell“ */
  dateiHinweis?: string;
  /** Ordnerzugriff (Tests); Vorgabe: die gemeinsamen Befehle der Desktop-App */
  fs?: ProjektordnerZugriff;
  /**
   * nur den Projektordner wählen (z. B. RECTIO): Die Projektdatei muss es geben (sonst wird sie angelegt),
   * gelesen werden aber nur Name und Stammdaten – nicht Pläne und Modelle.
   */
  nurOrdner?: boolean;
}) {
  const fs = fsVorgabe ?? (hatOrdnerzugriff() ? tauriProjektordner : null);
  const [allgemein, setAllgemein] = useState<AllgemeineEinstellungen | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  useEscSchliessen(onSchliessen);
  const [dialog, setDialog] = useState<{ ordner: string; meta: ProjectMeta } | null>(null);
  const [angeheftet, setAngeheftet] = useState<string[]>([]);

  useEffect(() => {
    let aktuell = true;
    void angeheftetLesen().then((a) => aktuell && setAngeheftet(a));
    return () => {
      aktuell = false;
    };
  }, []);

  useEffect(() => {
    let aktuell = true;
    allgemeinLaden().then(
      (a) => aktuell && setAllgemein(a),
      (e) => aktuell && setFehler(`Einstellungen nicht lesbar: ${e instanceof Error ? e.message : String(e)}`),
    );
    return () => {
      aktuell = false;
    };
  }, []);

  // Nummer und Kurzname aus dem Ordnernamen – nach dem Schema der Struktur (gemeinsame Einstellung), wie im Projektordner
  const ausName = useMemo(() => ausOrdnernameMit(allgemein?.ordnerSchema), [allgemein?.ordnerSchema]);
  const liste = useProjektordnerListe(fs, allgemein?.projekte ?? [], ausName);
  const aktiv = useMemo(() => {
    if (!offeneDatei) return null;
    const d = offeneDatei.toLowerCase().replace(/\\/g, '/');
    return liste.ordner.find((o) => d.startsWith(`${o.pfad.toLowerCase().replace(/\\/g, '/')}/`))?.pfad ?? null;
  }, [offeneDatei, liste.ordner]);

  const geladen = async (ordner: string, pfad: string, neu: boolean) => {
    if (!fs) return;
    let project: Project;
    if (nurOrdner) {
      const kopf = await projektdateiKopf(fs, ordner, pfad);
      if (!kopf) throw new Error(`${pfad}: nicht gefunden`);
      project = { ...createProject(kopf.name), meta: kopf.meta };
    } else {
      const r = await fs.liesMitStand(ordner, pfad);
      if (!r) throw new Error(`${pfad}: nicht gefunden`);
      project = readProjectFile(r.daten);
    }
    void zuletztMerken(ordner, app).catch(() => undefined);
    log.info(`Projekt geöffnet: ${verbinde(ordner, pfad)}`, { neu });
    onGewaehlt({ project, datei: verbinde(ordner, pfad), ordner, neu });
  };

  const oeffnen = async (ordner: string) => {
    if (!fs) return;
    setFehler(null);
    setLaeuft('Projekt wird geöffnet …');
    try {
      const datei = await projektdateiFinden(fs, ordner);
      if (datei) await geladen(ordner, datei.pfad, false);
      else {
        // ohne Projektdatei: Stammdaten erfassen, Nummer und Kurzname aus dem Ordnernamen vorschlagen
        const n = ausName(ordnerName(ordner));
        setDialog({ ordner, meta: { ...leereMeta(), projektcode: n.nummer ?? '', ...(n.kurzname ? { kurzname: n.kurzname } : {}) } });
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(null);
    }
  };

  const anlegen = async (ordner: string, meta: ProjectMeta) => {
    if (!fs || !allgemein) return;
    const pfad = projektdateiPfad(allgemein.oapPfad, { nummer: meta.projektcode, kurzname: meta.kurzname, vorhaben: meta.vorhaben });
    const p = createProject(meta.vorhaben || meta.kurzname || meta.projektcode || ordnerName(ordner));
    p.meta = { ...meta, angelegt: isoHeute() };
    if (!(await projektdateiAnlegen(fs, ordner, pfad, p, app))) throw new Error(`Es gibt schon eine Datei ${pfad} – bitte das Projekt neu öffnen.`);
    log.info(`Projektdatei angelegt: ${verbinde(ordner, pfad)}`);
    setDialog(null);
    await geladen(ordner, pfad, true);
  };

  /** Kontextmenü je Projekt: öffnen, Projektordner im Dateimanager öffnen, anheften bzw. lösen */
  const kontextMenue = (p: UebersichtProjekt): KontextEintrag[] => {
    const dran = angeheftet.some((a) => a.toLowerCase() === p.schluessel.toLowerCase());
    return [
      { label: 'Öffnen', symbol: 'ordnerOffen', aktion: () => void oeffnen(p.schluessel) },
      { label: 'Projektordner öffnen', symbol: 'ordnerOffen', aktion: () => void ordnerZeigen(p.schluessel).catch((e) => setFehler(e instanceof Error ? e.message : String(e))) },
      { label: dran ? 'Lösen' : 'Anheften', symbol: 'stern', titel: 'Angeheftete Projekte stehen vorne – in allen Apps', aktion: () => void anheftenUmschalten(p.schluessel).then(setAngeheftet) },
    ];
  };

  const stammordnerWaehlen = async () => {
    const p = await ordnerWaehlen('Stammordner mit den Projektordnern wählen');
    if (!p) return;
    setAllgemein(await allgemeinAendern({ projekte: [...(allgemein?.projekte ?? []), p] }));
  };

  if (!fs) {
    return (
      <div className="pw-ebene">
        <ProjektEinstieg
          text="Projektdatei öffnen oder ein neues Projekt beginnen."
          fussnote="Die Projektübersicht mit den Projektordnern und „zuletzt geöffnet“ gibt es in der Desktop-App."
          onDateiOeffnen={onDateiOeffnen}
          dateiHinweis={dateiHinweis}
          onNeu={onNeu}
          onSchliessen={onSchliessen}
        >
          {projektAnlegenMoeglich() && (
            <div className="button-row pw-aktionen">
              <button className="primary" onClick={() => projektAnlegenStarten(false)} title={`Neues Projekt mit dem Assistenten von ${appMitWas('ordner')} anlegen`}>
                <Symbol name="plus" /> Neues Projekt anlegen …
              </button>
            </div>
          )}
        </ProjektEinstieg>
      </div>
    );
  }

  if (!allgemein) {
    return (
      <div className="pw-ebene">
        <Flaeche>
          <Karte className="pa" titel="Projekte">
            <p className={fehler ? 'warning' : 'busy'} role={fehler ? 'alert' : 'status'}>
              {fehler ?? 'Einstellungen werden gelesen …'}
            </p>
          </Karte>
        </Flaeche>
      </div>
    );
  }

  // ohne Rahmen-App ist „Neues Projekt“ das leere Projekt; mit Rahmen-App legt der Hauptknopf über den Assistenten an
  const rahmenAnlegen = projektAnlegenMoeglich();
  return (
    <div className="pw-ebene">
      <Flaeche>
        <ProjektUebersicht
          titel="Projekte"
          gruppen={liste.gruppen}
          projekte={liste.projekte}
          zuletzt={liste.zuletzt}
          aktiv={aktiv}
          sucht={liste.sucht}
          fehler={liste.fehler}
          meldung={fehler || laeuft ? { text: fehler ?? laeuft ?? '', fehler: !!fehler } : undefined}
          onOeffnen={(p) => {
            if (p.schluessel === aktiv && onSchliessen) onSchliessen();
            else void oeffnen(p.schluessel);
          }}
          onZurueck={onSchliessen}
          onSchliessen={onSchliessen}
          onNeuLaden={liste.neuLaden}
          marken={liste.marken}
          angeheftet={angeheftet}
          kontextMenue={kontextMenue}
          // ein mit dem Assistenten von ATLAS angelegtes Projekt gleich öffnen
          onAngelegt={(ordner) => void oeffnen(ordner)}
          // Stammordner per Ziehen umsortieren – gilt für alle Apps (gemeinsame Einstellung); der erste nimmt neue Projekte auf
          onGruppenOrdnen={(projekte) => void allgemeinAendern({ projekte }).then(setAllgemein, (e) => setFehler(e instanceof Error ? e.message : String(e)))}
          neu={onNeu && !rahmenAnlegen ? { aktion: onNeu, titel: 'Neues, leeres Projekt – gespeichert wird später als Datei' } : undefined}
          weitere={onNeu && rahmenAnlegen ? [{ text: 'Leer beginnen', titel: 'Neues, leeres Projekt ohne Projektordner – gespeichert wird später als Datei', aktion: onNeu }] : undefined}
          dateiOeffnen={onDateiOeffnen ? { aktion: onDateiOeffnen, titel: `${dateiHinweis ?? 'Projektdatei'} über den Dateidialog öffnen (Strg+O)` } : undefined}
          leer={
            <ProjektEinstieg
              text="Noch kein Stammordner eingestellt – der Ordner, in dem die Projektordner liegen. Er gilt für alle Apps."
              onStammordner={() => void stammordnerWaehlen()}
              onDateiOeffnen={onDateiOeffnen}
              dateiHinweis={dateiHinweis}
              onNeu={onNeu}
              onSchliessen={onSchliessen}
            />
          }
        />
      </Flaeche>
      {dialog && (
        <StammdatenDialog
          titel="Projektdatei anlegen"
          text={`Im Projektordner „${ordnerName(dialog.ordner)}“ liegt noch keine Projektdatei. Mit diesen Stammdaten wird sie angelegt (${projektdateiPfad(allgemein?.oapPfad ?? '', { nummer: dialog.meta.projektcode || '…', kurzname: dialog.meta.kurzname, vorhaben: dialog.meta.vorhaben })}) und geöffnet.`}
          meta={dialog.meta}
          onSpeichern={(m) => anlegen(dialog.ordner, m)}
          onAbbrechen={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/**
 * Einheitlicher Einstieg aller Apps ohne geöffnetes Projekt und Leerzustand der Projektübersicht: eine Karte auf der
 * Fläche, mittig, mit denselben Aktionen in derselben Reihenfolge – Stammordner wählen bzw. Projekt wählen
 * (Übersicht mit „zuletzt geöffnet“), Projektdatei öffnen, neues Projekt. Was eine App nicht anbietet, entfällt.
 * App-eigene Inhalte nur über die Slots: `was` (wofür die App da ist, unter dem Titel), `text`, `children` (unter
 * den Knöpfen, z. B. eine Legende) und `fussnote`.
 */
export function ProjektEinstieg({
  titel = 'Projekte',
  was,
  text,
  onProjekte,
  onStammordner,
  stammordnerText = 'Stammordner wählen …',
  onDateiOeffnen,
  dateiHinweis,
  onNeu,
  onSchliessen,
  fussnote,
  children,
}: {
  titel?: string;
  /** wofür die App da ist (`APP_NAMEN[app].was`) – klein unter dem Titel */
  was?: React.ReactNode;
  text: React.ReactNode;
  /** Nebensache unter den Knöpfen (z. B. was es nur in der Desktop-App gibt) */
  fussnote?: React.ReactNode;
  /** Projektübersicht öffnen (Desktop: Projektordner, zuletzt geöffnet) */
  onProjekte?: () => void;
  onStammordner?: () => void;
  /** Beschriftung des Knopfs für `onStammordner` (Vorgabe „Stammordner wählen …“) */
  stammordnerText?: string;
  onDateiOeffnen?: () => void;
  dateiHinweis?: string;
  onNeu?: () => void;
  onSchliessen?: () => void;
  /** unter den Knöpfen (z. B. eine Legende oder ein weiterer Knopf) */
  children?: React.ReactNode;
}) {
  const erste = onStammordner ? 'stammordner' : onProjekte ? 'projekte' : onDateiOeffnen ? 'datei' : 'neu';
  return (
    <div className="pw-einstieg-ort">
      <Karte className="pw-einstieg" titel={titel}>
        {was && <p className="pw-einstieg-was">{was}</p>}
        <p>{text}</p>
        <div className="button-row pw-aktionen">
          {onStammordner && (
            <button className="primary" onClick={onStammordner}>
              {stammordnerText}
            </button>
          )}
          {onProjekte && (
            <button className={erste === 'projekte' ? 'primary' : ''} onClick={onProjekte} title="Projektübersicht: Projektordner, zuletzt geöffnet">
              Projekt wählen …
            </button>
          )}
          {onDateiOeffnen && (
            <button className={erste === 'datei' ? 'primary' : ''} onClick={onDateiOeffnen} title={`${dateiHinweis ?? 'Projektdatei (.oap)'} über den Dateidialog öffnen (Strg+O)`}>
              Datei öffnen …
            </button>
          )}
          {onNeu && (
            <button className={erste === 'neu' ? 'primary' : ''} onClick={onNeu}>
              Neues Projekt
            </button>
          )}
          {onSchliessen && <button onClick={onSchliessen}>Schließen</button>}
        </div>
        {children}
        {fussnote && <p className="muted small-text pw-fussnote">{fussnote}</p>}
      </Karte>
    </div>
  );
}
