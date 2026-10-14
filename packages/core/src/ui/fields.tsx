import { useEffect, useRef, useState } from 'react';
import { fmt2, parseNum } from '../format';

/**
 * Gemeinsames Verhalten der Eingabefelder, die erst bei Enter/Fokusverlust übernehmen:
 *  - Ein Klick irgendwo anders (Zeichenfläche, Liste, anderes Element) übernimmt die Eingabe, *bevor*
 *    dieser Klick verarbeitet wird – sonst landete die Änderung nach einem Auswahlwechsel bei der
 *    neu gewählten Fläche (Klicks auf die Zeichenfläche nehmen den Fokus nicht weg).
 *  - Wird das Feld entfernt (Auswahl gewechselt, Dialog geschlossen), wird eine offene Eingabe noch
 *    an das bisherige Ziel übergeben.
 */
function usePendingCommit(commit: () => void) {
  const ref = useRef<HTMLInputElement>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const editing = useRef(false);

  useEffect(() => {
    const onDown = (e: Event) => {
      const el = ref.current;
      if (!el || !editing.current || document.activeElement !== el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      el.blur();
    };
    // Erfassungsphase am Dokument: läuft vor allen Handlern der Anwendung
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('mousedown', onDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('mousedown', onDown, true);
      if (editing.current) commitRef.current();
    };
  }, []);

  return {
    ref,
    onFocus: () => {
      editing.current = true;
    },
    done: () => {
      editing.current = false;
    },
  };
}

/**
 * Zahleneingabe mit Dezimalkomma. Übernimmt den Wert bei Enter oder Fokusverlust,
 * damit nicht jeder Tastendruck einen Undo-Schritt erzeugt.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  digits = 2,
  placeholder,
  allowEmpty = false,
  title,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  digits?: number;
  placeholder?: string;
  allowEmpty?: boolean;
  title?: string;
}) {
  const format = (v: number | undefined) => (v === undefined ? '' : digits === 2 ? fmt2(v).replace(/\./g, '') : v.toFixed(digits).replace('.', ','));
  const [text, setText] = useState(format(value));
  const textRef = useRef(text);
  textRef.current = text;
  useEffect(() => setText(format(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    pending.done();
    const text = textRef.current;
    const v = parseNum(text);
    if (v === null) {
      if (allowEmpty && text.trim() === '') {
        if (value !== undefined) onChange(undefined);
      } else setText(format(value));
      return;
    }
    let c = v;
    if (min !== undefined) c = Math.max(min, c);
    if (max !== undefined) c = Math.min(max, c);
    if (c !== value) onChange(c);
    setText(format(c));
  };
  const pending = usePendingCommit(commit);

  return (
    <input
      ref={pending.ref}
      className="num"
      value={text}
      onFocus={pending.onFocus}
      placeholder={placeholder}
      title={title}
      inputMode="decimal"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          textRef.current = format(value);
          setText(textRef.current);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** Texteingabe, die erst bei Enter/Fokusverlust übernimmt. */
export function TextField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  const textRef = useRef(text);
  textRef.current = text;
  useEffect(() => setText(value), [value]);
  const commit = () => {
    pending.done();
    if (textRef.current !== value) onChange(textRef.current);
  };
  const pending = usePendingCommit(commit);
  return (
    <input
      ref={pending.ref}
      value={text}
      placeholder={placeholder}
      onFocus={pending.onFocus}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          textRef.current = value;
          setText(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
