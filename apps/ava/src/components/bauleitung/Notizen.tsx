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
        <textarea rows={2} aria-label="Neue Notiz bzw. Aufgabe" placeholder="Neue Notiz bzw. Aufgabe … (Strg+Enter)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && neu()} />
        <div className="ava-reihe">
          <select value={gewerk} onChange={(e) => setGewerk(e.target.value)} aria-label="Bezug: Projekt oder Gewerk" title="Bezug: Projekt oder Gewerk">
            <option value="">Projekt</option>
            {gewerke.map((g) => (
              <option key={g} value={g}>
                {gewerkZweistellig(g)}
              </option>
            ))}
          </select>
          <span className="ava-notiz-frist">
            <span className="muted small-text" aria-hidden="true">
              Frist
            </span>
            <DatumEingabe wert={frist} onChange={setFrist} title="Frist (macht die Notiz zur Aufgabe)" label="Frist" />
          </span>
          <button className="primary" onClick={neu} disabled={!text.trim()}>
            Hinzufügen
          </button>
          <span className="tb-spacer" />
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter">
            <option value="alle">alle</option>
            <option value="aufgaben">nur Aufgaben</option>
            <option value="offen">offene Aufgaben</option>
          </select>
        </div>
      </div>
      <ul className="ava-notizen">
        {liste.map((n) => {
          const ueberfaellig = !!n.frist && !n.erledigt && n.frist < heute;
          const kurz = n.text.split('\n')[0].slice(0, 40);
          return (
          <li key={n.id} className={`${n.erledigt ? 'ava-erledigt ' : ''}${ueberfaellig ? 'ava-ueberfaellig' : ''}`}>
            {n.frist !== undefined && (
              <input
                type="checkbox"
                checked={!!n.erledigt}
                onChange={(e) => {
                  const erledigt = e.target.checked;
                  void speichern((a) => ({ ...a, notizen: a.notizen.map((x) => (x.id === n.id ? { ...x, erledigt } : x)) }));
                }}
                title="erledigt"
                aria-label={`Aufgabe „${kurz}“ erledigt`}
              />
            )}
            <div className="ava-notiz-text">
              <TextEingabe mehrzeilig zeilen={Math.min(6, n.text.split('\n').length)} wert={n.text} label="Notiz" onChange={(t) => void speichern((a) => ({ ...a, notizen: a.notizen.map((x) => (x.id === n.id ? { ...x, text: t } : x)) }))} />
              <span className="muted small-text">
                {datumKurz(n.datum)}
                {n.gewerk ? ` · ${gewerkZweistellig(n.gewerk)}` : ''}
                {n.frist ? ` · Frist ${datumKurz(n.frist)}` : ''}
                {ueberfaellig && <span className="ava-ueberfaellig-text"> · überfällig</span>}
                {n.erledigt && ' · erledigt'}
              </span>
            </div>
            <button
              className="small icon"
              title="Notiz entfernen"
              aria-label={`Notiz „${kurz}“ entfernen`}
              onClick={async () => {
                if (await bestaetigen('Notiz entfernen?', n.text.slice(0, 120), 'Entfernen', true)) await speichern((a) => ({ ...a, notizen: a.notizen.filter((x) => x.id !== n.id) }));
              }}
            >
              ×
            </button>
          </li>
          );
        })}
        {!liste.length && <li className="muted">{projekt.ava.notizen.length ? 'Keine Einträge für diesen Filter.' : 'Noch keine Notizen – oben eintragen und „Hinzufügen“.'}</li>}
      </ul>
    </div>
  );
}
