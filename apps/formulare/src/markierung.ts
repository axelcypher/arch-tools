/**
 * Hervorhebung im Formular, gesteuert aus der Gliederung: Zeigt man auf einen Eintrag, werden seine Felder im
 * Formular farbig markiert; verweilt man im Anpassen-Modus länger darauf, wird der Bereich zusätzlich umrandet
 * und ins Bild geholt. Reiner Anzeigezustand – eigener kleiner Store, damit Tastendrücke im Formular davon
 * unberührt bleiben.
 */

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { Kasten } from './forma/felder';

export interface Markierung {
  /** Feldschlüssel (`<Seite>:<Name>`) */
  felder: string[];
  /** zusätzlich umrandet */
  rahmen: boolean;
  /** umrandeter Bereich, wenn nicht die Felder selbst – etwa der Rahmen eines Abschnitts */
  bereich?: { seite: number; kasten: Kasten } | null;
}

export const useMarkierung = create<{ markierung: Markierung | null; setzen: (m: Markierung | null) => void }>((set) => ({
  markierung: null,
  setzen: (markierung) => set({ markierung }),
}));

/** So lange muss man im Anpassen-Modus auf einem Eintrag verweilen, bis er im Formular umrandet wird */
export const VERWEILEN_MS = 3000;

/**
 * Maus-Handler für Einträge, die etwas im Formular hervorheben. Mit `verweilen` wird nach `VERWEILEN_MS`
 * zusätzlich umrandet. Beim Verlassen und beim Abbau verschwindet die Hervorhebung.
 */
export function useHervorheben() {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setzen = useMarkierung((s) => s.setzen);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      setzen(null);
    },
    [setzen],
  );
  return (m: Omit<Markierung, 'rahmen'>, verweilen = false) => ({
    onMouseEnter: () => {
      clearTimeout(timer.current);
      setzen({ ...m, rahmen: false });
      if (verweilen) timer.current = setTimeout(() => setzen({ ...m, rahmen: true }), VERWEILEN_MS);
    },
    onMouseLeave: () => {
      clearTimeout(timer.current);
      setzen(null);
    },
  });
}

/** Umgebendes Rechteck mehrerer Bereiche */
export function umgebend(liste: { x: number; y: number; b: number; h: number }[]): { x: number; y: number; b: number; h: number } | null {
  if (!liste.length) return null;
  const x = Math.min(...liste.map((r) => r.x));
  const y = Math.min(...liste.map((r) => r.y));
  return { x, y, b: Math.max(...liste.map((r) => r.x + r.b)) - x, h: Math.max(...liste.map((r) => r.y + r.h)) - y };
}
