import { useState } from 'react';
import type { ExportUeberschreibung, Status, UmfangEintrag } from '../antrag';
import { STATUS_TEXT, alsUmfang, dokumenteDerVorlage, naechsteFassung, umfangAusKatalog, verschieben, vorlageFuer } from '../antrag';
import { bedingungText } from '../bedingung';
import { BedingungEditor } from './BedingungEditor';
import type { DokZustand } from '../antragStore';
import { aktiveFassung, antragsOrdner, useAntrag, wirksameEinstellungen } from '../antragStore';
import { oeffnePfad, verbinde } from '../dateisystem';
import { ablageVon, useFormulare } from '../store';
import { useExportDialog } from './ExportDialog';
import type { MenuePunkt } from './Menue';
import { MenueKnopf, zeigeMenue } from './Menue';
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
  const arten = useAntrag((s) => wirksameEinstellungen(s, projekt).arten);
  const dokumente = useAntrag((s) => s.dokumente);
  const { fassungWaehlen } = useAntrag.getState();
  if (!projekt || !ablage) return null;
  const aktivDa = fassungen.some((f) => f.name === aktiv);
  const z = zusammenfassung(dokumente);
  const punkte = (): MenuePunkt[] => [
    ...fassungen.map((f) => ({ text: f.name, symbol: f.name === aktiv ? ('haken' as const) : undefined, aktion: () => void fassungWaehlen(f.name) })),
    ...(fassungen.length ? [{ trenner: true as const }] : []),
    ...arten.map((a) => {
      const neu = naechsteFassung(fassungen, a);
      return { text: `Neue Fassung „${neu}“ anlegen`, symbol: 'plus' as const, aktion: () => void fassungWaehlen(neu, true) };
    }),
  ];
  return (
    <div className="an-fassung">
      <span className="nav-klein">Antrag</span>
      <MenueKnopf className="small an-fassung-knopf" title="Aktive Antragsfassung: Ziel des Exports und Maßstab der Vollständigkeit" punkte={punkte}>
        <Symbol name="stapel" /> {aktiv}
        {!aktivDa && <span className="muted"> (neu)</span>}
      </MenueKnopf>
      {dokumente.length > 0 && (
        <button className="an-fassung-stand" title={`Projektumfang: ${z.aktuell} von ${z.gesamt} Dokumenten liegen aktuell im Antragsordner`} onClick={() => umfangZeigen()}>
          <StatusPunkt status={z.schlimmstes} titel={`${z.aktuell} von ${z.gesamt} aktuell`} /> {z.aktuell}/{z.gesamt}
        </button>
      )}
    </div>
  );
}

/** Projektkarte mit dem Reiter „Projektumfang“ zeigen */
export function umfangZeigen() {
  useFormulare.getState().setHaupt('projektkarte');
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('formulare:projektumfang')));
}

const ART_TEXT = { intern: 'Formular', extern: 'Datei' };

/**
 * Projektumfang: welche Dokumente zum Antrag gehören – grundlegend aus dem Katalog der Einstellungen, je Projekt
 * änderbar – mit ihrem Status in der aktiven Antragsfassung. Liegt im Abschnitt „formulare“ der Projektdatei (.oap)
 * und gilt damit für alle im Büro.
 */
