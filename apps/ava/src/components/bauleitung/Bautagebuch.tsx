import { useEffect, useMemo, useState } from 'react';
import { allgemeinLaden } from '@core/platform/konfig';
import { bestaetigen, meldung } from '@core/ui/Rueckfrage';
import type { Firmeneinsatz, Tagesbericht } from '../../avaDaten';
import { tagesberichtPdf } from '../../bauleitung/berichte';
import { wetterAbrufen } from '../../bauleitung/wetter';
import { gewerkZweistellig } from '../../abrechnung/gewerk';
import { heuteIso, neueId } from '../../lv/modell';
import { vollerPfad } from '../../dateien';
import { useAva } from '../../store';
import { datumKurz, DatumEingabe, Feld, TextEingabe, ZahlEingabe } from '../eingaben';
import { berichtAblegen, berichtKopf, pdfZeigen, speichern } from './gemeinsam';

/** Bautagebuch: ein Tagesbericht je Tag mit Wetter, Firmen, Leistungen, Behinderungen, Anordnungen, Fotos */
export function Bautagebuch() {
  const projekt = useAva((s) => s.projekt)!;
  const liste = useMemo(() => [...projekt.ava.bautagebuch].sort((a, b) => b.datum.localeCompare(a.datum)), [projekt.ava.bautagebuch]);
  const [id, setId] = useState<string | null>(liste[0]?.id ?? null);
  const t = liste.find((x) => x.id === id) ?? null;

  const neu = async () => {
    const heute = heuteIso();
    if (liste.some((x) => x.datum === heute) && !(await bestaetigen('Weiterer Bericht?', 'Für heute gibt es schon einen Tagesbericht. Trotzdem einen weiteren anlegen?', 'Anlegen'))) return;
    const vorher = liste[0];
    const n: Tagesbericht = {
      id: neueId('t'),
      datum: heute,
      nr: Math.max(0, ...liste.map((x) => x.nr ?? 0)) + 1,
      firmen: vorher ? vorher.firmen.map((f) => ({ ...f, taetigkeit: '' })) : [],
      leistungen: '',
      fotos: [],
      verfasser: useAva.getState().einstellungen.deckblatt.bearbeiter || projekt.meta.bearbeiter,
    };
    await speichern((a) => ({ ...a, bautagebuch: [...a.bautagebuch, n] }));
    setId(n.id);
  };

  return (
    <div className="ava-zweispaltig">
      <div className="ava-liste-spalte">
        <div className="ava-eingang-kopf">
          <h2>Bautagebuch</h2>
          <button className="primary small" onClick={() => void neu()}>
            + Tagesbericht
          </button>
        </div>
        <ul className="list">
          {liste.map((x) => (
            <li key={x.id} className={x.id === t?.id ? 'active' : ''} onClick={() => setId(x.id)}>
              <div>
                <strong>{datumKurz(x.datum)}</strong> {x.nr ? <span className="muted">Nr. {x.nr}</span> : null}
              </div>
              <span className="muted small-text">{[x.wetter, `${x.firmen.length} Firma(en)`].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
          {!liste.length && <li className="muted">Noch keine Tagesberichte.</li>}
        </ul>
      </div>
      <div className="ava-editor-spalte">{t ? <Bericht key={t.id} t={t} /> : <p className="muted">Mit „+ Tagesbericht“ beginnen.</p>}</div>
    </div>
  );
}

function Bericht({ t }: { t: Tagesbericht }) {
  const projekt = useAva((s) => s.projekt)!;
  const [fotos, setFotos] = useState<{ pfad: string; name: string }[]>([]);
  const setze = (patch: Partial<Tagesbericht>) => void speichern((a) => ({ ...a, bautagebuch: a.bautagebuch.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) }));
  const firma = (i: number, patch: Partial<Firmeneinsatz>) => setze({ firmen: t.firmen.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const firmenVorschlag = useMemo(() => {
    const kk = projekt.kk?.kk;
    const out: Firmeneinsatz[] = [];
    for (const g of kk?.gewerke ?? []) if (g.auftragnehmer && g.gewerk) out.push({ firma: g.auftragnehmer, gewerk: g.gewerk });
    for (const [g, a] of Object.entries(projekt.ava.gewerke)) if (a.firma && !out.some((x) => x.firma === a.firma)) out.push({ firma: a.firma, gewerk: g });
    return out;
  }, [projekt.kk, projekt.ava.gewerke]);

  // Fotos des Tages aus dem Fotoordner des Projekts (gemeinsame Einstellung)
  useEffect(() => {
    let aktuell = true;
    void (async () => {
      try {
        const ordner = (await allgemeinLaden()).fotoordner;
        if (!ordner) return;
        const liste = await useAva.getState().fs.liste(`${projekt.ordner.replace(/[\\/]+$/, '')}/${ordner}`, 3);
        const tag = t.datum;
        const passend = liste
          .filter((e) => !e.ordner && /\.(jpe?g|png|heic)$/i.test(e.pfad) && e.geaendert && new Date(e.geaendert).toISOString().slice(0, 10) === tag)
          .map((e) => ({ pfad: `${ordner}/${e.pfad}`, name: e.pfad.split('/').pop()! }));
        if (aktuell) setFotos(passend);
      } catch {
        if (aktuell) setFotos([]);
      }
    })();
    return () => {
      aktuell = false;
    };
  }, [t.datum, projekt.ordner]);

  const wetter = async () => {
    const k = projekt.meta.koordinaten;
    if (!k) {
      await meldung('Keine Koordinaten', 'In den Stammdaten fehlt die Lage des Vorhabens (Adresse eintragen – sie wird automatisch ermittelt).');
      return;
    }
    try {
      const w = await wetterAbrufen(k.lat, k.lon, t.datum);
      setze({ wetter: w.lage, temperatur: w.temperatur });
    } catch (e) {
      await meldung('Wetter nicht abrufbar', String(e instanceof Error ? e.message : e), e);
    }
  };

  const pdf = async (ablegen: boolean) => {
    try {
      const daten = await tagesberichtPdf(berichtKopf(), t);
      const name = `${projekt.meta.projektcode} ${t.datum.replace(/-/g, '').slice(2)} Bautagebuch${t.nr ? ` ${String(t.nr).padStart(3, '0')}` : ''}`;
      if (ablegen) {
        const pfad = await berichtAblegen(name, daten, 'Bautagebuch');
        await meldung('Abgelegt', pfad);
      } else await pdfZeigen(name, daten);
    } catch (e) {
      await meldung('PDF nicht erzeugt', String(e instanceof Error ? e.message : e), e);
    }
  };

  return (
    <div className="ava-bericht">
      <div className="ava-formular">
        <Feld label="Datum">
          <DatumEingabe wert={t.datum} onChange={(d) => d && setze({ datum: d })} />
        </Feld>
        <Feld label="Nr.">
          <ZahlEingabe wert={t.nr ?? null} onChange={(n) => setze({ nr: n ? Math.round(n) : undefined })} />
        </Feld>
        <Feld label="Verfasser">
          <TextEingabe wert={t.verfasser} onChange={(verfasser) => setze({ verfasser })} />
        </Feld>
        <Feld label="Wetter">
          <div className="ava-reihe">
            <TextEingabe wert={t.wetter} onChange={(w) => setze({ wetter: w })} />
            <button className="small" onClick={() => void wetter()} title="Wetter am Ort des Vorhabens für diesen Tag abrufen (Open-Meteo, nur Koordinaten und Datum werden gesendet)">
              abrufen
            </button>
          </div>
        </Feld>
        <Feld label="Temperatur">
          <TextEingabe wert={t.temperatur} onChange={(temperatur) => setze({ temperatur })} />
        </Feld>
      </div>
      <h3>Firmen auf der Baustelle</h3>
      <table className="ava-tabelle">
        <thead>
          <tr>
            <th>Firma</th>
            <th>Gewerk</th>
            <th className="num">Personen</th>
            <th>Tätigkeit</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {t.firmen.map((f, i) => (
            <tr key={i}>
              <td>
                <TextEingabe wert={f.firma} onChange={(x) => firma(i, { firma: x })} liste="ava-firmen" />
              </td>
              <td>{f.gewerk ? gewerkZweistellig(f.gewerk) : ''}</td>
              <td className="num ava-zelle-eingabe">
                <ZahlEingabe wert={f.personen ?? null} onChange={(n) => firma(i, { personen: n ?? undefined })} />
              </td>
              <td>
                <TextEingabe wert={f.taetigkeit} onChange={(x) => firma(i, { taetigkeit: x })} />
              </td>
              <td>
                <button className="small" onClick={() => setze({ firmen: t.firmen.filter((_, j) => j !== i) })}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id="ava-firmen">
        {firmenVorschlag.map((f) => (
          <option key={f.firma} value={f.firma} />
        ))}
      </datalist>
      <div className="button-row">
        <select
          value=""
          onChange={(e) => {
            const f = firmenVorschlag.find((x) => x.firma === e.target.value);
            setze({ firmen: [...t.firmen, f ? { ...f } : { firma: '' }] });
          }}
        >
          <option value="">+ Firma …</option>
          {firmenVorschlag.map((f) => (
            <option key={f.firma} value={f.firma}>
              {f.gewerk ? `${gewerkZweistellig(f.gewerk)} ` : ''}
              {f.firma}
            </option>
          ))}
          <option value="-">andere …</option>
        </select>
      </div>
      <Feld label="Ausgeführte Leistungen" breit>
        <TextEingabe mehrzeilig zeilen={5} wert={t.leistungen} onChange={(leistungen) => setze({ leistungen })} />
      </Feld>
      <Feld label="Behinderungen, Erschwernisse, Mängel" breit>
        <TextEingabe mehrzeilig zeilen={3} wert={t.behinderungen} onChange={(behinderungen) => setze({ behinderungen })} />
      </Feld>
      <Feld label="Anordnungen und Vereinbarungen" breit>
        <TextEingabe mehrzeilig zeilen={3} wert={t.anordnungen} onChange={(anordnungen) => setze({ anordnungen })} />
      </Feld>
      <Feld label="Besucher" breit>
        <TextEingabe wert={t.besucher} onChange={(besucher) => setze({ besucher })} />
      </Feld>
      <h3>Fotos</h3>
      {fotos.length === 0 && !t.fotos.length && <p className="muted small-text">Keine Fotos von diesem Tag im Fotoordner des Projekts.</p>}
      <ul className="ava-fotos">
        {[...new Set([...t.fotos, ...fotos.map((f) => f.pfad)])].map((p) => (
          <li key={p}>
            <label className="ava-check">
              <input type="checkbox" checked={t.fotos.includes(p)} onChange={(e) => setze({ fotos: e.target.checked ? [...t.fotos, p] : t.fotos.filter((x) => x !== p) })} /> {p.split('/').pop()}
            </label>
            <button className="small ava-link" onClick={() => void useAva.getState().fs.oeffnen(vollerPfad(projekt.ordner, p))}>
              ansehen
            </button>
          </li>
        ))}
      </ul>
      <div className="button-row">
        <button onClick={() => void pdf(false)}>PDF ansehen / drucken</button>
        <button className="primary" onClick={() => void pdf(true)}>
          PDF im Projekt ablegen
        </button>
        <button
          className="danger"
          onClick={async () => {
            if (await bestaetigen('Tagesbericht entfernen?', `Bericht vom ${datumKurz(t.datum)} entfernen?`, 'Entfernen', true)) await speichern((a) => ({ ...a, bautagebuch: a.bautagebuch.filter((x) => x.id !== t.id) }));
          }}
        >
          Entfernen
        </button>
      </div>
    </div>
  );
}
