import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { logger } from '../platform/log';
import { oeffnenFehlerText, technischText } from '../platform/dateiFehler';
import { Modal } from './Dialog';

/**
 * Rückfragen und Meldungen aller Apps – statt `window.confirm`/`window.alert` (blockieren die Seite, nur OK/Abbrechen):
 *  - `aenderungenSpeichern`: „Änderungen an ‚X‘ speichern?“ mit Speichern / Nicht speichern / Abbrechen
 *  - `bestaetigen`: destruktive Aktion, z. B. „Ersetzen / Abbrechen“
 *  - `frageText`: Rückfrage mit Eingabe (z. B. neuer Name)
 *  - `meldung`: Hinweis mit OK, technische Einzelheiten aufklappbar (und im Protokoll)
 * Angezeigt werden sie von `RueckfrageHost` (steckt in der Titelleiste, also in jeder App). Esc = Abbrechen.
 */

const log = logger('rueckfrage');

export interface Knopf<T extends string> {
  id: T;
  label: string;
  art?: 'primary' | 'danger';
}

interface Frage {
  titel: string;
  text?: string;
  /** technische Einzelheiten, aufklappbar */
  details?: string;
  /** mit Eingabefeld (Vorgabewert) */
  wert?: string;
  knoepfe: Knopf<string>[];
  antwort: (id: string | null, wert?: string) => void;
}

const useFragen = create<{ liste: Frage[]; dazu(f: Frage): void; weg(f: Frage): void }>((set) => ({
  liste: [],
  dazu: (f) => set((s) => ({ liste: [...s.liste, f] })),
  weg: (f) => set((s) => ({ liste: s.liste.filter((x) => x !== f) })),
}));

/** Allgemeine Rückfrage: liefert die id des gewählten Knopfs, null bei Esc bzw. Klick daneben */
export function fragen<T extends string>(f: { titel: string; text?: string; details?: string; knoepfe: Knopf<T>[] }): Promise<T | null> {
  return new Promise((antwort) => useFragen.getState().dazu({ ...f, antwort: (id) => antwort(id as T | null) }));
}

/** Bestätigung einer (destruktiven) Aktion; true bei OK */
export async function bestaetigen(titel: string, text: string, ok = 'OK', gefahr = false): Promise<boolean> {
  const a = await fragen({
    titel,
    text,
    knoepfe: [
      { id: 'abbrechen', label: 'Abbrechen' },
      { id: 'ok', label: ok, art: gefahr ? 'danger' : 'primary' },
    ],
  });
  return a === 'ok';
}

/** Rückfrage mit Eingabe; liefert den Text oder null bei Abbruch */
export function frageText(titel: string, wert: string, ok = 'OK', text?: string): Promise<string | null> {
  return new Promise((antwort) =>
    useFragen.getState().dazu({
      titel,
      text,
      wert,
      knoepfe: [
        { id: 'abbrechen', label: 'Abbrechen' },
        { id: 'ok', label: ok, art: 'primary' },
      ],
      antwort: (id, w) => antwort(id === 'ok' ? (w ?? '').trim() : null),
    }),
  );
}

/** Satz der Rückfrage bei ungespeicherten Änderungen, wenn die App keinen eigenen meldet (docs/design.md) */
export const UNGESPEICHERT_ALLGEMEIN = 'Das Projekt hat ungespeicherte Änderungen.';

/**
 * Ungespeicherte Änderungen vor einer Aktion (Öffnen, Neu, Beenden): „Speichern“ speichert und erlaubt die Aktion nur,
 * wenn das Speichern gelungen ist; „Nicht speichern“ verwirft; „Abbrechen“ (auch Esc) lässt die Aktion aus.
 * Liefert true, wenn die Aktion ausgeführt werden darf.
 */
export async function aenderungenSpeichern(name: string, speichern: () => Promise<boolean | void> | boolean | void, text?: string): Promise<boolean> {
  const a = await fragen({
    titel: `Änderungen an „${name || 'Unbenannt'}“ speichern?`,
    text: text ?? UNGESPEICHERT_ALLGEMEIN,
    knoepfe: [
      { id: 'abbrechen', label: 'Abbrechen' },
      { id: 'verwerfen', label: 'Nicht speichern' },
      { id: 'speichern', label: 'Speichern', art: 'primary' },
    ],
  });
  if (a === 'verwerfen') return true;
  if (a !== 'speichern') return false;
  try {
    return (await speichern()) !== false;
  } catch (e) {
    log.error('Speichern vor der Aktion fehlgeschlagen', e);
    await meldung('Speichern fehlgeschlagen', `Die Änderungen ließen sich nicht speichern. Das Projekt bleibt geöffnet.`, e);
    return false;
  }
}

