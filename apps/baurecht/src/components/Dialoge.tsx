import { useEffect, useMemo, useRef, useState } from 'react';
import { Symbol } from '@core/ui/Symbol';
import { verweisName } from '@core/baurecht/typen';
import { create } from 'zustand';
import type { Ampel, FaktDef, FaktStatus, FaktWert, ParagrafErgebnis } from '@core/baurecht/typen';
import { faktStatus, wertAnzeige } from '@core/baurecht/typen';
import { angabeVonHand, hinweisBestaetigen } from '@core/baurecht/angaben';
import { isTauri } from '@core/platform/files';
import { Modal } from '@core/ui/Dialog';
import { benutzer, benutzerMerken } from '../benutzer';
import type { FolgeBeimSpeichern, Herabstufung } from '../pruefung';
import { aktuelleLage } from '../pruefung';
import { heute, PLANUNGSRECHT, useBaurecht } from '../store';
import { AMPEL_ERKLAERUNG, AMPEL_TEXT, AmpelMarke, aufzaehlen, datum } from './Ampel';

const RANG: Record<Ampel, number> = { rot: 2, gelb: 1, gruen: 0 };

/* ---------- Festlegen (erste Bestätigung) ---------- */

interface FestlegenState {
  p: ParagrafErgebnis | null;
  oeffnen: (p: ParagrafErgebnis) => void;
  schliessen: () => void;
}

const useFestlegen = create<FestlegenState>((set) => ({ p: null, oeffnen: (p) => set({ p }), schliessen: () => set({ p: null }) }));
export const festlegenOeffnen = (p: ParagrafErgebnis) => useFestlegen.getState().oeffnen(p);

/**
 * Ampel von Hand festlegen – Begründung Pflicht; beim Speichern wird noch einmal bestätigt. `fakten` sind alle
 * Angaben der Auswertung (Projektdatei, Module, Geodienste, von Hand): an ihnen hängt die Festlegung, ändern sie sich,
 * ist sie überholt.
 */
