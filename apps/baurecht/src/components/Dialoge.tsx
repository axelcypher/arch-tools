import { useEffect, useMemo, useRef, useState } from 'react';
import { paragrafName } from '@core/baurecht/typen';
import { create } from 'zustand';
import type { Ampel, FaktStatus, FaktWert, ParagrafErgebnis } from '@core/baurecht/typen';
import { faktStatus } from '@core/baurecht/typen';
import { lageKennung } from '@core/baurecht/geodienste';
import { Modal } from '@core/ui/Dialog';
import { benutzer, benutzerMerken } from '../benutzer';
import { useBaurecht } from '../store';
import { AMPEL_LANG, AMPEL_TEXT, AmpelMarke } from './Ampel';

const RANG: Record<Ampel, number> = { rot: 2, gelb: 1, gruen: 0 };

/* ---------- Festlegen (erste Bestätigung) ---------- */

interface FestlegenState {
  p: ParagrafErgebnis | null;
  oeffnen: (p: ParagrafErgebnis) => void;
  schliessen: () => void;
}

const useFestlegen = create<FestlegenState>((set) => ({ p: null, oeffnen: (p) => set({ p }), schliessen: () => set({ p: null }) }));
export const festlegenOeffnen = (p: ParagrafErgebnis) => useFestlegen.getState().oeffnen(p);

/**
 * Ampel von Hand festlegen – Begründung Pflicht; beim Speichern wird noch einmal bestätigt. `fakten` sind alle
 * Angaben der Auswertung (Projektdatei, Module, Geodienste, von Hand): an ihnen hängt die Festlegung, ändern sie sich,
 * ist sie überholt.
 */
