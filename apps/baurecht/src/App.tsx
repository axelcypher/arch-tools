import { useCallback, useEffect, useState } from 'react';
import type { FaktWert, Festlegung } from '@core/baurecht/typen';
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
import type { FolgenRechner } from './components/Dialoge';
import { BestaetigenDialog, bestaetigenFragen, FaktBestaetigenDialog, FestlegenDialog } from './components/Dialoge';
import { Kopf } from './components/Kopf';
import { Protokoll } from './components/Protokoll';
import { Vorschriften } from './components/Vorschriften';
import { lageAbfragen } from './lage';
import { ausProjektwahl, dateiOeffnen, speichernJetzt } from './projekt';
import { auswertungMit, herabstufungen, texteLaden, usePruefstand } from './pruefung';
import { abgelegtesPaket, paketNachladen } from './regelpaket';
import { istGeaendert, offeneBestaetigungen, offeneFestlegungen, useBaurecht } from './store';

const log = logger('baurecht');

/**
 * Speichern mit zweiter Bestätigung: Festlegungen von Hand (neu, geändert oder aufgehoben) und bestätigte Hinweise.
 * „Ohne diese speichern“ schreibt für sie den Stand der Datei zurück (nichts geht verloren, nichts Unbestätigtes wird
 * gespeichert) und lässt sie danach als Entwurf in der App. true = gespeichert.
 */
let speichertGerade = false;

export async function speichern(): Promise<boolean> {
  // ein zweites Strg+S während des Speicherns (oder während der Bestätigung) startet keinen zweiten Lauf
  if (speichertGerade) return false;
  speichertGerade = true;
  try {
    return await speichernLauf();
  } finally {
    speichertGerade = false;
  }
}

async function speichernLauf(): Promise<boolean> {
  const s = useBaurecht.getState();
  if (!s.quelle) return false;
  const festlegungen = offeneFestlegungen(s);
  const fakten = offeneBestaetigungen(s);
  let entwurf: { festlegungen: Record<string, Festlegung | null>; fakten: Record<string, FaktWert | null> } | null = null;
  if (festlegungen.length || fakten.length) {
    const a = await bestaetigenFragen({ festlegungen, fakten });
    if (a === 'abbrechen') return false;
    if (a === 'bestaetigen') useBaurecht.getState().festlegungenBestaetigen(festlegungen);
    else {
      // der Stand nach der Antwort (während des Dialogs kann z. B. „Lage abfragen“ fertig geworden sein)
      const jetzt = useBaurecht.getState().pruefung;
      entwurf = {
        festlegungen: Object.fromEntries(festlegungen.map((id) => [id, jetzt.festlegungen[id] ?? null])),
        fakten: Object.fromEntries(fakten.map((id) => [id, jetzt.fakten[id] ?? null])),
      };
      useBaurecht.getState().aufDateistand(festlegungen, fakten);
    }
  }
  try {
    const konflikte: string[] = [];
    const ok = await speichernJetzt(konflikte);
    if (ok && konflikte.length)
      await meldung('Gleichzeitig geändert', `Diese Einträge wurden inzwischen auch an anderer Stelle (andere App-Instanz) geändert; gespeichert ist Ihr Stand:\n\n${konflikte.join('\n')}\n\nBitte prüfen, ob das so stimmt.`);
    return ok;
  } catch (e) {
    log.error('Speichern fehlgeschlagen', { fehler: fehlerText(e) });
    await meldung('Speichern fehlgeschlagen', fehlerText(e), e);
    return false;
  } finally {
    if (entwurf) {
      // Entwürfe zurück in die App – nur, wo seitdem nichts anderes geschrieben wurde (Eintrag = Stand der Datei)
      const st = useBaurecht.getState();
      const p = structuredClone(st.pruefung);
      const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      for (const [id, f] of Object.entries(entwurf.festlegungen)) {
        if (!gleich(p.festlegungen[id], st.pruefungDatei.festlegungen[id])) continue;
        if (f) p.festlegungen[id] = f;
        else delete p.festlegungen[id];
      }
      for (const [id, f] of Object.entries(entwurf.fakten)) {
        if (!gleich(p.fakten[id], st.pruefungDatei.fakten[id])) continue;
        if (f) p.fakten[id] = f;
        else delete p.fakten[id];
      }
      useBaurecht.setState({ pruefung: p });
    }
  }
}

