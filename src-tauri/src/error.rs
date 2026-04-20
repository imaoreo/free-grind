use std::fmt;

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    Http(String),
    Auth(String),
    Api { code: i32, message: String },
    NotInitialized,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Http(msg) => write!(f, "HTTP error: {msg}"),
            AppError::Auth(msg) => write!(f, "Auth error: {msg}"),
            AppError::Api { code, message } => write!(f, "API error {code}: {message}"),
            AppError::NotInitialized => write!(f, "GrindrClient not initialized"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Http(e.to_string())
    }
}

impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.to_string()
    }
}