export function FestlegenDialog({ fakten }: { fakten: Record<string, FaktWert> }) {
  const p = useFestlegen((s) => s.p);
  const schliessen = useFestlegen((s) => s.schliessen);
  const texte = useBaurecht((s) => s.texte);
  const merkmale = useBaurecht((s) => s.merkmale);
  const [ampel, setAmpel] = useState<Ampel>('gelb');
  const [grund, setGrund] = useState('');
  const [von, setVon] = useState('');
  const [versucht, setVersucht] = useState(false);
  const [verwerfen, setVerwerfen] = useState(false);
  const feld = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!p) return;
    setVerwerfen(false);
    // Vorgabe: die bisherige Festlegung bzw. die automatische Ampel – eine Herabstufung wählt man bewusst
    setAmpel(p.festlegung?.ampel ?? p.automatisch);
    setGrund(p.festlegung?.grund ?? '');
    setVon(benutzer());
    setVersucht(false);
    setTimeout(() => feld.current?.focus(), 0);
  }, [p]);
  if (!p) return null;
  const herab = RANG[ampel] < RANG[p.automatisch];
  const ok = grund.trim().length >= 10 && von.trim().length > 0;
  // Esc bzw. Schließen mit getippter Begründung: erst nachfragen
  const zu = () => (grund.trim() && grund.trim() !== (p.festlegung?.grund ?? '') ? setVerwerfen(true) : schliessen());
  const festlegen = () => {
    setVersucht(true);
    if (!ok) {
      feld.current?.focus();
      return;
    }
    const fassung = texte[`${p.modul}/${p.norm}`]?.fassung;
    const summen: Record<string, string> = {};
    for (const f of p.fundstellen) if (fassung?.summen[f]) summen[f] = fassung.summen[f];
    const werte: Record<string, string | number | boolean | null> = {};
    const sicherheit: Record<string, FaktStatus> = {};
    for (const v of p.verwendet) {
      werte[v] = v.startsWith('merkmal:') ? (merkmale[v.slice(8)] ?? null) : (fakten[v]?.wert ?? null);
      if (!v.includes(':') && fakten[v]) sicherheit[v] = faktStatus(fakten[v]);
    }
    benutzerMerken(von);
    useBaurecht.getState().festlegen(p, ampel, grund, von.trim(), summen, werte, sicherheit);
    schliessen();
  };
  return (
    <Modal titel={`${paragrafName(p.paragraf)} von Hand festlegen`} onClose={zu} breit klickDaneben={false}>
      <h3>
        {paragrafName(p.paragraf)} {p.titel} – von Hand festlegen
      </h3>
      <p className="br-leise">
        Automatisch: <AmpelMarke ampel={p.automatisch} klein /> {p.gruende[0]}
      </p>
      <fieldset className="br-wahl">
        <legend>Ampel</legend>
        {(['rot', 'gelb', 'gruen'] as const).map((a) => (
          <label key={a} className={`br-wahl-zeile${ampel === a ? ' br-gewaehlt' : ''}`}>
            <input type="radio" name="ampel" checked={ampel === a} onChange={() => setAmpel(a)} />
            <AmpelMarke ampel={a} />
            <span>{AMPEL_LANG[a]}</span>
          </label>
        ))}
      </fieldset>
      {ampel === 'gruen' && !texte[`${p.modul}/${p.norm}`]?.fassung && (
        <div className="br-meldung br-meldung-warn" role="note">
          Ohne geprüften Gesetzestext greift „entfällt“ nicht: Die Ampel bleibt „prüfen“, bis der Text vorliegt (Desktop-App) und Sie dort erneut festlegen. Die Begründung wird trotzdem gespeichert.
        </div>
      )}
      {herab && (
        <div className="br-meldung br-meldung-warn" role="alert">
          Sie stufen von „{AMPEL_TEXT[p.automatisch]}“ auf „{AMPEL_TEXT[ampel]}“ herab. Das ist erlaubt, wenn der Sonderfall begründet ist – die Festlegung steht im Prüfprotokoll und muss beim Speichern noch einmal bestätigt werden.
        </div>
      )}
      <label className="field">
        <span className="field-label">
          Begründung <span aria-hidden="true">*</span>
        </span>
        <textarea
          ref={feld}
          rows={4}
          value={grund}
          onChange={(e) => setGrund(e.target.value)}
          aria-required="true"
          aria-invalid={versucht && grund.trim().length < 10}
          aria-describedby={versucht && grund.trim().length < 10 ? 'br-festlegen-fehler' : undefined}
          placeholder="z. B. Begehung am 03.11.2026 ohne Befund, Bericht im Projektordner"
        />
        {versucht && grund.trim().length < 10 && (
          <span id="br-festlegen-fehler" className="field-hint br-fehler-text">
            Bitte begründen (mindestens 10 Zeichen) – die Begründung steht im Prüfprotokoll.
          </span>
        )}
      </label>
      <label className="field">
        <span className="field-label">
          Festgelegt von <span aria-hidden="true">*</span>
        </span>
        <input value={von} onChange={(e) => setVon(e.target.value)} aria-required="true" />
      </label>
      {verwerfen ? (
        <div className="br-meldung br-meldung-warn dialog-buttons br-verwerfen" role="alert">
          <span>Die Begründung ist noch nicht übernommen. Verwerfen?</span>
          <button type="button" onClick={() => setVerwerfen(false)}>
            Weiter bearbeiten
          </button>
          <button type="button" className="danger" onClick={schliessen}>
            Verwerfen
          </button>
        </div>
      ) : (
        <div className="dialog-buttons">
          <button type="button" onClick={zu}>
            Abbrechen
          </button>
          <button type="button" className="primary" onClick={festlegen} aria-disabled={!ok}>
            Festlegen
          </button>
        </div>
      )}
    </Modal>
  );
}

/* ---------- Hinweis bestätigen bzw. Angabe von Hand setzen (erste Bestätigung) ---------- */

