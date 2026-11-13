import { useEffect, useRef, useState } from 'react';
import { alsZahl } from '@core/dokumente/xlsx';

/** Zahl deutsch anzeigen */
export const zahlDE = (n: number | null | undefined, stellen?: number) =>
  n === null || n === undefined || !Number.isFinite(n) ? '' : n.toLocaleString('de-DE', stellen === undefined ? { maximumFractionDigits: 4 } : { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

/**
 * Zahlenfeld mit deutscher Schreibweise („1.234,5“). Übernommen wird beim Verlassen oder mit Enter; eine
 * ungültige Eingabe bleibt rot stehen, statt still verworfen zu werden.
 */
export function ZahlEingabe({
  wert,
  onChange,
  stellen,
  leerErlaubt = true,
  className = '',
  title,
  placeholder,
  autoFocus,
  onEnter,
  label,
}: {
  wert: number | null | undefined;
  onChange: (n: number | null) => void;
  stellen?: number;
  leerErlaubt?: boolean;
  className?: string;
  title?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  /** Beschriftung für Screenreader (aria-label), wo kein sichtbares Label steht */
  label?: string;
}) {
  const [text, setText] = useState(zahlDE(wert, stellen));
  const [fehler, setFehler] = useState(false);
  const fokus = useRef(false);
  useEffect(() => {
    if (!fokus.current) setText(zahlDE(wert, stellen));
  }, [wert, stellen]);
  const uebernehmen = () => {
    // unverändert angezeigter Wert: nichts übernehmen (sonst würde ein gerundet angezeigter Wert still gekürzt)
    if (text === zahlDE(wert, stellen)) {
      setFehler(false);
      return;
    }
    const t = text.trim().replace(/\s*(€|%|m²|m³|m)$/, '');
    if (!t) {
      if (leerErlaubt) {
        setFehler(false);
        if (wert !== null && wert !== undefined) onChange(null);
      } else setFehler(true);
      return;
    }
    const n = alsZahl(t);
    if (n === null) {
      setFehler(true);
      return;
    }
    setFehler(false);
    if (n !== wert) onChange(n);
    setText(zahlDE(n, stellen));
  };
  return (
    <input
      className={`num ${className}${fehler ? ' ava-fehler' : ''}`}
      value={text}
      title={fehler ? 'Keine gültige Zahl – z. B. „1.234,56“' : title}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={label}
      inputMode="decimal"
      onFocus={(e) => {
        fokus.current = true;
        e.target.select();
      }}
      onBlur={() => {
        fokus.current = false;
        uebernehmen();
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          uebernehmen();
          onEnter?.();
        } else if (e.key === 'Escape') {
          setText(zahlDE(wert, stellen));
          setFehler(false);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** Textfeld, das beim Verlassen übernimmt (ein Schritt im Verlauf statt einer je Buchstabe) */
export function TextEingabe({
  wert,
  onChange,
  className = '',
  placeholder,
  title,
  mehrzeilig = false,
  zeilen = 3,
  liste,
  autoFocus,
  label,
}: {
  wert: string | undefined;
  onChange: (s: string) => void;
  className?: string;
  placeholder?: string;
  title?: string;
  mehrzeilig?: boolean;
  zeilen?: number;
  liste?: string;
  autoFocus?: boolean;
  /** Beschriftung für Screenreader (aria-label) */
  label?: string;
}) {
  const [text, setText] = useState(wert ?? '');
  const fokus = useRef(false);
  useEffect(() => {
    if (!fokus.current) setText(wert ?? '');
  }, [wert]);
  const props = {
    className,
    value: text,
    placeholder,
    title,
    autoFocus,
    'aria-label': label,
    onFocus: () => {
      fokus.current = true;
    },
    onBlur: () => {
      fokus.current = false;
      if (text !== (wert ?? '')) onChange(text);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(e.target.value),
  };
  if (mehrzeilig) return <textarea {...props} rows={zeilen} />;
  return (
    <input
      {...props}
      list={liste}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(wert ?? '');
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** Datum (JJJJ-MM-TT) */
export function DatumEingabe({ wert, onChange, title, label }: { wert: string | undefined; onChange: (s: string | undefined) => void; title?: string; label?: string }) {
  return <input type="date" value={wert?.slice(0, 10) ?? ''} title={title} aria-label={label ?? title} onChange={(e) => onChange(e.target.value || undefined)} />;
}

/** Beschriftetes Feld */
export function Feld({ label, children, hinweis, breit }: { label: string; children: React.ReactNode; hinweis?: string; breit?: boolean }) {
  return (
    <label className={`ava-feld${breit ? ' ava-feld-breit' : ''}`}>
      <span className="ava-feld-label">{label}</span>
      {children}
      {hinweis && <span className="ava-feld-hinweis">{hinweis}</span>}
    </label>
  );
}

export const datumKurz = (iso: string | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
