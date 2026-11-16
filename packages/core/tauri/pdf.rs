// PDF aus einer Excel-Datei (gefüllte Excel-Vorlage) – für den Export von QUADRIO, TERRIO und NUMIO. Per include! in die
// Hüllen eingebunden (nach commands.rs: base64, und prozess.rs: Zeitlimit).
//
// Gewandelt wird über ein installiertes Microsoft Excel (PowerShell + COM, ExportAsFixedFormat), ersatzweise über
// LibreOffice ohne Oberfläche. Beide drucken die Arbeitsmappe so, wie sie eingerichtet ist: Druckbereich, Kopf- und
// Fußzeile, Skalierung und Seitenformat der Vorlage bleiben erhalten. Jeder Versuch hat ein Zeitlimit; danach wird der
// ganze Prozessbaum beendet (Excel bzw. soffice liefen sonst verwaist weiter). Gearbeitet wird in einem eigenen
// temporären Ordner, der danach gelöscht wird.

/// so lange darf eine Wandlung dauern (Excel startet beim ersten Mal langsam)
const PDF_ZEITLIMIT: std::time::Duration = std::time::Duration::from_secs(120);

/// Meldung, wenn keines der Programme gefunden wurde – nennt, was gebraucht wird
const PDF_KEIN_PROGRAMM: &str = "Für das PDF wird Microsoft Excel oder LibreOffice gebraucht – keines davon wurde auf diesem Rechner gefunden. Bitte eines davon installieren oder nur die Excel-Datei speichern.";

/// Rückgabewert des PowerShell-Skripts, wenn Excel nicht installiert bzw. nicht registriert ist
const PDF_EXCEL_FEHLT: i32 = 3;

#[derive(Debug, Clone, PartialEq)]
// Excel gibt es nur unter Windows (außerhalb der Tests sonst nie erzeugt)
#[cfg_attr(not(windows), allow(dead_code))]
enum PdfWandler {
    /// Microsoft Excel über PowerShell und COM
    Excel { powershell: std::path::PathBuf },
    /// LibreOffice ohne Oberfläche (soffice --headless --convert-to pdf)
    LibreOffice { soffice: std::path::PathBuf },
}

impl PdfWandler {
    fn name(&self) -> &'static str {
        match self {
            PdfWandler::Excel { .. } => "Microsoft Excel",
            PdfWandler::LibreOffice { .. } => "LibreOffice",
        }
    }
}

/// Text in einfachen Anführungszeichen für PowerShell (' wird verdoppelt)
fn ps_text(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Datei, in die das Skript die Prozessnummer von EXCEL.EXE schreibt: Excel startet über DCOM und ist kein Kind von
/// PowerShell – beim Zeitlimit beendet das Beenden des Prozessbaums es deshalb nicht mit
fn pdf_excel_pid_datei(ordner: &std::path::Path) -> std::path::PathBuf {
    ordner.join("excel.pid")
}

/// PowerShell-Skript: Excel unsichtbar starten, seine Prozessnummer ablegen, Mappe schreibgeschützt öffnen, als PDF
/// ausgeben (Typ 0 = PDF, Qualität Standard, Dokumenteigenschaften mit, Druckbereiche beachten), Excel in jedem Fall
/// beenden. Fehlt Excel: Rückgabe 3. Fehlermeldungen in UTF-8 (sonst OEM-Zeichensatz).
fn pdf_excel_skript(ein: &std::path::Path, aus: &std::path::Path, pid: &std::path::Path) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'\n\
         [Console]::OutputEncoding = [Text.Encoding]::UTF8\n\
         try {{ $x = New-Object -ComObject Excel.Application }} catch {{ exit {PDF_EXCEL_FEHLT} }}\n\
         try {{\n\
           Add-Type -Namespace ArchTools -Name Fenster -MemberDefinition '[DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);'\n\
           $nr = [uint32]0; [void][ArchTools.Fenster]::GetWindowThreadProcessId([IntPtr]$x.Hwnd, [ref]$nr); Set-Content -LiteralPath {} -Value $nr\n\
         }} catch {{ }}\n\
         try {{\n\
           $x.Visible = $false; $x.DisplayAlerts = $false; $x.ScreenUpdating = $false\n\
           $wb = $x.Workbooks.Open({}, 0, $true)\n\
           $wb.ExportAsFixedFormat(0, {}, 0, $true, $false)\n\
           $wb.Close($false)\n\
         }} finally {{ $x.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($x) }}\n",
        ps_text(&pid.to_string_lossy()),
        ps_text(&ein.to_string_lossy()),
        ps_text(&aus.to_string_lossy())
    )
}

