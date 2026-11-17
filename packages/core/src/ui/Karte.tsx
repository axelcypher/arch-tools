import { createContext, useContext, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
  /** Hilfe direkt hinter der Überschrift (meist `HilfeKnopf`); gehört nicht zum Namen der Karte */
  hilfe?: ReactNode;
  /** Knöpfe rechts im Kopf (Umschalter, „Hinzufügen“) */
  aktionen?: ReactNode;
  /** Name der Karte, wenn kein Titel sichtbar ist */
  ariaLabel?: string;
}

/** Kopf einer Karte – für `Karte` und `ZeichenKarte` gleich; liefert die Attribute, die die Karte benennen */
function useKopf({ titel, hilfe, aktionen, ariaLabel }: KopfProps) {
  const id = useId();
  const kopf =
    titel != null || hilfe != null || aktionen != null ? (
      <header className="karte-kopf">
        {(titel != null || hilfe != null) && (
          <div className="karte-titel">
            {titel != null && <h2 id={id}>{titel}</h2>}
            {hilfe}
          </div>
        )}
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
   * Inhalt aus mehreren Abschnitten (`<section>` direkt im Rumpf, je mit `h2`): Trennlinien bis an den Rand, Abstände
   * je Abschnitt – für Karten ohne Kopf, die mehrere Themen bündeln (z. B. Projekt, Geschosse, Flächen); ohne Kopf
   * braucht die Karte `ariaLabel`
   */
  abschnitte?: boolean;
  /**
   * Höhe in einer `FlaechenSpalte`: Vorgabe teilen sich die Karten die Höhe; `'inhalt'` macht die Karte so hoch wie
   * ihren Inhalt (höchstens die halbe Spalte, darüber scrollt sie) – für kurze Karten unter einer langen
   */
  hoehe?: 'teilen' | 'inhalt';
}

/** Karte: Kopf mit Überschrift und Aktionen, darunter der Inhalt, der in der Karte scrollt */
export function Karte({ titel, hilfe, aktionen, ariaLabel, fuss, children, className, buendig, abschnitte, hoehe = 'teilen' }: KarteProps) {
  const { kopf, name } = useKopf({ titel, hilfe, aktionen, ariaLabel });
  const klasse = ['karte', hoehe === 'inhalt' && 'karte-inhalt', className].filter(Boolean).join(' ');
  return (
    <section className={klasse} {...name}>
      {kopf}
      <div className={['karte-rumpf', (buendig || abschnitte) && 'buendig', abschnitte && 'abschnitte'].filter(Boolean).join(' ')}>{children}</div>
      {fuss != null && <footer className="karte-fuss">{fuss}</footer>}
    </section>
  );
}

/** Ziel für Inhalte der Fußzeile, die tief in der Zeichenkomponente entstehen (ZeichenFussInhalt) */
const ZeichenFussZiel = createContext<HTMLElement | null>(null);

/**
 * Zeichenflächen-Karte: die Zeichenfläche füllt die Karte (sie scrollt nicht, sie zoomt), darunter eine Fußzeile für
 * Bedienhinweis, Koordinaten und Maßstab – so verdeckt nichts den Plan. Der Plan selbst bleibt hell (`.canvas`).
 * Kopf wie bei `Karte` (meist ohne: die Werkzeuge stehen in der Werkzeugleiste). Die Fußzeile füllt sich aus `fuss`
 * und aus `ZeichenFussInhalt` irgendwo in der Zeichenfläche; leer bleibt sie unsichtbar. `als="main"`, wenn die
 * Zeichenfläche der Hauptbereich der App ist.
 */
export function ZeichenKarte({
  titel,
  hilfe,
  aktionen,
  ariaLabel,
  fuss,
  children,
  className,
  als = 'section',
}: KopfProps & { fuss?: ReactNode; children: ReactNode; className?: string; als?: 'section' | 'main' }) {
  const { kopf, name } = useKopf({ titel, hilfe, aktionen, ariaLabel });
  const [ziel, setZiel] = useState<HTMLElement | null>(null);
  const Element = als;
  return (
    <Element className={className ? `karte zeichen-karte ${className}` : 'karte zeichen-karte'} {...name}>
      {kopf}
      <ZeichenFussZiel.Provider value={ziel}>
        <div className="zeichen-flaeche">{children}</div>
      </ZeichenFussZiel.Provider>
      <footer className="karte-fuss zeichen-fuss" ref={setZiel}>
        {fuss}
      </footer>
    </Element>
  );
}

/**
 * Inhalt für die Fußzeile der umgebenden ZeichenKarte (Bedienhinweis, Koordinaten, Maßstab aus der Zeichenkomponente).
 * Dauerhaft eingehängt lassen (sonst springt die Höhe der Zeichenfläche); mehrere Einhängungen stehen in der
 * Reihenfolge des Einhängens, deshalb je Karte möglichst nur eine.
 */
export function ZeichenFussInhalt({ children }: { children: ReactNode }) {
  const ziel = useContext(ZeichenFussZiel);
  return ziel ? createPortal(children, ziel) : null;
}
