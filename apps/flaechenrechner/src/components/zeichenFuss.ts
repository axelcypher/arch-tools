import { createContext, useContext } from 'react';

/**
 * Ziel in der Fußzeile der Zeichenkarte (docs/design.md „Fläche und Karten“): Die Zeichenfläche stellt Bedienhinweis,
 * Eingabe, Koordinaten und Maßstab per Portal dorthin – so verdeckt nichts den Plan, und der Zustand bleibt in der
 * Zeichenfläche. `null`, solange die Fußzeile nicht steht (oder die 3D-Ansicht offen ist).
 */
export const ZeichenFussZiel = createContext<HTMLElement | null>(null);

export const useZeichenFussZiel = () => useContext(ZeichenFussZiel);