/// Pfad als file:-URL (für das eigene LibreOffice-Profil im temporären Ordner)
fn datei_url(p: &std::path::Path) -> String {
    let s = p.to_string_lossy().replace('\\', "/");
    if s.starts_with('/') {
        format!("file://{s}")
    } else {
        format!("file:///{s}")
    }
}

/// Befehl für einen Wandler; das PDF entsteht im Ordner `ordner` unter dem Namen der Eingabedatei mit .pdf
fn pdf_befehl(w: &PdfWandler, ein: &std::path::Path, ordner: &std::path::Path) -> std::process::Command {
    let mut cmd = match w {
        PdfWandler::Excel { powershell } => {
            let mut c = std::process::Command::new(powershell);
            c.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"]).arg(pdf_excel_skript(ein, &pdf_ziel(ein, ordner), &pdf_excel_pid_datei(ordner)));
            c
        }
        PdfWandler::LibreOffice { soffice } => {
            let mut c = std::process::Command::new(soffice);
            // eigenes Profil: ein bereits geöffnetes LibreOffice blockiert die Wandlung sonst
            c.arg("--headless")
                .arg("--norestore")
                .arg("--nologo")
                .arg(format!("-env:UserInstallation={}", datei_url(&ordner.join("lo-profil"))))
                .args(["--convert-to", "pdf", "--outdir"])
                .arg(ordner)
                .arg(ein);
            c
        }
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // kein Konsolenfenster
        cmd.creation_flags(0x0800_0000);
    }
    cmd.current_dir(ordner);
    cmd
}

/// Pfad des erzeugten PDF
fn pdf_ziel(ein: &std::path::Path, ordner: &std::path::Path) -> std::path::PathBuf {
    ordner.join(ein.with_extension("pdf").file_name().unwrap_or_default())
}

