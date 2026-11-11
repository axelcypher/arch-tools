import type { Teil } from '../forma/projektkarte';

/**
 * Korrekturen der Zuordnung zur Projektkarte (versteckte Liste `lstbxProkarte` im Vordruck), wo der Vordruck aus
 * FORMA auf die falsche Beteiligten-Gruppe verweist. Die App ändert die Datei dabei nicht – sie liest die Zuordnung
 * nur anders. Beteiligte (Adressgruppen 2xx) haben dieselben Einträge (40 Name/Firma, 30 Vorname, 70 Straße …),
 * deshalb genügt es, die Gruppe zu tauschen.
 */
export interface ZuordnungKorrektur {
  /** Feldschlüssel (`<Seite>:<Name>`) */
  felder: string[];
  /** Gruppe der Projektkarte, aus der die Felder stattdessen befüllt werden (201 = Bauherr) */
  gruppe: number;
  grund: string;
}

export const BAUHERR = 201;

/** je Formularkennung (alle Stände) */
export const ZUORDNUNG_KORREKTUREN: Record<string, ZuordnungKorrektur[]> = {
  // Angaben zur Artenschutzprüfung: Antragsteller/in ist die Bauherrschaft – der Vordruck befüllt die Felder
  // mit den Angaben einer anderen Beteiligten-Gruppe (Entwurfsverfasser)
  nw020012: [
    {
      felder: ['0:Memo6', '0:Memo7', '0:Memo8', '0:Memo9', '0:Memo10', '0:Memo11'],
      gruppe: BAUHERR,
      grund: 'Antragsteller/in der Artenschutzangaben ist die Bauherrschaft.',
    },
  ],
};

const istBeteiligte = (gruppe: number) => gruppe >= 200 && gruppe < 300;

/** Zuordnung eines Felds mit Korrektur: Verweise auf Beteiligten-Gruppen gehen an die richtige Gruppe */
export function korrigiert(kennung: string | undefined, schluessel: string, teile: Teil[]): Teil[] {
  const k = kennung ? ZUORDNUNG_KORREKTUREN[kennung]?.find((x) => x.felder.includes(schluessel)) : undefined;
  if (!k) return teile;
  return teile.map((t) => (t.art === 'eintrag' && istBeteiligte(t.gruppe) ? { ...t, gruppe: k.gruppe } : t));
}
