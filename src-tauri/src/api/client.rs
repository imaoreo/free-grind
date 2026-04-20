use reqwest::Client;
use tokio::sync::RwLock;

use crate::error::AppError;

use super::auth::{AuthStorage, Session};
use super::headers::{build_default_headers, DeviceInfo};

pub const BASE_URL: &str = "https://grindr.mobi";

pub struct GrindrClient {
    pub(super) http: Client,
    pub(super) session: RwLock<Option<Session>>,
}

impl GrindrClient {
    pub fn new() -> Result<Self, AppError> {
        let device = DeviceInfo::default();
        let headers = build_default_headers(&device, "Free");

        let http = Client::builder().default_headers(headers).build()?;

        let session = AuthStorage::get_session()?;

        Ok(Self {
            http,
            session: RwLock::new(session),
        })
    }
}
