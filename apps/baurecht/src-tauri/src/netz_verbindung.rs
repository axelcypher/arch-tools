// Verbindungsaufbau für netz.rs: Zertifikatsprüfung, Proxy, verständliche Fehler und die Diagnose „Verbindung prüfen“.
// Ohne Tauri-Abhängigkeit (testbar für sich); per include! aus netz.rs eingebunden – also auch in der Rahmen-App.
//
// Warum: In Büronetzen prüfen Firewalls und Virenschutz HTTPS oft selbst und signieren die Verbindung mit einer eigenen
// Stamm-CA neu. Diese CA steht im Zertifikatspeicher von Windows (Browser vertrauen ihr), die fest eingebauten
// Stammzertifikate von rustls kennen sie nicht („invalid peer certificate: UnknownIssuer“). Deshalb prüft LEXIO
// Zertifikate wie das Betriebssystem (rustls-platform-verifier: unter Windows mit der Zertifikatskette von Windows,
// unter Linux mit den Stammzertifikaten des Systems) – zusätzlich gelten die mitgelieferten Stammzertifikate
// (webpki-root-certs), falls der Systemspeicher unvollständig ist. Ohne OpenSSL bzw. native-tls.
//
// Proxy: zuerst die Umgebung (HTTPS_PROXY, ALL_PROXY, HTTP_PROXY, NO_PROXY), sonst unter Windows die Internetoptionen
// (HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings: ProxyEnable, ProxyServer, ProxyOverride). Ein
// Proxy-Skript (AutoConfigURL) bzw. „Einstellungen automatisch erkennen“ wird erkannt, aber nicht ausgewertet – die
// Fehlermeldung und die Diagnose nennen es.

// Keine `use`-Zeilen auf oberster Ebene (siehe netz.rs).

/// Hosts, die „Verbindung prüfen“ testet: die Rechtsquellen und die Geodienste NRW
const NETZ_PRUEF_HOSTS: &[&str] = &["www.gesetze-im-internet.de", "testphase.rechtsinformationen.bund.de", "recht.nrw.de", "www.dibt.de", "www.wfs.nrw.de"];

/* ---------- Zertifikate ---------- */

/// TLS-Einstellungen mit der Zertifikatsprüfung des Betriebssystems (plus mitgelieferte Stammzertifikate);
/// `pruefer` umhüllt die Prüfung (Diagnose: Kette mitschreiben)
fn netz_tls_mit(
    pruefer: impl FnOnce(std::sync::Arc<dyn rustls::client::danger::ServerCertVerifier>) -> std::sync::Arc<dyn rustls::client::danger::ServerCertVerifier>,
) -> Result<std::sync::Arc<rustls::ClientConfig>, String> {
    let anbieter = std::sync::Arc::new(rustls::crypto::ring::default_provider());
    let system = rustls_platform_verifier::Verifier::new_with_extra_roots(webpki_root_certs::TLS_SERVER_ROOT_CERTS.iter().cloned(), anbieter.clone())
        .map_err(|e| format!("Zertifikatsprüfung nicht verfügbar: {e}"))?;
    let config = rustls::ClientConfig::builder_with_provider(anbieter)
        .with_safe_default_protocol_versions()
        .map_err(|e| format!("TLS nicht verfügbar: {e}"))?
        .dangerous()
        .with_custom_certificate_verifier(pruefer(std::sync::Arc::new(system)))
        .with_no_client_auth();
    Ok(std::sync::Arc::new(config))
}

/// TLS-Einstellungen für alle Abrufe (einmal aufgebaut)
fn netz_tls() -> Result<std::sync::Arc<rustls::ClientConfig>, String> {
    static TLS: std::sync::OnceLock<Result<std::sync::Arc<rustls::ClientConfig>, String>> = std::sync::OnceLock::new();
    TLS.get_or_init(|| netz_tls_mit(|p| p)).clone()
}

/// Prüfung, die die vorgelegte Zertifikatskette mitschreibt (für „Verbindung prüfen“: wer hat das Zertifikat ausgestellt?)
#[derive(Debug)]
struct NetzKettenPruefer {
    innen: std::sync::Arc<dyn rustls::client::danger::ServerCertVerifier>,
    kette: std::sync::Arc<std::sync::Mutex<Vec<Vec<u8>>>>,
}

