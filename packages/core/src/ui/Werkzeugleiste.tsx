/**
 * Werkzeugleiste mit Überlauf: Einträge stehen der Reihe nach in der Leiste; reicht die Breite nicht, wandern Einträge
 * mit Rang in das Menü „Mehr“ am Ende – der unwichtigste (höchster Rang) zuerst. Einträge ohne Rang bleiben immer
 * sichtbar (Hauptknopf, Werkzeuge einer Zeichenfläche). Seltene Befehle stehen gleich im Menü „Mehr“ (`mehr`).
 * Die Leiste nimmt die volle Breite ihres Elternelements (`.toolbar.werkzeugleiste`: `width: 100%`, `flex: 0 0 auto` –
 * in einer Spalte wächst und schrumpft sie nicht in der Höhe) und misst ihre eigene Breite als verfügbaren Platz.
 * Richtlinie: docs/design.md, „Kopf- und Werkzeugleisten“.
 */
import type { ReactNode } from 'react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { MenuePunkt } from './Menue';
import { MenueKnopf } from './Menue';
import { Symbol } from './Symbol';

/** Eintrag der Leiste: ein Knopf oder eine Gruppe zusammengehöriger Knöpfe */
export interface LeistenEintrag {
  id: string;
  /** Inhalt in der Leiste */
  inhalt: ReactNode;
  /** Gruppe zusammengehöriger Knöpfe: mit Trennstrich zum nächsten Eintrag (`.tb-group`); sonst ohne */
  gruppe?: boolean;
  /**
   * Darf sich kürzen (z. B. ein Statustext): schrumpft bis auf eine Mindestbreite, Text mit „…“ abgeschnitten. Sonst
   * behält ein Eintrag seine Breite und wandert bei Platzmangel ins Menü „Mehr“. Ein kürzbarer Eintrag schrumpft zuerst;
   * Einträge mit Rang wandern erst, wenn er seine Mindestbreite erreicht hat.
   */
  kuerzbar?: boolean;
  /** Gegenstück im Menü „Mehr“, solange der Eintrag nicht in die Leiste passt (Gruppe: mehrere Punkte) */
  menue?: MenuePunkt | MenuePunkt[];
  /**
   * Reihenfolge beim Überlauf: höherer Rang wandert zuerst ins Menü. Ohne Rang (oder ohne `menue`) bleibt der Eintrag
   * immer in der Leiste.
   */
  rang?: number;
}

/** Abstandhalter: schiebt die folgenden Einträge nach rechts (wie `.tb-spacer`) */
export interface LeistenAbstand {
  abstand: true;
}

export type LeistenTeil = LeistenEintrag | LeistenAbstand;

const istAbstand = (t: LeistenTeil): t is LeistenAbstand => 'abstand' in t;

/**
 * Welche Einträge ins Menü wandern: so wenige wie möglich, in der Reihenfolge ihres Rangs (höchster zuerst, bei
 * Gleichstand der weiter rechts stehende). `mehrBreite` zählt mit, sobald das Menü „Mehr“ sichtbar ist – immer, wenn
 * es feste Punkte hat (`mehrImmer`), sonst erst beim ersten Überlauf. `abstandhalter`: Zahl der Abstandhalter – sie
 * haben keine eigene Breite, bekommen als Flex-Kinder aber je einen Abstand (`gap`).
 */
export function ueberlauf(
  eintraege: { id: string; breite: number; rang?: number }[],
  verfuegbar: number,
  { mehrBreite, abstand, mehrImmer, abstandhalter = 0 }: { mehrBreite: number; abstand: number; mehrImmer: boolean; abstandhalter?: number },
): Set<string> {
  const weg = new Set<string>();
  const sichtbar = () => eintraege.filter((e) => !weg.has(e.id));
  const bedarf = () => {
    const s = sichtbar();
    const mitMehr = mehrImmer || weg.size > 0;
    const anzahl = s.length + (mitMehr ? 1 : 0) + abstandhalter;
    return s.reduce((n, e) => n + e.breite, 0) + (mitMehr ? mehrBreite : 0) + Math.max(0, anzahl - 1) * abstand;
  };
  const kandidaten = eintraege
    .map((e, i) => ({ ...e, i }))
    .filter((e) => e.rang !== undefined)
    .sort((a, b) => b.rang! - a.rang! || b.i - a.i);
  for (const k of kandidaten) {
    if (bedarf() <= verfuegbar) break;
    weg.add(k.id);
  }
  return weg;
}

const alsListe = (m: MenuePunkt | MenuePunkt[] | undefined): MenuePunkt[] => (m === undefined ? [] : Array.isArray(m) ? m : [m]);

/** Punkte des Menüs „Mehr“: übergelaufene Einträge in ihrer Reihenfolge (Gruppen durch Trenner getrennt), dann die festen */
export function mehrPunkte(teile: LeistenTeil[], weg: Set<string>, fest: MenuePunkt[]): MenuePunkt[] {
  const gruppen = teile.filter((t): t is LeistenEintrag => !istAbstand(t) && weg.has(t.id)).map((t) => alsListe(t.menue));
  if (fest.length) gruppen.push(fest);
  return gruppen.filter((g) => g.length).flatMap((g, i) => (i ? [{ trenner: true } as const, ...g] : g));
}

/** Breite eines Elements in Pixeln (eigene Funktion, damit Tests sie ersetzen können) */
export const leistenMessung = { breite: (el: Element) => el.getBoundingClientRect().width };

