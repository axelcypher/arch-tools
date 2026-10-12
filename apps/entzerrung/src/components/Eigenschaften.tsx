import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fmt2, fmt3, fmtPlain } from '@core/format';
import { logger } from '@core/platform/log';
import { Field, NumberField, TextField } from '@core/ui/fields';
import { entzerrung } from '../geo/ebene';
import type { Entzerrung, Ergebnis } from '../geo/ebene';
import { ausgabe, autoAufloesung, bereichVon, messwert } from '../geo/messen';
import { schaetzeLinse } from '../geo/verzeichnung';
import { ECKEN, MESS_NAMEN } from '../model';
import type { Ebene, Foto, Methode } from '../model';
import { aktuell, mitEbene, mitFoto, useEntz } from '../store';
import type { Werkzeug } from '../store';
import { ExportDialog } from './ExportDialog';

const log = logger('eigenschaften');

export const WERKZEUG_NAMEN: Record<Werkzeug, string> = {
  auswahl: 'Auswahl',
  hilfslinie: 'Hilfslinie',
  ecken: 'Ecken setzen',
  passpunkt: 'Passpunkt',
  waagerecht: 'Waagerechte Kante',
  senkrecht: 'Senkrechte Kante',
  mass: 'Bekanntes Maß',
  strecke: 'Strecke',
  linienzug: 'Linienzug',
  flaeche: 'Fläche',
  ausschnitt: 'Ausschnitt',
};

export function WerkzeugKnopf({ w, children, title }: { w: Werkzeug; children?: ReactNode; title?: string }) {
  const aktiv = useEntz((s) => s.werkzeug === w);
  return (
    <button className={aktiv ? 'active' : ''} title={title} onClick={() => useEntz.getState().setze({ werkzeug: aktiv ? 'auswahl' : w, entwurf: [] })}>
      {children ?? WERKZEUG_NAMEN[w]}
    </button>
  );
}

/** Rechte Leiste */
export function Eigenschaften() {
  const doc = useEntz((s) => s.doc);
  const fotoId = useEntz((s) => s.fotoId);
  const ebeneId = useEntz((s) => s.ebeneId);
  const gewuenscht = useEntz((s) => s.ansicht);
  const { foto, ebene } = aktuell({ doc, fotoId, ebeneId });
  const ergebnis = useMemo(() => (foto && ebene ? entzerrung(foto, ebene) : null), [foto, ebene]);
  if (!foto || !ebene || !ergebnis) return <aside className="sidebar sidebar-right" />;
  const entzerrt = gewuenscht === 'entzerrt' && ergebnis.ok;
  return (
    <aside className="sidebar sidebar-right">
      {entzerrt && ergebnis.ok ? (
        <>
          <MessPanel foto={foto} ebene={ebene} e={ergebnis.e} />
          <BildPanel foto={foto} ebene={ebene} e={ergebnis.e} />
        </>
      ) : (
        <>
          <ReferenzPanel foto={foto} ebene={ebene} ergebnis={ergebnis} />
          <ObjektivPanel foto={foto} />
        </>
      )}
    </aside>
  );
}

// ---------- Referenz ----------

const METHODEN: { id: Methode; name: string; text: string }[] = [
  { id: 'rechteck', name: 'Rechteck', text: 'Vier Ecken eines bekannten Rechtecks (Fenster, Tür, Platte) mit Breite und Höhe.' },
  { id: 'passpunkte', name: 'Passpunkte', text: 'Mindestens vier Punkte mit Koordinaten aus dem Aufmaß; mehr Punkte gleichen aus und zeigen Restfehler.' },
  { id: 'fluchtlinien', name: 'Fluchtlinien', text: 'Je zwei waagerechte und senkrechte Kanten nachziehen und zwei bekannte Maße angeben.' },
];

