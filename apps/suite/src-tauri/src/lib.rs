//! Desktop-Hülle der Rahmen-App: ein Programm für alle arch-tools. Die Apps laufen als Tabs (iframes) im
//! Hauptfenster oder herausgelöst in eigenen Fenstern desselben Programms – deshalb registriert diese Hülle die
//! Befehle aller Apps: die gemeinsamen (packages/core/tauri/commands.rs) und die der Formulare-App
//! (apps/formulare/src-tauri/src/befehle.rs) und der AVA-App (apps/ava/src-tauri/src/befehle.rs). Die übrigen Apps haben
//! keine eigenen Befehle.

include!("../../../../packages/core/tauri/commands.rs");
include!("../../../formulare/src-tauri/src/befehle.rs");
include!("../../../ava/src-tauri/src/befehle.rs");
include!("../../../../packages/core/tauri/qgis.rs");
include!("../../../../packages/core/tauri/umbenennen.rs");

/// Die Formulare-App im Tab bzw. Fenster ist zu oder zieht um (Herauslösen, Andocken): ihre Sperrdateien freigeben.
/// Sonst hielte das Programm sie bis zum Beenden – die nächste Formulare-Instanz sähe die Formulare als „hier
/// geöffnet“, FORMA als gesperrt. Formulare läuft im Rahmen höchstens einmal, also sind es genau ihre Sperren.
#[tauri::command]
fn rahmen_formulare_freigeben(app: tauri::AppHandle) {
    formulare_beim_beenden(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(log_plugin("arch-tools"))
        .plugin(tauri_plugin_dialog::init())
        // Links (Normen, Gesetze) im Standardbrowser öffnen
        .plugin(tauri_plugin_opener::init())
        // automatische Updates: signiertes Manifest (tauri.conf.json → plugins.updater)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Formulare: eigene Sperrdateien
        .manage(EigeneSperren::default())
        .invoke_handler(tauri::generate_handler![
            qgis_suchen,
            qgis_ausfuehren,
            // Projekt: Dateien umbenennen (Mails)
            projekt_datei_umbenennen,
            // gemeinsam
            konfig_basis,
            konfig_dateien,
            konfig_schreiben_wenn,
            ordner_erreichbar,
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
            // Formulare (apps/formulare/src-tauri/src/befehle.rs – dieselbe Liste wie dort in lib.rs)
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
            doc_delete,
            process_info,
            prokarte_read,
            prokarte_write,
            machine_info,
            open_path,
            // AVA (apps/ava/src-tauri/src/befehle.rs – dieselbe Liste wie dort in lib.rs)
            ava_ersetzen,
            ava_office_offen,
            ava_umbenennen,
            ava_scan_uebernehmen,
            ava_oeffnen,
            ava_mail_entwurf,
            ava_temp_oeffnen,
            // Rahmen
            rahmen_formulare_freigeben
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
