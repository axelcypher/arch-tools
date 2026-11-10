import type { ReactNode } from 'react';
import { Fragment, useState } from 'react';
import type { KatalogEintrag } from '../antrag';
import { VORGABE_MERKMALE, bedingungText } from '../bedingung';
import { BedingungEditor } from './BedingungEditor';
import { PLATZHALTER, VORGABE_EXPORT, dateiname } from '../antrag';
import { useAntrag } from '../antragStore';
import { waehleOrdner } from '../dateisystem';
import { Symbol } from './Symbol';

function Karte({ titel, text, children }: { titel: string; text?: ReactNode; children: ReactNode }) {
  return (
    <section className="es-karte">
      <div className="es-karte-kopf">
        <h3>{titel}</h3>
      </div>
      {text && <p className="muted small-text">{text}</p>}
      {children}
    </section>
  );
}

/**
 * Einstellungen für Antrag und Export: wo die Anträge im Projektordner liegen, welche Antragsarten es gibt, wie
 * exportierte PDFs heißen und wohin sie kommen, und die grundlegende Liste der Antragsdokumente. Alles gilt für
 * alle Projekte; Abweichungen je Projekt stehen in der Projektkarte unter „Projektumfang“.
 */
export function AntragEinstellungen() {
  const e = useAntrag((s) => s.einstellungen);
  const katalog = useAntrag((s) => s.katalog);
  const merkmale = useAntrag((s) => s.merkmalDefinitionen);
  const { setEinstellungen, setKatalog, setMerkmalDefinitionen } = useAntrag.getState();
  const [bedingungOffen, setBedingungOffen] = useState<string | null>(null);
  const beispiel = dateiname(e.namensvorlage, { kuerzel: 'BS9', phase: e.phase, datum: new Date(), nr: '01', name: 'Bauantrag', antrag: `${e.arten[0]} 2`, kennung: 'nw010005', stand: '2026A' });

  const zeileSetzen = (i: number, teil: Partial<KatalogEintrag>) => setKatalog(katalog.map((k, n) => (n === i ? { ...k, ...teil } : k)));

  return (
    <>
      <h2>Antrag & Export</h2>
      <p className="muted">
        Ausgefüllte Formulare lassen sich als PDF exportieren – in den Ordner der aktiven Antragsfassung (z. B. <code>TÖB\BAUA 2</code>) oder an jeden anderen Ort. Was zu einem
        Antrag gehört, wird je Projekt in der Projektkarte unter „Projektumfang“ ausgewählt; daran prüft die App, ob alles vollständig und aktuell vorliegt. Abweichungen je
        Projekt lassen sich dort ebenfalls einstellen.
      </p>

      <Karte titel="Anträge im Projektordner" text="Ordner der Anträge relativ zum Projektordner, darin je Antragsfassung ein Ordner: BAUA, BAUA 2 (oder BAUA2) …">
        <div className="es-raster">
          <label>
            <span className="field-label">Antragsordner</span>
            <input value={e.antragsordner} onChange={(x) => setEinstellungen({ antragsordner: x.target.value })} aria-label="Antragsordner" placeholder="TÖB" />
          </label>
          <label>
            <span className="field-label">Antragsarten (die erste ist der Standard)</span>
            <input
              defaultValue={e.arten.join(', ')}
              key={e.arten.join(',')}
              aria-label="Antragsarten"
              placeholder="BAUA, BAUVA, DENK"
              onBlur={(x) => setEinstellungen({ arten: x.target.value.split(/[,;\s]+/).filter(Boolean).map((a) => a.toUpperCase()) })}
            />
          </label>
        </div>
      </Karte>

      <Karte titel="Dateiname exportierter PDFs" text={<>Beispiel: <strong>{beispiel}.pdf</strong></>}>
        <div className="es-raster">
          <label className="es-breit">
            <span className="field-label">Namensvorlage</span>
            <input value={e.namensvorlage} onChange={(x) => setEinstellungen({ namensvorlage: x.target.value })} aria-label="Namensvorlage" spellCheck={false} />
          </label>
          <label>
            <span className="field-label">Phase</span>
            <input value={e.phase} list="es-phasen" onChange={(x) => setEinstellungen({ phase: x.target.value })} aria-label="Phase" />
            <datalist id="es-phasen">
              {['BP', 'EP', 'GP', 'AP'].map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
        </div>
        <div className="es-platzhalter">
          {PLATZHALTER.map((p) => (
            <button key={p.name} className="small" title={p.text} onClick={() => setEinstellungen({ namensvorlage: `${e.namensvorlage} ${p.name}`.trim() })}>
              {p.name}
            </button>
          ))}
          {e.namensvorlage !== VORGABE_EXPORT.namensvorlage && (
            <button className="small" onClick={() => setEinstellungen({ namensvorlage: VORGABE_EXPORT.namensvorlage })}>
              Vorgabe
            </button>
          )}
        </div>
      </Karte>

      <Karte titel="Ziel des Exports" text="Der voreingestellte Ordner im Export-Dialog; dort lässt sich jedes Mal auch ein anderer Ordner im Projekt wählen oder „Speichern unter …“.">
        <label className="radio-row">
          <input type="radio" checked={e.ziel === 'aktiv'} onChange={() => setEinstellungen({ ziel: 'aktiv' })} />
          <span>
            <strong>Aktive Antragsfassung</strong> <span className="muted small-text">– {e.antragsordner || 'TÖB'}\{e.arten[0]} bzw. die oben links am Projekt gewählte Fassung</span>
          </span>
        </label>
        <label className="radio-row">
          <input type="radio" checked={e.ziel === 'pfad'} onChange={() => setEinstellungen({ ziel: 'pfad' })} />
          <span className="es-breit">
            <strong>Fester Ordner im Projekt</strong>
            <input value={e.zielpfad} disabled={e.ziel !== 'pfad'} onChange={(x) => setEinstellungen({ zielpfad: x.target.value })} aria-label="Fester Zielordner" placeholder="z. B. TÖB/{Antrag}/Formulare" />
          </span>
        </label>
      </Karte>

      <Karte titel="Quellen und Vorlagen">
        <div className="es-raster">
          <label>
            <span className="field-label">Berechnungen im Projektordner</span>
            <input value={e.berechnungsordner} onChange={(x) => setEinstellungen({ berechnungsordner: x.target.value })} aria-label="Berechnungsordner" placeholder="Planung/Berechnungen" />
          </label>
          <label>
            <span className="field-label">Vorlagen für neue Formulare (leere FORMA-Formulare)</span>
            <span className="es-zeile">
              <input value={e.vorlagenordner} onChange={(x) => setEinstellungen({ vorlagenordner: x.target.value })} aria-label="Vorlagenordner" placeholder="leer = aus anderen Projekten" />
              <button
                onClick={async () => {
                  const p = await waehleOrdner('Ordner mit leeren FORMA-Formularen');
                  if (p) setEinstellungen({ vorlagenordner: p });
                }}
              >
                …
              </button>
            </span>
          </label>
        </div>
        <p className="muted small-text">
          Fehlt ein Formular des Projektumfangs, legt ein Klick darauf es an: aus dem Vorlagenordner oder – ohne Vorlagenordner – als Kopie des neuesten passenden Formulars aus
          einem anderen Projekt, mit geleerten Eingaben.
        </p>
      </Karte>

      <Karte
        titel="Projektmerkmale"
        text="Merkmale eines Projekts, von denen Formularteile und Dokumente abhängen können (z. B. Gebäudeklasse). Der Wert wird je Projekt im Projektumfang gewählt und gilt für alle Formulare; Bedingungen stellst du in der Gliederung (Anpassen) und im Katalog ein."
      >
        <table className="es-tabelle es-katalog">
          <thead>
            <tr>
              <th>Merkmal</th>
              <th>Mögliche Werte (mit Komma getrennt)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {merkmale.map((m, i) => (
              <tr key={i}>
                <td>
                  <input value={m.name} aria-label="Merkmal" onChange={(x) => setMerkmalDefinitionen(merkmale.map((y, n) => (n === i ? { ...y, name: x.target.value } : y)))} />
                </td>
                <td>
                  <input
                    defaultValue={m.werte.join(', ')}
                    key={m.werte.join(',')}
                    aria-label={`Werte von ${m.name}`}
                    onBlur={(x) => setMerkmalDefinitionen(merkmale.map((y, n) => (n === i ? { ...y, werte: x.target.value.split(',').map((w) => w.trim()).filter(Boolean) } : y)))}
                  />
                </td>
                <td>
                  <button className="icon" aria-label={`${m.name} entfernen`} title="Entfernen" onClick={() => setMerkmalDefinitionen(merkmale.filter((_, n) => n !== i))}>
                    <Symbol name="muell" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="es-zeile">
          <button onClick={() => setMerkmalDefinitionen([...merkmale, { name: 'Neues Merkmal', werte: ['ja', 'nein'] }])}>
            <Symbol name="plus" /> Merkmal hinzufügen
          </button>
          {JSON.stringify(merkmale) !== JSON.stringify(VORGABE_MERKMALE) && <button onClick={() => setMerkmalDefinitionen(null)}>Vorgabe wiederherstellen</button>}
        </div>
      </Karte>

      <Karte
        titel="Antragsdokumente (Katalog)"
        text="Grundlegende Dokumente eines Antrags. Vorgewählte kommen beim ersten Festlegen des Projektumfangs dazu, die übrigen lassen sich je Projekt hinzunehmen. Intern: Formular aus FORMA (Teil des Namens oder Kennung). Extern: Datei aus dem Projektordner (Ordner der Quelle und Muster mit * und ?, mehrere mit „;“)."
      >
        <table className="es-tabelle es-katalog">
          <thead>
            <tr>
              <th>Dokument</th>
              <th>Art</th>
              <th>Formular / Quelle</th>
              <th>Muster der Datei</th>
              <th title="in neuen Projekten vorgewählt">Vorgewählt</th>
              <th title="nur erforderlich, wenn die Projektmerkmale zutreffen">Nur wenn</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {katalog.map((k, i) => (
              <Fragment key={k.id}>
                <tr>
                  <td>
                    <input value={k.titel} onChange={(x) => zeileSetzen(i, { titel: x.target.value })} aria-label="Dokument" />
                  </td>
                  <td>
                    <select value={k.art} onChange={(x) => zeileSetzen(i, { art: x.target.value as KatalogEintrag['art'] })} aria-label="Art">
                      <option value="intern">intern (FORMA)</option>
                      <option value="extern">extern (Datei)</option>
                    </select>
                  </td>
                  <td>
                    {k.art === 'intern' ? (
                      <input value={k.formular ?? ''} placeholder={k.titel} onChange={(x) => zeileSetzen(i, { formular: x.target.value })} aria-label="Formular" />
                    ) : (
                      <input value={k.quelle ?? ''} placeholder={e.berechnungsordner} onChange={(x) => zeileSetzen(i, { quelle: x.target.value })} aria-label="Quelle" />
                    )}
                  </td>
                  <td>
                    <input value={k.muster ?? ''} placeholder={`*${k.titel}*`} onChange={(x) => zeileSetzen(i, { muster: x.target.value })} aria-label="Muster" />
                  </td>
                  <td className="es-mitte">
                    <input type="checkbox" checked={k.vorgewaehlt} onChange={(x) => zeileSetzen(i, { vorgewaehlt: x.target.checked })} aria-label="Vorgewählt" />
                  </td>
                  <td>
                    <button
                      className={`small es-bedingung${k.bedingung?.length ? ' gesetzt' : ''}`}
                      aria-label={`Bedingung für ${k.titel}`}
                      title={k.bedingung?.length ? `Nur erforderlich, wenn ${bedingungText(k.bedingung)}` : 'Immer erforderlich – klicken für eine Bedingung'}
                      onClick={() => setBedingungOffen(bedingungOffen === k.id ? null : k.id)}
                    >
                      {k.bedingung?.length ? bedingungText(k.bedingung) : 'immer'}
                    </button>
                  </td>
                  <td>
                    <button className="icon" aria-label={`${k.titel} entfernen`} title="Entfernen" onClick={() => setKatalog(katalog.filter((_, n) => n !== i))}>
                      <Symbol name="muell" />
                    </button>
                  </td>
                </tr>
                {bedingungOffen === k.id && (
                  <tr className="es-bedingung-zeile">
                    <td colSpan={7}>
                      <BedingungEditor wert={k.bedingung} merkmale={merkmale} onChange={(b) => zeileSetzen(i, { bedingung: b })} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        <div className="es-zeile">
          <button onClick={() => setKatalog([...katalog, { id: `k${Date.now().toString(36)}`, titel: 'Neues Dokument', art: 'extern', vorgewaehlt: false }])}>
            <Symbol name="plus" /> Dokument hinzufügen
          </button>
          <button onClick={() => setKatalog(null)}>Vorgabe wiederherstellen</button>
        </div>
      </Karte>
    </>
  );
}
