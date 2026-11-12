import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { Ampel, ParagrafErgebnis } from '@core/baurecht/typen';
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

/** Ampel von Hand festlegen – Begründung Pflicht; beim Speichern wird noch einmal bestätigt */
export function FestlegenDialog() {
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
    setAmpel(p.festlegung?.ampel ?? (p.automatisch === 'gelb' ? 'gruen' : p.automatisch));
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
    const fakten = useBaurecht.getState().pruefung.fakten;
    const werte: Record<string, string | number | boolean | null> = {};
    for (const v of p.verwendet) werte[v] = v.startsWith('merkmal:') ? (merkmale[v.slice(8)] ?? null) : (fakten[v]?.wert ?? null);
    benutzerMerken(von);
    useBaurecht.getState().festlegen(p, ampel, grund, von.trim(), summen, werte);
    schliessen();
  };
  return (
    <Modal titel={`§ ${p.paragraf} von Hand festlegen`} onClose={schliessen} breit klickDaneben={false}>
      <h3>
        § {p.paragraf} {p.titel} – von Hand festlegen
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

/* ---------- Bestätigen beim Speichern (zweite Bestätigung) ---------- */

export type BestaetigenAntwort = 'bestaetigen' | 'ohne' | 'abbrechen';

interface BestaetigenState {
  ids: string[] | null;
  antwort: ((a: BestaetigenAntwort) => void) | null;
}

const useBestaetigen = create<BestaetigenState>(() => ({ ids: null, antwort: null }));

/** Festlegungen vor dem Speichern bestätigen lassen; liefert die Antwort */
export function festlegungenBestaetigenFragen(ids: string[]): Promise<BestaetigenAntwort> {
  return new Promise((resolve) =>
    useBestaetigen.setState({
      ids,
      antwort: (a) => {
        useBestaetigen.setState({ ids: null, antwort: null });
        resolve(a);
      },
    }),
  );
}

export function BestaetigenDialog({ titel }: { titel: (id: string) => { titel: string; automatisch?: Ampel } }) {
  const ids = useBestaetigen((s) => s.ids);
  const antwort = useBestaetigen((s) => s.antwort);
  const festlegungen = useBaurecht((s) => s.pruefung.festlegungen);
  const [geprueft, setGeprueft] = useState(false);
  useEffect(() => setGeprueft(false), [ids]);
  if (!ids || !antwort) return null;
  const herab = ids.filter((id) => festlegungen[id] && RANG[festlegungen[id].ampel] < RANG[festlegungen[id].automatisch]);
  return (
    <Modal titel="Festlegungen von Hand bestätigen" onClose={() => antwort('abbrechen')} breit klickDaneben={false}>
      <h3>Festlegungen von Hand bestätigen</h3>
      <p>
        Seit dem letzten Speichern {ids.length === 1 ? 'ist eine Festlegung' : `sind ${ids.length} Festlegungen`} neu oder geändert. Bitte noch einmal prüfen – sie stehen mit Begründung und Namen im Protokoll.
      </p>
      <ul className="br-bestaetigen-liste">
        {ids.map((id) => {
          const f = festlegungen[id];
          if (!f) return null;
          const t = titel(id);
          return (
            <li key={id} className={herab.includes(id) ? 'br-herab' : ''}>
              <div className="br-bestaetigen-kopf">
                <strong>{t.titel}</strong>
                <span className="br-bestaetigen-ampeln">
                  <AmpelMarke ampel={f.automatisch} klein /> <span aria-label="wird zu">→</span> <AmpelMarke ampel={f.ampel} klein />
                </span>
              </div>
              <div className="br-leise">
                {f.von}: {f.grund}
              </div>
              {herab.includes(id) && <div className="br-warn-text">Herabstufung</div>}
            </li>
          );
        })}
      </ul>
      <label className="toggle br-geprueft">
        <input type="checkbox" checked={geprueft} onChange={(e) => setGeprueft(e.target.checked)} /> Ich habe die Festlegungen geprüft.
      </label>
      <div className="dialog-buttons">
        <button type="button" onClick={() => antwort('abbrechen')}>
          Abbrechen
        </button>
        <button type="button" onClick={() => antwort('ohne')} title="speichert alles andere; die Festlegungen bleiben als Entwurf offen">
          Ohne diese Festlegungen speichern
        </button>
        <button type="button" className="primary" disabled={!geprueft} onClick={() => antwort('bestaetigen')}>
          Festlegungen bestätigen und speichern
        </button>
      </div>
    </Modal>
  );
}
