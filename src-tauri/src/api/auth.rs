#[cfg(not(any(target_os = "windows", all(target_os = "macos", debug_assertions))))]
use keyring_core::Entry;
use serde::{Deserialize, Serialize};
#[cfg(any(target_os = "windows", all(target_os = "macos", debug_assertions)))]
use std::path::PathBuf;

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PushTokenRequest {
    vendor_provided_identifier: String,
    token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JwtClaims {
    exp: u64,
    profile_id: String,
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
    #[cfg(target_os = "windows")]
    fn windows_session_file_path() -> Result<PathBuf, AppError> {
        let app_data = std::env::var_os("APPDATA")
            .or_else(|| std::env::var_os("LOCALAPPDATA"))
            .ok_or_else(|| {
                AppError::Auth(
                    "APPDATA and LOCALAPPDATA are not set; cannot resolve session path".to_owned(),
                )
            })?;

        Ok(PathBuf::from(app_data)
            .join("free-grind")
            .join("session.msgpack"))
    }

    #[cfg(target_os = "windows")]
    pub fn get_session() -> Result<Option<Session>, AppError> {
        let path = Self::windows_session_file_path()?;

        let session_bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(AppError::Auth(format!(
                    "Failed to read Windows session from {}: {}",
                    path.display(),
                    error
                )))
            }
        };

        rmp_serde::decode::from_slice(&session_bytes)
            .map_err(|e| AppError::Auth(e.to_string()))
            .map(Some)
    }

    #[cfg(target_os = "windows")]
    pub fn set_session(session: &Session) -> Result<(), AppError> {
        let path = Self::windows_session_file_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                AppError::Auth(format!(
                    "Failed to create Windows session directory {}: {}",
                    parent.display(),
                    error
                ))
            })?;
        }

        let session_bytes = rmp_serde::encode::to_vec(session).unwrap();
        std::fs::write(&path, session_bytes).map_err(|error| {
            AppError::Auth(format!(
                "Failed to write Windows session {}: {}",
                path.display(),
                error
            ))
        })
    }

    #[cfg(target_os = "windows")]
    pub fn clear_session() -> Result<(), AppError> {
        let path = Self::windows_session_file_path()?;
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(AppError::Auth(format!(
                "Failed to clear Windows session {}: {}",
                path.display(),
                error
            ))),
        }
    }

    #[cfg(all(target_os = "macos", debug_assertions))]
    fn dev_session_file_path() -> Result<PathBuf, AppError> {
        let home = std::env::var("HOME").map_err(|_| {
            AppError::Auth("HOME is not set; cannot resolve session path".to_owned())
        })?;

        Ok(PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("free-grind")
            .join("dev-session.msgpack"))
    }

    #[cfg(all(target_os = "macos", debug_assertions))]
    pub fn get_session() -> Result<Option<Session>, AppError> {
        let path = Self::dev_session_file_path()?;

        let session_bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(AppError::Auth(format!(
                    "Failed to read dev session from {}: {}",
                    path.display(),
                    error
                )))
            }
        };

        rmp_serde::decode::from_slice(&session_bytes)
            .map_err(|e| AppError::Auth(e.to_string()))
            .map(Some)
    }

    #[cfg(all(target_os = "macos", debug_assertions))]
    pub fn set_session(session: &Session) -> Result<(), AppError> {
        let path = Self::dev_session_file_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                AppError::Auth(format!(
                    "Failed to create session directory {}: {}",
                    parent.display(),
                    error
                ))
            })?;
        }

        let session_bytes = rmp_serde::encode::to_vec(session).unwrap();
        std::fs::write(&path, session_bytes).map_err(|error| {
            AppError::Auth(format!(
                "Failed to write dev session {}: {}",
                path.display(),
                error
            ))
        })
    }

    #[cfg(all(target_os = "macos", debug_assertions))]
    pub fn clear_session() -> Result<(), AppError> {
        let path = Self::dev_session_file_path()?;
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(AppError::Auth(format!(
                "Failed to clear dev session {}: {}",
                path.display(),
                error
            ))),
        }
    }

    #[cfg(not(any(target_os = "windows", all(target_os = "macos", debug_assertions))))]
    fn get_session_entry() -> Result<Entry, AppError> {
        Entry::new("free-grind", "session").map_err(|e| AppError::Auth(e.to_string()))
    }

    #[cfg(not(any(target_os = "windows", all(target_os = "macos", debug_assertions))))]
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

    #[cfg(not(any(target_os = "windows", all(target_os = "macos", debug_assertions))))]
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

    pub async fn login_with_jwt(&self, token: &str) -> Result<LoginResult, AppError> {
        let claims = decode_session_jwt(token)?;

        let session = Session {
            email: String::new(),
            profile_id: claims.profile_id.clone(),
            session_id: token.to_owned(),
            auth_token: String::new(),
            expires_at: claims.exp,
        };

        AuthStorage::set_session(&session)?;
        *self.session.write().await = Some(session);

        Ok(LoginResult {
            profile_id: claims.profile_id,
        })
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

    pub async fn sync_push_token(&self, token: &str) -> Result<(), AppError> {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            eprintln!("[PUSH_SYNC] sync_push_token called with empty token");
            return Err(AppError::Api {
                code: 400,
                message: "Push token is empty".to_owned(),
            });
        }

        let identifier = trimmed.split(':').next().unwrap_or(trimmed).to_owned();
        eprintln!(
            "[PUSH_SYNC] Syncing push token: token_len={}, identifier={}",
            trimmed.len(),
            identifier
        );
        let payload = PushTokenRequest {
            vendor_provided_identifier: identifier,
            token: trimmed.to_owned(),
        };
        let body = serde_json::to_vec(&payload)
            .map_err(|e| AppError::Http(format!("Failed to serialize push token payload: {e}")))?;

        let response = self
            .request_raw(
                reqwest::Method::POST,
                "/v3/gcm-push-tokens",
                Some(body),
                Some("application/json"),
            )
            .await?;

        if (200..300).contains(&response.status) {
            eprintln!(
                "[PUSH_SYNC] /v3/gcm-push-tokens sync success: status={}",
                response.status
            );
            Ok(())
        } else {
            let message = String::from_utf8(response.body)
                .unwrap_or_else(|_| "Failed to sync push token".to_owned());
            eprintln!(
                "[PUSH_SYNC] /v3/gcm-push-tokens sync failed: status={}, body={}",
                response.status, message
            );
            Err(AppError::Api {
                code: response.status as i32,
                message,
            })
        }
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
pub async fn login_with_jwt(
    state: tauri::State<'_, AppState>,
    token: String,
) -> Result<LoginResult, AppError> {
    state.client()?.login_with_jwt(&token).await
}

#[tauri::command]
pub async fn refresh_token(state: tauri::State<'_, AppState>) -> Result<LoginResult, AppError> {
    state.client()?.refresh_token().await
}

#[tauri::command]
pub async fn logout(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    #[cfg(any(target_os = "windows", all(target_os = "macos", debug_assertions)))]
    AuthStorage::clear_session()?;

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

#[tauri::command]
pub async fn sync_push_token(
    state: tauri::State<'_, AppState>,
    token: String,
) -> Result<(), AppError> {
    eprintln!("[PUSH_SYNC] Tauri command sync_push_token invoked");
    state.client()?.sync_push_token(&token).await
}
