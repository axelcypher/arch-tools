import type { InputHTMLAttributes } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { FeldDef } from '@core/ui/ansicht';
import { useAnsicht } from '@core/ui/ansicht';
import { AnsichtAnzeige, AnsichtEditor } from '@core/ui/AnsichtEditor';
import type { ExportUeberschreibung, Status, UmfangEintrag } from '../antrag';
import { eingereichtVon, PLANSATZ_QUELLE, standFestgehaltenText, tagVon } from '../antrag';
import { ART_HINWEIS, vorlageArtWarnung, STATUS_TEXT, alsUmfang, dokumenteDerVorlage, naechsteFassung, umfangAusKatalog, verschieben, vorlageFuer, vorlageMitAntragsart } from '../antrag';
import { bedingungText, hatBedingung, MERKMAL_ERKLAERUNG } from '../bedingung';
import { BedingungEditor } from './BedingungEditor';
import type { DokZustand, SchreibInfo } from '../antragStore';
import { aktiveFassung, antragSperre, antragsarten, antragsOrdner, artVonFassung, nachtragName, namensschemaVon, quelleVonEintrag, useAntrag, wechselLaeuft, wirksameEinstellungen, zeilenFassung } from '../antragStore';
import type { PlansatzErgebnis } from '../plansatz';
import { PLAN_ZUSTAND_KURZ, PLAN_ZUSTAND_TEXT, plansatzKurz } from '../plansatz';
import { oeffnePfad, verbinde } from '../dateisystem';
import { ablageVon, formularDatei, useFormulare } from '../store';
import { useExportDialog } from './ExportDialog';
import type { MenuePunkt } from './Menue';
import { MenueKnopf, zeigeMenue } from './Menue';
import { bestaetigen } from '@core/ui/Rueckfrage';
import { Griff, useSortieren } from './Sortieren';
import { Symbol } from './Symbol';

/** Farbpunkt für den Status eines Dokuments */
export function StatusPunkt({ status, titel }: { status: Status; titel?: string }) {
  return <span className={`st-punkt ${status}`} role="img" aria-label={titel ?? STATUS_TEXT[status]} title={titel ?? STATUS_TEXT[status]} />;
}

/** Zusammenfassung „5 von 8 aktuell“ */
export function zusammenfassung(alle: DokZustand[]) {
  // nicht erforderliche zählen nicht mit
  const dokumente = alle.filter((d) => d.status !== 'entfaellt');
  const aktuell = dokumente.filter((d) => d.status === 'aktuell').length;
  const schlimmstes: Status = dokumente.some((d) => d.status === 'fehlt')
    ? 'fehlt'
    : dokumente.some((d) => d.status === 'unvollstaendig')
      ? 'unvollstaendig'
      : dokumente.some((d) => d.status === 'offen')
        ? 'offen'
        : 'aktuell';
  return { aktuell, gesamt: dokumente.length, schlimmstes };
}

/**
 * Wahl der aktiven Antragsfassung (im Kopf des Projekts): vorhandene Ordner im Antragsordner, dazu je Antragsart
 * „neue Fassung“. Die aktive Fassung ist das Ziel des Exports und der Maßstab der Vollständigkeitsprüfung.
 */
export function FassungsWahl() {
  const projekt = useFormulare((s) => s.projekt);
  const ablage = useFormulare((s) => ablageVon(s, s.projekt));
  const fassungen = useAntrag((s) => s.fassungen);
  const aktiv = useAntrag((s) => aktiveFassung(s, projekt));
  // Antragsarten aus den Einstellungen und dem Namensschema (der Projektdatei bzw. des Büros); der Selektor liefert ein
  // neues Feld, useShallow vergleicht den Inhalt
  const schema = useFormulare(namensschemaVon);
  const arten = useAntrag(useShallow((s) => antragsarten(wirksameEinstellungen(s, projekt), false, schema)));
  const dokumente = useAntrag((s) => s.dokumente);
  const antraege = useAntrag((s) => s.projektdatei?.antraege);
  const { fassungWaehlen } = useAntrag.getState();
  if (!projekt || !ablage) return null;
  const eingereicht = eingereichtVon(antraege?.[aktiv]);
  const tag = (iso: string) => iso.split('-').reverse().join('.');
  const aktivDa = fassungen.some((f) => f.name === aktiv);
  const z = zusammenfassung(dokumente);
  const punkte = (): MenuePunkt[] => [
    ...fassungen.map((f) => ({
      text: `${f.name}${eingereichtVon(antraege?.[f.name]) ? ` – eingereicht ${tag(eingereichtVon(antraege?.[f.name])!.datum)}` : ''}`,
      symbol: f.name === aktiv ? ('haken' as const) : undefined,
      aktion: () => void fassungWaehlen(f.name),
    })),
    ...(fassungen.length ? [{ trenner: true as const }] : []),
    ...arten.map((a) => {
      const neu = naechsteFassung(fassungen, a, schema.antragsarten);
      return { text: `Neue Fassung „${neu}“ anlegen`, symbol: 'plus' as const, hinweis: 'mit den Vorgaben der Antragsmerkmale', aktion: () => void fassungWaehlen(neu, true) };
    }),
  ];
  return (
    <div className="an-fassung">
      <span className="nav-klein">Antrag</span>
      <MenueKnopf className="small an-fassung-knopf" title="Aktive Antragsfassung: Ziel des Exports und Maßstab der Vollständigkeit" punkte={punkte}>
        <Symbol name="stapel" /> {aktiv}
        {!aktivDa && <span className="muted"> (neu)</span>}
      </MenueKnopf>
      {eingereicht && (
        <span className="an-eingereicht" title={`Antrag ${aktiv} eingereicht – ${eingereicht.datei ?? 'von Hand gesetzt'} · gesperrt; zum Nachreichen den Status in den Antragsdaten vorübergehend auf „in Arbeit“ setzen`}>
          <Symbol name="schloss" /> eingereicht {tag(eingereicht.datum)}
        </span>
      )}
      {dokumente.length > 0 && (
        <button className="an-fassung-stand" title={`Antragsumfang: ${z.aktuell} von ${z.gesamt} Dokumenten liegen aktuell im Antragsordner`} onClick={() => umfangZeigen()}>
          <StatusPunkt status={z.schlimmstes} titel={`${z.aktuell} von ${z.gesamt} aktuell`} /> {z.aktuell}/{z.gesamt}
        </button>
      )}
    </div>
  );
}

/**
 * Menü „Vorhandenes zuordnen“ für einen Eintrag des Antragsumfangs ohne Formular: die Formulare des Projekts (ein schon
 * anders zugeordnetes mit Hinweis), dazu „Aus dem Antragsumfang nehmen“ – etwa für einen doppelten Eintrag.
 */
export function zuordnenPunkte(umfangId: string): MenuePunkt[] {
  const titel = useAntrag.getState().projektdatei?.umfang?.find((x) => x.id === umfangId)?.titel;
  // die Fassung der Zeile beim Öffnen des Menüs – geändert wird nur dort
  const ansicht = zeilenFassung(useAntrag.getState(), useFormulare.getState().projekt);
  if (!titel) return [];
  return [...formularePunkte(umfangId), { trenner: true }, { text: 'Aus dem Antragsumfang nehmen', symbol: 'muell', gefahr: true, aktion: () => void ausUmfangEntfernen(umfangId, ansicht, titel) }];
}

