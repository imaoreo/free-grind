use rand;
use reqwest::header::{HeaderMap, HeaderValue};

const APP_VERSION: &str = "25.20.0.147239";
const BUILD_NUMBER: &str = "147239";
const TIMEZONE: &str = "Europe/Madrid";

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
        let device_id =
            format!("{:x}", rand::random::<u64>()) + &format!("{:x}", rand::random::<u64>());
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

pub fn build_default_headers(device: &DeviceInfo, subscription_tier: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();

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

    let user_agent = format!(
        "grindr3/{APP_VERSION};{BUILD_NUMBER};{subscription_tier};Android {};{};{}",
        device.android_version, device.device_model, device.manufacturer
    );
    headers.insert("User-Agent", HeaderValue::from_str(&user_agent).unwrap());

    headers.insert("requireRealDeviceInfo", HeaderValue::from_static("true"));

    headers.insert("L-Time-Zone", HeaderValue::from_static(TIMEZONE));

    headers.insert("L-Locale", HeaderValue::from_static("en_US"));
    headers.insert("Accept-Language", HeaderValue::from_static("en-US"));

    headers.insert("Accept", HeaderValue::from_static("application/json"));

    headers
}
