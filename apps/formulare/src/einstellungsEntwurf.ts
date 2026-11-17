import { create } from 'zustand';
import { einstellungenEntwurfMelden, type SeitenEntwurf } from '@core/ui/Einstellungen';
import { katalogAus, vorlagenAus, type AntragsVorlage, type ExportEinstellungen, type KatalogEintrag } from './antrag';
import { useAntrag } from './antragStore';
import { merkmaleAus, type Merkmal } from './bedingung';
import { useFormulare } from './store';

/**
 * Entwurf der Seite „PERMIO“ im zentralen Einstellungsdialog (docs/design.md, „Einstellungen“): Die Felder ändern
 * nur den Entwurf; erst „Übernehmen“ schreibt ihn mit den bisherigen Settern der Stores – Speicherorte und Schlüssel
 * bleiben damit dieselben wie im früheren eigenen Dialog. Ohne Änderung gilt der Wert der Stores.
 */

export interface EntwurfWerte {
  /** Ordner mit Formularprojekten */
  projektordner: string[];
  /** angezeigte Pfade im Projektordner (Vorgabe) */
  vorgabeAuswahl: string[];
  /** Vorgabe-Adresse je Rolle (Gruppe → Schlüssel im Adressbuch) */
  rollenVorgaben: Record<string, string>;
  /** Formulare, deren Gliederung zurückgesetzt wird */
  profileZurueck: string[];
  arten: string[];
  ziel: ExportEinstellungen['ziel'];
  merkmale: Merkmal[];
  katalog: KatalogEintrag[];
  vorlagen: AntragsVorlage[];
}
export type EntwurfSchluessel = keyof EntwurfWerte;

type FormularState = ReturnType<typeof useFormulare.getState>;
type AntragState = ReturnType<typeof useAntrag.getState>;

const AUS_FORMULARE: Partial<{ [K in EntwurfSchluessel]: (s: FormularState) => EntwurfWerte[K] }> = {
  projektordner: (s) => s.projektordner,
  vorgabeAuswahl: (s) => s.vorgabeAuswahl,
  rollenVorgaben: (s) => s.rollenVorgaben,
};
const KEINE: string[] = [];
const AUS_ANTRAG: Partial<{ [K in EntwurfSchluessel]: (s: AntragState) => EntwurfWerte[K] }> = {
  arten: (s) => s.einstellungen.arten,
  ziel: (s) => s.einstellungen.ziel,
  merkmale: (s) => s.merkmalDefinitionen,
  katalog: (s) => s.katalog,
  vorlagen: (s) => s.vorlagen,
};

/** was gilt (ohne Entwurf) */
function gespeichert<K extends EntwurfSchluessel>(k: K): EntwurfWerte[K] {
  const f = AUS_FORMULARE[k];
  if (f) return f(useFormulare.getState());
  const a = AUS_ANTRAG[k];
  if (a) return a(useAntrag.getState());
  return KEINE as EntwurfWerte[K];
}

interface EntwurfState {
  werte: Partial<EntwurfWerte>;
  /** auf die Vorgabe der App zurückgesetzt („Vorgabe wiederherstellen“) – wird mit `null` übernommen */
  vorgabe: EntwurfSchluessel[];
  /** auch ohne Unterschied zu schreiben (z. B. nie gespeicherte, nur abgeleitete Vorlagen festschreiben) */
  fest: EntwurfSchluessel[];
}

export const useEntwurf = create<EntwurfState>(() => ({ werte: {}, vorgabe: [], fest: [] }));

/** Vorgabe der App für einen Wert, der sich zurücksetzen lässt */
function vorgabeWert(k: 'merkmale' | 'katalog' | 'vorlagen'): EntwurfWerte[typeof k] {
  if (k === 'merkmale') return merkmaleAus(null);
  if (k === 'katalog') return katalogAus(null);
  return vorlagenAus(null, entwurfWert('katalog'));
}

/** Wert im Entwurf, sonst der gespeicherte */
export function entwurfWert<K extends EntwurfSchluessel>(k: K): EntwurfWerte[K] {
  return (useEntwurf.getState().werte[k] as EntwurfWerte[K] | undefined) ?? gespeichert(k);
}

/** Hook: Wert im Entwurf, sonst der gespeicherte – zeichnet bei beidem neu */
export function useEntwurfWert<K extends EntwurfSchluessel>(k: K): EntwurfWerte[K] {
  const imEntwurf = useEntwurf((s) => s.werte[k]) as EntwurfWerte[K] | undefined;
  const f = AUS_FORMULARE[k];
  const a = AUS_ANTRAG[k];
  const ausFormulare = useFormulare((s) => (f ? f(s) : undefined));
  const ausAntrag = useAntrag((s) => (a ? a(s) : undefined));
  return imEntwurf ?? ((ausFormulare ?? ausAntrag ?? KEINE) as EntwurfWerte[K]);
}

/**
 * Wert in den Entwurf setzen; `null` = Vorgabe der App (nur Merkmale, Katalog und Vorlagen). `festschreiben`: mit
 * „Übernehmen“ auch dann schreiben, wenn er dem gespeicherten gleicht.
 */
