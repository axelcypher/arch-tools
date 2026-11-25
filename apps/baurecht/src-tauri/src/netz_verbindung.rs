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
// Proxy-Skript (AutoConfigURL) wird erkannt, aber nicht ausgewertet – die Fehlermeldung und die Diagnose nennen es.
// „Einstellungen automatisch erkennen“ (WPAD, ein Binärwert unter Connections) wird nicht gelesen. Ein Proxy, der eine
// Anmeldung verlangt (407, z. B. Windows-Anmeldung), wird nicht bedient – die Meldung sagt das. Zugangsdaten eines
// Proxys (http://name:passwort@host:port) gehen an ureq, in Texten erscheinen sie nie (`netz_proxy_anzeige`).

// Keine `use`-Zeilen auf oberster Ebene (siehe netz.rs).

/// Hosts, die „Verbindung prüfen“ testet: die Rechtsquellen und die Geodienste NRW
const NETZ_PRUEF_HOSTS: &[&str] = &["www.gesetze-im-internet.de", "testphase.rechtsinformationen.bund.de", "recht.nrw.de", "www.dibt.de", "www.wfs.nrw.de"];

/* ---------- Zertifikate ---------- */

/// TLS-Einstellungen mit der Zertifikatsprüfung des Betriebssystems (plus mitgelieferte Stammzertifikate und – nur in
/// Tests – `weitere`); `pruefer` umhüllt die Prüfung (Diagnose: Kette mitschreiben)
fn netz_tls_mit(
    weitere: &[rustls::pki_types::CertificateDer<'static>],
    pruefer: impl FnOnce(std::sync::Arc<dyn rustls::client::danger::ServerCertVerifier>) -> std::sync::Arc<dyn rustls::client::danger::ServerCertVerifier>,
) -> Result<std::sync::Arc<rustls::ClientConfig>, String> {
    let anbieter = std::sync::Arc::new(rustls::crypto::ring::default_provider());
    let wurzeln = webpki_root_certs::TLS_SERVER_ROOT_CERTS.iter().chain(weitere).cloned();
    let system = rustls_platform_verifier::Verifier::new_with_extra_roots(wurzeln, anbieter.clone())
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
    TLS.get_or_init(|| netz_tls_mit(&[], |p| p)).clone()
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
    /// http://host:port, falls einer genutzt wird – mit Zugangsdaten (nur für ureq; an die Oberfläche geht `anzeige`)
    #[serde(skip)]
    proxy: Option<String>,
    /// derselbe ohne Zugangsdaten (http://***@host:port) – für Texte und die Oberfläche
    #[serde(rename = "proxy")]
    anzeige: Option<String>,
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

/// einfacher Platzhalter-Abgleich: `*` steht für beliebig viele Zeichen (auch mehrere `*`, z. B. „192.168.*.*“)
fn netz_glob(muster: &str, text: &str) -> bool {
    let teile: Vec<&str> = muster.split('*').collect();
    if teile.len() == 1 {
        return muster == text;
    }
    let (erst, letzt) = (teile[0], teile[teile.len() - 1]);
    if text.len() < erst.len() + letzt.len() || !text.starts_with(erst) || !text.ends_with(letzt) {
        return false;
    }
    let mut rest = &text[erst.len()..text.len() - letzt.len()];
    for t in &teile[1..teile.len() - 1] {
        match rest.find(t) {
            Some(i) => rest = &rest[i + t.len()..],
            None => return false,
        }
    }
    true
}

/// Host bei einer Ausnahme der Internetoptionen („ProxyOverride“: „*.intern;10.*.*.*;<local>“), ohne Groß/klein
fn netz_win_ausgenommen(host: &str, ausnahmen: &str) -> bool {
    let host = host.to_ascii_lowercase();
    ausnahmen.split(';').map(|a| a.trim().to_ascii_lowercase()).filter(|a| !a.is_empty()).any(|a| if a == "<local>" { !host.contains('.') } else { netz_glob(&a, &host) })
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

/// Proxy-Adresse ohne Zugangsdaten (für Texte)
fn netz_proxy_anzeige(adresse: &str) -> String {
    let (schema, rest) = adresse.split_once("://").unwrap_or(("", adresse));
    let rest = match rest.rsplit_once('@') {
        Some((_, host)) => format!("***@{host}"),
        None => rest.to_string(),
    };
    if schema.is_empty() { rest } else { format!("{schema}://{rest}") }
}

/// gewählter Proxy mit Anzeige ohne Zugangsdaten
fn netz_proxy_wahl(proxy: Option<String>, quelle: &str, hinweis: Option<String>) -> NetzProxyWahl {
    NetzProxyWahl { anzeige: proxy.as_deref().map(netz_proxy_anzeige), proxy, quelle: quelle.into(), hinweis: hinweis.map(|h| netz_proxy_anzeige_im_text(&h)) }
}

/// Zugangsdaten in einem Text (z. B. Hinweis mit der Proxy-Adresse) verbergen
fn netz_proxy_anzeige_im_text(text: &str) -> String {
    text.split(' ').map(|w| if w.contains("://") && w.contains('@') { netz_proxy_anzeige(w) } else { w.to_string() }).collect::<Vec<_>>().join(" ")
}

/// Proxy für einen Host wählen: Umgebung vor Windows; Ausnahmen beachten
fn netz_proxy_waehlen(host: &str, umgebung: &dyn Fn(&str) -> Option<String>, win: Option<&NetzWinProxy>) -> NetzProxyWahl {
    let var = |namen: &[&str]| namen.iter().find_map(|n| umgebung(n).map(|v| v.trim().to_string()).filter(|v| !v.is_empty()));
    if let Some(p) = var(&["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy"]) {
        if var(&["NO_PROXY", "no_proxy"]).map(|n| netz_no_proxy(host, &n)).unwrap_or(false) {
            return netz_proxy_wahl(None, "Ausnahme (NO_PROXY)", None);
        }
        return match netz_proxy_adresse(&p) {
            Ok(a) => netz_proxy_wahl(Some(a), "Umgebung", None),
            Err(h) => netz_proxy_wahl(None, "Umgebung", Some(h)),
        };
    }
    let Some(w) = win else { return netz_proxy_wahl(None, "keiner", None) };
    let skript = w.skript.as_ref().map(|s| format!("In Windows ist ein Proxy-Skript eingestellt ({s}) – LEXIO wertet es nicht aus"));
    if w.aktiv {
        if let Some(server) = w.server.as_deref().and_then(netz_proxy_server) {
            if w.ausnahmen.as_deref().map(|a| netz_win_ausgenommen(host, a)).unwrap_or(false) {
                return netz_proxy_wahl(None, "Ausnahme in Windows", None);
            }
            return match netz_proxy_adresse(&server) {
                Ok(a) => netz_proxy_wahl(Some(a), "Windows", None),
                Err(h) => netz_proxy_wahl(None, "Windows", Some(h)),
            };
        }
    }
    netz_proxy_wahl(None, "keiner", skript)
}

/// Proxy für einen Host aus der echten Umgebung (ein Port gehört nicht zum Host – Ausnahmen gelten je Name)
fn netz_proxy(host: &str) -> NetzProxyWahl {
    let name = host.split(':').next().unwrap_or(host).to_ascii_lowercase();
    netz_proxy_waehlen(&name, &|n| std::env::var(n).ok(), netz_win_proxy().as_ref())
}

/* ---------- Fehler ---------- */

/// Rohfehler des Verbindungsaufbaus übersetzen. Aufbau in Zeilen (die Oberfläche zeigt sie getrennt):
/// 1. „Nicht erreichbar: …“ bzw. „Zeitüberschreitung: …“ (das Frontend wiederholt sie) oder „Zertifikat abgelehnt: …“
///    (nicht wiederholt), danach ein verständlicher Satz;
/// 2. „Proxy: …“ – genutzter Proxy (ohne Zugangsdaten) bzw. was fehlt (nur bei Fehlern, die am Netz liegen);
/// 3. „Technische Einzelheiten: …“ – der Rohfehler (aufklappbar, für die IT bzw. den Support).
fn netz_fehler_text(adresse: &str, roh: &str, proxy: &NetzProxyWahl) -> String {
    let host = netz_host_anzeige(adresse);
    let r = roh.to_ascii_lowercase();
    let ueber = match (&proxy.anzeige, &proxy.hinweis) {
        (Some(p), _) => format!("{p} ({}).", proxy.quelle),
        // die Umgebung selbst nennt den nicht unterstützten Proxy: dort hilft nur eine http-Adresse
        (None, Some(h)) if proxy.quelle == "Umgebung" => format!("{h} – bitte die IT fragen (HTTPS_PROXY als http://host:port eintragen)."),
        (None, Some(h)) => format!("{h} – bitte die IT fragen (Proxy als HTTPS_PROXY eintragen)."),
        (None, None) => "keiner eingestellt.".to_string(),
    };
    // (Anfang, Satz, Proxy nennen). Zertifikatsfehler beginnen mit „Zertifikat abgelehnt“: Das Frontend wiederholt sie
    // nicht (sie scheiterten jedes Mal gleich), anders als „Nicht erreichbar“ und „Zeitüberschreitung“.
    let (anfang, satz, mit_proxy) = if r.contains("unknownissuer") || r.contains("unknown issuer") {
        ("Zertifikat abgelehnt", format!("Das Zertifikat der Verbindung zu {host} ist auf diesem Rechner nicht vertrauenswürdig – vermutlich prüft eine Firewall oder ein Virenschutz die verschlüsselte Verbindung mit einem eigenen Zertifikat, das Windows nicht kennt. Bitte die IT bitten, {host} von dieser Prüfung auszunehmen oder das Stammzertifikat der Prüfstelle in Windows zu hinterlegen."), false)
    } else if r.contains("expired") || r.contains("notvalidyet") || r.contains("not valid yet") {
        ("Zertifikat abgelehnt", format!("Das Zertifikat von {host} ist abgelaufen oder noch nicht gültig – bitte Datum und Uhrzeit des Rechners prüfen."), false)
    } else if r.contains("invalid peer certificate") || r.contains("certificate") {
        ("Zertifikat abgelehnt", format!("Das Zertifikat von {host} wurde abgelehnt – vermutlich prüft eine Firewall oder ein Virenschutz die Verbindung."), false)
    } else if r.contains("407") || r.contains("proxy authentication") {
        ("Nicht erreichbar", "Der Proxy verlangt eine Anmeldung (z. B. die Windows-Anmeldung), die LEXIO nicht beherrscht – bitte die IT fragen, ob die Rechtsquellen ohne Anmeldung am Proxy erreichbar sein können.".to_string(), true)
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

/// eine Adresse prüfen – Proxy und zusätzliche Stammzertifikate vorgegeben (Tests: lokaler Server mit Test-CA)
fn netz_adresse_pruefen(adresse: &str, zeit_ms: u64) -> NetzPruefung {
    netz_adresse_pruefen_mit(adresse, zeit_ms, netz_proxy(&netz_host_anzeige(adresse)), &[])
}

fn netz_adresse_pruefen_mit(adresse: &str, zeit_ms: u64, proxy: NetzProxyWahl, weitere: &[rustls::pki_types::CertificateDer<'static>]) -> NetzPruefung {
    let host = netz_host_anzeige(adresse);
    let host = host.as_str();
    let adresse = adresse.to_string();
    let kette = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let start = std::time::Instant::now();
    let k = kette.clone();
    let ergebnis = netz_tls_mit(weitere, move |innen| std::sync::Arc::new(NetzKettenPruefer { innen, kette: k })).and_then(|tls| {
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
        // mehrere Platzhalter, Groß/klein
        assert!(netz_win_ausgenommen("www.wfs.nrw.de", "*.NRW.*"));
        assert!(netz_win_ausgenommen("10.1.2.3", "10.*.*.*"));
        assert!(netz_win_ausgenommen("192.168.0.7", "192.168.*.*"));
        assert!(!netz_win_ausgenommen("192.169.0.7", "192.168.*.*"));
        assert!(!netz_win_ausgenommen("nrw.de", "*.nrw.*"));
        let keine = |_: &str| None::<String>;
        let win = NetzWinProxy { aktiv: true, server: Some("http=proxy:3128;https=proxy:3129".into()), ausnahmen: Some("*.nrw.de;<local>".into()), skript: None };
        assert_eq!(netz_proxy_waehlen("www.gesetze-im-internet.de", &keine, Some(&win)), netz_proxy_wahl(Some("http://proxy:3129".into()), "Windows", None));
        assert_eq!(netz_proxy_waehlen("recht.nrw.de", &keine, Some(&win)).proxy, None);
        assert_eq!(netz_proxy_waehlen("recht.nrw.de", &keine, Some(&win)).quelle, "Ausnahme in Windows");
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
    fn zugangsdaten_des_proxys_erscheinen_nie_in_texten() {
        let env = |n: &str| (n == "HTTPS_PROXY").then(|| "http://anna:geheim@proxy:3128".to_string());
        let w = netz_proxy_waehlen("recht.nrw.de", &env, None);
        // an ureq die volle Adresse, in Texten und in der Oberfläche ohne Zugangsdaten
        assert_eq!(w.proxy.as_deref(), Some("http://anna:geheim@proxy:3128"));
        assert_eq!(w.anzeige.as_deref(), Some("http://***@proxy:3128"));
        let json = serde_json::to_string(&w).unwrap();
        assert!(!json.contains("geheim") && json.contains("http://***@proxy:3128"), "{json}");
        let t = netz_fehler_text("https://recht.nrw.de/", "unexpected end of file", &w);
        assert!(!t.contains("geheim") && t.contains("\nProxy: http://***@proxy:3128 (Umgebung)."), "{t}");
        // auch im Hinweis zu einem nicht unterstützten Proxy
        let socks = |n: &str| (n == "HTTPS_PROXY").then(|| "socks5://anna:geheim@s:1080".to_string());
        let w = netz_proxy_waehlen("recht.nrw.de", &socks, None);
        assert!(!w.hinweis.as_deref().unwrap().contains("geheim"), "{w:?}");
        assert_eq!(netz_proxy_anzeige("proxy:3128"), "proxy:3128");
    }

    #[test]
    fn fehler_verstaendlich() {
        let kein = netz_proxy_wahl(None, "keiner", None);
        let a = "https://www.gesetze-im-internet.de/bbaug/xml.zip";
        let t = netz_fehler_text(a, "https://www.gesetze-im-internet.de/bbaug/xml.zip: Connection Failed: tls connection init failed: invalid peer certificate: UnknownIssuer", &kein);
        let (erste, zweite) = t.split_once('\n').unwrap();
        // Zertifikatsfehler: eigener Anfang (nicht wiederholt), ohne Proxy-Zeile (es liegt nicht am Proxy)
        assert!(erste.starts_with("Zertifikat abgelehnt: Das Zertifikat der Verbindung zu www.gesetze-im-internet.de ist auf diesem Rechner nicht vertrauenswürdig"));
        assert!(zweite.starts_with("Technische Einzelheiten: https://www.gesetze-im-internet.de/bbaug/xml.zip: "));
        assert!(zweite.contains("UnknownIssuer"));
        // die Adresse steht nur einmal da
        assert_eq!(zweite.matches("bbaug/xml.zip").count(), 1);
        let mit = netz_proxy_wahl(Some("http://proxy:3128".into()), "Windows", None);
        let t = netz_fehler_text("https://testphase.rechtsinformationen.bund.de/v1/x", "Connection Failed: tls connection init failed: unexpected end of file", &mit);
        assert!(t.starts_with("Nicht erreichbar: Die Verbindung zu testphase.rechtsinformationen.bund.de wurde beim Aufbau abgebrochen – vermutlich blockiert eine Firewall oder ein Proxy sie.\nProxy: http://proxy:3128 (Windows).\nTechnische Einzelheiten: "), "{t}");
        let skript = netz_proxy_wahl(None, "keiner", Some("In Windows ist ein Proxy-Skript eingestellt (x) – LEXIO wertet es nicht aus".into()));
        assert!(netz_fehler_text("https://recht.nrw.de/", "unexpected end of file", &skript).contains("\nProxy: In Windows ist ein Proxy-Skript eingestellt (x) – LEXIO wertet es nicht aus – bitte die IT fragen (Proxy als HTTPS_PROXY eintragen)."));
        // ist HTTPS_PROXY selbst unbrauchbar, kein Ratschlag im Kreis
        let env = netz_proxy_wahl(None, "Umgebung", Some("Proxy „socks5://s:1080“ wird nicht unterstützt (nur http://host:port)".into()));
        let t = netz_fehler_text("https://recht.nrw.de/", "unexpected end of file", &env);
        assert!(t.contains("HTTPS_PROXY als http://host:port eintragen") && !t.contains("Proxy als HTTPS_PROXY eintragen"), "{t}");
        assert!(netz_fehler_text("https://recht.nrw.de/", "Network Error: timed out reading response", &kein).starts_with("Zeitüberschreitung: recht.nrw.de antwortet nicht rechtzeitig.\nProxy: keiner eingestellt."));
        assert!(netz_fehler_text("https://recht.nrw.de/", "Dns Failed: failed to lookup address information", &kein).contains("Die Adresse recht.nrw.de wird nicht gefunden"));
        assert!(netz_fehler_text("https://recht.nrw.de/", "invalid peer certificate: Expired", &kein).starts_with("Zertifikat abgelehnt: Das Zertifikat von recht.nrw.de ist abgelaufen"));
        assert!(netz_fehler_text("https://recht.nrw.de/", "Connection Failed: Proxy failed to connect: 407 Proxy Authentication Required", &mit).contains("Der Proxy verlangt eine Anmeldung"));
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

    // Nachgestellte TLS-Prüfstelle: eine eigene Stamm-CA („Firmen-Firewall Test-CA“, gültig bis 4096) signiert das
    // Zertifikat eines lokalen Servers für localhost – wie eine Firewall, die HTTPS aufbricht und neu signiert.
    const TEST_CA: &str = "MIIBqjCCAVCgAwIBAgIULfedUGjV2YdSQq+PbbkFp21sA9wwCgYIKoZIzj0EAwIwOjEgMB4GA1UEAwwXRmlybWVuLUZpcmV3YWxsIFRlc3QtQ0ExFjAUBgNVBAoMDUJlaXNwaWVsIEdtYkgwIBcNNzUwMTAxMDAwMDAwWhgPNDA5NjAxMDEwMDAwMDBaMDoxIDAeBgNVBAMMF0Zpcm1lbi1GaXJld2FsbCBUZXN0LUNBMRYwFAYDVQQKDA1CZWlzcGllbCBHbWJIMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEjS32OubV5QUesaJR6SQpaGQ8wIho8l8ZfBfIuNaMb9GhMoOmAeFSXU1zn9Y4Aqj9lCJT3lsfBUoIO/aDzNbFKaMyMDAwHQYDVR0OBBYEFMZuE0UAhzhgAJx8NUjidxtpHiorMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIgG3+0cNl0XTvTPYnEj63nS3ckoIHtashdAZs5iDbHGBYCIQCY7OklsGX1xRQXKMd97558qnUYEE5YNHM1I3lHngqUfg==";
    const TEST_SERVER: &str = "MIIBdzCCAR2gAwIBAgIUbrQx2E1b3q8AcnxjcPB5vgPsDrkwCgYIKoZIzj0EAwIwOjEgMB4GA1UEAwwXRmlybWVuLUZpcmV3YWxsIFRlc3QtQ0ExFjAUBgNVBAoMDUJlaXNwaWVsIEdtYkgwIBcNNzUwMTAxMDAwMDAwWhgPNDA5NjAxMDEwMDAwMDBaMCExHzAdBgNVBAMMFnJjZ2VuIHNlbGYgc2lnbmVkIGNlcnQwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAT2v4ndxH4ePrFs+33dvrMw9z9OGPXWzjyrlGUVJt0xwM1d9VR5fOfvyom73Ta6g36Fdzk93QABYdjdtV3MSA6FoxgwFjAUBgNVHREEDTALgglsb2NhbGhvc3QwCgYIKoZIzj0EAwIDSAAwRQIgQ/aq3/W+6hp/AB2o/sh2dMszz1anq82ojsembEaGCO8CIQCm7R9dHA1tJMI5Hg99V4QmcL87k4ncSbMa+quqlqEWJA==";
    const TEST_SCHLUESSEL: &str = "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgdyylaFYgla8fG+dRXpUIRpntrFVEnZyM9V51iBSLODehRANCAAT2v4ndxH4ePrFs+33dvrMw9z9OGPXWzjyrlGUVJt0xwM1d9VR5fOfvyom73Ta6g36Fdzk93QABYdjdtV3MSA6F";

    fn der(b64: &str) -> Vec<u8> {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.decode(b64).unwrap()
    }

    /// lokaler TLS-Server mit dem Zertifikat der Test-CA; antwortet einmal mit „200 OK“; liefert die Adresse
    fn pruefstelle() -> String {
        use std::io::{Read, Write};
        let kette = vec![rustls::pki_types::CertificateDer::from(der(TEST_SERVER)), rustls::pki_types::CertificateDer::from(der(TEST_CA))];
        let schluessel = rustls::pki_types::PrivateKeyDer::try_from(der(TEST_SCHLUESSEL)).unwrap();
        let cfg = std::sync::Arc::new(
            rustls::ServerConfig::builder_with_provider(std::sync::Arc::new(rustls::crypto::ring::default_provider()))
                .with_safe_default_protocol_versions()
                .unwrap()
                .with_no_client_auth()
                .with_single_cert(kette, schluessel)
                .unwrap(),
        );
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            if let Some(Ok(mut s)) = l.incoming().next() {
                let mut c = rustls::ServerConnection::new(cfg).unwrap();
                let mut t = rustls::Stream::new(&mut c, &mut s);
                let mut buf = [0u8; 1024];
                if t.read(&mut buf).is_ok() {
                    let _ = t.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
                }
            }
        });
        format!("https://localhost:{port}/")
    }

    #[test]
    fn pruefstelle_mit_ca_im_speicher_klappt_ohne_kommt_die_verstaendliche_meldung() {
        // die CA vertrauenswürdig (wie die Firmen-CA im Windows-Zertifikatspeicher): erreichbar, Aussteller genannt
        let ca = [rustls::pki_types::CertificateDer::from(der(TEST_CA))];
        let mit = netz_adresse_pruefen_mit(&pruefstelle(), 10_000, netz_proxy_wahl(None, "keiner", None), &ca);
        assert!(mit.erreichbar, "{mit:?}");
        assert_eq!(mit.status, Some(200));
        assert_eq!(mit.aussteller.as_deref(), Some("Firmen-Firewall Test-CA (Beispiel GmbH)"));
        // ohne sie: abgelehnt, mit verständlicher Meldung – und trotzdem nennt die Diagnose die Prüfstelle
        let ohne = netz_adresse_pruefen_mit(&pruefstelle(), 10_000, netz_proxy_wahl(None, "keiner", None), &[]);
        assert!(!ohne.erreichbar);
        let f = ohne.fehler.unwrap();
        assert!(f.starts_with("Zertifikat abgelehnt: Das Zertifikat der Verbindung zu localhost:"), "{f}");
        assert!(f.contains("UnknownIssuer"), "{f}");
        assert_eq!(ohne.aussteller.as_deref(), Some("Firmen-Firewall Test-CA (Beispiel GmbH)"));
    }
}
