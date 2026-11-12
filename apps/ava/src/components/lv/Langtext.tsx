import { useEffect, useRef } from 'react';
import type { Absatz, Formattext, Lauf } from '../../format/rtf';
import { gleicherText } from '../../format/rtf';

/**
 * Langtext bearbeiten: Absätze mit fett, kursiv, unterstrichen und Aufzählungen – das, was die LV-Datei
 * aufnehmen kann. Übernommen wird beim Verlassen des Felds (ein Schritt im Verlauf).
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>').replace(/\t/g, '&emsp;');

function laufHtml(l: Lauf): string {
  let t = esc(l.text);
  if (l.unterstrichen) t = `<u>${t}</u>`;
  if (l.kursiv) t = `<i>${t}</i>`;
  if (l.fett) t = `<b>${t}</b>`;
  return t;
}

export function alsHtml(f: Formattext): string {
  let out = '';
  let liste: 'ul' | 'ol' | null = null;
  for (const a of f) {
    const art = a.liste === 'punkt' ? 'ul' : a.liste === 'nummer' ? 'ol' : null;
    if (liste && art !== liste) {
      out += `</${liste}>`;
      liste = null;
    }
    const inhalt = a.laeufe.map(laufHtml).join('') || '<br>';
    if (art) {
      if (!liste) {
        out += `<${art}>`;
        liste = art;
      }
      out += `<li>${inhalt}</li>`;
    } else out += `<p>${inhalt}</p>`;
  }
  if (liste) out += `</${liste}>`;
  return out || '<p><br></p>';
}

/** HTML aus dem Editor zurück in Absätze */
export function ausHtml(wurzel: HTMLElement): Formattext {
  const absaetze: Absatz[] = [];
  const laeufe = (el: Node, art: { fett?: boolean; kursiv?: boolean; unterstrichen?: boolean }, out: Lauf[]) => {
    for (const k of Array.from(el.childNodes)) {
      if (k.nodeType === 3) {
        const t = (k.textContent ?? '').replace(/ /g, '\t').replace(/ /g, ' ');
        if (t) out.push({ text: t, ...(art.fett ? { fett: true } : {}), ...(art.kursiv ? { kursiv: true } : {}), ...(art.unterstrichen ? { unterstrichen: true } : {}) });
      } else if (k instanceof HTMLElement) {
        const tag = k.tagName.toLowerCase();
        if (tag === 'br') {
          out.push({ text: '\n' });
          continue;
        }
        const s = k.style;
        laeufe(k, {
          fett: art.fett || tag === 'b' || tag === 'strong' || s.fontWeight === 'bold' || Number(s.fontWeight) >= 600,
          kursiv: art.kursiv || tag === 'i' || tag === 'em' || s.fontStyle === 'italic',
          unterstrichen: art.unterstrichen || tag === 'u' || s.textDecoration.includes('underline'),
        }, out);
      }
    }
  };
  const absatz = (el: Node, liste?: Absatz['liste']) => {
    const out: Lauf[] = [];
    laeufe(el, {}, out);
    // Zeilenumbruch am Ende (Platzhalter des Editors) entfällt
    while (out.length && out[out.length - 1].text === '\n') out.pop();
    const zusammen: Lauf[] = [];
    for (const l of out) {
      const v = zusammen[zusammen.length - 1];
      if (v && !!v.fett === !!l.fett && !!v.kursiv === !!l.kursiv && !!v.unterstrichen === !!l.unterstrichen) v.text += l.text;
      else zusammen.push({ ...l });
    }
    absaetze.push({ laeufe: zusammen, ...(liste ? { liste } : {}) });
  };
  for (const k of Array.from(wurzel.childNodes)) {
    if (k instanceof HTMLElement && (k.tagName === 'UL' || k.tagName === 'OL')) {
      for (const li of Array.from(k.children)) absatz(li, k.tagName === 'UL' ? 'punkt' : 'nummer');
    } else if (k instanceof HTMLElement && (k.tagName === 'P' || k.tagName === 'DIV')) absatz(k);
    else if (k.nodeType === 3 && k.textContent?.trim()) absatz(k);
    else if (k instanceof HTMLElement) absatz(k);
  }
  while (absaetze.length && !absaetze[absaetze.length - 1].laeufe.some((l) => l.text.trim())) absaetze.pop();
  return absaetze;
}

export function Langtext({ wert, onChange, nurLesen = false }: { wert: Formattext; onChange: (f: Formattext) => void; nurLesen?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const zuletzt = useRef<Formattext>(wert);
  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    el.innerHTML = alsHtml(wert);
    zuletzt.current = wert;
  }, [wert]);
  const uebernehmen = () => {
    const el = ref.current;
    if (!el) return;
    const neu = ausHtml(el);
    if (!gleicherText(neu, zuletzt.current)) {
      zuletzt.current = neu;
      onChange(neu);
    }
  };
  const befehl = (b: string) => {
    ref.current?.focus();
    document.execCommand(b);
  };
  return (
    <div className="ava-langtext">
      {!nurLesen && (
        <div className="ava-langtext-leiste">
          <button className="small" onMouseDown={(e) => e.preventDefault()} onClick={() => befehl('bold')} title="Fett (Strg+B)">
            <b>F</b>
          </button>
          <button className="small" onMouseDown={(e) => e.preventDefault()} onClick={() => befehl('italic')} title="Kursiv (Strg+I)">
            <i>K</i>
          </button>
          <button className="small" onMouseDown={(e) => e.preventDefault()} onClick={() => befehl('underline')} title="Unterstrichen (Strg+U)">
            <u>U</u>
          </button>
          <button className="small" onMouseDown={(e) => e.preventDefault()} onClick={() => befehl('insertUnorderedList')} title="Aufzählung">
            • Liste
          </button>
        </div>
      )}
      <div
        ref={ref}
        className="ava-langtext-flaeche"
        contentEditable={!nurLesen}
        suppressContentEditableWarning
        spellCheck
        lang="de"
        onBlur={uebernehmen}
        onKeyDown={(e) => {
          if (e.key === 'Escape') ref.current?.blur();
        }}
      />
    </div>
  );
}