/** Technischer Text eines Fehlers (für die aufklappbaren Einzelheiten) */
export const fehlerText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Gemeinsame Meldung, wenn sich eine Datei nicht öffnen ließ: „Die Datei … ließ sich nicht lesen (Grund). Das geöffnete
 * Projekt bleibt unverändert.“ – technische Einzelheiten aufklappbar und im Protokoll.
 */
export function oeffnenFehlgeschlagen(e: unknown, datei?: string, bleibt?: string): Promise<void> {
  return meldung('Datei ließ sich nicht öffnen', oeffnenFehlerText(e, datei, bleibt), technischText(e));
}

/** Meldung mit OK; `details` (z. B. ein Fehler) aufklappbar und im Protokoll */
export async function meldung(titel: string, text: string, details?: unknown): Promise<void> {
  const d = details === undefined ? undefined : typeof details === 'string' ? details : technischText(details);
  if (d) log.warn(`${titel}: ${text}`, d);
  await fragen({ titel, text, details: d, knoepfe: [{ id: 'ok', label: 'OK', art: 'primary' }] });
}

/** Stelle für Rückfragen und Meldungen – einmal je App (steckt in der Titelleiste) */
export function RueckfrageHost() {
  const liste = useFragen((s) => s.liste);
  const frage = liste.at(-1);
  return frage ? <RueckfrageDialog key={liste.length} frage={frage} /> : null;
}

function RueckfrageDialog({ frage }: { frage: Frage }) {
  const [wert, setWert] = useState(frage.wert ?? '');
  const feld = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = feld.current;
    if (!el) return;
    el.focus();
    // Namen ohne Endung markieren
    const punkt = (frage.wert ?? '').lastIndexOf('.');
    el.setSelectionRange(0, punkt > 0 ? punkt : (frage.wert ?? '').length);
  }, [frage]);
  const ende = (id: string | null) => {
    useFragen.getState().weg(frage);
    frage.antwort(id, wert);
  };
  // Standard (Enter, Fokus): der Hauptknopf; ohne ihn „Abbrechen“, sonst der letzte ungefährliche – nie der Gefahr-Knopf,
  // sonst löscht Enter. Gibt es nur Gefahr-Knöpfe, gibt es keinen Standard: Enter tut nichts, der Fokus liegt im Dialog.
  const sicher = frage.knoepfe.filter((k) => k.art !== 'danger');
  const standard = frage.knoepfe.find((k) => k.art === 'primary') ?? sicher.find((k) => k.id === 'abbrechen') ?? sicher.at(-1);
  const mitEingabe = frage.wert !== undefined;
  return (
    <Modal titel={frage.titel} onClose={() => ende(frage.knoepfe.length === 1 && frage.knoepfe[0].art !== 'danger' ? frage.knoepfe[0].id : null)} className="rf" kopf klickDaneben={!mitEingabe}>
      <form
        tabIndex={standard ? undefined : -1}
        data-startfokus={standard ? undefined : ''}
        onSubmit={(e) => {
          e.preventDefault();
          if (standard && (!mitEingabe || wert.trim())) ende(standard.id);
        }}
      >
        {frage.text && <p className="small-text rf-text">{frage.text}</p>}
        {frage.details && (
          <details className="rf-details">
            <summary>Technische Einzelheiten</summary>
            <pre>{frage.details}</pre>
          </details>
        )}
        {mitEingabe && <input ref={feld} value={wert} onChange={(e) => setWert(e.target.value)} aria-label={frage.titel} spellCheck={false} />}
        <div className="dialog-buttons">
          {frage.knoepfe.map((k) =>
            k === standard ? (
              <button key={k.id} type="submit" className={k.art ?? ''} autoFocus={!mitEingabe} disabled={mitEingabe && !wert.trim()}>
                {k.label}
              </button>
            ) : (
              <button key={k.id} type="button" className={k.art ?? ''} onClick={() => ende(k.id)}>
                {k.label}
              </button>
            ),
          )}
        </div>
      </form>
    </Modal>
  );
}