impl rustls::client::danger::ServerCertVerifier for NetzKettenPruefer {
    fn verify_server_cert(
        &self,
        end_entity: &rustls::pki_types::CertificateDer<'_>,
        intermediates: &[rustls::pki_types::CertificateDer<'_>],
        server_name: &rustls::pki_types::ServerName<'_>,
        ocsp_response: &[u8],
        now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        if let Ok(mut k) = self.kette.lock() {
            *k = std::iter::once(end_entity).chain(intermediates).map(|c| c.as_ref().to_vec()).collect();
        }
        self.innen.verify_server_cert(end_entity, intermediates, server_name, ocsp_response, now)
    }
    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        self.innen.verify_tls12_signature(message, cert, dss)
    }
    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        self.innen.verify_tls13_signature(message, cert, dss)
    }
    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        self.innen.supported_verify_schemes()
    }
}

/// ein DER-Element: (Tag, Inhalt, Rest)
fn der_element(d: &[u8]) -> Option<(u8, &[u8], &[u8])> {
    let (&tag, rest) = d.split_first()?;
    let (&l, rest) = rest.split_first()?;
    let (laenge, rest) = if l < 0x80 {
        (l as usize, rest)
    } else {
        let n = (l & 0x7f) as usize;
        if n == 0 || n > 4 || rest.len() < n {
            return None;
        }
        (rest[..n].iter().fold(0usize, |a, &b| (a << 8) | b as usize), &rest[n..])
    };
    (rest.len() >= laenge).then(|| (tag, &rest[..laenge], &rest[laenge..]))
}

