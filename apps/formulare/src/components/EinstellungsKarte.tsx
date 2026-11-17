import { useId, type ReactNode } from 'react';

/**
 * Abschnitt der Seite „PERMIO“ im zentralen Einstellungsdialog: Überschrift (`h4`, docs/design.md „Einstellungen“),
 * Erklärung, Inhalt. `id` macht den Abschnitt als Sprungziel erreichbar (`einstellungenOeffnen('formulare', id)`).
 */
export function Karte({ titel, text, children, id }: { titel: string; text?: ReactNode; children: ReactNode; id?: string }) {
  const kopfId = useId();
  return (
    <section className="einst-gruppe es-gruppe" aria-labelledby={kopfId} id={id ? `permio-${id}` : undefined}>
      <h4 id={kopfId}>{titel}</h4>
      {text && <p className="muted small-text">{text}</p>}
      {children}
    </section>
  );
}
