import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@core/platform/files';
import type { Pruefstand } from '../pruefung';
import { aktuelleLage } from '../pruefung';
import { heute, useBaurecht } from '../store';

const EBENE_TEXT = { land: 'Land', kreis: 'Kreis', gemeinde: 'Gemeinde' } as const;
const MODUL_TEXT = { land: 'Landesmodul', kreis: 'Kreismodul', gemeinde: 'Gemeindemodul' } as const;

const datumZeit = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
};

/**
 * kleines Menü: Knopf mit Liste darunter; Esc, Klick daneben und Tab aus dem Menü schließen, ↑/↓ bewegen. Der Zustand
 * kommt von außen (die Sammelmarke der Warnungen öffnet dasselbe Menü).
 */
function Menue({ titel, label, offen, setOffen, children }: { titel: string; label: string; offen: boolean; setOffen: (o: boolean) => void; children: (zu: () => void) => React.ReactNode }) {
  const rahmen = useRef<HTMLSpanElement>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  // wer das Menü geöffnet hat (Knopf „Mehr“ oder die Sammelmarke) – dorthin geht der Fokus zurück
  const oeffner = useRef<HTMLElement | null>(null);
  // Mausdruck auf einen Öffner: dessen Klick schaltet das Menü selbst um – nur dann darf der Fokuswechsel dorthin es
  // nicht schließen (mit der Tastatur auf die Sammelmarke zu gehen, schließt es wie jeder andere Fokuswechsel)
  const mausAufOeffner = useRef(false);
  useEffect(() => {
    if (!offen) return;
    oeffner.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rahmen.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    const weg = (e: MouseEvent) => {
      const ziel = e.target as Element | null;
      // Klicks auf einen Öffner schalten selbst um (sonst schlösse mousedown und der Klick öffnete wieder)
      if (ziel?.closest?.('[data-menue-oeffner]')) {
        mausAufOeffner.current = true;
        setTimeout(() => (mausAufOeffner.current = false), 500);
      } else if (!rahmen.current?.contains(ziel)) setOffen(false);
    };
    document.addEventListener('mousedown', weg);
    return () => document.removeEventListener('mousedown', weg);
  }, [offen, setOffen]);
  const zu = () => {
    setOffen(false);
    (oeffner.current?.isConnected ? oeffner.current : knopf.current)?.focus();
  };
  const taste = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      zu();
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      const el = [...(rahmen.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
      if (!el.length) return;
      const i = el.indexOf(document.activeElement as HTMLButtonElement);
      const ziel = e.key === 'Home' ? 0 : e.key === 'End' ? el.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : el.length - 1)) % el.length;
      el[ziel]?.focus();
      e.preventDefault();
    }
  };
  return (
    <span
      className="br-menue"
      ref={rahmen}
      onKeyDown={taste}
      onBlur={(e) => {
        // Fokus verlässt das Menü (Tab): schließen – nicht aber, wenn er auf einen Öffner geht (die Sammelmarke schaltet
        // das Menü selbst um; sonst schlösse der Fokuswechsel und der Klick öffnete wieder)
        const ziel = e.relatedTarget as Element | null;
        if (offen && !rahmen.current?.contains(ziel) && !(mausAufOeffner.current && ziel?.closest?.('[data-menue-oeffner]'))) setOffen(false);
      }}
    >
      <button type="button" ref={knopf} data-menue-oeffner="" aria-haspopup="menu" aria-expanded={offen} onClick={() => setOffen(!offen)} title={label}>
        {titel} <span aria-hidden="true">▾</span>
      </button>
      {offen && (
        <span className="br-menue-liste" role="menu" aria-label={label}>
          {children(zu)}
        </span>
      )}
    </span>
  );
}

/**
 * Kopfleiste in einer Zeile: Antrag, Einreichung, Module, Rechtsstand, Aktionen. Unter 1600 px (Breite der App)
 * wandern „Lage abfragen“ und „Rechtsstand prüfen“ in „Mehr ▾“, die Warnungen werden zu einer Sammelmarke; „Speichern“
 * wird nie verdrängt (die Liste der Module kürzt sich zuerst).
 */
