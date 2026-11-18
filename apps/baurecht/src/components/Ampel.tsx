import type { Ampel } from '@core/baurecht/typen';

/**
 * geschütztes Leerzeichen nach §, §§, Abs., Nr., Satz – „§ 33 Abs. 1“ bricht nicht zwischen Zeichen und Nummer um; in
 * Kennungen wie „SO-076“ ein geschützter Bindestrich (kein Umbruch „SO-|076“)
 */
export const nb = (s: string): string => s.replace(/(§§?|Abs\.|Nr\.|Satz|Art\.) (?=[\dIVX])/g, '$1\u00a0').replace(/\b([A-ZÄÖÜ]{1,4})-(?=\d)/g, '$1\u2011');

/** der Scrollbereich zu einem Element: der Rumpf seiner Karte (die Karte scrollt, nicht die Liste darin) */
export function scrollBereich(el: HTMLElement | null): HTMLElement | null {
  return el?.closest<HTMLElement>('.karte-rumpf') ?? el;
}

/**
 * Element in seinem Scrollbereich (Rumpf der Karte, in der `bereich` steht) einblenden, ohne Vorfahren mitzuscrollen
 * (scrollIntoView verschöbe sonst auch die ganze App, obwohl die Fläche nie scrollt)
 */
export function inBereichZeigen(innerhalb: HTMLElement | null, el: HTMLElement | null, wo: 'mitte' | 'naechst' = 'naechst'): void {
  const bereich = scrollBereich(innerhalb);
  if (!bereich || !el) return;
  const b = bereich.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  // oben stehen bleibende Teile (Suchfeld der Angaben) halten über scroll-padding-top Platz frei
  const oben = b.top + (parseFloat(getComputedStyle(bereich).scrollPaddingTop) || 0);
  if (wo === 'mitte') bereich.scrollTop += e.top - oben - (b.bottom - oben - e.height) / 2;
  else if (e.top < oben) bereich.scrollTop += e.top - oben - 8;
  else if (e.bottom > b.bottom) bereich.scrollTop += e.bottom - b.bottom + 8;
}

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

/** Klasse des Statuspunkts (Designsystem) je Ampel */
export const STATUSPUNKT: Record<Ampel, string> = { rot: 'fehler', gelb: 'warnung', gruen: 'ok' };

/** Ampel als Punkt mit Wort */
export function AmpelMarke({ ampel, klein = false, ohneText = false, vonHand = false }: { ampel: Ampel; klein?: boolean; ohneText?: boolean; vonHand?: boolean }) {
  return (
    <span className={`br-ampel br-ampel-${ampel}${klein ? ' br-ampel-klein' : ''}`} title={`${AMPEL_LANG[ampel]}${vonHand ? ' (von Hand festgelegt)' : ''}`}>
      <span className={`statuspunkt ${STATUSPUNKT[ampel]}`} aria-hidden="true" />
      {!ohneText && <span className="br-ampel-text">{AMPEL_TEXT[ampel]}</span>}
      {ohneText && <span className="unsichtbar">{AMPEL_TEXT[ampel]}</span>}
    </span>
  );
}

const datumZahl = (iso: string) => iso.split('-').reverse().join('.');
/** „a, b und c“ */
export const aufzaehlen = (t: string[]) => (t.length > 1 ? `${t.slice(0, -1).join(', ')} und ${t[t.length - 1]}` : (t[0] ?? ''));
export const datum = (iso: string | undefined | null) => (iso ? datumZahl(iso.slice(0, 10)) : '');
export const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