export function Werkzeugleiste({
  teile,
  mehr,
  name = 'Werkzeugleiste',
  className,
}: {
  teile: LeistenTeil[];
  /** feste Punkte im Menü „Mehr“ (seltene Befehle); ohne sie erscheint „Mehr“ nur beim Überlauf */
  mehr?: () => MenuePunkt[];
  /** Name der Leiste für Screenreader */
  name?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const breiten = useRef(new Map<string, number>());
  const fokusAufMehr = useRef(false);
  const [weg, setWeg] = useState<Set<string>>(() => new Set());
  const festePunkte = mehr?.() ?? [];
  const mehrImmer = festePunkte.length > 0;
  // `teile` bauen die Apps bei jedem Render neu: die Rechnung liest sie aus dem Ref und hängt nur am Aufbau (ids, Rang,
  // Menü, Abstandhalter) – neu gemessen wird bei Größenänderungen (ResizeObserver auf Leiste und Einträgen), nicht je Render
  const teileRef = useRef(teile);
  teileRef.current = teile;
  const aufbau = teile.map((t) => (istAbstand(t) ? '|' : `${t.id}:${t.rang ?? ''}:${t.menue === undefined ? 0 : 1}`)).join(',');

  const berechnen = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const teile = teileRef.current;
    // sichtbare Einträge neu messen, für ausgeblendete gilt die zuletzt gemessene Breite
    for (const k of el.querySelectorAll<HTMLElement>(':scope > [data-eintrag]')) {
      if (!k.hidden) breiten.current.set(k.dataset.eintrag!, leistenMessung.breite(k));
    }
    const stil = getComputedStyle(el);
    const abstand = parseFloat(stil.columnGap || stil.gap) || 0;
    const innen = leistenMessung.breite(el) - (parseFloat(stil.paddingLeft) || 0) - (parseFloat(stil.paddingRight) || 0);
    const mehrEl = el.querySelector<HTMLElement>(':scope > .werkzeugleiste-mehr');
    if (mehrEl && !mehrEl.hidden) breiten.current.set('\u0000mehr', leistenMessung.breite(mehrEl));
    const eintraege = teile.filter((t): t is LeistenEintrag => !istAbstand(t)).map((t) => ({ id: t.id, breite: breiten.current.get(t.id) ?? 0, rang: t.menue === undefined ? undefined : t.rang }));
    const abstandhalter = teile.filter(istAbstand).length;
    const neu = ueberlauf(eintraege, innen, { mehrBreite: breiten.current.get('\u0000mehr') ?? 0, abstand, mehrImmer, abstandhalter });
    // wandert der Eintrag mit dem Fokus ins Menü, bekommt „Mehr“ den Fokus (sonst fiele er auf die Seite)
    const fokus = document.activeElement?.closest?.('[data-eintrag]') as HTMLElement | null;
    const fokusId = fokus && el.contains(fokus) ? fokus.dataset.eintrag! : null;
    setWeg((alt) => {
      if (alt.size === neu.size && [...neu].every((id) => alt.has(id))) return alt;
      // nur bei echter Änderung, und nur wenn gerade der fokussierte Eintrag neu ins Menü wandert
      if (fokusId && neu.has(fokusId) && !alt.has(fokusId)) fokusAufMehr.current = true;
      return neu;
    });
  }, [aufbau, mehrImmer]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    berechnen();
    const el = ref.current;
    window.addEventListener('resize', berechnen);
    const ro = typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(() => berechnen()) : null;
    // die Leiste selbst und jeder Eintrag: ändert sich ein Knopftext, misst die Leiste neu
    if (ro && el) for (const k of [el, ...el.querySelectorAll(':scope > [data-eintrag], :scope > .werkzeugleiste-mehr')]) ro.observe(k);
    return () => {
      window.removeEventListener('resize', berechnen);
      ro?.disconnect();
    };
  }, [berechnen]);

  const zeigeMehr = mehrImmer || weg.size > 0;
  // erscheint „Mehr“ erst jetzt, ist seine Breite erst jetzt messbar: einmal nachrechnen
  useLayoutEffect(() => {
    if (zeigeMehr) berechnen();
  }, [zeigeMehr]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!fokusAufMehr.current) return;
    fokusAufMehr.current = false;
    ref.current?.querySelector<HTMLButtonElement>(':scope > .werkzeugleiste-mehr > button')?.focus();
  }, [weg]);
  return (
    <div ref={ref} className={`toolbar werkzeugleiste${className ? ` ${className}` : ''}`} role="group" aria-label={name}>
      {teile.map((t, i) =>
        istAbstand(t) ? (
          <div key={`abstand-${i}`} className="tb-spacer" />
        ) : (
          <div key={t.id} className={`${t.gruppe ? 'tb-group' : 'werkzeugleiste-eintrag'}${t.kuerzbar ? ' werkzeugleiste-kuerzbar' : ''}`} data-eintrag={t.id} hidden={weg.has(t.id)}>
            {t.inhalt}
          </div>
        ),
      )}
      <div className="werkzeugleiste-mehr" hidden={!zeigeMehr}>
        <MenueKnopf className="icon" punkte={() => mehrPunkte(teile, weg, mehr?.() ?? [])} ariaLabel="Mehr" title="Mehr – weitere Befehle" name="Mehr" pfeil={false}>
          <Symbol name="mehr" />
        </MenueKnopf>
      </div>
    </div>
  );
}
