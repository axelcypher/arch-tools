import { useEffect, useMemo, useState } from 'react';
import { Symbol } from '@core/ui/Symbol';
import { verweisName } from '@core/baurecht/typen';
import { create } from 'zustand';
import type { Ampel, FaktDef, FaktStatus, FaktWert, ParagrafErgebnis } from '@core/baurecht/typen';
import { faktStatus, wertAnzeige } from '@core/baurecht/typen';
import { angabeVonHand, hinweisBestaetigen } from '@core/baurecht/angaben';
import { isTauri } from '@core/platform/files';
import { Modal } from '@core/ui/Dialog';
import { benutzer, benutzerMerken } from '../benutzer';
import type { Herabstufung } from '../pruefung';
import { aktuelleLage } from '../pruefung';
import { heute, useBaurecht } from '../store';
import { AMPEL_ERKLAERUNG, AMPEL_TEXT, AmpelMarke, datum } from './Ampel';

const RANG: Record<Ampel, number> = { rot: 2, gelb: 1, gruen: 0 };

/* ---------- Festlegen ---------- */

interface FestlegenState {
  p: ParagrafErgebnis | null;
  oeffnen: (p: ParagrafErgebnis) => void;
  schliessen: () => void;
}

const useFestlegen = create<FestlegenState>((set) => ({ p: null, oeffnen: (p) => set({ p }), schliessen: () => set({ p: null }) }));
export const festlegenOeffnen = (p: ParagrafErgebnis) => useFestlegen.getState().oeffnen(p);

