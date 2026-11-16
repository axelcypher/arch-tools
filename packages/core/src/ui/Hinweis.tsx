import { useEffect, useLayoutEffect, useRef } from 'react';
import { create } from 'zustand';
import { logger } from '../platform/log';
import { Symbol } from './Symbol';

/**
 * Hinweis nach einer Aktion (docs/design.md „Meldungen im Inhalt“), z. B. „Gespeichert unter …“ nach dem direkten Export:
 * unten rechts, hält nichts auf, nimmt keinen Fokus und verschwindet nicht von selbst (WCAG 2.2.1). Er bleibt, bis man
 * ihn schließt oder ein neuer Hinweis mit derselben `id` ihn ersetzt; verschiedene Hinweise stapeln sich (höchstens drei).
 * Angezeigt von `HinweisHost` (steckt in der Titelleiste, also in jeder App). F6 springt hinein und wieder zurück, Esc
 * zurück; Apps mit eigenem F6-Kreis rufen `hinweisFokussieren()`.
 */

const log = logger('hinweis');

export const HINWEISE_HOECHSTENS = 3;

export interface HinweisAktion {
  text: string;
  aktion: () => void | Promise<void>;
  /** abschließende Aktion (z. B. „Ordner öffnen“): schließt den Hinweis danach; „Prüfhinweise …“ lässt ihn stehen */
  schliesst?: boolean;
}

export interface HinweisDaten {
  /** Schlüssel: ein neuer Hinweis mit derselben id ersetzt den alten (z. B. 'export') */
  id?: string;
  art?: 'ok' | 'warnung' | 'fehler';
  text: string;
  /** Pfad o. Ä. in eigener Zeile; bricht um statt abzuschneiden */
  pfad?: string;
  /** höchstens zwei */
  aktionen?: HinweisAktion[];
}

interface Hinweis extends Required<Pick<HinweisDaten, 'id' | 'art' | 'text'>> {
  pfad?: string;
  aktionen: HinweisAktion[];
  /** zählt jede Anzeige hoch – auch beim Ersetzen, damit die Ansage neu kommt */
  nr: number;
}

interface Stapel {
  liste: Hinweis[];
  /** zuletzt angesagt: [höflich, sofort] */
  ansage: { text: string; sofort: boolean; nr: number } | null;
}

const useStapel = create<Stapel>(() => ({ liste: [], ansage: null }));
let zaehler = 0;

/** der Stapel im DOM (für Fokus und Verdrängen) */
let stapelEl: HTMLElement | null = null;
/** wohin Esc bzw. F6 zurückspringt */
let zurueck: HTMLElement | null = null;

const ansageText = (h: Hinweis) => [h.text, h.pfad].filter(Boolean).join(' ');

/** Zeigt einen Hinweis; liefert seine id (zum Schließen mit `schliesseHinweis`) */
export function zeigeHinweis(d: HinweisDaten): string {
  if ((d.aktionen?.length ?? 0) > 2) log.warn(`Hinweis „${d.text}“ hat mehr als zwei Aktionen; angezeigt werden zwei`);
  const h: Hinweis = { id: d.id ?? `hinweis-${zaehler + 1}`, art: d.art ?? 'ok', text: d.text, pfad: d.pfad, aktionen: (d.aktionen ?? []).slice(0, 2), nr: ++zaehler };
  useStapel.setState((s) => {
    const i = s.liste.findIndex((x) => x.id === h.id);
    let liste = i >= 0 ? s.liste.map((x, j) => (j === i ? h : x)) : [...s.liste, h];
    // zu viele: der älteste fällt weg – aber nie der, in dem der Fokus steht
    while (liste.length > HINWEISE_HOECHSTENS) {
      const fokus = fokusId();
      const weg = liste.find((x) => x.id !== fokus && x.id !== h.id);
      if (!weg) break;
      liste = liste.filter((x) => x !== weg);
    }
    return { liste, ansage: { text: ansageText(h), sofort: h.art === 'fehler', nr: h.nr } };
  });
  return h.id;
}

/** Schließt den Hinweis mit dieser id (falls noch da) */
export function schliesseHinweis(id: string): void {
  const el = stapelEl?.querySelector<HTMLElement>(`[data-hinweis="${CSS.escape(id)}"]`);
  if (el && el.contains(document.activeElement)) {
    // Fokus an den nächsten Hinweis im Stapel, sonst zurück
    const alle = [...(stapelEl?.querySelectorAll<HTMLElement>('[data-hinweis]') ?? [])];
    const i = alle.indexOf(el);
    const nachbar = alle[i + 1] ?? alle[i - 1];
    if (nachbar) ersterKnopf(nachbar)?.focus();
    else zurueckSpringen();
  }
  useStapel.setState((s) => ({ liste: s.liste.filter((x) => x.id !== id) }));
}

/**
 * Fokus in den neuesten Hinweis (F6). Liefert false, wenn keiner da ist – dann überspringt ein F6-Kreis die Station.
 */
export function hinweisFokussieren(): boolean {
  const alle = stapelEl?.querySelectorAll<HTMLElement>('[data-hinweis]');
  const neuester = alle?.[alle.length - 1];
  const knopf = neuester && ersterKnopf(neuester);
  if (!knopf) return false;
  if (!stapelEl!.contains(document.activeElement)) zurueck = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  knopf.focus();
  return true;
}

function fokusId(): string | undefined {
  const a = document.activeElement;
  return (a instanceof Element && stapelEl?.contains(a) && a.closest<HTMLElement>('[data-hinweis]')?.dataset.hinweis) || undefined;
}

const ersterKnopf = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('button');

