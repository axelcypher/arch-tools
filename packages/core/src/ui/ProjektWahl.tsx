import { useEffect, useMemo, useState } from 'react';
import { readProjectFile } from '../archive';
import type { Project, ProjectMeta } from '../model';
import { createProject, leereMeta } from '../model';
import type { AllgemeineEinstellungen } from '../platform/konfig';
import { allgemeinAendern, allgemeinLaden, zuletztMerken } from '../platform/konfig';
import { logger } from '../platform/log';
import type { ProjektordnerZugriff } from '../platform/projektordner';
import { hatOrdnerzugriff, ordnerName, ordnerWaehlen, projektdateiAnlegen, projektdateiFinden, projektdateiKopf, tauriProjektordner, verbinde } from '../platform/projektordner';
import { projektdateiPfad } from '../projektdatei';
import { ausOrdnernameEinfach, useProjektordnerListe } from './projektListe';
import { ProjektUebersicht } from './ProjektUebersicht';
import { StammdatenDialog } from './Stammdaten';
import './projektwahl.css';

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
 * Projektwahl für Apps, die mit der Projektdatei arbeiten (Flächenrechner, GRZ-Nachweis, Kostenermittlung …): die
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
  fs: fsVorgabe,
  nurOrdner = false,
}: {
  /** Name der App – für „Zuletzt geöffnet“ und das Manifest neuer Projektdateien */
  app: string;
  /** Projektdatei des geöffneten Projekts (vollständiger Pfad) – ihr Projektordner wird hervorgehoben */
  offeneDatei?: string | null;
  onGewaehlt: (g: GewaehltesProjekt) => void;
  /** zurück zum geöffneten Projekt */
  onSchliessen?: () => void;
  /** Projektdatei über den Dateidialog öffnen (wie bisher) */
  onDateiOeffnen?: () => void;
  /** Ordnerzugriff (Tests); Vorgabe: die gemeinsamen Befehle der Desktop-App */
  fs?: ProjektordnerZugriff;
  /**
   * nur den Projektordner wählen (z. B. Entzerrung): Die Projektdatei muss es geben (sonst wird sie angelegt),
   * gelesen werden aber nur Name und Stammdaten – nicht Pläne und Modelle.
   */
  nurOrdner?: boolean;
}) {
  const fs = fsVorgabe ?? (hatOrdnerzugriff() ? tauriProjektordner : null);
  const [allgemein, setAllgemein] = useState<AllgemeineEinstellungen | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ ordner: string; meta: ProjectMeta } | null>(null);

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

  const liste = useProjektordnerListe(fs, allgemein?.projekte ?? []);
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
        const n = ausOrdnernameEinfach(ordnerName(ordner));
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

  const stammordnerWaehlen = async () => {
    const p = await ordnerWaehlen('Stammordner mit den Projektordnern wählen');
    if (!p) return;
    setAllgemein(await allgemeinAendern({ projekte: [...(allgemein?.projekte ?? []), p] }));
  };

  if (!fs) {
    return (
      <div className="pw-ebene">
        <div className="pw-leer">
          <h2>Projekte</h2>
          <p>Die Projektübersicht mit den Projektordnern gibt es in der Desktop-App. Hier lässt sich eine Projektdatei direkt öffnen.</p>
          <div className="button-row">
            {onDateiOeffnen && (
              <button className="primary" onClick={onDateiOeffnen}>
                Datei öffnen …
              </button>
            )}
            {onSchliessen && <button onClick={onSchliessen}>Schließen</button>}
          </div>
        </div>
      </div>
    );
  }

  if (!allgemein) {
    return (
      <div className="pw-ebene">
        <p className={fehler ? 'warning pw-meldung' : 'busy pw-meldung'}>{fehler ?? 'Einstellungen werden gelesen …'}</p>
      </div>
    );
  }

  return (
    <div className="pw-ebene">
      {(fehler || laeuft) && <p className={fehler ? 'warning pw-meldung' : 'busy pw-meldung'}>{fehler ?? laeuft}</p>}
      <ProjektUebersicht
        titel="Projekte"
        gruppen={liste.gruppen}
        projekte={liste.projekte}
        zuletzt={liste.zuletzt}
        aktiv={aktiv}
        sucht={liste.sucht}
        fehler={liste.fehler}
        onOeffnen={(p) => {
          if (p.schluessel === aktiv && onSchliessen) onSchliessen();
          else void oeffnen(p.schluessel);
        }}
        onZurueck={onSchliessen}
        onNeuLaden={liste.neuLaden}
        marken={liste.marken}
        kopf={
          <>
            {onDateiOeffnen && (
              <button onClick={onDateiOeffnen} title="Projektdatei über den Dateidialog öffnen (Strg+O)">
                Datei öffnen …
              </button>
            )}
            {onSchliessen && <button onClick={onSchliessen}>Schließen</button>}
          </>
        }
        leer={
          <div className="pw-leer">
            <h2>Projekte</h2>
            <p>Noch kein Stammordner eingestellt – der Ordner, in dem die Projektordner liegen. Er gilt für alle Apps.</p>
            <div className="button-row">
              <button className="primary" onClick={() => void stammordnerWaehlen()}>
                Stammordner wählen …
              </button>
              {onDateiOeffnen && <button onClick={onDateiOeffnen}>Datei öffnen …</button>}
              {onSchliessen && <button onClick={onSchliessen}>Schließen</button>}
            </div>
          </div>
        }
      />
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
