import { useId } from 'react';
import type { ReactNode } from 'react';

/**
 * Gemeinsames Layout-Muster (docs/design.md „Fläche und Karten“): Unter der Werkzeugleiste liegt eine ruhige Fläche;
 * Seitenleisten, Hauptbereich und Zeichenfläche stehen darauf als Karten mit 8 px Spalt. Jede Karte hat einen Kopf mit
 * Überschrift (h2, 15 px) und scrollt für sich – die Fläche selbst scrollt nie. Die Apps setzen nur noch zusammen:
 *
 *   <Flaeche>
 *     <BreitenLeiste …><Karte titel="Projekt">…</Karte></BreitenLeiste>
 *     <ZeichenKarte titel="Grundriss" fuss={<>Hinweis · Koordinaten · Maßstab</>}>{zeichenflaeche}</ZeichenKarte>
 *     <FlaechenSpalte><Karte titel="Geschoss">…</Karte><Karte titel="Auswertung">…</Karte></FlaechenSpalte>
 *   </Flaeche>
 */

/** Hintergrundfläche unter der Werkzeugleiste: Karten nebeneinander mit Spalt */
export function Flaeche({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `flaeche ${className}` : 'flaeche'}>{children}</div>;
}

/** mehrere Karten untereinander in einer Spalte der Fläche (z. B. links „Grundlagen“ über „Mengen“); `wachsend`: nimmt die Restbreite */
export function FlaechenSpalte({ children, className, breite, wachsend }: { children: ReactNode; className?: string; breite?: number; wachsend?: boolean }) {
  const klasse = ['flaechen-spalte', wachsend && 'wachsend', className].filter(Boolean).join(' ');
  return (
    <div className={klasse} style={breite ? { width: breite } : undefined}>
      {children}
    </div>
  );
}

interface KopfProps {
  /** Überschrift im Kartenkopf (h2, `--fs-l`); benennt die Karte für Vorleseprogramme */
  titel?: ReactNode;
  /** Knöpfe rechts im Kopf (Hilfe „?“, Umschalter, „Hinzufügen“) */
  aktionen?: ReactNode;
  /** Name der Karte, wenn kein Titel sichtbar ist */
  ariaLabel?: string;
}

/** Kopf einer Karte – für `Karte` und `ZeichenKarte` gleich; liefert die Attribute, die die Karte benennen */
function useKopf({ titel, aktionen, ariaLabel }: KopfProps) {
  const id = useId();
  const kopf =
    titel != null || aktionen != null ? (
      <header className="karte-kopf">
        {titel != null && <h2 id={id}>{titel}</h2>}
        {aktionen != null && <div className="karte-aktionen">{aktionen}</div>}
      </header>
    ) : null;
  // mit Titel benennt das h2 den Bereich (Landmark), sonst ariaLabel
  const name = titel != null ? { 'aria-labelledby': id } : ariaLabel ? { 'aria-label': ariaLabel } : {};
  return { kopf, name };
}

export interface KarteProps extends KopfProps {
  /** Fußzeile (Summen, Hinweis); steht fest unter dem scrollenden Inhalt */
  fuss?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Inhalt ohne Innenabstand (Tabellen und Listen bis an den Rand); Fokusrahmen liegen dann innen */
  buendig?: boolean;
  /**
   * Höhe in einer `FlaechenSpalte`: Vorgabe teilen sich die Karten die Höhe; `'inhalt'` macht die Karte so hoch wie
   * ihren Inhalt (höchstens die halbe Spalte, darüber scrollt sie) – für kurze Karten unter einer langen
   */
  hoehe?: 'teilen' | 'inhalt';
}

/** Karte: Kopf mit Überschrift und Aktionen, darunter der Inhalt, der in der Karte scrollt */
export function Karte({ titel, aktionen, ariaLabel, fuss, children, className, buendig, hoehe = 'teilen' }: KarteProps) {
  const { kopf, name } = useKopf({ titel, aktionen, ariaLabel });
  const klasse = ['karte', hoehe === 'inhalt' && 'karte-inhalt', className].filter(Boolean).join(' ');
  return (
    <section className={klasse} {...name}>
      {kopf}
      <div className={buendig ? 'karte-rumpf buendig' : 'karte-rumpf'}>{children}</div>
      {fuss != null && <footer className="karte-fuss">{fuss}</footer>}
    </section>
  );
}

/**
 * Zeichenflächen-Karte: die Zeichenfläche füllt die Karte (sie scrollt nicht, sie zoomt), darunter eine Fußzeile für
 * Bedienhinweis, Koordinaten und Maßstab – so verdeckt nichts den Plan. Der Plan selbst bleibt hell (`.canvas`).
 * Kopf wie bei `Karte` (meist ohne: die Werkzeuge stehen in der Werkzeugleiste).
 */
export function ZeichenKarte({ titel, aktionen, ariaLabel, fuss, children, className }: KopfProps & { fuss?: ReactNode; children: ReactNode; className?: string }) {
  const { kopf, name } = useKopf({ titel, aktionen, ariaLabel });
  return (
    <section className={className ? `karte zeichen-karte ${className}` : 'karte zeichen-karte'} {...name}>
      {kopf}
      <div className="zeichen-flaeche">{children}</div>
      {fuss != null && <footer className="karte-fuss zeichen-fuss">{fuss}</footer>}
    </section>
  );
}
