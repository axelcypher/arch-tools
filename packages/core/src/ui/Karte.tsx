import type { ReactNode } from 'react';

/**
 * Gemeinsames Layout-Muster (docs/design.md „Fläche und Karten“): Unter der Werkzeugleiste liegt eine ruhige Fläche;
 * Seitenleisten, Hauptbereich und Zeichenfläche stehen darauf als Karten mit 8 px Spalt. Jede Karte hat einen Kopf mit
 * Überschrift (15 px) und scrollt für sich – die Fläche selbst scrollt nie. Die Apps setzen nur noch zusammen:
 *
 *   <Flaeche>
 *     <Leiste …><Karte titel="Projekt">…</Karte></Leiste>
 *     <ZeichenKarte fuss={<>Hinweis · Koordinaten · Maßstab</>}>{zeichenflaeche}</ZeichenKarte>
 *     <FlaechenSpalte><Karte titel="Geschoss">…</Karte><Karte titel="Auswertung">…</Karte></FlaechenSpalte>
 *   </Flaeche>
 */

/** Hintergrundfläche unter der Werkzeugleiste: Karten nebeneinander mit Spalt */
export function Flaeche({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `flaeche ${className}` : 'flaeche'}>{children}</div>;
}

/** mehrere Karten untereinander in einer Spalte der Fläche (z. B. links „Grundlagen“ über „Mengen“) */
export function FlaechenSpalte({ children, className, breite }: { children: ReactNode; className?: string; breite?: number }) {
  return (
    <div className={className ? `flaechen-spalte ${className}` : 'flaechen-spalte'} style={breite ? { width: breite } : undefined}>
      {children}
    </div>
  );
}

export interface KarteProps {
  /** Überschrift im Kartenkopf (h2, 15 px); ohne Titel kein Kopf */
  titel?: ReactNode;
  /** Knöpfe rechts im Kopf (Hilfe „?“, Umschalter, „Hinzufügen“) */
  aktionen?: ReactNode;
  /** Fußzeile (Bedienhinweis, Summen); steht fest unter dem scrollenden Inhalt */
  fuss?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Name der Karte für Vorleseprogramme, wenn kein Titel sichtbar ist */
  ariaLabel?: string;
  /** Inhalt ohne Innenabstand (z. B. Tabellen bis an den Rand, Listen) */
  buendig?: boolean;
}

/** Karte: Kopf mit Überschrift und Aktionen, darunter der Inhalt, der in der Karte scrollt */
export function Karte({ titel, aktionen, fuss, children, className, ariaLabel, buendig }: KarteProps) {
  return (
    <section className={className ? `karte ${className}` : 'karte'} aria-label={titel ? undefined : ariaLabel}>
      {(titel || aktionen) && (
        <header className="karte-kopf">
          {titel && <h2>{titel}</h2>}
          {aktionen && <div className="karte-aktionen">{aktionen}</div>}
        </header>
      )}
      <div className={buendig ? 'karte-rumpf buendig' : 'karte-rumpf'}>{children}</div>
      {fuss && <footer className="karte-fuss">{fuss}</footer>}
    </section>
  );
}

/**
 * Zeichenflächen-Karte: die Zeichenfläche füllt die Karte (sie scrollt nicht, sie zoomt), darunter eine Fußzeile für
 * Bedienhinweis, Koordinaten und Maßstab – so verdeckt nichts den Plan. Der Plan selbst bleibt hell (`.canvas`).
 */
export function ZeichenKarte({ kopf, fuss, children, className, ariaLabel }: { kopf?: ReactNode; fuss?: ReactNode; children: ReactNode; className?: string; ariaLabel?: string }) {
  return (
    <section className={className ? `karte zeichen-karte ${className}` : 'karte zeichen-karte'} aria-label={ariaLabel}>
      {kopf && <header className="karte-kopf">{kopf}</header>}
      <div className="zeichen-flaeche">{children}</div>
      {fuss && <footer className="karte-fuss zeichen-fuss">{fuss}</footer>}
    </section>
  );
}
