import type { ReactNode } from 'react';
import { VORGABE_MERKMALE, istVorgabeMerkmal } from '../bedingung';
import { ART_HINWEIS, vorlageArtWarnung, PLATZHALTER, VORGABE_EXPORT, dateiname, verschieben, vorlageMitAntragsart } from '../antrag';
import { DokumenteEinstellungen } from './DokumenteEinstellungen';
import { Griff, useSortieren } from './Sortieren';
import { namensschemaVon, useAntrag } from '../antragStore';
import { useFormulare } from '../store';
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
 * alle Projekte; Abweichungen je Projekt stehen in der Projektkarte unter „Antragsumfang“.
 */
export function AntragEinstellungen() {
  const e = useAntrag((s) => s.einstellungen);
  const merkmale = useAntrag((s) => s.merkmalDefinitionen);
  const { setEinstellungen, setMerkmalDefinitionen } = useAntrag.getState();
  const merkmalSort = useSortieren(merkmale.length, (von, nach) => setMerkmalDefinitionen(verschieben(merkmale, von, nach)));
  // beim Export steht an der Stelle der Antragsart immer {Art} (nach dem Namensschema)
  const reihenfolge = useFormulare((s) => namensschemaVon(s).reihenfolge);
  const wirksameVorlage = vorlageMitAntragsart(e.namensvorlage, reihenfolge);
  const artWarnung = vorlageArtWarnung(e.namensvorlage, reihenfolge);
  const beispiel = dateiname(wirksameVorlage, { kuerzel: 'BS9', datum: new Date(), nr: '01', name: 'Bauantrag', antrag: `${e.arten[0]} 2`, art: e.arten[0], kennung: 'nw010005', stand: '2026A' });

  return (
    <>
      <h2>Antrag & Export</h2>
      <p className="muted">
        Ausgefüllte Formulare lassen sich als PDF exportieren – in den Ordner der aktiven Antragsfassung (z. B. <code>TÖB\BAUA 2</code>) oder an jeden anderen Ort. Was zu einem
        Antrag gehört, wird je Projekt in der Projektkarte unter „Antragsumfang“ ausgewählt; daran prüft die App, ob alles vollständig und aktuell vorliegt. Abweichungen je
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
              aria-describedby="es-arten-hinweis"
              placeholder="BAUA, BAUVA, DENK"
              onBlur={(x) => setEinstellungen({ arten: x.target.value.split(/[,;\s]+/).filter(Boolean).map((a) => a.toUpperCase()) })}
            />
            <span className="field-hint" id="es-arten-hinweis">
              Dazu kommen die Antragsarten aus Projektordner › Einstellungen › Namensschema: Kürzel und Plannummern.
            </span>
          </label>
        </div>
      </Karte>

      <Karte titel="Dateiname exportierter PDFs" text={<>Beispiel: <strong>{beispiel}.pdf</strong></>}>
        <div className="es-raster">
          {/* wie im Export des Projekts: Feld, darunter Hinweis und ggf. Warnung */}
          <div className="es-breit es-feldblock">
            <label>
              <span className="field-label">Namensvorlage</span>
              <input
                value={e.namensvorlage}
                onChange={(x) => setEinstellungen({ namensvorlage: x.target.value })}
                aria-label="Namensvorlage"
                aria-describedby={artWarnung ? 'es-art-hinweis es-art-warnung' : 'es-art-hinweis'}
                spellCheck={false}
              />
            </label>
            <p className="field-hint" id="es-art-hinweis">
              {ART_HINWEIS}
            </p>
            {artWarnung && (
              <p className="warning small-text">
                <span id="es-art-warnung">{artWarnung}</span>{' '}
                <button className="small" onClick={() => setEinstellungen({ namensvorlage: wirksameVorlage })}>
                  Vorlage anpassen
                </button>
              </p>
            )}
          </div>
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
        {!/^\{k(ü|ue)rzel\}\s+\{art\}\s+\{datum\}\s/i.test(e.namensvorlage.trim()) && (
          <p className="warning small-text">
            Dateien im Antragsordner müssen mit „Projektcode Antragsart JJMMTT“ beginnen, sonst lassen sie sich nicht als bereit markieren – die Vorlage sollte mit „{'{Kürzel} {Art} {Datum}'}“
            beginnen.
          </p>
        )}
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
            <span className="field-label">Vorlagen für neue Formulare (leere Formulare)</span>
            <span className="es-zeile">
              <input value={e.vorlagenordner} onChange={(x) => setEinstellungen({ vorlagenordner: x.target.value })} aria-label="Vorlagenordner" placeholder="leer = aus anderen Projekten" />
              <button
                onClick={async () => {
                  const p = await waehleOrdner('Ordner mit leeren Formularen');
                  if (p) setEinstellungen({ vorlagenordner: p });
                }}
              >
                …
              </button>
            </span>
          </label>
        </div>
        <p className="muted small-text">
          Fehlt ein Formular des Antragsumfangs, legt ein Klick darauf es an: aus dem Vorlagenordner oder – ohne Vorlagenordner – als Kopie des neuesten passenden Formulars aus
          einem anderen Projekt, mit geleerten Eingaben.
        </p>
      </Karte>

      <Karte
        titel="Antragsmerkmale"
        text="Merkmale eines Antrags, von denen Formularteile und Dokumente abhängen können (z. B. Gebäudeklasse). Jeder Antrag hat seine eigenen Werte (im Antragsumfang gewählt); ein neuer Antrag übernimmt einmalig die Vorgabe – spätere Änderungen hier ändern bestehende Anträge nicht. Bedingungen stellst du in der Gliederung (Anpassen) und im Katalog ein."
      >
        <table className="es-tabelle es-katalog" data-sortier-liste="">
          <thead>
            <tr>
              <th />
              <th>Merkmal</th>
              <th>Mögliche Werte (mit Komma getrennt)</th>
              <th>Vorgabe für neue Anträge</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {merkmale.map((m, i) => (
              <tr key={i} {...merkmalSort.zeile(i)}>
                <td className="es-griff">
                  <Griff {...merkmalSort.griff(i, m.name)} />
                </td>
                <td>
                  <input
                    value={m.name}
                    aria-label="Merkmal"
                    readOnly={istVorgabeMerkmal(m.name)}
                    title={istVorgabeMerkmal(m.name) ? 'Merkmal der App – die Vorgaben der Formulare bauen darauf auf' : undefined}
                    onChange={(x) => setMerkmalDefinitionen(merkmale.map((y, n) => (n === i ? { ...y, name: x.target.value } : y)))}
                  />
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
                  <select
                    value={m.vorgabe && m.werte.includes(m.vorgabe) ? m.vorgabe : ''}
                    aria-label={`Vorgabe von ${m.name}`}
                    onChange={(x) => setMerkmalDefinitionen(merkmale.map((y, n) => (n === i ? { ...y, vorgabe: x.target.value || undefined } : y)))}
                  >
                    <option value="">– leer –</option>
                    {m.werte.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    className="icon"
                    aria-label={`${m.name} entfernen`}
                    title={istVorgabeMerkmal(m.name) ? 'Merkmal der App – bleibt' : 'Entfernen'}
                    disabled={istVorgabeMerkmal(m.name)}
                    onClick={() => setMerkmalDefinitionen(merkmale.filter((_, n) => n !== i))}
                  >
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

      <DokumenteEinstellungen />
    </>
  );
}
