import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

interface Frage {
  titel: string;
  text?: string;
  /** mit Eingabefeld (z. B. neuer Name) */
  wert?: string;
  ok: string;
  gefahr?: boolean;
  antwort: (a: string | null) => void;
}

const useFrage = create<{ frage: Frage | null; setzen: (f: Frage | null) => void }>((set) => ({ frage: null, setzen: (frage) => set({ frage }) }));

/** Rückfrage mit Eingabe; liefert den Text oder null bei Abbruch */
export function frageText(titel: string, wert: string, ok = 'OK', text?: string): Promise<string | null> {
  return new Promise((antwort) => useFrage.getState().setzen({ titel, text, wert, ok, antwort }));
}

/** Bestätigung; liefert true bei OK */
export async function bestaetigen(titel: string, text: string, ok = 'OK', gefahr = false): Promise<boolean> {
  return (await new Promise<string | null>((antwort) => useFrage.getState().setzen({ titel, text, ok, gefahr, antwort }))) !== null;
}

/** Stelle für Rückfragen – einmal in der App */
export function RueckfrageHost() {
  const frage = useFrage((s) => s.frage);
  const setzen = useFrage((s) => s.setzen);
  const [wert, setWert] = useState('');
  const feld = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!frage) return;
    setWert(frage.wert ?? '');
    requestAnimationFrame(() => {
      const el = feld.current;
      if (!el) return;
      el.focus();
      // Namen ohne Endung markieren
      const punkt = (frage.wert ?? '').lastIndexOf('.');
      el.setSelectionRange(0, punkt > 0 ? punkt : (frage.wert ?? '').length);
    });
  }, [frage]);
  if (!frage) return null;
  const ende = (a: string | null) => {
    setzen(null);
    frage.antwort(a);
  };
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && ende(null)}>
      <form
        className="modal rf"
        role="dialog"
        aria-label={frage.titel}
        onSubmit={(e) => {
          e.preventDefault();
          if (frage.wert === undefined || wert.trim()) ende(frage.wert === undefined ? '' : wert.trim());
        }}
        onKeyDown={(e) => e.key === 'Escape' && ende(null)}
      >
        <h3>{frage.titel}</h3>
        {frage.text && <p className="small-text">{frage.text}</p>}
        {frage.wert !== undefined && <input ref={feld} value={wert} onChange={(e) => setWert(e.target.value)} aria-label={frage.titel} spellCheck={false} />}
        <div className="dialog-buttons">
          <button type="button" onClick={() => ende(null)}>
            Abbrechen
          </button>
          <button type="submit" className={frage.gefahr ? 'danger' : 'primary'} autoFocus={frage.wert === undefined} disabled={frage.wert !== undefined && !wert.trim()}>
            {frage.ok}
          </button>
        </div>
      </form>
    </div>
  );
}
