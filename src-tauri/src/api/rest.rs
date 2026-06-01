use reqwest::Method;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use tauri::ipc::Response;

use crate::error::AppError;
use crate::state::AppState;

use super::client::GrindrClient;
use super::client::BASE_URL;
use super::headers::{build_headers, build_user_agent};

#[cfg(target_os = "android")]
use base64::{engine::general_purpose::STANDARD, Engine as _};
#[cfg(target_os = "android")]
use jni::objects::{JObject, JString, JValue};
#[cfg(target_os = "android")]
use jni::JavaVM;

#[cfg(target_os = "android")]
#[derive(Deserialize)]
struct AndroidOkHttpResult {
    status: u16,
    #[serde(rename = "bodyBase64")]
    body_base64: String,
    error: Option<String>,
}

#[cfg(target_os = "android")]
fn android_okhttp_execute(
    method: &str,
    url: &str,
    headers: &reqwest::header::HeaderMap,
    body: Option<Vec<u8>>,
    content_type: Option<&str>,
) -> Result<RawResponse, AppError> {
    let headers_json = {
        let mut m = serde_json::Map::new();
        for (name, value) in headers {
            if let Ok(s) = value.to_str() {
                m.insert(name.to_string(), serde_json::Value::String(s.to_owned()));
            }
        }
        serde_json::Value::Object(m).to_string()
    };

    let body_b64 = body.map(|b| STANDARD.encode(b));
    let vm_ptr = ndk_context::android_context().vm();
    let vm = unsafe { JavaVM::from_raw(vm_ptr.cast()) }
        .map_err(|e| AppError::Http(format!("JNI VM init failed: {e}")))?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| AppError::Http(format!("JNI attach failed: {e}")))?;

    let j_method = env
        .new_string(method)
        .map_err(|e| AppError::Http(format!("JNI method string failed: {e}")))?;
    let j_url = env
        .new_string(url)
        .map_err(|e| AppError::Http(format!("JNI url string failed: {e}")))?;
    let j_headers = env
        .new_string(headers_json)
        .map_err(|e| AppError::Http(format!("JNI headers string failed: {e}")))?;

    let j_body = if let Some(b64) = body_b64 {
        Some(
            env.new_string(b64)
                .map_err(|e| AppError::Http(format!("JNI body string failed: {e}")))?,
        )
    } else {
        None
    };

    let j_content_type = if let Some(ct) = content_type {
        Some(
            env.new_string(ct)
                .map_err(|e| AppError::Http(format!("JNI content-type string failed: {e}")))?,
        )
    } else {
        None
    };

    let body_obj = j_body
        .as_ref()
        .map(|s| JObject::from(*s))
        .unwrap_or_else(JObject::null);
    let ct_obj = j_content_type
        .as_ref()
        .map(|s| JObject::from(*s))
        .unwrap_or_else(JObject::null);

    let ret = env
        .call_static_method(
            "dev/estopia/free_grind/OkHttpBridge",
            "execute",
            "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;",
            &[
                JValue::Object(&JObject::from(j_method)),
                JValue::Object(&JObject::from(j_url)),
                JValue::Object(&JObject::from(j_headers)),
                JValue::Object(&body_obj),
                JValue::Object(&ct_obj),
            ],
        )
        .map_err(|e| AppError::Http(format!("JNI OkHttpBridge.execute failed: {e}")))?;

    let j_out_obj = ret
        .l()
        .map_err(|e| AppError::Http(format!("JNI return object conversion failed: {e}")))?;
    let j_out = JString::from(j_out_obj);
    let out: String = env
        .get_string(&j_out)
        .map_err(|e| AppError::Http(format!("JNI return string read failed: {e}")))?
        .into();

    let parsed: AndroidOkHttpResult = serde_json::from_str(&out)
        .map_err(|e| AppError::Http(format!("Android OkHttp bridge JSON parse failed: {e}")))?;

    if parsed.status == 0 {
        return Err(AppError::Http(
            parsed
                .error
                .unwrap_or_else(|| "Android OkHttp bridge request failed".to_owned()),
        ));
    }

    let body = STANDARD
        .decode(parsed.body_base64)
        .map_err(|e| AppError::Http(format!("Android OkHttp bridge base64 decode failed: {e}")))?;

    Ok(RawResponse {
        status: parsed.status,
        body,
    })
}

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
        #[cfg(target_os = "android")]
        {
            let is_external = path.starts_with("http") && !path.contains("grindr.mobi");
            if !is_external {
                let body_bytes = match body {
                    Some(b) => Some(
                        serde_json::to_vec(b)
                            .map_err(|e| AppError::Http(format!("JSON encode failed: {e}")))?,
                    ),
                    None => None,
                };

                let raw = self
                    .request_raw(method.clone(), path, body_bytes, Some("application/json"))
                    .await?;

                let text = String::from_utf8(raw.body).unwrap_or_default();
                if !(200..300).contains(&raw.status) {
                    let json: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
                    let code = json.get("code").and_then(|c| c.as_i64()).unwrap_or(0) as i32;
                    let message = json
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or_else(|| if text.is_empty() { "Unknown error" } else { &text })
                        .to_owned();
                    return Err(AppError::Api { code, message });
                }

                let resp = serde_json::from_str::<TResp>(&text).map_err(AppError::from)?;
                return Ok(resp);
            }
        }

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

        #[cfg(target_os = "android")]
        {
            let is_external = url.starts_with("http") && !url.contains("grindr.mobi");
            if !is_external {
                let make_headers = |auth: Option<&str>| {
                    let user_agent = build_user_agent(&device, "Free");
                    let mut h = build_headers(&device, &user_agent, auth);
                    if path == "/v3/bootstrap" {
                        h.remove("accept");
                    }
                    h
                };

                let headers = make_headers(auth_token.as_deref());
                let mut raw = android_okhttp_execute(
                    method.as_str(),
                    &url,
                    &headers,
                    body.clone(),
                    content_type,
                )?;

                if raw.status == 401 && !is_auth_path {
                    let _lock = self.refresh_lock.lock().await;

                    let current_token = self.authorization_header().await;
                    if current_token == auth_token {
                        let _ = Box::pin(self.refresh_token()).await;
                    }

                    let new_auth_token = self.authorization_header().await;
                    let headers = make_headers(new_auth_token.as_deref());
                    raw = android_okhttp_execute(
                        method.as_str(),
                        &url,
                        &headers,
                        body.clone(),
                        content_type,
                    )?;
                }

                return Ok(raw);
            }
        }

        let make_request = |auth_token: Option<String>, device: &super::headers::DeviceInfo| {
            let is_external = url.starts_with("http") && !url.contains("grindr.mobi");
            let headers = if is_external {
                let mut h = reqwest::header::HeaderMap::new();
                h.insert("User-Agent", reqwest::header::HeaderValue::from_static("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"));
                h
            } else {
                let user_agent = build_user_agent(device, "Free");
                let mut h = build_headers(device, &user_agent, auth_token.as_deref());
                if path == "/v3/bootstrap" {
                    h.remove("accept");
                }
                h
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
                let user_agent = build_user_agent(device, "Free");
                let mut h = build_headers(device, &user_agent, auth_token.as_deref());
                if path == "/v3/bootstrap" {
                    h.remove("accept");
                }
                h
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
