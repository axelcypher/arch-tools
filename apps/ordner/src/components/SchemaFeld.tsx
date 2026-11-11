import { useEffect, useRef, useState } from 'react';
import type { Platzhalter } from '../nummer';

/**
 * Eingabe eines Namensschemas (P-06): Einfüge-Menü „Platzhalter ▾“ (setzt den Platzhalter an der Schreibmarke ein),
 * Vorschau schon beim Tippen und sofortige Markierung unbekannter Platzhalter. Übernommen wird – wie in den übrigen
 * Feldern – beim Verlassen des Feldes bzw. mit Enter; Esc verwirft die Eingabe.
 */
export function SchemaFeld({
  value,
  onChange,
  platzhalter,
  vorschau,
  unbekannt,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  platzhalter: Platzhalter[];
  /** Vorschau zum Text, z. B. „Beispiel: 2026-014 EFH Musterweg“ */
  vorschau?: (text: string) => string;
  /** unbekannte Platzhalter im Text */
  unbekannt?: (text: string) => string[];
  placeholder?: string;
  label: string;
}) {
  const [text, setText] = useState(value);
  const textRef = useRef(text);
  textRef.current = text;
  const feld = useRef<HTMLInputElement>(null);
  useEffect(() => setText(value), [value]);
  const uebernehmen = (t = textRef.current) => {
    if (t !== value) onChange(t);
  };
  const einfuegen = (p: string) => {
    const el = feld.current;
    const a = el?.selectionStart ?? text.length;
    const b = el?.selectionEnd ?? text.length;
    const neu = `${text.slice(0, a)}${p}${text.slice(b)}`;
    setText(neu);
    uebernehmen(neu);
    // Schreibmarke hinter den eingefügten Platzhalter
    requestAnimationFrame?.(() => {
      el?.focus();
      el?.setSelectionRange(a + p.length, a + p.length);
    });
  };
  const fremd = unbekannt?.(text) ?? [];
  return (
    <>
      <span className="po-schemafeld">
        <input
          ref={feld}
          value={text}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={fremd.length ? true : undefined}
          className={fremd.length ? 'feld-fehler' : undefined}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => uebernehmen()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              e.stopPropagation();
              textRef.current = value;
              setText(value);
            }
          }}
        />
        <select
          className="po-platzhalter"
          aria-label={`Platzhalter einfügen: ${label}`}
          title="Platzhalter an der Schreibmarke einfügen"
          value=""
          onChange={(e) => {
            if (e.target.value) einfuegen(e.target.value);
          }}
        >
          <option value="">Platzhalter ▾</option>
          {platzhalter.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} – {p.text}
            </option>
          ))}
        </select>
      </span>
      {vorschau && <span className="field-hint po-vorschau">{vorschau(text)}</span>}
      {fremd.length > 0 && <span className="feld-meldung">Unbekannt, bleibt so im Namen stehen: {fremd.join(', ')}</span>}
    </>
  );
}
