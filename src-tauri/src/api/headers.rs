use rand;
use serde::Deserialize;
use std::sync::OnceLock;
use std::time::Duration;
use wreq::header::{HeaderName, HeaderValue};
use wreq::{Client, EmulationProvider, Http2Config, PseudoOrder, SettingsOrder, SslCurve, TlsConfig, TlsVersion};

const DEFAULT_APP_VERSION: &str = "26.9.1.163471";
const DEFAULT_BUILD_NUMBER: &str = "163471";
const TIMEZONE: &str = "Europe/Madrid";
const VERSION_FILE_URL: &str =
    "https://raw.githubusercontent.com/imaoreo/free-grind/main/version.json";

/// References <https://opengrind.org/grindr-api/security-headers#cipher-suites>
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

/// References <https://opengrind.org/grindr-api/security-headers#extensions>
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

/// References <https://opengrind.org/grindr-api/security-headers#pseudoheaders>
const PSEUDO_ORDER: [PseudoOrder; 4] = [
    PseudoOrder::Method,
    PseudoOrder::Path,
    PseudoOrder::Authority,
    PseudoOrder::Scheme,
];

/// References <https://opengrind.org/grindr-api/security-headers#frames>
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

#[derive(Debug, Deserialize)]
struct VersionJson {
    #[serde(alias = "appVersion", alias = "version")]
    app_version: String,
    #[serde(alias = "buildNumber", alias = "build")]
    build_number: String,
}

#[derive(Debug)]
struct VersionInfo {
    app_version: String,
    build_number: String,
}

static VERSION_INFO: OnceLock<VersionInfo> = OnceLock::new();

fn fetch_version_info() -> Option<VersionInfo> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .ok()?;

    let response = client.get(VERSION_FILE_URL).send().ok()?;
    if !response.status().is_success() {
        return None;
    }

    let parsed = response.json::<VersionJson>().ok()?;
    if parsed.app_version.trim().is_empty() || parsed.build_number.trim().is_empty() {
        return None;
    }

    Some(VersionInfo {
        app_version: parsed.app_version,
        build_number: parsed.build_number,
    })
}

fn version_info() -> &'static VersionInfo {
    VERSION_INFO.get_or_init(|| {
        fetch_version_info().unwrap_or_else(|| VersionInfo {
            app_version: DEFAULT_APP_VERSION.to_string(),
            build_number: DEFAULT_BUILD_NUMBER.to_string(),
        })
    })
}

#[derive(Clone, Debug)]
pub struct DeviceInfo {
    pub device_type: u8,
    pub device_id: String,
    pub android_version: &'static str,
    pub screen_resolution: &'static str,
    pub total_ram: &'static str,
    pub advertising_id: String,
    pub device_model: &'static str,
    pub manufacturer: &'static str,
}

impl Default for DeviceInfo {
    fn default() -> Self {
        // deviceId must be exactly 16 hexadecimal characters
        let device_id = format!("{:016x}", rand::random::<u64>());
        Self {
            device_type: 2,
            device_id,
            android_version: "13",
            screen_resolution: "2400x1080",
            total_ram: "8026152960",
            advertising_id: uuid::Uuid::new_v4().to_string(),
            device_model: "Pixel 7",
            manufacturer: "Google",
        }
    }
}

fn okhttp_tls_config() -> TlsConfig {
    TlsConfig::builder()
        .enable_ocsp_stapling(true)
        .pre_shared_key(true)
        .curves(CURVES)
        .sigalgs_list(SIGALGS)
        .cipher_list(MODERN_TLS_CIPHERS)
        .min_tls_version(TlsVersion::TLS_1_2)
        .max_tls_version(TlsVersion::TLS_1_3)
        .build()
}

fn okhttp_http2_config() -> Http2Config {
    Http2Config::builder()
        .initial_stream_window_size(OKHTTP_WINDOW_SIZE)
        .initial_connection_window_size(OKHTTP_WINDOW_SIZE)
        .headers_pseudo_order(PSEUDO_ORDER)
        .settings_order(SETTINGS_ORDER)
        .build()
}

fn grindr_emulation() -> EmulationProvider {
    EmulationProvider::builder()
        .tls_config(okhttp_tls_config())
        .http2_config(okhttp_http2_config())
        .default_headers(None)
        .build()
}

pub fn build_grindr_client() -> Result<Client, wreq::Error> {
    Client::builder()
        .emulation(grindr_emulation())
        .gzip(true)
        .no_deflate()
        .no_brotli()
        .no_zstd()
        .build()
}

pub fn build_headers(
    device: &DeviceInfo,
    subscription_tier: &str,
    auth_token: Option<&str>,
) -> Vec<(HeaderName, HeaderValue)> {
    let mut headers: Vec<(HeaderName, HeaderValue)> = Vec::with_capacity(9);

    // The order of headers is strictly checked by the API.
    // References https://opengrind.org/grindr-api/security-headers#correct-headers-order
    //   1. Authorization (optional)
    //   2. L-Time-Zone
    //   3. L-Grindr-Roles (only when authorized)
    //   4. L-Device-Info
    //   5. Accept
    //   6. User-Agent
    //   7. L-Locale
    //   8. Accept-Language (lowercase `l`)
    //   9. Accept-Encoding (always `gzip`)
    
    // 1. Authorization
    if let Some(token) = auth_token {
        if let Ok(value) = HeaderValue::from_str(token) {
            headers.push((HeaderName::from_static("authorization"), value));
        }
    }

    // 2. L-Time-Zone
    headers.push((
        HeaderName::from_static("l-time-zone"),
        HeaderValue::from_static(TIMEZONE),
    ));

    // 3. L-Grindr-Roles (only when authorized)
    if auth_token.is_some() {
        let roles = format!("[{}]", subscription_tier.to_uppercase());
        if let Ok(value) = HeaderValue::from_str(&roles) {
            headers.push((HeaderName::from_static("l-grindr-roles"), value));
        }
    }

    // 4. L-Device-Info
    let device_info = format!(
        "{};GLOBAL;{};{};{};{}",
        device.device_id,
        device.device_type,
        device.total_ram,
        device.screen_resolution,
        device.advertising_id
    );
    if let Ok(value) = HeaderValue::from_str(&device_info) {
        headers.push((HeaderName::from_static("l-device-info"), value));
    }

    // 5. Accept
    headers.push((
        HeaderName::from_static("accept"),
        HeaderValue::from_static("application/json"),
    ));

    // 6. User-Agent
    let version_info = version_info();
    let user_agent = format!(
        "grindr3/{};{};{};Android {};{};{}",
        version_info.app_version,
        version_info.build_number,
        subscription_tier,
        device.android_version,
        device.device_model,
        device.manufacturer
    );
    if let Ok(value) = HeaderValue::from_str(&user_agent) {
        headers.push((HeaderName::from_static("user-agent"), value));
    }

    // 7. L-Locale
    headers.push((
        HeaderName::from_static("l-locale"),
        HeaderValue::from_static("en_US"),
    ));

    // 8. Accept-Language
    headers.push((
        HeaderName::from_static("accept-language"),
        HeaderValue::from_static("en-US"),
    ));

    // 9. Accept-Encoding
    headers.push((
        HeaderName::from_static("accept-encoding"),
        HeaderValue::from_static("gzip"),
    ));

    headers
}
