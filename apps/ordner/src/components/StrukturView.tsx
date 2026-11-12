import { useEffect, useMemo, useState } from 'react';
import { openTextFile, saveTextFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { Field, TextField } from '@core/ui/fields';
import { bestaetigen } from '@core/ui/Rueckfrage';
import { OAP_PLATZHALTER, projektdateiPfad, unbekanntePlatzhalter } from '@core/projektdatei';
import { hatDateisystem, waehleOrdner } from '../dateisystem';
import { dateimuster, nameAus, nummerAus, PLATZHALTER_NUMMER, PLATZHALTER_PLAN, PLATZHALTER_PROJEKT, unbekanntePlatzhalterIn } from '../nummer';
import { SchemaFeld } from './SchemaFeld';
import type { Sicherung } from '../sicherung';
import { strukturUnterschied, unterschiedText } from '../sicherung';
import { useOrdner } from '../store';
import { OrdnerBaum } from './OrdnerBaum';
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
 * Einstellungen: gemeinsame Einstellungen aller Apps (Konfigurationsordner, Stammordner der Projekte, Ort der
 * Projektdatei, Fotoordner) und die Struktur des Büros – Ordnerbaum und Namensschemata, samt den Vorlagen-Presets
 * als Datei speicher- und ladbar.
 */
export function StrukturView() {
  const struktur = useOrdner((s) => s.struktur);
  const setStruktur = useOrdner((s) => s.setStruktur);
  const strukturErsetzen = useOrdner((s) => s.strukturErsetzen);
  const rueckgaengig = useOrdner((s) => s.rueckgaengig);
  const strukturRueckgaengig = useOrdner((s) => s.strukturRueckgaengig);
  const sicherungenLesen = useOrdner((s) => s.sicherungenLesen);
  const [sicherungen, setSicherungen] = useState<Sicherung[] | null>(null);
  /** Ordnerliste als Baum oder – für Geübte – als Text */
  const [ordnerAnsicht, setOrdnerAnsicht] = useState<'baum' | 'text'>('baum');
  const [text, setText] = useState(() => ordnerAlsText(struktur.ordner));
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null);

  useEffect(() => setText(ordnerAlsText(struktur.ordner)), [struktur.ordner]);

  const set = (patch: Partial<Struktur>) => setStruktur({ ...struktur, ...patch });
  // Meldungen zur Ordnerliste (doppelte Zeilen, falsche LPh, entfernte Zeichen) – vor dem Übernehmen sichtbar
  const gelesen = useMemo(() => ordnerAusTextMitMeldungen(text), [text]);
  const ordnerUebernehmen = () => {
    const { ordner } = gelesen;
    if (!ordner.length) return setMeldung({ art: 'fehler', text: 'Die Liste enthält keinen Ordner – die bisherige Struktur bleibt bestehen.' });
    setMeldung(null);
    void strukturErsetzen({ ...struktur, ordner }, 'Ordnerliste übernommen.', { sicherung: false });
  };

  /**
   * Bürostruktur ersetzen (Standard, Laden, Sicherung): erst die Rückfrage mit Vorschau der Änderung, dann sichern,
   * ersetzen und „Rückgängig“ anbieten.
   */
  const ersetzen = async (neu: Struktur, titel: string, grund: string) => {
    if (strukturAlsJson(neu) === strukturAlsJson(struktur)) return setMeldung({ art: 'ok', text: 'Keine Änderung – die Struktur entspricht schon dieser Fassung.' });
    const was = unterschiedText(strukturUnterschied(struktur, neu)) || 'Ordner und Schemata bleiben, Einzelheiten der Presets ändern sich';
    const ok = await bestaetigen(
      titel,
      `${was}. Die Bürostruktur gilt für alle, die diesen Konfigurationsordner nutzen. Vorher wird der bisherige Stand gesichert; „Rückgängig“ stellt ihn wieder her.`,
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
  const dateiBeispiel = (schema: string) => nameAus(schema, { ...beispiel, projekt: beispiel.nummer, plannummer: 'A-101', index: 'b', titel: 'Grundriss EG' });
  const geaendert = text !== ordnerAlsText(struktur.ordner);

  return (
    <div className="po-view">
      <section className="po-col">
        <GemeinsameEinstellungen />
        <NamensschemaEinstellungen />
        <h2>Struktur</h2>
        <p className="muted small-text">
          Ordnerbaum und Namensschemata gehören dem Büro, nicht dem Tool: Die Struktur lässt sich als Datei speichern, weitergeben und auf einem anderen Rechner laden – samt den Vorlagen-Presets
          (unter „Vorlagen“).
        </p>
        <div className="button-row">
          <button onClick={() => void laden()}>Struktur laden …</button>
          <button onClick={() => void speichern()}>Struktur speichern …</button>
          <button
            title="Ordner und Namensschemata auf die neutrale Vorgabe zurücksetzen – Presets und Dateinamen der Vorlagen bleiben"
            onClick={() =>
              void ersetzen(
                { ...STANDARD, vorlagenname: struktur.vorlagenname, presets: struktur.presets },
                'Standardstruktur wiederherstellen?',
                'Neutrale Standardstruktur wiederhergestellt; die Vorlagen-Presets bleiben.',
              )
            }
          >
            Standard
          </button>
          <button title="Frühere Fassungen der Struktur – vor jedem Ersetzen gesichert (die letzten zehn)" onClick={() => void sicherungenZeigen()}>
            Sicherungen …
          </button>
        </div>
        {meldung && <p className={meldung.art === 'fehler' ? 'warning' : 'po-meldung'}>{meldung.text}</p>}
        {rueckgaengig && (
          <p className="po-meldung po-rueckgaengig">
            {rueckgaengig.text}{' '}
            <button className="small" onClick={strukturRueckgaengig}>
              Rückgängig
            </button>
          </p>
        )}
        {sicherungen && (
          <div className="po-sicherungen">
            <span className="field-label">Sicherungen der Struktur</span>
            {!sicherungen.length && <p className="muted small-text">Noch keine – eine Sicherung entsteht vor jedem Ersetzen der Struktur.</p>}
            <ul className="list">
              {sicherungen.map((x) => (
                <li key={`${x.name}:${x.grund}`}>
                  <span title={x.grund}>
                    {x.name.replace(/^projektordner\.json\.bak-/, '')} · „{x.inhalt.struktur.name}“ · {x.grund}
                  </span>
                  <button className="small" onClick={() => void ersetzen(x.inhalt.struktur, `Sicherung ${x.name} wiederherstellen?`, `Sicherung ${x.name} wiederhergestellt.`)}>
                    Wiederherstellen
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Field label="Name der Struktur">
          <TextField value={struktur.name} onChange={(v) => set({ name: v.trim() || struktur.name })} />
        </Field>
        <Field label="Projektnummer">
          <SchemaFeld
            label="Projektnummer"
            value={struktur.nummernschema}
            platzhalter={PLATZHALTER_NUMMER}
            vorschau={(t) => `Beispiel: ${nummerAus(t, 14)}`}
            unbekannt={(t) => unbekanntePlatzhalterIn(t, PLATZHALTER_NUMMER)}
            onChange={(v) => set({ nummernschema: v.trim() || struktur.nummernschema })}
          />
        </Field>
        <Field label="Name des Projektordners">
          <SchemaFeld
            label="Name des Projektordners"
            value={struktur.ordnername}
            platzhalter={PLATZHALTER_PROJEKT}
            vorschau={(t) => `Beispiel: ${sichererName(nameAus(t, beispiel))}`}
            unbekannt={(t) => unbekanntePlatzhalterIn(t, PLATZHALTER_PROJEKT)}
            onChange={(v) => set({ ordnername: v.trim() || struktur.ordnername })}
          />
        </Field>
        <Field label="Dateinamenschema für Pläne">
          <SchemaFeld
            label="Dateinamenschema für Pläne"
            value={struktur.dateischema}
            platzhalter={PLATZHALTER_PLAN}
            vorschau={(t) =>
              `Beispiel: ${dateiBeispiel(t)}.pdf${dateimuster(t, beispiel.nummer).test(dateiBeispiel(t)) ? '' : ' (das Schema erkennt sein eigenes Beispiel nicht – bitte Trennzeichen prüfen)'}`
            }
            unbekannt={(t) => unbekanntePlatzhalterIn(t, PLATZHALTER_PLAN)}
            onChange={(v) => set({ dateischema: v.trim() })}
          />
        </Field>
      </section>

      <section className="po-col">
        <div className="po-ordner-kopf">
          <h2>Ordner</h2>
          <div className="tb-group" role="group" aria-label="Ansicht der Ordnerliste">
            <button className={`small${ordnerAnsicht === 'baum' ? ' active' : ''}`} aria-pressed={ordnerAnsicht === 'baum'} onClick={() => setOrdnerAnsicht('baum')}>
              Baum
            </button>
            <button
              className={`small${ordnerAnsicht === 'text' ? ' active' : ''}`}
              aria-pressed={ordnerAnsicht === 'text'}
              title="Die Ordnerliste als Text mit eigener Schreibweise bearbeiten"
              onClick={() => setOrdnerAnsicht('text')}
            >
              Text (Experte)
            </button>
          </div>
        </div>
        {ordnerAnsicht === 'baum' ? (
          <>
            <p className="muted small-text">
              Je Ordner: Leistungsphasen – der Ordner entsteht nur, wenn eine davon beauftragt ist (keine = immer) – und „Schema“: Dateien darin werden im Prüfmodus gegen das Dateinamenschema geprüft.
              ↑ ↓ verschieben, → macht einen Ordner zum Unterordner des Ordners darüber, ← eine Ebene höher.
            </p>
            <OrdnerBaum ordner={struktur.ordner} onChange={(ordner) => set({ ordner })} />
          </>
        ) : (
          <>
            <p className="muted small-text">
              Eine Zeile je Ordner, Unterordner mit „/“. Zusätze nach „|“: <code>LPh 5</code> oder <code>LPh 6-7</code> – der Ordner entsteht nur, wenn eine dieser Leistungsphasen beauftragt ist;{' '}
              <code>Dateischema</code> – Dateien darin werden im Prüfmodus gegen das Dateinamenschema geprüft.
            </p>
            <textarea
              className="po-ordnertext"
              aria-label="Ordnerliste"
              value={text}
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
              // mit Meldungen nicht still beim Verlassen übernehmen – erst nach Durchsicht über den Knopf
              onBlur={() => geaendert && !gelesen.meldungen.length && ordnerUebernehmen()}
            />
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
              <button className="primary" disabled={!geaendert} onClick={ordnerUebernehmen}>
                Ordnerliste übernehmen
              </button>
            </div>
          </>
        )}
        <p className="muted small-text">
          {struktur.ordner.length} Ordner, davon {struktur.ordner.filter((o) => o.lph?.length).length} an Leistungsphasen gebunden
        </p>
      </section>
    </div>
  );
}

/** Gemeinsame Einstellungen aller Apps – im Konfigurationsordner (auf einem Server-Laufwerk für das ganze Büro) */
function GemeinsameEinstellungen() {
  const desktop = hatDateisystem();
  const { konfig, konfigFehler, allgemein, setAllgemein, konfigOrdnerSetzen, struktur } = useOrdner();
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null);
  const beispiel = musterWerte(nummerAus(struktur.nummernschema, 14));

  const konfigWaehlen = async (lokal: boolean) => {
    setMeldung(null);
    try {
      const ziel = lokal ? null : await waehleOrdner('Gemeinsamen Konfigurationsordner wählen');
      if (!lokal && !ziel) return;
      const uebernommen = await konfigOrdnerSetzen(ziel);
      setMeldung({
        art: 'ok',
        text: `${lokal ? 'Die Einstellungen liegen wieder auf diesem Rechner.' : `Konfigurationsordner: ${ziel}.`}${uebernommen.length ? ` Übernommen: ${uebernommen.join(', ')}.` : ' Was dort schon lag, gilt jetzt.'}`,
      });
    } catch (e) {
      setMeldung({ art: 'fehler', text: e instanceof Error ? e.message : String(e) });
    }
  };
  const stammordnerHinzufuegen = async () => {
    const p = await waehleOrdner('Stammordner mit Projektordnern wählen');
    if (p && !allgemein.projekte.includes(p)) setAllgemein({ projekte: [...allgemein.projekte, p] });
  };

  return (
    <>
      <h2>Gemeinsame Einstellungen</h2>
      <p className="muted small-text">Gelten für alle Apps (Projektordner, Formulare, Flächenrechner …). Liegt der Konfigurationsordner auf dem Server, gelten sie für das ganze Büro.</p>
      {desktop ? (
        <div className="po-ort">
          <div>
            <span className="field-label">Konfigurationsordner</span>
            <code title={konfig?.ordner}>{konfig ? `${konfig.ordner}${konfig.gewaehlt ? '' : ' (auf diesem Rechner)'}` : 'wird gelesen …'}</code>
          </div>
          <button
            className="small"
            onClick={() => void konfigWaehlen(false)}
            title="Gemeinsamen Ordner wählen, z. B. auf dem Server – fehlende Einstellungen werden dorthin übernommen, vorhandene gelten"
          >
            Wählen …
          </button>
          {konfig?.gewaehlt && (
            <button className="small" onClick={() => void konfigWaehlen(true)}>
              Lokal
            </button>
          )}
        </div>
      ) : (
        <p className="muted small-text">Im Browser liegen die Einstellungen im Speicher dieses Browsers.</p>
      )}
      {konfigFehler && <p className="warning">{konfigFehler}</p>}
      {meldung && <p className={meldung.art === 'fehler' ? 'warning' : 'po-meldung'}>{meldung.text}</p>}

      <span className="field-label">Stammordner der Projekte</span>
      <ul className="list po-stammordner">
        {allgemein.projekte.map((p, i) => (
          <li key={p}>
            <code title={p}>{p}</code>
            {i === 0 ? (
              <span className="muted small-text">neue Projekte</span>
            ) : (
              <button className="small" title="Neue Projekte hier anlegen" onClick={() => setAllgemein({ projekte: [p, ...allgemein.projekte.filter((x) => x !== p)] })}>
                für neue
              </button>
            )}
            <button className="small" title="Aus der Liste nehmen – am Ordner ändert sich nichts" onClick={() => setAllgemein({ projekte: allgemein.projekte.filter((x) => x !== p) })}>
              ×
            </button>
          </li>
        ))}
        {!allgemein.projekte.length && <li className="muted">noch keiner</li>}
      </ul>
      {desktop && (
        <div className="button-row">
          <button className="small" onClick={() => void stammordnerHinzufuegen()}>
            + Stammordner
          </button>
        </div>
      )}
      <Field label="Projektdatei (.oap) in neuen Projekten" hint="Pfad im Projektordner – {datum} ohne Format hier wie bisher als JJMMTT, mit Format z. B. {datum:JJJJ-MM-TT}">
        <SchemaFeld
          label="Projektdatei (.oap) in neuen Projekten"
          value={allgemein.oapPfad}
          platzhalter={OAP_PLATZHALTER}
          vorschau={(t) => `Beispiel: ${projektdateiPfad(t, { nummer: beispiel.nummer, kurzname: beispiel.kurzname, vorhaben: beispiel.vorhaben })}`}
          unbekannt={unbekanntePlatzhalter}
          onChange={(v) => setAllgemein({ oapPfad: v.trim() })}
        />
      </Field>
      <Field label="Fotoordner im Projekt" hint="Hier sucht die Entzerrung (auch in Unterordnern) nach Fotos; die .entz-Datei liegt beim Foto.">
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
