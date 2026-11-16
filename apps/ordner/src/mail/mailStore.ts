import { create } from 'zustand';
import { konfigAendern, konfigLesen, konfigNeuLesen } from '@core/platform/konfig';
import type { Korrektur, Person } from './ursprung';

/**
 * Einstellungen für „Mails“ im gemeinsamen Konfigurationsordner (Bereich `mails`, gilt fürs Büro): die eigenen
 * Domains bzw. Adressen – daran erkennt die App, ob eine Mail „von“ außen kam oder „an“ jemanden ging – und die von
 * Hand korrigierten ursprünglichen Absender intern weitergeleiteter Mails. Dazu nur lesend die im Adressbuch von PERMIO
 * selbst angelegten bzw. geänderten Adressen (Bereich `formulare`, Eintrag `adressen` – die Adressen aus den
 * Projektkarten stehen dort nicht): Name und E-Mail zum Abgleich von Absendern, die in einer Weiterleitung nur mit Namen
 * stehen.
 */

export const BEREICH_MAILS = 'mails';

interface MailEinstellungen {
  /** eigene Domains („architekten-beispiel.example“) oder einzelne Adressen */
  eigene: string[];
}

/** Korrekturen aus dem gespeicherten Stand: nur gültige Einträge */
export function korrekturenAus(roh: unknown): Record<string, Korrektur> {
  const out: Record<string, Korrektur> = {};
  if (!roh || typeof roh !== 'object') return out;
  for (const [k, v] of Object.entries(roh as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    if (o.intern === true) out[k] = { intern: true };
    else if (typeof o.name === 'string' && typeof o.mail === 'string' && (o.name.trim() || o.mail.trim())) out[k] = { name: o.name.trim(), mail: o.mail.trim() };
  }
  return out;
}

/** Name und E-Mail aus den Adressen des gemeinsamen Adressbuchs (Einträge 30 Vorname, 40 Name/Firma, 170 E-Mail) */
export function adressbuchKontakte(roh: unknown): Person[] {
  if (!Array.isArray(roh)) return [];
  return roh.flatMap((a) => {
    const t = (a && typeof a === 'object' ? (a as Record<string, unknown>).texte : null) as Record<string, unknown> | null;
    if (!t || (a as Record<string, unknown>).ausgeblendet === true) return [];
    const text = (n: string) => (typeof t[n] === 'string' ? (t[n] as string).trim() : '');
    const mail = text('170');
    const name = [text('30'), text('40')].filter(Boolean).join(' ');
    return mail && name && /@/.test(mail) ? [{ name, mail }] : [];
  });
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
  /** von Hand korrigierte ursprüngliche Absender (Schlüssel: `mailSchluessel`) */
  korrekturen: Record<string, Korrektur>;
  /** Name und E-Mail aus dem gemeinsamen Adressbuch */
  adressbuch: Person[];
  geladen: boolean;
  fehler: string | null;
  laden: () => Promise<void>;
  setEigene: (eigene: string[]) => Promise<void>;
  /** Korrektur speichern bzw. mit `null` zurücknehmen */
  setKorrektur: (schluessel: string, k: Korrektur | null) => Promise<void>;
}

export const useMails = create<MailState>()((set, get) => ({
  eigene: [],
  korrekturen: {},
  adressbuch: [],
  geladen: false,
  fehler: null,
  laden: async () => {
    try {
      const roh = await konfigLesen(BEREICH_MAILS);
      set({ ...aus(roh), korrekturen: korrekturenAus((roh as Record<string, unknown> | null)?.korrekturen), geladen: true, fehler: null });
    } catch (e) {
      set({ geladen: true, fehler: `Einstellungen nicht lesbar: ${e instanceof Error ? e.message : String(e)}` });
    }
    try {
      set({ adressbuch: adressbuchKontakte(((await konfigLesen('formulare')) as Record<string, unknown> | null)?.adressen) });
    } catch {
      // Adressbuch nicht lesbar: dann gleicht die App Namen nur mit den Mails des Projekts ab
    }
  },
  setKorrektur: async (schluessel, k) => {
    const vorher = get().korrekturen;
    const lokal = { ...vorher };
    if (k) lokal[schluessel] = k;
    else delete lokal[schluessel];
    set({ korrekturen: lokal, fehler: null });
    try {
      const ergebnis = await konfigAendern(BEREICH_MAILS, (roh) => {
        const o = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
        const alle = korrekturenAus(o.korrekturen);
        if (k) alle[schluessel] = k;
        else delete alle[schluessel];
        return { ...o, korrekturen: alle };
      });
      set({ korrekturen: korrekturenAus(ergebnis.korrekturen) });
    } catch (e) {
      set({ korrekturen: vorher, fehler: `Korrektur nicht gespeichert: ${e instanceof Error ? e.message : String(e)}` });
    }
  },
  setEigene: async (eigene) => {
    // als Änderung gegenüber dem bisherigen Stand auf den frisch gelesenen anwenden – so bleiben Einträge erhalten, die
    // ein anderer Rechner inzwischen ergänzt hat
    const vorher = get().eigene;
    const neu = aus({ eigene });
    const dazu = neu.eigene.filter((x) => !vorher.includes(x));
    const weg = vorher.filter((x) => !neu.eigene.includes(x));
    set(neu);
    try {
      const ergebnis = await konfigAendern(BEREICH_MAILS, (roh) => {
        const o = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
        return { ...o, eigene: [...aus(o).eigene.filter((x) => !weg.includes(x)), ...dazu.filter((x) => !aus(o).eigene.includes(x))] };
      });
      set({ eigene: ergebnis.eigene });
    } catch (e) {
      // nicht gespeichert: wieder den gültigen Stand zeigen
      set({ eigene: vorher });
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

// Speicherort der Einstellungen gewechselt bzw. Netzlaufwerk weg oder wieder da: neu lesen (gelesen wird erst bei Bedarf)
konfigNeuLesen(() => {
  if (useMails.getState().geladen) void useMails.getState().laden();
});
