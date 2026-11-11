import type { Teil } from '../forma/projektkarte';
import { GRUNDSTUECK, PLZ_GRUNDSTUECK } from '../zusatz';

/**
 * Korrekturen der Zuordnung zur Projektkarte (versteckte Liste `lstbxProkarte` im Vordruck), wo der Vordruck aus
 * FORMA falsch oder unvollständig verknüpft ist. Die App ändert die Datei dabei nicht – sie liest die Zuordnung nur
 * anders:
 *  - `gruppe`: Verweise auf Beteiligte (Adressgruppen 2xx, alle mit denselben Einträgen 40 Name/Firma, 30 Vorname,
 *    70 Straße …) gehen an diese Gruppe
 *  - `teile`: das Feld bekommt diese Zuordnung (auch Felder, die FORMA gar nicht verknüpft)
 */
export type ZuordnungKorrektur = { felder: string[]; grund: string } & ({ gruppe: number } | { teile: Teil[] });

export const BAUHERR = 201;

const eintrag = (gruppe: number, id: number, auszug?: 'strasse' | 'hausnummer'): Teil => ({ art: 'eintrag', gruppe, id, trenner: '', ...(auszug ? { auszug } : {}) });
/** Straße/Nr. des Baugrundstücks (Projektkarte, Grundstück 20) */
const STRASSE_NR = 20;
const plz = (felder: string[]): ZuordnungKorrektur => ({
  felder,
  teile: [eintrag(GRUNDSTUECK, PLZ_GRUNDSTUECK)],
  grund: 'Postleitzahl des Baugrundstücks – in der Projektkarte von FORMA nicht vorgesehen, Ergänzung der App.',
});
/** Baustatistik: Straße und Hausnummer stehen in eigenen Feldern, die Projektkarte hat sie in einem Eintrag */
const strasseHausnummer = (strasse: string, hausnummer: string, postleitzahl: string): ZuordnungKorrektur[] => [
  { felder: [strasse], teile: [eintrag(GRUNDSTUECK, STRASSE_NR, 'strasse')], grund: 'Nur die Straße – die Hausnummer hat ein eigenes Feld.' },
  { felder: [hausnummer], teile: [eintrag(GRUNDSTUECK, STRASSE_NR, 'hausnummer')], grund: 'Hausnummer aus „Straße/Nr.“ des Grundstücks.' },
  plz([postleitzahl]),
];

/** je Formularkennung (alle Stände) */
export const ZUORDNUNG_KORREKTUREN: Record<string, ZuordnungKorrektur[]> = {
  // Angaben zur Artenschutzprüfung: Antragsteller/in ist die Bauherrschaft – der Vordruck befüllt die Felder
  // mit den Angaben einer anderen Beteiligten-Gruppe (Entwurfsverfasser); die PLZ des Bauvorhabens verknüpft er nicht
  nw020012: [
    {
      felder: ['0:Memo6', '0:Memo7', '0:Memo8', '0:Memo9', '0:Memo10', '0:Memo11'],
      gruppe: BAUHERR,
      grund: 'Antragsteller/in der Artenschutzangaben ist die Bauherrschaft.',
    },
    plz(['0:Memo4']),
  ],
  // Erhebungsbögen der Bautätigkeitsstatistik: Anschrift des Baugrundstücks bzw. Gebäudes
  nw010020: [...strasseHausnummer('0:Memo25', '0:Memo26', '0:Memo27'), ...strasseHausnummer('2:Memo25', '2:Memo26', '2:Memo27')],
  nw010021: strasseHausnummer('0:Memo25', '0:Memo26', '0:Memo27'),
  nw010022: strasseHausnummer('0:Memo5', '0:Memo34', '0:Memo35'),
};

const istBeteiligte = (gruppe: number) => gruppe >= 200 && gruppe < 300;

const korrekturFuer = (kennung: string | undefined, schluessel: string) => (kennung ? ZUORDNUNG_KORREKTUREN[kennung]?.find((x) => x.felder.includes(schluessel)) : undefined);

/** Zuordnung eines Felds mit Korrektur (`teile` = Zuordnung aus FORMA, leer, wenn es keine gibt) */
export function korrigiert(kennung: string | undefined, schluessel: string, teile: Teil[]): Teil[] {
  const k = korrekturFuer(kennung, schluessel);
  if (!k) return teile;
  if ('teile' in k) return k.teile;
  return teile.map((t) => (t.art === 'eintrag' && istBeteiligte(t.gruppe) ? { ...t, gruppe: k.gruppe } : t));
}

/** Felder eines Vordrucks, die nur durch eine Korrektur eine Zuordnung bekommen (FORMA verknüpft sie nicht) */
export function zusaetzlicheFelder(kennung: string | undefined): string[] {
  return kennung ? (ZUORDNUNG_KORREKTUREN[kennung] ?? []).filter((k) => 'teile' in k).flatMap((k) => k.felder) : [];
}
