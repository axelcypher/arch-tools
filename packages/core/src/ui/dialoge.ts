/**
 * Einheitliches Verhalten aller modalen Dialoge (Elemente mit Klasse „modal“ und die Druckvorschau `.report` in
 * `.report-backdrop`), einmal je App eingerichtet:
 *  - role="dialog" und aria-modal="true", falls nicht gesetzt; ohne Namen benennt die erste Überschrift den Dialog
 *  - Erstfokus: `autofocus`, sonst das erste Textfeld (nur Dialoge, nicht die Druckvorschau), sonst der Hauptknopf
 *    (`.primary`), sonst das gewählte Optionsfeld, sonst das erste fokussierbare Element – nie „Abbrechen“
 *  - Fokus beim Öffnen in den Dialog (sofern er nicht schon darin liegt), beim Schließen oder Aushängen zurück an die
 *    Stelle davor (z. B. der Knopf, der ihn geöffnet hat, oder die Zeichenfläche bei Öffnen per Taste); wurde sie
 *    inzwischen ersetzt, an ihr Gegenstück im nahen Bereich (höchstens drei Ebenen, bis zur nächsten Leiste, Karte …),
 *    sonst bleibt der Fokus unverändert
 *  - Tab und Umschalt+Tab bleiben im obersten Dialog
 *  - Esc schließt den obersten Dialog, der sich dafür angemeldet hat (`escAnmelden`, Hook `useEscSchliessen`);
 *    ein Eingabefeld, das Esc selbst nutzt (Eingabe verwerfen), hält das Ereignis an und schließt nichts
 */

// „details > summary“: die Aufklappzeile (z. B. „Liste anzeigen“ im Bestätigen-Dialog) gehört in den Fokuszyklus
const START = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
export const FOKUSSIERBAR = `${START}, details > summary`;

/** Textfelder, in die man beim Öffnen gleich schreiben will (keine Kästchen, Auswahllisten, Regler) */
const KEIN_TEXT = ['checkbox', 'radio', 'range', 'file', 'color', 'hidden', 'submit', 'button', 'reset', 'image'];
const TEXTFELD = `input${KEIN_TEXT.map((t) => `:not([type='${t}'])`).join('')}:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])`;

let eingerichtet = false;
/** Stelle vor dem Öffnen: das fokussierte Element (auch eine SVG-Zeichenfläche), woran man sein Gegenstück erkennt, und
 *  die nahen Vorfahren bis zum nächsten Bereich (Zeile, Leiste, Karte) – wird das Element ersetzt, während der Dialog
 *  offen ist (die App rendert es neu), geht der Fokus an sein Gegenstück in diesem Bereich */
interface Vorher {
  el: HTMLElement | SVGElement;
  kennung: string[];
  /** die Kette endet an einem Bereich (Leiste, Karte …) – sonst nur das Gegenstück, nie „das erste“ */
  imBereich: boolean;
  index: number;
  ahnen: Element[];
}
/** Grenze der Ersatzsuche: weiter oben läge ein Ersatz an einer unerwarteten Stelle (z. B. erster Knopf der App) */
const BEREICH =
  '.karte, .karte-fuss, .zeichen-fuss, .karte-kopf, .karte-leiste, .toolbar, .leiste, .modal, .report, [role="dialog"], [role="toolbar"], header, footer, main, aside, section, nav, form';
const MAX_EBENEN = 3;
/** woran man das Gegenstück eines neu gerenderten Elements erkennt: id, Beschriftung, title, Text */
const kennungVon = (el: Element) => {
  // Text nur bei kurzen Beschriftungen (nicht der ganze Inhalt einer Zeichenfläche)
  const text = el instanceof SVGElement ? '' : (el.textContent?.trim() ?? '');
  return [el.id, el.getAttribute('aria-label'), el.getAttribute('title'), text.length <= 80 ? text : ''].map((k) => (k ? k : ''));
};
const gleich = (a: string[], b: string[]) => a.some((k, i) => k !== '' && k === b[i]);
/** sichtbar und fokussierbar: keine versteckten Felder, nichts in inert/aria-hidden, nichts ausgeblendet */
const fokussierbar = (el: Element): el is HTMLElement | SVGElement =>
  (el instanceof HTMLElement || el instanceof SVGElement) &&
  !(el instanceof HTMLInputElement && el.type === 'hidden') &&
  !el.closest('[inert], [aria-hidden="true"], [hidden]') &&
  (el instanceof SVGElement || el.offsetParent !== null || getComputedStyle(el).position === 'fixed');
const zieleIn = (bereich: Element) => [...(bereich.matches(START) ? [bereich] : []), ...bereich.querySelectorAll(START)].filter(fokussierbar);
const vorher = new WeakMap<Element, Vorher | null>();
/** die zuletzt fokussierten Elemente (neueste zuerst) – React setzt `autoFocus` schon beim Einhängen, bevor der
 *  MutationObserver den Dialog meldet; dann liegt der Fokus bereits im Dialog, und die Stelle davor steht nur hier */
