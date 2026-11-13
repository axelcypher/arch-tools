import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjektStatus } from '@core/model';
import { angeheftetLesen, anheftenUmschalten } from '@core/platform/konfig';
import type { ProjektordnerZugriff } from '@core/platform/projektordner';
import { ordnerZeigen, statusAusGruppe } from '@core/platform/projektordner';
import { meldung } from '@core/ui/Rueckfrage';
import { useProjektordnerListe } from '@core/ui/projektListe';
import type { KontextEintrag, UebersichtProjekt } from '@core/ui/ProjektUebersicht';
import { ProjektUebersicht } from '@core/ui/ProjektUebersicht';
import { ausOrdnername } from '../nummer';
import { projektStatusSetzen } from '../projekt';
import { useOrdner } from '../store';
import { KatasterDialog } from './KatasterDialog';

/**
 * Startseite des Assistenten: die gemeinsame Projektübersicht aller Apps – zuletzt geöffnet, darunter die
 * Projektordner je Stammordner. Titel und Marken kommen aus der Projektdatei (nur projekt.json, im Hintergrund
 * nachgeladen, zuletzt geöffnete zuerst). „Neues Projekt“ steht im Kopf.
 */
export function ProjektStart({
  fs,
  sichtbar = true,
  entwurf,
  onNeu,
  onLeerNeu,
  onOeffnen,
  onAndererOrdner,
  onEinstellungen,
  onPruefen,
  onKatasterEinstellungen,
  onMails,
}: {
  fs: ProjektordnerZugriff;
  /** ausgeblendet (andere Ansicht der App): bleibt eingehängt; beim Wiederzeigen wird die Liste frisch gelesen */
  sichtbar?: boolean;
  /** angefangenes neues Projekt („2026-014 EFH Musterweg“), leer ohne */
  entwurf: string;
  onNeu: () => void;
  onLeerNeu: () => void;
  onOeffnen: (pfad: string) => void;
  onAndererOrdner: () => void;
  onEinstellungen?: () => void;
  /** ein Projekt in „Ordner prüfen“ prüfen */
  onPruefen?: (pfad: string) => void;
  /** Einstellungen der Katasterpläne zeigen */
  onKatasterEinstellungen?: () => void;
  /** Mails des Projekts prüfen und benennen */
  onMails?: (pfad: string) => void;
}) {
  const { allgemein, struktur, setAllgemein } = useOrdner();
  // Nummer und Kurzname aus dem Ordnernamen nach dem Schema der Struktur
  const ausName = useCallback((name: string) => ausOrdnername(struktur.ordnername, name), [struktur.ordnername]);
  const liste = useProjektordnerListe(fs, allgemein.projekte, ausName);
  const [angeheftet, setAngeheftet] = useState<string[]>([]);
  // Katasterpläne eines Projekts exportieren
  const [kataster, setKataster] = useState<{ basis: string; name: string } | null>(null);
  // wieder sichtbar: Projekte frisch lesen – inzwischen kann ein Kollege oder eine andere App etwas geändert haben
  const warSichtbar = useRef(sichtbar);
  useEffect(() => {
    if (sichtbar && !warSichtbar.current) liste.neuLaden();
    warSichtbar.current = sichtbar;
  }, [sichtbar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let aktuell = true;
    void angeheftetLesen().then((a) => aktuell && setAngeheftet(a));
    return () => {
      aktuell = false;
    };
  }, []);

  const statusSetzen = async (p: UebersichtProjekt, status: ProjektStatus) => {
    try {
      // im Archiv- bzw. Akquiseordner gälte sonst dessen Stand – „aktiv“ dann ausdrücklich in die Projektdatei
      const gruppe = liste.ordner.find((o) => o.pfad === p.schluessel)?.gruppe;
      await projektStatusSetzen(fs, p.schluessel, status, { ausdruecklich: !!statusAusGruppe(gruppe) });
      liste.neuLaden();
    } catch (e) {
      await meldung('Status nicht gesetzt', e instanceof Error ? e.message : String(e));
    }
  };
  /** Kontextmenü je Projekt: ergänzen, prüfen, im Explorer öffnen, Status, anheften */
  const kontextMenue = (p: UebersichtProjekt): KontextEintrag[] => {
    const dran = angeheftet.some((a) => a.toLowerCase() === p.schluessel.toLowerCase());
    const status = p.projektStatus ?? 'aktiv';
    return [
      { label: 'Ergänzen …', aktion: () => onOeffnen(p.schluessel) },
      ...(onPruefen ? [{ label: 'Projekt prüfen', aktion: () => onPruefen(p.schluessel) }] : []),
      ...(onMails ? [{ label: 'Mails prüfen …', titel: 'Mails (.msg) im Projektordner prüfen und nach dem Schema benennen', aktion: () => onMails(p.schluessel) }] : []),
      {
        label: 'Katasterpläne …',
        titel: 'Katasterauszüge (PDF) und DXF-Pläne aus der QGIS-Vorlage um die Projektadresse exportieren',
        aktion: () => setKataster({ basis: p.schluessel, name: p.titel ? `${p.kuerzel} ${p.titel}` : p.kuerzel }),
      },
      { label: 'Im Explorer öffnen', aktion: () => void ordnerZeigen(p.schluessel).catch((e) => void meldung('Ordner ließ sich nicht öffnen', String(e))) },
      ...(status !== 'abgeschlossen'
        ? [
            {
              label: 'Projekt abschließen',
              titel: 'Status „abgeschlossen“ in der Projektdatei – das Projekt verschwindet aus der Standardansicht',
              aktion: () => void statusSetzen(p, 'abgeschlossen'),
            },
          ]
        : [{ label: 'Wieder aktiv', aktion: () => void statusSetzen(p, 'aktiv') }]),
      ...(status === 'aktiv' ? [{ label: 'Als Akquise kennzeichnen', aktion: () => void statusSetzen(p, 'akquise') }] : []),
      ...(status === 'akquise' ? [{ label: 'Beauftragt (aktiv)', aktion: () => void statusSetzen(p, 'aktiv') }] : []),
      { label: dran ? 'Lösen' : 'Anheften', titel: 'Angeheftete Projekte stehen vorne – in allen Apps', aktion: () => void anheftenUmschalten(p.schluessel).then(setAngeheftet) },
    ];
  };

  return (
    <>
      {kataster && <KatasterDialog basis={kataster.basis} name={kataster.name} onClose={() => setKataster(null)} onEinstellungen={onKatasterEinstellungen} onStammdaten={() => {
            const basis = kataster.basis;
            setKataster(null);
            onOeffnen(basis);
          }} />}
      <ProjektUebersicht
        titel="Projekte"
        gruppen={liste.gruppen}
        projekte={liste.projekte}
        zuletzt={liste.zuletzt}
        sucht={liste.sucht}
        fehler={liste.fehler}
        onOeffnen={(p) => onOeffnen(p.schluessel)}
        onNeuLaden={liste.neuLaden}
        onEinstellungen={onEinstellungen}
        marken={(p) => [
          ...liste.marken(p),
          ...(p.projektStatus && p.projektStatus !== 'aktiv' ? [{ text: p.projektStatus === 'akquise' ? 'Akquise' : 'abgeschlossen', art: 'neutral' as const }] : []),
        ]}
        angeheftet={angeheftet}
        kontextMenue={kontextMenue}
        // ATLAS hat einen eigenen Knopf (der Assistent ist hier)
        projektAnlegen={false}
        // Stammordner per Ziehen umsortieren (gemeinsame Einstellung; der erste nimmt neue Projekte auf)
        onGruppenOrdnen={(projekte) => setAllgemein({ projekte })}
        kopf={
          <>
            <button className="primary" onClick={onNeu} title="Assistent für ein neues Projekt: Stammdaten, Umfang, Vorlagen, Anlegen">
              {entwurf ? `Weiter mit ${entwurf}` : 'Neues Projekt'}
            </button>
            {entwurf && (
              <button onClick={onLeerNeu} title="Den angefangenen Entwurf verwerfen und ein neues Projekt mit leerem Formular beginnen">
                Leer beginnen
              </button>
            )}
            <button onClick={onAndererOrdner} title="Einen Projektordner außerhalb der Stammordner ergänzen">
              Anderen Ordner …
            </button>
          </>
        }
      />
    </>
  );
}
