import { useCallback, useEffect, useState } from 'react';
import { isTauri } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { BreitenLeiste } from '@core/ui/Leiste';
import { LogDialog } from '@core/ui/LogDialog';
import { ProjektWahl } from '@core/ui/ProjektWahl';
import { aenderungenSpeichern, fehlerText, meldung } from '@core/ui/Rueckfrage';
import { TitleBar } from '@core/ui/TitleBar';
import { Angaben } from './components/Angaben';
import { AmpelMarke, AMPEL_LANG } from './components/Ampel';
import { Detail } from './components/Detail';
import { BestaetigenDialog, FestlegenDialog, festlegungenBestaetigenFragen } from './components/Dialoge';
import { Bilanz, Kopf } from './components/Kopf';
import { Protokoll } from './components/Protokoll';
import { Vorschriften } from './components/Vorschriften';
import { lageAbfragen } from './lage';
import { ausProjektwahl, dateiOeffnen, speichernJetzt } from './projekt';
import { texteLaden, usePruefstand } from './pruefung';
import { abgelegtesPaket, paketNachladen } from './regelpaket';
import { istGeaendert, offeneFestlegungen, useBaurecht } from './store';

const log = logger('baurecht');

/** Speichern mit zweiter Bestätigung der Festlegungen von Hand; true = gespeichert */
export async function speichern(): Promise<boolean> {
  const s = useBaurecht.getState();
  if (!s.quelle) return false;
  const offen = offeneFestlegungen(s);
  let entwuerfe: Record<string, (typeof s.pruefung.festlegungen)[string]> = {};
  if (offen.length) {
    const a = await festlegungenBestaetigenFragen(offen);
    if (a === 'abbrechen') return false;
    if (a === 'bestaetigen') useBaurecht.getState().festlegungenBestaetigen(offen);
    else {
      // ohne diese Festlegungen speichern: sie bleiben als Entwurf in der App
      entwuerfe = Object.fromEntries(offen.map((id) => [id, s.pruefung.festlegungen[id]]));
      for (const id of offen) useBaurecht.getState().festlegungAufheben(id);
    }
  }
  try {
    const ok = await speichernJetzt();
    return ok;
  } catch (e) {
    log.error('Speichern fehlgeschlagen', { fehler: fehlerText(e) });
    await meldung('Speichern fehlgeschlagen', fehlerText(e), e);
    return false;
  } finally {
    if (Object.keys(entwuerfe).length) {
      const p = structuredClone(useBaurecht.getState().pruefung);
      Object.assign(p.festlegungen, entwuerfe);
      useBaurecht.setState({ pruefung: p });
    }
  }
}

function Start({ onWahl }: { onWahl: () => void }) {
  return (
    <div className="br-start">
      <div className="br-start-karte">
        <h1>Baurecht</h1>
        <p>Rechtsprüfung vor dem Einreichen eines Antrags: alle Vorschriften, die für das Vorhaben eine Rolle spielen – je Paragraf als Ampel, mit Begründung und dem Text in der maßgeblichen Fassung.</p>
        <dl className="br-legende">
          {(['rot', 'gelb', 'gruen'] as const).map((a) => (
            <div key={a}>
              <dt>
                <AmpelMarke ampel={a} />
              </dt>
              <dd>{AMPEL_LANG[a]}</dd>
            </div>
          ))}
        </dl>
        <div className="br-start-knoepfe">
          {isTauri() && (
            <button type="button" className="primary" onClick={onWahl}>
              Projekt wählen …
            </button>
          )}
          <button type="button" className={isTauri() ? '' : 'primary'} onClick={() => void dateiOeffnen()}>
            Projektdatei öffnen …
          </button>
        </div>
        <p className="br-leise">Die Angaben kommen aus der Projektdatei (.oap) – Stammdaten, Antragsmerkmale aus Formulare, Festsetzungen aus dem GRZ-Nachweis, Geschosse aus dem Flächenrechner.</p>
      </div>
    </div>
  );
}

