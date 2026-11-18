import type { Teil } from '../forma/projektkarte';
import { GRUNDSTUECK, PLZ_GRUNDSTUECK } from '../zusatz';

/**
 * Korrekturen der Zuordnung zur Projektkarte (versteckte Liste `lstbxProkarte` im Vordruck), wo der Vordruck aus
 * FORMA falsch oder unvollständig verknüpft ist. Die App ändert die Datei dabei nicht – sie liest die Zuordnung nur
 * anders:
 *  - `gruppe`: Verweise auf Beteiligte (Adressgruppen 2xx, alle mit denselben Einträgen 40 Name/Firma, 30 Vorname,
 *    70 Straße …) gehen an diese Gruppe
 *  - `teile`: das Feld bekommt diese Zuordnung (auch Felder, die FORMA gar nicht verknüpft)
 *  - `titel`: das Feld bekommt den Eintrag der Projektkarte mit diesem Titel – nur, wenn die Zuordnung aus FORMA keinen
 *    Eintrag trifft, den die Projektkarte hat (Vordruck ohne Verknüpfung oder mit einer Nummer, die die Projektkarte
 *    des Projekts nicht führt). Die Nummer solcher Einträge ist nicht in allen Projektkarten gleich, der Titel schon.
 */
export type ZuordnungKorrektur = { felder: string[]; grund: string } & ({ gruppe: number } | { teile: Teil[] } | { titel: string });

export const BAUHERR = 201;

const eintrag = (gruppe: number, id: number, auszug?: 'strasse' | 'hausnummer'): Teil => ({ art: 'eintrag', gruppe, id, trenner: '', ...(auszug ? { auszug } : {}) });
/** Straße/Nr. des Baugrundstücks (Projektkarte, Grundstück 20) */
const STRASSE_NR = 20;
const plz = (felder: string[]): ZuordnungKorrektur => ({
  felder,
  teile: [eintrag(GRUNDSTUECK, PLZ_GRUNDSTUECK)],
  grund: 'Postleitzahl des Baugrundstücks – in der Projektkarte nicht vorgesehen, Ergänzung der App.',
});
/** Gemarkung des Baugrundstücks (Projektkarte, Grundstück 40) */
const GEMARKUNG = 40;
/** Baustatistik: „Gemeindeteil“ bekommt die Gemarkung – Vorgabe des Büros (fachlich nicht immer dasselbe; ein eigener Eintrag bleibt) */
const gemeindeteil = (felder: string[]): ZuordnungKorrektur => ({
  felder,
  teile: [eintrag(GRUNDSTUECK, GEMARKUNG)],
  grund: 'Gemeindeteil aus der Gemarkung des Grundstücks – Vorgabe des Büros, im Vordruck nicht verknüpft.',
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
  nw010020: [...strasseHausnummer('0:Memo25', '0:Memo26', '0:Memo27'), ...strasseHausnummer('2:Memo25', '2:Memo26', '2:Memo27'), gemeindeteil(['0:Memo30', '2:Memo30'])],
  nw010021: [...strasseHausnummer('0:Memo25', '0:Memo26', '0:Memo27'), gemeindeteil(['0:Memo30'])],
  nw010022: [...strasseHausnummer('0:Memo5', '0:Memo34', '0:Memo35'), gemeindeteil(['0:Memo47'])],
  // Baubeschreibung (Anlage I/7), Nr. 2: der Vordruck verknüpft das Feld nicht mit der Art der Nutzung der Projektkarte
  nw010010: [{ felder: ['0:Memo5'], titel: 'Art der Nutzung', grund: 'Nr. 2 Art der Nutzung aus der Projektkarte – im Vordruck nicht verknüpft, Ergänzung der App.' }],
};

const istBeteiligte = (gruppe: number) => gruppe >= 200 && gruppe < 300;

const korrekturFuer = (kennung: string | undefined, schluessel: string) => (kennung ? ZUORDNUNG_KORREKTUREN[kennung]?.find((x) => x.felder.includes(schluessel)) : undefined);

/** Zuordnung eines Felds mit Korrektur (`teile` = Zuordnung aus FORMA, leer, wenn es keine gibt) */
export function korrigiert(kennung: string | undefined, schluessel: string, teile: Teil[]): Teil[] {
  const k = korrekturFuer(kennung, schluessel);
  if (!k || 'titel' in k) return teile;
  if ('teile' in k) return k.teile;
  return teile.map((t) => (t.art === 'eintrag' && istBeteiligte(t.gruppe) ? { ...t, gruppe: k.gruppe } : t));
}

/** Felder eines Vordrucks, die durch eine Korrektur eine Zuordnung bekommen können (auch ohne Verknüpfung in FORMA) */
export function zusaetzlicheFelder(kennung: string | undefined): string[] {
  return kennung ? (ZUORDNUNG_KORREKTUREN[kennung] ?? []).filter((k) => !('gruppe' in k)).flatMap((k) => k.felder) : [];
}

/** Titel des Eintrags, den ein Feld ersatzweise bekommt (Korrektur `titel`), sonst undefined */
export function ersatzTitel(kennung: string | undefined, schluessel: string): string | undefined {
  const k = korrekturFuer(kennung, schluessel);
  return k && 'titel' in k ? k.titel : undefined;
}
