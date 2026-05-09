use reqwest::Client;
use reqwest_cookie_store::CookieStoreMutex;
use std::sync::Arc;
use tokio::sync::RwLock;
use url::Url;

use crate::error::AppError;

use super::auth::{AuthStorage, Session};
use super::headers::{build_default_headers, DeviceInfo};

pub const BASE_URL: &str = "https://grindr.mobi";

pub struct GrindrClient {
    pub(super) http: Client,
    pub(super) session: RwLock<Option<Session>>,
    pub(super) user_agent: String,
    pub(super) cookie_store: Arc<CookieStoreMutex>,
}

impl GrindrClient {
    pub fn user_agent(&self) -> &str {
        &self.user_agent
    }

    /// Returns a `Cookie` header value containing all cookies stored for `https://grindr.mobi`,
    /// so that the WebSocket handshake can include the same Cloudflare session cookies.
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
        let device = DeviceInfo::default();
        let headers = build_default_headers(&device, "Free");
        let user_agent = headers
            .get("User-Agent")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_owned();

        let cookie_store = Arc::new(CookieStoreMutex::new(Default::default()));

        #[cfg(target_os = "windows")]
        let http = {
            // Windows: use system certificate store, skip custom CA
            Client::builder()
                .default_headers(headers)
                .cookie_provider(cookie_store.clone())
                .build()?
        };

        #[cfg(not(target_os = "windows"))]
        let http = {
            // Non-Windows: use system/user trust roots.
            #[cfg(target_os = "android")]
            let mut builder = Client::builder()
                .default_headers(headers)
                .cookie_provider(cookie_store.clone());

            #[cfg(not(target_os = "android"))]
            let builder = Client::builder()
                .default_headers(headers)
                .cookie_provider(cookie_store.clone());

            #[cfg(target_os = "android")]
            {
                // Allow TLS interception tooling on Android builds.
                builder = builder.danger_accept_invalid_certs(true);
            }

            builder.build()?
        };

        eprintln!(
            "[CLIENT] Initializing GrindrClient on os={}",
            std::env::consts::OS
        );

        let session = match AuthStorage::get_session() {
            Ok(Some(session)) => {
                eprintln!(
                    "[CLIENT] Restored session for profile_id={}",
                    session.profile_id
                );
                Some(session)
            }
            Ok(None) => {
                eprintln!("[CLIENT] No stored session found; starting unauthenticated.");
                None
            }
            Err(error) => {
                eprintln!(
                    "[AUTH] Failed to restore persisted session (continuing unauthenticated): {}",
                    error
                );
                None
            }
        };

        Ok(Self {
            http,
            session: RwLock::new(session),
            user_agent,
            cookie_store,
        })
    }
}
