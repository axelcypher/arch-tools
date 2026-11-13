/**
 * Eigene Datenbank der Vorlagetexte (statt externer Textquellen): Positionen mit Kurz- und Langtext, Einheit
 * und Kostengruppe, gruppiert nach Gewerk. Sie liegt für das ganze Büro im gemeinsamen Konfigurationsordner
 * (Bereich „ava-texte“) und lässt sich aus jedem LV füllen.
 */

import { konfigAendern, konfigLesen } from '@core/platform/konfig';
import type { Formattext } from '../format/rtf';
import { alsText } from '../format/rtf';
import type { Lv, Position } from './modell';
import { neueId, positionen } from './modell';
import { schreibend } from '../schreiben';

export interface Vorlagetext {
  id: string;
  /** Gruppe, z. B. „Fliesenarbeiten“ */
  gruppe: string;
  kurztext: string;
  langtext: Formattext;
  einheit?: string;
  kostengruppe?: string;
  /** Richtpreis (Einheitspreis netto) als Vorgabe für den Kostenansatz */
  richtpreis?: number;
  geaendert: string;
}

const BEREICH = 'ava-texte';

export async function vorlagenLaden(): Promise<Vorlagetext[]> {
  const roh = await konfigLesen(BEREICH);
  if (!Array.isArray(roh)) return [];
  // fehlerhafte Einträge im gemeinsamen Ordner nicht durchreichen: Pflichtfelder absichern
  return (roh as Partial<Vorlagetext>[])
    .filter((v): v is Partial<Vorlagetext> & { kurztext: string } => !!v && typeof v === 'object' && typeof v.kurztext === 'string')
    .map(
      (v) =>
        ({
          ...v,
          id: typeof v.id === 'string' && v.id ? v.id : neueId('t'),
          gruppe: typeof v.gruppe === 'string' ? v.gruppe : '',
          langtext: Array.isArray(v.langtext) ? v.langtext : [],
          geaendert: typeof v.geaendert === 'string' ? v.geaendert : '',
        }) as Vorlagetext,
    );
}

export function vorlagenAendern(f: (v: Vorlagetext[]) => Vorlagetext[]): Promise<Vorlagetext[]> {
  return schreibend(konfigAendern(BEREICH, (roh) => f(Array.isArray(roh) ? (roh as Vorlagetext[]) : [])), 'vorlagen');
}

export function vorlageAusPosition(p: Position, gruppe: string): Vorlagetext {
  const ep = p.preise['0']?.ep;
  return {
    id: neueId('t'),
    gruppe,
    kurztext: p.kurztext,
    langtext: p.langtext,
    ...(p.einheit ? { einheit: p.einheit } : {}),
    ...(p.kostengruppe ? { kostengruppe: p.kostengruppe } : {}),
    ...(ep != null ? { richtpreis: ep } : {}),
    geaendert: new Date().toISOString(),
  };
}

/** alle Positionen eines LV als Vorlagen (gleiche Kurz- und Langtexte werden nicht doppelt aufgenommen) */
export function vorlagenAusLv(lv: Lv, gruppe: string, vorhanden: Vorlagetext[]): Vorlagetext[] {
  const schon = new Set(vorhanden.map((v) => `${v.kurztext}\u0000${alsText(v.langtext)}`));
  const neu: Vorlagetext[] = [];
  for (const { pos } of positionen(lv)) {
    const k = `${pos.kurztext}\u0000${alsText(pos.langtext)}`;
    if (schon.has(k) || !pos.kurztext.trim()) continue;
    schon.add(k);
    neu.push(vorlageAusPosition(pos, gruppe));
  }
  return neu;
}

/** Suche in Kurztext, Langtext, Gruppe und Kostengruppe (alle Wörter müssen vorkommen) */
export function vorlagenSuchen(liste: Vorlagetext[], suche: string, gruppe?: string): Vorlagetext[] {
  const woerter = suche.toLowerCase().split(/\s+/).filter(Boolean);
  return liste.filter((v) => {
    if (gruppe && v.gruppe !== gruppe) return false;
    if (!woerter.length) return true;
    const t = `${v.gruppe} ${v.kurztext} ${alsText(v.langtext)} ${v.kostengruppe ?? ''} ${v.einheit ?? ''}`.toLowerCase();
    return woerter.every((w) => t.includes(w));
  });
}
