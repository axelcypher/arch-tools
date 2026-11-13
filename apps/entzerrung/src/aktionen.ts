import { entzerrung, zuEbene } from './geo/ebene';
import type { Pt } from './geo/mat';
import { ECKEN_KURZ, MESS_NAMEN, neueId } from './model';
import type { Dokument, Ebene, MessArt } from './model';
import { aktuell, mitEbene, mitFoto, useEntz } from './store';
import type { Auswahl } from './store';
import type { MenuePunkt } from '@core/ui/Menue';

/**
 * Bearbeitungsschritte der Arbeitsfläche, unabhängig von Maus und Bildschirm: Punkte kommen immer als
 * Fotopixel (verzeichnet) an.
 */

const st = () => useEntz.getState();

/** Wie viele Punkte ein Werkzeug braucht; `Infinity` = beliebig viele, Abschluss mit Enter/Doppelklick */
const PUNKTE: Partial<Record<string, number>> = { waagerecht: 2, senkrecht: 2, mass: 2, strecke: 2, ausschnitt: 2, hilfslinie: Infinity, linienzug: Infinity, flaeche: Infinity };
const MINDESTENS: Partial<Record<string, number>> = { hilfslinie: 3, linienzug: 2, flaeche: 3 };

export function klick(p: Pt) {
  const s = st();
  const { foto, ebene } = aktuell(s);
  if (!foto) return;
  const w = s.werkzeug;
  if (w === 'auswahl') {
    s.setze({ auswahl: null });
    return;
  }
  if (w === 'ecken') {
    if (!ebene || ebene.rechteck.ecken.length >= 4) return;
    s.aendern(mitEbene(foto.id, ebene.id, (e) => ({ ...e, methode: 'rechteck', rechteck: { ...e.rechteck, ecken: [...e.rechteck.ecken, p] } })));
    if (ebene.rechteck.ecken.length === 3) s.setze({ werkzeug: 'auswahl' });
    return;
  }
  if (w === 'passpunkt') {
    if (!ebene) return;
    const id = neueId();
    s.aendern(mitEbene(foto.id, ebene.id, (e) => ({ ...e, methode: 'passpunkte', passpunkte: [...e.passpunkte, { id, bild: p }] })));
    s.setze({ auswahl: { art: 'passpunkt', id }, fokus: id });
    return;
  }
  const entwurf = [...s.entwurf, p];
  if (entwurf.length >= (PUNKTE[w] ?? Infinity)) {
    s.setze({ entwurf: [] });
    erzeugen(entwurf);
  } else s.setze({ entwurf });
}

/** Enter bzw. Doppelklick: mehrpunktiges Element abschließen */
export function abschliessen() {
  const s = st();
  const n = MINDESTENS[s.werkzeug];
  if (n === undefined) return;
  if (s.entwurf.length < n) return;
  const punkte = s.entwurf;
  s.setze({ entwurf: [] });
  erzeugen(punkte);
}

export function abbrechen() {
  const s = st();
  if (s.entwurf.length) s.setze({ entwurf: [] });
  else if (s.auswahl) s.setze({ auswahl: null });
  else if (s.werkzeug !== 'auswahl') s.setze({ werkzeug: 'auswahl' });
}

export function letztenPunktEntfernen() {
  const s = st();
  if (s.entwurf.length) s.setze({ entwurf: s.entwurf.slice(0, -1) });
}

function erzeugen(punkte: Pt[]) {
  const s = st();
  const { foto, ebene } = aktuell(s);
  if (!foto) return;
  const id = neueId();
  const w = s.werkzeug;
  if (w === 'hilfslinie') {
    s.aendern(mitFoto(foto.id, (f) => ({ ...f, hilfslinien: [...f.hilfslinien, { id, punkte }] })));
    s.setze({ auswahl: { art: 'hilfslinie', id } });
    return;
  }
  if (!ebene) return;
  const [a, b] = punkte;
  const aendereEbene = (f: (e: Ebene) => Ebene) => s.aendern(mitEbene(foto.id, ebene.id, f));
  switch (w) {
    case 'waagerecht':
    case 'senkrecht':
      aendereEbene((e) => ({ ...e, methode: 'fluchtlinien', fluchtlinien: { ...e.fluchtlinien, [w]: [...e.fluchtlinien[w], { id, a, b }] } }));
      s.setze({ auswahl: { art: w, id } });
      return;
    case 'mass':
      aendereEbene((e) => ({ ...e, methode: 'fluchtlinien', fluchtlinien: { ...e.fluchtlinien, masse: [...e.fluchtlinien.masse, { id, a, b }] } }));
      s.setze({ auswahl: { art: 'mass', id }, fokus: id });
      return;
    case 'strecke':
    case 'linienzug':
    case 'flaeche': {
      const art: MessArt = w;
      const nr = ebene.messungen.filter((m) => m.art === art).length + 1;
      aendereEbene((e) => ({ ...e, messungen: [...e.messungen, { id, art, name: `${MESS_NAMEN[art]} ${nr}`, punkte }] }));
      s.setze({ auswahl: { art: 'messung', id } });
      return;
    }
    case 'ausschnitt': {
      const r = entzerrung(foto, ebene);
      if (!r.ok) return;
      const p = zuEbene(r.e, a);
      const q = zuEbene(r.e, b);
      if (Math.abs(p.x - q.x) < 1e-6 || Math.abs(p.y - q.y) < 1e-6) return;
      aendereEbene((e) => ({ ...e, ausschnitt: { x0: Math.min(p.x, q.x), y0: Math.min(p.y, q.y), x1: Math.max(p.x, q.x), y1: Math.max(p.y, q.y) } }));
      s.setze({ werkzeug: 'auswahl' });
      return;
    }
  }
}