export function entwurfSetzen<K extends EntwurfSchluessel>(k: K, wert: EntwurfWerte[K] | null, festschreiben = false): void {
  useEntwurf.setState((s) => {
    const fest = festschreiben ? [...s.fest.filter((x) => x !== k), k] : s.fest;
    if (wert === null) {
      if (k !== 'merkmale' && k !== 'katalog' && k !== 'vorlagen') return s;
      return { werte: { ...s.werte, [k]: vorgabeWert(k) }, vorgabe: [...s.vorgabe.filter((x) => x !== k), k], fest: fest.filter((x) => x !== k) };
    }
    const werte: Partial<EntwurfWerte> = { ...s.werte, [k]: wert };
    // Vorlagen auf Vorgabe: sie leiten sich aus dem Katalog ab – mit dem neuen Katalog neu ableiten
    if (k === 'katalog' && s.vorgabe.includes('vorlagen')) werte.vorlagen = vorlagenAus(null, wert as KatalogEintrag[]);
    return { werte, vorgabe: s.vorgabe.filter((x) => x !== k), fest };
  });
  einstellungenEntwurfMelden();
}

/** gleiche Werte – Objekte unabhängig von der Reihenfolge der Schlüssel */
export function gleich(a: unknown, b: unknown): boolean {
  const sortiert = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(sortiert)
      : x && typeof x === 'object'
        ? Object.fromEntries(
            Object.entries(x as Record<string, unknown>)
              .filter(([, v]) => v !== undefined)
              .sort(([p], [q]) => p.localeCompare(q))
              .map(([p, v]) => [p, sortiert(v)]),
          )
        : x;
  return JSON.stringify(sortiert(a)) === JSON.stringify(sortiert(b));
}

/** geänderte Werte des Entwurfs (gegenüber dem Gespeicherten) */
export function entwurfAenderungen(): EntwurfSchluessel[] {
  const { werte, vorgabe, fest } = useEntwurf.getState();
  return (Object.keys(werte) as EntwurfSchluessel[]).filter((k) => vorgabe.includes(k) || fest.includes(k) || !gleich(werte[k], gespeichert(k)));
}

/**
 * Entwurf mit den bisherigen Settern schreiben – Reihenfolge: Katalog vor den Vorlagen (deren Vorgabe hängt davon ab).
 * Scheitert ein Schritt (z. B. ein Ordner ist nicht lesbar), bleiben die schon geschriebenen Werte geschrieben; der
 * Entwurf bleibt stehen, der Dialog meldet den Fehler, und ein erneutes „Übernehmen“ schreibt nur noch den Rest.
 */
export async function entwurfUebernehmen(): Promise<void> {
  const { werte, vorgabe } = useEntwurf.getState();
  const geaendert = new Set(entwurfAenderungen());
  const f = useFormulare.getState();
  const a = useAntrag.getState();
  // auf Vorgabe gesetzt und danach nicht mehr geändert (jede spätere Änderung nimmt den Schlüssel aus `vorgabe`)
  const zurueck = (k: EntwurfSchluessel) => vorgabe.includes(k);

  if (geaendert.has('projektordner') && werte.projektordner) {
    const neu = werte.projektordner;
    for (const p of f.projektordner.filter((x) => !neu.includes(x))) await useFormulare.getState().ordnerEntfernen(p);
    for (const p of neu.filter((x) => !useFormulare.getState().projektordner.includes(x))) await useFormulare.getState().ordnerHinzufuegen(p);
  }
  if (geaendert.has('vorgabeAuswahl') && werte.vorgabeAuswahl) f.setVorgabeAuswahl(werte.vorgabeAuswahl);
  if (geaendert.has('rollenVorgaben') && werte.rollenVorgaben) {
    const neu = werte.rollenVorgaben;
    const alt = f.rollenVorgaben;
    for (const g of new Set([...Object.keys(alt), ...Object.keys(neu)])) if (alt[g] !== neu[g]) f.setRollenVorgabe(Number(g), neu[g] ?? null);
  }
  if (geaendert.has('profileZurueck')) for (const k of werte.profileZurueck ?? []) f.profilSetzen(k, null);
  const teil: Partial<ExportEinstellungen> = {};
  if (geaendert.has('arten') && werte.arten) teil.arten = werte.arten;
  if (geaendert.has('ziel') && werte.ziel) teil.ziel = werte.ziel;
  if (Object.keys(teil).length) a.setEinstellungen(teil);
  if (geaendert.has('merkmale') && werte.merkmale) a.setMerkmalDefinitionen(zurueck('merkmale') ? null : werte.merkmale);
  if (geaendert.has('katalog') && werte.katalog) a.setKatalog(zurueck('katalog') ? null : werte.katalog);
  if (geaendert.has('vorlagen') && werte.vorlagen) a.setVorlagen(zurueck('vorlagen') ? null : werte.vorlagen);
  useEntwurf.setState({ werte: {}, vorgabe: [], fest: [] });
}

export function entwurfVerwerfen(): void {
  useEntwurf.setState({ werte: {}, vorgabe: [], fest: [] });
}

/** Anbindung an den zentralen Dialog */
export const PERMIO_ENTWURF: SeitenEntwurf = {
  geaendert: () => entwurfAenderungen().length > 0,
  uebernehmen: entwurfUebernehmen,
  verwerfen: entwurfVerwerfen,
};