interface FaktZiel {
  id: string;
  titel: string;
  /** „bestaetigen“: einen Hinweis als gesichert übernehmen; „setzen“: einen Wert von Hand angeben */
  modus: 'bestaetigen' | 'setzen';
  /** bestätigen: der Hinweis; setzen: der neue Wert */
  wert: FaktWert;
  /** Eintrag der Prüfung beim Öffnen – hat er sich bis zum Bestätigen geändert (z. B. „Lage abfragen“), wird abgebrochen */
  vorher: string;
  /** die Angabe hängt an der Lage (Geodienst) – gilt nach dem Setzen nur für die aktuelle Lage */
  lagebezug?: boolean;
}

const useFaktBestaetigen = create<{ ziel: FaktZiel | null }>(() => ({ ziel: null }));
const eintrag = (id: string) => JSON.stringify(useBaurecht.getState().pruefung.fakten[id] ?? null);
export const faktBestaetigenOeffnen = (id: string, titel: string, wert: FaktWert, lagebezug = false) => useFaktBestaetigen.setState({ ziel: { id, titel, modus: 'bestaetigen', wert, vorher: eintrag(id), lagebezug } });
export const faktSetzenOeffnen = (id: string, titel: string, wert: FaktWert['wert'], lagebezug = false) =>
  useFaktBestaetigen.setState({ ziel: { id, titel, modus: 'setzen', wert: { wert, herkunft: 'manuell', sicherheit: 'sicher' }, vorher: eintrag(id), lagebezug } });

const wertText = (w: FaktWert['wert']) => (w === true ? 'ja' : w === false ? 'nein' : String(w));

/** Folgen einer Angabe: wie viele Paragrafen dadurch auf „entfällt“ (bzw. schwächer) gehen – für die Dialoge */
export type FolgenRechner = (id: string, wert: FaktWert | null) => { herab: { id: string; titel: string; von: Ampel; nach: Ampel }[] };