export function App() {
  const project = useBaurecht((s) => s.project);
  const quelle = useBaurecht((s) => s.quelle);
  const dirty = useBaurecht(istGeaendert);
  const [wahl, setWahl] = useState(() => isTauri());
  const [logOffen, setLogOffen] = useState(false);
  const [protokoll, setProtokoll] = useState(false);
  const [lageLaeuft, setLageLaeuft] = useState(false);
  const stand = usePruefstand();
  const name = project?.name ?? 'Kein Projekt';

  useEffect(() => {
    document.title = project ? `${name} – Baurecht` : 'Baurecht';
  }, [project, name]);

  // Regelpaket: abgelegtes (falls neuer), dann nachladen
  useEffect(() => {
    void (async () => {
      const abgelegt = await abgelegtesPaket();
      if (abgelegt) useBaurecht.getState().paketSetzen(abgelegt, `Regelpaket ${abgelegt.version} (nachgeladen)`);
      const n = await paketNachladen(useBaurecht.getState().paket);
      if (n.paket) useBaurecht.getState().paketSetzen(n.paket, n.meldung);
      else useBaurecht.setState({ paketMeldung: n.meldung });
    })();
  }, []);

  // Texte der aktiven Normen zum Stichtag
  const modulSchluessel = stand.module.map((m) => `${m.id}@${m.version}`).join(',');
  useEffect(() => {
    if (!project) return;
    void texteLaden(stand.module, stand.einreichung);
  }, [project, modulSchluessel, stand.einreichung]); // eslint-disable-line react-hooks/exhaustive-deps

  const speichernMitMeldung = useCallback(async () => speichern(), []);

  // Strg+S, Strg+P (Protokoll)
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const strg = e.ctrlKey || e.metaKey;
      if (strg && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void speichern();
      }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, []);

  const projekteOeffnen = async () => {
    if (istGeaendert(useBaurecht.getState()) && !(await aenderungenSpeichern(name, () => speichern()))) return;
    setWahl(true);
  };

  const lage = async () => {
    setLageLaeuft(true);
    try {
      const r = await lageAbfragen();
      if (r.fehler.length) await meldung('Lage abgefragt – mit Hinweisen', `${r.meldung}\n\n${r.fehler.join('\n')}`);
      else await meldung('Lage abgefragt', r.meldung);
    } finally {
      setLageLaeuft(false);
    }
  };

  const titel = (id: string) => {
    const p = stand.auswertung.paragrafen.find((x) => x.id === id);
    return { titel: stand.auswertung.text.paragraf?.(id) ?? id, automatisch: p?.automatisch };
  };

  return (
    <div className="app br-app">
      <TitleBar app="Baurecht" name={name} dirty={dirty} zeichenflaeche={false} onOpenLog={() => setLogOffen(true)} onProjekte={() => void projekteOeffnen()} onSpeichern={quelle ? speichernMitMeldung : undefined} />
      {project ? (
        <>
          <Kopf stand={stand} onRechtsstand={() => void texteLaden(stand.module, stand.einreichung, { aktualisieren: true })} onLage={() => void lage()} onProtokoll={() => setProtokoll(true)} onSpeichern={() => void speichern()} lageLaeuft={lageLaeuft} />
          <Bilanz stand={stand} />
          {!isTauri() && (
            <div className="br-hinweisband" role="note">
              Web-Version: Die Gesetzestexte lassen sich hier nicht abrufen. Ohne Text kann die App nicht prüfen, ob sich ein Paragraf seit der Prüfung der Regel geändert hat – deshalb bleibt, was sonst entfiele, gelb. Die volle Prüfung bietet die Desktop-App.
            </div>
          )}
          <div className="workspace br-arbeit">
            <BreitenLeiste schluessel="baurecht:leiste-angaben" vorgabe={330} min={260} max={520} className="br-leiste-links">
              <Angaben stand={stand} />
            </BreitenLeiste>
            <Vorschriften stand={stand} />
            <div className="br-leiste-rechts">
              <Detail stand={stand} />
            </div>
          </div>
        </>
      ) : (
        <Start onWahl={() => setWahl(true)} />
      )}
      {wahl && (
        <ProjektWahl
          app="Baurecht"
          offeneDatei={quelle?.art === 'ordner' ? quelle.datei : null}
          onGewaehlt={async (g) => {
            try {
              await ausProjektwahl(g);
              setWahl(false);
            } catch (e) {
              await meldung('Projekt nicht geöffnet', fehlerText(e), e);
            }
          }}
          onSchliessen={() => setWahl(false)}
          onDateiOeffnen={() => {
            setWahl(false);
            void dateiOeffnen();
          }}
          dateiHinweis="Projektdatei (.oap)"
        />
      )}
      {protokoll && project && <Protokoll stand={stand} onClose={() => setProtokoll(false)} />}
      <FestlegenDialog />
      <BestaetigenDialog titel={titel} />
      {logOffen && <LogDialog onClose={() => setLogOffen(false)} />}
    </div>
  );
}
