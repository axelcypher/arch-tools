import { useState } from 'react';
import { Modal } from '@core/ui/Dialog';
import { meldung } from '@core/ui/Rueckfrage';
import { ordnerWaehlen } from '@core/platform/projektordner';
import { openFileWithPath } from '@core/platform/files';
import { bueroName } from '@core/platform/konfig';
import { nameBilden, nameErkennen, unbekanntePlatzhalter } from '../abrechnung/benennung';
import type { AvaEinstellungen, MailVorlage } from '../einstellungen';
import { VORGABE } from '../einstellungen';
import { neueId } from '../lv/modell';
import { useAva } from '../store';
import { Feld, TextEingabe, ZahlEingabe } from './eingaben';

type Ebene = 'ablage' | 'rechnungen' | 'pruefung' | 'deckblatt' | 'scan' | 'mail' | 'lv';

const EBENEN: { id: Ebene; text: string }[] = [
  { id: 'ablage', text: 'Ablage' },
  { id: 'rechnungen', text: 'Rechnungen & Benennung' },
  { id: 'pruefung', text: 'Prüfung' },
  { id: 'deckblatt', text: 'Deckblatt' },
  { id: 'scan', text: 'Scanordner' },
  { id: 'mail', text: 'Mailvorlagen' },
  { id: 'lv', text: 'Leistungsverzeichnisse' },
];

