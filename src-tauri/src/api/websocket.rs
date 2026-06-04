//! Tauri-side WebSocket transport for the Grindr realtime API.
//!
//! Browser `WebSocket` cannot set the `Authorization` / `User-Agent` headers
//! that the Grindr docs require ("Only Authorization and User-Agent are
//! required in the connection request"). We therefore open the WS from Rust
//! using `tokio-tungstenite`, then bridge frames to the webview via Tauri
//! events. The frontend exposes a `WebSocket`-shaped wrapper around these
//! commands so the existing `ChatRealtimeManager` keeps working unchanged.
//!
//! Heavy logging is intentional — every step prints with the `[HTTP-WS]` prefix
//! so the dev console makes it obvious what is going on.

use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use http::Request;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};
use tokio::task::JoinHandle;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

use crate::error::AppError;
use crate::state::AppState;

/// Event channel listened to by the frontend bridge.
const WS_EVENT: &str = "grindr-ws://event";

/// Payload emitted to the webview for every websocket lifecycle event.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WsEvent {
    Open,
    Message { data: String },
    Binary { len: usize, data_b64: String },
    Ping,
    Pong,
    Close { code: u16, reason: String },
    Error { message: String },
}

#[derive(Default)]
pub struct WsState {
    inner: Mutex<Option<ActiveConnection>>,
}

struct ActiveConnection {
    sender: mpsc::UnboundedSender<Message>,
    pump: JoinHandle<()>,
}

impl WsState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    async fn shutdown(&self) {
        let mut guard = self.inner.lock().await;
        if let Some(conn) = guard.take() {
            #[cfg(debug_assertions)]
            eprintln!("[HTTP-WS] shutdown: dropping existing connection");
            // Dropping the sender ends the writer task; the pump will send Close frame and exit.
            drop(conn.sender);

            // Give the old connection a moment to close gracefully on the server.
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;

            // Abort as a fallback only if it's still hanging.
            conn.pump.abort();
        }
    }
}

fn emit(app: &AppHandle, event: WsEvent) {
    if let Err(_error) = app.emit(WS_EVENT, &event) {
        #[cfg(debug_assertions)]
        eprintln!("[HTTP-WS] failed to emit event: {_error}");
    }
}

