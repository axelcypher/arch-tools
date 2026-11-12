import type { Ampel } from '@core/baurecht/typen';

/** Ampel in Worten – nie nur Farbe */
export const AMPEL_TEXT: Record<Ampel, string> = { rot: 'gilt', gelb: 'prüfen', gruen: 'entfällt' };
export const AMPEL_LANG: Record<Ampel, string> = {
  rot: 'Gilt – muss beachtet und im Antrag berücksichtigt werden',
  gelb: 'Von Hand prüfen',
  gruen: 'Entfällt auf jeden Fall',
};

/** Erklärung neben der Marke (Legenden, Auswahl) – ohne das Wort der Marke zu wiederholen */
export const AMPEL_ERKLAERUNG: Record<Ampel, string> = {
  rot: 'muss beachtet und im Antrag berücksichtigt werden',
  gelb: 'von Hand klären – eine Angabe fehlt oder es kommt auf den Einzelfall an',
  gruen: 'auf jeden Fall nicht einschlägig',
};

/** Ampel als Punkt mit Wort */
export function AmpelMarke({ ampel, klein = false, ohneText = false, vonHand = false }: { ampel: Ampel; klein?: boolean; ohneText?: boolean; vonHand?: boolean }) {
  return (
    <span className={`br-ampel br-ampel-${ampel}${klein ? ' br-ampel-klein' : ''}`} title={`${AMPEL_LANG[ampel]}${vonHand ? ' (von Hand festgelegt)' : ''}`}>
      <span className="br-ampel-punkt" aria-hidden="true" />
      {!ohneText && <span className="br-ampel-text">{AMPEL_TEXT[ampel]}</span>}
      {ohneText && <span className="br-unsichtbar">{AMPEL_TEXT[ampel]}</span>}
    </span>
  );
}

const datumZahl = (iso: string) => iso.split('-').reverse().join('.');
export const datum = (iso: string | undefined | null) => (iso ? datumZahl(iso.slice(0, 10)) : '');
export const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
