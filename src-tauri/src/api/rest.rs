use reqwest::Method;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use tauri::ipc::Response;

use crate::error::AppError;
use crate::state::AppState;

use super::client::GrindrClient;
use super::client::BASE_URL;

#[derive(Serialize, Deserialize)]
pub struct RawResponse {
    pub status: u16,
    #[serde(with = "serde_bytes")]
    pub body: Vec<u8>,
}

impl GrindrClient {
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
        let url = format!("{BASE_URL}{path}");
        let mut request = self.http.request(method.clone(), &url);

        if let Some(body) = body {
            request = request.json(body);
        }

        eprintln!("Request: {} {} on {:?}", method, url, std::env::consts::OS);

        let response = request.send().await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            eprintln!("API error: status={}, body={}", status, text);
            
            let json: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
            let code = json.get("code").and_then(|c| c.as_i64()).unwrap_or(0) as i32;
            let message = json
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or_else(|| {
                    if text.is_empty() {
                        "Unknown error"
                    } else {
                        &text
                    }
                })
                .to_owned();
            
            return Err(AppError::Api {
                code,
                message,
            });
        }

        response.json::<TResp>().await.map_err(Into::into)
    }

    async fn request_raw(
        &self,
        method: Method,
        path: &str,
        body: Option<Vec<u8>>,
        content_type: Option<&str>,
    ) -> Result<RawResponse, AppError> {
        let is_public_path = path.starts_with("/public/");

        let mut authorization = if is_public_path {
            self.authorization_header().await
        } else {
            Some(
                self.authorization_header()
                    .await
                    .ok_or_else(|| AppError::Auth("Not logged in".to_owned()))?,
            )
        };

        let make_request = |authorization: Option<&str>| {
            let mut request = self
                .http
                .request(method.clone(), format!("{BASE_URL}{path}"));

            if let Some(authorization) = authorization {
                request = request.header("Authorization", authorization);
            }

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

        let mut response = make_request(authorization.as_deref()).send().await?;

        if response.status().as_u16() == 401 && !is_public_path {
            if self.refresh_token().await.is_ok() {
                authorization = self.authorization_header().await;
                if authorization.is_some() {
                    response = make_request(authorization.as_deref()).send().await?;
                }
            }
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
    println!(
        "Received request: {method} {path} with body of length {}",
        body.as_ref().map(|b| b.len()).unwrap_or(0)
    );
    let method = Method::from_str(&method).map_err(|_| AppError::Api {
        code: 400,
        message: format!("Invalid method: {method}"),
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
