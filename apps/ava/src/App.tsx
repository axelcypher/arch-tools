import { useEffect, useState } from 'react';
import { APP_NAMEN } from '@core/appNamen';
import { isTauri } from '@core/platform/files';
import { logger } from '@core/platform/log';
import { projektdateiSchreiben } from '@core/platform/projektordner';
import { vorDemSchliessen } from '@core/platform/rahmen';
import { dialogOffen, eingabeAbschliessen, istEingabeZiel } from '@core/platform/eingabe';
import { LogDialog } from '@core/ui/LogDialog';
import { ProjektEinstieg, ProjektWahl } from '@core/ui/ProjektWahl';
import { aenderungenSpeichern, bestaetigen, meldung } from '@core/ui/Rueckfrage';
import { ASLV_NICHT_GESPEICHERT, aslvVerluste } from './format/aslv';
import { TitleBar } from '@core/ui/TitleBar';
import { Navigation } from './components/Navigation';
import { Uebersicht } from './components/Uebersicht';
import { GewerkAnsicht } from './components/GewerkAnsicht';
import { RechnungenAnsicht } from './components/abrechnung/RechnungenAnsicht';
import { Eingang } from './components/abrechnung/Eingang';
import { EinstellungenModal } from './components/Einstellungen';
import { Bautagebuch } from './components/bauleitung/Bautagebuch';
import { Protokolle } from './components/bauleitung/Protokolle';
import { Maengel } from './components/bauleitung/Maengel';
import { Notizen } from './components/bauleitung/Notizen';
import { Beteiligte } from './components/bauleitung/Beteiligte';
import { Mailverlauf } from './components/bauleitung/Mailverlauf';
import { ausstehendesSchreibenAbwarten, lvGeaendert, schreibend, useAva } from './store';

const log = logger('app');

/** relativer Pfad einer Datei unter einem Ordner („/“ getrennt) */
function relativ(datei: string, ordner: string): string {
  const d = datei.replace(/\\/g, '/');
  const o = ordner.replace(/\\/g, '/').replace(/\/+$/, '');
  return d.toLowerCase().startsWith(`${o.toLowerCase()}/`) ? d.slice(o.length + 1) : d.split('/').pop()!;
}

/** ungespeicherte Änderungen am LV vorher speichern, verwerfen oder abbrechen */
export async function lvWeiter(): Promise<boolean> {
  eingabeAbschliessen();
  const { lv } = useAva.getState();
  if (!lvGeaendert(lv)) return true;
  return aenderungenSpeichern(lv!.datei.name, () => lvSpeichernMitMeldung());
}

export async function lvSpeichernMitMeldung(): Promise<boolean> {
  // laufende Eingabe (Langtext, Zahl- oder Textfeld) zuerst übernehmen – sonst fehlt sie in der Datei
  eingabeAbschliessen();
  // .aslv kann manche Angaben nicht halten: vor dem Schreiben sagen, was verloren ginge
  const offen = useAva.getState().lv;
  if (offen?.format === 'aslv') {
    const verluste = aslvVerluste(offen.basis, offen.lv);
    if (
      verluste.length &&
      !(await bestaetigen(
        'Angaben gehen verloren',
        `Eine LV-Datei (.aslv) kann folgende geänderte Angaben nicht speichern: ${verluste.map((v) => ASLV_NICHT_GESPEICHERT[v]).join(', ')}. Sie fehlen nach dem nächsten Öffnen. Trotzdem speichern?`,
        'Trotzdem speichern',
      ))
    )
      return false;
  }
  try {
    return await useAva.getState().lvSpeichern();
  } catch (e) {
    log.error('LV speichern fehlgeschlagen', e);
    await meldung('Speichern fehlgeschlagen', 'Das LV ließ sich nicht speichern. Die Änderungen bleiben in der App erhalten.', e);
    return false;
  }
}

