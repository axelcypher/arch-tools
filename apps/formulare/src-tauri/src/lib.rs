//! Desktop-Hülle für die Formulare-App. Die allgemeinen Befehle (Speichern-Dialoge, Protokoll) stehen in
//! packages/core/tauri/commands.rs; hier kommen die Dateisystem-Befehle für die FORMA-Projektordner dazu.
//!
//! Grundsatz: Ersetzt werden nur vorhandene Formulare (`.frmsjf`), neue Formulare nur angelegt (nie
//! überschrieben), umbenannt nur im selben Ordner und nur ohne Sperrdatei daneben, angelegt und gelöscht nur Sperrdateien (`.frmtmp`) – und gelöscht nur, solange sie noch genau
//! den Inhalt haben, den diese App geschrieben hat. In der Projektkarte (`sj_prokarte.sdb`) werden nur vorhandene
//! Einträge geändert, und nur wenn sie noch den Wert haben, von dem die Änderung ausgeht. Die eigenen Angaben der
//! App zum Projekt (Projektumfang, aktive Antragsfassung) stehen in `formulare.json` im FORMA-Projekt. Dokumente
//! im Projektordner lassen sich kopieren, umbenennen und löschen – gelöscht wird erst nach einer Sicherungskopie,
//! und die Dateien von FORMA sind davon ausgenommen. Jeder Pfad bleibt innerhalb des vom Benutzer gewählten
//! Ordners. Eigene Sperrdateien werden beim Beenden entfernt.

