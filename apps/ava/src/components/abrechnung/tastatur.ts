import type { KeyboardEvent } from 'react';

/** Liste per Tastatur: ↑/↓ wechseln, Enter/Leertaste wählen */
export function listenTaste<T>(e: KeyboardEvent<HTMLElement>, liste: T[], index: number, waehlen: (x: T) => void) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const i = Math.max(0, Math.min(liste.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)));
    if (liste[i] === undefined) return;
    waehlen(liste[i]);
    const geschwister = (e.currentTarget.parentElement?.children ?? []) as HTMLCollectionOf<HTMLElement>;
    geschwister[i]?.focus();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (liste[index] !== undefined) waehlen(liste[index]);
  }
}
