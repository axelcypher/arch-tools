import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { oeffnePfad, verbinde } from '../dateisystem';
import { ablageVon, auswahlVon, hatEntwurf, istGeaendert, useFormulare } from '../store';
import { AblageBaum } from './AblageBaum';
import { Gliederung } from './Gliederung';

/** Aufklappbarer Block der Seitenleiste; der Zustand bleibt je Block erhalten */
function Block({ id, titel, kopf, children, start = true }: { id: string; titel: ReactNode; kopf?: ReactNode; children: ReactNode; start?: boolean }) {
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
    <section className="fo-block">
      <div className="fo-block-kopf">
        <button className="fo-block-titel" aria-expanded={auf} onClick={umschalten}>
          <span className="fo-baum-pfeil" aria-hidden>
            {auf ? '▾' : '▸'}
          </span>{' '}
          {titel}
        </button>
        {kopf}
      </div>
      {auf && <div className="fo-block-inhalt">{children}</div>}
    </section>
  );
}

/** Links: Projekt, Projektkarte, Formulare, Gliederung des offenen Formulars und der echte Projektordner */
export function Seitenleiste({ onSchnellwahl, onEinstellungen }: { onSchnellwahl: () => void; onEinstellungen: () => void }) {
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
    <aside className="fo-leiste" style={{ width: breite }}>
      <div className="fo-leiste-inhalt">
        {!projektordner.length && (
          <div className="fo-hinweis-karte">
            <p>Noch kein Ordner mit FORMA-Projekten eingestellt.</p>
            <button className="primary" onClick={onEinstellungen}>
              Einstellungen …
            </button>
          </div>
        )}

        {projekt ? (
          <div className="fo-projektkopf">
            <div className="fo-projektkopf-text" title={verbinde(projekt.root, projekt.ordner)}>
              <strong>{projekt.ordner}</strong>
              {projekt.titel && <span className="muted">{projekt.titel}</span>}
            </div>
            <button title="Anderes Projekt (Strg+K)" onClick={onSchnellwahl}>
              Wechseln
            </button>
            <button className="fo-klein" title="Projekt schließen" onClick={() => void projektWaehlen(null)}>
              ×
            </button>
          </div>
        ) : (
          projektordner.length > 0 && (
            <Block
              id="projekte"
              titel={<>Projekte {sucht && <span className="muted small-text">(werden gesucht …)</span>}</>}
              kopf={
                <button className="fo-klein" title="Projekte neu einlesen" disabled={sucht} onClick={() => void projekteLaden()}>
                  ↻
                </button>
              }
            >
              <input type="search" placeholder="Kürzel oder Titel …" value={suche} onChange={(e) => setSuche(e.target.value)} autoFocus />
              <div className="fo-liste" role="list">
                {gefiltert.map((p) => (
                  <button key={`${p.root}|${p.ordner}`} role="listitem" className="fo-eintrag" title={verbinde(p.root, p.ordner)} onClick={() => void projektWaehlen(p)}>
                    <strong>{p.ordner}</strong>
                    {p.titel && <span className="muted">{p.titel}</span>}
                  </button>
                ))}
                {!sucht && !gefiltert.length && <p className="muted small-text">Keine FORMA-Projekte gefunden.</p>}
              </div>
              {suchfehler.map((f) => (
                <p key={f} className="warning small-text">
                  {f}
                </p>
              ))}
            </Block>
          )
        )}

        {projekt && (
          <>
            <Block
              id="formulare"
              titel="Formulare"
              kopf={
                <button className="fo-klein" title="FORMA-Projektordner im Explorer zeigen" onClick={() => void oeffnePfad(verbinde(projekt.root, projekt.ordner)).catch(() => undefined)}>
                  ↗
                </button>
              }
            >
              <div className="fo-liste" role="list">
                <button
                  role="listitem"
                  className={`fo-eintrag fo-eintrag-karte${haupt === 'projektkarte' ? ' active' : ''}`}
                  onClick={() => setHaupt('projektkarte')}
                  title="Projektdaten, Beteiligte, Grundstück – daraus werden Formulare ausgefüllt"
                >
                  <span>
                    🗂 Projektkarte
                    {karte && Object.keys(karte.aenderungen).length > 0 && <span className="fo-ungespeichert"> ●</span>}
                  </span>
                </button>
                {formulare.map((f) => {
                  const aktiv = offen?.pfad === f.pfad;
                  const ungespeichert = aktiv ? istGeaendert(offen) : hatEntwurf(projekt, f.pfad);
                  const fremd = f.gesperrt && !(aktiv && offen?.sperre.art === 'eigen');
                  return (
                    <button
                      key={f.pfad}
                      role="listitem"
                      className={`fo-eintrag${aktiv && haupt === 'formular' ? ' active' : ''}`}
                      title={f.name}
                      onClick={() => (aktiv ? setHaupt('formular') : void formularOeffnen(f))}
                    >
                      <span className="fo-eintrag-name">
                        {fremd && (
                          <span title="Anderswo geöffnet (Sperrdatei vorhanden)" aria-label="gesperrt">
                            🔒{' '}
                          </span>
                        )}
                        {f.name}
                        {ungespeichert && (
                          <span className="fo-ungespeichert" title="Nicht gespeicherte Eingaben">
                            {' '}
                            ●
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
                {!formulare.length && <p className="muted small-text">Keine Formulare in diesem Projekt.</p>}
              </div>
            </Block>

            {offen && haupt === 'formular' && (
              <Block id="gliederung" titel="Gliederung">
                <Gliederung offen={offen} />
              </Block>
            )}

            {ablageordner > 0 && (
              <Block
                id="ablage"
                titel="Projektordner"
                kopf={
                  <>
                    <button className={`fo-klein${pfadeBearbeiten ? ' active' : ''}`} title="Angezeigte Pfade für dieses Projekt" onClick={() => setPfadeBearbeiten(!pfadeBearbeiten)}>
                      ⚙
                    </button>
                    {ablage && (
                      <button className="fo-klein" title="Im Explorer zeigen" onClick={() => void oeffnePfad(verbinde(ablage.root, ablage.pfad)).catch(() => undefined)}>
                        ↗
                      </button>
                    )}
                  </>
                }
              >
                {pfadeBearbeiten && (
                  <div className="fo-pfade">
                    <label className="small-text">
                      Angezeigte Pfade für {projekt.ordner} (je Zeile, Platzhalter * und ?)
                      <textarea
                        rows={4}
                        defaultValue={auswahl.join('\n')}
                        key={auswahl.join('\n')}
                        onBlur={(e) => setAuswahl(projekt.ordner, e.target.value.split('\n'))}
                      />
                    </label>
                    {eigeneAuswahl && (
                      <button className="fo-klein" onClick={() => setAuswahl(projekt.ordner, null)}>
                        Vorgabe verwenden
                      </button>
                    )}
                  </div>
                )}
                {ablage ? (
                  <>
                    <p className="muted small-text fo-ablage-name" title={verbinde(ablage.root, ablage.pfad)}>
                      {ablage.pfad}
                    </p>
                    <AblageBaum key={`${ablage.root}|${ablage.pfad}`} ordner={ablage} auswahl={auswahl} />
                  </>
                ) : (
                  <p className="muted small-text">Kein Projektordner mit dem Kürzel „{projekt.ordner}“ gefunden.</p>
                )}
              </Block>
            )}
          </>
        )}
      </div>
      <div className="fo-leiste-griff" onPointerDown={ziehen} title="Breite ändern" role="separator" aria-orientation="vertical" />
    </aside>
  );
}
