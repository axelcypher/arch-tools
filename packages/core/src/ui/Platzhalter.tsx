import { istGlobal, modernisieren, unbekanntePlatzhalter, veraltetePlatzhalter, type Variable } from '../platzhalter';

/** Tooltip einer Variable: Erklärung, Quelle, Beispiel */
const titel = (v: Variable) => [v.text, v.quelle && `Quelle: ${v.quelle}`, v.beispiel && `Beispiel: ${v.beispiel}`].filter(Boolean).join('\n');

/**
 * Chips der Platzhalter einer Einstellung – in allen Apps gleich: zuerst die globalen Variablen (gelten überall gleich,
 * GROSSBUCHSTABEN), dann die lokalen (nur hier). Ein Klick setzt den Platzhalter ein (`onEinfuegen`). `fokusBehalten`
 * (Vorgabe): der Fokus bleibt im Feld, damit der Platzhalter an der Schreibmarke landet; aus bei Feldern, die erst beim
 * Verlassen übernehmen – dann wird angehängt.
 */
export function PlatzhalterChips({
  variablen,
  onEinfuegen,
  label,
  fokusBehalten = true,
}: {
  variablen: Variable[];
  onEinfuegen: (platzhalter: string) => void;
  label: string;
  fokusBehalten?: boolean;
}) {
  const global = variablen.filter((v) => istGlobal(v));
  const lokal = variablen.filter((v) => !istGlobal(v));
  const chip = (v: Variable, art: 'global' | 'lokal') => (
    <button
      key={v.name}
      type="button"
      className={`small ph-chip ph-${art}`}
      title={titel(v)}
      aria-label={`{${v.name}} einfügen – ${v.text}${art === 'global' ? ' (global)' : ' (nur hier)'}`}
      onMouseDown={fokusBehalten ? (e) => e.preventDefault() : undefined}
      onClick={() => onEinfuegen(`{${v.name}}`)}
    >
      {`{${v.name}}`}
    </button>
  );
  return (
    <div className="ph-chips" role="group" aria-label={`Platzhalter: ${label}`}>
      {global.length > 0 && (
        <span className="ph-gruppe">
          <span className="ph-gruppe-titel">Global</span>
          {global.map((v) => chip(v, 'global'))}
        </span>
      )}
      {lokal.length > 0 && (
        <span className="ph-gruppe">
          <span className="ph-gruppe-titel">Nur hier</span>
          {lokal.map((v) => chip(v, 'lokal'))}
        </span>
      )}
    </div>
  );
}

/**
 * Hinweise zu einer Vorlage: unbekannte Platzhalter (bleiben stehen) und alte Namen mit dem Angebot, die Vorlage auf
 * die neuen umzustellen. Umgestellt wird nur auf Klick – Gespeichertes wird nie stillschweigend geändert.
 */
export function PlatzhalterHinweise({ vorlage, variablen, onAnpassen }: { vorlage: string; variablen: Variable[]; onAnpassen?: (neu: string) => void }) {
  const fremd = unbekanntePlatzhalter(vorlage, variablen);
  const alt = veraltetePlatzhalter(vorlage, variablen);
  return (
    <>
      {fremd.length > 0 && <span className="feld-meldung">Unbekannter Platzhalter, bleibt so stehen: {fremd.join(', ')}</span>}
      {alt.length > 0 && (
        <span className="ph-veraltet">
          Alte Schreibweise (funktioniert weiter): {alt.map((a) => `${a.alt} → ${a.neu}`).join(', ')}
          {onAnpassen && (
            <button type="button" className="small" onClick={() => onAnpassen(modernisieren(vorlage, variablen))}>
              Vorlage anpassen
            </button>
          )}
        </span>
      )}
    </>
  );
}

/** Text mit eingefügtem Platzhalter: an der Schreibmarke eines Felds, sonst mit Leerzeichen angehängt */
export function platzhalterEinfuegen(text: string, platzhalter: string, feld?: HTMLInputElement | HTMLTextAreaElement | null): { text: string; marke: number } {
  if (feld && document.activeElement === feld && feld.selectionStart !== null) {
    const a = feld.selectionStart;
    const b = feld.selectionEnd ?? a;
    return { text: `${text.slice(0, a)}${platzhalter}${text.slice(b)}`, marke: a + platzhalter.length };
  }
  // nach einem Trenner direkt anhängen, sonst mit Leerzeichen
  const neu = text && !/[\s\-_./]$/.test(text) ? `${text} ${platzhalter}` : `${text}${platzhalter}`;
  return { text: neu, marke: neu.length };
}