/// Wandler in der Reihenfolge Excel, LibreOffice – nur, was es auf diesem Rechner gibt
fn pdf_wandler_suchen() -> Vec<PdfWandler> {
    let mut w = Vec::new();
    #[cfg(windows)]
    {
        let ps = std::env::var("SystemRoot").map(|r| std::path::PathBuf::from(format!("{r}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")));
        if let Ok(ps) = ps {
            if ps.is_file() {
                w.push(PdfWandler::Excel { powershell: ps });
            }
        }
        for var in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
            if let Ok(pf) = std::env::var(var) {
                let s = std::path::PathBuf::from(pf).join("LibreOffice").join("program").join("soffice.exe");
                if s.is_file() && !w.contains(&PdfWandler::LibreOffice { soffice: s.clone() }) {
                    w.push(PdfWandler::LibreOffice { soffice: s });
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        for s in ["/usr/bin/soffice", "/usr/bin/libreoffice", "/usr/local/bin/soffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"] {
            let p = std::path::PathBuf::from(s);
            if p.is_file() {
                w.push(PdfWandler::LibreOffice { soffice: p });
                break;
            }
        }
    }
    w
}

/// Prozessnummer von Excel aus der Datei des Skripts (fehlt, wenn Excel nicht gestartet ist)
fn pdf_excel_pid(ordner: &std::path::Path) -> Option<u32> {
    std::fs::read_to_string(pdf_excel_pid_datei(ordner)).ok()?.trim().trim_start_matches('\u{feff}').parse().ok().filter(|n| *n > 0)
}

/// Excel nach einem gescheiterten Versuch (Zeitlimit, Fehler) beenden, falls es noch läuft – nur nach einem Fehler, nur
/// einmal je Versuch und nur, wenn die Nummer noch zu EXCEL.EXE gehört (Filter in taskkill)
fn pdf_excel_beenden(ordner: &std::path::Path) {
    // nur, wenn die Nummer noch zu Excel gehört (nach $x.Quit() kann sie schon neu vergeben sein)
    pdf_excel_beenden_mit(ordner, &mut |nr| pid_baum_beenden(nr, Some("EXCEL.EXE")));
}

/// wie `pdf_excel_beenden`, das Beenden selbst übergeben (in Tests nachgebildet)
fn pdf_excel_beenden_mit(ordner: &std::path::Path, beenden: &mut dyn FnMut(u32)) {
    let Some(nr) = pdf_excel_pid(ordner) else { return };
    let _ = std::fs::remove_file(pdf_excel_pid_datei(ordner));
    beenden(nr);
}

/// Ausführung eines Befehls mit Zeitlimit (in Tests nachgebildet)
type PdfAusfuehren<'a> = &'a mut dyn FnMut(&mut std::process::Command, std::time::Duration, &str) -> Result<std::process::Output, String>;

/// Wandelt `ein` mit dem ersten Wandler, der gelingt; sammelt die Fehler der übrigen für die Meldung
fn pdf_wandeln_mit(ein: &std::path::Path, ordner: &std::path::Path, wandler: &[PdfWandler], ausfuehren: PdfAusfuehren) -> Result<std::path::PathBuf, String> {
    if wandler.is_empty() {
        return Err(PDF_KEIN_PROGRAMM.into());
    }
    let ziel = pdf_ziel(ein, ordner);
    let mut fehler: Vec<String> = Vec::new();
    for w in wandler {
        let _ = std::fs::remove_file(&ziel);
        let _ = std::fs::remove_file(pdf_excel_pid_datei(ordner));
        let mut cmd = pdf_befehl(w, ein, ordner);
        let ergebnis = ausfuehren(&mut cmd, PDF_ZEITLIMIT, w.name());
        // Excel läuft getrennt von PowerShell: nach einem gescheiterten Versuch eigens beenden
        if matches!(w, PdfWandler::Excel { .. }) && !matches!(&ergebnis, Ok(o) if o.status.success()) {
            pdf_excel_beenden(ordner);
        }
        match ergebnis {
            Err(e) => fehler.push(e),
            Ok(out) if matches!(w, PdfWandler::Excel { .. }) && out.status.code() == Some(PDF_EXCEL_FEHLT) => fehler.push("Microsoft Excel ist nicht installiert".into()),
            Ok(out) => {
                let groesse = std::fs::metadata(&ziel).map(|m| m.len()).unwrap_or(0);
                if out.status.success() && groesse > 0 {
                    return Ok(ziel);
                }
                let text = String::from_utf8_lossy(&out.stderr).trim().lines().last().unwrap_or("").to_string();
                fehler.push(format!("{} hat kein PDF erzeugt{}", w.name(), if text.is_empty() { String::new() } else { format!(" ({text})") }));
            }
        }
    }
    Err(format!("Das PDF konnte nicht erzeugt werden: {}.", fehler.iter().map(|f| f.trim_end_matches('.')).collect::<Vec<_>>().join("; ")))
}

/// Excel-Datei (Base64) → PDF (Base64)
#[tauri::command]
async fn excel_als_pdf(xlsx_base64: String) -> Result<String, String> {
    // bis zu zwei Versuche à 2 Minuten – nicht im asynchronen Befehl blockieren
    tauri::async_runtime::spawn_blocking(move || excel_als_pdf_blockierend(&xlsx_base64)).await.map_err(|e| e.to_string())?
}

fn excel_als_pdf_blockierend(xlsx_base64: &str) -> Result<String, String> {
    let daten = base64::engine::general_purpose::STANDARD.decode(xlsx_base64.as_bytes()).map_err(|e| e.to_string())?;
    let stempel = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let ordner = std::env::temp_dir().join(format!("arch-tools-pdf-{}-{stempel}", std::process::id()));
    std::fs::create_dir_all(&ordner).map_err(|e| e.to_string())?;
    let ein = ordner.join("Berechnung.xlsx");
    let ergebnis = (|| {
        std::fs::write(&ein, &daten).map_err(|e| e.to_string())?;
        let pdf = pdf_wandeln_mit(&ein, &ordner, &pdf_wandler_suchen(), &mut |c, l, n| mit_zeitlimit(c, l, n))?;
        std::fs::read(&pdf).map_err(|e| e.to_string())
    })();
    let _ = std::fs::remove_dir_all(&ordner);
    Ok(base64::engine::general_purpose::STANDARD.encode(ergebnis?))
}

#[cfg(test)]
mod pdf_tests {
    use super::*;

    fn ausgabe(code: i32) -> std::process::Output {
        #[cfg(unix)]
        let status = {
            use std::os::unix::process::ExitStatusExt;
            std::process::ExitStatus::from_raw(code << 8)
        };
        #[cfg(windows)]
        let status = {
            use std::os::windows::process::ExitStatusExt;
            std::process::ExitStatus::from_raw(code as u32)
        };
        std::process::Output { status, stdout: Vec::new(), stderr: b"Fehlertext".to_vec() }
    }

    fn ordner(name: &str) -> std::path::PathBuf {
        let o = std::env::temp_dir().join(format!("pdf-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&o);
        std::fs::create_dir_all(&o).unwrap();
        o
    }

    #[test]
    fn excel_skript_mit_pfaden_und_anfuehrungszeichen() {
        let s = pdf_excel_skript(std::path::Path::new("C:\\Temp\\O'Brien\\Berechnung.xlsx"), std::path::Path::new("C:\\Temp\\O'Brien\\Berechnung.pdf"), std::path::Path::new("C:\\Temp\\O'Brien\\excel.pid"));
        assert!(s.contains("Workbooks.Open('C:\\Temp\\O''Brien\\Berechnung.xlsx', 0, $true)"));
        assert!(s.contains("ExportAsFixedFormat(0, 'C:\\Temp\\O''Brien\\Berechnung.pdf', 0, $true, $false)"));
        assert!(s.contains("exit 3"));
        assert!(s.contains("$x.Quit()"));
        // Prozessnummer von Excel abgelegt (Excel ist kein Kind von PowerShell), Meldungen in UTF-8
        assert!(s.contains("Set-Content -LiteralPath 'C:\\Temp\\O''Brien\\excel.pid'"));
        assert!(s.contains("OutputEncoding = [Text.Encoding]::UTF8"));
    }

    #[test]
    fn excel_pid_aus_datei() {
        let o = ordner("pid");
        assert_eq!(pdf_excel_pid(&o), None);
        std::fs::write(pdf_excel_pid_datei(&o), "\u{feff}4711\r\n").unwrap();
        assert_eq!(pdf_excel_pid(&o), Some(4711));
        // beendet wird genau diese Nummer (nachgebildet – nie einen echten Prozess treffen); danach ist die Datei weg,
        // kein zweiter Versuch auf dieselbe Nummer
        let mut beendet = Vec::new();
        pdf_excel_beenden_mit(&o, &mut |n| beendet.push(n));
        pdf_excel_beenden_mit(&o, &mut |n| beendet.push(n));
        assert_eq!(beendet, [4711]);
        assert_eq!(pdf_excel_pid(&o), None);
        std::fs::write(pdf_excel_pid_datei(&o), "0").unwrap();
        assert_eq!(pdf_excel_pid(&o), None);
    }

    // Pfade mit „/“ – unter Windows erzeugt Path::join „\“
    #[cfg(unix)]
    #[test]
    fn libreoffice_befehl_mit_eigenem_profil() {
        let o = std::path::Path::new("/tmp/arbeit");
        let c = pdf_befehl(&PdfWandler::LibreOffice { soffice: "/usr/bin/soffice".into() }, &o.join("Berechnung.xlsx"), o);
        let args: Vec<String> = c.get_args().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(args, ["--headless", "--norestore", "--nologo", "-env:UserInstallation=file:///tmp/arbeit/lo-profil", "--convert-to", "pdf", "--outdir", "/tmp/arbeit", "/tmp/arbeit/Berechnung.xlsx"]);
        assert_eq!(datei_url(std::path::Path::new("C:\\Temp\\x")), "file:///C:/Temp/x");
    }

    #[test]
    fn ohne_programm_klare_meldung() {
        let o = ordner("leer");
        let r = pdf_wandeln_mit(&o.join("Berechnung.xlsx"), &o, &[], &mut |_, _, _| unreachable!());
        assert_eq!(r.unwrap_err(), PDF_KEIN_PROGRAMM);
    }

    #[test]
    fn ohne_excel_weiter_mit_libreoffice() {
        let o = ordner("ersatz");
        let ein = o.join("Berechnung.xlsx");
        let wandler = [PdfWandler::Excel { powershell: "powershell.exe".into() }, PdfWandler::LibreOffice { soffice: "soffice".into() }];
        let mut aufrufe = Vec::new();
        let ziel = o.join("Berechnung.pdf");
        let r = pdf_wandeln_mit(&ein, &o, &wandler, &mut |_, limit, name| {
            aufrufe.push((name.to_string(), limit));
            if name == "LibreOffice" {
                std::fs::write(&ziel, b"%PDF-1.7").unwrap();
                Ok(ausgabe(0))
            } else {
                Ok(ausgabe(PDF_EXCEL_FEHLT))
            }
        });
        assert_eq!(r.unwrap(), o.join("Berechnung.pdf"));
        assert_eq!(aufrufe, vec![("Microsoft Excel".to_string(), PDF_ZEITLIMIT), ("LibreOffice".to_string(), PDF_ZEITLIMIT)]);
    }

    #[test]
    fn zeitlimit_und_leeres_ergebnis_werden_gemeldet() {
        let o = ordner("fehler");
        let ein = o.join("Berechnung.xlsx");
        let wandler = [PdfWandler::Excel { powershell: "powershell.exe".into() }, PdfWandler::LibreOffice { soffice: "soffice".into() }];
        let r = pdf_wandeln_mit(&ein, &o, &wandler, &mut |_, _, name| {
            if name == "Microsoft Excel" {
                Err("Microsoft Excel hat nach 2 Minuten nicht geantwortet und wurde beendet.".into())
            } else {
                Ok(ausgabe(0))
            }
        });
        assert_eq!(
            r.unwrap_err(),
            "Das PDF konnte nicht erzeugt werden: Microsoft Excel hat nach 2 Minuten nicht geantwortet und wurde beendet; LibreOffice hat kein PDF erzeugt (Fehlertext)."
        );
    }
}
