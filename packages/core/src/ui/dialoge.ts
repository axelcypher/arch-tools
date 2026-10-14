/**
 * Einheitliches Verhalten aller modalen Dialoge (Elemente mit Klasse „modal“), einmal je App eingerichtet:
 *  - role="dialog" und aria-modal="true", falls nicht gesetzt
 *  - Fokus beim Öffnen in den Dialog (sofern er nicht schon darin liegt), beim Schließen zurück an die
 *    Stelle davor (z. B. der Knopf, der ihn geöffnet hat)
 *  - Tab und Umschalt+Tab bleiben im obersten Dialog
 */

const FOKUSSIERBAR = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

let eingerichtet = false;
const vorher = new WeakMap<Element, HTMLElement | null>();

function obersterDialog(): HTMLElement | null {
  const alle = document.querySelectorAll<HTMLElement>('.modal');
  return alle.length ? alle[alle.length - 1] : null;
}

function geoeffnet(d: HTMLElement) {
  if (!d.hasAttribute('role')) d.setAttribute('role', 'dialog');
  if (!d.hasAttribute('aria-modal')) d.setAttribute('aria-modal', 'true');
  const aktiv = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  vorher.set(d, aktiv && !d.contains(aktiv) ? aktiv : null);
  // nach dem Rendern: Dialoge, die selbst fokussieren (z. B. ein Suchfeld), haben Vorrang
  requestAnimationFrame(() => {
    if (!d.isConnected || d.contains(document.activeElement)) return;
    (d.querySelector<HTMLElement>('[autofocus]') ?? d.querySelector<HTMLElement>(FOKUSSIERBAR))?.focus();
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
    if (n.classList.contains('modal')) fn(n);
    n.querySelectorAll<HTMLElement>('.modal').forEach(fn);
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