/** Die Formulare des Projekts zum Zuordnen (ein schon anders zugeordnetes mit Hinweis) */
export function formularePunkte(umfangId: string): MenuePunkt[] {
  const st = useAntrag.getState();
  // die Fassung der Zeile bzw. des Formulars beim Öffnen des Menüs
  const ansicht = zeilenFassung(st, useFormulare.getState().projekt);
  const titel = st.projektdatei?.umfang?.find((x) => x.id === umfangId)?.titel;
  const zugeordnet = new Map(st.dokumente.filter((d) => d.formular && d.eintrag.id !== umfangId).map((d) => [d.formular!.pfad, d.eintrag.titel]));
  return useFormulare.getState().formulare.map((f) => ({
    text: f.name,
    symbol: 'formular' as const,
    // schon anders zugeordnet bzw. im Unterordner eines Sammelprojekts (gleiche Namen bleiben unterscheidbar)
    hinweis: [zugeordnet.has(f.pfad) ? `schon „${zugeordnet.get(f.pfad)}“` : '', f.unterordner ? `in ${f.unterordner}` : ''].filter(Boolean).join(' · ') || undefined,
    // Antragsumfang erst beim Klick lesen (das Menü kann länger offen sein) – nur in derselben Fassung
    aktion: () => void st.umfangAendern((umfang) => umfang.map((x) => (x.id === umfangId ? { ...x, formularDatei: formularDatei(f.pfad) } : x)), { ansicht, eintrag: umfangId, titel, was: 'Nicht zugeordnet' }),
  }));
}

/** Einen Eintrag aus dem Antragsumfang nehmen (z. B. einen doppelten) */
export async function ausUmfangEntfernen(umfangId: string, ansicht: string | undefined, titel: string | undefined) {
  const info = await useAntrag.getState().umfangAendern((umfang) => umfang.filter((x) => x.id !== umfangId), { ansicht, eintrag: umfangId, titel, still: true });
  // schon weg: das Ziel ist erreicht – kein „nicht“; andere Fassung angezeigt: nichts geändert
  if (info.vorab === 'eintrag') useFormulare.getState().setMeldung({ art: 'info', text: `${titel ? `„${titel}“` : 'Der Eintrag'} ist schon nicht mehr im Antragsumfang.` });
  else if (info.vorab) useFormulare.getState().setMeldung({ art: 'info', text: `Nicht entfernt – ${info.grund}.` });
  return info;
}

/** Einen Eintrag im Antragsumfang um eine Stelle verschieben – nach dem Stand beim Klick (nicht beim Öffnen des Menüs) */
export function eintragVerschieben(umfangId: string, um: -1 | 1, ansicht: string | undefined, titel: string | undefined) {
  const st = useAntrag.getState();
  return st.umfangAendern(
    (umfang) => {
      const i = umfang.findIndex((x) => x.id === umfangId);
      return i < 0 || i + um < 0 || i + um >= umfang.length ? umfang : verschieben(umfang, i, i + um);
    },
    { ansicht, eintrag: umfangId, titel, was: 'Nicht verschoben', verschoben: true },
  );
}

/** Antragsdaten (mit dem Antragsumfang) zeigen */
export function umfangZeigen() {
  if (!useFormulare.getState().projekt) return;
  useFormulare.getState().setHaupt('antrag');
  requestAnimationFrame(() => document.querySelector('.pu-umfang')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }));
}

/**
 * Tag der Einreichung von Hand: übernommen erst beim Verlassen des Felds bzw. mit Enter – Zwischenstände beim Tippen
 * des Jahres („0002-11-03“) zählen nicht. Nur Tage ab 2000 und nicht in der Zukunft. Wie die übrigen Eingabefelder wird
 * nichts still verworfen: ein ungültiger Wert bleibt zum Korrigieren stehen, das Feld ist rot markiert, die Meldung
 * steht darunter (nach `nach`, z. B. dem Knopf daneben, damit nichts springt); Esc im Feld stellt den gespeicherten Tag
 * wieder her. Schlägt das Speichern fehl, sagt das Feld es – ein erneutes Enter versucht es noch einmal.
 */
function EinreichungsDatum({ wert, onSetzen, nach }: { wert: string; onSetzen: (tag: string) => Promise<void>; nach?: React.ReactNode }) {
  const [text, setText] = useState(wert);
  const [fehler, setFehler] = useState<string | null>(null);
  const meldungId = useId();
  // während des Speicherns: dieser Wert wird gerade geschrieben (Enter und danach Verlassen schreiben nicht zweimal)
  const laeuft = useRef<string | null>(null);
  const wertJetzt = useRef(wert);
  wertJetzt.current = wert;
  // gespeicherter Tag geändert (auch durch die eigene Übernahme): nachführen – das Feld bleibt dasselbe, der Fokus auch
  useEffect(() => {
    setText(wert);
    setFehler(null);
  }, [wert]);
  const heute = tagVon(new Date());
  const zeige = (t: string) => t.split('-').reverse().join('.');
  const zurueck = wert ? ` – Esc im Feld stellt den ${zeige(wert)} wieder her` : '';
  const pruefen = (t: string) =>
    !/^\d{4}-\d{2}-\d{2}$/.test(t)
      ? `Datum unvollständig – bitte Tag, Monat und Jahr eingeben${zurueck}.`
      : t < '2000-01-01' || t > heute
        ? `Nur Tage vom 01.01.2000 bis heute (${zeige(heute)})${zurueck}.`
        : null;
  const uebernehmen = () => {
    if (text === wert || text === laeuft.current) return setFehler(null);
    const f = pruefen(text);
    setFehler(f);
    if (f) return;
    const tag = text;
    laeuft.current = tag;
    void onSetzen(tag).finally(() => {
      laeuft.current = null;
      // nicht gespeichert (Datei gesperrt …): am Feld sagen, ein erneutes Enter versucht es wieder
      if (wertJetzt.current !== tag) setFehler(`Tag der Einreichung nicht gespeichert – Enter im Feld versucht es erneut${zurueck}.`);
    });
  };
  return (
    <>
      <label>
        <span className="field-label">eingereicht am</span>
        <input
          type="date"
          className={fehler ? 'feld-fehler' : undefined}
          value={text}
          min="2000-01-01"
          max={heute}
          aria-label="eingereicht am"
          aria-invalid={fehler ? true : undefined}
          aria-describedby={fehler ? meldungId : undefined}
          title="Tag der Einreichung (ab 2000, nicht in der Zukunft) – übernommen beim Verlassen des Felds oder mit Enter, Esc verwirft"
          onChange={(e) => setText(e.target.value)}
          onBlur={uebernehmen}
          onKeyDown={(e) => {
            if (e.key === 'Enter') uebernehmen();
            if (e.key === 'Escape') {
              // Esc verwirft die Eingabe – und schließt nichts anderes
              e.stopPropagation();
              setText(wert);
              setFehler(null);
            }
          }}
        />
      </label>
      {nach}
      {fehler && (
        <span className="feld-meldung pu-datum-meldung" id={meldungId} role="alert">
          {fehler}
        </span>
      )}
    </>
  );
}

/** „Stand vom 03.11.2026 festgehalten (3 Dateien)“ bzw. „Stand neu festgehalten am 20.11.2026 (3 Dateien)“ */
export function standText(stand: { tag: string; dateien: unknown[]; festgehalten?: number }): string {
  const n = stand.dateien.length;
  const dateien = n === 0 ? 'keine Dateien' : `${n} ${n === 1 ? 'Datei' : 'Dateien'}`;
  return stand.festgehalten ? `${standFestgehaltenText(stand)} (${dateien})` : `Stand vom ${stand.tag.split('-').reverse().join('.')} festgehalten (${dateien})`;
}