function Folgen({ folgen }: { folgen: ReturnType<FolgenRechner> }) {
  if (!folgen.herab.length) return <p className="br-leise">Keine Vorschrift ändert dadurch ihre Ampel.</p>;
  const gruen = folgen.herab.filter((h) => h.nach === 'gruen').length;
  return (
    <details className="br-folgen">
      <summary>
        <strong>
          Stuft {folgen.herab.length} {folgen.herab.length === 1 ? 'Vorschrift' : 'Vorschriften'} herab
        </strong>
        {gruen ? `, davon ${gruen} auf „entfällt“` : ''} – Liste anzeigen
      </summary>
      <ul>
        {folgen.herab.map((h) => (
          <li key={h.id}>
            <AmpelMarke ampel={h.von} klein /> <span aria-label="wird zu">→</span> <AmpelMarke ampel={h.nach} klein /> {h.titel}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Einen Hinweis (z. B. „kein Treffer im Landschaftsschutzgebiet“) als gesichert übernehmen bzw. eine Angabe zu
 * Schutzgebieten und Geodaten von Hand setzen: nur mit Begründung (worauf gestützt, z. B. Auskunft der Behörde mit
 * Datum). Der Dialog zeigt, welche Vorschriften dadurch herabgestuft werden. Geodaten gelten nur für die aktuelle Lage;
 * beim Speichern wird die Angabe noch einmal abgefragt und steht im Prüfprotokoll.
 */
export function FaktBestaetigenDialog({ folgen }: { folgen: FolgenRechner }) {
  const ziel = useFaktBestaetigen((s) => s.ziel);
  const project = useBaurecht((s) => s.project);
  const [grund, setGrund] = useState('');
  const [von, setVon] = useState('');
  const [versucht, setVersucht] = useState(false);
  const [veraltet, setVeraltet] = useState(false);
  const [verwerfen, setVerwerfen] = useState(false);
  const feld = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!ziel) return;
    setGrund('');
    setVon(benutzer());
    setVersucht(false);
    setVeraltet(false);
    setVerwerfen(false);
    setTimeout(() => feld.current?.focus(), 0);
  }, [ziel]);
  const vorschau = useMemo(() => {
    if (!ziel) return null;
    const k = project?.meta.koordinaten;
    const lage = k ? lageKennung(k.ost, k.nord) : undefined;
    // wie beim Übernehmen: mit Lagebezug, aber ohne Koordinaten bleibt die Angabe Hinweis – dann ändert sich nichts
    if (ziel.lagebezug && !lage) return folgen(ziel.id, ziel.modus === 'setzen' ? { ...ziel.wert, sicherheit: 'hinweis' } : ziel.wert);
    const neu: FaktWert = { ...ziel.wert, bestaetigt: { von: '', am: '', ...(ziel.modus === 'setzen' ? { grund: 'Vorschau' } : {}), ...(ziel.lagebezug && lage ? { lage } : {}) } };
    return folgen(ziel.id, neu);
  }, [ziel, folgen, project]);
  if (!ziel) return null;
  const schliessen = () => useFaktBestaetigen.setState({ ziel: null });
  const zu = () => (grund.trim() ? setVerwerfen(true) : schliessen());
  const ok = grund.trim().length >= 10 && von.trim().length > 0;
  const bestaetigen = () => {
    setVersucht(true);
    if (!ok) {
      feld.current?.focus();
      return;
    }
    if (eintrag(ziel.id) !== ziel.vorher) {
      setVeraltet(true);
      return;
    }
    const k = project?.meta.koordinaten;
    benutzerMerken(von);
    // Lagebezug (Schutzgebiete, Geodaten): an die aktuelle Lage binden; ohne Koordinaten bleibt es Hinweis (null)
    const lage = ziel.lagebezug ? (k ? lageKennung(k.ost, k.nord) : null) : undefined;
    if (ziel.modus === 'setzen') useBaurecht.getState().faktSetzen(ziel.id, ziel.wert.wert, von.trim(), grund, lage);
    else useBaurecht.getState().faktBestaetigen(ziel.id, ziel.wert, von.trim(), grund, lage);
    schliessen();
  };
  const geo = ziel.wert.herkunft === 'geodienst';
  const fehlerId = 'br-fakt-grund-fehler';
  return (
    <Modal titel={ziel.modus === 'setzen' ? 'Angabe von Hand setzen' : 'Angabe bestätigen'} onClose={zu} breit klickDaneben={false}>
      <h3>
        {ziel.titel}: „{wertText(ziel.wert.wert)}“ {ziel.modus === 'setzen' ? 'von Hand setzen' : 'bestätigen'}
      </h3>
      {ziel.modus === 'bestaetigen' ? (
        <p className="br-leise-stark">
          Bisher nur Hinweis{ziel.wert.quelle ? ` (${ziel.wert.quelle})` : ''}: {ziel.wert.grund ?? 'nicht gesichert'}
        </p>
      ) : (
        <p className="br-leise-stark">Angaben zu Schutzgebieten und Geodaten gelten von Hand nur mit Beleg. Widerspricht die Angabe einem Treffer eines Dienstes, bleibt der Widerspruch sichtbar – betroffene Vorschriften werden dann nicht „entfällt“.</p>
      )}
      {vorschau && <Folgen folgen={vorschau} />}
      <div className="br-meldung br-meldung-warn" role="note">
        Die Angabe gilt danach als gesichert. Bitte nur angeben, was belegt ist – die Begründung steht im Prüfprotokoll.
        {ziel.lagebezug ? (project?.meta.koordinaten ? ' Sie gilt nur für die aktuelle Lage des Vorhabens.' : ' Ohne Koordinaten in den Stammdaten lässt sie sich an keine Lage binden und bleibt Hinweis.') : ''}
      </div>
      {veraltet && (
        <div className="br-meldung br-meldung-fehler" role="alert">
          Die Angabe hat sich inzwischen geändert (z. B. durch „Lage abfragen“). Bitte den Dialog schließen und neu prüfen.
        </div>
      )}
      <label className="field">
        <span className="field-label">
          Worauf gestützt? <span aria-hidden="true">*</span>
        </span>
        <textarea
          ref={feld}
          rows={3}
          value={grund}
          onChange={(e) => setGrund(e.target.value)}
          aria-required="true"
          aria-invalid={versucht && grund.trim().length < 10}
          aria-describedby={versucht && grund.trim().length < 10 ? fehlerId : undefined}
          placeholder={geo || ziel.id.startsWith('schutz.') ? 'z. B. Auskunft Untere Naturschutzbehörde vom 03.11.2026, Aktenzeichen …' : 'z. B. Modell geprüft am 12.11.2026 / Flurstücksnachweis vom …'}
        />
        {versucht && grund.trim().length < 10 && (
          <span id={fehlerId} className="field-hint br-fehler-text">
            Bitte angeben, worauf die Angabe beruht (mindestens 10 Zeichen).
          </span>
        )}
      </label>
      <label className="field">
        <span className="field-label">
          {ziel.modus === 'setzen' ? 'Angegeben von' : 'Bestätigt von'} <span aria-hidden="true">*</span>
        </span>
        <input value={von} onChange={(e) => setVon(e.target.value)} aria-required="true" />
      </label>
      {verwerfen ? (
        <div className="br-meldung br-meldung-warn dialog-buttons br-verwerfen" role="alert">
          <span>Die Begründung ist noch nicht übernommen. Verwerfen?</span>
          <button type="button" onClick={() => setVerwerfen(false)}>
            Weiter bearbeiten
          </button>
          <button type="button" className="danger" onClick={schliessen}>
            Verwerfen
          </button>
        </div>
      ) : (
        <div className="dialog-buttons">
          <button type="button" onClick={zu}>
            Abbrechen
          </button>
          <button type="button" className="primary" onClick={bestaetigen} aria-disabled={!ok || veraltet}>
            {ziel.modus === 'setzen' ? 'Übernehmen' : 'Bestätigen'}
          </button>
        </div>
      )}
    </Modal>
  );
}

/* ---------- Bestätigen beim Speichern (zweite Bestätigung) ---------- */

export type BestaetigenAntwort = 'bestaetigen' | 'ohne' | 'abbrechen';

interface Offen {
  festlegungen: string[];
  fakten: string[];
}

interface BestaetigenState {
  offen: Offen | null;
  antwort: ((a: BestaetigenAntwort) => void) | null;
}

const useBestaetigen = create<BestaetigenState>(() => ({ offen: null, antwort: null }));

/** Festlegungen und bestätigte Hinweise vor dem Speichern noch einmal bestätigen lassen; liefert die Antwort */
export function bestaetigenFragen(offen: Offen): Promise<BestaetigenAntwort> {
  return new Promise((resolve) =>
    useBestaetigen.setState({
      offen,
      antwort: (a) => {
        useBestaetigen.setState({ offen: null, antwort: null });
        resolve(a);
      },
    }),
  );
}

export function BestaetigenDialog({ titel, faktTitel, folgen }: { titel: (id: string) => { titel: string; automatisch?: Ampel; ampel?: Ampel; ueberholt?: string }; faktTitel: (id: string) => string; folgen: (id: string) => ReturnType<FolgenRechner> }) {
  const offen = useBestaetigen((s) => s.offen);
  const antwort = useBestaetigen((s) => s.antwort);
  const festlegungen = useBaurecht((s) => s.pruefung.festlegungen);
  const inDatei = useBaurecht((s) => s.pruefungDatei.festlegungen);
  const fakten = useBaurecht((s) => s.pruefung.fakten);
  const [geprueft, setGeprueft] = useState(false);
  useEffect(() => setGeprueft(false), [offen]);
  if (!offen || !antwort) return null;
  const anzahl = offen.festlegungen.length + offen.fakten.length;
  return (
    <Modal titel="Vor dem Speichern bestätigen" onClose={() => antwort('abbrechen')} breit klickDaneben={false}>
      <h3>Vor dem Speichern bestätigen</h3>
      <p>
        Seit dem letzten Speichern {anzahl === 1 ? 'ist eine Festlegung bzw. Bestätigung' : `sind ${anzahl} Festlegungen bzw. Bestätigungen`} neu, geändert oder aufgehoben. Bitte noch einmal prüfen – alles steht mit Begründung und Namen im Prüfprotokoll.
      </p>
      <ul className="br-bestaetigen-liste">
        {offen.festlegungen.map((id) => {
          const f = festlegungen[id];
          const alt = inDatei[id];
          const t = titel(id);
          if (f) {
            const herab = RANG[f.ampel] < RANG[f.automatisch];
            return (
              <li key={id} className={herab ? 'br-herab' : ''}>
                <div className="br-bestaetigen-kopf">
                  <strong>{t.titel}</strong>
                  <span className="br-bestaetigen-ampeln">
                    <AmpelMarke ampel={f.automatisch} klein /> <span aria-label="wird zu">→</span> <AmpelMarke ampel={f.ampel} klein />
                  </span>
                </div>
                <div className="br-leise-stark">
                  {f.von}: {f.grund}
                </div>
                {herab && <div className="br-warn-text">Herabstufung</div>}
                {t.ampel && t.ampel !== f.ampel && (
                  <div className="br-warn-text">
                    Wirksam bleibt „{AMPEL_TEXT[t.ampel]}“{t.ueberholt ? ` – ${t.ueberholt}` : ''}.
                  </div>
                )}
              </li>
            );
          }
          if (!alt) return null;
          // aufgehoben: es gilt wieder die automatische Ampel
          const jetzt = t.automatisch ?? alt.automatisch;
          const herab = RANG[jetzt] < RANG[alt.ampel];
          return (
            <li key={id} className={herab ? 'br-herab' : ''}>
              <div className="br-bestaetigen-kopf">
                <strong>{t.titel}</strong>
                <span className="br-bestaetigen-ampeln">
                  <AmpelMarke ampel={alt.ampel} klein /> <span aria-label="wird zu">→</span> <AmpelMarke ampel={jetzt} klein />
                </span>
              </div>
              <div className="br-leise-stark">Festlegung aufgehoben (bisher {alt.von}: {alt.grund}) – es gilt wieder die automatische Ampel.</div>
              {herab && <div className="br-warn-text">Herabstufung</div>}
            </li>
          );
        })}
        {offen.fakten.map((id) => {
          const f = fakten[id];
          if (!f?.bestaetigt) return null;
          const fo = folgen(id);
          return (
            <li key={id} className={fo.herab.length ? 'br-herab' : ''}>
              <div className="br-bestaetigen-kopf">
                <strong>{faktTitel(id)}</strong>
                <span className="br-marke">
                  {f.herkunft === 'manuell' ? 'von Hand' : 'Hinweis bestätigt'}: {wertText(f.wert)}
                </span>
              </div>
              <div className="br-leise-stark">
                {f.bestaetigt.von}: {f.bestaetigt.grund ?? '–'}
              </div>
              {fo.herab.length > 0 && <div className="br-warn-text">Herabstufung ({fo.herab.length})</div>}
              <Folgen folgen={fo} />
            </li>
          );
        })}
      </ul>
      <label className="toggle br-geprueft">
        <input type="checkbox" checked={geprueft} onChange={(e) => setGeprueft(e.target.checked)} /> Ich habe diese Angaben geprüft.
      </label>
      <div className="dialog-buttons">
        <button type="button" onClick={() => antwort('abbrechen')}>
          Abbrechen
        </button>
        <button type="button" onClick={() => antwort('ohne')} title="speichert alles andere mit dem bisherigen Stand dieser Angaben; sie bleiben als Entwurf offen">
          Ohne diese Angaben speichern
        </button>
        <button type="button" className="primary" disabled={!geprueft} onClick={() => antwort('bestaetigen')}>
          Bestätigen und speichern
        </button>
      </div>
    </Modal>
  );
}
