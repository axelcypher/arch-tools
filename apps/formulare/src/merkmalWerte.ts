/**
 * Werte der Projektmerkmale für das offene Formular. Mit Projekt (Desktop) stehen sie in der Projektdatei (.oap,
 * `meta.merkmale`) und gelten für alle Formulare des Projekts. Ohne Projekt (Web-Version, Formular per „Formular
 * öffnen …“) gibt es keine Projektdatei: Dann gelten sie je Datei und liegen im lokalen Speicher des Browsers (U-02).
 */
import { create } from 'zustand';
import { useAntrag } from './antragStore';
import type { OffenesFormular } from './store';

const LEER: Record<string, string> = {};
const SPEICHER = 'formulare:merkmale-datei';

type Werte = Record<string, Record<string, string>>;

function laden(): Werte {
  try {
    const roh = JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') as unknown;
    if (!roh || typeof roh !== 'object') return {};
    const out: Werte = {};
    for (const [k, v] of Object.entries(roh as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const m = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string' && !!e[1]));
      if (Object.keys(m).length) out[k] = m;
    }
    return out;
  } catch {
    return {};
  }
}

interface DateiMerkmale {
  /** Schlüssel der Datei (`datei|<Name>`) → Merkmale */
  werte: Werte;
  setzen: (datei: string, name: string, wert: string) => void;
  /** neu aus dem lokalen Speicher lesen */
  neuLesen: () => void;
}

/** Merkmale je Datei (ohne Projekt) */
export const useDateiMerkmale = create<DateiMerkmale>((set, get) => ({
  werte: laden(),
  setzen: (datei, name, wert) => {
    const m = { ...get().werte[datei] };
    if (wert) m[name] = wert;
    else delete m[name];
    const werte = { ...get().werte };
    if (Object.keys(m).length) werte[datei] = m;
    else delete werte[datei];
    set({ werte });
    try {
      localStorage.setItem(SPEICHER, JSON.stringify(werte));
    } catch {
      // ohne Speicher gelten sie nur bis zum Neuladen
    }
  },
  neuLesen: () => set({ werte: laden() }),
}));

/** Schlüssel einer Datei ohne Projekt */
const dateiSchluessel = (o: Pick<OffenesFormular, 'pfad'>) => `datei|${o.pfad}`;

/** Projektmerkmale (Name → Wert), die für die Bedingungen des offenen Formulars gelten */
export function useMerkmalWerte(offen: Pick<OffenesFormular, 'projekt' | 'pfad'> | null): Record<string, string> {
  const projekt = useAntrag((s) => s.projektdatei?.merkmale);
  const datei = useDateiMerkmale((s) => (offen && !offen.projekt ? s.werte[dateiSchluessel(offen)] : undefined));
  return (offen && !offen.projekt ? datei : projekt) ?? LEER;
}

/** wie useMerkmalWerte, außerhalb von Komponenten */
export function merkmalWerteVon(offen: Pick<OffenesFormular, 'projekt' | 'pfad'> | null): Record<string, string> {
  if (offen && !offen.projekt) return useDateiMerkmale.getState().werte[dateiSchluessel(offen)] ?? LEER;
  return useAntrag.getState().projektdatei?.merkmale ?? LEER;
}

/** Merkmal festlegen: im Projekt (Projektdatei, gilt für alle Formulare) bzw. ohne Projekt für diese Datei */
export async function merkmalFestlegen(offen: Pick<OffenesFormular, 'projekt' | 'pfad'>, name: string, wert: string): Promise<void> {
  if (offen.projekt) await useAntrag.getState().merkmalSetzen(name, wert);
  else useDateiMerkmale.getState().setzen(dateiSchluessel(offen), name, wert);
}