/** Punkt eines Elements verschieben (beim Ziehen ohne Verlauf; vorher `merken()`) */
export function punktVerschieben(a: Auswahl, p: Pt, verlauf = false) {
  const s = st();
  const { foto, ebene } = aktuell(s);
  if (!foto) return;
  const ersetze = (liste: Pt[], i: number) => liste.map((q, j) => (j === i ? p : q));
  const i = a.index ?? 0;
  let f: ((d: Dokument) => Dokument) | null = null;
  if (a.art === 'hilfslinie') {
    f = mitFoto(foto.id, (x) => ({ ...x, hilfslinien: x.hilfslinien.map((l) => (l.id === a.id ? { ...l, punkte: ersetze(l.punkte, i) } : l)) }));
  } else if (ebene) {
    const linie = <T extends { id: string; a: Pt; b: Pt }>(l: T): T => (l.id === a.id ? { ...l, [i === 0 ? 'a' : 'b']: p } : l);
    f = mitEbene(foto.id, ebene.id, (e) => {
      switch (a.art) {
        case 'ecke':
          return { ...e, rechteck: { ...e.rechteck, ecken: ersetze(e.rechteck.ecken, i) } };
        case 'passpunkt':
          return { ...e, passpunkte: e.passpunkte.map((q) => (q.id === a.id ? { ...q, bild: p } : q)) };
        case 'waagerecht':
        case 'senkrecht':
          return { ...e, fluchtlinien: { ...e.fluchtlinien, [a.art]: e.fluchtlinien[a.art].map(linie) } };
        case 'mass':
          return { ...e, fluchtlinien: { ...e.fluchtlinien, masse: e.fluchtlinien.masse.map(linie) } };
        case 'messung':
          return { ...e, messungen: e.messungen.map((m) => (m.id === a.id ? { ...m, punkte: ersetze(m.punkte, i) } : m)) };
        default:
          return e;
      }
    });
  }
  if (f) s.aendern(f, verlauf);
}

/** Entfernt das ausgewählte Element (bei Messungen und Hilfslinien mit Punktwahl nur den Punkt, solange genug übrig bleiben) */
export function auswahlLoeschen() {
  const s = st();
  const a = s.auswahl;
  const { foto, ebene } = aktuell(s);
  if (!a || !foto || a.art === 'ecke') return;
  if (a.art === 'hilfslinie') {
    s.aendern(mitFoto(foto.id, (f) => ({ ...f, hilfslinien: f.hilfslinien.filter((l) => l.id !== a.id) })));
  } else if (ebene) {
    s.aendern(
      mitEbene(foto.id, ebene.id, (e) => {
        switch (a.art) {
          case 'ecke':
            // eine Ecke allein lässt sich nicht löschen (die Reihenfolge zählt) – „Ecken neu setzen“ löscht alle
            return e;
          case 'passpunkt':
            return { ...e, passpunkte: e.passpunkte.filter((q) => q.id !== a.id) };
          case 'waagerecht':
          case 'senkrecht':
            return { ...e, fluchtlinien: { ...e.fluchtlinien, [a.art]: e.fluchtlinien[a.art].filter((l) => l.id !== a.id) } };
          case 'mass':
            return { ...e, fluchtlinien: { ...e.fluchtlinien, masse: e.fluchtlinien.masse.filter((l) => l.id !== a.id) } };
          case 'messung': {
            const m = e.messungen.find((x) => x.id === a.id);
            const min = m?.art === 'flaeche' ? 3 : 2;
            if (m && a.index !== undefined && m.art !== 'strecke' && m.punkte.length > min) {
              return { ...e, messungen: e.messungen.map((x) => (x.id === a.id ? { ...x, punkte: x.punkte.filter((_, j) => j !== a.index) } : x)) };
            }
            return { ...e, messungen: e.messungen.filter((x) => x.id !== a.id) };
          }
          default:
            return e;
        }
      }),
    );
  }
  s.setze({ auswahl: null });
}

