/**
 * Prüfliste bedienen (U-03): Filter der Feldansicht und Sprung zur nächsten offenen Angabe (Knopf, F8).
 */
import { create } from 'zustand';
import { merkmalWerteVon } from './merkmalWerte';
import { springeZuFeld } from './navigation';
import { formularKontext, leeresProfil, profilSchluessel } from './profil';
import { naechsteOffene, offeneAngaben } from './pruefliste';
import { profilFuer, useFormulare, wertVon } from './store';

export type FeldFilter = 'alle' | 'offen' | 'geaendert';

/** Filter und Suche der Feldansicht (auch von der Gliederung aus umschaltbar) */
export const useFeldFilter = create<{ filter: FeldFilter; suche: string; setFilter: (f: FeldFilter) => void; setSuche: (s: string) => void }>((set) => ({
  filter: 'alle',
  suche: '',
  setFilter: (filter) => set({ filter }),
  setSuche: (suche) => set({ suche }),
}));

/** Offene Angaben des offenen Formulars (außerhalb von Komponenten) */
export function offeneAngabenJetzt() {
  const s = useFormulare.getState();
  const o = s.offen;
  if (!o) return [];
  const profil = { ...leeresProfil(), ...profilFuer(s.profile, profilSchluessel(o.formular, o.name)) };
  const wert = (f: Parameters<typeof wertVon>[1]) => wertVon(o, f);
  return offeneAngaben(o.felder, profil, formularKontext(merkmalWerteVon(o), o.felder.flat(), wert), wert);
}

/** Zur nächsten offenen Angabe nach dem Feld mit dem Fokus springen; false, wenn nichts offen ist */
export function zurNaechstenOffenen(): boolean {
  const o = useFormulare.getState().offen;
  if (!o) return false;
  const aktiv = (document.activeElement as HTMLElement | null)?.dataset?.feld;
  const ziel = naechsteOffene(offeneAngabenJetzt(), o.felder.flat(), aktiv);
  if (!ziel) return false;
  if (springeZuFeld(ziel)) return true;
  // in der Feldansicht vielleicht weggefiltert: Filter und Suche zurücksetzen, dann springen
  useFeldFilter.setState({ filter: 'alle', suche: '' });
  requestAnimationFrame(() => springeZuFeld(ziel));
  return true;
}