export function ProjektumfangAnsicht() {
  const projekt = useFormulare((s) => s.projekt);
  const ds = useFormulare((s) => s.ds);
  const ablage = useFormulare((s) => ablageVon(s, s.projekt));
  const formulare = useFormulare((s) => s.formulare);
  const projektdatei = useAntrag((s) => s.projektdatei);
  const dokumente = useAntrag((s) => s.dokumente);
  const katalog = useAntrag((s) => s.katalog);
  const vorlagen = useAntrag((s) => s.vorlagen);
  const dateien = useAntrag((s) => s.dateien);
  const st = useAntrag();
  const { umfangSetzen, verknuepfen, formularAnlegen, aktualisieren, merkmalSetzen } = st;
  const merkmalWerte = st.projektdatei?.merkmale ?? {};
  const [bearbeiten, setBearbeiten] = useState<string | null>(null);
  const [vorlageWahl, setVorlageWahl] = useState<string | null>(null);
  const umfangJetzt = projektdatei?.umfang;
  const sortieren = useSortieren(umfangJetzt?.length ?? 0, (von, nach) => umfangJetzt && void umfangSetzen(verschieben(umfangJetzt, von, nach)));
  if (!projekt || !ds) return null;
  const fassung = aktiveFassung(st, projekt);
  // Vorschlag: die Vorlage zur Antragsart der aktiven Fassung („BAUA 2“ → BAUA)
  const art = st.fassungen.find((f) => f.name === fassung)?.art ?? fassung.replace(/[\s_-]*\d+$/, '');
  const vorlage = vorlagen.find((v) => v.id === vorlageWahl) ?? vorlageFuer(vorlagen, art);
  const ordner = antragsOrdner(st, projekt);
  const basis = ablage ? verbinde(ablage.root, ablage.pfad) : null;
  const umfang = projektdatei?.umfang;
  const z = zusammenfassung(dokumente);

  const setzen = (id: string, teil: Partial<UmfangEintrag>) => umfang && void umfangSetzen(umfang.map((u) => (u.id === id ? { ...u, ...teil } : u)));
  const fehlendeKatalog = katalog.filter((k) => !umfang?.some((u) => u.id === k.id));

  const hinzufuegen = (): MenuePunkt[] => [
    ...fehlendeKatalog.map((k) => ({
      text: k.titel,
      symbol: (k.art === 'intern' ? 'formular' : 'datei') as 'formular' | 'datei',
      aktion: () => void umfangSetzen([...(umfang ?? []), alsUmfang(k)]),
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
                aktion: () => void umfangSetzen([...(umfang ?? []), ...fehlen.map(alsUmfang)]),
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
        void umfangSetzen([...(umfang ?? []), { id, titel: 'Neues Dokument', art: 'extern' }]);
        setBearbeiten(id);
      },
    },
  ];

  const dateiMenue = (d: DokZustand): MenuePunkt[] => {
    const pdfs = dateien.filter((x) => !x.ordner);
    return [
      ...pdfs.map((x) => ({
        text: x.pfad,
        symbol: (d.datei?.pfad === x.pfad ? 'haken' : 'datei') as 'haken' | 'datei',
        aktion: () => void verknuepfen(d.eintrag.id, x.pfad),
      })),
      ...(pdfs.length ? [] : [{ text: `Keine Dateien in ${ordner}`, deaktiviert: true }]),
      ...(d.eintrag.dateien?.[fassung] ? [{ trenner: true as const }, { text: 'Verknüpfung lösen (wieder nach Muster)', aktion: () => void verknuepfen(d.eintrag.id, null) }] : []),
    ];
  };

  return (
    <div className="pu">
      <div className="pu-kopf">
        <div>
          <h2>Projektumfang</h2>
          <p className="muted small-text">
            Was zum Antrag gehört – geprüft im Ordner der aktiven Fassung <strong>{ordner}</strong>
            {basis ? '' : ' (kein Projektordner gefunden)'}. Gespeichert in der Projektdatei (.oap), gilt für alle im Büro.
          </p>
        </div>
        <div className="pu-kopf-knoepfe">
          <FassungsWahl />
          <button className="icon" title="Neu prüfen" aria-label="Neu prüfen" onClick={() => void aktualisieren()}>
            <Symbol name="verlauf" />
          </button>
          {basis && (
            <button className="icon" title="Antragsordner im Explorer zeigen" aria-label="Antragsordner zeigen" onClick={() => void oeffnePfad(verbinde(basis, ordner)).catch(() => undefined)}>
              <Symbol name="extern" />
            </button>
          )}
        </div>
      </div>

      <section className="pu-merkmale" aria-label="Projektmerkmale">
        <strong>Projektmerkmale</strong>
        {st.merkmalDefinitionen.map((m) => (
          <label key={m.name} className="pu-merkmal">
            <span className="field-label">{m.name}</span>
            <select value={merkmalWerte[m.name] ?? ''} aria-label={m.name} onChange={(e) => void merkmalSetzen(m.name, e.target.value)}>
              <option value="">–</option>
              {m.werte.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        ))}
        <span className="muted small-text">Gelten für alle Formulare dieses Projekts – Abschnitte und Felder mit Bedingung (z. B. „nur bei Gebäudeklasse 3–5“) kommen dazu oder entfallen.</span>
      </section>

      {!umfang ? (
        <div className="pu-leer">
          <p>
            Für dieses Projekt ist noch kein Projektumfang festgelegt. Danach zeigt die Navigation an jedem Formular, ob es vollständig ausgefüllt ist und aktuell im
            Antragsordner liegt; fehlende Formulare lassen sich per Klick anlegen.
          </p>
          <div className="pu-vorlage">
            <label>
              <span className="field-label">Antragsvorlage</span>
              <select value={vorlage?.id ?? ''} aria-label="Antragsvorlage" onChange={(e) => setVorlageWahl(e.target.value)}>
                {vorlagen.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.art ? ` (${v.art})` : ''} – {dokumenteDerVorlage(katalog, v).length} Dokumente
                  </option>
                ))}
                {!vorlagen.length && <option value="">ganzer Katalog – {katalog.length} Dokumente</option>}
              </select>
            </label>
            <button className="primary" onClick={() => void umfangSetzen(vorlage ? umfangAusKatalog(katalog, vorlage) : katalog.map(alsUmfang))}>
              Projektumfang festlegen
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="pu-legende small-text">
            <span>
              <StatusPunkt status="fehlt" /> fehlt
            </span>
            <span>
              <StatusPunkt status="unvollstaendig" /> nicht vollständig
            </span>
            <span>
              <StatusPunkt status="offen" /> nicht (aktuell) exportiert
            </span>
            <span>
              <StatusPunkt status="aktuell" /> aktuell in {fassung}
            </span>
            <span>
              <StatusPunkt status="entfaellt" /> nicht erforderlich
            </span>
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
                  onContextMenu={(e) =>
                    zeigeMenue(e, [
                      { text: 'Bearbeiten', symbol: 'stift', aktion: () => setBearbeiten(u.id) },
                      { text: 'Nach oben', deaktiviert: i === 0, aktion: () => void umfangSetzen(verschieben(umfang, i, i - 1)) },
                      { text: 'Nach unten', deaktiviert: i === umfang.length - 1, aktion: () => void umfangSetzen(verschieben(umfang, i, i + 1)) },
                      { trenner: true },
                      { text: 'Aus dem Projektumfang nehmen', symbol: 'muell', gefahr: true, aktion: () => void umfangSetzen(umfang.filter((x) => x.id !== u.id)) },
                    ])
                  }
                >
                  <div className="pu-haupt">
                    <Griff {...sortieren.griff(i, u.titel)} />
                    <StatusPunkt status={d.status} />
                    <input className="pu-nr" value={u.nr ?? ''} placeholder="Nr" aria-label={`Nummer von ${u.titel}`} onChange={(e) => setzen(u.id, { nr: e.target.value || undefined })} />
                    <div className="pu-text">
                      <strong>{u.titel}</strong>
                      <span className="muted small-text">
                        <span className={`pu-art ${u.art}`}>{ART_TEXT[u.art]}</span>{' '}
                        {u.art === 'intern'
                          ? d.formular
                            ? `${d.formular.name} · ${d.formular.fuellstand.gefuellt} von ${d.formular.fuellstand.gesamt} Angaben`
                            : 'kein Formular im FORMA-Projekt'
                          : d.quelle
                            ? `Quelle: ${d.quelle.pfad}`
                            : `keine Quelle in ${u.quelle || wirksameEinstellungen(st, projekt).berechnungsordner || 'dem Projektordner'}`}
                      </span>
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
                        {u.bedingung?.length ? <span className="pu-bedingung"> · nur wenn {bedingungText(u.bedingung)}</span> : null}
                      </span>
                    </div>
                    <div className="pu-knoepfe">
                      {u.art === 'intern' && !d.formular && d.status !== 'entfaellt' && (
                        <button className="small primary" onClick={() => void formularAnlegen(u.id)}>
                          Formular anlegen
                        </button>
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
                          <button className="small" disabled={!basis} onClick={() => useExportDialog.getState().oeffnen(d.formular!.pfad)}>
                            <Symbol name="export" /> PDF
                          </button>
                        </>
                      )}
                      {basis && (
                        <MenueKnopf className="small" title={`Datei in ${ordner} verknüpfen`} punkte={() => dateiMenue(d)}>
                          <Symbol name="link" />
                        </MenueKnopf>
                      )}
                      <button className={`icon${offen ? ' active' : ''}`} aria-label={`${u.titel} bearbeiten`} title="Bearbeiten" onClick={() => setBearbeiten(offen ? null : u.id)}>
                        <Symbol name="stift" />
                      </button>
                    </div>
                  </div>
                  {offen && (
                    <div className="pu-bearbeiten">
                      <label>
                        <span className="field-label">Titel</span>
                        <input value={u.titel} onChange={(e) => setzen(u.id, { titel: e.target.value })} />
                      </label>
                      <label>
                        <span className="field-label">Art</span>
                        <select value={u.art} onChange={(e) => setzen(u.id, { art: e.target.value as UmfangEintrag['art'] })}>
                          <option value="intern">intern – Formular aus FORMA</option>
                          <option value="extern">extern – Datei (Berechnung, Plan, PDF)</option>
                        </select>
                      </label>
                      {u.art === 'intern' ? (
                        <label>
                          <span className="field-label">Formular (Teil des Namens oder Kennung)</span>
                          <input value={u.formular ?? ''} placeholder={u.titel} onChange={(e) => setzen(u.id, { formular: e.target.value || undefined, formularDatei: undefined })} />
                        </label>
                      ) : (
                        <label>
                          <span className="field-label">Ordner der Quelle</span>
                          <input value={u.quelle ?? ''} placeholder={wirksameEinstellungen(st, projekt).berechnungsordner} onChange={(e) => setzen(u.id, { quelle: e.target.value || undefined })} />
                        </label>
                      )}
                      <label>
                        <span className="field-label">Muster der Datei (* ? ;)</span>
                        <input value={u.muster ?? ''} placeholder={`*${u.titel}*`} onChange={(e) => setzen(u.id, { muster: e.target.value || undefined })} />
                      </label>
                      <div className="pu-bedingung-editor">
                        <span className="field-label">Nur erforderlich, wenn …</span>
                        <BedingungEditor wert={u.bedingung} merkmale={st.merkmalDefinitionen} onChange={(b) => setzen(u.id, { bedingung: b })} />
                      </div>
                      <div className="pu-bearbeiten-knoepfe">
                        <button className="small" onClick={() => setBearbeiten(null)}>
                          Fertig
                        </button>
                        <button className="small gefahr" onClick={() => void umfangSetzen(umfang.filter((x) => x.id !== u.id))}>
                          Aus dem Projektumfang nehmen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="pu-unten">
            <MenueKnopf punkte={hinzufuegen}>
              <Symbol name="plus" /> Dokument hinzufügen
            </MenueKnopf>
            <button className="small" title="Projektumfang entfernen – keine Vollständigkeitsprüfung mehr" onClick={() => void umfangSetzen(null)}>
              Projektumfang aufheben
            </button>
          </div>
        </>
      )}
      <ExportFuerProjekt />
    </div>
  );
}

/** Abweichende Export-Einstellungen nur für dieses Projekt (wie die angezeigten Pfade im Projektordner) */
function ExportFuerProjekt() {
  const projekt = useFormulare((s) => s.projekt);
  const ueber = useAntrag((s) => (projekt ? s.ueberschreibungen[projekt.ordner] : undefined));
  const global = useAntrag((s) => s.einstellungen);
  const { setUeberschreibung } = useAntrag.getState();
  const [offen, setOffen] = useState(!!ueber);
  if (!projekt) return null;
  const setzen = (teil: ExportUeberschreibung) => setUeberschreibung({ ...ueber, ...teil });
  return (
    <section className="pu-export">
      <button className="pu-export-kopf" aria-expanded={offen} onClick={() => setOffen(!offen)}>
        <Symbol name={offen ? 'pfeilUnten' : 'pfeilRechts'} /> Export für {projekt.ordner}
        <span className="muted small-text">{ueber ? ' – weicht von den Einstellungen ab' : ' – wie in den Einstellungen'}</span>
      </button>
      {offen && (
        <div className="pu-bearbeiten">
          <label>
            <span className="field-label">Antragsordner</span>
            <input value={ueber?.antragsordner ?? ''} placeholder={global.antragsordner} onChange={(e) => setzen({ antragsordner: e.target.value })} />
          </label>
          <label>
            <span className="field-label">Namensvorlage</span>
            <input value={ueber?.namensvorlage ?? ''} placeholder={global.namensvorlage} onChange={(e) => setzen({ namensvorlage: e.target.value })} spellCheck={false} />
          </label>
          <label>
            <span className="field-label">Phase</span>
            <input value={ueber?.phase ?? ''} placeholder={global.phase} onChange={(e) => setzen({ phase: e.target.value })} />
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
