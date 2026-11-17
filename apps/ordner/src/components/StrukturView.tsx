import { useMemo, useState } from 'react';
import { openTextFile, saveTextFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { Field, TextField } from '@core/ui/fields';
import { Flaeche, Karte } from '@core/ui/Karte';
import { BreitenLeiste } from '@core/ui/Leiste';
import { bestaetigen, fragen } from '@core/ui/Rueckfrage';
import { nameAus, nummerAus } from '../nummer';
import { PfadeVerweis } from '@core/ui/Einstellungen';
import { SPERRGRUND, StrukturSperre } from './StrukturSperre';
import type { Sicherung } from '../sicherung';
import { strukturUnterschied, unterschiedText } from '../sicherung';
import { useOrdner } from '../store';
import { OrdnerEditor } from './OrdnerEditor';
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
  /** unlesbare Struktur: Name, Schemata und Ordnerliste nur lesen (siehe StrukturSperre) – echt gesperrt, nicht verborgen */
  const gesperrt = !!strukturFehler;
  const grund = gesperrt ? SPERRGRUND : undefined;
  const rueckgaengig = useOrdner((s) => s.rueckgaengig);
  const strukturRueckgaengig = useOrdner((s) => s.strukturRueckgaengig);
  const sicherungenLesen = useOrdner((s) => s.sicherungenLesen);
  const [sicherungen, setSicherungen] = useState<Sicherung[] | null>(null);
  /** Ordnerliste als Baum oder – für Geübte – als Text; Ansicht und Entwurf liegen im Store (überstehen den Wechsel der App-Ansicht) */
  const ordnerAnsicht = useOrdner((s) => s.ordnerAnsicht);
  const setOrdnerAnsicht = useOrdner((s) => s.setOrdnerAnsicht);
  const entwurf = useOrdner((s) => s.ordnerEntwurf);
  const setEntwurf = useOrdner((s) => s.setOrdnerEntwurf);
  const ordnerEntwurfUebernehmen = useOrdner((s) => s.ordnerEntwurfUebernehmen);
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
    try {
      // leere Liste: der Grund steht als Meldung da, die bisherige Struktur bleibt
      const grund = await ordnerEntwurfUebernehmen();
      setMeldung(grund ? { art: 'fehler', text: grund } : null);
      return !grund;
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

  const ordnerZahl = (
    <p className="muted small-text po-ordner-zahl">
      {struktur.ordner.length} Ordner, davon {struktur.ordner.filter((o) => o.lph?.length).length} an Leistungsphasen gebunden
    </p>
  );
  const ordnerAktionen = (
    <div className="segment" role="group" aria-label="Ansicht der Ordnerliste">
      <button aria-pressed={ordnerAnsicht === 'baum'} onClick={() => void zumBaum()}>
        Baum
      </button>
      <button aria-pressed={ordnerAnsicht === 'text'} title="Die Ordnerliste als Text mit eigener Schreibweise bearbeiten" onClick={() => setOrdnerAnsicht('text')}>
        Text (Experte)
      </button>
    </div>
  );

  // Namensschemata: gelten für die ganze Struktur – eingestellt zentral (Einstellungen › Pfade und Benennung), hier nur angezeigt
  const schemata = (
    <div className="po-schemata" role="group" aria-labelledby="po-schemata-titel">
      <h3 id="po-schemata-titel">Namen</h3>
      <dl className="po-schemata-werte">
        <div>
          <dt>Projektnummer</dt>
          <dd>
            <code>{struktur.nummernschema}</code> <span className="muted small-text">z. B. {nummerAus(struktur.nummernschema, 14)}</span>
          </dd>
        </div>
        <div>
          <dt>Name des Projektordners</dt>
          <dd>
            <code>{struktur.ordnername}</code> <span className="muted small-text">z. B. {sichererName(nameAus(struktur.ordnername, beispiel))}</span>
          </dd>
        </div>
        <div>
          <dt>Dateinamen der Pläne</dt>
          <dd>
            <code>{struktur.dateischema}</code>
          </dd>
        </div>
      </dl>
      <PfadeVerweis fokus="projekt.nummernschema" erklaerung="Eingestellt in den Einstellungen aller Apps, Seite „Pfade und Benennung“." />
    </div>
  );

  return (
    <Flaeche className="po-struktur">
      <BreitenLeiste schluessel="ordner:leiste-struktur" vorgabe={380} min={280} max={560} titel="Breite der Struktur" mitteMin={420}>
        <Karte als="aside" titel="Struktur" className="po-struktur-kopf">
          <div className="po-struktur-titel">
            {/* unlesbare Struktur: Feld gesperrt (Erklärung und „Angezeigte Struktur übernehmen …“ darunter) */}
            <fieldset className="po-sperre" disabled={gesperrt} title={grund}>
              <Field label="Name der Struktur">
                <TextField value={struktur.name} onChange={(v) => set({ name: v.trim() || struktur.name })} />
              </Field>
            </fieldset>
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
            Ordnerbaum, Bausteine und Namensschemata gehören dem Büro, nicht dem Tool: Die Struktur gilt für alle, die diesen Konfigurationsordner nutzen, und lässt sich als Datei speichern,
            weitergeben und auf einem anderen Rechner laden – samt den Vorlagen-Presets (unter „Vorlagen“).
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
          <fieldset className="po-sperre" disabled={gesperrt} title={grund}>
            {schemata}
          </fieldset>
        </Karte>
      </BreitenLeiste>

      {/* Ordnerliste: bei unlesbarer Struktur nur lesen – Baum (scrollen, Pfeiltasten, Auswahl) bzw. Text bleiben zugänglich */}
      {ordnerAnsicht === 'baum' ? (
        <OrdnerEditor
          ordner={struktur.ordner}
          onChange={(ordner) => set({ ordner })}
          bausteine={struktur.bausteine ?? []}
          onBausteine={(b) => {
            const { bausteine: _alt, ...rest } = struktur;
            setStruktur(b.length ? { ...rest, bausteine: b } : rest);
          }}
          aktionen={ordnerAktionen}
          vorspann={ordnerZahl}
          gesperrt={gesperrt}
        />
      ) : (
        <Karte als="main" titel="Ordner" aktionen={ordnerAktionen} className="po-editor-baum po-editor-text">
          {ordnerZahl}
          <p className="muted small-text">
            Eine Zeile je Ordner, Unterordner mit „/“. Zusätze nach „|“: <code>LPh 5</code> oder <code>LPh 6-7</code> – der Ordner entsteht nur, wenn eine dieser Leistungsphasen beauftragt ist
            (Unterordner erben sie); <code>Dateischema</code> – Dateien darin werden im Prüfmodus gegen das Dateinamenschema geprüft. Änderungen gelten erst mit „Ordnerliste übernehmen“.
          </p>
          <textarea className="po-ordnertext" aria-label="Ordnerliste" value={text} readOnly={gesperrt} title={grund} spellCheck={false} onChange={(e) => setText(e.target.value)} />
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
            <button className="primary" disabled={!geaendert || gesperrt} title={grund} onClick={() => void ordnerUebernehmen()}>
              Ordnerliste übernehmen
            </button>
            <button disabled={!geaendert || gesperrt} title={grund} onClick={textVerwerfen}>
              Verwerfen
            </button>
            {geaendert && <span className="muted small-text">noch nicht übernommen</span>}
          </div>
        </Karte>
      )}
    </Flaeche>
  );
}

/** Einstellungen: die gemeinsamen Einstellungen aller Apps */
