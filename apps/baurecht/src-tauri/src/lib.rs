//! Desktop-Hülle der App Baurecht. Gemeinsame Befehle (Dialoge, Protokoll, Projektordner, Konfigurationsordner)
//! stehen in packages/core/tauri/commands.rs; Netzabruf (Rechtsquellen, Geodienste, Regelpaket) und die Ablage des
//! Rechtsstands in netz.rs – beides auch in der Rahmen-App eingebunden.
//!
//! Grundsatz: In Projektordnern wird nur die Projektdatei (.oap) ersetzt, mit Sicherungskopie; ins Netz geht es nur
//! zu freigegebenen Hosts.

include!("../../../../packages/core/tauri/commands.rs");
include!("netz.rs");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(log_plugin("baurecht"))
        .plugin(tauri_plugin_dialog::init())
        // Links (Gesetzestexte, Satzungen) im Standardbrowser öffnen
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
            netz_holen,
            netz_hosts_erweitern,
            baurecht_ablage_lesen,
            baurecht_ablage_schreiben
        ])
        .setup(|app| {
            log::info!("Baurecht {} gestartet", app.package_info().version);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Anwendung");
}