/** `null`: der Fokus ging auf die Seite (z. B. Klick auf eine Fläche) – dann gibt es keine Stelle davor */
const fokusVerlauf: (HTMLElement | SVGElement | null)[] = [];

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
  const a = document.activeElement;
  const geeignet = (el: Element | null): el is HTMLElement | SVGElement => (el instanceof HTMLElement || el instanceof SVGElement) && el !== document.body && !d.contains(el) && el.isConnected;
  // das aktuell fokussierte Element; hat der Dialog schon selbst fokussiert (autoFocus), der letzte Stand davor aus dem
  // Verlauf – stand der Fokus da auf der Seite (Marke null), gibt es keine Stelle; steht er auf der Seite, auch nicht
  const davor = a && d.contains(a) ? fokusVerlauf.find((x) => x === null || !d.contains(x)) : undefined;
  const aktiv = geeignet(a) ? a : davor && geeignet(davor) ? davor : null;
  const ahnen: Element[] = [];
  for (let p = aktiv?.parentElement; p && p !== document.body && ahnen.length < MAX_EBENEN; p = p.parentElement) {
    ahnen.push(p);
    if (p.matches(BEREICH)) break;
  }
  vorher.set(d, aktiv ? { el: aktiv, kennung: kennungVon(aktiv), index: ahnen[0] ? zieleIn(ahnen[0]).indexOf(aktiv) : -1, ahnen, imBereich: !!ahnen.at(-1)?.matches(BEREICH) } : null);
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
  if (!v) return;
  // zurück an die Stelle davor – auch in einen äußeren Dialog, der offen bleibt (z. B. Rückfrage über der
  // Druckvorschau), nur nicht in einen Hintergrund, über dem noch ein anderer Dialog liegt
  const oben = obersterDialog();
  const erlaubt = (el: Element) => !oben || oben.contains(el);
  // direkter Weg: das gemerkte Element gibt es noch – zurück dorthin (wie bisher, auch wenn die App in onClose selbst
  // fokussiert hat; „nichts überschreiben“ gilt nur für den Ersatzweg unten)
  if (v.el.isConnected) {
    if (erlaubt(v.el)) v.el.focus();
    return;
  }
  // ersetzt: nur, wenn der Fokus sonst auf der Seite läge (z. B. hat ein äußerer Dialog, der mit ausgehängt wurde, ihn
  // schon zurückgegeben), und nur im nahen Bereich – dort das Gegenstück (gleiche id, Beschriftung oder Text), sonst
  // das Element an derselben Stelle, sonst das erste
  if (document.activeElement && document.activeElement !== document.body) return;
  // die Kette endet an der Grenze des Bereichs (auch an einem äußeren Dialog) – darüber hinaus wird nie gesucht
  const ahne = v.ahnen.find((x) => x.isConnected);
  if (!ahne) return;
  const ziele = zieleIn(ahne).filter(erlaubt);
  const k = (z: Element) => kennungVon(z);
  // eine gleiche id gewinnt; bei gleicher Beschriftung oder gleichem Text (mehrere „Löschen“ in einer Liste) der
  // Kandidat, der der alten Position am nächsten liegt
  const nachId = v.kennung[0] ? ziele.find((z) => k(z)[0] === v.kennung[0]) : undefined;
  const passend = ziele.map((z, i) => ({ z, i })).filter(({ z }) => gleich(k(z), v.kennung));
  const naechster = passend.sort((a, b) => Math.abs(a.i - v.index) - Math.abs(b.i - v.index))[0]?.z;
  const ander = ahne === v.ahnen[0] && v.index >= 0 ? ziele[v.index] : undefined;
  const ziel = nachId ?? naechster ?? (v.imBereich ? (ander ?? ziele[0]) : undefined);
  ziel?.focus();
}

export function dialogVerhaltenEinrichten(): void {
  if (eingerichtet || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  eingerichtet = true;
  const pruefen = (n: Node, fn: (d: HTMLElement) => void) => {
    if (!(n instanceof HTMLElement)) return;
    if (istDialog(n)) fn(n);
    n.querySelectorAll<HTMLElement>(DIALOG).forEach(fn);
  };
  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement || t instanceof SVGElement)) return;
      const i = fokusVerlauf.indexOf(t);
      if (i >= 0) fokusVerlauf.splice(i, 1);
      fokusVerlauf.unshift(t);
      fokusVerlauf.length = Math.min(fokusVerlauf.length, 5);
    },
    true,
  );
  // verlässt der Fokus ein Element, ohne dass ein anderes ihn bekommt, steht er auf der Seite: Marke im Verlauf
  document.addEventListener(
    'focusout',
    (e) => {
      if ((e as FocusEvent).relatedTarget) return;
      if (fokusVerlauf[0] !== null) fokusVerlauf.unshift(null);
      fokusVerlauf.length = Math.min(fokusVerlauf.length, 5);
    },
    true,
  );
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
