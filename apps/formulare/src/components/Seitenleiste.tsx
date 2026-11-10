import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { oeffnePfad, verbinde } from '../dateisystem';
import { ablageVon, auswahlVon, hatEntwurf, istGeaendert, useFormulare } from '../store';
import { useAntrag } from '../antragStore';
import type { FormularEintrag } from '../projekte';
import { AblageBaum } from './AblageBaum';
import { FassungsWahl, StatusPunkt, umfangZeigen } from './Antrag';
import { useExportDialog } from './ExportDialog';
import { useHinzufuegenDialog } from './FormularHinzufuegen';
import type { MenuePunkt } from './Menue';
import { zeigeMenue } from './Menue';
import { Symbol } from './Symbol';

/** Aufklappbarer Abschnitt der Navigation; der Zustand bleibt je Abschnitt erhalten */
function Abschnitt({ id, titel, kopf, children, start = true }: { id: string; titel: ReactNode; kopf?: ReactNode; children: ReactNode; start?: boolean }) {
  const schluessel = `formulare:block:${id}`;
  const [auf, setAuf] = useState(() => {
    try {
      const v = localStorage.getItem(schluessel);
      return v === null ? start : v === '1';
    } catch {
      return start;
    }
  });
  const umschalten = () => {
    setAuf(!auf);
    try {
      localStorage.setItem(schluessel, auf ? '0' : '1');
    } catch {
      // nur für diese Sitzung
    }
  };
  return (
    <section className="nav-abschnitt">
      <div className="nav-kopf">
        <button className="nav-kopf-titel" aria-expanded={auf} onClick={umschalten}>
          <Symbol name={auf ? 'pfeilUnten' : 'pfeilRechts'} />
          {titel}
        </button>
        <span className="nav-kopf-knoepfe">{kopf}</span>
      </div>
      {auf && <div className="nav-inhalt">{children}</div>}
    </section>
  );
}

/**
 * Links die Navigation der App – auf eigenem Hintergrund, damit sie sich klar vom Inhalt abhebt: Projekt,
 * Projektdaten (die Projektkarte aus FORMA, hervorgehoben), Formulare und – durch eine Linie getrennt – der
 * echte Projektordner.
 */
