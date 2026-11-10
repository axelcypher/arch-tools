import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { oeffnePfad, verbinde } from '../dateisystem';
import { ablageVon, auswahlVon, hatEntwurf, istGeaendert, useFormulare } from '../store';
import { AblageBaum } from './AblageBaum';
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
export function Seitenleiste({ onSchnellwahl, onEinstellungen, onSperren }: { onSchnellwahl: () => void; onEinstellungen: () => void; onSperren: () => void }) {
  const projektordner = useFormulare((s) => s.projektordner);
  const projekte = useFormulare((s) => s.projekte);
  const suchfehler = useFormulare((s) => s.suchfehler);
  const sucht = useFormulare((s) => s.sucht);
  const projekt = useFormulare((s) => s.projekt);
  const formulare = useFormulare((s) => s.formulare);
  const offen = useFormulare((s) => s.offen);
  const haupt = useFormulare((s) => s.haupt);
  const karte = useFormulare((s) => s.karte);
  const ablage = useFormulare((s) => ablageVon(s, s.projekt));
  const auswahl = useFormulare((s) => auswahlVon(s, s.projekt));
  const eigeneAuswahl = useFormulare((s) => !!s.projekt && !!s.auswahl[s.projekt.ordner]);
  const ablageordner = useFormulare((s) => s.ablageordner.length);
  const breite = useFormulare((s) => s.leisteBreite);
  const { projekteLaden, projektWaehlen, formularOeffnen, setHaupt, setLeisteBreite, setAuswahl } = useFormulare.getState();
  const [suche, setSuche] = useState('');
  const [pfadeBearbeiten, setPfadeBearbeiten] = useState(false);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return q ? projekte.filter((p) => `${p.ordner} ${p.titel}`.toLowerCase().includes(q)) : projekte;
  }, [projekte, suche]);

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
        {!projektordner.length && (
          <div className="nav-hinweis">
            <p>Noch kein Ordner mit FORMA-Projekten eingestellt.</p>
            <button className="primary" onClick={onEinstellungen}>
              Einstellungen …
            </button>
          </div>
        )}

        {projekt ? (
          <div className="fo-projektkopf">
            <div className="fo-projektkopf-text" title={verbinde(projekt.root, projekt.ordner)}>
              <span className="nav-klein">Projekt</span>
              <strong>{projekt.ordner}</strong>
              {projekt.titel && <span className="fo-projektkopf-titel">{projekt.titel}</span>}
            </div>
            <div className="fo-projektkopf-knoepfe">
              <button className="small" title="Anderes Projekt (Strg+K)" onClick={onSchnellwahl}>
                Wechseln
              </button>
              <button className="icon" title="Projekt schließen" aria-label="Projekt schließen" onClick={() => void projektWaehlen(null)}>
                <Symbol name="schliessen" />
              </button>
            </div>
          </div>
        ) : (
          projektordner.length > 0 && (
            <Abschnitt
              id="projekte"
              titel={<>Projekte {sucht && <span className="nav-klein">(werden gesucht …)</span>}</>}
              kopf={
                <button className="icon" title="Projekte neu einlesen" aria-label="Projekte neu einlesen" disabled={sucht} onClick={() => void projekteLaden()}>
                  <Symbol name="verlauf" />
                </button>
              }
            >
              <input type="search" className="nav-suche" placeholder="Kürzel oder Titel …" value={suche} onChange={(e) => setSuche(e.target.value)} autoFocus />
              <div className="nav-liste" role="list">
                {gefiltert.map((p) => (
                  <button key={`${p.root}|${p.ordner}`} role="listitem" className="nav-eintrag zweizeilig" title={verbinde(p.root, p.ordner)} onClick={() => void projektWaehlen(p)}>
                    <strong>{p.ordner}</strong>
                    {p.titel && <span className="nav-unter">{p.titel}</span>}
                  </button>
                ))}
                {!sucht && !gefiltert.length && <p className="nav-leer">Keine FORMA-Projekte gefunden.</p>}
              </div>
              {suchfehler.map((f) => (
                <p key={f} className="warning small-text">
                  {f}
                </p>
              ))}
            </Abschnitt>
          )
        )}

        {projekt && (
          <>
            <Abschnitt
              id="formulare"
              titel="FORMA"
              kopf={
                <>
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
                  return (
                    <button
                      key={f.pfad}
                      role="listitem"
                      className={`nav-eintrag${gezeigt ? ' aktiv' : ''}`}
                      aria-current={gezeigt ? 'page' : undefined}
                      title={f.name}
                      onClick={() => (aktiv ? setHaupt('formular') : void formularOeffnen(f))}
                    >
                      <Symbol name="formular" />
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
                {!formulare.length && <p className="nav-leer">Keine Formulare in diesem Projekt.</p>}
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
