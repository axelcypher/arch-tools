import { useEffect, useState } from 'react';
import { frageText, meldung } from '@core/ui/Rueckfrage';
import { gewerkZweistellig } from '../abrechnung/gewerk';
import { vollerPfad } from '../dateien';
import type { LvDatei } from '../projekt';
import { aktuelleLvs } from '../projekt';
import type { GewerkTab } from '../store';
import { gewerkOrdner, lvGeaendert, useAva } from '../store';
import { lvSpeichernMitMeldung, lvWeiter } from '../App';
import { LvEditor } from './lv/LvEditor';
import { Angebote } from './lv/Angebote';
import { AuftragAnsicht } from './lv/Auftrag';
import { RechnungenAnsicht } from './abrechnung/RechnungenAnsicht';
import { Dateiliste } from './Dateiliste';

const TABS: { id: GewerkTab; text: string; title: string; lv?: boolean }[] = [
  { id: 'lv', text: 'Leistungsverzeichnis', title: 'Gliederung, Positionen, Texte, Mengen', lv: true },
  { id: 'angebote', text: 'Angebote & Preisspiegel', title: 'Bieter, Preise erfassen, Preisspiegel, Rangfolge', lv: true },
  { id: 'auftrag', text: 'Auftrag & Nachträge', title: 'Vergabe, Auftragssumme, Nachträge, Übernahme in die Kostenkontrolle' },
  { id: 'rechnungen', text: 'Rechnungen', title: 'Rechnungen dieses Gewerks aus allen Quellen, neue Rechnung prüfen' },
  { id: 'dateien', text: 'Dateien & Korrespondenz', title: 'Auftrag, Nachträge, Schriftverkehr, Mails' },
];

export function GewerkAnsicht({ gewerk, tab }: { gewerk: string; tab: GewerkTab }) {
  const projekt = useAva((s) => s.projekt)!;
  const lv = useAva((s) => s.lv);
  const einstellungen = useAva((s) => s.einstellungen);
  const g = gewerkOrdner(projekt, gewerk);
  const lvs = g ? g.lvs : [];
  const aktuelle = g ? aktuelleLvs(g) : [];
  const [fehler, setFehler] = useState<string | null>(null);
  const blatt = projekt.kk?.kk.gewerke.find((x) => x.gewerk === gewerk);
  const name = g?.name || blatt?.bezeichnung || '';

  // beim Betreten das aktuellste LV öffnen
  useEffect(() => {
    if (lv?.gewerk === gewerk || !aktuelle.length) return;
    void useAva
      .getState()
      .lvOeffnen(gewerk, aktuelle[0])
      .then(() => setFehler(null))
      .catch((e) => setFehler(`${aktuelle[0].name}: ${e instanceof Error ? e.message : String(e)}`));
  }, [gewerk, aktuelle.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const wechsle = async (d: LvDatei) => {
    if (d.pfad === lv?.datei.pfad) return;
    if (!(await lvWeiter())) return;
    try {
      await useAva.getState().lvOeffnen(gewerk, d);
      setFehler(null);
    } catch (e) {
      setFehler(`${d.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const neu = async () => {
    if (!(await lvWeiter())) return;
    const bez = await frageText('Neues Leistungsverzeichnis', `${gewerkZweistellig(gewerk)} ${name}`.trim(), 'Anlegen', `Wird im Gewerkeordner als ${einstellungen.lv.neuesFormat === 'aslv' ? 'LV-Datei (.aslv)' : 'eigene LV-Datei (.oalv)'} angelegt.`);
    if (!bez) return;
    try {
      await useAva.getState().lvNeu(g, gewerk, einstellungen.lv.neuesFormat, bez);
    } catch (e) {
      await meldung('LV ließ sich nicht anlegen', String(e instanceof Error ? e.message : e), e);
    }
  };

  const offenesLv = lv?.gewerk === gewerk ? lv : null;
  const t = TABS.find((x) => x.id === tab) ?? TABS[0];

  return (
    <div className="ava-gewerk">
      <div className="ava-gewerk-kopf">
        <div>
          <h1>
            <span className="ava-kennung">{gewerkZweistellig(gewerk)}</span> {name}
          </h1>
          <div className="muted small-text">
            {[blatt?.auftragnehmer && `Auftragnehmer: ${blatt.auftragnehmer}`, g ? g.pfad : 'Kein Gewerkeordner im Projekt'].filter(Boolean).join(' · ')}
            {g && (
              <button className="small ava-link" onClick={() => void useAva.getState().fs.oeffnen(vollerPfad(projekt.ordner, g.pfad)).catch((e) => meldung('Ordner ließ sich nicht öffnen', g.pfad, e))}>
                Ordner öffnen
              </button>
            )}
          </div>
        </div>
        <div className="ava-lv-wahl">
          {lvs.length > 0 && (
            <select value={offenesLv?.datei.pfad ?? ''} onChange={(e) => void wechsle(lvs.find((l) => l.pfad === e.target.value)!)} title="LV-Datei dieses Gewerks">
              {!offenesLv && <option value="">LV wählen …</option>}
              {lvs.map((l) => (
                <option key={l.pfad} value={l.pfad}>
                  {l.name}
                  {l.archiv ? ' (Archiv)' : ''}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => void neu()} title="Neues LV in diesem Gewerk anlegen">
            Neues LV …
          </button>
          {offenesLv && (
            <button className={lvGeaendert(offenesLv) ? 'primary' : ''} onClick={() => void lvSpeichernMitMeldung()} disabled={!lvGeaendert(offenesLv)} title="LV speichern (Strg+S)">
              Speichern
            </button>
          )}
        </div>
      </div>
      <div className="ava-tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === t.id} className={x.id === t.id ? 'active' : ''} title={x.title} onClick={() => useAva.getState().setAnsicht({ art: 'gewerk', gewerk, tab: x.id })}>
            {x.text}
          </button>
        ))}
        {offenesLv && (
          <span className="ava-tab-info muted small-text" title={offenesLv.datei.pfad}>
            {offenesLv.format === 'aslv' ? 'LV-Datei (.aslv)' : 'eigene LV-Datei (.oalv)'}
            {offenesLv.datei.archiv ? ' · Archiv' : ''}
          </span>
        )}
      </div>
      {fehler && <div className="warning">{fehler}</div>}
      <div className="ava-gewerk-inhalt">
        {t.lv && !offenesLv ? (
          <div className="ava-leer-hinweis">
            {lvs.length ? 'LV wählen …' : 'In diesem Gewerk gibt es noch kein Leistungsverzeichnis.'}
            <div className="button-row">
              <button className="primary" onClick={() => void neu()}>
                Neues LV anlegen …
              </button>
            </div>
          </div>
        ) : t.id === 'lv' ? (
          <LvEditor />
        ) : t.id === 'angebote' ? (
          <Angebote />
        ) : t.id === 'auftrag' ? (
          <AuftragAnsicht gewerk={gewerk} />
        ) : t.id === 'rechnungen' ? (
          <RechnungenAnsicht gewerk={gewerk} />
        ) : (
          <Dateiliste gewerk={gewerk} />
        )}
      </div>
    </div>
  );
}
