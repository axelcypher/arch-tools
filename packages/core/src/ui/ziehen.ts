/**
 * Ziehen mit dem Zeiger – ohne das Drag & Drop des Browsers, das in den Tauri-Fenstern nicht überall geht (dort
 * übernimmt die Hülle das Ablegen von Dateien). Mit `schwelle` beginnt das Ziehen erst nach einigen Pixeln Bewegung:
 * Ein einfacher Klick bleibt ein Klick, und nach dem Ziehen wird der folgende Klick verschluckt. Esc bricht ab.
 */

export interface ZiehenOptionen {
  /** Bewegung in Pixeln, ab der gezogen wird (0 = sofort) */
  schwelle?: number;
  /** Ziehen beginnt (nach der Schwelle) */
  beginn?: (ev: PointerEvent) => void;
  /** Zeiger bewegt sich während des Ziehens */
  bewegen: (ev: PointerEvent) => void;
  /** Ende: `gezogen` = es wurde wirklich gezogen und nicht abgebrochen */
  ende: (gezogen: boolean, ev: PointerEvent | null) => void;
}

/** Ziehen ab einem pointerdown starten; liefert eine Funktion zum Abbrechen */
export function zeigerZiehen(start: { clientX: number; clientY: number; button?: number }, o: ZiehenOptionen): () => void {
  if (start.button !== undefined && start.button !== 0) return () => undefined;
  const schwelle = o.schwelle ?? 4;
  let zieht = schwelle === 0;
  let fertig = false;
  const x0 = start.clientX;
  const y0 = start.clientY;

  const aufraeumen = () => {
    window.removeEventListener('pointermove', bewegen);
    window.removeEventListener('pointerup', hoch);
    window.removeEventListener('pointercancel', abbrechen);
    window.removeEventListener('keydown', taste, true);
    document.documentElement.classList.remove('zieht');
  };
  const beenden = (gezogen: boolean, ev: PointerEvent | null) => {
    if (fertig) return;
    fertig = true;
    aufraeumen();
    if (zieht) {
      // den Klick nach dem Loslassen nicht an das Element weitergeben, auf dem das Ziehen begann
      const schlucken = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
      };
      window.addEventListener('click', schlucken, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', schlucken, { capture: true }), 0);
    }
    o.ende(gezogen && zieht, ev);
  };
  const bewegen = (ev: PointerEvent) => {
    if (!zieht) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < schwelle) return;
      zieht = true;
      document.documentElement.classList.add('zieht');
      o.beginn?.(ev);
    }
    o.bewegen(ev);
  };
  const hoch = (ev: PointerEvent) => beenden(true, ev);
  const abbrechen = () => beenden(false, null);
  const taste = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !zieht) return;
    ev.stopPropagation();
    ev.preventDefault();
    abbrechen();
  };

  window.addEventListener('pointermove', bewegen);
  window.addEventListener('pointerup', hoch);
  window.addEventListener('pointercancel', abbrechen);
  window.addEventListener('keydown', taste, true);
  if (zieht) {
    document.documentElement.classList.add('zieht');
  }
  return abbrechen;
}

/**
 * Einfügestelle in einer Liste für eine Zeigerhöhe: wie viele der übrigen Zeilen (ohne die gezogene `ohne`) liegen mit
 * ihrer Mitte oberhalb von `y`. `zeilen` sind die Elemente in Listenreihenfolge.
 */
export function einfuegeStelle(zeilen: HTMLElement[], y: number, ohne = -1): number {
  let n = 0;
  zeilen.forEach((z, i) => {
    if (i === ohne) return;
    const r = z.getBoundingClientRect();
    if (y > r.top + r.height / 2) n++;
  });
  return n;
}
