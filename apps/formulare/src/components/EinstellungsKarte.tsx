import type { ReactNode } from 'react';

/** Karte in den Einstellungen: Überschrift (rechts daneben optional `kopf`), Erklärung, Inhalt */
export function Karte({ titel, text, children, kopf }: { titel: string; text?: ReactNode; children: ReactNode; kopf?: ReactNode }) {
  return (
    <section className="es-karte">
      <div className="es-karte-kopf">
        <h3>{titel}</h3>
        {kopf}
      </div>
      {text && <p className="muted small-text">{text}</p>}
      {children}
    </section>
  );
}