/** Status des aktiven Antrags: erkannt oder von Hand gesetzt; eingereicht = gesperrt (Nachtrag anlegen) */
function AntragStatus() {
  const projekt = useFormulare((s) => s.projekt);
  const st = useAntrag();
  const fassung = aktiveFassung(st, projekt);
  const daten = st.projektdatei?.antraege?.[fassung];
  const wirksam = eingereichtVon(daten);
  const manuell = daten?.status;
  const nachtrag = nachtragName(st, projekt);
  const tag = (iso: string) => iso.split('-').reverse().join('.');
  const wahl = manuell ? (manuell.eingereicht ? 'eingereicht' : 'arbeit') : 'auto';
  // „in Arbeit“ behält das Datum; zurück auf „eingereicht“ gilt derselbe Tag (sonst der erkannte, dann der des Stands)
  const bisher = manuell?.datum ?? daten?.eingereicht?.datum ?? daten?.stand?.tag;
  const setzen = (w: string, datum?: string) =>
    st.statusSetzen(
      w === 'auto' ? null : w === 'arbeit' ? { eingereicht: false, ...(bisher ? { datum: bisher } : {}) } : { eingereicht: true, datum: datum ?? bisher ?? tagVon(new Date()) },
    );
  // eingereicht: Nachtrag anlegen; den festgehaltenen Stand neu festhalten (nach einem Fehlklick auf „eingereicht“) –
  // beide in einer Gruppe, damit sie gemeinsam umbrechen; ist der Ordner gerade nicht lesbar, ist Neu-Festhalten gesperrt
  const knoepfe = wirksam && (
    <div className="pu-status-knoepfe">
      <button
        title={`Neue Antragsfassung „${nachtrag}“ anlegen – nur nach Rücknahme, Ablehnung, Rückgabe der Unterlagen oder für eine Änderung nach der Entscheidung; zum Nachreichen den Status vorübergehend auf „in Arbeit“ setzen`}
        onClick={() => void st.fassungWaehlen(nachtrag, true)}
      >
        <Symbol name="plus" /> Nachtrag „{nachtrag}“ anlegen
      </button>
      {daten?.stand && (
        <button
          aria-disabled={st.dateienLesefehler || undefined}
          title={
            st.dateienLesefehler
              ? 'Ordner gerade nicht erreichbar – neu festhalten geht erst wieder, wenn er erreichbar ist'
              : 'Den Antragsstand mit den Dateien, die jetzt im Ordner liegen, neu festhalten – nur nach einem versehentlich gesetzten oder falsch erkannten Status, nicht nach einer Nachreichung'
          }
          onClick={async () => {
            if (st.dateienLesefehler) return;
            if (
              await bestaetigen(
                'Stand neu festhalten?',
                'Der festgehaltene Stand wird durch die Dateien ersetzt, die jetzt im Ordner liegen. Neues (auch Nachgereichtes) und Geändertes gehört dann zum Stand, Entferntes fällt heraus – nichts davon ist mehr gekennzeichnet. Nur nach einem versehentlich gesetzten oder falsch erkannten Status verwenden, nicht nach einer Nachreichung.',
                'Neu festhalten',
                true,
              )
            )
              await st.standNeuFesthalten();
          }}
        >
          Stand neu festhalten …
        </button>
      )}
    </div>
  );
  return (
    <section className={`pu-status${wirksam ? ' eingereicht' : ''}`} aria-label="Status des Antrags">
      <div className="pu-status-text">
        <strong>
          {wirksam ? <Symbol name="schloss" /> : null} {fassung}: {wirksam ? `eingereicht am ${tag(wirksam.datum)}` : 'in Arbeit'}
        </strong>
        {wirksam ? (
          <>
            <span className="muted small-text">
              {wirksam.manuell ? 'Von Hand gesetzt' : `Erkannt an ${wirksam.datei}`}
              {daten?.stand && ` · ${standText(daten.stand)}`}
            </span>
            <span className="muted small-text">Gesperrt: Formulare nur ansehen; Antragsdaten, Export und „bereit“ wie eingereicht.</span>
            <span className="small-text pu-status-anleitung">
              <strong>Nachreichen:</strong> Status vorübergehend auf „in Arbeit“ (Tag und Stand bleiben). <strong>Nachtrag:</strong> erst nach Rücknahme, Ablehnung,
              Rückgabe der Unterlagen oder für eine Änderung nach der Entscheidung.
            </span>
          </>
        ) : (
          <>
            <span className="muted small-text">
              {manuell
                ? 'Von Hand gesetzt – Antragsprotokoll, Eingangs- und Empfangsbestätigung werden nicht beachtet; Tag und Stand der Einreichung bleiben gespeichert.'
                : 'Gilt automatisch als eingereicht, sobald ein Antragsprotokoll, eine Eingangs- oder Empfangsbestätigung im Ordner des Antrags liegt.'}
            </span>
            {manuell && (
              <span className="small-text pu-status-anleitung">
                <strong>Nach dem Nachreichen:</strong> Status wieder auf „automatisch“ bzw. „eingereicht“ – Nachgereichtes ist dann als „neu“ bzw. „geändert“
                gekennzeichnet.
              </span>
            )}
          </>
        )}
      </div>
      <div className="pu-status-wahl">
        <label>
          <span className="field-label">Status</span>
          <select value={wahl} aria-label="Status des Antrags" onChange={(e) => void setzen(e.target.value)}>
            <option value="auto">automatisch{daten?.eingereicht ? ` (erkannt: eingereicht ${tag(daten.eingereicht.datum)})` : ' (erkannt: in Arbeit)'}</option>
            <option value="arbeit">in Arbeit</option>
            <option value="eingereicht">eingereicht</option>
          </select>
        </label>
        {wahl === 'eingereicht' ? <EinreichungsDatum wert={manuell?.datum ?? ''} onSetzen={(t) => setzen('eingereicht', t)} nach={knoepfe} /> : knoepfe}
      </div>
    </section>
  );
}

/** Schlüssel der eigenen Ansicht der Antragsmerkmale */
const MERKMAL_ANSICHT = 'formulare:ansicht:merkmale';

/**
 * Antragsmerkmale (Gebäudeklasse, Sonderbau …) des aktiven Antrags – in einer eigenen Ansicht, wenn man sich eine
 * zusammengestellt hat (Auswahl und Reihenfolge, in Abschnitten), sonst alle. Bedingungen in Formularen und im
 * Antragsumfang richten sich nach ihnen.
 */
function Merkmale({ gesperrt }: { gesperrt: boolean }) {
  const st = useAntrag();
  const werte = st.projektdatei?.merkmale ?? {};
  const [ansicht, setAnsicht] = useAnsicht(MERKMAL_ANSICHT);
  const [editor, setEditor] = useState(false);
  const [alle, setAlle] = useState(false);
  const katalog = useMemo((): FeldDef[] => st.merkmalDefinitionen.map((m) => ({ id: m.name, titel: m.name, gruppe: 'Antragsmerkmale', hinweis: MERKMAL_ERKLAERUNG[m.name]?.text })), [st.merkmalDefinitionen]);
  const vorgabe = { abschnitte: [{ id: 'alle', titel: '', felder: katalog.map((f) => f.id) }] };
  const gezeigt = ansicht ?? vorgabe;
  const weitere = katalog.filter((f) => !gezeigt.abschnitte.some((a) => a.felder.includes(f.id)));
  const feld = (f: FeldDef, o?: { label: string }) => {
    const m = st.merkmalDefinitionen.find((x) => x.name === f.id);
    if (!m) return null;
    const erkl = MERKMAL_ERKLAERUNG[m.name];
    return (
      <label className="pu-merkmal" title={erkl?.text}>
        <span className="field-label">{o?.label || m.name}</span>
        <select value={werte[m.name] ?? ''} aria-label={o?.label || m.name} disabled={gesperrt} onChange={(e) => void st.merkmalSetzen(m.name, e.target.value)}>
          <option value="">–</option>
          {m.werte.map((w) => (
            <option key={w} value={w} title={erkl?.werte?.[w]}>
              {w}
            </option>
          ))}
        </select>
        {erkl?.werte?.[werte[m.name] ?? ''] && <span className="muted small-text">{erkl.werte[werte[m.name]]}</span>}
      </label>
    );
  };
  return (
    <section className="pu-merkmale" aria-label="Antragsmerkmale">
      <div className="pu-abschnitt-kopf">
        <h3 title="Gelten nur für diesen Antrag – ein neuer Antrag startet mit den Vorgaben aus den Einstellungen">Antragsmerkmale</h3>
        <span className="muted small-text">Abschnitte und Felder mit Bedingung (z. B. „nur bei Gebäudeklasse 3–5“) kommen dazu oder entfallen.</span>
        <button className="small" title="Eigene Ansicht zusammenstellen: welche Merkmale in welcher Reihenfolge, in Abschnitten" onClick={() => setEditor(true)}>
          <Symbol name="stift" /> Ansicht …
        </button>
      </div>
      <AnsichtAnzeige ansicht={gezeigt} katalog={katalog} feld={feld} />
      {weitere.length > 0 && (
        <>
          <button className="pk-nav-mehr" aria-expanded={alle} onClick={() => setAlle(!alle)}>
            {weitere.length} weitere {weitere.length === 1 ? 'Merkmal' : 'Merkmale'} – {alle ? 'verbergen' : 'zeigen'}
          </button>
          {alle && <AnsichtAnzeige ansicht={{ abschnitte: [{ id: 'weitere', titel: 'Weitere', felder: weitere.map((f) => f.id) }] }} katalog={katalog} feld={feld} />}
        </>
      )}
      {editor && (
        <AnsichtEditor
          titel="Antragsmerkmale: eigene Ansicht"
          katalog={katalog}
          ansicht={ansicht}
          vorgabe={{ abschnitte: [{ id: 'a1', titel: 'Antragsmerkmale', felder: katalog.map((f) => f.id) }] }}
          onChange={setAnsicht}
          onSchliessen={() => setEditor(false)}
        />
      )}
    </section>
  );
}

