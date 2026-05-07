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

    // Safe initialization of keyring - non-fatal on iOS where it may fail
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        storage::init_keyring();
    })) {
        Ok(()) => {},
        Err(e) => {
            eprintln!("Warning: keyring initialization panicked (continuing): {:?}", e);
        }
    }

    let client = GrindrClient::new().ok();
    
    // Platform-specific setup for plugins
    #[cfg(not(mobile))]
    {
        let context = tauri::generate_context!();
        let (hotswap, context) = match tauri_plugin_hotswap::init(context) {
            Ok((h, c)) => (h, c),
            Err(e) => {
                panic!("failed to initialize hotswap plugin: {}", e);
            }
        };

        tauri::Builder::default()
            .plugin(hotswap)
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_os::init())
            .plugin(tauri_plugin_geolocation::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_sql::Builder::default().build())
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
                api::auth::sync_push_token,
                api::rest::request,
                api::websocket::ws_connect,
                api::websocket::ws_send,
                api::websocket::ws_disconnect,
                api::websocket::ws_status,
            ])
            .run(context)
            .expect("error while running tauri application");
    }

    #[cfg(mobile)]
    {
        let context = tauri::generate_context!();
        tauri::Builder::default()
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_os::init())
            .plugin(tauri_plugin_geolocation::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_sql::Builder::default().build())
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
                api::auth::sync_push_token,
                api::rest::request,
                api::websocket::ws_connect,
                api::websocket::ws_send,
                api::websocket::ws_disconnect,
                api::websocket::ws_status,
            ])
            .run(context)
            .expect("error while running tauri application");
    }
}
