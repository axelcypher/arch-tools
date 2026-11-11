import { useState } from 'react';
import type { Anschrift, Beteiligter, KontaktArt, ProjectMeta } from '../model';
import { LEISTUNGSPHASEN } from '../model';
import { Field, NumberField, TextField } from './fields';
import { email, ordnername, plz } from './pruefen';
import { useEscSchliessen } from './Dialog';

/**
 * Stammdaten eines Projekts bearbeiten – gemeinsam für alle Apps. `StammdatenFelder` sind die Eingaben (auch in
 * Teilen, z. B. je Schritt eines Assistenten), `StammdatenDialog` legt sie als Dialog an – etwa wenn ein
 * Projektordner noch keine Projektdatei (.oap) hat: Dann ist das kein Fehler, sondern der Anlass, sie anzulegen.
 */

export type StammdatenBereich = 'projekt' | 'grundstueck' | 'bauherr' | 'umfang';

const ALLE: StammdatenBereich[] = ['projekt', 'grundstueck', 'bauherr', 'umfang'];

export function StammdatenFelder({
  meta,
  onChange,
  bereiche = ALLE,
  nummerHinweis,
  nummerVorschlag,
  kurznameHinweis = 'wird Teil des Ordnernamens',
  kurznamePflicht = false,
  fehlerZeigen = false,
}: {
  meta: ProjectMeta;
  onChange: (meta: ProjectMeta) => void;
  bereiche?: StammdatenBereich[];
  /** Hinweis unter der Projektnummer (z. B. das Schema) */
  nummerHinweis?: string;
  /** vorgeschlagene Projektnummer (Platzhalter im Feld, „übernehmen“-Knopf) */
  nummerVorschlag?: string;
  /** Hinweis unter dem Kurznamen (Vorgabe „wird Teil des Ordnernamens“; null = keiner) */
  kurznameHinweis?: string | null;
  /** Kurzname ist Pflicht (z. B. für den Ordnernamen eines neuen Projekts) */
  kurznamePflicht?: boolean;
  /** Meldungen an den Feldern auch ohne vorheriges Verlassen zeigen (nach „Weiter“ bzw. dem Absenden) */
  fehlerZeigen?: boolean;
}) {
  const set = (patch: Partial<ProjectMeta>) => onChange({ ...meta, ...patch });
  const setAdresse = (patch: Partial<Anschrift>) => set({ adresse: { ...meta.adresse, ...patch } });
  const setBauherr = (patch: Partial<ProjectMeta['bauherr']>) => set({ bauherr: { ...meta.bauherr, ...patch } });
  const setBauherrAdresse = (patch: Partial<Anschrift>) => setBauherr({ adresse: { ...meta.bauherr.adresse, ...patch } });
  const kontakte = (art: KontaktArt) =>
    meta.bauherr.kontakte
      .filter((k) => k.art === art)
      .map((k) => k.wert)
      .join(', ');
  const setKontakte = (art: KontaktArt, text: string) =>
    setBauherr({
      kontakte: [
        ...meta.bauherr.kontakte.filter((k) => k.art !== art),
        ...text
          .split(/[,;]+/)
          .map((w) => w.trim())
          .filter(Boolean)
          .map((wert) => ({ art, wert })),
      ],
    });
  const optional = (k: 'kurzname' | 'vorhaben' | 'aktenzeichen', v: string) => {
    const neu = { ...meta };
    if (v.trim()) neu[k] = v;
    else delete neu[k];
    onChange(neu);
  };
  const lph = meta.leistungsphasen ?? [];
  const toggleLph = (nr: number) => {
    const neu = lph.includes(nr) ? lph.filter((x) => x !== nr) : [...lph, nr].sort((a, b) => a - b);
    const m: ProjectMeta = { ...meta, leistungsphasen: neu };
    if (!neu.length) delete m.leistungsphasen;
    onChange(m);
  };
  const beteiligte = meta.beteiligte ?? [];
  const setBeteiligte = (liste: Beteiligter[]) => {
    const m: ProjectMeta = { ...meta, beteiligte: liste };
    if (!liste.length) delete m.beteiligte;
    onChange(m);
  };
  const zeigt = (b: StammdatenBereich) => bereiche.includes(b);

  return (
    <div className="sd-felder">
      {zeigt('projekt') && (
        <>
          <div className="field-row">
            <Field label="Projektnummer" hint={nummerHinweis} pflicht>
              <TextField value={meta.projektcode} placeholder={nummerVorschlag} pflicht zeigen={fehlerZeigen} pruefen={ordnername} live onChange={(v) => set({ projektcode: v.trim() })} />
            </Field>
            <Field label="Kurzname" hint={kurznameHinweis ?? undefined} pflicht={kurznamePflicht}>
              <TextField
                value={meta.kurzname ?? ''}
                placeholder="z. B. EFH Musterweg"
                pflicht={kurznamePflicht}
                zeigen={fehlerZeigen}
                pruefen={ordnername}
                live
                onChange={(v) => optional('kurzname', v)}
              />
            </Field>
          </div>
          {nummerVorschlag && nummerVorschlag !== meta.projektcode && (
            <button className="small sd-vorschlag" onClick={() => set({ projektcode: nummerVorschlag })} title="Nächste freie Nummer – bitte mit der Nummernvergabe im Büro abgleichen">
              Nummer {nummerVorschlag} übernehmen
            </button>
          )}
          <Field label="Bezeichnung des Vorhabens">
            <TextField value={meta.vorhaben ?? ''} placeholder="z. B. Neubau eines Einfamilienhauses mit Garage" onChange={(v) => optional('vorhaben', v)} />
          </Field>
          <Field label="Bauvorhaben – Straße und Hausnummer">
            <TextField value={meta.adresse.strasse} onChange={(v) => setAdresse({ strasse: v })} />
          </Field>
          <div className="field-row">
            <Field label="PLZ">
              <TextField value={meta.adresse.plz} pruefen={plz} zeigen={fehlerZeigen} onChange={(v) => setAdresse({ plz: v })} />
            </Field>
            <Field label="Ort">
              <TextField value={meta.adresse.ort} onChange={(v) => setAdresse({ ort: v })} />
            </Field>
          </div>
        </>
      )}
      {zeigt('grundstueck') && (
        <>
          <div className="field-row">
            <Field label="Gemarkung">
              <TextField value={meta.grundstueck.gemarkung} onChange={(v) => set({ grundstueck: { ...meta.grundstueck, gemarkung: v } })} />
            </Field>
            <Field label="Flur">
              <TextField value={meta.grundstueck.flur} onChange={(v) => set({ grundstueck: { ...meta.grundstueck, flur: v } })} />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Flurstück">
              <TextField value={meta.grundstueck.flurstueck} onChange={(v) => set({ grundstueck: { ...meta.grundstueck, flurstueck: v } })} />
            </Field>
            <Field label="Grundstücksfläche [m²]">
              <NumberField value={meta.grundstueck.flaeche} allowEmpty min={0} onChange={(v) => set({ grundstueck: { ...meta.grundstueck, flaeche: v } })} />
            </Field>
          </div>
          <Field label="Aktenzeichen der Bauaufsicht">
            <TextField value={meta.aktenzeichen ?? ''} onChange={(v) => optional('aktenzeichen', v)} />
          </Field>
        </>
      )}
      {zeigt('bauherr') && (
        <>
          <h3 className="sd-titel">Bauherr</h3>
          <div className="field-row">
            <Field label="Name bzw. Firma">
              <TextField value={meta.bauherr.name} onChange={(v) => setBauherr({ name: v })} />
            </Field>
            <Field label="Vorname">
              <TextField
                value={meta.bauherr.vorname ?? ''}
                onChange={(v) => {
                  const b: ProjectMeta['bauherr'] = { ...meta.bauherr, vorname: v.trim() };
                  if (!b.vorname) delete b.vorname;
                  set({ bauherr: b });
                }}
              />
            </Field>
          </div>
          <Field label="Straße und Hausnummer">
            <TextField value={meta.bauherr.adresse.strasse} onChange={(v) => setBauherrAdresse({ strasse: v })} />
          </Field>
          <div className="field-row">
            <Field label="PLZ">
              <TextField value={meta.bauherr.adresse.plz} pruefen={plz} zeigen={fehlerZeigen} onChange={(v) => setBauherrAdresse({ plz: v })} />
            </Field>
            <Field label="Ort">
              <TextField value={meta.bauherr.adresse.ort} onChange={(v) => setBauherrAdresse({ ort: v })} />
            </Field>
          </div>
          <div className="field-row">
            <Field label="E-Mail" hint="mehrere mit Komma">
              <TextField value={kontakte('email')} pruefen={email} zeigen={fehlerZeigen} onChange={(v) => setKontakte('email', v)} />
            </Field>
            <Field label="Telefon">
              <TextField value={kontakte('telefon')} onChange={(v) => setKontakte('telefon', v)} />
            </Field>
          </div>
        </>
      )}
      {zeigt('umfang') && (
        <>
          <h3 className="sd-titel">Leistungen und Beteiligte</h3>
          <div className="sd-lph" title="Ordner und Vorlagen, die an Leistungsphasen gebunden sind, entstehen nur für die gewählten. Ohne Auswahl gilt alles.">
            {LEISTUNGSPHASEN.map((l) => (
              <label key={l.nr} className="toggle" title={l.label}>
                <input type="checkbox" checked={lph.includes(l.nr)} onChange={() => toggleLph(l.nr)} />
                LPh {l.nr}
              </label>
            ))}
          </div>
          <Field label="Bearbeitung">
            <TextField value={meta.bearbeiter} onChange={(v) => set({ bearbeiter: v.trim() })} />
          </Field>
          {beteiligte.length > 0 && (
            <table className="sd-beteiligte">
              <thead>
                <tr>
                  <th>Rolle</th>
                  <th>Name / Büro</th>
                  <th>Kontakt</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {beteiligte.map((b, i) => (
                  <tr key={i}>
                    <td>
                      <TextField value={b.rolle} placeholder="z. B. Tragwerk" onChange={(v) => setBeteiligte(beteiligte.map((x, k) => (k === i ? { ...x, rolle: v } : x)))} />
                    </td>
                    <td>
                      <TextField value={b.name} onChange={(v) => setBeteiligte(beteiligte.map((x, k) => (k === i ? { ...x, name: v } : x)))} />
                    </td>
                    <td>
                      <TextField value={b.kontakt} onChange={(v) => setBeteiligte(beteiligte.map((x, k) => (k === i ? { ...x, kontakt: v } : x)))} />
                    </td>
                    <td>
                      <button className="small danger" title="Beteiligten entfernen" onClick={() => setBeteiligte(beteiligte.filter((_, k) => k !== i))}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button className="small" onClick={() => onChange({ ...meta, beteiligte: [...beteiligte, { rolle: '', name: '', kontakt: '' }] })}>
            + Beteiligter
          </button>
        </>
      )}
    </div>
  );
}

/** Was fehlt, damit die Stammdaten taugen (Projektnummer) */
export const stammdatenFehlen = (m: ProjectMeta): string[] => (m.projektcode.trim() ? [] : ['Die Projektnummer fehlt.']);

/**
 * Stammdaten als Dialog – z. B. wenn ein Projektordner keine Projektdatei hat. `onSpeichern` legt sie an bzw.
 * speichert; ein Fehler darin wird im Dialog gezeigt.
 */
export function StammdatenDialog({
  titel,
  text,
  meta: anfang,
  speichernText = 'Projektdatei anlegen',
  onSpeichern,
  onAbbrechen,
}: {
  titel: string;
  text?: string;
  meta: ProjectMeta;
  speichernText?: string;
  onSpeichern: (meta: ProjectMeta) => Promise<void> | void;
  onAbbrechen: () => void;
}) {
  const [meta, setMeta] = useState(anfang);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [versucht, setVersucht] = useState(false);
  useEscSchliessen(laeuft ? undefined : onAbbrechen);
  const offen = stammdatenFehlen(meta);
  const speichern = async () => {
    setVersucht(true);
    if (offen.length) return;
    setFehler(null);
    setLaeuft(true);
    try {
      await onSpeichern(meta);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide sd-dialog" role="dialog" aria-modal="true" aria-label={titel}>
        <h3>{titel}</h3>
        {text && <p className="muted small-text">{text}</p>}
        <StammdatenFelder meta={meta} onChange={setMeta} fehlerZeigen={versucht} />
        {fehler && <p className="warning">{fehler}</p>}
        <div className="dialog-buttons">
          <button onClick={onAbbrechen} disabled={laeuft}>
            Abbrechen
          </button>
          <button className="primary" disabled={laeuft} title={offen.join(' ')} onClick={() => void speichern()}>
            {speichernText}
          </button>
        </div>
      </div>
    </div>
  );
}