/// Text eines Namensteils (UTF8String, PrintableString, IA5String, TeletexString, BMPString)
fn der_text(tag: u8, inhalt: &[u8]) -> Option<String> {
    match tag {
        0x0c | 0x13 | 0x16 | 0x14 => Some(String::from_utf8_lossy(inhalt).into_owned()),
        0x1e => Some(String::from_utf16_lossy(&inhalt.chunks(2).filter(|c| c.len() == 2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect::<Vec<_>>())),
        _ => None,
    }
}

/// lesbarer X.500-Name: „CN (O)“ bzw. was davon da ist
fn der_name(name: &[u8]) -> Option<String> {
    let (mut cn, mut o) = (None, None);
    let mut rest = name;
    while let Some((_, menge, weiter)) = der_element(rest) {
        rest = weiter;
        let mut m = menge;
        while let Some((_, paar, w)) = der_element(m) {
            m = w;
            let Some((0x06, oid, wert)) = der_element(paar) else { continue };
            let Some((t, text, _)) = der_element(wert) else { continue };
            match oid {
                [0x55, 0x04, 0x03] => cn = der_text(t, text),
                [0x55, 0x04, 0x0a] => o = der_text(t, text),
                _ => {}
            }
        }
    }
    match (cn, o) {
        (Some(c), Some(o)) if c != o => Some(format!("{c} ({o})")),
        (Some(c), _) => Some(c),
        (None, Some(o)) => Some(o),
        (None, None) => None,
    }
}

/// Aussteller eines Zertifikats (DER) als Text
fn zertifikat_aussteller(der: &[u8]) -> Option<String> {
    let (0x30, zert, _) = der_element(der)? else { return None };
    let (0x30, tbs, _) = der_element(zert)? else { return None };
    let mut rest = tbs;
    // [0] Version (optional), Seriennummer, Signaturverfahren, dann der Aussteller
    if rest.first() == Some(&0xa0) {
        rest = der_element(rest)?.2;
    }
    let rest = der_element(rest)?.2;
    let rest = der_element(rest)?.2;
    let (0x30, aussteller, _) = der_element(rest)? else { return None };
    der_name(aussteller)
}

/* ---------- Proxy ---------- */

/// Proxy-Einstellungen aus den Windows-Internetoptionen (für Tests als Eingabe)
#[derive(Debug, Clone, Default, PartialEq)]
struct NetzWinProxy {
    aktiv: bool,
    server: Option<String>,
    ausnahmen: Option<String>,
    /// Proxy-Skript (AutoConfigURL)
    skript: Option<String>,
}

/// gewählter Proxy für einen Host
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NetzProxyWahl {
    /// http://host:port, falls einer genutzt wird
    proxy: Option<String>,
    /// woher: „Umgebung“, „Windows“, „Ausnahme (NO_PROXY)“, „Ausnahme in Windows“ oder „keiner“
    quelle: String,
    /// was nicht unterstützt wird (Proxy-Skript, https-Proxy, SOCKS)
    hinweis: Option<String>,
}

/// Internetoptionen von Windows lesen (sonst nichts)
fn netz_win_proxy() -> Option<NetzWinProxy> {
    #[cfg(windows)]
    {
        let k = windows_registry::CURRENT_USER.open(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings").ok()?;
        let text = |n: &str| k.get_string(n).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        return Some(NetzWinProxy { aktiv: k.get_u32("ProxyEnable").map(|v| v != 0).unwrap_or(false), server: text("ProxyServer"), ausnahmen: text("ProxyOverride"), skript: text("AutoConfigURL") });
    }
    #[allow(unreachable_code)]
    None
}

/// Eintrag „ProxyServer“: „host:port“ für alle oder „http=host:port;https=host:port;…“ – für https gilt „https=“, sonst „http=“
fn netz_proxy_server(server: &str) -> Option<String> {
    let s = server.trim();
    if !s.contains('=') {
        return Some(s.to_string()).filter(|s| !s.is_empty());
    }
    let teil = |art: &str| s.split(';').find_map(|t| t.trim().strip_prefix(art).map(|r| r.trim().to_string())).filter(|r| !r.is_empty());
    teil("https=").or_else(|| teil("http="))
}

/// Host bei einer Ausnahme der Internetoptionen („ProxyOverride“: „*.intern;10.*;<local>“)
fn netz_win_ausgenommen(host: &str, ausnahmen: &str) -> bool {
    ausnahmen.split(';').map(|a| a.trim().to_ascii_lowercase()).filter(|a| !a.is_empty()).any(|a| {
        if a == "<local>" {
            return !host.contains('.');
        }
        match a.split_once('*') {
            None => host == a,
            Some((anfang, ende)) => host.len() >= anfang.len() + ende.len() && host.starts_with(anfang) && host.ends_with(ende),
        }
    })
}

/// Host bei NO_PROXY („intern.de,.example.org,*“)
fn netz_no_proxy(host: &str, liste: &str) -> bool {
    if liste.trim() == "*" {
        return true;
    }
    liste.split(',').map(|a| a.trim().trim_start_matches('*').trim_start_matches('.').to_ascii_lowercase()).any(|a| !a.is_empty() && (host == a || host.ends_with(&format!(".{a}"))))
}

/// Adresse des Proxys für ureq: nur http (CONNECT); https und SOCKS nicht
fn netz_proxy_adresse(roh: &str) -> Result<String, String> {
    let r = roh.trim().trim_end_matches('/');
    if let Some(rest) = r.strip_prefix("http://") {
        Ok(format!("http://{rest}"))
    } else if r.contains("://") {
        Err(format!("Proxy „{r}“ wird nicht unterstützt (nur http://host:port)"))
    } else {
        Ok(format!("http://{r}"))
    }
}

/// Proxy für einen Host wählen: Umgebung vor Windows; Ausnahmen beachten
fn netz_proxy_waehlen(host: &str, umgebung: &dyn Fn(&str) -> Option<String>, win: Option<&NetzWinProxy>) -> NetzProxyWahl {
    let var = |namen: &[&str]| namen.iter().find_map(|n| umgebung(n).map(|v| v.trim().to_string()).filter(|v| !v.is_empty()));
    if let Some(p) = var(&["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy"]) {
        if var(&["NO_PROXY", "no_proxy"]).map(|n| netz_no_proxy(host, &n)).unwrap_or(false) {
            return NetzProxyWahl { proxy: None, quelle: "Ausnahme (NO_PROXY)".into(), hinweis: None };
        }
        return match netz_proxy_adresse(&p) {
            Ok(a) => NetzProxyWahl { proxy: Some(a), quelle: "Umgebung".into(), hinweis: None },
            Err(h) => NetzProxyWahl { proxy: None, quelle: "Umgebung".into(), hinweis: Some(h) },
        };
    }
    let Some(w) = win else { return NetzProxyWahl { proxy: None, quelle: "keiner".into(), hinweis: None } };
    let skript = w.skript.as_ref().map(|s| format!("In Windows ist ein Proxy-Skript eingestellt ({s}) – LEXIO wertet es nicht aus"));
    if w.aktiv {
        if let Some(server) = w.server.as_deref().and_then(netz_proxy_server) {
            if w.ausnahmen.as_deref().map(|a| netz_win_ausgenommen(host, a)).unwrap_or(false) {
                return NetzProxyWahl { proxy: None, quelle: "Ausnahme in Windows".into(), hinweis: None };
            }
            return match netz_proxy_adresse(&server) {
                Ok(a) => NetzProxyWahl { proxy: Some(a), quelle: "Windows".into(), hinweis: None },
                Err(h) => NetzProxyWahl { proxy: None, quelle: "Windows".into(), hinweis: Some(h) },
            };
        }
    }
    NetzProxyWahl { proxy: None, quelle: "keiner".into(), hinweis: skript }
}

/// Proxy für einen Host aus der echten Umgebung (ein Port gehört nicht zum Host – Ausnahmen gelten je Name)
fn netz_proxy(host: &str) -> NetzProxyWahl {
    let name = host.split(':').next().unwrap_or(host).to_ascii_lowercase();
    netz_proxy_waehlen(&name, &|n| std::env::var(n).ok(), netz_win_proxy().as_ref())
}

/* ---------- Fehler ---------- */

/// Rohfehler des Verbindungsaufbaus übersetzen. Aufbau in Zeilen (die Oberfläche zeigt sie getrennt):
/// 1. „Nicht erreichbar: …“ bzw. „Zeitüberschreitung: …“ – der Anfang erkennt das Frontend als vorübergehenden Fehler,
///    danach ein verständlicher Satz;
/// 2. „Proxy: …“ – genutzter Proxy bzw. was fehlt (nur bei Fehlern, die am Netz liegen);
/// 3. „Technische Einzelheiten: …“ – der Rohfehler (aufklappbar, für die IT bzw. den Support).
fn netz_fehler_text(adresse: &str, roh: &str, proxy: &NetzProxyWahl) -> String {
    let host = netz_host_anzeige(adresse);
    let r = roh.to_ascii_lowercase();
    let ueber = match (&proxy.proxy, &proxy.hinweis) {
        (Some(p), _) => format!("Genutzter Proxy: {p} ({}).", proxy.quelle),
        (None, Some(h)) => format!("{h} – bitte die IT fragen (Proxy als HTTPS_PROXY eintragen)."),
        (None, None) => "Es ist kein Proxy eingestellt.".to_string(),
    };
    // (Anfang, Satz, Proxy nennen)
    let (anfang, satz, mit_proxy) = if r.contains("unknownissuer") || r.contains("unknown issuer") {
        ("Nicht erreichbar", format!("Das Zertifikat der Verbindung zu {host} ist auf diesem Rechner nicht vertrauenswürdig – vermutlich prüft eine Firewall oder ein Virenschutz die verschlüsselte Verbindung mit einem eigenen Zertifikat, das Windows nicht kennt. Bitte die IT bitten, {host} von dieser Prüfung auszunehmen oder das Stammzertifikat der Prüfstelle in Windows zu hinterlegen."), false)
    } else if r.contains("expired") || r.contains("notvalidyet") || r.contains("not valid yet") {
        ("Nicht erreichbar", format!("Das Zertifikat von {host} ist abgelaufen oder noch nicht gültig – bitte Datum und Uhrzeit des Rechners prüfen."), false)
    } else if r.contains("invalid peer certificate") || r.contains("certificate") {
        ("Nicht erreichbar", format!("Das Zertifikat von {host} wurde abgelehnt – vermutlich prüft eine Firewall oder ein Virenschutz die Verbindung."), false)
    } else if r.contains("timed out") || r.contains("timeout") {
        ("Zeitüberschreitung", format!("{host} antwortet nicht rechtzeitig."), true)
    } else if r.contains("dns") || r.contains("failed to lookup") || r.contains("no such host") {
        ("Nicht erreichbar", format!("Die Adresse {host} wird nicht gefunden – keine Internetverbindung, oder das Netz ist nur über einen Proxy erreichbar."), true)
    } else if r.contains("unexpected end of file") || r.contains("unexpectedeof") || r.contains("reset") || r.contains("aborted") || r.contains("tls connection init failed") {
        ("Nicht erreichbar", format!("Die Verbindung zu {host} wurde beim Aufbau abgebrochen – vermutlich blockiert eine Firewall oder ein Proxy sie."), true)
    } else if r.contains("refused") {
        ("Nicht erreichbar", format!("Die Verbindung zu {host} wurde abgewiesen."), true)
    } else {
        ("Nicht erreichbar", format!("{host} ist nicht erreichbar."), true)
    };
    // ureq nennt die Adresse meist selbst – nicht doppelt
    let roh = roh.strip_prefix(&format!("{adresse}: ")).unwrap_or(roh);
    let proxy_zeile = if mit_proxy { format!("\nProxy: {ueber}") } else { String::new() };
    format!("{anfang}: {satz}{proxy_zeile}\nTechnische Einzelheiten: {adresse}: {roh}")
}

/// Host einer Adresse für Texte (sonst die Adresse)
fn netz_host_anzeige(adresse: &str) -> String {
    adresse.strip_prefix("https://").map(|r| r.split(|c| c == '/' || c == '?' || c == '#').next().unwrap_or(r).to_string()).unwrap_or_else(|| adresse.to_string())
}

/* ---------- Diagnose ---------- */

/// Ergebnis von „Verbindung prüfen“ je Host
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NetzPruefung {
    host: String,
    erreichbar: bool,
    status: Option<u16>,
    /// Aussteller des obersten vorgelegten Zertifikats (bei einer Prüfstelle meist ihr Name)
    aussteller: Option<String>,
    proxy: NetzProxyWahl,
    /// verständlicher Fehler (erste Zeile) und Rohtext
    fehler: Option<String>,
    dauer_ms: u64,
}

/// einen Host prüfen: Verbindung mit Zertifikatsprüfung, Aussteller der Kette, Proxy
fn netz_host_pruefen(host: &str, zeit_ms: u64) -> NetzPruefung {
    netz_adresse_pruefen(&format!("https://{host}/"), zeit_ms)
}

/// eine Adresse prüfen (für Tests auch mit Port)
fn netz_adresse_pruefen(adresse: &str, zeit_ms: u64) -> NetzPruefung {
    let host = netz_host_anzeige(adresse);
    let host = host.as_str();
    let adresse = adresse.to_string();
    let proxy = netz_proxy(host);
    let kette = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let start = std::time::Instant::now();
    let k = kette.clone();
    let ergebnis = netz_tls_mit(move |innen| std::sync::Arc::new(NetzKettenPruefer { innen, kette: k })).and_then(|tls| {
        let agent = netz_agent_mit(zeit_ms, tls, &proxy)?;
        match agent.get(&adresse).call() {
            Ok(a) => Ok(a.status()),
            Err(ureq::Error::Status(s, _)) => Ok(s),
            Err(e) => Err(netz_fehler_text(&adresse, &e.to_string(), &proxy)),
        }
    });
    let aussteller = kette.lock().ok().and_then(|k| k.last().and_then(|z| zertifikat_aussteller(z)));
    let dauer_ms = start.elapsed().as_millis() as u64;
    match ergebnis {
        Ok(s) => NetzPruefung { host: host.into(), erreichbar: true, status: Some(s), aussteller, proxy, fehler: None, dauer_ms },
        Err(f) => NetzPruefung { host: host.into(), erreichbar: false, status: None, aussteller, proxy, fehler: Some(f), dauer_ms },
    }
}

/// Agent mit TLS-Einstellungen und gewähltem Proxy (ohne Umleitungen – die verfolgt netz.rs selbst)
fn netz_agent_mit(zeit_ms: u64, tls: std::sync::Arc<rustls::ClientConfig>, proxy: &NetzProxyWahl) -> Result<ureq::Agent, String> {
    let mut b = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_millis(zeit_ms.clamp(1000, 300_000)))
        .redirects(0)
        .tls_config(tls)
        .user_agent(concat!("arch-tools Baurecht/", env!("CARGO_PKG_VERSION"), " (+https://github.com/axelcypher/arch-tools)"));
    if let Some(p) = &proxy.proxy {
        b = b.proxy(ureq::Proxy::new(p).map_err(|e| format!("Proxy „{p}“ ungültig: {e}"))?);
    }
    Ok(b.build())
}

#[cfg(test)]
mod netz_verbindung_tests {
    use super::*;

    #[test]
    fn proxy_aus_den_windows_einstellungen() {
        assert_eq!(netz_proxy_server("proxy.firma.de:8080").as_deref(), Some("proxy.firma.de:8080"));
        assert_eq!(netz_proxy_server("http=p1:80;https=p2:443;ftp=p3:21").as_deref(), Some("p2:443"));
        assert_eq!(netz_proxy_server("http=p1:80;ftp=p3:21").as_deref(), Some("p1:80"));
        assert_eq!(netz_proxy_server("ftp=p3:21"), None);
        assert!(netz_win_ausgenommen("intranet", "<local>"));
        assert!(!netz_win_ausgenommen("recht.nrw.de", "<local>"));
        assert!(netz_win_ausgenommen("recht.nrw.de", "*.intern;*.nrw.de"));
        assert!(netz_win_ausgenommen("10.0.0.1", "10.*"));
        assert!(!netz_win_ausgenommen("www.dibt.de", "*.nrw.de;10.*"));
        let keine = |_: &str| None::<String>;
        let win = NetzWinProxy { aktiv: true, server: Some("http=proxy:3128;https=proxy:3129".into()), ausnahmen: Some("*.nrw.de;<local>".into()), skript: None };
        assert_eq!(netz_proxy_waehlen("www.gesetze-im-internet.de", &keine, Some(&win)), NetzProxyWahl { proxy: Some("http://proxy:3129".into()), quelle: "Windows".into(), hinweis: None });
        assert_eq!(netz_proxy_waehlen("recht.nrw.de", &keine, Some(&win)).proxy, None);
        // abgeschaltet bzw. nur ein Proxy-Skript: kein Proxy, aber ein Hinweis
        let aus = NetzWinProxy { aktiv: false, ..win.clone() };
        assert_eq!(netz_proxy_waehlen("www.dibt.de", &keine, Some(&aus)).proxy, None);
        let skript = NetzWinProxy { aktiv: false, server: None, ausnahmen: None, skript: Some("http://wpad/proxy.pac".into()) };
        let w = netz_proxy_waehlen("www.dibt.de", &keine, Some(&skript));
        assert_eq!(w.proxy, None);
        assert!(w.hinweis.unwrap().contains("Proxy-Skript eingestellt (http://wpad/proxy.pac)"));
        // ohne Windows-Einstellungen (Linux) und ohne Umgebung: keiner
        assert_eq!(netz_proxy_waehlen("www.dibt.de", &keine, None).quelle, "keiner");
    }

    #[test]
    fn proxy_aus_der_umgebung_geht_vor() {
        let win = NetzWinProxy { aktiv: true, server: Some("winproxy:8080".into()), ausnahmen: None, skript: None };
        let env = |n: &str| match n {
            "HTTPS_PROXY" => Some("http://envproxy:3128/".to_string()),
            "NO_PROXY" => Some("localhost,.intern.de".to_string()),
            _ => None,
        };
        assert_eq!(netz_proxy_waehlen("recht.nrw.de", &env, Some(&win)).proxy.as_deref(), Some("http://envproxy:3128"));
        assert_eq!(netz_proxy_waehlen("wiki.intern.de", &env, Some(&win)).proxy, None);
        // https- bzw. SOCKS-Proxy: nicht unterstützt, mit Hinweis
        let socks = |n: &str| (n == "ALL_PROXY").then(|| "socks5://s:1080".to_string());
        let w = netz_proxy_waehlen("recht.nrw.de", &socks, None);
        assert_eq!(w.proxy, None);
        assert!(w.hinweis.unwrap().contains("nicht unterstützt"));
        assert!(netz_no_proxy("x.de", "*"));
        assert!(netz_no_proxy("a.example.org", "*.example.org"));
        assert!(!netz_no_proxy("example.org.boese.de", "example.org"));
    }

    #[test]
    fn fehler_verstaendlich() {
        let kein = NetzProxyWahl { proxy: None, quelle: "keiner".into(), hinweis: None };
        let a = "https://www.gesetze-im-internet.de/bbaug/xml.zip";
        let t = netz_fehler_text(a, "https://www.gesetze-im-internet.de/bbaug/xml.zip: Connection Failed: tls connection init failed: invalid peer certificate: UnknownIssuer", &kein);
        let (erste, zweite) = t.split_once('\n').unwrap();
        assert!(erste.starts_with("Nicht erreichbar: Das Zertifikat der Verbindung zu www.gesetze-im-internet.de ist auf diesem Rechner nicht vertrauenswürdig"));
        // beim Zertifikat keine Proxy-Zeile (es liegt nicht am Proxy)
        assert!(zweite.starts_with("Technische Einzelheiten: https://www.gesetze-im-internet.de/bbaug/xml.zip: "));
        assert!(zweite.contains("UnknownIssuer"));
        // die Adresse steht nur einmal da
        assert_eq!(zweite.matches("bbaug/xml.zip").count(), 1);
        let mit = NetzProxyWahl { proxy: Some("http://proxy:3128".into()), quelle: "Windows".into(), hinweis: None };
        let t = netz_fehler_text("https://testphase.rechtsinformationen.bund.de/v1/x", "Connection Failed: tls connection init failed: unexpected end of file", &mit);
        assert!(t.starts_with("Nicht erreichbar: Die Verbindung zu testphase.rechtsinformationen.bund.de wurde beim Aufbau abgebrochen – vermutlich blockiert eine Firewall oder ein Proxy sie.\nProxy: Genutzter Proxy: http://proxy:3128 (Windows).\nTechnische Einzelheiten: "));
        let skript = NetzProxyWahl { proxy: None, quelle: "keiner".into(), hinweis: Some("In Windows ist ein Proxy-Skript eingestellt (x) – LEXIO wertet es nicht aus".into()) };
        assert!(netz_fehler_text("https://recht.nrw.de/", "unexpected end of file", &skript).contains("\nProxy: In Windows ist ein Proxy-Skript eingestellt (x) – LEXIO wertet es nicht aus – bitte die IT fragen"));
        assert!(netz_fehler_text("https://recht.nrw.de/", "Network Error: timed out reading response", &kein).starts_with("Zeitüberschreitung: recht.nrw.de antwortet nicht rechtzeitig.\nProxy: Es ist kein Proxy eingestellt."));
        assert!(netz_fehler_text("https://recht.nrw.de/", "Dns Failed: failed to lookup address information", &kein).contains("Die Adresse recht.nrw.de wird nicht gefunden"));
        assert!(netz_fehler_text("https://recht.nrw.de/", "invalid peer certificate: Expired", &kein).contains("abgelaufen"));
        assert!(netz_fehler_text("https://recht.nrw.de/", "irgendwas", &kein).starts_with("Nicht erreichbar: recht.nrw.de ist nicht erreichbar."));
    }

    #[test]
    fn aussteller_aus_dem_zertifikat() {
        // Stammzertifikate der Mitlieferung: jedes hat einen lesbaren Aussteller (bei einer Stamm-CA sie selbst)
        let namen: Vec<String> = webpki_root_certs::TLS_SERVER_ROOT_CERTS.iter().filter_map(|c| zertifikat_aussteller(c.as_ref())).collect();
        assert_eq!(namen.len(), webpki_root_certs::TLS_SERVER_ROOT_CERTS.len());
        assert!(namen.iter().any(|n| n.contains("ISRG Root X1")), "{namen:?}");
        assert!(namen.iter().any(|n| n.contains("D-TRUST")), "{namen:?}");
        // kaputte Eingaben stürzen nicht ab
        assert_eq!(zertifikat_aussteller(&[]), None);
        assert_eq!(zertifikat_aussteller(&[0x30, 0x82, 0xff]), None);
        assert_eq!(der_text(0x1e, &[0x00, 0x41, 0x00, 0xe4]).as_deref(), Some("Aä"));
    }

    #[test]
    fn tls_mit_systemzertifikaten_aufbaubar() {
        assert!(netz_tls().is_ok());
    }
}
