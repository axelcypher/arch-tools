import { useCallback, useEffect, useState } from 'react';
import type { FaktWert, Festlegung } from '@core/baurecht/typen';
import { faktName } from '@core/baurecht/typen';
import { isTauri } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { hinweisF6Eigen, hinweisFokussieren } from '@core/ui/Hinweis';
import { Flaeche } from '@core/ui/Karte';
import { BreitenLeiste } from '@core/ui/Leiste';
import { APP_NAMEN, appMitWas } from '@core/appNamen';
import { LogDialog } from '@core/ui/LogDialog';
import { ProjektEinstieg, ProjektWahl } from '@core/ui/ProjektWahl';
import { aenderungenSpeichern, fehlerText, meldung } from '@core/ui/Rueckfrage';
import { TitleBar } from '@core/ui/TitleBar';
import { Angaben } from './components/Angaben';
import { AmpelMarke, AMPEL_ERKLAERUNG } from './components/Ampel';
import { Detail } from './components/Detail';
import type { FolgenRechner } from './components/Dialoge';
import { BestaetigenDialog, bestaetigenFragen, FaktBestaetigenDialog, FestlegenDialog, VorfragenNeinDialog } from './components/Dialoge';
import { Kopf } from './components/Kopf';
import { Protokoll } from './components/Protokoll';
import { Vorschriften } from './components/Vorschriften';
import { lageAbfragen } from './lage';
import { ausProjektwahl, dateiOeffnen, speichernJetzt } from './projekt';
import { auswertungMit, folgenBeimSpeichern, herabstufungen, texteLaden, usePruefstand } from './pruefung';
import { abgelegtesPaket, paketNachladen } from './regelpaket';
import { istGeaendert, offeneBestaetigungen, offeneFestlegungen, PLANUNGSRECHT, useBaurecht } from './store';
import type { BaurechtPruefung } from '@core/baurecht/projekt';

const log = logger('baurecht');

/**
 * Speichern mit zweiter Bestätigung: Festlegungen von Hand (neu, geändert oder aufgehoben) und bestätigte Hinweise.
 * „Ohne diese speichern“ schreibt für sie den Stand der Datei zurück (nichts geht verloren, nichts Unbestätigtes wird
 * gespeichert) und lässt sie danach als Entwurf in der App. true = gespeichert.
 */
let speichertGerade: Promise<boolean> | null = null;

export function speichern(): Promise<boolean> {
  // ein zweites Strg+S bzw. ein Doppelklick während des Speicherns (oder der Bestätigung) startet keinen zweiten Lauf –
  // es bekommt das Ergebnis des laufenden
  if (speichertGerade) return speichertGerade;
  speichertGerade = speichernLauf().finally(() => {
    speichertGerade = null;
  });
  return speichertGerade;
}

async function speichernLauf(): Promise<boolean> {
  if (!useBaurecht.getState().quelle) return false;
  // Modulwerte, die nicht mehr gelten, nicht wieder in die Datei schreiben (eine Auswertung nur, wenn es welche gibt)
  if (Object.values(useBaurecht.getState().pruefung.fakten).some((f) => f.herkunft === 'modul')) useBaurecht.getState().veralteteModulwerteEntfernen(auswertungMit(useBaurecht.getState().pruefung.fakten).fakten);
  const s = useBaurecht.getState();
  // vor dem Dialog: „ohne diese speichern“ setzt die Entwürfe vorübergehend auf den Stand der Datei
  const warGeaendert = istGeaendert(s);
  const festlegungen = offeneFestlegungen(s);
  const fakten = offeneBestaetigungen(s);
  let entwurf: { festlegungen: Record<string, Festlegung | null>; fakten: Record<string, FaktWert | null>; planungsrechtOrt?: BaurechtPruefung['planungsrechtOrt'] | null } | null = null;
  if (festlegungen.length || fakten.length) {
    const a = await bestaetigenFragen({ festlegungen, fakten });
    if (a === 'abbrechen') return false;
    if (a === 'bestaetigen') useBaurecht.getState().festlegungenBestaetigen(festlegungen);
    else {
      // der Stand nach der Antwort (während des Dialogs kann z. B. „Lage abfragen“ fertig geworden sein)
      const jetzt = useBaurecht.getState().pruefung;
      entwurf = {
        festlegungen: Object.fromEntries(festlegungen.map((id) => [id, jetzt.festlegungen[id] ?? null])),
        fakten: Object.fromEntries(fakten.filter((id) => id !== PLANUNGSRECHT).map((id) => [id, jetzt.fakten[id] ?? null])),
        ...(fakten.includes(PLANUNGSRECHT) ? { planungsrechtOrt: jetzt.planungsrechtOrt ?? null } : {}),
      };
      useBaurecht.getState().aufDateistand(festlegungen, fakten);
    }
  }
  let ok = false;
  try {
    const konflikte: string[] = [];
    ok = await speichernJetzt(konflikte);
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
      if (entwurf.planungsrechtOrt !== undefined && gleich(p.planungsrechtOrt, st.pruefungDatei.planungsrechtOrt)) {
        if (entwurf.planungsrechtOrt) p.planungsrechtOrt = entwurf.planungsrechtOrt;
        else delete p.planungsrechtOrt;
      }
      useBaurecht.setState({ pruefung: p });
    }
    // Rückmeldung im Kopf (sichtbar und angesagt) – erst nach dem Zurückschreiben: bleiben Entwürfe, sagt sie das
    if (ok) {
      const st = useBaurecht.getState();
      const offen = offeneFestlegungen(st).length + offeneBestaetigungen(st).length;
      useBaurecht.setState({ gespeichertMeldung: { am: Date.now(), text: offen ? `Gespeichert – ${offen === 1 ? 'ein Entwurf bleibt' : `${offen} Entwürfe bleiben`} offen` : warGeaendert ? 'Gespeichert' : 'Gespeichert – keine Änderungen' } });
    }
  }
}