#[tauri::command]
pub async fn ws_connect(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    ws_state: tauri::State<'_, Arc<WsState>>,
    url: String,
) -> Result<(), AppError> {
    #[cfg(debug_assertions)]
    eprintln!("[HTTP-WS] ws_connect requested for {url}");

    // Tear down anything that was already running.
    ws_state.shutdown().await;

    let client = state.client()?;

    // Ensure we have a fresh token before connecting
    let _ = client.ensure_valid_session().await;

    let session_id = {
        let guard = client.session.read().await;
        guard.as_ref().map(|s| s.session_id.clone())
    }
    .ok_or_else(|| AppError::Auth("No active session for websocket".to_owned()))?;

    // According to documentation, only User-Agent and Authorization are required.
    let authorization = format!("Grindr3 {}", session_id);
    let user_agent = client.user_agent().to_owned();
    let cookies = client.cookie_header_for_base_url();

    // Ensure the URL uses the current fresh token, replacing any stale token from the frontend.
    // This ensures that if REST just refreshed the token, the WS connection uses it immediately.
    let final_url = match url::Url::parse(&url) {
        Ok(mut parsed_url) => {
            let params: Vec<(String, String)> = parsed_url.query_pairs().into_owned().collect();
            let mut query = parsed_url.query_pairs_mut();
            query.clear();
            let mut token_seen = false;
            for (k, v) in params {
                if k == "token" {
                    query.append_pair("token", &session_id);
                    token_seen = true;
                } else {
                    query.append_pair(&k, &v);
                }
            }
            if !token_seen {
                query.append_pair("token", &session_id);
            }
            drop(query);
            parsed_url.to_string()
        }
        Err(_) => url.clone(),
    };

    #[cfg(debug_assertions)]
    {
        eprintln!("[HTTP-WS] connecting to: {}", final_url);
        if let Some(ref c) = cookies {
            eprintln!("[HTTP-WS] cookies: {}", c);
        } else {
            eprintln!("[HTTP-WS] no cookies found in store");
        }
    }

    let mut req_builder = Request::builder()
        .method("GET")
        .uri(&final_url)
        .header("User-Agent", &user_agent)
        .header("Authorization", &authorization)
        .header(
            "Host",
            host_from_url(&final_url).unwrap_or_else(|| "grindr.mobi".into()),
        )
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header(
            "Sec-WebSocket-Key",
            tokio_tungstenite::tungstenite::handshake::client::generate_key(),
        );

    if let Some(cookie_str) = cookies {
        req_builder = req_builder.header("Cookie", cookie_str);
    }

    // if let Some(cookie_str) = cookies {
    //     req_builder = req_builder.header("Cookie", cookie_str);
    // }

    let request = req_builder
        .body(())
        .map_err(|e| AppError::Http(format!("ws request build: {e}")))?;

    let (ws_stream, _response) = match connect_async(request).await {
        Ok(pair) => pair,
        Err(error) => {
            #[cfg(debug_assertions)]
            eprintln!("[HTTP-WS] connect_async failed: {error}");
            emit(
                &app,
                WsEvent::Error {
                    message: error.to_string(),
                },
            );
            return Err(AppError::Http(format!("ws connect: {error}")));
        }
    };

    #[cfg(debug_assertions)]
    eprintln!(
        "[HTTP-WS] handshake ok, status={} headers={}",
        _response.status(),
        _response.headers().len()
    );

    emit(&app, WsEvent::Open);

    let (mut writer, mut reader) = ws_stream.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    let app_for_pump = app.clone();
    let ws_state_for_pump: Arc<WsState> = ws_state.inner().clone();

    let pump = tokio::spawn(async move {
        loop {
            tokio::select! {
                        outgoing = rx.recv() => {
                            let Some(msg) = outgoing else {
                                #[cfg(debug_assertions)]
            eprintln!("[HTTP-WS] writer channel closed, sending Close frame");
                                let _ = writer.send(Message::Close(None)).await;
                                let _ = writer.close().await;
                                break;
                            };
                            let _kind_label = describe(&msg);
                            if let Err(error) = writer.send(msg).await {
                                #[cfg(debug_assertions)]
            eprintln!("[HTTP-WS] write error ({_kind_label}): {error}");
                                emit(&app_for_pump, WsEvent::Error { message: error.to_string() });
                                break;
                            }
                            #[cfg(debug_assertions)]
            eprintln!("[HTTP-WS] -> sent {_kind_label}");
                        }
                        incoming = reader.next() => {
                            match incoming {
                                None => {
                                    #[cfg(debug_assertions)]
            eprintln!("[HTTP-WS] stream ended");
                                    emit(&app_for_pump, WsEvent::Close { code: 1006, reason: "stream-ended".into() });
                                    break;
                                }
                                Some(Err(error)) => {
                                    #[cfg(debug_assertions)]
            eprintln!("[HTTP-WS] read error: {error}");
                                    emit(&app_for_pump, WsEvent::Error { message: error.to_string() });
                                    break;
                                }
                                Some(Ok(Message::Text(text))) => {
                                    #[cfg(debug_assertions)]
            eprintln!("[HTTP-WS] <- text {} bytes", text.len());
                                    emit(&app_for_pump, WsEvent::Message { data: text });
                                }
                                Some(Ok(Message::Binary(bytes))) => {
                                    #[cfg(debug_assertions)]
            eprintln!("[HTTP-WS] <- binary {} bytes", bytes.len());
                                    let len = bytes.len();
                                    // Base64 encode without an external crate.
                                    let data_b64 = base64_encode(&bytes);
                                    emit(&app_for_pump, WsEvent::Binary { len, data_b64 });
                                }
                                Some(Ok(Message::Ping(_payload))) => {
                                    #[cfg(debug_assertions)]
                                    eprintln!("[HTTP-WS] <- ping {} bytes (auto-pong)", _payload.len());
                                    emit(&app_for_pump, WsEvent::Ping);
                                }
                                Some(Ok(Message::Pong(_payload))) => {
                                    #[cfg(debug_assertions)]
                                    eprintln!("[HTTP-WS] <- pong {} bytes", _payload.len());
                                    emit(&app_for_pump, WsEvent::Pong);
                                }
                                Some(Ok(Message::Close(frame))) => {
                                    let (code, reason) = frame
                                        .map(|f| (u16::from(f.code), f.reason.to_string()))
                                        .unwrap_or((1000, String::new()));
                                    #[cfg(debug_assertions)]
            eprintln!("[HTTP-WS] <- close code={code} reason={reason:?}");
                                    emit(&app_for_pump, WsEvent::Close { code, reason });
                                    break;
                                }
                                Some(Ok(Message::Frame(_))) => {
                                    // Raw frames not used in client mode.
                                }
                            }
                        }
                    }
        }

        // Drop self from state so future connects start clean.
        let mut guard = ws_state_for_pump.inner.lock().await;
        if guard.is_some() {
            *guard = None;
            #[cfg(debug_assertions)]
            eprintln!("[HTTP-WS] pump exit, cleared connection slot");
        }
    });

    *ws_state.inner.lock().await = Some(ActiveConnection { sender: tx, pump });

    Ok(())
}