export function App() {
  const projekt = useAva((s) => s.projekt);
  const lv = useAva((s) => s.lv);
  const ansicht = useAva((s) => s.ansicht);
  const busy = useAva((s) => s.busy);
  const einstellungenOffen = useAva((s) => s.einstellungenOffen);
  const [logOffen, setLogOffen] = useState(false);
  const [projekteOffen, setProjekteOffen] = useState(() => isTauri());
  const dirty = lvGeaendert(lv);
  const name = projekt ? `${projekt.meta.projektcode ? `${projekt.meta.projektcode} ` : ''}${projekt.name}${lv ? ` – ${lv.datei.name}` : ''}` : 'Kein Projekt';

  useEffect(() => {
    // Entwicklung: erfundenes Projekt im Speicher (Adresse mit ?demo)
    if (import.meta.env.DEV && !isTauri() && new URLSearchParams(location.search).has('demo')) {
      void import('./demo').then((d) => d.demoLaden());
      return;
    }
    void useAva.getState().einstellungenLaden();
  }, []);

  useEffect(() => {
    document.title = `${dirty ? '● ' : ''}${name} – ${APP_NAMEN.ava.name}`;
  }, [name, dirty]);

  // von außen geänderte Dateien übernehmen: beim Zurückkommen ins Fenster
  useEffect(() => {
    const zurueck = () => {
      if (document.visibilityState !== 'hidden' && useAva.getState().projekt) void useAva.getState().neuLaden();
    };
    window.addEventListener('focus', zurueck);
    return () => window.removeEventListener('focus', zurueck);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        if (useAva.getState().lv) void lvSpeichernMitMeldung();
      } else if ((istEingabeZiel(e.target) || dialogOffen()) && (k === 'z' || k === 'y')) {
        // in Eingabefeldern: Rückgängig des Felds
      } else if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useAva.getState().lvRueckgaengig();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        useAva.getState().lvWiederholen();
      } else if (k === ',') {
        e.preventDefault();
        useAva.getState().setEinstellungenOffen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Arkly (Schließen, Andocken, Herauslösen, Update-Neustart): laufende Eingabe übernehmen und laufendes Schreiben
  // der Projektdatei, Kostenkontrolle bzw. des LV abwarten
  useEffect(() => vorDemSchliessen(ausstehendesSchreibenAbwarten), []);

  useEffect(() => {
    const vorEnde = (e: BeforeUnloadEvent) => {
      if (lvGeaendert(useAva.getState().lv)) e.preventDefault();
    };
    window.addEventListener('beforeunload', vorEnde);
    return () => window.removeEventListener('beforeunload', vorEnde);
  }, []);

  const inhalt = () => {
    switch (ansicht.art) {
      case 'uebersicht':
        return <Uebersicht />;
      case 'gewerk':
        return <GewerkAnsicht key={ansicht.gewerk} gewerk={ansicht.gewerk} tab={ansicht.tab} />;
      case 'rechnungen':
        return <RechnungenAnsicht />;
      case 'eingang':
        return <Eingang />;
      case 'bautagebuch':
        return <Bautagebuch />;
      case 'protokolle':
        return <Protokolle />;
      case 'maengel':
        return <Maengel />;
      case 'notizen':
        return <Notizen />;
      case 'beteiligte':
        return <Beteiligte />;
      case 'mails':
        return <Mailverlauf />;
    }
  };

  return (
    <div className="app">
      <TitleBar
        app={APP_NAMEN.ava.name}
        name={name}
        dirty={dirty}
        onOpenLog={() => setLogOffen(true)}
        onProjekte={() => setProjekteOffen(true)}
        zeichenflaeche={false}
        onSpeichern={() => lvSpeichernMitMeldung()}
      />
      {projekteOffen || !projekt ? (
        isTauri() ? (
          <ProjektWahl
            app={APP_NAMEN.ava.name}
            nurOrdner
            offeneDatei={projekt ? `${projekt.ordner}/${projekt.oap}` : null}
            onGewaehlt={async (g) => {
              if (!(await lvWeiter())) return;
              try {
                await useAva.getState().projektOeffnen({ ordner: g.ordner, oap: relativ(g.datei, g.ordner), name: g.project.name, meta: g.project.meta });
                setProjekteOffen(false);
              } catch (e) {
                log.error('Projekt nicht lesbar', e);
                await meldung('Projekt ließ sich nicht öffnen', 'Der Projektordner ließ sich nicht lesen.', e);
              }
            }}
            onSchliessen={projekt ? () => setProjekteOffen(false) : undefined}
          />
        ) : (
          <div className="ava-leer">
            <ProjektEinstieg
              titel="Ausschreibung, Vergabe, Abrechnung und Bauleitung"
              text="Die App arbeitet mit den Projektordnern des Büros (Gewerkeordner, LV-Dateien, Kostenkontrolle, Rechnungen). Dafür braucht sie die Desktop-App – im Browser gibt es keinen Ordnerzugriff."
            />
          </div>
        )
      ) : (
        <div className="workspace">
          <Navigation
            onStammdaten={async (meta, neuerName) => {
              try {
                await schreibend(projektdateiSchreiben(useAva.getState().fs.projektordner, projekt.ordner, projekt.oap, (roh) => ({ ...roh, name: neuerName, meta })));
                useAva.getState().setMeta(meta, neuerName);
              } catch (e) {
                await meldung('Stammdaten nicht gespeichert', 'Die Projektdatei ließ sich nicht schreiben.', e);
              }
            }}
          />
          <main className="ava-main">{inhalt()}</main>
        </div>
      )}
      {einstellungenOffen && <EinstellungenModal />}
      {logOffen && <LogDialog onClose={() => setLogOffen(false)} />}
      {busy && <div className="ava-busy">{busy}</div>}
    </div>
  );
}
