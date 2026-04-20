use crate::api::client::GrindrClient;
use crate::error::AppError;

pub struct AppState {
    pub client: Option<GrindrClient>,
}

impl AppState {
    pub fn client(&self) -> Result<&GrindrClient, AppError> {
        self.client.as_ref().ok_or_else(|| AppError::NotInitialized)
    }
}
