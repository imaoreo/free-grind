use reqwest::{Certificate, Client};
use std::fs;
use tokio::sync::RwLock;

use crate::error::AppError;

use super::auth::{AuthStorage, Session};
use super::headers::{build_default_headers, DeviceInfo};

pub const BASE_URL: &str = "https://grindr.mobi";
const DEFAULT_HTTP_TOOLKIT_CA_PATH: &str = "/Users/jaybr/Library/Preferences/httptoolkit/ca.pem";
const EMBEDDED_HTTP_TOOLKIT_CA_PEM: &[u8] = include_bytes!("../../certs/httptoolkit-ca.pem");

pub struct GrindrClient {
    pub(super) http: Client,
    pub(super) session: RwLock<Option<Session>>,
}

impl GrindrClient {
    pub fn new() -> Result<Self, AppError> {
        let device = DeviceInfo::default();
        let headers = build_default_headers(&device, "Free");

        let ca_path = std::env::var("OPEN_GRIND_CA_PEM_PATH")
            .unwrap_or_else(|_| DEFAULT_HTTP_TOOLKIT_CA_PATH.to_owned());

        let mut builder = Client::builder().default_headers(headers);
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

        let http = builder.build()?;

        let session = AuthStorage::get_session()?;

        Ok(Self {
            http,
            session: RwLock::new(session),
        })
    }
}
