/**
 * Fehler beim Abruf (netz_verbindung.rs): erste Zeile ein verständlicher Satz, danach „Technische Angabe: …“ mit dem
 * Rohfehler. Gezeigt wird der Satz; der Rohfehler ist aufklappbar (für die Meldung an die IT bzw. den Support).
 */

const TRENNER = '\nTechnische Angabe: ';

/** Satz und Rohfehler trennen (ältere bzw. andere Fehler haben keinen Rohfehler) */
export function fehlerTeile(text: string): { satz: string; technik?: string } {
  const i = text.indexOf(TRENNER);
  return i < 0 ? { satz: text } : { satz: text.slice(0, i), technik: text.slice(i + TRENNER.length) };
}

/** nur der Satz (für Tooltips und Zähler) */
export const fehlerSatz = (text: string) => fehlerTeile(text).satz;

/** Fehlertext als Block: Satz, darunter aufklappbar die technische Angabe */
export function Fehlertext({ text, vorne = '' }: { text: string; vorne?: string }) {
  const { satz, technik } = fehlerTeile(text);
  return (
    <div className="br-fehlertext">
      <span>
        {vorne}
        {satz}
      </span>
      {technik && (
        <details className="br-technik">
          <summary>Technische Angabe</summary>
          <code>{technik}</code>
        </details>
      )}
    </div>
  );
}
