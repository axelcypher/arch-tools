import type { CSSProperties } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { Block, Lauf } from '../../dokumente/docx';
import { docxAendern, docxLesen } from '../../dokumente/docx';
import type { OffeneDatei } from '../../store';
import { dateiSchluessel, useFormulare } from '../../store';
import { DateiKopf, useSpeichernTaste } from './DateiAnsicht';

/**
 * Bearbeitbares Textstück. Der Text wird nur beim ersten Zeichnen gesetzt – danach gehört er dem Benutzer;
 * würde React ihn bei jedem Tastendruck neu setzen, spränge der Cursor.
 */
function EditierbarerLauf({ text, stil, geaendert, onText }: { text: string; stil: CSSProperties; geaendert: boolean; onText: (t: string) => void }) {
  const [anfang] = useState(text);
  return (
    <span
      style={stil}
      className={`wd-lauf${geaendert ? ' geaendert' : ''}`}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
      onInput={(e) => onText(e.currentTarget.textContent ?? '')}
    >
      {anfang}
    </span>
  );
}

function laufStil(l: Lauf): CSSProperties {
  return {
    fontWeight: l.fett ? 700 : undefined,
    fontStyle: l.kursiv ? 'italic' : undefined,
    textDecoration: l.unterstrichen ? 'underline' : undefined,
    fontSize: l.groesse ? `${l.groesse}pt` : undefined,
    color: l.farbe ?? undefined,
  };
}

/**
 * Word-Dokument wie auf Papier. „Text bearbeiten“ macht den vorhandenen Text direkt änderbar (Tippfehler, Namen,
 * Daten); neue Absätze oder Formatierungen gibt es hier nicht. Gespeichert werden nur die geänderten Textstücke.
 */
export function WordAnsicht({ datei }: { datei: OffeneDatei }) {
  const { dateiSpeichern, setDateiEntwurf } = useFormulare.getState();
  const entwurf = useFormulare((s) => s.dateiEntwuerfe[dateiSchluessel(datei)]) as Map<number, string> | undefined;
  const [bearbeiten, setBearbeiten] = useState(!!entwurf);
  const [fehler, setFehler] = useState('');
  /** zählt bei „Verwerfen“ hoch: bearbeitbare Textstücke neu zeichnen */
  const [runde, setRunde] = useState(0);
  const dok = useMemo(() => {
    try {
      return docxLesen(datei.bytes);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [datei.bytes]);
  const aenderungen = useMemo(() => entwurf ?? new Map<number, string>(), [entwurf]);
  const bearbeitbar = !datei.inOffice;

  const setzen = (id: number, text: string) => {
    const neu = new Map(aenderungen);
    if (dok && text === dok.texte[id]) neu.delete(id);
    else neu.set(id, text);
    setDateiEntwurf(neu.size ? neu : null);
  };

  const speichern = useCallback(async () => {
    if (!aenderungen.size) return;
    try {
      if (await dateiSpeichern(docxAendern(datei.bytes, aenderungen))) setBearbeiten(false);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  }, [aenderungen, datei.bytes, dateiSpeichern]);
  useSpeichernTaste(() => void speichern(), bearbeitbar);

  const lauf = (l: Lauf, i: number) => {
    if (l.art === 'tab') return <span key={i} className="wd-tab" />;
    if (l.art === 'umbruch') return <br key={i} />;
    if (l.art === 'bild') return <span key={i} className="wd-bild">[Bild]</span>;
    const text = l.id !== null && aenderungen.has(l.id) ? aenderungen.get(l.id)! : l.text;
    if (!bearbeiten || l.id === null) return <span key={i} style={laufStil(l)}>{text}</span>;
    const id = l.id;
    return <EditierbarerLauf key={`${i}-${runde}`} text={text} stil={laufStil(l)} geaendert={aenderungen.has(id)} onText={(t) => setzen(id, t)} />;
  };

  const bloecke = (liste: Block[]) =>
    liste.map((b, i) =>
      b.art === 'tabelle' ? (
        <table key={i} className="wd-tabelle">
          <tbody>
            {b.zeilen.map((z, zi) => (
              <tr key={zi}>
                {z.map((zelle, ci) => (
                  <td key={ci}>{bloecke(zelle)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : b.ebene ? (
        <div key={i} role="heading" aria-level={b.ebene} className={`wd-ueberschrift e${Math.min(b.ebene, 3)}`} style={{ textAlign: b.ausrichtung }}>
          {b.laeufe.map(lauf)}
        </div>
      ) : (
        <p key={i} className={b.liste ? 'wd-liste' : undefined} style={{ textAlign: b.ausrichtung }}>
          {b.laeufe.map(lauf)}
          {!b.laeufe.length && ' '}
        </p>
      ),
    );

  return (
    <div className="dok">
      <DateiKopf
        datei={datei}
        geaendert={aenderungen.size > 0}
        bearbeitbar={bearbeitbar}
        hinweis={
          datei.inOffice
            ? 'Nur ansehen: Das Dokument ist gerade in Word geöffnet.'
            : fehler || (bearbeiten ? 'Text direkt im Dokument ändern. Formatierung, Bilder, Kopf- und Fußzeilen bleiben unverändert.' : undefined)
        }
        onSpeichern={() => void speichern()}
        onVerwerfen={() => {
          setDateiEntwurf(null);
          setRunde((r) => r + 1);
        }}
        werkzeuge={
          bearbeitbar && dok ? (
            <button className={bearbeiten ? 'active' : ''} onClick={() => setBearbeiten(!bearbeiten)}>
              Text bearbeiten
            </button>
          ) : undefined
        }
      />
      <div className="dok-flaeche wd-flaeche">
        {dok ? <article className={`wd-blatt${bearbeiten ? ' bearbeiten' : ''}`}>{bloecke(dok.bloecke)}</article> : <p className="warning">Das Dokument lässt sich nicht lesen{fehler ? `: ${fehler}` : ''}.</p>}
      </div>
    </div>
  );
}
