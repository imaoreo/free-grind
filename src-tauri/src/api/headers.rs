use rand;
use reqwest::header::{HeaderMap, HeaderValue};

const APP_VERSION: &str = "26.9.1.163471";
const BUILD_NUMBER: &str = "163471";
const TIMEZONE: &str = "Europe/Madrid";

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
    // 1. Authorization
    if let Some(token) = auth_token {
        headers.insert("Authorization", HeaderValue::from_str(token).unwrap());
    }

    // 2. L-Time-Zone
    headers.insert("L-Time-Zone", HeaderValue::from_static(TIMEZONE));

    // 3. L-Grindr-Roles
    if auth_token.is_some() {
        let roles = format!("[{}]", subscription_tier.to_uppercase());
        headers.insert(
            "L-Grindr-Roles",
            HeaderValue::from_str(&roles).unwrap(),
        );
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
        "L-Device-Info",
        HeaderValue::from_str(&device_info).unwrap(),
    );

    // 5. Accept
    headers.insert("Accept", HeaderValue::from_static("application/json"));

    // 6. User-Agent
    let user_agent = format!(
        "grindr3/{APP_VERSION};{BUILD_NUMBER};{subscription_tier};Android {};{};{}",
        device.android_version, device.device_model, device.manufacturer
    );
    headers.insert("User-Agent", HeaderValue::from_str(&user_agent).unwrap());

    // 7. L-Locale
    headers.insert("L-Locale", HeaderValue::from_static("en_US"));

    // 8. Accept-Language
    headers.insert("Accept-Language", HeaderValue::from_static("en-US"));

    // Additional headers
    headers.insert("requireRealDeviceInfo", HeaderValue::from_static("true"));

    headers
}
