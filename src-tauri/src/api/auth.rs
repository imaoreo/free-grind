use keyring_core::Entry;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::state::AppState;

use super::client::GrindrClient;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Session {
    pub email: String,
    pub expires_at: u64,
    pub profile_id: String,
    pub session_id: String,
    pub auth_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResponse {
    pub profile_id: String,
    pub session_id: String,
    pub auth_token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
    pub token: Option<String>,
    pub geohash: Option<String>,
}

trait AuthRequest: Serialize {
    fn email(&self) -> &str;
}

impl AuthRequest for LoginRequest {
    fn email(&self) -> &str {
        &self.email
    }
}

impl AuthRequest for RefreshRequest {
    fn email(&self) -> &str {
        &self.email
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshRequest {
    pub email: String,
    pub auth_token: String,
    pub token: Option<String>,
    pub geohash: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResult {
    pub profile_id: String,
}

#[derive(Debug, Deserialize)]
struct JwtClaims {
    exp: u64,
}

impl LoginRequest {
    pub fn new(email: String, password: String) -> Self {
        Self {
            email,
            password,
            token: None,
            geohash: None,
        }
    }
}

impl RefreshRequest {
    pub fn new(email: String, auth_token: String) -> Self {
        Self {
            email,
            auth_token,
            token: None,
            geohash: None,
        }
    }
}

fn decode_session_jwt(token: &str) -> Result<JwtClaims, AppError> {
    let data = jsonwebtoken::dangerous::insecure_decode::<JwtClaims>(token)
        .map_err(|e| AppError::Auth(format!("JWT decode failed: {e}")))?;

    Ok(data.claims)
}

pub struct AuthStorage;

impl AuthStorage {
    fn get_session_entry() -> Result<Entry, AppError> {
        Entry::new("open-grind", "session").map_err(|e| AppError::Auth(e.to_string()))
    }
    pub fn get_session() -> Result<Option<Session>, AppError> {
        let entry = Self::get_session_entry()?;
        let session_bytes = match entry.get_secret() {
            Ok(bytes) => bytes,
            Err(keyring_core::Error::NoEntry) => return Ok(None),
            Err(e) => return Err(AppError::Auth(e.to_string())),
        };
        rmp_serde::decode::from_slice(&session_bytes)
            .map_err(|e| AppError::Auth(e.to_string()))
            .map(Some)
    }
    pub fn set_session(session: &Session) -> Result<(), AppError> {
        let session_bytes = rmp_serde::encode::to_vec(session).unwrap();
        Self::get_session_entry()?
            .set_secret(&session_bytes)
            .map_err(|e| AppError::Auth(e.to_string()))
    }
}

impl GrindrClient {
    async fn create_session(&self, body: &impl AuthRequest) -> Result<Session, AppError> {
        let session_resp: SessionResponse = self
            .request_json(reqwest::Method::POST, "/v8/sessions", Some(body))
            .await?;
        let claims = decode_session_jwt(&session_resp.session_id)?;

        let session = Session {
            email: body.email().to_owned(),
            profile_id: session_resp.profile_id.clone(),
            session_id: session_resp.session_id,
            auth_token: session_resp.auth_token,
            expires_at: claims.exp,
        };

        AuthStorage::set_session(&session)?;

        Ok(session)
    }

    pub async fn login(&self, email: &str, password: &str) -> Result<LoginResult, AppError> {
        let body = LoginRequest::new(email.to_owned(), password.to_owned());
        let session = self.create_session(&body).await?;
        let profile_id = session.profile_id.clone();

        *self.session.write().await = Some(session);

        Ok(LoginResult { profile_id })
    }

    pub async fn refresh_token(&self) -> Result<LoginResult, AppError> {
        let current = self.session.read().await;
        let session = current
            .as_ref()
            .ok_or_else(|| AppError::Auth("Not logged in".to_owned()))?;

        let body = RefreshRequest::new(session.email.clone(), session.auth_token.clone());

        drop(current);

        let session = self.create_session(&body).await?;
        let profile_id = session.profile_id.clone();
        *self.session.write().await = Some(session);

        Ok(LoginResult { profile_id })
    }

    pub async fn authorization_header(&self) -> Option<String> {
        let expires_at = {
            let session = self.session.read().await;
            session.as_ref().map(|s| s.expires_at).unwrap_or(0)
        };

        if expires_at < (chrono::Utc::now().timestamp() as u64 + 60) {
            let _ = self.refresh_token().await;
        }

        let session = self.session.read().await;
        session
            .as_ref()
            .map(|s| format!("Grindr3 {}", s.session_id))
    }
}

#[tauri::command]
pub async fn login(
    state: tauri::State<'_, AppState>,
    email: String,
    password: String,
) -> Result<LoginResult, AppError> {
    state.client()?.login(&email, &password).await
}

#[tauri::command]
pub async fn refresh_token(state: tauri::State<'_, AppState>) -> Result<LoginResult, AppError> {
    state.client()?.refresh_token().await
}

#[tauri::command]
pub async fn logout(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    state
        .client()?
        .session
        .write()
        .await
        .take()
        .ok_or_else(|| AppError::Auth("Not logged in".to_owned()))
        .map(|_| ())
}

#[tauri::command]
pub async fn auth_state(state: tauri::State<'_, AppState>) -> Result<Option<u64>, AppError> {
    let session = state.client()?.session.read().await;
    Ok(session
        .as_ref()
        .and_then(|s| s.profile_id.parse::<u64>().ok()))
}

#[tauri::command]
pub async fn websocket_token(
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, AppError> {
    let client = state.client()?;

    // Triggers refresh flow when needed before exposing token.
    let _ = client.authorization_header().await;

    let session = client.session.read().await;
    Ok(session.as_ref().map(|s| s.session_id.clone()))
}