function ReferenzPanel({ foto, ebene, ergebnis }: { foto: Foto; ebene: Ebene; ergebnis: Ergebnis }) {
  const s = useEntz.getState;
  const aendern = (f: (e: Ebene) => Ebene) => s().aendern(mitEbene(foto.id, ebene.id, f));
  const auswahl = useEntz((x) => x.auswahl);
  const rest = (id: string) => (ergebnis.ok ? ergebnis.e.residuen.find((r) => r.id === id) : undefined);
  const restText = (id: string) => {
    const r = rest(id);
    if (!r) return '';
    return r.einheit === 'm' ? `${fmt2(r.wert * 1000)} mm` : `${fmt2(r.wert)}°`;
  };

  return (
    <section>
      <h2>Referenz · {ebene.name}</h2>
      <div className="ef-methoden">
        {METHODEN.map((m) => (
          <button key={m.id} className={ebene.methode === m.id ? 'active' : ''} title={m.text} onClick={() => aendern((e) => ({ ...e, methode: m.id }))}>
            {m.name}
          </button>
        ))}
      </div>
      <p className="muted small-text">{METHODEN.find((m) => m.id === ebene.methode)!.text}</p>

      {ebene.methode === 'rechteck' && (
        <>
          <div className="field-row">
            <Field label="Breite (m)">
              <NumberField value={ebene.rechteck.breite} min={0} digits={3} allowEmpty onChange={(v) => aendern((e) => ({ ...e, rechteck: { ...e.rechteck, breite: v } }))} />
            </Field>
            <Field label="Höhe (m)">
              <NumberField value={ebene.rechteck.hoehe} min={0} digits={3} allowEmpty onChange={(v) => aendern((e) => ({ ...e, rechteck: { ...e.rechteck, hoehe: v } }))} />
            </Field>
          </div>
          <p className="small-text">
            Ecken: {ebene.rechteck.ecken.length} von 4
            {ebene.rechteck.ecken.length < 4 && <span className="muted"> – als Nächstes {ECKEN[ebene.rechteck.ecken.length]}</span>}
          </p>
          <div className="button-row">
            {ebene.rechteck.ecken.length < 4 && <WerkzeugKnopf w="ecken" />}
            {ebene.rechteck.ecken.length > 0 && (
              <button
                onClick={() => {
                  aendern((e) => ({ ...e, rechteck: { ...e.rechteck, ecken: [] } }));
                  s().setze({ werkzeug: 'ecken', entwurf: [] });
                }}
              >
                Ecken neu setzen
              </button>
            )}
          </div>
        </>
      )}

      {ebene.methode === 'passpunkte' && (
        <>
          <div className="button-row">
            <WerkzeugKnopf w="passpunkt">Passpunkt setzen</WerkzeugKnopf>
          </div>
          {ebene.passpunkte.length > 0 && (
            <table className="ef-tabelle">
              <thead>
                <tr>
                  <th />
                  <th>x (m)</th>
                  <th>y (m)</th>
                  <th title="Abweichung nach dem Ausgleich">Rest</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ebene.passpunkte.map((p, i) => (
                  <tr key={p.id} className={auswahl?.art === 'passpunkt' && auswahl.id === p.id ? 'sel' : ''} onClick={() => s().setze({ auswahl: { art: 'passpunkt', id: p.id } })}>
                    <td>P{i + 1}</td>
                    <td>
                      <NumberField value={p.x} digits={3} allowEmpty onChange={(v) => aendern((e) => ({ ...e, passpunkte: e.passpunkte.map((q) => (q.id === p.id ? { ...q, x: v } : q)) }))} />
                    </td>
                    <td>
                      <NumberField value={p.y} digits={3} allowEmpty onChange={(v) => aendern((e) => ({ ...e, passpunkte: e.passpunkte.map((q) => (q.id === p.id ? { ...q, y: v } : q)) }))} />
                    </td>
                    <td className="num muted">{restText(p.id)}</td>
                    <td>
                      <button className="icon small danger" title="Passpunkt entfernen" onClick={() => aendern((e) => ({ ...e, passpunkte: e.passpunkte.filter((q) => q.id !== p.id) }))}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small-text">x nach rechts, y nach oben, z. B. Höhen über Gelände. Punkte möglichst weit über die Fläche verteilen.</p>
        </>
      )}

      {ebene.methode === 'fluchtlinien' && (
        <>
          <div className="button-row">
            <WerkzeugKnopf w="waagerecht">Waagerecht ({ebene.fluchtlinien.waagerecht.length})</WerkzeugKnopf>
            <WerkzeugKnopf w="senkrecht">Senkrecht ({ebene.fluchtlinien.senkrecht.length})</WerkzeugKnopf>
            <WerkzeugKnopf w="mass">Maß ({ebene.fluchtlinien.masse.length})</WerkzeugKnopf>
          </div>
          {ebene.fluchtlinien.masse.length > 0 && (
            <table className="ef-tabelle">
              <thead>
                <tr>
                  <th />
                  <th>Länge (m)</th>
                  <th>Rest</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ebene.fluchtlinien.masse.map((m, i) => (
                  <tr key={m.id} className={auswahl?.art === 'mass' && auswahl.id === m.id ? 'sel' : ''} onClick={() => s().setze({ auswahl: { art: 'mass', id: m.id } })}>
                    <td>M{i + 1}</td>
                    <td>
                      <NumberField
                        value={m.laenge}
                        min={0}
                        digits={3}
                        allowEmpty
                        onChange={(v) => aendern((e) => ({ ...e, fluchtlinien: { ...e.fluchtlinien, masse: e.fluchtlinien.masse.map((q) => (q.id === m.id ? { ...q, laenge: v } : q)) } }))}
                      />
                    </td>
                    <td className="num muted">{restText(m.id)}</td>
                    <td>
                      <button
                        className="icon small danger"
                        title="Maß entfernen"
                        onClick={() => aendern((e) => ({ ...e, fluchtlinien: { ...e.fluchtlinien, masse: e.fluchtlinien.masse.filter((q) => q.id !== m.id) } }))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {ergebnis.ok && ergebnis.e.residuen.some((r) => r.einheit === '°') && (
            <p className="small-text muted">
              Kantenabweichung:{' '}
              {[
                ...ebene.fluchtlinien.waagerecht.map((l, i) => [`W${i + 1}`, l.id]),
                ...ebene.fluchtlinien.senkrecht.map((l, i) => [`S${i + 1}`, l.id]),
              ]
                .filter(([, id]) => rest(id))
                .map(([n, id]) => `${n} ${restText(id)}`)
                .join(' · ')}
            </p>
          )}
          <p className="muted small-text">Kanten möglichst lang und weit auseinander wählen. Die Maße am besten als eine Breite und eine Höhe.</p>
        </>
      )}

      {ergebnis.ok ? (
        <div className="ef-ok">
          <span>Ebene ist entzerrbar.</span>
          <button className="primary" onClick={() => s().setze({ ansicht: 'entzerrt', werkzeug: 'auswahl', entwurf: [], auswahl: null })}>
            Entzerrt ansehen
          </button>
        </div>
      ) : (
        <div className="warning">{ergebnis.fehler}</div>
      )}
    </section>
  );
}

// ---------- Objektiv ----------

function ObjektivPanel({ foto }: { foto: Foto }) {
  const korrigiert = useEntz((s) => s.korrigiert);
  const s = useEntz.getState;
  const [fehler, setFehler] = useState<string | null>(null);
  const linien = foto.hilfslinien.filter((l) => l.punkte.length >= 3);
  const setzeLinse = (linse: Foto['linse']) => s().aendern(mitFoto(foto.id, (f) => ({ ...f, linse })));
  const schaetzen = () => {
    try {
      const r = schaetzeLinse(
        foto.breite,
        foto.hoehe,
        linien.map((l) => l.punkte),
      );
      setFehler(null);
      setzeLinse({ k1: r.k1, k2: r.k2, vorher: r.vorher, nachher: r.nachher });
      log.info('Verzeichnung geschätzt', r);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    }
  };
  const hat = foto.linse.k1 !== 0 || foto.linse.k2 !== 0;
  return (
    <section>
      <h2>Objektiv · Verzeichnung</h2>
      <p className="muted small-text">
        Weitwinkel biegen gerade Kanten zum Bildrand hin. Mit Hilfslinien entlang solcher Kanten (je mindestens drei Punkte, gern mehr) wird die Verzeichnung geschätzt und
        bei allen Ebenen dieses Fotos herausgerechnet.
      </p>
      <div className="button-row">
        <WerkzeugKnopf w="hilfslinie">Hilfslinie ({foto.hilfslinien.length})</WerkzeugKnopf>
        <button disabled={!linien.length} onClick={schaetzen} title={linien.length >= 3 ? 'k1 und k2 schätzen' : 'mit weniger als drei Linien nur k1'}>
          Verzeichnung schätzen
        </button>
      </div>
      <div className="field-row">
        <Field label="k1">
          <NumberField value={foto.linse.k1} digits={4} onChange={(v) => setzeLinse({ k1: v ?? 0, k2: foto.linse.k2 })} />
        </Field>
        <Field label="k2">
          <NumberField value={foto.linse.k2} digits={4} onChange={(v) => setzeLinse({ k1: foto.linse.k1, k2: v ?? 0 })} />
        </Field>
      </div>
      {foto.linse.vorher !== undefined && foto.linse.nachher !== undefined && (
        <p className="small-text">
          Abweichung der Hilfslinien von der Geraden: {fmt2(foto.linse.vorher)} px → <strong>{fmt2(foto.linse.nachher)} px</strong>
        </p>
      )}
      {fehler && <div className="warning">{fehler}</div>}
      <div className="button-row">
        <label className="toggle">
          <input type="checkbox" checked={korrigiert} onChange={(e) => s().setze({ korrigiert: e.target.checked })} />
          Foto korrigiert anzeigen
        </label>
        {hat && (
          <button className="small" onClick={() => setzeLinse({ k1: 0, k2: 0 })}>
            Zurücksetzen
          </button>
        )}
      </div>
    </section>
  );
}

// ---------- Messen ----------

function MessPanel({ foto, ebene, e }: { foto: Foto; ebene: Ebene; e: Entzerrung }) {
  const auswahl = useEntz((s) => s.auswahl);
  const s = useEntz.getState;
  const werte = useMemo(() => new Map(ebene.messungen.map((m) => [m.id, messwert(e, m)])), [ebene.messungen, e]);
  const kopieren = () => {
    const zeilen = [['Name', 'Art', 'Länge [m]', 'Fläche [m²]'].join('\t')];
    for (const m of ebene.messungen) {
      const w = werte.get(m.id)!;
      zeilen.push([m.name, MESS_NAMEN[m.art], fmtPlain(w.laenge, 3), w.flaeche !== undefined ? fmtPlain(w.flaeche, 3) : ''].join('\t'));
    }
    void navigator.clipboard?.writeText(zeilen.join('\n'));
  };
  return (
    <section className="grow">
      <div className="section-head">
        <h2>Messen · {ebene.name}</h2>
        {ebene.messungen.length > 0 && (
          <button className="small" onClick={kopieren} title="Als Tabelle in die Zwischenablage (zum Einfügen in Excel)">
            Kopieren
          </button>
        )}
      </div>
      <div className="button-row">
        <WerkzeugKnopf w="strecke" />
        <WerkzeugKnopf w="linienzug" />
        <WerkzeugKnopf w="flaeche" />
      </div>
      {!ebene.messungen.length && <p className="muted small-text">Punkte im entzerrten Bild anklicken. Umschalt hält waagerecht/senkrecht, vorhandene Punkte werden gefangen.</p>}
      <ul className="list ef-messungen">
        {ebene.messungen.map((m) => {
          const w = werte.get(m.id)!;
          const sel = auswahl?.art === 'messung' && auswahl.id === m.id;
          return (
            <li key={m.id} className={sel ? 'active' : ''} onClick={() => s().setze({ auswahl: { art: 'messung', id: m.id } })}>
              <span className="grow-text">
                <TextField value={m.name} onChange={(name) => s().aendern(mitEbene(foto.id, ebene.id, (x) => ({ ...x, messungen: x.messungen.map((y) => (y.id === m.id ? { ...y, name } : y)) })))} />
              </span>
              <span className="num ef-wert">
                {w.flaeche !== undefined ? (
                  <>
                    <strong>{fmt2(w.flaeche)} m²</strong>
                    <br />
                    <span className="muted small-text">U {fmt2(w.laenge)} m</span>
                  </>
                ) : (
                  <strong>{fmt3(w.laenge)} m</strong>
                )}
              </span>
              <button
                className="icon small danger"
                title="Messung entfernen"
                onClick={(x) => {
                  x.stopPropagation();
                  s().aendern(mitEbene(foto.id, ebene.id, (y) => ({ ...y, messungen: y.messungen.filter((z) => z.id !== m.id) })));
                }}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted small-text ef-hinweis">Maße stimmen nur für Punkte, die in der entzerrten Ebene liegen. Vor- und Rücksprünge (Fensterbank, Gesims, Dachüberstand) werden verzerrt.</p>
    </section>
  );
}

// ---------- Bild ----------

function BildPanel({ foto, ebene, e }: { foto: Foto; ebene: Ebene; e: Entzerrung }) {
  const [dialog, setDialog] = useState(false);
  const s = useEntz.getState;
  const aendern = (f: (x: Ebene) => Ebene) => s().aendern(mitEbene(foto.id, ebene.id, f));
  const auto = useMemo(() => autoAufloesung(e, ebene), [e, ebene]);
  const bereich = bereichVon(e, foto, ebene);
  const a = ausgabe(bereich, ebene.aufloesung ?? auto);
  return (
    <section>
      <h2>Bild</h2>
      <div className="field-row">
        <Field label="Auflösung (mm je Pixel)" hint={ebene.aufloesung === undefined ? 'automatisch: etwa wie im Foto' : undefined}>
          <NumberField value={ebene.aufloesung !== undefined ? ebene.aufloesung * 1000 : undefined} placeholder={fmt2(auto * 1000)} min={0.01} digits={2} allowEmpty onChange={(v) => aendern((x) => ({ ...x, aufloesung: v === undefined ? undefined : v / 1000 }))} />
        </Field>
      </div>
      <p className="small-text">
        Ausschnitt {fmt2(bereich.x1 - bereich.x0)} × {fmt2(bereich.y1 - bereich.y0)} m{ebene.ausschnitt ? '' : ' (automatisch)'}
        <br />
        <span className="muted">
          Bild {a.breite.toLocaleString('de-DE')} × {a.hoehe.toLocaleString('de-DE')} px{a.begrenzt ? ` – auf ${fmt2(a.aufloesung * 1000)} mm/px begrenzt` : ''}
        </span>
      </p>
      <div className="button-row">
        <WerkzeugKnopf w="ausschnitt">Ausschnitt ziehen</WerkzeugKnopf>
        {ebene.ausschnitt && <button onClick={() => aendern((x) => ({ ...x, ausschnitt: undefined }))}>Automatisch</button>}
        <button className="primary" onClick={() => setDialog(true)}>
          Exportieren …
        </button>
      </div>
      {dialog && <ExportDialog foto={foto} ebene={ebene} e={e} aufloesung={a.aufloesung} bereich={bereich} onClose={() => setDialog(false)} />}
    </section>
  );
}
