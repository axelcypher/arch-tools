import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../ui/Dialog';
import { KERN_BEISPIELDATEN, KERN_THEMEN } from './kern';
import type { HinweisArt } from './pruefung';
import { HINWEISARTEN } from './pruefung';
import type { Thema } from './kern';
import type { Art, Beispiel, EinzelwertGruppe, Feld, PlatzhalterSchema, Sammlung } from './schema';
import { ARTEN, NUTZBAR, ORTE, passt, sammlungen } from './schema';

/**
 * Platzhalter-Referenz im Excel-Dialog: durchsuchbar, links die Gruppen (Syntax, Einzelwerte, Sammlungen, benannter
 * Einzelzugriff), rechts der Eintrag mit Art, „Wo nutzbar“, Feldern, Filtern, „Enthält“ und Beispielen samt Ergebnis.
 * Platzhalter lassen sich in die Zwischenablage kopieren. Layout wie das Nachschlagewerk (.nachschlagewerk, .nw-*).
 */

type Eintrag =
  | { id: string; gruppe: 'syntax'; titel: string; thema: Thema }
  | { id: string; gruppe: 'einzelwerte'; titel: string; abschnitt: EinzelwertGruppe }
  | { id: string; gruppe: 'sammlungen'; titel: string; abschnitt: Sammlung }
  | { id: string; gruppe: 'zugriff'; titel: string; abschnitt: Sammlung };

const GRUPPEN: { id: Eintrag['gruppe']; titel: string }[] = [
  { id: 'syntax', titel: 'Syntax (alle Apps)' },
  { id: 'einzelwerte', titel: 'Einzelwerte' },
  { id: 'sammlungen', titel: 'Sammlungen (Datensätze)' },
  { id: 'zugriff', titel: 'Benannter Einzelzugriff' },
];

function eintraege(schema: PlatzhalterSchema): Eintrag[] {
  return [
    ...KERN_THEMEN.map((t): Eintrag => ({ id: `syntax:${t.id}`, gruppe: 'syntax', titel: t.titel, thema: t })),
    ...schema.abschnitte.flatMap((a): Eintrag[] => (a.art === 'einzelwerte' ? [{ id: `einzelwerte:${a.id}`, gruppe: 'einzelwerte', titel: a.titel, abschnitt: a }] : [])),
    ...sammlungen(schema).map((s): Eintrag => ({ id: `sammlung:${s.name}`, gruppe: 'sammlungen', titel: `${s.name} – ${s.titel}`, abschnitt: s })),
    ...sammlungen(schema)
      .filter((s) => s.zugriff)
      .map((s): Eintrag => ({ id: `zugriff:${s.name}`, gruppe: 'zugriff', titel: `${s.name}:NAME.feld – ${s.titel}`, abschnitt: s })),
  ];
}

const beispielText = (b: Beispiel[] = []) => b.flatMap((x) => [x.titel, x.text, ...x.vorlage.flat().map((v) => v ?? '')]);

/** Suchtext eines Eintrags */
function suchtext(e: Eintrag): (string | undefined)[] {
  if (e.gruppe === 'syntax') return [e.titel, ...e.thema.absaetze, ...(e.thema.tabelle?.flat() ?? []), ...beispielText(e.thema.beispiele)];
  if (e.gruppe === 'einzelwerte') return [e.titel, e.abschnitt.text, ...e.abschnitt.werte.flatMap((w) => [w.schluessel, w.text]), ...beispielText(e.abschnitt.beispiele)];
  const s = e.abschnitt;
  return [
    e.titel,
    s.text,
    e.gruppe === 'zugriff' ? `${s.name}:` : undefined,
    ...s.felder.flatMap((f) => [`${s.name}.${f.name}`, f.text]),
    ...s.filter.flatMap((f) => [f.name, ...(f.aliase ?? []), f.text]),
    ...s.enthaelt.flatMap((x) => [x.sammlung, x.text]),
    ...(s.hinweise ?? []),
    ...beispielText(s.beispiele),
  ];
}

