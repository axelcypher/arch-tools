import { createContext, useContext, useEffect, useId, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
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

/**
 * Fester Kopf der rollenden Spalte (`.rollend-kopf`), dessen Höhe vom Inhalt abhängt (Umbruch je nach Filter, Treffern,
 * Breite der Seitenkarten): misst ihn und setzt `--rollend-kopf-h` an der rollenden Spalte – Höhe des Kopfs plus `--s1`
 * (oben hebt `top: -s1` den Innenabstand auf, dazu Platz für den Fokusrahmen; einzeilig gleich der Vorgabe in base.css).
 * Ohne Kopf, ohne rollende Spalte oder ohne ResizeObserver bleibt die Vorgabe; beim Aushängen wird der Wert entfernt.
 */
export function useRollendKopf(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const kopf = ref.current;
    const spalte = kopf?.closest<HTMLElement>('.flaechen-spalte.rollend');
    if (!kopf || !spalte || typeof ResizeObserver === 'undefined') return;
    const setzen = () => spalte.style.setProperty('--rollend-kopf-h', `calc(${kopf.offsetHeight}px + var(--s1))`);
    const beobachter = new ResizeObserver(setzen);
    beobachter.observe(kopf);
    setzen();
    return () => {
      beobachter.disconnect();
      spalte.style.removeProperty('--rollend-kopf-h');
    };
  }, [ref]);
}

/** mehrere Karten untereinander in einer Spalte der Fläche (z. B. links „Grundlagen“ über „Mengen“); `wachsend`: nimmt die Restbreite */
export function FlaechenSpalte({
  children,
  className,
  breite,
  wachsend,
  rollend,
  als = 'div',
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  breite?: number;
  wachsend?: boolean;
  /**
   * die Spalte rollt als Ganzes, die Karten darin sind so hoch wie ihr Inhalt (z. B. die Abschnitte einer Felderansicht)
   * – statt sich die Höhe zu teilen und je für sich zu rollen
   */
  rollend?: boolean;
  /** Element der Spalte: `main` für den Hauptbereich der App (je Fenster nur eines), `aside` für eine Nebenspalte */
  als?: 'div' | 'main' | 'aside';
  /** Name der Spalte – Pflicht bei `als="aside"` (jede Nebenspalte braucht einen eigenen Namen); wirkt nur bei `main` und `aside` */
  ariaLabel?: string;
}) {
  const klasse = ['flaechen-spalte', wachsend && 'wachsend', rollend && 'rollend', className].filter(Boolean).join(' ');
  const Element = als;
  return (
    <Element className={klasse} style={breite ? { width: breite } : undefined} aria-label={als !== 'div' ? ariaLabel : undefined}>
      {children}
    </Element>
  );
}

interface KopfProps {
  /** Überschrift im Kartenkopf (h2, `--fs-l`); benennt die Karte für Vorleseprogramme */
  titel?: ReactNode;
  /** Hilfe direkt hinter der Überschrift (meist `HilfeKnopf`); gehört nicht zum Namen der Karte */
  hilfe?: ReactNode;
  /** Knöpfe rechts im Kopf (Umschalter, „Hinzufügen“) */
  aktionen?: ReactNode;
  /** Name der Karte, wenn kein Titel sichtbar ist (wirkt nicht bei `als="div"` – die Karte ist dann kein Bereich) */
  ariaLabel?: string;
  /**
   * Ebene der Überschrift: Vorgabe 2 (die Karte ist ein Bereich der Seite); 3 für viele gleichartige Karten unter einer
   * Seitenüberschrift (z. B. die Abschnitte einer Felderansicht) – zusammen mit `als="div"`
   */
  ebene?: 2 | 3;
}

/** Kopf einer Karte – für `Karte` und `ZeichenKarte` gleich; liefert die Attribute, die die Karte benennen */
function useKopf({ titel, hilfe, aktionen, ariaLabel, ebene = 2 }: KopfProps) {
  const id = useId();
  const Ueberschrift = ebene === 3 ? 'h3' : 'h2';
  const kopf =
    titel != null || hilfe != null || aktionen != null ? (
      <header className="karte-kopf">
        {(titel != null || hilfe != null) && (
          <div className="karte-titel">
            {titel != null && <Ueberschrift id={id}>{titel}</Ueberschrift>}
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
  /**
   * Werkzeugleiste der Karte (meist `Werkzeugleiste`): steht fest zwischen Kopf und Inhalt, scrollt nicht mit – für
   * Ansichten mit eigener Leiste, die zu breit für den Kopf ist; wechselt sie mit der Ansicht, braucht die
   * Werkzeugleiste einen eigenen `name`
   */
  leiste?: ReactNode;
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
   * Vorschau (Druckvorschau, PDF-Seiten, Blatt): Rumpf bündig auf dem Grund der Fläche (`--bg`), darauf liegt das Blatt
   * hell wie `.report`
   */
  vorschau?: boolean;
  /**
   * Höhe in einer `FlaechenSpalte`: Vorgabe teilen sich die Karten die Höhe; `'inhalt'` macht die Karte so hoch wie
   * ihren Inhalt (höchstens die halbe Spalte, darüber scrollt sie) – für kurze Karten unter einer langen
   */
  hoehe?: 'teilen' | 'inhalt';
  /**
   * Element der Karte: Vorgabe `section` (benannter Bereich), `main` für den Hauptbereich (je Fenster nur eines), `aside`
   * für Nebeninhalt (nur mit `titel` oder `ariaLabel`), `div` ohne eigenen Bereich – für viele gleichartige Karten, die
   * sonst Dutzende Regionen ergäben; die Überschrift gliedert sie
   */
  als?: 'section' | 'main' | 'aside' | 'div';
}

/** Karte: Kopf mit Überschrift und Aktionen, darunter der Inhalt, der in der Karte scrollt */
export function Karte({ titel, hilfe, aktionen, ariaLabel, ebene, leiste, fuss, children, className, buendig, abschnitte, vorschau, hoehe = 'teilen', als = 'section' }: KarteProps) {
  const { kopf, name } = useKopf({ titel, hilfe, aktionen, ariaLabel, ebene });
  const klasse = ['karte', hoehe === 'inhalt' && 'karte-inhalt', className].filter(Boolean).join(' ');
  const Element = als;
  return (
    <Element className={klasse} {...(als === 'div' ? {} : name)}>
      {kopf}
      {leiste != null && <div className="karte-leiste">{leiste}</div>}
      <div className={['karte-rumpf', (buendig || abschnitte || vorschau) && 'buendig', abschnitte && 'abschnitte', vorschau && 'vorschau'].filter(Boolean).join(' ')}>{children}</div>
      {fuss != null && <footer className="karte-fuss">{fuss}</footer>}
    </Element>
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
}: Omit<KopfProps, 'ebene'> & { fuss?: ReactNode; children: ReactNode; className?: string; als?: 'section' | 'main' }) {
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
