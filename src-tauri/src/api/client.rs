use wreq::Client;

use tokio::sync::{Mutex, RwLock};

use crate::error::AppError;

use super::auth::{AuthStorage, Session};
use super::headers::{build_headers, build_grindr_client, DeviceInfo};

pub const BASE_URL: &str = "https://grindr.mobi";

pub struct GrindrClient {
    pub(super) http: Client,
    pub(super) session: RwLock<Option<Session>>,
    pub(super) user_agent: String,
    pub(super) device: RwLock<DeviceInfo>,
    pub(super) refresh_lock: Mutex<()>,
}

impl GrindrClient {
    pub fn user_agent(&self) -> &str {
        &self.user_agent
    }

    pub fn cookie_header_for_base_url(&self) -> Option<String> {
        // wreq doesn't track cookies as it's a fingerprinting client
        // WebSocket connections use token in URL + Authorization header instead
        None
    }
}

impl GrindrClient {
    pub fn new() -> Result<Self, AppError> {
        let mut device = DeviceInfo::default();

        let session = match AuthStorage::get_session() {
            Ok(Some(session)) => {
                #[cfg(debug_assertions)]
                eprintln!(
                    "[HTTP-CLIENT] Restored session for profile_id={}",
                    session.profile_id
                );
                // Restore device IDs from the session
                device.device_id = session.device_id.clone();
                device.advertising_id = session.advertising_id.clone();
                Some(session)
            }
            Ok(None) => {
                #[cfg(debug_assertions)]
                eprintln!("[HTTP-CLIENT] No stored session found; starting unauthenticated.");
                None
            }
            Err(_error) => {
                #[cfg(debug_assertions)]
                eprintln!(
                    "[HTTP-CLIENT] Failed to restore persisted session (continuing unauthenticated): {}",
                    _error
                );
                None
            }
        };

        let headers = build_headers(&device, "Free", None);
        let user_agent = headers
            .iter()
            .find(|(name, _)| name.as_str() == "user-agent")
            .and_then(|(_, value)| value.to_str().ok())
            .unwrap_or("")
            .to_owned();

        let http = build_grindr_client()
            .map_err(|e| AppError::Http(format!("Failed to build wreq client: {}", e)))?;

        #[cfg(debug_assertions)]
        eprintln!(
            "[HTTP-CLIENT] Initializing GrindrClient on os={}",
            std::env::consts::OS
        );

        Ok(Self {
            http,
            session: RwLock::new(session),
            user_agent,
            device: RwLock::new(device),
            refresh_lock: Mutex::new(()),
        })
    }
}