/** Bereiche für F6 und die Sprungmarken */
const BEREICHE = [
  { sel: '.br-kopf', titel: 'Kopf' },
  { sel: '.br-angaben', titel: 'Angaben' },
  { sel: '.br-vorschriften-liste', titel: 'Vorschriften' },
  { sel: '.br-detail', titel: 'Einzelheiten' },
];

/** in einen Bereich springen: auf den Tabstopp der Liste bzw. das erste Bedienelement */
function bereichFokussieren(sel: string) {
  const b = document.querySelector<HTMLElement>(sel);
  if (!b) return;
  const ziel = b.querySelector<HTMLElement>('[data-roving][tabindex="0"]') ?? b.querySelector<HTMLElement>('button:not([disabled]), input, select, textarea, [tabindex="0"]');
  ziel?.focus();
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

  // Strg+S speichern; F6 / Umschalt+F6 springt zwischen Kopf, Angaben, Vorschriften und Einzelheiten
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const strg = e.ctrlKey || e.metaKey;
      if (strg && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void speichern();
      }
      if (e.key === 'F6' && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        const i = BEREICHE.findIndex((b) => document.querySelector(b.sel)?.contains(document.activeElement));
        const n = BEREICHE.length;
        bereichFokussieren(BEREICHE[(i < 0 ? 0 : i + (e.shiftKey ? n - 1 : 1)) % n].sel);
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
    return { titel: stand.auswertung.text.paragraf?.(id) ?? id, automatisch: p?.automatisch, ampel: p?.ampel, ueberholt: p?.ueberholt };
  };
  const faktTitel = (id: string) => stand.auswertung.faktDefs[id]?.titel ?? id;
  // Folgen einer Angabe: Vorschau im Dialog (mit der Angabe gegenüber jetzt) …
  const folgen: FolgenRechner = (id, wert) => {
    const eigene = { ...useBaurecht.getState().pruefung.fakten };
    if (wert) eigene[id] = wert;
    else delete eigene[id];
    return { herab: herabstufungen(stand.auswertung, auswertungMit(eigene)) };
  };
  // … und beim Speichern (jetzt gegenüber dem Stand der Datei)
  const folgenSeitDatei = (id: string) => {
    const s = useBaurecht.getState();
    const eigene = { ...s.pruefung.fakten };
    const alt = s.pruefungDatei.fakten[id];
    if (alt) eigene[id] = alt;
    else delete eigene[id];
    return { herab: herabstufungen(auswertungMit(eigene), stand.auswertung) };
  };

  return (
    <div className="app br-app">
      <TitleBar app="Baurecht" name={name} dirty={dirty} zeichenflaeche={false} onOpenLog={() => setLogOffen(true)} onProjekte={() => void projekteOeffnen()} onSpeichern={quelle ? speichernMitMeldung : undefined} />
      {project ? (
        <>
          <nav className="br-sprung" aria-label="Sprungmarken (auch F6)">
            {BEREICHE.slice(1).map((b) => (
              <button key={b.sel} type="button" onClick={() => bereichFokussieren(b.sel)}>
                Zu den {b.titel === 'Angaben' ? 'Angaben' : b.titel === 'Vorschriften' ? 'Vorschriften' : 'Einzelheiten'}
              </button>
            ))}
          </nav>
          <Kopf stand={stand} onRechtsstand={() => void texteLaden(stand.module, stand.einreichung, { aktualisieren: true })} onLage={() => void lage()} onProtokoll={() => setProtokoll(true)} onSpeichern={() => void speichern()} lageLaeuft={lageLaeuft} />
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
      <FestlegenDialog fakten={stand.auswertung.fakten} />
      <FaktBestaetigenDialog folgen={folgen} />
      <BestaetigenDialog titel={titel} faktTitel={faktTitel} folgen={folgenSeitDatei} />
      {logOffen && <LogDialog onClose={() => setLogOffen(false)} />}
    </div>
  );
}
