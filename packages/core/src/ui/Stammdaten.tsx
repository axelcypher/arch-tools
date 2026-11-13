import { useEffect, useId, useRef, useState } from 'react';
import type { Anschrift, Beteiligter, KontaktArt, ProjectMeta } from '../model';
import { anschriftEinzeilig, bebauungsplanText, flurText, LEISTUNGSPHASEN } from '../model';
import { Field, NumberField, TextField } from './fields';
import type { Pruefung } from './pruefen';
import { alle, email, ordnername, plz } from './pruefen';
import { useEscSchliessen } from './Dialog';
import { abfragbar, adresseSchluessel, geokodierungMoeglich, koordinatenFuerQgis, koordinatenVeraltet, mitKoordinaten, QUELLE } from '../platform/geokodierung';

/**
 * Stammdaten eines Projekts bearbeiten – gemeinsam für alle Apps. `StammdatenFelder` sind die Eingaben (auch in
 * Teilen, z. B. je Schritt eines Assistenten), `StammdatenDialog` legt sie als Dialog an – etwa wenn ein
 * Projektordner noch keine Projektdatei (.oap) hat: Dann ist das kein Fehler, sondern der Anlass, sie anzulegen.
 */

/** 'umfang' = Leistungen (Leistungsphasen, Bearbeitung) und Beteiligte; einzeln: 'leistungen', 'beteiligte' */
export type StammdatenBereich = 'projekt' | 'grundstueck' | 'bauherr' | 'umfang' | 'leistungen' | 'beteiligte';

/** typische Beteiligte eines Bauvorhabens in NRW – Vorschläge für die Rolle (Freitext bleibt möglich) */
export const ROLLEN = [
  'Tragwerksplanung',
  'Prüfingenieur/-in für Standsicherheit',
  'Brandschutz',
  'Prüfingenieur/-in für Brandschutz',
  'Vermessung (ÖbVI)',
  'TGA-Planung',
  'Energieberatung / GEG-Nachweis',
  'Bodengutachten',
  // nach den Schnellwahl-Knöpfen (ROLLEN_SCHNELL = die ersten acht), nur als Vorschlag in der Auswahl:
  // Bescheinigung, dass das Vorhaben den Anforderungen an den Brandschutz entspricht – bei Gebäudeklasse 4 und 5 ohne
  // Sonderbau und bei Mittelgaragen (§ 68 Abs. 2 BauO NRW)
  'Prüfsachverständige/-r für Brandschutz',
  // Bescheinigung des Standsicherheitsnachweises, außer Wohngebäude der Gebäudeklassen 1 und 2 u. a. (§ 68 Abs. 3 BauO NRW)
  'Prüfsachverständige/-r für Standsicherheit',
  // Schall- und Wärmeschutznachweis, außer Wohngebäude der Gebäudeklassen 1 und 2 (§ 68 Abs. 4 i. V. m. § 87 Abs. 2 BauO NRW)
  'Staatlich anerkannte/-r Sachverständige/-r für Schall- und Wärmeschutz',
  'SiGeKo (BaustellV)',
  'Bauaufsicht',
  'Bauleitung',
];