export function FestlegenDialog({ fakten, widerspruchMerkmale = [], paragrafen = [] }: { fakten: Record<string, FaktWert>; widerspruchMerkmale?: string[]; paragrafen?: ParagrafErgebnis[] }) {
  const beimOeffnen = useFestlegen((s) => s.p);
  // das aktuelle Ergebnis (der Text kann eintreffen, während der Dialog offen ist) – Warnung, Ansage und Summen passen
  // so zum selben Stand
  const p = (beimOeffnen && paragrafen.find((x) => x.id === beimOeffnen.id)) || beimOeffnen;
  const schliessen = useFestlegen((s) => s.schliessen);
  const texte = useBaurecht((s) => s.texte);
  const merkmale = useBaurecht((s) => s.merkmale);
  const [ampel, setAmpel] = useState<Ampel>('gelb');
  const [grund, setGrund] = useState('');
  const [von, setVon] = useState('');
  const [versucht, setVersucht] = useState(false);
  const [verwerfen, setVerwerfen] = useState(false);
  const feld = useRef<HTMLTextAreaElement>(null);
  const wahl = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    const p = beimOeffnen;
    if (!p) return;
    setVerwerfen(false);
    // Vorgabe: die bisherige Festlegung bzw. die automatische Ampel – eine Herabstufung wählt man bewusst
    setAmpel(p.festlegung?.ampel ?? p.automatisch);
    setGrund(p.festlegung?.grund ?? '');
    setVon(benutzer());
    setVersucht(false);
    // Startfokus auf die Entscheidung selbst (die gewählte Ampel), nicht erst auf die Begründung
    setTimeout(() => wahl.current?.querySelector<HTMLInputElement>('input:checked')?.focus(), 0);
  }, [beimOeffnen]);
  if (!p) return null;
  const herab = RANG[ampel] < RANG[p.automatisch];
  const ok = grund.trim().length >= 10 && von.trim().length > 0;
  // Esc bzw. Schließen mit getippter Begründung: erst nachfragen
  const zu = () => (grund.trim() && grund.trim() !== (p.festlegung?.grund ?? '') ? setVerwerfen(true) : schliessen());
  const festlegen = () => {
    setVersucht(true);
    if (!ok) {
      feld.current?.focus();
      return;
    }
    const fassung = texte[`${p.modul}/${p.norm}`]?.fassung;
    const summen: Record<string, string> = {};
    for (const f of p.fundstellen) if (fassung?.summen[f]) summen[f] = fassung.summen[f];
    const werte: Record<string, string | number | boolean | null> = {};
    const sicherheit: Record<string, FaktStatus> = {};
    for (const v of p.verwendet) {
      werte[v] = v.startsWith('merkmal:') ? (merkmale[v.slice(8)] ?? null) : (fakten[v]?.wert ?? null);
      if (!v.includes(':') && fakten[v]) sicherheit[v] = faktStatus(fakten[v]);
      // Merkmale: widerspricht eines schon beim Festlegen, macht derselbe Widerspruch die Festlegung nicht überholt
      if (v.startsWith('merkmal:')) sicherheit[v] = widerspruchMerkmale.includes(v.slice(8)) ? 'widerspruch' : 'sicher';
    }
    benutzerMerken(von);
    useBaurecht.getState().festlegen(p, ampel, grund, von.trim(), summen, werte, sicherheit);
    // angesagt (der Dialog verschwindet): was jetzt gilt – Entwurf bis zum Speichern
    // wirksam wie im Kern: ein „entfällt“ nur mit geprüftem, aktuellem Text, wo die Regel Prüfsummen hat
    const vorbehalt = ampel === 'gruen' ? p.entfaelltVorbehalt : undefined;
    useBaurecht.getState().ansagen(`${verweisName(p.paragraf, p.titel, useBaurecht.getState().paket.module.find((m) => m.id === p.modul)?.normen[p.norm]?.kurz ?? p.norm)}: von Hand „${AMPEL_TEXT[ampel]}“ festgelegt – ${vorbehalt ? `noch nicht wirksam (${vorbehalt}), es bleibt bei „${AMPEL_TEXT[p.automatisch === 'gruen' ? 'gelb' : p.automatisch]}“; ` : ''}Entwurf, beim Speichern noch einmal bestätigen`);
    schliessen();
  };
  // Überschrift mit Norm, benannte Einheiten ohne Doppelung („§ 1 ND-VO – Schutzobjekte“)
  const normKurz = useBaurecht.getState().paket.module.find((m) => m.id === p.modul)?.normen[p.norm]?.kurz ?? p.norm;
  const kopfzeile = verweisName(p.paragraf, p.titel, normKurz);
  return (
    <Modal titel={`${kopfzeile} – von Hand festlegen`} onClose={zu} breit klickDaneben={false} kopf>
      {/* Enter (z. B. in „Festgelegt von“) löst „Festlegen“ aus; die Pflichtfelder prüft der Dialog selbst */}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!verwerfen) festlegen();
        }}
      >
        <p className="br-leise">
          Automatisch: <AmpelMarke ampel={p.automatisch} klein /> {p.gruende[0]}
        </p>
        <fieldset className="br-wahl" ref={wahl}>
          <legend>Ampel</legend>
          {(['rot', 'gelb', 'gruen'] as const).map((a) => (
            <label key={a} className={`br-wahl-zeile${ampel === a ? ' br-gewaehlt' : ''}`}>
              {/* Name nur das Ampelwort, die Erklärung als Beschreibung (sonst hieße der Knopf „gilt muss beachtet …“) */}
              <input type="radio" name="ampel" checked={ampel === a} onChange={() => setAmpel(a)} aria-label={`${AMPEL_TEXT[a]}${a === p.automatisch ? ' (wie automatisch)' : ''}`} aria-describedby={`br-wahl-${a}`} />
              <AmpelMarke ampel={a} />
              <span id={`br-wahl-${a}`}>
                {AMPEL_ERKLAERUNG[a]}
                {a === p.automatisch ? ' (wie automatisch)' : ''}
              </span>
            </label>
          ))}
        </fieldset>
        {ampel === 'gruen' && p.entfaelltVorbehalt && (
          <div className="meldung warnung" role="note">
            {!texte[`${p.modul}/${p.norm}`]?.fassung
              ? `Ohne geprüften Gesetzestext greift „entfällt“ nicht: Die Ampel bleibt „${AMPEL_TEXT[p.automatisch === 'gruen' ? 'gelb' : p.automatisch]}“, bis der Text vorliegt (Desktop-App) und Sie dort erneut festlegen.`
              : `„Entfällt“ greift noch nicht (${p.entfaelltVorbehalt}): Die Ampel bleibt „${AMPEL_TEXT[p.automatisch === 'gruen' ? 'gelb' : p.automatisch]}“, bis das behoben ist (z. B. „Rechtsstand prüfen“).`}{' '}
            Die Begründung wird trotzdem gespeichert.
          </div>
        )}
        {herab && (
          <div className="meldung warnung" role="alert">
            Sie stufen von „{AMPEL_TEXT[p.automatisch]}“ auf „{AMPEL_TEXT[ampel]}“ herab. Das ist erlaubt, wenn der Sonderfall begründet ist – die Festlegung steht im Prüfprotokoll und muss beim Speichern noch einmal bestätigt werden.
          </div>
        )}
        {/* Feld und Beschriftung getrennt: das Beispiel gehört zur Beschreibung, nicht zum Namen des Felds */}
        <div className="field">
          <label className="field-label" htmlFor="br-festlegen-grund">
            Begründung <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="br-festlegen-grund"
            ref={feld}
            rows={4}
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            required
            aria-invalid={versucht && grund.trim().length < 10}
            aria-describedby={versucht && grund.trim().length < 10 ? 'br-festlegen-fehler br-festlegen-beispiel' : 'br-festlegen-beispiel'}
            placeholder="Worauf beruht die Einordnung?"
          />
          <span id="br-festlegen-beispiel" className="field-hint br-leise">
            Beispiel: Begehung am 03.11.2026 ohne Befund, Bericht im Projektordner
          </span>
          {versucht && grund.trim().length < 10 && (
            <span id="br-festlegen-fehler" className="field-hint br-fehler-text">
              Bitte begründen (mindestens 10 Zeichen) – die Begründung steht im Prüfprotokoll.
            </span>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="br-festlegen-von">
            Festgelegt von <span aria-hidden="true">*</span>
          </label>
          <input id="br-festlegen-von" value={von} onChange={(e) => setVon(e.target.value)} required />
        </div>
        {verwerfen ? (
          <div className="dialog-buttons br-verwerfen">
            <span className="meldung warnung" role="alert">
              Die Begründung ist noch nicht übernommen. Verwerfen?
            </span>
            <button type="button" onClick={() => setVerwerfen(false)}>
              Weiter bearbeiten
            </button>
            <button type="button" className="danger" onClick={schliessen}>
              Verwerfen
            </button>
          </div>
        ) : (
          <div className="dialog-buttons">
            <button type="button" onClick={zu}>
              Abbrechen
            </button>
            <button type="submit" className="primary">
              Festlegen
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}

/* ---------- Hinweis bestätigen bzw. Angabe von Hand setzen (erste Bestätigung) ---------- */

interface FaktZiel {
  id: string;
  titel: string;
  /** „bestaetigen“: einen Hinweis als gesichert übernehmen; „setzen“: einen Wert von Hand angeben */
  modus: 'bestaetigen' | 'setzen';
  /** bestätigen: der Hinweis; setzen: der neue Wert */
  wert: FaktWert;
  /** Eintrag der Prüfung beim Öffnen – hat er sich bis zum Bestätigen geändert (z. B. „Lage abfragen“), wird abgebrochen */
  vorher: string;
  /** die Angabe hängt an der Lage (Geodienst) – gilt nach dem Setzen nur für die aktuelle Lage */
  lagebezug?: boolean;
}

const useFaktBestaetigen = create<{ ziel: FaktZiel | null }>(() => ({ ziel: null }));
const eintrag = (id: string) => JSON.stringify(useBaurecht.getState().pruefung.fakten[id] ?? null);
/** Element, das den Dialog geöffnet hat – dorthin geht der Fokus zurück (gibt es es nicht mehr: in die Zeile der Angabe) */
let oeffner: HTMLElement | null = null;
const merken = () => {
  oeffner = document.activeElement instanceof HTMLElement ? document.activeElement : null;
};
function fokusZurueck(id: string) {
  setTimeout(() => {
    if (oeffner?.isConnected) oeffner.focus();
    else document.querySelector<HTMLElement>(`[data-fakt="${CSS.escape(id)}"] :is(button:not([disabled]), input, select)`)?.focus();
    oeffner = null;
  }, 0);
}
export const faktBestaetigenOeffnen = (id: string, titel: string, wert: FaktWert, lagebezug = false) => {
  merken();
  useFaktBestaetigen.setState({ ziel: { id, titel, modus: 'bestaetigen', wert, vorher: eintrag(id), lagebezug } });
};
export const faktSetzenOeffnen = (id: string, titel: string, wert: FaktWert['wert'], lagebezug = false) => {
  merken();
  useFaktBestaetigen.setState({ ziel: { id, titel, modus: 'setzen', wert: { wert, herkunft: 'manuell', sicherheit: 'sicher' }, vorher: eintrag(id), lagebezug } });
};

/** Definition einer Angabe (Typ, Einheit) – für die Anzeige der Werte („139,12 m²“, „3“) */
export type FaktDefVon = (id: string) => FaktDef | undefined;

/** Folgen einer Angabe: wie viele Paragrafen dadurch auf „entfällt“ (bzw. schwächer) gehen – für die Dialoge */
export type FolgenRechner = (id: string, wert: FaktWert | null) => { herab: { id: string; titel: string; von: Ampel; nach: Ampel }[]; nachher?: FaktWert };

/** Pfeil sichtbar, „wird zu“ für Screenreader (ein aria-label an einem span ohne Rolle wird nicht verlässlich vorgelesen) */
function Pfeil() {
  return (
    <>
      <Symbol name="pfeilRechts" />
      <span className="br-unsichtbar"> wird zu </span>
    </>
  );
}

function Folgen({ folgen, allein }: { folgen: { herab: Herabstufung[] }; allein?: boolean }) {
  const [auf, setAuf] = useState(false);
  if (!folgen.herab.length) return <p className="br-leise">{allein ? 'Allein ändert dadurch keine Vorschrift ihre Ampel.' : 'Keine Vorschrift ändert dadurch ihre Ampel.'}</p>;
  const gruen = folgen.herab.filter((h) => h.nach === 'gruen').length;
  return (
    <details className="br-folgen" onToggle={(e) => setAuf((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <strong>
          Stuft {folgen.herab.length} {folgen.herab.length === 1 ? 'Vorschrift' : 'Vorschriften'}
          {gruen === folgen.herab.length ? ' auf „entfällt“' : ''} herab
        </strong>
        {gruen && gruen < folgen.herab.length ? `, davon ${gruen} auf „entfällt“` : ''} – Liste {auf ? 'ausblenden' : 'anzeigen'}
      </summary>
      <ul>
        {folgen.herab.map((h) => (
          <li key={h.id}>
            <AmpelMarke ampel={h.von} klein /> <Pfeil /> <AmpelMarke ampel={h.nach} klein /> {h.titel}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Einen Hinweis (z. B. „kein Treffer im Landschaftsschutzgebiet“) als gesichert übernehmen bzw. eine Angabe zu
 * Schutzgebieten und Geodaten von Hand setzen: nur mit Begründung (worauf gestützt, z. B. Auskunft der Behörde mit
 * Datum). Der Dialog zeigt, welche Vorschriften dadurch herabgestuft werden. Geodaten gelten nur für die aktuelle Lage;
 * beim Speichern wird die Angabe noch einmal abgefragt und steht im Prüfprotokoll.
 */
export function FaktBestaetigenDialog({ folgen, faktDef = () => undefined }: { folgen: FolgenRechner; faktDef?: FaktDefVon }) {
  const ziel = useFaktBestaetigen((s) => s.ziel);
  const project = useBaurecht((s) => s.project);
  const [grund, setGrund] = useState('');
  const [von, setVon] = useState('');
  const [versucht, setVersucht] = useState(false);
  const [veraltet, setVeraltet] = useState(false);
  const [verwerfen, setVerwerfen] = useState(false);
  const feld = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!ziel) return;
    setGrund('');
    setVon(benutzer());
    setVersucht(false);
    setVeraltet(false);
    setVerwerfen(false);
    setTimeout(() => feld.current?.focus(), 0);
  }, [ziel]);
  // Vorschau: genau die Rechnung der Übernahme (angabeVonHand bzw. hinweisBestaetigen) – Lagebezug, Beleg, Widerspruch
  const vorschau = useMemo(() => {
    if (!ziel) return null;
    const lage = ziel.lagebezug ? aktuelleLage(project).lage : undefined;
    const o = { von: 'Vorschau', grund: 'Vorschau', lage, heute: heute(), desktop: isTauri() };
    const neu = ziel.modus === 'setzen' ? angabeVonHand(useBaurecht.getState().pruefung.fakten[ziel.id], ziel.id, ziel.wert.wert, o) : hinweisBestaetigen(ziel.wert, o);
    return folgen(ziel.id, neu);
  }, [ziel, folgen, project]);
  if (!ziel) return null;
  const schliessen = () => {
    const id = ziel.id;
    useFaktBestaetigen.setState({ ziel: null });
    fokusZurueck(id);
  };
  const zu = () => (grund.trim() ? setVerwerfen(true) : schliessen());
  const ok = grund.trim().length >= 10 && von.trim().length > 0;
  const bestaetigen = () => {
    setVersucht(true);
    if (!ok) {
      feld.current?.focus();
      return;
    }
    if (eintrag(ziel.id) !== ziel.vorher) {
      setVeraltet(true);
      return;
    }
    benutzerMerken(von);
    // Lagebezug (Schutzgebiete, Geodaten): an die aktuelle Lage binden; ohne gültige Koordinaten bleibt es Hinweis (null)
    const lage = ziel.lagebezug ? aktuelleLage(project).lage : undefined;
    if (ziel.modus === 'setzen') useBaurecht.getState().faktSetzen(ziel.id, ziel.wert.wert, von.trim(), grund, lage);
    else useBaurecht.getState().faktBestaetigen(ziel.id, ziel.wert, von.trim(), grund, lage);
    schliessen();
  };
  const geo = ziel.wert.herkunft === 'geodienst';
  const fehlerId = 'br-fakt-grund-fehler';
  return (
    <Modal titel={`${ziel.titel}: „${wertAnzeige(ziel.wert.wert, faktDef(ziel.id))}“ ${ziel.modus === 'setzen' ? 'von Hand setzen' : 'bestätigen'}`} onClose={zu} breit klickDaneben={false} kopf>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!verwerfen) bestaetigen();
        }}
      >
        {ziel.modus === 'bestaetigen' ? (
          <p className="br-leise">
            {/* der Grund sagt schon, woher der Wert kommt – die Quelle nur ohne Grund */}
            Bisher nur Hinweis: {ziel.wert.grund ?? (ziel.wert.quelle ? `${ziel.wert.quelle} – nicht gesichert` : 'nicht gesichert')}
          </p>
        ) : (
          <p className="br-leise">Angaben zu Schutzgebieten und Geodaten gelten von Hand nur mit Beleg. Widerspricht die Angabe einem Treffer eines Dienstes, bleibt der Widerspruch sichtbar – betroffene Vorschriften werden dann nicht „entfällt“.</p>
        )}
        {vorschau && <Folgen folgen={vorschau} />}
        {vorschau?.nachher?.widerspruch && (
          <div className="meldung fehler" role="note">
            <strong>Widerspruch bleibt:</strong> {vorschau.nachher.widerspruch}. Vorschriften, die an dieser Angabe hängen, werden dadurch nicht „entfällt“.
          </div>
        )}
        <div className="meldung warnung" role="note">
          Die Angabe gilt danach als gesichert. Bitte nur angeben, was belegt ist – die Begründung steht im Prüfprotokoll.
          {ziel.lagebezug ? (aktuelleLage(project).lage ? ' Sie gilt nur für die aktuelle Lage des Vorhabens.' : ' Ohne Koordinaten, die zur Adresse passen, lässt sie sich an keine Lage binden und bleibt Hinweis.') : ''}
        </div>
        {veraltet && (
          <div className="meldung fehler" role="alert">
            Die Angabe hat sich inzwischen geändert (z. B. durch „Lage abfragen“). Bitte den Dialog schließen und neu prüfen.
          </div>
        )}
        <label className="field">
          <span className="field-label">
            Worauf gestützt? <span aria-hidden="true">*</span>
          </span>
          <textarea
            ref={feld}
            rows={3}
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            aria-required="true"
            aria-invalid={versucht && grund.trim().length < 10}
            aria-describedby={versucht && grund.trim().length < 10 ? `${fehlerId} br-fakt-beispiel` : 'br-fakt-beispiel'}
            placeholder="Beleg: Unterlage oder Auskunft mit Datum"
          />
          <span id="br-fakt-beispiel" className="field-hint br-leise">
            Beispiel:{' '}
            {ziel.id.startsWith('lage.')
              ? 'Auszug aus dem Liegenschaftskataster vom 03.11.2026'
              : geo || ziel.id.startsWith('schutz.')
                ? 'Auskunft der Unteren Naturschutzbehörde vom 03.11.2026, Aktenzeichen …'
                : ziel.wert.herkunft === 'flaechen' || ziel.wert.herkunft === 'grz'
                  ? 'Modell vollständig geprüft am 12.11.2026'
                  : 'Unterlage, Auskunft oder Prüfung mit Datum'}
          </span>
          {versucht && grund.trim().length < 10 && (
            <span id={fehlerId} className="field-hint br-fehler-text">
              Bitte angeben, worauf die Angabe beruht (mindestens 10 Zeichen).
            </span>
          )}
        </label>
        <label className="field">
          <span className="field-label">
            {ziel.modus === 'setzen' ? 'Angegeben von' : 'Bestätigt von'} <span aria-hidden="true">*</span>
          </span>
          <input value={von} onChange={(e) => setVon(e.target.value)} aria-required="true" />
        </label>
        {verwerfen ? (
          <div className="dialog-buttons br-verwerfen">
            <span className="meldung warnung" role="alert">
              Die Begründung ist noch nicht übernommen. Verwerfen?
            </span>
            <button type="button" onClick={() => setVerwerfen(false)}>
              Weiter bearbeiten
            </button>
            <button type="button" className="danger" onClick={schliessen}>
              Verwerfen
            </button>
          </div>
        ) : (
          <div className="dialog-buttons">
            <button type="button" onClick={zu}>
              Abbrechen
            </button>
            <button type="submit" className="primary">
              {ziel.modus === 'setzen' ? 'Übernehmen' : 'Bestätigen'}
            </button>
          </div>
        )}
      </form>
    </Modal>
  );
}

/* ---------- Bestätigen beim Speichern (zweite Bestätigung) ---------- */

export type BestaetigenAntwort = 'bestaetigen' | 'ohne' | 'abbrechen';

interface Offen {
  festlegungen: string[];
  fakten: string[];
}

interface BestaetigenState {
  offen: Offen | null;
  antwort: ((a: BestaetigenAntwort) => void) | null;
}

const useBestaetigen = create<BestaetigenState>(() => ({ offen: null, antwort: null }));

/** Festlegungen und bestätigte Hinweise vor dem Speichern noch einmal bestätigen lassen; liefert die Antwort */
export function bestaetigenFragen(offen: Offen): Promise<BestaetigenAntwort> {
  return new Promise((resolve) =>
    useBestaetigen.setState({
      offen,
      antwort: (a) => {
        useBestaetigen.setState({ offen: null, antwort: null });
        resolve(a);
      },
    }),
  );
}

export function BestaetigenDialog({ titel, faktTitel, folgen, faktDef = () => undefined }: {
  faktDef?: FaktDefVon; titel: (id: string) => { titel: string; automatisch?: Ampel; ampel?: Ampel; ueberholt?: string; unwirksam?: string }; faktTitel: (id: string) => string; folgen: (ids: string[]) => { je: Record<string, FolgeBeimSpeichern>; zusammen: Herabstufung[] } }) {
  const offen = useBestaetigen((s) => s.offen);
  const antwort = useBestaetigen((s) => s.antwort);
  const festlegungen = useBaurecht((s) => s.pruefung.festlegungen);
  const inDatei = useBaurecht((s) => s.pruefungDatei.festlegungen);
  const fakten = useBaurecht((s) => s.pruefung.fakten);
  const planungsrechtOrt = useBaurecht((s) => s.pruefung.planungsrechtOrt);
  const [geprueft, setGeprueft] = useState(false);
  useEffect(() => setGeprueft(false), [offen]);
  // Folgen gegenüber der Datei – je Punkt allein und zusammen; einmal je Öffnen und Stand (nicht bei jedem Haken neu)
  const fb = useMemo(() => (offen?.fakten.length ? folgen(offen.fakten) : null), [offen, folgen]);
  // nur Punkte mit eigener Zeile (eine zurückgenommene Bestätigung hat keine)
  const ids = (offen?.fakten ?? []).filter((id) => id === PLANUNGSRECHT || !!fakten[id]?.bestaetigt);
  const folgenJe = fb?.je ?? {};
  const name = (id: string) => (id === PLANUNGSRECHT ? 'das Planungsrecht' : `„${faktTitel(id)}“`);
  const auch = (id: string) => {
    const a = folgenJe[id]?.auch;
    if (!a) return null;
    return (
      <p className="br-leise">
        {a.anzahl === folgenJe[id].herab.length ? (a.anzahl === 1 ? 'Diese' : 'Alle') : `${a.anzahl} davon`} ebenso durch {aufzaehlen(a.mit.map(name))} – siehe „Zusammen“ unten.
      </p>
    );
  };
  if (!offen || !antwort) return null;
  // überholte Festlegungen lassen sich so nicht bestätigen – erst erneut festlegen oder aufheben
  const ueberholte = offen.festlegungen.filter((id) => festlegungen[id] && titel(id).ueberholt);
  // getrennt gezählt: Festlegungen von Hand und gesicherte Angaben
  // das Planungsrecht eigens benannt (es ist ein Antragsmerkmal, keine Angabe)
  const nf = offen.festlegungen.length;
  const pr = offen.fakten.includes(PLANUNGSRECHT);
  const na = offen.fakten.length - (pr ? 1 : 0);
  // was genau: neue, geänderte und aufgehobene Festlegungen, neu gesicherte Angaben, das Planungsrecht
  const zahl = (n: number, eins: string, viele: string) => (n === 1 ? eins : `${n} ${viele}`);
  const fNeu = offen.festlegungen.filter((id) => festlegungen[id] && !inDatei[id]).length;
  const fGeaendert = offen.festlegungen.filter((id) => festlegungen[id] && inDatei[id]).length;
  const fAuf = offen.festlegungen.filter((id) => !festlegungen[id] && inDatei[id]).length;
  const teile = [
    fNeu ? zahl(fNeu, 'eine neue Festlegung von Hand', 'neue Festlegungen von Hand') : '',
    fGeaendert ? zahl(fGeaendert, 'eine geänderte Festlegung', 'geänderte Festlegungen') : '',
    fAuf ? zahl(fAuf, 'eine aufgehobene Festlegung', 'aufgehobene Festlegungen') : '',
    na ? zahl(na, 'eine neu gesicherte Angabe', 'neu gesicherte Angaben') : '',
    pr ? 'die Bestätigung des Planungsrechts für diesen Ort' : '',
  ].filter(Boolean);
  const geprueftTeile = [nf ? (nf === 1 ? 'diese Festlegung' : 'diese Festlegungen') : '', na ? (na === 1 ? 'diese Angabe' : 'diese Angaben') : '', pr ? 'das Planungsrecht für diesen Ort' : ''].filter(Boolean);
  return (
    <Modal titel="Vor dem Speichern bestätigen" onClose={() => antwort('abbrechen')} breit klickDaneben={false} beschreibung="br-bestaetigen-einleitung" className="br-bestaetigen">
      {/* Kopf und Fuß (Häkchen, Knöpfe) stehen fest, dazwischen ein einziger Scrollbereich */}
      <div className="br-bestaetigen-kopf-fest">
        <h3>Vor dem Speichern bestätigen</h3>
        <p id="br-bestaetigen-einleitung">
          Seit dem letzten Speichern: {aufzaehlen(teile)}. Bitte noch einmal prüfen – alles steht mit Begründung, Namen und Datum im Prüfprotokoll.
        </p>
      </div>
      {/* mit Tab erreichbar (mit Pfeiltasten scrollbar) – sonst bestätigte man Einträge, die man nicht sehen kann */}
      <div className="br-bestaetigen-inhalt" tabIndex={0} role="region" aria-label="Änderungen seit dem letzten Speichern">
      <ul className="br-bestaetigen-liste">
        {offen.festlegungen.map((id) => {
          const f = festlegungen[id];
          const alt = inDatei[id];
          const t = titel(id);
          if (f) {
            const herab = RANG[f.ampel] < RANG[f.automatisch];
            return (
              <li key={id} className={herab ? 'br-herab' : ''}>
                <div className="br-bestaetigen-kopf">
                  <strong>{t.titel}</strong>
                  {f.ampel === f.automatisch ? (
                    <span className="br-bestaetigen-ampeln">
                      bleibt <AmpelMarke ampel={f.ampel} klein /> <span className="br-leise">(wie automatisch)</span>
                    </span>
                  ) : (
                    <span className="br-bestaetigen-ampeln">
                      <AmpelMarke ampel={f.automatisch} klein /> <Pfeil /> <AmpelMarke ampel={f.ampel} klein />
                    </span>
                  )}
                </div>
                <div className="br-leise">
                  {f.von}
                  {f.am ? `, ${datum(f.am)}` : ''}: {f.grund}
                </div>
                {/* geändert: der Stand der Datei daneben – was die zweite Bestätigung ersetzt */}
                {alt && (alt.ampel !== f.ampel || alt.grund !== f.grund) && (
                  <div className="br-leise">
                    bisher: {AMPEL_TEXT[alt.ampel]} ({alt.von}
                    {alt.am ? `, ${datum(alt.am)}` : ''}: {alt.grund})
                  </div>
                )}
                {herab && <div className="br-warn-text">Herabstufung</div>}
                {f.ampel === f.automatisch && <div className="br-leise">Wie automatisch – die Festlegung bleibt, solange sich die beteiligten Angaben nicht ändern.</div>}
                {t.ueberholt && (
                  <div className="br-fehler-text">
                    <strong>Überholt:</strong> {t.ueberholt}. So nicht bestätigbar – bitte erneut festlegen oder aufheben.
                  </div>
                )}
                {!t.ueberholt && t.unwirksam && (
                  <div className="br-warn-text">
                    <strong>Noch nicht wirksam:</strong> {t.unwirksam}. Sie wird gespeichert, zählt aber erst mit geprüftem Text{t.ampel ? ` – bis dahin „${AMPEL_TEXT[t.ampel]}“` : ''}.
                  </div>
                )}
              </li>
            );
          }
          if (!alt) return null;
          // aufgehoben: es gilt wieder die automatische Ampel
          const jetzt = t.automatisch ?? alt.automatisch;
          const herab = RANG[jetzt] < RANG[alt.ampel];
          return (
            <li key={id} className={herab ? 'br-herab' : ''}>
              <div className="br-bestaetigen-kopf">
                <strong>{t.titel}</strong>
                <span className="br-bestaetigen-ampeln">
                  <AmpelMarke ampel={alt.ampel} klein /> <Pfeil /> <AmpelMarke ampel={jetzt} klein />
                </span>
              </div>
              <div className="br-leise">
                Festlegung aufgehoben (bisher {AMPEL_TEXT[alt.ampel]}, {alt.von}
                {alt.am ? `, ${datum(alt.am)}` : ''}: {alt.grund}) – es gilt wieder die automatische Ampel.
              </div>
              {herab && <div className="br-warn-text">Herabstufung</div>}
            </li>
          );
        })}
        {offen.fakten.map((id) => {
          // Planungsrecht für diesen Ort bestätigt – mit Folgen wie eine gesicherte Angabe
          if (id === PLANUNGSRECHT) {
            const po = planungsrechtOrt;
            const fo = folgenJe[id] ?? { herab: [] };
            return (
              <li key={id} className={fo.herab.length ? 'br-herab' : ''}>
                <div className="br-bestaetigen-kopf">
                  <strong>Planungsrecht</strong>
                  <span className="br-marke">für diesen Ort bestätigt: {po?.wert ?? '–'}</span>
                </div>
                <div className="br-leise">
                  {po?.von ? `${po.von}${po.am ? `, ${datum(po.am)}` : ''}: ` : ''}gilt für {po?.anzeige ?? 'diesen Ort'}
                </div>
                <Folgen folgen={fo} allein={ids.length > 1} />
                {auch(id)}
              </li>
            );
          }
          const f = fakten[id];
          if (!f?.bestaetigt) return null;
          const fo = folgenJe[id] ?? { herab: [] };
          return (
            <li key={id} className={fo.herab.length ? 'br-herab' : ''}>
              <div className="br-bestaetigen-kopf">
                <strong>{faktTitel(id)}</strong>
                <span className="br-marke">
                  {f.herkunft === 'manuell' ? 'von Hand' : 'Hinweis bestätigt'}: {wertAnzeige(f.wert, faktDef(id))}
                </span>
              </div>
              <div className="br-leise">
                {f.bestaetigt.von}
                {f.bestaetigt.am ? `, ${datum(f.bestaetigt.am)}` : ''}: {f.bestaetigt.grund ?? '–'}
              </div>
              <Folgen folgen={fo} allein={ids.length > 1} />
              {auch(id)}
            </li>
          );
        })}
      </ul>
      {/* mehrere Bestätigungen: was sie zusammen gegenüber der Datei bewirken (auch, was jede allein schon entschiede) */}
      {fb && ids.length > 1 && (
        <div className="br-folgen-zusammen">
          <strong>Zusammen (gegenüber dem Stand ohne diese Bestätigungen):</strong>
          <Folgen folgen={{ herab: fb.zusammen }} />
        </div>
      )}
      {ueberholte.length > 0 && (
        <div className="meldung fehler" role="alert">
          {ueberholte.length === 1 ? 'Eine Festlegung ist überholt' : `${ueberholte.length} Festlegungen sind überholt`} – „Bestätigen und speichern“ geht erst, wenn {ueberholte.length === 1 ? 'sie erneut festgelegt oder aufgehoben ist' : 'sie erneut festgelegt oder aufgehoben sind'}. „Speichern, diese als Entwurf behalten“ geht.
        </div>
      )}
      </div>
      <div className="br-bestaetigen-fuss">
      <label className="toggle br-geprueft">
        <input type="checkbox" data-startfokus="" checked={geprueft} disabled={ueberholte.length > 0} onChange={(e) => setGeprueft(e.target.checked)} /> Ich habe {aufzaehlen(geprueftTeile)} geprüft.
      </label>
      <div className="dialog-buttons">
        <button type="button" onClick={() => antwort('abbrechen')}>
          Abbrechen
        </button>
        <button type="button" onClick={() => antwort('ohne')} title="Speichert alles andere; für diese Festlegungen bzw. Angaben bleibt in der Datei der bisherige Stand. In der App bleiben sie als Entwurf erhalten.">
          Speichern, diese als Entwurf behalten
        </button>
        <button type="button" className="primary" disabled={!geprueft || ueberholte.length > 0} onClick={() => antwort('bestaetigen')}>
          Bestätigen und speichern
        </button>
      </div>
      </div>
    </Modal>
  );
}
