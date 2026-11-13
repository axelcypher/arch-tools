import { useRef } from 'react';
import { modernisieren } from '@core/platzhalter';
import { inFeldEinfuegen, PlatzhalterChips, PlatzhalterHinweise } from '@core/ui/Platzhalter';
import { VORGABE_MERKMALE, istVorgabeMerkmal } from '../bedingung';
import { ART_HINWEIS, vorlageArtWarnung, NAMENS_VARIABLEN, ZIEL_VARIABLEN, VORGABE_EXPORT, dateiname, verschieben, vorlageMitAntragsart } from '../antrag';
import { DokumenteEinstellungen } from './DokumenteEinstellungen';
import { Karte } from './EinstellungsKarte';
import { Griff, useSortieren } from './Sortieren';
import { namensschemaVon, useAntrag } from '../antragStore';
import { useFormulare } from '../store';
import { waehleOrdner } from '../dateisystem';
import { Symbol } from './Symbol';

/**
 * Einstellungen für Antrag und Export: wo die Anträge im Projektordner liegen, welche Antragsarten es gibt, wie
 * exportierte PDFs heißen und wohin sie kommen, und die grundlegende Liste der Antragsdokumente. Alles gilt für
 * alle Projekte; Abweichungen je Projekt stehen in den Antragsdaten unter „Antragsumfang“.
 */
/** beginnt die Vorlage mit Projektkürzel, Antragsart und Datum JJMMTT (alte oder neue Namen)? Das verlangt der Antragsordner. */
const beginntRichtig = (vorlage: string) => /^\{PROJEKT_KUERZEL\}\s+\{Art\}\s+\{DATUM\}\s/.test(modernisieren(vorlage.trim(), NAMENS_VARIABLEN));

export function AntragEinstellungen() {
  const e = useAntrag((s) => s.einstellungen);
  const merkmale = useAntrag((s) => s.merkmalDefinitionen);
  const { setEinstellungen, setMerkmalDefinitionen } = useAntrag.getState();
  const merkmalSort = useSortieren(merkmale.length, (von, nach) => setMerkmalDefinitionen(verschieben(merkmale, von, nach)));
  // beim Export steht an der Stelle der Antragsart immer {Art} (nach dem Namensschema)
  const reihenfolge = useFormulare((s) => namensschemaVon(s).reihenfolge);
  const wirksameVorlage = vorlageMitAntragsart(e.namensvorlage, reihenfolge);
  const artWarnung = vorlageArtWarnung(e.namensvorlage, reihenfolge);
  const vorlageFeld = useRef<HTMLInputElement>(null);
  const zielFeld = useRef<HTMLInputElement>(null);
  const beispiel = dateiname(wirksameVorlage, { kuerzel: 'BS9', kurzname: 'EFH Musterweg', datum: new Date(), nr: '01', name: 'Bauantrag', antrag: `${e.arten[0]} 2`, art: e.arten[0], kennung: 'nw010005', stand: '2026A' });

  return (
    <>
      <h2>Antrag & Export</h2>
      <p className="muted">
        Ausgefüllte Formulare lassen sich als PDF exportieren – in den Ordner der aktiven Antragsfassung (z. B. <code>TÖB\BAUA 2</code>) oder an jeden anderen Ort. Was zu einem
        Antrag gehört, wird je Antrag in den Antragsdaten unter „Antragsumfang“ ausgewählt; daran prüft die App, ob alles vollständig und aktuell vorliegt. Abweichungen je
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
              Dazu kommen die Antragsarten aus ATLAS (Projekt) › Einstellungen › Namensschema: Kürzel und Plannummern.
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
                ref={vorlageFeld}
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
        <PlatzhalterHinweise vorlage={e.namensvorlage} variablen={NAMENS_VARIABLEN} onAnpassen={(namensvorlage) => setEinstellungen({ namensvorlage })} />
        <div className="es-platzhalter-zeile">
          <PlatzhalterChips variablen={NAMENS_VARIABLEN} label="Namensvorlage" onEinfuegen={(p) => inFeldEinfuegen(vorlageFeld.current, e.namensvorlage, p, (namensvorlage) => setEinstellungen({ namensvorlage }))} />
          {e.namensvorlage !== VORGABE_EXPORT.namensvorlage && (
            <button className="small" onClick={() => setEinstellungen({ namensvorlage: VORGABE_EXPORT.namensvorlage })}>
              Vorgabe
            </button>
          )}
        </div>
        {!beginntRichtig(e.namensvorlage) && (
          <p className="warning small-text">
            Dateien im Antragsordner müssen mit „Projektcode Antragsart JJMMTT“ beginnen, sonst lassen sie sich nicht als bereit markieren – die Vorlage sollte mit „{'{PROJEKT_KUERZEL} {Art} {DATUM}'}“
            beginnen.
          </p>
        )}
      </Karte>

      <Karte titel="Ziel des Exports" text="Der voreingestellte Ordner im Export-Dialog; dort lässt sich jedes Mal auch ein anderer Ordner im Projekt wählen oder „Speichern unter …“.">
        <label className="radio-row">
          <input type="radio" name="export-ziel" checked={e.ziel === 'aktiv'} onChange={() => setEinstellungen({ ziel: 'aktiv' })} />
          <span>
            <strong>Aktive Antragsfassung</strong> <span className="muted small-text">– {e.antragsordner || 'TÖB'}\{e.arten[0]} bzw. die oben links am Projekt gewählte Fassung</span>
          </span>
        </label>
        <label className="radio-row">
          <input type="radio" name="export-ziel" checked={e.ziel === 'pfad'} onChange={() => setEinstellungen({ ziel: 'pfad' })} />
          <span className="es-breit">
            <strong>Fester Ordner im Projekt</strong>
            <input
              ref={zielFeld}
              value={e.zielpfad}
              disabled={e.ziel !== 'pfad'}
              onChange={(x) => setEinstellungen({ zielpfad: x.target.value })}
              aria-label="Fester Zielordner"
              placeholder="z. B. TÖB/{Antrag}/Formulare"
            />
          </span>
        </label>
        {e.ziel === 'pfad' && (
          <div className="es-ziel-platzhalter">
            <PlatzhalterHinweise vorlage={e.zielpfad} variablen={ZIEL_VARIABLEN} onAnpassen={(zielpfad) => setEinstellungen({ zielpfad })} />
            <PlatzhalterChips variablen={ZIEL_VARIABLEN} label="Fester Zielordner" onEinfuegen={(p) => inFeldEinfuegen(zielFeld.current, e.zielpfad, p, (zielpfad) => setEinstellungen({ zielpfad }))} />
          </div>
        )}
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
                title="Vorlagenordner wählen …"
                onClick={async () => {
                  const p = await waehleOrdner('Ordner mit leeren Formularen');
                  if (p) setEinstellungen({ vorlagenordner: p });
                }}
              >
                <Symbol name="ordner" /> Ordner wählen …
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
        text="Merkmale eines Antrags, von denen Formularteile und Dokumente abhängen können (z. B. Gebäudeklasse). Jeder Antrag hat seine eigenen Werte (in den Antragsdaten unter „Antragsmerkmale“ gewählt); ein neuer Antrag übernimmt einmalig die Vorgabe – spätere Änderungen hier ändern bestehende Anträge nicht. Bedingungen stellst du im Formular über „Einrichten“ und bei den Antragsdokumenten ein."
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