const ART_TEXT = { intern: 'Formular', extern: 'Datei', plansatz: 'Plansatz' };

/** Meldung an einem Textfeld, dessen Speichern scheiterte */
const SPEICHER_FEHLER = 'Nicht gespeichert – Enter im Feld versucht es erneut, Esc verwirft.';

/** Tooltip gesperrter Knöpfe der Antragsdaten */
const GESPERRT_TITEL = 'Der Antrag ist eingereicht und gesperrt – zum Nachreichen den Status vorübergehend auf „in Arbeit“ setzen';

/**
 * Textfeld der Antragsdaten: getippt wird im Feld, gespeichert beim Verlassen bzw. mit Enter – ein Schreiben statt eines
 * je Taste (auf dem Netzlaufwerk sprang das Feld sonst zurück, und Getipptes ging verloren); Esc verwirft.
 * - Die Fassung der Zeile gilt ab dem ersten Tastendruck (`bindung`) – ist inzwischen eine andere angezeigt, wird nicht
 *   gespeichert (die Meldung sagt es) und der Entwurf verworfen.
 * - Bis das Speichern zurück ist, bleibt das Getippte stehen; dasselbe wird nicht noch einmal gespeichert, eine Korrektur
 *   währenddessen danach.
 * - Scheitert das Speichern (Schreibfehler, Antrag wird gerade geöffnet), bleibt der Entwurf markiert stehen – Enter
 *   versucht es erneut. Leer, wo es nicht leer sein darf (`leerFehler`): markiert, nichts gespeichert.
 * - Verschwindet das Feld mit einem ungespeicherten Entwurf (Zeile woanders entfernt), sagt `beiVerlust` es.
 */
