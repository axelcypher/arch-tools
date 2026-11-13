/**
 * Einheitliches Verhalten aller modalen Dialoge (Elemente mit Klasse „modal“ und die Druckvorschau `.report` in
 * `.report-backdrop`), einmal je App eingerichtet:
 *  - role="dialog" und aria-modal="true", falls nicht gesetzt; ohne Namen benennt die erste Überschrift den Dialog
 *  - Erstfokus: `autofocus`, sonst das erste Textfeld (nur Dialoge, nicht die Druckvorschau), sonst der Hauptknopf
 *    (`.primary`), sonst das gewählte Optionsfeld, sonst das erste fokussierbare Element – nie „Abbrechen“
 *  - Fokus beim Öffnen in den Dialog (sofern er nicht schon darin liegt), beim Schließen zurück an die
 *    Stelle davor (z. B. der Knopf, der ihn geöffnet hat)
 *  - Tab und Umschalt+Tab bleiben im obersten Dialog
 *  - Esc schließt den obersten Dialog, der sich dafür angemeldet hat (`escAnmelden`, Hook `useEscSchliessen`);
 *    ein Eingabefeld, das Esc selbst nutzt (Eingabe verwerfen), hält das Ereignis an und schließt nichts
 */

// „details > summary“: die Aufklappzeile (z. B. „Liste anzeigen“ im Bestätigen-Dialog) gehört in den Fokuszyklus
const START = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const FOKUSSIERBAR = `${START}, details > summary`;

/** Textfelder, in die man beim Öffnen gleich schreiben will (keine Kästchen, Auswahllisten, Regler) */
const KEIN_TEXT = ['checkbox', 'radio', 'range', 'file', 'color', 'hidden', 'submit', 'button', 'reset', 'image'];
const TEXTFELD = `input${KEIN_TEXT.map((t) => `:not([type='${t}'])`).join('')}:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])`;

let eingerichtet = false;
const vorher = new WeakMap<Element, HTMLElement | null>();

const DIALOG = '.modal, .report-backdrop > .report';
const istDialog = (el: HTMLElement) => el.classList.contains('modal') || (el.classList.contains('report') && !!el.parentElement?.classList.contains('report-backdrop'));
let ueberschriftNr = 0;

function obersterDialog(): HTMLElement | null {
  const alle = document.querySelectorAll<HTMLElement>(DIALOG);
  return alle.length ? alle[alle.length - 1] : null;
}

function geoeffnet(d: HTMLElement) {
  if (!d.hasAttribute('role')) d.setAttribute('role', 'dialog');
  if (!d.hasAttribute('aria-modal')) d.setAttribute('aria-modal', 'true');
  if (!d.hasAttribute('aria-label') && !d.hasAttribute('aria-labelledby')) {
    const h = d.querySelector<HTMLElement>('h1, h2, h3');
    if (h) {
      if (!h.id) h.id = `dialog-titel-${++ueberschriftNr}`;
      d.setAttribute('aria-labelledby', h.id);
    }
  }
  const aktiv = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  vorher.set(d, aktiv && !d.contains(aktiv) ? aktiv : null);
  // nach dem Rendern: Dialoge, die selbst fokussieren (z. B. ein Suchfeld), haben Vorrang
  requestAnimationFrame(() => {
    if (!d.isConnected || d.contains(document.activeElement)) return;
    // `data-startfokus`: ein Dialog bestimmt selbst, wo es losgeht (React setzt kein autofocus-Attribut); am Ende START
    // statt FOKUSSIERBAR: nie auf eine Aufklappzeile (z. B. „Liste anzeigen“ vor dem Häkchen) – sie bleibt im Tab-Zyklus
    (
      d.querySelector<HTMLElement>('[autofocus], [data-startfokus]:not([disabled])') ??
      (d.classList.contains('modal') ? d.querySelector<HTMLElement>(TEXTFELD) : null) ??
      d.querySelector<HTMLElement>('button.primary:not([disabled])') ??
      d.querySelector<HTMLElement>('input[type="radio"]:checked:not([disabled])') ??
      d.querySelector<HTMLElement>(START)
    )?.focus();
  });
}

function geschlossen(d: Element) {
  const v = vorher.get(d);
  if (v?.isConnected && !obersterDialog()) v.focus();
}

export function dialogVerhaltenEinrichten(): void {
  if (eingerichtet || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  eingerichtet = true;
  const pruefen = (n: Node, fn: (d: HTMLElement) => void) => {
    if (!(n instanceof HTMLElement)) return;
    if (istDialog(n)) fn(n);
    n.querySelectorAll<HTMLElement>(DIALOG).forEach(fn);
  };
  new MutationObserver((liste) => {
    for (const m of liste) {
      m.addedNodes.forEach((n) => pruefen(n, geoeffnet));
      m.removedNodes.forEach((n) => pruefen(n, geschlossen));
    }
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Tab') return;
      const d = obersterDialog();
      if (!d) return;
      const ziele = [...d.querySelectorAll<HTMLElement>(FOKUSSIERBAR)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!ziele.length) return;
      const erstes = ziele[0];
      const letztes = ziele[ziele.length - 1];
      const a = document.activeElement;
      if (!d.contains(a)) {
        e.preventDefault();
        erstes.focus();
      } else if (e.shiftKey && a === erstes) {
        e.preventDefault();
        letztes.focus();
      } else if (!e.shiftKey && a === letztes) {
        e.preventDefault();
        erstes.focus();
      }
    },
    true,
  );
}

/* ---------- Esc schließt den obersten Dialog ---------- */

const escStapel: { schliessen: () => void; rang: number }[] = [];
let escEingerichtet = false;
let letzterRang = 0;

/** Rang eines Dialogs: in der Reihenfolge des ersten Renderns (äußere vor inneren, frühere vor späteren) */
export const naechsterEscRang = (): number => ++letzterRang;

function escEinrichten() {
  if (escEingerichtet || typeof document === 'undefined') return;
  escEingerichtet = true;
  // Blasenphase am Dokument: Felder, die Esc selbst verarbeiten (fields.tsx), halten das Ereignis vorher an
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const oben = escStapel.reduce<(typeof escStapel)[number] | undefined>((a, b) => (!a || b.rang > a.rang ? b : a), undefined);
    if (!oben) return;
    e.preventDefault();
    oben.schliessen();
  });
}

/** Dialog für Esc anmelden; verschachtelt schließt Esc nur den obersten (höchster Rang). Liefert die Abmeldung. */
export function escAnmelden(schliessen: () => void, rang = naechsterEscRang()): () => void {
  escEinrichten();
  const eintrag = { schliessen, rang };
  escStapel.push(eintrag);
  return () => {
    const i = escStapel.indexOf(eintrag);
    if (i >= 0) escStapel.splice(i, 1);
  };
}
