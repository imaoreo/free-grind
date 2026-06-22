use rand;
use reqwest::header::{HeaderMap, HeaderValue};
use serde::Deserialize;
use std::sync::OnceLock;
use std::time::Duration;

const DEFAULT_APP_VERSION: &str = "26.9.1.163471";
const DEFAULT_BUILD_NUMBER: &str = "163471";
const TIMEZONE: &str = "Europe/Madrid";
const VERSION_FILE_URL: &str =
    "https://raw.githubusercontent.com/imaoreo/free-grind/main/version.json";

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

pub fn build_headers(
    device: &DeviceInfo,
    subscription_tier: &str,
    auth_token: Option<&str>,
) -> HeaderMap {
    let mut headers = HeaderMap::new();

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
        headers.insert("Authorization", HeaderValue::from_str(token).unwrap());
    }

    // 2. L-Time-Zone
    headers.insert("l-time-zone", HeaderValue::from_static(TIMEZONE));

    // 3. L-Grindr-Roles (only when authorized)
    if auth_token.is_some() {
        let roles = format!("[{}]", subscription_tier.to_uppercase());
        headers.insert("l-grindr-roles", HeaderValue::from_str(&roles).unwrap());
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
    headers.insert(
        "l-device-info",
        HeaderValue::from_str(&device_info).unwrap(),
    );

    // 5. Accept
    headers.insert("accept", HeaderValue::from_static("application/json"));

    // 6. User-Agent
    let version_info = version_info();
    let user_agent = format!(
        "grindr3/{};{};{subscription_tier};Android {};{};{}",
        version_info.app_version,
        version_info.build_number,
        device.android_version,
        device.device_model,
        device.manufacturer
    );
    headers.insert("user-agent", HeaderValue::from_str(&user_agent).unwrap());

    // 7. L-Locale
    headers.insert("l-locale", HeaderValue::from_static("en_US"));

    // 8. Accept-Language
    headers.insert("accept-language", HeaderValue::from_static("en-US"));

    // 9. Accept-Encoding
    headers.insert("accept-encoding", HeaderValue::from_static("gzip"));

    // Content-Type, Content-Length/Transfer-Encoding and Cookie are added by reqwest itself
    // Host is moved to the :authority pseudo-header in HTTP/2

    headers
}
