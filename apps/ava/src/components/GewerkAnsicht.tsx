import { useEffect, useState } from 'react';
import { bestaetigen, frageText, meldung } from '@core/ui/Rueckfrage';
import { leeresLv, neuNummerieren } from '../lv/modell';
import { ASLV_NICHT_GESPEICHERT, aslvVerluste } from '../format/aslv';
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
import { GaebExportDialog, gaebWaehlen } from './lv/Gaeb';
import { LvKopfDialog } from './lv/LvKopfDialog';
import { LvDruck } from './lv/LvDruck';
import { MenueKnopf } from './Menue';

/** `kurz`: Beschriftung bei schmalem Fenster; `kopf`: der LV-Kopf (Auswahl, Neues LV, LV-Befehle, Speichern) gehört dazu */
const TABS: { id: GewerkTab; text: string; kurz: string; title: string; lv?: boolean; kopf?: boolean }[] = [
  { id: 'lv', text: 'Leistungsverzeichnis', kurz: 'LV', title: 'Gliederung, Positionen, Texte, Mengen', lv: true, kopf: true },
  { id: 'angebote', text: 'Angebote & Preisspiegel', kurz: 'Angebote', title: 'Bieter, Preise erfassen, Preisspiegel, Rangfolge', lv: true, kopf: true },
  { id: 'auftrag', text: 'Auftrag & Nachträge', kurz: 'Auftrag', title: 'Vergabe, Auftragssumme, Nachträge, Übernahme in die Kostenkontrolle', kopf: true },
  { id: 'rechnungen', text: 'Rechnungen', kurz: 'Rechnungen', title: 'Rechnungen dieses Gewerks aus allen Quellen, neue Rechnung prüfen' },
  { id: 'dateien', text: 'Dateien & Korrespondenz', kurz: 'Dateien', title: 'Auftrag, Nachträge, Schriftverkehr, Mails' },
];

