use reqwest::Client;
use reqwest_cookie_store::CookieStoreMutex;
use std::sync::Arc;
use tokio::sync::RwLock;
use url::Url;

use crate::error::AppError;

use super::auth::{AuthStorage, Session};
use super::headers::{build_headers, DeviceInfo};

pub const BASE_URL: &str = "https://grindr.mobi";

pub struct GrindrClient {
    pub(super) http: Client,
    pub(super) session: RwLock<Option<Session>>,
    pub(super) user_agent: String,
    #[allow(dead_code)]
    pub(super) cookie_store: Arc<CookieStoreMutex>,
    pub(super) device: RwLock<DeviceInfo>,
}

impl GrindrClient {
    pub fn user_agent(&self) -> &str {
        &self.user_agent
    }

    /// Returns a `Cookie` header value containing all cookies stored for `https://grindr.mobi`,
    /// so that the WebSocket handshake can include the same Cloudflare session cookies.
    #[allow(dead_code)]
    pub fn cookie_header_for_base_url(&self) -> Option<String> {
        let url = Url::parse(BASE_URL).ok()?;
        let store = self.cookie_store.lock().ok()?;
        let pairs: Vec<_> = store.get_request_values(&url).collect();
        if pairs.is_empty() {
            None
        } else {
            Some(
                pairs
                    .iter()
                    .map(|(k, v)| format!("{k}={v}"))
                    .collect::<Vec<_>>()
                    .join("; "),
            )
        }
    }
}

impl GrindrClient {
    pub fn new() -> Result<Self, AppError> {
        let mut device = DeviceInfo::default();
        let cookie_store = Arc::new(CookieStoreMutex::new(Default::default()));

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
            Err(error) => {
                #[cfg(debug_assertions)]
                eprintln!(
                    "[HTTP-CLIENT] Failed to restore persisted session (continuing unauthenticated): {}",
                    error
                );
                None
            }
        };

        let headers = build_headers(&device, "Free", None);
        let user_agent = headers
            .get("User-Agent")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_owned();

        #[cfg(target_os = "windows")]
        let http = {
            // Windows: use system certificate store, skip custom CA
            Client::builder()
                .cookie_provider(cookie_store.clone())
                .build()?
        };

        #[cfg(not(target_os = "windows"))]
        let http = {
            // Non-Windows: use system/user trust roots.
            #[cfg(target_os = "android")]
            let mut builder = Client::builder()
                .cookie_provider(cookie_store.clone());

            #[cfg(not(target_os = "android"))]
            let builder = Client::builder()
                .cookie_provider(cookie_store.clone());

            #[cfg(target_os = "android")]
            {
                // Allow TLS interception tooling on Android builds.
                builder = builder.danger_accept_invalid_certs(true);
            }

            builder.build()?
        };

        #[cfg(debug_assertions)]
                eprintln!(
            "[HTTP-CLIENT] Initializing GrindrClient on os={}",
            std::env::consts::OS
        );

        Ok(Self {
            http,
            session: RwLock::new(session),
            user_agent,
            cookie_store,
            device: RwLock::new(device),
        })
    }
}
