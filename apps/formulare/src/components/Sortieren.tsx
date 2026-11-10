import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useRef, useState } from 'react';
import { Symbol } from './Symbol';

/**
 * Reihenfolge ändern: am Griff ziehen (Zeiger – unabhängig vom Drag & Drop des Browsers, das in der Desktop-App
 * nicht überall geht) oder den Griff wählen und mit ↑/↓ verschieben. Die Zeilen einer Liste tragen
 * `data-sortier-index`; während des Ziehens markiert `data-ziehen` die gezogene Zeile und die Einfügestelle.
 */
export function useSortieren(anzahl: number, onVerschieben: (von: number, nach: number) => void) {
  const [zug, setZug] = useState<{ von: number; nach: number } | null>(null);
  const liste = useRef<HTMLElement | null>(null);

  const zeilen = () => (liste.current ? [...liste.current.querySelectorAll<HTMLElement>('[data-sortier-index]')].filter((z) => z.closest('[data-sortier-liste]') === liste.current) : []);

  /** Einfügestelle (nach dem Herausnehmen gezählt) für die Zeigerhöhe */
  const stelle = (von: number, y: number) => {
    let n = 0;
    zeilen().forEach((z) => {
      const i = Number(z.dataset.sortierIndex);
      if (i === von) return;
      const r = z.getBoundingClientRect();
      if (y > r.top + r.height / 2) n++;
    });
    return n;
  };

  const griff = (i: number, titel: string) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      liste.current = e.currentTarget.closest<HTMLElement>('[data-sortier-liste]');
      let nach = i;
      setZug({ von: i, nach: i });
      const bewegen = (ev: PointerEvent) => {
        nach = stelle(i, ev.clientY);
        setZug({ von: i, nach });
      };
      const ende = () => {
        window.removeEventListener('pointermove', bewegen);
        window.removeEventListener('pointerup', ende);
        window.removeEventListener('pointercancel', abbrechen);
        setZug(null);
        if (nach !== i) onVerschieben(i, nach);
      };
      const abbrechen = () => {
        nach = i;
        ende();
      };
      window.addEventListener('pointermove', bewegen);
      window.addEventListener('pointerup', ende);
      window.addEventListener('pointercancel', abbrechen);
    },
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key === 'ArrowUp' && i > 0) {
        e.preventDefault();
        onVerschieben(i, i - 1);
      } else if (e.key === 'ArrowDown' && i < anzahl - 1) {
        e.preventDefault();
        onVerschieben(i, i + 1);
      }
    },
    'aria-label': `${titel} verschieben`,
    title: 'Ziehen, um die Reihenfolge zu ändern – oder wählen und ↑/↓',
  });

  /** Eigenschaften einer Zeile: Index und Markierung beim Ziehen */
  const zeile = (i: number) => {
    let ziehen: string | undefined;
    if (zug) {
      // Position der Zeile unter den übrigen (ohne die gezogene)
      const rang = i < zug.von ? i : i - 1;
      if (i === zug.von) ziehen = 'quelle';
      else if (rang === zug.nach && zug.nach !== zug.von) ziehen = 'davor';
      else if (rang === zug.nach - 1 && zug.nach === anzahl - 1 && zug.nach !== zug.von) ziehen = 'danach';
    }
    return { 'data-sortier-index': i, 'data-ziehen': ziehen };
  };

  return { griff, zeile, zieht: !!zug };
}

/** Der Griff zum Ziehen */
export function Griff(props: ReturnType<ReturnType<typeof useSortieren>['griff']>) {
  return (
    <button type="button" className="sort-griff" {...props}>
      <Symbol name="griff" />
    </button>
  );
}