include!("../../../../packages/core/tauri/commands.rs");
include!("befehle.rs");
include!("../../../../packages/core/tauri/qgis.rs");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(log_plugin("formulare"))
        .plugin(tauri_plugin_dialog::init())
        // Links im Standardbrowser öffnen
        .plugin(tauri_plugin_opener::init())
        // automatische Updates: signiertes Manifest je App (tauri.conf.json → plugins.updater)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(EigeneSperren::default())
        .invoke_handler(tauri::generate_handler![
            qgis_suchen,
            qgis_ausfuehren,
            konfig_basis,
            ordner_waehlen,
            ordner_zeigen,
            projekt_liste,
            projekt_lesen,
            projekt_ordner_anlegen,
            projekt_datei_anlegen,
            projekt_oap_ersetzen,
            projekt_dateien_suchen,
            projekt_zip_eintrag,
            save_file,
            save_binary_file,
            pick_save_path,
            pick_open_path,
            read_binary_file,
            write_binary_file,
            pick_folder,
            fs_list,
            fs_read,
            fs_replace,
            lock_create,
            lock_release,
            lock_probe,
            doc_replace,
            doc_create,
            doc_in_office,
            project_file_write,
            dir_create,
            form_create,
            doc_copy,
            doc_rename,
            form_rename,
            doc_delete,
            process_info,
            prokarte_read,
            prokarte_write,
            machine_info,
            open_path
        ])
        .setup(|app| {
            log::info!("{} {} gestartet", app.package_info().name, app.package_info().version);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Fehler beim Starten der Anwendung");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            formulare_beim_beenden(handle);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Projektkarte im Aufbau von FORMA, Texte in UTF-8 („Straße“ = 53 74 72 61 C3 9F 65)
    fn muster(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("formulare-test-{}-{name}.sdb", std::process::id()));
        let _ = std::fs::remove_file(&p);
        let db = rusqlite::Connection::open(&p).unwrap();
        db.execute_batch(
            "CREATE TABLE Gruppe (GruppeID INTEGER NOT NULL, GruppeTyp INTEGER NOT NULL, GruppeText NVARCHAR(250) NOT NULL);
             CREATE TABLE Inhalte (GruppeID INTEGER NOT NULL, InhalteID INTEGER NOT NULL, InhalteTyp INTEGER NOT NULL,
                                   Ganzzahl INTEGER, Gleitkomma DOUBLE, Titel NVARCHAR(250) NOT NULL, Texte TEXT NOT NULL,
                                   Rechenblatt TEXT, Container LONGVARBINARY);
             INSERT INTO Gruppe VALUES (201, 1, 'Bauherr');
             INSERT INTO Inhalte (GruppeID, InhalteID, InhalteTyp, Titel, Texte) VALUES (201, 40, 1, 'Name/Firma:', 'Muster');
             INSERT INTO Inhalte (GruppeID, InhalteID, InhalteTyp, Titel, Texte) VALUES (201, 70, 1, 'Straße/Nr.:', '');
             INSERT INTO Inhalte (GruppeID, InhalteID, InhalteTyp, Ganzzahl, Titel, Texte)
                    VALUES (201, 210, 4, NULL, 'Anrede:', char(13, 10) || 'Sehr geehrte Frau' || char(13, 10) || 'Sehr geehrter Herr');",
        )
        .unwrap();
        p
    }

    fn text(id: i64, alt: &str, neu: &str) -> PkAenderung {
        PkAenderung { gruppe: 201, id, typ: 1, wert: PkWert::Texte { alt: alt.as_bytes().to_vec(), neu: neu.as_bytes().to_vec() } }
    }

    fn auswahl(alt: Option<i64>, neu: Option<i64>) -> PkAenderung {
        PkAenderung { gruppe: 201, id: 210, typ: 4, wert: PkWert::Ganzzahl { alt, neu } }
    }

    #[test]
    fn liest_bytes_und_auswahl_wie_gespeichert() {
        let p = muster("lesen");
        let pk = pk_lesen(&p).unwrap();
        assert_eq!(pk.gruppen[0].text, b"Bauherr");
        assert_eq!(pk.inhalte[1].titel, "Straße/Nr.:".as_bytes());
        assert_eq!(pk.inhalte[1].texte, b"");
        assert_eq!(pk.inhalte[2].ganzzahl, None);
        assert_eq!(pk.inhalte[2].texte, b"\r\nSehr geehrte Frau\r\nSehr geehrter Herr");
    }

    #[test]
    fn schreibt_alle_oder_keinen() {
        let p = muster("schreiben");
        pk_schreiben(&p, &[text(40, "Muster", "Müller"), text(70, "", "Hauptstraße 1"), auswahl(None, Some(2))]).unwrap();
        let pk = pk_lesen(&p).unwrap();
        assert_eq!(pk.inhalte[0].texte, "Müller".as_bytes());
        assert_eq!(pk.inhalte[1].texte, "Hauptstraße 1".as_bytes());
        assert_eq!(pk.inhalte[2].ganzzahl, Some(2));
        // die Möglichkeiten bleiben unverändert, Texte als TEXT wie bei FORMA
        assert_eq!(pk.inhalte[2].texte, b"\r\nSehr geehrte Frau\r\nSehr geehrter Herr");
        let db = rusqlite::Connection::open(&p).unwrap();
        let typ: String = db.query_row("SELECT typeof(Texte) FROM Inhalte WHERE InhalteID = 40", [], |r| r.get(0)).unwrap();
        assert_eq!(typ, "text");
        drop(db);

        // ein Eintrag inzwischen anders: nichts wird geschrieben, auch nicht die anderen
        let e = pk_schreiben(&p, &[text(40, "Müller", "Neu"), auswahl(None, Some(1))]).unwrap_err();
        assert!(e.contains("inzwischen geändert"), "{e}");
        let pk = pk_lesen(&p).unwrap();
        assert_eq!(pk.inhalte[0].texte, "Müller".as_bytes());
        assert_eq!(pk.inhalte[2].ganzzahl, Some(2));

        let e = pk_schreiben(&p, &[text(999, "", "X")]).unwrap_err();
        assert!(e.contains("gibt es in der Projektkarte nicht"), "{e}");
        // Art des Werts muss zum Eintrag passen
        let falsch = PkAenderung { gruppe: 201, id: 40, typ: 1, wert: PkWert::Ganzzahl { alt: None, neu: Some(1) } };
        assert!(pk_schreiben(&p, &[falsch]).unwrap_err().contains("keine Auswahl"));
    }

    #[test]
    fn dateien_von_forma_sind_geschuetzt() {
        for name in ["001-Bauantrag.frmsjf", "001-Bauantrag.FRMTMP", "sj_prokarte.sdb", "sj_office.ini"] {
            assert!(ist_forma_datei(Path::new(name)), "{name}");
        }
        for name in ["BS9 GP 261110 Bauantrag.pdf", "formulare.json", "Berechnung.xlsx"] {
            assert!(!ist_forma_datei(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn formulare_lassen_sich_loeschen_aber_nicht_geoeffnet() {
        let dir = std::env::temp_dir().join(format!("formulare-loeschen-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let formular = dir.join("001-Bauantrag (2026).frmsjf");
        std::fs::write(&formular, b"x").unwrap();
        assert!(loeschen_erlaubt(&formular).is_ok());
        std::fs::write(dir.join("001-Bauantrag (2026).frmtmp"), b"x").unwrap();
        assert!(loeschen_erlaubt(&formular).unwrap_err().contains("geöffnet"));
        for name in ["001-Bauantrag (2026).frmtmp", "sj_prokarte.sdb", "sj_office.ini"] {
            assert!(loeschen_erlaubt(&dir.join(name)).is_err(), "{name}");
        }
        assert!(loeschen_erlaubt(&dir.join("BS9 GP 261110 Bauantrag.pdf")).is_ok());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn liste_mit_aenderungszeit() {
        let dir = std::env::temp_dir().join(format!("formulare-liste-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("TÖB/BAUA 2")).unwrap();
        std::fs::write(dir.join("TÖB/BAUA 2/a.pdf"), b"x").unwrap();
        let mut out = Vec::new();
        sammle(&dir, "", 3, &mut out).unwrap();
        let datei = out.iter().find(|e| e.pfad == "TÖB/BAUA 2/a.pdf").expect("Datei gelistet");
        assert!(!datei.ordner && datei.groesse == 1 && datei.geaendert > 1_600_000_000_000);
        assert!(out.iter().any(|e| e.pfad == "TÖB/BAUA 2" && e.ordner));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn liest_aenderungen_aus_der_oberflaeche() {
        let a: Vec<PkAenderung> = serde_json::from_str(
            r#"[{"gruppe":201,"id":40,"typ":1,"spalte":"texte","alt":[77],"neu":[78]},
                {"gruppe":201,"id":210,"typ":4,"spalte":"ganzzahl","alt":null,"neu":2}]"#,
        )
        .unwrap();
        assert!(matches!(&a[0].wert, PkWert::Texte { alt, neu } if alt == b"M" && neu == b"N"));
        assert!(matches!(a[1].wert, PkWert::Ganzzahl { alt: None, neu: Some(2) }));
    }

    #[test]
    fn offen_gehaltene_sperre_gilt_als_benutzt() {
        let p = std::env::temp_dir().join(format!("formulare-test-{}.frmtmp", std::process::id()));
        let _ = std::fs::remove_file(&p);
        std::fs::write(&p, b"[Zugriff]
").unwrap();
        assert!(!wird_benutzt(&p));
        let griff = griff_oeffnen(&p).unwrap();
        // lesen dürfen andere (FORMA zeigt an, wer das Formular geöffnet hat) …
        assert_eq!(std::fs::read(&p).unwrap(), b"[Zugriff]
");
        if cfg!(windows) {
            // … aber nicht löschen; und jeder sieht, dass die Datei benutzt wird
            assert!(wird_benutzt(&p));
            let e = sperre_entfernen(&p, b"[Zugriff]
").unwrap_err();
            assert!(e.contains("gerade von einem anderen Programm benutzt"), "{e}");
        }
        // nach einem Absturz schließt das System den Griff: frei, löschbar
        drop(griff);
        assert!(!wird_benutzt(&p));
        assert!(!sperre_entfernen(&p, b"anderer Inhalt").unwrap());
        assert!(sperre_entfernen(&p, b"[Zugriff]
").unwrap());
        assert!(!p.exists());
    }

    #[test]
    fn office_besitzerdatei_zeigt_geoeffnete_dokumente() {
        let ordner = std::env::temp_dir().join(format!("formulare-test-office-{}", std::process::id()));
        std::fs::create_dir_all(&ordner).unwrap();
        let lang = ordner.join("Baubeschreibung.docx");
        let kurz = ordner.join("BS5.xlsx");
        assert!(!office_offen(&lang) && !office_offen(&kurz));
        // Word kürzt lange Namen um die ersten beiden Zeichen, Excel stellt „~$“ voran
        std::fs::write(ordner.join("~$ubeschreibung.docx"), b"x").unwrap();
        std::fs::write(ordner.join("~$BS5.xlsx"), b"x").unwrap();
        assert!(office_offen(&lang) && office_offen(&kurz));
        std::fs::remove_dir_all(&ordner).unwrap();
    }

    #[test]
    fn formular_umbenennen_nur_ohne_sperre_und_ohne_ueberschreiben() {
        let ordner = std::env::temp_dir().join(format!("formulare-test-umbenennen-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&ordner);
        std::fs::create_dir_all(&ordner).unwrap();
        let alt = ordner.join("001-Bauantrag.frmsjf");
        let neu = ordner.join("002-Bauantrag.frmsjf");
        std::fs::write(&alt, b"Formular").unwrap();
        // gesperrt (in FORMA geöffnet): nicht umbenannt, die fremde Sperre bleibt
        std::fs::write(alt.with_extension("frmtmp"), b"fremd").unwrap();
        assert!(formular_umbenennen(&alt, &neu, b"eigen").unwrap_err().contains("Sperrdatei"));
        assert_eq!(std::fs::read(alt.with_extension("frmtmp")).unwrap(), b"fremd");
        std::fs::remove_file(alt.with_extension("frmtmp")).unwrap();
        // das Ziel gibt es schon: nicht überschrieben
        std::fs::write(&neu, b"anderes").unwrap();
        assert!(formular_umbenennen(&alt, &neu, b"eigen").unwrap_err().contains("gibt es schon"));
        assert_eq!(std::fs::read(&neu).unwrap(), b"anderes");
        std::fs::remove_file(&neu).unwrap();
        // nur Formulare, nur im selben Ordner
        assert!(formular_umbenennen(&alt, &ordner.join("x.pdf"), b"eigen").is_err());
        assert!(formular_umbenennen(&alt, &ordner.join("unter").join("x.frmsjf"), b"eigen").is_err());
        // umbenannt, und die eigene Sperre ist wieder weg
        formular_umbenennen(&alt, &neu, b"eigen").unwrap();
        assert!(!alt.exists() && std::fs::read(&neu).unwrap() == b"Formular");
        assert!(!alt.with_extension("frmtmp").exists() && !neu.with_extension("frmtmp").exists());
        std::fs::remove_dir_all(&ordner).unwrap();
    }

    #[test]
    fn prozess_name_nur_fuer_laufende_prozesse() {
        let eigener = prozess_name(std::process::id()).expect("eigener Prozess");
        assert!(!eigener.is_empty());
        assert_eq!(prozess_name(4_294_967_000), None);
    }

    /// Mit SJFORMA_REF: eine Kopie jeder echten Projektkarte lesen und unverändert zurückschreiben
    #[test]
    fn echte_projektkarten() {
        let Ok(wurzel) = std::env::var("SJFORMA_REF") else { return };
        for e in std::fs::read_dir(wurzel).unwrap().flatten() {
            let quelle = e.path().join("sj_prokarte.sdb");
            if !quelle.is_file() {
                continue;
            }
            let kopie = std::env::temp_dir().join(format!("formulare-test-{}-echt.sdb", std::process::id()));
            std::fs::copy(&quelle, &kopie).unwrap();
            let pk = pk_lesen(&kopie).unwrap();
            assert!(pk.gruppen.len() > 10 && pk.inhalte.len() > 100);
            let alle: Vec<_> = pk
                .inhalte
                .iter()
                .map(|i| PkAenderung {
                    gruppe: i.gruppe,
                    id: i.id,
                    typ: i.typ,
                    wert: if [4, 8, 16].contains(&i.typ) {
                        PkWert::Ganzzahl { alt: i.ganzzahl, neu: i.ganzzahl }
                    } else {
                        PkWert::Texte { alt: i.texte.clone(), neu: i.texte.clone() }
                    },
                })
                .collect();
            pk_schreiben(&kopie, &alle).unwrap();
            let wieder = pk_lesen(&kopie).unwrap();
            assert!(pk.inhalte.iter().zip(&wieder.inhalte).all(|(a, b)| a.texte == b.texte && a.ganzzahl == b.ganzzahl));
            std::fs::remove_file(&kopie).unwrap();
        }
    }
}