/**
 * Ampel von Hand festlegen – ein Klick genügt, ohne Begründungstext und ohne weitere Rückfrage beim Speichern. Das
 * Protokoll vermerkt Ampel, Namen und Datum. `fakten` sind alle Angaben der Auswertung (Projektdatei, Module,
 * Geodienste, von Hand): an ihnen hängt die Festlegung, ändern sie sich, ist sie überholt.
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
  const [von, setVon] = useState('');
  useEffect(() => {
    const p = beimOeffnen;
    if (!p) return;
    // Vorgabe: die bisherige Festlegung bzw. die automatische Ampel – eine Herabstufung wählt man bewusst
    setAmpel(p.festlegung?.ampel ?? p.automatisch);
    setVon(benutzer());
  }, [beimOeffnen]);
  if (!p) return null;
  const herab = RANG[ampel] < RANG[p.automatisch];
  const festlegen = () => {
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
    // ohne Namen: der gemerkte bzw. der aus den Stammdaten – das Feld ist kein Pflichtfeld
    const wer = von.trim() || benutzer();
    if (von.trim()) benutzerMerken(von);
    useBaurecht.getState().festlegen(p, ampel, wer, summen, werte, sicherheit);
    // angesagt (der Dialog verschwindet): was jetzt gilt
    // wirksam wie im Kern: ein „entfällt“ nur mit geprüftem, aktuellem Text, wo die Regel Prüfsummen hat
    const vorbehalt = ampel === 'gruen' ? p.entfaelltVorbehalt : undefined;
    useBaurecht.getState().ansagen(`${verweisName(p.paragraf, p.titel, useBaurecht.getState().paket.module.find((m) => m.id === p.modul)?.normen[p.norm]?.kurz ?? p.norm)}: von Hand „${AMPEL_TEXT[ampel]}“ festgelegt${vorbehalt ? ` – noch nicht wirksam (${vorbehalt}), es bleibt bei „${AMPEL_TEXT[p.automatisch === 'gruen' ? 'gelb' : p.automatisch]}“` : ''}`);
    schliessen();
  };
  // Überschrift mit Norm, benannte Einheiten ohne Doppelung („§ 1 ND-VO – Schutzobjekte“)
  const normKurz = useBaurecht.getState().paket.module.find((m) => m.id === p.modul)?.normen[p.norm]?.kurz ?? p.norm;
  const kopfzeile = verweisName(p.paragraf, p.titel, normKurz);
  return (
    <Modal titel={`${kopfzeile} – von Hand festlegen`} onClose={schliessen} breit klickDaneben={false} kopf>
      {/* Enter (z. B. in „Festgelegt von“) löst „Festlegen“ aus */}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          festlegen();
        }}
      >
        <p className="br-leise">
          Automatisch: <AmpelMarke ampel={p.automatisch} klein /> {p.gruende[0]}
        </p>
        <fieldset className="br-wahl">
          <legend>Ampel</legend>
          {(['rot', 'gelb', 'gruen'] as const).map((a) => (
            <label key={a} className={`br-wahl-zeile${ampel === a ? ' br-gewaehlt' : ''}`}>
              {/* Name nur das Ampelwort, die Erklärung als Beschreibung (sonst hieße der Knopf „gilt muss beachtet …“) */}
              {/* Startfokus auf die Entscheidung selbst (die gewählte Ampel) */}
              <input type="radio" name="ampel" checked={ampel === a} data-startfokus={ampel === a ? '' : undefined} onChange={() => setAmpel(a)} aria-label={`${AMPEL_TEXT[a]}${a === p.automatisch ? ' (wie automatisch)' : ''}`} aria-describedby={`br-wahl-${a}`} />
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
            Die Festlegung wird trotzdem gespeichert.
          </div>
        )}
        {herab && (
          <div className="meldung warnung" role="alert">
            Sie stufen von „{AMPEL_TEXT[p.automatisch]}“ auf „{AMPEL_TEXT[ampel]}“ herab. Das ist in einem Sonderfall erlaubt – die Festlegung steht mit Namen und Datum im Prüfprotokoll und ist überall als „von Hand“ gekennzeichnet.
          </div>
        )}
        {/* eine Begründung aus einer älteren Datei: sichtbar, bevor die neue Festlegung sie ersetzt */}
        {p.festlegung?.grund && (
          <p className="br-leise">
            Bisherige Begründung ({p.festlegung.von}
            {p.festlegung.am ? `, ${datum(p.festlegung.am)}` : ''}): {p.festlegung.grund} – eine neue Festlegung ersetzt sie.
          </p>
        )}
        <div className="field">
          <label className="field-label" htmlFor="br-festlegen-von">
            Festgelegt von
          </label>
          <input id="br-festlegen-von" value={von} onChange={(e) => setVon(e.target.value)} placeholder={benutzer()} aria-describedby="br-festlegen-von-hinweis" />
          <NameHinweis id="br-festlegen-von-hinweis" leer={!von.trim()} />
        </div>
        <div className="dialog-buttons">
          <button type="button" onClick={schliessen}>
            Abbrechen
          </button>
          <button type="submit" className="primary">
            Festlegen
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Hinweis am Namensfeld: es ist kein Pflichtfeld – leer gilt der vorbelegte Name (gemerkt bzw. aus den Stammdaten).
 * Sichtbar nur bei leerem Feld (vorbelegt wiederholte er den Inhalt); für Screenreader immer da.
 */
function NameHinweis({ id, leer }: { id: string; leer: boolean }) {
  return (
    <span id={id} className={leer ? 'field-hint br-leise' : 'unsichtbar'}>
      Leer: „{benutzer()}“
    </span>
  );
}

/* ---------- Hinweis bestätigen bzw. Angabe von Hand setzen ---------- */

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

const useFaktBestaetigen = create<{ ziel: FaktZiel | null; geschlossen: number }>(() => ({ ziel: null, geschlossen: 0 }));
/** zählt, wie oft der Beleg-Dialog geschlossen wurde – ein Eingabefeld, das ihn geöffnet hat, setzt sich damit zurück (abgebrochen: es zeigt wieder den geltenden Wert) */
export const useBelegDialogGeschlossen = () => useFaktBestaetigen((s) => s.geschlossen);
const eintrag = (id: string) => JSON.stringify(useBaurecht.getState().pruefung.fakten[id] ?? null);
/** Element, das den Dialog geöffnet hat – dorthin geht der Fokus zurück (gibt es es nicht mehr: in die Zeile der Angabe) */
let oeffner: HTMLElement | null = null;
const merken = () => {
  oeffner = document.activeElement instanceof HTMLElement ? document.activeElement : null;
};
function fokusZurueck(id: string) {
  setTimeout(() => {
    if (oeffner?.isConnected) oeffner.focus();
    else {
      // die Zeile wurde neu aufgebaut: auf den gewählten Wert bzw. den Tabstopp der Gruppe, sonst das erste Bedienelement
      const zeile = document.querySelector<HTMLElement>(`[data-fakt="${CSS.escape(id)}"]`);
      (zeile?.querySelector<HTMLElement>('[aria-pressed="true"], .segment [tabindex="0"]') ?? zeile?.querySelector<HTMLElement>(':is(button:not([disabled]), input, select)'))?.focus();
    }
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

/* ---------- „Keine davon“: offene Vorfragen einer Gruppe mit „nein“ ---------- */

interface VorfragenNeinZiel {
  /** Gruppe der Angaben (Titel), z. B. „Schutzgebiete und Denkmal“ */
  gruppe: string;
  /** die Angaben hängen an der Lage – gelten nach dem Setzen nur für die aktuelle Lage */
  lagebezug: boolean;
  /** je Vorfrage: Kennung, Name, Frage und der Eintrag beim Öffnen (hat er sich geändert, wird abgebrochen) */
  ziele: { id: string; titel: string; frage?: string; vorher: string }[];
}
const useVorfragenNein = create<{ ziel: VorfragenNeinZiel | null }>(() => ({ ziel: null }));
export const vorfragenNeinOeffnen = (ziele: { id: string; titel: string; frage?: string }[], lagebezug: boolean, gruppe: string) => {
  if (!ziele.length) return;
  merken();
  useVorfragenNein.setState({ ziel: { gruppe, lagebezug, ziele: ziele.map((z) => ({ ...z, vorher: eintrag(z.id) })) } });
};

/**
 * Mehrere Vorfragen auf einmal mit „nein“ beantworten – ein Klick, ohne Begründungstext. Der Dialog nennt jede Vorfrage
 * mit ihrer Frage und zeigt, was alle zusammen herabstufen; das Protokoll vermerkt je Angabe Namen und Datum. Danach
 * Fokus auf die erste Vorfrage (der Knopf „Keine davon …“ verschwindet), eine Ansage.
 */
export function VorfragenNeinDialog({ folgen }: { folgen: FolgenRechner }) {
  const ziel = useVorfragenNein((s) => s.ziel);
  const project = useBaurecht((s) => s.project);
  const [von, setVon] = useState('');
  const [veraltet, setVeraltet] = useState(false);
  useEffect(() => {
    if (!ziel) return;
    setVon(benutzer());
    setVeraltet(false);
  }, [ziel]);
  const vorschau = useMemo(() => {
    if (!ziel) return null;
    const lage = ziel.lagebezug ? aktuelleLage(project).lage : undefined;
    const o = { von: 'Vorschau', bestaetigt: true, lage, heute: heute(), desktop: isTauri() };
    const alle = Object.fromEntries(ziel.ziele.map((z) => [z.id, angabeVonHand(useBaurecht.getState().pruefung.fakten[z.id], z.id, false, o)]));
    const [erste] = ziel.ziele;
    return folgen(erste.id, alle[erste.id], alle);
  }, [ziel, folgen, project]);
  if (!ziel) return null;
  const schliessen = (danach?: string) => {
    useVorfragenNein.setState({ ziel: null });
    if (danach) {
      oeffner = null;
      useBaurecht.getState().fokusSetzen(danach);
    } else fokusZurueck(ziel.ziele[0].id);
  };
  const uebernehmen = () => {
    if (ziel.ziele.some((z) => eintrag(z.id) !== z.vorher)) {
      setVeraltet(true);
      return;
    }
    const wer = von.trim() || benutzer();
    if (von.trim()) benutzerMerken(von);
    const lage = ziel.lagebezug ? aktuelleLage(project).lage : undefined;
    const st = useBaurecht.getState();
    useBaurecht.setState({ vorfragenStill: ziel.ziele.map((z) => z.id) });
    for (const z of ziel.ziele) st.faktSetzen(z.id, false, wer, true, lage);
    st.ansagen(`${ziel.ziele.length} Vorfragen mit „nein“ beantwortet – ihre Einzelfragen entfallen`);
    schliessen(ziel.ziele[0].id);
  };
  return (
    <Modal titel={`${ziel.gruppe}: ${ziel.ziele.length} Vorfragen mit „nein“ beantworten`} onClose={() => schliessen()} breit klickDaneben={false} kopf>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          uebernehmen();
        }}
      >
        <p className="br-leise">Jede dieser Vorfragen gilt danach als „nein“, ihre Einzelfragen entfallen. Wo die Frage das Umfeld nennt, gilt das „nein“ auch dafür.</p>
        <ul className="br-vorfragen-liste">
          {ziel.ziele.map((z) => (
            <li key={z.id}>
              <strong>{z.titel}</strong>
              {z.frage && <span className="br-leise"> – {z.frage}</span>}
            </li>
          ))}
        </ul>
        {vorschau && <Folgen folgen={vorschau} />}
        <p className="br-leise">
          Die Angaben gelten danach als gesichert und stehen mit Namen und Datum im Prüfprotokoll.
          {ziel.lagebezug && aktuelleLage(project).lage ? ' Sie gelten nur für die aktuelle Lage des Vorhabens.' : ''}
        </p>
        {ziel.lagebezug && !aktuelleLage(project).lage && (
          <div className="meldung warnung" role="note">
            Ohne Koordinaten, die zur Adresse passen, lassen sie sich an keine Lage binden und bleiben Hinweis.
          </div>
        )}
        {veraltet && (
          <div className="meldung fehler" role="alert">
            Eine der Angaben hat sich inzwischen geändert (z. B. durch „Lage abfragen“). Bitte den Dialog schließen und neu prüfen.
          </div>
        )}
        <div className="field">
          <label className="field-label" htmlFor="br-vn-von">
            Angegeben von
          </label>
          <input id="br-vn-von" value={von} onChange={(e) => setVon(e.target.value)} placeholder={benutzer()} aria-describedby="br-vn-von-hinweis" />
          <NameHinweis id="br-vn-von-hinweis" leer={!von.trim()} />
        </div>
        <div className="dialog-buttons">
          <button type="button" onClick={() => schliessen()}>
            Abbrechen
          </button>
          <button type="submit" className="primary" data-startfokus="">
            Übernehmen
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Definition einer Angabe (Typ, Einheit) – für die Anzeige der Werte („139,12 m²“, „3“) */
export type FaktDefVon = (id: string) => FaktDef | undefined;

/** Folgen einer Angabe: wie viele Paragrafen dadurch auf „entfällt“ (bzw. schwächer) gehen – für die Dialoge */
export type FolgenRechner = (id: string, wert: FaktWert | null, weitere?: Record<string, FaktWert>) => { herab: { id: string; titel: string; von: Ampel; nach: Ampel }[]; nachher?: FaktWert };

/** Pfeil sichtbar, „wird zu“ für Screenreader (ein aria-label an einem span ohne Rolle wird nicht verlässlich vorgelesen) */
function Pfeil() {
  return (
    <>
      <Symbol name="pfeilRechts" />
      <span className="unsichtbar"> wird zu </span>
    </>
  );
}

function Folgen({ folgen }: { folgen: { herab: Herabstufung[] } }) {
  const [auf, setAuf] = useState(false);
  if (!folgen.herab.length) return <p className="br-leise">Keine Vorschrift ändert dadurch ihre Ampel.</p>;
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
 * Schutzgebieten und Geodaten von Hand setzen – ein Klick, ohne Begründungstext. Der Dialog zeigt, welche Vorschriften
 * dadurch herabgestuft werden und ob ein Widerspruch bleibt. Geodaten gelten nur für die aktuelle Lage; das Protokoll
 * vermerkt Wert, Namen und Datum.
 */
export function FaktBestaetigenDialog({ folgen, faktDef = () => undefined }: { folgen: FolgenRechner; faktDef?: FaktDefVon }) {
  const ziel = useFaktBestaetigen((s) => s.ziel);
  const project = useBaurecht((s) => s.project);
  const [von, setVon] = useState('');
  const [veraltet, setVeraltet] = useState(false);
  useEffect(() => {
    if (!ziel) return;
    setVon(benutzer());
    setVeraltet(false);
  }, [ziel]);
  // Vorschau: genau die Rechnung der Übernahme (angabeVonHand bzw. hinweisBestaetigen) – Lagebezug, Widerspruch
  const vorschau = useMemo(() => {
    if (!ziel) return null;
    const lage = ziel.lagebezug ? aktuelleLage(project).lage : undefined;
    const o = { von: 'Vorschau', bestaetigt: true, lage, heute: heute(), desktop: isTauri() };
    const neu = ziel.modus === 'setzen' ? angabeVonHand(useBaurecht.getState().pruefung.fakten[ziel.id], ziel.id, ziel.wert.wert, o) : hinweisBestaetigen(ziel.wert, o);
    return folgen(ziel.id, neu);
  }, [ziel, folgen, project]);
  if (!ziel) return null;
  const schliessen = () => {
    const id = ziel.id;
    useFaktBestaetigen.setState((s) => ({ ziel: null, geschlossen: s.geschlossen + 1 }));
    fokusZurueck(id);
  };
  const bestaetigen = () => {
    if (eintrag(ziel.id) !== ziel.vorher) {
      setVeraltet(true);
      return;
    }
    const wer = von.trim() || benutzer();
    if (von.trim()) benutzerMerken(von);
    // Lagebezug (Schutzgebiete, Geodaten): an die aktuelle Lage binden; ohne gültige Koordinaten bleibt es Hinweis (null)
    const lage = ziel.lagebezug ? aktuelleLage(project).lage : undefined;
    if (ziel.modus === 'setzen') useBaurecht.getState().faktSetzen(ziel.id, ziel.wert.wert, wer, true, lage);
    else useBaurecht.getState().faktBestaetigen(ziel.id, ziel.wert, wer, lage);
    // angesagt (der Dialog verschwindet) – wie beim Festlegen und bei „Keine davon“
    useBaurecht.getState().ansagen(`${ziel.titel}: „${wertAnzeige(ziel.wert.wert, faktDef(ziel.id))}“ ${ziel.modus === 'setzen' ? 'von Hand übernommen' : 'bestätigt'}`);
    schliessen();
  };
  return (
    <Modal titel={`${ziel.titel}: „${wertAnzeige(ziel.wert.wert, faktDef(ziel.id))}“ ${ziel.modus === 'setzen' ? 'von Hand setzen' : 'bestätigen'}`} onClose={schliessen} breit klickDaneben={false} kopf>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          bestaetigen();
        }}
      >
        {ziel.modus === 'bestaetigen' ? (
          <p className="br-leise">
            {/* der Grund sagt schon, woher der Wert kommt – die Quelle nur ohne Grund */}
            Bisher nur Hinweis: {ziel.wert.grund ?? (ziel.wert.quelle ? `${ziel.wert.quelle} – nicht gesichert` : 'nicht gesichert')}
          </p>
        ) : faktDef(ziel.id)?.folgt?.length ? (
          <p className="br-leise">Der Wert ergibt sich sonst aus anderen Angaben. Abweichen nur in einem Sonderfall – die Angabe steht im Prüfprotokoll.</p>
        ) : (
          <p className="br-leise">Widerspricht die Angabe einem Treffer eines Dienstes, bleibt der Widerspruch sichtbar – betroffene Vorschriften werden dann nicht „entfällt“.</p>
        )}
        {vorschau && <Folgen folgen={vorschau} />}
        {vorschau?.nachher?.widerspruch && (
          <div className="meldung fehler" role="note">
            <strong>Widerspruch bleibt:</strong> {vorschau.nachher.widerspruch}. Vorschriften, die an dieser Angabe hängen, werden dadurch nicht „entfällt“.
          </div>
        )}
        <p className="br-leise">
          Die Angabe gilt danach als gesichert und steht mit Namen und Datum im Prüfprotokoll.
          {ziel.lagebezug && aktuelleLage(project).lage ? ' Sie gilt nur für die aktuelle Lage des Vorhabens.' : ''}
        </p>
        {ziel.lagebezug && !aktuelleLage(project).lage && (
          <div className="meldung warnung" role="note">
            Ohne Koordinaten, die zur Adresse passen, lässt sie sich an keine Lage binden und bleibt Hinweis.
          </div>
        )}
        {veraltet && (
          <div className="meldung fehler" role="alert">
            Die Angabe hat sich inzwischen geändert (z. B. durch „Lage abfragen“). Bitte den Dialog schließen und neu prüfen.
          </div>
        )}
        <div className="field">
          <label className="field-label" htmlFor="br-fakt-von">
            {ziel.modus === 'setzen' ? 'Angegeben von' : 'Bestätigt von'}
          </label>
          <input id="br-fakt-von" value={von} onChange={(e) => setVon(e.target.value)} placeholder={benutzer()} aria-describedby="br-fakt-von-hinweis" />
          <NameHinweis id="br-fakt-von-hinweis" leer={!von.trim()} />
        </div>
        <div className="dialog-buttons">
          <button type="button" onClick={schliessen}>
            Abbrechen
          </button>
          <button type="submit" className="primary" data-startfokus="">
            {ziel.modus === 'setzen' ? 'Übernehmen' : 'Bestätigen'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** alle Dialoge dieser Datei schließen (Stores auf Modulebene überleben das Unmount – für Tests) */
export function dialogeZuruecksetzen(): void {
  useFestlegen.setState({ p: null });
  useVorfragenNein.setState({ ziel: null });
  useFaktBestaetigen.setState({ ziel: null });
}
