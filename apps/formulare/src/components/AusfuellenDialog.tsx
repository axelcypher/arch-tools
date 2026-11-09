import { useEffect, useMemo, useState } from 'react';
import { vorschlaege } from '../ausfuellen';
import type { OffenesFormular } from '../store';
import { karteMitAenderungen, useFormulare } from '../store';

/**
 * Formular aus der Projektkarte ausfüllen: Vorschau aller Felder, die sich ändern würden. Leere Felder sind
 * vorgewählt; Felder mit anderem Inhalt nur auf Wunsch – sie könnten von Hand angepasst sein. Übernommen wird in
 * einem Schritt, der sich als Ganzes rückgängig machen lässt.
 */
export function AusfuellenDialog({ offen, onClose }: { offen: OffenesFormular; onClose: () => void }) {
  const karte = useFormulare((s) => s.karte);
  const { karteLaden, werteSetzen } = useFormulare.getState();
  const [gewaehlt, setGewaehlt] = useState<Set<string> | null>(null);
  const [gelesen, setGelesen] = useState(!!karte);

  useEffect(() => {
    if (!karte) void karteLaden().finally(() => setGelesen(true));
  }, [karte, karteLaden]);

  const liste = useMemo(() => (karte ? vorschlaege(offen, karteMitAenderungen(karte)) : null), [karte, offen]);
  const auswahl = gewaehlt ?? new Set((liste ?? []).filter((v) => !v.aktuell.trim()).map((v) => v.feld.schluessel));

  const umschalten = (s: string) => {
    const neu = new Set(auswahl);
    if (neu.has(s)) neu.delete(s);
    else neu.add(s);
    setGewaehlt(neu);
  };
  const uebernehmen = () => {
    if (!liste) return;
    werteSetzen(
      liste.filter((v) => auswahl.has(v.feld.schluessel)).map((v) => ({ feld: v.feld, wert: v.neu })),
      `Aus Projektkarte ausgefüllt (${auswahl.size})`,
    );
    onClose();
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide fo-ausfuellen" aria-label="Aus Projektkarte ausfüllen">
        <h3>Aus Projektkarte ausfüllen</h3>
        {!liste && <p className="muted">{gelesen ? 'Dieses Projekt hat keine lesbare Projektkarte.' : 'Projektkarte wird gelesen …'}</p>}
        {liste && !liste.length && <p>Alle zugeordneten Felder stimmen schon mit der Projektkarte überein.</p>}
        {liste && liste.length > 0 && (
          <>
            <p className="muted small-text">FORMA ordnet diese Felder Einträgen der Projektkarte zu. Leere Felder sind vorgewählt; Felder mit eigenem Inhalt nur, wenn du sie anhakst.</p>
            <div className="fo-ausfuellen-liste">
              {liste.map((v) => (
                <label key={v.feld.schluessel} className="fo-ausfuellen-zeile">
                  <input type="checkbox" checked={auswahl.has(v.feld.schluessel)} onChange={() => umschalten(v.feld.schluessel)} />
                  <span className="fo-ausfuellen-text">
                    <strong>{v.feld.beschriftung}</strong> <span className="muted small-text">Seite {v.feld.seite + 1}</span>
                    <span className="fo-ausfuellen-werte">
                      {v.aktuell.trim() ? <del>{v.aktuell}</del> : <span className="muted">(leer)</span>} → <ins>{v.neu || '(leer)'}</ins>
                    </span>
                    <span className="muted small-text">{v.quelle}</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
        <div className="dialog-buttons">
          <button onClick={onClose}>Abbrechen</button>
          <button className="primary" disabled={!liste || !auswahl.size} onClick={uebernehmen}>
            {auswahl.size ? `${auswahl.size} Feld(er) übernehmen` : 'Übernehmen'}
          </button>
        </div>
      </div>
    </div>
  );
}