export function Seitenleiste({ onProjekte, onSperren }: { onProjekte: () => void; onSperren: () => void }) {
  const projekt = useFormulare((s) => s.projekt);
  const formulare = useFormulare((s) => s.formulare);
  const offen = useFormulare((s) => s.offen);
  const haupt = useFormulare((s) => s.haupt);
  const karte = useFormulare((s) => s.karte);
  const ablage = useFormulare((s) => ablageVon(s, s.projekt));
  const oap = useFormulare((s) => s.oap);
  const auswahl = useFormulare((s) => auswahlVon(s, s.projekt));
  const eigeneAuswahl = useFormulare((s) => !!s.projekt && !!s.auswahl[s.projekt.ordner]);
  const ablageordner = useFormulare((s) => s.ablageordner.length);
  const breite = useFormulare((s) => s.leisteBreite);
  const { projektWaehlen, formularOeffnen, setHaupt, setLeisteBreite, setAuswahl } = useFormulare.getState();
  const [pfadeBearbeiten, setPfadeBearbeiten] = useState(false);
  const dokumente = useAntrag((s) => s.dokumente);
  const umfangDa = useAntrag((s) => !!s.projektdatei?.umfang);
  // Status je Formular und fehlende Formulare des Projektumfangs
  const statusVon = useMemo(() => new Map(dokumente.filter((d) => d.formular && d.status !== 'entfaellt').map((d) => [d.formular!.pfad, d])), [dokumente]);
  const fehlende = dokumente.filter((d) => d.eintrag.art === 'intern' && !d.formular && d.status === 'fehlt');

  const formularMenue = (f: FormularEintrag): MenuePunkt[] => {
    const umfang = useAntrag.getState().projektdatei?.umfang;
    const zugeordnet = statusVon.get(f.pfad);
    return [
      { text: 'Öffnen', symbol: 'formular', aktion: () => void formularOeffnen(f) },
      { text: 'Als PDF exportieren …', symbol: 'export', deaktiviert: !ablage, aktion: () => useExportDialog.getState().oeffnen(f.pfad) },
      { text: 'Speichern unter …', symbol: 'datei', aktion: () => void useAntrag.getState().speichernUnter(f.pfad) },
      { trenner: true },
      ...(umfang
        ? [
            {
              text: 'Antragsdokument',
              symbol: 'stapel' as const,
              unter: umfang
                .filter((u) => u.art === 'intern')
                .map((u) => ({
                  text: u.titel,
                  symbol: (zugeordnet?.eintrag.id === u.id ? 'haken' : undefined) as 'haken' | undefined,
                  aktion: () => void useAntrag.getState().umfangSetzen(umfang.map((x) => (x.id === u.id ? { ...x, formularDatei: f.pfad.split('/').pop() } : x))),
                })),
            },
          ]
        : []),
      { text: 'Im Explorer zeigen', symbol: 'extern', aktion: () => void oeffnePfad(verbinde(projekt!.root, projekt!.ordner)).catch(() => undefined) },
      { text: 'Pfad kopieren', symbol: 'kopie', aktion: () => void navigator.clipboard?.writeText(verbinde(projekt!.root, f.pfad)) },
    ];
  };

  // Breite mit der Maus ziehen
  const ziehen = (e: React.PointerEvent) => {
    const start = e.clientX;
    const b0 = breite;
    const bewegen = (ev: PointerEvent) => setLeisteBreite(b0 + ev.clientX - start);
    const ende = () => {
      window.removeEventListener('pointermove', bewegen);
      window.removeEventListener('pointerup', ende);
    };
    window.addEventListener('pointermove', bewegen);
    window.addEventListener('pointerup', ende);
  };

  return (
    <aside className="nav" style={{ width: breite }} aria-label="Navigation">
      <div className="nav-rollbereich">
        {projekt && (
          <div className="fo-projektkopf">
            <div className="fo-projektkopf-text" title={verbinde(projekt.root, projekt.ordner)}>
              <span className="nav-klein">Projekt</span>
              <strong>{projekt.ordner}</strong>
              {projekt.titel && <span className="fo-projektkopf-titel">{projekt.titel}</span>}
            </div>
            <div className="fo-projektkopf-knoepfe">
              <button className="small" title="Alle Projekte – zuletzt geöffnete und je Quelle (Strg+K sucht direkt)" onClick={onProjekte}>
                Wechseln
              </button>
              <button className="icon" title="Projekt schließen" aria-label="Projekt schließen" onClick={() => void projektWaehlen(null)}>
                <Symbol name="schliessen" />
              </button>
            </div>
            <FassungsWahl />
            {!ablage ? (
              <button
                className="fo-hinweis-knopf"
                title="Zum Kürzel wurde kein Projektordner gefunden – einen wählen oder anlegen"
                onClick={() => useFormulare.getState().projektordnerZuordnen('Zum Kürzel wurde in den Stammordnern kein Projektordner gefunden. Dort liegt die Projektdatei (.oap) mit den Stammdaten und den Angaben zum Antrag.')}
              >
                <Symbol name="ordner" /> Kein Projektordner – zuordnen …
              </button>
            ) : (
              oap === 'fehlt' && (
                <button
                  className="fo-hinweis-knopf"
                  title="Im Projektordner gibt es noch keine Projektdatei (.oap)"
                  onClick={() => void useFormulare.getState().stammdatenErfassen('Für dieses Projekt gibt es im Projektordner noch keine Projektdatei (.oap). Mit diesen Stammdaten wird sie angelegt.')}
                >
                  <Symbol name="tabelle" /> Keine Projektdatei – Stammdaten erfassen …
                </button>
              )
            )}
          </div>
        )}

        {projekt && (
          <>
            <Abschnitt
              id="formulare"
              titel="FORMA"
              kopf={
                <>
                  <button className="icon" title="Formular hinzufügen – aus dem Vorlagenordner oder einem anderen Projekt" aria-label="Formular hinzufügen" onClick={() => useHinzufuegenDialog.getState().setOffen(true)}>
                    <Symbol name="plus" />
                  </button>
                  <button className="icon" title="Sperren in diesem Projekt prüfen und aufheben" aria-label="Sperren" onClick={onSperren}>
                    <Symbol name="schloss" />
                  </button>
                  <button className="icon" title="FORMA-Projektordner im Explorer zeigen" aria-label="FORMA-Projektordner zeigen" onClick={() => void oeffnePfad(verbinde(projekt.root, projekt.ordner)).catch(() => undefined)}>
                    <Symbol name="extern" />
                  </button>
                </>
              }
            >
              <button
                className={`nav-eintrag fo-eintrag-karte${haupt === 'projektkarte' ? ' aktiv' : ''}`}
                aria-current={haupt === 'projektkarte' ? 'page' : undefined}
                onClick={() => setHaupt('projektkarte')}
                title="Projektdaten aus der FORMA-Projektkarte – Vorhaben, Beteiligte, Grundstück; daraus werden die Formulare ausgefüllt"
              >
                <Symbol name="karte" />
                <span className="fo-eintrag-karte-text">
                  <strong>Projektdaten</strong>
                  <span className="nav-unter">Vorhaben · Beteiligte · Grundstück</span>
                </span>
                {karte && Object.keys(karte.aenderungen).length > 0 && (
                  <span className="fo-ungespeichert" title="Nicht gespeicherte Änderungen">
                    ●
                  </span>
                )}
              </button>
              <div className="nav-liste" role="list" aria-label="Formulare">
                {formulare.map((f) => {
                  const aktiv = offen?.pfad === f.pfad;
                  const ungespeichert = aktiv ? istGeaendert(offen) : hatEntwurf(projekt, f.pfad);
                  const fremd = f.gesperrt && !(aktiv && offen?.sperre.art === 'eigen');
                  const gezeigt = aktiv && haupt === 'formular';
                  const doc = umfangDa ? statusVon.get(f.pfad) : undefined;
                  return (
                    <button
                      key={f.pfad}
                      role="listitem"
                      className={`nav-eintrag${gezeigt ? ' aktiv' : ''}`}
                      aria-current={gezeigt ? 'page' : undefined}
                      title={doc ? `${f.name} – ${doc.eintrag.titel}` : f.name}
                      onClick={() => (aktiv ? setHaupt('formular') : void formularOeffnen(f))}
                      onContextMenu={(e) => zeigeMenue(e, formularMenue(f))}
                    >
                      <span className="nav-symbol">
                        <Symbol name="formular" />
                        {doc && <StatusPunkt status={doc.status} />}
                      </span>
                      <span className="nav-text">{f.name}</span>
                      {fremd && (
                        <span className="nav-schloss" title="Anderswo geöffnet (Sperrdatei vorhanden)" aria-label="gesperrt">
                          <Symbol name="schloss" />
                        </span>
                      )}
                      {ungespeichert && (
                        <span className="fo-ungespeichert" title="Nicht gespeicherte Eingaben">
                          ●
                        </span>
                      )}
                    </button>
                  );
                })}
                {fehlende.map((d) => (
                  <button
                    key={d.eintrag.id}
                    role="listitem"
                    className="nav-eintrag fehlt"
                    title={`${d.eintrag.titel} fehlt im Projekt – klicken, um das Formular anzulegen`}
                    onClick={() => void useAntrag.getState().formularAnlegen(d.eintrag.id)}
                    onContextMenu={(e) =>
                      zeigeMenue(e, [
                        { text: 'Formular anlegen', symbol: 'plus', aktion: () => void useAntrag.getState().formularAnlegen(d.eintrag.id) },
                        { text: 'Projektumfang zeigen', symbol: 'stapel', aktion: umfangZeigen },
                      ])
                    }
                  >
                    <span className="nav-symbol">
                      <Symbol name="formular" />
                      <StatusPunkt status="fehlt" />
                    </span>
                    <span className="nav-text">{d.eintrag.titel}</span>
                    <span className="nav-unter">anlegen</span>
                  </button>
                ))}
                {!formulare.length && !fehlende.length && <p className="nav-leer">Keine Formulare in diesem Projekt.</p>}
              </div>
            </Abschnitt>

            {ablageordner > 0 && <hr className="nav-trenner" />}

            {ablageordner > 0 && (
              <Abschnitt
                id="ablage"
                titel="Projektordner"
                kopf={
                  <>
                    <button className={`icon${pfadeBearbeiten ? ' active' : ''}`} title="Angezeigte Pfade für dieses Projekt" aria-label="Angezeigte Pfade" onClick={() => setPfadeBearbeiten(!pfadeBearbeiten)}>
                      <Symbol name="zahnrad" />
                    </button>
                    {ablage && (
                      <button className="icon" title="Im Explorer zeigen" aria-label="Projektordner zeigen" onClick={() => void oeffnePfad(verbinde(ablage.root, ablage.pfad)).catch(() => undefined)}>
                        <Symbol name="extern" />
                      </button>
                    )}
                  </>
                }
              >
                {pfadeBearbeiten && (
                  <div className="nav-pfade">
                    <label className="small-text">
                      Angezeigte Pfade für {projekt.ordner} (je Zeile, Platzhalter * und ?)
                      <textarea rows={4} defaultValue={auswahl.join('\n')} key={auswahl.join('\n')} onBlur={(e) => setAuswahl(projekt.ordner, e.target.value.split('\n'))} />
                    </label>
                    {eigeneAuswahl && (
                      <button className="small" onClick={() => setAuswahl(projekt.ordner, null)}>
                        Vorgabe verwenden
                      </button>
                    )}
                  </div>
                )}
                {ablage ? (
                  <>
                    <p className="nav-ablage-name" title={verbinde(ablage.root, ablage.pfad)}>
                      {ablage.pfad}
                    </p>
                    <AblageBaum key={`${ablage.root}|${ablage.pfad}`} ordner={ablage} auswahl={auswahl} />
                  </>
                ) : (
                  <p className="nav-leer">Kein Projektordner mit dem Kürzel „{projekt.ordner}“ gefunden.</p>
                )}
              </Abschnitt>
            )}
          </>
        )}
      </div>
      <div className="nav-griff" onPointerDown={ziehen} title="Breite ändern" role="separator" aria-orientation="vertical" />
    </aside>
  );
}