const liste = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Einstellungen der App – gelten für das ganze Büro (gemeinsamer Konfigurationsordner) */
export function EinstellungenModal() {
  const gespeichert = useAva((s) => s.einstellungen);
  const [e, setE] = useState<AvaEinstellungen>(gespeichert);
  const [ebene, setEbene] = useState<Ebene>('ablage');
  const [probe, setProbe] = useState('K62 R021 Witthaut 251024 AB1.pdf');
  const schliessen = () => useAva.getState().setEinstellungenOffen(false);
  const setze = <K extends keyof AvaEinstellungen>(k: K, patch: Partial<AvaEinstellungen[K]>) => setE((x) => ({ ...x, [k]: { ...x[k], ...patch } }));

  const speichern = async () => {
    try {
      await useAva.getState().einstellungenSetzen(e);
      schliessen();
    } catch (x) {
      await meldung('Einstellungen nicht gespeichert', 'Der gemeinsame Konfigurationsordner ließ sich nicht schreiben.', x);
    }
  };

  const erkannt = nameErkennen(probe, e.rechnungen.muster, e.rechnungen.arten);

  return (
    <Modal titel="Einstellungen" onClose={schliessen} breit className="ava-einstellungen">
      <div className="ava-einst-kopf">
        <h2>Einstellungen</h2>
        <span className="muted small-text">gelten für das ganze Büro (gemeinsamer Konfigurationsordner)</span>
      </div>
      <div className="ava-einst-koerper">
        <ul className="list ava-einst-ebenen">
          {EBENEN.map((x) => (
            <li key={x.id} className={x.id === ebene ? 'active' : ''} onClick={() => setEbene(x.id)}>
              {x.text}
            </li>
          ))}
        </ul>
        <div className="ava-einst-inhalt">
          {ebene === 'ablage' && (
            <div className="ava-formular">
              <p className="muted ava-feld-breit">Wo im Projektordner was liegt. Gewerkeordner heißen „G08 Fenster“ (Kennung G + Nummer, dann die Bezeichnung).</p>
              <Feld label="Ordner der Gewerke" hinweis="relativ zum Projektordner">
                <TextEingabe wert={e.ablage.gewerke} onChange={(gewerke) => setze('ablage', { gewerke })} />
              </Feld>
              <Feld label="LV-Dateien im Unterordner" hinweis="leer = direkt im Gewerkeordner">
                <TextEingabe wert={e.ablage.lv} onChange={(lv) => setze('ablage', { lv })} />
              </Feld>
              <Feld label="Aufträge und Rechnungen">
                <TextEingabe wert={e.ablage.auftrag} onChange={(auftrag) => setze('ablage', { auftrag })} />
              </Feld>
              <Feld label="Mailverkehr des Gewerks">
                <TextEingabe wert={e.ablage.korrespondenz} onChange={(korrespondenz) => setze('ablage', { korrespondenz })} />
              </Feld>
              <Feld label="Archivordner" hinweis="durch Komma getrennt; im Gewerk und im Auftragsordner">
                <TextEingabe wert={e.ablage.archive.join(', ')} onChange={(s) => setze('ablage', { archive: liste(s) })} />
              </Feld>
              <Feld label="Kostenkontrolle" hinweis="Teil des Dateinamens; „AKTUELL“ bzw. das jüngste Datum im Namen gewinnt">
                <TextEingabe wert={e.ablage.kostenkontrolle} onChange={(kostenkontrolle) => setze('ablage', { kostenkontrolle })} />
              </Feld>
              <Feld label="Bauleitung (Protokolle, Bautagebuch)">
                <TextEingabe wert={e.ablage.bauleitung} onChange={(bauleitung) => setze('ablage', { bauleitung })} />
              </Feld>
              <Feld label="Weitere Mailordner des Projekts" hinweis="Ordnernamen, durch Komma getrennt">
                <TextEingabe wert={e.ablage.mailOrdner.join(', ')} onChange={(s) => setze('ablage', { mailOrdner: liste(s) })} />
              </Feld>
            </div>
          )}
          {ebene === 'rechnungen' && (
            <div className="ava-formular">
              <p className="muted ava-feld-breit">
                Muster der Dateinamen im Auftragsordner. Das erste gilt für neue Dateien, alle zum Erkennen vorhandener. Platzhalter: {'{Kürzel} {Nr} {Nr:3} {Art} {Lfd} {Firma} {Datum} {Gewerk}'}.
              </p>
              <Feld label="Muster (je Zeile eines)" breit>
                <TextEingabe mehrzeilig zeilen={4} wert={e.rechnungen.muster.join('\n')} onChange={(s) => setze('rechnungen', { muster: s.split('\n').map((x) => x.trim()).filter(Boolean) })} />
              </Feld>
              {e.rechnungen.muster.flatMap(unbekanntePlatzhalter).length > 0 && <div className="warning ava-feld-breit">Unbekannte Platzhalter: {e.rechnungen.muster.flatMap(unbekanntePlatzhalter).join(', ')}</div>}
              <Feld label="Beispiel für neue Dateien" breit>
                <code>{nameBilden(e.rechnungen.muster[0] ?? '', { kuerzel: 'K62', nr: 53, firma: 'Witthaut', datum: '2026-11-12', art: 'SR', lfd: 4, gewerk: 'G08' })}.pdf</code>
              </Feld>
              <Feld label="Erkennen ausprobieren" breit>
                <input value={probe} onChange={(x) => setProbe(x.target.value)} />
                <span className="ava-feld-hinweis">{erkannt ? `erkannt: Nr. ${erkannt.nr ?? '–'}, ${erkannt.art ?? ''}${erkannt.lfd ?? ''}, ${erkannt.firma ?? ''}, ${erkannt.datum ?? ''} (Muster „${erkannt.muster}“)` : 'passt zu keinem Muster'}</span>
              </Feld>
              <Feld label="Rechnungsarten" hinweis="je Zeile: Kürzel = Name (AB = Abschlagsrechnung …)" breit>
                <TextEingabe
                  mehrzeilig
                  zeilen={4}
                  wert={e.rechnungen.arten.map((a) => `${a.kuerzel} = ${a.name}`).join('\n')}
                  onChange={(s) =>
                    setze('rechnungen', {
                      arten: s
                        .split('\n')
                        .map((z) => z.split('='))
                        .filter((t) => t[0]?.trim())
                        .map(([k, n]) => {
                          const kuerzel = k.trim();
                          const vorher = e.rechnungen.arten.find((a) => a.kuerzel === kuerzel) ?? VORGABE.rechnungen.arten.find((a) => a.kuerzel === kuerzel);
                          return { ...vorher, kuerzel, name: (n ?? kuerzel).trim() };
                        }),
                    })
                  }
                />
              </Feld>
              <label className="ava-check ava-feld-breit">
                <input type="checkbox" checked={e.rechnungen.nrAufDeckblatt} onChange={(x) => setze('rechnungen', { nrAufDeckblatt: x.target.checked })} /> Nummer der Rechnungsliste auf dem Deckblatt
              </label>
              <label className="ava-check ava-feld-breit">
                <input type="checkbox" checked={e.rechnungen.deckblattVoranstellen} onChange={(x) => setze('rechnungen', { deckblattVoranstellen: x.target.checked })} /> Deckblatt beim Ablegen digital vor den Scan setzen (sonst wird es mit eingescannt)
              </label>
            </div>
          )}
          {ebene === 'pruefung' && (
            <div className="ava-formular">
              <p className="muted ava-feld-breit">Vorgaben einer neuen Rechnungsprüfung (lassen sich je Rechnung ändern).</p>
              <Feld label="Umsatzsteuer %">
                <ZahlEingabe wert={e.pruefung.mwstProzent} onChange={(n) => setze('pruefung', { mwstProzent: n ?? 19 })} />
              </Feld>
              <Feld label="Gemeinkostenumlage %">
                <ZahlEingabe wert={e.pruefung.umlageProzent} onChange={(n) => setze('pruefung', { umlageProzent: n ?? 0 })} />
              </Feld>
              <Feld label="Sicherheitseinbehalt % (Abschläge)">
                <ZahlEingabe wert={e.pruefung.einbehaltProzent} onChange={(n) => setze('pruefung', { einbehaltProzent: n ?? 0 })} />
              </Feld>
              <Feld label="Nachlass %">
                <ZahlEingabe wert={e.pruefung.nachlassProzent} onChange={(n) => setze('pruefung', { nachlassProzent: n ?? 0 })} />
              </Feld>
              <Feld label="Skonto %">
                <ZahlEingabe wert={e.pruefung.skontoProzent} onChange={(n) => setze('pruefung', { skontoProzent: n ?? 0 })} />
              </Feld>
            </div>
          )}
          {ebene === 'deckblatt' && (
            <div className="ava-formular">
              <Feld label="Briefbogen (PDF)" hinweis="erste Seite als Hintergrund; leer = Büroname oben rechts und Fußzeile" breit>
                <div className="ava-reihe">
                  <TextEingabe wert={e.deckblatt.briefbogen} onChange={(briefbogen) => setze('deckblatt', { briefbogen })} />
                  <button
                    onClick={async () => {
                      const d = await openFileWithPath({ filterName: 'PDF', extensions: ['pdf'] });
                      if (d?.pfad) setze('deckblatt', { briefbogen: d.pfad });
                    }}
                  >
                    Wählen …
                  </button>
                </div>
              </Feld>
              <Feld label="Büro (mehrzeilig)" breit>
                <TextEingabe mehrzeilig zeilen={2} wert={e.deckblatt.buero || bueroName()} onChange={(buero) => setze('deckblatt', { buero })} />
              </Feld>
              <Feld label="Unterschrift „i.A. …“" hinweis="leer = Bearbeiter des Projekts">
                <TextEingabe wert={e.deckblatt.bearbeiter} onChange={(bearbeiter) => setze('deckblatt', { bearbeiter })} />
              </Feld>
              <Feld label="Schlusstext" breit>
                <TextEingabe mehrzeilig zeilen={3} wert={e.deckblatt.schlusstext} onChange={(schlusstext) => setze('deckblatt', { schlusstext })} />
              </Feld>
              <Feld label="Fußzeile ohne Briefbogen" hinweis="Spalten durch Tabulator (|| wird zu Tab), Zeilen durch Zeilenumbruch" breit>
                <TextEingabe mehrzeilig zeilen={4} wert={e.deckblatt.fusszeile.replace(/\t/g, ' || ')} onChange={(s) => setze('deckblatt', { fusszeile: s.replace(/\s*\|\|\s*/g, '\t') })} />
              </Feld>
            </div>
          )}
          {ebene === 'scan' && (
            <div className="ava-formular">
              <Feld label="Scanordner" hinweis="Ordner, in dem der Scanner die Dateien ablegt (z. B. \\server\Scans)" breit>
                <div className="ava-reihe">
                  <TextEingabe wert={e.scan.ordner} onChange={(ordner) => setze('scan', { ordner })} />
                  <button
                    onClick={async () => {
                      const o = await ordnerWaehlen('Scanordner wählen');
                      if (o) setze('scan', { ordner: o });
                    }}
                  >
                    Wählen …
                  </button>
                </div>
              </Feld>
              <Feld label="Dateiendungen" hinweis="durch Komma getrennt">
                <TextEingabe wert={e.scan.endungen.join(', ')} onChange={(s) => setze('scan', { endungen: liste(s).map((x) => x.replace(/^\./, '')) })} />
              </Feld>
            </div>
          )}
          {ebene === 'mail' && <MailVorlagen vorlagen={e.mail.vorlagen} onChange={(vorlagen) => setze('mail', { vorlagen })} />}
          {ebene === 'lv' && (
            <div className="ava-formular">
              <Feld label="Format neuer LV-Dateien">
                <select value={e.lv.neuesFormat} onChange={(x) => setze('lv', { neuesFormat: x.target.value as 'aslv' | 'oalv' })}>
                  <option value="aslv">LV-Datei (.aslv) – auch im LV-Programm zu öffnen</option>
                  <option value="oalv">eigenes Format (.oalv) – alle Positionsarten, ohne LV-Programm</option>
                </select>
              </Feld>
              <Feld label="Name neuer LV-Dateien" hinweis="Platzhalter {Kürzel} {Datum} {Gewerk}; dahinter folgt die Bezeichnung">
                <TextEingabe wert={e.lv.dateiname} onChange={(dateiname) => setze('lv', { dateiname })} />
              </Feld>
            </div>
          )}
        </div>
      </div>
      <div className="dialog-buttons">
        <button onClick={() => setE(VORGABE)} title="Alle Einstellungen auf die Vorgabe zurücksetzen (erst mit „Speichern“ wirksam)">
          Vorgabe
        </button>
        <span className="tb-spacer" />
        <button onClick={schliessen}>Abbrechen</button>
        <button className="primary" onClick={() => void speichern()}>
          Speichern
        </button>
      </div>
    </Modal>
  );
}

