import type { ReactNode } from 'react';
import { formularAktualisieren } from '../aktualisieren';
import { useMemo, useState } from 'react';
import { oeffnePfad, verbinde } from '../dateisystem';
import { ablageVon, auswahlVon, hatEntwurf, istGeaendert, useFormulare } from '../store';
import { aktiveFassung, aktiverEingereicht, antragSperre, useAntrag } from '../antragStore';
import { AntragsAblage, SammelExportKnopf } from './AntragsAblage';
import type { FormularEintrag } from '../projekte';
import { formularLoeschen } from '../dateiAktionen';
import { AblageBaum } from './AblageBaum';
import { ausUmfangEntfernen, FassungsWahl, formularePunkte, StatusPunkt, umfangZeigen } from './Antrag';
import { passt } from '../antrag';
import { useExportDialog } from './ExportDialog';
import { useHinzufuegenDialog } from './FormularHinzufuegen';
import type { MenuePunkt } from './Menue';
import { zeigeMenue, zeigeMenueAn } from './Menue';
import { Symbol } from './Symbol';
import { zeitKurz, zeitLang } from '../zeit';

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
  // Projektordner: ganze Auswahl („Ordner“) oder nur die Dokumente im Antragsordner („Antrag“) – je Rechner gemerkt
  const [ablageAnsicht, setAblageAnsichtRoh] = useState<'ordner' | 'antrag'>(() => {
    try {
      return localStorage.getItem('formulare:ablage-ansicht') === 'antrag' ? 'antrag' : 'ordner';
    } catch {
      return 'ordner';
    }
  });
  const setAblageAnsicht = (a: 'ordner' | 'antrag') => {
    setAblageAnsichtRoh(a);
    try {
      localStorage.setItem('formulare:ablage-ansicht', a);
    } catch {
      // nur für diese Sitzung
    }
  };
  const dokumente = useAntrag((s) => s.dokumente);
  const fassung = useAntrag((s) => aktiveFassung(s, projekt));
  const eingereicht = useAntrag((s) => !!aktiverEingereicht(s, projekt));
  const umfangDa = useAntrag((s) => !!s.projektdatei?.umfang);
  // Status je Formular und fehlende Formulare des Antragsumfangs
  const statusVon = useMemo(() => new Map(dokumente.filter((d) => d.formular && d.status !== 'entfaellt').map((d) => [d.formular!.pfad, d])), [dokumente]);
  const fehlende = dokumente.filter((d) => d.eintrag.art === 'intern' && !d.formular && d.status === 'fehlt');
  // eingereichter Antrag: Antragsumfang gesperrt (Zuordnen, Entfernen, Anlegen)
  const gesperrt = useAntrag((s) => !!antragSperre(s, projekt));
  // zuletzt bearbeitet: Datei oder nicht gespeicherte Eingaben, was später ist
  const formularInfo = useAntrag((s) => s.formularInfo);
  /**
   * Doppelter Eintrag? Ein fehlendes Dokument, dessen Titel zu einem Formular passt, das schon einem anderen Eintrag
   * zugeordnet ist (etwa „Baustatistik“ neben „Statistischer Erhebungsbogen“) – dann kein stilles Anlegen eines zweiten
   * Formulars, sondern zuordnen oder entfernen
   */
  const doppeltVon = (d: (typeof fehlende)[number]) => formulare.find((f) => statusVon.has(f.pfad) && passt(f.name, d.eintrag.titel));

  const formularMenue = (f: FormularEintrag): MenuePunkt[] => {
    const umfang = useAntrag.getState().projektdatei?.umfang;
    const zugeordnet = statusVon.get(f.pfad);
    return [
      { text: 'Öffnen', symbol: 'formular', aktion: () => void formularOeffnen(f) },
      { text: 'Daten aktualisieren', symbol: 'neuLaden', aktion: () => void formularAktualisieren(f) },
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
      { trenner: true },
      { text: 'Löschen …', symbol: 'muell', aktion: () => void formularLoeschen(f) },
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
      {/* fester Kopf: Projekt, Antrag und die Daten-Knöpfe bleiben stehen, darunter rollt die Navigation */}
      {projekt && (
        <div className="nav-fest">
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
          {/* Projektdaten (für das ganze Projekt) und Antragsdaten (nur für den aktiven Antrag) – ein Knopf in zwei Hälften */}
          <div className="fo-daten" role="group" aria-label="Daten">
            <button
              className={`nav-eintrag fo-eintrag-karte${haupt === 'projektkarte' ? ' aktiv' : ''}`}
              aria-current={haupt === 'projektkarte' ? 'page' : undefined}
              onClick={() => setHaupt('projektkarte')}
              title="Projektdaten – gelten für das ganze Projekt: Vorhaben, Beteiligte, Grundstück (Projektkarte); daraus werden die Formulare ausgefüllt"
            >
              <Symbol name="karte" />
              <span className="fo-eintrag-karte-text">
                <strong>Projektdaten</strong>
                <span className="nav-unter">ganzes Projekt</span>
              </span>
              {karte && Object.keys(karte.aenderungen).length > 0 && (
                <span className="fo-ungespeichert" title="Nicht gespeicherte Änderungen">
                  ●
                </span>
              )}
            </button>
            <button
              className={`nav-eintrag fo-eintrag-karte${haupt === 'antrag' ? ' aktiv' : ''}`}
              aria-current={haupt === 'antrag' ? 'page' : undefined}
              onClick={() => setHaupt('antrag')}
              title={`Antragsdaten – gelten nur für den Antrag ${fassung}: Status, Antragsmerkmale, Antragsumfang${eingereicht ? ' · eingereicht und gesperrt' : ''}`}
            >
              <Symbol name={eingereicht ? 'schloss' : 'stapel'} />
              <span className="fo-eintrag-karte-text">
                <strong>Antragsdaten</strong>
                <span className="nav-unter">{eingereicht ? `${fassung} · eingereicht` : fassung}</span>
              </span>
            </button>
          </div>
        </div>
      )}
      <div className="nav-rollbereich">
        {projekt && (
          <>
            <Abschnitt
              id="formulare"
              titel="Formulare"
              kopf={
                <>
                  <button className="icon" title="Formular hinzufügen – aus dem Vorlagenordner oder einem anderen Projekt" aria-label="Formular hinzufügen" onClick={() => useHinzufuegenDialog.getState().setOffen(true)}>
                    <Symbol name="plus" />
                  </button>
                  <SammelExportKnopf />
                  <button className="icon" title="Sperren in diesem Projekt prüfen und aufheben" aria-label="Sperren" onClick={onSperren}>
                    <Symbol name="schloss" />
                  </button>
                  <button className="icon" title="Formularordner des Projekts im Explorer zeigen" aria-label="Formularordner zeigen" onClick={() => void oeffnePfad(verbinde(projekt.root, projekt.ordner)).catch(() => undefined)}>
                    <Symbol name="extern" />
                  </button>
                </>
              }
            >
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
                      title={`${doc ? `${f.name} – ${doc.eintrag.titel}` : f.name}\n${zeitLang(formularInfo[f.pfad]?.letzteAenderung)}`}
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
                      {/* die Zeit immer als letztes, rechtsbündig – Markierungen davor */}
                      {formularInfo[f.pfad]?.letzteAenderung ? <span className="nav-zeit">{zeitKurz(formularInfo[f.pfad].letzteAenderung)}</span> : null}
                    </button>
                  );
                })}
                {fehlende.map((d) => {
                  const doppelt = doppeltVon(d);
                  const menue = (): MenuePunkt[] => [
                    { text: 'Formular anlegen', symbol: 'plus', deaktiviert: gesperrt, aktion: () => void useAntrag.getState().formularAnlegen(d.eintrag.id) },
                    ...(formulare.length ? [{ text: 'Vorhandenes Formular zuordnen', symbol: 'link' as const, unter: formularePunkte(d.eintrag.id), deaktiviert: gesperrt }] : []),
                    { text: 'Aus dem Antragsumfang nehmen', symbol: 'muell', gefahr: true, deaktiviert: gesperrt, aktion: () => void ausUmfangEntfernen(d.eintrag.id) },
                    { trenner: true },
                    { text: 'Antragsumfang zeigen', symbol: 'stapel', aktion: umfangZeigen },
                  ];
                  return (
                    <button
                      key={d.eintrag.id}
                      role="listitem"
                      className={`nav-eintrag fehlt${gesperrt ? ' gesperrt' : ''}`}
                      title={
                        gesperrt
                          ? `${d.eintrag.titel} fehlt – der Antrag ist eingereicht und gesperrt; zum Nachreichen den Status in den Antragsdaten vorübergehend auf „in Arbeit“ setzen`
                          : doppelt
                            ? `${d.eintrag.titel}: „${doppelt.name}“ ist schon „${statusVon.get(doppelt.pfad)!.eintrag.titel}“ zugeordnet – doppelter Eintrag? Klicken: zuordnen oder aus dem Antragsumfang nehmen`
                            : `${d.eintrag.titel} fehlt im Projekt – klicken, um das Formular anzulegen`
                      }
                      aria-haspopup={doppelt && !gesperrt ? 'menu' : undefined}
                      // das Menü am Eintrag öffnen (auch mit Enter/Leertaste, ohne Mauszeiger); gesperrt: nur die Meldung
                      onClick={(e) => (doppelt && !gesperrt ? zeigeMenueAn(e.currentTarget, menue()) : void useAntrag.getState().formularAnlegen(d.eintrag.id))}
                      onContextMenu={(e) => zeigeMenue(e, menue())}
                    >
                      <span className="nav-symbol">
                        <Symbol name="formular" />
                        <StatusPunkt status="fehlt" />
                      </span>
                      <span className="nav-text">{d.eintrag.titel}</span>
                      {!gesperrt && <span className={`nav-unter${doppelt ? ' nav-doppelt' : ''}`}>{doppelt ? 'doppelt?' : 'anlegen'}</span>}
                    </button>
                  );
                })}
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
                    <span className="fo-ablage-umschalter" role="group" aria-label="Ansicht des Projektordners">
                      <button className={ablageAnsicht === 'ordner' ? 'active' : ''} aria-pressed={ablageAnsicht === 'ordner'} title="Angezeigte Pfade des Projektordners" onClick={() => setAblageAnsicht('ordner')}>
                        Ordner
                      </button>
                      <button
                        className={ablageAnsicht === 'antrag' ? 'active' : ''}
                        aria-pressed={ablageAnsicht === 'antrag'}
                        title="Nur die Dokumente im Antragsordner der aktiven Fassung – mit Vollständigkeit und „bereit“"
                        onClick={() => setAblageAnsicht('antrag')}
                      >
                        Antrag
                      </button>
                    </span>
                    {ablageAnsicht === 'ordner' && (
                      <button className={`icon${pfadeBearbeiten ? ' active' : ''}`} title="Angezeigte Pfade für dieses Projekt" aria-label="Angezeigte Pfade" onClick={() => setPfadeBearbeiten(!pfadeBearbeiten)}>
                        <Symbol name="zahnrad" />
                      </button>
                    )}
                    {ablage && (
                      <button className="icon" title="Im Explorer zeigen" aria-label="Projektordner zeigen" onClick={() => void oeffnePfad(verbinde(ablage.root, ablage.pfad)).catch(() => undefined)}>
                        <Symbol name="extern" />
                      </button>
                    )}
                  </>
                }
              >
                {pfadeBearbeiten && ablageAnsicht === 'ordner' && (
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
                {ablage && ablageAnsicht === 'antrag' ? (
                  <AntragsAblage ablage={ablage} />
                ) : ablage ? (
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
