import { useEffect, useRef, useState } from 'react';

export interface MenuePunkt {
  text: string;
  title?: string;
  aktion: () => void;
  deaktiviert?: boolean;
}

/**
 * Knopf mit aufklappendem Menü (z. B. „LV ▾“). Tastatur: Enter/Leertaste/↓ öffnet, ↑/↓ wählt, Enter führt aus,
 * Esc schließt und gibt den Fokus an den Knopf zurück; ein Klick daneben schließt.
 */
export function MenueKnopf({ text, title, punkte, className = '', rechts = false }: { text: string; title?: string; punkte: MenuePunkt[]; className?: string; rechts?: boolean }) {
  const [offen, setOffen] = useState(false);
  const knopf = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!offen) return;
    liste.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const weg = (e: PointerEvent) => {
      const z = e.target as Node;
      if (!liste.current?.contains(z) && !knopf.current?.contains(z)) setOffen(false);
    };
    window.addEventListener('pointerdown', weg, true);
    return () => window.removeEventListener('pointerdown', weg, true);
  }, [offen]);

  const schliessen = () => {
    setOffen(false);
    knopf.current?.focus();
  };

  const tasten = (e: React.KeyboardEvent) => {
    const knoepfe = Array.from(liste.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const i = knoepfe.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      schliessen();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = knoepfe.length ? (i + (e.key === 'ArrowDown' ? 1 : -1) + knoepfe.length) % knoepfe.length : -1;
      knoepfe[n]?.focus();
    } else if (e.key === 'Tab') setOffen(false);
  };

  return (
    <span className="ava-menue">
      <button
        ref={knopf}
        type="button"
        className={className}
        title={title}
        aria-haspopup="menu"
        aria-expanded={offen}
        onClick={() => setOffen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOffen(true);
          }
        }}
      >
        {text} <span aria-hidden="true">▾</span>
      </button>
      {offen && (
        <div ref={liste} className={`ava-menue-liste${rechts ? ' ava-menue-rechts' : ''}`} role="menu" aria-label={text} onKeyDown={tasten}>
          {punkte.map((p) => (
            <button
              key={p.text}
              type="button"
              role="menuitem"
              title={p.title}
              disabled={p.deaktiviert}
              onClick={() => {
                setOffen(false);
                p.aktion();
              }}
            >
              {p.text}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