/** Text mit {{…}} als Code */
function MitCode({ text }: { text: string }) {
  const teile = text.split(/(\{\{[^{}]*\}\})/);
  return <>{teile.map((t, i) => (i % 2 ? <code key={i}>{t}</code> : t))}</>;
}

function Kopieren({ text, onKopiert }: { text: string; onKopiert: (t: string) => void }) {
  return (
    <button
      type="button"
      className="small"
      aria-label={`${text} kopieren`}
      title={`${text} in die Zwischenablage kopieren`}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => onKopiert(text),
          () => onKopiert(''),
        );
      }}
    >
      Kopieren
    </button>
  );
}

function Nutzbar({ art }: { art: Art }) {
  const n = NUTZBAR[art];
  return (
    <table className="summary-table ph-tabelle">
      <caption className="ph-titel">Wo nutzbar</caption>
      <tbody>
        {ORTE.filter((o) => o.id !== 'wiederholung' || art === 'sammlung').map((o) => (
          <tr key={o.id}>
            <th scope="row" title={o.text}>
              <MitCode text={o.label} />
            </th>
            <td>{n[o.id] ? (o.id === 'zelle' && art === 'sammlung' ? 'ja – die Zeile wird je Datensatz wiederholt' : 'ja') : 'nein'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tabelle({ kopf, zeilen, titel }: { kopf: string[]; zeilen: ReactNode[][]; titel?: string }) {
  return (
    <table className="summary-table ph-tabelle">
      {titel && <caption className="ph-titel">{titel}</caption>}
      <thead>
        <tr>
          {kopf.map((k, i) => (
            <th key={i} scope="col">
              {k}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {zeilen.map((z, i) => (
          <tr key={i}>
            {z.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const spalte = (i: number) => String.fromCharCode(65 + i);

function BeispielAnsicht({ b, onKopiert }: { b: Beispiel; onKopiert: (t: string) => void }) {
  const breite = Math.max(1, ...b.vorlage.map((z) => z.length), ...b.ergebnis.map((z) => z.length));
  const kopf = ['', ...Array.from({ length: breite }, (_, i) => spalte(i))];
  const zelle = (v: string | number | null | undefined, vorlage: boolean) =>
    v === null || v === undefined || v === '' ? (
      ''
    ) : typeof v === 'number' ? (
      v.toLocaleString('de-DE', { maximumFractionDigits: 6 })
    ) : vorlage || v.startsWith('=') || v.includes('{{') ? (
      <code>{v}</code>
    ) : (
      v
    );
  const tsv = b.vorlage.map((z) => z.map((v) => v ?? '').join('\t')).join('\n');
  return (
    <section className="ph-beispiel" aria-label={`Beispiel: ${b.titel}`}>
      <h4>
        Beispiel: {b.titel} <Kopieren text={tsv} onKopiert={() => onKopiert(`Vorlage „${b.titel}“`)} />
      </h4>
      {b.text && (
        <p className="small-text">
          <MitCode text={b.text} />
        </p>
      )}
      {!!b.pruefung?.length && <p className="small-text">Die Vorlagenprüfung meldet hier: {b.pruefung.map((a) => HINWEISARTEN[a as HinweisArt] ?? a).join('; ')}.</p>}
      <Tabelle titel="Vorlage" kopf={kopf} zeilen={b.vorlage.map((z, r) => [String(r + 1), ...Array.from({ length: breite }, (_, i) => zelle(z[i], true))])} />
      <Tabelle
        titel="Ergebnis mit den Beispieldaten"
        kopf={kopf}
        zeilen={b.ergebnis.length ? b.ergebnis.map((z, r) => [String(r + 1), ...Array.from({ length: breite }, (_, i) => zelle(z[i], false))]) : [['', 'keine Zeile']]}
      />
    </section>
  );
}

function Werte({ zeilen, onKopiert }: { zeilen: { ph: string; text: string; einheit?: string }[]; onKopiert: (t: string) => void }) {
  return (
    <Tabelle
      kopf={['Platzhalter', 'Bedeutung', 'Einheit', '']}
      zeilen={zeilen.map((z) => [<code key="c">{z.ph}</code>, <MitCode key="t" text={z.text} />, z.einheit ?? '', <Kopieren key="k" text={z.ph} onKopiert={onKopiert} />])}
    />
  );
}

/** Felder, gefiltert auf die Suche, wenn sie nur einige trifft */
function gefiltert<T>(liste: T[], q: string, text: (x: T) => (string | undefined)[]): { liste: T[]; teil: boolean } {
  if (!q.trim()) return { liste, teil: false };
  const t = liste.filter((x) => passt(q, ...text(x)));
  return t.length && t.length < liste.length ? { liste: t, teil: true } : { liste, teil: false };
}

function Ansicht({ e, q, onKopiert, schema }: { e: Eintrag; q: string; onKopiert: (t: string) => void; schema: PlatzhalterSchema }) {
  if (e.gruppe === 'syntax') {
    const t = e.thema;
    return (
      <article>
        <h3>{t.titel}</h3>
        {t.absaetze.map((a, i) => (
          <p key={i}>
            <MitCode text={a} />
          </p>
        ))}
        {t.tabelle && <Tabelle kopf={t.tabelle[0]} zeilen={t.tabelle.slice(1).map((z) => z.map((c, i) => <MitCode key={i} text={c} />))} />}
        {(t.beispiele ?? []).map((b) => (
          <BeispielAnsicht key={b.titel} b={b} onKopiert={onKopiert} />
        ))}
      </article>
    );
  }
  if (e.gruppe === 'einzelwerte') {
    const a = e.abschnitt;
    const { liste, teil } = gefiltert(a.werte, q, (w) => [w.schluessel, w.text]);
    return (
      <article>
        <h3>{a.titel}</h3>
        <p className="regel-kurz">
          {ARTEN.einzelwert.label}e – <MitCode text={ARTEN.einzelwert.text} />. Keine Filter.
        </p>
        {a.text && (
          <p>
            <MitCode text={a.text} />
          </p>
        )}
        <Nutzbar art="einzelwert" />
        {a.tabelle && <Tabelle kopf={a.tabelle[0]} zeilen={a.tabelle.slice(1).map((z) => z.map((c, i) => <MitCode key={i} text={c} />))} />}
        {teil && <p className="small-text muted">{`${liste.length} von ${a.werte.length} Werten passen zur Suche.`}</p>}
        <Werte zeilen={liste.map((w) => ({ ph: `{{${w.schluessel}}}`, text: w.text, einheit: w.einheit }))} onKopiert={onKopiert} />
        {(a.beispiele ?? []).map((b) => (
          <BeispielAnsicht key={b.titel} b={b} onKopiert={onKopiert} />
        ))}
      </article>
    );
  }
  const s = e.abschnitt;
  const titel = (n: string) => sammlungen(schema).find((x) => x.name === n)?.titel ?? n;
  const { liste, teil } = gefiltert<Feld>(s.felder, q, (f) => [`${s.name}.${f.name}`, f.text]);
  if (e.gruppe === 'zugriff') {
    const z = s.zugriff!;
    return (
      <article>
        <h3>
          <code>{`{{${s.name}:NAME.feld}}`}</code> – {s.titel}
        </h3>
        <p className="regel-kurz">
          {ARTEN.zugriff.label} – <MitCode text={z.text} /> Beispiel: <code>{z.beispiel}</code>
        </p>
        <p>
          NAME ist der Wert von <code>{`${s.name}.${z.ueber}`}</code>. Ein unbekannter Name oder ein unbekanntes Feld ergibt eine leere Zelle. Filter wirken hier nicht.
        </p>
        <Nutzbar art="zugriff" />
        {teil && <p className="small-text muted">{`${liste.length} von ${s.felder.length} Feldern passen zur Suche.`}</p>}
        <Werte zeilen={liste.map((f) => ({ ph: `{{${s.name}:NAME.${f.name}}}`, text: f.text, einheit: f.einheit }))} onKopiert={onKopiert} />
      </article>
    );
  }
  return (
    <article>
      <h3>
        <code>{s.name}</code> – {s.titel}
      </h3>
      <p className="regel-kurz">
        {ARTEN.sammlung.label}, Zeile {s.datensatz}. <MitCode text={s.text} />
      </p>
      <Nutzbar art="sammlung" />
      <h4>Enthält</h4>
      {s.enthaelt.length ? (
        <>
          <p className="small-text">
            Im Block <code>{`{{#${s.name}}} … {{/${s.name}}}`}</code> auf den aktuellen Datensatz eingeschränkt:
          </p>
          <ul>
            {s.enthaelt.map((x) => (
              <li key={x.sammlung}>
                <code>{x.sammlung}</code> ({titel(x.sammlung)}): <MitCode text={x.text} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="small-text">
          Keine Unterpunkte – im Block <code>{`{{#${s.name}}}`}</code> laufen andere Sammlungen über alle Datensätze.
        </p>
      )}
      {!!s.nichtEingeschraenkt?.length && (
        <>
          <p className="small-text">Nicht eingeschränkt (laufen im Block über alle Datensätze):</p>
          <ul>
            {s.nichtEingeschraenkt.map((x) => (
              <li key={x.sammlung}>
                <code>{x.sammlung}</code>: <MitCode text={x.text} />
              </li>
            ))}
          </ul>
        </>
      )}
      <h4>Felder</h4>
      {s.tabelle && <Tabelle kopf={s.tabelle[0]} zeilen={s.tabelle.slice(1).map((z) => z.map((c, i) => <MitCode key={i} text={c} />))} />}
      {teil && <p className="small-text muted">{`${liste.length} von ${s.felder.length} Feldern passen zur Suche.`}</p>}
      <Werte zeilen={liste.map((f) => ({ ph: `{{${s.name}.${f.name}}}`, text: f.text, einheit: f.einheit }))} onKopiert={onKopiert} />
      <h4>Filter</h4>
      {s.filter.length ? (
        <Tabelle
          kopf={['Benannter Filter', 'Bedeutung', '']}
          zeilen={s.filter.map((f) => [
            <span key="n">
              {[f.name, ...(f.aliase ?? [])].map((n, i) => (
                <span key={n}>
                  {i > 0 && ', '}
                  <code>{`[${n}]`}</code>
                </span>
              ))}
            </span>,
            <MitCode key="t" text={f.text} />,
            <Kopieren key="k" text={`{{${s.name}[${f.name}].${s.felder[0].name}}}`} onKopiert={onKopiert} />,
          ])}
        />
      ) : (
        <p className="small-text">Keine benannten Filter.</p>
      )}
      <p className="small-text">
        Allgemeine Filter gehen mit jedem Feld: <code>{`{{${s.name}[${s.felder[0].name}=…].${s.felder[0].name}}}`}</code>, Vergleiche <code>!= &gt; &lt; &gt;= &lt;=</code>, Verneinung{' '}
        <code>[!filter]</code>, mehrere mit Komma (alle müssen zutreffen).
      </p>
      {s.zugriff && (
        <p className="small-text">
          Benannter Einzelzugriff: <code>{s.zugriff.beispiel}</code> – <MitCode text={s.zugriff.text} />
        </p>
      )}
      {!!s.hinweise?.length && (
        <>
          <h4>Hinweise</h4>
          <ul>
            {s.hinweise.map((h) => (
              <li key={h}>
                <MitCode text={h} />
              </li>
            ))}
          </ul>
        </>
      )}
      {s.beispiele.map((b) => (
        <BeispielAnsicht key={b.titel} b={b} onKopiert={onKopiert} />
      ))}
    </article>
  );
}

/** Dialog „Platzhalter-Referenz“ einer App */
export function PlatzhalterReferenz({ schema, onClose }: { schema: PlatzhalterSchema; onClose: () => void }) {
  const alle = useMemo(() => eintraege(schema), [schema]);
  const [q, setQ] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string>(alle[0].id);
  const [meldung, setMeldung] = useState('');
  const suchfeld = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLElement>(null);
  const text = useRef<HTMLDivElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => suchfeld.current?.focus());
  }, []);
  const treffer = useMemo(() => alle.filter((e) => passt(q, ...suchtext(e))), [alle, q]);
  const aktiv = treffer.find((e) => e.id === gewaehlt) ?? treffer[0];
  const waehlen = (id: string) => {
    setGewaehlt(id);
    text.current?.scrollTo?.({ top: 0 });
  };
  // ↑/↓ wechseln den Eintrag in der Liste (Pos1/Ende: erster/letzter)
  const pfeile = (ev: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key) || !treffer.length) return;
    ev.preventDefault();
    const i = Math.max(
      0,
      treffer.findIndex((e) => e.id === aktiv?.id),
    );
    const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? treffer.length - 1 : Math.min(treffer.length - 1, Math.max(0, i + (ev.key === 'ArrowDown' ? 1 : -1)));
    waehlen(treffer[n].id);
    requestAnimationFrame(() => liste.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(treffer[n].id)}"]`)?.focus());
  };
  const kopiert = (t: string) => setMeldung(t ? `Kopiert: ${t}` : 'Kopieren nicht möglich – bitte von Hand markieren.');

  return (
    <Modal titel={`Platzhalter-Referenz ${schema.app}`} kopf className="nachschlagewerk ph-referenz" onClose={onClose}>
      <div className="nw-kopf">
        <input
          ref={suchfeld}
          className="nw-suche"
          type="search"
          aria-label="Platzhalter durchsuchen"
          aria-controls="ph-referenz-liste"
          placeholder="Suchen, z. B. wofl, Filter, Block, Kopfzeile …"
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          onKeyDown={(ev) => ev.key === 'ArrowDown' && treffer.length && (ev.preventDefault(), liste.current?.querySelector<HTMLElement>('.nw-eintrag.active, .nw-eintrag')?.focus())}
        />
      </div>
      <div className="nw-inhalt">
        <nav className="nw-liste" id="ph-referenz-liste" ref={liste} aria-label="Einträge" onKeyDown={pfeile}>
          {treffer.length === 0 && <p className="muted small-text">Nichts gefunden.</p>}
          {GRUPPEN.map((g) => {
            const l = treffer.filter((e) => e.gruppe === g.id);
            if (!l.length) return null;
            return (
              <div key={g.id} className="nw-gruppe" role="group" aria-label={g.titel}>
                <div className="nw-gruppe-titel">{g.titel}</div>
                {l.map((e) => (
                  <button
                    type="button"
                    key={e.id}
                    data-id={e.id}
                    className={e.id === aktiv?.id ? 'nw-eintrag active' : 'nw-eintrag'}
                    aria-current={e.id === aktiv?.id ? 'true' : undefined}
                    onClick={() => waehlen(e.id)}
                  >
                    {e.titel}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="nw-text" ref={text} tabIndex={0} aria-label="Eintrag">
          {aktiv ? <Ansicht e={aktiv} q={q} onKopiert={kopiert} schema={schema} /> : null}
        </div>
      </div>
      <div className="dialog-buttons nw-fuss">
        <p className="muted small-text" role="status">
          {meldung || (aktiv?.gruppe === 'syntax' ? KERN_BEISPIELDATEN : schema.beispieldaten)}
        </p>
        <button type="button" className="primary" onClick={onClose}>
          Schließen
        </button>
      </div>
    </Modal>
  );
}