/**
 * Vor dem Verlassen (anderer Antrag, anderes Projekt, Beenden): true nur, wenn danach nichts Ungespeichertes bleibt.
 * Wer im Bestätigen-Dialog „als Entwurf behalten“ wählt, bleibt – die Entwürfe gehen sonst stillschweigend verloren.
 */
export async function speichernVollstaendig(): Promise<boolean> {
  const ok = await speichern();
  if (!ok) return false;
  if (istGeaendert(useBaurecht.getState())) {
    await meldung('Entwürfe bleiben offen', 'Gespeichert ist alles außer den Entwürfen. Damit sie nicht verloren gehen, bleibt das Projekt geöffnet: bitte die Entwürfe beim Speichern bestätigen, aufheben oder ausdrücklich verwerfen („Nicht speichern“).');
    return false;
  }
  return true;
}

/**
 * Satz der Rückfragen bei ungespeicherten Änderungen (docs/design.md): ungespeichert ist nur der Teil von LEXIO im
 * Projekt – Antragsmerkmale, Angaben, Bestätigungen und Festlegungen –, nicht das ganze Projekt
 */
export const UNGESPEICHERT = 'Die Baurechtsprüfung hat ungespeicherte Änderungen.';

/**
 * Bereiche für F6 und die Sprungmarken: die Werkzeugleiste und jede Karte der Fläche eine Station; zuletzt der Stapel der
 * Hinweise nach einer Aktion (core, `ui/Hinweis.tsx`) – ohne Hinweis übersprungen, F6 im Hinweis springt zur ersten Station
 */
const BEREICHE: { sel: string; sprung?: string; fokus?: () => boolean }[] = [
  { sel: '.br-kopf' },
  { sel: '.br-angaben', sprung: 'Zu den Angaben' },
  { sel: '.br-ergebnis', sprung: 'Zum Ergebnis' },
  { sel: '.br-vorschriften-liste', sprung: 'Zu den Vorschriften' },
  { sel: '.br-detail', sprung: 'Zu den Einzelheiten' },
  { sel: '.hinweise', fokus: hinweisFokussieren },
];

/**
 * in einen Bereich springen: auf den Tabstopp der Liste bzw. das erste Bedienelement; ein Bereich ohne Bedienelement,
 * der selbst fokussierbar ist (Einzelheiten ohne Auswahl, tabindex -1), bekommt den Fokus selbst. true = gesprungen.
 */
function bereichFokussieren(sel: string): boolean {
  const b = document.querySelector<HTMLElement>(sel);
  if (!b) return false;
  const ziel = b.querySelector<HTMLElement>('[data-f6-ziel]') ?? b.querySelector<HTMLElement>('[data-roving][tabindex="0"]') ?? b.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex="0"]') ?? (b.hasAttribute('tabindex') ? b : null);
  if (!ziel) return false;
  ziel.focus();
  return document.activeElement === ziel;
}

