//! Desktop-Hülle der App „Projekt“ (früher „Projektordner“; Kennung und Installer-Name bleiben). Alle Befehle – Dialoge, Protokoll, Projektordner und
//! Konfigurationsordner – stehen gemeinsam für alle Apps in packages/core/tauri/commands.rs.
//!
//! Grundsatz: In Projektordnern werden nur neue Ordner und Dateien angelegt; ersetzt wird allein die
//! Projektdatei (.oap), mit Sicherungskopie. Nichts wird verschoben oder gelöscht, und jeder Pfad bleibt
//! innerhalb des vom Benutzer gewählten Ordners.
//!
//! Katasterpläne: QGIS im Hintergrund (qgis_process, packages/core/tauri/qgis.rs) – die Pläne werden nur neu
//! angelegt, nie überschrieben.

include!("../../../../packages/core/tauri/commands.rs");
include!("../../../../packages/core/tauri/qgis.rs");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(log_plugin("projektordner"))
        .plugin(tauri_plugin_dialog::init())
        // Links (Normen, Gesetze) im Standardbrowser öffnen
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
            qgis_suchen,
            qgis_ausfuehren
        ])
        .setup(|app| {
            log::info!("Projektordner {} gestartet", app.package_info().version);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Anwendung");
}
