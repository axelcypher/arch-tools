import { useEffect, useMemo, useState } from 'react';
import { vorschauUrl } from '../bilder';
import { entzerrung } from '../geo/ebene';
import type { Foto } from '../model';
import { fotosHinzufuegen } from '../projekt';
import { bestaetigen } from '@core/ui/Rueckfrage';
import { Symbol } from '@core/ui/Symbol';
import { ebeneHinzufuegen, mitEbene, mitFoto, useEntz } from '../store';

/** Linke Leiste: Fotos des Projekts und Ebenen des gewählten Fotos */
export function FotoLeiste() {
  const fotos = useEntz((s) => s.doc.fotos);
  const fotoId = useEntz((s) => s.fotoId);
  const foto = fotos.find((f) => f.id === fotoId) ?? null;

  return (
    <aside className="sidebar sidebar-left">
      <section>
        <div className="section-head">
          <h2>Fotos</h2>
          <button className="small" onClick={() => void fotosHinzufuegen()} title="Fotos hinzufügen (JPEG, PNG, WebP)">
            <Symbol name="plus" /> Foto …
          </button>
        </div>
        {!fotos.length && <p className="muted small-text">Noch kein Foto. Fotos lassen sich auch einfach ins Fenster ziehen.</p>}
        <ul className="list ef-fotos">
          {fotos.map((f) => (
            <FotoEintrag key={f.id} foto={f} aktiv={f.id === fotoId} />
          ))}
        </ul>
      </section>
      {foto && <EbenenListe foto={foto} />}
    </aside>
  );
}

function FotoEintrag({ foto, aktiv }: { foto: Foto; aktiv: boolean }) {
  const daten = useEntz((s) => s.bilder[foto.id]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!daten) return;
    const u = vorschauUrl(daten, foto.mime);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [daten, foto.mime]);
  const loeschen = async () => {
    if (!(await bestaetigen(`Foto „${foto.name}“ entfernen?`, 'Das Foto wird mit allen Ebenen und Messungen entfernt.', 'Entfernen', true))) return;
    const s = useEntz.getState();
    const rest = s.doc.fotos.filter((f) => f.id !== foto.id);
    s.aendern((d) => ({ fotos: d.fotos.filter((f) => f.id !== foto.id) }));
    if (s.fotoId === foto.id) s.waehleFoto(rest[0]?.id ?? null);
  };
  return (
    <li
      className={aktiv ? 'active' : ''}
      tabIndex={0}
      aria-current={aktiv ? 'true' : undefined}
      onClick={() => !aktiv && useEntz.getState().waehleFoto(foto.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!aktiv) useEntz.getState().waehleFoto(foto.id);
        } else if (e.key === 'Delete') void loeschen();
      }}
      title={`${foto.name} (${foto.breite} × ${foto.hoehe} px)`}
    >
      {url ? <img className="ef-vorschau" src={url} alt="" /> : <span className="ef-vorschau" />}
      <span className="grow-text">
        {foto.name}
        <br />
        <span className="muted small-text">
          {foto.ebenen.length} {foto.ebenen.length === 1 ? 'Ebene' : 'Ebenen'}
        </span>
      </span>
      <button
        className="icon small danger ef-entfernen"
        title={`Foto „${foto.name}“ entfernen`}
        aria-label={`Foto ${foto.name} entfernen`}
        onClick={(e) => {
          e.stopPropagation();
          void loeschen();
        }}
      >
        <Symbol name="muell" />
      </button>
    </li>
  );
}

