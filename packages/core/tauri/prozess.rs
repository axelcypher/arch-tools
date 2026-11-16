// Externe Programme mit Zeitlimit starten (QGIS, Excel/LibreOffice für PDF). Per include! in die Hüllen eingebunden,
// vor qgis.rs bzw. pdf.rs – einmal je Hülle.

/// „2 Minuten“, „30 Sekunden“
fn dauer_text(d: std::time::Duration) -> String {
    let s = d.as_secs();
    if s >= 120 && s % 60 == 0 {
        format!("{} Minuten", s / 60)
    } else if s == 60 {
        "1 Minute".into()
    } else if s == 1 {
        "1 Sekunde".into()
    } else {
        format!("{s} Sekunden")
    }
}

/// Prozess samt allen Kindprozessen beenden. Unter Windows startet qgis_process-qgis(-ltr).bat einen cmd.exe, der
/// qgis_process.exe und Python startet; `kill()` beendete nur cmd.exe – QGIS liefe verwaist weiter, hielte die
/// Ausgabe-Pipes und den Temp-Ordner offen. Deshalb dort `taskkill /T /F` für den ganzen Baum.
fn prozessbaum_beenden(kind: &mut std::process::Child) {
    pid_baum_beenden(kind.id(), None);
    let _ = kind.kill();
    let _ = kind.wait();
}

/// Prozess mit dieser Nummer samt Kindprozessen beenden (Windows: `taskkill /T /F`; sonst nichts – dort beendet
/// `kill()` das Kind, und Excel gibt es nur unter Windows). Mit `abbild` nur, wenn die Nummer noch zu diesem Programm
/// gehört (z. B. „EXCEL.EXE“) – Windows vergibt Nummern schnell neu.
fn pid_baum_beenden(nr: u32, abbild: Option<&str>) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // voller Pfad (PATH könnte verändert sein), sonst über PATH
        let taskkill = std::env::var("SystemRoot").map(|r| format!("{r}\\System32\\taskkill.exe")).unwrap_or_else(|_| "taskkill".into());
        let mut c = std::process::Command::new(taskkill);
        c.args(["/PID", &nr.to_string(), "/T", "/F"]);
        if let Some(a) = abbild {
            c.args(["/FI", &format!("IMAGENAME eq {a}")]);
        }
        let _ = c.creation_flags(0x0800_0000).status();
    }
    #[cfg(not(windows))]
    let _ = (nr, abbild);
}

/// Programm ausführen, Ausgaben sammeln; nach `limit` samt Kindprozessen beenden. Fehlertext bei Zeitüberschreitung.
/// Die Ausgaben werden höchstens 10 s nach dem Ende abgewartet – hält ein verwaister Enkelprozess die Pipe offen,
/// geht es ohne den Rest weiter, statt zu hängen.
fn mit_zeitlimit(cmd: &mut std::process::Command, limit: std::time::Duration, name: &str) -> Result<std::process::Output, String> {
    use std::io::Read;
    use std::process::Stdio;
    let mut kind = cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    // Ausgaben in eigenen Fäden lesen – sonst blockiert das Programm bei vollem Puffer und das Zeitlimit liefe ins Leere
    let out = kind.stdout.take().ok_or("keine Ausgabe")?;
    let err = kind.stderr.take().ok_or("keine Fehlerausgabe")?;
    let lesen = |mut r: Box<dyn Read + Send>| {
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut b = Vec::new();
            let _ = r.read_to_end(&mut b);
            let _ = tx.send(b);
        });
        rx
    };
    let lies_out = lesen(Box::new(out));
    let lies_err = lesen(Box::new(err));
    let frist = std::time::Duration::from_secs(10);
    let beginn = std::time::Instant::now();
    let status = loop {
        match kind.try_wait().map_err(|e| e.to_string())? {
            Some(s) => break s,
            None if beginn.elapsed() >= limit => {
                prozessbaum_beenden(&mut kind);
                return Err(format!("{name} hat nach {} nicht geantwortet und wurde beendet.", dauer_text(limit)));
            }
            None => std::thread::sleep(std::time::Duration::from_millis(200)),
        }
    };
    Ok(std::process::Output { status, stdout: lies_out.recv_timeout(frist).unwrap_or_default(), stderr: lies_err.recv_timeout(frist).unwrap_or_default() })
}


#[cfg(test)]
mod prozess_tests {
    use super::*;

    #[test]
    fn dauer_als_text() {
        assert_eq!(dauer_text(std::time::Duration::from_secs(120)), "2 Minuten");
        assert_eq!(dauer_text(std::time::Duration::from_secs(60)), "1 Minute");
        assert_eq!(dauer_text(std::time::Duration::from_secs(1)), "1 Sekunde");
        assert_eq!(dauer_text(std::time::Duration::from_secs(90)), "90 Sekunden");
    }

    #[cfg(unix)]
    #[test]
    fn haengender_prozess_wird_beendet_mit_namen() {
        let r = mit_zeitlimit(std::process::Command::new("sleep").arg("30"), std::time::Duration::from_secs(1), "Excel");
        assert_eq!(r.unwrap_err(), "Excel hat nach 1 Sekunde nicht geantwortet und wurde beendet.");
    }
}
