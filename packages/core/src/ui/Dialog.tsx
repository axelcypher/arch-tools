import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { escAnmelden, naechsterEscRang } from './dialoge';

/**
 * Gemeinsame Dialog-Bausteine aller Apps:
 *  - `useEscSchliessen`: Esc schließt den Dialog (verschachtelt nur den obersten)
 *  - `Modal`: Rahmen mit Hintergrund; Esc und Klick daneben schließen, Fokus bleibt im Dialog und springt danach
 *    zurück (siehe dialoge.ts)
 */

/** Esc schließt diesen Dialog, solange er angezeigt wird (`aktiv`). */
export function useEscSchliessen(schliessen: (() => void) | undefined, aktiv = true): void {
  const ref = useRef(schliessen);
  ref.current = schliessen;
  // Rang beim Rendern des Öffnens: äußere Dialoge rendern vor inneren (Effekte laufen umgekehrt), später geöffnete
  // nach früheren – auch wenn der Dialog schon vorher eingehängt war (z. B. mit `aktiv` umgeschaltet)
  const rang = useRef(0);
  const warAktiv = useRef(false);
  const jetzt = aktiv && !!schliessen;
  if (jetzt && !warAktiv.current) rang.current = naechsterEscRang();
  warAktiv.current = jetzt;
  useEffect(() => {
    if (!jetzt) return;
    return escAnmelden(() => ref.current?.(), rang.current);
  }, [jetzt]);
}

export function Modal({
  titel,
  onClose,
  className = '',
  breit = false,
  tabelle = false,
  kopf = false,
  klickDaneben = true,
  beschreibung,
  children,
}: {
  /** Name des Dialogs (aria-label bzw. mit `kopf` sichtbarer Titel) */
  titel: string;
  /** Esc, Klick daneben; fehlt = nicht schließbar (z. B. während einer laufenden Aktion) */
  onClose?: () => void;
  className?: string;
  breit?: boolean;
  /** für Tabellen: so breit wie möglich, höchstens 1200px */
  tabelle?: boolean;
  /** Titel sichtbar als Kopf zeigen (statt ihn im Inhalt als h3 zu wiederholen) */
  kopf?: boolean;
  /** Klick neben den Dialog schließt ihn */
  klickDaneben?: boolean;
  /** id des Einleitungssatzes (aria-describedby) – wird beim Öffnen mit vorgelesen */
  beschreibung?: string;
  children: ReactNode;
}) {
  useEscSchliessen(onClose);
  const kopfId = useId();
  const klassen = ['modal', breit && 'modal-wide', tabelle && 'modal-tabelle', className].filter(Boolean).join(' ');
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && klickDaneben && onClose?.()}>
      <div className={klassen} role="dialog" aria-modal="true" aria-label={kopf ? undefined : titel} aria-labelledby={kopf ? kopfId : undefined} aria-describedby={beschreibung}>
        {kopf && (
          <h3 className="modal-kopf" id={kopfId}>
            {titel}
          </h3>
        )}
        {children}
      </div>
    </div>
  );
}