#[tauri::command]
pub async fn ws_send(
    ws_state: tauri::State<'_, Arc<WsState>>,
    payload: String,
) -> Result<(), AppError> {
    let _preview_len = payload.len().min(120);
    #[cfg(debug_assertions)]
    eprintln!(
        "[HTTP-WS] ws_send {} bytes preview={:?}",
        payload.len(),
        &payload[.._preview_len]
    );

    let guard = ws_state.inner.lock().await;
    let Some(conn) = guard.as_ref() else {
        return Err(AppError::Http("websocket not connected".to_owned()));
    };

    conn.sender
        .send(Message::Text(payload))
        .map_err(|e| AppError::Http(format!("ws send: {e}")))
}

#[tauri::command]
pub async fn ws_disconnect(ws_state: tauri::State<'_, Arc<WsState>>) -> Result<(), AppError> {
    #[cfg(debug_assertions)]
    eprintln!("[HTTP-WS] ws_disconnect requested");
    ws_state.shutdown().await;
    Ok(())
}

#[tauri::command]
pub async fn ws_status(ws_state: tauri::State<'_, Arc<WsState>>) -> Result<bool, AppError> {
    Ok(ws_state.inner.lock().await.is_some())
}

fn describe(msg: &Message) -> &'static str {
    match msg {
        Message::Text(_) => "text",
        Message::Binary(_) => "binary",
        Message::Ping(_) => "ping",
        Message::Pong(_) => "pong",
        Message::Close(_) => "close",
        Message::Frame(_) => "frame",
    }
}

fn host_from_url(url: &str) -> Option<String> {
    let without_scheme = url.split("://").nth(1)?;
    let host = without_scheme.split('/').next()?;
    Some(host.split('?').next()?.to_owned())
}

/// Minimal base64 encoder so we don't have to add another dependency.
fn base64_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    let mut chunks = bytes.chunks_exact(3);
    for chunk in &mut chunks {
        let b = ((chunk[0] as u32) << 16) | ((chunk[1] as u32) << 8) | (chunk[2] as u32);
        out.push(ALPHABET[((b >> 18) & 0x3f) as usize] as char);
        out.push(ALPHABET[((b >> 12) & 0x3f) as usize] as char);
        out.push(ALPHABET[((b >> 6) & 0x3f) as usize] as char);
        out.push(ALPHABET[(b & 0x3f) as usize] as char);
    }
    let rem = chunks.remainder();
    match rem.len() {
        1 => {
            let b = (rem[0] as u32) << 16;
            out.push(ALPHABET[((b >> 18) & 0x3f) as usize] as char);
            out.push(ALPHABET[((b >> 12) & 0x3f) as usize] as char);
            out.push('=');
            out.push('=');
        }
        2 => {
            let b = ((rem[0] as u32) << 16) | ((rem[1] as u32) << 8);
            out.push(ALPHABET[((b >> 18) & 0x3f) as usize] as char);
            out.push(ALPHABET[((b >> 12) & 0x3f) as usize] as char);
            out.push(ALPHABET[((b >> 6) & 0x3f) as usize] as char);
            out.push('=');
        }
        _ => {}
    }
    out
}
