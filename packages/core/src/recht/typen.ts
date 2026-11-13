/**
 * Rechtsstand: Fassungen von Gesetzen, Verordnungen und Satzungen, wie sie aus den amtlichen Quellen geholt werden.
 * Eine Fassung wird einmal geschrieben und nie geändert; ihre Prüfsummen je Absatz zeigen, was sich gegenüber einer
 * anderen Fassung geändert hat (siehe docs/baurecht-konzept.md, Abschnitt 4).
 */

import type { Gesetz } from './index';

/** Woher der Text einer Norm kommt (steht in den Modulen des Regelpakets) */
export type QuellenRef =
  /** Rechtsinformationssystem des Bundes: Werk-ELI, z. B. eli/bund/bgbl-1/1962/s429 */
  | { art: 'ris'; eli: string; /** Rückfall auf gesetze-im-internet.de, solange das RIS das Werk nicht führt */ gii?: string }
  /** gesetze-im-internet.de: Pfad, z. B. bbaug */
  | { art: 'gii'; pfad: string }
  /** recht.nrw.de: stabiler Link „aktuellste Fassung“ (Term-ID), ersatzweise feste Adresse */
  | { art: 'recht-nrw'; term?: number; url?: string }
  /** eine Datei (Ortsrecht): PDF oder HTML; `textebene: false` = Scan, Text aus dem Regelpaket (`text`) */
  | { art: 'datei'; url: string; format: 'pdf' | 'html'; textebene?: boolean; text?: string; sha256?: string }
  /** Stammfassung plus Änderungen; je Paragraf zählt das jüngste Dokument, das ihn enthält */
  | { art: 'zusammengesetzt'; teile: { url: string; format: 'pdf' | 'html'; fassung: string }[] }
  /** Muster-Verwaltungsvorschrift Technische Baubestimmungen: Bekanntmachungsseite des DIBt */
  | { art: 'mvvtb'; seite: string; /** Monate bis zur Geltung im Land (NRW: 6) */ monate: number }
  /** nur Fundstelle (z. B. DIN-Norm): kein Text */
  | { art: 'verweis'; url?: string };

/** Eine Fassung einer Norm mit Prüfsummen */
export interface Fassung extends Gesetz {
  /** gültig ab (JJJJ-MM-TT); bei gesetze-im-internet.de der Stand der Datei */
  gueltigAb: string;
  /** gültig bis (JJJJ-MM-TT), wenn bekannt – auch bei aufgehobenen Normen */
  gueltigBis?: string;
  aufgehoben?: string;
  /** Zeitpunkt des Abrufs (ISO) */
  abgerufen: string;
  quelle: QuellenRef;
  /** Prüfsumme (8 Hex-Zeichen) je Paragraf (`6`) und je Absatz (`6/1`) */
  summen: Record<string, string>;
  /** künftige Fassungen, die die Quelle schon kennt */
  kuenftige?: { gueltigAb: string; url: string }[];
  /** Kennung der Fassung bei der Quelle (ELI-Ausdruck, URL der Fassung, SHA-256 der Datei) */
  kennung: string;
  /** für den nächsten Abruf: ETag bzw. Last-Modified der Quelle */
  etag?: string;
  geaendert?: string;
  /** Text aus Texterkennung, noch nicht von Hand durchgesehen */
  texterkennung?: boolean;
}

/** Was sich zwischen zwei Fassungen geändert hat – je Absatz (`6/1`) bzw. Paragraf ohne Absätze (`6`) */
export interface Aenderungen {
  geaendert: string[];
  neu: string[];
  weggefallen: string[];
}