function EbenenListe({ foto }: { foto: Foto }) {
  const ebeneId = useEntz((s) => s.ebeneId);
  const [umbenennen, setUmbenennen] = useState<string | null>(null);
  const status = useMemo(() => new Map(foto.ebenen.map((e) => [e.id, entzerrung(foto, e).ok])), [foto]);
  const loeschen = async (id: string, name: string) => {
    if (foto.ebenen.length <= 1) return;
    if (!(await bestaetigen(`Ebene „${name}“ entfernen?`, 'Die Ebene wird mit ihren Messungen entfernt.', 'Entfernen', true))) return;
    const s = useEntz.getState();
    const rest = foto.ebenen.filter((e) => e.id !== id);
    s.aendern(mitFoto(foto.id, (f) => ({ ...f, ebenen: rest })));
    if (s.ebeneId === id) s.waehleEbene(rest[0].id);
  };
  return (
    <section className="grow">
      <div className="section-head">
        <h2>Ebenen</h2>
        <button className="small" onClick={() => ebeneHinzufuegen(foto.id)} title="Ebene hinzufügen – weitere Ebene in diesem Foto, z. B. die zweite Fassadenseite an einer Gebäudeecke">
          <Symbol name="plus" /> Ebene
        </button>
      </div>
      <ul className="list">
        {foto.ebenen.map((e) => (
          <li
            key={e.id}
            className={e.id === ebeneId ? 'active' : ''}
            tabIndex={0}
            aria-current={e.id === ebeneId ? 'true' : undefined}
            onClick={() => useEntz.getState().waehleEbene(e.id)}
            onDoubleClick={() => setUmbenennen(e.id)}
            onKeyDown={(x) => {
              if (x.target !== x.currentTarget) return;
              if (x.key === 'Enter' || x.key === ' ') {
                x.preventDefault();
                useEntz.getState().waehleEbene(e.id);
              } else if (x.key === 'F2') {
                x.preventDefault();
                setUmbenennen(e.id);
              } else if (x.key === 'Delete' && foto.ebenen.length > 1) void loeschen(e.id, e.name);
            }}
          >
            <span
              className={`ef-status-punkt ${status.get(e.id) ? 'ok' : ''}`}
              role="img"
              aria-label={status.get(e.id) ? 'entzerrbar' : 'Referenz unvollständig'}
              title={status.get(e.id) ? 'entzerrbar' : 'Referenz unvollständig'}
            />
            {umbenennen === e.id ? (
              <span className="grow-text" onClick={(x) => x.stopPropagation()}>
                <input
                  autoFocus
                  aria-label="Name der Ebene"
                  defaultValue={e.name}
                  onBlur={(x) => {
                    setUmbenennen(null);
                    const name = x.target.value.trim();
                    if (name && name !== e.name) useEntz.getState().aendern(mitEbene(foto.id, e.id, (y) => ({ ...y, name })));
                  }}
                  onKeyDown={(x) => {
                    if (x.key === 'Enter') x.currentTarget.blur();
                    if (x.key === 'Escape') {
                      x.currentTarget.value = e.name;
                      x.currentTarget.blur();
                    }
                  }}
                />
              </span>
            ) : (
              <span className="grow-text" title="Doppelklick oder F2 zum Umbenennen">
                {e.name}
                {e.messungen.length > 0 && (
                  <span className="muted small-text">
                    {' '}
                    · {e.messungen.length} {e.messungen.length === 1 ? 'Messung' : 'Messungen'}
                  </span>
                )}
              </span>
            )}
            {umbenennen !== e.id && (
              <button
                className="icon small ef-entfernen"
                title={`Ebene „${e.name}“ umbenennen (F2)`}
                aria-label={`Ebene ${e.name} umbenennen`}
                onClick={(x) => {
                  x.stopPropagation();
                  setUmbenennen(e.id);
                }}
              >
                <Symbol name="stift" />
              </button>
            )}
            {foto.ebenen.length > 1 && (
              <button
                className="icon small danger ef-entfernen"
                title={`Ebene „${e.name}“ entfernen`}
                aria-label={`Ebene ${e.name} entfernen`}
                onClick={(x) => {
                  x.stopPropagation();
                  void loeschen(e.id, e.name);
                }}
              >
                <Symbol name="muell" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="muted small-text">
        Jede Ebene ist eine ebene Fläche im Foto (Fassade, Wand, Boden, abfotografierter Plan) mit eigener Referenz und eigenen Messungen.
      </p>
    </section>
  );
}
