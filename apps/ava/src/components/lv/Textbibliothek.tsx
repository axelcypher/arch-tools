import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
import { alsText } from '../../format/rtf';
import type { Vorlagetext } from '../../lv/textbibliothek';
import { vorlagenAendern, vorlagenAusLv, vorlagenLaden, vorlagenSuchen } from '../../lv/textbibliothek';
import { useAva } from '../../store';
import { zahlDE } from '../eingaben';

/** Vorlagetexte des Büros: suchen, übernehmen, aus dem LV füllen, pflegen */
export function Textbibliothek({ onClose, onUebernehmen, ersetzen = false }: { onClose: () => void; onUebernehmen: (v: Vorlagetext) => void; ersetzen?: boolean }) {
  const [liste, setListe] = useState<Vorlagetext[] | null>(null);
  const [suche, setSuche] = useState('');
  const [gruppe, setGruppe] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const lv = useAva((s) => s.lv);

  useEffect(() => {
    vorlagenLaden().then(setListe, (e) => {
      setListe([]);
      void meldung('Vorlagetexte nicht lesbar', 'Die Vorlagetexte im gemeinsamen Konfigurationsordner ließen sich nicht lesen.', e);
    });
  }, []);

  const gruppen = useMemo(() => [...new Set((liste ?? []).map((v) => v.gruppe))].sort(), [liste]);
  const treffer = useMemo(() => vorlagenSuchen(liste ?? [], suche, gruppe || undefined), [liste, suche, gruppe]);
  const v = treffer.find((x) => x.id === gewaehlt) ?? treffer[0];

  /** Tastatur im Suchfeld: ↑/↓ durch die Treffer, Enter übernimmt */
  const tasten = (e: React.KeyboardEvent) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && treffer.length) {
      e.preventDefault();
      const i = treffer.findIndex((x) => x.id === v?.id);
      const n = treffer[Math.max(0, Math.min(treffer.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      setGewaehlt(n.id);
      document.getElementById(`ava-vorlage-${n.id}`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && v) {
      e.preventDefault();
      onUebernehmen(v);
      onClose();
    }
  };

  const ausLv = async () => {
    if (!lv) return;
    const g = lv.lv.kopf.bezeichnung.replace(/^G\s*\d+\s*/i, '') || 'Allgemein';
    const neu = await vorlagenAendern((alt) => [...alt, ...vorlagenAusLv(lv.lv, g, alt)]);
    const dazu = neu.length - (liste?.length ?? 0);
    setListe(neu);
    await meldung('Vorlagetexte ergänzt', dazu ? `${dazu} Position(en) aus „${lv.lv.kopf.bezeichnung}“ in die Gruppe „${g}“ übernommen.` : 'Alle Positionen dieses LV stehen schon in den Vorlagetexten.');
  };

  const entfernen = async (x: Vorlagetext) => {
    if (!(await bestaetigen('Vorlage entfernen?', `„${x.kurztext}“ aus den Vorlagetexten des Büros entfernen?`, 'Entfernen', true))) return;
    setListe(await vorlagenAendern((alt) => alt.filter((y) => y.id !== x.id)));
  };

  return (
    <Modal titel="Vorlagetexte" onClose={onClose} breit className="ava-bibliothek">
      <h2>Vorlagetexte</h2>
      <div className="ava-bib-filter">
        <input
          autoFocus
          type="search"
          placeholder="Suchen in Kurz- und Langtext …"
          aria-label="Vorlagetexte durchsuchen – ↑/↓ wählen, Enter übernimmt"
          aria-controls="ava-vorlagen"
          aria-activedescendant={v ? `ava-vorlage-${v.id}` : undefined}
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          onKeyDown={tasten}
        />
        <select value={gruppe} onChange={(e) => setGruppe(e.target.value)} aria-label="Gruppe">
          <option value="">alle Gruppen</option>
          {gruppen.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        {lv && (
          <button onClick={() => void ausLv()} title="Alle Positionen des geöffneten LV als Vorlagen aufnehmen (gleiche Texte nur einmal)">
            Aus diesem LV übernehmen
          </button>
        )}
      </div>
      <div className="ava-bib-koerper">
        <ul className="list ava-bib-liste" id="ava-vorlagen" role="listbox" aria-label="Vorlagetexte">
          {liste === null && <li className="muted">Wird gelesen …</li>}
          {liste && !treffer.length && <li className="muted">{liste.length ? 'Keine Treffer.' : 'Noch keine Vorlagetexte – „Aus diesem LV übernehmen“ oder an einer Position „Als Vorlage speichern“.'}</li>}
          {treffer.map((x) => (
            <li key={x.id} id={`ava-vorlage-${x.id}`} role="option" aria-selected={x.id === v?.id} className={x.id === v?.id ? 'active' : ''} onClick={() => setGewaehlt(x.id)} onDoubleClick={() => (onUebernehmen(x), onClose())}>
              <span className="muted small-text">{x.gruppe}</span>
              <div>{x.kurztext}</div>
            </li>
          ))}
        </ul>
        <div className="ava-bib-vorschau">
          {v ? (
            <>
              <h3>{v.kurztext}</h3>
              <div className="muted small-text">
                {[v.einheit && `Einheit ${v.einheit}`, v.kostengruppe && `KG ${v.kostengruppe}`, v.richtpreis !== undefined && `Richtpreis ${zahlDE(v.richtpreis, 2)} €`].filter(Boolean).join(' · ')}
              </div>
              <pre className="ava-bib-text">{alsText(v.langtext)}</pre>
              <div className="button-row">
                <button className="primary" onClick={() => (onUebernehmen(v), onClose())}>
                  {ersetzen ? 'Texte übernehmen' : 'Als Position einfügen'}
                </button>
                <span className="tb-spacer" />
                <button className="small danger" onClick={() => void entfernen(v)} title="Diese Vorlage aus den Vorlagetexten des Büros entfernen">
                  Vorlage entfernen
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Eine Vorlage wählen.</p>
          )}
        </div>
      </div>
      <div className="dialog-buttons">
        <button onClick={onClose}>Schließen</button>
      </div>
    </Modal>
  );
}
