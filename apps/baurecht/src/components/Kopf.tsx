import { isTauri } from '@core/platform/files';
import type { Pruefstand } from '../pruefung';
import { heute, useBaurecht } from '../store';

const EBENE_TEXT = { land: 'Land', kreis: 'Kreis', gemeinde: 'Gemeinde' } as const;
const MODUL_TEXT = { land: 'Landesmodul', kreis: 'Kreismodul', gemeinde: 'Gemeindemodul' } as const;

const datumZeit = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Kopfleiste in einer Zeile: Antrag, Einreichung, Module, Rechtsstand, Aktionen */
export function Kopf({ stand, onRechtsstand, onLage, onProtokoll, onSpeichern, lageLaeuft }: { stand: Pruefstand; onRechtsstand: () => void; onLage: () => void; onProtokoll: () => void; onSpeichern: () => void; lageLaeuft: boolean }) {
  const antrag = useBaurecht((s) => s.antrag);
  const antraege = useBaurecht((s) => s.antraege);
  const einreichung = useBaurecht((s) => s.pruefung.einreichung);
  const laedt = useBaurecht((s) => s.laedt);
  const paket = useBaurecht((s) => s.paket);
  const paketMeldung = useBaurecht((s) => s.paketMeldung);
  const normen = stand.auswertung.normen.filter((n) => n.def.quelle.art !== 'verweis');
  const fehler = normen.filter((n) => n.fehler).length;
  const geaendert = stand.auswertung.paragrafen.filter((p) => p.geaendert.length || p.ueberholt).length;
  const kuenftig = normen.filter((n) => n.kuenftige?.length).length;
  // Rechtsstand: der älteste Stand der aktiven Normen (nicht die Uhrzeit des letzten Laufs)
  const zeiten = normen.map((n) => n.geprueft).filter((x): x is string => !!x).sort();
  const nie = normen.length - zeiten.length;
  const ags = stand.auswertung.fakten['lage.ags'];
  const agsVorschlag = ags?.sicherheit === 'hinweis' && !ags.bestaetigt && !ags.widerspruch;
  const agsWiderspruch = !!ags?.widerspruch;
  const moduleText = stand.module.map((m) => m.name).join(' · ');
  return (
    <div className="toolbar br-kopf" role="group" aria-label="Prüfung">
      <label className="br-kopf-feld">
        <span className="tb-label">Antrag</span>
        <select value={antrag} onChange={(e) => useBaurecht.getState().antragWaehlen(e.target.value)}>
          {antraege.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <label className="br-kopf-feld" title="Stichtag der Prüfung: Fassung der Gesetze am Tag der Einreichung (z. B. § 42a, § 90 BauO NRW)">
        <span className="tb-label">Einreichung</span>
        <input type="date" value={einreichung ?? heute()} min="2018-01-01" onChange={(e) => useBaurecht.getState().einreichungSetzen(e.target.value === heute() ? '' : e.target.value)} />
      </label>
      {/* Module kürzen sich zuerst; Warnungen sind eigene Marken und werden nie gekürzt */}
      <span className="br-module-text" title={`Regelmodule: ${stand.module.map((m) => `${m.name} (Stand ${m.version})`).join(', ')}`}>
        {moduleText}
      </span>
      <span className="br-kopf-marken">
        {agsWiderspruch && (
          <span className="br-modul-chip br-modul-widerspruch" title={`Gemeindeschlüssel widersprüchlich: ${ags?.widerspruch ?? ''} – bitte klären. Bis dahin gelten die Werte der Gebietsmodule nur als Hinweis.`}>
            Gemeinde widersprüchlich
          </span>
        )}
        {agsVorschlag && (
          <span className="br-modul-chip br-modul-fehlt" title="Der Gemeindeschlüssel ist nur vorgeschlagen bzw. von Hand ohne Beleg eingetragen – bitte in den Angaben bestätigen oder „Lage abfragen“. Bis dahin gelten die Werte der Gebietsmodule nur als Hinweis.">
            Gemeinde unbestätigt
          </span>
        )}
        {stand.fehlend.map((e) => (
          <span key={e} className="br-modul-chip br-modul-fehlt" title={stand.ags ? `Für diesen Gemeindeschlüssel gibt es kein ${MODUL_TEXT[e]} – die Vorschriften dieser Ebene von Hand prüfen.` : 'Gemeindeschlüssel fehlt – „Lage abfragen“ oder in den Angaben eintragen.'}>
            {stand.ags ? `kein ${MODUL_TEXT[e]}` : `${EBENE_TEXT[e]}: Gemeindeschlüssel fehlt`}
          </span>
        ))}
      </span>
      <span className="tb-spacer" />
      <span className="br-rechtsstand" aria-live="polite" title={`${paket.herkunft === 'nachgeladen' ? 'Regelpaket nachgeladen' : 'Regelpaket des Builds'} ${paket.version}${paketMeldung ? ` – ${paketMeldung}` : ''}${zeiten.length ? ` · Normen zuletzt an der Quelle bestätigt zwischen ${datumZeit(zeiten[0])} und ${datumZeit(zeiten[zeiten.length - 1])}` : ''}`}>
        {laedt.length ? (
          <span className="br-laedt">{laedt.length} Texte werden geholt …</span>
        ) : !isTauri() ? (
          <span className="br-leise">Web-Version: ohne Gesetzestexte</span>
        ) : zeiten.length ? (
          <span className="br-rechtsstand-zeit">Rechtsstand {datumZeit(zeiten[0])}</span>
        ) : (
          <span className="br-warn-text">Rechtsstand noch nicht geprüft</span>
        )}
      </span>
      {!laedt.length && isTauri() && (nie || fehler || geaendert || kuenftig) ? (
        <span className="br-kopf-marken" aria-label="Warnungen zum Rechtsstand">
          {nie ? <span className="br-marke br-marke-warn">{nie} nie geprüft</span> : null}
          {fehler ? <span className="br-marke br-marke-warn">{fehler} nicht abrufbar</span> : null}
          {geaendert ? <span className="br-marke br-marke-warn">{geaendert} geändert</span> : null}
          {kuenftig ? <span className="br-marke br-marke-warn">{kuenftig} neue Fassung</span> : null}
        </span>
      ) : null}
      {isTauri() && (
        <button type="button" onClick={onLage} disabled={lageLaeuft} title="Gemeindeschlüssel, Flurstück und Schutzgebiete aus den Geodiensten am Grundstück">
          {lageLaeuft ? 'Lage …' : 'Lage abfragen'}
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
  );
}

/** „Klärt am meisten“: die Angaben, die die meisten offenen Paragrafen entscheiden (oben in den Angaben) */
export function Klaeren({ stand }: { stand: Pruefstand }) {
  const { klaerung } = stand.auswertung;
  if (!klaerung.length) return null;
  return (
    <div className="br-klaeren" role="group" aria-label="Angaben, die am meisten klären">
      <span className="br-klaeren-titel">Klärt am meisten</span>
      {klaerung.slice(0, 4).map((k) => (
        <button key={k.id} type="button" className="br-chip-knopf" onClick={() => useBaurecht.getState().fokusSetzen(k.id)} title={`Diese Angabe entscheidet ${k.anzahl} offene Paragrafen`}>
          {k.titel} <span className="br-chip-zahl">klärt {k.anzahl}</span>
        </button>
      ))}
    </div>
  );
}
