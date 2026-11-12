//! Desktop-Hülle der AVA-App (Ausschreibung, Vergabe, Abrechnung, Bauleitung). Die allgemeinen Befehle
//! (Speichern-Dialoge, Protokoll, Projektordner lesen und Dateien anlegen) stehen in packages/core/tauri/commands.rs,
//! die eigenen (Dateien ersetzen und umbenennen, Scans übernehmen, Mailentwürfe) in befehle.rs.

include!("../../../../packages/core/tauri/commands.rs");
include!("befehle.rs");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(log_plugin("ava"))
        .plugin(tauri_plugin_dialog::init())
        // Links im Standardbrowser öffnen
        .plugin(tauri_plugin_opener::init())
        // automatische Updates: signiertes Manifest je App (tauri.conf.json → plugins.updater)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
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
            ava_ersetzen,
            ava_office_offen,
            ava_umbenennen,
            ava_scan_uebernehmen,
            ava_oeffnen,
            ava_mail_entwurf,
            ava_temp_oeffnen
        ])
        .setup(|app| {
            log::info!("AVA {} gestartet", app.package_info().version);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Anwendung");
}
