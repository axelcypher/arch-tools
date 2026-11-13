import { useMemo, useState } from 'react';
import { openTextFile, saveTextFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { Field, TextField } from '@core/ui/fields';
import { bestaetigen, fragen } from '@core/ui/Rueckfrage';
import { OAP_VARIABLEN, projektdateiPfad } from '@core/projektdatei';
import { hatDateisystem, waehleOrdner } from '../dateisystem';
import { dateimuster, nameAus, nummerAus, PLATZHALTER_NUMMER, PLATZHALTER_PLAN, PLATZHALTER_PROJEKT } from '../nummer';
import { SchemaFeld } from './SchemaFeld';
import { StrukturSperre } from './StrukturSperre';
import type { Sicherung } from '../sicherung';
import { strukturUnterschied, unterschiedText } from '../sicherung';
import { useOrdner } from '../store';
import { SpeicherortZeile } from '@core/ui/Speicherort';
import { Symbol } from '@core/ui/Symbol';
import { OrdnerEditor } from './OrdnerEditor';
import { NamensschemaEinstellungen } from './NamensschemaEinstellungen';
import type { Struktur } from '../struktur';
import { ordnerAlsText, ordnerAusTextMitMeldungen, sichererName, STANDARD, strukturAlsJson, strukturAusJson } from '../struktur';

const log = logger('struktur');

/** Beispielwerte für die Vorschau der Schemata */
const musterWerte = (nummer: string) => {
  const d = new Date();
  return {
    nummer,
    kurzname: 'EFH Musterweg',
    vorhaben: 'Neubau eines Einfamilienhauses',
    jahr: d.getFullYear(),
    jj: String(d.getFullYear() % 100).padStart(2, '0'),
    bearbeiter: 'TP',
    datum: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  };
};

/**
 * Struktur des Büros: Ordnerbaum (Klick-Editor mit Bausteinen, für Geübte auch als Text) und Namensschemata, samt
 * den Vorlagen-Presets als Datei speicher- und ladbar; vor jedem Ersetzen gesichert.
 */
export function StrukturView() {
  const struktur = useOrdner((s) => s.struktur);
  const setStruktur = useOrdner((s) => s.setStruktur);
  const strukturErsetzen = useOrdner((s) => s.strukturErsetzen);
  const strukturFehler = useOrdner((s) => s.strukturFehler);
  /** unlesbare Struktur: Name, Schemata und Ordnerliste lassen sich nicht bearbeiten (siehe StrukturSperre) */
  const gesperrt = !!strukturFehler;
  const rueckgaengig = useOrdner((s) => s.rueckgaengig);
  const strukturRueckgaengig = useOrdner((s) => s.strukturRueckgaengig);
  const sicherungenLesen = useOrdner((s) => s.sicherungenLesen);
  const [sicherungen, setSicherungen] = useState<Sicherung[] | null>(null);
  /** Ordnerliste als Baum oder – für Geübte – als Text; Ansicht und Entwurf liegen im Store (überstehen den Wechsel der App-Ansicht) */
  const ordnerAnsicht = useOrdner((s) => s.ordnerAnsicht);
  const setOrdnerAnsicht = useOrdner((s) => s.setOrdnerAnsicht);
  const entwurf = useOrdner((s) => s.ordnerEntwurf);
  const setEntwurf = useOrdner((s) => s.setOrdnerEntwurf);
  const stand = ordnerAlsText(struktur.ordner);
  // ohne Entwurf folgt der Text dem Stand; ein Entwurf merkt sich den Stand, von dem er ausgeht – kommt die Struktur
  // neu herein, bleibt ungespeicherter Text stehen
  const text = entwurf?.text ?? stand;
  const basis = entwurf?.basis ?? stand;
  const setText = (t: string) => setEntwurf(t === stand ? null : { text: t, basis });
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null);

  const set = (patch: Partial<Struktur>) => setStruktur({ ...struktur, ...patch });
  // Meldungen zur Ordnerliste (doppelte Zeilen, falsche LPh, entfernte Zeichen) – vor dem Übernehmen sichtbar
  const gelesen = useMemo(() => ordnerAusTextMitMeldungen(text), [text]);
  const geaendert = text !== stand;
  /** der Text geht von einem älteren Stand aus (die Struktur kam inzwischen neu herein) */
  const veraltet = geaendert && basis !== stand;
  const textVerwerfen = () => setEntwurf(null);
  /** Ordnerliste aus der Textansicht übernehmen – wie jedes Ersetzen der Struktur vorher gesichert, mit „Rückgängig“ */
  const ordnerUebernehmen = async (): Promise<boolean> => {
    const { ordner } = gelesen;
    if (!ordner.length) {
      // Schutz vor versehentlichem Leeren über die Textansicht; im Baum lassen sich alle Ordner einzeln löschen
      setMeldung({
        art: 'fehler',
        text: 'Die Liste enthält keinen Ordner – die bisherige Struktur bleibt bestehen. Eine leere Liste übernimmt die Textansicht nicht; alle Ordner löschen geht im Baum.',
      });
      return false;
    }
    try {
      await strukturErsetzen({ ...struktur, ordner }, 'Ordnerliste übernommen.');
      setEntwurf(null);
      setMeldung(null);
      return true;
    } catch (e) {
      setMeldung({ art: 'fehler', text: e instanceof Error ? e.message : String(e) });
      return false;
    }
  };
  /** zur Baumansicht: offene Änderungen erst übernehmen oder verwerfen */
  const zumBaum = async () => {
    if (ordnerAnsicht === 'baum') return;
    if (geaendert) {
      const a = await fragen({
        titel: 'Geänderte Ordnerliste übernehmen?',
        text: `Der Text ist noch nicht übernommen${gelesen.meldungen.length ? ` (${gelesen.meldungen.length} ${gelesen.meldungen.length === 1 ? 'Meldung' : 'Meldungen'})` : ''}. „Übernehmen“ ersetzt die Ordnerliste – vorher gesichert, mit „Rückgängig“; „Verwerfen“ zeigt wieder die bisherige.`,
        knoepfe: [
          { id: 'abbrechen', label: 'Abbrechen' },
          // „Verwerfen“ ohne Hervorhebung (wie „Nicht speichern“): Vorgabe für Enter und Fokus bleibt „Übernehmen“
          { id: 'verwerfen', label: 'Verwerfen' },
          { id: 'uebernehmen', label: 'Übernehmen', art: 'primary' },
        ],
      });
      if (a === 'uebernehmen' && !(await ordnerUebernehmen())) return;
      if (a === 'verwerfen') textVerwerfen();
      if (a !== 'uebernehmen' && a !== 'verwerfen') return;
    }
    setOrdnerAnsicht('baum');
  };

  /**
   * Bürostruktur ersetzen (Vorgabe, Laden, Sicherung): erst die Rückfrage mit Vorschau der Änderung, dann sichern,
   * ersetzen und „Rückgängig“ anbieten.
   */
  const ersetzen = async (neu: Struktur, titel: string, grund: string) => {
    if (!strukturFehler && strukturAlsJson(neu) === strukturAlsJson(struktur)) return setMeldung({ art: 'ok', text: 'Keine Änderung – die Struktur entspricht schon dieser Fassung.' });
    const was = strukturFehler
      ? 'Die bisherige, nicht lesbare Struktur wird ersetzt'
      : unterschiedText(strukturUnterschied(struktur, neu)) || 'Ordner und Schemata bleiben, Einzelheiten der Presets ändern sich';
    const ok = await bestaetigen(
      titel,
      `${was}. Die Bürostruktur gilt für alle, die diesen Konfigurationsordner nutzen. Vorher wird der bisherige Stand gesichert${strukturFehler ? '' : '; „Rückgängig“ stellt ihn wieder her'}.`,
      'Ersetzen',
      true,
    );
    if (!ok) return;
    try {
      await strukturErsetzen(neu, grund);
      setMeldung(null);
      setSicherungen(null);
    } catch (e) {
      setMeldung({ art: 'fehler', text: e instanceof Error ? e.message : String(e) });
    }
  };
  const sicherungenZeigen = async () => {
    if (sicherungen) return setSicherungen(null);
    try {
      setSicherungen(await sicherungenLesen());
    } catch (e) {
      setMeldung({ art: 'fehler', text: e instanceof Error ? e.message : String(e) });
    }
  };
  /** Sicherung wiederherstellen – auch eine, deren Struktur sich (noch) nicht lesen lässt, wird erst geprüft */
  const sicherungWiederherstellen = (x: Sicherung) => {
    let s: Struktur;
    try {
      s = strukturAusJson(JSON.stringify(x.inhalt.struktur));
    } catch (e) {
      return setMeldung({ art: 'fehler', text: `Die Sicherung ${x.name} lässt sich nicht lesen: ${e instanceof Error ? e.message : String(e)}` });
    }
    void ersetzen(s, `Sicherung ${x.name} wiederherstellen?`, `Sicherung ${x.name} wiederhergestellt.`);
  };

  const laden = async () => {
    const f = await openTextFile('.json,application/json');
    if (!f) return;
    try {
      const s = strukturAusJson(f.text);
      await ersetzen(
        s,
        `Struktur „${s.name}“ aus ${f.name} laden?`,
        `Struktur „${s.name}“ aus ${f.name} geladen (${s.ordner.length} Ordner, ${s.presets.length} ${s.presets.length === 1 ? 'Preset' : 'Presets'}).`,
      );
      log.info(`Struktur geladen: ${s.name}`, { ordner: s.ordner.length, presets: s.presets.length });
    } catch (e) {
      setMeldung({ art: 'fehler', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const speichern = () =>
    saveTextFile({
      defaultName: `Projektstruktur ${sichererName(struktur.name)}.json`,
      contents: strukturAlsJson(struktur),
      filterName: 'Projektstruktur',
      extension: 'json',
      mime: 'application/json',
    });

  const beispiel = musterWerte(nummerAus(struktur.nummernschema, 14));
  const dateiBeispiel = (schema: string) => nameAus(schema, { ...beispiel, plannummer: 'A-101', index: 'b', titel: 'Grundriss EG' });

  const ordnerKopf = (
    <div className="po-ordner-kopf">
      <h2>Ordner</h2>
      <span className="muted small-text">
        {struktur.ordner.length} Ordner, davon {struktur.ordner.filter((o) => o.lph?.length).length} an Leistungsphasen gebunden
      </span>
      <div className="segment" role="group" aria-label="Ansicht der Ordnerliste">
        <button aria-pressed={ordnerAnsicht === 'baum'} onClick={() => void zumBaum()}>
          Baum
        </button>
        <button
          aria-pressed={ordnerAnsicht === 'text'}
          title="Die Ordnerliste als Text mit eigener Schreibweise bearbeiten"
          onClick={() => setOrdnerAnsicht('text')}
        >
          Text (Experte)
        </button>
      </div>
    </div>
  );

  // Namensschemata: gelten für die ganze Struktur, nicht für den gewählten Ordner – daher im Kopf; Platzhalter-Chips nur im Fokus
  const schemata = (
    <div className="po-schemata" role="group" aria-labelledby="po-schemata-titel">
      <h3 id="po-schemata-titel">Namen</h3>
      <div className="po-schemata-felder">
        <Field label="Projektnummer">
          <SchemaFeld
            label="Projektnummer"
            value={struktur.nummernschema}
            platzhalter={PLATZHALTER_NUMMER}
            kompakt
            vorschau={(t) => `Beispiel: ${nummerAus(t, 14)}`}
            onChange={(v) => set({ nummernschema: v.trim() || struktur.nummernschema })}
          />
        </Field>
        <Field label="Name des Projektordners">
          <SchemaFeld
            label="Name des Projektordners"
            value={struktur.ordnername}
            platzhalter={PLATZHALTER_PROJEKT}
            kompakt
            vorschau={(t) => `Beispiel: ${sichererName(nameAus(t, beispiel))}`}
            onChange={(v) => set({ ordnername: v.trim() || struktur.ordnername })}
          />
        </Field>
        <Field label="Dateinamenschema für Pläne">
          <SchemaFeld
            label="Dateinamenschema für Pläne"
            value={struktur.dateischema}
            platzhalter={PLATZHALTER_PLAN}
            kompakt
            vorschau={(t) =>
              `Beispiel: ${dateiBeispiel(t)}.pdf${dateimuster(t, beispiel.nummer).test(dateiBeispiel(t)) ? '' : ' (das Schema erkennt sein eigenes Beispiel nicht – bitte Trennzeichen prüfen)'}`
            }
            onChange={(v) => set({ dateischema: v.trim() })}
          />
        </Field>
      </div>
    </div>
  );

  return (
    <div className="po-struktur">
      <section className="po-col po-struktur-kopf">
        <div className="po-struktur-titel">
          <h2>Struktur</h2>
          {/* unlesbare Struktur: Bearbeiten gesperrt (Erklärung und „Angezeigte Struktur übernehmen …“ darunter) */}
          <div className={gesperrt ? 'po-gesperrt' : undefined} inert={gesperrt}>
            <Field label="Name der Struktur">
              <TextField value={struktur.name} onChange={(v) => set({ name: v.trim() || struktur.name })} />
            </Field>
          </div>
          <div className="button-row">
            <button onClick={() => void laden()}>Struktur laden …</button>
            <button onClick={() => void speichern()}>Struktur speichern …</button>
            <button
              title="Ordner und Namensschemata auf die neutrale Vorgabe zurücksetzen – Presets, Bausteine und Dateinamen der Vorlagen bleiben (mit Rückfrage)"
              onClick={() =>
                void ersetzen(
                  { ...STANDARD, vorlagenname: struktur.vorlagenname, presets: struktur.presets, ...(struktur.bausteine ? { bausteine: struktur.bausteine } : {}) },
                  'Vorgabe wiederherstellen?',
                  'Neutrale Vorgabe wiederhergestellt; die Vorlagen-Presets bleiben.',
                )
              }
            >
              Vorgabe wiederherstellen …
            </button>
            <button
              className={sicherungen ? 'active' : undefined}
              aria-expanded={!!sicherungen}
              aria-controls="po-sicherungen"
              title="Frühere Fassungen der Struktur – vor jedem Ersetzen gesichert (die letzten zehn)"
              onClick={() => void sicherungenZeigen()}
            >
              Sicherungen
            </button>
          </div>
        </div>
        <p className="muted small-text">
          Ordnerbaum, Bausteine und Namensschemata gehören dem Büro, nicht dem Tool: Die Struktur gilt für alle, die diesen Konfigurationsordner nutzen, und lässt sich als Datei speichern, weitergeben
          und auf einem anderen Rechner laden – samt den Vorlagen-Presets (unter „Vorlagen“).
        </p>
        <StrukturSperre />
        {meldung && (
          <p className={`meldung ${meldung.art}`} role={meldung.art === 'fehler' ? 'alert' : 'status'}>
            {meldung.text}
          </p>
        )}
        {rueckgaengig && (
          <p className="meldung ok po-rueckgaengig">
            {rueckgaengig.text}{' '}
            <button className="small" onClick={() => void strukturRueckgaengig().catch((e: unknown) => setMeldung({ art: 'fehler', text: e instanceof Error ? e.message : String(e) }))}>
              Rückgängig
            </button>
          </p>
        )}
        {sicherungen && (
          <div className="po-sicherungen" id="po-sicherungen">
            <span className="field-label">Sicherungen der Struktur</span>
            {!sicherungen.length && <p className="muted small-text">Noch keine – eine Sicherung entsteht vor jedem Ersetzen der Struktur.</p>}
            <ul className="list">
              {sicherungen.map((x) => (
                <li key={`${x.name}:${x.grund}`}>
                  <span title={x.grund}>
                    {x.name.replace(/^projektordner\.json\.bak-/, '')} · „{typeof x.inhalt.struktur?.name === 'string' ? x.inhalt.struktur.name : 'nicht lesbar'}“ · {x.grund}
                  </span>
                  <button className="small" onClick={() => sicherungWiederherstellen(x)}>
                    Wiederherstellen …
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className={gesperrt ? 'po-gesperrt' : undefined} inert={gesperrt}>
          {schemata}
        </div>
      </section>

      {/* Ordnerliste: bei unlesbarer Struktur gesperrt – der Baum bleibt sichtbar, lässt sich aber nicht ändern */}
      <div className={`po-struktur-ordner${gesperrt ? ' po-gesperrt' : ''}`} inert={gesperrt} aria-disabled={gesperrt || undefined}>
        {ordnerAnsicht === 'baum' ? (
          <OrdnerEditor
            ordner={struktur.ordner}
            onChange={(ordner) => set({ ordner })}
            bausteine={struktur.bausteine ?? []}
            onBausteine={(b) => {
              const { bausteine: _alt, ...rest } = struktur;
              setStruktur(b.length ? { ...rest, bausteine: b } : rest);
            }}
            kopf={ordnerKopf}
          />
        ) : (
          <div className="po-editor po-editor-text">
            <section className="po-col po-editor-baum">
              {ordnerKopf}
              <p className="muted small-text">
                Eine Zeile je Ordner, Unterordner mit „/“. Zusätze nach „|“: <code>LPh 5</code> oder <code>LPh 6-7</code> – der Ordner entsteht nur, wenn eine dieser Leistungsphasen beauftragt ist
                (Unterordner erben sie); <code>Dateischema</code> – Dateien darin werden im Prüfmodus gegen das Dateinamenschema geprüft. Änderungen gelten erst mit „Ordnerliste übernehmen“.
              </p>
              <textarea className="po-ordnertext" aria-label="Ordnerliste" value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} />
              {veraltet && (
                <p className="warning po-text-veraltet" role="status">
                  Die Ordnerliste wurde inzwischen geändert (z. B. auf einem anderen Rechner). Der Text oben geht noch vom alten Stand aus: „Ordnerliste übernehmen“ ersetzt den neuen Stand durch ihn,
                  „Verwerfen“ zeigt den neuen Stand.
                </p>
              )}
              {gelesen.meldungen.length > 0 && (
                <div className="warning po-ordnermeldungen">
                  <ul>
                    {gelesen.meldungen.map((m) => (
                      <li key={`${m.zeile}:${m.text}`}>{m.text}</li>
                    ))}
                  </ul>
                  {geaendert && <span className="small-text">Mit „Ordnerliste übernehmen“ gilt die Liste so, wie oben beschrieben bereinigt.</span>}
                </div>
              )}
              <div className="button-row">
                <button className="primary" disabled={!geaendert} onClick={() => void ordnerUebernehmen()}>
                  Ordnerliste übernehmen
                </button>
                <button disabled={!geaendert} onClick={textVerwerfen}>
                  Verwerfen
                </button>
                {geaendert && <span className="muted small-text">noch nicht übernommen</span>}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

/** Einstellungen: die gemeinsamen Einstellungen aller Apps */
export function EinstellungenView() {
  return (
    <div className="po-view einspaltig">
      <section className="po-col">
        <GemeinsameEinstellungen />
        <NamensschemaEinstellungen />
      </section>
    </div>
  );
}

/** Gemeinsame Einstellungen aller Apps – im Konfigurationsordner (auf einem Server-Laufwerk für das ganze Büro) */
function GemeinsameEinstellungen() {
  const desktop = hatDateisystem();
  const { konfigFehler, allgemein, setAllgemein, struktur } = useOrdner();
  const beispiel = musterWerte(nummerAus(struktur.nummernschema, 14));
  /** Stammordner per Ziehen umsortieren: gezogener Eintrag und Ziel */
  const [zieht, setZieht] = useState<number | null>(null);
  const [ziel, setZiel] = useState<{ i: number; davor: boolean } | null>(null);
  /** Eintrag `von` vor die Stelle `vor` setzen (Index in der alten Liste; Länge = ans Ende) */
  const verschieben = (von: number, vor: number) => {
    const liste = [...allgemein.projekte];
    const [x] = liste.splice(von, 1);
    liste.splice(vor > von ? vor - 1 : vor, 0, x);
    if (liste.join('|') !== allgemein.projekte.join('|')) setAllgemein({ projekte: liste });
  };

  const stammordnerHinzufuegen = async () => {
    const p = await waehleOrdner('Stammordner mit Projektordnern wählen');
    if (p && !allgemein.projekte.includes(p)) setAllgemein({ projekte: [...allgemein.projekte, p] });
  };

  return (
    <>
      <h2>Gemeinsame Einstellungen</h2>
      <p className="muted small-text">Gelten für alle Apps. Bei einer Netzwerkinstallation liegen sie auf dem Netzlaufwerk und gelten für das ganze Büro.</p>
      <SpeicherortZeile />
      {konfigFehler && <p className="meldung fehler" role="alert">{konfigFehler}</p>}

      <h3 className="po-abschnitt">Stammordner der Projekte</h3>
      <p className="muted small-text">
        Reihenfolge wie in der Projektübersicht aller Apps – zum Umsortieren ziehen (oder ↑ ↓; auch die Abschnitte der Projektübersicht lassen sich ziehen). Im ersten entstehen neue Projekte. Projekte
        in Gruppen-, Akquise- und Archivordnern darin werden mit erfasst.
      </p>
      <ul className="list po-stammordner" aria-label="Stammordner der Projekte">
        {allgemein.projekte.map((p, i) => (
          <li
            key={p}
            draggable
            className={`${zieht === i ? 'zieht' : ''}${ziel && ziel.i === i && zieht !== null && zieht !== i ? (ziel.davor ? ' ziel-davor' : ' ziel-danach') : ''}`}
            onDragStart={(e) => {
              setZieht(i);
              try {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', p);
              } catch {
                // ohne Datenübergabe genügt der Zustand
              }
            }}
            onDragOver={(e) => {
              if (zieht === null) return;
              e.preventDefault();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const davor = !r.height || e.clientY - r.top < r.height / 2;
              if (ziel?.i !== i || ziel.davor !== davor) setZiel({ i, davor });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (zieht !== null) verschieben(zieht, ziel?.davor === false ? i + 1 : i);
              setZieht(null);
              setZiel(null);
            }}
            onDragEnd={() => {
              setZieht(null);
              setZiel(null);
            }}
          >
            <span className="po-griff" aria-hidden title="Zum Umsortieren ziehen">
              ⠿
            </span>
            <code title={p}>{p}</code>
            {i === 0 ? (
              <span className="muted small-text po-stamm-neu">neue Projekte</span>
            ) : (
              <button
                className="small po-stamm-neu"
                title="Neue Projekte in diesem Stammordner anlegen (er rückt an die erste Stelle)"
                onClick={() => setAllgemein({ projekte: [p, ...allgemein.projekte.filter((x) => x !== p)] })}
              >
                Neue Projekte hier
              </button>
            )}
            <button className="icon" title="Nach oben" aria-label={`${p} nach oben`} disabled={i === 0} onClick={() => verschieben(i, i - 1)}>
              ↑
            </button>
            <button className="icon" title="Nach unten" aria-label={`${p} nach unten`} disabled={i === allgemein.projekte.length - 1} onClick={() => verschieben(i, i + 2)}>
              ↓
            </button>
            <button
              className="icon"
              title="Aus der Liste nehmen – am Ordner ändert sich nichts"
              aria-label={`${p} entfernen`}
              onClick={() => setAllgemein({ projekte: allgemein.projekte.filter((x) => x !== p) })}
            >
              <Symbol name="muell" />
            </button>
          </li>
        ))}
        {!allgemein.projekte.length && (
          <li className="muted">{desktop ? 'Noch kein Stammordner – mit „+ Stammordner“ hinzufügen.' : 'Noch kein Stammordner – hinzufügen lässt er sich nur in der Desktop-App.'}</li>
        )}
      </ul>
      {desktop && (
        <div className="button-row">
          <button className="small" onClick={() => void stammordnerHinzufuegen()}>
            + Stammordner
          </button>
        </div>
      )}
      <Field label="Projektdatei (.oap) in neuen Projekten" hint="Pfad im Projektordner – {DATUM} ist JJMMTT, mit Format z. B. {DATUM:JJJJ-MM-TT}">
        <SchemaFeld
          label="Projektdatei (.oap) in neuen Projekten"
          value={allgemein.oapPfad}
          platzhalter={OAP_VARIABLEN}
          vorschau={(t) => `Beispiel: ${projektdateiPfad(t, { nummer: beispiel.nummer, kurzname: beispiel.kurzname, vorhaben: beispiel.vorhaben })}`}
          onChange={(v) => setAllgemein({ oapPfad: v.trim() })}
        />
      </Field>
      <Field label="Fotoordner im Projekt" hint="Hier sucht RECTIO (Entzerrung) auch in Unterordnern nach Fotos; die .entz-Datei liegt beim Foto.">
        <TextField value={allgemein.fotoordner} onChange={(v) => setAllgemein({ fotoordner: v.trim() })} />
      </Field>
      <Field label="Büro" hint="Name des Büros im Kopf der Ausdrucke und Excel-Dateien aller Apps (leer = ohne)">
        <TextField value={allgemein.buero ?? ''} placeholder="z. B. Architekturbüro Muster" onChange={(v) => setAllgemein({ buero: v.trim() })} />
      </Field>
      <Field label="Mitarbeiter (Kürzel)" hint="mehrere mit Komma – Vorschläge für „Bearbeitung“ in den Stammdaten">
        <TextField
          value={(allgemein.mitarbeiter ?? []).join(', ')}
          placeholder="z. B. TP, AK"
          onChange={(v) =>
            setAllgemein({
              mitarbeiter: [
                ...new Set(
                  v
                    .split(/[,;]+/)
                    .map((x) => x.trim())
                    .filter(Boolean),
                ),
              ],
            })
          }
        />
      </Field>
    </>
  );
}
