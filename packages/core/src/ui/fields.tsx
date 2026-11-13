import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { parseNum } from '../format';
import type { Pruefung } from './pruefen';
import { alle, bereichMeldung, pflicht as pflichtRegel } from './pruefen';

/** Zahl im Feld mit fester Stellenzahl, gruppiert (45.000,00) oder ohne Tausenderpunkte (45000,00) */
const zahlFormate = new Map<string, Intl.NumberFormat>();
export function feldZahl(v: number, digits: number, gruppiert: boolean): string {
  const k = `${digits}${gruppiert}`;
  let f = zahlFormate.get(k);
  if (!f) zahlFormate.set(k, (f = new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: gruppiert })));
  return f.format(Object.is(v, -0) || Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v);
}

/**
 * Eingabe im Zahlenfeld lesen: wie `parseNum`, aber Punkte vor dem Komma gelten immer als Tausendertrenner – auch wenn
 * nach dem Bearbeiten einer gruppierten Zahl die Dreiergruppen nicht mehr stimmen („1.24,50“ → 124,5).
 */
export function zahlLesen(text: string): number | null {
  const v = parseNum(text);
  if (v !== null || !text.includes(',')) return v;
  const [ganz, ...rest] = text.split(',');
  return rest.length === 1 ? parseNum(`${ganz.replace(/\./g, '')},${rest[0]}`) : null;
}

/**
 * Enter in einem Feld: übernehmen (Fokus verlassen) und – in einem `<form>` – über seinen Hauptknopf absenden. Das
 * implizite Absenden des Browsers fällt nach dem Verlassen aus (das Ziel von keypress ist dann `body`) und wird hier
 * verhindert, damit nie doppelt gesendet wird; abgesendet wird nach dem Übernehmen der Eingabe, damit der Handler den
 * neuen Wert sieht. Ein gesperrter Hauptknopf sendet nicht.
 */
function enterUebernehmen(e: ReactKeyboardEvent<HTMLInputElement>) {
  e.preventDefault();
  const el = e.currentTarget;
  const form = el.form;
  el.blur();
  if (!form) return;
  // erst nach dem Übernehmen suchen und prüfen: der Wert kann den Hauptknopf gerade erst freigeben
  setTimeout(() => {
    if (!form.isConnected) return;
    // Hauptknopf: der als .primary markierte Absendeknopf, sonst der erste (wie der Browser)
    const absende = 'button[type="submit"], input[type="submit"], button:not([type])';
    const knopf =
      form.querySelector<HTMLButtonElement | HTMLInputElement>(
        absende
          .split(', ')
          .map((x) => `${x}.primary`)
          .join(', '),
      ) ?? form.querySelector<HTMLButtonElement | HTMLInputElement>(absende);
    if (knopf?.disabled) return;
    form.requestSubmit(knopf ?? undefined);
  }, 0);
}

/** Zahl in Meldungen: so kurz wie möglich, mindestens eine Nachkommastelle (1,0 · 0,4 · 0,25) */
const kurz = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 4 });

/**
 * Gemeinsames Verhalten der Eingabefelder, die erst bei Enter/Fokusverlust übernehmen:
 *  - Ein Klick irgendwo anders (Zeichenfläche, Liste, anderes Element) übernimmt die Eingabe, *bevor*
 *    dieser Klick verarbeitet wird – sonst landete die Änderung nach einem Auswahlwechsel bei der
 *    neu gewählten Fläche (Klicks auf die Zeichenfläche nehmen den Fokus nicht weg).
 *  - Wird das Feld entfernt (Auswahl gewechselt, Dialog geschlossen), wird eine offene Eingabe noch
 *    an das bisherige Ziel übergeben.
 */
