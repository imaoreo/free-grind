//! Fingerprint verification command
//! 
//! Checks the client's TLS/HTTP2 fingerprint against tls.peet.ws

use serde_json::{json, Value};
use crate::error::AppError;

#[tauri::command]
pub async fn check_fingerprint() -> Result<Value, AppError> {
    let client = build_fingerprint_check_client()?;
    
    let response = client
        .get("https://tls.peet.ws/api/all")
        .header("Connection", "close")
        .send()
        .await
        .map_err(|e| AppError::Http(format!("Fingerprint check failed: {e}")))?;
    
    let json: Value = response
        .json()
        .await
        .map_err(|e| AppError::Http(format!("Failed to parse fingerprint response: {e}")))?;

    // Extract key fields
    let ja3_hash = json["tls"]["ja3_hash"].as_str().unwrap_or("unknown");
    let http_version = json["http_version"].as_str().unwrap_or("unknown");
    let akamai = json["http2"]["akamai_fingerprint"].as_str().unwrap_or("unknown");
    
    // Check if it matches expected values
    let ja3_match = ja3_hash == "1d714db2228763eab228fc28ce7f8e4f" || ja3_hash == "62e5cbd375390b136bf5b06be231ed6b";
    let akamai_match = akamai.contains("16777216") && akamai.contains("m,p,a,s");
    
    Ok(json!({
        "ja3_hash": ja3_hash,
        "ja3_match": ja3_match,
        "http_version": http_version,
        "akamai_fingerprint": akamai,
        "akamai_match": akamai_match,
        "full_response": json,
    }))
}

fn build_fingerprint_check_client() -> Result<wreq::Client, AppError> {
    use wreq::{Client, EmulationProvider, Http2Config, PseudoOrder, SettingsOrder, SslCurve, TlsConfig, TlsVersion};

    const MODERN_TLS_CIPHERS: &str = concat!(
        "TLS_AES_128_GCM_SHA256",
        ":TLS_AES_256_GCM_SHA384",
        ":TLS_CHACHA20_POLY1305_SHA256",
        ":TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
        ":TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
        ":TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
        ":TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
        ":TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
        ":TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
        ":TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
        ":TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
        ":TLS_RSA_WITH_AES_128_GCM_SHA256",
        ":TLS_RSA_WITH_AES_256_GCM_SHA384",
        ":TLS_RSA_WITH_AES_128_CBC_SHA",
        ":TLS_RSA_WITH_AES_256_CBC_SHA",
    );

    const SIGALGS: &str = concat!(
        "ecdsa_secp256r1_sha256",
        ":rsa_pss_rsae_sha256",
        ":rsa_pkcs1_sha256",
        ":ecdsa_secp384r1_sha384",
        ":rsa_pss_rsae_sha384",
        ":rsa_pkcs1_sha384",
        ":rsa_pss_rsae_sha512",
        ":rsa_pkcs1_sha512",
        ":rsa_pkcs1_sha1",
    );

    const CURVES: &[SslCurve] = &[SslCurve::X25519, SslCurve::SECP256R1, SslCurve::SECP384R1];

    const PSEUDO_ORDER: [PseudoOrder; 4] = [
        PseudoOrder::Method,
        PseudoOrder::Path,
        PseudoOrder::Authority,
        PseudoOrder::Scheme,
    ];

    const SETTINGS_ORDER: [SettingsOrder; 8] = [
        SettingsOrder::InitialWindowSize,
        SettingsOrder::HeaderTableSize,
        SettingsOrder::EnablePush,
        SettingsOrder::MaxConcurrentStreams,
        SettingsOrder::MaxFrameSize,
        SettingsOrder::MaxHeaderListSize,
        SettingsOrder::UnknownSetting8,
        SettingsOrder::UnknownSetting9,
    ];

    const OKHTTP_WINDOW_SIZE: u32 = 16 * 1024 * 1024;

    let tls = TlsConfig::builder()
        .enable_ocsp_stapling(true)
        .pre_shared_key(true)
        .curves(CURVES)
        .sigalgs_list(SIGALGS)
        .cipher_list(MODERN_TLS_CIPHERS)
        .min_tls_version(TlsVersion::TLS_1_2)
        .max_tls_version(TlsVersion::TLS_1_3)
        .build();

    let http2 = Http2Config::builder()
        .initial_stream_window_size(OKHTTP_WINDOW_SIZE)
        .initial_connection_window_size(OKHTTP_WINDOW_SIZE)
        .headers_pseudo_order(PSEUDO_ORDER)
        .settings_order(SETTINGS_ORDER)
        .build();

    let emulation = EmulationProvider::builder()
        .tls_config(tls)
        .http2_config(http2)
        .default_headers(None)
        .build();

    Client::builder()
        .emulation(emulation)
        .gzip(true)
        .no_deflate()
        .no_brotli()
        .no_zstd()
        .build()
        .map_err(|e| AppError::Http(format!("Failed to build fingerprint client: {e}")))
}