export function GewerkAnsicht({ gewerk, tab }: { gewerk: string; tab: GewerkTab }) {
  const projekt = useAva((s) => s.projekt)!;
  const lv = useAva((s) => s.lv);
  const einstellungen = useAva((s) => s.einstellungen);
  const g = gewerkOrdner(projekt, gewerk);
  const lvs = g ? g.lvs : [];
  const aktuelle = g ? aktuelleLvs(g) : [];
  const [fehler, setFehler] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'kopf' | 'druck' | 'gaeb' | null>(null);
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

  const ausGaeb = async () => {
    if (!(await lvWeiter())) return;
    try {
      const r = await gaebWaehlen(g ? vollerPfad(projekt.ordner, g.pfad) : projekt.ordner);
      if (!r) return;
      // Grund-, Wahl- oder Zulagepositionen o. Ä. hält die .aslv nicht: dann im eigenen Format anlegen (nach Rückfrage)
      let format = einstellungen.lv.neuesFormat;
      const verluste = format === 'aslv' ? aslvVerluste(leeresLv(''), r.g.lv) : [];
      if (verluste.length) {
        if (!(await bestaetigen('Als eigene LV-Datei anlegen?', `Die GAEB-Datei enthält Angaben, die eine LV-Datei (.aslv) nicht speichern kann: ${verluste.map((v) => ASLV_NICHT_GESPEICHERT[v]).join(', ')}. Als .aslv würden sie verloren gehen und Summen könnten sich ändern. Stattdessen als eigene LV-Datei (.oalv) anlegen?`, 'Als .oalv anlegen'))) return;
        format = 'oalv';
      }
      const bez = await frageText('LV aus GAEB anlegen', r.g.lv.kopf.bezeichnung || `${gewerkZweistellig(gewerk)} ${name}`, 'Anlegen', `${r.name} (X${r.g.dp}): ${r.g.lv.elemente.length} Element(e) auf oberster Ebene. Wird als ${format === 'aslv' ? 'LV-Datei (.aslv)' : 'eigene LV-Datei (.oalv)'} angelegt.`);
      if (!bez) return;
      await useAva.getState().lvNeu(g, gewerk, format, bez, r.g.lv);
    } catch (e) {
      await meldung('GAEB-Import fehlgeschlagen', String(e instanceof Error ? e.message : e), e);
    }
  };

  const offenesLv = lv?.gewerk === gewerk ? lv : null;
  const t = TABS.find((x) => x.id === tab) ?? TABS[0];
  const zeigeTab = (id: GewerkTab) => useAva.getState().setAnsicht({ art: 'gewerk', gewerk, tab: id });

  const nummerieren = async () => {
    if (!offenesLv) return;
    const schritt = offenesLv.lv.ozMaske.position.schritt;
    if (!(await bestaetigen('Neu nummerieren?', `Alle Abschnitte und Positionen bekommen fortlaufende Ordnungszahlen nach der OZ-Maske (Positionen in Schritten von ${schritt}). Nach dem Versand an die Bieter nicht mehr empfehlenswert.`, 'Neu nummerieren'))) return;
    useAva.getState().lvAendern((l) => ({ ...l, elemente: neuNummerieren(l.elemente, l.ozMaske) }));
  };

  /** Tabs mit ←/→, Pos1 und Ende wechseln (Fokus wandert mit) */
  const tabTasten = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((x) => x.id === t.id);
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const ziel = TABS[(n + TABS.length) % TABS.length];
    zeigeTab(ziel.id);
    requestAnimationFrame(() => document.getElementById(`ava-tab-${ziel.id}`)?.focus());
  };

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
        {t.kopf && (
          <div className="ava-lv-wahl">
            {lvs.length > 0 && (
              <select
                value={offenesLv?.datei.pfad ?? ''}
                onChange={(e) => void wechsle(lvs.find((l) => l.pfad === e.target.value)!)}
                title={offenesLv ? `${offenesLv.datei.pfad} – ${offenesLv.format === 'aslv' ? 'LV-Datei (.aslv)' : 'eigene LV-Datei (.oalv)'}` : 'LV-Datei dieses Gewerks'}
                aria-label="LV-Datei"
              >
                {!offenesLv && <option value="">LV wählen …</option>}
                {lvs.map((l) => (
                  <option key={l.pfad} value={l.pfad}>
                    {l.name}
                    {l.archiv ? ' (Archiv)' : ''}
                  </option>
                ))}
              </select>
            )}
            {offenesLv?.datei.archiv && (
              <span className="ava-chip" title="Diese LV-Datei liegt in einem Archivordner">
                Archiv
              </span>
            )}
            <MenueKnopf
              text="Neues LV"
              title="Neues LV in diesem Gewerk anlegen – leer oder aus einer GAEB-Datei"
              rechts
              punkte={[
                { text: 'Leeres LV …', title: 'Neues, leeres LV in diesem Gewerk anlegen', aktion: () => void neu() },
                { text: 'Aus GAEB-Datei (X81–X86) …', title: 'LV aus einer GAEB-Datei als neue LV-Datei in diesem Gewerk anlegen', aktion: () => void ausGaeb() },
              ]}
            />
            {offenesLv && (
              <MenueKnopf
                text="LV"
                title="Befehle für das ganze LV"
                rechts
                punkte={[
                  { text: 'LV-Eigenschaften …', title: 'Bezeichnung, Termine, Vergabeart, Projekt, Auftraggeber, OZ-Maske, Umsatzsteuer', aktion: () => setDialog('kopf') },
                  { text: 'Neu nummerieren …', title: 'Ordnungszahlen nach der OZ-Maske neu vergeben', aktion: () => void nummerieren() },
                  { text: 'Drucken …', title: 'Leistungsbeschreibung mit Leistungsverzeichnis drucken bzw. als PDF', aktion: () => setDialog('druck') },
                  { text: 'GAEB-Export …', title: 'Als GAEB DA XML für die Bieter bzw. andere AVA-Software (X81, X83, X84, X86)', aktion: () => setDialog('gaeb') },
                ]}
              />
            )}
            {offenesLv && (
              <button className={`ava-speichern${lvGeaendert(offenesLv) ? ' primary' : ''}`} onClick={() => void lvSpeichernMitMeldung()} disabled={!lvGeaendert(offenesLv)} title="LV speichern (Strg+S)">
                Speichern
              </button>
            )}
          </div>
        )}
      </div>
      <div className="ava-tabs" role="tablist" aria-label="Bereiche des Gewerks" onKeyDown={tabTasten}>
        {TABS.map((x) => (
          <button
            key={x.id}
            id={`ava-tab-${x.id}`}
            role="tab"
            aria-label={x.text}
            aria-selected={x.id === t.id}
            aria-controls="ava-gewerk-inhalt"
            tabIndex={x.id === t.id ? 0 : -1}
            className={x.id === t.id ? 'active' : ''}
            title={x.title}
            onClick={() => zeigeTab(x.id)}
          >
            <span className="ava-tab-lang">{x.text}</span>
            <span className="ava-tab-kurz" aria-hidden="true">
              {x.kurz}
            </span>
          </button>
        ))}
      </div>
      {fehler && <div className="warning">{fehler}</div>}
      <div className="ava-gewerk-inhalt" id="ava-gewerk-inhalt" role="tabpanel" aria-labelledby={`ava-tab-${t.id}`}>
        {t.lv && !offenesLv ? (
          <div className="ava-leer-hinweis">
            {lvs.length ? 'LV wählen …' : 'In diesem Gewerk gibt es noch kein Leistungsverzeichnis.'}
            <div className="button-row">
              <button className="primary" onClick={() => void neu()}>
                Neues LV anlegen …
              </button>
              <button onClick={() => void ausGaeb()}>LV aus GAEB-Datei …</button>
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
      {offenesLv && dialog === 'kopf' && <LvKopfDialog onClose={() => setDialog(null)} />}
      {offenesLv && dialog === 'druck' && <LvDruck onClose={() => setDialog(null)} />}
      {offenesLv && dialog === 'gaeb' && <GaebExportDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
