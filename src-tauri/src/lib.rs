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
    // Install the ring crypto provider for rustls (required for
    // tokio-tungstenite when using rustls TLS backend).
    let _ = rustls::crypto::ring::default_provider().install_default();

    // Keyring initialization should not block app startup.
    // Some environments (including certain Intel macOS setups) can fail keychain init.
    if let Err(e) = storage::init_keyring() {
        eprintln!(
            "Warning: keyring initialization failed (continuing without persisted sessions): {:?}",
            e
        );
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
            .setup(|app| {
                #[cfg(target_os = "linux")]
                {
                    use tauri::Manager;
                    use webkit2gtk::{PermissionRequestExt, WebViewExt};
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.with_webview(|webview| {
                            webview.inner().connect_permission_request(|_view, request| {
                                request.allow();
                                true
                            });
                        });
                    }
                }
                Ok(())
            })
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
        let (hotswap, context) = match tauri_plugin_hotswap::init(context) {
            Ok((h, c)) => (h, c),
            Err(e) => {
                panic!("failed to initialize hotswap plugin: {}", e);
            }
        };

        let builder = tauri::Builder::default()
            .plugin(hotswap)
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_os::init())
            .plugin(tauri_plugin_geolocation::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_http::init())
            .plugin(tauri_plugin_sql::Builder::default().build())
            .plugin(tauri_plugin_opener::init());

        #[cfg(target_os = "ios")]
        let builder = builder.plugin(tauri_plugin_ios_photos::init());

        builder
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
