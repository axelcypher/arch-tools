import { createContext, useContext, type ReactNode } from 'react';
import { Karte } from '@core/ui/Karte';

/**
 * Kopf eines Gewerks (Titel, LV-Wahl, Tabs), den die Ansicht des gewählten Tabs in ihre Hauptkarte übernimmt – so
 * stehen Gewerk, Tabs und die Werkzeugleiste der Ansicht in einer Karte (docs/design.md „Fläche und Karten“).
 */
export interface GewerkRahmen {
  titel: ReactNode;
  aktionen?: ReactNode;
  /** Zeile mit den Tabs (und Angaben zum Gewerk) über der Werkzeugleiste der Ansicht */
  tabs: ReactNode;
  /** Fehlermeldung des Gewerks (z. B. LV ließ sich nicht öffnen), unter den Tabs */
  fehler?: string | null;
  /** `id` des Tabpanels und `id` des gewählten Tabs */
  panelId: string;
  tabId: string;
}

export const GewerkRahmenKontext = createContext<GewerkRahmen | null>(null);

interface Props {
  /** Titel, wenn die Ansicht allein steht (im Gewerk gilt dessen Titel) */
  titel?: ReactNode;
  aktionen?: ReactNode;
  leiste?: ReactNode;
  fuss?: ReactNode;
  buendig?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Hauptkarte einer Ansicht: allein mit eigenem Titel, im Gewerk mit dessen Kopf und Tabs über der eigenen Leiste */
export function AnsichtKarte({ titel, aktionen, leiste, fuss, buendig, className, children }: Props) {
  const g = useContext(GewerkRahmenKontext);
  if (!g)
    return (
      <Karte als="main" titel={titel} aktionen={aktionen} leiste={leiste} fuss={fuss} buendig={buendig} className={className}>
        {children}
      </Karte>
    );
  return (
    <Karte
      als="main"
      titel={g.titel}
      aktionen={
        aktionen || g.aktionen ? (
          <>
            {aktionen}
            {g.aktionen}
          </>
        ) : undefined
      }
      leiste={
        <>
          {g.tabs}
          {g.fehler && (
            <div className="meldung fehler" role="alert">
              {g.fehler}
            </div>
          )}
          {leiste}
        </>
      }
      fuss={fuss}
      buendig={buendig}
      className={['ava-gewerk-karte', className].filter(Boolean).join(' ')}
    >
      {/* Tabpanel ist der Inhalt: Werkzeugleiste und Fuß stehen fest in der Karte (Kartenleiste bzw. Kartenfuß) und
          folgen in der Tab-Reihenfolge direkt auf die Tabliste */}
      <div className="ava-tabpanel" id={g.panelId} role="tabpanel" aria-labelledby={g.tabId}>
        {children}
      </div>
    </Karte>
  );
}
