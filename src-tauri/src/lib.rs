mod api;
mod error;
mod state;
mod storage;

use std::sync::Arc;

use crate::state::AppState;
use api::client::GrindrClient;
use api::websocket::WsState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Install the ring crypto provider for rustls (required on Windows where
    // tokio-tungstenite uses rustls for WebSocket TLS).
    #[cfg(target_os = "windows")]
    {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }

    storage::init_keyring();

    let client = GrindrClient::new().ok();
    let context = tauri::generate_context!();
    let (hotswap, context) =
        tauri_plugin_hotswap::init(context).expect("failed to initialize hotswap plugin");

    tauri::Builder::default()
        .plugin(hotswap)
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_geolocation::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState { client })
        .manage(Arc::new(WsState::new()))
        .invoke_handler(tauri::generate_handler![
            api::auth::login,
            api::auth::login_with_jwt,
            api::auth::refresh_token,
            api::auth::logout,
            api::auth::auth_state,
            api::auth::websocket_token,
            api::rest::request,
            api::websocket::ws_connect,
            api::websocket::ws_send,
            api::websocket::ws_disconnect,
            api::websocket::ws_status,
        ])
        .run(context)
        .expect("error while running tauri application");
}
