import { useEffect, useMemo, useState } from 'react';
import { LogDialog } from '@core/ui/LogDialog';
import { StammdatenDialog } from '@core/ui/Stammdaten';
import { ProjektEinstieg } from '@core/ui/ProjektWahl';
import { TitleBar } from '@core/ui/TitleBar';
import { BreitenLeiste } from '@core/ui/Leiste';
import { autofillFelder } from './autofill';
import { ignoriert, ignorierenSetzen, useAktualisieren } from './aktualisieren';
import { auffrischen } from './dateiAktionen';
import { AktualisierenDialog, UnterlagenDialog } from './components/AktualisierenDialog';
import { GesetzModal } from './components/GesetzModal';
import { EinstellungenModal } from './components/Einstellungen';
import { ExportDialog, useExportDialog } from './components/ExportDialog';
import { FormularHinzufuegenDialog, useHinzufuegenDialog } from './components/FormularHinzufuegen';
import { MenueHost, MenueKnopf } from './components/Menue';
import { antragSperre, useAntrag } from './antragStore';
import { DateiAnsicht } from './components/dokumente/DateiAnsicht';
import { Symbol } from './components/Symbol';
import { FelderAnsicht } from './components/FelderAnsicht';
import { Gliederung } from './components/Gliederung';
import { EinrichtenPanel } from './components/Einrichten';
import { useEinrichten } from './einrichten';
import { ProjektkarteAnsicht } from './components/ProjektkarteAnsicht';
import { AntragsdatenAnsicht } from './components/Antrag';
import { ProjektUebersicht } from './components/ProjektUebersicht';
import { ProjektordnerDialog } from './components/ProjektordnerDialog';
import { Schnellwahl } from './components/Schnellwahl';
import { SeitenAnsicht } from './components/SeitenAnsicht';
import { zeigeEintrag } from './components/ProjektkarteAnsicht';
import { Seitenleiste } from './components/Seitenleiste';
import { SperreAufhebenDialog, SperrenDialog, ZustandMarke, wer } from './components/Sperren';
import { VerlaufLeiste } from './components/VerlaufLeiste';
import { kennung, stand } from './forma/formular';
import { springeZuFeld } from './navigation';
import { zurNaechstenOffenen } from './pruefen';
import { useVorbelegung } from './merkmalAbgleich';
import type { Ansicht, OffenesFormular } from './store';
import { ZOOMSTUFEN, bearbeitungGesperrt, istGeaendert, kannVor, kannZurueck, karteGeaendert, useFormulare } from './store';
import { kannRueckgaengig, kannWiederholen } from './verlauf';

const ANSICHTEN: { id: Ansicht; label: string; title: string }[] = [
  { id: 'seite', label: 'Formular', title: 'Die Seiten wie auf Papier – so werden sie gedruckt' },
  { id: 'felder', label: 'Felder', title: 'Die Felder im Aufbau des Formulars, groß und durchsuchbar' },
];

/** Warum nicht bearbeitet werden kann – sonst null */
function sperrgrund(o: OffenesFormular): string | null {
  const g = bearbeitungGesperrt(o);
  if (g) return g;
  if (o.sperre.art !== 'fremd') return null;
  const s = o.sperre.sperre;
  return `Nur ansehen: Das Formular ist bei ${wer(s)} geöffnet${s.angemeldet ? ` (seit ${s.angemeldet})` : ''}. ${o.sperre.bewertung.grund}`;
}

const uhrzeit = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Formular drucken (auch als PDF): immer die Formularansicht, in Originalgröße */
async function drucken() {
  const { ansicht, setAnsicht } = useFormulare.getState();
  if (ansicht !== 'seite') {
    setAnsicht('seite');
    await new Promise((r) => setTimeout(r, 100));
  }
  window.print();
  if (ansicht !== 'seite') setAnsicht(ansicht);
}

/** Feld nach Rückgängig/Wiederholen zeigen */
const zeige = (schluessel: string | null) => schluessel && requestAnimationFrame(() => springeZuFeld(schluessel));

/** Eintrag der Projektkarte zeigen – liegt er in einer anderen Gruppe, wechselt die Ansicht dorthin */
const zeigeKarte = (schluessel: string | null) =>
  schluessel && requestAnimationFrame(() => zeigeEintrag(schluessel) || window.dispatchEvent(new CustomEvent('formulare:pk-sprung', { detail: schluessel })));