export function Kopf({ stand, onRechtsstand, onLage, onProtokoll, onSpeichern, onAntrag, lageLaeuft }: { stand: Pruefstand; onRechtsstand: () => void; onLage: () => void; onProtokoll: () => void; onSpeichern: () => void; onAntrag: (antrag: string) => void; lageLaeuft: boolean }) {
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
  const desktop = isTauri();
  const [mehrOffen, setMehrOffen] = useState(false);
  const ungeprueft = desktop && !laedt.length && !zeiten.length;
  // „nie geprüft“ nur, wenn ein Teil geprüft ist – sonst sagt „Rechtsstand nicht geprüft“ dasselbe
  const warnungen = !laedt.length && desktop ? [nie && !ungeprueft ? `${nie} nie geprüft` : '', fehler ? `${fehler} nicht abrufbar` : '', geaendert ? `${geaendert} geändert` : '', kuenftig ? `${kuenftig} neue Fassung` : ''].filter(Boolean) : [];
  const warnText = [ungeprueft ? 'Rechtsstand noch nicht geprüft' : '', ...warnungen].filter(Boolean);
  const zurAgs = () => useBaurecht.getState().fokusSetzen('lage.ags');
  const project = useBaurecht((s) => s.project);
  const lageProblem = aktuelleLage(project).problem;
  const lageText = lageProblem === 'fehlen' ? 'Keine Koordinaten' : lageProblem === 'veraltet' ? 'Koordinaten veraltet' : '';
  const lageTitel =
    lageProblem === 'veraltet'
      ? 'Die Adresse wurde geändert, die Koordinaten passen nicht mehr dazu. Ergebnisse der Geodienste und Bestätigungen zur Lage gelten bis zur Aktualisierung nur als Hinweis.'
      : 'Keine Koordinaten zum Vorhaben (Adresse in den Stammdaten eintragen). Ergebnisse der Geodienste und Bestätigungen zur Lage gelten nur als Hinweis.';
  const rechtsstandTitel = `${paket.herkunft === 'nachgeladen' ? 'Regelpaket nachgeladen' : 'Regelpaket des Builds'} ${paket.version}${paketMeldung ? ` – ${paketMeldung}` : ''}${zeiten.length ? ` · Normen zuletzt an der Quelle bestätigt zwischen ${datumZeit(zeiten[0])} und ${datumZeit(zeiten[zeiten.length - 1])}` : ''}`;
  return (
    <div className="toolbar br-kopf" role="group" aria-label="Prüfung">
      <label className="br-kopf-feld">
        <span className="tb-label br-kopf-label">Antrag</span>
        <select className="br-antrag-wahl" value={antrag} onChange={(e) => onAntrag(e.target.value)} aria-label="Antrag" title={antrag}>
          {antraege.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <label className="br-kopf-feld" title="Stichtag der Prüfung: Fassung der Gesetze am Tag der Einreichung (z. B. § 42a, § 90 BauO NRW)">
        <span className="tb-label br-kopf-label">Einreichung</span>
        <input type="date" value={einreichung ?? heute()} min="2018-01-01" aria-label="Geplante Einreichung (Stichtag)" onChange={(e) => useBaurecht.getState().einreichungSetzen(e.target.value === heute() ? '' : e.target.value)} />
      </label>
      {/* Module kürzen sich zuerst; Warnungen sind eigene Marken und werden nie gekürzt */}
      <span className="br-module-text" title={`Regelmodule: ${stand.module.map((m) => `${m.name} (Stand ${m.version})`).join(', ')}`}>
        {moduleText}
      </span>
      <span className="br-kopf-marken">
        {agsWiderspruch && (
          <button type="button" className="br-modul-chip br-modul-widerspruch" onClick={zurAgs} title={`Gemeindeschlüssel widersprüchlich: ${ags?.widerspruch ?? ''} – bis zur Klärung gelten die Werte der Gebietsmodule nur als Hinweis. Klick: zur Angabe.`}>
            Gemeinde widersprüchlich
          </button>
        )}
        {agsVorschlag && (
          <button type="button" className="br-modul-chip br-modul-fehlt" onClick={zurAgs} title={`Der Gemeindeschlüssel ist nur vorgeschlagen – bis zur Bestätigung gelten die Werte der Gebietsmodule nur als Hinweis. Klick: zur Angabe${desktop ? ' (oder „Lage abfragen“)' : ''}.`}>
            Gemeinde unbestätigt
          </button>
        )}
        {lageText &&
          (desktop ? (
            <button type="button" className="br-modul-chip br-modul-fehlt" onClick={onLage} title={`${lageTitel} Klick: Lage abfragen.`}>
              {lageText}
            </button>
          ) : (
            <span className="br-modul-chip br-modul-fehlt" title={lageTitel} tabIndex={0}>
              {lageText}
            </span>
          ))}
        {stand.fehlend.map((e) => (
          <span key={e} className="br-modul-chip br-modul-fehlt" title={stand.ags ? `Für diesen Gemeindeschlüssel gibt es kein ${MODUL_TEXT[e]} – die Vorschriften dieser Ebene von Hand prüfen.` : `Gemeindeschlüssel fehlt – ${desktop ? '„Lage abfragen“ oder ' : ''}in den Angaben eintragen.`}>
            {stand.ags ? `kein ${MODUL_TEXT[e]}` : `${EBENE_TEXT[e]}: Gemeindeschlüssel fehlt`}
          </span>
        ))}
      </span>
      <span className="br-rechtsstand" aria-live="polite" title={rechtsstandTitel}>
        {laedt.length ? (
          <span className="br-laedt">{laedt.length} Texte werden geholt …</span>
        ) : !desktop ? (
          <span className="br-leise">Web-Version: ohne Gesetzestexte</span>
        ) : zeiten.length ? (
          <span className="br-rechtsstand-zeit">Rechtsstand {datumZeit(zeiten[0])}</span>
        ) : null}
      </span>
      {/* Warnungen: breit einzeln, schmal als Sammelmarke – nie gekürzt */}
      {ungeprueft || warnungen.length ? (
        <>
          <span className="br-kopf-marken br-nur-breit" aria-label="Warnungen zum Rechtsstand">
            {ungeprueft && <span className="br-marke br-marke-warn">Rechtsstand nicht geprüft</span>}
            {warnungen.map((w) => (
              <span key={w} className="br-marke br-marke-warn">
                {w}
              </span>
            ))}
          </span>
          <span className="br-kopf-marken br-nur-schmal">
            {/* Sammelmarke als Knopf: öffnet „Mehr“ mit den Warnungen im Einzelnen und „Rechtsstand prüfen“ */}
            <button type="button" className="br-marke br-marke-warn br-marke-knopf" data-menue-oeffner="" title={warnText.join(' · ')} aria-haspopup="menu" aria-expanded={mehrOffen} onClick={() => setMehrOffen(!mehrOffen)}>
              {warnText.length === 1 ? warnText[0] : `Rechtsstand: ${warnText.length} Warnungen`}
            </button>
          </span>
        </>
      ) : null}
      {desktop && (
        <span className="br-kopf-aktionen br-nur-breit">
          <button type="button" onClick={onLage} disabled={lageLaeuft} title="Gemeindeschlüssel, Flurstück und Schutzgebiete aus den Geodiensten am Grundstück">
            {lageLaeuft ? 'Lage …' : 'Lage abfragen'}
          </button>
          <button type="button" onClick={onRechtsstand} disabled={laedt.length > 0} title="Alle Texte sofort an der Quelle prüfen">
            Rechtsstand prüfen
          </button>
        </span>
      )}
      {desktop && (
        <span className="br-nur-schmal">
          <Menue titel="Mehr" label="Mehr – weitere Aktionen" offen={mehrOffen} setOffen={setMehrOffen}>
            {(zu) => (
              <>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={lageLaeuft}
                  onClick={() => {
                    zu();
                    onLage();
                  }}
                >
                  {lageLaeuft ? 'Lage wird abgefragt …' : 'Lage abfragen'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={laedt.length > 0}
                  onClick={() => {
                    zu();
                    onRechtsstand();
                  }}
                >
                  Rechtsstand prüfen
                </button>
                {warnText.length > 0 && (
                  <span className="br-menue-info" role="none">
                    {warnText.join(' · ')}
                  </span>
                )}
              </>
            )}
          </Menue>
        </span>
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
      <h3 className="br-klaeren-titel">Klärt am meisten</h3>
      {klaerung.slice(0, 4).map((k) => (
        <button key={k.id} type="button" className="br-chip-knopf" onClick={() => useBaurecht.getState().fokusSetzen(k.id)} title={`Diese Angabe entscheidet ${k.anzahl} offene Paragrafen`}>
          {k.titel} <span className="br-chip-zahl">klärt {k.anzahl}</span>
        </button>
      ))}
    </div>
  );
}
