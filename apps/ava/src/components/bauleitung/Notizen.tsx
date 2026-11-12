import { useState } from 'react';
import { bestaetigen } from '@core/ui/Rueckfrage';
import { gewerkZweistellig } from '../../abrechnung/gewerk';
import { heuteIso, neueId } from '../../lv/modell';
import { useAva } from '../../store';
import { datumKurz, DatumEingabe, TextEingabe } from '../eingaben';
import { speichern } from './gemeinsam';

/** Notizen und Aufgaben (mit Frist) zum Projekt bzw. Gewerk */
export function Notizen() {
  const projekt = useAva((s) => s.projekt)!;
  const [text, setText] = useState('');
  const [frist, setFrist] = useState<string | undefined>();
  const [gewerk, setGewerk] = useState('');
  const [filter, setFilter] = useState<'alle' | 'aufgaben' | 'offen'>('alle');
  const gewerke = projekt.struktur?.gewerke.map((g) => g.kennung) ?? [];
  const liste = [...projekt.ava.notizen]
    .filter((n) => filter === 'alle' || (n.frist && (filter === 'aufgaben' || !n.erledigt)))
    .sort((a, b) => (a.erledigt ? 1 : 0) - (b.erledigt ? 1 : 0) || (a.frist ?? '9999').localeCompare(b.frist ?? '9999') || b.datum.localeCompare(a.datum));
  const heute = heuteIso();

  const neu = () => {
    if (!text.trim()) return;
    void speichern((a) => ({ ...a, notizen: [...a.notizen, { id: neueId('n'), datum: heute, text: text.trim(), ...(frist ? { frist } : {}), ...(gewerk ? { gewerk } : {}) }] }));
    setText('');
    setFrist(undefined);
  };

  return (
    <div className="ava-seite">
      <div className="ava-seite-kopf">
        <h1>Notizen & Aufgaben</h1>
      </div>
      <div className="ava-notiz-neu">
        <textarea rows={2} placeholder="Neue Notiz bzw. Aufgabe … (Strg+Enter)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && neu()} />
        <div className="ava-reihe">
          <select value={gewerk} onChange={(e) => setGewerk(e.target.value)}>
            <option value="">Projekt</option>
            {gewerke.map((g) => (
              <option key={g} value={g}>
                {gewerkZweistellig(g)}
              </option>
            ))}
          </select>
          <label className="small-text">
            Frist <DatumEingabe wert={frist} onChange={setFrist} />
          </label>
          <button className="primary" onClick={neu} disabled={!text.trim()}>
            Hinzufügen
          </button>
          <span className="tb-spacer" />
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="alle">alle</option>
            <option value="aufgaben">nur Aufgaben</option>
            <option value="offen">offene Aufgaben</option>
          </select>
        </div>
      </div>
      <ul className="ava-notizen">
        {liste.map((n) => (
          <li key={n.id} className={`${n.erledigt ? 'ava-erledigt ' : ''}${n.frist && !n.erledigt && n.frist < heute ? 'ava-ueberfaellig' : ''}`}>
            {n.frist !== undefined && <input type="checkbox" checked={!!n.erledigt} onChange={(e) => void speichern((a) => ({ ...a, notizen: a.notizen.map((x) => (x.id === n.id ? { ...x, erledigt: e.target.checked } : x)) }))} title="erledigt" />}
            <div className="ava-notiz-text">
              <TextEingabe mehrzeilig zeilen={Math.min(6, n.text.split('\n').length)} wert={n.text} onChange={(t) => void speichern((a) => ({ ...a, notizen: a.notizen.map((x) => (x.id === n.id ? { ...x, text: t } : x)) }))} />
              <span className="muted small-text">
                {datumKurz(n.datum)}
                {n.gewerk ? ` · ${gewerkZweistellig(n.gewerk)}` : ''}
                {n.frist ? ` · Frist ${datumKurz(n.frist)}` : ''}
              </span>
            </div>
            <button
              className="small"
              onClick={async () => {
                if (await bestaetigen('Notiz entfernen?', n.text.slice(0, 120), 'Entfernen', true)) await speichern((a) => ({ ...a, notizen: a.notizen.filter((x) => x.id !== n.id) }));
              }}
            >
              ×
            </button>
          </li>
        ))}
        {!liste.length && <li className="muted">Keine Einträge.</li>}
      </ul>
    </div>
  );
}
