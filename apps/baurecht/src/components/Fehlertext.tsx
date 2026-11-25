/**
 * Fehler beim Abruf (netz_verbindung.rs, `netz_fehler_text`), in Zeilen:
 *   „Nicht erreichbar: <Satz>“ bzw. „Zeitüberschreitung: <Satz>“
 *   „Proxy: <genutzter Proxy bzw. was fehlt>“ (optional)
 *   „Technische Einzelheiten: <Rohfehler>“ (optional)
 * Gezeigt wird der Satz (der Anfang „Nicht erreichbar“ nur, wo der Zusammenhang ihn nicht schon nennt), der Rohfehler
 * aufklappbar wie in den Rückfragen aus core (`details.rf-details`, „Technische Einzelheiten“). Andere bzw. ältere
 * Fehler (eine Zeile) bleiben ganz.
 */

export interface FehlerTeile {
  /** „Nicht erreichbar“, „Zeitüberschreitung“ – fehlt bei anderen Fehlern */
  art?: string;
  satz: string;
  proxy?: string;
  technik?: string;
}

const ART = /^(Nicht erreichbar|Zeitüberschreitung): /;

export function fehlerTeile(text: string): FehlerTeile {
  const zeilen = text.split('\n');
  const t: FehlerTeile = { satz: '' };
  const rest: string[] = [];
  for (const z of zeilen) {
    if (z.startsWith('Proxy: ')) t.proxy = z.slice(7);
    else if (z.startsWith('Technische Einzelheiten: ')) t.technik = z.slice(25);
    else rest.push(z);
  }
  const satz = rest.join(' ');
  const m = ART.exec(satz);
  // nur der übersetzte Satz verliert den Anfang (er steht dann im Zusammenhang); Rohtexte bleiben, wie sie sind
  if (m && (t.technik || t.proxy)) {
    t.art = m[1];
    t.satz = satz.slice(m[0].length);
  } else t.satz = satz;
  return t;
}

/**
 * Fehlertext als Block: `vorne` (Zusammenhang, z. B. „Text nicht verfügbar.“), der Satz, der Proxy (außer `ohneProxy`),
 * darunter aufklappbar die technischen Einzelheiten. `zu` nennt den Gegenstand im Namen der Aufklappzeile (mehrere in
 * einer Tabelle).
 */
export function Fehlertext({ text, vorne, ohneProxy = false, zu }: { text: string; vorne?: string; ohneProxy?: boolean; zu?: string }) {
  const t = fehlerTeile(text);
  const satz = [vorne, t.satz, ohneProxy ? '' : t.proxy].filter(Boolean).join(' ');
  return (
    <div className="br-fehlertext">
      <span>{satz}</span>
      {t.technik && (
        <details className="rf-details">
          <summary aria-label={zu ? `Technische Einzelheiten zu ${zu}` : undefined}>Technische Einzelheiten</summary>
          <pre>{t.technik}</pre>
        </details>
      )}
    </div>
  );
}
