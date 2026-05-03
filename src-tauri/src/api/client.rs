use reqwest::Client;
use reqwest_cookie_store::CookieStoreMutex;
use std::sync::Arc;
use tokio::sync::RwLock;
use url::Url;

use crate::error::AppError;

use super::auth::{AuthStorage, Session};
use super::headers::{build_default_headers, DeviceInfo};

pub const BASE_URL: &str = "https://grindr.mobi";

#[cfg(not(target_os = "windows"))]
use reqwest::Certificate;
#[cfg(not(target_os = "windows"))]
use std::fs;
#[cfg(not(target_os = "windows"))]
const DEFAULT_HTTP_TOOLKIT_CA_PATH: &str = "/Users/jaybr/Library/Preferences/httptoolkit/ca.pem";
#[cfg(not(target_os = "windows"))]
const EMBEDDED_HTTP_TOOLKIT_CA_PEM: &[u8] = include_bytes!("../../certs/httptoolkit-ca.pem");

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
            // Non-Windows: try custom CA certificates
            let ca_path = std::env::var("OPEN_GRIND_CA_PEM_PATH")
                .unwrap_or_else(|_| DEFAULT_HTTP_TOOLKIT_CA_PATH.to_owned());

            let mut builder = Client::builder()
                .default_headers(headers)
                .cookie_provider(cookie_store.clone());

            let mut custom_ca_loaded = false;

            match fs::read(&ca_path) {
                Ok(pem) => match Certificate::from_pem(&pem) {
                    Ok(cert) => {
                        println!("Loaded custom CA certificate from {ca_path}");
                        builder = builder.add_root_certificate(cert);
                        custom_ca_loaded = true;
                    }
                    Err(error) => {
                        eprintln!(
                            "Failed to parse custom CA certificate at {ca_path}: {error}. Falling back to embedded CA."
                        );
                    }
                },
                Err(error) => {
                    eprintln!(
                        "Could not read custom CA certificate at {ca_path}: {error}. Falling back to embedded CA."
                    );
                }
            }

            if !custom_ca_loaded {
                match Certificate::from_pem(EMBEDDED_HTTP_TOOLKIT_CA_PEM) {
                    Ok(cert) => {
                        println!("Loaded embedded HTTP Toolkit CA certificate");
                        builder = builder.add_root_certificate(cert);
                    }
                    Err(error) => {
                        eprintln!(
                            "Failed to parse embedded HTTP Toolkit CA certificate: {error}. Continuing without custom CA."
                        );
                    }
                }
            }

            builder.build()?
        };

        let session = AuthStorage::get_session()?;

        Ok(Self {
            http,
            session: RwLock::new(session),
            user_agent,
            cookie_store,
        })
    }
}
