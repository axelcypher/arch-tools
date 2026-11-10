/**
 * Einrichten eines Formulars (Gliederung, Füllstand, Gruppen, Bedingungen): ob der Modus an ist, was ausgewählt ist
 * und ob gerade ein Feld durch Klick ins Formular gewählt wird (für Bedingungen). Ausgewählt sind Felder
 * (`f:<Feldschlüssel>`), Abschnitte (`a:<Abschnitt>`) oder Gruppen (`g:<Gruppe>`).
 */

import { create } from 'zustand';

interface EinrichtenState {
  aktiv: boolean;
  auswahl: string[];
  /** Feld durch Klick ins Formular wählen: wird mit dem Schlüssel aufgerufen */
  waehlen: ((schluessel: string) => void) | null;
  setAktiv: (aktiv: boolean) => void;
  /** wählen; `erweitern` (Strg/Umschalt) nimmt dazu bzw. wieder heraus */
  auswaehlen: (id: string, erweitern?: boolean) => void;
  setAuswahl: (auswahl: string[]) => void;
  feldWaehlen: (fertig: (schluessel: string) => void) => void;
  waehlenAbbrechen: () => void;
}

export const useEinrichten = create<EinrichtenState>((set, get) => ({
  aktiv: false,
  auswahl: [],
  waehlen: null,
  setAktiv: (aktiv) => set({ aktiv, auswahl: [], waehlen: null }),
  auswaehlen: (id, erweitern = false) => {
    const a = get().auswahl;
    if (!erweitern) set({ auswahl: [id] });
    else set({ auswahl: a.includes(id) ? a.filter((x) => x !== id) : [...a, id] });
  },
  setAuswahl: (auswahl) => set({ auswahl }),
  feldWaehlen: (fertig) => set({ waehlen: fertig }),
  waehlenAbbrechen: () => set({ waehlen: null }),
}));

export const feldId = (schluessel: string) => `f:${schluessel}`;
export const abschnittAuswahl = (id: string) => `a:${id}`;
export const gruppeAuswahl = (id: string) => `g:${id}`;
