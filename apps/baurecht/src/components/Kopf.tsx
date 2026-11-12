import { isTauri } from '@core/platform/files';
import type { Pruefstand } from '../pruefung';
import { heute, useBaurecht } from '../store';
import { AMPEL_TEXT, uhrzeit } from './Ampel';

const EBENE_TEXT = { land: 'Land', kreis: 'Kreis', gemeinde: 'Gemeinde' } as const;
const MODUL_TEXT = { land: 'Landesmodul', kreis: 'Kreismodul', gemeinde: 'Gemeindemodul' } as const;

/** Kopfleiste: Antrag, Einreichung, Module, Rechtsstand, Aktionen */
export function Kopf({ stand, onRechtsstand, onLage, onProtokoll, onSpeichern, lageLaeuft }: { stand: Pruefstand; onRechtsstand: () => void; onLage: () => void; onProtokoll: () => void; onSpeichern: () => void; lageLaeuft: boolean }) {
  const antrag = useBaurecht((s) => s.antrag);
  const antraege = useBaurecht((s) => s.antraege);
  const einreichung = useBaurecht((s) => s.pruefung.einreichung);
  const laedt = useBaurecht((s) => s.laedt);
  const geprueft = useBaurecht((s) => s.rechtsstandGeprueft);
  const paket = useBaurecht((s) => s.paket);
  const paketMeldung = useBaurecht((s) => s.paketMeldung);
  const fehler = stand.auswertung.normen.filter((n) => n.fehler).length;
  const geaendert = stand.auswertung.paragrafen.filter((p) => p.geaendert.length || p.ueberholt).length;
  const kuenftig = stand.auswertung.normen.filter((n) => n.kuenftige?.length).length;
  return (
    <div className="toolbar br-kopf" role="toolbar" aria-label="Prüfung">
      <div className="tb-group">
        <label className="br-kopf-feld">
          <span className="tb-label">Antrag</span>
          <select value={antrag} onChange={(e) => useBaurecht.getState().antragWaehlen(e.target.value)} aria-label="Antrag">
            {antraege.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="br-kopf-feld" title="Stichtag der Prüfung: Fassung der Gesetze am Tag der Einreichung (z. B. § 42a, § 90 BauO NRW)">
          <span className="tb-label">Einreichung</span>
          <input type="date" value={einreichung ?? heute()} min="2018-01-01" onChange={(e) => useBaurecht.getState().einreichungSetzen(e.target.value === heute() ? '' : e.target.value)} />
        </label>
      </div>
      <div className="tb-group br-module" aria-label="Regelmodule">
        {stand.module.map((m) => (
          <span key={m.id} className="br-modul-chip" title={`${m.name} · Modul ${m.id} · Stand ${m.version}`}>
            {m.name}
          </span>
        ))}
        {stand.fehlend.map((e) => (
          <span key={e} className="br-modul-chip br-modul-fehlt" title={stand.ags ? `Für diesen Gemeindeschlüssel gibt es kein ${MODUL_TEXT[e]} – die Vorschriften dieser Ebene von Hand prüfen.` : 'Gemeindeschlüssel fehlt – „Lage abfragen“ oder in den Angaben eintragen.'}>
            {stand.ags ? `kein ${MODUL_TEXT[e]}` : `${EBENE_TEXT[e]}: Gemeindeschlüssel fehlt`}
          </span>
        ))}
      </div>
      <span className="tb-spacer" />
      <div className="tb-group br-rechtsstand" aria-live="polite">
        {laedt.length ? (
          <span className="br-laedt">Rechtsstand: {laedt.length} Texte werden geholt …</span>
        ) : geprueft ? (
          <span title={`${paket.herkunft === 'nachgeladen' ? 'Regelpaket nachgeladen' : 'Regelpaket des Builds'} ${paket.version}${paketMeldung ? ` – ${paketMeldung}` : ''}`}>
            Rechtsstand geprüft {uhrzeit(geprueft)}
            {fehler ? <span className="br-warn-text"> · {fehler} nicht abrufbar</span> : null}
            {geaendert ? <span className="br-warn-text"> · {geaendert} geändert</span> : null}
            {kuenftig ? <span className="br-warn-text"> · {kuenftig} neue Fassung angekündigt</span> : null}
          </span>
        ) : (
          <span className="br-leise">{isTauri() ? 'Rechtsstand noch nicht geprüft' : 'Web-Version: ohne Gesetzestexte'}</span>
        )}
      </div>
      <div className="tb-group">
        {isTauri() && (
          <button type="button" onClick={onLage} disabled={lageLaeuft} title="Gemeindeschlüssel, Flurstück und Schutzgebiete aus den Geodiensten am Grundstück">
            {lageLaeuft ? 'Lage wird abgefragt …' : 'Lage abfragen'}
          </button>
        )}
        {isTauri() && (
          <button type="button" onClick={onRechtsstand} disabled={laedt.length > 0} title="Alle Texte sofort an der Quelle prüfen">
            Rechtsstand prüfen
          </button>
        )}
        <button type="button" onClick={onProtokoll} title="Prüfprotokoll ansehen, drucken, abschließen">
          Prüfprotokoll
        </button>
        <button type="button" className="primary" onClick={onSpeichern} title="In der Projektdatei speichern (Strg+S)">
          Speichern
        </button>
      </div>
    </div>
  );
}

/** Bilanz: Zähler und „Am meisten klären“ */
export function Bilanz({ stand }: { stand: Pruefstand }) {
  const { zaehler, klaerung } = stand.auswertung;
  const summe = zaehler.rot + zaehler.gelb + zaehler.gruen || 1;
  return (
    <div className="br-bilanz">
      <div className="br-bilanz-zahlen" aria-label="Ergebnis">
        {(['rot', 'gelb', 'gruen'] as const).map((a) => (
          <span key={a} className={`br-bilanz-zahl br-chip-${a}`}>
            <strong>{zaehler[a]}</strong> {AMPEL_TEXT[a]}
          </span>
        ))}
      </div>
      <div className="br-balken" aria-hidden="true">
        {(['rot', 'gelb', 'gruen'] as const).map((a) => (
          <span key={a} className={`br-balken-${a}`} style={{ width: `${(zaehler[a] / summe) * 100}%` }} />
        ))}
      </div>
      {klaerung.length > 0 && (
        <div className="br-klaeren">
          <span className="br-leise">Am meisten klärt:</span>
          {klaerung.slice(0, 4).map((k) => (
            <button key={k.id} type="button" className="br-chip-knopf" onClick={() => useBaurecht.getState().fokusSetzen(k.id)} title={`Diese Angabe entscheidet ${k.anzahl} offene Paragrafen`}>
              {k.titel} <span className="br-leise">({k.anzahl})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
