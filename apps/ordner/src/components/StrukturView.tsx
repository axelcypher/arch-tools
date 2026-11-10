import { useEffect, useState } from 'react';
import { openTextFile, saveTextFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { Field, TextField } from '@core/ui/fields';
import { dateimuster, nameAus, nummerAus } from '../nummer';
import { useOrdner } from '../store';
import type { Struktur } from '../struktur';
import { ordnerAlsText, ordnerAusText, sichererName, STANDARD, strukturAlsJson, strukturAusJson } from '../struktur';

const log = logger('struktur');

/** Struktur des Büros: Ordnerbaum und Namensschemata – samt den Vorlagen-Presets als Datei speicher- und ladbar */
export function StrukturView() {
  const struktur = useOrdner((s) => s.struktur);
  const setStruktur = useOrdner((s) => s.setStruktur);
  const [text, setText] = useState(() => ordnerAlsText(struktur.ordner));
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null);

  useEffect(() => setText(ordnerAlsText(struktur.ordner)), [struktur.ordner]);

  const set = (patch: Partial<Struktur>) => setStruktur({ ...struktur, ...patch });
  const ordnerUebernehmen = () => {
    const ordner = ordnerAusText(text);
    if (!ordner.length) return setMeldung({ art: 'fehler', text: 'Die Liste enthält keinen Ordner – die bisherige Struktur bleibt bestehen.' });
    set({ ordner });
    setMeldung(null);
  };

  const laden = async () => {
    const f = await openTextFile('.json,application/json');
    if (!f) return;
    try {
      const s = strukturAusJson(f.text);
      setStruktur(s);
      setMeldung({ art: 'ok', text: `Struktur „${s.name}“ aus ${f.name} geladen (${s.ordner.length} Ordner, ${s.presets.length} ${s.presets.length === 1 ? 'Preset' : 'Presets'}).` });
      log.info(`Struktur geladen: ${s.name}`, { ordner: s.ordner.length, presets: s.presets.length });
    } catch (e) {
      setMeldung({ art: 'fehler', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const speichern = () =>
    saveTextFile({ defaultName: `Projektstruktur ${sichererName(struktur.name)}.json`, contents: strukturAlsJson(struktur), filterName: 'Projektstruktur', extension: 'json', mime: 'application/json' });

  const beispiel = { nummer: nummerAus(struktur.nummernschema, 14), kurzname: 'EFH Musterweg', jahr: new Date().getFullYear() };
  const dateiBeispiel = nameAus(struktur.dateischema, { ...beispiel, projekt: beispiel.nummer, plannummer: 'A-101', index: 'b', titel: 'Grundriss EG', datum: '2026-10-01' });
  const dateiPasst = dateimuster(struktur.dateischema, beispiel.nummer).test(dateiBeispiel);
  const geaendert = text !== ordnerAlsText(struktur.ordner);

  return (
    <div className="po-view">
      <section className="po-col">
        <h2>Struktur</h2>
        <p className="muted small-text">
          Ordnerbaum und Namensschemata gehören dem Büro, nicht dem Tool: Die Struktur lässt sich als Datei speichern, weitergeben und auf einem anderen Rechner laden – samt
          den Vorlagen-Presets (unter „Vorlagen“).
        </p>
        <div className="button-row">
          <button onClick={() => void laden()}>Struktur laden …</button>
          <button onClick={() => void speichern()}>Struktur speichern …</button>
          <button
            title="Ordner und Namensschemata auf die neutrale Vorgabe zurücksetzen – Presets und Dateinamen der Vorlagen bleiben"
            onClick={() => {
              setStruktur({ ...STANDARD, vorlagenname: struktur.vorlagenname, presets: struktur.presets });
              setMeldung({ art: 'ok', text: 'Neutrale Standardstruktur wiederhergestellt; die Vorlagen-Presets bleiben.' });
            }}
          >
            Standard
          </button>
        </div>
        {meldung && <p className={meldung.art === 'fehler' ? 'warning' : 'po-meldung'}>{meldung.text}</p>}

        <Field label="Name der Struktur">
          <TextField value={struktur.name} onChange={(v) => set({ name: v.trim() || struktur.name })} />
        </Field>
        <Field label="Projektnummer" hint={`{jahr}, {jj}, {nr} oder {nr:3} – Beispiel: ${beispiel.nummer}`}>
          <TextField value={struktur.nummernschema} onChange={(v) => set({ nummernschema: v.trim() || struktur.nummernschema })} />
        </Field>
        <Field label="Name des Projektordners" hint={`{nummer}, {kurzname}, {jahr} – Beispiel: ${sichererName(nameAus(struktur.ordnername, beispiel))}`}>
          <TextField value={struktur.ordnername} onChange={(v) => set({ ordnername: v.trim() || struktur.ordnername })} />
        </Field>
        <Field
          label="Dateinamenschema für Pläne"
          hint={`{nummer}, {plannummer}, {index}, {titel}, {datum} – Beispiel: ${dateiBeispiel}.pdf${dateiPasst ? '' : ' (das Schema erkennt sein eigenes Beispiel nicht – bitte Trennzeichen prüfen)'}`}
        >
          <TextField value={struktur.dateischema} onChange={(v) => set({ dateischema: v.trim() })} />
        </Field>
        <Field label="Leere Flächenrechner-Datei" hint="Pfad im Projektordner; leer = keine. Die Datei öffnen Flächenrechner, GRZ-Nachweis und Kostenermittlung – die Projektdaten sind schon eingetragen.">
          <TextField value={struktur.flaechenprojekt} onChange={(v) => set({ flaechenprojekt: v.trim() })} />
        </Field>

      </section>

      <section className="po-col">
        <h2>Ordner</h2>
        <p className="muted small-text">
          Eine Zeile je Ordner, Unterordner mit „/“. Zusätze nach „|“: <code>LPh 5</code> oder <code>LPh 6-7</code> – der Ordner entsteht nur, wenn eine dieser Leistungsphasen
          beauftragt ist; <code>Dateischema</code> – Dateien darin werden im Prüfmodus gegen das Dateinamenschema geprüft.
        </p>
        <textarea className="po-ordnertext" value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} onBlur={() => geaendert && ordnerUebernehmen()} />
        <div className="button-row">
          <button className="primary" disabled={!geaendert} onClick={ordnerUebernehmen}>
            Ordnerliste übernehmen
          </button>
          <span className="muted small-text">
            {struktur.ordner.length} Ordner, davon {struktur.ordner.filter((o) => o.lph?.length).length} an Leistungsphasen gebunden
          </span>
        </div>
      </section>
    </div>
  );
}
