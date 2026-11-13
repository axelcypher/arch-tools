import type { KeyboardEvent } from 'react';

/**
 * Auswahlliste per Tastatur (eine Funktion für alle Listen der App): ↑/↓ wechseln, Pos1/Ende springen an Anfang und
 * Ende, Enter/Leertaste wählen. Der Fokus folgt dem gewählten Eintrag (`role="option"` in der Liste, sonst Geschwister).
 */
export function listenTaste<T>(e: KeyboardEvent<HTMLElement>, liste: T[], index: number, waehlen: (x: T) => void) {
  if (!liste.length) return;
  let j = -1;
  if (e.key === 'ArrowDown') j = Math.min(liste.length - 1, index + 1);
  else if (e.key === 'ArrowUp') j = Math.max(0, index - 1);
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = liste.length - 1;
  else if ((e.key === 'Enter' || e.key === ' ') && index >= 0) {
    e.preventDefault();
    waehlen(liste[index]);
    return;
  }
  if (j < 0) return;
  e.preventDefault();
  waehlen(liste[j]);
  const behaelter = e.currentTarget.closest('[role="listbox"]');
  const eintraege = behaelter ? behaelter.querySelectorAll<HTMLElement>('[role="option"]') : ((e.currentTarget.parentElement?.children ?? []) as HTMLCollectionOf<HTMLElement>);
  eintraege[j]?.focus();
}