export function App() {
  const ds = useFormulare((s) => s.ds);
  const offen = useFormulare((s) => s.offen);
  const projekt = useFormulare((s) => s.projekt);
  const haupt = useFormulare((s) => s.haupt);
  const ansicht = useFormulare((s) => s.ansicht);
  const zoom = useFormulare((s) => s.zoom);
  const verlaufOffen = useFormulare((s) => s.verlaufOffen);
  const gliederungOffen = useFormulare((s) => s.gliederungOffen);
  const einrichten = useEinrichten((s) => s.aktiv);
  const karte = useFormulare((s) => s.karte);
  const datei = useFormulare((s) => s.datei);
  const meldung = useFormulare((s) => s.meldung);
  const konflikt = useFormulare((s) => s.konflikt);
  const stammdaten = useFormulare((s) => s.stammdatenDialog);
  const ordnerDialog = useFormulare((s) => s.ordnerDialog);
  const einstellungenOffen = useFormulare((s) => s.einstellungenOffen);
  const { setAnsicht, setZoom, setMeldung, speichern, neuLaden, dateiOeffnen, projekteLaden, rueckgaengig, wiederholen, setVerlaufOffen, setGliederungOffen, karteSpeichern, karteVerwerfen, karteRueckgaengig, karteWiederholen, sperreNeuPruefen, sperreAufheben } =
    useFormulare.getState();
  const [dialog, setDialog] = useState<'log' | 'schnellwahl' | 'aufheben' | 'sperren' | null>(null);
  const aktualisierenOffen = useAktualisieren((s) => s.dialog);
  useAntrag((s) => s.projektdatei); // für den Haken „Manuelle Überschreibungen ignorieren“ und die Sperre eingereichter Anträge
  const antragGesperrt = useAntrag((s) => !!antragSperre(s, projekt));
  const kartenansicht = haupt === 'projektkarte' && !!projekt;
  const geaendert = kartenansicht ? karteGeaendert(karte) : istGeaendert(offen);
  const grund = offen ? sperrgrund(offen) : null;
  const name =
    ds && (!projekt || haupt === 'projekte') ? 'Projekte' : haupt === 'projektkarte' && projekt ? `Projektdaten ${projekt.ordner}` : haupt === 'antrag' && projekt ? `Antragsdaten ${projekt.ordner}` : haupt === 'datei' && datei ? datei.name : (offen?.name ?? (projekt ? projekt.ordner : 'Kein Formular geöffnet'));
  const zugeordnet = useMemo(() => (offen ? autofillFelder(offen.formular, offen.felder).size : 0), [offen?.formular]); // eslint-disable-line react-hooks/exhaustive-deps
  const formularSichtbar = !!offen && haupt === 'formular';
  // leere Kästchen (Gebäudeklasse) aus den Antragsmerkmalen vorbelegen (U-05)
  useVorbelegung(offen);
  const exportPfad = useExportDialog((s) => s.pfad);
  const hinzufuegen = useHinzufuegenDialog((s) => s.offen);
  // Export-Dialog gehört zum Projekt
  useEffect(() => {
    useExportDialog.getState().schliessen();
  }, [projekt]);
  // Einrichten: auf dem Papier (dort lassen sich Felder anklicken); ein anderes Formular beginnt ohne Auswahl
  useEffect(() => {
    if (einrichten && ansicht !== 'seite') setAnsicht('seite');
  }, [einrichten, ansicht, setAnsicht]);
  useEffect(() => {
    useEinrichten.getState().setAuswahl([]);
  }, [offen?.pfad, offen?.projekt]);
  useEffect(() => {
    if (!offen && einrichten) useEinrichten.getState().setAktiv(false);
  }, [offen, einrichten]);

  useEffect(() => {
    document.title = `${geaendert ? '● ' : ''}${name} – Formulare`;
  }, [name, geaendert]);

  useEffect(() => {
    // erst die gemeinsamen Einstellungen (Stammordner der Projekte), dann suchen
    void useFormulare
      .getState()
      .gemeinsamLaden()
      .then(() => projekteLaden());
  }, [projekteLaden]);

  // von außen geänderte Dateien übernehmen: beim Zurückkommen ins Fenster und alle 15 s, solange es sichtbar ist
  useEffect(() => {
    const sichtbar = () => document.visibilityState !== 'hidden';
    const zurueck = () => {
      if (!sichtbar()) return;
      void auffrischen(true);
      // das Namensschema des Büros kann im Projektordner-Tool geändert worden sein
      void useFormulare.getState().namensschemaNeuLesen();
    };
    const takt = setInterval(() => sichtbar() && void auffrischen(), 15_000);
    window.addEventListener('focus', zurueck);
    document.addEventListener('visibilitychange', zurueck);
    return () => {
      clearInterval(takt);
      window.removeEventListener('focus', zurueck);
      document.removeEventListener('visibilitychange', zurueck);
    };
  }, []);

  // Tastenkürzel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // F8: zur nächsten offenen Angabe (Prüfliste)
      if (e.key === 'F8' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const s = useFormulare.getState();
        if (s.offen && s.haupt === 'formular' && !useEinrichten.getState().aktiv) {
          e.preventDefault();
          zurNaechstenOffenen();
        }
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const s = useFormulare.getState();
      const taste = e.key.toLowerCase();
      if (taste === 's') {
        e.preventDefault();
        if (s.haupt === 'datei') window.dispatchEvent(new Event('formulare:datei-speichern'));
        else void (s.haupt === 'projektkarte' ? s.karteSpeichern() : s.speichern());
      } else if (taste === 'k') {
        e.preventDefault();
        setDialog('schnellwahl');
      } else if (taste === 'p' && s.offen && s.haupt === 'formular') {
        e.preventDefault();
        void drucken();
      } else if (taste === 'e' && s.offen?.projekt && s.haupt === 'formular') {
        e.preventDefault();
        useExportDialog.getState().oeffnen(s.offen.pfad);
      } else if (taste === 'z' || taste === 'y') {
        // eigener Verlauf statt des Rückgängig der Eingabefelder (das kennt die Feldwechsel nicht)
        const zurueck = taste === 'z' && !e.shiftKey;
        if (s.haupt === 'projektkarte' && s.karte) {
          e.preventDefault();
          zeigeKarte(zurueck ? s.karteRueckgaengig() : s.karteWiederholen());
        } else if (s.offen && s.haupt === 'formular') {
          e.preventDefault();
          zeige(zurueck ? s.rueckgaengig() : s.wiederholen());
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const zoomStufe = (richtung: 1 | -1) => {
    const aktuell = zoom || 1;
    const i = ZOOMSTUFEN.findIndex((z) => z >= aktuell);
    const n = Math.max(0, Math.min(ZOOMSTUFEN.length - 1, (i < 0 ? ZOOMSTUFEN.length - 1 : i) + richtung));
    setZoom(ZOOMSTUFEN[n]);
  };

  return (
    <div className="app">
      <TitleBar
        app="Formulare"
        name={name}
        dirty={geaendert}
        onOpenLog={() => setDialog('log')}
        zeichenflaeche={false}
        onProjekte={ds ? () => useFormulare.getState().setHaupt('projekte') : undefined}
        onSpeichern={
          offen && haupt === 'formular' && !bearbeitungGesperrt(offen) && offen.sperre.art !== 'fremd'
            ? async () => {
                await speichern();
                return !istGeaendert(useFormulare.getState().offen);
              }
            : undefined
        }
      />
      <div className="toolbar">
        {formularSichtbar && (
          <div className="tb-group">
            <button className={gliederungOffen ? 'active' : ''} title="Gliederung des Formulars ein- oder ausblenden" onClick={() => setGliederungOffen(!gliederungOffen)}>
              <Symbol name="liste" /> Gliederung
            </button>
            <button
              className={einrichten ? 'active' : ''}
              title="Formular einrichten: Titel, Füllstand, Gruppen und Bedingungen – Felder im Formular anklicken"
              aria-pressed={einrichten}
              onClick={() => useEinrichten.getState().setAktiv(!einrichten)}
            >
              <Symbol name="stift" /> Einrichten
            </button>
          </div>
        )}
        {formularSichtbar && (
          <div className="tb-group">
            {ANSICHTEN.map((a) => (
              <button key={a.id} className={ansicht === a.id ? 'active' : ''} title={a.title} onClick={() => setAnsicht(a.id)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
        {formularSichtbar && (
          <div className="tb-group">
            <button disabled={!kannZurueck(offen) || !!grund} title="Rückgängig (Strg+Z)" aria-label="Rückgängig" onClick={() => zeige(rueckgaengig())}>
              <Symbol name="rueckgaengig" />
            </button>
            <button disabled={!kannVor(offen) || !!grund} title="Wiederholen (Strg+Y)" aria-label="Wiederholen" onClick={() => zeige(wiederholen())}>
              <Symbol name="wiederholen" />
            </button>
            <button className="primary" disabled={!geaendert || !!grund || konflikt} title="In die Formulardatei speichern (Strg+S)" onClick={() => void speichern()}>
              {ds ? 'Speichern' : 'Herunterladen'}
            </button>
            {konflikt && (
              <button title="Datei neu einlesen; deine Eingaben werden wieder eingetragen" onClick={() => void neuLaden()}>
                Neu laden
              </button>
            )}
          </div>
        )}
        {formularSichtbar && ds && projekt && zugeordnet > 0 && (
          <div className="tb-group">
            <button disabled={!!grund} title={`${zugeordnet} Felder dieses Formulars kommen aus der Projektkarte`} onClick={() => useAktualisieren.getState().dialogOeffnen()}>
              <Symbol name="neuLaden" /> Daten aktualisieren …
            </button>
            <MenueKnopf
              title="Formular"
              className="fo-menue-knopf"
              punkte={() => [
                { text: 'Daten aktualisieren …', symbol: 'neuLaden', deaktiviert: !!grund, aktion: () => useAktualisieren.getState().dialogOeffnen() },
                {
                  text: 'Manuelle Überschreibungen ignorieren',
                  symbol: offen && ignoriert(offen.pfad) ? 'haken' : undefined,
                  deaktiviert: !!grund,
                  aktion: () => offen && ignorierenSetzen(!ignoriert(offen.pfad)),
                },
              ]}
            >
              {''}
            </MenueKnopf>
          </div>
        )}
        {formularSichtbar && ansicht === 'seite' && (
          <div className="tb-group fo-zoom">
            <button title="Verkleinern" aria-label="Verkleinern" onClick={() => zoomStufe(-1)}>
              −
            </button>
            <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom">
              <option value={0}>Seitenbreite</option>
              {ZOOMSTUFEN.map((z) => (
                <option key={z} value={z}>
                  {Math.round(z * 100)} %
                </option>
              ))}
            </select>
            <button title="Vergrößern" aria-label="Vergrößern" onClick={() => zoomStufe(1)}>
              +
            </button>
          </div>
        )}
        {formularSichtbar && (
          <div className="tb-group">
            <button title="Drucken (Strg+P)" onClick={() => void drucken()}>
              <Symbol name="drucken" /> Drucken
            </button>
            {offen.projekt && (
              <MenueKnopf
                title="Als PDF exportieren – in den Antragsordner, anderswo ins Projekt oder mit „Speichern unter …“"
                punkte={() => [
                  { text: 'Als PDF exportieren …', symbol: 'export', hinweis: 'Strg+E', aktion: () => useExportDialog.getState().oeffnen(offen.pfad) },
                  { text: 'Speichern unter …', symbol: 'datei', aktion: () => void useAntrag.getState().speichernUnter(offen.pfad) },
                ]}
              >
                <Symbol name="export" /> PDF
              </MenueKnopf>
            )}
            <button className={verlaufOffen ? 'active' : ''} title="Verlauf der Eingaben" onClick={() => setVerlaufOffen(!verlaufOffen)}>
              <Symbol name="verlauf" /> Verlauf
            </button>
          </div>
        )}
        {kartenansicht && karte && (
          <div className="tb-group">
            <button disabled={!kannRueckgaengig(karte.verlauf)} title="Rückgängig (Strg+Z)" aria-label="Rückgängig" onClick={() => zeigeKarte(karteRueckgaengig())}>
              <Symbol name="rueckgaengig" />
            </button>
            <button disabled={!kannWiederholen(karte.verlauf)} title="Wiederholen (Strg+Y)" aria-label="Wiederholen" onClick={() => zeigeKarte(karteWiederholen())}>
              <Symbol name="wiederholen" />
            </button>
            <button className="primary" disabled={!geaendert} title="In die Projektkarte des Projekts speichern (Strg+S)" onClick={() => void karteSpeichern()}>
              Projektkarte speichern
            </button>
            <button disabled={!geaendert} title="Alle ungespeicherten Änderungen zurücknehmen (Strg+Z holt sie zurück)" onClick={karteVerwerfen}>
              Verwerfen
            </button>
          </div>
        )}
        {!ds && (
          <div className="tb-group">
            <button onClick={() => void dateiOeffnen()}>Formular öffnen …</button>
          </div>
        )}
        <span className="tb-spacer" />
        {kartenansicht && karte && (
          <span className="muted small-text fo-status">
            {geaendert ? `${Object.keys(karte.aenderungen).length} Eintrag/Einträge geändert` : 'Alles gespeichert'}
            {geaendert && karte.gesichert && ` · lokal gesichert ${uhrzeit(karte.gesichert)}`}
          </span>
        )}
        {formularSichtbar && (
          <span className="muted small-text fo-status">
            {[kennung(offen.formular), stand(offen.formular) && `Stand ${stand(offen.formular)}`].filter(Boolean).join(' · ')}
            {geaendert && ` · ${Object.keys(offen.aenderungen).length} Feld(er) geändert`}
            {geaendert && offen.gesichert && ` · lokal gesichert ${uhrzeit(offen.gesichert)}`}
          </span>
        )}
        {ds && (
          <div className="tb-group">
            <button title="Projekt oder Formular suchen (Strg+K)" onClick={() => setDialog('schnellwahl')}>
              <Symbol name="suche" /> Suchen …
            </button>
            <button className={einstellungenOffen ? 'active' : ''} title="Einstellungen: Ordner, Stammdaten, Adressbuch, Formulare" aria-label="Einstellungen" onClick={() => useFormulare.getState().einstellungenOeffnen()}>
              <Symbol name="zahnrad" />
            </button>
          </div>
        )}
      </div>
      {(meldung || (formularSichtbar && grund)) && (
        <>
          {meldung && (
            <div className={`fo-meldung ${meldung.art === 'fehler' ? 'fehler' : 'info'}`} role="status">
              <span>{meldung.text}</span>
              <button className="fo-klein" title="Schließen" onClick={() => setMeldung(null)}>
                ×
              </button>
            </div>
          )}
          {formularSichtbar && grund && (
            <div className="fo-meldung hinweis" role="status">
              <span>
                {offen.sperre.art === 'fremd' && <ZustandMarke art={offen.sperre.bewertung.art} />} {grund}
              </span>
              {offen.sperre.art !== 'fremd' && antragGesperrt && (
                <span className="fo-meldung-knoepfe">
                  <button className="fo-klein" title="Status des Antrags ansehen, Nachtrag anlegen" onClick={() => useFormulare.getState().setHaupt('antrag')}>
                    Antragsdaten …
                  </button>
                </span>
              )}
              {offen.sperre.art === 'fremd' && (
                <span className="fo-meldung-knoepfe">
                  <button className="fo-klein" title="Sperrdatei erneut prüfen; ist sie weg, wird das Formular zum Bearbeiten geöffnet" onClick={() => void sperreNeuPruefen()}>
                    Erneut prüfen
                  </button>
                  {offen.sperre.bewertung.aufhebbar && (
                    <button className="fo-klein" onClick={() => setDialog('aufheben')}>
                      Sperre aufheben …
                    </button>
                  )}
                </span>
              )}
            </div>
          )}
        </>
      )}
      <main className="fo-main">
        {ds && projekt && haupt !== 'projekte' && <Seitenleiste onProjekte={() => useFormulare.getState().setHaupt('projekte')} onSperren={() => setDialog('sperren')} />}
        {formularSichtbar && (gliederungOffen || einrichten) && (
          <BreitenLeiste schluessel="formulare:breite:gliederung" vorgabe={260}>
            <Gliederung offen={offen} />
          </BreitenLeiste>
        )}
        <section className={`fo-inhalt${formularSichtbar && ansicht === 'seite' ? ' fo-inhalt-papier' : ''}`}>
          {ds && (!projekt || haupt === 'projekte') ? (
            <ProjektUebersicht onEinstellungen={() => useFormulare.getState().einstellungenOeffnen('ordner')} />
          ) : haupt === 'projektkarte' && projekt ? (
            <ProjektkarteAnsicht />
          ) : haupt === 'antrag' && projekt ? (
            <div className="fo-antragsdaten">
              <AntragsdatenAnsicht />
            </div>
          ) : haupt === 'datei' && datei ? (
            <DateiAnsicht />
          ) : offen ? (
            ansicht === 'felder' ? (
              <FelderAnsicht offen={offen} gesperrt={!!grund} />
            ) : (
              <SeitenAnsicht offen={offen} gesperrt={!!grund} />
            )
          ) : (
            <Leer desktop={!!ds} onEinstellungen={() => useFormulare.getState().einstellungenOeffnen('ordner')} />
          )}
        </section>
        {formularSichtbar && einrichten ? <EinrichtenPanel offen={offen} /> : formularSichtbar && verlaufOffen && <VerlaufLeiste offen={offen} />}
      </main>
      {exportPfad && <ExportDialog formularPfad={exportPfad} onClose={() => useExportDialog.getState().schliessen()} />}
      {hinzufuegen && projekt && <FormularHinzufuegenDialog onClose={() => useHinzufuegenDialog.getState().setOffen(false)} />}
      {ordnerDialog && projekt && <ProjektordnerDialog grund={ordnerDialog.grund} />}
      {stammdaten && projekt && (
        <StammdatenDialog
          titel={`Projektdatei für ${projekt.ordner} anlegen`}
          text={stammdaten.grund}
          meta={stammdaten.meta}
          onSpeichern={(meta) => useFormulare.getState().projektdateiAnlegen(meta)}
          onAbbrechen={() => useFormulare.getState().stammdatenAbbrechen()}
        />
      )}
      {einstellungenOffen && <EinstellungenModal />}
      <MenueHost />
      {dialog === 'log' && <LogDialog onClose={() => setDialog(null)} />}
      <GesetzModal />
      {dialog === 'schnellwahl' && <Schnellwahl onClose={() => setDialog(null)} />}
      {aktualisierenOffen && offen && <AktualisierenDialog offen={offen} onClose={() => useAktualisieren.getState().dialogSchliessen()} />}
      <UnterlagenDialog />
      {dialog === 'sperren' && <SperrenDialog onClose={() => setDialog(null)} />}
      {dialog === 'aufheben' && offen?.sperre.art === 'fremd' && (
        <SperreAufhebenDialog name={offen.name} sperre={offen.sperre.sperre} bewertung={offen.sperre.bewertung} oeffnen onAufheben={sperreAufheben} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function Leer({ desktop, onEinstellungen }: { desktop: boolean; onEinstellungen: () => void }) {
  const ordner = useFormulare((s) => s.projektordner.length);
  const projekt = useFormulare((s) => s.projekt);
  return (
    <div className="fo-leer">
      {/* gleicher Einstieg wie in den anderen Apps: Projekt wählen bzw. Datei öffnen */}
      <ProjektEinstieg
        titel="Bauantragsformulare"
        text={
          desktop
            ? 'Bauantragsformulare ausfüllen – Projekt wählen (links oder über „Projekte“), dann ein Formular.'
            : 'In der Web-Version lässt sich ein einzelnes Formular (.frmsjf) öffnen; die geänderte Fassung wird heruntergeladen. Projektordner, Sperrdateien und direktes Speichern gibt es nur in der Desktop-App.'
        }
        onProjekte={desktop && ordner > 0 ? () => useFormulare.getState().setHaupt('projekte') : undefined}
        onDateiOeffnen={desktop ? undefined : () => void useFormulare.getState().dateiOeffnen()}
        dateiHinweis="Formular (.frmsjf)"
      />
      {desktop && !ordner && (
        <p>
          Stelle zuerst ein, wo eure Formularprojekte liegen. <button onClick={onEinstellungen}>Einstellungen …</button>
        </p>
      )}
      {desktop && ordner > 0 && !projekt && (
        <p>
          Wähle links ein Projekt – oder suche mit <kbd>Strg</kbd>+<kbd>K</kbd> nach Kürzel oder Titel.
        </p>
      )}
      {desktop && projekt && <p>Wähle links ein Formular oder die Projektkarte.</p>}
      <p className="muted small-text">
        Jede Eingabe wird sofort lokal gesichert, mit Verlauf (<kbd>Strg</kbd>+<kbd>Z</kbd> / <kbd>Strg</kbd>+<kbd>Y</kbd>). In die Formulardatei kommt sie mit „Speichern“ (
        <kbd>Strg</kbd>+<kbd>S</kbd>) – geändert wird nur der Inhalt der Felder, Layout und alles andere bleiben Byte für Byte erhalten. Ist ein Formular in einem anderen Programm geöffnet, lässt
        es sich hier nur ansehen.
      </p>
    </div>
  );
}
