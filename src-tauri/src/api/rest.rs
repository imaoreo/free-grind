use reqwest::Method;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use tauri::ipc::Response;

use crate::error::AppError;
use crate::state::AppState;

use super::client::GrindrClient;
use super::client::BASE_URL;
use super::headers::build_headers;

#[derive(Serialize, Deserialize)]
pub struct RawResponse {
    pub status: u16,
    #[serde(with = "serde_bytes")]
    pub body: Vec<u8>,
}

impl GrindrClient {
    pub(super) async fn ensure_valid_session(&self) -> Result<(), AppError> {
        let needs_refresh = {
            let session = self.session.read().await;
            let expires_at = session.as_ref().map(|s| s.expires_at).unwrap_or(0);
            expires_at > 0 && expires_at < (chrono::Utc::now().timestamp() as u64 + 60)
        };

        if needs_refresh {
            let _lock = self.refresh_lock.lock().await;
            // Double-check after acquiring lock
            let still_needs_refresh = {
                let session = self.session.read().await;
                let expires_at = session.as_ref().map(|s| s.expires_at).unwrap_or(0);
                expires_at > 0 && expires_at < (chrono::Utc::now().timestamp() as u64 + 60)
            };

            if still_needs_refresh {
                let _ = Box::pin(self.refresh_token()).await?;
            }
        }
        Ok(())
    }

    pub(super) async fn request_json<TReq, TResp>(
        &self,
        method: Method,
        path: &str,
        body: Option<&TReq>,
    ) -> Result<TResp, AppError>
    where
        TReq: Serialize + ?Sized,
        TResp: DeserializeOwned,
    {
        let is_auth_path = path == "/v8/sessions" || path.starts_with("/public/");
        let url = if path.starts_with("http") {
            path.to_owned()
        } else {
            format!("{BASE_URL}{path}")
        };
        #[cfg(debug_assertions)]
        eprintln!("[HTTP] -> {} {}", method, url);

        // Proactive refresh
        if !is_auth_path {
            let _ = self.ensure_valid_session().await;
        }

        let device = self.device.read().await;

        let make_request = |auth_token: Option<String>, device: &super::headers::DeviceInfo| {
            let is_external = url.starts_with("http") && !url.contains("grindr.mobi");
            let headers = if is_external {
                let mut h = reqwest::header::HeaderMap::new();
                h.insert("User-Agent", reqwest::header::HeaderValue::from_static("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"));
                h
            } else {
                build_headers(device, "Free", auth_token.as_deref())
            };
            let mut request = self.http.request(method.clone(), &url).headers(headers);
            if let Some(body) = body {
                request = request.json(body);
            }
            request
        };

        let auth_token = self.authorization_header().await;
        let mut response = make_request(auth_token.clone(), &device).send().await.map_err(|e| {
            #[cfg(debug_assertions)]
            eprintln!("[HTTP] network error on {} {}: {e}", method, url);
            e
        })?;

        if response.status().as_u16() == 401 && !is_auth_path {
            let _lock = self.refresh_lock.lock().await;

            // Check if the token has already been refreshed by someone else since our failed request
            let current_token = self.authorization_header().await;
            if current_token == auth_token {
                let _ = Box::pin(self.refresh_token()).await;
            }

            let new_auth_token = self.authorization_header().await;
            let device = self.device.read().await;
            response = make_request(new_auth_token, &device).send().await.map_err(|e| {
                #[cfg(debug_assertions)]
                eprintln!("[HTTP] network error on {} {}: {e}", method, url);
                e
            })?;
        }

        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        #[cfg(debug_assertions)]
        eprintln!(
            "[HTTP] <- {} {} | Status: {}",
            method,
            url,
            status
        );

        if !status.is_success() {
            #[cfg(debug_assertions)]
            eprintln!(
                "[HTTP] error {} {} -> status={} body={}",
                method, url, status, text
            );
            let json: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
            let code = json.get("code").and_then(|c| c.as_i64()).unwrap_or(0) as i32;
            let message = json
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or_else(|| if text.is_empty() { "Unknown error" } else { &text })
                .to_owned();

            return Err(AppError::Api { code, message });
        }

        let resp = serde_json::from_str::<TResp>(&text).map_err(|e| {
            #[cfg(debug_assertions)]
            eprintln!("[HTTP] JSON decode error on {} {}: {e}", method, url);
            AppError::from(e)
        })?;
        Ok(resp)
    }

    pub(super) async fn request_raw(
        &self,
        method: Method,
        path: &str,
        body: Option<Vec<u8>>,
        content_type: Option<&str>,
    ) -> Result<RawResponse, AppError> {
        let is_auth_path = path == "/v8/sessions" || path.starts_with("/public/");
        let url = if path.starts_with("http") {
            path.to_owned()
        } else {
            format!("{BASE_URL}{path}")
        };
        #[cfg(debug_assertions)]
        eprintln!("[HTTP] -> {} {}", method, url);

        // Proactive refresh
        if !is_auth_path {
            let _ = self.ensure_valid_session().await;
        }

        let is_external = path.starts_with("http");
        let auth_token = if is_auth_path || is_external {
            self.authorization_header().await
        } else {
            Some(
                self.authorization_header()
                    .await
                    .ok_or_else(|| AppError::Auth("Not logged in".to_owned()))?,
            )
        };

        let device = self.device.read().await;

        let make_request = |auth_token: Option<String>, device: &super::headers::DeviceInfo| {
            let is_external = url.starts_with("http") && !url.contains("grindr.mobi");
            let headers = if is_external {
                let mut h = reqwest::header::HeaderMap::new();
                h.insert("User-Agent", reqwest::header::HeaderValue::from_static("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"));
                h
            } else {
                build_headers(device, "Free", auth_token.as_deref())
            };
            let mut request = self.http.request(method.clone(), &url).headers(headers);

            if let Some(body) = body.as_ref() {
                request = request.body(body.clone());

                if let Some(content_type) = content_type {
                    request = request.header("Content-Type", content_type);
                } else {
                    request = request.header("Content-Type", "application/json");
                }
            }

            request
        };

        let mut response = make_request(auth_token.clone(), &device).send().await?;
        #[cfg(debug_assertions)]
        eprintln!(
            "[HTTP] <- {} {} | Status: {}",
            method,
            url,
            response.status()
        );

        if response.status().as_u16() == 401 && !is_auth_path {
            let _lock = self.refresh_lock.lock().await;

            let current_token = self.authorization_header().await;
            if current_token == auth_token {
                let _ = Box::pin(self.refresh_token()).await;
            }

            let new_auth_token = self.authorization_header().await;
            let device = self.device.read().await;
            response = make_request(new_auth_token, &device).send().await?;
        }

        let status = response.status().as_u16();
        let body = response.bytes().await?.to_vec();

        Ok(RawResponse { status, body })
    }
}

#[tauri::command]
pub async fn request(
    state: tauri::State<'_, AppState>,
    method: String,
    path: String,
    body: Option<Vec<u8>>,
    content_type: Option<String>,
) -> Result<Response, AppError> {
    let method_str = method.clone();
    let method = Method::from_str(&method).map_err(|_| AppError::Api {
        code: 400,
        message: format!("Invalid method: {method_str}"),
    })?;

    let raw = state
        .client()?
        .request_raw(method, &path, body, content_type.as_deref())
        .await;

    let raw = raw?;

    Ok(Response::new(
        rmp_serde::encode::to_vec_named(&raw).map_err(|e| AppError::Http(e.to_string()))?,
    ))
}