/** Foto- und entzerrte Ansicht wechseln (Taste E); entzerrt nur, wenn die Ebene entzerrbar ist */
export function ansichtUmschalten() {
  const s = st();
  const { foto, ebene } = aktuell(s);
  if (!foto || !ebene) return;
  const ziel = s.ansicht === 'foto' ? 'entzerrt' : 'foto';
  if (ziel === 'entzerrt' && !entzerrung(foto, ebene).ok) return;
  s.setze({ ansicht: ziel, werkzeug: 'auswahl', entwurf: [], auswahl: null });
}

/** Name des gewählten Elements für „… löschen“ – so, wie `auswahlLoeschen` es entfernt (einzelner Punkt oder Ganzes) */
export function auswahlName(): string | null {
  const s = st();
  const a = s.auswahl;
  const { foto, ebene } = aktuell(s);
  if (!a || !foto) return null;
  if (a.art === 'hilfslinie') return 'Hilfslinie';
  if (!ebene) return null;
  const nr = <T extends { id: string }>(liste: T[], k: string) => `${k}${liste.findIndex((x) => x.id === a.id) + 1}`;
  switch (a.art) {
    case 'ecke':
      return `Ecke ${ECKEN_KURZ[a.index ?? 0]}`;
    case 'passpunkt':
      return `Passpunkt ${nr(ebene.passpunkte, 'P')}`;
    case 'waagerecht':
      return `Waagerechte ${nr(ebene.fluchtlinien.waagerecht, 'W')}`;
    case 'senkrecht':
      return `Senkrechte ${nr(ebene.fluchtlinien.senkrecht, 'S')}`;
    case 'mass':
      return `Maß ${nr(ebene.fluchtlinien.masse, 'M')}`;
    case 'messung': {
      const m = ebene.messungen.find((x) => x.id === a.id);
      if (!m) return null;
      const min = m.art === 'flaeche' ? 3 : 2;
      return a.index !== undefined && m.art !== 'strecke' && m.punkte.length > min ? `Punkt von „${m.name}“` : `„${m.name}“`;
    }
  }
}

/** Kontextmenü der Zeichenfläche: bezieht sich auf das gewählte (bzw. eben rechts angeklickte) Element, Kürzel als Hinweis */
export function flaechenMenue(): MenuePunkt[] {
  const s = st();
  const { foto, ebene } = aktuell(s);
  const entzerrbar = !!foto && !!ebene && entzerrung(foto, ebene).ok;
  const ecke = s.auswahl?.art === 'ecke';
  const name = auswahlName();
  // der Löschpunkt steht am Ende: der erste Punkt hat den Fokus, Enter nach dem Rechtsklick soll nichts löschen
  return [
    { text: 'Alles zeigen', symbol: 'einpassen', hinweis: 'Pos1', deaktiviert: !foto, aktion: () => window.dispatchEvent(new Event('entz:einpassen')) },
    {
      text: s.ansicht === 'entzerrt' ? 'Foto zeigen' : 'Entzerrt zeigen',
      symbol: 'auge',
      hinweis: s.ansicht === 'foto' && !entzerrbar ? 'erst die Referenz vervollständigen' : 'E',
      deaktiviert: s.ansicht === 'foto' && !entzerrbar,
      aktion: ansichtUmschalten,
    },
    { trenner: true },
    { text: 'Rückgängig', symbol: 'rueckgaengig', hinweis: 'Strg+Z', deaktiviert: !s.vergangenheit.length, aktion: s.rueckgaengig },
    { text: 'Wiederholen', symbol: 'wiederholen', hinweis: 'Strg+Y', deaktiviert: !s.zukunft.length, aktion: s.wiederholen },
    { trenner: true },
    {
      text: name ? `${name} löschen` : 'Löschen',
      symbol: 'muell',
      hinweis: ecke ? 'Ecken über „Ecken neu setzen“' : name ? 'Entf' : 'nichts ausgewählt',
      deaktiviert: !name || ecke,
      gefahr: true,
      aktion: auswahlLoeschen,
    },
  ];
}
