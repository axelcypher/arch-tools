import { useEffect, useRef, useState } from 'react';
import { unbekanntePlatzhalter } from '@core/platzhalter';
import { PlatzhalterChips, PlatzhalterHinweise, platzhalterEinfuegen } from '@core/ui/Platzhalter';
import type { Platzhalter } from '../nummer';

/**
 * Eingabe eines Namensschemas (P-06): Platzhalter-Chips wie in allen Apps (global und lokal unterscheidbar; ein Klick
 * setzt den Platzhalter an der Schreibmarke ein), Vorschau schon beim Tippen, sofortige Markierung unbekannter
 * Platzhalter und Hinweis auf alte Namen („Vorlage anpassen“). Übernommen wird – wie in den übrigen Feldern – beim
 * Verlassen des Feldes bzw. mit Enter (der Fokus bleibt dabei im Feld); Esc verwirft die Eingabe.
 */
export function SchemaFeld({
  value,
  onChange,
  platzhalter,
  vorschau,
  placeholder,
  label,
  kompakt,
}: {
  value: string;
  onChange: (v: string) => void;
  platzhalter: Platzhalter[];
  /** Vorschau zum Text, z. B. „Beispiel: 2026-014 EFH Musterweg“ */
  vorschau?: (text: string) => string;
  placeholder?: string;
  label: string;
  /** Chips nur, solange das Feld den Fokus hat (Listen mit vielen gleichen Feldern) */
  kompakt?: boolean;
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
    const { text: neu, marke } = platzhalterEinfuegen(text, p, el);
    setText(neu);
    uebernehmen(neu);
    // Schreibmarke hinter den eingefügten Platzhalter
    requestAnimationFrame?.(() => {
      el?.focus();
      el?.setSelectionRange(marke, marke);
    });
  };
  const fremd = unbekanntePlatzhalter(text, platzhalter);
  return (
    <div className={`po-schemafeld-block${kompakt ? ' kompakt' : ''}`}>
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
            // Enter übernimmt den Wert – der Fokus bleibt im Feld (sonst begänne das nächste Tab wieder oben)
            if (e.key === 'Enter') uebernehmen();
            if (e.key === 'Escape') {
              e.stopPropagation();
              textRef.current = value;
              setText(value);
            }
          }}
        />
      </span>
      {vorschau && <span className="field-hint po-vorschau">{vorschau(text)}</span>}
      <PlatzhalterHinweise
        vorlage={text}
        variablen={platzhalter}
        onAnpassen={(neu) => {
          setText(neu);
          uebernehmen(neu);
        }}
      />
      <PlatzhalterChips variablen={platzhalter} onEinfuegen={einfuegen} label={label} />
    </div>
  );
}
