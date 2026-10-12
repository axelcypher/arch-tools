import type { Entzerrung } from './geo/ebene';
import { zuEbene, zuFoto } from './geo/ebene';
import { mul } from './geo/mat';
import type { Mat3, Pt } from './geo/mat';
import { entzeichnen, kamera, ohneVerzeichnung, verzeichnen } from './geo/verzeichnung';
import type { Kamera } from './geo/verzeichnung';
import type { Bereich, Foto } from './model';

/**
 * Bildschirmabbildung der Arbeitsfläche. `skala` in Bildschirmpixeln je Einheit; Einheit ist in der
 * Fotoansicht ein Fotopixel (y nach unten), in der entzerrten Ansicht ein Meter (y nach oben).
 */
export interface Sicht {
  skala: number;
  ox: number;
  oy: number;
}

export interface Abbildung {
  /** Fotopunkt (verzeichnet, px) → Bildschirm; null hinter dem Horizont */
  zuSchirm: (p: Pt) => Pt | null;
  /** Bildschirm → Fotopunkt (verzeichnet, px); null hinter dem Horizont */
  vonSchirm: (s: Pt) => Pt | null;
  /** für den Shader: Bildschirm → idealer Fotopunkt */
  gl: Mat3;
  kamera: Kamera;
  /** nur entzerrte Ansicht: Ebene (m) ↔ Bildschirm */
  ebeneZuSchirm?: (q: Pt) => Pt;
  schirmZuEbene?: (s: Pt) => Pt;
}

export function fotoAbbildung(foto: Foto, sicht: Sicht, korrigiert: boolean): Abbildung {
  const kam = kamera(foto.breite, foto.hoehe, foto.linse);
  const mitLinse = korrigiert && !ohneVerzeichnung(kam);
  const { skala, ox, oy } = sicht;
  const schirmZuFoto: Mat3 = [1 / skala, 0, -ox / skala, 0, 1 / skala, -oy / skala, 0, 0, 1];
  return {
    zuSchirm: (p) => {
      const u = mitLinse ? entzeichnen(kam, p) : p;
      return { x: ox + skala * u.x, y: oy + skala * u.y };
    },
    vonSchirm: (s) => {
      const u = { x: (s.x - ox) / skala, y: (s.y - oy) / skala };
      return mitLinse ? verzeichnen(kam, u) : u;
    },
    gl: schirmZuFoto,
    kamera: mitLinse ? kam : { ...kam, k1: 0, k2: 0 },
  };
}

export function ebenenAbbildung(e: Entzerrung, sicht: Sicht): Abbildung {
  const { skala, ox, oy } = sicht;
  const ebeneZuSchirm = (q: Pt) => ({ x: ox + skala * q.x, y: oy - skala * q.y });
  const schirmZuEbene = (s: Pt) => ({ x: (s.x - ox) / skala, y: (oy - s.y) / skala });
  const schirmZuEbeneM: Mat3 = [1 / skala, 0, -ox / skala, 0, -1 / skala, oy / skala, 0, 0, 1];
  return {
    zuSchirm: (p) => {
      const q = zuEbene(e, p);
      return q.w > 0 ? ebeneZuSchirm(q) : null;
    },
    vonSchirm: (s) => {
      const p = zuFoto(e, schirmZuEbene(s));
      return p.w > 0 ? p : null;
    },
    gl: mul(e.hInv, schirmZuEbeneM),
    kamera: e.kamera,
    ebeneZuSchirm,
    schirmZuEbene,
  };
}

/** Sicht, die den Bereich mit Rand in die Fläche einpasst */
export function einpassen(b: Bereich, breite: number, hoehe: number, yNachOben: boolean, rand = 24): Sicht {
  const w = Math.max(b.x1 - b.x0, 1e-9);
  const h = Math.max(b.y1 - b.y0, 1e-9);
  const skala = Math.max(1e-9, Math.min((breite - 2 * rand) / w, (hoehe - 2 * rand) / h));
  const ox = breite / 2 - skala * (b.x0 + w / 2);
  const oy = yNachOben ? hoehe / 2 + skala * (b.y0 + h / 2) : hoehe / 2 - skala * (b.y0 + h / 2);
  return { skala, ox, oy };
}

/** Zoomt um einen Bildschirmpunkt */
export function zoomen(s: Sicht, faktor: number, um: Pt): Sicht {
  return { skala: s.skala * faktor, ox: um.x - (um.x - s.ox) * faktor, oy: um.y - (um.y - s.oy) * faktor };
}