/** Schnellwahl der Leistungsphasen */
const LPH_SCHNELL: { label: string; title: string; lph: number[] }[] = [
  { label: '1–4 bis Bauantrag', title: 'Grundlagenermittlung bis Genehmigungsplanung', lph: [1, 2, 3, 4] },
  { label: '5–8', title: 'Ausführungsplanung bis Objektüberwachung', lph: [5, 6, 7, 8] },
  { label: '1–9 alle', title: 'alle Leistungsphasen', lph: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  // leer heißt „alles“ (nicht „keine“): so benannt, damit die aktive Markierung nicht „keine Leistungsphase“ behauptet
  { label: 'ohne Einschränkung', title: 'keine Auswahl – es entstehen Ordner und Vorlagen aller Leistungsphasen', lph: [] },
];

const ALLE: StammdatenBereich[] = ['projekt', 'grundstueck', 'bauherr', 'umfang'];

/** Rollen, die als Schnellwahl unter den Beteiligten stehen (die ersten typischen) */
const ROLLEN_SCHNELL = ROLLEN.slice(0, 8);

export function StammdatenFelder({
  meta,
  onChange,
  bereiche = ALLE,
  nummerHinweis,
  nummerVorschlag,
  kurznameHinweis = 'wird Teil des Ordnernamens',
  kurznamePflicht = false,
  fehlerZeigen = false,
  nummerPruefen,
  ordnerName,
  bearbeiterVorschlaege,
  beteiligtVorschlaege,
  rollenSchnell = false,
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
  /** weitere (weiche) Prüfung der Projektnummer, z. B. gegen das Nummernschema des Büros */
  nummerPruefen?: Pruefung;
  /** der Ordnername, der sich aus Nummer und Kurzname ergibt – steht direkt unter den beiden Feldern */
  ordnerName?: string;
  /** Vorschläge für „Bearbeitung“ (Kürzel der Mitarbeiter aus den Einstellungen) */
  bearbeiterVorschlaege?: string[];
  /** Beteiligte früherer Projekte: Vorschläge für den Namen, Rolle und Kontakt werden ergänzt */
  beteiligtVorschlaege?: Beteiligter[];
  /** Knöpfe „+ Tragwerksplanung“ … zum schnellen Anlegen typischer Beteiligter */
  rollenSchnell?: boolean;
}) {
  const id = useId();
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
  const setLph = (neu: number[]) => {
    const m: ProjectMeta = { ...meta, leistungsphasen: neu };
    if (!neu.length) delete m.leistungsphasen;
    onChange(m);
  };
  const toggleLph = (nr: number) => setLph(lph.includes(nr) ? lph.filter((x) => x !== nr) : [...lph, nr].sort((a, b) => a - b));
  const beteiligte = meta.beteiligte ?? [];
  const setBeteiligte = (liste: Beteiligter[]) => {
    const m: ProjectMeta = { ...meta, beteiligte: liste };
    if (!liste.length) delete m.beteiligte;
    onChange(m);
  };
  // Name aus einem früheren Projekt gewählt: leere Rolle und leeren Kontakt ergänzen
  const setBeteiligtName = (i: number, name: string) => {
    const v = beteiligtVorschlaege?.find((b) => b.name.trim().toLowerCase() === name.trim().toLowerCase());
    setBeteiligte(beteiligte.map((x, k) => (k === i ? { ...x, name, ...(v && !x.rolle.trim() ? { rolle: v.rolle } : {}), ...(v && !x.kontakt.trim() ? { kontakt: v.kontakt } : {}) } : x)));
  };
  const vorschlagNamen = [...new Set((beteiligtVorschlaege ?? []).map((b) => b.name.trim()).filter(Boolean))];
  const zeigt = (b: StammdatenBereich) => bereiche.includes(b) || ((b === 'leistungen' || b === 'beteiligte') && bereiche.includes('umfang'));
  const setBplan = (patch: { nummer?: string; name?: string }) => {
    const bp = { ...meta.bebauungsplan, ...patch };
    if (!bp.nummer) delete bp.nummer;
    if (!bp.name) delete bp.name;
    const m: ProjectMeta = { ...meta, bebauungsplan: bp };
    if (!bp.nummer && !bp.name) delete m.bebauungsplan;
    onChange(m);
  };

  return (
    <div className="sd-felder">
      {zeigt('projekt') && (
        <>
          <div className="field-row">
            <Field label="Projektnummer" hint={nummerHinweis} pflicht>
              <TextField
                value={meta.projektcode}
                placeholder={nummerVorschlag}
                pflicht
                zeigen={fehlerZeigen}
                pruefen={nummerPruefen ? alle(ordnername, nummerPruefen) : ordnername}
                live
                onChange={(v) => set({ projektcode: v.trim() })}
              />
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
          {ordnerName !== undefined && (
            <div className="sd-ordnername small-text">Ordnername: {ordnerName ? <strong>{ordnerName}</strong> : <span className="muted">ergibt sich aus Nummer und Kurzname</span>}</div>
          )}
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
          <KoordinatenZeile meta={meta} onChange={onChange} />
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
          <div className="field-row">
            <Field label="Bebauungsplan Nr.">
              <TextField value={meta.bebauungsplan?.nummer ?? ''} placeholder="z. B. 112" onChange={(v) => setBplan({ nummer: v.trim() })} />
            </Field>
            <Field label="Bebauungsplan Name">
              <TextField value={meta.bebauungsplan?.name ?? ''} placeholder="z. B. Am Mühlenbach" onChange={(v) => setBplan({ name: v.trim() })} />
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
      {zeigt('leistungen') && (
        <>
          <h3 className="sd-titel">{zeigt('beteiligte') ? 'Leistungen und Beteiligte' : 'Leistungen'}</h3>
          <div className="sd-lph-schnell" role="group" aria-label="Schnellwahl Leistungsphasen">
            {LPH_SCHNELL.map((x) => (
              <button
                key={x.label}
                type="button"
                className={`small${x.lph.length === lph.length && x.lph.every((n) => lph.includes(n)) ? ' active' : ''}`}
                title={x.title}
                onClick={() => setLph(x.lph)}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div
            className="sd-lph"
            role="group"
            aria-label="Leistungsphasen"
            title="Ordner und Vorlagen, die an Leistungsphasen gebunden sind, entstehen nur für die gewählten. Ohne Auswahl gilt alles."
          >
            {LEISTUNGSPHASEN.map((l) => (
              <label key={l.nr} className="toggle" title={`LPh ${l.nr} ${l.label}`}>
                <input type="checkbox" checked={lph.includes(l.nr)} onChange={() => toggleLph(l.nr)} />
                {l.nr} {l.label}
              </label>
            ))}
          </div>
          <Field label="Bearbeitung" hint="Kürzel, z. B. TP">
            <TextField value={meta.bearbeiter} list={bearbeiterVorschlaege?.length ? `${id}-bearbeiter` : undefined} onChange={(v) => set({ bearbeiter: v.trim() })} />
          </Field>
          {!!bearbeiterVorschlaege?.length && (
            <datalist id={`${id}-bearbeiter`}>
              {bearbeiterVorschlaege.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          )}
        </>
      )}
      {zeigt('beteiligte') && (
        <>
          <datalist id={`${id}-rollen`}>
            {[...new Set([...ROLLEN, ...(beteiligtVorschlaege ?? []).map((b) => b.rolle.trim()).filter(Boolean)])].map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          {vorschlagNamen.length > 0 && (
            <datalist id={`${id}-namen`}>
              {vorschlagNamen.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          )}
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
                      <TextField
                        value={b.rolle}
                        label={`Rolle ${i + 1}`}
                        list={`${id}-rollen`}
                        placeholder="z. B. Tragwerksplanung"
                        onChange={(v) => setBeteiligte(beteiligte.map((x, k) => (k === i ? { ...x, rolle: v } : x)))}
                      />
                    </td>
                    <td>
                      <TextField value={b.name} label={`Name ${i + 1}`} list={vorschlagNamen.length ? `${id}-namen` : undefined} onChange={(v) => setBeteiligtName(i, v)} />
                    </td>
                    <td>
                      <TextField value={b.kontakt} label={`Kontakt ${i + 1}`} onChange={(v) => setBeteiligte(beteiligte.map((x, k) => (k === i ? { ...x, kontakt: v } : x)))} />
                    </td>
                    <td>
                      <button
                        className="small danger"
                        title={`Beteiligten ${i + 1} entfernen`}
                        aria-label={`Beteiligten ${i + 1} entfernen`}
                        onClick={() => setBeteiligte(beteiligte.filter((_, k) => k !== i))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="button-row sd-beteiligte-knoepfe">
            <button className="small" onClick={() => onChange({ ...meta, beteiligte: [...beteiligte, { rolle: '', name: '', kontakt: '' }] })}>
              + Beteiligter
            </button>
            {rollenSchnell && (
              <span className="sd-rollen-schnell" role="group" aria-label="Beteiligte nach Rolle hinzufügen">
                {ROLLEN_SCHNELL.filter((r) => !beteiligte.some((b) => b.rolle.trim().toLowerCase() === r.toLowerCase())).map((r) => (
                  <button key={r} className="small" title={`Zeile für „${r}“ anlegen`} onClick={() => onChange({ ...meta, beteiligte: [...beteiligte, { rolle: r, name: '', kontakt: '' }] })}>
                    + {r}
                  </button>
                ))}
              </span>
            )}
          </div>
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
  name: nameAnfang,
  projektnummerPflicht = true,
}: {
  titel: string;
  text?: string;
  meta: ProjectMeta;
  speichernText?: string;
  /** `name`: die geänderte Bezeichnung des Projekts, wenn das Feld gezeigt wird */
  onSpeichern: (meta: ProjectMeta, name?: string) => Promise<void> | void;
  onAbbrechen: () => void;
  /** Bezeichnung des Projekts mit bearbeiten (z. B. in QUADRIO, TERRIO, NUMIO) */
  name?: string;
  /** ohne Projektnummer nicht speichern (Anlegen einer Projektdatei) */
  projektnummerPflicht?: boolean;
}) {
  const [meta, setMeta] = useState(anfang);
  const [name, setName] = useState(nameAnfang ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [versucht, setVersucht] = useState(false);
  useEscSchliessen(laeuft ? undefined : onAbbrechen);
  const offen = projektnummerPflicht ? stammdatenFehlen(meta) : [];
  const speichern = async () => {
    setVersucht(true);
    if (offen.length) return;
    setFehler(null);
    setLaeuft(true);
    try {
      // Koordinaten zur (geänderten) Adresse gleich mit sichern
      const mitLage = koordinatenVeraltet(meta) && geokodierungMoeglich() ? (await mitKoordinaten(meta)).meta : meta;
      await onSpeichern(mitLage, nameAnfang === undefined ? undefined : name.trim() || nameAnfang);
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
        {nameAnfang !== undefined && (
          <Field label="Bezeichnung des Projekts">
            <TextField value={name} onChange={setName} />
          </Field>
        )}
        <StammdatenFelder meta={meta} onChange={setMeta} fehlerZeigen={versucht} kurznameHinweis={projektnummerPflicht ? undefined : null} />
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

/**
 * Stammdaten in einer App ansehen und ändern, ohne die App zu wechseln: Kurzfassung und Knopf „Stammdaten …“, der den
 * gemeinsamen Dialog öffnet. Die Stammdaten liegen in der Projektdatei; andere Apps sehen Änderungen nach dem Speichern
 * und erneuten Laden (zusammengeführt wie alle Abschnitte).
 */
export function StammdatenKnopf({ project, onAendern, kurz = true }: { project: { name: string; meta: ProjectMeta }; onAendern: (meta: ProjectMeta, name: string) => void; kurz?: boolean }) {
  const [offen, setOffen] = useState(false);
  const m = project.meta;
  const zeilen = [
    m.projektcode,
    anschriftEinzeilig(m.adresse),
    flurText(m.grundstueck),
    bebauungsplanText(m.bebauungsplan) && `Bebauungsplan ${bebauungsplanText(m.bebauungsplan)}`,
    m.bauherr.name && `Bauherr: ${m.bauherr.name}`,
  ].filter(Boolean);
  return (
    <div className="sd-knopf">
      {kurz && (zeilen.length ? <div className="small-text">{zeilen.join(' · ')}</div> : <div className="muted small-text">Noch keine Stammdaten erfasst.</div>)}
      <button className="small" onClick={() => setOffen(true)} title="Bauvorhaben, Grundstück, Bebauungsplan, Bauherr – gemeinsam für alle Apps in der Projektdatei">
        Stammdaten …
      </button>
      {offen && (
        <StammdatenDialog
          titel="Stammdaten des Projekts"
          text="Gelten für alle Apps (Projektdatei). Andere Apps zeigen Änderungen, sobald das Projekt dort neu geladen wird."
          meta={m}
          name={project.name}
          projektnummerPflicht={false}
          speichernText="Übernehmen"
          onSpeichern={(meta, name) => {
            onAendern(meta, name ?? project.name);
            setOffen(false);
          }}
          onAbbrechen={() => setOffen(false)}
        />
      )}
    </div>
  );
}

const fmtKoord = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GENAU: Record<string, string> = { adresse: 'Hausnummer', strasse: 'nur Straße', ort: 'nur Ort' };

/**
 * Koordinaten der Adresse des Vorhabens (ETRS89 / UTM 32N, EPSG:25832): werden abgefragt, sobald die Adresse
 * vollständig ist und sich geändert hat (kurz nach dem letzten Eintrag), lassen sich für QGIS kopieren und neu abfragen.
 */
function KoordinatenZeile({ meta, onChange }: { meta: ProjectMeta; onChange: (m: ProjectMeta) => void }) {
  const [laeuft, setLaeuft] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const aktuell = useRef({ meta, onChange });
  aktuell.current = { meta, onChange };
  const k = meta.koordinaten;
  const veraltet = koordinatenVeraltet(meta);
  const schluessel = adresseSchluessel(meta.adresse);

  const abfragen = async (erzwingen = false) => {
    const m = aktuell.current.meta;
    const basis = erzwingen ? { ...m, koordinaten: undefined } : m;
    if (!abfragbar(m.adresse)) return;
    setLaeuft(true);
    setHinweis(null);
    const r = await mitKoordinaten(basis);
    setLaeuft(false);
    // inzwischen weitergetippt: das Ergebnis gehört zu einer anderen Adresse
    const jetzt = aktuell.current.meta;
    if (adresseSchluessel(jetzt.adresse) !== adresseSchluessel(m.adresse)) return;
    const neu: ProjectMeta = { ...jetzt };
    if (r.meta.koordinaten) neu.koordinaten = r.meta.koordinaten;
    else delete neu.koordinaten;
    aktuell.current.onChange(neu);
    setHinweis(r.hinweis ?? null);
  };

  // automatisch, kurz nachdem die Adresse fertig eingetragen ist
  useEffect(() => {
    if (!veraltet || !geokodierungMoeglich()) return;
    const t = setTimeout(() => void abfragen(), 800);
    return () => clearTimeout(t);
  }, [schluessel, veraltet]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!abfragbar(meta.adresse) && !k) return null;
  return (
    <div className="sd-koordinaten">
      <span className="field-label">Koordinaten (ETRS89 / UTM 32N, EPSG:25832)</span>
      <div className="sd-koordinaten-zeile">
        {k && !veraltet ? (
          <span className="sd-koordinaten-wert" title={`Breite ${k.lat.toFixed(6)}°, Länge ${k.lon.toFixed(6)}° · ${k.quelle}, ${k.stand}`}>
            O {fmtKoord(k.ost)} · N {fmtKoord(k.nord)}
            {k.genauigkeit && k.genauigkeit !== 'adresse' && <span className="sd-koordinaten-genau"> ({GENAU[k.genauigkeit]})</span>}
          </span>
        ) : (
          <span className="muted small-text">{laeuft ? 'werden abgefragt …' : geokodierungMoeglich() ? 'noch nicht ermittelt' : 'Abfrage hier nicht verfügbar'}</span>
        )}
        {k && !veraltet && (
          <button
            className="small"
            title="„Ost, Nord“ für QGIS kopieren (Koordinate in EPSG:25832, Punkt als Dezimalzeichen)"
            onClick={() => {
              void navigator.clipboard?.writeText(koordinatenFuerQgis(k));
              setKopiert(true);
              setTimeout(() => setKopiert(false), 1500);
            }}
          >
            {kopiert ? 'Kopiert' : 'Kopieren'}
          </button>
        )}
        {geokodierungMoeglich() && abfragbar(meta.adresse) && (
          <button className="small" disabled={laeuft} title={`Koordinaten zur Adresse bei ${QUELLE} abfragen – gesendet wird nur die Adresse des Vorhabens`} onClick={() => void abfragen(true)}>
            {k ? 'Neu abfragen' : 'Koordinaten abfragen'}
          </button>
        )}
      </div>
      {hinweis && <span className="field-hint warning-text">{hinweis}</span>}
    </div>
  );
}
