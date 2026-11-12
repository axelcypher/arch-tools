import { create } from 'zustand';
import { konfigAendern, konfigLesen } from '@core/platform/konfig';

/**
 * Einstellungen für „Mails“ im gemeinsamen Konfigurationsordner (Bereich `mails`, gilt fürs Büro): die eigenen
 * Domains bzw. Adressen – daran erkennt die App, ob eine Mail „von“ außen kam oder „an“ jemanden ging.
 */

export const BEREICH_MAILS = 'mails';

interface MailEinstellungen {
  /** eigene Domains („akh-architektur.de“) oder einzelne Adressen */
  eigene: string[];
}

const aus = (roh: unknown): MailEinstellungen => {
  const o = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
  const eigene = Array.isArray(o.eigene)
    ? [
        ...new Set(
          o.eigene
            .filter((x): x is string => typeof x === 'string')
            .map((x) => x.trim().toLowerCase().replace(/^@/, ''))
            .filter(Boolean),
        ),
      ]
    : [];
  return { eigene };
};

interface MailState extends MailEinstellungen {
  geladen: boolean;
  fehler: string | null;
  laden: () => Promise<void>;
  setEigene: (eigene: string[]) => Promise<void>;
}

export const useMails = create<MailState>()((set) => ({
  eigene: [],
  geladen: false,
  fehler: null,
  laden: async () => {
    try {
      set({ ...aus(await konfigLesen(BEREICH_MAILS)), geladen: true, fehler: null });
    } catch (e) {
      set({ geladen: true, fehler: `Einstellungen nicht lesbar: ${e instanceof Error ? e.message : String(e)}` });
    }
  },
  setEigene: async (eigene) => {
    const neu = aus({ eigene });
    set(neu);
    try {
      await konfigAendern(BEREICH_MAILS, (roh) => ({ ...((roh && typeof roh === 'object' ? roh : {}) as object), eigene: neu.eigene }));
    } catch (e) {
      set({ fehler: `Einstellungen nicht gespeichert: ${e instanceof Error ? e.message : String(e)}` });
    }
  },
}));

/**
 * Eigene Domain aus den Mails eines Projekts erraten: Das Büro ist an jeder Mail beteiligt – die Domain, die in den
 * meisten Mails als Absender oder Empfänger vorkommt (mindestens drei Mails, in mehr als der Hälfte).
 */
export function eigeneDomainRaten(mails: { domains: string[] }[]): string | null {
  if (mails.length < 3) return null;
  const zahl = new Map<string, number>();
  for (const m of mails) for (const d of new Set(m.domains.filter(Boolean))) zahl.set(d, (zahl.get(d) ?? 0) + 1);
  const [d, n] = [...zahl].sort((a, b) => b[1] - a[1])[0] ?? [];
  return d && n * 2 > mails.length ? d : null;
}
