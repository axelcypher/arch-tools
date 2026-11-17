import { useEffect, useState } from 'react';
import { PfadeVerweis } from '@core/ui/Einstellungen';
import { VORGABE_MERKMALE, istVorgabeMerkmal } from '../bedingung';
import { ART_HINWEIS, vorlageArtWarnung, dateiname, verschieben, vorlageMitAntragsart } from '../antrag';
import { DokumenteEinstellungen } from './DokumenteEinstellungen';
import { Karte } from './EinstellungsKarte';
import { Griff, useSortieren } from './Sortieren';
import { namensschemaVon, useAntrag } from '../antragStore';
import { useFormulare } from '../store';
import { entwurfSetzen, useEntwurf, useEntwurfWert } from '../einstellungsEntwurf';
import { Symbol } from '@core/ui/Symbol';

/**
 * Einstellungen für Antrag und Export: wo die Anträge im Projektordner liegen, welche Antragsarten es gibt, wie
 * exportierte PDFs heißen und wohin sie kommen, und die grundlegende Liste der Antragsdokumente. Alles gilt für
 * alle Projekte; Abweichungen je Projekt stehen in den Antragsdaten unter „Antragsumfang“.
 */

export function AntragEinstellungen() {
  const gespeichert = useAntrag((s) => s.einstellungen);
  const arten = useEntwurfWert('arten');
  const ziel = useEntwurfWert('ziel');
  const e = { ...gespeichert, arten, ziel };
  const [artenText, setArtenText] = useState(() => arten.join(', '));
  // ohne Entwurf zeigt das Feld, was gilt (z. B. nach „Einstellungen importieren“)
  useEffect(() => {
    if (!('arten' in useEntwurf.getState().werte)) setArtenText(gespeichert.arten.join(', '));
  }, [gespeichert.arten]);
  const artenLeer = !artenText.split(/[,;\s]+/).some(Boolean);
  const merkmale = useEntwurfWert('merkmale');
  const setMerkmalDefinitionen = (m: typeof merkmale | null) => entwurfSetzen('merkmale', m);
  const merkmalSort = useSortieren(merkmale.length, (von, nach) => setMerkmalDefinitionen(verschieben(merkmale, von, nach)));
  // beim Export steht an der Stelle der Antragsart immer {Art} (nach dem Namensschema)
  const reihenfolge = useFormulare((s) => namensschemaVon(s).reihenfolge);
  const wirksameVorlage = vorlageMitAntragsart(e.namensvorlage, reihenfolge);
  const artWarnung = vorlageArtWarnung(e.namensvorlage, reihenfolge);
  const beispiel = dateiname(wirksameVorlage, { kuerzel: 'BS9', kurzname: 'EFH Musterweg', datum: new Date(), nr: '01', name: 'Bauantrag', antrag: `${e.arten[0]} 2`, art: e.arten[0], kennung: 'nw010005', stand: '2026A' });

  return (
    <>
      <Karte
        id="antrag"
        titel="Anträge im Projektordner"
        text={
          <>
            Ausgefüllte Formulare lassen sich als PDF exportieren – in den Ordner der aktiven Antragsfassung (z. B. <code>TÖB\BAUA 2</code>) oder an jeden anderen Ort. Was zu einem
            Antrag gehört, wird je Antrag in den Antragsdaten unter „Antragsumfang“ ausgewählt; dort lassen sich auch Abweichungen je Projekt einstellen. Im Antragsordner liegt je
            Antragsfassung ein Ordner: BAUA, BAUA 2 (oder BAUA2) …
          </>
        }
      >
        <PfadeVerweis
          fokus="ablage.permio.antragsordner"
          erklaerung="Antragsordner, Namensvorlage, fester Zielordner, Suchordner der Berechnungen und Vorlagenordner stehen auf der Seite „Pfade und Benennung“."
        />
        <div className="es-raster">
          <div>
            <span className="field-label">Antragsordner</span>
            <code>{e.antragsordner}</code>
          </div>
          <label>
            <span className="field-label">Antragsarten (die erste ist der Standard)</span>
            <input
              value={artenText}
              aria-describedby={artenLeer ? 'es-arten-hinweis es-arten-fehler' : 'es-arten-hinweis'}
              aria-invalid={artenLeer || undefined}
              placeholder="BAUA, BAUVA, DENK"
              onChange={(x) => {
                setArtenText(x.target.value);
                // leer gilt nicht: dann bleiben die bisherigen Antragsarten
                const neu = x.target.value.split(/[,;\s]+/).filter(Boolean).map((a) => a.toUpperCase());
                if (neu.length) entwurfSetzen('arten', neu);
              }}
            />
            {artenLeer && (
              <span className="feld-meldung" id="es-arten-fehler" role="alert">
                Mindestens eine Antragsart angeben – sonst bleiben die bisherigen.
              </span>
            )}
            <span className="field-hint" id="es-arten-hinweis">
              Dazu kommen die Antragsarten aus dem Namensschema von ATLAS (Kürzel und Plannummern).
            </span>
          </label>
        </div>
      </Karte>

      <Karte titel="Dateiname exportierter PDFs" text={<>Beispiel: <strong>{beispiel}.pdf</strong></>}>
        <p>
          Namensvorlage: <code>{e.namensvorlage}</code>
        </p>
        <p className="field-hint">{ART_HINWEIS}</p>
        {artWarnung && <p className="warning small-text">{artWarnung}</p>}
        <PfadeVerweis fokus="plaene.permio.namensvorlage" text="Namensvorlage ändern …" />
      </Karte>

      <Karte titel="Ziel des Exports" text="Der voreingestellte Ordner im Export-Dialog; dort lässt sich jedes Mal auch ein anderer Ordner im Projekt wählen oder „Speichern unter …“.">
        <label className="radio-row">
          <input type="radio" name="export-ziel" checked={e.ziel === 'aktiv'} onChange={() => entwurfSetzen('ziel', 'aktiv')} />
          <span>
            <strong>Aktive Antragsfassung</strong> <span className="muted small-text">– {e.antragsordner || 'TÖB'}\{e.arten[0]} bzw. die oben links am Projekt gewählte Fassung</span>
          </span>
        </label>
        <label className="radio-row">
          <input type="radio" name="export-ziel" checked={e.ziel === 'pfad'} onChange={() => entwurfSetzen('ziel', 'pfad')} />
          <span className="es-breit">
            <strong>Fester Ordner im Projekt</strong> <code>{e.zielpfad}</code>
          </span>
        </label>
        <PfadeVerweis fokus="plaene.permio.zielpfad" text="Zielordner ändern …" />
      </Karte>

      <Karte titel="Quellen und Vorlagen">
        <div className="es-raster">
          <div>
            <span className="field-label">Berechnungen im Projektordner</span>
            <code>{e.berechnungsordner.split('\n').join(' · ')}</code>
          </div>
          <div>
            <span className="field-label">Vorlagen für neue Formulare (leere Formulare)</span>
            <code>{e.vorlagenordner || 'keiner – aus anderen Projekten'}</code>
          </div>
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
                    type="button"
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
          <button type="button" onClick={() => setMerkmalDefinitionen([...merkmale, { name: 'Neues Merkmal', werte: ['ja', 'nein'] }])}>
            <Symbol name="plus" /> Merkmal hinzufügen
          </button>
          {JSON.stringify(merkmale) !== JSON.stringify(VORGABE_MERKMALE) && <button type="button" onClick={() => setMerkmalDefinitionen(null)}>Vorgabe wiederherstellen</button>}
        </div>
      </Karte>

      <DokumenteEinstellungen />
    </>
  );
}