function UebernahmeFeld({
  wert,
  bindung,
  onUebernehmen,
  leerFehler,
  beiVerlust,
  ...rest
}: {
  wert: string;
  bindung?: string;
  onUebernehmen: (wert: string, bindung: string | undefined) => Promise<SchreibInfo> | undefined;
  leerFehler?: string;
  beiVerlust?: (entwurf: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'onKeyDown'>) {
  const [entwurf, setEntwurf] = useState<string | null>(null);
  // für das Verschwinden des Felds: der letzte Stand ohne neu zu rendern
  const zuletzt = useRef({ entwurf, wert, beiVerlust });
  zuletzt.current = { entwurf, wert, beiVerlust };
  const [fehler, setFehler] = useState<string | null>(null);
  const meldungId = useId();
  const gebunden = useRef<string | undefined>(undefined);
  const laeuft = useRef<string | null>(null);
  const danach = useRef<string | null>(null);
  useEffect(
    () => () => {
      // ungespeichert ist, was weder gespeichert steht noch gerade gespeichert wird
      const { entwurf: e, wert: w, beiVerlust: b } = zuletzt.current;
      if (e !== null && e !== w && e !== laeuft.current && e !== danach.current) b?.(e);
    },
    [],
  );
  const speichern = (v: string) => {
    laeuft.current = v;
    void Promise.resolve(onUebernehmen(v, gebunden.current))
      .catch((): SchreibInfo => ({ erneut: true }))
      .then((info) => {
        laeuft.current = null;
        const n = danach.current;
        danach.current = null;
        // während des Speicherns korrigiert: jetzt das Korrigierte (gegen den dann gespeicherten Stand)
        if (n !== null && n !== v) return speichern(n);
        // nicht gespeichert: markieren – nur, wenn der Entwurf noch dasteht (nach Esc nicht)
        if (info && !info.geschrieben && !info.dialog && info.erneut) return void (zuletzt.current.entwurf !== null && setFehler(SPEICHER_FEHLER));
        // nur den eigenen Speicherfehler aufheben (nicht etwa den eines inzwischen geleerten Titels)
        setFehler((f) => (f === SPEICHER_FEHLER ? null : f));
        setEntwurf((e) => (e === v ? null : e));
      });
  };
  const uebernehmen = () => {
    if (entwurf === null) return;
    if (leerFehler && !entwurf.trim()) {
      // das Leere gilt – ein vorher eingereihter Wert nicht mehr
      danach.current = null;
      return setFehler(leerFehler);
    }
    // läuft schon: dasselbe nicht noch einmal, Abweichendes danach (zuletzt Bestätigtes gilt)
    if (laeuft.current !== null) {
      danach.current = entwurf !== laeuft.current ? entwurf : null;
      return;
    }
    setFehler(null);
    if (entwurf === wert) return setEntwurf(null);
    speichern(entwurf);
  };
  // getippt für eine Fassung, die nicht mehr angezeigt ist: gleich sagen (gespeichert wird es nicht)
  const fremd = entwurf !== null && gebunden.current !== undefined && bindung !== gebunden.current;
  const hinweis = fehler ?? (fremd ? `Getippt für Antrag ${gebunden.current} – inzwischen ist Antrag ${bindung} angezeigt; Esc verwirft.` : null);
  return (
    <>
      <input
        title="Übernommen beim Verlassen des Felds oder mit Enter, Esc verwirft"
        {...rest}
        className={[rest.className, hinweis ? 'feld-fehler' : ''].filter(Boolean).join(' ') || undefined}
        aria-invalid={hinweis ? true : undefined}
        aria-describedby={hinweis ? meldungId : undefined}
        value={entwurf ?? wert}
        onChange={(e) => {
          if (entwurf === null) gebunden.current = bindung;
          setEntwurf(e.target.value);
        }}
        onBlur={uebernehmen}
        onKeyDown={(e) => {
          if (e.key === 'Enter') uebernehmen();
          else if (e.key === 'Escape' && (entwurf !== null || fehler)) {
            // Esc verwirft die Eingabe (ein gerade laufendes Speichern läuft zu Ende) und die Markierung – und schließt
            // nichts anderes
            e.stopPropagation();
            danach.current = null;
            setEntwurf(null);
            setFehler(null);
          }
        }}
      />
      {hinweis && (
        <span className="feld-meldung pu-feld-meldung" id={meldungId} role="alert">
          {hinweis}
        </span>
      )}
    </>
  );
}

/** Pläne eines Plansatzes: je Plannummer Zustand und Datei, dazu Hinweise */
function PlansatzListe({ id, r, basis, ordner }: { id: string; r: PlansatzErgebnis; basis: string | null; ordner: string }) {
  return (
    <div className="pu-plansatz" id={id}>
      {r.plaene.length > 0 && (
        <ul className="pu-plaene">
          {r.plaene.map((p) => (
            <li key={p.schluessel} className={`pu-plan ${p.zustand}`} title={PLAN_ZUSTAND_TEXT[p.zustand]}>
              <span className="pu-plan-nr" title={p.schluessel}>
                {p.schluessel}
              </span>
              <span className="pu-plan-name">
                {p.datei ? (
                  <button className="pu-datei" title="In der App ansehen" onClick={() => basis && void useFormulare.getState().dateiAnsehen(basis, `${ordner}/${p.datei!.pfad}`)}>
                    {p.bezeichnung || p.datei.pfad}
                  </button>
                ) : (
                  (p.bezeichnung ?? '')
                )}
                {p.satz && <span className="muted small-text"> (im Sammel-PDF)</span>}
              </span>
              <span className="pu-plan-zustand small-text">{PLAN_ZUSTAND_KURZ[p.zustand]}</span>
            </li>
          ))}
        </ul>
      )}
      {r.plaene.length === 0 && <p className="muted small-text">Keine Pläne mit Plannummer in der Quelle und im Antragsordner.</p>}
      {r.hinweise.length > 0 && (
        <div className="pu-plan-hinweise" role="note" tabIndex={-1} aria-label="Hinweise zum Plansatz">
          {r.hinweise.map((h) => (
            <p key={h} className="pu-plan-hinweis small-text">
              <Symbol name="warnung" /> {h}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Antragsdaten: was nur für den aktiven Antrag gilt – Status (eingereicht?), Antragsmerkmale und Antragsumfang (welche
 * Dokumente zum Antrag gehören, grundlegend aus dem Katalog der Einstellungen, je Antrag änderbar, mit ihrem Status in
 * der aktiven Antragsfassung). Die Projektdaten (Projektkarte) gelten dagegen für das ganze Projekt. Liegt im Abschnitt
 * „formulare“ der Projektdatei (.oap) und gilt damit für alle im Büro. Ein eingereichter Antrag ist gesperrt.
 */
export function AntragsdatenAnsicht() {
  const projekt = useFormulare((s) => s.projekt);
  const ds = useFormulare((s) => s.ds);
  const ablage = useFormulare((s) => ablageVon(s, s.projekt));
  const formulare = useFormulare((s) => s.formulare);
  const projektdatei = useAntrag((s) => s.projektdatei);
  const dokumente = useAntrag((s) => s.dokumente);
  const katalog = useAntrag((s) => s.katalog);
  const vorlagen = useAntrag((s) => s.vorlagen);
  const dateien = useAntrag((s) => s.dateien);
  // Namensschema (Projektdatei bzw. Büro) – für die vorgeschlagene Vorlage (BVA → BAUVA)
  const schema = useFormulare(namensschemaVon);
  const st = useAntrag();
  const { umfangSetzen, verknuepfen, formularAnlegen, aktualisieren } = st;
  const gesperrt = !!antragSperre(st, projekt);
  // ein Antrag wird gerade geöffnet: seine Antragsdaten sind so lange nicht bedienbar – Hinweis und Abblenden erst nach
  // einem Moment (ein schneller Wechsel flackert nicht)
  const wechsel = wechselLaeuft(st, projekt);
  const [ladenSichtbar, setLadenSichtbar] = useState(false);
  useEffect(() => {
    if (!wechsel) return setLadenSichtbar(false);
    const t = setTimeout(() => setLadenSichtbar(true), 300);
    return () => clearTimeout(t);
  }, [wechsel]);
  // Fassung der angezeigten Zeilen – Aktionen aus ihnen gelten nur für sie
  const zf = zeilenFassung(st, projekt);
  const [bearbeiten, setBearbeiten] = useState<string | null>(null);
  const [vorlageWahl, setVorlageWahl] = useState<string | null>(null);
  const [plaeneOffen, setPlaeneOffen] = useState<string[]>([]);
  // „n Hinweise“: Liste öffnen und zu den Hinweisen rollen (auch, wenn sie schon offen ist)
  const hinweiseZeigen = (id: string) => {
    if (!plaeneOffen.includes(id)) setPlaeneOffen([...plaeneOffen, id]);
    setTimeout(() => {
      const ziel = document.querySelector<HTMLElement>(`#plaene-${CSS.escape(id)} .pu-plan-hinweise`);
      ziel?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      ziel?.focus({ preventScroll: true });
    }, 0);
  };
  // Ziehen bzw. ↑/↓: die Zeile vom Beginn (Kennung, Fassung) vor die Zeile setzen, die an der Einfügestelle unter den
  // jetzt angezeigten übrigen steht – im beim Loslassen gelesenen Umfang, nur in derselben Fassung
  const sortieren = useSortieren(dokumente.length, (von, nach) => {
    const zeile = dokumente[von]?.eintrag;
    if (!zeile) return;
    const vor = useAntrag
      .getState()
      .dokumente.map((d) => d.eintrag.id)
      .filter((id) => id !== zeile.id)[nach];
    void st.umfangAendern(
      (aktuell) => {
        const eintrag = aktuell.find((x) => x.id === zeile.id);
        const ohne = aktuell.filter((x) => x.id !== zeile.id);
        const j = vor === undefined ? ohne.length : ohne.findIndex((x) => x.id === vor);
        return !eintrag || j < 0 ? aktuell : [...ohne.slice(0, j), eintrag, ...ohne.slice(j)];
      },
      { ansicht: zf, eintrag: zeile.id, titel: zeile.titel, was: 'Nicht verschoben', verschoben: true },
    );
  });
  if (!ds) return <div className="fo-leer">Antragsdaten gibt es nur in der Desktop-App.</div>;
  if (!projekt) return null;
  const fassung = aktiveFassung(st, projekt);
  // Vorschlag: die Vorlage zur Antragsart der aktiven Fassung („BAUA 2“ → BAUA, „BVA“ → BAUVA); keine passende = keine Vorwahl
  const art = artVonFassung(st, projekt, fassung);
  const vorlage = vorlagen.find((v) => v.id === vorlageWahl) ?? vorlageFuer(vorlagen, art, schema.antragsarten);
  const ohneVorlage = vorlagen.length > 0 && !vorlage;
  const ordner = antragsOrdner(st, projekt);
  const basis = ablage ? verbinde(ablage.root, ablage.pfad) : null;
  const umfang = projektdatei?.umfang;
  const z = zusammenfassung(dokumente);

  // Bearbeiten: im dann gelesenen Umfang ändern (nur derselbe Eintrag, dieselbe Fassung)
  // ein ungespeicherter Entwurf, dessen Zeile verschwunden ist (woanders entfernt bzw. eine andere Fassung angezeigt)
  const verloren = (titel: string) => (v: string) =>
    useFormulare.getState().setMeldung({ art: 'info', text: `„${v}“ bei „${titel}“ nicht gespeichert – der Eintrag ist nicht mehr angezeigt.` });
  const setzen = (id: string, teil: Partial<UmfangEintrag>, ansicht: string | undefined = zf) =>
    umfang
      ? st.umfangAendern((aktuell) => aktuell.map((u) => (u.id === id ? { ...u, ...teil } : u)), {
          ansicht,
          eintrag: id,
          titel: dokumente.find((d) => d.eintrag.id === id)?.eintrag.titel,
          was: 'Nicht geändert',
        })
      : undefined;
  const fehlendeKatalog = katalog.filter((k) => !umfang?.some((u) => u.id === k.id));

  /**
   * Dokumente ergänzen – im beim Klick gelesenen Umfang (nur, was dort noch fehlt) und nur, wenn noch die Fassung
   * angezeigt ist, in der das Menü geöffnet wurde (das Menü gibt es nur mit Antragsumfang; ist er inzwischen weg, wird abgewiesen)
   */
  const ergaenzen = (neue: (aktuell: UmfangEintrag[]) => UmfangEintrag[], ansicht: string | undefined) =>
    st.umfangAendern((aktuell) => [...aktuell, ...neue(aktuell).filter((n) => !aktuell.some((u) => u.id === n.id))], { ansicht, was: 'Nicht hinzugefügt' });
  const hinzufuegen = (): MenuePunkt[] => {
    const ansicht = projektdatei?.ansicht;
    return [
      ...fehlendeKatalog.map((k) => ({
        text: k.titel,
        symbol: (k.art === 'intern' ? 'formular' : k.art === 'plansatz' ? 'stapel' : 'datei') as 'formular' | 'datei' | 'stapel',
        aktion: () => void ergaenzen(() => [alsUmfang(k)], ansicht),
      })),
      ...(fehlendeKatalog.length ? [{ trenner: true as const }] : []),
      ...(vorlagen.length
        ? [
            {
              text: 'Aus Vorlage ergänzen',
              symbol: 'stapel' as const,
              unter: vorlagen.map((v) => {
                const fehlen = dokumenteDerVorlage(katalog, v).filter((k) => !umfang?.some((u) => u.id === k.id));
                return {
                  text: `${v.name} (${fehlen.length ? `${fehlen.length} fehlen` : 'vollständig'})`,
                  deaktiviert: !fehlen.length,
                  aktion: () => void ergaenzen((aktuell) => dokumenteDerVorlage(katalog, v).filter((k) => !aktuell.some((u) => u.id === k.id)).map(alsUmfang), ansicht),
                };
              }),
            },
          ]
        : []),
      {
        text: 'Eigenes Dokument',
        symbol: 'plus',
        aktion: () => {
          const id = `u${Date.now().toString(36)}`;
          void ergaenzen(() => [{ id, titel: 'Neues Dokument', art: 'extern' }], ansicht);
          setBearbeiten(id);
        },
      },
    ];
  };

  const dateiMenue = (d: DokZustand): MenuePunkt[] => {
    const pdfs = dateien.filter((x) => !x.ordner);
    // die Fassung beim Öffnen des Menüs (deren Ordner gezeigt wird) – verknüpft wird nur für sie
    const o = { ansicht: zeilenFassung(useAntrag.getState(), projekt), titel: d.eintrag.titel };
    return [
      ...pdfs.map((x) => ({
        text: x.pfad,
        symbol: (d.datei?.pfad === x.pfad ? 'haken' : 'datei') as 'haken' | 'datei',
        aktion: () => void verknuepfen(d.eintrag.id, x.pfad, o),
      })),
      ...(pdfs.length ? [] : [{ text: `Keine Dateien in ${ordner}`, deaktiviert: true }]),
      ...(d.eintrag.dateien?.[fassung] ? [{ trenner: true as const }, { text: 'Verknüpfung lösen (wieder nach Muster)', aktion: () => void verknuepfen(d.eintrag.id, null, { ...o, was: 'Verknüpfung nicht gelöst' }) }] : []),
    ];
  };

  return (
    <div className={`pu${gesperrt ? ' gesperrt' : ''}`} aria-busy={!!wechsel || undefined}>
      <div className="pu-kopf">
        <div>
          <h2>Antragsdaten</h2>
          <p className="muted small-text">
            Gilt nur für den Antrag <strong>{fassung}</strong> – jeder Antrag hat eigene Antragsdaten, ein neuer beginnt mit den Vorgaben aus den Einstellungen. Die
            Projektdaten gelten für das ganze Projekt. Geprüft wird im Ordner <strong>{ordner}</strong>
            {basis ? '' : ' (kein Projektordner gefunden)'}; gespeichert in der Projektdatei (.oap), gilt für alle im Büro.
          </p>
        </div>
        <div className="pu-kopf-knoepfe">
          {/* immer da (Live-Region), der Text erst nach einem Moment */}
          <span className="pu-laedt-hinweis small-text" role="status">
            {wechsel && ladenSichtbar ? `Antrag ${wechsel} wird geöffnet …` : ''}
          </span>
          <FassungsWahl />
          <button className="icon" title="Neu prüfen" aria-label="Neu prüfen" onClick={() => void aktualisieren()}>
            <Symbol name="neuLaden" />
          </button>
          {basis && (
            <button className="icon" title="Antragsordner im Explorer öffnen" aria-label="Antragsordner im Explorer öffnen" onClick={() => void oeffnePfad(verbinde(basis, ordner)).catch(() => undefined)}>
              <Symbol name="ordner" />
            </button>
          )}
        </div>
      </div>

      {/* während ein Antrag geöffnet wird, gehören Zeilen und Angaben noch zum bisherigen – so lange nicht bedienbar */}
      <div className={`pu-inhalt${wechsel && ladenSichtbar ? ' laedt' : ''}`} inert={!!wechsel}>
        <AntragStatus />

        <Merkmale gesperrt={gesperrt} />

        <div className="pu-umfang pu-abschnitt-kopf">
          <h3>Antragsumfang</h3>
          <span className="muted small-text">Welche Dokumente zu diesem Antrag gehören – mit Stand im Ordner {ordner}.</span>
        </div>
        {!umfang ? (
          <div className="pu-leer">
            <p>
              Für dieses Projekt ist noch kein Antragsumfang festgelegt. Danach zeigt die Navigation an jedem Formular, ob es vollständig ausgefüllt ist und aktuell im
              Antragsordner liegt; fehlende Formulare lassen sich per Klick anlegen.
            </p>
            <div className="pu-vorlage">
              <label>
                <span className="field-label">Antragsvorlage</span>
                <select value={vorlage?.id ?? ''} aria-label="Antragsvorlage" aria-describedby={ohneVorlage ? 'pu-ohne-vorlage' : undefined} onChange={(e) => setVorlageWahl(e.target.value)}>
                  {ohneVorlage && (
                    <option value="" disabled>
                      – bitte wählen –
                    </option>
                  )}
                  {vorlagen.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.art ? ` (${v.art})` : ''} – {dokumenteDerVorlage(katalog, v).length} Dokumente
                    </option>
                  ))}
                  {!vorlagen.length && <option value="">ganzer Katalog – {katalog.length} Dokumente</option>}
                </select>
              </label>
              <button
                className="primary"
                disabled={gesperrt || ohneVorlage}
                title={gesperrt ? GESPERRT_TITEL : ohneVorlage ? 'Erst eine Antragsvorlage wählen' : undefined}
                aria-describedby={ohneVorlage ? 'pu-ohne-vorlage' : undefined}
                onClick={() => void umfangSetzen(vorlage ? umfangAusKatalog(katalog, vorlage) : katalog.map(alsUmfang))}
              >
                Antragsumfang festlegen
              </button>
            </div>
            {ohneVorlage && (
              <p className="pu-ohne-vorlage small-text" id="pu-ohne-vorlage">
                {art.trim() ? `Für ${art} gibt es keine Antragsvorlage` : 'Für diesen Antrag gibt es keine passende Antragsvorlage'} – bitte eine wählen oder unter Einstellungen › Antrag & Export eine
                anlegen.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* derselbe Wortlaut wie im Tooltip des Statuspunkts (STATUS_TEXT) */}
            <div className="pu-legende small-text">
              {(['fehlt', 'unvollstaendig', 'offen', 'aktuell', 'entfaellt'] as const).map((st) => (
                <span key={st}>
                  <StatusPunkt status={st} /> {STATUS_TEXT[st]}
                </span>
              ))}
              <strong className="pu-summe">
                {z.aktuell} von {z.gesamt} aktuell
              </strong>
            </div>
            <div className="pu-liste" role="list" data-sortier-liste="">
              {dokumente.map((d, i) => {
                const u = d.eintrag;
                const offen = bearbeiten === u.id;
                return (
                  <div
                    key={u.id}
                    role="listitem"
                    className={`pu-zeile ${d.status}`}
                    {...sortieren.zeile(i)}
                    onContextMenu={(e) => {
                      // die Fassung der Zeile beim Öffnen – geändert wird nur dort; eingereicht: ausgegraut mit Grund
                      const ansichtJetzt = zeilenFassung(useAntrag.getState(), projekt);
                      const aus = gesperrt ? { deaktiviert: true, hinweis: 'Antrag eingereicht' } : {};
                      zeigeMenue(e, [
                        { text: 'Bearbeiten', symbol: 'stift', aktion: () => setBearbeiten(u.id), ...aus },
                        { text: 'Nach oben', deaktiviert: i === 0, aktion: () => void eintragVerschieben(u.id, -1, ansichtJetzt, u.titel), ...aus },
                        { text: 'Nach unten', deaktiviert: i === dokumente.length - 1, aktion: () => void eintragVerschieben(u.id, 1, ansichtJetzt, u.titel), ...aus },
                        { trenner: true },
                        { text: 'Aus dem Antragsumfang nehmen', symbol: 'muell', gefahr: true, aktion: () => void ausUmfangEntfernen(u.id, ansichtJetzt, u.titel), ...aus },
                      ]);
                    }}
                  >
                    <div className="pu-haupt">
                      {gesperrt ? <span className="sort-griff-platz" /> : <Griff {...sortieren.griff(i, u.titel)} />}
                      <StatusPunkt status={d.status} />
                      <UebernahmeFeld
                        className="pu-nr"
                        wert={u.nr ?? ''}
                        bindung={zf}
                        beiVerlust={verloren(u.titel)}
                        placeholder="Nr."
                        disabled={gesperrt}
                        aria-label={`Nummer von ${u.titel}`}
                        title={
                          gesperrt
                            ? GESPERRT_TITEL
                            : 'Nummer im Antrag (z. B. 01) – steht im Dateinamen des PDF-Exports und sortiert die Unterlagen; übernommen beim Verlassen des Felds oder mit Enter, Esc verwirft'
                        }
                        onUebernehmen={(v, b) => setzen(u.id, { nr: v || undefined }, b)}
                      />
                      <div className="pu-text">
                        <strong>{u.titel}</strong>
                        <span className="muted small-text">
                          <span className={`pu-art ${u.art}`}>{ART_TEXT[u.art]}</span>{' '}
                          {u.art === 'plansatz' && d.plansatz
                            ? plansatzKurz(d.plansatz)
                            : u.art === 'intern'
                              ? d.formular
                                ? `${d.formular.name} · ${d.formular.fuellstand.gefuellt} von ${d.formular.fuellstand.gesamt} Angaben`
                                : 'kein Formular im Projekt'
                              : d.quelle
                                ? `Quelle: ${d.quelle.pfad}`
                                : `keine Quelle in ${u.quelle || wirksameEinstellungen(st, projekt).berechnungsordner || 'dem Projektordner'}`}
                        </span>
                        {u.art === 'plansatz' && d.plansatz ? (
                          // Reihenfolge: was man anklickt zuerst, die lange Quelle zuletzt (sie wird bei Platzmangel gekürzt)
                          <span className="small-text">
                            {(d.plansatz.plaene.length > 0 || d.plansatz.hinweise.length > 0) && (
                              <>
                                <button className="pu-datei" aria-expanded={plaeneOffen.includes(u.id)} aria-controls={plaeneOffen.includes(u.id) ? `plaene-${u.id}` : undefined} onClick={() => setPlaeneOffen(plaeneOffen.includes(u.id) ? plaeneOffen.filter((x) => x !== u.id) : [...plaeneOffen, u.id])}>
                                  <Symbol name={plaeneOffen.includes(u.id) ? 'pfeilUnten' : 'pfeilRechts'} /> Pläne {plaeneOffen.includes(u.id) ? 'verbergen' : 'zeigen'}
                                </button>
                                {' · '}
                              </>
                            )}
                            {d.plansatz.hinweise.length > 0 && (
                              <>
                                <button className="pu-hinweiszahl" title="Zu den Hinweisen unter der Liste der Pläne" aria-controls={plaeneOffen.includes(u.id) ? `plaene-${u.id}` : undefined} onClick={() => hinweiseZeigen(u.id)}>
                                  {d.plansatz.hinweise.length === 1 ? '1 Hinweis' : `${d.plansatz.hinweise.length} Hinweise`}
                                </button>
                                {' · '}
                              </>
                            )}
                            <span className="muted">Quelle: {quelleVonEintrag(u, wirksameEinstellungen(st, projekt))}</span>
                            {hatBedingung(u.bedingung) ? <span className="pu-bedingung"> · nur wenn {bedingungText(u.bedingung)}</span> : null}
                          </span>
                        ) : (
                        <span className="small-text">
                          {d.datei ? (
                            <button className="pu-datei" title="In der App ansehen" onClick={() => basis && void useFormulare.getState().dateiAnsehen(basis, `${ordner}/${d.datei!.pfad}`)}>
                              <Symbol name="datei" /> {d.datei.pfad}
                            </button>
                          ) : (
                            <span className="muted">nicht in {fassung}</span>
                          )}
                          {' · '}
                          <span className="muted">{STATUS_TEXT[d.status]}</span>
                          {hatBedingung(u.bedingung) ? <span className="pu-bedingung"> · nur wenn {bedingungText(u.bedingung)}</span> : null}
                        </span>
                        )}
                      </div>
                      <div className="pu-knoepfe">
                        {u.art === 'intern' && !d.formular && d.status !== 'entfaellt' && (
                          <>
                            <button
                              className="small primary"
                              disabled={gesperrt}
                              title={gesperrt ? GESPERRT_TITEL : 'Das Formular aus dem Vorlagenordner bzw. einem anderen Projekt anlegen'}
                              onClick={() => void formularAnlegen(u.id, { ansicht: zf })}
                            >
                              Formular anlegen
                            </button>
                            {formulare.length > 0 && (
                              <MenueKnopf
                                className="small"
                                disabled={gesperrt}
                                title={gesperrt ? GESPERRT_TITEL : 'Ein Formular, das schon im Projekt liegt (z. B. anders benannt), diesem Eintrag zuordnen'}
                                punkte={() => zuordnenPunkte(u.id)}
                              >
                                Zuordnen
                              </MenueKnopf>
                            )}
                          </>
                        )}
                        {d.formular && (
                          <>
                            <button
                              className="small"
                              onClick={() => {
                                const f = formulare.find((x) => x.pfad === d.formular!.pfad);
                                if (f) void useFormulare.getState().formularOeffnen(f);
                              }}
                            >
                              Öffnen
                            </button>
                            <button
                          className="small"
                          disabled={!basis || gesperrt}
                          title={gesperrt ? GESPERRT_TITEL : !basis ? 'Ohne Projektordner kein PDF-Export – erst einen Projektordner zuordnen' : 'Das Formular als PDF exportieren'}
                          onClick={() => useExportDialog.getState().oeffnen(d.formular!.pfad)}
                        >
                              <Symbol name="export" /> PDF
                            </button>
                          </>
                        )}
                        {basis && !gesperrt && u.art !== 'plansatz' && (
                          <MenueKnopf className="small" title={`Datei in ${ordner} verknüpfen`} punkte={() => dateiMenue(d)}>
                            <Symbol name="link" />
                          </MenueKnopf>
                        )}
                        {!gesperrt && (
                          <button className={`icon${offen ? ' active' : ''}`} aria-label={`${u.titel} bearbeiten`} title="Bearbeiten" onClick={() => setBearbeiten(offen ? null : u.id)}>
                            <Symbol name="stift" />
                          </button>
                        )}
                      </div>
                    </div>
                    {u.art === 'plansatz' && d.plansatz && plaeneOffen.includes(u.id) && <PlansatzListe id={`plaene-${u.id}`} r={d.plansatz} basis={basis} ordner={ordner} />}
                    {offen && !gesperrt && (
                      <div className="pu-bearbeiten">
                        <label>
                          <span className="field-label">Titel</span>
                          <UebernahmeFeld
                          wert={u.titel}
                          bindung={zf}
                          beiVerlust={verloren(u.titel)}
                          leerFehler={`Der Titel darf nicht leer sein – Esc stellt „${u.titel}“ wieder her.`}
                          onUebernehmen={(v, b) => setzen(u.id, { titel: v }, b)}
                        />
                        </label>
                        <label>
                          <span className="field-label">Art</span>
                          <select value={u.art} onChange={(e) => setzen(u.id, { art: e.target.value as UmfangEintrag['art'] })}>
                            <option value="intern">intern – Formular des Projekts</option>
                            <option value="extern">extern – eine Datei (Berechnung, PDF)</option>
                            <option value="plansatz">Plansatz – alle Pläne mit Plannummer (GP-01 …)</option>
                          </select>
                        </label>
                        {u.art === 'intern' ? (
                          <label>
                            <span className="field-label">Formular (Teil des Namens oder Kennung)</span>
                            <UebernahmeFeld
                              wert={u.formular ?? ''}
                              bindung={zf}
                              beiVerlust={verloren(u.titel)}
                              placeholder={u.titel}
                              onUebernehmen={(v, b) => setzen(u.id, { formular: v || undefined, formularDatei: undefined }, b)}
                            />
                          </label>
                        ) : (
                          <label>
                            <span className="field-label">Ordner der Quelle</span>
                            <UebernahmeFeld
                              wert={u.quelle ?? ''}
                              bindung={zf}
                              beiVerlust={verloren(u.titel)}
                              placeholder={u.art === 'plansatz' ? PLANSATZ_QUELLE : wirksameEinstellungen(st, projekt).berechnungsordner}
                              onUebernehmen={(v, b) => setzen(u.id, { quelle: v || undefined }, b)}
                            />
                          </label>
                        )}
                        <label>
                          <span className="field-label" title="Platzhalter: * beliebig viele Zeichen, ? ein Zeichen; mehrere Muster mit ; trennen">
                            {u.art === 'plansatz' ? 'Nur Pläne nach Muster (leer = alle)' : 'Muster der Datei'}
                          </span>
                          <UebernahmeFeld
                          wert={u.muster ?? ''}
                          bindung={zf}
                          beiVerlust={verloren(u.titel)}
                          placeholder={u.art === 'plansatz' ? 'alle Pläne mit Plannummer' : `*${u.titel}*`}
                          onUebernehmen={(v, b) => setzen(u.id, { muster: v || undefined }, b)}
                        />
                        </label>
                        <div className="pu-bedingung-editor">
                          <span className="field-label">Nur erforderlich, wenn …</span>
                          <BedingungEditor wert={u.bedingung} merkmale={st.merkmalDefinitionen} onChange={(b) => setzen(u.id, { bedingung: b })} />
                        </div>
                        <div className="pu-bearbeiten-knoepfe">
                          <button className="small" onClick={() => setBearbeiten(null)}>
                            Fertig
                          </button>
                          <button className="small danger" onClick={() => void ausUmfangEntfernen(u.id, zf, u.titel)}>
                            Aus dem Antragsumfang nehmen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="pu-unten" hidden={gesperrt}>
              <MenueKnopf punkte={hinzufuegen}>
                <Symbol name="plus" /> Dokument hinzufügen
              </MenueKnopf>
              <button
                className="small"
                title="Antragsumfang aufheben – keine Vollständigkeitsprüfung mehr"
                onClick={async () => {
                  // der Antrag beim Öffnen der Rückfrage – aufgehoben wird nur, wenn danach noch er angezeigt ist
                  const ansicht = projektdatei?.ansicht ?? fassung;
                  const ok = await bestaetigen(
                    `Antragsumfang von ${ansicht} aufheben?`,
                    'Die Einträge samt Zuordnungen und Verknüpfungen fallen weg; die Navigation zeigt dann keine Vollständigkeit mehr. Die Dateien selbst bleiben unverändert.',
                    'Aufheben',
                    true,
                  );
                  if (!ok) return;
                  const jetzt = useAntrag.getState().projektdatei?.ansicht;
                  if (jetzt !== ansicht) useFormulare.getState().setMeldung({ art: 'info', text: `Antragsumfang nicht aufgehoben – ${jetzt ? `inzwischen ist Antrag ${jetzt} angezeigt` : 'inzwischen sind keine Antragsdaten mehr geladen'}.` });
                  else await umfangSetzen(null);
                }}
              >
                Antragsumfang aufheben …
              </button>
            </div>
          </>
        )}
      </div>
      <ExportFuerProjekt />
    </div>
  );
}

/** Abweichende Export-Einstellungen nur für dieses Projekt (wie die angezeigten Pfade im Projektordner) */
function ExportFuerProjekt() {
  const projekt = useFormulare((s) => s.projekt);
  const ueber = useAntrag((s) => (projekt ? s.ueberschreibungen[projekt.ordner] : undefined));
  const global = useAntrag((s) => s.einstellungen);
  const reihenfolge = useFormulare((s) => namensschemaVon(s).reihenfolge);
  const { setUeberschreibung } = useAntrag.getState();
  const [offen, setOffen] = useState(!!ueber);
  if (!projekt) return null;
  const setzen = (teil: ExportUeberschreibung) => setUeberschreibung({ ...ueber, ...teil });
  const artWarnung = ueber?.namensvorlage ? vorlageArtWarnung(ueber.namensvorlage, reihenfolge) : null;
  return (
    <section className="pu-export">
      <button className="pu-export-kopf" aria-expanded={offen} onClick={() => setOffen(!offen)}>
        <Symbol name={offen ? 'pfeilUnten' : 'pfeilRechts'} /> Export für {projekt.ordner}
        <span className="muted small-text">{ueber ? ' – weicht von den Einstellungen ab' : ' – wie in den Einstellungen'} · gilt für alle Anträge des Projekts</span>
      </button>
      {offen && (
        <div className="pu-bearbeiten">
          <label>
            <span className="field-label">Antragsordner</span>
            <input value={ueber?.antragsordner ?? ''} placeholder={global.antragsordner} onChange={(e) => setzen({ antragsordner: e.target.value })} />
          </label>
          <label>
            <span className="field-label">Phase</span>
            <input value={ueber?.phase ?? ''} placeholder={global.phase} onChange={(e) => setzen({ phase: e.target.value })} aria-label="Phase" aria-describedby="pu-phase-hinweis" />
            <span className="field-hint" id="pu-phase-hinweis">
              wird für den Platzhalter {'{Phase}'} eingesetzt
            </span>
          </label>
          <label>
            <span className="field-label">Ziel</span>
            <select value={ueber?.ziel ?? ''} onChange={(e) => setzen({ ziel: (e.target.value || undefined) as ExportUeberschreibung['ziel'] })}>
              <option value="">wie in den Einstellungen ({global.ziel === 'aktiv' ? 'aktive Antragsfassung' : global.zielpfad})</option>
              <option value="aktiv">aktive Antragsfassung</option>
              <option value="pfad">fester Ordner</option>
            </select>
          </label>
          {(ueber?.ziel ?? global.ziel) === 'pfad' && (
            <label>
              <span className="field-label">Fester Ordner</span>
              <input value={ueber?.zielpfad ?? ''} placeholder={global.zielpfad} onChange={(e) => setzen({ zielpfad: e.target.value })} />
            </label>
          )}
          {/* über die ganze Breite, nach den schmalen Feldern (Tab-Reihenfolge = Lesereihenfolge): Feld, darunter Hinweis
              und ggf. Warnung (wie in den Einstellungen) */}
          <div className="pu-breit">
            <label>
              <span className="field-label">Namensvorlage</span>
              <input
                value={ueber?.namensvorlage ?? ''}
                placeholder={global.namensvorlage}
                onChange={(e) => setzen({ namensvorlage: e.target.value })}
                aria-describedby={artWarnung ? 'pu-art-hinweis pu-art-warnung' : 'pu-art-hinweis'}
                spellCheck={false}
              />
            </label>
            <p className="field-hint" id="pu-art-hinweis">
              {ART_HINWEIS}
            </p>
            {artWarnung && (
              <p className="warning small-text">
                <span id="pu-art-warnung">{artWarnung}</span>{' '}
                <button className="small" onClick={() => setzen({ namensvorlage: vorlageMitAntragsart(ueber!.namensvorlage!, reihenfolge) })}>
                  Vorlage anpassen
                </button>
              </p>
            )}
          </div>
          {ueber && (
            <div className="pu-bearbeiten-knoepfe">
              <button className="small" onClick={() => setUeberschreibung(null)}>
                Vorgabe verwenden
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
