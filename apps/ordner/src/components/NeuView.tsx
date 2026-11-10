import { useEffect, useMemo, useState } from 'react';
import type { Anschrift, KontaktArt } from '@core/model';
import { saveBinaryFile } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { Field, NumberField, TextField } from '@core/ui/fields';
import type { Eintrag } from '../dateisystem';
import { hatDateisystem, SpeicherDateisystem, tauriDateisystem, verbinde, waehleOrdner } from '../dateisystem';
import { naechsteNummer } from '../nummer';
import type { Ergebnis } from '../plan';
import { ausfuehren, ohne, planen } from '../plan';
import type { Beteiligter } from '../stammdaten';
import { LEISTUNGSPHASEN } from '../stammdaten';
import { useOrdner } from '../store';
import { ErgebnisAnzeige, PlanMeldungen, PlanTabelle, PresetAuswahl, VorlagenordnerZeile } from './gemeinsam';

const log = logger('anlegen');

/** Neues Projekt: Stammdaten links, rechts der Trockenlauf – was angelegt wird und was schon da ist */
export function NeuView() {
  const desktop = hatDateisystem();
  const { stamm, struktur, stammordner, vorlagen, setStamm, setStammordner, neuesProjekt } = useOrdner();
  const [vorhandene, setVorhandene] = useState<Eintrag[]>([]);
  const [abgewaehlt, setAbgewaehlt] = useState<Set<string>>(new Set());
  const [projektordner, setProjektordner] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<{ ordner: string; liste: Ergebnis[] } | null>(null);

  // Ordner im Stammordner: für den Nummernvorschlag
  useEffect(() => {
    if (!desktop || !stammordner) return setProjektordner([]);
    let aktuell = true;
    tauriDateisystem.liste(stammordner, 1).then(
      (l) => aktuell && setProjektordner(l.filter((e) => e.ordner).map((e) => e.pfad)),
      (e) => aktuell && setFehler(`Stammordner: ${e instanceof Error ? e.message : String(e)}`),
    );
    return () => {
      aktuell = false;
    };
  }, [desktop, stammordner, ergebnis]);

  const ordner = useMemo(() => planen(stamm, struktur, []).ordner, [stamm, struktur]);

  // was es im Projektordner schon gibt
  useEffect(() => {
    if (!desktop || !stammordner || !ordner || !projektordner.some((p) => p.toLowerCase() === ordner.toLowerCase())) return setVorhandene([]);
    let aktuell = true;
    tauriDateisystem.liste(verbinde(stammordner, ordner), 12).then(
      (l) => aktuell && setVorhandene(l),
      () => aktuell && setVorhandene([]),
    );
    return () => {
      aktuell = false;
    };
  }, [desktop, stammordner, ordner, projektordner]);

  const plan = useMemo(() => planen(stamm, struktur, vorlagen, vorhandene), [stamm, struktur, vorlagen, vorhandene]);
  const auszufuehren = useMemo(() => ohne(plan, abgewaehlt), [plan, abgewaehlt]);
  const neu = auszufuehren.schritte.filter((s) => !s.vorhanden);
  const vorschlag = useMemo(() => naechsteNummer(struktur.nummernschema, projektordner), [struktur.nummernschema, projektordner]);

  const stammWaehlen = async () => {
    const p = await waehleOrdner('Stammordner für Projekte wählen');
    if (p) setStammordner(p);
  };
  const umschalten = (pfad: string) =>
    setAbgewaehlt((alt) => {
      const neu = new Set(alt);
      if (!neu.delete(pfad)) neu.add(pfad);
      return neu;
    });

  const anlegen = async () => {
    setFehler(null);
    setErgebnis(null);
    try {
      if (desktop) {
        setLaeuft('Projektordner wird angelegt …');
        const liste = await ausfuehren(tauriDateisystem, stammordner, auszufuehren, { fortschritt: (i, n) => setLaeuft(`Projektordner wird angelegt … ${i} / ${n}`) });
        log.info(`Projektordner angelegt: ${plan.ordner}`, { angelegt: liste.filter((x) => x.status === 'angelegt').length, fehler: liste.filter((x) => x.status === 'fehler').length, presets: plan.presets });
        setErgebnis({ ordner: verbinde(stammordner, plan.ordner), liste });
        setAbgewaehlt(new Set());
      } else {
        setLaeuft('ZIP wird erstellt …');
        const fs = new SpeicherDateisystem();
        const liste = await ausfuehren(fs, '/zip', auszufuehren);
        const ok = await saveBinaryFile({ defaultName: `${plan.ordner}.zip`, data: fs.alsZip('/zip'), filterName: 'ZIP-Archiv', extension: 'zip', mime: 'application/zip' });
        if (ok) setErgebnis({ ordner: '', liste });
      }
    } catch (e) {
      log.error('Anlegen fehlgeschlagen', e instanceof Error ? e.message : String(e));
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setLaeuft(null);
    }
  };

  const setAdresse = (patch: Partial<Anschrift>) => setStamm({ adresse: { ...stamm.adresse, ...patch } });
  const setBauherrAdresse = (patch: Partial<Anschrift>) => setStamm({ bauherr: { ...stamm.bauherr, adresse: { ...stamm.bauherr.adresse, ...patch } } });
  const kontakte = (art: KontaktArt) =>
    stamm.bauherr.kontakte
      .filter((k) => k.art === art)
      .map((k) => k.wert)
      .join(', ');
  const setKontakte = (art: KontaktArt, text: string) =>
    setStamm({
      bauherr: {
        ...stamm.bauherr,
        kontakte: [
          ...stamm.bauherr.kontakte.filter((k) => k.art !== art),
          ...text
            .split(/[,;]+/)
            .map((w) => w.trim())
            .filter(Boolean)
            .map((wert) => ({ art, wert })),
        ],
      },
    });
  const setBeteiligter = (i: number, patch: Partial<Beteiligter>) => setStamm({ beteiligte: stamm.beteiligte.map((b, k) => (k === i ? { ...b, ...patch } : b)) });
  const toggleLph = (nr: number) => setStamm({ leistungsphasen: stamm.leistungsphasen.includes(nr) ? stamm.leistungsphasen.filter((x) => x !== nr) : [...stamm.leistungsphasen, nr].sort() });

  return (
    <div className="po-view">
      <section className="po-col">
        <h2>Projekt</h2>
        <div className="field-row">
          <Field label="Projektnummer" hint={desktop && stammordner && vorschlag !== stamm.nummer ? `nächste freie Nummer: ${vorschlag}` : `Schema ${struktur.nummernschema}`}>
            <TextField value={stamm.nummer} placeholder={vorschlag} onChange={(v) => setStamm({ nummer: v })} />
          </Field>
          <Field label="Kurzname" hint="wird Teil des Ordnernamens">
            <TextField value={stamm.kurzname} placeholder="z. B. EFH Musterweg" onChange={(v) => setStamm({ kurzname: v })} />
          </Field>
        </div>
        {vorschlag !== stamm.nummer && (!stamm.nummer.trim() || (desktop && !!stammordner)) && (
          <button className="small" onClick={() => setStamm({ nummer: vorschlag })} title="Nächste freie Nummer nach den Ordnern im Stammordner – bitte mit der Nummernvergabe im Büro abgleichen">
            Nummer {vorschlag} übernehmen
          </button>
        )}
        <Field label="Bezeichnung des Vorhabens">
          <TextField value={stamm.bezeichnung} placeholder="z. B. Neubau eines Einfamilienhauses mit Garage" onChange={(v) => setStamm({ bezeichnung: v })} />
        </Field>
        <Field label="Bauvorhaben – Straße und Hausnummer">
          <TextField value={stamm.adresse.strasse} onChange={(v) => setAdresse({ strasse: v })} />
        </Field>
        <div className="field-row">
          <Field label="PLZ">
            <TextField value={stamm.adresse.plz} onChange={(v) => setAdresse({ plz: v })} />
          </Field>
          <Field label="Ort">
            <TextField value={stamm.adresse.ort} onChange={(v) => setAdresse({ ort: v })} />
          </Field>
        </div>
        <div className="field-row">
          <Field label="Gemarkung">
            <TextField value={stamm.grundstueck.gemarkung} onChange={(v) => setStamm({ grundstueck: { ...stamm.grundstueck, gemarkung: v } })} />
          </Field>
          <Field label="Flur">
            <TextField value={stamm.grundstueck.flur} onChange={(v) => setStamm({ grundstueck: { ...stamm.grundstueck, flur: v } })} />
          </Field>
        </div>
        <div className="field-row">
          <Field label="Flurstück">
            <TextField value={stamm.grundstueck.flurstueck} onChange={(v) => setStamm({ grundstueck: { ...stamm.grundstueck, flurstueck: v } })} />
          </Field>
          <Field label="Grundstücksfläche [m²]">
            <NumberField value={stamm.grundstueck.flaeche} allowEmpty min={0} onChange={(v) => setStamm({ grundstueck: { ...stamm.grundstueck, flaeche: v } })} />
          </Field>
        </div>

        <h2>Bauherr</h2>
        <Field label="Name">
          <TextField value={stamm.bauherr.name} onChange={(v) => setStamm({ bauherr: { ...stamm.bauherr, name: v } })} />
        </Field>
        <Field label="Straße und Hausnummer">
          <TextField value={stamm.bauherr.adresse.strasse} onChange={(v) => setBauherrAdresse({ strasse: v })} />
        </Field>
        <div className="field-row">
          <Field label="PLZ">
            <TextField value={stamm.bauherr.adresse.plz} onChange={(v) => setBauherrAdresse({ plz: v })} />
          </Field>
          <Field label="Ort">
            <TextField value={stamm.bauherr.adresse.ort} onChange={(v) => setBauherrAdresse({ ort: v })} />
          </Field>
        </div>
        <div className="field-row">
          <Field label="E-Mail" hint="mehrere mit Komma">
            <TextField value={kontakte('email')} onChange={(v) => setKontakte('email', v)} />
          </Field>
          <Field label="Telefon">
            <TextField value={kontakte('telefon')} onChange={(v) => setKontakte('telefon', v)} />
          </Field>
        </div>

        <h2>Leistungen und Beteiligte</h2>
        <div className="po-lph" title="Ordner und Vorlagen, die an Leistungsphasen gebunden sind, entstehen nur für die gewählten. Ohne Auswahl entsteht alles.">
          {LEISTUNGSPHASEN.map((l) => (
            <label key={l.nr} className="toggle" title={l.label}>
              <input type="checkbox" checked={stamm.leistungsphasen.includes(l.nr)} onChange={() => toggleLph(l.nr)} />
              LPh {l.nr}
            </label>
          ))}
        </div>
        <Field label="Bearbeitung">
          <TextField value={stamm.bearbeiter} onChange={(v) => setStamm({ bearbeiter: v })} />
        </Field>
        {stamm.beteiligte.length > 0 && (
          <table className="po-table po-beteiligte">
            <thead>
              <tr>
                <th>Rolle</th>
                <th>Name / Büro</th>
                <th>Kontakt</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stamm.beteiligte.map((b, i) => (
                <tr key={i}>
                  <td>
                    <TextField value={b.rolle} placeholder="z. B. Tragwerk" onChange={(v) => setBeteiligter(i, { rolle: v })} />
                  </td>
                  <td>
                    <TextField value={b.name} onChange={(v) => setBeteiligter(i, { name: v })} />
                  </td>
                  <td>
                    <TextField value={b.kontakt} onChange={(v) => setBeteiligter(i, { kontakt: v })} />
                  </td>
                  <td>
                    <button className="small danger" title="Beteiligten entfernen" onClick={() => setStamm({ beteiligte: stamm.beteiligte.filter((_, k) => k !== i) })}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="button-row">
          <button className="small" onClick={() => setStamm({ beteiligte: [...stamm.beteiligte, { rolle: '', name: '', kontakt: '' }] })}>
            + Beteiligter
          </button>
          <button className="small" onClick={neuesProjekt} title="Formular leeren (Bearbeitung bleibt stehen)">
            Formular leeren
          </button>
        </div>
      </section>

      <section className="po-col">
        <h2>Trockenlauf</h2>
        <div className="po-ort">
          <div>
            <span className="field-label">Stammordner für Projekte</span>
            {desktop ? <code title={stammordner}>{stammordner || 'noch nicht gewählt'}</code> : <span className="muted small-text">Im Browser entsteht der Projektordner als ZIP-Datei.</span>}
          </div>
          {desktop && (
            <button className="small" onClick={() => void stammWaehlen()}>
              Wählen …
            </button>
          )}
        </div>
        <VorlagenordnerZeile />
        <div className="po-presets-neu">
          <span className="field-label">Vorlagen-Presets</span>
          <PresetAuswahl struktur={struktur} auswahl={stamm.presets} onChange={(presets) => setStamm({ presets })} />
        </div>

        <h3>
          {plan.ordner || 'Projektordner'}
          <span className="muted small-text">
            {' '}
            – {neu.filter((s) => s.art === 'ordner').length} Ordner und {neu.filter((s) => s.art === 'datei').length} Dateien werden angelegt
          </span>
        </h3>
        {fehler && <p className="warning">{fehler}</p>}
        <PlanTabelle plan={plan} abgewaehlt={abgewaehlt} onUmschalten={umschalten} />
        <PlanMeldungen plan={plan} />
        <div className="button-row">
          <button className="primary" disabled={!!laeuft || plan.fehler.length > 0 || (desktop && !stammordner) || !neu.length} onClick={() => void anlegen()}>
            {desktop ? 'Projektordner anlegen' : 'Als ZIP herunterladen'}
          </button>
          {laeuft && <span className="busy">{laeuft}</span>}
        </div>
        <p className="muted small-text">Es wird nur neu angelegt. Vorhandene Ordner und Dateien bleiben unverändert; nichts wird überschrieben, verschoben oder gelöscht.</p>

        {ergebnis && (
          <ErgebnisAnzeige ordner={ergebnis.ordner} liste={ergebnis.liste}>
            <button
              className="small"
              onClick={() => {
                neuesProjekt();
                setErgebnis(null);
              }}
            >
              Nächstes Projekt
            </button>
          </ErgebnisAnzeige>
        )}
      </section>
    </div>
  );
}
