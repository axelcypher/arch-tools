// Dateien in einem Projektordner umbenennen – für die App „Projekt“ (Mails nach dem Schema benennen). Per include! in
// die Hüllen von Projektordner und Rahmen-App eingebunden (nach commands.rs: projekt_unterhalb, log).
//
// Nur innerhalb des gewählten Projektordners, nur Dateien (keine Ordner, keine Verknüpfungen), die Endung bleibt, der
// Zielordner muss es schon geben, und eine vorhandene Datei wird nie überschrieben: Gibt es das Ziel schon, bleibt
// alles, wie es ist (Ok(false)). Gelöscht wird nichts.

/// Benennt `alt` in `neu` um (beide relativ zu `root`, mit „/“ getrennt). `true` = umbenannt, `false` = das Ziel gibt
/// es schon (nichts geändert).
#[tauri::command]
async fn projekt_datei_umbenennen(root: String, alt: String, neu: String) -> Result<bool, String> {
    let von = projekt_unterhalb(&root, &alt)?;
    let nach = projekt_unterhalb(&root, &neu)?;
    let meta = std::fs::symlink_metadata(&von).map_err(|e| format!("{}: {}", von.display(), e))?;
    if !meta.is_file() {
        return Err(format!("{}: keine Datei", von.display()));
    }
    let endung = |p: &std::path::Path| p.extension().map(|e| e.to_string_lossy().to_lowercase());
    if endung(&von) != endung(&nach) {
        return Err(format!("{}: die Endung der Datei darf sich nicht ändern", nach.display()));
    }
    match nach.parent() {
        Some(p) if p.is_dir() => {}
        _ => return Err(format!("{}: den Zielordner gibt es nicht", nach.display())),
    }
    // nur die Groß-/Kleinschreibung ändert sich (unter Windows dieselbe Datei) – das ist erlaubt
    let nur_schreibweise = von.to_string_lossy().to_lowercase() == nach.to_string_lossy().to_lowercase();
    if von == nach {
        return Ok(true);
    }
    if !nur_schreibweise && std::fs::symlink_metadata(&nach).is_ok() {
        return Ok(false);
    }
    std::fs::rename(&von, &nach).map_err(|e| {
        // Windows: ERROR_SHARING_VIOLATION (32) bzw. ERROR_LOCK_VIOLATION (33) – etwa in Outlook geöffnet
        if matches!(e.raw_os_error(), Some(32) | Some(33)) {
            format!("{}: Die Datei ist in einem anderen Programm geöffnet (z. B. Outlook) – bitte dort schließen", von.display())
        } else {
            format!("{} → {}: {}", von.display(), nach.display(), e)
        }
    })?;
    log::info!("Datei umbenannt: {} → {}", von.display(), nach.display());
    Ok(true)
}