function MailVorlagen({ vorlagen, onChange }: { vorlagen: MailVorlage[]; onChange: (v: MailVorlage[]) => void }) {
  const [id, setId] = useState(vorlagen[0]?.id ?? '');
  const v = vorlagen.find((x) => x.id === id);
  const setze = (patch: Partial<MailVorlage>) => onChange(vorlagen.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <div className="ava-mailvorlagen">
      <p className="muted">
        Platzhalter: {'{Projekt} {Kürzel} {Gewerk} {Firma} {Firma-Mail} {Rechnung} {Nr} {Betrag} {Datum} {Zahler} {Teilnehmer} {Bearbeiter}'}. Die Mail öffnet sich als Entwurf mit Anhang im
        Mailprogramm (Outlook: als neue Nachricht) – nur noch „Senden“.
      </p>
      <div className="ava-reihe">
        <select value={id} onChange={(x) => setId(x.target.value)}>
          {vorlagen.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            const n = { id: neueId('m'), name: 'Neue Vorlage', an: '', cc: '', betreff: '{Kürzel} {Projekt}', text: '' };
            onChange([...vorlagen, n]);
            setId(n.id);
          }}
        >
          + Vorlage
        </button>
        {v && !['rechnung', 'auftrag', 'protokoll'].includes(v.id) && <button onClick={() => (onChange(vorlagen.filter((x) => x.id !== id)), setId(vorlagen[0]?.id ?? ''))}>Entfernen</button>}
      </div>
      {v && (
        <div className="ava-formular">
          <Feld label="Name" breit>
            <TextEingabe wert={v.name} onChange={(name) => setze({ name })} />
          </Feld>
          <Feld label="An">
            <TextEingabe wert={v.an} onChange={(an) => setze({ an })} />
          </Feld>
          <Feld label="Cc">
            <TextEingabe wert={v.cc} onChange={(cc) => setze({ cc })} />
          </Feld>
          <Feld label="Betreff" breit>
            <TextEingabe wert={v.betreff} onChange={(betreff) => setze({ betreff })} />
          </Feld>
          <Feld label="Text" breit>
            <TextEingabe mehrzeilig zeilen={8} wert={v.text} onChange={(text) => setze({ text })} />
          </Feld>
        </div>
      )}
    </div>
  );
}
