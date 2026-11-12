import { useEffect, useRef, useState } from 'react';
import { paragrafName } from '@core/baurecht/typen';
import { create } from 'zustand';
import type { Ampel, FaktWert, ParagrafErgebnis } from '@core/baurecht/typen';
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
  const feld = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!p) return;
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
  const festlegen = () => {
    setVersucht(true);
    if (!ok) return;
    const fassung = texte[`${p.modul}/${p.norm}`]?.fassung;
    const summen: Record<string, string> = {};
    for (const f of p.fundstellen) if (fassung?.summen[f]) summen[f] = fassung.summen[f];
    const werte: Record<string, string | number | boolean | null> = {};
    for (const v of p.verwendet) werte[v] = v.startsWith('merkmal:') ? (merkmale[v.slice(8)] ?? null) : (fakten[v]?.wert ?? null);
    benutzerMerken(von);
    useBaurecht.getState().festlegen(p, ampel, grund, von.trim(), summen, werte);
    schliessen();
  };
  return (
    <Modal titel={`${paragrafName(p.paragraf)} von Hand festlegen`} onClose={schliessen} breit klickDaneben={false}>
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
      {herab && (
        <div className="br-meldung br-meldung-warn" role="alert">
          Sie stufen von „{AMPEL_TEXT[p.automatisch]}“ auf „{AMPEL_TEXT[ampel]}“ herab. Das ist erlaubt, wenn der Sonderfall begründet ist – die Festlegung steht im Protokoll und muss beim Speichern noch einmal bestätigt werden.
        </div>
      )}
      <label className="field">
        <span className="field-label">
          Begründung <span aria-hidden="true">*</span>
        </span>
        <textarea ref={feld} rows={4} value={grund} onChange={(e) => setGrund(e.target.value)} aria-required="true" aria-invalid={versucht && grund.trim().length < 10} placeholder="z. B. Begehung am 03.11.2026 ohne Befund, Bericht im Projektordner" />
        {versucht && grund.trim().length < 10 && <span className="field-hint br-fehler-text">Bitte begründen (mindestens 10 Zeichen) – die Begründung steht im Protokoll.</span>}
      </label>
      <label className="field">
        <span className="field-label">
          Festgelegt von <span aria-hidden="true">*</span>
        </span>
        <input value={von} onChange={(e) => setVon(e.target.value)} aria-required="true" />
      </label>
      <div className="dialog-buttons">
        <button type="button" onClick={schliessen}>
          Abbrechen
        </button>
        <button type="button" className="primary" onClick={festlegen} aria-disabled={!ok}>
          Festlegen
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Hinweis bestätigen (erste Bestätigung) ---------- */

interface FaktBestaetigenState {
  ziel: { id: string; titel: string; wert: FaktWert } | null;
}

const useFaktBestaetigen = create<FaktBestaetigenState>(() => ({ ziel: null }));
export const faktBestaetigenOeffnen = (id: string, titel: string, wert: FaktWert) => useFaktBestaetigen.setState({ ziel: { id, titel, wert } });

const wertText = (w: FaktWert['wert']) => (w === true ? 'ja' : w === false ? 'nein' : String(w));

/**
 * Einen Hinweis (z. B. „kein Treffer im Landschaftsschutzgebiet“) als gesichert übernehmen: nur mit Begründung
 * (worauf gestützt, z. B. Auskunft der Behörde mit Datum). Geodaten gelten danach nur für die aktuelle Lage; beim
 * Speichern wird die Bestätigung noch einmal abgefragt und steht im Protokoll.
 */
export function FaktBestaetigenDialog() {
  const ziel = useFaktBestaetigen((s) => s.ziel);
  const project = useBaurecht((s) => s.project);
  const [grund, setGrund] = useState('');
  const [von, setVon] = useState('');
  const [versucht, setVersucht] = useState(false);
  const feld = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!ziel) return;
    setGrund('');
    setVon(benutzer());
    setVersucht(false);
    setTimeout(() => feld.current?.focus(), 0);
  }, [ziel]);
  if (!ziel) return null;
  const schliessen = () => useFaktBestaetigen.setState({ ziel: null });
  const ok = grund.trim().length >= 10 && von.trim().length > 0;
  const bestaetigen = () => {
    setVersucht(true);
    if (!ok) return;
    const k = project?.meta.koordinaten;
    benutzerMerken(von);
    useBaurecht.getState().faktBestaetigen(ziel.id, ziel.wert, von.trim(), grund, k ? lageKennung(k.ost, k.nord) : null);
    schliessen();
  };
  return (
    <Modal titel="Angabe bestätigen" onClose={schliessen} breit klickDaneben={false}>
      <h3>
        {ziel.titel}: „{wertText(ziel.wert.wert)}“ bestätigen
      </h3>
      <p className="br-leise">
        Bisher nur Hinweis{ziel.wert.quelle ? ` (${ziel.wert.quelle})` : ''}: {ziel.wert.grund ?? 'nicht gesichert'}
      </p>
      <div className="br-meldung br-meldung-warn" role="note">
        Mit der Bestätigung gilt die Angabe als gesichert – Vorschriften, die nur an ihr hängen, können dadurch „entfällt“ werden. Bitte nur bestätigen, was belegt ist; die Begründung steht im Protokoll.
        {ziel.wert.herkunft === 'geodienst' ? ' Die Bestätigung gilt nur für die aktuelle Lage des Vorhabens.' : ''}
      </div>
      <label className="field">
        <span className="field-label">
          Worauf gestützt? <span aria-hidden="true">*</span>
        </span>
        <textarea ref={feld} rows={3} value={grund} onChange={(e) => setGrund(e.target.value)} aria-required="true" aria-invalid={versucht && grund.trim().length < 10} placeholder="z. B. Auskunft Untere Naturschutzbehörde vom 03.11.2026, Aktenzeichen …" />
        {versucht && grund.trim().length < 10 && <span className="field-hint br-fehler-text">Bitte angeben, worauf die Bestätigung beruht (mindestens 10 Zeichen).</span>}
      </label>
      <label className="field">
        <span className="field-label">
          Bestätigt von <span aria-hidden="true">*</span>
        </span>
        <input value={von} onChange={(e) => setVon(e.target.value)} aria-required="true" />
      </label>
      <div className="dialog-buttons">
        <button type="button" onClick={schliessen}>
          Abbrechen
        </button>
        <button type="button" className="primary" onClick={bestaetigen} aria-disabled={!ok}>
          Bestätigen
        </button>
      </div>
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

export function BestaetigenDialog({ titel, faktTitel }: { titel: (id: string) => { titel: string; automatisch?: Ampel }; faktTitel: (id: string) => string }) {
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
      <h3>Angaben von Hand bestätigen</h3>
      <p>
        Seit dem letzten Speichern {anzahl === 1 ? 'ist eine Angabe von Hand' : `sind ${anzahl} Angaben von Hand`} neu, geändert oder aufgehoben. Bitte noch einmal prüfen – alles steht mit Begründung und Namen im Protokoll.
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
                <div className="br-leise">
                  {f.von}: {f.grund}
                </div>
                {herab && <div className="br-warn-text">Herabstufung</div>}
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
              <div className="br-leise">Festlegung aufgehoben (bisher {alt.von}: {alt.grund}) – es gilt wieder die automatische Ampel.</div>
              {herab && <div className="br-warn-text">Herabstufung</div>}
            </li>
          );
        })}
        {offen.fakten.map((id) => {
          const f = fakten[id];
          if (!f?.bestaetigt) return null;
          return (
            <li key={id} className="br-herab">
              <div className="br-bestaetigen-kopf">
                <strong>{faktTitel(id)}</strong>
                <span className="br-marke">Hinweis bestätigt: {wertText(f.wert)}</span>
              </div>
              <div className="br-leise">
                {f.bestaetigt.von}: {f.bestaetigt.grund ?? '–'}
              </div>
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
