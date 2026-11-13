// Dateien in einem Projektordner umbenennen – für die App „Projekt“ (Mails nach dem Schema benennen). Per include! in
// die Hüllen von Projektordner und Rahmen-App eingebunden (nach commands.rs: projekt_unterhalb, log).
//
// Nur innerhalb des gewählten Projektordners, nur Dateien (keine Ordner, keine Verknüpfungen), die Endung bleibt, der
// Zielordner muss es schon geben, und eine vorhandene Datei wird nie überschrieben: Gibt es das Ziel schon, bleibt
// alles, wie es ist (Ok(false)). Gelöscht wird nichts.

/// Zeigen beide Pfade auf dieselbe Datei? (gleicher Pfad ohne Rücksicht auf die Schreibweise und dieselbe Datei auf
/// dem Datenträger – Windows: Volume und Dateinummer über die kanonischen Pfade, sonst Gerät und Inode)
fn gleiche_datei(a: &std::path::Path, b: &std::path::Path) -> bool {
    if a.to_string_lossy().to_lowercase() != b.to_string_lossy().to_lowercase() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        // symlink_metadata: zwei Verknüpfungen auf dasselbe Ziel sind nicht dieselbe Datei
        match (std::fs::symlink_metadata(a), std::fs::symlink_metadata(b)) {
            (Ok(x), Ok(y)) => x.dev() == y.dev() && x.ino() == y.ino(),
            _ => false,
        }
    }
    #[cfg(not(unix))]
    {
        match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
            (Ok(x), Ok(y)) => x == y,
            _ => false,
        }
    }
}

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
    if von == nach {
        return Ok(true);
    }
    // gibt es das Ziel schon, nie überschreiben – außer es ist dieselbe Datei in anderer Schreibweise (Windows, macOS:
    // Groß-/Kleinschreibung egal). Auf einem Dateisystem, das sie unterscheidet, ist ein Ziel in anderer Schreibweise
    // eine andere Datei und bleibt unangetastet.
    if std::fs::symlink_metadata(&nach).is_ok() && !gleiche_datei(&von, &nach) {
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

#[cfg(test)]
mod umbenennen_tests {
    use super::*;

    // nur Linux: macOS (APFS) unterscheidet Groß-/Kleinschreibung standardmäßig nicht
    #[cfg(target_os = "linux")]
    #[test]
    fn gleiche_datei_nur_bei_derselben_datei() {
        let d = std::env::temp_dir().join(format!("umbenennen-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("Mail.msg"), "a").unwrap();
        assert!(gleiche_datei(&d.join("Mail.msg"), &d.join("Mail.msg")));
        // andere Schreibweise: auf einem Dateisystem mit Groß-/Kleinschreibung eine andere Datei
        std::fs::write(d.join("mail.msg"), "b").unwrap();
        assert!(!gleiche_datei(&d.join("Mail.msg"), &d.join("mail.msg")));
        assert!(!gleiche_datei(&d.join("Mail.msg"), &d.join("x.msg")));
        let _ = std::fs::remove_dir_all(&d);
    }
}
