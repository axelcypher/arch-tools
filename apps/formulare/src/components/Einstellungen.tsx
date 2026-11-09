import { dateiname } from '@core/platform/files';
import { waehleOrdner } from '../dateisystem';
import { useFormulare } from '../store';

function OrdnerListe({ ordner, onEntfernen }: { ordner: string[]; onEntfernen: (p: string) => void }) {
  if (!ordner.length) return <p className="muted small-text">Noch keiner eingestellt.</p>;
  return (
    <div className="fo-ordnerliste">
      {ordner.map((p) => (
        <div key={p} className="fo-ordner" title={p}>
          <span className="fo-ordner-name">
            <strong>{dateiname(p) || p}</strong> <span className="muted small-text">{p}</span>
          </span>
          <button className="fo-klein" title="Aus der Liste entfernen (der Ordner selbst bleibt unverändert)" onClick={() => onEntfernen(p)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** Einstellungen: wo die FORMA-Projekte und die echten Projektordner liegen, welche Pfade angezeigt werden */
export function Einstellungen({ onClose }: { onClose: () => void }) {
  const projektordner = useFormulare((s) => s.projektordner);
  const ablageordner = useFormulare((s) => s.ablageordner);
  const vorgabe = useFormulare((s) => s.vorgabeAuswahl);
  const ablageFehler = useFormulare((s) => s.ablageFehler);
  const { ordnerHinzufuegen, ordnerEntfernen, ablageHinzufuegen, ablageEntfernen, setVorgabeAuswahl } = useFormulare.getState();

  const formaHinzu = async () => {
    const p = await waehleOrdner('Ordner mit FORMA-Projekten wählen');
    if (p) await ordnerHinzufuegen(p);
  };
  const ablageHinzu = async () => {
    const p = await waehleOrdner('Ordner mit den Projektordnern wählen (z. B. Z:\\Projekte)');
    if (p) await ablageHinzufuegen(p);
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide" aria-label="Einstellungen">
        <h3>Einstellungen</h3>

        <h4>FORMA-Projekte</h4>
        <p className="muted small-text">Ordner, in denen die FORMA-Projekte liegen (je Projekt ein Unterordner mit Kürzel, z. B. „BS5“). Es können mehrere sein.</p>
        <OrdnerListe ordner={projektordner} onEntfernen={(p) => void ordnerEntfernen(p)} />
        <button onClick={() => void formaHinzu()}>Ordner hinzufügen …</button>

        <h4>Projektordner</h4>
        <p className="muted small-text">
          Ordner mit den eigentlichen Projektordnern (z. B. <code>Z:\Projekte</code>). Sie werden über das Kürzel zugeordnet – „BS5 Birkenstraße 5“ oder „JJ H24 …“ – und zwei
          Ebenen tief gesucht (auch in Unterordnern wie der Akquise). Hier wird nur gelesen.
        </p>
        <OrdnerListe ordner={ablageordner} onEntfernen={(p) => void ablageEntfernen(p)} />
        <button onClick={() => void ablageHinzu()}>Ordner hinzufügen …</button>
        {ablageFehler.map((f) => (
          <p key={f} className="warning small-text">
            {f}
          </p>
        ))}

        <h4>Angezeigte Pfade (Vorgabe)</h4>
        <p className="muted small-text">
          Welche Teile eines Projektordners links erscheinen – je Zeile ein Pfad, z. B. <code>Organisation</code> oder <code>03 Berechnungen/Flächen</code>, Platzhalter{' '}
          <code>*</code> und <code>?</code> je Ebene. Je Projekt lässt sich das links über ⚙ ändern.
        </p>
        <textarea rows={5} defaultValue={vorgabe.join('\n')} onBlur={(e) => setVorgabeAuswahl(e.target.value.split('\n'))} aria-label="Angezeigte Pfade (Vorgabe)" />

        <div className="dialog-buttons">
          <button className="primary" onClick={onClose}>
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
}