/** F6 / Umschalt+F6: zum nächsten Bereich mit Fokusziel – Bereiche ohne Ziel werden übersprungen */
export function bereichWechseln(rueckwaerts: boolean) {
  const n = BEREICHE.length;
  const i = BEREICHE.findIndex((b) => document.querySelector(b.sel)?.contains(document.activeElement));
  for (let k = 1; k <= n; k++) {
    const j = i < 0 ? (rueckwaerts ? n - k : k - 1) : (i + (rueckwaerts ? n - k : k)) % n;
    const b = BEREICHE[j];
    if (b.fokus ? b.fokus() : bereichFokussieren(b.sel)) return;
  }
}

function Start({ onWahl }: { onWahl: () => void }) {
  return (
    <ProjektEinstieg
      app="baurecht"
      als="main"
      text="Rechtsprüfung vor dem Einreichen eines Antrags: alle Vorschriften, die für das Vorhaben eine Rolle spielen – je Paragraf als Ampel, mit Begründung und dem Text in der maßgeblichen Fassung."
      onProjekte={isTauri() ? onWahl : undefined}
      onDateiOeffnen={() => void dateiOeffnen()}
      dateiHinweis="Projektdatei (.oap)"
      fussnote={`Die Angaben kommen aus der Projektdatei (.oap) – Stammdaten, Antragsmerkmale aus ${appMitWas('formulare')}, Festsetzungen aus ${appMitWas('grz')}, Geschosse aus ${appMitWas('flaechenrechner')}.`}
    >
      <dl className="br-legende">
        {(['rot', 'gelb', 'gruen'] as const).map((a) => (
          <div key={a}>
            <dt>
              <AmpelMarke ampel={a} />
            </dt>
            <dd>{AMPEL_ERKLAERUNG[a]}</dd>
          </div>
        ))}
      </dl>
    </ProjektEinstieg>
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
    document.title = project ? `${name} – ${APP_NAMEN.baurecht.name}` : APP_NAMEN.baurecht.name;
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

  // Titelleiste (Beenden, Rahmen-App): nur „gespeichert“, wenn keine Entwürfe übrig bleiben
  const speichernMitMeldung = useCallback(async () => speichernVollstaendig(), []);

  // F6 führt LEXIO selbst (eigener Kreis mit dem Hinweis-Stapel als letzter Station), nicht zusätzlich core
  useEffect(() => {
    hinweisF6Eigen();
    return () => hinweisF6Eigen(false);
  }, []);

  // Strg+S speichern; F6 / Umschalt+F6 springt zwischen Kopf, Angaben, Ergebnis, Vorschriften, Einzelheiten und Hinweisen
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const strg = e.ctrlKey || e.metaKey;
      if (strg && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void speichern();
      }
      if (e.key === 'F6' && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        bereichWechseln(e.shiftKey);
      }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, []);

  // anderer Antrag: ungespeicherte Festlegungen, Bestätigungen und Merkmale nicht stillschweigend verwerfen
  const antragWechseln = async (antrag: string) => {
    if (antrag === useBaurecht.getState().antrag) return;
    if (istGeaendert(useBaurecht.getState()) && !(await aenderungenSpeichern(name, () => speichernVollstaendig(), UNGESPEICHERT))) return;
    useBaurecht.getState().antragWaehlen(antrag);
  };

  const projekteOeffnen = async () => {
    if (istGeaendert(useBaurecht.getState()) && !(await aenderungenSpeichern(name, () => speichernVollstaendig(), UNGESPEICHERT))) return;
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
    return { titel: stand.auswertung.text.paragraf?.(id) ?? id, automatisch: p?.automatisch, ampel: p?.ampel, ueberholt: p?.ueberholt, unwirksam: p?.unwirksam };
  };
  const faktTitel = (id: string) => faktName(stand.auswertung.faktDefs[id], id);
  const faktDef = (id: string) => stand.auswertung.faktDefs[id];
  // Folgen einer Angabe: Vorschau im Dialog (mit der Angabe gegenüber jetzt) …
  const folgen: FolgenRechner = (id, wert, weitere) => {
    const eigene = { ...useBaurecht.getState().pruefung.fakten, ...weitere };
    if (wert) eigene[id] = wert;
    else delete eigene[id];
    const mit = auswertungMit(eigene);
    return { herab: herabstufungen(stand.auswertung, mit), nachher: mit.fakten[id] };
  };
  // … und beim Speichern (jetzt gegenüber dem Stand der Datei)
  // stabil je Auswertung: der Speicherdialog rechnet die Folgen nur neu, wenn sich der Stand wirklich ändert
  const auswertungJetzt = stand.auswertung;
  // je Punkt allein gegenüber der Datei und alle zusammen (Überschneidungen gehen nicht verloren)
  const folgenSeitDatei = useCallback((ids: string[]) => folgenBeimSpeichern(ids, auswertungJetzt), [auswertungJetzt]);

  return (
    <div className="app br-app">
      {/* Sprungmarken als erste Tabstopps (vor der Titelleiste); sichtbar, sobald sie den Fokus haben */}
      {project && (
        <nav className="br-sprung" aria-label="Sprungmarken (auch F6)">
          {BEREICHE.filter((b) => b.sprung).map((b) => (
            <button key={b.sel} type="button" onClick={() => bereichFokussieren(b.sel)}>
              {b.sprung}
            </button>
          ))}
        </nav>
      )}
      <TitleBar app={APP_NAMEN.baurecht.name} name={name} dirty={dirty} ungespeichert={UNGESPEICHERT} zeichenflaeche={false} onOpenLog={() => setLogOffen(true)} onProjekte={() => void projekteOeffnen()} onSpeichern={quelle ? speichernMitMeldung : undefined} />
      {project ? (
        <>
          <h1 className="br-unsichtbar">
            {APP_NAMEN.baurecht.name} – {name}
          </h1>
          <Kopf stand={stand} onRechtsstand={() => void texteLaden(stand.module, stand.einreichung, { aktualisieren: true })} onLage={() => void lage()} onProtokoll={() => setProtokoll(true)} onSpeichern={() => void speichern()} onAntrag={(a) => void antragWechseln(a)} lageLaeuft={lageLaeuft} />
          {!isTauri() && (
            <div className="br-hinweisband" role="note">
              Web-Version: Die Gesetzestexte lassen sich hier nicht abrufen. Ohne Text kann die App nicht prüfen, ob sich ein Paragraf seit der Prüfung der Regel geändert hat – deshalb bleibt, was sonst entfiele, gelb. Die volle Prüfung bietet die Desktop-App.
            </div>
          )}
          {/* Fläche mit Karten (docs/design.md „Fläche und Karten“): links Angaben, in der Mitte Ergebnis über den
              Vorschriften, rechts die Einzelheiten – jede Karte scrollt für sich, jede ist eine Station für F6 */}
          <Flaeche>
            {/* schmale Fenster: die Seitenkarten starten schmaler, damit die Mitte Platz behält */}
            <BreitenLeiste schluessel="baurecht:leiste-angaben" vorgabe={typeof window !== 'undefined' && window.innerWidth < 1200 ? 260 : 330} min={240} max={520} titel="Breite der Angaben" mitteMin={420}>
              <Angaben stand={stand} />
            </BreitenLeiste>
            <Vorschriften stand={stand} />
            <BreitenLeiste schluessel="baurecht:leiste-einzelheiten" vorgabe={typeof window === 'undefined' || window.innerWidth >= 1400 ? 420 : window.innerWidth < 1200 ? 300 : 360} min={280} max={680} seite="rechts" titel="Breite der Einzelheiten" mitteMin={420}>
              <Detail stand={stand} />
            </BreitenLeiste>
          </Flaeche>
        </>
      ) : (
        <>
          <h1 className="br-unsichtbar">{APP_NAMEN.baurecht.name}</h1>
          <Start onWahl={() => setWahl(true)} />
        </>
      )}
      {wahl && (
        <ProjektWahl
          app={APP_NAMEN.baurecht.name}
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
      {protokoll && project && <Protokoll stand={stand} onClose={() => setProtokoll(false)} onSpeichern={() => speichern()} />}
      <FestlegenDialog fakten={stand.auswertung.fakten} widerspruchMerkmale={stand.widerspruchMerkmale} paragrafen={stand.auswertung.paragrafen} />
      <FaktBestaetigenDialog folgen={folgen} faktDef={faktDef} />
      <VorfragenNeinDialog folgen={folgen} />
      <BestaetigenDialog titel={titel} faktTitel={faktTitel} folgen={folgenSeitDatei} faktDef={faktDef} />
      {logOffen && <LogDialog onClose={() => setLogOffen(false)} />}
    </div>
  );
}
