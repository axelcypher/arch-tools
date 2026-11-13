import { create } from 'zustand';

/** Farbschema der Oberfläche: wie das System, hell oder dunkel (je Rechner gespeichert) */
export type ThemeWahl = 'system' | 'hell' | 'dunkel';
export type Theme = 'hell' | 'dunkel';

const KEY = 'flaechenrechner.theme';
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function readWahl(): ThemeWahl {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'hell' || v === 'dunkel' ? v : 'system';
  } catch {
    return 'system';
  }
}

const resolve = (w: ThemeWahl): Theme => (w === 'system' ? (media?.matches ? 'dunkel' : 'hell') : w);

const CANVAS_KEY = 'flaechenrechner.theme.canvasHell';
function readCanvasDunkel(): boolean {
  try {
    return localStorage.getItem(CANVAS_KEY) !== '1';
  } catch {
    return true;
  }
}

interface ThemeState {
  wahl: ThemeWahl;
  theme: Theme;
  /** im dunklen Schema auch die Zeichenfläche abdunkeln (sonst bleibt sie hell wie Papier) */
  canvasDunkel: boolean;
  setCanvasDunkel(v: boolean): void;
  setWahl(w: ThemeWahl): void;
  /** hell → dunkel → System → hell … */
  cycle(): void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  wahl: readWahl(),
  theme: resolve(readWahl()),
  canvasDunkel: readCanvasDunkel(),
  setCanvasDunkel(v) {
    try {
      if (v) localStorage.removeItem(CANVAS_KEY);
      else localStorage.setItem(CANVAS_KEY, '1');
    } catch {
      // nur für diese Sitzung
    }
    set({ canvasDunkel: v });
  },
  setWahl(w) {
    try {
      if (w === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, w);
    } catch {
      // ohne Speicher nur für diese Sitzung
    }
    set({ wahl: w, theme: resolve(w) });
  },
  cycle() {
    const order: ThemeWahl[] = ['hell', 'dunkel', 'system'];
    get().setWahl(order[(order.indexOf(get().wahl) + 1) % order.length]);
  },
}));

media?.addEventListener('change', () => {
  const s = useTheme.getState();
  if (s.wahl === 'system') useTheme.setState({ theme: resolve('system') });
});

/**
 * Ist die Zeichenfläche gerade gefiltert (`--canvas-filter`: dunkles Schema und „Zeichenfläche im dunklen Schema abdunkeln“)? Nur dann
 * werden Planfüllungen mit `planFuellungDunkel` vorgerechnet. Als Hook, damit die Zeichnung bei jedem Wechsel neu entsteht.
 */
export const useZeichenflaecheGefiltert = (): boolean => useTheme((s) => s.theme === 'dunkel' && s.canvasDunkel);

/** Schema am <html>-Element setzen (CSS: [data-theme="dunkel"]) */
export function applyTheme(t: Theme, canvasDunkel: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = t;
  document.documentElement.dataset.canvas = canvasDunkel ? 'dunkel' : 'hell';
  document.documentElement.style.colorScheme = t === 'dunkel' ? 'dark' : 'light';
}

/** aktuelles Schema anwenden – beim Start vor dem ersten Zeichnen (kein helles Aufblitzen) */
export function themeAnwenden(): void {
  const s = useTheme.getState();
  applyTheme(s.theme, s.canvasDunkel);
}

// Zentral für alle Apps: jede Änderung (Menü „Farbschema“, Systemschema, andere Fenster/Tabs) wirkt sofort – ohne Neustart
useTheme.subscribe((s, vorher) => {
  if (s.theme !== vorher.theme || s.canvasDunkel !== vorher.canvasDunkel) applyTheme(s.theme, s.canvasDunkel);
});

// Andere Fenster bzw. Tabs der Rahmen-App (gleicher Ursprung) ändern die Wahl im localStorage: übernehmen
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== KEY && e.key !== CANVAS_KEY) return;
    const wahl = readWahl();
    useTheme.setState({ wahl, theme: resolve(wahl), canvasDunkel: readCanvasDunkel() });
  });
}
