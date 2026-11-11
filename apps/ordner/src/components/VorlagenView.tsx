import { strToU8 } from 'fflate';
import { useMemo, useState } from 'react';
import { saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { Field, TextField } from '@core/ui/fields';
import { hatDateisystem, SpeicherDateisystem, tauriDateisystem, waehleOrdner } from '../dateisystem';
import { nummerAus } from '../nummer';
import { kurzeWerte, nichtVorausgewaehlt, presetPruefen, vorlagenDateien, zuordnungAufloesen } from '../plan';
import { bereinigt } from '../stammdaten';
import { useOrdner } from '../store';
import type { VorlagenEintrag, VorlagenPreset } from '../struktur';
import { lphAus, lphText, normPfad, zielordnerAus } from '../struktur';
import { MUSTER_VORLAGEN, PLATZHALTER_DOCS, zielDateiname } from '../vorlagen';
import { abweichungText, PresetAbweichungen, VorlagenordnerZeile } from './gemeinsam';

const log = logger('vorlagen');

/** höchstens so viele Einträge des Vorlagenordners auf einmal zeigen */
const MAX_QUELLEN = 400;
const MAX_VORSCHAU = 4;

/** Name, den es unter den Presets noch nicht gibt */
function freierName(basis: string, presets: VorlagenPreset[]): string {
  const da = new Set(presets.map((p) => p.name.toLowerCase()));
  if (!da.has(basis.toLowerCase())) return basis;
  for (let i = 2; ; i++) if (!da.has(`${basis} ${i}`.toLowerCase())) return `${basis} ${i}`;
}

/**
 * Vorlagen: Vorlagenordner, Dateinamenschema und Presets. Ein Preset ordnet Dateien oder Ordner aus dem
 * Vorlagenordner einer Stelle im Projekt zu und gibt ihnen dort einen Namen nach dem Schema des Büros.
 */
export function VorlagenView() {
  const desktop = hatDateisystem();
  const { struktur, setStruktur, vorlagen, stamm, setVorlagenordner } = useOrdner();
  const [gewaehlt, setGewaehlt] = useState(0);
  const [filter, setFilter] = useState('');
  const [loeschen, setLoeschen] = useState(false);
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'fehler'; text: string } | null>(null);
  /** Zuordnungen, deren Vorschau ganz aufgeklappt ist */
  const [aufgeklappt, setAufgeklappt] = useState<Set<number>>(new Set());

  const presets = struktur.presets;
  const index = Math.min(gewaehlt, presets.length - 1);
  const preset = index >= 0 ? presets[index] : null;
  const setPresets = (neu: VorlagenPreset[]) => setStruktur({ ...struktur, presets: neu });
  const setPreset = (patch: Partial<VorlagenPreset>) => setPresets(presets.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const setEintrag = (k: number, patch: Partial<VorlagenEintrag>) => preset && setPreset({ eintraege: preset.eintraege.map((e, i) => (i === k ? { ...e, ...patch } : e)) });
  const waehle = (i: number) => {
    setGewaehlt(i);
    setLoeschen(false);
    setAufgeklappt(new Set());
  };

  // Beispielwerte für die Vorschau: das angefangene neue Projekt, sonst ein Muster
  const werte = useMemo(() => {
    const s = bereinigt(stamm);
    return kurzeWerte(s.nummer && s.kurzname ? s : { ...s, nummer: nummerAus(struktur.nummernschema, 14), kurzname: 'EFH Musterweg', bearbeiter: s.bearbeiter || 'TP' }, new Date());
  }, [stamm, struktur.nummernschema]);
  const dateien = useMemo(() => vorlagenDateien(vorlagen), [vorlagen]);
  // Prüfmodus-Regeln auf das gewählte Preset: was landete außerhalb der Struktur?
  const abweichung = useMemo(() => (preset ? presetPruefen(preset, dateien, struktur, werte) : null), [preset, dateien, struktur, werte]);
  const nichtAutomatisch = useMemo(() => nichtVorausgewaehlt(struktur, vorlagen), [struktur, vorlagen]);

  // Ordner und Dateien des Vorlagenordners als Baum
  const quellen = useMemo(() => {
    const ordner = new Map<string, number>();
    for (const d of dateien) {
      const teile = d.pfad.split('/');
      for (let i = 1; i < teile.length; i++) {
        const p = teile.slice(0, i).join('/');
        ordner.set(p, (ordner.get(p) ?? 0) + 1);
      }
    }
    const alle = [...[...ordner].map(([pfad, anzahl]) => ({ pfad, ordner: true, anzahl })), ...dateien.map((d) => ({ pfad: d.pfad, ordner: false, anzahl: 1 }))];
    return alle.sort((a, b) => a.pfad.localeCompare(b.pfad, 'de', { numeric: true }));
  }, [dateien]);
  const f = filter.trim().toLowerCase();
  const gefiltert = f ? quellen.filter((q) => q.pfad.toLowerCase().includes(f)) : quellen;
  const imPreset = new Set(preset?.eintraege.map((e) => normPfad(e.quelle).toLowerCase()) ?? []);

  // Zielordner der Struktur: als Vorschläge und um fremde Ziele zu erkennen
  const strukturOrdner = useMemo(() => {
    const set = new Set<string>();
    for (const o of struktur.ordner) {
      const teile = o.pfad.split('/');
      for (let i = 1; i <= teile.length; i++) set.add(teile.slice(0, i).join('/'));
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
  }, [struktur.ordner]);
  const inStruktur = (ziel: string) => !ziel || strukturOrdner.some((o) => o.toLowerCase() === ziel.toLowerCase()) || struktur.ordner.some((o) => ziel.toLowerCase().startsWith(`${o.pfad.toLowerCase()}/`));

  const hinzufuegen = (pfad: string, ordner: boolean) => {
    if (!preset) return;
    // Zielordner vorschlagen: liegt die Vorlage schon in einem Ordner der Struktur, dorthin
    const eltern = ordner ? pfad : pfad.split('/').slice(0, -1).join('/');
    const ziel = strukturOrdner.find((o) => o.toLowerCase() === eltern.toLowerCase()) ?? '';
    setPreset({ eintraege: [...preset.eintraege, { quelle: pfad, ziel }] });
  };

  const neuesPreset = () => {
    const name = freierName('Neues Preset', presets);
    setPresets([...presets, { name, eintraege: [] }]);
    waehle(presets.length);
  };
  const duplizieren = () => {
    if (!preset) return;
    setPresets([...presets, { ...preset, name: freierName(`${preset.name} Kopie`, presets), standard: false, eintraege: preset.eintraege.map((e) => ({ ...e })) }]);
    waehle(presets.length);
  };
  const umbenennen = (name: string) => {
    const n = name.trim();
    if (!preset || !n || n === preset.name) return;
    if (presets.some((p, i) => i !== index && p.name.toLowerCase() === n.toLowerCase())) return setMeldung({ art: 'fehler', text: `Ein Preset „${n}“ gibt es schon.` });
    setMeldung(null);
    setPreset({ name: n });
  };

  const musterSchreiben = async () => {
    setMeldung(null);
    try {
      if (desktop) {
        const ziel = await waehleOrdner('Ordner für die Muster-Vorlagen wählen');
        if (!ziel) return;
        let neu = 0;
        for (const m of MUSTER_VORLAGEN) if (await tauriDateisystem.dateiAnlegen(ziel, m.pfad, strToU8(m.inhalt))) neu++;
        setVorlagenordner(ziel);
        log.info(`Muster-Vorlagen geschrieben: ${ziel}`, { neu });
        setMeldung({ art: 'ok', text: `${neu} Muster-Vorlagen angelegt${neu < MUSTER_VORLAGEN.length ? `, ${MUSTER_VORLAGEN.length - neu} schon vorhanden` : ''}. Der Ordner ist jetzt als Vorlagenordner eingestellt: ${ziel}` });
      } else {
        const fs = new SpeicherDateisystem();
        for (const m of MUSTER_VORLAGEN) await fs.dateiAnlegen('/zip', `Vorlagen/${m.pfad}`, strToU8(m.inhalt));
        await saveBinaryFile({ defaultName: 'Vorlagen.zip', data: fs.alsZip('/zip'), filterName: 'ZIP-Archiv', extension: 'zip', mime: 'application/zip' });
      }
    } catch (e) {
      setMeldung({ art: 'fehler', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const schemaBeispiel = zielDateiname('Kostenschätzung.xlsx', undefined, struktur.vorlagenname, werte);

  return (
    <div className="po-view">
      <section className="po-col">
        <h2>Vorlagen</h2>
        <p className="muted small-text">
          Die Vorlagen des Büros liegen in einem eigenen Ordner, gegliedert, wie es dem Büro passt. Presets legen fest, welche Datei an welche Stelle im Projekt kommt und wie
          sie dort heißt. Beim Anlegen und beim Aktualisieren eines Projekts werden fehlende Dateien ergänzt – vorhandene bleiben unverändert.
        </p>
        <VorlagenordnerZeile leerText="noch nicht gewählt" />
        {[...nichtAutomatisch].map(([name, a]) => (
          <p key={name} className="po-hinweis">
            Der Vorlagenordner ist anders gegliedert als die Struktur: Mit „{name}“ {abweichungText(a)}. Das Preset wird deshalb bei neuen Projekten nicht vorausgewählt –
            besser seine Ordner gezielt einem Zielordner der Struktur zuordnen.
          </p>
        ))}
        <Field
          label="Dateinamen im Projekt"
          hint={`{name} = Name der Vorlage ohne Endung, dazu {nummer}, {kurzname}, {jahr}, {datum}, {bearbeiter} – Beispiel: Kostenschätzung.xlsx → ${schemaBeispiel}. Vorlagen mit Platzhaltern im eigenen Namen behalten ihn.`}
        >
          <TextField value={struktur.vorlagenname} placeholder="{name}" onChange={(v) => setStruktur({ ...struktur, vorlagenname: v.trim() || '{name}' })} />
        </Field>

        <h2>Presets</h2>
        <p className="muted small-text">
          Ein Preset fasst Vorlagen zusammen, etwa für jedes Projekt, für den Bauantrag oder die Ausschreibung. Im Assistenten (Projekt) wird gewählt,
          welche gelten; Presets mit „Standard“ sind bei neuen Projekten vorausgewählt. Die Presets gehören zur Struktur und werden mit ihr gespeichert.
        </p>
        <ul className="list po-presets">
          {presets.map((p, i) => (
            <li key={`${i}:${p.name}`} className={i === index ? 'active' : ''} onClick={() => waehle(i)}>
              <span>{p.name}</span>
              <span className="muted small-text">
                {p.standard ? 'Standard · ' : ''}
                {p.eintraege.length} {p.eintraege.length === 1 ? 'Zuordnung' : 'Zuordnungen'}
              </span>
            </li>
          ))}
          {!presets.length && <li className="muted">Noch keine Presets.</li>}
        </ul>
        <div className="button-row">
          <button className="small" onClick={neuesPreset}>
            + Preset
          </button>
          <button className="small" disabled={!preset} onClick={duplizieren}>
            Duplizieren
          </button>
          {preset && !loeschen && (
            <button className="small" onClick={() => setLoeschen(true)}>
              Löschen
            </button>
          )}
          {preset && loeschen && (
            <>
              <button
                className="small danger"
                onClick={() => {
                  setPresets(presets.filter((_, i) => i !== index));
                  waehle(Math.max(0, index - 1));
                }}
              >
                „{preset.name}“ wirklich löschen
              </button>
              <button className="small" onClick={() => setLoeschen(false)}>
                Abbrechen
              </button>
            </>
          )}
        </div>
        {meldung && <p className={meldung.art === 'fehler' ? 'warning' : 'po-meldung'}>{meldung.text}</p>}

        <h2>Muster und Platzhalter</h2>
        <div className="button-row">
          <button onClick={() => void musterSchreiben()} title="Projektblatt, Planliste und Besprechungsprotokoll als Ausgangspunkt für eigene Vorlagen – aufgebaut wie ein Projektordner">
            {desktop ? 'Muster-Vorlagen in einen Ordner schreiben …' : 'Muster-Vorlagen als ZIP herunterladen'}
          </button>
        </div>
        <div className="placeholder-help">
          {PLATZHALTER_DOCS.map((g) => (
            <div key={g.gruppe}>
              <h4>{g.gruppe}</h4>
              <table>
                <tbody>
                  {g.zeilen.map(([k, d]) => (
                    <tr key={k}>
                      <td>
                        <code>{k}</code>
                      </td>
                      <td>{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="po-col">
        {!preset && (
          <>
            <h2>Preset</h2>
            <p className="muted small-text">Mit „+ Preset“ ein Preset anlegen und ihm Vorlagen aus dem Vorlagenordner zuordnen.</p>
          </>
        )}
        {preset && (
          <>
            <h2>Preset „{preset.name}“</h2>
            <div className="field-row">
              <Field label="Name" hint="Projekte merken sich ihre Presets beim Namen (in der Projektdatei)">
                <TextField value={preset.name} onChange={umbenennen} />
              </Field>
              <label className="toggle po-standard" title="Bei neuen Projekten vorausgewählt">
                <input type="checkbox" checked={!!preset.standard} onChange={() => setPreset({ standard: !preset.standard })} />
                Standard für neue Projekte
              </label>
            </div>

            <datalist id="po-strukturordner">
              {strukturOrdner.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
            {preset.eintraege.length === 0 && <p className="muted small-text">Noch keine Vorlagen zugeordnet – unten aus dem Vorlagenordner hinzufügen.</p>}
            {abweichung && <PresetAbweichungen a={abweichung} />}
            <ul className="po-zuordnungen">
              {preset.eintraege.map((e, k) => {
                const ziele = zuordnungAufloesen(e, dateien, struktur.vorlagenname, werte);
                const istOrdner = !e.quelle || (ziele.length > 0 && ziele.some((z) => z.datei.pfad.toLowerCase() !== normPfad(e.quelle).toLowerCase()));
                const fehlt = dateien.length > 0 && !ziele.length;
                return (
                  <li key={k} className={fehlt ? 'fehlt' : ''}>
                    <div className="po-z-kopf">
                      <span className={`po-art ${istOrdner ? 'ordner' : 'datei'}`} aria-hidden />
                      <TextField value={e.quelle} placeholder="ganzer Vorlagenordner" title="Pfad im Vorlagenordner – Datei oder Ordner" onChange={(v) => setEintrag(k, { quelle: normPfad(v) })} />
                      <span className="po-z-lph" title="nur, wenn eine dieser Leistungsphasen beauftragt ist – z. B. 4 oder 6-7; leer = immer">
                        LPh
                        <TextField
                          value={lphText(e.lph ?? [])}
                          placeholder="alle"
                          onChange={(v) => {
                            const lph = lphAus(v);
                            setEintrag(k, { lph: lph.length ? lph : undefined });
                          }}
                        />
                      </span>
                      <button className="small danger" title="Zuordnung entfernen" onClick={() => setPreset({ eintraege: preset.eintraege.filter((_, i) => i !== k) })}>
                        ×
                      </button>
                    </div>
                    <div className="field-row">
                      <Field label="Zielordner im Projekt">
                        <TextField value={e.ziel} list="po-strukturordner" placeholder="Stamm des Projektordners" onChange={(v) => setEintrag(k, { ziel: zielordnerAus(v) })} />
                      </Field>
                      <Field label={istOrdner ? 'Dateinamen im Projekt (je Datei)' : 'Dateiname im Projekt'}>
                        <TextField value={e.name ?? ''} placeholder={struktur.vorlagenname} onChange={(v) => setEintrag(k, { name: v.trim() || undefined })} />
                      </Field>
                    </div>
                    <div className="po-z-vorschau">
                      {fehlt && <span className="po-warn">{e.quelle ? `„${e.quelle}“ gibt es im Vorlagenordner nicht.` : 'Der Vorlagenordner enthält keine Vorlagen.'}</span>}
                      {!dateien.length && <span className="muted">Vorschau, sobald der Vorlagenordner eingelesen ist.</span>}
                      {ziele.slice(0, aufgeklappt.has(k) ? ziele.length : MAX_VORSCHAU).map((z) => (
                        <div key={z.datei.pfad} title={`aus dem Vorlagenordner: ${z.datei.pfad}`}>
                          → {z.pfad}
                        </div>
                      ))}
                      {ziele.length > MAX_VORSCHAU && (
                        <button
                          className="link po-mehr"
                          aria-expanded={aufgeklappt.has(k)}
                          onClick={() =>
                            setAufgeklappt((alt) => {
                              const neu = new Set(alt);
                              if (!neu.delete(k)) neu.add(k);
                              return neu;
                            })
                          }
                        >
                          {aufgeklappt.has(k) ? 'weniger zeigen' : `… und ${ziele.length - MAX_VORSCHAU} weitere`}
                        </button>
                      )}
                      {!inStruktur(e.ziel) && <div className="muted">Der Zielordner steht nicht in der Struktur – er wird zusätzlich angelegt.</div>}
                      {!e.ziel && !istOrdner && ziele.length > 0 && <div className="muted">Die Datei landet im Stamm des Projektordners – bitte einen Zielordner wählen.</div>}
                    </div>
                  </li>
                );
              })}
            </ul>

            <h3>Aus dem Vorlagenordner hinzufügen</h3>
            {!dateien.length ? (
              <p className="muted small-text">Zuerst den Vorlagenordner wählen (links).</p>
            ) : (
              <>
                <div className="button-row">
                  <input className="po-suche" value={filter} placeholder="Suchen …" onChange={(e) => setFilter(e.target.value)} />
                  <button className="small" disabled={imPreset.has('')} title="Alle Dateien an denselben Ort wie im Vorlagenordner" onClick={() => hinzufuegen('', true)}>
                    + ganzer Vorlagenordner
                  </button>
                </div>
                <div className="po-plan po-quellen">
                  <table className="po-table">
                    <tbody>
                      {gefiltert.slice(0, MAX_QUELLEN).map((q) => {
                        const tiefe = f ? 0 : q.pfad.split('/').length - 1;
                        const drin = imPreset.has(q.pfad.toLowerCase());
                        return (
                          <tr key={q.pfad} className={drin ? 'vorhanden' : ''}>
                            <td style={{ paddingLeft: 6 + tiefe * 16 }} title={q.pfad}>
                              <span className={`po-art ${q.ordner ? 'ordner' : 'datei'}`} aria-hidden />
                              {f ? q.pfad : q.pfad.split('/').pop()}
                              {q.ordner && (
                                <span className="muted small-text">
                                  {' '}
                                  ({q.anzahl} {q.anzahl === 1 ? 'Datei' : 'Dateien'})
                                </span>
                              )}
                            </td>
                            <td className="po-status">
                              {drin ? (
                                'im Preset'
                              ) : (
                                <button className="small" title={q.ordner ? 'Alle Dateien dieses Ordners zuordnen' : 'Diese Datei zuordnen'} onClick={() => hinzufuegen(q.pfad, q.ordner)}>
                                  +
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {gefiltert.length > MAX_QUELLEN && (
                  <p className="muted small-text">
                    {gefiltert.length - MAX_QUELLEN} weitere Einträge – bitte die Suche eingrenzen.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
