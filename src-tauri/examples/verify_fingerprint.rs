//! Fingerprint verification utility
//! 
//! Usage:
//! ```
//! cargo run --example verify_fingerprint
//! ```
//! 
//! This checks our wreq client's TLS/HTTP2 fingerprint against expected values from:
//! https://tls.peet.ws/api/all

use std::process::ExitCode;
use serde_json::Value;

#[tokio::main]
async fn main() -> ExitCode {
    // Build the client with our Grindr fingerprint config
    let client = match build_grindr_client() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to build client: {e}");
            return ExitCode::FAILURE;
        }
    };

    // Probe the fingerprint
    let response = match probe(&client).await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Probe failed: {e}");
            return ExitCode::FAILURE;
        }
    };

    println!("=== Fingerprint Verification ===\n");
    print_response(&response);

    // Verify key fields
    let mut failures = 0;

    // Check JA3
    if let Some(ja3) = response["tls"]["ja3_hash"].as_str() {
        println!("JA3 Hash: {ja3}");
        // Should match OkHttp's JA3: 1d714db2228763eab228fc28ce7f8e4f (cold) or 62e5cbd375390b136bf5b06be231ed6b (warm)
        if ja3 == "1d714db2228763eab228fc28ce7f8e4f" || ja3 == "62e5cbd375390b136bf5b06be231ed6b" {
            println!("✓ JA3 matches expected OkHttp fingerprint");
        } else {
            eprintln!("✗ JA3 does NOT match OkHttp fingerprint");
            failures += 1;
        }
    }

    // Check HTTP version
    if let Some(http_ver) = response["http_version"].as_str() {
        println!("HTTP Version: {http_ver}");
    }

    // Check TLS version
    if let Some(tls_ver) = response["tls"]["version"].as_str() {
        println!("TLS Version: {tls_ver}");
    }

    // Check cipher suites count (should have ~15)
    if let Some(ciphers) = response["tls"]["ciphers"].as_array() {
        println!("Cipher Suites: {} configured", ciphers.len());
        if ciphers.len() >= 13 {
            println!("✓ Cipher suite count looks good");
        } else {
            eprintln!("✗ Cipher suite count too low: {}", ciphers.len());
            failures += 1;
        }
    }

    // Check curves
    if let Some(curves) = response["tls"]["supported_groups"].as_array() {
        println!("Curves: {:?}", curves.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>());
        // Should have X25519, SECP256R1, SECP384R1
        let curve_names: Vec<&str> = curves
            .iter()
            .filter_map(|v| v.as_str())
            .collect();
        if curve_names.contains(&"x25519") && curve_names.contains(&"secp256r1") {
            println!("✓ Curves match OkHttp configuration");
        } else {
            eprintln!("✗ Curves do NOT match OkHttp");
            failures += 1;
        }
    }

    // Check HTTP/2 Akamai fingerprint
    if let Some(akamai) = response["http2"]["akamai_fingerprint"].as_str() {
        println!("HTTP/2 Akamai Fingerprint: {akamai}");
        // Should be: 4:16777216|16711681|0|m,p,a,s
        if akamai.contains("16777216") && akamai.contains("m,p,a,s") {
            println!("✓ HTTP/2 Akamai fingerprint looks correct");
        } else {
            eprintln!("✗ HTTP/2 Akamai fingerprint may be incorrect");
            eprintln!("  Expected pattern: 4:16777216|16711681|0|m,p,a,s");
            failures += 1;
        }
    }

    println!();
    if failures == 0 {
        println!("✓ Fingerprint verification PASSED");
        ExitCode::SUCCESS
    } else {
        eprintln!("✗ Fingerprint verification FAILED ({failures} issue(s))");
        ExitCode::FAILURE
    }
}

fn build_grindr_client() -> Result<wreq::Client, Box<dyn std::error::Error>> {
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

    let client = Client::builder()
        .emulation(emulation)
        .gzip(true)
        .no_deflate()
        .no_brotli()
        .no_zstd()
        .build()?;

    Ok(client)
}

async fn probe(client: &wreq::Client) -> Result<Value, Box<dyn std::error::Error>> {
    let resp = client
        .get("https://tls.peet.ws/api/all")
        .header("Connection", "close")
        .send()
        .await?;
    
    let json: Value = resp.json().await?;
    Ok(json)
}

fn print_response(r: &Value) {
    if let Some(v) = r["http_version"].as_str() {
        println!("HTTP Version: {v}");
    }
    if let Some(v) = r["tls"]["version"].as_str() {
        println!("TLS Version: {v}");
    }
    if let Some(v) = r["tls"]["ja3"].as_str() {
        println!("JA3: {v}");
    }
    if let Some(v) = r["tls"]["ja3_hash"].as_str() {
        println!("JA3 Hash: {v}");
    }
    if let Some(arr) = r["tls"]["ciphers"].as_array() {
        println!("Ciphers ({}):", arr.len());
        for c in arr {
            if let Some(name) = c.as_str() {
                println!("  - {name}");
            }
        }
    }
    println!();
}