function usePendingCommit(commit: () => void) {
  const ref = useRef<HTMLInputElement>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const editing = useRef(false);

  useEffect(() => {
    const onDown = (e: Event) => {
      const el = ref.current;
      if (!el || !editing.current || document.activeElement !== el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      el.blur();
    };
    // Erfassungsphase am Dokument: läuft vor allen Handlern der Anwendung
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('mousedown', onDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('mousedown', onDown, true);
      if (editing.current) commitRef.current();
    };
  }, []);

  return {
    ref,
    onFocus: () => {
      editing.current = true;
    },
    done: () => {
      editing.current = false;
    },
  };
}

/**
 * Zahleneingabe in deutscher Schreibweise (Komma, Tausenderpunkte, Einheit erlaubt – siehe `parseNum`). Übernimmt den
 * Wert bei Enter oder Fokusverlust, damit nicht jeder Tastendruck einen Undo-Schritt erzeugt. Nur wirklich bearbeitete
 * Eingaben werden übernommen – Hinein- und Herausklicken rundet keinen gespeicherten Wert auf die angezeigten Stellen.
 * Ungültige Eingaben und Werte außerhalb von min/max werden nicht still gekappt oder verworfen: Das Feld wird rot
 * markiert, die Meldung steht darunter, der Wert wird nicht übernommen und die Eingabe bleibt zum Korrigieren stehen.
 * Esc verwirft die Eingabe. Angezeigt wird mit Tausenderpunkten (45.000,00); der Text bleibt beim Fokussieren
 * unverändert, damit Cursor und Auswahl stimmen – `zahlLesen` liest die Punkte mit.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  digits = 2,
  placeholder,
  allowEmpty = false,
  title,
  pflicht = false,
  label,
  ungueltig = false,
  fehlerId,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  digits?: number;
  placeholder?: string;
  allowEmpty?: boolean;
  title?: string;
  /** Pflichtfeld (markiert; leer nach dem Verlassen = Meldung) */
  pflicht?: boolean;
  /** Name des Felds für Screenreader, falls es nicht in einem <label> steht */
  label?: string;
  /**
   * Fehler von außen, der mehrere Felder betrifft (z. B. „Summe der Teilflächen > Grundstücksfläche“): Feld rot
   * markiert und `aria-invalid`; die gemeinsame Meldung steht einmal neben den Feldern, ihre id in `fehlerId`.
   */
  ungueltig?: boolean;
  /** id der gemeinsamen Fehlermeldung (aria-describedby); die Meldung steht nur da, solange der Fehler besteht */
  fehlerId?: string;
}) {
  const meldungId = useId();
  // Tausenderpunkte nur mit Nachkommastellen: dann steht immer ein Komma im Text, und Punkte davor sind eindeutig
  // Tausendertrenner (ohne Komma wäre „45.00“ nach dem Löschen einer Ziffer mehrdeutig)
  const format = (v: number | undefined) => (v === undefined ? '' : feldZahl(v, digits, digits > 0));
  const zeige = (v: number) => kurz.format(v);
  const [text, setText] = useState(format(value));
  const [fehler, setFehler] = useState<string | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const bearbeitet = useRef(false);
  useEffect(() => {
    setText(format(value));
    setFehler(null);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    pending.done();
    if (!bearbeitet.current) return;
    const text = textRef.current;
    if (text.trim() === '') {
      if (allowEmpty) {
        bearbeitet.current = false;
        setFehler(null);
        if (value !== undefined) onChange(undefined);
      } else setFehler(pflicht ? 'Pflichtangabe – bitte eine Zahl eingeben.' : 'Bitte eine Zahl eingeben.');
      return;
    }
    const v = zahlLesen(text);
    if (v === null) {
      setFehler(`„${text.trim()}“ ist keine Zahl (z. B. 1.234,5).`);
      return;
    }
    const bereich = bereichMeldung(v, min, max, zeige);
    if (bereich) {
      setFehler(bereich);
      return;
    }
    bearbeitet.current = false;
    setFehler(null);
    if (v !== value) onChange(v);
    setText(format(v));
  };
  const pending = usePendingCommit(commit);

  return (
    <>
      <input
        ref={pending.ref}
        className={`num${fehler || ungueltig ? ' feld-fehler' : ''}`}
        value={text}
        onFocus={pending.onFocus}
        placeholder={placeholder}
        title={fehler ?? (ungueltig ? sieheMeldung(title) : title)}
        inputMode="decimal"
        aria-label={label}
        aria-invalid={fehler || ungueltig ? true : undefined}
        aria-describedby={beschrieben(fehler ? meldungId : undefined, ungueltig ? fehlerId : undefined)}
        aria-required={pflicht || undefined}
        required={pflicht || undefined}
        onChange={(e) => {
          bearbeitet.current = true;
          setText(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          // Enter übernimmt und verlässt das Feld: danach gehören Strg+Z (Rückgängig der App), Entf und die Werkzeugtasten
          // wieder der Arbeitsfläche; im Formular löst Enter danach den Hauptknopf aus
          if (e.key === 'Enter') enterUebernehmen(e);
          // Esc verwirft eine Eingabe – und schließt dann nicht zugleich den Dialog; ohne Eingabe schließt Esc ihn sofort
          if (e.key === 'Escape' && (bearbeitet.current || fehler)) {
            e.stopPropagation();
            bearbeitet.current = false;
            setFehler(null);
            textRef.current = format(value);
            setText(textRef.current);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {fehler && (
        <span className="feld-meldung" role="alert" id={meldungId}>
          {fehler}
        </span>
      )}
    </>
  );
}

/** Tooltip bei einem Fehler von außen: vorhandene Erklärung behalten, Verweis auf die gemeinsame Meldung anhängen */
const sieheMeldung = (title?: string): string => (title ? `${title} – siehe Meldung zu diesen Feldern` : 'Siehe Meldung zu diesen Feldern');

/** ids für aria-describedby (eigene Meldung, gemeinsame Meldung); keine = undefined */
const beschrieben = (...ids: (string | undefined)[]): string | undefined => ids.filter(Boolean).join(' ') || undefined;

/**
 * Texteingabe, die erst bei Enter/Fokusverlust übernimmt. `list`: id einer <datalist> mit Vorschlägen.
 * `pruefen` (siehe pruefen.ts) meldet Fehler bzw. Hinweise am Feld – erst nach dem Verlassen des Felds (oder sofort,
 * wenn `zeigen` gesetzt ist, etwa nach „Weiter“); weiche Hinweise blockieren nichts, der Wert wird übernommen.
 * `live` zeigt den Hinweis schon beim Tippen (z. B. Zeichen, die im Ordnernamen entfallen).
 */
export function TextField({
  value,
  onChange,
  placeholder,
  list,
  title,
  pflicht = false,
  pruefen,
  zeigen = false,
  live = false,
  label,
  ungueltig = false,
  fehlerId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  list?: string;
  title?: string;
  pflicht?: boolean;
  pruefen?: Pruefung;
  /** Meldungen auch ohne vorheriges Verlassen zeigen (nach dem Absenden) */
  zeigen?: boolean;
  /** Hinweis schon beim Tippen */
  live?: boolean;
  label?: string;
  /**
   * Fehler von außen, der mehrere Felder betrifft (z. B. „Summe der Teilflächen > Grundstücksfläche“): Feld rot
   * markiert und `aria-invalid`; die gemeinsame Meldung steht einmal neben den Feldern, ihre id in `fehlerId`.
   */
  ungueltig?: boolean;
  /** id der gemeinsamen Fehlermeldung (aria-describedby); die Meldung steht nur da, solange der Fehler besteht */
  fehlerId?: string;
}) {
  const meldungId = useId();
  const [text, setText] = useState(value);
  const [verlassen, setVerlassen] = useState(false);
  const textRef = useRef(text);
  textRef.current = text;
  useEffect(() => setText(value), [value]);
  const commit = () => {
    pending.done();
    setVerlassen(true);
    if (textRef.current !== value) onChange(textRef.current);
  };
  const pending = usePendingCommit(commit);
  const regel = pflicht && pruefen ? alle(pflichtRegel(), pruefen) : pflicht ? pflichtRegel() : pruefen;
  const meldung = regel && (verlassen || zeigen || (live && text !== value)) ? regel(live ? text : value) : null;
  return (
    <>
      <input
        ref={pending.ref}
        value={text}
        placeholder={placeholder}
        list={list}
        title={meldung ?? (ungueltig ? sieheMeldung(title) : title)}
        className={meldung || ungueltig ? 'feld-fehler' : undefined}
        aria-label={label}
        aria-invalid={meldung || ungueltig ? true : undefined}
        aria-describedby={beschrieben(meldung ? meldungId : undefined, ungueltig ? fehlerId : undefined)}
        aria-required={pflicht || undefined}
        required={pflicht || undefined}
        onFocus={pending.onFocus}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Enter übernimmt und verlässt das Feld: danach gehören Strg+Z (Rückgängig der App), Entf und die Werkzeugtasten
          // wieder der Arbeitsfläche; im Formular löst Enter danach den Hauptknopf aus
          if (e.key === 'Enter') enterUebernehmen(e);
          if (e.key === 'Escape' && textRef.current !== value) {
            e.stopPropagation();
            textRef.current = value;
            setText(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {meldung && (
        <span className="feld-meldung" role="alert" id={meldungId}>
          {meldung}
        </span>
      )}
    </>
  );
}

export function Field({ label, children, hint, pflicht = false }: { label: string; children: React.ReactNode; hint?: string; pflicht?: boolean }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {pflicht && (
          <span className="pflicht" title="Pflichtangabe" aria-hidden>
            {' '}
            *
          </span>
        )}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