/** zurück an das zuvor fokussierte Element, ersatzweise den Hauptbereich */
function zurueckSpringen() {
  const ziel = zurueck?.isConnected ? zurueck : document.querySelector<HTMLElement>('main, [role="main"]');
  zurueck = null;
  if (ziel) {
    if (!ziel.matches('a[href], button, input, select, textarea, [tabindex]')) ziel.tabIndex = -1;
    ziel.focus();
  } else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

/** Teilen sich Fokus-Element und Stapel eine Fläche? */
const ueberdeckt = (a: DOMRect, b: DOMRect) => a.width > 0 && b.width > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Fläche der Hinweis-Karten (ohne die Luft des Stapels für die Schatten); null ohne Hinweis */
function kartenFlaeche(st: HTMLElement): DOMRect | null {
  const karten = st.querySelectorAll<HTMLElement>('[data-hinweis]');
  if (!karten.length) return null;
  const s = st.getBoundingClientRect();
  const oben = karten[0].getBoundingClientRect();
  const unten = karten[karten.length - 1].getBoundingClientRect();
  return new DOMRect(oben.left, Math.max(oben.top, s.top), oben.width, Math.min(unten.bottom, s.bottom) - Math.max(oben.top, s.top));
}

/** Stelle für Hinweise – einmal je App (steckt in der Titelleiste) */
export function HinweisHost() {
  const liste = useStapel((s) => s.liste);
  const ansage = useStapel((s) => s.ansage);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    stapelEl = ref.current;
    return () => {
      stapelEl = null;
    };
  }, []);

  // ein neuer bzw. ersetzter Hinweis ist im (scrollbaren) Stapel zu sehen
  useLayoutEffect(() => {
    const st = ref.current;
    const id = ansage && useStapel.getState().liste.find((h) => h.nr === ansage.nr)?.id;
    const karte = id ? st?.querySelector<HTMLElement>(`[data-hinweis="${CSS.escape(id)}"]`) : null;
    if (!st || !karte) return;
    const s = st.getBoundingClientRect();
    const k = karte.getBoundingClientRect();
    const luft = parseFloat(getComputedStyle(st).paddingBottom) || 0;
    if (k.bottom + luft > s.bottom) st.scrollTop += k.bottom + luft - s.bottom;
    else if (k.top - luft < s.top) st.scrollTop -= s.top - (k.top - luft);
  }, [ansage]);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key !== 'F6' || e.ctrlKey || e.altKey || e.metaKey) return;
      if (stapelEl?.contains(document.activeElement)) {
        e.preventDefault();
        zurueckSpringen();
      } else if (hinweisFokussieren()) e.preventDefault();
    };
    // fokussierte Elemente nie unter dem Stapel (WCAG 2.4.11): erst darüber schieben, sonst weicht der Stapel aus
    const fokus = (e: FocusEvent) => {
      const el = e.target;
      const st = stapelEl;
      if (!st || !(el instanceof HTMLElement) || st.contains(el)) return;
      st.classList.remove('ausweichen');
      const s = kartenFlaeche(st);
      if (!s || !ueberdeckt(el.getBoundingClientRect(), s)) return;
      el.style.scrollMarginBottom = `${Math.ceil(window.innerHeight - s.top)}px`;
      el.scrollIntoView?.({ block: 'nearest' });
      el.style.scrollMarginBottom = '';
      const nachher = kartenFlaeche(st);
      if (nachher && ueberdeckt(el.getBoundingClientRect(), nachher)) st.classList.add('ausweichen');
    };
    window.addEventListener('keydown', taste);
    document.addEventListener('focusin', fokus);
    return () => {
      window.removeEventListener('keydown', taste);
      document.removeEventListener('focusin', fokus);
    };
  }, []);

  const tasteImStapel = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    zurueckSpringen();
  };
  const fokusRein = (e: React.FocusEvent) => {
    // von außen hereingekommen (Tab, Klick): Ausgangspunkt merken
    const von = e.relatedTarget;
    if (von instanceof HTMLElement && !ref.current?.contains(von)) zurueck = von;
  };

  const ausfuehren = async (h: Hinweis, a: HinweisAktion) => {
    try {
      await a.aktion();
    } catch (e) {
      log.error(`Aktion „${a.text}“ des Hinweises fehlgeschlagen`, e);
    }
    if (a.schliesst) schliesseHinweis(h.id);
  };

  return (
    <div ref={ref} className="hinweise" role="region" aria-label="Hinweise" onKeyDown={tasteImStapel} onFocus={fokusRein}>
      {/* stets vorhandene Live-Regionen: so wird jeder neue Hinweis zuverlässig angesagt */}
      <div className="nur-vorlesen" role="status">
        {ansage && !ansage.sofort ? <span key={ansage.nr}>{ansage.text}</span> : null}
      </div>
      <div className="nur-vorlesen" role="alert">
        {ansage?.sofort ? <span key={ansage.nr}>{ansage.text}</span> : null}
      </div>
      {liste.map((h) => (
        <div key={h.id} data-hinweis={h.id} className={`hinweis meldung ${h.art}`}>
          <div className="hinweis-inhalt">
            <div className="hinweis-text">{h.text}</div>
            {h.pfad && <div className="hinweis-pfad">{h.pfad}</div>}
            {h.aktionen.length > 0 && (
              <div className="hinweis-aktionen">
                {h.aktionen.map((a) => (
                  <button key={a.text} type="button" className="small" onClick={() => void ausfuehren(h, a)}>
                    {a.text}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="icon hinweis-zu" aria-label="Hinweis schließen" title="Hinweis schließen" onClick={() => schliesseHinweis(h.id)}>
            <Symbol name="schliessen" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** nur für Tests: Stapel leeren */
export function hinweiseLeeren(): void {
  useStapel.setState({ liste: [], ansage: null });
  zurueck = null;
}
