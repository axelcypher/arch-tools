import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEscSchliessen } from '@core/ui/Dialog';
import { druckenAls } from '@core/platform/projektDatei';
import { useAva } from '../store';

/**
 * Druckansicht (auch als PDF über den Druckdialog): liegt direkt unter `.app`, damit die gemeinsame Druckregel nur
 * sie druckt. `hoch`: A4 hochkant (Leistungsverzeichnis, Protokolle), sonst quer (Preisspiegel).
 */
export function Druck({ titel, zusatz, onClose, hoch = false, children, aktionen }: { titel: string; zusatz: string; onClose: () => void; hoch?: boolean; children: ReactNode; aktionen?: ReactNode }) {
  useEscSchliessen(onClose);
  const dialog = useRef<HTMLDivElement>(null);
  // Fokus in die Druckansicht, beim Schließen zurück an den Auslöser
  useEffect(() => {
    const vorher = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => vorher?.focus?.();
  }, []);
  const projekt = useAva((s) => s.projekt);
  const ziel = document.querySelector('.app') ?? document.body;
  const kopf = projekt ? `${projekt.meta.projektcode} ${projekt.name}` : '';
  return createPortal(
    <div className={`report-backdrop${hoch ? ' ava-druck-hoch' : ''}`} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="report ava-druck" role="dialog" aria-modal="true" aria-label={titel} tabIndex={-1} ref={dialog}>
        <div className="report-actions">
          {aktionen}
          <button className="primary" onClick={() => druckenAls({ projektName: kopf, zusatz })}>
            Drucken / PDF …
          </button>
          <button onClick={onClose}>Schließen</button>
        </div>
        {children}
      </div>
    </div>,
    ziel,
  );
}
